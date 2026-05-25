#!/usr/bin/env node
/**
 * 本地印表橋接器 (Print Bridge)
 *
 * 在本機執行，定時輪詢雲端伺服器的待印訂單，
 * 格式化成出單內容後送到 USB/網路熱感應印表機。
 *
 * 使用方式：
 *   1. 複製 print-bridge.config.example.json 為 print-bridge.config.json
 *   2. 編輯設定：伺服器URL、帳號、API Key、印表機名稱
 *   3. 執行：node print-bridge.js
 *
 * 環境變數（優先於 config 檔）：
 *   POS_SERVER     - 伺服器 URL（例如 https://restaurant-pos-qnnp.onrender.com）
 *   TENANT_USER    - 餐車帳號
 *   PRINTER_KEY    - 印表機 API Key
 *   PRINTER_NAME   - Windows 印表機名稱
 *   POLL_INTERVAL  - 輪詢間隔（毫秒，預設 5000）
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 讀取設定 ──────────────────────────────────────────────
function loadConfig() {
  const cfgPath = path.join(__dirname, 'print-bridge.config.json');

  let fileCfg = {};
  if (fs.existsSync(cfgPath)) {
    try { fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
    catch (e) { console.error('⚠️  設定檔格式錯誤:', e.message); }
  }

  return {
    server:   process.env.POS_SERVER    || fileCfg.server    || 'https://restaurant-pos-qnnp.onrender.com',
    tenant:   process.env.TENANT_USER   || fileCfg.tenant    || '',
    key:      process.env.PRINTER_KEY   || fileCfg.key       || '',
    printer:  process.env.PRINTER_NAME  || fileCfg.printer   || '',
    interval: parseInt(process.env.POLL_INTERVAL || fileCfg.interval || '5000'),
  };
}

// ── HTTP GET / PUT ────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON: ' + data)); }
      });
    }).on('error', reject);
  });
}

function httpPut(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const req = mod.request(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── 格式化出單內容 ─────────────────────────────────────────
function formatReceipt(job) {
  const data = JSON.parse(job.data);
  const w = 32; // 每行寬度（半形字元）

  const lines = [];
  function line(text) { lines.push(text); }
  function divider(char = '-') { line(char.repeat(w)); }

  divider('=');
  line(padCenter(data.store_name || 'POS 出單', w));
  divider('=');
  line(`訂單編號: ${data.order_number}`);
  line(`時間: ${data.created_at}`);
  if (data.table_number) line(`桌號: ${data.table_number}`);
  divider();

  // 品項
  for (const item of data.items || []) {
    const qty = `x${item.quantity}`;
    const name = item.item_name;
    const available = w - qty.length - 2;
    if (name.length > available) {
      line(name);
      line(`${' '.repeat(w - qty.length)}${qty}`);
    } else {
      line(`${name}${' '.repeat(w - name.length - qty.length)}${qty}`);
    }
    if (item.size_name) line(`  (${item.size_name})`);
    if (item.toppings && item.toppings.length > 0) {
      for (const t of item.toppings) line(`  + ${t.name}`);
    }
  }

  divider();
  const totalStr = `$ ${data.total_price}`;
  line(`總計:${' '.repeat(w - 5 - totalStr.length)}${totalStr}`);
  if (data.note) {
    line(`備註: ${data.note}`);
  }
  divider('=');
  line('');
  line('');
  line('');
  line('');

  return lines.join('\n');
}

function padCenter(text, width) {
  const len = [...text].length;
  const pad = Math.max(0, Math.floor((width - len) / 2));
  return ' '.repeat(pad) + text;
}

// ── 列印 ───────────────────────────────────────────────────
function printToUSB(job) {
  const cfg = loadConfig();
  if (!cfg.printer) {
    console.error('❌ 未設定印表機名稱（PRINTER_NAME / printer）');
    return false;
  }

  const text = formatReceipt(job);
  const tmpFile = path.join(os.tmpdir(), `pos-${job.id}-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, text, 'utf8');

  try {
    // Windows: 使用 PowerShell Out-Printer 送出
    const psCmd = `Get-Content -Path '${tmpFile.replace(/'/g, "''")}' -Encoding UTF8 | Out-Printer -Name '${cfg.printer.replace(/'/g, "''")}'`;
    execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, {
      timeout: 15000,
      encoding: 'utf8'
    });
    console.log(`🖨️  已列印 #${job.id} → ${cfg.printer}`);
    try { fs.unlinkSync(tmpFile); } catch {}
    return true;
  } catch (e) {
    console.error(`❌ 列印失敗 #${job.id}:`, e.stderr || e.message);
    try { fs.unlinkSync(tmpFile); } catch {}
    return false;
  }
}

// ── 主迴圈 ─────────────────────────────────────────────────
async function poll() {
  const cfg = loadConfig();

  if (!cfg.tenant || !cfg.key) {
    console.error('❌ 請先設定 TENANT_USER / PRINTER_KEY（或建立 print-bridge.config.json）');
    console.error('   在管理後台 → 設定 → 印表機設定 可以找到 API Key');
    process.exit(1);
  }

  if (!cfg.printer) {
    console.warn('⚠️  未設定 PRINTER_NAME，只會顯示待印內容，不會實際列印');
  }

  const queueUrl = `${cfg.server}/api/printer/queue?t=${encodeURIComponent(cfg.tenant)}&key=${encodeURIComponent(cfg.key)}`;

  console.log(`🔌 印表橋接器已啟動`);
  console.log(`   伺服器: ${cfg.server}`);
  console.log(`   帳號: ${cfg.tenant}`);
  console.log(`   印表機: ${cfg.printer || '(未設定)'}`);
  console.log(`   輪詢間隔: ${cfg.interval / 1000}s`);
  console.log('');

  while (true) {
    try {
      const jobs = await httpGet(queueUrl);

      if (Array.isArray(jobs) && jobs.length > 0) {
        console.log(`📋 發現 ${jobs.length} 筆待印訂單`);
        for (const job of jobs) {
          const ok = cfg.printer ? printToUSB(job) : false;
          if (!cfg.printer) {
            // 無印表機時，顯示內容到 console
            console.log('─'.repeat(40));
            console.log(formatReceipt(job));
            console.log('─'.repeat(40));
          }
          // 標記狀態
          const updateUrl = `${cfg.server}/api/printer/queue/${job.id}?t=${encodeURIComponent(cfg.tenant)}&key=${encodeURIComponent(cfg.key)}`;
          await httpPut(updateUrl, { status: ok ? 'printed' : 'failed' });
        }
        console.log('');
      }
    } catch (e) {
      // 伺服器休眠或網路問題，靜默等待
      if (e.code !== 'ECONNRESET' && e.code !== 'ETIMEDOUT') {
        console.error(`⚠️  輪詢錯誤: ${e.message}`);
      }
    }

    await new Promise(r => setTimeout(r, cfg.interval));
  }
}

// ── 啟動 ───────────────────────────────────────────────────
poll().catch(e => {
  console.error('❌ 致命錯誤:', e.message);
  process.exit(1);
});

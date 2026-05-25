const router = require('express').Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

router.use(requireAuth);

// GET /api/settings — all settings as key-value object
router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').all(req.session.tenantId);
  const result = {};
  for (const row of rows) result[row.key] = row.value;
  res.json(result);
});

// PUT /api/settings — update settings {key: value, ...}
router.put('/settings', (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'request body must be an object with key-value pairs' });
  }

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(tid, key, String(value));
    }
  });
  tx();

  const rows = db.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').all(tid);
  const result = {};
  for (const row of rows) result[row.key] = row.value;
  res.json(result);
});

// GET /api/settings/qrcode — generate QR code data URL
router.get('/settings/qrcode', async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const db = getDb();
    const storeUrl = db.prepare("SELECT value FROM settings WHERE key = 'store_url' AND tenant_id = ?").get(req.session.tenantId);
    const base = storeUrl ? storeUrl.value : 'http://192.168.31.12:3000';
    const url = base + '/order.html';
    const dataUrl = await QRCode.toDataURL(url);
    res.json({ url, qrcode: dataUrl });
  } catch (err) {
    res.status(500).json({ error: 'QR code generation failed', message: err.message });
  }
});

module.exports = router;

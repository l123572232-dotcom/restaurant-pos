const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists (critical for Render ephemeral storage)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(express.json());
app.use(require('express-session')({
  secret: process.env.SESSION_SECRET || 'pos-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));
const serveStatic = require('serve-static');
app.use(serveStatic(path.join(__dirname, 'public')));

// Initialize DB and auto-seed if first run
const db = getDb();
const tenantCount = db.prepare('SELECT COUNT(*) as cnt FROM tenants').get().cnt;
if (tenantCount === 0) {
  console.log('First run — seeding default data...');
  // Insert admin tenant
  const crypto = require('crypto');
  const adminHash = crypto.createHash('sha256').update('admin123').digest('hex');
  db.prepare("INSERT INTO tenants (username, password_hash, store_name, status) VALUES (?, ?, ?, 'active')").run('admin', adminHash, '系统管理');
  console.log('Created admin tenant (admin/admin123)');

  // Generate default printer API key for admin
  const printerKey = crypto.randomBytes(16).toString('hex');
  db.prepare("INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'printer_api_key', ?)").run(printerKey);
  db.prepare("INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'printer_enabled', 'false')").run();
  db.prepare("INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'printer_name', '')").run();
}

app.use('/api/public', require('./routes/public'));
app.use('/api/printer', require('./routes/printer'));
app.use('/api', require('./routes/auth').router);
app.use('/api', require('./routes/tenants'));
app.use('/api', require('./routes/menu'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/settings'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`POS Server running at http://localhost:${PORT}`);
});

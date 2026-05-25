const router = require('express').Router();
const crypto = require('crypto');
const { getDb } = require('../db/database');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.tenantId) {
    return res.status(401).json({ error: 'not authenticated' });
  }
  next();
}

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const db = getDb();
  const hash = hashPassword(password);
  const tenant = db.prepare(
    "SELECT id, username, store_name, status FROM tenants WHERE username = ? AND password_hash = ?"
  ).get(username, hash);

  if (!tenant) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  if (tenant.status !== 'active') {
    return res.status(403).json({ error: 'account is disabled' });
  }

  req.session.tenantId = tenant.id;
  req.session.storeName = tenant.store_name;
  res.json({ success: true, tenant: { id: tenant.id, store_name: tenant.store_name } });
});

router.post('/auth/register', (req, res) => {
  const { username, password, store_name } = req.body;
  if (!username || !password || !store_name) {
    return res.status(400).json({ error: '請填寫所有欄位' });
  }
  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ error: '帳號長度需為 2-30 字元' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '密碼長度至少 4 字元' });
  }
  if (store_name.trim().length < 1 || store_name.length > 50) {
    return res.status(400).json({ error: '店名長度需為 1-50 字元' });
  }
  // reserve "admin" username
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: '此帳號為保留字，請換一個' });
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM tenants WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: '此帳號已被使用' });
  }

  const hash = hashPassword(password);
  const result = db.prepare(
    "INSERT INTO tenants (username, password_hash, store_name, status) VALUES (?, ?, ?, 'active')"
  ).run(username, hash, store_name.trim());

  // auto-login after registration
  req.session.tenantId = result.lastInsertRowid;
  req.session.storeName = store_name.trim();

  // Generate printer API key for new tenant
  const printerKey = crypto.randomBytes(16).toString('hex');
  db.prepare("INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (?, 'printer_api_key', ?)").run(result.lastInsertRowid, printerKey);
  db.prepare("INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (?, 'printer_enabled', 'false')").run(result.lastInsertRowid);
  db.prepare("INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (?, 'printer_name', '')").run(result.lastInsertRowid);

  res.json({ success: true, tenant: { id: result.lastInsertRowid, store_name: store_name.trim() } });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.tenantId) {
    return res.status(401).json({ error: 'not authenticated' });
  }

  const db = getDb();
  const tenant = db.prepare(
    "SELECT id, username, store_name, status FROM tenants WHERE id = ?"
  ).get(req.session.tenantId);

  if (!tenant) {
    return res.status(401).json({ error: 'not authenticated' });
  }

  res.json({ id: tenant.id, username: tenant.username, store_name: tenant.store_name, status: tenant.status, impersonating: !!req.session.originalTenantId });
});

// POST /api/auth/impersonate — admin (id=1) switches to another tenant
router.post('/auth/impersonate', (req, res) => {
  if (!req.session || req.session.tenantId !== 1) {
    return res.status(403).json({ error: 'only admin can impersonate' });
  }
  const { tenantId } = req.body;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' });
  }

  const db = getDb();
  const tenant = db.prepare("SELECT id, username, store_name, status FROM tenants WHERE id = ?").get(tenantId);
  if (!tenant) {
    return res.status(404).json({ error: 'tenant not found' });
  }
  if (tenant.status !== 'active') {
    return res.status(403).json({ error: 'tenant is disabled' });
  }

  req.session.originalTenantId = 1;
  req.session.tenantId = tenant.id;
  req.session.storeName = tenant.store_name;
  res.json({ success: true, tenant: { id: tenant.id, username: tenant.username, store_name: tenant.store_name } });
});

// POST /api/auth/restore — return to admin after impersonation
router.post('/auth/restore', (req, res) => {
  if (!req.session || !req.session.originalTenantId) {
    return res.status(400).json({ error: 'no impersonation to restore' });
  }
  const db = getDb();
  const admin = db.prepare("SELECT id, username, store_name FROM tenants WHERE id = ?").get(req.session.originalTenantId);
  if (!admin) {
    return res.status(404).json({ error: 'admin not found' });
  }

  req.session.tenantId = admin.id;
  req.session.storeName = admin.store_name;
  delete req.session.originalTenantId;
  res.json({ success: true, tenant: { id: admin.id, username: admin.username, store_name: admin.store_name } });
});

module.exports = { router, requireAuth };

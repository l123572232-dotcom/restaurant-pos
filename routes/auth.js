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

  res.json({ id: tenant.id, username: tenant.username, store_name: tenant.store_name, status: tenant.status });
});

module.exports = { router, requireAuth };

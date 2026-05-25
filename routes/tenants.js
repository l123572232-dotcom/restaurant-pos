const router = require('express').Router();
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

router.get('/tenants', requireAuth, (req, res) => {
  const db = getDb();
  const tenants = db.prepare("SELECT id, username, store_name, status, created_at FROM tenants ORDER BY id").all();
  res.json(tenants);
});

router.post('/tenants', requireAuth, (req, res) => {
  const db = getDb();
  const { username, password, store_name } = req.body;
  if (!username || !password || !store_name) {
    return res.status(400).json({ error: 'username, password, and store_name are required' });
  }

  const hash = hashPassword(password);
  const r = db.prepare(
    'INSERT INTO tenants (username, password_hash, store_name) VALUES (?, ?, ?)'
  ).run(username, hash, store_name);

  const tenant = db.prepare('SELECT id, username, store_name, status, created_at FROM tenants WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json(tenant);
});

router.put('/tenants/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { status } = req.body;
  if (!status || !['active', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'status must be active or disabled' });
  }

  const r = db.prepare('UPDATE tenants SET status = ? WHERE id = ?').run(status, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'tenant not found' });

  const tenant = db.prepare('SELECT id, username, store_name, status, created_at FROM tenants WHERE id = ?').get(req.params.id);
  res.json(tenant);
});

router.delete('/tenants/:id', requireAuth, (req, res) => {
  const db = getDb();
  const r = db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'tenant not found' });
  res.json({ success: true });
});

module.exports = router;

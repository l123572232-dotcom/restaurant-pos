const router = require('express').Router();
const { getDb } = require('../db/database');

// GET /api/printer/queue — fetch pending print jobs for a tenant
// Access via ?t=username&key=api_key for local bridge
router.get('/queue', (req, res) => {
  const { t, key } = req.query;
  if (!t || !key) {
    return res.status(400).json({ error: 'Missing t (username) or key' });
  }

  const db = getDb();

  // Use store_url as simple API key
  const tenant = db.prepare(
    "SELECT id, username FROM tenants WHERE username = ? AND status = 'active'"
  ).get(t);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const apiKeyRow = db.prepare(
    "SELECT value FROM settings WHERE tenant_id = ? AND key = 'printer_api_key'"
  ).get(tenant.id);
  const apiKey = apiKeyRow ? apiKeyRow.value : '';
  if (!apiKey || apiKey !== key) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  const jobs = db.prepare(
    "SELECT id, order_id, data, status, created_at FROM printer_queue WHERE tenant_id = ? AND status = 'pending' ORDER BY id ASC"
  ).all(tenant.id);

  res.json(jobs);
});

// PUT /api/printer/queue/:id — mark job as printed or failed
router.put('/queue/:id', (req, res) => {
  const { t, key } = req.query;
  const { status } = req.body;

  if (!t || !key) return res.status(400).json({ error: 'Missing t or key' });
  if (!status || !['printed', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'status must be printed or failed' });
  }

  const db = getDb();
  const tenant = db.prepare(
    "SELECT id FROM tenants WHERE username = ? AND status = 'active'"
  ).get(t);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const apiKeyRow = db.prepare(
    "SELECT value FROM settings WHERE tenant_id = ? AND key = 'printer_api_key'"
  ).get(tenant.id);
  if (!apiKeyRow || apiKeyRow.value !== key) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  const r = db.prepare(
    "UPDATE printer_queue SET status = ? WHERE id = ? AND tenant_id = ?"
  ).run(status, req.params.id, tenant.id);

  if (r.changes === 0) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true });
});

module.exports = router;

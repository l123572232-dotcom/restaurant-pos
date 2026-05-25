const router = require('express').Router();
const { getDb } = require('../db/database');

// GET /api/settings — all settings as key-value object
router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) result[row.key] = row.value;
  res.json(result);
});

// PUT /api/settings — update settings {key: value, ...}
router.put('/settings', (req, res) => {
  const db = getDb();
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'request body must be an object with key-value pairs' });
  }

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, String(value));
    }
  });
  tx();

  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) result[row.key] = row.value;
  res.json(result);
});

// GET /api/settings/qrcode — generate QR code data URL
router.get('/settings/qrcode', async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const url = 'http://192.168.31.12:3000/order.html';
    const dataUrl = await QRCode.toDataURL(url);
    res.json({ url, qrcode: dataUrl });
  } catch (err) {
    res.status(500).json({ error: 'QR code generation failed', message: err.message });
  }
});

module.exports = router;

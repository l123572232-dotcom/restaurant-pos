const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/menu — 完整巢狀菜單
router.get('/menu', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  const items = db.prepare('SELECT * FROM items WHERE is_available = 1 ORDER BY sort_order, id').all();
  const sizes = db.prepare('SELECT * FROM item_sizes ORDER BY id').all();
  const toppings = db.prepare('SELECT * FROM item_toppings ORDER BY id').all();

  const sizesByItem = {};
  for (const s of sizes) {
    if (!sizesByItem[s.item_id]) sizesByItem[s.item_id] = [];
    sizesByItem[s.item_id].push(s);
  }

  const toppingsByItem = {};
  for (const t of toppings) {
    if (!toppingsByItem[t.item_id]) toppingsByItem[t.item_id] = [];
    toppingsByItem[t.item_id].push(t);
  }

  const result = categories.map(cat => {
    const catItems = items
      .filter(i => i.category_id === cat.id)
      .map(i => ({
        ...i,
        sizes: sizesByItem[i.id] || [],
        toppings: toppingsByItem[i.id] || []
      }));
    return { ...cat, items: catItems };
  });

  res.json(result);
});

// GET /api/categories
router.get('/categories', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all());
});

// POST /api/categories
router.post('/categories', (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const db = getDb();
  const r = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name, sort_order || 0);
  res.status(201).json({ id: Number(r.lastInsertRowid), name, sort_order: sort_order || 0 });
});

// PUT /api/categories/:id
router.put('/categories/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { name, sort_order } = req.body;
  db.prepare('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?')
    .run(name || row.name, sort_order !== undefined ? sort_order : row.sort_order, req.params.id);
  res.json({ id: row.id, name: name || row.name, sort_order: sort_order !== undefined ? sort_order : row.sort_order });
});

// DELETE /api/categories/:id（連同底下品項）
router.delete('/categories/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/items
router.post('/items', (req, res) => {
  const { category_id, name, base_price, is_available, emoji, sort_order } = req.body;
  if (!category_id || !name || base_price === undefined) {
    return res.status(400).json({ error: 'category_id, name, base_price required' });
  }
  const db = getDb();
  const r = db.prepare(
    'INSERT INTO items (category_id, name, base_price, is_available, emoji, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(category_id, name, base_price, is_available !== undefined ? is_available : 1, emoji || '', sort_order || 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// PUT /api/items/:id
router.put('/items/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { category_id, name, base_price, is_available, emoji, sort_order } = req.body;
  db.prepare(
    'UPDATE items SET category_id=?, name=?, base_price=?, is_available=?, emoji=?, sort_order=? WHERE id=?'
  ).run(
    category_id !== undefined ? category_id : row.category_id,
    name !== undefined ? name : row.name,
    base_price !== undefined ? base_price : row.base_price,
    is_available !== undefined ? is_available : row.is_available,
    emoji !== undefined ? emoji : row.emoji,
    sort_order !== undefined ? sort_order : row.sort_order,
    req.params.id
  );
  res.json({ success: true });
});

// DELETE /api/items/:id
router.delete('/items/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/items/:id/sizes
router.post('/items/:id/sizes', (req, res) => {
  const { name, price_adjust } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const db = getDb();
  const r = db.prepare('INSERT INTO item_sizes (item_id, name, price_adjust) VALUES (?, ?, ?)')
    .run(req.params.id, name, price_adjust || 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// POST /api/items/:id/toppings
router.post('/items/:id/toppings', (req, res) => {
  const { name, price_adjust } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const db = getDb();
  const r = db.prepare('INSERT INTO item_toppings (item_id, name, price_adjust) VALUES (?, ?, ?)')
    .run(req.params.id, name, price_adjust || 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

module.exports = router;

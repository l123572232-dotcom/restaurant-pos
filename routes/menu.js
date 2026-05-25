const router = require('express').Router();
const { getDb } = require('../db/database');

// GET /api/menu — nested JSON: categories with items (each with sizes[], toppings[])
router.get('/menu', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  const items = db.prepare('SELECT * FROM items ORDER BY sort_order, id').all();
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

  const result = categories.map(cat => ({
    ...cat,
    items: items
      .filter(i => i.category_id === cat.id)
      .map(i => ({
        ...i,
        sizes: sizesByItem[i.id] || [],
        toppings: toppingsByItem[i.id] || []
      }))
  }));

  res.json(result);
});

// GET /api/categories
router.get('/categories', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all());
});

// POST /api/categories
router.post('/categories', (req, res) => {
  const db = getDb();
  const { name, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const r = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name, sort_order);
  res.status(201).json({ id: Number(r.lastInsertRowid), name, sort_order });
});

// PUT /api/categories/:id
router.put('/categories/:id', (req, res) => {
  const db = getDb();
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const r = db.prepare('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?').run(name, sort_order ?? 0, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'category not found' });
  res.json({ id: Number(req.params.id), name, sort_order: sort_order ?? 0 });
});

// DELETE /api/categories/:id
router.delete('/categories/:id', (req, res) => {
  const db = getDb();
  const r = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'category not found' });
  res.json({ success: true });
});

// POST /api/items
router.post('/items', (req, res) => {
  const db = getDb();
  const { category_id, name, base_price, emoji = '' } = req.body;
  if (!name || category_id == null || base_price == null) {
    return res.status(400).json({ error: 'category_id, name, and base_price are required' });
  }

  const r = db.prepare('INSERT INTO items (category_id, name, base_price, emoji) VALUES (?, ?, ?, ?)').run(category_id, name, base_price, emoji);
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json(item);
});

// PUT /api/items/:id
router.put('/items/:id', (req, res) => {
  const db = getDb();
  const { category_id, name, base_price, emoji } = req.body;
  if (!name || category_id == null || base_price == null) {
    return res.status(400).json({ error: 'category_id, name, and base_price are required' });
  }

  const r = db.prepare('UPDATE items SET category_id = ?, name = ?, base_price = ?, emoji = ? WHERE id = ?').run(category_id, name, base_price, emoji ?? '', req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'item not found' });

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  res.json(item);
});

// DELETE /api/items/:id
router.delete('/items/:id', (req, res) => {
  const db = getDb();
  const r = db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'item not found' });
  res.json({ success: true });
});

// POST /api/items/:id/sizes
router.post('/items/:id/sizes', (req, res) => {
  const db = getDb();
  const { name, price_adjust = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'item not found' });

  const r = db.prepare('INSERT INTO item_sizes (item_id, name, price_adjust) VALUES (?, ?, ?)').run(req.params.id, name, price_adjust);
  const size = db.prepare('SELECT * FROM item_sizes WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json(size);
});

// DELETE /api/items/:id/sizes/:sizeId
router.delete('/items/:id/sizes/:sizeId', (req, res) => {
  const db = getDb();
  const r = db.prepare('DELETE FROM item_sizes WHERE id = ? AND item_id = ?').run(req.params.sizeId, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'size not found' });
  res.json({ success: true });
});

// POST /api/items/:id/toppings
router.post('/items/:id/toppings', (req, res) => {
  const db = getDb();
  const { name, price_adjust = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'item not found' });

  const r = db.prepare('INSERT INTO item_toppings (item_id, name, price_adjust) VALUES (?, ?, ?)').run(req.params.id, name, price_adjust);
  const topping = db.prepare('SELECT * FROM item_toppings WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json(topping);
});

// DELETE /api/items/:id/toppings/:toppingId
router.delete('/items/:id/toppings/:toppingId', (req, res) => {
  const db = getDb();
  const r = db.prepare('DELETE FROM item_toppings WHERE id = ? AND item_id = ?').run(req.params.toppingId, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'topping not found' });
  res.json({ success: true });
});

module.exports = router;

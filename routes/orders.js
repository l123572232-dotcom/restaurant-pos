const router = require('express').Router();
const { getDb } = require('../db/database');

function getFullOrder(orderId) {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  for (const item of items) {
    item.toppings = db.prepare(
      'SELECT topping_name AS name, price_adjust FROM order_item_toppings WHERE order_item_id = ?'
    ).all(item.id);
  }
  order.items = items;
  return order;
}

// GET /api/orders — list orders with optional ?status= and ?date=YYYY-MM-DD
router.get('/orders', (req, res) => {
  const db = getDb();
  const { status, date } = req.query;

  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (date) {
    conditions.push("date(created_at) = ?");
    params.push(date);
  }

  let sql = 'SELECT * FROM orders';
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';

  const orders = db.prepare(sql).all(...params);

  for (const order of orders) {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    for (const item of items) {
      item.toppings = db.prepare(
        'SELECT topping_name AS name, price_adjust FROM order_item_toppings WHERE order_item_id = ?'
      ).all(item.id);
    }
    order.items = items;
  }

  res.json(orders);
});

// POST /api/orders — create order
router.post('/orders', (req, res) => {
  const db = getDb();
  const { items, table_number = '', note = '' } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  // Generate order_number: YYYYMMDD-NNN (daily reset)
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;
  const today = `${y}-${m}-${d}`;

  const lastReset = db.prepare("SELECT value FROM settings WHERE key = 'last_reset_date'").get();
  if (lastReset.value !== today) {
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'current_order_number'").run();
    db.prepare("UPDATE settings SET value = ? WHERE key = 'last_reset_date'").run(today);
  }

  const counter = db.prepare("SELECT value FROM settings WHERE key = 'current_order_number'").get();
  const nextNum = parseInt(counter.value, 10) + 1;
  const orderNumber = `${dateStr}-${String(nextNum).padStart(3, '0')}`;

  // Calculate total_price
  let totalPrice = 0;
  for (const item of items) {
    const qty = item.quantity || 1;
    const toppingsTotal = (item.toppings || []).reduce((s, t) => s + (t.price_adjust || 0), 0);
    totalPrice += (item.base_price + (item.size_adjust || 0) + toppingsTotal) * qty;
  }

  const orderResult = db.prepare(
    'INSERT INTO orders (order_number, status, total_price, table_number, note) VALUES (?, ?, ?, ?, ?)'
  ).run(orderNumber, 'pending', totalPrice, table_number, note);

  const orderId = Number(orderResult.lastInsertRowid);

  // Look up item names from items table for denormalization
  const itemRows = db.prepare('SELECT id, name FROM items').all();
  const itemNames = {};
  for (const row of itemRows) itemNames[row.id] = row.name;

  for (const item of items) {
    const qty = item.quantity || 1;
    const toppingsTotal = (item.toppings || []).reduce((s, t) => s + (t.price_adjust || 0), 0);
    const subtotal = (item.base_price + (item.size_adjust || 0) + toppingsTotal) * qty;

    const itemName = itemNames[item.item_id] || item.item_name || '';

    const itemResult = db.prepare(
      `INSERT INTO order_items (order_id, item_id, item_name, size_name, base_price, size_adjust, quantity, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, item.item_id, itemName, item.size_name || '', item.base_price, item.size_adjust || 0, qty, subtotal);

    const orderItemId = Number(itemResult.lastInsertRowid);

    for (const topping of (item.toppings || [])) {
      db.prepare(
        'INSERT INTO order_item_toppings (order_item_id, topping_name, price_adjust) VALUES (?, ?, ?)'
      ).run(orderItemId, topping.name, topping.price_adjust || 0);
    }
  }

  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_order_number'").run(String(nextNum));

  const order = getFullOrder(orderId);
  res.status(201).json(order);
});

// GET /api/orders/:id — single order detail
router.get('/orders/:id', (req, res) => {
  const order = getFullOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'order not found' });
  res.json(order);
});

// PUT /api/orders/:id/status — update order status
router.put('/orders/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'done', 'cancelled'];

  if (!status || !valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  const r = db.prepare(
    "UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).run(status, req.params.id);

  if (r.changes === 0) return res.status(404).json({ error: 'order not found' });

  const completedAt = status === 'done' || status === 'cancelled'
    ? db.prepare("UPDATE orders SET completed_at = datetime('now', 'localtime') WHERE id = ?").run(req.params.id)
    : null;

  res.json(getFullOrder(req.params.id));
});

// PUT /api/orders/:id/call — increment calling number for kitchen display
router.put('/orders/:id/call', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'order not found' });

  const callingNum = db.prepare("SELECT value FROM settings WHERE key = 'current_calling_number'").get();
  const nextNum = parseInt(callingNum.value, 10) + 1;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_calling_number'").run(String(nextNum));

  res.json({ order_id: Number(req.params.id), calling_number: nextNum });
});

module.exports = router;

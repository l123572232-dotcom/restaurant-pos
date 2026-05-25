const router = require('express').Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

function getFullOrder(orderId, tenantId) {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(orderId, tenantId);
  if (!order) return null;

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND tenant_id = ?').all(orderId, tenantId);
  for (const item of items) {
    item.toppings = db.prepare(
      'SELECT topping_name AS name, price_adjust FROM order_item_toppings WHERE order_item_id = ? AND tenant_id = ?'
    ).all(item.id, tenantId);
  }
  order.items = items;
  return order;
}

// GET /api/orders — list orders with optional ?status= and ?date=YYYY-MM-DD
router.get('/orders', requireAuth, (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
  const { status, date } = req.query;

  const conditions = ['tenant_id = ?'];
  const params = [tid];

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
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND tenant_id = ?').all(order.id, tid);
    for (const item of items) {
      item.toppings = db.prepare(
        'SELECT topping_name AS name, price_adjust FROM order_item_toppings WHERE order_item_id = ? AND tenant_id = ?'
      ).all(item.id, tid);
    }
    order.items = items;
  }

  res.json(orders);
});

// POST /api/orders — create order
router.post('/orders', requireAuth, (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
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

  const lastReset = db.prepare("SELECT value FROM settings WHERE key = 'last_reset_date' AND tenant_id = ?").get(tid);
  if (lastReset.value !== today) {
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'current_order_number' AND tenant_id = ?").run(tid);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'last_reset_date' AND tenant_id = ?").run(today, tid);
  }

  const counter = db.prepare("SELECT value FROM settings WHERE key = 'current_order_number' AND tenant_id = ?").get(tid);
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
    'INSERT INTO orders (tenant_id, order_number, status, total_price, table_number, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(tid, orderNumber, 'pending', totalPrice, table_number, note);

  const orderId = Number(orderResult.lastInsertRowid);

  // Look up item names from items table for denormalization
  const itemRows = db.prepare('SELECT id, name FROM items WHERE tenant_id = ?').all(tid);
  const itemNames = {};
  for (const row of itemRows) itemNames[row.id] = row.name;

  for (const item of items) {
    const qty = item.quantity || 1;
    const toppingsTotal = (item.toppings || []).reduce((s, t) => s + (t.price_adjust || 0), 0);
    const subtotal = (item.base_price + (item.size_adjust || 0) + toppingsTotal) * qty;

    const itemName = itemNames[item.item_id] || item.item_name || '';

    const itemResult = db.prepare(
      `INSERT INTO order_items (tenant_id, order_id, item_id, item_name, size_name, base_price, size_adjust, quantity, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(tid, orderId, item.item_id, itemName, item.size_name || '', item.base_price, item.size_adjust || 0, qty, subtotal);

    const orderItemId = Number(itemResult.lastInsertRowid);

    for (const topping of (item.toppings || [])) {
      db.prepare(
        'INSERT INTO order_item_toppings (tenant_id, order_item_id, topping_name, price_adjust) VALUES (?, ?, ?, ?)'
      ).run(tid, orderItemId, topping.name, topping.price_adjust || 0);
    }
  }

  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_order_number' AND tenant_id = ?").run(String(nextNum), tid);

  const order = getFullOrder(orderId, tid);
  res.status(201).json(order);
});

// GET /api/orders/:id — single order detail
router.get('/orders/:id', requireAuth, (req, res) => {
  const order = getFullOrder(req.params.id, req.session.tenantId);
  if (!order) return res.status(404).json({ error: 'order not found' });
  res.json(order);
});

// PUT /api/orders/:id/status — update order status
router.put('/orders/:id/status', requireAuth, (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'done', 'cancelled'];

  if (!status || !valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  const r = db.prepare(
    "UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ? AND tenant_id = ?"
  ).run(status, req.params.id, tid);

  if (r.changes === 0) return res.status(404).json({ error: 'order not found' });

  if (status === 'done' || status === 'cancelled') {
    db.prepare("UPDATE orders SET completed_at = datetime('now', 'localtime') WHERE id = ? AND tenant_id = ?").run(req.params.id, tid);
  }

  res.json(getFullOrder(req.params.id, tid));
});

// PUT /api/orders/:id/call — increment calling number for kitchen display
router.put('/orders/:id/call', requireAuth, (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
  const order = db.prepare('SELECT id FROM orders WHERE id = ? AND tenant_id = ?').get(req.params.id, tid);
  if (!order) return res.status(404).json({ error: 'order not found' });

  const callingNum = db.prepare("SELECT value FROM settings WHERE key = 'current_calling_number' AND tenant_id = ?").get(tid);
  const nextNum = parseInt(callingNum.value, 10) + 1;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_calling_number' AND tenant_id = ?").run(String(nextNum), tid);

  res.json({ order_id: Number(req.params.id), calling_number: nextNum });
});

module.exports = router;

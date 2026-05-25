const router = require('express').Router();
const { getDb } = require('../db/database');

// Middleware: resolve tenant from ?t= query param
function resolveTenant(req, res, next) {
  const username = req.query.t;
  if (!username) {
    return res.status(400).json({ error: 'Missing store parameter (?t=username)' });
  }

  const db = getDb();
  const tenant = db.prepare(
    "SELECT id, store_name, status FROM tenants WHERE username = ?"
  ).get(username);

  if (!tenant) {
    return res.status(404).json({ error: 'Store not found' });
  }
  if (tenant.status !== 'active') {
    return res.status(403).json({ error: 'Store is currently unavailable' });
  }

  req.tenantId = tenant.id;
  req.storeName = tenant.store_name;
  next();
}

router.use(resolveTenant);

// GET /api/public/menu — nested JSON: categories with items
router.get('/menu', (req, res) => {
  const db = getDb();
  const tid = req.tenantId;
  const categories = db.prepare('SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort_order, id').all(tid);
  const items = db.prepare('SELECT * FROM items WHERE tenant_id = ? AND is_available = 1 ORDER BY sort_order, id').all(tid);
  const sizes = db.prepare('SELECT * FROM item_sizes WHERE tenant_id = ? ORDER BY id').all(tid);
  const toppings = db.prepare('SELECT * FROM item_toppings WHERE tenant_id = ? ORDER BY id').all(tid);

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

// GET /api/public/settings — store info
router.get('/settings', (req, res) => {
  const db = getDb();
  const tid = req.tenantId;
  const settings = db.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').all(tid);
  const result = { store_name: req.storeName };
  for (const s of settings) result[s.key] = s.value;
  res.json(result);
});

// POST /api/public/orders — guest order creation
router.post('/orders', (req, res) => {
  const db = getDb();
  const tid = req.tenantId;
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
  if (lastReset && lastReset.value !== today) {
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'current_order_number' AND tenant_id = ?").run(tid);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'last_reset_date' AND tenant_id = ?").run(today, tid);
  } else if (!lastReset) {
    db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'current_order_number', '0')").run(tid);
    db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'last_reset_date', ?)").run(tid, today);
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

  // Enqueue print job
  const itemRows = db.prepare('SELECT id, name FROM items WHERE tenant_id = ?').all(tid);
  const itemNames = {};
  for (const row of itemRows) itemNames[row.id] = row.name;
  const printData = JSON.stringify({
    order_number: orderNumber,
    total_price: totalPrice,
    table_number: table_number,
    note: note,
    created_at: now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    items: items.map(item => ({
      item_name: itemNames[item.item_id] || item.item_name || '',
      quantity: item.quantity || 1,
      size_name: item.size_name || '',
      toppings: (item.toppings || []).map(t => ({ name: t.name }))
    }))
  });
  db.prepare(
    "INSERT INTO printer_queue (tenant_id, order_id, data, status) VALUES (?, ?, ?, 'pending')"
  ).run(tid, orderId, printData);

  res.status(201).json({ order_number: orderNumber, status: 'pending' });
});

module.exports = router;

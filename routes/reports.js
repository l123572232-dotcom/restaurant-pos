const router = require('express').Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

router.use(requireAuth);

// GET /api/reports/daily?date=YYYY-MM-DD
router.get('/reports/daily', (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

  const orders = db.prepare(
    "SELECT COUNT(*) AS total_orders, COALESCE(SUM(total_price), 0) AS total_revenue FROM orders WHERE date(created_at) = ? AND status != 'cancelled' AND tenant_id = ?"
  ).get(date, tid);

  const itemBreakdown = db.prepare(`
    SELECT oi.item_name, oi.item_id, COUNT(*) AS count, SUM(oi.subtotal) AS revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE date(o.created_at) = ? AND o.status != 'cancelled' AND o.tenant_id = ?
    GROUP BY oi.item_id
    ORDER BY count DESC
  `).all(date, tid);

  res.json({
    date,
    total_orders: orders.total_orders,
    total_revenue: orders.total_revenue,
    average_order_value: orders.total_orders > 0
      ? Math.round(orders.total_revenue / orders.total_orders * 100) / 100
      : 0,
    item_breakdown: itemBreakdown
  });
});

// GET /api/reports/monthly?year=YYYY&month=MM
router.get('/reports/monthly', (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month query params required' });

  const m = String(month).padStart(2, '0');
  const period = `${year}-${m}`;

  const dailyTotals = db.prepare(`
    SELECT date(created_at) AS date, COUNT(*) AS orders, SUM(total_price) AS revenue
    FROM orders
    WHERE strftime('%Y-%m', created_at) = ? AND status != 'cancelled' AND tenant_id = ?
    GROUP BY date(created_at)
    ORDER BY date
  `).all(period, tid);

  const totals = db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS total_revenue, COUNT(*) AS total_orders
    FROM orders
    WHERE strftime('%Y-%m', created_at) = ? AND status != 'cancelled' AND tenant_id = ?
  `).get(period, tid);

  const topItems = db.prepare(`
    SELECT oi.item_name, oi.item_id, COUNT(*) AS count, SUM(oi.subtotal) AS revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE strftime('%Y-%m', o.created_at) = ? AND o.status != 'cancelled' AND o.tenant_id = ?
    GROUP BY oi.item_id
    ORDER BY count DESC
    LIMIT 10
  `).all(period, tid);

  res.json({
    year: Number(year),
    month: Number(month),
    total_orders: totals.total_orders,
    total_revenue: totals.total_revenue,
    daily_totals: dailyTotals,
    top_items: topItems
  });
});

// GET /api/reports/export?type=daily&date=YYYY-MM-DD
router.get('/reports/export', (req, res) => {
  const db = getDb();
  const tid = req.session.tenantId;
  const { type, date } = req.query;

  if (type !== 'daily' || !date) {
    return res.status(400).json({ error: 'type=daily and date=YYYY-MM-DD required' });
  }

  const rows = db.prepare(`
    SELECT o.order_number, o.status, o.total_price, o.table_number, o.note,
           oi.item_name, oi.size_name, oi.quantity, oi.subtotal,
           GROUP_CONCAT(oit.topping_name || '(+' || oit.price_adjust || ')', '; ') AS toppings,
           o.created_at
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN order_item_toppings oit ON oit.order_item_id = oi.id
    WHERE date(o.created_at) = ? AND o.tenant_id = ?
    ORDER BY o.created_at DESC, oi.id
  `).all(date, tid);

  const headers = ['order_number', 'status', 'total_price', 'table_number', 'note',
    'item_name', 'size_name', 'quantity', 'subtotal', 'toppings', 'created_at'];

  const csvRows = [headers.join(',')];
  for (const row of rows) {
    csvRows.push(headers.map(h => {
      const val = row[h] != null ? String(row[h]) : '';
      return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${date}.csv"`);
  res.send('﻿' + csvRows.join('\n'));
});

module.exports = router;

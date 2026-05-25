const { getDb } = require('./database');

const db = getDb();

const tenantId = parseInt(process.argv[2], 10) || 1;

// 清空該 tenant 舊資料
db.prepare('DELETE FROM order_item_toppings WHERE tenant_id = ?').run(tenantId);
db.prepare('DELETE FROM order_items WHERE tenant_id = ?').run(tenantId);
db.prepare('DELETE FROM orders WHERE tenant_id = ?').run(tenantId);
db.prepare('DELETE FROM item_toppings WHERE tenant_id = ?').run(tenantId);
db.prepare('DELETE FROM item_sizes WHERE tenant_id = ?').run(tenantId);
db.prepare('DELETE FROM items WHERE tenant_id = ?').run(tenantId);
db.prepare('DELETE FROM categories WHERE tenant_id = ?').run(tenantId);
db.prepare('DELETE FROM settings WHERE tenant_id = ?').run(tenantId);

// === categories ===
const insertCat = db.prepare('INSERT INTO categories (tenant_id, name, sort_order) VALUES (?, ?, ?)');
insertCat.run(tenantId, '主餐', 1);
insertCat.run(tenantId, '小食', 2);
insertCat.run(tenantId, '飲品', 3);

// === items ===
const insertItem = db.prepare(
  'INSERT INTO items (tenant_id, category_id, name, base_price, is_available, emoji) VALUES (?, ?, ?, ?, 1, ?)'
);

// 主餐 (category_id = 1)
insertItem.run(tenantId, 1, '排骨飯', 80, '🍖');
insertItem.run(tenantId, 1, '雞腿飯', 90, '🍗');
insertItem.run(tenantId, 1, '滷肉飯', 50, '🍛');

// 小食 (category_id = 2)
insertItem.run(tenantId, 2, '薯條', 30, '🍟');
insertItem.run(tenantId, 2, '雞塊', 40, '🍗');

// 飲品 (category_id = 3)
insertItem.run(tenantId, 3, '紅茶', 20, '🍵');
insertItem.run(tenantId, 3, '綠茶', 20, '🍵');

// === item_sizes（僅主餐有大小份，大份 +10 元）===
const insertSize = db.prepare('INSERT INTO item_sizes (tenant_id, item_id, name, price_adjust) VALUES (?, ?, ?, ?)');
// 主餐 item_id = 1, 2, 3
insertSize.run(tenantId, 1, '小份', 0);
insertSize.run(tenantId, 1, '大份', 10);
insertSize.run(tenantId, 2, '小份', 0);
insertSize.run(tenantId, 2, '大份', 10);
insertSize.run(tenantId, 3, '小份', 0);
insertSize.run(tenantId, 3, '大份', 10);

// === item_toppings（全部品項共用：加蛋 10 元、加辣 0 元）===
const insertTopping = db.prepare('INSERT INTO item_toppings (tenant_id, item_id, name, price_adjust) VALUES (?, ?, ?, ?)');
const allItemIds = [1, 2, 3, 4, 5, 6, 7];
for (const id of allItemIds) {
  insertTopping.run(tenantId, id, '加蛋', 10);
  insertTopping.run(tenantId, id, '加辣', 0);
}

// === settings ===
db.prepare('INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(tenantId, 'store_name', '測試便當店');
db.prepare('INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(tenantId, 'current_order_number', '1');
db.prepare('INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(tenantId, 'current_calling_number', '1');
db.prepare('INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(tenantId, 'last_reset_date', new Date().toISOString().split('T')[0]);

// === 驗證輸出 ===
console.log('categories:', db.prepare('SELECT * FROM categories WHERE tenant_id = ?').all(tenantId));
console.log('items:', db.prepare('SELECT id, category_id, name, base_price, emoji FROM items WHERE tenant_id = ?').all(tenantId));
console.log('item_sizes:', db.prepare('SELECT * FROM item_sizes WHERE tenant_id = ?').all(tenantId));
console.log('item_toppings:', db.prepare('SELECT item_id, name, price_adjust FROM item_toppings WHERE tenant_id = ?').all(tenantId));
console.log('settings:', db.prepare('SELECT * FROM settings WHERE tenant_id = ?').all(tenantId));

console.log(`\n✅ Seed data 寫入完成 (tenant_id=${tenantId})`);

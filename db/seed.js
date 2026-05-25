const { getDb } = require('./database');

const db = getDb();

// 清空舊資料（保持資料表結構）
db.exec('DELETE FROM order_item_toppings');
db.exec('DELETE FROM order_items');
db.exec('DELETE FROM orders');
db.exec('DELETE FROM item_toppings');
db.exec('DELETE FROM item_sizes');
db.exec('DELETE FROM items');
db.exec('DELETE FROM categories');
db.exec('DELETE FROM settings');

// === categories ===
const insertCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
insertCat.run('主餐', 1);
insertCat.run('小食', 2);
insertCat.run('飲品', 3);

// === items ===
const insertItem = db.prepare(
  'INSERT INTO items (category_id, name, base_price, is_available, emoji) VALUES (?, ?, ?, 1, ?)'
);

// 主餐 (category_id = 1)
insertItem.run(1, '排骨飯', 80, '🍖');
insertItem.run(1, '雞腿飯', 90, '🍗');
insertItem.run(1, '滷肉飯', 50, '🍛');

// 小食 (category_id = 2)
insertItem.run(2, '薯條', 30, '🍟');
insertItem.run(2, '雞塊', 40, '🍗');

// 飲品 (category_id = 3)
insertItem.run(3, '紅茶', 20, '🍵');
insertItem.run(3, '綠茶', 20, '🍵');

// === item_sizes（僅主餐有大小份，大份 +10 元）===
const insertSize = db.prepare('INSERT INTO item_sizes (item_id, name, price_adjust) VALUES (?, ?, ?)');
// 主餐 item_id = 1, 2, 3
insertSize.run(1, '小份', 0);
insertSize.run(1, '大份', 10);
insertSize.run(2, '小份', 0);
insertSize.run(2, '大份', 10);
insertSize.run(3, '小份', 0);
insertSize.run(3, '大份', 10);

// === item_toppings（全部品項共用：加蛋 10 元、加辣 0 元）===
const insertTopping = db.prepare('INSERT INTO item_toppings (item_id, name, price_adjust) VALUES (?, ?, ?)');
const allItemIds = [1, 2, 3, 4, 5, 6, 7];
for (const id of allItemIds) {
  insertTopping.run(id, '加蛋', 10);
  insertTopping.run(id, '加辣', 0);
}

// === settings ===
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('store_name', '測試便當店');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_order_number', '1');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_calling_number', '1');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('last_reset_date', new Date().toISOString().split('T')[0]);

// === 驗證輸出 ===
console.log('categories:', db.prepare('SELECT * FROM categories').all());
console.log('items:', db.prepare('SELECT id, category_id, name, base_price, emoji FROM items').all());
console.log('item_sizes:', db.prepare('SELECT * FROM item_sizes').all());
console.log('item_toppings:', db.prepare('SELECT item_id, name, price_adjust FROM item_toppings').all());
console.log('settings:', db.prepare('SELECT * FROM settings').all());

console.log('\n✅ Seed data 寫入完成');

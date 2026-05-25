CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  store_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  base_price INTEGER NOT NULL,
  is_available INTEGER DEFAULT 1,
  emoji TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS item_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price_adjust INTEGER DEFAULT 0,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS item_toppings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price_adjust INTEGER DEFAULT 0,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_price REAL NOT NULL,
  table_number TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  order_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  size_name TEXT DEFAULT '',
  base_price REAL NOT NULL,
  size_adjust REAL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS order_item_toppings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  order_item_id INTEGER NOT NULL,
  topping_name TEXT NOT NULL,
  price_adjust REAL DEFAULT 0,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS settings (
  tenant_id INTEGER NOT NULL DEFAULT 1,
  key TEXT NOT NULL,
  value TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, key)
);

-- Default tenant for existing data migration
INSERT OR IGNORE INTO tenants (id, username, password_hash, store_name) VALUES (1, 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', '測試便當店');

INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'store_name', '快餐店');
INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'current_order_number', '0');
INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'current_calling_number', '1');
INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'last_reset_date', '');

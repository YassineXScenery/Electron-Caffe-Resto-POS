// db.js
const Database = require('better-sqlite3');
const db = new Database('local-pos.db');

// Create tables if not exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER,
    total_price REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_synced BOOLEAN DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    item_id INTEGER,
    quantity INTEGER,
    price REAL
  )
`).run();

module.exports = db;

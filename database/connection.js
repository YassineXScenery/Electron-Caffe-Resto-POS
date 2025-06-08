require('dotenv').config();
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let mysqlPool;
let sqliteConnection;

async function initializeDatabase() {
  console.log('ℹ️ Initializing MySQL pool...');
  mysqlPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456789ya',
    database: process.env.DB_NAME || 'menu_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log('ℹ️ Initializing SQLite database...');
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, 'pos-offline.db');
    console.log(`ℹ️ Opening SQLite database at: ${dbPath}`);
    sqliteConnection = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ SQLite connection failed:', err);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
      resolve();
    });
  });
}

async function initializeSyncTables() {
  console.log('ℹ️ Initializing SQLite tables...');
  return new Promise((resolve, reject) => {
    if (!sqliteConnection) {
      const err = new Error('SQLite connection not initialized');
      console.error('❌ Failed to initialize sync tables:', err);
      reject(err);
      return;
    }
    sqliteConnection.serialize(() => {
      try {
        sqliteConnection.run(`
          CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY,
            categorie TEXT,
            image TEXT
          )
        `);
        sqliteConnection.run(`
          CREATE TABLE IF NOT EXISTS items (
            item_id INTEGER PRIMARY KEY,
            item_name TEXT,
            category_id INTEGER,
            item_price REAL,
            image TEXT,
            FOREIGN KEY (category_id) REFERENCES menu(id)
          )
        `);
        sqliteConnection.run(`
          CREATE TABLE IF NOT EXISTS orders (
            order_id INTEGER PRIMARY KEY AUTOINCREMENT,
            items TEXT,
            total REAL,
            status TEXT,
            table_number INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        sqliteConnection.run(`
          CREATE TABLE IF NOT EXISTS sync_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            last_sync TIMESTAMP,
            sync_type TEXT
          )
        `);
        sqliteConnection.run(`
          CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            username TEXT,
            password TEXT,
            photo TEXT
          )
        `);
        console.log('✅ SQLite tables initialized');
        resolve();
      } catch (err) {
        console.error('❌ Failed to initialize sync tables:', err);
        reject(err);
      }
    });
  });
}

async function isOnline() {
  try {
    await mysqlPool.query('SELECT 1');
    console.log('✅ MySQL connection confirmed');
    return true;
  } catch (err) {
    console.warn('⚠️ MySQL connection unavailable:', err.message);
    return false;
  }
}

async function executeQuery(query, params = []) {
  console.log(`ℹ️ Executing query: ${query} with params:`, params);
  const online = await isOnline();
  if (online) {
    try {
      const [results] = await mysqlPool.query(query, params);
      console.log('✅ MySQL query executed successfully');
      return results;
    } catch (err) {
      console.error('❌ MySQL query failed:', err);
      throw err;
    }
  } else {
    return new Promise((resolve, reject) => {
      if (!sqliteConnection) {
        console.error('❌ SQLite query failed: Connection not initialized');
        reject(new Error('SQLite connection not initialized'));
        return;
      }
      sqliteConnection.all(query, params, (err, rows) => {
        if (err) {
          console.error('❌ SQLite query failed:', err);
          reject(err);
        } else {
          console.log('✅ SQLite query executed successfully');
          resolve(rows);
        }
      });
    });
  }
}

async function syncOfflineChanges() {
  console.log('ℹ️ Starting syncOfflineChanges...');
  const online = await isOnline();
  if (!online) {
    console.warn('⚠️ Cannot sync offline changes: POS is offline');
    return;
  }

  if (!sqliteConnection) {
    console.error('❌ SQLite connection not initialized in syncOfflineChanges');
    return;
  }

  let pendingOrders = [];
  try {
    const result = sqliteConnection.prepare(
      'SELECT * FROM orders WHERE status = "pending"'
    ).all();
    pendingOrders = Array.isArray(result) ? result : [];
  } catch (err) {
    console.error('❌ Failed to query pending orders:', err);
    return;
  }

  if (pendingOrders.length === 0) {
    console.log('ℹ️ No pending orders to sync');
    return;
  }

  for (const order of pendingOrders) {
    try {
      await executeQuery(
        'INSERT INTO orders (order_id, items, total, status, table_number, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          order.order_id,
          order.items,
          order.total,
          order.status,
          order.table_number,
          order.created_at
        ]
      );
      sqliteConnection.run(
        'UPDATE orders SET status = "synced" WHERE order_id = ?',
        [order.order_id]
      );
      console.log(`✅ Order ${order.order_id} synced to MySQL`);
    } catch (err) {
      console.error(`❌ Failed to sync order ${order.order_id}:`, err);
    }
  }
}

module.exports = {
  initializeDatabase,
  initializeSyncTables,
  executeQuery,
  syncOfflineChanges,
  isOnline,
  sqliteConnection
};
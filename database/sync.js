const axios = require('axios');
const config = require('../config');
const { isOnline } = require('./network');
const offlineStorage = require('./offline-storage');
const mysql = require('mysql2/promise');

// MySQL connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '123456789ya',
    database: 'menu_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize MySQL tables
async function initializeMySQL() {
    try {
        const connection = await pool.getConnection();
        
        // Create menu table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS menu (
                id INT PRIMARY KEY AUTO_INCREMENT,
                categorie VARCHAR(255) NOT NULL,
                image TEXT
            )
        `);

        // Create items table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS items (
                item_id INT PRIMARY KEY AUTO_INCREMENT,
                item_name VARCHAR(255) NOT NULL,
                category_id INT,
                item_price DECIMAL(10,2),
                image TEXT,
                FOREIGN KEY (category_id) REFERENCES menu(id)
            )
        `);

        // Create orders table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                table_number INT,
                total DECIMAL(10,2) NOT NULL,
                status ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
                payment_method ENUM('cash', 'card', 'pending') NOT NULL DEFAULT 'cash',
                notes TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create order_items table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id BIGINT,
                item_id INT,
                quantity INT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (item_id) REFERENCES items(item_id)
            )
        `);

        // Create admins table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                photo TEXT
            )
        `);

        connection.release();
        console.log('✅ MySQL tables initialized');
        return true;
    } catch (err) {
        console.error('❌ Failed to initialize MySQL:', err);
        return false;
    }
}

// Sync data from local database
async function syncFromLocal() {
    try {
        const connection = await pool.getConnection();
        
        // Get all categories and items
        const [categories] = await connection.query('SELECT * FROM menu ORDER BY id');
        const [items] = await connection.query('SELECT * FROM items ORDER BY item_id');
        
        // Save to offline storage
        offlineStorage.saveMenu(categories, items);
        offlineStorage.updateLastSync();
        
        connection.release();
        console.log('✅ Data synced to offline storage');
        return true;
    } catch (err) {
        console.error('❌ Local sync failed:', err);
        return false;
    }
}

// Force sync
async function forceSync() {
    console.log('ℹ️ Starting local sync...');
    return await syncFromLocal();
}

// Check if sync is needed
async function isSyncNeeded() {
    const lastSync = await getLastSyncTime();
    return !lastSync;
}

// Get last sync time
async function getLastSyncTime() {
    return offlineStorage.getLastSync();
}

// Sync pending changes
async function syncPendingChanges() {
    console.log('ℹ️ No pending changes to sync (local mode)');
    return true;
}

module.exports = {
    initializeMySQL,
    syncFromLocal,
    forceSync,
    isSyncNeeded,
    getLastSyncTime,
    syncPendingChanges
};
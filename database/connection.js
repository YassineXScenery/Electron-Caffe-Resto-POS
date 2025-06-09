require('dotenv').config();
const mysql = require('mysql2/promise');
const { isOnline } = require('./network');
const offlineStorage = require('./offline-storage');
const config = require('../config');

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

let isInitialized = false;
let isClosing = false;

// Initialize database connection
async function initializeDatabase() {
    if (isInitialized) return true;
    
    try {
        // Test MySQL connection
        const connection = await pool.getConnection();
        console.log('✅ MySQL connection established');
        
        // Test query to verify database access
        const [result] = await connection.query('SELECT 1');
        console.log('✅ Database query test successful');

        // Fix image paths in database
        console.log('ℹ️ Fixing image paths in database...');
        await connection.query(`
            UPDATE menu 
            SET image = REPLACE(image, '/uploads/', 'uploads/') 
            WHERE id > 0 AND image IS NOT NULL;
        `);
        console.log('✅ Fixed menu image paths');

        await connection.query(`
            UPDATE items 
            SET image = REPLACE(image, '/uploads/', 'uploads/') 
            WHERE item_id > 0 AND image IS NOT NULL;
        `);
        console.log('✅ Fixed items image paths');

        await connection.query(`
            UPDATE admins 
            SET photo = REPLACE(photo, '/uploads/', 'uploads/') 
            WHERE id > 0 AND photo IS NOT NULL;
        `);
        console.log('✅ Fixed admin photo paths');
        
        connection.release();
        isInitialized = true;
        return true;
    } catch (err) {
        console.error('❌ Failed to initialize MySQL:', err);
        return false;
    }
}

// Execute query (tries MySQL first, falls back to JSON)
async function executeQuery(query, params = []) {
    if (isClosing) {
        throw new Error('Database is closing');
    }
    
    console.log(`ℹ️ Executing query: ${query} with params:`, params);
    
    try {
        // Always try MySQL first
        const [results] = await pool.query(query, params);
        console.log('✅ MySQL query executed successfully');
        return results;
    } catch (err) {
        console.error('❌ MySQL query failed:', err);
        // Only fall back to JSON storage if MySQL fails
        console.log('ℹ️ Falling back to JSON storage');
        return offlineStorage.getData(query, params);
    }
}

// Close database connection
async function closeDatabase() {
    console.log('ℹ️ Closing database connections...');
    isClosing = true;

    try {
        await pool.end();
        console.log('✅ MySQL pool closed');
    } catch (err) {
        console.error('❌ Error closing MySQL pool:', err);
    }

    isInitialized = false;
    isClosing = false;
}

// Initialize on startup
initializeDatabase().catch(console.error);

module.exports = {
    initializeDatabase,
    executeQuery,
    closeDatabase,
    isOnline
};
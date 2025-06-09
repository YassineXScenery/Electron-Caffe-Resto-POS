const { ipcMain } = require('electron');
const { executeQuery, isOnline } = require('../database/connection');
const { syncFromLocal, getLastSyncTime, isSyncNeeded, syncPendingChanges } = require('../database/sync');
const bcrypt = require('bcryptjs');
const Store = require('electron-store');
const { addNetworkListener } = require('../database/network');

// Initialize secure store
const store = new Store({
    encryptionKey: 'your-encryption-key', // This should be a secure key in production
    name: 'pos-credentials'
});

// Network status listeners
const networkListeners = new Set();

// Setup network status monitoring
addNetworkListener((status) => {
    networkListeners.forEach(listener => listener(status));
});

ipcMain.handle('db:query', async (event, sql, params) => {
    console.log(`ℹ️ DB query: ${sql}`, params);
    return await executeQuery(sql, params);
});

ipcMain.handle('db:execute', async (event, sql, params) => {
    console.log(`ℹ️ DB execute: ${sql}`, params);
    return await executeQuery(sql, params);
});

ipcMain.handle('login', async (event, { username, password }) => {
    try {
        console.log('ℹ️ Login attempt:', username);
        console.log('ℹ️ Checking if online...');
        const online = await isOnline();
        console.log('ℹ️ Online status:', online);

        // First try to get user from database
        console.log('ℹ️ Querying database for user...');
        const result = await executeQuery('SELECT * FROM admins WHERE username = ?', [username]);
        console.log('ℹ️ Database query result:', result);

        if (result.length === 0) {
            console.log('❌ Login failed: User not found in database');
            return { success: false, message: 'User not found' };
        }

        const storedHash = result[0].password;
        console.log('ℹ️ Stored password hash:', storedHash);
        console.log('ℹ️ Attempting to verify password...');
        
        const isValid = await bcrypt.compare(password, storedHash);
        console.log('ℹ️ Password validation result:', isValid);

        if (!isValid) {
            console.log('❌ Login failed: Invalid password');
            return { success: false, message: 'Invalid password' };
        }

        console.log('✅ Login successful for', username);
        return {
            success: true,
            user: {
                id: result[0].id,
                username: result[0].username,
                photo: result[0].photo
            }
        };
    } catch (err) {
        console.error('❌ Login error:', err);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('logout', () => {
    console.log('ℹ️ User logged out');
    return true;
});

ipcMain.handle('orders:create', async (event, orderData) => {
    const { items, table_number, total } = orderData;
    console.log(`ℹ️ Creating order for table ${table_number}, total: ${total}`);

    try {
        const result = await executeQuery(
            'INSERT INTO orders (table_number, total, status, created_at) VALUES (?, ?, ?, NOW())',
            [table_number, total, 'pending']
        );

        const orderId = result.insertId;

        for (const item of items) {
            await executeQuery(
                'INSERT INTO order_items (order_id, item_id, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, item.item_id, item.quantity, item.item_price]
            );
        }

        console.log(`✅ Order ${orderId} created`);
        return { orderId, status: 'success' };
    } catch (err) {
        console.error('❌ Failed to create order:', err);
        return { status: 'error', message: err.message };
    }
});

ipcMain.handle('orders:get', async (event, filters) => {
    const { status, date_from, date_to } = filters || {};
    console.log('ℹ️ Fetching orders with filters:', filters);
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }

    if (date_from) {
        sql += ' AND created_at >= ?';
        params.push(date_from);
    }

    if (date_to) {
        sql += ' AND created_at <= ?';
        params.push(date_to);
    }

    sql += ' ORDER BY created_at DESC';

    try {
        const orders = await executeQuery(sql, params);
        console.log(`✅ Fetched ${orders.length} orders`);
        return orders;
    } catch (err) {
        console.error('❌ Failed to fetch orders:', err);
        return [];
    }
});

ipcMain.handle('menu:categories', async () => {
    const categories = await executeQuery('SELECT * FROM menu ORDER BY id');
    console.log('ℹ️ Fetched categories:', categories);
    return categories;
});

ipcMain.handle('menu:items', async (event, categoryId) => {
    const query = categoryId ? 
        'SELECT * FROM items WHERE category_id = ? ORDER BY item_name' :
        'SELECT * FROM items ORDER BY item_name';
    const params = categoryId ? [categoryId] : [];
    const items = await executeQuery(query, params);
    console.log('ℹ️ Fetched items:', items);
    return items;
});

ipcMain.handle('sync:force', async () => {
    console.log('ℹ️ Forcing sync...');
    return await syncFromLocal();
});

ipcMain.handle('sync:lastSyncTime', async () => {
    return await getLastSyncTime();
});

ipcMain.handle('sync:isNeeded', async () => {
    return await isSyncNeeded();
});

ipcMain.handle('sync:pendingChanges', async () => {
    return await syncPendingChanges();
});

ipcMain.handle('network:status', async () => {
    console.log('ℹ️ Getting network status');
    try {
        const status = await isOnline();
        console.log('✅ Network status:', status);
        return status;
    } catch (err) {
        console.error('❌ Failed to get network status:', err);
        return false;
    }
});

// Store credentials
ipcMain.handle('store:credentials', async (event, credentials) => {
    try {
        await store.set('credentials', credentials);
        return true;
    } catch (err) {
        console.error('❌ Failed to store credentials:', err);
        return false;
    }
});

// Load credentials
ipcMain.handle('load:credentials', async () => {
    try {
        return store.get('credentials');
    } catch (err) {
        console.error('❌ Failed to load credentials:', err);
        return null;
    }
});

// Clear credentials
ipcMain.handle('clear:credentials', async () => {
    try {
        await store.delete('credentials');
        return true;
    } catch (err) {
        console.error('❌ Failed to clear credentials:', err);
        return false;
    }
});
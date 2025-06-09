const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'data');
const ORDERS_FILE = path.join(STORAGE_DIR, 'offline-orders.json');
const MENU_FILE = path.join(STORAGE_DIR, 'menu.json');
const SYNC_STATUS_FILE = path.join(STORAGE_DIR, 'sync-status.json');
const ADMINS_FILE = path.join(STORAGE_DIR, 'admins.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    console.log('✅ Created storage directory:', STORAGE_DIR);
}

// Initialize storage files if they don't exist
function initializeStorage() {
    const files = {
        [ORDERS_FILE]: { orders: [] },
        [MENU_FILE]: { categories: [], items: [] },
        [SYNC_STATUS_FILE]: { lastSync: null, pendingChanges: [] },
        [ADMINS_FILE]: { admins: [] }
    };

    for (const [file, defaultData] of Object.entries(files)) {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
            console.log('✅ Created storage file:', file);
        }
    }
}

initializeStorage();

// Load data from JSON file
function loadData(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.warn('⚠️ Error loading data from', file, ':', err.message);
        return null;
    }
}

// Save data to JSON file
function saveData(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error('❌ Failed to save data to', file, ':', err);
        return false;
    }
}

// Generic query handler
function getData(query, params = []) {
    console.log('ℹ️ Processing offline query:', query, 'with params:', params);
    
    // Handle SELECT queries
    if (query.toLowerCase().startsWith('select')) {
        // Handle orders queries
        if (query.includes('orders')) {
            const data = loadData(ORDERS_FILE);
            if (!data) return [];
            
            // Handle WHERE clauses
            if (query.includes('where')) {
                const conditions = query.split('where')[1].split('and');
                return data.orders.filter(order => {
                    return conditions.every(condition => {
                        const [field, value] = condition.trim().split('=').map(s => s.trim());
                        return order[field] === value;
                    });
                });
            }
            
            return data.orders;
        }
        
        // Handle menu queries
        if (query.includes('menu')) {
            const data = loadData(MENU_FILE);
            if (!data) return [];
            return data.categories;
        }
        
        // Handle items queries
        if (query.includes('items')) {
            const data = loadData(MENU_FILE);
            if (!data) return [];
            
            // Handle WHERE clauses for category_id
            if (query.includes('where')) {
                const categoryId = query.split('category_id =')[1].trim();
                return data.items.filter(item => item.category_id === parseInt(categoryId));
            }
            
            return data.items;
        }
        
        // Handle admins queries
        if (query.includes('admins')) {
            const data = loadData(ADMINS_FILE);
            if (!data) return [];
            
            // Handle WHERE clauses for username
            if (query.includes('where')) {
                const username = query.split('username =')[1].trim();
                return data.admins.filter(admin => admin.username === username);
            }
            
            return data.admins;
        }
    }
    
    // Handle INSERT queries
    if (query.toLowerCase().startsWith('insert')) {
        const table = query.split('into')[1].split('(')[0].trim();
        const values = query.split('values')[1].trim();
        
        if (table === 'orders') {
            const order = JSON.parse(values);
            return addOrder(order);
        }
        
        if (table === 'order_items') {
            const item = JSON.parse(values);
            return addOrderItem(item);
        }
    }
    
    // Handle UPDATE queries
    if (query.toLowerCase().startsWith('update')) {
        const table = query.split('update')[1].split('set')[0].trim();
        const setClause = query.split('set')[1].split('where')[0].trim();
        const whereClause = query.split('where')[1].trim();
        
        if (table === 'orders') {
            const orderId = whereClause.split('id =')[1].trim();
            const status = setClause.split('status =')[1].trim();
            return updateOrderStatus(parseInt(orderId), status);
        }
    }
    
    console.warn('⚠️ Unhandled query type:', query);
    return null;
}

// Order operations
function addOrder(order) {
    const data = loadData(ORDERS_FILE);
    if (!data) return false;

    order.id = Date.now(); // Simple unique ID
    order.status = 'pending';
    order.created_at = new Date().toISOString();
    data.orders.push(order);
    
    // Add to pending changes
    const syncData = loadData(SYNC_STATUS_FILE);
    if (syncData) {
        syncData.pendingChanges.push({
            type: 'order',
            action: 'create',
            data: order,
            timestamp: new Date().toISOString()
        });
        saveData(SYNC_STATUS_FILE, syncData);
    }

    return saveData(ORDERS_FILE, data);
}

function addOrderItem(item) {
    const data = loadData(ORDERS_FILE);
    if (!data) return false;

    const order = data.orders.find(o => o.id === item.order_id);
    if (order) {
        if (!order.items) order.items = [];
        order.items.push(item);
        
        // Add to pending changes
        const syncData = loadData(SYNC_STATUS_FILE);
        if (syncData) {
            syncData.pendingChanges.push({
                type: 'order_item',
                action: 'create',
                data: item,
                timestamp: new Date().toISOString()
            });
            saveData(SYNC_STATUS_FILE, syncData);
        }

        return saveData(ORDERS_FILE, data);
    }
    return false;
}

function updateOrderStatus(orderId, status) {
    const data = loadData(ORDERS_FILE);
    if (!data) return false;

    const order = data.orders.find(o => o.id === orderId);
    if (order) {
        order.status = status;
        
        // Add to pending changes
        const syncData = loadData(SYNC_STATUS_FILE);
        if (syncData) {
            syncData.pendingChanges.push({
                type: 'order',
                action: 'update',
                data: { id: orderId, status },
                timestamp: new Date().toISOString()
            });
            saveData(SYNC_STATUS_FILE, syncData);
        }

        return saveData(ORDERS_FILE, data);
    }
    return false;
}

// Menu operations
function saveMenu(categories, items) {
    const data = loadData(MENU_FILE);
    if (!data) return false;

    data.categories = categories;
    data.items = items;
    data.lastUpdate = new Date().toISOString();

    // Add to pending changes
    const syncData = loadData(SYNC_STATUS_FILE);
    if (syncData) {
        syncData.pendingChanges.push({
            type: 'menu',
            action: 'update',
            data: { categories, items },
            timestamp: new Date().toISOString()
        });
        saveData(SYNC_STATUS_FILE, syncData);
    }

    return saveData(MENU_FILE, data);
}

// Sync operations
function getPendingChanges() {
    const syncData = loadData(SYNC_STATUS_FILE);
    return syncData ? syncData.pendingChanges : [];
}

function clearPendingChanges() {
    const syncData = loadData(SYNC_STATUS_FILE);
    if (syncData) {
        syncData.pendingChanges = [];
        syncData.lastSync = new Date().toISOString();
        return saveData(SYNC_STATUS_FILE, syncData);
    }
    return false;
}

function updateLastSync() {
    const syncData = loadData(SYNC_STATUS_FILE);
    if (syncData) {
        syncData.lastSync = new Date().toISOString();
        return saveData(SYNC_STATUS_FILE, syncData);
    }
    return false;
}

function getLastSync() {
    const syncData = loadData(SYNC_STATUS_FILE);
    return syncData ? syncData.lastSync : null;
}

module.exports = {
    getData,
    addOrder,
    updateOrderStatus,
    saveMenu,
    getPendingChanges,
    clearPendingChanges,
    updateLastSync,
    getLastSync
}; 
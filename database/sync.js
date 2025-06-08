const axios = require('axios');
const { executeQuery, sqliteConnection, syncOfflineChanges, isOnline } = require('./connection');

const API_BASE_URL = 'http://localhost:3000/api';

async function getAuthToken() {
  return process.env.API_TOKEN || null;
}

async function syncFromRemote() {
  if (!sqliteConnection) {
    console.error('❌ syncFromRemote failed: No SQLite connection');
    return false;
  }

  try {
    const token = await getAuthToken();
    const catRes = await axios.get(`${API_BASE_URL}/menu`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const categories = catRes.data;

    sqliteConnection.run('DELETE FROM menu');
    const insertCategory = sqliteConnection.prepare(
      'INSERT INTO menu (id, categorie, image) VALUES (?, ?, ?)'
    );
    for (const category of categories) {
      insertCategory.run(category.id, category.categorie, category.image);
    }
    insertCategory.finalize();
    console.log(`✅ Categories synced: ${categories.length}`);

    const itemRes = await axios.get(`${API_BASE_URL}/items`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const items = itemRes.data;

    sqliteConnection.run('DELETE FROM items');
    const insertItem = sqliteConnection.prepare(
      'INSERT INTO items (item_id, item_name, category_id, item_price, image) VALUES (?, ?, ?, ?, ?)'
    );
    for (const item of items) {
      insertItem.run(item.item_id, item.item_name, item.category_id, item.item_price, item.image);
    }
    insertItem.finalize();
    console.log(`✅ Items synced: ${items.length}`);

    sqliteConnection.run(
      `INSERT INTO sync_status (last_sync, sync_type) VALUES (CURRENT_TIMESTAMP, 'full')`
    );

    return true;
  } catch (err) {
    console.error('❌ Sync failed:', err.response?.data || err.message);
    return false;
  }
}

async function syncAdmin() {
  if (!sqliteConnection) {
    console.error('❌ syncAdmin failed: No SQLite connection');
    return false;
  }

  const online = await isOnline();
  if (!online) {
    console.warn('⚠️ Cannot sync admins: POS is offline');
    return false;
  }

  try {
    const admins = await executeQuery('SELECT id, username, password, photo FROM admins');
    sqliteConnection.run('DELETE FROM admins');
    const insertAdmin = sqliteConnection.prepare(
      'INSERT INTO admins (id, username, password, photo) VALUES (?, ?, ?, ?)'
    );
    for (const admin of admins) {
      insertAdmin.run(admin.id, admin.username, admin.password, admin.photo);
    }
    insertAdmin.finalize();
    console.log(`✅ Admins synced: ${admins.length}`);
    return true;
  } catch (err) {
    console.error('❌ Admin sync failed:', err);
    return false;
  }
}

async function syncPendingOrders() {
  try {
    await syncOfflineChanges();
    console.log('✅ Pending orders synced');
    return true;
  } catch (err) {
    console.error('❌ Pending orders sync failed:', err);
    return false;
  }
}

async function getLastSyncTime() {
  if (!sqliteConnection) {
    console.error('❌ getLastSyncTime failed: No SQLite connection');
    return null;
  }

  try {
    const result = sqliteConnection.prepare(
      'SELECT last_sync FROM sync_status ORDER BY id DESC LIMIT 1'
    ).get();
    console.log('✅ Fetched last sync time:', result ? result.last_sync : null);
    return result ? result.last_sync : null;
  } catch (err) {
    console.error('❌ Failed to get last sync time:', err);
    return null;
  }
}

async function isSyncNeeded() {
  try {
    const lastSync = await getLastSyncTime();
    if (!lastSync) {
      console.log('ℹ️ Sync needed: No previous sync');
      return true;
    }
    const lastSyncDate = new Date(lastSync);
    const now = new Date();
    const hoursSinceLastSync = (now - lastSyncDate) / (1000 * 60 * 60);
    const needsSync = hoursSinceLastSync > 1;
    console.log(`ℹ️ Sync ${needsSync ? 'needed' : 'not needed'}: ${hoursSinceLastSync.toFixed(2)} hours since last sync`);
    return needsSync;
  } catch (err) {
    console.error('❌ Failed to check sync status:', err);
    return true;
  }
}

module.exports = { syncFromRemote, syncPendingOrders, getLastSyncTime, isSyncNeeded, syncAdmin };
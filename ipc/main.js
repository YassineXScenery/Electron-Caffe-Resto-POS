const { ipcMain } = require('electron');
const { executeQuery, sqliteConnection, isOnline } = require('../database/connection');
const { syncPendingOrders, getLastSyncTime, isSyncNeeded } = require('../database/sync');
const bcrypt = require('bcryptjs');

ipcMain.handle('db:query', async (event, sql, params) => {
  console.log(`ℹ️ DB query: ${sql}`, params);
  return await executeQuery(sql, params);
});

ipcMain.handle('db:execute', async (event, sql, params) => {
  console.log(`ℹ️ DB execute: ${sql}`, params);
  return await executeQuery(sql, params);
});

ipcMain.handle('auth:login', async (event, credentials) => {
  console.log('ℹ️ Login attempt:', credentials.username);
  const { username, password } = credentials;
  try {
    const result = await executeQuery(
      'SELECT * FROM admins WHERE username = ?',
      [username]
    );
    console.log(`ℹ️ Query result for ${username}:`, result);

    if (result.length === 0) {
      console.error('❌ Login failed: User not found');
      throw new Error('Invalid credentials');
    }

    const admin = result[0];
    const validPassword = await bcrypt.compare(password, admin.password);
    console.log(`ℹ️ Password valid: ${validPassword}`);

    if (!validPassword) {
      console.error('❌ Login failed: Invalid password');
      throw new Error('Invalid credentials');
    }

    const online = await isOnline();
    if (online && sqliteConnection) {
      try {
        sqliteConnection.run('DELETE FROM admins WHERE username = ?', [username]);
        sqliteConnection.run(
          'INSERT INTO admins (id, username, password, photo) VALUES (?, ?, ?, ?)',
          [admin.id, admin.username, admin.password, admin.photo]
        );
        console.log(`✅ Admin ${username} synced to SQLite`);
      } catch (err) {
        console.error('⚠️ Failed to sync admin to SQLite:', err);
      }
    }

    console.log(`✅ Login successful for ${username}`);
    return { id: admin.id, username: admin.username, photo: admin.photo };
  } catch (err) {
    console.error('❌ Login error:', err.message);
    throw err;
  }
});

ipcMain.handle('auth:logout', () => {
  console.log('ℹ️ User logged out');
  return true;
});

ipcMain.handle('orders:create', async (event, orderData) => {
  const { items, table_number, total } = orderData;
  console.log(`ℹ️ Creating order for table ${table_number}, total: ${total}`);

  const result = await executeQuery(
    'INSERT INTO orders (table_number, total, status) VALUES (?, ?, ?)',
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

  const orders = await executeQuery(sql, params);
  console.log(`✅ Fetched ${orders.length} orders`);
  return orders;
});

ipcMain.handle('menu:categories', async () => {
  console.log('ℹ️ Fetching menu categories');
  try {
    const categories = await executeQuery('SELECT * FROM menu ORDER BY id');
    console.log(`✅ Fetched ${categories.length} categories:`, categories);
    return categories;
  } catch (err) {
    console.error('❌ Failed to fetch categories:', err);
    return [];
  }
});

ipcMain.handle('menu:items', async (event, categoryId) => {
  console.log(`ℹ️ Fetching items for category: ${categoryId || 'all'}`);
  try {
    if (categoryId) {
      const items = await executeQuery(
        'SELECT * FROM items WHERE category_id = ? ORDER BY item_name',
        [categoryId]
      );
      console.log(`✅ Fetched ${items.length} items for category ${categoryId}:`, items);
      return items;
    }
    const items = await executeQuery('SELECT * FROM items ORDER BY item_name');
    console.log(`✅ Fetched ${items.length} items:`, items);
    return items;
  } catch (err) {
    console.error('❌ Failed to fetch items:', err);
    return [];
  }
});

ipcMain.handle('tables:get', async () => {
  console.log('ℹ️ Fetching tables');
  const tables = await executeQuery('SELECT * FROM tables ORDER BY table_number');
  console.log(`✅ Fetched ${tables.length} tables`);
  return tables;
});

ipcMain.handle('waiter:call', async (event, tableNumber) => {
  console.log(`ℹ️ Waiter called for table ${tableNumber}`);
  const result = await executeQuery(
    'INSERT INTO call_waiter_requests (table_number) VALUES (?)',
    [tableNumber]
  );
  console.log('✅ Waiter call recorded');
  return result;
});

ipcMain.handle('waiter:requests', async () => {
  console.log('ℹ️ Fetching waiter requests');
  const requests = await executeQuery(
    'SELECT * FROM call_waiter_requests WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) ORDER BY created_at DESC'
  );
  console.log(`✅ Fetched ${requests.length} waiter requests`);
  return requests;
});

ipcMain.handle('feedback:submit', async (event, message) => {
  console.log('ℹ️ Submitting feedback:', message);
  const result = await executeQuery(
    'INSERT INTO feedback (message) VALUES (?)',
    [message]
  );
  console.log('✅ Feedback submitted');
  return result;
});

ipcMain.handle('feedback:get', async () => {
  console.log('ℹ️ Fetching feedback');
  const feedback = await executeQuery(
    'SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50'
  );
  console.log(`✅ Fetched ${feedback.length} feedback entries`);
  return feedback;
});

ipcMain.handle('settings:get', async () => {
  console.log('ℹ️ Fetching settings');
  const settings = await executeQuery('SELECT * FROM footer_settings');
  console.log(`✅ Fetched ${settings.length} settings`);
  return settings;
});

ipcMain.handle('settings:update', async (event, settings) => {
  const { id, ...updateData } = settings;
  console.log('ℹ️ Updating settings for id:', id);
  const fields = Object.keys(updateData);
  const values = Object.values(updateData);

  const sql = `UPDATE footer_settings SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
  values.push(id);

  const result = await executeQuery(sql, values);
  console.log('✅ Settings updated');
  return result;
});

ipcMain.handle('sync:pendingOrders', async () => {
  console.log('ℹ️ Syncing pending orders');
  const result = await syncPendingOrders();
  console.log(`✅ Pending orders sync result: ${result}`);
  return result;
});

ipcMain.handle('sync:lastSyncTime', async () => {
  console.log('ℹ️ Fetching last sync time');
  const result = await getLastSyncTime();
  console.log(`✅ Last sync time: ${result}`);
  return result;
});

ipcMain.handle('sync:isNeeded', async () => {
  console.log('ℹ️ Checking if sync is needed');
  const result = await isSyncNeeded();
  console.log(`✅ Sync needed: ${result}`);
  return result;
});
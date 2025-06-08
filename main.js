const { app, BrowserWindow } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();

// Database & sync modules
const { initializeDatabase, initializeSyncTables, sqliteConnection, closeDatabase } = require('./database/connection');
const { syncFromRemote, syncAdmin, syncPendingOrders } = require('./database/sync');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('renderer/index.html');

  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      window.addEventListener('online', () => {
        window.api.syncPendingOrders();
      });
    `).catch(err => console.error('❌ Failed to inject online listener:', err));
  });
}

app.whenReady().then(async () => {
  console.log('🟢 App is starting...');

  try {
    await initializeDatabase();
    await initializeSyncTables();
    console.log('✅ Database & tables ready.');
  } catch (err) {
    console.error('❌ Database init failed:', err);
  }

  if (sqliteConnection) {
    console.log('✅ SQLite connection available for syncs');
    try {
      const adminSynced = await syncAdmin();
      if (!adminSynced) {
        console.warn('⚠️ Admin sync skipped (offline or failed).');
      }
    } catch (err) {
      console.error('❌ Admin sync failed:', err);
    }

    try {
      const synced = await syncFromRemote();
      if (!synced) {
        console.warn('⚠️ Menu sync skipped (offline or failed).');
      }
    } catch (err) {
      console.error('❌ Sync from remote failed:', err);
    }

    try {
      const ordersSynced = await syncPendingOrders();
      if (!ordersSynced) {
        console.warn('⚠️ Pending orders sync skipped (offline or failed).');
      }
    } catch (err) {
      console.error('❌ Pending orders sync failed:', err);
    }
  } else {
    console.warn('⚠️ SQLite connection unavailable, skipping syncs');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    try {
      await closeDatabase();
    } catch (err) {
      console.error('❌ Failed to close databases:', err);
    }
    app.quit();
  }
});

app.on('quit', async () => {
  try {
    await closeDatabase();
  } catch (err) {
    console.error('❌ Failed to close databases on quit:', err);
  }
});

require('./ipc/main');
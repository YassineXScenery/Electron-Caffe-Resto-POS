const { app, BrowserWindow } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();
const express = require('express');
const server = express();

// Database & sync modules
const { initializeDatabase, closeDatabase } = require('./database/connection');
const { syncFromRemote, syncPendingChanges } = require('./database/sync');
const { syncImages } = require('./database/image-sync');

let mainWindow = null;
let isQuitting = false;

// Serve static files from public directory
server.use(express.static(path.join(__dirname, 'public')));

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`✅ Static file server running on port ${PORT}`);
});

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.loadFile('renderer/index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.addEventListener('online', () => {
        window.api.syncPendingChanges();
      });
    `).catch(err => console.error('❌ Failed to inject online listener:', err));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle app quit
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    try {
      console.log('ℹ️ Closing all windows, cleaning up...');
      // Give a small delay to allow any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      await closeDatabase();
      console.log('✅ Cleanup complete, quitting...');
      app.quit();
    } catch (err) {
      console.error('❌ Error during cleanup:', err);
      app.exit(1);
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;
    try {
      console.log('ℹ️ App quitting, cleaning up...');
      // Give a small delay to allow any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      await closeDatabase();
      console.log('✅ Cleanup complete, quitting...');
      app.quit();
    } catch (err) {
      console.error('❌ Error during cleanup:', err);
      app.exit(1);
    }
  }
});

async function performSync() {
  try {
    // Sync menu and orders
    const synced = await syncFromRemote();
    if (!synced) {
      console.warn('⚠️ Menu sync skipped (offline or failed).');
    }

    const changesSynced = await syncPendingChanges();
    if (!changesSynced) {
      console.warn('⚠️ Pending changes sync skipped (offline or failed).');
    }
  } catch (err) {
    console.error('❌ Sync failed:', err);
  }
}

app.whenReady().then(async () => {
  console.log('🟢 App is starting...');

  try {
    await initializeDatabase();
    console.log('✅ Database ready.');

    await performSync();
    createWindow();
  } catch (err) {
    console.error('❌ Database init failed:', err);
    app.quit();
  }
});

require('./ipc/main');
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Database operations
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('db:execute', sql, params),
    
    // Authentication
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    logout: () => ipcRenderer.invoke('logout'),
    
    // Credentials storage
    storeCredentials: (credentials) => ipcRenderer.invoke('store:credentials', credentials),
    loadCredentials: () => ipcRenderer.invoke('load:credentials'),
    clearCredentials: () => ipcRenderer.invoke('clear:credentials'),
    
    // Orders
    createOrder: (orderData) => ipcRenderer.invoke('orders:create', orderData),
    getOrders: (filters) => ipcRenderer.invoke('orders:get', filters),
    updateOrderStatus: (orderId, status, paymentMethod) => ipcRenderer.invoke('orders:updateStatus', orderId, status, paymentMethod),
    
    // Menu
    getCategories: () => ipcRenderer.invoke('menu:categories'),
    getItems: (categoryId) => ipcRenderer.invoke('menu:items', categoryId),
    
    // Sync
    syncPendingChanges: () => ipcRenderer.invoke('sync:pendingChanges'),
    getLastSyncTime: () => ipcRenderer.invoke('sync:lastSyncTime'),
    isSyncNeeded: () => ipcRenderer.invoke('sync:isNeeded'),
    forceSync: () => ipcRenderer.invoke('sync:force'),
    syncImages: () => ipcRenderer.invoke('sync:images'),
    
    // Settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
    
    // Network status
    getNetworkStatus: () => ipcRenderer.invoke('network:status'),
    onNetworkChange: (callback) => {
      ipcRenderer.on('network:changed', (_, status) => callback(status));
      return () => ipcRenderer.removeListener('network:changed', callback);
    }
  }
); 
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
        
        // Orders
        createOrder: (orderData) => ipcRenderer.invoke('orders:create', orderData),
        getOrders: (filters) => ipcRenderer.invoke('orders:get', filters),
        
        // Menu
        getCategories: () => ipcRenderer.invoke('menu:categories'),
        getItems: (categoryId) => ipcRenderer.invoke('menu:items', categoryId),
        
        // Sync
        syncPendingOrders: () => ipcRenderer.invoke('sync:pendingOrders'),
        getLastSyncTime: () => ipcRenderer.invoke('sync:lastSyncTime'),
        isSyncNeeded: () => ipcRenderer.invoke('sync:isNeeded'),
        forceSync: () => ipcRenderer.invoke('sync:force'),
        
        // Credentials
        storeCredentials: (credentials) => ipcRenderer.invoke('store:credentials', credentials),
        loadCredentials: () => ipcRenderer.invoke('load:credentials'),
        clearCredentials: () => ipcRenderer.invoke('clear:credentials'),
        
        // Admin sync
        forceAdminSync: () => ipcRenderer.invoke('sync:admin')
    }
); 
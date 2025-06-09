require('dotenv').config();

module.exports = {
    // API Configuration
    apiUrl: 'http://localhost:3000',
    
    // Database Configuration
    database: {
        host: 'localhost',
        user: 'root',
        password: '123456789ya',
        database: 'menu_db'
    },
    
    // Sync Configuration
    sync: {
        interval: 30000, // 30 seconds
        retryDelay: 5000, // 5 seconds
        maxRetries: 3
    },
    
    // App Configuration
    app: {
        name: 'POS System',
        version: '1.0.0',
        debug: true
    }
}; 
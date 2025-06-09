const axios = require('axios');
const config = require('../config');

let networkListeners = new Set();
let isNetworkAvailable = true; // Default to true for local development

// Check if we have network connectivity
async function isOnline() {
    try {
        // For local development, always return true
        if (process.env.NODE_ENV === 'development') {
            return true;
        }

        // For production, check network connectivity
        const response = await axios.get(`${config.apiUrl}/health`, { 
            timeout: 5000,
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Accept any response that's not a server error
            }
        });
        
        isNetworkAvailable = response.status === 200;
        return isNetworkAvailable;
    } catch (error) {
        console.log('ℹ️ Network check failed:', error.message);
        isNetworkAvailable = false;
        return false;
    }
}

// Add network status listener
function addNetworkListener(listener) {
    networkListeners.add(listener);
    // Immediately notify the listener of current status
    listener(isNetworkAvailable);
}

// Remove network status listener
function removeNetworkListener(listener) {
    networkListeners.delete(listener);
}

// Notify all listeners of network status change
function notifyNetworkListeners(status) {
    networkListeners.forEach(listener => listener(status));
}

// Start periodic network check
setInterval(async () => {
    const wasAvailable = isNetworkAvailable;
    const isAvailable = await isOnline();
    
    if (wasAvailable !== isAvailable) {
        notifyNetworkListeners(isAvailable);
    }
}, 5000);

module.exports = {
    isOnline,
    addNetworkListener,
    removeNetworkListener
}; 
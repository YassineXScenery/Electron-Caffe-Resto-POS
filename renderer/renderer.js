// State management
let state = {
    currentUser: null,
    categories: [],
    items: [],
    cart: [],
    selectedCategory: null,
    isOnline: true,
    tables: [],
    activeTable: null,
    lastSyncTime: null
};

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const posInterface = document.getElementById('pos-interface');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const categoriesContainer = document.getElementById('categories');
const menuItemsContainer = document.getElementById('menu-items');
const cartItemsContainer = document.getElementById('cart-items');
const subtotalElement = document.getElementById('subtotal');
const taxElement = document.getElementById('tax');
const totalElement = document.getElementById('total');
const tableNumberInput = document.getElementById('table-number');
const orderNotesInput = document.getElementById('order-notes');
const placeOrderBtn = document.getElementById('place-order-btn');
const connectionStatus = document.getElementById('connection-status');

// Utility functions
function formatPrice(price) {
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? '$0.00' : `$${numPrice.toFixed(2)}`;
}

function calculateTotals() {
    const subtotal = state.cart.reduce((sum, item) => sum + (parseFloat(item.item_price) * item.quantity), 0);
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    subtotalElement.textContent = formatPrice(subtotal);
    taxElement.textContent = formatPrice(tax);
    totalElement.textContent = formatPrice(total);
}

// UI Update functions
async function updateConnectionStatus(isOnline) {
    state.isOnline = isOnline;
    const icon = connectionStatus.querySelector('i');
    const text = connectionStatus.querySelector('span');
    
    if (isOnline) {
        icon.className = 'fas fa-circle text-green-500';
        text.textContent = 'Online';
        try {
            await window.api.syncPendingOrders();
        } catch (err) {
            console.error('❌ Failed to sync orders on reconnect:', err);
        }
    } else {
        icon.className = 'fas fa-circle text-red-500';
        text.textContent = 'Offline Mode';
    }

    try {
        const syncNeeded = await window.api.isSyncNeeded();
        if (syncNeeded) {
            showSyncWarning();
        }
    } catch (err) {
        console.error('❌ Failed to check sync status:', err);
    }
}

function showSyncWarning() {
    const warningDiv = document.createElement('div');
    warningDiv.className = 'fixed top-0 left-0 right-0 bg-yellow-500 text-white p-2 text-center';
    warningDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle mr-2"></i>
        Data may be outdated. Last sync was more than 1 hour ago.
    `;
    document.body.appendChild(warningDiv);
    
    setTimeout(() => {
        warningDiv.remove();
    }, 5000);
}

// Render categories
function renderCategories() {
    console.log('ℹ️ Rendering categories:', state.categories);
    if (!categoriesContainer) {
        console.error('❌ Categories container not found');
        return;
    }

    // Add "All" button first
    categoriesContainer.innerHTML = `
        <button class="category-btn ${!state.selectedCategory ? 'active' : ''}" 
                onclick="selectCategory(null)">
            All
        </button>
    `;

    // Add other category buttons
    categoriesContainer.innerHTML += state.categories.map(category => `
        <button class="category-btn ${state.selectedCategory === category.id ? 'active' : ''}" 
                onclick="selectCategory(${category.id})">
            ${category.categorie}
        </button>
    `).join('');
    console.log('ℹ️ Categories container updated:', categoriesContainer.innerHTML);
}

function renderMenuItems() {
    console.log('ℹ️ Rendering menu items:', state.items);
    if (!menuItemsContainer) {
        console.error('❌ Menu items container not found');
        return;
    }
    const items = state.selectedCategory 
        ? state.items.filter(item => item.category_id === state.selectedCategory)
        : state.items;

    console.log('ℹ️ Filtered items to render:', items);
    menuItemsContainer.innerHTML = items.map(item => {
        try {
            // Handle image path
            let imagePath = 'placeholder.jpg';
            if (item.image) {
                // If the image path is already a full URL, use it directly
                if (item.image.startsWith('http')) {
                    imagePath = item.image;
                } else {
                    // Otherwise, use the path relative to the app's root
                    imagePath = item.image.startsWith('/') ? item.image.slice(1) : item.image;
                    // Add http://localhost:3000/ prefix
                    imagePath = `http://localhost:3000/${imagePath}`;
                    console.log('ℹ️ Using image path:', imagePath);
                }
            }

            return `
                <div class="menu-item bg-white p-4 border rounded-lg shadow-md cursor-pointer" onclick="addToCart(${item.item_id})">
                    <img src="${imagePath}" alt="${item.item_name}" class="w-full h-32 object-cover rounded-md mb-2" 
                         onerror="this.onerror=null; this.src='placeholder.jpg'; console.log('Failed to load image:', '${imagePath}');" />
                    <h3 class="font-semibold">${item.item_name.trim()}</h3>
                    <p class="text-blue-500 font-semibold">${formatPrice(item.item_price)}</p>
                </div>
            `;
        } catch (err) {
            console.error(`❌ Error rendering item ${item.item_id}:`, err);
            return '';
        }
    }).join('');
    console.log('ℹ️ Menu items container updated:', menuItemsContainer.innerHTML);
}

function renderCart() {
    console.log('ℹ️ Rendering cart:', state.cart);
    if (!cartItemsContainer) {
        console.error('❌ Cart items container not found');
        return;
    }
    cartItemsContainer.innerHTML = state.cart.map(item => {
        try {
            return `
                <div class="cart-item flex justify-between items-center p-2 bg-gray-100 rounded">
                    <div>
                        <h4 class="font-semibold">${item.item_name}</h4>
                        <p class="text-sm text-gray-600">${formatPrice(item.item_price)} x ${item.quantity}</p>
                    </div>
                    <div class="flex justify-between items-center">
                        <button onclick="updateQuantity(${item.item_id}, ${item.quantity - 1})" class="text-gray-500 hover:text-red-700">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span>${item.quantity}</span>
                        <button onclick="updateQuantity(${item.item_id}, ${item.quantity + 1})" class="text-gray-500 hover:text-green-700">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button onclick="removeFromCart(${item.item_id})" class="text-red-600 hover:bg-red-600 hover:text-white rounded-full">
                            <i class="fas fa-trash-can"></i>
                    </div>
                </div>
            `;
        } catch (err) {
            console.error(`❌ Error rendering cart item ${item.item_id}:`, err);
            return '';
        }
    }).join('');

    calculateTotals();
}

// Event handlers
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    console.log(`ℹ️ Login attempt for ${username}, remember me: ${rememberMe}`);

    try {
        const result = await window.api.login({ username, password });
        if (result.success) {
            console.log('✅ Login successful, handling remember me...');
            if (rememberMe) {
                console.log('ℹ️ Remember me checked, storing credentials...');
                await window.api.storeCredentials({ username, password });
                console.log('✅ Credentials stored');
            } else {
                console.log('ℹ️ Remember me not checked, clearing any saved credentials...');
                await window.api.clearCredentials();
            }
            
            state.currentUser = result.user;
            loginScreen.classList.add('hidden');
            posInterface.classList.remove('hidden');
            await loadInitialData();
        } else {
            console.error('❌ Login failed:', result.message);
            showNotification(result.message || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        showNotification('Login failed: ' + error.message, 'error');
    }
}

async function handleLogout() {
    try {
        await window.api.logout();
        console.log('🔥 Frontend logout successful');
        state.currentUser = null;
        state.cart = [];
        loginScreen.classList.remove('hidden');
        posInterface.classList.add('hidden');
    } catch (err) {
        console.error('❌ Failed to logout:', err);
    }
}

// Select category
function selectCategory(categoryId) {
    console.log('ℹ️ Selecting category:', categoryId);
    state.selectedCategory = categoryId;
    renderCategories();
    renderMenuItems();
}

function addToCart(itemId) {
    try {
        console.log('ℹ️ Adding to cart:', itemId);
        const item = state.items.find(i => i.item_id === itemId);
        if (!item) {
            console.error('❌ Item not found:', itemId);
            return;
        }
        const existingItem = state.cart.find(i => i.item_id === itemId);

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            state.cart.push({
                item_id: item.item_id,
                item_name: item.item_name,
                item_price: parseFloat(item.item_price),
                quantity: 1
            });
        }

        renderCart();
    } catch (err) {
        console.error('❌ Failed to add to cart:', err);
    }
}

function updateQuantity(itemId, newQuantity) {
    try {
        console.log('ℹ️ Updating quantity for item:', itemId, newQuantity);
        if (newQuantity <= 0) {
            removeFromCart(itemId);
            return;
        }

        const item = state.cart.find(i => i.item_id === itemId);
        if (item) {
            item.quantity = newQuantity;
            renderCart();
        }
    } catch (err) {
        console.error('❌ Failed to update quantity:', err);
    }
}

function removeFromCart(itemId) {
    try {
        console.log('ℹ️ Removing from cart:', itemId);
        state.cart = state.cart.filter(item => item.item_id !== itemId);
        renderCart();
    } catch (err) {
        console.error('❌ Failed to remove from cart:', err);
    }
}

async function callWaiter() {
    if (!tableNumberInput.value) {
        alert('Please enter a table number');
        return;
    }
    try {
        await window.api.query('INSERT INTO call_waiter_requests (table_number) VALUES (?)', [tableNumberInput.value]);
        alert('Waiter has been called!');
    } catch (err) {
        alert('Failed to call waiter: ' + err.message);
    }
}

async function submitFeedback() {
    const message = prompt('Enter feedback:');
    if (message) {
        try {
            await window.api.query('INSERT INTO feedback (message) VALUES (?)', [message]);
            alert('Feedback submitted!');
        } catch (err) {
            alert('Failed to submit feedback: ' + err.message);
        }
    }
}

async function placeOrder() {
    if (state.cart.length === 0) {
        alert('Cart is empty');
        return;
    }

    const orderData = {
        items: state.cart,
        table_number: parseInt(tableNumberInput.value) || null,
        total: parseFloat(totalElement.textContent.replace('$', ''))
    };

    try {
        const result = await window.api.createOrder(orderData);
        if (result.status === 'success') {
            state.cart = [];
            tableNumberInput.value = '';
            orderNotesInput.value = '';
            renderCart();
            alert('Order placed successfully!');
        }
    } catch (err) {
        alert('Failed to place order: ' + err.message);
    }
}

// Data loading
async function loadInitialData() {
    try {
        console.log('ℹ️ Loading categories...');
        state.categories = await window.api.getCategories();
        console.log('✅ Categories loaded:', state.categories);

        console.log('ℹ️ Loading items...');
        state.items = await window.api.getItems();
        console.log('✅ Items loaded:', state.items);

        console.log('ℹ️ Loading tables...');
        state.tables = await window.api.query('SELECT * FROM tables ORDER BY table_number');
        console.log('✅ Tables loaded:', state.tables);

        console.log('ℹ️ Loading last sync time...');
        state.lastSyncTime = await window.api.getLastSyncTime();
        console.log('✅ Last sync time:', state.lastSyncTime);

        renderCategories();
        renderMenuItems();
    } catch (err) {
        console.error('❌ Failed to load initial data:', err);
    }
}

// Connection status
async function checkConnection() {
    const isOnline = navigator.onLine;
    await updateConnectionStatus(isOnline);
}

// Event listeners
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
placeOrderBtn.addEventListener('click', placeOrder);
window.addEventListener('online', checkConnection);
window.addEventListener('offline', checkConnection);

// Initialize
checkConnection();
setInterval(checkConnection, 30000);

// Add sync button handler
document.getElementById('syncButton').addEventListener('click', async () => {
  const button = document.getElementById('syncButton');
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
  
  try {
    console.log('ℹ️ Starting manual sync...');
    
    // Sync data first
    const result = await window.api.forceSync();
    if (!result) {
      throw new Error('Data sync failed');
    }
    
    // Then sync images
    console.log('ℹ️ Starting image sync...');
    const imageResult = await window.api.syncImages();
    if (!imageResult) {
      throw new Error('Image sync failed');
    }
    
    console.log('✅ Manual sync completed successfully');
    showNotification('Sync completed successfully', 'success');
    
    // Reload all data after sync
    await loadInitialData();
  } catch (err) {
    console.error('❌ Manual sync error:', err);
    showNotification('Sync failed: ' + (err.message || "unknown"), 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-sync"></i> Sync Now';
  }
});

// Add notification function if not exists
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 p-4 rounded shadow-lg ${
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 
    'bg-blue-500'
  } text-white`;
  notification.innerHTML = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Add these functions after the existing code
async function saveCredentials(username, password) {
    try {
        await window.api.storeCredentials({ username, password });
        console.log('✅ Credentials saved');
    } catch (err) {
        console.error('❌ Failed to save credentials:', err);
    }
}

async function loadSavedCredentials() {
    try {
        const credentials = await window.api.loadCredentials();
        if (credentials) {
            document.getElementById('username').value = credentials.username;
            document.getElementById('password').value = credentials.password;
            document.getElementById('remember-me').checked = true;
            console.log('✅ Loaded saved credentials');
        }
    } catch (err) {
        console.error('❌ Failed to load credentials:', err);
    }
}

// Add this function to handle auto-login
async function attemptAutoLogin() {
    try {
        console.log('ℹ️ Attempting auto-login...');
        const credentials = await window.api.loadCredentials();
        if (credentials) {
            console.log('ℹ️ Found saved credentials, attempting login...');
            const result = await window.api.login(credentials);
            if (result.success) {
                console.log('✅ Auto-login successful');
                state.currentUser = result.user;
                loginScreen.classList.add('hidden');
                posInterface.classList.remove('hidden');
                await loadInitialData();
                return true;
            } else {
                console.log('❌ Auto-login failed:', result.message);
                // Clear invalid credentials
                await window.api.clearCredentials();
            }
        } else {
            console.log('ℹ️ No saved credentials found');
        }
        return false;
    } catch (err) {
        console.error('❌ Auto-login error:', err);
        return false;
    }
}

// Update the window load handler
window.addEventListener('load', async () => {
    // Try auto-login first
    const autoLoginSuccess = await attemptAutoLogin();
    if (!autoLoginSuccess) {
        // If auto-login fails, show login screen
        loginScreen.classList.remove('hidden');
        posInterface.classList.add('hidden');
    }
    
    // Check connection status
    await checkConnection();
    
    // Set up periodic connection check
    setInterval(checkConnection, 30000);
});
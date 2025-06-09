const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ipcMain } = require('electron');
const { executeQuery } = require('./connection');
const config = require('../config');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
const IMAGE_SYNC_FILE = path.join(__dirname, '..', 'data', 'image-sync.json');

// Ensure directories exist
[UPLOADS_DIR, path.dirname(IMAGE_SYNC_FILE)].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('✅ Created directory:', dir);
    }
});

// Load or initialize image sync data
function loadImageSyncData() {
    try {
        if (fs.existsSync(IMAGE_SYNC_FILE)) {
            return JSON.parse(fs.readFileSync(IMAGE_SYNC_FILE, 'utf8'));
        }
    } catch (err) {
        console.warn('⚠️ Error loading image sync data:', err.message);
    }
    return { lastSync: null, images: {} };
}

// Save image sync data
function saveImageSyncData(data) {
    try {
        fs.writeFileSync(IMAGE_SYNC_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Image sync data saved');
    } catch (err) {
        console.error('❌ Failed to save image sync data:', err);
    }
}

// Calculate file hash
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function downloadImage(imageUrl, force = false) {
    if (!imageUrl) return null;

    // Handle local file paths
    if (imageUrl.startsWith('uploads/')) {
        const localPath = path.join(__dirname, '..', 'public', imageUrl);
        if (fs.existsSync(localPath)) {
            console.log('ℹ️ Using local image:', imageUrl);
            return imageUrl;
        }
    }

    // Handle remote URLs
    let fullUrl = imageUrl.startsWith('http') ? imageUrl : `${config.apiUrl}/${imageUrl.replace(/^\//, '')}`;
    const filename = path.basename(fullUrl.split('?')[0]);
    const targetPath = path.join(UPLOADS_DIR, filename);

    // Load sync data
    const syncData = loadImageSyncData();
    const imageInfo = syncData.images[filename];

    // Check if we need to download
    if (!force && imageInfo && fs.existsSync(targetPath)) {
        try {
            const currentHash = await calculateFileHash(targetPath);
            if (currentHash === imageInfo.hash) {
                console.log('ℹ️ Image already exists and is valid:', filename);
                return `uploads/${filename}`;
            }
            console.log('ℹ️ Image exists but hash mismatch, redownloading:', filename);
        } catch (err) {
            console.warn('⚠️ Error checking image hash:', err.message);
        }
    }

    try {
        console.log('ℹ️ Downloading image:', fullUrl);
        const response = await axios({
            method: 'GET',
            url: fullUrl,
            responseType: 'stream',
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Accept any response that's not a server error
            }
        });

        const writer = fs.createWriteStream(targetPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                try {
                    // Calculate and store file hash
                    const hash = await calculateFileHash(targetPath);
                    syncData.images[filename] = {
                        url: fullUrl,
                        hash,
                        size: fs.statSync(targetPath).size,
                        lastSync: new Date().toISOString()
                    };
                    saveImageSyncData(syncData);
                    console.log('✅ Image downloaded:', filename);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
            writer.on('error', (err) => {
                console.error(`❌ Error writing image ${filename}:`, err);
                reject(err);
            });
        });

        return `uploads/${filename}`;
    } catch (err) {
        console.error(`❌ Failed to download image ${fullUrl}:`, err.message);
        return null;
    }
}

async function syncImages() {
    console.log('ℹ️ Starting image sync...');
    try {
        // Get all images from database
        const categories = await executeQuery('SELECT image FROM menu WHERE image IS NOT NULL');
        const items = await executeQuery('SELECT image FROM items WHERE image IS NOT NULL');
        const allImages = [...categories, ...items].map(row => row.image).filter(Boolean);

        console.log(`ℹ️ Found ${allImages.length} images to sync`);
        
        // Download all images
        for (const imageUrl of allImages) {
            await downloadImage(imageUrl);
        }

        // Clean up old images
        const syncData = loadImageSyncData();
        const currentImages = new Set(allImages.map(url => path.basename(url)));
        
        for (const [filename, info] of Object.entries(syncData.images)) {
            if (!currentImages.has(filename)) {
                const filePath = path.join(UPLOADS_DIR, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log('✅ Removed unused image:', filename);
                }
                delete syncData.images[filename];
            }
        }
        
        saveImageSyncData(syncData);
        console.log('✅ Image sync completed');
        return true;
    } catch (err) {
        console.error('❌ Image sync failed:', err);
        return false;
    }
}

// Add IPC handler for image sync
ipcMain.handle('sync:images', async () => {
    return await syncImages();
});

module.exports = {
    syncImages,
    downloadImage
}; 
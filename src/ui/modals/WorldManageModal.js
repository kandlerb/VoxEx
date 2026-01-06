/**
 * World Management Modal
 * Handles world rename, duplicate, delete, export/import, and storage info.
 * @module ui/modals/WorldManageModal
 */

// =====================================================
// CONSTANTS
// =====================================================

/** Default storage limit for quota display (50MB) */
export const DEFAULT_STORAGE_LIMIT = 50 * 1024 * 1024;

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Format bytes to human-readable string.
 * @param {number} bytes - Number of bytes
 * @param {number} [decimals=1] - Decimal places
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Check if two seeds match (handles string/number comparison).
 * @param {string|number} seed1 - First seed
 * @param {string|number} seed2 - Second seed
 * @returns {boolean} True if seeds match
 */
export function seedsMatch(seed1, seed2) {
    return String(seed1) === String(seed2);
}

// =====================================================
// WORLD STORAGE INFO
// =====================================================

/**
 * @typedef {Object} WorldStorageInfo
 * @property {number} metaBytes - Size of metadata in localStorage
 * @property {number} chunkBytes - Size of chunks in IndexedDB
 * @property {number} chunkCount - Number of chunks stored
 * @property {number} totalBytes - Total storage used
 */

/**
 * Calculate storage usage for a world.
 * @param {string} worldName - World name
 * @param {IDBDatabase|null} db - IndexedDB database instance
 * @param {string} storeName - IndexedDB store name
 * @returns {Promise<WorldStorageInfo>} Storage information
 */
export async function getWorldStorageInfo(worldName, db, storeName) {
    const saveData = localStorage.getItem(`voxex_save_${worldName}`);
    let metadata = {};
    let seed = null;

    try {
        if (saveData) metadata = JSON.parse(saveData);
        seed = metadata.seed;
    } catch {
        // Ignore parse errors
    }

    const metaBytes = saveData ? new Blob([saveData]).size : 0;

    let chunkBytes = 0;
    let chunkCount = 0;

    if (db && seed) {
        await new Promise((resolve) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.openCursor();

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (seedsMatch(cursor.value.seed, seed)) {
                        chunkCount++;
                        if (cursor.value.data) {
                            chunkBytes += JSON.stringify(cursor.value.data).length;
                        }
                    }
                    cursor.continue();
                } else {
                    resolve(undefined);
                }
            };
            request.onerror = () => resolve(undefined);
        });
    }

    return { metaBytes, chunkBytes, chunkCount, totalBytes: metaBytes + chunkBytes };
}

/**
 * Update storage display elements in modal.
 * @param {WorldStorageInfo} info - Storage information
 * @param {number} [storageLimit] - Storage limit for percentage calculation
 */
export function updateStorageDisplay(info, storageLimit = DEFAULT_STORAGE_LIMIT) {
    const barEl = document.getElementById('world-storage-bar');
    const usedEl = document.getElementById('world-storage-used');
    const metaSizeEl = document.getElementById('world-meta-size');
    const chunksSizeEl = document.getElementById('world-chunks-size');
    const chunksCountEl = document.getElementById('world-chunks-count');

    const percent = Math.min((info.totalBytes / storageLimit) * 100, 100);

    if (barEl) {
        barEl.style.width = percent + '%';
        barEl.className = 'storage-bar-fill';
        if (percent > 80) barEl.classList.add('danger');
        else if (percent > 50) barEl.classList.add('warning');
    }

    if (usedEl) usedEl.textContent = formatBytes(info.totalBytes);
    if (metaSizeEl) metaSizeEl.textContent = formatBytes(info.metaBytes);
    if (chunksSizeEl) chunksSizeEl.textContent = formatBytes(info.chunkBytes);
    if (chunksCountEl) chunksCountEl.textContent = info.chunkCount.toString();
}

// =====================================================
// MODAL STATE AND CONTROLS
// =====================================================

/** Currently managed world name */
let currentManagedWorld = null;

/**
 * Get currently managed world name.
 * @returns {string|null} World name or null
 */
export function getCurrentManagedWorld() {
    return currentManagedWorld;
}

/**
 * Open the world management modal.
 * @param {string} worldName - World to manage
 * @param {IDBDatabase|null} db - IndexedDB database instance
 * @param {string} storeName - IndexedDB store name
 */
export async function openWorldManageModal(worldName, db, storeName) {
    currentManagedWorld = worldName;
    const modal = document.getElementById('world-manage-modal');
    const titleEl = document.getElementById('world-modal-title');
    const renameInput = document.getElementById('world-rename-input');
    const duplicateInput = document.getElementById('world-duplicate-input');

    if (titleEl) titleEl.textContent = `Manage: ${worldName}`;
    if (renameInput) renameInput.value = worldName;
    if (duplicateInput) duplicateInput.value = `${worldName} Copy`;

    // Calculate and display storage info
    const info = await getWorldStorageInfo(worldName, db, storeName);
    updateStorageDisplay(info);

    if (modal) modal.classList.add('show');
}

/**
 * Close the world management modal.
 */
export function closeWorldManageModal() {
    currentManagedWorld = null;
    const modal = document.getElementById('world-manage-modal');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// WORLD OPERATIONS
// =====================================================

/**
 * @typedef {Object} WorldOperationCallbacks
 * @property {Function} showToast - Toast notification function
 * @property {Function} getIndex - Get save index
 * @property {Function} updateIndex - Update save index
 * @property {Function} populateWorldCards - Refresh world cards display
 */

/**
 * Rename a world.
 * @param {string} oldName - Current world name
 * @param {string} newName - New world name
 * @param {WorldOperationCallbacks} callbacks - Operation callbacks
 * @returns {boolean} Success status
 */
export function renameWorld(oldName, newName, callbacks) {
    const { showToast, getIndex, populateWorldCards } = callbacks;

    if (!oldName || !newName || oldName === newName) return false;
    newName = newName.trim();
    if (!newName) {
        showToast('Please enter a valid name', 'warning');
        return false;
    }

    // Check if new name already exists
    const index = getIndex();
    if (index.includes(newName)) {
        showToast('A world with that name already exists', 'error');
        return false;
    }

    // Get old save data
    const saveData = localStorage.getItem(`voxex_save_${oldName}`);
    if (!saveData) {
        showToast('World not found', 'error');
        return false;
    }

    // Copy to new name
    localStorage.setItem(`voxex_save_${newName}`, saveData);

    // Update index
    const newIndex = index.map(n => n === oldName ? newName : n);
    localStorage.setItem('voxex_save_index', JSON.stringify(newIndex));

    // Remove old entry
    localStorage.removeItem(`voxex_save_${oldName}`);

    showToast(`Renamed to "${newName}"`, 'success');
    populateWorldCards();
    closeWorldManageModal();
    return true;
}

/**
 * Duplicate a world.
 * @param {string} sourceName - Source world name
 * @param {string} newName - New world name
 * @param {WorldOperationCallbacks} callbacks - Operation callbacks
 * @returns {boolean} Success status
 */
export function duplicateWorld(sourceName, newName, callbacks) {
    const { showToast, getIndex, updateIndex, populateWorldCards } = callbacks;

    if (!sourceName || !newName) return false;
    newName = newName.trim();
    if (!newName) {
        showToast('Please enter a valid name', 'warning');
        return false;
    }

    // Check if new name already exists
    const index = getIndex();
    if (index.includes(newName)) {
        showToast('A world with that name already exists', 'error');
        return false;
    }

    // Get source save data
    const saveData = localStorage.getItem(`voxex_save_${sourceName}`);
    if (!saveData) {
        showToast('Source world not found', 'error');
        return false;
    }

    try {
        const parsed = JSON.parse(saveData);
        parsed.timestamp = Date.now();
        localStorage.setItem(`voxex_save_${newName}`, JSON.stringify(parsed));

        // Update index
        updateIndex(newName);

        showToast(`Created "${newName}"`, 'success');
        populateWorldCards();
        closeWorldManageModal();
        return true;
    } catch {
        showToast('Failed to duplicate world', 'error');
        return false;
    }
}

/**
 * Clear chunk cache for a specific world.
 * @param {string} worldName - World name
 * @param {IDBDatabase} db - IndexedDB database instance
 * @param {string} storeName - IndexedDB store name
 * @param {Function} showToast - Toast notification function
 * @param {boolean} [skipConfirm=false] - Skip confirmation dialog
 * @returns {Promise<number>} Number of chunks deleted
 */
export async function clearWorldChunkCache(worldName, db, storeName, showToast, skipConfirm = false) {
    const saveData = localStorage.getItem(`voxex_save_${worldName}`);
    if (!saveData) {
        showToast('World not found', 'error');
        return 0;
    }

    let seed;
    try {
        seed = JSON.parse(saveData).seed;
    } catch {
        showToast('Failed to read world data', 'error');
        return 0;
    }

    if (!db || !seed) {
        showToast('No chunks to clear', 'info');
        return 0;
    }

    if (!skipConfirm) {
        const confirmed = confirm(
            `Clear all cached chunks for "${worldName}"?\n\n` +
            'The world can be regenerated from its seed, but any manually placed/removed blocks will be lost.'
        );
        if (!confirmed) return 0;
    }

    let deletedCount = 0;

    await new Promise((resolve) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.openCursor();

        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (seedsMatch(cursor.value.seed, seed)) {
                    cursor.delete();
                    deletedCount++;
                }
                cursor.continue();
            } else {
                resolve(undefined);
            }
        };
        request.onerror = () => resolve(undefined);
    });

    showToast(`Cleared ${deletedCount} chunks`, 'success');
    return deletedCount;
}

// =====================================================
// EXPORT / IMPORT
// =====================================================

/**
 * @typedef {Object} ExportData
 * @property {number} version - Export format version
 * @property {number} exportDate - Export timestamp
 * @property {string} worldName - World name
 * @property {Object} metadata - World metadata
 * @property {Array} chunks - Chunk data array
 */

/**
 * Export a world to a downloadable file.
 * @param {string} worldName - World to export
 * @param {IDBDatabase|null} db - IndexedDB database instance
 * @param {string} storeName - IndexedDB store name
 * @param {Function} showToast - Toast notification function
 */
export async function exportWorld(worldName, db, storeName, showToast) {
    const saveData = localStorage.getItem(`voxex_save_${worldName}`);
    if (!saveData) {
        showToast('World not found', 'error');
        return;
    }

    let metadata;
    try {
        metadata = JSON.parse(saveData);
    } catch {
        showToast('Failed to read world data', 'error');
        return;
    }

    showToast('Preparing export...', 'info');

    // Collect all chunks for this world's seed
    const exportChunks = [];
    const seed = metadata.seed;

    if (db && seed) {
        await new Promise((resolve) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.openCursor();

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (seedsMatch(cursor.value.seed, seed)) {
                        exportChunks.push({
                            key: cursor.value.key,
                            data: cursor.value.data,
                            timestamp: cursor.value.timestamp
                        });
                    }
                    cursor.continue();
                } else {
                    resolve(undefined);
                }
            };
            request.onerror = () => resolve(undefined);
        });
    }

    /** @type {ExportData} */
    const exportData = {
        version: 1,
        exportDate: Date.now(),
        worldName: worldName,
        metadata: metadata,
        chunks: exportChunks
    };

    // Create and download file
    const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${worldName.replace(/[^a-z0-9]/gi, '_')}.voxworld`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported "${worldName}" (${exportChunks.length} chunks)`, 'success');
}

/**
 * Import a world from a file.
 * @param {File} file - File to import
 * @param {IDBDatabase|null} db - IndexedDB database instance
 * @param {string} storeName - IndexedDB store name
 * @param {WorldOperationCallbacks} callbacks - Operation callbacks
 * @returns {Promise<string|null>} Imported world name or null on failure
 */
export async function importWorld(file, db, storeName, callbacks) {
    const { showToast, getIndex, updateIndex, populateWorldCards } = callbacks;

    if (!file) return null;

    showToast('Importing world...', 'info');

    try {
        const text = await file.text();
        /** @type {ExportData} */
        const importData = JSON.parse(text);

        // Validate format
        if (!importData.metadata || !importData.worldName) {
            showToast('Invalid world file format', 'error');
            return null;
        }

        // Check for name collision
        let worldName = importData.worldName;
        const index = getIndex();
        let counter = 1;
        while (index.includes(worldName)) {
            worldName = `${importData.worldName} (${counter++})`;
        }

        // Save metadata
        importData.metadata.timestamp = Date.now();
        localStorage.setItem(`voxex_save_${worldName}`, JSON.stringify(importData.metadata));
        updateIndex(worldName);

        // Import chunks to IndexedDB
        if (importData.chunks && importData.chunks.length > 0 && db) {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            for (const chunk of importData.chunks) {
                const record = {
                    key: chunk.key,
                    data: chunk.data,
                    timestamp: chunk.timestamp || Date.now(),
                    seed: importData.metadata.seed.toString()
                };
                store.put(record);
            }

            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
        }

        showToast(`Imported "${worldName}" (${importData.chunks?.length || 0} chunks)`, 'success');
        populateWorldCards();
        return worldName;
    } catch (e) {
        showToast('Failed to import world', 'error');
        return null;
    }
}

// =====================================================
// MODAL SETUP
// =====================================================

/**
 * Initialize modal event listeners.
 * @param {IDBDatabase|null} db - IndexedDB database instance
 * @param {string} storeName - IndexedDB store name
 * @param {WorldOperationCallbacks} callbacks - Operation callbacks
 */
export function initWorldManageModal(db, storeName, callbacks) {
    // Close button
    document.getElementById('world-modal-close')?.addEventListener('click', closeWorldManageModal);

    // Click outside to close
    document.getElementById('world-manage-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'world-manage-modal') closeWorldManageModal();
    });

    // Rename button
    document.getElementById('btn-rename-world')?.addEventListener('click', () => {
        const input = document.getElementById('world-rename-input');
        if (currentManagedWorld && input) {
            renameWorld(currentManagedWorld, input.value, callbacks);
        }
    });

    // Duplicate button
    document.getElementById('btn-duplicate-world')?.addEventListener('click', () => {
        const input = document.getElementById('world-duplicate-input');
        if (currentManagedWorld && input) {
            duplicateWorld(currentManagedWorld, input.value, callbacks);
        }
    });

    // Clear cache button
    document.getElementById('btn-clear-world-cache')?.addEventListener('click', async () => {
        if (currentManagedWorld) {
            await clearWorldChunkCache(currentManagedWorld, db, storeName, callbacks.showToast);
            const info = await getWorldStorageInfo(currentManagedWorld, db, storeName);
            updateStorageDisplay(info);
        }
    });

    // Export button
    document.getElementById('btn-export-world')?.addEventListener('click', () => {
        if (currentManagedWorld) {
            exportWorld(currentManagedWorld, db, storeName, callbacks.showToast);
        }
    });
}

/**
 * Create file input for importing worlds.
 * @param {IDBDatabase|null} db - IndexedDB database instance
 * @param {string} storeName - IndexedDB store name
 * @param {WorldOperationCallbacks} callbacks - Operation callbacks
 * @returns {HTMLInputElement} File input element
 */
export function createImportFileInput(db, storeName, callbacks) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.voxworld,.json';
    input.style.display = 'none';

    input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            await importWorld(file, db, storeName, callbacks);
        }
        input.value = '';
    });

    return input;
}

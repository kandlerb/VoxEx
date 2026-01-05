/**
 * World storage manager for save metadata and chunk persistence.
 * Uses IndexedDB for chunk data and localStorage for metadata.
 * @module persistence/WorldStorage
 */

import { ChunkCompressor } from './ChunkCompressor.js';
import { CHUNK_VOLUME } from '../config/WorldConfig.js';

const DB_NAME = 'VoxExWorldData';
const DB_VERSION = 2;
const STORE_NAME = 'chunks';
const SAVE_PREFIX = 'voxex_save_';
const INDEX_KEY = 'voxex_save_index';

/**
 * @typedef {Object} WorldMetadata
 * @property {string} seed
 * @property {Object} player
 * @property {number} timestamp
 * @property {number} version
 * @property {string|null} [thumbnail]
 */

/**
 * Compare seed values (string/number safe).
 * @param {string|number} recordSeed
 * @param {string|number} currentSeed
 * @returns {boolean}
 */
function seedsMatch(recordSeed, currentSeed) {
    if (recordSeed === undefined || currentSeed === undefined || recordSeed === null || currentSeed === null) return false;
    return recordSeed === currentSeed || recordSeed.toString() === currentSeed.toString();
}

/**
 * @param {string} name
 * @returns {string}
 */
function getSaveKey(name) {
    return `${SAVE_PREFIX}${name}`;
}

/**
 * @param {string} name
 * @returns {WorldMetadata|null}
 */
function readMetadata(name) {
    try {
        const json = localStorage.getItem(getSaveKey(name));
        if (!json) return null;
        return JSON.parse(json);
    } catch (error) {
        console.warn('[WorldStorage] Failed to parse metadata:', error);
        return null;
    }
}

/**
 * WorldStorage handles saving/loading metadata and chunk data.
 */
export class WorldStorage {
    constructor() {
        /** @type {IDBDatabase|null} */
        this.db = null;
    }

    /**
     * Initialize IndexedDB.
     * @returns {Promise<void>}
     */
    async init() {
        if (!('indexedDB' in window)) {
            console.warn('[WorldStorage] IndexedDB not available.');
            return;
        }

        this.db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (database.objectStoreNames.contains(STORE_NAME)) {
                    database.deleteObjectStore(STORE_NAME);
                }
                database.createObjectStore(STORE_NAME, { keyPath: 'key' });
            };
        });
    }

    /**
     * @returns {boolean}
     */
    isReady() {
        return !!this.db;
    }

    /**
     * @returns {string[]}
     */
    getIndex() {
        try {
            return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
        } catch (error) {
            console.warn('[WorldStorage] Failed to read index:', error);
            return [];
        }
    }

    /**
     * @param {string[]} index
     */
    setIndex(index) {
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    }

    /**
     * @param {string} name
     */
    updateIndex(name) {
        const index = this.getIndex();
        if (!index.includes(name)) {
            index.push(name);
            this.setIndex(index);
        }
    }

    /**
     * @param {string} name
     */
    removeFromIndex(name) {
        const index = this.getIndex().filter(entry => entry !== name);
        this.setIndex(index);
    }

    /**
     * @returns {Array<{name: string, metadata: WorldMetadata|null, metaBytes: number}>}
     */
    listWorlds() {
        return this.getIndex().map((name) => {
            const key = getSaveKey(name);
            const raw = localStorage.getItem(key);
            const metadata = raw ? readMetadata(name) : null;
            const metaBytes = raw ? new Blob([raw]).size : 0;
            return { name, metadata, metaBytes };
        });
    }

    /**
     * @param {string} name
     * @returns {WorldMetadata|null}
     */
    loadMetadata(name) {
        return readMetadata(name);
    }

    /**
     * @param {string} name
     * @param {WorldMetadata} metadata
     */
    saveMetadata(name, metadata) {
        localStorage.setItem(getSaveKey(name), JSON.stringify(metadata));
        this.updateIndex(name);
    }

    /**
     * @param {string} name
     */
    deleteMetadata(name) {
        localStorage.removeItem(getSaveKey(name));
        this.removeFromIndex(name);
    }

    /**
     * @param {string} oldName
     * @param {string} newName
     * @returns {boolean}
     */
    renameWorld(oldName, newName) {
        if (!oldName || !newName || oldName === newName) return false;
        const data = localStorage.getItem(getSaveKey(oldName));
        if (!data) return false;
        localStorage.setItem(getSaveKey(newName), data);
        localStorage.removeItem(getSaveKey(oldName));
        const index = this.getIndex().map(entry => (entry === oldName ? newName : entry));
        this.setIndex(index);
        return true;
    }

    /**
     * @param {string} sourceName
     * @param {string} newName
     * @returns {boolean}
     */
    duplicateWorld(sourceName, newName) {
        const data = localStorage.getItem(getSaveKey(sourceName));
        if (!data) return false;
        const parsed = JSON.parse(data);
        parsed.timestamp = Date.now();
        localStorage.setItem(getSaveKey(newName), JSON.stringify(parsed));
        this.updateIndex(newName);
        return true;
    }

    /**
     * Save a single chunk to cache.
     * @param {string} chunkKey
     * @param {Object} chunkData
     * @param {string} seed
     */
    async saveChunk(chunkKey, chunkData, seed) {
        if (!this.db) return;
        const record = {
            key: chunkKey,
            data: ChunkCompressor.compress({
                blocks: chunkData.blocks,
                skyLight: chunkData.skyLight,
                blockLight: chunkData.blockLight
            }),
            timestamp: Date.now(),
            seed: seed.toString()
        };

        await new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Batch save chunks to cache.
     * @param {Map<string, Object>} chunkDataMap
     * @param {string} seed
     */
    async batchSaveChunks(chunkDataMap, seed) {
        if (!this.db || !chunkDataMap || chunkDataMap.size === 0) return;

        await new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            let pending = chunkDataMap.size;
            let hasError = false;

            for (const [chunkKey, chunkData] of chunkDataMap) {
                const record = {
                    key: chunkKey,
                    data: ChunkCompressor.compress({
                        blocks: chunkData.blocks,
                        skyLight: chunkData.skyLight,
                        blockLight: chunkData.blockLight
                    }),
                    timestamp: Date.now(),
                    seed: seed.toString()
                };
                const request = store.put(record);
                request.onsuccess = () => {
                    pending--;
                    if (pending === 0 && !hasError) resolve();
                };
                request.onerror = () => {
                    hasError = true;
                    pending--;
                    if (pending === 0) reject(request.error);
                };
            }

            transaction.onerror = () => {
                if (!hasError) {
                    hasError = true;
                    reject(transaction.error);
                }
            };
        });
    }

    /**
     * Load a chunk from cache (if seed matches).
     * @param {string} chunkKey
     * @param {string} seed
     * @returns {Promise<{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}|null>}
     */
    async loadChunk(chunkKey, seed) {
        if (!this.db) return null;

        return await new Promise((resolve) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(chunkKey);
            request.onsuccess = () => {
                const record = request.result;
                if (record && seedsMatch(record.seed, seed)) {
                    let decompressed = ChunkCompressor.decompress(record.data);
                    if (decompressed && !decompressed.blocks) {
                        decompressed = {
                            blocks: decompressed,
                            skyLight: new Uint8Array(decompressed.length).fill(15),
                            blockLight: new Uint8Array(decompressed.length)
                        };
                    }
                    if (decompressed?.blocks?.length !== CHUNK_VOLUME) {
                        resolve(null);
                        return;
                    }
                    resolve(decompressed);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => resolve(null);
        });
    }

    /**
     * Clear all chunks for a seed.
     * @param {string} seed
     * @returns {Promise<number>} Count deleted
     */
    async clearChunksForSeed(seed) {
        if (!this.db) return 0;

        let deletedCount = 0;

        await new Promise((resolve) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (seedsMatch(cursor.value.seed, seed)) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => resolve();
        });

        return deletedCount;
    }

    /**
     * Delete a world (metadata + chunks for seed).
     * @param {string} name
     */
    async deleteWorld(name) {
        const metadata = this.loadMetadata(name);
        this.deleteMetadata(name);
        if (metadata?.seed) {
            await this.clearChunksForSeed(metadata.seed.toString());
        }
    }

    /**
     * Get storage info for a world.
     * @param {string} name
     * @returns {Promise<{metaBytes: number, chunkBytes: number, chunkCount: number, totalBytes: number}>}
     */
    async getWorldStorageInfo(name) {
        const saveKey = getSaveKey(name);
        const saveData = localStorage.getItem(saveKey);
        const metadata = saveData ? readMetadata(name) : null;
        const seed = metadata?.seed;
        const metaBytes = saveData ? new Blob([saveData]).size : 0;

        let chunkBytes = 0;
        let chunkCount = 0;

        if (this.db && seed) {
            await new Promise((resolve) => {
                const transaction = this.db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (seedsMatch(cursor.value.seed, seed)) {
                            chunkCount++;
                            if (cursor.value.data) {
                                chunkBytes += JSON.stringify(cursor.value.data).length;
                            }
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            });
        }

        return {
            metaBytes,
            chunkBytes,
            chunkCount,
            totalBytes: metaBytes + chunkBytes
        };
    }

    /**
     * Get total storage usage.
     * @returns {Promise<number>}
     */
    async getTotalStorageBytes() {
        let totalBytes = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('voxex_')) {
                totalBytes += localStorage.getItem(key)?.length || 0;
            }
        }

        if (this.db) {
            await new Promise((resolve) => {
                const transaction = this.db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.data) {
                            totalBytes += JSON.stringify(cursor.value.data).length;
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            });
        }

        return totalBytes;
    }

    /**
     * Export world data to a JSON blob.
     * @param {string} name
     * @returns {Promise<Blob|null>}
     */
    async exportWorld(name) {
        const metadata = this.loadMetadata(name);
        if (!metadata) return null;

        const exportChunks = [];
        const seed = metadata.seed;

        if (this.db && seed) {
            await new Promise((resolve) => {
                const transaction = this.db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
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
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            });
        }

        const exportData = {
            version: 1,
            exportDate: Date.now(),
            worldName: name,
            metadata,
            chunks: exportChunks
        };

        return new Blob([JSON.stringify(exportData)], { type: 'application/json' });
    }

    /**
     * Import world data from a JSON file.
     * @param {File} file
     * @returns {Promise<{name: string, chunkCount: number}|null>}
     */
    async importWorld(file) {
        if (!file) return null;
        const text = await file.text();
        const importData = JSON.parse(text);

        if (!importData.metadata || !importData.worldName) {
            throw new Error('Invalid world file format');
        }

        let worldName = importData.worldName;
        const index = this.getIndex();
        let counter = 1;
        while (index.includes(worldName)) {
            worldName = `${importData.worldName} (${counter++})`;
        }

        importData.metadata.timestamp = Date.now();
        localStorage.setItem(getSaveKey(worldName), JSON.stringify(importData.metadata));
        this.updateIndex(worldName);

        if (this.db && Array.isArray(importData.chunks) && importData.chunks.length > 0) {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

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
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        }

        return {
            name: worldName,
            chunkCount: importData.chunks?.length || 0
        };
    }
}

export default WorldStorage;

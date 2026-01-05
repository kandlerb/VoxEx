/**
 * VoxelWorld class for managing chunk-based voxel terrain.
 * Provides world-space block operations, chunk streaming, and lighting access.
 * @module world/VoxelWorld
 */

import { CHUNK_SIZE, CHUNK_HEIGHT, Y_OFFSET, CHUNK_VOLUME } from '../config/WorldConfig.js';
import { AIR, WATER } from '../core/constants.js';

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Clamp a value between min and max.
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
}

// =====================================================
// DEBUG FLAG
// =====================================================

/** Debug mode flag - controls call counting for hot-path verification */
let isDebug = false;

/**
 * Enable or disable debug mode for call counting.
 * @param {boolean} enabled - Whether to enable debug mode
 * @returns {void}
 */
export function setVoxelWorldDebug(enabled) {
    isDebug = enabled;
}

// =====================================================
// VOXELWORLD CLASS
// =====================================================

/**
 * VoxelWorld manages chunk storage and provides world-coordinate block access.
 * Optimized for hot-path operations with chunk caching and bitwise math.
 */
export class VoxelWorld {
    /**
     * Create a new VoxelWorld.
     * @param {Object|null} terrainGenerator - Terrain generator instance
     * @param {Object|null} settingsManager - Settings manager instance
     * @param {Map<string, Object>|null} [externalChunks=null] - External chunks map
     */
    constructor(terrainGenerator, settingsManager, externalChunks = null) {
        /** @type {Object|null} Terrain generator for creating new chunks */
        this.terrainGenerator = terrainGenerator;
        /** @type {Object|null} Settings manager instance */
        this.settings = settingsManager;
        /** @type {Map<string, Object>} Map of chunk key to chunk data */
        this.chunks = externalChunks || new Map();
        /** @type {Map<string, Object>} Map of chunk key to THREE.js mesh */
        this.chunkMeshes = new Map();
        /** @type {Set<string>} Set of currently active chunk keys */
        this.activeChunks = new Set();
        /** @type {Set<string>} Set of modified (dirty) chunk keys */
        this.modifiedChunks = new Set();
        /** @type {Set<string>} Set of unmodified (pristine) chunk keys */
        this.pristineChunks = new Set();
        /** @type {Array<{key: string, cx: number, cz: number, dist: number, force?: boolean}>} Queue of chunks to build */
        this.chunkBuildQueue = [];
        /** @type {Set<string>} Set of chunk keys already in build queue */
        this.queuedChunkKeys = new Set();

        // OPTIMIZATION: Cache for repeated lookups in same chunk (reduces Map.get calls)
        /** @private @type {string|null} */
        this._lastChunkKey = null;
        /** @private @type {Object|null} */
        this._lastChunk = null;

        // OPTIMIZATION: Scratch objects for coordinate conversion (avoids per-call allocation)
        /** @private */
        this._scratchWorldToChunk = { cx: 0, cz: 0, lx: 0, ly: 0, lz: 0 };
        /** @private */
        this._scratchChunkToWorld = { x: 0, y: 0, z: 0 };
        /** @private */
        this._scratchParseKey = { cx: 0, cz: 0 };

        // DEBUG: Call counters for hot-path verification
        /** @private */
        this._callCounts = {
            getBlock: 0, setBlock: 0, getSkyLight: 0, setSkyLight: 0,
            getBlockLight: 0, setBlockLight: 0, getChunkKey: 0
        };
    }

    // =====================================================
    // CHUNK BINDING
    // =====================================================

    /**
     * Bind an external chunks map.
     * @param {Map<string, Object>} chunksMap - Chunks map to bind
     * @returns {void}
     */
    bindChunks(chunksMap) {
        this.chunks = chunksMap;
    }

    /**
     * Bind external state sets for chunk tracking.
     * @param {Set<string>|null} modifiedChunks - Modified chunks set
     * @param {Set<string>|null} pristineChunks - Pristine chunks set
     * @param {Set<string>|null} activeChunks - Active chunks set
     * @returns {void}
     */
    bindState(modifiedChunks, pristineChunks, activeChunks) {
        if (modifiedChunks) this.modifiedChunks = modifiedChunks;
        if (pristineChunks) this.pristineChunks = pristineChunks;
        if (activeChunks) this.activeChunks = activeChunks;
    }

    // =====================================================
    // COORDINATE UTILITIES
    // =====================================================

    /**
     * Get chunk key string from coordinates.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @returns {string} Chunk key string
     */
    getChunkKey(cx, cz) {
        if (isDebug) this._callCounts.getChunkKey++;
        return `${cx},${cz}`;
    }

    /**
     * Parse chunk key string to coordinates (reuses scratch object).
     * @param {string} key - Chunk key string
     * @returns {{cx: number, cz: number}} Parsed coordinates
     */
    parseChunkKey(key) {
        const comma = key.indexOf(',');
        this._scratchParseKey.cx = +key.slice(0, comma);
        this._scratchParseKey.cz = +key.slice(comma + 1);
        return this._scratchParseKey;
    }

    /**
     * Convert world coordinates to chunk coordinates (reuses scratch object).
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @returns {{cx: number, cz: number, lx: number, ly: number, lz: number}} Chunk and local coordinates
     */
    worldToChunkCoords(x, y, z) {
        const chunkSize = CHUNK_SIZE;
        const cx = Math.floor(x / chunkSize);
        const cz = Math.floor(z / chunkSize);
        this._scratchWorldToChunk.cx = cx;
        this._scratchWorldToChunk.cz = cz;
        this._scratchWorldToChunk.lx = ((x % chunkSize) + chunkSize) % chunkSize | 0;
        this._scratchWorldToChunk.ly = (y + Y_OFFSET) | 0;
        this._scratchWorldToChunk.lz = ((z % chunkSize) + chunkSize) % chunkSize | 0;
        return this._scratchWorldToChunk;
    }

    /**
     * Convert chunk coordinates to world coordinates (reuses scratch object).
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {number} lx - Local X coordinate
     * @param {number} ly - Local Y coordinate
     * @param {number} lz - Local Z coordinate
     * @returns {{x: number, y: number, z: number}} World coordinates
     */
    chunkToWorldCoords(cx, cz, lx, ly, lz) {
        this._scratchChunkToWorld.x = cx * CHUNK_SIZE + lx;
        this._scratchChunkToWorld.y = ly - Y_OFFSET;
        this._scratchChunkToWorld.z = cz * CHUNK_SIZE + lz;
        return this._scratchChunkToWorld;
    }

    // =====================================================
    // CHUNK LIFECYCLE
    // =====================================================

    /**
     * Ensure a chunk exists, queueing for generation if needed.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @returns {Object|null} Chunk data or null if not yet generated
     */
    ensureChunk(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        if (this.chunks.has(key)) {
            return this.chunks.get(key);
        }
        // Queue for generation
        if (!this.queuedChunkKeys.has(key)) {
            this.chunkBuildQueue.push({ key, cx, cz, dist: 0 });
            this.queuedChunkKeys.add(key);
        }
        return null;
    }

    /**
     * Mark a chunk as needing rebuild.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @returns {void}
     */
    markChunkDirty(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        if (!this.queuedChunkKeys.has(key)) {
            this.chunkBuildQueue.push({ key, cx, cz, dist: 0 });
            this.queuedChunkKeys.add(key);
        }
    }

    /**
     * Schedule a chunk for update/rebuild.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {boolean} [force=false] - Force update even if already queued
     * @returns {void}
     */
    scheduleChunkUpdate(cx, cz, force = false) {
        const key = this.getChunkKey(cx, cz);
        if (!this.queuedChunkKeys.has(key)) {
            this.chunkBuildQueue.push({ key, cx, cz, dist: 0, force });
            this.queuedChunkKeys.add(key);
        }
    }

    /**
     * Update chunk streaming based on player position.
     * @param {{x: number, z: number}} playerPosition - Player position
     * @param {number} renderDistance - Render distance in chunks
     * @returns {void}
     */
    updateStreaming(playerPosition, renderDistance) {
        const chunkSize = CHUNK_SIZE;
        const playerCX = Math.floor(playerPosition.x / chunkSize);
        const playerCZ = Math.floor(playerPosition.z / chunkSize);

        const neededChunks = new Set();

        // Determine which chunks should be loaded
        for (let dx = -renderDistance; dx <= renderDistance; dx++) {
            for (let dz = -renderDistance; dz <= renderDistance; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist <= renderDistance) {
                    const key = this.getChunkKey(playerCX + dx, playerCZ + dz);
                    neededChunks.add(key);
                }
            }
        }

        // Unload chunks that are too far
        for (const key of this.activeChunks) {
            if (!neededChunks.has(key)) {
                this.unloadChunk(key);
            }
        }

        // Load new chunks
        for (const key of neededChunks) {
            if (!this.activeChunks.has(key)) {
                const { cx, cz } = this.parseChunkKey(key);
                this.ensureChunk(cx, cz);
            }
        }

        this.activeChunks = neededChunks;
    }

    /**
     * Unload a chunk if it's not modified.
     * @param {string} key - Chunk key to unload
     * @returns {boolean} True if chunk was unloaded
     */
    unloadChunk(key) {
        // Check if chunk can be evicted (not modified)
        if (this.modifiedChunks.has(key)) {
            return false;
        }
        this.chunks.delete(key);
        this.pristineChunks.delete(key);
        this.activeChunks.delete(key);
        return true;
    }

    /**
     * Check if a chunk can be evicted from memory.
     * @param {string} key - Chunk key
     * @param {boolean} [persistModified=false] - Whether to persist modified chunks
     * @returns {boolean} True if chunk can be evicted
     */
    canEvictChunk(key, persistModified = false) {
        if (this.modifiedChunks.has(key)) {
            return false;
        }
        return true;
    }

    /**
     * Completely remove a chunk from all tracking sets.
     * @param {string} key - Chunk key to purge
     * @returns {void}
     */
    purgeChunkData(key) {
        this.chunks.delete(key);
        this.pristineChunks.delete(key);
        this.modifiedChunks.delete(key);
        this.activeChunks.delete(key);
        this.queuedChunkKeys.delete(key);
    }

    // =====================================================
    // BLOCK ACCESS (HOT PATHS)
    // =====================================================

    /**
     * Get block at world coordinates.
     * HOT PATH - uses chunk cache and bitwise operations.
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @returns {number|undefined} Block ID or undefined if chunk not loaded
     */
    getBlock(x, y, z) {
        if (isDebug) this._callCounts.getBlock++;
        const ly = y + Y_OFFSET;
        if (ly < 0 || ly >= CHUNK_HEIGHT) return 0;
        // OPTIMIZATION: Inline chunk coord calculation (avoids function call overhead)
        const cx = (x >> 4) | 0;  // Fast divide by 16 for positive, works for negative too via floor behavior
        const cz = (z >> 4) | 0;
        const key = `${cx},${cz}`;  // Inline to avoid getChunkKey function call
        // OPTIMIZATION: Chunk cache for sequential block access in same chunk
        const chunk = key === this._lastChunkKey ? this._lastChunk : this.chunks.get(key);
        if (!chunk) return undefined;
        this._lastChunkKey = key;
        this._lastChunk = chunk;
        // OPTIMIZATION: Bitwise ops for local coords and index
        const lx = x & 15;
        const lz = z & 15;
        const idx = lx + (lz << 4) + (ly << 8);
        return chunk.blocks ? chunk.blocks[idx] : chunk[idx];
    }

    /**
     * Set block at world coordinates.
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @param {number} blockId - Block ID to set
     * @param {boolean} [createIfMissing=true] - Create chunk if it doesn't exist
     * @returns {boolean} True if block was changed
     */
    setBlock(x, y, z, blockId, createIfMissing = true) {
        if (isDebug) this._callCounts.setBlock++;
        const ly = y + Y_OFFSET;
        if (ly < 0 || ly >= CHUNK_HEIGHT) return false;
        // OPTIMIZATION: Bitwise divide by 16 (chunk size)
        const cx = x >> 4;
        const cz = z >> 4;
        const key = `${cx},${cz}`;  // Inline key generation
        let chunk = this.chunks.get(key);

        if (!chunk) {
            if (!createIfMissing) return false;
            // Create new chunk with light data
            const size = CHUNK_VOLUME;
            chunk = {
                blocks: new Uint8Array(size),
                skyLight: new Uint8Array(size).fill(15),
                blockLight: new Uint8Array(size).fill(1),
                cx: cx,
                cz: cz,
                startX: cx * CHUNK_SIZE,
                startZ: cz * CHUNK_SIZE,
            };
            this.chunks.set(key, chunk);
            this.activeChunks.add(key);
        } else if (!chunk.blocks) {
            // Upgrade legacy chunk format to include lighting buffers
            const legacy = chunk;
            const legacySize = legacy.length || CHUNK_VOLUME;
            chunk = {
                blocks: legacy,
                skyLight: new Uint8Array(legacySize).fill(15),
                blockLight: new Uint8Array(legacySize).fill(1),
            };
            this.chunks.set(key, chunk);
        } else {
            if (!chunk.skyLight) chunk.skyLight = new Uint8Array(chunk.blocks.length).fill(15);
            if (!chunk.blockLight) chunk.blockLight = new Uint8Array(chunk.blocks.length).fill(1);
        }

        // OPTIMIZATION: Bitwise for local coords and index
        const lx = x & 15;
        const lz = z & 15;
        const idx = lx + (lz << 4) + (ly << 8);
        const oldId = chunk.blocks ? chunk.blocks[idx] : chunk[idx];
        if (oldId === blockId) return false;

        if (chunk.blocks) { chunk.blocks[idx] = blockId; } else { chunk[idx] = blockId; }

        // Invalidate cache
        this._lastChunkKey = null;
        this._lastChunk = null;
        this.modifiedChunks.add(key);
        this.pristineChunks.delete(key);
        return true;
    }

    /**
     * Check if a block is solid (not air, water, or unloaded).
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @returns {boolean} True if block is solid
     */
    isSolidBlock(x, y, z) {
        const id = this.getBlock(x, y, z);
        return id !== AIR && id !== WATER && id !== undefined;
    }

    // =====================================================
    // LIGHTING ACCESS
    // =====================================================

    /**
     * Get sky light level at world coordinates.
     * HOT PATH - uses bitwise ops and chunk cache.
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @returns {number} Sky light level (1-15)
     */
    getSkyLight(x, y, z) {
        if (isDebug) this._callCounts.getSkyLight++;
        const ly = y + Y_OFFSET;
        if (ly < 0) return 1;
        if (ly >= CHUNK_HEIGHT) return 15;
        // OPTIMIZATION: Bitwise divide by 16
        const cx = x >> 4;
        const cz = z >> 4;
        const key = `${cx},${cz}`;
        // OPTIMIZATION: Chunk cache for sequential light access
        const chunk = key === this._lastChunkKey ? this._lastChunk : this.chunks.get(key);
        if (!chunk || !chunk.skyLight) return 15;
        this._lastChunkKey = key;
        this._lastChunk = chunk;
        // OPTIMIZATION: Bitwise for local coords and index
        return chunk.skyLight[(x & 15) + ((z & 15) << 4) + (ly << 8)];
    }

    /**
     * Set sky light level at world coordinates.
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @param {number} level - Light level to set (1-15)
     * @returns {void}
     */
    setSkyLight(x, y, z, level) {
        if (isDebug) this._callCounts.setSkyLight++;
        const ly = y + Y_OFFSET;
        if (ly < 0 || ly >= CHUNK_HEIGHT) return;
        // OPTIMIZATION: Bitwise divide by 16
        const cx = x >> 4;
        const cz = z >> 4;
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        if (!chunk || !chunk.skyLight) return;
        const clamped = clamp(level, 1, 15);
        chunk.skyLight[(x & 15) + ((z & 15) << 4) + (ly << 8)] = clamped;
    }

    /**
     * Get block light level at world coordinates.
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @returns {number} Block light level (0-15)
     */
    getBlockLight(x, y, z) {
        if (isDebug) this._callCounts.getBlockLight++;
        const ly = y + Y_OFFSET;
        if (ly < 0 || ly >= CHUNK_HEIGHT) return 0;
        // OPTIMIZATION: Bitwise divide by 16
        const cx = x >> 4;
        const cz = z >> 4;
        const key = `${cx},${cz}`;
        // OPTIMIZATION: Chunk cache for sequential light access
        const chunk = key === this._lastChunkKey ? this._lastChunk : this.chunks.get(key);
        if (!chunk || !chunk.blockLight) return 0;
        this._lastChunkKey = key;
        this._lastChunk = chunk;
        // OPTIMIZATION: Bitwise for local coords and index
        return chunk.blockLight[(x & 15) + ((z & 15) << 4) + (ly << 8)];
    }

    /**
     * Set block light level at world coordinates.
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @param {number} level - Light level to set (0-15)
     * @returns {void}
     */
    setBlockLight(x, y, z, level) {
        if (isDebug) this._callCounts.setBlockLight++;
        const ly = y + Y_OFFSET;
        if (ly < 0 || ly >= CHUNK_HEIGHT) return;
        // OPTIMIZATION: Bitwise divide by 16
        const cx = x >> 4;
        const cz = z >> 4;
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        if (!chunk || !chunk.blockLight) return;
        const clamped = clamp(level, 0, 15);
        chunk.blockLight[(x & 15) + ((z & 15) << 4) + (ly << 8)] = clamped;
    }

    /**
     * Get combined light level (max of sky and block light).
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate
     * @returns {number} Combined light level
     */
    getLocalLight(x, y, z) {
        const sky = this.getSkyLight(x, y, z);
        const block = this.getBlockLight(x, y, z);
        return sky > block ? sky : block;  // Inline max
    }

    // =====================================================
    // NEIGHBOR HELPERS
    // =====================================================

    /**
     * Get all 8 neighboring chunks.
     * @param {number} cx - Center chunk X coordinate
     * @param {number} cz - Center chunk Z coordinate
     * @returns {{north: Object|undefined, south: Object|undefined, east: Object|undefined, west: Object|undefined, northWest: Object|undefined, northEast: Object|undefined, southWest: Object|undefined, southEast: Object|undefined}} Neighbor chunks
     */
    getNeighborChunks(cx, cz) {
        return {
            north: this.chunks.get(this.getChunkKey(cx, cz - 1)),
            south: this.chunks.get(this.getChunkKey(cx, cz + 1)),
            east: this.chunks.get(this.getChunkKey(cx + 1, cz)),
            west: this.chunks.get(this.getChunkKey(cx - 1, cz)),
            northWest: this.chunks.get(this.getChunkKey(cx - 1, cz - 1)),
            northEast: this.chunks.get(this.getChunkKey(cx + 1, cz - 1)),
            southWest: this.chunks.get(this.getChunkKey(cx - 1, cz + 1)),
            southEast: this.chunks.get(this.getChunkKey(cx + 1, cz + 1))
        };
    }

    // =====================================================
    // DEBUG UTILITIES
    // =====================================================

    /**
     * Get debug call statistics for hot-path verification.
     * @returns {Object} Call count statistics
     */
    getCallStats() {
        return { ...this._callCounts };
    }

    /**
     * Reset debug call counters (call at start of frame to measure per-frame calls).
     * @returns {void}
     */
    resetCallStats() {
        for (const key in this._callCounts) {
            this._callCounts[key] = 0;
        }
    }

    /**
     * Invalidate the chunk cache.
     * Call this when chunks are externally modified.
     * @returns {void}
     */
    invalidateCache() {
        this._lastChunkKey = null;
        this._lastChunk = null;
    }
}

export default VoxelWorld;

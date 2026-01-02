/**
 * Cache for chunk neighbor lookups.
 * Avoids repeated Map.get() calls during mesh building.
 * @module optimization/caches/ChunkNeighborCache
 */

/**
 * @typedef {Object} NeighborData
 * @property {Object|undefined} north - Chunk at (cx, cz-1)
 * @property {Object|undefined} south - Chunk at (cx, cz+1)
 * @property {Object|undefined} east - Chunk at (cx+1, cz)
 * @property {Object|undefined} west - Chunk at (cx-1, cz)
 * @property {Object|undefined} ne - Chunk at (cx+1, cz-1)
 * @property {Object|undefined} nw - Chunk at (cx-1, cz-1)
 * @property {Object|undefined} se - Chunk at (cx+1, cz+1)
 * @property {Object|undefined} sw - Chunk at (cx-1, cz+1)
 */

/**
 * Cache for chunk neighbor references.
 * Stores 8-direction neighbor data to avoid repeated Map lookups.
 */
export class ChunkNeighborCache {
    constructor() {
        /** @type {Map<string, NeighborData>} Cache of neighbor data by chunk key */
        this.cache = new Map();

        /** @type {number} Maximum cache size before eviction */
        this.maxSize = 64;

        /** Debug call counters for performance analysis */
        this._callCounts = {
            getNeighbors: 0,
            getNeighborsHit: 0,
            getNeighborsMiss: 0,
            invalidate: 0,
            invalidateDeletes: 0,
            clear: 0,
            evictions: 0
        };
    }

    /**
     * Get all 8 neighbors for a chunk.
     * Caches the result for future lookups.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {Map<string, Object>} chunks - Map of chunk key to chunk data
     * @returns {NeighborData} Object with all 8 neighbor chunks (or undefined if missing)
     */
    getNeighbors(cx, cz, chunks) {
        this._callCounts.getNeighbors++;
        const key = `${cx},${cz}`;

        if (this.cache.has(key)) {
            this._callCounts.getNeighborsHit++;
            return this.cache.get(key);
        }

        this._callCounts.getNeighborsMiss++;
        const neighbors = {
            north: chunks.get(`${cx},${cz - 1}`),
            south: chunks.get(`${cx},${cz + 1}`),
            east: chunks.get(`${cx + 1},${cz}`),
            west: chunks.get(`${cx - 1},${cz}`),
            ne: chunks.get(`${cx + 1},${cz - 1}`),
            nw: chunks.get(`${cx - 1},${cz - 1}`),
            se: chunks.get(`${cx + 1},${cz + 1}`),
            sw: chunks.get(`${cx - 1},${cz + 1}`)
        };

        // Evict oldest entry if at capacity (FIFO)
        if (this.cache.size >= this.maxSize) {
            this._callCounts.evictions++;
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, neighbors);
        return neighbors;
    }

    /**
     * Invalidate cache entries for a chunk and its neighbors.
     * Call this when a chunk is modified to ensure fresh neighbor data.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     */
    invalidate(cx, cz) {
        this._callCounts.invalidate++;
        // Invalidate this chunk and all neighbors
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (this.cache.delete(`${cx + dx},${cz + dz}`)) {
                    this._callCounts.invalidateDeletes++;
                }
            }
        }
    }

    /**
     * Clear all cached neighbor data.
     */
    clear() {
        this._callCounts.clear++;
        this.cache.clear();
    }

    /**
     * Returns cache statistics for debugging.
     * @returns {Object} Cache stats including size, hit rate, evictions
     */
    stats() {
        const hitRate = this._callCounts.getNeighbors > 0
            ? (this._callCounts.getNeighborsHit / this._callCounts.getNeighbors * 100).toFixed(1)
            : 0;

        return {
            cacheSize: this.cache.size,
            maxSize: this.maxSize,
            hitRate: `${hitRate}%`,
            evictions: this._callCounts.evictions,
            calls: { ...this._callCounts }
        };
    }

    /**
     * Get call statistics.
     * @returns {Object} Copy of call counts
     */
    getCallStats() {
        return { ...this._callCounts };
    }

    /**
     * Reset call statistics to zero.
     */
    resetCallStats() {
        for (const key in this._callCounts) {
            this._callCounts[key] = 0;
        }
    }
}

export default ChunkNeighborCache;

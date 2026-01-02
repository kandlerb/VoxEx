/**
 * Object pool for Uint8Array instances.
 * Reduces GC pressure during chunk operations by reusing allocated buffers.
 * @module optimization/pools/Uint8ArrayPool
 */

/**
 * Pool for reusing Uint8Array instances of various sizes.
 * Uses a Map keyed by size to store available buffers.
 */
export class Uint8ArrayPool {
    constructor() {
        /** @type {Map<number, Uint8Array[]>} size -> array of buffers */
        this.pools = new Map();

        /** Debug call counters for performance analysis */
        this._callCounts = {
            acquire: 0,
            acquireHit: 0,
            acquireMiss: 0,
            release: 0,
            releaseAccepted: 0,
            releaseRejected: 0
        };
    }

    /**
     * Acquire a Uint8Array of the specified size.
     * Returns a pooled array if available, otherwise creates a new one.
     * @param {number} size - Required array length
     * @returns {Uint8Array} Zero-filled array of requested size
     */
    acquire(size) {
        this._callCounts.acquire++;
        const pool = this.pools.get(size);
        if (pool && pool.length > 0) {
            this._callCounts.acquireHit++;
            const arr = pool.pop();
            arr.fill(0); // Reset to zeros
            return arr;
        }
        this._callCounts.acquireMiss++;
        return new Uint8Array(size);
    }

    /**
     * Release a Uint8Array back to the pool for reuse.
     * Very large arrays (>2MB) are not pooled to avoid memory bloat.
     * @param {Uint8Array} arr - Array to release
     */
    release(arr) {
        this._callCounts.release++;
        if (!arr || arr.length > 2000000) {
            this._callCounts.releaseRejected++;
            return; // Don't pool very large arrays
        }
        const size = arr.length;
        if (!this.pools.has(size)) this.pools.set(size, []);
        const pool = this.pools.get(size);
        if (pool.length < 32) {
            this._callCounts.releaseAccepted++;
            pool.push(arr); // Limit pool size
        } else {
            this._callCounts.releaseRejected++;
        }
    }

    /**
     * Returns pool statistics for debugging.
     * @returns {Object} Pool stats including sizes, counts, and hit rates
     */
    stats() {
        const poolStats = {};
        let totalPooled = 0;
        let totalBytes = 0;

        for (const [size, pool] of this.pools) {
            poolStats[size] = pool.length;
            totalPooled += pool.length;
            totalBytes += size * pool.length;
        }

        const hitRate = this._callCounts.acquire > 0
            ? (this._callCounts.acquireHit / this._callCounts.acquire * 100).toFixed(1)
            : 0;

        return {
            pools: poolStats,
            totalPooled,
            totalBytes,
            totalBytesMB: (totalBytes / (1024 * 1024)).toFixed(2),
            hitRate: `${hitRate}%`,
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

export default Uint8ArrayPool;

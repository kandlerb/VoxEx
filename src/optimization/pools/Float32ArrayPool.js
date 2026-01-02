/**
 * Object pool for Float32Array instances.
 * Reduces GC pressure during mesh building by reusing geometry buffers.
 * @module optimization/pools/Float32ArrayPool
 */

/**
 * Pool for reusing Float32Array instances.
 * Used for position, normal, UV, and color buffers in chunk meshes.
 */
export class Float32ArrayPool {
    /**
     * Create a new Float32ArrayPool.
     * @param {number} [initialSize=10000] - Default array size for new allocations
     */
    constructor(initialSize = 10000) {
        /** @type {Float32Array[]} Available buffers */
        this.pool = [];

        /** @type {number} Default size for new allocations */
        this.initialSize = initialSize;

        /** @type {number} Maximum pool size to prevent memory bloat */
        this.maxPoolSize = 64;

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
     * Acquire a Float32Array of at least the specified minimum length.
     * Uses swap-and-pop for O(1) removal.
     * @param {number} minLength - Minimum required array length
     * @returns {Float32Array} Array with length >= minLength
     */
    acquire(minLength) {
        this._callCounts.acquire++;
        const pool = this.pool;
        for (let i = 0; i < pool.length; i++) {
            if (pool[i].length >= minLength) {
                this._callCounts.acquireHit++;
                // Swap-and-pop: O(1) removal instead of splice O(n)
                const arr = pool[i];
                pool[i] = pool[pool.length - 1];
                pool.pop();
                return arr;
            }
        }
        this._callCounts.acquireMiss++;
        return new Float32Array(Math.max(this.initialSize, minLength));
    }

    /**
     * Release a Float32Array back to the pool for reuse.
     * Very large arrays (>1MB) are not pooled.
     * @param {Float32Array} arr - Array to release
     */
    release(arr) {
        this._callCounts.release++;
        if (arr.length > 1000000 || this.pool.length >= this.maxPoolSize) {
            this._callCounts.releaseRejected++;
            return; // Don't pool very large arrays or exceed pool limit
        }
        this._callCounts.releaseAccepted++;
        this.pool.push(arr);
    }

    /**
     * Returns pool statistics for debugging.
     * @returns {Object} Pool stats including sizes, counts, and hit rates
     */
    stats() {
        const hitRate = this._callCounts.acquire > 0
            ? (this._callCounts.acquireHit / this._callCounts.acquire * 100).toFixed(1)
            : 0;

        let totalBytes = 0;
        for (let i = 0; i < this.pool.length; i++) {
            totalBytes += this.pool[i].byteLength;
        }

        return {
            poolSize: this.pool.length,
            maxPoolSize: this.maxPoolSize,
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

export default Float32ArrayPool;

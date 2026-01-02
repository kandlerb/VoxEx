/**
 * Object pool for Uint32Array instances.
 * Reduces GC pressure during mesh building by reusing index buffers.
 * @module optimization/pools/Uint32ArrayPool
 */

/**
 * Pool for reusing Uint32Array instances.
 * Used for index buffers in indexed geometry (supports large vertex counts).
 */
export class Uint32ArrayPool {
    /**
     * Create a new Uint32ArrayPool.
     * @param {number} [initialSize=10000] - Default array size for new allocations
     */
    constructor(initialSize = 10000) {
        /** @type {Uint32Array[]} Available buffers */
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
     * Acquire a Uint32Array of at least the specified minimum length.
     * Uses swap-and-pop for O(1) removal.
     * @param {number} minLength - Minimum required array length
     * @returns {Uint32Array} Array with length >= minLength
     */
    acquire(minLength) {
        this._callCounts.acquire++;
        for (let i = 0; i < this.pool.length; i++) {
            if (this.pool[i].length >= minLength) {
                this._callCounts.acquireHit++;
                const arr = this.pool[i];
                this.pool[i] = this.pool[this.pool.length - 1];
                this.pool.pop();
                return arr;
            }
        }
        this._callCounts.acquireMiss++;
        return new Uint32Array(Math.max(this.initialSize, minLength));
    }

    /**
     * Release a Uint32Array back to the pool for reuse.
     * Very large arrays (>1MB elements) are not pooled.
     * @param {Uint32Array} arr - Array to release
     */
    release(arr) {
        this._callCounts.release++;
        if (arr.length > 1000000 || this.pool.length >= this.maxPoolSize) {
            this._callCounts.releaseRejected++;
            return;
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

export default Uint32ArrayPool;

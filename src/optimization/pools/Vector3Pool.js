/**
 * Object pool for Three.js Vector3 instances.
 * Reduces GC pressure during raycasting and physics calculations.
 * @module optimization/pools/Vector3Pool
 */

import { Vector3 } from 'three';

/**
 * Pool for reusing Vector3 instances.
 * Uses a simple linear pool with active count tracking.
 */
export class Vector3Pool {
    /**
     * Create a new Vector3Pool.
     * @param {number} [initialSize=32] - Initial pool size
     */
    constructor(initialSize = 32) {
        /** @type {Vector3[]} Pool of Vector3 instances */
        this.pool = [];

        /** @type {number} Number of currently active (acquired) vectors */
        this.active = 0;

        // Pre-allocate initial vectors
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new Vector3());
        }

        /** Debug call counters for performance analysis */
        this._callCounts = {
            acquire: 0,
            acquireHit: 0,
            acquireGrow: 0,
            release: 0,
            releaseAll: 0,
            peakActive: 0
        };
    }

    /**
     * Acquire a Vector3 from the pool.
     * Returns a zeroed vector ready for use.
     * @returns {Vector3} A reset Vector3 instance
     */
    acquire() {
        this._callCounts.acquire++;
        if (this.active < this.pool.length) {
            this._callCounts.acquireHit++;
            const v = this.pool[this.active++];
            if (this.active > this._callCounts.peakActive) {
                this._callCounts.peakActive = this.active;
            }
            return v.set(0, 0, 0);
        }
        this._callCounts.acquireGrow++;
        const v = new Vector3();
        this.pool.push(v);
        this.active++;
        if (this.active > this._callCounts.peakActive) {
            this._callCounts.peakActive = this.active;
        }
        return v;
    }

    /**
     * Release a single vector (decrements active count).
     * Note: Pool is reused in order, so individual release is a no-op.
     * Use releaseAll() at end of frame for bulk release.
     * @param {Vector3} _v - Vector to release (unused, kept for API consistency)
     */
    release(_v) {
        this._callCounts.release++;
        // Just decrement active count - pool is reused in order
    }

    /**
     * Release all vectors back to the pool.
     * Call this at the end of each frame to reset the pool.
     */
    releaseAll() {
        this._callCounts.releaseAll++;
        this.active = 0;
    }

    /**
     * Returns pool statistics for debugging.
     * @returns {Object} Pool stats including size, active count, and hit rates
     */
    stats() {
        const hitRate = this._callCounts.acquire > 0
            ? (this._callCounts.acquireHit / this._callCounts.acquire * 100).toFixed(1)
            : 0;

        return {
            poolSize: this.pool.length,
            active: this.active,
            peakActive: this._callCounts.peakActive,
            hitRate: `${hitRate}%`,
            growCount: this._callCounts.acquireGrow,
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
     * Reset call statistics to zero (except peakActive).
     */
    resetCallStats() {
        for (const key in this._callCounts) {
            if (key !== 'peakActive') {
                this._callCounts[key] = 0;
            }
        }
    }
}

export default Vector3Pool;

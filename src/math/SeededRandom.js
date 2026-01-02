/**
 * VoxEx Seeded Random Number Generator
 * Deterministic PRNG for reproducible world generation.
 * @module math/SeededRandom
 */

/**
 * Seeded random number generator class.
 * Uses a fast, high-quality hash-based algorithm for deterministic random numbers.
 */
export class SeededRandom {
    /**
     * Create a seeded random generator
     * @param {number|string} seed - Numeric or string seed
     */
    constructor(seed) {
        if (typeof seed === "string") {
            // String hash using multiplication
            let h = 0xdeadbeef;
            for (let i = 0; i < seed.length; i++) {
                h = Math.imul(h ^ seed.charCodeAt(i), 2.654435761e9);
                h = (h ^ (h >>> 16)) >>> 0;
            }
            this.seed = h;
        } else {
            this.seed = seed >>> 0;
        }

        // Debug call counter (disabled by default for hot path performance)
        // Enable with: rng._enableStats = true
        this._enableStats = false;
        this._callCount = 0;
    }

    /**
     * Get next random value in range [0, 1)
     * @returns {number} Random float between 0 and 1
     */
    next() {
        if (this._enableStats) this._callCount++;
        let t = (this.seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4.294967296e9;
    }

    /**
     * Alias for next() for API clarity
     * @returns {number} Random float between 0 and 1
     */
    nextFloat() {
        return this.next();
    }

    /**
     * Get random integer in range [0, max)
     * @param {number} max - Exclusive upper bound
     * @returns {number} Random integer
     */
    nextInt(max) {
        return (this.next() * max) | 0;
    }

    /**
     * Get random integer in range [min, max]
     * @param {number} min - Inclusive lower bound
     * @param {number} max - Inclusive upper bound
     * @returns {number} Random integer
     */
    nextIntRange(min, max) {
        return min + ((this.next() * (max - min + 1)) | 0);
    }

    /**
     * Get random float in range [min, max)
     * @param {number} min - Inclusive lower bound
     * @param {number} max - Exclusive upper bound
     * @returns {number} Random float
     */
    nextFloatRange(min, max) {
        return min + this.next() * (max - min);
    }

    /**
     * Get random boolean with probability
     * @param {number} [probability=0.5] - Probability of true
     * @returns {boolean} Random boolean
     */
    nextBool(probability = 0.5) {
        return this.next() < probability;
    }

    /**
     * Pick random element from array
     * @param {Array} array - Array to pick from
     * @returns {*} Random element
     */
    pick(array) {
        return array[this.nextInt(array.length)];
    }

    /**
     * Shuffle array in place using Fisher-Yates
     * @param {Array} array - Array to shuffle
     * @returns {Array} The shuffled array (same reference)
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextInt(i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Get call statistics (only useful if _enableStats = true)
     * @returns {Object} Statistics object
     */
    stats() {
        return {
            seed: this.seed,
            callCount: this._callCount,
            statsEnabled: this._enableStats
        };
    }

    /**
     * Reset call statistics
     */
    resetCallStats() {
        this._callCount = 0;
    }

    /**
     * Fork this generator to create an independent copy
     * @param {number} [offset=0] - Offset to add to seed
     * @returns {SeededRandom} New independent generator
     */
    fork(offset = 0) {
        return new SeededRandom(this.seed + offset);
    }
}

/**
 * Create a position-based seeded random value
 * Useful for deterministic random values at world positions
 * @param {number} seed - World seed
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} [y=0] - Y coordinate (optional)
 * @param {number} [w=0] - Additional dimension (optional)
 * @param {number} [salt=0] - Salt value for different random streams
 * @returns {number} Random value in range [0, 1)
 */
export function seededRandom(seed, x, z, y = 0, w = 0, salt = 0) {
    // Combine coordinates into a single seed
    let h = seed >>> 0;
    h = Math.imul(h ^ ((x | 0) * 374761393), 668265263);
    h = Math.imul(h ^ ((z | 0) * 668265263), 374761393);
    h = Math.imul(h ^ ((y | 0) * 1013904223), 1664525);
    h = Math.imul(h ^ ((w | 0) * 1664525), 1013904223);
    h = Math.imul(h ^ (salt | 0), 2654435761);
    h ^= h >>> 16;
    h = Math.imul(h, 2654435761);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

export default SeededRandom;

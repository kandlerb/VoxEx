/**
 * VoxEx Noise Functions
 * Perlin noise implementation for terrain generation.
 * @module math/noise
 */

// Permutation table for noise generation
const perm = new Uint8Array(512);
const p = new Uint8Array(256).map((_, i) => i);

/**
 * Initialize the permutation table with a seed
 * @param {number} seed - Seed value for shuffling
 */
export function initNoise(seed) {
    // Fisher-Yates shuffle with seed
    let s = seed >>> 0;
    for (let i = 255; i > 0; i--) {
        // Simple LCG for shuffle
        s = (s * 1664525 + 1013904223) >>> 0;
        const j = s % (i + 1);
        [p[i], p[j]] = [p[j], p[i]];
    }
    // Duplicate for wrap-around
    for (let i = 0; i < 256; i++) {
        perm[i] = p[i];
        perm[i + 256] = p[i];
    }
}

// Initialize with default seed
initNoise(0);

/**
 * Fade function for smooth interpolation (quintic curve)
 * @param {number} t - Input value (0-1)
 * @returns {number} Smoothed value
 */
function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation
 * @param {number} t - Interpolation factor (0-1)
 * @param {number} a - Start value
 * @param {number} b - End value
 * @returns {number} Interpolated value
 */
function lerp(t, a, b) {
    return a + t * (b - a);
}

/**
 * 2D gradient function
 * @param {number} h - Hash value
 * @param {number} x - X offset
 * @param {number} y - Y offset
 * @returns {number} Gradient contribution
 */
function grad2D(h, x, y) {
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * 3D gradient function
 * @param {number} hash - Hash value
 * @param {number} x - X offset
 * @param {number} y - Y offset
 * @param {number} z - Z offset
 * @returns {number} Gradient contribution
 */
function grad3D(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

// Fade lookup table for optimization
const FADE_LUT_SIZE = 256;
const fadeLUT = new Float32Array(FADE_LUT_SIZE);
for (let i = 0; i < FADE_LUT_SIZE; i++) {
    const t = i / (FADE_LUT_SIZE - 1);
    fadeLUT[i] = t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Fast fade using lookup table
 * @param {number} t - Input value (0-1)
 * @returns {number} Smoothed value
 */
function fadeFast(t) {
    const idx = (t * (FADE_LUT_SIZE - 1)) | 0;
    return fadeLUT[Math.min(idx, FADE_LUT_SIZE - 1)];
}

/**
 * 2D Perlin noise
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {number} Noise value (-1 to 1)
 */
export function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fadeFast(x);
    const v = fadeFast(y);
    const A = perm[X] + Y;
    const B = perm[X + 1] + Y;
    return lerp(
        v,
        lerp(u, grad2D(perm[A], x, y), grad2D(perm[B], x - 1, y)),
        lerp(u, grad2D(perm[A + 1], x, y - 1), grad2D(perm[B + 1], x - 1, y - 1))
    );
}

/**
 * 3D Perlin noise
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {number} Noise value (-1 to 1)
 */
export function noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fadeFast(x);
    const v = fadeFast(y);
    const w = fadeFast(z);
    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    return lerp(
        w,
        lerp(
            v,
            lerp(u, grad3D(perm[AA], x, y, z), grad3D(perm[BA], x - 1, y, z)),
            lerp(u, grad3D(perm[AB], x, y - 1, z), grad3D(perm[BB], x - 1, y - 1, z))
        ),
        lerp(
            v,
            lerp(u, grad3D(perm[AA + 1], x, y, z - 1), grad3D(perm[BA + 1], x - 1, y, z - 1)),
            lerp(u, grad3D(perm[AB + 1], x, y - 1, z - 1), grad3D(perm[BB + 1], x - 1, y - 1, z - 1))
        )
    );
}

/**
 * Fractal Brownian Motion (fBm) for 2D
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate (using z for terrain convention)
 * @param {number} [octaves=4] - Number of noise octaves
 * @param {number} [persistence=0.5] - Amplitude decay per octave
 * @param {number} [lacunarity=2.0] - Frequency increase per octave
 * @returns {number} Noise value
 */
export function fbm2D(x, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
        total += noise2D(x * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    return total / maxValue;
}

/**
 * fBm with domain warping for more organic terrain
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} [octaves=4] - Number of noise octaves
 * @param {number} [persistence=0.5] - Amplitude decay per octave
 * @param {number} [lacunarity=2.0] - Frequency increase per octave
 * @returns {number} Noise value
 */
export function fbmWithDomainWarp(x, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    const warpScale = 0.03;
    const offsetX = fbm2D(x * warpScale, z * warpScale, 3, 0.5, 2.0) * 20;
    const offsetZ = fbm2D((x + 100) * warpScale, (z + 100) * warpScale, 3, 0.5, 2.0) * 20;
    return fbm2D(x + offsetX, z + offsetZ, octaves, persistence, lacunarity);
}

/**
 * Tree placement noise
 * @param {number} gx - Global X coordinate
 * @param {number} gz - Global Z coordinate
 * @param {number} seed - World seed
 * @returns {number} Noise value for tree placement
 */
export function treeNoise(gx, gz, seed) {
    return noise2D(gx * 0.07 + seed * 31.7, gz * 0.07 - seed * 12.3);
}

/**
 * Tree placement value combining hash and noise
 * @param {number} gx - Global X coordinate
 * @param {number} gz - Global Z coordinate
 * @param {number} seed - World seed
 * @returns {number} Value 0-1 for tree placement threshold
 */
export function treePlacementValue(gx, gz, seed) {
    const h = Math.sin(gx * 12.9898 + gz * 78.233 + seed * 0.12345);
    const base = h - Math.floor(h);
    const warp = noise2D(gx * 0.05 + seed * 7.31, gz * 0.05 - seed * 3.17) * 0.3;
    const combined = base + warp;
    return combined - Math.floor(combined);
}

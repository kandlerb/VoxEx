/**
 * Cave and underground structure generation
 * @module world/generation/CaveGenerator
 */

import { noise2D, noise3D } from '../../math/noise.js';
import { AIR, BEDROCK, WATER } from '../../core/constants.js';

/**
 * Cave generation configuration
 * @type {Object}
 */
export const CAVE_CONFIG = {
    /** Minimum Y for cave generation */
    minY: 5,
    /** Y level where caves start to fade */
    fadeStart: 30,
    /** Y level where caves completely stop */
    fadeEnd: 50,
    /** Base cave threshold */
    baseThreshold: 0.015,
    /** Additional threshold variation */
    thresholdVariation: 0.025,
    /** Default cave density multiplier */
    defaultDensityMultiplier: 1.0,
};

/**
 * Pre-calculate 3D cave noise for a chunk
 * Uses lower resolution sampling with trilinear interpolation
 *
 * @param {number} chunkSize - Chunk size (16)
 * @param {number} chunkHeight - Chunk height (320)
 * @param {number} startX - World X start position
 * @param {number} startZ - World Z start position
 * @returns {{caveCache1: Float32Array, caveCache2: Float32Array, widthNoiseCache: Float32Array, cxDim: number, czDim: number, cyDim: number, cxzStride: number}}
 */
export function precalculateCaveNoise(chunkSize, chunkHeight, startX, startZ) {
    // Sample at 1/4 resolution (every 4 blocks)
    const step = 4;
    const cxDim = Math.ceil(chunkSize / step) + 1;
    const czDim = Math.ceil(chunkSize / step) + 1;
    const cyDim = Math.ceil(chunkHeight / step) + 1;
    const cxzStride = cxDim * czDim;

    const caveCache1 = new Float32Array(cxDim * czDim * cyDim);
    const caveCache2 = new Float32Array(cxDim * czDim * cyDim);

    // Sample 3D noise at grid points
    for (let cz = 0; cz < czDim; cz++) {
        for (let cx = 0; cx < cxDim; cx++) {
            for (let cy = 0; cy < cyDim; cy++) {
                const wx = startX + cx * step;
                const wy = cy * step;
                const wz = startZ + cz * step;

                const idx = cx + cz * cxDim + cy * cxzStride;
                caveCache1[idx] = noise3D(wx * 0.02, wy * 0.02, wz * 0.02);
                caveCache2[idx] = noise3D(wx * 0.02 + 100, wy * 0.02 + 100, wz * 0.02 + 100);
            }
        }
    }

    // 2D width noise cache
    const widthNoiseCache = new Float32Array(chunkSize * chunkSize);
    for (let lz = 0; lz < chunkSize; lz++) {
        for (let lx = 0; lx < chunkSize; lx++) {
            const wx = startX + lx;
            const wz = startZ + lz;
            widthNoiseCache[lx + lz * chunkSize] = noise2D(wx * 0.01, wz * 0.01);
        }
    }

    return { caveCache1, caveCache2, widthNoiseCache, cxDim, czDim, cyDim, cxzStride };
}

/**
 * Interpolate cave noise at a specific position using trilinear interpolation
 *
 * @param {number} lx - Local X (0-15)
 * @param {number} ly - Local Y (0-319)
 * @param {number} lz - Local Z (0-15)
 * @param {Float32Array} cache - Pre-computed noise cache
 * @param {number} cxDim - Cache X dimension
 * @param {number} cxzStride - XZ stride in cache
 * @returns {number} Interpolated noise value
 */
export function interpolateCaveNoise(lx, ly, lz, cache, cxDim, cxzStride) {
    const step = 4;

    // Grid coordinates
    const gx = lx / step;
    const gy = ly / step;
    const gz = lz / step;

    // Integer grid positions
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const z0 = Math.floor(gz);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;

    // Interpolation factors
    const fx = gx - x0;
    const fy = gy - y0;
    const fz = gz - z0;

    // Get 8 corner values
    const c000 = cache[x0 + z0 * cxDim + y0 * cxzStride];
    const c100 = cache[x1 + z0 * cxDim + y0 * cxzStride];
    const c010 = cache[x0 + z1 * cxDim + y0 * cxzStride];
    const c110 = cache[x1 + z1 * cxDim + y0 * cxzStride];
    const c001 = cache[x0 + z0 * cxDim + y1 * cxzStride];
    const c101 = cache[x1 + z0 * cxDim + y1 * cxzStride];
    const c011 = cache[x0 + z1 * cxDim + y1 * cxzStride];
    const c111 = cache[x1 + z1 * cxDim + y1 * cxzStride];

    // Trilinear interpolation
    const c00 = c000 + (c100 - c000) * fx;
    const c10 = c010 + (c110 - c010) * fx;
    const c01 = c001 + (c101 - c001) * fx;
    const c11 = c011 + (c111 - c011) * fx;

    const c0 = c00 + (c10 - c00) * fz;
    const c1 = c01 + (c11 - c01) * fz;

    return c0 + (c1 - c0) * fy;
}

/**
 * Check if a position should be carved as a cave
 *
 * @param {number} worldY - World Y position
 * @param {number} n1 - First noise value (interpolated)
 * @param {number} n2 - Second noise value (interpolated)
 * @param {number} widthNoise - Width variation noise
 * @param {number} [densityMultiplier=1.0] - Cave density multiplier
 * @returns {boolean} True if position should be a cave
 */
export function shouldCarveCave(worldY, n1, n2, widthNoise, densityMultiplier = 1.0) {
    const { fadeStart, fadeEnd, baseThreshold, thresholdVariation } = CAVE_CONFIG;

    if (worldY >= fadeEnd) return false;

    let threshold = (baseThreshold + (widthNoise * 0.5 + 0.5) * thresholdVariation) * densityMultiplier;

    // Surface fading
    if (worldY > fadeStart) {
        const fade = 1.0 - (worldY - fadeStart) / (fadeEnd - fadeStart);
        threshold *= fade;
    }

    // Carve using vector magnitude (Swiss cheese caves)
    return n1 * n1 + n2 * n2 < threshold;
}

/**
 * Carve caves into chunk terrain data
 *
 * @param {Uint8Array} blocks - Chunk block data
 * @param {number} chunkSize - Chunk size
 * @param {number} chunkHeight - Chunk height
 * @param {number} yOffset - Y offset for world coordinates
 * @param {Object} caveCaches - Pre-calculated cave noise caches
 * @param {number} [densityMultiplier=1.0] - Cave density multiplier
 */
export function carveCaves(blocks, chunkSize, chunkHeight, yOffset, caveCaches, densityMultiplier = 1.0) {
    const { caveCache1, caveCache2, widthNoiseCache, cxDim, cxzStride } = caveCaches;
    const { fadeEnd } = CAVE_CONFIG;

    for (let lx = 0; lx < chunkSize; lx++) {
        for (let lz = 0; lz < chunkSize; lz++) {
            const idx2D = lx + lz * chunkSize;
            const widthNoise = widthNoiseCache[idx2D];

            for (let ly = 0; ly < chunkHeight; ly++) {
                const worldY = ly - yOffset;
                if (worldY >= fadeEnd) continue;

                const idx = lx + lz * chunkSize + ly * chunkSize * chunkSize;
                const blockId = blocks[idx];

                // Don't carve through air, bedrock, or water
                if (blockId === AIR || blockId === BEDROCK || blockId === WATER) continue;

                const n1 = interpolateCaveNoise(lx, ly, lz, caveCache1, cxDim, cxzStride);
                const n2 = interpolateCaveNoise(lx, ly, lz, caveCache2, cxDim, cxzStride);

                if (shouldCarveCave(worldY, n1, n2, widthNoise, densityMultiplier)) {
                    blocks[idx] = AIR;
                }
            }
        }
    }
}

/**
 * Check if a specific world position is inside a cave
 * Useful for determining spawn positions or structure placement
 *
 * @param {number} x - World X
 * @param {number} y - World Y
 * @param {number} z - World Z
 * @returns {boolean} True if position is inside a cave
 */
export function isCaveAt(x, y, z) {
    const { fadeStart, fadeEnd, baseThreshold } = CAVE_CONFIG;

    if (y >= fadeEnd || y < 5) return false;

    const n1 = noise3D(x * 0.02, y * 0.02, z * 0.02);
    const n2 = noise3D(x * 0.02 + 100, y * 0.02 + 100, z * 0.02 + 100);
    const widthNoise = noise2D(x * 0.01, z * 0.01);

    let threshold = baseThreshold + (widthNoise * 0.5 + 0.5) * 0.025;

    if (y > fadeStart) {
        const fade = 1.0 - (y - fadeStart) / (fadeEnd - fadeStart);
        threshold *= fade;
    }

    return n1 * n1 + n2 * n2 < threshold;
}

/**
 * Get cave density at a position (for lighting/visibility calculations)
 *
 * @param {number} x - World X
 * @param {number} y - World Y
 * @param {number} z - World Z
 * @returns {number} Cave density 0-1 (0 = solid, 1 = open cave)
 */
export function getCaveDensity(x, y, z) {
    const { fadeStart, fadeEnd, baseThreshold } = CAVE_CONFIG;

    if (y >= fadeEnd || y < 5) return 0;

    const n1 = noise3D(x * 0.02, y * 0.02, z * 0.02);
    const n2 = noise3D(x * 0.02 + 100, y * 0.02 + 100, z * 0.02 + 100);
    const widthNoise = noise2D(x * 0.01, z * 0.01);

    let threshold = baseThreshold + (widthNoise * 0.5 + 0.5) * 0.025;

    if (y > fadeStart) {
        const fade = 1.0 - (y - fadeStart) / (fadeEnd - fadeStart);
        threshold *= fade;
    }

    const caveValue = n1 * n1 + n2 * n2;
    if (caveValue >= threshold) return 0;

    // Return how "deep" into the cave we are
    return 1 - (caveValue / threshold);
}

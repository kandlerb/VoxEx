/**
 * Ambient Occlusion calculation for chunk mesh generation.
 * Provides face-based AO with caching for performance.
 * @module render/meshing/AmbientOcclusion
 */

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config/WorldConfig.js';
import { SETTINGS } from '../../config/Settings.js';
import { WATER } from '../../core/constants.js';

// =====================================================
// AO Constants
// =====================================================

/**
 * AO brightness values based on occlusion count.
 * Index is number of occluding blocks (0-3).
 * @type {number[]}
 */
export const AO_LOOKUP = [
    1.0,   // 0 occlusions: Full brightness
    0.85,  // 1 occlusion: Slight darkening
    0.7,   // 2 occlusions: Moderate darkening
    0.5,   // 3 occlusions: Deep corners
];

/**
 * Pre-computed AO vertex offset configurations for each face.
 * Each face has 4 vertices, each vertex has 9 offsets:
 * [s1x, s1y, s1z, s2x, s2y, s2z, cx, cy, cz]
 * where s1/s2 are edge neighbors and c is corner neighbor.
 * @type {Object<string, number[][]>}
 */
export const AO_FACE_CONFIGS = {
    top: [
        [-1, 1, 0, 0, 1, 1, -1, 1, 1],   // ao1
        [1, 1, 0, 0, 1, 1, 1, 1, 1],     // ao2
        [1, 1, 0, 0, 1, -1, 1, 1, -1],   // ao3
        [-1, 1, 0, 0, 1, -1, -1, 1, -1]  // ao4
    ],
    bottom: [
        [-1, -1, 0, 0, -1, -1, -1, -1, -1],
        [1, -1, 0, 0, -1, -1, 1, -1, -1],
        [1, -1, 0, 0, -1, 1, 1, -1, 1],
        [-1, -1, 0, 0, -1, 1, -1, -1, 1]
    ],
    right: [
        [1, -1, 0, 1, 0, 1, 1, -1, 1],
        [1, -1, 0, 1, 0, -1, 1, -1, -1],
        [1, 1, 0, 1, 0, -1, 1, 1, -1],
        [1, 1, 0, 1, 0, 1, 1, 1, 1]
    ],
    left: [
        [-1, -1, 0, -1, 0, -1, -1, -1, -1],
        [-1, -1, 0, -1, 0, 1, -1, -1, 1],
        [-1, 1, 0, -1, 0, 1, -1, 1, 1],
        [-1, 1, 0, -1, 0, -1, -1, 1, -1]
    ],
    back: [
        [-1, 0, 1, 0, -1, 1, -1, -1, 1],
        [1, 0, 1, 0, -1, 1, 1, -1, 1],
        [1, 0, 1, 0, 1, 1, 1, 1, 1],
        [-1, 0, 1, 0, 1, 1, -1, 1, 1]
    ],
    front: [
        [1, 0, -1, 0, -1, -1, 1, -1, -1],
        [-1, 0, -1, 0, -1, -1, -1, -1, -1],
        [-1, 0, -1, 0, 1, -1, -1, 1, -1],
        [1, 0, -1, 0, 1, -1, 1, 1, -1]
    ]
};

// =====================================================
// AO Cache
// =====================================================

/** AO cache size for full chunk with 6 face directions */
const AO_CACHE_SIZE = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE * 6;

/** @type {Float32Array|null} */
let aoCache = null;

/** Whether the AO cache is currently valid */
let aoCacheValid = false;

/** Reusable array to avoid allocation in hot path */
const _aoResult = [1, 1, 1, 1];

/**
 * Initialize the AO cache for a new chunk render.
 * @returns {void}
 */
export function initAOCache() {
    if (!aoCache) {
        aoCache = new Float32Array(AO_CACHE_SIZE);
    }
    aoCache.fill(-1); // -1 means uncached
    aoCacheValid = true;
}

/**
 * Invalidate the AO cache.
 * @returns {void}
 */
export function clearAOCache() {
    aoCacheValid = false;
}

/**
 * Calculate cache key for AO values.
 * @param {number} lx - Local X coordinate
 * @param {number} ly - Local Y coordinate
 * @param {number} lz - Local Z coordinate
 * @param {number} faceIdx - Face index (0-5)
 * @returns {number} Cache key
 */
function getAOCacheKey(lx, ly, lz, faceIdx) {
    return ((lx & 15) + ((lz & 15) << 4) + (ly << 8)) * 6 + faceIdx;
}

// =====================================================
// AO Calculation Functions
// =====================================================

/**
 * Get AO vertex offset configuration for a face based on its normal.
 * @param {number} nx - Face normal X component
 * @param {number} ny - Face normal Y component
 * @param {number} nz - Face normal Z component
 * @returns {number[][]} Array of 4 vertex offset configurations
 */
export function getAOConfig(nx, ny, nz) {
    if (ny > 0) return AO_FACE_CONFIGS.top;
    if (ny < 0) return AO_FACE_CONFIGS.bottom;
    if (nx > 0) return AO_FACE_CONFIGS.right;
    if (nx < 0) return AO_FACE_CONFIGS.left;
    if (nz > 0) return AO_FACE_CONFIGS.back;
    return AO_FACE_CONFIGS.front;
}

/**
 * Calculate AO value for a single vertex based on adjacent blocks.
 * @param {number} lx - Local X coordinate
 * @param {number} ly - Local Y coordinate
 * @param {number} lz - Local Z coordinate
 * @param {number[]} offsets - Array of 9 offset values [s1x, s1y, s1z, s2x, s2y, s2z, cx, cy, cz]
 * @param {Function} getter - Block getter function (lx, ly, lz) => blockId
 * @param {Uint8Array} isTransparent - Transparency lookup array
 * @returns {number} AO value (0.5-1.0)
 */
export function calculateVertexAO(lx, ly, lz, offsets, getter, isTransparent) {
    const s1 = isTransparent[getter(lx + offsets[0], ly + offsets[1], lz + offsets[2])] ? 0 : 1;
    const s2 = isTransparent[getter(lx + offsets[3], ly + offsets[4], lz + offsets[5])] ? 0 : 1;
    const c = isTransparent[getter(lx + offsets[6], ly + offsets[7], lz + offsets[8])] ? 0 : 1;
    const occlusionCount = s1 + s2 + c;
    return AO_LOOKUP[occlusionCount];
}

/**
 * Calculate all 4 AO values for a face with caching.
 * @param {number} nx - Face normal X component
 * @param {number} ny - Face normal Y component
 * @param {number} nz - Face normal Z component
 * @param {number} lx - Local X coordinate
 * @param {number} ly - Local Y coordinate
 * @param {number} lz - Local Z coordinate
 * @param {number} blockId - Block ID at this position
 * @param {Function} getter - Block getter function (lx, ly, lz) => blockId
 * @param {Uint8Array} isTransparent - Transparency lookup array
 * @param {number} [faceIdx] - Face index for caching (0-5)
 * @returns {number[]} Array of 4 AO values for face corners
 */
export function calculateFaceAO(nx, ny, nz, lx, ly, lz, blockId, getter, isTransparent, faceIdx) {
    // Skip AO for water or if AO is disabled
    if (!SETTINGS.AO || blockId === WATER) {
        return [1, 1, 1, 1];
    }

    // Check cache
    if (aoCacheValid && lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && ly >= 0 && ly < CHUNK_HEIGHT && faceIdx !== undefined) {
        const cacheKey = getAOCacheKey(lx, ly, lz, faceIdx);
        if (cacheKey < AO_CACHE_SIZE) {
            const cached = aoCache[cacheKey];
            if (cached >= 0) {
                // Unpack cached values
                const packed = Math.round(cached * 1000000);
                _aoResult[0] = Math.floor(packed / 1000000) / 100;
                _aoResult[1] = Math.floor((packed % 1000000) / 10000) / 100;
                _aoResult[2] = Math.floor((packed % 10000) / 100) / 100;
                _aoResult[3] = (packed % 100) / 100;
                return _aoResult;
            }
        }
    }

    const config = getAOConfig(nx, ny, nz);
    const ao0 = calculateVertexAO(lx, ly, lz, config[0], getter, isTransparent);
    const ao1 = calculateVertexAO(lx, ly, lz, config[1], getter, isTransparent);
    const ao2 = calculateVertexAO(lx, ly, lz, config[2], getter, isTransparent);
    const ao3 = calculateVertexAO(lx, ly, lz, config[3], getter, isTransparent);

    // Cache the result
    if (aoCacheValid && lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && ly >= 0 && ly < CHUNK_HEIGHT && faceIdx !== undefined) {
        const cacheKey = getAOCacheKey(lx, ly, lz, faceIdx);
        if (cacheKey < AO_CACHE_SIZE) {
            const packed = Math.round(ao0 * 100) * 1000000 +
                          Math.round(ao1 * 100) * 10000 +
                          Math.round(ao2 * 100) * 100 +
                          Math.round(ao3 * 100);
            aoCache[cacheKey] = packed / 1000000;
        }
    }

    _aoResult[0] = ao0;
    _aoResult[1] = ao1;
    _aoResult[2] = ao2;
    _aoResult[3] = ao3;
    return _aoResult;
}

/**
 * Get simplified height-based lighting for distant LOD chunks.
 * Skips expensive light propagation, uses height heuristics.
 * @param {number} ly - Local Y coordinate
 * @param {number} chunkHeight - Chunk height
 * @param {number} [seaLevel=60] - Sea level Y coordinate
 * @returns {number} Simplified light level (1-15)
 */
export function getSimplifiedLight(ly, chunkHeight, seaLevel = 60) {
    const surfaceY = seaLevel + 10; // ~70, approximate surface level

    if (ly >= surfaceY) return 15;      // At or above surface: full light
    if (ly >= surfaceY - 20) return 13; // Near surface (50-70)
    if (ly >= surfaceY - 50) return 10; // Mid depth (20-50)
    if (ly >= 0) return 6;              // Underground (0-20)
    return 3;                           // Deep underground (below 0)
}

export default {
    AO_LOOKUP,
    AO_FACE_CONFIGS,
    initAOCache,
    clearAOCache,
    getAOConfig,
    calculateVertexAO,
    calculateFaceAO,
    getSimplifiedLight,
};

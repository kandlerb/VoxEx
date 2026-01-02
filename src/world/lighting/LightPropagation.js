/**
 * Shared light propagation utilities.
 * Helper functions for coordinate conversion and light calculations.
 * @module world/lighting/LightPropagation
 */

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config/WorldConfig.js';

// =====================================================
// INDEX CONVERSION UTILITIES
// =====================================================

/**
 * Convert local chunk coordinates (x, y, z) to array index.
 * Uses bitshift for performance: (lz << 4) + (ly << 8) = lz * 16 + ly * 256.
 * @param {number} lx - Local X coordinate (0-15)
 * @param {number} ly - Local Y coordinate (0-319)
 * @param {number} lz - Local Z coordinate (0-15)
 * @returns {number} Array index
 */
export function posToIndex(lx, ly, lz) {
    return lx + (lz << 4) + (ly << 8);
}

/**
 * Convert local chunk coordinates using chunkSize parameter.
 * For dynamic chunk sizes (though VoxEx uses 16).
 * @param {number} lx - Local X coordinate
 * @param {number} ly - Local Y coordinate
 * @param {number} lz - Local Z coordinate
 * @param {number} chunkSize - Chunk size (default 16)
 * @returns {number} Array index
 */
export function posToIndexDynamic(lx, ly, lz, chunkSize = CHUNK_SIZE) {
    return lx + lz * chunkSize + ly * chunkSize * chunkSize;
}

/**
 * Convert array index to local chunk coordinates (x, y, z).
 * @param {number} index - Array index
 * @param {number} [chunkSize=16] - Chunk size
 * @returns {{x: number, y: number, z: number}} Local coordinates
 */
export function indexToPos(index, chunkSize = CHUNK_SIZE) {
    const x = index % chunkSize;
    const z = Math.floor(index / chunkSize) % chunkSize;
    const y = Math.floor(index / (chunkSize * chunkSize));
    return { x, y, z };
}

// =====================================================
// BOUNDS CHECKING
// =====================================================

/**
 * Check if local coordinates are within chunk bounds.
 * @param {number} lx - Local X coordinate
 * @param {number} ly - Local Y coordinate
 * @param {number} lz - Local Z coordinate
 * @param {number} [chunkSize=16] - Chunk size for X/Z
 * @param {number} [chunkHeight=320] - Chunk height for Y
 * @returns {boolean} True if coordinates are in bounds
 */
export function isInBounds(lx, ly, lz, chunkSize = CHUNK_SIZE, chunkHeight = CHUNK_HEIGHT) {
    return lx >= 0 && lx < chunkSize &&
           ly >= 0 && ly < chunkHeight &&
           lz >= 0 && lz < chunkSize;
}

/**
 * Check if local coordinates are on the chunk edge.
 * @param {number} lx - Local X coordinate
 * @param {number} lz - Local Z coordinate
 * @param {number} [chunkSize=16] - Chunk size
 * @returns {boolean} True if on edge
 */
export function isOnEdge(lx, lz, chunkSize = CHUNK_SIZE) {
    return lx === 0 || lx === chunkSize - 1 ||
           lz === 0 || lz === chunkSize - 1;
}

// =====================================================
// LIGHT LEVEL UTILITIES
// =====================================================

/**
 * Get the combined (maximum) light from skyLight and blockLight.
 * The final light level is the greater of the two sources.
 * @param {number} skyLight - Sky light level (0-15)
 * @param {number} blockLight - Block light level (0-15)
 * @returns {number} Combined light level (0-15)
 */
export function getCombinedLight(skyLight, blockLight) {
    return skyLight > blockLight ? skyLight : blockLight;
}

/**
 * Calculate propagated light level (reduced by 1 for travel).
 * Ensures minimum of 1 for skylight, 0 for blocklight.
 * @param {number} sourceLevel - Source light level
 * @param {boolean} [isSkyLight=true] - Whether this is skylight (minimum 1) or blocklight (minimum 0)
 * @returns {number} Propagated light level
 */
export function getPropagatedLight(sourceLevel, isSkyLight = true) {
    const reduced = sourceLevel - 1;
    const minimum = isSkyLight ? 1 : 0;
    return reduced > minimum ? reduced : minimum;
}

/**
 * Calculate light level after passing through a semi-transparent block.
 * @param {number} currentLight - Current light level
 * @param {number} attenuation - Block's attenuation value (0-15)
 * @param {number} [minimum=1] - Minimum light level
 * @returns {number} Attenuated light level
 */
export function getAttenuatedLight(currentLight, attenuation, minimum = 1) {
    if (attenuation >= 15) {
        return minimum;  // Fully opaque block
    }
    if (attenuation <= 0) {
        return currentLight;  // Fully transparent block
    }
    const reduced = currentLight - attenuation;
    return reduced > minimum ? reduced : minimum;
}

// =====================================================
// CHUNK KEY UTILITIES
// =====================================================

/**
 * Get chunk key string from chunk coordinates.
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @returns {string} Chunk key "cx,cz"
 */
export function getChunkKey(cx, cz) {
    return `${cx},${cz}`;
}

/**
 * Parse chunk key string into chunk coordinates.
 * @param {string} key - Chunk key "cx,cz"
 * @returns {{cx: number, cz: number}} Chunk coordinates
 */
export function parseChunkKey(key) {
    const [cx, cz] = key.split(',').map(Number);
    return { cx, cz };
}

/**
 * Get chunk coordinates from global block coordinates.
 * @param {number} gx - Global X coordinate
 * @param {number} gz - Global Z coordinate
 * @param {number} [chunkSize=16] - Chunk size
 * @returns {{cx: number, cz: number}} Chunk coordinates
 */
export function globalToChunk(gx, gz, chunkSize = CHUNK_SIZE) {
    return {
        cx: Math.floor(gx / chunkSize),
        cz: Math.floor(gz / chunkSize)
    };
}

/**
 * Get local coordinates from global block coordinates.
 * @param {number} gx - Global X coordinate
 * @param {number} gz - Global Z coordinate
 * @param {number} [chunkSize=16] - Chunk size
 * @returns {{lx: number, lz: number}} Local coordinates
 */
export function globalToLocal(gx, gz, chunkSize = CHUNK_SIZE) {
    return {
        lx: ((gx % chunkSize) + chunkSize) % chunkSize,
        lz: ((gz % chunkSize) + chunkSize) % chunkSize
    };
}

/**
 * Get global coordinates from chunk and local coordinates.
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @param {number} lx - Local X coordinate
 * @param {number} lz - Local Z coordinate
 * @param {number} [chunkSize=16] - Chunk size
 * @returns {{gx: number, gz: number}} Global coordinates
 */
export function localToGlobal(cx, cz, lx, lz, chunkSize = CHUNK_SIZE) {
    return {
        gx: cx * chunkSize + lx,
        gz: cz * chunkSize + lz
    };
}

// =====================================================
// NEIGHBOR ITERATION
// =====================================================

/**
 * Get cardinal neighbor chunk keys for a given chunk.
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @returns {Object} Object with west, east, north, south keys
 */
export function getCardinalNeighborKeys(cx, cz) {
    return {
        west: getChunkKey(cx - 1, cz),
        east: getChunkKey(cx + 1, cz),
        north: getChunkKey(cx, cz - 1),
        south: getChunkKey(cx, cz + 1)
    };
}

/**
 * Get all 8 neighbor chunk keys (cardinal + diagonal).
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @returns {Array<{key: string, dx: number, dz: number}>} Array of neighbor info
 */
export function getAllNeighborKeys(cx, cz) {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            neighbors.push({
                key: getChunkKey(cx + dx, cz + dz),
                dx,
                dz
            });
        }
    }
    return neighbors;
}

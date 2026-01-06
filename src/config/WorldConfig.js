/**
 * VoxEx World Configuration
 * World dimensions and generation parameters.
 * @module config/WorldConfig
 */

/**
 * World configuration for terrain generation
 * @type {Object}
 */
export const WORLD_CONFIG = {
    seed: 0,
    biomeFrequency: 0.5,
    noise: {
        octaves: 128,
        persistence: 0.5,
        lacunarity: 2.0,
    },
};

/**
 * World dimension constants
 * @type {Object}
 */
export const WORLD_DIMS = {
    /** Chunk size in blocks (X and Z) */
    chunkSize: 16,
    /** Chunk height in blocks (Y) */
    chunkHeight: 320,
    /** Y offset for world coordinate conversion */
    yOffset: 0,
    /** Sea level height */
    seaLevel: 60,
    /** Total world height */
    worldHeight: 320,
};

/**
 * Chunk bounding radius for culling calculations
 * @type {number}
 */
export const CHUNK_BOUNDING_RADIUS = Math.sqrt(
    8 * 8 + Math.pow(WORLD_DIMS.chunkHeight * 0.5, 2) + 8 * 8
);

/**
 * Generate a chunk key from coordinates
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @returns {string} Chunk key in format "cx,cz"
 */
export function getChunkKey(cx, cz) {
    return `${cx},${cz}`;
}

/**
 * Parse a chunk key into coordinates
 * @param {string} key - Chunk key in format "cx,cz"
 * @returns {{cx: number, cz: number}} Chunk coordinates
 */
export function parseChunkKey(key) {
    const [cx, cz] = key.split(',').map(Number);
    return { cx, cz };
}

/**
 * Convert world coordinates to chunk coordinates
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @returns {{cx: number, cz: number}} Chunk coordinates
 */
export function worldToChunk(x, z) {
    return {
        cx: Math.floor(x / WORLD_DIMS.chunkSize),
        cz: Math.floor(z / WORLD_DIMS.chunkSize)
    };
}

/**
 * Convert world Y to local Y (with offset)
 * @param {number} y - World Y coordinate
 * @returns {number} Local Y coordinate
 */
export function worldToLocalY(y) {
    return y + WORLD_DIMS.yOffset;
}

/**
 * Convert local Y to world Y (with offset)
 * @param {number} ly - Local Y coordinate
 * @returns {number} World Y coordinate
 */
export function localToWorldY(ly) {
    return ly - WORLD_DIMS.yOffset;
}

/**
 * Check if a world Y coordinate is valid
 * @param {number} y - World Y coordinate
 * @returns {boolean} True if valid
 */
export function isValidWorldY(y) {
    const ly = y + WORLD_DIMS.yOffset;
    return ly >= 0 && ly < WORLD_DIMS.chunkHeight;
}

/**
 * Calculate block index in chunk array
 * @param {number} lx - Local X (0-15)
 * @param {number} ly - Local Y (0-319)
 * @param {number} lz - Local Z (0-15)
 * @returns {number} Array index
 */
export function getBlockIndex(lx, ly, lz) {
    return (ly * WORLD_DIMS.chunkSize * WORLD_DIMS.chunkSize) + (lz * WORLD_DIMS.chunkSize) + lx;
}

// =====================================================
// RE-EXPORTED DIMENSION CONSTANTS
// =====================================================
// These are re-exported from WORLD_DIMS for convenience.
// Many modules import these directly for cleaner code.

/** Chunk size in blocks (X and Z dimensions) */
export const CHUNK_SIZE = WORLD_DIMS.chunkSize;

/** Chunk height in blocks (Y dimension) */
export const CHUNK_HEIGHT = WORLD_DIMS.chunkHeight;

/** Y offset for world coordinate conversion */
export const Y_OFFSET = WORLD_DIMS.yOffset;

/** Sea level height */
export const SEA_LEVEL = WORLD_DIMS.seaLevel;

/** Chunk size squared (for 2D layer calculations) */
export const CHUNK_SIZE_SQUARED = CHUNK_SIZE * CHUNK_SIZE;

/** Total blocks per chunk (volume) */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

// =====================================================
// CHUNK PROCESSING CONSTANTS
// =====================================================

/** Time budget for chunk building per frame (ms) */
export const CHUNK_BUILD_BUDGET_MS = 8;

/** Number of chunks to process per batch */
export const CHUNK_BATCH_SIZE = 4;

/** Minimum time between rebuilds of same chunk (ms) */
export const CHUNK_REBUILD_COOLDOWN_MS = 1000;

/** Size of chunk key string cache */
export const CHUNK_KEY_CACHE_SIZE = 128;

/** Pre-generation radius (chunks ahead to generate) */
export const PRE_GEN_RADIUS = 2;

// =====================================================
// BIOME GRID CONSTANTS
// =====================================================

/** Size of biome cell in blocks for caching */
export const BIOME_CELL_SIZE = 64;

/** Precision for biome weight storage (integers * 100) */
export const BIOME_WEIGHT_PRECISION = 100;

// =====================================================
// TERRAIN HEIGHT CONSTANTS
// =====================================================

/** Alpine line height (stunted trees above this) */
export const ALPINE_LINE = 85;

/** Tree line base height (varies by slope aspect) */
export const TREE_LINE_BASE = 80;

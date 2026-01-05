/**
 * Chunk data structure and utilities
 * @module world/Chunk
 */

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    CHUNK_VOLUME,
    CHUNK_SIZE_SQUARED,
    getBlockIndex,
    getChunkKey,
    parseChunkKey
} from '../config/WorldConfig.js';
import { AIR } from '../core/constants.js';

/**
 * @typedef {Object} ChunkData
 * @property {Uint8Array} blocks - Block IDs [x + z*16 + y*256]
 * @property {Uint8Array} skyLight - Sky light levels
 * @property {Uint8Array} blockLight - Block light levels
 * @property {boolean} generated - Whether terrain has been generated
 * @property {boolean} lit - Whether lighting has been calculated
 * @property {boolean} meshed - Whether mesh has been built
 * @property {boolean} modified - Whether chunk has player modifications
 * @property {number} [cx] - Chunk X coordinate
 * @property {number} [cz] - Chunk Z coordinate
 * @property {number} [startX] - World X start position
 * @property {number} [startZ] - World Z start position
 * @property {number} [genState] - Generation state flags
 */

/**
 * Generation pass flags for tracking chunk generation progress
 * @type {Object}
 */
export const GEN_PASS = {
    TERRAIN: 1,
    WATER: 2,
    DECORATIONS: 4,
    SUNLIGHT: 8,
    BLOCKLIGHT: 16,
    ALL: 31  // All passes complete
};

/**
 * Create a new empty chunk data structure
 * @returns {ChunkData}
 */
export function createChunkData() {
    return {
        blocks: new Uint8Array(CHUNK_VOLUME),
        skyLight: new Uint8Array(CHUNK_VOLUME),
        blockLight: new Uint8Array(CHUNK_VOLUME),
        generated: false,
        lit: false,
        meshed: false,
        modified: false
    };
}

/**
 * Create a chunk data structure with metadata
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @returns {ChunkData}
 */
export function createChunkWithMetadata(cx, cz) {
    const chunk = createChunkData();
    chunk.cx = cx;
    chunk.cz = cz;
    chunk.startX = cx * CHUNK_SIZE;
    chunk.startZ = cz * CHUNK_SIZE;
    chunk.genState = 0;
    return chunk;
}

/**
 * Get block at local position
 * @param {ChunkData} chunk
 * @param {number} x - Local X (0-15)
 * @param {number} y - Local Y (0-319)
 * @param {number} z - Local Z (0-15)
 * @returns {number} Block ID
 */
export function getBlock(chunk, x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
        return AIR;
    }
    return chunk.blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE_SQUARED];
}

/**
 * Set block at local position
 * @param {ChunkData} chunk
 * @param {number} x - Local X (0-15)
 * @param {number} y - Local Y (0-319)
 * @param {number} z - Local Z (0-15)
 * @param {number} blockId - Block ID to set
 * @returns {boolean} True if block was set successfully
 */
export function setBlock(chunk, x, y, z, blockId) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
        return false;
    }
    chunk.blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE_SQUARED] = blockId;
    chunk.modified = true;
    return true;
}

export { getBlockIndex, getChunkKey, parseChunkKey };

/**
 * Convert global coordinates to chunk coordinates
 * @param {number} gx - Global X coordinate
 * @param {number} gz - Global Z coordinate
 * @returns {{cx: number, cz: number}} Chunk coordinates
 */
export function globalToChunk(gx, gz) {
    return {
        cx: Math.floor(gx / CHUNK_SIZE),
        cz: Math.floor(gz / CHUNK_SIZE)
    };
}

/**
 * Convert global coordinates to local coordinates within chunk
 * @param {number} gx - Global X coordinate
 * @param {number} gy - Global Y coordinate
 * @param {number} gz - Global Z coordinate
 * @returns {{lx: number, ly: number, lz: number}} Local coordinates
 */
export function globalToLocal(gx, gy, gz) {
    return {
        lx: ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        ly: gy,
        lz: ((gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    };
}

/**
 * Convert local chunk coordinates to global world coordinates
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @param {number} lx - Local X (0-15)
 * @param {number} ly - Local Y (0-319)
 * @param {number} lz - Local Z (0-15)
 * @returns {{gx: number, gy: number, gz: number}} Global coordinates
 */
export function localToGlobal(cx, cz, lx, ly, lz) {
    return {
        gx: cx * CHUNK_SIZE + lx,
        gy: ly,
        gz: cz * CHUNK_SIZE + lz
    };
}

/**
 * Check if local coordinates are within chunk bounds
 * @param {number} x - Local X
 * @param {number} y - Local Y
 * @param {number} z - Local Z
 * @returns {boolean} True if within bounds
 */
export function isInBounds(x, y, z) {
    return x >= 0 && x < CHUNK_SIZE &&
           y >= 0 && y < CHUNK_HEIGHT &&
           z >= 0 && z < CHUNK_SIZE;
}

/**
 * Find the surface Y level at a given local XZ position
 * @param {ChunkData} chunk - Chunk data
 * @param {number} lx - Local X (0-15)
 * @param {number} lz - Local Z (0-15)
 * @returns {number} Surface Y level, or -1 if all air
 */
export function findSurfaceY(chunk, lx, lz) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const idx = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE_SQUARED;
        if (chunk.blocks[idx] !== AIR) {
            return y;
        }
    }
    return -1;
}

/**
 * Count non-air blocks in a chunk (for debugging/verification)
 * @param {ChunkData} chunk - Chunk data
 * @returns {number} Count of non-air blocks
 */
export function countNonAirBlocks(chunk) {
    let count = 0;
    for (let i = 0; i < CHUNK_VOLUME; i++) {
        if (chunk.blocks[i] !== AIR) {
            count++;
        }
    }
    return count;
}

/**
 * Clone a chunk's block data (for modification without affecting original)
 * @param {ChunkData} chunk - Source chunk
 * @returns {ChunkData} Cloned chunk with copied arrays
 */
export function cloneChunk(chunk) {
    return {
        blocks: new Uint8Array(chunk.blocks),
        skyLight: new Uint8Array(chunk.skyLight),
        blockLight: new Uint8Array(chunk.blockLight),
        generated: chunk.generated,
        lit: chunk.lit,
        meshed: chunk.meshed,
        modified: chunk.modified,
        cx: chunk.cx,
        cz: chunk.cz,
        startX: chunk.startX,
        startZ: chunk.startZ,
        genState: chunk.genState
    };
}

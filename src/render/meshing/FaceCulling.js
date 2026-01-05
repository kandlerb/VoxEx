/**
 * Face culling utilities for voxel meshing
 * @module render/meshing/FaceCulling
 */

import { isLeafBlock } from '../../config/BlockConfig.js';
import { AIR, WATER, UNLOADED_BLOCK } from '../../core/constants.js';
import { buildBlockLookups } from '../../optimization/BlockLookups.js';

/**
 * Pre-built block lookup tables
 * @type {Object}
 */
let lookups = null;

/**
 * Get or build block lookups (lazy initialization)
 * @returns {Object} Block lookup tables
 */
function getLookups() {
    if (!lookups) {
        lookups = buildBlockLookups();
    }
    return lookups;
}

/**
 * Face direction offsets [dx, dy, dz, nx, ny, nz]
 * @type {Array<Array<number>>}
 */
export const FACE_DIRECTIONS = [
    [0, 1, 0, 0, 1, 0],   // Top (+Y)
    [0, -1, 0, 0, -1, 0], // Bottom (-Y)
    [1, 0, 0, 1, 0, 0],   // East (+X)
    [-1, 0, 0, -1, 0, 0], // West (-X)
    [0, 0, 1, 0, 0, 1],   // South (+Z)
    [0, 0, -1, 0, 0, -1], // North (-Z)
];

/**
 * Face index constants
 * @type {Object}
 */
export const FACE = {
    TOP: 0,
    BOTTOM: 1,
    EAST: 2,
    WEST: 3,
    SOUTH: 4,
    NORTH: 5,
};

/**
 * Check if a face should be rendered based on neighboring block
 * @param {number} blockId - Current block ID
 * @param {number} neighborId - Neighboring block ID
 * @returns {boolean} True if face should be rendered
 */
export function shouldRenderFace(blockId, neighborId) {
    // Don't render if current block is air
    if (blockId === AIR) return false;

    // If neighbor is unloaded, treat as solid (don't render)
    if (neighborId === UNLOADED_BLOCK) return false;

    const { BLOCK_IS_SOLID, IS_TRANSPARENT } = getLookups();

    // Don't render if neighbor is opaque solid
    if (BLOCK_IS_SOLID[neighborId] && !IS_TRANSPARENT[neighborId]) {
        return false;
    }

    // Water only draws faces against air or leaves
    if (blockId === WATER) {
        return neighborId === AIR || isLeafBlock(neighborId);
    }

    // For transparent blocks, check neighbor transparency
    return IS_TRANSPARENT[neighborId] === 1;
}

/**
 * Check if block is transparent (needs special handling)
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if transparent
 */
export function isTransparent(blockId) {
    return getLookups().IS_TRANSPARENT[blockId] === 1;
}

/**
 * Check if block is solid
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if solid
 */
export function isSolid(blockId) {
    return getLookups().BLOCK_IS_SOLID[blockId] === 1;
}

/**
 * Check if block is opaque (solid and not transparent)
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if opaque
 */
export function isOpaque(blockId) {
    const { BLOCK_IS_SOLID, IS_TRANSPARENT } = getLookups();
    return BLOCK_IS_SOLID[blockId] === 1 && IS_TRANSPARENT[blockId] === 0;
}

/**
 * Get neighbor offset for a face index
 * @param {number} faceIndex - Face index (0-5)
 * @returns {{dx: number, dy: number, dz: number, nx: number, ny: number, nz: number}}
 */
export function getFaceOffset(faceIndex) {
    const dir = FACE_DIRECTIONS[faceIndex];
    return {
        dx: dir[0],
        dy: dir[1],
        dz: dir[2],
        nx: dir[3],
        ny: dir[4],
        nz: dir[5],
    };
}

/**
 * Get all visible faces for a block
 * @param {number} blockId - Block ID
 * @param {Function} getNeighbor - Function to get neighbor block ID (dx, dy, dz) => blockId
 * @returns {Array<number>} Array of visible face indices
 */
export function getVisibleFaces(blockId, getNeighbor) {
    if (blockId === AIR) return [];

    const visibleFaces = [];
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const { dx, dy, dz } = getFaceOffset(faceIdx);
        const neighborId = getNeighbor(dx, dy, dz);
        if (shouldRenderFace(blockId, neighborId)) {
            visibleFaces.push(faceIdx);
        }
    }
    return visibleFaces;
}

/**
 * Count visible faces for a block (optimized version without array allocation)
 * @param {number} blockId - Block ID
 * @param {Function} getNeighbor - Function to get neighbor block ID
 * @returns {number} Number of visible faces
 */
export function countVisibleFaces(blockId, getNeighbor) {
    if (blockId === AIR) return 0;

    let count = 0;
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const { dx, dy, dz } = getFaceOffset(faceIdx);
        const neighborId = getNeighbor(dx, dy, dz);
        if (shouldRenderFace(blockId, neighborId)) {
            count++;
        }
    }
    return count;
}

export default {
    shouldRenderFace,
    isTransparent,
    isSolid,
    isOpaque,
    getFaceOffset,
    getVisibleFaces,
    countVisibleFaces,
    FACE_DIRECTIONS,
    FACE,
};

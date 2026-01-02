/**
 * Cross-chunk light propagation.
 * Handles light propagation across chunk boundaries for seamless lighting.
 * @module world/lighting/CrossChunkLight
 */

import { MIN_LIGHT, NEIGHBOR_OFFSETS } from './LightConstants.js';

// =====================================================
// EDGE LIGHTING PROPAGATION
// =====================================================
// Cross-chunk lighting ensures smooth light transitions at chunk boundaries:
// 1. propagateEdgeLighting: Copies light from one chunk's edge to a neighbor's edge
// 2. propagateLightFromNeighbors: Collects light from all 4 cardinal neighbors
// 3. propagateLightFromEdgesInward: BFS to spread edge light into chunk interior
//
// This is necessary because initial chunk generation only propagates within bounds.
// When neighboring chunks are generated, edge lighting must be updated.
// =====================================================

/**
 * Propagate light from one chunk's edge to another chunk's adjacent edge.
 * Light is reduced by 1 when crossing the boundary.
 *
 * @param {Object} targetChunk - Chunk receiving light
 * @param {Object} sourceChunk - Chunk providing light
 * @param {number} targetEdge - Target edge position (0 or chunkSize-1)
 * @param {number} sourceEdge - Source edge position (0 or chunkSize-1)
 * @param {string} axis - Which axis the edge runs along ('x' or 'z')
 * @param {number} chunkSize - Chunk width/depth (typically 16)
 * @param {number} chunkHeight - Chunk height (typically 320)
 * @param {Uint8Array} isTransparent - Block transparency lookup table
 */
export function propagateEdgeLighting(targetChunk, sourceChunk, targetEdge, sourceEdge, axis, chunkSize, chunkHeight, isTransparent) {
    const targetSkyLight = targetChunk.skyLight;
    const targetBlockLight = targetChunk.blockLight;
    const targetBlocks = targetChunk.blocks;
    const sourceSkyLight = sourceChunk.skyLight;
    const sourceBlockLight = sourceChunk.blockLight;

    // Iterate along the edge
    for (let i = 0; i < chunkSize; i++) {
        for (let y = 0; y < chunkHeight; y++) {
            // Calculate indices based on axis
            let targetIdx, sourceIdx;
            if (axis === 'x') {
                // Edge runs along Z axis
                targetIdx = targetEdge + i * chunkSize + y * chunkSize * chunkSize;
                sourceIdx = sourceEdge + i * chunkSize + y * chunkSize * chunkSize;
            } else {
                // Edge runs along X axis
                targetIdx = i + targetEdge * chunkSize + y * chunkSize * chunkSize;
                sourceIdx = i + sourceEdge * chunkSize + y * chunkSize * chunkSize;
            }

            // Only propagate through transparent blocks
            if (!isTransparent[targetBlocks[targetIdx]]) continue;

            // Propagate skylight (light - 1 for crossing boundary)
            const sourceSky = sourceSkyLight[sourceIdx];
            const propagatedSky = sourceSky > MIN_LIGHT ? sourceSky - 1 : MIN_LIGHT;
            if (propagatedSky > targetSkyLight[targetIdx]) {
                targetSkyLight[targetIdx] = propagatedSky;
            }

            // Propagate block light
            const sourceBlock = sourceBlockLight[sourceIdx];
            const propagatedBlock = sourceBlock > 1 ? sourceBlock - 1 : 0;
            if (propagatedBlock > targetBlockLight[targetIdx]) {
                targetBlockLight[targetIdx] = propagatedBlock;
            }
        }
    }
}

/**
 * Propagate light from all 4 cardinal neighbor chunks into this chunk's edges.
 * This ensures smooth lighting transitions at chunk boundaries.
 *
 * @param {Object} chunk - Target chunk to receive light
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @param {number} chunkSize - Chunk width/depth
 * @param {number} chunkHeight - Chunk height
 * @param {Map<string, Object>} chunks - Map of chunk key to chunk data
 * @param {Uint8Array} isTransparent - Block transparency lookup table
 * @param {Function} getChunkKey - Function to create chunk key from (cx, cz)
 */
export function propagateLightFromNeighbors(chunk, cx, cz, chunkSize, chunkHeight, chunks, isTransparent, getChunkKey) {
    // Get all 4 cardinal neighbors
    const neighbors = {
        west: chunks.get(getChunkKey(cx - 1, cz)),
        east: chunks.get(getChunkKey(cx + 1, cz)),
        north: chunks.get(getChunkKey(cx, cz - 1)),
        south: chunks.get(getChunkKey(cx, cz + 1))
    };

    // Process west edge (lx = 0) - receive light from west neighbor's lx = 15
    if (neighbors.west && neighbors.west.skyLight && neighbors.west.blockLight) {
        propagateEdgeLighting(chunk, neighbors.west, 0, chunkSize - 1, 'x', chunkSize, chunkHeight, isTransparent);
    }

    // Process east edge (lx = 15) - receive light from east neighbor's lx = 0
    if (neighbors.east && neighbors.east.skyLight && neighbors.east.blockLight) {
        propagateEdgeLighting(chunk, neighbors.east, chunkSize - 1, 0, 'x', chunkSize, chunkHeight, isTransparent);
    }

    // Process north edge (lz = 0) - receive light from north neighbor's lz = 15
    if (neighbors.north && neighbors.north.skyLight && neighbors.north.blockLight) {
        propagateEdgeLighting(chunk, neighbors.north, 0, chunkSize - 1, 'z', chunkSize, chunkHeight, isTransparent);
    }

    // Process south edge (lz = 15) - receive light from south neighbor's lz = 0
    if (neighbors.south && neighbors.south.skyLight && neighbors.south.blockLight) {
        propagateEdgeLighting(chunk, neighbors.south, chunkSize - 1, 0, 'z', chunkSize, chunkHeight, isTransparent);
    }
}

/**
 * BFS propagation from chunk edges inward.
 * Called AFTER propagateLightFromNeighbors to spread edge light into interior.
 * This fills in light values for blocks that receive light from neighboring chunks.
 *
 * @param {Object} chunk - Chunk with edge light values set
 * @param {number} chunkSize - Chunk width/depth
 * @param {number} chunkHeight - Chunk height
 * @param {Uint8Array} isTransparent - Block transparency lookup table
 */
export function propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight, isTransparent) {
    const skyLight = chunk.skyLight;
    const blocks = chunk.blocks;
    const cs = chunkSize;

    // BFS queue: [lx, ly, lz, level] packed as flat array
    const queue = [];

    // Seed queue with all edge blocks that have light > 1
    // West edge (lx = 0)
    for (let lz = 0; lz < cs; lz++) {
        for (let ly = 0; ly < chunkHeight; ly++) {
            const idx = 0 + lz * cs + ly * cs * cs;
            if (skyLight[idx] > MIN_LIGHT && isTransparent[blocks[idx]]) {
                queue.push(0, ly, lz, skyLight[idx]);
            }
        }
    }

    // East edge (lx = 15)
    for (let lz = 0; lz < cs; lz++) {
        for (let ly = 0; ly < chunkHeight; ly++) {
            const idx = cs - 1 + lz * cs + ly * cs * cs;
            if (skyLight[idx] > MIN_LIGHT && isTransparent[blocks[idx]]) {
                queue.push(cs - 1, ly, lz, skyLight[idx]);
            }
        }
    }

    // North edge (lz = 0) - skip corners (already added)
    for (let lx = 1; lx < cs - 1; lx++) {
        for (let ly = 0; ly < chunkHeight; ly++) {
            const idx = lx + 0 * cs + ly * cs * cs;
            if (skyLight[idx] > MIN_LIGHT && isTransparent[blocks[idx]]) {
                queue.push(lx, ly, 0, skyLight[idx]);
            }
        }
    }

    // South edge (lz = 15) - skip corners
    for (let lx = 1; lx < cs - 1; lx++) {
        for (let ly = 0; ly < chunkHeight; ly++) {
            const idx = lx + (cs - 1) * cs + ly * cs * cs;
            if (skyLight[idx] > MIN_LIGHT && isTransparent[blocks[idx]]) {
                queue.push(lx, ly, cs - 1, skyLight[idx]);
            }
        }
    }

    // BFS propagation into interior
    let qIdx = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++];
        const ly = queue[qIdx++];
        const lz = queue[qIdx++];
        const level = queue[qIdx++];

        const propagated = level - 1;
        if (propagated <= MIN_LIGHT) continue;

        // Check 6 neighbors (but only within chunk)
        for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
            const nx = lx + dx;
            const ny = ly + dy;
            const nz = lz + dz;

            if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

            const nIdx = nx + nz * cs + ny * cs * cs;
            if (!isTransparent[blocks[nIdx]]) continue;

            if (propagated > skyLight[nIdx]) {
                skyLight[nIdx] = propagated;
                queue.push(nx, ny, nz, propagated);
            }
        }
    }
}

/**
 * Recalculate edge lighting for a chunk.
 * This is a full recalculation that:
 * 1. Recalculates internal chunk lighting
 * 2. Propagates light from neighbors
 * 3. Spreads edge light inward
 *
 * @param {Object} chunk - Chunk to recalculate
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @param {number} chunkSize - Chunk width/depth
 * @param {number} chunkHeight - Chunk height
 * @param {Map<string, Object>} chunks - Map of chunk key to chunk data
 * @param {Function} calculateChunkSunlight - Sunlight calculation function
 * @param {Function} calculateBlockLight - Block light calculation function
 * @param {Uint8Array} isTransparent - Block transparency lookup table
 * @param {Uint8Array} sunlightAttenuation - Sunlight attenuation lookup table
 * @param {Function} getChunkKey - Function to create chunk key
 * @param {number} [torchLevel=14] - Torch light level
 */
export function recalculateEdgeLighting(
    chunk, cx, cz, chunkSize, chunkHeight, chunks,
    calculateChunkSunlight, calculateBlockLight,
    isTransparent, sunlightAttenuation, getChunkKey, torchLevel = 14
) {
    // First recalculate internal lighting
    calculateChunkSunlight(chunk, chunkSize, chunkHeight, isTransparent, sunlightAttenuation);
    calculateBlockLight(chunk, chunkSize, chunkHeight, isTransparent, torchLevel);

    // Then propagate light from neighboring chunks into this chunk's edges
    propagateLightFromNeighbors(chunk, cx, cz, chunkSize, chunkHeight, chunks, isTransparent, getChunkKey);

    // Spread edge light into chunk interior via BFS
    propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight, isTransparent);
}

/**
 * Check if a chunk has lighting data.
 * @param {Object} chunk - Chunk to check
 * @returns {boolean} True if chunk has skyLight and blockLight arrays
 */
export function hasLightingData(chunk) {
    return chunk && chunk.skyLight && chunk.blockLight;
}

/**
 * Edge information for cardinal neighbors.
 * Used when re-queuing neighbors for edge lighting updates.
 * @type {Array<{dx: number, dz: number, edge: number, axis: string}>}
 */
export const EDGE_INFO = [
    { dx: -1, dz: 0, edge: 0, axis: 'x' },   // West: check lx=0
    { dx: 1, dz: 0, edge: 15, axis: 'x' },   // East: check lx=15
    { dx: 0, dz: -1, edge: 0, axis: 'z' },   // North: check lz=0
    { dx: 0, dz: 1, edge: 15, axis: 'z' }    // South: check lz=15
];

/**
 * Check if a chunk edge has propagatable light (value > 2).
 * @param {Uint8Array} skyLight - Skylight array
 * @param {number} edge - Edge position (0 or 15)
 * @param {string} axis - 'x' or 'z'
 * @param {number} chunkSize - Chunk size
 * @param {number} chunkHeight - Chunk height
 * @returns {boolean} True if edge has propagatable light
 */
export function edgeHasPropagableLight(skyLight, edge, axis, chunkSize, chunkHeight) {
    for (let i = 0; i < chunkSize; i++) {
        for (let y = 0; y < chunkHeight; y++) {
            const idx = axis === 'x'
                ? edge + i * chunkSize + y * chunkSize * chunkSize
                : i + edge * chunkSize + y * chunkSize * chunkSize;
            if (skyLight[idx] > 2) return true;
        }
    }
    return false;
}

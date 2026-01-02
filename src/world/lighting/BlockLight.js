/**
 * Block light propagation (torches, lava, etc.).
 * Implements BFS algorithm for torch light calculation.
 * @module world/lighting/BlockLight
 */

import { TORCH } from '../../core/constants.js';
import { NEIGHBOR_OFFSETS, TORCH_LIGHT_DEFAULT } from './LightConstants.js';

// =====================================================
// BLOCK LIGHT CALCULATION
// =====================================================
// Block light is emitted by light-emitting blocks (torches) and propagates via BFS:
// - Torches emit light at level determined by getTorchLightLevel() (typically 14-15)
// - Light spreads to all 6 neighboring transparent blocks
// - Light level decreases by 1 per block traveled
// - Light stops at opaque blocks or when level reaches 0
// Combined with skyLight using max() for final light level in extractLightFromChunk()
// =====================================================

/**
 * Calculate block light for a chunk using BFS propagation.
 * Light sources (torches) emit light that spreads in all directions.
 *
 * @param {Object|Uint8Array} chunk - Chunk object with blocks array, or raw blocks array
 * @param {number} chunkSize - Chunk width/depth (typically 16)
 * @param {number} chunkHeight - Chunk height (typically 320)
 * @param {Uint8Array} isTransparent - Block transparency lookup table
 * @param {number} [torchLightLevel] - Torch light emission level (default from settings)
 */
export function calculateBlockLight(chunk, chunkSize, chunkHeight, isTransparent, torchLightLevel = TORCH_LIGHT_DEFAULT) {
    const blocks = chunk.blocks || chunk;
    const expectedSize = chunkSize * chunkSize * chunkHeight;

    // Ensure blockLight array is correct size (handles old cached chunks with different height)
    if (!chunk.blockLight || chunk.blockLight.length !== expectedSize) {
        chunk.blockLight = new Uint8Array(expectedSize);
    }
    const blockLight = chunk.blockLight;
    blockLight.fill(0);

    const cs = chunkSize; // 16

    if (torchLightLevel <= 0) return;

    // BFS queue for light propagation: [lx, ly, lz, level] packed as flat array
    const queue = [];

    // Find all torches and seed the propagation queue
    for (let ly = 0; ly < chunkHeight; ly++) {
        const yOff = ly << 8;
        for (let lz = 0; lz < cs; lz++) {
            const zOff = lz << 4;
            for (let lx = 0; lx < cs; lx++) {
                const idx = lx + zOff + yOff;
                if (blocks[idx] === TORCH) {
                    blockLight[idx] = torchLightLevel;
                    queue.push(lx, ly, lz, torchLightLevel);
                }
            }
        }
    }

    // BFS propagation within chunk bounds
    // Note: Light doesn't cross chunk boundaries during initial generation
    // Cross-chunk propagation happens via updateBlockLightAt() when blocks change
    let qIdx = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++];
        const ly = queue[qIdx++];
        const lz = queue[qIdx++];
        const level = queue[qIdx++];

        const propagated = level > 1 ? level - 1 : 0;
        if (propagated <= 0) continue;

        for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
            const o = NEIGHBOR_OFFSETS[n];
            const nx = lx + o[0];
            const ny = ly + o[1];
            const nz = lz + o[2];

            // Bounds check (stay within chunk)
            if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

            const nIdx = nx + (nz << 4) + (ny << 8);
            const nBlockId = blocks[nIdx];

            // Only propagate through transparent blocks
            if (!isTransparent[nBlockId]) continue;

            // Only update if we can provide more light
            if (propagated > blockLight[nIdx]) {
                blockLight[nIdx] = propagated;
                queue.push(nx, ny, nz, propagated);
            }
        }
    }
}

/**
 * Update block light when a light source is added.
 * Propagates light from a single source position outward.
 *
 * @param {Uint8Array} blockLight - Block light array to update
 * @param {Uint8Array} blocks - Block data array
 * @param {Uint8Array} isTransparent - Block transparency lookup table
 * @param {number} x - Light source local X (0-15)
 * @param {number} y - Light source local Y (0-319)
 * @param {number} z - Light source local Z (0-15)
 * @param {number} lightLevel - Light level to emit
 * @param {number} chunkSize - Chunk size (typically 16)
 * @param {number} chunkHeight - Chunk height (typically 320)
 */
export function addBlockLightSource(blockLight, blocks, isTransparent, x, y, z, lightLevel, chunkSize, chunkHeight) {
    const queue = [];
    const startIndex = x + (z << 4) + (y << 8);

    // Set light at source
    if (lightLevel > blockLight[startIndex]) {
        blockLight[startIndex] = lightLevel;
        queue.push(x, y, z, lightLevel);
    }

    // BFS propagation
    let qIdx = 0;
    while (qIdx < queue.length) {
        const cx = queue[qIdx++];
        const cy = queue[qIdx++];
        const cz = queue[qIdx++];
        const level = queue[qIdx++];

        const propagated = level > 1 ? level - 1 : 0;
        if (propagated <= 0) continue;

        for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
            const nx = cx + dx;
            const ny = cy + dy;
            const nz = cz + dz;

            // Bounds check
            if (nx < 0 || nx >= chunkSize) continue;
            if (ny < 0 || ny >= chunkHeight) continue;
            if (nz < 0 || nz >= chunkSize) continue;

            const neighborIndex = nx + (nz << 4) + (ny << 8);

            // Only propagate through transparent blocks
            if (!isTransparent[blocks[neighborIndex]]) continue;

            // Only update if we can provide more light
            if (propagated > blockLight[neighborIndex]) {
                blockLight[neighborIndex] = propagated;
                queue.push(nx, ny, nz, propagated);
            }
        }
    }
}

/**
 * Compute the desired block light at a position based on neighbors.
 * Used for determining light value when a block becomes transparent.
 *
 * @param {number} x - Global X coordinate
 * @param {number} y - Global Y coordinate
 * @param {number} z - Global Z coordinate
 * @param {Function} getBlockLight - Function to get block light at (x, y, z)
 * @returns {number} Maximum neighbor block light minus 1, minimum 0
 */
export function computeNeighborBlockLight(x, y, z, getBlockLight) {
    let maxNeighborLight = 0;

    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const neighborLight = getBlockLight(x + dx, y + dy, z + dz);
        if (neighborLight > maxNeighborLight) {
            maxNeighborLight = neighborLight;
        }
    }

    // Reduce by 1 for propagation, minimum 0 for block light
    return maxNeighborLight > 1 ? maxNeighborLight - 1 : 0;
}

/**
 * Check if a block type is a light source.
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if the block emits light
 */
export function isLightSource(blockId) {
    return blockId === TORCH;
}

/**
 * Get the light emission level for a block type.
 * @param {number} blockId - Block ID to check
 * @param {number} [torchLevel=TORCH_LIGHT_DEFAULT] - Torch light level from settings
 * @returns {number} Light emission level (0 if not a light source)
 */
export function getBlockEmission(blockId, torchLevel = TORCH_LIGHT_DEFAULT) {
    if (blockId === TORCH) {
        return torchLevel;
    }
    return 0;
}

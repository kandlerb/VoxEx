/**
 * Sunlight propagation from sky downward.
 * Implements two-phase BFS algorithm for chunk sunlight calculation.
 * @module world/lighting/SkyLight
 */

import { SUNLIGHT_FULL, MIN_LIGHT, NEIGHBOR_OFFSETS } from './LightConstants.js';

// =====================================================
// SUNLIGHT CALCULATION
// =====================================================
// Sunlight propagation follows a two-phase approach:
// Phase 1: Vertical propagation from sky (y = max) downward
//   - Starts at level 15 (full sunlight)
//   - Attenuated by transparent blocks (leaves reduce by 1)
//   - Blocked completely by opaque blocks (falls to level 1)
// Phase 2: Horizontal BFS propagation
//   - Light spreads from lit blocks to neighboring air/transparent blocks
//   - Reduces by 1 per block traveled
//   - Fills caves, overhangs, and shaded areas
// Note: Cross-chunk propagation happens in propagateLightFromNeighbors()
// =====================================================

/**
 * Calculate sunlight for a chunk using two-phase BFS.
 * Phase 1: Vertical propagation from sky downward.
 * Phase 2: Horizontal BFS propagation to fill caves and overhangs.
 *
 * @param {Object|Uint8Array} chunk - Chunk object with blocks array, or raw blocks array
 * @param {number} chunkSize - Chunk width/depth (typically 16)
 * @param {number} chunkHeight - Chunk height (typically 320)
 * @param {Uint8Array} isTransparent - Block transparency lookup table
 * @param {Uint8Array} sunlightAttenuation - Sunlight attenuation lookup table
 */
export function calculateChunkSunlight(chunk, chunkSize, chunkHeight, isTransparent, sunlightAttenuation) {
    const blocks = chunk.blocks || chunk;
    const expectedSize = chunkSize * chunkSize * chunkHeight;

    // Ensure skyLight array is correct size (handles old cached chunks with different height)
    if (!chunk.skyLight || chunk.skyLight.length !== expectedSize) {
        chunk.skyLight = new Uint8Array(expectedSize);
    }
    const skyLight = chunk.skyLight;
    skyLight.fill(MIN_LIGHT); // Underground default (minimum light)

    const cs = chunkSize; // 16

    // BFS queue for horizontal propagation: [lx, ly, lz, level] packed as flat array
    const queue = [];

    // Phase 1: Vertical propagation from sky downward
    // This seeds the BFS queue with all blocks that receive direct/attenuated sunlight
    for (let lx = 0; lx < cs; lx++) {
        for (let lz = 0; lz < cs; lz++) {
            let currentLight = SUNLIGHT_FULL; // Start with max sunlight
            const baseIdx = lx + (lz << 4);

            // Go from top to bottom
            for (let ly = chunkHeight - 1; ly >= 0; ly--) {
                const idx = baseIdx + (ly << 8);
                const blockId = blocks[idx];

                // Set light for this block (use current light level, clamped to minimum 1)
                skyLight[idx] = currentLight > MIN_LIGHT ? currentLight : MIN_LIGHT;

                // Add to propagation queue if this block can spread light horizontally
                // (only transparent blocks with light > 1 can spread)
                if (isTransparent[blockId] && currentLight > MIN_LIGHT) {
                    queue.push(lx, ly, lz, currentLight);
                }

                // Apply attenuation based on block type
                const attenuation = sunlightAttenuation[blockId];
                if (attenuation >= 15) {
                    // Fully opaque block - stops light completely
                    currentLight = MIN_LIGHT;
                } else if (attenuation > 0) {
                    // Partially attenuating block (leaves, etc.) - reduce light
                    currentLight = currentLight > attenuation ? currentLight - attenuation : MIN_LIGHT;
                }
                // attenuation === 0 means fully transparent (air, water) - light passes unchanged
            }
        }
    }

    // Phase 2: BFS horizontal propagation
    // Spreads light sideways into caves and overhangs
    // Note: Only propagates within chunk bounds during initial generation
    // Cross-chunk propagation happens via updateSunlightAt() when blocks change
    let qIdx = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++];
        const ly = queue[qIdx++];
        const lz = queue[qIdx++];
        const level = queue[qIdx++];

        // Base propagation (light decreases by 1 per block for horizontal spread)
        const basePropagated = level > MIN_LIGHT ? level - 1 : MIN_LIGHT;
        if (basePropagated <= MIN_LIGHT) continue; // No point propagating minimum light

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

            // Apply additional attenuation for semi-transparent blocks (leaves)
            const attenuation = sunlightAttenuation[nBlockId];
            const propagated = attenuation > 0 && basePropagated > attenuation
                ? basePropagated - attenuation
                : basePropagated;

            // Clamp to minimum 1
            const finalLight = propagated > MIN_LIGHT ? propagated : MIN_LIGHT;

            // Only update if we can provide more light
            if (finalLight > skyLight[nIdx]) {
                skyLight[nIdx] = finalLight;
                queue.push(nx, ny, nz, finalLight);
            }
        }
    }
}

/**
 * Prime a single column of sunlight from top to bottom.
 * Used for incremental updates when a block changes.
 *
 * @param {number} x - Global X coordinate
 * @param {number} z - Global Z coordinate
 * @param {number} minY - Minimum Y coordinate (world space)
 * @param {number} maxY - Maximum Y coordinate (world space)
 * @param {Function} getBlock - Function to get block at (x, y, z)
 * @param {Function} getSkyLight - Function to get skylight at (x, y, z)
 * @param {Function} setSkyLight - Function to set skylight at (x, y, z)
 * @param {Uint8Array} sunlightAttenuation - Sunlight attenuation lookup table
 * @returns {{anyChange: boolean, changes: Array<{x: number, y: number, z: number, prev: number, target: number}>}}
 */
export function primeSunlightColumn(x, z, minY, maxY, getBlock, getSkyLight, setSkyLight, sunlightAttenuation) {
    let currentLight = SUNLIGHT_FULL;
    let anyChange = false;
    const changes = [];

    for (let y = maxY; y >= minY; y--) {
        const blockId = getBlock(x, y, z);
        if (blockId === undefined) continue; // Skip unloaded chunks

        const attenuation = sunlightAttenuation[blockId] ?? 0;
        const target = currentLight > MIN_LIGHT ? currentLight : MIN_LIGHT;
        const prev = getSkyLight(x, y, z);

        if (target !== prev) {
            setSkyLight(x, y, z, target);
            anyChange = true;
            changes.push({ x, y, z, prev, target });
        }

        // Apply attenuation
        if (attenuation >= 15) {
            currentLight = MIN_LIGHT;
        } else if (attenuation > 0) {
            currentLight = currentLight > attenuation ? currentLight - attenuation : MIN_LIGHT;
        }
    }

    return { anyChange, changes };
}

/**
 * Compute the desired skylight at a position based on neighbors.
 * Used for determining light value when a block becomes transparent.
 *
 * @param {number} x - Global X coordinate
 * @param {number} y - Global Y coordinate
 * @param {number} z - Global Z coordinate
 * @param {Function} getSkyLight - Function to get skylight at (x, y, z)
 * @returns {number} Maximum neighbor skylight minus 1, clamped to minimum 1
 */
export function computeNeighborSunlight(x, y, z, getSkyLight) {
    let maxNeighborLight = 0;

    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const neighborLight = getSkyLight(x + dx, y + dy, z + dz);
        if (neighborLight > maxNeighborLight) {
            maxNeighborLight = neighborLight;
        }
    }

    // Reduce by 1 for propagation, clamp to minimum 1
    const desired = maxNeighborLight > MIN_LIGHT ? maxNeighborLight - 1 : MIN_LIGHT;
    return desired;
}

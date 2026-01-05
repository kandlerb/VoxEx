/**
 * Tree generation for chunks
 * @module world/generation/trees/TreeGenerator
 */

import { noise2D, treePlacementValue } from '../../../math/noise.js';
import { TREE_CONFIG, resolveTreeProfile } from '../../../config/TreeConfig.js';
import { LOG_BLOCK_IDS, LEAF_BLOCK_IDS, isLogBlock, isLeafBlock } from '../../../config/BlockConfig.js';
import { AIR } from '../../../core/constants.js';
import { WORLD_DIMS, SEA_LEVEL, getChunkKey } from '../../../config/WorldConfig.js';
import { forEachCanopyVoxel, forEachTrunkBranch } from './CanopyBuilder.js';

/**
 * Seeded random for deterministic tree generation
 * @param {number} seed
 * @param {number} gx
 * @param {number} gz
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number}
 */
function seededRandom(seed, gx, gz, x, y, z) {
    let h = seed;
    h = ((h << 5) - h + gx) | 0;
    h = ((h << 5) - h + gz) | 0;
    h = ((h << 5) - h + x) | 0;
    h = ((h << 5) - h + y) | 0;
    h = ((h << 5) - h + z) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

export { LOG_BLOCK_IDS, LEAF_BLOCK_IDS, isLogBlock, isLeafBlock };

/**
 * Check if ground block is valid for tree placement
 * @param {number} groundId - Ground block ID
 * @param {Set<number>|Array<number>} allowedBlocks - Set or array of allowed ground block IDs
 * @returns {boolean}
 */
export function isValidTreeGround(groundId, allowedBlocks) {
    if (allowedBlocks instanceof Set) {
        return allowedBlocks.has(groundId);
    }
    return allowedBlocks.includes(groundId);
}

/**
 * Pick trunk size from profile using weighted random selection
 * @param {Object} profile - Tree profile
 * @param {number} seed - World seed
 * @param {number} gx - Global X
 * @param {number} gz - Global Z
 * @returns {{w: number, d: number, maxW: number, maxD: number}}
 */
export function pickTrunkSize(profile, seed, gx, gz) {
    const trunk = profile.trunk;
    let w = trunk.w;
    let d = trunk.d;
    let maxW = trunk.w;
    let maxD = trunk.d;

    if (trunk.sizes && trunk.sizes.length > 0) {
        // Calculate max possible size
        for (const s of trunk.sizes) {
            if (s.w > maxW) maxW = s.w;
            if (s.d > maxD) maxD = s.d;
        }

        // Weighted selection
        const totalWeight = trunk.sizes.reduce((sum, s) => sum + (s.weight || 1), 0);
        const r = seededRandom(seed, gx, gz, 0, 0, 12345) * totalWeight;
        let cumulative = 0;

        for (const s of trunk.sizes) {
            cumulative += (s.weight || 1);
            if (r < cumulative) {
                w = s.w;
                d = s.d;
                break;
            }
        }
    }

    return { w, d, maxW, maxD };
}

/**
 * Calculate deterministic tree positions for a chunk
 * Does not require chunk block data - uses only terrain calculations
 *
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @param {number} worldSeed - World seed
 * @param {number} chunkSize - Chunk size
 * @param {Function} getBiomeAt - Function to get biome at position
 * @param {Function} getHeightAt - Function to get terrain height
 * @param {Function} getRiverFactor - Function to get river factor
 * @param {Function} getTreeMaskValue - Function to check tree mask
 * @returns {Array} Array of tree objects with position and profile info
 */
export function getChunkTreePositions(cx, cz, worldSeed, chunkSize, getBiomeAt, getHeightAt, getRiverFactor, getTreeMaskValue) {
    const startX = cx * chunkSize;
    const startZ = cz * chunkSize;
    const trees = [];

    for (let lx = 0; lx < chunkSize; lx++) {
        for (let lz = 0; lz < chunkSize; lz++) {
            const gx = startX + lx;
            const gz = startZ + lz;

            // Get biome (deterministic)
            const biome = getBiomeAt(gx, gz);
            if (!biome || !biome.trees || biome.trees.density <= 0) continue;

            // Check tree mask (deterministic)
            if (!getTreeMaskValue(gx, gz)) continue;

            // Resolve tree profile
            const profile = resolveTreeProfile(biome);
            const { trunk, canopy, blocks, spacing, allowedGroundBlocks } = profile;
            const density = profile.density;

            // Density check (deterministic)
            const p = treePlacementValue(gx, gz, worldSeed);
            if (p > density) continue;

            // Terrain validation (deterministic)
            const groundY = getHeightAt(gx, gz);
            if (groundY < SEA_LEVEL) continue;

            // River check
            const riverFactor = getRiverFactor(gx, gz, worldSeed);
            if (riverFactor < 0.8) continue;

            // Spacing check - ensure no closer tree wins
            let tooClose = false;
            for (let ddx = -spacing; ddx <= spacing && !tooClose; ddx++) {
                for (let ddz = -spacing; ddz <= spacing && !tooClose; ddz++) {
                    if (ddx === 0 && ddz === 0) continue;
                    const dist = Math.sqrt(ddx * ddx + ddz * ddz);
                    if (dist >= spacing) continue;

                    const neighborGx = gx + ddx;
                    const neighborGz = gz + ddz;
                    const np = treePlacementValue(neighborGx, neighborGz, worldSeed);

                    // Neighbor wins if lower placement value and valid
                    if (np <= density && np < p) {
                        const neighborBiome = getBiomeAt(neighborGx, neighborGz);
                        if (neighborBiome && neighborBiome.trees && neighborBiome.trees.density > 0) {
                            if (getTreeMaskValue(neighborGx, neighborGz)) {
                                const neighborHeight = getHeightAt(neighborGx, neighborGz);
                                if (neighborHeight >= SEA_LEVEL) {
                                    const neighborRiver = getRiverFactor(neighborGx, neighborGz, worldSeed);
                                    if (neighborRiver >= 0.8) {
                                        tooClose = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (tooClose) continue;

            // Pick trunk size
            const { w: trunkW, d: trunkD, maxW, maxD } = pickTrunkSize(profile, worldSeed, gx, gz);

            // Border check
            const halfW = Math.floor(trunkW / 2);
            const halfD = Math.floor(trunkD / 2);
            const minTx = -halfW;
            const maxTx = trunkW - halfW - 1;
            const minTz = -halfD;
            const maxTz = trunkD - halfD - 1;

            if (lx + minTx < 0 || lx + maxTx >= chunkSize ||
                lz + minTz < 0 || lz + maxTz >= chunkSize) continue;

            // Calculate trunk height
            const n = noise2D(gx * 0.01 + worldSeed, gz * 0.01 - worldSeed);
            const val01 = (n + 1) * 0.5;
            const heightRange = trunk.maxHeight - trunk.minHeight;
            const trunkHeight = trunk.minHeight + Math.floor(val01 * heightRange);

            trees.push({
                gx, gz, lx, lz,
                groundY,
                trunkHeight,
                trunkW, trunkD,
                halfW, halfD,
                minTx, maxTx, minTz, maxTz,
                profile,
                biome,
                canopyRadius: canopy.radius,
                density,
                placementValue: p,
                spacing,
                riverFactor,
            });
        }
    }

    return trees;
}

/**
 * Generate trees for a chunk using deterministic cross-chunk approach
 * Collects trees from all 9 chunks (self + 8 neighbors) that could affect this chunk
 *
 * @param {number} cx - Chunk X coordinate
 * @param {number} cz - Chunk Z coordinate
 * @param {Uint8Array} data - Chunk block data
 * @param {number} chunkSize - Chunk size
 * @param {number} chunkHeight - Chunk height
 * @param {number} startX - World X start
 * @param {number} startZ - World Z start
 * @param {number} seed - World seed
 * @param {Function} get - Get block function (lx, ly, lz) => blockId
 * @param {Function} set - Set block function (lx, ly, lz, blockId) => void
 * @param {Object} caches - Caches object with heightCache and riverCache
 * @param {Function} getBiomeAt - Biome lookup function
 * @param {Function} getHeightAt - Height lookup function
 * @param {Function} getRiverFactor - River factor function
 * @param {Function} getTreeMaskValue - Tree mask function
 * @param {Map} [chunks] - Optional chunks map for cross-chunk validation
 */
export function generateTreesForChunk(
    cx, cz, data, chunkSize, chunkHeight, startX, startZ, seed,
    get, set, caches, getBiomeAt, getHeightAt, getRiverFactor, getTreeMaskValue, chunks
) {
    const { heightCache, riverCache } = caches;
    const allTrees = [];
    const MAX_CANOPY_RADIUS = 8;

    // Collect trees from all 9 chunks that could affect this chunk
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const ncx = cx + dx;
            const ncz = cz + dz;
            const chunkTrees = getChunkTreePositions(
                ncx, ncz, seed, chunkSize,
                getBiomeAt, getHeightAt, getRiverFactor, getTreeMaskValue
            );

            for (const tree of chunkTrees) {
                // Check if this tree's canopy could reach our chunk
                const canopyMinX = tree.gx - tree.canopyRadius;
                const canopyMaxX = tree.gx + tree.canopyRadius;
                const canopyMinZ = tree.gz - tree.canopyRadius;
                const canopyMaxZ = tree.gz + tree.canopyRadius;

                const chunkMinX = startX;
                const chunkMaxX = startX + chunkSize;
                const chunkMinZ = startZ;
                const chunkMaxZ = startZ + chunkSize;

                if (canopyMaxX < chunkMinX || canopyMinX >= chunkMaxX ||
                    canopyMaxZ < chunkMinZ || canopyMinZ >= chunkMaxZ) {
                    continue;
                }

                allTrees.push({
                    ...tree,
                    isOwnChunk: (dx === 0 && dz === 0),
                    sourceCx: ncx,
                    sourceCz: ncz,
                });
            }
        }
    }

    // Process each tree
    for (const tree of allTrees) {
        const { gx, gz, lx, lz, trunkHeight, trunkW, trunkD, profile, isOwnChunk,
                halfW, halfD, minTx, maxTx, minTz, maxTz, groundY } = tree;
        const { canopy, blocks, allowedGroundBlocks } = profile;

        // Calculate local coordinates in THIS chunk for tree center
        const localX = gx - startX;
        const localZ = gz - startZ;

        // Use pre-computed groundY, prefer cached height for own chunk trees
        let finalGroundY = groundY;
        if (isOwnChunk && heightCache) {
            finalGroundY = heightCache[lx + lz * chunkSize];
        }

        const trunkBaseY = finalGroundY + 1;
        const trunkTopY = trunkBaseY + trunkHeight;

        // Validate and place trunk only for trees in THIS chunk
        if (isOwnChunk) {
            // Ground block check
            const groundId = get(lx, finalGroundY, lz);
            if (!isValidTreeGround(groundId, allowedGroundBlocks)) continue;

            // Check space for trunk
            let hasSpace = true;
            for (let y = trunkBaseY; y <= trunkTopY && hasSpace; y++) {
                const block = get(lx, y, lz);
                if (block !== AIR && !isLeafBlock(block)) hasSpace = false;
            }
            if (!hasSpace) continue;

            // Height limit check
            if (trunkTopY + canopy.topExtension >= chunkHeight) continue;

            // Place trunk
            for (let y = trunkBaseY; y <= trunkTopY; y++) {
                for (let tx = minTx; tx <= maxTx; tx++) {
                    for (let tz = minTz; tz <= maxTz; tz++) {
                        const bx = lx + tx;
                        const bz = lz + tz;
                        if (bx >= 0 && bx < chunkSize && bz >= 0 && bz < chunkSize) {
                            set(bx, y, bz, blocks.log);
                        }
                    }
                }
            }

            // Place trunk branches
            forEachTrunkBranch(profile, seed, gx, gz, trunkHeight, trunkW, trunkD, (bdx, bdy, bdz) => {
                const bx = lx + bdx;
                const by = trunkBaseY + bdy;
                const bz = lz + bdz;
                if (bx >= 0 && bx < chunkSize && bz >= 0 && bz < chunkSize &&
                    by >= 0 && by < chunkHeight) {
                    if (get(bx, by, bz) === AIR) {
                        set(bx, by, bz, blocks.log);
                    }
                }
            });
        } else {
            // Neighbor tree validation
            if (chunks) {
                const sourceKey = getChunkKey(tree.sourceCx, tree.sourceCz);
                const sourceChunk = chunks.get(sourceKey);

                if (sourceChunk) {
                    const sourceBlocks = sourceChunk.blocks || sourceChunk;
                    const sourceStartX = tree.sourceCx * chunkSize;
                    const sourceStartZ = tree.sourceCz * chunkSize;

                    const trunkLocalX = gx - sourceStartX;
                    const trunkLocalZ = gz - sourceStartZ;
                    const checkY = Math.min(trunkTopY, chunkHeight - 1);
                    const trunkIdx = trunkLocalX + trunkLocalZ * chunkSize + checkY * chunkSize * chunkSize;

                    if (!isLogBlock(sourceBlocks[trunkIdx])) continue;
                }
            }
        }

        // Place canopy leaves that fall within THIS chunk
        const actualGroundY = isOwnChunk ? finalGroundY : groundY;
        const minCanopyY = actualGroundY + 2;

        forEachCanopyVoxel(profile, seed, gx, gz, trunkTopY, trunkW, trunkD, (cdx, cdz, y) => {
            if (y < minCanopyY) return;

            const globalX = gx + cdx;
            const globalZ = gz + cdz;
            const leafLocalX = globalX - startX;
            const leafLocalZ = globalZ - startZ;

            if (leafLocalX < 0 || leafLocalX >= chunkSize ||
                leafLocalZ < 0 || leafLocalZ >= chunkSize) return;
            if (y < 0 || y >= chunkHeight) return;

            const existing = get(leafLocalX, y, leafLocalZ);
            if (existing === AIR) {
                set(leafLocalX, y, leafLocalZ, blocks.leaves);
            }
        });
    }
}

/**
 * Calculate the maximum tree canopy radius from all biome configurations
 * @param {Object} biomeConfig - BIOME_CONFIG object
 * @returns {number} Maximum canopy radius
 */
export function calculateMaxTreeCanopyRadius(biomeConfig) {
    let maxRadius = TREE_CONFIG.canopy.radius;

    for (const [biomeName, config] of Object.entries(biomeConfig)) {
        const canopyRadius = config.trees?.canopy?.radius;
        if (canopyRadius !== undefined && canopyRadius > maxRadius) {
            maxRadius = canopyRadius;
        }
    }

    return maxRadius;
}

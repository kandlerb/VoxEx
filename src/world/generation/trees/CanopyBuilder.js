/**
 * Tree canopy generation utilities
 * @module world/generation/trees/CanopyBuilder
 */

import { AIR } from '../../../core/constants.js';

/**
 * Seeded random number generator for deterministic canopy generation
 * @param {number} seed - World seed
 * @param {number} gx - Global X
 * @param {number} gz - Global Z
 * @param {number} x - Local offset X
 * @param {number} y - Local offset Y
 * @param {number} z - Local offset Z
 * @returns {number} Random value 0-1
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

/**
 * Calculate effective radius for a canopy layer based on shape and position
 * @param {string} shape - Canopy shape type
 * @param {number} baseRadius - Base canopy radius
 * @param {number} y - Current Y level
 * @param {number} canopyBottom - Bottom of canopy
 * @param {number} canopyTop - Top of canopy
 * @param {number} trunkTopY - Top of trunk
 * @param {number} taperFactor - Taper control (0-1)
 * @param {number} layerGap - Gap between layers (for layered shape)
 * @returns {number} Effective radius for this layer
 */
export function getCanopyLayerRadius(shape, baseRadius, y, canopyBottom, canopyTop, trunkTopY, taperFactor, layerGap) {
    const canopyHeight = canopyTop - canopyBottom + 1;
    const layerIndex = y - canopyBottom;
    const normalizedY = layerIndex / Math.max(1, canopyHeight - 1);

    switch (shape) {
        case 'conical':
            // Widest at bottom, tapers to point at top
            return Math.max(1, Math.round(baseRadius * (1 - normalizedY * (1 - taperFactor))));

        case 'spherical': {
            // Radius varies by vertical distance from center
            const centerY = (canopyBottom + canopyTop) / 2;
            const distFromCenter = Math.abs(y - centerY);
            const maxDist = (canopyTop - canopyBottom) / 2;
            const sphereFactor = Math.sqrt(1 - Math.pow(distFromCenter / Math.max(1, maxDist), 2));
            return Math.max(1, Math.round(baseRadius * sphereFactor));
        }

        case 'layered': {
            // Alternating wide/narrow layers like spruce trees
            if (layerGap > 0 && layerIndex % (layerGap + 1) !== 0) {
                return 0; // Skip this layer
            }
            const isWideLayer = Math.floor(layerIndex / Math.max(1, layerGap + 1)) % 2 === 0;
            const baseTaper = 1 - normalizedY * (1 - taperFactor);
            const layerMultiplier = isWideLayer ? 1.0 : 0.6;
            return Math.max(1, Math.round(baseRadius * baseTaper * layerMultiplier));
        }

        case 'umbrella':
            // Flat top, wide spread - like acacia trees
            if (normalizedY < 0.7) {
                return Math.max(0, Math.round(baseRadius * 0.3 * normalizedY));
            }
            return baseRadius;

        case 'round':
        default:
            return baseRadius;
    }
}

/**
 * Iterate over all voxel positions in a tree canopy
 * Uses two-pass system: collect candidates, then filter for connectivity
 *
 * @param {Object} profile - Tree profile with canopy configuration
 * @param {number} seed - World seed
 * @param {number} gxCenter - Global X of trunk center
 * @param {number} gzCenter - Global Z of trunk center
 * @param {number} trunkTopY - Y level of trunk top
 * @param {number} trunkW - Trunk width
 * @param {number} trunkD - Trunk depth
 * @param {Function} callback - Called for each canopy position (dx, dz, y)
 */
export function forEachCanopyVoxel(profile, seed, gxCenter, gzCenter, trunkTopY, trunkW, trunkD, callback) {
    const {
        radius: baseRadius,
        topExtension,
        overlapDown,
        leafChance: defaultLeafChance = 0.85,
        shape = 'round',
        taperFactor = 0.5,
        noiseStrength = 1,
        holeChance = 0,
        branchChance = 0,
        layerGap = 0,
        layers
    } = profile.canopy;

    const canopyBottom = trunkTopY - overlapDown;
    const canopyTop = trunkTopY + topExtension;

    // Pre-compute trunk footprint bounds
    const halfW = Math.floor(trunkW / 2);
    const halfD = Math.floor(trunkD / 2);
    const trunkMinX = -halfW;
    const trunkMaxX = trunkW - halfW - 1;
    const trunkMinZ = -halfD;
    const trunkMaxZ = trunkD - halfD - 1;

    // PASS 1: Collect all candidate positions
    const candidates = new Map();

    function isInTrunk(dx, dz) {
        return dx >= trunkMinX && dx <= trunkMaxX && dz >= trunkMinZ && dz <= trunkMaxZ;
    }

    function collectCandidatesForLayer(y, layerRadius, leafChance) {
        const noiseValue = seededRandom(seed, gxCenter, gzCenter, 0, y, 7777);
        const radiusNoise = Math.round((noiseValue - 0.5) * 2 * noiseStrength);
        const effectiveRadius = Math.max(1, layerRadius + radiusNoise);
        const scanRadius = baseRadius + 2;

        for (let dx = -scanRadius; dx <= scanRadius; dx++) {
            for (let dz = -scanRadius; dz <= scanRadius; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist > effectiveRadius + 2) continue;
                if (y <= trunkTopY && isInTrunk(dx, dz)) continue;

                let shouldPlace = false;

                if (dist <= effectiveRadius) {
                    shouldPlace = true;

                    // Organic edge variation
                    if (dist > effectiveRadius - 1) {
                        const edgeFade = 1 - (dist - (effectiveRadius - 1));
                        const edgeRand = seededRandom(seed, gxCenter, gzCenter, dx, y, dz);
                        if (edgeRand > edgeFade * 0.7 + 0.3) shouldPlace = false;
                    }

                    // Rounded corners
                    if (Math.abs(dx) >= effectiveRadius - 0.5 && Math.abs(dz) >= effectiveRadius - 0.5) {
                        if (seededRandom(seed, gxCenter, gzCenter, dx, y, dz + 1111) > 0.4) {
                            shouldPlace = false;
                        }
                    }

                    // Interior holes
                    if (shouldPlace && holeChance > 0 && dist < effectiveRadius - 1) {
                        const holeRand = seededRandom(seed, gxCenter, gzCenter, dx, y, dz + 5555);
                        if (holeRand < holeChance) shouldPlace = false;
                    }

                } else if (dist <= effectiveRadius + 2 && branchChance > 0) {
                    // Branch extension zone
                    const branchRand = seededRandom(seed, gxCenter, gzCenter, dx, y, dz + 3333);
                    const layerNorm = (y - canopyBottom) / Math.max(1, canopyTop - canopyBottom);
                    const middleBias = 1 - Math.abs(layerNorm - 0.5) * 2;
                    if (branchRand < branchChance * middleBias) {
                        const adjacentToCanopy = dist <= effectiveRadius + 1.5;
                        if (adjacentToCanopy) shouldPlace = true;
                    }
                }

                if (!shouldPlace) continue;

                // Sparse leaves check
                if (leafChance < 1.0) {
                    if (seededRandom(seed, gxCenter, gzCenter, dx, y, dz + 9999) > leafChance) continue;
                }

                candidates.set(`${dx},${y},${dz}`, true);
            }
        }
    }

    // Process layers
    if (layers && layers.length > 0) {
        for (const layer of layers) {
            const y = trunkTopY + (layer.yOffset || 0);
            const layerRadius = layer.radius || baseRadius;
            const layerLeafChance = layer.leafChance ?? defaultLeafChance;
            collectCandidatesForLayer(y, layerRadius, layerLeafChance);
        }
    } else {
        for (let y = canopyBottom; y <= canopyTop; y++) {
            const layerRadius = getCanopyLayerRadius(
                shape, baseRadius, y, canopyBottom, canopyTop, trunkTopY, taperFactor, layerGap
            );
            if (layerRadius <= 0) continue;
            collectCandidatesForLayer(y, layerRadius, defaultLeafChance);
        }
    }

    // PASS 2: Filter for connectivity (flood-fill from trunk-adjacent leaves)
    const faceOffsets = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];

    const extendedOffsets = [
        [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
        [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
        [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
        [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1],
    ];

    const connected = new Set();
    const toProcess = [];

    // Find initial connected leaves (face-adjacent to trunk)
    for (const key of candidates.keys()) {
        const [dx, y, dz] = key.split(',').map(Number);
        for (const [ox, oy, oz] of faceOffsets) {
            const nx = dx + ox;
            const ny = y + oy;
            const nz = dz + oz;
            if (isInTrunk(nx, nz) && ny <= trunkTopY) {
                connected.add(key);
                toProcess.push(key);
                break;
            }
        }
    }

    // Flood fill
    while (toProcess.length > 0) {
        const currentKey = toProcess.pop();
        const [cx, cy, cz] = currentKey.split(',').map(Number);

        for (const [ox, oy, oz] of extendedOffsets) {
            const nx = cx + ox;
            const ny = cy + oy;
            const nz = cz + oz;
            const neighborKey = `${nx},${ny},${nz}`;

            if (candidates.has(neighborKey) && !connected.has(neighborKey)) {
                connected.add(neighborKey);
                toProcess.push(neighborKey);
            }
        }
    }

    // PASS 3: Output connected candidates
    for (const key of connected) {
        const [dx, y, dz] = key.split(',').map(Number);
        callback(dx, dz, y);
    }
}

/**
 * Build a spherical canopy (simplified version for basic trees)
 * @param {Uint8Array} blocks - Block array to modify
 * @param {number} cx - Center X (local)
 * @param {number} cy - Center Y
 * @param {number} cz - Center Z (local)
 * @param {number} radius - Canopy radius
 * @param {number} leafBlock - Leaf block ID
 * @param {Object} rng - Random number generator
 * @param {number} [density=0.85] - Leaf density
 * @param {number} chunkSize - Chunk size
 * @param {number} chunkHeight - Chunk height
 */
export function buildSphericalCanopy(blocks, cx, cy, cz, radius, leafBlock, rng, density = 0.85, chunkSize = 16, chunkHeight = 320) {
    const r2 = radius * radius;

    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const dist2 = dx * dx + dy * dy + dz * dz;
                if (dist2 > r2) continue;

                const x = cx + dx;
                const y = cy + dy;
                const z = cz + dz;

                if (x < 0 || x >= chunkSize || y < 0 || y >= chunkHeight || z < 0 || z >= chunkSize) continue;

                // Density check
                if (density < 1.0 && rng.next() > density) continue;

                const idx = x + z * chunkSize + y * chunkSize * chunkSize;
                if (blocks[idx] === AIR) {
                    blocks[idx] = leafBlock;
                }
            }
        }
    }
}

/**
 * Build a conical canopy (for pine trees)
 * @param {Uint8Array} blocks - Block array to modify
 * @param {number} cx - Center X (local)
 * @param {number} baseY - Base Y of cone
 * @param {number} cz - Center Z (local)
 * @param {number} height - Cone height
 * @param {number} baseRadius - Radius at bottom
 * @param {number} leafBlock - Leaf block ID
 * @param {Object} rng - Random number generator
 * @param {number} chunkSize - Chunk size
 * @param {number} chunkHeight - Chunk height
 */
export function buildConicalCanopy(blocks, cx, baseY, cz, height, baseRadius, leafBlock, rng, chunkSize = 16, chunkHeight = 320) {
    for (let dy = 0; dy < height; dy++) {
        const y = baseY + dy;
        if (y < 0 || y >= chunkHeight) continue;

        // Radius shrinks as we go up
        const t = dy / Math.max(1, height - 1);
        const layerRadius = Math.max(1, Math.round(baseRadius * (1 - t * 0.8)));

        for (let dx = -layerRadius; dx <= layerRadius; dx++) {
            for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > layerRadius) continue;

                const x = cx + dx;
                const z = cz + dz;

                if (x < 0 || x >= chunkSize || z < 0 || z >= chunkSize) continue;

                // Edge variation
                if (dist > layerRadius - 1 && rng.next() > 0.5) continue;

                const idx = x + z * chunkSize + y * chunkSize * chunkSize;
                if (blocks[idx] === AIR) {
                    blocks[idx] = leafBlock;
                }
            }
        }
    }
}

/**
 * Generate trunk branches for a tree
 * @param {Object} profile - Tree profile
 * @param {number} seed - World seed
 * @param {number} gx - Global X
 * @param {number} gz - Global Z
 * @param {number} trunkHeight - Height of trunk
 * @param {number} trunkW - Trunk width
 * @param {number} trunkD - Trunk depth
 * @param {Function} callback - Called for each branch position (dx, dy, dz)
 */
export function forEachTrunkBranch(profile, seed, gx, gz, trunkHeight, trunkW, trunkD, callback) {
    const { branchStart = 0.6, branchChance = 0, branchLength = 0 } = profile.trunk || {};

    if (branchChance <= 0 || branchLength <= 0) return;

    const minBranchY = Math.floor(trunkHeight * branchStart);
    const maxBranchY = trunkHeight - 2;

    if (minBranchY >= maxBranchY) return;

    const halfW = Math.floor(trunkW / 2);
    const halfD = Math.floor(trunkD / 2);

    const directions = [
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 },
    ];

    for (let y = minBranchY; y <= maxBranchY; y++) {
        for (const dir of directions) {
            const branchRand = seededRandom(seed, gx, gz, dir.dx * 100, y, dir.dz * 100);
            if (branchRand > branchChance) continue;

            const lengthRand = seededRandom(seed, gx, gz, dir.dx * 200, y, dir.dz * 200);
            const actualLength = Math.max(1, Math.floor(branchLength * (0.5 + lengthRand * 0.5)));

            const startX = dir.dx > 0 ? (trunkW - halfW) : (dir.dx < 0 ? (-halfW - 1) : 0);
            const startZ = dir.dz > 0 ? (trunkD - halfD) : (dir.dz < 0 ? (-halfD - 1) : 0);

            for (let len = 0; len < actualLength; len++) {
                const bx = startX + dir.dx * len;
                const bz = startZ + dir.dz * len;
                const by = y + Math.floor(len / 2);
                callback(bx, by, bz);
            }
        }
    }
}

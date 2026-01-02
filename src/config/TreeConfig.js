/**
 * VoxEx Tree Configuration
 * Default tree generation parameters.
 * @module config/TreeConfig
 */

import { LOG, LEAVES, GRASS, DIRT } from '../core/constants.js';

/**
 * Default tree configuration - merged with biome.trees overrides via resolveTreeProfile().
 * Biomes can override any of these values in their trees: { ... } config.
 * ALL tree behavior is config-driven - no special-casing by block type.
 * @type {Object}
 */
export const TREE_CONFIG = {
    // Trunk configuration
    trunk: {
        w: 1,           // Trunk width (X axis)
        d: 1,           // Trunk depth (Z axis)
        minHeight: 5,   // Minimum trunk height
        maxHeight: 11,  // Maximum trunk height
        // sizes: optional array of {w, d, weight} for weighted trunk size selection
        // If present, w/d are ignored and size is chosen per-tree via seededRandom
        // Branch options for trunk decorations
        branchStart: 0.5,      // Height ratio where branches can appear (0-1, 0.5 = halfway up)
        branchChance: 0.0,     // Probability of branch at valid positions (0 = no branches)
        branchLength: 2,       // Max branch length in blocks
        taperTop: false,       // Whether trunk narrows at top (for large trunks)
    },
    // Canopy configuration - fully config-driven, no inference from block types
    canopy: {
        radius: 2,           // Base canopy radius
        topExtension: 2,     // How far canopy extends above trunk top
        overlapDown: 2,      // How far canopy extends below trunk top (explicit default)
        leafChance: 1.0,     // Probability to place leaf at candidate position (1.0 = full, <1 = sparse)
        // Shape options: "round", "conical", "spherical", "layered", "umbrella"
        shape: "round",
        taperFactor: 0.7,    // How much radius reduces per layer (for conical/layered)
        noiseStrength: 0.2,  // Organic variation intensity (0 = none, 1 = max)
        holeChance: 0.05,    // Chance to create holes in canopy interior
        branchChance: 0.08,  // Chance for protruding branch extensions
        // Layered canopy options
        layerGap: 0,         // Vertical gap between leaf clusters (for layered shape)
        // layers: optional explicit per-layer definitions (overrides shape calculation)
        // Array of { yOffset, radius, leafChance } objects
        // If present, replaces automatic shape calculation
        layers: null,
    },
    // Block types (can be overridden per-biome)
    blocks: {
        log: null,      // null = use default LOG constant
        leaves: null,   // null = use default LEAVES constant
    },
    // Tree placement
    spacing: 4,         // Minimum spacing between trees
    // Ground requirements - trees can only spawn on these blocks
    // Set to null to use default [GRASS, DIRT]
    allowedGroundBlocks: null,
};

/**
 * Default allowed ground blocks for tree spawning
 * @type {Set<number>}
 */
export const DEFAULT_TREE_GROUND_BLOCKS = new Set([GRASS, DIRT]);

/**
 * Resolve tree profile by merging biome overrides with TREE_CONFIG defaults.
 * Returns a complete tree profile with ALL properties explicitly defined.
 * This is the single source of truth for tree configuration - no special-casing elsewhere.
 * @param {Object} biome - The biome to resolve tree profile for
 * @returns {Object} Complete tree profile with all defaults applied
 */
export function resolveTreeProfile(biome) {
    const trees = biome.trees || {};

    // Merge trunk with all defaults including new branch options
    const trunk = {
        ...TREE_CONFIG.trunk,
        branchStart: TREE_CONFIG.trunk.branchStart,
        branchChance: TREE_CONFIG.trunk.branchChance,
        branchLength: TREE_CONFIG.trunk.branchLength,
        taperTop: TREE_CONFIG.trunk.taperTop,
        ...trees.trunk,
    };

    // Preserve trunk.sizes array if present in biome config
    if (trees.trunk?.sizes) {
        trunk.sizes = trees.trunk.sizes;
    }

    // Merge canopy with explicit defaults for all properties
    const canopy = {
        radius: TREE_CONFIG.canopy.radius,
        topExtension: TREE_CONFIG.canopy.topExtension,
        overlapDown: TREE_CONFIG.canopy.overlapDown,
        leafChance: TREE_CONFIG.canopy.leafChance,
        shape: TREE_CONFIG.canopy.shape,
        taperFactor: TREE_CONFIG.canopy.taperFactor,
        noiseStrength: TREE_CONFIG.canopy.noiseStrength,
        holeChance: TREE_CONFIG.canopy.holeChance,
        branchChance: TREE_CONFIG.canopy.branchChance,
        layerGap: TREE_CONFIG.canopy.layerGap,
        layers: TREE_CONFIG.canopy.layers,
        ...trees.canopy,
    };

    // Preserve layers array if present in biome config
    if (trees.canopy?.layers) {
        canopy.layers = trees.canopy.layers;
    }

    const blocks = { ...TREE_CONFIG.blocks, ...trees.blocks };

    // Resolve allowed ground blocks - use biome override, or default
    let allowedGround = trees.allowedGroundBlocks ?? TREE_CONFIG.allowedGroundBlocks;
    if (allowedGround === null) {
        allowedGround = DEFAULT_TREE_GROUND_BLOCKS;
    } else if (Array.isArray(allowedGround)) {
        allowedGround = new Set(allowedGround);
    }

    return {
        density: trees.density ?? 0,
        spacing: trees.spacing ?? TREE_CONFIG.spacing,
        trunk,
        canopy,
        blocks: {
            log: blocks.log ?? LOG,
            leaves: blocks.leaves ?? LEAVES,
        },
        allowedGroundBlocks: allowedGround,
    };
}

/**
 * Check if a ground block is valid for tree spawning
 * @param {number} blockId - The block ID to check
 * @param {Set<number>} allowedGroundBlocks - Set of valid ground block IDs
 * @returns {boolean} True if the block is valid for tree spawning
 */
export function isValidTreeGround(blockId, allowedGroundBlocks) {
    return allowedGroundBlocks.has(blockId);
}

/**
 * Pick trunk size from profile using weighted random selection.
 * If trunk.sizes exists, selects from weighted options; otherwise uses trunk.w/d.
 * @param {Object} profile - The tree profile
 * @param {number} seed - World seed
 * @param {number} gx - Global X coordinate
 * @param {number} gz - Global Z coordinate
 * @param {Function} seededRandom - Seeded random function
 * @returns {{w: number, d: number, maxW: number, maxD: number}} Trunk dimensions with max bounds
 */
export function pickTrunkSize(profile, seed, gx, gz, seededRandom) {
    const trunk = profile.trunk;
    let w = trunk.w;
    let d = trunk.d;
    let maxW = trunk.w;
    let maxD = trunk.d;

    if (trunk.sizes && trunk.sizes.length > 0) {
        // Calculate max possible size for border check (use worst case)
        for (const s of trunk.sizes) {
            if (s.w > maxW) maxW = s.w;
            if (s.d > maxD) maxD = s.d;
        }
        // Weighted selection using seededRandom
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

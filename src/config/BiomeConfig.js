/**
 * VoxEx Biome Configuration
 * Biome definitions for terrain generation.
 * @module config/BiomeConfig
 */

import { LONGWOOD_LOG, LONGWOOD_LEAVES } from '../core/constants.js';

// =====================================================
// HEIGHT FUNCTIONS
// =====================================================

/**
 * Default height function for most biomes
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {number} baseHeight - Base terrain height
 * @param {number} amplitude - Height variation amplitude
 * @param {Function} noise2D - 2D noise function
 * @param {number} roughness - Noise frequency
 * @returns {number} Terrain height at position
 */
export function defaultHeightFunc(x, z, baseHeight, amplitude, noise2D, roughness) {
    return baseHeight + noise2D(x * roughness, z * roughness) * amplitude;
}

/**
 * Plains height function - very flat with subtle variation
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {number} baseHeight - Base terrain height
 * @param {number} amplitude - Height variation amplitude
 * @param {Function} noise2D - 2D noise function
 * @param {number} roughness - Noise frequency
 * @returns {number} Terrain height at position
 */
export function plainsHeightFunc(x, z, baseHeight, amplitude, noise2D, roughness) {
    const base = noise2D(x * roughness, z * roughness);
    const detail = noise2D(x * roughness * 4, z * roughness * 4) * 0.2;
    return baseHeight + (base + detail) * amplitude;
}

/**
 * Hills height function - rolling terrain
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {number} baseHeight - Base terrain height
 * @param {number} amplitude - Height variation amplitude
 * @param {Function} noise2D - 2D noise function
 * @param {number} roughness - Noise frequency
 * @returns {number} Terrain height at position
 */
export function hillsHeightFunc(x, z, baseHeight, amplitude, noise2D, roughness) {
    const large = noise2D(x * roughness, z * roughness);
    const medium = noise2D(x * roughness * 3, z * roughness * 3) * 0.4;
    return baseHeight + (large + medium) * amplitude;
}

/**
 * Mountains height function - dramatic peaks and valleys
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {number} baseHeight - Base terrain height
 * @param {number} amplitude - Height variation amplitude
 * @param {Function} noise2D - 2D noise function
 * @param {number} roughness - Noise frequency
 * @returns {number} Terrain height at position
 */
export function mountainsHeightFunc(x, z, baseHeight, amplitude, noise2D, roughness) {
    // Large-scale mountain range shapes
    const range = noise2D(x * roughness, z * roughness);
    // Medium detail for peaks
    const peaks = noise2D(x * roughness * 2, z * roughness * 2) * 0.5;
    // Fine detail for rocky texture
    const rock = noise2D(x * roughness * 8, z * roughness * 8) * 0.1;

    // Combine with exponential shaping for dramatic peaks
    const combined = range + peaks + rock;
    const shaped = combined > 0 ? Math.pow(combined, 1.3) : combined;

    return baseHeight + shaped * amplitude;
}

// =====================================================
// BIOME CONFIGURATION
// =====================================================

/**
 * Default values for biome configuration fields.
 * New biomes only need to specify fields that differ from defaults.
 * @type {Object}
 */
export const BIOME_DEFAULTS = {
    weight: 1,                    // Selection probability weight
    roughness: 0.01,              // Noise frequency for terrain
    amplitude: 15,                // Height variation range
    baseHeight: 64,               // Average terrain height
    heightFunc: defaultHeightFunc,// Terrain height function
    trees: {                      // Tree placement config (merged with TREE_CONFIG)
        density: 0,               // Tree density (0 = no trees)
        // trunk, canopy, blocks, spacing use TREE_CONFIG defaults via resolveTreeProfile()
    },
    tags: [],                     // Tags for biome-specific behavior
    decorateColumn: null,         // Custom decoration function
    // Future extensibility: snowLine, waterColor, ambientSound, etc.
};

/**
 * Biome configuration for terrain generation (fully data-driven).
 * All biome-specific logic is configured here - NO hard-coded biome name checks elsewhere.
 *
 * To add a new biome: Simply add an entry here. No other code changes required.
 * Missing fields are filled from BIOME_DEFAULTS.
 *
 * Tags enable biome-specific behavior without name checks:
 * - "mountain" - Enables treeline, alpine terrain, krummholz logic
 * - "forested" - Dense tree coverage
 * - "giant_trees" - Extra large trees
 * @type {Object<string, Object>}
 */
export const BIOME_CONFIG = {
    plains: {
        weight: 2,        // Common lowland biome
        roughness: 0.006, // Very smooth, gentle rolling terrain
        amplitude: 8,     // Subtle height variation
        baseHeight: 62,   // Slightly above sea level (60)
        heightFunc: plainsHeightFunc,
        trees: {
            density: 0.002,
            canopy: {
                shape: "spherical",    // Rounded oak-like trees
                noiseStrength: 0.3,
                branchChance: 0.1,
            },
        },
        tags: [],
        decorateColumn: null,
    },
    hills: {
        weight: 2,        // Moderately common transition biome
        roughness: 0.010, // Medium-scale features
        amplitude: 40,    // Noticeable but not extreme hills
        baseHeight: 65,
        heightFunc: hillsHeightFunc,
        trees: {
            density: 0.005,
            canopy: {
                shape: "spherical",
                noiseStrength: 0.25,
                branchChance: 0.08,
            },
        },
        tags: [],
        decorateColumn: null,
    },
    forests: {
        weight: 2,        // Common biome for varied terrain
        roughness: 0.015, // Gentle rolling forested hills
        amplitude: 12,    // Moderate variation
        baseHeight: 64,
        heightFunc: defaultHeightFunc,
        trees: {
            density: 0.15,  // Moderate forest density
            spacing: 5,     // Increased spacing for breathing room
            canopy: {
                shape: "spherical",   // Full, rounded canopies
                radius: 3,
                topExtension: 2,
                overlapDown: 2,
                noiseStrength: 0.35,
                holeChance: 0.03,
                branchChance: 0.12,
            },
        },
        tags: [],
    },
    mountains: {
        weight: 1,        // Less common dramatic terrain
        roughness: 0.003, // Large-scale mountain ranges
        amplitude: 180,   // Max height ~250-290 with regional variation
        baseHeight: 70,   // Elevated base for mountain regions
        heightFunc: mountainsHeightFunc,
        trees: {
            density: 0.005,  // Sparse alpine trees (reduced 50%)
            canopy: {
                shape: "conical",     // Pine-like pointed trees
                radius: 2,
                topExtension: 3,
                overlapDown: 1,
                taperFactor: 0.5,     // Strong taper for pointed tops
                noiseStrength: 0.15,
                branchChance: 0.05,
            },
        },
        tags: ["mountain"], // Enables treeline and alpine terrain logic
        decorateColumn: null,
    },
    swamp: {
        weight: 1,        // Rare biome
        roughness: 0.025, // Small-scale bumpy terrain
        amplitude: 5,     // Very flat with small mounds
        baseHeight: 58,   // Slightly below sea level for water pools
        heightFunc: defaultHeightFunc,
        trees: {
            density: 0.15,
            canopy: {
                shape: "round",       // Droopy, irregular canopies
                radius: 3,
                topExtension: 1,
                overlapDown: 3,       // Hanging lower
                noiseStrength: 0.4,   // Very irregular
                holeChance: 0.08,     // More holes for spooky look
                branchChance: 0.15,   // Hanging branches
                leafChance: 0.85,
            },
        },
        tags: [],
        decorateColumn: null,
    },
    // Longwoods biome - towering thick-trunked trees with wide, sparse canopies
    longwoods: {
        weight: 2,        // Rare biome
        roughness: 0.008, // Smooth terrain for giant trees
        amplitude: 25,    // Gentle hills
        baseHeight: 68,   // Elevated base
        heightFunc: defaultHeightFunc,
        trees: {
            density: 0.18,    // Moderate-high density for overlapping canopies
            spacing: 6,       // Balanced spacing for canopy connections
            trunk: {
                minHeight: 12,// Tall trees
                maxHeight: 24,// Very tall trees
                sizes: [
                    { w: 2, d: 2, weight: 0.75 },  // 2×2 trunk (common)
                    { w: 3, d: 3, weight: 0.25 },  // 3×3 trunk (rare)
                ],
            },
            canopy: {
                shape: "round",       // Flat, spreading canopy
                radius: 6,            // Wide canopy for connections
                topExtension: 1,      // Thin canopy top (only 1 above trunk)
                overlapDown: 1,       // Thin canopy bottom (only 1 below trunk top)
                leafChance: 0.65,     // Sparse leaves (65% placement chance)
                noiseStrength: 0.5,   // High variation for organic spread
                holeChance: 0.1,      // Many gaps in canopy
                branchChance: 0.18,   // Extended reaching branches
            },
            blocks: {
                log: LONGWOOD_LOG,      // Custom longwood log block
                leaves: LONGWOOD_LEAVES, // Custom longwood leaves block
            },
        },
        tags: ["forested", "giant_trees"],
    },
};

/**
 * Build biome list from BIOME_CONFIG.
 * Applies BIOME_DEFAULTS for any missing fields, then adds name.
 * @returns {Array<Object>} Array of resolved biomes with all properties
 */
export function buildBiomesFromConfig() {
    return Object.entries(BIOME_CONFIG).map(([name, config]) => {
        const trees = config.trees || {};
        return {
            // Apply defaults first
            ...BIOME_DEFAULTS,
            // Override with config values
            ...config,
            // Merge trees object, preserving nested overrides for resolveTreeProfile()
            trees: {
                ...BIOME_DEFAULTS.trees,
                ...trees,
                // Preserve nested objects for trunk/canopy/blocks
                trunk: trees.trunk,
                canopy: trees.canopy,
                blocks: trees.blocks,
            },
            // Ensure tags is always an array
            tags: config.tags || BIOME_DEFAULTS.tags,
            // Add derived name property
            name,
        };
    });
}

/**
 * Get list of all biome names
 * @returns {string[]} Array of biome names
 */
export function getBiomeNames() {
    return Object.keys(BIOME_CONFIG);
}

/**
 * Get biome count
 * @returns {number} Number of defined biomes
 */
export function getBiomeCount() {
    return Object.keys(BIOME_CONFIG).length;
}

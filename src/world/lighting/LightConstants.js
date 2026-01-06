/**
 * Lighting system constants
 * Core constants for light propagation in the voxel world.
 * @module world/lighting/LightConstants
 */

import { TORCH } from '../../core/constants.js';

// =====================================================
// LIGHT LEVEL CONSTANTS
// =====================================================

/** Maximum light level (full sunlight) */
export const MAX_LIGHT = 15;

/** Minimum light level (never completely dark) */
export const MIN_LIGHT = 1;

/** Light level reduction per block of distance */
export const LIGHT_FALLOFF = 1;

/** Sunlight value for blocks directly exposed to sky */
export const SUNLIGHT_FULL = 15;

/** Default torch light emission level */
export const TORCH_LIGHT_DEFAULT = 14;

/** Maximum block light level (for clamping) */
export const MAX_BLOCK_LIGHT_LEVEL = 15;

// =====================================================
// DIRECTION OFFSETS
// =====================================================

/**
 * Direction offsets for 6-neighbor light spreading.
 * Pre-computed for performance in tight loops.
 * @type {Array<{dx: number, dy: number, dz: number}>}
 */
export const LIGHT_DIRECTIONS = [
    { dx: 1, dy: 0, dz: 0 },   // +X (East)
    { dx: -1, dy: 0, dz: 0 },  // -X (West)
    { dx: 0, dy: 1, dz: 0 },   // +Y (Up)
    { dx: 0, dy: -1, dz: 0 },  // -Y (Down)
    { dx: 0, dy: 0, dz: 1 },   // +Z (South)
    { dx: 0, dy: 0, dz: -1 },  // -Z (North)
];

/**
 * Neighbor offsets as flat array (matches voxEx.html NEIGHBOR_OFFSETS).
 * Each entry is [dx, dy, dz].
 * @type {Array<Array<number>>}
 */
export const NEIGHBOR_OFFSETS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
];

// =====================================================
// LIGHT SOURCE DEFINITIONS
// =====================================================

/**
 * Block types that emit light and their base emission levels.
 * The actual level may be modified by settings (e.g., torchIntensity).
 * @type {Object<number, number>}
 */
export const LIGHT_EMITTERS = {
    [TORCH]: 14,  // TORCH emits level 14 light
};

/**
 * Check if a block type emits light.
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if the block emits light
 */
export function isLightEmitter(blockId) {
    return LIGHT_EMITTERS[blockId] !== undefined;
}

/**
 * Get the base light emission level for a block.
 * @param {number} blockId - Block ID to check
 * @returns {number} Light emission level (0 if not a light source)
 */
export function getLightEmission(blockId) {
    return LIGHT_EMITTERS[blockId] ?? 0;
}

// =====================================================
// EDGE LIGHTING CONSTANTS
// =====================================================

/** Maximum number of edge lighting passes per chunk */
export const MAX_EDGE_LIGHTING_PASSES = 3;

/** Default budget for edge lighting updates per frame */
export const EDGE_LIGHTING_BUDGET = 4;

// =====================================================
// SUNLIGHT TASK CONSTANTS
// =====================================================

/** Maximum light updates to process per frame */
export const MAX_LIGHT_UPDATES_PER_FRAME = 8;

/** Sunlight propagation steps to process per frame */
export const SUNLIGHT_STEPS_PER_FRAME = 512;

/** Base number of chunks before hard cap applies */
export const HARD_CAP_BASE_CHUNKS = 3;

/** Maximum chunks the hard cap will ever allow */
export const HARD_CAP_MAX_CHUNKS = 12;

/** Growth ratio for hard cap as more chunks are touched */
export const HARD_CAP_GROWTH_RATIO = 0.5;

/**
 * Clamp a block light value to valid range.
 * @param {number} level - Light level to clamp
 * @returns {number} Clamped light level (0-15)
 */
export function clampBlockLight(level) {
    if (level < 0) return 0;
    if (level > MAX_BLOCK_LIGHT_LEVEL) return MAX_BLOCK_LIGHT_LEVEL;
    return level;
}

// =====================================================
// AMBIENT OCCLUSION CONSTANTS
// =====================================================

/**
 * Pre-computed AO power curve lookup table.
 * Math.pow((3 - occlusionCount) / 3, 0.6) for occlusion counts 0-3.
 * Avoids expensive Math.pow calls in tight rendering loop.
 * @type {number[]}
 */
export const AO_LOOKUP = [
    1.0,   // 0 occlusions: Full brightness
    0.85,  // 1 occlusion: Slight darkening
    0.7,   // 2 occlusions: Moderate darkening
    0.5,   // 3 occlusions: Deep corners
];

/**
 * AO neighbor offset configurations for each face direction.
 * Each face has 4 vertices, each vertex checks 2 sides + 1 corner.
 * Format: [dx1, dy1, dz1, dx2, dy2, dz2, dxc, dyc, dzc]
 * @type {Object<string, number[][]>}
 */
export const AO_FACE_CONFIGS = {
    top: [
        [-1, 1, 0, 0, 1, 1, -1, 1, 1],   // ao1
        [1, 1, 0, 0, 1, 1, 1, 1, 1],     // ao2
        [1, 1, 0, 0, 1, -1, 1, 1, -1],   // ao3
        [-1, 1, 0, 0, 1, -1, -1, 1, -1]  // ao4
    ],
    bottom: [
        [-1, -1, 0, 0, -1, -1, -1, -1, -1],
        [1, -1, 0, 0, -1, -1, 1, -1, -1],
        [1, -1, 0, 0, -1, 1, 1, -1, 1],
        [-1, -1, 0, 0, -1, 1, -1, -1, 1]
    ],
    right: [
        [1, -1, 0, 1, 0, 1, 1, -1, 1],
        [1, -1, 0, 1, 0, -1, 1, -1, -1],
        [1, 1, 0, 1, 0, -1, 1, 1, -1],
        [1, 1, 0, 1, 0, 1, 1, 1, 1]
    ],
    left: [
        [-1, -1, 0, -1, 0, -1, -1, -1, -1],
        [-1, -1, 0, -1, 0, 1, -1, -1, 1],
        [-1, 1, 0, -1, 0, 1, -1, 1, 1],
        [-1, 1, 0, -1, 0, -1, -1, 1, -1]
    ],
    back: [
        [-1, 0, 1, 0, -1, 1, -1, -1, 1],
        [1, 0, 1, 0, -1, 1, 1, -1, 1],
        [1, 0, 1, 0, 1, 1, 1, 1, 1],
        [-1, 0, 1, 0, 1, 1, -1, 1, 1]
    ],
    front: [
        [1, 0, -1, 0, -1, -1, 1, -1, -1],
        [-1, 0, -1, 0, -1, -1, -1, -1, -1],
        [-1, 0, -1, 0, 1, -1, -1, 1, -1],
        [1, 0, -1, 0, 1, -1, 1, 1, -1]
    ]
};

/** AO cache size for full chunk with 6 face directions */
export const AO_CACHE_SIZE = 16 * 320 * 16 * 6;

/**
 * Get AO vertex offset configuration for a face based on its normal.
 * @param {number} nx - Face normal X component
 * @param {number} ny - Face normal Y component
 * @param {number} nz - Face normal Z component
 * @returns {number[][]} Array of 4 vertex offset configurations
 */
export function getAOConfig(nx, ny, nz) {
    if (ny > 0) return AO_FACE_CONFIGS.top;
    if (ny < 0) return AO_FACE_CONFIGS.bottom;
    if (nx > 0) return AO_FACE_CONFIGS.right;
    if (nx < 0) return AO_FACE_CONFIGS.left;
    if (nz > 0) return AO_FACE_CONFIGS.back;
    return AO_FACE_CONFIGS.front;
}

// =====================================================
// DEFERRED LIGHTING CONSTANTS
// =====================================================

/** Chunks beyond this distance use simplified lighting */
export const DEFERRED_LIGHT_DISTANCE = 16;

/** Allow lighting to finish before forcing rebuilds (ms) */
export const LIGHT_PENDING_GRACE_MS = 500;

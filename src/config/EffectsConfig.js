/**
 * VoxEx Effects Configuration
 * Particle system and visual effects constants.
 * @module config/EffectsConfig
 */

// =====================================================
// PARTICLE SYSTEM CONSTANTS
// =====================================================

/**
 * Core particle system configuration.
 * @type {Object}
 */
export const PARTICLE_CONFIG = {
    /** Maximum particles allowed in scene */
    maxParticles: 500,
    /** Pre-allocated particle pool size */
    poolSize: 200,
    /** Only update particles within this range (blocks) */
    updateDistance: 64,
};

// =====================================================
// WATER EFFECTS CONSTANTS
// =====================================================

/** Maximum concurrent water ripples */
export const MAX_WATER_RIPPLES = 20;

// =====================================================
// CLOUD CONSTANTS
// =====================================================

/** Base cloud particle count (multiplied by density setting) */
export const CLOUD_BASE_COUNT = 1500;

// =====================================================
// TORCH PARTICLE CONSTANTS
// =====================================================

/** Only spawn torch particles within this radius (blocks) */
export const PLACED_TORCH_PARTICLE_RADIUS = 24;

// =====================================================
// BLOCK BREAK TIMING
// =====================================================

/** Time to break a block in seconds (0 = instant) */
export const BREAK_TIME = 0;

// =====================================================
// NEIGHBOR RECONCILIATION
// =====================================================

/** Interval between neighbor chunk reconciliation (ms) */
export const NEIGHBOR_RECONCILE_INTERVAL_MS = 750;

/** Maximum neighbors to process per reconciliation cycle */
export const NEIGHBOR_RECONCILE_BUDGET = 4;

// =====================================================
// EFFECTS CONFIG OBJECT
// =====================================================

/**
 * Combined effects configuration for easy import.
 * @type {Object}
 */
export const EFFECTS_CONFIG = {
    particles: PARTICLE_CONFIG,
    water: {
        maxRipples: MAX_WATER_RIPPLES,
    },
    clouds: {
        baseCount: CLOUD_BASE_COUNT,
    },
    torch: {
        particleRadius: PLACED_TORCH_PARTICLE_RADIUS,
    },
    blockBreak: {
        time: BREAK_TIME,
    },
};

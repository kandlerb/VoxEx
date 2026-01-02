/**
 * VoxEx Zombie Configuration
 * Zombie entity behavior parameters.
 * @module config/ZombieConfig
 */

/**
 * Zombie behavior configuration
 * @type {Object}
 */
export const ZOMBIE_CONFIG = {
    maxCount: 8,
    spawnRadius: 48,
    despawnDistance: 140,
    detectionRadius: 28,
    attackRange: 2.5,
    wanderRadius: 10,
    walkSpeed: 2.4,
    chaseSpeed: 4.8,
    height: 2.05,         // Matches updated visual mesh height with safety margin
    radius: 0.55,         // Matches limb span to avoid clipping
    spawnCooldown: 3.5,
    attackCooldown: 1.2,
    attackDamage: 2,
    jumpForce: 4.25,
    cliffCheckDistance: 2.5,
    memoryDuration: 6,
    targetLostWanderDelay: 1.25,
    stuckMoveEpsilon: 0.01,
    stuckTimeout: 1.2,
    detourProbeStep: 0.8,
    detourProbeDepth: 2,
    detourSideBias: 0.65,
    sidestepSpeed: 3.2,
};

/**
 * Zombie eye height for look direction
 * @type {number}
 */
export const ZOMBIE_EYE_HEIGHT = 1.75;

/**
 * Zombie body proportions for mesh generation
 * @type {Object}
 */
export const ZOMBIE_PROPORTIONS = {
    hipY: 0.75,
    leg: {
        thickness: 0.25,
        thighHeight: 0.40,
        shinHeight: 0.35,
        get height() { return this.thighHeight + this.shinHeight; }
    },
    body: {
        height: 0.75,
        width: 0.5,
        depth: 0.25,
        segments: 3,
        get segmentHeight() { return this.height / this.segments; }
    },
    shoulderY: 1.5,
    arm: {
        thickness: 0.25,
        upperHeight: 0.40,
        forearmHeight: 0.35,
        get height() { return this.upperHeight + this.forearmHeight; }
    },
    head: { size: 0.5, height: 0.5, centerY: ZOMBIE_EYE_HEIGHT },
};

/**
 * Zombie scare effect defaults (vignette and desaturation)
 * @type {Object}
 */
export const ZOMBIE_EFFECTS = {
    vignetteEnabled: true,
    desaturationEnabled: true,
    vignetteIntensity: 0.7,
    vignetteColor: 0x330000,
    desaturationAmount: 0.5,
    effectRange: 20,
    effectFalloff: 10,
};

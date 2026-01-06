/**
 * VoxEx Player Configuration
 * Player body proportions and physics.
 * @module config/PlayerConfig
 */

/**
 * Player body proportions scaled to PLAYER_EYE_HEIGHT_STAND (1.8).
 * Slightly taller than zombies for visual distinction.
 * @type {Object}
 */
export const PLAYER_PROPORTIONS = {
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
    head: { size: 0.5, height: 0.5, centerY: 1.75 },
};

/**
 * Player physics constants
 * @type {Object}
 */
export const PLAYER_PHYSICS = {
    eyeHeightStand: 1.8,
    eyeHeightCrouch: 1.2,
    colliderRadius: 0.4,
    colliderHeight: 1.8,
    colliderHeightCrouch: 1.2,
    stepHeight: 0.5,
    swimSpeed: 5.0,
    swimSinkRate: 2.0,
    swimRiseRate: 4.0,
};

/**
 * Crouch pose parameters - asymmetric pose for natural weight distribution.
 * Uses fixed pelvisDrop with synchronized smooth factors for body/legs.
 * @type {Object}
 */
export const CROUCH_PARAMS = {
    pelvisDrop: 0.25,

    // Spine rotations - forward lean distributed across segments
    lowerSpineLean: 0.2793,   // 16°
    midSpineLean: 0.3840,     // 22°
    upperSpineLean: 0.3840,   // 22°

    // Head position and rotation
    headY: 0.450,
    headZ: 0.080,
    headPitch: -0.7505,       // -43° looking up to compensate

    // Left arm - more forward, supporting position
    leftArmX: -1.0472,        // -60°
    leftArmZ: 0.1396,         // 8°
    leftElbow: 0.7854,        // 45°

    // Right arm - relaxed
    rightArmX: -0.2618,       // -15°
    rightArmZ: -0.1396,       // -8°
    rightElbow: 0.8378,       // 48°

    // Left leg - more forward, weight-bearing
    leftHipAngle: -1.1694,    // -67°
    leftLegSplay: 0.1745,     // 10°
    leftKnee: 0.8378,         // 48°

    // Right leg - less forward, extended
    rightHipAngle: -0.8029,   // -46°
    rightLegSplay: -0.1745,   // -10°
    rightKnee: 1.3788,        // 79°

    // Movement - stride rate and amplitude for crouch-walking
    strideRate: 4.0,
    legAmplitude: 0.20,       // Reduced for smaller steps
    armAmplitude: 0.10,
};

/**
 * Sprint pose parameters
 * @type {Object}
 */
export const SPRINT_PARAMS = {
    lowerSpineLean: 0.349,    // 20° pelvis forward
    midSpineLean: 0.175,      // 10° abdomen
    upperSpineLean: 0.087,    // 5° chest

    headY: 0.50,
    headZ: 0,
    headPitch: -0.175,        // -10°

    armForwardSwing: -0.7,
    armBackwardSwing: 0.7,
    armSpread: 0,
    elbowForward: 1.05,
    elbowBackward: 1.05,

    legForwardHip: -1.047,
    legBackwardHip: 0.785,
    legForwardKnee: 0.35,
    legBackwardKnee: 1.4,
};

/**
 * Flight head lean parameters - spring-based interpolation for natural motion.
 * Head leans upward toward horizon when flying + moving.
 * @type {Object}
 */
export const FLIGHT_HEAD_LEAN = {
    target: -0.26,      // 15° upward (negative X = look up)
    halflife: 0.12,     // Spring halflife in seconds
};

/**
 * Player skin color palette with base, shadow, and highlight variants.
 * @type {Object}
 */
export const PLAYER_SKIN_COLORS = {
    base: ['#e8beac', '#ddb59c', '#d9a693'],
    shadow: ['#c99a78', '#c08a68', '#b57a58'],
    highlight: ['#f5d4c2', '#f0c8b4', '#ebc0a8']
};

/**
 * Available hair color palettes for player character.
 * @type {Array<{name: string, base: string, shadow: string, highlight: string}>}
 */
export const PLAYER_HAIR_PALETTES = [
    { name: 'brown', base: '#5b3d25', shadow: '#3f2a18', highlight: '#714d2f' },
    { name: 'black', base: '#2a2423', shadow: '#1a1615', highlight: '#3a322f' },
    { name: 'blonde', base: '#c2a152', shadow: '#9d7d37', highlight: '#e3c56f' },
    { name: 'red', base: '#8b3a1d', shadow: '#6e2a12', highlight: '#a54a2d' },
];

/**
 * Player shirt color palette.
 * @type {Object}
 */
export const PLAYER_SHIRT_COLORS = {
    base: ['#3a6ea5', '#3366a0', '#2d5a8a'],
    shadow: ['#2d5a8a', '#254d78', '#1e4670'],
    highlight: ['#4a7eb5', '#4278b0', '#3a72a8']
};

/**
 * Player pants color palette.
 * @type {Object}
 */
export const PLAYER_PANTS_COLORS = {
    base: ['#4a4a4a', '#454545', '#404040'],
    shadow: ['#3d3d3d', '#383838', '#333333'],
    highlight: ['#555555', '#505050', '#4d4d4d']
};

// Cache selected hair palette for consistency across body parts
let _selectedHairPalette = null;

/**
 * Get the player's hair palette (cached for consistency).
 * @returns {{name: string, base: string, shadow: string, highlight: string}}
 */
export function getPlayerHairPalette() {
    if (!_selectedHairPalette) {
        _selectedHairPalette = PLAYER_HAIR_PALETTES[Math.floor(Math.random() * PLAYER_HAIR_PALETTES.length)];
    }
    return _selectedHairPalette;
}

/**
 * Reset the cached hair palette (for new character).
 */
export function resetPlayerHairPalette() {
    _selectedHairPalette = null;
}

/**
 * Flying sprint pose - superman pose for fast flight.
 * Extended from fly_sprint preset with spring halflife.
 * @type {Object}
 */
export const FLYING_SPRINT_POSE = {
    halflife: 0.15,  // Spring halflife for smooth transitions
    // Pose values (from fly_sprint preset)
    bodyY: 0.75,
    lowerSpineX: 1.047, lowerSpineZ: 0, lowerSpineY: 0,
    midSpineX: 0.087, midSpineZ: 0, midSpineY: 0,
    upperSpineX: 0.087, upperSpineZ: 0, upperSpineY: 0,
    headY: 0.45, headZ: 0, headX: -0.82,
    leftArmX: -2.793, leftArmZ: 0.087, leftArmY: 0, leftElbow: 0.122,
    rightArmX: 0.349, rightArmZ: -0.087, rightArmY: 0, rightElbow: 0.698,
    leftLegX: 0.384, leftLegZ: 0, leftKnee: 0.175,
    rightLegX: -0.873, rightLegZ: 0, rightKnee: 1.326,
};

/**
 * Base flying pose (used for blending with sprint).
 * Extended from fly_forward preset.
 * @type {Object}
 */
export const BASE_FLY = {
    bodyY: 0.75,
    lowerSpineX: 0.4, lowerSpineZ: 0, lowerSpineY: 0,
    midSpineX: 0, midSpineZ: 0, midSpineY: 0,
    upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
    headY: 0.5, headZ: 0.1, headX: 0,  // Head uses flightHeadLeanCurrent separately
    leftArmX: 0.8, leftArmZ: 0.15, leftArmY: 0, leftElbow: 0.2,
    rightArmX: 0.8, rightArmZ: -0.15, rightArmY: 0, rightElbow: 0.2,
    leftLegX: 0.4, leftLegZ: 0, leftKnee: 0.15,
    rightLegX: -0.5, rightLegZ: 0, rightKnee: 1.1,
};

/**
 * Landing impact absorption parameters.
 * Controls spring recovery and compression limits.
 * @type {Object}
 */
export const IMPACT_ABSORPTION = {
    // Recovery halflife per joint (staged recovery)
    legBendHalflife: 0.20,
    legSplayHalflife: 0.18,
    hipHalflife: 0.20,
    spineHalflife: 0.18,
    armHalflife: 0.15,
    headHalflife: 0.12,
    // Compression multipliers
    legBendMultiplier: 0.15,
    legSplayMultiplier: 0.02,
    hipMultiplier: 0.03,
    spineMultiplier: 0.04,
    armMultiplier: 0.06,
    headMultiplier: 0.03,
    // Maximum limits (conservative to prevent clipping)
    maxLegBend: 0.35,
    maxLegSplay: 0.05,
    maxHipDrop: 0.08,
    maxSpineCompress: 0.10,
    maxArmSwing: 0.15,
    maxHeadCounter: 0.08,
    // Velocity thresholds
    velocityThreshold: 9.0,      // Below this = no impact animation
    knockdownVelocity: 18.0,     // Above this = knockdown sequence
};

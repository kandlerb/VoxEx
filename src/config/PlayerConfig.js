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

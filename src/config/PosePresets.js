/**
 * VoxEx Pose Presets
 * Animation pose definitions for player and zombies.
 * @module config/PosePresets
 */

/**
 * Pose constraint limits to prevent body part interpenetration.
 * Values are in radians.
 * @type {Object}
 */
export const POSE_CONSTRAINTS = {
    knee: {
        maxBend: 1.4,        // ~80° absolute max knee bend
        minBend: 0,          // No backward knee bend
        hipInfluence: 0.6,   // How much hip angle affects knee limit
    },
    elbow: {
        maxBend: 2.5,        // ~143° max elbow bend (full flexion)
        minBend: 0,          // No hyperextension
    },
    arm: {
        maxForward: 3.14,    // 180° forward
        maxBackward: -0.8,   // ~46° backward
        maxSpread: 1.57,     // 90° outward (Z rotation)
    },
    leg: {
        maxForward: -1.57,   // 90° forward (negative = forward)
        maxBackward: 0.8,    // ~46° backward
        maxSplay: 0.5,       // ~29° outward spread
    },
    head: {
        maxPitch: 1.0,       // ~57° down
        minPitch: -1.0,      // ~57° up
        maxYaw: 1.4,         // ~80° turn
    },
};

/**
 * Pose presets for debug mode. Values in radians for rotations, units for positions.
 * @type {Object<string, Object>}
 */
export const POSE_PRESETS = {
    // Standing poses
    stand_idle: {
        bodyY: 0.75, lowerSpineX: 0, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0, midSpineZ: 0, midSpineY: 0, upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: 0, leftArmX: 0, leftArmZ: 0, leftArmY: 0, leftElbow: 0,
        rightArmX: 0, rightArmZ: 0, rightArmY: 0, rightElbow: 0, leftLegX: 0, leftLegZ: 0, leftKnee: 0,
        rightLegX: 0, rightLegZ: 0, rightKnee: 0,
    },
    stand_walk: {
        bodyY: 0.75, lowerSpineX: 0.05, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0, midSpineZ: 0, midSpineY: 0, upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: 0, leftArmX: 0.35, leftArmZ: 0, leftArmY: 0, leftElbow: 0.2,
        rightArmX: -0.35, rightArmZ: 0, rightArmY: 0, rightElbow: 0.2, leftLegX: -0.35, leftLegZ: 0, leftKnee: 0.1,
        rightLegX: 0.35, rightLegZ: 0, rightKnee: 0.4,
    },
    stand_sprint: {
        bodyY: 0.75, lowerSpineX: 0.349, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0.175, midSpineZ: 0, midSpineY: 0, upperSpineX: 0.087, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0, headX: -0.175, leftArmX: 0.7, leftArmZ: 0, leftArmY: 0, leftElbow: 1.05,
        rightArmX: -0.7, rightArmZ: 0, rightArmY: 0, rightElbow: 1.05, leftLegX: -1.047, leftLegZ: 0, leftKnee: 0.35,
        rightLegX: 0.785, rightLegZ: 0, rightKnee: 1.4,
    },
    // Crouching poses
    crouch_idle: {
        bodyY: 0.50, lowerSpineX: 0.2793, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0.384, midSpineZ: 0, midSpineY: 0, upperSpineX: 0.384, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.45, headZ: 0.08, headX: -0.7505, leftArmX: -1.0472, leftArmZ: 0.1396, leftArmY: 0, leftElbow: 0.7854,
        rightArmX: -0.2618, rightArmZ: -0.1396, rightArmY: 0, rightElbow: 0.8378, leftLegX: -1.1694, leftLegZ: 0.1745, leftKnee: 0.8378,
        rightLegX: -0.8029, rightLegZ: -0.1745, rightKnee: 1.3788,
    },
    crouch_walk: {
        bodyY: 0.5, lowerSpineX: 0.1, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0.262, midSpineZ: 0, midSpineY: 0, upperSpineX: 0.262, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.45, headZ: 0.05, headX: -0.524, leftArmX: -0.15, leftArmZ: -0.087, leftArmY: 0, leftElbow: 0.524,
        rightArmX: -0.35, rightArmZ: 0.087, rightArmY: 0, rightElbow: 0.524, leftLegX: -1.1, leftLegZ: 0.12, leftKnee: 1.3,
        rightLegX: -0.8, rightLegZ: -0.12, rightKnee: 0.9,
    },
    crouch_sprint: {
        bodyY: 0.5, lowerSpineX: 0.2, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0.35, midSpineZ: 0, midSpineY: 0, upperSpineX: 0.262, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.45, headZ: 0.05, headX: -0.4, leftArmX: 0.3, leftArmZ: -0.087, leftArmY: 0, leftElbow: 0.7,
        rightArmX: -0.5, rightArmZ: 0.087, rightArmY: 0, rightElbow: 0.7, leftLegX: -1.3, leftLegZ: 0.12, leftKnee: 0.5,
        rightLegX: -0.6, rightLegZ: -0.12, rightKnee: 1.5,
    },
    // Flying poses
    fly_idle: {
        bodyY: 0.75, lowerSpineX: 0, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0, midSpineZ: 0, midSpineY: 0, upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: 0, leftArmX: 0.2, leftArmZ: 0.5, leftArmY: 0, leftElbow: 0.3,
        rightArmX: 0.2, rightArmZ: -0.5, rightArmY: 0, rightElbow: 0.3, leftLegX: -0.25, leftLegZ: 0, leftKnee: 0.4,
        rightLegX: -0.35, rightLegZ: 0, rightKnee: 0.6,
    },
    fly_forward: {
        bodyY: 0.75, lowerSpineX: 0.4, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0, midSpineZ: 0, midSpineY: 0, upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: -0.26, leftArmX: 0.8, leftArmZ: 0.15, leftArmY: 0, leftElbow: 0.2,
        rightArmX: 0.8, rightArmZ: -0.15, rightArmY: 0, rightElbow: 0.2, leftLegX: 0.4, leftLegZ: 0, leftKnee: 0.15,
        rightLegX: -0.5, rightLegZ: 0, rightKnee: 1.1,
    },
    fly_sprint: {
        bodyY: 0.75, lowerSpineX: 1.047, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0.087, midSpineZ: 0, midSpineY: 0, upperSpineX: 0.087, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.45, headZ: 0, headX: -0.82, leftArmX: -2.793, leftArmZ: 0.087, leftArmY: 0, leftElbow: 0.122,
        rightArmX: 0.349, rightArmZ: -0.087, rightArmY: 0, rightElbow: 0.698, leftLegX: 0.384, leftLegZ: 0, leftKnee: 0.175,
        rightLegX: -0.873, rightLegZ: 0, rightKnee: 1.326,
    },
    // Airborne poses
    jumping: {
        bodyY: 0.75, lowerSpineX: -0.1, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0, midSpineZ: 0, midSpineY: 0, upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: -0.15, leftArmX: 0.5, leftArmZ: 0.35, leftArmY: 0, leftElbow: 0.5,
        rightArmX: 0.5, rightArmZ: -0.35, rightArmY: 0, rightElbow: 0.5, leftLegX: -0.3, leftLegZ: 0, leftKnee: 0.25,
        rightLegX: -0.4, rightLegZ: 0, rightKnee: 0.2,
    },
    falling: {
        bodyY: 0.75, lowerSpineX: 0.1, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0, midSpineZ: 0, midSpineY: 0, upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: -0.15, leftArmX: -0.3, leftArmZ: 0.6, leftArmY: 0, leftElbow: 0.5,
        rightArmX: -0.3, rightArmZ: -0.6, rightArmY: 0, rightElbow: 0.5, leftLegX: -0.3, leftLegZ: 0.15, leftKnee: 0.25,
        rightLegX: -0.3, rightLegZ: -0.15, rightKnee: 0.25,
    },
    landing: {
        bodyY: 0.55, lowerSpineX: 0.2, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0.1, midSpineZ: 0, midSpineY: 0, upperSpineX: 0.05, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: -0.1, leftArmX: -0.2, leftArmZ: 0.3, leftArmY: 0, leftElbow: 0.4,
        rightArmX: -0.2, rightArmZ: -0.3, rightArmY: 0, rightElbow: 0.4, leftLegX: -0.5, leftLegZ: 0.1, leftKnee: 0.7,
        rightLegX: -0.5, rightLegZ: -0.1, rightKnee: 0.7,
    },
    // Swimming poses
    swim_idle_surface: {
        bodyY: 0.75, lowerSpineX: 0.2, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0, midSpineZ: 0, midSpineY: 0, upperSpineX: -0.1, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: -0.2, leftArmX: 0.1, leftArmZ: 0.7, leftArmY: 0, leftElbow: 0.4,
        rightArmX: 0.1, rightArmZ: -0.7, rightArmY: 0, rightElbow: 0.4, leftLegX: -0.3, leftLegZ: 0.2, leftKnee: 0.8,
        rightLegX: -0.5, rightLegZ: -0.2, rightKnee: 1.0,
    },
    swim_forward: {
        bodyY: 0.75, lowerSpineX: 0.8, lowerSpineZ: 0, lowerSpineY: 0, midSpineX: 0.1, midSpineZ: 0, midSpineY: 0, upperSpineX: 0, upperSpineZ: 0, upperSpineY: 0,
        headY: 0.5, headZ: 0.1, headX: -0.5, leftArmX: 1.2, leftArmZ: 0.2, leftArmY: 0, leftElbow: 0.1,
        rightArmX: -0.3, rightArmZ: -0.2, rightArmY: 0, rightElbow: 0.5, leftLegX: 0.3, leftLegZ: 0, leftKnee: 0.2,
        rightLegX: -0.2, rightLegZ: 0, rightKnee: 0.4,
    },
};

/**
 * Knockdown animation keyframes with timestamps.
 * Animation flows: impact(0s) → collapse(0.15s) → ground(0.35s-2.35s hold) → pushup(2.50s) → kneel(3.00s) → stand(3.50s)
 * @type {Array<{time: number, pose: Object}>}
 */
export const KNOCKDOWN_KEYFRAMES = [
    {
        time: 0.0,  // Start - hard impact
        pose: {
            bodyY: 0.560,
            lowerSpineX: 0.6632, lowerSpineZ: -0.0524, lowerSpineY: 0.05,
            midSpineX: 0.4363, midSpineZ: 0.0000, midSpineY: 0,
            upperSpineX: 0.1745, upperSpineZ: 0.0000, upperSpineY: -0.03,
            headY: 0.500, headZ: 0.170, headX: 0.2269,
            leftArmX: -0.3142, leftArmZ: 0.6458, leftArmY: 0.1, leftElbow: 0.7854,
            rightArmX: -0.7505, rightArmZ: -0.7854, rightArmY: -0.15, rightElbow: 0.2793,
            leftLegX: -1.2915, leftLegZ: 0.3491, leftKnee: 0.9599,
            rightLegX: -1.2566, rightLegZ: -0.2443, rightKnee: 0.9599,
        }
    },
    {
        time: 0.15,  // Collapse forward
        pose: {
            bodyY: 0.420,
            lowerSpineX: 1.1868, lowerSpineZ: -0.0524, lowerSpineY: 0.08,
            midSpineX: 0.1222, midSpineZ: 0.0000, midSpineY: 0.03,
            upperSpineX: 0.0698, upperSpineZ: 0.0000, upperSpineY: -0.05,
            headY: 0.500, headZ: 0.070, headX: -0.5061,
            leftArmX: -0.9425, leftArmZ: 0.8203, leftArmY: 0.15, leftElbow: 0.7854,
            rightArmX: -1.7279, rightArmZ: -0.6632, rightArmY: -0.1, rightElbow: 0.2793,
            leftLegX: -0.3491, leftLegZ: 0.3840, leftKnee: 0.6632,
            rightLegX: -0.4014, rightLegZ: -0.3491, rightKnee: 0.8378,
        }
    },
    {
        time: 0.35,  // On ground (start of 2.0s hold)
        pose: {
            bodyY: 0.250,
            lowerSpineX: 1.5010, lowerSpineZ: -0.0698, lowerSpineY: 0,
            midSpineX: 0.0000, midSpineZ: 0.0000, midSpineY: 0,
            upperSpineX: 0.0000, upperSpineZ: 0.0000, upperSpineY: 0,
            headY: 0.390, headZ: -0.020, headX: -0.9774,
            leftArmX: -1.2741, leftArmZ: 1.5184, leftArmY: 0, leftElbow: -0.5,
            rightArmX: -2.0420, rightArmZ: -1.2566, rightArmY: 0, rightElbow: -0.5,
            leftLegX: -0.0349, leftLegZ: 0.4887, leftKnee: 0.1396,
            rightLegX: -0.0524, rightLegZ: -0.3316, rightKnee: 0.1571,
        }
    },
    {
        time: 2.35,  // On ground (end of 2.0s hold) - DUPLICATE POSE
        pose: {
            bodyY: 0.250,
            lowerSpineX: 1.5010, lowerSpineZ: -0.0698, lowerSpineY: 0,
            midSpineX: 0.0000, midSpineZ: 0.0000, midSpineY: 0,
            upperSpineX: 0.0000, upperSpineZ: 0.0000, upperSpineY: 0,
            headY: 0.390, headZ: -0.020, headX: -0.9774,
            leftArmX: -1.2741, leftArmZ: 1.5184, leftArmY: 0, leftElbow: -0.5,
            rightArmX: -2.0420, rightArmZ: -1.2566, rightArmY: 0, rightElbow: -0.5,
            leftLegX: -0.0349, leftLegZ: 0.4887, leftKnee: 0.1396,
            rightLegX: -0.0524, rightLegZ: -0.3316, rightKnee: 0.1571,
        }
    },
    {
        time: 2.50,  // Start push up
        pose: {
            bodyY: 0.510,
            lowerSpineX: 1.2566, lowerSpineZ: -0.0698, lowerSpineY: 0.04,
            midSpineX: 0.0873, midSpineZ: 0.0000, midSpineY: 0.02,
            upperSpineX: 0.0698, upperSpineZ: 0.0000, upperSpineY: -0.02,
            headY: 0.500, headZ: 0.000, headX: -0.2967,
            leftArmX: -1.7104, leftArmZ: 0.4538, leftArmY: 0.05, leftElbow: 0.3665,
            rightArmX: -0.9425, rightArmZ: -0.2967, rightArmY: -0.05, rightElbow: 0.5411,
            leftLegX: -0.5061, leftLegZ: 0.3142, leftKnee: 0.5760,
            rightLegX: -0.9076, rightLegZ: -0.0873, rightKnee: 0.9076,
        }
    },
    {
        time: 3.00,  // Kneeling
        pose: {
            bodyY: 0.500,
            lowerSpineX: 0.5934, lowerSpineZ: 0.0000, lowerSpineY: 0.02,
            midSpineX: 0.1396, midSpineZ: 0.1047, midSpineY: 0.01,
            upperSpineX: 0.0698, upperSpineZ: 0.0698, upperSpineY: -0.01,
            headY: 0.500, headZ: 0.000, headX: -0.2967,
            leftArmX: -0.7679, leftArmZ: 0.1047, leftArmY: 0.02, leftElbow: 0.1222,
            rightArmX: -0.3142, rightArmZ: -0.2618, rightArmY: -0.02, rightElbow: 0.6981,
            leftLegX: -0.1396, leftLegZ: 0.1571, leftKnee: 0.9250,
            rightLegX: -1.6406, rightLegZ: -0.0524, rightKnee: 1.0297,
        }
    },
    {
        time: 3.50,  // Standing (end pose)
        pose: {
            bodyY: 0.750,
            lowerSpineX: 0.0000, lowerSpineZ: 0.0000, lowerSpineY: 0,
            midSpineX: 0.0349, midSpineZ: 0.0000, midSpineY: 0,
            upperSpineX: 0.0349, upperSpineZ: 0.0000, upperSpineY: 0,
            headY: 0.500, headZ: 0.100, headX: -0.0524,
            leftArmX: -0.0873, leftArmZ: 0.1047, leftArmY: 0, leftElbow: 0.1047,
            rightArmX: 0.1222, rightArmZ: -0.0698, rightArmY: 0, rightElbow: 0.1745,
            leftLegX: -0.1222, leftLegZ: 0.1047, leftKnee: 0.1222,
            rightLegX: 0.1396, rightLegZ: -0.0698, rightKnee: 0.1396,
        }
    },
];

/**
 * Total knockdown animation duration
 * @type {number}
 */
export const KNOCKDOWN_TOTAL_DURATION = 3.50;

// Add knockdown poses to POSE_PRESETS for debug panel dropdown
POSE_PRESETS.knockdown_impact = KNOCKDOWN_KEYFRAMES[0].pose;
POSE_PRESETS.knockdown_collapse = KNOCKDOWN_KEYFRAMES[1].pose;
POSE_PRESETS.knockdown_ground = KNOCKDOWN_KEYFRAMES[2].pose;
POSE_PRESETS.knockdown_pushup = KNOCKDOWN_KEYFRAMES[4].pose;
POSE_PRESETS.knockdown_kneel = KNOCKDOWN_KEYFRAMES[5].pose;

// =====================================================
// POSE FIELD DEFINITIONS
// =====================================================

/**
 * Fields that represent position offsets (not rotations).
 * Used by smoothPose to identify which fields need linear interpolation
 * vs spring-based angular interpolation.
 * @type {string[]}
 */
export const POSE_POSITION_FIELDS = ['bodyY', 'headY', 'headZ'];

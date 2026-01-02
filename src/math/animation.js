/**
 * VoxEx Animation Math
 * Spring-based animation and pose interpolation functions.
 * @module math/animation
 */

import { POSE_CONSTRAINTS } from '../config/PosePresets.js';

/**
 * Exact critically damped spring function for smooth animation without overshoot.
 * Uses exponential decay to guarantee convergence without oscillation.
 * @param {number} current - Current value
 * @param {number} velocity - Current velocity
 * @param {number} target - Target value
 * @param {number} halflife - Time to reach halfway to target (seconds)
 * @param {number} dt - Delta time in seconds
 * @returns {{value: number, velocity: number}} New value and velocity
 */
export function springDamper(current, velocity, target, halflife, dt) {
    // Compute damping coefficient from halflife
    const y = (4.0 * Math.LN2) / halflife;
    const halfY = y * 0.5;

    // Compute spring terms
    const j0 = current - target;
    const j1 = velocity + j0 * halfY;

    // Exponential decay factor (critically damped)
    const eydt = Math.exp(-halfY * dt);

    // Compute new position and velocity
    const newValue = eydt * (j0 + j1 * dt) + target;
    const newVelocity = eydt * (velocity - j1 * halfY * dt);

    return { value: newValue, velocity: newVelocity };
}

/**
 * Apply spring damper to multiple properties at once
 * @param {Object} state - Object with current values
 * @param {Object} velocities - Object with current velocities
 * @param {Object} targets - Object with target values
 * @param {number} halflife - Spring halflife
 * @param {number} dt - Delta time
 * @param {string[]} keys - Keys to update
 */
export function springDamperMultiple(state, velocities, targets, halflife, dt, keys) {
    for (const key of keys) {
        if (targets[key] !== undefined) {
            const result = springDamper(
                state[key] ?? 0,
                velocities[key] ?? 0,
                targets[key],
                halflife,
                dt
            );
            state[key] = result.value;
            velocities[key] = result.velocity;
        }
    }
}

/**
 * Smooth pose interpolation using exponential decay.
 * Avoids per-frame function allocation when called from animation loops.
 * @param {Object} poseCache - The pose object to update
 * @param {string} key - The key in the pose object to smooth
 * @param {number} target - Target value to interpolate towards
 * @param {number} factor - Smoothing factor (default 0.18)
 * @param {number} dt - Delta time in seconds
 * @returns {number} The smoothed value
 */
export function smoothPose(poseCache, key, target, factor, dt) {
    const current = poseCache[key] ?? 0;
    poseCache[key] = lerp(current, target, 1 - Math.pow(1 - factor, dt * 60));
    return poseCache[key];
}

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Clamp value to range
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Apply geometric constraints to animation targets to prevent body part interpenetration.
 * Modifies target values in-place based on relationships between joints.
 * @param {Object} targets - Object containing all target values to constrain
 */
export function applyPoseConstraints(targets) {
    const C = POSE_CONSTRAINTS;

    // Knee constraint: limit bend based on hip angle
    const leftHipForward = Math.max(0, -(targets.leftLegX ?? 0));
    const rightHipForward = Math.max(0, -(targets.rightLegX ?? 0));

    // Calculate dynamic knee limits
    const leftKneeMax = Math.max(0.1, C.knee.maxBend - leftHipForward * C.knee.hipInfluence);
    const rightKneeMax = Math.max(0.1, C.knee.maxBend - rightHipForward * C.knee.hipInfluence);

    if (targets.leftKnee !== undefined) {
        targets.leftKnee = clamp(targets.leftKnee, C.knee.minBend, leftKneeMax);
    }
    if (targets.rightKnee !== undefined) {
        targets.rightKnee = clamp(targets.rightKnee, C.knee.minBend, rightKneeMax);
    }

    // Elbow constraints
    if (targets.leftElbow !== undefined) {
        targets.leftElbow = clamp(targets.leftElbow, C.elbow.minBend, C.elbow.maxBend);
    }
    if (targets.rightElbow !== undefined) {
        targets.rightElbow = clamp(targets.rightElbow, C.elbow.minBend, C.elbow.maxBend);
    }

    // Arm swing constraints
    if (targets.leftArmX !== undefined) {
        targets.leftArmX = clamp(targets.leftArmX, C.arm.maxBackward, C.arm.maxForward);
    }
    if (targets.rightArmX !== undefined) {
        targets.rightArmX = clamp(targets.rightArmX, C.arm.maxBackward, C.arm.maxForward);
    }
    if (targets.leftArmZ !== undefined) {
        targets.leftArmZ = clamp(targets.leftArmZ, -C.arm.maxSpread, C.arm.maxSpread);
    }
    if (targets.rightArmZ !== undefined) {
        targets.rightArmZ = clamp(targets.rightArmZ, -C.arm.maxSpread, C.arm.maxSpread);
    }

    // Leg swing constraints
    if (targets.leftLegX !== undefined) {
        targets.leftLegX = clamp(targets.leftLegX, C.leg.maxForward, C.leg.maxBackward);
    }
    if (targets.rightLegX !== undefined) {
        targets.rightLegX = clamp(targets.rightLegX, C.leg.maxForward, C.leg.maxBackward);
    }
    if (targets.leftLegZ !== undefined) {
        targets.leftLegZ = clamp(targets.leftLegZ, -C.leg.maxSplay, C.leg.maxSplay);
    }
    if (targets.rightLegZ !== undefined) {
        targets.rightLegZ = clamp(targets.rightLegZ, -C.leg.maxSplay, C.leg.maxSplay);
    }

    // Head rotation constraints
    if (targets.headX !== undefined) {
        targets.headX = clamp(targets.headX, C.head.minPitch, C.head.maxPitch);
    }
}

/**
 * Smooth step function (cubic Hermite interpolation)
 * @param {number} edge0 - Lower edge
 * @param {number} edge1 - Upper edge
 * @param {number} x - Input value
 * @returns {number} Smooth interpolation (0 to 1)
 */
export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * Ease in (quadratic)
 * @param {number} t - Input value (0-1)
 * @returns {number} Eased value
 */
export function easeIn(t) {
    return t * t;
}

/**
 * Ease out (quadratic)
 * @param {number} t - Input value (0-1)
 * @returns {number} Eased value
 */
export function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
}

/**
 * Ease in-out (cubic)
 * @param {number} t - Input value (0-1)
 * @returns {number} Eased value
 */
export function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Interpolate between keyframes
 * @param {Array<{time: number, pose: Object}>} keyframes - Array of keyframes
 * @param {number} time - Current time
 * @returns {Object} Interpolated pose
 */
export function interpolateKeyframes(keyframes, time) {
    if (keyframes.length === 0) return {};
    if (time <= keyframes[0].time) return { ...keyframes[0].pose };
    if (time >= keyframes[keyframes.length - 1].time) {
        return { ...keyframes[keyframes.length - 1].pose };
    }

    // Find surrounding keyframes
    let i = 0;
    while (i < keyframes.length - 1 && keyframes[i + 1].time < time) {
        i++;
    }

    const kf1 = keyframes[i];
    const kf2 = keyframes[i + 1];
    const t = (time - kf1.time) / (kf2.time - kf1.time);

    // Interpolate all pose properties
    const result = {};
    for (const key in kf1.pose) {
        if (kf2.pose[key] !== undefined) {
            result[key] = lerp(kf1.pose[key], kf2.pose[key], t);
        } else {
            result[key] = kf1.pose[key];
        }
    }

    return result;
}

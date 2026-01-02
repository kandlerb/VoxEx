/**
 * Player procedural animation system
 * @module entities/player/PlayerAnimation
 */

import { POSE_PRESETS, POSE_CONSTRAINTS } from '../../config/PosePresets.js';
import { springDamper, applyPoseConstraints } from '../../math/animation.js';

/**
 * @typedef {'idle'|'walk'|'sprint'|'crouch'|'fly'|'jump'|'fall'|'swim'} AnimationState
 */

/**
 * Animation state for player model.
 * Handles pose interpolation, locomotion cycles, and state blending.
 */
export class PlayerAnimation {
    constructor() {
        // Current pose values (interpolated)
        this.pose = this.createDefaultPose();

        // Velocities for spring interpolation
        this.velocities = this.createDefaultPose();

        // Animation phases for locomotion cycles
        this.walkPhase = 0;
        this.armSwingPhase = 0;
        this.swimPhase = 0;

        /** @type {AnimationState} */
        this.currentState = 'idle';
        this.previousState = 'idle';

        // State transition blending
        this.stateBlendTime = 0;
        this.stateBlendDuration = 0.15;

        // Spring halflife for pose interpolation
        this.poseHalflife = 0.1;

        // Locomotion parameters
        this.walkCycleSpeed = 8;
        this.sprintCycleSpeed = 12;
        this.swimCycleSpeed = 4;
    }

    /**
     * Create default pose object with all animation properties
     * @returns {Object}
     */
    createDefaultPose() {
        return {
            // Body position
            bodyY: 0.75,

            // Spine rotations (lower, mid, upper)
            lowerSpineX: 0,
            lowerSpineZ: 0,
            lowerSpineY: 0,
            midSpineX: 0,
            midSpineZ: 0,
            midSpineY: 0,
            upperSpineX: 0,
            upperSpineZ: 0,
            upperSpineY: 0,

            // Head
            headY: 0.5,
            headZ: 0.1,
            headX: 0,

            // Arms
            leftArmX: 0,
            leftArmZ: 0,
            leftArmY: 0,
            leftElbow: 0,
            rightArmX: 0,
            rightArmZ: 0,
            rightArmY: 0,
            rightElbow: 0,

            // Legs
            leftLegX: 0,
            leftLegZ: 0,
            leftKnee: 0,
            rightLegX: 0,
            rightLegZ: 0,
            rightKnee: 0
        };
    }

    /**
     * Determine animation state from player controller state
     * @param {Object} playerState - Player controller state
     * @returns {AnimationState}
     */
    determineState(playerState) {
        if (playerState.isSwimming) {
            return playerState.isMoving() ? 'swim' : 'swim';
        }
        if (playerState.isFlying) {
            if (playerState.isSprinting) return 'fly';
            return playerState.isMoving() ? 'fly' : 'fly';
        }
        if (!playerState.onGround) {
            return playerState.vy > 0 ? 'jump' : 'fall';
        }
        if (playerState.isCrouching) {
            return playerState.isMoving() ? 'crouch' : 'crouch';
        }
        if (playerState.isSprinting) {
            return 'sprint';
        }
        if (playerState.isMoving()) {
            return 'walk';
        }
        return 'idle';
    }

    /**
     * Get target pose preset for current state
     * @param {AnimationState} state
     * @param {boolean} isMoving
     * @returns {Object}
     */
    getTargetPose(state, isMoving) {
        switch (state) {
            case 'idle':
                return POSE_PRESETS.stand_idle ?? this.createDefaultPose();
            case 'walk':
                return POSE_PRESETS.stand_walk ?? POSE_PRESETS.stand_idle ?? this.createDefaultPose();
            case 'sprint':
                return POSE_PRESETS.stand_sprint ?? POSE_PRESETS.stand_walk ?? this.createDefaultPose();
            case 'crouch':
                return isMoving
                    ? (POSE_PRESETS.crouch_walk ?? POSE_PRESETS.crouch_idle ?? this.createDefaultPose())
                    : (POSE_PRESETS.crouch_idle ?? this.createDefaultPose());
            case 'fly':
                return isMoving
                    ? (POSE_PRESETS.fly_forward ?? POSE_PRESETS.fly_idle ?? this.createDefaultPose())
                    : (POSE_PRESETS.fly_idle ?? this.createDefaultPose());
            case 'jump':
                return POSE_PRESETS.jumping ?? POSE_PRESETS.stand_idle ?? this.createDefaultPose();
            case 'fall':
                return POSE_PRESETS.falling ?? POSE_PRESETS.stand_idle ?? this.createDefaultPose();
            case 'swim':
                return isMoving
                    ? (POSE_PRESETS.swim_forward ?? POSE_PRESETS.swim_idle_surface ?? this.createDefaultPose())
                    : (POSE_PRESETS.swim_idle_surface ?? this.createDefaultPose());
            default:
                return POSE_PRESETS.stand_idle ?? this.createDefaultPose();
        }
    }

    /**
     * Update animation state
     * @param {Object} playerState - Player controller state
     * @param {number} dt - Delta time in seconds
     */
    update(playerState, dt) {
        // Determine new state
        const newState = this.determineState(playerState);

        // Handle state transitions
        if (newState !== this.currentState) {
            this.previousState = this.currentState;
            this.currentState = newState;
            this.stateBlendTime = 0;
        }

        // Update blend time
        this.stateBlendTime += dt;

        // Get target pose
        const isMoving = playerState.isMoving();
        const targetPose = this.getTargetPose(this.currentState, isMoving);

        // Update locomotion phases
        this.updateLocomotionPhases(playerState, dt);

        // Interpolate pose values using springs
        this.interpolatePose(targetPose, dt);

        // Apply locomotion animation on top
        this.applyLocomotion(playerState);

        // Apply pose constraints to prevent interpenetration
        applyPoseConstraints(this.pose);
    }

    /**
     * Update locomotion cycle phases
     * @param {Object} playerState
     * @param {number} dt
     */
    updateLocomotionPhases(playerState, dt) {
        const isMoving = playerState.isMoving();

        if (this.currentState === 'walk' && isMoving) {
            this.walkPhase += dt * this.walkCycleSpeed;
            this.armSwingPhase = this.walkPhase;
        } else if (this.currentState === 'sprint' && isMoving) {
            this.walkPhase += dt * this.sprintCycleSpeed;
            this.armSwingPhase = this.walkPhase;
        } else if (this.currentState === 'crouch' && isMoving) {
            this.walkPhase += dt * (this.walkCycleSpeed * 0.6);
            this.armSwingPhase = this.walkPhase;
        } else if (this.currentState === 'swim') {
            this.swimPhase += dt * this.swimCycleSpeed;
        }

        // Wrap phases
        if (this.walkPhase > Math.PI * 2) {
            this.walkPhase -= Math.PI * 2;
        }
        if (this.swimPhase > Math.PI * 2) {
            this.swimPhase -= Math.PI * 2;
        }
    }

    /**
     * Interpolate current pose toward target using spring damping
     * @param {Object} targetPose
     * @param {number} dt
     */
    interpolatePose(targetPose, dt) {
        for (const key of Object.keys(this.pose)) {
            const target = targetPose[key] ?? 0;
            const result = springDamper(
                this.pose[key],
                this.velocities[key],
                target,
                this.poseHalflife,
                dt
            );
            this.pose[key] = result.value;
            this.velocities[key] = result.velocity;
        }
    }

    /**
     * Apply locomotion cycle to pose (additive animation)
     * @param {Object} playerState
     */
    applyLocomotion(playerState) {
        const isMoving = playerState.isMoving();
        if (!isMoving) return;

        if (this.currentState === 'walk' || this.currentState === 'sprint') {
            const amplitude = this.currentState === 'sprint' ? 0.8 : 0.5;
            const phase = this.walkPhase;

            // Leg swing (sinusoidal)
            this.pose.leftLegX += Math.sin(phase) * amplitude * 0.7;
            this.pose.rightLegX += Math.sin(phase + Math.PI) * amplitude * 0.7;

            // Knee bend during leg swing
            this.pose.leftKnee += Math.max(0, Math.sin(phase)) * amplitude * 0.4;
            this.pose.rightKnee += Math.max(0, Math.sin(phase + Math.PI)) * amplitude * 0.4;

            // Arm swing (opposite to legs)
            this.pose.leftArmX += Math.sin(phase + Math.PI) * amplitude * 0.5;
            this.pose.rightArmX += Math.sin(phase) * amplitude * 0.5;

            // Subtle elbow bend during swing
            this.pose.leftElbow += Math.abs(Math.sin(phase + Math.PI)) * amplitude * 0.3;
            this.pose.rightElbow += Math.abs(Math.sin(phase)) * amplitude * 0.3;

            // Subtle body bob
            this.pose.bodyY += Math.abs(Math.sin(phase * 2)) * 0.02;

            // Spine twist for natural motion
            this.pose.lowerSpineY = Math.sin(phase) * 0.05;
        } else if (this.currentState === 'crouch' && isMoving) {
            const amplitude = 0.2;
            const phase = this.walkPhase;

            // Reduced leg movement for crouch-walking
            this.pose.leftLegX += Math.sin(phase) * amplitude;
            this.pose.rightLegX += Math.sin(phase + Math.PI) * amplitude;

            // Arm movement
            this.pose.leftArmX += Math.sin(phase + Math.PI) * amplitude * 0.3;
            this.pose.rightArmX += Math.sin(phase) * amplitude * 0.3;
        } else if (this.currentState === 'swim') {
            const phase = this.swimPhase;

            // Swimming arm stroke
            this.pose.leftArmX += Math.sin(phase) * 0.8;
            this.pose.rightArmX += Math.sin(phase + Math.PI) * 0.8;

            // Leg kick
            this.pose.leftLegX += Math.sin(phase * 2) * 0.3;
            this.pose.rightLegX += Math.sin(phase * 2 + Math.PI) * 0.3;
        }
    }

    /**
     * Get current pose for rendering
     * @returns {Object}
     */
    getPose() {
        return { ...this.pose };
    }

    /**
     * Apply head look direction from camera
     * @param {number} pitch - Camera pitch (up/down)
     * @param {number} yaw - Relative yaw (0 = forward)
     */
    setHeadLook(pitch, yaw) {
        const maxPitch = POSE_CONSTRAINTS?.head?.maxPitch ?? 1.0;
        const minPitch = POSE_CONSTRAINTS?.head?.minPitch ?? -1.0;
        const maxYaw = POSE_CONSTRAINTS?.head?.maxYaw ?? 1.4;

        // Apply head rotation (pitch is X rotation in this system)
        this.pose.headX = Math.max(minPitch, Math.min(maxPitch, pitch));

        // Yaw could be applied to headY or spine if needed
        // For now, body yaw is handled by the renderer
    }

    /**
     * Get current animation state
     * @returns {AnimationState}
     */
    getState() {
        return this.currentState;
    }

    /**
     * Reset animation to idle state
     */
    reset() {
        this.pose = this.createDefaultPose();
        this.velocities = this.createDefaultPose();
        this.currentState = 'idle';
        this.previousState = 'idle';
        this.walkPhase = 0;
        this.armSwingPhase = 0;
        this.swimPhase = 0;
        this.stateBlendTime = 0;
    }

    /**
     * Force a specific pose preset (for debug/testing)
     * @param {string} presetName - Name of pose preset
     */
    setPreset(presetName) {
        const preset = POSE_PRESETS[presetName];
        if (preset) {
            Object.assign(this.pose, preset);
        }
    }
}

export default PlayerAnimation;

/**
 * Player movement and input handling
 * @module entities/player/PlayerController
 */

import { Entity } from '../Entity.js';
import { PLAYER_PHYSICS } from '../../config/PlayerConfig.js';
import { springDamper } from '../../math/animation.js';

/**
 * @typedef {Object} PlayerInput
 * @property {boolean} forward - Forward movement
 * @property {boolean} back - Backward movement
 * @property {boolean} left - Left movement
 * @property {boolean} right - Right movement
 * @property {boolean} jump - Jump/fly up
 * @property {boolean} crouch - Crouch/fly down
 * @property {boolean} sprint - Sprint modifier
 */

/**
 * Player controller handles movement physics and input processing.
 * Extends Entity with player-specific movement mechanics.
 */
export class PlayerController extends Entity {
    /**
     * @param {number} x - Initial X position
     * @param {number} y - Initial Y position (default 64 for typical spawn)
     * @param {number} z - Initial Z position
     */
    constructor(x = 0, y = 64, z = 0) {
        super(x, y, z);

        // Player-specific dimensions from config
        this.width = PLAYER_PHYSICS.colliderRadius * 2;
        this.height = PLAYER_PHYSICS.colliderHeight;
        this.eyeHeight = PLAYER_PHYSICS.eyeHeightStand;

        // Movement state
        this.isSprinting = false;
        this.isCrouching = false;
        this.isFlying = false;
        this.isJumping = false;
        this.isSwimming = false;

        // Movement parameters (defaults, can be overridden by settings)
        this.walkSpeed = 4.3;
        this.sprintSpeed = 5.6;
        this.crouchSpeed = 1.3;
        this.flySpeed = 10;
        this.jumpForce = 8;
        this.gravity = -25;

        // Crouch interpolation using springs
        this.crouchAmount = 0;
        this.crouchVelocity = 0;
        this.crouchHalflife = 0.1;

        // Sprint FOV effect
        this.fovMultiplier = 1.0;
        this.fovVelocity = 0;
        this.fovHalflife = 0.15;

        // Double-tap flight toggle tracking
        this.lastJumpTime = 0;
        this.doubleTapWindow = 0.3; // 300ms window for double-tap

        // Step height for climbing blocks
        this.stepHeight = PLAYER_PHYSICS.stepHeight;
    }

    /**
     * Get current movement speed based on state
     * @returns {number} Current speed
     */
    getCurrentSpeed() {
        if (this.isSwimming) return PLAYER_PHYSICS.swimSpeed;
        if (this.isFlying) return this.isSprinting ? this.flySpeed * 1.5 : this.flySpeed;
        if (this.isCrouching) return this.crouchSpeed;
        if (this.isSprinting) return this.sprintSpeed;
        return this.walkSpeed;
    }

    /**
     * Get current eye position in world coordinates
     * @returns {{x: number, y: number, z: number}} Eye position
     */
    getEyePosition() {
        // Interpolate eye height based on crouch amount
        const standEye = PLAYER_PHYSICS.eyeHeightStand;
        const crouchEye = PLAYER_PHYSICS.eyeHeightCrouch;
        const currentEyeHeight = standEye - (this.crouchAmount * (standEye - crouchEye));

        return {
            x: this.x,
            y: this.y + currentEyeHeight,
            z: this.z
        };
    }

    /**
     * Get current collider height (accounts for crouching)
     * @returns {number}
     */
    getColliderHeight() {
        const standHeight = PLAYER_PHYSICS.colliderHeight;
        const crouchHeight = PLAYER_PHYSICS.colliderHeightCrouch;
        return standHeight - (this.crouchAmount * (standHeight - crouchHeight));
    }

    /**
     * Process movement input and update velocities
     * @param {PlayerInput} input - Current input state
     * @param {number} dt - Delta time in seconds
     */
    processInput(input, dt) {
        // Calculate movement direction from input
        let moveX = 0;
        let moveZ = 0;

        if (input.forward) moveZ -= 1;
        if (input.back) moveZ += 1;
        if (input.left) moveX -= 1;
        if (input.right) moveX += 1;

        // Normalize diagonal movement
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
            moveX /= len;
            moveZ /= len;
        }

        // Rotate movement direction by yaw
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const rotatedX = moveX * cos - moveZ * sin;
        const rotatedZ = moveX * sin + moveZ * cos;

        // Update sprint state (can only sprint when moving forward and not crouching)
        const isMovingForward = input.forward && !input.back;
        this.isSprinting = input.sprint && isMovingForward && !this.isCrouching && !this.isSwimming;

        // Apply speed to velocity
        const speed = this.getCurrentSpeed();
        this.vx = rotatedX * speed;
        this.vz = rotatedZ * speed;

        // Handle vertical movement
        this.processVerticalInput(input, dt);

        // Update crouch state
        this.isCrouching = input.crouch && !this.isFlying && !this.isSwimming;
    }

    /**
     * Process vertical input (jumping, flying, swimming)
     * @param {PlayerInput} input
     * @param {number} dt
     */
    processVerticalInput(input, dt) {
        const now = performance.now() / 1000;

        if (this.isFlying) {
            // Flying vertical movement
            if (input.jump) {
                this.vy = this.flySpeed;
            } else if (input.crouch) {
                this.vy = -this.flySpeed;
            } else {
                this.vy = 0;
            }
        } else if (this.isSwimming) {
            // Swimming vertical movement
            if (input.jump) {
                this.vy = PLAYER_PHYSICS.swimRiseRate;
            } else {
                this.vy = -PLAYER_PHYSICS.swimSinkRate;
            }
        } else {
            // Ground-based movement
            if (input.jump && this.onGround) {
                // Check for double-tap flight toggle
                if (now - this.lastJumpTime < this.doubleTapWindow) {
                    this.toggleFlight();
                } else {
                    // Regular jump
                    this.vy = this.jumpForce;
                    this.onGround = false;
                    this.isJumping = true;
                }
                this.lastJumpTime = now;
            }
        }
    }

    /**
     * Apply gravity (call each frame when not flying)
     * @param {number} dt - Delta time
     */
    applyGravity(dt) {
        if (!this.isFlying && !this.isSwimming) {
            this.vy += this.gravity * dt;
        }
    }

    /**
     * Update crouch interpolation
     * @param {number} dt - Delta time
     */
    updateCrouch(dt) {
        const targetCrouch = this.isCrouching ? 1 : 0;
        const result = springDamper(
            this.crouchAmount,
            this.crouchVelocity,
            targetCrouch,
            this.crouchHalflife,
            dt
        );
        this.crouchAmount = result.value;
        this.crouchVelocity = result.velocity;
    }

    /**
     * Update FOV multiplier for sprinting effect
     * @param {number} dt - Delta time
     */
    updateFOV(dt) {
        const targetFOV = this.isSprinting ? 1.1 : 1.0;
        const result = springDamper(
            this.fovMultiplier,
            this.fovVelocity,
            targetFOV,
            this.fovHalflife,
            dt
        );
        this.fovMultiplier = result.value;
        this.fovVelocity = result.velocity;
    }

    /**
     * Update player state (call each frame)
     * @param {number} dt - Delta time
     */
    update(dt) {
        this.updateCrouch(dt);
        this.updateFOV(dt);

        // Reset jumping state when landing
        if (this.onGround && this.isJumping && this.vy <= 0) {
            this.isJumping = false;
        }
    }

    /**
     * Toggle flight mode
     */
    toggleFlight() {
        this.isFlying = !this.isFlying;
        if (this.isFlying) {
            this.vy = 0;
            this.onGround = false;
        }
    }

    /**
     * Enable flight mode
     */
    enableFlight() {
        this.isFlying = true;
        this.vy = 0;
        this.onGround = false;
    }

    /**
     * Disable flight mode
     */
    disableFlight() {
        this.isFlying = false;
    }

    /**
     * Set swimming state
     * @param {boolean} swimming
     */
    setSwimming(swimming) {
        this.isSwimming = swimming;
        if (swimming) {
            this.isFlying = false;
        }
    }

    /**
     * Handle landing (called when hitting ground)
     * @param {number} fallVelocity - Velocity when landing (negative = falling)
     */
    onLand(fallVelocity) {
        this.onGround = true;
        this.vy = 0;
        this.isJumping = false;

        // Could trigger landing animation, fall damage, etc.
        // Return fall velocity for external systems to handle
        return fallVelocity;
    }

    /**
     * Update speed settings from external config
     * @param {Object} settings - Speed settings
     */
    updateSpeedSettings(settings) {
        if (settings.walkSpeed !== undefined) this.walkSpeed = settings.walkSpeed;
        if (settings.sprintSpeed !== undefined) this.sprintSpeed = settings.sprintSpeed;
        if (settings.crouchSpeed !== undefined) this.crouchSpeed = settings.crouchSpeed;
        if (settings.flySpeed !== undefined) this.flySpeed = settings.flySpeed;
        if (settings.jumpForce !== undefined) this.jumpForce = settings.jumpForce;
    }

    /**
     * Get player state for serialization
     * @returns {Object} Extended player state
     */
    getState() {
        const baseState = super.getState();
        return {
            ...baseState,
            isSprinting: this.isSprinting,
            isCrouching: this.isCrouching,
            isFlying: this.isFlying,
            isSwimming: this.isSwimming
        };
    }

    /**
     * Restore player state
     * @param {Object} state
     */
    setState(state) {
        super.setState(state);
        if (state.isSprinting !== undefined) this.isSprinting = state.isSprinting;
        if (state.isCrouching !== undefined) this.isCrouching = state.isCrouching;
        if (state.isFlying !== undefined) this.isFlying = state.isFlying;
        if (state.isSwimming !== undefined) this.isSwimming = state.isSwimming;
    }

    /**
     * Reset player to spawn state
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    respawn(x, y, z) {
        this.activate(x, y, z);
        this.isSprinting = false;
        this.isCrouching = false;
        this.isFlying = false;
        this.isSwimming = false;
        this.isJumping = false;
        this.crouchAmount = 0;
        this.crouchVelocity = 0;
        this.fovMultiplier = 1.0;
        this.fovVelocity = 0;
    }
}

export default PlayerController;

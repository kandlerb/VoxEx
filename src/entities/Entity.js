/**
 * Base entity class for all game entities
 * @module entities/Entity
 */

import { createEntityAABB } from '../physics/AABB.js';

/**
 * @typedef {Object} EntityState
 * @property {number} x - World X position
 * @property {number} y - World Y position
 * @property {number} z - World Z position
 * @property {number} vx - Velocity X
 * @property {number} vy - Velocity Y
 * @property {number} vz - Velocity Z
 * @property {number} yaw - Horizontal rotation (radians)
 * @property {number} pitch - Vertical rotation (radians)
 * @property {boolean} onGround - Whether entity is on ground
 * @property {boolean} inWater - Whether entity is in water
 */

/**
 * Base class for all entities (players, mobs, items)
 */
export class Entity {
    /**
     * @param {number} x - Initial X position
     * @param {number} y - Initial Y position
     * @param {number} z - Initial Z position
     */
    constructor(x = 0, y = 0, z = 0) {
        // Position
        this.x = x;
        this.y = y;
        this.z = z;

        // Velocity
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;

        // Rotation
        this.yaw = 0;
        this.pitch = 0;

        // State flags
        this.onGround = false;
        this.inWater = false;
        this.isActive = true;

        // Collision dimensions (override in subclasses)
        this.width = 0.6;
        this.height = 1.8;
    }

    /**
     * Get entity's axis-aligned bounding box
     * @returns {import('../physics/AABB.js').AABB} AABB
     */
    getAABB() {
        return createEntityAABB(this.x, this.y, this.z, this.width, this.height);
    }

    /**
     * Get entity's center position
     * @returns {{x: number, y: number, z: number}} Center position
     */
    getCenter() {
        return {
            x: this.x,
            y: this.y + this.height / 2,
            z: this.z
        };
    }

    /**
     * Update entity state (override in subclasses)
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        // Base update logic - apply velocity
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;
    }

    /**
     * Get entity state for serialization
     * @returns {EntityState}
     */
    getState() {
        return {
            x: this.x,
            y: this.y,
            z: this.z,
            vx: this.vx,
            vy: this.vy,
            vz: this.vz,
            yaw: this.yaw,
            pitch: this.pitch,
            onGround: this.onGround,
            inWater: this.inWater
        };
    }

    /**
     * Restore entity state from serialized data
     * @param {EntityState} state
     */
    setState(state) {
        if (state.x !== undefined) this.x = state.x;
        if (state.y !== undefined) this.y = state.y;
        if (state.z !== undefined) this.z = state.z;
        if (state.vx !== undefined) this.vx = state.vx;
        if (state.vy !== undefined) this.vy = state.vy;
        if (state.vz !== undefined) this.vz = state.vz;
        if (state.yaw !== undefined) this.yaw = state.yaw;
        if (state.pitch !== undefined) this.pitch = state.pitch;
        if (state.onGround !== undefined) this.onGround = state.onGround;
        if (state.inWater !== undefined) this.inWater = state.inWater;
    }

    /**
     * Deactivate entity (for pooling)
     */
    deactivate() {
        this.isActive = false;
    }

    /**
     * Reactivate entity (from pool)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    activate(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.yaw = 0;
        this.pitch = 0;
        this.onGround = false;
        this.inWater = false;
        this.isActive = true;
    }

    /**
     * Calculate distance to another entity or point
     * @param {Entity|{x: number, y: number, z: number}} target - Target entity or point
     * @returns {number} Distance
     */
    distanceTo(target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dz = target.z - this.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate squared distance (faster, no sqrt)
     * @param {Entity|{x: number, y: number, z: number}} target - Target entity or point
     * @returns {number} Squared distance
     */
    distanceToSquared(target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dz = target.z - this.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Calculate horizontal (XZ) distance to target
     * @param {Entity|{x: number, z: number}} target - Target entity or point
     * @returns {number} Horizontal distance
     */
    horizontalDistanceTo(target) {
        const dx = target.x - this.x;
        const dz = target.z - this.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Look at a target position (sets yaw)
     * @param {number} targetX
     * @param {number} targetZ
     */
    lookAt(targetX, targetZ) {
        const dx = targetX - this.x;
        const dz = targetZ - this.z;
        this.yaw = Math.atan2(dx, dz);
    }

    /**
     * Get current speed (horizontal)
     * @returns {number}
     */
    getSpeed() {
        return Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    }

    /**
     * Check if entity is moving
     * @returns {boolean}
     */
    isMoving() {
        const epsilon = 0.01;
        return Math.abs(this.vx) > epsilon || Math.abs(this.vz) > epsilon;
    }
}

export default Entity;

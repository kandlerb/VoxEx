/**
 * Zombie entity
 * @module entities/mobs/Zombie
 */

import { Entity } from '../Entity.js';
import { ZombieAI } from './ZombieAI.js';
import { ZOMBIE_CONFIG } from '../../config/ZombieConfig.js';

/**
 * Zombie mob entity with AI and animation state
 */
export class Zombie extends Entity {
    /**
     * @param {number} x - Initial X position
     * @param {number} y - Initial Y position
     * @param {number} z - Initial Z position
     */
    constructor(x = 0, y = 64, z = 0) {
        super(x, y, z);

        // Zombie dimensions from config
        this.width = ZOMBIE_CONFIG.radius * 2;
        this.height = ZOMBIE_CONFIG.height;

        // AI controller
        this.ai = new ZombieAI();

        // Health
        this.health = 20;
        this.maxHealth = 20;

        // Combat
        this.damage = ZOMBIE_CONFIG.attackDamage ?? 2;
        this.jumpForce = ZOMBIE_CONFIG.jumpForce ?? 4.25;

        // Animation state (for rendering)
        this.walkPhase = 0;
        this.armRaise = 0;
        this.headTilt = 0;
        this.hurtTimer = 0;

        // Gravity
        this.gravity = -25;
    }

    /**
     * Update zombie state
     * @param {Object} playerPos - Player position {x, y, z}
     * @param {number} dt - Delta time in seconds
     * @param {boolean} hasLineOfSight - Whether zombie can see player (optional)
     * @returns {{shouldAttack: boolean, damage: number}}
     */
    update(playerPos, dt, hasLineOfSight = true) {
        if (!this.isActive) {
            return { shouldAttack: false, damage: 0 };
        }

        // Update AI
        const aiResult = this.ai.update(this, playerPos, dt, hasLineOfSight);

        // Apply velocity from AI
        this.vx = aiResult.vx;
        this.vz = aiResult.vz;

        // Handle jumping
        if (aiResult.shouldJump && this.onGround) {
            this.vy = this.jumpForce;
            this.onGround = false;
        }

        // Face movement direction
        if (Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1) {
            this.yaw = Math.atan2(this.vx, this.vz);
        }

        // Update animation state
        this.updateAnimation(dt);

        // Update hurt timer
        if (this.hurtTimer > 0) {
            this.hurtTimer -= dt;
        }

        return {
            shouldAttack: aiResult.shouldAttack,
            damage: aiResult.shouldAttack ? this.damage : 0
        };
    }

    /**
     * Apply gravity (call each frame)
     * @param {number} dt
     */
    applyGravity(dt) {
        if (!this.onGround) {
            this.vy += this.gravity * dt;
        }
    }

    /**
     * Update animation state
     * @param {number} dt
     */
    updateAnimation(dt) {
        const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1;
        const isChasing = this.ai.isAggressive();

        // Walk cycle
        if (isMoving) {
            const walkSpeed = isChasing ? 10 : 6;
            this.walkPhase += dt * walkSpeed;
            if (this.walkPhase > Math.PI * 2) {
                this.walkPhase -= Math.PI * 2;
            }
        }

        // Arm raise when attacking
        const targetArmRaise = this.ai.state === 'attack' ? 1 : (isChasing ? 0.5 : 0);
        this.armRaise += (targetArmRaise - this.armRaise) * Math.min(1, dt * 8);

        // Head tilt toward player when chasing
        if (isChasing) {
            this.headTilt = Math.sin(this.walkPhase * 0.5) * 0.1;
        } else {
            this.headTilt *= 0.95;
        }
    }

    /**
     * Get animation pose for rendering
     * @returns {Object} Animation pose data
     */
    getAnimationPose() {
        const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1;

        return {
            walkPhase: this.walkPhase,
            armRaise: this.armRaise,
            headTilt: this.headTilt,
            isMoving: isMoving,
            isAggressive: this.ai.isAggressive(),
            isHurt: this.hurtTimer > 0
        };
    }

    /**
     * Take damage
     * @param {number} amount - Damage amount
     * @returns {boolean} True if zombie died
     */
    takeDamage(amount) {
        if (!this.isActive) return false;

        this.health -= amount;
        this.hurtTimer = 0.3; // Flash red for 0.3 seconds

        if (this.health <= 0) {
            this.health = 0;
            this.deactivate();
            return true;
        }
        return false;
    }

    /**
     * Heal zombie
     * @param {number} amount
     */
    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    /**
     * Check if zombie is at full health
     * @returns {boolean}
     */
    isFullHealth() {
        return this.health >= this.maxHealth;
    }

    /**
     * Get health percentage
     * @returns {number} 0-1
     */
    getHealthPercent() {
        return this.health / this.maxHealth;
    }

    /**
     * Force zombie to target a position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setTarget(x, y, z) {
        this.ai.setTarget(x, y, z);
    }

    /**
     * Clear current target
     */
    clearTarget() {
        this.ai.clearTarget();
    }

    /**
     * Check if zombie is currently aggressive
     * @returns {boolean}
     */
    isAggressive() {
        return this.ai.isAggressive();
    }

    /**
     * Get current AI state
     * @returns {string}
     */
    getAIState() {
        return this.ai.getState();
    }

    /**
     * Reset zombie for pooling
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    activate(x, y, z) {
        super.activate(x, y, z);
        this.health = this.maxHealth;
        this.ai.reset();
        this.walkPhase = 0;
        this.armRaise = 0;
        this.headTilt = 0;
        this.hurtTimer = 0;
    }

    /**
     * Handle landing
     */
    onLand() {
        this.onGround = true;
        this.vy = 0;
    }

    /**
     * Get state for serialization
     * @returns {Object}
     */
    getState() {
        const baseState = super.getState();
        return {
            ...baseState,
            health: this.health,
            aiState: this.ai.getState()
        };
    }

    /**
     * Restore state
     * @param {Object} state
     */
    setState(state) {
        super.setState(state);
        if (state.health !== undefined) this.health = state.health;
    }
}

export default Zombie;

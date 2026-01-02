/**
 * Zombie AI behavior system
 * @module entities/mobs/ZombieAI
 */

import { ZOMBIE_CONFIG } from '../../config/ZombieConfig.js';

/**
 * @typedef {'idle'|'wander'|'chase'|'attack'|'lost'} ZombieAIState
 */

/**
 * @typedef {Object} AIUpdateResult
 * @property {number} vx - Desired X velocity
 * @property {number} vz - Desired Z velocity
 * @property {boolean} shouldAttack - Whether zombie should attack
 * @property {boolean} shouldJump - Whether zombie should jump
 */

/**
 * Zombie AI controller handling detection, pathfinding, and attack behavior
 */
export class ZombieAI {
    constructor() {
        /** @type {ZombieAIState} */
        this.state = 'idle';

        // Detection parameters from config
        this.detectionRange = ZOMBIE_CONFIG.detectionRadius ?? 28;
        this.attackRange = ZOMBIE_CONFIG.attackRange ?? 2.5;
        this.loseTargetRange = ZOMBIE_CONFIG.despawnDistance ?? 140;

        // Movement speeds
        this.walkSpeed = ZOMBIE_CONFIG.walkSpeed ?? 2.4;
        this.chaseSpeed = ZOMBIE_CONFIG.chaseSpeed ?? 4.8;
        this.sidestepSpeed = ZOMBIE_CONFIG.sidestepSpeed ?? 3.2;

        // Target tracking
        this.targetX = 0;
        this.targetY = 0;
        this.targetZ = 0;
        this.hasTarget = false;
        this.lastKnownTargetX = 0;
        this.lastKnownTargetZ = 0;

        // Wander behavior
        this.wanderTimer = 0;
        this.wanderDirection = 0;
        this.wanderRadius = ZOMBIE_CONFIG.wanderRadius ?? 10;

        // Attack cooldown
        this.attackCooldown = 0;
        this.attackRate = ZOMBIE_CONFIG.attackCooldown ?? 1.2;

        // Memory - how long zombie remembers player after losing sight
        this.memoryTimer = 0;
        this.memoryDuration = ZOMBIE_CONFIG.memoryDuration ?? 6;

        // Lost target behavior
        this.lostWanderDelay = ZOMBIE_CONFIG.targetLostWanderDelay ?? 1.25;
        this.lostTimer = 0;

        // Stuck detection
        this.lastX = 0;
        this.lastZ = 0;
        this.stuckTimer = 0;
        this.stuckThreshold = ZOMBIE_CONFIG.stuckTimeout ?? 1.2;
        this.stuckEpsilon = ZOMBIE_CONFIG.stuckMoveEpsilon ?? 0.01;

        // Pathfinding/detour
        this.detourDirection = 0; // 1 = right, -1 = left
        this.isDetouring = false;
        this.detourTimer = 0;
    }

    /**
     * Update AI state
     * @param {Object} zombie - Zombie entity
     * @param {Object} playerPos - Player position {x, y, z}
     * @param {number} dt - Delta time
     * @param {boolean} hasLineOfSight - Whether zombie can see player
     * @returns {AIUpdateResult}
     */
    update(zombie, playerPos, dt, hasLineOfSight = true) {
        // Update cooldowns
        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }

        // Calculate distance to player
        const dx = playerPos.x - zombie.x;
        const dy = playerPos.y - zombie.y;
        const dz = playerPos.z - zombie.z;
        const distSq = dx * dx + dz * dz; // Horizontal distance
        const dist = Math.sqrt(distSq);

        // Update target tracking
        this.updateTargetTracking(playerPos, dist, hasLineOfSight, dt);

        // Update stuck detection
        this.updateStuckDetection(zombie, dt);

        // State transitions
        this.updateState(dist, hasLineOfSight);

        // Execute state behavior
        return this.executeBehavior(zombie, playerPos, dist, dx, dz, dt);
    }

    /**
     * Update target tracking and memory
     * @param {Object} playerPos
     * @param {number} dist
     * @param {boolean} hasLineOfSight
     * @param {number} dt
     */
    updateTargetTracking(playerPos, dist, hasLineOfSight, dt) {
        if (hasLineOfSight && dist < this.detectionRange) {
            // Can see player - update target
            this.targetX = playerPos.x;
            this.targetY = playerPos.y;
            this.targetZ = playerPos.z;
            this.lastKnownTargetX = playerPos.x;
            this.lastKnownTargetZ = playerPos.z;
            this.hasTarget = true;
            this.memoryTimer = this.memoryDuration;
        } else if (this.hasTarget) {
            // Can't see player but remember them
            this.memoryTimer -= dt;
            if (this.memoryTimer <= 0) {
                this.hasTarget = false;
            }
        }
    }

    /**
     * Detect if zombie is stuck
     * @param {Object} zombie
     * @param {number} dt
     */
    updateStuckDetection(zombie, dt) {
        const movedX = Math.abs(zombie.x - this.lastX);
        const movedZ = Math.abs(zombie.z - this.lastZ);

        if (movedX < this.stuckEpsilon && movedZ < this.stuckEpsilon) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
            this.isDetouring = false;
        }

        // Trigger detour if stuck
        if (this.stuckTimer > this.stuckThreshold && !this.isDetouring) {
            this.isDetouring = true;
            this.detourDirection = Math.random() > 0.5 ? 1 : -1;
            this.detourTimer = 1.0;
            this.stuckTimer = 0;
        }

        // Update detour timer
        if (this.isDetouring) {
            this.detourTimer -= dt;
            if (this.detourTimer <= 0) {
                this.isDetouring = false;
            }
        }

        this.lastX = zombie.x;
        this.lastZ = zombie.z;
    }

    /**
     * Update state based on distance and conditions
     * @param {number} dist - Distance to player
     * @param {boolean} hasLineOfSight
     */
    updateState(dist, hasLineOfSight) {
        const prevState = this.state;

        switch (this.state) {
            case 'idle':
                if (this.hasTarget && dist < this.detectionRange) {
                    this.state = 'chase';
                } else {
                    // Random chance to start wandering
                    if (Math.random() < 0.01) {
                        this.state = 'wander';
                        this.wanderTimer = 3 + Math.random() * 4;
                        this.wanderDirection = Math.random() * Math.PI * 2;
                    }
                }
                break;

            case 'wander':
                if (this.hasTarget && dist < this.detectionRange) {
                    this.state = 'chase';
                } else if (this.wanderTimer <= 0) {
                    this.state = 'idle';
                }
                break;

            case 'chase':
                if (dist < this.attackRange) {
                    this.state = 'attack';
                } else if (!this.hasTarget) {
                    this.state = 'lost';
                    this.lostTimer = this.lostWanderDelay;
                } else if (dist > this.loseTargetRange) {
                    this.state = 'idle';
                    this.hasTarget = false;
                }
                break;

            case 'attack':
                if (dist > this.attackRange * 1.5) {
                    this.state = 'chase';
                } else if (!this.hasTarget) {
                    this.state = 'lost';
                    this.lostTimer = this.lostWanderDelay;
                }
                break;

            case 'lost':
                if (this.hasTarget && dist < this.detectionRange) {
                    this.state = 'chase';
                } else if (this.lostTimer <= 0) {
                    this.state = 'wander';
                    this.wanderTimer = 2 + Math.random() * 3;
                    this.wanderDirection = Math.random() * Math.PI * 2;
                }
                break;
        }
    }

    /**
     * Execute behavior for current state
     * @param {Object} zombie
     * @param {Object} playerPos
     * @param {number} dist
     * @param {number} dx
     * @param {number} dz
     * @param {number} dt
     * @returns {AIUpdateResult}
     */
    executeBehavior(zombie, playerPos, dist, dx, dz, dt) {
        let vx = 0;
        let vz = 0;
        let shouldAttack = false;
        let shouldJump = false;

        switch (this.state) {
            case 'idle':
                // Stand still
                break;

            case 'wander':
                this.wanderTimer -= dt;
                if (this.wanderTimer <= 0) {
                    this.wanderDirection = Math.random() * Math.PI * 2;
                    this.wanderTimer = 2 + Math.random() * 3;
                }
                vx = Math.sin(this.wanderDirection) * this.walkSpeed * 0.5;
                vz = Math.cos(this.wanderDirection) * this.walkSpeed * 0.5;
                break;

            case 'chase':
                if (this.isDetouring) {
                    // Sidestep to get around obstacle
                    const perpX = -dz / (dist || 1);
                    const perpZ = dx / (dist || 1);
                    vx = perpX * this.sidestepSpeed * this.detourDirection;
                    vz = perpZ * this.sidestepSpeed * this.detourDirection;

                    // Also move slightly toward target
                    vx += (dx / (dist || 1)) * this.chaseSpeed * 0.3;
                    vz += (dz / (dist || 1)) * this.chaseSpeed * 0.3;
                } else {
                    // Move directly toward player
                    if (dist > 0.1) {
                        vx = (dx / dist) * this.chaseSpeed;
                        vz = (dz / dist) * this.chaseSpeed;
                    }
                }

                // Check if should jump (player is above)
                const heightDiff = playerPos.y - zombie.y;
                if (heightDiff > 0.5 && heightDiff < 2 && zombie.onGround) {
                    shouldJump = true;
                }
                break;

            case 'attack':
                // Face player but slow approach
                if (dist > 0.1) {
                    vx = (dx / dist) * this.walkSpeed * 0.2;
                    vz = (dz / dist) * this.walkSpeed * 0.2;
                }

                // Try to attack
                if (this.attackCooldown <= 0 && dist < this.attackRange) {
                    shouldAttack = true;
                    this.attackCooldown = this.attackRate;
                }
                break;

            case 'lost':
                this.lostTimer -= dt;
                // Move toward last known position
                const toLastX = this.lastKnownTargetX - zombie.x;
                const toLastZ = this.lastKnownTargetZ - zombie.z;
                const lastDist = Math.sqrt(toLastX * toLastX + toLastZ * toLastZ);

                if (lastDist > 1) {
                    vx = (toLastX / lastDist) * this.walkSpeed;
                    vz = (toLastZ / lastDist) * this.walkSpeed;
                }
                break;
        }

        return { vx, vz, shouldAttack, shouldJump };
    }

    /**
     * Check if zombie is currently aggressive
     * @returns {boolean}
     */
    isAggressive() {
        return this.state === 'chase' || this.state === 'attack';
    }

    /**
     * Force zombie to target a position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setTarget(x, y, z) {
        this.targetX = x;
        this.targetY = y;
        this.targetZ = z;
        this.lastKnownTargetX = x;
        this.lastKnownTargetZ = z;
        this.hasTarget = true;
        this.memoryTimer = this.memoryDuration;
        this.state = 'chase';
    }

    /**
     * Clear current target
     */
    clearTarget() {
        this.hasTarget = false;
        this.state = 'idle';
    }

    /**
     * Reset AI state for pooling
     */
    reset() {
        this.state = 'idle';
        this.hasTarget = false;
        this.wanderTimer = 0;
        this.attackCooldown = 0;
        this.memoryTimer = 0;
        this.lostTimer = 0;
        this.stuckTimer = 0;
        this.isDetouring = false;
        this.detourTimer = 0;
        this.lastX = 0;
        this.lastZ = 0;
    }

    /**
     * Get current AI state
     * @returns {ZombieAIState}
     */
    getState() {
        return this.state;
    }
}

export default ZombieAI;

/**
 * Entity lifecycle and pooling manager
 * @module entities/EntityManager
 */

import { Zombie } from './mobs/Zombie.js';
import { ZOMBIE_CONFIG } from '../config/ZombieConfig.js';

/**
 * @typedef {Object} SpawnResult
 * @property {boolean} success - Whether spawn was successful
 * @property {Zombie|null} entity - The spawned entity
 * @property {string} reason - Reason if spawn failed
 */

/**
 * Manages all game entities including spawning, pooling, and updates
 */
export class EntityManager {
    constructor() {
        /** @type {Zombie[]} Active zombies */
        this.zombies = [];

        /** @type {Zombie[]} Pool of inactive zombies for reuse */
        this.zombiePool = [];

        // Spawn settings
        this.maxZombies = ZOMBIE_CONFIG.maxCount ?? 8;
        this.spawnCooldown = 0;
        this.spawnRate = ZOMBIE_CONFIG.spawnCooldown ?? 3.5;
        this.spawnRadius = ZOMBIE_CONFIG.spawnRadius ?? 48;

        // Despawn settings
        this.despawnRange = ZOMBIE_CONFIG.despawnDistance ?? 140;
        this.despawnRangeSquared = this.despawnRange * this.despawnRange;

        // Statistics
        this.totalSpawned = 0;
        this.totalDespawned = 0;
        this.totalKilled = 0;
    }

    /**
     * Get active zombie count
     * @returns {number}
     */
    getZombieCount() {
        return this.zombies.length;
    }

    /**
     * Get pool size
     * @returns {number}
     */
    getPoolSize() {
        return this.zombiePool.length;
    }

    /**
     * Check if more zombies can be spawned
     * @returns {boolean}
     */
    canSpawnZombie() {
        return this.zombies.length < this.maxZombies && this.spawnCooldown <= 0;
    }

    /**
     * Spawn a zombie at position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {SpawnResult}
     */
    spawnZombie(x, y, z) {
        if (this.zombies.length >= this.maxZombies) {
            return { success: false, entity: null, reason: 'max_zombies_reached' };
        }

        // Get from pool or create new
        let zombie;
        if (this.zombiePool.length > 0) {
            zombie = this.zombiePool.pop();
            zombie.activate(x, y, z);
        } else {
            zombie = new Zombie(x, y, z);
        }

        this.zombies.push(zombie);
        this.totalSpawned++;

        return { success: true, entity: zombie, reason: '' };
    }

    /**
     * Try to spawn a zombie around the player
     * @param {Object} playerPos - Player position
     * @param {Function} isValidSpawn - Function to check if position is valid (y, solid ground, etc.)
     * @returns {SpawnResult}
     */
    trySpawnZombieNearPlayer(playerPos, isValidSpawn) {
        if (!this.canSpawnZombie()) {
            return { success: false, entity: null, reason: 'cooldown_active' };
        }

        // Try random positions around player
        const angle = Math.random() * Math.PI * 2;
        const distance = this.spawnRadius * (0.5 + Math.random() * 0.5);

        const x = playerPos.x + Math.cos(angle) * distance;
        const z = playerPos.z + Math.sin(angle) * distance;

        // Find valid spawn Y (if isValidSpawn provided)
        let y = playerPos.y;
        if (isValidSpawn) {
            const spawnY = isValidSpawn(x, z);
            if (spawnY === null) {
                return { success: false, entity: null, reason: 'no_valid_ground' };
            }
            y = spawnY;
        }

        const result = this.spawnZombie(x, y, z);

        if (result.success) {
            this.spawnCooldown = this.spawnRate;
        }

        return result;
    }

    /**
     * Remove zombie and return to pool
     * @param {Zombie} zombie
     */
    despawnZombie(zombie) {
        const index = this.zombies.indexOf(zombie);
        if (index !== -1) {
            this.zombies.splice(index, 1);
            zombie.deactivate();
            this.zombiePool.push(zombie);
            this.totalDespawned++;
        }
    }

    /**
     * Record zombie kill (already removed from active)
     */
    recordKill() {
        this.totalKilled++;
    }

    /**
     * Update all entities
     * @param {Object} playerPos - Player position
     * @param {number} dt - Delta time
     * @param {Object} options - Update options
     * @param {boolean} options.isNight - Whether it's night time
     * @param {Function} options.getLineOfSight - Function to check line of sight
     * @returns {{attackDamage: number, zombiesUpdated: number}}
     */
    update(playerPos, dt, options = {}) {
        const { isNight = true, getLineOfSight = () => true } = options;

        // Update spawn cooldown
        if (this.spawnCooldown > 0) {
            this.spawnCooldown -= dt;
        }

        let totalAttackDamage = 0;
        let zombiesUpdated = 0;

        // Update zombies in reverse order for safe removal
        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const zombie = this.zombies[i];

            // Check despawn distance
            const dx = zombie.x - playerPos.x;
            const dz = zombie.z - playerPos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq > this.despawnRangeSquared) {
                this.despawnZombie(zombie);
                continue;
            }

            // Get line of sight
            const hasLOS = getLineOfSight(zombie, playerPos);

            // Update zombie
            const result = zombie.update(playerPos, dt, hasLOS);

            if (result.shouldAttack) {
                totalAttackDamage += result.damage;
            }

            zombiesUpdated++;
        }

        return {
            attackDamage: totalAttackDamage,
            zombiesUpdated: zombiesUpdated
        };
    }

    /**
     * Apply physics to all zombies (gravity, collisions)
     * @param {number} dt
     * @param {Function} resolveCollision - Function to resolve collisions
     */
    applyPhysics(dt, resolveCollision) {
        for (const zombie of this.zombies) {
            // Apply gravity
            zombie.applyGravity(dt);

            // Apply velocity
            zombie.x += zombie.vx * dt;
            zombie.y += zombie.vy * dt;
            zombie.z += zombie.vz * dt;

            // Resolve collisions if function provided
            if (resolveCollision) {
                resolveCollision(zombie);
            }
        }
    }

    /**
     * Get closest zombie to position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {{zombie: Zombie|null, distance: number}}
     */
    getClosestZombie(x, y, z) {
        let closest = null;
        let minDist = Infinity;

        for (const zombie of this.zombies) {
            if (!zombie.isActive) continue;

            const dx = zombie.x - x;
            const dy = zombie.y - y;
            const dz = zombie.z - z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < minDist) {
                minDist = dist;
                closest = zombie;
            }
        }

        return { zombie: closest, distance: minDist };
    }

    /**
     * Get all zombies within range
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} range
     * @returns {Zombie[]}
     */
    getZombiesInRange(x, y, z, range) {
        const rangeSq = range * range;
        const result = [];

        for (const zombie of this.zombies) {
            if (!zombie.isActive) continue;

            const dx = zombie.x - x;
            const dy = zombie.y - y;
            const dz = zombie.z - z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq <= rangeSq) {
                result.push(zombie);
            }
        }

        return result;
    }

    /**
     * Apply damage to zombie at position (for player attacks)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} range
     * @param {number} damage
     * @returns {{hit: boolean, killed: boolean, zombie: Zombie|null}}
     */
    attackZombiesAt(x, y, z, range, damage) {
        const closest = this.getClosestZombie(x, y, z);

        if (closest.zombie && closest.distance <= range) {
            const killed = closest.zombie.takeDamage(damage);

            if (killed) {
                this.despawnZombie(closest.zombie);
                this.recordKill();
            }

            return { hit: true, killed: killed, zombie: closest.zombie };
        }

        return { hit: false, killed: false, zombie: null };
    }

    /**
     * Clear all entities
     */
    clear() {
        for (const zombie of this.zombies) {
            zombie.deactivate();
            this.zombiePool.push(zombie);
        }
        this.zombies = [];
    }

    /**
     * Reset manager state
     */
    reset() {
        this.clear();
        this.spawnCooldown = 0;
        this.totalSpawned = 0;
        this.totalDespawned = 0;
        this.totalKilled = 0;
    }

    /**
     * Get all active zombies
     * @returns {Zombie[]}
     */
    getZombies() {
        return this.zombies;
    }

    /**
     * Get statistics
     * @returns {Object}
     */
    getStats() {
        return {
            activeZombies: this.zombies.length,
            pooledZombies: this.zombiePool.length,
            maxZombies: this.maxZombies,
            totalSpawned: this.totalSpawned,
            totalDespawned: this.totalDespawned,
            totalKilled: this.totalKilled,
            spawnCooldown: this.spawnCooldown
        };
    }

    /**
     * Update settings from config
     * @param {Object} settings
     */
    updateSettings(settings) {
        if (settings.maxZombies !== undefined) {
            this.maxZombies = settings.maxZombies;
        }
        if (settings.spawnRate !== undefined) {
            this.spawnRate = settings.spawnRate;
        }
        if (settings.despawnRange !== undefined) {
            this.despawnRange = settings.despawnRange;
            this.despawnRangeSquared = this.despawnRange * this.despawnRange;
        }
        if (settings.spawnRadius !== undefined) {
            this.spawnRadius = settings.spawnRadius;
        }
    }
}

export default EntityManager;

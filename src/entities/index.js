/**
 * Entities module barrel export
 * @module entities
 */

// Base entity
export { Entity, default as EntityDefault } from './Entity.js';

// Entity manager
export { EntityManager, default as EntityManagerDefault } from './EntityManager.js';

// Player exports
export {
    PlayerController,
    PlayerControllerDefault,
    PlayerAnimation,
    PlayerAnimationDefault
} from './player/index.js';

// Mob exports
export {
    Zombie,
    ZombieDefault,
    ZombieAI,
    ZombieAIDefault
} from './mobs/index.js';

/**
 * Mobs module barrel export
 * @module entities/mobs
 */

export { Zombie, default as ZombieDefault } from './Zombie.js';
export { ZombieAI, default as ZombieAIDefault } from './ZombieAI.js';

// Note: ZombieModel.js and ZombieTexture.js require Three.js
// These will be extracted in Phase 7 (Render) or kept separate

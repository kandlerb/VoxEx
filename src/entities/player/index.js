/**
 * Player module barrel export
 * @module entities/player
 */

export { PlayerController, default as PlayerControllerDefault } from './PlayerController.js';
export { PlayerAnimation, default as PlayerAnimationDefault } from './PlayerAnimation.js';

// Note: PlayerModel.js and ThirdPersonCamera.js require Three.js
// These will be extracted in Phase 7 (Render) or kept separate

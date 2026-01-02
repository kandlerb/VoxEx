/**
 * World module barrel export.
 * Provides world-related functionality including lighting.
 * @module world
 */

// =====================================================
// LIGHTING SUBMODULE
// =====================================================
// All lighting exports are available through World.* namespace
export * from './lighting/index.js';

// =====================================================
// FUTURE SUBMODULES
// =====================================================
// These will be added in future phases:
// - generation/ (terrain, biomes, structures)
// - chunks/ (chunk management, streaming)
// - entities/ (mobs, players)

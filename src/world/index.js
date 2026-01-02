/**
 * World module barrel export.
 * Provides world-related functionality including lighting and generation.
 * @module world
 */

// =====================================================
// CHUNK DATA STRUCTURE (Phase 5)
// =====================================================
export * from './Chunk.js';

// =====================================================
// LIGHTING SUBMODULE (Phase 4)
// =====================================================
// All lighting exports are available through World.* namespace
export * from './lighting/index.js';

// =====================================================
// GENERATION SUBMODULE (Phase 5)
// =====================================================
// Terrain generation, biomes, trees, caves
export * from './generation/index.js';

// =====================================================
// FUTURE SUBMODULES
// =====================================================
// These will be added in future phases:
// - chunks/ (chunk management, streaming)
// - entities/ (mobs, players)

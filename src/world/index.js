/**
 * World module barrel export.
 * Provides world-related functionality including lighting and generation.
 * @module world
 */

// =====================================================
// VOXELWORLD CLASS (Phase 6)
// =====================================================
// Main world management class for chunk-based voxel terrain
export {
    VoxelWorld,
    setVoxelWorldDebug,
    default as VoxelWorldDefault
} from './VoxelWorld.js';

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
// - entities/ (mobs, players)

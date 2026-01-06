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
// CHUNK QUEUE MANAGEMENT (Phase 6)
// =====================================================
// Queue management, scheduling, frame budget
export {
    ChunkQueue,
    CHUNK_QUEUE_CONFIG,
    processWithBudget,
    default as ChunkQueueDefault
} from './ChunkQueue.js';

// =====================================================
// CHUNK CACHING (Phase 6)
// =====================================================
// Height map caching, biome weight caching, IndexedDB batch ops
export {
    ChunkCache,
    HeightMapCache,
    BiomeWeightCache,
    CACHE_CONFIG,
    batchLoadChunksFromCache,
    batchSaveChunksToCache,
    default as ChunkCacheDefault
} from './ChunkCache.js';

// =====================================================
// CHUNK MESH POOLING (Phase 6)
// =====================================================
// Mesh pooling for terrain and water
export {
    ChunkMeshPool,
    MESH_POOL_CONFIG,
    default as ChunkMeshPoolDefault
} from './ChunkMeshPool.js';

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

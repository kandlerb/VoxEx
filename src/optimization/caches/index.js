/**
 * Cache exports for VoxEx.
 * Provides caching utilities to avoid redundant calculations.
 * @module optimization/caches
 */

export {
    faceVertexCache,
    faceVertexCacheIndexed,
    getCachedFaceVertices,
    getCachedFaceVerticesIndexed,
    prewarmFaceVertexCaches,
    clearFaceVertexCaches,
    default as FaceVertexCacheDefault
} from './FaceVertexCache.js';

export { ChunkNeighborCache, default as ChunkNeighborCacheDefault } from './ChunkNeighborCache.js';

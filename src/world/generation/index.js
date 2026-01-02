/**
 * Terrain generation module exports
 * @module world/generation
 */

// Main generator classes
export { TerrainGenerator, default as TerrainGeneratorDefault } from './TerrainGenerator.js';
export { ChunkGenerator, createChunkGeneratorFunction, default as ChunkGeneratorDefault } from './ChunkGenerator.js';
export { precalculateTerrainCaches, generateTerrainPass, fillWaterPass } from './ChunkGenerator.js';

// Cave generation
export {
    CAVE_CONFIG,
    precalculateCaveNoise,
    interpolateCaveNoise,
    shouldCarveCave,
    carveCaves,
    isCaveAt,
    getCaveDensity
} from './CaveGenerator.js';

// Surface decoration (alpine terrain)
export {
    ELEVATION,
    SLOPE,
    analyzeSlopeAt,
    getMountainSurfaceBlock,
    getSubsurfaceBlock,
    isAlpineLakeBed,
    isAboveTreeLine,
    calculateTreeLine
} from './SurfaceDecorator.js';

// Tree generation (re-export from trees/)
export * from './trees/index.js';

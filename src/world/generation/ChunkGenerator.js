/**
 * Main chunk terrain generation
 * Combines all generation systems into the full chunk generation pipeline
 * @module world/generation/ChunkGenerator
 */

import { CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_VOLUME, CHUNK_SIZE_SQUARED, SEA_LEVEL, Y_OFFSET } from '../../config/WorldConfig.js';
import { AIR, GRASS, DIRT, STONE, BEDROCK, WATER, SAND, GRAVEL, SNOW } from '../../core/constants.js';
import { noise2D } from '../../math/noise.js';
import { createChunkData, GEN_PASS } from '../Chunk.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { precalculateCaveNoise, interpolateCaveNoise, shouldCarveCave } from './CaveGenerator.js';
import { analyzeSlopeAt, getMountainSurfaceBlock, getSubsurfaceBlock, isAlpineLakeBed } from './SurfaceDecorator.js';
import { generateTreesForChunk } from './trees/TreeGenerator.js';

/**
 * @typedef {Object} GenerationCaches
 * @property {Float32Array} heightCache - Height for each XZ position
 * @property {Float32Array} riverCache - River factor for each XZ position
 * @property {Array<Object>} biomeCache - Biome config for each XZ position
 */

/**
 * Pre-calculate terrain caches for a chunk
 *
 * @param {number} chunkSize - Size of chunk (16)
 * @param {number} startX - World X start
 * @param {number} startZ - World Z start
 * @param {TerrainGenerator} terrainGen - Terrain generator instance
 * @returns {GenerationCaches}
 */
export function precalculateTerrainCaches(chunkSize, startX, startZ, terrainGen) {
    const size = chunkSize * chunkSize;
    const heightCache = new Float32Array(size);
    const riverCache = new Float32Array(size);
    const biomeCache = new Array(size);

    for (let lz = 0; lz < chunkSize; lz++) {
        for (let lx = 0; lx < chunkSize; lx++) {
            const idx = lx + lz * chunkSize;
            const gx = startX + lx;
            const gz = startZ + lz;

            heightCache[idx] = terrainGen.getHeightAt(gx, gz);
            riverCache[idx] = terrainGen.getRiverFactor(gx, gz, terrainGen.seed);
            biomeCache[idx] = terrainGen.getBiomeAt(gx, gz);
        }
    }

    return { heightCache, riverCache, biomeCache };
}

/**
 * Generate terrain pass - fills in base terrain blocks with caves
 *
 * @param {Uint8Array} data - Block data array
 * @param {number} chunkSize - Chunk size
 * @param {number} chunkHeight - Chunk height
 * @param {number} startX - World X start
 * @param {number} startZ - World Z start
 * @param {GenerationCaches} caches - Pre-calculated terrain caches
 * @param {Object} caveCaches - Pre-calculated cave noise
 * @param {number} yOffset - Y offset for world coordinates
 * @param {number} [caveDensityMultiplier=1.0] - Cave density multiplier
 */
export function generateTerrainPass(data, chunkSize, chunkHeight, startX, startZ, caches, caveCaches, yOffset, caveDensityMultiplier = 1.0) {
    const { heightCache, riverCache, biomeCache } = caches;
    const { caveCache1, caveCache2, widthNoiseCache, cxDim, cxzStride } = caveCaches;

    /**
     * Set block at local position
     * @param {number} x - Local X
     * @param {number} y - Local Y
     * @param {number} z - Local Z
     * @param {number} id - Block ID
     */
    function set(x, y, z, id) {
        if (x < 0 || x >= chunkSize || z < 0 || z >= chunkSize || y < 0 || y >= chunkHeight) return;
        data[x + z * chunkSize + y * chunkSize * chunkSize] = id;
    }

    for (let lx = 0; lx < chunkSize; lx++) {
        for (let lz = 0; lz < chunkSize; lz++) {
            const idx = lx + lz * chunkSize;
            const worldTopY = heightCache[idx];
            const riverFactor = riverCache[idx];
            const biome = biomeCache[idx];
            const isMountain = biome && biome.tags?.includes("mountain");
            const bedrockY = 0;
            const gx = startX + lx;
            const gz = startZ + lz;

            // Slope analysis
            const slopeInfo = analyzeSlopeAt(lx, lz, heightCache, chunkSize);

            // Check for alpine lake
            const isLakeBed = isAlpineLakeBed(gx, gz, worldTopY, slopeInfo.maxSlope);

            for (let ly = 0; ly < chunkHeight; ly++) {
                const worldY = ly - yOffset;
                let id = AIR;

                // Bedrock
                if (worldY <= bedrockY) {
                    id = BEDROCK;
                } else if (worldY <= worldTopY) {
                    const depth = worldTopY - worldY;

                    // Surface block (depth === 0)
                    if (depth === 0) {
                        id = getMountainSurfaceBlock(gx, gz, worldTopY, isMountain, slopeInfo, riverFactor);

                        // Convert grass to dirt if underwater
                        if (id === GRASS && worldTopY < SEA_LEVEL) {
                            id = DIRT;
                        }
                    }
                    // Subsurface layers (depth 1-3)
                    else if (depth < 4) {
                        id = getSubsurfaceBlock(worldTopY, depth, slopeInfo.isSteep);
                    }
                    // Deep rock
                    else {
                        id = STONE;
                    }
                }

                // Alpine lake water
                if (isLakeBed && worldY > worldTopY && worldY <= worldTopY + 3) {
                    id = WATER;
                }

                // Cave carving
                if (id !== AIR && id !== BEDROCK && id !== WATER) {
                    const fadeStart = 30;
                    const fadeEnd = 50;
                    if (worldY < fadeEnd) {
                        const n1 = interpolateCaveNoise(lx, ly, lz, caveCache1, cxDim, cxzStride);
                        const n2 = interpolateCaveNoise(lx, ly, lz, caveCache2, cxDim, cxzStride);
                        const widthNoise = widthNoiseCache[idx];

                        if (shouldCarveCave(worldY, n1, n2, widthNoise, caveDensityMultiplier)) {
                            id = AIR;
                        }
                    }
                }

                set(lx, ly, lz, id);
            }
        }
    }
}

/**
 * Fill water in areas below sea level
 *
 * @param {Uint8Array} data - Block data array
 * @param {number} chunkSize - Chunk size
 * @param {number} chunkHeight - Chunk height
 * @param {Float32Array} heightCache - Height cache
 * @param {number} yOffset - Y offset
 */
export function fillWaterPass(data, chunkSize, chunkHeight, heightCache, yOffset) {
    for (let wx = 0; wx < chunkSize; wx++) {
        for (let wz = 0; wz < chunkSize; wz++) {
            const worldTopY = heightCache[wx + wz * chunkSize];
            if (worldTopY >= SEA_LEVEL) continue;

            const waterStart = worldTopY + 1 + yOffset;
            const waterEnd = Math.min(SEA_LEVEL + yOffset, chunkHeight - 1);

            for (let wy = waterStart; wy <= waterEnd; wy++) {
                const waterIdx = wx + wz * chunkSize + wy * chunkSize * chunkSize;
                if (data[waterIdx] === AIR) {
                    data[waterIdx] = WATER;
                }
            }
        }
    }
}

/**
 * ChunkGenerator - main class for generating chunks
 */
export class ChunkGenerator {
    /**
     * Create a new chunk generator
     * @param {number} seed - World seed
     */
    constructor(seed) {
        this.seed = seed;
        this.terrainGen = new TerrainGenerator({ seed });

        /** @type {number} Cave density multiplier */
        this.caveDensityMultiplier = 1.0;
    }

    /**
     * Initialize the generator with a seed
     * @param {number} seed - World seed
     */
    init(seed) {
        this.seed = seed;
        this.terrainGen.init(seed);
    }

    /**
     * Generate complete terrain data for a chunk
     * This is a pure function - does not interact with IndexedDB or global state
     *
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @returns {Object} Generated chunk data
     */
    generateChunk(cx, cz) {
        const chunkSize = CHUNK_SIZE;
        const chunkHeight = CHUNK_HEIGHT;
        const startX = cx * chunkSize;
        const startZ = cz * chunkSize;
        const yOffset = Y_OFFSET;

        // Initialize chunk data
        const data = new Uint8Array(CHUNK_VOLUME);
        let genState = 0;

        // Helper functions
        const set = (x, y, z, id) => {
            if (x < 0 || x >= chunkSize || z < 0 || z >= chunkSize || y < 0 || y >= chunkHeight) return;
            data[x + z * chunkSize + y * chunkSize * chunkSize] = id;
        };

        const get = (x, y, z) => {
            if (x < 0 || x >= chunkSize || z < 0 || z >= chunkSize || y < 0 || y >= chunkHeight) return AIR;
            return data[x + z * chunkSize + y * chunkSize * chunkSize];
        };

        // Pre-calculate caches
        const caches = precalculateTerrainCaches(chunkSize, startX, startZ, this.terrainGen);
        const caveCaches = precalculateCaveNoise(chunkSize, chunkHeight, startX, startZ);

        // --- PASS 1: Generate terrain with caves ---
        generateTerrainPass(data, chunkSize, chunkHeight, startX, startZ, caches, caveCaches, yOffset, this.caveDensityMultiplier);
        genState |= GEN_PASS.TERRAIN;

        // --- PASS 2: Fill water ---
        fillWaterPass(data, chunkSize, chunkHeight, caches.heightCache, yOffset);
        genState |= GEN_PASS.WATER;

        // --- PASS 3: Generate decorations (trees, etc.) ---
        generateTreesForChunk(
            cx, cz, data, chunkSize, chunkHeight, startX, startZ, this.seed,
            get, set, caches,
            (gx, gz) => this.terrainGen.getBiomeAt(gx, gz),
            (gx, gz) => this.terrainGen.getHeightAt(gx, gz),
            (gx, gz) => this.terrainGen.getRiverFactor(gx, gz, this.seed),
            (gx, gz) => this.terrainGen.getTreeMaskValueGlobal(gx, gz),
            null // No chunks map for pure generation
        );
        genState |= GEN_PASS.DECORATIONS;

        // Create chunk object
        const chunk = {
            blocks: data,
            skyLight: new Uint8Array(CHUNK_VOLUME),
            blockLight: new Uint8Array(CHUNK_VOLUME),
            cx,
            cz,
            startX,
            startZ,
            genState,
            generated: true,
            lit: false,
            meshed: false,
            modified: false,
        };

        return chunk;
    }

    /**
     * Get terrain height at a world position
     * @param {number} gx - Global X
     * @param {number} gz - Global Z
     * @returns {number} Height
     */
    getHeightAt(gx, gz) {
        return this.terrainGen.getHeightAt(gx, gz);
    }

    /**
     * Get biome at a world position
     * @param {number} gx - Global X
     * @param {number} gz - Global Z
     * @returns {Object} Biome configuration
     */
    getBiomeAt(gx, gz) {
        return this.terrainGen.getBiomeAt(gx, gz);
    }

    /**
     * Get river factor at a world position
     * @param {number} gx - Global X
     * @param {number} gz - Global Z
     * @returns {number} River factor (0-1)
     */
    getRiverFactor(gx, gz) {
        return this.terrainGen.getRiverFactor(gx, gz, this.seed);
    }

    /**
     * Clear all generation caches
     */
    clearCaches() {
        this.terrainGen.clearCaches();
    }

    /**
     * Set cave density multiplier
     * @param {number} multiplier - Density multiplier (1.0 = normal)
     */
    setCaveDensity(multiplier) {
        this.caveDensityMultiplier = multiplier;
    }
}

/**
 * Create a standalone chunk generator function
 * Useful for Web Worker usage
 *
 * @param {number} seed - World seed
 * @returns {Function} Function that generates chunks: (cx, cz) => ChunkData
 */
export function createChunkGeneratorFunction(seed) {
    const generator = new ChunkGenerator(seed);
    return (cx, cz) => generator.generateChunk(cx, cz);
}

export default ChunkGenerator;

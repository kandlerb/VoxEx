/**
 * Main lighting engine - orchestrates all lighting operations.
 * Provides a unified interface for chunk and block lighting.
 * @module world/lighting/LightingEngine
 */

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config/WorldConfig.js';
import { buildBlockLookups } from '../../optimization/BlockLookups.js';
import { MAX_LIGHT, MIN_LIGHT, TORCH_LIGHT_DEFAULT, MAX_BLOCK_LIGHT_LEVEL } from './LightConstants.js';
import { calculateChunkSunlight, computeNeighborSunlight, primeSunlightColumn } from './SkyLight.js';
import { calculateBlockLight, computeNeighborBlockLight, isLightSource, getBlockEmission } from './BlockLight.js';
import {
    propagateLightFromNeighbors,
    propagateLightFromEdgesInward,
    recalculateEdgeLighting,
    hasLightingData
} from './CrossChunkLight.js';
import { SunlightTask, createLightTaskTracker, finalizeLightTracker } from './SunlightTask.js';
import { posToIndex, indexToPos, getCombinedLight, getChunkKey, parseChunkKey } from './LightPropagation.js';

// =====================================================
// LIGHTING ENGINE
// =====================================================
// The LightingEngine provides a unified API for all lighting operations:
// - Chunk lighting calculation (initial generation)
// - Block light updates (when blocks change)
// - Cross-chunk propagation (seamless boundaries)
// - Incremental updates (non-blocking async tasks)
//
// Usage:
//   const engine = new LightingEngine();
//   engine.calculateChunkLighting(chunk, chunkSize, chunkHeight);
// =====================================================

/**
 * Lighting engine for voxel world.
 * Manages all lighting calculations and updates.
 */
export class LightingEngine {
    /**
     * Create a new lighting engine.
     * @param {Object} [options] - Configuration options
     * @param {number} [options.torchIntensity=1] - Torch intensity multiplier
     */
    constructor(options = {}) {
        // Get block lookup tables
        const lookups = buildBlockLookups();
        this.isOpaque = lookups.BLOCK_IS_OPAQUE;
        this.isTransparent = lookups.IS_TRANSPARENT;
        this.sunlightAttenuation = lookups.SUNLIGHT_ATTENUATION;
        this.blocklightAttenuation = lookups.BLOCKLIGHT_ATTENUATION;

        // Torch intensity (can be adjusted via settings)
        this.torchIntensity = options.torchIntensity ?? 1;

        // Cache for chunk references (optional, can be set externally)
        this.chunks = null;
    }

    /**
     * Set the chunks map for cross-chunk operations.
     * @param {Map<string, Object>} chunks - Map of chunk key to chunk data
     */
    setChunks(chunks) {
        this.chunks = chunks;
    }

    /**
     * Get the current torch light level based on intensity setting.
     * @returns {number} Torch light level (0-15)
     */
    getTorchLightLevel() {
        const normalized = this.torchIntensity;
        const level = Math.round(normalized * MAX_BLOCK_LIGHT_LEVEL);
        return Math.max(0, Math.min(MAX_BLOCK_LIGHT_LEVEL, level));
    }

    /**
     * Set torch intensity multiplier.
     * @param {number} intensity - Intensity multiplier (0-2 typical range)
     */
    setTorchIntensity(intensity) {
        this.torchIntensity = intensity;
    }

    // =====================================================
    // CHUNK LIGHTING
    // =====================================================

    /**
     * Calculate all lighting for a chunk (initial generation).
     * This is the main entry point for chunk lighting during world generation.
     *
     * @param {Object} chunk - Chunk object with blocks array
     * @param {number} [chunkSize=16] - Chunk width/depth
     * @param {number} [chunkHeight=320] - Chunk height
     */
    calculateChunkLighting(chunk, chunkSize = CHUNK_SIZE, chunkHeight = CHUNK_HEIGHT) {
        const torchLevel = this.getTorchLightLevel();

        // First pass: vertical sunlight propagation + horizontal BFS
        calculateChunkSunlight(chunk, chunkSize, chunkHeight, this.isTransparent, this.sunlightAttenuation);

        // Second pass: block light from torches
        calculateBlockLight(chunk, chunkSize, chunkHeight, this.isTransparent, torchLevel);
    }

    /**
     * Recalculate lighting for a chunk including edge propagation.
     * Use this when neighbors have changed and edge values need updating.
     *
     * @param {Object} chunk - Chunk to recalculate
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {number} [chunkSize=16] - Chunk width/depth
     * @param {number} [chunkHeight=320] - Chunk height
     */
    recalculateChunkLighting(chunk, cx, cz, chunkSize = CHUNK_SIZE, chunkHeight = CHUNK_HEIGHT) {
        if (!this.chunks) {
            // No chunks map - just do internal calculation
            this.calculateChunkLighting(chunk, chunkSize, chunkHeight);
            return;
        }

        const torchLevel = this.getTorchLightLevel();

        recalculateEdgeLighting(
            chunk, cx, cz, chunkSize, chunkHeight, this.chunks,
            (c, cs, ch, isT, sa) => calculateChunkSunlight(c, cs, ch, isT, sa),
            (c, cs, ch, isT, tl) => calculateBlockLight(c, cs, ch, isT, tl),
            this.isTransparent, this.sunlightAttenuation,
            getChunkKey, torchLevel
        );
    }

    /**
     * Propagate light from neighbors into a chunk's edges.
     * Call this when a new neighbor chunk is generated.
     *
     * @param {Object} chunk - Chunk to update
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {number} [chunkSize=16] - Chunk width/depth
     * @param {number} [chunkHeight=320] - Chunk height
     */
    propagateFromNeighbors(chunk, cx, cz, chunkSize = CHUNK_SIZE, chunkHeight = CHUNK_HEIGHT) {
        if (!this.chunks) return;

        propagateLightFromNeighbors(
            chunk, cx, cz, chunkSize, chunkHeight,
            this.chunks, this.isTransparent, getChunkKey
        );

        propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight, this.isTransparent);
    }

    // =====================================================
    // LIGHT ACCESS
    // =====================================================

    /**
     * Get combined light level at a position in a chunk.
     * @param {Object} chunk - Chunk data
     * @param {number} lx - Local X (0-15)
     * @param {number} ly - Local Y (0-319)
     * @param {number} lz - Local Z (0-15)
     * @returns {number} Combined light level (0-15)
     */
    getLight(chunk, lx, ly, lz) {
        const idx = posToIndex(lx, ly, lz);
        const sky = chunk.skyLight ? chunk.skyLight[idx] : MIN_LIGHT;
        const block = chunk.blockLight ? chunk.blockLight[idx] : 0;
        return getCombinedLight(sky, block);
    }

    /**
     * Get skylight level at a position.
     * @param {Object} chunk - Chunk data
     * @param {number} lx - Local X
     * @param {number} ly - Local Y
     * @param {number} lz - Local Z
     * @returns {number} Sky light level (1-15)
     */
    getSkyLight(chunk, lx, ly, lz) {
        if (!chunk.skyLight) return MIN_LIGHT;
        const idx = posToIndex(lx, ly, lz);
        return chunk.skyLight[idx];
    }

    /**
     * Get block light level at a position.
     * @param {Object} chunk - Chunk data
     * @param {number} lx - Local X
     * @param {number} ly - Local Y
     * @param {number} lz - Local Z
     * @returns {number} Block light level (0-15)
     */
    getBlockLight(chunk, lx, ly, lz) {
        if (!chunk.blockLight) return 0;
        const idx = posToIndex(lx, ly, lz);
        return chunk.blockLight[idx];
    }

    /**
     * Set skylight level at a position.
     * @param {Object} chunk - Chunk data
     * @param {number} lx - Local X
     * @param {number} ly - Local Y
     * @param {number} lz - Local Z
     * @param {number} level - Light level (1-15)
     */
    setSkyLight(chunk, lx, ly, lz, level) {
        if (!chunk.skyLight) return;
        const idx = posToIndex(lx, ly, lz);
        chunk.skyLight[idx] = level;
    }

    /**
     * Set block light level at a position.
     * @param {Object} chunk - Chunk data
     * @param {number} lx - Local X
     * @param {number} ly - Local Y
     * @param {number} lz - Local Z
     * @param {number} level - Light level (0-15)
     */
    setBlockLight(chunk, lx, ly, lz, level) {
        if (!chunk.blockLight) return;
        const idx = posToIndex(lx, ly, lz);
        chunk.blockLight[idx] = level;
    }

    // =====================================================
    // INCREMENTAL UPDATES
    // =====================================================

    /**
     * Create a sunlight task for incremental updates.
     * @param {number} x - Global X coordinate
     * @param {number} y - Global Y coordinate
     * @param {number} z - Global Z coordinate
     * @param {number} oldId - Previous block ID
     * @param {number} newId - New block ID
     * @param {Object} [tracker] - Light task tracker
     * @returns {SunlightTask} Sunlight task instance
     */
    createSunlightTask(x, y, z, oldId, newId, tracker = null) {
        return new SunlightTask(x, y, z, oldId, newId, tracker);
    }

    /**
     * Create a light task tracker.
     * @param {Array<string>} [initialChunks=[]] - Initial chunk keys
     * @returns {Object} Light task tracker
     */
    createTaskTracker(initialChunks = []) {
        return createLightTaskTracker(initialChunks);
    }

    /**
     * Finalize a light task tracker.
     * @param {Object} tracker - Tracker to finalize
     */
    finalizeTracker(tracker) {
        finalizeLightTracker(tracker);
    }

    // =====================================================
    // BLOCK PROPERTY CHECKS
    // =====================================================

    /**
     * Check if a block is transparent (lets light through).
     * @param {number} blockId - Block ID
     * @returns {boolean} True if transparent
     */
    isBlockTransparent(blockId) {
        return this.isTransparent[blockId] === 1;
    }

    /**
     * Check if a block is opaque (blocks all light).
     * @param {number} blockId - Block ID
     * @returns {boolean} True if opaque
     */
    isBlockOpaque(blockId) {
        return this.isOpaque[blockId] === 1;
    }

    /**
     * Get sunlight attenuation for a block.
     * @param {number} blockId - Block ID
     * @returns {number} Attenuation value (0-15)
     */
    getBlockAttenuation(blockId) {
        return this.sunlightAttenuation[blockId];
    }

    /**
     * Check if a block emits light.
     * @param {number} blockId - Block ID
     * @returns {boolean} True if light emitter
     */
    isBlockLightSource(blockId) {
        return isLightSource(blockId);
    }

    /**
     * Get the light emission level of a block.
     * @param {number} blockId - Block ID
     * @returns {number} Light emission (0-15)
     */
    getBlockLightEmission(blockId) {
        return getBlockEmission(blockId, this.getTorchLightLevel());
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Check if a chunk has lighting data.
     * @param {Object} chunk - Chunk to check
     * @returns {boolean} True if chunk has lighting arrays
     */
    hasLighting(chunk) {
        return hasLightingData(chunk);
    }

    /**
     * Ensure a chunk has lighting arrays.
     * Creates them if they don't exist.
     * @param {Object} chunk - Chunk to check
     * @param {number} [chunkSize=16] - Chunk size
     * @param {number} [chunkHeight=320] - Chunk height
     */
    ensureLightingArrays(chunk, chunkSize = CHUNK_SIZE, chunkHeight = CHUNK_HEIGHT) {
        const size = chunkSize * chunkSize * chunkHeight;

        if (!chunk.skyLight || chunk.skyLight.length !== size) {
            chunk.skyLight = new Uint8Array(size);
            chunk.skyLight.fill(MIN_LIGHT);
        }

        if (!chunk.blockLight || chunk.blockLight.length !== size) {
            chunk.blockLight = new Uint8Array(size);
        }
    }

    /**
     * Get engine statistics.
     * @returns {Object} Engine statistics
     */
    stats() {
        return {
            torchLightLevel: this.getTorchLightLevel(),
            torchIntensity: this.torchIntensity,
            hasChunksRef: this.chunks !== null,
            constants: {
                MAX_LIGHT,
                MIN_LIGHT,
                TORCH_LIGHT_DEFAULT
            }
        };
    }
}

// =====================================================
// EXPORTS
// =====================================================

export default LightingEngine;

// Re-export key functions for direct use
export {
    calculateChunkSunlight,
    calculateBlockLight,
    computeNeighborSunlight,
    computeNeighborBlockLight,
    primeSunlightColumn,
    propagateLightFromNeighbors,
    propagateLightFromEdgesInward,
    recalculateEdgeLighting,
    SunlightTask,
    createLightTaskTracker,
    finalizeLightTracker,
    posToIndex,
    indexToPos,
    getCombinedLight,
    getChunkKey,
    parseChunkKey
};

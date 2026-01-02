/**
 * Optimized block property lookup tables.
 * Provides O(1) access to block properties using typed arrays.
 * @module optimization/BlockLookups
 */

import { BLOCK_CONFIG } from '../config/BlockConfig.js';

/**
 * @typedef {Object} BlockLookupTables
 * @property {Uint8Array} BLOCK_IS_SOLID - 1 if block is solid (player collision)
 * @property {Uint8Array} BLOCK_IS_OPAQUE - 1 if block is opaque (blocks all light)
 * @property {Uint8Array} IS_TRANSPARENT - 1 if block is transparent (partial light)
 * @property {Uint8Array} SUNLIGHT_ATTENUATION - How much sunlight is reduced per block (0-15)
 * @property {Uint8Array} BLOCKLIGHT_ATTENUATION - How much torch light is reduced per block (0-15)
 */

/**
 * Builds optimized lookup tables for block properties.
 * Called once at startup for O(1) block property checks during gameplay.
 * @returns {BlockLookupTables} Object containing all lookup tables
 */
export function buildBlockLookups() {
    // Initialize arrays with default values
    const BLOCK_IS_SOLID = new Uint8Array(256);
    const BLOCK_IS_OPAQUE = new Uint8Array(256);
    const IS_TRANSPARENT = new Uint8Array(256);
    const SUNLIGHT_ATTENUATION = new Uint8Array(256);
    const BLOCKLIGHT_ATTENUATION = new Uint8Array(256);

    // Set defaults: solid and opaque blocks block all light
    BLOCK_IS_SOLID.fill(1);
    BLOCK_IS_OPAQUE.fill(1);
    IS_TRANSPARENT.fill(0);
    SUNLIGHT_ATTENUATION.fill(15);    // Default: fully blocks sunlight
    BLOCKLIGHT_ATTENUATION.fill(15);  // Default: fully blocks torch light

    // Build from BLOCK_CONFIG tags and lighting properties
    for (const block of BLOCK_CONFIG) {
        const id = block.id;

        // Transparent blocks (from "transparent" tag)
        if (block.tags.includes("transparent")) {
            IS_TRANSPARENT[id] = 1;
            BLOCK_IS_SOLID[id] = 0;
            BLOCK_IS_OPAQUE[id] = 0;
            SUNLIGHT_ATTENUATION[id] = 0;      // Default: transparent blocks don't block sunlight
            BLOCKLIGHT_ATTENUATION[id] = 0;    // Default: transparent blocks don't block torch light
        }

        // Fluids are not solid but may have custom light behavior
        if (block.tags.includes("fluid")) {
            BLOCK_IS_SOLID[id] = 0;
        }

        // Apply custom lighting overrides from config
        if (block.lighting) {
            if (block.lighting.sunlightAttenuation !== undefined) {
                SUNLIGHT_ATTENUATION[id] = block.lighting.sunlightAttenuation;
            }
            if (block.lighting.blocklightAttenuation !== undefined) {
                BLOCKLIGHT_ATTENUATION[id] = block.lighting.blocklightAttenuation;
            }
        }
    }

    return {
        BLOCK_IS_SOLID,
        BLOCK_IS_OPAQUE,
        IS_TRANSPARENT,
        SUNLIGHT_ATTENUATION,
        BLOCKLIGHT_ATTENUATION
    };
}

/**
 * Pre-built lookup tables instance.
 * Created at module load time for immediate use.
 */
export const BlockLookups = buildBlockLookups();

/**
 * Quick check if a block is solid (for collision).
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if the block is solid
 */
export function isSolid(blockId) {
    return BlockLookups.BLOCK_IS_SOLID[blockId] === 1;
}

/**
 * Quick check if a block is opaque (blocks all light).
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if the block is opaque
 */
export function isOpaque(blockId) {
    return BlockLookups.BLOCK_IS_OPAQUE[blockId] === 1;
}

/**
 * Quick check if a block is transparent (lets light through).
 * @param {number} blockId - Block ID to check
 * @returns {boolean} True if the block is transparent
 */
export function isTransparentBlock(blockId) {
    return BlockLookups.IS_TRANSPARENT[blockId] === 1;
}

/**
 * Get sunlight attenuation for a block.
 * @param {number} blockId - Block ID to check
 * @returns {number} Light reduction (0-15)
 */
export function getSunlightAttenuation(blockId) {
    return BlockLookups.SUNLIGHT_ATTENUATION[blockId];
}

/**
 * Get block light attenuation for a block.
 * @param {number} blockId - Block ID to check
 * @returns {number} Light reduction (0-15)
 */
export function getBlocklightAttenuation(blockId) {
    return BlockLookups.BLOCKLIGHT_ATTENUATION[blockId];
}

export default BlockLookups;

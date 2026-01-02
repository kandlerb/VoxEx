/**
 * VoxEx Block ID Constants
 * Block IDs are stable - do not renumber existing blocks.
 * @module core/constants
 */

/** @type {number} Empty space */
export const AIR = 0;

/** @type {number} Grass block (top/side/bottom textures) */
export const GRASS = 1;

/** @type {number} Dirt block */
export const DIRT = 2;

/** @type {number} Stone block */
export const STONE = 3;

/** @type {number} Wooden planks */
export const WOOD = 4;

/** @type {number} Oak log (top/side textures) */
export const LOG = 5;

/** @type {number} Oak leaves (semi-transparent) */
export const LEAVES = 6;

/** @type {number} Indestructible bottom layer */
export const BEDROCK = 7;

/** @type {number} Sand block */
export const SAND = 8;

/** @type {number} Water (transparent, special rendering) */
export const WATER = 9;

/** @type {number} Light-emitting torch block */
export const TORCH = 10;

/** @type {number} Snow block */
export const SNOW = 11;

/** @type {number} Gravel block */
export const GRAVEL = 12;

/** @type {number} Longwood biome log (2×2/3×3 trunks) */
export const LONGWOOD_LOG = 13;

/** @type {number} Longwood biome leaves */
export const LONGWOOD_LEAVES = 14;

/** @type {number} Placeholder for unloaded chunks */
export const UNLOADED_BLOCK = 255;

/**
 * All block IDs for iteration and lookup
 * @type {Object<string, number>}
 */
export const BLOCK_IDS = {
    AIR,
    GRASS,
    DIRT,
    STONE,
    WOOD,
    LOG,
    LEAVES,
    BEDROCK,
    SAND,
    WATER,
    TORCH,
    SNOW,
    GRAVEL,
    LONGWOOD_LOG,
    LONGWOOD_LEAVES,
    UNLOADED_BLOCK
};

/** Number of defined block types (excluding AIR and UNLOADED_BLOCK) */
export const BLOCK_COUNT = 15;

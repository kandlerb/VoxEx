/**
 * VoxEx Block Configuration
 * Single source of truth for all block types.
 * @module config/BlockConfig
 */

import {
    AIR, GRASS, DIRT, STONE, WOOD, LOG, LEAVES,
    BEDROCK, SAND, WATER, TORCH, SNOW, GRAVEL,
    LONGWOOD_LOG, LONGWOOD_LEAVES, UNLOADED_BLOCK
} from '../core/constants.js';

// =====================================================
// TEXTURE TILE INDICES (must match initTextures order)
// =====================================================

/**
 * Texture tile indices for the atlas
 * @type {Object<string, number>}
 */
export const TILE = {
    GRASS_TOP: 0,
    GRASS_SIDE: 1,
    DIRT: 2,
    STONE: 3,
    PLANK: 4,
    LOG_SIDE: 5,       // Oak log side (bark)
    LEAF: 6,
    BEDROCK: 7,
    LOG_TOP: 8,        // Oak log top (rings)
    SAND: 9,
    WATER: 10,
    TORCH: 11,
    SNOW: 12,
    GRAVEL: 13,
    LONGWOOD_LOG_SIDE: 14,
    LONGWOOD_LOG_TOP: 15,
    LONGWOOD_LEAF: 16,
};

/** Number of texture tiles in atlas */
export const NUM_TILES = 17;

// =====================================================
// BLOCK_CONFIG - Single source of truth for all blocks
// =====================================================

/**
 * Block configuration array - single source of truth for all blocks.
 * To add a new block:
 * 1. Add a new constant ID in constants.js
 * 2. Add an entry here with all properties
 * That's it - inventory, textures, transparency, etc. are auto-derived.
 * @type {Array<Object>}
 */
export const BLOCK_CONFIG = [
    // AIR - special case, no textures or inventory
    {
        id: AIR,
        key: "air",
        name: "Air",
        tags: ["transparent"],
        textures: null,
        ui: { showInInventory: false },
    },
    // GRASS
    {
        id: GRASS,
        key: "grass",
        name: "Grass",
        tags: ["solid"],
        textures: { top: TILE.GRASS_TOP, side: TILE.GRASS_SIDE, bottom: TILE.DIRT },
        ui: { showInInventory: true, tileIndex: TILE.GRASS_SIDE, defaultHotbar: true, hotbarOrder: 0 },
    },
    // DIRT
    {
        id: DIRT,
        key: "dirt",
        name: "Dirt",
        tags: ["solid"],
        textures: { all: TILE.DIRT },
        ui: { showInInventory: true, tileIndex: TILE.DIRT, defaultHotbar: true, hotbarOrder: 1 },
    },
    // STONE
    {
        id: STONE,
        key: "stone",
        name: "Stone",
        tags: ["solid"],
        textures: { all: TILE.STONE },
        ui: { showInInventory: true, tileIndex: TILE.STONE, defaultHotbar: true, hotbarOrder: 2 },
    },
    // WOOD (Planks)
    {
        id: WOOD,
        key: "wood",
        name: "Wood",
        tags: ["solid"],
        textures: { all: TILE.PLANK },
        ui: { showInInventory: true, tileIndex: TILE.PLANK, defaultHotbar: true, hotbarOrder: 3 },
    },
    // LOG (Oak)
    {
        id: LOG,
        key: "log",
        name: "Log",
        tags: ["solid", "log"],
        textures: { top: TILE.LOG_TOP, side: TILE.LOG_SIDE, bottom: TILE.LOG_TOP },
        ui: { showInInventory: true, tileIndex: TILE.LOG_SIDE, defaultHotbar: true, hotbarOrder: 4 },
    },
    // LEAVES (Oak)
    {
        id: LEAVES,
        key: "leaves",
        name: "Leaves",
        tags: ["transparent", "leaves"],
        textures: { all: TILE.LEAF },
        ui: { showInInventory: true, tileIndex: TILE.LEAF, defaultHotbar: true, hotbarOrder: 5 },
        lighting: { sunlightAttenuation: 1, blocklightAttenuation: 1 },
    },
    // BEDROCK
    {
        id: BEDROCK,
        key: "bedrock",
        name: "Bedrock",
        tags: ["solid"],
        textures: { all: TILE.BEDROCK },
        ui: { showInInventory: false },
    },
    // SAND
    {
        id: SAND,
        key: "sand",
        name: "Sand",
        tags: ["solid"],
        textures: { all: TILE.SAND },
        ui: { showInInventory: true, tileIndex: TILE.SAND, defaultHotbar: true, hotbarOrder: 6 },
    },
    // WATER
    {
        id: WATER,
        key: "water",
        name: "Water",
        tags: ["transparent", "fluid"],
        textures: { all: TILE.WATER },
        ui: { showInInventory: true, tileIndex: TILE.WATER, defaultHotbar: true, hotbarOrder: 7 },
        lighting: { blocklightAttenuation: 2 },
    },
    // TORCH
    {
        id: TORCH,
        key: "torch",
        name: "Torch",
        tags: ["transparent", "emissive"],
        textures: { all: TILE.TORCH },
        ui: { showInInventory: true, tileIndex: TILE.TORCH, defaultHotbar: true, hotbarOrder: 8 },
    },
    // SNOW
    {
        id: SNOW,
        key: "snow",
        name: "Snow",
        tags: ["solid"],
        textures: { all: TILE.SNOW },
        ui: { showInInventory: true, tileIndex: TILE.SNOW },
    },
    // GRAVEL
    {
        id: GRAVEL,
        key: "gravel",
        name: "Gravel",
        tags: ["solid"],
        textures: { all: TILE.GRAVEL },
        ui: { showInInventory: true, tileIndex: TILE.GRAVEL },
    },
    // LONGWOOD_LOG
    {
        id: LONGWOOD_LOG,
        key: "longwood_log",
        name: "Longwood Log",
        tags: ["solid", "log"],
        textures: { top: TILE.LONGWOOD_LOG_TOP, side: TILE.LONGWOOD_LOG_SIDE, bottom: TILE.LONGWOOD_LOG_TOP },
        ui: { showInInventory: true, tileIndex: TILE.LONGWOOD_LOG_SIDE },
    },
    // LONGWOOD_LEAVES
    {
        id: LONGWOOD_LEAVES,
        key: "longwood_leaves",
        name: "Longwood Leaves",
        tags: ["transparent", "leaves"],
        textures: { all: TILE.LONGWOOD_LEAF },
        ui: { showInInventory: true, tileIndex: TILE.LONGWOOD_LEAF },
        lighting: { sunlightAttenuation: 1, blocklightAttenuation: 1 },
    },
    // UNLOADED_BLOCK - internal sentinel
    {
        id: UNLOADED_BLOCK,
        key: "unloaded",
        name: "Unloaded",
        tags: ["transparent"],
        textures: null,
        ui: { showInInventory: false },
        lighting: { sunlightAttenuation: 0, blocklightAttenuation: 0 },
    },
];

// =====================================================
// DERIVED STRUCTURES (built from BLOCK_CONFIG)
// =====================================================

/**
 * Fast lookup by numeric ID
 * @type {Array<Object|null>}
 */
export const BLOCK_BY_ID = new Array(256).fill(null);
for (const block of BLOCK_CONFIG) {
    BLOCK_BY_ID[block.id] = block;
}

/**
 * String key -> numeric ID mapping
 * @type {Object<string, number>}
 */
export const blockIds = {};
for (const block of BLOCK_CONFIG) {
    blockIds[block.key] = block.id;
}

/**
 * Set of log block IDs
 * @type {Set<number>}
 */
export const LOG_BLOCK_IDS = new Set();

/**
 * Set of leaf block IDs
 * @type {Set<number>}
 */
export const LEAF_BLOCK_IDS = new Set();

/**
 * Set of transparent block IDs
 * @type {Set<number>}
 */
export const TRANSPARENT_BLOCK_IDS = new Set();

/**
 * Set of fluid block IDs
 * @type {Set<number>}
 */
export const FLUID_BLOCK_IDS = new Set();

// Populate tag-based sets
for (const block of BLOCK_CONFIG) {
    if (block.tags.includes("log")) LOG_BLOCK_IDS.add(block.id);
    if (block.tags.includes("leaves")) LEAF_BLOCK_IDS.add(block.id);
    if (block.tags.includes("transparent")) TRANSPARENT_BLOCK_IDS.add(block.id);
    if (block.tags.includes("fluid")) FLUID_BLOCK_IDS.add(block.id);
}

/**
 * Blocks visible in inventory
 * @type {Array<{id: number, name: string, tileIndex: number}>}
 */
export const INVENTORY_BLOCKS = BLOCK_CONFIG
    .filter(b => b.ui?.showInInventory)
    .map(b => ({
        id: b.id,
        name: b.name,
        tileIndex: b.ui.tileIndex ?? 0,
    }));

/**
 * Initial hotbar slots derived from block configuration
 * @type {number[]}
 */
export const initialHotbarSlots = BLOCK_CONFIG
    .filter(b => b.ui?.defaultHotbar)
    .sort((a, b) => (a.ui.hotbarOrder ?? 99) - (b.ui.hotbarOrder ?? 99))
    .slice(0, 9)
    .map(b => b.id);

/**
 * Check if a block is a leaf type
 * @param {number} blockId - The block ID to check
 * @returns {boolean} True if the block is a leaf type
 */
export function isLeafBlock(blockId) {
    return LEAF_BLOCK_IDS.has(blockId);
}

/**
 * Check if a block is a log type
 * @param {number} blockId - The block ID to check
 * @returns {boolean} True if the block is a log type
 */
export function isLogBlock(blockId) {
    return LOG_BLOCK_IDS.has(blockId);
}

/**
 * Check if a block is transparent
 * @param {number} blockId - The block ID to check
 * @returns {boolean} True if the block is transparent
 */
export function isTransparent(blockId) {
    return TRANSPARENT_BLOCK_IDS.has(blockId);
}

/**
 * Check if a block is a fluid
 * @param {number} blockId - The block ID to check
 * @returns {boolean} True if the block is a fluid
 */
export function isFluid(blockId) {
    return FLUID_BLOCK_IDS.has(blockId);
}

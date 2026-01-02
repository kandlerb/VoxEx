/**
 * VoxEx JSDoc Type Definitions
 * This file contains only type definitions for documentation purposes.
 * @module core/types
 */

/**
 * Block ID constant (0-255)
 * @typedef {number} BlockId
 */

/**
 * Texture tile index for the atlas
 * @typedef {number} TileIndex
 */

/**
 * Chunk coordinate (integer)
 * @typedef {number} ChunkCoord
 */

/**
 * Local block coordinate within a chunk (0-15 for x/z, 0-319 for y)
 * @typedef {number} LocalCoord
 */

/**
 * Global block coordinate
 * @typedef {number} GlobalCoord
 */

/**
 * Chunk key string in format "cx,cz"
 * @typedef {string} ChunkKey
 */

/**
 * RGB hex color value
 * @typedef {number} HexColor
 */

/**
 * Light level (1-15, where 15 is full sunlight)
 * @typedef {number} LightLevel
 */

/**
 * Ambient occlusion value (0.25-1.0)
 * @typedef {number} AOValue
 */

/**
 * 3D position object
 * @typedef {Object} Position3D
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 * @property {number} z - Z coordinate
 */

/**
 * Axis-aligned bounding box
 * @typedef {Object} AABB
 * @property {number} minX - Minimum X bound
 * @property {number} maxX - Maximum X bound
 * @property {number} minY - Minimum Y bound
 * @property {number} maxY - Maximum Y bound
 * @property {number} minZ - Minimum Z bound
 * @property {number} maxZ - Maximum Z bound
 */

/**
 * Block hit result from raycasting
 * @typedef {Object} BlockHit
 * @property {GlobalCoord} x - Block X coordinate
 * @property {GlobalCoord} y - Block Y coordinate
 * @property {GlobalCoord} z - Block Z coordinate
 * @property {number[]|null} face - Face normal [nx, ny, nz] or null
 * @property {BlockId} blockId - The block ID at this position
 */

/**
 * Block interaction result
 * @typedef {Object} BlockInteractionResult
 * @property {'break'|'place'} type - Type of interaction
 * @property {GlobalCoord} x - Block X coordinate
 * @property {GlobalCoord} y - Block Y coordinate
 * @property {GlobalCoord} z - Block Z coordinate
 * @property {BlockId} [blockId] - Block ID (for place operations)
 */

/**
 * Chunk data structure
 * @typedef {Object} ChunkData
 * @property {Uint8Array} blocks - Block data array (16×16×320)
 * @property {Uint8Array} skyLight - Sky light levels
 * @property {Uint8Array} blockLight - Block light levels
 */

/**
 * Texture mapping for a block face
 * @typedef {Object} BlockTextures
 * @property {TileIndex} [all] - Single texture for all faces
 * @property {TileIndex} [top] - Top face texture
 * @property {TileIndex} [side] - Side faces texture
 * @property {TileIndex} [bottom] - Bottom face texture
 */

/**
 * Block UI configuration
 * @typedef {Object} BlockUIConfig
 * @property {boolean} showInInventory - Whether to show in inventory
 * @property {TileIndex} [tileIndex] - Icon tile index
 * @property {boolean} [defaultHotbar] - Whether to include in default hotbar
 * @property {number} [hotbarOrder] - Order in hotbar (lower = earlier)
 */

/**
 * Block configuration entry
 * @typedef {Object} BlockConfigEntry
 * @property {BlockId} id - Block ID
 * @property {string} key - String key for lookup
 * @property {string} name - Display name
 * @property {string[]} tags - Behavior tags
 * @property {BlockTextures|null} textures - Texture configuration
 * @property {BlockUIConfig} [ui] - UI configuration
 * @property {Object} [lighting] - Lighting attenuation
 */

/**
 * Noise configuration for terrain generation
 * @typedef {Object} NoiseConfig
 * @property {number} octaves - Number of noise octaves
 * @property {number} persistence - Amplitude scaling per octave
 * @property {number} lacunarity - Frequency scaling per octave
 */

/**
 * World configuration
 * @typedef {Object} WorldConfig
 * @property {number} seed - World seed for generation
 * @property {number} biomeFrequency - Biome transition frequency
 * @property {NoiseConfig} noise - Noise configuration
 */

/**
 * Trunk size option for weighted random selection
 * @typedef {Object} TrunkSizeOption
 * @property {number} w - Trunk width
 * @property {number} d - Trunk depth
 * @property {number} weight - Selection weight
 */

/**
 * Trunk configuration for tree generation
 * @typedef {Object} TrunkConfig
 * @property {number} w - Trunk width (X axis)
 * @property {number} d - Trunk depth (Z axis)
 * @property {number} minHeight - Minimum trunk height
 * @property {number} maxHeight - Maximum trunk height
 * @property {TrunkSizeOption[]} [sizes] - Weighted size options
 * @property {number} branchStart - Height ratio where branches can appear (0-1)
 * @property {number} branchChance - Probability of branch at valid positions
 * @property {number} branchLength - Max branch length in blocks
 * @property {boolean} taperTop - Whether trunk narrows at top
 */

/**
 * Canopy layer definition for layered canopy shapes
 * @typedef {Object} CanopyLayer
 * @property {number} yOffset - Y offset from trunk top
 * @property {number} radius - Layer radius
 * @property {number} leafChance - Leaf placement chance for this layer
 */

/**
 * Canopy shape type
 * @typedef {'round'|'conical'|'spherical'|'layered'|'umbrella'} CanopyShape
 */

/**
 * Canopy configuration for tree generation
 * @typedef {Object} CanopyConfig
 * @property {number} radius - Base canopy radius
 * @property {number} topExtension - How far canopy extends above trunk top
 * @property {number} overlapDown - How far canopy extends below trunk top
 * @property {number} leafChance - Probability to place leaf (0-1)
 * @property {CanopyShape} shape - Canopy shape type
 * @property {number} taperFactor - Radius reduction per layer
 * @property {number} noiseStrength - Organic variation intensity (0-1)
 * @property {number} holeChance - Chance to create holes in canopy
 * @property {number} branchChance - Chance for protruding branches
 * @property {number} layerGap - Vertical gap between leaf clusters
 * @property {CanopyLayer[]|null} layers - Explicit layer definitions
 */

/**
 * Tree block configuration
 * @typedef {Object} TreeBlockConfig
 * @property {BlockId|null} log - Log block ID (null = default LOG)
 * @property {BlockId|null} leaves - Leaves block ID (null = default LEAVES)
 */

/**
 * Complete tree configuration
 * @typedef {Object} TreeConfig
 * @property {TrunkConfig} trunk - Trunk configuration
 * @property {CanopyConfig} canopy - Canopy configuration
 * @property {TreeBlockConfig} blocks - Block types
 * @property {number} spacing - Minimum spacing between trees
 * @property {Set<BlockId>|BlockId[]|null} allowedGroundBlocks - Valid ground blocks
 */

/**
 * Biome tree configuration (partial, merged with TREE_CONFIG)
 * @typedef {Object} BiomeTreeConfig
 * @property {number} density - Tree density (0-1)
 * @property {number} [spacing] - Minimum spacing between trees
 * @property {Partial<TrunkConfig>} [trunk] - Trunk overrides
 * @property {Partial<CanopyConfig>} [canopy] - Canopy overrides
 * @property {Partial<TreeBlockConfig>} [blocks] - Block type overrides
 * @property {Set<BlockId>|BlockId[]|null} [allowedGroundBlocks] - Valid ground blocks
 */

/**
 * Biome configuration entry
 * @typedef {Object} BiomeConfigEntry
 * @property {number} weight - Selection probability weight
 * @property {number} roughness - Noise frequency for terrain
 * @property {number} amplitude - Height variation range
 * @property {number} baseHeight - Average terrain height
 * @property {Function} heightFunc - Terrain height function
 * @property {BiomeTreeConfig} trees - Tree placement config
 * @property {string[]} tags - Behavior tags (e.g., "mountain", "forested")
 * @property {Function|null} decorateColumn - Custom decorator
 */

/**
 * Resolved biome with name property
 * @typedef {BiomeConfigEntry & {name: string}} ResolvedBiome
 */

// Export empty object - this file is for type definitions only
export {};

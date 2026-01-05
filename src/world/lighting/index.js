/**
 * Lighting module barrel export.
 * Provides all lighting functionality for the voxel world.
 * @module world/lighting
 */

// =====================================================
// CONSTANTS
// =====================================================
export {
    MAX_LIGHT,
    MIN_LIGHT,
    LIGHT_FALLOFF,
    SUNLIGHT_FULL,
    TORCH_LIGHT_DEFAULT,
    MAX_BLOCK_LIGHT_LEVEL,
    LIGHT_DIRECTIONS,
    NEIGHBOR_OFFSETS,
    LIGHT_EMITTERS,
    isLightEmitter,
    getLightEmission,
    MAX_EDGE_LIGHTING_PASSES,
    EDGE_LIGHTING_BUDGET,
    MAX_LIGHT_UPDATES_PER_FRAME,
    SUNLIGHT_STEPS_PER_FRAME,
    HARD_CAP_BASE_CHUNKS,
    HARD_CAP_MAX_CHUNKS,
    HARD_CAP_GROWTH_RATIO,
    clampBlockLight
} from './LightConstants.js';

// =====================================================
// PROPAGATION UTILITIES
// =====================================================
// Note: getChunkKey, parseChunkKey, globalToChunk, globalToLocal, localToGlobal
// are exported from ../config/WorldConfig.js (the canonical source) to avoid duplicate exports
export {
    posToIndex,
    posToIndexDynamic,
    indexToPos,
    isInBounds,
    isOnEdge,
    getCombinedLight,
    getPropagatedLight,
    getAttenuatedLight,
    getCardinalNeighborKeys,
    getAllNeighborKeys
} from './LightPropagation.js';

// =====================================================
// SKY LIGHT
// =====================================================
export {
    calculateChunkSunlight,
    primeSunlightColumn,
    computeNeighborSunlight
} from './SkyLight.js';

// =====================================================
// BLOCK LIGHT
// =====================================================
export {
    calculateBlockLight,
    addBlockLightSource,
    computeNeighborBlockLight,
    isLightSource,
    getBlockEmission
} from './BlockLight.js';

// =====================================================
// CROSS-CHUNK LIGHTING
// =====================================================
export {
    propagateEdgeLighting,
    propagateLightFromNeighbors,
    propagateLightFromEdgesInward,
    recalculateEdgeLighting,
    hasLightingData,
    EDGE_INFO,
    edgeHasPropagableLight
} from './CrossChunkLight.js';

// =====================================================
// SUNLIGHT TASK
// =====================================================
export {
    SunlightTask,
    createLightTaskTracker,
    finalizeLightTracker
} from './SunlightTask.js';

// =====================================================
// LIGHTING ENGINE
// =====================================================
export {
    LightingEngine,
    default as LightingEngineDefault
} from './LightingEngine.js';

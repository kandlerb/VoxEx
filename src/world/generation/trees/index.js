/**
 * Tree generation module exports
 * @module world/generation/trees
 */

export {
    generateTreesForChunk,
    getChunkTreePositions,
    pickTrunkSize,
    isLogBlock,
    isLeafBlock,
    isValidTreeGround,
    LOG_BLOCK_IDS,
    LEAF_BLOCK_IDS,
    calculateMaxTreeCanopyRadius
} from './TreeGenerator.js';

export {
    forEachCanopyVoxel,
    forEachTrunkBranch,
    getCanopyLayerRadius,
    buildSphericalCanopy,
    buildConicalCanopy
} from './CanopyBuilder.js';

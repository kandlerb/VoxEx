/**
 * VoxEx Optimization Module.
 * Provides object pools, caches, and lookup tables for performance.
 * @module optimization
 */

// Pool exports
export * from './pools/index.js';

// Cache exports
export * from './caches/index.js';

// Block lookup exports
export {
    buildBlockLookups,
    BlockLookups,
    isSolid,
    isOpaque,
    isTransparentBlock,
    getSunlightAttenuation,
    getBlocklightAttenuation,
    default as BlockLookupsDefault
} from './BlockLookups.js';

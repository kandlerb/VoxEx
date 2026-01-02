/**
 * Object pool exports for VoxEx.
 * Provides typed array and Vector3 pools to reduce GC pressure.
 * @module optimization/pools
 */

export { Uint8ArrayPool, default as Uint8ArrayPoolDefault } from './Uint8ArrayPool.js';
export { Float32ArrayPool, default as Float32ArrayPoolDefault } from './Float32ArrayPool.js';
export { Uint32ArrayPool, default as Uint32ArrayPoolDefault } from './Uint32ArrayPool.js';
export { Vector3Pool, default as Vector3PoolDefault } from './Vector3Pool.js';

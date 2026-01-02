/**
 * VoxEx - Modular Voxel Engine
 * Main entry point for Phase 1 & 2 - Core and Optimization modules
 * @module main
 */

// Core imports (Phase 1)
import * as Core from './core/index.js';
import * as Config from './config/index.js';
import * as MathUtils from './math/index.js';

// Optimization imports (Phase 2)
import * as Optimization from './optimization/index.js';
import * as Persistence from './persistence/index.js';
import * as Audio from './audio/index.js';

// Three.js imports
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// =====================================================
// Module Verification
// =====================================================

console.log('%c VoxEx Modular Architecture ', 'background: #ff6b35; color: white; font-size: 16px; padding: 4px 8px;');
console.log('Phase 1: Core Configuration Modules');
console.log('Phase 2: Optimization & Persistence Modules');
console.log('');

// Core Constants
console.log('%c Core Module ', 'background: #4caf50; color: white;');
console.log('Block types:', Object.keys(Core.BLOCK_IDS).length);
console.log('GRASS =', Core.GRASS);
console.log('WATER =', Core.WATER);
console.log('TORCH =', Core.TORCH);
console.log('');

// Config Modules
console.log('%c Config Modules ', 'background: #2196f3; color: white;');
console.log('BLOCK_CONFIG entries:', Config.BLOCK_CONFIG.length);
console.log('NUM_TILES in atlas:', Config.NUM_TILES);
console.log('Biome count:', Config.getBiomeCount());
console.log('Biome names:', Config.getBiomeNames().join(', '));
console.log('Chunk dimensions:', Config.WORLD_DIMS.chunkSize, '×', Config.WORLD_DIMS.chunkSize, '×', Config.WORLD_DIMS.chunkHeight);
console.log('Sea level:', Config.WORLD_DIMS.seaLevel);
console.log('Settings profiles:', Config.getProfileNames().join(', '));
console.log('Default render distance:', Config.DEFAULTS.renderDistance);
console.log('');

// Math Modules
console.log('%c Math Modules ', 'background: #9c27b0; color: white;');
const testNoise = MathUtils.noise2D(0.5, 0.5);
console.log('noise2D(0.5, 0.5) =', testNoise.toFixed(4));
const testRng = new MathUtils.SeededRandom(12345);
console.log('SeededRandom(12345).next() =', testRng.next().toFixed(4));
console.log('SeededRandom(12345).nextInt(100) =', testRng.nextInt(100));
const testSpring = MathUtils.springDamper(0, 0, 1, 0.1, 0.016);
console.log('springDamper(0, 0, 1, 0.1, 0.016) = { value:', testSpring.value.toFixed(4), ', velocity:', testSpring.velocity.toFixed(4), '}');
console.log('');

// Optimization Modules (Phase 2)
console.log('%c Optimization Module (Phase 2) ', 'background: #ff9800; color: white;');

// Test pools
const testUint8Pool = new Optimization.Uint8ArrayPool();
const testArr = testUint8Pool.acquire(1024);
testUint8Pool.release(testArr);
console.log('Uint8ArrayPool:', typeof Optimization.Uint8ArrayPool === 'function' ? '✓' : '✗');
console.log('Float32ArrayPool:', typeof Optimization.Float32ArrayPool === 'function' ? '✓' : '✗');
console.log('Uint32ArrayPool:', typeof Optimization.Uint32ArrayPool === 'function' ? '✓' : '✗');
console.log('Vector3Pool:', typeof Optimization.Vector3Pool === 'function' ? '✓' : '✗');

// Test caches
console.log('ChunkNeighborCache:', typeof Optimization.ChunkNeighborCache === 'function' ? '✓' : '✗');
console.log('getCachedFaceVertices:', typeof Optimization.getCachedFaceVertices === 'function' ? '✓' : '✗');

// Test block lookups
const lookups = Optimization.buildBlockLookups();
console.log('buildBlockLookups:', typeof Optimization.buildBlockLookups === 'function' ? '✓' : '✗');
console.log('BLOCK_IS_SOLID[GRASS]:', lookups.BLOCK_IS_SOLID[Core.GRASS]);
console.log('IS_TRANSPARENT[WATER]:', lookups.IS_TRANSPARENT[Core.WATER]);
console.log('');

// Persistence Module (Phase 2)
console.log('%c Persistence Module (Phase 2) ', 'background: #e91e63; color: white;');
console.log('ChunkCompressor:', typeof Persistence.ChunkCompressor === 'object' ? '✓' : '✗');
console.log('ChunkCompressor.compress:', typeof Persistence.ChunkCompressor.compress === 'function' ? '✓' : '✗');
console.log('ChunkCompressor.decompress:', typeof Persistence.ChunkCompressor.decompress === 'function' ? '✓' : '✗');

// Test compression
const testChunkData = {
    blocks: new Uint8Array(16 * 16 * 320).fill(1),
    skyLight: new Uint8Array(16 * 16 * 320).fill(15),
    blockLight: new Uint8Array(16 * 16 * 320).fill(0)
};
const compressed = Persistence.ChunkCompressor.compress(testChunkData);
const decompressed = Persistence.ChunkCompressor.decompress(compressed);
console.log('Compression test:', decompressed.blocks[0] === 1 ? '✓ passed' : '✗ failed');
console.log('');

// Audio Module (Phase 2)
console.log('%c Audio Module (Phase 2) ', 'background: #00bcd4; color: white;');
console.log('initAudio:', typeof Audio.initAudio === 'function' ? '✓' : '✗');
console.log('playFormula:', typeof Audio.playFormula === 'function' ? '✓' : '✗');
console.log('playTone:', typeof Audio.playTone === 'function' ? '✓' : '✗');
console.log('formulas registry:', typeof Audio.formulas === 'object' ? '✓' : '✗');
console.log('');

// Three.js
console.log('%c Three.js ', 'background: #ff5722; color: white;');
console.log('Three.js revision:', THREE.REVISION);
console.log('PointerLockControls:', typeof PointerLockControls === 'function' ? 'loaded' : 'missing');
console.log('');

// =====================================================
// Verification Tests
// =====================================================

console.log('%c Verification Tests ', 'background: #795548; color: white;');

const tests = [
    // Phase 1 tests
    {
        name: 'GRASS block ID',
        expected: 1,
        actual: Core.GRASS,
    },
    {
        name: 'BLOCK_CONFIG length',
        expected: 16,
        actual: Config.BLOCK_CONFIG.length,
    },
    {
        name: 'Biome count',
        expected: 6,
        actual: Config.getBiomeCount(),
    },
    {
        name: 'CHUNK_HEIGHT',
        expected: 320,
        actual: Config.WORLD_DIMS.chunkHeight,
    },
    {
        name: 'NUM_TILES',
        expected: 17,
        actual: Config.NUM_TILES,
    },
    {
        name: 'noise2D returns number',
        expected: true,
        actual: typeof testNoise === 'number' && !isNaN(testNoise),
    },
    {
        name: 'SeededRandom returns 0-1',
        expected: true,
        actual: testRng.next() >= 0 && testRng.next() < 1,
    },
    // Phase 2 tests
    {
        name: 'Uint8ArrayPool instantiable',
        expected: true,
        actual: testUint8Pool instanceof Optimization.Uint8ArrayPool,
    },
    {
        name: 'Uint8ArrayPool stats available',
        expected: true,
        actual: typeof testUint8Pool.stats === 'function',
    },
    {
        name: 'ChunkNeighborCache instantiable',
        expected: true,
        actual: new Optimization.ChunkNeighborCache() instanceof Optimization.ChunkNeighborCache,
    },
    {
        name: 'Block lookup GRASS is solid',
        expected: 1,
        actual: lookups.BLOCK_IS_SOLID[Core.GRASS],
    },
    {
        name: 'Block lookup WATER is transparent',
        expected: 1,
        actual: lookups.IS_TRANSPARENT[Core.WATER],
    },
    {
        name: 'Block lookup AIR is not solid',
        expected: 0,
        actual: lookups.BLOCK_IS_SOLID[Core.AIR],
    },
    {
        name: 'ChunkCompressor round-trip',
        expected: true,
        actual: decompressed.blocks[0] === 1 && decompressed.skyLight[0] === 15,
    },
    {
        name: 'Face vertex cache function',
        expected: 18,
        actual: Optimization.getCachedFaceVertices(0, 1, 0).length,
    },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    const success = test.expected === test.actual;
    if (success) {
        passed++;
        console.log(`✅ ${test.name}: ${test.actual}`);
    } else {
        failed++;
        console.log(`❌ ${test.name}: expected ${test.expected}, got ${test.actual}`);
    }
}

console.log('');
console.log(`Results: ${passed}/${tests.length} tests passed`);

// =====================================================
// Display Status in DOM
// =====================================================

const container = document.getElementById('game-container');
if (container) {
    const statusColor = failed === 0 ? '#4caf50' : '#f44336';
    const statusText = failed === 0 ? 'All modules loaded successfully!' : `${failed} verification test(s) failed`;

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; font-family: 'Segoe UI', system-ui, sans-serif;">
            <h1 style="color: #ff6b35; font-size: 48px; margin-bottom: 8px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">VoxEx Modular</h1>
            <p style="color: ${statusColor}; font-size: 18px; margin-bottom: 24px;">${statusText}</p>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; max-width: 800px; width: 100%; padding: 0 20px;">
                <div style="background: rgba(76, 175, 80, 0.2); border: 1px solid #4caf50; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #4caf50;">${Object.keys(Core.BLOCK_IDS).length}</div>
                    <div style="font-size: 12px; color: #888;">Block Types</div>
                </div>
                <div style="background: rgba(33, 150, 243, 0.2); border: 1px solid #2196f3; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #2196f3;">${Config.getBiomeCount()}</div>
                    <div style="font-size: 12px; color: #888;">Biomes</div>
                </div>
                <div style="background: rgba(156, 39, 176, 0.2); border: 1px solid #9c27b0; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #9c27b0;">${Config.NUM_TILES}</div>
                    <div style="font-size: 12px; color: #888;">Texture Tiles</div>
                </div>
                <div style="background: rgba(255, 152, 0, 0.2); border: 1px solid #ff9800; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #ff9800;">4</div>
                    <div style="font-size: 12px; color: #888;">Pool Types</div>
                </div>
            </div>

            <div style="margin-top: 24px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; max-width: 400px; width: 100%; padding: 0 20px;">
                <div style="background: rgba(233, 30, 99, 0.2); border: 1px solid #e91e63; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #e91e63;">Persistence</div>
                    <div style="font-size: 11px; color: #888;">RLE Compression</div>
                </div>
                <div style="background: rgba(0, 188, 212, 0.2); border: 1px solid #00bcd4; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #00bcd4;">Audio</div>
                    <div style="font-size: 11px; color: #888;">Formula Player</div>
                </div>
            </div>

            <div style="margin-top: 32px; padding: 16px 24px; background: rgba(0,0,0,0.3); border-radius: 8px;">
                <div style="color: #888; font-size: 14px; margin-bottom: 8px;">Chunk Dimensions</div>
                <div style="color: #fff; font-size: 20px; font-family: monospace;">${Config.WORLD_DIMS.chunkSize} × ${Config.WORLD_DIMS.chunkSize} × ${Config.WORLD_DIMS.chunkHeight}</div>
            </div>

            <div style="margin-top: 32px; color: #666; font-size: 12px;">
                Three.js r${THREE.REVISION} • Phase 1 & 2 Complete
            </div>

            <div style="margin-top: 24px; color: #444; font-size: 11px; max-width: 400px; text-align: center;">
                Next phases: Extract render, world, entity, and UI systems to complete the modular architecture
            </div>
        </div>
    `;
}

// Export for potential use in browser console
window.VoxEx = {
    Core,
    Config,
    MathUtils,
    Optimization,
    Persistence,
    Audio,
    THREE,
};

console.log('');
console.log('%c Window.VoxEx available for console debugging ', 'background: #607d8b; color: white;');

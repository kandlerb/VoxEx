/**
 * VoxEx - Modular Voxel Engine
 * Main entry point for Phase 1 - Core modules
 * @module main
 */

// Core imports
import * as Core from './core/index.js';
import * as Config from './config/index.js';
import * as MathUtils from './math/index.js';

// Three.js imports
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// =====================================================
// Module Verification
// =====================================================

console.log('%c VoxEx Modular Architecture ', 'background: #ff6b35; color: white; font-size: 16px; padding: 4px 8px;');
console.log('Phase 1: Core Configuration Modules');
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

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 600px; width: 100%; padding: 0 20px;">
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
            </div>

            <div style="margin-top: 32px; padding: 16px 24px; background: rgba(0,0,0,0.3); border-radius: 8px;">
                <div style="color: #888; font-size: 14px; margin-bottom: 8px;">Chunk Dimensions</div>
                <div style="color: #fff; font-size: 20px; font-family: monospace;">${Config.WORLD_DIMS.chunkSize} × ${Config.WORLD_DIMS.chunkSize} × ${Config.WORLD_DIMS.chunkHeight}</div>
            </div>

            <div style="margin-top: 32px; color: #666; font-size: 12px;">
                Three.js r${THREE.REVISION} • Phase 1 Complete
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
    THREE,
};

console.log('');
console.log('%c Window.VoxEx available for console debugging ', 'background: #607d8b; color: white;');

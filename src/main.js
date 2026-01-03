/**
 * VoxEx - Modular Voxel Engine
 * Main entry point for Phases 1-7 - Core, Optimization, Input, Physics, World/Lighting, Entities & Render
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

// Input & Physics imports (Phase 3)
import * as Input from './input/index.js';
import * as Physics from './physics/index.js';

// World imports (Phase 4)
import * as World from './world/index.js';

// Entity imports (Phase 6)
import * as Entities from './entities/index.js';

// Render imports (Phase 7)
import * as Render from './render/index.js';

// UI imports (Phase 8)
import * as UI from './ui/index.js';

// Three.js imports
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// =====================================================
// Module Verification
// =====================================================

console.log('%c VoxEx Modular Architecture ', 'background: #ff6b35; color: white; font-size: 16px; padding: 4px 8px;');
console.log('Phase 1: Core Configuration Modules');
console.log('Phase 2: Optimization & Persistence Modules');
console.log('Phase 3: Input & Physics Modules');
console.log('Phase 4: World & Lighting Modules');
console.log('Phase 5: Terrain Generation Modules');
console.log('Phase 6: Entity System Modules');
console.log('Phase 7: Render System Modules');
console.log('Phase 8: UI System Modules');
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

// Input Module (Phase 3)
console.log('%c Input Module (Phase 3) ', 'background: #9b59b6; color: white;');
console.log('InputManager:', typeof Input.InputManager === 'function' ? '✓' : '✗');
console.log('DEFAULT_BINDINGS:', typeof Input.DEFAULT_BINDINGS === 'object' ? '✓' : '✗');
console.log('Forward binding:', Input.DEFAULT_BINDINGS.forward);
console.log('getKeyDisplayName:', typeof Input.getKeyDisplayName === 'function' ? '✓' : '✗');
console.log('getKeyDisplayName("KeyW"):', Input.getKeyDisplayName('KeyW'));
console.log('getKeyDisplayName("Space"):', Input.getKeyDisplayName('Space'));
console.log('getKeyDisplayName("Backquote"):', Input.getKeyDisplayName('Backquote'));
console.log('validateBinding:', typeof Input.validateBinding === 'function' ? '✓' : '✗');
console.log('');

// Physics Module (Phase 3)
console.log('%c Physics Module (Phase 3) ', 'background: #e67e22; color: white;');
console.log('createAABB:', typeof Physics.createAABB === 'function' ? '✓' : '✗');
console.log('createBlockAABB:', typeof Physics.createBlockAABB === 'function' ? '✓' : '✗');
console.log('intersectsAABB:', typeof Physics.intersectsAABB === 'function' ? '✓' : '✗');
console.log('raycastVoxels:', typeof Physics.raycastVoxels === 'function' ? '✓' : '✗');
console.log('pickVoxel:', typeof Physics.pickVoxel === 'function' ? '✓' : '✗');
console.log('playerIntersectsBlock:', typeof Physics.playerIntersectsBlock === 'function' ? '✓' : '✗');
console.log('entityIntersectsBlock:', typeof Physics.entityIntersectsBlock === 'function' ? '✓' : '✗');

// Test AABB intersection
const boxA = Physics.createAABB(0, 0, 0, 1, 1, 1);
const boxB = Physics.createAABB(0.5, 0.5, 0.5, 1, 1, 1);
const boxC = Physics.createAABB(5, 5, 5, 1, 1, 1);
console.log('AABB A intersects B:', Physics.intersectsAABB(boxA, boxB)); // true
console.log('AABB A intersects C:', Physics.intersectsAABB(boxA, boxC)); // false

// Test raycast (mock solid block check)
const mockIsSolid = (x, y, z) => (x === 5 && y === 0 && z === 0);
const hit = Physics.raycastVoxels(0, 0.5, 0, 1, 0, 0, 10, mockIsSolid);
console.log('Raycast hit:', hit.hit, 'at x:', hit.x);
console.log('');

// World/Lighting Module (Phase 4)
console.log('%c World/Lighting Module (Phase 4) ', 'background: #3498db; color: white;');

// Lighting constants
console.log('MAX_LIGHT:', World.MAX_LIGHT);
console.log('MIN_LIGHT:', World.MIN_LIGHT);
console.log('TORCH_LIGHT_DEFAULT:', World.TORCH_LIGHT_DEFAULT);
console.log('NEIGHBOR_OFFSETS:', World.NEIGHBOR_OFFSETS.length, 'directions');

// Core lighting functions
console.log('calculateChunkSunlight:', typeof World.calculateChunkSunlight === 'function' ? '✓' : '✗');
console.log('calculateBlockLight:', typeof World.calculateBlockLight === 'function' ? '✓' : '✗');
console.log('LightingEngine:', typeof World.LightingEngine === 'function' ? '✓' : '✗');
console.log('SunlightTask:', typeof World.SunlightTask === 'function' ? '✓' : '✗');

// Cross-chunk lighting
console.log('propagateLightFromNeighbors:', typeof World.propagateLightFromNeighbors === 'function' ? '✓' : '✗');
console.log('propagateLightFromEdgesInward:', typeof World.propagateLightFromEdgesInward === 'function' ? '✓' : '✗');

// Light propagation utilities
console.log('posToIndex:', typeof World.posToIndex === 'function' ? '✓' : '✗');
console.log('indexToPos:', typeof World.indexToPos === 'function' ? '✓' : '✗');
console.log('getCombinedLight:', typeof World.getCombinedLight === 'function' ? '✓' : '✗');

// Test LightingEngine instantiation
const lightEngine = new World.LightingEngine();
console.log('LightingEngine instantiated:', lightEngine !== null ? '✓' : '✗');
console.log('LightingEngine.getTorchLightLevel():', lightEngine.getTorchLightLevel());

// Test lighting calculation on empty chunk
const testLightChunk = {
    blocks: new Uint8Array(16 * 16 * 320),
    skyLight: null,
    blockLight: null
};
testLightChunk.blocks.fill(Core.AIR);
lightEngine.calculateChunkLighting(testLightChunk, 16, 320);

// Verify top of chunk has full sunlight
const topIndex = World.posToIndex(0, 319, 0);
const topLight = testLightChunk.skyLight[topIndex];
console.log('Empty chunk top skylight:', topLight, '(expected: 15)');
console.log('');

// Terrain Generation Module (Phase 5)
console.log('%c Terrain Generation Module (Phase 5) ', 'background: #27ae60; color: white;');

// Chunk utilities
console.log('createChunkData:', typeof World.createChunkData === 'function' ? '✓' : '✗');
console.log('getChunkKey:', typeof World.getChunkKey === 'function' ? '✓' : '✗');
console.log('parseChunkKey:', typeof World.parseChunkKey === 'function' ? '✓' : '✗');
console.log('globalToChunk:', typeof World.globalToChunk === 'function' ? '✓' : '✗');
console.log('globalToLocal:', typeof World.globalToLocal === 'function' ? '✓' : '✗');
console.log('GEN_PASS flags:', typeof World.GEN_PASS === 'object' ? '✓' : '✗');

// TerrainGenerator
console.log('TerrainGenerator:', typeof World.TerrainGenerator === 'function' ? '✓' : '✗');
console.log('ChunkGenerator:', typeof World.ChunkGenerator === 'function' ? '✓' : '✗');

// Cave generation
console.log('precalculateCaveNoise:', typeof World.precalculateCaveNoise === 'function' ? '✓' : '✗');
console.log('isCaveAt:', typeof World.isCaveAt === 'function' ? '✓' : '✗');

// Surface decoration
console.log('ELEVATION thresholds:', typeof World.ELEVATION === 'object' ? '✓' : '✗');
console.log('analyzeSlopeAt:', typeof World.analyzeSlopeAt === 'function' ? '✓' : '✗');

// Tree generation
console.log('generateTreesForChunk:', typeof World.generateTreesForChunk === 'function' ? '✓' : '✗');
console.log('forEachCanopyVoxel:', typeof World.forEachCanopyVoxel === 'function' ? '✓' : '✗');

// Test chunk generation
console.log('Testing chunk generation...');
const terrainGen = new World.TerrainGenerator({ seed: 12345 });
const testHeight = terrainGen.getHeightAt(100, 100);
console.log('Terrain height at (100,100):', testHeight);
const testBiome = terrainGen.getBiomeAt(100, 100);
console.log('Biome at (100,100):', testBiome?.name || 'unknown');

// Test chunk data structure
const testGenChunk = World.createChunkData();
console.log('Chunk blocks length:', testGenChunk.blocks.length, '(expected:', 16 * 16 * 320, ')');
console.log('Chunk has skyLight:', testGenChunk.skyLight instanceof Uint8Array);
console.log('');

// Entities Module (Phase 6)
console.log('%c Entities Module (Phase 6) ', 'background: #9b59b6; color: white;');
console.log('Entity:', typeof Entities.Entity === 'function' ? '✓' : '✗');
console.log('EntityManager:', typeof Entities.EntityManager === 'function' ? '✓' : '✗');
console.log('PlayerController:', typeof Entities.PlayerController === 'function' ? '✓' : '✗');
console.log('PlayerAnimation:', typeof Entities.PlayerAnimation === 'function' ? '✓' : '✗');
console.log('Zombie:', typeof Entities.Zombie === 'function' ? '✓' : '✗');
console.log('ZombieAI:', typeof Entities.ZombieAI === 'function' ? '✓' : '✗');

// Test entity creation
const testPlayer = new Entities.PlayerController(0, 64, 0);
console.log('PlayerController created at y:', testPlayer.y);
console.log('Player walk speed:', testPlayer.walkSpeed);

const testZombie = new Entities.Zombie(10, 64, 10);
console.log('Zombie created with health:', testZombie.health);
console.log('Zombie AI state:', testZombie.ai.state);

const testEntityMgr = new Entities.EntityManager();
console.log('EntityManager max zombies:', testEntityMgr.maxZombies);
console.log('');

// Render Module (Phase 7)
console.log('%c Render Module (Phase 7) ', 'background: #e74c3c; color: white;');
console.log('RenderEngine:', typeof Render.RenderEngine === 'function' ? '✓' : '✗');
console.log('createTextureAtlas:', typeof Render.createTextureAtlas === 'function' ? '✓' : '✗');
console.log('createTerrainMaterial:', typeof Render.createTerrainMaterial === 'function' ? '✓' : '✗');
console.log('createWaterMaterial:', typeof Render.createWaterMaterial === 'function' ? '✓' : '✗');
console.log('buildChunkMesh:', typeof Render.buildChunkMesh === 'function' ? '✓' : '✗');
console.log('DayNightCycle:', typeof Render.DayNightCycle === 'function' ? '✓' : '✗');
console.log('PostProcessingManager:', typeof Render.PostProcessingManager === 'function' ? '✓' : '✗');
console.log('createTorchViewmodel:', typeof Render.createTorchViewmodel === 'function' ? '✓' : '✗');
console.log('createWorldTorch:', typeof Render.createWorldTorch === 'function' ? '✓' : '✗');
console.log('shouldRenderFace:', typeof Render.shouldRenderFace === 'function' ? '✓' : '✗');

// Test texture atlas
const testAtlas = Render.createTextureAtlas(16);
console.log('Texture atlas created:', testAtlas.texture instanceof THREE.Texture ? '✓' : '✗');
console.log('Atlas canvas width:', testAtlas.canvas.width, '(expected:', 17 * 64, ')');

// Test day/night cycle
const testDayNight = new Render.DayNightCycle();
testDayNight.setPreset('noon');
console.log('DayNightCycle time at noon:', testDayNight.time);
console.log('Is night at noon:', testDayNight.isNight());
testDayNight.setPreset('midnight');
console.log('Is night at midnight:', testDayNight.isNight());

// Test torch model
const testTorch = Render.createTorchViewmodel();
console.log('Torch viewmodel children:', testTorch.children.length, '(expected: 4 - stick, flame, glow, light)');
console.log('');

// UI Module (Phase 8)
console.log('%c UI Module (Phase 8 - Final!) ', 'background: #9b59b6; color: white;');
console.log('UIManager:', typeof UI.UIManager === 'function' ? '✓' : '✗');
console.log('createCrosshair:', typeof UI.createCrosshair === 'function' ? '✓' : '✗');
console.log('createHotbar:', typeof UI.createHotbar === 'function' ? '✓' : '✗');
console.log('createDebugOverlay:', typeof UI.createDebugOverlay === 'function' ? '✓' : '✗');
console.log('createMainMenu:', typeof UI.createMainMenu === 'function' ? '✓' : '✗');
console.log('createPauseMenu:', typeof UI.createPauseMenu === 'function' ? '✓' : '✗');
console.log('createSettingsMenu:', typeof UI.createSettingsMenu === 'function' ? '✓' : '✗');
console.log('createInventoryScreen:', typeof UI.createInventoryScreen === 'function' ? '✓' : '✗');
console.log('createLoadingOverlay:', typeof UI.createLoadingOverlay === 'function' ? '✓' : '✗');

// Test UI element creation
const testCrosshair = UI.createCrosshair();
console.log('Crosshair created:', testCrosshair instanceof HTMLElement);

const testHotbar = UI.createHotbar(9);
console.log('Hotbar slots:', testHotbar.children.length);

const testStatusIndicators = UI.createStatusIndicators();
console.log('StatusIndicators has sprint:', testStatusIndicators.querySelector('#indicator-sprint') !== null);
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
    // Phase 3 tests - Input
    {
        name: 'InputManager class exists',
        expected: true,
        actual: typeof Input.InputManager === 'function',
    },
    {
        name: 'DEFAULT_BINDINGS has forward key',
        expected: 'KeyW',
        actual: Input.DEFAULT_BINDINGS.forward,
    },
    {
        name: 'DEFAULT_BINDINGS has jump key',
        expected: 'Space',
        actual: Input.DEFAULT_BINDINGS.jump,
    },
    {
        name: 'getKeyDisplayName converts KeyW',
        expected: 'W',
        actual: Input.getKeyDisplayName('KeyW'),
    },
    {
        name: 'getKeyDisplayName converts Backquote',
        expected: '~',
        actual: Input.getKeyDisplayName('Backquote'),
    },
    {
        name: 'validateBinding detects no conflict',
        expected: true,
        actual: Input.validateBinding(Input.DEFAULT_BINDINGS, 'forward', 'KeyQ').valid,
    },
    // Phase 3 tests - Physics AABB
    {
        name: 'createAABB returns valid box',
        expected: true,
        actual: (() => {
            const box = Physics.createAABB(0, 0, 0, 1, 1, 1);
            return box.minX === -1 && box.maxX === 1 && box.minY === -1 && box.maxY === 1;
        })(),
    },
    {
        name: 'createBlockAABB returns unit cube',
        expected: true,
        actual: (() => {
            const box = Physics.createBlockAABB(5, 10, 15);
            return box.minX === 5 && box.maxX === 6 && box.minY === 10 && box.maxY === 11;
        })(),
    },
    {
        name: 'AABB intersection works (overlapping)',
        expected: true,
        actual: Physics.intersectsAABB(boxA, boxB),
    },
    {
        name: 'AABB intersection works (non-overlapping)',
        expected: false,
        actual: Physics.intersectsAABB(boxA, boxC),
    },
    {
        name: 'containsPoint works',
        expected: true,
        actual: Physics.containsPoint(boxA, 0, 0, 0),
    },
    // Phase 3 tests - Physics Collision
    {
        name: 'playerIntersectsBlock detects collision',
        expected: true,
        actual: Physics.playerIntersectsBlock(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0, 0, 0),
    },
    {
        name: 'playerIntersectsBlock detects no collision',
        expected: false,
        actual: Physics.playerIntersectsBlock(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 10, 10, 10),
    },
    {
        name: 'getOverlappingBlocks returns array',
        expected: true,
        actual: Array.isArray(Physics.getOverlappingBlocks(0.5, 0.5, 0.5, 1, 2)),
    },
    // Phase 3 tests - Physics Raycast
    {
        name: 'Raycast finds solid block',
        expected: true,
        actual: hit.hit && hit.x === 5,
    },
    {
        name: 'Raycast misses when no solid blocks',
        expected: false,
        actual: Physics.raycastVoxels(0, 0, 0, 1, 0, 0, 10, () => false).hit,
    },
    {
        name: 'pickVoxel returns correct format',
        expected: true,
        actual: (() => {
            const result = Physics.pickVoxel({ x: 0, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 }, 10, mockIsSolid);
            return result !== null && Array.isArray(result.face) && result.face.length === 3;
        })(),
    },
    {
        name: 'getPlacementPosition returns adjacent block',
        expected: true,
        actual: (() => {
            const pos = Physics.getPlacementPosition(hit);
            return pos !== null && pos.x === hit.x + hit.nx;
        })(),
    },
    // Phase 4 tests - World/Lighting
    {
        name: 'MAX_LIGHT is 15',
        expected: 15,
        actual: World.MAX_LIGHT,
    },
    {
        name: 'MIN_LIGHT is 1',
        expected: 1,
        actual: World.MIN_LIGHT,
    },
    {
        name: 'LightingEngine class exists',
        expected: true,
        actual: typeof World.LightingEngine === 'function',
    },
    {
        name: 'calculateChunkSunlight exists',
        expected: true,
        actual: typeof World.calculateChunkSunlight === 'function',
    },
    {
        name: 'calculateBlockLight exists',
        expected: true,
        actual: typeof World.calculateBlockLight === 'function',
    },
    {
        name: 'SunlightTask class exists',
        expected: true,
        actual: typeof World.SunlightTask === 'function',
    },
    {
        name: 'Empty chunk has full skylight at top',
        expected: 15,
        actual: topLight,
    },
    {
        name: 'posToIndex and indexToPos round-trip',
        expected: true,
        actual: (() => {
            const index = World.posToIndex(5, 100, 7);
            const pos = World.indexToPos(index);
            return pos.x === 5 && pos.y === 100 && pos.z === 7;
        })(),
    },
    {
        name: 'getCombinedLight returns max of inputs',
        expected: 12,
        actual: World.getCombinedLight(10, 12),
    },
    {
        name: 'NEIGHBOR_OFFSETS has 6 directions',
        expected: 6,
        actual: World.NEIGHBOR_OFFSETS.length,
    },
    {
        name: 'LightingEngine torch level is valid',
        expected: true,
        actual: lightEngine.getTorchLightLevel() >= 0 && lightEngine.getTorchLightLevel() <= 15,
    },
    // Phase 5 tests - Terrain Generation
    {
        name: 'TerrainGenerator class exists',
        expected: true,
        actual: typeof World.TerrainGenerator === 'function',
    },
    {
        name: 'ChunkGenerator class exists',
        expected: true,
        actual: typeof World.ChunkGenerator === 'function',
    },
    {
        name: 'createChunkData returns valid structure',
        expected: true,
        actual: (() => {
            const chunk = World.createChunkData();
            return chunk.blocks instanceof Uint8Array && chunk.blocks.length === 16 * 16 * 320;
        })(),
    },
    {
        name: 'getChunkKey formats correctly',
        expected: '5,-3',
        actual: World.getChunkKey(5, -3),
    },
    {
        name: 'parseChunkKey parses correctly',
        expected: true,
        actual: (() => {
            const { cx, cz } = World.parseChunkKey('5,-3');
            return cx === 5 && cz === -3;
        })(),
    },
    {
        name: 'globalToChunk converts correctly',
        expected: true,
        actual: (() => {
            const { cx, cz } = World.globalToChunk(35, -20);
            return cx === 2 && cz === -2;
        })(),
    },
    {
        name: 'GEN_PASS.ALL equals 31',
        expected: 31,
        actual: World.GEN_PASS.ALL,
    },
    {
        name: 'TerrainGenerator produces valid height',
        expected: true,
        actual: testHeight >= 0 && testHeight < 320,
    },
    {
        name: 'TerrainGenerator returns biome with name',
        expected: true,
        actual: testBiome !== null && typeof testBiome.name === 'string',
    },
    {
        name: 'ELEVATION thresholds defined',
        expected: true,
        actual: World.ELEVATION && World.ELEVATION.SNOW_LINE === 190,
    },
    {
        name: 'precalculateCaveNoise exists',
        expected: true,
        actual: typeof World.precalculateCaveNoise === 'function',
    },
    {
        name: 'generateTreesForChunk exists',
        expected: true,
        actual: typeof World.generateTreesForChunk === 'function',
    },
    {
        name: 'forEachCanopyVoxel exists',
        expected: true,
        actual: typeof World.forEachCanopyVoxel === 'function',
    },
    // Phase 6 tests - Entity System
    {
        name: 'Entity class exists',
        expected: true,
        actual: typeof Entities.Entity === 'function',
    },
    {
        name: 'EntityManager class exists',
        expected: true,
        actual: typeof Entities.EntityManager === 'function',
    },
    {
        name: 'PlayerController class exists',
        expected: true,
        actual: typeof Entities.PlayerController === 'function',
    },
    {
        name: 'PlayerAnimation class exists',
        expected: true,
        actual: typeof Entities.PlayerAnimation === 'function',
    },
    {
        name: 'Zombie class exists',
        expected: true,
        actual: typeof Entities.Zombie === 'function',
    },
    {
        name: 'ZombieAI class exists',
        expected: true,
        actual: typeof Entities.ZombieAI === 'function',
    },
    {
        name: 'PlayerController has correct defaults',
        expected: true,
        actual: (() => {
            const p = new Entities.PlayerController();
            return p.walkSpeed > 0 && p.height > 0 && p.eyeHeight > 0;
        })(),
    },
    {
        name: 'Zombie has AI controller',
        expected: true,
        actual: (() => {
            const z = new Entities.Zombie(0, 64, 0);
            return z.ai instanceof Entities.ZombieAI;
        })(),
    },
    {
        name: 'EntityManager can spawn zombie',
        expected: true,
        actual: (() => {
            const em = new Entities.EntityManager();
            const result = em.spawnZombie(0, 64, 0);
            return result.success && em.getZombieCount() === 1;
        })(),
    },
    {
        name: 'EntityManager pools despawned zombies',
        expected: true,
        actual: (() => {
            const em = new Entities.EntityManager();
            const result = em.spawnZombie(0, 64, 0);
            em.despawnZombie(result.entity);
            return em.getZombieCount() === 0 && em.getPoolSize() === 1;
        })(),
    },
    // Phase 7 tests - Render System
    {
        name: 'RenderEngine class exists',
        expected: true,
        actual: typeof Render.RenderEngine === 'function',
    },
    {
        name: 'createTextureAtlas function exists',
        expected: true,
        actual: typeof Render.createTextureAtlas === 'function',
    },
    {
        name: 'createTerrainMaterial function exists',
        expected: true,
        actual: typeof Render.createTerrainMaterial === 'function',
    },
    {
        name: 'createWaterMaterial function exists',
        expected: true,
        actual: typeof Render.createWaterMaterial === 'function',
    },
    {
        name: 'buildChunkMesh function exists',
        expected: true,
        actual: typeof Render.buildChunkMesh === 'function',
    },
    {
        name: 'shouldRenderFace function exists',
        expected: true,
        actual: typeof Render.shouldRenderFace === 'function',
    },
    {
        name: 'DayNightCycle class exists',
        expected: true,
        actual: typeof Render.DayNightCycle === 'function',
    },
    {
        name: 'DayNightCycle noon is not night',
        expected: false,
        actual: (() => {
            const dn = new Render.DayNightCycle();
            dn.setPreset('noon');
            return dn.isNight();
        })(),
    },
    {
        name: 'DayNightCycle midnight is night',
        expected: true,
        actual: (() => {
            const dn = new Render.DayNightCycle();
            dn.setPreset('midnight');
            return dn.isNight();
        })(),
    },
    {
        name: 'DayNightCycle time at noon is 0.5',
        expected: 0.5,
        actual: (() => {
            const dn = new Render.DayNightCycle();
            dn.setPreset('noon');
            return dn.time;
        })(),
    },
    {
        name: 'PostProcessingManager class exists',
        expected: true,
        actual: typeof Render.PostProcessingManager === 'function',
    },
    {
        name: 'createTorchViewmodel function exists',
        expected: true,
        actual: typeof Render.createTorchViewmodel === 'function',
    },
    {
        name: 'createWorldTorch function exists',
        expected: true,
        actual: typeof Render.createWorldTorch === 'function',
    },
    {
        name: 'Torch viewmodel has expected children',
        expected: 4,
        actual: testTorch.children.length,
    },
    {
        name: 'Texture atlas creates valid THREE.Texture',
        expected: true,
        actual: testAtlas.texture instanceof THREE.Texture,
    },
    {
        name: 'Texture atlas has correct width',
        expected: 17 * 64,
        actual: testAtlas.canvas.width,
    },
    {
        name: 'FACE_DIRECTIONS has 6 entries',
        expected: 6,
        actual: Render.FACE_DIRECTIONS?.length ?? 0,
    },
    {
        name: 'VignetteShader exists',
        expected: true,
        actual: typeof Render.VignetteShader === 'object',
    },
    {
        name: 'DesaturationShader exists',
        expected: true,
        actual: typeof Render.DesaturationShader === 'object',
    },
    // Phase 8 tests - UI System
    {
        name: 'UIManager class exists',
        expected: true,
        actual: typeof UI.UIManager === 'function',
    },
    {
        name: 'createCrosshair exists',
        expected: true,
        actual: typeof UI.createCrosshair === 'function',
    },
    {
        name: 'createHotbar exists',
        expected: true,
        actual: typeof UI.createHotbar === 'function',
    },
    {
        name: 'createDebugOverlay exists',
        expected: true,
        actual: typeof UI.createDebugOverlay === 'function',
    },
    {
        name: 'createStatusIndicators exists',
        expected: true,
        actual: typeof UI.createStatusIndicators === 'function',
    },
    {
        name: 'createMainMenu exists',
        expected: true,
        actual: typeof UI.createMainMenu === 'function',
    },
    {
        name: 'createPauseMenu exists',
        expected: true,
        actual: typeof UI.createPauseMenu === 'function',
    },
    {
        name: 'createSettingsMenu exists',
        expected: true,
        actual: typeof UI.createSettingsMenu === 'function',
    },
    {
        name: 'createInventoryScreen exists',
        expected: true,
        actual: typeof UI.createInventoryScreen === 'function',
    },
    {
        name: 'createLoadingOverlay exists',
        expected: true,
        actual: typeof UI.createLoadingOverlay === 'function',
    },
    {
        name: 'createChunkIndicator exists',
        expected: true,
        actual: typeof UI.createChunkIndicator === 'function',
    },
    {
        name: 'Crosshair returns HTMLElement',
        expected: true,
        actual: testCrosshair instanceof HTMLElement,
    },
    {
        name: 'Hotbar has 9 slots',
        expected: 9,
        actual: testHotbar.children.length,
    },
    {
        name: 'StatusIndicators has sprint indicator',
        expected: true,
        actual: testStatusIndicators.querySelector('#indicator-sprint') !== null,
    },
    {
        name: 'StatusIndicators has crouch indicator',
        expected: true,
        actual: testStatusIndicators.querySelector('#indicator-crouch') !== null,
    },
    {
        name: 'StatusIndicators has flight indicator',
        expected: true,
        actual: testStatusIndicators.querySelector('#indicator-flight') !== null,
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

            <div style="margin-top: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-width: 700px; width: 100%; padding: 0 20px;">
                <div style="background: rgba(233, 30, 99, 0.2); border: 1px solid #e91e63; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #e91e63;">Persistence</div>
                    <div style="font-size: 11px; color: #888;">RLE Compression</div>
                </div>
                <div style="background: rgba(0, 188, 212, 0.2); border: 1px solid #00bcd4; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #00bcd4;">Audio</div>
                    <div style="font-size: 11px; color: #888;">Formula Player</div>
                </div>
                <div style="background: rgba(155, 89, 182, 0.2); border: 1px solid #9b59b6; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #9b59b6;">Input</div>
                    <div style="font-size: 11px; color: #888;">Keys & Mouse</div>
                </div>
                <div style="background: rgba(230, 126, 34, 0.2); border: 1px solid #e67e22; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #e67e22;">Physics</div>
                    <div style="font-size: 11px; color: #888;">AABB & Raycast</div>
                </div>
            </div>

            <div style="margin-top: 12px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; max-width: 875px; width: 100%; padding: 0 20px;">
                <div style="background: rgba(52, 152, 219, 0.2); border: 1px solid #3498db; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #3498db;">Lighting</div>
                    <div style="font-size: 11px; color: #888;">Sky & Block Light</div>
                </div>
                <div style="background: rgba(39, 174, 96, 0.2); border: 1px solid #27ae60; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #27ae60;">Generation</div>
                    <div style="font-size: 11px; color: #888;">Terrain & Trees</div>
                </div>
                <div style="background: rgba(142, 68, 173, 0.2); border: 1px solid #8e44ad; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #8e44ad;">Entities</div>
                    <div style="font-size: 11px; color: #888;">Player & Mobs</div>
                </div>
                <div style="background: rgba(231, 76, 60, 0.2); border: 1px solid #e74c3c; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #e74c3c;">Render</div>
                    <div style="font-size: 11px; color: #888;">Textures & Mesh</div>
                </div>
                <div style="background: rgba(103, 58, 183, 0.2); border: 1px solid #673ab7; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; color: #673ab7;">UI</div>
                    <div style="font-size: 11px; color: #888;">HUD & Menus</div>
                </div>
            </div>

            <div style="margin-top: 32px; padding: 16px 24px; background: rgba(0,0,0,0.3); border-radius: 8px;">
                <div style="color: #888; font-size: 14px; margin-bottom: 8px;">Chunk Dimensions</div>
                <div style="color: #fff; font-size: 20px; font-family: monospace;">${Config.WORLD_DIMS.chunkSize} × ${Config.WORLD_DIMS.chunkSize} × ${Config.WORLD_DIMS.chunkHeight}</div>
            </div>

            <div style="margin-top: 24px; padding: 12px 20px; background: rgba(121, 85, 72, 0.3); border-radius: 8px;">
                <div style="color: #795548; font-size: 14px; font-weight: bold;">${passed}/${tests.length} Tests Passed</div>
            </div>

            <div style="margin-top: 32px; color: #666; font-size: 12px;">
                Three.js r${THREE.REVISION} • All 8 Phases Complete!
            </div>

            <div style="margin-top: 24px; color: #4caf50; font-size: 13px; max-width: 500px; text-align: center;">
                Modular architecture extraction complete - all systems ready for integration
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
    Input,
    Physics,
    World,
    Entities,
    Render,
    UI,
    THREE,
};

console.log('');
console.log('%c Window.VoxEx available for console debugging ', 'background: #607d8b; color: white;');

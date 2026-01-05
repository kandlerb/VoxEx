/**
 * Main game class - orchestrates all systems
 * @module Game
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Core
import { AIR, WATER, TORCH, GRASS, BEDROCK } from './core/constants.js';

// Config
import { BLOCK_CONFIG } from './config/BlockConfig.js';
import { CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_VOLUME, SEA_LEVEL, Y_OFFSET } from './config/WorldConfig.js';
import { DEFAULTS } from './config/Settings.js';
import { DEFAULT_BINDINGS, getHotbarSlotFromKey } from './input/ControlBindings.js';

// Optimization
import { BlockLookups } from './optimization/BlockLookups.js';

// Input
import { InputManager } from './input/InputManager.js';

// Physics
import { pickVoxel, getPlacementPosition } from './physics/Raycast.js';

// World
import { getChunkKey, parseChunkKey } from './world/Chunk.js';
import { ChunkGenerator } from './world/generation/ChunkGenerator.js';
import { calculateChunkSunlight } from './world/lighting/SkyLight.js';

// Entities
import { PlayerController } from './entities/player/PlayerController.js';
import { EntityManager } from './entities/EntityManager.js';
import { ZOMBIE_EFFECTS } from './config/ZombieConfig.js';

// Render
import { createTextureAtlas } from './render/textures/TextureAtlas.js';
import { createTerrainMaterial } from './render/materials/TerrainMaterial.js';
import {
    createWaterMaterial,
    createFastWaterMaterial,
    createRefractionWaterMaterial,
    updateWaterTime,
    updateWaterOpacity
} from './render/materials/WaterMaterial.js';
import { buildChunkMesh, disposeChunkGeometry } from './render/meshing/ChunkMesher.js';
import { DayNightCycle } from './render/sky/DayNightCycle.js';
import { createTorchViewmodel } from './render/models/TorchModel.js';
import { PostProcessingManager } from './render/effects/PostProcessing.js';

// UI
import { UIManager } from './ui/UIManager.js';

/**
 * @typedef {Object} GameState
 * @property {string} seed
 * @property {boolean} isRunning
 * @property {boolean} isPaused
 */

/**
 * Main Game class - orchestrates all VoxEx systems
 */
export class Game {
    /**
     * @param {HTMLElement} container - Container element for the game
     */
    constructor(container) {
        /** @type {HTMLElement} */
        this.container = container;

        /** @type {GameState} */
        this.state = {
            seed: '',
            isRunning: false,
            isPaused: false
        };

        // Three.js core
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;

        // Lighting
        this.ambientLight = null;
        this.sunLight = null;

        // Game systems
        this.inputManager = null;
        this.uiManager = null;
        this.playerController = null;
        this.entityManager = null;
        this.dayNightCycle = null;
        this.chunkGenerator = null;

        // World data
        /** @type {Map<string, Object>} */
        this.chunks = new Map();
        /** @type {Map<string, THREE.Mesh>} */
        this.solidMeshes = new Map();
        /** @type {Map<string, THREE.Mesh>} */
        this.waterMeshes = new Map();
        /** @type {Set<string>} */
        this.chunksLoading = new Set();
        /** @type {Set<string>} */
        this.chunksToRebuild = new Set();

        // Materials & textures
        this.textureAtlas = null;
        this.terrainMaterial = null;
        this.waterMaterial = null;
        this.waterMaterialRefraction = null;

        // Post-processing
        this.postProcessing = null;

        // Refraction render target
        this.refractionRenderTarget = null;
        this.refractionScale = 0.5;
        this.refractionUpdateFrames = 2;
        this.refractionMoveThreshold = 0.5;
        this.refractionRotateThreshold = 0.1;
        this.refractionFrameCounter = 0;
        this.lastRefractionCamPos = new THREE.Vector3();
        this.lastRefractionCamQuat = new THREE.Quaternion();

        // Underwater state
        this.isUnderwater = false;
        this.underwaterDepth = 0;
        this._lastUnderwaterCheckY = -Infinity;

        // Viewmodels
        this.torchViewmodel = null;
        this.torchVisible = false;

        // Selected block for placement
        this.selectedBlock = GRASS;
        this.selectedSlot = 0;

        // Hotbar contents (block IDs for slots 0-8)
        this.hotbarBlocks = [GRASS, 2, 3, 4, 5, 6, 8, 11, 10];

        // Timing
        this.clock = new THREE.Clock();
        this.lastFrameTime = 0;
        this.animationId = null;

        // Settings
        this.settings = { ...DEFAULTS };
        this.bindings = { ...DEFAULT_BINDINGS };

        // Stats
        this.stats = {
            fps: 0,
            frameCount: 0,
            lastFpsUpdate: 0,
            totalFaces: 0
        };

        // Scratch objects
        this._lookDir = new THREE.Vector3();
        this._playerInput = {
            forward: false,
            back: false,
            left: false,
            right: false,
            jump: false,
            crouch: false,
            sprint: false
        };

        // Bind methods
        this.animate = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
    }

    /**
     * Initialize all game systems
     */
    async init() {
        console.log('%c[Game] Initializing...', 'color: #4CAF50');

        // Block lookups are already built at import time

        // Initialize Three.js
        this.initRenderer();
        this.initScene();
        this.initCamera();
        this.initControls();

        // Initialize textures & materials
        this.initMaterials();

        // Initialize game systems
        this.initInput();
        this.initUI();
        this.initDayNight();
        this.initPostProcessing();

        // Initialize viewmodels
        this.initViewmodels();

        // Event listeners
        window.addEventListener('resize', this.onWindowResize);

        console.log('%c[Game] Initialization complete', 'color: #4CAF50');
    }

    /**
     * Initialize WebGL renderer
     */
    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.settings.antialiasing,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x87CEEB);
        this.container.appendChild(this.renderer.domElement);
    }

    /**
     * Initialize Three.js scene
     */
    initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x87CEEB, 10, this.settings.renderDistance * CHUNK_SIZE);

        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);

        // Directional light (sun)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.sunLight.position.set(100, 200, 100);
        this.scene.add(this.sunLight);
    }

    /**
     * Initialize camera
     */
    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            this.settings.normalFOV || 75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 80, 0);
    }

    /**
     * Initialize pointer lock controls
     */
    initControls() {
        this.controls = new PointerLockControls(this.camera, this.renderer.domElement);

        this.controls.addEventListener('lock', () => {
            if (this.uiManager) {
                this.uiManager.setState('playing');
            }
            this.state.isPaused = false;
        });

        this.controls.addEventListener('unlock', () => {
            if (this.state.isRunning && this.uiManager) {
                this.uiManager.setState('paused');
            }
            this.state.isPaused = true;
        });
    }

    /**
     * Initialize textures and materials
     */
    initMaterials() {
        // Create texture atlas
        const atlasResult = createTextureAtlas(this.settings.textureResolution || 16);
        this.textureAtlas = atlasResult.texture;

        // Create materials
        this.terrainMaterial = createTerrainMaterial(this.textureAtlas, {
            useStandardMaterial: true
        });
        const { material, refractionMaterial } = this.createWaterMaterialFromSettings();
        this.waterMaterial = material;
        this.waterMaterialRefraction = refractionMaterial;
    }

    /**
     * Initialize input manager
     */
    initInput() {
        this.inputManager = new InputManager(this.renderer.domElement);
        this.inputManager.init();

        // Key event handlers
        this.inputManager.on('keydown', (e) => this.handleKeyDown(e));
        this.inputManager.on('keyup', (e) => this.handleKeyUp(e));

        // Mouse handlers
        this.inputManager.on('mousedown', (e) => this.handleMouseDown(e));

        // Wheel for hotbar
        this.inputManager.on('wheel', (e) => this.handleWheel(e));

        // Prevent context menu
        this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    }

    /**
     * Handle key down events
     * @param {KeyboardEvent} e
     */
    handleKeyDown(e) {
        // Check for hotbar slot
        const slot = getHotbarSlotFromKey(this.bindings, e.code);
        if (slot !== null) {
            this.selectHotbarSlot(slot - 1);
            return;
        }

        // Toggle actions
        if (e.code === this.bindings.toggleTorch) {
            this.toggleTorch();
        }
        if (e.code === this.bindings.debug) {
            this.uiManager?.toggleDebug();
        }
        if (e.code === this.bindings.inventory) {
            if (this.controls.isLocked) {
                this.controls.unlock();
                this.uiManager?.toggleInventory();
            } else if (this.uiManager?.getState() === 'inventory') {
                this.uiManager?.setState('playing');
                this.controls.lock();
            }
        }
        if (e.code === this.bindings.pause) {
            if (this.controls.isLocked) {
                this.controls.unlock();
            }
        }
        if (e.code === this.bindings.quickSave) {
            this.saveWorld();
            e.preventDefault();
        }
        if (e.code === this.bindings.quickLoad) {
            this.loadWorld();
            e.preventDefault();
        }
    }

    /**
     * Handle key up events
     * @param {KeyboardEvent} e
     */
    handleKeyUp(e) {
        // Reserved for future use
    }

    /**
     * Handle mouse down events
     * @param {MouseEvent} e
     */
    handleMouseDown(e) {
        if (!this.controls.isLocked) return;

        // Get look direction
        this.camera.getWorldDirection(this._lookDir);

        // Raycast for block
        const hit = pickVoxel(
            this.camera.position,
            this._lookDir,
            this.settings.blockReach || 8,
            (x, y, z) => this.isSolidBlock(x, y, z)
        );

        if (!hit) return;

        if (e.button === 0) {
            // Left click - mine block
            const block = this.getBlockAt(hit.x, hit.y, hit.z);
            if (block !== BEDROCK) {
                this.setBlockAt(hit.x, hit.y, hit.z, AIR);
            }
        } else if (e.button === 2) {
            // Right click - place block
            const placePos = getPlacementPosition(hit);
            if (placePos && this.selectedBlock !== AIR) {
                // Don't place inside player
                const playerPos = this.playerController?.position;
                if (playerPos) {
                    const dx = Math.abs(placePos.x + 0.5 - playerPos.x);
                    const dy = placePos.y - playerPos.y;
                    const dz = Math.abs(placePos.z + 0.5 - playerPos.z);
                    // Check if block would intersect player hitbox
                    if (dx < 0.6 && dz < 0.6 && dy >= -0.1 && dy < 1.8) {
                        return; // Don't place
                    }
                }
                this.setBlockAt(placePos.x, placePos.y, placePos.z, this.selectedBlock);
            }
        }
    }

    /**
     * Handle wheel events for hotbar
     * @param {WheelEvent} e
     */
    handleWheel(e) {
        if (!this.controls.isLocked) return;

        const delta = e.deltaY > 0 ? 1 : -1;
        let newSlot = (this.selectedSlot + delta + 9) % 9;
        this.selectHotbarSlot(newSlot);
    }

    /**
     * Select hotbar slot
     * @param {number} slot - Slot index (0-8)
     */
    selectHotbarSlot(slot) {
        this.selectedSlot = slot;
        this.selectedBlock = this.hotbarBlocks[slot] || GRASS;
        this.uiManager?.selectHotbarSlot(slot);
    }

    /**
     * Initialize UI manager
     */
    initUI() {
        this.uiManager = new UIManager(this.container, {
            onNewWorld: (seed) => this.startNewWorld(seed),
            onLoadWorld: (saveName) => this.loadWorld(saveName),
            onSave: () => this.saveWorld(),
            onLoad: () => this.uiManager.setState('mainMenu'),
            onSettingChange: (key, value) => this.updateSetting(key, value),
            onBlockSelect: (blockId) => {
                this.selectedBlock = blockId;
            },
            onStateChange: (state) => {
                this.state.isPaused = state !== 'playing';
            },
            settings: this.settings
        });

        // Initialize hotbar
        for (let i = 0; i < 9; i++) {
            this.uiManager.setHotbarSlot(i, this.hotbarBlocks[i], null);
        }
        this.uiManager.selectHotbarSlot(0);
    }

    /**
     * Initialize day/night cycle
     */
    initDayNight() {
        this.dayNightCycle = new DayNightCycle({
            dayLengthSeconds: this.settings.dayLength || 1200,
            startTime: 0.25 // Dawn
        });
    }

    /**
     * Initialize post-processing and refraction buffers
     */
    initPostProcessing() {
        this.postProcessing = new PostProcessingManager(this.renderer, this.scene, this.camera, {
            enabled: true,
            settings: this.settings
        });
        this.postProcessing.resize(window.innerWidth, window.innerHeight);
        this.ensureRefractionTarget();
    }

    /**
     * Initialize torch viewmodel
     */
    initViewmodels() {
        this.torchViewmodel = createTorchViewmodel();
        this.torchViewmodel.visible = false;
        this.torchViewmodel.position.set(0.35, -0.35, -0.5);
        this.camera.add(this.torchViewmodel);
        this.scene.add(this.camera);
    }

    /**
     * Ensure refraction render target is created or disposed based on settings.
     */
    ensureRefractionTarget() {
        const refractionEnabled = this.settings.waterRefractionEnabled && !this.settings.waterFastMode;

        if (!refractionEnabled) {
            if (this.refractionRenderTarget) {
                this.refractionRenderTarget.dispose();
                this.refractionRenderTarget = null;
            }
            return;
        }

        const size = this.renderer.getSize(new THREE.Vector2());
        const pixelRatio = this.renderer.getPixelRatio();
        const width = Math.max(1, Math.floor(size.x * pixelRatio * this.refractionScale));
        const height = Math.max(1, Math.floor(size.y * pixelRatio * this.refractionScale));

        if (this.refractionRenderTarget) {
            this.refractionRenderTarget.setSize(width, height);
            return;
        }

        this.refractionRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });
    }

    /**
     * Create water material based on current settings.
     * @returns {{material: THREE.Material, refractionMaterial: THREE.ShaderMaterial|null}}
     */
    createWaterMaterialFromSettings() {
        const waterOpacity = this.settings.waterOpacity ?? 0.7;

        if (this.settings.waterFastMode) {
            return { material: createFastWaterMaterial(this.textureAtlas, waterOpacity), refractionMaterial: null };
        }

        if (this.settings.waterRefractionEnabled) {
            const material = createRefractionWaterMaterial(this.textureAtlas, {
                opacity: waterOpacity,
                refractionStrength: this.settings.waterRefractionStrength ?? 0.02,
                waterColor: new THREE.Color(this.settings.waterColor ?? 0x4488ff),
                absorptionR: this.settings.waterAbsorptionR ?? 0.25,
                absorptionG: this.settings.waterAbsorptionG ?? 0.06,
                absorptionB: this.settings.waterAbsorptionB ?? 0.01,
            });
            return { material, refractionMaterial: material };
        }

        return { material: createWaterMaterial(this.textureAtlas, { opacity: waterOpacity }), refractionMaterial: null };
    }

    /**
     * Apply a new water material to all water meshes.
     * @param {THREE.Material} material
     * @param {THREE.ShaderMaterial|null} refractionMaterial
     */
    applyWaterMaterial(material, refractionMaterial) {
        if (this.waterMaterial) {
            this.waterMaterial.dispose();
        }
        this.waterMaterial = material;
        this.waterMaterialRefraction = refractionMaterial;

        for (const mesh of this.waterMeshes.values()) {
            mesh.material = this.waterMaterial;
        }
    }

    /**
     * Start a new world with given seed
     * @param {string} seed
     */
    async startNewWorld(seed) {
        console.log(`%c[Game] Starting new world with seed: ${seed}`, 'color: #2196F3');

        this.state.seed = seed || Math.random().toString(36).substring(7);
        this.state.isRunning = true;
        this.state.isPaused = false;

        // Show loading screen
        this.uiManager.setState('loading');
        this.uiManager.setLoadingProgress(0, 'Initializing world...');

        // Clear any existing world data
        this.clearWorld();

        // Initialize generator
        const numericSeed = this.hashSeed(this.state.seed);
        this.chunkGenerator = new ChunkGenerator(numericSeed);

        // Initialize player at spawn
        const spawnY = this.chunkGenerator.getHeightAt(0, 0) + 2 + Y_OFFSET;
        this.playerController = new PlayerController(0, spawnY, 0);
        this.camera.position.set(0, spawnY, 0);

        // Initialize entity manager
        this.entityManager = new EntityManager();

        // Generate initial chunks
        await this.generateInitialChunks();

        // Start game
        this.uiManager.setState('playing');
        this.controls.lock();

        // Start game loop
        if (!this.animationId) {
            this.clock.start();
            this.animate();
        }
    }

    /**
     * Clear all world data
     */
    clearWorld() {
        // Dispose meshes
        for (const mesh of this.solidMeshes.values()) {
            this.scene.remove(mesh);
            disposeChunkGeometry(mesh.geometry);
        }
        for (const mesh of this.waterMeshes.values()) {
            this.scene.remove(mesh);
            disposeChunkGeometry(mesh.geometry);
        }

        this.chunks.clear();
        this.solidMeshes.clear();
        this.waterMeshes.clear();
        this.chunksLoading.clear();
        this.chunksToRebuild.clear();
    }

    /**
     * Generate initial chunks around spawn
     */
    async generateInitialChunks() {
        const renderDist = this.settings.renderDistance;
        const totalChunks = (renderDist * 2 + 1) ** 2;
        let generated = 0;

        for (let dx = -renderDist; dx <= renderDist; dx++) {
            for (let dz = -renderDist; dz <= renderDist; dz++) {
                const key = getChunkKey(dx, dz);

                if (!this.chunks.has(key)) {
                    this.generateChunk(dx, dz);
                    generated++;

                    const progress = (generated / totalChunks) * 100;
                    this.uiManager.setLoadingProgress(progress, `Generating terrain... ${generated}/${totalChunks}`);

                    // Yield to UI
                    if (generated % 4 === 0) {
                        await new Promise(r => setTimeout(r, 0));
                    }
                }
            }
        }
    }

    /**
     * Generate a single chunk
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     */
    generateChunk(cx, cz) {
        const key = getChunkKey(cx, cz);

        if (this.chunks.has(key) || this.chunksLoading.has(key)) {
            return;
        }

        this.chunksLoading.add(key);

        // Generate chunk data
        const chunkData = this.chunkGenerator.generateChunk(cx, cz);

        // Calculate lighting
        calculateChunkSunlight(
            chunkData,
            CHUNK_SIZE,
            CHUNK_HEIGHT,
            BlockLookups.IS_TRANSPARENT,
            BlockLookups.SUNLIGHT_ATTENUATION
        );

        this.chunks.set(key, chunkData);

        // Build mesh
        this.buildChunkMeshes(cx, cz, chunkData);

        this.chunksLoading.delete(key);
    }

    /**
     * Build mesh for chunk
     * @param {number} cx - Chunk X
     * @param {number} cz - Chunk Z
     * @param {Object} chunkData - Chunk data
     */
    buildChunkMeshes(cx, cz, chunkData) {
        const key = getChunkKey(cx, cz);

        // Remove old meshes if exist
        const oldSolid = this.solidMeshes.get(key);
        if (oldSolid) {
            this.scene.remove(oldSolid);
            disposeChunkGeometry(oldSolid.geometry);
        }
        const oldWater = this.waterMeshes.get(key);
        if (oldWater) {
            this.scene.remove(oldWater);
            disposeChunkGeometry(oldWater.geometry);
        }

        // Get neighbor block function
        const getNeighborBlock = (lx, ly, lz) => {
            if (ly < 0 || ly >= CHUNK_HEIGHT) return AIR;

            let ncx = cx;
            let ncz = cz;
            let nlx = lx;
            let nlz = lz;

            if (lx < 0) { ncx--; nlx = CHUNK_SIZE - 1; }
            else if (lx >= CHUNK_SIZE) { ncx++; nlx = 0; }
            if (lz < 0) { ncz--; nlz = CHUNK_SIZE - 1; }
            else if (lz >= CHUNK_SIZE) { ncz++; nlz = 0; }

            const neighborKey = getChunkKey(ncx, ncz);
            const neighbor = this.chunks.get(neighborKey);
            if (!neighbor) return AIR;

            const idx = nlx + nlz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
            return neighbor.blocks[idx] || AIR;
        };

        // Get light function
        const getLight = (lx, ly, lz) => {
            if (ly < 0 || ly >= CHUNK_HEIGHT) return 15;

            let ncx = cx;
            let ncz = cz;
            let nlx = lx;
            let nlz = lz;

            if (lx < 0) { ncx--; nlx = CHUNK_SIZE - 1; }
            else if (lx >= CHUNK_SIZE) { ncx++; nlx = 0; }
            if (lz < 0) { ncz--; nlz = CHUNK_SIZE - 1; }
            else if (lz >= CHUNK_SIZE) { ncz++; nlz = 0; }

            const neighborKey = getChunkKey(ncx, ncz);
            const chunk = ncx === cx && ncz === cz ? chunkData : this.chunks.get(neighborKey);
            if (!chunk || !chunk.skyLight) return 15;

            const idx = nlx + nlz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
            const sky = chunk.skyLight[idx] || 0;
            const block = chunk.blockLight ? (chunk.blockLight[idx] || 0) : 0;
            return Math.max(sky, block, 1);
        };

        // Build mesh
        const meshResult = buildChunkMesh(chunkData, cx, cz, getNeighborBlock, getLight);

        // Add solid mesh
        if (meshResult.solidFaceCount > 0) {
            const solidMesh = new THREE.Mesh(meshResult.solidGeometry, this.terrainMaterial);
            solidMesh.position.set(0, 0, 0);
            solidMesh.frustumCulled = true;
            this.scene.add(solidMesh);
            this.solidMeshes.set(key, solidMesh);
            this.stats.totalFaces += meshResult.solidFaceCount;
        }

        // Add water mesh
        if (meshResult.waterFaceCount > 0) {
            const waterMesh = new THREE.Mesh(meshResult.waterGeometry, this.waterMaterial);
            waterMesh.position.set(0, 0, 0);
            waterMesh.frustumCulled = true;
            waterMesh.renderOrder = 1;
            this.scene.add(waterMesh);
            this.waterMeshes.set(key, waterMesh);
        }
    }

    /**
     * Main game loop
     */
    animate() {
        this.animationId = requestAnimationFrame(this.animate);

        const delta = Math.min(this.clock.getDelta(), 0.1); // Cap delta to prevent physics explosions
        const elapsed = this.clock.getElapsedTime();

        // Update FPS
        this.updateFPS(elapsed);

        // Skip updates if paused
        if (this.state.isPaused || !this.state.isRunning) {
            if (this.postProcessing) {
                this.postProcessing.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
            return;
        }

        // Update systems
        this.updateInput(delta);
        this.updatePlayer(delta);
        this.updateEntities(delta);
        this.updateDayNight(delta);
        this.updateChunks();
        this.processChunkRebuilds();
        this.updateUI();
        this.updatePostProcessing(elapsed);

        // Render
        if (this.postProcessing) {
            this.postProcessing.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Update FPS counter
     * @param {number} elapsed - Elapsed time
     */
    updateFPS(elapsed) {
        this.stats.frameCount++;
        if (elapsed - this.stats.lastFpsUpdate >= 1) {
            this.stats.fps = this.stats.frameCount;
            this.stats.frameCount = 0;
            this.stats.lastFpsUpdate = elapsed;
        }
    }

    /**
     * Update input state
     * @param {number} delta
     */
    updateInput(delta) {
        if (!this.controls.isLocked) return;

        // Update player input state
        this._playerInput.forward = this.inputManager.isKeyDown(this.bindings.forward);
        this._playerInput.back = this.inputManager.isKeyDown(this.bindings.backward);
        this._playerInput.left = this.inputManager.isKeyDown(this.bindings.left);
        this._playerInput.right = this.inputManager.isKeyDown(this.bindings.right);
        this._playerInput.jump = this.inputManager.isKeyDown(this.bindings.jump);
        this._playerInput.crouch = this.inputManager.isKeyDown(this.bindings.crouch);
        this._playerInput.sprint = this.inputManager.isKeyDown(this.bindings.sprint);
    }

    /**
     * Update player physics
     * @param {number} delta
     */
    updatePlayer(delta) {
        if (!this.playerController) return;

        // Sync yaw from camera
        const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.playerController.yaw = euler.y;

        // Process input
        this.playerController.processInput(this._playerInput, delta);

        // Apply gravity
        this.playerController.applyGravity(delta);

        // Update player state
        this.playerController.update(delta);

        // Move with collision
        this.movePlayerWithCollision(delta);

        // Sync camera
        const eyePos = this.playerController.getEyePosition();
        this.camera.position.set(eyePos.x, eyePos.y, eyePos.z);

        // Update FOV for sprint
        const targetFov = this.playerController.isSprinting
            ? (this.settings.sprintFOV || 80)
            : (this.settings.normalFOV || 75);
        this.camera.fov += (targetFov - this.camera.fov) * 0.1;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Move player with collision detection
     * @param {number} delta
     */
    movePlayerWithCollision(delta) {
        const p = this.playerController;
        const stepHeight = p.stepHeight || 0.6;
        const width = p.width || 0.6;
        const height = p.getColliderHeight();

        // Store old position
        const oldX = p.x;
        const oldY = p.y;
        const oldZ = p.z;

        // Try X movement
        p.x += p.vx * delta;
        if (this.checkPlayerCollision(p.x, p.y, p.z, width, height)) {
            // Try step up
            const stepY = p.y + stepHeight;
            if (!this.checkPlayerCollision(p.x, stepY, p.z, width, height) && p.onGround) {
                p.y = stepY;
            } else {
                p.x = oldX;
            }
        }

        // Try Z movement
        p.z += p.vz * delta;
        if (this.checkPlayerCollision(p.x, p.y, p.z, width, height)) {
            // Try step up
            const stepY = p.y + stepHeight;
            if (!this.checkPlayerCollision(p.x, stepY, p.z, width, height) && p.onGround) {
                p.y = stepY;
            } else {
                p.z = oldZ;
            }
        }

        // Try Y movement
        p.y += p.vy * delta;
        if (this.checkPlayerCollision(p.x, p.y, p.z, width, height)) {
            if (p.vy < 0) {
                // Landing
                p.onGround = true;
                p.vy = 0;
                // Snap to ground
                p.y = Math.floor(oldY) + 0.01;
                while (this.checkPlayerCollision(p.x, p.y, p.z, width, height) && p.y < oldY + 1) {
                    p.y += 0.1;
                }
            } else {
                // Hit ceiling
                p.vy = 0;
                p.y = oldY;
            }
        } else {
            p.onGround = false;
        }

        // Check if in water
        const headY = p.y + height - 0.1;
        const headBlock = this.getBlockAt(Math.floor(p.x), Math.floor(headY), Math.floor(p.z));
        p.setSwimming(headBlock === WATER);
    }

    /**
     * Check if player collides with world
     * @param {number} x - Player X
     * @param {number} y - Player Y
     * @param {number} z - Player Z
     * @param {number} width - Player width
     * @param {number} height - Player height
     * @returns {boolean}
     */
    checkPlayerCollision(x, y, z, width, height) {
        const hw = width / 2;
        const minX = Math.floor(x - hw);
        const maxX = Math.floor(x + hw);
        const minY = Math.floor(y);
        const maxY = Math.floor(y + height);
        const minZ = Math.floor(z - hw);
        const maxZ = Math.floor(z + hw);

        for (let bx = minX; bx <= maxX; bx++) {
            for (let by = minY; by <= maxY; by++) {
                for (let bz = minZ; bz <= maxZ; bz++) {
                    if (this.isSolidBlock(bx, by, bz)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Update entities
     * @param {number} delta
     */
    updateEntities(delta) {
        if (!this.entityManager) return;

        const playerPos = this.playerController?.position;
        if (playerPos) {
            this.entityManager.update(playerPos, delta);
        }

        // Spawn zombies at night
        if (this.dayNightCycle?.isNight() && this.entityManager.getZombieCount() < 4) {
            const px = this.playerController?.x || 0;
            const pz = this.playerController?.z || 0;
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 20;
            const zx = px + Math.cos(angle) * dist;
            const zz = pz + Math.sin(angle) * dist;
            const zy = this.chunkGenerator?.getHeightAt(Math.floor(zx), Math.floor(zz)) + Y_OFFSET + 1;
            if (zy !== undefined) {
                this.entityManager.spawnZombie(zx, zy, zz);
            }
        }
    }

    /**
     * Update day/night cycle
     * @param {number} delta
     */
    updateDayNight(delta) {
        if (!this.dayNightCycle) return;

        this.dayNightCycle.update(delta);

        // Apply to scene
        this.dayNightCycle.applyToScene(this.scene, this.ambientLight, this.sunLight, null);
    }

    /**
     * Update post-processing effects and refraction
     * @param {number} elapsed
     */
    updatePostProcessing(elapsed) {
        if (!this.postProcessing) return;

        this.updateUnderwaterState();

        const zombieProximity = this.getZombieProximity();
        this.postProcessing.updateZombieEffects(zombieProximity);

        this.postProcessing.updateUnderwater({
            isUnderwater: this.isUnderwater,
            depth: this.underwaterDepth,
            time: performance.now(),
            waterColor: this.settings.waterColor,
            absorptionR: this.settings.waterAbsorptionR,
            absorptionG: this.settings.waterAbsorptionG,
            absorptionB: this.settings.waterAbsorptionB
        });

        this.postProcessing.updateVolumetric({
            dayNightCycle: this.dayNightCycle,
            camera: this.camera,
            aspectRatio: this.camera.aspect
        });

        this.postProcessing.updateColorGrading(this.dayNightCycle?.time ?? 0);

        updateWaterTime(this.waterMaterial, elapsed);
        this.updateWaterRefraction();
    }

    /**
     * Update underwater state for post-processing
     */
    updateUnderwaterState() {
        const eyePos = this.camera.position;
        const eyeX = Math.floor(eyePos.x);
        const eyeY = eyePos.y;
        const eyeZ = Math.floor(eyePos.z);
        const eyeBlockY = Math.floor(eyeY);

        const wasUnderwater = this.isUnderwater;
        this.isUnderwater = this.getBlockAt(eyeX, eyeBlockY, eyeZ) === WATER;

        if (this.isUnderwater) {
            const yDelta = Math.abs(eyeY - this._lastUnderwaterCheckY);
            if (yDelta > 0.25 || !wasUnderwater) {
                this._lastUnderwaterCheckY = eyeY;
                let surfaceY = eyeBlockY;
                for (let y = eyeBlockY; y < eyeBlockY + 50; y++) {
                    if (this.getBlockAt(eyeX, y, eyeZ) !== WATER) {
                        surfaceY = y;
                        break;
                    }
                }
                this.underwaterDepth = Math.max(0, surfaceY - eyeY);
            }
        } else if (wasUnderwater) {
            this.underwaterDepth = 0;
            this._lastUnderwaterCheckY = -Infinity;
        }
    }

    /**
     * Calculate zombie proximity for scare effects
     * @returns {number}
     */
    getZombieProximity() {
        if (!this.entityManager || !this.playerController) return 0;

        const { zombie, distance } = this.entityManager.getClosestZombie(
            this.playerController.x,
            this.playerController.y,
            this.playerController.z
        );

        if (!zombie) return 0;

        const range = ZOMBIE_EFFECTS.effectRange ?? 20;
        const falloff = ZOMBIE_EFFECTS.effectFalloff ?? 10;

        if (distance <= range) return 1;
        if (distance <= range + falloff) {
            return 1 - (distance - range) / falloff;
        }

        return 0;
    }

    /**
     * Update refraction render target and uniforms
     */
    updateWaterRefraction() {
        const refractionEnabled = this.settings.waterRefractionEnabled && !this.settings.waterFastMode;
        if (!refractionEnabled || !this.refractionRenderTarget || !this.waterMaterialRefraction) return;

        this.refractionFrameCounter++;
        const camPos = this.camera.position;
        const camQuat = this.camera.quaternion;
        const posDelta = this.lastRefractionCamPos.distanceTo(camPos);
        const quatDot = Math.abs(this.lastRefractionCamQuat.dot(camQuat));
        const rotDelta = quatDot < 1 ? Math.acos(Math.min(1, quatDot)) * 2 : 0;
        const needsUpdate = this.refractionFrameCounter >= this.refractionUpdateFrames ||
            posDelta > this.refractionMoveThreshold ||
            rotDelta > this.refractionRotateThreshold;

        if (needsUpdate) {
            this.refractionFrameCounter = 0;
            this.lastRefractionCamPos.copy(camPos);
            this.lastRefractionCamQuat.copy(camQuat);

            const hiddenWaterMeshes = [];
            for (const mesh of this.waterMeshes.values()) {
                if (mesh.visible) {
                    mesh.visible = false;
                    hiddenWaterMeshes.push(mesh);
                }
            }

            const torchVisible = this.torchViewmodel?.visible ?? false;
            if (this.torchViewmodel) {
                this.torchViewmodel.visible = false;
            }

            this.renderer.setRenderTarget(this.refractionRenderTarget);
            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
            this.renderer.setRenderTarget(null);

            for (const mesh of hiddenWaterMeshes) {
                mesh.visible = true;
            }
            if (this.torchViewmodel) {
                this.torchViewmodel.visible = torchVisible;
            }
        }

        const mat = this.waterMaterialRefraction;
        mat.uniforms.tRefraction.value = this.refractionRenderTarget.texture;
        mat.uniforms.time.value = performance.now() * 0.001;
        mat.uniforms.opacity.value = this.settings.waterOpacity ?? 0.7;
        mat.uniforms.refractionStrength.value = this.settings.waterRefractionStrength ?? 0.02;

        if (this.scene.fog) {
            mat.uniforms.fogColor.value.copy(this.scene.fog.color);
            mat.uniforms.fogNear.value = this.scene.fog.near;
            mat.uniforms.fogFar.value = this.scene.fog.far;
        }
    }

    /**
     * Update chunk loading/unloading
     */
    updateChunks() {
        if (!this.playerController) return;

        const pos = this.playerController.position;
        const pcx = Math.floor(pos.x / CHUNK_SIZE);
        const pcz = Math.floor(pos.z / CHUNK_SIZE);
        const renderDist = this.settings.renderDistance;

        // Load nearby chunks (limit per frame)
        let loaded = 0;
        const maxLoadPerFrame = 1;

        for (let dx = -renderDist; dx <= renderDist && loaded < maxLoadPerFrame; dx++) {
            for (let dz = -renderDist; dz <= renderDist && loaded < maxLoadPerFrame; dz++) {
                const cx = pcx + dx;
                const cz = pcz + dz;
                const key = getChunkKey(cx, cz);

                if (!this.chunks.has(key) && !this.chunksLoading.has(key)) {
                    this.generateChunk(cx, cz);
                    loaded++;
                }
            }
        }

        // Unload distant chunks
        const unloadDist = renderDist + 2;
        const keysToRemove = [];

        for (const key of this.solidMeshes.keys()) {
            const { cx, cz } = parseChunkKey(key);
            const dist = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));

            if (dist > unloadDist) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            const solidMesh = this.solidMeshes.get(key);
            if (solidMesh) {
                this.scene.remove(solidMesh);
                disposeChunkGeometry(solidMesh.geometry);
                this.solidMeshes.delete(key);
            }

            const waterMesh = this.waterMeshes.get(key);
            if (waterMesh) {
                this.scene.remove(waterMesh);
                disposeChunkGeometry(waterMesh.geometry);
                this.waterMeshes.delete(key);
            }

            this.chunks.delete(key);
        }

        // Update chunk indicator
        this.uiManager?.updateChunkLoading(this.chunksLoading.size);
    }

    /**
     * Process pending chunk rebuilds
     */
    processChunkRebuilds() {
        if (this.chunksToRebuild.size === 0) return;

        // Process one per frame
        const key = this.chunksToRebuild.values().next().value;
        this.chunksToRebuild.delete(key);

        const chunk = this.chunks.get(key);
        if (chunk) {
            const { cx, cz } = parseChunkKey(key);
            this.buildChunkMeshes(cx, cz, chunk);
        }
    }

    /**
     * Update UI elements
     */
    updateUI() {
        if (!this.uiManager || !this.playerController) return;

        const pos = this.playerController.position;
        const cx = Math.floor(pos.x / CHUNK_SIZE);
        const cz = Math.floor(pos.z / CHUNK_SIZE);

        // Get biome
        const biome = this.chunkGenerator?.getBiomeAt(Math.floor(pos.x), Math.floor(pos.z));

        this.uiManager.updateDebug({
            fps: this.stats.fps,
            x: pos.x.toFixed(1),
            y: pos.y.toFixed(1),
            z: pos.z.toFixed(1),
            chunkX: cx,
            chunkZ: cz,
            biome: biome?.name || 'unknown',
            loadedChunks: this.chunks.size,
            totalFaces: this.stats.totalFaces,
            drawCalls: this.renderer.info.render.calls,
            seed: this.state.seed,
            time: this.dayNightCycle?.getTimeString() || '00:00'
        });

        this.uiManager.updateStatus({
            isSprinting: this.playerController.isSprinting,
            isCrouching: this.playerController.isCrouching,
            isFlying: this.playerController.isFlying
        });
    }

    /**
     * Check if a block is solid
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    isSolidBlock(x, y, z) {
        const block = this.getBlockAt(x, y, z);
        if (block === AIR || block === WATER) return false;
        return BlockLookups.BLOCK_IS_SOLID[block] === 1;
    }

    /**
     * Get block at world position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number} Block ID
     */
    getBlockAt(x, y, z) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const key = getChunkKey(cx, cz);

        const chunk = this.chunks.get(key);
        if (!chunk) return AIR;

        const lx = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = Math.floor(y);

        if (ly < 0 || ly >= CHUNK_HEIGHT) return AIR;

        const index = lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
        return chunk.blocks[index] || AIR;
    }

    /**
     * Set block at world position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} blockId
     */
    setBlockAt(x, y, z, blockId) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const key = getChunkKey(cx, cz);

        const chunk = this.chunks.get(key);
        if (!chunk) return;

        const lx = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = Math.floor(y);

        if (ly < 0 || ly >= CHUNK_HEIGHT) return;

        const index = lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
        chunk.blocks[index] = blockId;
        chunk.modified = true;

        // Recalculate lighting
        calculateChunkSunlight(
            chunk,
            CHUNK_SIZE,
            CHUNK_HEIGHT,
            BlockLookups.IS_TRANSPARENT,
            BlockLookups.SUNLIGHT_ATTENUATION
        );

        // Queue chunk for rebuild
        this.chunksToRebuild.add(key);

        // Queue neighbor chunks if on edge
        if (lx === 0) this.chunksToRebuild.add(getChunkKey(cx - 1, cz));
        if (lx === CHUNK_SIZE - 1) this.chunksToRebuild.add(getChunkKey(cx + 1, cz));
        if (lz === 0) this.chunksToRebuild.add(getChunkKey(cx, cz - 1));
        if (lz === CHUNK_SIZE - 1) this.chunksToRebuild.add(getChunkKey(cx, cz + 1));
    }

    /**
     * Toggle torch visibility
     */
    toggleTorch() {
        this.torchVisible = !this.torchVisible;
        if (this.torchViewmodel) {
            this.torchViewmodel.visible = this.torchVisible;
        }
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.postProcessing?.resize(window.innerWidth, window.innerHeight);
        this.ensureRefractionTarget();
    }

    /**
     * Update a setting
     * @param {string} key
     * @param {*} value
     */
    updateSetting(key, value) {
        this.settings[key] = value;

        if (key === 'normalFOV' || key === 'sprintFOV') {
            // FOV will update in animate loop
        }
        if (key === 'renderDistance') {
            this.scene.fog.far = value * CHUNK_SIZE;
        }
        if (key === 'dayLength' && this.dayNightCycle) {
            this.dayNightCycle.setDayLength(value);
        }
        if (key === 'waterFastMode' || key === 'waterRefractionEnabled') {
            const { material, refractionMaterial } = this.createWaterMaterialFromSettings();
            this.applyWaterMaterial(material, refractionMaterial);
            this.ensureRefractionTarget();
        }
        if (key === 'waterOpacity') {
            updateWaterOpacity(this.waterMaterial, value);
        }
        if (key === 'waterColor' && this.waterMaterialRefraction?.uniforms?.waterColor) {
            this.waterMaterialRefraction.uniforms.waterColor.value.setHex(value);
        }
        if (key === 'waterAbsorptionR' && this.waterMaterialRefraction?.uniforms?.absorptionR) {
            this.waterMaterialRefraction.uniforms.absorptionR.value = value;
        }
        if (key === 'waterAbsorptionG' && this.waterMaterialRefraction?.uniforms?.absorptionG) {
            this.waterMaterialRefraction.uniforms.absorptionG.value = value;
        }
        if (key === 'waterAbsorptionB' && this.waterMaterialRefraction?.uniforms?.absorptionB) {
            this.waterMaterialRefraction.uniforms.absorptionB.value = value;
        }
        if (key === 'waterRefractionStrength' && this.waterMaterialRefraction?.uniforms?.refractionStrength) {
            this.waterMaterialRefraction.uniforms.refractionStrength.value = value;
        }

        if (this.postProcessing) {
            this.postProcessing.applySettings(this.settings);
        }
    }

    /**
     * Hash seed string to number
     * @param {string} seed
     * @returns {number}
     */
    hashSeed(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    /**
     * Save world (placeholder)
     */
    saveWorld() {
        console.log('%c[Game] Quick save', 'color: #FF9800');
        // TODO: Implement world saving
    }

    /**
     * Load world (placeholder)
     * @param {string} [saveName]
     */
    loadWorld(saveName) {
        console.log(`%c[Game] Load world: ${saveName || 'quicksave'}`, 'color: #FF9800');
        // TODO: Implement world loading
    }

    /**
     * Dispose all resources
     */
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        window.removeEventListener('resize', this.onWindowResize);

        // Dispose input
        this.inputManager?.destroy();

        // Dispose chunks
        this.clearWorld();

        // Dispose materials
        this.terrainMaterial?.dispose();
        this.waterMaterial?.dispose();
        this.textureAtlas?.dispose();
        this.postProcessing?.dispose();
        this.refractionRenderTarget?.dispose();

        // Dispose renderer
        this.renderer?.dispose();

        // Dispose UI
        this.uiManager?.dispose();
    }
}

export default Game;

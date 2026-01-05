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
import { DEFAULTS, SETTINGS_PROFILES, loadSettings, saveSettings } from './config/Settings.js';
import { DEFAULT_BINDINGS, getHotbarSlotFromKey } from './input/ControlBindings.js';
import { PLAYER_PHYSICS } from './config/PlayerConfig.js';

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
import { PlayerAnimation } from './entities/player/PlayerAnimation.js';
import { EntityManager } from './entities/EntityManager.js';

// Render
import { createTextureAtlas } from './render/textures/TextureAtlas.js';
import { createTerrainMaterial } from './render/materials/TerrainMaterial.js';
import { createWaterMaterial, updateWaterOpacity } from './render/materials/WaterMaterial.js';
import { buildChunkMesh, disposeChunkGeometry } from './render/meshing/ChunkMesher.js';
import { DayNightCycle } from './render/sky/DayNightCycle.js';
import { createTorchViewmodel } from './render/models/TorchModel.js';

// UI
import { UIManager } from './ui/UIManager.js';

// Persistence
import { WorldStorage } from './persistence/WorldStorage.js';

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
        this.playerAnimation = null;
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
        this.settings = loadSettings();
        this.activeProfileName = this.loadActiveProfile();
        this.customProfile = this.loadCustomProfile();
        this.bindings = { ...DEFAULT_BINDINGS };

        // Persistence
        this.worldStorage = new WorldStorage();
        this.activeWorldName = null;

        // Stats
        this.stats = {
            fps: 0,
            frameCount: 0,
            lastFpsUpdate: 0,
            totalFaces: 0
        };

        // Third-person camera state
        this.isThirdPerson = false;
        this.thirdPersonOrbitYaw = 0;
        this.thirdPersonOrbitPitch = 0;
        this.thirdPersonDistance = 4.0;
        this.thirdPersonDistanceMin = 2.0;
        this.thirdPersonDistanceMax = 8.0;
        this.thirdPersonHeight = 2.5;
        this.thirdPersonLookHeight = 1.2;
        this.thirdPersonCamBuffer = 0.3;
        this.thirdPersonPitchMin = -Math.PI / 3;
        this.thirdPersonPitchMax = Math.PI / 3;
        this.thirdPersonSmoothFactor = 0.15;

        // Third-person camera scratch vectors
        this._thirdPersonCamDesired = new THREE.Vector3();
        this._thirdPersonPlayerPos = new THREE.Vector3();
        this._thirdPersonRayDir = new THREE.Vector3();
        this._thirdPersonSmoothPos = new THREE.Vector3();
        this._thirdPersonSmoothInitialized = false;

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

        // Initialize persistence
        await this.worldStorage.init();
        await this.refreshWorldCards();

        // Initialize viewmodels
        this.initViewmodels();

        // Apply settings to systems after initialization
        this.applySettingsToSystems();

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
        this.renderer.setPixelRatio(this.getPixelRatio());
        this.renderer.setClearColor(this.settings.daySkyBottom ?? 0x87CEEB);
        this.renderer.shadowMap.enabled = Boolean(this.settings.shadows);
        this.container.appendChild(this.renderer.domElement);
    }

    /**
     * Initialize Three.js scene
     */
    initScene() {
        this.scene = new THREE.Scene();
        if (this.settings.fog) {
            this.scene.fog = new THREE.Fog(
                this.settings.fogColor ?? 0x87CEEB,
                10,
                this.settings.renderDistance * CHUNK_SIZE
            );
        }

        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0xffffff, this.settings.ambientIntensity ?? 0.4);
        this.scene.add(this.ambientLight);

        // Directional light (sun)
        this.sunLight = new THREE.DirectionalLight(this.settings.sunColor ?? 0xffffff, this.settings.sunIntensity ?? 0.8);
        this.sunLight.position.set(100, 200, 100);
        this.sunLight.castShadow = Boolean(this.settings.shadows);
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
            this.getCameraFar()
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
        this.waterMaterial = createWaterMaterial(this.textureAtlas, {
            opacity: this.settings.waterOpacity ?? 0.7
        });
        if (this.waterMaterial.color) {
            this.waterMaterial.color.setHex(this.settings.waterColor ?? 0xffffff);
        }
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
        if (e.code === this.bindings.toggleThirdPerson) {
            this.toggleThirdPerson();
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

        if (e.code === this.bindings.crouch) {
            if (this.playerController && !this.playerController.isFlying && !this.playerController.isSwimming) {
                this.playerController.toggleCrouch();
            }
        }

        if (this.isThirdPerson) {
            if (e.code === this.bindings.cameraZoomOut || e.code === 'NumpadSubtract') {
                this.adjustThirdPersonDistance(0.5);
            }
            if (e.code === this.bindings.cameraZoomIn || e.code === 'NumpadAdd') {
                this.adjustThirdPersonDistance(-0.5);
            }
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
            onNewWorld: ({ name, seed }) => this.startNewWorld(seed, name),
            onLoadWorld: (saveName) => this.loadWorld(saveName),
            onSave: (name) => this.saveWorld(name),
            onLoad: () => this.uiManager.setState('mainMenu'),
            onSettingChange: (key, value) => this.updateSetting(key, value),
            onBlockSelect: (blockId) => {
                this.selectedBlock = blockId;
            },
            onDeleteWorld: async (name) => {
                if (!name) return;
                if (!confirm(`Delete world "${name}"? This cannot be undone.`)) return;
                await this.worldStorage.deleteWorld(name);
                if (this.activeWorldName === name) this.activeWorldName = null;
                await this.refreshWorldCards();
                this.uiManager.showToast(`Deleted "${name}"`, 'success');
            },
            onRenameWorld: async (oldName, newName) => {
                const trimmed = newName.trim();
                if (!trimmed) {
                    this.uiManager.showToast('Please enter a valid name', 'warning');
                    return false;
                }
                if (this.worldStorage.getIndex().includes(trimmed)) {
                    this.uiManager.showToast('A world with that name already exists', 'error');
                    return false;
                }
                const success = this.worldStorage.renameWorld(oldName, trimmed);
                if (success) {
                    if (this.activeWorldName === oldName) this.activeWorldName = trimmed;
                    await this.refreshWorldCards();
                    this.uiManager.showToast(`Renamed to "${trimmed}"`, 'success');
                } else {
                    this.uiManager.showToast('World not found', 'error');
                }
                return success;
            },
            onDuplicateWorld: async (sourceName, newName) => {
                const trimmed = newName.trim();
                if (!trimmed) {
                    this.uiManager.showToast('Please enter a valid name', 'warning');
                    return false;
                }
                if (this.worldStorage.getIndex().includes(trimmed)) {
                    this.uiManager.showToast('A world with that name already exists', 'error');
                    return false;
                }
                const success = this.worldStorage.duplicateWorld(sourceName, trimmed);
                if (success) {
                    await this.refreshWorldCards();
                    this.uiManager.showToast(`Created "${trimmed}"`, 'success');
                } else {
                    this.uiManager.showToast('Source world not found', 'error');
                }
                return success;
            },
            onClearWorldCache: async (name) => {
                const metadata = this.worldStorage.loadMetadata(name);
                if (!metadata?.seed) {
                    this.uiManager.showToast('No chunks to clear', 'info');
                    return;
                }
                if (!confirm(`Clear all cached chunks for "${name}"?\n\nThe world can be regenerated from its seed, but any manually placed/removed blocks will be lost.`)) {
                    return;
                }
                const deletedCount = await this.worldStorage.clearChunksForSeed(metadata.seed.toString());
                this.uiManager.showToast(`Cleared ${deletedCount} chunks`, 'success');
            },
            onExportWorld: async (name) => {
                const blob = await this.worldStorage.exportWorld(name);
                if (!blob) {
                    this.uiManager.showToast('World not found', 'error');
                } else {
                    this.uiManager.showToast(`Exported "${name}"`, 'success');
                }
                return blob;
            },
            onImportWorld: async (file) => {
                try {
                    const result = await this.worldStorage.importWorld(file);
                    if (result) {
                        await this.refreshWorldCards();
                        this.uiManager.showToast(`Imported "${result.name}" (${result.chunkCount} chunks)`, 'success');
                    }
                } catch (error) {
                    console.error('[Game] Import failed:', error);
                    this.uiManager.showToast(`Failed to import world: ${error.message}`, 'error');
                }
            },
            onWorldStorageInfo: (name) => this.worldStorage.getWorldStorageInfo(name),
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
     * Initialize torch viewmodel
     */
    initViewmodels() {
        this.torchViewmodel = createTorchViewmodel({
            lightIntensity: this.settings.torchIntensity ?? 1,
            lightDistance: this.settings.torchRange ?? 10,
            lightColor: this.settings.torchColor ?? 0xff6600
        });
        this.torchViewmodel.visible = false;
        this.torchViewmodel.position.set(0.35, -0.35, -0.5);
        this.camera.add(this.torchViewmodel);
        this.scene.add(this.camera);
    }

    /**
     * Refresh world cards in the main menu
     */
    async refreshWorldCards() {
        if (!this.uiManager) return;
        const worlds = this.worldStorage.listWorlds();
        const totalBytes = await this.worldStorage.getTotalStorageBytes();
        this.uiManager.updateWorldCards(worlds, totalBytes);
    }

    /**
     * Start a new world with given seed
     * @param {string} seed
     * @param {string} [worldName]
     */
    async startNewWorld(seed, worldName = 'New World') {
        const resolvedSeed = seed || Math.random().toString(36).substring(7);
        console.log(`%c[Game] Starting new world with seed: ${resolvedSeed}`, 'color: #2196F3');
        this.activeWorldName = worldName;
        await this.initializeWorld(resolvedSeed);
    }

    /**
     * Initialize world state for new or loaded worlds
     * @param {string} seed
     * @param {Object} [playerState]
     * @param {{x: number, y: number, z: number}} [cameraRot]
     */
    async initializeWorld(seed, playerState = null, cameraRot = null) {
        this.state.seed = seed;
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
        this.playerAnimation = new PlayerAnimation();
        this.camera.position.set(0, spawnY, 0);

        if (playerState) {
            this.playerController.setState(playerState);
        }

        // Initialize entity manager
        this.entityManager = new EntityManager();

        // Update camera orientation before positioning
        if (cameraRot) {
            this.camera.rotation.set(cameraRot.x, cameraRot.y, cameraRot.z);
        }

        const eyePos = this.playerController.getEyePosition();
        this.camera.position.set(eyePos.x, eyePos.y, eyePos.z);

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
                if (!this.chunks.has(getChunkKey(dx, dz))) {
                    await this.loadChunkAsync(dx, dz);
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
     * Queue a chunk load
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     */
    queueChunkLoad(cx, cz) {
        const key = getChunkKey(cx, cz);

        if (this.chunks.has(key) || this.chunksLoading.has(key)) {
            return;
        }

        this.chunksLoading.add(key);
        this.loadChunkAsync(cx, cz).catch((error) => {
            console.error('[Game] Failed to load chunk:', error);
        });
    }

    /**
     * Load a single chunk from cache or generate it.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     */
    async loadChunkAsync(cx, cz) {
        const key = getChunkKey(cx, cz);

        if (this.chunks.has(key)) {
            this.chunksLoading.delete(key);
            return;
        }

        const wasLoading = this.chunksLoading.has(key);
        if (!wasLoading) {
            this.chunksLoading.add(key);
        }
        let chunkData = null;
        try {
            if (this.worldStorage.isReady()) {
                chunkData = await this.worldStorage.loadChunk(key, this.state.seed);
            }

            if (!chunkData) {
                chunkData = this.chunkGenerator.generateChunk(cx, cz);
                calculateChunkSunlight(
                    chunkData,
                    CHUNK_SIZE,
                    CHUNK_HEIGHT,
                    BlockLookups.IS_TRANSPARENT,
                    BlockLookups.SUNLIGHT_ATTENUATION
                );
            } else {
                chunkData.cx = cx;
                chunkData.cz = cz;
                chunkData.startX = cx * CHUNK_SIZE;
                chunkData.startZ = cz * CHUNK_SIZE;
                chunkData.generated = true;
                chunkData.lit = true;
                chunkData.meshed = false;
                chunkData.modified = false;
            }

            this.chunks.set(key, chunkData);

            // Build mesh
            this.buildChunkMeshes(cx, cz, chunkData);

            if (!chunkData.modified && this.worldStorage.isReady()) {
                this.worldStorage.saveChunk(key, chunkData, this.state.seed).catch(() => {});
            }
        } finally {
            this.chunksLoading.delete(key);
        }
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
            this.renderer.render(this.scene, this.camera);
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

        // Render
        this.renderer.render(this.scene, this.camera);
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
        const crouchKeyDown = this.inputManager.isKeyDown(this.bindings.crouch);
        this._playerInput.crouch = this.playerController?.isFlying ? crouchKeyDown : false;
        this._playerInput.sprint = this.inputManager.isKeyDown(this.bindings.sprint);
    }

    /**
     * Update player physics
     * @param {number} delta
     */
    updatePlayer(delta) {
        if (!this.playerController) return;

        // Sync yaw/pitch from camera or third-person orbit
        if (this.isThirdPerson) {
            this.playerController.yaw = this.thirdPersonOrbitYaw;
            this.playerController.pitch = this.thirdPersonOrbitPitch;
        } else {
            const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
            this.playerController.yaw = euler.y;
            this.playerController.pitch = euler.x;
        }

        // Process input
        this.playerController.processInput(this._playerInput, delta);

        // Apply gravity
        this.playerController.applyGravity(delta);

        // Update player state
        this.playerController.update(delta);

        // Move with collision
        this.movePlayerWithCollision(delta);

        // Update animation state
        if (this.playerAnimation) {
            this.playerAnimation.update(this.playerController, delta);
            const headPitch = this.isThirdPerson ? this.thirdPersonOrbitPitch : this.playerController.pitch;
            this.playerAnimation.setHeadLook(headPitch, 0);
        }

        // Sync camera
        if (this.isThirdPerson) {
            this.updateThirdPersonOrbit(delta);
            this.updateThirdPersonCamera(delta);
        } else {
            const eyePos = this.playerController.getEyePosition();
            this.camera.position.set(eyePos.x, eyePos.y, eyePos.z);
        }

        // Update FOV for sprint
        const targetFov = this.playerController.isSprinting
            ? (this.settings.sprintFOV || 80)
            : (this.settings.normalFOV || 75);
        this.camera.fov += (targetFov - this.camera.fov) * 0.1;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Toggle third-person camera mode
     */
    toggleThirdPerson() {
        if (!this.camera) return;

        this.isThirdPerson = !this.isThirdPerson;
        if (this.isThirdPerson) {
            const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
            this.thirdPersonOrbitYaw = euler.y;
            this.thirdPersonOrbitPitch = 0.2;
            this.thirdPersonDistance = 4.0;
            this._thirdPersonSmoothInitialized = false;
            this.inputManager?.consumeMouseDelta();
        } else {
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.set(0, this.thirdPersonOrbitYaw, 0);
        }

        this.syncTorchVisibility();
    }

    /**
     * Adjust third-person camera distance
     * @param {number} delta
     */
    adjustThirdPersonDistance(delta) {
        this.thirdPersonDistance = Math.min(
            this.thirdPersonDistanceMax,
            Math.max(this.thirdPersonDistanceMin, this.thirdPersonDistance + delta)
        );
        this._thirdPersonSmoothInitialized = false;
    }

    /**
     * Update third-person orbit angles from mouse input
     * @param {number} dt
     */
    updateThirdPersonOrbit(dt) {
        if (!this.controls?.isLocked || !this.inputManager) return;

        const mouseDelta = this.inputManager.consumeMouseDelta();
        const sensitivity = 0.002;
        this.thirdPersonOrbitYaw -= mouseDelta.x * sensitivity;
        this.thirdPersonOrbitPitch += mouseDelta.y * sensitivity;
        this.thirdPersonOrbitPitch = Math.max(
            this.thirdPersonPitchMin,
            Math.min(this.thirdPersonPitchMax, this.thirdPersonOrbitPitch)
        );
    }

    /**
     * Update third-person camera position and rotation
     * @param {number} dt
     */
    updateThirdPersonCamera(dt) {
        if (!this.playerController) return;

        const playerPos = this.playerController.position;
        const orbitYaw = this.thirdPersonOrbitYaw;
        const orbitPitch = this.thirdPersonOrbitPitch;
        const desiredDist = this.thirdPersonDistance;
        const heightOffset = this.thirdPersonHeight - PLAYER_PHYSICS.eyeHeightStand;
        const horizontalDist = desiredDist * Math.cos(orbitPitch);
        const verticalOffset = desiredDist * Math.sin(orbitPitch) + heightOffset;

        let desiredCamX = Math.sin(orbitYaw) * horizontalDist;
        const desiredCamY = verticalOffset;
        let desiredCamZ = Math.cos(orbitYaw) * horizontalDist;

        const behindFactor = Math.max(0, Math.cos(orbitYaw));
        const shoulderOffset = 0.5 * behindFactor;
        const rightX = -Math.cos(orbitYaw);
        const rightZ = Math.sin(orbitYaw);
        desiredCamX += rightX * shoulderOffset;
        desiredCamZ += rightZ * shoulderOffset;

        const actualDist = this.getThirdPersonCameraDistance(
            playerPos,
            desiredCamX,
            desiredCamY,
            desiredCamZ,
            desiredDist
        );
        const distRatio = actualDist / desiredDist;
        const camX = desiredCamX * distRatio;
        const camY = desiredCamY * distRatio;
        const camZ = desiredCamZ * distRatio;

        if (!this._thirdPersonSmoothInitialized) {
            this._thirdPersonSmoothPos.set(camX, camY, camZ);
            this._thirdPersonSmoothInitialized = true;
        } else {
            this._thirdPersonSmoothPos.x += (camX - this._thirdPersonSmoothPos.x) * this.thirdPersonSmoothFactor;
            this._thirdPersonSmoothPos.y += (camY - this._thirdPersonSmoothPos.y) * this.thirdPersonSmoothFactor;
            this._thirdPersonSmoothPos.z += (camZ - this._thirdPersonSmoothPos.z) * this.thirdPersonSmoothFactor;
        }

        this.camera.position.set(
            playerPos.x + this._thirdPersonSmoothPos.x,
            playerPos.y + this._thirdPersonSmoothPos.y,
            playerPos.z + this._thirdPersonSmoothPos.z
        );

        const lookY = playerPos.y + this.thirdPersonLookHeight;
        const dx = playerPos.x - this.camera.position.x;
        const dz = playerPos.z - this.camera.position.z;
        const dy = lookY - this.camera.position.y;
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);
        const lookYaw = Math.atan2(dx, dz);
        const lookPitch = Math.atan2(dy, distToPlayer);

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(lookPitch, lookYaw, 0);
    }

    /**
     * Determine camera distance to avoid terrain clipping
     * @param {{x: number, y: number, z: number}} playerPos
     * @param {number} camX
     * @param {number} camY
     * @param {number} camZ
     * @param {number} originalDist
     * @returns {number}
     */
    getThirdPersonCameraDistance(playerPos, camX, camY, camZ, originalDist) {
        this._thirdPersonCamDesired.set(
            playerPos.x + camX,
            playerPos.y + camY,
            playerPos.z + camZ
        );

        this._thirdPersonPlayerPos.set(
            playerPos.x,
            playerPos.y + this.thirdPersonLookHeight,
            playerPos.z
        );

        this._thirdPersonRayDir
            .subVectors(this._thirdPersonCamDesired, this._thirdPersonPlayerPos)
            .normalize();

        const stepSize = 0.25;
        const maxSteps = Math.ceil(originalDist / stepSize);

        for (let i = 1; i <= maxSteps; i++) {
            const t = i * stepSize;
            const checkX = Math.floor(this._thirdPersonPlayerPos.x + this._thirdPersonRayDir.x * t);
            const checkY = Math.floor(this._thirdPersonPlayerPos.y + this._thirdPersonRayDir.y * t);
            const checkZ = Math.floor(this._thirdPersonPlayerPos.z + this._thirdPersonRayDir.z * t);

            if (this.isSolidBlock(checkX, checkY, checkZ)) {
                return Math.max(0.5, t - this.thirdPersonCamBuffer);
            }
        }

        return originalDist;
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
        this.applyLightingSettings();
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
                    this.queueChunkLoad(cx, cz);
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

            const chunk = this.chunks.get(key);
            if (chunk?.modified && this.worldStorage.isReady()) {
                this.worldStorage.saveChunk(key, chunk, this.state.seed).catch(() => {});
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
        this.syncTorchVisibility();
    }

    /**
     * Sync torch viewmodel visibility with camera mode
     */
    syncTorchVisibility() {
        if (!this.torchViewmodel) return;
        this.torchViewmodel.visible = this.torchVisible && !this.isThirdPerson;
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(this.getPixelRatio());
    }

    /**
     * Get renderer pixel ratio based on settings
     * @returns {number}
     */
    getPixelRatio() {
        const ratio = this.settings.pixelRatio ?? 1;
        return Math.min(window.devicePixelRatio * ratio, 2);
    }

    /**
     * Get camera far plane distance
     * @returns {number}
     */
    getCameraFar() {
        return Math.max(200, (this.settings.renderDistance + 2) * CHUNK_SIZE);
    }

    /**
     * Load custom profile from storage
     * @returns {Object}
     */
    loadCustomProfile() {
        if (typeof localStorage === 'undefined') {
            return { ...DEFAULTS };
        }
        try {
            const stored = JSON.parse(localStorage.getItem('voxex_custom_profile') || 'null');
            return stored || { ...DEFAULTS };
        } catch (e) {
            console.warn('[Game] Failed to load custom profile:', e);
            return { ...DEFAULTS };
        }
    }

    /**
     * Load active profile name from storage
     * @returns {string|null}
     */
    loadActiveProfile() {
        if (typeof localStorage === 'undefined') {
            return null;
        }
        return localStorage.getItem('voxex_active_profile');
    }

    /**
     * Save current settings as custom profile
     */
    saveCustomProfile() {
        this.customProfile = {};
        const profileKeys = Object.keys(SETTINGS_PROFILES.balanced ?? {});
        profileKeys.forEach((key) => {
            if (key in this.settings) {
                this.customProfile[key] = this.settings[key];
            }
        });
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('voxex_custom_profile', JSON.stringify(this.customProfile));
        }
        this.applySettingsProfile('custom');
    }

    /**
     * Apply a settings profile
     * @param {string} profileName
     */
    applySettingsProfile(profileName) {
        const profile = profileName === 'custom' ? this.customProfile : SETTINGS_PROFILES[profileName];
        if (!profile) return;

        Object.entries(profile).forEach(([key, value]) => {
            if (key in this.settings) {
                this.settings[key] = value;
            }
        });

        this.activeProfileName = profileName;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('voxex_active_profile', profileName);
        }

        this.applySettingsToSystems();
        saveSettings(this.settings);
    }

    /**
     * Apply settings to all systems
     */
    applySettingsToSystems() {
        this.applyRendererSettings();
        this.applySceneSettings();
        this.applyCameraSettings();
        this.applyDayNightSettings();
        this.applyLightingSettings();
        this.applyMaterialSettings();
        this.applyViewmodelSettings();
    }

    /**
     * Apply renderer-related settings
     */
    applyRendererSettings() {
        if (!this.renderer) return;
        this.renderer.setPixelRatio(this.getPixelRatio());
        this.renderer.shadowMap.enabled = Boolean(this.settings.shadows);
    }

    /**
     * Apply scene-related settings
     */
    applySceneSettings() {
        if (!this.scene) return;

        if (this.settings.fog) {
            if (!this.scene.fog) {
                this.scene.fog = new THREE.Fog(
                    this.settings.fogColor ?? 0x87CEEB,
                    10,
                    this.settings.renderDistance * CHUNK_SIZE
                );
            }
            this.scene.fog.color.setHex(this.settings.fogColor ?? 0x87CEEB);
            this.scene.fog.far = this.settings.renderDistance * CHUNK_SIZE;
        } else {
            this.scene.fog = null;
        }
    }

    /**
     * Apply camera-related settings
     */
    applyCameraSettings() {
        if (!this.camera) return;
        this.camera.fov = this.settings.normalFOV || 75;
        this.camera.far = this.getCameraFar();
        this.camera.updateProjectionMatrix();
    }

    /**
     * Apply day/night settings
     */
    applyDayNightSettings() {
        if (!this.dayNightCycle) return;
        this.dayNightCycle.setDayLength(this.settings.dayLength || 1200);
    }

    /**
     * Apply lighting-related settings
     */
    applyLightingSettings() {
        if (!this.ambientLight || !this.sunLight) return;

        const baseAmbient = this.dayNightCycle?.getAmbientIntensity() ?? 0.4;
        const baseSun = this.dayNightCycle?.sunIntensity ?? 0.8;

        this.ambientLight.intensity = baseAmbient * (this.settings.ambientIntensity ?? 1);
        this.sunLight.intensity = baseSun * (this.settings.sunIntensity ?? 1);
        this.sunLight.color.setHex(this.settings.sunColor ?? 0xffffff);
    }

    /**
     * Apply material-related settings
     */
    applyMaterialSettings() {
        if (this.waterMaterial) {
            updateWaterOpacity(this.waterMaterial, this.settings.waterOpacity ?? 0.7);
            if (this.waterMaterial.color) {
                this.waterMaterial.color.setHex(this.settings.waterColor ?? 0xffffff);
            }
        }
    }

    /**
     * Apply viewmodel-related settings
     */
    applyViewmodelSettings() {
        const torchLight = this.torchViewmodel?.userData?.light;
        if (torchLight) {
            torchLight.intensity = this.settings.torchIntensity ?? torchLight.intensity;
            torchLight.distance = this.settings.torchRange ?? torchLight.distance;
            torchLight.color.setHex(this.settings.torchColor ?? 0xff6600);
        }
    }

    /**
     * Rebuild materials for texture resolution changes
     */
    rebuildMaterials() {
        const atlasResult = createTextureAtlas(this.settings.textureResolution || 16);
        const oldAtlas = this.textureAtlas;
        const oldTerrain = this.terrainMaterial;
        const oldWater = this.waterMaterial;

        this.textureAtlas = atlasResult.texture;
        this.terrainMaterial = createTerrainMaterial(this.textureAtlas, {
            useStandardMaterial: true
        });
        this.waterMaterial = createWaterMaterial(this.textureAtlas, {
            opacity: this.settings.waterOpacity ?? 0.7
        });
        if (this.waterMaterial.color) {
            this.waterMaterial.color.setHex(this.settings.waterColor ?? 0xffffff);
        }

        this.solidMeshes.forEach(mesh => {
            mesh.material = this.terrainMaterial;
        });
        this.waterMeshes.forEach(mesh => {
            mesh.material = this.waterMaterial;
        });

        oldTerrain?.dispose();
        oldWater?.dispose();
        oldAtlas?.dispose();
    }

    /**
     * Update a setting
     * @param {string} key
     * @param {*} value
     */
    updateSetting(key, value) {
        this.settings[key] = value;

        switch (key) {
            case 'normalFOV':
                this.applyCameraSettings();
                break;
            case 'renderDistance':
                this.applySceneSettings();
                this.applyCameraSettings();
                break;
            case 'fog':
            case 'fogColor':
                this.applySceneSettings();
                break;
            case 'antialiasing':
                console.warn('[Game] Antialiasing changes require a full reload to take effect.');
                break;
            case 'pixelRatio':
                this.applyRendererSettings();
                break;
            case 'textureResolution':
                this.rebuildMaterials();
                break;
            case 'waterOpacity':
            case 'waterColor':
                this.applyMaterialSettings();
                break;
            case 'sunColor':
            case 'sunIntensity':
            case 'ambientIntensity':
                this.applyLightingSettings();
                break;
            case 'torchColor':
            case 'torchIntensity':
            case 'torchRange':
                this.applyViewmodelSettings();
                break;
            case 'dayLength':
                this.applyDayNightSettings();
                break;
            default:
                break;
        }

        saveSettings(this.settings);
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
     * Save world
     * @param {string} [saveName]
     */
    async saveWorld(saveName) {
        const name = (saveName || this.activeWorldName || 'AutoSave').trim();
        if (!name) return;

        const seedToSave = this.state.seed?.toString() || Math.random().toString(36).substring(7);
        const playerState = this.playerController?.getState?.() || null;
        const cameraRot = {
            x: this.camera.rotation.x,
            y: this.camera.rotation.y,
            z: this.camera.rotation.z
        };

        const metadata = {
            seed: seedToSave,
            player: {
                state: playerState,
                cameraRot
            },
            timestamp: Date.now(),
            version: 2,
            thumbnail: this.captureWorldThumbnail()
        };

        try {
            this.worldStorage.saveMetadata(name, metadata);
            await this.worldStorage.batchSaveChunks(this.chunks, seedToSave);
            this.activeWorldName = name;
            await this.refreshWorldCards();
            this.uiManager?.showToast(`World "${name}" saved!`, 'success');
        } catch (error) {
            console.error('[Game] Failed to save world:', error);
            this.uiManager?.showToast(`Save failed: ${error.message}`, 'error');
        }
    }

    /**
     * Load world
     * @param {string} [saveName]
     */
    async loadWorld(saveName) {
        const name = saveName || this.activeWorldName;
        if (!name) {
            this.uiManager?.showToast('Select a world to load.', 'warning');
            return;
        }

        const metadata = this.worldStorage.loadMetadata(name);
        if (!metadata) {
            this.uiManager?.showToast('Save file not found!', 'error');
            return;
        }

        const seed = metadata.seed?.toString() || name;
        const playerState = metadata.player?.state || null;
        const cameraRot = metadata.player?.cameraRot || null;
        this.activeWorldName = name;

        await this.initializeWorld(seed, playerState, cameraRot);
    }

    /**
     * Capture a thumbnail for the current world.
     * @returns {string|null}
     */
    captureWorldThumbnail() {
        if (!this.renderer?.domElement) return null;
        try {
            const thumbWidth = 120;
            const thumbHeight = 80;
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = thumbWidth;
            thumbCanvas.height = thumbHeight;
            const ctx = thumbCanvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(this.renderer.domElement, 0, 0, thumbWidth, thumbHeight);
            return thumbCanvas.toDataURL('image/jpeg', 0.7);
        } catch (error) {
            console.warn('[Game] Failed to capture thumbnail:', error);
            return null;
        }
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

        // Dispose renderer
        this.renderer?.dispose();

        // Dispose UI
        this.uiManager?.dispose();
    }
}

export default Game;

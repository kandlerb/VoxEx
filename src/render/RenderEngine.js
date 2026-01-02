/**
 * Main render engine - orchestrates all rendering subsystems
 * @module render/RenderEngine
 */

import * as THREE from 'three';
import { createTextureAtlas, createRoughnessMap } from './textures/TextureAtlas.js';
import { createTerrainMaterial, createFastTerrainMaterial } from './materials/TerrainMaterial.js';
import { createWaterMaterial, createFastWaterMaterial } from './materials/WaterMaterial.js';
import { DayNightCycle } from './sky/DayNightCycle.js';
import { PostProcessingManager } from './effects/PostProcessing.js';
import { buildChunkMesh, disposeChunkGeometry } from './meshing/ChunkMesher.js';
import { createTorchViewmodel, updateTorchFlicker, disposeTorchMaterials } from './models/TorchModel.js';
import { CHUNK_SIZE } from '../config/WorldConfig.js';

/**
 * @typedef {Object} RenderEngineOptions
 * @property {number} [fov=75] - Field of view
 * @property {number} [near=0.1] - Near clipping plane
 * @property {number} [far=1000] - Far clipping plane
 * @property {boolean} [antialias=true] - Enable antialiasing
 * @property {number} [pixelRatio] - Pixel ratio (defaults to device pixel ratio)
 * @property {number} [textureResolution=16] - Texture resolution (16, 32, or 64)
 * @property {boolean} [useStandardMaterial=true] - Use PBR materials
 * @property {boolean} [enablePostProcessing=true] - Enable post-processing
 * @property {number} [dayLengthSeconds=600] - Day length in seconds
 */

/**
 * Main render engine
 */
export class RenderEngine {
    /**
     * @param {HTMLElement} container - DOM container for the canvas
     * @param {RenderEngineOptions} [options={}] - Engine options
     */
    constructor(container, options = {}) {
        const {
            fov = 75,
            near = 0.1,
            far = 1000,
            antialias = true,
            pixelRatio = window.devicePixelRatio,
            textureResolution = 16,
            useStandardMaterial = true,
            enablePostProcessing = true,
            dayLengthSeconds = 600,
        } = options;

        /**
         * Container element
         * @type {HTMLElement}
         */
        this.container = container;

        /**
         * WebGL renderer
         * @type {THREE.WebGLRenderer}
         */
        this.renderer = new THREE.WebGLRenderer({
            antialias,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.shadowMap.enabled = false;
        container.appendChild(this.renderer.domElement);

        /**
         * Main scene
         * @type {THREE.Scene}
         */
        this.scene = new THREE.Scene();

        /**
         * Main camera
         * @type {THREE.PerspectiveCamera}
         */
        this.camera = new THREE.PerspectiveCamera(
            fov,
            container.clientWidth / container.clientHeight,
            near,
            far
        );

        /**
         * Texture atlas
         * @type {{texture: THREE.CanvasTexture, canvas: HTMLCanvasElement}}
         */
        this._textureAtlas = createTextureAtlas(textureResolution);

        /**
         * Roughness map
         * @type {THREE.CanvasTexture}
         */
        this._roughnessMap = useStandardMaterial ? createRoughnessMap(textureResolution * 4) : null;

        /**
         * Terrain material
         * @type {THREE.Material}
         */
        this.terrainMaterial = useStandardMaterial
            ? createTerrainMaterial(this._textureAtlas.texture, { roughnessMap: this._roughnessMap })
            : createFastTerrainMaterial(this._textureAtlas.texture);

        /**
         * Water material
         * @type {THREE.Material}
         */
        this.waterMaterial = useStandardMaterial
            ? createWaterMaterial(this._textureAtlas.texture)
            : createFastWaterMaterial(this._textureAtlas.texture);

        /**
         * Day/night cycle
         * @type {DayNightCycle}
         */
        this.dayNightCycle = new DayNightCycle({ dayLengthSeconds });

        /**
         * Post-processing manager
         * @type {PostProcessingManager|null}
         */
        this.postProcessing = enablePostProcessing
            ? new PostProcessingManager(this.renderer, this.scene, this.camera)
            : null;

        /**
         * Chunk meshes map (chunkKey -> {terrain: Mesh, water: Mesh})
         * @type {Map<string, {terrain: THREE.Mesh|null, water: THREE.Mesh|null}>}
         */
        this.chunkMeshes = new Map();

        /**
         * Ambient light
         * @type {THREE.AmbientLight}
         */
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);

        /**
         * Sun directional light
         * @type {THREE.DirectionalLight}
         */
        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.sunLight.position.set(100, 100, 50);
        this.scene.add(this.sunLight);

        /**
         * Moon directional light
         * @type {THREE.DirectionalLight}
         */
        this.moonLight = new THREE.DirectionalLight(0x6677aa, 0.1);
        this.moonLight.position.set(-100, 100, -50);
        this.scene.add(this.moonLight);

        /**
         * Torch viewmodel
         * @type {THREE.Group|null}
         */
        this.torchViewmodel = null;

        /**
         * Total face count (for stats)
         * @type {number}
         */
        this.totalFaceCount = 0;

        // Initialize scene
        this._initScene();
    }

    /**
     * Initialize scene settings
     * @private
     */
    _initScene() {
        // Apply initial day/night colors
        this.dayNightCycle.applyToScene(
            this.scene,
            this.ambientLight,
            this.sunLight,
            this.moonLight
        );

        // Add fog
        const colors = this.dayNightCycle.getColors();
        this.scene.fog = new THREE.Fog(colors.fog, 50, 400);
    }

    /**
     * Update render engine (call each frame)
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        // Update day/night cycle
        this.dayNightCycle.update(dt);

        // Apply colors to scene
        this.dayNightCycle.applyToScene(
            this.scene,
            this.ambientLight,
            this.sunLight,
            this.moonLight
        );

        // Update torch flicker if active
        if (this.torchViewmodel && this.torchViewmodel.visible) {
            updateTorchFlicker(this.torchViewmodel, performance.now());
        }
    }

    /**
     * Render a frame
     */
    render() {
        if (this.postProcessing && this.postProcessing.hasActiveEffects()) {
            this.postProcessing.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Add a chunk mesh to the scene
     * @param {string} key - Chunk key
     * @param {Object} chunk - Chunk data
     * @param {number} chunkX - Chunk X coordinate
     * @param {number} chunkZ - Chunk Z coordinate
     * @param {Function} getNeighborBlock - Function to get neighbor blocks
     * @param {Function} [getLight] - Function to get light levels
     * @returns {{solidFaceCount: number, waterFaceCount: number}}
     */
    addChunkMesh(key, chunk, chunkX, chunkZ, getNeighborBlock, getLight) {
        // Remove existing mesh if any
        this.removeChunkMesh(key);

        // Build mesh
        const { solidGeometry, waterGeometry, solidFaceCount, waterFaceCount } =
            buildChunkMesh(chunk, chunkX, chunkZ, getNeighborBlock, getLight);

        const meshes = { terrain: null, water: null };

        // Create solid mesh
        if (solidFaceCount > 0) {
            const solidMesh = new THREE.Mesh(solidGeometry, this.terrainMaterial);
            solidMesh.name = `CHUNK_${key}`;
            solidMesh.frustumCulled = true;
            solidMesh.matrixAutoUpdate = false;
            solidMesh.updateMatrix();
            this.scene.add(solidMesh);
            meshes.terrain = solidMesh;
        }

        // Create water mesh
        if (waterFaceCount > 0) {
            const waterMesh = new THREE.Mesh(waterGeometry, this.waterMaterial);
            waterMesh.name = `CHUNK_WATER_${key}`;
            waterMesh.frustumCulled = true;
            waterMesh.renderOrder = 1; // Render after opaque
            waterMesh.matrixAutoUpdate = false;
            waterMesh.updateMatrix();
            this.scene.add(waterMesh);
            meshes.water = waterMesh;
        }

        this.chunkMeshes.set(key, meshes);
        this.totalFaceCount += solidFaceCount + waterFaceCount;

        return { solidFaceCount, waterFaceCount };
    }

    /**
     * Remove a chunk mesh from the scene
     * @param {string} key - Chunk key
     */
    removeChunkMesh(key) {
        const meshes = this.chunkMeshes.get(key);
        if (!meshes) return;

        if (meshes.terrain) {
            this.scene.remove(meshes.terrain);
            disposeChunkGeometry(meshes.terrain.geometry);
        }

        if (meshes.water) {
            this.scene.remove(meshes.water);
            disposeChunkGeometry(meshes.water.geometry);
        }

        this.chunkMeshes.delete(key);
    }

    /**
     * Check if a chunk mesh exists
     * @param {string} key - Chunk key
     * @returns {boolean}
     */
    hasChunkMesh(key) {
        return this.chunkMeshes.has(key);
    }

    /**
     * Get the number of loaded chunk meshes
     * @returns {number}
     */
    getChunkMeshCount() {
        return this.chunkMeshes.size;
    }

    /**
     * Create and add torch viewmodel
     * @param {boolean} [visible=false] - Initial visibility
     * @returns {THREE.Group}
     */
    createTorchViewmodel(visible = false) {
        if (this.torchViewmodel) {
            this.scene.remove(this.torchViewmodel);
        }

        this.torchViewmodel = createTorchViewmodel();
        this.torchViewmodel.visible = visible;

        // Add to camera so it follows view
        this.camera.add(this.torchViewmodel);

        // Position viewmodel in view
        this.torchViewmodel.position.set(0.3, -0.25, -0.5);
        this.torchViewmodel.rotation.set(0, -0.2, 0.1);

        return this.torchViewmodel;
    }

    /**
     * Toggle torch visibility
     * @param {boolean} [visible] - Explicit visibility (or toggle if undefined)
     */
    toggleTorch(visible) {
        if (!this.torchViewmodel) {
            this.createTorchViewmodel(true);
            return;
        }

        this.torchViewmodel.visible = visible !== undefined ? visible : !this.torchViewmodel.visible;
    }

    /**
     * Set FOV
     * @param {number} fov - Field of view in degrees
     */
    setFOV(fov) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Enable/disable shadows
     * @param {boolean} enabled - Whether shadows are enabled
     */
    setShadows(enabled) {
        this.renderer.shadowMap.enabled = enabled;
        this.sunLight.castShadow = enabled;
    }

    /**
     * Handle window resize
     */
    resize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);

        if (this.postProcessing) {
            this.postProcessing.resize(width, height);
        }
    }

    /**
     * Get renderer info
     * @returns {Object}
     */
    getInfo() {
        return {
            render: this.renderer.info.render,
            memory: this.renderer.info.memory,
            programs: this.renderer.info.programs?.length ?? 0,
            chunkMeshes: this.chunkMeshes.size,
            totalFaces: this.totalFaceCount,
        };
    }

    /**
     * Get texture atlas
     * @returns {THREE.CanvasTexture}
     */
    getTextureAtlas() {
        return this._textureAtlas.texture;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Remove all chunk meshes
        for (const key of this.chunkMeshes.keys()) {
            this.removeChunkMesh(key);
        }

        // Dispose materials
        this.terrainMaterial.dispose();
        this.waterMaterial.dispose();

        // Dispose textures
        this._textureAtlas.texture.dispose();
        if (this._roughnessMap) {
            this._roughnessMap.dispose();
        }

        // Dispose torch
        if (this.torchViewmodel) {
            this.camera.remove(this.torchViewmodel);
            this.torchViewmodel = null;
        }
        disposeTorchMaterials();

        // Dispose post-processing
        if (this.postProcessing) {
            this.postProcessing.dispose();
        }

        // Dispose renderer
        this.renderer.dispose();

        // Remove canvas from DOM
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

export default RenderEngine;

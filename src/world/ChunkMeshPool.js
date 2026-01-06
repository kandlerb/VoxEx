/**
 * ChunkMeshPool - Object pooling for chunk meshes.
 * Reduces GC pressure by reusing Three.js mesh objects.
 * @module world/ChunkMeshPool
 */

import * as THREE from 'three';
import { CHUNK_SIZE } from '../config/WorldConfig.js';

// =====================================================
// MESH POOL CONFIGURATION
// =====================================================

/**
 * Default mesh pool configuration.
 * @type {Object}
 */
export const MESH_POOL_CONFIG = {
    /** Initial pool size for terrain meshes */
    terrainPoolSize: 64,
    /** Initial pool size for water meshes */
    waterPoolSize: 32,
    /** Bounding radius for chunk frustum culling */
    chunkBoundingRadius: CHUNK_SIZE * Math.SQRT2
};

// =====================================================
// CHUNK MESH POOL CLASS
// =====================================================

/**
 * ChunkMeshPool manages reusable Three.js mesh objects for chunks.
 * Separates terrain and water mesh pools.
 */
export class ChunkMeshPool {
    /**
     * Create a new ChunkMeshPool.
     * @param {THREE.Material} terrainMaterial - Material for terrain meshes
     * @param {THREE.Material} waterMaterial - Material for water meshes
     * @param {Object} [settings=null] - Settings object for frustum culling, shadows
     */
    constructor(terrainMaterial, waterMaterial, settings = null) {
        /** @type {THREE.Material} */
        this.terrainMaterial = terrainMaterial;
        /** @type {THREE.Material} */
        this.waterMaterial = waterMaterial;
        /** @type {Object} */
        this.settings = settings;

        // =====================================================
        // MESH POOLS
        // =====================================================
        /** @type {THREE.Mesh[]} Available terrain meshes */
        this.terrainPool = [];
        /** @type {THREE.Mesh[]} Available water meshes */
        this.waterPool = [];

        // =====================================================
        // ACTIVE MESH TRACKING
        // =====================================================
        /** @type {Map<string, THREE.Mesh>} Active meshes by chunk key */
        this.activeMeshes = new Map();

        // =====================================================
        // STATISTICS
        // =====================================================
        this.stats = {
            acquired: { terrain: 0, water: 0 },
            released: { terrain: 0, water: 0 },
            created: { terrain: 0, water: 0 }
        };

        /** @type {number} Count of active terrain meshes */
        this.terrainMeshCount = 0;
        /** @type {number} Count of active water meshes */
        this.waterMeshCount = 0;
    }

    /**
     * Get a setting value with fallback.
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value
     * @returns {*} Setting value
     * @private
     */
    _getSetting(key, defaultValue) {
        if (this.settings && this.settings[key] !== undefined) {
            return this.settings[key];
        }
        return defaultValue;
    }

    // =====================================================
    // MESH ACQUISITION
    // =====================================================

    /**
     * Acquire a mesh from the pool or create a new one.
     * @param {'terrain'|'water'} type - Mesh type
     * @returns {THREE.Mesh} Mesh object ready for use
     */
    acquire(type) {
        const isWater = type === 'water';
        const pool = isWater ? this.waterPool : this.terrainPool;
        const material = isWater ? this.waterMaterial : this.terrainMaterial;

        let mesh = pool.pop();

        if (!mesh) {
            mesh = new THREE.Mesh(undefined, material);
            this.stats.created[type]++;
        }

        // Ensure no stale geometry is kept between uses
        if (mesh.geometry) {
            mesh.geometry.dispose();
            mesh.geometry = null;
        }

        // Configure mesh properties
        mesh.matrixAutoUpdate = false;
        mesh.material = material;
        mesh.frustumCulled = isWater ? false : this._getSetting('enableFrustumCulling', true);
        mesh.castShadow = isWater ? false : this._getSetting('shadows', false);
        mesh.receiveShadow = isWater ? false : this._getSetting('shadows', false);
        mesh.renderOrder = isWater ? 1 : 0;
        mesh.userData.chunkType = type;
        mesh.userData.chunkKey = null;

        this.stats.acquired[type]++;

        return mesh;
    }

    /**
     * Release a mesh back to the pool.
     * @param {THREE.Mesh} mesh - Mesh to release
     * @param {'terrain'|'water'} type - Mesh type
     * @returns {void}
     */
    release(mesh, type) {
        if (!mesh) return;

        // Remove from scene
        if (mesh.parent) {
            mesh.parent.remove(mesh);
        }

        // Dispose geometry
        if (mesh.geometry) {
            mesh.geometry.dispose();
            mesh.geometry = null;
        }

        // Clear user data
        mesh.userData.chunkKey = null;
        mesh.userData.chunkType = type;

        // Reset properties
        const isWater = type === 'water';
        mesh.frustumCulled = isWater ? false : this._getSetting('enableFrustumCulling', true);
        mesh.castShadow = isWater ? false : this._getSetting('shadows', false);
        mesh.receiveShadow = isWater ? false : this._getSetting('shadows', false);

        // Return to pool
        const pool = isWater ? this.waterPool : this.terrainPool;
        pool.push(mesh);

        this.stats.released[type]++;
    }

    // =====================================================
    // ACTIVE MESH MANAGEMENT
    // =====================================================

    /**
     * Register an active mesh for a chunk key.
     * @param {string} key - Chunk key
     * @param {THREE.Mesh} mesh - Active mesh
     * @param {'terrain'|'water'} type - Mesh type
     * @returns {void}
     */
    setActive(key, mesh, type) {
        this.activeMeshes.set(key, mesh);
        mesh.userData.chunkKey = key;

        if (type === 'water') {
            this.waterMeshCount++;
        } else {
            this.terrainMeshCount++;
        }
    }

    /**
     * Get an active mesh by key.
     * @param {string} key - Chunk key
     * @returns {THREE.Mesh|undefined} Mesh or undefined
     */
    getActive(key) {
        return this.activeMeshes.get(key);
    }

    /**
     * Check if a chunk has an active mesh.
     * @param {string} key - Chunk key
     * @returns {boolean} True if active
     */
    hasActive(key) {
        return this.activeMeshes.has(key);
    }

    /**
     * Release a mesh by its chunk key.
     * @param {string} key - Chunk key
     * @returns {boolean} True if mesh was released
     */
    releaseByKey(key) {
        const isWater = key.includes('_WATER');
        const mesh = this.activeMeshes.get(key);

        if (!mesh) return false;

        this.release(mesh, isWater ? 'water' : 'terrain');
        this.activeMeshes.delete(key);

        if (isWater) {
            if (this.waterMeshCount > 0) this.waterMeshCount--;
        } else {
            if (this.terrainMeshCount > 0) this.terrainMeshCount--;
        }

        return true;
    }

    /**
     * Get all active mesh keys.
     * @returns {IterableIterator<string>} Iterator of keys
     */
    getActiveKeys() {
        return this.activeMeshes.keys();
    }

    // =====================================================
    // GEOMETRY HELPERS
    // =====================================================

    /**
     * Apply bounding box and sphere to a geometry for frustum culling.
     * @param {THREE.BufferGeometry} geo - Geometry to update
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {number} minY - Minimum Y in chunk
     * @param {number} maxY - Maximum Y in chunk
     * @returns {void}
     */
    applyChunkBounds(geo, cx, cz, minY, maxY) {
        const chunkSize = CHUNK_SIZE;
        const startX = cx * chunkSize;
        const startZ = cz * chunkSize;

        // Bounding box
        const box = new THREE.Box3(
            new THREE.Vector3(startX, minY, startZ),
            new THREE.Vector3(startX + chunkSize, maxY, startZ + chunkSize)
        );
        geo.boundingBox = box;

        // Bounding sphere
        const sphere = new THREE.Sphere();
        sphere.center.set(
            startX + chunkSize * 0.5,
            (minY + maxY) * 0.5,
            startZ + chunkSize * 0.5
        );
        sphere.radius = MESH_POOL_CONFIG.chunkBoundingRadius;
        geo.boundingSphere = sphere;
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Clear all pools and release all active meshes.
     * @param {THREE.Scene} [scene] - Scene to remove meshes from
     * @returns {void}
     */
    clear(scene) {
        // Release all active meshes
        for (const [key, mesh] of this.activeMeshes) {
            if (scene && mesh.parent === scene) {
                scene.remove(mesh);
            }
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }
        }
        this.activeMeshes.clear();

        // Clear pools
        for (const mesh of this.terrainPool) {
            if (mesh.geometry) mesh.geometry.dispose();
        }
        for (const mesh of this.waterPool) {
            if (mesh.geometry) mesh.geometry.dispose();
        }

        this.terrainPool = [];
        this.waterPool = [];
        this.terrainMeshCount = 0;
        this.waterMeshCount = 0;
    }

    /**
     * Pre-populate pools with empty meshes.
     * @param {number} [terrainCount=64] - Terrain meshes to create
     * @param {number} [waterCount=32] - Water meshes to create
     * @returns {void}
     */
    prewarm(terrainCount = MESH_POOL_CONFIG.terrainPoolSize, waterCount = MESH_POOL_CONFIG.waterPoolSize) {
        for (let i = 0; i < terrainCount; i++) {
            const mesh = new THREE.Mesh(undefined, this.terrainMaterial);
            mesh.matrixAutoUpdate = false;
            mesh.userData.chunkType = 'terrain';
            this.terrainPool.push(mesh);
            this.stats.created.terrain++;
        }

        for (let i = 0; i < waterCount; i++) {
            const mesh = new THREE.Mesh(undefined, this.waterMaterial);
            mesh.matrixAutoUpdate = false;
            mesh.userData.chunkType = 'water';
            this.waterPool.push(mesh);
            this.stats.created.water++;
        }
    }

    /**
     * Get pool statistics.
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            terrainPoolSize: this.terrainPool.length,
            waterPoolSize: this.waterPool.length,
            activeTerrain: this.terrainMeshCount,
            activeWater: this.waterMeshCount,
            totalActive: this.activeMeshes.size,
            acquired: { ...this.stats.acquired },
            released: { ...this.stats.released },
            created: { ...this.stats.created }
        };
    }

    /**
     * Update materials (e.g., when settings change).
     * @param {THREE.Material} terrainMaterial - New terrain material
     * @param {THREE.Material} waterMaterial - New water material
     * @returns {void}
     */
    updateMaterials(terrainMaterial, waterMaterial) {
        this.terrainMaterial = terrainMaterial;
        this.waterMaterial = waterMaterial;

        // Update pooled meshes
        for (const mesh of this.terrainPool) {
            mesh.material = terrainMaterial;
        }
        for (const mesh of this.waterPool) {
            mesh.material = waterMaterial;
        }

        // Update active meshes
        for (const mesh of this.activeMeshes.values()) {
            const isWater = mesh.userData.chunkType === 'water';
            mesh.material = isWater ? waterMaterial : terrainMaterial;
        }
    }
}

export default ChunkMeshPool;

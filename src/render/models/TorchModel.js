/**
 * 3D voxel torch viewmodel and world torch
 * @module render/models/TorchModel
 */

import * as THREE from 'three';

/**
 * @typedef {Object} TorchModelOptions
 * @property {number} [scale=1] - Scale multiplier
 * @property {boolean} [includeLight=true] - Include point light
 * @property {number} [lightIntensity=1] - Light intensity
 * @property {number} [lightDistance=10] - Light distance
 * @property {number} [lightColor=0xff6600] - Light color
 */

/**
 * Torch material cache to avoid creating duplicate materials
 * @type {Object}
 */
const materialCache = {
    stick: null,
    flame: null,
    glow: null,
};

/**
 * Get or create stick material
 * @returns {THREE.MeshLambertMaterial}
 */
function getStickMaterial() {
    if (!materialCache.stick) {
        materialCache.stick = new THREE.MeshLambertMaterial({
            color: 0x8B4513, // Brown
        });
    }
    return materialCache.stick;
}

/**
 * Get or create flame material
 * @returns {THREE.MeshLambertMaterial}
 */
function getFlameMaterial() {
    if (!materialCache.flame) {
        materialCache.flame = new THREE.MeshLambertMaterial({
            color: 0xff6600,    // Orange
            emissive: 0xff4400,
            emissiveIntensity: 0.5,
        });
    }
    return materialCache.flame;
}

/**
 * Get or create glow material
 * @returns {THREE.MeshLambertMaterial}
 */
function getGlowMaterial() {
    if (!materialCache.glow) {
        materialCache.glow = new THREE.MeshLambertMaterial({
            color: 0xffff00,     // Yellow
            emissive: 0xffaa00,
            emissiveIntensity: 1.0,
        });
    }
    return materialCache.glow;
}

/**
 * Create a viewmodel torch (first-person handheld)
 * @param {TorchModelOptions} [options={}] - Options
 * @returns {THREE.Group}
 */
export function createTorchViewmodel(options = {}) {
    const {
        scale = 1,
        includeLight = true,
        lightIntensity = 1,
        lightDistance = 10,
        lightColor = 0xff6600,
    } = options;

    const group = new THREE.Group();

    // Stick (brown wood voxel)
    const stickWidth = 0.04 * scale;
    const stickHeight = 0.25 * scale;
    const stickGeometry = new THREE.BoxGeometry(stickWidth, stickHeight, stickWidth);
    const stick = new THREE.Mesh(stickGeometry, getStickMaterial());
    stick.position.y = stickHeight / 2;
    group.add(stick);

    // Flame (orange voxel with emissive)
    const flameWidth = 0.06 * scale;
    const flameHeight = 0.08 * scale;
    const flameGeometry = new THREE.BoxGeometry(flameWidth, flameHeight, flameWidth);
    const flame = new THREE.Mesh(flameGeometry, getFlameMaterial());
    flame.position.y = stickHeight + flameHeight / 2 + 0.01 * scale;
    group.add(flame);

    // Glow center (yellow core)
    const glowSize = 0.04 * scale;
    const glowGeometry = new THREE.BoxGeometry(glowSize, glowSize, glowSize);
    const glow = new THREE.Mesh(glowGeometry, getGlowMaterial());
    glow.position.y = flame.position.y;
    group.add(glow);

    // Point light
    if (includeLight) {
        const light = new THREE.PointLight(lightColor, lightIntensity, lightDistance);
        light.position.y = flame.position.y + 0.05 * scale;
        group.add(light);
        group.userData.light = light;
    }

    // Store references for animation
    group.userData.stick = stick;
    group.userData.flame = flame;
    group.userData.glow = glow;

    // Set layer for viewmodel rendering (layer 1)
    group.layers.set(1);
    group.traverse(child => child.layers.set(1));

    return group;
}

/**
 * Create a world torch (placed in world, larger and brighter)
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @param {number} z - World Z position
 * @param {TorchModelOptions} [options={}] - Options
 * @returns {THREE.Group}
 */
export function createWorldTorch(x, y, z, options = {}) {
    const {
        scale = 2,  // World torches are 2x bigger
        includeLight = true,
        lightIntensity = 2,  // Brighter for world
        lightDistance = 12,
        lightColor = 0xff6600,
    } = options;

    const group = new THREE.Group();

    // Stick (brown wood voxel) - 2x bigger
    const stickWidth = 0.08 * scale;
    const stickHeight = 0.5 * scale;
    const stickGeometry = new THREE.BoxGeometry(stickWidth, stickHeight, stickWidth);
    const stick = new THREE.Mesh(stickGeometry, getStickMaterial());
    stick.position.y = stickHeight / 2;
    group.add(stick);

    // Flame (orange voxel with emissive) - 2x bigger
    const flameWidth = 0.12 * scale;
    const flameHeight = 0.16 * scale;
    const flameGeometry = new THREE.BoxGeometry(flameWidth, flameHeight, flameWidth);
    const flame = new THREE.Mesh(flameGeometry, getFlameMaterial());
    flame.position.y = stickHeight + flameHeight / 2 + 0.02 * scale;
    group.add(flame);

    // Glow center (yellow core) - 2x bigger
    const glowSize = 0.08 * scale;
    const glowGeometry = new THREE.BoxGeometry(glowSize, glowSize, glowSize);
    const glow = new THREE.Mesh(glowGeometry, getGlowMaterial());
    glow.position.y = flame.position.y;
    group.add(glow);

    // Point light (brighter for world torches)
    if (includeLight) {
        const light = new THREE.PointLight(lightColor, lightIntensity, lightDistance);
        light.position.y = flame.position.y + 0.1 * scale;
        // Performance: don't cast shadows from every torch
        light.castShadow = false;
        group.add(light);
        group.userData.light = light;
    }

    // Store references for animation
    group.userData.stick = stick;
    group.userData.flame = flame;
    group.userData.glow = glow;

    // Position in world
    group.position.set(x + 0.5, y, z + 0.5);

    // Allow shadow casting/receiving
    group.castShadow = true;
    group.receiveShadow = false;

    return group;
}

/**
 * Update torch flicker animation
 * @param {THREE.Group} torch - Torch group
 * @param {number} time - Current time in milliseconds
 * @param {number} [baseIntensity=1] - Base light intensity
 */
export function updateTorchFlicker(torch, time, baseIntensity = 1) {
    const light = torch.userData.light;
    if (light) {
        // Random flicker with multiple sine waves
        const flicker = Math.sin(time * 0.003) * 0.2 +
                       Math.sin(time * 0.007) * 0.1 +
                       Math.sin(time * 0.011) * 0.05;
        light.intensity = baseIntensity + flicker;
    }

    // Animate flame scale
    const flame = torch.userData.flame;
    if (flame) {
        const scaleY = 1.0 + Math.sin(time * 0.001) * 0.03 + Math.sin(time * 0.0023) * 0.01;
        flame.scale.y = scaleY;
    }

    // Animate glow scale
    const glow = torch.userData.glow;
    if (glow) {
        const scaleY = 1.0 + Math.sin(time * 0.0015) * 0.04 + Math.sin(time * 0.0031) * 0.015;
        glow.scale.setScalar(scaleY);
    }
}

/**
 * Dispose of a torch model and its resources
 * @param {THREE.Group} torch - Torch group to dispose
 */
export function disposeTorchModel(torch) {
    torch.traverse(child => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        // Don't dispose materials - they're cached
    });
}

/**
 * Dispose of cached materials (call on game shutdown)
 */
export function disposeTorchMaterials() {
    if (materialCache.stick) {
        materialCache.stick.dispose();
        materialCache.stick = null;
    }
    if (materialCache.flame) {
        materialCache.flame.dispose();
        materialCache.flame = null;
    }
    if (materialCache.glow) {
        materialCache.glow.dispose();
        materialCache.glow = null;
    }
}

export default {
    createTorchViewmodel,
    createWorldTorch,
    updateTorchFlicker,
    disposeTorchModel,
    disposeTorchMaterials,
};

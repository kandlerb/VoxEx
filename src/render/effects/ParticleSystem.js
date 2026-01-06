/**
 * ParticleSystem - GPU-accelerated particle effects using Three.js Points.
 * Uses object pooling and buffer geometry for efficient particle rendering.
 * @module render/effects/ParticleSystem
 */

import * as THREE from 'three';
import {
    GRASS, DIRT, STONE, SAND, WOOD, LEAVES, WATER,
    GRAVEL, SNOW, BEDROCK, LONGWOOD_LEAVES
} from '../../core/constants.js';

// =====================================================
// PARTICLE CONFIGURATION
// =====================================================

/**
 * Global particle system configuration.
 * @type {Object}
 */
export const PARTICLE_CONFIG = {
    maxParticles: 500,
    poolSize: 200,
    updateDistance: 64 // Only update particles within this range
};

/**
 * Default settings for particle effects (used when SETTINGS not available).
 * @type {Object}
 */
export const PARTICLE_DEFAULTS = {
    particlesEnabled: true,
    blockBreakEnabled: true,
    blockBreakCount: 8,
    blockBreakSize: 0.15,
    blockBreakDecay: 0.6,
    torchParticlesEnabled: true,
    torchSmokeColor: 0x4b4b4b,
    torchSmokeSize: 0.12,
    torchSmokeDecay: 1.5,
    torchFlameColor: 0xff6600,
    torchFlameSize: 0.1,
    torchFlameDecay: 0.3,
    footstepEnabled: true,
    footstepSize: 0.15,
    footstepDecay: 0.5
};

// =====================================================
// BLOCK PARTICLE COLORS
// =====================================================

/**
 * Get particle color for a block type.
 * @param {number} blockType - Block type ID
 * @returns {{r: number, g: number, b: number}} RGB color (0-1 range)
 */
export function getBlockParticleColor(blockType) {
    const colors = {
        [GRASS]: { r: 0.3, g: 0.6, b: 0.2 },
        [DIRT]: { r: 0.55, g: 0.35, b: 0.2 },
        [STONE]: { r: 0.5, g: 0.5, b: 0.5 },
        [SAND]: { r: 0.9, g: 0.85, b: 0.6 },
        [WOOD]: { r: 0.6, g: 0.4, b: 0.2 },
        [LEAVES]: { r: 0.2, g: 0.5, b: 0.15 },
        [WATER]: { r: 0.3, g: 0.5, b: 0.8 },
        [GRAVEL]: { r: 0.45, g: 0.42, b: 0.4 },
        [SNOW]: { r: 0.95, g: 0.95, b: 0.98 },
        [BEDROCK]: { r: 0.15, g: 0.15, b: 0.15 },
        [LONGWOOD_LEAVES]: { r: 0.15, g: 0.4, b: 0.1 }
    };
    return colors[blockType] || { r: 0.5, g: 0.5, b: 0.5 };
}

// =====================================================
// PARTICLE SHADERS
// =====================================================

/**
 * Vertex shader for voxel-style square particles.
 * Supports per-vertex color and size with distance attenuation.
 */
const PARTICLE_VERTEX_SHADER = `
    attribute float size;
    attribute vec4 color;
    varying vec4 vColor;
    void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

/**
 * Fragment shader for voxel-style square particles.
 * Uses Chebyshev distance for square shape with soft edges.
 */
const PARTICLE_FRAGMENT_SHADER = `
    varying vec4 vColor;
    void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        // Use Chebyshev distance for square voxel-style particles
        float dist = max(abs(center.x), abs(center.y));
        if (dist > 0.5) discard;
        // Sharp square edges with slight fade at boundary
        float alpha = vColor.a * (1.0 - smoothstep(0.4, 0.5, dist));
        gl_FragColor = vec4(vColor.rgb, alpha);
    }
`;

// =====================================================
// PARTICLESYSTEM CLASS
// =====================================================

/**
 * GPU-accelerated particle system using Three.js Points.
 * Features object pooling, buffer geometry, and custom shaders.
 */
export class ParticleSystem {
    /**
     * Create a new ParticleSystem.
     * @param {THREE.Scene} scene - Three.js scene to add particles to
     * @param {Object} [settings=null] - Settings object for particle configuration
     */
    constructor(scene, settings = null) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        /** @type {Object} Settings reference */
        this.settings = settings;
        /** @type {Array<Object>} Active particles */
        this.particles = [];
        /** @type {Array<Object>} Particle object pool */
        this.pool = [];
        /** @type {THREE.BufferGeometry|null} */
        this.geometry = null;
        /** @type {THREE.ShaderMaterial|null} */
        this.material = null;
        /** @type {THREE.Points|null} */
        this.mesh = null;
        /** @type {Float32Array|null} Position buffer */
        this.positions = null;
        /** @type {Float32Array|null} Color buffer (RGBA) */
        this.colors = null;
        /** @type {Float32Array|null} Size buffer */
        this.sizes = null;
        /** @type {number} Maximum particle count */
        this.maxCount = PARTICLE_CONFIG.maxParticles;
        /** @type {number} Currently active particle count */
        this.activeCount = 0;
    }

    /**
     * Get a setting value with fallback to defaults.
     * @param {string} key - Setting key
     * @returns {*} Setting value
     * @private
     */
    _getSetting(key) {
        if (this.settings && this.settings[key] !== undefined) {
            return this.settings[key];
        }
        return PARTICLE_DEFAULTS[key];
    }

    /**
     * Initialize the particle system geometry, material, and pool.
     * Must be called before spawning particles.
     * @returns {void}
     */
    init() {
        // Create instanced buffer geometry for particles
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.maxCount * 3);
        this.colors = new Float32Array(this.maxCount * 4);
        this.sizes = new Float32Array(this.maxCount);

        // Initialize with zeros (off-screen)
        for (let i = 0; i < this.maxCount; i++) {
            this.positions[i * 3] = 0;
            this.positions[i * 3 + 1] = -1000; // Off-screen
            this.positions[i * 3 + 2] = 0;
            this.colors[i * 4] = 1;
            this.colors[i * 4 + 1] = 1;
            this.colors[i * 4 + 2] = 1;
            this.colors[i * 4 + 3] = 0; // Transparent
            this.sizes[i] = 0.1;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

        // Custom shader material for voxel-style particles
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: PARTICLE_VERTEX_SHADER,
            fragmentShader: PARTICLE_FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        this.mesh = new THREE.Points(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        // Pre-populate pool
        for (let i = 0; i < PARTICLE_CONFIG.poolSize; i++) {
            this.pool.push(this.createParticle());
        }
    }

    /**
     * Create a new particle object.
     * @returns {Object} Particle object with default values
     */
    createParticle() {
        return {
            active: false,
            index: -1,
            x: 0, y: 0, z: 0,
            vx: 0, vy: 0, vz: 0,
            r: 1, g: 1, b: 1, a: 1,
            size: 0.1,
            life: 0,
            maxLife: 1,
            gravity: 0,
            fadeOut: true,
            type: 'generic'
        };
    }

    /**
     * Spawn a particle at the given position.
     * @param {number} x - World X position
     * @param {number} y - World Y position
     * @param {number} z - World Z position
     * @param {Object} [options={}] - Particle options
     * @param {number} [options.vx] - X velocity (default: random -1 to 1)
     * @param {number} [options.vy] - Y velocity (default: random 0 to 2)
     * @param {number} [options.vz] - Z velocity (default: random -1 to 1)
     * @param {number} [options.r=1] - Red color (0-1)
     * @param {number} [options.g=1] - Green color (0-1)
     * @param {number} [options.b=1] - Blue color (0-1)
     * @param {number} [options.a=1] - Alpha (0-1)
     * @param {number} [options.size=0.15] - Particle size
     * @param {number} [options.life=1] - Lifetime in seconds
     * @param {number} [options.gravity=5] - Gravity strength
     * @param {boolean} [options.fadeOut=true] - Whether to fade over lifetime
     * @param {string} [options.type='generic'] - Particle type identifier
     * @returns {Object|null} The spawned particle, or null if at capacity
     */
    spawn(x, y, z, options = {}) {
        if (this.activeCount >= this.maxCount) return null;

        let particle = this.pool.pop();
        if (!particle) {
            particle = this.createParticle();
        }

        particle.active = true;
        particle.index = this.activeCount;
        particle.x = x;
        particle.y = y;
        particle.z = z;
        particle.vx = options.vx ?? (Math.random() - 0.5) * 2;
        particle.vy = options.vy ?? Math.random() * 2;
        particle.vz = options.vz ?? (Math.random() - 0.5) * 2;
        particle.r = options.r ?? 1;
        particle.g = options.g ?? 1;
        particle.b = options.b ?? 1;
        particle.a = options.a ?? 1;
        particle.size = options.size ?? 0.15;
        particle.life = options.life ?? 1;
        particle.maxLife = particle.life;
        particle.gravity = options.gravity !== undefined ? options.gravity : 5;
        particle.fadeOut = options.fadeOut !== undefined ? options.fadeOut : true;
        particle.type = options.type || 'generic';

        // IMMEDIATELY update buffer so particle is visible this frame
        const idx = particle.index;
        this.positions[idx * 3] = particle.x;
        this.positions[idx * 3 + 1] = particle.y;
        this.positions[idx * 3 + 2] = particle.z;
        this.colors[idx * 4] = particle.r;
        this.colors[idx * 4 + 1] = particle.g;
        this.colors[idx * 4 + 2] = particle.b;
        this.colors[idx * 4 + 3] = particle.a;
        this.sizes[idx] = particle.size;

        // Mark buffers for update
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;

        this.particles.push(particle);
        this.activeCount++;

        return particle;
    }

    /**
     * Update all active particles.
     * @param {number} dt - Delta time in seconds
     * @param {{x: number, y: number, z: number}} playerPos - Player position for distance culling
     * @returns {void}
     */
    update(dt, playerPos) {
        if (!this.mesh || !playerPos) return;

        const distSq = PARTICLE_CONFIG.updateDistance * PARTICLE_CONFIG.updateDistance;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (!p.active) continue;

            // Update life
            p.life -= dt;
            if (p.life <= 0) {
                this.despawn(i);
                continue;
            }

            // Distance check for performance
            const dx = p.x - playerPos.x;
            const dy = p.y - playerPos.y;
            const dz = p.z - playerPos.z;
            if (dx * dx + dy * dy + dz * dz > distSq) {
                this.despawn(i);
                continue;
            }

            // Physics
            p.vy -= p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;

            // Update buffer data
            const idx = p.index;
            this.positions[idx * 3] = p.x;
            this.positions[idx * 3 + 1] = p.y;
            this.positions[idx * 3 + 2] = p.z;

            const alpha = p.fadeOut ? p.a * (p.life / p.maxLife) : p.a;
            this.colors[idx * 4] = p.r;
            this.colors[idx * 4 + 1] = p.g;
            this.colors[idx * 4 + 2] = p.b;
            this.colors[idx * 4 + 3] = alpha;

            this.sizes[idx] = p.size;
        }

        // Mark buffers for update
        if (this.activeCount > 0) {
            this.geometry.attributes.position.needsUpdate = true;
            this.geometry.attributes.color.needsUpdate = true;
            this.geometry.attributes.size.needsUpdate = true;
        }
    }

    /**
     * Despawn a particle and return it to the pool.
     * @param {number} index - Index in the particles array
     * @returns {void}
     */
    despawn(index) {
        const p = this.particles[index];
        if (!p) return;

        const lastIdx = this.particles.length - 1;

        if (index !== lastIdx) {
            const lastP = this.particles[lastIdx];
            const lastPOldBufferIndex = lastP.index; // Save BEFORE reassigning

            // lastP takes over p's buffer slot
            lastP.index = p.index;
            this.particles[index] = lastP;

            // Copy lastP's data to its NEW buffer slot (p's old slot)
            const idx = lastP.index;
            this.positions[idx * 3] = lastP.x;
            this.positions[idx * 3 + 1] = lastP.y;
            this.positions[idx * 3 + 2] = lastP.z;
            this.colors[idx * 4] = lastP.r;
            this.colors[idx * 4 + 1] = lastP.g;
            this.colors[idx * 4 + 2] = lastP.b;
            this.colors[idx * 4 + 3] = lastP.fadeOut ? lastP.a * (lastP.life / lastP.maxLife) : lastP.a;
            this.sizes[idx] = lastP.size;

            // Hide lastP's OLD buffer slot (at the end)
            this.positions[lastPOldBufferIndex * 3 + 1] = -1000;
            this.colors[lastPOldBufferIndex * 4 + 3] = 0;
        } else {
            // p is the last particle, just hide its own slot
            this.positions[p.index * 3 + 1] = -1000;
            this.colors[p.index * 4 + 3] = 0;
        }

        // Return to pool
        p.active = false;
        p.index = -1;
        this.pool.push(p);

        this.particles.pop();
        this.activeCount--;
    }

    // =====================================================
    // EFFECT SPAWNERS
    // =====================================================

    /**
     * Spawn block break particles with configurable settings.
     * @param {number} x - Block X position
     * @param {number} y - Block Y position
     * @param {number} z - Block Z position
     * @param {number} blockType - Block type ID for color
     * @returns {void}
     */
    spawnBlockBreak(x, y, z, blockType) {
        if (!this._getSetting('particlesEnabled') || !this._getSetting('blockBreakEnabled')) return;

        const color = getBlockParticleColor(blockType);
        const baseCount = this._getSetting('blockBreakCount');
        const count = Math.floor(baseCount * 0.8) + Math.floor(Math.random() * (baseCount * 0.4));
        const size = this._getSetting('blockBreakSize');
        const decay = this._getSetting('blockBreakDecay');

        for (let i = 0; i < count; i++) {
            const offsetX = (Math.random() - 0.5) * 0.8;
            const offsetY = (Math.random() - 0.5) * 0.8;
            const offsetZ = (Math.random() - 0.5) * 0.8;

            this.spawn(x + 0.5 + offsetX, y + 0.5 + offsetY, z + 0.5 + offsetZ, {
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 3 + 1,
                vz: (Math.random() - 0.5) * 4,
                r: color.r,
                g: color.g,
                b: color.b,
                size: size * (0.75 + Math.random() * 0.5),
                life: decay * (0.7 + Math.random() * 0.6),
                gravity: 12,
                type: 'block_break'
            });
        }
    }

    /**
     * Spawn torch smoke/ember particles.
     * @param {number} x - Torch X position
     * @param {number} y - Torch Y position
     * @param {number} z - Torch Z position
     * @returns {void}
     */
    spawnTorchEmber(x, y, z) {
        if (!this._getSetting('particlesEnabled') || !this._getSetting('torchParticlesEnabled')) return;

        // Convert hex color to RGB components
        const color = this._getSetting('torchSmokeColor');
        const validColor = (typeof color === 'number' && !isNaN(color)) ? color : 0x4b4b4b;
        const r = ((validColor >> 16) & 0xFF) / 255;
        const g = ((validColor >> 8) & 0xFF) / 255;
        const b = (validColor & 0xFF) / 255;
        const size = this._getSetting('torchSmokeSize');
        const decay = this._getSetting('torchSmokeDecay');

        this.spawn(x, y + 0.05, z, {
            vx: (Math.random() - 0.5) * 0.2,
            vy: 0.3 + Math.random() * 0.3,
            vz: (Math.random() - 0.5) * 0.2,
            r: r,
            g: g * (0.7 + Math.random() * 0.3),
            b: b * (0.3 + Math.random() * 0.2),
            a: 0.3 + Math.random() * 0.6,
            size: size * (0.7 + Math.random() * 0.6),
            life: decay * (0.7 + Math.random() * 0.6),
            gravity: -0.15,
            type: 'ember'
        });
    }

    /**
     * Spawn short-lived flame particles for flickering fire effect.
     * @param {number} x - Torch X position
     * @param {number} y - Torch Y position
     * @param {number} z - Torch Z position
     * @returns {void}
     */
    spawnTorchFlame(x, y, z) {
        if (!this._getSetting('particlesEnabled') || !this._getSetting('torchParticlesEnabled')) return;

        // Convert hex color to RGB components
        const color = this._getSetting('torchFlameColor');
        const validColor = (typeof color === 'number' && !isNaN(color)) ? color : 0xff6600;
        const r = ((validColor >> 16) & 0xFF) / 255;
        const g = ((validColor >> 8) & 0xFF) / 255;
        const b = (validColor & 0xFF) / 255;
        const size = this._getSetting('torchFlameSize');
        const decay = this._getSetting('torchFlameDecay');

        this.spawn(x, y - 0.05, z, {
            vx: (Math.random() - 0.5) * 0.08,
            vy: 0.4 + Math.random() * 0.3,
            vz: (Math.random() - 0.5) * 0.08,
            r: r + (Math.random() * 0.2),
            g: g * (0.8 + Math.random() * 0.2),
            b: b * (0.5 + Math.random() * 0.3),
            a: 0.7 + Math.random() * 0.3,
            size: size * (0.8 + Math.random() * 0.4),
            life: decay * (0.6 + Math.random() * 0.8),
            gravity: -0.3,
            type: 'flame'
        });
    }

    /**
     * Spawn dust particles for footsteps.
     * @param {number} x - Position X
     * @param {number} y - Position Y
     * @param {number} z - Position Z
     * @param {number} blockType - Block type for color
     * @returns {void}
     */
    spawnFootstepDust(x, y, z, blockType) {
        if (!this._getSetting('particlesEnabled') || !this._getSetting('footstepEnabled')) return;

        const color = getBlockParticleColor(blockType);
        const size = this._getSetting('footstepSize');
        const decay = this._getSetting('footstepDecay');

        for (let i = 0; i < 3; i++) {
            this.spawn(
                x + (Math.random() - 0.5) * 0.3,
                y,
                z + (Math.random() - 0.5) * 0.3,
                {
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: 0.3 + Math.random() * 0.3,
                    vz: (Math.random() - 0.5) * 0.5,
                    r: color.r, g: color.g, b: color.b, a: 0.6,
                    size: size * (0.8 + Math.random() * 0.5),
                    life: decay * (0.8 + Math.random() * 0.4),
                    gravity: 2,
                    type: 'dust'
                }
            );
        }
    }

    /**
     * Spawn water splash particles.
     * @param {number} x - Position X
     * @param {number} y - Position Y (water surface)
     * @param {number} z - Position Z
     * @param {number} [impactVelocity=2] - Impact velocity for scaling
     * @returns {void}
     */
    spawnWaterSplash(x, y, z, impactVelocity = 2) {
        if (!this._getSetting('particlesEnabled')) return;

        const impactSpeed = Math.abs(impactVelocity);
        const particleCount = Math.ceil(Math.min(impactSpeed, 20) / 2.5);
        const sizeBase = this._getSetting('footstepSize');

        for (let i = 0; i < particleCount; i++) {
            const spreadAngle = Math.random() * Math.PI * 2;
            const spreadRadius = 0.3 + impactSpeed * 0.05;
            const upVelocity = (1 + impactSpeed * 0.3) * (0.5 + Math.random());
            const outVelocity = (0.5 + impactSpeed * 0.15) * (0.3 + Math.random() * 0.7);

            this.spawn(
                x + (Math.random() - 0.5) * spreadRadius,
                y + 0.1,
                z + (Math.random() - 0.5) * spreadRadius,
                {
                    vx: Math.cos(spreadAngle) * outVelocity,
                    vy: upVelocity,
                    vz: Math.sin(spreadAngle) * outVelocity,
                    r: 0.7, g: 0.88, b: 1.0, a: 0.7,
                    size: sizeBase * (0.5 + impactSpeed * 0.05 + Math.random() * 0.3),
                    life: 0.6 + impactSpeed * 0.03,
                    gravity: 10,
                    type: 'splash'
                }
            );
        }

        // Secondary droplets after short delay for larger impacts
        if (impactSpeed > 5) {
            setTimeout(() => {
                const dropletCount = Math.ceil(impactSpeed / 5);
                for (let i = 0; i < dropletCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    this.spawn(
                        x + (Math.random() - 0.5) * 0.5,
                        y + 0.3 + Math.random() * 0.3,
                        z + (Math.random() - 0.5) * 0.5,
                        {
                            vx: Math.cos(angle) * (0.3 + Math.random() * 0.5),
                            vy: 0.5 + Math.random() * 1.5,
                            vz: Math.sin(angle) * (0.3 + Math.random() * 0.5),
                            r: 0.75, g: 0.9, b: 1.0, a: 0.5,
                            size: sizeBase * 0.4,
                            life: 0.4,
                            gravity: 12,
                            type: 'droplet'
                        }
                    );
                }
            }, 50);
        }
    }

    /**
     * Clear all active particles.
     * @returns {void}
     */
    clear() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.despawn(i);
        }
    }

    /**
     * Dispose of all resources and remove from scene.
     * @returns {void}
     */
    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.geometry.dispose();
            this.material.dispose();
        }
        this.particles = [];
        this.pool = [];
        this.activeCount = 0;
    }
}

export default ParticleSystem;

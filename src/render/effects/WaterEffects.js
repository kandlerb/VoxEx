/**
 * WaterEffects - Mesh-based water effects like ripples and wakes.
 * Uses expanding ring geometry for voxel-aesthetic water interactions.
 * @module render/effects/WaterEffects
 */

import * as THREE from 'three';

// =====================================================
// WATER EFFECTS CONFIGURATION
// =====================================================

/** Maximum number of active water ripples */
export const MAX_WATER_RIPPLES = 20;

/**
 * Default settings for water effects.
 * @type {Object}
 */
export const WATER_EFFECT_DEFAULTS = {
    waterRipplesEnabled: true,
    waterRippleColor: 0x4488aa,
    waterRippleSegments: 4,
    waterRippleInitialScale: 0.3,
    waterRippleVelocityScale: 0.05,
    waterRippleExpansionRate: 2.0,
    waterRippleOpacity: 0.5,
    waterRippleLifespan: 1.0,
    waterWadingRipplesEnabled: true,
    waterWadeScale: 0.5,
    waterWadeOpacity: 0.4,
    waterWadeAngle: 45,
    waterSplashParticlesEnabled: true
};

// =====================================================
// RIPPLE GEOMETRY HELPERS
// =====================================================

/**
 * Creates a voxel-style diamond/octagonal ring geometry for water ripples.
 * Uses shared vertices for a continuous ring with no seams.
 * @param {number} innerRadius - Inner radius of the ring
 * @param {number} outerRadius - Outer radius of the ring
 * @param {number} [segments=4] - Number of segments (4=diamond, 8=octagon)
 * @returns {THREE.BufferGeometry} The voxel-style ring geometry
 */
export function createSquareRippleGeometry(innerRadius, outerRadius, segments = 4) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const uvs = [];

    // Rotate 45° for diamond orientation when segments=4
    const angleOffset = segments === 4 ? Math.PI / 4 : 0;

    // Create vertices: inner ring first, then outer ring (shared corners)
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2 + angleOffset;

        // Inner vertex
        vertices.push(
            Math.cos(angle) * innerRadius,
            0,
            Math.sin(angle) * innerRadius
        );
        uvs.push(0.5 + Math.cos(angle) * 0.25, 0.5 + Math.sin(angle) * 0.25);
    }

    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2 + angleOffset;

        // Outer vertex
        vertices.push(
            Math.cos(angle) * outerRadius,
            0,
            Math.sin(angle) * outerRadius
        );
        uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    }

    // Create indices for quads between inner and outer rings
    for (let i = 0; i < segments; i++) {
        const innerCurrent = i;
        const innerNext = (i + 1) % segments;
        const outerCurrent = segments + i;
        const outerNext = segments + (i + 1) % segments;

        // Two triangles per quad
        indices.push(innerCurrent, outerCurrent, outerNext);
        indices.push(innerCurrent, outerNext, innerNext);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Creates a chevron/V-shaped wake geometry for movement ripples.
 * @param {number} width - Width of the chevron
 * @param {number} length - Length from tip to base
 * @param {number} thickness - Thickness of the chevron arms
 * @param {number} [angleDeg=45] - Angle of the V in degrees
 * @returns {THREE.BufferGeometry} The chevron wake geometry
 */
export function createChevronWakeGeometry(width, length, thickness, angleDeg = 45) {
    const geometry = new THREE.BufferGeometry();
    const angleRad = (angleDeg * Math.PI) / 180;
    const halfWidth = width / 2;

    // Chevron points: tip at origin, wings extending back
    const vertices = [
        // Tip (front)
        0, 0, length,
        // Left wing outer
        -halfWidth, 0, 0,
        // Left wing inner
        -halfWidth + thickness, 0, thickness * 0.5,
        // Right wing inner
        halfWidth - thickness, 0, thickness * 0.5,
        // Right wing outer
        halfWidth, 0, 0
    ];

    const indices = [
        // Left arm
        0, 1, 2,
        // Right arm
        0, 3, 4,
        // Center fill
        0, 2, 3
    ];

    const uvs = [
        0.5, 1.0,  // Tip
        0.0, 0.0,  // Left outer
        0.2, 0.2,  // Left inner
        0.8, 0.2,  // Right inner
        1.0, 0.0   // Right outer
    ];

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

// =====================================================
// WATEREFFECTS CLASS
// =====================================================

/**
 * WaterEffects manages mesh-based water effects like expanding ripples.
 * Separate from ParticleSystem since ripples use mesh scaling, not points.
 */
export class WaterEffects {
    /**
     * Create a new WaterEffects manager.
     * @param {THREE.Scene} scene - Three.js scene
     * @param {Object} [settings=null] - Settings object
     */
    constructor(scene, settings = null) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        /** @type {Object} */
        this.settings = settings;
        /** @type {Array<Object>} Active ripples */
        this.ripples = [];
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
        return WATER_EFFECT_DEFAULTS[key];
    }

    /**
     * Spawn a water ripple at the given position.
     * @param {number} x - World X position
     * @param {number} y - World Y position (water surface)
     * @param {number} z - World Z position
     * @param {number} [impactVelocity=2] - Vertical velocity at impact (affects size/count)
     * @returns {void}
     */
    spawnRipple(x, y, z, impactVelocity = 2) {
        if (!this._getSetting('waterRipplesEnabled')) return;

        const absVelocity = Math.abs(impactVelocity);
        const clampedVelocity = Math.min(absVelocity, 15);

        // Calculate velocity-based parameters
        const initialScale = this._getSetting('waterRippleInitialScale') +
                            clampedVelocity * this._getSetting('waterRippleVelocityScale');
        const expansionRate = this._getSetting('waterRippleExpansionRate') + clampedVelocity * 0.25;
        const initialOpacity = Math.min(
            this._getSetting('waterRippleOpacity') + 0.1,
            this._getSetting('waterRippleOpacity') + clampedVelocity * 0.015
        );
        const lifespan = this._getSetting('waterRippleLifespan') + clampedVelocity * 0.08;

        // For high-velocity impacts, spawn multiple concentric ripples
        const rippleCount = absVelocity > 8 ? Math.min(3, Math.ceil(absVelocity / 6)) : 1;

        for (let r = 0; r < rippleCount; r++) {
            const delay = r * 0.15;

            setTimeout(() => {
                // Remove oldest ripple if at capacity
                if (this.ripples.length >= MAX_WATER_RIPPLES) {
                    const oldest = this.ripples.shift();
                    if (oldest && oldest.mesh) {
                        this.scene.remove(oldest.mesh);
                        oldest.geometry.dispose();
                        oldest.material.dispose();
                    }
                }

                const geometry = createSquareRippleGeometry(
                    0.08, 0.15,
                    this._getSetting('waterRippleSegments')
                );
                const material = new THREE.MeshBasicMaterial({
                    color: this._getSetting('waterRippleColor'),
                    transparent: true,
                    opacity: initialOpacity * (1 - r * 0.2),
                    side: THREE.DoubleSide,
                    depthWrite: false
                });

                const ripple = new THREE.Mesh(geometry, material);
                ripple.position.set(x, y + 0.02, z);

                // Apply initial scale based on velocity and ring index
                const ringScale = initialScale * (1 + r * 0.3);
                ripple.scale.set(ringScale, 1, ringScale);

                this.scene.add(ripple);

                this.ripples.push({
                    mesh: ripple,
                    geometry,
                    material,
                    life: lifespan,
                    maxLife: lifespan,
                    scale: ringScale,
                    expansionRate: expansionRate * (1 - r * 0.15),
                    initialOpacity: initialOpacity * (1 - r * 0.2)
                });
            }, delay * 1000);
        }
    }

    /**
     * Spawn a movement wake ripple (V-shaped).
     * @param {number} x - World X position
     * @param {number} y - World Y position
     * @param {number} z - World Z position
     * @param {number} moveDirX - Movement direction X
     * @param {number} moveDirZ - Movement direction Z
     * @returns {void}
     */
    spawnWadeRipple(x, y, z, moveDirX, moveDirZ) {
        if (!this._getSetting('waterRipplesEnabled') || !this._getSetting('waterWadingRipplesEnabled')) return;

        if (this.ripples.length >= MAX_WATER_RIPPLES) {
            const oldest = this.ripples.shift();
            if (oldest && oldest.mesh) {
                this.scene.remove(oldest.mesh);
                oldest.geometry.dispose();
                oldest.material.dispose();
            }
        }

        const geometry = createChevronWakeGeometry(
            this._getSetting('waterWadeScale'),
            this._getSetting('waterWadeScale') * 0.8,
            0.08,
            this._getSetting('waterWadeAngle')
        );
        const material = new THREE.MeshBasicMaterial({
            color: this._getSetting('waterRippleColor'),
            transparent: true,
            opacity: this._getSetting('waterWadeOpacity'),
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const ripple = new THREE.Mesh(geometry, material);
        ripple.position.set(x, y + 0.02, z);

        // Rotate chevron to point in movement direction
        const angle = Math.atan2(moveDirX, moveDirZ);
        ripple.rotation.y = angle;

        this.scene.add(ripple);

        const lifespan = this._getSetting('waterRippleLifespan') * 0.6;
        this.ripples.push({
            mesh: ripple,
            geometry,
            material,
            life: lifespan,
            maxLife: lifespan,
            scale: 1,
            expansionRate: 1.5,
            initialOpacity: this._getSetting('waterWadeOpacity')
        });
    }

    /**
     * Update all active ripples.
     * @param {number} dt - Delta time in seconds
     * @returns {void}
     */
    update(dt) {
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const ripple = this.ripples[i];
            ripple.life -= dt;

            if (ripple.life <= 0) {
                this.scene.remove(ripple.mesh);
                ripple.geometry.dispose();
                ripple.material.dispose();
                this.ripples.splice(i, 1);
                continue;
            }

            // Expand
            const expRate = ripple.expansionRate ?? 2;
            ripple.scale += dt * expRate;
            ripple.mesh.scale.set(ripple.scale, 1, ripple.scale);

            // Fade
            const baseOpacity = ripple.initialOpacity ?? 0.5;
            ripple.material.opacity = baseOpacity * (ripple.life / ripple.maxLife);
        }
    }

    /**
     * Clear all active ripples.
     * @returns {void}
     */
    clear() {
        for (const ripple of this.ripples) {
            if (ripple.mesh) {
                this.scene.remove(ripple.mesh);
                ripple.geometry.dispose();
                ripple.material.dispose();
            }
        }
        this.ripples = [];
    }

    /**
     * Dispose of all resources.
     * @returns {void}
     */
    dispose() {
        this.clear();
    }
}

export default WaterEffects;

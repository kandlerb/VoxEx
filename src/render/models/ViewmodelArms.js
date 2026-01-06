/**
 * Viewmodel arms for first-person view
 * Creates and animates player arms visible from first-person perspective.
 * @module render/models/ViewmodelArms
 */

import {
    PLAYER_PROPORTIONS,
    PLAYER_SKIN_COLORS,
    PLAYER_SHIRT_COLORS
} from '../../config/PlayerConfig.js';

/**
 * Fill a rounded pixel on canvas (for procedural textures).
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} step - Pixel step size
 * @param {number} x - X grid coordinate
 * @param {number} y - Y grid coordinate
 * @param {string} color - CSS color string
 */
function fillRoundedPixel(ctx, step, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * step, y * step, step, step);
}

/**
 * Apply dithering effect to canvas.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} pixelsPerTile - Pixels per tile
 * @param {number} step - Step size
 * @param {number} intensity - Dithering intensity (0-1)
 */
function applyPixelDither(ctx, pixelsPerTile, step, intensity) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const variation = (Math.random() - 0.5) * intensity * 50;
            const px = Math.floor(x * step + step / 2);
            const py = Math.floor(y * step + step / 2);
            const idx = (py * ctx.canvas.width + px) * 4;

            if (idx + 2 < data.length) {
                data[idx] = Math.max(0, Math.min(255, data[idx] + variation));
                data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + variation));
                data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + variation));
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

/**
 * Build viewmodel arms for first-person view.
 * Similar to torch viewmodel: Layer 1, no depth test.
 * @param {number} textureResolution - Base texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.Group} Viewmodel arms group
 */
export function buildPlayerViewmodelArms(textureResolution, THREE) {
    const group = new THREE.Group();
    const { arm } = PLAYER_PROPORTIONS;

    // Create arm texture with enhanced quality (matching third-person body)
    const PIXELS_PER_TILE = Math.max(8, Math.round(textureResolution * 0.5));
    const TILE_SIZE = PIXELS_PER_TILE * 2;
    const cvs = document.createElement('canvas');
    cvs.width = TILE_SIZE;
    cvs.height = TILE_SIZE;
    const ctx = cvs.getContext('2d');
    const STEP = TILE_SIZE / PIXELS_PER_TILE;
    const fillPixel = (x, y, color) => fillRoundedPixel(ctx, STEP, x, y, color);

    for (let y = 0; y < PIXELS_PER_TILE; y++) {
        for (let x = 0; x < PIXELS_PER_TILE; x++) {
            const v = y / PIXELS_PER_TILE;
            const u = x / PIXELS_PER_TILE;
            const r = Math.random();
            let color;
            const isEdge = u < 0.15 || u > 0.85;

            if (v < 0.4) {
                // Sleeve with shading
                if (isEdge || r > 0.75) {
                    color = PLAYER_SHIRT_COLORS.shadow[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.shadow.length)];
                } else if (r > 0.2) {
                    color = PLAYER_SHIRT_COLORS.base[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.base.length)];
                } else {
                    color = PLAYER_SHIRT_COLORS.highlight[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.highlight.length)];
                }
            } else {
                // Skin with shading
                if (isEdge || r > 0.7) {
                    color = PLAYER_SKIN_COLORS.shadow[Math.floor(Math.random() * PLAYER_SKIN_COLORS.shadow.length)];
                } else if (r > 0.15) {
                    color = PLAYER_SKIN_COLORS.base[Math.floor(Math.random() * PLAYER_SKIN_COLORS.base.length)];
                } else {
                    color = PLAYER_SKIN_COLORS.highlight[Math.floor(Math.random() * PLAYER_SKIN_COLORS.highlight.length)];
                }
            }
            fillPixel(x, y, color);
        }
    }
    applyPixelDither(ctx, PIXELS_PER_TILE, STEP, 0.08);

    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    const armMaterial = new THREE.MeshLambertMaterial({
        map: tex,
        depthTest: false,
        depthWrite: false,
    });

    // Arm geometry (sized for good viewmodel visibility)
    const armGeo = new THREE.BoxGeometry(0.10, 0.40, 0.10);

    // Left arm (visible in lower left of viewport)
    const leftArmPivot = new THREE.Group();
    const leftArm = new THREE.Mesh(armGeo, armMaterial);
    leftArm.position.y = -0.20; // Offset down from pivot
    leftArm.renderOrder = 9998;
    leftArm.layers.set(1);
    leftArmPivot.add(leftArm);
    leftArmPivot.position.set(-0.35, -0.40, -0.35); // Further to edge of viewport
    leftArmPivot.rotation.set(0.5, 0.3, 0.1); // Natural arm angle

    // Right arm (visible in lower right of viewport)
    const rightArmPivot = new THREE.Group();
    const rightArm = new THREE.Mesh(armGeo, armMaterial.clone());
    rightArm.position.y = -0.20; // Offset down from pivot
    rightArm.renderOrder = 9998;
    rightArm.layers.set(1);
    rightArmPivot.add(rightArm);
    rightArmPivot.position.set(0.35, -0.40, -0.35); // Further to edge of viewport
    rightArmPivot.rotation.set(0.5, -0.3, -0.1); // Natural arm angle

    group.add(leftArmPivot);
    group.add(rightArmPivot);

    group.userData.parts = {
        leftArm: leftArmPivot,
        rightArm: rightArmPivot,
        leftArmMesh: leftArm,
        rightArmMesh: rightArm,
    };

    group.layers.set(1);
    group.renderOrder = 9998;
    group.visible = true;

    return group;
}

/**
 * ViewmodelArmsAnimator class for managing first-person arm animations.
 */
export class ViewmodelArmsAnimator {
    constructor() {
        /** @type {number} Walk phase for viewmodel animation */
        this.walkPhase = 0;

        /** @type {THREE.Group|null} The viewmodel arms group */
        this.armsModel = null;
    }

    /**
     * Set the arms model to animate.
     * @param {THREE.Group} model - Viewmodel arms group
     */
    setModel(model) {
        this.armsModel = model;
    }

    /**
     * Animate viewmodel arms based on movement state.
     * @param {number} dt - Delta time in seconds
     * @param {Object} state - Movement state
     * @param {boolean} state.isSwimming - Player is swimming
     * @param {boolean} state.isFlying - Player is flying
     * @param {boolean} state.isMoving - Player is moving
     * @param {boolean} state.isSprinting - Player is sprinting
     */
    animate(dt, state) {
        if (!this.armsModel) return;
        const parts = this.armsModel.userData.parts;
        if (!parts) return;

        let bobAmplitude = 0;
        let bobSpeed = 0;
        let swayAmount = 0;

        if (state.isSwimming) {
            bobAmplitude = 0.08;
            bobSpeed = 2.5;
            swayAmount = 0.03;
        } else if (state.isFlying && state.isMoving) {
            bobAmplitude = 0.02;
            bobSpeed = 2;
        } else if (state.isMoving) {
            bobAmplitude = state.isSprinting ? 0.06 : 0.03;
            bobSpeed = state.isSprinting ? 7 : 4;
            swayAmount = state.isSprinting ? 0.02 : 0.01;
        }

        if (bobSpeed > 0) {
            this.walkPhase += dt * bobSpeed;
            const bob = Math.sin(this.walkPhase) * bobAmplitude;
            const sway = Math.cos(this.walkPhase * 0.5) * swayAmount;

            if (parts.leftArm) {
                parts.leftArm.position.y = -0.40 + bob;
                parts.leftArm.rotation.x = 0.5 + bob * 2;
                parts.leftArm.rotation.z = 0.1 + sway;
            }
            if (parts.rightArm) {
                parts.rightArm.position.y = -0.40 - bob * 0.5;
                parts.rightArm.rotation.x = 0.5 - bob * 2;
                parts.rightArm.rotation.z = -0.1 - sway;
            }
        }
    }

    /**
     * Reset walk phase (call on state transitions).
     */
    reset() {
        this.walkPhase = 0;
    }
}

/**
 * Animate viewmodel arms based on movement state (standalone function).
 * For use when not using the ViewmodelArmsAnimator class.
 * @param {THREE.Group} armsModel - Viewmodel arms group
 * @param {number} dt - Delta time in seconds
 * @param {Object} state - Movement state
 * @param {Object} animState - Animation state object with walkPhase property
 */
export function animateViewmodelArms(armsModel, dt, state, animState) {
    if (!armsModel) return;
    const parts = armsModel.userData.parts;
    if (!parts) return;

    let bobAmplitude = 0;
    let bobSpeed = 0;
    let swayAmount = 0;

    if (state.isSwimming) {
        bobAmplitude = 0.08;
        bobSpeed = 2.5;
        swayAmount = 0.03;
    } else if (state.isFlying && state.isMoving) {
        bobAmplitude = 0.02;
        bobSpeed = 2;
    } else if (state.isMoving) {
        bobAmplitude = state.isSprinting ? 0.06 : 0.03;
        bobSpeed = state.isSprinting ? 7 : 4;
        swayAmount = state.isSprinting ? 0.02 : 0.01;
    }

    if (bobSpeed > 0) {
        animState.walkPhase = (animState.walkPhase ?? 0) + dt * bobSpeed;
        const bob = Math.sin(animState.walkPhase) * bobAmplitude;
        const sway = Math.cos(animState.walkPhase * 0.5) * swayAmount;

        if (parts.leftArm) {
            parts.leftArm.position.y = -0.40 + bob;
            parts.leftArm.rotation.x = 0.5 + bob * 2;
            parts.leftArm.rotation.z = 0.1 + sway;
        }
        if (parts.rightArm) {
            parts.rightArm.position.y = -0.40 - bob * 0.5;
            parts.rightArm.rotation.x = 0.5 - bob * 2;
            parts.rightArm.rotation.z = -0.1 - sway;
        }
    }
}

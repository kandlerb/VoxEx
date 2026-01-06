/**
 * Zombie model building and animation functions
 * Creates articulated zombie mesh with procedural textures.
 * @module render/models/ZombieModel
 */

import { ZOMBIE_PROPORTIONS } from '../../config/ZombieConfig.js';
import { buildArticulatedMesh } from './PlayerModel.js';

/**
 * Zombie skin color palettes with weighted selection.
 * @type {Array<{name: string, weight: number, base: string[], dark: string[]}>}
 */
export const ZOMBIE_SKIN_COLORS = [
    // Human-like tones (subtle variation for voxel shading)
    { name: 'human-light', weight: 1.1, base: ['#f1d1b2', '#e7c3a0', '#d9ad8a'], dark: ['#c99a78', '#b88463', '#a66f4f'] },
    { name: 'human-medium', weight: 1.1, base: ['#d5a16f', '#c18a5c', '#b17a4f'], dark: ['#9a6a3e', '#845830', '#6b4726'] },
    { name: 'human-dark', weight: 1, base: ['#a87655', '#966444', '#855636'], dark: ['#6e3f24', '#5c331c', '#4b2715'] },
    { name: 'human-very-dark', weight: 1, base: ['#75482b', '#633c23', '#52321d'], dark: ['#3c2413', '#2f1a0e', '#24130a'] },
    // Fantasy hues for variety
    { name: 'undead-green', weight: 0.9, base: ['#3a5a35', '#2f4a2b', '#263c22'], dark: ['#1a2818', '#243520', '#2b3f26'] },
    { name: 'undead-gray', weight: 0.85, base: ['#4a5a45', '#3f4a3b', '#344039'], dark: ['#252d24', '#2a332a', '#1f2721'] },
    { name: 'undead-brown', weight: 0.85, base: ['#5a4a3a', '#4a3f2f', '#3a3422'], dark: ['#2d241a', '#332920', '#281f16'] },
    { name: 'undead-blue', weight: 0.8, base: ['#3a4a5a', '#2f3f4a', '#223440'], dark: ['#1a2430', '#20283a', '#162028'] },
    { name: 'undead-purple', weight: 0.8, base: ['#4a3a4a', '#3f2f3f', '#342234'], dark: ['#24182d', '#2a1d33', '#1f1428'] },
];

/**
 * Zombie eye types
 * @type {Array<{color: string, glow: string}>}
 */
export const ZOMBIE_EYE_TYPES = [
    { color: '#d9c002', glow: '#5e3f01' }, // Orange/yellow eyes
];

/**
 * Zombie mouth types
 * @type {string[]}
 */
export const ZOMBIE_MOUTH_TYPES = ['line', 'frown', 'open', 'crooked', 'wide'];

/**
 * Zombie clothing theme definitions.
 * @type {Array<Object>}
 */
export const ZOMBIE_CLOTHING_THEMES = [
    {
        name: 'corroded-teal',
        shirt: ['#1f5a65', '#1a4d57', '#234b55', '#1c414b'],
        pants: ['#1a2d55', '#15243f', '#0f1f35', '#0b1728'],
        trim: ['#0d0f0f', '#16191c', '#1f2529'],
        grime: ['#0f1a1f', '#141f26', '#1a252d', '#0a0f13'],
    },
    {
        name: 'ashen-rag',
        shirt: ['#2f3a3f', '#273035', '#353f45', '#1f282c'],
        pants: ['#2a2a3a', '#1f1f30', '#171726', '#12121c'],
        trim: ['#0f0f13', '#1c1c1f', '#232328'],
        grime: ['#1a1816', '#221f1c', '#2a2622', '#312c27'],
    },
    {
        name: 'rusted-brown',
        shirt: ['#4a3828', '#3f3020', '#352818', '#2a2010'],
        pants: ['#2a2820', '#201f18', '#181710', '#100f08'],
        trim: ['#1a1510', '#120f0a', '#0a0805'],
        grime: ['#201810', '#2a2018', '#352820', '#151008'],
    },
];

/**
 * Pick a zombie skin color index using weighted selection.
 * @returns {number} Index into ZOMBIE_SKIN_COLORS
 */
export function pickZombieSkinIndex() {
    let totalWeight = 0;
    for (let i = 0; i < ZOMBIE_SKIN_COLORS.length; i++) {
        totalWeight += ZOMBIE_SKIN_COLORS[i].weight ?? 1;
    }
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < ZOMBIE_SKIN_COLORS.length; i++) {
        roll -= ZOMBIE_SKIN_COLORS[i].weight ?? 1;
        if (roll <= 0) return i;
    }
    return ZOMBIE_SKIN_COLORS.length - 1;
}

/**
 * Pick a random zombie clothing palette.
 * @returns {Object} Clothing palette with shirt, pants, trim, grime arrays
 */
export function pickZombieClothingPalette() {
    const theme = ZOMBIE_CLOTHING_THEMES[Math.floor(Math.random() * ZOMBIE_CLOTHING_THEMES.length)];
    return {
        name: theme.name,
        shirt: theme.shirt,
        arms: theme.shirt,
        pants: theme.pants,
        trim: theme.trim,
        grime: theme.grime,
        grimeProbability: 0.3 + Math.random() * 0.3,
        tearProbability: 0.2 + Math.random() * 0.2,
    };
}

/**
 * Fill a rounded pixel on canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} step
 * @param {number} x
 * @param {number} y
 * @param {string} color
 */
function fillRoundedPixel(ctx, step, x, y, color) {
    const startX = Math.round(x * step);
    const startY = Math.round(y * step);
    const endX = Math.round((x + 1) * step);
    const endY = Math.round((y + 1) * step);
    ctx.fillStyle = color;
    ctx.fillRect(startX, startY, Math.max(1, endX - startX), Math.max(1, endY - startY));
}

/**
 * Apply pixel dithering to canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} resolution
 * @param {number} step
 * @param {number} strength
 */
function applyPixelDither(ctx, resolution, step, strength = 0.08) {
    const ditherCount = Math.max(resolution * resolution * 0.25, resolution * 2);
    const alpha = strength / Math.max(12, resolution);
    for (let i = 0; i < ditherCount; i++) {
        const x = Math.floor(Math.random() * resolution);
        const y = Math.floor(Math.random() * resolution);
        ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
        const startX = Math.round(x * step);
        const startY = Math.round(y * step);
        const endX = Math.round((x + 1) * step);
        const endY = Math.round((y + 1) * step);
        ctx.fillRect(startX, startY, Math.max(1, endX - startX), Math.max(1, endY - startY));
    }
}

/**
 * Generate a basic zombie skin texture.
 * @param {number} pixelsPerTile - Resolution (e.g., 16)
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.CanvasTexture}
 */
export function generateZombieTexture(pixelsPerTile, THREE) {
    const TILE_SIZE = pixelsPerTile * 4;
    const cvs = document.createElement('canvas');
    cvs.width = TILE_SIZE;
    cvs.height = TILE_SIZE;
    const ctx = cvs.getContext('2d');
    const STEP = TILE_SIZE / pixelsPerTile;

    // Darker, rotted skin base with greenish-gray tones
    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const r = Math.random();
            const base = r > 0.6 ? '#3a5a35' : r > 0.3 ? '#2f4a2b' : '#263c22';
            fillRoundedPixel(ctx, STEP, x, y, base);
        }
    }

    // Add darker mottling and decay spots
    const mottles = pixelsPerTile * 3;
    for (let i = 0; i < mottles; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        const r = Math.random();
        const color = r > 0.7 ? '#1a2818' : r > 0.4 ? '#243520' : '#2b3f26';
        fillRoundedPixel(ctx, STEP, x, y, color);
    }

    // Torn/dirty shirt (darker teal/gray)
    const shirtStart = Math.floor(pixelsPerTile * 0.4);
    const shirtHeight = Math.floor(pixelsPerTile * 0.25);
    for (let y = shirtStart; y < shirtStart + shirtHeight; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const r = Math.random();
            const shade = r > 0.5 ? '#1f5a65' : '#1a4d57';
            if (r > 0.85) continue; // holes
            fillRoundedPixel(ctx, STEP, x, y, shade);
        }
    }

    // Tattered pants (darker blue/gray)
    const pantStart = Math.floor(pixelsPerTile * 0.7);
    for (let y = pantStart; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const r = Math.random();
            const shade = r > 0.5 ? '#1a2d55' : '#15243f';
            if (r > 0.88) continue; // wear patterns
            fillRoundedPixel(ctx, STEP, x, y, shade);
        }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
}

/**
 * Generate zombie head texture with face features.
 * @param {number} skinColorIndex - Index into ZOMBIE_SKIN_COLORS
 * @param {number} eyeTypeIndex - Index into ZOMBIE_EYE_TYPES
 * @param {number} mouthTypeIndex - Index into ZOMBIE_MOUTH_TYPES
 * @param {number} pixelsPerTile - Resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.MeshLambertMaterial[]} Array of 6 materials for box faces
 */
export function generateZombieHeadMaterials(skinColorIndex, eyeTypeIndex, mouthTypeIndex, pixelsPerTile, THREE) {
    const skinColors = ZOMBIE_SKIN_COLORS[skinColorIndex] ?? ZOMBIE_SKIN_COLORS[0];
    const eyeType = ZOMBIE_EYE_TYPES[eyeTypeIndex] ?? ZOMBIE_EYE_TYPES[0];
    const TILE_SIZE = pixelsPerTile * 2;
    const STEP = TILE_SIZE / pixelsPerTile;
    const materials = [];

    // Generate 6 faces (right, left, top, bottom, front, back)
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const cvs = document.createElement('canvas');
        cvs.width = TILE_SIZE;
        cvs.height = TILE_SIZE;
        const ctx = cvs.getContext('2d');

        const isFront = faceIdx === 4;
        const isTop = faceIdx === 2;

        // Fill with skin color
        for (let y = 0; y < pixelsPerTile; y++) {
            for (let x = 0; x < pixelsPerTile; x++) {
                const r = Math.random();
                const colorArr = r > 0.6 ? skinColors.dark : skinColors.base;
                const color = colorArr[Math.floor(Math.random() * colorArr.length)];
                fillRoundedPixel(ctx, STEP, x, y, color);
            }
        }

        // Add mottling
        const mottles = Math.floor(pixelsPerTile * 1.5);
        for (let i = 0; i < mottles; i++) {
            const x = Math.floor(Math.random() * pixelsPerTile);
            const y = Math.floor(Math.random() * pixelsPerTile);
            const color = skinColors.dark[Math.floor(Math.random() * skinColors.dark.length)];
            fillRoundedPixel(ctx, STEP, x, y, color);
        }

        // Add face features on front face
        if (isFront) {
            const eyeY = Math.floor(pixelsPerTile * 0.36);
            const eyeLeftX = Math.floor(pixelsPerTile * 0.30);
            const eyeRightX = Math.floor(pixelsPerTile * 0.70);
            const mouthY = Math.floor(pixelsPerTile * 0.75);

            // Eyes
            fillRoundedPixel(ctx, STEP, eyeLeftX, eyeY, eyeType.color);
            fillRoundedPixel(ctx, STEP, eyeRightX, eyeY, eyeType.color);
            // Pupils
            fillRoundedPixel(ctx, STEP, eyeLeftX, eyeY + 1, eyeType.glow);
            fillRoundedPixel(ctx, STEP, eyeRightX, eyeY + 1, eyeType.glow);

            // Mouth line
            const mouthStartX = Math.floor(pixelsPerTile * 0.35);
            const mouthEndX = Math.floor(pixelsPerTile * 0.65);
            for (let mx = mouthStartX; mx <= mouthEndX; mx++) {
                fillRoundedPixel(ctx, STEP, mx, mouthY, '#2a1a1a');
            }
        }

        applyPixelDither(ctx, pixelsPerTile, STEP, 0.08);

        const tex = new THREE.CanvasTexture(cvs);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        materials.push(new THREE.MeshLambertMaterial({ map: tex }));
    }

    return materials;
}

/**
 * Generate zombie body material.
 * @param {Object} skinColors - Skin color palette
 * @param {Object} clothingPalette - Clothing color palette
 * @param {number} pixelsPerTile - Resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.MeshLambertMaterial}
 */
export function generateZombieBodyMaterial(skinColors, clothingPalette, pixelsPerTile, THREE) {
    const TILE_SIZE = pixelsPerTile * 2;
    const STEP = TILE_SIZE / pixelsPerTile;
    const cvs = document.createElement('canvas');
    cvs.width = TILE_SIZE;
    cvs.height = TILE_SIZE;
    const ctx = cvs.getContext('2d');

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const v = y / pixelsPerTile;
            const r = Math.random();
            let color;

            if (v < 0.55) {
                // Shirt region
                const shirtArr = clothingPalette.shirt;
                color = shirtArr[Math.floor(Math.random() * shirtArr.length)];
                // Add tears
                if (r > 1 - clothingPalette.tearProbability) {
                    const skinArr = r > 0.5 ? skinColors.dark : skinColors.base;
                    color = skinArr[Math.floor(Math.random() * skinArr.length)];
                }
            } else {
                // Pants region
                const pantsArr = clothingPalette.pants;
                color = pantsArr[Math.floor(Math.random() * pantsArr.length)];
            }

            // Add grime
            if (r < clothingPalette.grimeProbability && clothingPalette.grime) {
                color = clothingPalette.grime[Math.floor(Math.random() * clothingPalette.grime.length)];
            }

            fillRoundedPixel(ctx, STEP, x, y, color);
        }
    }

    applyPixelDither(ctx, pixelsPerTile, STEP, 0.08);

    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: tex });
}

/**
 * Generate zombie arm materials.
 * @param {Object} skinColors - Skin color palette
 * @param {Object} clothingPalette - Clothing color palette
 * @param {number} pixelsPerTile - Resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.MeshLambertMaterial[]}
 */
export function generateZombieArmMaterials(skinColors, clothingPalette, pixelsPerTile, THREE) {
    const materials = [];
    const TILE_SIZE = pixelsPerTile * 2;
    const STEP = TILE_SIZE / pixelsPerTile;

    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const cvs = document.createElement('canvas');
        cvs.width = TILE_SIZE;
        cvs.height = TILE_SIZE;
        const ctx = cvs.getContext('2d');

        for (let y = 0; y < pixelsPerTile; y++) {
            for (let x = 0; x < pixelsPerTile; x++) {
                const v = y / pixelsPerTile;
                const r = Math.random();
                let color;

                if (v < 0.4) {
                    // Sleeve
                    const shirtArr = clothingPalette.shirt;
                    color = shirtArr[Math.floor(Math.random() * shirtArr.length)];
                } else {
                    // Skin
                    const skinArr = r > 0.6 ? skinColors.dark : skinColors.base;
                    color = skinArr[Math.floor(Math.random() * skinArr.length)];
                }

                fillRoundedPixel(ctx, STEP, x, y, color);
            }
        }

        applyPixelDither(ctx, pixelsPerTile, STEP, 0.08);

        const tex = new THREE.CanvasTexture(cvs);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        materials.push(new THREE.MeshLambertMaterial({ map: tex }));
    }

    return materials;
}

/**
 * Generate zombie leg materials.
 * @param {Object} skinColors - Skin color palette
 * @param {Object} clothingPalette - Clothing color palette
 * @param {number} pixelsPerTile - Resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.MeshLambertMaterial[]}
 */
export function generateZombieLegMaterials(skinColors, clothingPalette, pixelsPerTile, THREE) {
    const materials = [];
    const TILE_SIZE = pixelsPerTile * 2;
    const STEP = TILE_SIZE / pixelsPerTile;

    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const cvs = document.createElement('canvas');
        cvs.width = TILE_SIZE;
        cvs.height = TILE_SIZE;
        const ctx = cvs.getContext('2d');

        for (let y = 0; y < pixelsPerTile; y++) {
            for (let x = 0; x < pixelsPerTile; x++) {
                const r = Math.random();
                const pantsArr = clothingPalette.pants;
                let color = pantsArr[Math.floor(Math.random() * pantsArr.length)];

                // Add grime
                if (r < clothingPalette.grimeProbability && clothingPalette.grime) {
                    color = clothingPalette.grime[Math.floor(Math.random() * clothingPalette.grime.length)];
                }

                fillRoundedPixel(ctx, STEP, x, y, color);
            }
        }

        applyPixelDither(ctx, pixelsPerTile, STEP, 0.08);

        const tex = new THREE.CanvasTexture(cvs);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        materials.push(new THREE.MeshLambertMaterial({ map: tex }));
    }

    return materials;
}

/**
 * Generate complete zombie materials set.
 * @param {number} pixelsPerTile - Resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {Object} Materials for head, body, arm, leg
 */
export function generateZombieMaterials(pixelsPerTile, THREE) {
    const skinColorIndex = pickZombieSkinIndex();
    const skinColors = ZOMBIE_SKIN_COLORS[skinColorIndex];
    const eyeTypeIndex = Math.floor(Math.random() * ZOMBIE_EYE_TYPES.length);
    const mouthTypeIndex = Math.floor(Math.random() * ZOMBIE_MOUTH_TYPES.length);
    const clothingPalette = pickZombieClothingPalette();

    return {
        head: generateZombieHeadMaterials(skinColorIndex, eyeTypeIndex, mouthTypeIndex, pixelsPerTile, THREE),
        body: generateZombieBodyMaterial(skinColors, clothingPalette, pixelsPerTile, THREE),
        upperArm: generateZombieArmMaterials(skinColors, clothingPalette, pixelsPerTile, THREE),
        forearm: generateZombieArmMaterials(skinColors, clothingPalette, pixelsPerTile, THREE),
        leg: generateZombieLegMaterials(skinColors, clothingPalette, pixelsPerTile, THREE),
    };
}

/**
 * Build a zombie mesh using the articulated mesh system.
 * @param {number} pixelsPerTile - Texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.Group} Zombie mesh group
 */
export function buildZombieMesh(pixelsPerTile, THREE) {
    const materials = generateZombieMaterials(pixelsPerTile, THREE);
    const mesh = buildArticulatedMesh(ZOMBIE_PROPORTIONS, materials, {
        castShadow: true,
        layer: 0,
        includeTorchHolder: false,
        includeBlockHolder: false
    }, THREE);

    // Initialize animation data
    mesh.userData.walkPhase = 0;
    mesh.userData.idleTimer = 0;
    mesh.userData.pose = null;

    return mesh;
}

/**
 * Smooth pose interpolation helper.
 * @param {Object} pose - Pose cache object
 * @param {string} key - Property key
 * @param {number} target - Target value
 * @param {number} factor - Smoothing factor
 * @param {number} dt - Delta time
 * @returns {number} Smoothed value
 */
function smoothPose(pose, key, target, factor, dt) {
    const current = pose[key] ?? 0;
    const blend = 1 - Math.pow(1 - factor, dt * 60);
    pose[key] = current + (target - current) * blend;
    return pose[key];
}

/**
 * Animate zombie limbs based on state.
 * @param {THREE.Group} mob - Zombie mesh group
 * @param {number} dt - Delta time in seconds
 * @param {string} state - Animation state ('idle', 'wander', 'chase', 'attack')
 * @param {number} moveSpeed - Current movement speed
 */
export function animateZombieLimbs(mob, dt, state, moveSpeed = 0) {
    const parts = mob.userData.parts;
    if (!parts) return;

    const segmentHeight = ZOMBIE_PROPORTIONS.body.segmentHeight;
    const headLocalY = segmentHeight + ZOMBIE_PROPORTIONS.head.height * 0.5;

    // Initialize or get cached pose
    const pose = mob.userData.pose || {
        leftArm: 0, rightArm: 0,
        leftElbow: 0, rightElbow: 0,
        leftLeg: 0, rightLeg: 0,
        leftKnee: 0, rightKnee: 0,
        headX: 0, headY: headLocalY,
        lowerSpineX: 0, lowerSpineZ: 0,
        midSpineX: 0, midSpineZ: 0,
        upperSpineX: 0, upperSpineZ: 0,
    };
    mob.userData.pose = pose;

    const strideRate = Math.min(4.2, Math.max(1.2, 1.2 + moveSpeed * 0.35));
    mob.userData.walkPhase = (mob.userData.walkPhase ?? 0) + dt * strideRate;

    let targetArmL = 0, targetArmR = 0;
    let targetElbowL = 0, targetElbowR = 0;
    let targetLegL = 0, targetLegR = 0;
    let targetKneeL = 0, targetKneeR = 0;
    let targetHeadX = 0, targetHeadY = headLocalY;
    let targetLowerSpineX = 0, targetLowerSpineZ = 0;
    let targetMidSpineX = 0, targetMidSpineZ = 0;
    let targetUpperSpineX = 0, targetUpperSpineZ = 0;

    if (state === 'attack') {
        // Attacking: aggressive arm swings
        const attackPhase = mob.userData.walkPhase * 6;
        const attackSwing = Math.sin(attackPhase) * 0.9;
        targetArmL = -0.3 + attackSwing;
        targetArmR = -0.3 - attackSwing;
        targetElbowL = 0.5 + Math.max(0, attackSwing) * 0.4;
        targetElbowR = 0.5 + Math.max(0, -attackSwing) * 0.4;
        targetHeadX = -0.25;
        targetKneeL = 0.2;
        targetKneeR = 0.2;
        targetLowerSpineX = 0.1;
        targetMidSpineX = 0.15;
        targetUpperSpineX = 0.2;
    } else if (state === 'chase') {
        // Chasing: running with knee and elbow bend
        const phase = mob.userData.walkPhase * 4;
        const swing = Math.sin(phase);
        targetLegL = -swing * 0.6;
        targetLegR = swing * 0.6;
        targetKneeL = Math.max(0, swing) * 0.7;
        targetKneeR = Math.max(0, -swing) * 0.7;
        targetArmL = swing * 0.5;
        targetArmR = -swing * 0.5;
        targetElbowL = 0.3 + Math.abs(swing) * 0.3;
        targetElbowR = 0.3 + Math.abs(swing) * 0.3;
        targetHeadX = -0.08;
        targetLowerSpineX = 0.08;
        targetMidSpineX = 0.06;
        targetUpperSpineX = 0.04;
        targetLowerSpineZ = swing * 0.04;
        targetMidSpineZ = -swing * 0.02;
    } else if (state === 'wander') {
        // Wandering: shambling walk
        const phase = mob.userData.walkPhase * 3;
        const swing = Math.sin(phase);
        targetLegL = -swing * 0.4;
        targetLegR = swing * 0.4;
        targetKneeL = Math.max(0, swing) * 0.5;
        targetKneeR = Math.max(0, -swing) * 0.5;
        targetArmL = -0.4 + swing * 0.15;
        targetArmR = -0.4 - swing * 0.15;
        targetElbowL = 0.4;
        targetElbowR = 0.4;
        targetLowerSpineZ = swing * 0.05;
        targetMidSpineZ = -swing * 0.03;
        targetUpperSpineX = 0.03;
    } else {
        // Idle: subtle movement
        mob.userData.idleTimer = (mob.userData.idleTimer ?? 0) + dt;
        const idlePhase = mob.userData.idleTimer * 0.8;
        targetHeadY = headLocalY + Math.sin(mob.userData.idleTimer * 1.2) * 0.04;
        targetArmL = -0.3 + Math.sin(idlePhase) * 0.08;
        targetArmR = -0.3 + Math.sin(idlePhase + 1) * 0.08;
        targetElbowL = 0.35;
        targetElbowR = 0.35;
        targetLowerSpineZ = Math.sin(idlePhase * 0.5) * 0.02;
        targetUpperSpineX = Math.sin(idlePhase * 0.7) * 0.02;
    }

    // Apply smoothed rotations
    if (parts.leftArm) parts.leftArm.rotation.x = smoothPose(pose, 'leftArm', targetArmL, 0.18, dt);
    if (parts.rightArm) parts.rightArm.rotation.x = smoothPose(pose, 'rightArm', targetArmR, 0.18, dt);
    if (parts.leftLeg) parts.leftLeg.rotation.x = smoothPose(pose, 'leftLeg', targetLegL, 0.12, dt);
    if (parts.rightLeg) parts.rightLeg.rotation.x = smoothPose(pose, 'rightLeg', targetLegR, 0.12, dt);
    if (parts.head) {
        parts.head.rotation.x = smoothPose(pose, 'headX', targetHeadX, 0.2, dt);
        parts.head.position.y = smoothPose(pose, 'headY', targetHeadY, 0.2, dt);
    }

    // Joint rotations
    if (parts.leftKnee) parts.leftKnee.rotation.x = smoothPose(pose, 'leftKnee', Math.max(0, targetKneeL), 0.15, dt);
    if (parts.rightKnee) parts.rightKnee.rotation.x = smoothPose(pose, 'rightKnee', Math.max(0, targetKneeR), 0.15, dt);
    if (parts.leftElbow) parts.leftElbow.rotation.x = smoothPose(pose, 'leftElbow', -Math.max(0, targetElbowL), 0.12, dt);
    if (parts.rightElbow) parts.rightElbow.rotation.x = smoothPose(pose, 'rightElbow', -Math.max(0, targetElbowR), 0.12, dt);

    // Spine rotations
    if (parts.lowerSpine) {
        parts.lowerSpine.rotation.x = smoothPose(pose, 'lowerSpineX', targetLowerSpineX, 0.1, dt);
        parts.lowerSpine.rotation.z = smoothPose(pose, 'lowerSpineZ', targetLowerSpineZ, 0.1, dt);
    }
    if (parts.midSpine) {
        parts.midSpine.rotation.x = smoothPose(pose, 'midSpineX', targetMidSpineX, 0.1, dt);
        parts.midSpine.rotation.z = smoothPose(pose, 'midSpineZ', targetMidSpineZ, 0.1, dt);
    }
    if (parts.upperSpine) {
        parts.upperSpine.rotation.x = smoothPose(pose, 'upperSpineX', targetUpperSpineX, 0.1, dt);
        parts.upperSpine.rotation.z = smoothPose(pose, 'upperSpineZ', targetUpperSpineZ, 0.1, dt);
    }
}

/**
 * Reset zombie mesh animation state (for pooling).
 * @param {THREE.Group} mob - Zombie mesh group
 */
export function resetZombieMesh(mob) {
    mob.userData.walkPhase = 0;
    mob.userData.idleTimer = 0;
    mob.userData.pose = null;

    const parts = mob.userData.parts;
    if (!parts) return;

    // Reset all rotations to default
    if (parts.leftArm) parts.leftArm.rotation.set(0, 0, 0);
    if (parts.rightArm) parts.rightArm.rotation.set(0, 0, 0);
    if (parts.leftLeg) parts.leftLeg.rotation.set(0, 0, 0);
    if (parts.rightLeg) parts.rightLeg.rotation.set(0, 0, 0);
    if (parts.leftKnee) parts.leftKnee.rotation.set(0, 0, 0);
    if (parts.rightKnee) parts.rightKnee.rotation.set(0, 0, 0);
    if (parts.leftElbow) parts.leftElbow.rotation.set(0, 0, 0);
    if (parts.rightElbow) parts.rightElbow.rotation.set(0, 0, 0);
    if (parts.lowerSpine) parts.lowerSpine.rotation.set(0, 0, 0);
    if (parts.midSpine) parts.midSpine.rotation.set(0, 0, 0);
    if (parts.upperSpine) parts.upperSpine.rotation.set(0, 0, 0);
}

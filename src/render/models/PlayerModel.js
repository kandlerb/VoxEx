/**
 * Player model building functions
 * Creates articulated player mesh with procedural textures.
 * @module render/models/PlayerModel
 */

import {
    PLAYER_PROPORTIONS,
    PLAYER_SKIN_COLORS,
    PLAYER_SHIRT_COLORS,
    PLAYER_PANTS_COLORS,
    getPlayerHairPalette
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
            // Apply subtle brightness variation
            const variation = (Math.random() - 0.5) * intensity * 50;

            // Get pixel center coordinates
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
 * Generate player skin texture for a body part.
 * Uses procedural pixel art techniques for quality textures.
 * @param {string} partType - "head", "body", "arm", or "leg"
 * @param {number} textureResolution - Base texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.CanvasTexture}
 */
export function generatePlayerSkinTexture(partType, textureResolution, THREE) {
    const PIXELS_PER_TILE = Math.max(8, Math.round(textureResolution * 0.5));
    const TILE_SIZE = PIXELS_PER_TILE * 2;
    const cvs = document.createElement('canvas');
    cvs.width = TILE_SIZE;
    cvs.height = TILE_SIZE;
    const ctx = cvs.getContext('2d');
    const STEP = TILE_SIZE / PIXELS_PER_TILE;

    const fillPixel = (x, y, color) => fillRoundedPixel(ctx, STEP, x, y, color);

    // Use consistent hair color for this player
    const hairPalette = getPlayerHairPalette();

    for (let y = 0; y < PIXELS_PER_TILE; y++) {
        for (let x = 0; x < PIXELS_PER_TILE; x++) {
            let color;
            const v = y / PIXELS_PER_TILE;
            const u = x / PIXELS_PER_TILE;
            const r = Math.random();

            if (partType === 'head') {
                // Hair on top ~30%, skin below with subtle shading
                if (v < 0.30) {
                    // Hair with variation
                    if (r > 0.7) color = hairPalette.highlight;
                    else if (r > 0.3) color = hairPalette.base;
                    else color = hairPalette.shadow;
                } else {
                    // Skin with subtle shadow on edges
                    const edgeFactor = Math.min(u, 1 - u, v - 0.3, 1 - v) * 4;
                    if (edgeFactor < 0.3 || r > 0.75) {
                        color = PLAYER_SKIN_COLORS.shadow[Math.floor(Math.random() * PLAYER_SKIN_COLORS.shadow.length)];
                    } else if (r > 0.15) {
                        color = PLAYER_SKIN_COLORS.base[Math.floor(Math.random() * PLAYER_SKIN_COLORS.base.length)];
                    } else {
                        color = PLAYER_SKIN_COLORS.highlight[Math.floor(Math.random() * PLAYER_SKIN_COLORS.highlight.length)];
                    }
                }
            } else if (partType === 'body') {
                // Shirt on top ~60%, pants below
                const isEdge = u < 0.15 || u > 0.85;
                if (v < 0.55) {
                    // Shirt region
                    if (isEdge || r > 0.75) {
                        color = PLAYER_SHIRT_COLORS.shadow[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.shadow.length)];
                    } else if (r > 0.2) {
                        color = PLAYER_SHIRT_COLORS.base[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.base.length)];
                    } else {
                        color = PLAYER_SHIRT_COLORS.highlight[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.highlight.length)];
                    }
                } else {
                    // Pants region
                    if (isEdge || r > 0.75) {
                        color = PLAYER_PANTS_COLORS.shadow[Math.floor(Math.random() * PLAYER_PANTS_COLORS.shadow.length)];
                    } else if (r > 0.2) {
                        color = PLAYER_PANTS_COLORS.base[Math.floor(Math.random() * PLAYER_PANTS_COLORS.base.length)];
                    } else {
                        color = PLAYER_PANTS_COLORS.highlight[Math.floor(Math.random() * PLAYER_PANTS_COLORS.highlight.length)];
                    }
                }
            } else if (partType === 'arm') {
                // Sleeve at top, skin below (for viewmodel arms)
                const isEdge = u < 0.15 || u > 0.85;
                if (v < 0.4) {
                    // Sleeve
                    if (isEdge || r > 0.75) {
                        color = PLAYER_SHIRT_COLORS.shadow[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.shadow.length)];
                    } else if (r > 0.2) {
                        color = PLAYER_SHIRT_COLORS.base[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.base.length)];
                    } else {
                        color = PLAYER_SHIRT_COLORS.highlight[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.highlight.length)];
                    }
                } else {
                    // Skin
                    if (isEdge || r > 0.7) {
                        color = PLAYER_SKIN_COLORS.shadow[Math.floor(Math.random() * PLAYER_SKIN_COLORS.shadow.length)];
                    } else if (r > 0.15) {
                        color = PLAYER_SKIN_COLORS.base[Math.floor(Math.random() * PLAYER_SKIN_COLORS.base.length)];
                    } else {
                        color = PLAYER_SKIN_COLORS.highlight[Math.floor(Math.random() * PLAYER_SKIN_COLORS.highlight.length)];
                    }
                }
            } else if (partType === 'leg') {
                // All pants
                const isEdge = u < 0.15 || u > 0.85;
                if (isEdge || r > 0.75) {
                    color = PLAYER_PANTS_COLORS.shadow[Math.floor(Math.random() * PLAYER_PANTS_COLORS.shadow.length)];
                } else if (r > 0.2) {
                    color = PLAYER_PANTS_COLORS.base[Math.floor(Math.random() * PLAYER_PANTS_COLORS.base.length)];
                } else {
                    color = PLAYER_PANTS_COLORS.highlight[Math.floor(Math.random() * PLAYER_PANTS_COLORS.highlight.length)];
                }
            }

            fillPixel(x, y, color);
        }
    }

    applyPixelDither(ctx, PIXELS_PER_TILE, STEP, 0.08);

    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    return tex;
}

/**
 * Generate per-face materials for player head.
 * Each face has appropriate hair/skin distribution.
 * @param {number} textureResolution - Base texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.MeshLambertMaterial[]}
 */
export function generatePlayerHeadMaterials(textureResolution, THREE) {
    const PIXELS_PER_TILE = Math.max(8, Math.round(textureResolution * 0.5));
    const TILE_SIZE = PIXELS_PER_TILE * 2;
    const STEP = TILE_SIZE / PIXELS_PER_TILE;

    const hairPalette = getPlayerHairPalette();
    const materials = [];

    // Face indices: 0=right, 1=left, 2=top, 3=bottom, 4=front, 5=back
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const cvs = document.createElement('canvas');
        cvs.width = TILE_SIZE;
        cvs.height = TILE_SIZE;
        const ctx = cvs.getContext('2d');
        const fillPixel = (x, y, color) => fillRoundedPixel(ctx, STEP, x, y, color);

        const isFront = faceIdx === 4;
        const isTop = faceIdx === 2;
        const isBottom = faceIdx === 3;
        const isSide = faceIdx === 0 || faceIdx === 1;
        const isBack = faceIdx === 5;

        // Hair extends further down on sides and back
        const hairLine = isTop ? PIXELS_PER_TILE :
                        isBottom ? 0 :
                        isSide ? Math.floor(PIXELS_PER_TILE * 0.45) :
                        isBack ? Math.floor(PIXELS_PER_TILE * 0.40) :
                        Math.floor(PIXELS_PER_TILE * 0.30); // front

        for (let y = 0; y < PIXELS_PER_TILE; y++) {
            for (let x = 0; x < PIXELS_PER_TILE; x++) {
                let color;
                const r = Math.random();
                const u = x / PIXELS_PER_TILE;

                if (isTop) {
                    // Top of head is all hair
                    if (r > 0.7) color = hairPalette.highlight;
                    else if (r > 0.3) color = hairPalette.base;
                    else color = hairPalette.shadow;
                } else if (isBottom) {
                    // Bottom (chin/neck) is skin
                    if (r > 0.7) color = PLAYER_SKIN_COLORS.shadow[0];
                    else color = PLAYER_SKIN_COLORS.base[Math.floor(Math.random() * PLAYER_SKIN_COLORS.base.length)];
                } else if (y < hairLine) {
                    // Hair region
                    if (r > 0.7) color = hairPalette.highlight;
                    else if (r > 0.3) color = hairPalette.base;
                    else color = hairPalette.shadow;
                } else {
                    // Skin region with edge shading
                    const edgeFactor = Math.min(u, 1 - u) * 4;
                    if (edgeFactor < 0.3 || r > 0.75) {
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

        // Add face features on front face
        if (isFront) {
            const eyeY = Math.floor(PIXELS_PER_TILE * 0.42);
            const eyeLeftX = Math.floor(PIXELS_PER_TILE * 0.30);
            const eyeRightX = Math.floor(PIXELS_PER_TILE * 0.70);
            const mouthY = Math.floor(PIXELS_PER_TILE * 0.72);
            const mouthStartX = Math.floor(PIXELS_PER_TILE * 0.35);
            const mouthEndX = Math.floor(PIXELS_PER_TILE * 0.65);

            // Eyes (white with dark pupil)
            fillPixel(eyeLeftX, eyeY, '#ffffff');
            fillPixel(eyeLeftX, eyeY + 1, '#2a2a2a');
            fillPixel(eyeRightX, eyeY, '#ffffff');
            fillPixel(eyeRightX, eyeY + 1, '#2a2a2a');

            // Simple mouth line
            for (let mx = mouthStartX; mx <= mouthEndX; mx++) {
                fillPixel(mx, mouthY, '#8b5a5a');
            }
        }

        applyPixelDither(ctx, PIXELS_PER_TILE, STEP, 0.08);

        const tex = new THREE.CanvasTexture(cvs);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;

        materials.push(new THREE.MeshLambertMaterial({ map: tex }));
    }

    return materials;
}

/**
 * Generate per-face materials for upper arm (all sleeve).
 * @param {number} textureResolution - Base texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.MeshLambertMaterial[]}
 */
export function generatePlayerUpperArmMaterials(textureResolution, THREE) {
    const PIXELS_PER_TILE = Math.max(8, Math.round(textureResolution * 0.5));
    const TILE_SIZE = PIXELS_PER_TILE * 2;
    const STEP = TILE_SIZE / PIXELS_PER_TILE;
    const materials = [];

    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const cvs = document.createElement('canvas');
        cvs.width = TILE_SIZE;
        cvs.height = TILE_SIZE;
        const ctx = cvs.getContext('2d');
        const fillPixel = (x, y, color) => fillRoundedPixel(ctx, STEP, x, y, color);

        for (let y = 0; y < PIXELS_PER_TILE; y++) {
            for (let x = 0; x < PIXELS_PER_TILE; x++) {
                const u = x / PIXELS_PER_TILE;
                const r = Math.random();
                const isEdge = u < 0.15 || u > 0.85;
                let color;

                // All sleeve/shirt - no skin on upper arm
                if (isEdge || r > 0.75) {
                    color = PLAYER_SHIRT_COLORS.shadow[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.shadow.length)];
                } else if (r > 0.2) {
                    color = PLAYER_SHIRT_COLORS.base[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.base.length)];
                } else {
                    color = PLAYER_SHIRT_COLORS.highlight[Math.floor(Math.random() * PLAYER_SHIRT_COLORS.highlight.length)];
                }
                fillPixel(x, y, color);
            }
        }

        applyPixelDither(ctx, PIXELS_PER_TILE, STEP, 0.08);

        const tex = new THREE.CanvasTexture(cvs);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;

        materials.push(new THREE.MeshLambertMaterial({ map: tex }));
    }

    return materials;
}

/**
 * Generate per-face materials for forearm (all skin).
 * @param {number} textureResolution - Base texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.MeshLambertMaterial[]}
 */
export function generatePlayerForearmMaterials(textureResolution, THREE) {
    const PIXELS_PER_TILE = Math.max(8, Math.round(textureResolution * 0.5));
    const TILE_SIZE = PIXELS_PER_TILE * 2;
    const STEP = TILE_SIZE / PIXELS_PER_TILE;
    const materials = [];

    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const cvs = document.createElement('canvas');
        cvs.width = TILE_SIZE;
        cvs.height = TILE_SIZE;
        const ctx = cvs.getContext('2d');
        const fillPixel = (x, y, color) => fillRoundedPixel(ctx, STEP, x, y, color);

        for (let y = 0; y < PIXELS_PER_TILE; y++) {
            for (let x = 0; x < PIXELS_PER_TILE; x++) {
                const u = x / PIXELS_PER_TILE;
                const r = Math.random();
                const isEdge = u < 0.15 || u > 0.85;
                let color;

                // All skin - bare forearm
                if (isEdge || r > 0.7) {
                    color = PLAYER_SKIN_COLORS.shadow[Math.floor(Math.random() * PLAYER_SKIN_COLORS.shadow.length)];
                } else if (r > 0.15) {
                    color = PLAYER_SKIN_COLORS.base[Math.floor(Math.random() * PLAYER_SKIN_COLORS.base.length)];
                } else {
                    color = PLAYER_SKIN_COLORS.highlight[Math.floor(Math.random() * PLAYER_SKIN_COLORS.highlight.length)];
                }
                fillPixel(x, y, color);
            }
        }

        applyPixelDither(ctx, PIXELS_PER_TILE, STEP, 0.08);

        const tex = new THREE.CanvasTexture(cvs);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;

        materials.push(new THREE.MeshLambertMaterial({ map: tex }));
    }

    return materials;
}

/**
 * Generate complete material set for player body.
 * @param {number} textureResolution - Base texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {Object} Material set for body parts
 */
export function generatePlayerMaterials(textureResolution, THREE) {
    return {
        head: generatePlayerHeadMaterials(textureResolution, THREE),
        body: new THREE.MeshLambertMaterial({ map: generatePlayerSkinTexture('body', textureResolution, THREE) }),
        upperArm: generatePlayerUpperArmMaterials(textureResolution, THREE),
        forearm: generatePlayerForearmMaterials(textureResolution, THREE),
        leg: new THREE.MeshLambertMaterial({ map: generatePlayerSkinTexture('leg', textureResolution, THREE) }),
    };
}

/**
 * Build an articulated humanoid mesh with 3-segment spine.
 * Used for both player and zombie characters.
 * Kinematic chain: group → lowerSpine → midSpine → upperSpine → (head, arms)
 *                                  ↳ legs
 * @param {Object} proportions - PLAYER_PROPORTIONS or similar
 * @param {Object} materials - Material set for body parts
 * @param {Object} options - { castShadow, layer, includeTorchHolder, includeBlockHolder }
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.Group} Articulated mesh group with parts in userData
 */
export function buildArticulatedMesh(proportions, materials, options, THREE) {
    const group = new THREE.Group();
    const { head, body, leg, shoulderY, hipY, arm } = proportions;
    const {
        castShadow = false,
        layer = 0,
        includeTorchHolder = false,
        includeBlockHolder = false
    } = options;

    // Segment height (body split into 3 equal parts)
    const segmentHeight = body.segmentHeight;  // 0.25 each

    // =============================================
    // SPINE HIERARCHY: lower → mid → upper
    // =============================================

    // Lower spine pivot (pelvis) - at hip level, root of spine chain
    const lowerSpinePivot = new THREE.Group();
    lowerSpinePivot.position.set(0, hipY, 0);

    // Lower spine mesh (pelvis/lower back)
    const lowerSpineGeo = new THREE.BoxGeometry(body.width, segmentHeight, body.depth);
    const lowerSpineMesh = new THREE.Mesh(lowerSpineGeo, materials.body);
    lowerSpineMesh.position.y = segmentHeight * 0.5;
    lowerSpineMesh.position.z = body.depth * 0.5;
    lowerSpineMesh.castShadow = castShadow;
    lowerSpineMesh.receiveShadow = true;
    lowerSpinePivot.add(lowerSpineMesh);

    // Mid spine pivot
    const midSpinePivot = new THREE.Group();
    midSpinePivot.position.y = segmentHeight;
    lowerSpinePivot.add(midSpinePivot);

    // Mid spine mesh (abdomen)
    const midSpineGeo = new THREE.BoxGeometry(body.width, segmentHeight, body.depth);
    const midSpineMesh = new THREE.Mesh(midSpineGeo, materials.body);
    midSpineMesh.position.y = segmentHeight * 0.5;
    midSpineMesh.position.z = body.depth * 0.5;
    midSpineMesh.castShadow = castShadow;
    midSpineMesh.receiveShadow = true;
    midSpinePivot.add(midSpineMesh);

    // Upper spine pivot
    const upperSpinePivot = new THREE.Group();
    upperSpinePivot.position.y = segmentHeight;
    midSpinePivot.add(upperSpinePivot);

    // Upper spine mesh (chest/shoulders)
    const upperSpineGeo = new THREE.BoxGeometry(body.width, segmentHeight, body.depth);
    const upperSpineMesh = new THREE.Mesh(upperSpineGeo, materials.body);
    upperSpineMesh.position.y = segmentHeight * 0.5;
    upperSpineMesh.position.z = body.depth * 0.5;
    upperSpineMesh.castShadow = castShadow;
    upperSpineMesh.receiveShadow = true;
    upperSpinePivot.add(upperSpineMesh);

    // =============================================
    // HEAD
    // =============================================
    const headGeo = new THREE.BoxGeometry(head.size, head.height, head.size);
    const headMesh = new THREE.Mesh(headGeo, materials.head);
    const headLocalY = segmentHeight + head.height * 0.5;
    headMesh.position.y = headLocalY;
    headMesh.position.z = 0.1;
    headMesh.castShadow = castShadow;
    headMesh.receiveShadow = true;
    upperSpinePivot.add(headMesh);

    // =============================================
    // ARMS
    // =============================================
    const armOffsetX = body.width * 0.5 + arm.thickness * 0.5;
    const shoulderLocalY = segmentHeight;

    // Left arm pivot at shoulder
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(armOffsetX, shoulderLocalY, body.depth * 0.5);
    upperSpinePivot.add(leftArmPivot);

    // Upper arm mesh
    const leftUpperArmGeo = new THREE.BoxGeometry(arm.thickness, arm.upperHeight, arm.thickness);
    const leftUpperArmMesh = new THREE.Mesh(leftUpperArmGeo, materials.upperArm || materials.arm || materials.body);
    leftUpperArmMesh.position.y = -arm.upperHeight * 0.5;
    leftUpperArmMesh.castShadow = castShadow;
    leftUpperArmMesh.receiveShadow = true;
    leftArmPivot.add(leftUpperArmMesh);

    // Elbow pivot
    const leftElbowPivot = new THREE.Group();
    leftElbowPivot.position.y = -arm.upperHeight;
    leftElbowPivot.position.z = -arm.thickness * 0.5;
    leftArmPivot.add(leftElbowPivot);

    // Forearm mesh
    const leftForearmGeo = new THREE.BoxGeometry(arm.thickness * 0.9, arm.forearmHeight, arm.thickness * 0.9);
    const leftForearmMesh = new THREE.Mesh(leftForearmGeo, materials.forearm || materials.arm || materials.body);
    leftForearmMesh.position.y = -arm.forearmHeight * 0.5;
    leftForearmMesh.position.z = arm.thickness * 0.5;
    leftForearmMesh.castShadow = castShadow;
    leftForearmMesh.receiveShadow = true;
    leftElbowPivot.add(leftForearmMesh);

    // Optional torch holder
    let torchHolder = null;
    if (includeTorchHolder) {
        torchHolder = new THREE.Group();
        torchHolder.position.set(0, -arm.forearmHeight + 0.05, arm.thickness * 0.5 + 0.08);
        torchHolder.rotation.set(Math.PI / 2 + 0.174, 0, 0);
        torchHolder.name = 'torchHolder';
        leftElbowPivot.add(torchHolder);
    }

    // Right arm (mirror)
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(-armOffsetX, shoulderLocalY, body.depth * 0.5);
    upperSpinePivot.add(rightArmPivot);

    const rightUpperArmGeo = new THREE.BoxGeometry(arm.thickness, arm.upperHeight, arm.thickness);
    const rightUpperArmMesh = new THREE.Mesh(rightUpperArmGeo, materials.upperArm || materials.arm || materials.body);
    rightUpperArmMesh.position.y = -arm.upperHeight * 0.5;
    rightUpperArmMesh.castShadow = castShadow;
    rightUpperArmMesh.receiveShadow = true;
    rightArmPivot.add(rightUpperArmMesh);

    const rightElbowPivot = new THREE.Group();
    rightElbowPivot.position.y = -arm.upperHeight;
    rightElbowPivot.position.z = -arm.thickness * 0.5;
    rightArmPivot.add(rightElbowPivot);

    const rightForearmGeo = new THREE.BoxGeometry(arm.thickness * 0.9, arm.forearmHeight, arm.thickness * 0.9);
    const rightForearmMesh = new THREE.Mesh(rightForearmGeo, materials.forearm || materials.arm || materials.body);
    rightForearmMesh.position.y = -arm.forearmHeight * 0.5;
    rightForearmMesh.position.z = arm.thickness * 0.5;
    rightForearmMesh.castShadow = castShadow;
    rightForearmMesh.receiveShadow = true;
    rightElbowPivot.add(rightForearmMesh);

    // Optional block holder
    let blockHolder = null;
    if (includeBlockHolder) {
        blockHolder = new THREE.Group();
        blockHolder.position.set(0, -arm.forearmHeight + 0.05, arm.thickness * 0.5 + 0.12);
        blockHolder.rotation.set(0.3, -0.2, 0);
        blockHolder.name = 'blockHolder';
        rightElbowPivot.add(blockHolder);
    }

    // =============================================
    // LEGS
    // =============================================
    const legOffsetX = body.width * 0.5 - leg.thickness * 0.5;

    // Left leg pivot at hip
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(legOffsetX, 0, body.depth * 0.5);
    lowerSpinePivot.add(leftLegPivot);

    // Left thigh
    const leftThighGeo = new THREE.BoxGeometry(leg.thickness, leg.thighHeight, leg.thickness);
    const leftThighMesh = new THREE.Mesh(leftThighGeo, materials.leg);
    leftThighMesh.position.y = -leg.thighHeight * 0.5;
    leftThighMesh.castShadow = castShadow;
    leftThighMesh.receiveShadow = true;
    leftLegPivot.add(leftThighMesh);

    // Left knee pivot
    const leftKneePivot = new THREE.Group();
    leftKneePivot.position.y = -leg.thighHeight;
    leftKneePivot.position.z = leg.thickness * 0.5;
    leftLegPivot.add(leftKneePivot);

    // Left shin
    const leftShinGeo = new THREE.BoxGeometry(leg.thickness * 0.9, leg.shinHeight, leg.thickness * 0.9);
    const leftShinMesh = new THREE.Mesh(leftShinGeo, materials.leg);
    leftShinMesh.position.y = -leg.shinHeight * 0.5;
    leftShinMesh.position.z = -leg.thickness * 0.5;
    leftShinMesh.castShadow = castShadow;
    leftShinMesh.receiveShadow = true;
    leftKneePivot.add(leftShinMesh);

    // Right leg (mirror)
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(-legOffsetX, 0, body.depth * 0.5);
    lowerSpinePivot.add(rightLegPivot);

    const rightThighGeo = new THREE.BoxGeometry(leg.thickness, leg.thighHeight, leg.thickness);
    const rightThighMesh = new THREE.Mesh(rightThighGeo, materials.leg);
    rightThighMesh.position.y = -leg.thighHeight * 0.5;
    rightThighMesh.castShadow = castShadow;
    rightThighMesh.receiveShadow = true;
    rightLegPivot.add(rightThighMesh);

    const rightKneePivot = new THREE.Group();
    rightKneePivot.position.y = -leg.thighHeight;
    rightKneePivot.position.z = leg.thickness * 0.5;
    rightLegPivot.add(rightKneePivot);

    const rightShinGeo = new THREE.BoxGeometry(leg.thickness * 0.9, leg.shinHeight, leg.thickness * 0.9);
    const rightShinMesh = new THREE.Mesh(rightShinGeo, materials.leg);
    rightShinMesh.position.y = -leg.shinHeight * 0.5;
    rightShinMesh.position.z = -leg.thickness * 0.5;
    rightShinMesh.castShadow = castShadow;
    rightShinMesh.receiveShadow = true;
    rightKneePivot.add(rightShinMesh);

    // Add spine chain to group
    group.add(lowerSpinePivot);

    // Store parts for animation
    group.userData.parts = {
        // Spine segments
        lowerSpine: lowerSpinePivot,
        midSpine: midSpinePivot,
        upperSpine: upperSpinePivot,
        body: lowerSpinePivot,  // Alias for backward compatibility
        // Spine meshes
        lowerSpineMesh,
        midSpineMesh,
        upperSpineMesh,
        // Head
        head: headMesh,
        // Arms
        leftArm: leftArmPivot,
        leftElbow: leftElbowPivot,
        rightArm: rightArmPivot,
        rightElbow: rightElbowPivot,
        // Legs
        leftLeg: leftLegPivot,
        leftKnee: leftKneePivot,
        rightLeg: rightLegPivot,
        rightKnee: rightKneePivot,
        // Meshes for material swapping
        leftUpperArmMesh,
        leftForearmMesh,
        rightUpperArmMesh,
        rightForearmMesh,
        leftThighMesh,
        leftShinMesh,
        rightThighMesh,
        rightShinMesh,
        // Holders
        torchHolder,
        blockHolder,
    };

    // Set layer for all objects
    group.layers.set(layer);
    group.traverse(child => child.layers.set(layer));

    group.castShadow = castShadow;
    group.receiveShadow = true;

    return group;
}

/**
 * Build the player body mesh with 3-segment articulated spine.
 * @param {number} textureResolution - Base texture resolution
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.Group} Player body mesh group
 */
export function buildPlayerMesh(textureResolution, THREE) {
    const materials = generatePlayerMaterials(textureResolution, THREE);
    const mesh = buildArticulatedMesh(PLAYER_PROPORTIONS, materials, {
        castShadow: false,
        layer: 2,  // Player body layer
        includeTorchHolder: true,
        includeBlockHolder: true
    }, THREE);
    return mesh;
}

/**
 * Create a torch model for player's hand (third-person view).
 * Uses same style as world torches but without built-in PointLight.
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.Group}
 */
export function createThirdPersonTorch(THREE) {
    const group = new THREE.Group();

    // Torch stick
    const stickGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
    const stickMat = new THREE.MeshLambertMaterial({ color: 0x4a2511 });
    const stick = new THREE.Mesh(stickGeo, stickMat);
    stick.position.set(0, 0, 0);
    stick.castShadow = false;
    stick.receiveShadow = true;
    group.add(stick);

    // Torch flame
    const flameGeo = new THREE.BoxGeometry(0.08, 0.04, 0.08);
    const flameMat = new THREE.MeshLambertMaterial({
        color: 0xffaa33,
        emissive: 0xffaa33,
        emissiveIntensity: 0.5
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(0, 0.27, 0);
    flame.castShadow = false;
    flame.name = 'flame';
    group.add(flame);

    // Torch glow
    const glowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const glowMat = new THREE.MeshLambertMaterial({
        color: 0xffff66,
        emissive: 0xffff66,
        emissiveIntensity: 1.0
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0.33, 0);
    glow.castShadow = false;
    glow.name = 'glow';
    group.add(glow);

    // Set to layer 2 (player body layer)
    group.traverse((child) => {
        child.layers.set(2);
    });

    group.visible = false;
    group.name = 'thirdPersonTorch';

    return group;
}

/**
 * Create a small block mesh for displaying held block in third-person.
 * @param {number} blockId - The block ID to display
 * @param {Object} blockConfig - Block configuration lookup
 * @param {THREE.Material} material - Chunk material for texturing
 * @param {number} numTiles - Number of tiles in atlas
 * @param {typeof THREE} THREE - Three.js module
 * @returns {THREE.Mesh|null} Block mesh or null if air
 */
export function createHeldBlockMesh(blockId, blockConfig, material, numTiles, THREE) {
    if (blockId === 0) return null;  // AIR

    const size = 0.22;
    const geometry = new THREE.BoxGeometry(size, size, size);

    const config = blockConfig[blockId];
    if (!config) return null;

    const uvs = geometry.attributes.uv;
    const tileSize = 1 / numTiles;

    // Use the side tile or 'all' tile for display
    const tileIndex = config.tiles?.side ?? config.tiles?.all ?? 0;
    const uOffset = tileIndex * tileSize;

    // Remap all UVs to this tile
    for (let i = 0; i < uvs.count; i++) {
        const u = uvs.getX(i);
        uvs.setX(i, uOffset + u * tileSize);
    }
    uvs.needsUpdate = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.set(2);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
}

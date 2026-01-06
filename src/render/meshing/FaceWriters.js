/**
 * Face buffer writing utilities for chunk mesh generation.
 * Provides optimized, unrolled functions to write vertex data to buffers.
 * @module render/meshing/FaceWriters
 */

import { NUM_TILES } from '../../config/BlockConfig.js';
import { SETTINGS } from '../../config/Settings.js';

// =====================================================
// Non-Indexed Geometry Writers (6 vertices per face)
// =====================================================

/**
 * Write vertex positions and normals to buffers for a face (6 vertices).
 * Unrolled for performance.
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {number} vIdx - Starting vertex index
 * @param {Float32Array} verts - Face vertex positions (18 values)
 * @param {number} wx - World X offset
 * @param {number} wy - World Y offset
 * @param {number} wz - World Z offset
 * @param {number} nx - Normal X component
 * @param {number} ny - Normal Y component
 * @param {number} nz - Normal Z component
 * @returns {void}
 */
export function writeFaceVertices(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz) {
    // Unrolled for performance (6 vertices × 3 components = 18 writes)
    pos[vIdx + 0] = verts[0] + wx;  pos[vIdx + 1] = verts[1] + wy;  pos[vIdx + 2] = verts[2] + wz;
    norm[vIdx + 0] = nx;            norm[vIdx + 1] = ny;            norm[vIdx + 2] = nz;
    pos[vIdx + 3] = verts[3] + wx;  pos[vIdx + 4] = verts[4] + wy;  pos[vIdx + 5] = verts[5] + wz;
    norm[vIdx + 3] = nx;            norm[vIdx + 4] = ny;            norm[vIdx + 5] = nz;
    pos[vIdx + 6] = verts[6] + wx;  pos[vIdx + 7] = verts[7] + wy;  pos[vIdx + 8] = verts[8] + wz;
    norm[vIdx + 6] = nx;            norm[vIdx + 7] = ny;            norm[vIdx + 8] = nz;
    pos[vIdx + 9] = verts[9] + wx;  pos[vIdx + 10] = verts[10] + wy; pos[vIdx + 11] = verts[11] + wz;
    norm[vIdx + 9] = nx;            norm[vIdx + 10] = ny;           norm[vIdx + 11] = nz;
    pos[vIdx + 12] = verts[12] + wx; pos[vIdx + 13] = verts[13] + wy; pos[vIdx + 14] = verts[14] + wz;
    norm[vIdx + 12] = nx;           norm[vIdx + 13] = ny;           norm[vIdx + 14] = nz;
    pos[vIdx + 15] = verts[15] + wx; pos[vIdx + 16] = verts[16] + wy; pos[vIdx + 17] = verts[17] + wz;
    norm[vIdx + 15] = nx;           norm[vIdx + 16] = ny;           norm[vIdx + 17] = nz;
}

/**
 * Write vertex colors (AO × light) to buffer for a face (6 vertices).
 * @param {Float32Array} col - Color buffer
 * @param {number} cIdx - Starting color index
 * @param {number[]} ao - Array of 4 AO values for face corners
 * @param {number} lightLevel - Light level (normalized 0-1)
 * @returns {void}
 */
export function writeFaceColors(col, cIdx, ao, lightLevel) {
    const c1 = ao[0] * lightLevel;
    const c2 = ao[1] * lightLevel;
    const c3 = ao[2] * lightLevel;
    const c4 = ao[3] * lightLevel;

    // 6 vertices with RGB = 18 components (vertex order: 1,2,4,2,3,4)
    col[cIdx + 0] = c1; col[cIdx + 1] = c1; col[cIdx + 2] = c1;
    col[cIdx + 3] = c2; col[cIdx + 4] = c2; col[cIdx + 5] = c2;
    col[cIdx + 6] = c4; col[cIdx + 7] = c4; col[cIdx + 8] = c4;
    col[cIdx + 9] = c2; col[cIdx + 10] = c2; col[cIdx + 11] = c2;
    col[cIdx + 12] = c3; col[cIdx + 13] = c3; col[cIdx + 14] = c3;
    col[cIdx + 15] = c4; col[cIdx + 16] = c4; col[cIdx + 17] = c4;
}

/**
 * Write UV coordinates to buffer (6 vertices).
 * @param {Float32Array} uvs - UV buffer
 * @param {number} uvIdx - Starting UV index
 * @param {number[]} uv - UV tile offset [u, v]
 * @returns {void}
 */
export function writeFaceUVs(uvs, uvIdx, uv) {
    const tileW = 1 / NUM_TILES;
    const u0 = uv[0];
    const u1 = uv[0] + tileW;
    const v0 = uv[1];
    const v1 = uv[1] + 1.0;

    uvs[uvIdx + 0] = u0;  uvs[uvIdx + 1] = v0;
    uvs[uvIdx + 2] = u1;  uvs[uvIdx + 3] = v0;
    uvs[uvIdx + 4] = u0;  uvs[uvIdx + 5] = v1;
    uvs[uvIdx + 6] = u1;  uvs[uvIdx + 7] = v0;
    uvs[uvIdx + 8] = u1;  uvs[uvIdx + 9] = v1;
    uvs[uvIdx + 10] = u0; uvs[uvIdx + 11] = v1;
}

// =====================================================
// Indexed Geometry Writers (4 vertices per face)
// =====================================================

/**
 * Write 4 vertices for indexed geometry (12 position floats, 12 normal floats).
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {number} vIdx - Starting vertex index (position/normal offset)
 * @param {Float32Array} verts - Cached 4-vertex array (12 floats)
 * @param {number} wx - World X offset
 * @param {number} wy - World Y offset
 * @param {number} wz - World Z offset
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @returns {void}
 */
export function writeFaceVerticesIndexed(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz) {
    // 4 vertices × 3 components = 12 writes
    pos[vIdx + 0] = verts[0] + wx;  pos[vIdx + 1] = verts[1] + wy;  pos[vIdx + 2] = verts[2] + wz;
    norm[vIdx + 0] = nx;            norm[vIdx + 1] = ny;            norm[vIdx + 2] = nz;
    pos[vIdx + 3] = verts[3] + wx;  pos[vIdx + 4] = verts[4] + wy;  pos[vIdx + 5] = verts[5] + wz;
    norm[vIdx + 3] = nx;            norm[vIdx + 4] = ny;            norm[vIdx + 5] = nz;
    pos[vIdx + 6] = verts[6] + wx;  pos[vIdx + 7] = verts[7] + wy;  pos[vIdx + 8] = verts[8] + wz;
    norm[vIdx + 6] = nx;            norm[vIdx + 7] = ny;            norm[vIdx + 8] = nz;
    pos[vIdx + 9] = verts[9] + wx;  pos[vIdx + 10] = verts[10] + wy; pos[vIdx + 11] = verts[11] + wz;
    norm[vIdx + 9] = nx;            norm[vIdx + 10] = ny;           norm[vIdx + 11] = nz;
}

/**
 * Write 4 vertex colors for indexed geometry (12 color floats).
 * @param {Float32Array} col - Color buffer
 * @param {number} cIdx - Starting color index
 * @param {number[]} ao - Array of 4 AO values [v1, v2, v3, v4]
 * @param {number} lightLevel - Light level (normalized 0-1)
 * @returns {void}
 */
export function writeFaceColorsIndexed(col, cIdx, ao, lightLevel) {
    const c1 = ao[0] * lightLevel;
    const c2 = ao[1] * lightLevel;
    const c3 = ao[2] * lightLevel;
    const c4 = ao[3] * lightLevel;
    // 4 vertices × RGB = 12 components
    col[cIdx + 0] = c1; col[cIdx + 1] = c1; col[cIdx + 2] = c1;   // V1
    col[cIdx + 3] = c2; col[cIdx + 4] = c2; col[cIdx + 5] = c2;   // V2
    col[cIdx + 6] = c3; col[cIdx + 7] = c3; col[cIdx + 8] = c3;   // V3
    col[cIdx + 9] = c4; col[cIdx + 10] = c4; col[cIdx + 11] = c4; // V4
}

/**
 * Write 4 UV coordinates for indexed geometry (8 UV floats).
 * @param {Float32Array} uvs - UV buffer
 * @param {number} uvIdx - Starting UV index
 * @param {number[]} uv - UV tile offset [u, v]
 * @returns {void}
 */
export function writeFaceUVsIndexed(uvs, uvIdx, uv) {
    const tileW = 1 / NUM_TILES;
    const u0 = uv[0];
    const u1 = uv[0] + tileW;
    const v0 = uv[1];
    const v1 = uv[1] + 1.0;
    // 4 vertices × 2 components = 8 writes
    uvs[uvIdx + 0] = u0; uvs[uvIdx + 1] = v0;  // V1 bottom-left
    uvs[uvIdx + 2] = u1; uvs[uvIdx + 3] = v0;  // V2 bottom-right
    uvs[uvIdx + 4] = u1; uvs[uvIdx + 5] = v1;  // V3 top-right
    uvs[uvIdx + 6] = u0; uvs[uvIdx + 7] = v1;  // V4 top-left
}

/**
 * Write 6 indices for one face (two triangles).
 * @param {Uint32Array} indices - Index buffer
 * @param {number} iIdx - Starting index offset
 * @param {number} baseVertex - Base vertex index for this face
 * @returns {void}
 */
export function writeFaceIndices(indices, iIdx, baseVertex) {
    // Two triangles: [v1,v2,v4] and [v2,v3,v4]
    indices[iIdx + 0] = baseVertex + 0; // V1
    indices[iIdx + 1] = baseVertex + 1; // V2
    indices[iIdx + 2] = baseVertex + 3; // V4
    indices[iIdx + 3] = baseVertex + 1; // V2
    indices[iIdx + 4] = baseVertex + 2; // V3
    indices[iIdx + 5] = baseVertex + 3; // V4
}

// =====================================================
// Water-Specific Writers
// =====================================================

/**
 * Simple hash function for position-based variation (deterministic noise).
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {number} Hash value in range [0, 1)
 */
export function waterHash(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return ((h ^ (h >> 16)) & 0x7FFFFFFF) / 0x7FFFFFFF;
}

/**
 * Write vertex colors for water with depth-based fog, caustics, and foam effects.
 * Creates foggy, substantial water with visual variation.
 * @param {Float32Array} col - Color buffer
 * @param {number} cIdx - Starting color index
 * @param {number[]} ao - Array of 4 AO values for face corners
 * @param {number} lightLevel - Light level (normalized 0-1)
 * @param {number} waterDepth - Water depth in blocks
 * @param {number} wx - World X
 * @param {number} wy - World Y
 * @param {number} wz - World Z
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @returns {void}
 */
export function writeFaceColorsWater(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
    const fogDensity = SETTINGS.waterFogDensity;
    const maxVisualDepth = 6 + (1 - fogDensity) * 10;
    const depthFactor = Math.min(waterDepth / maxVisualDepth, 1.0);
    const fogEffect = depthFactor * (0.5 + fogDensity * 0.5);

    // Water fog color
    const fogR = 0.1 + (1 - fogDensity) * 0.15;
    const fogG = 0.25 + (1 - fogDensity) * 0.15;
    const fogB = 0.4 + (1 - fogDensity) * 0.1;

    let rMult = 1.0 - fogEffect * (1.0 - fogR);
    let gMult = 1.0 - fogEffect * (1.0 - fogG);
    let bMult = 1.0 - fogEffect * (1.0 - fogB);

    // Caustics effect
    const shallowFactor = 1.0 - depthFactor;
    const causticStrength = shallowFactor * 0.15;
    const caustic1 = waterHash(wx * 2, wy * 3, wz * 2);
    const caustic2 = waterHash(wx * 5 + 17, wy * 7 + 31, wz * 5 + 23);
    const causticPattern = caustic1 * 0.6 + caustic2 * 0.4;
    const causticBoost = 1.0 + (causticPattern - 0.5) * 2 * causticStrength;

    // Surface foam effect
    const isTopFace = ny > 0.5;
    let foamBoost = 1.0;
    if (isTopFace && waterDepth <= 2) {
        const foamNoise = waterHash(wx * 3 + 7, wy, wz * 3 + 11);
        if (foamNoise > 0.6) {
            foamBoost = 1.0 + (foamNoise - 0.6) * 0.5;
            rMult = Math.min(1.0, rMult * 1.1);
            gMult = Math.min(1.0, gMult * 1.05);
        }
    }

    // Depth gradient variation
    const depthVariation = waterHash(wx + 101, wy * 2 + 53, wz + 79);
    const depthMod = 1.0 + (depthVariation - 0.5) * 0.1 * depthFactor;

    // Combine effects
    rMult *= causticBoost * foamBoost * depthMod;
    gMult *= causticBoost * foamBoost * depthMod;
    bMult *= causticBoost * foamBoost;

    // Clamp
    rMult = Math.min(1.2, Math.max(0.0, rMult));
    gMult = Math.min(1.2, Math.max(0.0, gMult));
    bMult = Math.min(1.2, Math.max(0.0, bMult));

    // Apply base water color from settings
    const baseR = ((SETTINGS.waterColor >> 16) & 0xff) / 255;
    const baseG = ((SETTINGS.waterColor >> 8) & 0xff) / 255;
    const baseB = (SETTINGS.waterColor & 0xff) / 255;
    rMult *= baseR;
    gMult *= baseG;
    bMult *= baseB;

    // Per-vertex variation
    const v1Var = 1.0 + (waterHash(wx, wy, wz) - 0.5) * 0.05;
    const v2Var = 1.0 + (waterHash(wx + 1, wy, wz) - 0.5) * 0.05;
    const v3Var = 1.0 + (waterHash(wx + 1, wy, wz + 1) - 0.5) * 0.05;
    const v4Var = 1.0 + (waterHash(wx, wy, wz + 1) - 0.5) * 0.05;

    const c1 = ao[0] * lightLevel * v1Var;
    const c2 = ao[1] * lightLevel * v2Var;
    const c3 = ao[2] * lightLevel * v3Var;
    const c4 = ao[3] * lightLevel * v4Var;

    // Write colors (6 vertices for non-indexed)
    col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
    col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
    col[cIdx + 6] = c4 * rMult; col[cIdx + 7] = c4 * gMult; col[cIdx + 8] = c4 * bMult;
    col[cIdx + 9] = c2 * rMult; col[cIdx + 10] = c2 * gMult; col[cIdx + 11] = c2 * bMult;
    col[cIdx + 12] = c3 * rMult; col[cIdx + 13] = c3 * gMult; col[cIdx + 14] = c3 * bMult;
    col[cIdx + 15] = c4 * rMult; col[cIdx + 16] = c4 * gMult; col[cIdx + 17] = c4 * bMult;
}

/**
 * Write 4 water vertex colors for indexed geometry with depth effects.
 * @param {Float32Array} col - Color buffer
 * @param {number} cIdx - Starting color index
 * @param {number[]} ao - Array of 4 AO values
 * @param {number} lightLevel - Light level (normalized 0-1)
 * @param {number} waterDepth - Water depth in blocks
 * @param {number} wx - World X
 * @param {number} wy - World Y
 * @param {number} wz - World Z
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @returns {void}
 */
export function writeFaceColorsWaterIndexed(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
    const fogDensity = SETTINGS.waterFogDensity;
    const maxVisualDepth = 6 + (1 - fogDensity) * 10;
    const depthFactor = Math.min(waterDepth / maxVisualDepth, 1.0);
    const fogEffect = depthFactor * (0.5 + fogDensity * 0.5);

    const fogR = 0.1 + (1 - fogDensity) * 0.15;
    const fogG = 0.25 + (1 - fogDensity) * 0.15;
    const fogB = 0.4 + (1 - fogDensity) * 0.1;

    let rMult = 1.0 - fogEffect * (1.0 - fogR);
    let gMult = 1.0 - fogEffect * (1.0 - fogG);
    let bMult = 1.0 - fogEffect * (1.0 - fogB);

    // Caustics
    const shallowFactor = 1.0 - depthFactor;
    const causticStrength = shallowFactor * 0.15;
    const caustic1 = waterHash(wx * 2, wy * 3, wz * 2);
    const caustic2 = waterHash(wx * 5 + 17, wy * 7 + 31, wz * 5 + 23);
    const causticPattern = caustic1 * 0.6 + caustic2 * 0.4;
    const causticBoost = 1.0 + (causticPattern - 0.5) * 2 * causticStrength;

    // Foam
    const isTopFace = ny > 0.5;
    let foamBoost = 1.0;
    if (isTopFace && waterDepth <= 2) {
        const foamNoise = waterHash(wx * 3 + 7, wy, wz * 3 + 11);
        if (foamNoise > 0.6) {
            foamBoost = 1.0 + (foamNoise - 0.6) * 0.5;
            rMult = Math.min(1.0, rMult * 1.1);
            gMult = Math.min(1.0, gMult * 1.05);
        }
    }

    // Depth variation
    const depthVariation = waterHash(wx + 101, wy * 2 + 53, wz + 79);
    const depthMod = 1.0 + (depthVariation - 0.5) * 0.1 * depthFactor;

    rMult *= causticBoost * foamBoost * depthMod;
    gMult *= causticBoost * foamBoost * depthMod;
    bMult *= causticBoost * foamBoost;

    rMult = Math.min(1.2, Math.max(0.0, rMult));
    gMult = Math.min(1.2, Math.max(0.0, gMult));
    bMult = Math.min(1.2, Math.max(0.0, bMult));

    // Base water color
    const baseR = ((SETTINGS.waterColor >> 16) & 0xff) / 255;
    const baseG = ((SETTINGS.waterColor >> 8) & 0xff) / 255;
    const baseB = (SETTINGS.waterColor & 0xff) / 255;
    rMult *= baseR;
    gMult *= baseG;
    bMult *= baseB;

    // Per-vertex variation
    const v1Var = 1.0 + (waterHash(wx, wy, wz) - 0.5) * 0.05;
    const v2Var = 1.0 + (waterHash(wx + 1, wy, wz) - 0.5) * 0.05;
    const v3Var = 1.0 + (waterHash(wx + 1, wy, wz + 1) - 0.5) * 0.05;
    const v4Var = 1.0 + (waterHash(wx, wy, wz + 1) - 0.5) * 0.05;

    const c1 = ao[0] * lightLevel * v1Var;
    const c2 = ao[1] * lightLevel * v2Var;
    const c3 = ao[2] * lightLevel * v3Var;
    const c4 = ao[3] * lightLevel * v4Var;

    // Write 4 vertices (indexed)
    col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
    col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
    col[cIdx + 6] = c3 * rMult; col[cIdx + 7] = c3 * gMult; col[cIdx + 8] = c3 * bMult;
    col[cIdx + 9] = c4 * rMult; col[cIdx + 10] = c4 * gMult; col[cIdx + 11] = c4 * bMult;
}

export default {
    // Non-indexed
    writeFaceVertices,
    writeFaceColors,
    writeFaceUVs,
    // Indexed
    writeFaceVerticesIndexed,
    writeFaceColorsIndexed,
    writeFaceUVsIndexed,
    writeFaceIndices,
    // Water
    waterHash,
    writeFaceColorsWater,
    writeFaceColorsWaterIndexed,
};

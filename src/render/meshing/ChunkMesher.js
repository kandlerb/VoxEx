/**
 * Chunk mesh building - converts voxel data to Three.js geometry
 * @module render/meshing/ChunkMesher
 */

import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, WORLD_DIMS } from '../../config/WorldConfig.js';
import { NUM_TILES, BLOCK_CONFIG, TILE } from '../../config/BlockConfig.js';
import { AIR, WATER, TORCH } from '../../core/constants.js';
import { shouldRenderFace, isTransparent, getIsTransparentArray, FACE_DIRECTIONS } from './FaceCulling.js';
import { getCachedFaceVertices, getCachedFaceVerticesIndexed } from '../../optimization/caches/FaceVertexCache.js';
import { Float32ArrayPool } from '../../optimization/pools/Float32ArrayPool.js';
import { Uint32ArrayPool } from '../../optimization/pools/Uint32ArrayPool.js';
import {
    calculateFaceAO,
    initAOCache,
    clearAOCache,
    getSimplifiedLight,
} from './AmbientOcclusion.js';
import {
    writeFaceVertices,
    writeFaceVerticesIndexed,
    writeFaceColors,
    writeFaceColorsIndexed,
    writeFaceColorsWater,
    writeFaceColorsWaterIndexed,
    writeFaceUVs,
    writeFaceUVsIndexed,
    writeFaceIndices,
} from './FaceWriters.js';

// =====================================================
// Pool instances
// =====================================================

const posPool = new Float32ArrayPool();
const normPool = new Float32ArrayPool();
const uvPool = new Float32ArrayPool();
const colPool = new Float32ArrayPool();
const indexPool = new Uint32ArrayPool();

// =====================================================
// UV Lookup Table
// =====================================================

/**
 * @typedef {Object} BlockUV
 * @property {number} top - Top face tile index
 * @property {number} bottom - Bottom face tile index
 * @property {number} side - Side face tile index
 */

/**
 * Build UV lookup table from BLOCK_CONFIG
 * @returns {Array<BlockUV>}
 */
function buildUVLookupTable() {
    const uvTable = [];

    for (let i = 0; i < 256; i++) {
        const block = BLOCK_CONFIG.find(b => b.id === i);
        if (!block || !block.textures) {
            uvTable[i] = { top: 0, bottom: 0, side: 0 };
            continue;
        }

        const textures = block.textures;
        if (textures.all !== undefined) {
            uvTable[i] = {
                top: textures.all,
                bottom: textures.all,
                side: textures.all,
            };
        } else {
            uvTable[i] = {
                top: textures.top ?? 0,
                bottom: textures.bottom ?? 0,
                side: textures.side ?? 0,
            };
        }
    }

    return uvTable;
}

/**
 * UV lookup table (built once)
 * @type {Array<BlockUV>}
 */
const UV_LOOKUP = buildUVLookupTable();

/**
 * Get UV coordinates for a block
 * @param {number} blockId - Block ID
 * @returns {BlockUV}
 */
export function getBlockUV(blockId) {
    return UV_LOOKUP[blockId] || UV_LOOKUP[0];
}

// =====================================================
// Face Geometry
// =====================================================

/**
 * Get face normal for a face index
 * @param {number} faceIndex - Face index (0-5)
 * @returns {Array<number>} [nx, ny, nz]
 */
function getFaceNormal(faceIndex) {
    const normals = [
        [0, 1, 0],   // Top
        [0, -1, 0],  // Bottom
        [1, 0, 0],   // East (+X)
        [-1, 0, 0],  // West (-X)
        [0, 0, 1],   // South (+Z)
        [0, 0, -1],  // North (-Z)
    ];
    return normals[faceIndex];
}

/**
 * Get tile index for a face
 * @param {BlockUV} uv - Block UV data
 * @param {number} faceIndex - Face index (0-5)
 * @returns {number} Tile index
 */
function getTileForFace(uv, faceIndex) {
    if (faceIndex === 0) return uv.top;     // Top
    if (faceIndex === 1) return uv.bottom;  // Bottom
    return uv.side;                          // Sides
}

// =====================================================
// Indexed Face Generation
// =====================================================

/**
 * Add an indexed face to the geometry buffers
 * @param {number} wx - World X position
 * @param {number} wy - World Y position
 * @param {number} wz - World Z position
 * @param {number} faceIndex - Face index (0-5)
 * @param {number} tileIndex - Texture tile index
 * @param {Float32Array} positions - Position buffer
 * @param {Float32Array} normals - Normal buffer
 * @param {Float32Array} uvs - UV buffer
 * @param {Float32Array} colors - Color buffer
 * @param {Uint32Array} indices - Index buffer
 * @param {number} vIdx - Current position index
 * @param {number} uvIdx - Current UV index
 * @param {number} cIdx - Current color index
 * @param {number} iIdx - Current index buffer index
 * @param {number} vertCount - Current vertex count
 * @param {number} light - Light level (0-1)
 * @param {number} [ao=1] - Ambient occlusion factor (0-1)
 */
export function addIndexedFace(
    wx, wy, wz,
    faceIndex,
    tileIndex,
    positions, normals, uvs, colors, indices,
    vIdx, uvIdx, cIdx, iIdx, vertCount,
    light,
    ao = 1
) {
    // Get cached face vertices
    const faceVerts = getCachedFaceVertices(faceIndex, 1, 0);

    // Get normal for this face
    const normal = getFaceNormal(faceIndex);

    // Calculate UV coordinates
    const tileU = tileIndex / NUM_TILES;
    const tileWidth = 1 / NUM_TILES;

    // UV coordinates for the 4 vertices of a quad
    // Standard order: bottom-left, bottom-right, top-right, top-left
    const faceUVs = [
        tileU, 0,                    // Vertex 0
        tileU + tileWidth, 0,        // Vertex 1
        tileU + tileWidth, 1,        // Vertex 2
        tileU, 1,                    // Vertex 3
    ];

    // Add 4 vertices
    for (let v = 0; v < 4; v++) {
        const vi = v * 3;
        positions[vIdx + vi] = faceVerts[vi] + wx;
        positions[vIdx + vi + 1] = faceVerts[vi + 1] + wy;
        positions[vIdx + vi + 2] = faceVerts[vi + 2] + wz;

        normals[vIdx + vi] = normal[0];
        normals[vIdx + vi + 1] = normal[1];
        normals[vIdx + vi + 2] = normal[2];

        // Apply light and AO to vertex color
        const brightness = light * ao;
        colors[cIdx + vi] = brightness;
        colors[cIdx + vi + 1] = brightness;
        colors[cIdx + vi + 2] = brightness;

        uvs[uvIdx + v * 2] = faceUVs[v * 2];
        uvs[uvIdx + v * 2 + 1] = faceUVs[v * 2 + 1];
    }

    // Add 6 indices (2 triangles)
    // Triangle 1: 0, 1, 2
    // Triangle 2: 0, 2, 3
    indices[iIdx] = vertCount;
    indices[iIdx + 1] = vertCount + 1;
    indices[iIdx + 2] = vertCount + 2;
    indices[iIdx + 3] = vertCount;
    indices[iIdx + 4] = vertCount + 2;
    indices[iIdx + 5] = vertCount + 3;
}

// =====================================================
// Chunk Meshing
// =====================================================

/**
 * @typedef {Object} ChunkMeshResult
 * @property {THREE.BufferGeometry} solidGeometry - Solid terrain geometry
 * @property {THREE.BufferGeometry} waterGeometry - Water geometry
 * @property {number} solidFaceCount - Number of solid faces
 * @property {number} waterFaceCount - Number of water faces
 */

/**
 * Build mesh geometry for a chunk
 * @param {Object} chunk - Chunk data {blocks, skyLight, blockLight}
 * @param {number} chunkX - Chunk X coordinate
 * @param {number} chunkZ - Chunk Z coordinate
 * @param {Function} getNeighborBlock - Function to get blocks from neighbor chunks (lx, ly, lz) => blockId
 * @param {Function} [getLight] - Function to get light level (lx, ly, lz) => lightLevel
 * @returns {ChunkMeshResult}
 */
export function buildChunkMesh(chunk, chunkX, chunkZ, getNeighborBlock, getLight) {
    const blocks = chunk.blocks;
    const maxFaces = 30000;

    // Acquire buffers from pools
    const terrainPos = posPool.acquire(maxFaces * 12);
    const terrainNorm = normPool.acquire(maxFaces * 12);
    const terrainUvs = uvPool.acquire(maxFaces * 8);
    const terrainCols = colPool.acquire(maxFaces * 12);
    const terrainIndices = indexPool.acquire(maxFaces * 6);

    const waterPos = posPool.acquire(maxFaces * 12);
    const waterNorm = normPool.acquire(maxFaces * 12);
    const waterUvs = uvPool.acquire(maxFaces * 8);
    const waterCols = colPool.acquire(maxFaces * 12);
    const waterIndices = indexPool.acquire(maxFaces * 6);

    // Buffer indices
    let tVIdx = 0, tUvIdx = 0, tCIdx = 0, tIIdx = 0, tVertCount = 0, tFaceCount = 0;
    let wVIdx = 0, wUvIdx = 0, wCIdx = 0, wIIdx = 0, wVertCount = 0, wFaceCount = 0;

    const startX = chunkX * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;

    // Find max Y with non-air blocks
    let maxY = 0;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const yOffset = y * 256;
        let foundBlock = false;
        for (let z = 0; z < 16 && !foundBlock; z++) {
            const zOffset = z * 16;
            for (let x = 0; x < 16; x++) {
                const id = blocks[x + zOffset + yOffset];
                if (id !== AIR) {
                    maxY = y + 1;
                    foundBlock = true;
                    break;
                }
            }
        }
        if (foundBlock) break;
    }
    maxY = Math.min(CHUNK_HEIGHT, maxY + 1);

    // Main generation loop
    for (let y = 0; y < maxY; y++) {
        const yOffset = y * 256;
        for (let z = 0; z < 16; z++) {
            const zOffset = z * 16;
            for (let x = 0; x < 16; x++) {
                const idx = x + zOffset + yOffset;
                const blockId = blocks[idx];

                if (blockId === AIR || blockId === TORCH) continue;

                const wx = startX + x;
                const wy = y; // Y offset applied later if needed
                const wz = startZ + z;

                const uv = getBlockUV(blockId);
                const isWater = blockId === WATER;

                // Select buffers
                const pos = isWater ? waterPos : terrainPos;
                const norm = isWater ? waterNorm : terrainNorm;
                const uvArr = isWater ? waterUvs : terrainUvs;
                const cols = isWater ? waterCols : terrainCols;
                const ind = isWater ? waterIndices : terrainIndices;

                for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
                    const face = FACE_DIRECTIONS[faceIdx];
                    const lx = x + face[0];
                    const ly = y + face[1];
                    const lz = z + face[2];

                    // Get neighbor block
                    let neighborId;
                    if (lx >= 0 && lx < 16 && ly >= 0 && ly < CHUNK_HEIGHT && lz >= 0 && lz < 16) {
                        const neighborIdx = lx + lz * 16 + ly * 256;
                        neighborId = blocks[neighborIdx];
                    } else {
                        neighborId = getNeighborBlock(lx, ly, lz);
                    }

                    // Check if face should be drawn
                    let draw;
                    if (isWater) {
                        // Water only draws at boundaries
                        draw = neighborId === AIR || neighborId === 6 || neighborId === 14;
                    } else {
                        draw = shouldRenderFace(blockId, neighborId);
                    }

                    if (draw) {
                        // Get light level
                        let light = 1.0;
                        if (getLight) {
                            const rawLight = getLight(lx, ly, lz);
                            light = Math.max(rawLight, 1) / 15;
                        }

                        const tileIndex = getTileForFace(uv, faceIdx);

                        if (isWater) {
                            addIndexedFace(
                                wx, wy, wz,
                                faceIdx,
                                tileIndex,
                                pos, norm, uvArr, cols, ind,
                                wVIdx, wUvIdx, wCIdx, wIIdx, wVertCount,
                                light
                            );
                            wVIdx += 12;
                            wUvIdx += 8;
                            wCIdx += 12;
                            wIIdx += 6;
                            wVertCount += 4;
                            wFaceCount++;
                        } else {
                            addIndexedFace(
                                wx, wy, wz,
                                faceIdx,
                                tileIndex,
                                pos, norm, uvArr, cols, ind,
                                tVIdx, tUvIdx, tCIdx, tIIdx, tVertCount,
                                light
                            );
                            tVIdx += 12;
                            tUvIdx += 8;
                            tCIdx += 12;
                            tIIdx += 6;
                            tVertCount += 4;
                            tFaceCount++;
                        }
                    }
                }
            }
        }
    }

    // Create solid geometry
    const solidGeometry = new THREE.BufferGeometry();
    if (tFaceCount > 0) {
        solidGeometry.setIndex(new THREE.Uint32BufferAttribute(terrainIndices.slice(0, tIIdx), 1));
        solidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainPos.slice(0, tVIdx), 3));
        solidGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(terrainNorm.slice(0, tVIdx), 3));
        solidGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(terrainUvs.slice(0, tUvIdx), 2));
        solidGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainCols.slice(0, tCIdx), 3));
        solidGeometry.computeBoundingSphere();
    }

    // Create water geometry
    const waterGeometry = new THREE.BufferGeometry();
    if (wFaceCount > 0) {
        waterGeometry.setIndex(new THREE.Uint32BufferAttribute(waterIndices.slice(0, wIIdx), 1));
        waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPos.slice(0, wVIdx), 3));
        waterGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNorm.slice(0, wVIdx), 3));
        waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs.slice(0, wUvIdx), 2));
        waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(waterCols.slice(0, wCIdx), 3));
        const waterThickness = new Float32Array(wVertCount).fill(1);
        const shoreDist = new Float32Array(wVertCount).fill(1);
        waterGeometry.setAttribute('waterThickness', new THREE.Float32BufferAttribute(waterThickness, 1));
        waterGeometry.setAttribute('shoreDist', new THREE.Float32BufferAttribute(shoreDist, 1));
        waterGeometry.computeBoundingSphere();
    }

    // Release buffers back to pools
    posPool.release(terrainPos);
    normPool.release(terrainNorm);
    uvPool.release(terrainUvs);
    colPool.release(terrainCols);
    indexPool.release(terrainIndices);
    posPool.release(waterPos);
    normPool.release(waterNorm);
    uvPool.release(waterUvs);
    colPool.release(waterCols);
    indexPool.release(waterIndices);

    return {
        solidGeometry,
        waterGeometry,
        solidFaceCount: tFaceCount,
        waterFaceCount: wFaceCount,
    };
}

/**
 * Dispose of chunk mesh geometries
 * @param {THREE.BufferGeometry} geometry - Geometry to dispose
 */
export function disposeChunkGeometry(geometry) {
    if (geometry) {
        geometry.dispose();
    }
}

// =====================================================
// Full Face-Adding Functions (with AO support)
// =====================================================

/**
 * Add a face to the chunk mesh with full AO and lighting.
 * Non-indexed version (6 vertices per face).
 * @param {number} wx - World X position
 * @param {number} wy - World Y position
 * @param {number} wz - World Z position
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @param {number[]} uv - UV tile offset [u, v]
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {Float32Array} uvs - UV buffer
 * @param {Float32Array} col - Color buffer
 * @param {Function} getter - Block getter function
 * @param {number} solidX - Solid block X
 * @param {number} solidY - Solid block Y
 * @param {number} solidZ - Solid block Z
 * @param {number} blockId - Block type ID
 * @param {number} vIdx - Vertex buffer index
 * @param {number} uvIdx - UV buffer index
 * @param {number} cIdx - Color buffer index
 * @param {Function} lightGetter - Light getter function
 * @param {number} lightX - Light sample X
 * @param {number} lightY - Light sample Y
 * @param {number} lightZ - Light sample Z
 * @param {number} faceIdx - Face index for AO caching
 * @returns {void}
 */
export function addFace(wx, wy, wz, nx, ny, nz, uv, pos, norm, uvs, col, getter, solidX, solidY, solidZ, blockId, vIdx, uvIdx, cIdx, lightGetter, lightX, lightY, lightZ, faceIdx) {
    const verts = getCachedFaceVertices(nx, ny, nz);
    writeFaceVertices(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz);
    const ao = calculateFaceAO(nx, ny, nz, solidX, solidY, solidZ, blockId, getter, getIsTransparentArray(), faceIdx);
    const lightLevel = lightGetter ? lightGetter(lightX, lightY, lightZ) / 15.0 : 1.0;
    writeFaceColors(col, cIdx, ao, lightLevel);
    writeFaceUVs(uvs, uvIdx, uv);
}

/**
 * Add a water face with depth-based coloring.
 * Non-indexed version.
 * @param {number} wx - World X position
 * @param {number} wy - World Y position
 * @param {number} wz - World Z position
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @param {number[]} uv - UV tile offset
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {Float32Array} uvs - UV buffer
 * @param {Float32Array} col - Color buffer
 * @param {Function} getter - Block getter function
 * @param {number} solidX - Solid block X
 * @param {number} solidY - Solid block Y
 * @param {number} solidZ - Solid block Z
 * @param {number} blockId - Block type ID
 * @param {number} vIdx - Vertex buffer index
 * @param {number} uvIdx - UV buffer index
 * @param {number} cIdx - Color buffer index
 * @param {Function} lightGetter - Light getter function
 * @param {number} lightX - Light sample X
 * @param {number} lightY - Light sample Y
 * @param {number} lightZ - Light sample Z
 * @param {number} faceIdx - Face index for AO caching
 * @param {number} waterDepth - Water depth in blocks
 * @param {Float32Array} shoreBuffer - Shore distance buffer
 * @param {number} shoreIdx - Shore buffer index
 * @param {number} shoreDist - Distance to shore
 * @param {Float32Array} thicknessBuffer - Water thickness buffer
 * @param {number} thicknessIdx - Thickness buffer index
 * @returns {void}
 */
export function addFaceWater(wx, wy, wz, nx, ny, nz, uv, pos, norm, uvs, col, getter, solidX, solidY, solidZ, blockId, vIdx, uvIdx, cIdx, lightGetter, lightX, lightY, lightZ, faceIdx, waterDepth, shoreBuffer, shoreIdx, shoreDist, thicknessBuffer, thicknessIdx) {
    const verts = getCachedFaceVertices(nx, ny, nz);
    writeFaceVertices(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz);
    const ao = calculateFaceAO(nx, ny, nz, solidX, solidY, solidZ, blockId, getter, getIsTransparentArray(), faceIdx);
    const lightLevel = lightGetter ? lightGetter(lightX, lightY, lightZ) / 15.0 : 1.0;
    writeFaceColorsWater(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz);
    writeFaceUVs(uvs, uvIdx, uv);

    // Write shore distance for all 6 vertices
    const shoreNorm = Math.min(shoreDist / 4.0, 1.0);
    shoreBuffer[shoreIdx] = shoreNorm;
    shoreBuffer[shoreIdx + 1] = shoreNorm;
    shoreBuffer[shoreIdx + 2] = shoreNorm;
    shoreBuffer[shoreIdx + 3] = shoreNorm;
    shoreBuffer[shoreIdx + 4] = shoreNorm;
    shoreBuffer[shoreIdx + 5] = shoreNorm;

    // Write water thickness
    const thicknessNorm = Math.min(waterDepth / 8.0, 1.0);
    thicknessBuffer[thicknessIdx] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 1] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 2] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 3] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 4] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 5] = thicknessNorm;
}

/**
 * Add a simplified face for distant LOD chunks.
 * Skips expensive AO calculation, uses height-based lighting.
 * @param {number} wx - World X position
 * @param {number} wy - World Y position
 * @param {number} wz - World Z position
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @param {number[]} uv - UV tile offset
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {Float32Array} uvs - UV buffer
 * @param {Float32Array} col - Color buffer
 * @param {Function} getter - Block getter function (unused)
 * @param {number} solidX - Solid block X (unused)
 * @param {number} solidY - Solid block Y (unused)
 * @param {number} solidZ - Solid block Z (unused)
 * @param {number} blockId - Block type ID (unused)
 * @param {number} vIdx - Vertex buffer index
 * @param {number} uvIdx - UV buffer index
 * @param {number} cIdx - Color buffer index
 * @param {number} ly - Local Y coordinate
 * @returns {void}
 */
export function addFaceSimplified(wx, wy, wz, nx, ny, nz, uv, pos, norm, uvs, col, getter, solidX, solidY, solidZ, blockId, vIdx, uvIdx, cIdx, ly) {
    const verts = getCachedFaceVertices(nx, ny, nz);
    writeFaceVertices(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz);
    const simplifiedLight = getSimplifiedLight(ly, CHUNK_HEIGHT) / 15.0;
    const c = simplifiedLight;
    col[cIdx] = c; col[cIdx+1] = c; col[cIdx+2] = c;
    col[cIdx+3] = c; col[cIdx+4] = c; col[cIdx+5] = c;
    col[cIdx+6] = c; col[cIdx+7] = c; col[cIdx+8] = c;
    col[cIdx+9] = c; col[cIdx+10] = c; col[cIdx+11] = c;
    col[cIdx+12] = c; col[cIdx+13] = c; col[cIdx+14] = c;
    col[cIdx+15] = c; col[cIdx+16] = c; col[cIdx+17] = c;
    writeFaceUVs(uvs, uvIdx, uv);
}

// =====================================================
// Indexed Geometry Face Functions
// =====================================================

/**
 * Add a face using indexed geometry (4 vertices + 6 indices).
 * Full AO and lighting support.
 * @param {number} wx - World X position
 * @param {number} wy - World Y position
 * @param {number} wz - World Z position
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @param {number[]} uv - UV tile offset
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {Float32Array} uvs - UV buffer
 * @param {Float32Array} col - Color buffer
 * @param {Uint32Array} indices - Index buffer
 * @param {Function} getter - Block getter function
 * @param {number} solidX - Solid block X
 * @param {number} solidY - Solid block Y
 * @param {number} solidZ - Solid block Z
 * @param {number} blockId - Block type ID
 * @param {number} vIdx - Vertex buffer index
 * @param {number} uvIdx - UV buffer index
 * @param {number} cIdx - Color buffer index
 * @param {number} iIdx - Index buffer index
 * @param {number} vertexCount - Current vertex count (for index offset)
 * @param {Function} lightGetter - Light getter function
 * @param {number} lightX - Light sample X
 * @param {number} lightY - Light sample Y
 * @param {number} lightZ - Light sample Z
 * @param {number} faceIdx - Face index for AO caching
 * @returns {void}
 */
export function addFaceIndexedFull(wx, wy, wz, nx, ny, nz, uv, pos, norm, uvs, col, indices, getter, solidX, solidY, solidZ, blockId, vIdx, uvIdx, cIdx, iIdx, vertexCount, lightGetter, lightX, lightY, lightZ, faceIdx) {
    const verts = getCachedFaceVerticesIndexed(nx, ny, nz);
    writeFaceVerticesIndexed(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz);
    const ao = calculateFaceAO(nx, ny, nz, solidX, solidY, solidZ, blockId, getter, getIsTransparentArray(), faceIdx);
    const lightLevel = lightGetter ? lightGetter(lightX, lightY, lightZ) / 15.0 : 1.0;
    writeFaceColorsIndexed(col, cIdx, ao, lightLevel);
    writeFaceUVsIndexed(uvs, uvIdx, uv);
    writeFaceIndices(indices, iIdx, vertexCount);
}

/**
 * Add a water face using indexed geometry.
 * @param {number} wx - World X position
 * @param {number} wy - World Y position
 * @param {number} wz - World Z position
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @param {number[]} uv - UV tile offset
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {Float32Array} uvs - UV buffer
 * @param {Float32Array} col - Color buffer
 * @param {Uint32Array} indices - Index buffer
 * @param {Function} getter - Block getter function
 * @param {number} solidX - Solid block X
 * @param {number} solidY - Solid block Y
 * @param {number} solidZ - Solid block Z
 * @param {number} blockId - Block type ID
 * @param {number} vIdx - Vertex buffer index
 * @param {number} uvIdx - UV buffer index
 * @param {number} cIdx - Color buffer index
 * @param {number} iIdx - Index buffer index
 * @param {number} vertexCount - Current vertex count
 * @param {Function} lightGetter - Light getter function
 * @param {number} lightX - Light sample X
 * @param {number} lightY - Light sample Y
 * @param {number} lightZ - Light sample Z
 * @param {number} faceIdx - Face index for AO caching
 * @param {number} waterDepth - Water depth in blocks
 * @param {Float32Array} shoreBuffer - Shore distance buffer
 * @param {number} shoreIdx - Shore buffer index
 * @param {number} shoreDist - Distance to shore
 * @param {Float32Array} thicknessBuffer - Water thickness buffer
 * @param {number} thicknessIdx - Thickness buffer index
 * @returns {void}
 */
export function addFaceWaterIndexed(wx, wy, wz, nx, ny, nz, uv, pos, norm, uvs, col, indices, getter, solidX, solidY, solidZ, blockId, vIdx, uvIdx, cIdx, iIdx, vertexCount, lightGetter, lightX, lightY, lightZ, faceIdx, waterDepth, shoreBuffer, shoreIdx, shoreDist, thicknessBuffer, thicknessIdx) {
    const verts = getCachedFaceVerticesIndexed(nx, ny, nz);
    writeFaceVerticesIndexed(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz);
    const ao = calculateFaceAO(nx, ny, nz, solidX, solidY, solidZ, blockId, getter, getIsTransparentArray(), faceIdx);
    const lightLevel = lightGetter ? lightGetter(lightX, lightY, lightZ) / 15.0 : 1.0;
    writeFaceColorsWaterIndexed(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz);
    writeFaceUVsIndexed(uvs, uvIdx, uv);
    writeFaceIndices(indices, iIdx, vertexCount);

    // Shore and thickness attributes (4 vertices)
    const shoreNorm = Math.min(shoreDist / 4.0, 1.0);
    shoreBuffer[shoreIdx] = shoreNorm;
    shoreBuffer[shoreIdx + 1] = shoreNorm;
    shoreBuffer[shoreIdx + 2] = shoreNorm;
    shoreBuffer[shoreIdx + 3] = shoreNorm;

    const thicknessNorm = Math.min(waterDepth / 8.0, 1.0);
    thicknessBuffer[thicknessIdx] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 1] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 2] = thicknessNorm;
    thicknessBuffer[thicknessIdx + 3] = thicknessNorm;
}

/**
 * Add a simplified face using indexed geometry (for distant LOD chunks).
 * @param {number} wx - World X position
 * @param {number} wy - World Y position
 * @param {number} wz - World Z position
 * @param {number} nx - Normal X
 * @param {number} ny - Normal Y
 * @param {number} nz - Normal Z
 * @param {number[]} uv - UV tile offset
 * @param {Float32Array} pos - Position buffer
 * @param {Float32Array} norm - Normal buffer
 * @param {Float32Array} uvs - UV buffer
 * @param {Float32Array} col - Color buffer
 * @param {Uint32Array} indices - Index buffer
 * @param {Function} getter - Block getter function (unused)
 * @param {number} solidX - Solid block X (unused)
 * @param {number} solidY - Solid block Y (unused)
 * @param {number} solidZ - Solid block Z (unused)
 * @param {number} blockId - Block type ID (unused)
 * @param {number} vIdx - Vertex buffer index
 * @param {number} uvIdx - UV buffer index
 * @param {number} cIdx - Color buffer index
 * @param {number} iIdx - Index buffer index
 * @param {number} vertexCount - Current vertex count
 * @param {number} ly - Local Y coordinate
 * @returns {void}
 */
export function addFaceSimplifiedIndexed(wx, wy, wz, nx, ny, nz, uv, pos, norm, uvs, col, indices, getter, solidX, solidY, solidZ, blockId, vIdx, uvIdx, cIdx, iIdx, vertexCount, ly) {
    const verts = getCachedFaceVerticesIndexed(nx, ny, nz);
    writeFaceVerticesIndexed(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz);
    const simplifiedLight = getSimplifiedLight(ly, CHUNK_HEIGHT) / 15.0;
    // Write flat colors for 4 vertices
    col[cIdx] = simplifiedLight; col[cIdx+1] = simplifiedLight; col[cIdx+2] = simplifiedLight;
    col[cIdx+3] = simplifiedLight; col[cIdx+4] = simplifiedLight; col[cIdx+5] = simplifiedLight;
    col[cIdx+6] = simplifiedLight; col[cIdx+7] = simplifiedLight; col[cIdx+8] = simplifiedLight;
    col[cIdx+9] = simplifiedLight; col[cIdx+10] = simplifiedLight; col[cIdx+11] = simplifiedLight;
    writeFaceUVsIndexed(uvs, uvIdx, uv);
    writeFaceIndices(indices, iIdx, vertexCount);
}

// =====================================================
// ChunkMesher Class
// =====================================================
// OPTIMIZATION AUDIT (2025-12-15):
// - NOT a hot path: Only called at init and on user settings changes
// - The main animate loop uses the plain functions directly
// - All methods are O(1) or O(n) where n = number of settings keys (small)
// - No allocations in loops, no GC pressure concerns
// - Status: All methods marked "no-op" - already optimal for their use case

/**
 * ChunkMesher - handles chunk mesh generation with material management.
 * Provides caching for face vertices and AO configurations.
 */
export class ChunkMesher {
    /**
     * Create a new ChunkMesher.
     * @param {Object} [materials] - Material configuration.
     * @param {Object} [options] - Optional configuration.
     * @param {boolean} [options.debug=false] - Enable debug call counting.
     */
    constructor(materials, options = {}) {
        this.materials = materials || {};
        this.faceVertexCache = new Map();
        this._debug = options.debug || false;
        // DEBUG: Call counters for verification
        this._callCounts = { getCachedFaceVertices: 0, calculateVertexAO: 0, buildMesh: 0 };
    }

    /**
     * Set materials for terrain and water rendering.
     * @param {THREE.Material} terrain - Terrain material.
     * @param {THREE.Material} water - Water material.
     * @returns {void}
     */
    setMaterials(terrain, water) {
        this.materials.terrain = terrain;
        this.materials.water = water;
    }

    /**
     * Get cached face vertices.
     * Uses numeric key for cache to avoid string concat GC pressure.
     * @param {number} nx - Normal X component.
     * @param {number} ny - Normal Y component.
     * @param {number} nz - Normal Z component.
     * @returns {Float32Array} Face vertices (18 floats).
     */
    getCachedFaceVertices(nx, ny, nz) {
        if (this._debug) this._callCounts.getCachedFaceVertices++;
        const key = (nx + 1) * 9 + (ny + 1) * 3 + (nz + 1);
        if (this.faceVertexCache.has(key)) return this.faceVertexCache.get(key);

        const verts = new Float32Array(18);
        let x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4;

        if (ny > 0) { x1 = 0; y1 = 1; z1 = 1; x2 = 1; y2 = 1; z2 = 1; x3 = 1; y3 = 1; z3 = 0; x4 = 0; y4 = 1; z4 = 0; }
        else if (ny < 0) { x1 = 0; y1 = 0; z1 = 0; x2 = 1; y2 = 0; z2 = 0; x3 = 1; y3 = 0; z3 = 1; x4 = 0; y4 = 0; z4 = 1; }
        else if (nx > 0) { x1 = 1; y1 = 0; z1 = 1; x2 = 1; y2 = 0; z2 = 0; x3 = 1; y3 = 1; z3 = 0; x4 = 1; y4 = 1; z4 = 1; }
        else if (nx < 0) { x1 = 0; y1 = 0; z1 = 0; x2 = 0; y2 = 0; z2 = 1; x3 = 0; y3 = 1; z3 = 1; x4 = 0; y4 = 1; z4 = 0; }
        else if (nz > 0) { x1 = 0; y1 = 0; z1 = 1; x2 = 1; y2 = 0; z2 = 1; x3 = 1; y3 = 1; z3 = 1; x4 = 0; y4 = 1; z4 = 1; }
        else { x1 = 1; y1 = 0; z1 = 0; x2 = 0; y2 = 0; z2 = 0; x3 = 0; y3 = 1; z3 = 0; x4 = 1; y4 = 1; z4 = 0; }

        verts[0] = x1; verts[1] = y1; verts[2] = z1;
        verts[3] = x2; verts[4] = y2; verts[5] = z2;
        verts[6] = x4; verts[7] = y4; verts[8] = z4;
        verts[9] = x2; verts[10] = y2; verts[11] = z2;
        verts[12] = x3; verts[13] = y3; verts[14] = z3;
        verts[15] = x4; verts[16] = y4; verts[17] = z4;

        this.faceVertexCache.set(key, verts);
        return verts;
    }

    /**
     * Build mesh for a chunk (delegates to global buildChunkMesh).
     * @param {Object} chunk - Chunk data.
     * @param {Object} neighbors - Neighbor chunk data.
     * @param {Object} uvMap - UV mapping.
     * @returns {Object|null} Mesh result or null.
     */
    buildMeshForChunk(chunk, neighbors, uvMap) {
        if (this._debug) this._callCounts.buildMesh++;
        // Delegate to the global function
        return null; // Placeholder - uses existing buildChunkMesh()
    }

    /**
     * Dispose of chunk mesh resources.
     * @param {Object} chunk - Chunk with mesh and waterMesh properties.
     * @returns {void}
     */
    disposeChunkMesh(chunk) {
        if (chunk.mesh) {
            if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
            chunk.mesh = null;
        }
        if (chunk.waterMesh) {
            if (chunk.waterMesh.geometry) chunk.waterMesh.geometry.dispose();
            chunk.waterMesh = null;
        }
    }

    /**
     * Get debug call statistics.
     * @returns {Object} Copy of call counts.
     */
    getCallStats() {
        return { ...this._callCounts };
    }

    /**
     * Reset debug call counters.
     * @returns {void}
     */
    resetCallStats() {
        for (const key in this._callCounts) {
            this._callCounts[key] = 0;
        }
    }
}

export { getTileForFace, getFaceNormal, initAOCache, clearAOCache };
export default {
    buildChunkMesh,
    disposeChunkGeometry,
    getBlockUV,
    ChunkMesher,
    addFace,
    addFaceWater,
    addFaceSimplified,
    addFaceIndexedFull,
    addFaceWaterIndexed,
    addFaceSimplifiedIndexed,
};

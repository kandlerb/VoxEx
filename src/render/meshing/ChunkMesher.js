/**
 * Chunk mesh building - converts voxel data to Three.js geometry
 * @module render/meshing/ChunkMesher
 */

import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config/WorldConfig.js';
import { NUM_TILES, BLOCK_CONFIG, TILE } from '../../config/BlockConfig.js';
import { AIR, WATER, TORCH } from '../../core/constants.js';
import { shouldRenderFace, isTransparent, FACE_DIRECTIONS } from './FaceCulling.js';
import { getCachedFaceVertices } from '../../optimization/caches/FaceVertexCache.js';
import { Float32ArrayPool } from '../../optimization/pools/Float32ArrayPool.js';
import { Uint32ArrayPool } from '../../optimization/pools/Uint32ArrayPool.js';

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

export { getTileForFace, getFaceNormal };
export default { buildChunkMesh, disposeChunkGeometry, getBlockUV };

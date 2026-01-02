/**
 * Face vertex cache for chunk mesh generation.
 * Pre-computes and caches vertex positions for cube faces.
 * @module optimization/caches/FaceVertexCache
 */

/**
 * Cache for face vertex templates (6 vertices per face, non-indexed).
 * Key format: "nx,ny,nz" (normal direction).
 * @type {Map<string, Float32Array>}
 */
export const faceVertexCache = new Map();

/**
 * Cache for face vertex templates (4 vertices per face, indexed geometry).
 * Key format: "nx,ny,nz" (normal direction).
 * @type {Map<string, Float32Array>}
 */
export const faceVertexCacheIndexed = new Map();

/**
 * Get cached face vertices for non-indexed geometry (6 vertices = 2 triangles).
 * Creates and caches the vertices on first request for each normal direction.
 * @param {number} nx - Normal X component (-1, 0, or 1)
 * @param {number} ny - Normal Y component (-1, 0, or 1)
 * @param {number} nz - Normal Z component (-1, 0, or 1)
 * @returns {Float32Array} Array of 18 floats (6 vertices × 3 coords)
 */
export function getCachedFaceVertices(nx, ny, nz) {
    const key = `${nx},${ny},${nz}`;
    if (faceVertexCache.has(key)) return faceVertexCache.get(key);

    // Calculate vertices for a 1x1x1 block face relative to origin (0,0,0)
    // These are the 18 floats (6 vertices * 3 coords) for the two triangles
    const verts = new Float32Array(18);
    let x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4;

    // Determine corner positions based on face normal direction
    if (ny > 0) {
        // Top face (+Y)
        x1 = 0; y1 = 1; z1 = 1;
        x2 = 1; y2 = 1; z2 = 1;
        x3 = 1; y3 = 1; z3 = 0;
        x4 = 0; y4 = 1; z4 = 0;
    } else if (ny < 0) {
        // Bottom face (-Y)
        x1 = 0; y1 = 0; z1 = 0;
        x2 = 1; y2 = 0; z2 = 0;
        x3 = 1; y3 = 0; z3 = 1;
        x4 = 0; y4 = 0; z4 = 1;
    } else if (nx > 0) {
        // Right face (+X)
        x1 = 1; y1 = 0; z1 = 1;
        x2 = 1; y2 = 0; z2 = 0;
        x3 = 1; y3 = 1; z3 = 0;
        x4 = 1; y4 = 1; z4 = 1;
    } else if (nx < 0) {
        // Left face (-X)
        x1 = 0; y1 = 0; z1 = 0;
        x2 = 0; y2 = 0; z2 = 1;
        x3 = 0; y3 = 1; z3 = 1;
        x4 = 0; y4 = 1; z4 = 0;
    } else if (nz > 0) {
        // Back face (+Z)
        x1 = 0; y1 = 0; z1 = 1;
        x2 = 1; y2 = 0; z2 = 1;
        x3 = 1; y3 = 1; z3 = 1;
        x4 = 0; y4 = 1; z4 = 1;
    } else {
        // Front face (-Z)
        x1 = 1; y1 = 0; z1 = 0;
        x2 = 0; y2 = 0; z2 = 0;
        x3 = 0; y3 = 1; z3 = 0;
        x4 = 1; y4 = 1; z4 = 0;
    }

    // Fill the array (Triangle 1: 1-2-4, Triangle 2: 2-3-4)
    verts[0] = x1; verts[1] = y1; verts[2] = z1;   // V1
    verts[3] = x2; verts[4] = y2; verts[5] = z2;   // V2
    verts[6] = x4; verts[7] = y4; verts[8] = z4;   // V4
    verts[9] = x2; verts[10] = y2; verts[11] = z2;  // V2
    verts[12] = x3; verts[13] = y3; verts[14] = z3; // V3
    verts[15] = x4; verts[16] = y4; verts[17] = z4; // V4

    faceVertexCache.set(key, verts);
    return verts;
}

/**
 * Get cached face vertices for indexed geometry (4 unique vertices per face).
 * Creates and caches the vertices on first request for each normal direction.
 * @param {number} nx - Normal X component (-1, 0, or 1)
 * @param {number} ny - Normal Y component (-1, 0, or 1)
 * @param {number} nz - Normal Z component (-1, 0, or 1)
 * @returns {Float32Array} Array of 12 floats (4 vertices × 3 coords)
 */
export function getCachedFaceVerticesIndexed(nx, ny, nz) {
    const key = `${nx},${ny},${nz}`;
    if (faceVertexCacheIndexed.has(key)) return faceVertexCacheIndexed.get(key);

    // 4 unique vertices for indexed rendering (v1, v2, v3, v4)
    const verts = new Float32Array(12);
    let x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4;

    // Determine corner positions based on face normal direction
    if (ny > 0) {
        // Top face (+Y)
        x1 = 0; y1 = 1; z1 = 1;
        x2 = 1; y2 = 1; z2 = 1;
        x3 = 1; y3 = 1; z3 = 0;
        x4 = 0; y4 = 1; z4 = 0;
    } else if (ny < 0) {
        // Bottom face (-Y)
        x1 = 0; y1 = 0; z1 = 0;
        x2 = 1; y2 = 0; z2 = 0;
        x3 = 1; y3 = 0; z3 = 1;
        x4 = 0; y4 = 0; z4 = 1;
    } else if (nx > 0) {
        // Right face (+X)
        x1 = 1; y1 = 0; z1 = 1;
        x2 = 1; y2 = 0; z2 = 0;
        x3 = 1; y3 = 1; z3 = 0;
        x4 = 1; y4 = 1; z4 = 1;
    } else if (nx < 0) {
        // Left face (-X)
        x1 = 0; y1 = 0; z1 = 0;
        x2 = 0; y2 = 0; z2 = 1;
        x3 = 0; y3 = 1; z3 = 1;
        x4 = 0; y4 = 1; z4 = 0;
    } else if (nz > 0) {
        // Back face (+Z)
        x1 = 0; y1 = 0; z1 = 1;
        x2 = 1; y2 = 0; z2 = 1;
        x3 = 1; y3 = 1; z3 = 1;
        x4 = 0; y4 = 1; z4 = 1;
    } else {
        // Front face (-Z)
        x1 = 1; y1 = 0; z1 = 0;
        x2 = 0; y2 = 0; z2 = 0;
        x3 = 0; y3 = 1; z3 = 0;
        x4 = 1; y4 = 1; z4 = 0;
    }

    // Store in order: v1, v2, v3, v4 (4 unique corners)
    verts[0] = x1; verts[1] = y1; verts[2] = z1;   // V1
    verts[3] = x2; verts[4] = y2; verts[5] = z2;   // V2
    verts[6] = x3; verts[7] = y3; verts[8] = z3;   // V3
    verts[9] = x4; verts[10] = y4; verts[11] = z4; // V4

    faceVertexCacheIndexed.set(key, verts);
    return verts;
}

/**
 * Pre-populate the caches with all 6 face directions.
 * Call this at startup to ensure no cache misses during gameplay.
 */
export function prewarmFaceVertexCaches() {
    // All 6 face directions
    const directions = [
        [0, 1, 0],   // Top (+Y)
        [0, -1, 0],  // Bottom (-Y)
        [1, 0, 0],   // Right (+X)
        [-1, 0, 0],  // Left (-X)
        [0, 0, 1],   // Back (+Z)
        [0, 0, -1],  // Front (-Z)
    ];

    for (const [nx, ny, nz] of directions) {
        getCachedFaceVertices(nx, ny, nz);
        getCachedFaceVerticesIndexed(nx, ny, nz);
    }
}

/**
 * Clear both face vertex caches.
 * Typically not needed unless reloading the engine.
 */
export function clearFaceVertexCaches() {
    faceVertexCache.clear();
    faceVertexCacheIndexed.clear();
}

export default {
    faceVertexCache,
    faceVertexCacheIndexed,
    getCachedFaceVertices,
    getCachedFaceVerticesIndexed,
    prewarmFaceVertexCaches,
    clearFaceVertexCaches
};

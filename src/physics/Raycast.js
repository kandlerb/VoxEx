/**
 * Raycasting for block selection and targeting.
 * Implements DDA (Digital Differential Analyzer) algorithm for voxel traversal.
 * @module physics/Raycast
 */

/**
 * @typedef {Object} RaycastHit
 * @property {boolean} hit - Whether a block was hit
 * @property {number} x - Block X coordinate
 * @property {number} y - Block Y coordinate
 * @property {number} z - Block Z coordinate
 * @property {number[]} face - Hit face normal as [nx, ny, nz]
 * @property {number} distance - Distance to hit point
 */

/**
 * @typedef {Object} RaycastHitDetailed
 * @property {boolean} hit - Whether a block was hit
 * @property {number} x - Block X coordinate
 * @property {number} y - Block Y coordinate
 * @property {number} z - Block Z coordinate
 * @property {string} faceName - Face name ('top', 'bottom', 'north', 'south', 'east', 'west')
 * @property {number} nx - Normal X (-1, 0, or 1)
 * @property {number} ny - Normal Y (-1, 0, or 1)
 * @property {number} nz - Normal Z (-1, 0, or 1)
 * @property {number} distance - Distance to hit point
 * @property {number} blockId - ID of the hit block (if available)
 */

/**
 * Face normal arrays for each direction.
 * @type {Object.<string, number[]>}
 */
export const FACE_NORMALS = {
    top: [0, 1, 0],
    bottom: [0, -1, 0],
    north: [0, 0, -1],
    south: [0, 0, 1],
    east: [1, 0, 0],
    west: [-1, 0, 0],
};

/**
 * Cast a ray through voxel space using DDA algorithm.
 * This is a general-purpose raycast that works with any solid block check function.
 * @param {number} originX - Ray origin X
 * @param {number} originY - Ray origin Y
 * @param {number} originZ - Ray origin Z
 * @param {number} dirX - Ray direction X (does not need to be normalized)
 * @param {number} dirY - Ray direction Y
 * @param {number} dirZ - Ray direction Z
 * @param {number} maxDistance - Maximum ray distance
 * @param {Function} isSolidBlock - Function(x, y, z) => boolean
 * @returns {RaycastHitDetailed} Raycast result
 */
export function raycastVoxels(originX, originY, originZ, dirX, dirY, dirZ, maxDistance, isSolidBlock) {
    // Normalize direction for accurate distance calculation
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (len === 0) {
        return { hit: false, x: 0, y: 0, z: 0, faceName: '', nx: 0, ny: 0, nz: 0, distance: maxDistance, blockId: 0 };
    }
    const dx = dirX / len;
    const dy = dirY / len;
    const dz = dirZ / len;

    // Current voxel position
    let x = Math.floor(originX);
    let y = Math.floor(originY);
    let z = Math.floor(originZ);

    // Direction signs
    const stepX = dx >= 0 ? 1 : -1;
    const stepY = dy >= 0 ? 1 : -1;
    const stepZ = dz >= 0 ? 1 : -1;

    // Distance to next voxel boundary per unit step
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    // Initial t values to first boundary crossing
    let tMaxX = dx !== 0
        ? (dx > 0 ? (x + 1 - originX) : (originX - x)) * tDeltaX
        : Infinity;
    let tMaxY = dy !== 0
        ? (dy > 0 ? (y + 1 - originY) : (originY - y)) * tDeltaY
        : Infinity;
    let tMaxZ = dz !== 0
        ? (dz > 0 ? (z + 1 - originZ) : (originZ - z)) * tDeltaZ
        : Infinity;

    let distance = 0;
    let faceName = '';
    let nx = 0, ny = 0, nz = 0;

    while (distance < maxDistance) {
        // Check current voxel
        if (isSolidBlock(x, y, z)) {
            return {
                hit: true,
                x, y, z,
                faceName,
                nx, ny, nz,
                distance,
                blockId: 0 // Can be filled in by caller
            };
        }

        // DDA step: advance to next voxel
        if (tMaxX < tMaxY) {
            if (tMaxX < tMaxZ) {
                x += stepX;
                distance = tMaxX;
                tMaxX += tDeltaX;
                nx = -stepX;
                ny = 0;
                nz = 0;
                faceName = stepX > 0 ? 'west' : 'east';
            } else {
                z += stepZ;
                distance = tMaxZ;
                tMaxZ += tDeltaZ;
                nx = 0;
                ny = 0;
                nz = -stepZ;
                faceName = stepZ > 0 ? 'north' : 'south';
            }
        } else {
            if (tMaxY < tMaxZ) {
                y += stepY;
                distance = tMaxY;
                tMaxY += tDeltaY;
                nx = 0;
                ny = -stepY;
                nz = 0;
                faceName = stepY > 0 ? 'bottom' : 'top';
            } else {
                z += stepZ;
                distance = tMaxZ;
                tMaxZ += tDeltaZ;
                nx = 0;
                ny = 0;
                nz = -stepZ;
                faceName = stepZ > 0 ? 'north' : 'south';
            }
        }
    }

    return { hit: false, x: 0, y: 0, z: 0, faceName: '', nx: 0, ny: 0, nz: 0, distance: maxDistance, blockId: 0 };
}

/**
 * Simplified raycast returning face as array (matching VoxEx pickVoxel format).
 * @param {Object} origin - Ray origin {x, y, z}
 * @param {Object} dir - Ray direction {x, y, z}
 * @param {number} range - Maximum ray distance
 * @param {Function} isSolidBlock - Function(x, y, z) => boolean
 * @returns {RaycastHit|null} Hit result or null
 */
export function pickVoxel(origin, dir, range, isSolidBlock) {
    const result = raycastVoxels(
        origin.x, origin.y, origin.z,
        dir.x, dir.y, dir.z,
        range,
        isSolidBlock
    );

    if (!result.hit) {
        return null;
    }

    return {
        hit: true,
        x: result.x,
        y: result.y,
        z: result.z,
        face: [result.nx, result.ny, result.nz],
        distance: result.distance
    };
}

/**
 * Get the block position for placing a new block adjacent to hit.
 * @param {RaycastHit|RaycastHitDetailed} hit - Raycast hit result
 * @returns {{x: number, y: number, z: number}|null} Placement position or null
 */
export function getPlacementPosition(hit) {
    if (!hit || !hit.hit) return null;

    // Use face normal to determine placement position
    let nx, ny, nz;

    if (Array.isArray(hit.face)) {
        [nx, ny, nz] = hit.face;
    } else {
        nx = hit.nx ?? 0;
        ny = hit.ny ?? 0;
        nz = hit.nz ?? 0;
    }

    return {
        x: hit.x + nx,
        y: hit.y + ny,
        z: hit.z + nz
    };
}

/**
 * Step-based raycast (simpler but less precise than DDA).
 * Steps along ray in fixed increments, tracking last air block.
 * @param {Object} origin - Ray origin {x, y, z}
 * @param {Object} direction - Ray direction {x, y, z} (normalized)
 * @param {number} range - Maximum ray distance
 * @param {number} stepSize - Step increment (smaller = more precise)
 * @param {Function} getBlockId - Function(x, y, z) => blockId
 * @param {number} airBlockId - ID of air blocks to skip
 * @returns {RaycastHit|null} Hit result or null
 */
export function raycastStepped(origin, direction, range, stepSize, getBlockId, airBlockId) {
    let lastAirX = 0, lastAirY = 0, lastAirZ = 0;
    let hasLastAir = false;

    for (let t = 0; t < range; t += stepSize) {
        const x = Math.floor(origin.x + direction.x * t);
        const y = Math.floor(origin.y + direction.y * t);
        const z = Math.floor(origin.z + direction.z * t);

        const blockId = getBlockId(x, y, z);

        if (blockId !== airBlockId && blockId !== undefined) {
            // Calculate face from last air position
            let face = [0, 0, 0];
            if (hasLastAir) {
                face = [lastAirX - x, lastAirY - y, lastAirZ - z];
            }

            return {
                hit: true,
                x, y, z,
                face,
                distance: t
            };
        }

        // Track last air position
        lastAirX = x;
        lastAirY = y;
        lastAirZ = z;
        hasLastAir = true;
    }

    return null;
}

/**
 * Check line-of-sight between two points.
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} z1 - Start Z
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @param {number} z2 - End Z
 * @param {Function} isSolidBlock - Function(x, y, z) => boolean
 * @returns {boolean} True if line of sight is clear
 */
export function hasLineOfSight(x1, y1, z1, x2, y2, z2, isSolidBlock) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance === 0) return true;

    const result = raycastVoxels(x1, y1, z1, dx, dy, dz, distance, isSolidBlock);
    return !result.hit || result.distance >= distance - 0.01;
}

/**
 * Calculate visibility factor using broadened raycast (multiple samples).
 * Used for partial visibility through gaps (e.g., leaves).
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} z1 - Start Z
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @param {number} z2 - End Z
 * @param {number} spread - Sample spread distance
 * @param {number} samples - Number of samples (more = smoother but slower)
 * @param {Function} isSolidBlock - Function(x, y, z) => boolean
 * @returns {number} Visibility factor 0.0 (blocked) to 1.0 (clear)
 */
export function getVisibilityFactor(x1, y1, z1, x2, y2, z2, spread, samples, isSolidBlock) {
    let visible = 0;

    for (let i = 0; i < samples; i++) {
        // Random offset for this sample
        const ox = (Math.random() - 0.5) * spread * 2;
        const oy = (Math.random() - 0.5) * spread * 2;
        const oz = (Math.random() - 0.5) * spread * 2;

        if (hasLineOfSight(x1 + ox, y1 + oy, z1 + oz, x2, y2, z2, isSolidBlock)) {
            visible++;
        }
    }

    return visible / samples;
}

/**
 * Cast ray from camera position in look direction.
 * Helper function for first-person block targeting.
 * @param {Object} cameraPosition - Camera position {x, y, z}
 * @param {Object} lookDirection - Normalized look direction {x, y, z}
 * @param {number} range - Maximum reach distance
 * @param {Function} isSolidBlock - Function(x, y, z) => boolean
 * @returns {RaycastHitDetailed} Raycast result
 */
export function raycastFromCamera(cameraPosition, lookDirection, range, isSolidBlock) {
    return raycastVoxels(
        cameraPosition.x,
        cameraPosition.y,
        cameraPosition.z,
        lookDirection.x,
        lookDirection.y,
        lookDirection.z,
        range,
        isSolidBlock
    );
}

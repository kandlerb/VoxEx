/**
 * Collision detection for voxel world.
 * Provides entity-block and entity-entity collision utilities.
 * @module physics/Collision
 */

import {
    createAABBFromMinMax,
    createBlockAABB,
    intersectsAABB
} from './AABB.js';

/**
 * @typedef {Object} CollisionResult
 * @property {number} x - Displacement X
 * @property {number} y - Displacement Y
 * @property {number} z - Displacement Z
 * @property {string} axis - Primary collision axis ('x', 'y', or 'z')
 */

/**
 * Check if an entity's bounding box intersects with a block.
 * Uses player AABB format from VoxEx: center X/Z, feet Y position.
 * @param {number} pMinX - Entity min X
 * @param {number} pMinY - Entity min Y (feet)
 * @param {number} pMinZ - Entity min Z
 * @param {number} pMaxX - Entity max X
 * @param {number} pMaxY - Entity max Y (head)
 * @param {number} pMaxZ - Entity max Z
 * @param {number} bx - Block X coordinate
 * @param {number} by - Block Y coordinate
 * @param {number} bz - Block Z coordinate
 * @returns {boolean} True if entity box intersects block
 */
export function playerIntersectsBlock(pMinX, pMinY, pMinZ, pMaxX, pMaxY, pMaxZ, bx, by, bz) {
    const playerBox = createAABBFromMinMax(pMinX, pMinY, pMinZ, pMaxX, pMaxY, pMaxZ);
    const blockBox = createBlockAABB(bx, by, bz);
    return intersectsAABB(playerBox, blockBox);
}

/**
 * Check if an entity collides with a block at given coordinates.
 * @param {number} x - Entity center X
 * @param {number} y - Entity feet Y position
 * @param {number} z - Entity center Z
 * @param {number} width - Entity width (X and Z)
 * @param {number} height - Entity height (Y)
 * @param {number} bx - Block X
 * @param {number} by - Block Y
 * @param {number} bz - Block Z
 * @returns {boolean} True if entity intersects block
 */
export function entityIntersectsBlock(x, y, z, width, height, bx, by, bz) {
    const halfWidth = width / 2;
    return playerIntersectsBlock(
        x - halfWidth, y, z - halfWidth,
        x + halfWidth, y + height, z + halfWidth,
        bx, by, bz
    );
}

/**
 * Get all block positions an entity's AABB overlaps.
 * Useful for collision checks against the world.
 * @param {number} x - Entity center X
 * @param {number} y - Entity feet Y
 * @param {number} z - Entity center Z
 * @param {number} width - Entity width
 * @param {number} height - Entity height
 * @returns {Array<{x: number, y: number, z: number}>} Array of block positions
 */
export function getOverlappingBlocks(x, y, z, width, height) {
    const halfWidth = width / 2;
    const blocks = [];

    const minBX = Math.floor(x - halfWidth);
    const maxBX = Math.floor(x + halfWidth);
    const minBY = Math.floor(y);
    const maxBY = Math.floor(y + height);
    const minBZ = Math.floor(z - halfWidth);
    const maxBZ = Math.floor(z + halfWidth);

    for (let bx = minBX; bx <= maxBX; bx++) {
        for (let by = minBY; by <= maxBY; by++) {
            for (let bz = minBZ; bz <= maxBZ; bz++) {
                blocks.push({ x: bx, y: by, z: bz });
            }
        }
    }

    return blocks;
}

/**
 * Get corner block positions for collision checks (optimized 8-point check).
 * Uses the VoxEx pattern of checking 8 corners of a player AABB.
 * @param {number} x - Entity center X
 * @param {number} y - Entity feet Y
 * @param {number} z - Entity center Z
 * @param {number} halfWidth - Half of entity width
 * @param {number} height - Entity height
 * @returns {Array<{x: number, y: number, z: number}>} Array of 8 corner block positions
 */
export function getCornerBlocks(x, y, z, halfWidth, height) {
    const x0 = Math.floor(x - halfWidth);
    const x1 = Math.floor(x + halfWidth);
    const y0 = Math.floor(y);
    const y1 = Math.floor(y + height);
    const z0 = Math.floor(z - halfWidth);
    const z1 = Math.floor(z + halfWidth);

    return [
        { x: x0, y: y0, z: z0 },
        { x: x0, y: y0, z: z1 },
        { x: x0, y: y1, z: z0 },
        { x: x0, y: y1, z: z1 },
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y0, z: z1 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y1, z: z1 },
    ];
}

/**
 * Check ground contact points (optimized 4-point check).
 * Uses the VoxEx pattern for ground detection.
 * @param {number} x - Entity center X
 * @param {number} y - Entity feet Y
 * @param {number} z - Entity center Z
 * @param {number} halfWidth - Half of entity width
 * @returns {Array<{x: number, y: number, z: number}>} Array of 4 ground check positions
 */
export function getGroundCheckBlocks(x, y, z, halfWidth) {
    const checkY = Math.floor(y - 0.01); // Slightly below feet
    const x0 = Math.floor(x - halfWidth);
    const x1 = Math.floor(x + halfWidth);
    const z0 = Math.floor(z - halfWidth);
    const z1 = Math.floor(z + halfWidth);

    return [
        { x: x0, y: checkY, z: z0 },
        { x: x1, y: checkY, z: z0 },
        { x: x0, y: checkY, z: z1 },
        { x: x1, y: checkY, z: z1 },
    ];
}

/**
 * Calculate penetration depth between two AABBs on each axis.
 * @param {import('./AABB.js').AABB} a - First AABB
 * @param {import('./AABB.js').AABB} b - Second AABB
 * @returns {{x: number, y: number, z: number}} Penetration on each axis (0 if no overlap)
 */
export function getPenetration(a, b) {
    const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);

    return {
        x: overlapX > 0 ? overlapX : 0,
        y: overlapY > 0 ? overlapY : 0,
        z: overlapZ > 0 ? overlapZ : 0
    };
}

/**
 * Resolve collision by finding the minimum displacement.
 * Returns the displacement needed to separate the boxes.
 * @param {import('./AABB.js').AABB} entityBox - Moving entity's bounding box
 * @param {import('./AABB.js').AABB} blockBox - Static block's bounding box
 * @param {{x: number, y: number, z: number}} velocity - Entity velocity
 * @returns {CollisionResult} Displacement to apply
 */
export function resolveCollision(entityBox, blockBox, velocity) {
    // Calculate overlap on each axis
    const overlapX = velocity.x > 0
        ? blockBox.minX - entityBox.maxX
        : blockBox.maxX - entityBox.minX;
    const overlapY = velocity.y > 0
        ? blockBox.minY - entityBox.maxY
        : blockBox.maxY - entityBox.minY;
    const overlapZ = velocity.z > 0
        ? blockBox.minZ - entityBox.maxZ
        : blockBox.maxZ - entityBox.minZ;

    // Find minimum displacement axis
    const absX = Math.abs(overlapX);
    const absY = Math.abs(overlapY);
    const absZ = Math.abs(overlapZ);

    if (absY <= absX && absY <= absZ) {
        return { x: 0, y: overlapY, z: 0, axis: 'y' };
    } else if (absX <= absZ) {
        return { x: overlapX, y: 0, z: 0, axis: 'x' };
    } else {
        return { x: 0, y: 0, z: overlapZ, axis: 'z' };
    }
}

/**
 * Sweep test: find the time of collision along a movement vector.
 * Uses swept AABB technique for continuous collision detection.
 * @param {import('./AABB.js').AABB} movingBox - Moving entity's AABB
 * @param {import('./AABB.js').AABB} staticBox - Static obstacle's AABB
 * @param {number} vx - Velocity X
 * @param {number} vy - Velocity Y
 * @param {number} vz - Velocity Z
 * @returns {{t: number, normalX: number, normalY: number, normalZ: number}} Collision time (0-1) and surface normal
 */
export function sweepAABB(movingBox, staticBox, vx, vy, vz) {
    // Calculate entry and exit times for each axis
    let xEntry, yEntry, zEntry;
    let xExit, yExit, zExit;

    // X axis
    if (vx === 0) {
        if (movingBox.maxX <= staticBox.minX || movingBox.minX >= staticBox.maxX) {
            return { t: 1, normalX: 0, normalY: 0, normalZ: 0 };
        }
        xEntry = -Infinity;
        xExit = Infinity;
    } else {
        const invVx = 1 / vx;
        xEntry = (vx > 0 ? staticBox.minX - movingBox.maxX : staticBox.maxX - movingBox.minX) * invVx;
        xExit = (vx > 0 ? staticBox.maxX - movingBox.minX : staticBox.minX - movingBox.maxX) * invVx;
    }

    // Y axis
    if (vy === 0) {
        if (movingBox.maxY <= staticBox.minY || movingBox.minY >= staticBox.maxY) {
            return { t: 1, normalX: 0, normalY: 0, normalZ: 0 };
        }
        yEntry = -Infinity;
        yExit = Infinity;
    } else {
        const invVy = 1 / vy;
        yEntry = (vy > 0 ? staticBox.minY - movingBox.maxY : staticBox.maxY - movingBox.minY) * invVy;
        yExit = (vy > 0 ? staticBox.maxY - movingBox.minY : staticBox.minY - movingBox.maxY) * invVy;
    }

    // Z axis
    if (vz === 0) {
        if (movingBox.maxZ <= staticBox.minZ || movingBox.minZ >= staticBox.maxZ) {
            return { t: 1, normalX: 0, normalY: 0, normalZ: 0 };
        }
        zEntry = -Infinity;
        zExit = Infinity;
    } else {
        const invVz = 1 / vz;
        zEntry = (vz > 0 ? staticBox.minZ - movingBox.maxZ : staticBox.maxZ - movingBox.minZ) * invVz;
        zExit = (vz > 0 ? staticBox.maxZ - movingBox.minZ : staticBox.minZ - movingBox.maxZ) * invVz;
    }

    // Find entry/exit times
    const entryTime = Math.max(xEntry, yEntry, zEntry);
    const exitTime = Math.min(xExit, yExit, zExit);

    // No collision
    if (entryTime > exitTime || entryTime > 1 || entryTime < 0) {
        return { t: 1, normalX: 0, normalY: 0, normalZ: 0 };
    }

    // Determine collision normal
    let normalX = 0, normalY = 0, normalZ = 0;
    if (xEntry >= yEntry && xEntry >= zEntry) {
        normalX = vx > 0 ? -1 : 1;
    } else if (yEntry >= zEntry) {
        normalY = vy > 0 ? -1 : 1;
    } else {
        normalZ = vz > 0 ? -1 : 1;
    }

    return { t: entryTime, normalX, normalY, normalZ };
}

/**
 * Check if a position would collide with any solid blocks.
 * @param {number} x - Entity center X
 * @param {number} y - Entity feet Y
 * @param {number} z - Entity center Z
 * @param {number} halfWidth - Half of entity width
 * @param {number} height - Entity height
 * @param {Function} isSolidBlock - Function(bx, by, bz) => boolean
 * @returns {boolean} True if position causes collision
 */
export function wouldCollide(x, y, z, halfWidth, height, isSolidBlock) {
    const corners = getCornerBlocks(x, y, z, halfWidth, height);
    for (const corner of corners) {
        if (isSolidBlock(corner.x, corner.y, corner.z)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if entity is on ground (touching solid block below).
 * @param {number} x - Entity center X
 * @param {number} y - Entity feet Y
 * @param {number} z - Entity center Z
 * @param {number} halfWidth - Half of entity width
 * @param {Function} isSolidBlock - Function(bx, by, bz) => boolean
 * @returns {boolean} True if on ground
 */
export function isOnGround(x, y, z, halfWidth, isSolidBlock) {
    const groundBlocks = getGroundCheckBlocks(x, y, z, halfWidth);
    for (const block of groundBlocks) {
        if (isSolidBlock(block.x, block.y, block.z)) {
            return true;
        }
    }
    return false;
}

/**
 * Squared distance between two 3D points (avoids sqrt).
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} z1 - First point Z
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @param {number} z2 - Second point Z
 * @returns {number} Squared distance
 */
export function distanceSquared3D(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Squared 2D distance (XZ plane, ignores Y).
 * @param {number} x1 - First point X
 * @param {number} z1 - First point Z
 * @param {number} x2 - Second point X
 * @param {number} z2 - Second point Z
 * @returns {number} Squared distance
 */
export function distanceSquared2D(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    return dx * dx + dz * dz;
}

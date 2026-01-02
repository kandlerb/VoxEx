/**
 * Axis-Aligned Bounding Box utilities.
 * Provides AABB creation, intersection, and manipulation functions.
 * @module physics/AABB
 */

/**
 * @typedef {Object} AABB
 * @property {number} minX - Minimum X coordinate
 * @property {number} minY - Minimum Y coordinate
 * @property {number} minZ - Minimum Z coordinate
 * @property {number} maxX - Maximum X coordinate
 * @property {number} maxY - Maximum Y coordinate
 * @property {number} maxZ - Maximum Z coordinate
 */

/**
 * Create an AABB from center position and half-extents.
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} z - Center Z
 * @param {number} halfWidth - Half-width (X extent)
 * @param {number} halfHeight - Half-height (Y extent)
 * @param {number} halfDepth - Half-depth (Z extent)
 * @returns {AABB} The created AABB
 */
export function createAABB(x, y, z, halfWidth, halfHeight, halfDepth) {
    return {
        minX: x - halfWidth,
        minY: y - halfHeight,
        minZ: z - halfDepth,
        maxX: x + halfWidth,
        maxY: y + halfHeight,
        maxZ: z + halfDepth
    };
}

/**
 * Create an AABB from min/max coordinates directly.
 * @param {number} minX - Minimum X
 * @param {number} minY - Minimum Y
 * @param {number} minZ - Minimum Z
 * @param {number} maxX - Maximum X
 * @param {number} maxY - Maximum Y
 * @param {number} maxZ - Maximum Z
 * @returns {AABB} The created AABB
 */
export function createAABBFromMinMax(minX, minY, minZ, maxX, maxY, maxZ) {
    return { minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Create an AABB for a block at integer coordinates.
 * Blocks occupy a 1x1x1 unit cube from (x, y, z) to (x+1, y+1, z+1).
 * @param {number} bx - Block X coordinate
 * @param {number} by - Block Y coordinate
 * @param {number} bz - Block Z coordinate
 * @returns {AABB} Block bounding box
 */
export function createBlockAABB(bx, by, bz) {
    return {
        minX: bx,
        minY: by,
        minZ: bz,
        maxX: bx + 1,
        maxY: by + 1,
        maxZ: bz + 1
    };
}

/**
 * Create an AABB for a player/entity from feet position and dimensions.
 * @param {number} x - Center X position
 * @param {number} y - Feet Y position (bottom of entity)
 * @param {number} z - Center Z position
 * @param {number} width - Entity width (X and Z)
 * @param {number} height - Entity height (Y)
 * @returns {AABB} Entity bounding box
 */
export function createEntityAABB(x, y, z, width, height) {
    const halfWidth = width / 2;
    return {
        minX: x - halfWidth,
        minY: y,
        minZ: z - halfWidth,
        maxX: x + halfWidth,
        maxY: y + height,
        maxZ: z + halfWidth
    };
}

/**
 * Check if two AABBs intersect.
 * Uses strict less-than for edge-to-edge touching (no overlap).
 * @param {AABB} a - First AABB
 * @param {AABB} b - Second AABB
 * @returns {boolean} True if boxes intersect
 */
export function intersectsAABB(a, b) {
    return (
        a.minX < b.maxX && a.maxX > b.minX &&
        a.minY < b.maxY && a.maxY > b.minY &&
        a.minZ < b.maxZ && a.maxZ > b.minZ
    );
}

/**
 * Check if a point is inside an AABB (inclusive bounds).
 * @param {AABB} box - The bounding box
 * @param {number} x - Point X
 * @param {number} y - Point Y
 * @param {number} z - Point Z
 * @returns {boolean} True if point is inside
 */
export function containsPoint(box, x, y, z) {
    return (
        x >= box.minX && x <= box.maxX &&
        y >= box.minY && y <= box.maxY &&
        z >= box.minZ && z <= box.maxZ
    );
}

/**
 * Check if an AABB fully contains another AABB.
 * @param {AABB} outer - The containing box
 * @param {AABB} inner - The box to check
 * @returns {boolean} True if outer fully contains inner
 */
export function containsAABB(outer, inner) {
    return (
        inner.minX >= outer.minX && inner.maxX <= outer.maxX &&
        inner.minY >= outer.minY && inner.maxY <= outer.maxY &&
        inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ
    );
}

/**
 * Expand an AABB by a given amount in all directions.
 * @param {AABB} box - The bounding box
 * @param {number} amount - Amount to expand (can be negative to shrink)
 * @returns {AABB} New expanded AABB
 */
export function expandAABB(box, amount) {
    return {
        minX: box.minX - amount,
        minY: box.minY - amount,
        minZ: box.minZ - amount,
        maxX: box.maxX + amount,
        maxY: box.maxY + amount,
        maxZ: box.maxZ + amount
    };
}

/**
 * Expand an AABB by different amounts per axis.
 * @param {AABB} box - The bounding box
 * @param {number} amountX - X expansion
 * @param {number} amountY - Y expansion
 * @param {number} amountZ - Z expansion
 * @returns {AABB} New expanded AABB
 */
export function expandAABBAxis(box, amountX, amountY, amountZ) {
    return {
        minX: box.minX - amountX,
        minY: box.minY - amountY,
        minZ: box.minZ - amountZ,
        maxX: box.maxX + amountX,
        maxY: box.maxY + amountY,
        maxZ: box.maxZ + amountZ
    };
}

/**
 * Translate an AABB by an offset.
 * @param {AABB} box - The bounding box
 * @param {number} dx - X offset
 * @param {number} dy - Y offset
 * @param {number} dz - Z offset
 * @returns {AABB} New translated AABB
 */
export function translateAABB(box, dx, dy, dz) {
    return {
        minX: box.minX + dx,
        minY: box.minY + dy,
        minZ: box.minZ + dz,
        maxX: box.maxX + dx,
        maxY: box.maxY + dy,
        maxZ: box.maxZ + dz
    };
}

/**
 * Get the center of an AABB.
 * @param {AABB} box - The bounding box
 * @returns {{x: number, y: number, z: number}} Center point
 */
export function getAABBCenter(box) {
    return {
        x: (box.minX + box.maxX) / 2,
        y: (box.minY + box.maxY) / 2,
        z: (box.minZ + box.maxZ) / 2
    };
}

/**
 * Get the dimensions of an AABB.
 * @param {AABB} box - The bounding box
 * @returns {{width: number, height: number, depth: number}} Dimensions
 */
export function getAABBSize(box) {
    return {
        width: box.maxX - box.minX,
        height: box.maxY - box.minY,
        depth: box.maxZ - box.minZ
    };
}

/**
 * Get the volume of an AABB.
 * @param {AABB} box - The bounding box
 * @returns {number} Volume
 */
export function getAABBVolume(box) {
    return (box.maxX - box.minX) * (box.maxY - box.minY) * (box.maxZ - box.minZ);
}

/**
 * Compute the union of two AABBs (smallest box containing both).
 * @param {AABB} a - First AABB
 * @param {AABB} b - Second AABB
 * @returns {AABB} Union AABB
 */
export function unionAABB(a, b) {
    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        minZ: Math.min(a.minZ, b.minZ),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
        maxZ: Math.max(a.maxZ, b.maxZ)
    };
}

/**
 * Compute the intersection of two AABBs.
 * Returns null if boxes don't intersect.
 * @param {AABB} a - First AABB
 * @param {AABB} b - Second AABB
 * @returns {AABB|null} Intersection AABB or null
 */
export function intersectionAABB(a, b) {
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const minZ = Math.max(a.minZ, b.minZ);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);
    const maxZ = Math.min(a.maxZ, b.maxZ);

    if (minX >= maxX || minY >= maxY || minZ >= maxZ) {
        return null;
    }

    return { minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Clone an AABB.
 * @param {AABB} box - The bounding box
 * @returns {AABB} Copy of the AABB
 */
export function cloneAABB(box) {
    return {
        minX: box.minX,
        minY: box.minY,
        minZ: box.minZ,
        maxX: box.maxX,
        maxY: box.maxY,
        maxZ: box.maxZ
    };
}

/**
 * Copy values from one AABB to another (mutates target).
 * @param {AABB} target - Target AABB to modify
 * @param {AABB} source - Source AABB to copy from
 * @returns {AABB} The target AABB
 */
export function copyAABB(target, source) {
    target.minX = source.minX;
    target.minY = source.minY;
    target.minZ = source.minZ;
    target.maxX = source.maxX;
    target.maxY = source.maxY;
    target.maxZ = source.maxZ;
    return target;
}

/**
 * Set AABB values (mutates box).
 * @param {AABB} box - The bounding box to modify
 * @param {number} minX - Minimum X
 * @param {number} minY - Minimum Y
 * @param {number} minZ - Minimum Z
 * @param {number} maxX - Maximum X
 * @param {number} maxY - Maximum Y
 * @param {number} maxZ - Maximum Z
 * @returns {AABB} The modified AABB
 */
export function setAABB(box, minX, minY, minZ, maxX, maxY, maxZ) {
    box.minX = minX;
    box.minY = minY;
    box.minZ = minZ;
    box.maxX = maxX;
    box.maxY = maxY;
    box.maxZ = maxZ;
    return box;
}

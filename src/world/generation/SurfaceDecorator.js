/**
 * Surface block decoration based on elevation, slope, and biome
 * Handles alpine terrain, snow caps, gravel slopes, etc.
 * @module world/generation/SurfaceDecorator
 */

import { noise2D } from '../../math/noise.js';
import { AIR, GRASS, DIRT, STONE, SAND, SNOW, GRAVEL, WATER } from '../../core/constants.js';
import { SEA_LEVEL } from '../../config/WorldConfig.js';

// ============================================================
// ELEVATION THRESHOLDS (adjusted for 320 world height)
// Based on realistic alpine ecology and mountain terrain
// Sea level = 60, typical lowland terrain = 60-80
// ============================================================
export const ELEVATION = {
    SNOW_LINE: 190,           // ~13k ft equivalent - permanent snowpack
    SNOW_PATCHES_LINE: 160,   // ~11k ft - patchy snow on north-facing slopes
    HIGH_ROCK_LINE: 140,      // ~10k ft - mostly bare rock, krummholz zone
    ROCK_LINE: 110,           // ~8k ft - talus slopes, sparse alpine plants
    ALPINE_LINE: 85,          // ~6k ft - alpine meadows, stunted trees
    TREE_LINE_BASE: 80,       // ~5.5k ft - treeline (varies by slope aspect)
    FOREST_LINE: 70,          // ~4.5k ft - dense forest possible below this
    RIVER_MAX_ELEVATION: 75,  // Rivers only carve below foothills
    LAKE_ELEVATION_MIN: 100,  // Alpine/glacial lakes possible in high basins
};

// Slope thresholds (in blocks height difference)
export const SLOPE = {
    CLIFF: 8,      // >60 degrees - vertical cliffs, bare rock only
    STEEP: 5,      // ~45 degrees - no snow/soil accumulation
    MODERATE: 3,   // ~30 degrees - reduced vegetation, some erosion
};

/**
 * Calculate slope analysis for a position given height cache
 *
 * @param {number} lx - Local X position
 * @param {number} lz - Local Z position
 * @param {Float32Array|Uint16Array} heightCache - Height cache for the chunk
 * @param {number} chunkSize - Size of chunk
 * @returns {{maxSlope: number, isCliff: boolean, isSteep: boolean, isModerate: boolean, northFacing: boolean, southFacing: boolean, isExposedRidge: boolean}}
 */
export function analyzeSlopeAt(lx, lz, heightCache, chunkSize) {
    const idx = lx + lz * chunkSize;
    const centerY = heightCache[idx];

    const neighborOffsets = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, -1], [-1, 1], [1, 1]
    ];

    let maxSlope = 0;
    let slopeNorth = 0, slopeSouth = 0, slopeEast = 0, slopeWest = 0;

    for (const [dx, dz] of neighborOffsets) {
        const nx = lx + dx;
        const nz = lz + dz;
        if (nx >= 0 && nx < chunkSize && nz >= 0 && nz < chunkSize) {
            const nIdx = nx + nz * chunkSize;
            const neighborY = heightCache[nIdx];
            const slope = centerY - neighborY; // Positive = we're higher
            const absSlope = Math.abs(slope);
            if (absSlope > maxSlope) maxSlope = absSlope;

            // Track directional slopes for aspect calculations
            if (dz < 0) slopeNorth = Math.max(slopeNorth, slope);
            if (dz > 0) slopeSouth = Math.max(slopeSouth, slope);
            if (dx > 0) slopeEast = Math.max(slopeEast, slope);
            if (dx < 0) slopeWest = Math.max(slopeWest, slope);
        }
    }

    return {
        maxSlope,
        isCliff: maxSlope >= SLOPE.CLIFF,
        isSteep: maxSlope >= SLOPE.STEEP,
        isModerate: maxSlope >= SLOPE.MODERATE,
        northFacing: slopeNorth > slopeSouth + 1,
        southFacing: slopeSouth > slopeNorth + 1,
        isExposedRidge: slopeNorth > 2 && slopeSouth > 2,
    };
}

/**
 * Check if position qualifies as an alpine lake bed
 *
 * @param {number} gx - Global X
 * @param {number} gz - Global Z
 * @param {number} worldTopY - Surface height
 * @param {number} maxSlope - Maximum slope at position
 * @returns {boolean}
 */
export function isAlpineLakeBed(gx, gz, worldTopY, maxSlope) {
    if (worldTopY <= ELEVATION.LAKE_ELEVATION_MIN) return false;
    if (worldTopY >= ELEVATION.SNOW_PATCHES_LINE) return false;
    if (maxSlope >= 2) return false;

    const lakeNoise = noise2D(gx * 0.015 + 500, gz * 0.015 + 500);
    const patchNoise = noise2D(gx * 0.05 + 100, gz * 0.05 + 100);

    return lakeNoise > 0.7 && patchNoise < 0;
}

/**
 * Get surface block for mountain/alpine terrain
 *
 * @param {number} gx - Global X
 * @param {number} gz - Global Z
 * @param {number} worldTopY - Surface Y level
 * @param {boolean} isMountain - Whether biome has mountain tag
 * @param {Object} slopeInfo - Slope analysis result
 * @param {number} riverFactor - River factor (0-1)
 * @returns {number} Block ID for surface
 */
export function getMountainSurfaceBlock(gx, gz, worldTopY, isMountain, slopeInfo, riverFactor) {
    const { isCliff, isSteep, isModerate, northFacing, isExposedRidge } = slopeInfo;

    // Noise layers for surface variation
    const surfaceNoise = noise2D(gx * 0.1, gz * 0.1);
    const patchNoise = noise2D(gx * 0.05 + 100, gz * 0.05 + 100);
    const detailNoise = noise2D(gx * 0.2 + 200, gz * 0.2 + 200);
    const screeNoise = noise2D(gx * 0.08 + 300, gz * 0.08 + 300);

    // Check for alpine lake bed
    if (isAlpineLakeBed(gx, gz, worldTopY, slopeInfo.maxSlope)) {
        return GRAVEL;
    }

    // River sand (only at low elevations)
    if (riverFactor < 0.8 && worldTopY <= ELEVATION.RIVER_MAX_ELEVATION) {
        return SAND;
    }

    // Beach/shore
    if (worldTopY < SEA_LEVEL + 2 && worldTopY >= SEA_LEVEL - 1) {
        return SAND;
    }

    // Mountain terrain
    if (isMountain || worldTopY >= ELEVATION.ALPINE_LINE) {

        // === PERMANENT SNOW ZONE ===
        if (worldTopY >= ELEVATION.SNOW_LINE) {
            if (isCliff) return STONE;
            if (isSteep) return surfaceNoise > 0.3 ? STONE : GRAVEL;
            if (isExposedRidge && detailNoise > 0.4) return STONE;
            return SNOW;
        }

        // === SNOW PATCHES ZONE ===
        if (worldTopY >= ELEVATION.SNOW_PATCHES_LINE) {
            if (isCliff) return STONE;
            if (northFacing && !isSteep && patchNoise > 0.2) return SNOW;
            if (!isModerate && patchNoise > 0.5) return SNOW;
            if (isSteep) return surfaceNoise > 0 ? STONE : GRAVEL;
            return surfaceNoise > 0.3 ? STONE : GRAVEL;
        }

        // === HIGH ROCK ZONE ===
        if (worldTopY >= ELEVATION.HIGH_ROCK_LINE) {
            if (isCliff) return STONE;
            if (isModerate && screeNoise > 0) return GRAVEL;
            if (northFacing && !isSteep && patchNoise > 0.6) return SNOW;
            return surfaceNoise > 0.2 ? STONE : GRAVEL;
        }

        // === ROCK/GRAVEL TRANSITION ZONE ===
        if (worldTopY >= ELEVATION.ROCK_LINE || isCliff) {
            if (isCliff) return STONE;
            if (!isModerate && detailNoise > 0.6) return STONE;
            if (isModerate) return screeNoise > 0 ? GRAVEL : STONE;
            const r = surfaceNoise + detailNoise * 0.5;
            if (r > 0.4) return STONE;
            if (r > -0.2) return GRAVEL;
            return STONE;
        }

        // === ALPINE MEADOW ZONE ===
        if (worldTopY >= ELEVATION.ALPINE_LINE) {
            if (isCliff) return STONE;
            if (isSteep) return surfaceNoise > 0 ? STONE : GRAVEL;
            if (!isModerate) {
                if (patchNoise > 0.3) return GRASS;
                if (patchNoise > -0.2) return DIRT;
                return surfaceNoise > 0 ? STONE : GRAVEL;
            }
            if (patchNoise > 0.5) return GRASS;
            if (patchNoise > 0) return DIRT;
            return GRAVEL;
        }

        // === LOWER MOUNTAIN SLOPES ===
        if (isSteep) return surfaceNoise > 0.3 ? STONE : GRAVEL;
        if (isModerate) return patchNoise > -0.3 ? GRASS : DIRT;
        if (detailNoise > 0.7) return STONE;
        if (patchNoise > -0.4) return GRASS;
        return DIRT;
    }

    // === NON-MOUNTAIN LOW ELEVATION ===
    if (isSteep) return surfaceNoise > 0.5 ? STONE : DIRT;
    if (detailNoise > 0.8) return STONE;
    return GRASS;
}

/**
 * Get subsurface block based on depth and elevation
 *
 * @param {number} worldTopY - Surface Y level
 * @param {number} depth - Depth below surface (1-3)
 * @param {boolean} isSteep - Whether slope is steep
 * @returns {number} Block ID for subsurface
 */
export function getSubsurfaceBlock(worldTopY, depth, isSteep) {
    if (worldTopY >= ELEVATION.HIGH_ROCK_LINE) {
        return STONE; // No soil at high elevation
    }
    if (worldTopY >= ELEVATION.ROCK_LINE) {
        return depth < 2 ? GRAVEL : STONE;
    }
    if (worldTopY >= ELEVATION.ALPINE_LINE) {
        // Thin soil in alpine zone
        return depth < 2 ? DIRT : STONE;
    }
    if (isSteep) {
        // Thin soil on slopes
        return depth < 2 ? DIRT : STONE;
    }
    return DIRT;
}

/**
 * Determine if position should be above tree line
 *
 * @param {number} y - Height level
 * @param {number} treeLineHeight - Calculated tree line height
 * @returns {boolean}
 */
export function isAboveTreeLine(y, treeLineHeight) {
    return y > treeLineHeight;
}

/**
 * Calculate tree line height for a position (varies by slope aspect)
 *
 * @param {number} gx - Global X
 * @param {number} gz - Global Z
 * @param {boolean} southFacing - Whether slope faces south
 * @returns {number} Tree line height
 */
export function calculateTreeLine(gx, gz, southFacing) {
    // South-facing slopes have higher tree lines
    let treeLineBase = ELEVATION.TREE_LINE_BASE;
    if (southFacing) {
        treeLineBase += 8; // South-facing = ~8 blocks higher tree line
    }

    // Add some noise variation
    const treeLineNoise = noise2D(gx * 0.01, gz * 0.01);
    return treeLineBase + Math.floor(treeLineNoise * 5);
}

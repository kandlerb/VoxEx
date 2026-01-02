/**
 * Terrain height and biome calculation
 * @module world/generation/TerrainGenerator
 */

import { noise2D, fbm2D, fbmWithDomainWarp, treePlacementValue, initNoise } from '../../math/noise.js';
import { BIOME_CONFIG, BIOME_DEFAULTS } from '../../config/BiomeConfig.js';
import { WORLD_DIMS, SEA_LEVEL } from '../../config/WorldConfig.js';

/**
 * Biome cell size for caching biome lookups
 * @type {number}
 */
const BIOME_CELL_SIZE = 64;

/**
 * Key multiplier for numeric cache keys (avoids string concatenation)
 * @type {number}
 */
const KEY_MULTIPLIER = 1048576;

/**
 * TerrainGenerator - handles terrain height calculation and biome determination
 */
export class TerrainGenerator {
    /**
     * Create a new terrain generator
     * @param {Object} [options] - Configuration options
     * @param {number} [options.seed=0] - World seed
     * @param {number} [options.biomeFrequency=0.005] - Biome noise frequency
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 0;
        this.biomeFrequency = options.biomeFrequency ?? 0.005;

        /** @type {Map<number, Object>} Cached biome lookups by cell */
        this.biomeCellCache = new Map();

        /** @type {Map<number, Uint8Array>} Cached tree masks by chunk */
        this.treeMaskCache = new Map();

        /** @type {Object|null} Biome lookup table */
        this.biomeTable = null;

        /** @type {Map<string, Object>} Biome by name for O(1) lookup */
        this.biomeByName = new Map();

        /** @type {Object} Tree density lookup by biome name */
        this._densityMap = {};

        /** @type {number} Default tree density */
        this._defaultDensity = 0.03;

        // Build initial tables
        this._buildBiomeTable();
        this._buildDensityMap();
    }

    /**
     * Initialize the generator with a specific seed
     * @param {number} seed - World seed
     */
    init(seed) {
        this.seed = seed;
        initNoise(seed);
        this.clearCaches();
        this._buildBiomeTable();
        this._buildDensityMap();
    }

    /**
     * Clear all caches
     */
    clearCaches() {
        this.biomeCellCache.clear();
        this.treeMaskCache.clear();
    }

    /**
     * Build the biome selection table from BIOME_CONFIG
     * @private
     */
    _buildBiomeTable() {
        const biomes = [];
        let totalWeight = 0;

        for (const [name, config] of Object.entries(BIOME_CONFIG)) {
            const biome = {
                name,
                ...BIOME_DEFAULTS,
                ...config,
                weight: config.weight ?? 1
            };
            biomes.push(biome);
            this.biomeByName.set(name, biome);
        }

        const cumulative = [];
        for (const biome of biomes) {
            totalWeight += biome.weight;
            cumulative.push({ threshold: totalWeight, biome });
        }

        this.biomeTable = { cumulative, totalWeight };
    }

    /**
     * Build tree density lookup map
     * @private
     */
    _buildDensityMap() {
        this._densityMap = {};
        for (const [name, config] of Object.entries(BIOME_CONFIG)) {
            this._densityMap[name] = config.trees?.density ?? 0.0;
        }
    }

    // =====================================================
    // BIOME FUNCTIONS
    // =====================================================

    /**
     * Get biome at world position with caching
     * @param {number} gx - Global X coordinate
     * @param {number} gz - Global Z coordinate
     * @returns {Object} Biome configuration
     */
    getBiomeAt(gx, gz) {
        const cellX = Math.floor(gx / BIOME_CELL_SIZE);
        const cellZ = Math.floor(gz / BIOME_CELL_SIZE);

        // Numeric key for cache (avoids string GC)
        const key = (cellX + 524288) * KEY_MULTIPLIER + (cellZ + 524288);

        const cached = this.biomeCellCache.get(key);
        if (cached) return cached;

        // Vote among 9 surrounding cells for smoother biome transitions
        const centerX = cellX * BIOME_CELL_SIZE + BIOME_CELL_SIZE * 0.5;
        const centerZ = cellZ * BIOME_CELL_SIZE + BIOME_CELL_SIZE * 0.5;

        const counts = new Map();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const sampleX = centerX + dx * BIOME_CELL_SIZE;
                const sampleZ = centerZ + dz * BIOME_CELL_SIZE;
                const biome = this._getRawBiome(sampleX, sampleZ);
                const dist = Math.sqrt(dx * dx + dz * dz);
                const weight = dist === 0 ? 1.5 : 1.0 / (1.0 + dist);
                counts.set(biome.name, (counts.get(biome.name) || 0) + weight);
            }
        }

        let bestBiome = null;
        let bestScore = -Infinity;
        for (const [name, score] of counts.entries()) {
            if (score > bestScore) {
                bestScore = score;
                bestBiome = this.biomeByName.get(name) || this._getRawBiome(centerX, centerZ);
            }
        }

        if (!bestBiome) {
            bestBiome = this._getRawBiome(centerX, centerZ);
        }

        this.biomeCellCache.set(key, bestBiome);
        return bestBiome;
    }

    /**
     * Get raw biome from noise without caching
     * @param {number} gx - Global X coordinate
     * @param {number} gz - Global Z coordinate
     * @returns {Object} Biome configuration
     * @private
     */
    _getRawBiome(gx, gz) {
        const noiseVal = noise2D(
            gx * this.biomeFrequency + this.seed * 0.37,
            gz * this.biomeFrequency - this.seed * 0.71
        );
        const t = (noiseVal + 1) * 0.5;
        const target = t * this.biomeTable.totalWeight;

        for (const entry of this.biomeTable.cumulative) {
            if (target <= entry.threshold) {
                return entry.biome;
            }
        }
        return this.biomeTable.cumulative[0].biome;
    }

    // =====================================================
    // HEIGHT FUNCTIONS
    // =====================================================

    /**
     * Get terrain height at world position
     * @param {number} gx - Global X coordinate
     * @param {number} gz - Global Z coordinate
     * @returns {number} Height in blocks (floored)
     */
    getHeightAt(gx, gz) {
        return this.blendedHeight(gx, gz, this.seed);
    }

    /**
     * Calculate blended terrain height with biome interpolation
     * @param {number} gx - Global X coordinate
     * @param {number} gz - Global Z coordinate
     * @param {number} seed - World seed
     * @returns {number} Blended height (floored)
     */
    blendedHeight(gx, gz, seed) {
        // Get continentalness factor (-1 to 1)
        const c = this.continentalHeight(gx, gz, seed);

        // Biome grid interpolation
        const gridScale = BIOME_CELL_SIZE;
        const u = gx / gridScale - 0.5;
        const v = gz / gridScale - 0.5;
        const x0 = Math.floor(u);
        const z0 = Math.floor(v);
        const x1 = x0 + 1;
        const z1 = z0 + 1;
        const wx = u - x0;
        const wz = v - z0;

        // Smoothstep interpolation weights
        const sx = wx * wx * (3 - 2 * wx);
        const sz = wz * wz * (3 - 2 * wz);

        // Sample 4 biomes and calculate heights
        const h00 = this._getBiomeHeightAtCell(x0, z0, gx, gz, seed, c);
        const h10 = this._getBiomeHeightAtCell(x1, z0, gx, gz, seed, c);
        const h01 = this._getBiomeHeightAtCell(x0, z1, gx, gz, seed, c);
        const h11 = this._getBiomeHeightAtCell(x1, z1, gx, gz, seed, c);

        // Bilinear interpolation
        const h0 = h00 + (h10 - h00) * sx;
        const h1 = h01 + (h11 - h01) * sx;
        let finalHeight = h0 + (h1 - h0) * sz;

        // Apply oceans first (larger scale feature)
        const oceanFactor = this.getOceanFactor(gx, gz, seed);
        if (oceanFactor < 1.0) {
            const oceanDepth = this._getOceanDepth(oceanFactor, gx, gz, seed);
            const oceanFloor = SEA_LEVEL - oceanDepth;
            const bank = oceanFactor * oceanFactor * (3 - 2 * oceanFactor);
            finalHeight = oceanFloor + (finalHeight - oceanFloor) * bank;
        }

        // Apply rivers (can carve through ocean edges too)
        const r = this.getRiverFactor(gx, gz, seed);
        if (r < 1.0) {
            const riverDepth = this._getRiverDepth(r, gx, gz, seed);
            const riverBed = SEA_LEVEL - riverDepth;
            const bank = r * r * (3 - 2 * r);
            const carvedHeight = Math.min(finalHeight, riverBed);
            finalHeight = carvedHeight + (finalHeight - carvedHeight) * bank;
        }

        return Math.floor(finalHeight);
    }

    /**
     * Get biome height at a specific grid cell
     * @private
     */
    _getBiomeHeightAtCell(cx, cz, gx, gz, seed, continentFactor) {
        const centerX = cx * BIOME_CELL_SIZE + BIOME_CELL_SIZE * 0.5;
        const centerZ = cz * BIOME_CELL_SIZE + BIOME_CELL_SIZE * 0.5;
        const biome = this.getBiomeAt(centerX, centerZ);

        // Get height function for this biome
        const heightFunc = this._getHeightFuncForBiome(biome);
        let h = heightFunc.call(this, gx, gz, biome, seed);

        // Apply continental scaling (ocean = 0.3x, inland = 1.0x)
        const t = (continentFactor + 1) * 0.5; // -1..1 -> 0..1
        const factor = 0.3 + t * 0.7;
        h = biome.baseHeight + (h - biome.baseHeight) * factor;

        // Add height boost for inland areas (mountains)
        h += Math.max(0, continentFactor - 0.15) * 10;

        return h;
    }

    /**
     * Get the appropriate height function for a biome
     * @param {Object} biome - Biome configuration
     * @returns {Function} Height function
     * @private
     */
    _getHeightFuncForBiome(biome) {
        // Check if biome has custom height function name
        const funcName = biome.heightFuncName || 'default';

        switch (funcName) {
            case 'plains':
                return this.plainsHeightFunc;
            case 'hills':
                return this.hillsHeightFunc;
            case 'mountains':
                return this.mountainsHeightFunc;
            default:
                return this.defaultHeightFunc;
        }
    }

    // =====================================================
    // BIOME-SPECIFIC HEIGHT FUNCTIONS
    // =====================================================

    /**
     * Default height function (forests, swamp)
     */
    defaultHeightFunc(gx, gz, biome, seed) {
        const n = fbm2D(gx * biome.roughness, gz * biome.roughness, 4, 0.5, 2.0);
        return Math.floor(biome.baseHeight + n * biome.amplitude);
    }

    /**
     * Plains height function - gentle rolling terrain
     */
    plainsHeightFunc(gx, gz, biome, seed) {
        const base = noise2D(gx * 0.003, gz * 0.003);
        const detail = noise2D(gx * 0.05, gz * 0.05) * 0.1;
        return Math.floor(biome.baseHeight + (base + detail) * biome.amplitude);
    }

    /**
     * Hills height function - rounded humps
     */
    hillsHeightFunc(gx, gz, biome, seed) {
        let n = Math.abs(noise2D(gx * biome.roughness, gz * biome.roughness));
        n = n * n; // Square for rounder tops
        return Math.floor(biome.baseHeight + n * biome.amplitude);
    }

    /**
     * Mountains height function - complex alpine terrain
     */
    mountainsHeightFunc(gx, gz, biome, seed) {
        // Domain warping for winding ridge lines
        const warpScale = 0.0015;
        const warpStrength = 80;
        const warpX = gx + noise2D(gx * warpScale + seed, gz * warpScale) * warpStrength;
        const warpZ = gz + noise2D(gx * warpScale + 100, gz * warpScale + seed) * warpStrength;

        // Regional variation (foothills vs major peaks)
        const regionNoise = noise2D(gx * 0.0006 + seed * 0.3, gz * 0.0006 - seed * 0.3);
        const regionNoise2 = noise2D(gx * 0.001 + seed * 0.7, gz * 0.001 + seed * 0.2);
        const regionScale = 0.15 + Math.pow((regionNoise + 1) * 0.5, 0.8) * 0.55 +
                           Math.pow((regionNoise2 + 1) * 0.5, 1.2) * 0.30;

        // Main ridge system with domain warping
        const rx = warpX * biome.roughness;
        const rz = warpZ * biome.roughness;
        let ridgeSum = 0;
        let amp = 1.0;
        let freq = 1.0;

        for (let i = 0; i < 6; i++) {
            let n = 1.0 - Math.abs(noise2D(rx * freq + seed * 10, rz * freq + seed * 10));
            const sharpness = i < 2 ? 1.5 : 1.2;
            n = Math.pow(n, sharpness);
            ridgeSum += n * amp;
            freq *= 2.0;
            amp *= 0.52;
        }
        ridgeSum = ridgeSum / 2.2;

        // Valley carving
        const valleyNoise = noise2D(gx * 0.003 + seed * 5, gz * 0.003 - seed * 5);
        const valleyNoise2 = noise2D(gx * 0.006 - seed * 2, gz * 0.006 + seed * 2);
        const valleyFactor = Math.max(0, -valleyNoise * 0.5 - valleyNoise2 * 0.3);
        const valleyCarve = valleyFactor * 0.35;

        // Saddles and passes
        const saddleNoise = noise2D(gx * 0.008 + seed * 8, gz * 0.008 - seed * 8);
        const saddleFactor = saddleNoise > 0.6 ? (saddleNoise - 0.6) * 0.5 : 0;

        // Peak variation
        const peakTypeNoise = noise2D(gx * 0.004 + seed * 12, gz * 0.004 - seed * 12);
        let peakBonus = 0;
        if (peakTypeNoise > 0.5 && ridgeSum > 0.6) {
            const spireNoise = noise2D(gx * 0.02 + seed * 15, gz * 0.02 - seed * 15);
            if (spireNoise > 0.6) {
                peakBonus = Math.pow((spireNoise - 0.6) * 2.5, 2) * 0.25;
            }
        } else if (peakTypeNoise < -0.3 && ridgeSum > 0.5) {
            peakBonus = ridgeSum * 0.1;
        }

        // Cliff bands
        const preHeight = ridgeSum - valleyCarve - saddleFactor + peakBonus;
        const cliffBandNoise = noise2D(gx * 0.05 + seed * 20, gz * 0.05);
        let cliffBonus = 0;
        if (preHeight > 0.35 && preHeight < 0.45 && cliffBandNoise > 0.3) {
            cliffBonus = (cliffBandNoise - 0.3) * 0.08;
        } else if (preHeight > 0.65 && preHeight < 0.75 && cliffBandNoise > 0.2) {
            cliffBonus = (cliffBandNoise - 0.2) * 0.1;
        }

        // Erosion detail
        const erosionNoise = noise2D(gx * 0.08 + seed * 3, gz * 0.08 - seed * 3);
        const erosionNoise2 = noise2D(gx * 0.15 - seed * 4, gz * 0.15 + seed * 4);
        const erosionAmount = (Math.abs(erosionNoise) * 0.04 + Math.abs(erosionNoise2) * 0.02) *
                             (0.5 + ridgeSum * 0.5);

        // Gullies
        const gullyNoise = 1.0 - Math.abs(noise2D(gx * 0.025 + seed * 25, gz * 0.025 - seed * 25));
        const gullyCarve = gullyNoise > 0.85 ? (gullyNoise - 0.85) * 0.15 : 0;

        // Combine all factors
        let totalHeight = ridgeSum - valleyCarve - saddleFactor + peakBonus + cliffBonus +
                         erosionAmount - gullyCarve;
        totalHeight *= regionScale;

        // Foothill transition
        const baseNoise = noise2D(gx * 0.002, gz * 0.002);
        const foothillBase = (baseNoise + 1) * 0.5 * 0.15;
        totalHeight = foothillBase + totalHeight * 0.85;

        const rawHeight = biome.baseHeight + totalHeight * biome.amplitude;
        return Math.floor(Math.min(Math.max(rawHeight, biome.baseHeight - 10), 285));
    }

    // =====================================================
    // CONTINENTAL/WATER FEATURES
    // =====================================================

    /**
     * Calculate continental height factor (-1 to 1)
     */
    continentalHeight(gx, gz, seed) {
        const base = fbmWithDomainWarp(gx * 0.002, gz * 0.002, 4, 0.5, 2.0);
        const erosion = fbm2D(gx * 0.004 + seed * 3.17, gz * 0.004 - seed * 5.41, 3, 0.6, 1.8);
        let c = base * 0.7 + erosion * 0.3;
        c += 0.3;
        return Math.max(-1, Math.min(1, c));
    }

    /**
     * Get river factor at position (1.0 = land, 0.0 = river center)
     */
    getRiverFactor(gx, gz, seed) {
        const warpScale = 0.004;
        const warpStrength = 20.0;
        const wx = gx + noise2D(gx * warpScale, gz * warpScale) * warpStrength;
        const wz = gz + noise2D(gx * warpScale + 100, gz * warpScale + 100) * warpStrength;
        const scale = 0.001;
        const n = Math.abs(noise2D(wx * scale + seed * 0.1, wz * scale - seed * 0.1));

        // Coastal noise for natural shorelines
        const coastNoiseScale = 0.05;
        const coastNoise = noise2D(gx * coastNoiseScale + seed * 0.7, gz * coastNoiseScale - seed * 0.3);
        const coastVariation = coastNoise * 0.02;
        const width = 0.055 + coastVariation;

        if (n < width) {
            let t = n / width;
            return t * t * (3 - 2 * t);
        }
        return 1.0;
    }

    /**
     * Get ocean factor at position (1.0 = land, 0.0 = deep ocean)
     */
    getOceanFactor(gx, gz, seed) {
        const oceanScale = 0.0008;
        const oceanNoise = noise2D(gx * oceanScale + seed * 1.5, gz * oceanScale - seed * 0.8);

        const coastScale = 0.004;
        const coastNoise = noise2D(gx * coastScale + seed * 2.1, gz * coastScale + seed * 1.3);

        const detailScale = 0.02;
        const detailNoise = noise2D(gx * detailScale - seed * 0.5, gz * detailScale + seed * 0.9) * 0.1;

        const combined = oceanNoise + coastNoise * 0.3 + detailNoise;
        const oceanThreshold = -0.3;
        const shallowThreshold = -0.1;

        if (combined < oceanThreshold) {
            return 0.0;
        } else if (combined < shallowThreshold) {
            let t = (combined - oceanThreshold) / (shallowThreshold - oceanThreshold);
            return t * t * (3 - 2 * t);
        }
        return 1.0;
    }

    /**
     * Get river depth at location
     * @private
     */
    _getRiverDepth(riverFactor, gx, gz, seed) {
        const baseRiverDepth = 6;
        const depthNoise = noise2D(gx * 0.03 + seed * 0.4, gz * 0.03 - seed * 0.2);
        const depthVariation = (depthNoise + 1) * 0.5 * 3;
        const centerFactor = 1.0 - riverFactor;
        return baseRiverDepth + depthVariation * centerFactor;
    }

    /**
     * Get ocean depth at location
     * @private
     */
    _getOceanDepth(oceanFactor, gx, gz, seed) {
        const baseOceanDepth = 20;
        const depthNoise = noise2D(gx * 0.008 + seed * 0.9, gz * 0.008 - seed * 0.6);
        const depthVariation = (depthNoise + 1) * 0.5 * 15;
        const centerFactor = 1.0 - oceanFactor;
        return baseOceanDepth + depthVariation * centerFactor;
    }

    // =====================================================
    // TREE MASK FUNCTIONS
    // =====================================================

    /**
     * Get tree density for a biome
     * @param {string} biomeName - Biome name
     * @returns {number} Tree density (0-1)
     */
    getTreeDensityForBiome(biomeName) {
        return this._densityMap[biomeName] ?? this._defaultDensity;
    }

    /**
     * Get tree mask value at global position
     * @param {number} gx - Global X coordinate
     * @param {number} gz - Global Z coordinate
     * @returns {boolean} True if tree can be placed here
     */
    getTreeMaskValueGlobal(gx, gz) {
        const cs = WORLD_DIMS.chunkSize;
        const cx = Math.floor(gx / cs);
        const cz = Math.floor(gz / cs);
        const lx = ((gx % cs) + cs) % cs;
        const lz = ((gz % cs) + cs) % cs;
        const mask = this.getTreeMaskForChunk(cx, cz);
        return mask[lx + lz * cs] === 1;
    }

    /**
     * Get or generate tree mask for a chunk
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @returns {Uint8Array} Tree mask (1 = tree allowed)
     */
    getTreeMaskForChunk(cx, cz) {
        const key = (cx + 524288) * KEY_MULTIPLIER + (cz + 524288);
        let mask = this.treeMaskCache.get(key);
        if (!mask) {
            mask = this._generateTreeMaskForChunk(cx, cz);
            this.treeMaskCache.set(key, mask);
        }
        return mask;
    }

    /**
     * Generate tree placement mask for a chunk
     * Uses cellular automata for natural clustering
     * @private
     */
    _generateTreeMaskForChunk(cx, cz) {
        const cs = WORLD_DIMS.chunkSize;
        const mask = new Uint8Array(cs * cs);
        const startX = cx * cs;
        const startZ = cz * cs;

        // Initial placement based on density
        for (let lz = 0; lz < cs; lz++) {
            for (let lx = 0; lx < cs; lx++) {
                const gx = startX + lx;
                const gz = startZ + lz;
                const biome = this.getBiomeAt(gx, gz);
                if (!biome) continue;

                const density = this.getTreeDensityForBiome(biome.name);
                if (density <= 0) continue;

                const p = treePlacementValue(gx, gz, this.seed);
                if (p < density * 1.4) {
                    mask[lx + lz * cs] = 1;
                }
            }
        }

        // Cellular automata smoothing (3 steps)
        const tmp = new Uint8Array(cs * cs);
        for (let s = 0; s < 3; s++) {
            for (let lx = 0; lx < cs; lx++) {
                for (let lz = 0; lz < cs; lz++) {
                    const idx = lx + lz * cs;
                    const cur = mask[idx];
                    let neighbors = 0;

                    for (let ox = -1; ox <= 1; ox++) {
                        for (let oz = -1; oz <= 1; oz++) {
                            if (ox === 0 && oz === 0) continue;
                            const nx = lx + ox;
                            const nz = lz + oz;
                            if (nx < 0 || nx >= cs || nz < 0 || nz >= cs) continue;
                            neighbors += mask[nx + nz * cs];
                        }
                    }

                    // Survival/birth rules
                    tmp[idx] = cur ? (neighbors >= 2 && neighbors <= 6 ? 1 : 0) : (neighbors >= 4 ? 1 : 0);
                }
            }
            mask.set(tmp);
        }

        return mask;
    }
}

export default TerrainGenerator;

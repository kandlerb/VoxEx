/**
 * Procedural texture atlas generation
 * @module render/textures/TextureAtlas
 */

import * as THREE from 'three';
import { NUM_TILES, TILE, BLOCK_CONFIG } from '../../config/BlockConfig.js';

// =====================================================
// Seeded RNG for deterministic texture generation
// =====================================================

/**
 * Seeded random number generator for deterministic textures
 */
class SeededRNG {
    /**
     * @param {number} seed - Initial seed value
     */
    constructor(seed) {
        this.seed = seed;
    }

    /**
     * Get next random value
     * @returns {number} Random value between 0 and 1
     */
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
}

// =====================================================
// Color Palettes
// =====================================================

/**
 * Oak log color palette
 * @type {Object}
 */
const OAK_PALETTE = {
    barkBase: "#5D4037",
    barkDark: "#4E342E",
    barkGroove: "#281814",
    barkGrooveEdge: "#3E2723",
    barkHighlight: "#795548",
    barkHighlight2: "#8D6E63",
    woodBase: "#C19A6B",
    woodRing: "#8B5A2B",
    woodCenter: "#A6764A",
    woodNoise: "#A17E55",
    woodBark: "#5D4037",
    woodBarkDark: "#3E2723",
    ringSpacing: 4,
    ringThreshold: 0.65,
};

/**
 * Longwood log color palette - very dark, rough bark
 * @type {Object}
 */
const LONGWOOD_PALETTE = {
    barkBase: "#3D2A1F",
    barkDark: "#2A1A12",
    barkGroove: "#1A0F08",
    barkGrooveEdge: "#2D1810",
    barkHighlight: "#5A4030",
    barkHighlight2: "#6B5040",
    woodBase: "#8B6B50",
    woodRing: "#4A3020",
    woodCenter: "#6B5040",
    woodNoise: "#7A5A40",
    woodBark: "#3D2A1F",
    woodBarkDark: "#2A1A12",
    ringSpacing: 2,
    ringThreshold: 0.50,
};

/**
 * Dirt colors palette
 * @type {Object}
 */
const DIRT_COLORS = {
    base: "#5d4037",
    shadow: "#3e2723",
    highlight: "#8d6e63",
    grit: "#795548",
};

// =====================================================
// Tile Drawing Functions
// =====================================================

/**
 * Fill a logical pixel at position
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} gx - Grid X position
 * @param {number} gy - Grid Y position
 * @param {string} color - CSS color string
 * @param {number} step - Pixel step size
 */
function fillLogicalPixel(ctx, tileX, gx, gy, color, step) {
    ctx.fillStyle = color;
    ctx.fillRect(tileX + gx * step, gy * step, step, step);
}

/**
 * Begin drawing a tile with an opaque base color
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {string} baseColor - Base color
 * @param {number} tileSize - Size of tile
 */
function beginTile(ctx, tileX, baseColor, tileSize) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(tileX, 0, tileSize, tileSize);
}

/**
 * Draw log side (bark) texture with vertical grooves
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {Object} palette - Color palette
 * @param {SeededRNG} rng - Seeded RNG
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} tileSize - Tile size in canvas pixels
 * @param {number} step - Pixel step size
 */
function drawLogSide(ctx, tileX, palette, rng, pixelsPerTile, tileSize, step) {
    beginTile(ctx, tileX, palette.barkBase, tileSize);

    // Base noise layer
    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const base = rng.next() > 0.5 ? palette.barkBase : palette.barkDark;
            fillLogicalPixel(ctx, tileX, x, y, base, step);
        }
    }

    // Vertical grooves
    const numGrooves = Math.floor(pixelsPerTile / 3);
    for (let g = 0; g < numGrooves; g++) {
        let x = Math.floor(rng.next() * pixelsPerTile);
        for (let y = 0; y < pixelsPerTile; y++) {
            const left = (x - 1 + pixelsPerTile) % pixelsPerTile;
            const right = (x + 1) % pixelsPerTile;
            fillLogicalPixel(ctx, tileX, left, y, palette.barkGrooveEdge, step);
            fillLogicalPixel(ctx, tileX, right, y, palette.barkGrooveEdge, step);
            fillLogicalPixel(ctx, tileX, x, y, palette.barkGroove, step);
            const wiggle = rng.next();
            if (wiggle < 0.2) x--;
            else if (wiggle > 0.8) x++;
            if (x < 0) x = pixelsPerTile - 1;
            if (x >= pixelsPerTile) x = 0;
            if (rng.next() > 0.9) y++;
        }
    }

    // Bark highlights
    const highlightCount = Math.floor((pixelsPerTile * pixelsPerTile) / 2);
    for (let i = 0; i < highlightCount; i++) {
        const x = Math.floor(rng.next() * pixelsPerTile);
        const y = Math.floor(rng.next() * pixelsPerTile);
        if (rng.next() > 0.75) {
            const highlight = rng.next() > 0.5 ? palette.barkHighlight : palette.barkHighlight2;
            fillLogicalPixel(ctx, tileX, x, y, highlight, step);
        }
    }
}

/**
 * Draw log top (rings) texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {Object} palette - Color palette
 * @param {SeededRNG} rng - Seeded RNG
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} tileSize - Tile size in canvas pixels
 * @param {number} step - Pixel step size
 */
function drawLogTop(ctx, tileX, palette, rng, pixelsPerTile, tileSize, step) {
    beginTile(ctx, tileX, palette.woodBase, tileSize);

    const center = (pixelsPerTile - 1) / 2;
    const ringSpacing = palette.ringSpacing;
    const ringThreshold = palette.ringThreshold;

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const dx = x - center;
            const dy = y - center;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let col = palette.woodBase;

            if (dist >= center - 1) {
                col = palette.woodBark;
                if (rng.next() > 0.5) col = palette.woodBarkDark;
            } else {
                const ringIndex = dist / ringSpacing;
                if (ringIndex % 1 > ringThreshold) {
                    col = palette.woodRing;
                }
                if (dist < 1.5) {
                    col = palette.woodCenter;
                }
                if (rng.next() > 0.85) {
                    col = col === palette.woodBase ? palette.woodNoise : palette.woodBase;
                }
            }
            fillLogicalPixel(ctx, tileX, x, y, col, step);
        }
    }
}

/**
 * Draw grass top texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawGrassTop(ctx, tileX, pixelsPerTile, step) {
    const grassNoiseCount = (pixelsPerTile * pixelsPerTile) / 4;

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const base = Math.random() > 0.4 ? "#378a32" : "#2c6b2f";
            fillLogicalPixel(ctx, tileX, x, y, base, step);
        }
    }

    for (let i = 0; i < grassNoiseCount; i++) {
        const x = Math.floor(Math.random() * (pixelsPerTile - 1));
        const y = Math.floor(Math.random() * (pixelsPerTile - 1));
        const col = Math.random() > 0.5 ? "#266e2c" : "#4caf50";
        fillLogicalPixel(ctx, tileX, x, y, col, step);
        if (Math.random() > 0.5) {
            if (Math.random() > 0.5) fillLogicalPixel(ctx, tileX, x, y + 1, col, step);
            else fillLogicalPixel(ctx, tileX, x + 1, y, col, step);
        }
    }
}

/**
 * Draw grass side texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawGrassSide(ctx, tileX, pixelsPerTile, step) {
    const grassSideHeight = Math.floor(pixelsPerTile * 0.25);
    const dirtClumpCount = (pixelsPerTile * pixelsPerTile) / 2;
    const dirtHighlightCount = (pixelsPerTile * pixelsPerTile) / 8;
    const dirtGritCount = (pixelsPerTile * pixelsPerTile) / 6;

    // Base pattern
    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            if (y < grassSideHeight) {
                const g = Math.random() > 0.3 ? "#378a32" : "#2c6b2f";
                fillLogicalPixel(ctx, tileX, x, y, g, step);
            } else {
                fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.shadow, step);
            }
        }
    }

    // Dirt clumps
    const sideClumpCount = dirtClumpCount * 0.8;
    for (let i = 0; i < sideClumpCount; i++) {
        const x = Math.floor(Math.random() * (pixelsPerTile - 1));
        const y = grassSideHeight + Math.floor(Math.random() * (pixelsPerTile - grassSideHeight - 1));
        fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.base, step);
        if (Math.random() > 0.4) fillLogicalPixel(ctx, tileX, x + 1, y, DIRT_COLORS.base, step);
        if (Math.random() > 0.4 && y + 1 < pixelsPerTile) fillLogicalPixel(ctx, tileX, x, y + 1, DIRT_COLORS.base, step);
    }

    // Highlights and grit
    const sideHighlightCount = dirtHighlightCount * 0.8;
    for (let i = 0; i < sideHighlightCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = grassSideHeight + Math.floor(Math.random() * (pixelsPerTile - grassSideHeight));
        fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.highlight, step);
    }

    const sideGritCount = dirtGritCount * 0.8;
    for (let i = 0; i < sideGritCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = grassSideHeight + Math.floor(Math.random() * (pixelsPerTile - grassSideHeight));
        fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.grit, step);
    }

    // Grass drips
    const baseDripSeeds = 4;
    const seedCount = Math.max(2, Math.floor((pixelsPerTile / 16) * baseDripSeeds));
    const maxDripLength = Math.max(3, Math.floor(pixelsPerTile / 6));

    for (let s = 0; s < seedCount; s++) {
        let x = Math.floor(Math.random() * pixelsPerTile);
        const dripColor = Math.random() < 0.5 ? "#378a32" : "#2c6b2f";

        const tuftHalfWidth = Math.max(1, Math.floor(pixelsPerTile / 32));
        for (let tx = -tuftHalfWidth; tx <= tuftHalfWidth; tx++) {
            const hx = (x + tx + pixelsPerTile) % pixelsPerTile;
            fillLogicalPixel(ctx, tileX, hx, grassSideHeight, dripColor, step);
            if (grassSideHeight + 1 < pixelsPerTile && Math.random() < 0.5) {
                fillLogicalPixel(ctx, tileX, hx, grassSideHeight + 1, dripColor, step);
            }
        }

        const dripLength = 1 + Math.floor(Math.random() * maxDripLength);
        let curX = x;
        for (let d = 0; d < dripLength; d++) {
            const y = grassSideHeight + d;
            if (y >= pixelsPerTile) break;
            fillLogicalPixel(ctx, tileX, curX, y, dripColor, step);
            if (Math.random() < 0.6) {
                const side = Math.random() < 0.5 ? -1 : 1;
                const nx = (curX + side + pixelsPerTile) % pixelsPerTile;
                fillLogicalPixel(ctx, tileX, nx, y, dripColor, step);
            }
            if (Math.random() < 0.3) {
                curX += Math.random() < 0.5 ? -1 : 1;
                if (curX < 0) curX = pixelsPerTile - 1;
                if (curX >= pixelsPerTile) curX = 0;
            }
            if (d > 1 && Math.random() < 0.25) break;
        }
    }
}

/**
 * Draw dirt texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawDirt(ctx, tileX, pixelsPerTile, step) {
    const dirtClumpCount = (pixelsPerTile * pixelsPerTile) / 2;
    const dirtHighlightCount = (pixelsPerTile * pixelsPerTile) / 8;
    const dirtGritCount = (pixelsPerTile * pixelsPerTile) / 6;

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.shadow, step);
        }
    }

    for (let i = 0; i < dirtClumpCount; i++) {
        const x = Math.floor(Math.random() * (pixelsPerTile - 1));
        const y = Math.floor(Math.random() * (pixelsPerTile - 1));
        fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.base, step);
        if (Math.random() > 0.3) fillLogicalPixel(ctx, tileX, x + 1, y, DIRT_COLORS.base, step);
        if (Math.random() > 0.3) fillLogicalPixel(ctx, tileX, x, y + 1, DIRT_COLORS.base, step);
    }

    for (let i = 0; i < dirtHighlightCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.highlight, step);
    }

    for (let i = 0; i < dirtGritCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        fillLogicalPixel(ctx, tileX, x, y, DIRT_COLORS.grit, step);
    }
}

/**
 * Draw stone texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawStone(ctx, tileX, pixelsPerTile, step) {
    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const rand = Math.random();
            let s = "#9e9e9e";
            if (rand > 0.6) s = "#858585";
            else if (rand > 0.9) s = "#757575";
            fillLogicalPixel(ctx, tileX, x, y, s, step);
        }
    }

    const fleckCount = Math.floor((pixelsPerTile * pixelsPerTile) / 8);
    for (let i = 0; i < fleckCount; i++) {
        const x = Math.floor(Math.random() * (pixelsPerTile - 1));
        const y = Math.floor(Math.random() * (pixelsPerTile - 1));
        const r = Math.random();
        let col = "#6b6a6a";
        if (r > 0.5) col = "#505050";
        if (r > 0.85) col = "#78909c";
        fillLogicalPixel(ctx, tileX, x, y, col, step);
        if (Math.random() > 0.5) {
            fillLogicalPixel(ctx, tileX, x + 1, y, col, step);
        } else if (Math.random() > 0.5) {
            fillLogicalPixel(ctx, tileX, x, y + 1, col, step);
        }
    }
}

/**
 * Draw wood planks texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} tileSize - Tile size in canvas pixels
 * @param {number} step - Pixel step size
 */
function drawPlanks(ctx, tileX, pixelsPerTile, tileSize, step) {
    const noiseDensity = pixelsPerTile * pixelsPerTile * 4;
    const planksPerTile = 4;
    const plankHeight = Math.floor(pixelsPerTile / planksPerTile);
    const gapSize = Math.max(1, Math.floor(pixelsPerTile / 32));

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            fillLogicalPixel(ctx, tileX, x, y, "#C19A6B", step);
        }
    }

    for (let i = 0; i < noiseDensity; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        const col = Math.random() > 0.7 ? "#a17e55" : "#c9a77d";
        fillLogicalPixel(ctx, tileX, x, y, col, step);
    }

    for (let row = plankHeight - gapSize; row < pixelsPerTile; row += plankHeight) {
        for (let g = 0; g < gapSize; g++) {
            for (let x = 0; x < pixelsPerTile; x++) {
                const rand = Math.random();
                let gapColor = "#8B5A2B";
                if (rand > 0.7) gapColor = "#6D4C41";
                else if (rand > 0.9) gapColor = "#5D4037";
                fillLogicalPixel(ctx, tileX, x, row + g, gapColor, step);
            }
        }
    }
}

/**
 * Draw leaves texture with transparency
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} tileSize - Tile size in canvas pixels
 * @param {number} step - Pixel step size
 */
function drawLeaves(ctx, tileX, pixelsPerTile, tileSize, step) {
    // Clear for transparency
    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            ctx.clearRect(tileX + x * step, y * step, step, step);
        }
    }

    const leafDensity = pixelsPerTile * pixelsPerTile * 1.2;
    for (let i = 0; i < leafDensity; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        let col = "#2E7D32";
        const r = Math.random();
        if (r > 0.7) col = "#4CAF50";
        else if (r < 0.4) col = "#1B5E20";
        fillLogicalPixel(ctx, tileX, x, y, col, step);
        if (Math.random() > 0.5) fillLogicalPixel(ctx, tileX, x + 1, y, col, step);
    }

    // Add gaps
    const gapCount = Math.floor(Math.sqrt(pixelsPerTile) * 1.5);
    const maxRadius = Math.max(2, pixelsPerTile / 10);
    for (let i = 0; i < gapCount; i++) {
        const cx = Math.floor(Math.random() * pixelsPerTile);
        const cy = Math.floor(Math.random() * pixelsPerTile);
        const size = 1 + Math.random() * (maxRadius - 1);
        const startX = Math.floor(cx - size);
        const startY = Math.floor(cy - size);
        const endX = Math.floor(cx + size);
        const endY = Math.floor(cy + size);
        for (let y = startY; y <= endY; y++) {
            if (y < 0 || y >= pixelsPerTile) continue;
            for (let x = startX; x <= endX; x++) {
                if (x < 0 || x >= pixelsPerTile) continue;
                const dx = x - cx;
                const dy = y - cy;
                if (dx * dx + dy * dy <= size * size) {
                    if (Math.random() > 0.2) {
                        ctx.clearRect(tileX + x * step, y * step, step, step);
                    }
                }
            }
        }
    }
}

/**
 * Draw bedrock texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawBedrock(ctx, tileX, pixelsPerTile, step) {
    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const r = Math.random();
            let base = "#1a1a1a";
            if (r > 0.8) base = "#555555";
            else if (r > 0.6) base = "#2b2b2b";
            fillLogicalPixel(ctx, tileX, x, y, base, step);
        }
    }

    const rockCount = (pixelsPerTile * pixelsPerTile) / 5;
    for (let i = 0; i < rockCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        const isLight = Math.random() > 0.5;
        const col = isLight ? "#777777" : "#000000";
        fillLogicalPixel(ctx, tileX, x, y, col, step);
        if (Math.random() > 0.5) {
            const dx = Math.random() > 0.5 ? 1 : -1;
            const dy = Math.random() > 0.5 ? 1 : -1;
            fillLogicalPixel(ctx, tileX, x + dx, y + dy, col, step);
        }
    }

    const staticCount = (pixelsPerTile * pixelsPerTile) / 16;
    for (let i = 0; i < staticCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        fillLogicalPixel(ctx, tileX, x, y, "#999999", step);
    }
}

/**
 * Draw sand texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawSand(ctx, tileX, pixelsPerTile, step) {
    const sandGrainCount = (pixelsPerTile * pixelsPerTile) / 3;

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const isTop = y < pixelsPerTile / 2;
            const base = isTop ? "#E6D6AC" : "#DECFA3";
            fillLogicalPixel(ctx, tileX, x, y, base, step);
        }
    }

    for (let i = 0; i < sandGrainCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        let col = "#D4C08E";
        const r = Math.random();
        if (r > 0.8) col = "#F2E6C9";
        else if (r > 0.6) col = "#C2B280";
        fillLogicalPixel(ctx, tileX, x, y, col, step);
    }

    const waveCount = Math.max(2, Math.floor(pixelsPerTile / 8));
    for (let w = 0; w < waveCount; w++) {
        const waveY = 2 + Math.floor(Math.random() * (pixelsPerTile - 4));
        for (let x = 0; x < pixelsPerTile; x++) {
            if (Math.random() > 0.7) {
                fillLogicalPixel(ctx, tileX, x, waveY, "#D1C296", step);
            }
        }
    }
}

/**
 * Draw water texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawWater(ctx, tileX, pixelsPerTile, step) {
    const rippleCount = Math.floor(pixelsPerTile / 2);

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const col = y < pixelsPerTile / 2 ? "#2389DA" : "#1B609E";
            fillLogicalPixel(ctx, tileX, x, y, col, step);
        }
    }

    for (let i = 0; i < rippleCount; i++) {
        const y = Math.floor(Math.random() * pixelsPerTile);
        const len = Math.floor(pixelsPerTile * 0.2 + Math.random() * (pixelsPerTile * 0.3));
        const startX = Math.floor(Math.random() * pixelsPerTile);
        for (let k = 0; k < len; k++) {
            const x = (startX + k) % pixelsPerTile;
            fillLogicalPixel(ctx, tileX, x, y, "#4FC3F7", step);
            if (y + 1 < pixelsPerTile) {
                fillLogicalPixel(ctx, tileX, x, y + 1, "#1565C0", step);
            }
        }
    }

    const sparkleCount = Math.floor(pixelsPerTile / 4);
    for (let i = 0; i < sparkleCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        fillLogicalPixel(ctx, tileX, x, y, "#E1F5FE", step);
    }
}

/**
 * Draw torch texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawTorch(ctx, tileX, pixelsPerTile, step) {
    // Gray background
    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            fillLogicalPixel(ctx, tileX, x, y, "#808080", step);
        }
    }

    const centerX = Math.floor(pixelsPerTile / 2);
    const torchWidth = Math.max(2, Math.floor(pixelsPerTile / 8));
    const torchHandleHeight = Math.floor(pixelsPerTile * 0.6);
    const flameHeight = Math.floor(pixelsPerTile * 0.35);

    // Torch handle
    for (let y = pixelsPerTile - torchHandleHeight; y < pixelsPerTile; y++) {
        for (let x = centerX - Math.floor(torchWidth / 2); x <= centerX + Math.floor(torchWidth / 2); x++) {
            fillLogicalPixel(ctx, tileX, x, y, "#8b4513", step);
        }
    }

    // Flame
    const flameStartY = pixelsPerTile - torchHandleHeight - flameHeight;
    for (let y = flameStartY; y < pixelsPerTile - torchHandleHeight; y++) {
        for (let x = centerX - Math.floor(torchWidth / 2); x <= centerX + Math.floor(torchWidth / 2); x++) {
            const flameProgress = (y - flameStartY) / flameHeight;
            const color = flameProgress < 0.5 ? "#ffeb3b" : "#ff9800";
            fillLogicalPixel(ctx, tileX, x, y, color, step);
        }
    }
}

/**
 * Draw snow texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawSnow(ctx, tileX, pixelsPerTile, step) {
    const snowBaseColors = ["#FAFAFA", "#F5F5F5", "#EEEEEE"];
    const snowShadowColors = ["#E0E0E0", "#D6E6F2", "#CFE2F3"];
    const snowSparkleCount = Math.floor((pixelsPerTile * pixelsPerTile) / 6);

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const baseCol = snowBaseColors[Math.floor(Math.random() * snowBaseColors.length)];
            fillLogicalPixel(ctx, tileX, x, y, baseCol, step);
        }
    }

    const snowShadowCount = Math.floor((pixelsPerTile * pixelsPerTile) / 4);
    for (let i = 0; i < snowShadowCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        const shadowCol = snowShadowColors[Math.floor(Math.random() * snowShadowColors.length)];
        fillLogicalPixel(ctx, tileX, x, y, shadowCol, step);
    }

    for (let i = 0; i < snowSparkleCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        fillLogicalPixel(ctx, tileX, x, y, "#FFFFFF", step);
    }
}

/**
 * Draw gravel texture
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} step - Pixel step size
 */
function drawGravel(ctx, tileX, pixelsPerTile, step) {
    const gravelBaseColors = ["#6B6B6B", "#787878", "#5C5C5C"];
    const gravelAccentColors = ["#8B8B8B", "#4A4A4A", "#9E9E9E", "#707070"];
    const gravelPebbleCount = Math.floor((pixelsPerTile * pixelsPerTile) / 3);

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            const baseCol = gravelBaseColors[Math.floor(Math.random() * gravelBaseColors.length)];
            fillLogicalPixel(ctx, tileX, x, y, baseCol, step);
        }
    }

    for (let i = 0; i < gravelPebbleCount; i++) {
        const x = Math.floor(Math.random() * (pixelsPerTile - 1));
        const y = Math.floor(Math.random() * (pixelsPerTile - 1));
        const accentCol = gravelAccentColors[Math.floor(Math.random() * gravelAccentColors.length)];
        fillLogicalPixel(ctx, tileX, x, y, accentCol, step);
        if (Math.random() > 0.5) {
            if (Math.random() > 0.5) fillLogicalPixel(ctx, tileX, x + 1, y, accentCol, step);
            else fillLogicalPixel(ctx, tileX, x, y + 1, accentCol, step);
        }
    }

    const gravelDarkCount = Math.floor((pixelsPerTile * pixelsPerTile) / 8);
    for (let i = 0; i < gravelDarkCount; i++) {
        const x = Math.floor(Math.random() * pixelsPerTile);
        const y = Math.floor(Math.random() * pixelsPerTile);
        fillLogicalPixel(ctx, tileX, x, y, "#3D3D3D", step);
    }
}

/**
 * Draw longwood leaves texture - dark green sparse with holes
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} tileX - Tile X offset
 * @param {number} pixelsPerTile - Logical pixels per tile
 * @param {number} tileSize - Tile size in canvas pixels
 * @param {number} step - Pixel step size
 */
function drawLongwoodLeaves(ctx, tileX, pixelsPerTile, tileSize, step) {
    const leafRng = new SeededRNG(12345 + TILE.LONGWOOD_LEAF);
    const darkGreen = "#1B4F1B";
    const midGreen = "#2A6A2A";
    const lightGreen = "#3A7A3A";
    const veryDark = "#0F3F0F";

    // Clear for transparency
    ctx.clearRect(tileX, 0, tileSize, tileSize);

    for (let y = 0; y < pixelsPerTile; y++) {
        for (let x = 0; x < pixelsPerTile; x++) {
            // Skip ~35% for holes
            if (leafRng.next() < 0.35) continue;

            const r = leafRng.next();
            let col;
            if (r < 0.35) col = darkGreen;
            else if (r < 0.65) col = midGreen;
            else if (r < 0.85) col = lightGreen;
            else col = veryDark;
            fillLogicalPixel(ctx, tileX, x, y, col, step);
        }
    }
}

// =====================================================
// Main Atlas Creation
// =====================================================

/**
 * Generate the complete block texture atlas
 * @param {number} [textureResolution=16] - Logical pixels per tile (16, 32, or 64)
 * @returns {{texture: THREE.CanvasTexture, canvas: HTMLCanvasElement}}
 */
export function createTextureAtlas(textureResolution = 16) {
    const pixelsPerTile = textureResolution;
    const tileSize = pixelsPerTile * 4;

    const canvas = document.createElement("canvas");
    canvas.width = NUM_TILES * tileSize;
    canvas.height = tileSize;

    const ctx = canvas.getContext("2d");

    // Fill with opaque black base
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const step = tileSize / pixelsPerTile;
    let tileX = 0;

    // Tile 0: Grass Top
    drawGrassTop(ctx, tileX, pixelsPerTile, step);

    // Tile 1: Grass Side
    tileX += tileSize;
    drawGrassSide(ctx, tileX, pixelsPerTile, step);

    // Tile 2: Dirt
    tileX += tileSize;
    drawDirt(ctx, tileX, pixelsPerTile, step);

    // Tile 3: Stone
    tileX += tileSize;
    drawStone(ctx, tileX, pixelsPerTile, step);

    // Tile 4: Wood Planks
    tileX += tileSize;
    drawPlanks(ctx, tileX, pixelsPerTile, tileSize, step);

    // Tile 5: Log Side (Oak)
    tileX += tileSize;
    beginTile(ctx, tileX, "#5D4037", tileSize);
    const oakSideRng = new SeededRNG(12345 + TILE.LOG_SIDE);
    drawLogSide(ctx, tileX, OAK_PALETTE, oakSideRng, pixelsPerTile, tileSize, step);

    // Tile 6: Leaves
    tileX += tileSize;
    drawLeaves(ctx, tileX, pixelsPerTile, tileSize, step);

    // Tile 7: Bedrock
    tileX += tileSize;
    drawBedrock(ctx, tileX, pixelsPerTile, step);

    // Tile 8: Log Top (Oak)
    tileX += tileSize;
    const oakTopRng = new SeededRNG(12345 + TILE.LOG_TOP);
    drawLogTop(ctx, tileX, OAK_PALETTE, oakTopRng, pixelsPerTile, tileSize, step);

    // Tile 9: Sand
    tileX += tileSize;
    drawSand(ctx, tileX, pixelsPerTile, step);

    // Tile 10: Water
    tileX += tileSize;
    drawWater(ctx, tileX, pixelsPerTile, step);

    // Tile 11: Torch
    tileX += tileSize;
    drawTorch(ctx, tileX, pixelsPerTile, step);

    // Tile 12: Snow
    tileX += tileSize;
    drawSnow(ctx, tileX, pixelsPerTile, step);

    // Tile 13: Gravel
    tileX += tileSize;
    drawGravel(ctx, tileX, pixelsPerTile, step);

    // Tile 14: Longwood Log Side
    tileX += tileSize;
    const longwoodSideRng = new SeededRNG(12345 + TILE.LONGWOOD_LOG_SIDE);
    drawLogSide(ctx, tileX, LONGWOOD_PALETTE, longwoodSideRng, pixelsPerTile, tileSize, step);

    // Tile 15: Longwood Log Top
    tileX += tileSize;
    const longwoodTopRng = new SeededRNG(12345 + TILE.LONGWOOD_LOG_TOP);
    drawLogTop(ctx, tileX, LONGWOOD_PALETTE, longwoodTopRng, pixelsPerTile, tileSize, step);

    // Tile 16: Longwood Leaves
    tileX += tileSize;
    drawLongwoodLeaves(ctx, tileX, pixelsPerTile, tileSize, step);

    // Create Three.js texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;

    return { texture, canvas };
}

/**
 * Create a roughness map for the texture atlas
 * @param {number} tileSize - Size of each tile
 * @returns {THREE.CanvasTexture}
 */
export function createRoughnessMap(tileSize = 64) {
    const canvas = document.createElement("canvas");
    canvas.width = NUM_TILES * tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext("2d");

    // All terrain is fully matte (roughness 255)
    const tileRoughness = new Array(NUM_TILES).fill(255);

    for (let i = 0; i < NUM_TILES; i++) {
        const roughness = tileRoughness[i];
        ctx.fillStyle = `rgb(${roughness}, ${roughness}, ${roughness})`;
        ctx.fillRect(i * tileSize, 0, tileSize, tileSize);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;

    return texture;
}

export { SeededRNG, OAK_PALETTE, LONGWOOD_PALETTE, DIRT_COLORS };
export default createTextureAtlas;

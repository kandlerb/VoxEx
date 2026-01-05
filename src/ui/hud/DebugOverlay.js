/**
 * Debug information overlay
 * @module ui/hud/DebugOverlay
 */

/**
 * Create debug overlay
 * @returns {HTMLElement}
 */
export function createDebugOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'debug-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: #0f0;
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        border-radius: 4px;
        z-index: 200;
        display: none;
        min-width: 200px;
    `;

    return overlay;
}

/**
 * @typedef {Object} DebugInfo
 * @property {number} fps
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} chunkX
 * @property {number} chunkZ
 * @property {string} biome
 * @property {number} loadedChunks
 * @property {number} totalFaces
 * @property {number} drawCalls
 * @property {string} seed
 */

/**
 * Update debug overlay content
 * @param {HTMLElement} overlay
 * @param {DebugInfo} info
 */
export function updateDebugOverlay(overlay, info) {
    // Guard against null/undefined info
    if (!info) return;

    // Safely convert values to numbers with fallbacks
    const fps = Number(info.fps ?? 0);
    const x = Number(info.x ?? 0);
    const y = Number(info.y ?? 0);
    const z = Number(info.z ?? 0);
    const chunkX = Number(info.chunkX ?? 0);
    const chunkZ = Number(info.chunkZ ?? 0);
    const loadedChunks = Number(info.loadedChunks ?? 0);
    const totalFaces = Number(info.totalFaces ?? 0);
    const drawCalls = Number(info.drawCalls ?? 0);

    overlay.innerHTML = `
        <div>FPS: ${fps.toFixed(0)}</div>
        <div>Pos: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}</div>
        <div>Chunk: ${chunkX}, ${chunkZ}</div>
        <div>Biome: ${info.biome ?? 'unknown'}</div>
        <div>Loaded Chunks: ${loadedChunks}</div>
        <div>Faces: ${totalFaces.toLocaleString()}</div>
        <div>Draw Calls: ${drawCalls}</div>
        <div>Seed: ${info.seed ?? ''}</div>
    `;
}

/**
 * Toggle debug overlay visibility
 * @param {HTMLElement} overlay
 * @returns {boolean} New visibility state
 */
export function toggleDebugOverlay(overlay) {
    const isVisible = overlay.style.display !== 'none';
    overlay.style.display = isVisible ? 'none' : 'block';
    return !isVisible;
}

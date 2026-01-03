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
    overlay.innerHTML = `
        <div>FPS: ${info.fps.toFixed(0)}</div>
        <div>Pos: ${info.x.toFixed(1)}, ${info.y.toFixed(1)}, ${info.z.toFixed(1)}</div>
        <div>Chunk: ${info.chunkX}, ${info.chunkZ}</div>
        <div>Biome: ${info.biome}</div>
        <div>Loaded Chunks: ${info.loadedChunks}</div>
        <div>Faces: ${info.totalFaces.toLocaleString()}</div>
        <div>Draw Calls: ${info.drawCalls}</div>
        <div>Seed: ${info.seed}</div>
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

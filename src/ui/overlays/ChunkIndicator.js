/**
 * Chunk loading indicator
 * @module ui/overlays/ChunkIndicator
 */

/**
 * Create chunk loading indicator
 * @returns {HTMLElement}
 */
export function createChunkIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'chunk-indicator';
    indicator.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 12px;
        display: none;
        z-index: 100;
    `;

    const label = document.createElement('span');
    label.textContent = 'Loading chunks: ';
    indicator.appendChild(label);

    const count = document.createElement('span');
    count.id = 'chunk-count';
    count.textContent = '0';
    indicator.appendChild(count);

    return indicator;
}

/**
 * Update chunk loading count
 * @param {HTMLElement} indicator
 * @param {number} count - Chunks currently loading
 */
export function updateChunkIndicator(indicator, count) {
    const countEl = indicator.querySelector('#chunk-count');
    if (countEl) {
        countEl.textContent = String(count);
    }
    indicator.style.display = count > 0 ? 'block' : 'none';
}

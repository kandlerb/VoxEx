/**
 * Crosshair display
 * @module ui/hud/Crosshair
 */

/**
 * Create crosshair element
 * @returns {HTMLElement}
 */
export function createCrosshair() {
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    crosshair.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 20px;
        height: 20px;
        pointer-events: none;
        z-index: 100;
    `;

    // Horizontal line
    const hLine = document.createElement('div');
    hLine.style.cssText = `
        position: absolute;
        top: 50%;
        left: 0;
        width: 100%;
        height: 2px;
        background: white;
        transform: translateY(-50%);
    `;

    // Vertical line
    const vLine = document.createElement('div');
    vLine.style.cssText = `
        position: absolute;
        left: 50%;
        top: 0;
        width: 2px;
        height: 100%;
        background: white;
        transform: translateX(-50%);
    `;

    crosshair.appendChild(hLine);
    crosshair.appendChild(vLine);

    return crosshair;
}

/**
 * Show/hide crosshair
 * @param {HTMLElement} crosshair
 * @param {boolean} visible
 */
export function setCrosshairVisible(crosshair, visible) {
    crosshair.style.display = visible ? 'block' : 'none';
}

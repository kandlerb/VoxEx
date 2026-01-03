/**
 * Status indicator badges (sprint, crouch, flight)
 * @module ui/hud/StatusIndicators
 */

/**
 * Create status indicators container
 * @returns {HTMLElement}
 */
export function createStatusIndicators() {
    const container = document.createElement('div');
    container.id = 'status-indicators';
    container.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 100;
    `;

    // Create individual indicators
    container.appendChild(createIndicator('sprint', 'Sprint', '#4CAF50'));
    container.appendChild(createIndicator('crouch', 'Crouch', '#FF9800'));
    container.appendChild(createIndicator('flight', 'Flying', '#2196F3'));

    return container;
}

/**
 * Create a single indicator badge
 * @param {string} id
 * @param {string} text
 * @param {string} color
 * @returns {HTMLElement}
 */
function createIndicator(id, text, color) {
    const indicator = document.createElement('div');
    indicator.id = `indicator-${id}`;
    indicator.textContent = text;
    indicator.style.cssText = `
        background: ${color};
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: bold;
        display: none;
    `;
    return indicator;
}

/**
 * Update indicator visibility
 * @param {HTMLElement} container
 * @param {'sprint'|'crouch'|'flight'} type
 * @param {boolean} visible
 */
export function setIndicatorVisible(container, type, visible) {
    const indicator = container.querySelector(`#indicator-${type}`);
    if (indicator) {
        /** @type {HTMLElement} */
        const indicatorEl = /** @type {HTMLElement} */ (indicator);
        indicatorEl.style.display = visible ? 'block' : 'none';
    }
}

/**
 * Update all indicators based on player state
 * @param {HTMLElement} container
 * @param {Object} state
 * @param {boolean} state.isSprinting
 * @param {boolean} state.isCrouching
 * @param {boolean} state.isFlying
 */
export function updateIndicators(container, state) {
    setIndicatorVisible(container, 'sprint', state.isSprinting);
    setIndicatorVisible(container, 'crouch', state.isCrouching);
    setIndicatorVisible(container, 'flight', state.isFlying);
}

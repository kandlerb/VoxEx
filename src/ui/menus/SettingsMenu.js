/**
 * Settings menu with tabs
 * @module ui/menus/SettingsMenu
 */

import { DEFAULTS } from '../../config/Settings.js';

/**
 * Create settings menu
 * @param {Object} currentSettings
 * @param {Function} onSettingChange
 * @param {Function} onClose
 * @returns {HTMLElement}
 */
export function createSettingsMenu(currentSettings, onSettingChange, onClose) {
    const menu = document.createElement('div');
    menu.id = 'settings-menu';
    menu.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.9);
        display: none;
        flex-direction: column;
        align-items: center;
        padding: 40px;
        z-index: 950;
        overflow-y: auto;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        max-width: 800px;
        margin-bottom: 20px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Settings';
    title.style.color = 'white';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
    `;
    closeBtn.addEventListener('click', onClose);
    header.appendChild(closeBtn);

    menu.appendChild(header);

    // Tabs
    const tabs = ['Performance', 'Graphics', 'Gameplay', 'Controls'];
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = `
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
    `;

    tabs.forEach((tab, index) => {
        const tabBtn = document.createElement('button');
        tabBtn.textContent = tab;
        tabBtn.dataset.tab = tab.toLowerCase();
        tabBtn.style.cssText = `
            padding: 8px 24px;
            background: ${index === 0 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
            border: none;
            color: white;
            cursor: pointer;
            border-radius: 4px;
        `;
        tabBtn.addEventListener('click', () => switchTab(menu, tab.toLowerCase()));
        tabContainer.appendChild(tabBtn);
    });
    menu.appendChild(tabContainer);

    // Content panels
    const content = document.createElement('div');
    content.id = 'settings-content';
    content.style.cssText = `
        width: 100%;
        max-width: 800px;
    `;

    // Add tab content
    content.appendChild(createPerformanceTab(currentSettings, onSettingChange));
    content.appendChild(createGraphicsTab(currentSettings, onSettingChange));
    content.appendChild(createGameplayTab(currentSettings, onSettingChange));
    content.appendChild(createControlsTab(currentSettings, onSettingChange));

    menu.appendChild(content);

    return menu;
}

/**
 * Switch active tab
 * @param {HTMLElement} menu
 * @param {string} tabName
 */
function switchTab(menu, tabName) {
    const panels = menu.querySelectorAll('.settings-panel');
    panels.forEach(panel => {
        /** @type {HTMLElement} */
        const panelEl = /** @type {HTMLElement} */ (panel);
        panelEl.style.display = panelEl.dataset.tab === tabName ? 'block' : 'none';
    });

    // Update tab button styles
    const tabButtons = menu.querySelectorAll('[data-tab]');
    tabButtons.forEach(btn => {
        /** @type {HTMLElement} */
        const btnEl = /** @type {HTMLElement} */ (btn);
        if (btnEl.classList.contains('settings-panel')) return;
        btnEl.style.background = btnEl.dataset.tab === tabName
            ? 'rgba(255, 255, 255, 0.2)'
            : 'rgba(255, 255, 255, 0.1)';
    });
}

/**
 * Create a settings slider
 * @param {string} label
 * @param {string} key
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
export function createSlider(label, key, value, min, max, step, onChange) {
    const container = document.createElement('div');
    container.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
    `;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.color = 'white';
    container.appendChild(labelEl);

    const sliderWrapper = document.createElement('div');
    sliderWrapper.style.cssText = `display: flex; align-items: center; gap: 8px;`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.width = '150px';

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = String(value);
    valueDisplay.style.cssText = `color: white; min-width: 40px;`;

    slider.addEventListener('input', () => {
        valueDisplay.textContent = slider.value;
        onChange(key, parseFloat(slider.value));
    });

    sliderWrapper.appendChild(slider);
    sliderWrapper.appendChild(valueDisplay);
    container.appendChild(sliderWrapper);

    return container;
}

/**
 * Create a settings checkbox
 * @param {string} label
 * @param {string} key
 * @param {boolean} value
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
export function createCheckbox(label, key, value, onChange) {
    const container = document.createElement('div');
    container.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
    `;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.color = 'white';
    container.appendChild(labelEl);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = value;
    checkbox.style.cssText = `width: 20px; height: 20px; cursor: pointer;`;
    checkbox.addEventListener('change', () => onChange(key, checkbox.checked));
    container.appendChild(checkbox);

    return container;
}

/**
 * Create performance tab
 * @param {Object} settings
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
function createPerformanceTab(settings, onChange) {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.dataset.tab = 'performance';

    panel.appendChild(createSlider('Render Distance', 'renderDistance', settings.renderDistance ?? DEFAULTS.renderDistance, 2, 24, 1, onChange));
    panel.appendChild(createSlider('Max Cached Chunks', 'maxCachedChunks', settings.maxCachedChunks ?? DEFAULTS.maxCachedChunks, 100, 2000, 50, onChange));
    panel.appendChild(createCheckbox('Dynamic Render Distance', 'dynamicRenderDistance', settings.dynamicRenderDistance ?? DEFAULTS.dynamicRenderDistance, onChange));
    panel.appendChild(createCheckbox('Frustum Culling', 'enableFrustumCulling', settings.enableFrustumCulling ?? DEFAULTS.enableFrustumCulling, onChange));

    return panel;
}

/**
 * Create graphics tab
 * @param {Object} settings
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
function createGraphicsTab(settings, onChange) {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.dataset.tab = 'graphics';
    panel.style.display = 'none';

    panel.appendChild(createSlider('FOV', 'normalFOV', settings.normalFOV ?? DEFAULTS.normalFOV, 60, 110, 5, onChange));
    panel.appendChild(createCheckbox('Ambient Occlusion', 'AO', settings.AO ?? DEFAULTS.AO, onChange));
    panel.appendChild(createCheckbox('Shadows', 'shadows', settings.shadows ?? DEFAULTS.shadows, onChange));
    panel.appendChild(createCheckbox('Volumetric Lighting', 'volumetricLightingEnabled', settings.volumetricLightingEnabled ?? DEFAULTS.volumetricLightingEnabled, onChange));

    return panel;
}

/**
 * Create gameplay tab
 * @param {Object} settings
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
function createGameplayTab(settings, onChange) {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.dataset.tab = 'gameplay';
    panel.style.display = 'none';

    panel.appendChild(createSlider('Player Speed', 'playerSpeed', settings.playerSpeed ?? DEFAULTS.playerSpeed, 10, 100, 5, onChange));
    panel.appendChild(createSlider('Jump Force', 'jumpForce', settings.jumpForce ?? DEFAULTS.jumpForce, 5, 20, 1, onChange));
    panel.appendChild(createSlider('Block Reach', 'blockReach', settings.blockReach ?? DEFAULTS.blockReach, 4, 16, 1, onChange));

    return panel;
}

/**
 * Create controls tab
 * @param {Object} settings
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
function createControlsTab(settings, onChange) {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.dataset.tab = 'controls';
    panel.style.display = 'none';

    const info = document.createElement('p');
    info.textContent = 'Key bindings can be customized here.';
    info.style.color = '#888';
    panel.appendChild(info);

    // Basic control info display
    const controlsList = document.createElement('div');
    controlsList.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 16px;
    `;

    const controls = [
        ['W/A/S/D', 'Move'],
        ['Space', 'Jump / Fly Up'],
        ['Shift', 'Sprint'],
        ['C', 'Crouch / Fly Down'],
        ['F', 'Toggle Torch'],
        ['E', 'Inventory'],
        ['1-9', 'Select Hotbar'],
        ['~', 'Debug Overlay'],
    ];

    controls.forEach(([key, action]) => {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            justify-content: space-between;
            padding: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        `;
        const keyEl = document.createElement('span');
        keyEl.textContent = key;
        keyEl.style.cssText = `color: #ff6b35; font-weight: bold;`;
        const actionEl = document.createElement('span');
        actionEl.textContent = action;
        actionEl.style.color = 'white';
        row.appendChild(keyEl);
        row.appendChild(actionEl);
        controlsList.appendChild(row);
    });

    panel.appendChild(controlsList);

    return panel;
}

/**
 * Show/hide settings menu
 * @param {HTMLElement} menu
 * @param {boolean} visible
 */
export function setSettingsMenuVisible(menu, visible) {
    menu.style.display = visible ? 'flex' : 'none';
    if (visible) {
        switchTab(menu, 'performance'); // Default to first tab
    }
}

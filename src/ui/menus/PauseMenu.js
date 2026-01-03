/**
 * Pause menu (ESC)
 * @module ui/menus/PauseMenu
 */

import { createMenuButton } from './MainMenu.js';

/**
 * Create pause menu
 * @param {Object} callbacks
 * @param {Function} callbacks.onResume
 * @param {Function} callbacks.onSave
 * @param {Function} callbacks.onLoad
 * @param {Function} callbacks.onSettings
 * @param {Function} callbacks.onQuit
 * @returns {HTMLElement}
 */
export function createPauseMenu(callbacks) {
    const menu = document.createElement('div');
    menu.id = 'pause-menu';
    menu.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 900;
    `;

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Game Paused';
    title.style.cssText = `
        font-size: 36px;
        color: white;
        margin-bottom: 30px;
    `;
    menu.appendChild(title);

    // Buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
    `;

    buttonContainer.appendChild(createMenuButton('Resume', callbacks.onResume));
    buttonContainer.appendChild(createMenuButton('Save World', callbacks.onSave));
    buttonContainer.appendChild(createMenuButton('Load World', callbacks.onLoad));
    buttonContainer.appendChild(createMenuButton('Settings', callbacks.onSettings));
    buttonContainer.appendChild(createMenuButton('Quit to Menu', callbacks.onQuit));

    menu.appendChild(buttonContainer);

    return menu;
}

/**
 * Show/hide pause menu
 * @param {HTMLElement} menu
 * @param {boolean} visible
 */
export function setPauseMenuVisible(menu, visible) {
    menu.style.display = visible ? 'flex' : 'none';
}

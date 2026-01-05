/**
 * Pause menu (ESC)
 * @module ui/menus/PauseMenu
 */

import { createMenuButton } from './MainMenu.js';

/**
 * Create pause menu
 * @param {Object} callbacks
 * @param {Function} callbacks.onResume
 * @param {(name?: string) => void} callbacks.onSave
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

    // Save row
    const saveRow = document.createElement('div');
    saveRow.style.cssText = `
        display: flex;
        gap: 10px;
        width: 320px;
        margin-bottom: 20px;
    `;

    const saveInput = document.createElement('input');
    saveInput.type = 'text';
    saveInput.id = 'pause-save-name';
    saveInput.placeholder = 'Save name...';
    saveInput.style.cssText = `
        flex: 1;
        padding: 10px 12px;
        background: #222;
        border: 1px solid #555;
        border-radius: 6px;
        color: #fff;
        font-size: 14px;
    `;

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.style.cssText = `
        padding: 10px 16px;
        background: #4caf50;
        border: 1px solid #4caf50;
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        transition: all 0.2s;
    `;
    saveButton.addEventListener('mouseenter', () => {
        saveButton.style.background = '#5cbf60';
        saveButton.style.borderColor = '#5cbf60';
    });
    saveButton.addEventListener('mouseleave', () => {
        saveButton.style.background = '#4caf50';
        saveButton.style.borderColor = '#4caf50';
    });
    saveButton.addEventListener('click', () => callbacks.onSave(saveInput.value));

    saveRow.appendChild(saveInput);
    saveRow.appendChild(saveButton);
    menu.appendChild(saveRow);

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

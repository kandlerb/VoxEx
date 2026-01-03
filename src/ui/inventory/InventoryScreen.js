/**
 * Block inventory screen (E key)
 * @module ui/inventory/InventoryScreen
 */

import { BLOCK_CONFIG } from '../../config/BlockConfig.js';
import { AIR } from '../../core/constants.js';

/**
 * Create inventory screen
 * @param {Function} onBlockSelect - Called when block is selected
 * @param {Function} onClose - Called when inventory is closed
 * @returns {HTMLElement}
 */
export function createInventoryScreen(onBlockSelect, onClose) {
    const screen = document.createElement('div');
    screen.id = 'inventory-screen';
    screen.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 800;
    `;

    // Close on background click
    screen.addEventListener('click', (e) => {
        if (e.target === screen) onClose();
    });

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Inventory';
    title.style.cssText = `
        color: #4caf50;
        font-size: 24px;
        font-weight: 600;
        text-shadow: 2px 2px 0 #000;
        margin-bottom: 20px;
    `;
    screen.appendChild(title);

    // Block grid
    const grid = document.createElement('div');
    grid.className = 'inventory-grid';
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(8, 64px);
        gap: 8px;
        background: rgba(0, 0, 0, 0.5);
        padding: 16px;
        border-radius: 8px;
    `;

    // Add blocks (skip AIR)
    BLOCK_CONFIG.forEach((block, index) => {
        if (index === AIR) return;
        if (!block.ui?.showInInventory) return;

        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.dataset.blockId = String(index);
        slot.style.cssText = `
            width: 64px;
            height: 64px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        `;

        // Block name
        const name = document.createElement('span');
        name.textContent = block.name || `Block ${index}`;
        name.style.cssText = `
            color: white;
            font-size: 10px;
            text-align: center;
            margin-top: 4px;
        `;
        slot.appendChild(name);

        // Hover effect
        slot.addEventListener('mouseenter', () => {
            slot.style.borderColor = '#4caf50';
            slot.style.background = 'rgba(76, 175, 80, 0.2)';
            slot.style.transform = 'scale(1.08)';
        });
        slot.addEventListener('mouseleave', () => {
            slot.style.borderColor = 'transparent';
            slot.style.background = 'rgba(255, 255, 255, 0.1)';
            slot.style.transform = 'scale(1)';
        });

        // Click to select
        slot.addEventListener('click', () => {
            onBlockSelect(index);
            onClose();
        });

        grid.appendChild(slot);
    });

    screen.appendChild(grid);

    // Close hint
    const hint = document.createElement('p');
    hint.textContent = 'Press E or click outside to close';
    hint.style.cssText = `
        color: #888;
        margin-top: 16px;
    `;
    screen.appendChild(hint);

    return screen;
}

/**
 * Show/hide inventory
 * @param {HTMLElement} screen
 * @param {boolean} visible
 */
export function setInventoryVisible(screen, visible) {
    screen.style.display = visible ? 'flex' : 'none';
}

/**
 * Update inventory slot icons with texture canvas
 * @param {HTMLElement} screen
 * @param {HTMLCanvasElement} atlasCanvas
 * @param {number} tileSize
 */
export function updateInventoryIcons(screen, atlasCanvas, tileSize) {
    const slots = screen.querySelectorAll('.inventory-slot');
    slots.forEach(slot => {
        const blockId = parseInt(slot.dataset.blockId ?? '0', 10);
        const block = BLOCK_CONFIG[blockId];
        if (!block || !block.ui?.tileIndex) return;

        // Remove existing icon
        const existingIcon = slot.querySelector('.block-icon');
        if (existingIcon) existingIcon.remove();

        // Create icon from atlas tile
        const tileIndex = block.ui.tileIndex;
        const iconCanvas = document.createElement('canvas');
        iconCanvas.width = tileSize;
        iconCanvas.height = tileSize;
        const ctx = iconCanvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(
                atlasCanvas,
                tileIndex * tileSize, 0, tileSize, tileSize,
                0, 0, tileSize, tileSize
            );
        }

        const icon = document.createElement('img');
        icon.className = 'block-icon';
        icon.src = iconCanvas.toDataURL();
        icon.style.cssText = `
            width: 32px;
            height: 32px;
            image-rendering: pixelated;
        `;
        slot.insertBefore(icon, slot.firstChild);
    });
}

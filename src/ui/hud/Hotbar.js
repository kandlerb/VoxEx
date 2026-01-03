/**
 * Block selection hotbar
 * @module ui/hud/Hotbar
 */

/**
 * Create hotbar UI
 * @param {number} [slotCount=9] - Number of slots
 * @returns {HTMLElement}
 */
export function createHotbar(slotCount = 9) {
    const hotbar = document.createElement('div');
    hotbar.id = 'hotbar';
    hotbar.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 4px;
        background: rgba(0, 0, 0, 0.5);
        padding: 8px;
        border-radius: 4px;
        z-index: 100;
    `;

    for (let i = 0; i < slotCount; i++) {
        const slot = createSlot(i);
        hotbar.appendChild(slot);
    }

    return hotbar;
}

/**
 * Create a single hotbar slot
 * @param {number} index
 * @returns {HTMLElement}
 */
function createSlot(index) {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot';
    slot.dataset.index = String(index);
    slot.style.cssText = `
        width: 48px;
        height: 48px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid #555;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    `;

    // Slot number
    const number = document.createElement('span');
    number.textContent = String((index + 1) % 10);
    number.style.cssText = `
        position: absolute;
        top: 2px;
        left: 4px;
        font-size: 10px;
        color: #aaa;
    `;
    slot.appendChild(number);

    return slot;
}

/**
 * Update hotbar selection
 * @param {HTMLElement} hotbar
 * @param {number} selectedIndex
 */
export function setHotbarSelection(hotbar, selectedIndex) {
    const slots = hotbar.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, i) => {
        /** @type {HTMLElement} */
        const slotEl = /** @type {HTMLElement} */ (slot);
        slotEl.style.borderColor = i === selectedIndex ? '#fff' : '#555';
    });
}

/**
 * Update slot content
 * @param {HTMLElement} hotbar
 * @param {number} slotIndex
 * @param {number} blockId
 * @param {HTMLCanvasElement} [iconCanvas] - Block icon canvas
 */
export function setSlotContent(hotbar, slotIndex, blockId, iconCanvas) {
    const slot = hotbar.children[slotIndex];
    if (!slot) return;

    // Remove existing icon
    const existingIcon = slot.querySelector('.block-icon');
    if (existingIcon) existingIcon.remove();

    // Add new icon if blockId > 0
    if (blockId > 0 && iconCanvas) {
        const icon = document.createElement('img');
        icon.className = 'block-icon';
        icon.src = iconCanvas.toDataURL();
        icon.style.cssText = `
            width: 32px;
            height: 32px;
            image-rendering: pixelated;
        `;
        slot.appendChild(icon);
    }
}

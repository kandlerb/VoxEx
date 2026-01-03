/**
 * Main menu / start screen
 * @module ui/menus/MainMenu
 */

/**
 * @callback OnNewWorld
 * @param {string} seed
 */

/**
 * @callback OnLoadWorld
 * @param {string} saveName
 */

/**
 * Create main menu
 * @param {Object} callbacks
 * @param {OnNewWorld} callbacks.onNewWorld
 * @param {OnLoadWorld} callbacks.onLoadWorld
 * @param {Function} callbacks.onSettings
 * @returns {HTMLElement}
 */
export function createMainMenu(callbacks) {
    const menu = document.createElement('div');
    menu.id = 'main-menu';
    menu.style.cssText = `
        position: fixed;
        inset: 0;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

    // Title
    const title = document.createElement('h1');
    title.textContent = 'VoxEx';
    title.style.cssText = `
        font-size: 72px;
        color: #ff6b35;
        text-shadow: 4px 4px 0px #000;
        margin-bottom: 40px;
        font-family: 'Arial Black', sans-serif;
    `;
    menu.appendChild(title);

    // Seed input
    const seedContainer = document.createElement('div');
    seedContainer.style.cssText = `margin-bottom: 20px;`;

    const seedInput = document.createElement('input');
    seedInput.id = 'seed-input';
    seedInput.type = 'text';
    seedInput.placeholder = 'Enter seed (or leave blank for random)';
    seedInput.style.cssText = `
        width: 300px;
        padding: 12px;
        font-size: 16px;
        border: none;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        text-align: center;
    `;
    seedContainer.appendChild(seedInput);
    menu.appendChild(seedContainer);

    // Buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
    `;

    const newWorldBtn = createMenuButton('New World', () => {
        const seed = seedInput.value || String(Math.floor(Math.random() * 999999999));
        callbacks.onNewWorld(seed);
    });

    const loadWorldBtn = createMenuButton('Load World', () => callbacks.onLoadWorld(''));
    const settingsBtn = createMenuButton('Settings', callbacks.onSettings);

    buttonContainer.appendChild(newWorldBtn);
    buttonContainer.appendChild(loadWorldBtn);
    buttonContainer.appendChild(settingsBtn);
    menu.appendChild(buttonContainer);

    return menu;
}

/**
 * Create styled menu button
 * @param {string} text
 * @param {Function} onClick
 * @returns {HTMLButtonElement}
 */
export function createMenuButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
        width: 250px;
        padding: 16px 32px;
        font-size: 18px;
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid rgba(255, 255, 255, 0.2);
        color: white;
        cursor: pointer;
        border-radius: 8px;
        transition: all 0.2s;
    `;
    button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255, 255, 255, 0.2)';
        button.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(255, 255, 255, 0.1)';
        button.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });
    button.addEventListener('click', onClick);
    return button;
}

/**
 * Show/hide main menu
 * @param {HTMLElement} menu
 * @param {boolean} visible
 */
export function setMainMenuVisible(menu, visible) {
    menu.style.display = visible ? 'flex' : 'none';
}

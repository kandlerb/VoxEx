/**
 * Main UI manager - orchestrates all UI components
 * @module ui/UIManager
 */

// HUD
import { createCrosshair, setCrosshairVisible } from './hud/Crosshair.js';
import { createHotbar, setHotbarSelection, setSlotContent } from './hud/Hotbar.js';
import { createDebugOverlay, updateDebugOverlay, toggleDebugOverlay } from './hud/DebugOverlay.js';
import { createStatusIndicators, updateIndicators } from './hud/StatusIndicators.js';

// Menus
import { createMainMenu, setMainMenuVisible } from './menus/MainMenu.js';
import { createPauseMenu, setPauseMenuVisible } from './menus/PauseMenu.js';
import { createSettingsMenu, setSettingsMenuVisible } from './menus/SettingsMenu.js';

// Inventory
import { createInventoryScreen, setInventoryVisible } from './inventory/InventoryScreen.js';

// Overlays
import { createLoadingOverlay, updateLoadingProgress, setLoadingVisible } from './overlays/LoadingOverlay.js';
import { createChunkIndicator, updateChunkIndicator } from './overlays/ChunkIndicator.js';

/**
 * @typedef {'mainMenu'|'playing'|'paused'|'settings'|'inventory'|'loading'} UIState
 */

/**
 * @typedef {Object} UICallbacks
 * @property {Function} [onNewWorld]
 * @property {Function} [onLoadWorld]
 * @property {Function} [onSave]
 * @property {Function} [onLoad]
 * @property {Function} [onResume] - Called when Resume button is clicked (should lock controls)
 * @property {Function} [onBlockSelect]
 * @property {Function} [onSettingChange]
 * @property {Function} [onStateChange]
 * @property {Function} [onDeleteWorld]
 * @property {Function} [onRenameWorld]
 * @property {Function} [onDuplicateWorld]
 * @property {Function} [onClearWorldCache]
 * @property {Function} [onExportWorld]
 * @property {Function} [onImportWorld]
 * @property {Function} [onWorldStorageInfo]
 * @property {Object} [settings]
 */

/**
 * Main UI manager
 */
export class UIManager {
    /**
     * @param {HTMLElement} container - Container element for UI
     * @param {UICallbacks} [callbacks] - Event callbacks
     */
    constructor(container, callbacks = {}) {
        this.container = container;
        this.callbacks = callbacks;

        /** @type {UIState} */
        this.state = 'mainMenu';

        /** @type {UIState} */
        this.previousState = 'mainMenu';

        // Create all UI elements
        this.elements = {
            // HUD
            crosshair: createCrosshair(),
            hotbar: createHotbar(9),
            debugOverlay: createDebugOverlay(),
            statusIndicators: createStatusIndicators(),

            // Menus
            mainMenu: createMainMenu({
                onNewWorld: callbacks.onNewWorld ?? (() => {}),
                onLoadWorld: callbacks.onLoadWorld ?? (() => {}),
                onSettings: () => this.setState('settings'),
                onDeleteWorld: callbacks.onDeleteWorld ?? (() => {}),
                onRenameWorld: callbacks.onRenameWorld ?? (() => {}),
                onDuplicateWorld: callbacks.onDuplicateWorld ?? (() => {}),
                onClearWorldCache: callbacks.onClearWorldCache ?? (() => {}),
                onExportWorld: callbacks.onExportWorld ?? (() => {}),
                onImportWorld: callbacks.onImportWorld ?? (() => {}),
                onWorldStorageInfo: callbacks.onWorldStorageInfo ?? (() => {})
            }),
            pauseMenu: createPauseMenu({
                onResume: () => {
                    // Call external onResume callback to lock controls
                    // This will trigger the 'lock' event which sets state to 'playing'
                    if (callbacks.onResume) {
                        callbacks.onResume();
                    } else {
                        this.setState('playing');
                    }
                },
                onSave: callbacks.onSave ?? (() => {}),
                onLoad: callbacks.onLoad ?? (() => {}),
                onSettings: () => this.setState('settings'),
                onQuit: () => this.setState('mainMenu')
            }),
            settingsMenu: createSettingsMenu(
                callbacks.settings ?? {},
                callbacks.onSettingChange ?? (() => {}),
                () => this.setState(this.previousState)
            ),

            // Inventory
            inventory: createInventoryScreen(
                callbacks.onBlockSelect ?? (() => {}),
                () => this.setState('playing')
            ),

            // Overlays
            loadingOverlay: createLoadingOverlay(),
            chunkIndicator: createChunkIndicator(),
            toastContainer: createToastContainer()
        };

        // Append all elements to container
        this.appendElements();

        // Set initial state
        this.setState('mainMenu');
    }

    /**
     * Append all UI elements to container
     */
    appendElements() {
        Object.values(this.elements).forEach(el => {
            this.container.appendChild(el);
        });
    }

    /**
     * Set UI state
     * @param {UIState} newState
     */
    setState(newState) {
        // Store previous state if going to settings
        if (newState === 'settings') {
            this.previousState = this.state;
        }

        this.state = newState;
        this.updateVisibility();

        // Emit state change
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(newState);
        }
    }

    /**
     * Get current state
     * @returns {UIState}
     */
    getState() {
        return this.state;
    }

    /**
     * Update element visibility based on state
     */
    updateVisibility() {
        const e = this.elements;

        // HUD visible only when playing
        const hudVisible = this.state === 'playing';
        setCrosshairVisible(e.crosshair, hudVisible);
        e.hotbar.style.display = hudVisible ? 'flex' : 'none';
        e.statusIndicators.style.display = hudVisible ? 'flex' : 'none';

        // Menus
        setMainMenuVisible(e.mainMenu, this.state === 'mainMenu');
        setPauseMenuVisible(e.pauseMenu, this.state === 'paused');
        setSettingsMenuVisible(e.settingsMenu, this.state === 'settings');
        setInventoryVisible(e.inventory, this.state === 'inventory');
        setLoadingVisible(e.loadingOverlay, this.state === 'loading');
    }

    /**
     * Toggle pause state
     */
    togglePause() {
        if (this.state === 'playing') {
            this.setState('paused');
        } else if (this.state === 'paused') {
            this.setState('playing');
        }
    }

    /**
     * Toggle inventory
     */
    toggleInventory() {
        if (this.state === 'playing') {
            this.setState('inventory');
        } else if (this.state === 'inventory') {
            this.setState('playing');
        }
    }

    /**
     * Toggle debug overlay
     * @returns {boolean} New visibility state
     */
    toggleDebug() {
        return toggleDebugOverlay(this.elements.debugOverlay);
    }

    /**
     * Update debug info
     * @param {Object} info
     */
    updateDebug(info) {
        updateDebugOverlay(this.elements.debugOverlay, info);
    }

    /**
     * Update hotbar selection
     * @param {number} index
     */
    selectHotbarSlot(index) {
        setHotbarSelection(this.elements.hotbar, index);
    }

    /**
     * Set hotbar slot content
     * @param {number} slotIndex
     * @param {number} blockId
     * @param {HTMLCanvasElement} [iconCanvas]
     */
    setHotbarSlot(slotIndex, blockId, iconCanvas) {
        setSlotContent(this.elements.hotbar, slotIndex, blockId, iconCanvas);
    }

    /**
     * Update status indicators
     * @param {Object} state
     */
    updateStatus(state) {
        updateIndicators(this.elements.statusIndicators, state);
    }

    /**
     * Update loading progress
     * @param {number} progress - 0-100
     * @param {string} [message]
     */
    setLoadingProgress(progress, message) {
        updateLoadingProgress(this.elements.loadingOverlay, progress, message);
    }

    /**
     * Update chunk loading indicator
     * @param {number} count
     */
    updateChunkLoading(count) {
        updateChunkIndicator(this.elements.chunkIndicator, count);
    }

    /**
     * Update world cards list in main menu
     * @param {Array} worlds
     * @param {number} totalBytes
     */
    updateWorldCards(worlds, totalBytes) {
        this.elements.mainMenu.updateWorldCards?.(worlds, totalBytes);
    }

    /**
     * Show toast notification
     * @param {string} message
     * @param {'success'|'info'|'warning'|'error'} [type]
     * @param {number} [duration]
     */
    showToast(message, type = 'success', duration = 3000) {
        const container = this.elements.toastContainer;
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Check if game should be paused (any menu open)
     * @returns {boolean}
     */
    shouldPauseGame() {
        return this.state !== 'playing';
    }

    /**
     * Check if pointer should be locked
     * @returns {boolean}
     */
    shouldLockPointer() {
        return this.state === 'playing';
    }

    /**
     * Get crosshair element
     * @returns {HTMLElement}
     */
    getCrosshair() {
        return this.elements.crosshair;
    }

    /**
     * Get hotbar element
     * @returns {HTMLElement}
     */
    getHotbar() {
        return this.elements.hotbar;
    }

    /**
     * Get inventory element
     * @returns {HTMLElement}
     */
    getInventory() {
        return this.elements.inventory;
    }

    /**
     * Dispose UI
     */
    dispose() {
        Object.values(this.elements).forEach(el => {
            el.remove();
        });
    }
}

export default UIManager;

/**
 * Create toast container element
 * @returns {HTMLElement}
 */
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    return container;
}

/**
 * InputManager - handles keyboard, mouse, and pointer lock input.
 * Uses event-driven input with Set-based key tracking.
 * @module input/InputManager
 */

/**
 * @typedef {Object} MouseDelta
 * @property {number} x - Horizontal mouse movement
 * @property {number} y - Vertical mouse movement
 */

/**
 * @typedef {Object} MouseButtons
 * @property {boolean} left - Left mouse button state
 * @property {boolean} right - Right mouse button state
 * @property {boolean} middle - Middle mouse button state
 */

/**
 * @typedef {Object} InputListeners
 * @property {Function[]} keydown - Keydown event callbacks
 * @property {Function[]} keyup - Keyup event callbacks
 * @property {Function[]} mousedown - Mousedown event callbacks
 * @property {Function[]} mouseup - Mouseup event callbacks
 * @property {Function[]} wheel - Wheel event callbacks
 */

/**
 * Manages keyboard and mouse input state.
 * Provides event registration, key state tracking, and mouse delta accumulation.
 */
export class InputManager {
    /**
     * Create a new InputManager.
     * @param {HTMLElement} [domElement] - DOM element to attach mouse events to (defaults to document.body).
     */
    constructor(domElement) {
        /** @type {HTMLElement} */
        this.domElement = domElement || (typeof document !== 'undefined' ? document.body : null);

        /** @type {Set<string>} Currently pressed key codes */
        this.keysDown = new Set();

        /** @type {MouseDelta} Accumulated mouse movement since last consume */
        this.mouseDelta = { x: 0, y: 0 };

        /** @type {MouseButtons} Current mouse button states */
        this.mouseButtons = { left: false, right: false, middle: false };

        /** @type {boolean} Whether pointer is locked */
        this.pointerLocked = false;

        /** @type {number} Accumulated wheel delta since last consume */
        this.wheelDelta = 0;

        /** @type {InputListeners} Registered event callbacks */
        this.listeners = {
            keydown: [],
            keyup: [],
            mousedown: [],
            mouseup: [],
            wheel: []
        };

        // OPTIMIZATION: Reusable scratch object for consumeMouseDelta to avoid per-call allocation
        /** @private @type {MouseDelta} */
        this._scratchDelta = { x: 0, y: 0 };

        // Store bound handlers for cleanup
        /** @private @type {Object.<string, Function>} */
        this._boundHandlers = {};

        // DEBUG: Call counters for hot-path verification
        /** @private @type {Object.<string, number>} */
        this._callCounts = { consumeMouse: 0, consumeWheel: 0, isKeyDown: 0, on: 0, off: 0 };

        /** @private @type {boolean} */
        this._initialized = false;

        /** @private @type {boolean} */
        this._debugMode = false;
    }

    /**
     * Enable or disable debug mode for call counting.
     * @param {boolean} enabled - Whether to enable debug mode.
     * @returns {void}
     */
    setDebugMode(enabled) {
        this._debugMode = enabled;
    }

    /**
     * Initialize input event listeners.
     * Call this once after construction to start listening for events.
     * @returns {void}
     */
    init() {
        if (this._initialized) return;
        if (typeof document === 'undefined') return;

        // Create bound handlers
        this._boundHandlers.keydown = (e) => {
            this.keysDown.add(e.code);
            for (const cb of this.listeners.keydown) cb(e);
        };

        this._boundHandlers.keyup = (e) => {
            this.keysDown.delete(e.code);
            for (const cb of this.listeners.keyup) cb(e);
        };

        this._boundHandlers.mousemove = (e) => {
            if (this.pointerLocked) {
                this.mouseDelta.x += e.movementX;
                this.mouseDelta.y += e.movementY;
            }
        };

        this._boundHandlers.mousedown = (e) => {
            if (e.button === 0) this.mouseButtons.left = true;
            if (e.button === 1) this.mouseButtons.middle = true;
            if (e.button === 2) this.mouseButtons.right = true;
            for (const cb of this.listeners.mousedown) cb(e);
        };

        this._boundHandlers.mouseup = (e) => {
            if (e.button === 0) this.mouseButtons.left = false;
            if (e.button === 1) this.mouseButtons.middle = false;
            if (e.button === 2) this.mouseButtons.right = false;
            for (const cb of this.listeners.mouseup) cb(e);
        };

        this._boundHandlers.wheel = (e) => {
            this.wheelDelta = e.deltaY;
            for (const cb of this.listeners.wheel) cb(e);
        };

        this._boundHandlers.pointerlockchange = () => {
            this.pointerLocked = document.pointerLockElement === this.domElement;
        };

        // Attach keyboard events to document
        document.addEventListener('keydown', this._boundHandlers.keydown);
        document.addEventListener('keyup', this._boundHandlers.keyup);

        // Attach mouse events
        document.addEventListener('mousemove', this._boundHandlers.mousemove);
        if (this.domElement) {
            this.domElement.addEventListener('mousedown', this._boundHandlers.mousedown);
            this.domElement.addEventListener('mouseup', this._boundHandlers.mouseup);
            this.domElement.addEventListener('wheel', this._boundHandlers.wheel, { passive: false });
        }

        // Pointer lock change
        document.addEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);

        this._initialized = true;
    }

    /**
     * Remove all event listeners and clean up.
     * Call this when destroying the InputManager.
     * @returns {void}
     */
    destroy() {
        if (!this._initialized) return;
        if (typeof document === 'undefined') return;

        document.removeEventListener('keydown', this._boundHandlers.keydown);
        document.removeEventListener('keyup', this._boundHandlers.keyup);
        document.removeEventListener('mousemove', this._boundHandlers.mousemove);
        document.removeEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);

        if (this.domElement) {
            this.domElement.removeEventListener('mousedown', this._boundHandlers.mousedown);
            this.domElement.removeEventListener('mouseup', this._boundHandlers.mouseup);
            this.domElement.removeEventListener('wheel', this._boundHandlers.wheel);
        }

        this._boundHandlers = {};
        this._initialized = false;
    }

    /**
     * Get and reset mouse delta (uses scratch object to avoid allocation).
     * @returns {MouseDelta} Mouse movement since last call.
     */
    consumeMouseDelta() {
        if (this._debugMode) this._callCounts.consumeMouse++;
        this._scratchDelta.x = this.mouseDelta.x;
        this._scratchDelta.y = this.mouseDelta.y;
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        return this._scratchDelta;
    }

    /**
     * Get and reset wheel delta.
     * @returns {number} Wheel scroll amount since last call.
     */
    consumeWheelDelta() {
        if (this._debugMode) this._callCounts.consumeWheel++;
        const delta = this.wheelDelta;
        this.wheelDelta = 0;
        return delta;
    }

    /**
     * Check if a key is currently pressed.
     * @param {string} code - Key code to check (e.g., 'KeyW', 'Space').
     * @returns {boolean} True if the key is down.
     */
    isKeyDown(code) {
        if (this._debugMode) this._callCounts.isKeyDown++;
        return this.keysDown.has(code);
    }

    /**
     * Check if any of the given keys are currently pressed.
     * @param {...string} codes - Key codes to check.
     * @returns {boolean} True if any of the keys are down.
     */
    isAnyKeyDown(...codes) {
        for (const code of codes) {
            if (this.keysDown.has(code)) return true;
        }
        return false;
    }

    /**
     * Check if all of the given keys are currently pressed.
     * @param {...string} codes - Key codes to check.
     * @returns {boolean} True if all of the keys are down.
     */
    areAllKeysDown(...codes) {
        for (const code of codes) {
            if (!this.keysDown.has(code)) return false;
        }
        return true;
    }

    /**
     * Register an event listener.
     * @param {string} event - Event name ('keydown', 'keyup', 'mousedown', 'mouseup', 'wheel').
     * @param {Function} callback - Callback function.
     * @returns {void}
     */
    on(event, callback) {
        if (this._debugMode) this._callCounts.on++;
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    /**
     * Remove an event listener.
     * @param {string} event - Event name.
     * @param {Function} callback - Callback function to remove.
     * @returns {void}
     */
    off(event, callback) {
        if (this._debugMode) this._callCounts.off++;
        if (this.listeners[event]) {
            const idx = this.listeners[event].indexOf(callback);
            if (idx !== -1) this.listeners[event].splice(idx, 1);
        }
    }

    /**
     * Clear all keys (useful when focus is lost).
     * @returns {void}
     */
    clearKeys() {
        this.keysDown.clear();
    }

    /**
     * Clear all mouse button states.
     * @returns {void}
     */
    clearMouseButtons() {
        this.mouseButtons.left = false;
        this.mouseButtons.right = false;
        this.mouseButtons.middle = false;
    }

    /**
     * Reset all input state.
     * @returns {void}
     */
    reset() {
        this.clearKeys();
        this.clearMouseButtons();
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        this.wheelDelta = 0;
    }

    /**
     * Get debug call statistics.
     * @returns {{consumeMouse: number, consumeWheel: number, isKeyDown: number, on: number, off: number}} Copy of call counts.
     */
    getCallStats() {
        return { ...this._callCounts };
    }

    /**
     * Reset debug call counters.
     * @returns {void}
     */
    resetCallStats() {
        this._callCounts.consumeMouse = 0;
        this._callCounts.consumeWheel = 0;
        this._callCounts.isKeyDown = 0;
        this._callCounts.on = 0;
        this._callCounts.off = 0;
    }
}

export default InputManager;

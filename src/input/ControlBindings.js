/**
 * Default control bindings and rebinding utilities.
 * Provides key mapping configuration and validation.
 * @module input/ControlBindings
 */

/**
 * @typedef {Object} ControlBindings
 * @property {string} forward - Move forward key
 * @property {string} backward - Move backward key
 * @property {string} left - Strafe left key
 * @property {string} right - Strafe right key
 * @property {string} jump - Jump/fly up key
 * @property {string} crouch - Crouch/fly down key
 * @property {string} sprint - Sprint key
 * @property {string} toggleTorch - Toggle torch key
 * @property {string} toggleThirdPerson - Toggle third-person camera key
 * @property {string} cameraZoomIn - Zoom camera in (third-person)
 * @property {string} cameraZoomOut - Zoom camera out (third-person)
 * @property {string} inventory - Open inventory key
 * @property {string} pause - Pause/menu key
 * @property {string} debug - Debug overlay key
 * @property {string} quickSave - Quick save key
 * @property {string} quickLoad - Quick load key
 * @property {string} slot1 - Hotbar slot 1
 * @property {string} slot2 - Hotbar slot 2
 * @property {string} slot3 - Hotbar slot 3
 * @property {string} slot4 - Hotbar slot 4
 * @property {string} slot5 - Hotbar slot 5
 * @property {string} slot6 - Hotbar slot 6
 * @property {string} slot7 - Hotbar slot 7
 * @property {string} slot8 - Hotbar slot 8
 * @property {string} slot9 - Hotbar slot 9
 */

/**
 * Default key bindings for game controls.
 * Uses KeyboardEvent.code values for consistency across keyboard layouts.
 * @type {ControlBindings}
 */
export const DEFAULT_BINDINGS = {
    // Movement
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    crouch: 'KeyC',
    sprint: 'ShiftLeft',

    // Actions
    toggleTorch: 'KeyF',
    toggleThirdPerson: 'KeyV',
    cameraZoomIn: 'Equal',
    cameraZoomOut: 'Minus',
    inventory: 'KeyE',
    pause: 'Escape',
    debug: 'Backquote',  // Tilde key (~)
    quickSave: 'F5',
    quickLoad: 'F9',

    // Hotbar slots
    slot1: 'Digit1',
    slot2: 'Digit2',
    slot3: 'Digit3',
    slot4: 'Digit4',
    slot5: 'Digit5',
    slot6: 'Digit6',
    slot7: 'Digit7',
    slot8: 'Digit8',
    slot9: 'Digit9',
};

/**
 * Alternative movement keys (arrow keys).
 * @type {Object.<string, string>}
 */
export const ALTERNATE_MOVEMENT_KEYS = {
    forward: 'ArrowUp',
    backward: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
};

/**
 * Mouse button names for display purposes.
 * @type {Object.<number, string>}
 */
export const MOUSE_BUTTON_NAMES = {
    0: 'Left Click',
    1: 'Middle Click',
    2: 'Right Click',
};

/**
 * Display name mappings for key codes.
 * Converts KeyboardEvent.code to human-readable names.
 * @type {Object.<string, string>}
 */
const KEY_DISPLAY_NAMES = {
    // Modifier keys
    'Space': 'Space',
    'ShiftLeft': 'L-Shift',
    'ShiftRight': 'R-Shift',
    'ControlLeft': 'L-Ctrl',
    'ControlRight': 'R-Ctrl',
    'AltLeft': 'L-Alt',
    'AltRight': 'R-Alt',
    'MetaLeft': 'L-Meta',
    'MetaRight': 'R-Meta',

    // Special keys
    'Backquote': '~',
    'Escape': 'Esc',
    'Tab': 'Tab',
    'CapsLock': 'Caps',
    'Enter': 'Enter',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Insert': 'Insert',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PgUp',
    'PageDown': 'PgDn',

    // Arrow keys
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',

    // Punctuation
    'Minus': '-',
    'Equal': '=',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Backslash': '\\',
    'Semicolon': ';',
    'Quote': "'",
    'Comma': ',',
    'Period': '.',
    'Slash': '/',
};

/**
 * Get display name for a key code.
 * Converts KeyboardEvent.code to a human-readable string.
 * @param {string} keyCode - e.g., 'KeyW', 'Space', 'Digit1'
 * @returns {string} Human-readable name
 */
export function getKeyDisplayName(keyCode) {
    // Check explicit mappings first
    if (KEY_DISPLAY_NAMES[keyCode]) {
        return KEY_DISPLAY_NAMES[keyCode];
    }

    // Handle Key* codes (e.g., KeyW -> W)
    if (keyCode.startsWith('Key')) {
        return keyCode.slice(3);
    }

    // Handle Digit* codes (e.g., Digit1 -> 1)
    if (keyCode.startsWith('Digit')) {
        return keyCode.slice(5);
    }

    // Handle Numpad* codes (e.g., Numpad1 -> Num1)
    if (keyCode.startsWith('Numpad')) {
        return 'Num' + keyCode.slice(6);
    }

    // Handle F* keys (e.g., F5 -> F5)
    if (/^F\d+$/.test(keyCode)) {
        return keyCode;
    }

    // Default: return as-is
    return keyCode;
}

/**
 * Get the action name for a hotbar slot number.
 * @param {number} slot - Slot number (1-9)
 * @returns {string|null} Action name or null if invalid
 */
export function getHotbarSlotAction(slot) {
    if (slot >= 1 && slot <= 9) {
        return `slot${slot}`;
    }
    return null;
}

/**
 * Get the key code for a hotbar slot from bindings.
 * @param {ControlBindings} bindings - Current bindings
 * @param {number} slot - Slot number (1-9)
 * @returns {string|null} Key code or null if invalid
 */
export function getHotbarSlotKey(bindings, slot) {
    const action = getHotbarSlotAction(slot);
    return action ? bindings[action] : null;
}

/**
 * Validate a key binding (check for conflicts).
 * @param {ControlBindings} bindings - Current bindings object
 * @param {string} action - Action to bind
 * @param {string} newKey - New key code
 * @returns {{ valid: boolean, conflict?: string }} Validation result
 */
export function validateBinding(bindings, action, newKey) {
    for (const [existingAction, existingKey] of Object.entries(bindings)) {
        if (existingAction !== action && existingKey === newKey) {
            return { valid: false, conflict: existingAction };
        }
    }
    return { valid: true };
}

/**
 * Create a copy of bindings with a single change.
 * @param {ControlBindings} bindings - Current bindings
 * @param {string} action - Action to update
 * @param {string} newKey - New key code
 * @returns {ControlBindings} New bindings object
 */
export function updateBinding(bindings, action, newKey) {
    return {
        ...bindings,
        [action]: newKey,
    };
}

/**
 * Reset all bindings to defaults.
 * @returns {ControlBindings} Copy of default bindings
 */
export function getDefaultBindings() {
    return { ...DEFAULT_BINDINGS };
}

/**
 * Check if a key code is a movement key in the given bindings.
 * @param {ControlBindings} bindings - Current bindings
 * @param {string} keyCode - Key code to check
 * @returns {boolean} True if the key is a movement key
 */
export function isMovementKey(bindings, keyCode) {
    return (
        keyCode === bindings.forward ||
        keyCode === bindings.backward ||
        keyCode === bindings.left ||
        keyCode === bindings.right ||
        keyCode === ALTERNATE_MOVEMENT_KEYS.forward ||
        keyCode === ALTERNATE_MOVEMENT_KEYS.backward ||
        keyCode === ALTERNATE_MOVEMENT_KEYS.left ||
        keyCode === ALTERNATE_MOVEMENT_KEYS.right
    );
}

/**
 * Check if a key code is a hotbar slot key in the given bindings.
 * @param {ControlBindings} bindings - Current bindings
 * @param {string} keyCode - Key code to check
 * @returns {number|null} Slot number (1-9) or null if not a hotbar key
 */
export function getHotbarSlotFromKey(bindings, keyCode) {
    for (let i = 1; i <= 9; i++) {
        if (bindings[`slot${i}`] === keyCode) {
            return i;
        }
    }
    return null;
}

/**
 * Serialize bindings to JSON string.
 * @param {ControlBindings} bindings - Bindings to serialize
 * @returns {string} JSON string
 */
export function serializeBindings(bindings) {
    return JSON.stringify(bindings);
}

/**
 * Deserialize bindings from JSON string, with fallback to defaults.
 * @param {string} json - JSON string to parse
 * @returns {ControlBindings} Parsed bindings or defaults on error
 */
export function deserializeBindings(json) {
    try {
        const parsed = JSON.parse(json);
        // Merge with defaults to ensure all keys exist
        return { ...DEFAULT_BINDINGS, ...parsed };
    } catch {
        return getDefaultBindings();
    }
}

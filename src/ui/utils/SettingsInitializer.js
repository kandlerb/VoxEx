/**
 * Settings UI initializer utilities.
 * Binds settings values to DOM input elements.
 * @module ui/utils/SettingsInitializer
 */

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Convert hex number to color string.
 * @param {number} hex - Hex color value (e.g., 0xffffff)
 * @returns {string} CSS color string (e.g., "#ffffff")
 */
export function hexToColor(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
}

/**
 * Convert color string to hex number.
 * @param {string} color - CSS color string (e.g., "#ffffff")
 * @returns {number} Hex color value
 */
export function colorToHex(color) {
    return parseInt(color.slice(1), 16);
}

// =====================================================
// SETTINGS BINDING CONFIGURATION
// =====================================================

/**
 * @typedef {Object} SettingBinding
 * @property {string} elementId - DOM element ID
 * @property {string} settingKey - Key in settings object
 * @property {'value'|'checked'|'color'|'text'} type - Input type
 * @property {string} [displayElementId] - Optional element to update with display value
 */

/**
 * Default settings bindings for VoxEx.
 * Maps DOM element IDs to settings keys with type info.
 * @type {SettingBinding[]}
 */
export const SETTINGS_BINDINGS = [
    // Graphics - Lighting colors
    { elementId: 'sun-color', settingKey: 'sunColor', type: 'color' },
    { elementId: 'moon-color', settingKey: 'moonColor', type: 'color' },
    { elementId: 'torch-color', settingKey: 'torchColor', type: 'color' },

    // Graphics - Lighting values
    { elementId: 'sun-intensity-input', settingKey: 'sunIntensity', type: 'value' },
    { elementId: 'moon-intensity-input', settingKey: 'moonIntensity', type: 'value' },
    { elementId: 'torch-intensity-input', settingKey: 'torchIntensity', type: 'value' },
    { elementId: 'torch-range-input', settingKey: 'torchRange', type: 'value' },
    { elementId: 'ambient-intensity-input', settingKey: 'ambientIntensity', type: 'value' },
    { elementId: 'shadow-bias-input', settingKey: 'shadowBias', type: 'value' },
    { elementId: 'shadow-radius-input', settingKey: 'shadowRadius', type: 'value' },

    // Graphics - Volumetric
    { elementId: 'volumetric-toggle', settingKey: 'volumetricLightingEnabled', type: 'checked' },
    { elementId: 'volumetric-density-input', settingKey: 'volumetricDensity', type: 'value' },
    { elementId: 'volumetric-decay-input', settingKey: 'volumetricDecay', type: 'value' },
    { elementId: 'volumetric-weight-input', settingKey: 'volumetricWeight', type: 'value' },
    { elementId: 'volumetric-samples-input', settingKey: 'volumetricSamples', type: 'value' },
    { elementId: 'volumetric-exposure-input', settingKey: 'volumetricExposure', type: 'value' },
    { elementId: 'atmospheric-fog-density-input', settingKey: 'volumetricFogDensity', type: 'value' },

    // Graphics - Global Illumination
    { elementId: 'gi-toggle', settingKey: 'giEnabled', type: 'checked' },
    { elementId: 'gi-intensity-input', settingKey: 'giIntensity', type: 'value' },
    { elementId: 'gi-bounce-intensity-input', settingKey: 'giBounceIntensity', type: 'value' },
    { elementId: 'gi-range-input', settingKey: 'giRange', type: 'value' },
    { elementId: 'gi-color-bleed-input', settingKey: 'giColorBleed', type: 'value' },
    { elementId: 'gi-samples-input', settingKey: 'giSamples', type: 'value' },

    // Graphics - Diffuse Lighting
    { elementId: 'diffuse-toggle', settingKey: 'diffuseEnabled', type: 'checked' },
    { elementId: 'diffuse-intensity-input', settingKey: 'diffuseIntensity', type: 'value' },
    { elementId: 'diffuse-wrap-input', settingKey: 'diffuseWrap', type: 'value' },
    { elementId: 'diffuse-softness-input', settingKey: 'diffuseSoftness', type: 'value' },

    // Graphics - Specular Lighting
    { elementId: 'specular-toggle', settingKey: 'specularEnabled', type: 'checked' },
    { elementId: 'specular-intensity-input', settingKey: 'specularIntensity', type: 'value' },
    { elementId: 'specular-shininess-input', settingKey: 'specularShininess', type: 'value' },
    { elementId: 'specular-fresnel-input', settingKey: 'specularFresnel', type: 'value' },
    { elementId: 'specular-roughness-input', settingKey: 'specularRoughness', type: 'value' },

    // Graphics - Basic
    { elementId: 'ao-toggle', settingKey: 'AO', type: 'checked' },
    { elementId: 'shadows-toggle', settingKey: 'shadows', type: 'checked' },
    { elementId: 'shadow-quality-select', settingKey: 'shadowQuality', type: 'value' },

    // Graphics - Water
    { elementId: 'water-fast-toggle', settingKey: 'waterFastMode', type: 'checked' },
    { elementId: 'water-color', settingKey: 'waterColor', type: 'color' },
    { elementId: 'water-opacity-slider', settingKey: 'waterOpacity', type: 'value', displayElementId: 'water-opacity-val' },
    { elementId: 'water-fog-slider', settingKey: 'waterFogDensity', type: 'value', displayElementId: 'water-fog-val' },

    // World - Environment (sky colors)
    { elementId: 'day-sky-top-color', settingKey: 'daySkyTop', type: 'color' },
    { elementId: 'day-sky-bottom-color', settingKey: 'daySkyBottom', type: 'color' },
    { elementId: 'night-sky-top-color', settingKey: 'nightSkyTop', type: 'color' },
    { elementId: 'night-sky-bottom-color', settingKey: 'nightSkyBottom', type: 'color' },

    // Performance
    { elementId: 'frustum-culling-toggle', settingKey: 'enableFrustumCulling', type: 'checked' },
    { elementId: 'render-dist-slider', settingKey: 'renderDistance', type: 'value', displayElementId: 'render-dist-val' },

    // Gameplay - FOV
    { elementId: 'normal-fov-slider', settingKey: 'normalFOV', type: 'value', displayElementId: 'normal-fov-val' },
    { elementId: 'sprint-fov-slider', settingKey: 'sprintFOV', type: 'value', displayElementId: 'sprint-fov-val' },
];

// =====================================================
// INITIALIZATION FUNCTIONS
// =====================================================

/**
 * Apply a single setting value to a DOM element.
 * @param {HTMLElement|null} element - DOM element
 * @param {*} value - Setting value
 * @param {'value'|'checked'|'color'|'text'} type - How to apply the value
 */
export function applySettingToElement(element, value, type) {
    if (!element) return;

    switch (type) {
        case 'checked':
            element.checked = Boolean(value);
            break;
        case 'color':
            element.value = hexToColor(value);
            break;
        case 'text':
            element.textContent = String(value);
            break;
        case 'value':
        default:
            element.value = value;
            break;
    }
}

/**
 * Initialize a single setting binding.
 * @param {SettingBinding} binding - Binding configuration
 * @param {Object} settings - Settings object
 */
export function initSettingBinding(binding, settings) {
    const element = document.getElementById(binding.elementId);
    const value = settings[binding.settingKey];

    if (value !== undefined) {
        applySettingToElement(element, value, binding.type);

        // Update display element if specified
        if (binding.displayElementId) {
            const displayEl = document.getElementById(binding.displayElementId);
            if (displayEl) {
                displayEl.textContent = String(value);
            }
        }
    }
}

/**
 * Initialize all settings UI elements from settings object.
 * @param {Object} settings - Settings object with current values
 * @param {SettingBinding[]} [bindings] - Binding configuration (defaults to SETTINGS_BINDINGS)
 */
export function initSettingsUI(settings, bindings = SETTINGS_BINDINGS) {
    for (const binding of bindings) {
        initSettingBinding(binding, settings);
    }
}

/**
 * Create change handler for a settings input.
 * @param {SettingBinding} binding - Binding configuration
 * @param {Object} settings - Settings object to update
 * @param {Function} [onChange] - Callback when setting changes
 * @returns {Function} Event handler
 */
export function createSettingChangeHandler(binding, settings, onChange) {
    return (event) => {
        const element = event.target;
        let value;

        switch (binding.type) {
            case 'checked':
                value = element.checked;
                break;
            case 'color':
                value = colorToHex(element.value);
                break;
            case 'value':
            default:
                value = element.type === 'range' || element.type === 'number'
                    ? parseFloat(element.value)
                    : element.value;
                break;
        }

        settings[binding.settingKey] = value;

        // Update display element if specified
        if (binding.displayElementId) {
            const displayEl = document.getElementById(binding.displayElementId);
            if (displayEl) {
                displayEl.textContent = String(value);
            }
        }

        if (onChange) {
            onChange(binding.settingKey, value);
        }
    };
}

/**
 * Attach change listeners to all settings inputs.
 * @param {Object} settings - Settings object to update
 * @param {Function} [onChange] - Callback when any setting changes
 * @param {SettingBinding[]} [bindings] - Binding configuration
 */
export function attachSettingsListeners(settings, onChange, bindings = SETTINGS_BINDINGS) {
    for (const binding of bindings) {
        const element = document.getElementById(binding.elementId);
        if (element) {
            const handler = createSettingChangeHandler(binding, settings, onChange);
            element.addEventListener('input', handler);
            element.addEventListener('change', handler);
        }
    }
}

/**
 * Sync all settings UI elements with current settings values.
 * Useful after loading a profile or resetting to defaults.
 * @param {Object} settings - Settings object
 * @param {SettingBinding[]} [bindings] - Binding configuration
 */
export function syncSettingsUI(settings, bindings = SETTINGS_BINDINGS) {
    initSettingsUI(settings, bindings);
}

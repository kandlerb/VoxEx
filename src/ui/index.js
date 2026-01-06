/**
 * UI module barrel export
 * @module ui
 */

// Main manager
export { UIManager, default as UIManagerDefault } from './UIManager.js';

// HUD
export * from './hud/index.js';

// Menus
export * from './menus/index.js';

// Inventory
export * from './inventory/index.js';

// Overlays
export * from './overlays/index.js';

// Utilities
export * from './utils/index.js';

// Modals
export * from './modals/index.js';

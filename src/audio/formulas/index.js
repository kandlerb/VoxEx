/**
 * Sound formula exports.
 * Add generated formulas here from the VoxEx Sound Formula tool.
 * @module audio/formulas
 *
 * Example usage:
 * ```javascript
 * export { footstepFormula } from './footstep.js';
 * export { blockBreakFormula } from './blockBreak.js';
 * export { blockPlaceFormula } from './blockPlace.js';
 * ```
 */

/**
 * Placeholder formulas object.
 * Add sound formulas as you create them.
 * @type {Object<string, import('../SoundPlayer.js').SoundFormula>}
 */
export const formulas = {};

/**
 * Get a formula by name.
 * @param {string} name - Formula name
 * @returns {import('../SoundPlayer.js').SoundFormula|undefined} The formula if found
 */
export function getFormula(name) {
    return formulas[name];
}

/**
 * Register a formula.
 * @param {string} name - Formula name
 * @param {import('../SoundPlayer.js').SoundFormula} formula - The formula data
 */
export function registerFormula(name, formula) {
    formulas[name] = formula;
}

export default {
    formulas,
    getFormula,
    registerFormula
};

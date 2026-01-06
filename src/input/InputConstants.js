/**
 * Input state bitfield constants
 * Packs input state into single integer for faster checks.
 * @module input/InputConstants
 */

// =====================================================
// INPUT BIT FLAGS
// =====================================================

/** Forward movement bit (W key) */
export const INPUT_FORWARD = 1 << 0;

/** Backward movement bit (S key) */
export const INPUT_BACKWARD = 1 << 1;

/** Left strafe bit (A key) */
export const INPUT_LEFT = 1 << 2;

/** Right strafe bit (D key) */
export const INPUT_RIGHT = 1 << 3;

/** Jump bit (Space key) */
export const INPUT_JUMP = 1 << 4;

/** Sprint bit (Shift key) */
export const INPUT_SPRINT = 1 << 5;

/** Crouch bit (C key) */
export const INPUT_CROUCH = 1 << 6;

/** All input bits combined */
export const INPUT_ALL = INPUT_FORWARD | INPUT_BACKWARD | INPUT_LEFT | INPUT_RIGHT | INPUT_JUMP | INPUT_SPRINT | INPUT_CROUCH;

/** Movement input bits only (first 4 bits) */
export const INPUT_MOVEMENT_MASK = 0x0F;

// =====================================================
// INPUT STATE HELPERS
// =====================================================

/**
 * Set or clear an input bit in a state value.
 * @param {number} state - Current input state
 * @param {number} bit - Bit to modify
 * @param {boolean} value - True to set, false to clear
 * @returns {number} New input state
 */
export function setInputBit(state, bit, value) {
    if (value) return state | bit;
    return state & ~bit;
}

/**
 * Check if an input bit is set.
 * @param {number} state - Current input state
 * @param {number} bit - Bit to check
 * @returns {boolean} True if bit is set
 */
export function hasInputBit(state, bit) {
    return (state & bit) !== 0;
}

/**
 * Check if any movement input is active.
 * @param {number} state - Current input state
 * @returns {boolean} True if any movement key is pressed
 */
export function hasAnyMovementInput(state) {
    return (state & INPUT_MOVEMENT_MASK) !== 0;
}

/**
 * Get movement direction from input state.
 * Returns normalized direction vector components.
 * @param {number} state - Current input state
 * @returns {{x: number, z: number}} Movement direction
 */
export function getMovementDirection(state) {
    let x = 0;
    let z = 0;

    if (state & INPUT_FORWARD) z -= 1;
    if (state & INPUT_BACKWARD) z += 1;
    if (state & INPUT_LEFT) x -= 1;
    if (state & INPUT_RIGHT) x += 1;

    // Normalize diagonal movement
    if (x !== 0 && z !== 0) {
        const inv = 1 / Math.SQRT2;
        x *= inv;
        z *= inv;
    }

    return { x, z };
}

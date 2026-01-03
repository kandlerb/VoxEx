/**
 * VoxEx - Main Entry Point
 * Browser-based voxel exploration game engine
 * @module main
 */

import { Game } from './Game.js';

// Global game reference for debugging
let game = null;

/**
 * Initialize and start the game
 */
async function init() {
    console.log('%c VoxEx ', 'background: #ff6b35; color: white; font-size: 24px; font-weight: bold; padding: 4px 8px;');
    console.log('%c Browser-based Voxel Explorer ', 'color: #888; font-size: 12px;');
    console.log('');

    // Get container
    const container = document.getElementById('game-container');
    if (!container) {
        console.error('[VoxEx] Game container not found!');
        return;
    }

    try {
        // Create and initialize game
        game = new Game(container);
        await game.init();

        // Expose for debugging
        window.VoxEx = {
            game,
            version: '2.0.0-modular',
            getPlayer: () => game.playerController,
            getCamera: () => game.camera,
            getScene: () => game.scene,
            setTime: (t) => game.dayNightCycle?.setTime(t),
            toggleDebug: () => game.uiManager?.toggleDebug(),
        };

        console.log('%c Ready! ', 'background: #4CAF50; color: white; padding: 2px 6px;');
        console.log('Use window.VoxEx for debugging');

    } catch (error) {
        console.error('[VoxEx] Initialization failed:', error);
        showError(container, error);
    }
}

/**
 * Show error screen
 * @param {HTMLElement} container
 * @param {Error} error
 */
function showError(container, error) {
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #1a1a2e; color: #fff; font-family: Arial, sans-serif; padding: 20px; text-align: center;">
            <h1 style="color: #f44336; margin-bottom: 16px;">VoxEx Failed to Load</h1>
            <p style="color: #888; margin-bottom: 24px;">An error occurred during initialization:</p>
            <pre style="background: #2a2a3e; padding: 16px; border-radius: 8px; color: #ff6b6b; max-width: 600px; overflow: auto; text-align: left;">${error.message}\n\n${error.stack}</pre>
            <button onclick="location.reload()" style="margin-top: 24px; padding: 12px 24px; background: #ff6b35; border: none; color: white; border-radius: 4px; cursor: pointer; font-size: 16px;">Reload</button>
        </div>
    `;
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

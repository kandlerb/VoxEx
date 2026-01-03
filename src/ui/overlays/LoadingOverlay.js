/**
 * World generation loading overlay
 * @module ui/overlays/LoadingOverlay
 */

/**
 * Create loading overlay
 * @returns {HTMLElement}
 */
export function createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: #1a1a1a;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1100;
    `;

    // Loading text
    const text = document.createElement('div');
    text.id = 'loading-text';
    text.textContent = 'Generating World...';
    text.style.cssText = `
        color: white;
        font-size: 24px;
        margin-bottom: 20px;
    `;
    overlay.appendChild(text);

    // Progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
        width: 300px;
        height: 20px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        overflow: hidden;
    `;

    // Progress bar fill
    const progressBar = document.createElement('div');
    progressBar.id = 'loading-progress';
    progressBar.style.cssText = `
        width: 0%;
        height: 100%;
        background: #4caf50;
        border-radius: 10px;
        transition: width 0.3s ease;
    `;
    progressContainer.appendChild(progressBar);
    overlay.appendChild(progressContainer);

    // Progress text
    const progressText = document.createElement('div');
    progressText.id = 'loading-progress-text';
    progressText.textContent = '0%';
    progressText.style.cssText = `
        color: #888;
        margin-top: 10px;
    `;
    overlay.appendChild(progressText);

    return overlay;
}

/**
 * Update loading progress
 * @param {HTMLElement} overlay
 * @param {number} progress - 0-100
 * @param {string} [message] - Optional status message
 */
export function updateLoadingProgress(overlay, progress, message) {
    const progressBar = overlay.querySelector('#loading-progress');
    const progressText = overlay.querySelector('#loading-progress-text');
    const loadingText = overlay.querySelector('#loading-text');

    if (progressBar) {
        /** @type {HTMLElement} */
        const barEl = /** @type {HTMLElement} */ (progressBar);
        barEl.style.width = `${progress}%`;
    }
    if (progressText) {
        progressText.textContent = `${Math.round(progress)}%`;
    }
    if (message && loadingText) {
        loadingText.textContent = message;
    }
}

/**
 * Show/hide loading overlay
 * @param {HTMLElement} overlay
 * @param {boolean} visible
 */
export function setLoadingVisible(overlay, visible) {
    overlay.style.display = visible ? 'flex' : 'none';
}

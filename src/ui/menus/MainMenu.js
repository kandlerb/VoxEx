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
 * Create main menu (seed menu + world management)
 * @param {Object} callbacks
 * @param {(payload: {name: string, seed: string}) => void} callbacks.onNewWorld
 * @param {OnLoadWorld} callbacks.onLoadWorld
 * @param {Function} callbacks.onSettings
 * @param {(name: string) => Promise<void>} [callbacks.onDeleteWorld]
 * @param {(oldName: string, newName: string) => Promise<boolean>} [callbacks.onRenameWorld]
 * @param {(sourceName: string, newName: string) => Promise<boolean>} [callbacks.onDuplicateWorld]
 * @param {(name: string) => Promise<void>} [callbacks.onClearWorldCache]
 * @param {(name: string) => Promise<Blob|null>} [callbacks.onExportWorld]
 * @param {(file: File) => Promise<{name: string, chunkCount: number}|null>} [callbacks.onImportWorld]
 * @param {(name: string) => Promise<{metaBytes: number, chunkBytes: number, chunkCount: number, totalBytes: number}>} [callbacks.onWorldStorageInfo]
 * @returns {HTMLElement & { updateWorldCards: Function, updateTotalStorage: Function, getSelectedWorld: Function, setSelectedWorld: Function, setCreateWorldVisible: Function }}
 */
export function createMainMenu(callbacks) {
    const wrapper = document.createElement('div');
    wrapper.id = 'main-menu-wrapper';
    wrapper.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 1000;
        pointer-events: auto;
    `;

    const seedMenu = document.createElement('div');
    seedMenu.id = 'seed-menu';
    seedMenu.innerHTML = `
        <h3>VoxEx</h3>
        <h1>The HTML Voxel Explorer</h1>
        <div style="border-bottom: 1px solid #444; padding-bottom: 15px; margin-bottom: 15px">
            <button id="btn-create-world" class="menu-btn" style="background: #4caf50; margin: 0; width: 100%">Create New World</button>
        </div>
        <div>
            <p style="margin: 5px 0 10px 0; color: #aaa">Saved Worlds</p>
            <div id="saved-worlds-container"></div>
            <div id="storage-overview" style="margin-top: 10px; padding: 8px; background: #1a1a1a; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #888;">
                    <span>Total Storage Used:</span>
                    <span id="total-storage-display">Calculating...</span>
                </div>
            </div>
            <button id="btn-load-start" class="menu-btn" style="background: #2196f3; width: 100%" disabled>Play Selected World</button>
        </div>
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #444">
            <button id="btn-settings-main" class="menu-btn" style="background: #555; width: 100%">Settings</button>
        </div>
    `;
    wrapper.appendChild(seedMenu);

    const createWorldPanel = document.createElement('div');
    createWorldPanel.id = 'create-world-panel';
    createWorldPanel.innerHTML = `
        <div class="panel-header">
            <h1>Create New World</h1>
            <button class="btn-start-game" id="btn-start-new-world">Start Game</button>
        </div>
        <div class="panel-content">
            <div class="section-title">World Info</div>
            <div class="input-group">
                <label for="world-name-input">World Name</label>
                <input type="text" id="world-name-input" value="New World" placeholder="Enter world name..." />
            </div>
            <div class="input-group">
                <label for="new-seed-input">Seed</label>
                <div class="seed-row">
                    <input type="text" id="new-seed-input" placeholder="Leave blank for random..." />
                    <button class="seed-btn" id="btn-random-seed" title="Generate Random">🎲</button>
                    <button class="seed-btn" id="btn-copy-seed" title="Copy Seed">📋</button>
                </div>
            </div>
            <div class="panel-footer">
                <button class="btn-back" id="btn-back-create-world">Back</button>
            </div>
        </div>
    `;
    wrapper.appendChild(createWorldPanel);

    const worldManageModal = document.createElement('div');
    worldManageModal.id = 'world-manage-modal';
    worldManageModal.innerHTML = `
        <div class="world-modal-content">
            <div class="world-modal-header">
                <h2 id="world-modal-title">Manage World</h2>
                <button class="world-modal-close" id="world-modal-close">&times;</button>
            </div>
            <div class="world-modal-section">
                <h3>Rename World</h3>
                <div class="world-modal-row">
                    <input type="text" id="world-rename-input" placeholder="New name..." />
                    <button class="world-modal-btn primary" id="btn-rename-world">Rename</button>
                </div>
            </div>
            <div class="world-modal-section">
                <h3>Duplicate World</h3>
                <div class="world-modal-row">
                    <input type="text" id="world-duplicate-input" placeholder="Copy name..." />
                    <button class="world-modal-btn secondary" id="btn-duplicate-world">Duplicate</button>
                </div>
            </div>
            <div class="world-modal-section">
                <h3>Storage</h3>
                <div class="storage-info">
                    <div class="storage-bar">
                        <div class="storage-bar-fill" id="world-storage-bar"></div>
                    </div>
                    <div class="storage-text">
                        <span id="world-storage-used" class="used">0 KB</span>
                        <span id="world-storage-total">/ 50 MB limit</span>
                    </div>
                </div>
                <div class="world-modal-row" style="margin-bottom: 0;">
                    <span style="color: #888; font-size: 12px;">Metadata: <span id="world-meta-size">0 KB</span></span>
                    <span style="color: #888; font-size: 12px; margin-left: auto;">Chunks: <span id="world-chunks-size">0 KB</span> (<span id="world-chunks-count">0</span> chunks)</span>
                </div>
            </div>
            <div class="world-modal-section">
                <h3>Export / Import</h3>
                <div class="world-import-export">
                    <button class="world-modal-btn secondary" id="btn-export-world">Export</button>
                    <button class="world-modal-btn secondary" id="btn-import-world">Import</button>
                    <input type="file" id="world-import-input" accept=".voxworld,.json" />
                </div>
            </div>
            <div class="world-modal-section">
                <h3>Danger Zone</h3>
                <button class="world-modal-btn danger full-width" id="btn-clear-world-cache">Clear Chunk Cache</button>
                <p style="font-size: 11px; color: #666; margin: 8px 0 0 0;">Removes cached chunks for this world only. World can be regenerated from seed.</p>
            </div>
        </div>
    `;
    wrapper.appendChild(worldManageModal);

    let selectedWorld = null;
    let currentManagedWorld = null;

    const loadButton = seedMenu.querySelector('#btn-load-start');
    const savedWorldsContainer = seedMenu.querySelector('#saved-worlds-container');

    const updateWorldSelection = (name) => {
        selectedWorld = name;
        savedWorldsContainer.querySelectorAll('.world-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.save === name);
        });
        if (loadButton) loadButton.disabled = !name;
    };

    const openCreateWorld = () => {
        seedMenu.style.display = 'none';
        createWorldPanel.style.display = 'block';
    };

    const closeCreateWorld = () => {
        createWorldPanel.style.display = 'none';
        seedMenu.style.display = 'block';
    };

    const openWorldManageModal = async (worldName) => {
        currentManagedWorld = worldName;
        const titleEl = worldManageModal.querySelector('#world-modal-title');
        const renameInput = worldManageModal.querySelector('#world-rename-input');
        const duplicateInput = worldManageModal.querySelector('#world-duplicate-input');

        if (titleEl) titleEl.textContent = `Manage: ${worldName}`;
        if (renameInput) renameInput.value = worldName;
        if (duplicateInput) duplicateInput.value = `${worldName} Copy`;

        if (callbacks.onWorldStorageInfo) {
            const info = await callbacks.onWorldStorageInfo(worldName);
            updateWorldStorageInfo(info);
        }

        worldManageModal.classList.add('show');
    };

    const closeWorldManageModal = () => {
        currentManagedWorld = null;
        worldManageModal.classList.remove('show');
    };

    const updateWorldStorageInfo = (info) => {
        if (!info) return;
        const STORAGE_LIMIT = 50 * 1024 * 1024;
        const percent = Math.min((info.totalBytes / STORAGE_LIMIT) * 100, 100);
        const barEl = worldManageModal.querySelector('#world-storage-bar');
        const usedEl = worldManageModal.querySelector('#world-storage-used');
        const metaSizeEl = worldManageModal.querySelector('#world-meta-size');
        const chunksSizeEl = worldManageModal.querySelector('#world-chunks-size');
        const chunksCountEl = worldManageModal.querySelector('#world-chunks-count');

        if (barEl) {
            barEl.style.width = `${percent}%`;
            barEl.className = 'storage-bar-fill';
            if (percent > 80) barEl.classList.add('danger');
            else if (percent > 50) barEl.classList.add('warning');
        }
        if (usedEl) usedEl.textContent = formatBytes(info.totalBytes);
        if (metaSizeEl) metaSizeEl.textContent = formatBytes(info.metaBytes);
        if (chunksSizeEl) chunksSizeEl.textContent = formatBytes(info.chunkBytes);
        if (chunksCountEl) chunksCountEl.textContent = info.chunkCount.toString();
    };

    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const formatBytes = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    seedMenu.querySelector('#btn-create-world')?.addEventListener('click', openCreateWorld);
    seedMenu.querySelector('#btn-settings-main')?.addEventListener('click', callbacks.onSettings);
    seedMenu.querySelector('#btn-load-start')?.addEventListener('click', () => {
        if (selectedWorld) {
            callbacks.onLoadWorld(selectedWorld);
        }
    });

    createWorldPanel.querySelector('#btn-back-create-world')?.addEventListener('click', closeCreateWorld);
    createWorldPanel.querySelector('#btn-start-new-world')?.addEventListener('click', () => {
        const nameInput = createWorldPanel.querySelector('#world-name-input');
        const seedInput = createWorldPanel.querySelector('#new-seed-input');
        const name = nameInput?.value?.trim() || 'New World';
        const seed = seedInput?.value?.trim() || String(Math.floor(Math.random() * 999999999));
        callbacks.onNewWorld({ name, seed });
        closeCreateWorld();
    });

    createWorldPanel.querySelector('#btn-random-seed')?.addEventListener('click', () => {
        const seedInput = createWorldPanel.querySelector('#new-seed-input');
        if (seedInput) seedInput.value = Math.floor(Math.random() * 1000000).toString();
    });

    createWorldPanel.querySelector('#btn-copy-seed')?.addEventListener('click', async () => {
        const seedInput = createWorldPanel.querySelector('#new-seed-input');
        if (!seedInput) return;
        const seedValue = seedInput.value.trim();
        if (!seedValue) return;
        try {
            await navigator.clipboard.writeText(seedValue);
        } catch (error) {
            console.warn('[MainMenu] Failed to copy seed:', error);
        }
    });

    worldManageModal.querySelector('#world-modal-close')?.addEventListener('click', closeWorldManageModal);
    worldManageModal.addEventListener('click', (event) => {
        if (event.target.id === 'world-manage-modal') closeWorldManageModal();
    });

    worldManageModal.querySelector('#btn-rename-world')?.addEventListener('click', async () => {
        const input = worldManageModal.querySelector('#world-rename-input');
        if (currentManagedWorld && input && callbacks.onRenameWorld) {
            const success = await callbacks.onRenameWorld(currentManagedWorld, input.value);
            if (success) closeWorldManageModal();
        }
    });

    worldManageModal.querySelector('#btn-duplicate-world')?.addEventListener('click', async () => {
        const input = worldManageModal.querySelector('#world-duplicate-input');
        if (currentManagedWorld && input && callbacks.onDuplicateWorld) {
            const success = await callbacks.onDuplicateWorld(currentManagedWorld, input.value);
            if (success) closeWorldManageModal();
        }
    });

    worldManageModal.querySelector('#btn-clear-world-cache')?.addEventListener('click', async () => {
        if (currentManagedWorld && callbacks.onClearWorldCache) {
            await callbacks.onClearWorldCache(currentManagedWorld);
            if (callbacks.onWorldStorageInfo) {
                const info = await callbacks.onWorldStorageInfo(currentManagedWorld);
                updateWorldStorageInfo(info);
            }
        }
    });

    worldManageModal.querySelector('#btn-export-world')?.addEventListener('click', async () => {
        if (!currentManagedWorld || !callbacks.onExportWorld) return;
        const blob = await callbacks.onExportWorld(currentManagedWorld);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentManagedWorld.replace(/[^a-z0-9]/gi, '_')}.voxworld`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    worldManageModal.querySelector('#btn-import-world')?.addEventListener('click', () => {
        worldManageModal.querySelector('#world-import-input')?.click();
    });

    worldManageModal.querySelector('#world-import-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (file && callbacks.onImportWorld) {
            await callbacks.onImportWorld(file);
            event.target.value = '';
        }
    });

    wrapper.updateWorldCards = (worlds, totalBytes = 0) => {
        if (!savedWorldsContainer) return;
        savedWorldsContainer.innerHTML = '';
        if (!worlds || worlds.length === 0) {
            savedWorldsContainer.innerHTML = '<div class="no-saves-message">No saved worlds yet.<br>Create a new world to get started!</div>';
            updateWorldSelection(null);
            return;
        }

        worlds.forEach((world) => {
            const metadata = world.metadata || {};
            const card = document.createElement('div');
            card.className = 'world-card';
            card.dataset.save = world.name;

            const date = new Date(metadata.timestamp || Date.now());
            const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            const sizeStr = formatBytes(world.metaBytes || 0);
            const thumbHtml = metadata.thumbnail
                ? `<img src="${metadata.thumbnail}" alt="World preview" />`
                : '<span class="no-thumb">🌍</span>';

            card.innerHTML = `
                <div class="world-card-thumbnail">${thumbHtml}</div>
                <div class="world-card-content">
                    <div class="world-card-info">
                        <div class="world-card-name">${escapeHtml(world.name)}</div>
                        <div class="world-card-meta">Seed: ${metadata.seed || '???'} • ${dateStr}<span class="world-card-size">${sizeStr}</span></div>
                    </div>
                    <div class="world-card-actions">
                        <button class="world-card-btn manage" data-save="${escapeHtml(world.name)}" title="Manage">⚙️</button>
                        <button class="world-card-btn delete" data-save="${escapeHtml(world.name)}" title="Delete">🗑️</button>
                    </div>
                </div>
            `;

            card.addEventListener('click', (event) => {
                if (event.target.classList.contains('delete') || event.target.classList.contains('manage')) return;
                updateWorldSelection(world.name);
            });

            card.querySelector('.delete')?.addEventListener('click', async (event) => {
                event.stopPropagation();
                if (callbacks.onDeleteWorld) {
                    await callbacks.onDeleteWorld(world.name);
                }
            });

            card.querySelector('.manage')?.addEventListener('click', (event) => {
                event.stopPropagation();
                openWorldManageModal(world.name);
            });

            savedWorldsContainer.appendChild(card);
        });

        if (selectedWorld) {
            if (!worlds.find(world => world.name === selectedWorld)) {
                updateWorldSelection(null);
            } else {
                updateWorldSelection(selectedWorld);
            }
        }

        wrapper.updateTotalStorage(totalBytes);
    };

    wrapper.updateTotalStorage = (totalBytes) => {
        const totalDisplay = seedMenu.querySelector('#total-storage-display');
        if (!totalDisplay) return;
        const LIMIT = 50 * 1024 * 1024;
        const percent = ((totalBytes / LIMIT) * 100).toFixed(1);
        let colorStyle = '';
        if (totalBytes > LIMIT * 0.8) colorStyle = 'color: #f44336;';
        else if (totalBytes > LIMIT * 0.5) colorStyle = 'color: #ff9800;';
        totalDisplay.innerHTML = `<span style="${colorStyle}">${formatBytes(totalBytes)}</span> <span style="color: #666;">(${percent}% of ~50MB)</span>`;
    };

    wrapper.getSelectedWorld = () => selectedWorld;
    wrapper.setSelectedWorld = (name) => updateWorldSelection(name);
    wrapper.setCreateWorldVisible = (visible) => {
        if (visible) {
            openCreateWorld();
        } else {
            closeCreateWorld();
        }
    };

    return wrapper;
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
        width: 100%;
        padding: 12px;
        font-size: 18px;
        background: #333;
        border: 1px solid #555;
        color: white;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
    `;
    button.addEventListener('mouseenter', () => {
        button.style.background = '#4caf50';
        button.style.borderColor = '#4caf50';
        button.style.transform = 'scale(1.02)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.background = '#333';
        button.style.borderColor = '#555';
        button.style.transform = 'scale(1)';
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
    menu.style.display = visible ? 'block' : 'none';
}

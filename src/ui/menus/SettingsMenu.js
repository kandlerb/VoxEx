/**
 * Settings menu with panels that mirror the voxEx.html structure.
 * @module ui/menus/SettingsMenu
 */

const SETTINGS_MENU_TEMPLATE = `
    <!-- Settings Menu - Main Categories -->
    <div id="settings-menu" class="settings-panel" style="display: none">
        <h1>Settings</h1>
        <div id="settings-search-container">
            <input type="text" id="settings-search" placeholder="🔍 Search settings..." />
            <div id="settings-search-results" class="settings-search-results" style="display: none;"></div>
        </div>
        <div id="settings-profiles">
            <div id="settings-profiles-label">Quick Profiles</div>
            <div class="profile-grid">
                <button class="profile-btn" data-profile="performance">⚡ Perf</button>
                <button class="profile-btn" data-profile="balanced">⚖️ Balanced</button>
                <button class="profile-btn" data-profile="quality">✨ Quality</button>
                <button class="profile-btn custom" data-profile="custom">🔧 Custom</button>
            </div>
        </div>
        <button class="menu-btn category-btn" id="btn-settings-performance">Performance</button>
        <button class="menu-btn category-btn" id="btn-settings-graphics">Graphics</button>
        <button class="menu-btn category-btn" id="btn-settings-gameplay">Gameplay</button>
        <button class="menu-btn category-btn" id="btn-settings-world">World</button>
        <button class="menu-btn" id="btn-save-custom-profile" style="margin-top: 15px; background: #aa8800; border-color: #ccaa00">Save as Custom Profile</button>
        <button class="menu-btn" id="btn-reset-all" style="background: #884400; border-color: #aa5500">Reset All to Default</button>
        <button class="menu-btn" id="btn-back-from-settings">Back</button>
    </div>
    <!-- Performance Hub -->
    <div id="settings-performance" class="settings-panel" style="display: none">
        <h1>Performance</h1>
        <button class="menu-btn category-btn" id="btn-performance-rendering">Rendering</button>
        <button class="menu-btn category-btn" id="btn-performance-streaming">Streaming</button>
        <button class="menu-btn" id="btn-back-from-performance" style="margin-top: 20px">Back</button>
    </div>
    <!-- Performance > Rendering -->
    <div id="settings-performance-rendering" class="settings-panel" style="display: none">
        <h1>Performance › Rendering</h1>
        <div class="setting-item">
            <label for="dynamic-dist-toggle">Dynamic Render Distance</label>
            <input type="checkbox" id="dynamic-dist-toggle" />
        </div>
        <div class="setting-item">
            <label for="render-dist-slider">Render Distance: <span id="render-dist-val">8</span></label>
            <input type="range" id="render-dist-slider" min="2" max="32" step="1" />
        </div>
        <div class="setting-item">
            <label for="frustum-culling-toggle">Frustum Culling</label>
            <input type="checkbox" id="frustum-culling-toggle" />
        </div>
        <div class="setting-item">
            <label for="lower-fps-slider">Min FPS Threshold: <span id="lower-fps-val">30</span></label>
            <input type="range" id="lower-fps-slider" min="20" max="60" step="5" />
        </div>
        <div class="setting-item">
            <label for="upper-fps-slider">Max FPS Threshold: <span id="upper-fps-val">50</span></label>
            <input type="range" id="upper-fps-slider" min="40" max="120" step="5" />
        </div>
        <div class="setting-item">
            <label for="pixel-ratio-slider">Pixel Ratio: <span id="pixel-ratio-val">1.0</span>x</label>
            <input type="range" id="pixel-ratio-slider" min="0.5" max="2.0" step="0.1" value="1.0" />
        </div>
        <button class="menu-btn" id="btn-reset-performance-rendering" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-performance-rendering">Back</button>
    </div>
    <!-- Performance > Streaming -->
    <div id="settings-performance-streaming" class="settings-panel" style="display: none">
        <h1>Performance › Streaming</h1>
        <div class="setting-item">
            <label for="build-queue-slider">Build Queue Limit: <span id="build-queue-val">8</span></label>
            <input type="range" id="build-queue-slider" min="1" max="32" step="1" />
        </div>
        <div class="setting-item">
            <label for="pregen-dist-slider">Pre-gen Distance: <span id="pregen-dist-val">16</span></label>
            <input type="range" id="pregen-dist-slider" min="8" max="32" step="4" />
        </div>
        <div class="setting-item">
            <label for="max-chunks-slider">Max Cached Chunks: <span id="max-chunks-val">350</span></label>
            <input type="range" id="max-chunks-slider" min="100" max="1000" step="50" />
        </div>
        <div class="setting-item">
            <button id="clear-cache-btn" style="padding: 8px 16px; cursor: pointer">Clear World Cache</button>
            <span id="cache-size" style="margin-left: 10px; font-size: 12px"></span>
        </div>
        <button class="menu-btn" id="btn-reset-performance-streaming" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-performance-streaming">Back</button>
    </div>
    <!-- Graphics Settings -->
    <div id="settings-graphics" class="settings-panel" style="display: none">
        <h1>Graphics</h1>
        <button class="menu-btn category-btn" id="btn-graphics-visual">Visual</button>
        <button class="menu-btn category-btn" id="btn-graphics-lighting">Lighting</button>
        <button class="menu-btn category-btn" id="btn-graphics-water">Water</button>
        <button class="menu-btn category-btn" id="btn-graphics-effects">Effects</button>
        <button class="menu-btn" id="btn-back-from-graphics" style="margin-top: 20px">Back</button>
    </div>
    <!-- Graphics > Visual -->
    <div id="settings-graphics-visual" class="settings-panel" style="display: none">
        <h1>Graphics › Visual</h1>
        <div class="setting-item">
            <label for="ao-toggle">Ambient Occlusion</label>
            <input type="checkbox" id="ao-toggle" />
        </div>
        <div class="setting-item">
            <label for="texture-res-select">Texture Resolution</label>
            <select id="texture-res-select">
                <option value="16">16x (Performance)</option>
                <option value="32">32x (Balanced)</option>
                <option value="64">64x (Quality)</option>
            </select>
        </div>
        <div class="setting-item">
            <label for="antialiasing-toggle">Antialiasing (requires reload)</label>
            <input type="checkbox" id="antialiasing-toggle" />
        </div>
        <p id="reload-notice" style="color: #ffcc00; display: none; font-size: 12px">Resolution or AA changes require a reload to apply.</p>
        <button class="menu-btn" id="btn-reset-graphics-visual" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-graphics-visual">Back</button>
    </div>
    <!-- Graphics > Lighting -->
    <div id="settings-graphics-lighting" class="settings-panel" style="display: none">
        <h1>Graphics › Lighting</h1>
        <div class="setting-item">
            <label for="shadows-toggle">Shadows</label>
            <input type="checkbox" id="shadows-toggle" />
        </div>
        <div class="setting-item">
            <label for="shadow-quality-select">Shadow Quality</label>
            <select id="shadow-quality-select">
                <option value="512">Low (512px)</option>
                <option value="1024">Medium (1024px)</option>
                <option value="2048">High (2048px)</option>
                <option value="4096">Ultra (4096px)</option>
            </select>
        </div>
        <div class="setting-item">
            <label for="shadow-bias-input">Shadow Bias (default: 0.0001, range: 0-0.001)</label>
            <input type="text" id="shadow-bias-input" value="0.0001" />
        </div>
        <div class="setting-item">
            <label for="shadow-radius-input">Shadow Softness (default: 0, range: 0-2)</label>
            <input type="text" id="shadow-radius-input" value="0" />
        </div>
        <div class="settings-group" data-group="sun">
            <div class="settings-group-header collapsed" data-group-toggle="sun">
                <span>Sun</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="sun-color">Sunlight Color</label>
                    <input type="color" id="sun-color" />
                </div>
                <div class="setting-item">
                    <label for="sun-intensity-input">Sunlight Intensity (default: 0.8, range: 0.1-3.0)</label>
                    <input type="text" id="sun-intensity-input" value="0.8" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="moon">
            <div class="settings-group-header collapsed" data-group-toggle="moon">
                <span>Moon</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="moon-color">Moonlight Color</label>
                    <input type="color" id="moon-color" />
                </div>
                <div class="setting-item">
                    <label for="moon-intensity-input">Moonlight Intensity (default: 0.15, range: 0-2.0)</label>
                    <input type="text" id="moon-intensity-input" value="0.15" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="torch">
            <div class="settings-group-header collapsed" data-group-toggle="torch">
                <span>Torch</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="torch-color">Torch Color</label>
                    <input type="color" id="torch-color" />
                </div>
                <div class="setting-item">
                    <label for="torch-intensity-input">Torch Intensity (default: 3.0, range: 0.2-4.0)</label>
                    <input type="text" id="torch-intensity-input" value="3.0" />
                </div>
                <div class="setting-item">
                    <label for="torch-range-input">Torch Range (default: 48, range: 5-100)</label>
                    <input type="text" id="torch-range-input" value="48" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="ambient">
            <div class="settings-group-header collapsed" data-group-toggle="ambient">
                <span>Ambient</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="ambient-intensity-input">Ambient Intensity (default: 1, range: 0-2.0)</label>
                    <input type="text" id="ambient-intensity-input" value="1" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="volumetric">
            <div class="settings-group-header collapsed" data-group-toggle="volumetric">
                <span>Volumetric Lighting</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="volumetric-toggle">Enable Volumetric Lighting</label>
                    <input type="checkbox" id="volumetric-toggle" />
                </div>
                <div class="setting-item">
                    <label for="volumetric-density-input">Density (default: 0.8, range: 0-2.0)</label>
                    <input type="text" id="volumetric-density-input" value="0.8" />
                </div>
                <div class="setting-item">
                    <label for="volumetric-decay-input">Decay (default: 0.95, range: 0.8-1.0)</label>
                    <input type="text" id="volumetric-decay-input" value="0.95" />
                </div>
                <div class="setting-item">
                    <label for="volumetric-weight-input">Weight (default: 0.4, range: 0-1.0)</label>
                    <input type="text" id="volumetric-weight-input" value="0.4" />
                </div>
                <div class="setting-item">
                    <label for="volumetric-samples-input">Samples (default: 50, range: 10-100)</label>
                    <input type="text" id="volumetric-samples-input" value="50" />
                </div>
                <div class="setting-item">
                    <label for="volumetric-exposure-input">Exposure (default: 0.8, range: 0.1-2.0)</label>
                    <input type="text" id="volumetric-exposure-input" value="0.8" />
                </div>
                <div class="setting-item">
                    <label for="volumetric-fog-density-input">Fog Density (default: 0.05, range: 0-0.2)</label>
                    <input type="text" id="volumetric-fog-density-input" value="0.05" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="atmospheric-fog">
            <div class="settings-group-header collapsed" data-group-toggle="atmospheric-fog">
                <span>Atmospheric Fog</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="fog-toggle">Enable Fog</label>
                    <input type="checkbox" id="fog-toggle" />
                </div>
                <div class="setting-item">
                    <label for="fog-density-input">Fog Density (default: 0.003, range: 0-0.02)</label>
                    <input type="text" id="fog-density-input" value="0.003" />
                </div>
                <div class="setting-item">
                    <label for="fog-sky-match-toggle">Match Fog to Sky</label>
                    <input type="checkbox" id="fog-sky-match-toggle" checked />
                </div>
                <div class="setting-item">
                    <label for="fog-distance-input">Fog Distance (default: 350, range: 50-1000)</label>
                    <input type="text" id="fog-distance-input" value="350" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="global-illumination">
            <div class="settings-group-header collapsed" data-group-toggle="global-illumination">
                <span>Global Illumination</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="gi-toggle">Enable GI</label>
                    <input type="checkbox" id="gi-toggle" />
                </div>
                <div class="setting-item">
                    <label for="gi-intensity-input">Intensity (default: 0.4, range: 0-2.0)</label>
                    <input type="text" id="gi-intensity-input" value="0.4" />
                </div>
                <div class="setting-item">
                    <label for="gi-bounce-intensity-input">Bounce Intensity (default: 0.6, range: 0-2.0)</label>
                    <input type="text" id="gi-bounce-intensity-input" value="0.6" />
                </div>
                <div class="setting-item">
                    <label for="gi-range-input">Range (default: 4, range: 0-16)</label>
                    <input type="text" id="gi-range-input" value="4" />
                </div>
                <div class="setting-item">
                    <label for="gi-color-bleed-input">Color Bleed (default: 0.3, range: 0-1.0)</label>
                    <input type="text" id="gi-color-bleed-input" value="0.3" />
                </div>
                <div class="setting-item">
                    <label for="gi-samples-input">Samples (default: 8, range: 1-32)</label>
                    <input type="text" id="gi-samples-input" value="8" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="diffuse-lighting">
            <div class="settings-group-header collapsed" data-group-toggle="diffuse-lighting">
                <span>Diffuse Lighting</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="diffuse-intensity-input">Intensity (default: 1.0, range: 0-3.0)</label>
                    <input type="text" id="diffuse-intensity-input" value="1.0" />
                </div>
                <div class="setting-item">
                    <label for="diffuse-wrap-input">Wrap (default: 0.2, range: 0-1.0)</label>
                    <input type="text" id="diffuse-wrap-input" value="0.2" />
                </div>
                <div class="setting-item">
                    <label for="diffuse-softness-input">Softness (default: 0.4, range: 0-1.0)</label>
                    <input type="text" id="diffuse-softness-input" value="0.4" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="specular-lighting">
            <div class="settings-group-header collapsed" data-group-toggle="specular-lighting">
                <span>Specular Lighting</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="specular-intensity-input">Intensity (default: 0.2, range: 0-1.0)</label>
                    <input type="text" id="specular-intensity-input" value="0.2" />
                </div>
                <div class="setting-item">
                    <label for="specular-shininess-input">Shininess (default: 50, range: 10-200)</label>
                    <input type="text" id="specular-shininess-input" value="50" />
                </div>
                <div class="setting-item">
                    <label for="specular-fresnel-input">Fresnel (default: 0.04, range: 0-1.0)</label>
                    <input type="text" id="specular-fresnel-input" value="0.04" />
                </div>
                <div class="setting-item">
                    <label for="specular-roughness-input">Roughness (default: 0.7, range: 0-1.0)</label>
                    <input type="text" id="specular-roughness-input" value="0.7" />
                </div>
            </div>
        </div>
        <button class="menu-btn" id="btn-reset-graphics-lighting" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset Lighting</button>
        <button class="menu-btn" id="btn-back-from-graphics-lighting">Back</button>
    </div>
    <!-- Graphics > Water -->
    <div id="settings-graphics-water" class="settings-panel" style="display: none">
        <h1>Graphics › Water</h1>
        <div class="settings-group" data-group="water-basic">
            <div class="settings-group-header collapsed" data-group-toggle="water-basic">
                <span>Basic</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-fast-toggle">Fast Water</label>
                    <input type="checkbox" id="water-fast-toggle" />
                </div>
                <div class="setting-item">
                    <label for="water-color">Water Color</label>
                    <input type="color" id="water-color" />
                </div>
                <div class="setting-item">
                    <label for="water-opacity-slider">Opacity: <span id="water-opacity-val">0.7</span></label>
                    <input type="range" id="water-opacity-slider" min="0.1" max="1.0" step="0.05" value="0.7" />
                </div>
                <div class="setting-item">
                    <label for="water-fog-slider">Fog Density: <span id="water-fog-val">0.02</span></label>
                    <input type="range" id="water-fog-slider" min="0" max="0.2" step="0.01" value="0.02" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="water-absorption">
            <div class="settings-group-header collapsed" data-group-toggle="water-absorption">
                <span>Absorption</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-absorption-r-slider">Absorb R: <span id="water-absorption-r-val">0.4</span></label>
                    <input type="range" id="water-absorption-r-slider" min="0" max="1.0" step="0.05" value="0.4" />
                </div>
                <div class="setting-item">
                    <label for="water-absorption-g-slider">Absorb G: <span id="water-absorption-g-val">0.6</span></label>
                    <input type="range" id="water-absorption-g-slider" min="0" max="1.0" step="0.05" value="0.6" />
                </div>
                <div class="setting-item">
                    <label for="water-absorption-b-slider">Absorb B: <span id="water-absorption-b-val">0.8</span></label>
                    <input type="range" id="water-absorption-b-slider" min="0" max="1.0" step="0.05" value="0.8" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="water-refraction">
            <div class="settings-group-header collapsed" data-group-toggle="water-refraction">
                <span>Refraction</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-refraction-toggle">Enable Refraction</label>
                    <input type="checkbox" id="water-refraction-toggle" />
                </div>
                <div class="setting-item">
                    <label for="water-refraction-strength-slider">Strength: <span id="water-refraction-strength-val">0.15</span></label>
                    <input type="range" id="water-refraction-strength-slider" min="0" max="0.6" step="0.05" value="0.15" />
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="water-ripples">
            <div class="settings-group-header collapsed" data-group-toggle="water-ripples">
                <span>Ripples</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-ripple-toggle">Enable Ripples</label>
                    <input type="checkbox" id="water-ripple-toggle" />
                </div>
                <div class="setting-item">
                    <label for="water-ripple-speed">Ripple Speed</label>
                    <input type="number" id="water-ripple-speed" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.15, Range: 0.01-1.0</span>
                </div>
                <div class="setting-item">
                    <label for="water-ripple-density">Ripple Density</label>
                    <input type="number" id="water-ripple-density" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.4, Range: 0.1-2.0</span>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="water-wading">
            <div class="settings-group-header collapsed" data-group-toggle="water-wading">
                <span>Wading</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-wading-toggle">Enable Wading FX</label>
                    <input type="checkbox" id="water-wading-toggle" />
                </div>
                <div class="setting-item">
                    <label for="water-wading-amplitude">Wade Amplitude</label>
                    <input type="number" id="water-wading-amplitude" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.6, Range: 0.1-2.0</span>
                </div>
                <div class="setting-item">
                    <label for="water-wading-frequency">Wade Frequency</label>
                    <input type="number" id="water-wading-frequency" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 1.6, Range: 0.1-5.0</span>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="water-splash">
            <div class="settings-group-header collapsed" data-group-toggle="water-splash">
                <span>Splash Particles</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-splash-toggle">Enable Splashes</label>
                    <input type="checkbox" id="water-splash-toggle" />
                </div>
                <div class="setting-item">
                    <label for="water-splash-count">Particle Count</label>
                    <input type="number" id="water-splash-count" step="1" style="width: 80px;" />
                    <span class="hint-text">Default: 12, Range: 1-50</span>
                </div>
                <div class="setting-item">
                    <label for="water-splash-size">Particle Size</label>
                    <input type="number" id="water-splash-size" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.25, Range: 0.05-2.0</span>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="water-bubbles">
            <div class="settings-group-header collapsed" data-group-toggle="water-bubbles">
                <span>Bubble FX</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-bubbles-toggle">Enable Bubbles</label>
                    <input type="checkbox" id="water-bubbles-toggle" />
                </div>
                <div class="setting-item">
                    <label for="water-bubbles-count">Bubble Count</label>
                    <input type="number" id="water-bubbles-count" step="1" style="width: 80px;" />
                    <span class="hint-text">Default: 10, Range: 1-50</span>
                </div>
                <div class="setting-item">
                    <label for="water-bubbles-size">Bubble Size</label>
                    <input type="number" id="water-bubbles-size" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.15, Range: 0.05-2.0</span>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="water-wake">
            <div class="settings-group-header collapsed" data-group-toggle="water-wake">
                <span>Wake Trails</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="water-wake-toggle">Enable Wakes</label>
                    <input type="checkbox" id="water-wake-toggle" />
                </div>
                <div class="setting-item">
                    <label for="water-wake-opacity">Wake Opacity</label>
                    <input type="number" id="water-wake-opacity" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.2, Range: 0.05-1.0</span>
                </div>
                <div class="setting-item">
                    <label for="water-wake-duration">Wake Duration</label>
                    <input type="number" id="water-wake-duration" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 1.2, Range: 0.2-6.0</span>
                </div>
            </div>
        </div>
        <button class="menu-btn" id="btn-reset-graphics-water" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-graphics-water">Back</button>
    </div>
    <!-- Graphics > Effects -->
    <div id="settings-graphics-effects" class="settings-panel" style="display: none">
        <h1>Graphics › Effects</h1>
        <div class="settings-group" data-group="torch-particles">
            <div class="settings-group-header collapsed" data-group-toggle="torch-particles">
                <span>Torch Particles</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="torch-particles-toggle">Enable Torch Particles</label>
                    <input type="checkbox" id="torch-particles-toggle" />
                </div>
                <div class="setting-item">
                    <label for="torch-particles-count">Particle Count</label>
                    <input type="number" id="torch-particles-count" step="1" style="width: 80px;" />
                    <span class="hint-text">Default: 24, Range: 1-100</span>
                </div>
                <div class="setting-item">
                    <label for="torch-particles-size">Particle Size</label>
                    <input type="number" id="torch-particles-size" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.2, Range: 0.05-2.0</span>
                </div>
                <div class="setting-item">
                    <label for="torch-particles-rise">Rise Speed</label>
                    <input type="number" id="torch-particles-rise" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.4, Range: 0.1-3.0</span>
                </div>
                <div class="setting-item">
                    <label for="torch-particles-spread">Spread</label>
                    <input type="number" id="torch-particles-spread" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.6, Range: 0.1-5.0</span>
                </div>
                <div class="settings-group" data-group="torch-smoke" style="margin-left: 8px;">
                    <div class="settings-group-header collapsed" data-group-toggle="torch-smoke">
                        <span>Smoke</span><span class="chevron">⌄</span>
                    </div>
                    <div class="settings-group-content collapsed">
                        <div class="setting-item">
                            <label for="torch-smoke-toggle">Enable Smoke</label>
                            <input type="checkbox" id="torch-smoke-toggle" />
                        </div>
                        <div class="setting-item">
                            <label for="torch-smoke-count">Smoke Count</label>
                            <input type="number" id="torch-smoke-count" step="1" style="width: 80px;" />
                            <span class="hint-text">Default: 6, Range: 1-30</span>
                        </div>
                        <div class="setting-item">
                            <label for="torch-smoke-size">Smoke Size</label>
                            <input type="number" id="torch-smoke-size" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 0.6, Range: 0.1-3.0</span>
                        </div>
                        <div class="setting-item">
                            <label for="torch-smoke-rise">Smoke Rise</label>
                            <input type="number" id="torch-smoke-rise" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 0.2, Range: 0.05-2.0</span>
                        </div>
                    </div>
                </div>
                <div class="settings-group" data-group="torch-flame" style="margin-left: 8px;">
                    <div class="settings-group-header collapsed" data-group-toggle="torch-flame">
                        <span>Flame</span><span class="chevron">⌄</span>
                    </div>
                    <div class="settings-group-content collapsed">
                        <div class="setting-item">
                            <label for="torch-flame-toggle">Enable Flame</label>
                            <input type="checkbox" id="torch-flame-toggle" />
                        </div>
                        <div class="setting-item">
                            <label for="torch-flame-count">Flame Count</label>
                            <input type="number" id="torch-flame-count" step="1" style="width: 80px;" />
                            <span class="hint-text">Default: 12, Range: 1-50</span>
                        </div>
                        <div class="setting-item">
                            <label for="torch-flame-size">Flame Size</label>
                            <input type="number" id="torch-flame-size" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 0.3, Range: 0.05-1.5</span>
                        </div>
                        <div class="setting-item">
                            <label for="torch-flame-flicker">Flicker Speed</label>
                            <input type="number" id="torch-flame-flicker" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 2.0, Range: 0.1-10.0</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="block-break-particles">
            <div class="settings-group-header collapsed" data-group-toggle="block-break-particles">
                <span>Block Break Particles</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="block-break-toggle">Enable Block Break Particles</label>
                    <input type="checkbox" id="block-break-toggle" />
                </div>
                <div class="setting-item">
                    <label for="block-break-count">Particle Count</label>
                    <input type="number" id="block-break-count" step="1" style="width: 80px;" />
                    <span class="hint-text">Default: 18, Range: 1-80</span>
                </div>
                <div class="setting-item">
                    <label for="block-break-size">Particle Size</label>
                    <input type="number" id="block-break-size" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.2, Range: 0.05-1.5</span>
                </div>
                <div class="setting-item">
                    <label for="block-break-spread">Spread</label>
                    <input type="number" id="block-break-spread" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.8, Range: 0.1-4.0</span>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="footstep-particles">
            <div class="settings-group-header collapsed" data-group-toggle="footstep-particles">
                <span>Footstep Particles</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="footstep-toggle">Enable Footstep Particles</label>
                    <input type="checkbox" id="footstep-toggle" />
                </div>
                <div class="setting-item">
                    <label for="footstep-count">Particle Count</label>
                    <input type="number" id="footstep-count" step="1" style="width: 80px;" />
                    <span class="hint-text">Default: 6, Range: 1-40</span>
                </div>
                <div class="setting-item">
                    <label for="footstep-size">Particle Size</label>
                    <input type="number" id="footstep-size" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.2, Range: 0.05-1.5</span>
                </div>
                <div class="setting-item">
                    <label for="footstep-spread">Spread</label>
                    <input type="number" id="footstep-spread" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.5, Range: 0.1-2.0</span>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="stars">
            <div class="settings-group-header collapsed" data-group-toggle="stars">
                <span>Stars</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="stars-toggle">Enable Stars</label>
                    <input type="checkbox" id="stars-toggle" />
                </div>
                <div class="setting-item">
                    <label for="stars-base-density">Base Density</label>
                    <input type="number" id="stars-base-density" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 1.0, Range: 0.1-5.0</span>
                </div>
                <div class="settings-group" data-group="star-layer1" style="margin-left: 8px;">
                    <div class="settings-group-header collapsed" data-group-toggle="star-layer1">
                        <span>Layer 1</span><span class="chevron">⌄</span>
                    </div>
                    <div class="settings-group-content collapsed" id="star-layer1-settings">
                        <div class="setting-item">
                            <label for="star-layer1-density">Density</label>
                            <input type="number" id="star-layer1-density" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 1.0, Range: 0.1-5.0</span>
                        </div>
                        <div class="setting-item">
                            <label for="star-layer1-size">Size</label>
                            <input type="number" id="star-layer1-size" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 1.0, Range: 0.2-3.0</span>
                        </div>
                        <div class="setting-item">
                            <label for="star-layer1-brightness">Brightness</label>
                            <input type="number" id="star-layer1-brightness" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 1.0, Range: 0.2-4.0</span>
                        </div>
                    </div>
                </div>
                <div class="settings-group" data-group="star-layer2" style="margin-left: 8px;">
                    <div class="settings-group-header collapsed" data-group-toggle="star-layer2">
                        <span>Layer 2</span><span class="chevron">⌄</span>
                    </div>
                    <div class="settings-group-content collapsed" id="star-layer2-settings">
                        <div class="setting-item">
                            <label for="star-layer2-density">Density</label>
                            <input type="number" id="star-layer2-density" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 0.6, Range: 0.1-5.0</span>
                        </div>
                        <div class="setting-item">
                            <label for="star-layer2-size">Size</label>
                            <input type="number" id="star-layer2-size" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 1.5, Range: 0.2-4.0</span>
                        </div>
                        <div class="setting-item">
                            <label for="star-layer2-brightness">Brightness</label>
                            <input type="number" id="star-layer2-brightness" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 0.8, Range: 0.2-4.0</span>
                        </div>
                    </div>
                </div>
                <div class="settings-group" data-group="star-layer3" style="margin-left: 8px;">
                    <div class="settings-group-header collapsed" data-group-toggle="star-layer3">
                        <span>Layer 3</span><span class="chevron">⌄</span>
                    </div>
                    <div class="settings-group-content collapsed" id="star-layer3-settings">
                        <div class="setting-item">
                            <label for="star-layer3-density">Density</label>
                            <input type="number" id="star-layer3-density" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 0.4, Range: 0.1-5.0</span>
                        </div>
                        <div class="setting-item">
                            <label for="star-layer3-size">Size</label>
                            <input type="number" id="star-layer3-size" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 2.0, Range: 0.2-5.0</span>
                        </div>
                        <div class="setting-item">
                            <label for="star-layer3-brightness">Brightness</label>
                            <input type="number" id="star-layer3-brightness" step="0.1" style="width: 80px;" />
                            <span class="hint-text">Default: 0.6, Range: 0.2-4.0</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="settings-group" data-group="clouds">
            <div class="settings-group-header collapsed" data-group-toggle="clouds">
                <span>Clouds</span><span class="chevron">⌄</span>
            </div>
            <div class="settings-group-content collapsed">
                <div class="setting-item">
                    <label for="clouds-toggle">Enable Clouds</label>
                    <input type="checkbox" id="clouds-toggle" />
                </div>
                <div class="setting-item">
                    <label for="cloud-speed-input">Speed</label>
                    <input type="number" id="cloud-speed-input" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 0.2, Range: 0.01-2.0</span>
                </div>
                <div class="setting-item">
                    <label for="cloud-density-input">Density</label>
                    <input type="number" id="cloud-density-input" step="0.1" style="width: 80px;" />
                    <span class="hint-text">Default: 1.0, Range: 0.1-5.0</span>
                </div>
                <div class="setting-item">
                    <label for="cloud-particle-size-input">Particle Size</label>
                    <input type="number" id="cloud-particle-size-input" step="1" style="width: 80px;" />
                    <span class="hint-text">Default: 8, Range: 2-30</span>
                </div>
            </div>
        </div>
        <div class="setting-item">
            <label for="color-grading-toggle">Sunrise/Sunset Color Grading</label>
            <input type="checkbox" id="color-grading-toggle" checked />
        </div>
        <div class="setting-item">
            <label for="biome-fog-toggle">Biome Fog Tinting</label>
            <input type="checkbox" id="biome-fog-toggle" checked />
        </div>
        <p id="effects-reload-notice" style="color: #ffcc00; display: none; font-size: 12px">Effect changes may impact performance.</p>
        <button class="menu-btn" id="btn-reset-graphics-effects" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-graphics-effects">Back</button>
    </div>
    <!-- Gameplay Settings -->
    <div id="settings-gameplay" class="settings-panel" style="display: none">
        <h1>Gameplay</h1>
        <button class="menu-btn category-btn" id="btn-gameplay-movement">Movement</button>
        <button class="menu-btn category-btn" id="btn-gameplay-camera">Camera</button>
        <button class="menu-btn category-btn" id="btn-gameplay-interaction">Interaction</button>
        <button class="menu-btn" id="btn-back-from-gameplay" style="margin-top: 20px">Back</button>
    </div>
    <!-- Gameplay > Movement -->
    <div id="settings-gameplay-movement" class="settings-panel" style="display: none">
        <h1>Gameplay › Movement</h1>
        <div class="setting-item">
            <label for="player-speed-slider">Walk Speed: <span id="player-speed-val">5</span></label>
            <input type="range" id="player-speed-slider" min="1" max="10" step="0.5" />
        </div>
        <div class="setting-item">
            <label for="sprint-mult-slider">Sprint Multiplier: <span id="sprint-mult-val">1.4</span>x</label>
            <input type="range" id="sprint-mult-slider" min="1.0" max="2.0" step="0.1" />
        </div>
        <div class="setting-item">
            <label for="crouch-mult-slider">Crouch Multiplier: <span id="crouch-mult-val">0.5</span>x</label>
            <input type="range" id="crouch-mult-slider" min="0.1" max="1.0" step="0.1" />
        </div>
        <div class="setting-item">
            <label for="fly-mult-slider">Fly Speed Multiplier: <span id="fly-mult-val">4.0</span>x</label>
            <input type="range" id="fly-mult-slider" min="1.0" max="10.0" step="0.5" />
        </div>
        <div class="setting-item">
            <label for="jump-force-slider">Jump Force: <span id="jump-force-val">10</span></label>
            <input type="range" id="jump-force-slider" min="5" max="20" step="0.5" />
        </div>
        <div class="setting-item">
            <label for="gravity-slider">Gravity: <span id="gravity-val">30</span></label>
            <input type="range" id="gravity-slider" min="10" max="100" step="5" />
        </div>
        <button class="menu-btn" id="btn-reset-gameplay-movement" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-gameplay-movement">Back</button>
    </div>
    <!-- Gameplay > Camera -->
    <div id="settings-gameplay-camera" class="settings-panel" style="display: none">
        <h1>Gameplay › Camera</h1>
        <div class="setting-item">
            <label for="normal-fov-slider">Normal FOV: <span id="normal-fov-val">75</span>°</label>
            <input type="range" id="normal-fov-slider" min="60" max="110" step="1" />
        </div>
        <div class="setting-item">
            <label for="sprint-fov-slider">Sprint FOV: <span id="sprint-fov-val">80</span>°</label>
            <input type="range" id="sprint-fov-slider" min="60" max="120" step="1" />
        </div>
        <button class="menu-btn" id="btn-reset-gameplay-camera" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-gameplay-camera">Back</button>
    </div>
    <!-- Gameplay > Interaction -->
    <div id="settings-gameplay-interaction" class="settings-panel" style="display: none">
        <h1>Gameplay › Interaction</h1>
        <div class="setting-item">
            <label for="block-reach-slider">Block Reach: <span id="block-reach-val">8</span></label>
            <input type="range" id="block-reach-slider" min="2" max="16" step="1" />
        </div>
        <button class="menu-btn" id="btn-reset-gameplay-interaction" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-gameplay-interaction">Back</button>
    </div>
    <!-- World Settings -->
    <div id="settings-world" class="settings-panel" style="display: none">
        <h1>World</h1>
        <button class="menu-btn category-btn" id="btn-world-time">Time</button>
        <button class="menu-btn category-btn" id="btn-world-environment">Environment</button>
        <button class="menu-btn" id="btn-back-from-world" style="margin-top: 20px">Back</button>
    </div>
    <!-- World > Time -->
    <div id="settings-world-time" class="settings-panel" style="display: none">
        <h1>World › Time</h1>
        <div class="setting-item">
            <label for="day-length-input">Day Length (seconds):</label>
            <input type="number" id="day-length-input" min="60" max="7200" step="60" value="1200" style="width: 80px; padding: 4px 8px; border: 1px solid #555; border-radius: 4px; background: #333; color: #fff;" />
        </div>
        <div class="setting-item">
            <div style="font-weight: 500; margin-bottom: 8px">Set Time of Day</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
                <button class="menu-btn" id="btn-time-dawn" style="flex: 1; padding: 6px; min-width: 60px">Dawn</button>
                <button class="menu-btn" id="btn-time-noon" style="flex: 1; padding: 6px; min-width: 60px">Noon</button>
                <button class="menu-btn" id="btn-time-dusk" style="flex: 1; padding: 6px; min-width: 60px">Dusk</button>
                <button class="menu-btn" id="btn-time-midnight" style="flex: 1; padding: 6px; min-width: 60px">Midnight</button>
            </div>
        </div>
        <button class="menu-btn" id="btn-reset-world-time" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-world-time">Back</button>
    </div>
    <!-- World > Environment -->
    <div id="settings-world-environment" class="settings-panel" style="display: none">
        <h1>World › Environment</h1>
        <div class="setting-item">
            <label for="day-sky-top-color">Day Sky Top</label>
            <input type="color" id="day-sky-top-color" />
        </div>
        <div class="setting-item">
            <label for="day-sky-bottom-color">Day Sky Bottom / Fog</label>
            <input type="color" id="day-sky-bottom-color" />
        </div>
        <div class="setting-item">
            <label for="night-sky-top-color">Night Sky Top</label>
            <input type="color" id="night-sky-top-color" />
        </div>
        <div class="setting-item">
            <label for="night-sky-bottom-color">Night Sky Bottom / Fog</label>
            <input type="color" id="night-sky-bottom-color" />
        </div>
        <button class="menu-btn" id="btn-reset-world-environment" style="margin-top: 20px; background: #884400; border-color: #aa5500">Reset to Default</button>
        <button class="menu-btn" id="btn-back-from-world-environment">Back</button>
    </div>
`;

/**
 * Create settings menu
 * @param {Object} currentSettings
 * @param {Function} onSettingChange
 * @param {Function} onClose
 * @returns {HTMLElement}
 */
export function createSettingsMenu(currentSettings, onSettingChange, onClose) {
    const menu = document.createElement('div');
    menu.id = 'settings-root';
    menu.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.9);
        display: none;
        flex-direction: column;
        align-items: center;
        padding: 40px;
        z-index: 950;
        overflow-y: auto;
    `;

    menu.innerHTML = SETTINGS_MENU_TEMPLATE;

    initializeSettingsMenu(menu, currentSettings, onSettingChange, onClose);

    return menu;
}

function initializeSettingsMenu(menu, currentSettings, onSettingChange, onClose) {
    const panels = Array.from(menu.querySelectorAll('.settings-panel'));
    const showPanel = (panelId) => {
        panels.forEach((panel) => {
            panel.style.display = panel.id === panelId ? 'block' : 'none';
        });
    };

    const bindNav = (buttonId, panelId) => {
        menu.querySelector(`#${buttonId}`)?.addEventListener('click', () => showPanel(panelId));
    };

    // Main navigation
    bindNav('btn-settings-performance', 'settings-performance');
    bindNav('btn-settings-graphics', 'settings-graphics');
    bindNav('btn-settings-gameplay', 'settings-gameplay');
    bindNav('btn-settings-world', 'settings-world');

    // Performance branches
    bindNav('btn-performance-rendering', 'settings-performance-rendering');
    bindNav('btn-performance-streaming', 'settings-performance-streaming');
    bindNav('btn-back-from-performance', 'settings-menu');
    bindNav('btn-back-from-performance-rendering', 'settings-performance');
    bindNav('btn-back-from-performance-streaming', 'settings-performance');

    // Graphics branches
    bindNav('btn-graphics-visual', 'settings-graphics-visual');
    bindNav('btn-graphics-lighting', 'settings-graphics-lighting');
    bindNav('btn-graphics-water', 'settings-graphics-water');
    bindNav('btn-graphics-effects', 'settings-graphics-effects');
    bindNav('btn-back-from-graphics', 'settings-menu');
    bindNav('btn-back-from-graphics-visual', 'settings-graphics');
    bindNav('btn-back-from-graphics-lighting', 'settings-graphics');
    bindNav('btn-back-from-graphics-water', 'settings-graphics');
    bindNav('btn-back-from-graphics-effects', 'settings-graphics');

    // Gameplay branches
    bindNav('btn-gameplay-movement', 'settings-gameplay-movement');
    bindNav('btn-gameplay-camera', 'settings-gameplay-camera');
    bindNav('btn-gameplay-interaction', 'settings-gameplay-interaction');
    bindNav('btn-back-from-gameplay', 'settings-menu');
    bindNav('btn-back-from-gameplay-movement', 'settings-gameplay');
    bindNav('btn-back-from-gameplay-camera', 'settings-gameplay');
    bindNav('btn-back-from-gameplay-interaction', 'settings-gameplay');

    // World branches
    bindNav('btn-world-time', 'settings-world-time');
    bindNav('btn-world-environment', 'settings-world-environment');
    bindNav('btn-back-from-world', 'settings-menu');
    bindNav('btn-back-from-world-time', 'settings-world');
    bindNav('btn-back-from-world-environment', 'settings-world');

    // Close settings
    menu.querySelector('#btn-back-from-settings')?.addEventListener('click', () => onClose());

    // Settings group collapse
    const toggleSettingsGroup = (headerEl) => {
        const content = headerEl?.nextElementSibling;
        if (!content) return;
        headerEl.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
        const groupName = headerEl.dataset.groupToggle;
        if (groupName) {
            const collapsedGroups = JSON.parse(localStorage.getItem('voxex_collapsed_groups') || '{}');
            collapsedGroups[groupName] = headerEl.classList.contains('collapsed');
            localStorage.setItem('voxex_collapsed_groups', JSON.stringify(collapsedGroups));
        }
    };

    menu.querySelectorAll('.settings-group-header').forEach((header) => {
        header.addEventListener('click', () => toggleSettingsGroup(header));
    });

    const collapsedGroups = JSON.parse(localStorage.getItem('voxex_collapsed_groups') || '{}');
    menu.querySelectorAll('.settings-group[data-group]').forEach(group => {
        const groupName = group.dataset.group;
        const header = group.querySelector('.settings-group-header');
        const content = group.querySelector('.settings-group-content');
        const isCollapsed = collapsedGroups[groupName] !== false;
        if (!header || !content) return;
        if (isCollapsed) {
            header.classList.add('collapsed');
            content.classList.add('collapsed');
        } else {
            header.classList.remove('collapsed');
            content.classList.remove('collapsed');
        }
    });

    // Settings search
    const searchInput = menu.querySelector('#settings-search');
    const searchResults = menu.querySelector('#settings-search-results');
    const settingItems = Array.from(menu.querySelectorAll('.setting-item'))
        .map((item) => {
            const label = item.querySelector('label');
            const panel = item.closest('.settings-panel');
            const panelTitle = panel?.querySelector('h1')?.textContent?.trim() ?? '';
            if (!label) return null;
            return {
                item,
                labelText: label.textContent?.trim() ?? '',
                panelTitle,
                panelId: panel?.id ?? ''
            };
        })
        .filter(Boolean);

    if (searchInput && searchResults) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim().toLowerCase();
            searchResults.innerHTML = '';
            if (!query) {
                searchResults.style.display = 'none';
                return;
            }
            const matches = settingItems.filter((entry) => entry.labelText.toLowerCase().includes(query));
            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'search-no-results';
                empty.textContent = 'No matching settings';
                searchResults.appendChild(empty);
                searchResults.style.display = 'block';
                return;
            }
            matches.slice(0, 12).forEach((entry) => {
                const result = document.createElement('div');
                result.className = 'search-result-item';
                result.dataset.panel = entry.panelId;
                result.innerHTML = `<span>${entry.labelText}</span><span class=\"search-result-path\">${entry.panelTitle}</span>`;
                result.addEventListener('click', () => {
                    if (entry.panelId) {
                        showPanel(entry.panelId);
                        entry.item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    searchResults.style.display = 'none';
                });
                searchResults.appendChild(result);
            });
            searchResults.style.display = 'block';
        });
    }

    // Profile buttons
    menu.querySelectorAll('.profile-btn').forEach((button) => {
        button.addEventListener('click', () => {
            menu.querySelectorAll('.profile-btn').forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');
            onSettingChange('profile', button.dataset.profile);
        });
    });

    menu.querySelector('#btn-save-custom-profile')?.addEventListener('click', () => {
        onSettingChange('profile-save', 'custom');
    });

    // Reset buttons
    menu.querySelectorAll('[id^="btn-reset-"]').forEach((button) => {
        button.addEventListener('click', () => {
            onSettingChange('reset', button.id);
        });
    });

    // Input bindings
    const updateValueDisplay = (input) => {
        if (!input.id) return;
        let valueId = input.id;
        if (input.id.endsWith('-slider')) {
            valueId = input.id.replace('-slider', '-val');
        } else if (input.id.endsWith('-input')) {
            valueId = input.id.replace('-input', '-val');
        }
        const valueEl = menu.querySelector(`#${valueId}`);
        if (valueEl && input.type === 'range') {
            valueEl.textContent = input.value;
        }
    };

    menu.querySelectorAll('input, select').forEach((input) => {
        if (input.type === 'button') return;
        if (currentSettings && Object.prototype.hasOwnProperty.call(currentSettings, input.id)) {
            const settingValue = currentSettings[input.id];
            if (input.type === 'checkbox') {
                input.checked = Boolean(settingValue);
            } else {
                input.value = String(settingValue);
            }
        }
        updateValueDisplay(input);

        const handler = () => {
            let value;
            if (input.type === 'checkbox') {
                value = input.checked;
            } else if (input.type === 'range' || input.type === 'number') {
                value = Number(input.value);
            } else {
                value = input.value;
            }
            updateValueDisplay(input);
            onSettingChange(input.id, value);
        };

        const eventType = input.type === 'range' ? 'input' : 'change';
        input.addEventListener(eventType, handler);
    });

    showPanel('settings-menu');
}

/**
 * Show/hide settings menu
 * @param {HTMLElement} menu
 * @param {boolean} visible
 */
export function setSettingsMenuVisible(menu, visible) {
    menu.style.display = visible ? 'flex' : 'none';
    if (visible) {
        const panel = menu.querySelector('#settings-menu');
        if (panel) {
            menu.querySelectorAll('.settings-panel').forEach((p) => {
                p.style.display = p === panel ? 'block' : 'none';
            });
        }
    }
}

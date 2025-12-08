# VoxEx
The Single-File HTML Voxel Explorer

## Overview
VoxEx is a fully-featured, browser-based 3D voxel exploration game engine inspired by Minecraft.  
Its defining characteristic is its architecture: the entire game —engine, logic, rendering, UI, and assets— is contained within a single HTML file.  

It requires no external servers, no installation, and no local asset files.  
It runs entirely in the browser using Three.js (via CDN) and WebGL.  

## Key Features
1. "One File" Architecture
   * Zero dependencies to install.
   * All textures are procedurally generated on HTML5 Canvases at runtime.
   * Run it simply by opening voxEx.html in any modern web browser.

2. Voxel Engine
   * Infinite procedural world generation.
   * Chunk size: 16x16x128.
   * Streaming chunk system with configurable pre-generation distance, build queue limits, and a hard cap on cached chunks to keep memory and stutter under control.
   * Optimized rendering with face culling and frustum culling.
   * Hostile zombie mobs that spawn at night, track the player with simple AI, and despawn cleanly at long range to keep performance stable.
   * Custom shader injection for cylindrical fog and atmosphere.

3. Biome System
   * Current Biomes: Plains, Hills, Forests, Mountains, Swamps.
   * Dynamic tree generation and vegetation density tuned per-biome.
   * Heightmap blending using noise and domain warping for smoother transitions.

4. Advanced Lighting (v3.300+)
   * Sunlight propagation system (sky light spreads downwards and horizontally).
   * Ambient Occlusion (AO) baked into vertex colors for depth, with a lookup-optimized AO curve.
   * Dynamic day/night cycle impacting sky color, fog, and light intensity.
   * Configurable sun, moon, torch, and ambient light colors and intensities via the in-game Graphics › Lighting settings.
   * World time controls: adjustable day length and instant time-of-day presets (Dawn, Noon, Dusk, Midnight).
   * 3D Voxel Torch Viewmodel with dynamic point lighting and flicker effects.

5. Persistence & Optimization
   * Uses IndexedDB for persistent world storage (chunk data is cached in a dedicated `VoxExWorldData` store).
   * Custom RLE (Run-Length Encoding) compression for efficient chunk storage, including separate channels for blocks, skylight, and block light.
   * Object pooling and mesh reuse for terrain and water geometries to minimize Garbage Collection.
   * Dynamic Render Distance adjustment based on FPS performance, with configurable lower/upper FPS thresholds.
   * In-game Performance settings allow tuning:
     * Render distance and dynamic render distance behavior.
     * Build queue size, pre-generation radius, and maximum cached chunks.
     * Pixel ratio and frustum culling toggle for scaling quality vs. speed.
   * Visual feedback overlays for world generation and chunk loading so the player can see background streaming work.

## How to Play
1. Download the [Current version](voxEx.html) of voxEx.html.
2. Launch: Open `voxEx.html` in Chrome, Firefox, or Edge.
   > Chrome has yeilded the best results in testing
3. Menu: Enter a seed or generate a random one.
4. Wait for the world to generate.
   > Skipping will sometimes cause issues with world generation.
5. Click to begin playing. 
6. Press `ESC` to pause, access Settings (Performance, Graphics, Gameplay, World) and save/load a world.

At startup, you can:
* Create a New World from a custom or random seed.
* Load any previously saved world from the start-menu save selector.
In the pause menu, you can:
* Save the current world under a custom name.
* Load another saved world.
* Open the multi-category Settings hub for fine-tuning performance, visuals, controls, and world behavior.

## Controls
| Key | Action |
| :--- | ---: |
| W, A, S, D | Move |
| SPACE | Jump / Fly Up (Double tap or hold in flight mode) |
| C | Crouch / Fly Down
| SHIFT | Sprint|
| F | Toggle Torch |
| 1-8 / Scroll | Select Block |
| Left Click | Mine Block |
| Right Click | Place Block |
| ~ (Tilde) | Toggle Debug Overlay |
| ESC | Pause / Open Menu |

Additional on-screen indicators:
* Flight indicator when fly mode is active.
* Sprint and crouch badges when those movement states are engaged.
* A hotbar with block icons and names.
* A chunk-loading indicator while chunks stream in around the player.

## Technical Architecture
**Rendering:** Three.js r160 (WebGL) with batched voxel mesh generation, frustum culling, optional shadows, and pixel-art friendly texture sampling (nearest neighbor + anisotropic filtering).  
**Physics:** Simple AABB collision detection with gravity, jump impulse, fluid drag, and tuned radii/heights for both the player and zombie mobs.  
**Threading:** Main thread generation with batched chunk builds and incremental streaming, coordinated by a build queue and FPS-aware render distance management to avoid frame spikes.  
**Textures:** 12-tile atlas generated via Canvas API, with selectable resolutions (16x, 32x, 64x) while preserving a crisp 16x-style pixel-art look.  

Settings are stored in `localStorage` so your Performance, Graphics, Gameplay, and World tweaks persist between sessions.

World saves are split into:
* Lightweight metadata (seed, player position/rotation, timestamp, version) stored in `localStorage`.
* Chunk data stored in IndexedDB, compressed via the custom chunk compressor.

## Roadmap (Upcoming Features)
See [Plans](plans.md) for detailed implementation strategies.

### New Biomes:
**Longwoods:** Massive 2x2 trunk trees towering 30+ blocks high.  
**Broken Plains (Canyons):** Tectonic terrain with deep plateaus and strata.  
**Shaded Forest:** A dark biome with dense "roofed" canopies blocking sunlight.  

### Gameplay Systems:
**Inventory System:** Drag-and-drop UI to manage hotbar slots.  
**Hotbar Customization:** Ability to swap active blocks.  

## Contributing
* This project strictly adheres to the "Single File" rule.
* Do not create external `.css` or `.js` files.
* Do not link to local images.
* All code must remain inside `voxEx.html`.
* For bug reports or feature requests, please use the templates provided in the `.github/ISSUE_TEMPLATE` directory.

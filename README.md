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
   * Optimized rendering with face culling and frustum culling.
   * Custom shader injection for cylindrical fog and atmosphere.
3. Biome System
   * Current Biomes: Plains, Hills, Forests, Mountains, Swamps.
   * Dynamic tree generation and vegetation density.
   * Heightmap blending using noise and domain warping.
4. Advanced Lighting (v3.300+)
   * Sunlight propagation system (sky light spreads downwards and horizontally).
   * Ambient Occlusion (AO) baked into vertex colors for depth.
   * Dynamic day/night cycle impacting sky color, fog, and light intensity.
   * 3D Voxel Torch Viewmodel with dynamic point lighting and flicker effects.
5. Persistence & Optimization
   * Uses IndexedDB for persistent world storage.
   * Custom RLE (Run-Length Encoding) compression for efficient chunk storage.
   * Object pooling for geometries to minimize Garbage Collection.
   * Dynamic Render Distance adjustment based on FPS performance.

## How to Play
1. Download the [Current version](voxEx.html) of voxEx.html.
2. Launch: Open `voxEx.html` in Chrome, Firefox, or Edge.
   > Chrome has yeilded the best results in testing
3. Menu: Enter a seed or generate a random one.
4. Wait for the world to generate.
   > Skipping will sometimes cause issues with world generation.
5. Click to begin playing. 
6. Press `ESC` to pause, access settings and save/load a world.

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

## Technical Architecture
**Rendering:** Three.js r160 (WebGPU/WebGL).  
**Physics:** Simple AABB collision detection with gravity and fluid drag.  
**Threading:** Main thread generation (batched to prevent UI freezing).  
**Textures:** 12-tile atlas generated via Canvas API (16x16 pixel art style).  

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

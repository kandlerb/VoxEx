# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx** is a fully-featured, browser-based voxel explo...the browser without requiring external servers or installations.

**Key Characteristics:**
- **Type**: Browser-based 3D voxel game engine
- **Platform**: HTML5 + JavaScript ES6 modules
- **Main File**: `voxEx.html` (single file - no exceptions)
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, IndexedDB, LocalStorage

## Project Priorities

These are the core principles that guide all development decisions:

1. **One File to Rule Them All**
   - The entire game runs from a single HTML file
   - All CSS, JavaScript, and assets are embedded
   - This principle is sacred and will never change
   - No external dependencies, scripts, or resources

2. **No Circles. Ever. Only Squares (Voxels)**
   - Everything is made of cubes/boxes
   - Procedurally generated pixel art textures (16×16)
   - Minecraft-inspired aesthetic with pure voxel geometry
   - BoxGeometry for all 3D objects (blocks, torch, etc.)

3. **Optimized to Run on [Almost] Any Device**
   - Performance-first design with aggressive optimization
   - Typed arrays (Float32Array, Uint8Array) for memory efficiency
   - Object pooling for geometries to reduce GC pressure
   - Face culling and frustum culling to minimize draw calls
   - RLE compression for chunk storage
   - Targets 60fps on mid-range hardware

4. **Flexible Settings and User Preferences**
   - Configurable render distance (4-32 chunks)
   - Graphics options: AO, shadows, fog, frustum culling
   - Movement options: sprint speed, fly speed
   - Customizable controls
   - Multiple save slots with unique seeds
   - All settings persist via LocalStorage

## Repository Structure

VoxEx/  
├── .git/ # Git repository data  
├── voxEx.html # Complete application (HTML + CSS + JS)  
└── CLAUDE.md # This file  

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Three.js** | 0.160.0 | 3D rendering, lighting, camera control |
| **PointerLockControls** | Three.js addon | First-person camera/input control |
| **IndexedDB** | Native browser API | Chunk data persistence with RLE compression |
| **LocalStorage** | Native browser API | Game saves and settings storage |
| **Canvas API** | Native | Procedural texture generation (Atlas) |
| **WebGL** | Via Three.js | GPU-accelerated rendering |

...

## Architecture Overview

VoxEx Architecture: 

┌─────────────────────────────────────────────────────────────┐  
│ UI Layer (HTML/CSS)                                         │  
│ - HUD: Crosshair, Hotbar, Block Name, Flight/Sprint Icons   │  
│ - Menus: Start, Pause, Settings, Controls, Seed Selection   │  
└───────────────┬─────────────────────────────────────────────┘  
                ↓  
┌─────────────────────────────────────────────────────────────┐  
│ Game Engine (Three.js Renderer)                             │  
│ - Camera (First Person), Lighting (Day/Night), Skybox       │  
│ - Voxel Torch Model (BoxGeometry)                           │  
└───────────────┬─────────────────────────────────────────────┘  
                ↓  
┌─────────────────────────────────────────────────────────────┐  
│ World Management System                                     │  
│ ├─ Chunk Generation (16x16x128)                             │  
│ ├─ Biome System (Plains, Hills, Forest, Mountain, Swamp)    │  
│ ├─ Structure Generation (Trees, Caves, Rivers)              │  
│ └─ Block Logic (Optimized Face Culling, AO)                 │  
└───────────────┬─────────────────────────────────────────────┘  
                ↓  
┌─────────────────────────────────────────────────────────────┐  
│ Data Persistence Layer                                      │  
│ ├─ IndexedDB (Chunk Cache with RLE Compression)             │  
│ ├─ LocalStorage (Game Saves & Settings)                     │  
└─────────────────────────────────────────────────────────────┘  

## Version History & Features

**v3.300+ (Current) - Lighting, Atmosphere & Effects**

- **Lighting & Torch**
  - Minecraft-style per-block light system (vertical sunlight + horizontal falloff, semi-transparent leaves)
  - Dynamic light recalculation when blocks are placed/removed
  - 3D FPS-style torch viewmodel on its own layer (no clipping, subtle flicker)

- **World Data & Camera**
  - Chunk structure now stores `{blocks, skyLight, blockLight}` instead of a single `Uint8Array`
  - `ChunkCompressor` updated for the new RLE-based format
  - Camera near plane set to 0.01 to avoid close-range clipping

- **Atmosphere & Post Effects**
  - Optional volumetric lighting (“god rays”) and volumetric fog with tunable parameters
  - Water color/opacity and underwater fog distances configurable in Graphics › Water
  - Zombie scare effects (red vignette + desaturation) configurable in Graphics › Effects

- **Debug & Spawn Pre-Gen**
  - Debug overlay shows FPS, position, chunk counts, face counts, seed, biome, etc.
  - Spawn pre-generation with progress UI and a safe “Skip Pre-generation” option

- **Misc Fixes**
  - Block selection robustness, lighting edge cases, and duplicate variable declarations

**v3.300 - UI Polish Update**
- Flight Indicator, Movement Indicators (Sprint/Crouch)
- Block Name Display above hotbar
- Mouse wheel hotbar scrolling
- Texture bleeding fixed (1/12 atlas)

**v3.204 - Previous Major Release**
- Dynamic render distance, Chunk compression, ...

## Key Systems Explained

### Chunk System
- **Size**: 16×16×128 blocks.
- **Structure**: `{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}`
- **Rendering**: Geometries are pooled (Float32Array) and batched per chunk.
- **Optimization**: Hidden faces culled; Ambient Occlusion (AO) baked into vertex colors.
- **Backward Compatibility**: Supports both old (Uint8Array) and new (object) formats.

### Lighting System
- **Light Levels**: 1-15 range (1 = minimum visibility, 15 = full sunlight)
- **Vertical Propagation**: Sunlight (15) travels down from sky, reduced by 1 per solid block
- **Horizontal Spreading**: Light spreads to neighbors in all 6 directions, -1 per block
- **Semi-Transparent Blocks**: Leaves reduce light by 1 instead of blocking completely
- **Vertex Colors**: Light levels multiplied by AO, applied as vertex colors during rendering
- **Dynamic Updates**: Light recalculated automatically when blocks change
- **Minimum Light**: Never drops to 0 - always at least 1 (0 is absence of light, never used)
- **Formula**: `vertexColor = AO × (lightLevel / 15.0)`

### Rendering System
- **Textures**: Procedurally generated 16x16 pixel art on a canvas (Atlas size: 12 tiles).
- **Materials**: Lambert material for terrain; Transparent material for water.
- **Fog**: Custom cylindrical fog shader for smooth horizon blending.
- **Volumetric Effects**: Optional volumetric lighting (“god rays”) and volumetric fog, configurable via Settings › Graphics.
- **Layers**: Layer 0 (world geometry), Layer 1 (viewmodels like torch).
- **Camera**: Near plane 0.01, far plane 800, FOV 75° (80° when sprinting).

### Torch Viewmodel
- **Type**: 3D voxel model (stick + flame + glow) using BoxGeometry
- **Materials**: MeshLambertMaterial with emissive properties for shading/AO
- **Structure**:
  - Stick (0.04×0.25×0.04) - brown wood voxel
  - Flame (0.06×0.08×0.06) - orange voxel with 0.5 emissive
  - Glow (0.04×0.04×0.04) - yellow center, positioned inside flame
- **Rendering**: Layer 1 with `depthTest: false` and `renderOrder: 1000`
- **Position**: Attached to camera with slight tilt; behaves like an FPS weapon
- **Light Range**: Extended light radius around player for better visibility

### Persistence
- **RLE Compression**: Chunk data (blocks + light) is Run-Length Encoded before storing.
- **Format Version**: v2 includes separate compressed arrays for blocks, skyLight, blockLight.
- **Save Format**: JSON containing Seed, Player Pos/Rot, and RLE-compressed modified chunks.
- **Backward Compatibility**: Decompressor handles both v1 (old) and v2 (new) formats.

## Naming Conventions
- `cx, cz`: Chunk coordinates.
- `lx, ly, lz`: Local block coordinates (0-15).
- `gx, gy, gz`: Global block coordinates.
- `getChunkKey(cx, cz)`: Returns string `"cx,cz"`.

## Development Guidelines

### When Modifying `voxEx.html`:
1. **Single File Rule**: ALL code stays in this ONE file - CSS, HTML, and JavaScript.
2. **Texture Atlas**: If adding blocks, update `TOTAL_TILES` in `initBlockOptimization` and `initTextures`. Current count: **12**.
3. **UI Overlay**: UI elements are toggled via `controls.lock`/`unlock` events to hide during menus.
4. **Light System**: When changing blocks, always call `calculateChunkSunlight()` to update lighting.
5. **Chunk Format**: Use `chunk.blocks`, `chunk.skyLight`, `chunk.blockLight` (with backward compatibility checks).
6. **Voxel Aesthetic**: Use BoxGeometry only - no spheres, cylinders, or curved geometry.

### Common Search Patterns
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`, `const DEFAULTS`
- **Block Types**: `const AIR`, `const GRASS`, `const LEAVES`
- **Gen**: `function generateChunkData`, `function calculateChunkSunlight`
- **Render**: `function renderChunk`, `function addFace`
- **Light**: `function getSkyLight`, `function setSkyLight`, `getLocalLight`
- **Input**: `function onKeyDown`, `function onMouseWheel`
- **Compression**: `ChunkCompressor.compress`, `ChunkCompressor.decompress`

### Light Level Reference
- **15**: Full sunlight (directly exposed to sky)
- **14**: 1 block from sun (under 1 leaf layer)
- **12-13**: Under tree canopy (2-3 leaf layers)
- **8-11**: Medium shade or cave opening
- **4-7**: Deep shade
- **2-3**: Deep cave
- **1**: Minimum light (always faintly visible - 0 never used)

### Performance Tips
- Prefer typed arrays (Uint8Array, Float32Array) over regular arrays
- Use object pooling for frequently created geometries
- Batch chunk updates with `scheduleChunkUpdate()` to avoid redundant rebuilds
- Keep render distance reasonable (8-16 chunks for most devices)

---

## Claude Code Guidelines (Concise)

These rules tell Claude Code how to work on this repo (GitHub + HTML/JavaScript) without breaking things.

### Refactoring Scope
- You may refactor and reorganize code when it clearly improves **correctness**, **readability**, or **performance**.
- Keep changes focused: avoid unrelated renames or style-only edits that create noisy diffs.
- Never violate the **single-file rule**: all logic stays in `voxEx.html` (no new files or external assets).

### Bug Prevention & Optimization
- Before declaring any new `const`/`let`/function:
  - Quickly search the file for that name; **do not** redeclare an existing identifier in the same scope.
  - Avoid confusing shadowing of important globals (e.g. `scene`, `camera`, `SETTINGS`, `WORLD_CONFIG`, `chunks`).
- When adding or changing settings:
  - Add a sane default in `DEFAULTS`, wire it into `SETTINGS`, and ensure it round-trips via the save/load system.
  - Make sure any new DOM IDs used in JS exist in the HTML and are updated everywhere they’re referenced.
- Avoid heavy, deeply nested loops in hot paths (render loop, movement, chunk meshing):
  - Prefer at most **two** nested loops in per-frame code.
  - For expensive operations, batch work over time, use existing caches (render distance squared, UV lookup, mesh counts), or limit to nearby chunks.

### Logging & Debug Overlay
- Prefer `logDebug(...)` over raw `console.log(...)`, especially for:
  - Chunk cache, pre-generation, streaming/eviction
  - New systems (volumetric, zombie effects, lighting changes)
- Keep logs:
  - **Sparse** (no per-frame spam or per-block logging)
  - **Tagged** with short prefixes like `[PreGen]`, `[Chunks]`, `[Lighting]`, `[ZombieFX]`, `[Settings]`.
- The `#debug-overlay` should show concise, high-value info only (FPS, position, chunk/mesh counts, face counts, seed, biome, etc.).

### Change Reporting in GitHub
When you propose changes (patches/commits/PRs), format your explanation like this:

- **Summary** – 2–5 short bullets of what changed.
- **Changes** – grouped bullets by subsystem (e.g. “Settings › Graphics › Effects”, “World Pre-Gen”, “Rendering › Volumetric”).
- **Rationale** – a few sentences on *why* the changes were made (bug fix, performance, clarity).
- **Safety Checks** – explicitly mention that you:
  - Checked for duplicate or shadowed identifiers before new declarations.
  - Verified new DOM IDs and settings are wired correctly.
  - Avoided adding heavy loops or work to the per-frame/update path.

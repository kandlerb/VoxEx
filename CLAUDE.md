# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx v3.300+** is a fully-featured, browser-based voxel exploration game inspired by Minecraft. It's a single-file HTML application that runs entirely in the browser without requiring external servers or installations.

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

```
VoxEx/
├── .git/              # Git repository data
├── voxEx.html         # Complete application (HTML + CSS + JS)
└── CLAUDE.md          # This file
```


## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Three.js** | 0.160.0 | 3D rendering, lighting, camera control |
| **PointerLockControls** | Three.js addon | First-person camera/input control |
| **IndexedDB** | Native browser API | Chunk data persistence with RLE compression |
| **LocalStorage** | Native browser API | Game saves and settings storage |
| **Canvas API** | Native | Procedural texture generation (Atlas) |
| **WebGL** | Via Three.js | GPU-accelerated rendering |

## Architecture Overview

VoxEx Architecture: ┌─────────────────────────────────────────────────────────────┐ │ UI Layer (HTML/CSS) │ │ - HUD: Crosshair, Hotbar, Block Name, Flight/Sprint Icons │ │ - Menus: Start, Pause, Settings, Controls, Seed Selection │ └──────────────────────┬──────────────────────────────────────┘ ↓ ┌─────────────────────────────────────────────────────────────┐ │ Game Engine (Three.js Renderer) │ │ - Camera (First Person), Lighting (Day/Night), Skybox │ │ - Voxel Torch Model (BoxGeometry) │ └──────────────────────┬──────────────────────────────────────┘ ↓ ┌─────────────────────────────────────────────────────────────┐ │ World Management System │ │ ├─ Chunk Generation (16x16x128) │ │ ├─ Biome System (Plains, Hills, Forest, Mountain, Swamp) │ │ ├─ Structure Generation (Trees, Caves, Rivers) │ │ └─ Block Logic (Optimized Face Culling, AO) │ └──────────────────────┬──────────────────────────────────────┘ ↓ ┌─────────────────────────────────────────────────────────────┐ │ Data Persistence Layer │ │ ├─ IndexedDB (Chunk Cache with RLE Compression) │ │ ├─ LocalStorage (Game Saves & Settings) │ └─────────────────────────────────────────────────────────────┘


## Version History & Features

**v3.300+ (Current) - Lighting System & Torch Overhaul**
- **Minecraft-Style Light Levels**: Per-block light system (1-12 range)
  - Vertical sunlight propagation from sky downward
  - Horizontal light spreading with natural falloff
  - Semi-transparent leaves (reduce light by 1 per layer)
  - Dynamic recalculation when blocks placed/broken
- **3D Torch Viewmodel**: FPS-style torch rendering
  - Attached to camera on separate rendering layer
  - Uses depthTest: false to prevent clipping through walls
  - Animated flame with flickering effect
  - Behaves like CoD/Minecraft weapon rendering
- **Chunk Structure Update**: Changed from Uint8Array to {blocks, skyLight, blockLight}
- **Camera Clipping Fix**: Near plane adjusted to 0.01 for close-range rendering
- **Compression Update**: ChunkCompressor handles new light data format with RLE
- **Bug Fixes**: Block selection, duplicate variable declarations, tree lighting

**v3.300 - UI Polish Update**
- Flight Indicator, Movement Indicators (Sprint/Crouch)
- Block Name Display above hotbar
- Mouse wheel hotbar scrolling
- Texture bleeding fixed (1/12 atlas)

**v3.204 - Previous Major Release**
- Dynamic render distance, Chunk compression, Pre-generation

## Key Systems Explained

### Chunk System
- **Size**: 16×16×128 blocks.
- **Structure**: `{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}`
- **Rendering**: Geometries are pooled (Float32Array) and batched per chunk.
- **Optimization**: Hidden faces culled; Ambient Occlusion (AO) baked into vertex colors.
- **Backward Compatibility**: Supports both old (Uint8Array) and new (object) formats.

### Lighting System
- **Light Levels**: 1-12 range (1 = minimum visibility, 12 = full sunlight)
- **Vertical Propagation**: Sunlight (12) travels down from sky, reduced by 1 per solid block
- **Horizontal Spreading**: Light spreads to neighbors in all 6 directions, -1 per block
- **Semi-Transparent Blocks**: Leaves reduce light by 1 instead of blocking completely
- **Vertex Colors**: Light levels multiplied by AO, applied as vertex colors during rendering
- **Dynamic Updates**: Light recalculated automatically when blocks change
- **Formula**: `vertexColor = AO × (lightLevel / 12.0)`

### Rendering System
- **Textures**: Procedurally generated 16x16 pixel art on a canvas (Atlas size: 12 tiles).
- **Materials**: Lambert material for terrain; Transparent material for water.
- **Fog**: Custom cylindrical fog shader for smooth horizon blending.
- **Layers**: Layer 0 (world geometry), Layer 1 (viewmodels like torch).
- **Camera**: Near plane 0.01, far plane 800, FOV 75° (80° when sprinting).

### Torch Viewmodel
- **Type**: 3D voxel model (stick + flame + glow) using BoxGeometry
- **Rendering**: Layer 1 with `depthTest: false` and `renderOrder: 1000`
- **Position**: Attached to camera at (0.35, -0.35, -0.6) with -0.3 rad tilt
- **Animation**: Flame scale pulsing with sin wave + random jitter
- **Result**: Never clips through world geometry (FPS viewmodel technique)

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
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`
- **Block Types**: `const AIR`, `const GRASS`, `const LEAVES`
- **Gen**: `function generateChunkData`, `function calculateChunkSunlight`
- **Render**: `function renderChunk`, `function addFace`
- **Light**: `function getSkyLight`, `function setSkyLight`, `getLocalLight`
- **Input**: `function onKeyDown`, `function onMouseWheel`
- **Compression**: `ChunkCompressor.compress`, `ChunkCompressor.decompress`

### Light Level Reference
- **12**: Full sunlight (directly exposed to sky)
- **11**: 1 block from sun (under 1 leaf layer)
- **9-10**: Under tree canopy (2-3 leaf layers)
- **5-8**: Deep shade or cave opening
- **2-4**: Deep cave
- **1**: Minimum light (always faintly visible)

### Performance Tips
- Prefer typed arrays (Uint8Array, Float32Array) over regular arrays
- Use object pooling for frequently created geometries
- Batch chunk updates with `scheduleChunkUpdate()` to avoid redundant rebuilds
- Keep render distance reasonable (8-16 chunks for most devices)

---
**Last Updated**: 2025-12-02
**File Version**: v3.300+

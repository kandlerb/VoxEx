# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx v3.300** is a fully-featured, browser-based voxel exploration game inspired by Minecraft. It's a single-file HTML application that runs entirely in the browser without requiring external servers or installations.

**Key Characteristics:**
- **Type**: Browser-based 3D voxel game engine
- **Platform**: HTML5 + JavaScript ES6 modules
- **Main File**: `v3.300_VoxEx.html`
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, IndexedDB, LocalStorage

## Repository Structure

VoxEx/ ├── .git/ # Git repository data ├── v3.300_VoxEx.html # Complete application (HTML + CSS + JS) └── CLAUDE.md # This file


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

**v3.300 (Current) - UI Polish & Polish Update**
- **Flight Indicator**: Visual wing icon when flying.
- **Movement Indicators**: Icons for Sprinting and Crouching.
- **Block Name Display**: Shows the name of the selected block above the hotbar.
- **Torch Update**: Voxel-based torch model (BoxGeometry) attached to camera.
- **Input Polish**: Mouse wheel hotbar scrolling, smooth UI transitions.
- **Bug Fixes**: Texture bleeding fixed (1/12 atlas), UI alignment fixes.

**v3.204 - Previous Major Release**
- Dynamic render distance, Chunk compression, Pre-generation.

## Key Systems Explained

### Chunk System
- **Size**: 16×16×128 blocks.
- **Rendering**: Geometries are pooled (Float32Array) and batched per chunk.
- **Optimization**: Hidden faces culled; Ambient Occlusion (AO) baked into vertex colors.

### Rendering System
- **Textures**: Procedurally generated 16x16 pixel art on a canvas (Atlas size: 12 tiles).
- **Materials**: Lambert material for terrain; Transparent material for water.
- **Fog**: Custom cylindrical fog shader for smooth horizon blending.

### Persistence
- **RLE Compression**: Chunk data is Run-Length Encoded before storing in IndexedDB to save space.
- **Save Format**: JSON containing Seed, Player Pos/Rot, and RLE-compressed modified chunks.

## Naming Conventions
- `cx, cz`: Chunk coordinates.
- `lx, ly, lz`: Local block coordinates (0-15).
- `gx, gy, gz`: Global block coordinates.
- `getChunkKey(cx, cz)`: Returns string `"cx,cz"`.

## Development Guidelines

### When Modifying `v3.300_VoxEx.html`:
1. **Single File**: Keep CSS, HTML, and JS in this file.
2. **Texture Atlas**: If adding blocks, update `TOTAL_TILES` in `initBlockOptimization` and `initTextures`. Current count: **12**.
3. **UI Overlay**: UI elements (like `#torch-indicator`) are toggled via `controls.lock`/`unlock` events to hide them in menus.

### Common Search Patterns
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`
- **Gen**: `function generateChunkData`
- **Render**: `function renderChunk`
- **Input**: `function onKeyDown`, `function onMouseWheel`

---
**Last Updated**: 2025-12-01
**File Version**: v3.300

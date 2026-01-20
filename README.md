# VoxEx

**The Browser-Based Voxel Explorer** - A fully-featured voxel game engine inspired by Minecraft, running entirely in your browser.

## Play

- **Online**: https://kandlerb.github.io/VoxEx/
- **Offline**: Download `voxEx.html` and open in any modern browser

The launcher page runs browser compatibility tests (WebGL, GPU benchmarks) before starting the game.

## Architecture

VoxEx is a **single-file application** - the entire game (~39K lines) runs from one HTML file with embedded CSS and JavaScript. No build tools, no bundlers, no external dependencies beyond Three.js from CDN.

### Repository Structure

```
VoxEx/
├── index.html               # System check & launcher
├── voxEx.html               # Complete game (single file, ~39K lines)
├── voxex-sound-formula.html # Sound synthesis demo
├── CLAUDE.md                # AI assistant guidelines
├── futureFeatures.md        # Feature roadmap
└── chunkRenderingPlan.md    # Technical planning doc
```

### Design Philosophy

1. **One File to Rule Them All** - All game code in a single HTML file
2. **No Circles, Only Voxels** - Pure cube-based geometry (BoxGeometry only)
3. **Runs Anywhere** - Targets 60fps on mid-range hardware
4. **Zero Build Steps** - Three.js loaded from CDN, no npm/webpack needed

## Key Features

### Voxel Engine
- Infinite procedural world generation with 6 biomes
- Chunk size: 16x16x320 blocks
- Optimized rendering with face culling, frustum culling, and ambient occlusion
- RLE compression for chunk storage
- Configurable render distance (4-32 chunks)
- Web Worker-based mesh generation

### Biome System

| Biome | Description |
|-------|-------------|
| Plains | Flat terrain, sparse oak trees |
| Hills | Rolling terrain, moderate tree density |
| Forests | Dense oak trees |
| Mountains | High peaks with conical pines, snow above treeline |
| Swamp | Low wetlands with droopy trees and water pools |
| Longwoods | Giant trees (2x2 and 3x3 trunks), heights 12-24 blocks |

### 15 Block Types

Air, Grass, Dirt, Stone, Wood Planks, Oak Log, Oak Leaves, Bedrock, Sand, Water, Torch, Snow, Gravel, Longwood Log, Longwood Leaves

### Lighting System
- 15-level sunlight propagation
- Ambient occlusion baked into vertex colors
- Dynamic day/night cycle
- Torch point lighting with 3D voxel model

### Hostile Mobs
- Zombie AI with detection, tracking, and pathfinding
- Proximity-based scare effects (red vignette, desaturation)
- Procedural growl and hurt audio
- Object pooling for performance (max 10 zombies)

### Post-Processing Effects
- Volumetric lighting (god rays)
- Configurable fog with cylindrical shader
- Zombie proximity visual effects

### Persistence
- IndexedDB for chunk storage with RLE compression
- Multiple save slots with unique seeds
- LocalStorage for settings
- Quick save (F5) and quick load (F9)

## Controls

| Key | Action |
|-----|--------|
| W, A, S, D | Move |
| SPACE | Jump / Fly Up (double-tap toggles flight) |
| C | Crouch / Fly Down |
| SHIFT | Sprint |
| F | Toggle Torch |
| E | Inventory |
| 1-9 / Scroll | Hotbar |
| Left Click | Break Block |
| Right Click | Place Block |
| F5 | Quick Save |
| F9 | Quick Load |
| ~ (Tilde) | Debug Overlay |
| ESC | Pause |

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | r160 | 3D rendering (loaded from CDN) |
| PointerLockControls | Three.js addon | First-person camera controls |
| IndexedDB | Browser API | Chunk persistence with RLE compression |
| LocalStorage | Browser API | Settings and save slots |
| Canvas API | Browser API | Procedural 16x16 textures (17-tile atlas) |
| Web Audio API | Browser API | Procedural sound synthesis |
| Web Workers | Browser API | Off-thread mesh generation |

## For Developers

### Quick Start

1. Clone this repo
2. Serve with any local server:
   - **VS Code**: Live Server extension
   - **Python**: `python -m http.server 8080`
   - **Node**: `npx serve`
3. Navigate to the served URL

### No Build Tools Required

Three.js is loaded from CDN via import map:
```html
<script type="importmap">
{
    "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
}
</script>
```

### Contributing

All code must remain in `voxEx.html` - this is the core design principle. See `CLAUDE.md` for detailed coding guidelines, JSDoc standards, and performance patterns.

Key guidelines:
- Use JSDoc for all public functions
- Prefer typed arrays (`Uint8Array`, `Float32Array`) for performance
- Use strict equality (`===`) everywhere
- Avoid allocations in hot paths (render loop, meshing)

## License

MIT

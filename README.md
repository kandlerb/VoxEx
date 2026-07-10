# VoxEx

**The Browser-Based Voxel Explorer** - A fully-featured voxel game engine inspired by Minecraft, running entirely in your browser.

## Play

- **Online**: https://kandlerb.github.io/VoxEx/
- **Offline**: Download `voxEx.html` and open in any modern browser

The launcher page runs browser compatibility tests (WebGL, GPU benchmarks) before starting the game.

## Architecture

VoxEx is a **single-file application** - the entire game (~46K lines) runs from one HTML file with embedded CSS and JavaScript. No build tools, no bundlers, no external dependencies beyond Three.js from CDN.

### Repository Structure

```
VoxEx/
├── index.html                # System check & launcher
├── voxEx.html                # Complete game (single file, ~46K lines)
├── CLAUDE.md                 # AI assistant guidelines
├── futureFeatures.md         # Feature roadmap
├── CCR's/                    # Change docs (design → implement → as-built)
├── docs/                     # Agent notes + live/shipped/historical docs
├── tools/                    # Development utilities
│   ├── KeyFrame_editor.html
│   ├── terrain-parameter-editor.html
│   ├── terrain-visualizer.html
│   ├── voxelEditor.html
│   ├── voxex-sound-formula.html
│   ├── voxex-texture-tests.html
│   ├── docs-viewer.html
│   ├── syntax-check.mjs          # All <script> blocks parse
│   ├── parity-check.mjs          # Main↔worker lockstep copies in sync
│   ├── terrain-node-checks.mjs   # Headless terrain invariants
│   ├── run-browser-tests.mjs     # Runs the browser suite headlessly
│   └── voxex-tests.html          # Test suite — runs against the real voxEx.html code via a ?test=1 seam
├── .githooks/                # Pre-commit gate (git config core.hooksPath .githooks)
└── .github/                  # Issue templates + CI
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

### 23 Block Types

Air, Grass, Dirt, Stone, Wood Planks, Oak Log, Oak Leaves, Bedrock, Sand, Water, Torch, Snow, Gravel, Longwood Log, Longwood Leaves, Glass, Fire, Burnt Log, Burnt Planks, Ice, Cracked Stone, Cracked Dirt, Cracked Planks

### Magic System

Press **M** to toggle magic mode: four spells (Explosion, Laser, Freeze, Fireball) with scroll-wheel power scaling (1-5), channeled casting, terrain carving, and block scarring. Fully touch-playable.

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
| M | Toggle Magic Mode |
| E | Inventory |
| V | Toggle Third-Person Camera |
| +/- | Zoom In/Out (third-person) |
| 1-9 / Scroll | Hotbar |
| Left Click | Break Block |
| Right Click | Place Block |
| F5 | Quick Save |
| F9 | Quick Load |
| O | Performance Overlay |
| ~ (Tilde) | Debug Overlay |
| ESC | Pause |

### Mobile / Touch

VoxEx is fully touch-playable on phones and tablets. Touch controls auto-activate on touch devices (configurable in **Settings → Touch Controls**: auto / on / off, plus look sensitivity, joystick size, button scale, and a left-handed layout). A floating left-thumb joystick handles analog movement (push to the edge to sprint), dragging the rest of the screen looks around, a short tap places a block and touch-and-hold mines, and on-screen buttons cover jump (double-tap to fly), crouch, torch, camera, inventory, and pause. Quick save/load and the perf/debug overlays appear as buttons in the pause menu. Desktop mouse/keyboard play is unchanged.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Three.js | r160 | 3D rendering (loaded from CDN) |
| PointerLockControls | Three.js addon | First-person camera controls |
| Web Workers | Browser API | Off-thread chunk mesh generation |
| Web Audio API | Browser API | Procedural sound synthesis |
| IndexedDB | Browser API | Chunk persistence with RLE compression |
| OPFS | Browser API | Origin Private File System disk cache |
| LocalStorage | Browser API | Settings and save slots |
| Canvas API | Browser API | Procedural 16x16 textures (40-tile atlas) |

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

### Running the Tests

The automated test suite (`tools/voxex-tests.html`) loads the real `voxEx.html` in a hidden iframe via a `?test=1` seam that exposes `window.VoxEx`. It runs 375+ tests (trust the suite's own counter) covering bootstrap, terrain, lighting, compression, meshing (including worker byte-parity), block-table invariants, VoxelWorld/collision/raycast, a live chunk-worker round-trip, persistence codecs, and an IndexedDB round-trip. It can also run headlessly: `node tools/run-browser-tests.mjs`.

Because the suite uses Workers and IndexedDB it **must** be served over a local web server — `file://` will not work.

1. Serve the repo root with any local server:
   - **VS Code**: Live Server extension
   - **Node**: `npx http-server`
2. Open `http://localhost:<port>/tools/voxex-tests.html`
3. The page loads `../voxEx.html?test=1` in a hidden iframe and reports a pass/fail summary.

The `?test=1` seam is inert in normal use — the game boots as usual without it.

### Contributing

All code must remain in `voxEx.html` - this is the core design principle. See `CLAUDE.md` for detailed coding guidelines, JSDoc standards, and performance patterns.

Key guidelines:
- Use JSDoc for all public functions
- Prefer typed arrays (`Uint8Array`, `Float32Array`) for performance
- Use strict equality (`===`) everywhere
- Avoid allocations in hot paths (render loop, meshing)

## License

MIT

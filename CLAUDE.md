# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx** is a fully-featured, browser-based voxel exploration game engine inspired by Minecraft. It runs entirely in the browser without requiring external servers or installations.

**Key Characteristics:**
- **Type**: Browser-based 3D voxel game engine
- **Platform**: HTML5 + JavaScript ES6 modules
- **Main File**: `voxEx.html` (single file - no exceptions)
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, Web Workers, Web Audio, IndexedDB, OPFS, LocalStorage
- **Lines of Code**: ~41,000

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
   - Graphics options: AO, shadows, fog, frustum culling, volumetrics
   - Movement options: sprint speed, fly speed, jump force
   - Customizable controls
   - Multiple save slots with unique seeds
   - All settings persist via LocalStorage

## Repository Structure

```
VoxEx/
├── index.html                # System check & launcher
├── voxEx.html                # Complete game (HTML + CSS + JS, ~41K lines)
├── CLAUDE.md                 # This file
├── README.md                 # Project readme
├── futureFeatures.md         # Feature roadmap
├── tools/                    # Development utilities
│   ├── KeyFrame_editor.html
│   ├── terrain-parameter-editor.html
│   ├── voxelEditor.html
│   └── voxex-sound-formula.html
└── .github/ISSUE_TEMPLATE/   # Bug/feature request templates
```

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Three.js** | 0.160.0 | 3D rendering, lighting, camera control |
| **PointerLockControls** | Three.js addon | First-person camera/input control |
| **Web Workers** | Native browser API | Off-thread chunk meshing via `ChunkWorkerPool` |
| **Web Audio API** | Native browser API | Procedural sound synthesis (zombie growls, etc.) |
| **IndexedDB** | Native browser API | Chunk data persistence with RLE compression |
| **OPFS** | Native browser API | Origin Private File System disk cache (`ChunkDiskStorage`) |
| **LocalStorage** | Native browser API | Game saves and settings storage |
| **Canvas API** | Native | Procedural texture generation (Atlas) |
| **WebGL** | Via Three.js | GPU-accelerated rendering |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ UI Layer (HTML/CSS)                                         │
│ - HUD: Crosshair, Hotbar, Block Name, Flight/Sprint Icons   │
│ - Menus: Start, Pause, Settings, Controls, Seed Selection   │
│ - Inventory: Drag-and-drop block selection (E key)          │
│ - Performance Overlay (O key)                               │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ Game Engine (RenderEngine + Three.js)                       │
│ - Camera (First/Third Person), Lighting (Day/Night), Skybox │
│ - Voxel Torch Model (BoxGeometry)                           │
│ - ParticleSystem (torch flames, water splashes)             │
│ - Post-Processing: Volumetric Lighting, Zombie Effects      │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ World Management System (VoxelWorld + TerrainGenerator)     │
│ ├─ Chunk Generation (16×16×320)                             │
│ ├─ ChunkWorkerPool (Web Workers for off-thread meshing)     │
│ ├─ ChunkMesher (geometry building, face culling, AO)        │
│ ├─ Biome System (Plains, Hills, Forests, Mountains,         │
│ │                Swamp, Longwoods)                          │
│ ├─ Structure Generation (Trees, Multi-trunk, Caves)         │
│ └─ ChunkNeighborCache (optimized neighbor lookups)          │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ Entity & Player Systems                                     │
│ ├─ PlayerController (movement, physics, collision)          │
│ ├─ EntityManager (zombie spawning, pooling)                 │
│ ├─ Mob / Zombie AI (detection, pathfinding, despawn)        │
│ └─ Zombie Effects (vignette, desaturation)                  │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ Memory & Performance Management                             │
│ ├─ MemoryBudgetManager (memory usage tracking/limits)       │
│ ├─ PerformanceMonitor (FPS, frame timing)                   │
│ ├─ Object Pools (Float32Array, Uint8Array, Uint32Array,     │
│ │                Vector3, ChunkData, GeometryBuffer)        │
│ └─ SeededRandom (deterministic PRNG)                        │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ Data Persistence Layer                                      │
│ ├─ IndexedDB (Chunk Cache with RLE Compression)             │
│ ├─ ChunkDiskStorage (OPFS-based disk cache)                 │
│ └─ LocalStorage (Game Saves & Settings)                     │
└─────────────────────────────────────────────────────────────┘
```

## Block Types (Current: 15 blocks)

| ID | Constant | Description |
|----|----------|-------------|
| 0 | `AIR` | Empty space |
| 1 | `GRASS` | Grass block (top/side/bottom textures) |
| 2 | `DIRT` | Dirt block |
| 3 | `STONE` | Stone block |
| 4 | `WOOD` | Wooden planks |
| 5 | `LOG` | Oak log (top/side textures) |
| 6 | `LEAVES` | Oak leaves (semi-transparent) |
| 7 | `BEDROCK` | Indestructible bottom layer |
| 8 | `SAND` | Sand block |
| 9 | `WATER` | Water (transparent, special rendering) |
| 10 | `TORCH` | Light-emitting torch block |
| 11 | `SNOW` | Snow block |
| 12 | `GRAVEL` | Gravel block |
| 13 | `LONGWOOD_LOG` | Longwood biome log (2×2/3×3 trunks) |
| 14 | `LONGWOOD_LEAVES` | Longwood biome leaves |
| 255 | `UNLOADED_BLOCK` | Placeholder for unloaded chunks |

**Texture Atlas**: `NUM_TILES = 17` tiles in a horizontal strip.

## Biome System (6 Biomes)

| Biome | Weight | Characteristics |
|-------|--------|-----------------|
| **Plains** | 2 | Flat terrain, sparse oak trees, baseHeight 62 |
| **Hills** | 2 | Rolling hills, moderate trees, amplitude 40 |
| **Forests** | 2 | Dense oak trees, moderate terrain |
| **Mountains** | 1 | High peaks (amplitude 180), conical pines, treeline logic |
| **Swamp** | 1 | Low baseHeight 58, water pools, droopy trees |
| **Longwoods** | 2 | Giant 2×2/3×3 trunk trees, heights 12-24, wide sparse canopies |

Biomes are configured in `BIOME_CONFIG` (~line 3946). Tags enable biome-specific behavior:
- `"mountain"` — enables treeline and alpine terrain
- `"forested"` — high tree density
- `"giant_trees"` — uses multi-block trunks

## Key Systems Explained

### Chunk System
- **Size**: 16×16×320 blocks (increased from 128 for taller mountains)
- **Structure**: `{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}`
- **Meshing**: `ChunkMesher` builds geometry; `ChunkWorkerPool` offloads to Web Workers
- **Pooling**: `ChunkDataPool`, `GeometryBufferPool`, `Float32ArrayPool` reduce allocations
- **Caching**: `ChunkNeighborCache` optimizes neighbor lookups during meshing
- **Optimization**: Hidden faces culled; Ambient Occlusion (AO) baked into vertex colors
- **Memory**: `MemoryBudgetManager` tracks and limits chunk memory usage
- **Backward Compatibility**: Supports both old (Uint8Array) and new (object) formats

### Lighting System
- **Light Levels**: 1-15 range (1 = minimum visibility, 15 = full sunlight)
- **Vertical Propagation**: Sunlight (15) travels down from sky, reduced by 1 per solid block
- **Horizontal Spreading**: Light spreads to neighbors in all 6 directions, -1 per block
- **Semi-Transparent Blocks**: Leaves reduce light by 1 instead of blocking completely
- **Vertex Colors**: Light levels multiplied by AO, applied as vertex colors during rendering
- **Dynamic Updates**: Light recalculated automatically when blocks change
- **Minimum Light**: Never drops to 0 — always at least 1 (0 is absence of light, never used)
- **Formula**: `vertexColor = AO × (lightLevel / 15.0)`

### Rendering System
- **Textures**: Procedurally generated 16×16 pixel art on a canvas (Atlas: 17 tiles)
- **Materials**: Lambert material for terrain; Transparent material for water
- **Fog**: Custom cylindrical fog shader for smooth horizon blending
- **Volumetric Effects**: God rays, volumetric fog (configurable via Settings › Graphics)
- **Particles**: `ParticleSystem` for torch flames, water splashes, etc.
- **Layers**: Layer 0 (world geometry), Layer 1 (viewmodels like torch)
- **Camera**: First-person and third-person (V key toggle); FOV 75° (80° when sprinting)
- **Web Workers**: `ChunkWorkerPool` offloads mesh generation to background threads

### Torch Viewmodel
- **Type**: 3D voxel model (stick + flame + glow) using BoxGeometry
- **Materials**: MeshLambertMaterial with emissive properties
- **Structure**:
  - Stick (0.04×0.25×0.04) — brown wood voxel
  - Flame (0.06×0.08×0.06) — orange voxel with 0.5 emissive
  - Glow (0.04×0.04×0.04) — yellow center, inside flame
- **Rendering**: Layer 1 with `depthTest: false` and `renderOrder: 1000`

### Entity System
- **EntityManager**: Handles zombie spawning, pooling, and lifecycle
- **Zombie AI**: Detection radius, player tracking, pathfinding
- **Effects**: Red vignette and desaturation when zombies nearby
- **Performance**: Object pooling (`zombiePool`), max 10 zombies

### Persistence
- **RLE Compression**: Chunk data (blocks + light) is Run-Length Encoded
- **Format Version**: v2 includes separate arrays for blocks, skyLight, blockLight
- **OPFS Disk Cache**: `ChunkDiskStorage` uses Origin Private File System for fast chunk caching
- **Save Format**: JSON with Seed, Player Pos/Rot, and RLE-compressed modified chunks
- **Quick Save/Load**: F5 saves, F9 loads (instant)
- **Backward Compatibility**: Decompressor handles both v1 and v2 formats

### Classes

| Class | Purpose |
|-------|---------|
| `VoxExGame` | Main game orchestrator, ties all systems together |
| `VoxelWorld` | World management, chunk loading/unloading |
| `TerrainGenerator` | Terrain and biome generation algorithms |
| `ChunkMesher` | Geometry mesh building from chunk data |
| `ChunkWorkerPool` | Web Worker management for off-thread meshing |
| `RenderEngine` | Three.js rendering pipeline |
| `PlayerController` | Player movement, physics, collision |
| `UIManager` | HUD, hotbar, inventory, movement indicators |
| `SettingsManager` | Settings persistence, UI binding |
| `InputManager` | Keyboard/mouse input handling |
| `AudioManager` | Procedural sounds (zombie growls, etc.) |
| `EntityManager` | Zombie spawning, lifecycle, pooling |
| `Mob` | Zombie entity AI implementation |
| `ParticleSystem` | Particle effects (torch flames, water, etc.) |
| `PerformanceMonitor` | FPS tracking, frame timing metrics |
| `MemoryBudgetManager` | Memory usage tracking and limits |
| `ChunkDiskStorage` | OPFS-based disk cache for chunks |
| `ChunkNeighborCache` | Optimized neighbor chunk lookups |
| `ChunkDataPool` | Object pooling for chunk data structures |
| `GeometryBufferPool` | GPU buffer reuse for meshes |
| `Float32ArrayPool` | Pool for Float32Array objects |
| `Uint8ArrayPool` | Pool for Uint8Array objects |
| `Uint32ArrayPool` | Pool for Uint32Array objects |
| `Vector3Pool` | Pool for Three.js Vector3 objects |
| `SeededRandom` | Deterministic PRNG for world generation |
| `SunlightTask` | Async sunlight propagation tasks |

## Naming Conventions

- `cx, cz`: Chunk coordinates
- `lx, ly, lz`: Local block coordinates (0-15 for x/z, 0-319 for y)
- `gx, gy, gz`: Global block coordinates
- `getChunkKey(cx, cz)`: Returns string `"cx,cz"`

## Controls

| Key | Action |
|-----|--------|
| W, A, S, D | Move |
| SPACE | Jump / Fly Up (double-tap toggles flight) |
| C | Crouch / Fly Down |
| SHIFT | Sprint |
| F | Toggle Torch |
| E | Open/Close Inventory |
| V | Toggle Third-Person Camera |
| +/- | Zoom In/Out (third-person) |
| 1-9 / Scroll | Select Hotbar Slot |
| Left Click | Mine Block |
| Right Click | Place Block |
| F5 | Quick Save |
| F9 | Quick Load |
| O | Toggle Performance Overlay |
| ~ (Tilde) | Toggle Debug Overlay |
| ESC | Pause / Navigate Menus |

## Development Guidelines

### When Modifying `voxEx.html`:
1. **Single File Rule**: ALL code stays in this ONE file — CSS, HTML, and JavaScript
2. **Texture Atlas**: If adding blocks, update `NUM_TILES` (~line 3514) and add texture generation in `initTextures`. Current count: **17**
3. **Block Config**: Add new blocks to `BLOCK_CONFIG` array (~line 3533). The system auto-derives inventory, textures, and transparency
4. **Biome Config**: Add new biomes to `BIOME_CONFIG` (~line 3946). Missing fields inherit from `BIOME_DEFAULTS`
5. **UI Overlay**: UI elements toggled via `controls.lock`/`unlock` events
6. **Light System**: When changing blocks, always call `calculateChunkSunlight()` to update lighting
7. **Chunk Format**: Use `chunk.blocks`, `chunk.skyLight`, `chunk.blockLight` (with backward compatibility checks)
8. **Voxel Aesthetic**: Use BoxGeometry only — no spheres, cylinders, or curved geometry

### Common Search Patterns
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`, `const DEFAULTS`
- **Block Types**: `const AIR`, `const GRASS`, `const LEAVES`, `BLOCK_CONFIG`
- **Biomes**: `BIOME_CONFIG`, `BIOME_DEFAULTS`, `getBiomeAt`
- **Gen**: `function generateChunkData`, `function calculateChunkSunlight`
- **Render**: `function renderChunk`, `function addFace`
- **Light**: `function getSkyLight`, `function setSkyLight`, `getLocalLight`
- **Input**: `const onKeyDown`, `function onKeyUp`, `onMouseWheel`
- **Compression**: `ChunkCompressor.compress`, `ChunkCompressor.decompress`
- **Core Classes**: `class VoxExGame`, `class VoxelWorld`, `class TerrainGenerator`
- **Rendering**: `class RenderEngine`, `class ChunkMesher`, `class ParticleSystem`
- **Player/Entity**: `class PlayerController`, `class EntityManager`, `class Mob`
- **UI/Settings**: `class UIManager`, `class SettingsManager`, `class InputManager`
- **Workers**: `class ChunkWorkerPool`, `class ChunkDiskStorage`
- **Memory**: `class MemoryBudgetManager`, `class PerformanceMonitor`
- **Pools**: `class ChunkDataPool`, `class GeometryBufferPool`, `class Float32ArrayPool`

### Light Level Reference
- **15**: Full sunlight (directly exposed to sky)
- **14**: 1 block from sun (under 1 leaf layer)
- **12-13**: Under tree canopy (2-3 leaf layers)
- **8-11**: Medium shade or cave opening
- **4-7**: Deep shade
- **2-3**: Deep cave
- **1**: Minimum light (always faintly visible — 0 never used)

### Performance Tips
- Prefer typed arrays (Uint8Array, Float32Array) over regular arrays
- Use object pooling for frequently created geometries
- Batch chunk updates with `scheduleChunkUpdate()` to avoid redundant rebuilds
- Keep render distance reasonable (8-16 chunks for most devices)
- Use scratch objects for hot-path functions (see `_pickDirTmp`, `_closestZombieResult`)

---

## JavaScript Code Quality Rules

These rules ensure maintainable, performant JavaScript in the single-file architecture.

### JSDoc Documentation Standards

The codebase uses JSDoc type definitions (~line 3347). All public functions require JSDoc.

**Core Type Definitions:**
```javascript
/** @typedef {number} BlockId */
/** @typedef {number} TileIndex */
/** @typedef {number} ChunkCoord */
/** @typedef {number} LocalCoord */
/** @typedef {number} GlobalCoord */
/** @typedef {string} ChunkKey */
/** @typedef {number} HexColor */
/** @typedef {number} LightLevel */
/** @typedef {number} AOValue */
/** @typedef {Object} Position3D */
/** @typedef {Object} AABB */
/** @typedef {Object} BlockHit */
/** @typedef {Object} BlockInteractionResult */
/** @typedef {Object} ChunkData */
/** @typedef {Object} BlockConfigEntry */
```

**Tree/Biome Type Definitions** (~line 3782+):
```javascript
/** @typedef {Object} NoiseConfig */
/** @typedef {Object} WorldConfig */
/** @typedef {Object} TrunkConfig */
/** @typedef {Object} CanopyConfig */
/** @typedef {'round'|'conical'|'spherical'|'layered'|'umbrella'} CanopyShape */
/** @typedef {Object} TreeConfig */
/** @typedef {Object} BiomeTreeConfig */
/** @typedef {Object} BiomeConfigEntry */
/** @typedef {BiomeConfigEntry & {name: string}} ResolvedBiome */
```

**Function Documentation Example:**
```javascript
/**
 * Generates terrain data for a chunk at the given coordinates.
 * @param {ChunkCoord} cx - Chunk X coordinate.
 * @param {ChunkCoord} cz - Chunk Z coordinate.
 * @param {number} seed - World seed for deterministic generation.
 * @returns {{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}} Chunk data object.
 */
function generateChunkData(cx, cz, seed) { ... }
```

**Rules:**
- Start with `/**` (not `/*` or `//`)
- Use lowercase for primitives: `number`, `string`, `boolean` (never `Number`, `String`)
- Document all parameters with `@param {type} name - Description.`
- Always include `@returns` for non-void functions
- Use `@throws` for functions that can throw
- Optional parameters: `@param {number} [timeout=1000] - Optional timeout in ms.`

### JavaScript-Specific Patterns

**Strict Equality Always:**
```javascript
// ✅ CORRECT
if (blockType === AIR) { ... }
if (chunk !== undefined) { ... }

// ❌ WRONG - type coercion bugs
if (blockType == 0) { ... }  // "" == 0 is true!
if (chunk != null) { ... }
```

**Typed Arrays for Performance:**
```javascript
// ✅ CORRECT - VoxEx standard
const blocks = new Uint8Array(16 * 16 * 320);
const positions = new Float32Array(vertexCount * 3);

// ❌ WRONG - GC pressure, slower iteration
const blocks = [];
blocks.push(GRASS);
```

**Nullish Coalescing for Defaults:**
```javascript
// ✅ CORRECT
const distance = options.renderDistance ?? DEFAULTS.renderDistance;

// ❌ WRONG - fails on 0 or empty string
const distance = options.renderDistance || DEFAULTS.renderDistance;
```

**Optional Chaining for Safety:**
```javascript
// ✅ CORRECT
const blockLight = chunk?.blockLight?.[index] ?? 0;

// ❌ WRONG - verbose and error-prone
const blockLight = chunk && chunk.blockLight && chunk.blockLight[index] !== undefined 
    ? chunk.blockLight[index] : 0;
```

**Array Methods vs Loops:**
```javascript
// ✅ For hot paths (render loop, meshing) - use for loops
for (let i = 0; i < vertices.length; i += 3) {
    positions[i] = vertices[i] * scale;
}

// ✅ For setup/config (runs once) - use array methods
const validBlocks = blockTypes.filter(b => b.solid);
const blockNames = blockTypes.map(b => b.name);
```

### Error Handling Patterns

**Guard Clauses at Function Start:**
```javascript
function setBlock(gx, gy, gz, blockType) {
    // ✅ Early validation
    if (gy < 0 || gy >= 320) return false;
    if (blockType < 0 || blockType >= BLOCK_COUNT) return false;
    
    // Main logic follows...
}
```

**Try-Catch at Boundaries Only:**
```javascript
// ✅ Wrap at system boundaries (save/load, IndexedDB)
async function loadWorld(saveName) {
    try {
        const data = await db.get(saveName);
        return parseWorldData(data);
    } catch (error) {
        logDebug(`[Save] Failed to load: ${error.message}`);
        return null;
    }
}

// ❌ Don't wrap internal pure functions
function calculateLight(x, y, z) {
    // No try-catch needed - pure computation
}
```

### Performance Measurement

```javascript
// Profile specific operations
console.time('[Chunks] Build mesh');
buildChunkMesh(cx, cz);
console.timeEnd('[Chunks] Build mesh');

// In DevTools Console:
// - Performance tab → Record → interact → Stop → analyze flame graph
// - Memory tab → Heap snapshot → check for geometry leaks
```

### Anti-Patterns to Avoid

| Anti-Pattern | Why | Fix |
|--------------|-----|-----|
| `==` instead of `===` | Type coercion bugs | Always use strict equality |
| `var` declarations | Hoisting confusion | Use `const` or `let` |
| `new Array(n)` for data | Sparse array issues | `new Uint8Array(n)` |
| String concat in loops | GC pressure | Template literals or array join |
| `for...in` on arrays | Iterates prototype | `for...of` or index loop |
| Anonymous funcs in hot paths | No profiler names | Named functions |
| `delete` on arrays | Creates holes | `splice()` or filter |
| Allocations in hot paths | GC pressure | Reuse scratch objects |

---

## Claude Code Guidelines

These rules tell Claude Code how to work on this repo without breaking things.

### Refactoring Scope
- You may refactor and reorganize code when it clearly improves **correctness**, **readability**, or **performance**
- Keep changes focused: avoid unrelated renames or style-only edits that create noisy diffs
- Never violate the **single-file rule**: all logic stays in `voxEx.html` (no new files or external assets)

### Bug Prevention & Optimization
- Before declaring any new `const`/`let`/function:
  - Quickly search the file for that name; **do not** redeclare an existing identifier in the same scope
  - Avoid confusing shadowing of important globals (e.g. `scene`, `camera`, `SETTINGS`, `WORLD_CONFIG`, `chunks`)
- When adding or changing settings:
  - Add a sane default in `DEFAULTS` (~line 5215), wire it into `SETTINGS` (~line 5001)
  - Ensure it round-trips via the save/load system
  - Make sure any new DOM IDs used in JS exist in the HTML
- Avoid heavy, deeply nested loops in hot paths (render loop, movement, chunk meshing):
  - Prefer at most **two** nested loops in per-frame code
  - For expensive operations, batch work over time, use existing caches, or limit to nearby chunks

### Logging & Debug Overlay
- Prefer `logDebug(...)` over raw `console.log(...)`, especially for:
  - Chunk cache, pre-generation, streaming/eviction
  - New systems (volumetric, zombie effects, lighting changes)
- Keep logs:
  - **Sparse** (no per-frame spam or per-block logging)
  - **Tagged** with short prefixes like `[PreGen]`, `[Chunks]`, `[Lighting]`, `[ZombieFX]`, `[Settings]`
- The `#debug-overlay` should show concise, high-value info only (FPS, position, chunk/mesh counts, face counts, seed, biome, etc.)

### Change Reporting

When you propose changes (patches/commits/PRs), format your explanation like this:

- **Summary** — 2–5 short bullets of what changed
- **Changes** — grouped bullets by subsystem (e.g. "Settings › Graphics › Effects", "World Pre-Gen", "Rendering › Volumetric")
- **Rationale** — a few sentences on *why* the changes were made (bug fix, performance, clarity)
- **Safety Checks** — explicitly mention that you:
  - Checked for duplicate or shadowed identifiers before new declarations
  - Verified new DOM IDs and settings are wired correctly
  - Avoided adding heavy loops or work to the per-frame/update path

---

## Quick Reference Checklist

Before committing, verify:

- [ ] No duplicate `const`/`let`/`function` declarations (search file first)
- [ ] No shadowing of globals: `scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`
- [ ] All new functions have JSDoc with `@param` and `@returns`
- [ ] Hot paths use `for` loops, not `.map()`/`.filter()`/`.forEach()`
- [ ] Typed arrays for numeric data (`Uint8Array`, `Float32Array`)
- [ ] Strict equality (`===`, `!==`) everywhere
- [ ] New settings have defaults in `DEFAULTS` and round-trip correctly
- [ ] New DOM IDs exist in HTML and match JS references
- [ ] Logs use `logDebug()` with `[Tag]` prefix, not `console.log()`
- [ ] No work added to the per-frame render loop without batching
- [ ] Chunk size is 16×16×320 (not 128)
- [ ] Atlas has 17 tiles (update `NUM_TILES` if adding blocks)

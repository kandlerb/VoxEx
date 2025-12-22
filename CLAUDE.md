# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx** is a fully-featured, browser-based voxel exploration game engine inspired by Minecraft. It runs entirely in the browser without requiring external servers or installations.

**Key Characteristics:**
- **Type**: Browser-based 3D voxel game engine
- **Platform**: HTML5 + JavaScript ES6 modules
- **Main File**: `voxEx.html` (single file - no exceptions)
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, IndexedDB, LocalStorage
- **Lines of Code**: ~23,000

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
├── .git/           # Git repository data
├── voxEx.html      # Complete application (HTML + CSS + JS)
└── CLAUDE.md       # This file
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

```
┌─────────────────────────────────────────────────────────────┐
│ UI Layer (HTML/CSS)                                         │
│ - HUD: Crosshair, Hotbar, Block Name, Flight/Sprint Icons   │
│ - Menus: Start, Pause, Settings, Controls, Seed Selection   │
│ - Inventory: Drag-and-drop block selection (E key)          │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ Game Engine (Three.js Renderer)                             │
│ - Camera (First Person), Lighting (Day/Night), Skybox       │
│ - Voxel Torch Model (BoxGeometry)                           │
│ - Post-Processing: Volumetric Lighting, Zombie Effects      │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ World Management System                                     │
│ ├─ Chunk Generation (16×16×320)                             │
│ ├─ Biome System (Plains, Hills, Forests, Mountains,         │
│ │                Swamp, Longwoods)                          │
│ ├─ Structure Generation (Trees, Multi-trunk, Caves)         │
│ └─ Block Logic (Optimized Face Culling, AO)                 │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ Entity System                                               │
│ ├─ EntityManager (zombie spawning, pooling)                 │
│ ├─ Zombie AI (detection, pathfinding, despawn)              │
│ └─ Zombie Effects (vignette, desaturation)                  │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│ Data Persistence Layer                                      │
│ ├─ IndexedDB (Chunk Cache with RLE Compression)             │
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

Biomes are configured in `BIOME_CONFIG` (~line 3223). Tags enable biome-specific behavior:
- `"mountain"` — enables treeline and alpine terrain
- `"forested"` — high tree density
- `"giant_trees"` — uses multi-block trunks

## Key Systems Explained

### Chunk System
- **Size**: 16×16×320 blocks (increased from 128 for taller mountains)
- **Structure**: `{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}`
- **Rendering**: Geometries are pooled (Float32Array) and batched per chunk
- **Optimization**: Hidden faces culled; Ambient Occlusion (AO) baked into vertex colors
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
- **Layers**: Layer 0 (world geometry), Layer 1 (viewmodels like torch)
- **Camera**: Near plane 0.01, far plane 800, FOV 75° (80° when sprinting)

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
- **Save Format**: JSON with Seed, Player Pos/Rot, and RLE-compressed modified chunks
- **Quick Save/Load**: F5 saves, F9 loads (instant)
- **Backward Compatibility**: Decompressor handles both v1 and v2 formats

### Manager Classes

| Class | Purpose |
|-------|---------|
| `UIManager` | HUD, hotbar, inventory, movement indicators |
| `SettingsManager` | Settings persistence, UI binding |
| `InputManager` | Keyboard/mouse input handling |
| `PostProcessingManager` | Volumetric lighting, zombie effects |
| `AudioManager` | Procedural sounds (zombie growls, etc.) |
| `EntityManager` | Zombie spawning, AI, pooling |

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
| 1-9 / Scroll | Select Hotbar Slot |
| Left Click | Mine Block |
| Right Click | Place Block |
| F5 | Quick Save |
| F9 | Quick Load |
| ~ (Tilde) | Toggle Debug Overlay |
| ESC | Pause / Navigate Menus |

## Development Guidelines

### When Modifying `voxEx.html`:
1. **Single File Rule**: ALL code stays in this ONE file — CSS, HTML, and JavaScript
2. **Texture Atlas**: If adding blocks, update `NUM_TILES` (~line 2803) and add texture generation in `initTextures`. Current count: **17**
3. **Block Config**: Add new blocks to `BLOCK_CONFIG` array (~line 2815). The system auto-derives inventory, textures, and transparency
4. **Biome Config**: Add new biomes to `BIOME_CONFIG` (~line 3223). Missing fields inherit from `BIOME_DEFAULTS`
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
- **Input**: `function onKeyDown`, `function onMouseWheel`
- **Compression**: `ChunkCompressor.compress`, `ChunkCompressor.decompress`
- **Managers**: `class UIManager`, `class EntityManager`, `class SettingsManager`

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

The codebase uses JSDoc type definitions (~line 2634). All public functions require JSDoc.

**Existing Type Definitions:**
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
  - Add a sane default in `DEFAULTS` (~line 4421), wire it into `SETTINGS` (~line 4278)
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

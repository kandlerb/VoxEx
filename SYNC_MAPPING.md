# VoxEx Code Mapping: Single-File → Modular

This document maps code sections from `voxEx.html` (source of truth) to the modular repository structure.

---

## 1. Repository Structure

### Modular Version Tree
```
VoxEx/
├── index.html                    # Entry point (minimal - loads modules)
├── styles/
│   └── main.css                  # All CSS styles
├── src/
│   ├── main.js                   # Entry point - initializes Game
│   ├── Game.js                   # Main game orchestrator class
│   │
│   ├── core/
│   │   ├── constants.js          # Block ID constants (AIR, GRASS, etc.)
│   │   ├── types.js              # JSDoc type definitions
│   │   └── index.js              # Core exports
│   │
│   ├── config/
│   │   ├── BlockConfig.js        # BLOCK_CONFIG, TILE, derived lookups
│   │   ├── BiomeConfig.js        # BIOME_CONFIG, BIOME_DEFAULTS, height functions
│   │   ├── WorldConfig.js        # WORLD_CONFIG, WORLD_DIMS, chunk helpers
│   │   ├── Settings.js           # SETTINGS, DEFAULTS, SETTINGS_PROFILES
│   │   ├── TreeConfig.js         # TREE_CONFIG, tree generation helpers
│   │   ├── PlayerConfig.js       # Player movement/physics constants
│   │   ├── PosePresets.js        # Player pose/animation presets
│   │   ├── ZombieConfig.js       # Zombie AI configuration
│   │   └── index.js              # Config exports
│   │
│   ├── input/
│   │   ├── InputManager.js       # Keyboard/mouse input handling
│   │   ├── ControlBindings.js    # Key bindings configuration
│   │   └── index.js
│   │
│   ├── math/
│   │   ├── noise.js              # Perlin/simplex noise functions
│   │   ├── SeededRandom.js       # Seeded random number generator
│   │   ├── animation.js          # Easing functions, spring physics
│   │   └── index.js
│   │
│   ├── optimization/
│   │   ├── BlockLookups.js       # Fast block property lookups (IS_TRANSPARENT, etc.)
│   │   ├── pools/
│   │   │   ├── Float32ArrayPool.js
│   │   │   ├── Uint32ArrayPool.js
│   │   │   ├── Uint8ArrayPool.js
│   │   │   ├── Vector3Pool.js
│   │   │   └── index.js
│   │   ├── caches/
│   │   │   ├── ChunkNeighborCache.js
│   │   │   ├── FaceVertexCache.js
│   │   │   └── index.js
│   │   └── index.js
│   │
│   ├── persistence/
│   │   ├── ChunkCompressor.js    # RLE compression for chunk data
│   │   └── index.js
│   │
│   ├── physics/
│   │   ├── AABB.js               # Axis-aligned bounding box
│   │   ├── Collision.js          # Collision detection
│   │   ├── Raycast.js            # Voxel raycasting (pickVoxel)
│   │   └── index.js
│   │
│   ├── world/
│   │   ├── Chunk.js              # Chunk utilities (getChunkKey, parseChunkKey)
│   │   ├── generation/
│   │   │   ├── ChunkGenerator.js # Main chunk generation
│   │   │   ├── TerrainGenerator.js # Height map, biome blending
│   │   │   ├── CaveGenerator.js  # Cave carving
│   │   │   ├── SurfaceDecorator.js # Surface block placement
│   │   │   ├── trees/
│   │   │   │   ├── TreeGenerator.js   # Tree placement logic
│   │   │   │   ├── CanopyBuilder.js   # Canopy shape generation
│   │   │   │   └── index.js
│   │   │   └── index.js
│   │   ├── lighting/
│   │   │   ├── LightingEngine.js     # Main lighting orchestration
│   │   │   ├── SkyLight.js           # Sunlight propagation
│   │   │   ├── BlockLight.js         # Torch/emissive light
│   │   │   ├── LightPropagation.js   # BFS light spreading
│   │   │   ├── CrossChunkLight.js    # Cross-chunk light sync
│   │   │   ├── LightConstants.js     # Light level constants
│   │   │   ├── SunlightTask.js       # Async sunlight calc
│   │   │   └── index.js
│   │   └── index.js
│   │
│   ├── entities/
│   │   ├── Entity.js             # Base entity class
│   │   ├── EntityManager.js      # Entity spawning, pooling, lifecycle
│   │   ├── player/
│   │   │   ├── PlayerController.js  # Player physics, movement
│   │   │   ├── PlayerAnimation.js   # Player pose animation
│   │   │   └── index.js
│   │   ├── mobs/
│   │   │   ├── Zombie.js         # Zombie entity
│   │   │   ├── ZombieAI.js       # Zombie AI behavior
│   │   │   └── index.js
│   │   └── index.js
│   │
│   ├── render/
│   │   ├── RenderEngine.js       # Main Three.js renderer setup
│   │   ├── meshing/
│   │   │   ├── ChunkMesher.js    # Chunk mesh building
│   │   │   ├── FaceCulling.js    # Hidden face culling
│   │   │   └── index.js
│   │   ├── materials/
│   │   │   ├── TerrainMaterial.js # Terrain shader material
│   │   │   ├── WaterMaterial.js   # Water shader material
│   │   │   └── index.js
│   │   ├── textures/
│   │   │   ├── TextureAtlas.js   # Procedural texture generation
│   │   │   └── index.js
│   │   ├── models/
│   │   │   ├── TorchModel.js     # Torch viewmodel
│   │   │   └── index.js
│   │   ├── sky/
│   │   │   ├── DayNightCycle.js  # Day/night cycle
│   │   │   └── index.js
│   │   ├── effects/
│   │   │   ├── PostProcessing.js # Volumetric, zombie effects
│   │   │   └── index.js
│   │   └── index.js
│   │
│   ├── audio/
│   │   ├── SoundPlayer.js        # Audio playback
│   │   ├── formulas/
│   │   │   └── index.js          # Procedural sound formulas
│   │   └── index.js
│   │
│   └── ui/
│       ├── UIManager.js          # Main UI orchestrator
│       ├── hud/
│       │   ├── Crosshair.js      # Crosshair component
│       │   ├── Hotbar.js         # Hotbar component
│       │   ├── DebugOverlay.js   # Debug overlay (~ key)
│       │   ├── StatusIndicators.js # Sprint/fly/crouch indicators
│       │   └── index.js
│       ├── menus/
│       │   ├── MainMenu.js       # Main menu
│       │   ├── PauseMenu.js      # Pause menu
│       │   ├── SettingsMenu.js   # Settings menu
│       │   └── index.js
│       ├── inventory/
│       │   ├── InventoryScreen.js # Inventory UI
│       │   └── index.js
│       ├── overlays/
│       │   ├── LoadingOverlay.js # Loading screen
│       │   ├── ChunkIndicator.js # Chunk loading indicator
│       │   └── index.js
│       └── index.js
```

---

## 2. voxEx.html Section Map

| Line Range | Section | Purpose |
|------------|---------|---------|
| 7-3232 | `<style>` | All CSS styles |
| 3234 | `<script type="module">` | Start of main JS |
| 3235-3253 | Block ID Constants | `AIR`, `GRASS`, `DIRT`, etc. |
| 3255-3340 | JSDoc Type Definitions | `@typedef` for BlockId, ChunkCoord, etc. |
| 3402-3425 | Texture Tile Indices | `TILE` object, `NUM_TILES` |
| 3427-3587 | BLOCK_CONFIG | Block configuration array |
| 3589-3670 | Derived Block Structures | `BLOCK_BY_ID`, tag-based Sets, `INVENTORY_BLOCKS` |
| 3672-3683 | Block Helper Functions | `isLeafBlock()`, `isLogBlock()` |
| 3700-3710 | WORLD_CONFIG | World generation parameters |
| 3711-3843 | Tree Type Definitions | JSDoc for TrunkConfig, CanopyConfig, etc. |
| 3845-4001 | BIOME_CONFIG | All biome definitions |
| 4003-4057 | BIOME_DEFAULTS | Default biome values |
| 4059-4127 | TREE_CONFIG | Default tree parameters |
| 4129-4270 | Tree Helper Functions | `resolveTreeProfile()`, `pickTrunkSize()` |
| 4270-4547 | Tree Generation | `getChunkTreePositions()`, `generateTreesForChunk()` |
| 4548-4900 | Canopy Generation | `getCanopyLayerRadius()`, `forEachCanopyVoxel()` |
| 4898-5090 | SETTINGS | Runtime settings object |
| 5091-5275 | DEFAULTS | Default settings values |
| 5277-5329 | SETTINGS_PROFILES | Performance/Balanced/Quality presets |
| 5338-5468 | Settings UI Init | `initSettingsUI()` |
| 5468-5520 | Utility Functions | Pooled objects, `playerIntersectsBlock()`, `dist2DSq()` |
| 5522-5556 | Pool Initialization | Three.js pooled objects |
| 5558-5695 | SettingsManager Class | Settings persistence and management |
| 5703-5855 | InputManager Class | Keyboard/mouse input handling |
| 5881-5946 | Terrain Generator Start | TerrainGenerator class header |
| 5946-6265 | Noise & Height Functions | `noise2D()`, `blendedHeight()`, biome height funcs |
| 6265-6333 | Tree Mask Functions | `getTreeMask()` |
| 6348-6850 | VoxelWorld Class | World data management, block get/set |
| 6878-6981 | ChunkMesher Class | Mesh building for chunks |
| 6997-7275 | RenderEngine Class | Three.js scene, camera, lighting setup |
| 7298-7631 | AudioManager Class | Procedural audio, sound effects |
| 7639-7820 | EntityManager Class | Entity lifecycle, zombie spawning |
| 7828-7881 | Mob Class | Base mob class |
| 7890-8126 | Zombie Class | Zombie entity and AI |
| 8134-8519 | PlayerController Class | Player physics, collision, movement |
| 8538-9096 | UIManager Class | UI state, menus, HUD |
| 9110-9312 | VoxExGame Class | Main game orchestrator |
| 9332-9425 | Texture Initialization | `registerPixelTexture()`, AO lookup |
| 9427-10819 | Optimizations | 50 optimization systems |
| 10819-10997 | Performance Overlay | FPS monitoring, perf overlay update |
| 11000-12120 | Player Animation | Third-person, knockdown, pose system |
| 12129-12474 | ParticleSystem Class | Torch particles, block break particles |
| 12500-12558 | Footstep Particles | `updateFootstepParticles()` |
| 12564-12722 | Star Field | `createStarField()`, `updateStars()` |
| 12729-12930 | Cloud Plane | `createCloudPlane()`, `updateClouds()` |
| 12944-13280 | Water Ripples | Ripple geometry, spawning, update |
| 13292-13490 | Water Splash Effects | Entry splash, landing dust, splash column |
| 13500-13634 | Water Velocity Effects | Swim wake, underwater bubbles |
| 13639-13740 | Color Grading | `createColorGradingPass()`, `updateColorGrading()` |
| 13741-14000 | Material Updates | Water material settings |
| 14000-16000 | Chunk Rendering | `renderChunk()`, `addFace()`, AO calculation |
| 16000-18000 | Lighting System | `calculateChunkSunlight()`, light propagation |
| 18000-20000 | World Generation | Terrain generation, cave carving |
| 20000-22000 | Save/Load System | IndexedDB persistence, RLE compression |
| 22000-24000 | Game Loop | `animate()`, `update()`, frame scheduling |
| 24000-26000 | Initialization | Scene setup, event handlers |
| 26000-28000 | HTML Elements | Menu HTML, hotbar slots |
| 28000-30319 | UI HTML & Final | Settings panels, inventory UI |

---

## 3. Module-to-Source Mapping

### src/core/constants.js
**Purpose**: Block ID constants
**voxEx.html Source Lines**: 3238-3253
**Exports**:
- `AIR`, `GRASS`, `DIRT`, `STONE`, `WOOD`, `LOG`, `LEAVES`, `BEDROCK`, `SAND`, `WATER`, `TORCH`, `SNOW`, `GRAVEL`, `LONGWOOD_LOG`, `LONGWOOD_LEAVES`, `UNLOADED_BLOCK`
- `BLOCK_IDS` (object with all IDs)
- `BLOCK_COUNT`

**Status**: ✅ Matches source

---

### src/config/BlockConfig.js
**Purpose**: Block type definitions and configuration
**voxEx.html Source Lines**: 3406-3425 (TILE), 3438-3587 (BLOCK_CONFIG), 3625-3666 (derived)
**Exports**:
- `TILE` - Texture tile indices
- `NUM_TILES` - 17
- `BLOCK_CONFIG` - Block configuration array
- `BLOCK_BY_ID` - Fast ID lookup
- `blockIds` - Key to ID mapping
- `LOG_BLOCK_IDS`, `LEAF_BLOCK_IDS`, `TRANSPARENT_BLOCK_IDS`, `FLUID_BLOCK_IDS`
- `INVENTORY_BLOCKS` - Blocks shown in inventory
- `initialHotbarSlots` - Default hotbar
- `isLeafBlock()`, `isLogBlock()`, `isTransparent()`, `isFluid()`

**Status**: ✅ Matches source

---

### src/config/BiomeConfig.js
**Purpose**: Biome definitions for terrain generation
**voxEx.html Source Lines**: 3845-4001 (BIOME_CONFIG), 3989-4001 (BIOME_DEFAULTS)
**Exports**:
- `BIOME_CONFIG` - All biome definitions
- `BIOME_DEFAULTS` - Default values
- `defaultHeightFunc()`, `plainsHeightFunc()`, `hillsHeightFunc()`, `mountainsHeightFunc()`
- `buildBiomesFromConfig()`
- `getBiomeNames()`, `getBiomeCount()`

**Status**: ✅ Matches source

---

### src/config/WorldConfig.js
**Purpose**: World dimensions and configuration
**voxEx.html Source Lines**: 3702-3710 (WORLD_CONFIG)
**Exports**:
- `WORLD_CONFIG` - Seed, biome frequency, noise config
- `WORLD_DIMS` - chunkSize (16), chunkHeight (320), yOffset (0), seaLevel (60)
- `CHUNK_SIZE`, `CHUNK_HEIGHT`, `Y_OFFSET`, `SEA_LEVEL`, `CHUNK_VOLUME`
- `getChunkKey()`, `parseChunkKey()`, `worldToChunk()`, `getBlockIndex()`

**Status**: ✅ Matches source

---

### src/config/Settings.js
**Purpose**: Game settings and profiles
**voxEx.html Source Lines**: 4898-5090 (SETTINGS), 5091-5275 (DEFAULTS), 5277-5329 (PROFILES)
**Exports**:
- `DEFAULTS` - All default setting values
- `SETTINGS_PROFILES` - performance/balanced/quality presets
- `createDefaultSettings()`, `applyProfile()`, `getProfileNames()`

**Discrepancies Found**:
- ⚠️ Module only exports `DEFAULTS`, not runtime `SETTINGS` object
- ⚠️ Missing localStorage loading logic from source
- ⚠️ Missing `CUSTOM_PROFILE` and `activeProfileName` state

---

### src/config/TreeConfig.js
**Purpose**: Tree generation configuration
**voxEx.html Source Lines**: 4059-4127 (TREE_CONFIG)
**Exports**:
- `TREE_CONFIG` - Default tree parameters (trunk, canopy, blocks, spacing)
- `DEFAULT_TREE_GROUND_BLOCKS`
- `resolveTreeProfile()`

**Status**: ✅ Matches source

---

### src/ui/UIManager.js
**Purpose**: UI state management and orchestration
**voxEx.html Source Lines**: 8538-9096
**Exports**:
- `UIManager` class

**Discrepancies Found**:
- ⚠️ **ARCHITECTURE DIFFERS**: Source is integrated class; module creates separate DOM elements
- ⚠️ Source has DOM element caching; module creates elements programmatically
- ⚠️ Source references existing HTML elements; module generates HTML
- ⚠️ Missing: `initButtonAudio()`, `updateChunkLoaderStatus()`, inventory drag-drop

---

### src/Game.js
**Purpose**: Main game orchestrator
**voxEx.html Source Lines**: 9110-9312 (VoxExGame)
**Exports**:
- `Game` class

**Discrepancies Found**:
- ⚠️ Source class is `VoxExGame`, module is `Game`
- ⚠️ Module missing: many optimization systems, particles, effects
- ⚠️ Module has simpler structure; source has extensive integration

---

### src/world/lighting/SkyLight.js
**Purpose**: Sunlight calculation
**voxEx.html Source Lines**: ~16000-18000 (spread across file)
**Exports**:
- `calculateChunkSunlight()`

**Status**: ⚠️ Needs verification against source implementation

---

### src/render/meshing/ChunkMesher.js
**Purpose**: Chunk mesh building
**voxEx.html Source Lines**: 6878-6981 (ChunkMesher), ~14000-16000 (renderChunk)
**Exports**:
- `buildChunkMesh()`
- `disposeChunkGeometry()`

**Status**: ⚠️ Needs verification - meshing logic is critical for visuals

---

### src/render/textures/TextureAtlas.js
**Purpose**: Procedural texture generation
**voxEx.html Source Lines**: ~9332-9425, ~26000+ (initTextures)
**Exports**:
- `createTextureAtlas()`

**Status**: ⚠️ Critical for visual parity - verify all 17 textures match

---

### src/entities/player/PlayerController.js
**Purpose**: Player physics and movement
**voxEx.html Source Lines**: 8134-8519
**Exports**:
- `PlayerController` class

**Status**: ⚠️ Verify physics constants match source

---

### styles/main.css
**Purpose**: All game styles
**voxEx.html Source Lines**: 7-3232
**Status**: ⚠️ Need line-by-line comparison

---

## 4. Critical Discrepancies Report

### CSS Gap Analysis
**Source (voxEx.html)**: 3,225 lines of CSS (lines 7-3232)
**Module (styles/main.css)**: 971 lines
**Gap**: ~2,254 lines MISSING (70% of styles)

Missing CSS includes:
- Settings panel styling (sub-panels, group headers)
- Inventory UI (drag-drop, slot animations)
- Loading screens and transitions
- Chunk loader overlay
- Debug overlay formatting
- Pose debug panel
- Performance overlay
- Water effect overlays
- Many hover/active states

### Settings Gap Analysis
**Source DEFAULTS**: 184 lines (5091-5275)
**Module DEFAULTS**: 198 lines (11-209)
**Status**: ✅ Content appears to match

### P0 - Breaks Core Functionality

| Module | Issue | Source | Module |
|--------|-------|--------|--------|
| Settings.js | Missing runtime SETTINGS loading | Lines 4898-5090 | Only exports DEFAULTS |
| Game.js | Missing world save/load | Lines ~22000-24000 | Placeholder only |

### P1 - Affects Visual Appearance

| Module | Issue | Source | Module |
|--------|-------|--------|--------|
| TextureAtlas.js | Texture generation | Inline in source | Separate module - verify output |
| ChunkMesher.js | AO calculation | Integrated in source | Separate - verify AO values |
| DayNightCycle.js | Sun/moon colors | SETTINGS values | May use different defaults |
| styles/main.css | CSS completeness | 3225 lines | 972 lines - MISSING CONTENT |

### P2 - Affects Gameplay Feel

| Module | Issue | Source | Module |
|--------|-------|--------|--------|
| PlayerController | Physics constants | SETTINGS values | May use different defaults |
| InputManager | Key bindings | Integrated | Separate config |

### P3 - Missing Features (in module but not implemented)

| Feature | Source Lines | Module Status |
|---------|-------------|---------------|
| Star field | 12564-12722 | Not implemented |
| Cloud plane | 12729-12930 | Not implemented |
| Water ripples | 12944-13280 | Not implemented |
| Water splash | 13292-13490 | Not implemented |
| Particle system | 12129-12474 | Not implemented |
| Color grading | 13639-13740 | Not implemented |
| Post-processing | Various | Minimal |
| Third-person mode | 11000-12120 | Not implemented |
| Pose debug panel | CSS + JS | Not implemented |
| Performance overlay | 10819-10997 | Not implemented |

### P4 - Extra Features (in module, not in source)

None identified - module is subset of source.

---

## 5. Synchronization Checklist

### Phase 1: CSS Sync (Critical for Visual Parity)
- [ ] Copy entire `<style>` block (lines 7-3232) from voxEx.html
- [ ] Paste into styles/main.css (replacing current content)
- [ ] Verify all UI elements render correctly

### Phase 2: Constants & Config Sync
- [ ] `src/core/constants.js` - Verify block IDs match (3238-3253)
- [ ] `src/config/BlockConfig.js` - Verify TILE, BLOCK_CONFIG (3406-3587)
- [ ] `src/config/BiomeConfig.js` - Verify BIOME_CONFIG (3845-4001)
- [ ] `src/config/WorldConfig.js` - Verify WORLD_CONFIG, WORLD_DIMS
- [ ] `src/config/Settings.js` - Add runtime SETTINGS, localStorage loading
- [ ] `src/config/TreeConfig.js` - Verify TREE_CONFIG (4059-4127)

### Phase 3: Core Systems Sync
- [ ] `src/world/lighting/SkyLight.js` - Verify calculateChunkSunlight
- [ ] `src/render/meshing/ChunkMesher.js` - Verify meshing, AO calculation
- [ ] `src/render/textures/TextureAtlas.js` - Verify all 17 textures
- [ ] `src/entities/player/PlayerController.js` - Verify physics

### Phase 4: UI System Sync
- [ ] `src/ui/UIManager.js` - Consider rewriting to match source approach
- [ ] Add missing UI components (inventory drag-drop, etc.)
- [ ] Verify hotbar, crosshair, debug overlay

### Phase 5: Missing Features
- [ ] Add ParticleSystem
- [ ] Add Star field
- [ ] Add Cloud plane
- [ ] Add Water effects (ripples, splash, wake)
- [ ] Add Color grading
- [ ] Add Post-processing effects
- [ ] Add Performance overlay

### Phase 6: index.html Sync
- [ ] Add all HTML elements from voxEx.html (26000-30319)
- [ ] Add blocker, menus, settings panels, inventory UI

---

## 6. File Comparison Commands

To compare specific sections:

```bash
# Extract CSS from voxEx.html
sed -n '7,3232p' voxEx.html > /tmp/voxex-css.txt

# Extract SETTINGS from voxEx.html
sed -n '4898,5090p' voxEx.html > /tmp/voxex-settings.txt

# Extract DEFAULTS from voxEx.html
sed -n '5091,5275p' voxEx.html > /tmp/voxex-defaults.txt

# Compare with module
diff /tmp/voxex-defaults.txt src/config/Settings.js
```

---

## 7. Verification Checklist

After sync, verify:

- [ ] All 17 textures render identically
- [ ] Block colors match (grass green, water blue, etc.)
- [ ] Day/night cycle colors match
- [ ] Fog colors and distances match
- [ ] UI styling identical (hotbar, menus, debug overlay)
- [ ] Settings menu has all options
- [ ] Settings persist correctly
- [ ] Player movement feels identical
- [ ] Chunk loading/rendering identical

---

*Generated for VoxEx sync project*
*Source: voxEx.html (30,319 lines)*
*Target: Modular version (85+ files)*

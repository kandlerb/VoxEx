# VoxEx Code Map (30,319 lines)

A comprehensive structural analysis of the VoxEx single-file voxel engine, prepared for modular restructuring.

## File Sections (in order)

| # | Lines | Section Name | Description |
|---|-------|--------------|-------------|
| 1 | 1-1545 | HTML/CSS | Document structure, styles (~500+ CSS rules), UI elements |
| 2 | 1540-1545 | Import Map | Three.js CDN imports configuration |
| 3 | 1547-3160 | HTML UI Elements | DOM elements (menus, HUD, overlays, settings panels) |
| 4 | 3165-3233 | Settings Panel JS | Initial script for settings UI navigation |
| 5 | 3235-3253 | Block ID Constants | AIR=0 through UNLOADED_BLOCK=255 |
| 6 | 3255-3400 | JSDoc Type Definitions | Type annotations for BlockId, ChunkCoord, etc. |
| 7 | 3402-3620 | TILE Constants | Texture atlas tile index mapping |
| 8 | 3427-3620 | BLOCK_CONFIG | Block definitions array (15 blocks) |
| 9 | 3625-3700 | Block Lookup Tables | BLOCK_BY_ID, LOG_BLOCK_IDS, LEAF_BLOCK_IDS, etc. |
| 10 | 3702-3840 | WORLD_CONFIG | World dimensions and generation parameters |
| 11 | 3845-3985 | BIOME_CONFIG | 6 biome definitions (Plains, Hills, Forests, Mountains, Swamp, Longwoods) |
| 12 | 3989-4100 | BIOME_DEFAULTS | Default biome parameters |
| 13 | 4059-4900 | TREE_CONFIG | Tree generation profiles and algorithms |
| 14 | 4900-5090 | SETTINGS | Runtime settings object |
| 15 | 5091-5275 | DEFAULTS | Default settings values |
| 16 | 5277-5330 | SETTINGS_PROFILES | Performance/Ultra/Low/etc. presets |
| 17 | 5338-5510 | initSettingsUI() | Settings panel DOM bindings |
| 18 | 5459-5510 | WORLD_DIMS | Chunk size constants (16x16x320) |
| 19 | 5516-5520 | ES6 Imports | THREE, PointerLockControls, EffectComposer, etc. |
| 20 | 5522-5555 | Class Architecture Start | VOXEX CLASS-BASED ARCHITECTURE header |
| 21 | 5558-5700 | SettingsManager Class | Settings persistence and listeners |
| 22 | 5703-5880 | InputManager Class | Keyboard/mouse input handling |
| 23 | 5883-6330 | TerrainGenerator Class | Noise functions, height calculation, biome blending |
| 24 | 6348-6850 | VoxelWorld Class | Chunk storage, block access, world streaming |
| 25 | 6878-6995 | ChunkMesher Class | Mesh building (delegates to globals) |
| 26 | 6997-7275 | RenderEngine Class | Three.js scene, camera, lighting, fog |
| 27 | 7298-7630 | AudioManager Class | Web Audio API sounds (clicks, footsteps, zombie growls) |
| 28 | 7639-7825 | EntityManager Class | Entity pooling and zombie management |
| 29 | 7828-7880 | Mob Base Class | Base entity with position/velocity |
| 30 | 7890-8125 | Zombie Class | Zombie AI, detection, pathfinding |
| 31 | 8134-8530 | PlayerController Class | Movement, camera, block interaction |
| 32 | 8538-9095 | UIManager Class | HUD, inventory, menus, DOM caching |
| 33 | 9110-9360 | VoxExGame Class | Main orchestrator (init, loop, update, render) |
| 34 | 9369-9390 | Pre-computed Arrays | NEIGHBOR_OFFSETS, FACE_DIRECTIONS |
| 35 | 9397-9470 | Texture Registration | Pixel texture anisotropy handling |
| 36 | 9471-9550 | Uint8ArrayPool Class | Memory pooling for chunk data |
| 37 | 9559-9700 | LOD System | LOD_CONFIG, distance-based simplification |
| 38 | 9700-10800 | Optimization Systems | 50 numbered optimization utilities |
| 39 | 10819-10920 | Performance Overlay | FPS/memory monitoring |
| 40 | 10910-11070 | Core Global State | scene, camera, renderer, chunks, etc. |
| 41 | 11074-11200 | ZOMBIE_CONFIG | Zombie behavior parameters |
| 42 | 11100-11320 | PLAYER_PROPORTIONS | Player body proportions |
| 43 | 11325-11600 | POSE_PRESETS | Animation pose definitions |
| 44 | 11600-12100 | Third Person Camera | Orbit camera, knockdown animation |
| 45 | 12120-12500 | ParticleSystem Class | GPU-accelerated particles |
| 46 | 12500-12700 | Footstep Particles | Movement dust effects |
| 47 | 12564-12720 | Star Field | Procedural night sky stars |
| 48 | 12729-12930 | Cloud System | Volumetric cloud rendering |
| 49 | 12934-13500 | Water Effects | Ripples, wading, splashes, bubbles |
| 50 | 13634-13770 | Color Grading | Day/night color correction |
| 51 | 13770-14050 | Chunk Update System | Deferred updates, neighbor reconciliation |
| 52 | 14050-14600 | Edge Lighting System | Cross-chunk light propagation |
| 53 | 14622-14700 | Face Vertex Cache | Cached face geometry templates |
| 54 | 14699-14900 | SeededRandom Class | Deterministic RNG |
| 55 | 14759-14850 | Float32ArrayPool | Geometry buffer pooling |
| 56 | 14894-14950 | Noise Functions | noise2D, noise3D, fbm2D |
| 57 | 14953-15200 | UI Helpers | setHUDVisible, setPauseState |
| 58 | 15198-15340 | World Preview | Mini-map terrain preview |
| 59 | 15340-15600 | World Presets | Preset terrain configurations |
| 60 | 15449-15800 | World Cards | Save slot UI management |
| 61 | 15838-16000 | Thumbnail Capture | World screenshot system |
| 62 | 16080-16200 | Settings Search | Searchable settings list |
| 63 | 16266-16430 | Clipboard/Toast | UI utilities |
| 64 | 16435-16500 | Global Block Functions | getBlock, getSkyLight, setBlock wrappers |
| 65 | 16500-17000 | Light Queue System | Incremental lighting updates |
| 66 | 16589-16860 | SunlightTask Class | Async sunlight propagation |
| 67 | 17000-17200 | Shadow System | Shadow map configuration |
| 68 | 17232-17420 | RLE Compression | ChunkCompressor for save data |
| 69 | 17423-17600 | Save Manager | World persistence (IndexedDB) |
| 70 | 17574-17800 | Pre-generation | Spawn area chunk pre-loading |
| 71 | 17787-20260 | Main Init | Scene setup, materials, shaders, controls |
| 72 | 20077-20150 | Block Optimization Init | BLOCK_IS_SOLID, BLOCK_IS_OPAQUE tables |
| 73 | 20263-21000 | Texture Generation | Procedural 16x16 pixel art atlas |
| 74 | 21186-21340 | Cylindrical Fog | Custom fog shader |
| 75 | 21371-22800 | Zombie Textures | Procedural zombie skin generation |
| 76 | 22803-23260 | Zombie Collision | Zombie physics and spawning |
| 77 | 23263-25000 | Player Model | Third-person player body mesh |
| 78 | 25085-25800 | Animation System | Pose interpolation, walking cycles |
| 79 | 25829-26130 | Terrain Globals | Mountain terrain algorithms |
| 80 | 26318-26460 | Sunlight Calculation | calculateChunkSunlight |
| 81 | 26469-26630 | Block Light | calculateBlockLight |
| 82 | 26630-27000 | Mountain Generation | Detailed alpine terrain |
| 83 | 27005-27950 | generateChunkData | Main terrain generation function |
| 84 | 27120-27700 | AO System | Ambient occlusion calculation |
| 85 | 27710-28000 | Indexed Geometry | 4-vertex face functions |
| 86 | 27955-28600 | renderChunk | Main chunk meshing function |
| 87 | 28320-28900 | Chunk Streaming | Loading, eviction, fog updates |
| 88 | 28900-29700 | Day/Night Cycle | Sun/moon position, lighting |
| 89 | 29700-30000 | Volumetric Lighting | God rays, point light glow |
| 90 | 30028-30320 | Main Loop | animate() function, resize handler |

## Classes (21 total)

| Class | Line | Size | System | Purpose |
|-------|------|------|--------|---------|
| SettingsManager | 5558 | ~145 | Core | Settings persistence with localStorage, change listeners |
| InputManager | 5703 | ~180 | Input | Keyboard/mouse state tracking, key bindings |
| TerrainGenerator | 5883 | ~445 | World | Perlin noise, biome blending, height calculation |
| VoxelWorld | 6348 | ~500 | World | Chunk Map, block get/set, light access, streaming |
| ChunkMesher | 6878 | ~115 | Render | Delegates to global meshing functions |
| RenderEngine | 6997 | ~275 | Render | Three.js scene, camera, lighting, post-processing |
| AudioManager | 7298 | ~330 | Audio | Web Audio API oscillators, sound effects |
| EntityManager | 7639 | ~185 | Entity | Entity pooling, zombie spawn/despawn tracking |
| Mob | 7828 | ~60 | Entity | Base class with position, velocity, rotation |
| Zombie | 7890 | ~235 | Entity | AI detection, pathfinding, player tracking |
| PlayerController | 8134 | ~400 | Player | Movement physics, collision, block interaction |
| UIManager | 8538 | ~555 | UI | DOM caching, HUD updates, inventory management |
| VoxExGame | 9110 | ~250 | Core | Main orchestrator, game loop, initialization |
| Uint8ArrayPool | 9472 | ~85 | Perf | Memory pooling for chunk block arrays |
| Vector3Pool | 9734 | ~80 | Perf | Reusable Vector3 objects |
| ChunkNeighborCache | 10584 | ~90 | Perf | Cached neighbor chunk lookups |
| ParticleSystem | 12129 | ~360 | FX | GPU instanced particles, smoke, dust |
| SeededRandom | 14699 | ~50 | Util | Deterministic pseudo-random generator |
| Float32ArrayPool | 14759 | ~80 | Perf | Geometry buffer pooling |
| Uint32ArrayPool | 14843 | ~55 | Perf | Index buffer pooling |
| SunlightTask | 16589 | ~270 | Light | Async sunlight propagation state machine |

## Major Functions (50+ significant)

| Function | Line | System | Purpose |
|----------|------|--------|---------|
| validateBlockConfig | 3594 | Config | Validates BLOCK_CONFIG array integrity |
| buildBiomesFromConfig | 4010 | World | Constructs biome objects from BIOME_CONFIG |
| resolveTreeProfile | 4129 | World | Gets tree generation profile for biome |
| generateTreesForChunk | 4400 | World | Places trees in chunk |
| forEachCanopyVoxel | 4604 | World | Iterates tree canopy positions |
| initSettingsUI | 5338 | UI | Binds all settings panel controls |
| playerIntersectsBlock | 5488 | Physics | AABB collision test |
| applyPoseConstraints | 11273 | Anim | Clamps pose values to valid ranges |
| springDamper | 11572 | Anim | Spring physics for smooth animation |
| startKnockdown | 11802 | Anim | Initiates knockdown animation |
| getThirdPersonCameraDistance | 12037 | Camera | Raycasts to prevent camera clipping |
| getBlockParticleColor | 12474 | FX | Gets particle color from block type |
| createStarField | 12564 | Sky | Generates procedural star mesh |
| createCloudPlane | 12729 | Sky | Generates cloud particle system |
| spawnWaterRipple | 13067 | Water | Creates water impact ripple |
| updateWaterRipples | 13255 | Water | Animates active water ripples |
| createColorGradingPass | 13639 | Post | Creates color correction shader pass |
| scheduleChunkUpdate | 14683 | Render | Queues chunk for mesh rebuild |
| noise2D/noise3D | 14894 | Noise | Perlin noise implementations |
| setHUDVisible | 14953 | UI | Shows/hides HUD elements |
| initWorldPreview | 15204 | UI | Creates terrain preview canvas |
| populateWorldCards | 15455 | UI | Renders save slot cards |
| captureWorldThumbnail | 15995 | UI | Screenshots world for save preview |
| processLightQueue | 16518 | Light | Processes deferred light updates |
| primeSunlightColumn | 16562 | Light | Propagates sunlight down column |
| setBlock | 17052 | World | Places/removes blocks with light update |
| applyShadowSettings | 17096 | Render | Configures shadow map quality |
| rebuildAllVisibleChunks | 17200 | Render | Forces mesh rebuild for all chunks |
| initTextures | 20263 | Render | Generates 17-tile texture atlas |
| applyCylindricalFog | 21186 | Render | Applies custom fog shader to material |
| generateZombieTexture | 21511 | Entity | Creates procedural zombie skin |
| buildZombieMesh | 22482 | Entity | Constructs zombie body geometry |
| spawnZombieNearPlayer | 22855 | Entity | Spawns zombie at valid location |
| calculateChunkSunlight | 26363 | Light | BFS sunlight propagation |
| calculateBlockLight | 26469 | Light | BFS torch light propagation |
| generateChunkData | 27005 | World | **Main terrain generation** (~950 lines) |
| addFaceIndexed | 27713 | Render | Adds face with indexed geometry |
| renderChunk | 27955 | Render | **Main chunk meshing** (~600 lines) |
| animate | 30028 | Core | **Main game loop** |

## Global State Inventory

### Core Engine State (Mutable)
| Variable | Line | Type | Purpose |
|----------|------|------|---------|
| scene | 10910 | THREE.Scene | Main render scene |
| camera | 10910 | THREE.PerspectiveCamera | Player camera |
| renderer | 10910 | THREE.WebGLRenderer | WebGL renderer |
| controls | 10910 | PointerLockControls | First-person controls |
| cameraRig | 10911 | THREE.Object3D | Camera parent for positioning |
| raycaster | 10910 | THREE.Raycaster | Block picking |
| chunks | 11040 | Map<ChunkKey, ChunkData> | Loaded chunk data |
| chunkMeshes | 11043 | Map<ChunkKey, THREE.Mesh> | Rendered chunk meshes |
| chunkBuildQueue | 11056 | Array | Pending chunk mesh builds |

### Configuration (Read-only after init)
| Variable | Line | Type | Purpose |
|----------|------|------|---------|
| AIR...UNLOADED_BLOCK | 3238-3253 | number | Block ID constants |
| NUM_TILES | 3425 | number | Texture atlas tile count (17) |
| BLOCK_CONFIG | 3438 | Array | Block definitions |
| TILE | 3406 | Object | Tile index constants |
| WORLD_CONFIG | 3702 | Object | World generation parameters |
| BIOME_CONFIG | 3845 | Object | Biome definitions |
| BIOME_DEFAULTS | 3989 | Object | Default biome values |
| TREE_CONFIG | 4059 | Object | Tree generation profiles |
| DEFAULTS | 5091 | Object | Default settings values |
| SETTINGS_PROFILES | 5277 | Object | Settings presets |
| WORLD_DIMS | 5459 | Object | Chunk dimensions (16x16x320) |

### Runtime State (Mutable)
| Variable | Line | Type | Purpose |
|----------|------|------|---------|
| SETTINGS | 4900 | Object | Active runtime settings |
| voxelWorld | 11042 | VoxelWorld | World manager instance |
| audioManager | 14751 | AudioManager | Audio manager instance |
| uiManager | 14756 | UIManager | UI manager instance |

### Optimization State
| Variable | Line | Type | Purpose |
|----------|------|------|---------|
| BLOCK_IS_SOLID | 10076 | Uint8Array(256) | Fast solid block lookup |
| BLOCK_IS_OPAQUE | 10077 | Uint8Array(256) | Fast opaque block lookup |
| IS_TRANSPARENT | 13798 | Uint8Array(256) | Fast transparency lookup |
| SUNLIGHT_ATTENUATION | 13799 | Uint8Array(256) | Light reduction per block type |

## DOM Elements Referenced

**Total getElementById calls: 468**

### Major Element Groups:
- **Menus**: `seed-menu`, `blocker`, `instructions`, `main-pause-menu`, `settings-menu`, `controls-menu`
- **HUD**: `crosshair`, `hotbar`, `block-name-display`, `flight-indicator`, `sprint-indicator`, `crouch-indicator`
- **Debug**: `debug-overlay`, `perf-overlay`, `pose-debug-panel`
- **World Creation**: `create-world-panel`, `world-preview-canvas`, `biome-selector`, `preset-selector`
- **Settings Panels**: ~50 settings inputs (`render-dist-slider`, `ao-toggle`, `shadows-toggle`, etc.)
- **World Management**: `world-manage-modal`, `saved-worlds-container`, save/load/export buttons
- **Loading**: `world-gen-progress`, `gen-progress-bar`, `loading-spinner`

## External Dependencies

### CDN Imports (via importmap)
```javascript
"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
```

### ES6 Module Imports (line 5516-5520)
```javascript
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
```

## Audio System Status

**Status: DEVELOPED**

- **Implementation**: Full Web Audio API system via AudioManager class (lines 7298-7630)
- **AudioContext**: Lazy-initialized on first user interaction
- **Oscillators**: Used for procedural sounds (clicks, footsteps, zombie growls)
- **Features**:
  - Click sounds (`playClick`)
  - Block break/place sounds (`playBreakSound`, `playPlaceSound`)
  - Footstep sounds (`playFootstep`)
  - Zombie sounds (`playZombieGrowl`, `playZombieHit`, `playZombieDeath`)
  - Ambient sounds (`playAmbient`)
- **Cached Buffers**: Noise buffer pooled for efficiency

## Worker Readiness Assessment

### Current Worker Usage
**None** - No `new Worker` declarations found.

### Worker Candidates (Heavy Computation)

| Function | Line | Blocker | Worker Potential |
|----------|------|---------|------------------|
| `generateChunkData` | 27005 | Uses noise functions, no DOM/THREE | **HIGH** - Pure computation |
| `calculateChunkSunlight` | 26363 | Pure array operations | **HIGH** - BFS on Uint8Arrays |
| `calculateBlockLight` | 26469 | Pure array operations | **HIGH** - BFS on Uint8Arrays |
| `renderChunk` | 27955 | Creates THREE.js geometries | **BLOCKED** - Uses THREE |
| `buildZombieMesh` | 22482 | Creates THREE.js meshes | **BLOCKED** - Uses THREE |
| `initTextures` | 20263 | Uses Canvas 2D context | **PARTIAL** - Canvas API available in workers |

### Recommended Worker Strategy
1. **Terrain Worker**: `generateChunkData`, noise functions, tree placement
2. **Lighting Worker**: `calculateChunkSunlight`, `calculateBlockLight`
3. **Main Thread**: Keep mesh building (`renderChunk`) due to THREE.js dependency

### Data Transfer Considerations
- Chunk data uses `Uint8Array` - transferable
- Position/normal buffers use `Float32Array` - transferable
- Would need to transfer raw arrays, then wrap in THREE.js on main thread

## Key Observations

### Architectural Patterns
1. **Hybrid Class/Global System**: Classes exist but many methods delegate to global functions
2. **Extensive Optimization Comments**: 50+ numbered optimization sections with audits
3. **Hot Path Awareness**: Comments identify performance-critical code paths
4. **Caching Everywhere**: UV cache, face vertex cache, biome cache, height map cache

### Potential Challenges
1. **Tight Coupling**: Many global functions access `scene`, `camera`, `chunks` directly
2. **Circular Dependencies**: Classes reference each other (EntityManager→Zombie→VoxelWorld)
3. **DOM Mixing**: UI logic interleaved with game logic throughout
4. **Single Module**: ES6 imports but no internal module separation

### Quick Wins for Modularization
1. **Configuration Extraction**: BLOCK_CONFIG, BIOME_CONFIG, TREE_CONFIG are self-contained
2. **Noise Functions**: Pure math, easily extractable to worker-compatible module
3. **Compression**: ChunkCompressor has no dependencies, immediately extractable
4. **Pose System**: POSE_PRESETS and animation data are data-only
5. **Settings**: DEFAULTS and SETTINGS_PROFILES are pure objects

### Dependency Graph (Simplified)
```
VoxExGame
├── SettingsManager (no deps)
├── InputManager (DOM only)
├── AudioManager (Web Audio only)
├── RenderEngine
│   └── THREE.js
├── TerrainGenerator
│   └── Noise functions
├── VoxelWorld
│   ├── chunks Map
│   └── TerrainGenerator
├── EntityManager
│   └── Zombie → VoxelWorld
├── UIManager
│   ├── DOM elements
│   ├── AudioManager
│   └── VoxelWorld
└── PlayerController
    ├── Camera
    ├── InputManager
    └── VoxelWorld
```

---

*Generated for VoxEx modular restructuring project*
*Last updated: 2026-01-02*

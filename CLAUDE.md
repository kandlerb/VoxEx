# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx** is a fully-featured, browser-based voxel exploration game engine inspired by Minecraft. It runs entirely in the browser without requiring external servers or installations.

**Key Characteristics:**
- **Type**: Browser-based 3D voxel game engine
- **Platform**: HTML5 + JavaScript ES6 modules
- **Main File**: `voxEx.html` (single file - no exceptions)
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, Web Workers, Web Audio, IndexedDB, OPFS, LocalStorage
- **Lines of Code**: ~43,000

## Project Priorities

These are the core principles that guide all development decisions:

1. **One File to Rule Them All**
   - The entire game runs from a single HTML file
   - All CSS, JavaScript, and assets are embedded
   - This principle is sacred and will never change
   - No external dependencies, scripts, or resources

2. **No Circles. Ever. Only Squares (Voxels)**
   - Everything is made of cubes/boxes
   - Procedurally generated pixel art textures (16x16)
   - Minecraft-inspired aesthetic with pure voxel geometry
   - BoxGeometry for all 3D objects (blocks, torch, characters, etc.)

3. **Optimized to Run on [Almost] Any Device**
   - Performance-first design with aggressive optimization
   - Typed arrays (Float32Array, Uint8Array) for memory efficiency
   - Object pooling for geometries to reduce GC pressure
   - Face culling, frustum culling, and section-based LOD to minimize draw calls
   - Tiered geometry buffers (small/medium/large) for right-sized memory allocation
   - RLE compression for chunk storage
   - Frame budget system (16.67ms target) with yield points
   - Targets 60fps on mid-range hardware

4. **Flexible Settings and User Preferences**
   - Configurable render distance (4-32 chunks)
   - Graphics options: AO, shadows, fog, frustum culling, volumetrics, GI, water refraction, stars, clouds
   - Water effects: ripples, wading chevrons, splashes, bubbles, swim wake
   - Particle systems: torch flames/smoke, block break, footstep dust
   - Movement options: sprint speed, fly speed, jump force, gravity
   - Three settings profiles: Performance, Balanced, Quality
   - Customizable controls
   - Multiple save slots with unique seeds
   - All settings persist via LocalStorage

## Repository Structure

```
VoxEx/
├── index.html                # System check & launcher (WebGL, GPU benchmark)
├── voxEx.html                # Complete game (HTML + CSS + JS, ~43K lines)
├── CLAUDE.md                 # This file
├── README.md                 # Project readme
├── futureFeatures.md         # Feature roadmap
├── tools/                    # Development & testing utilities
│   ├── docs-viewer.html          # Documentation viewer
│   ├── KeyFrame_editor.html      # Animation keyframe editor
│   ├── terrain-parameter-editor.html  # Terrain tuning tool
│   ├── terrain-visualizer.html   # Shaded relief terrain debugger (cross-section, column inspector)
│   ├── voxelEditor.html          # Voxel model editor
│   ├── voxex-sound-formula.html  # Sound synthesis designer
│   ├── voxex-tests.html          # 160+ automated tests (noise, terrain, lighting, RLE, etc.)
│   └── voxex-texture-tests.html  # Visual texture atlas tests (all 17 tiles + automated checks)
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
| **GLSL** | Via Three.js | Custom shaders (cylindrical fog, water refraction, underwater, volumetric) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer (HTML/CSS, lines 1-1550)                               │
│ - HUD: Crosshair, Hotbar, Block Name, Flight/Sprint Icons       │
│ - Menus: Start, Pause, Settings, World Creation, Seed Selection │
│ - Inventory: Drag-and-drop block selection (E key)              │
│ - World Creation: Biome selector, presets, sliders, preview     │
│ - World Management: Rename, duplicate, import/export, storage   │
│ - Performance Overlay (O key), Debug Overlay (~ key)            │
│ - Toast Notifications (success/info/warning/error)              │
│ - Settings Search & Profile System                              │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Game Engine (RenderEngine + Three.js)                            │
│ ├─ Camera: First-Person + Third-Person (V key, orbit, zoom)     │
│ ├─ Lighting: Day/Night cycle, Sun/Moon, Torches (max 8 point)   │
│ ├─ Skybox: Multi-layer stars (3 layers), volumetric clouds      │
│ ├─ Materials: Chunk (StandardMaterial), Water (3 modes),         │
│ │             Custom GLSL shaders (cylindrical fog, refraction)  │
│ ├─ Post-Processing: Volumetric god rays, color grading,         │
│ │                    zombie vignette/desaturation, underwater    │
│ ├─ ParticleSystem: Torch flames/smoke, block break, footstep,   │
│ │                   water ripples/splash/bubbles/wake            │
│ ├─ Viewmodel: First-person arms + torch (Layer 1)               │
│ └─ Render Layers: 0=world, 1=viewmodel, 2=player body           │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ World Management (VoxelWorld + TerrainGenerator)                 │
│ ├─ Chunk Generation (16x16x320, subdivided into 20 sections)    │
│ ├─ ChunkWorkerPool (Web Workers, auto-sized, zero-copy xfer)    │
│ ├─ ChunkMesher (face culling, AO, greedy meshing, LOD)          │
│ ├─ Biome System (6 biomes + foothill transitions)               │
│ ├─ Terrain: Continental height, domain-warped biome boundaries   │
│ ├─ Rivers: Gradient-descent river network (RiverNetworkCache)   │
│ ├─ Structures: Trees, multi-trunk, caves                        │
│ ├─ Frustum Culling (cached, inner-radius exception)             │
│ ├─ Section Analysis (per-section isEmpty/isFullySolid/bounds)   │
│ └─ Generation/Render Pass Bitmasks (GEN_PASS, RENDER_PASS)      │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Lighting Engine                                                  │
│ ├─ SunlightTask: Async propagation with pressure-based bailout  │
│ ├─ Block Light: Torch propagation (level 14, 6-direction)       │
│ ├─ Deferred Lighting: Distant chunks use simplified model       │
│ ├─ Edge Lighting: Cross-chunk boundary reconciliation           │
│ ├─ Watchdog: Force-clears stuck pending light (300ms grace)     │
│ └─ Volumetric Sampling: 7-ray cone (sun), 5-ray cone (point)   │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Entity & Player Systems                                          │
│ ├─ PlayerController (movement, physics, collision, swimming)     │
│ ├─ Articulated Characters: Shared buildArticulatedMesh()         │
│ │   - 3-segment spine (lower/mid/upper) with pivots             │
│ │   - Arms with shoulder rotation + elbow bend                  │
│ │   - Legs with hip rotation + knee bend                        │
│ │   - Procedural pixel-art textures (skin, clothing, hair)      │
│ ├─ Player: Customizable skin/hair/shirt/pants colors            │
│ ├─ Zombie: Procedural appearance (clothing themes, skin, eyes)  │
│ ├─ EntityManager (spawning, pooling, max 10 zombies)            │
│ ├─ Zombie AI: State machine (wander → chase → attack)           │
│ ├─ Animation: Spring-damped pose interpolation, 11+ states      │
│ ├─ Knockdown: 7-keyframe ragdoll animation (3.5s duration)      │
│ └─ Effects: Zombie vignette/desaturation, impact absorption     │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Memory & Performance Management                                  │
│ ├─ MemoryBudgetManager: Auto-scaling render distance on pressure│
│ │   - Warning (80%): reduce render distance by 1                │
│ │   - Critical (95%): reduce by 2, emergency unload 20% chunks  │
│ ├─ GeometryBufferPool: Tiered (4K/8K/16K faces) with upgrade    │
│ ├─ Object Pools: Float32Array, Uint8Array, Uint32Array,         │
│ │                 Vector3, ChunkData, GeometryBuffer             │
│ ├─ PerformanceMonitor: FPS circular buffer, frame budget (8ms)  │
│ ├─ Geometry Leak Detection: 5s interval, warning at 500+ excess │
│ ├─ Spatial Hash Grid: O(1) entity proximity queries             │
│ └─ SeededRandom: Deterministic PRNG for world generation        │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Data Persistence Layer                                           │
│ ├─ IndexedDB: Chunk cache (stores: saves, chunks, settings)     │
│ ├─ ChunkDiskStorage: OPFS worker backend (lazy init)            │
│ ├─ RLE Compression: v2 format (blocks + skyLight + blockLight)  │
│ ├─ Batch Operations: batchLoadChunksFromCache, batchSave        │
│ ├─ World Save: JSON (seed, player state, modified chunks, thumb)│
│ └─ LocalStorage: Settings, profiles, quick save/load            │
└─────────────────────────────────────────────────────────────────┘
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
| 10 | `TORCH` | Light-emitting torch block (level 14) |
| 11 | `SNOW` | Snow block |
| 12 | `GRAVEL` | Gravel block |
| 13 | `LONGWOOD_LOG` | Longwood biome log (2x2/3x3 trunks) |
| 14 | `LONGWOOD_LEAVES` | Longwood biome leaves |
| 255 | `UNLOADED_BLOCK` | Placeholder for unloaded chunks |

**Texture Atlas**: `NUM_TILES = 17` tiles in a horizontal strip.
**Lookup Tables**: `BLOCK_IS_SOLID[256]`, `BLOCK_IS_OPAQUE[256]`, `IS_TRANSPARENT[256]`, `SUNLIGHT_ATTENUATION[256]`, `BLOCKLIGHT_ATTENUATION[256]` — Uint8Array fast lookups.

## Biome System (6 Biomes + Foothills)

| Biome | Weight | Characteristics |
|-------|--------|-----------------|
| **Plains** | 2 | Flat terrain, sparse oak trees, baseHeight 62, spherical canopies |
| **Hills** | 2 | Rolling hills with abs() smoothing, moderate trees, amplitude 40 |
| **Forests** | 2 | Dense oak trees, moderate terrain |
| **Mountains** | 1 | High peaks (amplitude 180), ridged noise, conical pines, treeline logic, snow |
| **Swamp** | 1 | Low baseHeight 58, water pools, droopy trees |
| **Longwoods** | 2 | Giant 2x2/3x3 trunk trees, heights 12-24, wide sparse canopies |
| **Mountain Foothills** | auto | Transition zone (4-ring Chebyshev distance, quadratic decay, mountain-derived noise) |

Biomes are configured in `BIOME_CONFIG` (~line 3946). Tags enable biome-specific behavior:
- `"mountain"` — enables treeline and alpine terrain
- `"forested"` — high tree density
- `"giant_trees"` — uses multi-block trunks

**Terrain Generation Pipeline**:
- Continental height with domain warping → biome selection (weighted, cell-based) → per-biome height functions → river carving → structure placement
- Mountain generation: domain-warped ridges → 6-layer ridged noise → peak amplification → valley erosion → jagged detail overlay
- Biome boundaries use two-octave domain warping for organic edges

**Mountain-Foothills Transition System**:
- `foothillsHeightFunc` uses `mountainsHeightFunc` output scaled by ring factor — ridges/valleys align at boundaries (no mismatched noise)
- `mountainsHeightFunc` edge falloff uses `name === 'mountains'` (not tag check) so foothills trigger height tapering
- 4 rings of foothills (256 blocks total) with quadratic decay: `ringFactor = max(0.05, 1 - (ring/4)²)`
- Ring 1 ≈ 94% mountain shape, Ring 2 ≈ 75%, Ring 3 ≈ 44%, Ring 4 ≈ 5%
- `mountainWeight = ringFactor * 0.9` controls how much mountain relief passes through

## Key Systems Explained

### Chunk System
- **Size**: 16x16x320 blocks (CHUNK_SIZE=16, CHUNK_HEIGHT=320)
- **Sections**: Subdivided into 20 vertical sections (SECTION_HEIGHT=16) for LOD and culling
- **Structure**: `{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}`
- **Section Analysis**: Per-section `isEmpty`, `isFullySolid`, tight bounding boxes for render skipping
- **Meshing**: `ChunkMesher` builds indexed geometry; `ChunkWorkerPool` offloads to Web Workers
- **Worker Pool**: Auto-sized (CPU cores - 1, min 1, max 4), zero-copy Transferable buffers, 500ms mesh timeout
- **Geometry Tiers**: Small (4K faces, ~0.78MB), Medium (8K, ~1.56MB), Large (16K, ~3.12MB) — auto-upgrades
- **Pooling**: `ChunkDataPool`, `GeometryBufferPool`, `Float32ArrayPool` reduce allocations
- **Caching**: `ChunkNeighborCache` optimizes neighbor lookups during meshing
- **Optimization**: Face culling, AO baked into vertex colors, face-merge key bit-packing
- **Memory**: `MemoryBudgetManager` auto-scales render distance under pressure
- **Backward Compatibility**: Supports both old (Uint8Array) and new (object) chunk formats
- **Pass System**: `GEN_PASS` bitmask (TERRAIN=1, WATER=2, DECORATIONS=4, SUNLIGHT=8, BLOCKLIGHT=16, NEIGHBOR_UPDATE=32, TREE_NEIGHBOR_UPDATE=64)
- **Render Passes**: `RENDER_PASS` bitmask (INITIAL_MESH=1, EDGE_LIGHTING=2, NEIGHBOR_LIGHTING=4, FULL_QUALITY=8)

### Lighting System
- **Light Levels**: 1-15 range (1 = minimum visibility, 15 = full sunlight)
- **SunlightTask**: Async propagation with pressure management — throttle at 80% hard cap, bailout to full recalc at 100%
- **Block Light**: Torch sources propagate at level 14, 6-direction spread
- **Deferred Lighting**: Distant chunks (>16 blocks) use simplified height-based model
- **Edge Lighting**: Cross-chunk boundary reconciliation with max 3 passes per chunk
- **Watchdog**: Force-clears stuck pending light chunks (300ms grace period)
- **Semi-Transparent Blocks**: Leaves reduce light by 1 instead of blocking completely
- **Vertex Colors**: Light levels multiplied by AO, applied as vertex colors during rendering
- **Minimum Light**: Never drops to 0 — always at least 1 (0 is absence of light, never used)
- **Formula**: `vertexColor = AO x (lightLevel / 15.0)`
- **Volumetric Sampling**: 7-ray cone for sun/moon visibility, 5-ray cone for point lights (allows partial visibility through foliage)

### Rendering System
- **Textures**: Procedurally generated 16x16 pixel art on a canvas (Atlas: 17 tiles)
- **Terrain Material**: MeshStandardMaterial with vertex colors, roughness, alpha test 0.1
- **Water Materials**: Three modes — Standard (PBR), Fast (Lambert), Refraction (custom GLSL with Beer-Lambert absorption)
- **Fog**: Custom cylindrical fog shader (XZ-only distance, not vertical) — injected via `onBeforeCompile`
- **Volumetric Effects**: God rays with multi-point-light support (max 4 volumetric point lights)
- **Post-Processing**: EffectComposer with volumetric pass, color grading (sunrise/sunset tinting), underwater shader, zombie effects
- **Particles**: `ParticleSystem` (max 500) with Chebyshev-distance square shader for voxel-style particles
- **Layers**: Layer 0 (world geometry), Layer 1 (viewmodels), Layer 2 (player body in third-person)
- **Camera**: First-person and third-person (V key); orbit yaw/pitch, zoom +/-, collision-aware distance
- **Stars**: 3-layer star field (radii 350/400/450) with shader-based sine-wave twinkling, day/night fade
- **Clouds**: Volumetric cloud particles (1500 base count x density), clumped distribution, day/night alpha
- **Color Grading**: Sunrise (0.15-0.35 dayTime) warm orange/pink, sunset (0.65-0.85) deep orange/red
- **Biome Fog Tinting**: Smooth fog color lerp per biome (plains=neutral, forests=green, mountains=blue, swamp=murky)
- **Shadows**: Pixel-snapped shadow maps, only update when player moves >0.5u or sun angle >5deg
- **Frustum Culling**: Cached frustum with inner-radius exception, recomputed on >5deg camera yaw change
- **Web Workers**: `ChunkWorkerPool` offloads mesh generation with identical terrain functions injected via `Function.toString()`

### Water Effects System
- **Ripples**: Velocity-scaled expansion, configurable segments (4=diamond, 6=hex, 8=octagon), max 20 concurrent
- **Wading**: Chevron wake geometry when walking in water, speed-scaled cooldown
- **Splash**: Dynamic particle count (1-8) based on impact velocity, splash columns for high-impact
- **Bubbles**: Continuous bubble stream underwater (300ms base cooldown), breath bursts every 3-5s
- **Swim Wake**: V-pattern foam trail when swimming (active >0.5 units/s)
- **Landing Dust**: Block-type-colored dust particles on ground impact (>=5 units/s)
- **Underwater Shader**: Beer-Lambert absorption (configurable R/G/B), fog density

### River System
- **Algorithm**: Gradient-descent tracing from high elevation to sea level
- **RiverNetworkCache**: Regional LRU cache (64 max regions, 256-block region size)
- **Constraints**: Max slope 1.0 blocks/block, max elevation 75, 8-block sample distance
- **Integration**: River factor carves into `blendedHeight()` terrain output

### Character System
- **Shared Architecture**: `buildArticulatedMesh(proportions, materials, options)` used by both player and zombie
- **Skeleton**: 3-segment spine (lower/mid/upper), head pivot, arm shoulder+elbow pivots, leg hip+knee pivots
- **Player Customization**: Skin color palettes, hair palettes, shirt/pants color options
- **Zombie Procedural Generation**: Random clothing themes ("corroded-teal", "ashen-rag"), skin palettes, eye types, mouth types, tear/grime overlays
- **First-Person Viewmodel**: Separate arms model with torch holder, animated per movement state
- **Third-Person**: Player body on Layer 2, torch model, held block display, orbit camera

### Animation System
- **Spring Physics**: Damped springs (`springDamper()`) for smooth pose interpolation
- **11+ Movement States**: idle, walking, sprinting, crouching, flying, swimming, treading water, jumping, falling, landing, knockdown
- **Knockdown**: 7-keyframe sequence (impact → collapse → ground → pushup → kneel → stand), 3.5s total
- **Impact Absorption**: Landing leg bend, hip drop, spine compression, arm swing, head counter-rotation
- **Pose Presets**: Named preset library (stand, walk, sprint, crouch, fly, swim, knockdown stages)
- **Constraints**: Min/max rotation limits for all limb joints (POSE_CONSTRAINTS)

### Entity System
- **EntityManager**: Handles zombie spawning, pooling, and lifecycle
- **Zombie AI**: State machine (wander → chase → attack), detection radius, pathfinding with collision probing
- **Zombie Animation**: Procedural limb swing synced to movement speed and state
- **Effects**: Red vignette and desaturation when zombies nearby (configurable intensity)
- **Performance**: Object pooling (`zombiePool`), max 10 zombies
- **Spawning**: `spawnZombieNearPlayer()` with random appearance generation (skin, clothing, features)

### Torch Viewmodel
- **Type**: 3D voxel model (stick + flame + glow) using BoxGeometry
- **Materials**: MeshLambertMaterial with emissive properties
- **Structure**:
  - Stick (0.04x0.25x0.04) — brown wood voxel
  - Flame (0.06x0.08x0.06) — orange voxel with 0.5 emissive
  - Glow (0.04x0.04x0.04) — yellow center, inside flame
- **Rendering**: Layer 1 with `depthTest: false` and `renderOrder: 1000`
- **Particles**: Configurable smoke and flame particles with spawn rate, size, decay, color

### World Creation System
- **UI Panel**: World name, seed input, biome selector grid, terrain presets, advanced sliders
- **Presets**: Default, Amplified, Flat, Archipelago, Superflat, Caves
- **Customization**: Tree density, cave density, terrain amplitude, sea level, biome size, noise persistence/lacunarity, spawn coordinates
- **Preview**: Real-time terrain preview (WorldPreviewRenderer) using identical noise algorithms
- **World Management**: Rename, duplicate, import/export, storage stats, clear cache

### Persistence
- **RLE Compression**: Chunk data (blocks + light) is Run-Length Encoded, v2 format
- **Dual Caching**: IndexedDB (fast, persistent) + OPFS disk cache (larger capacity via `ChunkDiskStorage` worker)
- **Batch Operations**: `batchLoadChunksFromCache()`, `batchSaveChunksToCache()` for efficiency
- **Save Format**: JSON with Seed, Player Pos/Rot, Inventory, RLE-compressed modified chunks, thumbnail
- **Quick Save/Load**: F5 saves, F9 loads (instant)
- **Pre-Generation**: Spiral pattern from spawn, async with skip option
- **Backward Compatibility**: Decompressor handles both v1 and v2 formats

### Settings System
- **Profiles**: Performance, Balanced, Quality — plus custom profile save
- **Categories**: Performance, Graphics (Basic, Lighting, Sky, Water, Water Effects, Volumetric, GI, Diffuse/Specular, Stars, Clouds, Torch Particles, Block Break, Footstep), Gameplay (Movement, Physics, Camera, Interaction), Zombie Effects, Color Grading, Biome Fog
- **Search**: Settings search bar for quick lookup
- **Persistence**: All settings saved to LocalStorage, synced to DOM on load via `updateUIFromSettings()`
- **Live Updates**: Setting changes immediately apply via side-effect callbacks (material updates, shader uniform sync, chunk rebuilds)

### Classes

| Class | ~Line | Purpose |
|-------|-------|---------|
| `SettingsManager` | 6104 | Settings persistence, listeners, profiles |
| `InputManager` | 6251 | Keyboard/mouse input, pointer lock, bitmask flags |
| `TerrainGenerator` | 6430 | Terrain/biome generation, noise, height functions |
| `VoxelWorld` | 6997 | World management, chunk loading/unloading, block access |
| `ChunkDataPool` | 7554 | Object pooling for chunk data structures |
| `ChunkMesher` | 8477 | Geometry mesh building with face culling and AO |
| `RenderEngine` | 8595 | Three.js rendering pipeline, camera, lighting, shadows |
| `AudioManager` | 8896 | Procedural sound synthesis and playback |
| `EntityManager` | 9236 | Zombie spawning, lifecycle, pooling |
| `Mob` | 9424 | Base entity class (position, velocity, physics) |
| `Zombie` | 9486 | Zombie AI state machine (wander/chase/attack) |
| `PlayerController` | 9730 | Player movement, physics, collision, swimming |
| `UIManager` | 10083 | HUD, hotbar, inventory, menus, toast notifications |
| `VoxExGame` | 10662 | Main game orchestrator, render loop, frame budget |
| `Uint8ArrayPool` | 11036 | Pool for Uint8Array objects |
| `Vector3Pool` | 11457 | Pool for Three.js Vector3 objects |
| `ChunkNeighborCache` | 12306 | Optimized neighbor chunk lookups |
| `PerformanceMonitor` | 12916 | FPS tracking, frame timing, circular buffer |
| `ParticleSystem` | ~15000 | Particle effects with pooling and custom square shader |
| `SeededRandom` | 18381 | Deterministic PRNG for world generation |
| `Float32ArrayPool` | 18441 | Pool for Float32Array objects |
| `Uint32ArrayPool` | 18525 | Pool for Uint32Array objects |
| `ChunkWorkerPool` | 21010 | Web Worker pool for off-thread terrain gen and meshing |
| `GeometryBufferPool` | 21579 | Tiered GPU buffer pooling (small/medium/large) |
| `MemoryBudgetManager` | 21947 | Memory monitoring, auto-scaling, emergency unload |
| `WorldPreviewNoise` | 22629 | Seeded Perlin noise for terrain preview |
| `WorldPreviewRenderer` | 22725 | Real-time terrain preview during world creation |
| `SunlightTask` | 26045 | Async sunlight propagation with pressure-based bailout |
| `ChunkDiskStorage` | 27220 | OPFS disk cache with inline worker backend |

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHUNK_SIZE` / `WORLD_DIMS.chunkSize` | 16 | Blocks per chunk side (XZ) |
| `CHUNK_HEIGHT` / `WORLD_DIMS.chunkHeight` | 320 | Chunk vertical extent |
| `WORLD_DIMS.seaLevel` | 60 | Default sea level |
| `SECTION_HEIGHT` | 16 | Blocks per vertical section |
| `SECTIONS_PER_CHUNK` | 20 | Sections per chunk (320/16) |
| `CHUNK_DATA_SIZE` | 81920 | Bytes per chunk (16x16x320) |
| `NUM_TILES` | 17 | Texture atlas tile count |
| `MAX_FACES_PER_CHUNK` | 16384 | Hard cap on faces per chunk mesh |
| `GEO_TIER_SMALL` | 4096 | Small geometry tier max faces |
| `GEO_TIER_MEDIUM` | 8192 | Medium geometry tier max faces |
| `GEO_TIER_LARGE` | 16384 | Large geometry tier max faces |
| `MAX_POINT_LIGHTS` | 8 | Max simultaneous torch lights |
| `MAX_TOTAL_LIGHTS` | 12 | Including sun, moon, ambient |
| `MAX_VOLUMETRIC_POINT_LIGHTS` | 4 | Shader-synchronized limit |
| `FRAME_BUDGET_MS` | 16.67 | 60 FPS target |
| `TIME_SLICE_MS` | 8 | Max ms per operation before yielding |
| `PARTICLE_CONFIG.maxParticles` | 500 | Max active particles |
| `MAX_WATER_RIPPLES` | 20 | Max concurrent water ripples |
| `CLOUD_BASE_COUNT` | 1500 | Base cloud particle count (x density) |
| `BIOME_CELL_SIZE` | 64 | Grid cell size for biome lookup |

## Naming Conventions

- `cx, cz`: Chunk coordinates
- `lx, ly, lz`: Local block coordinates (0-15 for x/z, 0-319 for y)
- `gx, gy, gz`: Global block coordinates
- `getChunkKey(cx, cz)`: Returns string `"cx,cz"`
- `dt`: Delta time (seconds)
- `distSq`: Squared distance (avoids sqrt)
- `_scratch*`, `_tmp*`: Reusable scratch objects for hot paths
- `*Pool`: Object pool class (acquire/release pattern)
- `*Pass`: Post-processing or generation pass
- `GEN_PASS.*`, `RENDER_PASS.*`: Bitmask flags
- `INPUT_*`: Input bitmask flags (FORWARD=1, BACKWARD=2, LEFT=4, RIGHT=8, JUMP=16, SPRINT=32, CROUCH=64)
- `MESH_STATE.*`: Chunk mesh lifecycle (NONE=0, QUEUED=1, BUILDING=2, READY=3, STALE=4, DISPOSED=5)

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
3. **Block Config**: Add new blocks to `BLOCK_CONFIG` array (~line 3533). The system auto-derives inventory, textures, and transparency. Also update `BLOCK_IS_SOLID`, `BLOCK_IS_OPAQUE`, `IS_TRANSPARENT`, and attenuation lookup tables via `initBlockLookupTables()`
4. **Biome Config**: Add new biomes to `BIOME_CONFIG` (~line 3946). Missing fields inherit from `BIOME_DEFAULTS`. Add a height function to `HEIGHT_FUNCS` lookup table
5. **Settings**: Add default in `DEFAULTS` (~line 5254), wire into `SETTINGS` (~line 5037), add DOM binding in settings UI section (~line 25000+), call `saveSettings()`
6. **UI Overlay**: UI elements toggled via `controls.lock`/`unlock` events
7. **Light System**: When changing blocks, always call `updateSunlightAt()` and `updateBlockLightAt()` to update lighting. Use `SunlightTask` for async propagation
8. **Chunk Format**: Use `chunk.blocks`, `chunk.skyLight`, `chunk.blockLight` (with backward compatibility checks)
9. **Voxel Aesthetic**: Use BoxGeometry only — no spheres, cylinders, or curved geometry
10. **Worker Parity**: If changing terrain generation, also update `buildChunkWorkerCode()` which injects functions into workers via `Function.toString()`

### Common Search Patterns
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`, `const DEFAULTS`, `SETTINGS_PROFILES`
- **Block Types**: `const AIR`, `const GRASS`, `const LEAVES`, `BLOCK_CONFIG`, `BLOCK_IS_SOLID`, `BLOCK_IS_OPAQUE`
- **Biomes**: `BIOME_CONFIG`, `BIOME_DEFAULTS`, `getBiomeParams`, `getBiomeCellDirect`, `HEIGHT_FUNCS`
- **Terrain**: `blendedHeight`, `continentalHeight`, `mountainsHeightFunc`, `plainsHeightFunc`
- **Rivers**: `RiverNetworkCache`, `getRiverFactor`
- **Gen**: `function generateChunkData`, `function calculateChunkSunlight`, `GEN_PASS`, `RENDER_PASS`
- **Render**: `function renderChunk`, `renderChunkAsync`, `processChunkQueue`
- **Light**: `class SunlightTask`, `updateSunlightAt`, `updateBlockLightAt`, `processSunlightQueue`, `processLightQueue`
- **Water**: `waterMaterialRefraction`, `waterMaterialStandard`, `waterMaterialFast`, `applyWaterFastMode`, `spawnWaterRipple`, `updateWaterRipples`
- **Particles**: `class ParticleSystem`, `spawnBlockBreak`, `spawnTorchEmber`, `updateFootstepParticles`, `spawnWaterEntrySplash`, `spawnSplashColumn`
- **Stars/Clouds**: `createStarField`, `updateStars`, `createCloudPlane`, `updateClouds`
- **Atmosphere**: `createColorGradingPass`, `updateColorGrading`, `updateBiomeFogTint`, `BIOME_FOG_TINTS`
- **Shaders**: `applyCylindricalFog`, `applyCylindricalFogWater`, `underwaterPass`, `volumetric`
- **Characters**: `buildArticulatedMesh`, `buildZombieMesh`, `buildPlayerMesh`, `buildPlayerBody`, `buildPlayerViewmodelArms`
- **Zombie Textures**: `generateZombieHeadTexture`, `generateZombieBodyMaterial`, `ZOMBIE_CLOTHING_THEMES`, `ZOMBIE_SKIN_COLORS`
- **Player Textures**: `generatePlayerSkinTexture`, `generatePlayerMaterials`, `PLAYER_SKIN_COLORS`, `PLAYER_HAIR_PALETTES`
- **Animation**: `animatePlayerLimbs`, `animateZombieLimbs`, `updateKnockdown`, `KNOCKDOWN_KEYFRAMES`, `POSE_PRESETS`, `springDamper`
- **Camera**: `toggleThirdPerson`, `getThirdPersonCameraDistance`, `updatePoseDebugCamera`
- **Input**: `onKeyUp`, `onMouseClick`, `onMouseWheel`, `INPUT_FORWARD`, `INPUT_SPRINT`
- **Compression**: `rleEncode`, `rleDecode`, `compressChunkData`, `decompressChunkData`
- **Save/Load**: `saveWorld`, `loadWorld`, `saveChunkToCache`, `loadChunkFromCache`, `preGenerateSpawnChunks`
- **Core Classes**: `class VoxExGame`, `class VoxelWorld`, `class TerrainGenerator`
- **Rendering**: `class RenderEngine`, `class ChunkMesher`, `class ParticleSystem`
- **Player/Entity**: `class PlayerController`, `class EntityManager`, `class Mob`, `class Zombie`
- **UI/Settings**: `class UIManager`, `class SettingsManager`, `class InputManager`
- **Workers**: `class ChunkWorkerPool`, `class ChunkDiskStorage`, `buildChunkWorkerCode`
- **Memory**: `class MemoryBudgetManager`, `class PerformanceMonitor`, `checkGeometryLeaks`
- **Pools**: `class ChunkDataPool`, `class GeometryBufferPool`, `class Float32ArrayPool`
- **World Creation**: `class WorldPreviewRenderer`, `populateBiomeSelector`, `applyTerrainSettings`, `customWorldSettings`
- **Day/Night**: `updateDayNight`, `setTimeOfDay`

### Light Level Reference
- **15**: Full sunlight (directly exposed to sky)
- **14**: Torch block light level; 1 block from sun (under 1 leaf layer)
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
- Use scratch objects for hot-path functions (see `_pickDirTmp`, `_closestZombieResult`, `_scratchOrigin`)
- Hoist functions outside closures in hot paths (see `extractLightFromChunk` pattern)
- Use `blockIndex(lx, ly, lz)` for linear index: `lx + lz * 16 + ly * 256`
- Use lookup tables (BLOCK_IS_SOLID, AO_LOOKUP, FADE_LUT) instead of branching
- Unroll vertex writing in mesh generation (see `writeFaceVertices`)
- Use bit-packed merge keys for face merging (`getMergeKey(blockId, ao, light)`)
- Throttle occlusion checks (every 5 frames), shadow updates (>0.5u movement)
- Use `shouldYield()` and `checkFrameBudget()` in async operations

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
// CORRECT
if (blockType === AIR) { ... }
if (chunk !== undefined) { ... }

// WRONG - type coercion bugs
if (blockType == 0) { ... }  // "" == 0 is true!
if (chunk != null) { ... }
```

**Typed Arrays for Performance:**
```javascript
// CORRECT - VoxEx standard
const blocks = new Uint8Array(16 * 16 * 320);
const positions = new Float32Array(vertexCount * 3);

// WRONG - GC pressure, slower iteration
const blocks = [];
blocks.push(GRASS);
```

**Nullish Coalescing for Defaults:**
```javascript
// CORRECT
const distance = options.renderDistance ?? DEFAULTS.renderDistance;

// WRONG - fails on 0 or empty string
const distance = options.renderDistance || DEFAULTS.renderDistance;
```

**Optional Chaining for Safety:**
```javascript
// CORRECT
const blockLight = chunk?.blockLight?.[index] ?? 0;

// WRONG - verbose and error-prone
const blockLight = chunk && chunk.blockLight && chunk.blockLight[index] !== undefined
    ? chunk.blockLight[index] : 0;
```

**Array Methods vs Loops:**
```javascript
// For hot paths (render loop, meshing) - use for loops
for (let i = 0; i < vertices.length; i += 3) {
    positions[i] = vertices[i] * scale;
}

// For setup/config (runs once) - use array methods
const validBlocks = blockTypes.filter(b => b.solid);
const blockNames = blockTypes.map(b => b.name);
```

### Error Handling Patterns

**Guard Clauses at Function Start:**
```javascript
function setBlock(gx, gy, gz, blockType) {
    // Early validation
    if (gy < 0 || gy >= 320) return false;
    if (blockType < 0 || blockType >= BLOCK_COUNT) return false;

    // Main logic follows...
}
```

**Try-Catch at Boundaries Only:**
```javascript
// Wrap at system boundaries (save/load, IndexedDB)
async function loadWorld(saveName) {
    try {
        const data = await db.get(saveName);
        return parseWorldData(data);
    } catch (error) {
        logDebug(`[Save] Failed to load: ${error.message}`);
        return null;
    }
}

// Don't wrap internal pure functions
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
// - Performance tab -> Record -> interact -> Stop -> analyze flame graph
// - Memory tab -> Heap snapshot -> check for geometry leaks
// - window._faceCountHistogram — face count distribution across tiers
// - window.printFaceHistogram() — formatted histogram output
// - window.geometryPool.getStats() — buffer pool statistics
// - window.memoryBudgetManager.getStatus() — memory pressure status
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
| Closures in renderChunk | 30K+ closure per mesh | Hoist to module scope |

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
  - Add a sane default in `DEFAULTS` (~line 5254), wire it into `SETTINGS` (~line 5037)
  - Add DOM binding in the settings UI section (~line 25000+)
  - Ensure it round-trips via the save/load system
  - Make sure any new DOM IDs used in JS exist in the HTML
- Avoid heavy, deeply nested loops in hot paths (render loop, movement, chunk meshing):
  - Prefer at most **two** nested loops in per-frame code
  - For expensive operations, batch work over time, use existing caches, or limit to nearby chunks
- When modifying terrain generation:
  - Update both main-thread functions AND `buildChunkWorkerCode()` for worker parity
  - Verify WorldPreviewRenderer still matches actual generation

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

- **Summary** — 2-5 short bullets of what changed
- **Changes** — grouped bullets by subsystem (e.g. "Settings > Graphics > Effects", "World Pre-Gen", "Rendering > Volumetric")
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
- [ ] Chunk size is 16x16x320 (not 128)
- [ ] Atlas has 17 tiles (update `NUM_TILES` if adding blocks)
- [ ] Worker parity: terrain changes reflected in `buildChunkWorkerCode()`
- [ ] Block lookup tables updated if adding blocks (`initBlockLookupTables()`)
- [ ] Terrain changes: update BOTH worker (~line 19558) AND main-thread (~line 37450) copies
- [ ] Terrain changes: update terrain-visualizer.html to match (biome config, height funcs)
- [ ] Run `tools/voxex-tests.html` (160+ tests) to verify no regressions

## Testing Tools

### `tools/voxex-tests.html` — Automated Test Suite (160+ tests)
Browser-based test runner covering: blockIndex, safeGetBlock, RLE compression, SeededRandom, noise2D/3D, fbm2D, all height functions (plains/hills/forests/mountains/foothills), biome cell system, blendedHeight integration, calculateChunkSunlight (BFS), calculateBlockLight, analyzeChunkSections, computeTightChunkBounds, getMergeKey, writeFaceVertices, shouldMergeBlocks, estimateChunkFaces, pointToSegmentDist, block lookup tables. Also runnable headlessly via Node.js with DOM stubs.

### `tools/terrain-visualizer.html` — Terrain Debugger
Shaded relief top-down view + cross-section. Click to inspect: height, biome, surface block, slope, noise values, elevation zone. Uses extracted copies of terrain functions — **must be kept in sync with voxEx.html** biome config and height functions.

### `tools/voxex-texture-tests.html` — Visual Texture Tests
Renders all 17 atlas tiles at configurable resolution/zoom. Automated checks: opacity (non-leaf tiles fully opaque), transparency (leaf tiles have holes), color sanity (grass=green, water=blue, snow=bright, etc.), atlas dimensions.

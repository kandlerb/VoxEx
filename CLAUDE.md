# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx** is a fully-featured, browser-based voxel exploration game engine inspired by Minecraft. It runs entirely in the browser without external servers or installations.

- **Type**: Browser-based 3D voxel game engine (HTML5 + JavaScript ES6 modules)
- **Main File**: `voxEx.html` (single file — no exceptions), ~43K lines / ~43,000 LOC
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, Web Workers, Web Audio, IndexedDB, OPFS, LocalStorage

## Project Priorities

Core principles guiding all development decisions:

1. **One File to Rule Them All** — the entire game runs from a single HTML file with all CSS/JS/assets embedded. No external dependencies, scripts, or resources. This principle is sacred and will never change.
2. **No Circles. Ever. Only Squares (Voxels)** — everything is BoxGeometry cubes (blocks, torch, characters); procedural 16x16 pixel-art textures; Minecraft-inspired aesthetic.
3. **Optimized for [Almost] Any Device** — typed arrays, object pooling, face/frustum culling, section-based LOD, tiered geometry buffers (small/medium/large), RLE chunk compression, 16.67ms frame budget with yield points. Targets 60fps on mid-range hardware.
4. **Flexible Settings** — render distance 4-32 chunks; graphics toggles (AO, smooth lighting, shadows, fog, frustum culling, volumetrics, GI, water refraction, stars, clouds); water effects; particle systems; movement options; 3 profiles (Performance/Balanced/Quality); key bindings in `KEY_BINDINGS` (rebinding UI not built — controls menu is a static display); multi-slot saves with unique seeds; all persisted via LocalStorage.

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
│   ├── terrain-visualizer.html   # Shaded relief terrain debugger (cross-section, column inspector; delegates to voxEx.html via ?test=1)
│   ├── voxelEditor.html          # Voxel model editor
│   ├── voxex-sound-formula.html  # Sound synthesis designer
│   ├── voxex-tests.html          # Test suite — REAL voxEx.html functions via ?test=1 seam (window.VoxEx); ~204 tests incl. live worker round-trip. Serve over localhost.
│   └── voxex-texture-tests.html  # Visual texture atlas tests (all 33 tiles + automated checks)
└── .github/ISSUE_TEMPLATE/   # Bug/feature request templates
```

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Three.js** | 0.160.0 | 3D rendering, lighting, camera control |
| **PointerLockControls** | Three.js addon | First-person camera/input control |
| **Web Workers** | Native | Off-thread chunk meshing via `ChunkWorkerPool` |
| **Web Audio API** | Native | Procedural sound synthesis (zombie growls, etc.) |
| **IndexedDB** | Native | Chunk data persistence with RLE compression |
| **OPFS** | Native | Origin Private File System disk cache (`ChunkDiskStorage`) |
| **LocalStorage** | Native | Game saves and settings storage |
| **Canvas API** | Native | Procedural texture generation (Atlas) |
| **WebGL** | Via Three.js | GPU-accelerated rendering |
| **GLSL** | Via Three.js | Custom shaders (cylindrical fog, water refraction, underwater, volumetric) |

## Architecture Overview

Layered pipeline (top → bottom). No top-level engine class — the live game is module-level functions plus the classes listed under [Classes](#classes).

- **UI Layer** (HTML/CSS, lines ~1-1550): HUD (crosshair, hotbar, block name, flight/sprint icons); menus (start, pause, settings, world creation, seed select); inventory (E key, drag-drop); world management (rename/duplicate/import/export/storage); perf overlay (O), debug overlay (~); toasts; settings search + profiles.
- **Game Engine** (Three.js render pipeline): camera (1st + 3rd person, V key, orbit/zoom); lighting (day/night, sun/moon, ≤8 torch point lights); skybox (3 star layers, volumetric clouds); materials (chunk StandardMaterial, 3 water modes, custom GLSL fog/refraction); post-processing (volumetric god rays, color grading, zombie vignette/desat, underwater); ParticleSystem; viewmodel arms + torch. Render layers: 0=world, 1=viewmodel, 2=player body.
- **World Management** (VoxelWorld + terrain functions): chunk gen 16x16x320 / 20 sections; ChunkWorkerPool (auto-sized, zero-copy transfer); meshing (face cull + AO + greedy + LOD); 6 biomes + foothill transitions; continental height + domain-warped boundaries; domain-warped noise-ribbon rivers (`getRiverFactor`); structures (trees/multi-trunk/caves); cached frustum culling; section analysis; GEN_PASS/RENDER_PASS bitmasks.
- **Lighting Engine**: SunlightTask (async, pressure-based bailout); torch block light (level 14, 6-direction); deferred lighting for distant chunks; edge lighting reconciliation; watchdog (300ms grace); volumetric cone sampling (7-ray sun, 5-ray point).
- **Entity & Player Systems**: physics/collision/swim movement; shared `buildArticulatedMesh` (3-segment spine, shoulder/elbow + hip/knee pivots, procedural pixel-art textures); customizable player; procedural zombies (≤10, pooled); zombie AI state machine (wander → chase → attack); spring-damped animation (11+ states); 7-keyframe knockdown ragdoll (3.5s).
- **Memory & Performance**: MemoryBudgetManager (auto-scale render distance: −1 at 80% warning, −2 + emergency unload 20% at 95% critical); GeometryBufferPool (4K/8K/16K face tiers, auto-upgrade); object pools (Float32/Uint8/Uint32Array, Vector3, ChunkData, GeometryBuffer); PerformanceMonitor (FPS ring buffer, 8ms budget); geometry leak detection (5s, warn at 500+ excess); spatial hash grid (O(1) proximity); SeededRandom PRNG.
- **Data Persistence**: IndexedDB chunk cache (stores: saves/chunks/settings); ChunkDiskStorage OPFS backend (lazy init); RLE compression (v2: blocks + skyLight + blockLight); batch ops; JSON world save (seed, player state, modified chunks, thumbnail); LocalStorage settings/profiles/quick save.

## Block Types (Current: 19 blocks)

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
| 15 | `GLASS` | Transparent + collidable (tags: transparent/cutout/collidable), zero light attenuation |
| 16 | `FIRE` | Transparent, walk-through, emissive separate-render block; clings to adjacent faces; 12-frame anim |
| 17 | `BURNT_LOG` | Charred log (fire burn result) |
| 18 | `BURNT_PLANKS` | Charred planks (fire burn result) |
| 255 | `UNLOADED_BLOCK` | Placeholder for unloaded chunks |

- **Texture Atlas**: `NUM_TILES = 33` tiles in a horizontal strip (12 fire frames + 3 burnt + base blocks).
- **Water light**: attenuates sunlight 1/block, blocklight 2/block (chunk cache v3 — bump `CURRENT_CACHE_VERSION` + `_cacheVersion` writes when changing attenuation).
- **Lookup Tables**: `BLOCK_IS_SOLID[256]`, `BLOCK_IS_OPAQUE[256]`, `IS_TRANSPARENT[256]`, `SUNLIGHT_ATTENUATION[256]`, `BLOCKLIGHT_ATTENUATION[256]` — Uint8Array fast lookups.

## Biome System (6 Biomes + Foothills)

| Biome | Weight | Characteristics |
|-------|--------|-----------------|
| **Plains** | 2 | Flat, sparse oak trees, baseHeight 62, spherical canopies |
| **Hills** | 2 | Rolling hills with abs() smoothing, moderate trees, amplitude 40 |
| **Forests** | 2 | Dense oak trees, moderate terrain |
| **Mountains** | 0.5 (unused — mask-placed) | High peaks (amplitude 180), ridged noise, conical pines, treeline, snow |
| **Swamp** | 1 | Low baseHeight 58, water pools, droopy trees |
| **Longwoods** | 2 | Giant 2x2/3x3 trunk trees, heights 12-24, wide sparse canopies |
| **Mountain Foothills** | auto | Transition zone (single 64-block cell ring, constant ringFactor 0.75, mountain-derived noise) |

Biomes configured in `BIOME_CONFIG` (~line 3987); missing fields inherit from `BIOME_DEFAULTS`. Tags: `"mountain"` (treeline + alpine terrain), `"forested"` (high tree density), `"giant_trees"` (multi-block trunks).

**Terrain Generation Pipeline**: **`WORLD_CONFIG.useNewTerrain: true` (the default) routes ALL height queries through the climate+spline surface — `terrainSurface`/`computeSurfaceHeight`/`resolveBiome` (temperature/humidity/continentalness/erosion/peaks-valleys fields + splines). The bilinear biome-cell system documented in this section is the LEGACY A/B path, reachable only by setting the flag false.** Legacy path: continental height + domain warping → weighted cell-based biome selection → per-biome height functions. Shared by BOTH paths: river/ocean carving → structure placement. Legacy mountains: domain-warped ridges → 6-layer ridged noise → peak amplification → valley erosion → jagged detail overlay. Biome boundaries use two-octave domain warping for organic edges.

**Mountain-Foothills Transition** (legacy path — inert under the default `useNewTerrain: true`):
- `foothillsHeightFunc` uses `mountainsHeightFunc` output scaled by ring factor — ridges/valleys align at boundaries (no mismatched noise).
- SINGLE ring (`MAX_FOOTHILL_RINGS = 1`, one 64-block biome cell): any non-mountain cell 8-adjacent to a mountain cell becomes foothills with constant `ringFactor = 0.75` (from the ring-centre form `max(0.05, 1 - ((ring - 0.5)/N)²)`). `mountainWeight = ringFactor * 0.9 = 0.675` controls relief passthrough; baseHeight lerps plains (62) → foothills (70) by ringFactor. There is no per-cell edge falloff in `mountainsHeightFunc`.
- **Mountain placement**: by a low-frequency domain-warped region mask (`isMountainRegion`) so they cluster into coherent ranges — NOT the per-cell weighted roll (which distributes the other 5 biomes via the noise-calibrated CDF `_BIOME_CDF_TABLE`; `rebuildBiomeTable` excludes mountains, so `BIOME_CONFIG.mountains.weight` is unused). Keeps ranges contiguous, avoids plains/foothill notches between scattered peaks.

## Key Systems Explained

### Chunk System
- **Size**: 16x16x320 (CHUNK_SIZE=16, CHUNK_HEIGHT=320), subdivided into 20 sections (SECTION_HEIGHT=16) for LOD/culling.
- **Structure**: `{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}` (backward-compatible with old Uint8Array-only format).
- **Section Analysis**: per-section `isEmpty`, `isFullySolid`, tight bounds for render skipping.
- **Meshing**: `renderChunk()` builds indexed geometry; `ChunkWorkerPool` offloads to workers (auto-sized CPU cores−1, min 1 / max 4; zero-copy Transferables; 500ms timeout). Face culling, AO baked into vertex colors, face-merge key bit-packing. `ChunkNeighborCache` speeds neighbor lookups.
- **Geometry Tiers**: Small (4K faces ~0.78MB), Medium (8K ~1.56MB), Large (16K ~3.12MB), auto-upgrade. Pools: `ChunkDataPool`, `GeometryBufferPool`, `Float32ArrayPool`. `MemoryBudgetManager` auto-scales render distance under pressure.
- **Pass System**: `GEN_PASS` (TERRAIN=1, WATER=2, DECORATIONS=4, SUNLIGHT=8, BLOCKLIGHT=16, NEIGHBOR_UPDATE=32, TREE_NEIGHBOR_UPDATE=64); `RENDER_PASS` (INITIAL_MESH=1, EDGE_LIGHTING=2, NEIGHBOR_LIGHTING=4, FULL_QUALITY=8).

### Lighting System
- **Light Levels**: 1-15 (1 = min visibility, 15 = full sunlight).
- **SunlightTask**: async propagation, throttle at 80% hard cap, bailout to full recalc at 100%.
- **Block Light**: torch sources propagate at level 14, 6-direction spread.
- **Deferred Lighting**: distant chunks (>16 blocks) use a simplified height-based model.
- **Edge Lighting**: cross-chunk boundary reconciliation, max 3 passes/chunk. **Watchdog** force-clears stuck pending light (300ms grace).
- **Semi-Transparent**: leaves reduce light by 1 instead of fully blocking.
- **Smooth Lighting**: `SETTINGS.smoothLighting` — per-corner sampling (`calculateFaceCornerLight`, same offset table as AO); corner lights packed into greedy merge key (layout: `blockId<<20 | 4×3-bit corner light | AO byte`).
- **Normals**: chunk/water geometries carry NO normal attribute — chunk materials use `flatShading: true` (normals derived in-shader via dFdx/dFdy).
- **Minimum Light**: skylight never < 1; blocklight valid 0-15 (0 = no torch). At mesh time `extractLightFromChunk()` floors combined light at **3** (20% base brightness) so deep caves stay faintly visible.
- **Formula**: `vertexColor = AO x (lightLevel / 15.0)`. **Volumetric Sampling**: 7-ray cone (sun/moon), 5-ray cone (point lights) for partial visibility through foliage.

### Rendering System
- **Textures**: procedural 16x16 pixel art on canvas (Atlas: 33 tiles).
- **Terrain Material**: MeshStandardMaterial, vertex colors, roughness, alpha test 0.1.
- **Water**: three modes — Standard (PBR), Fast (Lambert), Refraction (custom GLSL, Beer-Lambert absorption).
- **Fog**: custom cylindrical shader (XZ-only distance, not vertical) via `onBeforeCompile`. **Biome Fog Tinting**: per-biome fog color lerp (plains=neutral, forests=green, mountains=blue, swamp=murky).
- **Volumetric**: god rays, multi-point-light (≤4 volumetric point lights). **Post-Processing**: EffectComposer (volumetric pass, color grading, underwater, zombie effects).
- **Color Grading**: sunrise (0.15-0.35 dayTime) warm orange/pink, sunset (0.65-0.85) deep orange/red.
- **Particles**: `ParticleSystem` (max 500), Chebyshev-distance square shader for voxel-style particles.
- **Camera**: 1st + 3rd person (V); orbit yaw/pitch, zoom +/-, collision-aware distance. Layers: 0=world, 1=viewmodels, 2=player body (3rd person).
- **Stars**: 3-layer field (radii 350/400/450), shader sine-wave twinkle, day/night fade. **Clouds**: volumetric particles (1500 base × density), clumped, day/night alpha.
- **Shadows**: pixel-snapped maps, update only when player moves >0.5u or sun angle >5deg. **Frustum Culling**: cached frustum, inner-radius exception, recompute on >5deg yaw change.
- **Web Workers**: `ChunkWorkerPool` offloads meshing; identical terrain functions injected via `Function.toString()`.

### Water Effects System
- **Ripples**: velocity-scaled expansion, configurable segments (4=diamond, 6=hex, 8=octagon), max 20.
- **Wading**: chevron wake when walking in water, speed-scaled cooldown.
- **Splash**: dynamic particle count (1-8) by impact velocity; splash columns for high impact.
- **Bubbles**: continuous underwater stream (300ms cooldown), breath bursts every 3-5s.
- **Swim Wake**: V-pattern foam trail when swimming (>0.5 units/s). **Landing Dust**: block-colored dust on impact (≥5 units/s). **Underwater Shader**: Beer-Lambert absorption (R/G/B), fog density.

### River System
- **Algorithm**: stationary domain-warped noise ribbon — `getRiverFactor(gx, gz, seed)` returns 0 (river center) → 1 (no river) where `|noise2D|` of the warped coordinates falls below the channel half-width. Warp = two-octave coordinate warp + axis-balanced sinusoidal meander + regional macro-meander (`RIVER_WARP_*`). There is NO gradient-descent tracing and NO `RiverNetworkCache` (that class does not exist in the code).
- **Width & fade**: half-width `RIVER_BASE_WIDTH` (0.064 noise units) ± coastal variation; `heightPenalty = smoothstep(60, 72, terrainHeight)` fades rivers out on elevated terrain (TER-6; ends rivers by height ~71, before the canyon-carve blend could leave a dry carved bed above sea level). A mountain river-tunnel punch that once lived in `generateTerrainPass` was fully DELETED, not merely left unreachable (TER-5) — the same heightPenalty width fade already ended rivers before the tunnel's elevation gate could ever fire, so the punch was dead code and was removed.
- **Carving**: `blendedHeight()` blends the pre-river height toward the `getRiverDepth()` bed (canyon/tunnel mix on high ground); river SAND beaches and water fill happen in `generateTerrainPass`/`fillWaterPass`.

### Character System
- **Shared**: `buildArticulatedMesh(proportions, materials, options)` — player + zombie. Skeleton: 3-segment spine (lower/mid/upper), head pivot, arm shoulder+elbow, leg hip+knee pivots.
- **Player**: customizable skin/hair/shirt/pants colors. **Zombie**: procedural clothing themes ("corroded-teal", "ashen-rag"), skin palettes, eye/mouth types, tear/grime overlays.
- **First-Person Viewmodel**: separate arms model with torch holder, animated per movement state. **Third-Person**: player body (Layer 2), torch model, held block display, orbit camera.

### Animation System
- **Spring Physics**: damped springs (`springDamper()`) for pose interpolation.
- **11+ States**: idle, walking, sprinting, crouching, flying, swimming, treading water, jumping, falling, landing, knockdown.
- **Knockdown**: 7-keyframe sequence (impact → collapse → ground → pushup → kneel → stand), 3.5s. **Impact Absorption**: leg bend, hip drop, spine compression, arm swing, head counter-rotation.
- **Pose Presets**: named library (stand, walk, sprint, crouch, fly, swim, knockdown stages). **Constraints**: min/max limb rotation limits (`POSE_CONSTRAINTS`).

### Entity System
- **Functions**: `spawnZombieNearPlayer()` / `updateZombies()` handle spawning, pooling, lifecycle (random appearance generation).
- **Zombie AI**: state machine (wander → chase → attack), detection radius, pathfinding with collision probing; limb swing synced to speed/state.
- **Effects**: red vignette + desaturation when zombies nearby (configurable). **Performance**: `zombiePool`, max 10 zombies.

### Torch Viewmodel
- **Type**: 3D voxel model (BoxGeometry), MeshLambertMaterial w/ emissive. Stick (0.04x0.25x0.04, brown); Flame (0.06x0.08x0.06, orange, 0.5 emissive); Glow (0.04³, yellow, inside flame).
- **Rendering**: Layer 1, `depthTest: false`, `renderOrder: 1000`. Configurable smoke/flame particles (spawn rate, size, decay, color).

### World Creation System
- **UI**: world name, seed input, biome selector grid, terrain presets, advanced sliders.
- **Presets**: Default, Amplified, Flat, Archipelago, Superflat, Caves.
- **Customization**: tree/cave density, terrain amplitude, sea level, biome size, noise persistence/lacunarity, spawn coords.
- **Preview**: real-time terrain preview (`WorldPreviewRenderer`) delegating directly to the game's own `blendedHeight()`/`getBiomeParams()` (no separate noise copy to keep in sync). **Management**: rename, duplicate, import/export, storage stats, clear cache.

### Persistence
- **RLE Compression**: chunk data (blocks + light) Run-Length Encoded, v2 format; decompressor handles v1 + v2.
- **Run-length limit**: `ChunkCompressor` stores RLE counts as Uint16 — runs > 65535 are SPLIT into multiple [count, value] pairs (`MAX_RUN_LENGTH`). Critical for 320-high chunks (81920 cells) where uniform spans (all-zero blockLight, air above terrain) exceed 65535.
- **Cache versioning**: `_cacheVersion` persisted inside the compressed record (`cacheVersion` field), restored on decompress — so cached lighting isn't needlessly recalculated on load.
- **Dual Caching**: IndexedDB (fast, persistent) + OPFS disk cache (larger capacity via `ChunkDiskStorage` worker).
- **OPFS binary format**: `serializeChunkForDisk()` / `deserializeChunkFromDisk()` — compact little-endian envelope (magic `'VXC2'`, cacheVersion/renderState/genState, seed, 3x RLE arrays). Legacy JSON-envelope files still readable via fallback in `ChunkDataPool.loadFromDisk()`.
- **Batch Ops**: `batchLoadChunksFromCache()`, `batchSaveChunksToCache()`. **Save Format**: JSON (seed, player pos/rot, inventory, RLE-compressed modified chunks, thumbnail). **Quick Save/Load**: F5 / F9. **Pre-Generation**: spiral from spawn, async with skip option.

### Settings System
- **Profiles**: Performance, Balanced, Quality + custom save.
- **Categories**: Performance, Graphics (Basic, Lighting, Sky, Water, Water Effects, Volumetric, GI, Diffuse/Specular, Stars, Clouds, Torch Particles, Block Break, Footstep), Gameplay (Movement, Physics, Camera, Interaction), Touch Controls, Zombie Effects, Color Grading, Biome Fog.
- **Touch settings**: `touchControls` (auto/on/off), `touchLookSensitivity`, `touchJoystickSize`, `touchButtonScale`, `touchLeftHanded` — user prefs, deliberately EXCLUDED from `SETTINGS_PROFILES` (profiles only set keys they list, so touch prefs survive profile switches).
- **Search**: settings search bar. **Persistence**: LocalStorage, synced to DOM on load via `updateUIFromSettings()`. **Live Updates**: changes apply immediately via side-effect callbacks (material updates, shader uniform sync, chunk rebuilds).

### Classes

| Class | ~Line | Purpose |
|-------|-------|---------|
| `VoxelWorld` | 6186 | World management, chunk loading/unloading, block access |
| `ChunkDataPool` | 6741 | Object pooling for chunk data structures |
| `AudioManager` | 7663 | Procedural sound synthesis and playback |
| `UIManager` | 8020 | HUD, hotbar, inventory, menus, toast notifications |
| `Uint8ArrayPool` | 8731 | Pool for Uint8Array objects |
| `Vector3Pool` | 9152 | Pool for Three.js Vector3 objects |
| `ChunkNeighborCache` | 10001 | Optimized neighbor chunk lookups |
| `PerformanceMonitor` | 10639 | FPS tracking, frame timing, circular buffer |
| `ParticleSystem` | 13382 | Particle effects with pooling and custom square shader |
| `SeededRandom` | 16168 | Deterministic PRNG (worker copy at 16627; nested `SeededRNG` at 28086) |
| `Float32ArrayPool` | 16228 | Pool for Float32Array objects |
| `Uint32ArrayPool` | 16312 | Pool for Uint32Array objects |
| `ChunkWorkerPool` | 17789 | Web Worker pool for off-thread terrain gen and meshing |
| `GeometryBufferPool` | 18349 | Tiered GPU buffer pooling (small/medium/large) |
| `MemoryBudgetManager` | 18714 | Memory monitoring, auto-scaling, emergency unload |
| `WorldPreviewRenderer` | 19504 | Real-time terrain preview during world creation (delegates to the game's own `blendedHeight()`/`getBiomeParams()`; the old `WorldPreviewNoise` class was removed) |
| `SunlightTask` | 22925 | Async sunlight propagation with pressure-based bailout |
| `ChunkDiskStorage` | 24112 | OPFS disk cache with inline worker backend |

> The old class-based engine (`SettingsManager`, `InputManager`, `TerrainGenerator`, `ChunkMesher`, `RenderEngine`, `EntityManager`, `Mob`, `Zombie`, `PlayerController`, `VoxExGame`) was dead code (never instantiated) and has been removed. The live game uses module-level functions (`generateChunkData`, `renderChunk`, `buildZombieMesh`/`updateZombies`, the global `animate()` loop) plus the classes above. Tombstone comments mark removal sites in `voxEx.html`.

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHUNK_SIZE` / `WORLD_DIMS.chunkSize` | 16 | Blocks per chunk side (XZ) |
| `CHUNK_HEIGHT` / `WORLD_DIMS.chunkHeight` | 320 | Chunk vertical extent |
| `WORLD_DIMS.seaLevel` | 60 | Default sea level |
| `SECTION_HEIGHT` | 16 | Blocks per vertical section |
| `SECTIONS_PER_CHUNK` | 20 | Sections per chunk (320/16) |
| `CHUNK_DATA_SIZE` | 81920 | Bytes per chunk (16x16x320) |
| `NUM_TILES` | 33 | Texture atlas tile count |
| `MAX_FACES_PER_CHUNK` | 16384 | Hard cap on faces per chunk mesh |
| `GEO_TIER_SMALL` / `_MEDIUM` / `_LARGE` | 4096 / 8192 / 16384 | Geometry tier max faces |
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

- `cx, cz`: chunk coords. `lx, ly, lz`: local block coords (0-15 x/z, 0-319 y). `gx, gy, gz`: global block coords.
- `getChunkKey(cx, cz)`: returns string `"cx,cz"`. `dt`: delta time (s). `distSq`: squared distance (avoids sqrt).
- `_scratch*` / `_tmp*`: reusable scratch objects for hot paths. `*Pool`: object pool (acquire/release). `*Pass`: post-processing or generation pass.
- `GEN_PASS.*` / `RENDER_PASS.*`: bitmask flags. `INPUT_*`: input bitmask (FORWARD=1, BACKWARD=2, LEFT=4, RIGHT=8, JUMP=16, SPRINT=32, CROUCH=64). `MESH_STATE.*`: mesh lifecycle (NONE=0, QUEUED=1, BUILDING=2, READY=3, STALE=4, DISPOSED=5).

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
| F5 / F9 | Quick Save / Load |
| O | Toggle Performance Overlay |
| ~ | Toggle Debug Overlay |
| ESC | Pause / Navigate Menus |

### Touch Controls (Mobile)

Activated by `touchControls` (`auto`/`on`/`off`); `auto` detects coarse-pointer/touch devices and excludes `(pointer: fine)` laptops. When active, `body.touch-mode` is set, `#touch-controls` overlay shown, and gameplay input flows through the same globals as keyboard/mouse.

| Desktop input | Touch equivalent |
|---|---|
| WASD | Left virtual joystick (analog; floating origin, left 40% / bottom 60% zone) |
| Mouse look | Drag on the look region (right/remainder of screen) |
| SHIFT sprint | Push joystick past the outer ring (forward-dominant, hysteresis) |
| SPACE jump / dbl-tap fly | Jump button (double-tap toggles flight) |
| C crouch / fly down | Crouch button |
| Left-hold mine | Touch-and-hold on look region (≥200 ms) |
| Right-click place | Short tap on look region (<200 ms, <8 px) |
| 1-9 / scroll hotbar | Tap hotbar slot; horizontal swipe cycles |
| E / F / V | Inventory / Torch / Camera buttons |
| ESC pause | Pause button (top); F5/F9/O/~ are pause-menu buttons in touch mode |

Key abstractions: `isGameplayActive()` replaces raw `controls.isLocked` gameplay gates (pointer-lock on desktop OR `virtualGameplayFocus` on touch); `enterGameplay()`/`exitGameplay()` are the single enter/leave transitions (desktop locks/unlocks; touch sets virtual focus + runs shared `onGameplayFocusGained()`/`onGameplayFocusLost()`). Pointer events (`pointerdown/move/up/cancel`) with `setPointerCapture` and per-`pointerId` ownership drive all touch input. **Every touch listener body starts with `if (!touchModeActive) return;`** and the three window-level mouse handlers (`onMouseClick`/`onMouseUp`/`onMouseWheel`) early-return in touch mode to suppress synthesized mouse events.

## Development Guidelines

### When Modifying `voxEx.html`
1. **Single File Rule**: ALL code stays in this ONE file — CSS, HTML, JS.
2. **Texture Atlas**: adding blocks → update `NUM_TILES` (~line 4334) + add texture gen in `initTextures`. Current count: **33**.
3. **Block Config**: add to `BLOCK_CONFIG` (~line 3580; auto-derives inventory/textures/transparency). Also update `BLOCK_IS_SOLID`/`BLOCK_IS_OPAQUE`/`IS_TRANSPARENT` + attenuation tables via `initBlockLookupTables()` (~line 11831).
4. **Biome Config**: add to `BIOME_CONFIG` (~line 3987; inherits from `BIOME_DEFAULTS`) + a height function to `HEIGHT_FUNCS`.
5. **Settings**: default in `DEFAULTS` (~line 5284) → wire into `SETTINGS` (~line 5067) → DOM binding in settings UI (event wiring ~line 28800+) → `saveSettings()`.
6. **UI Overlay**: elements toggled via `controls.lock`/`unlock` events.
7. **Light System**: when changing blocks, call `updateSunlightAt()` + `updateBlockLightAt()`. Use `SunlightTask` for async propagation.
8. **Chunk Format**: use `chunk.blocks` / `chunk.skyLight` / `chunk.blockLight` (with backward-compat checks).
9. **Voxel Aesthetic**: BoxGeometry only — no spheres/cylinders/curves.
10. **Worker Parity**: terrain functions are SINGLE-SOURCE on main thread (`continentalHeight`/`mountainsHeightFunc`/`getRiverFactor`/`getBiomeCellDirect`/`isMountainRegion`, ~line 36269-36693). `buildChunkWorkerCode()` (~line 20007) injects their `Function.toString()` source between the `/* __TERRAIN_FUNCS_START__ */` … `/* __TERRAIN_FUNCS_END__ */` markers (~line 19552). Edit ONLY the main-thread sources — the worker copy is generated. Injection loop ~line 20059-20107; markers MUST stay intact or the worker throws on first terrain call.

### Common Search Patterns
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`, `const DEFAULTS`, `SETTINGS_PROFILES`
- **Block Types**: `const AIR`, `const GRASS`, `const LEAVES`, `BLOCK_CONFIG`, `BLOCK_IS_SOLID`, `BLOCK_IS_OPAQUE`
- **Biomes**: `BIOME_CONFIG`, `BIOME_DEFAULTS`, `getBiomeParams`, `getBiomeCellDirect`, `HEIGHT_FUNCS`
- **Terrain**: `blendedHeight`, `continentalHeight`, `mountainsHeightFunc`, `plainsHeightFunc`
- **Rivers**: `getRiverFactor`, `getRiverDepth`
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
- **Touch/Mobile**: `touchModeActive`, `isGameplayActive`, `enterGameplay`, `exitGameplay`, `recomputeTouchMode`, `initTouchControls`, `computeJoystickVector`, `touchMoveX`/`touchMoveZ`, `resetTouchInput`, `#touch-controls`, `#touch-look-region`, `#touch-joystick`, `applyTouchControlSettings`, `SETTINGS.touchControls`
- **Shared actions** (keyboard+touch single-source): `handleJumpPressed`/`handleJumpReleased`, `handleCrouchPressed`/`handleCrouchReleased`, `toggleTorch`, `selectHotbarSlot`, `cycleHotbar`, `stopMining`, `togglePerfOverlay`, `toggleDebugOverlay`
- **Compression**: `rleEncode`, `rleDecode`, `compressChunkData`, `decompressChunkData`
- **Save/Load**: `saveWorld`, `loadWorld`, `saveChunkToCache`, `loadChunkFromCache`, `preGenerateSpawnChunks`
- **Workers**: `class ChunkWorkerPool`, `class ChunkDiskStorage`, `buildChunkWorkerCode`
- **Memory/Pools**: `class MemoryBudgetManager`, `class PerformanceMonitor`, `checkGeometryLeaks`, `class ChunkDataPool`, `class GeometryBufferPool`, `class Float32ArrayPool`
- **World Creation**: `class WorldPreviewRenderer`, `populateBiomeSelector`, `applyTerrainSettings`, `customWorldSettings`
- **Day/Night**: `updateDayNight`, `dayNightTime`, `btn-time-` (time buttons), `SETTINGS.dayLength`

### Light Level Reference
15 = full sunlight (exposed to sky). 14 = torch block light; 1 block from sun (under 1 leaf). 12-13 = under canopy (2-3 leaves). 8-11 = medium shade / cave opening. 4-7 = deep shade. 2-3 = deep cave. 1 = minimum stored skylight (blocklight may be 0). Rendering floors combined light at 3 via `extractLightFromChunk()`, so levels 1-2 appear as level 3 on meshes.

### Performance Tips
- Typed arrays (Uint8Array, Float32Array) over regular arrays; object pooling for frequently created geometries.
- Batch chunk updates with `scheduleChunkUpdate()`; keep render distance 8-16 chunks for most devices.
- Scratch objects in hot paths (`_pickDirTmp`, `_closestZombieResult`, `_scratchOrigin`); hoist functions out of closures (see `extractLightFromChunk`).
- `blockIndex(lx, ly, lz)` = `lx + lz * 16 + ly * 256`. Lookup tables (BLOCK_IS_SOLID, AO_LOOKUP, FADE_LUT) over branching.
- Unroll vertex writing (`writeFaceVertices`); bit-packed merge keys (`getMergeKey(blockId, ao, light)`).
- Throttle occlusion checks (every 5 frames), shadow updates (>0.5u). Use `shouldYield()` / `checkFrameBudget()` in async ops.

---

## JavaScript Code Quality Rules

**JSDoc**: typedefs at ~line 3387 (core: `BlockId`, `TileIndex`, `ChunkCoord`, `LocalCoord`, `GlobalCoord`, `ChunkKey`, `HexColor`, `LightLevel`, `AOValue`, `Position3D`, `AABB`, `BlockHit`, `BlockInteractionResult`, `ChunkData`, `BlockConfigEntry`) and ~line 3829 (tree/biome: `NoiseConfig`, `WorldConfig`, `TrunkConfig`, `CanopyConfig`, `CanopyShape`, `TreeConfig`, `BiomeTreeConfig`, `BiomeConfigEntry`, `ResolvedBiome`). All public functions need JSDoc: start with `/**`, lowercase primitives (`number`/`string`/`boolean`), `@param {type} name - desc.`, `@returns` for non-void, `@throws` where applicable, optional as `[name=default]`.

**Conventions** (one-liners):
- Strict equality always (`===`/`!==`) — `==` causes coercion bugs (`"" == 0` is true).
- Typed arrays for numeric data; never `[]`/`new Array(n)` (sparse + GC pressure).
- `??` for defaults (not `||`, which fails on `0`/`""`). Optional chaining: `chunk?.blockLight?.[i] ?? 0`.
- `for` loops in hot paths (render, meshing); array methods (`.map`/`.filter`) only in run-once setup.
- Guard clauses at function start for validation; try-catch only at boundaries (save/load, IndexedDB) — not internal pure functions.
- `var` is banned (use `const`/`let`); named functions in hot paths (profiler names); no allocations/closures in `renderChunk` (30K+ closures per mesh — hoist to module scope); no `delete` on arrays (use `splice`); template literals over string concat in loops.

**Debug console globals**: `window._faceCountHistogram`, `window.printFaceHistogram()`, `window.geometryPool.getStats()`, `window.memoryBudgetManager.getStatus()`. Profile with `console.time('[Tag] …')` / `console.timeEnd(...)`.

---

## Claude Code Guidelines

**Refactoring scope**: refactor for correctness/readability/performance; keep diffs focused (no unrelated renames or style-only churn); never break the single-file rule.

**Bug prevention**: before declaring any new `const`/`let`/function, search the file for the name — don't redeclare in the same scope or shadow globals (`scene`, `camera`, `SETTINGS`, `WORLD_CONFIG`, `chunks`). Settings must round-trip via save/load and have real DOM IDs. Keep per-frame code to ≤2 nested loops; batch/cache/limit-to-nearby for expensive work. Terrain changes need worker parity (`buildChunkWorkerCode()` injection); `WorldPreviewRenderer` delegates directly to the same functions, so it needs no separate parity check.

**Logging**: prefer `logDebug(...)` over `console.log(...)` (chunk cache, pre-gen, streaming/eviction, new systems). Keep logs sparse (no per-frame/per-block spam) and tagged (`[PreGen]`, `[Chunks]`, `[Lighting]`, `[ZombieFX]`, `[Settings]`). `#debug-overlay` shows concise high-value info only (FPS, position, chunk/mesh/face counts, seed, biome).

**Change reporting** — when proposing changes, format as: **Summary** (2-5 bullets), **Changes** (grouped by subsystem), **Rationale** (why: bug fix / perf / clarity), **Safety Checks** (confirm: no duplicate/shadowed identifiers, DOM IDs + settings wired, no heavy per-frame loops added).

**Commit hygiene** — the working tree frequently carries churn you didn't author (line-ending/EOL normalization, editor/formatter passes) across many files unrelated to your task. Stage ONLY the files your change actually touched — never `git add -A`/`git add .`. Confirm the set with `git diff --stat`, eyeball each file's real changes with `git diff <file>` before staging, and if a file you edited also shows whole-file EOL/whitespace churn, isolate your content edits with `git diff --ignore-all-space <file>`. This applies to whatever you're working on — code, docs, tools, or config.

## Quick Reference Checklist

Before committing, verify:

- [ ] No duplicate `const`/`let`/`function` declarations (search file first)
- [ ] No shadowing of globals: `scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`
- [ ] All new functions have JSDoc with `@param` and `@returns`
- [ ] Hot paths use `for` loops, not `.map()`/`.filter()`/`.forEach()`; typed arrays for numeric data
- [ ] Strict equality (`===`, `!==`) everywhere
- [ ] New settings have defaults in `DEFAULTS` and round-trip correctly; new DOM IDs exist in HTML and match JS
- [ ] Logs use `logDebug()` with `[Tag]` prefix, not `console.log()`
- [ ] No work added to the per-frame render loop without batching
- [ ] Touch handlers start with `if (!touchModeActive) return;`; no allocations/closures/logging in `pointermove`; gameplay gates use `isGameplayActive()` not raw `controls.isLocked`
- [ ] Chunk size is 16x16x320 (not 128); atlas has 33 tiles (update `NUM_TILES` if adding blocks); block lookup tables updated if adding blocks (`initBlockLookupTables()`)
- [ ] Worker parity: edit ONLY main-thread terrain functions (~line 36269-36693); worker copy is auto-injected by `buildChunkWorkerCode()` (~line 20007) via `Function.toString()` between the `__TERRAIN_FUNCS_*` markers (~line 19552) — keep markers intact
- [ ] Run `tools/voxex-tests.html` (~204 tests) to verify no regressions (serve over localhost)
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (top of voxEx.html, console boot banner)
- [ ] Worker parity: the worker template's `WORLD_DIMS` (incl. `yOffset`!) and `BIOME_CONFIG` are HAND-MAINTAINED copies — verify they match main thread (a `yOffset` drift of 64 silently broke ALL worker tree generation; found 2026-06-12)
- [ ] Tree code is SINGLE-SOURCE (2026-06-13): tree mask/placement/canopy functions (`treePlacementValue`, `getTreeDensityForBiome`, `generateTreeMaskForChunk`, `getTreeMaskForChunk`, `getTreeMaskValueGlobal`, `resolveTreeProfile`, `pickTrunkSize`, `wouldHaveValidTree`, `isTreeSiteViable`, `getChunkTreePositions`, `getCanopyLayerRadius`, `forEachCanopyVoxel`, `generateTreesForChunk`) are injected into the worker by `buildChunkWorkerCode()` between the `/* __TREE_FUNCS_START__ */ … __END__ */` markers. Edit ONLY main-thread sources. The worker still hand-maintains leaf helpers (`seededRandom`, `isLeafBlock`/`isLogBlock`, `getTreeMaskKey` — seed-qualified), caches (`treeMaskCache`, `treePositionsCache`), `TREE_MAX_RING_SLOPE`; injected tree functions depend on terrain-injected `getBiomeParams`/`blendedHeight`/`getRiverFactor`/`biomeByName`. Keep markers intact.

## Testing Tools

- **`tools/voxex-tests.html`** — automated suite (~204 tests). Tests REAL `voxEx.html` code via a `?test=1` seam exposing `window.VoxEx` (inert without the flag). Loads the game in a hidden iframe; must be served over localhost (Workers + IndexedDB). Covers bootstrap, terrain (determinism/finite/ocean-river/trees), lighting, compression, meshing, block-table invariants, VoxelWorld/collision/raycast, live chunk-worker round-trip + `blendedHeight` parity, persistence codec (`ChunkCompressor` RLE run-splitting + binary OPFS round-trip), and IndexedDB persistence round-trip.
- **`tools/terrain-visualizer.html`** — terrain debugger. Shaded relief top-down + cross-section; click to inspect height, biome, surface block, slope, noise, elevation zone. Delegates to voxEx.html via the `?test=1` seam (requires localhost, like tools/voxex-tests.html); no hand-synced terrain code remains. Surface-block material classification is a local, documented approximation (the real per-column material cascade lives inline in `generateTerrainPass`, not on the seam).
- **`tools/voxex-texture-tests.html`** — visual texture tests. Renders all 33 atlas tiles; automated opacity/transparency/color-sanity/atlas-dimension checks.

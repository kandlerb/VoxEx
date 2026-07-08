# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx** is a fully-featured, browser-based voxel exploration game engine inspired by Minecraft. It runs entirely in the browser without external servers or installations.

- **Type**: Browser-based 3D voxel game engine (HTML5 + JavaScript ES6 modules)
- **Main File**: `voxEx.html` (single file — no exceptions), ~46K lines
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, Web Workers, Web Audio, IndexedDB, OPFS, LocalStorage

## Project Priorities

Core principles guiding all development decisions:

1. **One File to Rule Them All** — the entire game runs from a single HTML file with all CSS/JS/assets embedded. No external dependencies, scripts, or resources. This principle is sacred and will never change.
2. **No Circles. Ever. Only Squares (Voxels)** — everything is BoxGeometry cubes (blocks, torch, characters); procedural 16x16 pixel-art textures; Minecraft-inspired aesthetic.
3. **Optimized for [Almost] Any Device** — typed arrays, object pooling, face/frustum culling, section-based LOD, tiered geometry buffers (small/medium/large), RLE chunk compression, 16.67ms frame budget with yield points. Targets 60fps on mid-range hardware.
4. **Flexible Settings** — render distance 4-32 chunks; graphics toggles (AO, smooth lighting, shadows, fog, frustum culling, volumetrics, GI, water refraction, stars, clouds); water effects; particle systems; movement options; 3 profiles (Performance/Balanced/Quality); key bindings in `KEY_BINDINGS` (rebinding UI not built — controls menu is a static display); multi-slot saves with unique seeds; all persisted via LocalStorage.

## How to Work in This Repo (read first)

- **Line numbers in this file DRIFT.** The main file gains thousands of lines per month. Every `~line NNNN` here is a hint from some past build — ALWAYS locate code by grepping the named anchor (`class VoxelWorld`, `const BIOME_CONFIG`, `function terrainSurface`), never by line number.
- **Read `docs/agent-notes.md`** for hard-won knowledge: the do-not-retry ledger (approaches that failed structurally), three.js gotchas, subsystem as-built notes, terrain lessons, settled aesthetic decisions, and sandbox-environment warnings. Don't re-attempt anything in its ledger; don't re-litigate anything in its decisions list.
- **Verification ladder** (cheapest first):
  1. `node tools/syntax-check.mjs` — every `<script>` block parses (seconds; catches truncation, bad edits, same-scope redeclarations).
  2. `node tools/parity-check.mjs` — hand-maintained copy lockstep + injection markers (seconds; run after ANY terrain/worker/config change).
  3. `node tools/terrain-node-checks.mjs [voxEx.html] [seed]` — headless terrain invariants (run on ≥3 seeds for terrain changes).
  4. `node tools/run-browser-tests.mjs` — the authoritative browser suite (315+ tests: workers, meshing byte-parity, lighting, persistence) run HEADLESSLY against a local Chrome/Edge. Same suite as `tools/voxex-tests.html` in a browser.
  5. In-game eyeball for anything visual.
- **Pre-commit hook**: enable once per clone with `git config core.hooksPath .githooks` — it runs gates 1-3 automatically when `voxEx.html` is staged.
- **Change docs are "CCRs"** (Change Control Request/Report) — see [Change Workflow](#change-workflow-ccrs). New CCRs start from `CCR's/_TEMPLATE.md`.
- Working in a sandboxed/mounted environment (Cowork)? Read `docs/agent-notes.md` §7 FIRST — the mount silently truncates large-file reads and corrupts the git index.

## Repository Structure

```
VoxEx/
├── index.html                # System check & launcher (WebGL, GPU benchmark)
├── voxEx.html                # Complete game (HTML + CSS + JS, ~46K lines)
├── CLAUDE.md                 # This file — rules, registries, checklists
├── README.md                 # Project readme
├── futureFeatures.md         # Feature roadmap
├── CCR's/                    # Active change docs (+ Finished/ archive,
│                             #   _IMPLEMENTATION_RUNBOOK.md, _CROSS_CCR_NOTES.md)
├── docs/
│   ├── agent-notes.md            # Hard-won knowledge: do-not-retry ledger, gotchas,
│   │                             #   as-built subsystem notes, environment warnings
│   └── superpowers/              # HISTORICAL plans/specs (pre-terrainSurface era)
├── .githooks/                # Pre-commit gate (enable: git config core.hooksPath .githooks)
├── tools/                    # Development & testing utilities
│   ├── syntax-check.mjs          # All <script> blocks parse (truncation/redeclaration gate)
│   ├── parity-check.mjs          # Lockstep checker — hand-maintained copies + markers
│   ├── terrain-node-checks.mjs   # Headless terrain invariants (no browser)
│   ├── terrain-probe.mjs         # Diagnostic instrument: height/transect/stats/hillshade PNG
│   ├── lib/extract-terrain.mjs   # Shared extraction (real funcs by name — never replicas)
│   ├── run-browser-tests.mjs     # Headless runner for the browser suite (zero-dep CDP)
│   ├── voxex-tests.html          # Browser suite (315+ tests) — REAL voxEx.html code via
│   │                             #   ?test=1 seam (window.VoxEx); serve over localhost
│   ├── voxex-texture-tests.html  # Visual texture atlas tests (own local tile set + checks)
│   ├── terrain-visualizer.html   # Terrain debugger (delegates to game via ?test=1)
│   ├── terrain-parameter-editor.html / voxelEditor.html / KeyFrame_editor.html
│   ├── voxex-sound-formula.html  # Sound synthesis designer
│   ├── docs-viewer.html          # Documentation viewer
│   └── scratch/                  # GITIGNORED one-off probes — never commit replicas
└── .github/                  # Issue templates + CI (checks.yml)
```

## Version Constants (bump discipline)

All near the top of `voxEx.html` (grep the name). Getting these wrong ships stale caches or silently regenerates every world.

| Constant | Bump when | Effect of bump |
|---|---|---|
| `VOXEX_BUILD` | EVERY deploy/change (date-based `YYYY-MM-DD.N`) | Console boot banner; add a `VOXEX_RECENT_CHANGES` entry citing the CCR ID |
| `TERRAIN_GEN_VERSION` | ANY change to terrain output (incl. float-epsilon shifts, e.g. rerouting through `noise2Dd`) | Saved chunks regenerate |
| `CURRENT_CACHE_VERSION` | Chunk cache format/lighting-semantics changes (e.g. attenuation values) | Cached chunk lighting recalculates |
| `SETTINGS_VERSION` | Changing `DEFAULTS` in a way that must override saved settings | Saved settings wiped on mismatch |

Never re-declare these (each is single-source; `CURRENT_CACHE_VERSION` was once duplicated and drifted — CACHE-002).

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Three.js** | 0.160.0 | 3D rendering, lighting, camera control |
| **PointerLockControls** | Three.js addon | First-person camera/input control |
| **Web Workers** | Native | Off-thread terrain gen, sunlight, and (unbanded) chunk meshing via `ChunkWorkerPool` |
| **Web Audio API** | Native | Procedural sound synthesis (zombie growls, etc.) |
| **IndexedDB** | Native | Chunk data persistence with RLE compression |
| **OPFS** | Native | Origin Private File System disk cache (`ChunkDiskStorage`) |
| **LocalStorage** | Native | Game saves and settings storage |
| **Canvas API** | Native | Procedural texture generation (Atlas) |
| **WebGL** | Via Three.js | GPU-accelerated rendering |
| **GLSL** | Via Three.js | Custom shaders (cylindrical fog, water refraction, underwater, volumetric) |

## Architecture Overview

Layered pipeline (top → bottom). No top-level engine class — the live game is module-level functions plus the classes listed under [Classes](#classes).

- **UI Layer** (HTML/CSS): HUD (crosshair, hotbar, block name, flight/sprint icons); menus (start, pause, settings, world creation, seed select); inventory (E key, drag-drop); world management (rename/duplicate/import/export/storage); perf overlay (O), debug overlay (~); toasts; settings search + profiles. Menu-overlay perf rules: see `docs/agent-notes.md` §3 (keep heavy overlays out of `#blocker`; no backdrop-filter over scrollable panels).
- **Game Engine** (Three.js render pipeline): camera (1st + 3rd person, V key, orbit/zoom); lighting (day/night, sun/moon, ≤8 torch point lights); skybox (3 star layers, volumetric clouds); materials (chunk StandardMaterial with per-texel roughnessMap, 3 water modes, separate translucent glass mesh, custom GLSL fog/refraction); post-processing (volumetric god rays, color grading, zombie vignette/desat, underwater); ParticleSystem; viewmodel arms + torch. Render layers: 0=world, 1=viewmodel, 2=player body.
- **World Management** (VoxelWorld + terrain functions): chunk gen 16x16x320 / 20 sections; ChunkWorkerPool (auto-sized, zero-copy transfer); meshing (face cull + AO + greedy + LOD; worker-meshed for unbanded chunks, main-thread for edited/banded/torch/fire/glass — `WORKER_MESH_PIPELINE_ENABLED`); 6 biomes + foothill transitions; climate+spline `terrainSurface` (default) with legacy biome-cell path behind `useNewTerrain:false`; domain-warped noise-ribbon rivers (`getRiverFactor`); structures (trees/multi-trunk/caves); cached frustum culling; section analysis; GEN_PASS/RENDER_PASS bitmasks.
- **Lighting Engine**: SunlightTask (async, pressure-based bailout; worker sunlight via `WORKER_LIGHTING_ENABLED`); torch block light (level 14, 6-direction); deferred lighting for distant chunks; edge lighting reconciliation; watchdog (300ms grace); volumetric cone sampling (7-ray sun, 5-ray point).
- **Entity & Player Systems**: physics/collision/swim movement; shared `buildArticulatedMesh` (3-segment spine, shoulder/elbow + hip/knee pivots, procedural pixel-art textures); customizable player; procedural zombies (≤10, pooled); zombie AI state machine (wander → chase → attack); spring-damped animation (11+ states); 7-keyframe knockdown ragdoll (3.5s).
- **Memory & Performance**: MemoryBudgetManager (auto-scale render distance: −1 at 80% warning, −2 + emergency unload 20% at 95% critical); GeometryBufferPool (4K/8K/16K face tiers, auto-upgrade); object pools (Float32/Uint8/Uint32Array, Vector3, ChunkData, GeometryBuffer); PerformanceMonitor (FPS ring buffer, 8ms budget); geometry leak detection (5s, warn at 500+ excess); spatial hash grid (O(1) proximity); SeededRandom PRNG.
- **Data Persistence**: IndexedDB chunk cache (stores: saves/chunks/settings); ChunkDiskStorage OPFS backend (lazy init); RLE compression (v2: blocks + skyLight + blockLight); batch ops; JSON world save (seed, player state, genParams, modified chunks, thumbnail); LocalStorage settings/profiles/quick save.

## Block Types (Current: 23 blocks)

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
| 15 | `GLASS` | Transparent + collidable; rendered as a SEPARATE translucent per-chunk mesh (`<cKey>_GLASS`), zero light attenuation |
| 16 | `FIRE` | Transparent, walk-through separate-render block; clings to adjacent faces; 12-frame anim; bakes ZERO block light (glows via the dynamic `torchLightPool`) |
| 17 | `BURNT_LOG` | Charred log (fire burn result) |
| 18 | `BURNT_PLANKS` | Charred planks (fire burn result) |
| 19 | `ICE` | Transparent + collidable; magic-system Freeze spell result (magicSystem.md Phase 1). Unlike GLASS, meshes through the STANDARD cutout terrain path (LEAVES-style) — no separate translucent mesh, no worker re-route. Frosted: sunlight/blocklight attenuation 1/1 (locked decision; not yet eyeballed in-game — flipping to 0/0 clear later requires a `CURRENT_CACHE_VERSION` bump) |
| 20 | `CRACKED_STONE` | Generic cracked-block variant of STONE (CCR-MAGIC-006 C3); solid, not burnable; `crackedFrom: STONE` |
| 21 | `CRACKED_DIRT` | Generic cracked-block variant of DIRT (CCR-MAGIC-006 C3); solid, not burnable; `crackedFrom: DIRT` |
| 22 | `CRACKED_PLANKS` | Generic cracked-block variant of WOOD (CCR-MAGIC-006 C3); solid + burnable (still burns like WOOD, `burnsTo: BURNT_PLANKS`); `crackedFrom: WOOD` |
| 255 | `UNLOADED_BLOCK` | Placeholder for unloaded chunks |

- **Texture Atlas**: `NUM_TILES = 40` tiles in a horizontal strip (12 fire frames + 3 burnt + base blocks + 3 magic-system spell-icon tiles + ICE + 3 cracked-variant tiles — magicSystem.md Phases 0-1, CCR-MAGIC-006 C3; icon tiles are inert atlas columns, never meshed).
- **Cracked-variant mechanism** (CCR-MAGIC-006 C3): one reusable `drawCrackOverlay(logicalOffset, seed)` texture stamp (authored in `initTextures`, near the glass/ice tile generators) applied over a copy of each base tile's own generator output — not three independently-authored textures. `CRACKED_VARIANT` (`Uint8Array(256)`, built in the same `BLOCK_CONFIG` compile loop that reads `burnsTo`/`burnTime`) maps a base block ID to its cracked variant via each variant's `crackedFrom` field; variants never declare `crackedFrom` pointing at themselves or each other, so a cracked block never re-cracks. Scarred generically at three sites — the explosion crater rim (`scarExplosionRim`, a shell scan from the carve radius to radius+1), the laser's channeled bore walls (`scarTubeWalls`, walks the same DDA path as `carveTubeEdit` sampling the shell just outside the bore radius), and the fireball impact patch (inside `onFireballImpact`'s char-core scan, for scanned blocks that aren't burnable) — each site: `const cv = CRACKED_VARIANT[id]; if (cv && Math.random() < 0.6) setBlock(x, y, z, cv);`, dithered so it reads as fracture, not paint.
- **Water light**: attenuates sunlight 1/block, blocklight 2/block. Changing attenuation semantics = bump `CURRENT_CACHE_VERSION` (see [Version Constants](#version-constants-bump-discipline)).
- **Lookup Tables**: `BLOCK_IS_SOLID[256]`, `BLOCK_IS_OPAQUE[256]`, `IS_TRANSPARENT[256]`, `SUNLIGHT_ATTENUATION[256]`, `BLOCKLIGHT_ATTENUATION[256]` — Uint8Array fast lookups.

## Biome System (6 Biomes + Foothills)

| Biome | Weight | Characteristics |
|-------|--------|-----------------|
| **Plains** | 2 | Flat, sparse oak trees, baseHeight 62, spherical canopies |
| **Hills** | 2 | Rolling hills with abs() smoothing, moderate trees, amplitude 40 |
| **Forests** | 2 | Dense oak trees, moderate terrain |
| **Mountains** | 0.5 (unused — mask-placed) | High peaks, ridged noise, conical pines, treeline, snow |
| **Swamp** | 1 | Low baseHeight 58, water pools, droopy trees |
| **Longwoods** | 2 | Giant 2x2/3x3 trunk trees, heights 12-24, wide sparse canopies |
| **Mountain Foothills** | auto | Transition zone (single 64-block cell ring, constant ringFactor 0.75, mountain-derived noise) |

Biomes configured in `BIOME_CONFIG`; missing fields inherit from `BIOME_DEFAULTS`. Tags: `"mountain"` (treeline + alpine terrain), `"forested"` (high tree density), `"giant_trees"` (multi-block trunks).

**Terrain Generation Pipeline**: **`WORLD_CONFIG.useNewTerrain: true` (the default) routes ALL height queries through the climate+spline surface — `terrainSurface`/`computeSurfaceHeight`/`resolveBiome` (temperature/humidity/continentalness/erosion/peaks-valleys fields + splines, swiss-turbulence erosion, crest-following peak boost, centered fractal with `HF_PIVOT`/`VALLEY_RATIO`).** The bilinear biome-cell system below is the LEGACY A/B path, reachable only by setting the flag false. Legacy path: continental height + domain warping → weighted cell-based biome selection → per-biome height functions. Shared by BOTH paths: river/ocean carving → structure placement. Biome boundaries use two-octave domain warping for organic edges.

**Mountain-Foothills Transition** (legacy path — inert under the default `useNewTerrain: true`):
- `foothillsHeightFunc` uses `mountainsHeightFunc` output scaled by ring factor — ridges/valleys align at boundaries (no mismatched noise).
- SINGLE ring (`MAX_FOOTHILL_RINGS = 1`, one 64-block biome cell): any non-mountain cell 8-adjacent to a mountain cell becomes foothills with constant `ringFactor = 0.75`. `mountainWeight = ringFactor * 0.9 = 0.675` controls relief passthrough; baseHeight lerps plains (62) → foothills (70) by ringFactor.
- **Mountain placement**: by a low-frequency domain-warped region mask (`isMountainRegion`) so they cluster into coherent ranges — NOT the per-cell weighted roll (which distributes the other 5 biomes via the noise-calibrated CDF `_BIOME_CDF_TABLE`; `rebuildBiomeTable` excludes mountains, so `BIOME_CONFIG.mountains.weight` is unused).

## Key Systems Explained

### Chunk System
- **Size**: 16x16x320 (CHUNK_SIZE=16, CHUNK_HEIGHT=320), subdivided into 20 sections (SECTION_HEIGHT=16) for LOD/culling.
- **Structure**: `{blocks: Uint8Array, skyLight: Uint8Array, blockLight: Uint8Array}` (backward-compatible with old Uint8Array-only format).
- **Section Analysis**: per-section `isEmpty`, `isFullySolid`, tight bounds for render skipping.
- **Meshing**: `renderChunk()` builds indexed geometry on main; `WORKER_MESH_PIPELINE_ENABLED = true` routes UNBANDED (streaming/never-edited) chunks to the worker mesher (single-sourced via injection, byte-parity-gated in the browser suite). Edited/banded/torch/fire/glass chunks mesh on main. Face culling, AO baked into vertex colors, face-merge key bit-packing. `ChunkNeighborCache` speeds neighbor lookups.
- **Banded meshing (lazy)**: chunks band PER-CHUNK on first edit (`markChunkBanded`; `chunkUsesBands(cKey)`); banded mesh keys are `'cx,cz#band'` (+`_WATER`), stripped by `chunkBaseOfMeshKey()`. 4 bands × 5 sections. Do NOT enable eager banding globally — it ~doubles streaming mesh cost (see agent-notes ledger). Profiler: `meshProfile()`.
- **Geometry Tiers**: Small (4K faces ~0.78MB), Medium (8K ~1.56MB), Large (16K ~3.12MB), auto-upgrade. Pools: `ChunkDataPool`, `GeometryBufferPool`, `Float32ArrayPool`. `MemoryBudgetManager` auto-scales render distance under pressure.
- **Pass System**: `GEN_PASS` (TERRAIN=1, WATER=2, DECORATIONS=4, SUNLIGHT=8, BLOCKLIGHT=16, NEIGHBOR_UPDATE=32, TREE_NEIGHBOR_UPDATE=64); `RENDER_PASS` (INITIAL_MESH=1, EDGE_LIGHTING=2, NEIGHBOR_LIGHTING=4, FULL_QUALITY=8).

### Lighting System
- **Light Levels**: 1-15 (1 = min visibility, 15 = full sunlight).
- **SunlightTask**: async propagation, throttle at 80% hard cap, bailout to full recalc at 100%. Fresh-terrain sunlight can compute in the worker (`WORKER_LIGHTING_ENABLED`); `calculateBlockLight` is main-only (fresh terrain has no torches).
- **Block Light**: torch sources propagate at level 14, 6-direction spread. FIRE bakes zero block light (dynamic `torchLightPool` glow instead) so `setBlock` stays on the light-neutral fast path.
- **Deferred Lighting**: distant chunks (>16 blocks) use a simplified height-based model.
- **Edge Lighting**: cross-chunk boundary reconciliation, max 3 passes/chunk. **Watchdog** force-clears stuck pending light (300ms grace).
- **Semi-Transparent**: leaves reduce light by 1 instead of fully blocking.
- **Smooth Lighting**: `SETTINGS.smoothLighting` — per-corner sampling (`calculateFaceCornerLight`, same offset table as AO). Light left the merge key in CCR Phase 3A; the wet-shoreline damp level stays in the key (layout `(blockId<<10)|(damp<<8)|AO`) so the shoreline stays crisp/blocky (user preference).
- **Normals**: chunk/water geometries carry NO normal attribute — chunk materials use `flatShading: true` (normals derived in-shader via dFdx/dFdy).
- **Minimum Light**: skylight never < 1; blocklight valid 0-15 (0 = no torch). At mesh time `extractLightFromChunk()` floors combined light at **3** (20% base brightness) so deep caves stay faintly visible.
- **Formula**: `vertexColor = AO x (lightLevel / 15.0)`. **Volumetric Sampling**: 7-ray cone (sun/moon), 5-ray cone (point lights) for partial visibility through foliage.

### Rendering System
- **Textures**: procedural 16x16 pixel art on canvas (Atlas: 37 tiles).
- **Terrain Material**: MeshStandardMaterial, vertex colors, alpha test 0.1, per-texel `roughnessMap` authored from `MAT_PROFILES` (matte base + color-keyed shiny accents; accents need roughness ≲110 to glint). Live control: `uShininessStrength` uniform driven by the repurposed `SETTINGS.specularIntensity` ("Shininess Strength"); `specularEnabled` off = fully matte AND kills env reflections.
- **Glass**: separate translucent per-chunk mesh (`<cKey>_GLASS`), non-greedy 1×1 quads emitted at end of `renderChunk`; body opacity baked into texture alpha (`setGlassBodyAlpha()`); glint punch-through via `uGlintReflect`; cutout shadows via `glassDepthMaterial` (see agent-notes §2 for the three.js alphaTest gotcha). Workers route `hasGlass` chunks to main. Screen-space glass refraction was tried and RETIRED — do not retry (agent-notes ledger).
- **Env Reflections**: analytic sky reflection on shiny terrain texels (`envReflectionEnabled`, default off, not in profiles) — same approach as water, deliberately not PMREM.
- **Water**: three modes — Standard (PBR), Fast (Lambert), Refraction (custom GLSL, Beer-Lambert absorption). Refraction RT scale: `refractionScale` setting (compounds with pixelRatio).
- **Fog**: custom cylindrical shader (XZ-only distance, not vertical) via `onBeforeCompile`. **Biome Fog Tinting**: per-biome fog color lerp (plains=neutral, forests=green, mountains=blue, swamp=murky).
- **Volumetric**: god rays, multi-point-light (≤4 volumetric point lights). **Post-Processing**: EffectComposer (volumetric pass, color grading, underwater, zombie effects).
- **Color Grading**: sunrise (0.15-0.35 dayTime) warm orange/pink, sunset (0.65-0.85) deep orange/red.
- **Particles**: `ParticleSystem` (max 500), Chebyshev-distance square shader for voxel-style particles.
- **Camera**: 1st + 3rd person (V); orbit yaw/pitch, zoom +/-, collision-aware distance. Layers: 0=world, 1=viewmodels, 2=player body (3rd person).
- **Stars**: 3-layer field (radii 350/400/450), shader sine-wave twinkle, day/night fade. **Clouds**: volumetric particles (1500 base × density), clumped, day/night alpha.
- **Shadows**: pixel-snapped maps, update only when player moves >0.5u or sun angle >5deg; two stability paths (blocky ratchet vs light-space texel snap) — mechanics in agent-notes §3. **Frustum Culling**: cached frustum, inner-radius exception, recompute on >5deg yaw change; near ring (`BUILD_AHEAD_RADIUS ≤ 10`) pre-meshes in all directions so rotation doesn't trigger build waves.
- **Web Workers**: `ChunkWorkerPool` offloads terrain gen, sunlight, and unbanded meshing; identical functions injected via `Function.toString()`.

### Water Effects System
- **Ripples**: velocity-scaled expansion, configurable segments (4=diamond, 6=hex, 8=octagon), max 20.
- **Wading**: chevron wake when walking in water, speed-scaled cooldown.
- **Splash**: dynamic particle count (1-8) by impact velocity; splash columns for high impact.
- **Bubbles**: continuous underwater stream (300ms cooldown), breath bursts every 3-5s.
- **Swim Wake**: V-pattern foam trail when swimming (>0.5 units/s). **Landing Dust**: block-colored dust on impact (≥5 units/s). **Underwater Shader**: Beer-Lambert absorption (R/G/B), fog density.

### River System
- **Algorithm**: stationary domain-warped noise ribbon — `getRiverFactor(gx, gz, seed)` returns 0 (river center) → 1 (no river) where `|noise2D|` of the warped coordinates falls below the channel half-width. Warp = two-octave coordinate warp + axis-balanced sinusoidal meander + regional macro-meander (`RIVER_WARP_*`). There is NO gradient-descent tracing and NO `RiverNetworkCache` (that class does not exist in the code).
- **Width & fade**: half-width `RIVER_BASE_WIDTH` (0.064 noise units) ± coastal variation; `getRiverFactor` takes an optional `widthMult` (1 = channel, 3 = valley band). `heightPenalty = smoothstep(75, 95, terrainHeight)` (CCR-RIVER-002): full width ≤75, narrowing 75–95, pinch-out >95. A mountain river-tunnel punch that once lived in `generateTerrainPass` was fully DELETED (TER-5).
- **Carving (CCR-RIVER-002/003)**: two stages in `applyRiverCarve`. (1) VALLEY depression — terrain around the channel is pulled down toward a valley profile (floor keeps 15% of original relief: `(0.15 + 0.85·vf²)` above seaLevel+2 — a pure vf² clamp made dead-flat sand pans; walls contour-wiggled; influence band = 3× channel width), so rivers sit in valleys instead of slot canyons and hills become valley crossings, not dams. (2) FULL-depth channel incision to the `getRiverDepth()` bed (below sea level → carved columns flood; no `tunnelMix` benches). Both stages have independent strength fades (valley 80–93, channel 82–95 of preHeight) that reach zero BEFORE the width cutoff bites — rivers end as a narrowing valley + dry ravine head, never a cliff ring or dam. Micro-meander is gentle (wavelength 150±60, amp 4+3·ef — the old 80±40/±15 sine serrated banks into sawtooth "cutouts"); the 120-block macro-meander does the large-scale wandering. River SAND hugs the channel core (`rf < 0.5 && y < seaLevel + 3 + surfaceNoise*2`, dithered edge), water fill in `fillWaterPass`. Beach sand is WATER-PROXIMITY gated (`oceanFactor`/`riverFactor` via `caches.oceanCache`) — never a bare Y-band (CCR-TERRAIN-011).

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

### Magic System
- **Toggle**: `M` (`KEY_BINDINGS.magic`) flips `magicMode` via shared `toggleMagicMode()` (same F-key/`toggleTorch()` pattern) — re-skins the 9 hotbar slots, empties/restores the first-person held-block viewmodel, live-swaps an open inventory, `stopMining()` to clear any half-mined block (which also ends any active channel — see Channeled spells below). `#mode-badge` (pure CSS via `body.magic-mode`) is the HUD indicator; it now also hosts `#power-pips` (see Power scaling).
- **Spells** (`SPELL_CONFIG`/`SPELL_BY_ID`, mirrors `BLOCK_CONFIG`'s data-driven pattern): `delivery` is `"instant-point"` (Explosion), `"channeled"` (Laser, Freeze — CCR-MAGIC-006 Phase B), or `"projectile"` (Fireball). Explosion (sphere carve, power-capped radius + crater-rim ignition + mob knockback/damage + crater-rim cracked-variant scarring). Fireball (deterministic raycast-first projectile — see Fireball below). `cast`/`castSecondary` dispatch through `castSpell(id, "primary"|"secondary")` for instant/projectile spells; `delivery:"channeled"` spells short-circuit `castSpell` straight to `beginChannel` instead (never read `cast`, which is `null` for Laser/Freeze). All 4 `castSecondary` are still `null` (unspecified — right-click / `#touch-btn-cast2` reserved for future use, no behavior defined; a channeled spell's secondary mechanically arms the channel too, but its own `onChannelStart`/`Tick`/`End` no-op on `channelCastMode === "secondary"`, so it stays inert today). Spam guard: `SPELL_CAST_INTERVAL_MS = 100` (plain const, not a setting) — applies to channel STARTS only, not every tick.
- **True-aim range**: `SPELL_TARGET_RANGE = 96` (CCR-MAGIC-006 A1) is the shared long-range raycast distance for Explosion/Fireball (and the channeled spells' own `params.range`), replacing the old melee-scale `SETTINGS.blockReach`.
- **Power scaling** (CCR-MAGIC-006 A2/A3): global `spellPower` (1-5, default 3) adjusted by the scroll wheel in magic mode (`adjustSpellPower`) or two touch buttons (`#touch-btn-power-down/up`); `#power-pips` (5 squares inside `#mode-badge`) shows the current value. Per-spell `powerScale` tables on `SPELL_CONFIG` entries are read through `spellParam(spell, key)` (falls back to base `params[key]` when no table exists for that key) and `powerFactor(power = spellPower)` (a `[0.5,0.75,1,1.4,1.8]` force/damage/shake multiplier). Explosion is HARD-CAPPED at `EXPLOSION_POWER_CAP = 3` (via a local `eff = Math.min(spellPower, EXPLOSION_POWER_CAP)`) pending a real-hardware carve-cost measurement at radius 6-8 — raising it requires recording that measurement in `CCR-MAGIC-006-spell-polish.md`'s As-built section first; Laser/Fireball/Freeze scale to the full `spellPower = 5`.
- **Channeled spells** (Laser, Freeze — CCR-MAGIC-006 Phase B): press/release delivery via shared `beginChannel(spellId, mode)`/`tickChannel(dt)`/`endChannel()` (state: `channelActive`/`channelSpellId`/`channelDepth`/`channelCastMode`), wired into `castSpell`'s dispatch, the per-frame HOLD-TO-CAST block (arms a channel instead of repeat-casting), `onMouseUp`'s magic-mode branch, `stopMining()`'s last line, and `#touch-btn-cast2` (rewired from tap-only to `wireHoldButton`, since a channeled secondary needs a release). Each spell supplies `onChannelStart`/`onChannelTick`/`onChannelEnd`. **Laser**: one pooled beam mesh (NOT registered in `activeBeams`) + a persistent reused spell light; digs progressively deeper (`nextLaserChannelDepth` — F5 clamps the dig frontier to the current solid-ahead distance every frame; `nextLaserCarveCursor` (build 2026-07-08.4 fix) re-grounds the CARVE CURSOR whenever the clamp shortens the beam — without it, sweeping after a deep dig deadlocked the cursor and the laser never carved again that channel; F17 only carves once a whole new voxel of depth exists) and scars the bore walls (`scarTubeWalls`); the beam is DRAWN from a visual-only muzzle offset (`LASER_MUZZLE_RIGHT`/`LASER_MUZZLE_DOWN`, right of + below the eye, build .4 fix for the beam rendering out of the player's face — aim/pick/carve still use the eye ray); releases via a `collapsingBeams` list (handled inside `updateBeams` alongside the original fade path) that retracts the tail forward over `len/BEAM_COLLAPSE_SPEED` seconds, anchored to the muzzle-based visual beam. **Freeze**: emits a budgeted frost-particle stream every frame but only re-sweeps `convertConeEdit`(WATER→ICE)+fire-douse on a 150ms accumulator (both already skip non-matching blocks, so a repeat sweep is cheap). **Known gap**: opening the inventory mid-channel does NOT end it (only freezes the tick, since `resetTransientInput()` never calls `stopMining`/`endChannel`) — a pre-existing wiring gap surfaced by Phase B review, not yet fixed (see `CCR-MAGIC-006-spell-polish.md` Phase B As-built).
- **Fireball** (CCR-MAGIC-006 C1/C2, replaces the old free-flight gravity arc): `castFireball` raycasts `SPELL_TARGET_RANGE` at cast time and launches a deterministic path-mode projectile (`p.pathMode`/`pathFrom`/`pathTo`/`pathT`/`pathDur`/`arcHeight` fields on the pooled projectile object) guaranteed to arrive at the AIR side of the hit face (F6) via a parabolic arc (`updateProjectiles` branches on `p.pathMode`, skipping gravity/velocity integration); the per-frame solid/mob early-detonation checks still apply. On impact (`onFireballImpact`), a power-scaled `charRadius` sphere (0 at power 1-2) instantly chars burnable blocks to their `BURN_RESULT` (skipping the normal burn-timer/cling delay) and cracks non-burnable ones (see Cracked-variant scarring), THEN `igniteFireballBurst` runs with power-scaled `burstRadius`/`igniteMax`.
- **Terrain edits (Stage 1 only)**: `carveSphereEdit`/`carveTubeEdit`/`convertConeEdit` (+ shared `shouldSkipShapeEdit` skip rule) loop the facade `setBlock` and batch one `updateLocalArea()` per touched chunk. No Stage-2 `bulkEdit` — deferred pending a real in-game carve-cost measurement (magicSystem.md §8.2/§15.5).
- **Cracked-variant scarring** (CCR-MAGIC-006 C3): see [Block Types](#block-types-current-23-blocks) for `CRACKED_STONE`/`CRACKED_DIRT`/`CRACKED_PLANKS` and the `CRACKED_VARIANT` lookup. Wired into the explosion crater rim (`scarExplosionRim`), the laser's channeled bore walls (`scarTubeWalls`), and the fireball impact patch (inside the char-core scan).
- **Projectiles**: `activeProjectiles` pool (`MAX_PROJECTILES = 12`), hooked into `animate()`'s existing gameplay block; separate `MAX_PROJECTILE_LIGHTS = 3` light cap (oldest-eviction) distinct from the 4-cap `activeSpellLights`/`activeBeams` and the real 8-light torch pool (`MAX_POINT_LIGHTS = 8`). Pooled objects also carry the path-mode fields above; `releaseProjectile` resets mesh scale to 1 and `pathMode` to `false` so a reused object never leaks state across spells/casts.
- **ICE** (block 19, see [Block Types](#block-types-current-23-blocks)): meshes through the standard cutout terrain path (LEAVES-style), NOT the `_GLASS` blended mesh; frosted lighting (1/1 attenuation, locked decision). Slippery underfoot: `ICE_DAMPING_BASE = 0.1` overrides the centralized movement-damping scalar in `applyPlayerVelocity()` when grounded (`canJump && !isFlying`) on ICE.
- **Touch**: `#touch-btn-magic` (toggle) + `#touch-btn-cast2` (secondary cast/channel, hold-capable, CSS-gated to `body.magic-mode`) + `#touch-btn-power-down/up` (power dial, same gating); tap = primary cast (`touchPlaceBlock()`), hold = repeated primary casts or an armed channel (`castHeld` flag, consumed per-frame, throttled by the same spam guard). This tap/hold/button mapping is the CCR's own proposed default, not yet play-feel-confirmed on a real device.
- Full design + as-built record (concrete deviations from the original design, what shipped vs. was deferred): `magicSystem.md` §15 (Phases 0-5) + `CCR-MAGIC-006-spell-polish.md`'s per-phase As-built sections (Phases A-C: true-aim range/power scaling, channeled Laser/Freeze, deterministic fireball + cracked variants).

### World Creation System
- **UI**: world name, seed input, biome selector grid, terrain presets, advanced sliders.
- **Presets**: Default, Amplified, Flat, Archipelago, Superflat, Caves.
- **Customization**: tree/cave density, terrain amplitude, sea level, biome size, noise persistence/lacunarity, spawn coords. The knobs work through LIVE getters on `worldConfig`; the active world's params live in `activeWorldGenParams` (applied via `applyGenParams`, persisted as `savePacket.genParams` v3, restored BEFORE generation). In-session loads must `rebuildChunkWorkerPoolForActiveWorld()` (worker bakes config at pool creation). Details: agent-notes §3.
- **Preview**: real-time terrain preview (`WorldPreviewRenderer`) delegating directly to the game's own `blendedHeight()`/`getBiomeParams()` (no separate noise copy to keep in sync). **Management**: rename, duplicate, import/export, storage stats, clear cache.

### Persistence
- **RLE Compression**: chunk data (blocks + light) Run-Length Encoded, v2 format; decompressor handles v1 + v2.
- **Run-length limit**: `ChunkCompressor` stores RLE counts as Uint16 — runs > 65535 are SPLIT into multiple [count, value] pairs (`MAX_RUN_LENGTH`). Critical for 320-high chunks (81920 cells) where uniform spans exceed 65535.
- **Cache versioning**: `_cacheVersion` persisted inside the compressed record (`cacheVersion` field), restored on decompress — so cached lighting isn't needlessly recalculated on load.
- **Dual Caching**: IndexedDB (fast, persistent) + OPFS disk cache (larger capacity via `ChunkDiskStorage` worker).
- **OPFS binary format**: `serializeChunkForDisk()` / `deserializeChunkFromDisk()` — compact little-endian envelope (magic `'VXC2'`, cacheVersion/renderState/genState, seed, 3x RLE arrays). Legacy JSON-envelope files still readable via fallback in `ChunkDataPool.loadFromDisk()`.
- **Batch Ops**: `batchLoadChunksFromCache()`, `batchSaveChunksToCache()` (synchronous compression loop — see agent-notes ledger before "optimizing" its scheduling). **Save Format**: JSON (seed, player pos/rot, inventory, genParams, RLE-compressed modified chunks, thumbnail). **Quick Save/Load**: F5 / F9. **Pre-Generation**: spiral from spawn, async with skip option.

### Settings System
- **Profiles**: Performance, Balanced, Quality + custom save.
- **Categories**: Performance, Graphics (Basic, Lighting, Sky, Water, Water Effects, Volumetric, GI, Materials, Stars, Clouds, Torch Particles, Block Break, Footstep), Gameplay (Movement, Physics, Camera, Interaction), Touch Controls, Zombie Effects, Color Grading, Biome Fog.
- **Touch settings**: `touchControls` (auto/on/off), `touchLookSensitivity`, `touchJoystickSize`, `touchButtonScale`, `touchLeftHanded` — user prefs, deliberately EXCLUDED from `SETTINGS_PROFILES` (profiles only set keys they list, so touch prefs survive profile switches).
- **Search**: settings search bar. **Persistence**: LocalStorage, synced to DOM on load via `updateUIFromSettings()`. **Live Updates**: changes apply immediately via side-effect callbacks (material updates, shader uniform sync, chunk rebuilds).

### Classes

Locate any class by grepping `class <Name>` — line numbers are deliberately omitted (they drift by thousands of lines per month).

| Class | Purpose |
|-------|---------|
| `VoxelWorld` | World management, chunk loading/unloading, block access |
| `ChunkDataPool` | Object pooling for chunk data structures |
| `AudioManager` | Procedural sound synthesis and playback |
| `UIManager` | HUD, hotbar, inventory, menus, toast notifications |
| `Uint8ArrayPool` / `Float32ArrayPool` / `Uint32ArrayPool` / `Vector3Pool` | Typed object pools |
| `ChunkNeighborCache` | Optimized neighbor chunk lookups |
| `PerformanceMonitor` | FPS tracking, frame timing, circular buffer |
| `ParticleSystem` | Particle effects with pooling and custom square shader |
| `SeededRandom` | Deterministic PRNG (hand-copied in the worker template — keep in lockstep) |
| `ChunkWorkerPool` | Web Worker pool for off-thread terrain gen, sunlight, and meshing |
| `GeometryBufferPool` | Tiered GPU buffer pooling (small/medium/large) |
| `MemoryBudgetManager` | Memory monitoring, auto-scaling, emergency unload |
| `WorldPreviewRenderer` | Real-time terrain preview (delegates to the game's own terrain functions) |
| `SunlightTask` | Async sunlight propagation with pressure-based bailout |
| `ChunkDiskStorage` | OPFS disk cache with inline worker backend |

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
| `NUM_TILES` | 37 | Texture atlas tile count |
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
| `BIOME_CELL_SIZE` | 64 | Grid cell size for biome lookup (legacy path) |
| `SWISS_WARP` | 10 (hard bound < 14) | Swiss-turbulence erosion drift (mountain flanks) |

Version-gating constants (`TERRAIN_GEN_VERSION`, `CURRENT_CACHE_VERSION`, `SETTINGS_VERSION`, `VOXEX_BUILD`) are in [Version Constants](#version-constants-bump-discipline).

## Naming Conventions

- `cx, cz`: chunk coords. `lx, ly, lz`: local block coords (0-15 x/z, 0-319 y). `gx, gy, gz`: global block coords.
- `getChunkKey(cx, cz)`: returns string `"cx,cz"`. Banded mesh keys: `'cx,cz#band'` (+`_WATER`, `_GLASS` suffixes) — strip with `chunkBaseOfMeshKey()`. `dt`: delta time (s). `distSq`: squared distance (avoids sqrt).
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
| M | Toggle Magic Mode (see [Magic System](#magic-system)) |
| E | Open/Close Inventory |
| V | Toggle Third-Person Camera |
| +/- | Zoom In/Out (third-person) |
| 1-9 / Scroll | Select Hotbar Slot (block mode); in magic mode, 1-9 still select spells but Scroll instead adjusts spell power (CCR-MAGIC-006 A2) |
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
| M toggle magic mode | `#touch-btn-magic` button |
| Right-click secondary cast (magic mode) | `#touch-btn-cast2` button (CSS-gated to `body.magic-mode`; hold-capable via `wireHoldButton`, CCR-MAGIC-006 F18 — but still a no-op today: all `castSecondary` are `null`, and a channeled spell's secondary start mechanically arms the channel but its own `onChannelStart`/`Tick`/`End` no-op on `channelCastMode === "secondary"`) |
| Scroll spell power (magic mode) | `#touch-btn-power-down`/`#touch-btn-power-up` buttons (CCR-MAGIC-006 A4, same CSS gating) |

Key abstractions: `isGameplayActive()` replaces raw `controls.isLocked` gameplay gates (pointer-lock on desktop OR `virtualGameplayFocus` on touch); `enterGameplay()`/`exitGameplay()` are the single enter/leave transitions (desktop locks/unlocks; touch sets virtual focus + runs shared `onGameplayFocusGained()`/`onGameplayFocusLost()`). Pointer events (`pointerdown/move/up/cancel`) with `setPointerCapture` and per-`pointerId` ownership drive all touch input. **Every touch listener body starts with `if (!touchModeActive) return;`** and the three window-level mouse handlers (`onMouseClick`/`onMouseUp`/`onMouseWheel`) early-return in touch mode to suppress synthesized mouse events.

## Development Guidelines

### When Modifying `voxEx.html`
1. **Single File Rule**: ALL code stays in this ONE file — CSS, HTML, JS.
2. **Texture Atlas**: adding blocks → update `NUM_TILES` in BOTH copies (main + worker template; parity-check P9 enforces equality) + add texture gen in `initTextures`. Current count: **37** (magicSystem.md Phase 0 added 3 spell-icon tiles; Phase 1 added ICE as the 37th).
3. **Block Config**: add to `BLOCK_CONFIG` (auto-derives inventory/textures/transparency). Also update `BLOCK_IS_SOLID`/`BLOCK_IS_OPAQUE`/`IS_TRANSPARENT` + attenuation tables via `initBlockLookupTables()`.
4. **Biome Config**: add to `BIOME_CONFIG` (inherits from `BIOME_DEFAULTS`) + a height function to `HEIGHT_FUNCS`. Remember the worker template's hand-maintained `BIOME_CONFIG` copy (run `parity-check.mjs`).
5. **Settings**: default in `DEFAULTS` → wire into `SETTINGS` → DOM binding in settings UI → `saveSettings()`. Settings must round-trip and have real DOM IDs.
6. **UI Overlay**: elements toggled via `controls.lock`/`unlock` events; keep heavy overlays out of `#blocker` (agent-notes §3).
7. **Light System**: when changing blocks, call `updateSunlightAt()` + `updateBlockLightAt()`. Use `SunlightTask` for async propagation.
8. **Chunk Format**: use `chunk.blocks` / `chunk.skyLight` / `chunk.blockLight` (with backward-compat checks).
9. **Voxel Aesthetic**: BoxGeometry only — no spheres/cylinders/curves.
10. **Worker Parity**: terrain/tree/mesh functions are SINGLE-SOURCE on the main thread; `buildChunkWorkerCode()` injects their `Function.toString()` source between the `/* __TERRAIN_FUNCS_START__ */`, `/* __TREE_FUNCS_START__ */`, and `/* __TERRAIN_PASS_START__ */` marker pairs. Edit ONLY the main-thread sources — the worker copies are generated. Markers MUST stay intact (`parity-check.mjs` verifies). The worker template ALSO hand-maintains copies of `WORLD_DIMS`, `BIOME_CONFIG`, `TREE_CONFIG`, `SeededRandom`, `fadeFast`, `GRAD2D`/`grad`, and the `_nd2`/`_fd2`/`_ed2` scratches — see [Lockstep Registry](#lockstep-registry).

### Common Search Patterns
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`, `const DEFAULTS`, `SETTINGS_PROFILES`, `activeWorldGenParams`, `applyGenParams`
- **Block Types**: `const AIR`, `const GRASS`, `const LEAVES`, `BLOCK_CONFIG`, `BLOCK_IS_SOLID`, `BLOCK_IS_OPAQUE`
- **Biomes**: `BIOME_CONFIG`, `BIOME_DEFAULTS`, `getBiomeParams`, `getBiomeCellDirect`, `HEIGHT_FUNCS`
- **Terrain (new path)**: `terrainSurface`, `computeSurfaceHeight`, `resolveBiome`, `erosionParam`, `noise2Dd`, `SWISS_WARP`
- **Terrain (shared/legacy)**: `blendedHeight`, `continentalHeight`, `mountainsHeightFunc`, `plainsHeightFunc`, `precalculateTerrainCaches`
- **Rivers**: `getRiverFactor`, `getRiverDepth`, `applyRiverCarve`, `computePreRiverHeight`
- **Trees**: `getChunkTreePositions`, `wouldHaveValidTree`, `isTreeSiteViable`, `isTreeSoilSurface`, `generateTreeMaskForChunk`
- **Gen**: `function generateChunkData`, `function calculateChunkSunlight`, `GEN_PASS`, `RENDER_PASS`
- **Render/Meshing**: `function renderChunk`, `renderChunkAsync`, `processChunkQueue`, `WORKER_MESH_PIPELINE_ENABLED`, `chunkUsesBands`, `markChunkBanded`, `meshProfile`, `getMergeKey`
- **Light**: `class SunlightTask`, `updateSunlightAt`, `updateBlockLightAt`, `processSunlightQueue`, `processLightQueue`, `WORKER_LIGHTING_ENABLED`
- **Materials/Glass**: `MAT_PROFILES`, `uShininessStrength`, `glassMaterial`, `glassDepthMaterial`, `setGlassBodyAlpha`, `envReflectionEnabled`
- **Water**: `waterMaterialRefraction`, `waterMaterialStandard`, `waterMaterialFast`, `applyWaterFastMode`, `spawnWaterRipple`, `updateWaterRipples`
- **Particles**: `class ParticleSystem`, `spawnBlockBreak`, `spawnTorchEmber`, `updateFootstepParticles`, `spawnWaterEntrySplash`, `spawnSplashColumn`
- **Stars/Clouds**: `createStarField`, `updateStars`, `createCloudPlane`, `updateClouds`
- **Atmosphere**: `createColorGradingPass`, `updateColorGrading`, `updateBiomeFogTint`, `BIOME_FOG_TINTS`
- **Shaders**: `applyCylindricalFog`, `applyCylindricalFogWater`, `underwaterPass`, `volumetric`
- **Fire**: `chunkFires`, `torchLightPool`, `BURN_TIME`, `BURN_RESULT`
- **Characters**: `buildArticulatedMesh`, `buildZombieMesh`, `buildPlayerMesh`, `buildPlayerBody`, `buildPlayerViewmodelArms`
- **Zombie Textures**: `generateZombieHeadTexture`, `generateZombieBodyMaterial`, `ZOMBIE_CLOTHING_THEMES`, `ZOMBIE_SKIN_COLORS`
- **Player Textures**: `generatePlayerSkinTexture`, `generatePlayerMaterials`, `PLAYER_SKIN_COLORS`, `PLAYER_HAIR_PALETTES`
- **Animation**: `animatePlayerLimbs`, `animateZombieLimbs`, `updateKnockdown`, `KNOCKDOWN_KEYFRAMES`, `POSE_PRESETS`, `springDamper`
- **Camera**: `toggleThirdPerson`, `getThirdPersonCameraDistance`, `updatePoseDebugCamera`
- **Input**: `onKeyUp`, `onMouseClick`, `onMouseWheel`, `INPUT_FORWARD`, `INPUT_SPRINT`
- **Touch/Mobile**: `touchModeActive`, `isGameplayActive`, `enterGameplay`, `exitGameplay`, `recomputeTouchMode`, `initTouchControls`, `computeJoystickVector`, `touchMoveX`/`touchMoveZ`, `resetTouchInput`, `#touch-controls`, `#touch-look-region`, `#touch-joystick`, `applyTouchControlSettings`, `SETTINGS.touchControls`
- **Shared actions** (keyboard+touch single-source): `handleJumpPressed`/`handleJumpReleased`, `handleCrouchPressed`/`handleCrouchReleased`, `toggleTorch`, `selectHotbarSlot`, `cycleHotbar`, `stopMining`, `togglePerfOverlay`, `toggleDebugOverlay`
- **Compression**: `rleEncode`, `rleDecode`, `compressChunkData`, `decompressChunkData`
- **Save/Load**: `saveWorld`, `loadWorld`, `saveChunkToCache`, `loadChunkFromCache`, `preGenerateSpawnChunks`, `rebuildChunkWorkerPoolForActiveWorld`
- **Workers**: `class ChunkWorkerPool`, `class ChunkDiskStorage`, `buildChunkWorkerCode`, `__TERRAIN_FUNCS_START__`
- **Memory/Pools**: `class MemoryBudgetManager`, `class PerformanceMonitor`, `checkGeometryLeaks`, `class ChunkDataPool`, `class GeometryBufferPool`, `class Float32ArrayPool`
- **World Creation**: `class WorldPreviewRenderer`, `populateBiomeSelector`, `applyTerrainSettings`, `customWorldSettings`
- **Day/Night**: `updateDayNight`, `dayNightTime`, `btn-time-` (time buttons), `SETTINGS.dayLength`

## Change Workflow (CCRs)

The project's change-doc convention: **"CCR" = Change Control Request/Report.** Non-trivial changes get a CCR markdown doc (design → audit → implement → reconcile as-built). Active CCRs live in `CCR's/`; completed ones move to `CCR's/Finished/`. Batch coordination patterns (new-symbol registry, shared-region sequencing) are demonstrated in `CCR's/_CROSS_CCR_NOTES.md` + `_IMPLEMENTATION_RUNBOOK.md`.

**Per-change loop** (from the runbook — applies to ANY change, not just CCR batches):

1. **Read** the whole CCR / understand the full change before editing.
2. **Locate by grep anchor**, never by line number. Confirm the live code matches what the change doc expects (its "Before" snippet, if present). If it doesn't match, STOP and reconcile — don't force the edit.
3. **Apply the change.** Honor any AUDIT FLAG/NOTE callouts in the CCR — they override contradicting intuition.
4. **Worker parity**: if the edited function is injected, edit only the main-thread source and keep markers intact; if it touches a hand-maintained copy, update BOTH sides.
5. **Verify, cheapest first**: `node tools/syntax-check.mjs` → `node tools/parity-check.mjs` → `node tools/terrain-node-checks.mjs` (terrain changes, ≥3 seeds) → `node tools/run-browser-tests.mjs` (authoritative suite, headless) → in-game eyeball for visuals.
6. **Bump `VOXEX_BUILD`** + add a `VOXEX_RECENT_CHANGES` entry citing the CCR ID. Bump `TERRAIN_GEN_VERSION`/`CURRENT_CACHE_VERSION`/`SETTINGS_VERSION` per [Version Constants](#version-constants-bump-discipline).
7. **Update docs in the same commit**: the affected CLAUDE.md section, `docs/agent-notes.md` if a lesson/decision changed, and the CCR's as-built section.
8. **Prototype-first for terrain**: features get probed in Node with measured numbers BEFORE touching voxEx.html (see agent-notes §4). Failed prototypes go in the do-not-retry ledger.
9. **Commit hygiene**: stage ONLY files you touched; never `git add -A`/`git add .`. Move finished CCRs to `CCR's/Finished/`.

## Lockstep Registry

Things that exist in MORE THAN ONE hand-maintained copy, or as mirrored logic that must change in tandem. `tools/parity-check.mjs` mechanically verifies the top group; the bottom group is logic-mirroring that only review catches.

**Byte-level copies (parity-check enforced):**

| What | Copies | Rule |
|---|---|---|
| `GRAD2D` + `grad()` | main thread + worker template | byte-identical (worker `blendedHeight` byte-parity depends on it) |
| `fadeFast` | main (arrow) + worker template (function) | identical formula |
| `_nd2`/`_fd2`/`_ed2` scratches | main + worker template | identical literals |
| `WORLD_DIMS` (incl. `yOffset`!) | main + worker template | identical values (a yOffset drift of 64 once silently killed ALL worker tree generation) |
| `BIOME_CONFIG` | main + worker template | biome sets + numeric fields identical |
| `TREE_CONFIG` | main + worker template | identical values |
| Injection markers (×6) | `__TERRAIN_FUNCS__`, `__TREE_FUNCS__`, `__TERRAIN_PASS__` pairs | exactly one standalone occurrence each |
| `NUM_TILES` | main + worker template | equal integer value (atlas strip width; drift = mis-sliced worker UVs) |

**Mirrored logic (review-enforced — comments exist at both sites):**

| What | Mirrors | Breaks if drifted |
|---|---|---|
| `isTreeSoilSurface` | `generateTerrainPass`'s flat-ground material cascade (elevation bands, patch/detail noise, sand/lake gates, band-shift floor, dithered beach bound, ocean arm) | trees planted on stone/sand/gravel |
| `wouldHaveValidTree` | the FULL accept chain in `getChunkTreePositions` | phantom suppression (missing trees) |
| `SeededRandom` | class hand-copied in worker template | terrain/tree determinism |
| `precalculateTerrainCaches` | hand-copied in worker (NOT injected) | worker terrain divergence — change both or inject it first |
| New flat-ground material outcomes (e.g. talus aprons) | must be added to `isTreeSoilSurface` too | trees on non-soil |

## JavaScript Code Quality Rules

**JSDoc**: typedef blocks live near the top of the script (grep `@typedef` — core: `BlockId`, `TileIndex`, `ChunkCoord`, `LocalCoord`, `GlobalCoord`, `ChunkKey`, `HexColor`, `LightLevel`, `AOValue`, `Position3D`, `AABB`, `BlockHit`, `BlockInteractionResult`, `ChunkData`, `BlockConfigEntry`; tree/biome: `NoiseConfig`, `WorldConfig`, `TrunkConfig`, `CanopyConfig`, `CanopyShape`, `TreeConfig`, `BiomeTreeConfig`, `BiomeConfigEntry`, `ResolvedBiome`). All public functions need JSDoc: start with `/**`, lowercase primitives (`number`/`string`/`boolean`), `@param {type} name - desc.`, `@returns` for non-void, `@throws` where applicable, optional as `[name=default]`.

**Conventions** (one-liners):
- Strict equality always (`===`/`!==`) — `==` causes coercion bugs (`"" == 0` is true).
- Typed arrays for numeric data; never `[]`/`new Array(n)` (sparse + GC pressure).
- `??` for defaults (not `||`, which fails on `0`/`""`). Optional chaining: `chunk?.blockLight?.[i] ?? 0`.
- `for` loops in hot paths (render, meshing); array methods (`.map`/`.filter`) only in run-once setup.
- Guard clauses at function start for validation; try-catch only at boundaries (save/load, IndexedDB) — not internal pure functions.
- `var` is banned (use `const`/`let`); named functions in hot paths (profiler names); no allocations/closures in `renderChunk` (30K+ closures per mesh — hoist to module scope); no `delete` on arrays (use `splice`); template literals over string concat in loops.

**Debug console globals**: `window._faceCountHistogram`, `window.printFaceHistogram()`, `window.geometryPool.getStats()`, `window.memoryBudgetManager.getStatus()`, `meshProfile()` / `meshProfile.reset()`, `setBandedMeshing(t/f)`, `setEagerBanding(t/f)`, `setLightRefill(t/f)`. Logging plumbing (CCR-DEBUG-001): `setDebugChannels('mesh,lighting'|'*'|null)` (per-channel console filter, persists in localStorage, independent of the ~ overlay), `dumpLogs(filter?, limit?)` (500-entry always-recording ring buffer — captures logDebug/logWarn/logError even with all gates off; prints compact JSON), `diagSnapshot()` (one-call state dump: build/seed/pos/counts/memory + recent warn/error entries; TDZ-safe at any boot stage). Profile with `console.time('[Tag] …')` / `console.timeEnd(...)`.

## Claude Code Guidelines

**Refactoring scope**: refactor for correctness/readability/performance; keep diffs focused (no unrelated renames or style-only churn); never break the single-file rule.

**Bug prevention**: before declaring any new `const`/`let`/function, search the file for the name — don't redeclare in the same scope or shadow globals (`scene`, `camera`, `SETTINGS`, `WORLD_CONFIG`, `chunks`). Settings must round-trip via save/load and have real DOM IDs. Keep per-frame code to ≤2 nested loops; batch/cache/limit-to-nearby for expensive work. Terrain changes need worker parity (`buildChunkWorkerCode()` injection); `WorldPreviewRenderer` delegates directly to the same functions, so it needs no separate parity check.

**Logging**: prefer `logDebug(...)` over `console.log(...)` (chunk cache, pre-gen, streaming/eviction, new systems). Keep logs sparse (no per-frame/per-block spam) and tagged (`[PreGen]`, `[Chunks]`, `[Lighting]`, `[ZombieFX]`, `[Settings]`) — the leading `[Tag]` IS the filter channel for `setDebugChannels` (CCR-DEBUG-001), so ALWAYS tag new logs (untagged → 'misc'). `logWarn` is always-on (5s-throttled, not gated by `isDebug`) — never put per-frame chatter in it. Every logDebug/logWarn/logError call is ring-recorded for `dumpLogs()` regardless of gates. `#debug-overlay` shows concise high-value info only (FPS, position, chunk/mesh/face counts, seed, biome).

**Change reporting** — when proposing changes, format as: **Summary** (2-5 bullets), **Changes** (grouped by subsystem), **Rationale** (why: bug fix / perf / clarity), **Safety Checks** (confirm: no duplicate/shadowed identifiers, DOM IDs + settings wired, no heavy per-frame loops added).

**Commit hygiene** — stage ONLY the files your change actually touched — never `git add -A`/`git add .`. Confirm the set with `git diff --stat` and eyeball each file's real changes before staging. (`.gitattributes` now normalizes line endings, so whole-file EOL churn should no longer appear; if it does on an old checkout, isolate real edits with `git diff --ignore-all-space <file>`.) Sandboxed agents: read `docs/agent-notes.md` §7 before ANY git write — the mount can corrupt the index and serve truncated file content to git.

## Quick Reference Checklist

Before committing, verify:

- [ ] `node tools/syntax-check.mjs` GREEN (all script blocks parse; no truncation)
- [ ] `node tools/parity-check.mjs` GREEN (lockstep copies + injection markers)
- [ ] Terrain changed? `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds + `TERRAIN_GEN_VERSION` bumped
- [ ] `node tools/run-browser-tests.mjs` GREEN (the 315+ browser suite, headless) — or run `tools/voxex-tests.html` over localhost manually
- [ ] `VOXEX_BUILD` bumped + `VOXEX_RECENT_CHANGES` entry added (cite CCR ID)
- [ ] No duplicate `const`/`let`/`function` declarations (search file first)
- [ ] No shadowing of globals: `scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`
- [ ] All new functions have JSDoc with `@param` and `@returns`
- [ ] Hot paths use `for` loops, not `.map()`/`.filter()`/`.forEach()`; typed arrays for numeric data
- [ ] Strict equality (`===`, `!==`) everywhere
- [ ] New settings have defaults in `DEFAULTS` and round-trip correctly; new DOM IDs exist in HTML and match JS
- [ ] Logs use `logDebug()` with `[Tag]` prefix, not `console.log()`
- [ ] No work added to the per-frame render loop without batching
- [ ] Touch handlers start with `if (!touchModeActive) return;`; no allocations/closures/logging in `pointermove`; gameplay gates use `isGameplayActive()` not raw `controls.isLocked`
- [ ] Adding blocks? `NUM_TILES` updated + lookup tables via `initBlockLookupTables()`
- [ ] Worker parity: edited ONLY main-thread sources of injected functions; markers intact; hand-maintained copies updated BOTH sides (see [Lockstep Registry](#lockstep-registry))
- [ ] Mirrored logic in lockstep: `isTreeSoilSurface` ↔ material cascade; `wouldHaveValidTree` ↔ `getChunkTreePositions`
- [ ] CLAUDE.md / agent-notes / the CCR's as-built section updated for anything this change made stale

## Testing Tools

- **`tools/syntax-check.mjs`** — extracts every `<script>` block from voxEx.html and `node --check`s it (module semantics for the main script). Catches truncation, unbalanced braces, and same-scope duplicate declarations in seconds, with errors mapped back to real voxEx.html line numbers. `node tools/syntax-check.mjs`.
- **`tools/parity-check.mjs`** — mechanical lockstep checker: hand-maintained main↔worker copies (GRAD2D, grad, fadeFast, scratches, WORLD_DIMS, BIOME_CONFIG, TREE_CONFIG, NUM_TILES) + injection-marker integrity. Seconds to run; no browser. Run after ANY terrain/worker/config change: `node tools/parity-check.mjs`.
- **`tools/run-browser-tests.mjs`** — runs the FULL browser suite headlessly: serves the repo on localhost, drives headless Chrome/Edge/Chromium over the DevTools protocol (zero npm dependencies, Node 22+), clicks Run All Tests, reports failures with suite names. `node tools/run-browser-tests.mjs [--chrome=path] [--timeout=300]`. Exit 0 = all green. This makes the release gate agent-runnable; the interactive page remains for humans.
- **`tools/terrain-node-checks.mjs`** — headless terrain invariants, no browser needed: `node tools/terrain-node-checks.mjs [voxEx.html] [seed]`. Extracts the REAL terrain/river/soil functions from voxEx.html by name (no hand-copied replicas) and checks determinism, bounds, adjacent-column continuity (<30), notch metric, river flood integrity (channel cores must flood), valley-floor pan signature, and the tree-soil elevation gradient. Fast smoke test for terrain changes; the browser suite remains authoritative for workers/meshing/lighting/persistence. Uses its own perm PRNG — internally consistent, not byte-identical to in-game seeds.
- **`tools/terrain-probe.mjs`** — the measure-before-you-touch instrument: `height <gx> <gz>` (point query: heights, riverFactor, biome, tree-soil), `transect x0 z0 x1 z1` (ascii profile + max adjacent step), `stats [cx cz size]` (per-axis anisotropy Z/X, mountain coverage, worst step), `hillshade cx cz size [out.png]` (shaded-relief PNG render — spot striping/rings/sawtooth banks visually). Run probes BEFORE tuning terrain constants and AFTER to prove the effect; renders are attachable evidence. Shares `tools/lib/extract-terrain.mjs` with terrain-node-checks (single-source extraction).
- **`tools/voxex-tests.html`** — the authoritative automated suite (315+ tests and growing; trust the suite's own counter). Tests REAL `voxEx.html` code via a `?test=1` seam exposing `window.VoxEx` (inert without the flag). Loads the game in a hidden iframe; must be served over localhost (Workers + IndexedDB). Covers bootstrap, terrain (determinism/finite/ocean-river/trees), lighting, compression, meshing (incl. worker MESH byte-parity), block-table invariants, VoxelWorld/collision/raycast, live chunk-worker round-trip + `blendedHeight` parity, persistence codec (`ChunkCompressor` RLE run-splitting + binary OPFS round-trip), and IndexedDB persistence round-trip.
- **`tools/terrain-visualizer.html`** — terrain debugger. Shaded relief top-down + cross-section; click to inspect height, biome, surface block, slope, noise, elevation zone. Delegates to voxEx.html via the `?test=1` seam (requires localhost); no hand-synced terrain code remains. Surface-block material classification is a local, documented approximation (the real per-column material cascade lives inline in `generateTerrainPass`, not on the seam).
- **`tools/voxex-texture-tests.html`** — visual texture tests. Renders its own hand-maintained local tile set (independently numbered from the real `NUM_TILES` — see the file's own header comment; do not assume the two counts match); automated opacity/transparency/color-sanity/atlas-dimension checks.
- **CI**: `.github/workflows/checks.yml` runs `syntax-check.mjs` + `parity-check.mjs` + `terrain-node-checks.mjs` (3 seeds) + the FULL browser suite via `run-browser-tests.mjs` (GitHub runners ship Chrome) on every push/PR. In-game visual checks remain manual.

## Documentation Index

Status legend: **LIVE** = current truth, keep updated · **SHIPPED** = implemented, kept for rationale · **HISTORICAL** = superseded, do not implement from.

| Doc | Status |
|---|---|
| `CLAUDE.md`, `docs/agent-notes.md` | LIVE — update in the same commit as the change that stales them |
| `CCR's/*.md` | LIVE (active changes); `CCR's/Finished/` = SHIPPED |
| `mountain-overhaul-plan.md` | LIVE roadmap — Phase 1 SHIPPED (build .92); Phases 2-5 gated, not built |
| `terrain-gen-audit.md`, `terrain-gen-fixes.md` | SHIPPED (2026-07-02 audit + its 5-phase fix plan, implemented) |
| `terrain-detail-plan.md`, `terrain-architecture-plan.md`, `terrain-climate-fields-plan.md`, `terrain-implementation-guide.md` | SHIPPED — produced the `terrainSurface` rewrite |
| `terrain-improvement-deep-dive.md`, `terrain-improvement-opportunities.md` | HISTORICAL (exploration that led to the plans above) |
| `FireImplementation.md`, `SETTINGS_MENU_CCR.md`, `CHUNK-IMPLEMENTATION-PLAN.md`, `CCR-*.md` (repo root) | SHIPPED as-built records |
| `mobileControlsPlan.md` | SHIPPED (touch controls live) |
| `ui-mockups.html` + `CCR's/CCR-ui-overhaul.md` | LIVE — approved directions, not yet wired into voxEx.html |
| `futureFeatures.md` | LIVE roadmap / design intent |
| `magicSystem.md` | SHIPPED on `main` — all 5 phases (M toggle, 4 spells, ICE block, touch casting); §15 is the as-built record with concrete deviations from the original design |
| `CCR's/CCR-MAGIC-006-spell-polish.md` | Phases A-C SHIPPED on `main` (true-aim range/power scaling, channeled Laser/Freeze, deterministic fireball + instant char + generic cracked variants); Phases D-E not yet built. Move to `CCR's/Finished/` once D/E land or are formally dropped |
| `VoxEx_Bug_Consolidation_Tracker.md` + `VoxEx_Issue_*.md` | LIVE tracker + SHIPPED cleanup reports |
| `keyframe-audit.md`, `lightRefill-investigation.md`, `zombie-ai-investigation.md`, `tree-generation-bug-report.md` | HISTORICAL investigations |
| `docs/superpowers/` | HISTORICAL (pre-terrainSurface era — do not implement from) |

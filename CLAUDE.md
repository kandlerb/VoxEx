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
│   ├── terrain-parameter-editor.html  # Gen-params editor (delegates via ?test=1; edits the
│   │                             #   REAL GEN_PARAM_SCHEMA params; exports genParams JSON;
│   │                             #   caves preview removed — CCR-WORLDGEN-UI-001)
│   ├── voxelEditor.html / KeyFrame_editor.html
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
- **Lighting Engine**: LightTask (async, pressure-based bailout, shared by both sky and block channels since CCR-LIGHT-004 Phase 3A; worker sunlight via `WORKER_LIGHTING_ENABLED`); torch block light (level 14, 6-direction); deferred lighting for distant chunks; edge lighting reconciliation; watchdog (300ms grace); volumetric cone sampling (7-ray sun, 5-ray point). **Full-recalc edge re-import (CCR-LIGHT-005)**: every full-recalc orchestration path — `LightTask.bailoutToFullRecalc` (via `recalculateAffectedChunks`), `rebuildTorchLightingForActiveChunks`, `rebuildSkylightForActiveChunks` — now calls the shared `reimportNeighborLight(chunk, cx, cz)` helper (mirrors what `recalculateEdgeLighting` already does for the streaming path) AFTER recalculating every chunk in its target set, so a chunk-local recalc never strands a dark border seam; each touched chunk is also re-queued into `edgeLightingUpdateQueue` for background convergence across more than one border.
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
- **Cracked-variant mechanism** (CCR-MAGIC-006 C3, texture rewritten in CCR-MAGIC-007 B1): one reusable `drawCrackOverlay(logicalOffset, seed)` texture stamp (authored in `initTextures`, near the glass/ice tile generators) applied over a copy of each base tile's own generator output — not three independently-authored textures. The stamp is an "epicenter web": 1-2 impact points radiating 4-6 forking arms, core pixels tinted soft dark-grey via `ctx.globalAlpha` (never pure black, so the base material's own character shows through) with a low-alpha grey halo on the 4-neighborhood for a "shadowing" look — replacing the original random-walk near-black polyline. `CRACKED_VARIANT` (`Uint8Array(256)`, built in the same `BLOCK_CONFIG` compile loop that reads `burnsTo`/`burnTime`) maps a base block ID to its cracked variant via each variant's `crackedFrom` field; variants never declare `crackedFrom` pointing at themselves or each other, so a cracked block never re-cracks. Scarred generically at three sites — the explosion crater rim (`scarExplosionRim`, a shell scan from the carve radius to radius+1), the laser's channeled bore walls (`scarTubeWalls`, walks the same DDA path as `carveTubeEdit` sampling the shell just outside the bore radius), and the fireball impact patch (inside `onFireballImpact`'s char-core scan, for scanned blocks that aren't burnable) — each site: `const cv = CRACKED_VARIANT[id]; if (cv && Math.random() < 0.6) setBlock(x, y, z, cv);`, dithered so it reads as fracture, not paint.
- **Water light**: attenuates sunlight 1/block, blocklight 2/block. Changing attenuation semantics = bump `CURRENT_CACHE_VERSION` (see [Version Constants](#version-constants-bump-discipline)).
- **Lookup Tables**: `BLOCK_IS_SOLID[256]`, `BLOCK_IS_OPAQUE[256]`, `IS_TRANSPARENT[256]`, `SUNLIGHT_ATTENUATION[256]`, `BLOCKLIGHT_ATTENUATION[256]` — Uint8Array fast lookups.

## Biome System (9 Biomes + legacy Foothills)

Nine ACTIVE biomes on the default biome-driven path since CCR-WORLDGEN-PIPELINE-002 Bump A (build 2026-07-13.1): the original six plus desert/tundra/snowy_peaks (activated by their `BIOME_ID_ORDER` entries; centroids in `GEN_TUNABLES.BIOME_CENTROIDS`). The `Weight` column and per-biome height fields are LEGACY-PATH data only.

| Biome | Weight (legacy) | Characteristics |
|-------|--------|-----------------|
| **Plains** | 2 | Flat, sparse oak trees, spherical canopies; style bias: calmer/flatter (ridgeMix −0.10, roughness −0.02) |
| **Hills** | 2 | Rolling hills, moderate trees; style bias: +ridgeMix 0.10, +warp 6 (billowy/rolling) |
| **Forests** | 2 | Dense oak trees, moderate terrain; style bias: +roughness/+warp 10, soilDepth +1 |
| **Mountains** | 0.5 (unused — mask-placed) | High peaks, ridged noise, conical pines, treeline, snow; style biases all zero (shape emergent from R) |
| **Swamp** | 1 | Low wet flats (style baseBias −1.0, soilDepth +1), water pools, droopy trees; shores are MUDDY GRASS, never beach sand (WS6 swamp-shore rule: the beach gate's ocean arm skips swamp-labeled columns) |
| **Longwoods** | 2 | Giant 2x2/3x3 trunk trees, heights 12-24, wide sparse canopies; style: +warp 12 |
| **Desert** (WS5) | 0 (excluded from legacy CDF) | Hot+dry centroid {t:0.9,h:0.05,c:0.55,r:0.20}; biome-gated dry SAND (dithered GRAVEL flecks), treeless v1, EXEMPT from the M10 sand-water gate; NOT tree soil |
| **Tundra** (WS5) | 0 | Cold lowland centroid {t:−0.9,h:0.20,c:0.55,r:0.30}; biome-gated SNOW surface at ANY elevation (own dither; the CCR-TERRAIN-010 bandShift floor is untouched), treeless v1; NOT tree soil |
| **Snowy Peaks** (WS5) | 0 | Cold+high centroid {t:−0.7,h:0.35,c:0.60,r:0.72 — tuned from the CCR's pre-slot r:0.90 which starved it to ~1.3% land share}; NO material branch (the elevation+temperature alpine ladder dresses it); sparse conical pines (density 0.005) |
| **Mountain Foothills** | auto | Transition zone (single 64-block cell ring, constant ringFactor 0.75, mountain-derived noise) — LEGACY-PATH ONLY (see below); unreachable on the default biome-driven path |

Biomes configured in `BIOME_CONFIG`; missing fields inherit from `BIOME_DEFAULTS`. Tags: `"mountain"` (treeline + alpine terrain), `"forested"` (high tree density), `"giant_trees"` (multi-block trunks). **The `Weight` column and the CDF-based weighted-roll selection it drives apply ONLY to the OLDEST legacy `useNewTerrain:false` bilinear-cell path** (`_BIOME_CDF_TABLE`/`rebuildBiomeTable`) — the default biome-driven classifier below selects by softmax distance to a centroid table, not weight.

**Terrain Generation Pipeline**: **`WORLD_CONFIG.useNewTerrain: true` (the default) routes ALL height queries through the climate+spline surface — `terrainSurface`/`computeSurfaceHeight`/`resolveBiome` (temperature/humidity/continentalness/erosion/peaks-valleys fields + splines, swiss-turbulence erosion, crest-following peak boost, centered fractal with `HF_PIVOT`/`VALLEY_RATIO`).** The bilinear biome-cell system below is the OLDEST-LEGACY A/B path, reachable only by setting `useNewTerrain` false. Legacy path: continental height + domain warping → weighted cell-based biome selection → per-biome height functions. Shared by ALL paths: river/ocean carving → structure placement. Biome boundaries use two-octave domain warping for organic edges.

**Biome-driven shape (CCR-WORLDGEN-PIPELINE-001, shipped default at build `2026-07-12.4`, `TERRAIN_GEN_VERSION` 33):** WITHIN the `useNewTerrain:true` climate+spline path, a second flag — `WORLD_CONFIG.biomeDrivenTerrain: true` (the new default) — makes the biome LABEL and the terrain SHAPE agree by construction instead of being computed independently. `classifyBiome(gx, gz)` runs a softmax over four climate axes — T (temperature), H (humidity), Cn (continentalness, 0..1 remap), R (relief = `reliefParam()` = `spline(SPLINE_RELIEF, erosionField)`, NOT `SPLINE_EROSION`) — against `GEN_TUNABLES.BIOME_CENTROIDS` (6 rows, iterated via `BIOME_ID_ORDER`), weighted by `AXIS_W = {t:1, h:1, c:0.6, r:18}` (r dominates DELIBERATELY — see agent-notes §5) and temperature `BIOME_SOFTMAX_TAU = 0.15`; the label is `argmax` of the softmax weights (== nearest centroid; no `d/weight` divisor, unlike the legacy classifier below). `terrainSurface` sources its relief scalar from the SAME `reliefParam()` call the classifier uses, so label and shape share one number; IF `BIOME_STYLE_ACTIVE` (any `GEN_TUNABLES.BIOME_STYLE` bias non-zero — all-zero by default, pending a future tuning pass) the same softmax weights ALSO blend per-biome `ridgeMixBias`/`roughnessBias`/`warpBias`/`baseBias` into `terrainSurface`'s knobs via `styleBlend()`; height AMPLITUDE/LIFT stay pure functions of R/C so a blend can never mute a mountain. `resolveBiome`/`getBiomeParams` reroute to `classifyBiome` when the flag is ON (`forceSingleBiome` still short-circuits first — forces the LABEL, not yet the shape, see the CCR's Q6 follow-up; `outClimate.t` is preserved for callers that read it). The material cascade's old `isMountain || worldTopY >= ALPINE_LINE` mismatch-amplifier OR-branch is disabled flag-ON (pure elevation drives alpine dressing; mirrored in `isTreeSoilSurface`). Label/shape agreement is measured by `tools/biome-pipeline-checks.mjs` metric M3 (real extracted functions) at ≥95% (locked constants measure ~97% on 3 seeds). Setting `biomeDrivenTerrain: false` reverts to the PRIOR decoupled behavior on the SAME climate+spline surface: height comes from C/erosion only, `resolveBiome` nearest-centroids over the separate legacy `BIOME_PARAMS` table (5 axes t/h/c/e/pv, `d /= weight` divisor), and the label is cosmetic (never affects height) — this is the escape hatch for byte-for-byte pre-CCR terrain, independent of (and nested inside) `useNewTerrain`. **Foothills is unreachable on BOTH `useNewTerrain:true` sub-paths** (biome-driven and decoupled — neither centroid/param table has a `mountain_foothills` row); it survives only in the oldest-legacy `useNewTerrain:false` bilinear-cell system below. Retiring foothills/the legacy A/B path entirely was reserved as an owner decision and DEFERRED to a future cleanup CCR (Phase 5 team-lead ruling) — do not remove it unilaterally. **`TERRAIN_GEN_VERSION` is now 38** (CCR-WORLDGEN-PIPELINE-002: Bump A, build `2026-07-13.1`, activated the 3 new biomes/`BIOME_STYLE` bias table/doubled climate-region frequencies documented above at 33→34; Bump B, build `2026-07-13.2`, 34→35 flipped `hydroRivers` to its hydrological default; WS6-P3, build `2026-07-13.3`, 35→36 fixed an owner-reported defect where hydro rivers rendered ruler-straight with 45/90-degree bends and circuit-board bundles of parallel channels below mountains; WS6-P4, build `2026-07-13.4`, 36→37 fixed a follow-up owner defect where rivers still ran near-straight through PLAINS/flat lowlands (an elevation-gated macro-meander octave layered on WS6-P3's fine meander) and widened the channel half-width (6→9 blk, now a tunable); WS6-P5, build `2026-07-13.5`, 37→38 fixed a third owner defect report ("too many arms, all too straight, not erosion-based") via Chaikin corner-cutting, terrain-following valley-snap, and a spring-density gate — see [River System](#river-system) and the CCR's own As-built for the full workstream-by-workstream record; WS7, legacy A/B path excision, remains open pending OD4's soak period).

**Mountain-Foothills Transition** (oldest-legacy path — inert under the default `useNewTerrain: true`, regardless of `biomeDrivenTerrain`):
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
- **Pass System**: `GEN_PASS` (TERRAIN=1, WATER=2, DECORATIONS=4, SUNLIGHT=8, BLOCKLIGHT=16, NEIGHBOR_UPDATE=32, TREE_NEIGHBOR_UPDATE=64; `FEATURES=128` added CCR-WORLDGEN-PIPELINE-001 Phase 1 — RESERVED/no-op, no producer or consumer yet (`featureAt()` always returns none, `featureCache` stays all-zero), deliberately excluded from `ALL` which stays `127`); `RENDER_PASS` (INITIAL_MESH=1, EDGE_LIGHTING=2, NEIGHBOR_LIGHTING=4, FULL_QUALITY=8).

### Lighting System
- **Light Levels**: 1-15 (1 = min visibility, 15 = full sunlight).
- **Unified propagation kernel** (CCR-LIGHT-004, Phases 0-4 SHIPPED -- buildable scope COMPLETE at build `2026-07-10.6`): `propagateLightBFS(queue, qStart, ctx)` is the SINGLE SOURCE for the propagation rule (entering a cell costs 1 travel + `ctx.attenTable[enteredBlockId]`, floored at `ctx.floor` — 1 sky / 0 block) — grep `UNIFIED LIGHT-PROPAGATION KERNEL`. `calculateChunkSunlight`'s phase-2 BFS, `calculateBlockLight`'s BFS, `propagateEdgeLighting` (cross-chunk border transfer), and `propagateLightFromEdgesInward` (post-import interior spread, BOTH channels since Phase 2) all route through it via the `_chunkLocalLightCtx(blocks, light, attenTable, floor, height)` helper. Phase 3A moved block light into the same budgeted `LightTask` queue as sunlight (mechanical, values byte-identical). **Phase 3B** (`CURRENT_CACHE_VERSION` 7→8): fixed the last drift — `stepLightTask`'s incremental ADD branches (both channels) previously charged only the -1 travel cost and skipped the entered cell's attenuation; they now call the shared `lightRuleEnter(traveled, attenuation, floor)` helper (a pure extraction of the kernel's own entered-cell-cost expression, also injected into the worker), same as `propagateLightBFS`. `LightTask` gained `this.attenTable` (`SUNLIGHT_ATTENUATION`/`BLOCKLIGHT_ATTENUATION` by channel) to support it. Existing worlds relight once on load (baked light near water/leaves/ICE was previously too bright via incremental edits). **Phase 4** (shared seeding, no cache bump): `calculateBlockLight`'s full-recalc seed loop now reads `BLOCK_LIGHT_EMISSION` directly (mirroring `getBlockEmission()`) instead of a TORCH/FIRE hardcode -- a future emissive block no longer goes dark on a full recalc after lighting correctly on placement -- and `VoxelWorld.setBlock`'s three `blockLight` init sites zero-fill instead of `.fill(1)`, matching every other producer (0 = no torch light). This completes CCR-LIGHT-004's buildable scope; remaining items are in-game gates plus deferred follow-ups (CCR-LIGHT-005, a measurement-gated heightmap CCR, watchdog demotion per D5) -- see the CCR's As-built section.
- **LightTask**: async propagation for BOTH the sky and block channels (renamed from `SunlightTask`, CCR-LIGHT-004 Phase 3A — same budgeted queue/pressure machinery for both since that phase), throttle at 80% hard cap, bailout to full recalc at 100%; the player's-own-chunk critical-lane exemption is capped at `CRITICAL_LIGHT_JOBS_PER_FRAME` (D6) so a big edit at the player's feet can't process an unbounded number of queued jobs in one frame. Fresh-terrain sunlight can compute in the worker (`WORKER_LIGHTING_ENABLED`); `calculateBlockLight`'s full-recalc BFS is main-only (fresh terrain has no torches).
- **Block Light**: torch sources propagate at level 14, 6-direction spread. FIRE bakes zero block light (dynamic `torchLightPool` glow instead) so `setBlock` stays on the light-neutral fast path.
- **Deferred Lighting**: distant chunks (>16 blocks) use a simplified height-based model.
- **Edge Lighting**: cross-chunk boundary reconciliation, max 3 passes/chunk, now attenuation-correct on the border transfer and both-channel on the inward spread (CCR-LIGHT-004 Phase 2, `CURRENT_CACHE_VERSION` 7 — baked border light values changed, old saves relight once on load). **Watchdog** force-clears stuck pending light (300ms grace). The old `chunksNeedingLightingUpdate` neighbor-readiness queue was removed as vestigial in the same phase.
- **Semi-Transparent**: leaves reduce light by 1 instead of fully blocking.
- **Smooth Lighting**: `SETTINGS.smoothLighting` — per-corner sampling (`calculateFaceCornerLight`, same offset table as AO). Light left the merge key in CCR Phase 3A; the wet-shoreline damp level stays in the key (layout `(blockId<<10)|(damp<<8)|AO`) so the shoreline stays crisp/blocky (user preference).
- **Normals**: chunk/water geometries carry NO normal attribute — chunk materials use `flatShading: true` (normals derived in-shader via dFdx/dFdy).
- **Minimum Light**: skylight never < 1; blocklight valid 0-15 (0 = no torch). At mesh time `extractLightFromChunk()` floors combined light at **3** (20% base brightness) so deep caves stay faintly visible.
- **Formula**: `vertexColor = AO x (lightLevel / 15.0)`. **Volumetric Sampling**: 7-ray cone (sun/moon), 5-ray cone (point lights) for partial visibility through foliage.

### Rendering System
- **Textures**: procedural 16x16 pixel art on canvas (Atlas: 40 tiles).
- **Terrain Material**: MeshStandardMaterial, vertex colors, alpha test 0.1, per-texel `roughnessMap` authored from `MAT_PROFILES` (matte base + color-keyed shiny accents; accents need roughness ≲110 to glint). Live control: `uShininessStrength` uniform driven by the repurposed `SETTINGS.specularIntensity` ("Shininess Strength"); `specularEnabled` off = fully matte AND kills env reflections.
- **Glass**: separate translucent per-chunk mesh (`<cKey>_GLASS`), non-greedy 1×1 quads emitted at end of `renderChunk`; body opacity baked into texture alpha (`setGlassBodyAlpha()`); glint punch-through via `uGlintReflect`; cutout shadows via `glassDepthMaterial` (see agent-notes §2 for the three.js alphaTest gotcha). Workers route `hasGlass` chunks to main. Screen-space glass refraction was tried and RETIRED — do not retry (agent-notes ledger).
- **Env Reflections**: analytic sky reflection on shiny terrain texels (`envReflectionEnabled`, default off, not in profiles) — same approach as water, deliberately not PMREM.
- **Water**: three modes — Standard (PBR), Fast (Lambert), Refraction (custom GLSL, Beer-Lambert absorption). Refraction RT scale: `refractionScale` setting (compounds with pixelRatio).
- **Fog**: custom cylindrical shader (XZ-only distance, not vertical) via `onBeforeCompile`. **Biome Fog Tinting**: per-biome fog color lerp (plains=neutral, forests=green, mountains=blue, swamp=murky).
- **Volumetric**: god rays, multi-point-light (≤4 volumetric point lights). **Post-Processing**: EffectComposer (volumetric pass, color grading, underwater, zombie effects).
- **Color Grading**: sunrise (0.15-0.35 dayTime) warm orange/pink, sunset (0.65-0.85) deep orange/red.
- **Particles**: `ParticleSystem` (max 500), Chebyshev-distance square shader for voxel-style particles; per-particle `soft` attribute (build 2026-07-09.4) = wide-falloff GLOWING square (spawn option `soft: true` — still square, no circles).
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
- **Default: hydrological rivers** (`WORLD_CONFIG.hydroRivers: true`, CCR-WORLDGEN-PIPELINE-002 WS6/Bump B, shipped build `2026-07-13.2`, `TERRAIN_GEN_VERSION` 35): springs are placed wherever pre-river height exceeds `HYDRO_SPRING_H` (95) on a global integer lattice stepped by `HYDRO_STEP` (32 blocks) AND the site passes a local-ridge test. Each spring then does a greedy 8-neighbor descent on `getPreRiverHeight` sampled at exact lattice points — integer coordinates, exact compares, no float accumulation (the abandoned gradient-descent-tracer design survives only as the tombstoned `getLocalSlope`, `[TOMBSTONE TER-11]`). Raw greedy descent alone reaches the ocean only 24–50% of the time (dead-ends in noise pits); **pit-centered flood-and-spill breaching** (`floodSpill`, a Barnes-style priority-flood bounded by a `HYDRO_HALO` (32-cell) radius measured FROM THE PIT, not from any region edge — seam-free by construction) fixes this to **100% measured ocean connectivity, 0 halo-fails**. Flow accumulation along each traced path derives channel WIDTH at confluences for free during tracing (scaled by `FLOW_WIDTH_SCALE`). Traces/polylines are computed once per `HYDRO_REGION` (1024-block region) and cached in `hydroRegionCache` (a module-scope Map, TRUE LRU as of Bump B — see agent-notes' FIFO-vs-LRU lesson); regions never change values, they only bound work — a query near a region boundary also consults the 3×3 neighborhood. Per-column queries go through `riverFactorAt(gx, gz, seed, preHeight, widthMult)`, which keeps `getRiverFactor`'s EXACT signature and 0→1 shaping, so every existing caller (`applyRiverCarve`, tree placement, `precalculateTerrainCaches`) is unchanged regardless of which system is active; a 128-block spatial segment bucket index (`bIdx`) plus the 3×3-neighborhood memo bring warm per-call cost to ~1.5× the old ribbon (it was measured 27–66× unindexed at real production segment density before those two optimizations — see agent-notes). Deltas reuse the existing ocean-gated `getDeltaFingerFactor` unchanged (not yet re-tuned for hydro-shaped river mouths — flagged as an open interaction, not a bug). **v1 scope (OD5):** springs/routing/flow-width/deltas only; lakes at true minima and fjords are deferred to a future v2 CCR.
- **Organic shape (CCR-WORLDGEN-PIPELINE-002 WS6-P3, shipped build `2026-07-13.3`, `TERRAIN_GEN_VERSION` 36)** — owner defect fix: the raw lattice skeleton above reads as ruler-straight segments with 45/90-degree bends plus circuit-board bundles of parallel channels below mountains, because nothing organic was layered on the routing math. Three additive fixes, layered ON TOP of the routing skeleton WITHOUT touching trace/spring/spill logic: (1) **build-time polyline subdivision + noise displacement** — `buildHydroRegion`'s segs-emission subdivides each 32-block lattice edge into `HYDRO_MEANDER_SUBDIV` (4) sub-segments and displaces INTERIOR sub-vertices by two `noise2D` fields (`HYDRO_MEANDER_AMP` 7 blk, `HYDRO_MEANDER_FREQ` 0.015 — ~65-block-wavelength S-curves); lattice endpoints stay undisplaced so confluences/joins still connect exactly; `paths`/`stats` (read by M15/M17) stay at exact lattice coordinates — only `segs` (the query/render skeleton) is displaced. (2) **query-time bank micro-warp** — `riverFactorAt` warps its own query point (`HYDRO_BANK_AMP` 4 blk, `HYDRO_BANK_FREQ` 0.02) before the bucket/distance search; `R_QUERY` grows by `HYDRO_BANK_AMP + HYDRO_MEANDER_AMP` to stay exact. (3) **join-termination** — `buildHydroRegion` now tracks a per-build `claimed` map (lattice cell → the reached/unreached status of whichever earlier trace first passed through it); a trace stepping into an already-claimed cell terminates there instead of running parallel forever, merging tributaries (measured 67-85% of springs join). Residual limitation (reported, not hidden): a short "comb" of near-parallel initial segments remains visible immediately at mountain ridgelines/springs before the first join — inherent to the fixed 32-block spring-lattice spacing, which this fix was scoped not to touch. Ribbon fallback stays byte-identical throughout. See the CCR's WS6-P3 As-built for full gate results and hillshade evidence.
- **Plains meander + channel width (CCR-WORLDGEN-PIPELINE-002 WS6-P4, shipped build `2026-07-13.4`, `TERRAIN_GEN_VERSION` 37)** — follow-up owner defect: WS6-P3's fine meander bent rivers nicely in the mountains but was imperceptible on near-flat plains/lowlands, and channels read thin. Fix: an elevation-gated MACRO meander octave (`HYDRO_MEANDER_MACRO_FREQ` 0.006, `HYDRO_MEANDER_MACRO_AMP` 15) layered on WS6-P3's fine octave inside `buildHydroRegion`'s segs-emission, strongest at sea level and fading to 0 by 40 blocks above (elevation read from the trace's own already-known lattice-endpoint heights — no extra sampling); combined fine+macro displacement stays clamped to ±15/axis (self-crossing guard, unchanged). Channel half-width promoted from a hardcoded 6-block placeholder to `GEN_TUNABLES.HYDRO_CHANNEL_HALF_WIDTH` (default 9). Routing math (trace/spring/spill) untouched; ribbon fallback stays byte-identical. See the CCR's WS6-P4 As-built for the width-progression table, gate results, and honest hillshade description (visible S-curves on most sampled plains reaches; at least one seed's reach still reads as a long gentle diagonal rather than a pronounced S-bend — a milder residual than the original ruler-straight defect, inherent to bounded noise displacement without touching routing).
- **Valley-snap + corner smoothing + spring density (CCR-WORLDGEN-PIPELINE-002 WS6-P5, shipped build `2026-07-13.5`, `TERRAIN_GEN_VERSION` 38)** — owner defect report #3 (terrain-parameter-editor screenshot, seed "VoxEx"): "too many arms, all too straight — they look like very generated rivers, not erosion-based rivers following and indenting the natural low points." Three fixes, all still downstream of the trace/spring-selection/flood-spill routing math (untouched except the one spring-density gate below): (1) **Chaikin corner-cutting** — one standard open-polyline Chaikin iteration on each raw lattice path, inside `buildHydroRegion`'s segs-emission, BEFORE subdivision (pure arithmetic on lattice coords/heights, no noise) — rounds every 45/90-degree lattice bend into two gentler bends; path start/end stay exact, interior lattice vertices (including F3 tributary-join points) no longer are — channel width comfortably absorbs the resulting few-block join slack. Subdivision count halved (`HYDRO_MEANDER_SUBDIV`/2) to hold ~8-block sub-vertex spacing against Chaikin's shorter edges. (2) **Valley-snap** (`GEN_TUNABLES.HYDRO_VALLEY_SNAP`, default 0.7) — THE core erosion-look fix: each interior sub-vertex samples real pre-river terrain (`getPreRiverHeight`) at itself plus four perpendicular offsets (±6/±12 blk) and is pulled toward the lowest sample before WS6-P3's fine meander/WS6-P4's macro-meander are applied; the macro octave is dropped wherever the snap already moved a vertex ≥3 blocks (the real terrain has an opinion there) and kept where the snap settled near zero (dead-flat ground). Combined snap+meander displacement stays inside the same ±15/axis self-crossing clamp; `riverFactorAt`'s `R_QUERY` window margin gained a Chaikin-corner term to stay exact. (3) **Spring-density gate** (`GEN_TUNABLES.HYDRO_SPRING_KEEP`, default 55) — a deterministic integer hash of (lattice cell, seed) mod 100 keeps only ~55% of ridge-qualifying spring candidates (applied before the `springs++` counter, so M14 connectivity stays measured per KEPT spring), roughly halving visible arms after join-termination. Routing math and the ribbon fallback are untouched and stay byte-identical (verified ×3 seeds). See the CCR's WS6-P5 As-built for measured spring counts, region-build/query cost, gate results, and hillshade evidence (fewer/curvier channels, dendritic mountain drainage visibly following ridgelines).
- **Elevation-progressive width (CCR-WORLDGEN-PIPELINE-002 WS6-P7, shipped build `2026-07-13.7`, `TERRAIN_GEN_VERSION` 39)** — owner defect #5 + team-lead visual audit: hydro rivers read as thin, dark, angular dry ravines at map scale rather than water, because `riverFactorAt` had no elevation term at all. Two multiplicative width terms in the hydro branch, both driven by `preHeight`: `HYDRO_LOWLAND_WIDEN` (default 2.5) widens the channel from 1x at preHeight 75 up to 3.5x by preHeight 35 (matching the ribbon's own full-width-below-75 rule), and `HYDRO_HEADWATER_TAPER` (default 0.8) narrows it from 1x at preHeight 95 down to a 0.2x floor by preHeight 130+ (never vanishing). Verified via a 1024-block probe zoom that lowland trunk reaches now read as clearly wide, bright water with visible confluence widening; honestly, the SAME fix is imperceptible on a 4096-block/step-4 full-map render (a ≤30-block-wide river is only a few pixels at that scale regardless of tuning) — see the CCR's WS6-P7 As-built for the width-progression table, the rejected-on-cost `getPreRiverHeight` fallback attempt, and the full honest visual verdict.
- **Coastal erosion — fjords, cliffs/bluffs, flow-driven deltas (CCR-WORLDGEN-PIPELINE-002 WS8, shipped build `2026-07-14.3`, `TERRAIN_GEN_VERSION` 42)** — owner request to make oceans respond to the same relief/flow signals rivers already use. F1 fjords: `applyRiverCarve` extends a coast-crossing river's bed below sea level on high-relief crossings (`FJORD_RELIEF_MIN`/`FJORD_DEPTH_SCALE`), mutually exclusive with delta widening at the same crossing (measured 15-31% naive overlap across seeds, far above the ~2% ship-as-drafted budget). F2 cliffs: `computePreRiverHeight`'s ocean-blend transition sharpens on high relief (`CLIFF_SHARPNESS_MAX`, an exponent on `oceanFactor`), with a matching beach-sand exception (`isCoastCliffCol` + its `isTreeSoilSurface` mirror). F3 deltas: `getDeltaFingerFactor` widens with the river's actual flow accumulation (`DELTA_FLOW_SCALE`, threaded via `_riverFlowScratch`) instead of coordinate noise alone. Applies UNCONDITIONALLY to both river systems (ribbon and hydro alike — a considered choice, not hydro-gated); gated by `tools/biome-pipeline-checks.mjs`'s M22 (fjord flooding)/M23 (cliff transition width). See the CCR's WS8 As-built for full gate numbers, cost measurement, and honest render verdicts (fjord/cliff effects are dramatic at a real mountainous coastline; the flow-driven delta effect is real but measured subtle — ≤3 blocks — for the seeds explored so far).
- **Fallback: ribbon rivers** (`WORLD_CONFIG.hydroRivers: false`) — the original stationary domain-warped noise ribbon, kept byte-identical as the flag-OFF escape hatch: `getRiverFactor(gx, gz, seed)` returns 0 (river center) → 1 (no river) where `|noise2D|` of the warped coordinates falls below the channel half-width (`RIVER_BASE_WIDTH` 0.064 noise units ± coastal variation; warp = two-octave coordinate warp + axis-balanced sinusoidal meander + regional macro-meander, `RIVER_WARP_*`). There is NO gradient-descent tracing and NO `RiverNetworkCache` on this path. `getRiverFactor` takes an optional `widthMult` (1 = channel, 3 = valley band). `heightPenalty = smoothstep(75, 95, terrainHeight)` (CCR-RIVER-002): full width ≤75, narrowing 75–95, pinch-out >95. A mountain river-tunnel punch that once lived in `generateTerrainPass` was fully DELETED (TER-5). Retiring this path entirely is owner-gated (OD4) on both bumps soaking in real play — see WS7 in `CCR's/CCR-WORLDGEN-PIPELINE-002-worldgen-completion.md`; do not remove it unilaterally.
- **Carving (CCR-RIVER-002/003)** — shared by BOTH systems above (both feed the same carve pass via `riverFactorAt`'s dispatch): two stages in `applyRiverCarve`. (1) VALLEY depression — terrain around the channel is pulled down toward a valley profile (floor keeps 15% of original relief: `(0.15 + 0.85·vf²)` above seaLevel+2 — a pure vf² clamp made dead-flat sand pans; walls contour-wiggled; influence band = 3× channel width), so rivers sit in valleys instead of slot canyons and hills become valley crossings, not dams. (2) FULL-depth channel incision to the `getRiverDepth()` bed (below sea level → carved columns flood; no `tunnelMix` benches). Both stages have independent strength fades (valley 80–93, channel 82–95 of preHeight) that reach zero BEFORE the width cutoff bites — rivers end as a narrowing valley + dry ravine head, never a cliff ring or dam. Micro-meander is gentle (wavelength 150±60, amp 4+3·ef — the old 80±40/±15 sine serrated banks into sawtooth "cutouts"); the 120-block macro-meander does the large-scale wandering (ribbon path only — hydro rivers get their shape from the traced lattice descent instead). River SAND hugs the channel core (`rf < 0.5 && y < seaLevel + 3 + surfaceNoise*2`, dithered edge), water fill in `fillWaterPass`. Beach sand is WATER-PROXIMITY gated (`oceanFactor`/`riverFactor` via `caches.oceanCache`) — never a bare Y-band (CCR-TERRAIN-011); the OCEAN arm of this gate additionally skips swamp-labeled columns on the biome-driven path as of Bump B (`isSwampCol`, via `biomeIdCache`) — swamp shores dress as muddy grass, not beach sand (mirrored in `isTreeSoilSurface` per the Lockstep Registry).

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
- **Power scaling** (CCR-MAGIC-006 A2/A3): global `spellPower` (1-5, default 3) adjusted by the scroll wheel in magic mode (`adjustSpellPower`) or two touch buttons (`#touch-btn-power-down/up`); `#power-pips` (5 squares inside `#mode-badge`) shows the current value. Per-spell `powerScale` tables on `SPELL_CONFIG` entries are read through `spellParam(spell, key)` (falls back to base `params[key]` when no table exists for that key) and `powerFactor(power = spellPower)` (a `[0.5,0.75,1,1.4,1.8]` force/damage/shake multiplier). All four spells scale to the full `spellPower = 5` since build 2026-07-08.5: `EXPLOSION_POWER_CAP` was lifted 3→5 (owner decision) and the old measurement-first gate is satisfied ORGANICALLY — every power ≥ 4 explosion logs its carve ms to the always-on ring buffer (`dumpLogs('magic')` after a session IS the Stage-1 measurement; re-lower the cap or build Stage-2 `bulkEdit` per magicSystem.md §8.2 if radius-8 hitches).
- **Channeled spells** (Laser, Freeze — CCR-MAGIC-006 Phase B): press/release delivery via shared `beginChannel(spellId, mode)`/`tickChannel(dt)`/`endChannel()` (state: `channelActive`/`channelSpellId`/`channelDepth`/`channelCastMode`), wired into `castSpell`'s dispatch, the per-frame HOLD-TO-CAST block (arms a channel instead of repeat-casting), `onMouseUp`'s magic-mode branch, `stopMining()`'s last line, and `#touch-btn-cast2` (rewired from tap-only to `wireHoldButton`, since a channeled secondary needs a release). Each spell supplies `onChannelStart`/`onChannelTick`/`onChannelEnd`. **Laser**: one pooled beam mesh (NOT registered in `activeBeams`) + THREE persistent reused spell lights (head 2.4 + near-muzzle ~15% + mid-beam 55%, falloff distance 14 — the WHOLE beam lights terrain, build 2026-07-09.4; `spawnSpellLight` gained an optional distance param); digs progressively deeper (`nextLaserChannelDepth` — F5 clamps the dig frontier to the current solid-ahead distance every frame; `nextLaserCarveCursor` (build 2026-07-08.4 fix) re-grounds the CARVE CURSOR whenever the clamp shortens the beam — without it, sweeping after a deep dig deadlocked the cursor and the laser never carved again that channel; F17 only carves once a whole new voxel of depth exists; `LASER_CARVE_MIN_START = 1.5` (build 2026-07-09.4) starts the carve 1.5 blocks ahead of the eye — the bore stamp is a full sphere at its start voxel and used to pit the ground under the caster's feet) and scars the bore walls (`scarTubeWalls`); the beam is DRAWN from the player's real casting (LEFT) hand via `getCastingHandPosition(out)` (CCR-MAGIC-007 A1/A2, replaces the old synthetic `LASER_MUZZLE_RIGHT`/`LASER_MUZZLE_DOWN` eye-offset muzzle) — 3P reads the `torchHolder`/`leftElbow` node on `playerBodyMesh`, 1P reads `playerArmsModel`'s `leftArm` node, both via `getWorldPosition`; falls back to the eye position if the rig isn't built yet. Aim/pick/carve still use the eye ray, unchanged. While a channel is active the LEFT arm raises toward the aim (CCR-MAGIC-007 A3: a `target*`-only override in `animatePlayerLimbs` placed after the mining-swing AND torch-arm overrides for 3P — casting wins over torch-holding when both are active — and a direct lerp in `animateViewmodelArms` for 1P), so the beam origin rises with the hand for free; the BODY also yaws toward the aim while channeling even when stationary (build 2026-07-09.4 — without it the raised arm pointed along the body's stale last-facing and the beam read detached, floating beside the head); the held torch is NOT hidden while casting (v1 decision). Releases via a `collapsingBeams` list (handled inside `updateBeams` alongside the original fade path) that retracts the tail forward over `len/BEAM_COLLAPSE_SPEED` seconds, anchored to the hand-based visual beam. **Freeze**: emits a budgeted frost-particle stream every frame — since build 2026-07-09.4 a tight ~1-block soft-glow jet fired from the casting hand (`getCastingHandPosition`; the freeze CONE itself stays on the eye ray at full width) — but only re-sweeps `convertConeEdit`(WATER→ICE)+fire-douse on a 150ms accumulator (both already skip non-matching blocks, so a repeat sweep is cheap). **Fixed 2026-07-11**: opening the inventory mid-channel now ends it — `resetTransientInput()` (the shared body `onGameplayFocusLost()` calls, which `exitGameplay()`'s inventory-open path reaches) calls `stopMining()`, which already ends any active channel via `endChannel()`; previously it only cleared movement/mouse state and left a channel (e.g. a Laser beam/light) frozen in-scene until a later mouseup (see `CCR-MAGIC-006-spell-polish.md` Phase B As-built).
- **Fireball** (CCR-MAGIC-006 C1/C2, replaces the old free-flight gravity arc; juiced in CCR-MAGIC-007 C1/C2): `castFireball` raycasts `SPELL_TARGET_RANGE` at cast time and launches a deterministic path-mode projectile (`p.pathMode`/`pathFrom`/`pathTo`/`pathT`/`pathDur`/`arcHeight` fields on the pooled projectile object) guaranteed to arrive at the AIR side of the hit face (F6) via a parabolic arc (`updateProjectiles` branches on `p.pathMode`, skipping gravity/velocity integration); the per-frame solid/mob early-detonation checks still apply. `spawnProjectile` takes an optional `meshScale` (default 1) that scales both the mesh and the pooled light's intensity/distance (base 3.5/12) as absolute values each spawn — no reset needed beyond the existing mesh-scale-to-1 in `releaseProjectile`. In flight, `spawnProjectileTrail` emits 2-3 particles/frame (a 15% chance each is a bright ember) with a brighter core (`emissiveIntensity: 3`). On impact (`onFireballImpact`), a `spawnSpellLight` flash fires first, THEN a power-scaled `charRadius` sphere (0 at power 1-2) instantly chars burnable blocks to their `BURN_RESULT` (skipping the normal burn-timer/cling delay) and cracks non-burnable ones (see Cracked-variant scarring), THEN `igniteFireballBurst` runs with power-scaled `burstRadius`/`igniteMax`, a 28-particle burst (1.6x the old velocity) plus `spawnFireballImpactRing` (a 60%-scale/speed miniature of Explosion's own square shock ring), `AudioManager.playFireballImpact()` (thump+crack), and a proximity camera shake within 12 blocks (squared-distance gate, guarded behind a live-scene check so it stays inert in the headless test harness).
- **Terrain edits (Stage 1 only)**: `carveSphereEdit`/`carveTubeEdit`/`convertConeEdit` (+ shared `shouldSkipShapeEdit` skip rule) loop the facade `setBlock` and batch one `updateLocalArea()` per touched chunk. No Stage-2 `bulkEdit` — deferred pending a real in-game carve-cost measurement (magicSystem.md §8.2/§15.5).
- **Cracked-variant scarring** (CCR-MAGIC-006 C3): see [Block Types](#block-types-current-23-blocks) for `CRACKED_STONE`/`CRACKED_DIRT`/`CRACKED_PLANKS` and the `CRACKED_VARIANT` lookup. Wired into the explosion crater rim (`scarExplosionRim`), the laser's channeled bore walls (`scarTubeWalls`), and the fireball impact patch (inside the char-core scan).
- **Projectiles**: `activeProjectiles` pool (`MAX_PROJECTILES = 12`), hooked into `animate()`'s existing gameplay block; separate `MAX_PROJECTILE_LIGHTS = 3` light cap (oldest-eviction) distinct from the 4-cap `activeSpellLights`/`activeBeams` and the real 8-light torch pool (`MAX_POINT_LIGHTS = 8`). Pooled objects also carry the path-mode fields above; `releaseProjectile` resets mesh scale to 1 and `pathMode` to `false` so a reused object never leaks state across spells/casts.
- **ICE** (block 19, see [Block Types](#block-types-current-23-blocks)): meshes through the standard cutout terrain path (LEAVES-style), NOT the `_GLASS` blended mesh; frosted lighting (1/1 attenuation, locked decision). Slippery underfoot: `ICE_DAMPING_BASE = 0.1` overrides the centralized movement-damping scalar in `applyPlayerVelocity()` when grounded (`canJump && !isFlying`) on ICE.
- **Touch**: `#touch-btn-magic` (toggle) + `#touch-btn-cast2` (secondary cast/channel, hold-capable, CSS-gated to `body.magic-mode`) + `#touch-btn-power-down/up` (power dial, same gating); tap = primary cast (`touchPlaceBlock()`), hold = repeated primary casts or an armed channel (`castHeld` flag, consumed per-frame, throttled by the same spam guard). This tap/hold/button mapping is the CCR's own proposed default, not yet play-feel-confirmed on a real device.
- Full design + as-built record (concrete deviations from the original design, what shipped vs. was deferred): `magicSystem.md` §15 (Phases 0-5) + `CCR-MAGIC-006-spell-polish.md`'s per-phase As-built sections (Phases A-C: true-aim range/power scaling, channeled Laser/Freeze, deterministic fireball + cracked variants).

### World Creation System
- **UI** (CCR-WORLDGEN-UI-001): world name, seed input, biome selector grid, terrain presets, and SCHEMA-DRIVEN option sections — `GEN_PARAM_SCHEMA` (one entry per `DEFAULT_GEN_PARAMS` key) generates collapsed `.ui-collapse` sections of free-form text inputs via `populateGenParamControls()`. NO sliders, NO clamping: any finite number is accepted (`parseGenParamInput`); values outside the schema's `tested` range get a soft amber `.genparam-warn` + tooltip (and badge the preview label); NaN/empty falls back to the default. One delegated `change` listener on `#genparam-sections` handles all controls. An 📥 button imports a `genParams` JSON (the terrain editor's export format).
- **Presets**: Default, Amplified, Flat, Archipelago, Superflat, Caves (`WORLD_PRESETS`, also seam-exported read-only to the terrain editor).
- **Customization**: tree/cave density, terrain amplitude, sea level, biome size, noise persistence/lacunarity, spawn coords — ALL live on the default terrain path since CCR-WORLDGEN-UI-001 Phase D: amplitude is wired into `WORLD_CONFIG.terrainAmplitudeMultiplier` in `applyGenParams` (was dead — the missing "Step 11"); `seaLevel` reaches the worker via an injected `WORLD_DIMS.seaLevel` override baked at pool creation (the hand-maintained template literal stays 60 — see Lockstep Registry); spawn X/Z actually place the player + center pre-gen (`findAndSetSpawnPosition(spawnBX, spawnBZ)`); the dead `usePathBasedRivers` key was REMOVED (genParams is now 13 keys, still "v3" — old saves carrying the key load fine, it's just never read). The knobs work through LIVE getters on `worldConfig`; the active world's params live in `activeWorldGenParams` (applied via `applyGenParams`, persisted as `savePacket.genParams`, restored BEFORE generation). In-session loads must `rebuildChunkWorkerPoolForActiveWorld()` (worker bakes config at pool creation). Details: agent-notes §3.
- **Preview**: real-time terrain preview (`WorldPreviewRenderer`) delegating directly to the game's own `blendedHeight()`/`getBiomeParams()` (no separate noise copy to keep in sync). **Management**: rename, duplicate, import/export, storage stats, clear cache.
- **Advanced tunables** (CCR-WORLDGEN-TUNABLES-001 + Option B): the ~35 shape/climate/spline/river/ocean/cave generation constants live in the `GEN_TUNABLES` registry (defaults = shipped values; `GEN_TUNABLE_SCHEMA` drives the Advanced Tunables sections in BOTH the terrain editor and the create-world page, `ui: 'both'` for most rows). **WS6-P6 (build 2026-07-13.6)**: the 5 ribbon-only river rows (`RIVER_BASE_WIDTH`, `RIVER_WARP_FREQ`, `RIVER_WARP_AMP`, `RIVER_WARP_VAR_FREQ`, `RIVER_WARP_VAR_STRENGTH` — consumed only inside the ribbon-path `getRiverFactor`) are `ui: 'hidden'` in both builders (dead-looking while `hydroRivers` ships as the default; row/registry key/ribbon code all survive as the OD4/WS7 escape hatch); the `'Rivers (Hydrological)'` schema section was renamed to `'Rivers'` so its rows merge with the (still-visible) `RIVER_DEPTH_SCALE` row instead of sitting in a separate same-topic section. **`GEN_TUNABLES` gained a "Biome Classification" schema section** (CCR-WORLDGEN-PIPELINE-001 Phase 1): `SPLINE_RELIEF`, `BIOME_SOFTMAX_TAU`, `BIOME_CENTROIDS`, `BIOME_STYLE`; `AXIS_W` gained a new `r` (relief) weight alongside its existing `t/h/c` keys. **Per-world persistence (Option B, build 2026-07-11.3)**: `genParams` carries an OPTIONAL `tunables` DELTA field (non-default keys only; NOT a `DEFAULT_GEN_PARAMS` key — the schema-parity test forbids that). `applyGenParams(p)` is TRI-STATE on `p.tunables`: absent/undefined → `resetGenTunables()` (old saves = pure defaults); plain object → reset then `applyGenTunables(delta)`; explicit `null` → leave the registry untouched (the terrain editor's live-dialing escape hatch — its `applyParamsToGame()` wrapper passes its own delta). Create-world UI: `customWorldTunables` delta + `data-gentunable` rows appended by `populateGenParamControls()`; 📥 import accepts both the editor's wrapped `{genParams, tunables}` export and bare genParams. Value plumbing only — formulas unchanged, byte-identical at defaults. Cave tunables travel to the worker via the per-generate `worldGenSettings` message (`syncGenTunableCaveSettings`); everything else bakes at pool creation (all flows create/rebuild the pool AFTER `applyGenParams`).

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
| `LightTask` | Async light propagation for BOTH channels with pressure-based bailout |
| `ChunkDiskStorage` | OPFS disk cache with inline worker backend |

> The old class-based engine (`SettingsManager`, `InputManager`, `TerrainGenerator`, `ChunkMesher`, `RenderEngine`, `EntityManager`, `Mob`, `Zombie`, `PlayerController`, `VoxExGame`) was dead code (never instantiated) and has been removed. The live game uses module-level functions (`generateChunkData`, `renderChunk`, `buildZombieMesh`/`updateZombies`, the global `animate()` loop) plus the classes above. Tombstone comments mark removal sites in `voxEx.html`.

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHUNK_SIZE` / `WORLD_DIMS.chunkSize` | 16 | Blocks per chunk side (XZ). CAUTION: the bare `CHUNK_SIZE`/`CHUNK_HEIGHT` names exist ONLY inside the worker template (`CHUNK_WORKER_CODE`) — main-thread code MUST use `WORLD_DIMS.chunkSize`/`.chunkHeight` (a bare reference threw ReferenceError on every world creation, hotfixed build 2026-07-11.4) |
| `CHUNK_HEIGHT` / `WORLD_DIMS.chunkHeight` | 320 | Chunk vertical extent |
| `WORLD_DIMS.seaLevel` | 60 | Default sea level |
| `SECTION_HEIGHT` | 16 | Blocks per vertical section |
| `SECTIONS_PER_CHUNK` | 20 | Sections per chunk (320/16) |
| `CHUNK_DATA_SIZE` | 81920 | Bytes per chunk (16x16x320) |
| `NUM_TILES` | 40 | Texture atlas tile count |
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
| `SWISS_WARP` | 10 (hard bound < 14) | Swiss-turbulence erosion drift (mountain flanks). NOTE: since CCR-WORLDGEN-TUNABLES-001 this and ~35 other shape/climate/river/cave constants live in the `GEN_TUNABLES` registry (read via `let` aliases; defaults = shipped values; editable in the terrain editor AND create-world Advanced Tunables sections; persisted per-world as the optional `genParams.tunables` delta — Option B). `applyGenTunables` enforces the < 14 hard cap. Changing a DEFAULT in the registry = terrain change = `TERRAIN_GEN_VERSION` bump. |

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
2. **Texture Atlas**: adding blocks → update `NUM_TILES` in BOTH copies (main + worker template; parity-check P9 enforces equality) + add texture gen in `initTextures`. Current count: **40** (magicSystem.md Phase 0 added 3 spell-icon tiles; Phase 1 added ICE as the 37th; CCR-MAGIC-006 C3 added 3 cracked-variant tiles as 38-40).
3. **Block Config**: add to `BLOCK_CONFIG` (auto-derives inventory/textures/transparency). Also update `BLOCK_IS_SOLID`/`BLOCK_IS_OPAQUE`/`IS_TRANSPARENT` + attenuation tables via `initBlockLookupTables()`.
4. **Biome Config**: add to `BIOME_CONFIG` (inherits from `BIOME_DEFAULTS`) + a height function to `HEIGHT_FUNCS`. Remember the worker template's hand-maintained `BIOME_CONFIG` copy (run `parity-check.mjs`).
5. **Settings**: default in `DEFAULTS` → wire into `SETTINGS` → DOM binding in settings UI → `saveSettings()`. Settings must round-trip and have real DOM IDs.
6. **UI Overlay**: elements toggled via `controls.lock`/`unlock` events; keep heavy overlays out of `#blocker` (agent-notes §3).
7. **Light System**: when changing blocks, call `updateSunlightAt()` + `updateBlockLightAt()`. Use `LightTask` for async propagation (shared by both channels since CCR-LIGHT-004 Phase 3A).
8. **Chunk Format**: use `chunk.blocks` / `chunk.skyLight` / `chunk.blockLight` (with backward-compat checks).
9. **Voxel Aesthetic**: BoxGeometry only — no spheres/cylinders/curves.
10. **Worker Parity**: terrain/tree/mesh functions are SINGLE-SOURCE on the main thread; `buildChunkWorkerCode()` injects their `Function.toString()` source between the `/* __TERRAIN_FUNCS_START__ */`, `/* __TREE_FUNCS_START__ */`, and `/* __TERRAIN_PASS_START__ */` marker pairs. Edit ONLY the main-thread sources — the worker copies are generated. Markers MUST stay intact (`parity-check.mjs` verifies). The worker template ALSO hand-maintains copies of `WORLD_DIMS`, `BIOME_CONFIG`, `TREE_CONFIG`, `SeededRandom`, `fadeFast`, `GRAD2D`/`grad`, and the `_nd2`/`_fd2`/`_ed2` scratches — see [Lockstep Registry](#lockstep-registry).

### Common Search Patterns
- **Config**: `const WORLD_CONFIG`, `const SETTINGS`, `const DEFAULTS`, `SETTINGS_PROFILES`, `activeWorldGenParams`, `applyGenParams`, `GEN_PARAM_SCHEMA`, `parseGenParamInput`, `populateGenParamControls`, `GEN_TUNABLES`, `GEN_TUNABLE_SCHEMA`, `applyGenTunables`, `resetGenTunables`, `syncGenTunableAliases`
- **Block Types**: `const AIR`, `const GRASS`, `const LEAVES`, `BLOCK_CONFIG`, `BLOCK_IS_SOLID`, `BLOCK_IS_OPAQUE`
- **Biomes**: `BIOME_CONFIG`, `BIOME_DEFAULTS`, `getBiomeParams`, `getBiomeCellDirect`, `HEIGHT_FUNCS`
- **Terrain (new path)**: `terrainSurface`, `computeSurfaceHeight`, `resolveBiome`, `erosionParam`, `noise2Dd`, `SWISS_WARP`
- **Terrain (biome-driven, CCR-WORLDGEN-PIPELINE-001)**: `classifyBiome`, `reliefParam`, `styleBlend`, `featureAt`, `BIOME_CENTROIDS`, `BIOME_ID_ORDER`, `biomeDrivenTerrain`, `BIOME_STYLE_ACTIVE`, `SPLINE_RELIEF`
- **Terrain (shared/legacy)**: `blendedHeight`, `continentalHeight`, `mountainsHeightFunc`, `plainsHeightFunc`, `precalculateTerrainCaches`
- **Rivers**: `getRiverFactor` (ribbon, flag-OFF only), `riverFactorAt` (dispatcher — always call this, not `getRiverFactor`, unless you specifically mean the ribbon), `getRiverDepth`, `applyRiverCarve`, `computePreRiverHeight`
- **Rivers (hydrological, CCR-WORLDGEN-PIPELINE-002 WS6/Bump B)**: `hydroRivers`, `buildHydroRegion`, `floodSpill`, `hydroRegionOf`, `hydroLatticeH`, `hydroRegionCache`, `HYDRO_REGION`, `HYDRO_STEP`, `HYDRO_HALO`, `HYDRO_SPRING_H`, `FLOW_WIDTH_SCALE`
- **Trees**: `getChunkTreePositions`, `wouldHaveValidTree`, `isTreeSiteViable`, `isTreeSoilSurface`, `generateTreeMaskForChunk`
- **Gen**: `function generateChunkData`, `function calculateChunkSunlight`, `GEN_PASS`, `RENDER_PASS`
- **Render/Meshing**: `function renderChunk`, `renderChunkAsync`, `processChunkQueue`, `WORKER_MESH_PIPELINE_ENABLED`, `chunkUsesBands`, `markChunkBanded`, `meshProfile`, `getMergeKey`
- **Light**: `class LightTask`, `updateSunlightAt`, `updateBlockLightAt`, `processSunlightQueue`, `processLightQueue`, `WORKER_LIGHTING_ENABLED`
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
| `WORLD_DIMS` (incl. `yOffset`!) | main + worker template | identical values (a yOffset drift of 64 once silently killed ALL worker tree generation). NOTE: `seaLevel` is additionally RUNTIME-OVERRIDDEN in the worker by an injected `WORLD_DIMS.seaLevel = <live value>` line baked at pool creation (CCR-WORLDGEN-UI-001 #11) — both literals stay 60; never "fix" a custom sea level by editing either literal |
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
| `precalculateTerrainCaches` | INJECTED via `terrainFuncs` in `buildChunkWorkerCode` (TER-21) — single-source, edit ONLY the main-thread copy; NOT hand-copied (corrected CCR-WORLDGEN-PIPELINE-001 Phase 1) | worker terrain divergence if the injection marker/list is broken |
| New flat-ground material outcomes (e.g. talus aprons) | must be added to `isTreeSoilSurface` too | trees on non-soil |
| `getBlockEmission` | `calculateBlockLight`'s full-recalc seed loop (CCR-LIGHT-004 Phase 4 / D7) | new emissive blocks light on placement (via updateBlockLightAt) but go dark on the next full recalc |

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
- **`tools/terrain-node-checks.mjs`** — headless terrain invariants, no browser needed: `node tools/terrain-node-checks.mjs [voxEx.html] [seed]`. Extracts the REAL terrain/river/soil functions from voxEx.html by name (no hand-copied replicas) and checks determinism, bounds, adjacent-column continuity (<30), notch metric, river flood integrity (channel cores must flood), valley-floor pan signature, and the tree-soil elevation gradient. Fast smoke test for terrain changes; the browser suite remains authoritative for workers/meshing/lighting/persistence. Uses its own perm PRNG — internally consistent, not byte-identical to in-game seeds. Gained a `--json` output mode (CCR-WORLDGEN-PIPELINE-001 Phase 0): `[{id,label,pass,detail}]`, info checks `pass:null`; human output + exit codes unchanged, default stays human text. LOCKSTEP: `tools/lib/extract-terrain.mjs` extracts the `GEN_TUNABLES` registry and derives the tunables from it (CCR-WORLDGEN-TUNABLES-001) — adding/renaming a registry key means updating its `REGISTRY_KEYS` list in the same commit (a miss fails loudly: "const X not found" / assembly error). Its `FUNCS`/`REGISTRY_KEYS`/`OBJ_CONSTS` lockstep lists grew again in CCR-WORLDGEN-PIPELINE-001 (`reliefParam`/`classifyBiome`/`styleBlend`/`featureAt`; `SPLINE_RELIEF`/`BIOME_SOFTMAX_TAU`/`BIOME_CENTROIDS`/`BIOME_STYLE`; `BIOME_ID_ORDER`) — same "add in the same commit or it throws loudly" discipline.
- **`tools/terrain-probe.mjs`** — the measure-before-you-touch instrument: `height <gx> <gz>` (point query: heights, riverFactor, biome, tree-soil), `transect x0 z0 x1 z1` (ascii profile + max adjacent step), `stats [cx cz size]` (per-axis anisotropy Z/X, mountain coverage, worst step), `hillshade cx cz size [out.png]` (shaded-relief PNG render — spot striping/rings/sawtooth banks visually). Run probes BEFORE tuning terrain constants and AFTER to prove the effect; renders are attachable evidence. Shares `tools/lib/extract-terrain.mjs` with terrain-node-checks (single-source extraction). `stats` gained a `--json` mode (`{minH,meanH,maxH,pctBelowSea,pctAbove150,meanDX,meanDZ,anisotropy,maxAdjStep,maxAdjStepAt}`) and the CLI gained a bare `--biome-driven` flag (CCR-WORLDGEN-PIPELINE-001) to force the flag ON/OFF explicitly for A/B probes against the live default.
- **`tools/biome-pipeline-checks.mjs`** (CCR-WORLDGEN-PIPELINE-001, extended CCR-WORLDGEN-PIPELINE-002) — the M1–M21 biome/hydro-pipeline gate harness: field-histogram rail pile-up (M1), per-field autocorrelation length (M2, transect length now scales with the frequency ratio so doubled-frequency fields still get an adequate independent-sample count), **biome↔shape agreement ★ (M3, ≥95%)**, label-boundary seam continuity ★ (M4, river-influenced pairs excluded from the ratio populations only), mountain coverage (M5), land/ocean split (M6), biome region-size (area-weighted, M7), river flood integrity (M8, reads whichever river system `hydroRivers` selects), no-grass-under-water / sand-water-proximity / no-alpine-invasion (M9/M10/M11, real Node material-cascade checks), determinism + feature determinism (M12/M13), river→ocean connectivity (**M14 — monitor-only under the ribbon, GATING ≥99% under `--hydro`**), monotonic-descent self-consistency (**M15**), cross-region + cross-instance polyline determinism (**M16**), basin extent ≤ `HYDRO_HALO` (**M17**), per-biome land share (M19), desert dressing coherence (M20), `forceSingleBiome` shape-forcing (M21), fjord-flooding coherence (**M22**, CCR-WORLDGEN-PIPELINE-002 WS8-F1 — high-relief coastal river crossings must flood ≥90%, calibrated against measured 97.9-100%; low-relief crossings reported monitor-only), cliff-profile presence (**M23**, WS8-F2 — median land→seafloor transition width at high-relief coasts must be <0.70× the low-relief median, calibrated against measured 0.23-0.31; auto-skips if too few paired transects are found in the probe extent for a given seed). M22/M23 auto-defer (pass, non-gating) when `FJORD_DEPTH_SCALE`/`CLIFF_SHARPNESS_MAX` sit at their P1 neutral-staging values — both are gating at the shipped WS8 defaults. Bare **`--hydro`** flag forces `WORLD_CONFIG.hydroRivers` true for the M8/M14-M17 hydro-specific checks (default run stays ribbon-forced and just as fast as before hydro existed); extents for the river-adjacent metrics were widened to ±9.2K to avoid excessive cold hydro-region builds during sampling. Runs against the REAL extracted functions (`classifyBiome`, `reliefParam`, `terrainSurface`/`blendedHeight`, `riverFactorAt`/`buildHydroRegion` in the live flag mode) via `tools/lib/extract-terrain.mjs`'s `buildTerrainApi` (its `biomeDrivenTerrain`/`hydroRivers` options track the live `WORLD_CONFIG` defaults unless explicitly overridden). `node tools/biome-pipeline-checks.mjs --seeds=1337,42,9001 [--hydro] [--json]`; human table default, exit 0 iff all GATING metrics pass all seeds.
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
| `docs/live/mountain-overhaul-plan.md` | LIVE roadmap — Phase 1 SHIPPED (build .92); Phases 2-5 gated, not built |
| `docs/live/VoxEx_Bug_Consolidation_Tracker.md` | LIVE tracker |
| `docs/shipped/terrain-gen-audit.md`, `docs/shipped/terrain-gen-fixes.md` | SHIPPED (2026-07-02 audit + its 5-phase fix plan, implemented) |
| `docs/shipped/terrain-detail-plan.md`, `docs/shipped/terrain-architecture-plan.md`, `docs/shipped/terrain-climate-fields-plan.md`, `docs/shipped/terrain-implementation-guide.md` | SHIPPED — produced the `terrainSurface` rewrite |
| `docs/terrain-gen-order-report.md` | SHIPPED analysis (2026-07-12 pipeline snapshot + mismatch root-cause) — fed CCR-WORLDGEN-PIPELINE-001; the biome-driven pipeline it proposed is now the shipping default |
| `docs/historical/terrain-improvement-deep-dive.md`, `docs/historical/terrain-improvement-opportunities.md` | HISTORICAL (exploration that led to the plans above) |
| `docs/shipped/FireImplementation.md`, `docs/shipped/SETTINGS_MENU_CCR.md`, `docs/shipped/CHUNK-IMPLEMENTATION-PLAN.md`, `CCR-*.md` (in `CCR's/`) | SHIPPED as-built records |
| `docs/shipped/mobileControlsPlan.md` | SHIPPED (touch controls live) |
| `ui-mockups.html` + `CCR's/CCR-ui-overhaul.md` | LIVE — approved directions, not yet wired into voxEx.html |
| `futureFeatures.md` | LIVE roadmap / design intent (stays in repo root) |
| `docs/shipped/magicSystem.md` | SHIPPED on `main` — all 5 phases (M toggle, 4 spells, ICE block, touch casting); §15 is the as-built record with concrete deviations from the original design |
| `CCR's/CCR-MAGIC-006-spell-polish.md` | Phases A-C SHIPPED on `main` (true-aim range/power scaling, channeled Laser/Freeze, deterministic fireball + instant char + generic cracked variants); Phases D-E not yet built. Move to `CCR's/Finished/` once D/E land or are formally dropped |
| `docs/shipped/VoxEx_Issue_Cleanup_Report.md` | SHIPPED cleanup report (executed the findings below) |
| `docs/historical/VoxEx_Issue_Triage.md`, `docs/historical/VoxEx_Issue_Validation.md` | HISTORICAL — one-time GitHub issue snapshots (Jun 24/27 2026) superseded by the cleanup report above and the live issue tracker |
| `docs/historical/keyframe-audit.md`, `docs/historical/lightRefill-investigation.md`, `docs/historical/zombie-ai-investigation.md`, `docs/historical/tree-generation-bug-report.md` | HISTORICAL investigations |
| `docs/superpowers/` | HISTORICAL (pre-terrainSurface era — do not implement from) |

Non-core root `.md` files were reorganized into `docs/{live,shipped,historical}/` on 2026-07-09 to declutter repo root; only `CLAUDE.md`, `README.md`, and `futureFeatures.md` remain at top level. `CCR's/` is unaffected — it stays reserved for `CCR-`-prefixed change docs following the design → audit → implement → reconcile lifecycle described in [Change Workflow](#change-workflow-ccrs); none of the moved docs follow that convention.

> **Tail-restoration note (2026-07-12):** everything from the `terrain-implementation-guide` row to the end of this file was reconstructed from commit `e0c47fe` (the last intact blob) after discovering the Documentation Index had been truncated mid-token on disk AND in every commit since `6eb8a6d` (the CCR-LIGHT-004 session's mount incident, see `docs/agent-notes.md` §7). If a doc-status row here contradicts a newer doc, trust the doc.
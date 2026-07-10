> **Status: SHIPPED — findings implemented via terrain-gen-fixes.md (July 2026)** _(marked 2026-07-06; see CLAUDE.md Documentation Index)_

# VoxEx Terrain Generation Audit

**Date:** 2026-07-02 · **Build examined:** 2026-07-01.78 (VOXEX-CCR-TERRAIN-005 era) · **Scope:** terrain generation only — height/biome/river/noise core (voxEx.html ~38063–41939), tree generation (~5803–6336), `generateChunkData` pipeline, worker injection parity, `WorldPreviewRenderer`, and `tools/terrain-visualizer.html`.

**Method:** two independent full-read passes (terrain core; parity surfaces + trees), whole-file grep verification for every dead-code and cross-reference claim, field-by-field diffs of all hand-maintained config copies, and coordinator spot-verification of the highest-severity findings against the live source. Line numbers reference the current file and will drift with edits.

**Framing note:** `WORLD_CONFIG.useNewTerrain` defaults to `true` (line 5023). The live height path is `terrainSurface`/`computeSurfaceHeight`/`resolveBiome`; the biome-cell/bilinear/foothills/CDF system documented in CLAUDE.md is the legacy A/B path, still reachable via the flag. Ocean/river/cave/decoration passes are shared by both paths. Several findings below are about exactly this docs-vs-live-path gap.

---

## Verified clean (checked, no finding)

These checks came back clean and are worth recording so they aren't re-audited:

- **Worker BIOME_CONFIG (18757) vs main (5165): no drift.** All 7 biomes, every field (weight, roughness, amplitude, baseHeight, tags, full tree config). The worker copy is live, not dead — injected `foothillsHeightFunc` reads it.
- **Worker WORLD_DIMS (18724) vs main (7123): no drift** on chunkSize/chunkHeight/seaLevel/**yOffset** (the historic yOffset-64 bug remains fixed). One missing field — see PAR-9.
- **Worker TREE_CONFIG (18740) vs main (5404): no drift.**
- **Worker SeededRandom (18934) vs main (18482): identical algorithm**, including noise-seeding shuffle order; tree-hash `seededRandom` (5551 vs 19030) line-identical.
- **GRAD2D 16-direction gradient table byte-identical in all 3 copies** (main 21291, worker 18990, terrain-visualizer line 70). `_BIOME_CDF_TABLE`, `MOUNTAIN_REGION_FREQ/THRESHOLD`, FADE_LUT, fbm2D/fbmWithDomainWarp also match main/worker/visualizer.
- **Injection free-variable audit complete: no missing symbols.** Every free identifier of every injected terrain/tree function resolves in worker scope (injected, baked JSON, or worker-local). No references to `SETTINGS`/`window`/`logDebug`/DOM inside injected functions. All injected functions are `function` declarations (no arrow-toString pitfall); no duplicate declarations.
- **WorldPreviewRenderer: parity by construction.** `WorldPreviewNoise` was removed; the preview delegates to the game's own `blendedHeight()`/`getBiomeParams()` after `seedMainThreadNoise()`, and `updateWorldPreview` runs `applyTerrainSettings()` first.
- **Determinism:** no `Math.random()` anywhere in generation code 38063–39990 (hits at 41567/41609/41683 are runtime fire simulation, intentionally non-deterministic). Seed is always numeric; no `seed ||` falsy-zero hazards.
- **Bounds/passes:** cave-noise trilinear indexing in-bounds at all edges; `bedrockY = 0` gives exactly one intact bedrock layer caves cannot breach; y-loops all `0..chunkHeight-1`; `generateChunkData` GEN_PASS bits match work actually performed on all four paths (OPFS/IDB/worker/main); decoration pass is deterministic cross-chunk by design.
- **Biome CDF roll:** 5-biome roll (plains 2, hills 2, forests 2, swamp 1, longwoods 2, total 9) implemented correctly, matches main/worker; boundary values clamp safely.

---

## Findings — High severity

### [TER-3] Cave carving is water-blind — caves puncture ocean/river floors leaving unflooded holes
- **Severity:** High *(coordinator-verified)*
- **Location:** 39533–39570 `generateTerrainPass` cave section; `fillWaterPass` 39577–39589
- **Issue:** The subsurface-fade buffer only exists for `worldTopY > 80`; the lowland fade covers only `worldY` 30–50 and is skipped by `hasBreakthrough` columns. Ocean floors sit at Y 25–40. A floor at Y≤30 gets full cave density right up to and including its surface block (`caveCeiling = max(50, worldTopY-5)` ≥ 50 permits carving the floor block itself). `fillWaterPass` then fills only `worldTopY+1..seaLevel`, so carved cells stay AIR under a static water column — holes in the sea bed with dry cave pockets below.
- **Evidence:** `const caveCeiling = Math.max(fadeEnd, subsurfaceCeiling); if (worldY < caveCeiling) { ... id = AIR; }` with the fade applied only under `if (worldY >= fadeEnd && worldTopY > 80)`.
- **Expected vs actual:** caves should not open through submerged surfaces; actual: full-density carving through ocean floors below Y≈30 (and via breakthrough columns at 30–50).
- **Options:**
  1. Extend the `depthBelowSurface < 8` fade to all columns with `worldTopY < seaLevel` (small targeted fix).
  2. Suppress `hasBreakthrough` and near-surface carving when `worldTopY < seaLevel + 2` (stricter; kills underwater cave entrances entirely).
  3. Post-pass flood-fill carved cells below sea level with WATER (keeps underwater caves, adds a pass + cost).

### [TER-4] Triple evaluation of the full terrain height field per column
- **Severity:** High *(coordinator-verified; also acknowledged as perf debt in the TERRAIN-004b build banner)*
- **Location:** `precalculateTerrainCaches` 39126–39145; `blendedHeight` 38070–38155; `getRiverFactor` 38673–38743; `getPreRiverHeight` 38594–38608
- **Issue:** Per column, `precalculateTerrainCaches` calls `blendedHeight` (which internally calls `getRiverFactor`, which calls `getPreRiverHeight` = a second full surface eval) and then calls `getRiverFactor` *again* for `riverCache` (a third full surface eval). The surface eval is the most expensive operation in generation (`terrainSurface` ≈ 20+ noise calls). ~3× the fundamental cost on the hottest path — directly relevant to the known ~71 s spawn-generation bottleneck (CCR-PERF-013).
- **Evidence:** `heightCache[idx] = blendedHeight(gx, gz, seed); riverCache[idx] = getRiverFactor(gx, gz, seed);` while `blendedHeight` already contains `const r = riversOn ? getRiverFactor(gx, gz, seed) : 1.0;`
- **Expected vs actual:** one surface eval + one river eval per column; actual ≈3 surface evals + 2 river evals.
- **Options:**
  1. Compute `getRiverFactor` once in the cache loop and pass it into `blendedHeight` (or have `blendedHeight` return `{height, riverFactor}`) — biggest win; touches worker parity (injection picks it up, but see TER-21 for the hand-copied cache builder).
  2. Add a last-coords memo of `getPreRiverHeight(gx,gz)` (cheap, ugly).
  3. Thread a `preHeight` argument through `getRiverFactor`/`getPreRiverHeight` so callers that already know it skip recompute (moderate; keeps signatures explicit).

### [PAR-6] Main-thread `treeMaskCache` is never cleared and its key has no seed
- **Severity:** High *(coordinator-verified: `treeMaskCache.clear` exists only at 19244, inside the worker; main key is `cx + ',' + cz`)*
- **Location:** 17219 (`const treeMaskCache = new Map()`), 37791 (`getTreeMaskKey` — no seed); worker contrast at 19244
- **Issue:** The mask depends on the seed, but the main-thread cache key is `"cx,cz"` and nothing on the main thread ever clears the cache (`applyGenParams` clears only `biomeCellCache`). Load world A then world B in one session: any chunk the main thread generates (worker-timeout fallback via `generateDecorationsPass`) reuses world A's masks. The worker clears per generate, so main-generated and worker-generated chunks of the same world can disagree on tree placement → wrong trees, cross-source floating/missing canopies at seams. The seed-keyed `treePositionsCache` doesn't help — it reads through the poisoned mask cache, and retains pre-`applyGenParams` biome/profile object references.
- **Evidence:** worker: `treeMaskCache.clear(); generateTreesForChunk(...)`; main `generateDecorationsPass` (39595–39599) has no clear.
- **Expected vs actual:** same seed+coords → same masks everywhere; actual: main thread can serve masks from a previous world/params.
- **Options:**
  1. Include the seed in `getTreeMaskKey` (e.g. `` seed + ':' + cx + ',' + cz ``, matching `treePositionsCache`) — safest; also makes the worker's per-generate clears unnecessary.
  2. Clear `treeMaskCache` + `treePositionsCache` in `applyGenParams`/`seedMainThreadNoise` (fixes world switching; misses param-tweak-same-seed unless both cleared).
  3. Clear per `generateDecorationsPass` call like the worker (correct but recomputes 9 masks per chunk — slowest).

### [PAR-1] terrain-visualizer.html has no new-terrain pipeline while the game defaults to it
- **Severity:** High *(known gap — the TERRAIN-005 build banner admits it; listed because the tool is now actively misleading)*
- **Location:** `tools/terrain-visualizer.html` (~82–103) vs voxEx.html 5023 / 38282–38357
- **Issue:** The game generates via the climate+spline surface (`useNewTerrain: true`). The visualizer contains none of it (no `terrainSurface`, `resolveBiome`, `BIOME_PARAMS`, `SPLINE_*`) — it renders only the legacy bilinear pipeline. Every shape/biome readout it gives for the live game is wrong.
- **Evidence:** main: `let finalHeight = worldConfig.useNewTerrain ? computeSurfaceHeight(gx, gz) : sampleBiomeBilinearHeight(...)`; visualizer `blendedHeight` goes straight to the 4-corner bilinear sample, no flag.
- **Expected vs actual:** tool shows the terrain the game generates; it shows a pipeline the game no longer uses by default.
- **Options:**
  1. Port `terrainSurface`/`computeSurfaceHeight`/`resolveBiome` + the ~20 tuning constants into the visualizer (fixes now; hand-sync burden continues).
  2. Refactor the visualizer to load voxEx.html in an iframe via the `?test=1` seam and call the real functions (zero future drift; needs localhost).
  3. Add a build/test check that string-compares extracted function bodies and fails loudly (catches drift; doesn't fix this instance).

### [PAR-2] terrain-visualizer BIOME_CONFIG values stale (4 of 7 biomes differ)
- **Severity:** High
- **Location:** `tools/terrain-visualizer.html:82` vs voxEx.html 5165–5328
- **Issue:** Field-level drift despite the "MUST match voxEx.html BIOME_CONFIG exactly" comment. Visualizer → main: plains roughness `0.005`→`0.006`; forests `baseHeight 62, amplitude 15, roughness 0.008, tags ["forested"]` → `64, 12, 0.015, []`; swamp `amplitude 6, roughness 0.008` → `5, 0.025`; longwoods `baseHeight 62, amplitude 12, roughness 0.006, tags ["giant_trees"]` → `68, 25, 0.008, ["forested","giant_trees"]`. (hills, mountains, foothills match.)
- **Expected vs actual:** identical configs; 11 field values differ.
- **Options:**
  1. Copy current main values in (5-minute fix; drifts again).
  2. Emit the visualizer config from `buildBiomesFromConfig()` JSON pasted from the game console (semi-automated).
  3. Same iframe/`?test=1` delegation as PAR-1 option 2 (structural fix).

### [PAR-3] terrain-visualizer mountainsHeightFunc is the pre-TERRAIN-002/003 version
- **Severity:** High
- **Location:** `tools/terrain-visualizer.html:98` vs voxEx.html 38394–38546
- **Issue:** All CCR-TERRAIN-002/003 mountain smoothing re-tunes are missing — visualizer mountains are far more jagged/taller than the game's. Visualizer → main: sharpness `1.6/1.4`→`1.3/1.2`; peak boost `pow(...,3)*0.4`→`pow(...,2.0)*0.18`; ultra-peak `*1.5`→`*0.5`; jagged `0.12/0.08`→`0.035/0.025`; spire `*0.35`→`*0.15`; erosion `0.05/0.03/0.02`→`0.015/0.01/0.005`; no `MOUNTAIN_RELIEF_SCALE = 0.90`; main's `POST_JAGGED_SCALE = 0.40` block absent.
- **Expected vs actual:** identical mountain math; ~8 constants differ.
- **Options:**
  1. Re-copy the current function body.
  2. Extract mountain tuning into one exported constants object mirrored verbatim (smaller future diff surface).
  3. Iframe/test-seam delegation (PAR-1 option 2).

---

## Findings — Medium severity

### [TER-1] `BLOCKLIGHT_ATTENUATION` is configured but never applied by any propagation path
- **Severity:** Medium *(coordinator-verified: table written at 30118/30140, compared at 25991, never read in propagation)*
- **Location:** 39013–39083 `calculateBlockLight`; 25288–25299 `computeNeighborBlockLight`; config 4761
- **Issue:** Water is configured with `blocklightAttenuation: 2` (docs: "water attenuates blocklight 2/block"), but neither the full-recalc BFS nor the incremental path ever reads `BLOCKLIGHT_ATTENUATION`. Torch light propagates through water at 1/block like air. The table is dead weight.
- **Evidence:** `if (!IS_TRANSPARENT[nBlockId]) continue; ... if (propagated > blockLight[nIdx]) { blockLight[nIdx] = propagated;` — no attenuation term in either path.
- **Expected vs actual:** −(1+2)/block through water; actual −1/block.
- **Options:**
  1. Apply `BLOCKLIGHT_ATTENUATION[nBlockId]` in both BFS paths and bump `CURRENT_CACHE_VERSION` (correct; invalidates caches).
  2. Delete the table + config field and fix CLAUDE.md (honest; loses the feature).
  3. Leave code, fix docs only (cheapest; keeps a dead table).

### [TER-2] Incremental sunlight diverges from `calculateChunkSunlight` on semi-transparent blocks
- **Severity:** Medium
- **Location:** 38957–39002 (full-recalc phase-2 BFS) vs `computeNeighborSunlight` 25273–25287 and `computeDirectSkyLight` 25259–25272
- **Issue:** Full-recalc horizontal BFS subtracts `SUNLIGHT_ATTENUATION[nBlockId]` when light enters a leaf/water cell (total −2). The incremental `computeNeighborSunlight` only does `nLight − 1` with no target-cell attenuation. Conversely `computeDirectSkyLight` applies the target cell's own attenuation (leaf cell = 14) while phase-1 vertical stores the pre-attenuation value (15). Editing blocks near canopies/water re-lights those cells to different values than generation produced → visible light seams on modified chunks.
- **Evidence:** full recalc: `basePropagated - attenuation`; incremental: `const propagated = nLight > 1 ? nLight - 1 : 1;`
- **Expected vs actual:** identical light for identical block data via either path; actual ±1 divergence at leaves/water.
- **Options:**
  1. Add the attenuation term to `computeNeighborSunlight` / align `computeDirectSkyLight` with phase 1 (small, targeted).
  2. Extract one shared "propagate into cell" helper used by both paths (best long-term).
  3. Accept and document ±1 drift (free; seams remain).

### [TER-5] Mountain river-tunnel feature is effectively unreachable (dead in practice)
- **Severity:** Medium
- **Location:** `getRiverFactor` heightPenalty 38731–38736; tunnel punch 39509–39530; canyon→tunnel blend in `blendedHeight` 38140–38151
- **Issue:** `heightPenalty = smoothstep(66, 82, terrainHeight)` shrinks `effectiveWidth` below the 0.01 early-return for terrain ≥82. The tunnel branch requires `worldTopY > 80 && rf < 0.85`, but post-carve `worldTopY > 80` implies `rf ≈ 1.0` there. The elaborate tunnel-punch code and CANYON_FULL/CANYON_NONE blend serve a case the width fade now excludes.
- **Evidence:** `if (effectiveWidth < 0.01) return 1.0;` vs `if (worldTopY > 80 && id !== BEDROCK) { const rf = riverCache[idx]; if (rf < 0.85) { ... } }`
- **Expected vs actual:** rivers become covered tunnels through mountains (per comments); actual: rivers fade out above ~79, tunnels essentially never generate.
- **Options:**
  1. Exempt tunnel candidacy from heightPenalty (compute a second un-penalized factor for `rf`) — restores intent; adds one noise path.
  2. Delete the tunnel block + CANYON blend and simplify `blendedHeight` (~60 lines of near-dead code removed).
  3. Lower the tunnel gate to `worldTopY > 66` to match where rivers still exist (changes look; cheap).

### [TER-6] Dry river-bed band where partial canyon carve lands above sea level
- **Severity:** Medium
- **Location:** `blendedHeight` 38140–38151; `fillWaterPass` 39581
- **Issue:** For pre-carve heights ≈74–79, `tunnelMix` blending leaves the carved bed at 60–80 (e.g. pre 78 → post ≈63.6). `fillWaterPass` only fills columns with `worldTopY < seaLevel`, so the channel is a carved but dry ditch; rivers visibly dry up, then vanish (TER-5) — discontinuous channels crossing hills.
- **Evidence:** `finalHeight = lerpValue(canyoned, finalHeight, tunnelMix);` + `if (worldTopY >= WORLD_DIMS.seaLevel) continue;`
- **Expected vs actual:** continuous water source→sea; actual dry segments in the 74–79 band.
- **Options:**
  1. Snap fully-carved river centers (`r < ~0.3`) to `min(post, seaLevel−1)` so the centerline always floods (small; may notch hillsides).
  2. Align `CANYON_FULL/NONE` with the heightPenalty fade (66/82) so carving and water fade out together (tuning-only).
  3. Fill river columns with water up to a local river level instead of global sea level (real fix; significant work).

### [TER-7] Slope/aspect/lake analysis uses in-chunk neighbors only → material seams on chunk borders
- **Severity:** Medium
- **Location:** 39228–39281 `generateTerrainPass` slope analysis + `isLakeBed`
- **Issue:** `maxSlope`, aspect, and `isLakeBed` clamp neighbor sampling to the 16×16 heightCache. Border columns see 3–5 of 8 neighbors, systematically under-measuring slope. Cliff/steep/scree/snow-patch surface selection and lake placement change at chunk boundaries for identical world positions — 16-block-grid material seams on mountainsides; lakes truncated at chunk edges.
- **Evidence:** `if (nx >= 0 && nx < chunkSize && nz >= 0 && nz < chunkSize) { ... }` — out-of-chunk neighbors silently skipped.
- **Expected vs actual:** surface block choice a pure function of (gx,gz); actual depends on position within the chunk.
- **Options:**
  1. Build an 18×18 heightCache (+68 `blendedHeight` calls/chunk; exact fix — pairs well with TER-4's caching so the marginal cost is low).
  2. Call `blendedHeight` on demand for out-of-bounds neighbors (exact; worst-case ~300 extra evals).
  3. Accept and note it (free; seams stay).

### [TER-9] Legacy foothill system is 1 ring, not the documented 4 — and in-code comments still claim 4
- **Severity:** Medium (legacy path only — inert under default `useNewTerrain: true`)
- **Location:** `getBiomeCellDirect` 37903–37933; stale comments 38400–38402, 37922
- **Issue:** `MAX_FOOTHILL_RINGS = 1` with constant `ringFactor = 0.75`. CLAUDE.md ("4-ring Chebyshev, Ring1≈94%…Ring4≈5%, 256 blocks") and the comment inside `mountainsHeightFunc` describe a system that no longer exists. Comment at 37922 points to "worker copy at voxEx.html:19073", which is now the `__TREE_FUNCS__` marker — there is no worker copy (it's injected).
- **Evidence:** `const MAX_FOOTHILL_RINGS = 1; const t = (nearestMountainRing - 0.5) / MAX_FOOTHILL_RINGS; const ringFactor = Math.max(0.05, 1.0 - t * t);`
- **Expected vs actual:** 4-ring quadratic decay over 256 blocks; actual single 64-block ring at fixed 0.75.
- **Options:**
  1. Update CLAUDE.md + the two stale comments to describe the 1-ring reality (10-minute doc fix).
  2. Restore N-ring BFS if the gradual transition is wanted (real work; legacy path only).
  3. Delete the legacy path outright if the A/B toggle is retired (big cleanup; needs a decision).

### [TER-10] Documented river architecture (gradient descent, RiverNetworkCache LRU) does not exist
- **Severity:** Medium (documentation)
- **Location:** whole file (grep-verified); actual implementation `getRiverFactor` 38673
- **Issue:** CLAUDE.md describes gradient-descent tracing, max slope 1.0, max elevation 75, 8-block samples, and a `RiverNetworkCache` regional LRU. Grep finds `RiverNetworkCache` only in two changelog strings; no class, no tracer, no LRU. Rivers are a domain-warped `|noise| < width` ribbon. `getLocalSlope` (the "sample distance" vestige, default 4 not 8) has zero callers.
- **Expected vs actual:** docs describe a hydrological tracer; actual is a stationary noise field.
- **Options:**
  1. Rewrite the CLAUDE.md river section to match the ribbon implementation (cheap, honest).
  2. Remove the RiverNetworkCache bullets and dead `getLocalSlope` together (doc + dead-code cleanup).
  3. Actually build the traced-river system (large feature, not a fix).

### [TER-12] Per-block noise calls for column-constant values in the cave loop
- **Severity:** Medium (performance)
- **Location:** 39514 (`breakthroughNoise`), 39549 inside the `ly` loop of `generateTerrainPass`
- **Issue:** `breakthroughNoise = noise2D(gx*0.008+9001, gz*0.008-4242)` depends only on (gx,gz) but is evaluated for every solid block below `caveCeiling` — tens of thousands of redundant `noise2D` calls per chunk. Same for the tunnel `ceilingNoise` (near-dead per TER-5). Column-constant siblings (`surfaceNoise`, `patchNoise`) are correctly hoisted.
- **Expected vs actual:** 256 evaluations/chunk; actual up to ~50–250×256.
- **Options:**
  1. Hoist both to the per-column block above the `ly` loop (trivial; worker re-injection picks it up automatically — but note TER-21).
  2. Fold into `precalculateTerrainCaches` as another Float32Array (more uniform; slightly more code).
  3. Leave (measurable waste on the documented main-thread-bound path).

### [TER-13] New-terrain biome/climate fields recomputed per column with no caching
- **Severity:** Medium (performance)
- **Location:** `resolveBiome` 38344–38358; `precalculateTerrainCaches` 39139–39141
- **Issue:** Under default new terrain, `getBiomeParams` → `resolveBiome` computes temperature+humidity+continentalness+erosion+peaksValleys (~20 fbm-octave noise calls) per column, uncached (legacy path had `biomeCellCache`; new path has none). `tempCache[idx] = temperature(gx, gz)` then recomputes temperature a second time for the same column. Biomes are cosmetic-only yet cost a large fraction of a surface eval ×256/chunk, plus tree-mask code calls `getBiomeParams` again per candidate.
- **Evidence:** `biomeCache[idx] = getBiomeParams(gx, gz); ... if (tempCache) tempCache[idx] = temperature(gx, gz);`
- **Expected vs actual:** climate sampled once per column (or once per 4×4 cell — all fields ≤0.0018 frequency, essentially constant across 16 blocks); actual ~2× per column plus per-block re-lookups downstream.
- **Options:**
  1. Have `resolveBiome` return `{biome, T}` and reuse for tempCache (trivial dedupe).
  2. Sample climate on a 4×4 grid + bilinear like cave noise (~16× fewer calls; imperceptible at those frequencies).
  3. Add a coarse (gx>>4, gz>>4)-keyed biome memo mirroring `biomeCellCache` (moderate).

### [PAR-4] terrain-visualizer ocean/river layer stale: old thresholds, no domain warp, no river carve
- **Severity:** Medium
- **Location:** `tools/terrain-visualizer.html:100,103` vs voxEx.html 38644–38646, 38673–38813, 38098–38152
- **Issue:** (a) visualizer `getOceanFactor` uses hardcoded `-0.3/-0.1` vs main `OCEAN_THRESHOLD_DEEP=-0.348 / OCEAN_THRESHOLD_SHALLOW=-0.116` and lacks the two-octave `OCEAN_WARP_*` coordinate warp; (b) visualizer `blendedHeight` has no river/delta/canyon carving at all while main carves rivers into every height.
- **Expected vs actual:** same water bodies; visualizer shows differently-shaped oceans and no rivers.
- **Options:**
  1. Port `getRiverFactor`/`getDeltaFingerFactor`/`getRiverDepth` + warp constants.
  2. At minimum sync the two thresholds and add a "rivers not modeled" banner to the tool (honest, cheap).
  3. Iframe/test-seam delegation (PAR-1 option 2).

### [PAR-5] terrain-visualizer biome selection uses the removed cell-index algorithm
- **Severity:** Medium
- **Location:** `tools/terrain-visualizer.html:89–91` vs voxEx.html 37861–38036
- **Issue:** Visualizer picks biomes via `noise2D(cx*0.1+1000, ...)` on cell indices, normalizes by a `TOTAL_BIOME_WEIGHT` that includes mountains, and misses main's `−0.5` recentring and `biomeSizeMultiplier`. Main samples world-coordinate noise with `biomeFrequency` + seed offsets against a mountains-excluded `biomeTable`. This is the exact mismatched selector the worker template's tombstone comment (19008–19015) says was removed for causing per-chunk cliffs.
- **Expected vs actual:** same biome map as game; visualizer's map is unrelated to the game's for the same seed.
- **Options:**
  1. Copy `getRawBiomeParams`/`getRawBiomeCellDirect`/`getBiomeCellDirect`/`getBiomeParams` verbatim.
  2. Iframe delegation.
  3. Drop biome coloring from the tool until synced (prevents false confidence).

### [PAR-7] Neighbor-tree trust asymmetry: chunk-data-dependent checks vs deterministic canopy placement
- **Severity:** Medium
- **Location:** 5867–5937 (`generateTreesForChunk` own-chunk vs neighbor branch); worker 19022–19024 (`const chunks = new Map()` — always empty)
- **Issue:** A tree's final go/no-go includes checks that read actual chunk data (surface block ∈ {GRASS, DIRT} — fails on `detailNoise>0.8` STONE patches and alpine GRAVEL bands; cave-roof `belowId === AIR`; trunk-space). Neighbor chunks can't run these, so they "trust the deterministic generator" and place canopy leaves; when the owning chunk rejects the trunk, those leaves float. The main thread partially mitigates by scanning the source chunk for a log if loaded; the worker's `chunks` map is permanently empty so it always trusts. Consequences: floating leaf clusters at seams; the same chunk generated via worker vs main fallback can contain different blocks (a genuine parity hole); output depends on generation order.
- **Evidence:** `// If sourceChunk is undefined, trust the deterministic generator` vs `const groundId = get(...); if (!isValidTreeGround(groundId, allowedGroundBlocks)) groundOk = false;`
- **Expected vs actual:** canopy placed iff trunk placed; actual: canopy can be placed for rejected trunks.
- **Options:**
  1. Make ground/cave rejection deterministic — reproduce the surface-block noise decision and cave-noise sample at (gx, groundY) inside `wouldHaveValidTree`/`isTreeSiteViable` so all chunks reach the same verdict (best parity; duplicates a slice of generateTerrainPass logic).
  2. Drop the data-dependent checks and let trees stand on stone/over caves (simplest; changes look).
  3. Post-pass leaf-orphan sweep when the source chunk later generates and rejects (fixes visuals late; extra rebuilds).

### [PAR-8] Canopy overlap cull radius smaller than actual leaf reach → clipped canopies at chunk borders
- **Severity:** Medium *(coordinator-verified: cull uses `tree.canopyRadius`; `forEachCanopyVoxel` scans `baseRadius + 2` with branch reach `+1.5`)*
- **Location:** 5808, 5818–5832 (cull); 6062–6117 (`forEachCanopyVoxel` reach)
- **Issue:** The 9-chunk collection culls trees by `tree.canopyRadius` (longwoods: 6), but leaves are emitted out to ~radius+2 (noise +1, branch zone `dist <= effectiveRadius + 1.5`). A tree whose center sits 7–8 blocks outside a chunk is culled from that chunk's pass, so its outermost leaves inside the chunk are silently dropped: canopies flat-cut at the seam. Deterministic on both threads — purely a visual correctness bug. Ironically, the correct bound `MAX_CANOPY_RADIUS = 8` is declared in the same function and never used (as is module-level `MAX_TREE_CANOPY_RADIUS`).
- **Evidence:** `const canopyMinX = tree.gx - tree.canopyRadius;` vs `const scanRadius = baseRadius + 2;`
- **Expected vs actual:** cull bound ≥ max leaf reach (radius+2); actual: cull bound = radius.
- **Options:**
  1. Cull with `tree.canopyRadius + 2` (one-line; tiny extra work).
  2. Use the dead `MAX_CANOPY_RADIUS`/`MAX_TREE_CANOPY_RADIUS` (self-documenting; slightly over-broad).
  3. Have `forEachCanopyVoxel` clamp emission to `canopy.radius` (changes tree shapes; not recommended).

---

## Findings — Low severity

### [TER-8] Alpine lakes are uncontained floating water slabs
- **Severity:** Low
- **Location:** 39276–39281, 39496–39498
- **Issue:** `isLakeBed` places WATER at `worldTopY+1..worldTopY+3` per column with no basin check. Adjacent non-lake or lower columns leave lake water with exposed vertical faces / floating edges; with TER-7, lakes also truncate at chunk borders.
- **Evidence:** `if (isLakeBed && worldY > worldTopY && worldY <= worldTopY + 3) { id = WATER; }`
- **Expected vs actual:** water in a depression with a solid rim; actual free-standing 3-block water columns wherever the noise gate passes.
- **Options:**
  1. Fill only to `min(worldTopY+3, minNeighborSurface)` so water never exceeds surrounding ground (needs neighbor heights; pairs with the TER-7 fix).
  2. Carve a 1–2 block basin instead of stacking water above the surface (changes terrain; simplest visual fix).
  3. Remove alpine lakes until a proper basin detector exists.

### [TER-11] Dead code cluster: non-indexed face path, `getLocalSlope`, `findSurfaceY`, `hasNearbyTree`
- **Severity:** Low
- **Location:** `addFace` 40583, `addFaceWater` 40599, `addFaceSimplified` 40636, `writeFaceVertices` 40251, `writeFaceColors` 40270, `writeFaceColorsWater` 40424, `writeFaceUVs` 40436; `getLocalSlope` 38618; `findSurfaceY` 38171; `hasNearbyTree` 38180
- **Issue:** Whole-file grep confirms zero call sites for the entire 6-vertex non-indexed face path (only the `*Indexed` variants are called). `getLocalSlope` has no callers yet is still injected into every worker (`terrainFuncs` list, 19593) — dead bytes in worker source. `findSurfaceY` and `hasNearbyTree` have no callers.
- **Expected vs actual:** single mesher path; actual ~250 lines of unreachable duplicate face-writing code plus a dead worker injection.
- **Options:**
  1. Delete the non-indexed path + `findSurfaceY`/`hasNearbyTree`, and drop `getLocalSlope` from `terrainFuncs` (clean; run voxex-tests after).
  2. Tombstone-comment them per project convention (halfway).
  3. Keep as reference (costs ~250 lines of reader confusion).

### [TER-14] `getBiomeCellDirect` fallback references a nonexistent main-thread global `biomes`
- **Severity:** Low (latent landmine)
- **Location:** 37917
- **Issue:** `biomeByName.get('mountain_foothills') || biomes.find(...)` — no module-scope `biomes` exists on the main thread (the worker defines `const biomes = __biomes` at injection). If `biomeByName` ever lacked the key, the main thread throws ReferenceError instead of falling back. Unreachable today, and a silent main/worker asymmetry inside an injected function.
- **Expected vs actual:** working fallback on both threads; actual fallback only exists in the worker.
- **Options:**
  1. Drop the `|| ...` and rely on `biomeByName` alone (simplest; both threads consistent).
  2. Define a main-thread `biomes` alias next to `biomeCellCache` mirroring the worker (keeps fallback).
  3. Leave with a comment (risk stays).

### [TER-15] Biome weight config diverges from docs and is partly dead
- **Severity:** Low
- **Location:** 5222 (`mountains: weight: 0.5`); `rebuildBiomeTable` 37777; worker 18833–18835
- **Issue:** CLAUDE.md says mountains weight 1; config says 0.5 — and it doesn't matter, because `rebuildBiomeTable` excludes mountains (and foothills) from the roll (region mask places them), so `mountains.weight` is dead config. Someone already tuned this dead knob ("Lowered after CDF transform"). The worker's `BIOME_NAMES`/`BIOME_WEIGHTS`/`TOTAL_BIOME_WEIGHT` (18833–18835) are defined and never referenced — dead worker code.
- **Expected vs actual:** docs 2/2/2/1/1/2 with mountains in the roll; actual mountains mask-placed, weight ignored.
- **Options:**
  1. Delete `mountains.weight` + the worker's dead BIOME_WEIGHTS trio and fix the doc table (clean).
  2. Doc-only fix noting mountains' weight is unused (fast).
  3. Leave (confuses the next tuner).

### [TER-21] `precalculateTerrainCaches` is a hand-maintained duplicate in the worker (not injected)
- **Severity:** Low (drift risk)
- **Location:** main 39126–39145; worker template 19088–19108
- **Issue:** Unlike the height/tree functions, the terrain-cache builder is copy-pasted into the worker template. The copies are currently identical, but any change (e.g. the TER-4/TER-12/TER-13 optimizations) must be made twice — exactly the drift class the `__TERRAIN_FUNCS__` machinery was built to eliminate (cf. the yOffset incident). It is not in the CLAUDE.md hand-maintained-copies checklist.
- **Expected vs actual:** single-source; actual dual-maintenance with no checklist entry.
- **Options:**
  1. Add `precalculateTerrainCaches` to an injected list (its free vars are all already injected — verified).
  2. Add it to the CLAUDE.md hand-maintained-copies checklist (cheap guard).
  3. Leave undocumented (silent drift risk).

### [TER-22] `isLightingDataValid` variation check compares every sample to index 0 and passes trivially
- **Severity:** Low
- **Location:** 39628–39679
- **Issue:** `prevSky` is initialized to `skyLight[0]` and never updated, so `hasVariation` means "any sample differs from sample 0", and both rejection rules are gated on `prevSky === 15`. Index 0 (bottom-southwest corner, almost always light 1) means validation accepts nearly any garbage in 0–15. Only the >15 range check has teeth.
- **Expected vs actual:** heuristic that catches uninitialized/corrupt lighting; actual only catches "uniform 15" and ">15".
- **Options:**
  1. Track min/max across samples and reject uniform-anything (stronger, still cheap).
  2. Also sample one known-sky index (top layer must be 15 in a generated chunk).
  3. Accept as-is — cache-version bumps are the real safety net.

### [PAR-9] Worker WORLD_DIMS missing `worldHeight` field (latent)
- **Severity:** Low
- **Location:** worker 18724–18737 vs main 7123–7129
- **Issue:** Main has `worldHeight: 320`; the worker copy omits it. Nothing injected reads it today, but any future injected function touching it gets `undefined` → NaN heights, silently.
- **Evidence:** main `{ chunkSize: 16, chunkHeight: 320, yOffset: 0, seaLevel: 60, worldHeight: 320 }`; worker `{ chunkSize: 16, chunkHeight: 320, seaLevel: 60, yOffset: 0 }`.
- **Options:**
  1. Add `worldHeight: 320` to the worker copy (trivial).
  2. Bake WORLD_DIMS via `JSON.stringify(WORLD_DIMS)` in buildChunkWorkerCode (kills this drift class; relocates the yOffset warning comment).
  3. Add a parity assertion in voxex-tests comparing the two objects.

### [PAR-10] Marker-failure fallback message lies; failure mode is a delayed hard throw
- **Severity:** Low
- **Location:** 19702–19705, 19737–19740, 19789–19792 (buildChunkWorkerCode); 19078–19083 (marker block)
- **Issue:** On missing markers the code logs "using static code" and returns the un-injected template — but the static bodies were removed, so the worker compiles and then throws ReferenceError on the first terrain call. The warning actively misdirects debugging; a single missing marker also yields a partially-injected mixed state.
- **Expected vs actual:** fail loudly at build; actual: warn with wrong message, break later.
- **Options:**
  1. `throw new Error('[WorkerPool] marker X missing')` — markers live in the same file; missing means the build is broken.
  2. Fix the message + fall back to the main-thread generation path.
  3. Add a voxex-tests assertion that built worker code contains `function blendedHeight`.

---

## Findings — Nitpicks

### [TER-16] `_amplitudeScale` is a knob that is read but never set
- **Location:** 38534 `mountainsHeightFunc` — `biome._amplitudeScale ?? 1.0`; nothing ever assigns it.
- **Options:** 1) Remove the line and inline the multiply. 2) Wire it up if width-based amplitude scaling is wanted. 3) Keep as an extension point with a comment saying it's unset.

### [TER-17] Stale water comment in `calculateChunkSunlight` contradicts actual attenuation
- **Location:** 38952 — comment says water passes light unchanged; WATER has `sunlightAttenuation: 1`. Code right, comment wrong.
- **Options:** 1) Fix the comment. 2) Also update the 38894–38902 header block (mentions leaves only). 3) Leave (invites a future "optimization" that breaks water light).

### [TER-18] Sunlight BFS attenuation fallback keeps full value instead of clamping
- **Location:** 38989–38991 — when `basePropagated <= attenuation`, light stays unreduced rather than dropping to 1. Unreachable today; becomes wrong the day any transparent block gets attenuation ≥ 2 (e.g. implementing TER-1).
- **Options:** 1) `basePropagated > attenuation ? basePropagated - attenuation : 1` (semantics-identical today). 2) Warning comment. 3) Leave.

### [TER-19] Hand-inlined smoothstep and magic numbers where a named helper/constants exist
- **Location:** 38103, 38124, 38521, 38739, 38771, 38809 — `t*t*(3-2*t)` inlined ~6 times though `smoothstep` (38227) exists and is injected; tunnel constants `0.85`/`6`/`+4` unnamed.
- **Options:** 1) Replace inline hermites with a `smoothstep01(t)` helper (injected; verify markers pick it up). 2) Name only the tunnel constants (smallest diff). 3) Leave.

### [TER-20] Small `generateTerrainPass` hygiene issues
- **Location:** 39175 (unused `data` param), 39510 (`riverCache[idx]` re-read where `riverFactor` is in scope), 38904/39013 (`chunkSize` params vs hardcoded `<<4`/`<<8` — only correct for size 16).
- **Options:** 1) Drop `data`, reuse `riverFactor`, derive shifts from `chunkSize` or remove the param with a `// 16 only` note. 2) Comments only. 3) Leave.

### [TER-23] `getMergeKey` JSDoc documents the pre-Phase-3 27-bit layout
- **Location:** 40211–40234 — `@returns` says `(blockId << 11) | (light << 8) | ...`; body implements `(blockId << 10) | (damp & 3) << 8 | AO` with light removed (decoder at 41106 agrees with the body).
- **Options:** 1) Fix the `@returns` line. 2) Also add the missing `damp` `@param`. 3) Leave (next reader decodes with the wrong shift).

### [PAR-11] Dead code in tree/worker areas (all grep-verified single-reference)
- `forEachTrunkBranch` (6253) and `isInTrunkFootprint` (6238): never called — so `trunk.branchStart/branchChance/branchLength/taperTop` config (5414–5417) is inert; trunk branches can never generate. NOTE: if you ever wire `forEachTrunkBranch` in, it is NOT in the `treeFuncs` injection list (19757) — adding a call without updating the list breaks the worker.
- `MAX_TREE_CANOPY_RADIUS` (6306) and `MAX_CANOPY_RADIUS` (5808): declared, never read (see PAR-8 — they're the correct cull bound).
- `treeNoise` (21339), `hasNearbyTree` (38180): defined, never called.
- `generateTreesForChunk` 5804: `const { heightCache, riverCache } = caches;` — both unused since the deterministic-groundY refactor.
- Worker `BIOME_NAMES/BIOME_WEIGHTS/TOTAL_BIOME_WEIGHT` (18833–18835): leftovers of the removed worker-static biome selector.
- `BIOME_CONFIG[*].heightFunc` / `decorateColumn` fields (and `BIOME_DEFAULTS.heightFunc`): zero reads — dispatch goes exclusively through `HEIGHT_FUNCS` (38574). These function-valued fields are also silently dropped by the worker's `JSON.stringify` bake (works today; a future non-JSON-safe config value, e.g. a `Set`, would silently become `{}` in the worker — worth a comment).
- `WORLD_CONFIG.noise.octaves: 128` (5026): never read (all fbm call sites pass explicit octave counts); misleading magic number.
- **Options:** 1) Delete with tombstones per project convention. 2) Wire in the ones that represent wanted features (trunk branches) + update injection lists. 3) Annotate each as dead to stop re-drift.

### [PAR-12] Per-candidate allocations and hoistable work in canopy/tree hot loops
- **Location:** 6023–6235 (`forEachCanopyVoxel`), 5733–5748 (spacing loop)
- **Issue:** Per tree per chunk (×9 chunk passes, main + worker): string-keyed `candidates` Map with template-literal keys, `key.split(',').map(Number)` re-parsing in three passes, `faceOffsets`/`extendedOffsets` arrays re-allocated every call, inner closures re-created per call — contrary to the project's "no allocations/closures in hot paths" rule. Spacing loop uses `Math.sqrt` where a `distSq` compare would do; `wouldHaveValidTree` (full blendedHeight+getRiverFactor stack) re-evaluated per neighbor with no memo.
- **Options:** 1) Hoist offset tables to module scope + packed-int keys (`(dx+16) | (dz+16)<<6 | y<<12`) — biggest win; ships to worker automatically via injection. 2) Only hoist the offset arrays (safe, small win). 3) Leave (tree gen isn't per-frame; measure first).

### [PAR-13] Stale cross-reference comments and CLAUDE.md drift
- voxEx.html 37922: "Must match the worker copy at voxEx.html:19073" — 19073 is now a marker; the worker copy no longer exists (injected).
- CLAUDE.md: lists `WorldPreviewNoise` class (removed); describes 4-ring foothills (code: 1 ring — TER-9); mountains weight 1 (config: 0.5, and dead — TER-15); river tracer + RiverNetworkCache (don't exist — TER-10); and does not mention that `useNewTerrain: true` makes the entire documented biome/foothill/mountain height pipeline the **non-default** path.
- **Options:** 1) One consolidated docs pass over CLAUDE.md's terrain sections + the two stale in-file comments. 2) Replace absolute line references in comments with marker names. 3) Leave (risk: a future agent "fixes" code toward stale docs).

---

## Prioritized recommendations

1. **Correctness first:** TER-3 (underwater cave holes), PAR-6 (tree mask cache — seed the key), PAR-8 (canopy cull +2, one line), TER-2/TER-1 (lighting path divergence + dead attenuation table — decide feature vs delete, one cache-version bump covers both).
2. **Performance second:** TER-4 (eliminate the 3× surface eval — largest single lever on the known ~71 s spawn-gen cost), then TER-12 and TER-13 as smaller follow-ups; do TER-21 (inject `precalculateTerrainCaches`) *before* these so the optimizations land single-source.
3. **Tooling:** PAR-1/2/3/4/5 are one decision — either port the new pipeline into terrain-visualizer.html or convert it to the iframe/`?test=1` delegation model. Delegation ends this entire class of drift permanently.
4. **Docs pass:** TER-9/10/15/17/23 + PAR-13 in one commit — CLAUDE.md's terrain sections currently describe a system that is neither the live path nor, in places, any path.
5. **Dead-code sweep:** TER-11 + PAR-11 (+TER-5's tunnel block if you choose deletion) — roughly 350+ lines removable; run tools/voxex-tests.html after.

## Overall health

The terrain core's math is sound where it counts: generation is deterministic, seeds are handled safely, bounds are correct, and — notably — the worker-injection machinery is genuinely working, with all four hand-maintained worker config surfaces currently drift-free and every injected function's free variables resolving correctly in worker scope. The real problems cluster in three places: water interaction (caves and rivers both mishandle the above/below-sea-level boundary), caching (a stale, unseeded tree-mask cache is the one live main-vs-worker divergence), and truth drift (terrain-visualizer.html is a full generation behind the game, and CLAUDE.md documents the non-default legacy path as if it were live). A documentation-and-tooling pass is worth as much here as any single code fix.

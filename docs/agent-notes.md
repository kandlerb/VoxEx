# VoxEx Agent Notes — hard-won knowledge

> **Status: LIVE — maintained.** Read alongside `CLAUDE.md`. CLAUDE.md holds the
> rules, registries, and checklists; this file holds the *why* — failed
> approaches, debugging lessons, and as-built subsystem notes that would
> otherwise be re-learned the expensive way. When a change invalidates a note
> here, update it in the same commit.

---

## 1. Do-not-retry ledger

Approaches that were tried, failed for structural reasons, and must not be
re-attempted without new information. Each entry says *why* so a future agent
can tell whether circumstances actually changed.

| Approach | Verdict | Why it fails |
|---|---|---|
| **Screen-space refraction for glass** (retired build 2026-06-21.4) | Never retry | View-space refraction xy used as a screen offset slides with camera rotation; depth term amplifies offsets off-screen; clamped UVs smear grazing pixels into gray squares; never depth-correct → parallax see-around. Structural to screen-space — tuning can't fix it. If glass bend is ever wanted: `MeshPhysicalMaterial` transmission (heavy) or leave glass plain. WATER refraction survives because water is viewed near-planar from above. |
| **Deferring chunk compression to post-entry** (CCR-PERF-013 Lever 2, reverted) | Never retry as-is | `batchSaveChunksToCache` compresses ALL chunks in one synchronous loop — moving it from behind the loading screen to after world-entry produced one ~8.7 s freeze. Compression is unavoidable main-thread CPU unless moved OFF-thread; the real fix is compressing in the OPFS `ChunkDiskStorage` worker (Lever 2 Option B, not yet built). |
| **Non-interpolating LUTs for continuous fields** (FADE_LUT, deleted CCR-TERRAIN-006) | Never retry | A 256-entry LUT without lerp turns every noise fade into a stair function → axis-aligned strips of 1–4 blocks across ALL terrain. Invisible while other noise masks it; dominant once the surface is smooth. The exact polynomial also benchmarked FASTER than the LUT on modern JITs. Rule is in CLAUDE.md Performance Tips. |
| **Gradient/flow-aligned frames for terrain features** (gullies, rejected in prototype) | Never retry | Any frame aligned to the height gradient degenerates at gradient zeros — which are exactly the ridgelines and valley floors you care about. Even a smoothed octave-0 frame checkerboards. Swiss-style gradient-*warp* turbulence works (offset, not frame); gradient-aligned *features* do not. |
| **Standalone gully/drainage carve from one noise field** (rejected, CCR-SURF-002) | Never retry | Zero-lines of a single 2D noise field form closed loops → "worm-ring" canyons, not dendritic drainage. Use swiss turbulence (shipped, Phase 1) or a real flow sim (mountain-overhaul-plan Phase 5, spike-gated). |
| **Pure Y-band shoreline materials** (fixed CCR-TERRAIN-011) | Never retry | Any "sand if y ≈ sea level" rule paints inland low plains as sand fields. Shoreline materials must be WATER-PROXIMITY gated (`oceanFactor`/`riverFactor`), with dithered edges — never a bare height band. User rule: "sand should only spawn near river banks and beaches along water." |
| **Global always-on banded meshing** (made lazy, Phase 3.5) | Don't re-enable eagerly | `meshProfile()` A/B showed always-on banding ~doubled streaming mesh load (146 vs 81 ms/s) — first builds pay banding's 4× overhead for zero benefit. Banding only helps EDITS, so chunks band lazily on first edit (`markChunkBanded`). `setEagerBanding(true)` exists for A/B only. |
| **World-axis camera snap for soft shadows** (fixed build 2026-06-20.14) | Never retry | Snapping the shadow camera on world axes can't align with the LIGHT-space texel grid (rotated by the sun) — sub-texel swim persists. Snap in the light basis (see §3 Shadows). Also: re-rounding the light POSITION after computing the snapped target re-introduces the swim. |
| **Render-time per-block damage overlay** (rejected, CCR-MAGIC-006 C3) | Never retry | Meshing is one atlas tile per face with no per-block metadata layer — there is no seam to inject a "this specific block instance is damaged" overlay at render time without inventing a whole new metadata system. The generic `CRACKED_` mechanism moves the same idea to TEXTURE-GEN time (one `drawCrackOverlay` stamp, baked into 3 dedicated block IDs at `initTextures` time) + a plain block-ID swap at scar sites — same structural wall that forced FIRE's neighbor-derived orientation instead of a per-instance state. |
| **Symmetric hi-frequency detail added on top of terrainSurface** (measured, CCR-WORLDGEN-PIPELINE-002 WS1) | Never retry | Tried as a terracing fix: adding a relief-scaled fine noise term on top of the existing fractal (`terrainSurface(x,z) + reliefParam(x,z)*D*noise(x*fHi,z*fHi)`). Measured NO CHANGE to `wideTerrace` (tread-area fraction) at any tested amplitude (±0.005) — a flat quantization step floors to the same integer regardless of what smooth sub-block detail rides on top of it; the extra octave doesn't change which samples land on the SAME floor value. Root lesson (WS1's core finding): *tread area on a slope is conserved under quantization of any equally-smooth field — only a steeper gradient or a coordinate-space warp that breaks contour straightness reduces the visual.* |
| **Dither-before-floor for terracing** (measured, CCR-WORLDGEN-PIPELINE-002 WS1) | Never retry | Tried adding sub-block noise before `Math.floor()` to break up flat runs (ordered/random dither, Bayer-style). Measured SLIGHTLY WORSE than baseline on `wideTerrace` — dithering a smooth slope doesn't remove the flooring artifact, it just randomizes WHICH neighbor a tread cell rounds to, occasionally creating MORE apparent tread-cluster boundaries (visually noisier, not less terraced). Floor-adjacent dither is a fix for banding in continuous-value contexts (e.g. color gradients), not for INTEGER voxel height quantization. |
| **Reducing fractal amplitude/face-contrast to fight terracing** (measured, CCR-WORLDGEN-PIPELINE-002 WS1) | Never retry | Counter-intuitive but measured: LOWERING the fractal amplitude/gain (the opposite of WS1's adopted "increase contrast" lever) BACKFIRES — `wideTerrace` measured 0.22 baseline → 0.33-0.41 (worse) at reduced-amplitude settings. A gentler surface has MORE of its area sitting near any given integer floor value (shallower local gradient = wider flat-looking bands after flooring), so reducing amplitude increases tread area rather than shrinking it. The two real levers are the OPPOSITE direction: steeper gradient (`k=1.15-1.30` face-contrast increase, OD1 fallback) or a contour-breaking domain warp (WS1's adopted-for-measurement lever) — never amplitude-down. |
| **Map-based cache eviction via `keys().next().value`** (fixed, CCR-WORLDGEN-PIPELINE-002 WS6/Bump B, `hydroRegionCache`) | Not an LRU — don't assume it is | `keys().next().value` evicts in INSERTION order, i.e. a FIFO, not a recency-based LRU. Under a query working set that approaches the cache's cap, a FIFO thrashes: still-hot entries get evicted while genuinely-cold ones survive, because eviction order tracks "when inserted" not "when last read." Measured cost of the mistake: ~25ms per unnecessary rebuild on a region cache, on nearly every query once the working set neared `HYDRO_REGION_CACHE_CAP=64`. Fix is cheap and general: on every cache HIT, `delete` the key and `.set()` it again — a plain `Map`'s insertion order then doubles as recency order, giving a true LRU with no extra data structure. Apply this to ANY bounded module-scope `Map` cache that assumes "oldest key = coldest key" (`treePositionsCache`/`biomeCellCache` already do the distance-eviction thing correctly; a straight `keys().next()` evictor anywhere else should be treated as suspect). |
| **String-templated keys in per-column hot-path caches/indexes** (fixed, CCR-WORLDGEN-PIPELINE-002 WS6/Bump B, `riverFactorAt`'s segment bucket index + region-neighborhood memo) | Avoid — use numeric packed keys | Building a template-literal key (e.g. `` `${bx},${bz}` ``) per lookup was measured to itself dominate `riverFactorAt`'s warm per-call cost once real production segment density (~450 segs/region, ~10x the prototype's ~45) was exercised — the string allocation/hashing overhead was bigger than the actual work being cached. Switching to a numeric packed key (`bx*2097152+bz`, one multiply-add, no allocation) was one of three steps that took the function from ~30x to 1.54x the baseline cost it was gated against. Lesson: in any hot path doing thousands of Map lookups per chunk/column, prefer a single packed integer key over a template-literal string key — the string path can dominate even when the "real" computation being memoized is itself cheap. |
| **Trusting a small-N prototype's measured cost/behavior as a production gate without re-measuring at real scale** (found, CCR-WORLDGEN-PIPELINE-002 WS6/Bump B) | Re-measure at production density before declaring a gate met | WS6's P0 prototype measured `riverFactorAt` cost and M10 sand-water-proximity against ~45 segments/region and small (~18-column) samples respectively. Both looked fine at that scale and both broke once the real system ran at production density: per-call cost was ~30x over budget at ~450 segs/region (a 10x density jump the prototype never exercised), and M10 flipped from "83% pass" (18 cols, noise) to "a genuine 157-column material bug" once the sample grew to 1210 columns. Neither failure was a coding bug in the port — both were the prototype's small scale silently hiding a real cost/behavior curve that only shows up at production density/sample size. Lesson: treat a prototype's measured numbers as a DIRECTION, not a proof, and re-run the same measurement at real generation scale (real segment density, real sample sizes) before treating a CCR's prototype-derived gate as satisfied. |

## 2. Three.js / browser gotchas (version-specific, verified r160)

- **`customDepthMaterial.alphaTest` is IGNORED**: `WebGLShadowMap.getDepthMaterial()`
  overwrites the depth material's `alphaTest`/`map`/`alphaMap` with the MESH's
  own material values every shadow draw. For cutout shadows the casting mesh's
  material must itself carry `alphaTest > 0` (strip `#include <alphatest_fragment>`
  from its color pass if the color pass must not discard). Glass shadows broke
  on exactly this; see `glassDepthMaterial` (separate instance — terrain's
  per-frame `alphaTest = 0.1` write would leak onto a shared one).
- **Depth materials don't run your tiling shader**: the chunk material repeats
  one atlas tile per block in-shader for greedy-merged quads; `MeshDepthMaterial`
  has no such injection, so merged-quad shadows stretch one tile across the quad.
  Non-greedy per-block meshes (like the glass mesh) dodge this inherently.
- **`backdrop-filter` on an ancestor forces main-thread scrolling + repaint for
  its whole subtree.** That — not DOM weight — is why the tall scrollable
  settings panel janked while short menus in the same overlay were fine. Fixed
  by removing the blur and using a darker opaque scrim (CCR-menu-overlay-lag.md).
  The render loop never pauses behind menus (torch flicker uses
  `performance.now()`), so any blurred backdrop re-blurs every frame.
- **Resized render targets must be disposed and rebuilt, not resized in place**:
  on some drivers (ANGLE) a reallocated depth texture keeps its old size on the
  framebuffer attachment → endless `GL_INVALID_FRAMEBUFFER_OPERATION`. See the
  refraction-target rebuild in `onWindowResize`.
- **Browser GPU-process state can masquerade as a code bug**: the 2026-06-11
  "attachments not same size" + stalled chunks reproduced only in one Chrome
  profile — GPU-process crash fallback, not code. When something reproduces in
  one profile only, suspect the profile.
- **`velocity.x`/`velocity.z` are INPUT-space (camera-relative), NOT world-space**:
  `applyCollisionStep`/`computeMovementBasis()` expand them through the current
  movement basis (`_physFwd`/`_physRight`) before applying world displacement. Any
  code that adds a WORLD-space vector (explosion knockback, wind, a future push
  effect) directly into these fields is wrong — it only looks correct facing one
  direction and inverts/goes sideways facing others. This bit the first draft of
  magicSystem.md's player-knockback (Phase 2): project world-space pushes through
  `computeMovementBasis()`'s output first. Mob knockback (`damageMob`'s `kbX`/`kbZ`)
  is unaffected — already world-space, consumed by a different code path.

## 3. Subsystem as-built notes

### Shadows (two stability paths — `updateDayNight`, gated `posChanged || angleChanged`)
- `renderer.shadowMap.autoUpdate = false`; re-render via `markShadowsDirty()`.
- **Blocky ON (default)**: camera follows the sun smoothly; stability = per-fragment
  world-space snap in the chunk shader + the `blockyShadowStep` angle RATCHET
  (freezes the depth map between committed sun steps so edges step monotonically).
  Wobble with blocky shadows ⇒ suspect the ratchet, not the camera.
- **Blocky OFF (soft)**: camera IS texel-snapped — in the LIGHT basis. Key enabler:
  the sun always arcs in the X-Y plane (`shadowLightDir.z === 0`), so the basis
  (forward=(LX,LY,0), right=worldZ, up=(LY,−LX,0)) is never degenerate. Snap
  camPos along right+up to `texelWorldSize` (1/16 block), keep forward continuous,
  set light position = target ± lightDir·offset with NO extra world re-round.
  The moon shares the snapped target.

### Worker mesh pipeline (CCR-chunk-remesh-consolidation, Phases 0–4 SHIPPED)
- `WORKER_MESH_PIPELINE_ENABLED = true`: workers mesh UNBANDED (streaming,
  never-edited) chunks; banded/edited/torch/fire/glass chunks mesh on main via
  `renderChunk`. Worker mesher is single-sourced by `buildChunkWorkerCode`
  injection and byte-parity-gated in the browser suite. Revert switch: set the
  flag false.
- Banded meshing is PER-CHUNK LAZY: `chunkUsesBands(cKey)`, chunks band on first
  edit via `markChunkBanded`. Mesh keys become `'cx,cz#band'` (+`_WATER`);
  `chunkBaseOfMeshKey()` strips both. 4 bands × 5 sections.
- Light is baked into vertex colors; light changes still force remeshes
  (Phase F "light as texture" deferred). `SETTINGS.lightRefill` (default OFF)
  is the partial mitigation.
- Diagnosis tool: `meshProfile.reset()` → fly fresh terrain → `meshProfile()`
  (builds, avg ms/build, mesh ms/s, worst frame). Result of the CCR: main-thread
  mesh load ~203 → ~4 ms/s.
- Integration lessons from first enabling the long-dormant pipeline: dispatch
  caps sized for sync builds starved the worker path (now burst-scaled), and
  `ensureChunk` (collision) synchronously meshed chunks it only needed DATA from.

### Glass & materials (CCR-texture-material-response, CCR's in repo root)
- Per-texel `roughnessMap` authored in `initTextures` from `MAT_PROFILES`
  (matte base + color-keyed shiny accents per tile). Shiny accents need
  roughness ≲110 to glint; ≳140 reads matte. Sparse flecks mip away at
  distance (intended close-up effect).
- `uShininessStrength` uniform (injected after `roughnessmap_fragment`) is
  driven by the REPURPOSED `SETTINGS.specularIntensity` ("Shininess Strength").
  `specularEnabled` off ⇒ fully matte — and ALSO zeroes env reflections
  (roughnessFactor coupling); `specularShininess` was retired.
- Glass is a SEPARATE translucent mesh per chunk (`<cKey>_GLASS`), non-greedy
  1×1 quads, emitted at the end of `renderChunk`; workers route `hasGlass`
  chunks to main. Body opacity is baked into texture alpha (`_glassBodyTexels`,
  `setGlassBodyAlpha()` re-bakes live); glint punch-through via `uGlintReflect`
  (repurposed `specularFresnel`). Glass casts cutout shadows via
  `glassDepthMaterial` + `glassMaterial.alphaTest = 0.5` (see §2 gotcha).
- Env reflections (Phase 3): ANALYTIC sky reflection (same approach as water),
  chunk-material-only, gated `envReflectionEnabled` (default false, not in
  profiles). Deliberately NOT PMREM/cubemap — single-file rule + near-free.

### Fire & torch light
- FIRE bakes **zero** block light (`lightEmission: 0`) and glows via the dynamic
  `torchLightPool` PointLights (pool scans `chunkFires`) — this keeps `setBlock`
  on the light-neutral fast path. Fire lives in AIR adjacent to burnables,
  climbs biased-up, chars via per-block `BURN_TIME`/`BURN_RESULT`.
  Former gaps (settings UI, profile caps, fire tests, VoxelWorld.isSolidBlock,
  eager cell unregister) were ALL closed in build 2026-06-17.6 (FireImplementation.md
  §17 G1-G5); `fireMaxActive` default raised 48→128 by CCR-fire-system-limits.
  `fireMaxEditsPerTick`/`fireConsumeChance`/`fireLightLevel` are dead/deprecated
  settings (kept for save compat; not consulted by the tick).

### Lighting kernel (CCR-LIGHT-004, Phases 0-2 SHIPPED; Phases 3-4 not yet built)
- One propagation rule, single-sourced: `propagateLightBFS(queue, qStart, ctx)` (module
  scope, above `calculateChunkSunlight`) — monotone-max BFS flood fill, rule = 1 travel
  cost + `ctx.attenTable[enteredBlockId]`, floored at `ctx.floor` (1 sky / 0 block).
  `ctx` is worker-injectable: `NEIGHBOR_OFFSETS`/`IS_TRANSPARENT` are read as module
  globals (both already serialized into the worker); everything else arrives via the
  module-scope `_lightCtxScratch` populated by `_chunkLocalLightCtx(blocks, light,
  attenTable, floor, height)` + 4 static accessor functions — no per-call
  closures/allocations. `calculateChunkSunlight`'s phase-2 BFS and `calculateBlockLight`'s
  BFS both call the kernel (Phase 1, byte-identical output, no cache bump).
- **Phase 2 (build 2026-07-10.3, `CURRENT_CACHE_VERSION` 6→7)**: `propagateEdgeLighting`
  (the cross-chunk border transfer) and `propagateLightFromEdgesInward` (the interior
  BFS after a border import) were DRIFTED from the kernel rule — they charged only the
  −1 travel cost and ignored the entered cell's attenuation, and the inward BFS spread
  skylight only (blockLight was imported exactly 1 cell deep and never propagated
  further). Both fixed: `propagateEdgeLighting` now applies `SUNLIGHT_ATTENUATION`/
  `BLOCKLIGHT_ATTENUATION` of the ENTERED (target) cell inline (same expression as the
  kernel); `propagateLightFromEdgesInward` now runs the kernel TWICE (sky, then block —
  the block seed pass deliberately has NO top-of-column dark-column guard, since that
  guard is a skylight-only heuristic and torch light lives in dark columns). This is a
  real baked-light-VALUE change near chunk borders, hence the cache bump — old saves
  relight (one-time cost) on first load.
- Vestigial `chunksNeedingLightingUpdate` Set removed in the same phase —
  `processEdgeLightingUpdates` drained it into `edgeLightingUpdateQueue` unconditionally
  every call, so the neighbor-readiness split it implied never gated anything.
  `queueChunkForLightingUpdate` now adds straight to the real queue.
- Phases 3 (block light joins the budgeted task machinery) and 4 (shared seeding via
  `BLOCK_LIGHT_EMISSION`, blockLight zero-fill consistency) are SPECCED in
  `CCR's/CCR-LIGHT-004-propagation-kernel.md` but not yet built — don't assume
  `updateBlockLightAt` is budgeted or that `calculateBlockLight` reads the full emission
  table until that phase lands.

### Magic system (magicSystem.md, Phases 0-4 SHIPPED + Phase 5 polish, `ccr/magic-system`)
- **ICE (block 19) ships FROSTED** (sunlight/blocklight attenuation 1/1), not clear
  (0/0) — LOCKED before an in-game eyeball because flipping it later is a relight-
  semantics change requiring a `CURRENT_CACHE_VERSION` bump (CLAUDE.md Version
  Constants). Not yet confirmed to look right in-game; flip now (before more systems
  depend on the current semantics) if it reads wrong.
- **Multi-phase atlas tile numbering**: when a design doc assigns fixed tile indices
  across several phases as one literal step (e.g. "NUM_TILES 33→37"), and phases
  actually land sequentially, each phase should claim the NEXT OPEN index rather than
  reserving indices a later phase hasn't landed yet. Phase 0 claimed indices 33-35 for
  its 3 spell icons; Phase 1 appended ICE at 36 (not the design doc's literal 33). Net
  atlas size and tile identities end up identical either way — only the exact index
  differs from a literal reading of the doc. Don't "fix" the index to match the doc;
  the doc's as-built section is what gets corrected.
- **Projectile pool size and projectile LIGHT count are separate budgets** —
  `MAX_PROJECTILES` (pool cap, 12) vs `MAX_PROJECTILE_LIGHTS` (visible-light cap, 3,
  oldest-eviction): every projectile always gets a mesh, only a subset gets a light,
  so cast spam can't stack lights against the real 8-light torch pool
  (`MAX_POINT_LIGHTS`) or the separate 4-cap `activeSpellLights`/`activeBeams`. The
  first draft gave every in-flight projectile an always-visible light before this was
  caught in review. Any future per-entity effect with both a "how many exist" cap and
  a "how many are lit/loud/expensive" cap needs the same two-tier treatment.
- **Movement friction is a single centralized scalar** (`dampingFactor` in
  `applyPlayerVelocity()`), with no per-surface lookup precedent before ICE
  slipperiness (Phase 5): sample the block below the feet when grounded
  (`canJump && !isFlying`) and swap in `ICE_DAMPING_BASE` (0.1) instead of the default
  `0.00001`. This is the hook point for any future per-block movement effect (mud,
  honey, etc.) — don't build a parallel friction system.

### World-gen params persistence (VOXEX-CCR-UI-001 item 4/4b + CCR-WORLDGEN-UI-001)
- `worldConfig` has LIVE getters (biomeFrequency, biomeSizeMultiplier,
  persistence, lacunarity, enableRivers, forceSingleBiome,
  terrainAmplitudeMultiplier) — it was a static snapshot once, which is why
  create-world knobs used to be dead.
- **Two of those getters were STILL half-dead until CCR-WORLDGEN-UI-001 Phase D
  (build 2026-07-11.1)**: `WORLD_CONFIG.terrainAmplitudeMultiplier` had a getter,
  a worker bake, and a reader in `terrainSurface` but NO writer ("Step 11" was
  never done — `applyGenParams` now assigns it), and `seaLevel` reached only the
  main thread (the worker's hand-maintained `WORLD_DIMS` literal is 60; an
  injected `WORLD_DIMS.seaLevel = <live>` line now overrides it at pool
  creation — the LITERALS on both sides deliberately stay 60 for parity-check).
  Lesson: a live getter + worker bake proves NOTHING about a knob being wired —
  trace the WRITER before trusting a create-world control.
- `activeWorldGenParams` is the single source of truth for the ACTIVE world
  (NOT `customWorldSettings` — that's create-world UI state, now initialized
  wholesale from `DEFAULT_GEN_PARAMS`). `applyGenParams(p)` applies + rebuilds
  `worldConfig.biomes` (shallow copy — BIOME_CONFIG edits need the rebuild).
  Persisted as `savePacket.genParams` (13 keys since `usePathBasedRivers` — a
  flag with ZERO readers — was removed; still called v3, old saves load fine).
  CAUTION: `applyGenParams` resets every OMITTED key to its default (`??`
  fallbacks) — always pass complete objects (bit the terrain editor's design).
- `GEN_PARAM_SCHEMA` (beside `DEFAULT_GEN_PARAMS`) is the machine-readable
  registry both the create-world UI and tools/terrain-parameter-editor.html
  build their controls from — add a gen param there or it has no UI anywhere.
  Free-form text inputs, soft warn outside `tested` range, NEVER clamp
  (owner decision).
- The chunk worker bakes `worldConfig` + biomes + the seaLevel override ONCE at
  pool creation. In-session loads (pause-menu Load, F9) must call
  `rebuildChunkWorkerPoolForActiveWorld()` to re-bake; title-screen loads get it
  free via `location.reload()`.
- Spawn X/Z are REAL since Phase D (`findAndSetSpawnPosition(spawnBX, spawnBZ)`,
  pre-gen centers on the spawn chunk); before that they only panned the preview.
- **GEN_TUNABLES (CCR-WORLDGEN-TUNABLES-001, build 2026-07-11.2)**: the shape/
  climate/spline/river/ocean/cave constants moved into one registry, read via
  `let` aliases (`syncGenTunableAliases()` refreshes them — a bare
  `const NAME = GEN_TUNABLES.NAME` would freeze at boot). Object keys (AXIS_W,
  BIOME_PARAMS, SPLINE_*) are mutated IN PLACE, never reassigned — readers hold
  the reference. `applyGenTunables` is deliberately ASYMMETRIC with
  `applyGenParams`: partial objects do NOT reset omitted keys. **Option B (build
  2026-07-11.3): tunables ARE per-world** — `genParams` carries an optional
  `tunables` DELTA and `applyGenParams` is TRI-STATE on it (absent → reset to
  defaults; object → reset+apply; explicit `null` → leave registry untouched).
  The `null` state exists because the terrain editor manages the registry itself
  via `applyGenTunables` while ALSO calling `applyGenParams` per genparam edit —
  without it every genparam tweak wiped the dialed tunables (caught in review;
  the editor's `applyParamsToGame()` wrapper now passes its own delta). Any new
  `applyGenParams` caller MUST decide its tunables intent explicitly.
  Cave tunables ride the per-generate
  `worldGenSettings` message (the cave code is the hand-maintained
  `precalculateCaveNoise` pair — NOT injected — so message plumbing beats
  template edits). LOCKSTEP: `tools/lib/extract-terrain.mjs` extracts the
  registry and derives tunables from its `REGISTRY_KEYS` list — update it in the
  same commit as any registry key add/rename, or terrain-node-checks fails
  loudly ("const X not found"). No lava level exists (no LAVA block) — don't
  re-guess that inventory.

### World-gen performance (CCR-PERF-013)
- Spawn generation is MAIN-THREAD bound, not worker bound (trace: 71 s to
  playable, workers ~85% idle; sunlight 18.8 s + compression 8.7 s on main).
- Lever 1 (worker sunlight, `WORKER_LIGHTING_ENABLED`) shipped — bought
  headroom, little wall-clock (the pipeline is paced by async caching, not CPU).
  Worker ships zero blockLight (fresh terrain has no torches); `calculateBlockLight`
  stays main-only. Lever 2 Option B (compress in the OPFS worker) is the real
  remaining fix; Lever 3 (lower `preGenRenderDistance` on low-end) is the cheap win.

### Menus / UI overlays
- `#seed-menu` and `#create-world-panel` are SEPARATE top-level overlays (no
  backdrop-filter) — that's why world creation stays smooth. Keep new heavy
  overlays out of `#blocker`. `#inventory-overlay` still has blur(2px) (small,
  non-scrolling, tolerable).
- Approved UI-overhaul directions + mockups: `ui-mockups.html` + CCR-ui-overhaul
  (mobile = landscape multi-column; ONE collapsible-dropdown method everywhere =
  two independent flex columns, never CSS multicol, never 2-cell grid;
  settings = sidebar + sub-tabs + group cards).

## 4. Terrain lessons (beyond the ledger)

- **"Directional-looking" ≠ anisotropic.** The corduroy mountain ribbing measured
  isotropic (per-axis mean-step ratio ~1.0) — it was grid-aligned high-frequency
  noise sampled at RAW (un-warped) coordinates. Fix was halving the offending
  frequencies. Separately, the old 3D-projected gradient table WAS ~7–27%
  Z-biased (fixed with the 16-direction table, magnitude √(11/8) to preserve
  noise std ≈ 0.253 so ocean/river thresholds survived). Diagnose with per-axis
  step statistics before assuming either cause.
- **Tune only on a clean base.** The FADE_LUT quantization contaminated every
  texture/roughness judgment made while it was live ("tune ONLY after the LUT
  fix"). If a systemic artifact is suspected, fix it before tuning constants.
- **SWISS_WARP hard bound < 14** (continuity 26.3 at 14 vs 6.8–8.2 at 8–12,
  bar 30) — documented on the const. If the notch test trips, lower SWISS_WARP
  to 8 before raising NOTCH_LIFT.
- **River carve strength fades must reach zero BEFORE the width cutoff bites**
  (valley 80–93, channel 82–95 vs width fade 75–95) — otherwise a cliff ring /
  dam forms at the pinch (measured 62-block cliff without it, 2 with).
- **noise2Dd is algebraically-equal-but-not-bit-identical to noise2D** — any
  reroute through it shifts ALL terrain by float epsilons ⇒ TERRAIN_GEN_VERSION
  bump required.
- **Prototype before implementing terrain features.** The mountain-overhaul work
  validated swiss turbulence, rejected flow-aligned gullies, and pre-measured
  every constant in Node probes before touching voxEx.html. Keep that discipline:
  probe → numbers → implement → `terrain-node-checks` → browser suite → in-game.
  The instruments are first-class now: `tools/terrain-probe.mjs` (point queries,
  transects with max-step, per-axis anisotropy stats, hillshade PNG renders).
  Baseline the metric/render BEFORE the change, re-run AFTER, cite both.

## 5. Product/aesthetic decisions (user-settled; don't re-litigate)

- Natural mountains: connected ridges with internal valleys rising through
  foothills — no fantasy needle spires; some cliffs OK. Summit aspect ~0.9:1.
- CLEAN slopes preferred over de-terrace texture ("messy and noisy" verdict on
  slope noise) — voxel contour steps are the accepted Minecraft look.
- The emergent stepped stone/grass river-gorge walls are LIKED — keep them.
- Sand only near actual water (riverbanks, ocean shores) — never height-banded.
- Blocky shadows default ON, but Kandler personally prefers the soft-shadow look.
- Wet-shoreline damp edge stays CRISP/blocky (deliberately kept in the merge key).
- Menus: consistency over cleverness (one dropdown pattern everywhere).
- **Biome-driven terrain pipeline is the shipping default** (CCR-WORLDGEN-PIPELINE-001,
  build 2026-07-12.4, `TERRAIN_GEN_VERSION` 33): a softmax classifier over
  T/H/Cn/R picks the biome label AND (via `styleBlend`) the height style, so
  label and shape agree by construction. `AXIS_W.r = 18.0` is MEASURED, not
  arbitrary — the CCR's originally-proposed `r = 2.4` gave only ~68% M3
  label/shape agreement against the ≥95% ★ mandate; don't re-litigate it
  downward without re-running `tools/biome-pipeline-checks.mjs` M3 on ≥3
  seeds. `SPLINE_RELIEF` is a Phase-0-TUNED curve, deliberately distinct from
  `SPLINE_EROSION` (raises real relief amplitude — this is what the Phase 4
  `TERRAIN_GEN_VERSION` bump regenerates). Style biases (`GEN_TUNABLES.BIOME_STYLE`)
  ship all-zero DELIBERATELY, pending a dedicated tuning pass — once any bias
  goes non-zero, `BIOME_STYLE_ACTIVE` flips on and costs ~2.3x per column on
  non-cache callers (trees/preview/Node tools; the block-fill path stays
  amortized via `biomeIdCache`) — measure before tuning, don't just flip
  values.

## 6. Verification thresholds (the numbers the suites enforce)

| Check | Bar |
|---|---|
| Adjacent-column continuity | < 30 blocks (post-overhaul terrain legitimately has 10–20 gorge walls) |
| Notch metric (browser suite) | ≤ 6 per seed |
| River flood integrity | < 5% dry channel cores |
| Worker mesh/terrain parity | BYTE-exact (browser suite) |
| meshProfile streaming load | ~81 ms/s reference (lazy banding); worst frame ≤ ~17 ms |
| Mountain region coverage | ~10–13% |
| Frame budget | 16.67 ms; 8 ms per sliced operation |

Multi-seed rule: terrain acceptance = harness green on ≥3 seeds, not one.

## 7. Agent environment notes (Cowork sandbox — SKIP if running Claude Code on Windows)

These apply ONLY to agents running in the Cowork Linux sandbox with
`D:\Projects\voxex` FUSE-mounted; native Windows agents are unaffected.

- **The bash mount serves STALE/TRUNCATED reads of large pre-existing files**
  (voxEx.html especially) — frozen at an old byte offset, hard-cut mid-line,
  persisting across sleeps. The Read/Grep/Edit tools bypass the mount and are
  authoritative. NEVER trust bash `cat`/`wc`/`stat` on voxEx.html; NEVER
  `git add` voxEx.html from the sandbox without proving the mount view matches
  the real file (git reads through the mount → commits truncated content).
  New files sync fine; bash-side writes (`cp`, heredoc) are coherent.
  **Edit-tool edits to ANY pre-existing file can leave the mount stale for
  that file** — after editing, verify (`grep` the new text via bash) before
  any `git add`; if stale, rewrite the full file to the outputs folder and
  `cp` it over (the cp makes the mount the writer, restoring coherence).
- **Sandbox git corrupts `.git/index` intermittently** ("bad signature") and
  cannot always unlink its own `.lock` files (needs `allow_cowork_file_delete`).
  Workaround: `rm -f .git/index*`, then run git with
  `GIT_INDEX_FILE=/tmp/vox.index` (+ `git read-tree HEAD` first), and rebuild
  the real index (`git reset -q`) at the end. Prefer committing from Windows
  when possible. **After EVERY commit, verify the committed blobs aren't
  truncated**: `git show HEAD:<file> | tail` must end where the real file ends.
- **Do NOT mix bash file-overwrites with the Edit tool on the same file** —
  it desyncs the harness cache and re-truncates (documented 2.6 MB-file loss;
  recover via `git show HEAD:voxEx.html`).
- **Mount truncation is typically NEAR-EOF — a "grep for my new text" coherence
  check is NOT sufficient** (2026-07-10, CCR-LIGHT-004 Phase 0): after Edit-tool
  edits, the mount served both voxEx.html and voxex-tests.html cut off mid-line
  ~30/~135 lines before the true end while everything BEFORE the cut was
  byte-correct — greps for the edited text matched fine. `node tools/syntax-check.mjs`
  is the real coherence gate (catches "script never closes"/"no </html>").
  Recovery that worked: truncate the mount file at the last good byte and append
  the correct tail (read via the authoritative Read tool), then re-run
  syntax/parity/suite. Verify the REAL file via Read afterward.
  **2026-07-11 (CCR-WORLDGEN-TUNABLES-001): this recovery was needed FOUR times
  in one session** (voxEx.html ×2, terrain-parameter-editor.html, voxex-tests.html)
  — heavy Edit-tool sessions on large pre-existing files should EXPECT it. Refinements
  that worked: (1) find the cut with `tail -c 300 <mount file>`, locate that text's
  real line via Grep, truncate the mount after the last COMPLETE line using a
  python3 `bytes.rfind(anchor)` on the full anchor line + terminator; (2) the tail
  transcription goes to a NEW file in the outputs mount (new files sync fine),
  normalized to the file's own line-ending style (check `tr -cd '\r' | wc -c`
  on the byte-correct PREFIX — voxEx.html/voxex-tests.html are CRLF, the rewritten
  terrain-parameter-editor.html is LF); (3) mid-file content can be VERIFIED
  synced by comparing a distinctive-token count (bash grep -c vs Grep-tool count)
  before assuming only the tail is missing; (4) a saved tail file remains valid
  across LATER mid-file edits (content-anchored, not line-anchored) — reusable
  for repeat recoveries in the same session.
  **The appended tail must preserve CRLF** — a Phase 1 recovery re-appended an
  LF-only tail into the otherwise-CRLF voxEx.html (caught in review, not by any
  gate). Check: `tr -cd '\r' < voxEx.html | wc -c` must equal `wc -l`. Fix:
  `sed -i 's/\r\?$/\r/'` (safe — restores the pre-truncation byte state).
- **NEW (2026-07-13, CCR-WORLDGEN-PIPELINE-002 WS6/Bump B): mount staleness is
  not always confined to the tail — a naive truncate-and-append recovery can
  ERASE a recent Edit-tool change.** The standard recovery above assumes the
  mount's PREFIX (everything before the cut) is byte-correct and only the tail
  is missing; that assumption held on every prior occurrence in this file's
  history but is NOT guaranteed. If the mount's staleness window happens to
  extend far enough back to cover a MID-FILE region you just edited, truncating
  at "the last complete line the mount shows" and reattaching a tail can silently
  reproduce the OLD (pre-edit) content in that region — a real content loss, not
  just a parse error, and `syntax-check.mjs` cannot catch it (the stale text is
  still syntactically valid, just wrong). Caught in time this session (no loss)
  by the same "distinctive-token count, bash grep vs Grep-tool" check from the
  2026-07-11 refinement above — but that check must specifically include the
  token(s) belonging to your MOST RECENT mid-file edit, not just any token from
  the file. **Rule: before trusting a truncate-and-append recovery, grep the
  mount's prefix bytes for your newest mid-file edit's own distinctive text; if
  it's missing or wrong, the prefix itself is stale and needs to be replaced
  from the Read tool, not just the tail. Re-verify the recovered file via the
  Read tool afterward** (not just `syntax-check.mjs`), the same lesson the WS1
  as-built already drew for LOGIC bugs introduced by a bad tail reconstruction —
  this is the mirror-image failure mode (bad PREFIX instead of bad tail).
- **`/tmp` does NOT survive a VM restart/outage.** A session that hits a VM
  guest disconnect (see the `mcp__workspace__bash` "VM guest is not connected"
  failure mode a few bullets below) comes back with an EMPTY `/tmp` — any
  cached Chromium download, extracted libs, or scratch snapshot living there is
  gone and must be re-bootstrapped from scratch. Hit twice in one
  CCR-WORLDGEN-PIPELINE-002 session (Bump A's session and again in the
  WS6/Bump B session) — budget time for a full Chromium re-download
  (`npx @puppeteer/browsers install chromium@latest --path /tmp/br` + the
  `libxdamage1` apt-get/dpkg step below) rather than assuming a prior session's
  `/tmp/br*`/`/tmp/libs` cache is still there.
- **Each bash call runs in its own bwrap PID sandbox — background jobs
  (`nohup`/`setsid`/`&`) do NOT survive across calls** (2026-07-10). Long steps
  (Chromium download, browser suite) must complete within one call's timeout;
  both fit synchronously in practice (download ~160 MB is the tight one — it may
  already be cached under `/tmp/br*` from a prior run; check before downloading).
- Kandler PLAYS VoxEx in a different Chrome profile than the extension-connected
  one — saved worlds/localStorage differ. "Works for me / broken for him" ⇒
  check which profile first.
- Deployed game: https://kandlerb.github.io/VoxEx/voxEx.html (GitHub Pages from
  pushed main). Browser suite: /tools/voxex-tests.html (serve over localhost),
  or headlessly via `tools/run-browser-tests.mjs`.
- **Headless Chromium bootstrap without root (VALIDATED 2026-07-06, 315/315
  green in ~30 s):**
  ```sh
  npx -y @puppeteer/browsers install chromium@latest --path /tmp/br
  apt-get download libxdamage1 && dpkg -x libxdamage1_*.deb /tmp/libs   # the one missing lib
  LD_LIBRARY_PATH=/tmp/libs/usr/lib/x86_64-linux-gnu \
    CHROME=/tmp/br/chromium/<snapshot>/chrome-linux/chrome \
    node tools/run-browser-tests.mjs --timeout=600
  ```
  The download is ~160 MB — run it under nohup and poll if the shell has a
  per-command timeout. `ldd <chrome> | grep "not found"` tells you which libs
  (if any) still need the apt-get download + dpkg -x treatment.

## 8. Node tooling cross-platform gotchas (Windows-specific — NOT part of the sandbox-only §7 above)

- **`new URL(...).pathname` is NOT a valid Windows file path.** On Windows,
  `new URL(import.meta.url).pathname` yields `/D:/Projects/voxex/tools/foo.mjs`
  (leading slash + drive letter baked in) — pass that to `fs.readFileSync`/
  `path.join` and you get `D:\D:\Projects\...` → ENOENT. ALWAYS use
  `fileURLToPath(new URL(...))` from `node:url` instead. Found 2026-07-12
  (CCR-WORLDGEN-PIPELINE-001 Phase 4 gate-completion) when the owner ran the
  full gate stack NATIVELY on Windows for the first time in this CCR — fixed
  in five tools: `syntax-check.mjs`, `parity-check.mjs`,
  `terrain-node-checks.mjs`, `terrain-probe.mjs`,
  `scratch/biome-pipeline-proto.mjs`. Sandbox (Linux) behavior was unaffected
  either way — this bug is Windows-only, so it hid until a native run finally
  exercised it.
- **`tools/voxex-tests.html`'s tunables suite has a registry↔schema parity
  list (`JSON_KEYS`) that must grow whenever a new object/array-valued
  `GEN_TUNABLES` key is added** — it enumerates which keys are JSON-shaped
  (vs primitives) for the parity comparison; missing an entry there silently
  mis-compares instead of failing loudly. CCR-WORLDGEN-PIPELINE-001 Phase 1
  added `BIOME_CENTROIDS`/`BIOME_STYLE`/`SPLINE_RELIEF` and tripped this —
  same "grow it in the same commit" discipline as `REGISTRY_KEYS` in
  `tools/lib/extract-terrain.mjs`.
- **The `voxex-tests.html` `expect()` harness implements NO `.not`,
  `.toThrow()`, or `.toBeUndefined()` matchers.** A pre-existing "unknown key"
  test used those matchers and had never actually been runnable — the
  harness doesn't have them. Write assertions as try/catch instead (`try {
  ...; fail('should have thrown'); } catch (e) { assert(...); }`). Found and
  fixed during the same Phase 1 gate-completion pass.

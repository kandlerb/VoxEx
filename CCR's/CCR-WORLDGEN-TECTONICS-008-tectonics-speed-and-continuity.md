# CCR-WORLDGEN-TECTONICS-008: tectonic bake speed + plate-edge continuity + river flow accumulation

> **Status: IMPLEMENTED** — build `2026-09-10.1`, `TERRAIN_GEN_VERSION` 44 → 45 (terrain regenerates; owner is the sole player).
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-008 · **Build baseline**: 2026-07-21.5 (post CCR-WORLDGEN-SCALE-001c) · **Author**: Fable (owner brief: "terrain generation is still not right, and the plate tectonics is very slow")

## Problem / Why

Measured on this session's machine (Node 22, `tools/lib/extract-terrain.mjs`, seed `VoxEx`, game-faithful seed):

| Symptom | Measurement | Root cause |
|---|---|---|
| Tectonics "very slow" | `buildOrogenRegion` 7.1–7.9 s per region; sim phase 4.3 s of which **`order.sort` with a JS comparator = 3.2 s** (262 144 cells × 40 iterations); sampling phase 3.4 s | comparator sort; `plateLookup` string-keyed memo + 25 string-keyed `Map` gets per call (6.7 µs/col cold) |
| World creation stalls | region index `floor(gx/8192)` puts the default spawn (0,0) at the **corner of 4 regions**; every worker AND the main thread baked each of them independently (N+1 × 4 × 7 s), the create-world preview too | no bake sharing; grid origin at (0,0) |
| Plate layout identical on every seed | `plateLookup` used `seed | 0`, but `worldConfig.seed` is a fraction in [0,1) → `seedNum === 0` for every world; 276/289 sample points had the SAME `plateId` on two unrelated seeds (only the noise warp differed) | integer truncation of a fractional seed |
| Ruler-straight walls along plate edges (ocean floor cliffs, straight regime-2 coasts) | transect at z=−150 across the bisector near (−264,−150): C jumped **0.020 → −0.208 between adjacent columns** (height 53 → 31); `deltaC` 0.001 → −0.116 because a NEIGHBOUR plate's trench band ends abruptly at the Voronoi edge, plus SCALE-001b's boolean `s1.oceanic` deepen gate (0.11 C step) | a column summed only its nearest plate's boundary bands; CCR-007 blended only the crest term |
| Hydro rivers: every trunk carved like a lone creek; piedmont "comb" of parallel 84-block flooded valleys | region (0,0) seed VoxEx: 70 springs, 59 captured, **654/654 segments at flow 1** | flow accumulation counted paths CONTAINING a cell — a tributary path ENDS at its join cell, so the trunk downstream never inherited its water; `FLOW_WIDTH_SCALE` was inert; `HYDRO_LOWLAND_WIDEN` (3.5×) applied to every channel regardless of flow |
| Spring-keep pattern seed-invariant | `Math.floor(seed) === 0` in the keep hash | same fractional-seed truncation |
| Every bare `terrain-probe.mjs` render was of a NON-shipping world | `flags.hydro === true` / `flags['biome-driven'] === true` passed a hard `false` when omitted → legacy decoupled relief + ribbon rivers | probe defaults stale since both paths flipped ON |

## Approach

1. **Speed (flag-ON, output-preserving where noted):** stable LSD radix sort on a quantized descending-height key (byte-identical rasters, 0 diffs on 2 regions); numeric packed keys + a per-lattice-cell cache of the 5×5 site block in `plateLookup` (byte-identical, fingerprint `7ecd3458af4cd5c1` unchanged before the seed fix); origin-centered orogen region grid (`floor(gx/size + 0.5)`); **bake sharing** — spawn regions pre-baked once on main during pre-gen and broadcast, worker self-bakes posted back and rebroadcast (`{type:'orogenRegion'}` side messages; `RegionField.putKey`).
2. **Continuity:** one `frameFor(ref)` closure (the s1 loop and CCR-007's `rangeWinnerFor` were the same loop twice) evaluated for the 2nd/3rd-nearest plates near a flip line; `deltaC`/`upliftR`/`upliftLocal`/`oceanicW` blended with a `(1−g/B)²` kernel on `g = √d_k − √d_1` (`BLEND_BAND_C = 256`); the crest-height blend generalized to the same three frames (`BLEND_BAND = 64`, junction fade replaced by the s3 frame). Symmetric at g=0 → continuous by construction; pure s1 frame beyond B.
3. **Rivers (both flag states, TGV bump):** transitive flow accumulation along a first-claimant successor map (reached stubs included); new `HYDRO_WIDEN_FLOW_LOG2` (default 3) gates `HYDRO_LOWLAND_WIDEN` by flow (0.3 at flow 1 → 1.0 at flow 8; 0 = old look); spring-keep hash mixes the seed mantissa.
4. **Tool:** `terrain-probe.mjs` path flags are tri-state (`--x` / `--no-x` / omitted = live default) and gained `--tectonic` / `--no-tectonic` / `--game-seed`.

**Rejected:** widening `HYDRO_CAPTURE_RADIUS` for the piedmont comb (parallel piedmont streams are 100–150 blocks apart; radius 2 = 64 blocks cannot reach them, and the real defect was their SIZE, not their count); re-tuning `HYDRO_CHANNEL_HALF_WIDTH`/`HYDRO_LOWLAND_WIDEN` (owner-set in SCALE-001 — the flow gate keeps the owner's trunk width and only shrinks lone creeks).

## Version impact

- `VOXEX_BUILD`: 2026-07-21.5 → **2026-09-10.1** + `VOXEX_RECENT_CHANGES` entry.
- `TERRAIN_GEN_VERSION`: **44 → 45** (hydro river carve changes on the default path; flag-OFF `computeSurfaceHeight` byte-identical — 0/4096 diffs vs HEAD, seed 1337 — only `blendedHeight` differs: 169/4096 columns, max 8 blocks).
- `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION`: no.
- New flag-OFF fingerprint (`tools/flagoff-fingerprint.mjs`): **`e02bfb2a5ec6b7f44f0cf0740926dccf1f6c1cb9a60a75e8cc1d84cbe0242a7e`** (TGV 45). `cd1df4af…b14d7` was TGV 44.

## Changes (grep anchors)

| # | Location | Change |
|---|---|---|
| 1 | `function plateLookup` head | numeric single-slot memo (`_plateMemoKey` holds the seed, memo carries `gx/gz`); `seedNum = plateHash32(floor(seed·2³²), floor(seed), …)`; seed-stamped `_plateSiteCache` (sentinel key `0.5`); packed cell keys; 5×5 block cached under a negative packed key |
| 2 | `const frameFor = (ref) =>` | the boundary accumulation as a frame closure; `BLEND_BAND_C`, `_kern`, `w2c/w3c/w2h/w3h`, `F1/F2/F3`, blended `deltaC/upliftR/upliftLocal/oceanicW`; memo `rangeD3…rangeRegime3`, `rangeWS2/rangeWS3` |
| 3 | `function tectonicRangeHeight` tail | three-frame height blend |
| 4 | `continentalHeight`, grep `_pl.oceanicW > 0` | deepen gated by the blended oceanic weight |
| 5 | `function buildOrogenRegion` | origin-centered `x0/z0`; radix sort (`_rkeys/_rtmp/_rcnt`) replacing `order.sort` |
| 6 | `tectonicErosionAt` / `tectonicTalusAt` / `tectonicRiverFactor` | `floor(gx/size + 0.5)` region index |
| 7 | `class RegionField` | `hasKey(key)` / `putKey(key, reg)` |
| 8 | worker template: `_orogenPosted`, `postNewOrogenBakes`, `type === 'orogenRegion'` | share bakes |
| 9 | `class ChunkWorkerPool`: `_orogenShared`, `shareOrogenRegion`, `syncOrogenToWorkers`, `_handleWorkerMessage` side-message branch, `generateTerrain` sync call | share bakes |
| 10 | `preGenerateSpawnChunks` Phase 1C head, grep `Baking tectonic erosion` | main-thread spawn pre-bake + broadcast |
| 11 | `applyGenParams` / `applyGenTunables` orogen clear sites | also clear `chunkWorkerPool._orogenShared` |
| 12 | `buildHydroRegion`: `stubEnds`, `nextOf`, `addDownstream` | transitive flow accumulation |
| 13 | `riverFactorAt`, grep `_wGate` | flow-gated lowland widening |
| 14 | `HYDRO_WIDEN_FLOW_LOG2` (registry default, `let` alias, `syncGenTunableAliases`, worker emission, `GEN_TUNABLE_SCHEMA` 'Rivers' row, `extract-terrain.mjs` `REGISTRY_KEYS`) | new tunable, full lockstep |
| 15 | `buildHydroRegion` spring keep hash, grep `Math.imul(Math.floor(seed * 4294967296)` | seed mix |
| 16 | `tools/terrain-probe.mjs` | tri-state flags |

## Worker parity

All terrain edits are in injected functions (`plateLookup`, `tectonicRangeHeight`, `continentalHeight`, `buildOrogenRegion`, the three samplers, `buildHydroRegion`, `riverFactorAt`) — main-thread source only. `RegionField` is single-sourced via `toString()` (P10 checks construction lines only; unchanged). The worker template's message handler is hand-maintained main/worker plumbing (no parity copy). `HYDRO_WIDEN_FLOW_LOG2` follows the standard tunable lockstep (registry/alias/sync/emission/schema/extract-terrain).

## As-built measurements

- Bake: 7.1–7.9 s → **2.6–3.7 s** per 512² region (radix sort 3.2 s → ~0.1 s; sampling 3.4 s → ~2.4 s from the cheaper `plateLookup`). Bake-twice byte-identical incl. `flow`/`talusDh`.
- `plateLookup`: 5.8 → 3.0 µs/col scattered, 4.0 → 2.5 chunk-coherent AFTER the frame blend (1.6 before it — the blend costs ~1 µs on the ~40% of columns within 256 blocks of an edge).
- `computeSurfaceHeight` warm flag-ON in a belt region: 11.4 → ~9.5 µs/col.
- Spawn: default-spawn worlds now bake 1 region (was 4) once (was N workers + main).
- Seeds: `plateId` identical across two seeds 276/289 → **0/289**.
- Edge continuity: transect (−330…−170, z=−150) 53→31 step → 45…50 smooth; 2048-block spawn window adjacent steps >30: **7 → 0** (max 94 → 29).
- Flow: 654/654 segs at flow 1 → histogram 1:168 / 2–3:226 / 4–7:158 / 8–15:86 / 16+:24.
- Gates: syntax GREEN; parity LOCKSTEP GREEN (P10 incl.); terrain-node-checks ALL HARD GREEN ×3 (1337/42/9001); flag-OFF surface identity vs HEAD 0 diffs; browser suite headless — see the commit message / PR for the run result.

## Honest residuals (NOT fixed here)

- `tectonicRiverFactor` (ribbon path, `hydroRivers:false` only) still renders the erosion bake's 20-block D8 drainage as straight 45°/90° slot channels — visible in any bare-probe render of the old default and in a ribbon-mode world.
- Tectonic belts and active-margin coasts still read STRAIGHT at map scale: `BOUNDARY_WIGGLE_AMP/FREQ` scale with `PLATE_SIZE/12000`, so at `PLATE_SIZE` 5000 the warp wavelength is ~2000 blocks with ~290-block amplitude — a 1500-block coast shows less than one wave. A dedicated multi-octave boundary warp is the next step.
- The create-world preview still triggers a main-thread bake (now ~3 s, once per seed, 1 region).
- Flip-line blend cost: `BLEND_BAND_C = 256` is an internal const (like `BLEND_BAND`); promote to a tunable if the owner wants to dial the ramp.
- Hydro flow is still windowed per region build (a trunk only accumulates tributaries whose springs lie in the same 1088-block build window) — unchanged design; ring-overlap springs can carry different flow in two neighbouring builds (geometry identical, width may differ) — pre-existing, now visible because flow is no longer 1 everywhere.

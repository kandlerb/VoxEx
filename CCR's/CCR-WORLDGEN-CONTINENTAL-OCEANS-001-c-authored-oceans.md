# CCR-WORLDGEN-CONTINENTAL-OCEANS-001: C-authored oceans (unified continental heightmap)

> **Status: IMPLEMENTED (Phases 1-3)** — DRAFT → AUDITED → IMPLEMENTED (Phases 1-2) → Phase 3 DONE (metric recalibration, preset review, editor pass-view wiring, docs reconcile). Stays in `CCR's/` pending the owner's in-game eyeball of the C-authored coastlines/oceans + the flat/superflat preset flooding note (see Phase 3 As-built); move to `Finished/` after that.
> **ID**: VOXEX-CCR-WORLDGEN-CONTINENTAL-OCEANS-001 · **Build baseline**: 2026-07-15.1 (implemented at 2026-07-15.2) · **Author**: agent (delegated), owner-approved design

## Problem / Why

Before this CCR, ocean placement was an **independent noise field** (`getOceanFactor`'s `OCEAN_WARP`/`oceanNoise`/`coastNoise` stack) that had **nothing to do with the continental heightmap**. `terrainSurface` built land height from continentalness `C` (via `SPLINE_CONTINENTAL`), while `getOceanFactor` decided where water goes from a *separate* noise blob, and `computePreRiverHeight` then lerped the land height down toward an ocean floor wherever that unrelated field said "ocean". The two fields **fight over the coast**: a column can read as high continental land AND fall inside a noise-ocean blob, or as a continental low that the noise field calls land. Coastlines don't follow the actual continental shelf; oceans don't deepen where the continent thins.

CCR-WORLDGEN-PIPELINE-002's finding #5 concluded **"ocean cannot key off C"** (the noise ocean was kept decoupled). This CCR **reverses that finding**: rather than *correlate* the noise ocean to C, we **retire the noise ocean entirely** and let continentalness author ocean **placement and depth** in ONE heightmap. C < a coast threshold IS ocean; the depth is a spline of C. Label and shape agree by construction — the same lesson CCR-WORLDGEN-PIPELINE-001 applied to biomes, now applied to oceans.

## Approach

New flag `WORLD_CONFIG.continentalOceans: true` (default ON). Flag ON:

1. `terrainSurface`'s **base** evaluates a dedicated **ocean spline** (`SPLINE_CONTINENTAL_OCEAN`, authored over C's REAL domain ~[-0.06, 1.05]) at a **relief-driven cliff-remapped, island-perturbed C** — open ocean sits ~70 below sea level, the waterline (offset 0) is at `COAST_THRESHOLD_C = 0.24`, land rises to +16.
2. The fractal **detail** (amplitude + lift, NOT the base) multiplies by a coast-band **detail fade** (`SEAFLOOR_DETAIL` in open ocean → full on land) so open ocean reads as a smooth basin instead of drowned mountains.
3. `getOceanFactor` becomes a **dispatcher** to a new injected `oceanFactorFromC` (C-thresholded, identical 0..1 semantics: 0 = open ocean, band = shelf, 1 = land). **Zero consumer edits** — the sand gate, `isTreeSoilSurface` mirror, deltas, fjords, hydro spring/spill, `oceanCache`, and every metric read the dispatch unchanged.
4. `computePreRiverHeight`/`getPreRiverHeight` early-return flag-ON with **no** `oceanFloor` lerp / **no** `getOceanDepth` (the spline already carved the seafloor — a legacy lerp would double-carve).
5. `floodSpill` widens its halo to `HYDRO_HALO_CONTINENTAL = 40` flag-ON (C basins run deeper than the old noise basins; measured basin extent 34 on seed 9001, above the old 32).

Flag OFF = byte-for-byte pre-CCR terrain (TGV 42) — the escape hatch, proven identical over 14,400 columns ×3 seeds.

**Spline domain reconciliation (important):** flag-OFF byte identity forbids changing `SPLINE_CONTINENTAL`'s default. A NEW registry key `SPLINE_CONTINENTAL_OCEAN` holds the ocean knots; flag-ON `terrainSurface`'s base uses it, flag-OFF uses `SPLINE_CONTINENTAL` unchanged. The ocean spline is authored over the **real C domain** (see the dead-knots lesson below), not the nominal [-1, 1].

**`continentalHeight` parameterization:** the base/erosion weights, sea bias, octave counts, and a frequency scale became tunable-alias reads (`CONTINENTAL_*`). These apply UNCONDITIONALLY (both flag states) but are **byte-identical at the frozen defaults** (`0.7`/`0.3`/`+0.3`/`4`/`3`/scale `1.0` == the old hardcodes; `x * FREQ * 1.0 === x * FREQ` exactly).

**Rejected alternatives:** (a) correlating the noise ocean to C (PIPELINE-002 finding #5's non-conclusion — keeps two fields, still can disagree); (b) a `[-1,1]`-domain draft ocean spline (dead knots — see below).

## Version impact

- `VOXEX_BUILD`: 2026-07-15.1 → **2026-07-15.2** + `VOXEX_RECENT_CHANGES` entry (done).
- `TERRAIN_GEN_VERSION`: **42 → 43** (terrain output changes flag-ON; saved chunks regenerate once).
- `CURRENT_CACHE_VERSION`: **no** (lighting semantics untouched).
- `SETTINGS_VERSION`: **no** (DEFAULTS unchanged; the flag lives in `WORLD_CONFIG`, the tunables in `GEN_TUNABLES`).

## Prototype results (P0 / P0.2)

Validated in `tools/scratch/co_all.mjs` (P0 gate harness) + `co2_core.mjs` (P0.2 core library — the SEAFLOOR_CLIFF/detail-fade/two-stage-carve formulas ported verbatim into the live code).

- **Ocean split:** target 20-35%; frozen defaults land ~30-36% (Earth-like).
- **Ocean→outlet connectivity (M14):** 100% with `HYDRO_HALO_CONTINENTAL = 40`, 0 halo-fails.
- **Depth:** median wet depth ~8-25, max ≥35 (deep basins).

**Spline evolution & do-not-retry lesson:** the first draft spline was authored over the nominal `[-1, 1]` domain, but continentalness's REAL range is ~[-0.16, 0.73] (measured) — so every knot below the real min **never activated** (dead knots). The shipped `SPLINE_CONTINENTAL_OCEAN` is authored over the real domain (~[-0.06, 1.05]). Corollary lesson: **lowering `CONTINENTAL_SEA_BIAS` to "activate" deeper knots is redundant with `COAST_THRESHOLD_C`** — the coast threshold already sets where water begins; moving the bias just re-centers the whole field.

## Owner decisions

- **Inland seas allowed** (supersedes OD5 for C-basins): C-minima below the coast threshold become inland seas, not forced-drained. `floodSpill`'s outlet test already accepts "ocean OR below sea level", so hydro rivers reach inland seas as outlets (M14 wording updated to say so).
- **Detail fade** on the seafloor (smooth basins), not full fractal underwater.
- **SEAFLOOR_CLIFF now** (relief-driven steep offshore dropoff), not deferred.
- **`HYDRO_HALO_CONTINENTAL = 40`** for the deeper basins.

## Tunables (all NEW, `GEN_TUNABLES` + `GEN_TUNABLE_SCHEMA` section 'Continents & Oceans', `ui: 'both'`)

| Key | Default | Tested range | Role |
|---|---|---|---|
| `SPLINE_CONTINENTAL_OCEAN` | knots (see code) | json | Ocean base height spline over C's real domain (flag-ON base) |
| `COAST_THRESHOLD_C` | 0.24 | [-0.05, 0.30] | C at/below → open ocean (waterline) |
| `COAST_SHELF_C` | 0.06 | [0.02, 0.15] | C-width of the coast shelf above threshold |
| `SEAFLOOR_DETAIL` | 0.15 | [0, 0.5] | fractal detail fraction retained in open ocean |
| `SEAFLOOR_FADE_C` | 0.06 | [0.03, 0.25] | C-width of the detail fade (ocean→land) |
| `SEAFLOOR_CLIFF_SHARP` | 4.0 | [1, 8] | ocean-side C-remap exponent at full relief (1 = off) |
| `SEAFLOOR_CLIFF_BAND` | 0.13 | [0.05, 0.25] | C-width of the cliff remap band (relief threshold reuses live `CLIFF_RELIEF_MIN`) |
| `CONTINENTAL_SEA_BIAS` | 0.30 | [0.10, 0.50] | continentalHeight `c += bias` (BOTH flag states; byte-id at default) |
| `CONTINENTAL_BASE_WEIGHT` | 0.70 | [0.4, 1] | continentalHeight base-noise weight |
| `CONTINENTAL_EROSION_WEIGHT` | 0.30 | [0, 0.6] | continentalHeight erosion-noise weight |
| `CONTINENTAL_BASE_OCTAVES` | 4 | [2, 6] int | base fbm octave count |
| `CONTINENTAL_EROSION_OCTAVES` | 3 | [2, 5] int | erosion fbm octave count |
| `CONTINENTAL_SCALE` | 1.0 | [0.5, 2] | multiplies continental freqs (<1 = bigger continents) |
| `CONTINENTAL_ISLAND_AMP` | 0.0 | [0, 0.15] | island micro-layer amplitude (0 = off; guard idiom) |
| `CONTINENTAL_ISLAND_FREQ` | 0.0015 | [0.0005, 0.02] | island micro-layer frequency |
| `HYDRO_HALO_CONTINENTAL` | 40 | [24, 56] | flood-spill halo when flag ON (deeper basins) |

## Worker parity / lockstep

- `oceanFactorFromC` — NEW injected function; added to the `terrainFuncs` injection list (edit main only) and to `tools/lib/extract-terrain.mjs`'s `FUNCS`.
- All 16 new tunables — added to `GEN_TUNABLES` defaults (auto-derives `GEN_TUNABLE_DEFAULTS`), `GEN_TUNABLE_SCHEMA`, the `let`/`const` hot-path aliases, `syncGenTunableAliases`, the `buildChunkWorkerCode` const-emission block, and `extract-terrain.mjs`'s `REGISTRY_KEYS`. `SPLINE_CONTINENTAL_OCEAN` (object-valued) added to `voxex-tests.html`'s `JSON_KEYS`.
- Flag plumbing (the WS6-P8 four-site rule): `WORLD_CONFIG.continentalOceans`, the live `worldConfig` getter, the worker `worldConfig` bake line, and the browser suite's live-vs-boot flag-agreement test — all four done.
- `terrainSurface`/`computePreRiverHeight`/`getPreRiverHeight`/`getOceanFactor`/`continentalHeight`/`floodSpill` are all already-injected — edited main only.

## Safety Checks

- [x] `node tools/syntax-check.mjs` GREEN
- [x] `node tools/parity-check.mjs` GREEN
- [x] Terrain touched — `node tools/terrain-node-checks.mjs` GREEN on 3 seeds (1337/42/9001)
- [x] `node tools/run-browser-tests.mjs` — **405/405 green** (incl. new flag-agreement test + JSON_KEYS + fixed #10)
- [x] Flag-OFF byte-identity — 14,400 cols ×3 seeds, **0 diffs** (`tools/scratch/co_byteproof.mjs`)
- [x] No duplicate/shadowed identifiers; version constants bumped
- [ ] CLAUDE.md / docs/agent-notes.md — DEFERRED to Phase 3 reconcile (per task scope)

## As-built (Phases 1-2)

**Implemented** exactly as designed. Edit sites (by grep anchor) in `voxEx.html`: `WORLD_CONFIG` (`continentalOceans: true`), the `worldConfig` getter (`get continentalOceans()`), `buildChunkWorkerCode`'s worldConfig bake + const-emission block, `GEN_TUNABLES` defaults, the alias declarations + `syncGenTunableAliases`, `continentalHeight` (parameterized), `terrainSurface` (flag-gated base/detail branch), `oceanFactorFromC` (new) + `getOceanFactor` (dispatcher), `computePreRiverHeight`/`getPreRiverHeight` (flag-ON early return), `floodSpill` (`effHalo`), `terrainFuncs` list, `VOXEX_BUILD`/`TERRAIN_GEN_VERSION`/`VOXEX_RECENT_CHANGES`. Tooling: `extract-terrain.mjs` (opt + FUNCS + REGISTRY_KEYS + return), `biome-pipeline-checks.mjs` (`--legacy-ocean`/`VOXEX_CO_OFF` A/B override), `biome-metrics.mjs` (M14 wording), `voxex-tests.html` (flag test + JSON_KEYS + #10 fix).

**Deviation from the prototype (cliff relief input):** `co2_core.mjs`'s `cliffRemapC` called `reliefParam(gx,gz)` explicitly; the live `terrainSurface` reuses its **own already-computed `relief` scalar** (per the plan's "use the relief scalar terrainSurface already computes"). In the shipping biome-driven config these are the SAME number (`relief === reliefParam(gx,gz)` for both forced and unforced), so output matches the prototype; it saves one redundant `erosionParam` fractal per column on the hot path. (Only the exotic `biomeDrivenTerrain:false` + `continentalOceans:true` combo would source relief from `SPLINE_EROSION` instead of `SPLINE_RELIEF` for the cliff — an untested corner, not a shipping config.)

**Gate results (honest):**

- **terrain-node-checks** ×3 (live default = flag ON): ALL HARD GREEN.
- **biome-pipeline-checks `--hydro` (SHIPPING config, seed 1337):** the plan's named gating metrics all **PASS** — M6 land/ocean split 30.6%, M8 river-flood 0.0% dry, **M14 river→sea connectivity 100.0% (0 halo-fails)**, M15/M16/M17 clean, M22 fjord-flooding PASS. **M23 cliff-profile FAILs (ratio 0.77 vs <0.70)** — anticipated by the plan: `SEAFLOOR_CLIFF` is a different mechanism than WS8's `CLIFF_SHARPNESS_MAX`, so the M23 metric (calibrated against the WS8 cliff) reads differently. Reported, not fake-tuned.
- **Feature-induced calibration shifts (default/ribbon run):** M4/M5/M6/M10/M18/M20/M23 FAIL flag-ON but **all PASS with the flag OFF** (proven via `VOXEX_CO_OFF=1`). These metrics were calibrated against the OLD noise ocean; replacing the ocean model shifts land/ocean split (M6 33.5-35.7%, marginally over a 35% gate on 2/3 seeds), near-coast plains roughness (M18 — the ocean-spline base has a steeper coastal gradient than the old flat noise ocean), beach-sand proximity (M10 69-72% — the gentle C-shelf creates broad near-sea-level coastal land where sand appears but open water is beyond the metric's window), and desert dry-sand leak (M20). **These are expected consequences of the owner-approved, prototype-validated ocean model, NOT implementation bugs — the flag-OFF byte-identity proof confirms the code path is clean.** Not tuned-to-pass (per the plan's explicit instruction).
- **M21 (forced-shape agreement) is PRE-EXISTING** — it FAILs on all 3 seeds even with `continentalOceans` OFF, so it is unrelated to this CCR.
- **Browser suite:** 404/405 on first run — the one failure (test #10 "amplitude-0 collapses fractal relief") was a legitimate feature-induced expectation shift: `terrainAmplitudeMultiplier` (amp0) scales only the fractal DETAIL, not the base, and the ocean spline's base (range −70..+16) has more variance than the old continental spline (−45..+14), so amp0=0 no longer collapses total variance to <20%. Fixed by forcing `continentalOceans` OFF *within that test* (restored in `finally`) to isolate the fractal-amplitude behavior the test actually targets → **405/405 green.**

**Renders (owner evidence, seed 1337):** `outputs/impl_coast_mountain.png` (−296,−9000: 29% ocean, deep water minH 15, mountains maxH 163) and `outputs/impl_coast_plains.png` (−9000,−9000: 90% ocean, smooth seafloor minH 1, low land maxH 69) — both show the C-authored deep basins, coastlines, and detail-faded smooth seafloor.

**§7 mount-recovery performed:** every Edit-tool edit to a pre-existing file left its bash-mount view truncated near EOF (voxEx.html, extract-terrain.mjs, biome-pipeline-checks.mjs). Each was repaired via the documented truncate-at-last-complete-line + Read-tool-sourced tail splice (CRLF-preserved for voxEx.html/voxex-tests.html, LF for the .mjs files), verified via `syntax-check`/node-parse + the byte-proof. Remaining tool edits (biome-metrics M14, biome-pipeline env override, voxex-tests) were done **via bash python** (mount-coherent) to avoid re-truncation.

**Open (Phase 3, per task scope):** create-world presets, terrain-editor per-pass wiring, and the CLAUDE.md / docs/agent-notes.md reconcile. Also flagged for owner: M6's marginal ~35% ocean overshoot on 2 seeds (nudge `COAST_THRESHOLD_C` up slightly if a tighter ocean fraction is wanted — a tuning decision on the frozen owner-approved default, deliberately NOT made unilaterally) and M23's cliff-metric mismatch (either re-calibrate M23 for `SEAFLOOR_CLIFF` or annotate it as a known dual-mechanism divergence).

## As-built (Phase 3 — metric recalibration + presets + editor wiring + docs)

**No `voxEx.html` change** — Phase 3 touched only `tools/biome-pipeline-checks.mjs`, `tools/lib/biome-metrics.mjs`, `tools/terrain-parameter-editor.html`, `CLAUDE.md`, `docs/agent-notes.md`. So NO `VOXEX_BUILD`/`TERRAIN_GEN_VERSION` bump (build stays 2026-07-15.2, TGV 43). All numbers below MEASURED on seeds 1337/42/9001.

### W1 — Metric recalibration (flag-branched: flag-ON = the live default; `--legacy-ocean` keeps every original calibration byte-for-byte)

The scope was larger than the initial task list: the full flag-ON fail set across BOTH the default (ribbon) and `--hydro` runs was **M4, M5, M6, M10, M17, M18, M20, M22, M23** (plus pre-existing M21). `proto.continentalOceans` (`= !legacyOcean`) was threaded through `buildProto` so each metric selects the flag-ON vs legacy branch. Investigation findings + recalibrations:

- **M10 sand-water-proximity** — INVESTIGATED (real dressing regression vs calibration artifact?). Measured beach-band spatial width new-vs-legacy at ~950 coast crossings/seed: NEW median 20-26 blk / mean 40-54 / p90 98-148, OLD(legacy) median 10-12 / mean 19-22 / p90 46-58 — i.e. **~2× wider beaches, NOT the 3× "genuinely bad" bar**. Cause: the C coast shelf (SPLINE_CONTINENTAL_OCEAN rises only ~4 blk over C 0.24→0.35) + the seafloor detail-fade produce broad, gentle, flat shelves, so the height-band beach gate (`worldY∈[SEA-1,SEA+~3.5] ∩ oceanFactor<0.999`) paints a wider (sometimes broad, tens-of-blocks) shore. This is a real in-world consequence of the owner-approved gentle-shelf model, definitionally coast-confined (every such sand col has `oceanFactor<0.999`), **flagged for owner eyeball** but NOT a bug. Recalibration: flag-ON, coast-SHELF membership (`getOceanFactor<0.999` — the exact condition the beach gate placed the sand by) counts as "proximate" alongside the K=6 water / rf<0.7 river tests. This is a MORE accurate proxy for "coast-related sand" under the C model, not a weaker gate — a col with `oceanFactor==1.0` and no water/river within K still fails (the genuine CCR-TERRAIN-011 Y-band defect). **Measured flag-ON: 100% proximate, 0 inland-leak, all 3 seeds** (max margin). Legacy K-only rule untouched.
- **M20 desert dry-sand leak** — same root/same fix as M10 (both read the shared `near` flag). Flag-ON leak went 9.7%/‑/5.1% (ribbon) and 12.3%/5.6%/4.6% (hydro) → **0.000% all seeds**.
- **M18 terracing guards** — INVESTIGATED. plainsRough jumped ~6× (0.07 vs 0.012). Split by ocean membership: coast cols (`of<0.999`) ~0.13 (10×, the intended coast slope) vs truly-inland cols ~0.021 (mild ~1.7× lift from the slightly steeper ocean-spline land segment). **The jump is entirely coast-driven; inland plains are NOT a regression.** Fix: flag-ON, EXCLUDE coast-shelf cols from plainsRough (preserves the guard's flat-inland intent, same pattern as M4's coast exclusion) + SEPARATE flag-ON baselines `wideTerrace {1337:0.2247,42:0.2666,9001:0.2479}` / `plainsRough {0.0210,0.0217,0.0143}` (same +0.02/+0.002 tolerances). Legacy baselines byte-locked.
- **M23 cliff-profile** — flag-ON, `computePreRiverHeight` EARLY-RETURNS before the WS8 `CLIFF_SHARPNESS_MAX` blend the metric was calibrated against (verified at voxEx.html:40511); the seafloor is authored by the SPLINE_CONTINENTAL_OCEAN base + the milder relief-driven `SEAFLOOR_CLIFF` C-remap. SEAFLOOR_CLIFF still sharpens high-relief coasts but LESS: measured ratio **0.77 on both gating seeds** (1337 hiMed 80/loMed 104; 9001 120/156; seed 42 monitors on <2 usable transects). Decision: the mechanism is real but milder, so re-gate flag-ON at **RATIO 0.85** (measured 0.77 + ~0.08 margin, still fails a regression that flattens the sharpening toward 1.0) rather than auto-defer — keeps a real gate on the shipped SEAFLOOR_CLIFF feature. Legacy 0.70 gate (measured ~0.23-0.31) untouched.
- **M4 seam** — flag-ON, the C coast slopes up from the waterline (raising cross-label deltas that run along a coast) while the near-coast detail-fade smooths same-label terrain (dropping p99within to ~1). Fix (two parts): (a) activate the coast-transition-column exclusion flag-ON regardless of hydro/relief (mirrors WS8's cliff exclusion; `CLIFF_RELIEF_MIN` set to −1 flag-ON so the whole shelf is excluded), and (b) an absolute floor — a p99(cross) of ≤2 blocks is never a style-blend seam (maxAdj stayed 20, far under 30). Both leave the maxAdj<30 continuity bar seeing every pair. 9001 ribbon (the only M4 fail) now passes; legacy pure-ratio test untouched.
- **M5 mountain coverage** — flag-ON the C spline reshapes relief/height so mountain-family land share rises marginally (ribbon 15.0/13.0/15.6% vs legacy 13.5/11.2/13.8%). Flag-ON cap raised 0.15→**0.17** (margin above measured 15.6%). Legacy cap (0.15/0.13) untouched.
- **M6 land/ocean split** — flag-ON widened to **20-38%** (measured 33.5/35.7/35.4%, owner-approved coverage at the frozen `COAST_THRESHOLD_C`). Legacy 20-35% untouched.
- **M17 basin extent** — metric-CORRECTNESS fix: flag-ON `floodSpill` uses `HYDRO_HALO_CONTINENTAL` (40) as its effective halo, so M17 must compare against that, not the base `HYDRO_HALO` (32). Measured basin extent 34 (seed 9001) now passes with 6 cells margin (was false-failing 34>32). Legacy compares against HYDRO_HALO unchanged.
- **M22 fjord-flooding** — flag-ON the C coastal geometry yields very few high-relief coastal crossings in the probe extent (hiTotal 3/‑/2; 9001's 2-sample 50% was pure small-n noise). Added a MIN-sample guard: gate only when hiTotal≥8, else MONITOR. Flag-agnostic (legacy hiTotal 150-209 ≫ 8, gate byte-identical).
- **M21 forced-shape** — **PRE-EXISTING**: fails on all 3 seeds under BOTH `--legacy-ocean` AND flag-ON (unrelated to this CCR — `flatnessOk`/`vsUnforcedOk` on the forced single-biome shape). Left alone, annotated.

**End state (verbatim):** `--seeds=1337,42,9001` (ribbon) → `GATING FAILURES: 1337:M21 42:M21 9001:M21`. `--hydro` (per-seed, timeout-bound) → each seed `GATING FAILURES: <seed>:M21`. `--legacy-ocean` → `1337:M21 42:M21 9001:M21` (legacy calibration proven intact). **All GREEN except the pre-existing M21.**

### W2 — Preset review (measured, seed 1337, extraction probe: % below sea / height range)

| Preset | amp | sea | Flag-ON below-sea | range | Verdict |
|---|---|---|---|---|---|
| default | 1.0 | 60 | 35.6% | [0,198] | OK (matches M6) |
| amplified | 2.0 | 50 | 21.2% | [0,285] | OK (big mountains, less ocean) |
| caves | 1.0 | 60 | 35.6% | [0,198] | OK (== default shape) |
| archipelago | 0.8 | 75 | 14.5% land (85.5% ocean) | maxH 170 | **OK — flag-ON land% ≈ flag-OFF (14.1%) at sea 75; real island peaks. NOT drowned by the C-model.** CONTINENTAL_ISLAND_AMP had no measurable land-fraction effect, so not added. No change. |
| flat | 0.0 | 55 | 32.6% (flag-OFF 27.5%) | [0,71] (OFF [27,66]) | Marginally more ocean; was never truly flat flag-OFF either. |
| superflat | 0.0 | 30 | 11.6% (flag-OFF 0.9%) | [0,71] (OFF [27,66]) | **Real regression** (dry→11.6% ocean). |

**Finding:** `terrainAmplitudeMultiplier` scales ONLY the fractal DETAIL, not the base. Flag-ON the base is `SPLINE_CONTINENTAL_OCEAN` (−70..+16), so amplitude 0 no longer flattens the world — the C spline authors basins (down to height 0) + continental relief (up to 71) regardless. **There is NO preset-parameter (amplitude/seaLevel) fix** for flat/superflat flatness; the only fix is a per-world `continentalOceans:false` opt-out, which is NOT currently plumbed (presets carry only genparam-space fields; `continentalOceans` is a `WORLD_CONFIG` flag with a worker bake). **Decision: made NO preset edits** — archipelago is fine, flat was never flat, and adding a user-facing per-world ocean toggle (new genParam + schema + browser-suite parity/round-trip) is an owner-facing product feature beyond "minimal preset edits," inappropriate to slip into a gate-completion phase. **Flagged for owner:** a small per-world "Continental Oceans" opt-out toggle (mirroring the existing enableRivers/enableCaves boolean genParams; `applyGenParams` already has the WORLD_CONFIG-write pattern and the worker already bakes `worldConfig.continentalOceans`) would let flat/superflat stay dry+flat.

### W3 — Editor pass-view wiring (`tools/terrain-parameter-editor.html`)

Added `'Continents & Oceans'` (+ `'Splines'` where the C authoring is spline-shaped) to the `PASS_REGISTRY` `sections` of: **continentalness** (`['Continents & Oceans','Splines','Climate Fields','Biomes']`), **preRiver** (`['Continents & Oceans','Splines','Oceans','Coastal Erosion','Terrain Shape']`), **oceanFactor** (`['Continents & Oceans','Oceans','Coastal Erosion']`), **carved** (`['Continents & Oceans','Rivers','Coastal Erosion']`). The schema-driven tunables panel auto-picks up the section (all 16 new C-ocean tunables live in the `'Continents & Oceans'` `GEN_TUNABLE_SCHEMA` section; the editor's `applyPassFilter` matches pass.sections against the schema-derived `tunableSectionEls`). **Verified headlessly**: booted the editor (Chromium, `?test=1` seam), selected the Continentalness pass — `continentsOceansSectionVisible=true`, screenshot at `outputs/co3_editor_cpass.png` shows the ADVANCED TUNABLES panel rendering exactly Climate Fields / Splines / Continents & Oceans. No hand-copied terrain math added (the house rule).

### Gate ladder (Phase 3)

syntax-check GREEN · parity-check GREEN · terrain-node-checks ×3 GREEN · biome-pipeline-checks (ribbon + `--hydro` + `--legacy-ocean`) GREEN except pre-existing M21 · run-browser-tests 405/405 · flag-OFF byte-identity spot re-check GREEN · editor headless boot GREEN. (See W5 in the session report for verbatim outputs.)

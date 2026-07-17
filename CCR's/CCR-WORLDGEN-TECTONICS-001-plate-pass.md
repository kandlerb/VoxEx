# CCR-WORLDGEN-TECTONICS-001 — Tectonic Plate Pass

**Status:** P0 prototype DONE (validated in `tools/scratch/tect_core.mjs`); implementing Phases 1-2 (owner pulled editor-testability forward).
**Baseline:** build 2026-07-15.3, TGV 43. Extends CCR-WORLDGEN-CONTINENTAL-OCEANS-001 (dispatcher-at-source, flag + live getter + worker bake, flag-OFF byte identity).
**Reference implementation:** `tools/scratch/tect_core.mjs` is the VALIDATED formula source. The port translates it into injected voxEx.html functions reading GEN_TUNABLES aliases. When this doc and tect_core.mjs disagree on a formula, tect_core.mjs wins (it carries the P0.2 fixes).

## Problem / owner vision

Continentalness is a noise blob; the owner wants continents that FORM: plates whose collisions place mountains (orogenic belts, subduction + back-arc basins, obduction), whose separations place rifts/ridges, oceanic plates giving 60-70% ocean, island arcs as habitable strips, eroded shore variation (rocky at active margins, beaches at passive), and (future CCR) volcanoes at junctions.

## Approach

[v2 pivot: crust fbm authors C shape; plates tint + segment features — see Phase 2g] Seeded jittered-lattice Voronoi plate field over a domain-warped query point; per-plate type/age/drift from hashes; boundary regime classification from relative drift; regimes emit deltaC (continentalness modification) and upliftR (relief). Plate C REPLACES the fbm-blob C flag-ON (fbm survives as interior detail at TECTONIC_DETAIL_WEIGHT); uplift screen-blends into relief: `R_eff = R_noise_capped + (1-R_noise_capped)*R_tect` with `R_noise_capped = min(R_noise, R_BASELINE_CAP)`. Trenches/arcs/rifts flow through C → SPLINE_TECTONIC_OCEAN → height AND through C → oceanFactor, so ocean mask and depth always agree (single-authority, the C-oceans lesson).

## Flags / plumbing (WS6-P8 four-site rule — CRITICAL)

- `WORLD_CONFIG.tectonicPlates: false` (DEFAULT OFF — soak; owner tests via editor/create-world toggle).
- Live getter `get tectonicPlates()` beside `get continentalOceans()`; worker bake line beside the continentalOceans bake; live-vs-boot flag test in voxex-tests.html.
- genParams key `tectonicPlates` (16th key... verify current count = 14; this makes 15), default false, GEN_PARAM_SCHEMA toggle row (section 'Terrain Shape', icon '🌋'), applyGenParams: `WORLD_CONFIG.tectonicPlates = p.tectonicPlates === true;` AND coercion `if (p.tectonicPlates === true) WORLD_CONFIG.continentalOceans = true;` (tectonics requires C-oceans). collectGenParamsFromUI/applyPreset carry it; flat/superflat presets set it false.
- Flag-OFF must be BYTE-IDENTICAL to TGV 43 (proof: ≥14400 cols ×3 seeds vs pre-edit extraction).
- Flag-ON = TGV 43→44 when it becomes default; while default OFF, bump TGV anyway? NO — TGV bump only when the DEFAULT output changes. Default stays OFF in this drop → NO TGV bump yet (the flag-ON path is experimental/editor-facing). VOXEX_BUILD bump + recent-changes entry required.

## New injected functions (single-source main thread; add to terrainFuncs list + extract-terrain FUNCS)

`plateHash32(cx,cz,seed,salt)`, `plateLookup(gx,gz,seed)` (warped 5×5 Voronoi, perpendicular-bisector dEdge, per-plate props, single-slot column memo at module scope `_plateMemo*`), `tectonicDeltaC(gx,gz,seed)`, `tectonicUpliftR(gx,gz,seed)`, `tectonicReliefBlend(gx,gz,rNoise)`, `tectonicFeatureAt(gx,gz,seed)` (NONE=0/TRIPLE_JUNCTION=1/ARC_PEAK=2/RIFT_VENT=3 — data only, no cones; do NOT touch featureAt/GEN_PASS.FEATURES), `tectRegimeAt(gx,gz,seed)` (0-7 diagnostic for the editor pass; injected or seam-only — implementer's call, seam needs it either way).

Exact formulas: port from tect_core.mjs — plate hash mix, query warp (2-octave noise2D, amp BOUNDARY_WIGGLE_AMP, freq BOUNDARY_WIGGLE_FREQ), jittered sites (PLATE_JITTER), regime kernels bump/band, per-boundary segStrength hash, the P0.2 rift sill/dam + lake-segment smoothing (RIFT_SILL_LIFT_C / RIFT_SILL_DEPTH_KEEP / RIFT_LAKE_BLEND / RIFT_LAKE_PROB / RIFT_LAKE_DEEPEN_C / RIFT_SEG_LEN), obduction variant, ridge clamp below coast.

**Known prototype issue to fix during port:** baseline C uses second-nearest-site values that can flip discontinuously near medial axes/junctions (~100-block same-regime cliffs observed). Requirement: make the plate-baseline term continuous by construction (e.g. smooth distance-weighted blend over nearby sites instead of a hard s2 mean). Gate: no same-regime adjacent-column step >30 attributable to baseline flips (transect check across a junction).

## Flag-ON integration points (all guarded; flag-OFF textually unchanged)

1. `continentalHeight`: flag-ON → `c = plateBaseC_eff + tectonicDeltaC + (fbmBlend_without_bias) * TECTONIC_DETAIL_WEIGHT`, clamp [-1,1]. (fbmBlend = base*CONTINENTAL_BASE_WEIGHT + erosion*CONTINENTAL_EROSION_WEIGHT, NO CONTINENTAL_SEA_BIAS.)
2. `oceanFactorFromC`: flag-ON uses COAST_THRESHOLD_TECT / COAST_SHELF_TECT instead of COAST_THRESHOLD_C / COAST_SHELF_C (tectonic C domain has waterline ≈0.10, not 0.24). Island micro-layer knob applies unchanged.
3. `terrainSurface`: flag-ON base spline = SPLINE_TECTONIC_OCEAN (not SPLINE_CONTINENTAL_OCEAN); relief wrapped in `tectonicReliefBlend` (ALSO wrap in `reliefParam` — the two sites must stay value-identical; forced-single-biome path unchanged). SEAFLOOR_* fade uses the TECT coast threshold flag-ON.
4. `computePreRiverHeight`/`getPreRiverHeight`: NO CHANGE (already early-return under continentalOceans, which tectonics implies).
5. Rivers/hydro: UNCHANGED this drop. KNOWN LIMITATION: flag-ON river connectivity is degraded (P0 measured; endorheic-basin termination is designed but NOT implemented). Acceptable — this drop is for editor terrain testing; river work is a follow-up phase in this CCR.

## New GEN_TUNABLES section 'Tectonics' (defaults = P0-calibrated; ui:'both'; all into REGISTRY_KEYS; spline into JSON_KEYS)

PLATE_SIZE 3000 [600,16000] (master zoom — all boundary widths/offsets scale linearly, authored at reference 12000; crust decoupled — plate size no longer dictates continent size, only belt spacing/plate identity) · PLATE_JITTER 0.42 [0.25,0.5] · PLATE_OCEANIC_FRACTION 0.68 [0.5,0.8] · PLATE_DRIFT_SCALE 1.0 [0.5,2] · BOUNDARY_WIGGLE_AMP 350 [100,700] · BOUNDARY_WIGGLE_FREQ 0.0004 [0.0002,0.001] · BOUNDARY_INFLUENCE 2600 [1000,3000] · TECT_CONV_THRESH 0.08 · TECT_DIV_THRESH 0.25 · TECT_SHEAR_MIN 0.3 · TECTONIC_DETAIL_WEIGHT 0.35 [0.1,0.6] (DEPRECATED ui:'hidden' — unused since crust-field pivot; in tests' hidden-keys list) · TECT_CRUST_AMP 1.0 [0.5,1.5] · TECT_CRUST_BIAS 0.05 [-0.1,0.3] (ocean amount) · TECT_CRUST_FREQ_MULT 0.08 [0.1,1] (continent size) · TECT_PLATE_TINT 0.2 [0,0.6] · TECT_FEATURE_KEEP 0.45 [0.1,1] · TECT_FEATURE_SEG_LEN 3000 [1000,8000] · R_BASELINE_CAP 0.55 [0.4,0.8] · CONT_BASE_C_MIN 0.35 · CONT_BASE_C_MAX 0.55 · OCEAN_BASE_C_MIN 0.15 · OCEAN_BASE_C_AGE 0.15 · TECT_INTERIOR_FALLOFF 0.15 (DEPRECATED — superseded by TECT_SMEAR, schema ui:'hidden', key kept for save-compat) · TECT_SMEAR 0.55 [0.15,1.5] (plate-baseline bleed — kernel radius as fraction of PLATE_SIZE over all 5×5 sites; low = crisp Voronoi cells, high = rolling continents; boundary belts stay sharp) · TECT_QUIET_LO 0.12 [0,0.3] · TECT_QUIET_HI 0.50 [0.2,1.0] (boundary features scale by smoothstep(LO,HI, |convergence|+shear/2) — lazy seams go quiet) · TECT_SEG_FLOOR 0.15 [0,0.6] (per-segment strength floor; was hardcoded 0.35-0.65 range) · OROGEN_WIDTH 2600 [600,3000] · OROGEN_AMP 1.40 [0.5,1.6] · TRENCH_DEPTH_C 0.30 [0.1,0.5] · TRENCH_OFFSET 250 · TRENCH_WIDTH 350 · ANDEAN_AMP 1.35 · ARC_INLAND_OFFSET 600 · ARC_WIDTH 1200 · ARC_C_LIFT 0.42 [0.2,0.6] · ARC_OFFSET 500 · ARC_WIDTH_ISL 750 · ISLAND_ARC_AMP 1.25 · BACKARC_DEPTH_C 0.16 · BACKARC_OFFSET 1400 · BACKARC_WIDTH 800 · RIFT_DEPTH_C 0.70 [0.4,0.9] · RIFT_WIDTH 600 [400,1000] · RIFT_SHOULDER_AMP 0.30 · RIFT_SILL_LIFT_C 0.30 · RIFT_SILL_DEPTH_KEEP 0.35 · RIFT_LAKE_BLEND 0.28 · RIFT_LAKE_PROB 0.42 · RIFT_LAKE_DEEPEN_C 0.55 · RIFT_SEG_LEN 4200 · RIDGE_LIFT_C 0.18 · RIDGE_WIDTH 800 · TRANSFORM_AMP 0.10 · TRANSFORM_WIDTH 350 · OBDUCTION_PROB 0.05 · OBDUCTION_AMP 0.9 · JUNCTION_RADIUS 900 · ARC_PEAK_DENSITY 0.02 · RIFT_VENT_DENSITY 0.01 · COAST_THRESHOLD_TECT 0.10 [0,0.2] · COAST_SHELF_TECT 0.05 [0.02,0.15] · SPLINE_TECTONIC_OCEAN (json) = [[-0.62,-150],[-0.52,-98],[-0.42,-64],[-0.3,-40],[-0.2,-26],[-0.1,-15],[-0.02,-6],[0.04,-3],[0.1,0],[0.18,4],[0.32,8],[0.5,12],[0.72,16]]

(Where tect_core.mjs param names differ, keep tect_core VALUES, use the names above in the registry.)

## Seam exports (window.VoxEx) for the editor

`plateLookup` (or a lean `plateIdAt`), `tectRegimeAt`, `tectonicUpliftR`, `tectonicDeltaC`, `tectonicFeatureAt`.

## Editor (tools/terrain-parameter-editor.html)

New passes in PASS_REGISTRY (group "Tectonics"): `plates` (bespoke renderFn renderPlateMap: plate id → muted pastel tinted by type, boundary bands dEdge<500 colored by regime, coastline contour — port the styling from tools/scratch/tect_plates_diag_map.mjs), `uplift` (sampler tectonicUpliftR, unitGray), `tect_deltaC` (sampler tectonicDeltaC, signedGray). All three: sections ['Tectonics']. Add 'Tectonics' to sections of continentalness/relief/preRiver/oceanFactor/carved passes. The genParams tectonicPlates toggle appears automatically (schema-driven).

## P0 record (prototype, tools/scratch/)

- Calibrated: ocean 64-70% ×3 seeds (multi-window); plate count sane; trench ≤−90; coherence 100% at cap 0.5.
- P0.2 sweeps: R_BASELINE_CAP frontier → 0.55 adopted (mountains ~7%, snowy ~5%, coherence 67-78%; the ≥70% coherence gate restated to ≥60% — owner intent allows interior cratonic ranges). Rift lakes structurally impossible without sills → sill/dam mechanism added + segment smoothing (fixed a real 102-block segment-boundary cliff); enclosed lakes verified on seeds VoxEx/777/mountain (seed 1337 has no interior rifts — geometric, not a bug). Hydro connectivity NOT halo-solvable (stuck pits are flat near-sea interior plains, not walled basins; halo 128 still fails) → owner-approved redesign: endorheic terminal basins (NOT YET IMPLEMENTED — open follow-up).
- Do-not-retry: bigger HYDRO_HALO to fix tectonic river connectivity (measured: wrong failure mode, 4-6× cost for <50% recovery); rift depth/width tuning to create enclosed lakes (topologically impossible without sills).
- Perf: full tectonic surface ≈4.2µs/col cold, cheaper than current blendedHeight (~20µs); plate lookup dominated by 5×5 Voronoi — column memo is load-bearing.

## Open follow-ups (later phases of this CCR)

Endorheic river termination + connectivity gate redo · spawn land-search fix (findAndSetSpawnPosition — critical before flag-ON default) · metric harness recalibration (M6 55-75% band flag-ON etc.) · tectonic shore GRAVEL/STONE dressing + isTreeSoilSurface mirror · Pangaea/Archipelago-v2 presets · flip default ON + TGV 44 after owner in-game eyeball · volcano cones CCR riding tectonicFeatureAt.

## As-built

### Phase 1 (plate field, inert) — [fill] (record captured in VOXEX_RECENT_CHANGES build 2026-07-16.1)

### Phase 2a (flag-ON height-path wiring) — SHIPPED build 2026-07-16.2, NO TGV bump

Wires the Phase-1 plate field into the terrain height path at five points, ALL guarded on
`worldConfig.tectonicPlates === true`, so flag-OFF (the default) stays byte-for-byte TGV 43.
Editor passes (PASS_REGISTRY plates/uplift/tect_deltaC + seam wiring) are DEFERRED to Phase 2b.

**Integration points (by grep anchor, verified in the shipped build):**

1. `continentalHeight` (grep `if (worldConfig.tectonicPlates === true)` in continentalHeight, ~L41908):
   flag-ON returns `clamp(plateLookup(gx,gz,seed).plateBaseC + .deltaC + fbmBlend * TECTONIC_DETAIL_WEIGHT)`,
   `fbmBlend = base*CONTINENTAL_BASE_WEIGHT + erosion*CONTINENTAL_EROSION_WEIGHT` (NO CONTINENTAL_SEA_BIAS — the
   plate baseline is the level authority). The flag-OFF assembly (`c += CONTINENTAL_SEA_BIAS; return clamp(c)`) is
   textually unchanged. `continentalness()` delegates here, so oceanFactorFromC's C is plate-authored flag-ON.
2. `oceanFactorFromC` (grep `const _tect = worldConfig.tectonicPlates === true` ~L43209): one flag check picks
   `coast`/`shelf` = COAST_THRESHOLD_TECT/COAST_SHELF_TECT (waterline ≈0.10, not 0.24); island micro-layer unchanged.
3. `terrainSurface` (grep `_oceanSpline` ~L41659): inside the continentalOceans base branch `_tect` picks
   SPLINE_TECTONIC_OCEAN + COAST_THRESHOLD_TECT for the ocean-height spline, the SEAFLOOR_CLIFF remap band, and the
   detail fade; the inline `relief` is screen-blended via `tectonicReliefBlend` (~L41517), skipped for a forced
   single biome (`!forcedCentroid`).
4. `reliefParam` (grep `tectonicReliefBlend` in reliefParam ~L41432): same wrap of the SAME spline value, so the
   classifier's R axis and terrainSurface's inline relief remain one number by construction; forced short-circuit
   stays first, unchanged. VERIFIED value-identical: reliefParam === terrainSurface(...).relief 20/20 coords ×2 seeds.
5. `computePreRiverHeight`/`getPreRiverHeight`: NO CHANGE (verified). Both early-return under
   `worldConfig.continentalOceans === true` (skip the legacy oceanFloor lerp), and applyGenParams coerces
   `continentalOceans = true` whenever `tectonicPlates` is set (~L23206-23207) — so on every reachable path the
   SPLINE_TECTONIC_OCEAN-authored seafloor is never double-carved.

**Defensive-guard decision (point 5): NO guard added — the applyGenParams coercion is the single enforced invariant.**
The task floated adding `|| worldConfig.tectonicPlates` to the two preRiver early-returns to cover an editor
live-dial that sets WORLD_CONFIG.tectonicPlates directly (bypassing the coercion, leaving continentalOceans false).
Decision rationale:
- The coercion (~L23206-23207) enforces `tectonicPlates ⇒ continentalOceans` for EVERY path reachable this drop
  (create-world, presets, save/load). The bypassing live-dial path does not exist yet — editor tectonic passes are
  Phase 2b, and this drop explicitly does not touch the editor.
- A preRiver-ONLY guard would be INCOMPLETE/misleading: under uncoerced tectonic, terrainSurface's ocean base
  branch (~L41638, guarded on continentalOceans) falls to SPLINE_CONTINENTAL on tectonic C, and getOceanFactor
  (~L43222) dispatches to the legacy noise ocean — so the finalHeight fed INTO preRiver is already wrong before
  the lerp. Guarding only preRiver fixes the least of it.
- The complete fix (unify all FOUR ocean-path guards — computePreRiverHeight, getPreRiverHeight, terrainSurface
  ocean branch @L41638, getOceanFactor dispatch @L43222 — to `continentalOceans === true || tectonicPlates === true`)
  is byte-identical for every currently-reachable config, but adds defensive code for a path only reachable once
  Phase 2b lands. Deferred (YAGNI for this drop).
- CONTRACT for Phase 2b: its apply path MUST either preserve the coercion (set continentalOceans=true whenever
  tectonicPlates is dialed on) OR unify those four ocean-path guards together — never guard preRiver alone.
  (Confirmed live: buildTerrainApi does NOT run the coercion, so the flag-ON smoke had to pass
  `{continentalOceans:true}` explicitly — a miniature of exactly this bypass.)

**Gates (independently re-run this session; §7 mount was truncated near EOF at L52885 — see findings):**
- syntax-check: GREEN (module script lines 4212-53882 parse) — run on a reconstructed coherent copy (mount's
  byte-correct prefix through L52884 + HEAD's structurally-identical tail; all Phase-2 edits live in the prefix).
- parity-check: GREEN (all lockstep copies + 6 injection markers intact; terrain funcs single-sourced → the worker
  gets the flag-ON branches via injection automatically).
- terrain-node-checks ×3 (VoxEx/1337/9001): ALL HARD CHECKS GREEN (default flag OFF — output unchanged).
- flag-OFF byte identity vs HEAD (TGV 43): 7200 cols ×2 seeds (VoxEx/1337), 0 mismatches, maxAbsDiff=0
  (current-file flag-OFF blendedHeight === HEAD blendedHeight — proves BOTH Phase 1 and Phase 2 flag-OFF neutral).
- flag-ON smoke (buildTerrainApi {tectonicPlates:true, continentalOceans:true}):
  (a) computeSurfaceHeight 500/500 finite (0 NaN, 91/99 distinct); blendedHeight 250/250 finite (0 NaN, varies, h∈[1,75]).
  (b) ocean fraction (surface<sea) over a large multi-plate span (160,000 cols): 67.6% (VoxEx) / 71.5% (1337) — in the
      55-75% band. (A single 16,384² step-64 window ≈1.4 plates at PLATE_SIZE=12000, reads 0-100% by placement — not representative.)
  (c) full-population reliefParam: OROGENIC meanR 0.388/0.361 > NONE meanR 0.227/0.228 (both seeds); mean tectonicUpliftR
      0.203/0.176 at OROGENIC vs exactly 0.000 at NONE — collision-belt uplift fires only where designed. (A first-20-raster
      subsample for 1337 read oro<none — spatial clustering + high-relief cratonic NONE interiors; the full population resolves it.)
  (d) getOceanFactor==0 for continentalness < COAST_THRESHOLD_TECT−0.05: 20/20; ==1 for > coast+shelf+0.05: 20/20 (both seeds).
  (e) reliefParam === terrainSurface.relief: 20/20 exact (both seeds).

**Findings / deviations:**
- extract-terrain.mjs (a tools file, OUT of this drop's edit scope) is MISSING the `_plateMemo*`/`_plateSiteCache`
  module-scope mirror decls that plateLookup references — its flag-ON path ReferenceErrors (`_plateMemoKey is not
  defined`). Phase-1 harness gap (Phase 1 added the tectonic FUNCS + return exports but not the module decls, unlike
  the `_riverFlowScratch` "declared pre-emptively" discipline the same file already follows). Worked around by
  running the flag-ON smoke against a PATCHED /tmp scratch copy (repo tools file left pristine). FOLLOW-UP for the
  tools owner: add `const _plateSiteCache = new Map(); let _plateMemoKey = null; let _plateMemoVal = null;` to
  extract-terrain's module-decl block so the shipped harness runs flag-ON.
- §7 recovery: the Cowork mount served voxEx.html truncated mid-line at L52885 (real EOF L53888/`</html>`). No edits
  to voxEx.html were needed (implementation already shipped), so the real file was intact; syntax-check ran on a
  reconstructed copy per §7. All other tools operate on the terrain functions (in the coherent prefix) and ran directly.
- Rivers/hydro UNCHANGED; flag-ON river connectivity is the documented degraded limitation (endorheic termination not
  yet implemented). flag-ON blendedHeight is hydro-cold-build heavy (~5.7s/250 clustered cols), so the smoke's
  blendedHeight sample was clustered/reduced vs the surface sample.

### Phase 2b (editor passes + seam) — [fill: deferred to the editor-wiring drop]

### Phase 2c — plate-driven relief tuning (2026-07-16)

Three measured sweeps against the Phase 2a flag-ON height path; two constants rebaselined (recorded above in
the 'New GEN_TUNABLES section' table), one kept at its prior default.

- **TRANSFORM_AMP** {0.22, 0.10, 0.06} on seed 9001: at 0.22, 0.43% of transform-land columns exceeded relief
  0.6 (max 0.609); at 0.10, 0% exceeded 0.6 (max 0.569, scarp character kept). Baked **0.10**.
- **TECT_CONV_THRESH** {0.25, 0.15, 0.08} ×2 seeds, 24576² windows: orogenic+subduction share of boundary
  columns rose 8.3%→17.1% on seed 9001 at 0.08; divergent share unaffected (~23-26%, governed by
  code-independent thresholds). Seed 1337's origin window has zero cont-cont/oc-cont pairs at ANY threshold
  tested — a plate-geometry artifact of that window, not a threshold effect. Baked **0.08**.
- **PLATE_OCEANIC_FRACTION** {0.68, 0.62, 0.58} ×2 seeds, 5-window ocean means: 0.62 → 56.8% ocean, breaching
  the owner's ≥60% floor; 0.58 measured worse. Cont-cont contact share does rise as the fraction drops
  (11.6%→24.6% on seed 1337), but the ocean-share constraint binds first. **Kept 0.68** (no change). A
  shallower cut (~0.65-0.66) is untested — noted as a possible future micro-sweep.
- **Interior guarantee (measured):** interior (non-boundary) columns cannot exceed relief 0.55 — the
  `R_BASELINE_CAP` — verified holding under all three sweeps above. All mountain-grade relief is therefore
  boundary-driven after this tuning pass; the prior "mountains feel random" complaint was TRANSFORM_AMP leakage
  into non-scarp terrain plus convergent-boundary rarity at the old TECT_CONV_THRESH, not a lack of interior cap.

### Phase 2d — plate-size rescale (2026-07-16, build .5)

Owner play-tested PLATE_SIZE 12000 as "absurdly massive" and dialing it straight down to 1200 made whole plates
mountainous, because every boundary distance (BOUNDARY_INFLUENCE 2600, OROGEN_WIDTH, etc.) was still an absolute
constant larger than the new plate size — the whole plate fell inside the boundary-influence band. Fix: derive
`const S = PLATE_SIZE / 12000` inside `plateLookup` and `tectonicFeatureAt` (injected, so the worker copy and the
editor's live-dial both stay coherent with the main-thread source); every width/offset/junction-radius/segment-length
constant is scaled by `S`, wiggle amplitude scales by `S`, wiggle frequency scales by `1/S`. `TECT_INTERIOR_FALLOFF`
is already plate-relative (a fraction of plate size, not an absolute distance) and was left untouched. Default
PLATE_SIZE changed 12000 → 1200. Flag-OFF stays byte-unchanged (gates green). Sanity check: a 12000-block transect
now crosses 17 distinct plates (previously ~1-2 at the old default).

### Phase 2e — plate-baseline smear (2026-07-16, build .6)

Owner asked for continentalness to act as a smearing pass so plates bleed across each other,
preserving highs/lows but killing Voronoi grid-ness. Implemented as a distance-weighted kernel over
all 25 plate sites (weight (1−d/SMEAR_R)², SMEAR_R = TECT_SMEAR×PLATE_SIZE) replacing the old narrow
edge-band crossfade; C1-continuous by construction (weight + derivative vanish at radius); plate cores
keep their own baseC (only the home site is in kernel range there) so extremes survive; boundary regime
deltas untouched (belts/trenches sharp). Measured: baseline max adjacent |ΔC| 0.12 across a 6-plate
transect (no cell-edge jumps); combined C max Δ 0.195 at an intentional belt edge. Old baseline block
removed; TECT_INTERIOR_FALLOFF deprecated/hidden. Flag-OFF byte-unchanged, gates green.

### Phase 2f — quiet boundaries (2026-07-16, build .7)

Owner follow-through on dissolving Voronoi grid-ness — baseline smear (2e) alone was measured
near-invisible at default (renders: 0.55 ≈ 0.20, mean pixel Δ <1/255) because the grid is drawn by
boundary FEATURES tracing every seam, not the baseline. Fix: per-boundary activity modulation
qf=smoothstep(TECT_QUIET_LO,TECT_QUIET_HI, |c|+shear/2) multiplying each boundary's deltaC and upliftR
contributions at the single accumulation chokepoint (all regimes); regime CLASSIFICATION left
unmodulated so the editor's plates pass still shows seam types where features are quiet; segStrength
floor 0.35→tunable TECT_SEG_FLOOR 0.15 (range now floor..1.0). Measured (seed 1337, 8192²): deltaC
feature mass −6.6% at defaults, maxima at active points unchanged (qf≈1 there); modest at defaults —
the owner dials LO/HI up for stronger dissolution. Test suite: TECT_INTERIOR_FALLOFF added to the
hidden-keys parity list in voxex-tests.html (405/405 restored).

### Phase 2g — crust-field pivot (2026-07-16, build .9)

Owner verdict on v1 with renders: "game board with pieces stitched together; continents too geometric;
mountains don't form along ENTIRE plate lines... there are SOME across all those things; I want actual
continents like Earth's." Root cause: v1 made continents == plate polygons (plateBaseC dominated C).

v2: organic crust fbm field (own low-freq samples, TECT_CRUST_FREQ_MULT) authors continent shape;
plates contribute only a faint identity tint (TECT_PLATE_TINT 0.2) + boundary features; ALL regime
features (except rift, which self-segments via its lake/sill machinery — exempted to avoid
double-gating) now gate per-boundary-segment (TECT_FEATURE_KEEP 0.45, TECT_FEATURE_SEG_LEN, smooth
cross-fades) so belts appear along SOME stretches of a collision line. Measured at defaults, seed 1337:
ocean 67.4% (no calibration needed), interior crust max adjacent |ΔC| ≤0.018 (smooth), segmentation
confirmed as on/off runs along boundaries (20/30 near-zero, 10/30 substantial). This supersedes v1's
"Plate C REPLACES the fbm-blob C" premise — see the bracketed note in the Approach section above.

Crust-scale sweep (build .10): FREQ_MULT 0.35→0.08 (largest landmass 214→440 km² seed-avg, islands
1077→761, ocean mean 63%), BIAS 0.06→0.05; owner-reported "all islands, no continents" resolved.

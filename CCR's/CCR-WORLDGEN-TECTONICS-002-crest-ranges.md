# CCR-WORLDGEN-TECTONICS-002: Crest-line mountain ranges + regional erosion bake

> **Status: DRAFT (rev 2, two-phase)** — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-002 · **Build baseline**: 2026-07-16.10 (TGV 43) · **Author**: Claude (Cowork session 2026-07-17, owner-directed)
> **Phases**: A = crest-line envelope (kernel geometry) · B = regional stream-power erosion bake.
> Phase A alone is NOT acceptance-passing (owner rejected the envelope-only look — "fuzzy
> caterpillar"); it ships as the uplift INPUT to Phase B. Implement A then B in one arc.

## Problem / Why

Flag-ON (`tectonicPlates`) mountain belts are "stripes where the noise gets louder", not ranges.
`tectonicReliefBlend` raises `Reff = Rn + (1−Rn)·upliftR`, which only amplifies `terrainSurface`'s
ISOTROPIC ridged fbm (fundamental `FRACT_FREQ0` 0.0033 ≈ 300-block ridge wavelength). Nothing
creates a crest line or orients ridges along the range axis, so a belt renders as a patch of
300-block squiggle ridges (owner: "ranges of squiggles… not what I want"). Measured/demonstrated
2026-07-17 in the Node harness (buildTerrainApi, seed 1337): zoom render `w6_zoom.png` (current,
squiggle summit zone) vs `target_demo_v3.png` (crest-line algorithm — continuous jagged cordillera
with beaded summits, broken en-echelon foothill sub-ranges). Owner approved the target look.

Root cause is structural: the per-boundary loop in `plateLookup` computes exact cross-boundary
distance `d` and along-boundary coordinate `fAlong` per boundary, then throws both away after
evaluating `_bump(d, w)`. Every tunables-only attempt to fake a crest from `upliftR` alone
(4 prototypes: masked ridged add, envelope blend, gradient crest detector) stays blobby because
`upliftR` plateaus across the belt — the crest coordinates must be surfaced from the kernel.
Corroboration from procedural-terrain literature (aparis69 LearnProceduralGeneration, "Noise for
terrains"): fractal-noise mountains "lack the ridge structure typically found in real mountain
ranges"; the cure is explicit ridge/crest primitives, not amplified noise.

Owner requirements for the look (2026-07-17, refined over three review rounds):
1. Tall, wide ranges running ALONG plate boundaries (cordilleras), not noise patches.
2. Jagged, varying summits — beaded peaks, saddles, height variation; NOT one smooth continuous wall.
3. Multiple related ranges (parallel/en-echelon foothill sub-ranges with real gaps) that "make sense".
4. Keep the W6 landmass/ocean layout (approved earlier the same day).
5. **The map must read like real shaded relief** (owner rejected the envelope-only render:
   "Is that what a map of a mountain ridge looks like? (The answer is no)"). What real range
   maps have that noise lacks is DRAINAGE: a narrow sinuous divide with dendritic valleys
   carved into both flanks and branching spurs between them. Demonstrated 2026-07-17: a
   stream-power erosion simulation over the same envelope produces exactly that
   (`target_demo_v8_final.png`, owner-facing acceptance image; envelope-only comparator
   `target_demo_v3.png`). Erosion is a simulation over an area — it cannot be expressed as a
   pure per-column noise function — hence Phase B's regional bake.

## Approach

**Phase A — crest-line envelope (uplift input + interim look).** Surface the crest geometry from
`plateLookup` (dominant range boundary's signed `d`, `fAlong`, width, gated amplitude), then add
an explicit crest-profile height term in `terrainSurface` via a new injected function
`tectonicRangeHeight`: main massif `prof^1.5 · peaks · saddle`, sharp summit line, spur warp on
`d`, optional offset twin ridge. Scale DOWN the old relief amplification inside belts
(`RANGE_RELIEF_SWAP`). Ship the W6 tunable defaults in the same change.

**Phase B — regional stream-power erosion bake (the acceptance look).** Per orogen region, run a
coarse fluvial erosion simulation over the Phase-A envelope (D8 receivers → topological flow
accumulation → stream-power incision `min(cap, K·√A·slope)·beltGate` + talus relaxation +
divide-focused uplift for the first ~⅔ of iterations), cache the resulting Δh field per region,
and have columns add a bilinear sample of it. Architectural precedent: the hydro-rivers regional
lattice cache (`buildHydroRegion`/`hydroRegionCache`) — same region-key + halo + deterministic-
from-seed pattern. Reference implementation of the sim loop: `tools/scratch/tect002-erosion-sim.mjs`
(committed with this CCR) — its exact loop produced the acceptance image
`CCR's/CCR-TECTONICS-002-acceptance-target.png`; port it, don't reinvent it. The envelope
generator that feeds it is `tools/scratch/tect002-envelope-demo.mjs` (crest polyline stand-in —
in the real implementation the envelope comes from Phase A's `tectonicRangeHeight`).

REJECTED alternatives (add to agent-notes do-not-retry ledger at implementation):
- Tunables-only crest faking from `upliftR` (4 prototype variants, 2026-07-17): upliftR's plateau
  has no center-line information; results stay blobby/jittery. Structural, do not retry.
- Raising `R_BASELINE_CAP` for mountains (V4, 0.70): triples mountain area but produces isotropic
  "squiggly patch" mountains everywhere — owner explicitly rejected the look.
- Envelope + jagged-noise terms WITHOUT erosion (this CCR's own rev-1 design, target_demo_v3):
  owner rejected — reads as a uniform fuzzy wall, not a mapped range. Kept only as Phase A
  (uplift input), never as the shipped look.
- Pure-noise dendritic approximation (multiplicative ridged multifractal, crease-carving):
  valleys don't connect into drainage networks; ~60% of the look at best. Do not retry as a
  substitute for Phase B (fine as flank texture polish).
- VECTORIZED single-pass flow accumulation (numpy `np.add.at` style): does NOT cascade — every
  cell donates only its own area, rivers never gain power, erosion silently no-ops. Accumulation
  MUST be sequential in descending height order (measured failure 2026-07-17: two "eroded"
  renders visually unchanged before the fix).

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry citing this CCR (always)
- `TERRAIN_GEN_VERSION`: **no bump while `tectonicPlates` ships default-OFF** (flag-OFF output is
  byte-identical; precedent: CCR-001 Phase 2a). The eventual default-ON flip carries the bump.
- `CURRENT_CACHE_VERSION`: no
- `SETTINGS_VERSION`: no (GEN_TUNABLES defaults are not SETTINGS; genParams ride savePacket)

## Changes

### #1 — plateLookup: track + return the dominant RANGE boundary's crest coordinates

**Location:** grep `let deltaC = 0, upliftR = 0, domW = -1` in `voxEx.html` (the per-boundary
accumulation loop), and grep `const plateBaseC = wSum > 0 ?` (the memo return).
**Why:** the crest data already exists in-loop (`d`, `fAlong`, `ux/uz`, widths); surface it.

**Before (accumulation site, abridged):**
```js
const segFactor = regime === 4 ? 1 : segMix;
deltaC += dC * qf * segFactor; upliftR += dR * qf * segFactor;
const w = (dC < 0 ? -dC : dC) + dR;
if (w > domW) { domW = w; domRegime = regime; domConv = conv; domShear = shear; }
```

**After (sketch — exact var names at implementer's discretion):**
```js
const segFactor = regime === 4 ? 1 : segMix;
deltaC += dC * qf * segFactor; upliftR += dR * qf * segFactor;
const w = (dC < 0 ? -dC : dC) + dR;
if (w > domW) { domW = w; domRegime = regime; domConv = conv; domShear = shear; }
// CCR-TECTONICS-002: dominant RANGE boundary (uplift-building regimes only: 1 orogen,
// 2 Andean-arc side, 7 obduction). rangeAmp carries ALL along-range gates (qf, segMix,
// seg, cpos) so gaps/saddles/echelons fall out of the existing segment machinery.
const rw = dR * qf * segFactor;
if ((regime === 1 || regime === 2 || regime === 7) && rw > rangeScore) {
    rangeScore = rw;
    rangeD = d;                     // cross-range distance (bisector-perpendicular)
    rangeAlong = fAlong;            // along-range arc coordinate
    rangeW = (regime === 1 ? OROGEN_WIDTH : regime === 7 ? OBDUCTION_WIDTH : ARC_WIDTH) * S;
    rangeAmp = Math.min(1, rw);     // 0..1 gated strength
}
```
Init `let rangeScore = 0, rangeD = 0, rangeAlong = 0, rangeW = 1, rangeAmp = 0;` beside the other
accumulators, and add `rangeD, rangeAlong, rangeW, rangeAmp` to the returned/memoized object
(grep `const plateBaseC = wSum > 0 ?` — extend the memo literal).

**AUDIT NOTE:** `d` in the Andean branch is the raw boundary distance, but the arc band is OFFSET
inland (`ARC_INLAND_OFFSET`). For regime 2, store `rangeD = d - ARC_INLAND_OFFSET * S` so the crest
line sits on the arc band's center, not the trench-side bisector.

**Verify:** editor `?test=1` console: `VX.plateLookup(x,z,seed)` returns the 4 new fields; values
continuous across a belt transect (no NaN, rangeAmp 0 outside belts).

### #2 — new injected function `tectonicRangeHeight` (the crest-profile term)

**Location:** insert after `function tectonicReliefBlend` (grep `function tectonicReliefBlend`).
**Why:** single place that turns crest coordinates into height; injected so worker/main stay
single-source.

**After (new code, calibrated in the 2026-07-17 target demo — `target_demo_v3.png`):**
```js
function tectonicRangeHeight(gx, gz, seed) {
    const _pl = plateLookup(gx, gz, seed);
    const amp = _pl.rangeAmp;
    if (!(amp > 0.02)) return 0;
    const W = _pl.rangeW * (0.7 + 0.4 * (0.5 + 0.5 * noise2D(_pl.rangeAlong * RANGE_WIDTH_VARY_FREQ + 9.1, 5.5)));
    // spur warp: organic flanks + kills straight wall edges (relative to range width)
    const dWarp = _pl.rangeD + noise2D(gx * RANGE_SPUR_FREQ, gz * RANGE_SPUR_FREQ) * RANGE_SPUR_AMP * W;
    const prof = Math.max(0, 1 - Math.abs(dWarp) / W);
    if (prof <= 0) return 0;
    // jagged beaded peaks (ridged 2D at bead wavelength) + long saddles (along-coordinate)
    const peaks  = 0.40 + 0.60 * (1 - Math.abs(noise2D(gx / RANGE_PEAK_WAVELEN + 3.1, gz / RANGE_PEAK_WAVELEN + 1.1)));
    const saddle = 0.80 + 0.20 * noise2D(_pl.rangeAlong / RANGE_SADDLE_WAVELEN - 8.8, 4.4);
    // massif + summit line + two jagged ridged-detail octaves
    let hAdd = Math.pow(prof, 1.5) * peaks * saddle
             + 0.30 * Math.pow(prof, 5) * peaks
             + RANGE_JAG * Math.pow(prof, 1.9) * (1 - Math.abs(noise2D(gx / 210 + 31, gz / 210 - 17)))
             + RANGE_JAG * 0.45 * Math.pow(prof, 1.4) * (1 - Math.abs(noise2D(gx / 95 - 7, gz / 95 + 23)));
    // optional twin foothill ridge (en-echelon: its own gate hash via the segment machinery
    // is already folded into amp; the offset band creates the parallel range)
    if (SUBRANGE_AMP > 0) {
        const d2 = Math.abs(Math.abs(dWarp) - SUBRANGE_OFFSET * (PLATE_SIZE / 12000));
        const p2 = Math.max(0, 1 - d2 / (SUBRANGE_WIDTH * (PLATE_SIZE / 12000)));
        hAdd += SUBRANGE_AMP * Math.pow(p2, 1.6) * peaks;
    }
    return RANGE_H * amp * hAdd;
}
```

**AUDIT NOTE:** all noise2D offsets/frequencies above were eyeballed-calibrated in the session's
target demo; treat as starting values, re-render the acceptance windows (below) before shipping.

**Verify:** `node tools/syntax-check.mjs`; transect plot (probe) shows a single-peaked profile with
beads, zero outside belts.

### #3 — terrainSurface: add the range term, demote relief amplification inside belts

**Location:** grep `relief = tectonicReliefBlend(gx, gz, relief);` in `terrainSurface`
(and the mirrored consumer in `reliefParam` — grep `? tectonicReliefBlend(gx, gz, rNoise)`).
**Why:** mountains should COME FROM the crest term; the fbm becomes flank texture.

**Before:**
```js
if (worldConfig.tectonicPlates === true && !forcedCentroid) relief = tectonicReliefBlend(gx, gz, relief);
```

**After (terrainSurface only — height output side):**
```js
if (worldConfig.tectonicPlates === true && !forcedCentroid) relief = tectonicReliefBlend(gx, gz, relief);
// (…at the function's final height accumulation, grep the return/height combine site:)
// CCR-TECTONICS-002: explicit crest-line range term (flag-ON only)
if (worldConfig.tectonicPlates === true && !forcedCentroid) h += tectonicRangeHeight(gx, gz, s);
```
And inside `tectonicReliefBlend` (grep `let Reff = Rn + (1 - Rn) * uR;`):
```js
let Reff = Rn + (1 - Rn) * uR * (1 - RANGE_RELIEF_SWAP);  // demoted: fbm is flank texture now
```

**AUDIT FLAG:** find the actual final height combine variable in `terrainSurface` (post
PEAK_AMP/NOTCH_LIFT block) — do NOT add the term before the spline/base addition or it will be
scaled by amplitude multipliers twice. Implementer must read the tail of `terrainSurface` first.

**Verify:** flag-OFF: `terrain-node-checks` byte-identity on 3 seeds. Flag-ON: acceptance renders.

### #4 — new GEN_TUNABLES (section 'Tectonics') + W6 defaults

**Location:** grep `OROGEN_WIDTH: 2600, OROGEN_AMP: 1.40,` (registry); grep `key: 'OROGEN_WIDTH'`
(schema rows); extract-terrain.mjs REGISTRY_KEYS; worker const-emission list; syncGenTunableAliases.
**Why:** expose the new range shape knobs; ship the owner-approved W6 layout defaults.

New keys (defaults from the calibrated demo):
```js
RANGE_H: 95,                // block height of a full-strength range crest
RANGE_JAG: 0.22,            // jagged ridged-detail weight (0 = smooth walls)
RANGE_RELIEF_SWAP: 0.5,     // how much of the old relief amplification the crest term replaces
RANGE_SPUR_AMP: 0.35,       // spur warp, fraction of range width
RANGE_SPUR_FREQ: 0.0024,    // ≈1/420 blocks
RANGE_PEAK_WAVELEN: 640,    // summit bead wavelength (blocks)
RANGE_SADDLE_WAVELEN: 3000, // massif/saddle wavelength along the range
RANGE_WIDTH_VARY_FREQ: 0.00022, // ≈1/4600 along-range width variation
SUBRANGE_OFFSET: 1800,      // twin foothill ridge lateral offset (reference-scale blocks, ×S)
SUBRANGE_WIDTH: 800,        // twin ridge half-width (reference-scale, ×S)
SUBRANGE_AMP: 0.5,          // twin ridge amplitude vs main (0 = off)
```
Changed defaults (W6, owner-approved layout 2026-07-17): `PLATE_SIZE 3000→6000`,
`R_BASELINE_CAP 0.55→0.60`, `PLATE_OCEANIC_FRACTION 0.68→0.45`, `PLATE_DRIFT_SCALE 1.0→1.3`,
`TECT_CRUST_BIAS 0.05→0.02`, `TECT_PLATE_TINT 0.2→0.15`, `TECT_FEATURE_KEEP 0.45→0.85`,
`TECT_FEATURE_SEG_LEN 3000→6000`, `TECT_SEG_FLOOR 0.15→0.5`, `TECT_QUIET_LO 0.12→0.05`,
`TECT_QUIET_HI 0.50→0.30`, `OROGEN_WIDTH 2600→3600`, `OROGEN_AMP 1.40→1.8`, `ANDEAN_AMP 1.35→1.7`,
`BOUNDARY_INFLUENCE 2600→4000`, `TRENCH_DEPTH_C 0.30→0.10`, `TRANSFORM_AMP 0.10→0.05`,
`BACKARC_DEPTH_C 0.16→0.10`, `RIDGE_LIFT_C 0.18→0.10`, `RIFT_DEPTH_C 0.70→0.45`,
`BOUNDARY_WIGGLE_AMP 350→700`, `BOUNDARY_WIGGLE_FREQ 0.0004→0.0002`, `TECT_SMEAR 0.55→0.9`.

Also fix stale schema description: `PLATE_OCEANIC_FRACTION` — it is the boundary-style mix
(P(cont-cont)= (1−f)²), NOT ocean coverage (coverage is `TECT_CRUST_BIAS`/`COAST_THRESHOLD_TECT`).

**AUDIT NOTE:** BOUNDARY_INFLUENCE must stay ≥ max(offset+width) of every band feature — 4000
covers OROGEN_WIDTH 3600 and BACKARC 1400+800. Lockstep: every new key goes into GEN_TUNABLE
schema, extract-terrain REGISTRY_KEYS, the worker emission block, and syncGenTunableAliases (the
new keys are read inside injected functions → they need worker-baked consts).

**Verify:** `node tools/parity-check.mjs` GREEN; editor Advanced Tunables shows the new rows.

### #5 — lockstep plumbing for the new function + memo fields

**Location:** grep `tectonicReliefBlend` occurrences: worker `terrainFuncs` injection list
(grep `'plateHash32', 'plateLookup'` in the emission block), `window.VoxEx` seam (grep
`tectonicFeatureAt, tectRegimeAt` in the seam export), `tools/lib/extract-terrain.mjs` FUNCS +
return list.
**Why:** single-source rule — `tectonicRangeHeight` must ride every list `tectonicReliefBlend`
rides; the memo's new fields need no extra plumbing (they travel inside plateLookup's return).

**Verify:** `node tools/parity-check.mjs` + `node tools/terrain-node-checks.mjs` (3 seeds, flag-ON
build via opts) — no ReferenceErrors.

### #6 — Phase B: `buildOrogenRegion` + region cache (the erosion bake)

**Location:** new code beside the hydro region machinery — grep `function buildHydroRegion` for
the pattern to mirror (region key, halo, cache map with cap, deterministic from seed).
**Why:** the dendritic look is a simulation over an area; bake it per region, sample per column.

Design (port of `/tmp/tect/erode.mjs`, parameters that produced `target_demo_v8_final.png`):
- Region tiles: `OROGEN_REGION` blocks square (default 8192), aligned like hydro regions, with an
  `OROGEN_HALO` margin (default 1024) so neighboring regions agree near borders.
- Grid: `EROSION_CELL` blocks/cell (default 32 → 288² cells incl. halo). Input height per cell =
  Phase-A envelope + base terrain LOW-FREQ only (sample `computeSurfaceHeight` coarsely; do NOT
  include the fine fbm octaves — they re-appear as column-level texture on top of the bake).
- Sim loop per iteration (`EROSION_ITERS`, default 40):
  1. D8 receiver + steepest slope per cell.
  2. Flow accumulation: sort cells by height DESC, sequentially push area to receiver
     (**AUDIT FLAG: must be sequential in height order — see rejected-alternatives**; use a
     stable sort with index tie-break for determinism).
  3. Incision: `min(EROSION_CAP, EROSION_K·√A/1000·slope) · beltGate`, only above sea+1;
     beltGate = `0.12 + 0.88·clamp((envelope−72)/40,0,1)^0.7` (lowlands stay calm).
  4. Talus: relax slopes above `EROSION_TALUS` (0.75) by `EROSION_KT` (0.09).
  5. Divide uplift: `+upliftMask·EROSION_UPLIFT` (0.32) for the first `ITERS−25` iterations only
     (uplift off at the end lets valleys win), upliftMask = `clamp((envelope−110)/55,0,1)^1.5`.
- Output: Float32 Δh grid (`eroded − input`). Cache `Map` keyed `seed:rx:rz`, cap ~12 regions
  (mirror `HYDRO_REGION_CACHE_CAP` pattern); cleared wherever `_plateSiteCache.clear()` is called
  (grep both sites) so tunable edits invalidate bakes.
- Column read: new injected `tectonicErosionAt(gx, gz, seed)` → bilinear sample of Δh (0 outside
  belts / regions with no orogen cells — early-out via a per-region "hasBelt" flag to keep
  ocean regions free).
- Budget: 288²×40 iters ≈ 3.3M cell-steps + 40 sorts of 83K cells — target <300ms per region in
  the worker (measure; the 1024²×110 session sim ran ~2min single-thread, this is ~1/60 of it).
  Bake on first demand per region (worker-local), same as hydro regions.

**Verify:** same region requested twice → identical Float32 output (determinism); two adjacent
regions → Δh continuous across the shared border within halo tolerance (log max seam step,
budget ≤2 blocks); editor Map over a belt shows dendritic valleys (compare acceptance image).

### #7 — Phase B: terrainSurface integration

**Location:** the Phase-A add site (grep `tectonicRangeHeight(gx, gz, s)` after #3 lands).
**Why:** the bake replaces most of the jagged-noise terms — the envelope + Δh IS the mountain.

**After:**
```js
if (worldConfig.tectonicPlates === true && !forcedCentroid) {
    h += tectonicRangeHeight(gx, gz, s);      // Phase A envelope (massif + summit line)
    h += tectonicErosionAt(gx, gz, s);        // Phase B baked Δh (dendritic carve)
}
```
With Phase B on, drop `RANGE_JAG` default 0.22 → 0.10 (erosion supplies the texture; keep a
little jag so un-baked distant LOD/preview paths don't look bald — if a non-baked path exists).

**AUDIT NOTE:** chunk workers and main thread each bake their own region cache — determinism
(fixed seed, fixed iteration count, stable sort) is what keeps them byte-identical. Any use of
`Math.random`/time in the bake is a parity bug.

**Verify:** worker byte-parity suite in `tools/voxex-tests.html`; flag-OFF byte-identity on 3 seeds.

### #8 — Phase B tunables

**Location:** same registry/schema/lockstep sites as #4.
`OROGEN_REGION 8192`, `OROGEN_HALO 1024`, `EROSION_CELL 32`, `EROSION_ITERS 40`,
`EROSION_K 22`, `EROSION_CAP 3.0`, `EROSION_TALUS 0.75`, `EROSION_KT 0.09`,
`EROSION_UPLIFT 0.32` — `ui:'editor'` (these are calibration knobs, not player knobs).
**AUDIT NOTE:** changing ANY of them must clear the orogen region cache (see #6) or the editor
shows stale bakes.

## Worker parity

`plateLookup`, `tectonicReliefBlend`, `terrainSurface` are Function.toString()-injected — edit main
only, auto-propagates. NEW `tectonicRangeHeight`, `tectonicErosionAt`, `buildOrogenRegion` (+ its
cache decl): add to the worker terrainFuncs injection list, the `window.VoxEx` test seam, and
extract-terrain FUNCS + return object (same three lists `tectonicReliefBlend` is in; the cache
Map needs a mirror decl in extract-terrain's env stubs, like `_plateSiteCache`). New tunables:
worker const-emission + alias sync (see #4/#8).

## Acceptance (owner look-check, before marking IMPLEMENTED)

Re-render with the session harness method (or editor Map view, seed 1337):
1. Belt zoom: window center (−400, 800), 6144 blocks — must read like real shaded relief:
   narrow sinuous divide, dendritic valleys on both flanks, branching spurs, calm lowlands.
   Compare against `CCR's/CCR-TECTONICS-002-acceptance-target.png` (GOOD — owner acceptance
   image, 2026-07-17). Failure references (delivered in the owner chat 2026-07-17, not stored
   in-repo): envelope-only "fuzzy caterpillar" (rejected) and W6 squiggle-patch zoom (rejected).
2. Continent view: 16384 blocks at origin — ranges follow boundaries, gaps/echelons present.
3. 98304 blocks — landmass layout unchanged from W6 renders (owner-approved).
4. Region-seam check: render a window straddling an OROGEN_REGION border inside a belt — no
   visible line at the border (≤2-block Δh step).
5. Rivers: verify in the EDITOR (session render river overlay is approximate — known ring artifacts).

## Safety Checks

- [ ] `node tools/parity-check.mjs` GREEN
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] Terrain touched? `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds (flag-OFF byte-identity + flag-ON smoke)
- [ ] `tools/voxex-tests.html` over localhost — no regressions
- [ ] No duplicate/shadowed identifiers (grep before declaring)
- [ ] New tunables: registry + schema + REGISTRY_KEYS + worker emission + alias sync (lockstep)
- [ ] No unbatched per-frame work added (plateLookup already memoized; tectonicRangeHeight adds ~6 noise2D per column flag-ON — measure worker gen time before/after, budget +10%)
- [ ] Phase B bake ≤300ms per region in the worker (measure with meshProfile-style timing); bake never runs on the main thread during gameplay (first-demand in worker only)
- [ ] Phase B determinism: same seed+region → byte-identical Float32 twice; stable sort with index tie-break; zero Math.random/Date in the bake
- [ ] Orogen region cache cleared at BOTH `_plateSiteCache.clear()` sites + on any EROSION_*/OROGEN_* tunable change
- [ ] Version constants bumped per "Version impact" above
- [ ] CLAUDE.md / docs/agent-notes.md updated: do-not-retry ledger entries (tunables-only crest faking; R_BASELINE_CAP-as-mountain-dial), agent-notes §4 crest-term as-built

## Open follow-ups (separate CCRs)

- Tunable exposure demotion + dead-key cleanup (TECTONIC_DETAIL_WEIGHT, TECT_INTERIOR_FALLOFF,
  ARC_PEAK_DENSITY/RIFT_VENT_DENSITY/JUNCTION_RADIUS) — see tectonics-tunables-audit.md.
- Boundary de-gridding for remaining non-range features (F2−F1 fade via the computed-but-unused
  dEdge; wiggle-ceiling decoupling) — the spur warp in THIS CCR only fixes range flanks.
- Anisotropic ridged octaves inside belts (polish, optional).
- Spawn land-search fix + endorheic rivers (pre-existing CCR-001 gates for default-ON).

## As-built (2026-07-17, build 2026-07-17.1 — Phases A+B in one arc, container-verified)

Implemented as specified with these deviations/measurements:

- **Build baseline drifted**: implemented against build 2026-07-16.11 (a CCR-DEBUG/perf drop landed
  after this CCR was written), not .10. No conflicts — the debug drop only touched cache-clear timing.
- **Edit sites**: all five Phase-A sites + three Phase-B sites landed as drafted. `tectonicRangeHeight`
  gained a small twin-ridge branch for columns outside the main profile's support (the CCR sketch
  only handled inside). The `terrainSurface` integration point is after the `surf` assembly
  (`let surfOut = surf; if (tectonicPlates && !forcedCentroid) surfOut = surf + range*amp0 + erosion`)
  — range term ×amp0, erosion Δh unscaled (it derives from the amp0-scaled envelope).
- **De-aliasing (not in the draft, required)**: the 24-32-block D8 bake drains along grid axes →
  visible axis-aligned furrow striping in the first render. Fixed with (a) a center-weighted 3×3
  smoothing of Δh at bake end (weights 2/1/0.5) and (b) a domain-warped sampling coordinate in
  `tectonicErosionAt` (amp 0.55·cell, freq ~1/140). Both are load-bearing — see agent-notes §3.
- **Perf DEVIATION**: bake measured **4.0s per 426² region** at the shipped `EROSION_CELL 24`
  (CCR budget said ≤300ms). Accepted for this drop: it is once per region per context, belt
  regions only (beltless regions skip via an 8×8 rangeAmp pre-scan in ~ms), and `EROSION_CELL`
  is an editor tunable (32-48 ≈ 2-4× faster, coarser valleys). Follow-up if it hitches in-game:
  pre-bake neighbor regions during pregen, or move the bake to a dedicated message in the worker.
- **Gates (all container-run)**: syntax GREEN; parity GREEN; terrain-node-checks ALL HARD CHECKS
  GREEN (live defaults, 3 seeds); **flag-OFF byte identity** proven via a sha256 fingerprint of
  computeSurfaceHeight/oceanFactor/riverFactor/continentalness over a 48×48 grid × 3 seeds —
  identical before/after every edit (22815f15…2de0). Bake determinism: bake-twice byte-identical.
  Region-border erosion seam: 0.8 blk max across x=0 (budget 2.0). NO TGV bump (flag default OFF).
- **PENDING (owner/local)**: `tools/run-browser-tests.mjs` / `tools/voxex-tests.html` worker
  byte-parity suite over localhost (not runnable in the implementation container this session);
  owner editor eyeball of the belt zoom vs `CCR-TECTONICS-002-acceptance-target.png`; git commit
  (files written to disk, deliberately not committed — sandbox git is on the do-not-touch list).
- **Look state**: acceptance renders (implB3) show the crest line + eroded dendritic flanks with
  no grid artifacts. The bake at cell 24 is coarser than the 6-blk-cell acceptance sim, so valley
  drama sits between the envelope-only and the target image — further calibration belongs to the
  EROSION_*/RANGE_* editor knobs, all exposed.

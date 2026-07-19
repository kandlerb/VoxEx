# CCR-WORLDGEN-TECTONICS-005: Regime-differentiated morphology (asymmetric margins, volcano lines, orphan repair, cliff coasts)

> **Status: DRAFT** — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-005 · **Build baseline**: 2026-07-18.1 (CCR-003 as-built) · **Author**: Claude (Cowork session 2026-07-18, owner-directed)
> **Depends on**: CCR-002/003 (crest capture, memo shape, single mountain authority). Implement
> **BEFORE CCR-004** — rivers must erode the FINAL morphology (cones, cliffs, asymmetric flanks),
> not a surface that 005 then reshapes under them.

## Problem / Why

Post-CCR-003 the boundary TYPES do not LOOK different (owner, 2026-07-18: boundary types should
look distinct; wants A-under-B asymmetric margins, slide-past, and pull-apart each reading as
its own thing; wants active-margin cliff coasts "like the Cliffs of Moher" while keeping beaches
elsewhere). Four documented defects:

1. **One profile for three regimes.** Regimes 1 (orogen), 2 (subduction/Andean), 7 (obduction)
   all receive the SAME symmetric crest profile from `tectonicRangeHeight` — `ad = |dWarp|`
   treats both flanks identically. Real Andean margins are asymmetric: a steep trench-facing
   flank, a long gentle inland slope, and a volcano line along the arc.
2. **ORPHANED REGIMES.** The range capture (grep `const rw = dR * qf * segFactor`) gates on
   regimes 1/2/7 only. Regimes 3 (island arc, `ISLAND_ARC_AMP` 1.25), 4 (rift shoulders,
   `RIFT_SHOULDER_AMP` 0.30), and 6 (transform, `TRANSFORM_AMP` 0.05) produce dR > 0 but reach
   height ONLY through `tectonicReliefBlend`'s demoted path (grep
   `let Reff = Rn + (1 - Rn) * uR * (1 - RANGE_RELIEF_SWAP)`; `RANGE_RELIEF_SWAP` 0.5) —
   half-strength mushy noise-amplified ridges sitting next to crisp crest ranges. This is very
   likely the owner's "ridges that shouldn't look the way they do".
3. **Muted water features (W6 defaults).** `TRENCH_DEPTH_C` 0.10 erases the offshore-trench
   signature that makes a subduction margin read as subduction from the map.
4. **No land-side coastal uplift exists.** IMPORTANT CORRECTION baked into this CCR: the WS8
   cliff/fjord machinery (`CLIFF_RELIEF_MIN` 0.55, `CLIFF_SHARPNESS_MAX` 6,
   `SEAFLOOR_CLIFF_SHARP` 4.0, `SEAFLOOR_CLIFF_BAND` 0.13, `FJORD_DEPTH_SCALE` 25) is LIVE
   since TGV 42 — but every effect touches only water-side columns (verified in-container: the
   SEAFLOOR_CLIFF remap is guarded by `Cq < _coast` — grep `_cliffT` — and the F2 sharpener and
   fjord depth-add are ocean/river-gated). Nothing ever RAISES the land behind a shore.
   Interaction note: CCR-003's `R_BASELINE_CAP` 0.45 means noise relief alone can no longer
   exceed `CLIFF_RELIEF_MIN` 0.55, so relief > 0.55 now requires tectonic uplift — the live
   cliff sharpening is already de-facto restricted to tectonic belts. 005 makes that de-facto
   coupling explicit and adds the missing land side.

Session evidence (2026-07-18, committed alongside this CCR): the regime-colored diagnostic
render `CCR-TECTONICS-005-regime-diagnostic.png` shows the seed-1337 central cordillera — the
range the owner has been reviewing all along — is **regime 2 (subduction)** wearing the
symmetric collision profile; collision (red) belts sit SE/E, island arcs NW, ridges at the
corners. The cliff-coast concept render `CCR-TECTONICS-005-cliff-proto.png` (post-hoc harness
prototype on that margin's coastline) demonstrates the land-side lift: the active-margin shore
loses its beach strip and arrives high, while every passive coast in the same window keeps its
beaches.

## Approach

Give each boundary type its own signature by (1) exporting the captured range boundary's REGIME
into the plate memo, (2) skewing the Andean profile asymmetric (steep trench flank, long inland
ramp), (3) building the long-promised volcano-cone consumer on a deterministic point lattice
along arc corridors, (4) repairing the orphans — island arcs join the crest capture, rift and
transform uplift is exempted from the RANGE_RELIEF_SWAP demotion via a second uplift bucket,
(5) adding land-side ACTIVE-MARGIN CLIFF COASTS that feed the already-live ocean-side plunge,
and (6) partially restoring trench depth. No new passes — everything lives inside the existing
injected functions and registry; pipeline order stays plates → C → relief → crest/cones →
erosion bake → rivers → biomes. Implementation order 005 → 004.

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry (always)
- `TERRAIN_GEN_VERSION`: **no bump** — tectonicPlates default OFF; every change is flag-gated,
  a Tectonics-section tunable read only flag-ON, or (the #6 registry values) read only inside
  the flag-ON plateLookup path. Flag-OFF byte identity must be RE-PROVEN with the CCR-002
  fingerprint method (sha256, 3 seeds, 48×48 grid — expected constant `22815f15…2de0`, same as
  CCR-002/003).
- `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION`: no

## Changes

### #1 — Export rangeRegime + widen the capture to island arcs

**Location:** grep `const rw = dR * qf * segFactor` in `voxEx.html` (plateLookup boundary loop),
then grep `rangeD, rangeAlong, rangeW, rangeAmp` (the memo literal).
**Why:** downstream consumers (#2, #3, #5) must know WHICH regime built the range; and regime 3
(island arc) deserves the crisp crest path, not the demoted relief path.

**Before:**
```js
const rw = dR * qf * segFactor;
if (rw > rangeScore && (regime === 1 || regime === 2 || regime === 7)) {
    rangeScore = rw;
    rangeD = regime === 2 ? d - ARC_INLAND_OFFSET * S : d;
    rangeAlong = fAlong;
    rangeW = (regime === 1 ? OROGEN_WIDTH : regime === 7 ? OBDUCTION_WIDTH : ARC_WIDTH) * S;
    rangeAmp = rw > 1 ? 1 : rw;
}
```

**After:**
```js
const rw = dR * qf * segFactor;
if (rw > rangeScore && (regime === 1 || regime === 2 || regime === 3 || regime === 7)) {
    rangeScore = rw;
    rangeD = regime === 2 ? d - ARC_INLAND_OFFSET * S : regime === 3 ? d - ARC_OFFSET * S : d;
    rangeAlong = fAlong;
    rangeW = (regime === 1 ? OROGEN_WIDTH : regime === 7 ? OBDUCTION_WIDTH
            : regime === 3 ? ARC_WIDTH_ISL : ARC_WIDTH) * S;
    rangeAmp = rw > 1 ? 1 : rw;
    rangeRegime = regime; // CCR-005: which regime built this range (drives #2/#3/#5)
}
```
Initialize `let rangeRegime = 0;` beside the existing `rangeD/rangeAlong/rangeW/rangeAmp`
declarations, and extend the memo literal's last line to
`rangeD, rangeAlong, rangeW, rangeAmp, rangeRegime`.
**AUDIT NOTE:** regime 3's dR is nonzero only on the older plate's side (the
`s1.age >= s.age` branch — the overriding plate hosting the arc), so the mirrored offset shift
`d - ARC_OFFSET * S` centers the crest on the arc band exactly as `ARC_INLAND_OFFSET` does for
regime 2; the subducting side never wins the slot. Same argument as the CCR-002 AUDIT NOTE.
**Verify:** editor plates pass — regime-3 corridors now show `rangeAmp > 0` in the probe;
memo consumers see `rangeRegime` ∈ {0,1,2,3,7}.

### #2 — Asymmetric Andean profile in tectonicRangeHeight

**Location:** grep `const dWarp = _pl.rangeD +` in `voxEx.html` (inside `tectonicRangeHeight`,
just after the `W` width-vary line).
**Why:** a subduction margin has a short steep trench-facing flank and a long gentle inland
ramp; the current `prof = 1 - |dWarp| / W` is symmetric.

**Before:**
```js
const dWarp = _pl.rangeD + noise2D(gx * RANGE_SPUR_FREQ, gz * RANGE_SPUR_FREQ) * RANGE_SPUR_AMP * W;
const ad = dWarp < 0 ? -dWarp : dWarp;
const prof = 1 - ad / W;
```

**After (sketch — side-dependent width for regime 2 only):**
```js
const dWarp = _pl.rangeD + noise2D(gx * RANGE_SPUR_FREQ, gz * RANGE_SPUR_FREQ) * RANGE_SPUR_AMP * W;
// CCR-005: Andean asymmetry — trench-facing flank steep (W/ANDEAN_ASYM), inland ramp long
// (W*1.15). Other regimes keep the symmetric profile (island arcs are narrow via rangeW).
const _Wside = _pl.rangeRegime === 2 ? (dWarp < 0 ? W / ANDEAN_ASYM : W * 1.15) : W;
const ad = dWarp < 0 ? -dWarp : dWarp;
const prof = 1 - ad / _Wside;
```
Downstream `ad`-consumers (fold train extent, notch) keep using `ad`; the fold-train
`foldExtent` comparison should use `_Wside`-relative decay on the inland side only if the
implementer finds the trench-side fold ridges objectionable — default: leave the fold block
untouched.
**AUDIT NOTE (sign convention):** regime-2 `rangeD` is already offset-shifted
(`d - ARC_INLAND_OFFSET * S`, see #1 Before), and regime-2 dR is nonzero only on the
continental side, where the trench band sits at SMALLER d — so **negative dWarp = the
trench/ocean-facing side**. Do not "fix" the sign.
New tunable `ANDEAN_ASYM: 1.9` (ui:'editor', tested [1, 3]; 1 = symmetric off-switch).
**Verify:** transect perpendicular to an Andean belt: rise-to-crest distance from the coast
side ≈ half the inland side's; setting ANDEAN_ASYM = 1 restores the 003 profile exactly.

### #3 — Volcano cones (new injected tectonicConeHeight)

**Location:** new function next to `tectonicRangeHeight`; integration at grep
`surfOut = surf + tectonicRangeHeight(gx, gz, s, C) * amp0` in `terrainSurface`.
**Why:** the owner-visible signature of a subduction margin/island arc is a LINE of discrete
volcano cones. The old per-column hash in `tectonicFeatureAt` (grep `function tectonicFeatureAt`)
has NO centers — a column knows it hashed hot, but no neighbor agrees where the cone middle is,
so it cannot build geometry. Leave `tectonicFeatureAt` as the data-only diagnostic it is.

**Before (integration site):**
```js
let surfOut = surf;
if (worldConfig.tectonicPlates === true && !forcedCentroid) {
    surfOut = surf + tectonicRangeHeight(gx, gz, s, C) * amp0
        // Phase B: baked erosion carve (Δh already derives from the amp0-scaled
        // envelope — no extra scaling; 0 while baking via the recursion guard).
        + tectonicErosionAt(gx, gz, s);
}
```

**After:** add `+ tectonicConeHeight(gx, gz, s) * amp0` on the range-height line (before the
erosion term, so the bake input sees cones — intended, see Acceptance #6).

**Design (deterministic point lattice — every column agrees on centers):**
- Cells of `CONE_LATTICE` (default 900) blocks. Per cell `(cx, cz)`: ONE jittered candidate
  center at `(cx + 0.15 + 0.7·h1, cz + 0.15 + 0.7·h2) · CONE_LATTICE`, where h1/h2 are
  `plateHash32(cx, cz, salt, 0) / 2^32` with two salts.
- The candidate is a volcano iff `plateLookup(centerX, centerZ, seed)` has
  `rangeRegime === 2 || rangeRegime === 3` (subduction arcs only — orogens/obduction get NO
  cones, that's the point of regime differentiation) AND `rangeAmp > 0.15` AND
  `h3 < CONE_KEEP` (default 0.45).
- Per-cone radius `CONE_RADIUS` (default 150) `· (0.7 + 0.6·h4)`, height `CONE_H` (default 42)
  `· (0.5 + 0.5·h5)`.
- A column samples its 3×3 neighboring cells and sums cone profiles
  `Math.pow(Math.max(0, 1 - dist / r), 1.5) * coneH`. Optional one-line polish: a crater dimple
  — multiply by `(dist < 0.25 * r ? 0.8 : 1)` inside the quarter-radius.
- Memoize per column? No — the cost is 9 hashes + at most 1 `plateLookup` at a CENTER per
  candidate cell; add a module single-slot CELL memo alongside `_plateMemoKey` (grep
  `let _plateMemoKey`) keyed `seed:cx:cz` so a chunk column run re-derives each cell once.
**AUDIT NOTE (perf):** the `plateLookup` call is at the cone CENTER's coordinates, which repeat
across thousands of columns — it is cache-friendly via `_plateSiteCache` (grep
`const _plateSiteCache`) and the new cell memo makes it once-per-cell in practice.
New tunables `CONE_LATTICE: 900`, `CONE_KEEP: 0.45`, `CONE_RADIUS: 150`, `CONE_H: 42`
(all ui:'editor', full lockstep per #7).
Schema-note housekeeping: the rows for `ARC_PEAK_DENSITY` / `RIFT_VENT_DENSITY` /
`JUNCTION_RADIUS` (grep `key: 'ARC_PEAK_DENSITY'`) currently say "data only; no cones this
phase" — update notes to "superseded by CONE_* (tectonicConeHeight); tectonicFeatureAt remains
a data-only diagnostic".
**Verify:** Andean/arc corridor render shows a beaded line of discrete cones ~CONE_LATTICE
apart with varied radii/heights; zero cones on orogen (regime 1) belts; bake-twice
byte-identical (cones are inside the bake input).

### #4 — Orphan repair: two-bucket uplift (rift/transform escape the demotion)

**Location:** grep `deltaC += dC * qf * segFactor; upliftR += dR * qf * segFactor;` in
`voxEx.html` (plateLookup accumulation), then grep `function tectonicReliefBlend`.
**Why:** regimes 4/6 have no crest term, so demoting their relief amplification by
`RANGE_RELIEF_SWAP` (the whole point of which was to stop DOUBLE-drawing crest-covered belts)
just halves them for nothing. Regime 3 leaves this path entirely via #1.

**Before (accumulation):**
```js
deltaC += dC * qf * segFactor; upliftR += dR * qf * segFactor;
```
**After:**
```js
deltaC += dC * qf * segFactor;
if (regime === 4 || regime === 6) upliftLocal += dR * qf * segFactor; // CCR-005: no crest term — full-strength relief path
else upliftR += dR * qf * segFactor;
```
Declare `let upliftLocal = 0;` beside `upliftR`'s declaration and add `upliftLocal` to the memo
literal (same line as the #1 memo edit).

**Before (tectonicReliefBlend, elided):**
```js
let uR = plateLookup(gx, gz, worldConfig.seed).upliftR;
if (uR < 0) uR = 0; else if (uR > 1) uR = 1;
// CCR-WORLDGEN-TECTONICS-002: the explicit crest term (tectonicRangeHeight) now owns
// the mountains; the relief amplification is DEMOTED to flank texture by
// RANGE_RELIEF_SWAP (0 = pre-002 full amplification, 1 = crest term only).
let Reff = Rn + (1 - Rn) * uR * (1 - RANGE_RELIEF_SWAP);
```
**After (sketch):**
```js
const _L = plateLookup(gx, gz, worldConfig.seed);
let uR = _L.upliftR;  if (uR < 0) uR = 0; else if (uR > 1) uR = 1;
let uL = _L.upliftLocal; if (uL < 0) uL = 0; else if (uL > 1) uL = 1;
// CCR-005: crest-covered regimes (1/2/3/7) stay demoted by RANGE_RELIEF_SWAP; regimes with
// no crest term (4 rift shoulders, 6 transform pressure ridges) pass at FULL strength.
let Reff = Rn + (1 - Rn) * Math.min(1, uR * (1 - RANGE_RELIEF_SWAP) + uL);
```
**AUDIT NOTE:** extract-terrain and the worker ride the injected functions automatically; the
memo field addition needs NO extra plumbing (the memo object never crosses the worker/main or
extraction seams as data — only the functions that build it do).
**Verify:** rift window shows paired facing escarpments at full `RIFT_SHOULDER_AMP` strength
(visibly ~2× the 003 build); transform seams show low pressure-ridge texture; orogen flank
texture unchanged (uR path untouched for 1/2/7).

### #5 — Active-margin cliff coasts (land lift + feeding the live ocean plunge)

**Why:** owner wants Cliffs-of-Moher coasts where an active margin meets the sea, beaches
everywhere else. The ocean-side plunge already exists (WS8/CO-001, live); the land side and the
tectonic trigger are new.

**Shared source — new tiny injected helper `tectonicMarginFactor(gx, gz, seed)`** (next to
`tectonicRangeHeight`): returns 0 flag-OFF or on passive margins; else, with
`_plc = plateLookup(gx, gz, seed)` (cheap via the single-slot memo):
`_plc.rangeRegime === 2 ? smoothstep(0.08, 0.25, _plc.rangeAmp) · falloffOf(_plc.dEdge within
CLIFF_MARGIN_REACH * S, default 3000, S = PLATE_SIZE/12000) : 0` — the rangeAmp term is a
SMOOTH fade, not a hard `> 0.1` gate.
**AUDIT NOTE (session-prototype finding, 2026-07-18):** the post-hoc cliff prototype exposed
visible straight seams where the DOMINANT regime flips while the margin factor is still > 0
(dominance switching is discrete). The smooth `rangeAmp` fade above is load-bearing — it drives
the factor to ~0 before any dominance switch can matter. Do not replace it with a hard
threshold.
THREE call sites share it (5a/5b in `terrainSurface`, plus the two material mirrors below).

**5a — land-side lift in terrainSurface's flag-ON block.**
**AUDIT FLAG (scoping):** `_oceanCoast`/`C` live inside the `continentalOceans === true` assembly
branch, but the `surfOut` add site is OUTSIDE it — compute in one place, consume in the other:
hoist `let marginFactor = 0, cliffLift = 0;` immediately BEFORE the `continentalOceans` branch,
assign both INSIDE it (where `_oceanCoast` is in scope), and apply at `surfOut` inside the
existing `_tect` guard.
```js
// (inside the continentalOceans branch, after _oceanCoast is set)
if (_tect) {
    marginFactor = tectonicMarginFactor(gx, gz, s);
    if (marginFactor > 0) {
        // CCR-005: active-margin cliff coast — land holds a raised bench up to the waterline.
        // Band-shaped: full lift at the coast, relaxing inland (session prototype: a flat +55
        // over the whole margin read as an artificial plateau).
        cliffLift = CLIFF_COAST_H
            * smoothstep(_oceanCoast + 0.005, _oceanCoast + CLIFF_COAST_BAND, C)
            * (1 - 0.45 * smoothstep(0.22, 0.40, C))
            * marginFactor
            * (0.75 + 0.25 * noise2D(gx / 90 + 3.3, gz / 90 - 6.1)); // raggedness
    }
}
// (at the surfOut site, inside the existing _tect-gated block)
surfOut += cliffLift;
```
(defaults `CLIFF_COAST_H` 45 — prototype's 55 read plateau-heavy — and `CLIFF_COAST_BAND` 0.05).
Land keeps its beach wherever `marginFactor === 0` — passive margins are untouched.

**5b — feed the already-live ocean-side plunge.**
**Location:** grep `_cliffT` in `voxEx.html` (the SEAFLOOR_CLIFF remap in `terrainSurface`).
**Before:**
```js
const _coast = _oceanCoast, _band = SEAFLOOR_CLIFF_BAND;
if (Cq < _coast && Cq > _coast - _band) {
    const _cliffT = smoothstep(CLIFF_RELIEF_MIN, 1.0, relief);
    if (_cliffT > 0) {
        const _e = 1 + _cliffT * (SEAFLOOR_CLIFF_SHARP - 1);
        const _u = (_coast - Cq) / _band;
        Cbase = _coast - Math.pow(_u, 1 / _e) * _band;
    }
}
```
**After:** `const _cliffT = Math.max(smoothstep(CLIFF_RELIEF_MIN, 1.0, relief), marginFactor);`
— active-margin shores plunge regardless of noise relief (which `R_BASELINE_CAP` 0.45 caps
below the 0.55 threshold away from belts).
**AUDIT NOTE (ordering + flag-OFF):** 5a/5b ORDER MATTERS — compute `marginFactor` before the
base assembly so 5b can read it. Flag-OFF byte identity holds by construction: both additions
live inside the `continentalOceans` block AND are `_tect`-conditional (`marginFactor` is the
literal 0 flag-OFF, `Math.max(x, 0) === x`, and the `cliffLift` add must be written
`surfOut += cliffLift` INSIDE the existing `_tect` guard, or guarded equivalently).

**Materials lockstep (CRITICAL — CLAUDE.md Lockstep Registry rule: the beach-sand gate and its
isTreeSoilSurface mirror change TOGETHER or tree soil lies).** Both material gates key on
`reliefParam > CLIFF_RELIEF_MIN`, which does NOT see the new margin cliffs (marginFactor is not
relief). Both must gain an OR'd margin condition via the shared helper:
1. `generateTerrainPass` (grep `isCoastCliffCol`): 
   `... ? caches.climCache[idx + 3 * chunkSize * chunkSize] > CLIFF_RELIEF_MIN : false;`
   → append `|| (worldConfig.tectonicPlates === true && tectonicMarginFactor(gx, gz, worldConfig.seed) > 0.5)`.
2. `isTreeSoilSurface` (grep `CLIFF_SHARPNESS_MAX > 1 && reliefParam`): same OR inside the
   existing negated cliff clause.
3. `terrainSurface` (5a/5b above).
New tunables `CLIFF_COAST_H` (ui:'both'), `CLIFF_COAST_BAND`, `CLIFF_MARGIN_REACH`
(ui:'editor'); full lockstep per #7.
**Verify:** active-margin shore: bench-and-plunge profile, NO beach sand, no trees on the cliff
lip; passive shore 2km away on the same seed: beach sand + smooth shelf, unchanged vs 003.

### #6 — Water-feature restore: trench + back-arc depth

**Location:** grep `TRENCH_DEPTH_C: 0.10, TRENCH_OFFSET` and
`BACKARC_DEPTH_C: 0.10, BACKARC_OFFSET` in `voxEx.html` (GEN_TUNABLES registry).
**Before:**
```js
TRENCH_DEPTH_C: 0.10, TRENCH_OFFSET: 250, TRENCH_WIDTH: 350,
```
```js
BACKARC_DEPTH_C: 0.10, BACKARC_OFFSET: 1400, BACKARC_WIDTH: 800,
```
**After:** `TRENCH_DEPTH_C: 0.22` and `BACKARC_DEPTH_C: 0.14` (offsets/widths unchanged).
Keep `TRANSFORM_AMP`/`RIDGE_LIFT_C` at their muted W6 values.
**Why safe now:** the W6 mute predates the CCR-003 land gate and the tectonic ocean-spline
domain — coasts no longer inherit boundary noise, so a real offshore trench signature can come
back without re-breaking shorelines. 0.22 (not the pre-W6 value) is a half-restore; the owner
dials from there.
**Verify:** subduction margin map view: visible dark trench stripe offshore, parallel to the
coast; no coastline raggedness regression on the 16k window.

### #7 — Full lockstep for all new tunables + injected functions

8 new keys: `ANDEAN_ASYM`, `CONE_LATTICE`, `CONE_KEEP`, `CONE_RADIUS`, `CONE_H`,
`CLIFF_COAST_H`, `CLIFF_COAST_BAND`, `CLIFF_MARGIN_REACH`. 2 new injected functions:
`tectonicConeHeight`, `tectonicMarginFactor`. Every list, same commit:

- Registry defaults: grep `RANGE_H: 118` (Tectonics section of GEN_TUNABLES).
- Schema rows: grep `key: 'RANGE_RELIEF_SWAP'` (Tectonics section; `CLIFF_COAST_H` ui:'both',
  rest ui:'editor').
- Hot-path let-aliases: grep `let RANGE_H = GEN_TUNABLES`.
- `syncGenTunableAliases` entries: grep `function syncGenTunableAliases`.
- Worker const-emission: grep `injectedCode += '    const RANGE_RELIEF_SWAP`.
- Worker terrainFuncs injection list: grep `tectonicRangeHeight, // CCR-WORLDGEN-TECTONICS-002 Phase A`
  (the non-"editor" hit) — add both new functions after it.
- `window.VoxEx` seam: grep `tectonicRangeHeight, // CCR-WORLDGEN-TECTONICS-002 Phase A (editor range pass / probes)`
  — export both (editor cone/margin probes).
- `tools/lib/extract-terrain.mjs`: FUNCS (grep `'tectonicRangeHeight', // CCR-WORLDGEN-TECTONICS-002 Phase A`),
  REGISTRY_KEYS (grep `'RANGE_NOTCH_SPACING', 'RANGE_NOTCH_DEPTH'` — append after the 003
  keys), and the harness return object (grep `assembled += \`return {` — the tectonics group).

## Worker parity

All height-path edits live inside already-injected, single-sourced functions (`plateLookup`,
`tectonicRangeHeight`, `tectonicReliefBlend`, `terrainSurface`) — auto-propagates. The two NEW
functions join the standard injection list + VoxEx seam + extract-terrain FUNCS (#7).
`isTreeSoilSurface` is itself in the injection and FUNCS lists, so its 5a-mirror edit rides
along; `generateTerrainPass`'s `isCoastCliffCol` edit likewise (extracted for the harness). The
memo's new `rangeRegime`/`upliftLocal` fields need no plumbing — the memo never crosses a seam
as data (#4 AUDIT NOTE). No hand-maintained copies are touched.

## Acceptance (owner look-check)

1. Regime-colored diagnostic map (editor plates pass, or the session method) — each boundary
   type visibly distinct. Baseline reference: `CCR's/CCR-TECTONICS-005-regime-diagnostic.png`
   (seed 1337, 16k — shows the central cordillera is regime 2).
2. Andean margin window: asymmetric range (steep coast flank, long inland ramp) + volcano bead
   line + offshore trench + cliff coast where the belt meets the sea; beaches on passive coasts
   of the SAME seed. Land-side concept reference: `CCR's/CCR-TECTONICS-005-cliff-proto.png`.
3. Island arc window: a chain of distinct volcanic islands (crest + cones), not a mushy ridge.
4. Rift window: paired facing escarpments at FULL strength.
5. Flag-OFF fingerprint identical (3 seeds, sha256 `22815f15…2de0`).
6. Bake determinism re-verified: cones and cliff lift enter the bake input via `terrainSurface`
   — this is INTENDED (erosion sees final morphology; that is also why 005 lands before 004's
   rivers). Bake-twice byte-identity required.

## Safety Checks

- [ ] `node tools/parity-check.mjs` GREEN
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] Terrain touched: `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds + flag-OFF
      sha256 fingerprint IDENTICAL (re-proven, not assumed)
- [ ] `tools/voxex-tests.html` over localhost — no regressions (STILL PENDING/owed since
      CCR-002: the browser worker-parity suite has not been run on any 00x build)
- [ ] No duplicate/shadowed identifiers (grep `tectonicConeHeight` / `tectonicMarginFactor` /
      `upliftLocal` / `rangeRegime` / each new key BEFORE declaring)
- [ ] New tunables: full lockstep per #7 (schema/aliases/sync/emission/extract-terrain)
- [ ] Materials lockstep: isCoastCliffCol AND isTreeSoilSurface margin-OR verified together
- [ ] No unbatched per-frame work added (cone lattice is per-column gen-time only)
- [ ] Version constants per "Version impact"; CLAUDE.md / docs/agent-notes.md updated if staled
      (agent-notes: the "no cones this phase" note is now stale)

## As-built (build 2026-07-18.2)

Shipped in **build 2026-07-18.2** (batched with CCR-006 + CCR-004). NO TERRAIN_GEN_VERSION bump
— `tectonicPlates` still default OFF; flag-OFF sha256 fingerprint re-verified IDENTICAL pre/post
(48×48 grid × 3 seeds): `22815f15a583ce58c80a08b08f0087260e80453a6043eeb5c92d7d1339212de0`.

**Deviations from draft (all caught in implementation review):**

1. **§5a scoping bug fixed.** The draft consumed `_oceanCoast` outside the branch that declares
   it. As-built hoists `let marginFactor = 0, cliffLift = 0;` in `terrainSurface` BEFORE the
   `let base, amplitude, lift;` declarations and computes the cliff block after `_oceanCoast`
   is in scope.
2. **Hard rangeAmp gate → smooth fade.** `tectonicMarginFactor` uses a smooth fade
   `(rangeAmp − 0.08) / 0.17` (clamped 0..1) instead of the draft's threshold. The hard gate
   produced straight visible seams where the dominant boundary regime flips along a coast.
   **AUDIT NOTE: the fade is LOAD-BEARING — do not simplify back to a threshold.**
3. **Cliff lift band-shaped, CLIFF_COAST_H 45 (draft 55).** A flat lift read as an artificial
   plateau in acceptance renders. As-built:
   `cliffLift = CLIFF_COAST_H · smoothstep(_oceanCoast+0.005, _oceanCoast+CLIFF_COAST_BAND, C) · (1 − 0.45·smoothstep(0.22, 0.40, C)) · marginFactor · raggedness`
   — a wave-cut cliff band at the coast that decays inland, natural terrain behind the edge.

**As-built mechanics (verified against shipped code):**

- Crest-capture gate widened to regimes {1,2,3,7}:
  `rangeD = regime === 2 ? d - ARC_INLAND_OFFSET * S : regime === 3 ? d - ARC_OFFSET * S : d`;
  memo gains `rangeRegime` (winning regime) + `upliftLocal`.
- Accumulation split: `if (regime === 4 || regime === 6) upliftLocal += dR * qf * segFactor;`
  else the orogen path (`upliftR`). `tectonicReliefBlend` consumes
  `Reff = Rn + (1 - Rn) * Math.min(1, uR * (1 - RANGE_RELIEF_SWAP) + uL)` — rift/transform
  relief is NOT demoted by the range-relief swap (they had effectively vanished at CCR-003's
  `R_BASELINE_CAP` 0.45).
- Andean asymmetry:
  `const _Wside = _pl.rangeRegime === 2 ? (dWarp < 0 ? W / ANDEAN_ASYM : W * 1.15) : W;`
  (ANDEAN_ASYM 1.9 — trench side steep/narrow, inland wide foothill ramp).
- `tectonicConeHeight`: deterministic 3×3 lattice, cell CONE_LATTICE 900; plateHash32 salts
  0xc2b2ae35 / 0x9e3779b9 / 0x85ebca6b / 0x27d4eb2f / 0x165667b1; keep iff
  `plateLookup(center).rangeRegime ∈ {2,3}` && `rangeAmp > 0.15` && `h3 < CONE_KEEP` (0.45);
  profile `pow(1 − dist/r, 1.5) · CONE_H(42) · (0.5 + 0.5·h5)`, crater dimple ×0.8 inside
  0.25r, CONE_RADIUS 150. Added in surfOut ×amp0 (never amplitude-scaled).
- `tectonicMarginFactor`: regime-2 margins within `CLIFF_MARGIN_REACH(3000)·S`, dEdge falloff
  + the smooth rangeAmp fade above.
- Materials: `isCoastCliffCol` OR-clause
  `|| (worldConfig.tectonicPlates === true && tectonicMarginFactor(gx, gz, worldConfig.seed) > 0.5)`
  with the matching `isTreeSoilSurface` mirror conjunct (worldSeed) — cliff coasts get NO beach
  sand; all other coasts keep beaches (owner requirement).
  `_cliffT = Math.max(smoothstep(CLIFF_RELIEF_MIN, 1.0, relief), marginFactor)`.
- Trench/backarc water restored via registry rows `TRENCH_DEPTH_C` 0.22 / `BACKARC_DEPTH_C`
  0.14 (previously muted in W6 with no registry presence).
- 10 new tunables (ANDEAN_ASYM 1.9, CONE_LATTICE 900, CONE_KEEP 0.45, CONE_RADIUS 150,
  CONE_H 42, CLIFF_COAST_H 45, CLIFF_COAST_BAND 0.05, CLIFF_MARGIN_REACH 3000,
  TRENCH_DEPTH_C 0.22, BACKARC_DEPTH_C 0.14) — full lockstep (registry / schema / aliases /
  sync / worker-emission / extract-terrain REGISTRY_KEYS); both new functions in the worker
  terrainFuncs list + window.VoxEx seam + extract-terrain FUNCS + return object.

**Gates (measured):** syntax-check GREEN; parity-check GREEN; terrain-node-checks GREEN
(3 seeds); flag-OFF fingerprint identical. Acceptance renders
(`CCR's/CCR-TECTONICS-005-regime-diagnostic.png`, `CCR's/CCR-TECTONICS-005-cliff-proto.png`;
as-built renders `CCR's/CCR-TECTONICS-005-margin-asbuilt.png`, `CCR's/CCR-TECTONICS-005-zoom-asbuilt.png`):
asymmetric Andean belts, volcano chains on arcs, restored rift shoulders, cliff coasts on
active margins with beaches preserved elsewhere.

**PENDING:** `tools/voxex-tests.html` browser worker-parity suite over localhost (owed since
CCR-002 — run before deploy); owner editor eyeball.


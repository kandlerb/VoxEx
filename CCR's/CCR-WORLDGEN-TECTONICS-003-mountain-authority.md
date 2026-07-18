# CCR-WORLDGEN-TECTONICS-003: Single mountain authority + land-gated, oscillating ranges

> **Status: DRAFT** — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-003 · **Build baseline**: 2026-07-17.1 (CCR-002 as-built) · **Author**: Claude (Cowork session 2026-07-17, owner-directed layer-architecture discussion)

## Problem / Why

Post-CCR-002 the flag-ON ranges read as "long ridges along the plates" — a continuous wall —
instead of ridge systems that rise and fall (owner, 2026-07-17). Root causes, confirmed in the
layer-dependency review:

1. **Four competing mountain authors.** (a) The E-field relief spline can declare mountains
   anywhere (it is independent noise, NOT erosion, despite the name); (b) boundary uplift blend;
   (c) the CCR-002 crest envelope; (d) biome style biases. Author (a) dilutes the tectonic story
   and forces `R_BASELINE_CAP` to exist as a bandaid.
2. **The envelope out-shouts its own variation.** Massif term ~60-100 blocks vs along-crest
   modulation of only ±30% (peaks 0.40-1.0, saddle 0.80-1.0) → the summit line never drops
   into cols. No transverse cuts exist at all.
3. **Ranges ignore the coastline.** Plate typing and the crust field are uncorrelated (crust is
   independent noise, plates only tint C at 0.15), so cont-cont orogens build full-strength
   walls across shelf/ocean.
4. **The erosion bake is muted** at EROSION_CELL 24 + smoothing — its transverse valleys are
   what should chop the wall into peaks.

5. **(rev 2, owner 2026-07-17)** A collision forms ONE ridge along the collision line — real
   fold belts (Appalachians/Zagros) form a TRAIN of sub-parallel ridges that decay into the
   foothills and relay/die out along strike. The fixed-offset SUBRANGE twin ridge is a crude
   stand-in and is replaced by a fold-train term.

Prototype-verified 2026-07-17 (harness, seed 1337, belt window (−400,800)×6144):
`A_shipped` (wall) vs `CCR-TECTONICS-003-target.png` (rev 2 = C_folds: distinct summits with
saddles and wind gaps, sub-parallel fold ridges flanking the crest, dendritic eroded flanks,
ranges terminating at coasts). Metrics at that window: mtn≥95 share of land 20.4% → ~10% —
intended: fewer, better mountains, all tectonic.

## Approach

Make plates the ONLY author of true mountains flag-ON, and make the crest line oscillate:
(1) drop `R_BASELINE_CAP` 0.60→0.45 (E-field = hills only); (2) deepen along-crest swing
(peaks 0.25-1.0, saddles 0.65-1.0) and add transverse NOTCHES (wind-gap cuts through the crest
at ~1.4k-block ridged intervals); (3) land-gate `tectonicRangeHeight` on continentalness so
orogen walls fade out over ocean (island arcs self-consistently pass — their ARC_C_LIFT raises
C first); (4) louder erosion: EROSION_CELL 24→20, EROSION_K 22→28; (5) compensate summit height
with RANGE_H 95→118; (6) **fold train replaces SUBRANGE**: ridge-and-valley corrugations
parallel to the crest (elongated ridged noise of the warped cross-distance, slow along-strike
variation → ridges relay and die out), decaying quadratically to 2.4× the range width. No new
passes — the architecture stays: plates → (T/H/crust parallel) → C(plates+crust) →
relief(E-hills + belts) → fold envelope → erosion bake → rivers → biomes.

REJECTED: raising TECT_PLATE_TINT to align continents with plates (0.15→0.3+) — deferred, owner
call; risks re-polygonizing continents (the v1 problem). The land gate achieves the visible goal
(no mid-ocean walls) without touching continent shapes.

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry (always)
- `TERRAIN_GEN_VERSION`: **no bump** — every change is flag-ON-gated or a Tectonics-section
  tunable read only flag-ON; flag-OFF byte identity must be re-proven with the CCR-002
  fingerprint method (sha256, 3 seeds, 48×48 grid).
- `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION`: no

## Changes

### #1 — Single mountain authority: E-field capped to hills

**Location:** grep `TECTONIC_DETAIL_WEIGHT: 0.35, R_BASELINE_CAP:` in `voxEx.html` (registry).
**Before:** `R_BASELINE_CAP: 0.60,`  **After:** `R_BASELINE_CAP: 0.45,`
Also update the schema row note (grep `key: 'R_BASELINE_CAP'`): "flag-ON, the E-field makes
HILLS only (cap 0.45); true mountains come exclusively from boundary ranges (CCR-003 single
mountain authority)."
**Verify:** flag-ON interior (far from belts): no summits ≥95 from noise alone.

### #2 — Along-crest oscillation + transverse notches (tectonicRangeHeight)

**Location:** grep `const peaks = 0.40 + 0.60 *` and `const saddle = 0.80 + 0.20 *` inside
`tectonicRangeHeight`.
**After:** `peaks = 0.25 + 0.75 * (…)`, `saddle = 0.65 + 0.35 * (…)`.
Then, after the `if (hAdd <= 0) return 0;` line and BEFORE `return RANGE_H * amp * hAdd;`:
```js
// CCR-003: transverse notches (wind gaps) — the summit line drops into cols instead of
// running as a wall. Ridged along-coordinate field; cuts ~RANGE_NOTCH_SPACING apart.
const nk = 1 - Math.abs(noise2D(_pl.rangeAlong / RANGE_NOTCH_SPACING + 77.7, 2.2));
if (nk > 0.82) {
    const cut = (nk - 0.82) / 0.18;
    const cc = cut * cut * (3 - 2 * cut);
    hAdd *= 1 - RANGE_NOTCH_DEPTH * cc;
}
```
New tunables `RANGE_NOTCH_SPACING: 1400`, `RANGE_NOTCH_DEPTH: 0.7` (ui:'editor', full lockstep:
schema/aliases/sync/worker-emission/extract-terrain REGISTRY_KEYS).
**Verify:** transect along a belt crest shows summit height oscillating with deep cols; prototype
constants validated in `CCR-TECTONICS-003-target.png`.

### #3 — Land gate (ranges fade over ocean)

**Location:** head of `tectonicRangeHeight` (grep `const amp = _pl.rangeAmp;`).
**After:**
```js
let amp = _pl.rangeAmp;
if (!(amp > 0.02)) return 0;
// CCR-003: land gate — full-strength ranges only where C says land. Island arcs pass
// self-consistently: ARC_C_LIFT raises C, which opens this gate where the arc made land.
const _C = continentalness(gx, gz);
const _lg = _C < COAST_THRESHOLD_TECT - 0.04 ? 0 : _C > COAST_THRESHOLD_TECT + 0.10 ? 1
    : (_C - (COAST_THRESHOLD_TECT - 0.04)) / 0.14;
amp *= _lg * _lg * (3 - 2 * _lg);
if (!(amp > 0.02)) return 0;
```
**AUDIT NOTE (perf option):** `terrainSurface` already computed `C` for this column — the clean
implementation passes it through (`tectonicRangeHeight(gx, gz, seed, C)`, falling back to its
own `continentalness(gx, gz)` when the arg is undefined, e.g. editor-seam calls) to avoid a
second ~0.026ms continentalness evaluation per belt column. The prototype used the fallback
path only; both are behavior-identical.
**AUDIT NOTE (bake interaction):** the erosion bake input already includes the gated envelope
(bake samples terrainSurface), so no separate gating is needed in `buildOrogenRegion`.
**Verify:** no cont-cont range walls crossing open water at the 16k window; arcs still emerge.

### #4 — Louder erosion + summit compensation (defaults)

**Location:** registry (grep `EROSION_CELL: 24` / `EROSION_K: 22` / `RANGE_H: 95`).
`EROSION_CELL 24→20`, `EROSION_K 22→28`, `RANGE_H 95→118`.
**AUDIT NOTE:** cell 20 grows the bake grid to 512² — measure bake time (CCR-002 measured 4.0s
at 426²; expect ~6-8s). This is a LOOK-over-speed default; if in-game hitching is unacceptable,
the owner dials `EROSION_CELL` back (32 ≈ 4× faster) — that tradeoff is the knob's whole job.
**Verify:** belt zoom shows dendritic flanks clearly segmenting the wall.

### #5 — Fold train replaces the SUBRANGE twin ridge

**Location:** the two `SUBRANGE_AMP > 0` branches inside `tectonicRangeHeight`
(grep `twin ridge can extend past the main profile's support`).
**Why:** one fixed-offset twin ridge → a natural multi-ridge fold belt.

**After (replaces BOTH subrange branches; prototype-validated constants):**
```js
// CCR-003: FOLD TRAIN — ridge-and-valley corrugations parallel to the crest
// (Appalachian/Zagros style): multiple sub-parallel ridges that decay into the
// foothills and relay/die out along the range.
const foldExtent = W * FOLD_EXTENT_MULT;
if (ad < foldExtent) {
    const fN = 1 - Math.abs(noise2D(dWarp / FOLD_WAVELEN + 13.7, _pl.rangeAlong / FOLD_ALONG_LEN - 5.5));
    const decay = 1 - ad / foldExtent;
    const pk2 = 0.4 + 0.6 * (1 - Math.abs(noise2D(gx / RANGE_PEAK_WAVELEN + 3.1, gz / RANGE_PEAK_WAVELEN + 1.1)));
    hAdd += FOLD_AMP * Math.pow(fN, 2.2) * decay * decay * (0.5 + 0.5 * pk2);
}
```
NOTE: the fold block runs even when the main `prof <= 0` (fold zone extends past the main
profile) — restructure the early-outs accordingly (prototype: compute `ad/W` first, run main
terms if `prof > 0`, then the fold block, then the notch cut, then return).
New tunables (ui:'editor', full lockstep): `FOLD_WAVELEN: 900`, `FOLD_ALONG_LEN: 4200`,
`FOLD_EXTENT_MULT: 2.4`, `FOLD_AMP: 0.38`.
`SUBRANGE_OFFSET/WIDTH/AMP`: schema rows → `ui:'hidden'` + DEPRECATED note, `SUBRANGE_AMP`
default → 0 (keys retained for genParams save-compat, same policy as TECTONIC_DETAIL_WEIGHT).

**Verify:** belt zoom shows ≥2 sub-parallel ridges flanking the crest that relay/die out; no
fixed-offset "railroad track" pair.

## Worker parity

All edits live inside already-injected functions (`tectonicRangeHeight`) or the registry —
auto-propagates. New tunables ride the standard lockstep lists. If the C pass-through signature
is adopted, `terrainSurface`'s call site changes too (also injected — main-only edit).

## Acceptance (owner look-check)

1. Belt zoom (−400, 800)×6144, seed 1337 — summit line rises and falls through distinct peaks,
   cols, and wind gaps; ranges stop at coasts. Reference: `CCR's/CCR-TECTONICS-003-target.png`
   (GOOD) vs the shipped-wall render (chat, `A_shipped`).
2. 16k window — no mid-ocean walls; interior far from belts has hills but no snow summits.
3. Flag-OFF fingerprint identical (3 seeds).

## Safety Checks

- [ ] `node tools/parity-check.mjs` GREEN
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds + flag-OFF fingerprint identical
- [ ] `tools/voxex-tests.html` over localhost — no regressions (also still pending from CCR-002)
- [ ] New tunables: full lockstep (schema/aliases/sync/emission/extract-terrain)
- [ ] Bake time re-measured at cell 20; recorded in as-built
- [ ] Version constants per "Version impact"; CLAUDE.md/agent-notes updated if staled

## As-built (fill in AFTER implementation)

<pending>

# CCR-WORLDGEN-TECTONICS-007: boundary walls — Option A memo flip + flip-line crest-height blend

> **Status: DRAFT** — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-007 · **Build baseline**: 2026-07-21.1 · **Author**: Fable (lead) + subagents
> **Scope**: F1 (crest height continuity) ONLY. F2 (biome relief) and F3 (climate lapse) are a SEPARATE later CCR — do NOT start them here.
> **Flag**: flag-ON only (`worldConfig.tectonicPlates === true`). NO `TERRAIN_GEN_VERSION` bump (default OFF). Flag-OFF fingerprint `7487c1955a87…b086b3e46` MUST stay identical.

## Problem / Why

Flag-ON tectonic ranges show hard height WALLS along the trace where the nearest-plate
identity flips inside a range belt. Field-verified (seed "1982197682", build 2026-07-21.1):
−62 blk at (1054,-896), −45 at (997,-962).

ROOT CAUSE (verified, project memory `voxex-tectonic-boundary-findings`): `plateLookup`'s
memo field `rangeAlong` (the along-crest coordinate `fAlong = (gx−s1.x)·(−uz)+(gz−s1.z)·ux`)
EXACTLY NEGATES when the nearest site `s1` flips identity across the nearest-plate flip line
(origin shift ⊥ the boundary tangent ⇒ pure sign flip). That negation re-rolls the crest
profile (peaks/saddle/notch/fold/jag in `tectonicRangeHeight`, all keyed on `rangeAlong`),
producing a discontinuity right where the boundary bisects the crest. CCR-005's `rangeAmp`
fade only guards REGIME flips, not nearest-plate flips inside one regime's belt.

TWO residual classes remain after the memo fix alone (26-point gate, attempt 1):
- (a) SAME-PAIR flips: `rangeAlong` sign is fixed by Option A, but `rangeAmp`/`rangeD` are
  still computed per-side and can be mildly asymmetric at the flip (measured 0.529 vs 0.441)
  → 6/21 flips still step 4–13 blk.
- (b) TRANSITION flips (different winning pair OR regime per side): a PRE-EXISTING natural
  wall lives in the SHIPPED flag-ON build — 2024 (11240,9572) 144 blk (regime 3 vs 2),
  77777 115/124 blk. Option A alone slightly WORSENS these by re-phasing one side (144→174).

## Approach

Two changes, both flag-ON only:

1. **Option A (verified-good, +37 bytes).** In `plateLookup`'s dominant-RANGE winner block,
   canonicalize ONLY the memo's along-coordinate by the ordered plate-id pair so it no longer
   depends on which site happens to be nearest:
   `rangeAlong = fAlong;` → `rangeAlong = (s1.plateId < s.plateId) ? fAlong : -fAlong;`
   (`s1` = nearest site, `s` = the boundary-neighbor site; both carry `.plateId`.)
   This removes the crest-phase discontinuity but not the amplitude/offset asymmetry or the
   transition walls.

2. **Flip-line crest-height blend (generalizes CCR-001's "CONTINUOUS distance-weighted
   plate-baseline blend" precedent from the plate baseline to the crest term).** Near the
   nearest-plate flip line (where `d2−d1 → 0`, `d1`/`d2` = nearest/second-nearest site
   distances already computed in `plateLookup`), evaluate the crest contribution from BOTH
   candidate frames — the true-nearest `s1` frame and the as-if-`s2`-were-nearest frame — and
   blend the RESULTING HEIGHTS (never the memo fields; `rangeAlong` from different pairs is not
   blendable). Symmetric-average AT the line makes it continuous by construction for BOTH
   residual classes.

   Blend weight (symmetric across the flip line — this is the load-bearing bit):
   `wN = 0.5 + 0.5 * smoothstep(0, BLEND_BAND, sqrt(d2) − sqrt(d1))`; `wS = 1 − wN`.
   `H = wN * H(nearest-frame) + wS * H(second-frame)`.
   At `d2−d1 = 0`: `wN = wS = 0.5` → `H = (H_s1 + H_s2)/2`, IDENTICAL evaluated from either
   side (side A: nearest=s1,second=s2; side B: nearest=s2,second=s1 → same average). At
   `d2−d1 ≥ BLEND_BAND`: `wN = 1` → pure nearest frame = current behavior, so nothing changes
   away from flip strips. `BLEND_BAND` = new flag-ON tunable, start ~48–96 blk (prototype-tuned),
   `ui:'editor'`, full lockstep registry rules.

   IMPLEMENTATION SHAPE (prototype will confirm): extract the range-winner selection (the
   `rangeScore`/`rangeD`/`rangeAlong`/`rangeW`/`rangeAmp`/`rangeRegime` block, INCLUDING Option
   A) into a helper `rangeWinnerForSite(refSite, sites, bnds-equivalent, wx, wz, gx, gz, ...)`
   that is single-sourced and called (i) with `s1` (always — replaces the current inline block)
   and (ii) with `s2` (ONLY when `sqrt(d2)−sqrt(d1) < BLEND_BAND` — a thin strip). Store the
   second-frame range fields (`rangeD2/rangeAlong2/rangeW2/rangeAmp2/rangeRegime2`) + `blendWN`
   in the memo (default `blendWN = 1`, second fields inert). `tectonicRangeHeight` computes its
   `hAdd`→height for the primary frame as today, and when `blendWN < 1` also computes it for the
   second frame and returns the weighted lerp. The cheap winner-selection is duplicated in the
   strip; the heavy Voronoi/site/warp/smear work is shared (computed once).

**Cost control:** second winner-eval runs only in the flip strip (`d2−d1 < BLEND_BAND`).
Budget: terrainSurface cost delta ≤5%. Measure before/after.

**Erosion-bake interaction:** the orogen bake samples `terrainSurface`, so the blended crest
feeds `dh`/`flow` — that is fine (they re-record), but the prototype/port MUST re-verify
bake-twice determinism and that the `_orogenBaking` recursion guard still holds (the blend adds
no new `terrainSurface` re-entrancy; it stays inside `plateLookup`/`tectonicRangeHeight`).

### Rejected / do-not-retry
- **F1-FULL: canonicalizing `fAlong` at its SOURCE** (before the segment-phase math). VERIFIED
  do-not-retry (attempt 1): the sign-canon shifts the `segMix` segment phase → segment GAP
  lands on the boundary → `rangeAmp` collapse (0.91→0.32) → NEW 100–124 blk walls at regime-2
  transitions (seed 2024). Option A canonicalizes ONLY the memo's `rangeAlong`, AFTER all
  segment/keep math has consumed the raw `fAlong` — the segment phase is untouched.

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry citing CCR-007 (always).
- `TERRAIN_GEN_VERSION`: **NO** — flag-ON only (`tectonicPlates` default OFF); flag-OFF output
  byte-identical (fingerprint `7487c195…` re-verified).
- `CURRENT_CACHE_VERSION`: NO.
- `SETTINGS_VERSION`: NO.

## Changes

### #1 — Option A: canonicalize the range memo's along-coordinate
**Location:** grep `CCR-WORLDGEN-TECTONICS-002 Phase A: dominant RANGE boundary` in `voxEx.html`
(the winner block; the line is `rangeAlong = fAlong;`).
**Why:** `rangeAlong` must not negate when the nearest-site identity flips.

**Before:**
```js
rangeAlong = fAlong;
```
**After:**
```js
rangeAlong = (s1.plateId < s.plateId) ? fAlong : -fAlong;
```
**Verify:** prototype field walls 62→1 / 45→1; flag-OFF token unchanged; deterministic.

### #2 — Flip-line crest-height blend (plateLookup: second-frame memo + weight)
**Location:** grep `function plateLookup` — the boundary/winner loop and the `_plateMemoVal = {`
assembly.
**Why:** emit an as-if-`s2`-nearest range winner + the symmetric blend weight when in the flip
strip, so `tectonicRangeHeight` can produce a continuous crest across the flip line.
**Shape:** extract range-winner selection into single-sourced helper; call with s1 (always) and
s2 (strip-only); add `rangeD2/rangeAlong2/rangeW2/rangeAmp2/rangeRegime2` + `blendWN` to the memo.
**Verify:** prototype gate battery (below) passes against extracted functions; bake-twice
determinism holds; cost delta ≤5%.

### #3 — Flip-line crest-height blend (tectonicRangeHeight: two-frame lerp)
**Location:** grep `function tectonicRangeHeight`.
**Why:** evaluate crest height for both frames and lerp by `blendWN`.
**Shape:** factor the amp/land-gate/profile/fold/notch → height computation so it can run on
either frame's range fields; when `blendWN < 1`, `return wN*H_primary + wS*H_second`.
**Verify:** as #2.

### #4 — New tunable `BLEND_BAND` (full lockstep)
**Location:** `GEN_TUNABLES` Tectonics section + `GEN_TUNABLE_SCHEMA` (`ui:'editor'`) +
`let` alias + `syncGenTunableAliases` + worker const-emission block + `extract-terrain.mjs`
`REGISTRY_KEYS`.
**Why:** the flip-strip half-width; prototype-tuned (~48–96 blk).
**Verify:** `parity-check.mjs` GREEN; schema↔registry strict-parity test GREEN.

## Worker parity

- `plateLookup`, `tectonicRangeHeight` are INJECTED (single-source main-thread; worker generated
  via `Function.toString()` between the terrain-func markers) — edit MAIN ONLY; markers intact.
- New helper `rangeWinnerForSite` (if extracted as a standalone function) MUST join the
  `terrainFuncs` injection list AND the `window.VoxEx` seam list if probes need it. If instead
  it stays an inner closure of `plateLookup`, no injection-list change is needed (preferred —
  keeps it self-contained like the existing `getSite`/`_bump`/`_band` closures).
- `BLEND_BAND`: registry + schema + alias + `syncGenTunableAliases` + worker const-emission +
  `extract-terrain.mjs REGISTRY_KEYS` — all six lockstep sites in the same edit.

## Safety Checks

- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] `node tools/parity-check.mjs` GREEN (P10 RegionField construction untouched; new tunable in lockstep)
- [ ] `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds
- [ ] `node tools/flagoff-fingerprint.mjs` token `7487c1955a87…b086b3e46` UNCHANGED
- [ ] regionfield_baseline flag-OFF values unchanged
- [ ] new flag-ON dh/flow recorded + bake-twice byte-identical
- [ ] `node tools/run-browser-tests.mjs` 405/405 (update any legitimately-staled test, same-change rule, disclosed)
- [ ] terrainSurface cost delta measured ≤5%
- [ ] FULL gate battery (below) re-run against edited voxEx.html, not just the prototype
- [ ] No duplicate/shadowed identifiers (grep before declaring)
- [ ] `VOXEX_BUILD` bumped + `VOXEX_RECENT_CHANGES` entry citing CCR-007
- [ ] agent-notes §1 (do-not-retry: fAlong-source canon; segMix-phase hazard) + §3 as-built + this CCR's As-built updated

## Prototype acceptance gate (Phase 3 — BEFORE any voxEx.html edit)

Re-derive flip points: coarse `plateLookup` belt scan → step-8 flip walk → bisect. ~5 flips/seed
across seeds `1982197682, 2024, 77777, 555, 90210` + the two field sites. Acceptance:
- ALL same-pair flips: max windowed (±12) 1-blk step ≤ 3.
- TRANSITION flips: 2024 (11240,9572) 144 → ≤ ~20 (a slope across the band, not a wall);
  77777 115/124 similarly; NO flip point anywhere with step > 30 post.
- Field sites stay fixed: (1054,−896) ≤2, (997,−962) ≤2.
- Report the FULL pre/post table honestly, including any site that got worse.
- If the design cannot meet the bar, STOP and report — do not tune-and-pray.

## As-built (fill in AFTER implementation)

<TBD>

---

## Team-lead rulings — audit reconciliation (2026-07-21, Fable)

A fresh adversarial subagent audited the DRAFT design. Verdicts: Q1 Option-A/segMix hazard
avoided **SAFE**; Q2 blend weight C0 (effectively C1) continuous + symmetric **SAFE**; Q4 no new
recursion/nondeterminism (helper must not itself call terrainSurface) **SAFE**. Three items reconciled:

- **RULING 1 — NO `TERRAIN_GEN_VERSION` bump (OVERRULES the audit).** The audit (which had only
  CLAUDE.md, not the flag context) repeatedly asserted a TGV bump is required. It is NOT: every
  change here is gated `worldConfig.tectonicPlates === true` and the flag is **default OFF and
  soaking** (no shipped world is flag-ON; the default-flip + regen is a separate owner decision).
  CCR-002..006 all shipped flag-ON terrain changes with NO TGV bump for exactly this reason. The
  flag-OFF fingerprint `7487c1955a87…b086b3e46` stays identical (structural — plateLookup output
  is unreached flag-OFF; gated at the terrainSurface call site).

- **RULING 2 — Q5 ACCEPTED: second frame is a FULL independent recompute, not "the cheap part".**
  The as-if-`s2`-nearest frame MUST recompute the ENTIRE range-winner tuple relative to `s2` —
  its own boundary-neighbour set, `fAlong`, `fSegF/fSegIdx/fFrac`, `segMix`, `segFactor`, regime
  decision, and winner (`rangeD2/rangeAlong2/rangeW2/rangeAmp2/rangeRegime2`, WITH Option A on the
  `s2`-ordered pair). Reusing ANY primary-frame intermediate = a Frankenstein cross-pair tuple that
  can itself collapse `rangeAmp`. The extracted helper takes the reference site + the shared
  `sites` array and rebuilds everything from it. (Corrects the draft's "re-run only the cheap
  winner selection" wording in #2.)

- **RULING 3 — Q3 ACCEPTED: triple-junction fade on the second-frame weight.** Near a triple
  junction `d1≈d2≈d3`, the strip fires but the SECOND-nearest identity itself swaps (s2→s3),
  making `H_second` discontinuous → a NEW seam inside the strip. Guard it: multiply the
  second-frame weight by a triple-junction fade so it vanishes where `s3` competes with `s2`:
  `wS = (1 − wN) * smoothstep(0, BLEND_BAND, sqrt(d3) − sqrt(d2))`, and renormalise so
  `wN' = 1 − wS` (i.e. lost second-frame weight returns to the primary frame). `d3`/`s3` are
  ALREADY computed in plateLookup. At a clean two-plate flip `sqrt(d3)−sqrt(d2) ≫ BLEND_BAND`
  → fade = 1 → full blend; approaching a triple point → fade → 0 → pure primary frame (bounded
  residual at the measure-zero junction point, which the Phase-3 gate must confirm is ≤30 blk).

- **Q6 lockstep (ACCEPTED):** prefer the helper as an INNER closure of `plateLookup` (like the
  existing `getSite`/`_bump`/`_band` closures) so it rides the existing injection with NO new
  `terrainFuncs`/seam-list entry. Only if it must be standalone does it join the injection list +
  `extract-terrain.mjs FUNCS`. `BLEND_BAND` still joins all six tunable-lockstep sites.

### Revised blend weights (supersede the Approach's two-weight sketch)
```
g   = sqrt(d2) - sqrt(d1)                 // ≥0, →0 at the nearest-plate flip line
wN0 = 0.5 + 0.5*smoothstep(0, BLEND_BAND, g)     // symmetric primary weight
tj  = smoothstep(0, BLEND_BAND, sqrt(d3) - sqrt(d2))  // triple-junction fade (1 away from junctions)
wS  = (1 - wN0) * tj
wN  = 1 - wS
H   = wN*H(nearest-frame) + wS*H(second-frame)
```
At the flip line away from junctions: wN0=0.5, tj=1 → wS=0.5 → symmetric average (continuous).
Near a triple junction: tj→0 → wS→0 → pure primary frame. Outside the strip: wN0=1 → wS=0.

## Phase-3 prototype strategy (decided)
Prototype on a **/tmp COPY of voxEx.html** (never the repo file): apply the real edits to the
copy, `buildTerrainApi(copy, seed, {gameSeed:true, tectonicPlates:true})`, run the flip-point gate
battery. This tests the REAL edited code (not a reimplementation) and de-risks Phase 4 (identical
edits then land on the repo file). The measuring instrument (flip-point derivation) is validated
FIRST against the UNMODIFIED copy by reproducing the known walls (1054,−896)≈62, (997,−962)≈45,
2024(11240,9572)≈144, 77777≈115/124 before any edit is trusted.

---

## As-built — PROTOTYPE OUTCOME (Phase 3, 2026-07-21): BAR NOT MET → STOPPED before voxEx.html port

Status: **DRAFT → prototype-negative. NOT implemented in voxEx.html. Held for owner decision.**
Prototype on real patched copies (gameSeed harness, windowed ±12 wall metric on computeSurfaceHeight).

**What the crest-height flip-line blend DOES fix (regression-free):**
- Crest-sign-flip SAME-PAIR walls: seed 1982197682 field sites (1054,−896) 63→**1**, (997,−962) 49→**1**;
  seed 77777 −12500 same-pair belt (153/151/133/122)→**<60**; seed 90210 same-pair 51/47→out.
- Refactor invariant PASS: crest byte-identical outside flip strips (2346/2346 belt cols).

**KEY design correction (supersedes the draft's Option A):** the draft prescribed Option A (global
memo `rangeAlong` sign-canon) + blend. Measured: Option A canonicalizes the PRIMARY memo BELT-WIDE
and re-phases crests far from flips → WORSENS the 2024 transition 143→**174**. The height blend makes
Option A unnecessary — **blend-only** (primary + `rangeWinnerFor` both keep raw `rangeAlong = fAlong`)
fixes the same-pair walls IDENTICALLY (62/45→1) via symmetric averaging, is zero-change away from flip
strips, and does NOT worsen transitions — it IMPROVES several (2024 167→113, 163→116) and leaves the
tight-triple-junction wall unmoved (143→143, vs Option A's 174). **Blend-only dominates. Do not ship
the global Option A canon.**

**What it does NOT fix (the STOP):** residual walls 60–143 at tectonic triple junctions — same-pair
(77777 −10996:68, 1592:60) AND transition (2024 143 unmoved; belt 100–116; 77777 73/68). These are
RELIEF/EROSION-COUPLED, not crest-sign-flip: `upliftR`/`tectonicReliefBlend` amplitude jumps drive the
fractal-relief amplitude, the orogen bake carves the tall regime-2 envelope, and the arc (regime 3,
amp 0.22) vs Andean (regime 2, amp 0.91) are two spatially-OFFSET genuinely-different-height ranges
(blending two offset profiles still steps at the massif). `plateBaseC` is smooth — NOT a base-C jump.
Forcing tj=1 at the junction only reaches 174→113. Out of crest-blend scope.

**Recommendation:** ship **blend-only** as a regression-free partial win (F1a — fixes the field-reported
crest-sign-flip walls + reduces many transitions), and scope the relief/erosion-coupled triple-junction
class as a follow-up **F1b** (blend `upliftR`/`tectonicReliefBlend` + the erosion envelope across flips,
not just the crest — bigger, re-bake cost, its own prototype). Alternative: expand THIS CCR to F1b now.
OWNER DECISION REQUIRED before any voxEx.html edit. Nothing committed.

Harness (SHIPPED to repo, safe): `extract-terrain.mjs` `buildTerrainApi(...,{gameSeed:true})` — default
derivation unchanged, `flagoff-fingerprint` token 7487c195… re-verified identical. `tools/scratch/`:
`flip-derive.mjs`, `cand.html` (Option-A+blend), `cand_blendonly.html` (recommended).

---

## As-built — F1a IMPLEMENTED (blend-only) build 2026-07-21.2 — COMMITTED LOCALLY, PUSH HELD

Shipped the **blend-only** flip-line crest-height blend to `voxEx.html` (NOT Option A). Files touched:
`voxEx.html` (blend code + VOXEX_BUILD 2026-07-21.2 + VOXEX_RECENT_CHANGES entry),
`tools/lib/extract-terrain.mjs` (gameSeed harness — Phase 2), `docs/agent-notes.md` (§1 two do-not-retry
rows + §3 as-built note), this CCR.

**Design as shipped:** `plateLookup` inner closure `rangeWinnerFor(ref)` (full independent range-winner
recompute rel. to `ref`) + memo `{rangeD2,rangeAlong2,rangeW2,rangeAmp2,rangeRegime2,rangeWS}`;
`tectonicRangeHeight` factored into `crestHeightFromFields(...)` returning `(1-wS)*H1+wS*H2`.
`BLEND_BAND=64` internal const (not a registry tunable — precedent: OROGEN_DELTAC et al.). Flag-ON only.
DEVIATION from draft #4: BLEND_BAND kept as internal const (injects with plateLookup; promoting to an
editor tunable is a trivial follow-up). No global Option-A canon (superseded — see agent-notes §1).

**Gate results (all run against the edited voxEx.html):**
- syntax-check GREEN; parity-check P10a/b/c GREEN (injected functions single-sourced).
- flag-OFF fingerprint `7487c1955a87ca7ec38170335303e4e90f6ee78495a47f1c6219466b086b3e46` — IDENTICAL (unchanged).
- terrain-node-checks: ALL HARD CHECKS GREEN (determinism, continuity max|Δ|=3, rivers, tree-soil).
- flip battery (windowed ±12 wall metric, gameSeed harness, real voxEx.html): field (1054,−896) 63→**1**,
  (997,−962) 49→**1**; seed 2024 (11239,9572) transition **143 unworsened** (blend inert at its tight
  triple junction, tj≈0); 77777 −12500 same-pair belt 153/151/133→**<60**.
- computeSurfaceHeight cost delta **+3.3%** (≤5% budget), measured warm in a flip-adjacent belt region.

**NOT met (as expected — documented STOP):** the CCR's transition bar (2024→≤20; all flips ≤30).
Residual relief/erosion-coupled walls 60–143 at triple junctions remain — scoped **F1b** (future CCR:
blend upliftR/tectonicReliefBlend + the orogen erosion envelope across flips, not just the crest).

**OWED before push (HELD):** (1) browser worker-parity suite — could NOT run in the sandbox (device 45s
cap + no backgrounding; cloud headless Chromium hangs at load, 2 attempts); run on a real browser.
(2) owner flag-ON eyeball of the new look (also still owed CCR-1 talus + tectonicPlates default-flip).

Status: **DRAFT → IMPLEMENTED (F1a partial). Committed locally; push HELD. Keep in CCR's/ (F1b open).**

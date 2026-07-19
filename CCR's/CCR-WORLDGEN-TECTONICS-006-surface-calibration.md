# CCR-WORLDGEN-TECTONICS-006: Flag-ON surface calibration (material bands, camo fixes, terrace warp)

> **Status: DRAFT** — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-006 · **Build baseline**: 2026-07-18.1 (CCR-003 as-built) · **Author**: Claude (Cowork session 2026-07-18, owner-directed)
> **Depends on**: CCR-002/003 (crest capture, erosion bake, single mountain authority). Implement
> **AFTER CCR-005, BEFORE CCR-004** — the surface must be dressed correctly on the final
> morphology before rivers erode it. Every change is gated on `worldConfig.tectonicPlates` —
> flag-OFF is byte-identical, NO TERRAIN_GEN_VERSION bump (fingerprint `22815f15…2de0` re-proven).

## Problem / Why

Owner, 2026-07-18: the real-materials render of the flag-ON terrain shows "camo shirt" speckle
over the uplands, sand/grass camo along shores, and generally disjointed dressing. Four MEASURED
root causes:

1. **The band ladder was calibrated for the old terrain's height distribution.** Flag-ON land
   height histogram (seed 1337, 32k-column sample): 67.1% of land at 60-69, 18.2% at 70-79,
   10.5% at 80-89 — against the ABSOLUTE-Y band ladder SNOW 190 / SNOW_PATCHES 160 / HIGH_ROCK
   140 / ROCK 110 / ALPINE 85 (grep `let ALPINE_LINE = 85`), shifted per column by
   `bandShift = Math.max(-13, (localT - 0.5) * 80 + dither)` (grep
   `const bandShift = Math.max(-13`). In COLD regions ALPINE_LINE drops to its floor of 72 —
   nearly ALL flag-ON upland (70-100) lands inside the alpine grass/dirt/stone grading band
   (grep `const bandT = Math.min(1, Math.max(0, (worldTopY - ALPINE_LINE) / 25)`): that band's
   graded patch cuts over freq-0.05 patchNoise ARE the upland camo. Meanwhile SNOW /
   SNOW_PATCHES (177+ / 147+ even at the minimum shift) are nearly unreachable on a surface
   that tops out ~100 outside the belts — bald mountains, no snow story.
2. **Slope-wear patchwork.** The lowland moderate-slope wear term (grep
   `const wear = Math.min(1, (maxSlope - 2) / 3)`) fires on every moderate slope, and the
   CCR-002 erosion bake mass-produces moderate slopes across whole flanks; the patch cuts read
   patchNoise at freq 0.05 (~20-blk features) — the result is per-knoll speckle, not patches.
3. **Shore camo = incoherent sand dither on flat shelves.** Both sand arms dither their height
   band with surfaceNoise at freq 0.1 (~10-blk): grep
   `riverFactor < 0.5 && worldTopY < WORLD_DIMS.seaLevel + 3 + surfaceNoise * 2` (river arm)
   and the ocean arm `worldY < WORLD_DIMS.seaLevel + 2 + surfaceNoise * 1.5`. On the flat
   tectonic shelves (gradient ~0.02 blk/blk) a ±2-3 blk noise band spans a ~100-200-blk-wide
   sand/grass speckle zone — the owner's shore camo. The COHERENCE of the dither is the defect,
   not the band itself.
4. **Terracing treads on gentle flag-ON slopes.** The WS1 contour-break warp exists but
   `TERRACE_WARP_AMP` defaults 0 and is GLOBAL (grep `TERRACE_WARP_AMP: 0` and
   `if (TERRACE_WARP_AMP > 0)`) — changing the default would change flag-OFF terrain
   (TERRAIN_GEN_VERSION bump), which this CCR forbids.

## Approach

One flag-gated material-constant layer; every cascade edit lands in its `isTreeSoilSurface`
mirror in lockstep. (1) `TECT_BAND_LIFT` (default 25) raises the WHOLE band ladder flag-ON —
alpine starts ~110, so the camo band leaves the 70-100 uplands, and snow becomes reachable on
belt summits (150-230). (2) `TECT_WEAR_SOFTEN` (default 0.6) scales the slope-wear term
flag-ON. (3) Coherent camo edges: flag-ON the patchNoise freq for material decisions drops
0.05 → `TECT_PATCH_FREQ` (0.02) and the sand-dither noise freq 0.1 → `TECT_SAND_FREQ` (0.015)
— boundary LINES that wander, instead of speckle. (4) `TERRACE_WARP_AMP_TECT` (default 6) is
ADDED to the effective warp amp only when tectonicPlates is on, leaving the global default 0
untouched. CRITICAL: the mirror hardcodes `85 + bandShift` / `110 + bandShift` literals and its
own patchNoise/sand-noise formulas (grep `if (isMountain || groundY >= 85 + bandShift)` and
`groundY < WORLD_DIMS.seaLevel + 2 + noise2D(gx * 0.1, gz * 0.1) * 1.5`) — every one of these
changes in the same commit, per the file's own lockstep contract (the mirror's doc comment:
"LOCKSTEP: if generateTerrainPass changes its flat-ground branches, band constants
(190/160/140/110/85 + temp/lapse/dither shift), lake gate, or noise formulas … update this to
match — and vice versa").

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry (always)
- `TERRAIN_GEN_VERSION`: **no bump** — tectonicPlates default OFF; every change is flag-gated
  or a Tectonics-section tunable read only flag-ON. Flag-OFF byte identity must be RE-PROVEN
  with the CCR-002 fingerprint method (sha256, 3 seeds, 48×48 grid — expected constant
  `22815f15…2de0`, same as CCR-002/003/005).
- `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION`: no

## Changes

### #1 — Band-ladder lift (TECT_BAND_LIFT)

**Location:** grep `SNOW_LINE         = 190 + bandShift` in `voxEx.html` (generateTerrainPass,
tempCache branch); mirror at grep `if (isMountain || groundY >= 85 + bandShift)`.
**Why:** flag-ON uplands (70-100) must be grass country, not the alpine camo band; snow must be
reachable on belt summits.

**Before (cascade):**
```js
const bandShift = Math.max(-13, Math.round((localT - 0.5) * 80 + bandDither));
SNOW_LINE         = 190 + bandShift;
SNOW_PATCHES_LINE = 160 + bandShift;
HIGH_ROCK_LINE    = 140 + bandShift;
ROCK_LINE         = 110 + bandShift;
ALPINE_LINE       =  85 + bandShift;
```
**After:** hoist `const _tbl = worldConfig.tectonicPlates === true ? TECT_BAND_LIFT : 0;` once
before the column loops (beside the `_desertBiomeId` hoists — it is loop-invariant), and all
five assignments gain `+ _tbl` (e.g. `SNOW_LINE = 190 + bandShift + _tbl;`).

**Fallback ladder — VERIFIED, do NOT touch:** the pre-cache initializers (grep
`let SNOW_LINE = 190`) run only when `caches.tempCache` is null, i.e. `useNewTerrain` false
(grep `const tempCache = worldConfig.useNewTerrain ?`). In that mode `computePreRiverHeight`
dispatches to `sampleBiomeBilinearHeight` — `terrainSurface`/`plateLookup` never run and plates
never author height — so lifting the fallback would shift materials on terrain the plates never
touched. Leave it untouched.

**Mirror (isTreeSoilSurface):** its `_tbl` must carry the SAME effective guard as the cascade's:
`const _tbl = (worldConfig.useNewTerrain && worldConfig.tectonicPlates === true) ? TECT_BAND_LIFT : 0;`
(the cascade's `_tbl` only ever applies inside the tempCache branch, which exists only under
useNewTerrain — the mirror must not lift when the cascade doesn't). Then:
- `if (isMountain || groundY >= 85 + bandShift)` → `85 + bandShift + _tbl`
- `if (groundY >= 110 + bandShift) return false;` → `110 + bandShift + _tbl`
- the alpine bandT branch's `85 + bandShift` occurrences (guard AND
  `(groundY - (85 + bandShift)) / 25`) → `85 + bandShift + _tbl`
- **AUDIT NOTE (easy to miss):** the mirror's lake-bed gate hardcodes SNOW_PATCHES_LINE — grep
  `groundY > 100 && groundY < 160 + bandShift` — and the cascade's lake gate compares
  `worldTopY < SNOW_PATCHES_LINE` (which now carries `_tbl`). The mirror literal becomes
  `160 + bandShift + _tbl` or lake beds and tree soil disagree.

**AUDIT NOTE (scope):** `TREE_LINE_BASE` / `FOREST_LINE` are deliberately NOT lifted this CCR —
tree density vs the lifted ladder is a separate calibration; record as a follow-up.
**Verify:** flag-ON seed-1337 render — uplands 70-100 read as grass/forest country; alpine
grading confined to belt flanks ≥ ~110; snow only on 150-230 belt summits. Flag-OFF fingerprint
identical.

### #2 — Slope-wear soften (TECT_WEAR_SOFTEN)

**Location:** grep `const wear = Math.min(1, (maxSlope - 2) / 3)` in `voxEx.html`
(generateTerrainPass, lowland isModerate branch).

**Before:**
```js
const wear = Math.min(1, (maxSlope - 2) / 3);
if (patchNoise > -0.55 + wear * 0.75) id = GRASS;
```
**After:** `const wear = Math.min(1, (maxSlope - 2) / 3) * (worldConfig.tectonicPlates === true ? TECT_WEAR_SOFTEN : 1);`
— the grass/dirt cut formulas below stay unchanged; scaling the wear multiplier alone widens
grass survival on the bake's moderate slopes.
**AUDIT NOTE (no mirror needed — verified):** `isTreeSoilSurface` mirrors only the
slope-flag-free case (tree sites have ring slope ≤ 2, so `isModerate` is provably false there —
per its own doc comment); the wear term has no mirror site. Do not add one.
**Verify:** flag-ON eroded flank: mostly grass with coherent worn-dirt streaks, not 50/50
speckle. Flag-OFF byte-identical (multiplier is literal 1).

### #3 — Coherent patch/sand noise (TECT_PATCH_FREQ, TECT_SAND_FREQ)

**Location (cascade):** grep `const patchNoise = noise2D(gx * 0.05 + 100, gz * 0.05 + 100)` —
TWO hits, cascade and mirror; both change. Sand arms: grep
`riverFactor < 0.5 && worldTopY < WORLD_DIMS.seaLevel + 3 + surfaceNoise * 2` and
`worldY < WORLD_DIMS.seaLevel + 2 + surfaceNoise * 1.5`.

**Before (cascade noise layers):**
```js
const surfaceNoise = noise2D(gx * 0.1, gz * 0.1);
const patchNoise = noise2D(gx * 0.05 + 100, gz * 0.05 + 100);
```
**After (sketch):**
```js
const _tectM = worldConfig.tectonicPlates === true;
const surfaceNoise = noise2D(gx * 0.1, gz * 0.1);
const patchNoise = _tectM
    ? noise2D(gx * TECT_PATCH_FREQ + 100, gz * TECT_PATCH_FREQ + 100)
    : noise2D(gx * 0.05 + 100, gz * 0.05 + 100);
// CCR-006: dedicated LOW-freq shore dither — a wavy boundary LINE, not speckle.
const coastNoise = _tectM
    ? noise2D(gx * TECT_SAND_FREQ + 55.5, gz * TECT_SAND_FREQ - 21.7)
    : surfaceNoise;
```
Both sand arms then replace `surfaceNoise` with `coastNoise` in their height conditions ONLY
(`… seaLevel + 3 + coastNoise * 2` / `… seaLevel + 2 + coastNoise * 1.5`); amplitudes
unchanged; every OTHER surfaceNoise consumer (steep-slope STONE/GRAVEL picks etc.) is
untouched. Flag-OFF `coastNoise === surfaceNoise` and patchNoise is the textually-identical
formula — byte-identical.
**AUDIT NOTE (patchNoise fan-out is intentional):** every cascade consumer of the `patchNoise`
variable (alpine cuts, wear cuts, lake gate's `patchNoise < 0`, bare-patch `< -0.62`) inherits
the flag-ON freq change — that IS the fix, and the mirror inherits it identically via its own
single formula.

**Mirror (isTreeSoilSurface):**
1. grep `groundY < WORLD_DIMS.seaLevel + 2 + noise2D(gx * 0.1, gz * 0.1) * 1.5` — flag-ON
   replace the inline `noise2D(gx * 0.1, gz * 0.1)` with the SAME coastNoise formula
   (`noise2D(gx * TECT_SAND_FREQ + 55.5, gz * TECT_SAND_FREQ - 21.7)`), same `_tectM`-style
   gate. (Only the ocean arm exists here — tree sites have riverFactor ≥ 0.8.)
2. The mirror's `const patchNoise = noise2D(gx * 0.05 + 100, gz * 0.05 + 100);` gets the same
   flag-gated freq. **AUDIT NOTE:** the alpine-meadow soil decision
   (`return patchNoise > -0.6 + bandT * 0.65;`) and the mirror lake gate's `patchNoise < 0`
   both read it — the freq change must land in BOTH functions or tree soil lies (cite: the
   lockstep contract comment quoted in Approach, adjacent to the mirror's header).
**Verify:** same shore window as the owner's render — sand/grass boundary is a single wavy line
(~60-blk wavelength) hugging the waterline band; upland patches are 50-blk-scale coherent
meadow/scree shapes.

### #4 — Terrace warp additive (TERRACE_WARP_AMP_TECT)

**Location:** grep `if (TERRACE_WARP_AMP > 0)` in `voxEx.html` (terrainSurface top-of-function
guard).

**Before:**
```js
if (TERRACE_WARP_AMP > 0) {
    const _twR = reliefParam(gx, gz);
    const _twGate = Math.max(0, Math.min(1, (_twR - TERRACE_WARP_RELIEF_MIN) / 0.3));
    if (_twGate > 0) {
        const _twWx = noise2D(gx * TERRACE_WARP_FREQ + 5.1, gz * TERRACE_WARP_FREQ - 2.3) * TERRACE_WARP_AMP * _twGate;
        const _twWz = noise2D(gx * TERRACE_WARP_FREQ + 40.7, gz * TERRACE_WARP_FREQ + 8.9) * TERRACE_WARP_AMP * _twGate;
        gx = gx + _twWx;
        gz = gz + _twWz;
    }
}
```
**After (sketch):**
```js
// CCR-006: flag-ON additive warp amp — global default stays 0 (no TGV bump).
const _ta = TERRACE_WARP_AMP + (worldConfig.tectonicPlates === true ? TERRACE_WARP_AMP_TECT : 0);
if (_ta > 0) {
    …
        const _twWx = noise2D(…) * _ta * _twGate;
        const _twWz = noise2D(…) * _ta * _twGate;
    …
}
```
Flag-OFF: `_ta === TERRACE_WARP_AMP === 0` — the guard skips the block exactly as before,
byte-identical (the existing AUDIT FLAG comment above the guard stays true; extend it with one
line noting the CCR-006 additive term).
**Verify:** flag-ON gentle belt-flank slopes lose the tread/riser contour pattern; WS1's M18-S
staircaseIndex on flag-ON transects drops vs this baseline (informational, not a gate).

### #5 — Full lockstep for the 5 new tunables

`TECT_BAND_LIFT: 25`, `TECT_WEAR_SOFTEN: 0.6`, `TECT_PATCH_FREQ: 0.02`,
`TECT_SAND_FREQ: 0.015`, `TERRACE_WARP_AMP_TECT: 6` — all ui:'editor', section 'Tectonics'.
Every list, same commit:

- Registry defaults: grep `RANGE_H: 118` (Tectonics section of GEN_TUNABLES).
- Schema rows: grep `key: 'RANGE_RELIEF_SWAP'` (add after the Tectonics rows; note each as
  flag-ON-only material/warp calibration).
- Hot-path let-aliases: grep `let RANGE_H = GEN_TUNABLES`.
- `syncGenTunableAliases` entries: grep `function syncGenTunableAliases`.
- Worker const-emission: grep `injectedCode += '    const RANGE_RELIEF_SWAP` (same
  live-bake pattern; TERRACE_WARP_AMP already has its own emission line — the new
  TERRACE_WARP_AMP_TECT gets its own beside the TECT block).
- `tools/lib/extract-terrain.mjs` REGISTRY_KEYS: grep `'RANGE_NOTCH_SPACING'` — append the 5
  keys after the CCR-003 keys.
- No new functions this CCR: `generateTerrainPass`, `isTreeSoilSurface`, and `terrainSurface`
  are already worker-injected AND in extract-terrain FUNCS — single-source edits propagate.

## Worker parity

All three touched functions are injected, single-sourced main-thread (`terrainSurface` between
the terrain-funcs markers; `generateTerrainPass` / `isTreeSoilSurface` via the chunk-worker
injection lists — established by CCR-TERRAIN-011's parity note and extract-terrain's FUNCS,
which lists all three). The 5 new tunables ride the standard const-emission block (#5). No
hand-maintained copies are touched; no new injection-list entries are needed.

## Acceptance (owner look-check)

1. Real-materials render of the SAME shore window as the owner's report: sand boundary is a
   wavy line, not speckle.
2. Uplands (70-100) mostly grass/forest with coherent meadow/scree patches; no camo.
3. Snow on belt summits only (150-230); alpine grading confined to belt flanks.
4. Terrace treads gone from gentle flag-ON slopes.
5. Flag-OFF fingerprint identical (3 seeds, sha256 `22815f15…2de0`).
6. Bake determinism unaffected (bake-twice byte-identical — #4's warp feeds terrainSurface,
   which the bake input already samples; nothing new is order-dependent).

## Safety Checks

- [ ] `node tools/parity-check.mjs` GREEN
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] Terrain touched: `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds + flag-OFF
      sha256 fingerprint IDENTICAL (re-proven, not assumed)
- [ ] `tools/voxex-tests.html` over localhost — no regressions (STILL PENDING/owed since
      CCR-002: the browser worker-parity suite has not been run on any 00x build)
- [ ] No duplicate/shadowed identifiers (grep each of the 5 new keys + `_tbl` / `coastNoise` /
      `_tectM` / `_ta` BEFORE declaring)
- [ ] New tunables: full lockstep per #5 (registry/schema/aliases/sync/emission/extract-terrain)
- [ ] Materials lockstep: every #1/#3 cascade edit verified TOGETHER with its
      isTreeSoilSurface mirror (incl. the `160 + bandShift` lake-gate literal)
- [ ] No unbatched per-frame work added (all edits are gen-time per-column)
- [ ] Version constants per "Version impact"; CLAUDE.md / docs/agent-notes.md updated if staled

## As-built (build 2026-07-18.2)

Shipped in **build 2026-07-18.2** (batched with CCR-005 + CCR-004). NO TERRAIN_GEN_VERSION bump
— every change is gated on `tectonicPlates === true`; flag-OFF material cascade byte-identical
and flag-OFF sha256 fingerprint re-verified IDENTICAL
(`22815f15a583ce58c80a08b08f0087260e80453a6043eeb5c92d7d1339212de0`, 3 seeds).

**As-built (implemented as drafted; five calibrations, each with its `isTreeSoilSurface`
lockstep mirror updated in the same edit):**

1. **Band ladder lift** — `const _tbl = worldConfig.tectonicPlates === true ? TECT_BAND_LIFT : 0`
   added to the five altitude-band cascade assignments (SNOW 190 / PATCHES 160 / HIGH_ROCK 140 /
   ROCK 110 / ALPINE 85, each `+ bandShift + _tbl`); mirror literals 85/110/160 carry the same
   `_tbl` with the `worldConfig.useNewTerrain &&` conjunction. TECT_BAND_LIFT 25.
2. **Wear soften** — wear/exposure term `* _tws` (TECT_WEAR_SOFTEN 0.6) — kills the
   high-frequency rock speckle on mid slopes.
3. **Coherent patches** — patchNoise frequency `_pnf` (tect ? TECT_PATCH_FREQ : 0.05) at BOTH
   call sites. TECT_PATCH_FREQ 0.02.
4. **Sand 'camo' fix** — the beach-sand gate's coastNoise becomes
   `tect ? noise2D(gx*TECT_SAND_FREQ + 55.5, gz*TECT_SAND_FREQ − 21.7) : surfaceNoise` in both
   sand conditions + the mirror. Root cause of the owner's 'camo shirt': surfaceNoise at
   terrain frequency gated sand per-column. TECT_SAND_FREQ 0.015 → contiguous sand runs with
   clean grass boundaries.
5. **Terrace warp** — `_ta = TERRACE_WARP_AMP + (tect ? TERRACE_WARP_AMP_TECT : 0)`
   (TERRACE_WARP_AMP_TECT 6) — breaks the straight terrace contour lines that read as
   heightmap/plate seams.

5 new tunables (TECT_BAND_LIFT 25, TECT_WEAR_SOFTEN 0.6, TECT_PATCH_FREQ 0.02,
TECT_SAND_FREQ 0.015, TERRACE_WARP_AMP_TECT 6) — full lockstep (registry / schema / aliases /
sync / worker-emission / extract-terrain REGISTRY_KEYS).

**Gates (measured):** syntax + parity + terrain-node-checks GREEN; flag-OFF fingerprint
identical. Acceptance: REAL-material renders (actual `generateTerrainPass` cascade, top block
per column — not the palette approximation that misled earlier review) show contiguous beaches,
coherent alpine banding, no plate-seam banding (CCR's/CCR-TECTONICS-006-realmat-acceptance.png). Known-and-accepted: tundra-biome snow patches
at low elevation are intended biome behavior, not a band-ladder defect.

**PENDING:** `tools/voxex-tests.html` browser worker-parity suite over localhost (owed since
CCR-002); owner editor eyeball.


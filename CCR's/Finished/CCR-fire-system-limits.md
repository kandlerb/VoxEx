# CCR — Fire System: Remove Hardcoded Caps and Raise Configurable Limits

**ID:** VOXEX-CCR-FIRE-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🟢 Implemented (build 2026-06-22.17)
**Scope:** Fire system › simulation cap › per-chunk model cap › UI sliders

---

## Summary

Four separate limits conspire to cap simultaneous fire blocks at no more than 64 active at any time. Two are hardcoded constants with no setting link; the third is a user-configurable setting whose UI slider ceiling (max=64) matches those hardcoded values; the fourth is the spread rate. The fix raises the configurable default and slider max, and replaces the two hardcoded `64` constants with the existing `SETTINGS.fireMaxActive` — no new setting required, invariant guaranteed by design.

---

## How the Fire System Works

### Simulation layer (`fireSystem.cells`)

`fireSystem` is a module-level object (~line 40547). Its `cells` Map holds every live fire position: `{key, x, y, z, age, burnScale}`. Every 0.5 s (`TICK_INTERVAL`) the update function iterates all cells, ages them, and — if `SETTINGS.fireSpread` is true and budget allows — calls `spreadFire()` to ignite adjacent air cells that cling to burnable blocks.

`spreadFire()` (line 40674) uses weighted-reservoir sampling over up to 12 candidate directions (upward-biased: weights 8/4/1). On success, three operations run in sequence:

```js
setBlock(_spreadX, _spreadY, _spreadZ, FIRE);  // write block to world array
fireSystem.register(_spreadX, _spreadY, _spreadZ);  // add simulation entry
addFireModel(_spreadX, _spreadY, _spreadZ);     // create Three.js Group (return ignored)
```

Note: `addFireModel`'s return value is not checked. This is safe ONLY when the per-chunk model cap is always ≥ the global simulation cap — see the Invariant section below.

### Model layer (`chunkFires`)

`chunkFires` is a `Map<chunkKey, Map<cellKey, THREE.Group>>`. Each fire block has one Group (built by `createWorldFire()`), containing animated PlaneGeometry quads on shared materials. Models are placed during chunk meshing (`renderChunk` loop) or incrementally on spread (`addFireModel`).

### Point lights

Fire positions feed into `torchLightPool.torchPositions` alongside torches (`rebuildTorchPositions()`, line 13443). The pool is capped at `MAX_POINT_LIGHTS = 8` — the 8 closest torches and fires receive real PointLights. This GPU cap is intentional and is NOT changed by this CCR.

---

## The Four Limits

### Limit 1: `SETTINGS.fireMaxActive` — global simulation cap (default 48, UI max 64)

**Spread check** (~line 40597):
```js
if (spreadBudget > 0 && SETTINGS.fireSpread && this.cells.size < SETTINGS.fireMaxActive
    && Math.random() < scan.spreadChance * SETTINGS.fireSpreadChance) {
    if (spreadFire(f)) spreadBudget--;
}
```

Spread is blocked once `cells.size` reaches `fireMaxActive`. **This is the primary cap.**

**Profile values:**
- Performance: 24, Balanced: 48 (default), Quality: 64

**UI slider** (~line 3634):
```html
<input type="range" id="fire-max-active-slider" min="8" max="64" step="4" />
```
The slider ceiling of 64 matches the hardcoded per-chunk caps — users cannot raise the global limit above 64 without source edits.

### Limit 2: `addFireModel()` per-chunk model cap — hardcoded 64

**Location:** `addFireModel()` function (~line 40375):
```js
if (m && m.size >= 64) return false;  // per-chunk model cap (parity with old spawn loop)
```

NOT linked to any setting. Blocks model creation for the given chunk once 64 fire models exist there, regardless of the global cap.

### Limit 3: `renderChunk` per-chunk fire loop cap — hardcoded 64

**Location:** `renderChunk()` function (~line 41830):
```js
const MAX_FIRES_PER_CHUNK = 64;
// ...
if (cur && cur.size >= MAX_FIRES_PER_CHUNK) break fireLoop;
```

Same per-chunk limit exercised at chunk-load time instead of at spread time. The `break fireLoop` also stops `fireSystem.register` — unlike Limit 2, fires above the cap are not registered into the simulation at all during an initial mesh.

### Limit 4: `SETTINGS.fireSpreadBudget` — spread rate cap (default 4, UI range 1–16)

Max new flames per 0.5 s tick. Already user-configurable; not changed by this CCR.

---

## Why These Limits Exist (Historical Context)

The DEFAULTS comment at line 6286:
```js
fireMaxActive: 48,  // global active-fire cap (<= per-chunk model cap 64, so all render)
```

Documents the design intent: keep the global cap ≤ the per-chunk cap so that even if all active fires concentrate in one chunk, every simulation entry has a corresponding model (no invisible fires). This was a conservative baseline, not an intended permanent ceiling.

---

## The Invariant: Why Per-Chunk Cap Must Equal the Global Cap

`spreadFire()` does not check `addFireModel()`'s return value. If the per-chunk cap blocks model creation while the global cap still permits the simulation entry (i.e., per-chunk cap < global cap and all fires landed in one chunk), the result is a fire that: damages entities, ages, spreads — but has no visual model.

Is this scenario reachable? Only if a chunk has `k = per-chunk-cap` fire models while the global count `N < fireMaxActive`. But `k ≤ N` always (every model corresponds to one simulation entry). So if `per-chunk-cap = fireMaxActive`, then `k = fireMaxActive` implies `N ≥ fireMaxActive`, which means the global spread check fires first and blocks `spreadFire()` before `addFireModel()` is reached.

**Conclusion:** Setting `per-chunk-cap = SETTINGS.fireMaxActive` guarantees the per-chunk model cap never trips during spread. The only place it can trip is `renderChunk` at chunk-load time — where `break fireLoop` also stops `fireSystem.register`, so simulation and models stay in sync.

This means **no new setting is needed**: the two hardcoded `64` values simply become `SETTINGS.fireMaxActive`.

---

## Proposed Changes (Minimal, Correct Set)

### Change 1: Replace hardcoded `64` in `addFireModel()` with `SETTINGS.fireMaxActive`

```js
// Before
if (m && m.size >= 64) return false;

// After
if (m && m.size >= SETTINGS.fireMaxActive) return false;
```

### Change 2: Replace hardcoded `64` in `renderChunk` fire loop with `SETTINGS.fireMaxActive`

```js
// Before
const MAX_FIRES_PER_CHUNK = 64;

// After
const MAX_FIRES_PER_CHUNK = SETTINGS.fireMaxActive;
```

(Line 41839 `cur.size >= MAX_FIRES_PER_CHUNK` is unchanged — it already reads the local constant.)

### Change 3: Raise `SETTINGS.fireMaxActive` default and profile values

| Location | Before | After |
|---|---|---|
| `DEFAULTS.fireMaxActive` | 48 | 128 |
| Performance profile | 24 | 32 |
| Balanced profile | 48 | 128 |
| Quality profile | 64 | 256 |

The default of 128 gives visibly larger fires without significant perf impact. Quality 256 is for high-end hardware — on the development Quadro P1000, Quality fires may be heavy (see Performance section).

### Change 4: Raise `fire-max-active-slider` UI ceiling

```html
<!-- Before -->
<input type="range" id="fire-max-active-slider" min="8" max="64" step="4" />

<!-- After -->
<input type="range" id="fire-max-active-slider" min="8" max="512" step="8" />
```

Step changes from 4 to 8 for ergonomic slider movement over the wider range.

### Change 5: Fix stale DEFAULTS comment

```js
// Before
fireMaxActive: 128,  // global active-fire cap (<= per-chunk model cap 64, so all render)

// After
fireMaxActive: 128,  // global active-fire cap; also used as per-chunk model cap (see addFireModel / renderChunk)
```

### Change 6: Bump VOXEX_BUILD and VOXEX_RECENT_CHANGES

---

## What Does NOT Change

- `SETTINGS.fireSpreadBudget` — rate cap already user-configurable (range 1–16)
- `MAX_POINT_LIGHTS = 8` — GPU point-light pool cap is a hardware constraint; fires already share this pool with torches
- `SETTINGS.fireMaxEmittersPerFrame` — particle cap unrelated to block count
- `fireSystem.cells` simulation logic — no structural changes
- `createWorldFire()` — no changes to model construction
- All other fire settings (`fireMaxAge`, `fireDPS`, `fireAnimationFps`, etc.)

---

## Performance Considerations

Each fire model is one THREE.Group with several PlaneGeometry quads (~8 geometries per block). At 256 fires:
- ~2048 extra draw calls per frame before batching. Fire uses shared materials, reducing state changes, but each Group is still a separate draw.
- Particle budget: `fireMaxEmittersPerFrame` (default 24) already caps emit calls — not affected.
- Point lights: capped at 8 regardless — no impact.

The default raise (48→128) is conservative. Quality (256) is for capable GPUs. The UI max of 512 is available for experimentation. The label in the settings panel should remain descriptive ("Max Active Fires") — no new label needed.

---

## Edge Cases

**Chunk load with more saved fires than current cap:** If a world was saved with e.g. 200 fire blocks in one chunk but `fireMaxActive` is now 32, `renderChunk`'s `break fireLoop` will stop model creation and registration at 32. The remaining fire blocks exist in `chunk.blocks` (written to the save) but are treated as unregistered. They will slowly burn out via aging only when the chunk is loaded and the fire scan loop hits them. This is acceptable — it is the same behavior as the original capped system, just with a user-controllable threshold.

**`spreadFire` ignoring `addFireModel` return value:** Safe under this design. The global spread check `cells.size < SETTINGS.fireMaxActive` prevents `spreadFire()` from being called when the global (= per-chunk) cap is reached. Cannot produce invisible spread fires.

---

## Safety Checks

- [x] Confirmed two and only two per-chunk cap instances: `addFireModel` (line 40375) and `renderChunk` (line 41830)
- [x] Confirmed line 3995 is a RECENT_CHANGES entry — not a code reference needing update
- [x] Line 29079 reset key list: `fireMaxActive` already present — no new key added (no new setting)
- [x] No new globals, no shadowed identifiers
- [x] No new DOM IDs needed (only changing existing slider's `max` attribute)
- [x] Profile invariant: new profile values satisfy `Performance(32) ≤ Balanced(128) ≤ Quality(256)` with per-chunk cap = global cap at all levels — no invisible fire risk
- [x] 283/283 tests green after implementation

---

## Files Changed

- `voxEx.html`:
  - HTML (~line 3634): raise slider `max="64"` → `max="512"`, `step="4"` → `step="8"`
  - DEFAULTS (~line 6286): raise `fireMaxActive` default 48 → 128, fix comment
  - SETTINGS_PROFILES (~lines 6502/6533/6564): update Performance/Balanced/Quality values
  - `addFireModel()` (~line 40375): `>= 64` → `>= SETTINGS.fireMaxActive`
  - `renderChunk` fire loop (~line 41830): `const MAX_FIRES_PER_CHUNK = 64` → `= SETTINGS.fireMaxActive`
  - `VOXEX_BUILD` and `VOXEX_RECENT_CHANGES`: bump build, add changelog entry

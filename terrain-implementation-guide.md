> **Status: SHIPPED — implementation record of the terrainSurface rewrite** _(marked 2026-07-06; see CLAUDE.md Documentation Index)_

# VoxEx — New Terrain: Implementation Guide (handoff)

This is a **do-this, step-by-step** guide to implement the climate/spline terrain system in `voxEx.html`. It is self-contained: follow the steps in order, paste the code exactly, and run the test suite after each checkpoint. Design rationale lives in `terrain-architecture-plan.md` (read §0–§4 there if you want the "why"); you do **not** need it to execute this guide.

**Scope:** the flag-gated core rebuild — parameter fields, spline terrain shape, multi-noise biome selection, and the climate snow line. **OUT OF SCOPE (do not implement):** the physical/thermal erosion post-pass, flow-based rivers, ores, new biomes (tundra/desert), 3-D density. Leave those alone.

---

## Golden rules (read once, obey throughout)

1. **Single file.** All code goes in `voxEx.html`. No new files, no external deps.
2. **Everything is additive and behind a flag.** You are **adding** the new system next to the old one, gated by `worldConfig.useNewTerrain`. **Do not delete** any existing function in this guide — the old path must still work when the flag is off. (Deletion/consolidation is a later phase.)
3. **Worker parity is mandatory.** Terrain generation runs in a Web Worker (`generateTerrainViaWorker`). New functions must be injected into the worker (Step 7) or the worker will throw / produce different terrain than the main thread (visible as cliffs at chunk borders).
4. **Determinism.** Every new function must be a pure function of `(gx, gz)` + `worldConfig.seed`. No `Math.random()`, no time, no global mutable state.
5. **New helpers must be `function` declarations, never `const x = () => …`.** The worker injects them via `Function.toString()`, which only works for named declarations (arrow-consts inject as anonymous and break). This is why the code below uses `function name(...)`.
6. **Line numbers drift.** Every "line ~N" is an *approximate* anchor. Locate code by the quoted **search string**, not the number.
7. **Test after every checkpoint.** Serve the folder over localhost and open `tools/voxex-tests.html` (needs localhost for Workers + IndexedDB). All tests must stay green. If a checkpoint breaks tests, fix it before continuing.

---

## Step 0 — Verify baseline

Serve over localhost, open `tools/voxex-tests.html`, confirm all ~204 tests pass **before** you change anything. If they don't, stop and report — you need a green baseline.

---

## Step 1 — Add the feature flag

**1a.** Find the `WORLD_CONFIG` object (search: `const WORLD_CONFIG`). Add a default field near the other generation flags:

```js
useNewTerrain: true,   // NEW TERRAIN master switch (set false to A/B against the old system)
terrainAmplitudeMultiplier: 1.0,   // used by the new shape (Step 11 wires the create-world slider)
```

**1b.** Find the `worldConfig` object with live getters (search: `get biomeSizeMultiplier() { return WORLD_CONFIG`). Add two getters inside it, next to the others:

```js
get useNewTerrain() { return WORLD_CONFIG.useNewTerrain === true; },
get terrainAmplitudeMultiplier() { return WORLD_CONFIG.terrainAmplitudeMultiplier ?? 1.0; },
```

**1c.** Bump the terrain cache version so stale cached chunks regenerate under the new algorithm. Search: `const TERRAIN_GEN_VERSION =`. Increment the number by 1 and update its comment:

```js
const TERRAIN_GEN_VERSION = 5; // bumped for new climate/spline terrain (was 4)
```

*(Worker bake for the flag is done in Step 7.)*

**Checkpoint:** the game should still load and behave exactly as before (the flag is defined but nothing reads it yet). Tests green.

---

## Step 2 — Add all new pure functions

Find `function continentalHeight(gx, gz, seed) {` (search: `function continentalHeight`). Paste this **entire block immediately above it** (so these definitions sit next to the other terrain functions). It is one contiguous block of `function`/`const` declarations.

```js
// ============================================================
// NEW TERRAIN (climate + spline). Flag: worldConfig.useNewTerrain.
// All pure functions of (gx, gz) + worldConfig.seed. See terrain-architecture-plan.md.
// ============================================================

// --- calibration + helpers ---
const FIELD_GAIN   = 3.0;   // stretches VoxEx's narrow fbm (~±0.3) toward −1..1. TUNE in visualizer.
const DETAIL_MAX   = 12;    // max blocks of fine relief on a full mountain (retuned from 18)
const MAX_SURFACE_Y = 285;  // safety clamp (matches old mountainsHeightFunc ceiling); hit RARELY
const SPLINE_CONTINENTAL = [[-1.0,-45],[-0.45,-20],[-0.2,-4],[0.0,3],[0.3,8],[0.6,16],[1.0,28]];
// Retuned (was max 180, then deep-valley -24): shorter peaks + RAISED valley floor so mountains are
// broad elevated massifs, not spires over lowland slots. Fixes the "interior notch" test (mountain
// regions stay above the <78 floor) and the "too tall for width" look. Internal relief ≈ ~95 blocks.
const SPLINE_PEAKS       = [[-1.0,28],[-0.4,34],[0.0,42],[0.4,64],[0.8,100],[1.0,135]];
const SPLINE_EROSION     = [[-1.0,1.0],[-0.4,0.85],[0.0,0.55],[0.4,0.25],[1.0,0.05]];

function normField(v) { return Math.max(-1, Math.min(1, v * FIELD_GAIN)); }
function sq(x) { return x * x; }
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
function paramFreq(base) { return base / (worldConfig.biomeSizeMultiplier || 1); }
function spline(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i][0]) {
            const x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
            const t = (x - x0) / (x1 - x0);
            return y0 + (y1 - y0) * (t * t * (3 - 2 * t));
        }
    }
    return pts[pts.length - 1][1];
}

// --- climate / shape parameter fields (all normalized) ---
function continentalness(gx, gz) { return continentalHeight(gx, gz, worldConfig.seed); }
function erosionParam(gx, gz) {
    const s = worldConfig.seed;
    return normField(fbm2D(gx * paramFreq(0.0011) + s * 4.1, gz * paramFreq(0.0011) - s * 2.7, 3, 0.5, 2.0));
}
function weirdness(gx, gz) {
    // Freq 0.0018 (was 0.004): the peaksValleys fold turns this into ridge spacing, so a lower
    // frequency = WIDER mountains. 0.004 made peaks too narrow/steep for their height.
    const s = worldConfig.seed;
    return normField(fbm2D(gx * paramFreq(0.0018) - s * 1.3, gz * paramFreq(0.0018) + s * 3.9, 4, 0.5, 2.0));
}
function peaksValleys(gx, gz) {
    const w = weirdness(gx, gz);
    return 1 - Math.abs(3 * Math.abs(w) - 2);   // −1 (valley) .. +1 (peak)
}
function temperature(gx, gz) {
    const s = worldConfig.seed;
    const t = (normField(fbm2D(gx * paramFreq(0.0009) + s * 1.7, gz * paramFreq(0.0009) - s * 0.9, 3, 0.5, 2.0)) + 1) * 0.5;
    return Math.max(0, Math.min(1, t));
}
function humidity(gx, gz) {
    const s = worldConfig.seed;
    const h = (normField(fbm2D(gx * paramFreq(0.0011) - s * 2.3, gz * paramFreq(0.0011) + s * 1.1, 3, 0.5, 2.0)) + 1) * 0.5;
    return Math.max(0, Math.min(1, h));
}

// --- detail styles (0..1 each) ---
function ridgedMultifractal(gx, gz) {
    const s = worldConfig.seed;
    const wx = gx + noise2D(gx * 0.0015 + s, gz * 0.0015) * 60;         // domain warp → winding ridges
    const wz = gz + noise2D(gx * 0.0015 + 100, gz * 0.0015 + s) * 60;
    let sum = 0, amp = 1, freq = 0.01, prev = 1, norm = 0;
    for (let i = 0; i < 5; i++) {
        let n = 1 - Math.abs(noise2D(wx * freq + s * 10, wz * freq - s * 10));
        n = n * n;                                   // sharpen ridge
        n = n * Math.min(1, Math.max(0, prev));      // multifractal: detail only where structure exists
        sum += n * amp; norm += amp; prev = n;
        amp *= 0.5; freq *= 2.0;
    }
    return sum / norm;
}
function billowNoise(gx, gz) {
    const s = worldConfig.seed;
    let sum = 0, amp = 1, freq = 0.02, norm = 0;
    for (let i = 0; i < 3; i++) {
        sum += Math.abs(noise2D(gx * freq + s * 3, gz * freq - s * 3)) * amp;
        norm += amp; amp *= 0.5; freq *= 2.0;
    }
    return sum / norm;
}

// --- terrain shape (global, continuous, NO biome input) ---
function terrainBaseHeight(gx, gz) {
    const C = continentalness(gx, gz);
    const E = erosionParam(gx, gz);
    const PV = peaksValleys(gx, gz);
    const reliefScale = spline(SPLINE_EROSION, E);
    const ampMult = worldConfig.terrainAmplitudeMultiplier ?? 1.0;
    const h = WORLD_DIMS.seaLevel + spline(SPLINE_CONTINENTAL, C)
                                  + spline(SPLINE_PEAKS, PV) * reliefScale * ampMult;
    return { h: h, PV: PV, reliefScale: reliefScale, ampMult: ampMult };
}
function terrainDetail(gx, gz, PV, reliefScale, ampMult) {
    const amp = reliefScale * DETAIL_MAX * ampMult;
    if (amp < 0.5) return 0;                                  // flat: no detail (and skip ridged cost)
    const ridgeWeight = smoothstep(0.2, 0.7, PV) * reliefScale;
    const billowy = billowNoise(gx, gz);
    if (ridgeWeight < 0.02) return billowy * amp;             // no ridge: skip expensive ridged
    const ridged = ridgedMultifractal(gx, gz);
    return lerpValue(billowy, ridged, ridgeWeight) * amp;
}
function computeSurfaceHeight(gx, gz) {
    const b = terrainBaseHeight(gx, gz);
    const y = b.h + terrainDetail(gx, gz, b.PV, b.reliefScale, b.ampMult);
    return Math.min(MAX_SURFACE_Y, Math.max(1, Math.floor(y)));
}

// --- multi-noise biome selection (cosmetic only; never affects height) ---
const BIOME_PARAMS = {
    //            T      H      C      E      PV
    plains:    { t: 0.1,  h:-0.1, c: 0.3, e: 0.6, pv:-0.2, weight: 2 },
    forests:   { t: 0.0,  h: 0.4, c: 0.4, e: 0.3, pv: 0.0, weight: 2 },
    hills:     { t: 0.0,  h: 0.0, c: 0.4, e:-0.1, pv: 0.4, weight: 2 },
    swamp:     { t: 0.5,  h: 0.8, c: 0.1, e: 0.8, pv:-0.6, weight: 1 },
    longwoods: { t: 0.2,  h: 0.6, c: 0.4, e: 0.4, pv: 0.1, weight: 2 },
    mountains: { t:-0.3,  h:-0.1, c: 0.6, e:-0.8, pv: 0.7, weight: 1 }
};
const AXIS_W = { t: 1.0, h: 1.0, c: 0.6, e: 1.2, pv: 0.9 };
function resolveBiome(gx, gz) {
    const forced = worldConfig.forceSingleBiome;
    if (forced) { const fb = biomeByName.get(forced); if (fb) return fb; }
    const T = temperature(gx, gz) * 2 - 1, H = humidity(gx, gz) * 2 - 1;
    const C = continentalness(gx, gz), E = erosionParam(gx, gz), PV = peaksValleys(gx, gz);
    let best = null, bestD = Infinity;
    for (const name in BIOME_PARAMS) {
        const b = BIOME_PARAMS[name];
        let d = AXIS_W.t * sq(T - b.t) + AXIS_W.h * sq(H - b.h) + AXIS_W.c * sq(C - b.c)
              + AXIS_W.e * sq(E - b.e) + AXIS_W.pv * sq(PV - b.pv);
        d /= (b.weight || 1);
        if (d < bestD) { bestD = d; best = name; }
    }
    return biomeByName.get(best) || biomeByName.get('plains');
}
```

**Checkpoint:** game still loads (nothing calls the new functions yet). Tests green. If you get a "duplicate declaration" or "already defined" error, a name collided — report which one; do not rename silently.

---

## Step 3 — Wire the flag into `blendedHeight`

Find `function blendedHeight(gx, gz, seed) {` (search: `function blendedHeight`). Two surgical edits:

**3a.** Replace the first line of its body:
```js
let finalHeight = sampleBiomeBilinearHeight(gx, gz, seed);
```
with:
```js
let finalHeight = worldConfig.useNewTerrain
    ? computeSurfaceHeight(gx, gz)
    : sampleBiomeBilinearHeight(gx, gz, seed);
```

**3b.** A few lines below, find the post-jagged block that starts:
```js
if (finalHeight > 90) {
```
Change that condition to skip in the new path (the new shape already has its own detail):
```js
if (!worldConfig.useNewTerrain && finalHeight > 90) {
```

Leave everything after that (ocean carve, river carve, `return Math.floor(finalHeight);`) **unchanged** — the new terrain uses the same ocean/river carving.

---

## Step 4 — Wire the flag into `getPreRiverHeight`

Find `function getPreRiverHeight(gx, gz, seed) {`. Replace its first body line:
```js
let finalHeight = sampleBiomeBilinearHeight(gx, gz, seed);
```
with:
```js
let finalHeight = worldConfig.useNewTerrain
    ? computeSurfaceHeight(gx, gz)
    : sampleBiomeBilinearHeight(gx, gz, seed);
```
Leave the rest (ocean carve, `return finalHeight;`) unchanged.

---

## Step 5 — Wire the flag into `getBiomeParams`

Find `function getBiomeParams(gx, gz) {`. Insert one line as the very first statement of the body:
```js
if (worldConfig.useNewTerrain) return resolveBiome(gx, gz);
```
Leave the rest of the old body below it unchanged.

**Checkpoint (main thread only):** In the browser console, `SETTINGS`/game already loaded — create a **new** world. With `useNewTerrain: true` you should now see the new terrain **on the main-thread preview and any main-thread-generated chunks**, but worker-generated chunks will still be OLD (Step 7 fixes that) → expect cliffs at chunk borders for now. Do not ship this state; continue to Step 7. Run tests — main-thread terrain tests may change values; worker byte-parity tests will FAIL until Step 7. That's expected between Steps 5 and 7.

---

## Step 6 — (reserved) confirm helper availability

No action. Just confirm `lerpValue` exists (search: `const lerpValue`) — the new functions use it and it's already injected into the worker. It is.

---

## Step 7 — Worker injection (makes worker match main thread)

Find `function buildChunkWorkerCode() {` and the `const terrainFuncs = [` array inside it.

**7a.** Add the new functions to the `terrainFuncs` array (append before the closing `]`, keeping the existing entries):
```js
                    // --- NEW TERRAIN (flag-gated) ---
                    normField, sq, smoothstep, paramFreq, spline,
                    continentalness, erosionParam, weirdness, peaksValleys, temperature, humidity,
                    ridgedMultifractal, billowNoise,
                    terrainBaseHeight, terrainDetail, computeSurfaceHeight,
                    resolveBiome
```
(`continentalness` calls `continentalHeight`, `resolveBiome` uses `biomeByName` — both are already injected/available.)

**7b.** Bake the new constants into the worker. Find the block that bakes `MOUNTAIN_REGION_FREQ`/`MOUNTAIN_REGION_THRESHOLD` (search: `injectedCode += '    const MOUNTAIN_REGION_THRESHOLD =`). Immediately after those two lines, add:
```js
                injectedCode += '    const FIELD_GAIN = ' + JSON.stringify(FIELD_GAIN) + ';\n';
                injectedCode += '    const DETAIL_MAX = ' + JSON.stringify(DETAIL_MAX) + ';\n';
                injectedCode += '    const MAX_SURFACE_Y = ' + JSON.stringify(MAX_SURFACE_Y) + ';\n';
                injectedCode += '    const SPLINE_CONTINENTAL = ' + JSON.stringify(SPLINE_CONTINENTAL) + ';\n';
                injectedCode += '    const SPLINE_PEAKS = ' + JSON.stringify(SPLINE_PEAKS) + ';\n';
                injectedCode += '    const SPLINE_EROSION = ' + JSON.stringify(SPLINE_EROSION) + ';\n';
                injectedCode += '    const BIOME_PARAMS = ' + JSON.stringify(BIOME_PARAMS) + ';\n';
                injectedCode += '    const AXIS_W = ' + JSON.stringify(AXIS_W) + ';\n\n';
```
These MUST come before the function-injection loop (`for (const fn of terrainFuncs)`) — the block above already runs before it, so you're fine.

**7c.** Bake the flag into the worker's `worldConfig`. Find the baked worldConfig string (search: `const worldConfig = { get seed() { return workerNumericSeed; }`). Add two fields inside that string, alongside `enableRivers` / `forceSingleBiome`:
```js
                    + ', useNewTerrain: ' + JSON.stringify(worldConfig.useNewTerrain)
                    + ', terrainAmplitudeMultiplier: ' + JSON.stringify(worldConfig.terrainAmplitudeMultiplier)
```

**Checkpoint:** Regenerate a world. Main-thread and worker chunks should now agree — **no cliffs at chunk borders**. Open `tools/voxex-tests.html`: the worker `blendedHeight` byte-parity and determinism tests must be **green** again. If they fail, main and worker are computing different heights — re-check 7a/7b/7c (a missing baked const or un-injected function is the usual cause).

---

## Step 8 — Expose new functions to the test harness

Find the `window.VoxEx` test-seam exposure object (search: `getBiomeCellDirect, getBiomeParams,` near the `--- terrain / biome ---` comment, ~line 46455). Add the new functions to that object literal so tests can call them:
```js
                    // --- new terrain (flag-gated) ---
                    continentalness, erosionParam, weirdness, peaksValleys, temperature, humidity,
                    terrainBaseHeight, computeSurfaceHeight, resolveBiome, spline, normField,
```
(Leave the existing entries; this is additive.)

**Checkpoint:** tests green (nothing references these yet, but they must resolve — a typo here throws at load).

---

## Step 9 — Climate snow line (separable; do after Steps 1–8 validate)

This makes the snow/rock elevation bands shift with temperature. It touches `precalculateTerrainCaches` (two copies) and `generateTerrainPass`.

**9a. Add a temperature cache — MAIN copy.** Find `function precalculateTerrainCaches(chunkSize, startX, startZ, seed) {` near line ~38917 (the one whose body has `heightCache[idx] = blendedHeight(gx, gz, seed);`). Make the cache **null when the flag is off** — that null is how the surface pass will know which path built the caches, so no other plumbing is needed:
- After `const widthNoiseCache = new Float32Array(chunkSize * chunkSize);` add:
  ```js
  const tempCache = worldConfig.useNewTerrain ? new Float32Array(chunkSize * chunkSize) : null;
  ```
- Inside the loop, after `widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);` add:
  ```js
  if (tempCache) tempCache[idx] = temperature(gx, gz);
  ```
- Change the return to include it: `return { heightCache, riverCache, biomeCache, widthNoiseCache, tempCache };`

**9b. Add the temperature cache — WORKER copy.** There is a SECOND `function precalculateTerrainCaches` inside the worker template (search again; the other match, near line ~19081, is a hand-written copy). Apply the **exact same three edits** as 9a to it. (This copy reads the baked `worldConfig.useNewTerrain` from Step 7c, so `tempCache` will be non-null in the worker exactly when it is on the main thread.)

**9c. Consume it in the surface pass.** Find `function generateTerrainPass(...)`. Near its top, find the band constants:
```js
const SNOW_LINE = 190;
const SNOW_PATCHES_LINE = 160;
const HIGH_ROCK_LINE = 140;
const ROCK_LINE = 110;
const ALPINE_LINE = 85;
```
Change each `const` on those five lines to `let`. Then, **inside the `for (let lx …)` / `for (let lz …)` loops**, right after `const biome = biomeCache[idx];` (search: `const biome = biomeCache[idx];`), insert:
```js
// NEW TERRAIN: shift the whole snow/rock ladder by local temperature (climate + elevation lapse).
// caches.tempCache is non-null ONLY when the new terrain built these caches (see 9a).
if (caches.tempCache) {
    const climT = caches.tempCache[idx];
    const localT = climT - Math.max(0, worldTopY - WORLD_DIMS.seaLevel) / 220;
    // (localT - 0.5): cold/high localT is LOW -> NEGATIVE shift -> snow line DROPS -> peaks get snow.
    // Do NOT write (0.5 - localT) — that sign is inverted and leaves tall peaks bare.
    const bandShift = Math.round((localT - 0.5) * 80);
    SNOW_LINE         = 190 + bandShift;
    SNOW_PATCHES_LINE = 160 + bandShift;
    HIGH_ROCK_LINE    = 140 + bandShift;
    ROCK_LINE         = 110 + bandShift;
    ALPINE_LINE       =  85 + bandShift;
}
```

**Checkpoint:** New worlds show snow lower in cold regions / higher in warm regions; no inverted bands (snow never appears below the rock zone). Worker parity + determinism tests green. If snow bands look wrong at chunk borders, the worker `precalculateTerrainCaches` copy (9b) wasn't updated to match.

---

## Step 10 — Full-suite verification

Serve over localhost, open `tools/voxex-tests.html`, confirm **all** tests green. Then in-game, with `useNewTerrain: true`:
- Fly around: terrain is continuous (no per-chunk cliffs), mountains reach roughly today's heights (~250–280 peaks, rarely flat-topped), plains are gentle, biomes form coherent regions.
- Toggle `WORLD_CONFIG.useNewTerrain = false`, regenerate: you get the OLD terrain back (proves the flag cleanly gates both paths).

If all green and both paths work, the core is done. Steps 11–12 are optional polish / later phases.

---

## Step 11 — (optional, later) Rewire create-world controls

These make the world-creation UI affect the new terrain. Do only after Step 10 is solid.

- **Terrain Amplitude slider.** It currently scales `config.amplitude` (search: `config.amplitude = original.amplitude * ampMult;`). The new shape reads `worldConfig.terrainAmplitudeMultiplier` (already wired into `terrainBaseHeight`/`terrainDetail` and baked into the worker in Step 7c) — so once `WORLD_CONFIG.terrainAmplitudeMultiplier` is set from the slider (search where `terrainAmplitudeMultiplier` is assigned, ~line 21669) it will work. Verify a "Flat" preset (amplitude 0) produces flat land under the new flag.
- **Force single biome.** `resolveBiome` already honors `worldConfig.forceSingleBiome` (returns that biome's *skin*). But because shape is decoupled, forcing "mountains" gives mountain skin on normal-shaped terrain, **not** mountainous terrain. To make the terrain follow too, when a biome is forced, also pin the shape params to that biome's `BIOME_PARAMS` target. This is a design decision (see plan §8.8 #2) — implement only if that behavior is wanted.

---

## Step 12 — (later phase, DO NOT DO NOW) Consolidation

Once the new path is validated and made default, a later task removes the old path (bilinear blend, `HEIGHT_FUNCS`, per-biome height funcs, `_BIOME_CDF_TABLE`, `isMountainRegion`, foothills, and their worker emits + test-harness entries) per `terrain-architecture-plan.md` §8.2. **Do not do this now** — keeping both paths behind the flag is the whole safety mechanism.

---

## Quick reference — new symbols added

Functions: `normField, sq, smoothstep, paramFreq, spline, continentalness, erosionParam, weirdness, peaksValleys, temperature, humidity, ridgedMultifractal, billowNoise, terrainBaseHeight, terrainDetail, computeSurfaceHeight, resolveBiome`.
Constants: `FIELD_GAIN, DETAIL_MAX, MAX_SURFACE_Y, SPLINE_CONTINENTAL, SPLINE_PEAKS, SPLINE_EROSION, BIOME_PARAMS, AXIS_W`.
Config: `worldConfig.useNewTerrain`, `worldConfig.terrainAmplitudeMultiplier`.
All were checked collision-free against `voxEx.html`. If any now collides, stop and report — do not rename on your own.

## If something breaks

- **Duplicate/redeclared identifier at load:** a new name collided with existing code. Report the name.
- **Cliffs at chunk borders:** main vs. worker disagree → a Step-7 item is missing (un-injected function, un-baked const, or the flag not baked into worker `worldConfig`).
- **Worker test throws "X is not defined":** a function you added to `terrainFuncs` (Step 7a) references a const you forgot to bake (Step 7b), or references another new function not in the inject list.
- **Terrain looks flat everywhere / one biome everywhere:** `FIELD_GAIN` calibration — the fields aren't spanning −1..1. This is expected to need tuning; adjust `FIELD_GAIN` and the `SPLINE_*` / `BIOME_PARAMS` values (that tuning is the intended follow-up work, best done with a parameter visualizer).
- **Any test red you can't resolve:** revert your last step and report what failed. Never mark done with red tests.

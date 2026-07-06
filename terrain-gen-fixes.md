> **Status: SHIPPED — all 5 phases implemented (July 2026)** _(marked 2026-07-06; see CLAUDE.md Documentation Index)_

# VoxEx Terrain Generation — Fix Implementation Plan

**Date:** 2026-07-02 · **Companion to:** `terrain-gen-audit.md` (same finding IDs) · **Base build:** 2026-07-01.78

This document selects ONE option per audit finding and specifies the implementation. It is written for an implementing agent.

## Rules for the implementer

1. **Apply edits by exact-string match** (Edit tool), never by line offset — line numbers below are from the audited file and WILL drift as fixes land. Every fix quotes the original code verbatim; if an Original block no longer matches, STOP and re-read the region before proceeding.
2. **Single-file rule:** all game code stays in voxEx.html.
3. **Worker parity:** each fix carries a "Worker parity note". Injected functions (listed in `terrainFuncs` ~19577–19605 and the tree list ~19757) propagate automatically via `Function.toString()` — but hand-maintained worker-template copies (marked below) must be edited in both places.
4. **Version bumps (do each ONCE, at the end of its phase):**
   - `TERRAIN_GEN_VERSION` — bump once after Phase 1 lands (worldgen output changes: TER-3/5/6, PAR-7). Grep for it near the top of the module script.
   - `CURRENT_CACHE_VERSION` (and its `_cacheVersion` writes) — bump once after Phase 2 lands (stored lighting changes: TER-1/2/18). The exact location is quoted in the TER-1 spec.
   - `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (top of voxEx.html) — update once per landed phase.
5. **Testing:** after every phase, run `tools/voxex-tests.html` over localhost (~283+ tests, includes worker byte-parity and terrain determinism suites). A phase is not done while any test is red.
6. **Commit hygiene (per CLAUDE.md):** stage only files you touched; verify with `git diff --stat`; never `git add -A`.

## Implementation order (phases)

| Phase | Fixes | Bump | Why this order |
|---|---|---|---|
| 0 | TER-21 | — | Single-sources `precalculateTerrainCaches`; prerequisite for TER-4/7/8/13 (they all edit that loop) |
| 1 | TER-3, TER-5, TER-6, PAR-8, PAR-6, PAR-7 | TERRAIN_GEN_VERSION | Worldgen correctness; one regeneration bump covers all |
| 2 | TER-1+18, TER-2 | CURRENT_CACHE_VERSION | Lighting correctness; one cache bump covers both |
| 3 | TER-4, TER-12, TER-13, PAR-12 | — (output-identical; verify via determinism/parity tests) | Performance; TER-4 rewrites the precalc loop — land before/with TER-7+8 which also edit it (merge carefully) |
| 4 | TER-7+8, TER-20, TER-22, PAR-9, PAR-10, TER-11+PAR-11, TER-14, TER-15, TER-16, TER-17, TER-23 | TERRAIN_GEN_VERSION already bumped in Ph.1 covers TER-7/8's surface-block changes if landed together; otherwise bump again | Border-seam fixes + hygiene + dead-code sweep |
| 5 | PAR-1..5 (visualizer), TER-9/10 + PAR-13 (docs) | — | Tooling & documentation truth pass |

> **Merge warning:** TER-4 (this file), TER-7+8 and TER-13 (specs below) all modify the `precalculateTerrainCaches` loop. Apply TER-21 first, then TER-4's loop rewrite, then layer TER-7+8's `heightPad` and TER-13's `clim` scratch onto the NEW loop body. A combined final loop is given at the end of the TER-4 spec.

---

# Part 1 — Core fixes (coordinator-authored)

## FIX TER-21 — Single-source `precalculateTerrainCaches` into the worker

**Chosen option & rationale:** Option 1 (inject it). The worker copy is line-identical today, and Phases 1/3/4 all change this function — dual maintenance guarantees drift (this is the yOffset-incident bug class).
**Prerequisites / ordering:** Phase 0 — land before every other fix that touches the precalc loop (TER-4, TER-7+8, TER-13).

### Change 1: delete the hand-maintained worker copy (voxEx.html, ~19085–19108)

**Original (delete this entire block):**
```js
    // ============================================================
    // TERRAIN CACHE GENERATION
    // ============================================================
    function precalculateTerrainCaches(chunkSize, startX, startZ, seed) {
        const heightCache = new Int16Array(chunkSize * chunkSize);
        const riverCache = new Float32Array(chunkSize * chunkSize);
        const biomeCache = new Array(chunkSize * chunkSize);
        const widthNoiseCache = new Float32Array(chunkSize * chunkSize);
        const tempCache = worldConfig.useNewTerrain ? new Float32Array(chunkSize * chunkSize) : null;

        for (let lx = 0; lx < chunkSize; lx++) {
            for (let lz = 0; lz < chunkSize; lz++) {
                const idx = lx + lz * chunkSize;
                const gx = startX + lx;
                const gz = startZ + lz;
                heightCache[idx] = blendedHeight(gx, gz, seed);
                riverCache[idx] = getRiverFactor(gx, gz, seed);
                biomeCache[idx] = getBiomeParams(gx, gz);
                widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                if (tempCache) tempCache[idx] = temperature(gx, gz);
            }
        }
        return { heightCache, riverCache, biomeCache, widthNoiseCache, tempCache };
    }
```
**Replace with:**
```js
    // ============================================================
    // TERRAIN CACHE GENERATION
    // precalculateTerrainCaches is INJECTED from the main thread by
    // buildChunkWorkerCode (terrainFuncs list) — no hand copy here.
    // ============================================================
```

### Change 2: add it to the injection list (voxEx.html, ~19600–19605, inside `buildChunkWorkerCode`)

**Original:**
```js
                    // --- NEW TERRAIN (flag-gated) ---
                    normField, sq, smoothstep, paramFreq, spline,
                    continentalness, erosionParam, weirdness, peaksValleys, temperature, humidity,
                    terrainSurface, computeSurfaceHeight,
                    resolveBiome
                ];
```
**Replace with:**
```js
                    // --- NEW TERRAIN (flag-gated) ---
                    normField, sq, smoothstep, paramFreq, spline,
                    continentalness, erosionParam, weirdness, peaksValleys, temperature, humidity,
                    terrainSurface, computeSurfaceHeight,
                    resolveBiome,
                    // --- terrain cache builder (TER-21: was a hand copy in the worker template) ---
                    precalculateTerrainCaches
                ];
```

### Worker parity note
Free variables of the main-thread `precalculateTerrainCaches` (~39126) — `blendedHeight`, `getRiverFactor`, `getBiomeParams`, `noise2D`, `temperature`, `worldConfig`, `Int16Array`/`Float32Array`/`Array` — are ALL already available in worker scope (injected functions, baked `worldConfig`, JS globals). Verified during the audit. Function declarations hoist within the worker module scope, so injection position vs. the worker's call site does not matter.

### Verification
Run tools/voxex-tests.html: the Tier-4 worker byte-parity and chunk round-trip suites must stay green. Also grep the BUILT worker code (in devtools: dump `buildChunkWorkerCode()` output) for exactly ONE `function precalculateTerrainCaches`.

Also add `precalculateTerrainCaches` to the CLAUDE.md hand-maintained-copies checklist as now-injected (see docs pass, PAR-13).

---

## FIX TER-4 — Eliminate the 3× per-column surface evaluation

**Chosen option & rationale:** Option 1/3 hybrid — split `blendedHeight` into `computePreRiverHeight` (surface + POST_JAGGED + ocean) and `applyRiverCarve` (river carve), give `getRiverFactor` an optional `preHeight` parameter, and have the precalc loop evaluate the surface field exactly once per column. Cuts ~3 surface evals + 2 river evals per column to 1 + 1. `blendedHeight(gx, gz, seed)` keeps its exact signature so all other callers (tree code, preview, tests, seam) are untouched.
**Output identity:** byte-identical by construction under `useNewTerrain` (same operations, same order). Under the legacy path, the only difference is that `getRiverFactor` now sees a `terrainHeight` that includes POST_JAGGED for legacy heights > 90 — in that regime `heightPenalty = 1`, `effectiveWidth ≤ 0.0084 < 0.01`, so `getRiverFactor` returns 1.0 either way (verified against the code below). **No TERRAIN_GEN_VERSION bump needed for this fix alone.** The determinism + worker-parity tests are the proof gate.
**Prerequisites / ordering:** TER-21 first. Coordinate with TER-7+8 and TER-13 (same loop; combined loop at the end).

### Change 1: split `blendedHeight` (voxEx.html, ~38070–38155)

**Original (the current function, quoted in full):**
```js
            function blendedHeight(gx, gz, seed) {
                let finalHeight = worldConfig.useNewTerrain
                    ? computeSurfaceHeight(gx, gz)
                    : sampleBiomeBilinearHeight(gx, gz, seed);

                // Peak preservation removed: Math.max(h00..h11) stepped when the warp
                // slid the bilinear cell window across an integer in (u,v), causing
                // ~17-block jumps when the threshold gate flipped.

                // Post-blend jagged detail - applied AFTER biome interpolation to preserve sharpness
                // Gated by finalHeight (C0-continuous post-bilinear), not avgCornerHeight
                // which jumps when the cell window slides.
                if (!worldConfig.useNewTerrain && finalHeight > 90) {
                    // Weight based on how mountainous the terrain is (0 at 90, 1 at 150+)
                    const mountainWeight = Math.min(1.0, (finalHeight - 90) / 60);
                    const postJaggedFreq = 0.1;
                    const pj1 = 1.0 - Math.abs(noise2D(gx * postJaggedFreq + seed * 50, gz * postJaggedFreq - seed * 50));
                    const pj2 = 1.0 - Math.abs(noise2D(gx * postJaggedFreq * 2.1 - seed * 35, gz * postJaggedFreq * 2.1 + seed * 25));
                    // Direct block values for sharp, visible peaks. VOXEX-CCR-TERRAIN-002: this
                    // high-frequency (freq 0.1) jaggedness is the dominant contributor to mountain
                    // mean-step (and the visible choppiness). The isotropic gradient steepened it on
                    // the formerly-gentle axis, so scale it 0.65 to bring mountain mean-step under the
                    // old-X ceiling (works with the 0.90 relief scale in mountainsHeightFunc).
                    const POST_JAGGED_SCALE = 0.40; // VOXEX-CCR-TERRAIN-003: 0.65 -> 0.40 (further smooth the high-freq mountain chop)
                    const postJagged = (Math.pow(pj1, 1.5) * 8 + Math.pow(pj2, 1.8) * 5) * mountainWeight * POST_JAGGED_SCALE;
                    finalHeight += postJagged;
                }

                // 4. Apply oceans first (larger scale feature)
                const oceanFactor = getOceanFactor(gx, gz, seed);
                if (oceanFactor < 1.0) {
                    const oceanDepth = getOceanDepth(oceanFactor, gx, gz, seed);
                    const oceanFloor = WORLD_DIMS.seaLevel - oceanDepth;
                    const bank = oceanFactor * oceanFactor * (3 - 2 * oceanFactor);
                    finalHeight = lerpValue(oceanFloor, finalHeight, bank);
                }

                // 5. Apply rivers with delta support. When Rivers are disabled in the
                //    create-world settings, neutralise both factors (1.0 = no water) so the
                //    height carve is skipped entirely — the preview and the generated world
                //    then show no river channels, not just no water fill.
                const riversOn = worldConfig.enableRivers !== false;
                const r = riversOn ? getRiverFactor(gx, gz, seed) : 1.0;
                const deltaFinger = riversOn ? getDeltaFingerFactor(gx, gz, seed, oceanFactor) : 1.0;

                // River carving: either main river channel OR delta finger channels near ocean
                const inRiver = r < 1.0;
                const inDeltaFinger = deltaFinger < 1.0 && r < 0.95;

                if (inRiver || inDeltaFinger) {
                    const waterFactor = inDeltaFinger ? Math.min(r, deltaFinger) : r;

                    const riverDepth = getRiverDepth(waterFactor, gx, gz, seed, oceanFactor);
                    const riverBed = WORLD_DIMS.seaLevel - riverDepth;
                    const bank0 = waterFactor * waterFactor * (3 - 2 * waterFactor);
                    const bankMid = bank0 * (1 - bank0);   // peaks 0.25 mid-bank, 0 at ends
                    // Perturb the bank HORIZONTALLY so the terraced contour "stripes" wiggle and become
                    // irregular — on the beach AND in the river's influence zone out in the plains. This
                    // breaks the concentric-ring pattern far better than vertical jitter. A little
                    // vertical micro-relief on top. Both fade to 0 at the waterline and at full land.
                    const bank = Math.max(0, Math.min(1, bank0
                        + (noise2D(gx * 0.06 + seed, gz * 0.06 - seed)
                           + 0.5 * noise2D(gx * 0.15 - seed, gz * 0.15 + seed)) * 0.55 * bankMid));
                    const bankJitter = noise2D(gx * 0.13 + seed * 2.3, gz * 0.13 - seed * 1.7) * 4 * bankMid;
                    // Canyon carve: lower the surface to the river bed where terrain
                    // is at or near water level. Above the canyon ceiling threshold
                    // the surface stays as the natural mountain top — the river
                    // continues through as a covered tunnel that generateTerrainPass
                    // punches below. A smooth blend over a 20-block band hides the
                    // canyon→tunnel transition.
                    const CANYON_FULL = 70;   // pure canyon at and below this height
                    const CANYON_NONE = 90;   // pure tunnel above
                    if (finalHeight < CANYON_NONE) {
                        const carvedHeight = Math.min(finalHeight, riverBed);
                        const canyoned = lerpValue(carvedHeight, finalHeight, bank) + bankJitter;
                        if (finalHeight <= CANYON_FULL) {
                            finalHeight = canyoned;
                        } else {
                            const tunnelMix = (finalHeight - CANYON_FULL) / (CANYON_NONE - CANYON_FULL);
                            finalHeight = lerpValue(canyoned, finalHeight, tunnelMix);
                        }
                    }
                }

                return Math.floor(finalHeight);
            }
```

**Replace with (three functions; the POST_JAGGED and river blocks are moved VERBATIM — including their comments — except the two comment rewrites called out in TER-6):**
```js
            /**
             * Pre-river terrain height plus the ocean factor used to compute it.
             * Extracted from blendedHeight so precalculateTerrainCaches can
             * evaluate the expensive surface field exactly once per column (TER-4).
             * @param {number} gx - Global X coordinate
             * @param {number} gz - Global Z coordinate
             * @param {number} seed - World seed
             * @returns {{height: number, oceanFactor: number}} Pre-river height and ocean factor
             */
            function computePreRiverHeight(gx, gz, seed) {
                let finalHeight = worldConfig.useNewTerrain
                    ? computeSurfaceHeight(gx, gz)
                    : sampleBiomeBilinearHeight(gx, gz, seed);

                // Peak preservation removed: Math.max(h00..h11) stepped when the warp
                // slid the bilinear cell window across an integer in (u,v), causing
                // ~17-block jumps when the threshold gate flipped.

                // Post-blend jagged detail - applied AFTER biome interpolation to preserve sharpness
                // Gated by finalHeight (C0-continuous post-bilinear), not avgCornerHeight
                // which jumps when the cell window slides.
                if (!worldConfig.useNewTerrain && finalHeight > 90) {
                    <<< POST_JAGGED block verbatim from the Original above (lines "// Weight based..." through "finalHeight += postJagged;") >>>
                }

                // 4. Apply oceans first (larger scale feature)
                const oceanFactor = getOceanFactor(gx, gz, seed);
                if (oceanFactor < 1.0) {
                    const oceanDepth = getOceanDepth(oceanFactor, gx, gz, seed);
                    const oceanFloor = WORLD_DIMS.seaLevel - oceanDepth;
                    const bank = oceanFactor * oceanFactor * (3 - 2 * oceanFactor);
                    finalHeight = lerpValue(oceanFloor, finalHeight, bank);
                }

                return { height: finalHeight, oceanFactor };
            }

            /**
             * Apply river/delta carving to a pre-river height.
             * @param {number} gx - Global X coordinate
             * @param {number} gz - Global Z coordinate
             * @param {number} seed - World seed
             * @param {number} preHeight - Output of computePreRiverHeight().height
             * @param {number} oceanFactor - Output of computePreRiverHeight().oceanFactor
             * @param {number} [riverFactor] - Precomputed getRiverFactor value (skips recompute)
             * @returns {number} Final floored terrain height
             */
            function applyRiverCarve(gx, gz, seed, preHeight, oceanFactor, riverFactor) {
                let finalHeight = preHeight;

                // 5. Apply rivers with delta support. When Rivers are disabled in the
                //    create-world settings, neutralise both factors (1.0 = no water) so the
                //    height carve is skipped entirely — the preview and the generated world
                //    then show no river channels, not just no water fill.
                const riversOn = worldConfig.enableRivers !== false;
                const r = riversOn
                    ? (riverFactor !== undefined ? riverFactor : getRiverFactor(gx, gz, seed, preHeight))
                    : 1.0;
                const deltaFinger = riversOn ? getDeltaFingerFactor(gx, gz, seed, oceanFactor) : 1.0;

                <<< river-carve block verbatim from the Original above ("// River carving: ..." through the closing brace of the if (inRiver || inDeltaFinger) block), with the TER-6 comment rewrite applied to the "Canyon carve" comment >>>

                return Math.floor(finalHeight);
            }

            /**
             * Blended terrain height (surface + ocean + river carve).
             * Signature unchanged — thin composition wrapper since TER-4.
             * @param {number} gx - Global X coordinate
             * @param {number} gz - Global Z coordinate
             * @param {number} seed - World seed
             * @returns {number} Final floored terrain height
             */
            function blendedHeight(gx, gz, seed) {
                const pre = computePreRiverHeight(gx, gz, seed);
                return applyRiverCarve(gx, gz, seed, pre.height, pre.oceanFactor);
            }
```
(The `<<< ... >>>` placeholders mean: move the quoted Original code verbatim — do not retype it.)

### Change 2: optional `preHeight` parameter on `getRiverFactor` (voxEx.html, ~38666–38677)

**Original:**
```js
            /**
             * River factor with enhanced meandering and terrain awareness.
             * @param {number} gx - Global X coordinate
             * @param {number} gz - Global Z coordinate
             * @param {number} seed - World seed
             * @returns {number} River factor (0 = river center, 1 = not river)
             */
            function getRiverFactor(gx, gz, seed) {
                const warpScale = 0.004;
                const baseWarpStrength = 20.0;

                const terrainHeight = getPreRiverHeight(gx, gz, seed);
```
**Replace with:**
```js
            /**
             * River factor with enhanced meandering and terrain awareness.
             * @param {number} gx - Global X coordinate
             * @param {number} gz - Global Z coordinate
             * @param {number} seed - World seed
             * @param {number} [preHeight] - Precomputed pre-river height (skips a full surface eval)
             * @returns {number} River factor (0 = river center, 1 = not river)
             */
            function getRiverFactor(gx, gz, seed, preHeight) {
                const warpScale = 0.004;
                const baseWarpStrength = 20.0;

                const terrainHeight = preHeight !== undefined ? preHeight : getPreRiverHeight(gx, gz, seed);
```
`getPreRiverHeight` (~38594) is KEPT unchanged — it remains the fallback for callers without a precomputed height (and stays on the test seam).

### Change 3: rewrite the precalc loop (voxEx.html main copy ~39126, now single-source after TER-21)

**Original (loop body):**
```js
                        heightCache[idx] = blendedHeight(gx, gz, seed);
                        riverCache[idx] = getRiverFactor(gx, gz, seed);
                        biomeCache[idx] = getBiomeParams(gx, gz);
                        widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                        if (tempCache) tempCache[idx] = temperature(gx, gz);
```
**Replace with (also hoist `riversOn` above the `lx` loop):**
```js
                        const pre = computePreRiverHeight(gx, gz, seed);
                        const rf = riversOn ? getRiverFactor(gx, gz, seed, pre.height) : 1.0;
                        riverCache[idx] = rf;
                        heightCache[idx] = applyRiverCarve(gx, gz, seed, pre.height, pre.oceanFactor, rf);
                        biomeCache[idx] = getBiomeParams(gx, gz);
                        widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                        if (tempCache) tempCache[idx] = temperature(gx, gz);
```
with, immediately before the `for (let lx ...)` line:
```js
                const riversOn = worldConfig.enableRivers !== false;
```
NOTE: when rivers are disabled, `riverCache` was previously filled with `getRiverFactor` output anyway (the carve ignored it); filling with 1.0 matches what `blendedHeight` effectively used and what downstream consumers (`generateTerrainPass` tunnel gate — deleted in TER-5 — and river checks) expect for "no river". If any other consumer of `riverCache` behaves differently with 1.0 vs the raw factor when rivers are off, grep `riverCache` consumers first (audit found none that differ).

### Change 4: add the two new functions to the injection list (same edit site as TER-21 Change 2)

Append `computePreRiverHeight, applyRiverCarve` to the `terrainFuncs` array (order does not matter — declarations hoist — but place them next to `blendedHeight` for readability).

### Combined final precalc loop (TER-4 + TER-7/8's heightPad + TER-13's clim scratch)

After all Phase-3/4 fixes land, the loop body should read (merge target — reconcile with the TER-7+8 and TER-13 specs in Part 2):
```js
                        const pre = computePreRiverHeight(gx, gz, seed);
                        const rf = riversOn ? getRiverFactor(gx, gz, seed, pre.height) : 1.0;
                        riverCache[idx] = rf;
                        const h = applyRiverCarve(gx, gz, seed, pre.height, pre.oceanFactor, rf);
                        heightCache[idx] = h;
                        heightPad[(lx + 1) + (lz + 1) * pad] = h;          // TER-7+8
                        clim.t = NaN;                                       // TER-13
                        biomeCache[idx] = getBiomeParams(gx, gz, clim);     // TER-13
                        widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                        if (tempCache) tempCache[idx] = Number.isNaN(clim.t) ? temperature(gx, gz) : clim.t; // TER-13
```
(plus TER-7+8's ring pass filling the `heightPad` border via `blendedHeight`).

### Worker parity note
All touched functions are injected (`blendedHeight`, `getRiverFactor` already in the list; `computePreRiverHeight`, `applyRiverCarve` added by Change 4; precalc via TER-21). No hand copies remain.

### Verification
1. tools/voxex-tests.html: terrain determinism + `blendedHeight` worker byte-parity suites green (these prove output identity).
2. Devtools spot-check on a loaded world: `VoxEx.blendedHeight(1234, -567, worldConfig.seed)` before/after the change on the same seed must be equal (record a handful of values pre-change).
3. Perf: `console.time` around `precalculateTerrainCaches` for a fresh chunk — expect roughly 2.5–3× faster; spawn pre-gen wall time should drop measurably (this is the CCR-PERF-013 lever).

---

## FIX TER-5 — Delete the unreachable river-tunnel punch

**Chosen option & rationale:** Option 2 (delete). The `heightPenalty` width fade ends rivers by ~terrain 71–77, so the `worldTopY > 80 && rf < 0.85` gate is dead in practice; the block also re-reads `riverCache` and calls `noise2D` per block. TER-6 makes the "no tunnels" behavior official.
**Prerequisites / ordering:** Phase 1. Land together with TER-6.

### Change 1: delete the tunnel block in `generateTerrainPass` (voxEx.html, ~39499–39530)

**Original (delete all of this):**
```js
                            // River tunnel — where the river noise crosses high
                            // terrain, blendedHeight skipped the canyon carve, so
                            // we punch a covered tube through the mountain:
                            //   stone below tunnelFloor   (river bed)
                            //   water tunnelFloor..seaLevel
                            //   air   seaLevel+1..tunnelCeiling (4-5 blocks)
                            //   stone above tunnelCeiling — the mountain stays
                            // intact above the roof.
                            // Runs before cave carving so caves can intersect the
                            // tunnel but not punch through its ceiling.
                            if (worldTopY > 80 && id !== BEDROCK) {
                                const rf = riverCache[idx];
                                if (rf < 0.85) {
                                    const tunnelDepth = 6;
                                    const tunnelFloor = WORLD_DIMS.seaLevel - tunnelDepth;
                                    const ceilingNoise = noise2D(gx * 0.05 + 7, gz * 0.05 - 13);
                                    const tunnelCeiling = WORLD_DIMS.seaLevel + 4 + Math.round(ceilingNoise);
                                    if (worldY >= tunnelFloor && worldY <= tunnelCeiling) {
                                        // Bank-fade: narrow rivers get a narrower tube
                                        // so the tunnel cross-section follows the river
                                        // width instead of being a uniform rectangle.
                                        const bankT = rf / 0.85;
                                        const bank = bankT * bankT * (3 - 2 * bankT);
                                        const localHeight = tunnelCeiling - tunnelFloor;
                                        const collapsedAmount = Math.floor(bank * localHeight * 0.5);
                                        const effectiveCeiling = tunnelCeiling - collapsedAmount;
                                        if (worldY <= effectiveCeiling) {
                                            id = (worldY <= WORLD_DIMS.seaLevel) ? WATER : AIR;
                                        }
                                    }
                                }
                            }
```
**Replace with:**
```js
                            // River tunnels removed (TER-5): the getRiverFactor height
                            // fade ends rivers below the elevation this gate required,
                            // so the tunnel punch could never fire. Rivers now simply
                            // fade out on elevated terrain (see heightPenalty, TER-6).
```

### Worker parity note
`generateTerrainPass` — confirm its injection status via the Part 2 "injection status report" (Agent A checked all pass functions). If it is injected, one edit suffices; if hand-copied in the worker template, apply the identical deletion there (grep `River tunnel` in the template region ~18700–19570).

### Verification
Grep `tunnelFloor|tunnelCeiling|River tunnel` → only the tombstone remains. Generate a mountain-adjacent world; confirm no floating water/air tubes at Y 54–65 inside hills. Worldgen output changes only in the (rare) marginal columns the tunnel could theoretically touch — covered by the Phase-1 TERRAIN_GEN_VERSION bump.

---

## FIX TER-6 — Kill the dry-river-bed band (retune heightPenalty)

**Chosen option & rationale:** Option 2 (align the fades) with tightened constants: fade rivers out over terrain 60→72 instead of 66→82. Guarantee (verified against `getRiverDepth`): full carve applies at pre-height ≤ `CANYON_FULL` (70) where the bed = `seaLevel − riverDepth` ≤ 58 → floods; rivers cease to exist (effectiveWidth < 0.01) by pre-height ~71; the blend band 70–71 leaves beds ≤ ~58.6 → floods. Inland `riverDepth ≥ 6`; the delta-shallowed minimum `depth ≥ 2` only occurs near oceans where terrain is at sea level anyway. No dry ditches remain, by construction.
**Prerequisites / ordering:** Phase 1, together with TER-5.

### Change 1: heightPenalty in `getRiverFactor` (voxEx.html, ~38721–38736)

**Original:**
```js
                // Terrain penalties disabled — the river noise alone determines
                // the path at every elevation. The old slope + height penalties
                // were "river avoidance" filters that kept rivers out of
                // mountain interiors; that's the exact case we now WANT a
                // river path for (it becomes a tunnel). Canyon vs. tunnel is
                // chosen per-column by blendedHeight + generateTerrainPass.
                const slopePenalty = 0;
                // Rivers hold water only where they carve below sea level, so fade them out on elevated
                // terrain (they were carving dry ditches across hills). Full rivers in the lowlands,
                // gone above ~82. (Was hardcoded 0, which let the ribbon run uphill everywhere.)
                const heightPenalty = smoothstep(66, 82, terrainHeight);
```
**Replace with:**
```js
                // Slope penalty disabled — the river noise alone determines the path.
                const slopePenalty = 0;
                // Rivers hold water only where they carve below sea level, so fade
                // them out on elevated terrain. TER-6: fade 60->72 (was 66->82) so
                // rivers END before the canyon-carve blend (CANYON_FULL=70..+1) can
                // leave a carved bed above sea level — the old 66->82 fade produced
                // dry carved ditches at pre-heights ~75-82. With 60->72:
                //   h<=70 -> full carve, bed = seaLevel - riverDepth(>=6 inland) -> floods
                //   h~71  -> width < 0.01, river gone
                //   blend band 70..71 -> bed <= ~58.6 -> floods
                const heightPenalty = smoothstep(60, 72, terrainHeight);
```

### Change 2: fix the "Canyon carve" comment (inside `applyRiverCarve` after TER-4, or `blendedHeight` if TER-4 not yet applied)

**Original:**
```js
                    // Canyon carve: lower the surface to the river bed where terrain
                    // is at or near water level. Above the canyon ceiling threshold
                    // the surface stays as the natural mountain top — the river
                    // continues through as a covered tunnel that generateTerrainPass
                    // punches below. A smooth blend over a 20-block band hides the
                    // canyon→tunnel transition.
```
**Replace with:**
```js
                    // Canyon carve: lower the surface to the river bed where terrain
                    // is at or near water level. Above CANYON_FULL the carve fades out
                    // over a 20-block band; the river width fade (heightPenalty in
                    // getRiverFactor) ends rivers by ~71, so every carved bed lands
                    // below sea level and floods (no dry ditches, no tunnels — TER-5/6).
```

### Worker parity note
`getRiverFactor` is injected — single edit propagates. `WorldPreviewRenderer` delegates to the real functions (no mirror to update). `tools/terrain-visualizer.html` has no river model at all — addressed wholesale by the PAR-1..5 fix.

### Verification
Generate seeds with rivers crossing hills (pre-heights 60–85): follow several rivers end-to-end — every carved channel must contain water; rivers should visibly narrow and terminate on rising terrain around height ~70, with no dry carved segments beyond. Covered by the Phase-1 TERRAIN_GEN_VERSION bump.

---

## FIX PAR-1..5 — terrain-visualizer.html: delegate to the real game functions

**Chosen option & rationale:** Option 2 (iframe + `?test=1` seam delegation) for all five findings at once. Hand-re-syncing (option 1) is a 5-minute fix that has already failed four separate times (biome config, mountain tuning, ocean thresholds, biome selector); delegation removes the drift class permanently. Cost: the tool now requires localhost (the test suite already does) and boots the game in a hidden iframe (the test suite already does).
**Prerequisites / ordering:** Phase 5 (after all terrain code fixes, so the tool reflects the fixed game).

### Step 1: extend the `window.VoxEx` test seam (voxEx.html, seam object at ~46646)

The seam already exposes everything the visualizer needs for sampling: `blendedHeight`, `getBiomeParams`, `getBiomeCellDirect`, `getOceanFactor`, `getRiverFactor`, `getOceanDepth`, `getRiverDepth`, `mountainsHeightFunc` (+ all height funcs), `computeSurfaceHeight`, `resolveBiome`, `temperature`/`humidity`/`continentalness`/`erosionParam`/`weirdness`/`peaksValleys`, `BIOME_CONFIG`, `HEIGHT_FUNCS`, `WORLD_DIMS`, and (per the TERRAIN-004b changelog) `WORLD_CONFIG`. Two additions are needed (additive, inert without `?test=1`):
1. `seedMainThreadNoise` (defined ~21352) — so the visualizer can re-seed the noise tables per user input. Verify the exact exported name by reading ~21340–21360.
2. Whatever seed-derivation helper the game uses to turn the user's seed string into the numeric seed (grep how the create-world flow produces the numeric seed — the audit noted `rng.next()` at ~21353 / `workerNumericSeed` at ~18973). Export that helper (or a tiny `deriveNumericSeed(str)` wrapper) so the visualizer matches the game's string→number mapping exactly.

### Step 2: rewrite the data layer of tools/terrain-visualizer.html

1. Add a hidden iframe: `<iframe id="game-frame" src="../voxEx.html?test=1" style="display:none"></iframe>` and a readiness poll: wait until `frame.contentWindow.VoxEx` exists (timeout → show the error banner from Step 4).
2. `const VX = document.getElementById('game-frame').contentWindow.VoxEx;`
3. DELETE every local terrain/biome/noise copy in the tool — the stale `BIOME_CONFIG` (line ~82), the biome-selector functions (~89–91), `mountainsHeightFunc` (~98), `getOceanFactor` (~100), `blendedHeight` (~103), the GRAD2D/perm noise implementation (~line 70 region), and any helpers only they used.
4. Route all sampling through the seam: heights via `VX.blendedHeight(gx, gz, seed)`, biome via `VX.getBiomeParams(gx, gz)`, water via `VX.getOceanFactor`/`VX.getRiverFactor`, plus the new-terrain fields (`VX.computeSurfaceHeight`, `VX.resolveBiome`, `VX.temperature`, …) for new inspector readouts. The tool's rendering/UI code (canvas shading, cross-section, column inspector) stays.
5. Seed handling: on seed input change, call `VX.seedMainThreadNoise(VX.deriveNumericSeed(seedString))` (names per Step 1), then re-render.
6. Since the game now defaults to `useNewTerrain: true`, the tool automatically shows the live pipeline; optionally add a checkbox that flips `VX.WORLD_CONFIG.useNewTerrain` for A/B viewing (the seam exposes WORLD_CONFIG; re-render after toggling, and restore the original value on exit).

### Step 3: performance note
The tool samples tens of thousands of columns per render. Cross-iframe calls are same-process and cheap, but batch renders through `requestAnimationFrame` slices as the tool already does. If profiling shows call overhead matters, add a seam-side bulk sampler (`VoxEx.sampleHeightRect(x0, z0, w, h, stride)` returning a typed array) — additive, test-seam-only.

### Step 4: failure banner
If the iframe fails to produce `VoxEx` (file:// protocol, or seam removed): replace the canvas with a clear message — "This tool now uses the live game's terrain functions. Serve the repo over localhost (like tools/voxex-tests.html) and open this page via http://localhost/…".

### Step 5: docs
Update CLAUDE.md's Repository Structure + Testing Tools entries for terrain-visualizer.html: no longer "extracted copies … must be kept in sync"; now "delegates to voxEx.html via the ?test=1 seam (requires localhost); no hand-synced terrain code remains." (Fold into the PAR-13 docs pass.)

### Verification
Same seed in tool and game: spot-check ~5 coordinates — `blendedHeight` values in the tool's column inspector must equal `VoxEx.blendedHeight(...)` in the game's own devtools console exactly; biome readouts must match the debug overlay's biome at those coordinates. Grep the visualizer for `BIOME_CONFIG|GRAD2D|mountainsHeightFunc` → zero local definitions remain.

---

# Part 2 — Terrain-pass & lighting fixes (agent-drafted, coordinator-reviewed)

---

# VoxEx Terrain Fix Specs (TER-12, TER-3, TER-7+8, TER-13, TER-1+18, TER-2, TER-20, TER-22)

**Global ordering:** TER-12 → TER-3 → (TER-21, spec'd elsewhere) → TER-7+8 → TER-13. Lighting: TER-1+18 → TER-2 (one shared `CURRENT_CACHE_VERSION` bump, included in TER-1's spec). TER-20 and TER-22 are order-independent, except TER-20's `calculateBlockLight` comment is folded into TER-1's diff. After all fixes: update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (top of voxEx.html) once, and run `tools/voxex-tests.html` over localhost.

---

## FIX TER-12 — Hoist column-constant breakthrough noise out of the block loop
**Chosen option & rationale:** Audit option 1 — hoist `breakthroughNoise`/`hasBreakthrough` to the per-column section (they depend only on gx,gz). Eliminates up to ~250×256 redundant `noise2D` calls per chunk. (`ceilingNoise` at 39514 is intentionally NOT touched — the whole tunnel block 39499–39530 dies with TER-5.)
**Prerequisites / ordering:** None. Must land BEFORE TER-3 and TER-7+8 (they edit adjacent/derived lines).

### Change 1: `generateTerrainPass` — insert hoisted block after lake detection (voxEx.html, line ~39276)
**Original:**
```js
                        const lakeNoise = noise2D(gx * 0.015 + 500, gz * 0.015 + 500);
                        const isLakeBed = worldTopY > LAKE_ELEVATION_MIN &&
                                         worldTopY < SNOW_PATCHES_LINE &&
                                         maxSlope < 2 && // Flat area
                                         lakeNoise > 0.7 && // Lake location noise
                                         patchNoise < 0; // Additional filter

                        for (let ly = 0; ly < chunkHeight; ly++) {
```
**Replace with:**
```js
                        const lakeNoise = noise2D(gx * 0.015 + 500, gz * 0.015 + 500);
                        const isLakeBed = worldTopY > LAKE_ELEVATION_MIN &&
                                         worldTopY < SNOW_PATCHES_LINE &&
                                         maxSlope < 2 && // Flat area
                                         lakeNoise > 0.7 && // Lake location noise
                                         patchNoise < 0; // Additional filter

                        // ============================================================
                        // CAVE COLUMN CONSTANTS (hoisted out of the ly loop — TER-12)
                        // ============================================================
                        // Surface breakthrough: rare columns skip the surface-fade so a
                        // cave can reach daylight. Depends only on (gx, gz).
                        const breakthroughNoise = noise2D(gx * 0.008 + 9001, gz * 0.008 - 4242);
                        const hasBreakthrough = breakthroughNoise > 0.62;

                        for (let ly = 0; ly < chunkHeight; ly++) {
```

### Change 2: `generateTerrainPass` — remove the per-block computation inside the cave section (voxEx.html, line ~39544)
**Original:**
```js
                                    const widthNoise = widthNoiseCache[idx];
                                    const caveDensityMult = (worldGenSettings?.caveDensityMultiplier ?? 1.0);
                                    let threshold = (0.015 + (widthNoise * 0.5 + 0.5) * 0.025) * caveDensityMult;
                                    // Surface breakthrough: rare columns skip the
                                    // surface-fade so a cave can reach daylight.
                                    const breakthroughNoise = noise2D(gx * 0.008 + 9001, gz * 0.008 - 4242);
                                    const hasBreakthrough = breakthroughNoise > 0.62;
                                    // Surface fading (lowland)
```
**Replace with:**
```js
                                    const widthNoise = widthNoiseCache[idx];
                                    const caveDensityMult = (worldGenSettings?.caveDensityMultiplier ?? 1.0);
                                    let threshold = (0.015 + (widthNoise * 0.5 + 0.5) * 0.025) * caveDensityMult;
                                    // Surface fading (lowland)
```

### Worker parity note:
`generateTerrainPass` is **injected** into the chunk worker via `Function.toString()` — it is in the `terrainPassFuncs` list at lines 19715–19718, spliced between the `/* __TERRAIN_PASS_START__ */ … __END__ */` markers (worker template line 19178–19181). No worker-side change needed; the edit propagates automatically. `noise2D` is already injected (`terrainFuncs`, line 19578).

### Verification:
Terrain output must be byte-identical (pure hoist of a pure function). Run `tools/voxex-tests.html` — terrain determinism tests and the live worker round-trip must pass unchanged. Optional perf check: `console.time('[Chunks] gen')` around `generateChunkData` for a fresh chunk before/after; expect a measurable drop in cave-heavy chunks.

---

## FIX TER-3 — Stop caves puncturing submerged floors
**Chosen option & rationale:** Audit option 1 (extended) — suppress breakthrough on submerged columns and add an any-depth 8-block floor fade for columns below sea level. Kills dry holes under static water; keeps deep caves under oceans.
**Prerequisites / ordering:** **TER-12 must land first** (edits the hoisted block TER-12 creates).

### Change 1: `generateTerrainPass` — submerged flag + breakthrough suppression (voxEx.html, in the TER-12 hoisted block, line ~39283 post-TER-12)
**Original (post-TER-12 text):**
```js
                        // ============================================================
                        // CAVE COLUMN CONSTANTS (hoisted out of the ly loop — TER-12)
                        // ============================================================
                        // Surface breakthrough: rare columns skip the surface-fade so a
                        // cave can reach daylight. Depends only on (gx, gz).
                        const breakthroughNoise = noise2D(gx * 0.008 + 9001, gz * 0.008 - 4242);
                        const hasBreakthrough = breakthroughNoise > 0.62;
```
**Replace with:**
```js
                        // ============================================================
                        // CAVE COLUMN CONSTANTS (hoisted out of the ly loop — TER-12)
                        // ============================================================
                        // Surface breakthrough: rare columns skip the surface-fade so a
                        // cave can reach daylight. Depends only on (gx, gz).
                        const breakthroughNoise = noise2D(gx * 0.008 + 9001, gz * 0.008 - 4242);
                        // TER-3: submerged columns (ocean/river/lake floors) never break
                        // through — a surface opening under standing water would leave a
                        // dry cave pocket below an unfilled hole.
                        const submerged = worldTopY < WORLD_DIMS.seaLevel;
                        const hasBreakthrough = !submerged && breakthroughNoise > 0.62;
```

### Change 2: `generateTerrainPass` — submerged-column floor fade in the cave section (voxEx.html, line ~39559)
**Original:**
```js
                                    // Subsurface fade in elevated terrain: fade in
                                    // over the last few blocks below the surface so
                                    // mountain caves don't blow holes flush at the peak.
                                    if (worldY >= fadeEnd && worldTopY > 80) {
                                        const depthBelowSurface = worldTopY - worldY;
                                        if (depthBelowSurface < 8 && !hasBreakthrough) {
                                            threshold *= depthBelowSurface / 8;
                                        }
                                    }
                                    // Carve using vector magnitude
```
**Replace with:**
```js
                                    // Subsurface fade in elevated terrain: fade in
                                    // over the last few blocks below the surface so
                                    // mountain caves don't blow holes flush at the peak.
                                    if (worldY >= fadeEnd && worldTopY > 80) {
                                        const depthBelowSurface = worldTopY - worldY;
                                        if (depthBelowSurface < 8 && !hasBreakthrough) {
                                            threshold *= depthBelowSurface / 8;
                                        }
                                    }
                                    // Submerged columns (ocean/river/lake floors): never carve within
                                    // 8 blocks of the floor, at any Y — prevents dry cave pockets and
                                    // holes under static water (fillWaterPass only fills above worldTopY).
                                    if (submerged) {
                                        const depthBelowFloor = worldTopY - worldY;
                                        if (depthBelowFloor < 8) {
                                            threshold *= Math.max(0, depthBelowFloor) / 8;
                                        }
                                    }
                                    // Carve using vector magnitude
```

**Scope check (verified):** `WORLD_DIMS.seaLevel` is already used inside `generateTerrainPass` itself (lines 39211, 39306, 39461, 39513) and the worker template hand-maintains `WORLD_DIMS` with `seaLevel` (line 18724, audit-verified drift-free) — in scope on both threads.

### Worker parity note:
Same as TER-12 — `generateTerrainPass` is injected via the `terrainPassFuncs` list (19715–19718) / `__TERRAIN_PASS__` markers. Auto-propagates.

### Verification:
Terrain output changes intentionally (only for columns with `worldTopY < 60`). (1) `tools/voxex-tests.html` ocean/river and worker round-trip tests pass (they compare live main vs live worker — both change together). (2) Manual: new world, fly over ocean; sea floor must have no air holes. (3) Console probe on a loaded ocean chunk: for every column with `worldTopY < 60`, assert no `AIR` cell in `worldTopY-7 .. worldTopY`. Note: existing cached chunks keep old holes until regenerated (block data is not versioned by `CURRENT_CACHE_VERSION`); new worlds/chunks are correct.

---

## FIX TER-7 + TER-8 — Chunk-border-correct slope/aspect + contained alpine lakes
**Chosen option & rationale:** TER-7 option 1 (padded 18×18 height cache, +68 `blendedHeight` calls/chunk) + TER-8 option 1 (cap lake water at the lowest neighbor surface; skip non-basin columns). Surface material and lakes become pure functions of (gx,gz).
**Prerequisites / ordering:** **TER-21 must land first** (single-sources `precalculateTerrainCaches` into the worker). TER-12 must also have landed (Change 3's anchor text). If applied before TER-21, the identical Change 1 edit MUST be mirrored in the hand-copied worker template copy at lines 19088–19108 (same body, 4-space indent) — otherwise the injected `generateTerrainPass` reads `caches.heightPad === undefined` on the worker and throws on first generate.

### Change 1: `precalculateTerrainCaches` (voxEx.html, line ~39126)
**Original:**
```js
            function precalculateTerrainCaches(chunkSize, startX, startZ, seed) {
                const heightCache = new Int16Array(chunkSize * chunkSize);
                const riverCache = new Float32Array(chunkSize * chunkSize);
                const biomeCache = new Array(chunkSize * chunkSize);
                const widthNoiseCache = new Float32Array(chunkSize * chunkSize);
                const tempCache = worldConfig.useNewTerrain ? new Float32Array(chunkSize * chunkSize) : null;
                for (let lx = 0; lx < chunkSize; lx++) {
                    for (let lz = 0; lz < chunkSize; lz++) {
                        const idx = lx + lz * chunkSize;
                        const gx = startX + lx;
                        const gz = startZ + lz;
                        heightCache[idx] = blendedHeight(gx, gz, seed);
                        riverCache[idx] = getRiverFactor(gx, gz, seed);
                        biomeCache[idx] = getBiomeParams(gx, gz);
                        widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                        if (tempCache) tempCache[idx] = temperature(gx, gz);
                    }
                }
                return { heightCache, riverCache, biomeCache, widthNoiseCache, tempCache };
            }
```
**Replace with:**
```js
            function precalculateTerrainCaches(chunkSize, startX, startZ, seed) {
                const heightCache = new Int16Array(chunkSize * chunkSize);
                const riverCache = new Float32Array(chunkSize * chunkSize);
                const biomeCache = new Array(chunkSize * chunkSize);
                const widthNoiseCache = new Float32Array(chunkSize * chunkSize);
                const tempCache = worldConfig.useNewTerrain ? new Float32Array(chunkSize * chunkSize) : null;
                // TER-7: padded (chunkSize+2)² height field — interior mirrors heightCache,
                // plus a 1-block ring OUTSIDE the chunk so slope/aspect/lake analysis sees
                // all 8 neighbors at chunk borders (surface choice = pure function of gx,gz).
                const pad = chunkSize + 2;
                const heightPad = new Int16Array(pad * pad);
                for (let lx = 0; lx < chunkSize; lx++) {
                    for (let lz = 0; lz < chunkSize; lz++) {
                        const idx = lx + lz * chunkSize;
                        const gx = startX + lx;
                        const gz = startZ + lz;
                        heightCache[idx] = blendedHeight(gx, gz, seed);
                        heightPad[(lx + 1) + (lz + 1) * pad] = heightCache[idx];
                        riverCache[idx] = getRiverFactor(gx, gz, seed);
                        biomeCache[idx] = getBiomeParams(gx, gz);
                        widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                        if (tempCache) tempCache[idx] = temperature(gx, gz);
                    }
                }
                // Ring pass: the 1-block border outside the chunk (+68 blendedHeight calls).
                for (let pz = 0; pz < pad; pz++) {
                    for (let px = 0; px < pad; px++) {
                        if (px > 0 && px < pad - 1 && pz > 0 && pz < pad - 1) continue; // interior already filled
                        heightPad[px + pz * pad] = blendedHeight(startX + px - 1, startZ + pz - 1, seed);
                    }
                }
                return { heightCache, riverCache, biomeCache, widthNoiseCache, tempCache, heightPad };
            }
```

### Change 2: `generateTerrainPass` — destructure heightPad (voxEx.html, line ~39176)
**Original:**
```js
                const { heightCache, riverCache, widthNoiseCache, biomeCache } = caches;
                const { caveCache1, caveCache2, cxDim, cxzStride } = caveCaches;
```
**Replace with:**
```js
                const { heightCache, riverCache, widthNoiseCache, biomeCache, heightPad } = caches;
                const { caveCache1, caveCache2, cxDim, cxzStride } = caveCaches;
                const pad = chunkSize + 2; // heightPad row stride — see precalculateTerrainCaches
```

### Change 3: `generateTerrainPass` — slope/aspect scan via heightPad + minNeighborSurface (voxEx.html, line ~39227)
**Original:**
```js
                        // ============================================================
                        // SLOPE ANALYSIS (for all 8 neighbors)
                        // ============================================================
                        let maxSlope = 0;
                        let slopeNorth = 0, slopeSouth = 0, slopeEast = 0, slopeWest = 0;
                        const neighborOffsets = [
                            [-1, 0], [1, 0], [0, -1], [0, 1],
                            [-1, -1], [1, -1], [-1, 1], [1, 1]
                        ];
                        for (const [dx, dz] of neighborOffsets) {
                            const nx = lx + dx;
                            const nz = lz + dz;
                            if (nx >= 0 && nx < chunkSize && nz >= 0 && nz < chunkSize) {
                                const nIdx = nx + nz * chunkSize;
                                const neighborY = heightCache[nIdx];
                                const slope = worldTopY - neighborY; // Positive = we're higher
                                const absSlope = Math.abs(slope);
                                if (absSlope > maxSlope) maxSlope = absSlope;
                                // Track directional slopes for aspect calculations
                                if (dz < 0) slopeNorth = Math.max(slopeNorth, slope);
                                if (dz > 0) slopeSouth = Math.max(slopeSouth, slope);
                                if (dx > 0) slopeEast = Math.max(slopeEast, slope);
                                if (dx < 0) slopeWest = Math.max(slopeWest, slope);
                            }
                        }
```
**Replace with:**
```js
                        // ============================================================
                        // SLOPE ANALYSIS (for all 8 neighbors)
                        // TER-7: reads the padded height field (heightPad), so border
                        // columns see all 8 real neighbors — no material/lake seams
                        // at chunk boundaries.
                        // ============================================================
                        let maxSlope = 0;
                        let slopeNorth = 0, slopeSouth = 0, slopeEast = 0, slopeWest = 0;
                        let minNeighborSurface = 32767; // TER-8: lowest neighboring surface (lake rim)
                        const neighborOffsets = [
                            [-1, 0], [1, 0], [0, -1], [0, 1],
                            [-1, -1], [1, -1], [-1, 1], [1, 1]
                        ];
                        const padBase = (lx + 1) + (lz + 1) * pad;
                        for (const [dx, dz] of neighborOffsets) {
                            const neighborY = heightPad[padBase + dx + dz * pad];
                            const slope = worldTopY - neighborY; // Positive = we're higher
                            const absSlope = Math.abs(slope);
                            if (absSlope > maxSlope) maxSlope = absSlope;
                            if (neighborY < minNeighborSurface) minNeighborSurface = neighborY;
                            // Track directional slopes for aspect calculations
                            if (dz < 0) slopeNorth = Math.max(slopeNorth, slope);
                            if (dz > 0) slopeSouth = Math.max(slopeSouth, slope);
                            if (dx > 0) slopeEast = Math.max(slopeEast, slope);
                            if (dx < 0) slopeWest = Math.max(slopeWest, slope);
                        }
```

### Change 4: `generateTerrainPass` — basin gate on isLakeBed (voxEx.html, line ~39277)
**Original:**
```js
                        const isLakeBed = worldTopY > LAKE_ELEVATION_MIN &&
                                         worldTopY < SNOW_PATCHES_LINE &&
                                         maxSlope < 2 && // Flat area
                                         lakeNoise > 0.7 && // Lake location noise
                                         patchNoise < 0; // Additional filter
```
**Replace with:**
```js
                        const isLakeBed = worldTopY > LAKE_ELEVATION_MIN &&
                                         worldTopY < SNOW_PATCHES_LINE &&
                                         maxSlope < 2 && // Flat area
                                         lakeNoise > 0.7 && // Lake location noise
                                         patchNoise < 0 && // Additional filter
                                         minNeighborSurface > worldTopY; // TER-8: true basin — otherwise water would spill
```

### Change 5: `generateTerrainPass` — cap the lake water fill (voxEx.html, line ~39493)
**Original:**
```js
                            // ============================================================
                            // ALPINE LAKE WATER
                            // ============================================================
                            if (isLakeBed && worldY > worldTopY && worldY <= worldTopY + 3) {
                                id = WATER;
                            }
```
**Replace with:**
```js
                            // ============================================================
                            // ALPINE LAKE WATER
                            // TER-8: never fill above the lowest neighboring surface —
                            // lake water always has a solid rim (no floating slab edges).
                            // ============================================================
                            if (isLakeBed && worldY > worldTopY && worldY <= Math.min(worldTopY + 3, minNeighborSurface)) {
                                id = WATER;
                            }
```
(With Change 4 the `minNeighborSurface <= worldTopY` case never reaches here — `isLakeBed` is already false — so the fill only needs the cap. The `Math.min` also caps partial-rim basins, e.g. rim at `worldTopY+1` → 1 block of water.)

### Worker parity note:
- `generateTerrainPass` (Changes 2–5): **injected** (`terrainPassFuncs`, 19715–19718) — auto-propagates.
- `precalculateTerrainCaches` (Change 1): **hand-copied** in the worker template at lines 19088–19108 (verified — body identical to main today). This spec's diff targets the main copy only; **TER-21 must land first** so there is a single source. If it hasn't, apply Change 1 identically to the worker copy at 19088 or the worker crashes (`heightPad` undefined inside injected `generateTerrainPass`).
- Name-collision check done: `heightPad`, `pad`, `padBase`, `minNeighborSurface` have zero existing occurrences in voxEx.html.

### Verification:
(1) `tools/voxex-tests.html`: worker round-trip must still produce byte-identical chunks vs main-thread generation. (2) Border continuity probe (console): for a mountain seam, generate chunks (cx,0) and (cx+1,0) and confirm the surface block at gx=16·cx+15 is unchanged whether its chunk was generated before or after its neighbor — and visually, no more 16-block vertical material stripes on mountainsides. (3) Lakes: fly to a mountain basin — remaining lakes must be fully rimmed (no exposed vertical water faces); expect fewer/smaller lakes (strict basin test). (4) Perf: +68 `blendedHeight` calls/chunk (~+26% of the precalc height cost pre-TER-4; negligible after TER-4 lands).

---

## FIX TER-13 — Stop computing temperature twice per column
**Chosen option & rationale:** Audit option 1 — `resolveBiome` exports the raw temperature it already computes via an optional out-param; `precalculateTerrainCaches` reuses it for `tempCache`. Saves one full `temperature()` fbm stack per column (256/chunk).
**Prerequisites / ordering:** The precalc change (Change 3) must land **after TER-21** (or be mirrored in the worker copy at 19088–19108). Changes 1–2 are safe to land alone (worker gets them via injection; an un-updated worker precalc simply keeps calling `temperature()` — values identical since the functions are pure). Compatible with TER-7+8 (disjoint lines in the same function).

### Change 1: `resolveBiome` (voxEx.html, line ~38344)
**Note:** `tempCache` consumers use the RAW 0..1 temperature (`generateTerrainPass` line 39210: `bandShift = (localT - 0.5) * 80`), while `resolveBiome` internally remaps to −1..1 — so the out-param must capture the value BEFORE the `* 2 - 1` remap.
**Original:**
```js
            function resolveBiome(gx, gz) {
                const forced = worldConfig.forceSingleBiome;
                if (forced) { const fb = biomeByName.get(forced); if (fb) return fb; }
                const T = temperature(gx, gz) * 2 - 1, H = humidity(gx, gz) * 2 - 1;
```
**Replace with:**
```js
            function resolveBiome(gx, gz, outClimate) {
                const forced = worldConfig.forceSingleBiome;
                if (forced) { const fb = biomeByName.get(forced); if (fb) return fb; }
                const rawT = temperature(gx, gz);
                if (outClimate) outClimate.t = rawT; // raw 0..1 (pre-remap) — reused by precalculateTerrainCaches
                const T = rawT * 2 - 1, H = humidity(gx, gz) * 2 - 1;
```

### Change 2: `getBiomeParams` (voxEx.html, line ~37947)
**Original:**
```js
            function getBiomeParams(gx, gz) {
                if (worldConfig.useNewTerrain) return resolveBiome(gx, gz);
```
**Replace with:**
```js
            function getBiomeParams(gx, gz, outClimate) {
                if (worldConfig.useNewTerrain) return resolveBiome(gx, gz, outClimate);
```
(All other `getBiomeParams(gx, gz)` call sites — tree mask, blendedHeight path, preview — pass 2 args; `outClimate` is `undefined` there, a no-op.)

### Change 3: `precalculateTerrainCaches` loop (voxEx.html, line ~39131; apply to the single-sourced copy post-TER-21)
**Original (two disjoint edits; anchors survive TER-7+8):**
```js
                const tempCache = worldConfig.useNewTerrain ? new Float32Array(chunkSize * chunkSize) : null;
```
**Replace with:**
```js
                const tempCache = worldConfig.useNewTerrain ? new Float32Array(chunkSize * chunkSize) : null;
                // TER-13: per-column climate out-param; NaN = resolveBiome never sampled
                // temperature (forceSingleBiome short-circuit or legacy terrain path).
                const clim = { t: NaN };
```
**Original:**
```js
                        biomeCache[idx] = getBiomeParams(gx, gz);
                        widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                        if (tempCache) tempCache[idx] = temperature(gx, gz);
```
**Replace with:**
```js
                        clim.t = NaN;
                        biomeCache[idx] = getBiomeParams(gx, gz, clim);
                        widthNoiseCache[idx] = noise2D(gx * 0.005, gz * 0.005);
                        if (tempCache) tempCache[idx] = Number.isNaN(clim.t) ? temperature(gx, gz) : clim.t;
```

### Worker parity note:
`resolveBiome`, `getBiomeParams`, and `temperature` are all **injected** (in the `terrainFuncs` list, lines 19588, 19602, 19604) — the signature change propagates automatically. `precalculateTerrainCaches` is **hand-copied** (worker 19088–19108): land Change 3 after TER-21, or mirror it there. `clim`/`outClimate`/`rawT` have zero existing occurrences (collision-checked).

### Verification:
Output must be byte-identical: `temperature()` is a pure function, so reusing its value cannot change `tempCache` or biome selection. Run voxex-tests (terrain determinism + worker parity). Perf probe: wrap `temperature` with a counter for one chunk generation — expect ~256 calls before, ~0 after (new-terrain default path; all served via `resolveBiome`).

---

## FIX TER-1 + TER-18 — Wire up `BLOCKLIGHT_ATTENUATION`; clamp sunlight attenuation fallback
**Chosen option & rationale:** TER-1 option 1 — apply the configured table (water = `blocklightAttenuation: 2`, config line 4761; transparent default 0, opaque default 15 — `initBlockOptimization` lines 30118–30141) in BOTH torch-light paths, with blocklight floor 0. TER-18 option 1 — clamp the sunlight BFS fallback to 1. One `CURRENT_CACHE_VERSION` bump covers TER-1 **and** TER-2.
**Prerequisites / ordering:** None. Includes TER-20(c)'s comment for `calculateBlockLight` (same lines). Land before or with TER-2 (shared version bump lives here).

### Change 1: `calculateBlockLight` BFS (voxEx.html, line ~39056)
**Original:**
```js
                    const level = queue[qIdx++];

                    const propagated = level > 1 ? level - 1 : 0;
                    if (propagated <= 0) continue;

                    for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
                        const o = NEIGHBOR_OFFSETS[n];
                        const nx = lx + o[0];
                        const ny = ly + o[1];
                        const nz = lz + o[2];

                        // Bounds check (stay within chunk)
                        if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

                        const nIdx = nx + (nz << 4) + (ny << 8);
                        const nBlockId = blocks[nIdx];

                        // Only propagate through transparent blocks
                        if (!IS_TRANSPARENT[nBlockId]) continue;

                        // Only update if we can provide more light
                        if (propagated > blockLight[nIdx]) {
                            blockLight[nIdx] = propagated;
                            queue.push(nx, ny, nz, propagated);
                        }
                    }
```
**Replace with:**
```js
                    const level = queue[qIdx++];

                    const basePropagated = level > 1 ? level - 1 : 0;
                    if (basePropagated <= 0) continue;

                    for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
                        const o = NEIGHBOR_OFFSETS[n];
                        const nx = lx + o[0];
                        const ny = ly + o[1];
                        const nz = lz + o[2];

                        // Bounds check (stay within chunk)
                        if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

                        // NOTE: (nz << 4) + (ny << 8) hardcodes chunkSize 16 despite the chunkSize param.
                        const nIdx = nx + (nz << 4) + (ny << 8);
                        const nBlockId = blocks[nIdx];

                        // Only propagate through transparent blocks
                        if (!IS_TRANSPARENT[nBlockId]) continue;

                        // TER-1: entering a cell costs 1 (travel) + BLOCKLIGHT_ATTENUATION of the
                        // entered block (water = 2 extra/block; air/glass = 0). Blocklight floors
                        // at 0 (unlike skylight's floor of 1).
                        const attenuation = BLOCKLIGHT_ATTENUATION[nBlockId];
                        const propagated = attenuation > 0
                            ? (basePropagated > attenuation ? basePropagated - attenuation : 0)
                            : basePropagated;
                        if (propagated <= 0) continue;

                        // Only update if we can provide more light
                        if (propagated > blockLight[nIdx]) {
                            blockLight[nIdx] = propagated;
                            queue.push(nx, ny, nz, propagated);
                        }
                    }
```

### Change 2: `computeNeighborBlockLight` (voxEx.html, line ~25288)
**Original:**
```js
            function computeNeighborBlockLight(x, y, z) {
                let maxLight = 0;
                for (let i = 0; i < NEIGHBOR_OFFSETS.length; i++) {
                    const o = NEIGHBOR_OFFSETS[i];
                    const nx = x + o[0];
                    const ny = y + o[1];
                    const nz = z + o[2];
                    const neighborId = getBlock(nx, ny, nz);
                    if (neighborId === undefined || !IS_TRANSPARENT[neighborId]) continue;
                    const nLight = clampBlockLight(getBlockLight(nx, ny, nz));
                    const propagated = nLight > 0 ? nLight - 1 : 0;
                    if (propagated > maxLight) maxLight = propagated;
                }
                return maxLight;
            }
```
**Replace with:**
```js
            function computeNeighborBlockLight(x, y, z) {
                let maxLight = 0;
                // TER-1: light entering THIS cell pays 1 (travel) + BLOCKLIGHT_ATTENUATION of
                // this cell's block (water = 2 extra/block) — matches calculateBlockLight's BFS,
                // which attenuates by the ENTERED cell's block type.
                const selfId = getBlock(x, y, z);
                const selfAttenuation = selfId === undefined ? 0 : BLOCKLIGHT_ATTENUATION[selfId];
                for (let i = 0; i < NEIGHBOR_OFFSETS.length; i++) {
                    const o = NEIGHBOR_OFFSETS[i];
                    const nx = x + o[0];
                    const ny = y + o[1];
                    const nz = z + o[2];
                    const neighborId = getBlock(nx, ny, nz);
                    if (neighborId === undefined || !IS_TRANSPARENT[neighborId]) continue;
                    const nLight = clampBlockLight(getBlockLight(nx, ny, nz));
                    const basePropagated = nLight > 0 ? nLight - 1 : 0;
                    const propagated = selfAttenuation > 0
                        ? (basePropagated > selfAttenuation ? basePropagated - selfAttenuation : 0)
                        : basePropagated;
                    if (propagated > maxLight) maxLight = propagated;
                }
                return maxLight;
            }
```

### Change 3 (TER-18): `calculateChunkSunlight` BFS clamp (voxEx.html, line ~38987)
**Original:**
```js
                        // Apply additional attenuation for semi-transparent blocks (leaves)
                        const attenuation = SUNLIGHT_ATTENUATION[nBlockId];
                        const propagated = attenuation > 0 && basePropagated > attenuation
                            ? basePropagated - attenuation
                            : basePropagated;
```
**Replace with:**
```js
                        // Apply additional attenuation for semi-transparent blocks (leaves, water).
                        // TER-18: when the light doesn't survive the attenuation, clamp to the
                        // skylight floor of 1 instead of keeping the unreduced value (that fallback
                        // was unreachable at attenuation 1, wrong for any future attenuation >= 2).
                        const attenuation = SUNLIGHT_ATTENUATION[nBlockId];
                        const propagated = attenuation > 0
                            ? (basePropagated > attenuation ? basePropagated - attenuation : 1)
                            : basePropagated;
```

### Change 4: cache version bump (voxEx.html, line ~27516; covers TER-1, TER-2, TER-18)
**Original:**
```js
            // Bump on any cache-format / lighting change; stamped into every saved chunk and compared on load.
            // v5: re-reconcile trees after deterministic site validation (slope/overhang); v4: canopy-prune fix; v3: water sunlight attenuation.
            const CURRENT_CACHE_VERSION = 5;
```
**Replace with:**
```js
            // Bump on any cache-format / lighting change; stamped into every saved chunk and compared on load.
            // v6: blocklight attenuation wired up (water 2/block) + incremental sunlight aligned with full recalc (TER-1/TER-2/TER-18);
            // v5: re-reconcile trees after deterministic site validation (slope/overhang); v4: canopy-prune fix; v3: water sunlight attenuation.
            const CURRENT_CACHE_VERSION = 6;
```
(No other edits needed — all `_cacheVersion` writes at 27537/27687/27861/39796 reference the constant.)

### Worker parity note:
Grep-verified: `calculateBlockLight` does **not** exist in the worker in any form — the worker deliberately ships all-zero `blockLight` (template comment lines 19248–19250: generated terrain has no TORCH/FIRE), and `BLOCKLIGHT_ATTENUATION` is not serialized into worker scope (only main declarations at 17222/25991/30118/30140 + the test seam at 46658). `computeNeighborBlockLight` is main-only incremental code. So Changes 1–2 are **main-only, no worker twin needed**. Change 3's `calculateChunkSunlight` **is injected** into the worker (meshFuncs list line 19863, gated by `WORKER_LIGHTING_ENABLED = true` at 14211) and `SUNLIGHT_ATTENUATION`/`NEIGHBOR_OFFSETS` are already serialized at 19816–19817 — auto-propagates, nothing extra.

### Verification (worked example — both paths must agree):
Torch at cell A (level 14, default `torchIntensity`), water cells B, C adjacent in a row, air cell D after C. Full BFS: A=14; into B: 13(travel) − 2(water) = **11**; into C: 10 − 2 = **8**; into D: 8−1−0 = **7**. Incremental `computeNeighborBlockLight`: for C (self=water, selfAttn=2): neighbor B holds 11 → base 10 → 10−2 = **8** ✓; for D (self=air): neighbor C holds 8 → **7** ✓. In-game: place a torch beside a 3+-deep pool — light through water must now die out in ~5 blocks instead of 14; loading a pre-fix world must trigger full relight (v5 < v6). TER-18 is semantics-identical today (all current attenuations are 0/1/15); confirm no visual change in sunlight and voxex-tests lighting tests pass.

---

## FIX TER-2 — Align incremental sunlight with the full recalc
**Chosen option & rationale:** Audit option 1 — make the two incremental functions reproduce `calculateChunkSunlight` exactly: phase 1 stores the light *arriving* at a cell (pre-attenuation by the cell itself); phase 2 attenuates by the *entered* cell. Currently `computeDirectSkyLight` wrongly applies the target's own attenuation (and returns 1 for opaque targets where phase 1 stores the arriving value), while `computeNeighborSunlight` wrongly skips it.

**Truth table (leaf/water attenuation = 1; L = donor light):**

| Case | Full recalc | Incremental (current) | Incremental (fixed) |
|---|---|---|---|
| Leaf cell, open sky above (vertical) | 15 (phase 1 stores pre-attenuation) | 14 | 15 |
| Air cell under 1 leaf (vertical) | 14 | 14 | 14 |
| Air(L) → leaf sideways (light entering leaf) | L−1−1 | L−1 | L−1−1 |
| Leaf(L) → air sideways | L−1 | L−1 | L−1 |
| Water cell at depth d (d water cells above) | 15−d | 15−(d+1) | 15−d |
| Opaque surface block, open sky (vertical) | 15 (arriving light) | 1 | 15 |

**Prerequisites / ordering:** Land with/after TER-1 — the shared `CURRENT_CACHE_VERSION` bump to 6 (TER-1 Change 4) **covers this fix too; no second bump**. Also depends on TER-18's clamp so the horizontal rule below matches the full BFS exactly.

### Change 1: `computeDirectSkyLight` (voxEx.html, line ~25259)
**Original:**
```js
            function computeDirectSkyLight(x, y, z) {
                // Walk straight up the column to capture true skylight with attenuation, ensuring open holes receive light
                const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;
                let light = 15;
                for (let cy = maxY; cy >= y; cy--) {
                    const blockId = getBlock(x, cy, z);
                    if (blockId === undefined) continue; // Skip unloaded slices
                    const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;
                    if (attenuation >= 15) { return 1; } // Fully blocked above this point
                    if (attenuation > 0) { light = light > attenuation ? light - attenuation : 1; }
                    if (cy === y) break; // Stop once we reach the target cell
                }
                return light > 1 ? light : 1;
            }
```
**Replace with:**
```js
            function computeDirectSkyLight(x, y, z) {
                // Walk the column STRICTLY ABOVE the target cell, applying each occluder's
                // attenuation. TER-2: matches calculateChunkSunlight phase 1, which stores the
                // light ARRIVING at a cell — the cell's own attenuation applies only to light
                // continuing past it, never to its own stored value.
                const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;
                let light = 15;
                for (let cy = maxY; cy > y; cy--) {
                    const blockId = getBlock(x, cy, z);
                    if (blockId === undefined) continue; // Skip unloaded slices
                    const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;
                    if (attenuation >= 15) { return 1; } // Fully blocked above this point
                    if (attenuation > 0) { light = light > attenuation ? light - attenuation : 1; }
                }
                return light > 1 ? light : 1;
            }
```

### Change 2: `computeNeighborSunlight` (voxEx.html, line ~25273)
**Original:**
```js
            function computeNeighborSunlight(x, y, z) {
                let maxLight = computeDirectSkyLight(x, y, z);
                for (let i = 0; i < NEIGHBOR_OFFSETS.length; i++) {
                    const o = NEIGHBOR_OFFSETS[i];
                    const nx = x + o[0];
                    const ny = y + o[1];
                    const nz = z + o[2];
                    const neighborId = getBlock(nx, ny, nz);
                    if (neighborId === undefined || !IS_TRANSPARENT[neighborId]) continue;
                    const nLight = getSkyLight(nx, ny, nz);
                    const propagated = nLight > 1 ? nLight - 1 : 1;
                    if (propagated > maxLight) maxLight = propagated;
                }
                return maxLight;
            }
```
**Replace with:**
```js
            function computeNeighborSunlight(x, y, z) {
                let maxLight = computeDirectSkyLight(x, y, z);
                // TER-2: horizontal light entering THIS cell pays 1 (travel) + the cell's own
                // SUNLIGHT_ATTENUATION — matches calculateChunkSunlight's phase-2 BFS, which
                // attenuates by the ENTERED cell's block type (clamped to the skylight floor 1).
                const selfId = getBlock(x, y, z);
                const selfAttenuation = selfId === undefined ? 0 : (SUNLIGHT_ATTENUATION[selfId] ?? 0);
                for (let i = 0; i < NEIGHBOR_OFFSETS.length; i++) {
                    const o = NEIGHBOR_OFFSETS[i];
                    const nx = x + o[0];
                    const ny = y + o[1];
                    const nz = z + o[2];
                    const neighborId = getBlock(nx, ny, nz);
                    if (neighborId === undefined || !IS_TRANSPARENT[neighborId]) continue;
                    const nLight = getSkyLight(nx, ny, nz);
                    const basePropagated = nLight > 1 ? nLight - 1 : 1;
                    const propagated = selfAttenuation > 0
                        ? (basePropagated > selfAttenuation ? basePropagated - selfAttenuation : 1)
                        : basePropagated;
                    if (propagated > maxLight) maxLight = propagated;
                }
                return maxLight;
            }
```
(For opaque targets `selfAttenuation` is 15, so the horizontal term clamps to 1 — full recalc likewise never propagates horizontally into opaque cells; their value comes from the vertical arriving light, which Change 1 now returns correctly.)

### Worker parity note:
Both functions are **main-only** incremental lighting (callers at 25727/25767/25852; not in any injection list, not in the worker template). `calculateChunkSunlight` (the reference) is untouched by this fix apart from TER-18. No worker change.

### Verification:
Load a world, stand under a tree canopy, break and re-place a leaf block: the re-lit values must equal the surrounding generation-time values (no bright/dark seam on the modified chunk after remesh). Same test in water: dig a block in a pool floor — neighboring water light stays continuous. Programmatic: for a loaded chunk, pick 50 random transparent cells, compare `computeNeighborSunlight(gx,gy,gz)` (with skyLight of neighbors from a fresh `calculateChunkSunlight`) against the freshly recalculated `skyLight` value at that cell — must match exactly for leaf, water, and air cells (interior cells; boundary cells depend on cross-chunk data). The v6 cache bump (TER-1 Change 4) forces relight of stale caches.

---

## FIX TER-20 — `generateTerrainPass` hygiene
**Chosen option & rationale:** Audit option 1, minus the `riverCache[idx]` re-read (line 39510 — dies with TER-5's tunnel deletion; do NOT touch). Drop the unused `data` param; comment the hardcoded chunkSize-16 shifts.
**Prerequisites / ordering:** None. If TER-1 has landed, part (c) for `calculateBlockLight` is already done (its diff includes the comment) — only apply Change 4 here. `const nIdx = nx + (nz << 4) + (ny << 8);` appears twice in the file (38981, 39070) — use the surrounding context quoted below to disambiguate.

### Change 1: `generateTerrainPass` signature (voxEx.html, line ~39175)
**Original:**
```js
            function generateTerrainPass(data, chunkSize, chunkHeight, startX, startZ, caches, caveCaches, set, worldGenSettings) {
```
**Replace with:**
```js
            function generateTerrainPass(chunkSize, chunkHeight, startX, startZ, caches, caveCaches, set, worldGenSettings) {
```

### Change 2: main call site in `generateChunkData` (voxEx.html, line ~39916)
**Original:**
```js
                    // --- PASS 1: Generate terrain with caves ---
                    generateTerrainPass(data, chunkSize, chunkHeight, startX, startZ, caches, caveCaches, set, window.worldGenSettings);
```
**Replace with:**
```js
                    // --- PASS 1: Generate terrain with caves ---
                    generateTerrainPass(chunkSize, chunkHeight, startX, startZ, caches, caveCaches, set, window.worldGenSettings);
```

### Change 3: worker template call site (voxEx.html, line ~19238)
**Original:**
```js
                // Pass set function and worldGenSettings to match main thread signature
                generateTerrainPass(blocks, chunkSize, chunkHeight, startX, startZ, caches, caveCaches, set, worldGenSettings);
```
**Replace with:**
```js
                // Pass set function and worldGenSettings to match main thread signature
                generateTerrainPass(chunkSize, chunkHeight, startX, startZ, caches, caveCaches, set, worldGenSettings);
```

### Change 4: `calculateChunkSunlight` shift comment (voxEx.html, line ~38979)
**Original:**
```js
                        // Bounds check (stay within chunk)
                        if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

                        const nIdx = nx + (nz << 4) + (ny << 8);
                        const nBlockId = blocks[nIdx];

                        // Only propagate through transparent blocks
                        if (!IS_TRANSPARENT[nBlockId]) continue;

                        // Apply additional attenuation for semi-transparent blocks (leaves)
```
**Replace with:**
```js
                        // Bounds check (stay within chunk)
                        if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

                        // NOTE: (nz << 4) + (ny << 8) hardcodes chunkSize 16 despite the chunkSize param.
                        const nIdx = nx + (nz << 4) + (ny << 8);
                        const nBlockId = blocks[nIdx];

                        // Only propagate through transparent blocks
                        if (!IS_TRANSPARENT[nBlockId]) continue;

                        // Apply additional attenuation for semi-transparent blocks (leaves)
```
(If TER-18 landed first, the trailing comment line here reads `// Apply additional attenuation for semi-transparent blocks (leaves, water).` — adjust the anchor accordingly; the inserted NOTE line is identical.)

### Change 5: `calculateBlockLight` shift comment (voxEx.html, line ~39070) — **skip if TER-1 already landed** (its Change 1 includes this comment)
**Original:**
```js
                        // Bounds check (stay within chunk)
                        if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

                        const nIdx = nx + (nz << 4) + (ny << 8);
                        const nBlockId = blocks[nIdx];

                        // Only propagate through transparent blocks
                        if (!IS_TRANSPARENT[nBlockId]) continue;

                        // Only update if we can provide more light
```
**Replace with:**
```js
                        // Bounds check (stay within chunk)
                        if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;

                        // NOTE: (nz << 4) + (ny << 8) hardcodes chunkSize 16 despite the chunkSize param.
                        const nIdx = nx + (nz << 4) + (ny << 8);
                        const nBlockId = blocks[nIdx];

                        // Only propagate through transparent blocks
                        if (!IS_TRANSPARENT[nBlockId]) continue;

                        // Only update if we can provide more light
```

### Worker parity note:
Call-site census (whole-file grep of `generateTerrainPass(`): definition 39175, main call 39917, worker template call 19239 — plus the injection-list reference at 19716 (bare identifier, unaffected) and changelog/comment strings at 4254/4302/4318/4327/19179/38137/38726 (no edits). The **injected** function source updates automatically via `Function.toString()`; the worker template's hand-written call (Change 3) is the only worker-side edit. `calculateChunkSunlight`'s comment travels into the worker via injection (harmless).

### Verification:
Boot the game: chunks generate on both paths (worker + main-thread fallback), no console errors. voxex-tests worker round-trip passes — this is the test that would catch a missed call-site (worker would throw `set is not a function`-style arg-shift errors immediately).

---

## FIX TER-22 — Strengthen `isLightingDataValid`
**Chosen option & rationale:** Audit option 1 — min/max tracking; reject uniform samples. Why uniform-anything is invalid: the sample set spans index 0 (y=0 — chunk floor, always dark: skylight is 1 under terrain, and even a full ocean column attenuates 15→1 by depth 60) and index `expectedSize−1` (y=319 — top layer, always open sky = 15 in a generated 320-high chunk). Real lighting therefore always varies across these samples; uniform means fill-value/zeroed/corrupt data. The old check compared every sample against index 0 with `prevSky` never updated, and both rejects were gated on `prevSky === 15` — since index 0 is almost always 1, it accepted nearly any garbage in range.
**Prerequisites / ordering:** None.

### Change 1: `isLightingDataValid` (voxEx.html, line ~39628) — full function replacement
**Original:**
```js
            function isLightingDataValid(chunk, expectedSize) {
                // Must have both lighting arrays
                if (!chunk.skyLight || !chunk.blockLight) return false;

                // Arrays must be correct size
                if (chunk.skyLight.length !== expectedSize) return false;
                if (chunk.blockLight.length !== expectedSize) return false;

                // Sample multiple points to check for:
                // 1. Variation (not all same value)
                // 2. Valid range (0-15 for light values)
                // 3. Reasonable distribution (not all max or all min)
                // VOXEX-CCR-PERF-014 #546: reuse module array; last index is per-call.
                _lightingSampleIndices[5] = expectedSize - 1;
                const sampleIndices = _lightingSampleIndices;
                let hasVariation = false;
                let hasShadows = false;  // At least some values < 15
                let prevSky = chunk.skyLight[0];

                for (const idx of sampleIndices) {
                    if (idx >= expectedSize) continue;

                    const skyVal = chunk.skyLight[idx];
                    const blockVal = chunk.blockLight[idx];

                    // CRITICAL: Check that values are in valid 0-15 range
                    // Values > 15 indicate corrupt/garbage data from decompression bugs
                    if (skyVal > 15 || blockVal > 15) {
                        return false;  // Invalid light values - reject this cache
                    }

                    // Check for variation
                    if (skyVal !== prevSky) {
                        hasVariation = true;
                    }

                    // Check for shadows (values less than max sunlight)
                    if (skyVal < 15) {
                        hasShadows = true;
                    }
                }

                // If skyLight is uniform 15 everywhere, it's likely uninitialized
                // (real terrain should have some shadows from blocks)
                if (!hasVariation && prevSky === 15) return false;

                // Additional check: terrain should have SOME shadowed areas
                // If all sampled values are 15, lighting probably wasn't calculated properly
                if (!hasShadows && prevSky === 15) return false;

                return true;
            }
```
**Replace with:**
```js
            function isLightingDataValid(chunk, expectedSize) {
                // Must have both lighting arrays
                if (!chunk.skyLight || !chunk.blockLight) return false;

                // Arrays must be correct size
                if (chunk.skyLight.length !== expectedSize) return false;
                if (chunk.blockLight.length !== expectedSize) return false;

                // Sample multiple points to check for:
                // 1. Valid range (0-15 for light values)
                // 2. Variation (minSky !== maxSky). The samples span index 0 (y=0, the
                //    chunk floor — always dark, skylight <= a few) and expectedSize-1
                //    (y=319, the top layer — always open sky = 15 in a generated 320-high
                //    chunk). Real lighting always varies across them, so UNIFORM-anything
                //    (not just uniform 15) means fill-value / zeroed / corrupt data.
                //    (TER-22: the old check compared samples to index 0 only and gated
                //    both rejects on prevSky === 15, accepting nearly any garbage.)
                // VOXEX-CCR-PERF-014 #546: reuse module array; last index is per-call.
                _lightingSampleIndices[5] = expectedSize - 1;
                const sampleIndices = _lightingSampleIndices;
                let minSky = 255;
                let maxSky = -1;

                for (const idx of sampleIndices) {
                    if (idx >= expectedSize) continue;

                    const skyVal = chunk.skyLight[idx];
                    const blockVal = chunk.blockLight[idx];

                    // CRITICAL: Check that values are in valid 0-15 range
                    // Values > 15 indicate corrupt/garbage data from decompression bugs
                    if (skyVal > 15 || blockVal > 15) {
                        return false;  // Invalid light values - reject this cache
                    }

                    if (skyVal < minSky) minSky = skyVal;
                    if (skyVal > maxSky) maxSky = skyVal;
                }

                // Reject uniform skylight across the y=0..319 sample span (see above).
                if (minSky === maxSky) return false;

                return true;
            }
```

### Worker parity note:
**Main-only.** Callers at 27851 (IndexedDB load), 39726 (OPFS load), 39790 (cache path) — grep-verified; not in the worker template or any injection list.

### Verification:
Console tests: (1) `isLightingDataValid({skyLight: new Uint8Array(81920).fill(7), blockLight: new Uint8Array(81920)}, 81920)` → **false** (previously true); (2) same with `.fill(15)` → false; (3) a `skyLight` with `[0]=1` and `[81919]=15` and `blockLight` zeros → true; (4) any sample > 15 → false. Then load an existing world: cached chunks with real lighting must still validate (no unexpected mass relight — watch for `[Chunks]`/`[Lighting]` recalc log spam).

---

## Worker-injection report (definitive, grep + read verified)

| Function | Worker status | Evidence |
|---|---|---|
| `generateTerrainPass` | **Injected** — `terrainPassFuncs` list, spliced between `/* __TERRAIN_PASS_START__ */` … `/* __TERRAIN_PASS_END__ */` (template lines 19178–19181) | Lines 19715–19718: `const terrainPassFuncs = [` / `generateTerrainPass,` / `fillWaterPass` / `];` |
| `fillWaterPass` | **Injected** — same `terrainPassFuncs` list | Same lines 19715–19718 |
| `generateDecorationsPass` | **Main-only.** The worker never has it — its generate handler calls `generateTreesForChunk(...)` directly (template line 19245); the tree functions themselves are injected via `__TREE_FUNCS__` (treeFuncs list 19757–19771) | Template 19242–19245 |
| `calculateChunkSunlight` | **Injected** — appended to the `meshFuncs` list, gated by `WORKER_LIGHTING_ENABLED` (= `true`, line 14211); spliced into `__MESH_FUNCS__`. Support tables `SUNLIGHT_ATTENUATION` + `NEIGHBOR_OFFSETS` serialized at 19816–19817; `IS_TRANSPARENT` at 19813 | Line 19863: `...(WORKER_LIGHTING_ENABLED ? [calculateChunkSunlight] : []) // VOXEX-CCR-PERF-013` |
| `calculateBlockLight` | **Main-only.** Worker deliberately ships all-zero blockLight (template comment 19248–19250: "generated terrain has no TORCH/FIRE"); `BLOCKLIGHT_ATTENUATION` does not exist in worker scope (not serialized anywhere in 18700–19883) | Grep of full worker/build region |
| `precalculateTerrainCaches` | **Hand-copied** in the worker template at **19088–19108** (currently identical to main 39126–39145) — the TER-21 target. Any edit must be dual-applied until TER-21 lands | Read both copies |
| `precalculateCaveNoise` | **Hand-copied** at **19110–19136** (identical math to main 39147–39173; note the worker also carries its own structurally-different-but-equivalent `interpolateCaveNoise` at 19138–19176) | Read both copies |

**Consequences for these specs:** TER-12, TER-3, TER-20(a) — auto-propagate (injected); TER-20(a) additionally edits the hand-written worker call site 19239. TER-7+8 Change 1 and TER-13 Change 3 hit the hand-copied `precalculateTerrainCaches` — hard-ordered after TER-21 (TER-7+8 crashes the worker without it; TER-13 merely loses the worker-side perf win). TER-1/TER-2 lighting changes are main-only except TER-18's `calculateChunkSunlight` edit, which auto-propagates with its tables already serialized.

# Part 3 — Tree, worker, dead-code & docs fixes (agent-drafted, coordinator-reviewed)

---

# VoxEx Terrain Fix Specs (PAR-6/7/8/9/10/12, TER-9/10/11/14/15/16/17/23, PAR-11/13)

**General note for the implementer:** line numbers below are from the current file (46,784 lines) and WILL drift as edits land. Apply edits by exact-string match (Edit tool), not by line offset. Recommended order: PAR-7 → PAR-8 → PAR-12 → PAR-6 → TER-11/PAR-11 sweep → PAR-9 → PAR-10 → TER-14/15/16/17/23 → docs pass (TER-9/10 + PAR-13). After all code fixes: bump `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` once, run `tools/voxex-tests.html` on localhost.

---

## FIX PAR-6 — Seed the tree-mask cache key
**Chosen option & rationale:** Option 1 (seed in key, matching `treePositionsCache`'s `seed + ':' + cx + ',' + cz` format) + size guard + belt-and-braces clears in `applyGenParams`. Fixes the one live main-vs-worker divergence (stale masks after world switch) and makes the worker's per-generate clear unnecessary.
**Prerequisites / ordering:** none.

Call-site audit (whole-file grep `getTreeMaskKey(`): exactly **3** hits — the two definitions (main ~37791, worker ~19057) and ONE caller at ~37837 inside `getTreeMaskForChunk(cx, cz, seed)`, which has `seed` in scope as its own parameter. `getTreeMaskForChunk` is injected into the worker (treeFuncs list ~19761), so the single caller edit covers both threads. No other callers exist (`generateTreeMaskForChunk` does not call it; worker-side mask access goes through the injected functions).

### Change 1: main-thread `getTreeMaskKey` (voxEx.html, line ~37791)
**Original:**
```js
            function getTreeMaskKey(cx, cz) {
                return cx + "," + cz;
            }
```
**Replace with:**
```js
            function getTreeMaskKey(cx, cz, seed) {
                // Seed-qualified (matches treePositionsCache) so masks from a previous
                // world/seed are never reused after a world switch in the same session.
                return seed + ':' + cx + ',' + cz;
            }
```

### Change 2: worker-local `getTreeMaskKey` (voxEx.html, line ~19057, inside worker template)
**Original:**
```js
    function getTreeMaskKey(cx, cz) {
        return cx + ',' + cz;
    }
```
**Replace with:**
```js
    function getTreeMaskKey(cx, cz, seed) {
        // HAND-MAINTAINED copy of the main-thread getTreeMaskKey (~37791) — keep in sync.
        return seed + ':' + cx + ',' + cz;
    }
```

### Change 3: caller + size guard in `getTreeMaskForChunk` (voxEx.html, line ~37836)
**Original:**
```js
            function getTreeMaskForChunk(cx, cz, seed) {
                const key = getTreeMaskKey(cx, cz);
                let mask = treeMaskCache.get(key);
                if (!mask) {
                    mask = generateTreeMaskForChunk(cx, cz, seed);
                    treeMaskCache.set(key, mask);
                }
                return mask;
            }
```
**Replace with:**
```js
            function getTreeMaskForChunk(cx, cz, seed) {
                const key = getTreeMaskKey(cx, cz, seed);
                let mask = treeMaskCache.get(key);
                if (!mask) {
                    mask = generateTreeMaskForChunk(cx, cz, seed);
                    if (treeMaskCache.size > 4096) treeMaskCache.clear();
                    treeMaskCache.set(key, mask);
                }
                return mask;
            }
```
(This function is injected into the worker, so the size guard automatically applies to BOTH the main `treeMaskCache` at ~17219 and the worker's at ~19021 — one insertion site covers both scopes.)

### Change 4: remove the now-redundant per-generate clear in the worker template (voxEx.html, line ~19242)
**Original:**
```js
                // --- Phase 3: Tree generation ---
                // Clear tree mask cache for this generation (ensures fresh calculation)
                treeMaskCache.clear();
                generateTreesForChunk(cx, cz, blocks, chunkSize, chunkHeight, startX, startZ, workerNumericSeed, get, set, caches);
```
**Replace with:**
```js
                // --- Phase 3: Tree generation ---
                // (treeMaskCache is seed-keyed + size-guarded — no per-generate clear needed;
                // reusing masks across generates is a large win for the 3x3 neighborhood scans.)
                generateTreesForChunk(cx, cz, blocks, chunkSize, chunkHeight, startX, startZ, workerNumericSeed, get, set, caches);
```

### Change 5: belt-and-braces clears in `applyGenParams` (voxEx.html, line ~21602)
Both caches are module-scope consts in the same script scope (`treePositionsCache` ~5687, `treeMaskCache` ~17219); `applyGenParams` (~21540) already reaches `biomeCellCache` (~17218) the same way, so both are in scope.
**Original:**
```js
                // Drop cached per-cell biomes so the new patch scale / forced biome take effect.
                if (typeof biomeCellCache !== 'undefined') biomeCellCache.clear();
```
**Replace with:**
```js
                // Drop cached per-cell biomes so the new patch scale / forced biome take effect.
                if (typeof biomeCellCache !== 'undefined') biomeCellCache.clear();
                // Drop tree caches too: keys are seed-qualified, but gen-param tweaks with the
                // SAME seed (tree density, biome size) change mask/position results for identical keys.
                if (typeof treeMaskCache !== 'undefined') treeMaskCache.clear();
                if (typeof treePositionsCache !== 'undefined') treePositionsCache.clear();
```

### Worker parity note:
`getTreeMaskForChunk`/`generateTreeMaskForChunk`/`getTreeMaskValueGlobal` are injected via `buildChunkWorkerCode` (treeFuncs list ~19757) — no action. `getTreeMaskKey` is HAND-MAINTAINED in the worker (Change 2) — both copies must stay identical. The worker rebuilds its pool per world (in-session worker-pool rebuild per `applyGenParams`), so worker caches are also fresh per world; the seeded key is defense in depth there.

### Verification:
1. Run `tools/voxex-tests.html` — terrain/tree determinism + worker round-trip tests must pass.
2. Manual: load world A (note a treed chunk at spawn), load world B with a different seed in the same session, kill the worker path (DevTools: set `chunkWorkerPool` job timeout artificially low or block workers) so main-thread fallback generates chunks — trees must match world B's seed, not world A's.
3. Console: `treeMaskCache.size` stays bounded (≤4096) after long flights.

---

## FIX PAR-8 — Canopy cull must cover real leaf reach
**Chosen option & rationale:** Option 1 — cull with `canopyRadius + 2` (exact bound: `forEachCanopyVoxel` scans `baseRadius + 2` and branch zone reaches `effectiveRadius + 1.5` ≤ baseRadius+2 after radius noise, matching the scan bound). Delete the two dead "correct bound" constants.
**Prerequisites / ordering:** apply before/with PAR-7 (both edit `generateTreesForChunk`).

### Change 1: cull bounds in `generateTreesForChunk` (voxEx.html, line ~5816)
**Original:**
```js
                        for (const tree of chunkTrees) {
                            // Check if this tree's canopy could reach our chunk
                            const canopyMinX = tree.gx - tree.canopyRadius;
                            const canopyMaxX = tree.gx + tree.canopyRadius;
                            const canopyMinZ = tree.gz - tree.canopyRadius;
                            const canopyMaxZ = tree.gz + tree.canopyRadius;
```
**Replace with:**
```js
                        for (const tree of chunkTrees) {
                            // Check if this tree's canopy could reach our chunk.
                            // Leaves reach canopyRadius + 2 (forEachCanopyVoxel scanRadius =
                            // baseRadius + 2: radius noise + branch extension zone), so cull
                            // with the same bound or border canopies get flat-cut at seams.
                            const reach = tree.canopyRadius + 2;
                            const canopyMinX = tree.gx - reach;
                            const canopyMaxX = tree.gx + reach;
                            const canopyMinZ = tree.gz - reach;
                            const canopyMaxZ = tree.gz + reach;
```

### Change 2: delete unused `MAX_CANOPY_RADIUS` (voxEx.html, line ~5806)
**Original:**
```js
                // Collect trees from all 9 chunks that could affect this chunk
                const allTrees = [];
                const MAX_CANOPY_RADIUS = 8; // Maximum possible canopy radius
```
**Replace with:**
```js
                // Collect trees from all 9 chunks that could affect this chunk
                const allTrees = [];
```

### Change 3: delete module-level `MAX_TREE_CANOPY_RADIUS` (voxEx.html, line ~6304)
Grep-confirmed: `MAX_TREE_CANOPY_RADIUS` appears ONLY at its definition (6304–6315) and nowhere else in voxEx.html or tools/voxex-tests.html.
**Original:**
```js
            // Compute MAX_TREE_CANOPY_RADIUS from all biome tree configs
            // Used for cross-chunk tree overhang detection to handle large trees
            const MAX_TREE_CANOPY_RADIUS = (() => {
                let maxRadius = TREE_CONFIG.canopy.radius; // Start with default
                for (const [biomeName, biomeConfig] of Object.entries(BIOME_CONFIG)) {
                    const canopyRadius = biomeConfig.trees?.canopy?.radius;
                    if (canopyRadius !== undefined && canopyRadius > maxRadius) {
                        maxRadius = canopyRadius;
                    }
                }
                return maxRadius;
            })();
```
**Replace with:**
```js
            // [TOMBSTONE PAR-8] Removed dead MAX_TREE_CANOPY_RADIUS IIFE — never read;
            // the canopy cull in generateTreesForChunk uses per-tree canopyRadius + 2.
```

### Worker parity note:
`generateTreesForChunk` is injected via the `__TREE_FUNCS__` markers — Change 1 ships to the worker automatically. Changes 2/3 are main-scope only (never injected). Nothing hand-copied changes.

### Verification:
Create a longwoods world; walk chunk borders under giant canopies — no vertical flat-cut leaf walls aligned to 16-block grid. `tools/voxex-tests.html` tree tests pass. Determinism unchanged (cull is a superset; `forEachCanopyVoxel` output identical — only previously-dropped edge leaves now appear).

---

## FIX PAR-7 — Floating canopies from neighbor-trust asymmetry (scoped hybrid)
**Chosen option & rationale:** Make the tree go/no-go a pure function of (gx, gz, seed) by REMOVING the chunk-data-dependent checks. **Feasibility of a deterministic surface-block predicate: NO** — reasoning: the surface block in `generateTerrainPass` (~39296–39463) depends not only on deterministic noise (`detailNoise > 0.8` stone patches, alpine bands shifted by `tempCache` climate) but on `maxSlope`/aspect/`isLakeBed` (~39230–39281), which are computed from the **in-chunk-clamped** 16×16 `heightCache` (out-of-chunk neighbors silently skipped — audit TER-7). The surface block is therefore *itself* not a pure function of (gx, gz) at chunk borders today; any reimplementation inside the tree code could not match it until TER-7 is fixed, and would duplicate ~170 lines of band logic. **Fallback taken (explicitly): drop the ground-block check entirely** — trees may now stand on stone/gravel patches, lake-bed gravel, or over a cave/tunnel roof. Accepted look change in exchange for the hard invariant: *canopy placed ⟺ trunk placed*, identical on worker and main, independent of generation order.

After this fix the complete go/no-go lives in `getChunkTreePositions` and is deterministic: biome (`getBiomeParams`), tree mask, density roll (`treePlacementValue`), `groundY ≥ seaLevel` (`blendedHeight`), `riverFactor ≥ 0.8`, spacing competition (`wouldHaveValidTree`), trunk border check, world-top room (~5775), and `isTreeSiteViable` (slope/footprint via `blendedHeight` only). Every input is a pure function of (gx, gz, seed).

**Prerequisites / ordering:** apply with/after PAR-8 (same function). PAR-12's spacing-loop edit is independent.

### Change 1: remove now-dead `sourceCx`/`sourceCz` from the collection push (voxEx.html, line ~5834)
**Original:**
```js
                            allTrees.push({
                                ...tree,
                                isOwnChunk: (dx === 0 && dz === 0),
                                sourceCx: ncx,
                                sourceCz: ncz,
                            });
```
**Replace with:**
```js
                            allTrees.push({
                                ...tree,
                                isOwnChunk: (dx === 0 && dz === 0),
                            });
```
(Grep-confirmed: `sourceCx`/`sourceCz` are read ONLY at ~5914/5923/5924, inside the branch deleted in Change 3.)

### Change 2: drop `allowedGroundBlocks` from the per-tree destructure (voxEx.html, line ~5848)
**Original:**
```js
                    const { canopy, blocks, allowedGroundBlocks } = profile;
```
**Replace with:**
```js
                    const { blocks } = profile;
```
(`allowedGroundBlocks`'s only use was the ground check deleted below; `canopy`'s only use was the redundant height-limit check deleted below — `canopy.topExtension` room is already enforced deterministically at ~5775 in `getChunkTreePositions`.)

### Change 3: replace the validation/placement block (voxEx.html, lines ~5861–5937) — the core change
**Original (in full):**
```js
                    const trunkBaseY = finalGroundY + 1;
                    const trunkTopY = trunkBaseY + trunkHeight;

                    // Validate and place trunk only for trees in THIS chunk
                    // Note: River/spacing/slope/overhang checks are done deterministically
                    // in getChunkTreePositions; the checks below need actual chunk data.
                    if (isOwnChunk) {
                        // Ground + support check for EVERY trunk footprint column —
                        // multi-trunk longwoods must not stand on invalid ground, and a
                        // cave/tunnel directly under the surface disqualifies the site.
                        let groundOk = true;
                        for (let tx = minTx; tx <= maxTx && groundOk; tx++) {
                            for (let tz = minTz; tz <= maxTz && groundOk; tz++) {
                                const groundId = get(lx + tx, finalGroundY, lz + tz);
                                if (!isValidTreeGround(groundId, allowedGroundBlocks)) groundOk = false;
                                const belowId = get(lx + tx, finalGroundY - 1, lz + tz);
                                if (belowId === AIR || belowId === WATER) groundOk = false; // cave roof / overhang
                            }
                        }
                        if (!groundOk) continue;

                        // Check space for the FULL trunk footprint
                        let hasSpace = true;
                        for (let y = trunkBaseY; y <= trunkTopY && hasSpace; y++) {
                            for (let tx = minTx; tx <= maxTx && hasSpace; tx++) {
                                for (let tz = minTz; tz <= maxTz && hasSpace; tz++) {
                                    const block = get(lx + tx, y, lz + tz);
                                    if (block !== AIR && !isLeafBlock(block)) hasSpace = false;
                                }
                            }
                        }
                        if (!hasSpace) continue;

                        // Height limit check
                        if (trunkTopY + canopy.topExtension >= chunkHeight) continue;

                        // Place trunk
                        for (let y = trunkBaseY; y <= trunkTopY; y++) {
                            for (let tx = minTx; tx <= maxTx; tx++) {
                                for (let tz = minTz; tz <= maxTz; tz++) {
                                    const bx = lx + tx;
                                    const bz = lz + tz;
                                    if (bx >= 0 && bx < chunkSize && bz >= 0 && bz < chunkSize) {
                                        set(bx, y, bz, blocks.log);
                                    }
                                }
                            }
                        }
                    } else {
                        // NEIGHBOR TREE VALIDATION
                        // For trees from neighbor chunks, we trust the deterministic generator.
                        // If the source chunk exists, verify the trunk was actually placed.
                        // If the source chunk doesn't exist yet, assume the tree will be placed.
                        const sourceKey = getChunkKey(tree.sourceCx, tree.sourceCz);
                        const sourceChunk = chunks.get(sourceKey);

                        if (sourceChunk) {
                            // ROBUST RANGE SCAN (parity with worker copy and
                            // placeNeighborTreeLeaves): a single-Y check fails on any
                            // estimate/actual height delta. Scan the trunk column
                            // (estimate ± slack) for ANY log.
                            const sourceBlocks = sourceChunk.blocks || sourceChunk;
                            const sourceStartX = tree.sourceCx * chunkSize;
                            const sourceStartZ = tree.sourceCz * chunkSize;
                            const colBase = (gx - sourceStartX) + (gz - sourceStartZ) * chunkSize;
                            const scanLo = Math.max(0, groundY - 6);
                            const scanHi = Math.min(chunkHeight - 1, trunkTopY + 6);
                            let trunkFound = false;
                            for (let ty = scanLo; ty <= scanHi; ty++) {
                                if (isLogBlock(sourceBlocks[colBase + ty * chunkSize * chunkSize])) { trunkFound = true; break; }
                            }
                            // If chunk exists but trunk doesn't, tree failed validation - skip leaves
                            if (!trunkFound) continue;
                        }
                        // If sourceChunk is undefined, trust the deterministic generator
                        // and place leaves now. The trunk will be placed when that chunk generates.
                    }
```
**Replace with:**
```js
                    const trunkBaseY = finalGroundY + 1;
                    const trunkTopY = trunkBaseY + trunkHeight;

                    // DETERMINISTIC GO/NO-GO (PAR-7): every accept/reject input is a pure
                    // function of (gx, gz, seed) and already ran in getChunkTreePositions
                    // (biome, tree mask, density, river, spacing, slope/footprint via
                    // isTreeSiteViable, world-top room). The old chunk-data reads here
                    // (surface-block whitelist, cave-roof probe, trunk-space scan) were
                    // REMOVED: neighbor chunks and the worker (whose `chunks` map is
                    // permanently empty) could never reproduce them, so canopies were
                    // placed for trunks the owning chunk then rejected — floating leaves
                    // at seams, and worker-vs-main-fallback chunks with different blocks.
                    // Accepted trade-off: trees may stand on stone/gravel surface patches,
                    // lake-bed gravel, or bridge a cave roof carved below the surface.
                    if (isOwnChunk) {
                        // Place trunk
                        for (let y = trunkBaseY; y <= trunkTopY; y++) {
                            for (let tx = minTx; tx <= maxTx; tx++) {
                                for (let tz = minTz; tz <= maxTz; tz++) {
                                    const bx = lx + tx;
                                    const bz = lz + tz;
                                    if (bx >= 0 && bx < chunkSize && bz >= 0 && bz < chunkSize) {
                                        set(bx, y, bz, blocks.log);
                                    }
                                }
                            }
                        }
                    }
                    // Neighbor trees: the deterministic generator guarantees the owning
                    // chunk places this trunk (same pure-function verdict), so canopy
                    // leaves are placed unconditionally — no source-chunk log scan needed.
```

### Change 4: delete the now-dead `isValidTreeGround` — main copy (voxEx.html, line ~5529)
Grep-confirmed: after Change 3, zero callers remain (was: main def 5535, single use 5875, worker def 19052). Not on the `window.VoxEx` seam; not referenced in tools/voxex-tests.html.
**Original:**
```js
            /**
             * Check if a ground block is valid for tree spawning
             * @param {BlockId} blockId - The block ID to check
             * @param {Set<BlockId>} allowedGroundBlocks - Set of valid ground block IDs
             * @returns {boolean} True if the block is valid for tree spawning
             */
            function isValidTreeGround(blockId, allowedGroundBlocks) {
                return allowedGroundBlocks.has(blockId);
            }
```
**Replace with:**
```js
            // [TOMBSTONE PAR-7] Removed dead isValidTreeGround() — the tree go/no-go is now
            // fully deterministic (pure function of gx, gz, seed); no chunk-data ground check.
```

### Change 5: delete the worker-local `isValidTreeGround` copy (voxEx.html, line ~19052)
**Original:**
```js
    function isValidTreeGround(blockId, allowedGroundBlocks) {
        return allowedGroundBlocks.has(blockId);
    }
```
**Replace with:**
```js
    // [TOMBSTONE PAR-7] Removed dead worker isValidTreeGround copy (see main-thread tombstone).
```

### Change 6: delete the worker's now-dead empty `chunks` map + `getChunkKey` (voxEx.html, line ~19022)
The injected `generateTreesForChunk` was the only consumer of the worker-local `chunks`/`getChunkKey` (grep-confirmed: no other reference between the worker-template start ~18660 and its end; the 59 `getChunkKey(` hits are all main-thread module scope).
**Original:**
```js
    // Empty Map for chunks - worker doesn't have access to main thread chunks
    // This causes neighbor validation to always trust the deterministic generator
    const chunks = new Map();

    function getChunkKey(cx, cz) {
        return cx + ',' + cz;
    }
```
**Replace with:**
```js
    // [TOMBSTONE PAR-7] Removed the always-empty `chunks` map + getChunkKey — the injected
    // generateTreesForChunk no longer scans source chunks (deterministic go/no-go).
```

### Worker parity note:
`generateTreesForChunk` is injected (`__TREE_FUNCS__`) — Changes 1–3 ship automatically. Changes 5–6 edit the hand-maintained worker template. **CLAUDE.md checklist updates needed** (fold into the docs pass): the tree single-source bullet lists `isValidTreeGround` and `chunks`/`getChunkKey` among hand-maintained worker helpers — remove them. **Downstream consequence (no code change required):** `prunePhantomNeighborLeaves` (~17763) and the trunk-verification scan in `placeNeighborTreeLeaves` (~17701–17719) become effectively no-ops-that-always-pass, since every deterministic tree now always has its trunk. They remain correct (they self-heal old saves generated before this fix) — leave them; optionally note for a future sweep.

### Verification:
1. **The key parity test:** generate the same chunk via worker and via main-thread fallback (`tools/voxex-tests.html` has the live worker round-trip / `blendedHeight` parity tests; the worker↔main byte-parity mesh test will catch block divergence) — byte-identical blocks.
2. Manual: fly along chunk seams in forests/longwoods — no floating leaf clusters, no canopies missing their trunks; every canopy has a trunk regardless of which chunk generated first.
3. Accepted-change spot check: occasional trees on stone patches/gravel are expected and OK.
4. `Ctrl+F` the file for `isValidTreeGround`, `sourceCx`, `sourceChunk` in `generateTreesForChunk` — zero live references.

---

## FIX PAR-9 — Worker WORLD_DIMS missing `worldHeight`
**Chosen option & rationale:** Option 1 — add the field to the hand-maintained worker copy (trivial, kills the latent NaN trap).
**Prerequisites / ordering:** none.

Main copy for reference (line ~7123, unchanged):
```js
            const WORLD_DIMS = {
                chunkSize: 16,
                chunkHeight: 320,
                yOffset: 0,
                seaLevel: 60,
                worldHeight: 320,
            };
```

### Change 1: worker WORLD_DIMS (voxEx.html, line ~18724)
**Original:**
```js
    const WORLD_DIMS = {
        chunkSize: 16,
        chunkHeight: 320,
        seaLevel: 60,
        // CRITICAL: must match the main thread's WORLD_DIMS.yOffset (0). This drifted to 64,
        // which shifted ALL worker terrain 64 blocks up in the block array while the tree
        // pass kept using un-offset heightCache values — every tree's ground check read
        // stone/bedrock and NO TREES generated in any worker chunk. The shift was invisible
        // otherwise because the whole worker world (terrain + water) moved together.
        // Found 2026-06-12 via live worker probe (bedrock 65 layers deep, grass at y=130
        // with heightCache=65). NOTE: worlds generated before this fix have +64 terrain —
        // new chunks in OLD worlds will meet 64-block cliffs; create a fresh world.
        yOffset: 0
    };
```
**Replace with:**
```js
    const WORLD_DIMS = {
        chunkSize: 16,
        chunkHeight: 320,
        seaLevel: 60,
        worldHeight: 320,   // must match main WORLD_DIMS.worldHeight (PAR-9)
        // CRITICAL: must match the main thread's WORLD_DIMS.yOffset (0). This drifted to 64,
        // which shifted ALL worker terrain 64 blocks up in the block array while the tree
        // pass kept using un-offset heightCache values — every tree's ground check read
        // stone/bedrock and NO TREES generated in any worker chunk. The shift was invisible
        // otherwise because the whole worker world (terrain + water) moved together.
        // Found 2026-06-12 via live worker probe (bedrock 65 layers deep, grass at y=130
        // with heightCache=65). NOTE: worlds generated before this fix have +64 terrain —
        // new chunks in OLD worlds will meet 64-block cliffs; create a fresh world.
        yOffset: 0
    };
```

### Worker parity note:
Hand-maintained worker template copy — this IS the parity fix. No injected code changes.

### Verification:
In DevTools: `window.VoxEx.buildChunkWorkerCode()` (via `?test=1`) — confirm the built worker source contains `worldHeight: 320`. Worker round-trip test still passes.

---

## FIX PAR-10 — Marker failure must throw
**Chosen option & rationale:** Option 1 — the markers live in the same file as the injector; if they're missing the build is corrupted and the un-injected template throws ReferenceError later anyway. Fail loudly at build.
**Prerequisites / ordering:** none.

### Change 1: terrain-funcs fallback (voxEx.html, line ~19702)
**Original:**
```js
                if (startIdx === -1 || endIdx === -1) {
                    console.warn('[WorkerPool] Terrain function markers not found, using static code');
                    return CHUNK_WORKER_CODE;
                }
```
**Replace with:**
```js
                if (startIdx === -1 || endIdx === -1) {
                    throw new Error('[WorkerPool] __TERRAIN_FUNCS_START__/__TERRAIN_FUNCS_END__ markers not found — voxEx.html is corrupted (injection markers removed); the un-injected template has no terrain function bodies');
                }
```

### Change 2: terrain-pass fallback (voxEx.html, line ~19737)
**Original:**
```js
                if (passStartIdx === -1 || passEndIdx === -1) {
                    console.warn('[WorkerPool] Terrain pass markers not found, using static code');
                    return workerCode;
                }
```
**Replace with:**
```js
                if (passStartIdx === -1 || passEndIdx === -1) {
                    throw new Error('[WorkerPool] __TERRAIN_PASS_START__/__TERRAIN_PASS_END__ markers not found — voxEx.html is corrupted (injection markers removed); the un-injected template has no generateTerrainPass/fillWaterPass bodies');
                }
```

### Change 3: tree-funcs fallback (voxEx.html, line ~19789)
**Original:**
```js
                if (treeStartIdx === -1 || treeEndIdx === -1) {
                    console.warn('[WorkerPool] Tree function markers not found, using static code');
                    return workerCode;
                }
```
**Replace with:**
```js
                if (treeStartIdx === -1 || treeEndIdx === -1) {
                    throw new Error('[WorkerPool] __TREE_FUNCS_START__/__TREE_FUNCS_END__ markers not found — voxEx.html is corrupted (injection markers removed); the un-injected template has no tree function bodies');
                }
```

### Worker parity note:
Main-only (`buildChunkWorkerCode` runs on the main thread). Note there is a fourth (mesh-funcs) injection block after ~19805 — the audit scoped only these three; if the implementer finds an identical mesh-marker fallback, applying the same pattern is in-spirit but optional.

### Verification:
Temporarily mangle one marker in a scratch copy (e.g. rename `__TREE_FUNCS_START__`) and confirm world load throws the new descriptive error immediately instead of warning + failing later with `ReferenceError`. Restore. Normal load: no behavior change; tests pass.

---

## FIX PAR-12 — Canopy hot-loop allocations
**Chosen option & rationale:** Packed-int Map keys + lazily-initialized function-property offset tables (module-scope hoisting would NOT survive `Function.toString()` injection) + squared spacing compare. Determinism byte-identical (see Verification).

**Bounds reasoning for the packed key `(dx + 16) | ((dz + 16) << 6) | (y << 12)`:** dx/dz are bounded by `scanRadius = baseRadius + 2`; max configured canopy radius is 6 (longwoods) → ±8; flood-fill neighbor lookups add ±1 → ±9. `±16` headroom → `dx+16 ∈ [7, 25] ⊂ [0, 63]` (6 bits each). `y` is an absolute world Y in the canopy band (`trunkTopY ± overlapDown/topExtension`, always ≥ ~60 since groundY ≥ seaLevel; hard-bounded by chunkHeight 320) → `y << 12` ≤ 320·4096 ≈ 1.31M, comfortably inside 31-bit int. Flood-fill `ny = y − 1` can never go negative in practice; if it ever did, the key would be negative and simply miss the `candidates.has()` lookup — identical to a missing string key (all valid keys are > 0 since `dx+16 ≥ 7`).
**Prerequisites / ordering:** apply after PAR-7 (same file region, avoids overlap conflicts in `generateTreesForChunk`); `forEachCanopyVoxel` changes are independent.

### Change 1: candidates Map comment + key write (voxEx.html, lines ~6050 and ~6128)
**Original (a):**
```js
                // PASS 1: Collect all candidate positions
                // Store as Map with key "dx,y,dz" -> true
                const candidates = new Map();
```
**Replace with:**
```js
                // PASS 1: Collect all candidate positions
                // Store as Map with a packed-int key -> true (no string alloc/parse):
                //   key = (dx + 16) | ((dz + 16) << 6) | (y << 12)
                // dx/dz bounded by scanRadius+1 = ±9 today (max radius 6 + 2 + flood-fill
                // neighbor) — ±16 headroom, 6 bits each. y is absolute world Y (0..319).
                // NOTE: if a biome canopy radius ever exceeds 13, widen the bit layout.
                const candidates = new Map();
```
**Original (b):**
```js
                            // Add to candidate set
                            candidates.set(`${dx},${y},${dz}`, true);
```
**Replace with:**
```js
                            // Add to candidate set (packed-int key)
                            candidates.set((dx + 16) | ((dz + 16) << 6) | (y << 12), true);
```

### Change 2: hoist offset tables into function properties (voxEx.html, lines ~6161–6177)
**Original:**
```js
                // Face neighbors for initial trunk adjacency check
                const faceOffsets = [
                    [1, 0, 0], [-1, 0, 0],  // +X, -X
                    [0, 1, 0], [0, -1, 0],  // +Y, -Y
                    [0, 0, 1], [0, 0, -1]   // +Z, -Z
                ];

                // Extended neighbors for flood fill (face + edge, more lenient)
                const extendedOffsets = [
                    // Face neighbors
                    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
                    // Edge neighbors (same Y) - allows horizontal diagonal connections
                    [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
                    // Edge neighbors (Y±1) - allows diagonal vertical connections
                    [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
                    [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1],
                ];
```
**Replace with:**
```js
                // Offset tables hoisted as lazily-initialized FUNCTION PROPERTIES — not
                // module scope: forEachCanopyVoxel ships to the worker via
                // Function.toString() injection, so anything outside the function body
                // would not be injected. Properties persist across calls on both threads.
                if (!forEachCanopyVoxel._faceOffsets) {
                    // Face neighbors for initial trunk adjacency check
                    forEachCanopyVoxel._faceOffsets = [
                        [1, 0, 0], [-1, 0, 0],  // +X, -X
                        [0, 1, 0], [0, -1, 0],  // +Y, -Y
                        [0, 0, 1], [0, 0, -1]   // +Z, -Z
                    ];
                    // Extended neighbors for flood fill (face + edge, more lenient)
                    forEachCanopyVoxel._extendedOffsets = [
                        // Face neighbors
                        [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
                        // Edge neighbors (same Y) - allows horizontal diagonal connections
                        [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
                        // Edge neighbors (Y±1) - allows diagonal vertical connections
                        [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
                        [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1],
                    ];
                }
                const faceOffsets = forEachCanopyVoxel._faceOffsets;
                const extendedOffsets = forEachCanopyVoxel._extendedOffsets;
```

### Change 3: decode pass — trunk-adjacency seeding (voxEx.html, line ~6184)
**Original:**
```js
                for (const key of candidates.keys()) {
                    const [dx, y, dz] = key.split(',').map(Number);
```
**Replace with:**
```js
                for (const key of candidates.keys()) {
                    const dx = (key & 63) - 16;
                    const dz = ((key >> 6) & 63) - 16;
                    const y = key >> 12;
```

### Change 4: decode pass — flood fill (voxEx.html, lines ~6200–6208)
**Original:**
```js
                while (toProcess.length > 0) {
                    const currentKey = toProcess.pop();
                    const [cx, cy, cz] = currentKey.split(',').map(Number);

                    for (const [ox, oy, oz] of extendedOffsets) {
                        const nx = cx + ox;
                        const ny = cy + oy;
                        const nz = cz + oz;
                        const neighborKey = `${nx},${ny},${nz}`;
```
**Replace with:**
```js
                while (toProcess.length > 0) {
                    const currentKey = toProcess.pop();
                    const cx = (currentKey & 63) - 16;
                    const cz = ((currentKey >> 6) & 63) - 16;
                    const cy = currentKey >> 12;

                    for (const [ox, oy, oz] of extendedOffsets) {
                        const nx = cx + ox;
                        const ny = cy + oy;
                        const nz = cz + oz;
                        const neighborKey = (nx + 16) | ((nz + 16) << 6) | (ny << 12);
```
(Note the original string key order is `dx,y,dz`, so original `[cx, cy, cz]` bound cx=dx, cy=y, cz=dz — the packed decode above preserves exactly that meaning.)

### Change 5: decode pass — output (voxEx.html, line ~6231)
**Original:**
```js
                // PASS 3: Output surviving candidates
                for (const key of candidates.keys()) {
                    const [dx, y, dz] = key.split(',').map(Number);
                    fn(dx, dz, y);
                }
```
**Replace with:**
```js
                // PASS 3: Output surviving candidates
                for (const key of candidates.keys()) {
                    const dx = (key & 63) - 16;
                    const dz = ((key >> 6) & 63) - 16;
                    const y = key >> 12;
                    fn(dx, dz, y);
                }
```

### Change 6: squared spacing compare in `getChunkTreePositions` (voxEx.html, line ~5736)
**Original:**
```js
                                if (ddx === 0 && ddz === 0) continue;
                                const dist = Math.sqrt(ddx * ddx + ddz * ddz);
                                if (dist >= spacing) continue;
```
**Replace with:**
```js
                                if (ddx === 0 && ddz === 0) continue;
                                const distSq = ddx * ddx + ddz * ddz;
                                if (distSq >= spacing * spacing) continue;
```
(Exact-equivalence: ddx/ddz/spacing are integers, so both sides of the squared compare are exact; `sqrt(d) >= s ⟺ d >= s²` for non-negative values.)

### Worker parity note:
`forEachCanopyVoxel` and `getChunkTreePositions` are both injected via `__TREE_FUNCS__` — all changes ship to the worker automatically. The function-property pattern is precisely why nothing is hoisted to module scope. No hand-maintained copies affected.

### Verification:
**Determinism must be UNCHANGED — same iteration order, same accepted candidates:** Map/Set preserve insertion order regardless of key type; insertion order of the packed keys is identical to the old string keys (same loops); the flood-fill stack semantics are unchanged; the seededRandom call sequence is untouched; the spacing compare is mathematically identical on integers. Prove it: (1) `tools/voxex-tests.html` tree determinism + worker round-trip + mesh byte-parity tests pass; (2) stronger — before applying the fix, dump `JSON.stringify([...])` of `fn(dx,dz,y)` calls for a fixed tree (e.g. via a temp wrapper at a known longwood site) and diff against the post-fix dump: byte-identical. (3) Load a pre-fix world save: no chunk diffs at tree sites.

---

## FIX TER-11 + PAR-11 — Dead code sweep
**Chosen option & rationale:** Delete with tombstones per project convention. Tombstone style copied from the existing example at line 7891: `// [TOMBSTONE #548] Removed dead VoxelWorld.updateStreaming() — never called.` (use the fix ID in place of a number).
**Prerequisites / ordering:** PAR-7 first (it deletes `isValidTreeGround` and the neighbor scan; this sweep assumes those edits landed). PAR-8 handles `MAX_CANOPY_RADIUS`/`MAX_TREE_CANOPY_RADIUS`.

### Item A: non-indexed face path — grep results per name
| Function | Callers outside own definitions | Seam? | Tests? | Verdict |
|---|---|---|---|---|
| `addFace` (~40583) | none (comment mentions at 18317/19372/40655 only) | no | no | **DELETE** |
| `addFaceWater` (~40599) | none | no | no | **DELETE** |
| `addFaceSimplified` (~40636) | none | no | no | **DELETE** |
| `writeFaceColors` (~40270) | only `addFace` | no | no | **DELETE** (after addFace) |
| `writeFaceColorsWater` (~40424) | only `addFaceWater` | no | no | **DELETE** (after addFaceWater) |
| `writeFaceUVs` (~40436) | only addFace/addFaceWater/addFaceSimplified | no | no | **DELETE** |
| `writeFaceVertices` (~40251) | only the three deleted fns | **YES (~46663)** | **YES (voxex-tests.html:181, 288–291: two live unit tests)** | **KEEP** — function + seam export + tests untouched |

Secondary refs that are fine to leave: comment-only mentions of "addFace" at ~18317, ~19372, ~40655, and changelog strings ~4291/4349. `getSimplifiedLight` (~10574) retains a live caller (`addFaceSimplifiedIndexed` ~40782) — keep. `getCachedFaceVertices` (~18309) loses all callers once the three functions are deleted (`getCachedFaceVerticesIndexed` is a separate function) — **also delete `getCachedFaceVertices`** if grep confirms (definition at 18309; only callers were 40585/40601/40638); it is not on the seam or in tests. If the implementer finds another caller, keep it and note.

### Change A1 (voxEx.html, ~40262–40283): delete `writeFaceColors` (JSDoc + body, quoted first/last lines)
**Original (first lines / last line):**
```js
            /**
             * Write vertex colors (AO × light) to buffer for a face.
             ...
            function writeFaceColors(col, cIdx, ao, lightLevel) {
             ...
                col[cIdx + 15] = c4; col[cIdx + 16] = c4; col[cIdx + 17] = c4;
            }
```
**Replace with:**
```js
            // [TOMBSTONE TER-11] Removed dead non-indexed writeFaceColors() — the mesher is
            // indexed-only (writeFaceColorsIndexed); writeFaceVertices kept (unit-tested via seam).
```

### Change A2 (voxEx.html, ~40422–40449): delete `writeFaceColorsWater` + `writeFaceUVs`
**Original (first/last lines):**
```js
            // Write vertex colors for water with depth-based fog effect and visual variation
            // Creates a foggy, more substantial look for water with caustics and foam
            function writeFaceColorsWater(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
             ...
            // Write UV coordinates to buffer
            function writeFaceUVs(uvs, uvIdx, uv) {
             ...
                uvs[uvIdx + 10] = u0; uvs[uvIdx + 11] = v1c;
            }
```
**Replace with:**
```js
            // [TOMBSTONE TER-11] Removed dead non-indexed writeFaceColorsWater() + writeFaceUVs()
            // — superseded by the *Indexed variants; zero callers.
```

### Change A3 (voxEx.html, ~40582–40653): delete `addFace`, `addFaceWater`, `addFaceSimplified`
**Original (first/last lines):**
```js
            // Add a face to the chunk mesh (simplified orchestrator)
            function addFace(wx, wy, wz, nx, ny, nz, uv, pos, norm, uvs, col, getter, solidX, solidY, solidZ, blockId, vIdx, uvIdx, cIdx, lightGetter, lightX, lightY, lightZ, faceIdx) {
             ...   (through addFaceWater ~40599, addFaceSimplified ~40636) ...
                // Write UV coordinates
                writeFaceUVs(uvs, uvIdx, uv);
            }
```
**Replace with:**
```js
            // [TOMBSTONE TER-11] Removed the dead 6-vertex non-indexed face path (addFace,
            // addFaceWater, addFaceSimplified) — only the *Indexed variants are called.
```

### Item B: `getLocalSlope`
### Change B1 (voxEx.html, ~38610–38630): delete function
**Original:**
```js
            /**
             * Calculate local terrain slope (max height diff to cardinal neighbors).
             * @param {number} gx - Global X coordinate
             * @param {number} gz - Global Z coordinate
             * @param {number} seed - World seed
             * @param {number} [sampleDist=4] - Distance to sample neighbors
             * @returns {number} Maximum slope to any cardinal neighbor
             */
            function getLocalSlope(gx, gz, seed, sampleDist = 4) {
                const centerHeight = getPreRiverHeight(gx, gz, seed);
                let maxSlope = 0;

                const offsets = [[sampleDist, 0], [-sampleDist, 0], [0, sampleDist], [0, -sampleDist]];
                for (const [dx, dz] of offsets) {
                    const neighborHeight = getPreRiverHeight(gx + dx, gz + dz, seed);
                    const slope = Math.abs(centerHeight - neighborHeight) / sampleDist;
                    if (slope > maxSlope) maxSlope = slope;
                }

                return maxSlope;
            }
```
**Replace with:**
```js
            // [TOMBSTONE TER-11] Removed dead getLocalSlope() — zero callers (vestige of the
            // never-built gradient-descent river tracer); also dropped from the worker
            // terrainFuncs injection list and the window.VoxEx test seam.
```
### Change B2 (voxEx.html, ~19592–19594): remove from `terrainFuncs` injection list
**Original:**
```js
                    getPreRiverHeight,
                    getLocalSlope,
                    getRiverFactor,
```
**Replace with:**
```js
                    getPreRiverHeight,
                    getRiverFactor,
```
### Change B3 (voxEx.html, ~46681–46682): remove from seam
**Original:**
```js
                    getBiomeHeightAtCell, blendedHeight, getPreRiverHeight,
                    getLocalSlope, getRiverFactor, getOceanFactor, getOceanDepth,
```
**Replace with:**
```js
                    getBiomeHeightAtCell, blendedHeight, getPreRiverHeight,
                    getRiverFactor, getOceanFactor, getOceanDepth,
```
### Change B4 (tools/voxex-tests.html, line ~186): remove from destructure
**Original:**
```js
            getPreRiverHeight, getLocalSlope, getRiverFactor, getOceanFactor, getOceanDepth,
```
**Replace with:**
```js
            getPreRiverHeight, getRiverFactor, getOceanFactor, getOceanDepth,
```
### Change B5 (tools/voxex-tests.html, lines ~619–630): remove the test block
**Original:**
```js
    // ---- getPreRiverHeight / getLocalSlope ----
    describe("getPreRiverHeight", () => {
        it("deterministic", () => { biomeCellCache.clear(); const h1 = getPreRiverHeight(100, 100, seed); biomeCellCache.clear(); expect(getPreRiverHeight(100, 100, seed)).toBeCloseTo(h1, 5); });
        it("finite values", () => { for (let i = 0; i < 50; i++) { const h = getPreRiverHeight(i*100, i*73, seed); expect(isFinite(h)).toBeTruthy(); } });
    });
    describe("getLocalSlope", () => {
        it("non-negative", () => { for (let i = 0; i < 20; i++) expect(getLocalSlope(i*100, i*70, seed)).toBeGreaterThanOrEqual(0); });
        it("flat terrain has low slope", () => { // Plains area (near origin) should generally be flat
            const s = getLocalSlope(0, 0, seed);
            expect(s).toBeLessThan(5); // Blocks per block
        });
    });
```
**Replace with:**
```js
    // ---- getPreRiverHeight ----
    describe("getPreRiverHeight", () => {
        it("deterministic", () => { biomeCellCache.clear(); const h1 = getPreRiverHeight(100, 100, seed); biomeCellCache.clear(); expect(getPreRiverHeight(100, 100, seed)).toBeCloseTo(h1, 5); });
        it("finite values", () => { for (let i = 0; i < 50; i++) { const h = getPreRiverHeight(i*100, i*73, seed); expect(isFinite(h)).toBeTruthy(); } });
    });
```
(Test count drops by 2 — update the "~204 tests" figure only if it's asserted anywhere.)

### Item C: `findSurfaceY` + `hasNearbyTree` (voxEx.html, ~38171–38198) — grep: zero callers, not on seam, not in tests
**Original (in full):**
```js
            function findSurfaceY(data, lx, lz, arrayWidth = WORLD_DIMS.chunkSize) {
                for (let y = WORLD_DIMS.chunkHeight - 1; y >= 0; y--) {
                    const idx = lx + lz * arrayWidth + y * arrayWidth * arrayWidth;
                    if (data[idx] !== AIR) return y;
                }
                return -1;
            }
            // Check for nearby trees using biome-specific log block ID
            // Optimized: only scans a small y-range near ground level (groundY ± 30)
            function hasNearbyTree(lx, lz, spacing, groundY, logBlockId, get) {
                const chunkSize = WORLD_DIMS.chunkSize;
                const chunkHeight = WORLD_DIMS.chunkHeight;
                // Scan a limited y-range near ground level (trees are ground-up structures)
                const yMin = Math.max(0, groundY - 5);
                const yMax = Math.min(chunkHeight - 1, groundY + 30);
                for (let ox = -spacing; ox <= spacing; ox++) {
                    for (let oz = -spacing; oz <= spacing; oz++) {
                        const nx = lx + ox, nz = lz + oz;
                        if (nx < 0 || nx >= chunkSize || nz < 0 || nz >= chunkSize) continue;
                        for (let y = yMin; y <= yMax; y++) {
                            const blockId = get(nx, y, nz);
                            // Check for the specific biome's log block, or any log type
                            if (blockId === logBlockId || LOG_BLOCK_IDS.has(blockId)) return true;
                        }
                    }
                }
                return false;
            }
```
**Replace with:**
```js
            // [TOMBSTONE TER-11] Removed dead findSurfaceY() + hasNearbyTree() — zero callers
            // (superseded by the deterministic tree pipeline: getChunkTreePositions/treePlacementValue).
```

### Item D: `treeNoise` (voxEx.html, ~21339) — grep: zero callers, not on seam, not in tests
**Original:**
```js
            function treeNoise(gx, gz, seed) { return noise2D(gx * 0.07 + seed * 31.7, gz * 0.07 - seed * 12.3); }
```
**Replace with:**
```js
            // [TOMBSTONE TER-11] Removed dead treeNoise() — zero callers (treePlacementValue is the live density hash).
```

### Item E: worker `BIOME_NAMES`/`BIOME_WEIGHTS`/`TOTAL_BIOME_WEIGHT` (voxEx.html, ~18833–18835) — grep: only these three lines reference them
**Original:**
```js
    const BIOME_NAMES = Object.keys(BIOME_CONFIG);
    const BIOME_WEIGHTS = BIOME_NAMES.map(name => BIOME_CONFIG[name].weight);
    const TOTAL_BIOME_WEIGHT = BIOME_WEIGHTS.reduce((a, b) => a + b, 0);
```
**Replace with:**
```js
    // [TOMBSTONE PAR-11] Removed dead BIOME_NAMES/BIOME_WEIGHTS/TOTAL_BIOME_WEIGHT — leftovers
    // of the removed worker-static biome selector (biome selection is injected from main).
```

### Item F: dead destructure in `generateTreesForChunk` (voxEx.html, ~5804)
Verified by full read of the function body (5803–5963): `heightCache` appears only in a comment (~5857), `riverCache` nowhere. **Keep the `caches` parameter** (signature stability: two call sites — worker ~19245 and the main-thread `generateDecorationsPass` — pass it; the worker call is inside the hand-maintained template).
**Original:**
```js
            function generateTreesForChunk(cx, cz, data, chunkSize, chunkHeight, startX, startZ, seed, get, set, caches) {
                const { heightCache, riverCache } = caches;
```
**Replace with:**
```js
            function generateTreesForChunk(cx, cz, data, chunkSize, chunkHeight, startX, startZ, seed, get, set, caches) {
                // `caches` kept for call-shape stability (worker + main pass it); heightCache/
                // riverCache are unused since the deterministic-groundY refactor.
```

### Item G: `forEachTrunkBranch` + `isInTrunkFootprint` + trunk branch config (feature never wired — DELETE all)
Grep: `isInTrunkFootprint` — definition only. `forEachTrunkBranch` — definition only. `branchStart/branchLength/taperTop` — typedef (5047–5050), TREE_CONFIG (5414–5417), resolveTreeProfile (5479–5482), forEachTrunkBranch internals, worker TREE_CONFIG (18744). (`canopy.branchChance` is a DIFFERENT, live knob — untouched.)

**G1 (voxEx.html, ~6237–6302): delete both functions.**
**Original (first/last lines):**
```js
            // Check if position is within trunk footprint (for any w×d trunk centered at origin)
            function isInTrunkFootprint(x, z, trunkW, trunkD) {
             ... (through forEachTrunkBranch ~6253) ...
                        for (let len = 0; len < actualLength; len++) {
                            const bx = startX + dir.dx * len;
                            const bz = startZ + dir.dz * len;
                            // Slight upward angle for longer branches
                            const by = y + Math.floor(len / 2);
                            fn(bx, by, bz);
                        }
                    }
                }
            }
```
**Replace with:**
```js
            // [TOMBSTONE PAR-11] Removed dead isInTrunkFootprint() + forEachTrunkBranch() and the
            // trunk branch config (branchStart/branchChance/branchLength/taperTop) — trunk-branch
            // feature was never wired in (zero callers; forEachTrunkBranch was never injected either).
```

**G2 (voxEx.html, ~5413–5417): delete TREE_CONFIG trunk branch fields.**
**Original:**
```js
                    // sizes: optional array of {w, d, weight} for weighted trunk size selection
                    // If present, w/d are ignored and size is chosen per-tree via seededRandom
                    // Branch options for trunk decorations
                    branchStart: 0.5,      // Height ratio where branches can appear (0-1, 0.5 = halfway up)
                    branchChance: 0.0,     // Probability of branch at valid positions (0 = no branches)
                    branchLength: 2,       // Max branch length in blocks
                    taperTop: false,       // Whether trunk narrows at top (for large trunks)
                },
```
**Replace with:**
```js
                    // sizes: optional array of {w, d, weight} for weighted trunk size selection
                    // If present, w/d are ignored and size is chosen per-tree via seededRandom
                },
```

**G3 (voxEx.html, ~5477–5484): drop the branch-field re-copies in `resolveTreeProfile`** (they'd become explicit `undefined`s).
**Original:**
```js
                const trunk = {
                    ...TREE_CONFIG.trunk,
                    branchStart: TREE_CONFIG.trunk.branchStart,
                    branchChance: TREE_CONFIG.trunk.branchChance,
                    branchLength: TREE_CONFIG.trunk.branchLength,
                    taperTop: TREE_CONFIG.trunk.taperTop,
                    ...trees.trunk,
                };
```
**Replace with:**
```js
                const trunk = {
                    ...TREE_CONFIG.trunk,
                    ...trees.trunk,
                };
```
(Behavior-identical even before the field deletion — the explicit copies duplicated the spread.)

**G4 (voxEx.html, ~5047–5050): drop the typedef properties.**
**Original:**
```js
             * @property {TrunkSizeOption[]} [sizes] - Weighted size options
             * @property {number} branchStart - Height ratio where branches can appear (0-1)
             * @property {number} branchChance - Probability of branch at valid positions
             * @property {number} branchLength - Max branch length in blocks
             * @property {boolean} taperTop - Whether trunk narrows at top
             */
```
**Replace with:**
```js
             * @property {TrunkSizeOption[]} [sizes] - Weighted size options
             */
```

**G5 (voxEx.html, ~18744): worker hand-maintained TREE_CONFIG copy.**
**Original:**
```js
    const TREE_CONFIG = {
        trunk: {
            w: 1, d: 1,
            minHeight: 5, maxHeight: 11,
            branchStart: 0.5, branchChance: 0.0, branchLength: 2, taperTop: false,
        },
```
**Replace with:**
```js
    const TREE_CONFIG = {
        trunk: {
            w: 1, d: 1,
            minHeight: 5, maxHeight: 11,
        },
```

### Item H: `WORLD_CONFIG.noise.octaves` (voxEx.html, ~5025–5029)
Grep `octaves`: the field at 5026 is never read (`fbm2D`/`fbmWithDomainWarp` take explicit octave args at every call site; `applyGenParams` writes only `noise.persistence`/`noise.lacunarity`; worker bake doesn't include it).
**Original:**
```js
                noise: {
                    octaves: 128,
                    persistence: 0.5,
                    lacunarity: 2.0,
                },
```
**Replace with:**
```js
                noise: {
                    // [TOMBSTONE PAR-11] Removed dead `octaves: 128` — never read (every fbm2D
                    // call site passes an explicit octave count).
                    persistence: 0.5,
                    lacunarity: 2.0,
                },
```
Also delete the matching typedef line (voxEx.html, ~5002):
**Original:**
```js
             * @typedef {Object} NoiseConfig
             * @property {number} octaves - Number of noise octaves
             * @property {number} persistence - Amplitude scaling per octave
```
**Replace with:**
```js
             * @typedef {Object} NoiseConfig
             * @property {number} persistence - Amplitude scaling per octave
```

### Worker parity note:
B2 changes what `buildChunkWorkerCode` injects (worker code shrinks — fine). E and G5 edit the hand-maintained worker template. F/G1–G4/H are main-scope (G-touched `resolveTreeProfile` IS injected — behavior identical). PAR-11's note stands: `forEachTrunkBranch` was never in the treeFuncs injection list, so its deletion can't break injection.

### Verification:
Grep AFTER edits for each deleted name (`addFace\b`, `addFaceWater\b`, `addFaceSimplified\b`, `writeFaceColors\b`, `writeFaceColorsWater`, `writeFaceUVs\b`, `getCachedFaceVertices\b`, `getLocalSlope`, `findSurfaceY`, `hasNearbyTree`, `treeNoise`, `BIOME_WEIGHTS`, `forEachTrunkBranch`, `isInTrunkFootprint`, `branchStart`, `taperTop`, `noise.octaves`) — only tombstones/changelog strings remain. Run the full test suite; load a world; mine/place blocks near water (mesher unaffected — indexed path untouched, `writeFaceVertices` tests still green).

---

## FIX TER-14 — Nonexistent `biomes` global in main-thread fallback
**Chosen option & rationale:** Option 1 — drop the `|| biomes.find(...)` clause; `biomeByName` is always populated (`rebuildBiomeTable()` runs at startup and on every `applyGenParams`), and the worker gets consistent behavior since this function is injected.
**Prerequisites / ordering:** none.

### Change 1: (voxEx.html, line ~37917)
**Original:**
```js
                    const foothillsConfig = biomeByName.get('mountain_foothills') || biomes.find(b => b.name === 'mountain_foothills');
```
**Replace with:**
```js
                    // biomeByName is always populated (rebuildBiomeTable at startup + applyGenParams).
                    // A `|| biomes.find(...)` fallback used to sit here, but `biomes` only exists in
                    // the worker's injected scope — on the main thread it was a ReferenceError trap.
                    const foothillsConfig = biomeByName.get('mountain_foothills');
```

### Worker parity note:
`getBiomeCellDirect` is injected — the worker (which does define `const biomes = __biomes`) simply stops using its fallback too; `biomeByName` is also injected there (~19627). Consistent on both threads.

### Verification:
Tests pass (biome-cell tests exercise `getBiomeCellDirect`); worlds with `useNewTerrain: false` (A/B toggle) still generate foothills around mountains.

---

## FIX TER-15 — Dead `mountains.weight` (comment fix, NOT deletion)
**Chosen option & rationale:** Keep the field (deleting risks NaN in future weight summations and desyncs the hand-maintained worker BIOME_CONFIG); replace the misleading tuning comment in BOTH copies.
**Prerequisites / ordering:** none.

### Change 1: main BIOME_CONFIG (voxEx.html, line ~5221)
**Original:**
```js
                mountains: {
                    weight: 0.5,      // Rare dramatic terrain. Lowered after CDF transform
                                      // uniformised the biome distribution — at weight 1, scattered
                                      // mountains created excessive foothill coverage (>50%).
```
**Replace with:**
```js
                mountains: {
                    weight: 0.5,      // UNUSED: mountains are placed by the isMountainRegion mask,
                                      // not the weighted roll (rebuildBiomeTable skips them).
```

### Change 2: worker BIOME_CONFIG copy (voxEx.html, line ~18782)
**Original:**
```js
        mountains: {
            weight: 0.5, roughness: 0.003, amplitude: 180, baseHeight: 64, tags: ["mountain"],
```
**Replace with:**
```js
        mountains: {
            // weight UNUSED: mountains are placed by the isMountainRegion mask, not the weighted roll (rebuildBiomeTable skips them)
            weight: 0.5, roughness: 0.003, amplitude: 180, baseHeight: 64, tags: ["mountain"],
```

### Worker parity note:
Comment-only in both copies; field values unchanged, so the "no drift" invariant between main (5165) and worker (18757) BIOME_CONFIG holds.

### Verification:
Diff the two mountains blocks — values identical, comments updated. No behavior change; tests pass.

---

## FIX TER-16 — Remove the never-set `_amplitudeScale` knob
**Chosen option & rationale:** Option 1 — inline the 1.0 (grep-confirmed `_amplitudeScale` appears exactly once, at ~38534; nothing ever assigns it).
**Prerequisites / ordering:** none.

### Change 1: `mountainsHeightFunc` (voxEx.html, lines ~38533–38540)
**Original:**
```js
                // Apply width-based amplitude scaling (narrow ridges = shorter peaks)
                const amplitudeScale = biome._amplitudeScale ?? 1.0;
                // VOXEX-CCR-TERRAIN-002: the isotropic gradient equalized terrain steepness to the
                // mean of the old (biased) X/Z axes, leaving mountains steeper than the old gentle
                // (X) axis (mean step ~1.47 vs the ~1.378 ceiling). Scale mountain relief down ~10%
                // so both axes sit under the old-X step ceiling (mean step is linear in amplitude).
                const MOUNTAIN_RELIEF_SCALE = 0.90;
                const effectiveAmplitude = biome.amplitude * amplitudeScale * MOUNTAIN_RELIEF_SCALE;
```
**Replace with:**
```js
                // VOXEX-CCR-TERRAIN-002: the isotropic gradient equalized terrain steepness to the
                // mean of the old (biased) X/Z axes, leaving mountains steeper than the old gentle
                // (X) axis (mean step ~1.47 vs the ~1.378 ceiling). Scale mountain relief down ~10%
                // so both axes sit under the old-X step ceiling (mean step is linear in amplitude).
                const MOUNTAIN_RELIEF_SCALE = 0.90;
                const effectiveAmplitude = biome.amplitude * MOUNTAIN_RELIEF_SCALE;
```

### Worker parity note:
`mountainsHeightFunc` is injected — ships automatically. NOTE: tools/terrain-visualizer.html has a stale copy of this function (audit PAR-3) — it never had `_amplitudeScale` semantics that mattered; sync it during the PAR-3 re-copy, not here.

### Verification:
`blendedHeight` output unchanged for any seed/coord (`_amplitudeScale` was always undefined → `?? 1.0`): run the tests' height determinism/parity suites — identical values.

---

## FIX TER-17 + TER-23 — Comment/JSDoc corrections
**Chosen option & rationale:** Fix both the inline water comment and the function header (TER-17 options 1+2), and fully correct the `getMergeKey` JSDoc including the missing `damp` param (TER-23 options 1+2). Comment-only; zero behavior change.
**Prerequisites / ordering:** none.

### Change 1: `calculateChunkSunlight` inline comment (voxEx.html, line ~38952)
**Original:**
```js
                            // attenuation === 0 means fully transparent (air, water) - light passes unchanged
```
**Replace with:**
```js
                            // attenuation === 0 means fully transparent (air, glass) — light passes
                            // unchanged. WATER has sunlightAttenuation 1 (dims 1/block) and takes
                            // the branch above, same as leaves.
```

### Change 2: header block (voxEx.html, lines ~38894–38902)
**Original:**
```js
            // Sunlight propagation follows a two-phase approach:
            // Phase 1: Vertical propagation from sky (y = max) downward
            //   - Starts at level 15 (full sunlight)
            //   - Attenuated by transparent blocks (leaves reduce by 1)
            //   - Blocked completely by opaque blocks (falls to level 1)
            // Phase 2: Horizontal BFS propagation
            //   - Light spreads from lit blocks to neighboring air/transparent blocks
            //   - Reduces by 1 per block traveled
            //   - Fills caves, overhangs, and shaded areas
```
**Replace with:**
```js
            // Sunlight propagation follows a two-phase approach:
            // Phase 1: Vertical propagation from sky (y = max) downward
            //   - Starts at level 15 (full sunlight)
            //   - Attenuated per SUNLIGHT_ATTENUATION (leaves −1, water −1 per block;
            //     air/glass 0 = pass unchanged)
            //   - Blocked completely by opaque blocks (falls to level 1)
            // Phase 2: Horizontal BFS propagation
            //   - Light spreads from lit blocks to neighboring air/transparent blocks
            //   - Reduces by 1 per block traveled (+ the target cell's SUNLIGHT_ATTENUATION)
            //   - Fills caves, overhangs, and shaded areas
```

### Change 3: `getMergeKey` JSDoc (voxEx.html, lines ~40211–40220)
**Original:**
```js
            /**
             * Create merge key from block ID, AO values, and light level.
             * Faces can only merge if merge keys are identical.
             * This ensures AO gradients and lighting are preserved at block boundaries.
             * Uses direct lookup table access for maximum performance.
             * @param {BlockId} blockId - Block type ID
             * @param {number[]} ao - Array of 4 AO values
             * @param {number} light - Normalized light level (0-1)
             * @returns {number} 27-bit merge key: (blockId << 11) | (light << 8) | (q0 << 6) | (q1 << 4) | (q2 << 2) | q3
             */
```
**Replace with:**
```js
            /**
             * Create merge key from block ID, shoreline damp level, and AO values.
             * Faces can only merge if merge keys are identical.
             * This ensures AO gradients and damp boundaries stay crisp at block edges.
             * Uses direct lookup table access for maximum performance.
             * @param {BlockId} blockId - Block type ID
             * @param {number[]} ao - Array of 4 AO values
             * @param {number} light - UNUSED since Phase 3 (light is a per-vertex attribute,
             *   not part of the key); parameter kept for call-shape compatibility.
             * @param {number} [damp=0] - Wet-shoreline damp level (0-2).
             * @returns {number} Merge key: (blockId << 10) | ((damp & 3) << 8) | (q0 << 6) | (q1 << 4) | (q2 << 2) | q3
             */
```

### Worker parity note:
`calculateChunkSunlight` and `getMergeKey` are both injected (lighting/mesh injection blocks) — comments travel with the source; no hand-copies to touch.

### Verification:
Comment-only diff (confirm with `git diff` that no code lines changed). Decoder at ~41106 already matches the corrected layout.

---

## FIX TER-9 + TER-10 + PAR-13 — Documentation truth pass
**Chosen option & rationale:** One consolidated pass: two stale in-file comments + five surgical CLAUDE.md replacements. Text below reflects the verified code (`MAX_FOOTHILL_RINGS = 1`, ringFactor `= max(0.05, 1−((1−0.5)/1)²) = 0.75`, `mountainWeight = 0.75 × 0.9 = 0.675`, one 64-block cell ring; rivers = warped noise ribbon).
**Prerequisites / ordering:** after PAR-7 (so CLAUDE.md's worker-helper list edit matches the code); the CLAUDE.md checklist edit below includes that.

### Change 1: stale worker-copy comment (voxEx.html, line ~37918–37922, inside `getBiomeCellDirect`)
**Original:**
```js
                    // Ring factor with quadratic decay using ring-CENTRE distance
                    // (ring-0.5)/N so the single-ring case (N=1) gives rf=0.75 instead
                    // of the boundary value of 0 — without this, a mountain cell drops
                    // from ~200 to ~67 in one 64-block cell, producing sheer cliffs.
                    // Must match the worker copy at voxEx.html:19073.
```
**Replace with:**
```js
                    // Ring factor with quadratic decay using ring-CENTRE distance
                    // (ring-0.5)/N so the single-ring case (N=1) gives rf=0.75 instead
                    // of the boundary value of 0 — without this, a mountain cell drops
                    // from ~200 to ~67 in one 64-block cell, producing sheer cliffs.
                    // SINGLE-SOURCE: getBiomeCellDirect is injected into the chunk worker
                    // by buildChunkWorkerCode() via Function.toString() — there is NO
                    // hand-maintained worker copy to keep in sync.
```

### Change 2: stale 4-ring comment in `mountainsHeightFunc` (voxEx.html, lines ~38400–38402)
**Original:**
```js
                // Mountain->lowland taper is handled by the 4-ring foothill
                // system (BIOME_CONFIG.mountain_foothills + _ringFactor decay
                // 0.94->0.05 across 256 blocks), not by per-cell edge falloff.
```
**Replace with:**
```js
                // Mountain->lowland taper is handled by the SINGLE-ring foothill
                // system (getBiomeCellDirect: MAX_FOOTHILL_RINGS = 1, constant
                // _ringFactor 0.75 -> foothillsHeightFunc mountainWeight 0.675,
                // one 64-block biome-cell transition), not by per-cell edge falloff.
```

### Change 3 (CLAUDE.md): Biome table — Mountains row (line ~105)
**Original:**
```
| **Mountains** | 1 | High peaks (amplitude 180), ridged noise, conical pines, treeline, snow |
```
**Replace with:**
```
| **Mountains** | 0.5 (unused — mask-placed) | High peaks (amplitude 180), ridged noise, conical pines, treeline, snow |
```

### Change 4 (CLAUDE.md): Biome table — Foothills row (line ~108, also stale "4-ring")
**Original:**
```
| **Mountain Foothills** | auto | Transition zone (4-ring Chebyshev distance, quadratic decay, mountain-derived noise) |
```
**Replace with:**
```
| **Mountain Foothills** | auto | Transition zone (single 64-block cell ring, constant ringFactor 0.75, mountain-derived noise) |
```

### Change 5 (CLAUDE.md): Terrain Generation Pipeline paragraph (line ~112) — adds the prominent `useNewTerrain` note
**Original:**
```
**Terrain Generation Pipeline**: continental height + domain warping → weighted cell-based biome selection → per-biome height functions → river carving → structure placement. Mountains: domain-warped ridges → 6-layer ridged noise → peak amplification → valley erosion → jagged detail overlay. Biome boundaries use two-octave domain warping for organic edges.
```
**Replace with:**
```
**Terrain Generation Pipeline**: **`WORLD_CONFIG.useNewTerrain: true` (the default) routes ALL height queries through the climate+spline surface — `terrainSurface`/`computeSurfaceHeight`/`resolveBiome` (temperature/humidity/continentalness/erosion/peaks-valleys fields + splines). The bilinear biome-cell system documented in this section is the LEGACY A/B path, reachable only by setting the flag false.** Legacy path: continental height + domain warping → weighted cell-based biome selection → per-biome height functions. Shared by BOTH paths: river/ocean carving → structure placement. Legacy mountains: domain-warped ridges → 6-layer ridged noise → peak amplification → valley erosion → jagged detail overlay. Biome boundaries use two-octave domain warping for organic edges.
```

### Change 6 (CLAUDE.md): Mountain-Foothills Transition bullets (lines ~114–118)
**Original:**
```
**Mountain-Foothills Transition**:
- `foothillsHeightFunc` uses `mountainsHeightFunc` output scaled by ring factor — ridges/valleys align at boundaries (no mismatched noise).
- `mountainsHeightFunc` edge falloff uses `name === 'mountains'` (not tag check) so foothills trigger height tapering.
- 4 rings (256 blocks total), quadratic decay `ringFactor = max(0.05, 1 - (ring/4)²)`: Ring 1 ≈ 94% mountain shape, Ring 2 ≈ 75%, Ring 3 ≈ 44%, Ring 4 ≈ 5%. `mountainWeight = ringFactor * 0.9` controls relief passthrough.
- **Mountain placement**: by a low-frequency domain-warped region mask (`isMountainRegion`) so they cluster into coherent ranges — NOT the per-cell weighted roll (which distributes the other 5 biomes via the noise-calibrated CDF `_BIOME_CDF_TABLE`). Keeps ranges contiguous, avoids plains/foothill notches between scattered peaks.
```
**Replace with:**
```
**Mountain-Foothills Transition** (legacy path — inert under the default `useNewTerrain: true`):
- `foothillsHeightFunc` uses `mountainsHeightFunc` output scaled by ring factor — ridges/valleys align at boundaries (no mismatched noise).
- SINGLE ring (`MAX_FOOTHILL_RINGS = 1`, one 64-block biome cell): any non-mountain cell 8-adjacent to a mountain cell becomes foothills with constant `ringFactor = 0.75` (from the ring-centre form `max(0.05, 1 - ((ring - 0.5)/N)²)`). `mountainWeight = ringFactor * 0.9 = 0.675` controls relief passthrough; baseHeight lerps plains (62) → foothills (70) by ringFactor. There is no per-cell edge falloff in `mountainsHeightFunc`.
- **Mountain placement**: by a low-frequency domain-warped region mask (`isMountainRegion`) so they cluster into coherent ranges — NOT the per-cell weighted roll (which distributes the other 5 biomes via the noise-calibrated CDF `_BIOME_CDF_TABLE`; `rebuildBiomeTable` excludes mountains, so `BIOME_CONFIG.mountains.weight` is unused). Keeps ranges contiguous, avoids plains/foothill notches between scattered peaks.
```

### Change 7 (CLAUDE.md): River System section (lines ~162–165)
**Original:**
```
### River System
- **Algorithm**: gradient-descent tracing from high elevation to sea level.
- **RiverNetworkCache**: regional LRU (64 max regions, 256-block region size).
- **Constraints**: max slope 1.0 blocks/block, max elevation 75, 8-block sample distance. River factor carves into `blendedHeight()` output.
```
**Replace with:**
```
### River System
- **Algorithm**: stationary domain-warped noise ribbon — `getRiverFactor(gx, gz, seed)` returns 0 (river center) → 1 (no river) where `|noise2D|` of the warped coordinates falls below the channel half-width. Warp = two-octave coordinate warp + axis-balanced sinusoidal meander + regional macro-meander (`RIVER_WARP_*`). There is NO gradient-descent tracing and NO `RiverNetworkCache` (that class does not exist in the code).
- **Width & fade**: half-width `RIVER_BASE_WIDTH` (0.064 noise units) ± coastal variation; `heightPenalty = smoothstep(66, 82, preRiverHeight)` fades rivers out on elevated terrain (a mountain river-tunnel punch exists in `generateTerrainPass` but is effectively unreachable — see terrain-gen-audit.md TER-5).
- **Carving**: `blendedHeight()` blends the pre-river height toward the `getRiverDepth()` bed (canyon/tunnel mix on high ground); river SAND beaches and water fill happen in `generateTerrainPass`/`fillWaterPass`.
```

### Change 8 (CLAUDE.md): Classes table — remove `WorldPreviewNoise`, amend `WorldPreviewRenderer` (lines ~226–227)
**Original:**
```
| `WorldPreviewNoise` | 19408 | Seeded Perlin noise for terrain preview |
| `WorldPreviewRenderer` | 19504 | Real-time terrain preview during world creation |
```
**Replace with:**
```
| `WorldPreviewRenderer` | 19504 | Real-time terrain preview during world creation (delegates to the game's own `blendedHeight()`/`getBiomeParams()`; the old `WorldPreviewNoise` class was removed) |
```

### Change 9 (CLAUDE.md, follow-on from PAR-7): worker hand-maintained-helpers checklist line
In the Quick Reference Checklist, the tree single-source bullet currently reads (locate by searching `hand-maintains leaf helpers`):
**Original (fragment):**
```
The worker still hand-maintains leaf helpers (`seededRandom`, `isLeafBlock`/`isLogBlock`/`isValidTreeGround`, `getTreeMaskKey`, `noise2D`), caches (`treeMaskCache`, `treePositionsCache`), `chunks`/`getChunkKey`, `TREE_MAX_RING_SLOPE`;
```
**Replace with:**
```
The worker still hand-maintains leaf helpers (`seededRandom`, `isLeafBlock`/`isLogBlock`, `getTreeMaskKey` — seed-qualified, `noise2D`), caches (`treeMaskCache`, `treePositionsCache`), `TREE_MAX_RING_SLOPE`;
```

### Worker parity note:
Docs/comments only — no code behavior. Change 1's claim (injected, no worker copy) is verified: `getBiomeCellDirect` is in the terrainFuncs injection list (~19587) and line 19073 in the worker template is now the `__TREE_FUNCS__` marker region.

### Verification:
Re-grep CLAUDE.md for `RiverNetworkCache`, `gradient-descent`, `4-ring`, `WorldPreviewNoise`, `getLocalSlope`, `isValidTreeGround` — the only remaining hits should be intentional negations ("does not exist") if any. Re-grep voxEx.html for `19073` and `4-ring` — zero stale references.

---

**Summary for the coordinator:** 10 fix specs, ~45 discrete string-match edits across voxEx.html, tools/voxex-tests.html, and CLAUDE.md. Key judgment calls made per the design brief: PAR-7 takes the documented fallback (deterministic surface predicate is infeasible because the surface block depends on in-chunk-clamped slope analysis — TER-7 — so it isn't a pure function of (gx,gz) itself); `writeFaceVertices` is KEPT (live unit tests via the seam); `getCachedFaceVertices` added to the delete set (orphaned by the addFace deletions); `isValidTreeGround` and the worker's empty `chunks`/`getChunkKey` are deleted as PAR-7 fallout; `prunePhantomNeighborLeaves`/`placeNeighborTreeLeaves` scans are left in place (self-heal old saves). All Original blocks were read verbatim from the files this session.

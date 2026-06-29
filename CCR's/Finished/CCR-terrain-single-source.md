# CCR — Terrain Single-Source (Preview/Worker Height + Biome Parity)

**ID:** VOXEX-CCR-TERRAIN-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #514, #517, #513
**Scope:** Reduce duplicated terrain math (#517), align the world-creation preview's biome algorithm with the game (#514), and remove a per-cache-miss allocation in `getBiomeCellDirect` (#513). All three live in or near the single-sourced, worker-injected terrain functions.

> Line numbers are as of build `2026-06-24.x` and **WILL DRIFT** — grep, don't trust the numbers.
> **Risk: HIGH.** Terrain functions are single-sourced on the main thread (`blendedHeight` ~37883, `getPreRiverHeight` ~38241, `getBiomeCellDirect` ~37748) and injected into the chunk worker via `Function.toString()` from the `terrainFuncs` list (~19321) between the `/* __TERRAIN_FUNCS_START__/END__ */` markers. Any new helper they call, or any module-scope symbol they reference, MUST also be injected — otherwise the worker throws `X is not defined` on first terrain call. Edit ONLY the main-thread sources.

---

## Summary

| # | Site (grep target) | Problem | Fix |
|---|--------------------|---------|-----|
| #517 | `blendedHeight`, `getPreRiverHeight` | The continentalness + domain-warp + 4-corner biome bilinear sample (~28 lines) is duplicated verbatim | Extract `sampleBiomeBilinearHeight(gx, gz, seed)`; both call it. Add it to the injection list. |
| #514 | `WorldPreviewRenderer.getBiomeForCell` (~21472) / `getHeight` (~21503) vs game `getRawBiomeParams` (~37868) / `isMountainRegion` (~37860) / `getBiomeCellDirect` (~37748) | Preview biome selection uses a different algorithm AND a different noise source than the game | **Structural port — see step list below.** Cannot be a single Before/After snippet. |
| #513 | `_FH_NEIGHBORS` (~37766) inside `getBiomeCellDirect` (~37748) | 8×2 neighbor array re-allocated on every biome-cell cache miss | Hoist to module scope AND emit it into the worker injection block (it is referenced by an injected function). |

---

### #517 — Extract the shared biome-bilinear height sample

**Location:** `blendedHeight` — line ~37883 (grep: `function blendedHeight(`); `getPreRiverHeight` — line ~38241 (grep: `function getPreRiverHeight(`)
**Why:** Lines ~37884–37911 of `blendedHeight` and ~38242–38265 of `getPreRiverHeight` are character-for-character identical (continentalness, two-octave domain warp, 4 biome-corner samples, bilinear lerp).
**Change:** Factor exactly that block into `sampleBiomeBilinearHeight(gx, gz, seed)` returning the pre-jagged, pre-ocean `finalHeight`. Both functions call it, then continue with their own (different) downstream steps. **Do NOT fold the ocean step into the helper:** `blendedHeight` inserts post-jagged detail BETWEEN the bilinear sample and the ocean step, while `getPreRiverHeight` has no post-jagged — so only the bilinear sample is safely shared. Add the helper to the `terrainFuncs` injection list.

**Context:** (verbatim from source — no need to open `voxEx.html` for the injection mechanism)

*Editing the main-thread source auto-propagates.* `blendedHeight`, `getPreRiverHeight`, `getBiomeCellDirect` are all listed in `terrainFuncs` and injected into the worker via `fn.toString()`. So defining `sampleBiomeBilinearHeight` on the main thread AND adding it to the list is sufficient — its body is stringified and concatenated into the worker between the `__TERRAIN_FUNCS_*` markers. Edit ONLY the main-thread source; never hand-edit the worker copy.

*Injection list (`terrainFuncs`, ~19321-19343).* Add `sampleBiomeBilinearHeight` here (placement irrelevant — hoisted `function` decls). `blendedHeight` and `getPreRiverHeight` are already registered:
```js
                const terrainFuncs = [
                    noise2D, noise3D, fbm2D, fbmWithDomainWarp, // VOXEX-CCR-ARCH-001: single-source upstream noise
                    continentalHeight,
                    defaultHeightFunc,
                    hillsHeightFunc,
                    plainsHeightFunc,
                    foothillsHeightFunc,
                    mountainsHeightFunc,
                    getRawBiomeParams,
                    getRawBiomeCellDirect,
                    getBiomeCellDirect,
                    getBiomeParams,
                    getBiomeHeightAtCell,
                    blendedHeight,
                    getPreRiverHeight,
                    getLocalSlope,
                    getRiverFactor,
                    getOceanFactor,
                    getRiverDepth,
                    getOceanDepth,
                    getDeltaFingerFactor,
                    isMountainRegion
                ];
```

*Who consumes the output of the two functions (so the implementer knows nothing else needs touching — only the internals change, signatures/return values are identical):*
- `blendedHeight(gx, gz, seed)` → returns `Math.floor(finalHeight)`. Callers: chunk-gen height caches (~10689, ~18845, ~38795), spawn-finding (~5339, ~5374, ~5429), and the world-creation preview (~21528-21536, the #514 site). All consume the floored ground height.
- `getPreRiverHeight(gx, gz, seed)` → returns continuous (un-floored) `finalHeight`. Callers: `getLocalSlope(gx, gz, seed, sampleDist)` at ~38287/~38292 (center + 4 cardinal neighbours, used for slope/river checks) and ~38345. `getLocalSlope` is itself in `terrainFuncs`.

**Before:** (`blendedHeight` head, ~37883–37911 — the duplicated region is the body shown here through `finalHeight = lerpValue(h0, h1, sz)`)
```js
            function blendedHeight(gx, gz, seed) {
                // 1. Get continentalness (-1 to 1)
                const c = continentalHeight(gx, gz, seed);
                // 2. Biome grid interpolation with boundary warping
                const gridScale = BIOME_CELL_SIZE;
                // Two-octave domain warping for organic biome borders
                // Must match the warping in getBiomeParams() exactly
                const warpX = noise2D(gx * 0.003 + seed * 0.13, gz * 0.003 - seed * 0.07)
                            + noise2D(gx * 0.012 + seed * 0.31, gz * 0.012 - seed * 0.17) * 0.5;
                const warpZ = noise2D(gx * 0.003 - seed * 0.19, gz * 0.003 + seed * 0.11)
                            + noise2D(gx * 0.012 - seed * 0.43, gz * 0.012 + seed * 0.29) * 0.5;
                const u = gx / gridScale - 0.5 + warpX;
                const v = gz / gridScale - 0.5 + warpZ;
                const x0 = Math.floor(u);
                const z0 = Math.floor(v);
                const x1 = x0 + 1;
                const z1 = z0 + 1;
                const wx = u - x0;
                const wz = v - z0;
                const sx = wx * wx * (3 - 2 * wx);
                const sz = wz * wz * (3 - 2 * wz);
                // 3. Sample 4 biomes and calculate heights
                const h00 = getBiomeHeightAtCell(x0, z0, gx, gz, seed, c);
                const h10 = getBiomeHeightAtCell(x1, z0, gx, gz, seed, c);
                const h01 = getBiomeHeightAtCell(x0, z1, gx, gz, seed, c);
                const h11 = getBiomeHeightAtCell(x1, z1, gx, gz, seed, c);
                const h0 = lerpValue(h00, h10, sx);
                const h1 = lerpValue(h01, h11, sx);
                let finalHeight = lerpValue(h0, h1, sz);
                // ... post-jagged (finalHeight > 90), then ocean, then river ... (unchanged) ...
```
(`getPreRiverHeight`, ~38241–38276 — the head through `finalHeight = lerpValue(h0, h1, sz)` is the SAME block, then ocean only:)
```js
            function getPreRiverHeight(gx, gz, seed) {
                const c = continentalHeight(gx, gz, seed);
                const gridScale = BIOME_CELL_SIZE;
                const warpX = noise2D(gx * 0.003 + seed * 0.13, gz * 0.003 - seed * 0.07)
                            + noise2D(gx * 0.012 + seed * 0.31, gz * 0.012 - seed * 0.17) * 0.5;
                const warpZ = noise2D(gx * 0.003 - seed * 0.19, gz * 0.003 + seed * 0.11)
                            + noise2D(gx * 0.012 - seed * 0.43, gz * 0.012 + seed * 0.29) * 0.5;
                const u = gx / gridScale - 0.5 + warpX;
                const v = gz / gridScale - 0.5 + warpZ;
                const x0 = Math.floor(u);
                const z0 = Math.floor(v);
                const x1 = x0 + 1;
                const z1 = z0 + 1;
                const wx = u - x0;
                const wz = v - z0;
                const sx = wx * wx * (3 - 2 * wx);
                const sz = wz * wz * (3 - 2 * wz);
                const h00 = getBiomeHeightAtCell(x0, z0, gx, gz, seed, c);
                const h10 = getBiomeHeightAtCell(x1, z0, gx, gz, seed, c);
                const h01 = getBiomeHeightAtCell(x0, z1, gx, gz, seed, c);
                const h11 = getBiomeHeightAtCell(x1, z1, gx, gz, seed, c);
                const h0 = lerpValue(h00, h10, sx);
                const h1 = lerpValue(h01, h11, sx);
                let finalHeight = lerpValue(h0, h1, sz);
                // ... ocean only (no post-jagged), then return finalHeight ...
```

**After:** New shared helper (copy the verbatim block once — do not retype):
```js
            // Continentalness + domain-warped 4-corner biome bilinear height sample.
            // Shared by blendedHeight() and getPreRiverHeight(); pre-jagged, pre-ocean.
            // Injected into the chunk worker (terrainFuncs list) — no external closure capture.
            function sampleBiomeBilinearHeight(gx, gz, seed) {
                const c = continentalHeight(gx, gz, seed);
                const gridScale = BIOME_CELL_SIZE;
                const warpX = noise2D(gx * 0.003 + seed * 0.13, gz * 0.003 - seed * 0.07)
                            + noise2D(gx * 0.012 + seed * 0.31, gz * 0.012 - seed * 0.17) * 0.5;
                const warpZ = noise2D(gx * 0.003 - seed * 0.19, gz * 0.003 + seed * 0.11)
                            + noise2D(gx * 0.012 - seed * 0.43, gz * 0.012 + seed * 0.29) * 0.5;
                const u = gx / gridScale - 0.5 + warpX;
                const v = gz / gridScale - 0.5 + warpZ;
                const x0 = Math.floor(u);
                const z0 = Math.floor(v);
                const x1 = x0 + 1;
                const z1 = z0 + 1;
                const wx = u - x0;
                const wz = v - z0;
                const sx = wx * wx * (3 - 2 * wx);
                const sz = wz * wz * (3 - 2 * wz);
                const h00 = getBiomeHeightAtCell(x0, z0, gx, gz, seed, c);
                const h10 = getBiomeHeightAtCell(x1, z0, gx, gz, seed, c);
                const h01 = getBiomeHeightAtCell(x0, z1, gx, gz, seed, c);
                const h11 = getBiomeHeightAtCell(x1, z1, gx, gz, seed, c);
                const h0 = lerpValue(h00, h10, sx);
                const h1 = lerpValue(h01, h11, sx);
                return lerpValue(h0, h1, sz);
            }
```
Then `blendedHeight` becomes:
```js
            function blendedHeight(gx, gz, seed) {
                let finalHeight = sampleBiomeBilinearHeight(gx, gz, seed);
                // post-blend jagged detail (unchanged, still gated by finalHeight > 90)
                // ... existing lines 37920-37929 verbatim ...
                // ocean (unchanged, existing 37931-37938)
                // river/delta (unchanged, existing 37940-37972)
                return Math.floor(finalHeight);
            }
```
And `getPreRiverHeight` becomes:
```js
            function getPreRiverHeight(gx, gz, seed) {
                let finalHeight = sampleBiomeBilinearHeight(gx, gz, seed);
                // ocean only (unchanged, existing 38267-38273)
                return finalHeight;
            }
```
**Injection:** add `sampleBiomeBilinearHeight` to the `terrainFuncs` array (~19321), placed before/with `blendedHeight` (order is irrelevant — hoisted function declarations).
**Verify:** `tools/voxex-tests.html` → terrain determinism + **live worker `blendedHeight` parity** test must stay green (this is the exact guard for value-identity). Spot-check `getLocalSlope` (calls `getPreRiverHeight`) still finite. Confirm no worker `sampleBiomeBilinearHeight is not defined` error.

---

### #513 — Hoist `_FH_NEIGHBORS` out of the per-cache-miss path

**Location:** `getBiomeCellDirect` — line ~37748 (grep: `function getBiomeCellDirect(`); offending allocation at `_FH_NEIGHBORS` ~37766.
**Why:** The 8-element neighbor array is reallocated on every biome-cell cache miss; it's a constant.
**Change:** Hoist `_FH_NEIGHBORS` to module scope. **AUDIT FLAG — injection hazard:** `getBiomeCellDirect` IS in the worker injection list (`terrainFuncs` ~19331), injected via `fn.toString()`. `Function.toString()` captures ONLY the function body, NOT module-scope constants. So a module-scope `_FH_NEIGHBORS` would be `undefined` in the worker and throw on first foothill check. It MUST also be emitted into the worker injection block (exactly like `_BIOME_CDF_TABLE` is emitted at ~19356, and like `biomeCellCache` is hand-declared worker-side at ~18750). Hoisting WITHOUT the worker emission WILL break worker terrain gen.

**Context:** (verbatim from source — the emit line to mirror)

The `_BIOME_CDF_TABLE` emission lives in `buildChunkWorkerCode`, appended to `injectedCode` near the top of the terrain-injection block (~19356). It is a `JSON.stringify` of the module-scope array, declared as a worker-local `const`. The `_FH_NEIGHBORS` emission must mirror this exact pattern:
```js
                // Inject biome CDF table + uniform roll (used by getRawBiomeParams).
                // Done here so main is the single source of truth for the empirical CDF.
                injectedCode += '    const _BIOME_CDF_TABLE = ' + JSON.stringify(_BIOME_CDF_TABLE) + ';\n';
                injectedCode += '    ' + uniformBiomeRoll.toString() + '\n\n';
```
Add (alongside the above): `injectedCode += '    const _FH_NEIGHBORS = ' + JSON.stringify(_FH_NEIGHBORS) + ';\n';`

*Collision check (verified):* `_FH_NEIGHBORS` currently appears ONLY as the local `const` declaration at ~37766 and its single use at ~37772 inside `getBiomeCellDirect`. No other declaration exists, so hoisting to module scope is collision-free. The module-scope home `_BIOME_CDF_TABLE` (~37832) is a good neighbour to place it by.

**Before:** (inside `getBiomeCellDirect`, ~37766–37772)
```js
                const MAX_FOOTHILL_RINGS = 1;
                let nearestMountainRing = Infinity;
                const _FH_NEIGHBORS = [
                    [-1,-1], [0,-1], [1,-1],
                    [-1, 0],         [1, 0],
                    [-1, 1], [0, 1], [1, 1]
                ];
                for (let i = 0; i < 8; i++) {
                    const dx = _FH_NEIGHBORS[i][0], dz = _FH_NEIGHBORS[i][1];
```
**After:** Module-scope constant near the other terrain tables (e.g. by `_BIOME_CDF_TABLE` ~37832):
```js
            // Foothill 8-neighbour offsets (Moore neighbourhood, no centre).
            // Module-scope so it is allocated once; emitted into the chunk worker
            // by buildChunkWorkerCode() — getBiomeCellDirect references it after injection.
            const _FH_NEIGHBORS = [
                [-1,-1], [0,-1], [1,-1],
                [-1, 0],         [1, 0],
                [-1, 1], [0, 1], [1, 1]
            ];
```
And inside `getBiomeCellDirect`, drop the local declaration (keep the loop):
```js
                const MAX_FOOTHILL_RINGS = 1;
                let nearestMountainRing = Infinity;
                for (let i = 0; i < 8; i++) {
                    const dx = _FH_NEIGHBORS[i][0], dz = _FH_NEIGHBORS[i][1];
```
**Worker emission (REQUIRED):** in `buildChunkWorkerCode`, alongside the existing `injectedCode += '    const _BIOME_CDF_TABLE = ' + JSON.stringify(_BIOME_CDF_TABLE) + ';\n';` (~19356), add:
```js
                injectedCode += '    const _FH_NEIGHBORS = ' + JSON.stringify(_FH_NEIGHBORS) + ';\n';
```
**Verify:** `tools/voxex-tests.html` → worker `blendedHeight`/terrain parity (a missing worker `_FH_NEIGHBORS` would surface as a worker error or foothill mismatch). Confirm foothill rings still render around mountain ranges (visual, mountain-seed).

---

### #514 — Align world-creation preview biome algorithm with the game

**Location:** `WorldPreviewRenderer.getBiomeForCell` — line ~21472 (grep: `getBiomeForCell(cellX, cellZ`); `WorldPreviewRenderer.getHeight` ~21503; `WorldPreviewNoise` ~21331. Game side: `getRawBiomeParams` ~37868, `isMountainRegion` ~37860, `uniformBiomeRoll` ~37840, `getBiomeCellDirect` ~37748.
**Why:** The preview shown during world creation does not match the world that gets generated.

**Context:** (root-blocker noise entry points, verbatim — so the implementer sees WHY a snippet swap can't work, without re-deriving it)

The preview and game use *physically different* Perlin permutation tables and seeding paths, so identical formulas still produce different noise. This is the single fact that makes #514 a structural port:

- **Game noise** — module-level `noise2D(x, y)` (~20990) reads the GLOBAL `perm` table and a `fadeFast` LUT:
```js
            function noise2D(x, y) {
                const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
                x -= Math.floor(x);
                y -= Math.floor(y);
                const u = fadeFast(x), v = fadeFast(y); // OPTIMIZATION: Use LUT instead of polynomial
                const A = perm[X] + Y, B = perm[X + 1] + Y;
                return lerp(v, lerp(u, grad(perm[A], x, y), grad(perm[B], x - 1, y)), lerp(u, ...));
            }
```
  `perm` is filled by `seedMainThreadNoise(rng)` (~21048) from a `SeededRandom` (the test seam calls it via `seedNoise()` at ~24948 / ~46356). All injected terrain functions ride on this global `perm`.

- **Preview noise** — `WorldPreviewNoise` class (~21331), method `noise2D(x, y)` (~21372) uses an INSTANCE `this.permutation` (LCG-shuffled in the ctor) and a polynomial `this.fade(...)`:
```js
                noise2D(x, y) {
                    const X = Math.floor(x) & 255;
                    const Y = Math.floor(y) & 255;
                    x -= Math.floor(x);
                    y -= Math.floor(y);
                    const u = this.fade(x);
                    const v = this.fade(y);
                    const p = this.permutation;
                    ...
                }
```
  Instantiated as `this.noise = new WorldPreviewNoise(seed)` (~21444).

Because the permutation tables AND the seed→table mapping differ, the same `(gx, gz)` yields different noise in each — biome/height parity is impossible until the preview consumes the game's `noise2D` + `perm` + `seedMainThreadNoise(SeededRandom(...))` path. This is the root blocker behind divergences (1)-(5) below; approach (A) below resolves it by pointing the preview at the game's noise.

**AUDIT FLAG — too large for one Before/After snippet; this is a structural port, not a code swap.** Documented divergences (verified against source):

1. **Different noise source (root blocker).** `WorldPreviewNoise.noise2D` (~21372) uses an LCG-shuffled `this.permutation` + polynomial `fade`. The game's `noise2D` (~20990) uses the global `perm` table seeded by `seedMainThreadNoise(rng)` (~21048) via `SeededRandom`, with a `fadeFast` LUT. **Different permutation + different seed mapping ⇒ different noise values for the same coords**, even with identical formulas. Biome parity is impossible until the preview consumes the game's noise+seeding.

2. **Mountains: per-cell roll vs region mask.** Preview `getBiomeForCell` (~21472) rolls mountains per cell inside one weighted list (scattered peaks). Game places mountains via `isMountainRegion` (~37860) — a low-frequency, domain-warped REGION MASK applied FIRST in `getRawBiomeParams` (~37869), so ranges cluster. The other 5 biomes are then rolled separately.

3. **No CDF calibration.** Preview uses raw `t = (noiseVal + 1) * 0.5`. Game remaps the roll through the empirical `_BIOME_CDF_TABLE` via `uniformBiomeRoll` (~37840) so configured weights are actually respected under the real noise distribution.

4. **No foothills.** Preview has no equivalent of `getBiomeCellDirect`'s foothill-ring conversion (~37780). Game produces a `mountain_foothills` transition biome with a `_ringFactor`.

5. **Coordinate/frequency basis differs.** Preview rolls on `noise2D(cellX * (0.1/biomeSizeMult), …)` (cell-index space). Game rolls on `noise2D(gx * biomeFrequency, …)` (world space).

6. **Stale height steps in preview `getHeight`.** Preview keeps "mountain peak preservation" (~21529–21533) that `blendedHeight` explicitly REMOVED (see tombstone comment ~37913–37915), and gates post-jagged on `avgCornerHeight` (~21537) while the game gates on post-bilinear `finalHeight` (comment ~37918–37919 — avgCornerHeight jumps when the cell window slides).

**Game-side key snippet (the algorithm to match):**
```js
            function getRawBiomeParams(gx, gz) {
                if (isMountainRegion(gx, gz)) return biomeByName.get('mountains');
                const { seed, biomeFrequency } = worldConfig;
                const noiseVal = noise2D(gx * biomeFrequency + seed * 0.37, gz * biomeFrequency - seed * 0.71);
                const t = uniformBiomeRoll(noiseVal);
                const target = t * biomeTable.totalWeight;
                let selectedBiome = biomeTable.cumulative[0].biome;
                for (let i = 0; i < biomeTable.cumulative.length; i++) {
                    if (target <= biomeTable.cumulative[i].threshold) { selectedBiome = biomeTable.cumulative[i].biome; break; }
                }
                return selectedBiome;
            }
```
**Preview-side divergent snippet (what to replace):**
```js
                getBiomeForCell(cellX, cellZ, biomeSizeMult = 1.0) {
                    const freq = 0.1 / biomeSizeMult;
                    const noiseVal = this.noise.noise2D(cellX * freq + 1000, cellZ * freq + 1000);
                    const t = (noiseVal + 1) * 0.5;
                    const biomes = [ /* hardcoded 6-biome list incl. mountains */ ];
                    const totalWeight = 10;
                    const target = t * totalWeight;
                    let accumulated = 0;
                    for (const biome of biomes) { accumulated += biome.weight; if (target <= accumulated) return biome; }
                    return biomes[0];
                }
```

**Approach (step list — do NOT fabricate a full rewrite):**
1. **Decide the parity bar with the maintainer.** Two options:
   - **(A) True parity (recommended):** Make the preview consume the GAME's noise + biome functions. Replace `WorldPreviewNoise` usage with the game's `noise2D`/`perm`, seed it via the same `SeededRandom`→`seedMainThreadNoise` path for the preview seed, then call the real `isMountainRegion` + `getRawBiomeParams` (and optionally `getBiomeCellDirect` for foothills). These functions reference module-scope `worldConfig`, `biomeByName`, `biomeTable`, `_BIOME_CDF_TABLE`, `biomeCellCache` — all already on the main thread, so the preview (also main thread) can call them directly once it points at the same seed/noise. This eliminates the duplicated preview biome math entirely.
   - **(B) Faithful port (if A is too invasive):** Port `isMountainRegion`, `uniformBiomeRoll` + `_BIOME_CDF_TABLE`, and the region-mask-first ordering into `WorldPreviewRenderer`, AND switch `WorldPreviewNoise` to reproduce the game's `perm` seeding. Without the noise change, (B) still won't match.
2. Remove the stale "mountain peak preservation" block (~21529–21533) and switch the post-jagged gate to post-bilinear `finalHeight` (mirror `blendedHeight` ~37918–37929) so preview height matches.
3. **Match `tools/terrain-visualizer.html`** (CLAUDE.md parity rule) — it carries extracted copies of the same biome/height functions and must move in lockstep.
4. Keep it scoped to the preview/visualizer — the GAME is the source of truth; do not change generation.

**Verify:** Render the preview for ≥4 seeds, generate each world, and overlay/compare biome placement (mountain ranges clustered, foothill rings present, no scattered peaks) and coastal/river shape. `terrain-visualizer.html` for the same seeds must match both. No automated test asserts preview↔game parity today — this is a visual comparison; consider adding a sampling test if going with approach (A).

---

## Safety Checks
- [ ] Edited ONLY main-thread terrain sources; `/* __TERRAIN_FUNCS__ */` and `/* __TREE_FUNCS__ */` markers intact.
- [ ] `sampleBiomeBilinearHeight` (#517) added to `terrainFuncs` injection list; worker `blendedHeight` parity + terrain determinism tests green.
- [ ] `_FH_NEIGHBORS` (#513) hoisted AND emitted into the worker injection block (`injectedCode += … _FH_NEIGHBORS …`) — no worker `_FH_NEIGHBORS is not defined`.
- [ ] No external closure capture in any injected terrain fn (`sampleBiomeBilinearHeight`, `getBiomeCellDirect`) — `Function.toString()` injection stays valid.
- [ ] #517 is value-identical (parity test guards it); #514 changes the preview only (intended); generation unchanged.
- [ ] `WorldPreviewRenderer` and `tools/terrain-visualizer.html` match game output for the sampled seeds.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

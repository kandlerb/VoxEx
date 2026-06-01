# Mountain-Range Clustering + Biome Recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place mountains via a low-frequency, domain-warped region mask (coherent ranges instead of scattered single cells), remove mountains from the per-cell weighted biome roll, and recalibrate the biome CDF for the corrected isotropic noise — eliminating the plains/foothill notches amid mountains and restoring configured biome proportions.

**Architecture:** A new `isMountainRegion(gx,gz)` mask gates mountain placement in `getRawBiomeParams`; the weighted roll then distributes only the 5 non-mountain biomes. The chunk worker mirrors this via `Function.toString()` injection plus two baked constants. The biome CDF table is regenerated against the fixed noise. `mountainsHeightFunc` (already re-tuned) and the `& 15` isotropy mask (already applied) are unchanged.

**Tech Stack:** Plain browser JS (no build). Verification: Node 24 + cached Playwright chromium-headless-shell over CDP, via the temp scripts from the predecessor plan (`voxex-server.cjs`, `cdp-run.cjs`, `cdp-eval.cjs`) plus the diagnostic `.cjs` scripts created during investigation (`biome-frag.cjs`, `diagnose-pocket.cjs`, `raw-biome-dist.cjs` in `%TEMP%`). A static server on :8080 serving `D:/Projects/voxex` is assumed running (controller-owned). Nothing in temp is committed.

**Design spec:** `docs/superpowers/specs/2026-06-01-mountain-range-clustering-biome-recalibration-design.md`

**Branch:** `noise-isotropy-mountain-retune` (continues; the `& 15` mask + mountain re-tune commits are already here).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `voxEx.html` | Add `isMountainRegion` + 2 constants near the biome functions (~36230); gate `getRawBiomeParams` (36236); exclude `mountains` from `rebuildBiomeTable` (36022); update `buildChunkWorkerCode` (20009 list + 20050 table string + inject constants); recalibrate `_BIOME_CDF_TABLE` (36216); add `isMountainRegion` to the `?test=1` seam (42250). | Modify only these regions. |
| `tools/voxex-tests.html` | Add range-coherence metrics (region map sampling, cluster sizes, notch count, biome distribution) to the Mountain Tuning panel; add a range/notch/biome gate suite. | Modify (additive). |
| `docs/superpowers/plans/2026-06-01-mountain-range-clustering-biome-recalibration.md` | This plan; records tuned constants + measurements. | Modify. |
| `docs/superpowers/plans/2026-05-29-voxex-test-coverage.md` | Findings log (finding #14 follow-up). | Modify (Task 7). |
| `%TEMP%/*.cjs` | Headless tooling (already present from prior work). | Reuse; recreate if absent (see predecessor plan Task 0). |

**Triage policy:** the region mask, table, CDF, and worker injection are exact. Tuning the two constants is empirical. Do NOT change `mountainsHeightFunc`, the `& 15` mask, `blendedHeight`, `foothillsHeightFunc`, or river/ocean logic. If gates can't be met by tuning the constants + CDF, STOP and report.

**Pre-req check (Task 0):** confirm server + scripts. Run:
```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/voxEx.html?test=1" "typeof window.VoxEx"
```
Expected `"object"`. If the server/scripts are missing, recreate them per the predecessor plan's Task 0 and start the server.

---

## Task 1: Add the mountain-region mask (main thread)

**Files:**
- Modify: `voxEx.html` — add mask + constants before `getRawBiomeParams` (~36236); gate `getRawBiomeParams`; exclude mountains from `rebuildBiomeTable` (36022); add seam export (~42250).

- [ ] **Step 1: Add constants + `isMountainRegion` immediately above `getRawBiomeParams`**

Find the line `function getRawBiomeParams(gx, gz) {` (≈36236). Insert directly above it:

```js
            // Mountains are placed by a low-frequency, domain-warped REGION MASK
            // (not the per-cell weighted roll) so mountain cells cluster into
            // coherent ranges. Constants tuned in Task 5; also baked into the
            // chunk worker by buildChunkWorkerCode().
            const MOUNTAIN_REGION_FREQ = 0.0015;
            // noise2D at this frequency ranges ~[-0.79, 0.81] (p90 ≈ 0.34); a threshold
            // of ~0.34 yields ~10% coverage. (0.6 would yield <1% — verified.) Tuned in Task 5.
            const MOUNTAIN_REGION_THRESHOLD = 0.34;
            function isMountainRegion(gx, gz) {
                const seed = worldConfig.seed;
                const wx = noise2D(gx * 0.002 + seed * 5, gz * 0.002) * 60;
                const wz = noise2D(gx * 0.002 + 100, gz * 0.002 + seed * 5) * 60;
                const m = noise2D((gx + wx) * MOUNTAIN_REGION_FREQ + seed * 0.9,
                                  (gz + wz) * MOUNTAIN_REGION_FREQ - seed * 0.4);
                return m > MOUNTAIN_REGION_THRESHOLD;
            }
```

- [ ] **Step 2: Gate `getRawBiomeParams` with the mask**

Change the body of `getRawBiomeParams` (36236) so its first statement is the mask check:
```js
            function getRawBiomeParams(gx, gz) {
                if (isMountainRegion(gx, gz)) return biomeByName.get('mountains');
                const { seed, biomeFrequency } = worldConfig;
                const noiseVal = noise2D(gx * biomeFrequency + seed * 0.37, gz * biomeFrequency - seed * 0.71);
                const t = uniformBiomeRoll(noiseVal);
                const target = t * biomeTable.totalWeight;
                let selectedBiome = biomeTable.cumulative[0].biome;
                for (let i = 0; i < biomeTable.cumulative.length; i++) {
                    if (target <= biomeTable.cumulative[i].threshold) {
                        selectedBiome = biomeTable.cumulative[i].biome;
                        break;
                    }
                }
                return selectedBiome;
            }
```
(Only the `if (isMountainRegion…)` line is added; the rest is unchanged.)

- [ ] **Step 3: Exclude `mountains` from the weighted table in `rebuildBiomeTable`**

In `rebuildBiomeTable` (≈36022) change the skip condition:
```js
                for (const b of biomes) {
                    if (b.name === 'mountain_foothills' || b.name === 'mountains') continue;
                    total += b.weight;
                    cumulative.push({ biome: b, threshold: total });
                }
```

- [ ] **Step 4: Export `isMountainRegion` on the `?test=1` seam**

In the `window.VoxEx = {` block (≈42250), add `isMountainRegion,` to the `// --- terrain / biome ---` group (next to `getBiomeCellDirect,`).

- [ ] **Step 5: Verify main-thread clustering (headless)**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/voxEx.html?test=1" "(function(){const V=window.VoxEx;V.seedNoise('ridgetest');V.biomeCellCache.clear();const R=48;let g=[];for(let cz=0;cz<R;cz++){let row=[];for(let cx=0;cx<R;cx++)row.push(V.getBiomeCellDirect(cx,cz).name==='mountains'?1:0);g.push(row);}let xr=[];for(let z=0;z<R;z++){let run=0;for(let x=0;x<R;x++){if(g[z][x])run++;else{if(run)xr.push(run);run=0;}}if(run)xr.push(run);}let m=0;for(let z=0;z<R;z++)for(let x=0;x<R;x++)m+=g[z][x];return JSON.stringify({mtnPct:+(m/(R*R)*100).toFixed(1),avgXrun:+(xr.reduce((a,b)=>a+b,0)/(xr.length||1)).toFixed(2),maxRun:Math.max(0,...xr)});})()"
```
Expected: `mtnPct` nonzero, `avgXrun` clearly > 1 and `maxRun` ≥ 3 (mountains now form multi-cell runs, not scattered singles). Exact prevalence is tuned in Task 5; here we just confirm clustering works and no error.

- [ ] **Step 6: Confirm the game still boots (no console error)**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/voxEx.html?test=1" "typeof window.VoxEx.isMountainRegion + ',' + (typeof window.VoxEx.getRawBiomeCellDirect==='undefined')"
```
Expected: starts with `function`. (No `ReferenceError` thrown during load.)

- [ ] **Step 7: Commit**
```bash
git add voxEx.html
git commit -m "Place mountains via low-freq region mask; remove from weighted roll (main thread)"
```

---

## Task 2: Mirror the mask in the chunk worker (parity)

**Files:**
- Modify: `voxEx.html` — `buildChunkWorkerCode()` (≈20006): add `isMountainRegion` to the injected functions, bake the two constants, exclude `mountains` from the worker's `biomeTable` string.

- [ ] **Step 1: Add `isMountainRegion` to the injected `terrainFuncs` list**

In the `terrainFuncs` array (≈20009–20025), add `isMountainRegion,` (place it right before `getRawBiomeParams,` so it is defined before the function that calls it — though declaration order inside the worker doesn't matter for hoisted `function` declarations, keep it adjacent for clarity):
```js
                    getRiverFactor,
                    getOceanFactor,
                    getRiverDepth,
                    getOceanDepth,
                    getDeltaFingerFactor,
                    isMountainRegion
                ];
```
(Append `isMountainRegion` as the last entry — order within the loop is fine since it is a hoisted function declaration.)

- [ ] **Step 2: Bake the two constants into the worker**

Immediately after the `worldConfig` injection line (≈20051, the `const worldConfig = { get seed()…` line), add:
```js
                injectedCode += '    const MOUNTAIN_REGION_FREQ = ' + JSON.stringify(MOUNTAIN_REGION_FREQ) + ';\n';
                injectedCode += '    const MOUNTAIN_REGION_THRESHOLD = ' + JSON.stringify(MOUNTAIN_REGION_THRESHOLD) + ';\n\n';
```

- [ ] **Step 3: Exclude `mountains` from the worker's `biomeTable` string**

In the worker `biomeTable` injection line (≈20050) change the skip condition to match the main thread:
```js
                injectedCode += '    let biomeTable; (function(){ let total = 0; const cumulative = []; for (const b of __biomes) { if (b.name === "mountain_foothills" || b.name === "mountains") continue; total += b.weight; cumulative.push({ biome: b, threshold: total }); } biomeTable = { cumulative, totalWeight: total }; })();\n';
```

- [ ] **Step 4: Run the full suite — worker↔main parity must stay green**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#summary .summary" 60000
```
Expected: `193/193 tests passed - All green!` `=== FAILURES === (none)`. The Tier-4 worker round-trip test proves the worker now generates identical biomes/heights to main (mask + table + constants injected correctly). If parity fails: the worker is missing `isMountainRegion`, a constant, or the table skip — re-diff Steps 1–3.

- [ ] **Step 5: Commit**
```bash
git add voxEx.html
git commit -m "Inject mountain-region mask + constants into chunk worker (parity)"
```

---

## Task 3: Add range-coherence metrics to the harness

**Files:**
- Modify: `tools/voxex-tests.html` — add a `renderRangeMetrics()` to the Mountain Tuning panel and a `rangeMetrics()` helper (real code via the seam). Reporting only (gate added in Task 6).

- [ ] **Step 1: Add the `rangeMetrics` helper**

Add near `mountainMetrics` (added in the predecessor plan). It classifies a grid of cells, measures mountain prevalence, cluster sizes, and the notch count (high→y64→high pockets inside mountain country):

```js
function rangeMetrics(seedStr, R = 64) {
    const { getBiomeCellDirect, blendedHeight, seedNoise, biomeCellCache, BIOME_CELL_SIZE } = VoxEx;
    seedNoise(seedStr); const sd = VoxEx.worldSeed; biomeCellCache.clear();
    const g = [];
    for (let cz = 0; cz < R; cz++) { const row = []; for (let cx = 0; cx < R; cx++) row.push(getBiomeCellDirect(cx, cz).name); g.push(row); }
    let mtn = 0; for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) if (g[z][x] === 'mountains') mtn++;
    // cluster sizes via flood fill (4-connected)
    const seen = Array.from({ length: R }, () => new Array(R).fill(false));
    const sizes = [];
    for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) {
        if (g[z][x] === 'mountains' && !seen[z][x]) {
            let n = 0; const st = [[x, z]]; seen[z][x] = true;
            while (st.length) { const [cx, cz] = st.pop(); n++; for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx+dx, nz = cz+dz; if (nx>=0&&nz>=0&&nx<R&&nz<R&&g[nz][nx]==='mountains'&&!seen[nz][nx]) { seen[nz][nx]=true; st.push([nx,nz]); } } }
            sizes.push(n);
        }
    }
    sizes.sort((a, b) => a - b);
    const median = sizes.length ? sizes[Math.floor(sizes.length/2)] : 0;
    // notch count: scan transects, count high(>150)->low(<78 within 160 of a high)->high(within 160)
    let notches = 0;
    for (let f = 0; f < R*BIOME_CELL_SIZE; f += 96) {
        for (let axis = 0; axis < 2; axis++) {
            let prevHi = -1;
            for (let t = 0; t < 3000; t += 4) {
                const gx = axis === 0 ? t : f, gz = axis === 0 ? f : t;
                const h = blendedHeight(gx, gz, sd);
                if (h > 150) prevHi = t;
                else if (h < 78 && prevHi >= 0 && (t - prevHi) < 160) {
                    let ahead = false; for (let u = t; u < t+160; u += 4) { const gx2 = axis===0?u:f, gz2 = axis===0?f:u; if (blendedHeight(gx2,gz2,sd) > 150) { ahead = true; break; } }
                    if (ahead) { notches++; prevHi = -1; }
                }
            }
        }
    }
    return { seed: seedStr, mtnPct: +(mtn/(R*R)*100).toFixed(1), clusters: sizes.length, medianCluster: median, maxCluster: sizes[sizes.length-1] || 0, notches };
}
window.rangeMetrics = rangeMetrics;
```

- [ ] **Step 2: Render it in the Mountain Tuning panel**

In `renderMountainTuning()` (added by the predecessor plan), after the existing metrics `<pre>`, append range metrics:
```js
    const rpre = document.createElement('pre');
    rpre.style.cssText = 'background:#1a1a1a;color:#fd8;padding:10px;border-radius:6px;font-size:12px;overflow:auto;margin-top:8px';
    rpre.textContent = '— Range coherence —\n' + ["alpha","bravo","12345","test_seed_42","ridgetest"].map(s => {
        const m = rangeMetrics(s);
        return `${s.padEnd(14)} mtn=${m.mtnPct}%  clusters=${m.clusters} medianSize=${m.medianCluster} maxSize=${m.maxCluster}  notches=${m.notches}`;
    }).join('\n');
    panel.appendChild(rpre);
```

- [ ] **Step 3: Render a top-down mountain-region map (one seed)**

Append to `renderMountainTuning()`:
```js
    (function(){
        const { isMountainRegion, seedNoise, BIOME_CELL_SIZE } = VoxEx; seedNoise("ridgetest"); const sd = VoxEx.worldSeed;
        const R = 96, c = document.createElement('canvas'); c.width = R; c.height = R; c.style.cssText = 'image-rendering:pixelated;width:'+(R*3)+'px;height:'+(R*3)+'px;border:1px solid #444;margin-top:8px';
        const g = c.getContext('2d'); const img = g.createImageData(R, R);
        for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) { const on = isMountainRegion(x*BIOME_CELL_SIZE+32, z*BIOME_CELL_SIZE+32); const i = (z*R+x)*4; img.data[i]=on?150:30; img.data[i+1]=on?150:60; img.data[i+2]=on?150:30; img.data[i+3]=255; }
        g.putImageData(img, 0, 0);
        const lbl = document.createElement('div'); lbl.style.cssText='color:#aaa;font-size:11px'; lbl.textContent='Mountain regions (ridgetest, 96×96 cells)';
        panel.appendChild(lbl); panel.appendChild(c);
    })();
```

- [ ] **Step 4: Run the suite + capture pre-tune range numbers**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#mountain-tuning-panel pre" 50000
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/tools/voxex-tests.html" "new Promise(r=>{const t=setInterval(()=>{if(window.rangeMetrics){clearInterval(t);r(['alpha','bravo','12345','test_seed_42','ridgetest'].map(s=>window.rangeMetrics(s)));}},300);})"
```
Expected: suite still 193/193; range metrics return finite numbers (mtnPct, medianCluster ≥ ~2 already from Task 1's default constants, notches likely reduced vs the scattered baseline). Record these under `### Range metrics (pre-tune)` in this plan.

- [ ] **Step 5: Commit**
```bash
git add tools/voxex-tests.html docs/superpowers/plans/2026-06-01-mountain-range-clustering-biome-recalibration.md
git commit -m "Add range-coherence metrics (cluster size, notch count, region map) to harness"
```

---

## Task 4: Recalibrate the biome CDF for the corrected noise

**Files:**
- Modify: `voxEx.html` — replace `_BIOME_CDF_TABLE` (≈36216) with a table regenerated against the fixed `noise2D`. (Worker gets it automatically via `JSON.stringify`.)

- [ ] **Step 1: Generate the new CDF table headlessly**

The table maps biome-selection noise `n=(noise2D(...)+1)/2` to a uniform percentile. Sample the real noise at `biomeFrequency` over many points/seeds, then output the noise value at each target percentile.

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/voxEx.html?test=1" "(function(){const V=window.VoxEx;const BF=0.5;const vals=[];const seeds=['alpha','bravo','12345','test_seed_42','ridgetest','zeta','omega','delta'];for(const s of seeds){V.seedNoise(s);const sd=V.worldSeed;for(let cz=0;cz<200;cz++)for(let cx=0;cx<200;cx++){const gx=cx*64+32,gz=cz*64+32;const nv=V.noise2D(gx*BF+sd*0.37,gz*BF-sd*0.71);vals.push((nv+1)*0.5);}}vals.sort((a,b)=>a-b);const ps=[0,0.01,0.05,0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.45,0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.90,0.95,0.99,1.0];const tbl=ps.map(p=>{const idx=Math.min(vals.length-1,Math.floor(p*(vals.length-1)));return [+vals[idx].toFixed(4),p];});return JSON.stringify(tbl);})()"
```
This prints the new `[noiseValue, percentile]` table. (Sampling at cell centers with `BF=0.5` matches how the selection noise is actually sampled.)

- [ ] **Step 2: Replace `_BIOME_CDF_TABLE`**

Replace the array literal at `voxEx.html:36216` (`const _BIOME_CDF_TABLE = [ … ];`) with the regenerated rows from Step 1, formatted the same way. Update the preceding comment to note it was recalibrated for the isotropic noise on 2026-06-01 (replacing the `_debug_noise2.js`/old-noise table).

- [ ] **Step 3: Verify the non-mountain biome distribution matches weights**

Re-run the raw-distribution probe (it replicates the roll using the *new* table — update the CDF array inside it to match Step 1, or measure the resolved cells directly). Simplest: measure resolved non-mountain cells via the seam:
```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/voxEx.html?test=1" "(function(){const V=window.VoxEx;const seeds=['alpha','bravo','12345','test_seed_42','ridgetest','zeta','omega'];const c={};let tot=0;for(const s of seeds){V.seedNoise(s);V.biomeCellCache.clear();const sd=V.worldSeed;for(let cz=0;cz<140;cz++)for(let cx=0;cx<140;cx++){const n=V.getBiomeCellDirect(cx,cz).name;if(n==='mountains'||n==='mountain_foothills')continue;c[n]=(c[n]||0)+1;tot++;}}const p={};for(const k in c)p[k]=+(c[k]/tot*100).toFixed(1);return JSON.stringify({nonMountainPct:p,target:{plains:22.2,hills:22.2,forests:22.2,swamp:11.1,longwoods:22.2}});})()"
```
Expected: `plains/hills/forests/longwoods` each near **22%**, `swamp` near **11%** (the 2/2/2/1/2 split of total weight 9), within ±5 points. If forests are still far under, the CDF didn't flatten correctly — re-check Step 1's sampling matches `getRawBiomeParams` exactly.

- [ ] **Step 4: Suite stays green (worker gets the new table automatically)**
```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#summary .summary" 60000
```
Expected: 193/193 green.

- [ ] **Step 5: Commit**
```bash
git add voxEx.html
git commit -m "Recalibrate biome CDF table for corrected isotropic noise (5 non-mountain biomes)"
```

---

## Task 5: Tune the region constants (prevalence + range size + notches)

**Files:**
- Modify: `voxEx.html` — `MOUNTAIN_REGION_FREQ`, `MOUNTAIN_REGION_THRESHOLD` (the two constants from Task 1). ONLY these.

This is the empirical loop. After each change, re-measure with the Task 4 Step 3 command and the range-metrics command (Task 3 Step 4). Targets (from the spec's acceptance gates):
- mountain prevalence ~[8%,13%] across seeds → `MOUNTAIN_REGION_THRESHOLD` (raise to reduce %, lower to increase). Starts at 0.34 (~10%); the usable band is roughly 0.25 (≈17%) to 0.45 (≈5%).
- median cluster size ≥ 3 cells → `MOUNTAIN_REGION_FREQ` (lower freq = bigger ranges = larger clusters).
- notch count inside mountain regions ≈ 0 (≥90% below the scattered baseline).

- [ ] **Step 1: Measure with default constants (FREQ 0.0015 / THRESHOLD 0.34)**
```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/tools/voxex-tests.html" "new Promise(r=>{const t=setInterval(()=>{if(window.rangeMetrics){clearInterval(t);r(['alpha','bravo','12345','test_seed_42','ridgetest'].map(s=>window.rangeMetrics(s)));}},300);})"
```
Note mtnPct, medianCluster, notches per seed.

- [ ] **Step 2: Adjust `MOUNTAIN_REGION_THRESHOLD` for ~10% prevalence**

If mean mtnPct is too high/low, edit the constant (`voxEx.html` Task-1 location) — higher threshold → fewer mountains. Re-measure. Iterate until mean prevalence ≈ 8–13%.

- [ ] **Step 3: Adjust `MOUNTAIN_REGION_FREQ` for range size**

If medianCluster < 3, lower `MOUNTAIN_REGION_FREQ` (e.g., 0.0015 → 0.001) to enlarge ranges; re-measure. Larger ranges raise prevalence too, so re-check Step 2 (tune the pair together). Iterate until medianCluster ≥ 3 AND prevalence in range.

- [ ] **Step 4: Confirm notches collapsed**

With coherent ranges, `notches` per seed should be ≈ 0 (or ≥90% below the scattered baseline recorded in Task 3 Step 4). If notches persist, inspect with the pocket diagnostic to see whether residual pockets are perimeter foothills (acceptable apron) or interior (investigate):
```bash
node /c/Users/kandl/AppData/Local/Temp/diagnose-pocket.cjs "http://localhost:8080/voxEx.html?test=1" "ridgetest" 9237
```

- [ ] **Step 5: Confirm the mountain isotropy gate still holds**
```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/voxEx.html?test=1" "new Promise(r=>{const t=setInterval(()=>{if(window.mountainMetrics){clearInterval(t);r(['alpha','test_seed_42','ridgetest'].map(s=>window.mountainMetrics(s)));}},300);})"
```
Expected: asymmetry ≈ 1, mean step ≤ old-X ceiling (1.378), p99 ≤ 6 — the re-tune is unaffected by the placement change.

- [ ] **Step 6: Record converged constants + metrics in this plan, then CHECKPOINT with the user**

Record the final `MOUNTAIN_REGION_FREQ`/`THRESHOLD` and the range metrics under `### Tuned constants (final)`. Open the harness + game in the user's browser:
```bash
cmd.exe /c start "" "http://localhost:8080/tools/voxex-tests.html"
cmd.exe /c start "" "http://localhost:8080/voxEx.html"
```
Present the region map + metrics. Do NOT lock the gate (Task 6) until the user confirms ranges look believable and (on a NEW world) the notches are gone.

- [ ] **Step 7: Commit**
```bash
git add voxEx.html docs/superpowers/plans/2026-06-01-mountain-range-clustering-biome-recalibration.md
git commit -m "Tune mountain-region mask constants (prevalence ~10%, coherent ranges, notches eliminated)"
```

---

## Task 6: Lock gates + full validation + in-game sign-off

**Files:**
- Modify: `tools/voxex-tests.html` — add a range/notch/biome gate suite.

- [ ] **Step 1: Add the gate suite** (use the converged numbers from Task 5; constants below are concrete values recorded in this plan, not placeholders)

Insert inside `runAllTests`:
```js
    await describe("mountains: isotropy preserved (re-tune gate)", () => {
        // Locks the mountain re-tune from the predecessor plan. OLD_X_CEILING = 1.378,
        // OLD_X_P99_CEILING = 6 (recorded in 2026-05-29-noise-isotropy-mountain-retune.md, Task 2).
        const OLD_X_CEILING = 1.378, OLD_X_P99_CEILING = 6;
        const seeds = ["alpha", "bravo", "12345", "test_seed_42", "ridgetest"];
        it("X/Z step asymmetry within [0.7,1.4]", () => {
            for (const s of seeds) { const m = mountainMetrics(s); expect(m.asymmetry).toBeGreaterThan(0.7); expect(m.asymmetry).toBeLessThan(1.4); }
        });
        it("both axes mean step <= old-X ceiling", () => {
            for (const s of seeds) { const m = mountainMetrics(s); expect(m.xStep.mean).toBeLessThanOrEqual(OLD_X_CEILING); expect(m.zStep.mean).toBeLessThanOrEqual(OLD_X_CEILING); }
        });
        it("both axes p99 step <= old-X p99 ceiling", () => {
            for (const s of seeds) { const m = mountainMetrics(s); expect(m.xStep.p99).toBeLessThanOrEqual(OLD_X_P99_CEILING); expect(m.zStep.p99).toBeLessThanOrEqual(OLD_X_P99_CEILING); }
        });
    });

    await describe("biome: mountain ranges + distribution (post-restructure)", () => {
        const seeds = ["alpha", "bravo", "12345", "test_seed_42", "ridgetest"];
        it("mountain prevalence in [8%,13%]", () => {
            for (const s of seeds) { const m = rangeMetrics(s); expect(m.mtnPct).toBeGreaterThanOrEqual(8); expect(m.mtnPct).toBeLessThanOrEqual(13); }
        });
        it("mountains cluster into ranges (median cluster >= 3)", () => {
            for (const s of seeds) { const m = rangeMetrics(s); if (m.clusters > 0) expect(m.medianCluster).toBeGreaterThanOrEqual(3); }
        });
        it("no interior notches amid mountains (<= 2 per seed)", () => {
            for (const s of seeds) { const m = rangeMetrics(s); expect(m.notches).toBeLessThanOrEqual(2); }
        });
        it("non-mountain biome distribution near configured weights", () => {
            const { getBiomeCellDirect, seedNoise, biomeCellCache } = VoxEx;
            const c = {}; let tot = 0;
            for (const s of seeds) { seedNoise(s); biomeCellCache.clear(); for (let cz=0; cz<120; cz++) for (let cx=0; cx<120; cx++) { const n = getBiomeCellDirect(cx,cz).name; if (n==='mountains'||n==='mountain_foothills') continue; c[n]=(c[n]||0)+1; tot++; } }
            const forestsPct = (c['forests']||0)/tot*100;
            expect(forestsPct).toBeGreaterThan(15); // was ~2.5% pre-recalibration; target ~22%
        });
    });
```
(The `notches <= 2` and `medianCluster >= 3` thresholds reflect the Task 5 converged result; adjust to the recorded values if tuning settled elsewhere — but only after the user sign-off in Task 5, never to force a pass.)

- [ ] **Step 2: Full suite green**
```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#summary .summary" 60000
```
Expected: all green, count up by 7 (3 isotropy + 4 range/biome). If a gate fails, return to Task 5 (do not loosen gates to pass).

- [ ] **Step 3: In-game sign-off**

```bash
cmd.exe /c start "" "http://localhost:8080/voxEx.html"
```
User starts a NEW world at agreed seeds, flies to mountain country, confirms: coherent ranges, no plains/foothill chunks dropped to y60 amid mountains, transitions read naturally, isotropy preserved. Only user confirmation closes this task. If changes requested → Task 5.

- [ ] **Step 4: Commit**
```bash
git add tools/voxex-tests.html
git commit -m "Lock mountain-range + biome-distribution gates (post-restructure)"
```

---

## Task 7: Finalize docs and findings

**Files:**
- Modify: `docs/superpowers/plans/2026-05-29-voxex-test-coverage.md` (finding #14 follow-up); `CLAUDE.md` (biome/terrain notes if warranted).

- [ ] **Step 1: Update finding #14 follow-up**

In `2026-05-29-voxex-test-coverage.md` under finding #14, append: the isotropy mask exposed that the broken noise was load-bearing; mountains were restructured into region-mask clusters, the biome CDF recalibrated, foothill notches eliminated structurally. Reference this plan + the converged constants.

- [ ] **Step 2: Note the biome restructure in CLAUDE.md**

In the Biome System section (CLAUDE.md ~208), add one line: mountains are placed by `isMountainRegion` (low-freq region mask) for coherent ranges; other biomes via weighted roll with a noise-calibrated CDF.

- [ ] **Step 3: Final commit**
```bash
git add docs/superpowers/plans/2026-05-29-voxex-test-coverage.md CLAUDE.md
git commit -m "Docs: mountain-range clustering + biome recalibration; finding #14 follow-up"
```

---

## Self-review notes (for the implementer)

- `MOUNTAIN_REGION_FREQ`/`THRESHOLD` must be (a) module-scope on main (Task 1) AND (b) baked into the worker string (Task 2). Both. The worker parity test (Task 2 Step 4) is the guard.
- Main `rebuildBiomeTable` (36022) and the worker table string (20050) must use the SAME skip condition (`mountain_foothills` OR `mountains`). Diff them if parity fails.
- `_BIOME_CDF_TABLE` is single-source on main; the worker `JSON.stringify`s it — do NOT hand-edit a worker copy.
- The region mask is sampled at cell centers (because `getRawBiomeParams` is always called via `getRawBiomeCellDirect` with cell-center coords) — that's why low `FREQ` yields contiguous multi-cell ranges.
- Do not touch `mountainsHeightFunc`, the `& 15` mask, `blendedHeight`, `foothillsHeightFunc`. The notch fix is structural (clustering), not a height-formula change.

## Pre-implementation review findings (2026-06-01)

- **Threshold corrected:** `MOUNTAIN_REGION_THRESHOLD` starts at **0.34**, not 0.6 — `noise2D` at the region frequency ranges ~[-0.79, 0.81] (p90 ≈ 0.34), so 0.6 would give <1% mountains. Verified empirically.
- **Legacy biome class (note, no action):** there is an unused class biome path at `voxEx.html:~6470–6938` (`getRawBiome`/`getBiomeAt`) explicitly annotated "not called". It is NOT the generation path (generation uses module-scope `blendedHeight`/`getBiomeParams`). The restructure does not touch it.
- **Worker surface-tag path (conditional follow-up, NOT a prerequisite):** the worker has a *separate* hardcoded biome family — `getBiomeParams`→`getBiomeCellValue`→`getRawBiomeCellValue` (`voxEx.html:~19006–19106`) — that builds the worker's `biomeCache`, feeding only the `isMountain` **surface tag** in `generateTerrainPass`. The **height/notch path is unaffected**: worker `heightCache` routes through the *injected* family (`blendedHeight`→`getBiomeHeightAtCell`→`getBiomeCellDirect`→`getRawBiomeParams`), which this plan modifies and the Tier-4 height-parity test guards. After clustering, the worker `isMountain` *surface tag* (Value path) will not track mask-placed mountains — but `isMountain` is a minor input to surface block choice (dominated by `SNOW_LINE`/`ROCK_LINE`/`ALPINE_LINE`/slope thresholds), so visible impact is likely small. **Assess at the R6 in-game check.** If surface artifacts appear (e.g. mask-mountains lacking rocky surface), the small follow-up is to gate the worker's `getRawBiomeCellValue` on `isMountainRegion` too (or point the worker's `getBiomeParams` at the injected `getBiomeCellDirect`). Do NOT pre-emptively refactor the worker biome code — let the in-game check decide.

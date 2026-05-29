# VoxEx Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the copy-paste test suite with one that tests the *real* functions/classes inside `voxEx.html` via a production-inert `?test=1` seam, then expand coverage across terrain, lighting, compression, meshing, class state, and live Worker/persistence integration.

**Architecture:** Add one gated seam block near the end of the `voxEx.html` module that assigns the canonical pipeline functions/classes/constants to `window.VoxEx` (and skips game auto-boot) only when the page URL contains `test=1`. Rewrite `tools/voxex-tests.html` so it deletes its local re-implementations, loads the real game in a hidden `<iframe src="../voxEx.html?test=1">`, binds `iframe.contentWindow.VoxEx`, and runs the existing `describe/it/expect` framework (extended for async) against the real code.

**Tech Stack:** Plain browser JS (no build, no npm dependency shipped). Three.js r160 is already loaded by `voxEx.html` from CDN. Verification uses a real browser; an optional headless self-check uses `python -m http.server` + `npx playwright` transiently (nothing committed).

---

## AMENDMENT 2026-05-29 (during execution — noise-seeding reconciliation)

Reconciliation (Task 1) revealed the main thread has **no callable `initNoise` and no `workerNumericSeed`** at module scope — those exist only inside the `CHUNK_WORKER_CODE` worker template string. The main-thread Perlin `perm` (module-scope, voxEx.html:21395) is seeded **inline inside `initGameEngine`** (voxEx.html:~24890-24895): `rng = new SeededRandom(seedStr); worldConfig.seed = rng.next();` then a Fisher-Yates shuffle of `perm`. `worldConfig` (module-scope, 18238) holds the numeric seed in `worldConfig.seed`.

**Resolution (single source of truth, no copied logic):**
1. Extract that inline seeding into a module-scope function `seedMainThreadNoise(rng)` that sets `worldConfig.seed = rng.next()`, shuffles `perm` via the SAME `rng`, and returns `worldConfig.seed`. Place it near the noise block (after voxEx.html:~21458).
2. In `initGameEngine`, replace the inline lines with `rng = new SeededRandom(seedStr); seedMainThreadNoise(rng);` — behavior-identical (same global `rng`, advanced identically).
3. Seam exports (instead of `initNoise`/`workerNumericSeed`):
   - `seedNoise: function(seedStr) { return seedMainThreadNoise(new SeededRandom(seedStr)); }`
   - `get worldSeed() { return worldConfig.seed; }`
   These use a throwaway rng so tests never perturb the global `rng`.

**Consequences for all later tasks (apply mentally when reading the code blocks below):**
- `initNoise("X")`  →  `seedNoise("X")`
- `VoxEx.workerNumericSeed`  →  `VoxEx.worldSeed`; `const seed = VoxEx.worldSeed;`
- `CHUNK_SIZE` / `CHUNK_HEIGHT` are NOT exported; the harness derives them: `const CHUNK_SIZE = WORLD_DIMS.chunkSize, CHUNK_HEIGHT = WORLD_DIMS.chunkHeight;` (16 / 320).
- Seam constants list drops `CHUNK_SIZE, CHUNK_HEIGHT`; noise list drops `initNoise`; getters become `worldSeed` + `biomeCellCache`; add the `seedNoise` function.

The worker's seeding (worker `initNoise`) uses the identical shuffle order, so main-thread `seedNoise(s)` produces terrain consistent with the worker for the same seed string — which is what the Tier 4 parity test relies on.

---

## Key Facts (verified against current source)

- The seam must live in the **same lexical scope as `blendedHeight`** (voxEx.html:36224) and `buildChunkWorkerCode` (voxEx.html:20006). That scope is the main module IIFE. The current file tail (`onWindowResize`, voxEx.html:~42190) is in that scope, so the seam goes just before the closing `</script>` at the end of the module.
- `buildChunkWorkerCode()` (voxEx.html:20006-20044) injects terrain functions into the chunk worker via `Function.toString()` — comment at voxEx.html:20026 states this "guarantees identical behavior." So the main-scope terrain functions ARE the worker's logic.
- Several identifiers are **redeclared in nested scopes** (e.g. `fbm2D` at 18971 and 21435; `FADE_LUT` at 11027 and 18859; `biomeCellCache` at 17392, 18993, and the 36xxx region). At the seam location, each bare identifier resolves to the *main-scope* copy. If an identifier has **no** main-scope declaration, referencing it in the seam throws `ReferenceError` at load — Task 1 uses this as the reconciliation signal.
- Mutable module state (`workerNumericSeed`, `perm`, `biomeCellCache`) must be exported via **getters**, not by value, or tests will capture stale `null`.

### Verified main-scope signatures (use these exactly in tests)

| Symbol | Signature | Line |
|--------|-----------|------|
| `blockIndex` | `(lx, ly, lz)` | 11908 |
| `safeGetBlock` | `(chunk, lx, ly, lz, defaultValue=AIR)` | 11922 |
| `getSectionIndex` | `(y)` | 5783 |
| `getSectionYRange` | `(sectionIndex)` | 5792 |
| `createSectionData` | `()` | 5756 |
| `chunkDistanceSq` | `(cx1, cz1, cx2, cz2)` | 11893 |
| `isLeafBlock` | `(blockId)` | 3814 |
| `shouldMergeBlocks` | `(id1, id2)` | 11192 |
| `getMergeKey` | `(blockId, ao, light)` | 38131 |
| `writeFaceVertices` | `(pos, norm, vIdx, verts, wx, wy, wz, nx, ny, nz)` | 38157 |
| `estimateChunkFaces` | `(chunkData)` | 39210 |
| `playerIntersectsBlock` | `(pMinX,pMinY,pMinZ,pMaxX,pMaxY,pMaxZ,bx,by,bz)` | 6064 |
| `rleEncode` / `rleDecode` | `(data)` / `(compressed, originalLength)` | 11312 / 11348 |
| `compressChunkData` / `decompressChunkData` | `(chunk)` / `(compressed)` | 11372 / 11420 |
| `getCompressionRatio` | `(original, compressed)` | 11458 |
| `initNoise` | `(seedStr)` (sets module `perm` + `workerNumericSeed`) | 18901 |
| `noise2D` / `noise3D` | `(x, y)` / `(x, y, z)` | 18939 / 18951 |
| `fbm2D` | `(x, z, octaves=4, persistence=0.5, lacunarity=2.0)` | 18971 |
| `continentalHeight` | `(gx, gz, seed)` | 36360 |
| `plainsHeightFunc`/`hillsHeightFunc`/`defaultHeightFunc`/`mountainsHeightFunc`/`foothillsHeightFunc` | `(gx, gz, biome, seed)` | 36387/36377/36369/36392/36545 |
| `getBiomeHeightAtCell` | `(cx, cz, gx, gz, seed, continentFactor)` | 36318 |
| `blendedHeight` | `(gx, gz, seed)` | 36224 |
| `getPreRiverHeight` / `getLocalSlope` | `(gx, gz, seed)` / `(gx, gz, seed, sampleDist=4)` | 36582 / 36627 |
| `getRiverFactor` | `(gx, gz, seed)` | 36648 |
| `getOceanFactor` | `(gx, gz, seed)` | 36735 |
| `getOceanDepth` | `(oceanFactor, gx, gz, seed)` | 36785 |
| `getRiverDepth` | `(riverFactor, gx, gz, seed, oceanFactor=1.0)` | 36767 |
| `getDeltaFingerFactor` | `(gx, gz, seed, oceanFactor)` | 36711 |
| `calculateChunkSunlight` / `calculateBlockLight` | `(chunk, chunkSize, chunkHeight)` | 36847 / 36956 |
| `analyzeChunkSections` | `(chunk)` | 5904 |
| `computeTightChunkBounds` | `(cx, cz, sections)` | 5818 |
| `pickVoxel` | `(origin, dir, range)` | 40465 |
| `VoxelWorld` | `constructor(externalChunks=null)`; `getChunkKey(cx,cz)` 7085; `getBlock(x,y,z)` 7166; `setBlock(x,y,z,blockId,createIfMissing=true)` 7207 | 7027 |

---

## File Structure

| File | Responsibility |
|------|----------------|
| `voxEx.html` | + one gated test-seam block (~30 lines) before the final `</script>`. No other changes. |
| `tools/voxex-tests.html` | Rewritten harness: iframe loader, async-capable `it()`, real-code bindings, all tiers. Heightmap viz retained. |
| `docs/superpowers/plans/2026-05-29-voxex-test-coverage.md` | This plan. |

Triage policy (from the spec): when a re-pointed or new test fails, classify as **(a) stale test** → fix the test, or **(b) real discrepancy in `voxEx.html`** → record it and STOP; do not change game logic without user approval.

---

## Task 1: Add the gated test seam to voxEx.html

**Files:**
- Modify: `voxEx.html` (insert before the final `</script>`, after `onWindowResize`, ~line 42208)

- [ ] **Step 1: Locate the insertion point**

Run: `grep -n "function onWindowResize\|</script>" voxEx.html | tail -5`
Confirm `onWindowResize` is the last function and the module's `</script>` follows it. Insert the seam between them (inside module scope).

- [ ] **Step 2: Add the seam block**

Insert this block immediately after the closing `}` of `onWindowResize` and before `</script>`:

```js
            // ============================================================
            // TEST SEAM — inert unless the page URL contains ?test=1.
            // Exposes the canonical pipeline functions/classes/constants so
            // tools/voxex-tests.html can test the REAL code (not copies).
            // Mutable module state is exposed via getters.
            // ============================================================
            if (typeof location !== 'undefined' && location.search.indexOf('test=1') !== -1) {
                window.__VOXEX_TEST_MODE__ = true;
                window.VoxEx = {
                    // --- constants ---
                    AIR, GRASS, DIRT, STONE, WOOD, LOG, LEAVES, BEDROCK, SAND, WATER,
                    TORCH, SNOW, GRAVEL, LONGWOOD_LOG, LONGWOOD_LEAVES, UNLOADED_BLOCK,
                    SECTION_HEIGHT, SECTIONS_PER_CHUNK, CHUNK_SIZE, CHUNK_HEIGHT,
                    BIOME_CELL_SIZE, LEAF_BLOCK_IDS, WORLD_DIMS, NEIGHBOR_OFFSETS,
                    BIOME_CONFIG, HEIGHT_FUNCS,
                    BLOCK_IS_SOLID, BLOCK_IS_OPAQUE, IS_TRANSPARENT,
                    SUNLIGHT_ATTENUATION, BLOCKLIGHT_ATTENUATION,
                    AO_QUANT_LOOKUP, LIGHT_QUANT_LOOKUP,
                    // --- geometry / chunk helpers ---
                    blockIndex, safeGetBlock, getChunkKey, chunkDistanceSq,
                    getSectionIndex, getSectionYRange, createSectionData,
                    isLeafBlock, shouldMergeBlocks, getMergeKey, writeFaceVertices,
                    estimateChunkFaces, playerIntersectsBlock,
                    computeTightChunkBounds, analyzeChunkSections,
                    // --- compression ---
                    rleEncode, rleDecode, compressChunkData, decompressChunkData,
                    getCompressionRatio,
                    // --- noise / rng ---
                    SeededRandom, initNoise, noise2D, noise3D, fbm2D,
                    // --- terrain / biome ---
                    continentalHeight, defaultHeightFunc, hillsHeightFunc,
                    plainsHeightFunc, foothillsHeightFunc, mountainsHeightFunc,
                    getBiomeHeightAtCell, blendedHeight, getPreRiverHeight,
                    getLocalSlope, getRiverFactor, getOceanFactor, getOceanDepth,
                    getRiverDepth, getDeltaFingerFactor, treePlacementValue,
                    // --- lighting ---
                    calculateChunkSunlight, calculateBlockLight,
                    // --- raycast / classes ---
                    pickVoxel, VoxelWorld,
                    // --- mutable module state (getters) ---
                    get workerNumericSeed() { return workerNumericSeed; },
                    get biomeCellCache() { return biomeCellCache; },
                };
            }
```

- [ ] **Step 3: Reconcile out-of-scope identifiers**

Some identifiers in Step 2 may not exist in the seam's scope (they may be nested-scope-only copies). Load the page and let `ReferenceError` reveal them:

Run: `python -m http.server 8080` (in the repo root; leave running)
Then in a browser open `http://localhost:8080/voxEx.html?test=1`, open DevTools console.
Expected (success): no error; `window.VoxEx` is an object; `typeof VoxEx.blendedHeight === 'function'`.
If a `ReferenceError: X is not defined` appears: that symbol has no main-scope declaration. Remove it from the export object and record it in a `// SEAM-RECONCILE:` comment listing the dropped names. Tests that needed it will be flagged in their tier (triage case b — the symbol the old test copied isn't reachable as canonical code).

Headless alternative (if no browser GUI is available):

```bash
npx -y playwright install chromium >/dev/null 2>&1
cat > /tmp/seam-probe.mjs <<'EOF'
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/voxEx.html?test=1', { waitUntil: 'load' });
const keys = await p.evaluate(() => window.VoxEx ? Object.keys(window.VoxEx).length : -1);
console.log('VoxEx keys:', keys, '| pageerrors:', errs);
await b.close();
EOF
node /tmp/seam-probe.mjs
```
Expected: `VoxEx keys: <number > 40> | pageerrors: []`

- [ ] **Step 4: Verify the seam is inert in normal use**

Open `http://localhost:8080/voxEx.html` (NO query string) in a browser.
Expected: the game start menu appears exactly as before; in the console, `window.VoxEx` is `undefined` and `window.__VOXEX_TEST_MODE__` is `undefined`. Confirm you can start a world (seed → play) and it renders — the seam changed nothing.

- [ ] **Step 5: Commit**

```bash
git add voxEx.html
git commit -m "Add gated ?test=1 seam exposing window.VoxEx for testing"
```

---

## Task 2: Rewrite the harness to load real code (bootstrap)

**Files:**
- Modify: `tools/voxex-tests.html` (replace the local re-implementation block lines ~92-381 with an iframe loader + bindings; keep the framework lines ~40-89 and viz/suites below)

- [ ] **Step 1: Extend `it()` for async and add a bootstrap matcher**

Replace the `it()` definition (tools/voxex-tests.html:46-51) with an async-capable version, and add `toBeDefined` to `expect` (after `toBeFinite`, line 66):

```js
async function it(name, fn) {
    const test = { name, passed: true, error: null };
    try { await fn(); } catch (e) { test.passed = false; test.error = e.message; }
    if (test.passed) currentSuite.passed++; else currentSuite.failed++;
    currentSuite.tests.push(test);
}
```
Add inside the object returned by `expect(actual)`:
```js
        toBeDefined() { if (actual === undefined) throw new Error(`Expected defined, got undefined`); },
```
Note: `describe(name, fn)` stays synchronous but its body now `await`s each `it`. Change `describe` to `async function describe(...)` and have callers `await describe(...)`. The simplest path: make `runAllTests` `async` and `await` each `describe` block. Update `describe` to: `async function describe(name, fn) { currentSuite = {...}; suites.push(currentSuite); await fn(); currentSuite = null; }` and make every `describe(...)` call site `await`ed inside `runAllTests`.

- [ ] **Step 2: Replace the local re-implementations with an iframe loader**

Delete tools/voxex-tests.html lines ~92-381 (everything from `// EXTRACTED CONSTANTS` through the end of `computeTightChunkBounds`, i.e. just before `// ALL TEST SUITES`). Replace with:

```js
// ============================================================
// LOAD REAL CODE FROM voxEx.html VIA HIDDEN IFRAME (?test=1)
// ============================================================
let VoxEx = null;
function loadRealCode() {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;border:0;';
        iframe.src = '../voxEx.html?test=1';
        iframe.onload = () => {
            const w = iframe.contentWindow;
            if (!w.VoxEx) return reject(new Error('iframe loaded but window.VoxEx is missing — check the seam'));
            resolve(w.VoxEx);
        };
        iframe.onerror = () => reject(new Error('failed to load ../voxEx.html'));
        document.body.appendChild(iframe);
    });
}
```

- [ ] **Step 3: Bind `VoxEx` members as locals at the top of `runAllTests`**

The existing suites call bare names (`blockIndex`, `blendedHeight`, `AIR`, …). To avoid rewriting every call, destructure `VoxEx` into locals. Make `runAllTests` async and start it with:

```js
async function runAllTests() {
    suites.length = 0;
    VoxEx = await loadRealCode();
    // Destructure real code into locals used by the suites below:
    var { AIR, GRASS, DIRT, STONE, WOOD, LOG, LEAVES, BEDROCK, SAND, WATER, TORCH,
          SNOW, GRAVEL, LONGWOOD_LOG, LONGWOOD_LEAVES, UNLOADED_BLOCK,
          SECTION_HEIGHT, SECTIONS_PER_CHUNK, CHUNK_SIZE, CHUNK_HEIGHT, BIOME_CELL_SIZE,
          LEAF_BLOCK_IDS, WORLD_DIMS, NEIGHBOR_OFFSETS, BIOME_CONFIG, HEIGHT_FUNCS,
          BLOCK_IS_SOLID, BLOCK_IS_OPAQUE, IS_TRANSPARENT, SUNLIGHT_ATTENUATION,
          BLOCKLIGHT_ATTENUATION, AO_QUANT_LOOKUP, LIGHT_QUANT_LOOKUP,
          blockIndex, safeGetBlock, getChunkKey, chunkDistanceSq, getSectionIndex,
          getSectionYRange, createSectionData, isLeafBlock, shouldMergeBlocks, getMergeKey,
          writeFaceVertices, estimateChunkFaces, playerIntersectsBlock, computeTightChunkBounds,
          analyzeChunkSections, rleEncode, rleDecode, compressChunkData, decompressChunkData,
          getCompressionRatio, SeededRandom, initNoise, noise2D, noise3D, fbm2D,
          continentalHeight, defaultHeightFunc, hillsHeightFunc, plainsHeightFunc,
          foothillsHeightFunc, mountainsHeightFunc, getBiomeHeightAtCell, blendedHeight,
          getPreRiverHeight, getLocalSlope, getRiverFactor, getOceanFactor, getOceanDepth,
          getRiverDepth, getDeltaFingerFactor, treePlacementValue, calculateChunkSunlight,
          calculateBlockLight, pickVoxel, VoxelWorld } = VoxEx;
    const biomeCellCache = VoxEx.biomeCellCache;

    biomeCellCache.clear();
    initNoise("test_seed_42");
    const seed = VoxEx.workerNumericSeed;   // capture the numeric seed once, after initNoise
    // ... existing + new suites below ...
}
```

IMPORTANT: `VoxEx.workerNumericSeed` is a live getter that changes every time `initNoise(...)` runs. The existing suites were written against a single `initNoise("test_seed_42")` call, so they use one captured value — that is the `const seed` above. In Task 3 you replace bare `workerNumericSeed` references in those suites with `seed`. New suites that call `initNoise` again (Task 4+) must re-read `VoxEx.workerNumericSeed` after each `initNoise`.

- [ ] **Step 4: Add a bootstrap suite proving real code loaded**

Add as the FIRST `describe` inside `runAllTests` (after the bindings):

```js
    await describe("bootstrap: real code loaded", () => {
        it("VoxEx namespace present", () => { expect(VoxEx).toBeDefined(); });
        it("block constants match", () => { expect(AIR).toBe(0); expect(WATER).toBe(9); expect(UNLOADED_BLOCK).toBe(255); });
        it("core fns are functions", () => { expect(typeof blendedHeight).toBe('function'); expect(typeof rleEncode).toBe('function'); expect(typeof calculateChunkSunlight).toBe('function'); });
        it("workerNumericSeed getter live after initNoise", () => { expect(typeof VoxEx.workerNumericSeed).toBe('number'); });
    });
```

- [ ] **Step 5: Update the load trigger and viz to await**

Change the bottom of the file from `window.addEventListener('load', runAllTests);` — it already calls `runAllTests`, now async; that's fine. But `renderTerrainVisualizations()` (called at the end of `runAllTests`, line 717) uses `plainsHeightFunc` etc. — ensure it runs AFTER bindings. Move its body to read from `VoxEx` (it already calls the bare names that are now locals, so it works if it stays inside `runAllTests`'s scope). Confirm `renderTerrainVisualizations` and `renderResults` are called at the end of `runAllTests` as before.

- [ ] **Step 6: Run and verify bootstrap passes**

Run: `python -m http.server 8080` (repo root), open `http://localhost:8080/tools/voxex-tests.html`.
Expected: summary banner renders; the "bootstrap: real code loaded" suite is all green (4/4).
Headless alternative:
```bash
cat > /tmp/run-suite.mjs <<'EOF'
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:8080/tools/voxex-tests.html', { waitUntil: 'load' });
await p.waitForFunction(() => document.querySelector('#summary .summary'), { timeout: 30000 });
console.log(await p.evaluate(() => document.querySelector('#summary').innerText));
await b.close();
EOF
node /tmp/run-suite.mjs
```
Expected: a summary line like `N/N tests passed - All green!` (or a failing count to triage).

- [ ] **Step 7: Commit**

```bash
git add tools/voxex-tests.html
git commit -m "Harness loads real voxEx.html code via ?test=1 iframe (bootstrap green)"
```

---

## Task 3: Re-point the existing ~127 tests and triage

**Files:**
- Modify: `tools/voxex-tests.html` (the existing suites, lines ~390-719 in the original)

- [ ] **Step 1: Replace bare `workerNumericSeed` references with `seed`**

Run: `grep -n "workerNumericSeed" tools/voxex-tests.html`
For each occurrence inside a suite body (NOT the binding/getter lines from Task 2), replace `workerNumericSeed` with `seed` (the value captured after `initNoise`). Example — the `getPreRiverHeight` suite becomes:
```js
    await describe("getPreRiverHeight", () => {
        it("deterministic", () => { biomeCellCache.clear(); const h1 = getPreRiverHeight(100, 100, seed); biomeCellCache.clear(); expect(getPreRiverHeight(100, 100, seed)).toBeCloseTo(h1, 5); });
        it("finite values", () => { for (let i = 0; i < 50; i++) { const h = getPreRiverHeight(i*100, i*73, seed); expect(isFinite(h)).toBeTruthy(); } });
    });
```

- [ ] **Step 2: Make every `describe(...)` call `await`ed**

Run: `grep -n "    describe(" tools/voxex-tests.html`
Prefix each with `await` (they're inside the now-async `runAllTests`). The terrain-viz `initNoise("test_seed_42")` call inside `renderTerrainVisualizations` (line 728) stays; it re-seeds for the heightmaps.

- [ ] **Step 3: Run the full re-pointed suite**

Run the suite (Task 2 Step 6 method). Record the summary and EVERY failing test name + detail.
Expected: most suites green. Failures are EXPECTED here — they reveal where the old copies drifted from real code.

- [ ] **Step 4: Triage each failure (do not auto-green)**

For each failing test, decide:
- **(a) stale test** (the local copy encoded outdated behavior; the real function is correct): fix the test's expectation to match real behavior, add a one-line `// re-pointed: was testing stale copy` comment.
- **(b) real discrepancy** (the real function looks wrong): DO NOT edit game logic. Append the finding to a new section `## Findings` in this plan file, with the test name, expected vs actual, and the `voxEx.html` line. Leave the test failing (or `it.skip`-style commented) and continue.

Known likely (a)-class drift to expect: `getMergeKey` (real voxEx.html:38131 omits the `[0,1]` clamp the old copy at tools/voxex-tests.html:150-157 applied) and `AO_QUANT_LOOKUP` construction differences. Verify the real formula at voxEx.html:38086-38139 and align the test's expected merge-key values to it.

- [ ] **Step 5: Commit**

```bash
git add tools/voxex-tests.html docs/superpowers/plans/2026-05-29-voxex-test-coverage.md
git commit -m "Re-point existing suite to real code; triage drift (Tier 1)"
```

---

## Task 4: Tier 2 — terrain determinism & invariants

**Files:**
- Modify: `tools/voxex-tests.html` (add suites after the existing terrain suites)

- [ ] **Step 1: Add cross-seed determinism + invariant suites**

Add inside `runAllTests`:

```js
    await describe("terrain: determinism across seeds", () => {
        const seeds = ["alpha", "bravo", "12345", "test_seed_42"];
        it("same (seed,coord) -> same height twice", () => {
            for (const s of seeds) {
                biomeCellCache.clear(); initNoise(s); const sd = VoxEx.workerNumericSeed;
                const a = blendedHeight(137, -89, sd);
                biomeCellCache.clear(); initNoise(s); const sd2 = VoxEx.workerNumericSeed;
                const b = blendedHeight(137, -89, sd2);
                expect(a).toBe(b);
            }
        });
        it("different seeds usually differ", () => {
            biomeCellCache.clear(); initNoise("alpha"); const ha = blendedHeight(50, 50, VoxEx.workerNumericSeed);
            biomeCellCache.clear(); initNoise("bravo"); const hb = blendedHeight(50, 50, VoxEx.workerNumericSeed);
            expect(ha === hb).toBeFalsy();
        });
    });

    await describe("terrain: finite over wide range", () => {
        it("blendedHeight never NaN/Infinity", () => {
            biomeCellCache.clear(); initNoise("sweep"); const sd = VoxEx.workerNumericSeed;
            for (let i = 0; i < 400; i++) {
                const gx = (i * 977) % 100000 - 50000, gz = (i * 1597) % 100000 - 50000;
                const h = blendedHeight(gx, gz, sd);
                expect(isFinite(h)).toBeTruthy();
            }
        });
        it("blendedHeight returns integer (Math.floor contract)", () => {
            biomeCellCache.clear(); initNoise("sweep"); const sd = VoxEx.workerNumericSeed;
            for (let i = 0; i < 50; i++) { const h = blendedHeight(i*53, i*-71, sd); expect(h).toBe(Math.floor(h)); }
        });
        it("height stays within world bounds", () => {
            biomeCellCache.clear(); initNoise("sweep"); const sd = VoxEx.workerNumericSeed;
            for (let i = 0; i < 200; i++) { const h = blendedHeight(i*311, i*-219, sd); expect(h).toBeGreaterThan(0); expect(h).toBeLessThan(CHUNK_HEIGHT); }
        });
    });

    await describe("terrain: ocean/river factor ranges", () => {
        it("getOceanFactor in [0,1]", () => {
            biomeCellCache.clear(); initNoise("ocean"); const sd = VoxEx.workerNumericSeed;
            for (let i = 0; i < 200; i++) { const f = getOceanFactor(i*131, i*-97, sd); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1); }
        });
        it("getRiverDepth positive", () => {
            biomeCellCache.clear(); initNoise("river"); const sd = VoxEx.workerNumericSeed;
            for (let i = 0; i < 100; i++) { const d = getRiverDepth(0.0, i*61, i*-43, sd); expect(d).toBeGreaterThan(0); }
        });
    });

    await describe("trees: placement determinism", () => {
        it("treePlacementValue deterministic per (seed,coord)", () => {
            biomeCellCache.clear(); initNoise("trees"); const sd = VoxEx.workerNumericSeed;
            for (let i = 0; i < 50; i++) { const a = treePlacementValue(i*13, i*-29, sd); const b = treePlacementValue(i*13, i*-29, sd); expect(a).toBe(b); }
        });
        it("treePlacementValue in [0,1]", () => {
            biomeCellCache.clear(); initNoise("trees"); const sd = VoxEx.workerNumericSeed;
            for (let i = 0; i < 100; i++) { const v = treePlacementValue(i*71, i*-53, sd); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
        });
        it("differs across coordinates", () => {
            biomeCellCache.clear(); initNoise("trees"); const sd = VoxEx.workerNumericSeed;
            expect(treePlacementValue(10, 10, sd) === treePlacementValue(11, 10, sd)).toBeFalsy();
        });
    });
```

Note: deeper tree-structure tests (trunk footprint, canopy radius — spec §5) require exporting `pickTrunkSize`/`getChunkTreePositions`/`getCanopyLayerRadius`/`isInTrunkFootprint` (voxEx.html:~4407-4986). If you want them, confirm each signature/scope (grep first, like Task 8 Step 1), add them to the seam, re-run Task 1 Step 3 reconciliation, then test. The `treePlacementValue` suite above covers the determinism requirement; the structure tests are an optional extension.

- [ ] **Step 2: Run and triage**

Run the suite. New terrain suites should be green. Any failure → triage per Task 3 Step 4.

- [ ] **Step 3: Commit**

```bash
git add tools/voxex-tests.html
git commit -m "Tier 2: terrain determinism + invariant tests"
```

---

## Task 5: Tier 2 — lighting BFS on hand-built chunks

**Files:**
- Modify: `tools/voxex-tests.html`

- [ ] **Step 1: Add lighting suites**

The existing suite already tests `calculateChunkSunlight`/`calculateBlockLight` (tools/voxex-tests.html:654-686). Add stronger structured cases:

```js
    function makeEmptyChunk() {
        const n = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
        return { blocks: new Uint8Array(n), skyLight: new Uint8Array(n), blockLight: new Uint8Array(n) };
    }

    await describe("lighting: sunlight open column", () => {
        it("top of empty chunk is full sunlight", () => {
            const c = makeEmptyChunk();
            calculateChunkSunlight(c, CHUNK_SIZE, CHUNK_HEIGHT);
            const top = blockIndex(0, CHUNK_HEIGHT - 1, 0);
            expect(c.skyLight[top]).toBe(15);
        });
        it("sunlight blocked under a stone slab", () => {
            const c = makeEmptyChunk();
            for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) c.blocks[blockIndex(lx, 100, lz)] = STONE;
            calculateChunkSunlight(c, CHUNK_SIZE, CHUNK_HEIGHT);
            expect(c.skyLight[blockIndex(8, 99, 8)]).toBe(1); // dark under slab
            expect(c.skyLight[blockIndex(8, 101, 8)]).toBe(15); // lit above slab
        });
    });

    await describe("lighting: torch block light", () => {
        it("torch emits 14 and attenuates by distance", () => {
            const c = makeEmptyChunk();
            c.blocks[blockIndex(8, 100, 8)] = TORCH;
            calculateBlockLight(c, CHUNK_SIZE, CHUNK_HEIGHT);
            expect(c.blockLight[blockIndex(8, 100, 8)]).toBe(14);
            expect(c.blockLight[blockIndex(8, 100, 9)]).toBe(13); // 1 block away
            expect(c.blockLight[blockIndex(8, 100, 11)]).toBe(11); // 3 blocks away
        });
        it("no torch -> all zero block light", () => {
            const c = makeEmptyChunk();
            calculateBlockLight(c, CHUNK_SIZE, CHUNK_HEIGHT);
            let max = 0; for (let i = 0; i < c.blockLight.length; i++) if (c.blockLight[i] > max) max = c.blockLight[i];
            expect(max).toBe(0);
        });
    });
```

- [ ] **Step 2: Run and triage; Step 3: Commit**

Run the suite; triage failures. Then:
```bash
git add tools/voxex-tests.html
git commit -m "Tier 2: structured lighting BFS tests"
```

---

## Task 6: Tier 2 — compression round-trips

**Files:**
- Modify: `tools/voxex-tests.html`

- [ ] **Step 1: Add round-trip + pathological-data suites**

```js
    await describe("compression: RLE round-trip", () => {
        function roundtrip(arr) { const enc = rleEncode(arr); const dec = rleDecode(enc, arr.length); return dec; }
        it("all-air identity", () => { const a = new Uint8Array(81920); const d = roundtrip(a); expect(d.length).toBe(a.length); for (let i = 0; i < a.length; i += 997) expect(d[i]).toBe(0); });
        it("all-same identity", () => { const a = new Uint8Array(4096).fill(STONE); const d = roundtrip(a); for (let i = 0; i < a.length; i += 91) expect(d[i]).toBe(STONE); });
        it("alternating identity", () => { const a = new Uint8Array(1000); for (let i = 0; i < a.length; i++) a[i] = i % 2 ? STONE : AIR; const d = roundtrip(a); for (let i = 0; i < a.length; i++) expect(d[i]).toBe(a[i]); });
        it("run longer than 255 splits correctly", () => { const a = new Uint8Array(600).fill(DIRT); const d = roundtrip(a); for (let i = 0; i < a.length; i += 7) expect(d[i]).toBe(DIRT); });
        it("pseudo-random identity", () => { const rng = new SeededRandom("rle"); const a = new Uint8Array(5000); for (let i = 0; i < a.length; i++) a[i] = rng.nextInt(15); const d = roundtrip(a); for (let i = 0; i < a.length; i++) expect(d[i]).toBe(a[i]); });
        it("empty input", () => { expect(rleEncode(new Uint8Array(0)).length).toBe(0); });
    });

    await describe("compression: chunk object round-trip", () => {
        it("compress/decompress preserves blocks", () => {
            const n = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
            const blocks = new Uint8Array(n);
            for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let ly = 0; ly < 64; ly++) blocks[blockIndex(lx, ly, lz)] = ly < 60 ? STONE : DIRT;
            const chunk = { blocks, sections: createSectionData() };
            const comp = compressChunkData(chunk);
            const back = decompressChunkData(comp);
            for (let i = 0; i < n; i += 313) expect(back.blocks[i]).toBe(blocks[i]);
        });
        it("ratio < 1 for uniform data", () => { const o = { blocks: new Uint8Array(81920).fill(STONE) }; expect(getCompressionRatio(o, compressChunkData(o))).toBeLessThan(0.5); });
    });
```

- [ ] **Step 2: Run and triage; Step 3: Commit**
```bash
git add tools/voxex-tests.html
git commit -m "Tier 2: compression round-trip + pathological tests"
```

---

## Task 7: Tier 2 — meshing helpers & block tables

**Files:**
- Modify: `tools/voxex-tests.html`

- [ ] **Step 1: Add merge/face/section + block-table consistency suites**

```js
    await describe("meshing: shouldMergeBlocks rules", () => {
        it("same solid merges", () => { expect(shouldMergeBlocks(STONE, STONE)).toBe(true); expect(shouldMergeBlocks(DIRT, DIRT)).toBe(true); });
        it("non-merging special blocks", () => { expect(shouldMergeBlocks(WATER, WATER)).toBe(false); expect(shouldMergeBlocks(TORCH, TORCH)).toBe(false); expect(shouldMergeBlocks(LEAVES, LEAVES)).toBe(false); });
        it("different ids never merge", () => { expect(shouldMergeBlocks(STONE, DIRT)).toBe(false); });
    });

    await describe("meshing: getMergeKey stability", () => {
        it("same inputs -> same key", () => { const ao = [0.5,0.5,0.5,0.5]; expect(getMergeKey(STONE, ao, 0.8)).toBe(getMergeKey(STONE, ao, 0.8)); });
        it("different block -> different key", () => { const ao = [1,1,1,1]; expect(getMergeKey(STONE, ao, 1) === getMergeKey(DIRT, ao, 1)).toBeFalsy(); });
    });

    await describe("meshing: estimateChunkFaces bounds", () => {
        it("empty -> small tier", () => { const s = createSectionData(); s.forEach(x => x.isEmpty = true); expect(estimateChunkFaces({ sections: s })).toBeGreaterThan(0); });
        it("never exceeds large tier", () => { const s = createSectionData(); s.forEach(x => { x.isEmpty = false; x.faceCount = 100000; }); expect(estimateChunkFaces({ sections: s })).toBeLessThanOrEqual(16384); });
    });

    await describe("meshing: analyzeChunkSections", () => {
        it("flags non-empty section and bounds", () => {
            const n = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
            const chunk = { blocks: new Uint8Array(n), sections: createSectionData() };
            chunk.blocks[blockIndex(3, 5, 7)] = STONE; // section 0
            analyzeChunkSections(chunk);
            expect(chunk.sections[0].isEmpty).toBe(false);
            expect(chunk.sections[0].minBlockX).toBeLessThanOrEqual(3);
            expect(chunk.sections[1].isEmpty).toBe(true);
        });
    });

    await describe("block tables: classification consistency", () => {
        const ids = [GRASS, DIRT, STONE, WOOD, LOG, LEAVES, BEDROCK, SAND, WATER, TORCH, SNOW, GRAVEL, LONGWOOD_LOG, LONGWOOD_LEAVES];
        it("opaque implies solid", () => { for (const id of ids) if (BLOCK_IS_OPAQUE[id]) expect(BLOCK_IS_SOLID[id]).toBe(1); });
        it("transparent blocks are not opaque", () => { for (const id of ids) if (IS_TRANSPARENT[id]) expect(BLOCK_IS_OPAQUE[id]).toBe(0); });
        it("AIR/WATER/TORCH are transparent", () => { expect(IS_TRANSPARENT[AIR]).toBe(1); expect(IS_TRANSPARENT[WATER]).toBe(1); expect(IS_TRANSPARENT[TORCH]).toBe(1); });
        it("leaves attenuate sunlight by 1", () => { expect(SUNLIGHT_ATTENUATION[LEAVES]).toBe(1); expect(SUNLIGHT_ATTENUATION[LONGWOOD_LEAVES]).toBe(1); });
    });
```

- [ ] **Step 2: Run and triage; Step 3: Commit**
```bash
git add tools/voxex-tests.html
git commit -m "Tier 2: meshing helpers + block-table consistency tests"
```

---

## Task 8: Tier 3 — class/state-level tests

**Files:**
- Modify: `tools/voxex-tests.html`

- [ ] **Step 1: Confirm VoxelWorld API before writing**

Run: `sed -n '7166,7230p' voxEx.html`
Confirm `getBlock(x,y,z)` returns a block id and `setBlock(x,y,z,blockId,createIfMissing=true)` writes it. If `setBlock` triggers side effects that need globals not present in test mode, note it as a finding and keep the test minimal (single set/get).

- [ ] **Step 2: Add VoxelWorld + raycast + collision suites**

```js
    await describe("VoxelWorld: block set/get round-trip", () => {
        it("set then get returns the block", () => {
            const w = new VoxelWorld();
            w.setBlock(5, 70, -3, STONE);
            expect(w.getBlock(5, 70, -3)).toBe(STONE);
        });
        it("unset block reads as AIR or UNLOADED", () => {
            const w = new VoxelWorld();
            const v = w.getBlock(999, 70, 999);
            expect(v === AIR || v === UNLOADED_BLOCK).toBeTruthy();
        });
        it("getChunkKey matches global format", () => {
            const w = new VoxelWorld();
            expect(w.getChunkKey(2, -3)).toBe("2,-3");
        });
    });

    await describe("collision: playerIntersectsBlock", () => {
        it("overlapping AABB intersects", () => { expect(playerIntersectsBlock(0.2,0.2,0.2, 0.8,1.8,0.8, 0,0,0)).toBeTruthy(); });
        it("separated AABB does not intersect", () => { expect(playerIntersectsBlock(5,5,5, 5.6,6.8,5.6, 0,0,0)).toBeFalsy(); });
    });

    await describe("raycast: pickVoxel", () => {
        it("returns null when nothing in range", () => {
            // pickVoxel reads the live world via globals; with an empty test world it should miss.
            const hit = pickVoxel({ x: 0, y: 200, z: 0 }, { x: 0, y: 1, z: 0 }, 5);
            expect(hit === null || typeof hit === 'object').toBeTruthy();
        });
    });
```

Note: `pickVoxel` depends on the live `getBlock`/world globals inside `voxEx.html`. In test mode no world is generated, so this asserts only that it runs and returns a sane type. If it throws due to missing globals, record a finding and reduce to a `typeof pickVoxel === 'function'` check.

- [ ] **Step 3: Run and triage; Step 4: Commit**
```bash
git add tools/voxex-tests.html
git commit -m "Tier 3: VoxelWorld/collision/raycast class-level tests"
```

---

## Task 9: Tier 4 — live Worker round-trip

**Files:**
- Modify: `tools/voxex-tests.html`

- [ ] **Step 1: Confirm the worker message contract**

Run: `sed -n '20113,20220p' voxEx.html` and `sed -n '19657,19720p' voxEx.html`
Identify (a) how to construct/obtain a chunk worker (the `ChunkWorkerPool` class at voxEx.html:20113, or the raw `buildChunkWorkerCode()` Blob), and (b) the exact `postMessage` request shape and the response shape (field names for cx/cz/blocks). Record the contract as a comment in the test.

- [ ] **Step 2: Expose what the test needs**

If `ChunkWorkerPool` / `buildChunkWorkerCode` are not already in `window.VoxEx`, add them to the seam (Task 1 Step 2 export object) and re-run Task 1 Step 3 reconciliation. Prefer exposing `buildChunkWorkerCode` (a pure string builder) so the test can spin up a single dedicated worker without the pool's scheduling.

- [ ] **Step 3: Add the worker round-trip suite (async)**

```js
    await describe("Tier 4: chunk worker round-trip", () => {
        it("worker-generated surface matches main-thread blendedHeight", async () => {
            const code = VoxEx.buildChunkWorkerCode();           // confirm name in Step 1
            const blob = new Blob([code], { type: 'application/javascript' });
            const worker = new Worker(URL.createObjectURL(blob));
            const SEED = "worker_parity";
            const result = await new Promise((resolve, reject) => {
                const to = setTimeout(() => reject(new Error('worker timeout')), 15000);
                worker.onmessage = (e) => { clearTimeout(to); resolve(e.data); };
                worker.onerror = (e) => { clearTimeout(to); reject(new Error('worker error: ' + e.message)); };
                // EXACT request shape from Step 1; example placeholder to adjust:
                worker.postMessage({ type: 'generate', cx: 0, cz: 0, seed: SEED, chunkSize: CHUNK_SIZE, chunkHeight: CHUNK_HEIGHT });
            });
            worker.terminate();
            const blocks = result.blocks;                         // confirm field name in Step 1
            expect(blocks).toBeDefined();
            // Compare a few surface columns: worker output vs main-thread blendedHeight
            biomeCellCache.clear(); initNoise(SEED); const sd = VoxEx.workerNumericSeed;
            let checked = 0, matches = 0;
            for (let lx = 0; lx < CHUNK_SIZE; lx += 4) for (let lz = 0; lz < CHUNK_SIZE; lz += 4) {
                const expectedTop = blendedHeight(lx, lz, sd);
                // find highest non-air in the worker column
                let top = -1; for (let ly = CHUNK_HEIGHT - 1; ly >= 0; ly--) { if (blocks[blockIndex(lx, ly, lz)] !== AIR) { top = ly; break; } }
                checked++; if (Math.abs(top - expectedTop) <= 2) matches++;   // allow water/surface deco slack
            }
            expect(matches).toBeGreaterThan(checked * 0.6);
        });
    });
```

Adjust the `postMessage` request and `result.blocks`/`result.cx` field names to the real contract found in Step 1 — a mismatch here is a (b)-class finding worth recording (it would mean worker and main disagree).

- [ ] **Step 4: Run in a REAL browser (and headless)**

Worker round-trips can behave differently headless. Verify in a real browser first (Task 2 Step 6 manual path) AND via the headless runner. Triage failures: distinguish "test contract wrong" (fix shapes) from "worker/main genuinely disagree" (finding).

- [ ] **Step 5: Commit**
```bash
git add tools/voxex-tests.html voxEx.html
git commit -m "Tier 4: live chunk worker round-trip parity test"
```

---

## Task 10: Tier 4 — persistence round-trip (IndexedDB)

**Files:**
- Modify: `tools/voxex-tests.html`

- [ ] **Step 1: Choose the storage path to exercise**

Run: `grep -n "indexedDB\|IDBOpenDB\|objectStore\|ChunkDiskStorage\|OPFS" voxEx.html | head -30`
IndexedDB works in any browser context; OPFS needs a secure context (localhost counts). Prefer the IndexedDB path for portability. If chunk persistence is OPFS-only via `ChunkDiskStorage`, use a direct IndexedDB round-trip of a compressed chunk payload instead (storage-layer fidelity test), since the goal is "compressed chunk survives a write/read cycle."

- [ ] **Step 2: Add the persistence round-trip suite (async, IndexedDB)**

```js
    await describe("Tier 4: IndexedDB chunk round-trip", () => {
        function idbRoundtrip(key, value) {
            return new Promise((resolve, reject) => {
                const open = indexedDB.open('voxex_test_db', 1);
                open.onupgradeneeded = () => open.result.createObjectStore('chunks');
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    const tx = db.transaction('chunks', 'readwrite');
                    tx.objectStore('chunks').put(value, key);
                    tx.oncomplete = () => {
                        const tx2 = db.transaction('chunks', 'readonly');
                        const get = tx2.objectStore('chunks').get(key);
                        get.onsuccess = () => { db.close(); resolve(get.result); };
                        get.onerror = () => { db.close(); reject(get.error); };
                    };
                    tx.onerror = () => reject(tx.error);
                };
            });
        }
        it("compressed chunk survives write/read byte-equal", async () => {
            const n = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
            const blocks = new Uint8Array(n);
            for (let i = 0; i < 4096; i++) blocks[i] = (i % 7 === 0) ? STONE : AIR;
            const comp = compressChunkData({ blocks, sections: createSectionData() });
            const stored = await idbRoundtrip('c:0,0', comp);
            const back = decompressChunkData(stored);
            for (let i = 0; i < 4096; i++) expect(back.blocks[i]).toBe(blocks[i]);
        });
    });
```

- [ ] **Step 3: Run over localhost (NOT file://), then commit**

OPFS/IndexedDB require a proper origin. Always run via `python -m http.server 8080` and `http://localhost:8080/...`, never `file://`. Run real browser + headless, triage, then:
```bash
git add tools/voxex-tests.html
git commit -m "Tier 4: IndexedDB chunk persistence round-trip"
```

---

## Task 11: Final pass — full run, findings, docs

**Files:**
- Modify: `tools/voxex-tests.html`, `README.md`, `CLAUDE.md`, this plan file

- [ ] **Step 1: Full suite run, record totals**

Run the full suite (real browser + headless). Capture the summary banner (`N/N tests passed`). Confirm the bootstrap suite and all green suites pass; confirm every remaining failure is documented in `## Findings`.

- [ ] **Step 2: Update the `## Findings` section**

Ensure every (b)-class discrepancy discovered in Tasks 3-10 is listed with test name, expected vs actual, and `voxEx.html` line. This is the deliverable for "things that aren't working together" — present it to the user; do not fix game logic without approval.

- [ ] **Step 3: Update docs**

In `README.md` (the "For Developers" / tools area) and `CLAUDE.md` (the tools table), update the `tools/voxex-tests.html` description to: "tests the real voxEx.html code via the `?test=1` seam (open over a local server: `python -m http.server`, then `/tools/voxex-tests.html`)." Note the seam in `voxEx.html` is inert without `?test=1`.

- [ ] **Step 4: Final commit**
```bash
git add tools/voxex-tests.html README.md CLAUDE.md docs/superpowers/plans/2026-05-29-voxex-test-coverage.md
git commit -m "Finalize real-code test suite; document seam and findings"
```

---

## Findings

### T3 re-point triage (Tier 1)

All resolved as stale-test adjustments (the old suite tested re-implemented COPIES that had drifted from the real code). No game-logic changes were made.

1. **Block lookup tables uninitialized in test mode.** The real tables (`BLOCK_IS_SOLID/OPAQUE` via `initBlockLookupTables()` @voxEx.html:11831; `IS_TRANSPARENT`/`*_ATTENUATION` via `initBlockOptimization()` @voxEx.html:29925) are populated during the game's `init()`, which doesn't run in test mode. Fix: harness calls both (the latter in try/catch — its table setup runs before any texture work). This was the root cause of ~9 of the 15 initial failures (block tables, sunlight attenuation, blocklight propagation, fully-solid section detection).
2. **`safeGetBlock` is valid-chunk-only by design** (@voxEx.html:11922 does `chunk.blocks || chunk` with no null guard). Old test expected null-tolerance. Test now verifies out-of-bounds coords return the default.
3. **`createSectionData` initializes `maxBlockY = i*SECTION_HEIGHT`** (@voxEx.html:5756), updated during analysis — not `(i+1)*SECTION_HEIGHT`. Test expectation corrected (304, not 320).
4. **`foothillsHeightFunc` caps at 250** (@voxEx.html:36567 `Math.min(..., 250)`), not 200. Test bound corrected.
5. **Torch block-light level is 15** via `getTorchBlockLightLevel()` (@voxEx.html ~36975), not 14. Test expectations corrected (emit 15; propagation 14, 13).
6. **`LEAVES` is tagged `["transparent","leaves"]`** in `BLOCK_CONFIG`, so `BLOCK_IS_SOLID[LEAVES]=0` and `BLOCK_IS_OPAQUE[LEAVES]=0`. Old test assumed leaves were solid. Test now asserts the real classification. NOTE (informational, not a test bug): if leaf-block player collision is expected, confirm it is handled by a path other than `BLOCK_IS_SOLID` — out of scope for this testing work.
7. **Cross-realm `instanceof`.** The harness loads real code in an iframe (separate JS realm); typed arrays/objects returned by real functions are not `instanceof` the parent page's constructors. The `toBeInstanceOf` matcher was made realm-tolerant (constructor-name comparison).
8. **Dropped two suites** (`getRegionKey`, `pointToSegmentDist`): these functions have no module-scope definition in voxEx.html (they were test-only re-implementations). Removed rather than test copies.

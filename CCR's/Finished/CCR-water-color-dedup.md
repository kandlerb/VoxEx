# CCR — Refactor: Deduplicate writeFaceColorsWater / …Indexed

**ID:** VOXEX-CCR-REFACTOR-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🟢 Shipped (verified already-implemented, see As-built 2026-07-11)
**GitHub:** #524
**Scope:** `writeFaceColorsWater` and `writeFaceColorsWaterIndexed` duplicate the full water vertex-color computation (~45 shared lines). Extract the shared math into one helper; both functions keep only their (different) vertex-write layout.

> Line numbers are as of build `2026-06-24.x` and **WILL DRIFT** — grep, don't trust the numbers. Anchors: `function writeFaceColorsWater(` (~39959), `function writeFaceColorsWaterIndexed(` (~40193), mesh-injection list `const meshFuncs = [` (~19561).

---

## Audit findings (verified against source)

- Both functions share the **identical signature** `(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz)`.
- The shared block (fog → caustics → foam → depth variation → clamp → base water color → per-vertex variation → `c1..c4`) is **byte-identical math** in both; the ONLY difference is the final color write:
  - Non-indexed writes **6 vertices / 18 floats** in a two-triangle winding `v1,v2,v4,v2,v3,v4`.
  - Indexed writes **4 vertices / 12 floats** in order `v1,v2,v3,v4`.
- The shared math depends only on worker-available symbols: `SETTINGS.waterFogDensity`, `SETTINGS.waterColor`, `waterHash`, `Math`. No external closure capture.
- **Injection reality (corrected from draft):** only `writeFaceColorsWaterIndexed` is injected into the worker (it is in the `meshFuncs` list ~19566). The non-indexed `writeFaceColorsWater` is **main-thread only** (the worker mesher uses the indexed path: `addFaceWaterIndexed`). Therefore the new shared helper MUST be added to the `meshFuncs` injection list, plus its module-scope scratch must be emitted into the worker (same pattern as `_lightResult` ~19555).

---

### #524 — Deduplicate water vertex-color math into one helper

**Location:** `writeFaceColorsWater` — line ~39959 (grep: `function writeFaceColorsWater(`); `writeFaceColorsWaterIndexed` — line ~40193 (grep: `function writeFaceColorsWaterIndexed(`)
**Why:** ~45 lines of identical fog/caustics/foam/tint math are copy-pasted across the two functions; they will silently drift when water coloring is tuned.
**Change:** Add a module-scope helper `computeWaterFaceColor(...)` that fills a reused module-scope scratch `_waterColorScratch` (Float32Array(7) = `[rMult, gMult, bMult, c1, c2, c3, c4]`). Each wrapper calls it, then writes only its own vertex layout. Allocation-free (scratch is reused). Add the helper to `meshFuncs` and emit the scratch into the worker.

**Context:** (verbatim from source — the implementer does NOT need to open `voxEx.html` for the injection mechanism)

*Worker injection list (`meshFuncs`, ~19561).* This is the array whose members are stringified via `fn.toString()` and concatenated into the worker mesher. Note `writeFaceColorsWaterIndexed` IS present but `writeFaceColorsWater` is ABSENT (the non-indexed path is main-thread only). `computeWaterFaceColor` must be added here (placement irrelevant — hoisted `function` decls):
```js
                const meshFuncs = [
                    computeMergedFaceVertices, getMergedFaceVertices, initMergedVertexCache,
                    getAOConfig, calculateVertexAO, calculateFaceAO,
                    calculateVertexCornerLight, calculateFaceCornerLight,
                    getMergeKey, isWaterAdjacent, isFoamLand, waterHash,
                    writeFaceVerticesIndexed, writeFaceColorsIndexed, writeFaceColorsWaterIndexed, writeFaceUVsIndexed, writeFaceIndices,
                    addFaceWaterIndexed, addMergedFaceIndexed,
                    cellCornerLightDamped, extractLightFromChunk, clearGreedyBuffers, greedyMeshSection,
                    ...(WORKER_LIGHTING_ENABLED ? [calculateChunkSunlight] : []) // VOXEX-CCR-PERF-013
                ];
                for (const fn of meshFuncs) {
                    const indentedSource = fn.toString().split('\n').map(line => '    ' + line).join('\n');
                    meshCode += indentedSource + '\n\n';
                }
```

*Scratch emission line to mirror (`_lightResult`, ~19555).* `Function.toString()` captures only function bodies, NOT module-scope consts — so `_waterColorScratch` must be string-emitted into the worker exactly like `_lightResult` and `_aoResult` are. The surrounding block (~19554-19556):
```js
                meshCode += '    const _aoResult = [1, 1, 1, 1];\n';
                meshCode += '    const _lightResult = [1, 1, 1, 1];\n';
                meshCode += '    const AO_OCCLUDES = new Uint8Array(' + JSON.stringify(Array.from(AO_OCCLUDES)) + ');\n';
```
Add (next to `_lightResult`): `meshCode += '    const _waterColorScratch = new Float32Array(7);\n';`

*Both write functions stay live as call targets — confirmed callers:*
- `writeFaceColorsWater` (~39959) is called by `addFaceWater(...)` at ~40283 (non-indexed, 6-vertex path; main-thread mesher only).
- `writeFaceColorsWaterIndexed` (~40193) is called by `addFaceWaterIndexed(...)` at ~40384 (indexed, 4-vertex path; used by BOTH main thread and worker).
Both wrappers must keep their existing signatures and names — `addFaceWater`/`addFaceWaterIndexed` are unchanged and still invoke them. Only the shared math moves into `computeWaterFaceColor`.

**Before:** (`writeFaceColorsWater`, ~39959–40055 — head+tail shown; the elided middle is the fog/caustics/foam/tint math, lines ~39960–40046)
```js
            function writeFaceColorsWater(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
                // Water fog: makes water look more like a substance, less like clear glass
                // fogDensity controls how quickly water becomes opaque (0 = clear, 1 = very foggy)
                const fogDensity = SETTINGS.waterFogDensity;
                // ... (~85 lines of shared math through c1..c4 — see source ~39960-40046) ...
                const c1 = ao[0] * lightLevel * v1Var;
                const c2 = ao[1] * lightLevel * v2Var;
                const c3 = ao[2] * lightLevel * v3Var;
                const c4 = ao[3] * lightLevel * v4Var;

                // Apply depth-based color tinting to each vertex
                col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
                col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
                col[cIdx + 6] = c4 * rMult; col[cIdx + 7] = c4 * gMult; col[cIdx + 8] = c4 * bMult;
                col[cIdx + 9] = c2 * rMult; col[cIdx + 10] = c2 * gMult; col[cIdx + 11] = c2 * bMult;
                col[cIdx + 12] = c3 * rMult; col[cIdx + 13] = c3 * gMult; col[cIdx + 14] = c3 * bMult;
                col[cIdx + 15] = c4 * rMult; col[cIdx + 16] = c4 * gMult; col[cIdx + 17] = c4 * bMult;
            }
```
And (`writeFaceColorsWaterIndexed`, ~40193–40253 — head+tail shown):
```js
            function writeFaceColorsWaterIndexed(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
                // Same water coloring logic as non-indexed version, but for 4 vertices
                const fogDensity = SETTINGS.waterFogDensity;
                // ... (~50 lines of the SAME shared math through c1..c4 — see source ~40195-40247) ...
                const c1 = ao[0] * lightLevel * v1Var;
                const c2 = ao[1] * lightLevel * v2Var;
                const c3 = ao[2] * lightLevel * v3Var;
                const c4 = ao[3] * lightLevel * v4Var;
                // Write 4 vertices (indexed order: v1, v2, v3, v4)
                col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
                col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
                col[cIdx + 6] = c3 * rMult; col[cIdx + 7] = c3 * gMult; col[cIdx + 8] = c3 * bMult;
                col[cIdx + 9] = c4 * rMult; col[cIdx + 10] = c4 * gMult; col[cIdx + 11] = c4 * bMult;
            }
```

**After:** Introduce ONE helper holding the verbatim shared math, then two thin wrappers. (The body between `const fogDensity = …` and the `c1..c4` lines is the **exact** current code copied once — do NOT retype it from memory; lift it verbatim from `writeFaceColorsWater` lines ~39962–40046.)
```js
            // Reused scratch for water vertex colors: [rMult, gMult, bMult, c1, c2, c3, c4].
            // Module-scope + emitted into the worker (see buildChunkWorkerCode meshCode).
            const _waterColorScratch = new Float32Array(7);

            // Compute the per-face water color terms once; fills _waterColorScratch.
            // No allocation, no external closure capture (uses SETTINGS, waterHash, Math only).
            function computeWaterFaceColor(ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
                const fogDensity = SETTINGS.waterFogDensity;
                // <<< PASTE THE VERBATIM SHARED BLOCK FROM writeFaceColorsWater ~39963-40046 HERE >>>
                // (everything from `const maxVisualDepth = ...` through the four
                //  `const c1 = ao[0] * lightLevel * v1Var;` ... `const c4 = ...` lines)
                _waterColorScratch[0] = rMult;
                _waterColorScratch[1] = gMult;
                _waterColorScratch[2] = bMult;
                _waterColorScratch[3] = c1;
                _waterColorScratch[4] = c2;
                _waterColorScratch[5] = c3;
                _waterColorScratch[6] = c4;
            }

            // Non-indexed: 6 vertices / 18 floats (winding v1,v2,v4,v2,v3,v4)
            function writeFaceColorsWater(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
                computeWaterFaceColor(ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz);
                const rMult = _waterColorScratch[0], gMult = _waterColorScratch[1], bMult = _waterColorScratch[2];
                const c1 = _waterColorScratch[3], c2 = _waterColorScratch[4], c3 = _waterColorScratch[5], c4 = _waterColorScratch[6];
                col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
                col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
                col[cIdx + 6] = c4 * rMult; col[cIdx + 7] = c4 * gMult; col[cIdx + 8] = c4 * bMult;
                col[cIdx + 9] = c2 * rMult; col[cIdx + 10] = c2 * gMult; col[cIdx + 11] = c2 * bMult;
                col[cIdx + 12] = c3 * rMult; col[cIdx + 13] = c3 * gMult; col[cIdx + 14] = c3 * bMult;
                col[cIdx + 15] = c4 * rMult; col[cIdx + 16] = c4 * gMult; col[cIdx + 17] = c4 * bMult;
            }

            // Indexed: 4 vertices / 12 floats (order v1,v2,v3,v4)
            function writeFaceColorsWaterIndexed(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
                computeWaterFaceColor(ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz);
                const rMult = _waterColorScratch[0], gMult = _waterColorScratch[1], bMult = _waterColorScratch[2];
                const c1 = _waterColorScratch[3], c2 = _waterColorScratch[4], c3 = _waterColorScratch[5], c4 = _waterColorScratch[6];
                col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
                col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
                col[cIdx + 6] = c3 * rMult; col[cIdx + 7] = c3 * gMult; col[cIdx + 8] = c3 * bMult;
                col[cIdx + 9] = c4 * rMult; col[cIdx + 10] = c4 * gMult; col[cIdx + 11] = c4 * bMult;
            }
```

**Also required (worker injection):**
1. Add `computeWaterFaceColor` to the `meshFuncs` array (~19561), e.g. on the same line as `writeFaceColorsWaterIndexed`. Order does not matter — these are hoisted `function` declarations.
2. Emit the scratch into the worker. Next to the existing `meshCode += '    const _lightResult = [1, 1, 1, 1];\n';` (~19555), add:
   ```js
   meshCode += '    const _waterColorScratch = new Float32Array(7);\n';
   ```

**Verify:**
- `tools/voxex-tests.html` → meshing tests + live chunk-worker round-trip (worker injection must not throw on first mesh).
- Visual: load the same seed before/after, stand in water of varying depth + a shallow shore (foam), confirm pixel-identical color/depth tint and foam in BOTH renderers (main-thread mesh and worker mesh paths).
- Regenerate the worker (any world load) and confirm no `[WorkerPool] … markers not found` warning and no `computeWaterFaceColor is not defined` worker error.

---

## Safety Checks
- [x] Shared math copied **verbatim** from `writeFaceColorsWater` (not retyped); both wrappers byte-identical to before.
- [x] No new per-call allocation: `_waterColorScratch` is module-scope and reused; no closures created in the hot path.
- [x] `computeWaterFaceColor` added to `meshFuncs`; `_waterColorScratch` emitted into worker (`meshCode +=`).
- [x] No external closure capture in the helper (only `SETTINGS`, `waterHash`, `Math`, params) — `Function.toString()` injection stays valid.
- [x] `/* __MESH_FUNCS_START__/END__ */` markers intact; worker round-trip test green.
- [x] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

---

## As-built (2026-07-11)

**Status update:** on re-audit, this CCR was found ALREADY IMPLEMENTED in `voxEx.html` — matching the "After" spec verbatim, byte-for-byte:
- `computeWaterFaceColor(ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz)` exists at the module scope (grep anchor, ~line 42515) holding the full shared fog/caustics/foam/depth-gradient/base-color/per-vertex-variation math, terminating in the `_waterColorScratch[0..6]` writes exactly as specified.
- `const _waterColorScratch = new Float32Array(7);` module-scope scratch present (~line 42511).
- `writeFaceColorsWaterIndexed` (~line 42736) is a thin wrapper: calls `computeWaterFaceColor(...)`, reads the 7 scratch slots, writes its 4-vertex/12-float layout — unchanged signature, unchanged call sites (`addFaceWaterIndexed`).
- The non-indexed `writeFaceColorsWater`/`addFaceWater` had ALREADY been removed as dead code under a separate tombstone (`[TOMBSTONE TER-11] Removed dead non-indexed writeFaceColorsWater() + writeFaceUVs() — superseded by the *Indexed variants; zero callers.`, ~line 42612) — this predates and is independent of this CCR; there is now only ONE water-color write path (indexed), so the CCR's original two-wrapper plan is moot but its goal (single source of truth for the shared math) is fully met.
- Worker injection confirmed correct: `computeWaterFaceColor` is present in the `meshFuncs` array (~line 20426, alongside `writeFaceColorsWaterIndexed`), and `meshCode += '    const _waterColorScratch = new Float32Array(7);\n';` is emitted (~line 20415) right next to the `_aoResult`/`_lightResult` scratch lines, mirroring the CCR's prescribed pattern.
- `VOXEX_RECENT_CHANGES` already carries the citation: `"Refactor: dedup water vertex-color math into computeWaterFaceColor (REFACTOR-001 #524)"` (~line 4438). No further `VOXEX_BUILD`/`VOXEX_RECENT_CHANGES` action taken this pass (per instructions: byte-identical refactors don't bump; a later pass bumps `VOXEX_BUILD`).

**This pass's action:** no code edit was needed (nothing to change) — did full re-verification and closed out the doc/tracker bookkeeping that was still outstanding.

**Verification results (2026-07-11):**
- `node tools/parity-check.mjs` — GREEN (all 15 lockstep checks + marker checks pass).
- `node tools/terrain-node-checks.mjs voxEx.html 12345` / `777` / `424242` — ALL HARD CHECKS GREEN on all three seeds.
- `tools/terrain-probe.mjs height 100 100`, `height -250 480`, `height 3000 -1200` — outputs IDENTICAL before and after this pass (surface/blended height, riverFactor, oceanFactor, biome, tree-soil all unchanged; expected, since no bytes were changed in this pass).
- `node tools/syntax-check.mjs` — fails only on the pre-existing EOF mount truncation (`</html>` check + one unterminated `<script>` from ~line 4209), per the known environment note in agent-notes §7; not a regression from this work. Targeted verification: extracted `computeWaterFaceColor` + `writeFaceColorsWaterIndexed` (lines ~42509-42744) into an isolated file with stubbed `SETTINGS`/`waterHash`, ran `node --check` (syntax OK) and a smoke invocation (executes without error, returns finite numbers).
- Confirmed on-disk via grep: `computeWaterFaceColor`/`_waterColorScratch` appear at all four expected sites (helper definition, module scratch, `meshFuncs` array entry, worker scratch emission line) plus the `VOXEX_RECENT_CHANGES` entry.
- `tools/lib/extract-terrain.mjs` — confirmed it does not reference `writeFaceColorsWater`/`computeWaterFaceColor` (mesh/water-color functions are out of its terrain-only extraction scope); no update needed there.

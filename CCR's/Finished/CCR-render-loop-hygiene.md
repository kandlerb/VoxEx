# CCR — Render-Loop & Hot-Path Hygiene (Allocation / Redundant-Compute Sweep)

**ID:** VOXEX-CCR-PERF-014
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-27
**Status:** 🔴 Proposed (audited 2026-06-28)
**GitHub:** #572, #574, #575, #549, #546, #544, #525, #577, #542 (actionable); #583, #580, #555 dropped — see audit notes
**Scope:** Behavior-neutral per-frame / per-chunk micro-optimizations: hoist throwaway allocations to module-scope scratch, compute loop-invariants once, gate a debug-only traversal. Same idiom as the shipped `CCR-held-torch-vec3-scratch` / `CCR-springdamper-scratch-object` / `CCR-volumetric-vec2-alloc`.

> Line numbers are as of build `2026-06-25.34` and **drift** — grep the quoted identifier before editing. Audit confirmed against this build.

> **Audit outcome:** Three of the twelve drafted items are NOT actionable as written and are flagged below with evidence (no fabricated Before/After): **#583** (sqrt is mathematically required), **#580** (no internal `performance.now()` exists — only a trivial adjacent dup), **#555** (`biomeCache` holds objects, not numbers). The remaining nine are verified/corrected with exact snippets.

---

## Summary

| # | Site (grep target) | Status | Fix |
|---|--------------------|--------|-----|
| #572 | `terrainBuffers` / `terrainState` (~41982/41992, MAIN thread) | CORRECTED | hoist both above the section loop; reset `terrainState` fields per section |
| #574 | `processChunkQueue` (~43156) | VERIFIED | drain set into a reused module-scope array instead of `Array.from().slice()` |
| #575 | `pickVoxel` (~43263) | VERIFIED | hoist the 6 face-direction arrays to module-scope frozen consts |
| #549 | `hiddenWaterMeshes` (~44600) | VERIFIED | reuse a persistent array, `length = 0` each refraction update |
| #546 | `isLightingDataValid` (~39281) | VERIFIED | reuse a module-scope sample-index array (cold path; low value) |
| #544 | `greedyMeshSection` (~40748) | VERIFIED | read `SETTINGS.maxGreedyQuadSize` once at the top of the function |
| #525 | `calculateFaceAO` (~39730) | CORRECTED | reuse the existing `_aoResult` scratch (NOT a new `AO_ONES` const — worker parity) |
| #577 | `applyPlayerVelocity` / `updatePhysicsAndMovement` (~43645/43850) | VERIFIED | return `inputSpeed` from `applyPlayerVelocity`, consume it downstream |
| #542 | `[RenderDiag]` `scene.traverse` (~44729) | VERIFIED | gate behind the existing `isDebug` flag (NOT the leak detector) |
| ~~#583~~ | `updateVolumetricLighting` sun/moon fade sqrt (~44348/44372) | **DROPPED** | sqrt feeds a linear interp — cannot use squared distance; ~2 sqrt/frame is negligible |
| ~~#580~~ | `updateVolumetricLighting(time)` (~44271) | **DROPPED** | no internal `performance.now()` — function already uses `time`; only a trivial call-site dup |
| ~~#555~~ | `biomeCache` (~38788) | **DROPPED** | stores biome **objects** (`.tags`), not numbers — typed array impossible |

### Impact

- Removes a steady trickle of per-frame / per-chunk allocations → less GC churn, smoother frame pacing.
- #542 removes a periodic full-scene walk from the production hot path.
- No visual or gameplay change in any actionable item.

---

### #572 — terrainBuffers / terrainState allocated per section
**Location:** `terrainBuffers` / `terrainState` — line ~41982 / ~41992 (grep: `const useGreedyMeshing = SETTINGS.greedyMeshingEnabled`)
**Why:** Inside `_renderChunkImpl`'s `for (let sectionIdx ...)` loop (20 sections/chunk), the greedy path allocates a fresh `terrainBuffers` object literal AND a fresh `terrainState` object literal every section. The buffer references (`terrainPos`/`terrainUvs`/...) are acquired once per chunk above the loop, so `terrainBuffers` is loop-invariant; `terrainState` only needs its scalar fields reset.
**Change:** Hoist both objects above the `for (let sectionIdx ...)` loop (next to `terrainPos = posPool.acquire(...)`, ~41839). Each section, re-point `terrainBuffers` fields are already correct (invariant), and re-seed `terrainState`'s fields from the running counters instead of `new`-ing it. **Edit only the MAIN-thread site (~41982).** The worker-template copy (`CHUNK_WORKER_CODE`, ~19134/19156) already hoists `terrainBuffers` and is dormant (worker mesher gated off) — leave it untouched to avoid string-template churn.
**Context:**
- **Enclosing function:** `_renderChunkImpl(cx, cz, distSq = 0)` (def ~41731). It is the live main-thread mesher (the worker mesher is gated off). The `if (useGreedyMeshing)` block (~41979) is the only consumer of these two objects.
- **Buffer acquisition (loop-invariant — sits ABOVE the section loop, ~41839-41844):** these are what `_greedyTerrainBuffers` fields point at, acquired once per chunk:
  ```js
  const terrainPos = posPool.acquire(maxFaces * 12);
  const terrainNorm = null;
  const terrainUvs = uvPool.acquire(maxFaces * 8);
  const terrainCols = colPool.acquire(maxFaces * 12);
  const terrainIndices = indexPool.acquire(maxFaces * 6);
  const terrainQuadSize = quadSizePool.acquire(maxFaces * 8);
  ```
- **Running counters (re-seed source for `terrainState`, declared ~41856):** `let tVIdx = 0, tUvIdx = 0, tCIdx = 0, tIIdx = 0, tVertCount = 0, tFaceCount = 0, tQsIdx = 0;` — the After block copies these into the scratch fields each section.
- **Section loop:** `for (let sectionIdx = 0; sectionIdx < SECTIONS_PER_CHUNK; sectionIdx++)` (~41918) — SECTIONS_PER_CHUNK = 20, so the literals were allocated 20×/chunk.
- **Downstream consumer (unchanged, ~42022-42029):** after each `greedyMeshSection` returns, the running counters are read back out — `tVIdx = terrainState.vIdx; tUvIdx = terrainState.uvIdx; …; tFaceCount = terrainState.faceCount; greedyInputFaces += terrainState.inputFaceCount;` — reading the same field names, so reuse is transparent.
- **Insertion point for the 2 new module-scope decls:** just before `function _renderChunkImpl` (~41731); the immediately-preceding lines are the `_renderChunk` profiling wrapper closing brace (~41729-41730 `_meshProfile.buildBuckets[_b]++; } }`). No other module-scope meshing scratch sits adjacent — place the two `const`s on the lines just above `function _renderChunkImpl(cx, cz, distSq = 0) {`.
- **Subsystem tie:** the worker copy at ~19134 (`const terrainBuffers = { pos: terrainPos, … }`) / ~19156 (`let terrainState = { … }`) lives inside the `CHUNK_WORKER_CODE` STRING TEMPLATE (not injected via `.toString()`), so editing the main-thread site does NOT propagate there — and it is dormant. Leave it.
**Before:**
```js
                        if (useGreedyMeshing) {
                            // --- GREEDY MESHING PATH: Process terrain with merged quads ---
                            // Create buffer references for greedy meshing
                            const terrainBuffers = {
                                pos: terrainPos,
                                norm: terrainNorm,
                                uvs: terrainUvs,
                                cols: terrainCols,
                                quadSize: terrainQuadSize,
                                indices: terrainIndices
                            };

                            // Track state across all 6 face directions
                            let terrainState = {
                                vIdx: tVIdx,
                                uvIdx: tUvIdx,
                                cIdx: tCIdx,
                                qsIdx: tQsIdx,
                                iIdx: tIIdx,
                                vertCount: tVertCount,
                                faceCount: tFaceCount,
                                inputFaceCount: 0 // Track faces before merging for stats
                            };
```
**After:**
```js
                        if (useGreedyMeshing) {
                            // --- GREEDY MESHING PATH: Process terrain with merged quads ---
                            // VOXEX-CCR-PERF-014 #572: reuse module-scope scratch objects (was a
                            // fresh literal per section, 20×/chunk). Buffer refs are loop-invariant
                            // (acquired once above the section loop); state fields are re-seeded each
                            // section from the running counters.
                            _greedyTerrainBuffers.pos = terrainPos;
                            _greedyTerrainBuffers.norm = terrainNorm;
                            _greedyTerrainBuffers.uvs = terrainUvs;
                            _greedyTerrainBuffers.cols = terrainCols;
                            _greedyTerrainBuffers.quadSize = terrainQuadSize;
                            _greedyTerrainBuffers.indices = terrainIndices;
                            const terrainBuffers = _greedyTerrainBuffers;

                            const terrainState = _greedyTerrainState;
                            terrainState.vIdx = tVIdx;
                            terrainState.uvIdx = tUvIdx;
                            terrainState.cIdx = tCIdx;
                            terrainState.qsIdx = tQsIdx;
                            terrainState.iIdx = tIIdx;
                            terrainState.vertCount = tVertCount;
                            terrainState.faceCount = tFaceCount;
                            terrainState.inputFaceCount = 0; // Track faces before merging for stats
```
Add the two scratch objects once at module scope (place near the other meshing scratch, e.g. just before `_renderChunkImpl`):
```js
// VOXEX-CCR-PERF-014 #572: reusable greedy-mesh scratch (was per-section literals)
const _greedyTerrainBuffers = { pos: null, norm: null, uvs: null, cols: null, quadSize: null, indices: null };
const _greedyTerrainState = { vIdx: 0, uvIdx: 0, cIdx: 0, qsIdx: 0, iIdx: 0, vertCount: 0, faceCount: 0, inputFaceCount: 0 };
```
Downstream (`tVIdx = terrainState.vIdx; ...`, `greedyInputFaces += terrainState.inputFaceCount;`) is unchanged — it reads the same fields.
**Verify:** `tools/voxex-tests.html` → "banded meshing (Phase 2)" + "Tier 4: worker MESH byte-parity" stay green; visually mine/place blocks and confirm chunks remesh identically (no missing faces, no seams).

---

### #574 — Array.from(queue).slice() per neighbor-update pass
**Location:** `processChunkQueue` — line ~43156 (grep: `Array.from(chunkNeighborUpdateQueue).slice`)
**Why:** Each call materializes the *entire* neighbor-update Set into a new array, then `.slice()`s a second array, just to take at most `updateLimit` (≤2) keys. The snapshot exists only because the loop `delete`s from the Set while iterating — but we can drain a bounded number of keys into a reused buffer first.
**Change:** Replace `Array.from(...).slice(...)` with a `for...of` over the Set that collects up to `updateLimit` keys into a reused module-scope array, then process that array. Behavior-identical: Set iteration order is insertion order, same as `Array.from`.
**Context:**
- **Enclosing function:** `async function processChunkQueue()` (def ~42985); the neighbor-update block runs once per call near the end of the queue pass.
- **The Set is mutated inside the loop body — separate-array iteration is what makes this safe.** The body `delete`s the current key (`chunkNeighborUpdateQueue.delete(key);`, ~43158) and may RE-ADD it in two spots: `if (chunkOrNeighborsPending(cx, cz)) { chunkNeighborUpdateQueue.add(key); … continue; }` (~43163) and `else { chunkNeighborUpdateQueue.add(key); }` (~43179). Iterating the separate `_neighborDrainBuf` array (not the Set) sidesteps any "mutate-while-iterate" hazard. The `for (const key of _neighborDrainBuf)` body below the drain is otherwise unchanged.
- **`updateLimit` bound:** `const updateLimit = Math.min(2, SETTINGS.buildQueueLimit - builds);` (~43155) — so the drain collects at most 2 keys regardless of Set size (the old `Array.from(set)` materialized the WHOLE set).
- **Insertion point for `_neighborDrainBuf`:** right after `const chunkNeighborUpdateQueue = new Set();` (~16873). The 2 lines that follow it are unrelated constants (`const NEIGHBOR_RECONCILE_INTERVAL_MS = 750;` ~16874, `const NEIGHBOR_RECONCILE_BUDGET = 4;` ~16875) — put the new `const _neighborDrainBuf = [];` on the line immediately after the Set declaration.
**Before:**
```js
                if (chunkNeighborUpdateQueue.size > 0 && builds < SETTINGS.buildQueueLimit && remainingBudget > 2) {
                    const updateLimit = Math.min(2, SETTINGS.buildQueueLimit - builds);
                    const toUpdate = Array.from(chunkNeighborUpdateQueue).slice(0, updateLimit);
                    for (const key of toUpdate) {
```
**After:**
```js
                if (chunkNeighborUpdateQueue.size > 0 && builds < SETTINGS.buildQueueLimit && remainingBudget > 2) {
                    const updateLimit = Math.min(2, SETTINGS.buildQueueLimit - builds);
                    // VOXEX-CCR-PERF-014 #574: drain ≤updateLimit keys into a reused buffer
                    // (was Array.from(set).slice — two allocs per pass over the whole set).
                    _neighborDrainBuf.length = 0;
                    for (const key of chunkNeighborUpdateQueue) {
                        if (_neighborDrainBuf.length >= updateLimit) break;
                        _neighborDrainBuf.push(key);
                    }
                    for (const key of _neighborDrainBuf) {
```
Add the scratch buffer once at module scope, near `const chunkNeighborUpdateQueue = new Set();` (~16873):
```js
const _neighborDrainBuf = []; // VOXEX-CCR-PERF-014 #574: reused drain buffer for processChunkQueue
```
The loop body (which does `chunkNeighborUpdateQueue.delete(key)` and may `.add(key)` back) is unchanged — mutating the Set while iterating `_neighborDrainBuf` (a separate array) is safe.
**Verify:** `tools/voxex-tests.html` green; in-game fly across chunk boundaries and confirm neighbor edges still re-light/re-mesh (no persistent dark seams).

---

### #575 — pickVoxel allocates face-direction arrays every DDA step
**Location:** `pickVoxel` — line ~43263 (grep: `face = stepX > 0 ? [-1, 0, 0]`)
**Why:** Each DDA step assigns `face` a fresh 3-element literal (e.g. `[-1,0,0]`). A single ray can step dozens of voxels; `pickVoxel` runs every physics step (`updateHighlight`) and on every click. The two callers (`updateHighlight` ~43283, `onMouseClick` ~45401) only **read** `face[0..3]` — no caller mutates it (grep `ao`/`face` assignment confirms zero writes).
**Change:** Hoist the 6 direction vectors to module-scope frozen consts and assign references instead of literals.
**Context:**
- **`face` lifecycle inside `pickVoxel`:** declared `let face = null, dist = 0;` (~43247); reassigned each DDA step in the two-line block at ~43263-43264; returned as part of `return { x, y, z, face };` (~43261). The returned object is freshly allocated each call, but `face` points at the (now frozen) shared const.
- **THREE callers (CCR said two — there are 3, all read-only and immediate; none retains the array across `pickVoxel` calls):**
  - `updateHighlight` (~43268): `const hit = pickVoxel(getPlayerWorldPosition(), controls.getDirection(_pickDirTmp), SETTINGS.blockReach);` then copies into scalars — `_highlightFaceX = hit.face[0]; _highlightFaceY = hit.face[1]; _highlightFaceZ = hit.face[2];` (~43283-43285).
  - `onMouseClick` (~45359): destructures `const { x, y, z, face } = hit;` (~45386) and on right-click calls `tryPlaceBlock(x, y, z, face[0], face[1], face[2]);` (~45401) — reads, never writes.
  - third caller (~45890, the place-repeat/touch path): `if (hit && hit.face) { tryPlaceBlock(hit.x, hit.y, hit.z, hit.face[0], hit.face[1], hit.face[2]); }` (~45891-45892).
  - Grep for `hit.face`/`face[` writes returns zero `face[n] =` assignments — freezing is safe and surfaces any future accidental mutation as a throw.
- **Insertion point for the 6 `_PICK_FACE_*` consts:** just before `function pickVoxel(origin, dir, range)` (~43235). The lines immediately preceding it are the tail of `updateHighlight`/prior helpers; place the six frozen consts on the lines directly above the `function pickVoxel` declaration (no adjacent module-scope DDA scratch exists today).
**Before:**
```js
                    if (tMaxX < tMaxY) { if (tMaxX < tMaxZ) { x += stepX; tMaxX += tDeltaX; face = stepX > 0 ? [-1, 0, 0] : [1, 0, 0]; dist = tMaxX; } else { z += stepZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? [0, 0, -1] : [0, 0, 1]; dist = tMaxZ; }
                    } else { if (tMaxY < tMaxZ) { y += stepY; tMaxY += tDeltaY; face = stepY > 0 ? [0, -1, 0] : [0, 1, 0]; dist = tMaxY; } else { z += stepZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? [0, 0, -1] : [0, 0, 1]; dist = tMaxZ; }}
```
**After:**
```js
                    if (tMaxX < tMaxY) { if (tMaxX < tMaxZ) { x += stepX; tMaxX += tDeltaX; face = stepX > 0 ? _PICK_FACE_NX : _PICK_FACE_PX; dist = tMaxX; } else { z += stepZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? _PICK_FACE_NZ : _PICK_FACE_PZ; dist = tMaxZ; }
                    } else { if (tMaxY < tMaxZ) { y += stepY; tMaxY += tDeltaY; face = stepY > 0 ? _PICK_FACE_NY : _PICK_FACE_PY; dist = tMaxY; } else { z += stepZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? _PICK_FACE_NZ : _PICK_FACE_PZ; dist = tMaxZ; }}
```
Add once at module scope, just before `function pickVoxel` (~43235):
```js
// VOXEX-CCR-PERF-014 #575: hoisted, frozen DDA face normals (consumers only read face[0..2]).
const _PICK_FACE_NX = Object.freeze([-1, 0, 0]);
const _PICK_FACE_PX = Object.freeze([1, 0, 0]);
const _PICK_FACE_NY = Object.freeze([0, -1, 0]);
const _PICK_FACE_PY = Object.freeze([0, 1, 0]);
const _PICK_FACE_NZ = Object.freeze([0, 0, -1]);
const _PICK_FACE_PZ = Object.freeze([0, 0, 1]);
```
**Verify:** `tools/voxex-tests.html` → "raycast: pickVoxel basic" green; in-game place a block against each of the 6 faces of a target block and confirm placement lands on the correct adjacent cell.

---

### #549 — hiddenWaterMeshes array allocated per refraction update
**Location:** `renderFrame` refraction block — line ~44600 (grep: `const hiddenWaterMeshes = []`)
**Why:** Each refraction update (throttled by `needsUpdate`, but still frequent) allocates a fresh array to stash hidden water meshes, then discards it after restoring visibility.
**Change:** Hoist to a persistent module-scope array and reset its length per update.
**Context:**
- **Enclosing scope:** the refraction render block inside `renderFrame`, gated by the staleness check (`window.refractionFrameCounter`/`window.lastRefractionCamPos`, ~44585-44597) — it does NOT run every frame, only when the camera moved enough since the last refraction render.
- **Fully consumed within one block — push then drain, no escape:** populated at `hiddenWaterMeshes.push(mesh);` inside `for (const [key, mesh] of chunkMeshes.entries())` (~44602-44607, only `key.endsWith("_WATER") && mesh.visible` meshes), then fully drained by the restore loop `for (const mesh of hiddenWaterMeshes) { mesh.visible = true; }` (~44625-44627). Nothing reads it after the restore loop, so `length = 0` at the top of the next update is safe.
- **Insertion point for `_hiddenWaterMeshes`:** beside the existing refraction scratch block (~44486-44488):
  ```js
  // Scratch objects for the refraction staleness check (hot path — no per-frame allocs)
  const _refractCamWorldPos = new THREE.Vector3();
  const _refractCamWorldQuat = new THREE.Quaternion();
  ```
  Add `const _hiddenWaterMeshes = [];` right under these.
**Before:**
```js
                        // Temporarily hide all water meshes
                        const hiddenWaterMeshes = [];
                        if (chunkMeshes) {
```
**After:**
```js
                        // Temporarily hide all water meshes
                        // VOXEX-CCR-PERF-014 #549: reuse a persistent array (consumed fully within
                        // this block — pushed here, drained in the restore loop below).
                        const hiddenWaterMeshes = _hiddenWaterMeshes;
                        hiddenWaterMeshes.length = 0;
                        if (chunkMeshes) {
```
Add once at module scope, near the other refraction scratch (`const _refractCamWorldPos = ...`, ~44487):
```js
const _hiddenWaterMeshes = []; // VOXEX-CCR-PERF-014 #549: reused water-mesh hide list (refraction)
```
The restore loop (`for (const mesh of hiddenWaterMeshes) mesh.visible = true;`) is unchanged.
**Verify:** `tools/voxex-tests.html` green; in-game enable water refraction, look across a water body while moving, and confirm water still renders (no permanently-hidden water meshes, no flicker).

---

### #546 — sampleIndices array allocated per isLightingDataValid call
**Location:** `isLightingDataValid` — line ~39281 (grep: `const sampleIndices = [0, 1000, 5000`)
**Why:** A fresh 6-element array is allocated each call. **Cold-ish path** — called only on chunk cache loads (3 call sites, all in the load path), not per-frame, so the win is small. Included for consistency; safe but low priority.
**Change:** Hoist the static 5 indices to a module-scope reusable array and overwrite the dynamic last element (`expectedSize - 1`) per call. Do NOT hardcode the last index — `expectedSize` is a parameter.
**Context:**
- **Enclosing function:** `function isLightingDataValid(chunk, expectedSize)` (def ~39269); `expectedSize` is the parameter that makes index 5 per-call (hence don't hardcode it).
- **Consumer within the function:** `for (const idx of sampleIndices) { if (idx >= expectedSize) continue; … }` (~39286) — iterated once and never retained, so a reused module array is transparent.
- **THREE callers, all on the chunk-load path (NOT per-frame — confirms "cold-ish, low value"):** each consumes only the returned boolean:
  - `const lightingValid = !forceLightingRecalc && isLightingDataValid(cachedData, expectedSize);` (~27621)
  - `const lightingValid = isLightingDataValid(opfsData, expectedSize);` (~39365)
  - `const lightingValid = !forceLightingRecalc && isLightingDataValid(cachedData, expectedSize);` (~39430)
- **Insertion point for `_lightingSampleIndices`:** just before `function isLightingDataValid` (~39269). The preceding lines are this function's JSDoc block (`/** Check if chunk lighting data is valid… */`, ~39263-39268) — place the new `const` above the JSDoc.
**Before:**
```js
                const sampleIndices = [0, 1000, 5000, 10000, 50000, expectedSize - 1];
```
**After:**
```js
                // VOXEX-CCR-PERF-014 #546: reuse module array; last index is per-call.
                _lightingSampleIndices[5] = expectedSize - 1;
                const sampleIndices = _lightingSampleIndices;
```
Add once at module scope, just before `function isLightingDataValid` (~39269):
```js
const _lightingSampleIndices = [0, 1000, 5000, 10000, 50000, 0]; // VOXEX-CCR-PERF-014 #546 (idx 5 set per call)
```
**Verify:** `tools/voxex-tests.html` → "Tier 4: IndexedDB chunk persistence round-trip" green; load a saved world and confirm cached lighting is accepted (no spurious full re-light on load).

---

### #544 — SETTINGS.maxGreedyQuadSize read inside the greedy expansion loop
**Location:** `greedyMeshSection` — line ~40748 (grep: `const maxSize = SETTINGS.maxGreedyQuadSize || 16;`)
**Why:** The read sits inside the `for (v) { for (u) {...} }` greedy-expansion double loop, so it re-reads the setting once per merge seed — many times per slice, per section, per face. The value is loop-invariant within the call.
**Change:** Move the read to the top of `greedyMeshSection` (read once per call). `greedyMeshSection` is single-sourced into the worker via `buildChunkWorkerCode` injection (~19568), so editing the main-thread source auto-propagates; the worker template's `SETTINGS` stub (~18934) already defines `maxGreedyQuadSize: 16`, so the hoisted read works there too. Preserve the `|| 16` fallback exactly.
**Context:**
- **Enclosing function:** `function greedyMeshSection(faceIdx, sectionBaseY, sectionEndY, getLocal, getLocalLight, startX, startZ, buffers, state)` (def ~40645). The hoisted read goes just after the function-top guard `if (state.inputFaceCount === undefined) state.inputFaceCount = 0;` (~40647).
- **The in-loop read (~40748) sits inside the double expansion loop** `for (let v = 0; v < vSize; v++) { for (let u = 0; u < uSize; u++) { … } }` (~40742-40743), right after `const mergeKey = greedyMergeKeys[idx];` — re-read once per merge seed.
- **`maxSize` consumers (unchanged — both reference the same `maxSize` in scope):** `while (u + width < uSize && width < maxSize)` (~40754) and `expandDown: while (v + height < vSize && height < maxSize)` (~40762). Hoisting to the function top keeps both in scope.
- **Worker-injection tie (editing main-thread auto-propagates):** `greedyMeshSection` is listed in the `meshFuncs` injection array (~19561-19570, line `cellCornerLightDamped, extractLightFromChunk, clearGreedyBuffers, greedyMeshSection,` at ~19568); the loop `for (const fn of meshFuncs) { … fn.toString() … }` (~19571) injects it verbatim. So editing the single main-thread source is sufficient. The worker `SETTINGS` stub `let SETTINGS = { …, maxGreedyQuadSize: 16, … };` (~18934) supplies the value in worker scope.
**Before:** (the read, ~40748, inside the expansion loop)
```js
                            const mergeKey = greedyMergeKeys[idx];
                            const maxSize = SETTINGS.maxGreedyQuadSize || 16;
```
**After:** (delete the in-loop read; add it once at the top of the function, just after the `inputFaceCount` guard ~40647)
```js
                if (state.inputFaceCount === undefined) state.inputFaceCount = 0;
                const maxSize = SETTINGS.maxGreedyQuadSize || 16; // VOXEX-CCR-PERF-014 #544: hoisted (loop-invariant)
```
…and in the expansion loop, remove the now-redundant line so it reads:
```js
                            const mergeKey = greedyMergeKeys[idx];
```
`width`/`height` expansion loops (`while (... && width < maxSize)`, `while (... && height < maxSize)`) reference the same `maxSize` — unchanged.
**Verify:** `tools/voxex-tests.html` → "Tier 4: worker MESH byte-parity" + "banded meshing (Phase 2)" green (byte-parity proves identical merge output); visually confirm greedy quads still cap at the configured size.

---

### #525 — calculateFaceAO allocates [1,1,1,1] on the AO-off / water path
**Location:** `calculateFaceAO` — line ~39730 (grep: `if (!SETTINGS.AO || blockId === WATER)`)
**Why:** When AO is disabled or the block is water, the function returns a fresh `[1,1,1,1]` literal each call (the normal path returns the shared `_aoResult` scratch). With AO off, this allocates on every visible face.
**Change:** Reuse the existing `_aoResult` scratch (fill it with 1s and return it) instead of a literal. **Do NOT introduce a new `AO_ONES` const** — `calculateFaceAO` is injected verbatim into the worker via `Function.toString()` (~19563), and a new module symbol would not exist in worker scope (the worker only gets the scratch arrays that are hand-injected as `meshCode +=` lines, ~19554). Reusing `_aoResult` needs zero worker-injection changes. Callers only read `ao[0..3]` (grep confirms no `ao[n] =` writes), so the shared-reference return is safe.
**Context:**
- **The normal AO path ALREADY returns the shared `_aoResult` (~39738) — this change just makes the AO-off/water path match.** Body: after `getAOConfig`, it writes `_aoResult[0..3] = calculateVertexAO(...)` (~39734-39737) and `return _aoResult;`. So `_aoResult` is already a transient shared return; the early-return literal `[1,1,1,1]` (~39730) was the lone inconsistent allocation.
- **`_aoResult` declaration (~39712-39713, immediately above the function):**
  ```js
  /** @type {AOValue[]} Reusable array to avoid allocation in hot path */
  const _aoResult = [1, 1, 1, 1];
  ```
- **Callers all consume `ao` immediately before the next `calculateFaceAO` call (read-only — confirms shared-reference is the established contract):** per-block path `const ao = calculateFaceAO(...)` at ~40262/40278/40364/40382, and greedy path at ~40712. Representative consume (greedy, ~40712-40727): `getMergeKey(blockId, ao, cornerLight, …)` then copies `greedyAO[idx*4+0] = ao[0]; … ao[3];` into integer slots — fully drained before any subsequent call. No `ao[n] =` write exists anywhere.
- **Worker-injection tie (no new symbol needed):** `calculateFaceAO` is in the `meshFuncs` injection list (~19563, line `getAOConfig, calculateVertexAO, calculateFaceAO,`), injected verbatim via `.toString()` (~19571-19573). The `_aoResult` scratch it depends on is hand-injected as `meshCode += '    const _aoResult = [1, 1, 1, 1];\n';` (~19554). Reusing `_aoResult` therefore works in both main and worker scope with zero injection edits; a fresh `AO_ONES` const would be undefined in the worker.
**Before:**
```js
            function calculateFaceAO(nx, ny, nz, lx, ly, lz, blockId, getter, faceIdx) {
                if (!SETTINGS.AO || blockId === WATER) {
                    return [1, 1, 1, 1];
                }
```
**After:**
```js
            function calculateFaceAO(nx, ny, nz, lx, ly, lz, blockId, getter, faceIdx) {
                if (!SETTINGS.AO || blockId === WATER) {
                    // VOXEX-CCR-PERF-014 #525: reuse the shared scratch (was a fresh literal per face).
                    _aoResult[0] = _aoResult[1] = _aoResult[2] = _aoResult[3] = 1;
                    return _aoResult;
                }
```
`_aoResult` already exists at module scope (~39713) and is injected into the worker (~19554) — no new symbol needed.
**Verify:** `tools/voxex-tests.html` → "Tier 4: worker MESH byte-parity" green; in-game toggle Graphics → Lighting → Ambient Occlusion OFF and confirm terrain renders flat-lit with no artifacts, then ON and confirm AO returns.

---

### #577 — inputSpeed / flySpeedMult computed twice per physics step
**Location:** `applyPlayerVelocity` (~43645) and `updatePhysicsAndMovement` (~43850) (grep: `const inputSpeed = SETTINGS.playerSpeed * (`)
**Why:** `updatePhysicsAndMovement` calls `applyPlayerVelocity(dt)` (which computes `flySpeedMult` + `inputSpeed`), then immediately recomputes the *identical* expression (named `flySpeedMultCollision` + `inputSpeed`) to derive `collisionSteps`. None of the inputs (`isFlying`/`isSprinting`/`isCrouching`/`SETTINGS.playerSpeed`/multipliers) change between the two computations within one step — `applyPlayerVelocity` reads them but never writes them.
**Change:** Have `applyPlayerVelocity` return its `inputSpeed`, and consume the return value in `updatePhysicsAndMovement` instead of recomputing. `applyPlayerVelocity` has exactly one caller (line ~43846), so adding a return value is safe.
**Context:**
- **`applyPlayerVelocity(dt)` (def ~43641) computes `inputSpeed` at ~43645-43649:**
  ```js
  const flySpeedMult = isFlying ?
      (isSprinting ? SETTINGS.flySpeedMultiplier * 2 : SETTINGS.flySpeedMultiplier) : 1.0;
  const inputSpeed = SETTINGS.playerSpeed * (
      isFlying ? flySpeedMult :
      isCrouching ? SETTINGS.crouchMultiplier :
      isSprinting ? SETTINGS.sprintMultiplier : 1.0
  );
  ```
  The function body ends at ~43834-43835 (an `else { canJump = false; }` then the function's closing `}`); the `return inputSpeed;` goes just before that closing brace. `inputSpeed` is still in scope at function end (declared at top, not inside a block).
- **Exactly one caller:** inside `updatePhysicsAndMovement` (def ~43837), the call `applyPlayerVelocity(dt);` is at ~43846, INSIDE the fixed-timestep loop `while (physicsAccumulator >= FIXED_TIME_STEP && physicsSteps < MAX_PHYSICS_STEPS) { … }` (~43841) — so it (and the duplicate recompute) can run several times per frame. The recompute to delete is at ~43848-43855: `flySpeedMultCollision` + `inputSpeed` → `const collisionSteps = Math.ceil((Math.max(inputSpeed, Math.abs(velocity.y)) * dt) / 0.3) || 1;`.
- **Inputs provably unchanged between the two computations (same instant):** `isFlying`/`isSprinting`/`isCrouching` are written ONLY in input handlers (`isFlying` ~9900 decl + ~45623; `isSprinting`/`isCrouching` ~12091-12092 decl + ~45147/45265/45290/45623-45634/45801/45974-45981) — none inside `applyPlayerVelocity` or between the call and the recompute. `SETTINGS.playerSpeed`/multipliers are config. So the returned `inputSpeed` equals the deleted recompute exactly.
**Before (`applyPlayerVelocity` end, ~43834):**
```js
                    } else {
                        canJump = false;
                    }
                }
            }
```
**After:**
```js
                    } else {
                        canJump = false;
                    }
                }
                return inputSpeed; // VOXEX-CCR-PERF-014 #577: reused by updatePhysicsAndMovement (collisionSteps)
            }
```
**Before (`updatePhysicsAndMovement`, ~43846):**
```js
                    // Apply velocity from player input
                    applyPlayerVelocity(dt);
                    // Calculate collision substeps for fast movement
                    const flySpeedMultCollision = isFlying ?
                        (isSprinting ? SETTINGS.flySpeedMultiplier * 2 : SETTINGS.flySpeedMultiplier) : 1.0;
                    const inputSpeed = SETTINGS.playerSpeed * (
                        isFlying ? flySpeedMultCollision :
                        isCrouching ? SETTINGS.crouchMultiplier :
                        isSprinting ? SETTINGS.sprintMultiplier : 1.0
                    );
                    const collisionSteps = Math.ceil((Math.max(inputSpeed, Math.abs(velocity.y)) * dt) / 0.3) || 1;
```
**After:**
```js
                    // Apply velocity from player input
                    // VOXEX-CCR-PERF-014 #577: reuse the inputSpeed it already computed (same
                    // inputs, same instant) instead of recomputing for collisionSteps.
                    const inputSpeed = applyPlayerVelocity(dt);
                    // Calculate collision substeps for fast movement
                    const collisionSteps = Math.ceil((Math.max(inputSpeed, Math.abs(velocity.y)) * dt) / 0.3) || 1;
```
**Verify:** `tools/voxex-tests.html` green; in-game sprint/fly/crouch into walls at speed and confirm collision substepping still prevents tunneling (movement feels identical).

---

### #542 — [RenderDiag] scene.traverse runs every 5s in production
**Location:** `renderFrame` diagnostic block — line ~44725 (grep: `if (diagNow - window._lastRenderDiagTime > 5000)`)
**Why:** A full `scene.traverse` (every mesh) runs every 5s purely to count draw ranges and `console.warn` a `[RenderDiag]` line. It runs unconditionally in production.
**AUDIT NOTE (resolves the CLAUDE.md leak-detector concern):** This traverse is **NOT** the geometry-leak detector. The leak detector is `checkGeometryLeaks(now)` (def ~20558, called ~45034) — a separate function that stays untouched. Gating this `[RenderDiag]` block off does **not** disable leak detection.
**Change:** Gate the whole block behind the existing module-scope `isDebug` flag (toggled by `~` via `toggleDebugOverlay`, declared ~12094, default `false`), so the traverse + warn only run when the debug overlay is on.
**Context:**
- **Enclosing scope:** inside `renderFrame`, just before the two-pass viewmodel render (~44752). The block body (~44726-44749) is `scene.traverse(obj => { … })` counting `meshesWithGeometry`/`meshesWithDrawRange`/`meshesWithZeroDrawRange` + a conditional `console.warn('[RenderDiag] …')` (~44748). Only the `if (... > 5000)` guard line changes (add `isDebug &&`); body unchanged.
- **`isDebug` flag (~12094):** `let isDebug = false;` — set `true`/toggled by the `~` key handler (~45689 `isDebug = true;`, ~45696 `isDebug = !isDebug;`). Default `false`, so gating suppresses the traverse in production.
- **Audit confirmation (this is NOT the leak detector):** `checkGeometryLeaks(now)` is a SEPARATE function (def ~20558), called unconditionally from the frame loop at ~45034 (`checkGeometryLeaks(time);`). It is untouched by this change — leak detection keeps running every 5s regardless of `isDebug`. The `[RenderDiag]` traverse and `checkGeometryLeaks` share nothing.
**Before:**
```js
                // DIAGNOSTIC: Render mesh analysis (logs every ~5 seconds)
                // Tracks how many scene meshes have geometry and valid drawRange
                if (!window._lastRenderDiagTime) window._lastRenderDiagTime = 0;
                const diagNow = performance.now();
                if (diagNow - window._lastRenderDiagTime > 5000) {
```
**After:**
```js
                // DIAGNOSTIC: Render mesh analysis (logs every ~5 seconds)
                // Tracks how many scene meshes have geometry and valid drawRange.
                // VOXEX-CCR-PERF-014 #542: gated behind isDebug (~ toggle) so the full
                // scene.traverse + warn don't run in production. NOTE: this is the
                // [RenderDiag] walk, NOT checkGeometryLeaks() — leak detection is unaffected.
                if (!window._lastRenderDiagTime) window._lastRenderDiagTime = 0;
                const diagNow = performance.now();
                if (isDebug && diagNow - window._lastRenderDiagTime > 5000) {
```
The block body (counting + the gated `console.warn`) is otherwise unchanged.
**Verify:** `tools/voxex-tests.html` green; in-game confirm no `[RenderDiag]` console output during normal play, then press `~` and confirm the diagnostic resumes (and `checkGeometryLeaks` still runs regardless — leak warnings unaffected).

---

## Dropped items (audit evidence — no change)

### #583 — sun/moon screen-space fade sqrt  — **DROPPED (proposed fix is mathematically wrong)**
**AUDIT FLAG:** The draft proposed "compare squared distance." The two sqrt sites (~44348, ~44372) compute `distFromCenter = Math.sqrt(dx*dx + dy*dy)`, which then feeds a **continuous linear interpolation**: `screenFade = Math.max(0, 1 - (distFromCenter - 0.7) / 1.5)`. The squared-distance trick (`dist < R` ⟺ `distSq < R²`) only works for **threshold comparisons**, not for a value that is itself used in arithmetic — substituting `dx*dx+dy*dy` would change `screenFade`. The actual Euclidean distance is required. With only ~2 `Math.sqrt` calls per frame (one for sun, one for moon, and only when each sprite is visible), the cost is negligible and not worth a caching scheme. **Recommend: drop.**

### #580 — updateVolumetricLighting re-samples performance.now()  — **DROPPED (claim is false)**
**AUDIT FLAG:** `updateVolumetricLighting(time)` does NOT call `performance.now()` internally — grep of lines 44271–44484 returns no `performance.now()`/`Date.now()`. The function already uses the `time` parameter directly (`uniforms.time.value = time;`, ~44284). The only nearby duplication is at the call site (~44681–44684): `const volumetricStartMs = performance.now();` then `updateVolumetricLighting(performance.now());` reads the clock twice ~one statement apart — a sub-microsecond inaccuracy in an *instrumentation* timer, not a real perf issue. **Recommend: drop.** (If desired as cleanup, pass `volumetricStartMs` into the call: `updateVolumetricLighting(volumetricStartMs);` — but this is cosmetic and slightly changes the logged volumetric uniform time, so it is NOT bundled here.)

### #555 — biomeCache new Array(n) → typed array  — **DROPPED (typed array impossible)**
**AUDIT FLAG:** `precalculateTerrainCaches` (~38785, and the dormant worker copy ~18834) sets `biomeCache[idx] = getBiomeParams(gx, gz)`, which returns a **biome config object** (consumed as `biome.tags?.includes("mountain")` at ~38864). Object references cannot live in a typed array. `heightCache`/`riverCache`/`widthNoiseCache` are *already* typed arrays; `biomeCache` must stay `new Array(n)`, which is already pre-sized. There is no behavior-neutral typed-array conversion. **Recommend: drop.**

---

## Safety Checks

- [ ] Grep each new scratch name before declaring — confirm no collision: `_greedyTerrainBuffers`, `_greedyTerrainState`, `_neighborDrainBuf`, `_PICK_FACE_NX`/`PX`/`NY`/`PY`/`NZ`/`PZ`, `_hiddenWaterMeshes`, `_lightingSampleIndices` (all currently absent — verified 0 hits at audit).
- [ ] No shadowing of `scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`.
- [ ] No allocations/closures added to `renderChunk` or `pointermove`.
- [ ] Hot paths remain `for`-loop based; no new array methods in render/mesh/physics loops.
- [ ] Worker parity: #544 and #525 edit injected mesh functions (`greedyMeshSection`, `calculateFaceAO`) — edit ONLY the main-thread source; do NOT add new module symbols they reference (#525 reuses the already-injected `_aoResult`; #544 uses the worker `SETTINGS` stub which already has `maxGreedyQuadSize`). #572 edits the MAIN-thread mesher only (worker `CHUNK_WORKER_CODE` template left untouched).
- [ ] #525/#544 callers verified read-only on the returned/merged AO (no `ao[n] =` writes) and the frozen `_PICK_FACE_*` consts (consumers only read `face[0..2]`).
- [ ] #577: `applyPlayerVelocity` has exactly one caller; the returned `inputSpeed` equals the deleted recomputation (same inputs, no mutation between).
- [ ] #542: confirmed the gated traverse is `[RenderDiag]`, NOT `checkGeometryLeaks` — leak detection still runs every 5s unconditionally.
- [ ] `tools/voxex-tests.html` (~204 tests) green; visual spot-check: volumetrics, water refraction, AO on/off, greedy quads, block place/mine on all 6 faces, sprint-into-wall collision.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (top of `voxEx.html`).

# Chunk Pipeline Performance Plan — Implementation Spec

**Date:** 2026-06-11 (rev 2 — implementation-exact)
**Goal:** Lower chunk latency (time from "chunk needed" → "chunk visible") and raise streaming throughput without regressing frame pacing on slow machines.
**Status:** Tier 1 + quick wins are specced for direct implementation. Tier 2 items need a verify step first (exact search patterns given). Tier 3 items are design notes — do NOT implement from this document.

---

## Ground rules for the implementing agent

1. **Single-file rule:** all changes go in `voxEx.html`. No new files.
2. Before declaring ANY new `const`/`let`/`function`, grep the file for that identifier. Names proposed here were unused as of this writing, but re-verify.
3. Line numbers below are anchors from 2026-06-11 and WILL drift — always locate by the quoted identifier/function name, not the number.
4. Worker meshing code lives inside the `CHUNK_WORKER_CODE` template string (worker `generateMesh` handler ~line 17696) — main-thread-only changes in this plan must NOT touch it. The `/* __TERRAIN_FUNCS_START__ */` … `/* __TERRAIN_FUNCS_END__ */` markers must stay intact.
5. After each tier-1 item: serve the repo over localhost, run `tools/voxex-tests.html` (225 tests, must stay green), then play-test: create a new world, fly (double-tap SPACE) in one direction at renderDistance 16, watch the loading spinner and the console.
6. The `[ChunkQueue] Stalled:` warning (in `updateChunkSystem`) must never fire during the play-test.
7. Use `logDebug(...)` with `[ChunkQueue]`/`[WorkerPool]`/`[Lighting]` tags for new logs; no per-frame logging.
8. Report changes in the CLAUDE.md "Change Reporting" format (Summary / Changes / Rationale / Safety Checks).

---

## Verified baseline (do not re-derive; spot-check anchors only)

| Fact | Anchor |
|---|---|
| Build loop awaits each worker round-trip serially → ~1 chunk in flight despite 4 workers | `processChunkQueue` → `await renderChunkAsync(jobCx, jobCz, jobDistSq)` (~39077); `renderChunkAsync` → `await generateMeshViaWorker(...)` (line ~18409) |
| `ChunkWorkerPool` ALREADY supports concurrent jobs | `pendingJobs` Map (17886), `workerBusy[]` (17888), internal `jobQueue` + `findAvailableWorker()` (~17962) + dispatch-on-complete. `generateMesh()` (18040) may be called N times concurrently; the pool queues internally. |
| Builds capped at `SETTINGS.buildQueueLimit` (default **2**) per frame | `maxBuildsThisFrame` (~39039) |
| Build budget 5ms/frame, halved when moving fast | `CHUNK_BUILD_BUDGET_MS` (~39018), `isMovingFast` |
| Worker mesh timeout 500ms → sync `renderChunk` fallback on main thread | `WORKER_MESH_TIMEOUT_MS` (18184), `generateMeshViaWorker` catch → `renderChunk` fallback in `renderChunkAsync` (18411–18425) |
| Worker result applied via main-thread element-by-element copy loops into pooled geometry | `applyWorkerMeshData` (18239): positions/uvs/colors/indices copied in `for` loops |
| IndexedDB loads batched in ONE transaction, but decompression inline per record on main thread | `batchLoadChunksFromCache` (25058), `ChunkCompressor.decompress` inside `request.onsuccess` (25072) |
| Lighting gates meshing: jobs with pending 3×3 neighborhood light get re-queued | `chunkOrNeighborsPending` check in `processChunkQueue` (~39055); watchdog force-clears after ~5s (`watchdogPendingLightChunks`, 15277) |
| Edge lighting: budget 4/call, cap 3 consecutive no-change passes, **cap counter resets to 0 whenever light changed** | `processEdgeLightingUpdates` (15896), `MAX_EDGE_LIGHTING_PASSES = 3` (15446), reset at `edgeLightingPassCount.set(key, 0)` (~15949) |
| Edit debounce 50ms (player edits use `immediate: true` and skip it) | `scheduleChunkUpdate` (16222), `setTimeout(..., 50)` (16240) |
| Spinner count = `chunkBuildQueue.length + pendingChunkUpdates.size` | `updateLoadingSpinner` (20853) |
| Slow-frame starvation fix (every-3rd-frame builds) already landed 2026-06-11 | `slowFrameBuildSkips` in `updateChunkSystem` — do not remove |

---

## TIER 1 — implement in this order

### Item 1: Pipeline the worker pool (decouple dispatch from apply)

**Problem.** `processChunkQueue` dispatches one mesh job and awaits its full round trip before the next. Throughput ≈ 1 chunk per round-trip. The pool itself is already concurrent; only the call pattern serializes it.

**Design.** Split meshing into DISPATCH (cheap, per build-loop iteration, no await) and APPLY (budgeted drain of completed results, per frame).

**New module-scope state** (declare next to `chunkBuildQueue`, ~12303; grep first):
```js
const inFlightMeshKeys = new Set();      // chunk keys with a worker mesh job in flight
const readyMeshResults = [];             // [{cKey, cx, cz, distSq, meshData}] completed, not yet applied
let syncFallbacksThisFrame = 0;          // cap main-thread fallback meshing per frame
```

**Change A — `processChunkQueue` (~39041):** replace the `await renderChunkAsync(...)` call with a non-awaiting dispatch:
```js
if (SETTINGS.useWorkersForMesh && chunkWorkerPool) {
    dispatchMeshJob(jobCx, jobCz, job.key, jobDistSq);   // returns immediately
} else {
    renderChunk(jobCx, jobCz, jobDistSq);
}
```
Loop-control changes in the same function:
- Skip (continue WITHOUT re-queueing) any job whose `key` is in `inFlightMeshKeys`.
- `builds++` still counts dispatches; raise the per-frame dispatch cap: `maxBuildsThisFrame = Math.min(estimatedChunksAllowed, Math.max(SETTINGS.buildQueueLimit, chunkWorkerPool ? chunkWorkerPool.poolSize : 1))` (see Item 2 for the burst-mode override).
- `chunkBuildTimeAvg` EMA now measures dispatch cost, which is ~0 — repurpose it: feed it from the APPLY drain (Change C) instead, since apply is the real main-thread cost. Keep the variable name.
- The lines after the old await — `recordChunkUpdateState(job.key, "processChunkQueue", "rendered")` and `chunkUpdateDiagnostics.pending.delete(job.key)` — MOVE to the apply/fallback path (they are not true until the mesh lands).

**Change B — new `dispatchMeshJob(cx, cz, cKey, distSq)`** (place next to `renderChunkAsync`, ~18384). Contents = the body of today's `renderChunkAsync` with the apply step replaced by a push:
```js
function dispatchMeshJob(cx, cz, cKey, distSq) {
    const centerData = chunkDataPool.get(cKey);
    if (!centerData) return;
    inFlightMeshKeys.add(cKey);
    chunkDataPool.setMeshState(cKey, MESH_STATE.BUILDING);
    // gather neighbors exactly as renderChunkAsync does today (18397-18406)
    generateMeshViaWorker(cx, cz, centerData, neighbors)
        .then(meshData => {
            inFlightMeshKeys.delete(cKey);
            if (meshData) { readyMeshResults.push({ cKey, cx, cz, distSq, meshData }); }
            else { queueSyncFallback(cKey, cx, cz, distSq); }   // null = worker unavailable/timeout
        })
        .catch(err => {
            inFlightMeshKeys.delete(cKey);
            logDebug(`[Mesh] Worker dispatch failed for ${cKey}: ${err.message}`);
            queueSyncFallback(cKey, cx, cz, distSq);
        });
}
```
`queueSyncFallback` = push onto a small `syncFallbackQueue` array (module scope) — do NOT call `renderChunk` inside the promise callback (uncontrolled timing).

**Change C — apply drain.** In `updateChunkSystem`, immediately AFTER the `processChunkQueue()` block, add a budgeted drain (plain synchronous function `drainReadyMeshResults(budgetMs)`, new, module scope):
```js
function drainReadyMeshResults(budgetMs = 4) {
    const start = performance.now();
    syncFallbacksThisFrame = 0;
    while (readyMeshResults.length > 0 && performance.now() - start < budgetMs) {
        const r = readyMeshResults.shift();
        // STALENESS GUARDS — drop, never apply:
        if (!chunkDataPool.get(r.cKey)) continue;                      // chunk unloaded while meshing
        if (r.distSq > currentRenderRadius * currentRenderRadius && !dirtyChunks.has(r.cKey)) continue; // out of range
        if (dirtyChunks.has(r.cKey)) { scheduleChunkUpdate(r.cx, r.cz, true, "stale-mesh-redo", { immediate: true }); continue; } // re-dirtied mid-flight
        applyWorkerMeshData(r.cKey, r.cx, r.cz, r.meshData);
        chunkDataPool.setMeshState(r.cKey, MESH_STATE.READY);
        recordChunkUpdateState(r.cKey, "meshApply", "rendered");
        chunkUpdateDiagnostics.pending.delete(r.cKey);
        chunkStreamLastProgressMs = performance.now();                  // feed stall watchdog
    }
    // at most ONE sync fallback per frame (slow machines must not serialize big meshes)
    if (syncFallbackQueue.length > 0 && syncFallbacksThisFrame < 1) {
        const f = syncFallbackQueue.shift();
        if (chunkDataPool.get(f.cKey)) { renderChunk(f.cx, f.cz, f.distSq); chunkStreamLastProgressMs = performance.now(); }
        syncFallbacksThisFrame++;
    }
}
```
Feed `chunkBuildTimeAvg` here: per drained result, `chunkBuildTimeAvg = chunkBuildTimeAvg * 0.9 + perResultMs * 0.1`.

**Change D — spinner.** In `updateLoadingSpinner` (20853) add the two new buckets so the spinner doesn't hit 0 while meshes are still in flight:
```js
const queueLength = chunkBuildQueue.length + pendingChunkUpdates.size
                  + inFlightMeshKeys.size + readyMeshResults.length;
```
(Use `typeof` guards matching the existing style.)

**Change E — retire `renderChunkAsync`.** After A–D, `renderChunkAsync` has no callers (verify with grep). Delete it and leave a one-line tombstone comment, or keep it ONLY if the test seam exports it (grep `renderChunkAsync` in the `window.VoxEx` block; as of this writing it is NOT exported).

**Invariants:**
- Max ONE in-flight or queued mesh job per chunk key (`inFlightMeshKeys` + the existing `queuedChunkKeys`).
- A result for a chunk that was re-dirtied after dispatch must be DROPPED and the chunk re-queued (handled in Change C).
- The lighting-pending re-queue check stays where it is (BEFORE dispatch).
- `MESH_STATE` transitions: QUEUED (dispatchPendingChunkUpdates) → BUILDING (dispatch) → READY (apply). On drop, schedule re-queue → back to QUEUED.

**Acceptance:**
- `tools/voxex-tests.html` green (the live worker round-trip test must still pass).
- Fly-test: debug overlay (`~`) Workers line shows 3–4/4 busy during streaming (it showed ≤1/4 before).
- No `[ChunkQueue] Stalled:` warnings; spinner drains to 0 after stopping.
- Block edits still rebuild instantly (immediate path) and no "flash" artifact on rebuild (deferred release in `applyWorkerMeshData` untouched).

---

### Item 2: Burst mode — adaptive build limits while a backlog exists

**Problem.** `buildQueueLimit` 2 and 5ms budget are steady-state numbers but also govern initial load, when the user stares at a spinner.

**Change.** In `processChunkQueue`, where `effectiveBudget` and `maxBuildsThisFrame` are computed (~39018–39039), add:
```js
const STREAM_BURST_THRESHOLD = 24;   // queue length that triggers burst mode
const STREAM_BURST_BUDGET_MS = 10;   // per-frame build/dispatch budget during burst
const burstMode = chunkBuildQueue.length > STREAM_BURST_THRESHOLD && !isMovingFast;
const effectiveBudget = burstMode ? STREAM_BURST_BUDGET_MS
                       : (isMovingFast ? CHUNK_BUILD_BUDGET_MS * 0.5 : CHUNK_BUILD_BUDGET_MS);
```
and for the cap (after Item 1's pool-size change):
```js
const poolSize = chunkWorkerPool ? chunkWorkerPool.poolSize : 1;
const baseCap = Math.max(SETTINGS.buildQueueLimit, poolSize);
const maxBuildsThisFrame = burstMode ? baseCap * 2
                          : isMovingFast ? Math.min(2, estimatedChunksAllowed, baseCap)
                          : Math.min(estimatedChunksAllowed, baseCap);
```
Constants go at module scope next to `CHUNK_BUILD_BUDGET_MS`'s function or above it — match existing placement style; grep names first.

Also pass burst mode to the apply drain: `drainReadyMeshResults(burstMode ? 8 : 4)` — export the flag via a module-scope `let streamBurstActive = false;` set in `processChunkQueue`, read in `updateChunkSystem`.

**Do NOT** remove the `slowFrameBuildSkips` every-3rd-frame logic; burst mode and the starvation guard compose (burst raises how much work runs when builds DO run; the guard decides whether they run on slow frames).

**Acceptance:** time from "Start Game" (post-pregen) to spinner-clear at renderDistance 16 improves ≥40% on a 60fps machine; p95 frame time during burst stays <33ms on that machine (perf overlay `O`).

---

### Item 3: Edge-lighting remesh churn — converge once, remesh once

**Problem.** `processEdgeLightingUpdates` (15896) resets `edgeLightingPassCount` to 0 whenever a pass changes ANY cell (~15949) and re-queues neighbors on every arrival; streamed chunks remesh 2–3× before settling.

**Changes (all inside the edge-lighting section, 15436–16010):**
1. **Threshold the reset:** at the `edgeLightingPassCount.set(key, 0)` reset (~15949), only reset when the pass changed MORE than a trivial number of cells:
   ```js
   const EDGE_LIGHT_RESET_MIN_CELLS = 8; // below this, count toward convergence instead
   if (edgeChanged > EDGE_LIGHT_RESET_MIN_CELLS) { edgeLightingPassCount.set(key, 0); }
   ```
   (Find the exact variable carrying the changed-cell count in that scope — `recalculateEdgeLighting` returns it via `changed`, summed at 15704–15725.)
2. **Debounce the remesh:** where convergence triggers the remesh (the `scheduleChunkUpdate` call in/near `processEdgeLightingUpdates` — locate by searching `scheduleChunkUpdate` calls between lines 15896–16010), do not schedule more than once per chunk per 150ms: keep `lastEdgeRemeshMs = new Map()` (module scope, grep first), skip if `now - (lastEdgeRemeshMs.get(key) || 0) < 150`, set on schedule.
3. **Skip no-op remeshes:** before scheduling, if the chunk's mesh already exists AND the pass's `edgeChanged === 0`, don't schedule at all (verify this isn't already short-circuited by the `edgeChanged === 0 && hasValidEdgeLighting` continue at ~15992 — if it is, this sub-item is done; say so in the report).

**Acceptance:** add a TEMPORARY counter (remove before commit): increment per `applyWorkerMeshData`/`renderChunk` call keyed by chunk, fly 32 chunks in a line, log the mean meshes-per-chunk. Target ≤1.3 (was ~2–3). Verify no permanently dark chunk borders after flying (the watchdog + `lightingLooksValid` path must still catch genuinely missing light).

---

### Item 4: Take decompression out of the IndexedDB callback

**Problem.** `batchLoadChunksFromCache` (25058) runs `ChunkCompressor.decompress` inside each `request.onsuccess` — 20-chunk batch ⇒ 20–60ms main-thread burst.

**Change (time-slice option — prescribed):** restructure `batchLoadChunksFromCache` to collect RAW records, then decompress in budgeted slices:
```js
// phase 1 (in onsuccess): records.push({key, data: record.data});  — no decompress
// phase 2 (after transaction completes), still inside the same async function:
for (const rec of records) {
    let decompressed = ChunkCompressor.decompress(rec.data);
    // ...existing old-format normalization (25075-25081) unchanged...
    results.set(rec.key, decompressed);
    if (performance.now() - sliceStart > 4) { await new Promise(r => setTimeout(r, 0)); sliceStart = performance.now(); }
}
```
Keep the function's signature and return type (`Map`) identical — callers must not change. Keep `idbCacheStats.recordHit/recordMiss` accounting where it is semantically (hit = record exists + seed matches; that check moves to phase 2 along with `seedsMatch`).

**Acceptance:** tests green (IndexedDB persistence round-trip test must pass). Re-enter a previously explored area: no visible hitch; perf overlay shows no >16ms frame attributable to chunk loads (compare before/after recordings).

---

## Quick wins (≤30 min each, implement with Tier 1)

- **QW1 — debounce 50→20ms:** `scheduleChunkUpdate` (16240): change `50` to `20`. Non-player-edit schedules only (edits already bypass via `immediate`).
- **QW2 — `castShadow=false` beyond shadow radius:** where chunk meshes are created (`applyWorkerMeshData` 18286 and the equivalent in `renderChunk` — locate `new THREE.Mesh(geo, voxelMaterial)` occurrences) set `mesh.castShadow = distSq > shadowConfig.radius * shadowConfig.radius ? false : true;` — note `shadowConfig.radius` is in BLOCKS, distSq is in CHUNKS²: convert (`const shadowChunks = Math.ceil(shadowConfig.radius / WORLD_DIMS.chunkSize)`). Also flip the flag when `applyShadowRenderDistance()` changes the radius (iterate `chunkMeshes` there once — it's a rare settings event).
- **QW3 — prefetch along velocity:** in `updateChunks` (38673), where the player's chunk coords are computed for enumeration, add `const lookX = playerPos.x + velocity.x * 1.5; const lookZ = playerPos.z + velocity.z * 1.5;` and bias the enumeration CENTER 25% toward the look point (weighted blend, not full replacement — keep the player inside the loaded set). Guard `typeof velocity !== 'undefined'`.

---

## TIER 2 — verify, then implement (medium impact)

Each begins with a VERIFY step; if verification fails, record why and skip.

- **T2.1 Trees in workers.** VERIFY: grep `DECORATIONS` and tree placement calls inside `CHUNK_WORKER_CODE` (17386–17800). If tree generation truly runs only main-thread (look in `generateChunkData`), add a decorations pass to the worker generate handler. Trees are seed-deterministic; the worker already has terrain funcs injected. Watch chunk-border trees: cross-chunk trunk/canopy writes (`TREE_NEIGHBOR_UPDATE` pass) must keep working — read that pass's flow first.
- **T2.2 Distant-chunk material swap.** VERIFY current material cost matters: toggle `SETTINGS` shadows/AO off and measure. Then: second material `voxelMaterialFar` (MeshLambertMaterial, same map/vertex colors/flatShading/alphaTest), swap per-mesh on distance band crossing (hysteresis ±1 chunk) inside the existing per-chunk visibility/culling loop. Fog hides the lighting-model seam; verify visually at the band.
- **T2.3 Worker-timeout stampede guard.** Already covered by Item 1's `syncFallbackQueue` (1/frame). VERIFY after Item 1: artificially set `WORKER_MESH_TIMEOUT_MS = 1` locally and confirm the game stays interactive (slow chunks, no freeze), then restore.
- **T2.4 Volumetric/composer trims.** Separate measurement task: profile `composer.render()` vs direct render on a low-end GPU before touching anything.

## TIER 3 — design notes only (each needs its own plan doc before any code)

- **T3.1 Per-section remeshing for edits** (one geometry per section or indexed `geometry.groups`; cuts edit remesh ~10–20×; large bookkeeping refactor: `chunkMeshes` keys, pooling tiers, culling).
- **T3.2 Distance LOD meshing** (2×2×2 voxel merge beyond ~12 chunks; needs seam handling + lighting downsample policy).
- **T3.3 Draw-call batching at high render distance** (merge 2×2 chunk neighborhoods at distance; pairs with T3.2).
- **T3.4 SharedArrayBuffer: rejected** while deploying to GitHub Pages (no COOP/COEP headers possible). Do not propose again unless hosting changes.

---

## Measurement protocol (run before Tier 1, after Item 1+2, after Tier 1 complete)

On one fast and one slow machine, renderDistance 16, fresh world, same seed (`perftest-1`):
1. Seconds from post-pregen world entry → loading spinner clears.
2. Sustained chunks/sec while flying straight (count `[ChunkQueue]` builds or use debug overlay built-counter delta over 30s).
3. p95 frame time during (2) from the perf overlay.
4. Meshes-per-chunk ratio (Item 3's temporary counter).
Record all four in this file under a "Results" section with the date.

---

## Results

### 2026-06-11 — Implementation pass (Tier 1 + quick wins)

**Implemented (all in `voxEx.html`):**
- Item 1 — pipelined worker meshing: `dispatchMeshJob()` / `drainReadyMeshResults()` split, `inFlightMeshKeys` / `readyMeshResults` / `syncFallbackQueue` state, staleness guards, spinner buckets, per-frame apply budget. `renderChunkAsync` was **kept** (the pre-gen Phase-2 `Promise.all` batch at ~`useAsyncRendering` still calls it correctly — the plan's "no callers" assumption was wrong); both `processChunkQueue` callers (main loop + neighbor-refresh) now dispatch.
- Item 2 — burst mode: `STREAM_BURST_THRESHOLD=24`, `STREAM_BURST_BUDGET_MS=10`, cap raised to `max(buildQueueLimit, poolSize)` (×2 in burst), drain budget widened to 8ms in burst. `slowFrameBuildSkips` guard left intact.
- Item 3 — edge-light churn: `EDGE_LIGHT_RESET_MIN_CELLS=8` threshold on the convergence-cap reset, 150ms remesh debounce (`lastEdgeRemeshMs`), plus a cap-drop **safety flush** so the threshold can't strand accumulated light. Sub-item 3.3 (skip no-op remeshes) was already satisfied by the existing `_edgeMeshDirty` gate.
- Item 4 — decompression moved out of the IndexedDB `onsuccess` callbacks into a budgeted phase-2 loop (4ms slices); signature/return type and hit/miss accounting preserved.
- QW1 — non-edit debounce 50→20ms. QW2 — `castShadow` gated on shadow-coverage radius in both mesh paths + re-evaluated in `applyShadowRenderDistance()`. QW3 — velocity-biased enumeration center (chunk-quantized 25% blend, added to the frustum cache key).

**Tier 2 verification:**
- T2.1 — **already done**: trees generate in the worker (`generateTreesForChunk` in the worker generate handler; chunks tagged `GEN_PASS.DECORATIONS`, "Worker did all generation"). No change.
- T2.3 — **structurally satisfied by Item 1** (`syncFallbackQueue`, 1 fallback/frame). No new code; `WORKER_MESH_TIMEOUT_MS=1` runtime check deferred to playtest.
- T2.2, T2.4 — **skipped**: VERIFY steps require interactive GPU profiling + visual band inspection, unavailable in the headless implementation environment.

**Verification performed:**
- Full-file JS parse check (`node --check`) of the module script (38,036 lines): **OK**.
- `tools/voxex-tests.html` automated suite (real code via the `?test=1` iframe seam, incl. live worker round-trip, compression codec, persistence, terrain/lighting/meshing): **225/225 passing**, run headless (Chromium) against the edited file.

**Pending (require live game loop / interactive flight — not runnable headless):** the four measurement-protocol metrics (spinner-clear time, sustained chunks/sec, p95 frame time, meshes-per-chunk ratio), the no-`[ChunkQueue] Stalled` fly-test, debug-overlay worker-busy check (3–4/4), and the no-dark-borders visual check. Recommend a renderDistance-16 fly-test on `perftest-1` to fill these in.

### 2026-06-11 — Review pass (2 fixes applied post-implementation)

1. **BUG (fixed):** the in-flight drop in `processChunkQueue` consumed a queue entry without releasing `queuedChunkKeys`. Repro: chunk dispatched → edit lands while mesh in flight (re-enqueues the key) → duplicate entry dropped at the in-flight guard → key orphaned in `queuedChunkKeys` → every later `scheduleChunkUpdate` for that chunk silently refused to enqueue, including the drain's own `stale-mesh-redo`. Net effect: edits made while a mesh was in flight never appeared. Fix: `queuedChunkKeys.delete(job.key)` on the drop path.
2. **Staleness gap (fixed):** the neighbor-refresh path silently dropped refreshes for in-flight chunks (the in-flight mesh was built from older neighbor data). Fix: re-add the key to `chunkNeighborUpdateQueue` instead of dropping.

Re-run `tools/voxex-tests.html` after these fixes. Everything else verified faithful to spec: state/bookkeeping, staleness guards, burst-mode composition with the slow-frame guard, edge-light cap-flush safety (better than spec), Item 4 phase split, QW1–3 in both mesh paths.

### 2026-06-11 — Playtest crash → MAJOR DISCOVERY: worker meshing never worked

Playtest threw `ReferenceError: voxelMaterial is not defined` from `applyWorkerMeshData` (via the new drain). Investigation conclusion:

- `applyWorkerMeshData` has referenced a **nonexistent material** since it was written. Under the OLD code, the throw was swallowed by `renderChunkAsync`'s try/catch, which then fell back to sync `renderChunk`. **Every "worker-meshed" chunk in the project's history was actually meshed synchronously on the main thread** — after paying a full worker round-trip for a mesh that was discarded. Item 1's drain calls the function outside that try/catch, surfacing the bug.
- `applyWorkerMeshData` is ALSO missing vs. `renderChunk`'s attach phase: pooled-mesh protocol (`acquireChunkMesh` — it news up meshes, leaking the pool design), `applyTightChunkBounds` (it calls `computeBoundingSphere()` over POOLED buffers — stale vertices beyond drawRange corrupt the bounds), torch model rebuild (`releaseChunkTorches` + torch scan), zero-face `chunkMeshes` map cleanup, `chunkRenderedFaces`/`chunkRenderDiagnostics`, `markShadowsDirty`, neighbor-update queueing.
- The WORKER mesher itself (inside `CHUNK_WORKER_CODE`) is below parity with the main-thread mesher: no greedy merging (per-face quads), water `shoreDist` hardcoded 1 / `waterThickness` hardcoded 0 (degrades water shading), no corner-light smooth lighting.

**Resolution (applied):** `WORKER_MESH_PIPELINE_ENABLED = false` gate on both dispatch sites — meshing runs sync via `renderChunk`, which is what production always effectively did, now WITHOUT the wasted per-chunk worker round-trip (a net speedup over the status quo). The Item 1 machinery (dispatch/drain/in-flight/fallback) is kept in place behind the gate. Also fixed: the latent `voxelMaterial`→`chunkMaterial` ReferenceError, and a spurious first-frame `[ChunkQueue] Stalled` warn (`chunkStreamLastProgressMs` lazy init).

**Follow-up project (the REAL Item 1, needs its own plan doc): worker mesher parity.**
Scope: (a) port greedy meshing + corner-light packing + real shore/thickness generation into the worker mesher in `CHUNK_WORKER_CODE`; (b) complete `applyWorkerMeshData` per the missing list above (mirror `renderChunk`'s attach phase, ideally by EXTRACTING that attach phase into a shared function both paths call); (c) verify with a visual A/B (same seed, worker vs sync meshes must be pixel-identical) plus the existing worker round-trip test extended to compare face counts against the main-thread mesher. Only then flip `WORKER_MESH_PIPELINE_ENABLED` to true. Items 2–4 + QW1–3 remain live and unaffected.

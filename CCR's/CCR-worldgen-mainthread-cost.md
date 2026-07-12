# CCR — World-Gen Main-Thread Cost: Offload Lighting + Defer Caching (VOXEX-CCR-PERF-013)

**File:** `voxEx.html` (single-file rule honored — all proposed changes stay in this file)
**Date:** 2026-06-23
**Status:** Proposal / report only — **NO code applied. `voxEx.html` is unchanged by this session.**
**Scope:** Cut the time from "Start Game" to a playable world on low-end hardware by removing the two biggest **main-thread** costs during spawn pre-generation — per-chunk **sunlight propagation** and per-chunk **cache compression/writes** — neither of which is currently offloaded, even though terrain generation already is. Plus one trivial scaling lever.

This CCR is a **design + placement spec**, grounded in a captured Chrome performance trace. It gives the measured baseline, the exact root-cause line numbers with current code, three independent fix levers (ordered by risk/reward), cross-system risk, and a verification plan. Implementation is a follow-up.

---

## Baseline (measured — Chrome trace `Trace-20260623T130220`, deployed build .21)

Test device: **Intel Core Ultra 7 155U, integrated graphics, 32 GB RAM** (a good worst-case proxy; dev box / Mac will be faster).

Timeline from the trace, aligned to the recorded click flow:

| Event | Trace time |
|---|---|
| Click **Create New World** | t+5.29 s |
| Click **Start Game** | t+6.51 s |
| World playable (click-to-play `#blocker`) | **t+77.76 s** |
| **Total generation** | **≈ 71 s** |

Where the 71 s goes — **the main thread is the bottleneck, not the workers**:

| Thread / function | Time | Notes |
|---|---|---|
| **Main thread busy during gen** | **41 s of 70.5 s (58%)** | serializes the post-gen work |
| `calculateChunkSunlight` (voxEx.html:38039) | **18.8 s** | per-chunk sunlight — **runs on main thread** |
| `_compressArray` (ChunkCompressor, voxEx.html:25673) | **8.7 s** | RLE compression for caching, in `saveChunkToCache` |
| `analyzeChunkSections` + `calculateBlockLight` | ~1.3 s + 0.7 s | also main thread |
| Worst single main-thread freeze | **538 ms** @ t+75.43 s | one microtask drain (apply/light backlog) |
| 8 terrain/mesh workers | **~85% idle** during gen | generate+mesh in parallel, then wait |
| OPFS disk worker `writeChunk` | 20.9 s | persists every chunk; own thread (parallel) but heavy I/O |

**Conclusion:** terrain generation is already parallelized and is *not* the wait — the workers mostly idle. The wait is two **serial main-thread** steps the worker path deliberately keeps on the main thread: **lighting (≈19.5 s incl. block light)** and **cache compression (8.7 s)**. Together ≈ 27 s, about two-thirds of all main-thread gen work.

---

## Root cause (verified line numbers, current build)

The fresh-world path is `preGenerateSpawnChunks` → **Phase 1C** (line **27261**), which generates missing chunks in parallel batches of 18:

```js
// line 27272–27276
const generationPromises = batch.map(chunk =>
    generateChunkData(chunk.cx, chunk.cz).then(data => ({ chunk, data }))
);
const results = await Promise.all(generationPromises);
```

Inside `generateChunkData`, the **worker** generates terrain/water/trees, then the **main thread** does everything else. The code comment states the split outright:

```js
// line 38954–38997  (generateChunkData, worker-success branch)
if (workerBlocks) {
    // Worker generated terrain + water + trees (Phase 3) - only need lighting on main thread
    const chunk = { blocks: workerBlocks, skyLight: new Uint8Array(size), blockLight: new Uint8Array(size), ... };

    // --- PASS 4: Calculate sunlight ---
    calculateChunkSunlight(chunk, chunkSize, chunkHeight);   // line 38972  ← 18.8 s total
    chunk.genState |= GEN_PASS.SUNLIGHT;
    // --- PASS 5: Calculate block light ---
    calculateBlockLight(chunk, chunkSize, chunkHeight);      // line 38976  ← 0.7 s
    chunk.genState |= GEN_PASS.BLOCKLIGHT;
    // --- PASS 6: Analyze sections ---
    analyzeChunkSections(chunk);                             // line 38980  ← ~1.3 s

    chunks.set(key, chunk); chunkDataPool.register(key, chunk); pristineChunks.add(key);
    queueAdjacentChunksForUpdate(cx, cz, key);

    await saveChunkToCache(key, chunk);                      // line 38990  ← 8.7 s compress + awaited IDB write
    if (chunkDataPool.diskStorageReady) {
        chunkDataPool.writeToDisk(key, chunk).catch(() => {}); // line 38994  ← OPFS (20.9 s on disk worker)
    }
    return chunk;
}
```

Because the 18 generation promises are `Promise.all`'d, the **worker terrain steps overlap** (workers idle ≈85%) but the **main-thread Pass-4/5/6 + compression for all 18 results serialize** on the single main thread — that's the 18.8 s + 8.7 s.

Supporting facts (verified):
- `calculateChunkSunlight` is defined at **38039** and is **main-thread only** — it is *not* among the functions injected into the chunk worker. The worker injection regions are `__TREE_FUNCS_START__` (**18619**) and `__TERRAIN_FUNCS_START__` (**18625**); the worker `self.onmessage` is at **18741**. The worker generates terrain/water/trees but returns **blocks only** (`generateTerrainViaWorker`, **19671**).
- The lighting lookup tables (`SUNLIGHT_ATTENUATION` at **16782**, plus `IS_TRANSPARENT` / `BLOCKLIGHT_ATTENUATION`) live on the main thread and are **not** currently present in the worker (the worker meshes from light *values* passed to it, not from these tables).
- `saveChunkToCache` (**26904**) calls `ChunkCompressor.compress()` (**~26911**) → `_compressArray` (**25673**) synchronously **before** awaiting the IndexedDB transaction — so both the compression CPU *and* the IDB write latency are on the per-chunk critical path at line 38990.
- The cached-chunk fast path (Phase 1B, line **27232–27236**) also calls `calculateChunkSunlight` + `saveChunkToCache`, but only when the cache version is stale; on a fresh world every chunk takes the Phase-1C generate path above.

---

## The fix — three independent levers (ordered by risk/reward)

### Lever 1 (biggest win, higher effort) — compute sunlight **in the worker**

Move Pass 4 off the main thread by having the terrain worker compute per-chunk sunlight and return it alongside the blocks. This removes the **18.8 s** of main-thread `calculateChunkSunlight`. Pass 5 (block light) is handled for free: **freshly generated terrain never contains TORCH or FIRE blocks**, so `calculateBlockLight` always produces an all-zero array there — the worker simply returns a zeroed `blockLight` and the main thread skips Pass 5 too (byte-identical result, no extra dependencies pulled into the worker).

**Why this is safe to offload (verified):**
- `calculateChunkSunlight` (line **38039**) is **per-chunk and self-contained** — it reads only `chunk.blocks` + the static tables `IS_TRANSPARENT`, `SUNLIGHT_ATTENUATION`, and `NEIGHBOR_OFFSETS`. It does **not** touch neighbor chunks (cross-chunk propagation is a separate later step — `propagateLightFromNeighbors` / edge lighting — which **stays on the main thread, unchanged**).
- The worker **already has `IS_TRANSPARENT`** (injected at line **19300**) and the block constants **`TORCH=10` / `FIRE=16`** (worker template lines **18388–18389**). It is missing only **`SUNLIGHT_ATTENUATION`** and **`NEIGHBOR_OFFSETS`**, both small static arrays.
- This matches the existing single-source injection model (terrain/tree/mesh functions are already injected the same way), so there is no hand-maintained worker copy to keep in sync.

This is **six exact edits**, all in `voxEx.html`. Line numbers are current as of build .21; match on the quoted text (the file shifts).

#### Edit 1a — worker `generate` handler: compute sunlight, return all three buffers

In the worker message handler, **replace lines 18787–18799** (the tree-gen + post-back block):

```js
                // --- Phase 3: Tree generation ---
                // Clear tree mask cache for this generation (ensures fresh calculation)
                treeMaskCache.clear();
                generateTreesForChunk(cx, cz, blocks, chunkSize, chunkHeight, startX, startZ, workerNumericSeed, get, set, caches);

                // Transfer the buffer (zero-copy)
                self.postMessage({
                    type: 'terrain',
                    jobId: jobId,
                    cx: cx,
                    cz: cz,
                    blocks: blocks
                }, [blocks.buffer]);
```

with:

```js
                // --- Phase 3: Tree generation ---
                // Clear tree mask cache for this generation (ensures fresh calculation)
                treeMaskCache.clear();
                generateTreesForChunk(cx, cz, blocks, chunkSize, chunkHeight, startX, startZ, workerNumericSeed, get, set, caches);

                // --- Phase 4 (VOXEX-CCR-PERF-013): per-chunk sunlight on the worker ---
                // blockLight stays all-zero: generated terrain has no TORCH/FIRE, so the main-thread
                // calculateBlockLight would produce zeros anyway (invariant guarded by the parity test).
                const size = chunkSize * chunkSize * chunkHeight;
                const lightChunk = { blocks: blocks, skyLight: new Uint8Array(size), blockLight: new Uint8Array(size) };
                calculateChunkSunlight(lightChunk, chunkSize, chunkHeight);
                const skyLight = lightChunk.skyLight;
                const blockLight = lightChunk.blockLight;

                // Transfer all three buffers (zero-copy)
                self.postMessage({
                    type: 'terrain',
                    jobId: jobId,
                    cx: cx,
                    cz: cz,
                    blocks: blocks,
                    skyLight: skyLight,
                    blockLight: blockLight
                }, [blocks.buffer, skyLight.buffer, blockLight.buffer]);
```

> Note: `calculateChunkSunlight` is a top-level function declaration, so it is hoisted in the worker — callable here even though Edit 1c injects its text later in the file. The injected `const` tables (Edit 1b) are likewise all evaluated when the worker script first runs, before any `generate` message is handled (same reason `IS_TRANSPARENT` already works in the mesh handler).

#### Edit 1b — inject the two missing data tables into the worker

In `buildChunkWorkerCode`, in the mesh-data injection block, **immediately after the existing `IS_TRANSPARENT` line (19300)**:

```js
                meshCode += '    const IS_TRANSPARENT = new Uint8Array(' + JSON.stringify(Array.from(IS_TRANSPARENT)) + ');\n';
```

add:

```js
                // VOXEX-CCR-PERF-013: tables needed by the injected calculateChunkSunlight
                meshCode += '    const SUNLIGHT_ATTENUATION = new Uint8Array(' + JSON.stringify(Array.from(SUNLIGHT_ATTENUATION)) + ');\n';
                meshCode += '    const NEIGHBOR_OFFSETS = ' + JSON.stringify(NEIGHBOR_OFFSETS) + ';\n';
```

(`SUNLIGHT_ATTENUATION` is defined at line **16782**, `NEIGHBOR_OFFSETS` at **9816** — both in main-thread scope, available where `buildChunkWorkerCode` runs.)

#### Edit 1c — inject `calculateChunkSunlight` as a worker function

In the `meshFuncs` array (ends at line **19343–19344**), add `calculateChunkSunlight`. Change:

```js
                    cellCornerLightDamped, extractLightFromChunk, clearGreedyBuffers, greedyMeshSection
                ];
```

to:

```js
                    cellCornerLightDamped, extractLightFromChunk, clearGreedyBuffers, greedyMeshSection,
                    calculateChunkSunlight   // VOXEX-CCR-PERF-013: per-chunk sunlight on the worker
                ];
```

The existing loop at **19345–19348** already injects every function in this array via `Function.toString()`, so no other injection code is needed.

#### Edit 1d — `generateTerrainViaWorker`: return the whole result

**Replace lines 19688–19689:**

```js
                    const result = await chunkWorkerPool.generateTerrain(cx, cz, finalSeedDisplay);
                    return result.blocks;
```

with:

```js
                    const result = await chunkWorkerPool.generateTerrain(cx, cz, finalSeedDisplay);
                    // VOXEX-CCR-PERF-013: pass worker-computed light through to generateChunkData
                    return result; // { blocks, skyLight, blockLight, cx, cz, ... }
```

> Verify `ChunkWorkerPool.generateTerrain` returns the resolved worker payload unchanged. `_handleWorkerMessage` (line **19448**) resolves jobs with `{ type, ...data }`, so `skyLight`/`blockLight` flow through automatically **unless** `generateTerrain` destructures and rebuilds a `{ blocks }`-only object — if it does, widen it to include `skyLight`/`blockLight`.

#### Edit 1e — `generateChunkData`: consume worker light, skip Pass 4/5 (with main-thread fallback)

**Replace the worker-success block, lines 38942–38977** (from `let workerBlocks = null;` through the Pass-5 `chunk.genState |= GEN_PASS.BLOCKLIGHT;`). Current:

```js
                    let workerBlocks = null;
                    if (SETTINGS.useWorkers && chunkWorkerPool) {
                        try {
                            workerBlocks = await generateTerrainViaWorker(cx, cz);
                            if (workerBlocks) {
                                // Worker generation succeeded — no logging needed
                            }
                        } catch (e) {
                            logDebug(`[Worker] Failed, falling back to main thread: ${e.message}`);
                        }
                    }

                    if (workerBlocks) {
                        // Worker generated terrain + water + trees (Phase 3) - only need lighting on main thread
                        const size = chunkSize * chunkSize * chunkHeight;
                        const chunk = {
                            blocks: workerBlocks,
                            skyLight: new Uint8Array(size),
                            blockLight: new Uint8Array(size),
                            cx,
                            cz,
                            startX,
                            startZ,
                            genState: GEN_PASS.TERRAIN | GEN_PASS.WATER | GEN_PASS.DECORATIONS, // Worker did all generation
                            sections: createSectionData(),
                        };

                        // Trees already generated in worker - skip decorations pass

                        // --- PASS 4: Calculate sunlight ---
                        calculateChunkSunlight(chunk, chunkSize, chunkHeight);
                        chunk.genState |= GEN_PASS.SUNLIGHT;

                        // --- PASS 5: Calculate block light ---
                        calculateBlockLight(chunk, chunkSize, chunkHeight);
                        chunk.genState |= GEN_PASS.BLOCKLIGHT;
```

with:

```js
                    let workerResult = null;
                    if (SETTINGS.useWorkers && chunkWorkerPool) {
                        try {
                            workerResult = await generateTerrainViaWorker(cx, cz); // { blocks, skyLight, blockLight }
                        } catch (e) {
                            logDebug(`[Worker] Failed, falling back to main thread: ${e.message}`);
                        }
                    }

                    if (workerResult && workerResult.blocks) {
                        const size = chunkSize * chunkSize * chunkHeight;
                        // VOXEX-CCR-PERF-013: prefer worker-computed light. If absent (workers off,
                        // older worker, or WORKER_LIGHTING_ENABLED=false → injection omitted), fall
                        // back to computing it here — the pre-CCR-013 behavior.
                        const hasWorkerLight = !!(workerResult.skyLight && workerResult.blockLight);
                        const chunk = {
                            blocks: workerResult.blocks,
                            skyLight: hasWorkerLight ? workerResult.skyLight : new Uint8Array(size),
                            blockLight: hasWorkerLight ? workerResult.blockLight : new Uint8Array(size),
                            cx,
                            cz,
                            startX,
                            startZ,
                            genState: GEN_PASS.TERRAIN | GEN_PASS.WATER | GEN_PASS.DECORATIONS, // Worker did all generation
                            sections: createSectionData(),
                        };

                        // Trees already generated in worker - skip decorations pass

                        if (hasWorkerLight) {
                            // Worker already did Pass 4 (sunlight) + Pass 5 (blockLight = zeros).
                            chunk.genState |= GEN_PASS.SUNLIGHT | GEN_PASS.BLOCKLIGHT;
                        } else {
                            // --- PASS 4: Calculate sunlight (fallback) ---
                            calculateChunkSunlight(chunk, chunkSize, chunkHeight);
                            chunk.genState |= GEN_PASS.SUNLIGHT;
                            // --- PASS 5: Calculate block light (fallback) ---
                            calculateBlockLight(chunk, chunkSize, chunkHeight);
                            chunk.genState |= GEN_PASS.BLOCKLIGHT;
                        }
```

The rest of that branch (PASS 6 `analyzeChunkSections`, `chunks.set`, `saveChunkToCache`, return) is unchanged. The non-worker fallback path below it (line **39000+**) is untouched.

#### Edit 1f — feature flag (recommended)

Add a module-scope flag next to the other worker flags (e.g. near `WORKER_MESH_PIPELINE_ENABLED`):

```js
const WORKER_LIGHTING_ENABLED = true; // VOXEX-CCR-PERF-013: compute per-chunk sunlight in the worker
```

Gate Edits 1a–1c on it inside `buildChunkWorkerCode` (when `false`, omit the `calculateChunkSunlight` injection + the sunlight call in the worker handler so the worker posts blocks only). Because Edit 1e already keys off `hasWorkerLight`, turning the flag off cleanly reverts to main-thread lighting — a one-line kill switch if the parity test ever regresses.

**Parity test (mandatory before enabling):** add a test to `tools/voxex-tests.html` (it already has the worker round-trip + mesh byte-parity infrastructure — "Tier 4") that, for a fixed synthetic chunk: (1) asserts the worker-returned `skyLight` is **byte-identical** to main-thread `calculateChunkSunlight` on the same blocks, and (2) asserts the worker `blockLight` is all-zero **and** equals main-thread `calculateBlockLight` output. Assertion (2) is also the guard for the "generated terrain has no emissive blocks" invariant — if a future feature ever emits torch/fire during generation, this test fails and tells you to inject the real `calculateBlockLight` (which would then also need `getTorchBlockLightLevel` + `BLOCK_LIGHT_EMISSION` + their deps in the worker).

> Risk: medium — a worker-parity change, the category CLAUDE.md treats most carefully. Fully mitigated by the byte-parity test + the `hasWorkerLight` fallback + the `WORKER_LIGHTING_ENABLED` kill switch. Reward: removes the single biggest main-thread load cost (18.8 s, ~40% of gen). Visual check after enabling: fresh terrain lighting (caves, canopies, overhangs, shorelines) looks identical with no dark/bright seams at chunk borders.

### Lever 2 — defer the spawn-time caching ⚠️ SHIPPED IN .23, REGRESSED, DISABLED IN .24

> **Status (2026-06-23):** Lever 2 was implemented in build **.23** (commit `ee506f0`) using the "2a" approach below, **caused a world-entry freeze regression**, and was **disabled in build .24** by forcing `_pregenActive = false` (the deferral never activates → reverts to per-chunk saving during pregen). This section documents what went wrong and the corrected design. **Do not re-enable the .23 implementation as-is.**

**Original intent (still valid):** during spawn pregen, every freshly generated chunk is compressed (8.7 s main, `ChunkCompressor.compress` → `_compressArray`) and written to IndexedDB + OPFS. That work isn't needed to get the player *into* the world, so the idea was to defer it.

#### What the .23 implementation did, and why it froze

It added `_pregenActive` (set `true` for Phase 1C), routed per-chunk saves into a `_pregenPendingSaves` Set instead of writing them, and after Phase 1C flushed everything with a single `batchSaveChunksToCache(saveMap)` call (fire-and-forget via `.then()`), plus a `pagehide` safety flush.

**The bug:** `batchSaveChunksToCache` (line **27094**) compresses **every** chunk in the map **synchronously**, in one tight `for` loop inside the Promise executor (`ChunkCompressor.compress(chunkData)` at line **27107**), *before* any yield. With per-chunk saving (the original), each ~29 ms compression was interleaved across Phase 1C **behind the loading screen**, with `setTimeout(0)` yields between generation batches — invisible to the user. Lever 2 collected **all** spawn chunks (hundreds) and handed them to that loop in **one call at the start of Phase 2 (world-entry)** → the entire **~8.7 s of compression ran as a single synchronous main-thread block right when the player expected to start playing.** Observed symptoms (test laptop, deployed .23): pressing ESC didn't pause until the block finished ("pauses after a long time"), and chunk meshing/rendering couldn't run during the block ("chunks not loading in at all"). The `.then()` "fire-and-forget" did **not** help — the compression is synchronous *inside* the function body, before the awaited IDB transaction.

**Secondary fragility found:** `_pregenActive` is set `true` (line 27310) / `false` (line 27347) **without a `try/finally`**. If anything in Phase 1C throws, the flag stays `true` and **every** subsequent gameplay chunk save is silently deferred forever (chunks never persist). Not the cause of this regression, but a latent footgun that must be fixed in any re-enable.
>
> **Hardened 2026-07-11:** even though Lever 2's deferral is still disabled today (no live `_pregenActive = true` site — it's only ever read/forced-false), the Phase 1C generation block in `preGenerateSpawnChunks` (grep `=== PHASE 1C`) is now wrapped in a `try { ... } finally { _pregenActive = false; }` matching Option C's recommended shape below, so any future re-enable can't reintroduce this footgun.

#### Why "defer to after-entry" is the wrong shape

The 8.7 s of compression is **unavoidable main-thread CPU** (RLE over three 81,920-cell arrays per chunk, ~29 ms each — already longer than one frame). It has to run *somewhere* on the main thread. The original ran it **during the loading screen**, which is exactly when the user is already waiting and background work is expected. Deferring it to **after entry** moves that cost into live gameplay, where it either freezes (one batch, the .23 bug) or stutters (spread out — see Option C). So deferral, by itself, makes the experience **worse**, not better. The only way to actually *remove* the 8.7 s rather than relocate it is to take it **off the main thread**.

#### Fixes (in recommended order)

**Option A — abandon the deferral (DONE in .24, recommended).** Keep compression where it belongs: per-chunk during Phase 1C, behind the loading screen. This is the current state (`_pregenActive = false` at line 27310). Net effect: Lever 2 provides no real win and should stay disabled. If you want the dead code gone, also remove `_pregenActive` / `_pregenPendingSaves` (lines 13781–13782), the `if (_pregenActive)` branch in `generateChunkData` (line 39061), the post-Phase-1C flush block (lines 27347–27362), and the `pagehide` handler (line 24607 region). Lowest risk.

**Option B — offload compression to a worker (the real win, follow-up).** Move `ChunkCompressor.compress` off the main thread so neither the load *nor* gameplay pays the 8.7 s. The OPFS disk-storage worker (`ChunkDiskStorage`, its own thread, already does `writeChunk`/`readChunk`) is the natural home — pass it the raw chunk arrays (zero-copy transfer) and have it compress + persist. This genuinely removes 8.7 s of main-thread CPU from the whole flow. Larger change (worker protocol + moving the compressor source into the worker), and `ChunkCompressor` must stay byte-compatible so existing cached records still decode — needs a round-trip test. This is the correct long-term lever if spawn caching cost matters.

**Option C — if you insist on deferral, make the flush yield (and fix the flag).** Better than the .23 freeze but still competes with early gameplay (each chunk ~29 ms, so a thin trickle of occasional dropped frames over the first minute rather than one 8.7 s freeze). Three edits:

1. **Wrap the flag in `try/finally`** so a Phase 1C throw can't strand it. Around the Phase 1C block (lines 27310–27347):
   ```js
   _pregenActive = true;
   try {
       if (chunksNeedingGeneration.length > 0) { /* … existing Phase 1C loop … */ }
   } finally {
       _pregenActive = false;
   }
   ```
2. **Replace the single-call flush** (lines 27348–27362) with a fire-and-forget call to a new yielding helper, started after entry settles:
   ```js
   if (_pregenPendingSaves.size > 0) {
       const keys = Array.from(_pregenPendingSaves);
       _pregenPendingSaves.clear();
       // Start after the first chunks have streamed/meshed so we don't fight world-entry.
       setTimeout(() => { flushPregenCachesInBackground(keys); }, 1500);
   }
   ```
3. **Add the helper** (module scope, near `batchSaveChunksToCache`) — small sub-batches with a yield between each so compression never blocks a frame for long. **Do not** change `batchSaveChunksToCache` itself (it's shared by the world-save / normal-save paths at lines 22564, 26790, 26868 and must stay atomic):
   ```js
   async function flushPregenCachesInBackground(keys) {
       const SUB_BATCH = 2;        // chunks compressed per tick (each ~29 ms — keep small)
       const TICK_MS = 60;         // generous yield so gameplay/meshing stays smooth
       for (let i = 0; i < keys.length; i += SUB_BATCH) {
           const saveMap = new Map();
           for (let n = i; n < i + SUB_BATCH && n < keys.length; n++) {
               const k = keys[n];
               if (chunks.has(k)) saveMap.set(k, chunks.get(k));
           }
           if (saveMap.size > 0) {
               try {
                   await batchSaveChunksToCache(saveMap);
                   if (chunkDataPool.diskStorageReady) {
                       for (const [k, c] of saveMap) chunkDataPool.writeToDisk(k, c).catch(() => {});
                   }
               } catch (e) { logDebug(`[PreGen] Background flush sub-batch error: ${e.message}`); }
           }
           await new Promise(r => setTimeout(r, TICK_MS)); // yield to gameplay
       }
       logDebug(`[PreGen] Background cache flush complete (${keys.length} chunks)`);
   }
   ```
   Re-enable by setting `_pregenActive = true` for Phase 1C again (revert the .24 line 27310 change). Keep the `pagehide` flush for the early-quit case.

> Recommendation: **stay on Option A (.24)** for now — it's stable and the deferral never bought a real win. If reducing spawn-caching cost becomes a priority, do **Option B** (worker offload), not Option C. Option C is only worth it if a worker offload is off the table and you accept minor early-game stutter in exchange for a faster time-to-interactive.

### Lever 3 (cheapest win) — scale `preGenRenderDistance` down on low-end devices

All three costs (lighting, compression, disk I/O) scale linearly with the number of spawn chunks. The spawn radius is `SETTINGS.preGenRenderDistance` (used at `preGenerateSpawnChunks(... radius = SETTINGS.preGenRenderDistance)`, line **27026** region; `totalChunks = ⌈π·r²⌉`). A smaller default on weak hardware cuts the whole 71 s proportionally.

**Implementation:** lower the default `preGenRenderDistance` (in `DEFAULTS`) and/or pin a smaller value in the **Performance** settings profile, optionally auto-derived from `navigator.hardwareConcurrency` / `deviceMemory` (the codebase already auto-derives worker count and memory budget this way). Bump `SETTINGS_VERSION` if the default changes so devices pick it up. The "Generating World" screen already shows during pregen, so a smaller radius simply means a shorter wait before play; the rest streams in normally afterward.

> Risk: very low (a default/profile value). Trade-off: a slightly smaller pre-generated bubble at spawn, with the remainder streamed as the player moves (already the normal behavior beyond the pregen radius).

### Related (separate CCR) — loading feedback

This CCR is about *shrinking* the wait. The *perceived* wait (the ~10 s blank gap before the "Generating World" screen appears, and the silent `initDatabase` hang) is the subject of the companion loading-screen CCR. The two are complementary: even after Levers 1–3, the load is non-trivial on weak hardware, so the loading screen still matters.

---

## Cross-system effects & risk summary

- **Levers are independent and can land separately.** Recommended order: **Lever 3** (trivial), then **Lever 2** (defer caching, low risk, removes 8.7 s), then **Lever 1** (worker lighting, biggest win, needs parity test).
- **Lever 1 is the only one touching worker parity** — the project's highest-care category. It must ship with a worker-light byte-parity test (sibling to the existing worker-mesh parity test) and a fallback flag. Cross-chunk/edge lighting on the main thread is **unchanged** — only the per-chunk base light moves.
- **Lever 2 changes *when* chunks are cached, not *whether*.** Determinism guarantees correctness; the only cost of an early quit is re-generation next load. Add a `pagehide`/`beforeunload` flush for safety.
- **Lever 3 is a settings default** — round-trips through the existing save/load + profile system; bump `SETTINGS_VERSION` if the default value changes.
- **No per-frame render-loop work is added** by any lever. Lever 1 *removes* main-thread work during load; Lever 2 *moves* it after load.
- **Single-file rule honored** — all changes stay in `voxEx.html`. Lever 1 edits the main-thread lighting source + the worker injection loop (the worker copy stays generated, not hand-maintained), per the CLAUDE.md worker-parity rules.

---

## Verification plan (when implementing)

1. **Re-capture the same flow** (Create World → Start Game, no skip) on the test laptop and compare the trace: target a large drop in `calculateChunkSunlight` main-thread self-time (Lever 1) and `_compressArray` main-thread self-time (Lever 2), and a shorter Start-Game→playable span.
2. **Lever 1 parity:** new `tools/voxex-tests.html` test asserts worker `skyLight`/`blockLight` are byte-identical to `calculateChunkSunlight`/`calculateBlockLight` for a fixed synthetic chunk (no-neighbor case). Must be green before enabling the worker-light path. Visually confirm no dark/over-bright seams on fresh terrain (caves, tree canopies, overhangs, shorelines).
3. **Lever 2:** confirm chunks still persist — generate a spawn world, move a little, reload, and verify the spawn area loads from cache (not regenerated) on the second load; confirm an immediate quit-after-start doesn't corrupt anything (chunks simply regenerate).
4. **Lever 3:** confirm the smaller default pregen radius shortens the wait and that streaming fills in the surroundings smoothly as the player moves; verify the value round-trips through settings/profiles and that `SETTINGS_VERSION` forces the new default.
5. Run the full `tools/voxex-tests.html` suite (285 tests as of build 2026-06-23.20) — all green.
6. On apply: bump `VOXEX_BUILD` (line 3936) and prepend a `VOXEX_RECENT_CHANGES` entry (line 3944).

---

## Recommendation

**As-built status (2026-06-23):**

- **Lever 1 (worker sunlight)** — shipped in build **.22**, currently **enabled**. Works correctly (verified end-to-end) but produced little wall-clock improvement, because spawn load was never main-thread-*CPU*-bound — it's paced by the async caching/IDB/OPFS pipeline. Lever 1 mostly bought main-thread headroom (smoother, fewer freezes). Keep it on; it's not the regression.
- **Lever 2 (defer caching)** — shipped in build **.23**, **regressed** (one ~8.7 s synchronous compression freeze at world-entry — ESC stalled, chunks didn't render), **disabled in build .24**. See the Lever 2 section: the deferral idea is the wrong shape (compression must run on the main thread, and after-entry is the worst place for it). **Do not re-enable as built.**
- **Lever 3 (smaller pregen radius on low-end)** — **not yet implemented.** This is now the best remaining quick win.

**Forward plan:** (1) keep Lever 1 on and Lever 2 off (current .24 state); (2) do **Lever 3** next — it linearly shrinks *all three* costs (lighting, compression, disk I/O) and can't introduce a freeze; (3) if spawn-caching cost still matters after that, pursue **Lever 2 Option B** (offload `ChunkCompressor.compress` to the OPFS worker) to actually remove the 8.7 s from the main thread, rather than relocating it. The real lesson from the .23 regression: relocating unavoidable main-thread CPU into live gameplay is worse than leaving it behind the loading screen — only moving it *off-thread* (worker) genuinely helps. All changes stay within `voxEx.html`.

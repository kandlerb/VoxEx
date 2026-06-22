# CCR — Sunlight Priming: Full 320-Cell Synchronous Column Walk on Every Transparent Edit

**ID:** VOXEX-CCR-LIGHT-002
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟢 **Implemented — build 2026-06-22.7. Lever 1 shipped; Lever 2 deferred. 282/282 tests green.**
**Companions (this does NOT supersede them):**
- `CCR-edge-lighting-redundant-recompute.md` (VOXEX-CCR-LIGHT-001) — the *other half* of the same backlog note. LIGHT-001 removes the redundant full-chunk `calculateChunkSunlight()` recompute inside `processEdgeLightingUpdates()` ("cache validity"). **This CCR is the "defer priming" half** and is fully orthogonal to it: LIGHT-001 fires during world *streaming* (chunk/neighbor arrival); this one fires on player *edits* (mining/placing). Different trigger, different function, no overlap.
- `CCR-idle-streaming-remesh-reduction.md` (VOXEX-CCR-CHUNK-002) — already shipped the high-impact piece (the `genState & GEN_PASS.SUNLIGHT` flag that stopped false-positive lighting-invalidation driving idle chunks to ~3× remeshes). **What remains here is explicitly incremental** — a per-edit micro-cost, not the streaming-stall fix CHUNK-002 already landed.

**Scope:** Stop walking the entire 320-tall sunlight column from world-top to world-bottom — through ~640+ string-keyed chunk accessor calls — on *every* edit that makes a block more transparent (every block break). Two levers: (1) **hoist the loop-invariant chunk lookup out of the per-cell loop** (result-identical on the reachable edit path, zero behavioral risk — the recommended change), and (2) optionally **scope the walk to the affected sub-column** below the edit ("defer/limit priming" — separable, with one honest caveat). No change to terrain generation, lighting *results*, BFS propagation, remesh scheduling, or visuals.

> **Line numbers are as of the working tree on 2026-06-22 (build `2026-06-22.6`) and WILL drift** — grep the quoted identifier/string before editing, per repo convention.

---

## Summary

- **Observed (by code audit):** On every block edit that reduces a cell's sunlight attenuation (i.e. essentially every block break — stone→air, leaves→air, glass→air, …), `updateSunlightAt()` (line **24956**) sets `shouldPrimeColumn` and calls `primeSunlightColumn()` (line **24657**), which walks the **full `WORLD_DIMS.chunkHeight` = 320-cell column** from `maxY` down to `minY`, **synchronously on the main thread**, before the async `SunlightTask` BFS even starts.
- **Each of those 320 iterations** calls `getBlock(x, cy, z)` **and** `getSkyLight(x, cy, z)`, plus `setSkyLight(...)` on each changed cell. Those names are thin module-level wrappers (lines **24505 / 24506 / 24508**) that forward to the `VoxelWorld` methods `getBlock` (**7358**), `getSkyLight` (**7552**) and `setSkyLight` (**7582**). Every one of those methods **rebuilds a `` `${cx},${cz}` `` template-string key** (lines **7365 / 7560 / 7589**) before doing its chunk lookup. So one prime = **≥ 640 string allocations** (320 × getBlock + 320 × getSkyLight) **+ up to ~320 extra `chunkDataPool.get()` Map lookups** — because `setSkyLight` has **no `_lastChunk` cache** (unlike `getBlock`/`getSkyLight`) and re-fetches the chunk from the pool on every single write.
- **The redundancy is total on the read side.** The entire column shares one fixed `(x, z)`, hence one fixed `(cx, cz)`, hence **one chunk**. The `blocks` / `skyLight` typed arrays are **loop-invariant** for all 320 cells, yet the function re-resolves the chunk (and re-allocates its key string) 320 times over.
- **Most of the walk does nothing.** The prime starts at the sky (`currentLight = 15`) and only changes a cell when `target !== prev`. For a near-surface edit, the entire air column **above** the edit (often 150–200 cells of `skyLight = 15`) is read and found unchanged — pure no-op iterations. For a deep edit, the column above is solid rock already at `skyLight = 1` — again read, again unchanged.
- **Root cause:** `primeSunlightColumn` is written against the *global* world accessors (`getBlock`/`getSkyLight`/`setSkyLight`) for clarity, but those are general-purpose, allocate a string key per call, and (for `setSkyLight`) re-do the pool lookup per call — overheads that are invisible at a single call site but multiply by 320 here, per edit, on the input-latency-sensitive main thread.
- **Recommended fix (Lever 1):** resolve the chunk **once**, then index `chunk.skyLight` / `chunk.blocks` directly inside the loop. Identical results on the reachable edit path, ~640+ fewer allocations and ~320 fewer Map lookups per edit, zero behavioral change. (One intentional, unreachable-in-practice divergence on legacy/partial chunk formats — documented under "Correctness," below.)
- **Optional (Lever 2, separable):** start the walk at the edit height instead of world-top, since a transparency *increase* can only affect cells **at or below** the edit (sunlight falls downward). Saves the no-op above-edit span. Carries one honest caveat (below) — recommend shipping Lever 1 alone first.

---

## Root cause detail

### The trigger — `updateSunlightAt()` (lines 24956–24997)

```js
function updateSunlightAt(x, y, z, oldId, newId, tracker, primeColumn = false) {
    const oldAttenuation = SUNLIGHT_ATTENUATION[oldId] ?? SUNLIGHT_ATTENUATION[AIR];
    const newAttenuation = SUNLIGHT_ATTENUATION[newId] ?? SUNLIGHT_ATTENUATION[AIR];
    const currentLight = getSkyLight(x, y, z);
    const becameOpaque = newAttenuation >= 15 && oldAttenuation < 15;
    const becameMoreTransparent = newAttenuation < oldAttenuation;
    const shouldPrimeColumn = primeColumn || becameMoreTransparent;
    const task = new SunlightTask(x, y, z, oldId, newId, tracker);
    if (shouldPrimeColumn) {
        primeSunlightColumn(task, x, z, tracker);   // <-- synchronous full-column walk
    }
    ...
    return task;
}
```

`primeColumn` arrives `true` for opaque→transparent edits (`primeColumn: IS_TRANSPARENT[id] && !IS_TRANSPARENT[oldId]`, the block-edit enqueue at line **25275**, re-derived for coalesced same-position edits at **25287**). But even when `primeColumn` is `false`, the `|| becameMoreTransparent` operand still fires the prime whenever the new block attenuates *less* than the old one (e.g. **leaves→air**, attenuation `1 → 0` — `primeColumn` is false there because leaves are already `IS_TRANSPARENT`, but `becameMoreTransparent` is true). **Net: every block break that lowers attenuation primes the full column.** The neighbor-spill relight job (line **24582**) passes `primeColumn: false`, but those still prime if they lower attenuation.

### The cost — `primeSunlightColumn()` (current source, lines 24657–24681)

```js
function primeSunlightColumn(task, x, z, tracker) {
    const minY = -WORLD_DIMS.yOffset;
    const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;   // 320-cell span
    let currentLight = 15;
    let anyChange = false;
    for (let cy = maxY; cy >= minY; cy--) {
        const blockId = getBlock(x, cy, z);                 // <-- string-key alloc + lookup, ×320
        if (blockId === undefined) continue;                // Skip unloaded chunks
        const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;
        const target = currentLight > 1 ? currentLight : 1;
        const prev = getSkyLight(x, cy, z);                 // <-- string-key alloc + lookup, ×320
        if (target !== prev) {
            setSkyLight(x, cy, z, target);                  // <-- string-key alloc + pool.get(), no cache
            anyChange = true;
            if (task) {
                if (target > prev) { task.enqueueAdd(x, cy, z, target); }
                else { task.enqueueRemove(x, cy, z, prev); }
            }
        }
        if (attenuation >= 15) { currentLight = 1; }
        else if (attenuation > 0) { currentLight = currentLight > attenuation ? currentLight - attenuation : 1; }
    }
    if (anyChange) {
        const chunkKey = getChunkKey(Math.floor(x / WORLD_DIMS.chunkSize), Math.floor(z / WORLD_DIMS.chunkSize));
        tracker?.mark(chunkKey);
        task?.ensureQueued();
    }
    return anyChange;
}
```

### Why the accessors are the wrong tool here

All three accessors are general-purpose `VoxelWorld` helpers (reached via the thin module wrappers at 24505/24506/24508) that allocate a key string up front:

- **`getBlock`** (7358) and **`getSkyLight`** (7552): build `` `${cx},${cz}` `` (lines 7365 / 7560) *then* consult a single-entry `_lastChunk`/`_lastChunkKey` cache (7367 / 7563). Within one column (constant `cx,cz`) the cache hits after the first call, so the *pool lookup* is skipped — **but the string is still allocated every iteration**, before the cache check.
- **`setSkyLight`** (7582): builds the key (7589) **and has no `_lastChunk` cache** — it calls `chunkDataPool.get(key)` (7593) on **every** write. On a freshly mined surface column where many cells change, that is a full pool lookup per changed cell.

All three resolve through the *same* path — `chunkDataPool.get(key)` (which auto-decompresses and touches LRU, see `ChunkDataPool.get`, line **8028**), falling back to `this.chunks.get(key)` only when `chunkDataPool` is undefined. The column is entirely inside **one** chunk. The index math is identical across all three arrays: `idx = (x & 15) + ((z & 15) << 4) + (ly << 8)` with `ly = cy + WORLD_DIMS.yOffset` (computed at lines 7384 / 7571 / 7597). So the chunk and the `(x&15)+((z&15)<<4)` base are loop-invariant; only `(ly << 8)` varies.

### Per-edit cost, concretely

For one transparent edit (320-iteration prime), on the **synchronous main-thread path** of an interactive action (block break):

- **≥ 640 template-string allocations** (320 getBlock + 320 getSkyLight), GC pressure.
- **Up to ~320 `chunkDataPool.get()` Map lookups** from the cache-less `setSkyLight` (bounded by the number of changed cells; large for surface columns, near-zero for deep solid columns).
- **320** `SUNLIGHT_ATTENUATION[...]` table reads + branch logic.
- The large majority of iterations produce **no change** (the unchanged air/rock span above the edit).

> **Honest scoping of impact:** these are *operation counts read from source*, not a profiled millisecond figure — and the backlog note itself rates this "incremental." It fires per *edit*, not per *frame*, so it is not a steady-state FPS drain. Where it bites is **input latency on rapid/auto mining** (holding break, mining straight down) and **GC churn** from the per-cell string keys. The exact wall-clock saving is device- and terrain-dependent and must be measured in-browser (see Test plan). What is *not* in doubt: the read-side chunk re-resolution is provably redundant and removable with no result change on the reachable edit path.

---

## Proposed fix

### Lever 1 — hoist the loop-invariant chunk lookup (RECOMMENDED)

Resolve the chunk once; index the typed arrays directly. Preserve the `setSkyLight` clamp semantics (target is already in `[1,15]`: it starts at 15 and only decreases, and `target = currentLight > 1 ? currentLight : 1` guarantees ≥1 — so a direct write matches `THREE.MathUtils.clamp(level, 1, 15)` exactly). The chunk is resolved through the same `chunkDataPool.get()` path the accessors use, so it is the same decompressed object they would read and write.

**Replacement body for `primeSunlightColumn` (lines 24657–24681):**

```js
function primeSunlightColumn(task, x, z, tracker) {
    // VOXEX-CCR-LIGHT-002 (Lever 1): one fixed (x,z) => one fixed chunk for the whole column.
    // Resolve it ONCE and index directly instead of calling getBlock/getSkyLight/setSkyLight
    // 320× each (every one of which rebuilds a `${cx},${cz}` key; setSkyLight also re-does a
    // pool lookup per write). Same chunkDataPool.get() resolution path the accessors use,
    // same idx math, same [1,15] range, same enqueues — result-identical on the edit path.
    const cx = x >> 4, cz = z >> 4;
    const chunk = (typeof chunkDataPool !== 'undefined' ? chunkDataPool.get(getChunkKey(cx, cz))
                                                        : voxelWorld.chunks.get(getChunkKey(cx, cz)));
    // Edit path always reaches here with a loaded, object-format chunk (see Correctness).
    // If blocks/skyLight are absent (legacy raw-array or partial chunk), the original walk
    // could only no-op or write nothing useful, so an early return is the safe equivalent.
    if (!chunk || !chunk.blocks || !chunk.skyLight) return false;
    const blocks = chunk.blocks, sky = chunk.skyLight;
    const colBase = (x & 15) + ((z & 15) << 4);   // loop-invariant XZ offset
    const minY = -WORLD_DIMS.yOffset;
    const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;
    let currentLight = 15;
    let anyChange = false;
    for (let cy = maxY; cy >= minY; cy--) {
        const idx = colBase + ((cy + WORLD_DIMS.yOffset) << 8);
        const blockId = blocks[idx];
        const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;   // ?? 0 now unreachable (Uint8 read) — kept for parity
        const target = currentLight > 1 ? currentLight : 1;
        const prev = sky[idx];
        if (target !== prev) {
            sky[idx] = target;                       // target ∈ [1,15] already → matches setSkyLight clamp
            anyChange = true;
            if (task) {
                if (target > prev) { task.enqueueAdd(x, cy, z, target); }
                else { task.enqueueRemove(x, cy, z, prev); }
            }
        }
        if (attenuation >= 15) { currentLight = 1; }
        else if (attenuation > 0) { currentLight = currentLight > attenuation ? currentLight - attenuation : 1; }
    }
    if (anyChange) { const chunkKey = getChunkKey(cx, cz); tracker?.mark(chunkKey); task?.ensureQueued(); }
    return anyChange;
}
```

**Why this is the minimal-risk shape:**
- **Strictly removes work** — ~640+ string allocations and up to ~320 pool lookups per edit collapse to **one** chunk resolution + direct typed-array indexing. Adds nothing to any path.
- **Result-identical on the reachable edit path.** Same chunk (same `chunkDataPool.get()` resolution), same `idx` formula, same `[1,15]` range, same `task.enqueueAdd/enqueueRemove` calls in the same order, same `anyChange`/`tracker.mark`/`ensureQueued` tail. The `SunlightTask` BFS that runs afterward is fed identical input, so the final lighting is unchanged.
- **No new identifiers of consequence** (`blocks`/`sky`/`idx`/`colBase`/`cx`/`cz`/`chunk` are block-locals; `getChunkKey`, `chunkDataPool`, `voxelWorld`, `WORLD_DIMS`, `SUNLIGHT_ATTENUATION` are read, not redeclared). No new state, settings, DOM, or `SETTINGS_VERSION` bump.
- **`cx = x >> 4` matches `Math.floor(x / WORLD_DIMS.chunkSize)`** for `chunkSize === 16` across all integers (including negatives), so the tail's `getChunkKey(cx, cz)` keys the same chunk as the original tail. It is also exactly what the accessors compute internally (e.g. `getBlock` line 7363).

### Lever 2 — scope the walk to the affected sub-column (OPTIONAL; defer, do not bundle)

The prime starts at the sky and re-derives the whole column, but a transparency **increase** at the edit height `editY` can only raise light at **`editY` and below** — the prime does purely *vertical* propagation (attenuation 0 leaves `currentLight` untouched), so nothing *above* the edit changes. The walk could therefore start at `editY` (seeding `currentLight` from the already-correct stored `skyLight` just above the edit) and skip the no-op span above. For a surface edit that is the bulk of the 320 cells. (Horizontal spill is handled separately by the `SunlightTask` BFS and is unaffected by where the prime starts.)

**The one honest caveat — why this is separate, not bundled:** the current full walk re-derives from `currentLight = 15` at the top **every time**, which makes it *self-correcting* — if the column above `editY` were ever stale (e.g. a higher edit's prime/BFS hadn't settled yet during a rapid multi-edit burst on the same column), the full walk silently repairs it. A scoped walk instead *trusts* the stored `skyLight` above `editY` as its seed. In normal flow that seed is correct (the above-column is maintained by this same mechanism, and out-of-order same-column edits within one tick are rare and coalesced for the *same position* at line **25287**). Any residual staleness is benign and self-heals on the next edit, the edge-lighting pass, the watchdog, or a remesh — it can only ever leave a cell **brighter**, never produce a dark seam (the seed is ≥ the true value when stale-bright). Still: this trades a result-identical transform (Lever 1) for an almost-always-exact one. **Recommendation: ship Lever 1 alone; consider Lever 2 only if profiling shows the above-edit no-op span is a measured cost**, and if taken, gate it so deep edits (where the above span is solid rock already at 1) don't pay extra branching.

---

## Correctness — why Lever 1 cannot change any lighting result on the edit path

- **Same data, same index.** `getBlock`/`getSkyLight`/`setSkyLight` resolve `(x,cy,z)` to the *same* `chunk` (all three go through `chunkDataPool.get(key)`, line 8028, which decompresses and returns the same object) and the *same* `idx = (x&15)+((z&15)<<4)+((cy+yOffset)<<8)` that Lever 1 computes inline. Reading `blocks[idx]` / `sky[idx]` returns identical values; writing `sky[idx] = target` stores the identical byte.
- **Clamp parity.** `setSkyLight` clamps to `[1,15]`. In this function `target` is already in `[1,15]` (proof above), so the clamp was a no-op and the direct write is equivalent.
- **Enqueue parity.** The `if (target !== prev)` decision, and the `enqueueAdd(target)` / `enqueueRemove(prev)` branch, are unchanged — so the `SunlightTask` add/remove queues are populated identically, and the downstream async BFS produces identical lighting.
- **Tail parity.** `anyChange`, `tracker?.mark(chunkKey)`, and `task?.ensureQueued()` fire under the identical condition. (Return value is unused by the only caller, `updateSunlightAt` line 24968, but is preserved.)

### The one intentional divergence (unreachable on the edit path)

The original resolves the chunk **per cell** through `getBlock`/`getSkyLight`/`setSkyLight`, which carry three degenerate-input behaviors that Lever 1 folds into the single up-front guard `if (!chunk || !chunk.blocks || !chunk.skyLight) return false`:

1. **Chunk missing.** Original: `getBlock` returns `undefined` → `continue` for every cell → `anyChange` stays `false` → returns `false` with no writes. Lever 1: early `return false`. **Equivalent.**
2. **Legacy raw-array chunk** (`chunk` *is* a `Uint8Array`, no `.blocks`). Original: `getBlock` reads `chunk[idx]` (line 7385 fallback), but `getSkyLight`/`setSkyLight` see `!chunk.skyLight` and return `15` / no-op — so it would `enqueue` against `prev = 15` yet never actually write light. Lever 1: early `return false`. **Divergent, but unreachable here:** the edit that triggers this path runs through the global `setBlock` → `VoxelWorld.setBlock`, which upgrades any legacy chunk to object format with `skyLight`/`blockLight` (lines 7426–7441) *before* `applyLocalizedRelight` (24642, guarded by `chunks.has(key)`) reaches `updateSunlightAt`.
3. **Object chunk missing `skyLight`.** Same as (2): `setBlock` always materializes `skyLight`/`blockLight` (7439–7440), so a loaded, edited column always has both arrays.
4. **Compressed chunk.** `chunkDataPool.get(key)` (`ChunkDataPool.get`, line ~8029) auto-decompresses a compressed chunk before returning — checking `data._compressed` and calling `this.decompressChunk(key)` before the reference is returned. Both Lever 1 (one `chunkDataPool.get()` before the loop) and the original `setSkyLight` (which also calls `chunkDataPool.get()` at line ~7594 — the reason it was fixed to use the pool rather than `chunks.get()` directly) take this path identically. By the time `primeSunlightColumn` is called, `VoxelWorld.setBlock` has already called `chunkDataPool.get()` for its own format upgrade, so the chunk is already decompressed in the cache; nonetheless the one up-front call here is correct and sufficient. **Equivalent.**

In other words, the change is **result-identical for every chunk that can actually reach this function** (loaded, object-format, with `blocks` and `skyLight` present), and the only behavior it drops is a no-op or a write-nothing path on chunk shapes the edit pipeline guarantees can't arrive. This is the precise, honest claim — not unconditional byte-exactness.

### Benign, non-result-affecting side-effect difference

The original mutates `voxelWorld._lastChunkKey` / `_lastChunk` ~320× as a side effect of the accessor calls; Lever 1 never touches that cache (it calls `chunkDataPool.get()` once, which *does* still touch the pool's LRU at line 8046, so eviction ordering is unaffected). The `_lastChunk` cache is self-correcting — every accessor re-checks `key === this._lastChunkKey` and refetches on miss — so leaving it pointing at whatever it held before the prime can only cost one extra cache miss on the next unrelated accessor call, never a wrong value. No lighting, visual, or save-state consequence; noted only so a future reader profiling cache hit-rates isn't surprised.

This is therefore a **pure-performance refactor** on the reachable path: no new behavior, no transient, no visual difference — strictly safer than LIGHT-001 (which disclosed one benign over-bright transient). Lever 2, if ever taken, carries the single self-healing-brightness caveat documented above.

---

## Exact change (line-by-line)

Single edit: **replace the body of `primeSunlightColumn` at lines 24657–24681** with the Lever 1 body above. No other lines change. Diff intent, statement by statement:

| Original (24657–24681) | Replacement | Reason |
|---|---|---|
| `getBlock(x, cy, z)` per cell (× up to 320) | resolve `chunk` once via `chunkDataPool.get(getChunkKey(cx, cz))`; read `blocks[idx]` | removes 320 `${cx},${cz}` allocations + cache churn; same value |
| `if (blockId === undefined) continue;` | dropped; covered by up-front `if (!chunk || !chunk.blocks || !chunk.skyLight) return false;` | with the chunk resolved once, every in-range index is a valid `Uint8Array` read — the per-cell `undefined` guard only ever fired on a missing chunk |
| `getSkyLight(x, cy, z)` per cell (× up to 320) | `sky[idx]` | removes 320 `${cx},${cz}` allocations; same value |
| `setSkyLight(x, cy, z, target)` per changed cell | `sky[idx] = target;` | removes up to ~320 `chunkDataPool.get()` lookups (setSkyLight has no `_lastChunk` cache); `target ∈ [1,15]` so the dropped `clamp(level,1,15)` was a no-op |
| `getChunkKey(Math.floor(x/chunkSize), Math.floor(z/chunkSize))` in the tail | `getChunkKey(cx, cz)` with `cx = x >> 4, cz = z >> 4` | identical key for `chunkSize === 16`; reuses the `cx/cz` already computed for the lookup |
| `SUNLIGHT_ATTENUATION[blockId] ?? 0` | unchanged (kept) | now unreachable (`blocks[idx]` is always a valid `Uint8`), retained verbatim for parity / zero behavioral delta |

Everything else inside the loop (`target`/`prev` computation, the `target !== prev` branch, both `enqueueAdd`/`enqueueRemove` arms, the attenuation step, `anyChange`, and the `tracker?.mark` / `task?.ensureQueued` tail) is **carried over unchanged**.

---

## Safety checks

- **Single-file rule:** change is confined to the body of `primeSunlightColumn()` in `voxEx.html`; no new files or assets.
- **No duplicate/shadowed identifiers:** no new top-level declarations. `blocks`/`sky`/`idx`/`colBase`/`cx`/`cz`/`chunk` are block-locals inside the function; `getChunkKey`, `chunkDataPool`, `voxelWorld`, `WORLD_DIMS`, `SUNLIGHT_ATTENUATION`, and the `getBlock`/`getSkyLight`/`setSkyLight` wrappers (which remain in use elsewhere) are read, not redeclared. No globals (`scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`) reshadowed.
- **No DOM/settings wiring:** no new settings, DOM IDs, or save/load fields; nothing to round-trip; no `SETTINGS_VERSION`/cache-version bump.
- **Per-edit cost:** strictly *removes* work (320× chunk re-resolution + ≥640 string allocations + up to ~320 pool lookups → one resolution + direct indexing); adds nothing. Not in the per-frame render loop — fires only on transparent edits.
- **Hot-path discipline:** single flat `for` loop over the fixed column (no added nesting); honors the "≤2 nested loops in hot paths" rule. No allocations inside the loop after the fix.
- **Lighting-result parity:** **result-identical** for Lever 1 on the reachable edit path (proof above) — same chunk, same index, same range, same enqueues, same BFS input. Cannot darken or brighten any cell relative to current behavior. The single intentional divergence is on legacy/partial chunk shapes the edit pipeline (`VoxelWorld.setBlock` upgrade, 7426–7441) guarantees cannot reach this function. (Lever 2, if taken, can only ever leave a cell brighter — never a dark seam — and self-heals; it is *not* part of the recommended change.)
- **Worker parity:** none required — `primeSunlightColumn`/`updateSunlightAt`/the accessors are main-thread-only; not injected into `buildChunkWorkerCode()`. No worker template edit.
- **Invariant relied upon (Lever 1):** a fixed `(x,z)` maps to exactly one chunk, and `chunk.blocks`/`chunk.skyLight` are present & correctly sized whenever the chunk is loaded — held by `VoxelWorld.setBlock`'s format upgrade (7426–7441) and by `applyLocalizedRelight`'s own `chunks.has(key)` guard (line 24642) before `updateSunlightAt` is reached.

## Test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204 tests; serve over localhost; on this headless box drive installed Chrome via puppeteer-core/SwiftShader). Lighting + meshing coverage should stay green — expect the documented `214/214 ... All green!`.
- **Parity probe (validates Lever 1 on the reachable path):** temporarily snapshot `chunk.skyLight` after a prime under the *old* code and under the *new* code for the same edit (same seed/position), and assert the arrays are identical — for a surface edit (large changed span), a deep-cave edit (mostly unchanged), and a leaves→air edit (the `becameMoreTransparent`-only path). Also assert the `task.addQueue`/`removeQueue` contents match. Remove before shipping.
- **Manual mining test:** break a vertical column of blocks from the surface to bedrock (and hold-to-auto-mine) on a **fresh** world and a **cached/OPFS-restored** world; confirm lighting under and around each broken block is correct — caves stay dark, newly-exposed columns light correctly down to where attenuation stops, torches unaffected — and that there is **no** input-latency regression. Place blocks back (opaque edit → the `becameOpaque` branch, not the prime) to confirm that path is untouched.
- **GC / latency measurement (honest impact):** with the perf overlay (`O`) open, bracket `primeSunlightColumn` with `performance.now()` (or use the `meshProfile()` seam) over a fixed auto-mine run, before vs. after, and report the **measured** main-thread saving + any drop in minor-GC frequency rather than the op-count estimate above.
- **Build banner:** on implementation, bump `VOXEX_BUILD` (line **3929**) + add a `VOXEX_RECENT_CHANGES` line (line **3933**, top of `voxEx.html`).

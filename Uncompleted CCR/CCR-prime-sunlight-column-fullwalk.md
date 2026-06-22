# CCR — Sunlight Priming: Full 320-Cell Synchronous Column Walk on Every Transparent Edit

**ID:** VOXEX-CCR-LIGHT-002
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟡 **Proposal / report only — no code applied yet.** Read & debate first.
**Companions (this does NOT supersede them):**
- `CCR-edge-lighting-redundant-recompute.md` (VOXEX-CCR-LIGHT-001) — the *other half* of the same backlog note. LIGHT-001 removes the redundant full-chunk `calculateChunkSunlight()` recompute inside `processEdgeLightingUpdates()` ("cache validity"). **This CCR is the "defer priming" half** and is fully orthogonal to it: LIGHT-001 fires during world *streaming* (chunk/neighbor arrival); this one fires on player *edits* (mining/placing). Different trigger, different function, no overlap.
- `CCR-idle-streaming-remesh-reduction.md` (VOXEX-CCR-CHUNK-002) — already shipped the high-impact piece (the `genState & GEN_PASS.SUNLIGHT` flag that stopped false-positive lighting-invalidation driving idle chunks to ~3× remeshes). **What remains here is explicitly incremental** — a per-edit micro-cost, not the streaming-stall fix CHUNK-002 already landed.

**Scope:** Stop walking the entire 320-tall sunlight column from world-top to world-bottom — through ~640+ string-keyed chunk accessor calls — on *every* edit that makes a block more transparent (every block break). Two levers: (1) **hoist the loop-invariant chunk lookup out of the per-cell loop** (byte-exact, zero behavioral risk — the recommended change), and (2) optionally **scope the walk to the affected sub-column** below the edit ("defer/limit priming" — separable, with one honest caveat). No change to terrain generation, lighting *results*, BFS propagation, remesh scheduling, or visuals.

> **Line numbers are as of the working tree on 2026-06-22 (build `2026-06-22.3`) and WILL drift** — grep the quoted identifier/string before editing, per repo convention.

---

## Summary

- **Observed (by code audit):** On every block edit that reduces a cell's sunlight attenuation (i.e. essentially every block break — stone→air, leaves→air, glass→air, …), `updateSunlightAt()` sets `shouldPrimeColumn` and calls `primeSunlightColumn()` (line **24608**), which walks the **full `WORLD_DIMS.chunkHeight` = 320-cell column** from `maxY` down to `minY`, **synchronously on the main thread**, before the async `SunlightTask` BFS even starts.
- **Each of those 320 iterations** calls `getBlock(x, cy, z)` **and** `getSkyLight(x, cy, z)`, plus `setSkyLight(...)` on each changed cell. Every one of those accessors **rebuilds a `` `${cx},${cz}` `` template-string key** (lines **7351 / 7546 / 7575**) before doing its chunk lookup. So one prime = **≥ 640 string allocations** (320 × getBlock + 320 × getSkyLight) **+ up to ~320 extra `chunkDataPool.get()` Map lookups** — because `setSkyLight` has **no `_lastChunk` cache** (unlike `getBlock`/`getSkyLight`) and re-fetches the chunk from the pool on every single write.
- **The redundancy is total on the read side.** The entire column shares one fixed `(x, z)`, hence one fixed `(cx, cz)`, hence **one chunk**. The `blocks` / `skyLight` typed arrays are **loop-invariant** for all 320 cells, yet the function re-resolves the chunk (and re-allocates its key string) 320 times over.
- **Most of the walk does nothing.** The prime starts at the sky (`currentLight = 15`) and only changes a cell when `target !== prev`. For a near-surface edit, the entire air column **above** the edit (often 150–200 cells of `skyLight = 15`) is read and found unchanged — pure no-op iterations. For a deep edit, the column above is solid rock already at `skyLight = 1` — again read, again unchanged.
- **Root cause:** `primeSunlightColumn` is written against the *global* world accessors (`getBlock`/`getSkyLight`/`setSkyLight`) for clarity, but those are general-purpose, allocate a string key per call, and (for `setSkyLight`) re-do the pool lookup per call — overheads that are invisible at a single call site but multiply by 320 here, per edit, on the input-latency-sensitive main thread.
- **Recommended fix (Lever 1, byte-exact):** resolve the chunk **once**, then index `chunk.skyLight` / `chunk.blocks` directly inside the loop. Identical results, ~640+ fewer allocations and ~320 fewer Map lookups per edit, zero behavioral change.
- **Optional (Lever 2, separable):** start the walk at the edit height instead of world-top, since a transparency *increase* can only affect cells **at or below** the edit (sunlight falls downward). Saves the no-op above-edit span. Carries one honest caveat (below) — recommend shipping Lever 1 alone first.

---

## Root cause detail

### The trigger — `updateSunlightAt()` (lines 24907–24920)

```js
function updateSunlightAt(x, y, z, oldId, newId, tracker, primeColumn = false) {
    const oldAttenuation = SUNLIGHT_ATTENUATION[oldId] ?? SUNLIGHT_ATTENUATION[AIR];
    const newAttenuation = SUNLIGHT_ATTENUATION[newId] ?? SUNLIGHT_ATTENUATION[AIR];
    ...
    const becameMoreTransparent = newAttenuation < oldAttenuation;
    const shouldPrimeColumn = primeColumn || becameMoreTransparent;
    const task = new SunlightTask(x, y, z, oldId, newId, tracker);
    if (shouldPrimeColumn) {
        primeSunlightColumn(task, x, z, tracker);   // <-- synchronous full-column walk
    }
    ...
}
```

`primeColumn` arrives `true` for opaque→transparent edits (`primeColumn: IS_TRANSPARENT[id] && !IS_TRANSPARENT[oldId]`, the block-edit enqueue at line **25226**, re-derived for coalesced edits at **25238**). But even when `primeColumn` is `false`, the `|| becameMoreTransparent` operand still fires the prime whenever the new block attenuates *less* than the old one (e.g. **leaves→air**, attenuation `1 → 0` — `primeColumn` is false there because leaves are already `IS_TRANSPARENT`, but `becameMoreTransparent` is true). **Net: every block break that lowers attenuation primes the full column.** The neighbor-spill relight job (line 24533) passes `primeColumn: false`, but those still prime if they lower attenuation.

### The cost — `primeSunlightColumn()` (lines 24608–24632)

```js
function primeSunlightColumn(task, x, z, tracker) {
    const minY = -WORLD_DIMS.yOffset;
    const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;   // 320-cell span
    let currentLight = 15;
    let anyChange = false;
    for (let cy = maxY; cy >= minY; cy--) {
        const blockId = getBlock(x, cy, z);                 // <-- string-key alloc + lookup, ×320
        if (blockId === undefined) continue;
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
    if (anyChange) { ... tracker?.mark(chunkKey); task?.ensureQueued(); }
    return anyChange;
}
```

### Why the accessors are the wrong tool here

All three accessors are general-purpose world helpers that allocate a key string up front:

- **`getBlock`** (7344) and **`getSkyLight`** (7538): build `` `${cx},${cz}` `` (lines 7351 / 7546) *then* consult a single-entry `_lastChunk`/`_lastChunkKey` cache. Within one column (constant `cx,cz`) the cache hits after the first call, so the *pool lookup* is skipped — **but the string is still allocated every iteration**, before the cache check.
- **`setSkyLight`** (7568): builds the key (7575) **and has no `_lastChunk` cache** — it calls `chunkDataPool.get(key)` (7579) on **every** write. On a freshly mined surface column where many cells change, that is a full pool lookup per changed cell.

The column is entirely inside **one** chunk. The index math is identical across all three arrays: `idx = (x & 15) + ((z & 15) << 4) + (ly << 8)` with `ly = cy + WORLD_DIMS.yOffset` (lines 7557 / 7583 / 7370). So the chunk and the `(x&15)+((z&15)<<4)` base are loop-invariant; only `(ly << 8)` varies.

### Per-edit cost, concretely

For one transparent edit (320-iteration prime), on the **synchronous main-thread path** of an interactive action (block break):

- **≥ 640 template-string allocations** (320 getBlock + 320 getSkyLight), GC pressure.
- **Up to ~320 `chunkDataPool.get()` Map lookups** from the cache-less `setSkyLight` (bounded by the number of changed cells; large for surface columns, near-zero for deep solid columns).
- **320** `SUNLIGHT_ATTENUATION[...]` table reads + branch logic.
- The large majority of iterations produce **no change** (the unchanged air/rock span above the edit).

> **Honest scoping of impact:** these are *operation counts read from source*, not a profiled millisecond figure — and the backlog note itself rates this "incremental." It fires per *edit*, not per *frame*, so it is not a steady-state FPS drain. Where it bites is **input latency on rapid/auto mining** (holding break, mining straight down) and **GC churn** from the per-cell string keys. The exact wall-clock saving is device- and terrain-dependent and must be measured in-browser (see Test plan). What is *not* in doubt: the read-side chunk re-resolution is provably redundant and removable with **zero** behavioral change.

---

## Proposed fix

### Lever 1 — hoist the loop-invariant chunk lookup (RECOMMENDED; byte-exact, zero risk)

Resolve the chunk once; index the typed arrays directly. Preserve the `setSkyLight` clamp semantics (target is already in `[1,15]`: it starts at 15 and only decreases, and `target = currentLight > 1 ? currentLight : 1` guarantees ≥1 — so a direct write matches `THREE.MathUtils.clamp(level, 1, 15)` exactly). If the chunk is absent, the original walk was an all-`continue` no-op anyway, so an early return is equivalent.

```js
function primeSunlightColumn(task, x, z, tracker) {
    // VOXEX-CCR-LIGHT-002 (Lever 1): one fixed (x,z) => one fixed chunk for the whole column.
    // Resolve it ONCE and index directly instead of calling getBlock/getSkyLight/setSkyLight
    // 320× each (every one of which rebuilds a `${cx},${cz}` key; setSkyLight also re-does a
    // pool lookup per write). Byte-exact: same idx math, same [1,15] range, same enqueues.
    const cx = x >> 4, cz = z >> 4;
    const chunk = (typeof chunkDataPool !== 'undefined' ? chunkDataPool.get(getChunkKey(cx, cz))
                                                        : voxelWorld.chunks.get(getChunkKey(cx, cz)));
    if (!chunk || !chunk.blocks || !chunk.skyLight) return false;   // matches the old all-`continue` no-op
    const blocks = chunk.blocks, sky = chunk.skyLight;
    const colBase = (x & 15) + ((z & 15) << 4);   // loop-invariant XZ offset
    const minY = -WORLD_DIMS.yOffset;
    const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;
    let currentLight = 15;
    let anyChange = false;
    for (let cy = maxY; cy >= minY; cy--) {
        const idx = colBase + (((cy + WORLD_DIMS.yOffset)) << 8);
        const blockId = blocks[idx];
        const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;
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
- **Byte-exact results.** Same `idx` formula, same `[1,15]` range, same `task.enqueueAdd/enqueueRemove` calls in the same order, same `anyChange`/`tracker.mark`/`ensureQueued` tail. The `SunlightTask` BFS that runs afterward is fed identical input, so the final lighting is bit-for-bit unchanged.
- **No new identifiers of consequence** (`blocks`/`sky`/`idx`/`colBase`/`cx`/`cz` are block-locals; `getChunkKey`, `chunkDataPool`, `voxelWorld`, `WORLD_DIMS`, `SUNLIGHT_ATTENUATION` are read, not redeclared). No new state, settings, DOM, or `SETTINGS_VERSION` bump.
- **Edge cases preserved.** Absent/compressed chunk: `chunkDataPool.get()` already returns the decompressed chunk (same path the accessors use); if truly missing, the early return matches the old all-`continue` behavior. `blockId === undefined` in the original only occurred when the chunk was missing — with the chunk resolved once, every in-range index is a valid `Uint8Array` read, so the per-cell `undefined` guard is subsumed by the single up-front null check.

### Lever 2 — scope the walk to the affected sub-column (OPTIONAL; defer, do not bundle)

The prime starts at the sky and re-derives the whole column, but a transparency **increase** at the edit height `editY` can only raise light at **`editY` and below** — sunlight falls straight down (attenuation 0 leaves `currentLight` untouched), so nothing *above* the edit changes. The walk could therefore start at `editY` (seeding `currentLight` from the already-correct stored column just above) and skip the no-op span above. For a surface edit that is the bulk of the 320 cells.

**The one honest caveat — why this is separate, not bundled:** the current full walk re-derives from `currentLight = 15` at the top **every time**, which makes it *self-correcting* — if the column above `editY` were ever stale (e.g. a higher edit's prime/BFS hadn't settled yet during a rapid multi-edit burst on the same column), the full walk silently repairs it. A scoped walk instead *trusts* the stored `skyLight` above `editY` as its seed. In normal flow that seed is correct (the above-column is maintained by this same mechanism, and out-of-order same-column edits within one tick are rare and coalesced for the *same position* at line 25234). Any residual staleness is benign and self-heals on the next edit, the edge-lighting pass, the watchdog, or a remesh — it can only ever leave a cell **brighter**, never produce a dark seam (the seed is ≥ the true value when stale-bright). Still: this trades a provably-exact transform (Lever 1) for an almost-always-exact one. **Recommendation: ship Lever 1 alone; consider Lever 2 only if profiling shows the above-edit no-op span is a measured cost**, and if taken, gate it so deep edits (where the above span is solid rock already at 1) don't pay extra branching.

---

## Correctness — why Lever 1 cannot change any lighting result

- **Same data, same index.** `getBlock`/`getSkyLight`/`setSkyLight` resolve `(x,cy,z)` to the *same* `chunk` and the *same* `idx = (x&15)+((z&15)<<4)+((cy+yOffset)<<8)` that Lever 1 computes inline. Reading `blocks[idx]` / `sky[idx]` returns identical values; writing `sky[idx] = target` stores the identical byte.
- **Clamp parity.** `setSkyLight` clamps to `[1,15]`. In this function `target` is already in `[1,15]` (proof above), so the clamp was a no-op and the direct write is equivalent.
- **Enqueue parity.** The `if (target !== prev)` decision, and the `enqueueAdd(target)` / `enqueueRemove(prev)` branch, are unchanged — so the `SunlightTask` add/remove queues are populated identically, and the downstream async BFS produces identical lighting.
- **Tail parity.** `anyChange`, `tracker?.mark(chunkKey)`, and `task?.ensureQueued()` fire under the identical condition.

This is therefore a **pure-performance refactor**: no new behavior, no transient, no visual difference — strictly safer than LIGHT-001 (which disclosed one benign over-bright transient). Lever 2, if ever taken, carries the single self-healing-brightness caveat documented above.

---

## Safety checks

- **Single-file rule:** change is confined to the body of `primeSunlightColumn()` in `voxEx.html`; no new files or assets.
- **No duplicate/shadowed identifiers:** no new top-level declarations. `blocks`/`sky`/`idx`/`colBase`/`cx`/`cz`/`chunk` are block-locals inside the function; `getChunkKey`, `chunkDataPool`, `voxelWorld`, `WORLD_DIMS`, `SUNLIGHT_ATTENUATION`, `getSkyLight`/`setSkyLight`/`getBlock` (which remain in use elsewhere) are read, not redeclared. No globals (`scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`) reshadowed.
- **No DOM/settings wiring:** no new settings, DOM IDs, or save/load fields; nothing to round-trip; no `SETTINGS_VERSION`/cache-version bump.
- **Per-edit cost:** strictly *removes* work (320× chunk re-resolution + ≥640 string allocations + up to ~320 pool lookups → one resolution + direct indexing); adds nothing. Not in the per-frame render loop — fires only on transparent edits.
- **Hot-path discipline:** single flat `for` loop over the fixed column (no added nesting); honors the "≤2 nested loops in hot paths" rule. No allocations inside the loop after the fix.
- **Lighting-result parity:** **byte-exact** for Lever 1 (proof above) — same chunk, same index, same range, same enqueues, same BFS input. Cannot darken or brighten any cell relative to current behavior. (Lever 2, if taken, can only ever leave a cell brighter — never a dark seam — and self-heals; it is *not* part of the recommended change.)
- **Worker parity:** none required — `primeSunlightColumn`/`updateSunlightAt`/the accessors are main-thread-only; not injected into `buildChunkWorkerCode()`. No worker template edit.
- **Invariant relied upon (Lever 1):** a fixed `(x,z)` maps to exactly one chunk, and `chunk.blocks`/`chunk.skyLight` are present & correctly sized whenever the chunk is loaded — held by the chunk-format invariant and by `applyLocalizedRelight`'s own `chunks.has(key)` guard (line 24593) before `updateSunlightAt` is reached.

## Test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204 tests; serve over localhost; on this headless box drive installed Chrome via puppeteer-core/SwiftShader). Lighting + meshing coverage should stay green — expect the documented `214/214 ... All green!`.
- **Parity probe (validates Lever 1 byte-exactness):** temporarily snapshot `chunk.skyLight` after a prime under the *old* code and under the *new* code for the same edit (same seed/position), and assert the arrays are identical — for a surface edit (large changed span), a deep-cave edit (mostly unchanged), and a leaves→air edit (the `becameMoreTransparent`-only path). Also assert the `task.addQueue`/`removeQueue` contents match. Remove before shipping.
- **Manual mining test:** break a vertical column of blocks from the surface to bedrock (and hold-to-auto-mine) on a **fresh** world and a **cached/OPFS-restored** world; confirm lighting under and around each broken block is correct — caves stay dark, newly-exposed columns light correctly down to where attenuation stops, torches unaffected — and that there is **no** input-latency regression. Place blocks back (opaque edit → the `becameOpaque` branch, not the prime) to confirm that path is untouched.
- **GC / latency measurement (honest impact):** with the perf overlay (`O`) open, bracket `primeSunlightColumn` with `performance.now()` (or use the `meshProfile()` seam) over a fixed auto-mine run, before vs. after, and report the **measured** main-thread saving + any drop in minor-GC frequency rather than the op-count estimate above.
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`, ~line 3929).

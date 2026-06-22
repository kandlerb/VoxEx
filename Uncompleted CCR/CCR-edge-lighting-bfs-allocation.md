# CCR — Edge-Lighting BFS Allocation Churn: Per-Node Array Garbage in the Streaming Hot Path

**ID:** VOXEX-CCR-LIGHT-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** Proposal / report only — no code applied yet
**Scope:** Eliminate the per-BFS-node array allocation and per-call queue allocation inside `propagateLightFromEdgesInward()`, the cross-chunk edge-lighting flood-fill that runs on the **main thread every frame during streaming**. Pure performance / GC change — **no light value changes**, output byte-identical. Does NOT touch convergence, the pass cap, remesh debounce, or any logic that prior CCRs (`CCR-CHUNK-002` consolidation, idle-streaming remesh reduction) tuned.

---

## Summary

- **Problem class (derived, not measured here):** a clear allocation anti-pattern on the main-thread streaming path that violates the project's "no allocations in hot paths" rule. It produces GC pressure **proportional to streaming activity** (chunks loading as the player moves — the most common activity). Whether that pressure surfaces as a *visible* frame-time hitch is device-dependent and is **not measured in this report** (the headless SwiftShader box here is not a representative frame-time profiler — see Test plan); the claim defended below is the derivable allocation count, and the fix removes provable garbage with byte-identical output.
- **Root cause:** `propagateLightFromEdgesInward()` (lines **17327–17403**) spreads edge skylight into a chunk's interior with a BFS. For **every dequeued node** it allocates a fresh 6×3 array-of-arrays literal — `const neighbors = [[…],[…],…]` (lines **17385–17389**) — and then iterates it with `for (const [nx,ny,nz] of neighbors)` (line **17391**), which also allocates a destructuring iterator. That is **~7 short-lived array objects + 1 iterator per node**. The queue itself is a fresh growable array (`const queue = []`, line **17333**) reallocated on every call.
- **Why it's expensive:** The seed loops (lines **17336–17371**) enqueue *every transparent edge cell with skylight > 1* — which for an ordinary surface chunk is the **entire air column above the terrain on all four edges** (skylight 15, transparent). That is **~15,000 seed nodes per call**. Each is dequeued and allocates its neighbor garbage — and then propagates **nothing**, because the enqueue guard at line **17397** (`if (propagated > skyLight[nIdx])`) immediately fails against already-lit air (`14 > 15` is false). So the dominant cost is **~120K throwaway allocations per call that accomplish no work**, repeated up to `MAX_EDGE_LIGHTING_PASSES = 3` times per chunk, across a `budget = 4` chunks/frame — i.e. **hundreds of thousands of dead allocations per frame** on the main thread while streaming.
- **The asymmetry is the whole story:** the function's *useful* output (spreading light into cave/overhang cells that just brightened at a border) is a tiny fraction of the cells it touches; the *cost* is paid on every lit air cell it needlessly re-seeds and re-dequeues. The allocation fix removes the **per-node garbage** from that wasted traversal without changing a single light value. The traversal's CPU (the seed scan + dequeue + neighbor tests) still runs allocation-free; eliminating it is the optional secondary, not the core fix.
- **Recommended fix:** Two mechanical, behavior-preserving changes. (1) Iterate the hoisted `NEIGHBOR_OFFSETS` table (line **9770**) instead of allocating a per-node `neighbors` literal — exactly what the sibling sunlight BFS in `calculateChunkSunlight` already does (line **37877**); this is the dominant win. (2) Reuse one dedicated module-scope scratch queue (declared adjacent to `NEIGHBOR_OFFSETS`) instead of allocating a fresh growable array each call. Net per-frame **allocations** in this path drop from hundreds of thousands to ~zero. Light output is identical (a monotonic max-flood-fill converges to the same fixpoint regardless of neighbor visitation order). The allocation-free seed-scan/dequeue **CPU** is unchanged — reducing *that* is the separate, higher-risk optional secondary below.

---

## Where it runs / how to observe

`propagateLightFromEdgesInward()` is invoked **only** from `processEdgeLightingUpdates()` (line **17433**), at two mutually-exclusive branches:

- line **17522** — when neighbor light just arrived and brightened cells (`edgeChanged > 0`), and
- line **17535** — on the first pass after a fresh sunlight recompute.

`processEdgeLightingUpdates(budget = 4)` is **called from the main game loop** (line **42492**, inside `animate()`); its own comment at line **17431** reads *"Process edge lighting updates - called from the main game loop."* It pulls up to **4 chunks per frame** off `edgeLightingUpdateQueue` and runs them up to `MAX_EDGE_LIGHTING_PASSES = 3` consecutive passes (line **16890**) before the convergence cap stops them. Every freshly-streamed chunk that has all-neighbor lighting flows through this path at least once — so during continuous movement at any non-trivial render distance, this runs on the main thread on most frames.

**To observe:** with the world streaming (walk or fly through fresh terrain), open DevTools → Performance, record a few seconds of movement, and look at the **JS Heap sawtooth** and **Minor GC** frequency. The bulk of the short-lived allocations attributable to lighting come from this function's per-node `neighbors` literals. A Memory → Allocation-instrumentation timeline taken while crossing chunk borders shows a dense band of tiny `Array` allocations originating here. (Headless SwiftShader on this box can run the logic but is not a representative frame-time profiler — measure allocation counts and GC, not absolute ms.)

---

## Root cause detail

### The flood-fill — `propagateLightFromEdgesInward()` (lines 17327–17403)

```js
function propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight) {
    const skyLight = chunk.skyLight;
    const blocks = chunk.blocks;
    const cs = chunkSize;

    // BFS queue: [lx, ly, lz, level]
    const queue = [];                                   // (1) fresh growable array every call

    // Seed queue with all edge blocks that have light > 1
    // West edge (lx = 0)
    for (let lz = 0; lz < cs; lz++) {
        for (let ly = 0; ly < chunkHeight; ly++) {      // 16 × 320 = 5,120 cells scanned
            const idx = 0 + lz * cs + ly * cs * cs;
            if (skyLight[idx] > 1 && IS_TRANSPARENT[blocks[idx]]) {
                queue.push(0, ly, lz, skyLight[idx]);   // air column above terrain → ~256 seeds/column
            }
        }
    }
    // East / North / South edges: same pattern (lines 17345–17371)
    // ...

    // BFS propagation into interior
    let qIdx = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++];
        const ly = queue[qIdx++];
        const lz = queue[qIdx++];
        const level = queue[qIdx++];

        const propagated = level - 1;
        if (propagated <= 1) continue;

        // Check 6 neighbors (but only within chunk)
        const neighbors = [                              // (2) 7 array objects allocated PER NODE
            [lx - 1, ly, lz], [lx + 1, ly, lz],
            [lx, ly - 1, lz], [lx, ly + 1, lz],
            [lx, ly, lz - 1], [lx, ly, lz + 1]
        ];

        for (const [nx, ny, nz] of neighbors) {          // (3) destructuring iterator allocated per node
            if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;
            const nIdx = nx + nz * cs + ny * cs * cs;
            if (!IS_TRANSPARENT[blocks[nIdx]]) continue;
            if (propagated > skyLight[nIdx]) {           // (4) already-lit air fails this → no spread
                skyLight[nIdx] = propagated;
                queue.push(nx, ny, nz, propagated);
            }
        }
    }
}
```

Three allocation sites, ranked by cost:

- **(2) the per-node `neighbors` literal — the dominant cost.** One outer array plus six inner `[x,y,z]` arrays = **7 array allocations for every dequeued node**, plus **(3)** the `for…of` destructuring iterator. This fires on every node, including the thousands of lit-air seeds that propagate nothing.
- **(1) the per-call `queue` array** — a fresh growable `Array` that auto-reallocates as it grows to ~60K slots (4 ints × ~15K seeds). One large reallocating array per call.

### Why the BFS does NOT fan out (so the work is mostly wasted)

Above-surface air is already `skyLight = 15` from `calculateChunkSunlight`. A level-15 seed yields `propagated = 14`; its air neighbors are already 15; the guard at line **17397** (`14 > 15`) is false, so **nothing is written and nothing is re-enqueued**. The BFS therefore *terminates at the seed* for every already-lit air cell. Genuine fan-out happens only at shadow/terrain boundaries near the edge (cave mouths, overhangs) — a small minority of cells. So the ~15K lit-air seeds each: get enqueued (4 `queue.push`), get dequeued, **allocate 7 arrays + an iterator**, test 6 neighbors, write nothing, and are discarded. The allocations are pure garbage.

### Numeric derivation (allocations per call — derived from chunk geometry, not measured ms)

For an ordinary surface chunk with terrain surface near y ≈ 64 (chunk height 320):

```
edge columns scanned (seed loops):  west 16 + east 16 + north 14 + south 14 = 60 columns
cells scanned for seeding:          ~60 × 320                                ≈ 19,200 transparency tests
air cells above surface per column: ~320 − 64                                ≈ 256  (skyLight 15, transparent)
seed nodes enqueued:                ~60 × 256                                ≈ 15,000  (+ a few lit sub-surface cells)
queue ints pushed by seeding:       ~15,000 × 4                              ≈ 60,000 slots in the growable array
nodes dequeued (propagated > 1):    ~15,000  (level-15 air → propagated 14)
arrays allocated by (2)+(3):        ~15,000 × (7 arrays + 1 iterator)        ≈ 120,000 short-lived objects
useful writes produced:             only the handful of darker cave/overhang cells near a brightened edge
```

Per **frame** during active streaming:

```
chunks processed:                   budget = 4 / frame
passes per chunk (until converged): up to MAX_EDGE_LIGHTING_PASSES = 3
inward calls hitting this cost:     the brightening / fresh-recalc branches (17522 / 17535)
worst-case allocations / frame:     ~4 × ~120,000                            ≈ ~480,000 throwaway objects
```

Even discounting the count several-fold for partially-buried or ocean chunks, this is **hundreds of thousands of dead allocations on the main thread in a single streaming frame** — directly the GC pressure the project's "no allocations in hot paths" rule exists to prevent. The fix removes essentially all of it without changing one light value.

### Not the cause / out of scope (checked)

- **The seed-scan CPU cost** (the ~19,200 transparency tests) is *not* fixed by this CCR — that is allocation-free index math. Reducing the seed set is the *optional secondary* below, and it touches convergence logic, so it is deliberately separated.
- **`propagateEdgeLighting()`** (lines 17272–17323) — the edge *import* step — does a similar full 16×320 scan per edge but **allocates nothing** (index math + comparisons only). Not implicated in the GC problem.
- **Convergence cap / remesh debounce** (`MAX_EDGE_LIGHTING_PASSES`, `EDGE_LIGHT_RESET_MIN_CELLS`, `lastEdgeRemeshMs`) — untouched. This CCR changes neither how often the function runs nor when chunks remesh; only the per-call allocation footprint.

---

## Precedent — the sibling BFS already avoids this; this one is the outlier

This is not a new idea; it is the pattern the engine **already uses for its other skylight flood-fill**. The in-chunk sunlight BFS inside `calculateChunkSunlight` (~line **37820**) does the same neighbor walk **without any per-node allocation**, by iterating the module-scope `NEIGHBOR_OFFSETS` table (lines **37877–37906**):

```js
for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
    const o = NEIGHBOR_OFFSETS[n];
    const nx = lx + o[0];
    const ny = ly + o[1];
    const nz = lz + o[2];
    if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;
    const nIdx = nx + (nz << 4) + (ny << 8);
    // ... transparency + monotonic max-update + queue.push ...
}
```

`NEIGHBOR_OFFSETS` (line **9770**) is literally commented *"Pre-computed neighbor offsets for light propagation — Avoids array allocation inside tight loops."* The edge-inward BFS ignores it and allocates instead. The "reuse a buffer rather than allocate per call" half is also already engine doctrine — the codebase is built around scratch objects (`_scratch*`/`_tmp*`) and pools, and even ships a purpose-built `lightQueuePool` (line **11118**, `acquire()`/`release()`) for this exact job, though it sits **dormant** with no call sites. So the fix brings `propagateLightFromEdgesInward()` in line with patterns the engine already defines, rather than introducing anything new — the same shape as the collision CCR aligning `collide()` with the existing `zombieCollides()`.

---

## Proposed fix

One new module-scope const plus two changes inside `propagateLightFromEdgesInward()`; the four seed loops (17336–17371) and the BFS body's logic are **unchanged**.

**Add a dedicated scratch queue next to `NEIGHBOR_OFFSETS`** (line ~9770 — declaring it here guarantees it is in the *same* lexical scope the function already reaches, since the function uses `NEIGHBOR_OFFSETS` in the fix and `IS_TRANSPARENT` today):

```js
const NEIGHBOR_OFFSETS = [ /* … existing … */ ];
// Reused scratch BFS queue for propagateLightFromEdgesInward — the function is
// synchronous and non-reentrant, so a single shared buffer is safe (no overlapping calls).
const _edgeInwardQueue = [];
```

**Then the function:**

```js
function propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight) {
    const skyLight = chunk.skyLight;
    const blocks = chunk.blocks;
    const cs = chunkSize;

    // (1) Reuse the module-scope scratch queue instead of allocating a fresh growable
    //     array each call. Non-reentrant function → safe to reset and reuse in place.
    const queue = _edgeInwardQueue;
    queue.length = 0;

    // ---- seed loops UNCHANGED (lines 17336–17371): queue.push(...) into the scratch array ----
    // West / East / North / South edges, identical to today.
    // ...

    // BFS propagation into interior
    let qIdx = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++];
        const ly = queue[qIdx++];
        const lz = queue[qIdx++];
        const level = queue[qIdx++];

        const propagated = level - 1;
        if (propagated <= 1) continue;

        // (2) Iterate the hoisted neighbor table — NO per-node array allocation.
        //     Identical to the in-chunk sunlight BFS in calculateChunkSunlight (~37877).
        for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
            const o = NEIGHBOR_OFFSETS[n];
            const nx = lx + o[0];
            const ny = ly + o[1];
            const nz = lz + o[2];
            if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;
            const nIdx = nx + nz * cs + ny * cs * cs;
            if (!IS_TRANSPARENT[blocks[nIdx]]) continue;
            if (propagated > skyLight[nIdx]) {
                skyLight[nIdx] = propagated;
                queue.push(nx, ny, nz, propagated);
            }
        }
    }
    // No release needed — the buffer is reset (length = 0) at the top of the next call.
}
```

> **On `lightQueuePool` (line 11118):** the file already contains a dormant `acquire()`/`release()` pool intended for exactly this, with **zero current call sites**. A pool's only advantage is serving *concurrent* borrowers; this function is synchronous and non-reentrant, so a single dedicated scratch array is simpler and strictly sufficient. Using the pool instead is acceptable **only if** its declaration (line 11118) is first confirmed to be in the same lexical scope as the function — declaring `_edgeInwardQueue` beside `NEIGHBOR_OFFSETS` sidesteps that question entirely, since the fix already proves that scope is reachable.

**Why output is byte-identical:** the BFS is a monotonic max-flood-fill — a cell is only ever raised (`if (propagated > skyLight[nIdx])`), never lowered, and the queue carries the source level. A monotonic max-relaxation converges to the same fixpoint **regardless of the order in which neighbors are visited**, so swapping the inline order `[−x,+x,−y,+y,−z,+z]` for `NEIGHBOR_OFFSETS`' order `[+x,−x,+y,−y,+z,−z]` cannot change any final `skyLight` value. (The sibling BFS at 37877 already relies on this exact property.) The pooled queue holds the same integers in the same order as a fresh `[]` would.

**Minimal-risk shape:** the change is confined to one function; the seed loops, the dequeue/`propagated` math, the bounds check, the transparency gate, and the monotonic update are all preserved verbatim. The only behavioral delta is **fewer allocations**.

**Even-more-conservative alternative (zero order change):** if absolute byte-parity-by-construction is preferred over the order-independence argument, replace the `neighbors` literal with **six inlined neighbor checks in the original order** (still zero allocation, identical visitation order). This is strictly more verbose but removes any need to reason about order. Either form eliminates the per-node garbage; the `NEIGHBOR_OFFSETS` form is recommended for consistency with the sibling BFS.

### Optional secondary (NOT part of this CCR's core — higher risk, decide separately)

The seed scan still re-seeds and re-dequeues the entire lit-air column every call even when no edge changed there. Reducing the seed set — e.g. having `propagateEdgeLighting()` report *which edge cells it actually raised* (a per-edge bitmask) and seeding only those — would cut the remaining CPU of the scan. **This is explicitly out of scope here** because it changes what the function does and intersects the convergence/pass-cap behavior that `CCR-CHUNK-002` and the idle-streaming-remesh-reduction CCR specifically tuned. It should be proposed and risk-assessed on its own. The allocation fix above stands alone and delivers the GC win with none of that risk.

---

## Safety checks

- **Single-file rule:** change is confined to `propagateLightFromEdgesInward()` inside `voxEx.html`; no new files, assets, settings, or DOM IDs.
- **Identifiers / scope (the one runtime-fatal risk, closed by construction):** the fix *removes* the local `neighbors`, reuses the pre-existing module-scope `NEIGHBOR_OFFSETS` (line 9770) and `IS_TRANSPARENT`, and adds exactly **one** new module-scope const, `_edgeInwardQueue`, declared **immediately after `NEIGHBOR_OFFSETS`**. Declaring it there is deliberate: it inherits the exact scope the function already reaches. **Scope is proven, not assumed** — `IS_TRANSPARENT` is referenced both inside `propagateLightFromEdgesInward` (lines 17298, 17395) and inside `calculateChunkSunlight` (line 37890), and `NEIGHBOR_OFFSETS` is referenced at line 37877; so the light-function scope demonstrably reaches the module-level const block at ~9770. (This is also why the fix uses `NEIGHBOR_OFFSETS` rather than the dormant `lightQueuePool` — `NEIGHBOR_OFFSETS`' reachability is already exercised at runtime; the pool's is not.) **Before editing:** grep the file for `_edgeInwardQueue` to confirm the name is unused, and confirm `NEIGHBOR_OFFSETS` is not re-declared between line 9770 and 17327. No globals (`chunks`, `SETTINGS`, `WORLD_DIMS`, etc.) are touched or shadowed.
- **Worker parity — none required (verified):** `propagateLightFromEdgesInward` has **no worker copy**. Its only references in the file are the definition (17327) and its two call sites in `processEdgeLightingUpdates` (17522, 17535); none fall inside the worker template range (`buildChunkWorkerCode`, ~20007) or its injection markers. Cross-chunk edge-lighting reconciliation runs **exclusively on the main thread**, so there is nothing to mirror.
- **Pool reuse is safe:** the function is fully synchronous (no `await`, no recursion, no yield) and the borrowed array is not referenced after `release()`, so a pooled queue cannot be aliased across overlapping calls. `lightQueuePool.release()` already resets `length = 0`.
- **Per-frame cost:** strictly *reduces* per-frame work — same number of nodes visited, far fewer allocations, no new loops or nesting. Honors the "≤ 2 nested loops in hot paths" rule (the BFS body is a single neighbor loop, unchanged in depth).
- **Logging:** none added; nothing per-frame to log.

## Test plan

- **Regression suite (primary gate):** run `tools/voxex-tests.html` (~204–214 tests; serve over localhost; this monitorless box drives headless Chrome via puppeteer-core / SwiftShader — expect **"214/214 … All green!"**). The **lightRefill byte-parity** tests are the exact guard for this change: skylight arrays after edge reconciliation must be byte-identical pre- and post-fix.
- **Determinism check:** for a fixed seed, dump a streamed region's `skyLight` arrays before and after the change and confirm they are bit-identical (the change must be provably output-neutral). The collision/lighting coverage in the suite should stay green.
- **Allocation verification (the actual win):** DevTools → Performance, record movement through fresh terrain before and after. Confirm the dense band of tiny `Array` allocations attributed to `propagateLightFromEdgesInward` collapses to near-zero and Minor-GC frequency during streaming drops. (Measure allocations/GC, not absolute ms — SwiftShader is not a representative frame-time profiler.)
- **Manual visual no-regression:** stream into a region with cross-border caves/overhangs and confirm borders still light correctly (no new dark seams), since that border-spread is the function's one genuinely useful output.

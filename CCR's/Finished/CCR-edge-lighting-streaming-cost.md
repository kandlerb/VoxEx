# CCR — Edge-Lighting Streaming Cost: Redundant Full-Chunk Recompute + Per-Node BFS Allocation Churn

**ID:** VOXEX-CCR-LIGHT-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟢 **Implemented — build `2026-06-22.6`.** Both items shipped; 282/282 tests green.
**Scope:** Two orthogonal, compose-cleanly performance fixes on the **cross-chunk edge-lighting path that runs on the main thread every frame during streaming** (`processEdgeLightingUpdates()` → `propagateLightFromEdgesInward()`). Item 2 changes no light *values* (byte-identical). Item 1 is byte-identical in the dominant case and on the streaming path can only equal-or-raise light (no dark seam), with **two disclosed transient, self-healing divergences**: a benign over-bright border (Case B) and a rare in-flight-relight darkening (Case C). Neither item changes convergence, the pass cap, remesh debounce, or any logic the idle-streaming-remesh-reduction CCR (`CCR-CHUNK-002`) tuned.

- **Item 1 — Redundant full-chunk sunlight recompute** on flag-clear edge-lighting passes (the larger main-thread win).
- **Item 2 — Per-node array/iterator garbage** inside the edge-inward BFS (the GC-pressure win).

> **Merge note:** this CCR supersedes the two separate drafts `CCR-edge-lighting-redundant-recompute.md` and `CCR-edge-lighting-bfs-allocation.md`, which were **both stamped `VOXEX-CCR-LIGHT-001`** (an ID collision) and both targeted the same caller/callee pair on the same streaming pass. They are folded here as Items 1 and 2 with one shared Safety/Test section. This does **not** supersede `CCR-idle-streaming-remesh-reduction.md` (CCR-CHUNK-002, which reduces *how often* edge passes are scheduled) — these two items reduce the *cost per pass*; they are orthogonal and compose. Item 1 is also orthogonal to `CCR-prime-sunlight-column-fullwalk.md` (LIGHT-002), which fires on player *edits*, not streaming.

> Line numbers were **re-verified against the working tree on 2026-06-22** (review pass) and **WILL drift** — grep the quoted identifier/string before editing, per repo convention. The CCR-002 Item-1 `[CCR002-verify]` debug probe (line 17513) is still in the tree and shifts nearby lines by a few.

---

## Shared context — where this path runs

`propagateLightFromEdgesInward()` has **three** call sites, **all main-thread, synchronous, and non-nested** (none calls another inward-propagation, so no reentrancy):

1. `processEdgeLightingUpdates()` (line **17446**), inside the `edgeChanged > 0` branch — line **17535** (neighbor light just arrived and brightened cells).
2. `processEdgeLightingUpdates()` `else if` branch — line **17548** (first pass after a fresh sunlight recompute, `edgeChanged === 0`).
3. `recalculateEdgeLighting()` (line **17227**, the same `calculateChunkSunlight` → `propagateLightFromNeighbors` → `propagateLightFromEdgesInward` trio), invoked from `runNeighborUpdatePass()` (line **17222**) off the `adjacentChunkUpdateQueue` processor (line **17019**) when a chunk's four cardinal neighbors are all present during streaming. **This third caller is live but out of scope for both items** — Item 1 edits only the `processEdgeLightingUpdates` gate (so `recalculateEdgeLighting` keeps its unconditional recompute), and Item 2's scratch-queue reuse is safe across all three callers precisely because they are synchronous and never overlap. (Earlier drafts wrongly described this function as invoked *only* from `processEdgeLightingUpdates`; corrected here.)

`processEdgeLightingUpdates(budget = 4)` is **called from the main game loop** (line **42550**, inside `animate()`; its comment at line 17444 reads *"Process edge lighting updates - called from the main game loop"*). It pulls up to **4 chunks/frame** off `edgeLightingUpdateQueue`, processing each pulled chunk **one pass per frame** and capping a chunk at `MAX_EDGE_LIGHTING_PASSES = 3` visits (line **16903**) before the convergence cap stops re-queuing it. Every freshly-streamed chunk with all-neighbor lighting flows through here at least once, so during continuous movement at any non-trivial render distance this runs on the main thread on most frames. Both items below attack cost on this exact path.

---

# Item 1 — Redundant Full-Chunk Sunlight Recompute on Flag-Clear Passes

## Summary

- **Observed (by code audit):** `processEdgeLightingUpdates()` runs a full-chunk `calculateChunkSunlight()` — an 81,920-cell `fill` + an 81,920-iteration vertical scan + a horizontal BFS — on **every pass where the chunk's `EDGE_LIGHTING` flag is clear**. That recompute resets `chunk.skyLight` to base and re-derives values the chunk already holds. In the dominant cases the recomputed array is identical to what was already there.
- **It fires more often than "once per chunk."** The flag is clear on a chunk's **first** edge pass, and it is **cleared again every time a neighbor chunk is created** next to it: `queueAdjacentChunksForUpdate()` does `neighborChunk.renderState &= ~RENDER_PASS.EDGE_LIGHTING` (line **16951**) for all 8 neighbors of each new chunk and re-queues them. So as a chunk's 8 neighbors stream in, that chunk can be recomputed several times over the streaming window — each time redundantly.
- **Root cause:** the recompute gate at line **17517** is `if (!hasValidEdgeLighting || !lightingLooksValid)`. `hasValidEdgeLighting` is `renderState & RENDER_PASS.EDGE_LIGHTING`. Because that flag is (re)cleared whenever a neighbor arrives — and only re-set at line **17554**, after a full pass — the gate fires on `!hasValidEdgeLighting` alone, even though `lightingLooksValid` (base sunlight present, `genState & GEN_PASS.SUNLIGHT`) is already true.
- **Why CCR-002 didn't already fix this:** CCR-CHUNK-002 Item 1 (shipped, build `2026-06-21.1`) repaired the **other** operand of that `||` — the `lightingLooksValid` heuristic — which used to misfire and force the recompute on *converged* passes. The `!hasValidEdgeLighting` operand is **independent and untouched**; it still forces the recompute on every flag-clear pass.
- **The recompute is not load-bearing here.** `propagateLightFromNeighbors()` (call site line **17522**) runs in **both** the current and proposed code, *after* the recompute/skip decision, importing fresh edge values from whatever neighbors are present. The recompute only additionally *resets the base* first. Skipping the reset leaves the existing `skyLight` (≥ base on the streaming path) in place; the subsequent import then runs identically. See *Correctness* for the proof that this cannot introduce a dark seam on the streaming path, plus the one transient, self-healing relight-overlap exception (Case C).
- **Recommended fix:** gate the recompute on base-sunlight validity **only** (`!lightingLooksValid`), dropping the `!hasValidEdgeLighting` operand.

## Root cause detail

### The recompute gate — `processEdgeLightingUpdates()` (lines 17500–17519)

```js
// Only recalculate if lighting is missing or appears invalid
// This preserves valid cached lighting from restored chunks
const hasValidEdgeLighting = chunk.renderState && (chunk.renderState & RENDER_PASS.EDGE_LIGHTING);
// CCR-CHUNK-002 Item 1: ... GEN_PASS.SUNLIGHT is the authoritative "skylight has been computed" flag ...
const lightingLooksValid = (chunk.genState & GEN_PASS.SUNLIGHT) !== 0;
if (!hasValidEdgeLighting || !lightingLooksValid) {
    calculateChunkSunlight(chunk, WORLD_DIMS.chunkSize, WORLD_DIMS.chunkHeight);
}
```

`RENDER_PASS.EDGE_LIGHTING` is set late in the **same** function (line **17554**, `chunk.renderState |= RENDER_PASS.EDGE_LIGHTING`), so it is clear during the pass that runs the recompute.

### Two distinct events make `hasValidEdgeLighting` false (and the difference matters)

1. **First pass ever** (fresh chunk). `skyLight` is **base-only** — computed by `calculateChunkSunlight()` at creation and flagged `GEN_PASS.SUNLIGHT` immediately after, on both creation paths: worker path lines **38772–38773** (`calculateChunkSunlight(...)` then `chunk.genState |= GEN_PASS.SUNLIGHT`); main-thread path lines **38853–38854** (identical pair). Re-running the recompute here reproduces the same base array bit-for-bit. **Purely redundant.**
2. **Neighbor-arrival re-queue.** When any new chunk is created, `queueAdjacentChunksForUpdate()` clears each existing neighbor's edge-lighting flag and re-queues it (lines **16937–16964**):
   ```js
   // ALWAYS re-queue neighbors for edge lighting when a new chunk appears
   // ... Clear the edge lighting flag so they get reprocessed
   if (neighborChunk && neighborChunk.skyLight) {
       if (neighborChunk.renderState) {
           neighborChunk.renderState &= ~RENDER_PASS.EDGE_LIGHTING;
       }
       edgeLightingPassCount.delete(nKey);
       neighborChunk._edgeMeshDirty = true;
       queueChunkForLightingUpdate(ncx, ncz, nKey);
   }
   ```
   Here `skyLight` may **already carry edge light** from the chunk's earlier passes. The recompute would *reset it to base* before re-importing. The proposed fix skips that reset. This is the principal case where current and proposed behavior can differ — its over-bright (Case B) and relight-overlap (Case C) sub-cases are analyzed in *Correctness* below.

### What the recompute costs

`calculateChunkSunlight()` (lines 37839–37938; touches **only** `skyLight`, not `blockLight`), per call, for a 16×16×320 chunk:

- **Phase 1 — vertical pass** (lines 37857–37890): `skyLight.fill(1)` = **81,920** writes, then a `16 × 16 × 320` = **81,920**-iteration top-to-bottom scan writing every cell again and seeding the BFS → **≥163,840 array ops** before the BFS.
- **Phase 2 — horizontal BFS** (lines 37892–37937): floods every sky-lit transparent cell sideways; for open, sky-exposed terrain the seed queue is large.

It is the single most expensive operation in the edge-lighting path. Multiplied by (first pass + up to ~8 neighbor-arrival passes) per chunk across a streaming front, it is a meaningful chunk of the main-thread time in the window CCR-002 documents as producing `requestAnimationFrame` stalls.

> **Honest scoping:** these are *operation counts read from source*, not a profiled millisecond figure. The redundancy and per-pass frequency are certain; exact wall-clock saving is terrain- and device-dependent and must be measured in-browser (see Test plan). What is not in doubt: the work is removable with, at worst, a benign self-healing visual difference.

## Correctness — why this is safe (no persistent dark seam on the streaming path)

The current and proposed code differ **only** in whether `calculateChunkSunlight()` resets `chunk.skyLight` to base before the shared `propagateLightFromNeighbors()` / `propagateLightFromEdgesInward()` steps run. Let `S` = the chunk's existing `skyLight` at the start of the pass.

- **Base-only invariant (with one disclosed exception).** On the streaming flag-clear path this fix targets, `S ≥ base` pointwise, because for an un-edited streamed chunk the only writers of `skyLight` are `calculateChunkSunlight` (sets exactly base + intra-chunk fill) and the edge-propagation functions, which are **monotone-max** (they only ever raise a cell — `if (propagated > skyLight[idx]) skyLight[idx] = propagated`, lines 17316/17410, never lower it). **There is, however, a third writer that *can* lower cells:** `setSkyLight()` (line 7581; module wrapper 24489), used by the incremental relight/removal path on block edits (24650–25031, e.g. `setSkyLight(x,y,z,1)` at 24955). So `S ≥ base` is **not** a universal "at all times" invariant — it can be violated while an async relight is mid-flight on a chunk. See the *Case C* overlap below for why this stays low-severity rather than producing a persistent defect.
- **Current path:** `skyLight ← base` (recompute), then import from present neighbors (monotone-max) → result `R_cur`.
- **Proposed path:** keep `S`, then the *same* import from present neighbors (monotone-max) → result `R_fix`.
- Where `S ≥ base` holds (every un-edited streamed chunk — the dominant case), the import step is identical and monotone-max, so **`R_fix ≥ R_cur` pointwise**: the proposed result is never darker than the current one anywhere.

**Consequences:**

- **No dark seams on the streaming path.** The failure mode the edge-lighting system exists to prevent (dark borders where caves cross a chunk boundary) cannot be introduced by this change on the path it targets: for un-edited streamed chunks `S ≥ base`, so the result can only equal or *raise* light, never lower it. The one way to fall outside this guarantee is the in-flight-relight overlap (*Case C*), which is transient and self-healing — not a persistent dark seam.
- **Case A (the common case): exact parity.** When every neighbor that previously contributed light to `S` is still present, the import re-supplies that same light, so `R_fix = R_cur` exactly. This covers all first-pass-fresh chunks (`S = base`) and all neighbor-arrival passes where no prior contributor has unloaded — i.e. essentially all of normal forward streaming.
- **Case B: benign over-bright transient.** If a neighbor `P` that previously raised cells in `S` has since *unloaded*, the recompute would discard `P`'s contribution (P absent → not re-imported), while the fix retains it. Result: those border cells stay at their **old, brighter** value instead of falling back. This is a faintly *over-bright* border, only at a render-distance-churn seam (P unloaded while a different neighbor N arrives to trigger the re-queue). It **self-heals** whenever those cells are next overwritten by a genuine base recompute — chunk regeneration from scratch, or an edit whose relight (`setSkyLight`/`SunlightTask`) rewrites the column. (Note: a plain *remesh* does **not** heal it — remeshing re-reads `skyLight` without recomputing it, so it would re-bake the over-bright value; and a save/restore round-trips the over-bright `skyLight` with the `EDGE_LIGHTING` flag set, so reload alone doesn't heal it either. The earlier "self-heals on remesh or reload" phrasing was imprecise.) It is never visible as a defect of the kind dark seams are; arguably it is *more* stable than the current dims-then-rebrightens behavior.
- **Case C: in-flight-relight darkening (the proof's one genuine gap).** Because `setSkyLight` can lower `S` below base during an async relight (above), a narrow overlap exists: a chunk is mid-relight (some cells dropped toward 1, refill not yet complete) **and** a neighbor arrival clears its `EDGE_LIGHTING` flag and re-queues it on the same window. On that flag-clear pass the proposed code keeps the too-dark `S` (current code would recompute to base), so an interior cell not reached by the edge import can be **momentarily darker** than the current path produces. This is the one case where the change can darken. It is self-healing: the in-flight `SunlightTask` refill is monotone-add and converges those cells back to correct values (and schedules a remesh), so it cannot persist. The common edited-chunk case does **not** hit this — the relight path leaves `EDGE_LIGHTING` set, so a normal edge pass finds `hasValidEdgeLighting` true and *both* current and proposed skip the recompute identically; only the rare flag-clear (neighbor-arrival) ∧ in-flight-relight coincidence opens the gap.

So the change trades a guaranteed-redundant full recompute for, in the dominant case nothing, and at the edges either a transient over-bright border (Case B) or — only in the rare relight-overlap (Case C) — a transient darker cell that the in-flight relight immediately corrects. Neither produces a persistent dark seam. (Same class of "one genuinely new, low-severity behavior" disclosure as `CCR-Collision-vertical-gap.md`.)

### Restored (cached) chunks

Both persistence formats round-trip `renderState`, `genState`, **and** `skyLight` together — IndexedDB via `ChunkCompressor.compress`/`decompress` (lines 25516/25535) and OPFS via `serializeChunkForDisk`/`deserializeChunkFromDisk` (lines 25601/25633). So a chunk saved *after* it was edge-lit restores with both the edge light **and** the `EDGE_LIGHTING` flag set → `hasValidEdgeLighting` true → the **current** code already skips its recompute. Restored chunks therefore introduce no new divergence beyond the live Case-B transient; the persisted flag stays consistent with the persisted `skyLight`.

## Proposed fix (Item 1)

Gate the full recompute on base-sunlight validity only:

```js
const hasValidEdgeLighting = chunk.renderState && (chunk.renderState & RENDER_PASS.EDGE_LIGHTING);
const lightingLooksValid = (chunk.genState & GEN_PASS.SUNLIGHT) !== 0;
// VOXEX-CCR-LIGHT-001 (Item 1): recompute base sunlight ONLY when it is actually missing/invalid.
// The previous `!hasValidEdgeLighting ||` operand forced a full 320-tall recompute on every
// pass where the EDGE_LIGHTING flag is clear — the chunk's first pass AND every neighbor-arrival
// re-queue (queueAdjacentChunksForUpdate clears the flag, ~16951). That recompute re-derived the
// base skyLight calculateChunkSunlight() already produced at creation (genState.SUNLIGHT,
// ~38773/38854). propagateLightFromNeighbors below imports fresh edge values either way, and is
// monotone-max, so on the streaming path (skyLight >= base) skipping the base reset can only EQUAL
// or RAISE light — no dark seam introduced. See Correctness for the proof, the benign over-bright
// transient (Case B), and the one transient relight-overlap exception (Case C).
if (!lightingLooksValid) {
    calculateChunkSunlight(chunk, WORLD_DIMS.chunkSize, WORLD_DIMS.chunkHeight);
}
```

`hasValidEdgeLighting` is still computed and still used unchanged by the convergence/re-queue logic below — the first-pass inward-spread branch (line **17546**, `else if (!hasValidEdgeLighting || !lightingLooksValid)`) and the neighbor re-queue guard (line **17581**). Only its use **in the recompute gate** is removed.

**Why this is the minimal-risk shape:** one-operand change, no new identifiers/state/settings/DOM, no `SETTINGS_VERSION` bump; strictly removes work; the safety net is preserved (when base sunlight is genuinely absent/invalid — `genState.SUNLIGHT` clear — `!lightingLooksValid` is true and the recompute still fires, which is exactly the restored-chunk-whose-genState-didn't-round-trip case the CCR-002 `[CCR002-verify]` probe at line 17513 watches for); no dark seam on the streaming path (with the disclosed transient Case-C relight-overlap exception).

### Note on the `else if` at line 17546

The first-pass inward-spread branch keeps its `!hasValidEdgeLighting` operand — correctly, since its job is the one-time inward spread on a flag-clear pass when no neighbor light arrived (`edgeChanged === 0`). The fix does not touch it; after the fix that branch runs against the already-valid `skyLight` **without** the preceding redundant recompute, which is the intended outcome.

### Alternative considered — tighter gate for exact byte-parity (rejected as over-engineering)

To eliminate even the Case-B over-bright transient, one could track a separate "skyLight is base-only" bit and recompute only on genuine first passes. That reintroduces per-chunk state and a second flag to keep consistent, for the sake of suppressing a transient that cannot produce a visible defect and self-heals. Not worth it; the one-operand fix is preferred.

---

# Item 2 — Per-Node BFS Allocation Churn

## Summary

- **Problem class (derived, not measured here):** a clear allocation anti-pattern on the main-thread streaming path that violates the project's "no allocations in hot paths" rule. GC pressure **proportional to streaming activity**. Whether it surfaces as a *visible* frame-time hitch is device-dependent and not measured here; the defended claim is the derivable allocation count, and the fix removes provable garbage with byte-identical output.
- **Root cause:** `propagateLightFromEdgesInward()` (lines **17340–17416**) spreads edge skylight into a chunk's interior with a BFS. For **every dequeued node** it allocates a fresh 6×3 array-of-arrays literal — `const neighbors = [[…],[…],…]` (lines **17398–17402**) — then iterates it with `for (const [nx,ny,nz] of neighbors)` (line **17404**), which also allocates a destructuring iterator (plus one `{value,done}` result object per step — see the conservative-floor note under *Root cause detail*). That is **at least ~7 short-lived array objects + 1 iterator per node**. The queue itself is a fresh growable array (`const queue = []`, line **17346**) reallocated on every call.
- **Why it's expensive:** the seed loops (lines **17350–17384**) enqueue *every transparent edge cell with skylight > 1* — for an ordinary surface chunk, the **entire air column above the terrain on all four edges** (skylight 15, transparent), i.e. **~15,000 seed nodes per call**. Each is dequeued and allocates its neighbor garbage — and then propagates **nothing**, because the enqueue guard at line **17410** (`if (propagated > skyLight[nIdx])`) immediately fails against already-lit air (`14 > 15` is false). So the dominant cost is **~120K throwaway allocations per call that accomplish no work** (a conservative floor), and a chunk repeats this over up to `MAX_EDGE_LIGHTING_PASSES = 3` visits across separate frames, with `budget = 4` chunks processed per frame — **hundreds of thousands of dead allocations per frame** on the main thread while streaming.
- **The asymmetry is the whole story:** the function's *useful* output (spreading light into cave/overhang cells that just brightened at a border) is a tiny fraction of the cells it touches; the *cost* is paid on every lit air cell it needlessly re-seeds and re-dequeues. The allocation fix removes the **per-node garbage** from that wasted traversal without changing a single light value.
- **Recommended fix:** (1) iterate the hoisted `NEIGHBOR_OFFSETS` table (line **9783**) instead of allocating a per-node `neighbors` literal — exactly what the sibling sunlight BFS in `calculateChunkSunlight` already does (line **37907**); this is the dominant win. (2) reuse one dedicated module-scope scratch queue instead of allocating a fresh growable array each call. Net per-frame **allocations** in this path drop from hundreds of thousands to ~zero. Light output is identical (a monotonic max-flood-fill converges to the same fixpoint regardless of neighbor visitation order).

## Root cause detail

### The flood-fill — `propagateLightFromEdgesInward()` (lines 17340–17416)

```js
function propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight) {
    const skyLight = chunk.skyLight;
    const blocks = chunk.blocks;
    const cs = chunkSize;

    const queue = [];                                   // (1) fresh growable array every call

    // Seed queue with all edge blocks that have light > 1 (West edge lx = 0)
    for (let lz = 0; lz < cs; lz++) {
        for (let ly = 0; ly < chunkHeight; ly++) {      // 16 × 320 = 5,120 cells scanned
            const idx = 0 + lz * cs + ly * cs * cs;
            if (skyLight[idx] > 1 && IS_TRANSPARENT[blocks[idx]]) {
                queue.push(0, ly, lz, skyLight[idx]);   // air column above terrain → ~256 seeds/column
            }
        }
    }
    // East / North / South edges: same pattern (lines 17358–17384)

    // BFS propagation into interior
    let qIdx = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++]; const ly = queue[qIdx++];
        const lz = queue[qIdx++]; const level = queue[qIdx++];
        const propagated = level - 1;
        if (propagated <= 1) continue;

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

Allocation sites ranked by cost: **(2) the per-node `neighbors` literal** (one outer + six inner arrays = 7 allocations per dequeued node) plus **(3)** the `for…of` destructuring iterator — fires on every node, including the thousands of lit-air seeds that propagate nothing; then **(1) the per-call `queue`** (a fresh growable `Array` that reallocates as it grows to ~60K slots). The "7 arrays + 1 iterator = 8/node" figure used below is a **conservative floor**: the `for…of` protocol also allocates one `{value, done}` result object per `.next()` step (~6 more per node), so the true per-node count is closer to ~14 (modulo whatever the JIT's escape analysis elides). Undercounting here only *understates* the win — it does not affect the fix.

### Why the BFS does NOT fan out (so the work is mostly wasted)

Above-surface air is already `skyLight = 15` from `calculateChunkSunlight`. A level-15 seed yields `propagated = 14`; its air neighbors are already 15; the guard at line **17410** (`14 > 15`) is false, so **nothing is written and nothing is re-enqueued**. The BFS terminates at the seed for every already-lit air cell. Genuine fan-out happens only at shadow/terrain boundaries near the edge (cave mouths, overhangs) — a small minority. So the ~15K lit-air seeds each get enqueued, dequeued, **allocate 7 arrays + an iterator**, test 6 neighbors, write nothing, and are discarded. Pure garbage.

### Numeric derivation (allocations per call — derived from chunk geometry, not measured ms)

For an ordinary surface chunk with terrain surface near y ≈ 64 (chunk height 320):

```
edge columns scanned (seed loops):  west 16 + east 16 + north 14 + south 14 = 60 columns
air cells above surface per column: ~320 − 64                                ≈ 256  (skyLight 15, transparent)
seed nodes enqueued:                ~60 × 256                                ≈ 15,000
nodes dequeued (propagated > 1):    ~15,000  (level-15 air → propagated 14)
arrays allocated by (2)+(3):        ~15,000 × (7 arrays + 1 iterator)        ≈ 120,000 short-lived objects
useful writes produced:             only the handful of darker cave/overhang cells near a brightened edge
```

Per **frame** during active streaming: each pulled chunk gets **one** inward call per frame (the up-to-`MAX_EDGE_LIGHTING_PASSES = 3` visits are spread across separate frames via re-queue, not stacked within one frame), so `budget = 4` chunks × ~120,000 → worst-case **~480,000 throwaway objects/frame**. (A given chunk accrues the 3-visit total over its streaming window, ~360,000 objects across those frames.) Even discounting several-fold for partially-buried/ocean chunks, this is hundreds of thousands of dead main-thread allocations in a single streaming frame.

### Not the cause / out of scope (checked)

- **The seed-scan CPU cost** (~19,200 transparency tests) is *not* fixed by this item — that is allocation-free index math. Reducing the seed set is the *optional secondary* below, and it touches convergence logic, so it is deliberately separated.
- **`propagateEdgeLighting()`** (lines 17285–17336) — the edge *import* step — does a similar full 16×320 scan per edge but **allocates nothing** (index math + comparisons only). Not implicated.
- **Convergence cap / remesh debounce** (`MAX_EDGE_LIGHTING_PASSES`, `EDGE_LIGHT_RESET_MIN_CELLS`, `lastEdgeRemeshMs`) — untouched.

## Precedent — the sibling BFS already avoids this

The in-chunk sunlight BFS inside `calculateChunkSunlight` (~line **37896**) does the same neighbor walk **without any per-node allocation**, by iterating the module-scope `NEIGHBOR_OFFSETS` table (lines **37907–37936**):

```js
for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
    const o = NEIGHBOR_OFFSETS[n];
    const nx = lx + o[0]; const ny = ly + o[1]; const nz = lz + o[2];
    if (nx < 0 || nx >= cs || nz < 0 || nz >= cs || ny < 0 || ny >= chunkHeight) continue;
    const nIdx = nx + (nz << 4) + (ny << 8);
    // ... transparency + monotonic max-update + queue.push ...
}
```

`NEIGHBOR_OFFSETS` (line **9783**) is literally commented *"Pre-computed neighbor offsets for light propagation — Avoids array allocation inside tight loops."* The "reuse a buffer rather than allocate per call" half is also engine doctrine — the codebase is built around `_scratch*`/`_tmp*` objects and pools, and even ships a purpose-built `lightQueuePool` (line **11131**, `acquire()`/`release()`) for this exact job, though it sits **dormant** with no call sites (verified). The fix brings `propagateLightFromEdgesInward()` in line with patterns the engine already defines.

## Proposed fix (Item 2)

One new module-scope const plus two changes inside `propagateLightFromEdgesInward()`; the four seed loops (17358–17384) and the BFS body's logic are **unchanged**.

**Add a dedicated scratch queue next to `NEIGHBOR_OFFSETS`** (line ~9783 — declaring it here guarantees it is in the *same* lexical scope the function already reaches):

```js
const NEIGHBOR_OFFSETS = [ /* … existing … */ ];
// Reused scratch BFS queue for propagateLightFromEdgesInward — all three call sites
// (processEdgeLightingUpdates ×2, recalculateEdgeLighting ×1) are synchronous and never
// nest an inward call, so a single shared buffer is safe (no overlapping/reentrant calls).
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

    // ---- seed loops UNCHANGED (lines 17358–17384): queue.push(...) into the scratch array ----

    let qIdx = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++]; const ly = queue[qIdx++];
        const lz = queue[qIdx++]; const level = queue[qIdx++];
        const propagated = level - 1;
        if (propagated <= 1) continue;

        // (2) Iterate the hoisted neighbor table — NO per-node array allocation.
        //     Identical to the in-chunk sunlight BFS in calculateChunkSunlight (~37907).
        for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
            const o = NEIGHBOR_OFFSETS[n];
            const nx = lx + o[0]; const ny = ly + o[1]; const nz = lz + o[2];
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

> **On `lightQueuePool` (line 11131):** the file already contains a dormant `acquire()`/`release()` pool intended for exactly this, with **zero current call sites**. A pool's only advantage is serving *concurrent* borrowers; this function is synchronous and non-reentrant, so a single dedicated scratch array is simpler and strictly sufficient. Declaring `_edgeInwardQueue` beside `NEIGHBOR_OFFSETS` sidesteps any scope question, since the fix already proves that scope is reachable.

**Why output is byte-identical:** the BFS is a monotonic max-flood-fill — a cell is only ever raised (`if (propagated > skyLight[nIdx])`), never lowered, and the queue carries the source level. A monotonic max-relaxation converges to the same fixpoint **regardless of the order in which neighbors are visited**, so swapping the inline order `[−x,+x,−y,+y,−z,+z]` for `NEIGHBOR_OFFSETS`' order `[+x,−x,+y,−y,+z,−z]` cannot change any final `skyLight` value. The pooled queue holds the same integers in the same order as a fresh `[]` would.

**Even-more-conservative alternative (zero order change):** if absolute byte-parity-by-construction is preferred over the order-independence argument, replace the `neighbors` literal with **six inlined neighbor checks in the original order** (still zero allocation, identical visitation order). Either form eliminates the per-node garbage; the `NEIGHBOR_OFFSETS` form is recommended for consistency with the sibling BFS.

---

## Optional secondary (NOT part of this CCR's core — higher risk, decide separately)

Both items leave the **seed scan** in `propagateLightFromEdgesInward()` re-seeding and re-dequeuing the entire lit-air column every call even when no edge changed there. Reducing the seed set — e.g. having `propagateEdgeLighting()` report *which* edge cells it actually raised (a per-edge bitmask) and seeding only those, or a precomputed top-of-lit-column bound — would cut the remaining scan CPU (~19,200 read-iterations/call today). **Explicitly out of scope here** because it changes what the function does and intersects the convergence/pass-cap behavior `CCR-CHUNK-002` and the idle-streaming-remesh-reduction CCR tuned. The interior BFS has no visited-set, but its `if (propagated > skyLight[nIdx])` + write-on-enqueue guard makes re-enqueue value-monotone (bounded by the 1–15 range) and self-limiting — not worth changing.

---

## Combined safety checks

- **Single-file rule:** all edits confined to `voxEx.html` — Item 1: one `if`-condition inside `processEdgeLightingUpdates()`; Item 2: the body of `propagateLightFromEdgesInward()` plus one new module-scope const. No new files/assets.
- **Identifiers / scope:**
  - *Item 1:* no new declarations; `hasValidEdgeLighting`/`lightingLooksValid`/`calculateChunkSunlight`/`GEN_PASS`/`RENDER_PASS` are read, not redeclared. `hasValidEdgeLighting` remains in use by the `else if` (17546) and re-queue guard (17581) logic.
  - *Item 2:* the fix *removes* the local `neighbors`, reuses the pre-existing module-scope `NEIGHBOR_OFFSETS` (line 9783) and `IS_TRANSPARENT`, and adds exactly **one** new module-scope const, `_edgeInwardQueue`, declared **immediately after `NEIGHBOR_OFFSETS`**. **Scope is proven, not assumed** — `IS_TRANSPARENT` is referenced both inside `propagateLightFromEdgesInward` (17353, 17408) and inside `calculateChunkSunlight` (37874, 37920), and `NEIGHBOR_OFFSETS` at 37907; so the light-function scope demonstrably reaches the module-level const block at ~9783. **Before editing:** grep `_edgeInwardQueue` to confirm it is unused (verified: only the definition exists, no other references), and confirm `NEIGHBOR_OFFSETS` is not re-declared between 9783 and 17340. No globals (`chunks`, `SETTINGS`, `WORLD_DIMS`, `scene`) touched or shadowed.
- **No DOM/settings wiring:** neither item adds settings, DOM IDs, or save/load fields; nothing to round-trip; no `SETTINGS_VERSION`/cache-version bump.
- **Per-frame / per-pass cost:** both items strictly *reduce* work — Item 1 removes a full-column recompute on every flag-clear pass; Item 2 removes per-node allocation. Same number of nodes visited, no new loops or nesting; honors the "≤2 nested loops in hot paths" rule (the BFS body is a single neighbor loop, unchanged in depth).
- **Pool reuse is safe (Item 2):** `propagateLightFromEdgesInward` is fully synchronous (no `await`, no recursion, no yield) and the scratch array is not referenced after the call. All **three** call sites (17535, 17548, 17236) run on the main thread and never nest an inward call inside another, so the shared buffer cannot be aliased across overlapping calls.
- **Lighting-result parity:** Item 2 is byte-identical (monotone-max order-independence). Item 1 is byte-exact in Case A (all prior contributors present — every first-pass-fresh chunk and all normal forward streaming) and, **on the streaming path where `S ≥ base`, provably ≥ current pointwise** (monotone-max import over a `≥ base` array), so it **cannot introduce a dark seam there**. Two disclosed divergences: the Case-B over-bright transient (now-unloaded prior contributor at a churn seam), and the Case-C in-flight-relight darkening (the only case that can momentarily darken, requiring a flag-clear pass to coincide with an async relight that has lowered `S` below base via `setSkyLight`). Both are transient and self-heal — Case B when the cells are next base-recomputed, Case C when the in-flight relight refill completes.
- **Worker parity — none required (verified):** `calculateChunkSunlight`/`processEdgeLightingUpdates` (Item 1) and `propagateLightFromEdgesInward` (Item 2) are all main-thread-only. `propagateLightFromEdgesInward` has **three** references — its definition (17340) and the call sites at **17535** and **17548** (in `processEdgeLightingUpdates`) plus **17236** (in `recalculateEdgeLighting`); none fall inside the worker template range (`buildChunkWorkerCode`, ~20007) or its injection markers. All three callers are synchronous and non-overlapping (see Shared context), so the shared scratch queue is safe and there is no worker copy to mirror.
- **Invariant relied upon (Item 1):** `genState.SUNLIGHT` set ⟹ `chunk.skyLight` present and correctly sized — holds for both creation paths and current-version cache restores. The `[CCR002-verify]` probe (line 17513) already logs any violation; keep it through the soak.
- **Logging:** none added; nothing per-frame to log.

## Combined test plan

- **Regression suite (primary gate):** run `tools/voxex-tests.html` (~204–214 tests; serve over localhost; on this headless box drive installed Chrome via puppeteer-core/SwiftShader — expect **`214/214 ... All green!`**). The **lightRefill byte-parity** tests are the exact guard: skylight arrays after edge reconciliation must be byte-identical pre- and post-fix for Item 2, and identical in Case A for Item 1.
- **Determinism / parity probe:** for a fixed seed, dump a streamed region's `skyLight` arrays before and after.
  - *Item 2:* confirm they are bit-identical (the change must be provably output-neutral).
  - *Item 1:* snapshot `chunk.skyLight` before the gate, run a pass with the recompute, and assert the array is identical to a pass without it — for first-pass-fresh chunks and neighbor-arrival passes with all neighbors present (validates Case A). Remove probe before shipping.
- **Churn-seam manual test (exercises Item 1 Case B):** fly **forward at high render distance** so chunks unload behind while new chunks load ahead. Confirm **no dark seams** at any chunk border, in caves or on the surface; at worst a faint, transient over-bright border that disappears once the cells are next base-recomputed (regeneration or an edit).
- **Edit-during-streaming probe (exercises Item 1 Case C):** while flying through fresh terrain (so neighbor-arrival flag-clears are firing), repeatedly place/break opaque blocks near chunk borders to drive incremental relights concurrently with edge passes. Confirm any momentary border/interior darkening **self-heals within a frame or two** (the in-flight `SunlightTask` refill) and leaves no persistent dark cell. This is the one path that can transiently darken under the fix.
- **Fresh + restored worlds:** load a **fresh** world and fly into ungenerated terrain (maximizes first-pass + neighbor-arrival recomputes); then a **cached/OPFS-restored** world (the path that already skipped the recompute). Confirm identical lighting and no `[CCR002-verify]` logs.
- **Allocation verification (Item 2's actual win):** DevTools → Performance, record movement through fresh terrain before and after. Confirm the dense band of tiny `Array` allocations attributed to `propagateLightFromEdgesInward` collapses to near-zero and Minor-GC frequency during streaming drops. (Measure allocations/GC, not absolute ms — SwiftShader is not a representative frame-time profiler.)
- **Measurement (honest impact, Item 1):** bracket the recompute with `performance.now()` (or the existing `meshProfile()` seam) over a fixed streaming run, before vs. after, and report the **measured** main-thread saving rather than the op-count estimate.
- **Manual visual no-regression:** stream into a region with cross-border caves/overhangs and confirm borders still light correctly (no new dark seams), since that border-spread is the function's one genuinely useful output.
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`).

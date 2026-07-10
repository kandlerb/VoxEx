# CCR — Idle Streaming Remesh-Count Reduction  🟡 PROPOSED

**Project:** VoxEx (`voxEx.html`, single-file Three.js voxel engine)
**Type:** Performance (chunk meshing pipeline — *schedule-count* reduction)
**Status:** 🟡 **PROPOSED — not yet implemented.** Read & debate first. Companion to (does **not** supersede) `CCR-chunk-remesh-consolidation.md` (VOXEX-CCR-CHUNK-001), which reduced the *cost per* remesh; this CCR reduces the *number of* remeshes scheduled while the world streams in.
**Audit:** Self-audited 2026-06-21 (rev 2): enqueue paths verified against source (every chunk hits *both* reconcile queues — confirmed below); Item 3's "duplication" claim corrected to distinguish always-duplicated *compute* from order-dependent *remesh*; "Alternatives considered" (§4.6) and a 2+3 consolidation decision (§5) added; Item 1 simpler-variant noted (§2.4).
**Implementation progress:** ✅ **Item 1 landed in build `2026-06-21.1`** (probes reverted first; `node --check` clean; temporary `[CCR002-verify]` invariant guard added — remove after soak). Pending in-browser soak (fresh + cached/OPFS-restored world) + re-measurement. Items 2–3: not started.
**ID:** VOXEX-CCR-CHUNK-002

> **Line numbers are as of the working tree on 2026-06-21 (pre-instrumentation) and WILL drift** — grep the quoted identifier/string before editing, per repo convention.
>
> ⚠ **Revert the temporary debug probes first.** This investigation added throwaway probes tagged `PROBE` / `[EdgeLightProbe]` / `window._meshCounts` / `window._edgeProbe` / `window._reschedSrc` (in `applyWorkerMeshData`, `processEdgeLightingUpdates`, and `scheduleChunkUpdate`). They shift the cited line numbers by a few lines each. Before implementing this CCR: `grep -n "PROBE\|EdgeLightProbe\|_meshCounts\|_edgeProbe\|_reschedSrc" voxEx.html` and delete those lines. The `VOXEX_BUILD` banner was deliberately **not** bumped for the probes.

---

## TL;DR

Standing perfectly still at world load (no input, no edits), the engine meshes **197 chunks 604 times — avg 3.07× each**, tail at 4–5×, over a ~15–17 s window. This is **bounded** (no runaway loop) and largely **by design** (a 3-stage pipeline: initial → neighbor reconcile → edge-light convergence), but it is wasteful and it produces the `requestAnimationFrame` stalls seen in the logs (batched GPU buffer uploads).

Measured breakdown of **re-mesh requests** (initial streaming meshes don't pass through `scheduleChunkUpdate`, so this isolates *re*-meshes), via a temporary tally in `scheduleChunkUpdate`:

| Source | Count | Notes |
|---|---|---|
| `edge-lighting` | 218 | cross-chunk light convergence; up to `MAX_EDGE_LIGHTING_PASSES = 3` per chunk |
| `neighbor-update` | 153 | tree-leaf + lighting reconcile; ~once per chunk (genState-gated) |
| `edge-lighting-capflush` | 4 | convergence-cap safety flush |
| `stale-mesh-redo` | 2 | re-dirtied mid-flight |

A second probe split the 222 edge-lighting remeshes by the `lightingLooksValid` heuristic: **166 valid / 52 invalid / 4 capflush**. So my original "the `lightingLooksValid` heuristic is the main culprit" hypothesis was **wrong** — it's a minor (24%) contributor; most edge-lighting remeshes are legitimate convergence work.

**Three changes, in order:**

1. **Item 1 — Fix the `lightingLooksValid` heuristic** (low risk). Replace the brittle `i % 1000` skylight sampler with the authoritative `GEN_PASS.SUNLIGHT` flag, so the convergence short-circuit can actually fire for flat/solid chunks. Removes the 52 misfires + their needless full-chunk sunlight recalcs.
2. **Item 2 — Change-gate the `neighbor-update` remesh** (medium risk). Only schedule the remesh when the pass actually changed blocks or light. Safe because seam face-culling is owned by a *separate* path (`runNeighborReconciliationSweep`).
3. **Item 3 — Unify the neighbor-update and edge-lighting reconciliation passes** (high risk; structural). Eliminate the duplicated edge-light recompute + double remesh. Subsumes Item 2.

> **Bigger lever, flagged for the reviewer:** all 218 `edge-lighting` remeshes are already tagged `reason: DIRTY_REASON.LIGHT`, and CCR-001 Phase 3B shipped a light-only **color-refill** path (`SETTINGS.lightRefill`) that converts a `LIGHT`-only dirty into an in-place color-buffer upload **instead of a full 320-tall remesh** — but it is **default OFF** ("experimental, untested-from-boot"). Maturing and enabling `lightRefill` would attack the single largest bucket (edge-lighting, ~36% of all meshes) more directly than Items 1–3. See [§6 Interaction with CCR-001](#6--interaction-with-ccr-001-lightrefill). The three items below are still worth doing (they reduce *scheduling*, which helps with refill ON or OFF), but the reviewer should decide whether `lightRefill` maturation lands first.

---

## 1 — Evidence (how this was measured)

Temporary probes (now to be reverted) were added at three sites and exercised by hard-reloading the world and standing still ~20 s:

- **Per-chunk mesh counter** in `applyWorkerMeshData` (the `[Mesh] Worker mesh applied` log): `window._meshCounts[cKey]++`.
  - Result: `{chunks: 197, totalMeshes: 604, max: 5, avgPerChunk: 3.07}`; histogram `{1×: 1, 2×: 55, 3×: 100, 4×: 12, 5×: 29}`.
- **Rebuild-source tally** at the top of `scheduleChunkUpdate`: `window._reschedSrc[source]++`.
  - Result: `{edge-lighting: 218, neighbor-update: 153, edge-lighting-capflush: 4, stale-mesh-redo: 2}`.
- **Edge-lighting validity split** at the two edge-lighting remesh sites: `window._edgeProbe`.
  - Result: `{remeshLooksValid: 166, remeshLooksInvalid: 52, capflush: 4}`.

Interpretation: the 3.07× average decomposes as ~1 initial + ~0.78 neighbor-update + ~1.13 edge-lighting per chunk. Nothing is a runaway; the waste is (a) 52 heuristic misfires, (b) unconditional neighbor-update remeshes, and (c) the structural duplication of edge-light reconcile across two systems.

---

## 2 — Item 1: fix the `lightingLooksValid` heuristic  *(low risk — ship first)*

### 2.1 Current code

`processEdgeLightingUpdates`, ~line 17479:

```js
// Only recalculate if lighting is missing or appears invalid
// This preserves valid cached lighting from restored chunks
const hasValidEdgeLighting = chunk.renderState && (chunk.renderState & RENDER_PASS.EDGE_LIGHTING);
const lightingLooksValid = chunk.skyLight && chunk.skyLight.some((v, i) => i % 1000 === 0 && v > 1 && v < 15);
if (!hasValidEdgeLighting || !lightingLooksValid) {
    calculateChunkSunlight(chunk, WORLD_DIMS.chunkSize, WORLD_DIMS.chunkHeight);
}
```

`lightingLooksValid` is also the third term of the convergence short-circuit at ~line 17545:

```js
if (edgeChanged === 0 && hasValidEdgeLighting && lightingLooksValid) continue;
```

### 2.2 The problem

`lightingLooksValid` samples ~82 fixed cells (`i % 1000 === 0` over an 81 920-cell array) and asks whether *any* skylight value is strictly between 2 and 14. For a **flat open chunk**, the surface transition from solid rock (skylight 1) to open sky (skylight 15) is abrupt, so almost no sampled cell lands in the 2–14 band → `lightingLooksValid` is **false** for most plains/ocean/flat terrain.

When it is false, two things happen on *every* visit until the pass cap stops it:
- the full-chunk `calculateChunkSunlight` recompute at 17482 runs again (and `_edgeMeshDirty` is re-set at ~17510–17513), and
- the convergence `continue` at 17545 can never fire, so the chunk keeps re-queueing neighbors and remeshing.

The probe attributes **52 of 222** edge-lighting remeshes to this state (`remeshLooksInvalid`), plus the wasted recalcs that don't even reach a remesh.

### 2.3 Proposed change

Replace the value-sampling heuristic with the **authoritative generation flag**. `GEN_PASS.SUNLIGHT` (bit 8) is set immediately after `calculateChunkSunlight` at chunk creation (verified at ~line 38738–38739: `calculateChunkSunlight(...)` then `chunk.genState |= GEN_PASS.SUNLIGHT;`) and is already used as the canonical "this chunk has real lighting" test in `hasNeighborWithLighting` (~line 17418: `chunk.genState && (chunk.genState & GEN_PASS.SUNLIGHT)`).

```js
const hasValidEdgeLighting = chunk.renderState && (chunk.renderState & RENDER_PASS.EDGE_LIGHTING);
// FIX (CCR-CHUNK-002 Item 1): the old `skyLight.some(i%1000===0 && v>1 && v<15)` sampler
// reports FALSE for flat/solid chunks (sampled cells are all 1 or all 15), which forced a
// full sunlight recompute + blocked the convergence short-circuit on every pass. Use the
// authoritative GEN_PASS.SUNLIGHT flag (set once sunlight is computed, ~38739) instead.
const lightingLooksValid = (chunk.genState & GEN_PASS.SUNLIGHT) !== 0;
if (!hasValidEdgeLighting || !lightingLooksValid) {
    calculateChunkSunlight(chunk, WORLD_DIMS.chunkSize, WORLD_DIMS.chunkHeight);
}
```

No other line changes — the existing `if (... && lightingLooksValid) continue;` at 17545 and the `else if (!hasValidEdgeLighting || !lightingLooksValid)` at ~17510 keep working with the new, correct boolean.

### 2.4 Why this way

`GEN_PASS.SUNLIGHT` means exactly what the heuristic was *trying* to detect — "this chunk's skylight has been computed and is real, not a zeroed placeholder" — without false negatives on uniform terrain. It's already the engine's accepted proxy for the same question one function up, so this aligns two call sites on one definition.

**Simpler variant considered (and why the flag is preferred).** Given that every chunk in `edgeLightingUpdateQueue` has had `calculateChunkSunlight` run at creation (38738), `GEN_PASS.SUNLIGHT` is effectively *always* set here — so `lightingLooksValid` is always `true`, and one could instead **delete the term entirely**: gate the recalc on `!hasValidEdgeLighting` and the convergence `continue` on `edgeChanged === 0 && hasValidEdgeLighting`. That is the minimal diff and is functionally identical *under the invariant*. The flag form is preferred because it is **defensive**: if a chunk ever reaches this queue before its sunlight pass (a future regression, or a restored-from-cache chunk whose `genState` didn't round-trip — see §2.5), the flag still forces the needed recompute, whereas deleting the term would silently skip it. Same cost, strictly safer. If review prefers the smaller diff, deletion is an acceptable equivalent **only after** the §2.5 restored-chunk invariant is proven.

### 2.5 Side-effects investigated

- **Could this skip a recalc that was genuinely needed (leaving a chunk dark)?** The recalc is gated on `!hasValidEdgeLighting || !lightingLooksValid`. With the fix, a chunk that has `GEN_PASS.SUNLIGHT` set but `renderState`-EDGE_LIGHTING **not** yet set still recalcs (the `!hasValidEdgeLighting` term). The only behavioural change is for chunks that have *both* flags set — those previously recalced spuriously and now don't. Their skylight is already valid (flag asserts it), so skipping the recompute is correct.
- **Is `GEN_PASS.SUNLIGHT` reliably set for every chunk that reaches this queue?** Yes. Chunk creation always runs `calculateChunkSunlight` + sets the flag (38738–38739) before the chunk is registered and before adjacent/edge-lighting queues are fed (`queueAdjacentChunksForUpdate`, ~38753). A chunk cannot enter `edgeLightingUpdateQueue` without having been created. `hasNeighborWithLighting` already relies on this exact invariant.
- **Restored-from-cache chunks** (the comment's "preserves valid cached lighting"): the decompressor restores `skyLight` *and* `genState`. Confirm `genState` round-trips with `GEN_PASS.SUNLIGHT` set on cache load (RLE v2/v3 + OPFS `deserializeChunkFromDisk`). **Verification gate:** add a one-line assert/log in debug builds if a queued chunk has `skyLight` populated but `GEN_PASS.SUNLIGHT` clear — should never fire. If it can fire for restored chunks, OR the flag in on restore.
- **Worker-mesh parity:** none. This is main-thread lighting bookkeeping; the worker mesher (`__MESH_FUNCS__`) does not read `lightingLooksValid`.
- **No new identifier**, no settings, no DOM. `lightingLooksValid` keeps its name and type (boolean).

### 2.6 Expected effect

Removes the 52 misfire remeshes and their associated full-chunk `calculateChunkSunlight` calls; lets the convergence cap retire flat chunks after one real remesh. Re-measure `_edgeProbe.remeshLooksInvalid` (target: ≈0) and `_reschedSrc['edge-lighting']` (target: down toward ~166).

---

## 3 — Item 2: change-gate the `neighbor-update` remesh  *(medium risk)*

### 3.1 Current code

Caller in `processAdjacentChunkUpdates`, ~line 16996:

```js
// Run the neighbor update pass (includes tree leaves + lighting)
runNeighborUpdatePass(chunk, cx, cz);
chunk.genState |= GEN_PASS.NEIGHBOR_UPDATE | GEN_PASS.TREE_NEIGHBOR_UPDATE;

// Schedule mesh rebuild for updated chunk
// Check for both terrain and water meshes (water-only chunks have no terrain mesh)
if (isChunkMeshed(key)) {
    scheduleChunkUpdate(cx, cz, false, "neighbor-update", { reason: DIRTY_REASON.NEIGHBOR_TREE });
}
```

`runNeighborUpdatePass`, ~line 17187 (returns nothing today):

```js
function runNeighborUpdatePass(chunk, cx, cz) {
    const chunkSize = WORLD_DIMS.chunkSize;
    const chunkHeight = WORLD_DIMS.chunkHeight;
    prunePhantomNeighborLeaves(chunk, cx, cz);   // returns `removed` count (already)
    placeNeighborTreeLeaves(chunk, cx, cz);      // returns nothing today
    recalculateEdgeLighting(chunk, cx, cz, chunkSize, chunkHeight);  // discards propagation count
}
```

`recalculateEdgeLighting`, ~line 17204 (discards the `propagateLightFromNeighbors` return):

```js
function recalculateEdgeLighting(chunk, cx, cz, chunkSize, chunkHeight) {
    calculateChunkSunlight(chunk, chunkSize, chunkHeight);
    calculateBlockLight(chunk, chunkSize, chunkHeight);
    propagateLightFromNeighbors(chunk, cx, cz, chunkSize, chunkHeight);   // returns `changed`
    propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight);
    if (!chunk.renderState) chunk.renderState = 0;
    chunk.renderState |= RENDER_PASS.EDGE_LIGHTING;
}
```

`placeNeighborTreeLeaves` place site, ~line 17105:

```js
const existing = get(leafLocalX, y, leafLocalZ);
if (existing === AIR) {
    set(leafLocalX, y, leafLocalZ, treeBlocks.leaves);
}
```

### 3.2 The problem

The remesh at 17001–17003 fires **unconditionally** whenever the pass runs (gated only by `isChunkMeshed`). For the majority of chunks — flat terrain with no cross-border tree canopy and edges already at full skylight — the pass prunes nothing, places nothing, and propagates no new light, yet still schedules a full-column rebuild. The `_reschedSrc` probe shows 153 of these.

### 3.3 Proposed change

Thread the change-counts out of the pass and gate the remesh on a non-zero total.

**`placeNeighborTreeLeaves`** — add a counter and return it:

```js
function placeNeighborTreeLeaves(chunk, cx, cz) {
    const chunkSize = WORLD_DIMS.chunkSize;
    const chunkHeight = WORLD_DIMS.chunkHeight;
    // ... existing setup ...
    let placed = 0;                               // ADD
    // ... existing neighbor/tree loops unchanged ...
                const existing = get(leafLocalX, y, leafLocalZ);
                if (existing === AIR) {
                    set(leafLocalX, y, leafLocalZ, treeBlocks.leaves);
                    placed++;                     // ADD
                }
    // ... end loops ...
    return placed;                                // ADD
}
```

**`recalculateEdgeLighting`** — return the propagation change (already computed, just discarded):

```js
function recalculateEdgeLighting(chunk, cx, cz, chunkSize, chunkHeight) {
    calculateChunkSunlight(chunk, chunkSize, chunkHeight);
    calculateBlockLight(chunk, chunkSize, chunkHeight);
    const lightChanged = propagateLightFromNeighbors(chunk, cx, cz, chunkSize, chunkHeight); // CAPTURE
    propagateLightFromEdgesInward(chunk, chunkSize, chunkHeight);
    if (!chunk.renderState) chunk.renderState = 0;
    chunk.renderState |= RENDER_PASS.EDGE_LIGHTING;
    return lightChanged;                          // RETURN
}
```

**`runNeighborUpdatePass`** — sum and return all three mesh-relevant change signals:

```js
function runNeighborUpdatePass(chunk, cx, cz) {
    const chunkSize = WORLD_DIMS.chunkSize;
    const chunkHeight = WORLD_DIMS.chunkHeight;
    const removed = prunePhantomNeighborLeaves(chunk, cx, cz);
    const placed = placeNeighborTreeLeaves(chunk, cx, cz);
    const lightChanged = recalculateEdgeLighting(chunk, cx, cz, chunkSize, chunkHeight);
    return removed + placed + lightChanged;       // total mesh-relevant change
}
```

**Caller** — gate the remesh:

```js
const npChange = runNeighborUpdatePass(chunk, cx, cz);
chunk.genState |= GEN_PASS.NEIGHBOR_UPDATE | GEN_PASS.TREE_NEIGHBOR_UPDATE;

// CCR-CHUNK-002 Item 2: only remesh if the pass actually changed blocks (leaves) or light.
// A pass that pruned/placed nothing and propagated no new edge light produced byte-identical
// geometry+colors — the remesh would be a no-op. Seam face-culling is NOT relied on here; it is
// owned by runNeighborReconciliationSweep (see CCR §3.5).
if (npChange > 0 && isChunkMeshed(key)) {
    scheduleChunkUpdate(cx, cz, false, "neighbor-update", { reason: DIRTY_REASON.NEIGHBOR_TREE });
}
```

### 3.4 Why this way

The pass has exactly three ways to affect the mesh: remove leaves, place leaves, or change light. Each already produces (or trivially can produce) a count. Gating on their sum means "remesh iff something the mesh depends on changed" — the minimal correct condition. `prunePhantomNeighborLeaves` already returns its count, so two of the three signals are nearly free.

### 3.5 Side-effects investigated — **the critical one: seam face culling**

The dangerous assumption would be that the `neighbor-update` remesh is what fixes **stale seam face-culling** (a chunk meshed before its neighbor existed culled its boundary faces against `UNLOADED_BLOCK`). If that were true, gating on leaf/light change would leave holes/overdraw at borders of flat chunks. **It is not true**, and here is the evidence:

- Seam reconciliation is a **separate system**: `runNeighborReconciliationSweep` (~line 16805) scans chunks and, for each, checks whether any cardinal neighbor's mesh is missing or rendered **more recently** (`neighborDiag.lastRender > diag.lastRender`, ~16826). If so it enqueues a seam-fix rebuild via `chunkNeighborUpdateQueue` (`recordChunkUpdateState(key, "neighbor-reconcile", ...)`, ~16833). This path exists *specifically* for "blocks unchanged, seam fix only" (documented in CCR-001 §1.2.D).
- So with Item 2, the two correctness concerns are cleanly separated:
  - **Leaves / light** → `neighbor-update` (now change-gated). If nothing changed, nothing needed a remesh.
  - **Seam face culling** → `neighbor-reconcile`, which fires whenever a neighbor rendered after this chunk — exactly the "meshed before neighbor existed" case.
- **Walk-through of the worry case** (flat chunk A, no trees, meshed at T1 before neighbor B exists; B meshes at T2 > T1):
  - Today: once all 4 neighbors present, `neighbor-update` remeshes A → seam fixed.
  - With Item 2: `neighbor-update` finds `npChange === 0` → skips. `neighbor-reconcile` sees `B.lastRender (T2) > A.lastRender (T1)` → enqueues A → seam fixed. **No regression**, the remesh just moves to the system that owns seams.
  - If instead A was meshed *after* all neighbors (seam already correct): no remesh was ever needed; today's unconditional remesh was pure waste, now elided. **This is the win.**

Other effects checked:

- **Lighting idempotency (could skipping the remesh leave the displayed light stale?).** `recalculateEdgeLighting` recomputes `skyLight`/`blockLight` from scratch every call. The current mesh was baked from `chunk.skyLight`, which is produced by the **same** main-thread `calculateChunkSunlight` (38738) — the worker does not bake a divergent lighting model. So if `propagateLightFromNeighbors` returns 0 (no brighter neighbor light), the recompute reproduces byte-identical light to what the mesh already shows; skipping the remesh is safe. If it returns >0, `npChange > 0` and we remesh. Tight.
- **`prunePhantomNeighborLeaves` ordering.** Prune runs before place (so place re-adds valid leaves the prune may have over-removed). Both contribute to `npChange`; if prune removed N and place re-added the same N, `npChange = 2N > 0` and we remesh — conservative (we never *under*-remesh). Correct.
- **`genState` gate unchanged.** The pass still runs once per chunk (`!(c.genState & GEN_PASS.TREE_NEIGHBOR_UPDATE)` guard at ~16963 → set at 16997). Item 2 does not change *when* the pass runs, only whether it schedules a remesh.
- **`DIRTY_REASON.NEIGHBOR_TREE` coalescing.** Untouched — when we do schedule, the reason bit is identical to today, so CCR-001's coalescing/refill routing is unaffected.
- **Worker-mesh parity:** none (main-thread reconcile bookkeeping only).

### 3.6 Risk & rollback

Medium risk: the safety rests on `neighbor-reconcile` reliably covering seams. It is throttled (`NEIGHBOR_RECONCILE_INTERVAL_MS`) and budget-limited and skips while builds are busy, so a seam could *briefly* persist under heavy streaming before reconcile catches up — cosmetic, self-healing, and no worse than the current pre-reconcile window. **De-risking:** ship behind a 1-line guard constant (e.g. `const GATE_NEIGHBOR_UPDATE_REMESH = true;`) so it can be flipped off instantly if a seam regression is observed, and re-measure `_reschedSrc['neighbor-update']` + visually inspect chunk borders (flat plains + ocean shorelines, the worst case for `npChange === 0`).

### 3.7 Expected effect

Drops `neighbor-update` remeshes from 153 toward "chunks that actually gained leaves or light," with seam-only cases handled by reconcile. Combined with Item 1, expected avg/chunk from 3.07 toward ~2.2–2.4.

---

## 4 — Item 3: unify the neighbor-update and edge-lighting passes  *(high risk; structural)*

### 4.1 The problem

**Verified enqueue topology:** on creation, `queueAdjacentChunksForUpdate` (~16896) feeds **every** chunk into *both* reconcile systems — `chunksAwaitingNeighborUpdate.add` (→ Path A) at ~16946 **and** `queueChunkForLightingUpdate` (→ Path B) at ~16948 — and additionally marks each already-loaded neighbor `_edgeMeshDirty = true` and re-queues it for lighting (~16939–16940). So a settled chunk near the streaming frontier is re-dirtied once per *new neighbor arrival* (capped at `MAX_EDGE_LIGHTING_PASSES = 3`). This frontier-ripple — not a heuristic bug — is the dominant source of the 218 `edge-lighting` remeshes.

Two systems then reconcile cross-chunk **edge lighting**:

- **Path A** — `processAdjacentChunkUpdates` → `runNeighborUpdatePass` → `recalculateEdgeLighting` → `calculateChunkSunlight`/`calculateBlockLight` + `propagateLightFromNeighbors` + `…EdgesInward` (and, today, an unconditional `neighbor-update` remesh).
- **Path B** — `processEdgeLightingUpdates` → (conditional) `calculateChunkSunlight` + `propagateLightFromNeighbors` + `…EdgesInward` (and up to 3 debounced `edge-lighting` remeshes).

**Precise nature of the overlap (corrected from rev 1):**

- The **propagation compute is *always* duplicated** — both paths run `propagateLightFromNeighbors` + `…EdgesInward` (and Path A always re-runs the full-chunk `calculateChunkSunlight`/`calculateBlockLight`). Every chunk traverses both paths, so this CPU is spent twice per chunk regardless of timing.
- The **duplicate *remesh* is order-dependent**, not guaranteed: whichever path runs first sets `RENDER_PASS.EDGE_LIGHTING` and propagates; the second usually then sees `edgeChanged === 0`. Path B only remeshes when `_edgeMeshDirty` is set (light actually arrived), and the existing **`pendingChunkUpdates` Set + debounce already coalesce** a Path-A and Path-B schedule for the same key *if they land in the same dispatch window*. The duplicate builds that survive are the ones split across the ~17 s streaming window as the frontier advances.

So Item 3's win is primarily **eliminating the always-duplicated propagation compute** (and the second remesh in the order where it isn't coalesced), not a blanket "halve all remeshes." CCR-001 §Q5 identified this overlap; this item finishes the consolidation.

### 4.2 Proposed direction (design-level — not a clean verbatim diff)

Make the **neighbor-update pass own only block reconciliation** (prune/place leaves), and let **`processEdgeLightingUpdates` own all cross-chunk lighting** (its convergence loop, pass cap, and debounce already exist and are tuned). Concretely:

1. In `runNeighborUpdatePass`, replace the `recalculateEdgeLighting(...)` call with just the chunk-local recompute it still needs after a *leaf* change (`calculateChunkSunlight`/`calculateBlockLight` only if `removed + placed > 0`), and **enqueue the chunk into `edgeLightingUpdateQueue`** instead of propagating inline. Return `removed + placed` only.
2. The caller's remesh becomes purely the Item-2 block-change remesh (leaf changes). All *light* convergence + its remesh flow exclusively through the edge-lighting queue.
3. Net: each chunk gets at most **one** leaf remesh (only if leaves changed) + the edge-lighting queue's convergence remesh(es), with no duplicated propagation pass.

This is deliberately described at the touch-point level rather than as fabricated before/after blocks — it reorders responsibilities across two ~60–100-line functions and their queue interactions, and a fake clean diff would misrepresent the work (same honesty convention as CCR-001 Part 6).

### 4.3 Why this way

The edge-lighting queue is the more capable of the two systems: it has convergence detection (`edgeChanged`), a per-chunk pass cap (`MAX_EDGE_LIGHTING_PASSES`), neighbor re-queueing, and a remesh debounce (`EDGE_REMESH_DEBOUNCE_MS`). The neighbor pass's inline `recalculateEdgeLighting` has none of these — it just propagates once and remeshes. Consolidating onto the queue removes the duplication without losing convergence quality.

### 4.4 Side-effects investigated

- **Subsumes Item 2.** Once leaf and light remeshes are separated and light flows only through the queue, Item 2's change-gate becomes the natural "remesh iff leaves changed" branch. **Implication for ordering:** Item 2 is a *stepping stone*; its `runNeighborUpdatePass` return-value plumbing is reused by Item 3, and its caller gate is replaced by Item 3's split. Do not treat Item 2 as throwaway — it is the safe intermediate that Item 3 builds on.
- **Convergence timing / dark borders.** Moving propagation out of the (synchronous, immediate) neighbor pass into the (throttled, budgeted) edge-lighting queue means border light could converge a few frames *later*. The queue already governs this for the majority of chunks today, so the change is bounded; still, this is the primary regression to watch. **Verification:** dark-cave-across-border and night-time torch-across-border scenes; compare convergence latency before/after with a temporary timestamp on first-correct-border-light.
- **Leaf pop-in timing.** Cross-chunk canopy leaves still place synchronously in the neighbor pass; only their light reconcile defers. So leaves don't visibly pop later than today.
- **Order-dependence between the two queues** (which runs first for a given chunk) — collapsing to one system *removes* this hazard rather than adding it.
- **Worker-mesh parity:** none (lighting reconcile is main-thread).
- **Interaction with `lightRefill`:** positive — routing all light convergence through the edge-lighting queue (whose remeshes are `DIRTY_REASON.LIGHT`) maximizes the fraction of reconcile work that `lightRefill` can downgrade to a color upload.

### 4.5 Risk & rollback

High risk (touches the lighting-convergence core). Recommend prototyping behind a guard constant and A/B-measuring `_reschedSrc` totals + convergence-latency + `window.printFaceHistogram()` (face counts must not balloon). Land **only after** Items 1–2 are measured and stable, and after deciding the `lightRefill` question (§6).

### 4.6 Alternatives considered & rejected (whole-CCR)

- **Wait for all 4 (or 8) neighbors before the *first* edge-lighting pass** (would collapse the frontier-ripple to one converged pass per chunk). **Rejected** — the code already chose against it deliberately: `processEdgeLightingUpdates` (~17424–17428) comments that *"Chunks at render distance edge may NEVER have all 4 neighbors"* and would *"stay dark forever waiting for neighbors that may not exist yet."* Re-introducing a wait would regress border darkness at the render-distance edge. Items 1–3 instead reduce the *cost/count* of the ripple without gating on neighbor completeness.
- **Rely on the existing `pendingChunkUpdates` Set + debounce to dedupe Path A vs Path B.** It already does — *within a dispatch window*. **Insufficient alone**: across the multi-second streaming window the same chunk is re-dirtied in *different* windows as each neighbor arrives, so the Set can't coalesce them. This is why Item 3 (remove the duplicate work at the source) is needed rather than "just lean harder on debounce."
- **Raise `EDGE_REMESH_DEBOUNCE_MS` / lower `MAX_EDGE_LIGHTING_PASSES`** (cheap tuning knobs). **Rejected as the primary fix** — both trade correctness for fewer remeshes: a longer debounce or lower cap leaves borders mid-converged longer (darker seams during streaming). They are legitimate *secondary* tuning once Items 1–3 land, but they mask the redundancy rather than removing it.
- **`lightRefill`-only (do nothing here, just enable CCR-001 Phase 3B).** Attractive for the `edge-lighting` bucket but **incomplete**: (a) it makes the duplicate *remesh* cheap but does **not** remove the always-duplicated *propagation compute* (two full-chunk light recomputes per chunk — the CPU that drives the `rAF` stalls as much as the GPU upload); (b) it does not touch the `neighbor-update`/`NEIGHBOR_TREE` bucket (Item 2's domain); (c) it is default-OFF/experimental with an unsolved water-band fallback. Best treated as **complementary** (cost-side) to this CCR (count-side) — see §6.
- **Move light fully out of geometry (CCR-001 Phase F, light-as-texture).** The clean end-state, but a separate large CCR; out of scope here.

---

## 5 — Implementation order & interdependencies

```
Item 1 (lightingLooksValid fix)        ── independent, lowest risk ──► ship, re-measure
        │ (reduces edge-lighting churn count; no dependency)
        ▼
Item 2 (neighbor-update change-gate)   ── independent of Item 1; adds return-value plumbing ──► ship behind GATE_* flag, re-measure
        │ (the runNeighborUpdatePass/recalculateEdgeLighting/placeNeighborTreeLeaves
        │  return values are REUSED by Item 3)
        ▼
Item 3 (unify passes)                  ── depends on Item 2's plumbing; SUBSUMES Item 2's caller gate ──► prototype behind flag, A/B
```

- **1 → (decision) → {2, 3}.** Item 1 is unconditional — ship it first (trivial, strictly-correct, helps whether or not anything else lands). Then make the **structural decision** below before 2/3.
- **Consolidation decision — do NOT necessarily ship Item 2 separately.** Item 3 *replaces* Item 2's caller gate; only Item 2's **return-value plumbing** (`placeNeighborTreeLeaves`/`recalculateEdgeLighting`/`runNeighborUpdatePass` returning change counts) survives into Item 3. So there are two valid paths, pick one:
  - **(a) Combined** — if the team commits to the structural fix, implement Item 2's plumbing *as the first commit of Item 3* and skip the temporary `GATE_*` caller gate. Fewer throwaway edits; one review of the consolidated reconcile design.
  - **(b) Staged** — ship Item 2 standalone (behind `GATE_NEIGHBOR_UPDATE_REMESH`) to bank the `neighbor-update` savings and de-risk via in-browser measurement *before* committing to the higher-risk Item 3. Choose this only if you want the interim datapoint; accept that the caller gate is scaffolding.
  - Recommended: **(b) if Item 3 is uncertain/deferred; (a) if Item 3 is already greenlit.**
- **`lightRefill` gates the value of Item 3, not Item 2.** Decide §6 *before* Item 3: if `lightRefill` is matured/enabled, Item 3's remesh-side win shrinks to the compute-side win (still real — the duplicated `calculateChunkSunlight`/propagation — but smaller), which may drop Item 3 below the line. Item 2's `NEIGHBOR_TREE` savings are unaffected by `lightRefill` either way.
- Re-measure `_reschedSrc` / `_meshCounts` / `_edgeProbe` after each landed step (probes re-added temporarily) to confirm each item's predicted drop before proceeding. Targets: Item 1 → `remeshLooksInvalid ≈ 0` and `edge-lighting` count down toward ~166; Item 2 → `neighbor-update` down to leaf/light-changed chunks only; Item 3 → no duplicate light reconcile (one propagation pass per chunk).

---

## 6 — Interaction with CCR-001 (`lightRefill`)

CCR-001 Phase 0 added `DIRTY_REASON = { GEOMETRY:1, LIGHT:2, SEAM:4, NEIGHBOR_TREE:8 }` (~line 16612) and Phase 3B added `refillChunkLightColors` + `SETTINGS.lightRefill` (**default OFF**), which converts a **`LIGHT`-only** dirty into an in-place vertex-color upload instead of a full-column remesh.

The 218 `edge-lighting` remeshes are all scheduled with `reason: DIRTY_REASON.LIGHT`. Therefore, **with `lightRefill` ON, those would already become color uploads, not full remeshes** — attacking the largest single bucket without Items 1–3. Why this CCR still matters and how they compose:

- `lightRefill` reduces the **cost** of each light remesh; Items 1–3 reduce the **count** of scheduled rebuilds. They are complementary: fewer scheduled events × cheaper-when-they-happen.
- AS-BUILT caveats on `lightRefill` (per CCR-001): "experimental, untested-from-boot"; **water bands decline to refill** (fall back to full remesh); refill recomputes corner light 4× per quad. So it is not a free flip — it needs a from-boot soak test and a water-band story before defaulting ON.
- `neighbor-update` remeshes are tagged `DIRTY_REASON.NEIGHBOR_TREE` (a genuine block change), so `lightRefill` does **not** cover them — Item 2 is the only lever for that bucket.

**Recommendation to reviewer:** sequence **Item 1 first** (tiny, strictly-correct, helps regardless), then decide between (a) maturing/enabling `lightRefill` and (b) Items 2–3, or do both. If `lightRefill` is matured, Item 3's value drops (light remeshes become cheap) but Item 2 retains full value (block-change bucket).

---

## 7 — Safety checks & single-file constraints (per `CLAUDE.md`)

- **Single-file rule:** all edits in `voxEx.html`. No new files/assets.
- **No duplicate/shadowed identifiers:** new locals are `placed`, `lightChanged`, `removed`, `npChange` (function-scoped); `GATE_NEIGHBOR_UPDATE_REMESH` is the only proposed module constant — grep to confirm 0 existing occurrences before adding. No shadowing of `scene`, `camera`, `chunks`, `chunkMeshes`, `SETTINGS`, `WORLD_DIMS`, `GEN_PASS`, `RENDER_PASS`, `DIRTY_REASON`.
- **Strict equality** (`===`/`!==`) throughout; bit tests use `(x & MASK) !== 0`.
- **JSDoc:** update the `@returns` on `runNeighborUpdatePass`, `recalculateEdgeLighting`, and `placeNeighborTreeLeaves` (now return counts).
- **No new per-frame work:** Items 1–2 only change existing branches; Item 3 moves work from the neighbor pass to the already-budgeted edge-lighting queue (no new loop in `processChunkQueue`/render loop).
- **No settings round-trip needed** for Items 1–2 (no new `SETTINGS.*`). If `GATE_NEIGHBOR_UPDATE_REMESH` is exposed as a setting (optional), wire `DEFAULTS` (~5284) + `SETTINGS` (~5067) + DOM (~28800+) + `saveSettings()` and decide `SETTINGS_PROFILES` membership; otherwise keep it a plain `const`.
- **Tests:** run `tools/voxex-tests.html` (~204 tests, localhost) — lighting + chunk-worker round-trip + persistence codec must stay green. Item 1's restored-chunk concern (§2.5) warrants a targeted assertion. Item 3 warrants a new convergence-latency check.
- **Build banner:** bump `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` when each item lands (NOT for the temporary probes).
- **Terrain-visualizer / worker parity:** unaffected (no terrain-gen or worker-mesher changes).

## 8 — Change-reporting checklist (for the implementing commit)

- [ ] Temporary probes reverted (`grep PROBE\|_meshCounts\|_edgeProbe\|_reschedSrc\|EdgeLightProbe`).
- [ ] Item 1: `lightingLooksValid` now `(chunk.genState & GEN_PASS.SUNLIGHT) !== 0`; restored-chunk flag verified.
- [ ] Item 2: three functions return change counts; caller gated; `GATE_*` flag present; seams visually verified on plains + shoreline.
- [ ] Item 3 (if included): light reconcile consolidated onto `edgeLightingUpdateQueue`; convergence latency A/B'd; face histogram unchanged.
- [ ] `_reschedSrc` / `_meshCounts` re-measured per step and matches predicted drops.
- [ ] `tools/voxex-tests.html` green; `VOXEX_BUILD` bumped; no duplicate/shadowed identifiers.

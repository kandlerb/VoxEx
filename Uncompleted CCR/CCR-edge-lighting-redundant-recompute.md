# CCR — Edge-Lighting: Redundant Full-Chunk Sunlight Recompute on Flag-Clear Passes

**ID:** VOXEX-CCR-LIGHT-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟡 **Proposal / report only — no code applied yet.** Read & debate first. Companion to (does **not** supersede) `CCR-idle-streaming-remesh-reduction.md` (VOXEX-CCR-CHUNK-002): that CCR reduces the *number of* edge-lighting passes scheduled; this one removes a redundant *full-column recompute inside* the pass. The two are orthogonal and compose.
**Scope:** Stop calling the full-chunk `calculateChunkSunlight()` recompute on every edge-lighting pass where the chunk's `RENDER_PASS.EDGE_LIGHTING` flag is clear, because that recompute re-derives base sunlight the chunk already holds. This fires once on a chunk's first pass **and again every time one of its 8 neighbors streams in** (which clears the flag). The fix removes that work; it does **not** change edge propagation, convergence, remesh scheduling, or — provably — make any border darker.

> **Line numbers are as of the working tree on 2026-06-22 (build `2026-06-22.2`) and WILL drift** — grep the quoted identifier/string before editing, per repo convention. The CCR-002 Item-1 `[CCR002-verify]` debug probe (line 17500) is still in the tree and shifts nearby lines by a few.

---

## Summary

- **Observed (by code audit):** During world streaming, `processEdgeLightingUpdates()` runs a full-chunk `calculateChunkSunlight()` — an 81,920-cell `fill` + an 81,920-iteration vertical scan + a horizontal BFS — on **every pass where the chunk's `EDGE_LIGHTING` flag is clear**. That recompute resets `chunk.skyLight` to base and re-derives values the chunk already holds. In the dominant cases the recomputed array is identical to what was already there.
- **It fires more often than "once per chunk."** The flag is clear on a chunk's **first** edge pass, and it is **cleared again every time a neighbor chunk is created** next to it: `queueAdjacentChunksForUpdate()` does `neighborChunk.renderState &= ~RENDER_PASS.EDGE_LIGHTING` (line **16938**) for all 8 neighbors of each new chunk and re-queues them. So as a chunk's 8 neighbors stream in, that chunk can be recomputed several times over the streaming window — each time redundantly.
- **Root cause:** the recompute gate at line **17503** is `if (!hasValidEdgeLighting || !lightingLooksValid)`. `hasValidEdgeLighting` is `renderState & RENDER_PASS.EDGE_LIGHTING`. Because that flag is (re)cleared whenever a neighbor arrives — and only re-set at line **17541**, after a full pass — the gate fires on `!hasValidEdgeLighting` alone, even though `lightingLooksValid` (base sunlight present, `genState & GEN_PASS.SUNLIGHT`) is already true.
- **Why CCR-002 didn't already fix this:** CCR-CHUNK-002 Item 1 (shipped, build `2026-06-21.1`) repaired the **other** operand of that `||` — the `lightingLooksValid` heuristic — which used to misfire and force the recompute on *converged* passes. The `!hasValidEdgeLighting` operand is **independent and untouched**; it still forces the recompute on every flag-clear pass.
- **The recompute is not load-bearing here.** `propagateLightFromNeighbors()` (line **17508**) runs in **both** the current and proposed code, *after* the recompute/skip decision, importing fresh edge values from whatever neighbors are present. The recompute only additionally *resets the base* first. Skipping the reset leaves the existing (≥ base) `skyLight` in place; the subsequent import then runs identically. See *Correctness* for the proof that this can never darken a border.
- **Recommended fix:** gate the recompute on base-sunlight validity **only** (`!lightingLooksValid`), dropping the `!hasValidEdgeLighting` operand. Removes the redundant full-column recompute on first-pass and neighbor-arrival passes alike.

---

## Root cause detail

### The recompute gate — `processEdgeLightingUpdates()` (lines 17486–17505)

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

`RENDER_PASS.EDGE_LIGHTING` is set late in the **same** function (line **17541**, `chunk.renderState |= RENDER_PASS.EDGE_LIGHTING`), so it is clear during the pass that runs the recompute.

### Two distinct events make `hasValidEdgeLighting` false (and the difference matters)

1. **First pass ever** (fresh chunk). `skyLight` is **base-only** — it was computed by `calculateChunkSunlight()` at creation and flagged `GEN_PASS.SUNLIGHT` immediately after, on both creation paths:
   - Worker path, lines **38742–38743**: `calculateChunkSunlight(...)` then `chunk.genState |= GEN_PASS.SUNLIGHT`.
   - Main-thread path, lines **38823–38824**: identical pair.
   Re-running the recompute here reproduces the same base array bit-for-bit. **Purely redundant.**

2. **Neighbor-arrival re-queue.** When any new chunk is created, `queueAdjacentChunksForUpdate()` clears each existing neighbor's edge-lighting flag and re-queues it (lines **16933–16950**):
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
   Here `skyLight` may **already carry edge light** from the chunk's earlier passes. The recompute would *reset it to base* before re-importing. The proposed fix skips that reset. This is the only case where current and proposed behavior can differ — analyzed in *Correctness* below.

### What the recompute costs

`calculateChunkSunlight()` (lines 37809–37908), per call, for a 16×16×320 chunk:

- **Phase 1 — vertical pass** (lines 37820–37860): `skyLight.fill(1)` = **81,920** writes, then a `16 × 16 × 320` = **81,920**-iteration top-to-bottom scan writing every cell again and seeding the BFS. → **≥163,840 array ops** before the BFS.
- **Phase 2 — horizontal BFS** (lines 37866–37907): floods every sky-lit transparent cell sideways; for open, sky-exposed terrain the seed queue is large.

It is the single most expensive operation in the edge-lighting path. Multiplied by (first pass + up to ~8 neighbor-arrival passes) per chunk across a streaming front, it is a meaningful chunk of the main-thread time in the window CCR-002 documents as producing `requestAnimationFrame` stalls.

> **Honest scoping of impact:** these are *operation counts read from source*, not a profiled millisecond figure. The redundancy and the per-pass frequency are certain; the exact wall-clock saving is terrain- and device-dependent and must be measured in-browser (see Test plan). What is not in doubt: the work is removable with, at worst, a benign and self-healing visual difference.

---

## Correctness — why this is safe (and never darkens a border)

The current and proposed code differ **only** in whether `calculateChunkSunlight()` resets `chunk.skyLight` to base before the shared `propagateLightFromNeighbors()` / `propagateLightFromEdgesInward()` steps run. Let `S` = the chunk's existing `skyLight` at the start of the pass.

- **Base-only invariant.** `S ≥ base` pointwise at all times, because the only writers of `skyLight` after creation are `calculateChunkSunlight` (sets exactly base + intra-chunk fill) and the edge-propagation functions, which are **monotone-max** (they only ever raise a cell — `if (propagated > skyLight[idx]) skyLight[idx] = propagated`, lines 17302/17396, never lower it).
- **Current path:** `skyLight ← base` (recompute), then import from present neighbors (monotone-max) → result `R_cur`.
- **Proposed path:** keep `S` (which is `≥ base`), then the *same* import from present neighbors (monotone-max) → result `R_fix`.
- Because the import step is identical and monotone-max, and `S ≥ base`, we have **`R_fix ≥ R_cur` pointwise**. The proposed result is never darker than the current one anywhere.

**Consequences:**

- **No dark seams — ever.** The failure mode the edge-lighting system exists to prevent (dark borders where caves cross a chunk boundary) is *impossible* under this change, because it can only equal or *raise* light, never lower it.
- **Case A (the common case): exact parity.** When every neighbor that previously contributed light to `S` is still present, the import re-supplies that same light, so `R_fix = R_cur` exactly. This covers all first-pass-fresh chunks (`S = base`) and all neighbor-arrival passes where no prior contributor has unloaded — i.e. essentially all of normal forward streaming.
- **Case B (the only divergence): benign over-bright transient.** If a neighbor `P` that previously raised cells in `S` has since *unloaded*, the recompute would discard `P`'s contribution (P absent → not re-imported), while the fix retains it. Result: those border cells stay at their **old, brighter** value instead of falling back. This is a faintly *over-bright* border, only at a render-distance-churn seam (P unloaded while a different neighbor N arrives to trigger the re-queue), and it **self-heals** on the next remesh, edit, or P reload. It is never visible as a defect of the kind dark seams are; arguably it is *more* stable than the current behavior, which dims-then-rebrightens as P unloads and reloads.

So the change trades a guaranteed-redundant full recompute for, at worst, a transient over-bright border cell that cannot become a dark seam. This is the same class of "one genuinely new, low-severity behavior" disclosure as `CCR-Collision-vertical-gap.md`.

### Restored (cached) chunks

Both persistence formats round-trip `renderState`, `genState`, **and** `skyLight` together — IndexedDB via `ChunkCompressor.compress`/`decompress` (lines 25498/25517) and OPFS via `serializeChunkForDisk`/`deserialize` (lines 25584/25609). So a chunk saved *after* it was edge-lit restores with both the edge light **and** the `EDGE_LIGHTING` flag set → `hasValidEdgeLighting` true → the **current** code already skips its recompute. Restored chunks therefore introduce no new divergence beyond the live Case-B transient above; the persisted flag stays consistent with the persisted `skyLight`.

---

## Proposed fix

Gate the full recompute on base-sunlight validity only:

```js
const hasValidEdgeLighting = chunk.renderState && (chunk.renderState & RENDER_PASS.EDGE_LIGHTING);
const lightingLooksValid = (chunk.genState & GEN_PASS.SUNLIGHT) !== 0;
// VOXEX-CCR-LIGHT-001: recompute base sunlight ONLY when it is actually missing/invalid.
// The previous `!hasValidEdgeLighting ||` operand forced a full 320-tall recompute on every
// pass where the EDGE_LIGHTING flag is clear — the chunk's first pass AND every neighbor-arrival
// re-queue (queueAdjacentChunksForUpdate clears the flag, ~16938). That recompute re-derived the
// base skyLight calculateChunkSunlight() already produced at creation (genState.SUNLIGHT,
// ~38743/38824). propagateLightFromNeighbors below imports fresh edge values either way, and is
// monotone-max, so skipping the base reset can only EQUAL or RAISE light, never lower it
// (no dark seams possible). See CCR Correctness section for the proof and the one benign
// over-bright transient (a now-unloaded prior contributor).
if (!lightingLooksValid) {
    calculateChunkSunlight(chunk, WORLD_DIMS.chunkSize, WORLD_DIMS.chunkHeight);
}
```

`hasValidEdgeLighting` is still computed and still used unchanged by the convergence/re-queue logic below — the first-pass inward-spread branch (line **17532**, `else if (!hasValidEdgeLighting || !lightingLooksValid)`) and the neighbor re-queue guard (line **17567**). Only its use **in the recompute gate** is removed.

**Why this is the minimal-risk shape:**

- **One-operand change**, no new identifiers, no new state, no new settings/DOM, no `SETTINGS_VERSION` bump.
- **Strictly removes work**; adds nothing to any path.
- **The safety net is preserved.** When base sunlight is genuinely absent/invalid (`genState.SUNLIGHT` clear — the restored-chunk-whose-genState-didn't-round-trip case the CCR-002 `[CCR002-verify]` probe at line 17500 watches for), `!lightingLooksValid` is true and the recompute still fires.
- **Provably no dark seams** (see Correctness); the only new behavior is a benign, self-healing over-bright transient at render-distance churn seams.

### Note on the `else if` at line 17532

The first-pass inward-spread branch keeps its `!hasValidEdgeLighting` operand — correctly, since its job is the one-time inward spread on a flag-clear pass when no neighbor light arrived (`edgeChanged === 0`). The fix does not touch it; after the fix, that branch runs against the already-valid `skyLight` **without** the preceding redundant recompute, which is the intended outcome.

### Alternative considered — tighter gate for exact byte-parity (rejected as over-engineering)

To eliminate even the Case-B over-bright transient, one could track a separate "skyLight is base-only" bit and recompute only on genuine first passes. That reintroduces per-chunk state and a second flag to keep consistent, for the sake of suppressing a transient that cannot produce a visible defect and self-heals. Not worth it; the one-operand fix is preferred.

---

## Optional secondary hardening (NOT required for this CCR; lower impact)

Same-subsystem wins surfaced during the audit, far smaller than removing the recompute (these are per-iteration *reads*, not full-column recomputes). Recommend deferring to a separate change so this CCR stays a clean single-lever fix.

1. **Unconditional 320-tall edge-seed scan** in `propagateLightFromEdgesInward()` (lines 17336–17370): all four edges are scanned over the full `chunkHeight` every call to seed the BFS, even on solid-rock or unlit-air columns. A per-edge "any cell with `skyLight > 1`" early-out (or a precomputed top-of-lit-column bound) would skip the dark span (~19,200 read-iterations/call today).
2. **Neighbor re-queue edge scan** (lines 17588–17594): re-scans a neighbor's full edge column for `skyLight > 2` before re-queuing; already early-outs (`!hasLight` breaks both loops), so only sky-lit borders pay the full scan.

The interior BFS in `propagateLightFromEdgesInward` (lines 17372–17401) has no visited-set, but its `if (propagated > skyLight[nIdx])` + write-on-enqueue guard makes re-enqueue **value-monotone** (bounded by the 1–15 range) and self-limiting — **not** worth changing.

---

## Safety checks

- **Single-file rule:** change is confined to one `if`-condition inside `processEdgeLightingUpdates()` in `voxEx.html`; no new files or assets.
- **No duplicate/shadowed identifiers:** no new declarations; `hasValidEdgeLighting`/`lightingLooksValid`/`calculateChunkSunlight`/`GEN_PASS`/`RENDER_PASS` are read, not redeclared. `hasValidEdgeLighting` remains in use by the `else if` (17532) and re-queue (17567) logic.
- **No DOM/settings wiring:** no new settings, DOM IDs, or save/load fields; nothing to round-trip.
- **Per-pass cost:** strictly *removes* work (one full-column recompute on every flag-clear pass); adds nothing.
- **Lighting-result parity:** byte-exact in Case A (all prior contributors present — every first-pass-fresh chunk and all normal forward streaming). The proposed result is **provably ≥ the current result pointwise** (monotone-max import over a `≥ base` array), so it **can never darken a border / produce a dark seam**. The only divergence is the Case-B over-bright transient (now-unloaded prior contributor at a churn seam), which self-heals on remesh/edit/reload.
- **Worker parity:** none required — `calculateChunkSunlight` and `processEdgeLightingUpdates` are main-thread-only for both worker- and main-generated chunks. No `buildChunkWorkerCode()` change.
- **Invariant relied upon:** `genState.SUNLIGHT` set ⟹ `chunk.skyLight` present and correctly sized — holds for both creation paths and current-version cache restores. The `[CCR002-verify]` probe (line 17500) already logs any violation; keep it through the soak.

## Test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204 tests; serve over localhost; on this headless box drive installed Chrome via puppeteer-core/SwiftShader). Lighting + meshing coverage should stay green — expect the documented `214/214 ... All green!`.
- **Parity probe (validates Case A):** temporarily snapshot `chunk.skyLight` before the gate, run a pass with the recompute, and assert the array is identical to a pass without it — for first-pass-fresh chunks and for neighbor-arrival passes with all neighbors present. Confirms exact parity in the dominant cases. Remove before shipping.
- **Churn-seam manual test (exercises Case B):** fly **forward at high render distance** so chunks unload behind while new chunks load ahead (the only path that produces an absent-prior-contributor seam). Confirm: **no dark seams** at any chunk border, in caves or on the surface; at worst a faint, transient over-bright border that disappears on the next remesh/edit. Verify borders match the current build everywhere except possibly that benign brightening.
- **Fresh + restored worlds:** load a **fresh** world and fly into ungenerated terrain (maximizes first-pass + neighbor-arrival recomputes); then a **cached/OPFS-restored** world (the path that already skipped the recompute). Confirm identical lighting and no `[CCR002-verify]` logs.
- **Measurement (honest impact):** bracket the recompute with `performance.now()` (or use the existing `meshProfile()` seam) over a fixed streaming run, before vs. after, and report the **measured** main-thread saving rather than the op-count estimate above.

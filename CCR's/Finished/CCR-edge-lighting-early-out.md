# CCR — Edge-Lighting Full-Column Scan: "Has Light" Early-Out

**ID:** VOXEX-CCR-LIGHT-003
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🟢 Implemented (build 2026-06-22.14)
**GitHub:** #486
**Scope:** Lighting › edge propagation › `propagateLightFromEdgesInward`

---

## Summary

`propagateLightFromEdgesInward()` seeds a BFS by scanning all 4 edges of a chunk over the full 320-cell column (~19,200 read-iterations per call) with no early-out for dark columns. Added a top-of-column guard: if the topmost cell of an edge column has `skyLight ≤ 1`, the column is provably dark (sunlight propagates top-down) and is skipped.

---

## Change

Precomputed `const topYOff = (chunkHeight - 1) * cs * cs;` once before all four edge loops. Before each inner `for (let ly...)` loop, added:

```js
if (skyLight[lx + lz * cs + topYOff] <= 1) continue; // dark column — no seeds
```

with `lx`/`lz` substituted appropriately for each edge (West: `0 + lz*cs`, East: `15 + lz*cs`, North: `lx + 0*cs`, South: `lx + 15*cs`).

---

## Correctness

- **Safe skip:** If `skyLight[top] ≤ 1`, no cell in the column can be a seed (`> 1` threshold) because sunlight propagates top-down — any light present below the top came from above via that same column, which would have required the top to be lit first.
- **No false negatives:** Columns with `skyLight[top] > 1` are scanned normally.
- **Horizontal propagation (from neighbors):** `propagateLightFromNeighbors` runs before `propagateLightFromEdgesInward`. Any neighbor light already written into edge cells at lower heights would still require the column top to have received sunlight (otherwise the column is in full darkness — a completely closed cave). In practice, the top of any chunk (ly=319 = world y≈255) is always sky with skyLight=15, so the guard fires only for chunks whose skyLight was never computed (all values = initial minimum). In those cases, no seeds exist anyway.
- **Neighbor re-queue scan:** Not modified — already has its own per-column `hasLight` scan (which is stricter but covers different callers).

---

## Safety Checks

- [x] No new globals, no shadowed identifiers
- [x] Guard is a pure early-out — cannot cause false-dark seams on lit columns
- [x] `topYOff` computed once (not inside any inner loop)
- [x] Does not touch the neighbor re-queue scan or interior BFS
- [x] 282/282 tests green

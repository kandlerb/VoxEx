# CCR — Edge-Lighting Full-Column Scan: "Has Light" Early-Out

**ID:** VOXEX-CCR-LIGHT-003
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #486
**Scope:** Lighting › edge propagation › `propagateLightFromEdgesInward`

---

## Summary

`propagateLightFromEdgesInward()` (called from `processEdgeLightingUpdates`) seeds a BFS by scanning all 4 edges of a chunk over the full 320-cell column (~19,200 read-iterations per call) with no early-out for dark columns. On solid-rock or unlit-air edge columns — common in cave/ocean/deep sections — the scan always finds nothing, yet pays the full cost. Adding a top-of-column light check before each column scan eliminates the wasted work on dark edges.

---

## Current Behavior (verified against source)

### Edge-seed scan in `propagateLightFromEdgesInward()` (~lines 17336–17370)

Iterates all 4 edges × 16 columns × 320 cells = **19,200 cell reads** per call:

```js
// Example: +X edge scan (pattern repeated for all 4 edges)
for (let col = 0; col < CHUNK_SIZE; col++) {
    for (let y = minY; y <= maxY; y++) {
        const idx = 15 + (col << 4) + ((y + yOffset) << 8);
        const light = skyLight[idx];
        if (light > 2) {
            task.enqueueAdd(cx * 16 + 15, y, cz * 16 + col, light);
        }
    }
}
```

No check for whether the column top has any light before descending 320 cells.

### Neighbor re-queue scan (~lines 17588–17594) — already has early-out

```js
let hasLight = false;
for (let y = ...) {
    if (skyLight[...] > 2) { hasLight = true; break; }
}
if (!hasLight) continue; // already skips dark columns
```

The seed scan lacks this guard entirely.

---

## Proposed Fix

Before descending each 320-cell edge column in the seed scan, check whether the **top cell** of that column edge has any sunlight. If `skyLight[topIdx] <= 1`, the column was never reached by sunlight from above (sunlight propagates downward from the top), so no seeds can exist in it — skip.

```js
// Before the inner y-loop for each edge column:
const topIdx = edgeX + (col << 4) + ((maxY + yOffset) << 8); // top of column
if (skyLight[topIdx] <= 1) continue; // dark column — no seeds possible

for (let y = maxY; y >= minY; y--) {
    // ...existing scan...
}
```

This is a single read (the top cell) per column per edge scan, used to skip the full 320-cell descent. On a completely dark chunk (e.g. all-underground or fully oceanic), all 64 columns skip instantly.

---

## Correctness

- **Why checking only the top is sufficient:** Sunlight enters from above. If the top cell of an edge column has `skyLight ≤ 1`, no sunlight has propagated into the column from any direction above. Any light that could have entered via a neighbor's horizontal propagation would also appear at some level in the column, but the **seed scan only enqueues cells already lit** (`light > 2`). If the top is dark and we're looking for cells to seed, the column can only have light if a neighbor already wrote it in — at which point those cells get picked up by the BFS itself, not the seed scan.
- **No false negatives:** A column with `skyLight[top] > 1` continues to be scanned normally. Only provably-dark columns (top ≤ 1) are skipped.
- **Output identical on lit columns:** The early-out fires only when the column would produce no seeds. The BFS result is unchanged.

---

## Implementation Plan

1. In `propagateLightFromEdgesInward()`, for each of the 4 edge directions, add a top-of-column guard before the inner `for (let y = ...)` loop.
2. The guard reads `skyLight[topIdx]` where `topIdx` indexes the top cell of the current edge column. The exact index formula mirrors the existing inner-loop formula at `y = maxY`.
3. Run `tools/voxex-tests.html` (282 tests) — all must pass.
4. In-browser: confirm no dark seams at chunk borders (edge lighting still propagates correctly across lit boundaries).

---

## Safety Checks

- [ ] No new globals, no shadowed identifiers
- [ ] Guard is a pure early-out — cannot cause false-dark seams (only skips proven-dark columns)
- [ ] Does not touch the neighbor re-queue scan (already has its own early-out)
- [ ] Does not touch the interior BFS (deliberately excluded — its monotone guard is self-limiting)
- [ ] 282/282 tests green before commit

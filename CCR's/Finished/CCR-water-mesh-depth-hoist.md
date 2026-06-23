# CCR — Hoist waterDepth/shoreDist Above Per-Face Loop in Water Meshing

**ID:** VOXEX-CCR-PERF-010
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟢 Implemented (build 2026-06-22.12)
**GitHub:** #482
**Scope:** Eliminate per-face recomputation of `waterDepth` and `shoreDist` in the water meshing path — both values depend only on block position (x, y, z), not on face direction.

---

## Summary

Water block meshing computed `waterDepth` (downward scan to find solid ground) and `shoreDist` (4-directional scan to find nearest non-water neighbor) **inside the per-face loop**, causing up to 6 redundant scans per water block. Both values depend only on `(x, y, z)`, not on which face is being emitted. Hoisted above the face loop in all three meshing sites.

---

## Sites Updated

### Site 1 — Greedy path water-only loop (main thread, ~line 41376)

Hoisted waterDepth and shoreDist above `for (let faceIdx = 0; ...)`. The face loop now uses the pre-computed values directly.

### Site 2 — Non-greedy per-block loop (main thread, ~line 41448)

Added `let waterDepth = 0, shoreDist = 4;` before the face loop, guarded by `if (isWater)` so non-water blocks pay zero cost. Removed the per-face computation from inside the `else if (isWater)` draw branch.

### Site 3 — Worker static driver (~line 18848)

Same structural change as Site 1 — the worker's hand-maintained water loop now hoists both computations above the face loop.

---

## Correctness

- `waterDepth` and `shoreDist` are pure functions of `(x, y, z)` — they call only `getLocal` (read-only), with no side effects and no dependence on face normal.
- Hoisting is semantically equivalent: the values computed once are identical to what each per-face call returned.
- For non-greedy path: non-water blocks get `waterDepth=0, shoreDist=4` (unused) with zero scan cost.
- All three sites updated in lockstep — no worker parity drift.

---

## Safety Checks

- [x] Hoist applied identically to ALL THREE sites (greedy main + non-greedy main + worker static driver)
- [x] `waterDepth` and `shoreDist` variable declarations moved above (not inside) the face loop
- [x] `getLocal` is read-only — verified
- [x] No new allocations introduced in the hoist
- [x] No DOM/settings/cache-version changes
- [x] 282/282 tests green after change

# CCR — Hoist waterDepth/shoreDist Above Per-Face Loop in Water Meshing

**ID:** VOXEX-CCR-PERF-010
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #482
**Scope:** Eliminate per-face recomputation of `waterDepth` and `shoreDist` in the water meshing path — both values depend only on block position (x, y, z), not on face direction.

---

## Summary

Water block meshing computes `waterDepth` (downward scan to find solid ground) and `shoreDist` (4-directional scan to find nearest non-water neighbor) **inside the per-face loop**, meaning up to 6 recomputations per water block. Since neither value depends on which face is being emitted, they can be hoisted above the face loop — computed once per water block, reused for all faces.

**Three sites must be updated in lockstep** (greedy main, non-greedy main, worker static driver) to maintain worker parity.

---

## Current Code

### Greedy path (~lines 41341–41370) — schematic

```js
for each water block (x, y, z):
    for each face direction:
        const waterDepth = computeWaterDepth(x, y, z);   // ← recomputed per face
        const shoreDist  = computeShoreDist(x, y, z);    // ← recomputed per face
        // use waterDepth, shoreDist for vertex colors / foam
```

`computeWaterDepth` scans downward up to ~5 blocks per call. `computeShoreDist` checks 4 horizontal neighbors. Each call is multiple `getLocal` invocations.

### Non-greedy path (~lines 41436–41463) — same pattern, same cost.

### Worker static driver (~lines 18801–18818) — hand-maintained copy that mirrors the greedy/non-greedy logic.

---

## Proposed Fix

Hoist both computations above the per-face loop:

```js
for each water block (x, y, z):
    const waterDepth = computeWaterDepth(x, y, z);   // ← once per block
    const shoreDist  = computeShoreDist(x, y, z);    // ← once per block
    for each face direction:
        // use waterDepth, shoreDist directly (no recompute)
```

**All three sites** (greedy main, non-greedy main, worker static driver) must receive the identical structural change.

---

## Worker Parity Note

The worker static driver (~18801–18818) is a **hand-maintained** copy — it is NOT injected via `Function.toString()`. Any structural change to the main-thread greedy/non-greedy loops must be mirrored manually in the worker driver. Failure to keep parity produces visible meshing differences at chunk boundaries between worker-meshed and main-meshed chunks.

**Risk:** This is the primary risk of this CCR. Before committing, verify by reading all three sites side-by-side and confirming the hoist is in the same position in each.

---

## Correctness

- `waterDepth` and `shoreDist` are pure functions of `(x, y, z)` — they call only `getLocal` (read-only), with no side effects and no dependence on face normal.
- Hoisting is semantically equivalent: the values computed once are identical to what each per-face call returned.
- Worker parity: the only change is structural (loop nesting) — not algorithmic. Output is byte-identical if applied correctly to all three sites.

---

## Expected Impact

Agent estimate (not profiled): ~2–5% worker meshing time reduction on water-heavy / coastal chunks. Negligible for inland chunks (no water faces). Not a hot-path win for most terrain; primarily valuable in river / swamp / ocean biomes.

---

## Safety Checks

- [ ] Hoist applied identically to ALL THREE sites (greedy main + non-greedy main + worker static driver)
- [ ] `waterDepth` and `shoreDist` variable declarations moved above (not inside) the face loop
- [ ] Verify `getLocal` is read-only (no writes) — it is
- [ ] No new allocations introduced in the hoist
- [ ] No DOM/settings/cache-version changes
- [ ] 282/282 tests green after change (meshing tests cover water faces)
- [ ] Worker static driver at ~18801–18818 updated to match main-thread hoist exactly

# CCR — Cache Water-Surface Scan in Swimming Physics

**ID:** VOXEX-CCR-PERF-009
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #491
**Scope:** Cache the water-surface-Y scan result in `applyPlayerVelocity` to avoid re-scanning up to 50 blocks per physics substep while the player holds jump underwater.

---

## Summary

When the player holds jump while underwater, `applyPlayerVelocity` scans up to 50 blocks upward each physics step to locate the water surface:

```js
for (let y = searchStart; y < searchStart + 50; y++) {
    const blockAt = getBlock(px, y, pz);
    if (blockAt !== WATER) { waterSurfaceY = y; break; }
}
```

Each `getBlock` is a Map lookup (`chunkDataPool.get(key)` + array index). The scan re-runs every physics substep — and physics may run multiple substeps per frame for fast movement (`collisionSteps` can be >1). While the path is narrow (only while swimming + holding jump), the repeated redundant scans are avoidable.

**Simple and safe fix:** frame-scope the cache. The water surface above a given XZ column does not change within a single frame under normal gameplay (block edits are synchronous and happen between frames). A per-frame cache — reset at the start of each animate() call — gives zero-risk elimination of the redundant scans.

---

## Current Code (~line 42997)

```js
// Inside applyPlayerVelocity(), inside the isSwimming + holdingJump guard:
let waterSurfaceY = playerY + 0.5;
const searchStart = Math.floor(playerY);
for (let y = searchStart; y < searchStart + 50; y++) {
    const blockAt = getBlock(px, y, pz);
    if (blockAt !== WATER) { waterSurfaceY = y; break; }
}
```

This runs once per physics substep. With `collisionSteps = 3` (fast movement), it runs 3× per frame while swimming and jumping.

---

## Proposed Fix

### Step 1 — Declare frame-scope cache vars at module level (near other physics scratch vars)

```js
let _waterSurfaceYCache = -Infinity;   // cached water-surface Y for current XZ cell
let _waterSurfaceCacheX = NaN;         // XZ cell at which the cache was computed
let _waterSurfaceCacheZ = NaN;
let _waterSurfaceCacheFrame = -1;      // animate() frame counter at time of cache
```

### Step 2 — Add a frame counter increment at the top of `animate()`

```js
// Near top of animate(), before physics:
_animateFrame = (_animateFrame + 1) | 0;  // wraps safely at 2^31
```

(Declare `let _animateFrame = 0;` at module scope alongside the cache vars.)

### Step 3 — Replace the scan loop with a cache-or-scan pattern

```js
// In applyPlayerVelocity(), replace the scan loop:
const px = Math.floor(playerX);
const pz = Math.floor(playerZ);

let waterSurfaceY;
if (_waterSurfaceCacheFrame === _animateFrame &&
    _waterSurfaceCacheX === px &&
    _waterSurfaceCacheZ === pz) {
    // Same XZ cell, same frame — reuse
    waterSurfaceY = _waterSurfaceYCache;
} else {
    // Recompute
    waterSurfaceY = playerY + 0.5;
    const searchStart = Math.floor(playerY);
    for (let y = searchStart; y < searchStart + 50; y++) {
        if (getBlock(px, y, pz) !== WATER) { waterSurfaceY = y; break; }
    }
    _waterSurfaceYCache = waterSurfaceY;
    _waterSurfaceCacheX = px;
    _waterSurfaceCacheZ = pz;
    _waterSurfaceCacheFrame = _animateFrame;
}
```

---

## Correctness

- **Block edits during a frame:** In normal gameplay, block edits are triggered by player interaction between render frames, so the water-surface result is stable within a single frame.
- **XZ movement between substeps:** Physics substeps move the player slightly each step. The XZ block cell (`Math.floor`) rarely changes mid-frame at normal speeds. If it does, `px !== _waterSurfaceCacheX` → cache miss → rescan. ✓
- **Vertical movement:** The cached Y is the surface above the column, not the player's Y, so vertical movement within the water column does not affect the cache validity.
- **Edge case: player exactly on water surface:** `waterSurfaceY` is used to compute upward velocity cap. If the player exits the water surface mid-frame, the `isSwimming` guard will be false on subsequent substeps, so the cached value is never used stale.

---

## Scope Limitation

This CCR uses the **frame-scope cache** approach (simplest, lowest risk). A more complex per-column persistent cache (surviving across frames, invalidated by block edits) would give a larger win during multi-frame swimming but requires hooking `setBlock()` for invalidation. That is a follow-up if profiling shows meaningful cost.

---

## Safety Checks

- [ ] `_animateFrame`, `_waterSurfaceYCache`, `_waterSurfaceCacheX`, `_waterSurfaceCacheZ`, `_waterSurfaceCacheFrame` declared at module scope — verify no name collision
- [ ] `_animateFrame` incremented once per `animate()` call (before any physics substep loop)
- [ ] Cache miss path is byte-identical to current scan
- [ ] No DOM/settings/worker/cache-version changes
- [ ] 282/282 tests green after change

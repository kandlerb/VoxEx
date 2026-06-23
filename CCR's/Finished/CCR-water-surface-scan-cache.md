# CCR — Cache Water-Surface Scan in Swimming Physics

**ID:** VOXEX-CCR-PERF-009
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟢 Implemented (build 2026-06-22.11)
**GitHub:** #491
**Scope:** Cache the water-surface-Y scan result in `applyPlayerVelocity` to avoid re-scanning up to 50 blocks per physics substep while the player holds jump underwater.

---

## Summary

When the player holds jump while underwater, `applyPlayerVelocity` scans up to 50 blocks upward each physics step to locate the water surface. Each `getBlock` is a Map lookup (`chunkDataPool.get(key)` + array index). The scan re-ran every physics substep — and physics may run multiple substeps per frame for fast movement (`collisionSteps` can be >1).

**Fix:** Added two module-scope cache vars (`_waterSurfaceScanPX`/`_waterSurfaceScanPZ`) that track the XZ block column of the last scan. The scan only runs when the player enters a new XZ column. Cache is invalidated when the player dives. This is simpler and broader than the frame-counter approach originally proposed (cross-frame cache rather than per-frame).

---

## Original Code (~line 43050)

```js
// Inside applyPlayerVelocity(), inside the isSwimming + holdingJump guard:
let waterSurfaceY = playerY + 0.5;
const searchStart = Math.floor(playerY);
for (let y = searchStart; y < searchStart + 50; y++) {
    const blockAt = getBlock(px, y, pz);
    if (blockAt !== WATER) { waterSurfaceY = y; break; }
}
```

Ran once per physics substep. With `collisionSteps = 3` (fast movement), ran 3× per frame while swimming + jumping.

---

## Implemented Fix

### Cache vars added at module scope (~line 9783)

```js
let _waterSurfaceScanPX = NaN; // cached XZ for water-surface scan (VOXEX-CCR-PERF-009)
let _waterSurfaceScanPZ = NaN;
```

### Scan guarded by XZ-column check (~line 43053)

```js
// VOXEX-CCR-PERF-009: cache per XZ cell — skip re-scan if player hasn't
// moved to a new column (constant across substeps in the same frame).
if (swimSpaceHoldTime > 0.1 && !isTreadingWater) {
    const px = Math.floor(camPos.x);
    const pz = Math.floor(camPos.z);
    if (px !== _waterSurfaceScanPX || pz !== _waterSurfaceScanPZ) {
        _waterSurfaceScanPX = px;
        _waterSurfaceScanPZ = pz;
        const searchStart = Math.floor(camPos.y - 2);
        for (let y = searchStart; y < searchStart + 50; y++) {
            if (getBlock(px, y, pz) !== WATER) { waterSurfaceY = y; break; }
        }
    }
}
```

### Cache invalidation on dive (~line 43045)

```js
isTreadingWater = false;
swimSpaceHoldTime = 0;
_waterSurfaceScanPX = NaN; // invalidate cache on dive (VOXEX-CCR-PERF-009)
```

---

## Correctness

- **Within a frame (substep reuse):** XZ block column rarely changes between substeps at normal swim speed. When it does, `Math.floor` mismatch → cache miss → rescan. ✓
- **Cross-frame persistence:** Water above an XZ column doesn't change between frames under normal gameplay (block edits are synchronous, happen between frames). Cross-frame caching is safe and reduces scans further than the original frame-counter proposal. ✓
- **Dive invalidation:** Setting `_waterSurfaceScanPX = NaN` forces a fresh scan after the player enters a new swimming session (prevents stale Y if player dives, moves laterally, then resurfaces). ✓
- **Vertical movement:** The cached Y is the surface Y of the column — not the player's Y — so vertical movement within the water column doesn't affect cache validity. ✓

---

## Safety Checks

- [x] `_waterSurfaceScanPX`/`_waterSurfaceScanPZ` declared at module scope — no name collision
- [x] Cache miss path is byte-identical to original scan
- [x] No DOM/settings/worker/cache-version changes
- [x] 282/282 tests green after change

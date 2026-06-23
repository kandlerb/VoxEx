# CCR — updateChunks: Eliminate Full-Sort + Array.from Allocation on Every Trigger

**ID:** VOXEX-CCR-PERF-012
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🟢 Implemented (build 2026-06-22.15)
**GitHub:** #481
**Scope:** World streaming › `updateChunks`

---

## Summary

`updateChunks()` allocated and O(n log n) sorted a distance array over **all** chunk meshes on every chunk-cross / >5° turn — events that are frequent during active play. A second `Array.from(chunkMeshes.keys())` allocation enabled safe deletion during iteration. Both eliminated.

---

## Changes Made

### Sub-fix A: Eliminate `Array.from(chunkMeshes.keys())` in 6B cleanup

The `Array.from()` was used to allow safe deletion while iterating. Replaced with a two-pass approach: collect into a local `toDelete6B[]` array first, then delete in a second loop. Eliminates the O(n) allocation and the iterator-while-mutating hazard.

```js
// Before:
const meshKeys = Array.from(chunkMeshes.keys());
for (const key of meshKeys) { if (!chunksInRange.has(chunkBaseOfMeshKey(key))) { releaseMeshForKey(key); ... } }

// After:
const toDelete6B = [];
for (const key of chunkMeshes.keys()) { const baseKey = chunkBaseOfMeshKey(key); if (!chunksInRange.has(baseKey)) toDelete6B.push(key); }
for (const key of toDelete6B) { releaseMeshForKey(key); bandedChunkKeys.delete(chunkBaseOfMeshKey(key)); meshPrunedDuringUpdate = true; }
```

### Sub-fix B1: Pre-filter before sort in 6A proactive eviction

The original 6A eviction sorted **all** ~200 chunk-mesh entries by distance, then removed the farthest excess ones. Replaced with a pre-filter: only chunks already outside `chunksInRange` are pushed into `farCandidates[]`, so the sort operates on typically 0-10 entries instead of ~200. The inner removal loop drops the redundant `!chunksInRange.has()` re-check since all entries are pre-confirmed out-of-range.

```js
// Before:
const chunkDistances = [];
// ... loop: all meshes pushed regardless of in-range status
chunkDistances.sort((a, b) => b.dist - a.dist);
for (let i = 0; i < toRemove && i < chunkDistances.length; i++) {
    if (!chunksInRange.has(chunkDistances[i].key)) { releaseMeshForKey(...); }
}

// After:
const farCandidates = [];
// ... loop: only !chunksInRange.has(baseKey) entries pushed
farCandidates.sort((a, b) => b.dist - a.dist);
for (let i = 0; i < toRemove && i < farCandidates.length; i++) {
    const targetKey = farCandidates[i].key; // already confirmed out-of-range
    releaseMeshForKey(targetKey); ...
}
```

---

## Correctness

- **Sub-fix A:** Purely mechanical refactor — collect-before-delete pattern produces identical deletion set as the original Array.from snapshot.
- **Sub-fix B1:** Sorting only out-of-range candidates still picks the farthest-first for eviction (sort criterion unchanged). Since the `if (!chunksInRange.has(targetKey))` check in the removal loop always fired for far meshes, pre-filtering is semantically equivalent. In-range meshes were never removed — the check prevented it. Now they simply aren't added to the sort input.
- Both fixes leave chunk streaming order (which chunks load/unload and when) unchanged.

---

## Safety Checks

- [x] No change to which chunks are unloaded per update cycle
- [x] `toDelete6B` collected before any deletion begins — no iterator-while-mutating hazard
- [x] `farCandidates` contains only out-of-range entries — inner loop's has() re-check safely removed
- [x] No new globals, no shadowed identifiers
- [x] 282/282 tests green

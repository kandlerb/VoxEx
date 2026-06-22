# CCR — updateChunks: Eliminate Full-Sort + Array.from Allocation on Every Trigger

**ID:** VOXEX-CCR-PERF-012
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #481
**Scope:** World streaming › `updateChunks`

---

## Summary

`updateChunks()` (~line 42173–42206) allocates and O(n log n) sorts a distance array over **all** chunk meshes on every chunk-cross / >5° turn — events that are frequent during active play. A second `Array.from(chunkMeshes.keys())` allocation enables safe deletion during iteration. Both can be eliminated: the sort by maintaining sorted order incrementally, the second allocation by collecting a delete-list locally.

---

## Current Behavior (verified against source)

```js
// Inside updateChunks(), triggered by shouldUpdateChunkStreaming() or shouldUpdateFrustum():
const allMeshKeys = Array.from(chunkMeshes.keys()); // allocation #1 — safe-delete list
const distArr = [];                                  // allocation #2
for (const key of chunkMeshes.keys()) {
    const mesh = chunkMeshes.get(key);
    const dist = ...; // squared distance to player
    distArr.push({ key, dist });
}
distArr.sort((a, b) => a.dist - b.dist);            // O(n log n) on every trigger
// ... process sorted distArr to unload far meshes
for (const key of allMeshKeys) { ... }             // uses the pre-built array for deletion
```

With ~200 loaded chunk meshes, this is ~200 × log(200) ≈ 1,500 comparisons per trigger. Not every frame, but triggered on every chunk-cross and any significant turn.

---

## Proposed Fix (two independent sub-fixes)

### Sub-fix A: Eliminate `Array.from(chunkMeshes.keys())` (low risk, high confidence)

The second allocation exists to allow deletion during iteration. Replace it with a local delete-list collected before deletion:

```js
const toDelete = [];
for (const [key, mesh] of chunkMeshes) {
    if (shouldUnload(mesh, dist)) toDelete.push(key);
}
for (const key of toDelete) { chunkMeshes.delete(key); disposeMesh(key); }
```

This eliminates `Array.from` and keeps logic identical. `toDelete` is small (unloaded chunk count per update) and short-lived.

### Sub-fix B: Reduce sort cost (medium risk)

Two approaches, ordered by risk:

**Option B1 (safe, partial win): Sort only the candidates to unload**

Instead of sorting all ~200 meshes, filter to those outside the unload threshold, then sort only that subset:

```js
const farMeshes = [];
for (const [key, mesh] of chunkMeshes) {
    const dist = squaredDistTo(mesh);
    if (dist > unloadThreshSq) farMeshes.push({ key, dist });
}
farMeshes.sort((a, b) => a.dist - b.dist);
// unload from farthest inward up to MAX_UNLOAD_PER_UPDATE
```

Number of meshes outside the threshold is typically small (a few) on a stable render distance, making this nearly O(1) in the common case.

**Option B2 (higher risk): Incremental heap**

Maintain a max-heap of `{ key, dist }` sorted by distance. On each trigger, update distances for nearby chunks only (those within `renderDistance + 2` chunks). Needs a fallback full-rebuild on world-load and render-distance changes.

**Recommended: Sub-fix A + Option B1** — highest confidence, lowest risk, still meaningful win.

---

## Correctness

- Sub-fix A: purely mechanical refactor of the deletion loop; semantics identical.
- Option B1: only changes *which* meshes are sorted (farthest ones, the ones being unloaded). The full sort was originally used to pick the N farthest for unloading; sorting only the `dist > threshold` set achieves the same result since we're discarding everything past the threshold anyway.
- Both: chunk streaming order (which chunks load/unload and when) is unchanged.

---

## Implementation Plan

1. Locate the `Array.from(chunkMeshes.keys())` allocation at ~line 42173.
2. Replace with a local `const toDelete = []` pattern (Sub-fix A).
3. Locate the `distArr.sort(...)` at ~line 42190.
4. Replace with a filter-then-sort-only-far pattern (Option B1).
5. Run `tools/voxex-tests.html` (282 tests) — all must pass.
6. In-browser: confirm chunks still load/unload correctly at render-distance boundaries while walking and flying.

---

## Safety Checks

- [ ] No change to which chunks are unloaded per update cycle
- [ ] No change to `chunkMeshes` Map contents — only deletion strategy changes
- [ ] `toDelete` collected before any deletion begins (no ConcurrentModificationException equivalent)
- [ ] Render-distance boundary behavior confirmed in-browser
- [ ] 282/282 tests green before commit

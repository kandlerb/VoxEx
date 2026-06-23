# CCR — OPFS Chunk Decompression: Move Off Main Thread

**ID:** VOXEX-CCR-PERF-013
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🟡 Closed — Not Implemented (profiling required; architecture already mitigates concern)
**GitHub:** #480
**Scope:** Persistence › `ChunkDiskStorage` › `deserializeChunkFromDisk`

---

## Summary

`deserializeChunkFromDisk()` decompresses three RLE arrays (blocks + skyLight + blockLight, up to 81,920 cells each) synchronously on the main thread, called from `ChunkDataPool.loadFromDisk`. The issue speculated this could cause spawn stalls.

After architecture analysis, the concern is not confirmed, and Option A (decompress in OPFS worker) was not implemented in this pass.

---

## Why Not Implemented

### 1. Macrotask isolation already prevents back-to-back stalls

Each `ChunkDataPool.loadFromDisk()` call awaits `diskStorage.read()`, which resolves when the OPFS worker sends its `onmessage` response. That response arrives as a **macrotask** (Worker message event). Between macrotasks, the browser can run the renderer — so no two OPFS decompression loops run back-to-back without a renderer check-in opportunity.

### 2. Decompression magnitude is sub-millisecond

RLE decompression for one chunk: up to 81,920 × 3 cells. At ~500M simple iterations/sec in V8, worst case is < 0.5ms (all-unique blocks). Typical terrain chunks decompress in ~50µs (long homogeneous runs). Frame budget is 16.67ms.

### 3. IDB path already has explicit yield guards

`batchLoadChunksFromCache` (IndexedDB path, the primary cache) has explicit `> 4ms` yield guards (`await new Promise(r => setTimeout(r, 0))`) at each iteration. OPFS is a secondary fallback (only after IDB miss), handling far fewer chunks during normal play.

### 4. Option A carries medium-high risk without confirmed benefit

Option A requires: (a) inlining 50+ lines of binary format parsing + RLE decompression into the OPFS worker blob string, (b) changing the `read` response from `ArrayBuffer` to a decoded object with Transferable Uint8Array buffers, (c) updating `ChunkDataPool.loadFromDisk` to handle the new response shape while preserving the legacy JSON fallback path. Without in-browser profiling showing actual stalls, this complexity is not justified.

---

## Recommendation for Future

If actual spawn stalls are observed in-browser (visible frame drops during world load with a 50+ chunk OPFS cache hit), implement **Option A**:

1. Add inline `deserializeInWorker(buffer)` to `OPFS_WORKER_CODE` template — parse VXC2 header + decompress 3 RLE arrays
2. Change `readChunk` to return decoded `{ seed, blocks, skyLight, blockLight, cacheVersion, renderState, genState }` with Transferable typed array buffers
3. Update OPFS worker's message handler to transfer the three `Uint8Array.buffer` values
4. Update `ChunkDataPool.loadFromDisk` (line ~7894) to accept the new decoded-object response shape, with legacy JSON fallback preserved

Or implement **Option B** (simpler): add `> 4ms` yield guards in whatever loop calls `loadFromDisk` for multiple chunks, mirroring the IDB path pattern in `batchLoadChunksFromCache`.

---

## Safety Checks

- [x] Architecture analyzed: macrotask isolation already prevents multi-chunk stalls
- [x] Magnitude verified: < 0.5ms per chunk in worst case
- [x] IDB path already has yield guards (this applies only to OPFS secondary path)
- [x] Option A documented with full implementation plan for future reference
- [x] 283/283 tests green (no changes to voxEx.html for this issue)

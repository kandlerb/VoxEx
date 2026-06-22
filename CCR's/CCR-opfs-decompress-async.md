# CCR — OPFS Chunk Decompression: Move Off Main Thread

**ID:** VOXEX-CCR-PERF-013
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #480
**Scope:** Persistence › `ChunkDiskStorage` › `deserializeChunkFromDisk`

---

## Summary

`deserializeChunkFromDisk()` (~line 25622) decompresses three RLE arrays (blocks + skyLight + blockLight, up to 81,920 cells each) **synchronously on the main thread**. It is called from `ChunkDataPool.loadFromDisk` (~line 7861) in an async context, but the RLE decompression itself is synchronous. During spawn pre-generation of many chunks, these synchronous decodes serialize, potentially causing multi-second load-time stalls.

**Important caveat (per issue):** The magnitude is **unconfirmed** — "measure before acting." This CCR documents the approach; implementation should follow profiling in-browser.

---

## Current Behavior (verified against source)

### Call chain

```
ChunkDataPool.loadFromDisk()  (~line 7861, async)
  → ChunkDiskStorage worker returns binary ArrayBuffer
  → deserializeChunkFromDisk(arrayBuffer)  (synchronous, main thread)
    → ChunkCompressor._decompressArray(rleUint16)  (synchronous, main thread)
      → tight loop over up to 81,920 cells
```

### `_decompressArray` (~line 25463–25482)

```js
_decompressArray(compressedData) {
    const result = new Uint8Array(81920);
    let i = 0;
    for (let j = 0; j < compressedData.length; j += 2) {
        const count = compressedData[j];
        const value = compressedData[j + 1];
        for (let k = 0; k < count; k++) result[i++] = value;
    }
    return result;
}
```

Three such calls per chunk (blocks, skyLight, blockLight). On a 50-chunk spawn pre-gen load: 150 synchronous tight loops on the main thread.

---

## Proposed Fix

### Option A (recommended): Decompress inside the OPFS inline worker

The `ChunkDiskStorage` class uses an **inline worker** (code injected as a blob URL) that already handles reading binary files from OPFS. Move decompression into that worker so decoded typed arrays arrive on the main thread fully ready:

1. In the OPFS worker's `'load'` message handler: after reading the binary file, call `_decompressArray` (inline copy or injected) and return the decoded `{blocks, skyLight, blockLight}` typed arrays via `postMessage` with `Transferable` buffers.
2. In `ChunkDataPool.loadFromDisk`: receive already-decoded arrays; skip the main-thread `deserializeChunkFromDisk` call.
3. Existing fallback path (legacy JSON envelope) stays on main thread — it's rare.

### Option B (simpler, partial win): Budget decompression across frames

Use `shouldYield()` / `checkFrameBudget()` (existing time-slice infrastructure) to spread decompression across multiple frames during pre-gen. This doesn't move work off-thread but prevents single-frame stalls.

### Recommended sequencing

1. **Measure first:** add `console.time('[OPFS] decompress')` around `deserializeChunkFromDisk` in a test world with 50+ cached chunks and check the stall duration.
2. **If < 5 ms per chunk:** Option B is sufficient.
3. **If > 5 ms per chunk:** Option A gives a genuine off-thread win.

---

## Correctness

- Decompression output is identical regardless of which thread it runs on (pure computation, no shared state).
- Transferable buffers (`ArrayBuffer.transfer`) eliminate the copy overhead on postMessage.
- The main-thread `decompress()` call in `loadChunkFromCache` (IndexedDB path) is separate and unaffected.

---

## Risk

**Medium-high.** The OPFS worker inline code is a non-trivial blob; modifying it requires careful testing of the async message round-trip. The load critical path is touched. Gate behind profiling data before implementing.

---

## Implementation Plan

1. Profile `deserializeChunkFromDisk` call time in-browser on a saved world with 50+ chunks.
2. If significant (> 5 ms/chunk): implement Option A in the OPFS inline worker blob.
3. If modest: implement Option B (yield-based budgeting in `ChunkDataPool.loadFromDisk`).
4. Run `tools/voxex-tests.html` (282 tests) including the IndexedDB persistence round-trip tests.
5. In-browser: confirm world load time and chunk streaming on cached worlds.

---

## Safety Checks

- [ ] Measure before implementing — do not optimize speculatively
- [ ] If Option A: verify Transferable ArrayBuffer semantics (buffer detached after transfer, cannot reuse)
- [ ] Existing legacy JSON-envelope fallback path untouched
- [ ] 282/282 tests green before commit

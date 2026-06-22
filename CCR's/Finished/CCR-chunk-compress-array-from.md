# CCR — ChunkCompressor: Store Uint16Array Directly in IndexedDB (Drop Array.from)

**ID:** VOXEX-CCR-PERF-006
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #479
**Scope:** Remove 4 `Array.from(...)` wrappers in `ChunkCompressor.compress()` (~lines 25586–25593) so RLE output (`Uint16Array`) is stored directly in the IndexedDB record instead of being converted to a plain boxed-number JS Array first.

> Line numbers are as of build `2026-06-22.9` and **will drift** — grep the quoted identifier before editing, per repo convention.

---

## Summary

### What

`ChunkCompressor._compressArray()` returns a `Uint16Array`. The `compress()` method wraps each one in `Array.from(...)` before placing it in the record object that is written to IndexedDB:

```js
// ~lines 25586–25593
{
    version: 2,
    cacheVersion: chunkData._cacheVersion || 0,
    blocks:     Array.from(this._compressArray(chunkData.blocks)),    // ← boxed Array
    skyLight:   Array.from(this._compressArray(chunkData.skyLight)),  // ← boxed Array
    blockLight: chunkData.blockLight
        ? Array.from(this._compressArray(chunkData.blockLight))       // ← boxed Array
        : null,
    renderState: chunkData.renderState || 0,
    genState:    chunkData.genState || 0,
}

// Old single-array format path (~line 25593):
return Array.from(this._compressArray(chunkData));                    // ← boxed Array
```

### Why `Array.from` is pure overhead

The IndexedDB structured-clone algorithm supports `TypedArray` natively and more efficiently than a plain `Array` of numbers:

- A **plain `Array` of 16K numbers** is serialized as a JSON-like sequence of heap-boxed `Number` values — larger wire format, more GC pressure.
- A **`Uint16Array` of 16K elements** is serialized as a typed-array binary blob — compact, direct.

The `decompress()` path already handles both:
```js
const blocks = new Uint16Array(compressedData.blocks); // accepts Array or Uint16Array
```
`new Uint16Array(Array)` copies each number as a 16-bit integer. `new Uint16Array(Uint16Array)` copies bytes. Both round-trip correctly. Old records stored with the `Array` format continue to work without any version bump.

### Proposed change

**Remove `Array.from(...)` at each of the 4 sites:**

```js
// Before:
blocks:     Array.from(this._compressArray(chunkData.blocks)),
skyLight:   Array.from(this._compressArray(chunkData.skyLight)),
blockLight: chunkData.blockLight ? Array.from(this._compressArray(chunkData.blockLight)) : null,
// ...
return Array.from(this._compressArray(chunkData));

// After:
blocks:     this._compressArray(chunkData.blocks),
skyLight:   this._compressArray(chunkData.skyLight),
blockLight: chunkData.blockLight ? this._compressArray(chunkData.blockLight) : null,
// ...
return this._compressArray(chunkData);
```

### What is not changed

- `decompress()` — already handles both `Array` and `Uint16Array` via `new Uint16Array(...)`.
- OPFS path (`serializeChunkForDisk` / `ChunkDiskStorage`) — already uses `Uint16Array` directly; unaffected.
- `CURRENT_CACHE_VERSION` / `_cacheVersion` — no bump needed. The in-record format changes (Array → TypedArray) but the decompress path accepts both; this is not a lighting-validity concern.
- `batchSaveChunksToCache` callers — unaffected; they pass chunk data to `compress()`, not the compressed record.

### Impact

- Saves ~1–3 ms per batch save (autosave, spawn pre-gen) by avoiding `Array.from` conversion and producing a more compact structured-clone payload.
- Not a per-frame cost — the save path fires periodically, not every frame.
- Low risk: the only change is what type is stored in the in-memory record before it is written to IndexedDB. The load path is untouched.

---

## Implementation Plan

1. Grep `ChunkCompressor` → `compress(` to locate the method (~line 25570).
2. Replace the 3 `Array.from(this._compressArray(...))` lines in the new-format branch with `this._compressArray(...)`.
3. Replace the 1 `Array.from(this._compressArray(chunkData))` line in the old-format branch with `this._compressArray(chunkData)`.
4. Run `tools/voxex-tests.html` — the persistence codec tests cover `ChunkCompressor` round-trip.

---

## Correctness

- **Round-trip:** `decompress()` uses `new Uint16Array(compressedData.blocks)`. `new Uint16Array(Uint16Array)` is a valid copy constructor. Round-trip is bit-identical to the current path.
- **Old records:** `new Uint16Array(Array)` still works — no backward-compatibility break for records saved before this change.
- **No aliasing:** `_compressArray` allocates a fresh `Uint16Array` each call; storing it directly does not create aliasing with internal compressor state.
- **OPFS path:** unaffected; uses `serializeChunkForDisk` which calls `_compressArray` directly and writes the `Uint16Array` into a binary envelope.

---

## Safety Checks

- [x] No new identifiers introduced — pure removal of `Array.from(...)` wrappers.
- [x] No DOM IDs or settings changes.
- [x] Backward compatible: old IndexedDB records (Array format) still decompress correctly.
- [x] No cache version bump required — decompress already handles both formats.
- [x] Worker parity: `ChunkCompressor` is main-thread only; no worker impact.
- [x] Tests: `tools/voxex-tests.html` covers the persistence codec (`ChunkCompressor` RLE round-trip); run to verify.

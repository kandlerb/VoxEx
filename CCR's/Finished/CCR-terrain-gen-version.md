# CCR — Terrain Generation Version Stamping in Chunk Cache

**ID:** VOXEX-CCR-CACHE-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #473
**Scope:** Add a `TERRAIN_GEN_VERSION` constant and stamp it into every cached chunk record so that stale-algorithm chunks regenerate automatically when the generation code changes.

---

## Summary

`loadChunkFromCache` and `batchLoadChunksFromCache` validate cached chunks against only the **seed**. When the terrain generation algorithm changes (height functions, biome logic, tree placement), previously cached chunks are reloaded unchanged, producing visible height cliffs and mismatched terrain at the boundary between old (loaded) and new (freshly-generated) chunks.

The existing `_cacheVersion` field controls only **lighting** recalculation — it does not force terrain regeneration. Bumping `_cacheVersion` triggers a lighting-recalc pass on load, but block data is still taken from the stale cache.

This caused a visible bug during the biome-resolver fix (commit f8a9dcb): pre-change saves loaded old terrain block data while adjacent fresh chunks used the corrected generator, producing sharp terrain cliffs.

**Note:** This CCR addresses the **persistence** side (healing already-saved stale records). The live generation divergence was fixed by f8a9dcb; this is its complement.

---

## Current Behavior

### `loadChunkFromCache` (~line 26785)

```js
if (record && seedsMatch(record.seed, finalSeedDisplay)) {
    let decompressed = ChunkCompressor.decompress(record.data);
    // ← no terrain gen version check; stale block data is silently accepted
    if (decompressed) {
        // use cached chunk ...
    }
}
```

### `ChunkCompressor.compress()` (~line 25582)

```js
{
    version: 2,
    cacheVersion: chunkData._cacheVersion || 0,
    blocks: Array.from(this._compressArray(chunkData.blocks)),
    skyLight: Array.from(this._compressArray(chunkData.skyLight)),
    blockLight: chunkData.blockLight ? Array.from(this._compressArray(chunkData.blockLight)) : null,
    renderState: chunkData.renderState || 0,
    genState: chunkData.genState || 0,
    // ← no terrainGenVersion field
}
```

### OPFS path (`deserializeChunkFromDisk`, ~line 25622)

Reads blocks/skyLight/blockLight directly via `_decompressArray`; does not pass through `ChunkCompressor.decompress()`. Does not store or check a terrain gen version.

---

## Proposed Fix

### Step 1 — Add `TERRAIN_GEN_VERSION` constant

Near `CURRENT_CACHE_VERSION` (or in the top-of-file config block), add:

```js
// Bump whenever terrain/biome/tree generation algorithm changes so
// cached chunk block data is regenerated rather than loaded stale.
const TERRAIN_GEN_VERSION = 1;
```

### Step 2 — Stamp in `ChunkCompressor.compress()`

Add `terrainGenVersion: TERRAIN_GEN_VERSION` to the new-format record object:

```js
{
    version: 2,
    cacheVersion: chunkData._cacheVersion || 0,
    terrainGenVersion: TERRAIN_GEN_VERSION,   // ← NEW
    blocks: ...,
    skyLight: ...,
    blockLight: ...,
    renderState: ...,
    genState: ...,
}
```

### Step 3 — Expose in `ChunkCompressor.decompress()`

Return the field so callers can check it:

```js
return {
    blocks: ...,
    skyLight: ...,
    blockLight: ...,
    renderState: compressedData.renderState || 0,
    genState: compressedData.genState || 0,
    _cacheVersion: compressedData.cacheVersion || 0,
    terrainGenVersion: compressedData.terrainGenVersion || 0,   // ← NEW (0 = pre-versioning, treat as stale)
};
```

### Step 4 — Check in `loadChunkFromCache` (~line 26785)

```js
if (record && seedsMatch(record.seed, finalSeedDisplay)) {
    let decompressed = ChunkCompressor.decompress(record.data);
    if (decompressed && decompressed.terrainGenVersion !== TERRAIN_GEN_VERSION) {
        logDebug(`[Cache] Terrain gen version mismatch for ${chunkKey}: stored=${decompressed.terrainGenVersion} want=${TERRAIN_GEN_VERSION} — regenerating`);
        decompressed = null;  // treat as cache miss → regenerate
    }
    if (decompressed) {
        // ... existing load logic unchanged
    }
}
```

### Step 5 — Check in `batchLoadChunksFromCache` (~line 26851)

Apply the same check immediately after `ChunkCompressor.decompress(record.data)`:

```js
if (record && seedsMatch(record.seed, finalSeedDisplay)) {
    let decompressed = ChunkCompressor.decompress(record.data);
    if (decompressed && decompressed.terrainGenVersion !== TERRAIN_GEN_VERSION) {
        logDebug(`[Cache] Terrain gen version mismatch for ${key} — regenerating`);
        decompressed = null;
    }
    if (decompressed) {
        // ... existing batch-load logic unchanged
    }
}
```

### Step 6 — OPFS path (`deserializeChunkFromDisk`, ~line 25622)

The OPFS binary format does not include `terrainGenVersion`. After deserializing, explicitly mark the chunk as unversioned so it is treated as stale on the next load (the chunk will be regenerated and then re-saved with the correct version):

```js
// After building the chunk object from binary data:
chunk.terrainGenVersion = 0;  // ← forces regen on load; will be overwritten on re-save via compress()
```

Alternatively, the OPFS caller (`ChunkDataPool.loadFromDisk`) can apply the version check after calling `deserializeChunkFromDisk`, using the same pattern as IndexedDB.

---

## Old Records

Old cached records contain no `terrainGenVersion` field. `decompress()` defaults to `0` (via `|| 0`). Since `TERRAIN_GEN_VERSION = 1`, the check `0 !== 1` is `true` → cache miss → chunk is regenerated. This is the desired behavior.

---

## How to Bump

When terrain/biome/tree generation changes in the future, increment `TERRAIN_GEN_VERSION`. All cached chunks from the previous version will regenerate automatically on next load.

---

## Correctness

- Old records: `terrainGenVersion` defaults to `0` → mismatch → regenerate. ✓
- New records: stamped with current `TERRAIN_GEN_VERSION` → match on next load. ✓
- OPFS: old binary records get `terrainGenVersion = 0` after deserialization → mismatch → regenerate. ✓
- `_cacheVersion` (lighting) is unchanged and independent of this new field. ✓
- No `CURRENT_CACHE_VERSION` bump needed — this is an additive new field, backward-compatible. ✓

---

## Safety Checks

- [ ] `TERRAIN_GEN_VERSION` declared exactly once, no shadowing of existing constants
- [ ] `compress()` record includes `terrainGenVersion` in new-format branch only (old-format path is just `Array.from(this._compressArray(chunkData))` and returns a Uint16Array — no record object)
- [ ] `decompress()` exposes `terrainGenVersion` in both the new-format and old-format fallback paths
- [ ] Version check added to both `loadChunkFromCache` AND `batchLoadChunksFromCache` (both load paths)
- [ ] OPFS deserialized chunk sets `terrainGenVersion = 0` (triggers regen)
- [ ] `logDebug` messages use `[Cache]` prefix per repo convention
- [ ] 282/282 tests green after change
- [ ] No DOM/settings/worker changes

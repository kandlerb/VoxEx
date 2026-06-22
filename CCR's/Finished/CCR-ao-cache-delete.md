# CCR — Delete Dead AO Cache Machinery + Fix Latent Float32 Precision Bug

**ID:** VOXEX-CCR-PERF-007
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #484
**Scope:** Remove dead ambient-occlusion cache code that is never used in the hot (worker) path and has a latent Float32 precision bug on the main-thread fallback path.

---

## Summary

Three independent problems with the AO cache:

1. **Dead on the worker hot path.** `buildChunkWorkerCode()` emits `aoCacheValid = false` (line ~19221) and never calls `initAOCache()`. Every branch in `calculateFaceAO` that reads or writes `aoCache` is therefore permanently dead inside the worker — the code is compiled but never executed.

2. **Hit rate ≈ 0 on the main-thread path.** Meshing visits each `(lx, ly, lz, faceIdx)` tuple exactly once per chunk render, so there are no repeated lookups. The cache fills with data that is never read back.

3. **Latent Float32 precision bug.** The pack formula:
   ```js
   const packed = Math.round(ao0 * 100) * 1000000 +
                  Math.round(ao1 * 100) * 10000 +
                  Math.round(ao2 * 100) * 100 +
                  Math.round(ao3 * 100);
   aoCache[cacheKey] = packed / 1000000;
   ```
   With `ao = 1.0` → `Math.round(1.0 * 100) = 100` → max packed value = `100*1e6 + 100*1e4 + 100*100 + 100 = 101,010,100`. Float32's exact-integer range is 2^24 = 16,777,216. Values above this cannot be represented exactly. The stored `packed/1e6` Float32 is a lossy approximation; the unpack path (`Math.round(cached * 1000000)`) reads back an imprecise value, so unpacked AO values can differ from the originals.

**Net effect:** The cache adds overhead (a Float32Array(491,520) allocation on first use, `fill(-1)` per chunk render, two conditional blocks per face call) for zero benefit: no hits, always-dead in the worker, and precision-lossy on the only path where it runs.

---

## Current Code

### Declarations (~lines 39016–39046)

```js
const AO_CACHE_SIZE = 16 * 320 * 16 * 6;   // 491,520 entries

let aoCache = null;        // Float32Array, lazy-allocated
let aoCacheValid = false;

function initAOCache() {
    if (!aoCache) {
        aoCache = new Float32Array(AO_CACHE_SIZE);
    }
    aoCache.fill(-1); // -1 means uncached
    aoCacheValid = true;
}

function clearAOCache() {
    aoCacheValid = false;
}

function getAOCacheKey(lx, ly, lz, faceIdx) {
    return ((lx & 15) + ((lz & 15) << 4) + (ly << 8)) * 6 + faceIdx;
}
```

### Cache-check block in `calculateFaceAO` (~lines 39102–39117)

```js
if (aoCacheValid && lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && ly >= 0 && ly < 320 && faceIdx !== undefined) {
    const cacheKey = getAOCacheKey(lx, ly, lz, faceIdx);
    if (cacheKey < AO_CACHE_SIZE) {
        const cached = aoCache[cacheKey];
        if (cached >= 0) {
            const packed = Math.round(cached * 1000000);
            _aoResult[0] = Math.floor(packed / 1000000) / 100;
            _aoResult[1] = Math.floor((packed % 1000000) / 10000) / 100;
            _aoResult[2] = Math.floor((packed % 10000) / 100) / 100;
            _aoResult[3] = (packed % 100) / 100;
            return _aoResult;
        }
    }
}
```

### Cache-write block in `calculateFaceAO` (~lines 39125–39136)

```js
if (aoCacheValid && lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && ly >= 0 && ly < 320 && faceIdx !== undefined) {
    const cacheKey = getAOCacheKey(lx, ly, lz, faceIdx);
    if (cacheKey < AO_CACHE_SIZE) {
        const packed = Math.round(ao0 * 100) * 1000000 +
                      Math.round(ao1 * 100) * 10000 +
                      Math.round(ao2 * 100) * 100 +
                      Math.round(ao3 * 100);
        aoCache[cacheKey] = packed / 1000000;
    }
}
```

### Worker code emitter (~lines 19215–19221 in `buildChunkWorkerCode`)

```js
// AO cache machinery referenced by the injected calculateFaceAO / calculateVertexAO.
// aoCacheValid=false => it computes AO directly (no cache read/write), byte-identical to a
// cached result. _aoResult/_lightResult are the shared hot-path return arrays; AO_OCCLUDES
// is the occluder table (leaves occlude) the injected calculateVertexAO reads.
meshCode += '    const AO_CACHE_SIZE = ' + AO_CACHE_SIZE + ';\n';
meshCode += '    let aoCache = null;\n';
meshCode += '    let aoCacheValid = false;\n';
```

### `meshFuncs` injection list (~line 19231)

```js
getAOConfig, getAOCacheKey, calculateVertexAO, calculateFaceAO,
```

### Call sites

- `initAOCache()` at ~line 41161 (start of main-thread `renderChunk` path)
- `clearAOCache()` at ~line 45584 (before the inline mesh fallback in `refillChunkLightColors`)

---

## Proposed Fix

Delete the entire AO cache machinery in 8 coordinated edits:

1. **Remove declarations** — delete `AO_CACHE_SIZE`, `aoCache`, `aoCacheValid`, `initAOCache()`, `clearAOCache()`, `getAOCacheKey()` (~lines 39016–39059).
2. **Simplify `calculateFaceAO`** — delete the cache-check block (~39102–39117) and the cache-write block (~39125–39136). The function now just early-returns on no-AO/water, calls `getAOConfig`+`calculateVertexAO`×4, fills `_aoResult`, and returns it.
3. **Worker emitter** — remove the 3 `meshCode +=` lines that emit `AO_CACHE_SIZE`, `aoCache`, `aoCacheValid` (~19219–19221). Keep the comment above them (or delete it).
4. **Worker injection list** — remove `getAOCacheKey` from `meshFuncs` (~19231). `calculateFaceAO` no longer calls it, so it need not be injected.
5. **Remove `initAOCache()` call** at ~line 41161.
6. **Remove `clearAOCache()` call** at ~line 45584 (including the `typeof clearAOCache === 'function'` guard wrapper).

**Keep:** `_aoResult = [1, 1, 1, 1]` (still used as the return buffer in `calculateFaceAO`). Keep `_lightResult` (used in the light path). Keep `AO_OCCLUDES` (still read by `calculateVertexAO`).

### After fix — simplified `calculateFaceAO` body

```js
function calculateFaceAO(nx, ny, nz, lx, ly, lz, blockId, getter, faceIdx) {
    if (!SETTINGS.AO || blockId === WATER) {
        return [1, 1, 1, 1];
    }
    const config = getAOConfig(nx, ny, nz);
    _aoResult[0] = calculateVertexAO(lx, ly, lz, config[0], getter);
    _aoResult[1] = calculateVertexAO(lx, ly, lz, config[1], getter);
    _aoResult[2] = calculateVertexAO(lx, ly, lz, config[2], getter);
    _aoResult[3] = calculateVertexAO(lx, ly, lz, config[3], getter);
    return _aoResult;
}
```

(The `return [1, 1, 1, 1]` on the no-AO/water path is a pre-existing minor allocation — out of scope for this CCR.)

---

## Correctness

- **Worker path:** was already `aoCacheValid=false` → always took the direct-compute path → output identical after deletion.
- **Main-thread path:** was `aoCacheValid=true` after `initAOCache()`, but hit rate = 0 because each `(lx,ly,lz,faceIdx)` is visited once. Cache writes were committed but never read back → output identical after deletion.
- **Float32 precision fix:** the lossy unpack path is deleted; AO values are now exact (as computed by `calculateVertexAO`) on every call.
- **Test coverage:** AO tests in `tools/voxex-tests.html` should remain green; AO computation logic (`calculateVertexAO`) is untouched.

---

## Safety Checks

- [ ] No duplicate or shadowed identifiers introduced (this is a deletion)
- [ ] `_aoResult` retained (still needed in `calculateFaceAO`)
- [ ] `getAOCacheKey` removed from both source and `meshFuncs` injection array
- [ ] Worker emitter lines for `AO_CACHE_SIZE`/`aoCache`/`aoCacheValid` removed
- [ ] `initAOCache()` and `clearAOCache()` call sites both removed
- [ ] 282/282 tests green after change
- [ ] No DOM/settings/cache-version/worker terrain-parity changes

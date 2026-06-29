# CCR — Single Source-of-Truth for Chunk Cache Version

**ID:** VOXEX-CCR-CACHE-002
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #493
**Scope:** Replace the stale hardcoded `_cacheVersion` stamps (`2`, `4`) and the two duplicated `const CURRENT_CACHE_VERSION = 5` declarations with one module-scope constant referenced at every stamp/compare site.

> Line numbers are as of build `2026-06-25.34` and **WILL drift** — grep each anchor before editing.

---

**AUDIT RESULT:** The `= 2` and `= 4` stamps are **genuine bugs, not intentional migration markers.** Both sites carry the comment "Current version with valid lighting", but the readers compare against `CURRENT_CACHE_VERSION = 5`. So chunks written by current code are stamped *older than the reader expects*, forcing a needless full lighting recalc on every reload. Fix: stamp `CURRENT_CACHE_VERSION` at both producers and hoist one declaration.

---

### #493a — Hoist a single module-scope `CURRENT_CACHE_VERSION`
**Location:** chunk-persistence constants — line ~27287 (grep: `const STORE_NAME = "chunks"`)
**Why:** `CURRENT_CACHE_VERSION = 5` is declared twice (~27555 inside the pre-gen function, ~39414 inside the per-chunk cache-load function). Two declarations of the same magic number are the drift mechanism — bump one and the other rots.
**Change:** Declare it once at module scope alongside the IndexedDB constants, then delete both local declarations.

**Context:**
- **Insertion anchor** (live, ~27285–27287) — the IndexedDB constants block, immediately after `SaveManager` closes (`};` ~27281) and `SaveManager.getStyles();` (~27283). This is module scope (the `// --- CHUNK DATA PERSISTENCE SYSTEM ---` region), so a const declared here is visible to all the producer/reader sites below:
  ```js
  // --- CHUNK DATA PERSISTENCE SYSTEM ---
  const DB_NAME = "VoxExWorldData";
  const DB_VERSION = 2;
  const STORE_NAME = "chunks";
  let db = null;
  ```
- **How the version is serialized / round-tripped** — `ChunkCompressor.compress`/`.decompress` (live, ~26140 / ~26168) read and write the field, and the OPFS binary codec (`serializeChunkForDisk`/`deserializeChunkFromDisk`, ~26232 / ~26257/26284) round-trips it as a `u8`. NONE of these hardcode a version — they propagate whatever `_cacheVersion` the producer stamped, so no codec edit is needed:
  ```js
  // compress (~26140):
  cacheVersion: chunkData._cacheVersion || 0,
  // decompress (~26168):
  _cacheVersion: compressedData.cacheVersion || 0,
  // serializeChunkForDisk (~26232):
  view.setUint8(off, chunk._cacheVersion || 0); off += 1;
  // deserializeChunkFromDisk (~26257 / ~26284):
  const cacheVersion = view.getUint8(off); off += 1;
  ...  _cacheVersion: cacheVersion,
  ```
- **The two reader comparison sites** that depend on the hoisted constant resolving:
  - ~27619–27620 (pre-gen load): `const cacheVersion = cachedData._cacheVersion || 0;` then `const forceLightingRecalc = cacheVersion < CURRENT_CACHE_VERSION;`
  - ~39415–39417 (per-chunk cache load): `const cacheVersion = cachedData._cacheVersion || 0;` then `if (cacheVersion < CURRENT_CACHE_VERSION) { logDebug(\`[Cache] Chunk ${key} has old cache version ${cacheVersion}, recalculating lighting\`); ... }`
- **The two re-save sites** that already use the constant (so they auto-pick up the module const once locals are gone): ~27631 and ~39436 both do `cachedData._cacheVersion = CURRENT_CACHE_VERSION;`.

This proves the single hoisted constant flows to every stamp, compare, and re-save site through one name resolution.

**Before** (lines ~27285–27287):
```js
const DB_NAME = "VoxExWorldData";
const DB_VERSION = 2;
const STORE_NAME = "chunks";
```
**After:**
```js
const DB_NAME = "VoxExWorldData";
const DB_VERSION = 2;
const STORE_NAME = "chunks";
// Bump on any cache-format / lighting change; stamped into every saved chunk and compared on load.
// v5: re-reconcile trees after deterministic site validation (slope/overhang); v4: canopy-prune fix; v3: water sunlight attenuation.
const CURRENT_CACHE_VERSION = 5;
```
Then delete the duplicate declarations:
- ~27555: `const CURRENT_CACHE_VERSION = 5; // v5: …` → DELETE the line (the comparison at ~27620 now reads the module constant).
- ~39414: `const CURRENT_CACHE_VERSION = 5; // v5: … // Increment when cache format changes` → DELETE the line (comparison at ~39417 reads the module constant).

**Verify:** Grep `const CURRENT_CACHE_VERSION` → exactly one match. Comparisons at ~27620 (`cacheVersion < CURRENT_CACHE_VERSION`) and ~39417 still resolve.

---

### #493b — Stamp `CURRENT_CACHE_VERSION` at the producers (was `= 2`)
**Location:** `saveChunkToCache` — line ~27306 (grep: `_cacheVersion = 2;`)
**Why:** Stamps `2` with comment "Current version", but readers expect `5` → every chunk saved through the single-chunk path forces a recalc on reload.
**Change:** Stamp the module constant.

**Before:**
```js
chunkData._cacheVersion = 2;  // Current version with valid lighting
```
**After:**
```js
chunkData._cacheVersion = CURRENT_CACHE_VERSION;  // stamp current version (valid lighting)
```

**Verify:** see #493d.

---

### #493c — Stamp `CURRENT_CACHE_VERSION` at the batch producer (was `= 4`)
**Location:** `batchSaveChunksToCache` — line ~27456 (grep: `_cacheVersion = 4;`)
**Why:** Stamps `4` with comment "Current version", but readers expect `5` → batch-saved chunks also force a needless recalc on reload.
**Change:** Stamp the module constant.

**Before:**
```js
chunkData._cacheVersion = 4;  // Current version with valid lighting (v4: tree re-reconcile)
```
**After:**
```js
chunkData._cacheVersion = CURRENT_CACHE_VERSION;  // stamp current version (valid lighting)
```

**Verify:** see #493d. Note: the serializer (`compress`/`serializeChunkForDisk` ~26140–26284) round-trips `_cacheVersion` unchanged — no codec edit needed. The re-save sites (~27631, ~39436) already assign `cachedData._cacheVersion = CURRENT_CACHE_VERSION`, so they pick up the module constant automatically once the locals are removed.

---

### #493d — Combined verification
**Verify:** With the world cache warm, load a world saved under current code → confirm NO `[Cache] … old cache version … recalculating lighting` log on reload (chunks now stamp `5`, so `cacheVersion < 5` is false). Then manually downgrade a cached chunk (`_cacheVersion` to `3` via the IDB inspector or a forced old save) → confirm lighting recalcs **exactly once** and the chunk is re-saved at `5` (next load is clean). Confirm the CLAUDE.md v3 water-attenuation invariant is untouched (value stays `5`, not lowered). Run `tools/voxex-tests.html` compression/persistence-codec tests.

---

## Safety Checks

- [ ] Exactly one `const CURRENT_CACHE_VERSION` remains (grep confirms both duplicates removed).
- [ ] No stray literal `_cacheVersion = <n>` stamps left (grep `_cacheVersion = [0-9]`); only `= CURRENT_CACHE_VERSION` assignments.
- [ ] The hoisted constant is at module scope (same level as `DB_NAME`/`STORE_NAME`) so producers (~27306, ~27456), comparisons (~27620, ~39417), and re-saves (~27631, ~39436) all resolve it.
- [ ] Value stays `5` — not lowered — so the CLAUDE.md v3 water-attenuation bump history is preserved.
- [ ] Old-version saves recalc once then persist at `5`; current-version saves skip recalc.
- [ ] `tools/voxex-tests.html` green (compression / persistence codec tests).
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (~line 3999/4007).

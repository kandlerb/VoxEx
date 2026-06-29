# CCR — ChunkDiskStorage: Worker onerror Rejects Pending OPFS Requests

**ID:** VOXEX-CCR-CACHE-003
**File:** `voxEx.html` (single-file rule honored — inline OPFS worker)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #512
**Scope:** When the OPFS disk-cache worker errors, reject all in-flight request promises and clear the pending map, instead of leaving them unsettled forever.

> Line numbers are as of build `2026-06-25.34` and **WILL drift** — grep `class ChunkDiskStorage` and the `this.pending` map before editing.

---

**AUDIT RESULT:** Bug confirmed, with one correction to the draft. `ChunkDiskStorage` lives at **line ~26635** (the CLAUDE.md "~24112" is stale). A `this.worker.onerror` handler **already exists** (~26699) — but it only logs and bumps `_stats.errors`; it does NOT reject the pending requests in `this.pending` or clear the map. So a worker-level fault leaves every in-flight `_request()` promise unsettled → `loadFromDisk`/`writeToDisk` `await` forever and the map leaks. The fix **augments** the existing handler (it does not add a brand-new one) and adds `onmessageerror`. Callers were verified to catch rejections at the boundary (see Verify), so rejecting → cache miss → regenerate is safe.

---

### #512 — Worker onerror/onmessageerror must settle pending OPFS requests
**Location:** `ChunkDiskStorage.init` worker setup — line ~26699 (grep: `this.worker.onerror = (e) =>`)
**Why:** The pending-request map `this.pending` (~26640, `Map<id, {resolve, reject}>`) is populated in `_request()` (~26740) and drained only by `worker.onmessage` (~26685). If the worker throws at the top level or fails post-init, `onmessage` never fires for those ids, so their promises never settle and the map grows unbounded.
**Change:** Replace the log-only `onerror` with one that rejects every pending promise and clears the map; add an equivalent `onmessageerror` (fires on undeserializable messages). Per CLAUDE.md, OPFS is a secondary cache behind IndexedDB — rejection is caught at the call boundary and degrades to a cache miss → regeneration.

**Context:**
- **`this.pending` map declaration** — in the `ChunkDiskStorage` constructor (live, ~26640), with the relevant sibling fields the fix also touches:
  ```js
  class ChunkDiskStorage {
      constructor() {
          this.worker = null;
          /** @type {Map<number, {resolve: Function, reject: Function}>} */
          this.pending = new Map();
          this.nextId = 0;
          this.ready = false;       // set true after init() succeeds
          this.supported = false;
          this.initFailed = false;  // when true, init() early-returns false
  ```
- **`_request()` populates the map** (live, ~26733) — every read/write/delete goes through here; an unsettled id leaks if `onmessage` never fires:
  ```js
  _request(type, key = null, data = null) {
      if (!this.worker && type !== 'init') {
          return Promise.reject(new Error('OPFS not initialized'));
      }
      return new Promise((resolve, reject) => {
          const id = this.nextId++;
          this.pending.set(id, { resolve, reject });   // ← populated here
          ...
          this.worker.postMessage({ type, key, data, id }, transfer);
      });
  }
  ```
- **`onmessage` drains the map** (live, ~26685) — the ONLY path that currently settles pending promises; it requires a message keyed by `id`, which a top-level worker fault never produces:
  ```js
  this.worker.onmessage = (e) => {
      const { id, success, result, error } = e.data;
      const pending = this.pending.get(id);
      if (pending) {
          this.pending.delete(id);
          if (success) { pending.resolve(result); }
          else { this._stats.errors++; pending.reject(new Error(error)); }
      }
  };
  ```
- **Existing `onerror` to AUGMENT** (live, ~26699) — log-only today; this is the block being replaced (do not add a second handler):
  ```js
  this.worker.onerror = (e) => {
      logDebug('[OPFS] Worker error:', e.message);
      this._stats.errors++;
  };
  ```
  Note `init()`'s own catch (~26715–26723) already sets `initFailed = true` and terminates the worker on *init* failure — so do NOT `terminate()` inside `failAllPending` unless you intend hard teardown; setting `ready=false`/`initFailed=true` is enough to route future calls to fallback (init early-returns `false` when `initFailed`, ~26669).
- **Callers catch rejections at the boundary** → a rejected pending becomes a cache miss, never an unhandled rejection:
  - `loadFromDisk` (live, ~7991) — guards on `!this.diskStorageReady || !this.diskStorage` first, wraps `await this.diskStorage.read(key)` in try-catch, and on throw logs `[OPFS] Load failed`, bumps `_opfsStats.misses`, drops the key, and `return null` (~8032–8037). Null → caller regenerates the chunk.
  - `writeToDisk` (live, ~8047) — same `!diskStorageReady` guard, wraps `serializeChunkForDisk`/`this.diskStorage.write(...)` in try-catch; on throw `return false`. Generation is deterministic, so a rejected disk read loses no data.

**Before** (lines ~26685–26702):
```js
                        // Set up message handler
                        this.worker.onmessage = (e) => {
                            const { id, success, result, error } = e.data;
                            const pending = this.pending.get(id);
                            if (pending) {
                                this.pending.delete(id);
                                if (success) {
                                    pending.resolve(result);
                                } else {
                                    this._stats.errors++;
                                    pending.reject(new Error(error));
                                }
                            }
                        };

                        this.worker.onerror = (e) => {
                            logDebug('[OPFS] Worker error:', e.message);
                            this._stats.errors++;
                        };
```
**After:**
```js
                        // Set up message handler
                        this.worker.onmessage = (e) => {
                            const { id, success, result, error } = e.data;
                            const pending = this.pending.get(id);
                            if (pending) {
                                this.pending.delete(id);
                                if (success) {
                                    pending.resolve(result);
                                } else {
                                    this._stats.errors++;
                                    pending.reject(new Error(error));
                                }
                            }
                        };

                        // Reject every in-flight request on a worker-level fault so callers
                        // fall back to IndexedDB / regeneration instead of awaiting forever.
                        const failAllPending = (reason) => {
                            this._stats.errors++;
                            if (this.pending.size > 0) {
                                logDebug(`[Chunks] OPFS worker error — rejecting ${this.pending.size} pending request(s)`, reason);
                                const err = new Error('OPFS worker error: ' + reason);
                                for (const { reject } of this.pending.values()) reject(err);
                                this.pending.clear();
                            }
                            // Disk cache is dead for this session; route future calls to fallback.
                            this.ready = false;
                            this.initFailed = true;
                        };

                        this.worker.onerror = (e) => failAllPending(e.message || 'worker onerror');
                        this.worker.onmessageerror = () => failAllPending('worker onmessageerror');
```

**Note (fallback policy):** Setting `this.ready = false` + `this.initFailed = true` makes `init()` short-circuit to `false` on the next call (it early-returns `false` when `initFailed`). `loadFromDisk`/`writeToDisk` then see `!diskStorageReady`-style guards or a thrown "OPFS not available" and degrade. Do NOT call `this.worker.terminate()` here — `onerror` may fire for a recoverable error, and the existing `init()` catch already terminates on init failure. If you prefer hard teardown, terminate inside `failAllPending` after clearing the map; either is acceptable since callers treat the result as a miss.

**Verify (callers catch rejections — confirmed):**
- `loadFromDisk` (~7991) wraps `this.diskStorage.read(key)` in try-catch → returns `null` → caller regenerates the chunk (~39346). 
- `writeToDisk` (~8047) wraps `this.diskStorage.write(...)` in try-catch → returns `false`.
- Generation is deterministic, so a rejected disk read loses no data.

**Verify (manual fault test):** In a dev build, inject `throw new Error('test')` at the top of the inline worker `self.onmessage` body (grep `self.onmessage = async (e) =>` ~26589) for one op type, or post a malformed message. Trigger a chunk load → confirm: no hang, `[Chunks] OPFS worker error` logs once, the chunk regenerates, and `chunkDiskStorage.getOperationStats()` shows no growing pending count. Remove the injected throw afterward. Run `tools/voxex-tests.html` IndexedDB persistence round-trip.

---

## Safety Checks

- [ ] All pending promises settle (reject) on worker error; `this.pending` is cleared.
- [ ] `onerror` and `onmessageerror` both route through the single `failAllPending` closure (no duplicate logic, no duplicate handler registration).
- [ ] `loadFromDisk` (~7991) and `writeToDisk` (~8047) catch the rejection and fall back to IDB/regeneration (no uncaught promise rejection).
- [ ] try-catch / fallback stays at the persistence boundary only; pure functions untouched.
- [ ] No shadowed identifiers (`failAllPending` is local to `init`'s try block; `this.ready`/`this.initFailed`/`this.pending` are the existing fields).
- [ ] `tools/voxex-tests.html` green (IndexedDB persistence round-trip); manual worker-fault test passes with no hang.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (~line 3999/4007).

# CCR-LIGHT-007: consolidate per-chunk edge-lighting state

> **Status: IMPLEMENTED**
> **ID**: VOXEX-CCR-LIGHT-007 · **Build baseline**: 2026-07-10.8 · **Author**: agent (Sonnet)

## Problem / Why

Per-chunk edge-lighting bookkeeping is scattered across **three independent transient
containers**, plus one persisted bit:

1. `edgeLightingPassCount` (`Map<key, number>`) — convergence pass counter, read/written in
   `processEdgeLightingUpdates`, reset in `queueAdjacentChunksForUpdate` and the three
   CCR-LIGHT-005 orchestration sites, deleted in `purgeChunkData`.
2. `chunk._edgeMeshDirty` (an **expando property on the chunk object itself**, not a
   registry) — deferred-remesh flag, set in `queueAdjacentChunksForUpdate` and
   `processEdgeLightingUpdates`, read in the same function's cap-flush and debounce branches.
3. `lastEdgeRemeshMs` (`Map<key, number>`) — remesh debounce timestamp, read/written only
   inside `processEdgeLightingUpdates`.
4. `chunk.renderState & RENDER_PASS.EDGE_LIGHTING` — the one **persisted** bit (round-trips
   through the chunk cache/save format). Explicitly out of scope for this CCR.

This is audit finding #10 from the 2026-07-10 lighting audit (the same audit that produced
CCR-LIGHT-004 through -006): three transients that drifted independently means **three
separate cleanup obligations** instead of one. In practice this already showed a real bug:
`lastEdgeRemeshMs` was **never purged on chunk eviction** — `purgeChunkData` cleaned up
`edgeLightingPassCount` and the render-state tracking sets, but had no line for
`lastEdgeRemeshMs`, so every evicted chunk key leaked one `Map` entry for the lifetime of the
page. Small in isolation, but exactly the kind of drift multi-container bookkeeping invites —
a new cleanup site has to remember to touch all three registries, and nothing enforces that.

## Approach

Replace all three with **one consolidated record per chunk**: `edgeLightState = new Map()`
mapping `key -> { passCount, meshDirty, lastRemeshMs }`, with a `getEdgeLightState(key)`
accessor that lazily creates a zeroed record (mirroring the old `_edgeMeshDirty` expando's
implicit "starts undefined/falsy" semantics). One map, one shape, one cleanup call
(`edgeLightState.delete(key)` in `purgeChunkData`) instead of three.

The persisted `renderState & RENDER_PASS.EDGE_LIGHTING` bit is **deliberately excluded** —
it is a durable render-pass marker that round-trips through the chunk save/cache format, a
fundamentally different kind of state than the three transient scratch values being merged
here. Touching it would risk `CURRENT_CACHE_VERSION` semantics for zero benefit.

**Two read/write shapes, both retained on purpose:**
- **Owning-chunk sites** (the chunk currently being processed) use the allocating
  `getEdgeLightState(key)` getter and hold the returned record in a local (`edgeState`)
  for the whole iteration, since every field is read and/or written multiple times per
  pass in `processEdgeLightingUpdates`.
- **Reset sites** (`queueAdjacentChunksForUpdate`'s neighbor loop and the three
  CCR-LIGHT-005 orchestration sites) only need to zero `passCount` on a record that may
  not exist yet, so they use a **plain, non-allocating** `edgeLightState.get(key)` and a
  guarded `if (record) record.passCount = 0;` — allocating a record just to reset a
  counter that was already implicitly zero would be wasted work and, worse, would give a
  chunk a `meshDirty`/`lastRemeshMs` of `false`/`0` it never earned.
- **The one true read-only neighbor lookup** (the re-queue loop's
  `neighborPassCount` check in `processEdgeLightingUpdates`) also stays non-allocating —
  reading a *neighbor's* pass count for a threshold comparison must never fabricate a
  record for a chunk that may not even be loaded.

**Rejected alternative:** keeping `_edgeMeshDirty` as a chunk-object expando and only
merging the two `Map`s. Rejected because the expando is exactly the inconsistency being
fixed — one piece of transient edge-lighting state living on a different kind of container
(the chunk object) than its two siblings (registries keyed by chunk key) is the root of the
"three separate cleanup obligations" problem, not an acceptable survivor of it.

## Version impact

- `VOXEX_BUILD`: yes — bumped `2026-07-10.8` → `2026-07-10.9`, `VOXEX_RECENT_CHANGES` entry added.
- `TERRAIN_GEN_VERSION`: no — no terrain output change.
- `CURRENT_CACHE_VERSION`: no — no light value, propagation rule, or persisted-semantics change;
  purely a transient in-memory bookkeeping refactor.
- `SETTINGS_VERSION`: no — no `DEFAULTS` change.

## Changes

### #1 — Declaration: replace two `Map`s + expando convention with one consolidated store

**Location:** grep `edgeLightingPassCount = new Map` in `voxEx.html`
**Why:** single source of truth for all three transient fields.

**Before:**
```js
// Track how many edge lighting passes each chunk has had (to prevent infinite reprocessing)
const edgeLightingPassCount = new Map();
const MAX_EDGE_LIGHTING_PASSES = 3; // Maximum number of edge lighting passes per chunk
// Edge-lighting remesh churn controls (Item 3): ...
const EDGE_LIGHT_RESET_MIN_CELLS = 8;
const EDGE_REMESH_DEBOUNCE_MS = 150;
const lastEdgeRemeshMs = new Map();     // chunkKey -> last edge-lighting remesh time (ms)
```

**After:**
```js
// CCR-LIGHT-007: ONE record per chunk for all transient edge-lighting bookkeeping
// (convergence pass count, deferred-remesh flag, remesh debounce timestamp).
// Replaces edgeLightingPassCount + chunk._edgeMeshDirty + lastEdgeRemeshMs, which
// drifted independently and had three separate cleanup obligations (lastEdgeRemeshMs
// was never purged on eviction at all -- a small leak this consolidation fixes).
// The PERSISTED renderState EDGE_LIGHTING bit is deliberately NOT in here.
const edgeLightState = new Map(); // key -> { passCount, meshDirty, lastRemeshMs }
function getEdgeLightState(key) {
    let s = edgeLightState.get(key);
    if (!s) { s = { passCount: 0, meshDirty: false, lastRemeshMs: 0 }; edgeLightState.set(key, s); }
    return s;
}
const MAX_EDGE_LIGHTING_PASSES = 3;
const EDGE_LIGHT_RESET_MIN_CELLS = 8;
const EDGE_REMESH_DEBOUNCE_MS = 150;
```

**Verify:** `grep -n "edgeLightingPassCount\|_edgeMeshDirty\|lastEdgeRemeshMs" voxEx.html` — only
comments/changelog text remain, zero live code references.

### #2 — `queueAdjacentChunksForUpdate`'s neighbor re-queue (reset site)

**Location:** grep `Reset pass count so dark chunks at render distance edge` in `voxEx.html`
**Why:** mechanical substitution — reset-only, non-allocating.

**Before:**
```js
edgeLightingPassCount.delete(nKey);
// GUARANTEED BORDER REMESH: ...
neighborChunk._edgeMeshDirty = true;
```

**After:**
```js
const nState = edgeLightState.get(nKey);
if (nState) nState.passCount = 0;
// GUARANTEED BORDER REMESH: ...
getEdgeLightState(nKey).meshDirty = true;
```

**Verify:** `tools/run-browser-tests.mjs` streaming/neighbor-arrival tests unchanged (387/387).

### #3 — `processEdgeLightingUpdates`'s cap check (owning-chunk site)

**Location:** grep `CONVERGENCE-BASED PASS CAP` in `voxEx.html`
**Why:** one record resolved once per chunk, reused for the whole iteration.

**Before:**
```js
const passCount = (edgeLightingPassCount.get(key) || 0) + 1;
edgeLightingPassCount.set(key, passCount);
if (passCount > MAX_EDGE_LIGHTING_PASSES) {
    if (chunk._edgeMeshDirty && isChunkMeshed(key)) {
        const nowMs = performance.now();
        if (nowMs - (lastEdgeRemeshMs.get(key) || 0) >= EDGE_REMESH_DEBOUNCE_MS) {
            chunk._edgeMeshDirty = false;
            lastEdgeRemeshMs.set(key, nowMs);
            ...
```

**After:**
```js
// CCR-LIGHT-007: one consolidated record per chunk for this whole pass
const edgeState = getEdgeLightState(key);
const passCount = edgeState.passCount + 1;
edgeState.passCount = passCount;
if (passCount > MAX_EDGE_LIGHTING_PASSES) {
    if (edgeState.meshDirty && isChunkMeshed(key)) {
        const nowMs = performance.now();
        if (nowMs - edgeState.lastRemeshMs >= EDGE_REMESH_DEBOUNCE_MS) {
            edgeState.meshDirty = false;
            edgeState.lastRemeshMs = nowMs;
            ...
```

**Verify:** cap-flush behavior identical — `run-browser-tests.mjs` 387/387.

### #4 — Convergence reset, both `meshDirty` writes, remesh-gate condition, debounce block

**Location:** all within `processEdgeLightingUpdates`, same `edgeState` local from #3
**Why:** mechanical substitution, control flow untouched.

**Before → After (one-line diffs, in file order):**
```js
edgeLightingPassCount.set(key, 0);              -> edgeState.passCount = 0;
chunk._edgeMeshDirty = true;   // edgeChanged>0  -> edgeState.meshDirty = true;
chunk._edgeMeshDirty = true;   // else-if branch -> edgeState.meshDirty = true;
if (edgeChanged === 0 && chunk._edgeMeshDirty && hasTerrainMesh) {
                                                 -> if (edgeChanged === 0 && edgeState.meshDirty && hasTerrainMesh) {
if (nowMs - (lastEdgeRemeshMs.get(key) || 0) >= EDGE_REMESH_DEBOUNCE_MS) {
    chunk._edgeMeshDirty = false;
    lastEdgeRemeshMs.set(key, nowMs);
                                                 -> if (nowMs - edgeState.lastRemeshMs >= EDGE_REMESH_DEBOUNCE_MS) {
                                                        edgeState.meshDirty = false;
                                                        edgeState.lastRemeshMs = nowMs;
```

**Verify:** convergence/debounce timing identical — `run-browser-tests.mjs` 387/387.

### #5 — Neighbor pass-count read in the re-queue loop (read-only, non-allocating)

**Location:** grep `const neighborPassCount` in `voxEx.html`
**Why:** reading a neighbor for a threshold check must not allocate a record for a chunk
that may not be loaded — the allocating getter is wrong here on purpose.

**Before:**
```js
const neighborPassCount = edgeLightingPassCount.get(nKey) || 0;
```

**After:**
```js
const neighborPassCount = edgeLightState.get(nKey)?.passCount || 0; // read-only: must not allocate a record for a chunk that may not exist
```

**Verify:** `run-browser-tests.mjs` 387/387; no new `edgeLightState` entries created for
never-loaded neighbor keys (structural — not directly asserted by an existing test).

### #6 — `purgeChunkData` (the actual leak fix)

**Location:** grep `function purgeChunkData` in `voxEx.html`
**Why:** full record removal on eviction, replacing a partial (`passCount`-only) delete and
fixing `lastEdgeRemeshMs`'s pre-existing eviction leak.

**Before:**
```js
pendingLightChunks.delete(key);
edgeLightingUpdateQueue.delete(key);
edgeLightingPassCount.delete(key);
```

**After:**
```js
pendingLightChunks.delete(key);
edgeLightingUpdateQueue.delete(key);
edgeLightState.delete(key); // CCR-LIGHT-007: full record removal (fixes the old lastEdgeRemeshMs eviction leak)
```

**Verify:** structural fix — no test previously exercised `lastEdgeRemeshMs`'s absence
of cleanup, so there is no regression fixture; the fix is provable by inspection (one
`Map` deleted at the one true eviction call site, versus the old three separate objects
of which only one was ever cleaned there).

### #7 — Three CCR-LIGHT-005 orchestration sites (reset, not eviction)

**Location:** grep `edgeLightingUpdateQueue.add(key);` (3 occurrences) in `recalculateAffectedChunks`,
`rebuildTorchLightingForActiveChunks`, `rebuildSkylightForActiveChunks`
**Why:** these are re-queue sites (same shape as `queueAdjacentChunksForUpdate`'s reset), not
eviction sites — reset `passCount` to 0 without allocating.

**Before (each site, identical shape):**
```js
edgeLightingPassCount.delete(key);
edgeLightingUpdateQueue.add(key);
```

**After:**
```js
const edgeState = edgeLightState.get(key);
if (edgeState) edgeState.passCount = 0;
edgeLightingUpdateQueue.add(key);
```

**Verify:** `run-browser-tests.mjs` 387/387 — none of these three call sites are exercised by
any existing test (per CCR-LIGHT-005's own As-built note), so this is a structural-equivalence
argument, not a fixture-backed one.

### #8 — Debug overlay / diagnostics

**Location:** `#debug-overlay` HUD builder and `diagSnapshot()`
**Finding:** neither references any of the three old names. The overlay's only edge-lighting
line reads `edgeLightingUpdateQueue.size` (the queue itself, untouched by this CCR — it was
never one of the three consolidated containers). `diagSnapshot()` does not reference edge
lighting at all. **No changes needed or made** in this area.

## Worker parity

None of `edgeLightingPassCount`/`chunk._edgeMeshDirty`/`lastEdgeRemeshMs`/`edgeLightState` are
injected into the worker (confirmed absent from every `__TERRAIN_FUNCS__`/`__TREE_FUNCS__`/
`__TERRAIN_PASS__` marker range and the `WORKER_LIGHTING_ENABLED` injection list) — this is
main-thread-only orchestration bookkeeping around calls to the (worker-eligible) propagation
functions, not propagation logic itself. `parity-check.mjs` re-run as routine hygiene; green,
unaffected.

## Safety Checks

- [x] `node tools/parity-check.mjs` GREEN
- [x] `node tools/syntax-check.mjs` GREEN
- [ ] Terrain touched? — N/A, no terrain code touched
- [x] `tools/run-browser-tests.mjs` (headless, authoritative) — 387/387, no regressions
- [x] No duplicate/shadowed identifiers — grepped `edgeLightState`, `getEdgeLightState`,
      `edgeState`, `nState` before introducing; all function-local or single module-scope
      declarations, no collisions with `chunk`/`chunks`/`SETTINGS`/`WORLD_DIMS`
- [x] New settings: N/A — no settings touched
- [x] No unbatched per-frame work added — pure bookkeeping refactor of existing call sites,
      no new per-frame loops
- [x] Version constants bumped per "Version impact" above (`VOXEX_BUILD` only)
- [x] CLAUDE.md / docs/agent-notes.md — no dedicated section named these three symbols
      individually; no update needed beyond this CCR's own record

## As-built

**Status: IMPLEMENTED.**

Implemented as planned in Approach, with one naming cleanup during implementation: the three
CCR-LIGHT-005 reset sites were initially given throwaway-looking locals (`s12`/`s13`) to avoid
an accidental redeclaration collision while scripting the mechanical edits; renamed to
`edgeState` immediately after confirming each was in its own function scope (`recalculateAffectedChunks`'s
`rebuildTargets.forEach`, `rebuildTorchLightingForActiveChunks`, `rebuildSkylightForActiveChunks`
are three separate closures, so three separate `const edgeState` declarations do not collide).

**Verification results:**
- `node tools/syntax-check.mjs` — GREEN (all script blocks parse).
- `node tools/parity-check.mjs` — GREEN (all lockstep copies + injection markers; this change
  touches no hand-maintained worker copy).
- `node tools/run-browser-tests.mjs --timeout=600` — **387/387 passed**, matching the
  pre-change baseline exactly (build `2026-07-10.8` was also 387/387).
- `grep -n "edgeLightingPassCount\|_edgeMeshDirty\|lastEdgeRemeshMs" voxEx.html` — 4 hits,
  all inside `VOXEX_RECENT_CHANGES` changelog strings or the new consolidation comment block
  explaining what was replaced; zero live code references.

**Incident during implementation (disclosed in full):** after completing all thirteen
bash-Python mechanical substitutions (verified individually via `assert count==N` on exact
byte patterns) and confirming `syntax-check`/`parity-check` green, the `VOXEX_BUILD` bump and
`VOXEX_RECENT_CHANGES` entry were mistakenly applied using the **Edit tool** directly against
`D:\Projects\voxex\voxEx.html` — a violation of this task's own file-handling rule (bash-Python
only for `voxEx.html`). Per `docs/agent-notes.md` §7's documented failure mode ("Do NOT mix
bash file-overwrites with the Edit tool on the same file"), this desynced the Cowork sandbox's
FUSE-mounted view of the file: a subsequent bash read showed the file's tail truncated
mid-line (~30 lines before the true end), while everything before the cut point remained
byte-correct. The authoritative Windows-side file (read via the Read tool, which bypasses the
mount) was never corrupted — only the sandbox's cached view of its own end-of-file was stale.
**Recovery:** located the exact truncation byte offset in the mount's copy (`bytes.rfind` on
the corrupted mid-word text), kept everything before that offset (verified byte-identical to
the real file up to that point), and re-appended the correct tail — sourced from the Read
tool's authoritative content, re-encoded with `\r\n` line endings to preserve the file's CRLF
invariant — reconstructing the exact original ending (`...};\n}\n</script>\n</body>\n</html>\n`
in CRLF). Verified recovery by: (1) `node tools/syntax-check.mjs` going GREEN again (the
documented real coherence gate — a truncated script tag would fail to parse), (2) re-running
`parity-check.mjs` GREEN, (3) re-reading the tail of the authoritative `D:\` file via the Read
tool and confirming it matched the reconstructed bash-side tail byte-for-byte, and (4) the full
387/387 browser suite passing afterward. No content was lost; the incident cost extra
verification steps but produced no observable damage to the shipped file. Lesson for future
sessions: this CCR's own version-bump step should have gone through the same bash-Python
read→replace→write discipline as every other `voxEx.html` edit in this task, with zero
exceptions for "small" edits like a version-string bump.

**Follow-ups:** none identified. This CCR's scope (three transients → one map) is now
complete; the persisted `RENDER_PASS.EDGE_LIGHTING` bit was correctly left untouched.

**No git operations performed** (per task constraints). `tools/voxex-tests.html` was not
touched — confirmed zero references to any of the three old names or the new `edgeLightState`/
`getEdgeLightState` names in that file, consistent with the task's expectation that the
edge-pipeline test only calls `propagateEdgeLighting`/`propagateLightFromEdgesInward` directly
and never touches this bookkeeping layer.

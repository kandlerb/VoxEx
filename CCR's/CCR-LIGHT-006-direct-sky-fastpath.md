# CCR-LIGHT-006: direct-index fast path for `computeDirectSkyLight`

> **Status: IMPLEMENTED**
> **ID**: VOXEX-CCR-LIGHT-006 · **Build baseline**: 2026-07-10.7 · **Author**: agent (Sonnet)

## Problem / Why

CCR-LIGHT-004's audit (implementation #5, "Point queries") flagged `computeDirectSkyLight` /
`computeNeighborSunlight` / `computeNeighborBlockLight` as rule-correct but did not touch their
performance. `computeDirectSkyLight(x, y, z)` walks the column strictly above `(x, y, z)` — up to
~320 rows (`WORLD_DIMS.chunkHeight`) — calling `getBlock(x, cy, z)` once **per row**. Every call to
`getBlock` re-derives the chunk coordinate, builds a fresh `` `${cx},${cz}` `` template-literal key,
and does a `chunkDataPool`/`Map` lookup (plus an LRU `touch()` on cache miss) — all of that repeated
identically ~320 times per call, even though every row in the walk resolves to the exact same chunk.

This function sits on a hot path: `computeNeighborSunlight` calls it once, then reads 6 neighbor
cells (its own `getBlock`/`getSkyLight` calls), and `computeNeighborSunlight` itself is the "desired
value" query for the incremental sunlight **remove** BFS (`stepLightTask`'s remove branch) — so a
single torch/skylight removal in an open area can call `computeDirectSkyLight` once per boundary
cell of a multi-hundred-cell BFS frontier.

CCR-LIGHT-004 explicitly scoped this out as a **measurement-gated** follow-up ("Explicitly OUT of
scope" #2: "Per-chunk heightmap for O(1) direct-sky queries — measurement-gated separate CCR, only
if Phase 0/3 numbers still show `computeDirectSkyLight` column-walk cost"). This CCR implements only
the **non-gated half**: the accessor optimization (resolve chunk once, direct-index), which is safe
to ship unconditionally because it changes zero semantics and needs no in-game measurement to
justify. The heightmap itself (an O(1) precomputed top-occluder-per-column cache) stays deferred,
gated on real carve-cost numbers from `dumpLogs('magic')` — not built here.

## Approach

Apply the exact pattern VOXEX-CCR-LIGHT-002 (Lever 1) already shipped for `primeSunlightColumn`:
resolve `(x, z)`'s chunk ONCE via `chunkDataPool.get(getChunkKey(x >> 4, z >> 4))` (falling back to
`voxelWorld.chunks.get(...)` if `chunkDataPool` doesn't exist), then direct-index the `blocks` typed
array for every row instead of calling `getBlock` per row. Three semantics had to be preserved
exactly, not blindly copied from `primeSunlightColumn` (which is an edit-path helper with different
correctness obligations than a point query):

1. **Unloaded chunk.** The old per-cell `getBlock` returns `undefined` for every cell when the chunk
   isn't loaded, so every iteration hit the `blockId === undefined` skip and `light` never left its
   `15` seed. The fast path returns `15` directly on `!chunk` to reproduce that outcome without
   looping.
2. **Legacy raw-array chunk.** `getBlock` falls back to `chunk[idx]` when `chunk.blocks` is absent.
   `primeSunlightColumn` early-returns `false` on this case because it is only ever invoked from the
   edit path, where a no-op is an acceptable degradation. `computeDirectSkyLight` is a **point query**
   invoked from `computeNeighborSunlight`'s desired-value calculation and must keep answering, so the
   fast path uses `const blocks = chunk.blocks ? chunk.blocks : chunk;` instead of an early return.
3. **`blockId === undefined` skip.** Kept as a one-line guard in the loop even though it's now
   unreachable for normal object-format chunks — a legacy array shorter than the expected size could
   still read `undefined` at some index, and the check is a single cheap comparison.

**Rejected alternative:** building the heightmap now anyway ("while we're in here"). Rejected per
CCR-LIGHT-004's own explicit gating — no in-game carve-cost measurement exists yet to justify the
added complexity/memory of a per-chunk heightmap, and scope-creeping a gated item into an ungated CCR
defeats the point of gating it.

**Explicitly out of scope (considered and deferred):** `computeNeighborSunlight` and
`computeNeighborBlockLight` themselves were NOT touched. Their own 6-neighbor reads span multiple
chunks per call (each neighbor offset can land in a different chunk than `(x, y, z)`), so a single
"resolve once" optimization doesn't apply the same way — chunk resolution would need to be memoized
per distinct neighbor chunk, which is a different (and more involved) shape of change. Left for a
future CCR if profiling shows it's still hot after this fix.

## Version impact

- `VOXEX_BUILD`: yes — bumped `2026-07-10.7` → `2026-07-10.8`, `VOXEX_RECENT_CHANGES` entry added.
- `TERRAIN_GEN_VERSION`: no — no terrain output change.
- `CURRENT_CACHE_VERSION`: no — byte-identical light values, nothing baked differently.
- `SETTINGS_VERSION`: no — no `DEFAULTS` change.

## Changes

### #1 — `computeDirectSkyLight` direct-index fast path

**Location:** grep `function computeDirectSkyLight` in `voxEx.html`
**Why:** eliminate the per-row string-keyed `getBlock` call in a ~320-row hot-path column walk.

**Before:**
```js
function computeDirectSkyLight(x, y, z) {
    // Walk the column STRICTLY ABOVE the target cell, applying each occluder's
    // attenuation. TER-2: matches calculateChunkSunlight phase 1, which stores the
    // light ARRIVING at a cell — the cell's own attenuation applies only to light
    // continuing past it, never to its own stored value.
    const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;
    let light = 15;
    for (let cy = maxY; cy > y; cy--) {
        const blockId = getBlock(x, cy, z);
        if (blockId === undefined) continue; // Skip unloaded slices
        const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;
        if (attenuation >= 15) { return 1; } // Fully blocked above this point
        if (attenuation > 0) { light = light > attenuation ? light - attenuation : 1; }
    }
    return light > 1 ? light : 1;
}
```

**After:**
```js
function computeDirectSkyLight(x, y, z) {
    // Walk the column STRICTLY ABOVE the target cell, applying each occluder's
    // attenuation. TER-2: matches calculateChunkSunlight phase 1, which stores the
    // light ARRIVING at a cell — the cell's own attenuation applies only to light
    // continuing past it, never to its own stored value.
    // CCR-LIGHT-006 (direct-index fast path, same accessor-bypass pattern as
    // VOXEX-CCR-LIGHT-002's primeSunlightColumn): this is a hot point QUERY --
    // computeNeighborSunlight calls it once per boundary cell in the incremental
    // sunlight remove BFS -- so resolve the (x,z) column's chunk ONCE and
    // direct-index the blocks array instead of paying a string-keyed getBlock()
    // (chunk-map lookup + key alloc) per cell of a ~320-row column walk.
    // Deliberately does NOT call chunkDataPool.touch() to bump LRU recency --
    // same omission as primeSunlightColumn, since a light query should not
    // itself churn cache eviction order. That is the one observable side effect
    // versus the old getBlock()-per-cell walk; it has zero effect on the light
    // VALUE returned.
    const cx = x >> 4, cz = z >> 4;
    const chunkKey = getChunkKey(cx, cz);
    const chunk = (typeof chunkDataPool !== 'undefined' ? chunkDataPool.get(chunkKey)
                                                        : voxelWorld.chunks.get(chunkKey));
    // Unloaded chunk: the old per-cell getBlock() returned undefined for every
    // cell in the column, so every cell hit the "skip unloaded slices" branch
    // below and light never moved off its 15 seed -- preserve that exactly.
    if (!chunk) return 15;
    // Legacy raw-array chunk: getBlock() falls back to chunk[idx] when
    // chunk.blocks is absent. Unlike primeSunlightColumn (an edit-path helper
    // that may safely no-op on this case), this is a point QUERY that must keep
    // answering for legacy chunks.
    const blocks = chunk.blocks ? chunk.blocks : chunk;
    const colBase = (x & 15) + ((z & 15) << 4);
    const maxY = WORLD_DIMS.chunkHeight - WORLD_DIMS.yOffset - 1;
    let light = 15;
    for (let cy = maxY; cy > y; cy--) {
        const idx = colBase + ((cy + WORLD_DIMS.yOffset) << 8);
        const blockId = blocks[idx];
        if (blockId === undefined) continue; // Skip unloaded slices (short legacy array)
        const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;
        if (attenuation >= 15) { return 1; } // Fully blocked above this point
        if (attenuation > 0) { light = light > attenuation ? light - attenuation : 1; }
    }
    return light > 1 ? light : 1;
}
```

**Verify:** `node tools/run-browser-tests.mjs` — 387/387, zero fixture/checksum changes across every
lighting test, including the edit-script checksums that exercise `computeDirectSkyLight` indirectly
via `computeNeighborSunlight`'s use in the incremental remove BFS.

## Worker parity

`computeDirectSkyLight` is **main-only** — confirmed absent from every worker injection list
(`__TERRAIN_FUNCS__`/`__TREE_FUNCS__`/`__TERRAIN_PASS__` markers and the `WORKER_LIGHTING_ENABLED`
injection list, which only carries `propagateLightBFS`/`_chunkLocalLightCtx`/the 4 ctx
accessors/`calculateChunkSunlight`). No worker-template edit needed; `parity-check.mjs` re-run as
routine hygiene, unaffected by this change (green).

`computeNeighborSunlight`/`computeNeighborBlockLight` bodies were NOT touched (see Approach —
considered and deferred, out of scope for this CCR).

## Safety Checks

- [x] `node tools/parity-check.mjs` GREEN
- [x] `node tools/syntax-check.mjs` GREEN
- [ ] Terrain touched? — N/A, no terrain code touched
- [x] `tools/run-browser-tests.mjs` (headless, authoritative) — 387/387, no regressions
- [x] No duplicate/shadowed identifiers (grepped `computeDirectSkyLight`, `cx`/`cz`/`chunkKey`/`chunk`/
      `blocks`/`colBase` — all function-local, no collision with outer-scope globals)
- [x] New settings: N/A — no settings touched
- [x] No unbatched per-frame work added — this is a pure refactor of an existing hot function, no new
      per-frame call sites added
- [x] Version constants bumped per "Version impact" above (`VOXEX_BUILD` only)
- [x] CLAUDE.md / docs/agent-notes.md — no update needed; `computeDirectSkyLight` isn't separately
      documented as a named anchor there, and its documented behavior (attenuation rule, TER-2
      semantics) is unchanged

## As-built

**Status: IMPLEMENTED.**

Implemented exactly as planned in Approach — no deviations. The three semantics-preservation
decisions (unloaded-chunk early return, legacy-array fallback instead of primeSunlightColumn's
early-return, keeping the now-technically-unreachable `undefined` guard) all held on first
implementation; no correction pass was needed against the live suite.

**Verification results:**
- `node tools/syntax-check.mjs` — GREEN (all script blocks parse).
- `node tools/parity-check.mjs` — GREEN (all lockstep copies + injection markers; this change touches
  no hand-maintained worker copy).
- `node tools/run-browser-tests.mjs --timeout=600` — **387/387 passed**, matching the pre-change
  count exactly (build `2026-07-10.7` baseline was also 387/387) — zero fixture/checksum changes.
  Every lighting-related test (full-recalc sunlight/blockLight checksums, edge-pipeline sky/block
  checksums, the incremental edit-script checksums that exercise `computeDirectSkyLight` via
  `computeNeighborSunlight`'s use in the remove BFS, the Phase 4 emission spot test, the CCR-LIGHT-005
  edge re-import test) held byte-identical, confirming the rewrite changed no observable output.

**Deferred follow-ups (unchanged from CCR-LIGHT-004's own list, reconfirmed here):**
- The **measurement-gated heightmap CCR** for O(1) direct-sky queries remains open, pending Kandler's
  in-game `dumpLogs('magic')` carve-cost numbers. This CCR's accessor fix reduces the constant factor
  of the existing column walk; it does not change its O(height) shape. If in-game numbers still show
  `computeDirectSkyLight`/column-walk cost as a real bottleneck after this fix, the heightmap CCR is
  the next lever.
- `computeNeighborSunlight`/`computeNeighborBlockLight` themselves were left untouched — their
  6-neighbor reads span multiple chunks per call, a different shape of optimization than the
  single-column resolve-once trick applied here. Candidate for a future CCR if still hot.

**Real-world perf numbers:** not measured in this sandbox (headless, no in-game profiling available).
Kandler's own `dumpLogs('magic')` capture after a power ≥ 4 carve is the intended real-world
measurement point per CCR-LIGHT-004's Phase D gate discipline — this CCR's contribution should show
up as a reduced constant-factor cost on any `computeNeighborSunlight`/remove-BFS-heavy operation
(e.g., breaking a torch or carving open sky in a previously-lit area), but no specific ms number is
claimed here without that in-game evidence.

**Incidents:** none. No git operations performed (per task constraints). `voxEx.html` edited via
bash-Python only (single read → replace → write pass, binary mode, CRLF-preserving, `assert count==1`
on the target block before writing). `tools/voxex-tests.html` was not touched. `CLAUDE.md` was not
touched at all in this CCR.

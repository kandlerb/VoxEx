# CCR-LIGHT-005: full-recalc paths must re-import neighbor light

> **Status: IMPLEMENTED** — DRAFT → AUDITED → IMPLEMENTED (move to `Finished/` in the same
> commit series that ships this doc)
> **ID**: VOXEX-CCR-LIGHT-005 · **Build baseline**: `2026-07-10.6` · **Author**: Kandler (direction) + Claude (implementation)

## Problem / Why

CCR-LIGHT-004 (Phases 0-4, buildable scope COMPLETE at build `2026-07-10.6`) unified the
light-propagation rule and made the edge-lighting pipeline physics-correct
(`propagateEdgeLighting` + `propagateLightFromEdgesInward`, Phase 2). That CCR's own
"Explicitly OUT of scope" section named this exact follow-up and deliberately deferred it
until Phase 2 landed:

> **Full-recalc edge re-import** — `bailoutToFullRecalc`, `rebuildTorchLightingForActiveChunks`,
> and `rebuildSkylightForActiveChunks` recalc chunk-local light with no neighbor re-import
> afterward (dark border seams after big carves / settings changes). That is an
> ORCHESTRATION fix (→ CCR-LIGHT-005), deliberately sequenced AFTER Phase 2 of this CCR so
> the edge pass it invokes has correct physics.

`calculateChunkSunlight`/`calculateBlockLight` are chunk-local by design (they only see one
chunk's own `blocks`/`skyLight`/`blockLight` arrays) — cross-chunk light has always required
a SEPARATE step (`propagateLightFromNeighbors` → `propagateLightFromEdgesInward`) to reach a
chunk from its neighbors. The streaming path (`recalculateEdgeLighting`, called from
`runNeighborUpdatePass`) already does both steps in sequence. Three other call paths run the
chunk-local recalc with NO follow-up import, so cross-chunk light stays truncated at that
chunk's borders until something else happens to relight it:

1. **`LightTask.bailoutToFullRecalc`** (grep `bailoutToFullRecalc`) → its own
   `recalculateAffectedChunks` recalcs each of the bailout's 3×3-target chunks independently
   (`calculateChunkSunlight`/`calculateBlockLight` only), then `scheduleChunkRebuilds` remeshes
   them with `bypassLighting: true`. After a big carve (e.g. a power-5 explosion) that
   triggers a bailout, torch light crossing a chunk border and cave daylight entering from a
   neighbor are clipped at the seam — a dark stripe at the chunk edge where there should be
   continuous light.
2. **`rebuildTorchLightingForActiveChunks`** (torch-intensity setting change): chunk-local
   `calculateBlockLight` over every entry in `activeChunks`, then `rebuildAllVisibleChunks()`.
   Every torch within ~14 blocks of a border loses its light in the NEIGHBORING chunk (that
   chunk's own recalc has no way to know a torch on the other side of the border exists).
3. **`rebuildSkylightForActiveChunks`**: the same gap for the skylight channel.

None of these paths were touched by CCR-LIGHT-004's Phase 2 fix — Phase 2 only made the edge
FUNCTIONS themselves (`propagateEdgeLighting`/`propagateLightFromEdgesInward`) charge the
correct attenuation and spread both channels inward. It never added CALLS to those functions
at these three sites; they simply never called them at all.

## Approach

Extract the streaming path's existing "recalc, then import neighbor light, then mark
edge-lit" sequence (already correct, already used by `recalculateEdgeLighting`) into one
shared helper — `reimportNeighborLight(chunk, cx, cz)` — and call it from all three
orchestration sites, each AFTER their existing recalc loop finishes over the FULL target set.

The two-pass discipline (recalc every chunk in the batch first, THEN re-import for each) is
load-bearing, not cosmetic: `reimportNeighborLight` pulls a neighbor's CURRENT border values.
If a neighbor in the same batch hasn't been recalculated yet, importing from it re-imports
stale values that are about to be overwritten by that neighbor's own recalc a moment later —
the reverse of the intended fix. All three call sites already had a "recalc every target"
loop; this CCR only adds a second loop after it, never interleaves the two.

A single re-import pass only reaches ONE ring of neighbors (the 4 cardinal chunks
`propagateLightFromNeighbors` reads). Light that needs to cross more than one border (e.g. a
diagonal neighbor's light, or a chain of neighbors) still needs the normal background
convergence mechanism (`edgeLightingUpdateQueue` + `processEdgeLightingUpdates`,
`MAX_EDGE_LIGHTING_PASSES = 3`) to finish the job over subsequent frames. So each touched
chunk is also reset into that queue (`edgeLightingPassCount.delete(key)` +
`edgeLightingUpdateQueue.add(key)`) rather than treated as fully converged after one pass.

**Rejected alternatives:**

- *Recompute the whole 3×3 (or `activeChunks`) neighborhood's neighbors too, recursively.*
  Unbounded blast radius for a fix whose whole point is bounded orchestration; the existing
  background convergence queue already exists to finish multi-hop convergence over a few
  frames without blocking the calling frame. Rejected as scope creep.
- *Route these three call sites through `recalculateEdgeLighting` directly instead of a new
  helper.* `recalculateEdgeLighting` ALSO reruns `calculateChunkSunlight`/`calculateBlockLight`
  itself (it's built for the streaming path, which hasn't recalculated yet at the point it's
  called). All three orchestration sites here have ALREADY just recalculated every target in
  a batched loop — calling `recalculateEdgeLighting` per-chunk would recompute the chunk-local
  BFS a second, redundant time per chunk for no benefit. A dedicated helper that assumes
  "recalc already happened, just re-import + spread + mark" is the correct shape and matches
  each site's own two-pass structure. Rejected the shared-with-streaming-path option.

## Version impact

- `VOXEX_BUILD`: bump `2026-07-10.6` → `2026-07-10.7` + `VOXEX_RECENT_CHANGES` entry (this CCR)
- `TERRAIN_GEN_VERSION`: **no** — no terrain generation output changes
- `CURRENT_CACHE_VERSION`: **no** — this is a RUNTIME ORCHESTRATION fix (WHEN/whether neighbor
  light gets re-imported after an already-existing recalc), not a change to any baked-at-
  generation-time value or to the propagation RULE itself. Every value this CCR causes to be
  computed is produced by the exact same already-shipped, already-cache-bumped functions
  (`propagateLightFromNeighbors`, `propagateLightFromEdgesInward`, and transitively
  `propagateLightBFS`/`lightRuleEnter`) that the streaming path has been calling all along —
  only the SET of call sites invoking them grew. A chunk that happens to go through one of
  these three paths now converges to the SAME values a chunk that went through the streaming
  path would already have; no existing chunk's baked/cached light retroactively becomes
  "wrong" by a semantics change, so there is nothing for a cache-version bump to invalidate.
- `SETTINGS_VERSION`: **no** — no `DEFAULTS` changes

## Changes

### #1 — New shared helper `reimportNeighborLight`

**Location:** grep `function recalculateEdgeLighting` in `voxEx.html` — the new helper is
inserted immediately above it (same file region, since it's used by that function's own
call sequence and is the single source for "recalc already happened, now import + spread +
mark edge-lit").
**Why:** single-source the "re-import + spread + mark" sequence so all four call sites
(the pre-existing streaming path plus this CCR's three orchestration sites) share one
implementation instead of hand-copying it a fourth time.

**Before:** (helper did not exist; `recalculateEdgeLighting` did its own recalc +
`propagateLightFromNeighbors` + `propagateLightFromEdgesInward` + renderState marking inline)

**After:**
```js
/**
 * Re-imports neighbor border light into a freshly-recalculated chunk and spreads it
 * inward -- BOTH channels. Used by every full-recalc path (LightTask bailout, the
 * torch/skylight settings rebuilds) so chunk-local recalcs don't strand dark seams
 * at borders (CCR-LIGHT-005). Callers must recalc ALL chunks in their target set
 * FIRST, then re-import for each -- importing while neighbors are still stale
 * re-imports the very values being replaced.
 * @param {Object} chunk - chunk data ({blocks, skyLight, blockLight, ...})
 * @param {ChunkCoord} cx - chunk X
 * @param {ChunkCoord} cz - chunk Z
 * @returns {void}
 */
function reimportNeighborLight(chunk, cx, cz) {
    propagateLightFromNeighbors(chunk, cx, cz, WORLD_DIMS.chunkSize, WORLD_DIMS.chunkHeight);
    propagateLightFromEdgesInward(chunk, WORLD_DIMS.chunkSize, WORLD_DIMS.chunkHeight);
    if (!chunk.renderState) chunk.renderState = 0;
    chunk.renderState |= RENDER_PASS.EDGE_LIGHTING;
}
```
`recalculateEdgeLighting` itself was left untouched (its own inline sequence still works and
is not this CCR's concern — it does its OWN recalc first, unlike the three sites below which
had already recalculated their whole batch by the time this helper is useful to them).

**Verify:** `node tools/syntax-check.mjs`; grep confirms exactly one declaration.

### #2 — `LightTask.recalculateAffectedChunks` re-imports after its recalc loop

**Location:** grep `recalculateAffectedChunks(targets)` inside `class LightTask`
**Why:** this is `bailoutToFullRecalc`'s own recalc step — the direct fix for symptom #1.

**Before:**
```js
                // Recalculate lighting for affected chunks
                recalculateAffectedChunks(targets) {
                    const rebuildTargets = [];
                    targets.forEach((key) => {
                        const chunk = chunks.get(key);
                        if (!chunk) return;
                        calculateChunkSunlight(chunk, this.chunkSize, this.chunkHeight);
                        calculateBlockLight(chunk, this.chunkSize, this.chunkHeight);
                        rebuildTargets.push(key);
                    });
                    return rebuildTargets;
                }
```

**After:**
```js
                // Recalculate lighting for affected chunks
                recalculateAffectedChunks(targets) {
                    const rebuildTargets = [];
                    targets.forEach((key) => {
                        const chunk = chunks.get(key);
                        if (!chunk) return;
                        calculateChunkSunlight(chunk, this.chunkSize, this.chunkHeight);
                        calculateBlockLight(chunk, this.chunkSize, this.chunkHeight);
                        rebuildTargets.push(key);
                    });
                    // CCR-LIGHT-005: re-import neighbor border light AFTER every target chunk has
                    // been recalculated above -- a chunk-local recalc alone truncates cross-chunk
                    // light at borders (dark seams after a bailout-triggered carve). Two-pass
                    // discipline is load-bearing (see reimportNeighborLight's JSDoc): importing
                    // while a neighbor in this same batch is still stale would re-import the very
                    // values the first loop just replaced.
                    rebuildTargets.forEach((key) => {
                        const chunk = chunks.get(key);
                        if (!chunk) return;
                        const [cx, cz] = parseChunkKey(key);
                        reimportNeighborLight(chunk, cx, cz);
                        // Queue for the normal background edge-lighting pass so light crossing
                        // MORE than one border (diagonal neighbors, etc.) still converges.
                        edgeLightingPassCount.delete(key);
                        edgeLightingUpdateQueue.add(key);
                    });
                    return rebuildTargets;
                }
```

**Verify:** in-game — a power-5 explosion carve at/near a chunk border no longer leaves a
dark seam once the bailout path fires; `dumpLogs('magic')` still shows the same bailout
trigger logging, unchanged.

### #3 — `rebuildTorchLightingForActiveChunks` re-imports after its recalc loop

**Location:** grep `function rebuildTorchLightingForActiveChunks`
**Why:** direct fix for symptom #2 (torch-intensity setting change).

**Before:**
```js
            function rebuildTorchLightingForActiveChunks() {
                if (!activeChunks || activeChunks.size === 0) return;
                const chunkSize = WORLD_DIMS.chunkSize;
                const chunkHeight = WORLD_DIMS.chunkHeight;
                activeChunks.forEach((key) => {
                    const chunk = chunks.get(key);
                    if (!chunk || !chunk.blocks) return;
                    calculateBlockLight(chunk, chunkSize, chunkHeight);
                });
                rebuildAllVisibleChunks();
            }
```

**After:**
```js
            function rebuildTorchLightingForActiveChunks() {
                if (!activeChunks || activeChunks.size === 0) return;
                const chunkSize = WORLD_DIMS.chunkSize;
                const chunkHeight = WORLD_DIMS.chunkHeight;
                activeChunks.forEach((key) => {
                    const chunk = chunks.get(key);
                    if (!chunk || !chunk.blocks) return;
                    calculateBlockLight(chunk, chunkSize, chunkHeight);
                });
                // CCR-LIGHT-005: re-import neighbor border light AFTER every active chunk above
                // has been recalculated (two-pass discipline, see reimportNeighborLight's JSDoc) --
                // without this, a torch-intensity setting change strands cross-border torch light
                // dark in every neighboring chunk until some later background edge-lighting pass.
                activeChunks.forEach((key) => {
                    const chunk = chunks.get(key);
                    if (!chunk || !chunk.blocks) return;
                    const [cx, cz] = parseChunkKey(key);
                    reimportNeighborLight(chunk, cx, cz);
                    edgeLightingPassCount.delete(key);
                    edgeLightingUpdateQueue.add(key);
                });
                rebuildAllVisibleChunks();
            }
```

**Verify:** in-game — drag the torch-intensity slider near a chunk border with a torch on
one side; the neighboring chunk's share of that torch's light no longer goes dark.

### #4 — `rebuildSkylightForActiveChunks` re-imports after its recalc loop

**Location:** grep `function rebuildSkylightForActiveChunks`
**Why:** direct fix for symptom #3 (skylight setting change), identical shape to #3.

**Before/After:** same structure as #3, with `calculateChunkSunlight` in the first loop
(unchanged) and the identical second `reimportNeighborLight` loop inserted before
`rebuildAllVisibleChunks()`.

**Verify:** in-game — a cave crossing a chunk border shows no brightness step at the seam
after a skylight-affecting setting change.

### #5 — Seam export

**Location:** grep `propagateEdgeLighting, propagateLightFromEdgesInward,` inside the
`window.VoxEx = {` object
**Why:** the new characterization test needs to call `reimportNeighborLight` directly, and
`RENDER_PASS` (previously seam-invisible) to assert the render-state bit it sets.

**After:** new group added directly below the Phase 2 group:
```js
                    // --- CCR-LIGHT-005: full-recalc edge re-import (characterization test) ---
                    reimportNeighborLight, RENDER_PASS,
```

### #6 — Headless characterization test

**Location:** `tools/voxex-tests.html`, new `describe` inserted directly after
`"lighting: edge-pipeline characterization (CCR-LIGHT-004 Phase 2)"`
**Why:** the three orchestration sites themselves are not independently pure/seam-friendly
(`recalculateAffectedChunks` is a `LightTask` instance method reading the module `targets`
Set and the module-level `chunks`/`lightUpdateQueue`; `rebuildTorchLightingForActiveChunks`/
`rebuildSkylightForActiveChunks` iterate the live `activeChunks` Set and end by calling
`rebuildAllVisibleChunks()`, which pushes into `chunkBuildQueue` and touches `dirtyChunks` --
none of that is reachable or advisable to drive from a headless unit test). The shared
`reimportNeighborLight` helper IS reachable, though: it reads the real module-level `chunks`
Map via `propagateLightFromNeighbors`'s `chunks.get(getChunkKey(...))` calls, and that same
map is `chunkDataPool.chunks` (verified: `ChunkDataPool` is constructed as
`new ChunkDataPool(chunks, SETTINGS)`, i.e. `chunkDataPool.chunks` IS the module `chunks`
reference, not a copy) -- exactly the registry the Phase 0/2/3B fixtures already use to
register synthetic chunks via `chunkDataPool.chunks.set(key, chunkObj)`. So the test exercises
the OBSERVABLE fix at the primitive level: register two adjacent chunks into that real
registry, run each through the same chunk-local recalc every orchestration site runs BEFORE
ever calling the helper, then call the exported `reimportNeighborLight` directly and assert
the resulting values by hand computation -- proving the helper (and therefore every call site
built on it) actually pulls a neighbor's light across the border and spreads it inward,
instead of faking the orchestration layer itself.

**Test:** two synthetic chunks sharing an X border, both flat stone-floored (y ≤ 99) with
open air above. Source chunk A (west neighbor of target B) has one TORCH 2 cells in from its
OWN east border (`lx=13`, border `lx=15`); target chunk B has no emitters at all. Both run
`calculateChunkSunlight`/`calculateBlockLight` first (the chunk-local recalc every
orchestration site performs). Precondition asserted: `A.blockLight` at its own border
(`lx=15`) = 13 (torch level 15, two air steps: `15-1-1=13`); `B.blockLight` at its border
(`lx=0`) = 0 (no emitters, nothing cross-chunk has happened yet). Both chunks registered via
`chunkDataPool.chunks.set`. Calling `reimportNeighborLight(B, CX, CZ)` (`B` is the chunk at
`(CX, CZ)`, `A` at `(CX-1, CZ)`) asserts: `B.blockLight[bi(0,100,8)] === 12` (border transfer:
A's border value 13, minus 1 travel, minus 0 attenuation of the entered/target AIR cell);
`B.blockLight[bi(1,100,8)] === 11` and `B.blockLight[bi(2,100,8)] === 10` (inward spread two
cells deep through open air, proving the fix reaches past the single imported border cell,
not just a one-cell transfer); and `(B.renderState & RENDER_PASS.EDGE_LIGHTING) !== 0` (the
helper marks the chunk edge-lit, same as the streaming path). Cleans up both registrations in
a `finally` block.

**Verify:** `node tools/run-browser-tests.mjs` — new test green alongside all pre-existing
fixtures.

## Worker parity

Nothing in this CCR touches an injected function. `reimportNeighborLight`,
`recalculateAffectedChunks`, `rebuildTorchLightingForActiveChunks`,
`rebuildSkylightForActiveChunks` are all main-thread-only orchestration (never injected into
the chunk worker; the worker never bails out to a full recalc or rebuilds torch/skylight for
settings changes — that's all main-thread game-loop/UI-triggered code). `propagateLightFromNeighbors`
and `propagateLightFromEdgesInward` (called BY the new helper) were already main-only before
this CCR and remain untouched by it. `node tools/parity-check.mjs` is unaffected structurally
but was run anyway per the standard verification ladder.

## Safety Checks

- [x] `node tools/parity-check.mjs` GREEN
- [x] `node tools/syntax-check.mjs` GREEN
- [x] Terrain untouched — no terrain-node-checks required (this CCR is lighting-orchestration only)
- [x] `tools/voxex-tests.html` (via `tools/run-browser-tests.mjs`, headless) — no regressions,
      1 new test green, all 386 pre-existing tests green
- [x] No duplicate/shadowed identifiers (grepped `reimportNeighborLight` before declaring — one hit)
- [x] No new settings (none planned/added)
- [x] No unbatched per-frame work added — all three call sites are settings-change /
      bailout-triggered, already documented as "NOT HOT" in their own `OPTIMIZATION AUDIT` comments
- [x] Version constants bumped per "Version impact" above (`VOXEX_BUILD` only)
- [x] CLAUDE.md's Lighting Engine bullet updated in the same commit

## As-built (fill in AFTER implementation)

**DONE 2026-07-10, build `2026-07-10.7`** (Sonnet subagent; sandbox session, uncommitted —
commit from Windows):

- `voxEx.html` (7 replacements, all via bash-mount Python edits per agent-notes §7, zero
  Edit-tool use on `voxEx.html`/`tools/voxex-tests.html` this session):
  - New `reimportNeighborLight(chunk, cx, cz)` helper inserted directly above
    `function recalculateEdgeLighting` (grep confirms exactly one declaration), matching the
    CCR's exact sketch — no deviation.
  - `LightTask.recalculateAffectedChunks` gained the second `rebuildTargets.forEach` loop
    exactly as specced: re-fetches each chunk by key, parses `[cx, cz]` via the existing
    `parseChunkKey` helper (already in scope inside the class; did NOT introduce
    `parseChunkKeySimple`, a different helper declared later in the file for an unrelated
    purpose), calls `reimportNeighborLight`, then resets `edgeLightingPassCount` and queues
    into `edgeLightingUpdateQueue` for background convergence.
  - `rebuildTorchLightingForActiveChunks` and `rebuildSkylightForActiveChunks` each gained an
    identical second `activeChunks.forEach` loop, placed after the existing recalc loop and
    before `rebuildAllVisibleChunks()`, per the CCR text.
  - Seam export: `reimportNeighborLight, RENDER_PASS` added as a new group directly below the
    existing `CCR-LIGHT-004 Phase 2` edge-lighting group in `window.VoxEx`. `RENDER_PASS` had
    no prior seam visibility; added since the new test asserts against it.
  - `VOXEX_BUILD` → `"2026-07-10.7"` + one `VOXEX_RECENT_CHANGES` entry (prepended, ASCII-only
    text — no embedded double-quote characters, learning the Phase 3B incident's lesson about
    quote characters breaking the double-quoted changelog string literal).
  - `CLAUDE.md`'s Lighting Engine bullet updated in the same pass (direct Edit tool, since
    CLAUDE.md is not one of the two protected bash-mount-only files) to describe the new
    `reimportNeighborLight` call sites and the background-convergence re-queueing.
- `tools/voxex-tests.html`: one new `describe`/`it` pair
  (`"lighting: full-recalc edge re-import (CCR-LIGHT-005)"`), inserted directly after the
  existing Phase 2 edge-pipeline characterization describe. Design matches the CCR's plan
  exactly — two adjacent synthetic chunks registered into the real `chunkDataPool.chunks`
  map (confirmed identical to the module-level `chunks` Map by reading `ChunkDataPool`'s
  construction site, `new ChunkDataPool(chunks, SETTINGS)`, before writing the test), a torch
  in the source chunk 2 cells from its own border, a fully emitter-free target chunk, both
  run through `calculateChunkSunlight`/`calculateBlockLight` first (mirroring what every
  orchestration site does before ever calling the new helper). Hand-computed spot values
  (border transfer `13-1-0=12`, inward spread `11`/`10` two cells deep, `RENDER_PASS.EDGE_LIGHTING`
  bit set) all matched on the FIRST headless run — no test-design iteration needed, unlike
  several earlier CCR-LIGHT-004 phases' first-draft geometry bugs. Chose the
  export-and-test path over the documented-in-game-only fallback because
  `reimportNeighborLight`'s only "impurity" is reading the module-level `chunks` Map via
  `propagateLightFromNeighbors`, and that map was independently confirmed reachable through
  the exact same `chunkDataPool.chunks` registry every prior CCR-LIGHT-004 fixture already
  uses — no new seam risk, no faked orchestration layer.
- Gates: CRLF invariant (`tr -cd '\r' < voxEx.html | wc -c == wc -l`; same for
  `tools/voxex-tests.html`) held through every edit — no truncation/desync incident this
  session. `node tools/syntax-check.mjs` and `node tools/parity-check.mjs` GREEN after every
  edit. Full browser suite (`tools/run-browser-tests.mjs`, headless Chromium, cached
  `/tmp/br3` install + `/tmp/libs`) **387/387** (386 pre-existing + 1 new) — all six
  pre-existing lighting checksum/spot fixtures (full-recalc sunlight `1821834511` / blockLight
  `725244334`, edge-pipeline sky `1889740755` / block `787091577`, edit-script sky
  `1768186114` / block `1948544033`) plus the Phase 3B/Phase 4 spot tests held byte-identical
  — none of the three touched call sites are exercised by any pre-existing test, exactly as
  the CCR's Safety Checks anticipated.
- Deviations from the CCR text: none of substance. `parseChunkKey` (not
  `parseChunkKeySimple`) was used in `recalculateAffectedChunks` per the CCR's own Changes
  section (`parseChunkKeySimple` is a separate, unrelated helper declared later in the file
  for a different call path — the CCR's task brief flagged it as an option but the Changes
  section itself specifies `parseChunkKey`, already in scope inside the `LightTask` class and
  used by its sibling methods `collectAffectedChunks`/`scheduleChunkRebuilds`, so that is what
  shipped for consistency).
- In-game gate items pending (Kandler; headless sandbox cannot perform): a power-5
  explosion's post-bailout border seams are gone (no dark strip at the chunk edge after the
  carve); dragging the torch-intensity slider no longer kills cross-border torch light in
  neighboring chunks; a skylight-affecting setting change shows no brightness step at a
  cave-crossing-a-border seam.
- No git operations performed (sandbox note honored, per agent-notes §7).

**This closes CCR-LIGHT-005's full scope in one hand-off** (no phasing needed — the fix is
three small, structurally-identical call sites built on one shared helper). Remaining
CCR-LIGHT-004 follow-ups (measurement-gated heightmap CCR, watchdog demotion per D5) are
unaffected and still open, tracked in that CCR's own As-built section.

# CCR-LIGHT-004: Unified light-propagation kernel + budgeted block light

> **Status: AUDITED** (2026-07-10, against build `2026-07-09.4` — see Audit record at bottom) — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-LIGHT-004 · **Build baseline**: `2026-07-09.4` · **Author**: Kandler (direction) + Claude (audit / spec)
>
> **ID note:** older in-code comments use `VOXEX-CCR-LIGHT-001/002/003` for the edge-lighting
> streaming-cost items AND the 2026-07-09 marker-leak fix reused `CCR-LIGHT-001` as a file name.
> This CCR takes `004` to stay clear of both namespaces.
>
> **How to hand this off:** ONE PHASE PER HAND-OFF, in order (same discipline as
> CCR-torch-baked-lightmap). Each phase ends with an acceptance gate that must pass
> before the next phase starts. Phases 1-4 each bump `VOXEX_BUILD` and ship
> independently — the system is fully functional between phases.

## Problem / Why

The 2026-07-10 lighting audit found the propagation rule — *"light entering a cell =
source − 1 travel − attenuation of the entered cell, floored at 1 (sky) / 0 (block)"* —
hand-copied in **six places**, with divergent architectures around them:

| # | Implementation | Anchor | Rule fidelity |
|---|---|---|---|
| 1 | Full-recalc sunlight BFS (phase 2) | `function calculateChunkSunlight` | correct (TER-18) |
| 2 | Full-recalc block-light BFS | `function calculateBlockLight` | correct (TER-1), but **seeding hardcodes TORCH/FIRE** and ignores `BLOCK_LIGHT_EMISSION` |
| 3 | Incremental sunlight add/remove | `class SunlightTask` / `stepSunlightTask` | correct; budgeted + pressure-managed |
| 4 | Incremental block-light add/remove | `function updateBlockLightAt` | correct rule, but **synchronous and unbudgeted** — no caps, no bailout, no task queue |
| 5 | Point queries | `computeNeighborSunlight` / `computeNeighborBlockLight` | correct (TER-1/TER-2 comments exist precisely to keep them in sync by hand) |
| 6 | Edge lighting | `propagateEdgeLighting` + `propagateLightFromEdgesInward` | **WRONG — already drifted.** Charges only the −1 travel cost; ignores `SUNLIGHT_ATTENUATION`/`BLOCKLIGHT_ATTENUATION` of the entered cell, checks only `IS_TRANSPARENT`. And the inward BFS spreads **skylight only** — neighbor blockLight is imported exactly 1 cell deep and never propagated. |

Concrete symptoms of the drift (implementation #6):

- Cross-chunk light through WATER (atten 1 sky / 2 block), LEAVES (1/1), and ICE (1/1)
  arrives too bright via the edge path; the next edit-triggered relight computes the
  correct lower value → borders visibly darken "for no reason" on first edit near
  water or a canopy.
- Any chunk whose light is recomputed from scratch gets at most a 1-cell rim of a
  neighbor's torch light (no blockLight inward spread).

Architectural consequences of the asymmetry (implementation #4):

- Removing a torch in an open cavern runs a ~3,600-cell BFS synchronously in one frame,
  with `computeNeighborBlockLight` (6 keyed `getBlock`/`getBlockLight` reads, each
  allocating a `` `${cx},${cz}` `` key string) per boundary cell.
- `isCriticalLightJob` exempts jobs in the player's own chunk from
  `MAX_LIGHT_UPDATES_PER_FRAME` — a magic carve at the player's feet processes EVERY
  queued job, each with its own synchronous block-light BFS, in a single frame. Likely
  a major contributor to the power ≥ 4 carve hitch (Phase D gate; confirm with
  `dumpLogs('magic')` in Phase 0).
- Because sunlight and block light have different job lifecycles, per-chunk pending
  state is a refcount (`pendingLightChunks` count/firstSeen/lastSeen/lastForced) with
  a watchdog + grace timers + force-drains compensating for leaks. CCR-LIGHT-001 was
  exactly this class of bug; the design invites the next one.

Hygiene items found in the same audit, cheapest fixed inside this CCR:

- `chunksNeedingLightingUpdate` is vestigial — `processEdgeLightingUpdates` drains the
  ENTIRE set into `edgeLightingUpdateQueue` unconditionally at the top of every call,
  so `queueChunkForLightingUpdate`'s neighbor-readiness split does nothing.
- `VoxelWorld.setBlock`'s chunk-create and legacy-upgrade paths init
  `blockLight: new Uint8Array(size).fill(1)` — every other producer uses 0 ("no torch
  light"). A third semantics variant for no reason.
- Dead code: the `level` local in `stepSunlightTask`'s remove loop is read from the
  queue but never used (orphaned by the "always recompute desired" rewrite);
  `hasWaterMesh = false` in `processEdgeLightingUpdates`; `?? 0` guards on Uint8Array
  reads already flagged unreachable in comments.

## Approach

Extract ONE parameterized BFS kernel (self-contained, injection-friendly — tables and
floors passed as arguments, zero closures over main-thread state) and route all six
implementations through it in phases, byte-parity-gated where outputs must not change
and `CURRENT_CACHE_VERSION`-bumped where they deliberately do (edge semantics). Then
fold block light into the existing task machinery so both channels share one budgeted
lifecycle with one finalize path, letting the `pendingLightChunks` refcount shrink to
plain task ownership and the watchdog to a diagnostic.

**Rejected alternatives:**

- *Fix each site in place (six patches, no kernel).* Leaves the drift class open — the
  TER-1/TER-2 parity comments already proved hand-sync fails. Rejected.
- *Big-bang rewrite in one hand-off.* A ~46K-line single file with worker injection and
  379 browser tests needs the verification ladder between steps. Rejected; phased.
- *"Light as texture" (Phase F) instead.* Orthogonal: that changes where light is
  STORED for rendering, not how values are COMPUTED. Stays deferred
  (see agent-notes §3, CCR-torch-baked-lightmap D4 keeps the BFS as volumetric fill).

**Explicitly OUT of scope (follow-ups, do not scope-creep into this CCR):**

1. **Full-recalc edge re-import** — `bailoutToFullRecalc`, `rebuildTorchLightingForActiveChunks`,
   and `rebuildSkylightForActiveChunks` recalc chunk-local light with no neighbor
   re-import afterward (dark border seams after big carves / settings changes).
   That is an ORCHESTRATION fix (→ CCR-LIGHT-005), deliberately sequenced AFTER
   Phase 2 of this CCR so the edge pass it invokes has correct physics.
2. **Per-chunk heightmap** for O(1) direct-sky queries — measurement-gated separate
   CCR, only if Phase 0/3 numbers still show `computeDirectSkyLight` column-walk cost.
3. **CCR-torch-baked-lightmap** — unaffected; it consumes `updateBlockLightAt`'s
   OUTPUT semantics, which Phase 3 preserves exactly (scheduling changes only).

## Decisions (made — do not re-open during implementation)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Kernel signature | `propagateLightBFS(queue, qStart, ctx)` where `ctx` carries `{ get, set, getLight, setLight, attenTable, floor, visited?, budget?, onTouchChunk? }` — accessors and tables are ARGUMENTS, never closed-over globals | worker-injectable via `Function.toString()` with zero new worker globals; chunk-local callers pass direct-index accessors, global callers pass world accessors |
| D2 | Phase 1 output parity | BYTE-IDENTICAL. The kernel replaces loops that are monotone-max flood fills; same rule + same floors ⇒ same fixpoint regardless of visitation order (already proven for the edge-inward rewrite, grep `byte-identical` near `propagateLightFromEdgesInward`) | lets Phase 1 ship with zero cache/terrain bumps |
| D3 | Phase 2 semantics change | Edge path gains attenuation + blockLight inward spread; baked border light values change ⇒ `CURRENT_CACHE_VERSION` bump in the SAME commit | CLAUDE.md Version Constants rule |
| D4 | Phase 3 scope | Block-light VALUES unchanged; only WHEN they compute changes (budgeted task vs synchronous). `updateBlockLightAt`'s callers keep their call shape | protects CCR-torch-baked-lightmap D4 and every `setBlock` caller |
| D5 | Watchdog | Stays fully active through Phase 3 + a soak period; demote to diagnostic-only in a LATER cleanup once `dumpLogs` shows zero watchdog-forced clears across sessions | CCR-LIGHT-001 humility — don't remove the safety net in the same change that touches the thing it guards |
| D6 | `isCriticalLightJob` | Keep the player-chunk exemption but cap it (`CRITICAL_LIGHT_JOBS_PER_FRAME = 4`, tunable) once block light is budgeted — a capped critical lane preserves "my edit lights up immediately" without the unbounded frame | responsiveness vs hitch balance |
| D7 | Seeding | `calculateBlockLight` seeds from `BLOCK_LIGHT_EMISSION[id]` with TORCH special-cased through `getTorchBlockLightLevel()` — i.e. exactly `getBlockEmission()`'s logic, shared | kills the mirrored-logic drift (audit finding #4) |

## Version impact

- `VOXEX_BUILD`: bump per phase + `VOXEX_RECENT_CHANGES` entry citing CCR-LIGHT-004 phase (always)
- `TERRAIN_GEN_VERSION`: **no** (no terrain output change in any phase)
- `CURRENT_CACHE_VERSION`: **Phase 2 only — yes** (edge-lighting semantics change baked light values); Phases 1/3/4 **no** (byte-identical / scheduling-only / seeding-of-blocks-that-don't-exist-yet + zero-fill fix)
- `SETTINGS_VERSION`: **no** (no `DEFAULTS` changes)

---

# PHASE 0 — Characterization + baselines (no voxEx.html edits)

**Goal:** prove the safety net catches regressions BEFORE refactoring, and capture the
perf numbers Phases 3 and the follow-up heightmap CCR will be judged against.

**Steps:**

1. Existing coverage (AUDIT-CONFIRMED in `tools/voxex-tests.html`): point-value tests
   for both calculators exist — grep `"full sun through air"`, `"leaves attenuate by 1"`,
   `"torch emits level 15"`, `"light decays to 0 at range"` — and the worker byte-parity
   test exists — grep `"worker skyLight/blockLight match main-thread"` (per-byte compare
   on real generated terrain + blockLight all-zero invariant). Both are Phase 1 gates
   as-is.
2. What's MISSING (add in this phase): (a) a full-array checksum test for each
   calculator on a fixed synthetic chunk (caves + water + leaves + torch — point tests
   don't catch a wrong value in an unasserted cell); (b) an incremental EDIT-SCRIPT
   test through the `?test=1` seam (place torch, break torch, place/break stone over
   water via the facade `setBlock`, drain `processLightQueue`/`processSunlightQueue`
   to quiescence, checksum both arrays) — this is the only gate that covers
   `SunlightTask`/`updateBlockLightAt`, which Phase 3 restructures.
3. Baseline measurements (attach numbers to this CCR):
   - `dumpLogs('magic')` after a power-5 explosion session — carve ms entries.
   - Torch place + break in a large open cave, `console.time` around
     `processLightQueue` — the synchronous block-light cost Phase 3 must beat.
   - `pendingLightChunks.size` high-water + watchdog forced/cleared counts across a
     10-minute streaming session (debug overlay / `dumpLogs`).

**ACCEPTANCE GATE:** new/confirmed lighting-checksum test GREEN on current build;
baseline numbers recorded in the As-built section below.

---

# PHASE 1 — Extract the kernel; route the two full-recalc calculators through it

**Goal:** one BFS implementation exists; `calculateChunkSunlight` phase 2 and
`calculateBlockLight`'s BFS become kernel calls. Output byte-identical (D2).

### #1.1 — New kernel function (module scope, near `calculateChunkSunlight`)

**Location:** insert above grep `function calculateChunkSunlight` in `voxEx.html`
**Why:** single-source the propagation rule; injection-friendly per D1.

**After (new code, sketch — implementer finalizes):**
```js
/**
 * Monotone-max light flood fill over a flat [x,y,z,level,...] queue.
 * SINGLE SOURCE for the propagation rule (TER-1/TER-2):
 *   entering a cell costs 1 (travel) + attenTable[enteredBlockId], floored at `floor`
 *   (1 for skylight, 0 for blocklight).
 * Self-contained by design: all state arrives via `ctx` (worker-injectable, D1).
 * @param {number[]} queue - flat quads; consumed from qStart, appended in place
 * @param {number} qStart - starting read index
 * @param {Object} ctx - { getBlockId(x,y,z)->id|undefined, getLight(x,y,z),
 *                         setLight(x,y,z,v), inBounds(x,y,z), attenTable, floor }
 * @returns {number} nodes processed
 */
function propagateLightBFS(queue, qStart, ctx) {
    const { getBlockId, getLight, setLight, inBounds, attenTable, floor } = ctx;
    let qIdx = qStart, processed = 0;
    while (qIdx < queue.length) {
        const lx = queue[qIdx++], ly = queue[qIdx++], lz = queue[qIdx++], level = queue[qIdx++];
        const basePropagated = level > floor ? level - 1 : floor;
        if (basePropagated <= floor) { processed++; continue; }
        for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
            const o = NEIGHBOR_OFFSETS[n];
            const nx = lx + o[0], ny = ly + o[1], nz = lz + o[2];
            if (!inBounds(nx, ny, nz)) continue;
            const nId = getBlockId(nx, ny, nz);
            if (nId === undefined || !IS_TRANSPARENT[nId]) continue;
            const attenuation = attenTable[nId];
            const propagated = attenuation > 0
                ? (basePropagated > attenuation ? basePropagated - attenuation : floor)
                : basePropagated;
            if (propagated <= floor) continue;
            if (propagated > getLight(nx, ny, nz)) {
                setLight(nx, ny, nz, propagated);
                queue.push(nx, ny, nz, propagated);
            }
        }
        processed++;
    }
    return processed;
}
```

**AUDIT NOTE:** `NEIGHBOR_OFFSETS` and `IS_TRANSPARENT` are read as globals here on
purpose — BOTH are already serialized into the worker by `buildChunkWorkerCode`
(grep `NEIGHBOR_OFFSETS = ' + JSON.stringify`). Everything else must come via `ctx`.
Do NOT reference `SUNLIGHT_ATTENUATION`/`BLOCKLIGHT_ATTENUATION` directly inside the
kernel — they are ctx args (the worker only serializes `SUNLIGHT_ATTENUATION`).

**AUDIT FLAG (floor semantics):** for skylight, `propagated <= floor` with floor 1
must NOT skip writing a computed value of exactly 1 in cells currently at… — it does
not: cells are pre-filled to 1 (`skyLight.fill(1)`), so a propagated 1 never beats the
existing value and skipping is byte-identical to the current
`if (finalLight > skyLight[nIdx])` behavior. For blocklight, floor 0 with pre-fill 0:
same argument. This equivalence is WHY Phase 1 can be byte-parity gated; if the
implementer changes pre-fill behavior, the gate will catch it.

### #1.2 — `calculateChunkSunlight` phase 2 → kernel call

**Location:** grep `Phase 2: BFS horizontal propagation` in `voxEx.html`
**Why:** delete copy #1 of the rule.

**Before:**
```js
                let qIdx = 0;
                while (qIdx < queue.length) {
                    const lx = queue[qIdx++];
                    …
                        if (finalLight > skyLight[nIdx]) {
                            skyLight[nIdx] = finalLight;
                            queue.push(nx, ny, nz, finalLight);
                        }
                    }
                }
```

**After:**
```js
                propagateLightBFS(queue, 0, _chunkLocalLightCtx(blocks, skyLight, cs, chunkHeight, SUNLIGHT_ATTENUATION, 1));
```
…where `_chunkLocalLightCtx` is a small helper (also new, also injected) that returns a
ctx of direct-index accessors over the chunk arrays (`idx = nx + (nz << 4) + (ny << 8)`,
same hardcoded-16 shifts the current loop uses — keep the existing
`NOTE: … hardcodes chunkSize 16` comment on the helper).

**AUDIT NOTE (scratch design — closures are banned, and the worker must see the
scratch):** "reuse a module-scope scratch" cannot mean per-call arrow closures over
local arrays (hot-path closure ban). Correct shape: a module-scope scratch object with
mutable fields (`_lightCtxScratch = { blocks: null, light: null, attenTable: null,
floor: 1, height: 0 }`) plus STATIC named accessor functions that read those fields
(`_ctxGetBlockLocal(x,y,z)`, `_ctxGetLightLocal`, `_ctxSetLightLocal`,
`_ctxInBoundsLocal`); `_chunkLocalLightCtx` just assigns the fields and returns the
scratch. All of these run inside the injected `calculateChunkSunlight` on the worker,
so: the named accessor functions join the injection list (#1.4) and the scratch
LITERAL gets its own `meshCode` data line — injected function source does NOT carry
module state with it.

**Verify:** Phase 0 checksum test byte-identical; browser suite worker sunlight
parity GREEN.

### #1.3 — `calculateBlockLight` BFS → kernel call

**Location:** grep `BFS propagation within chunk bounds` in `voxEx.html`
**Why:** delete copy #2. Seeding loop is untouched in this phase (Phase 4 fixes it).

**After:** same shape as #1.2 with `BLOCKLIGHT_ATTENUATION` and floor 0.

### #1.4 — Worker injection

**Location:** grep `WORKER_LIGHTING_ENABLED ? [calculateChunkSunlight]` in
`buildChunkWorkerCode`
**Why:** the worker's injected `calculateChunkSunlight` now calls the kernel + ctx
helper — they must ride along.

**After:**
```js
                    ...(WORKER_LIGHTING_ENABLED ? [propagateLightBFS, _chunkLocalLightCtx,
                        _ctxGetBlockLocal, _ctxGetLightLocal, _ctxSetLightLocal, _ctxInBoundsLocal,
                        calculateChunkSunlight] : []) // VOXEX-CCR-PERF-013 + CCR-LIGHT-004
```
…AND, in the `if (WORKER_LIGHTING_ENABLED)` data block just above (grep
`tables needed by the injected calculateChunkSunlight`), add the scratch declaration
line alongside `SUNLIGHT_ATTENUATION`/`NEIGHBOR_OFFSETS`:
```js
                    meshCode += '    const _lightCtxScratch = { blocks: null, light: null, attenTable: null, floor: 1, height: 0 };\n';
```
(Injected functions arrive as source text — the main thread's module-scope scratch
does not exist in the worker unless declared here. AUDIT-CONFIRMED precedent: this is
exactly how `_aoResult`/`_lightResult`/greedy scratches are provided today.)

**AUDIT NOTE:** the worker does NOT get `calculateBlockLight` (fresh terrain has no
torches — PERF-013 invariant, guarded by the parity test). The kernel referencing
`BLOCKLIGHT_ATTENUATION` would break the worker; D1's ctx-arg rule prevents this.
AUDIT-CONFIRMED: `IS_TRANSPARENT` is serialized UNCONDITIONALLY (grep
`const IS_TRANSPARENT = new Uint8Array(' + JSON.stringify`) and
`NEIGHBOR_OFFSETS`/`SUNLIGHT_ATTENUATION` inside the `WORKER_LIGHTING_ENABLED` block —
the kernel's two global reads are both safe.

**PHASE 1 ACCEPTANCE GATE:** `syntax-check` + `parity-check` GREEN; full browser suite
GREEN including worker sunlight byte-parity and the Phase 0 checksum test
(byte-identical — NO cache bump in this phase); `VOXEX_BUILD` bumped.

---

# PHASE 2 — Route the edge-lighting path through the kernel (semantics fix) + queue cleanup

**Goal:** edge lighting obeys the same physics as everything else; blockLight spreads
inward from borders; the vestigial second queue dies. **`CURRENT_CACHE_VERSION` bump.**

### #2.1 — `propagateEdgeLighting` gains attenuation

**Location:** grep `function propagateEdgeLighting` in `voxEx.html`
**Why:** border import currently charges only −1 (drift; audit finding #2).

**Before (core of the loop):**
```js
                        const sourceSky = sourceSkyLight[sourceIdx];
                        const propagatedSky = sourceSky > 1 ? sourceSky - 1 : 1;
                        if (propagatedSky > targetSkyLight[targetIdx]) {
```

**After:** compute per-cell attenuation of the ENTERED (target) cell exactly as the
kernel does — either inline (it is a 1-step transfer, not a BFS) with the same
`attenuation > 0 ? …` expression, or by seeding the border cells through a 1-step
kernel call. Inline is fine; ADD the TER-1/TER-2 comment referencing the kernel as
the rule's single source. Same fix for the blockLight branch
(`BLOCKLIGHT_ATTENUATION`, floor 0 — WATER costs 1+2 there).

### #2.2 — `propagateLightFromEdgesInward` → kernel + blockLight channel

**Location:** grep `function propagateLightFromEdgesInward`
**Why:** delete copy #6's BFS (which ignores attenuation); fix "skylight only" gap
(audit finding #3).

**After:** keep the existing seed-collection loops (incl. the LIGHT-003 top-of-column
guard) but push seeds for BOTH channels: run the kernel once with
(`skyLight`, `SUNLIGHT_ATTENUATION`, floor 1) and once with
(`blockLight`, `BLOCKLIGHT_ATTENUATION`, floor 0) — blockLight seeds are border cells
with `blockLight > 1`. Keep using the module-scope `_edgeInwardQueue` scratch
(non-reentrant, same as today); reset between the two runs.

**AUDIT NOTE:** the top-of-column dark-column skip is a SKYLIGHT heuristic — do NOT
apply it to blockLight seed collection (torch light exists in dark columns; that's
the point).

### #2.3 — Delete `chunksNeedingLightingUpdate`

**Location:** grep `chunksNeedingLightingUpdate` — AUDIT-CONFIRMED **6 sites**:
declaration; `queueChunkForLightingUpdate`; `processEdgeLightingUpdates` drain;
`purgeChunkData`; the frame-loop gate near `edgeLightingUpdateQueue.size > 20`; and
the DEBUG OVERLAY readout (grep `waitingLightLen`) — the `Wait:` figure in
`EdgeLight: N | Wait: M` (the same readout cited in CCR-LIGHT-001's play-test report).
A 7th match inside a `VOXEX_RECENT_CHANGES` changelog string is historical — leave it.
**Why:** vestigial — drained wholesale every call (audit finding #9).

**After:** `queueChunkForLightingUpdate` adds straight to `edgeLightingUpdateQueue`;
delete the `hasAllNeighborsWithLighting` check AND `hasNeighborWithLighting`
(AUDIT-CONFIRMED: no other callers — only a comment near `[CCR002-verify]` mentions it;
update that comment's "already used by hasNeighborWithLighting" clause). Remove the
drain loop, the purge line, and the `|| chunksNeedingLightingUpdate.size > 0` in the
frame-loop gate. Debug overlay: change the line to `EdgeLight: ${edgeLightQLen}` (drop
`Wait:` — don't print a dead 0 that would mislead the next stall investigation). Also
delete the dead `hasWaterMesh = false` two-liner while in this function (audit
finding #12).

### #2.4 — `CURRENT_CACHE_VERSION` bump

**Location:** grep `CURRENT_CACHE_VERSION` (single source — CACHE-002)
**Why:** #2.1/#2.2 change baked light VALUES near chunk borders; cached lighting must
recalculate (CLAUDE.md Version Constants).

**PHASE 2 ACCEPTANCE GATE:** suite GREEN (checksum test EXPECTED to change — update
the fixture in the same commit, note it in As-built); in-game eyeball: torch behind a
water column at a chunk border reads equally dim from both sides; cave crossing a
border under a leaf canopy shows no brightness step at the seam; no dark 1-cell rim
of neighbor torch light after flying away and back (streaming re-light).

---

# PHASE 3 — Block light joins the task machinery (budgeted, one lifecycle)

**Goal:** `updateBlockLightAt`'s add/remove BFS (copies #4) runs through the same
budgeted task type as sunlight; one finalize path; carve hitch shrinks. VALUES
unchanged (D4).

**Steps (this phase is design-heavy — implementer writes the detailed diff, these are
the constraints):**

1. Generalize `SunlightTask` → `LightTask` with a `channel` field (`'sky'`|`'block'`)
   selecting attenuation table, floor, and get/set accessors. The class's queues,
   visited maps, pressure caps, bailout, and stats stay channel-agnostic (they already
   are). `stepSunlightTask`'s add loop becomes a kernel-shaped step (it may keep its
   own loop for budget-slicing, but the RULE expression must be the shared one —
   extract a tiny `propagateStep` helper from the kernel if needed rather than
   copying the expression).
2. `updateBlockLightAt` keeps its signature and its source-removal special case
   (`wasSource && !isSource` → zero + remove, never `computeNeighborBlockLight` — that
   comment block is load-bearing, keep it) but pushes its add/remove work into a
   `LightTask('block')` instead of running inline loops to completion.
3. `applyLocalizedRelight` finalizes ONE tracker for both channels (it already does —
   the sun task's `onComplete` pattern extends to the block task; both tasks share the
   job's tracker).
4. **Bailout for the block channel** reuses `bailoutToFullRecalc` — which after Phase 4
   recalcs with correct seeding. (Its missing edge re-import is CCR-LIGHT-005, not
   here.)
5. Cap the critical lane per D6: grep `isCriticalLightJob` usage in
   `processLightQueue`; critical jobs get their own per-frame counter
   (`CRITICAL_LIGHT_JOBS_PER_FRAME = 4`) instead of unlimited bypass.
6. Delete the dead `level` read in the remove loop while restructuring it
   (audit finding #12).
7. `pendingLightChunks` refcount SURVIVES this phase untouched (D5) — but every
   mark/clear now flows through exactly two places (task create / task finalize),
   which is what makes the later watchdog demotion safe.

**AUDIT FLAG (ordering):** block-light REMOVE must fully drain before its paired ADD
processes (the two-phase remove-then-readd algorithm assumes it). `SunlightTask`
already enforces remove-before-add inside one task (`removeIndex >= removeQueue.length`
gate in `stepSunlightTask`) — the block channel inherits that for free. Do NOT split
a single edit's remove and add into two separate tasks.

**PHASE 3 ACCEPTANCE GATE:** suite GREEN, checksum test byte-identical to Phase 2
fixture (values unchanged — only timing moved); in-game: torch place/break in a big
cave shows no visible lag in the lit result and no frame hitch (compare Phase 0
baseline `console.time` numbers — record both in As-built); power-5 explosion carve
ms via `dumpLogs('magic')` compared against Phase 0 baseline; 10-minute streaming
soak with zero watchdog force-clears (`dumpLogs` filter `ChunkUpdate`).

---

# PHASE 4 — Shared seeding + hygiene sweep

**Goal:** kill the last mirrored-logic drift and the small inconsistencies.

### #4.1 — `calculateBlockLight` seeds via emission table (D7)

**Location:** grep `const emit = b === FIRE ? fireLevel : (b === TORCH ? torchLevel : 0);`
**Why:** hardcoded TORCH/FIRE ignores `BLOCK_LIGHT_EMISSION` — the next emissive block
lights on placement then goes dark on any full recalc (audit finding #4).

**Before:**
```js
                const torchLevel = getTorchBlockLightLevel();
                const fireLevel = BLOCK_LIGHT_EMISSION[FIRE];
                if (torchLevel <= 0 && fireLevel <= 0) return;
                …
                            const emit = b === FIRE ? fireLevel : (b === TORCH ? torchLevel : 0);
```

**After:**
```js
                const torchLevel = getTorchBlockLightLevel();
                …
                            const emit = b === TORCH ? torchLevel : BLOCK_LIGHT_EMISSION[b];
```
(The early-out becomes a check that the whole emission table is zero AND torchLevel
is 0 — or simply drop the early-out; the seed scan is cheap relative to the BFS.
FIRE keeps working unchanged because `BLOCK_LIGHT_EMISSION[FIRE]` is 0 by config —
fire glows via `torchLightPool`, agent-notes §3.)

**AUDIT NOTE:** this matches `getBlockEmission()` exactly. If a helper can be shared
without closure/hot-path cost, share it; otherwise add lockstep comments at BOTH
sites AND a row to CLAUDE.md's Lockstep Registry (review-enforced group).

### #4.2 — `blockLight` zero-fill consistency

**Location:** grep `blockLight: new Uint8Array(size).fill(1)` and
`blockLight: new Uint8Array(legacySize).fill(1)` and the
`if (!chunk.blockLight) chunk.blockLight = new Uint8Array(chunk.blocks.length).fill(1);`
line — all in `VoxelWorld.setBlock`
**Why:** 0 = "no torch light" everywhere else (audit finding #5).

**After:** `fill(1)` → plain `new Uint8Array(size)` (zero-filled) at all three sites.

**Verify:** checksum test unchanged for existing worlds (these arrays are immediately
recomputed on any real path — the fill only ever mattered for a never-lit synthetic
chunk); grep confirms no other `.fill(1)` blockLight producers.

### #4.3 — Dead-guard sweep

**Location:** grep `?? 0) — kept for parity` / audit finding #12 remnants
**Why:** comments already mark them unreachable; delete or keep per implementer
judgment — zero behavior change either way. Lowest priority; skip if diff noise
outweighs value.

**PHASE 4 ACCEPTANCE GATE:** suite GREEN; place a test emissive block via console
(`BLOCK_CONFIG` temp entry with `lightEmission`) → survives quick save/load and a
forced `rebuildTorchLightingForActiveChunks()` with light intact.

---

## Worker parity

| Function | Status |
|---|---|
| `propagateLightBFS`, `_chunkLocalLightCtx` | NEW — join the `WORKER_LIGHTING_ENABLED` injection list (#1.4). Ctx-args-only rule (D1) means no new hand-maintained globals. |
| `calculateChunkSunlight` | already injected — edit MAIN source only; markers untouched |
| `calculateBlockLight`, `updateBlockLightAt`, `LightTask`, edge functions | main-only — never injected |
| `NEIGHBOR_OFFSETS`, `SUNLIGHT_ATTENUATION` | already serialized into the mesh/lighting worker code — no change |

Run `node tools/parity-check.mjs` after EVERY phase (injection markers + NUM_TILES etc.
must stay green even though this CCR shouldn't touch them).

## Safety Checks (every phase)

- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] `node tools/parity-check.mjs` GREEN
- [ ] Terrain untouched — `terrain-node-checks` not required (run once anyway in Phase 1 to prove no accidental coupling)
- [ ] `node tools/run-browser-tests.mjs` GREEN (authoritative; includes worker sunlight byte-parity + Phase 0 checksum test)
- [ ] No duplicate/shadowed identifiers (grep `propagateLightBFS`, `LightTask`, `_chunkLocalLightCtx` before declaring)
- [ ] No new settings (none planned; D6's cap is a const, not a setting)
- [ ] No unbatched per-frame work added; kernel ctx objects are module-scope scratch, not per-call allocations
- [ ] Version constants per "Version impact" (cache bump in Phase 2 ONLY)
- [ ] CLAUDE.md Lighting Engine section + agent-notes §3 updated in the same commit as each phase that stales them; #4.1 adds a Lockstep Registry row if the seeding helper isn't shared

## Audit record (2026-07-10, build 2026-07-09.4)

Every Before snippet, anchor, and load-bearing claim re-verified against the live
file (Read/Grep tools — authoritative per agent-notes §7; bash mount never trusted).

**Verified correct as drafted:**

- **#1.1 byte-parity equivalence (the claim Phase 1's "no cache bump" rests on):**
  - *Skylight:* `skyLight.fill(1)` precedes phase 2; live loop computes
    `finalLight = propagated > 1 ? propagated : 1` then `finalLight > skyLight[nIdx]`.
    A finalLight of 1 can never beat the ≥1 pre-fill, so the kernel's
    `propagated <= floor → skip` is behavior-identical. Entry clamp identical:
    `basePropagated > attenuation ? basePropagated - attenuation : 1` ≡ kernel with
    floor 1.
  - *Blocklight:* `blockLight.fill(0)`; live loop uses `level > 1 ? level - 1 : 0`
    vs kernel's `level > floor(=0) ? level - 1 : floor`. Checked the only divergent
    input, level = 1: live → 0, kernel → 1−1 = 0. Equal; then `<= 0` skips in both.
    Attenuation clamp identical with floor 0.
  - Both loops are monotone-max flood fills → visitation order can't change the
    fixpoint (precedent comment confirmed at grep `output is byte-identical` in
    `propagateLightFromEdgesInward`).
- **Worker globals:** `IS_TRANSPARENT` serialized unconditionally;
  `SUNLIGHT_ATTENUATION` + `NEIGHBOR_OFFSETS` inside the `WORKER_LIGHTING_ENABLED`
  block; injection list line matches #1.4's Before exactly
  (`...(WORKER_LIGHTING_ENABLED ? [calculateChunkSunlight] : [])`).
- **Before snippets** #1.2, #1.3, #2.1, #4.1 match live code verbatim (elisions aside).
- **#4.2:** exactly three `blockLight …fill(1)` sites, all in `VoxelWorld.setBlock`;
  no other producers file-wide.
- **Phase 3 ordering claim:** `stepSunlightTask`'s add loop is gated on
  `task.removeIndex >= task.removeQueue.length` — remove-before-add is enforced
  in-task as stated. Dead `level` read in the remove loop confirmed (declared,
  index-advanced, never referenced).
- **`_edgeInwardQueue`** exists at module scope (non-reentrant reuse OK for #2.2's
  two sequential kernel runs).
- **Suite coverage:** point-value calculator tests + worker byte-parity test exist
  (anchors now cited in Phase 0); NO full-array checksum test and NO incremental
  edit-script test exist — Phase 0 step 2 adds them, and it is genuinely load-bearing
  for Phase 3.

**Corrections applied during audit (already folded into the text above):**

1. **#2.3 site count 5 → 6:** the debug overlay's `Wait:` readout
   (grep `waitingLightLen`) also references the deleted set — drop the segment rather
   than print a dead 0. A `VOXEX_RECENT_CHANGES` string also matches — historical,
   leave. `hasNeighborWithLighting` deletion confirmed safe (no other callers) but a
   comment near `[CCR002-verify]` cites it — update that comment.
2. **#1.2/#1.4 worker-scratch gap:** "module-scope scratch ctx" as originally worded
   would either allocate closures per call (banned) or reference main-thread module
   state the worker never receives. Fixed: static named accessor functions + mutable
   scratch fields; accessors join the injection list, scratch literal gets a
   `meshCode` data line (precedent: `_aoResult`/`_lightResult`).
3. **Phase 0 rewritten** from "confirm whether tests exist" to the audited fact list
   plus the two specific missing tests.

**Residual risks the implementer should hold in mind (no spec change needed):**

- `LightTask` visited maps allocate a `Uint8Array(chunkVolume)` (80 KB) per touched
  chunk per task — fine for sunlight today, but Phase 3 multiplies task count
  (every block-light edit becomes a task). If Phase 3 soak shows GC pressure, pool
  the visit arrays (`Uint8ArrayPool` exists) — do not redesign mid-phase.
- Phase 2 changes what the incremental path later "sees" at borders: after the
  cache bump, old saves relight on load — expect a one-time longer first load per
  world; mention in the build's recent-changes entry.

## As-built (fill in AFTER implementation)

- **Phase 0 (step 2) — DONE 2026-07-10, build `2026-07-10.1`** (Sonnet subagent, Fable-reviewed; sandbox session, uncommitted — commit from Windows):
  - `tools/voxex-tests.html`: two new suites (grep `lighting: full-array checksum` / `lighting: incremental edit-script`), 3 tests, local `fnv1aChecksum` helper, fixed synthetic chunk (stone+cave+chimney, 3-deep water pool, 4-layer leaf canopy, torch in cave). Captured checksums: sunlight `1821834511`, blockLight `725244334`; edit-script sky `568040165` / block `362651077`. Edit-script drives `updateSunlightAt`/`updateBlockLightAt`/`processSunlightQueue` directly (tracker null, primeColumn per the real caller rule) against a center chunk + 4 flat neighbors registered via `chunkDataPool.chunks.set`; asserts queue quiescence; cleans up its chunks.
  - `voxEx.html`: seam export group (grep `CCR-LIGHT-004 Phase 0: incremental lighting path`) — `updateSunlightAt`, `updateBlockLightAt`, `processSunlightQueue`, `processLightQueue`, `lightUpdateQueueLength`/`sunlightWorkQueueLength` getters. `VOXEX_BUILD` → `2026-07-10.1` + recent-changes entry.
  - Gates: syntax + parity GREEN; browser suite **382/382** headless (379 pre-existing + 3 new). No git run.
  - Deviation: none on test design. Environment incident: Edit-tool edits left both files' bash-mount views truncated near EOF; recovered by splicing the correct tail onto the mount view (verified byte-correct via Read tools + full suite after). Lessons recorded in agent-notes §7.
- **Phase 0 (step 3) baselines — PENDING (Kandler, in-game):** <carve ms via dumpLogs('magic') / torch place+break console.time / pendingLight high-water + watchdog counts>
- Phase 1: <deviations>
- Phase 2: <checksum fixture delta note; in-game seam observations>
- Phase 3: <before/after hitch numbers; soak result>
- Phase 4: <deviations>
- Follow-ups spawned: CCR-LIGHT-005 (full-recalc edge re-import), heightmap CCR (only if numbers demand), watchdog demotion (after soak per D5)

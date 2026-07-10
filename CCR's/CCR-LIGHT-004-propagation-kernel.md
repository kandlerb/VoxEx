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
| 3 | Incremental sunlight add/remove | `class SunlightTask` / `stepSunlightTask` | budgeted + pressure-managed; remove path correct, but **the ADD loop skips entered-cell attenuation** (charges only −1 travel — found in Phase 3 design review, 2026-07-10; fixed in Phase 3B) |
| 4 | Incremental block-light add/remove | `function updateBlockLightAt` | remove path correct, but **synchronous and unbudgeted** — no caps, no bailout, no task queue — and **the ADD loop skips entered-cell attenuation** (same drift as #3; fixed in Phase 3B) |
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
| D8 | Incremental-add attenuation fix is its OWN gate (Phase 3B) | Phase 3A moves block light into the task machinery with values BYTE-IDENTICAL (bug preserved); Phase 3B then fixes both channels' ADD loops to charge entered-cell attenuation via a shared rule helper, with its own fixture update + `CURRENT_CACHE_VERSION` bump | never mix "provably no behavior change" and "deliberate behavior change" in one gate — that's what made Phases 1 and 2 independently verifiable |
| D9 | Seam-name stability | Exported keys on `window.VoxEx` never change once a test uses them (`updateSunlightAt`, `updateBlockLightAt`, `processSunlightQueue`, `sunlightWorkQueueLength`, ...) — internal renames hide behind the same export keys | Phase 0 fixtures are the byte-parity instrument; breaking their imports invalidates the instrument mid-experiment |

## Version impact

- `VOXEX_BUILD`: bump per phase + `VOXEX_RECENT_CHANGES` entry citing CCR-LIGHT-004 phase (always)
- `TERRAIN_GEN_VERSION`: **no** (no terrain output change in any phase)
- `CURRENT_CACHE_VERSION`: **Phase 2 — yes** (6→7, SHIPPED); **Phase 3B — yes** (7→8: incremental-add attenuation fix changes light values baked into edited/cached chunks; relight-on-load corrects them). Phases 1/3A/4 **no** (byte-identical / scheduling-only / seeding-of-blocks-that-don't-exist-yet + zero-fill fix)
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

### #2.5 — NEW edge-pipeline characterization test (correction from Phase 1 review)

The Phase 0 checksum fixtures cover ONLY the calculators and the incremental path —
neither is touched by this phase, so they must pass UNCHANGED (editing them in
Phase 2 is as forbidden as it was in Phase 1; an earlier revision of this gate
wrongly said they were "expected to change"). The edge functions have no
characterization coverage at all; add it here, capturing the POST-change
(corrected) physics:

- Seam: export `propagateEdgeLighting` and `propagateLightFromEdgesInward` (both
  pure on their arguments — no global `chunks` access) in a
  `// --- CCR-LIGHT-004 Phase 2 ---` group.
- Test (new describe in `tools/voxex-tests.html` next to the Phase 0 suites): two
  synthetic chunks sharing a border — water column and leaf layer straddling the
  target's edge, torch near the source chunk's edge; run both calculators on both
  chunks, then `propagateEdgeLighting` (one edge, both channels) +
  `propagateLightFromEdgesInward`; FNV-1a checksum the target's `skyLight` AND
  `blockLight`, hard-code captured values with the standard characterization
  comment. Also assert two hand-computed spot values (one water cell paying
  1 + attenuation for sky, one for block) so the test documents the rule, not
  just the hash.

**PHASE 2 ACCEPTANCE GATE:** suite GREEN with the four Phase 0 checksums UNCHANGED
and the new edge characterization test(s) green; in-game eyeball: torch behind a
water column at a chunk border reads equally dim from both sides; cave crossing a
border under a leaf canopy shows no brightness step at the seam; no dark 1-cell rim
of neighbor torch light after flying away and back (streaming re-light).

---

# PHASE 3 — Block light joins the task machinery (split 3A/3B per D8)

> **Expanded 2026-07-10 (Fable design pass)** from a constraints list into the
> prescriptive plan below, after the design review found drift #7 (both incremental
> ADD loops skip entered-cell attenuation — see Problem table rows 3/4 and the audit
> addendum). 3A is the mechanical move (byte-identical, bug preserved); 3B is the
> deliberate semantics fix with its own fixtures and cache bump. Never merge them.

## PHASE 3A — mechanical: one task type, both channels, values byte-identical

**Goal:** `updateBlockLightAt`'s inline BFS runs through the same budgeted task
machinery as sunlight; one finalize path; the critical lane gets capped (D6). Light
VALUES at quiescence unchanged — all existing checksum fixtures must pass untouched,
and **no test-file edits are allowed in 3A**.

**Why values survive the move:** the two channels are independent (separate arrays;
block reads `blockLight`+`blocks`, sky reads `skyLight`+`blocks`; `blocks` doesn't
change during light processing), so interleaving their work across frames commutes;
within a task, remove-before-add is preserved (see AUDIT FLAG below); and the block
channel keeps its exact per-cell rules (bug included, per D8).

### #3A.1 — Renames (internal only; seam export KEYS frozen per D9)

- `class SunlightTask` → `class LightTask`; constructor `(x, y, z, oldId, newId,
  tracker, channel)` storing `this.channel = channel;`,
  `this.floor = channel === 'sky' ? 1 : 0;`, and `this.dedupe = channel === 'sky';`
  (see #3A.2 for why block must NOT dedupe).
- `sunlightWorkQueue` → `lightWorkQueue` (sites: declaration, `ensureQueued`,
  `processSunlightQueue`, the watchdog's `noLightWork` check — grep
  `sunlightWorkQueue.length === 0` — and the seam getter BODY; the exported key
  `sunlightWorkQueueLength` keeps its name with a comment).
- `stepSunlightTask` → `stepLightTask`; `finalizeSunlightTask` → `finalizeLightTask`
  (callers: `updateSunlightAt`, `processSunlightQueue`, `bailoutToFullRecalc`).
- `processSunlightQueue`, `updateSunlightAt`, `updateBlockLightAt` KEEP their names
  (seam-exported); update `processSunlightQueue`'s comment: it drains
  `lightWorkQueue`, both channels.
- `updateSunlightAt`'s construction site: `new LightTask(x, y, z, oldId, newId,
  tracker, 'sky')`.
- After all renames: grep `SunlightTask`, `sunlightWorkQueue`, `stepSunlightTask`,
  `finalizeSunlightTask` → remaining hits must be comments/changelog strings only.
  Update CLAUDE.md's Classes table row in the same commit.

### #3A.2 — `LightTask` semantics knobs (the two places the channels really differ)

**Dedup:** sky tasks use the per-chunk `visited` Uint8Arrays (existing `resolveVisit`
behavior). The old block code had NO visited dedup — and adding it is NOT
value-neutral: `setLight` happens at the propagation site but the queue insertion is
what re-propagates, so deduping a re-raised cell can strand its neighbors at
stale-lower values. (Sunlight lives with this today; block must not inherit it in a
byte-identical phase.) So: when `!this.dedupe`, `resolveVisit` skips the visitMap
allocation/check entirely but KEEPS the Y-bounds check, `touchedChunks.add`, and
`tracker.mark`. Bonus: block tasks allocate zero 80 KB visit arrays, which
neutralizes the GC residual-risk for the common case.

*(Bounds-check note: the old block loop tolerated out-of-Y-range walk — `getBlock`
returns AIR out of range, `setBlockLight` no-ops — a bounded useless walk. Adding the
bounds check cannot change values: any propagation re-entering range from a virtual
out-of-range cell is strictly dimmer than the in-range path that fed it.)*

**Chunk marking:** the old `markBlockLightChunk` marked the tracker for EVERY
scanned neighbor — before the transparency/loaded checks. Preserve exactly: new
module helper `markLightChunkAt(task, x, z)` (computes the chunk key, calls
`task.tracker?.mark(key)`; does NOT touch `touchedChunks` — caps must keep growing
only via real enqueues) — called in the block branches at the same pre-check position
the old code called `markBlockLightChunk`. Grep-before-declare.

### #3A.3 — `stepLightTask` channel branches

Both loops read all four queue entries (the previously-dead `level` read becomes
live — the block remove branch uses it; audit finding #12 resolves itself).

**Remove loop** (`while (!task.bailedOut && task.removeIndex < ...)`), per neighbor:

- sky branch: existing code verbatim (transparent check → `nLight <= 1` skip →
  `computeNeighborSunlight` → set/enqueue on `<`/`>`).
- block branch (verbatim from `updateBlockLightAt`'s remove loop):
  `markLightChunkAt(task, nx, nz);` FIRST; then loaded/transparent checks;
  `nLight = clampBlockLight(getBlockLight(...))`; `if (nLight === 0) continue;`
  `if (nLight < level) { setBlockLight(nx, ny, nz, 0); task.enqueueRemove(nx, ny, nz, nLight); }
  else { const desired = Math.max(computeNeighborBlockLight(nx, ny, nz), getBlockEmission(nId));
  if (desired < nLight) { setBlockLight(...desired); task.enqueueRemove(...nLight); }
  else if (desired > nLight) { task.enqueueAdd(...desired); } }`

**Add loop**, per neighbor:

- sky branch: existing code verbatim (`propagated = level > 1 ? level - 1 : 1` — the
  missing-attenuation bug stays in 3A, per D8).
- block branch: `markLightChunkAt` first; `propagated = level > 0 ? level - 1 : 0;`
  write+enqueue on `propagated > nLight` (bug stays likewise).

Branch on `task.channel === 'block'` inline — two readable branches, no function
indirection in the hot loop.

### #3A.4 — `updateBlockLightAt` rewrite

Keeps its signature and NOW RETURNS the task. The `wasSource`/`isSource`/transparent
decision tree at the top stays verbatim (the "don't compute from neighbors when
removing a source" comment is load-bearing); its seeds go to
`task.enqueueRemove`/`task.enqueueAdd` instead of local arrays; the inline add/remove
loops are DELETED (they now live in `stepLightTask`'s block branches). Tail mirrors
`updateSunlightAt`: initial burst `stepLightTask(task, Math.floor(
SUNLIGHT_STEPS_PER_FRAME * 0.5))`, then `ensureQueued()` + `checkPressure()` if not
done, return task. The old local `markBlockLightChunk` closure is deleted
(superseded by `markLightChunkAt`); the initial `markBlockLightChunk(x, z)` call
becomes `tracker?.mark(<this chunk's key>)` exactly as before.

### #3A.5 — `applyLocalizedRelight` finalizes when BOTH tasks complete

```js
const sunTask = updateSunlightAt(x, y, z, prevId, nextId, tracker, job.primeColumn);
const blockTask = updateBlockLightAt(x, y, z, prevId, nextId, tracker);
let pending = 0;
const onTaskDone = () => { pending--; if (pending <= 0) finalizeLightTracker(tracker); };
if (sunTask && !sunTask.done && !sunTask.bailedOut) { pending++; sunTask.onComplete = onTaskDone; }
if (blockTask && !blockTask.done && !blockTask.bailedOut) { pending++; blockTask.onComplete = onTaskDone; }
if (pending === 0) finalizeLightTracker(tracker);
```

(The existing code already allocates an `onComplete` closure here — per-job, not
per-cell, so this stays within the hot-path rules. Keep the explanatory comment
about the removed redundant `calculateBlockLight()` call.)

**Bailout:** block tasks inherit `bailoutToFullRecalc` unchanged — it already recalcs
BOTH channels over the 3×3 neighborhood and fires `finalizeLightTask` → `onComplete`.
Its known cross-chunk truncation is CCR-LIGHT-005 scope, and block-channel bailouts
are no worse than today's sunlight bailouts.

### #3A.6 — Critical-lane cap (D6)

New const next to `MAX_LIGHT_UPDATES_PER_FRAME` (grep):
`const CRITICAL_LIGHT_JOBS_PER_FRAME = 4; // D6 (CCR-LIGHT-004 3A): was an UNLIMITED bypass`.
In `processLightQueue`: add `let criticalProcessed = 0;`; replace the break condition:

```js
if (!critical && processed >= limit) break;
if (critical && criticalProcessed >= CRITICAL_LIGHT_JOBS_PER_FRAME && processed >= limit) break;
```

…and `if (critical) criticalProcessed++;` beside `processed++`. (Criticals beyond
the cap may still consume the ordinary budget; the queue stays FIFO — a capped
critical head simply waits a frame, same as any over-budget job.)

**AUDIT FLAG (ordering):** block-light REMOVE must fully drain before its paired ADD
processes (the two-phase remove-then-readd algorithm assumes it). `stepLightTask`'s
structure (add loop gated on `removeIndex >= removeQueue.length`) enforces this
inside one task. Do NOT split a single edit's remove and add into two tasks.

**PHASE 3A ACCEPTANCE GATE:** suite GREEN with ALL existing checksum fixtures
byte-identical (four Phase 0 values + the Phase 2 edge pair) and zero test-file
edits; worker parity GREEN (nothing injected changed — confirm, don't assume);
in-game: torch place/break in a big cave shows no visible lag in the lit result and
no frame hitch vs the Phase 0 baseline numbers; power-5 explosion carve ms via
`dumpLogs('magic')` vs baseline; 10-minute streaming soak with zero watchdog
force-clears (`dumpLogs` filter `ChunkUpdate`). `VOXEX_BUILD` bump; NO cache bump.

## PHASE 3B — incremental ADD loops charge entered-cell attenuation (drift #7 fix)

**Goal:** the last two rule copies converge on the kernel rule. Deliberate values
change: `CURRENT_CACHE_VERSION` 7 → 8.

### #3B.1 — Shared rule helper (pure extraction from the kernel)

Next to `propagateLightBFS`:

```js
/** Entered-cell cost of the propagation rule — see propagateLightBFS. */
function lightRuleEnter(traveled, attenuation, floor) {
    return attenuation > 0 ? (traveled > attenuation ? traveled - attenuation : floor) : traveled;
}
```

Refactor the kernel's inline expression to call it (byte-identical extraction — the
worker parity test gates this), and add `lightRuleEnter` to the
`WORKER_LIGHTING_ENABLED` injection list.

### #3B.2 — Apply in `stepLightTask`'s add branches

Constructor gains `this.attenTable = channel === 'sky' ? SUNLIGHT_ATTENUATION :
BLOCKLIGHT_ATTENUATION;` (added now, not in 3A — 3A must not carry unused fields
that tempt early use). Sky add branch: `const traveled = level > 1 ? level - 1 : 1;
const propagated = lightRuleEnter(traveled, task.attenTable[nId], 1);` — write
condition `propagated > nLight` unchanged (a floor-value result never beats the ≥1
sky pre-fill / ≥0 block default, same argument as Phase 1's AUDIT FLAG). Block add
branch: same with `traveled = level > 0 ? level - 1 : 0` and floor 0. The REMOVE
branches need nothing — their `computeNeighbor*` desired-value queries were always
attenuation-aware.

### #3B.3 — Fixtures + new spot test

- The edit-script checksums (`568040165` / `362651077`) are EXPECTED to change —
  re-capture and update in the same commit. If either does NOT change, the script
  doesn't exercise attenuated adds — extend it until it does (that's a test gap,
  not a pass).
- Full-recalc (`1821834511` / `725244334`) and edge-pipeline fixtures MUST NOT
  change (those paths are untouched).
- New spot test beside the edit-script suite: place a TORCH adjacent to the water
  pool, drain to quiescence, assert hand-computed values — first water cell
  `= emission − 1 − 2`, second `= first − 3`; plus one sky case (break a block so
  light enters water horizontally, cell pays `1 + 1`). Actuals must match hand
  computation before baking (Phase 2 discipline).

### #3B.4 — Version impact

`CURRENT_CACHE_VERSION` 7 → 8 (comment cites CCR-LIGHT-004 3B — edited chunks carry
over-bright baked light from the old add rule; relight-on-load corrects them).
`VOXEX_BUILD` bump + recent-changes entry noting the one-time relight.

**PHASE 3B ACCEPTANCE GATE:** suite GREEN; ONLY the edit-script + new spot fixtures
changed, every delta explained by hand computation; worker parity GREEN (kernel was
touched); in-game: a torch placed beside water / under a leaf canopy reads dimmer
through the medium IMMEDIATELY (previously only after a reload or full recalc
corrected it).

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

**Addendum (2026-07-10, Phase 3 design pass) — drift #7, missed by the original
audit:** the incremental ADD loops in BOTH channels charge only the −1 travel cost
and skip the entered cell's attenuation (as of build 2026-07-10.3: grep
`const propagated = level > 1 ? level - 1 : 1;` in `stepSunlightTask`'s add loop and
`const propagated = level > 0 ? level - 1 : 0;` in `updateBlockLightAt`'s add loop —
after 3A these live in `stepLightTask`'s two add branches) — while the same
functions' REMOVE paths (via the
attenuation-aware `computeNeighbor*` queries) and both full-recalc calculators apply
it. Net effect: light added incrementally through water/leaves/ICE is too bright
until some later full recalc corrects it. The original audit marked rows 3/4
"correct" — table corrected, fix scheduled as Phase 3B with its own gate (D8). The
original residual-risk note below about visit-array GC pressure is addressed by
3A's `dedupe=false` design for the block channel (no visit arrays allocated at all).

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
- **Phase 1 — DONE 2026-07-10, build `2026-07-10.2`** (Sonnet subagent, Fable-reviewed; sandbox session, uncommitted — commit from Windows):
  - Kernel block inserted above `calculateChunkSunlight` (grep `UNIFIED LIGHT-PROPAGATION KERNEL`): `propagateLightBFS` + `_chunkLocalLightCtx` + `_lightCtxScratch` + 4 static accessors (`_ctxGetBlockLocal`/`_ctxGetLightLocal`/`_ctxSetLightLocal`/`_ctxInBoundsLocal`). Ctx helper signature finalized as `(blocks, light, attenTable, floor, height)` — the sketch's `cs` param dropped (index math hardcodes 16; noted deviation, accepted).
  - `calculateChunkSunlight` phase-2 loop and `calculateBlockLight` BFS loop replaced with kernel calls (grep `propagateLightBFS(queue, 0, _chunkLocalLightCtx` — exactly 2 call sites). Seeding loops untouched.
  - Worker: `_lightCtxScratch` data line added to the `WORKER_LIGHTING_ENABLED` block; injection list now kernel + helper + 4 accessors + `calculateChunkSunlight`.
  - Gates: syntax + parity GREEN; terrain-node-checks GREEN on seeds 1337/42/9001; suite **382/382** with all four Phase 0 checksums UNCHANGED (byte-parity confirmed) incl. worker skyLight parity. No cache/terrain/settings bumps, per plan.
  - Environment incidents: near-EOF mount truncation recurred (caught by syntax-check, spliced tail recovery). Review caught a recovery defect: the re-appended 80-line tail was LF-only in an otherwise-CRLF file — normalized back to CRLF (`tr -cd '\r' | wc -c` == line count is the check), suite re-run green. Lesson: tail-splice recovery MUST preserve CRLF.
  - NOTE for next phase: voxEx.html was bash-written this session — per agent-notes §7 do NOT Edit-tool it again in the same session; run Phase 2 in a FRESH session (or native Windows Claude Code).
- Phase 1: no deviations from the plan beyond the ctx-helper param order noted above (dropped the sketch's redundant `cs` param — index math hardcodes 16 either way).
- **Phase 2 — DONE 2026-07-10, build `2026-07-10.3`** (Sonnet subagent; sandbox session, uncommitted — commit from Windows):
  - `voxEx.html` (14 replacements, all via bash-mount Python edits per agent-notes §7, zero Edit-tool use on voxEx.html/tools/voxex-tests.html this session): `propagateEdgeLighting`'s sky/block branches now compute `traveledX = source > 1 ? source - 1 : floor` then apply `SUNLIGHT_ATTENUATION`/`BLOCKLIGHT_ATTENUATION` of `targetBlocks[targetIdx]` (the ENTERED cell) with the kernel's `atten > 0 ? (traveled > atten ? traveled - atten : floor) : traveled` expression, citing `propagateLightBFS` as the rule's single source. `propagateLightFromEdgesInward` rewritten: same 4-edge sky seed loops (incl. the LIGHT-003 top-of-column guard) now feed one `propagateLightBFS(queue, 0, _chunkLocalLightCtx(blocks, skyLight, SUNLIGHT_ATTENUATION, 1, chunkHeight))` call; a NEW second pass reseeds the same 4 edges from `chunk.blockLight` (guarded `if (chunk.blockLight)`, NO top-of-column guard — audited as skylight-only) and calls the kernel again with `BLOCKLIGHT_ATTENUATION`/floor 0. Deleted `chunksNeedingLightingUpdate` at all 6 confirmed sites (declaration; `queueChunkForLightingUpdate` — now adds straight to `edgeLightingUpdateQueue`, with `hasAllNeighborsWithLighting` + the now-orphaned `hasNeighborWithLighting` helper removed, confirmed zero other callers; the wholesale drain loop atop `processEdgeLightingUpdates`; the `purgeChunkData` cleanup line; the frame-loop gate's `|| chunksNeedingLightingUpdate.size > 0`; the debug overlay's `Wait: N` segment, now bare `EdgeLight: N`). Reworded the `[CCR002-verify]` comment's dangling `hasNeighborWithLighting` reference. Deleted the dead `const hasWaterMesh = false;` two-liner (folded into `hasTerrainMesh`). `CURRENT_CACHE_VERSION` 6 → 7 with a new `v7:` comment line. `VOXEX_BUILD` → `2026-07-10.3` + a `VOXEX_RECENT_CHANGES` entry. Seam: added `propagateEdgeLighting, propagateLightFromEdgesInward` to the `window.VoxEx` export under a new `CCR-LIGHT-004 Phase 2` group.
  - `tools/voxex-tests.html`: one new describe (`lighting: edge-pipeline characterization (CCR-LIGHT-004 Phase 2)`), one test. Two synthetic 16×320-column chunks (stone floor to y=99): target has a 3-deep WATER pool (y100-102) + 2-layer LEAVES canopy (y103-104) at its receiving edge (lx=15, lz=8); source has one TORCH at (lx=2, ly=100, lz=8), 2 cells in from the shared border (lx=0). Ran both calculators on both chunks, then `propagateEdgeLighting(target, source, 15, 0, 'x', 16, 320)` + `propagateLightFromEdgesInward(target, 16, 320)`. Hand-computed spot values ALL PASSED ON THE FIRST HEADLESS RUN (no implementation bugs found): `source.blockLight` at the border = 13 (torch 15, 2 air steps); post-edge-transfer `target.skyLight[15,100,8]` = 13 (15−1 travel−1 WATER sky atten, not the pre-fix 14); post-edge-transfer `target.blockLight[15,100,8]` = 10 (13−1 travel−2 WATER block atten, not the pre-fix 12); pre-inward-spread `target.blockLight` at lx=14/13 = 0 (pre-fix ceiling); post-inward-spread lx=14 = 9, lx=13 = 8 (proves the 2+-cell inward spread fix — pre-fix, blockLight never left the single imported border cell). Checksum fixture captured via the documented placeholder→headless-run→bake-in workflow (2 intermediate runs, one per checksum since the first failing `expect` in the `it` short-circuits the rest): `skyChecksum` = `1889740755`, `blockChecksum` = `787091577`.
  - Gates: `syntax-check` + `parity-check` GREEN. CRLF invariant (`tr -cd '\r' | wc -c == wc -l`) held on both files after every edit — no truncation/desync incident this session (the bash-mount-only edit method with `count()==1` uniqueness asserts avoided the Edit-tool cache-desync class of failure entirely). Full browser suite **383/383** headless (382 pre-existing + 1 new); the four Phase 0 checksums (`1821834511`/`725244334`/`568040165`/`362651077`) confirmed UNCHANGED and passing.
  - In-game seam observations: NOT performed this run (sandboxed, headless-only environment per agent-notes §7 — no live renderer). The acceptance gate's in-game eyeball items (torch-behind-water-at-a-border reads equally dim from both sides; cave-under-canopy-crossing-a-border shows no brightness step; no dark 1-cell rim of neighbor torch light after streaming re-light) are OPEN, for the user's own hands-on session.
  - Deviations: none from the CCR's #2.1-#2.5 text. No git operations performed (sandbox note honored).
- **Phase 3A — DONE 2026-07-10, build `2026-07-10.4`** (Sonnet subagent; sandbox session, uncommitted -- commit from Windows):
  - `voxEx.html` (18 replacements, all via bash-mount Python edits per agent-notes §7, zero Edit-tool use on voxEx.html/tools/voxex-tests.html this session): `class SunlightTask` -> `class LightTask`, constructor gains a `channel` param (`'sky'`|`'block'`) storing `this.channel`/`this.floor` (`1`/`0`)/`this.dedupe` (`true` only for `'sky'`); `sunlightWorkQueue` -> `lightWorkQueue` (declaration, `ensureQueued`, `processSunlightQueue`'s loop, the watchdog's `noLightWork` check); `stepSunlightTask` -> `stepLightTask`; `finalizeSunlightTask` -> `finalizeLightTask`. Seam-exported keys unchanged per D9 (`updateSunlightAt`, `updateBlockLightAt`, `processSunlightQueue`, `sunlightWorkQueueLength` -- the getter body now reads `lightWorkQueue.length` under the frozen key name). `resolveVisit` gained the `dedupe` branch (#3A.2): when `!this.dedupe` it returns the chunk key right after the Y-bounds check + `touchedChunks.add` + `tracker.mark`, skipping the 80 KB visit-array allocation/check entirely -- block tasks never allocate one. New module helper `markLightChunkAt(task, x, z)` (tracker-mark only, no `touchedChunks`) replaces the old per-call `markBlockLightChunk` closure, called at the identical pre-check position in both of `stepLightTask`'s channel branches (#3A.3) -- copied verbatim from `updateBlockLightAt`'s old inline remove/add loops, missing-attenuation bug in the add branches preserved on purpose (Phase 3B's job, per D8). `updateBlockLightAt` rewritten (#3A.4): the `wasSource`/`isSource`/transparent decision tree is untouched (load-bearing comment intact), seeds now go through `task.enqueueAdd`/`enqueueRemove` instead of local arrays, the inline loops are gone (they live in `stepLightTask` now), tail mirrors `updateSunlightAt` (initial burst `stepLightTask(task, SUNLIGHT_STEPS_PER_FRAME*0.5)`, then `ensureQueued()`+`checkPressure()` if not done), function now **returns the task**. `applyLocalizedRelight` (#3A.5) holds both tasks and only finalizes the tracker once both are done/bailed via a small completion refcount, matching the CCR's exact snippet. `processLightQueue` (#3A.6) gained `const CRITICAL_LIGHT_JOBS_PER_FRAME = 4` and a second break condition (`critical && criticalProcessed >= cap && processed >= limit`) plus `criticalProcessed++` beside `processed++` -- exactly the D6 text. Two doc comments (`OPTIMIZATION AUDIT: updateSunlightAt / updateBlockLightAt`, and the `ARCHITECTURE NOTE` above `calculateChunkSunlight`) updated from `SunlightTask` to `LightTask` for accuracy (not required by the CCR, done for consistency -- both are live doc comments, not changelog strings). `VOXEX_BUILD` -> `2026-07-10.4` + a `VOXEX_RECENT_CHANGES` entry. `CLAUDE.md` updated in the same pass (Lighting Engine bullets, Classes table row, Development Guidelines item 7, Common Search Patterns line) via the same bash-Python method for consistency, even though CLAUDE.md wasn't bash-written this session.
  - Grep confirmation: `SunlightTask`/`stepSunlightTask`/`finalizeSunlightTask` have zero remaining hits outside historical `VOXEX_RECENT_CHANGES` changelog strings and two explanatory comments that explicitly reference the old name for context (`// Phase 3A: renamed from SunlightTask...`, `// Sky branches are byte-identical to the old stepSunlightTask...`). `sunlightWorkQueue` survives ONLY as the frozen seam property name `sunlightWorkQueueLength` (D9) plus a comment explaining the internal rename. `class LightTask`/`function stepLightTask`/`function markLightChunkAt`/`function finalizeLightTask` each declared exactly once (grep-before-declare honored). Worker injection list (grep `WORKER_LIGHTING_ENABLED ?`) unchanged -- still only `propagateLightBFS`/`_chunkLocalLightCtx`/the 4 ctx accessors/`calculateChunkSunlight`; nothing touched in this phase is injected, confirmed.
  - Gates: `tr -cd '\r' < voxEx.html | wc -c` == `wc -l` held throughout (no truncation/desync incident -- the bash-mount-only edit method with `count()==1` uniqueness asserts continues to avoid the Edit-tool cache-desync class of failure). `syntax-check` + `parity-check` GREEN. Full browser suite **383/383** headless -- IDENTICAL count to the post-Phase-2 baseline (zero new tests, as required -- 3A explicitly forbids test-file edits), confirming all six existing checksum fixtures (Phase 0's sunlight `1821834511`/blockLight `725244334`/edit-script-sky `568040165`/edit-script-block `362651077`, Phase 2's edge-pipeline sky `1889740755`/block `787091577`) passed byte-identical without modification. No `CURRENT_CACHE_VERSION`/`TERRAIN_GEN_VERSION`/`SETTINGS_VERSION` bump, per plan.
  - Deviations from the CCR text: none of substance. Minor: the explicit `tracker?.mark(...)` call retained at the top of `updateBlockLightAt` per the CCR's own instruction is technically redundant with `LightTask`'s constructor already marking the same base chunk key -- kept anyway exactly as directed (harmless, `mark()` is idempotent). Two extra doc-comment renames (noted above) beyond the CCR's explicit scope, done for accuracy.
  - In-game gate items pending (Kandler): torch place/break in a large open cave shows no visible hitch vs the Phase 0 baseline numbers; power-5 explosion carve ms via `dumpLogs('magic')` compared against baseline; a 10-minute streaming soak with zero watchdog force-clears (`dumpLogs` filter `ChunkUpdate`). This sandbox session is headless-only (agent-notes §7) and cannot perform these.
- **Phase 3B — DONE 2026-07-10, build `2026-07-10.5`** (Sonnet subagent; sandbox session, uncommitted — commit from Windows):
  - `voxEx.html` (9 replacements, all via bash-mount Python edits per agent-notes §7, zero Edit-tool use on voxEx.html/tools/voxex-tests.html this session): new `lightRuleEnter(traveled, attenuation, floor)` helper inserted directly above `propagateLightBFS` (grep `UNIFIED LIGHT-PROPAGATION KERNEL`) — a pure extraction of the kernel's inline ternary; the kernel body now calls it (`const propagated = lightRuleEnter(basePropagated, attenuation, floor);`), and `lightRuleEnter` joined the `WORKER_LIGHTING_ENABLED` injection list immediately before `propagateLightBFS` (order is cosmetic — function declarations hoist). `LightTask`'s constructor gains `this.attenTable = channel === 'sky' ? SUNLIGHT_ATTENUATION : BLOCKLIGHT_ATTENUATION;` next to `this.floor`, added in 3B specifically per D8 (not carried unused through 3A). `stepLightTask`'s two ADD branches (sky and block) each gained a `traveled` local (unchanged formula: `level > 1 ? level - 1 : 1` sky / `level > 0 ? level - 1 : 0` block) followed by `const propagated = lightRuleEnter(traveled, task.attenTable[nId], <floor>);` replacing the old un-attenuated `propagated` — the write condition (`propagated > nLight`) is untouched. REMOVE branches were not touched (their `computeNeighborSunlight`/`computeNeighborBlockLight` desired-value queries were already attenuation-aware, confirmed by re-reading both before editing). `CURRENT_CACHE_VERSION` 7 → 8 with a new `v8:` comment line citing this phase. `VOXEX_BUILD` → `2026-07-10.5` + a `VOXEX_RECENT_CHANGES` entry (see build banner for the full text, including the two test-geometry corrections below).
  - `tools/voxex-tests.html`: new describe `lighting: incremental ADD attenuation fix (CCR-LIGHT-004 Phase 3B — drift #7)` with 2 spot-value tests, PLUS an extension of the existing Phase 0 edit-script test (steps 5-7). **Two characterization-time corrections, both caught by comparing actuals to hand computation before baking anything in (Phase 2 discipline honored) — neither implicated the production fix:**
    1. The block-channel spot test's first draft (torch beside a 2-deep water column with only single-cell side walls) failed `Expected 9, got 11` on the second water cell. Root cause: with only single-cell walls, light from the torch could reach the second cell via a cheaper indirect path (up through open air beside the first cell, then sideways into the pool from above) that pays WATER's attenuation only once instead of twice — a LEGITIMATE higher value under monotone-max BFS, not a bug. Fixed by fully enclosing the 2-cell water column in STONE on every face except the single torch-side opening, eliminating the alternate path. First water cell = 12 (`15-1-2`), second = 9 (`12-1-2`), confirmed on the corrected geometry.
    2. The sky-channel spot test's first draft (a single-cell STONE plug directly under open sky, broken in one edit) failed `Expected 13, got 1` — the water cell never received ANY light. Root cause: `calculateChunkSunlight`/`primeSunlightColumn` store the light ARRIVING at a cell (TER-2 convention), computed from what's strictly ABOVE it, independent of the cell's OWN material — so a lone solid block sitting directly under open sky already reads phantom-15 in the array WHILE STILL SOLID, identical to what it reads once broken. Breaking it therefore registers `target === prev`, no enqueue, no propagation — not a production bug, a property of the phantom-value convention (confirmed by tracing `calculateChunkSunlight`'s phase-1 loop and `primeSunlightColumn` line-by-line: `skyLight[idx] = currentLight > 1 ? currentLight : 1` is written BEFORE that cell's own attenuation is applied, using light arriving from above only). Fixed with a 2-thick removable wall (an outer plug stacked directly above an inner plug, both adjacent to the water only through the inner one) mined via two real incremental edits, mirroring actual gameplay: breaking the OUTER layer first genuinely changes the INNER layer's own phantom value (1 → 15, since it's no longer shadowed), which correctly enqueues and propagates — verified against the fixed code, not assumed. Final: water cell = 13 (`15-1-1`), asserted after both edits; the opened cell itself (now genuinely AIR) also asserted at 15, satisfying the CCR's literal "air cell at skylight 15 beside a water cell" wording.
  - **Fixture re-capture (characterization workflow: run headless → read actual from the failing assertion → bake in → re-run green), per #3B.3:** the existing Phase 0 edit-script checksums did NOT move on the first post-fix run with the ORIGINAL 4-step script (torch far from water, place/break stone directly over the already-open water pool) — exactly the coverage gap the CCR warned about, not a pass. Root cause (same class as correction #1 above): the torch's place-then-break fully self-cancels via the REMOVE path (already attenuation-aware, untouched by 3B), and the stone-over-water edit's effect is dominated by the pool's other 15 columns, which stay continuously open to full sun for the whole test and were correctly lit by the (unaffected) full-recalc kernel during the very first `calculateChunkSunlight` call — so nothing the incremental ADD path computes for that one column ever wins the monotone-max comparison. Fixed by extending the SAME script (not replacing it) with steps (5)-(7): a sealed 2-deep water pocket with a torch placed in its one opening (left in place, not broken, so the effect persists to the final checksum) and a sealed water pocket behind a 2-thick wall mined open (also left open). With those three extra edits, both checksums genuinely move: sky `568040165 → 1768186114`, block `362651077 → 1948544033`. The four OTHER fixtures (full-recalc sunlight `1821834511` / blockLight `725244334`, edge-pipeline sky `1889740755` / block `787091577`) are confirmed BYTE-IDENTICAL and untouched — those paths are not exercised by this phase.
  - Gates: CRLF invariant (`tr -cd '\r' < voxEx.html | wc -c` == `wc -l`; same for `tools/voxex-tests.html`) held through every edit, including the two test-geometry iterations and a changelog-string fix (an unescaped literal `"..."` quote pair inside the double-quoted `VOXEX_RECENT_CHANGES` entry broke `syntax-check` once — caught immediately by the syntax gate, fixed by rewording, no other impact). `node tools/syntax-check.mjs` and `node tools/parity-check.mjs` GREEN after the final edit. Full browser suite **385/385** headless (383 pre-existing + 2 new spot tests), confirmed on the FINAL corrected geometry — worker sunlight byte-parity green (gates the kernel's pure-extraction refactor, confirming it stayed byte-identical despite the `lightRuleEnter` call replacing the inline ternary).
  - In-game gate items pending (Kandler, headless sandbox cannot perform): a torch placed beside water / under a leaf canopy now reads dimmer through the medium IMMEDIATELY on placement (previously only corrected by a reload or full recalc); first load of an existing save takes one-time longer (relight pass) then behaves normally.
  - Deviations from the CCR text: none of substance to the PRODUCTION code (#3B.1/#3B.2 implemented exactly as specced). Test design deviated from the CCR's sketch geometry in the two ways documented above (full enclosure for the block test; a 2-thick wall + two edits for the sky test, instead of a single plug) — both are refinements the CCR anticipated in spirit ("Actuals must match hand computation before baking" / "if it doesn't move, extend it") rather than deviations from its intent. `CLAUDE.md`'s Lighting Engine section and Classes/Development-Guidelines references were updated in the same pass (bash-Python method) to describe `lightRuleEnter`/`this.attenTable` and drop the stale "Phases 3-4 not yet built" wording.
- **Phase 4 -- DONE 2026-07-10, build `2026-07-10.6`** (Sonnet subagent; sandbox session, uncommitted -- commit from Windows):
  - `voxEx.html` (9 replacements, all via bash-mount Python edits per agent-notes Sec.7, zero Edit-tool use on voxEx.html/tools/voxex-tests.html this session): `calculateBlockLight`'s seed loop (#4.1) rewritten from `const emit = b === FIRE ? fireLevel : (b === TORCH ? torchLevel : 0);` (with the `fireLevel` const and the `if (torchLevel <= 0 && fireLevel <= 0) return;` early-out) to `const emit = b === TORCH ? torchLevel : BLOCK_LIGHT_EMISSION[b];` -- exactly `getBlockEmission()`'s rule (D7). Chose to DROP the early-out entirely rather than generalize it (the CCR's own suggested option): the seed scan is a cheap O(chunkVolume) pass relative to the BFS it feeds, and a dropped early-out means the emission table can gain new entries with zero further changes to this loop. Confirmed via grep that `calculateBlockLight` is absent from every `WORKER_LIGHTING_ENABLED` injection list (still only `lightRuleEnter`/`propagateLightBFS`/`_chunkLocalLightCtx`/the 4 ctx accessors/`calculateChunkSunlight`) -- it stays main-only, as the CCR's worker-parity table requires (fresh terrain has no torches, PERF-013 invariant). Added matching lockstep comments at both mirror sites: a new paragraph in `getBlockEmission`'s existing JSDoc block (inserted just above `@param`, anchored on ASCII-only text to sidestep the em-dash-laden line above it) and a comment block above the seed loop, both citing "Mirrored logic (review-enforced, CLAUDE.md Lockstep Registry)". `VoxelWorld.setBlock`'s three `blockLight: ...fill(1)` sites (#4.2 -- new-chunk create at the `size` allocation, legacy-format upgrade at the `legacySize` allocation, and the missing-array backfill `if (!chunk.blockLight) chunk.blockLight = new Uint8Array(chunk.blocks.length)`) all dropped `.fill(1)` in favor of the zero-filled default, each with an inline comment citing this phase; grep confirmed these were the only three `blockLight`+`fill(1)` producers file-wide, matching the audit's count. `BLOCK_LIGHT_EMISSION` added to the `window.VoxEx` seam export (it was a main-thread table with no seam visibility before this phase) in the existing `CCR-LIGHT-004 Phase 0` export group, with a comment noting it exists to support the new characterization test. #4.3 (dead-guard sweep): grepped `kept for parity` and found exactly ONE site (`const attenuation = SUNLIGHT_ATTENUATION[blockId] ?? 0;` in the sunlight point-query helper, two lines below the `TER-2` convention comment) -- its adjacent comment already read "?? 0 now unreachable (Uint8 read) -- kept for parity", an unambiguous single-site match, so it was deleted (`?? 0` dropped, comment reworded to cite this phase and audit finding #12) rather than skipped; the diff stayed trivial (one line). `VOXEX_BUILD` -> `2026-07-10.6` + a `VOXEX_RECENT_CHANGES` entry (both per the Version impact table -- no cache/terrain/settings bump, as this phase only seeds blocks that do not exist yet and zero-fills arrays that were always recomputed before use).
  - `tools/voxex-tests.html`: `BLOCK_LIGHT_EMISSION` added to the top-of-file `VoxEx` destructure (alongside `SUNLIGHT_ATTENUATION`/`BLOCKLIGHT_ATTENUATION`). One new test in the existing `calculateBlockLight` describe (after "light decays to 0 at range"): temporarily sets `BLOCK_LIGHT_EMISSION[GLASS] = 10` (GLASS chosen because it is TRANSPARENT with a confirmed-zero baseline emission -- grepped `lightEmission` in `BLOCK_CONFIG` and found only FIRE sets the field, to `0`, so every other block including GLASS defaults to 0 going in), seeds a single GLASS block in a synthetic chunk, runs `calculateBlockLight`, asserts the seeded cell reads exactly 10 and its air neighbor reads 9 (10 - 1 travel - 0 attenuation of the entered AIR cell), and restores the table entry inside a `finally` block so the mutation cannot leak into later tests even on assertion failure. Matches the CCR's suggested design; `BLOCK_LIGHT_EMISSION` did need the seam export described above (it was absent).
  - Gates: CRLF invariant (`tr -cd '\r' < voxEx.html | wc -c` == `wc -l`; same for `tools/voxex-tests.html`) held through every edit, including the follow-up #4.3 edit. `node tools/syntax-check.mjs` and `node tools/parity-check.mjs` GREEN after each pass. Full browser suite **386/386** headless (385 pre-existing + 1 new), confirmed BOTH immediately after the #4.1/#4.2 edits and again after the #4.3 dead-guard removal (no regression) -- all prior fixtures (full-recalc sunlight `1821834511` / blockLight `725244334`, edge-pipeline sky `1889740755` / block `787091577`, edit-script sky `1768186114` / block `1948544033`) held byte-identical, as expected (TORCH seeding is value-identical under the rewritten rule, and FIRE's own emission is 0 by config either way, so no fixture was expected to move).
  - In-game gate item from this phase's own acceptance text (Kandler, headless sandbox cannot perform): place a test emissive block via console (a temporary `BLOCK_CONFIG` entry with `lightEmission`), confirm it survives a quick save/load and a forced `rebuildTorchLightingForActiveChunks()` with light intact.
  - Deviations from the CCR text: none of substance. #4.1 took the CCR's explicitly-offered "drop the early-out" option rather than generalizing it -- documented as a choice, not a deviation. #4.3 resolved the CCR's open "delete or keep, lowest priority" judgment call by deleting the one site found, since it was unambiguous and the diff was a single line. `CLAUDE.md` was updated in the same pass (bash-Python method): the Lighting System section's "Unified propagation kernel" bullet now reads "Phases 0-4 SHIPPED -- buildable scope COMPLETE at build 2026-07-10.6" and its closing sentence describes Phase 4 (previously "specced ... but not yet built"); a new Lockstep Registry row (`getBlockEmission` <-> `calculateBlockLight`'s seed loop) was added to the "Mirrored logic (review-enforced)" table.
- **CCR-LIGHT-004 buildable scope COMPLETE at build `2026-07-10.6`.** All four phases (0-4) are implemented, gated, and green (386/386 browser suite, syntax-check, parity-check). What remains is NOT further implementation but two categories of follow-through:
  1. **Kandler's in-game gate items** (cannot be performed from this headless sandbox; see each phase's own acceptance-gate text above for full context):
     - Phase 2: torch-behind-a-water-column-at-a-chunk-border reads equally dim from both sides; a cave crossing a border under a leaf canopy shows no brightness step at the seam; no dark 1-cell rim of neighbor torch light after flying away and back (streaming re-light).
     - Phase 3A: torch place/break in a large open cave shows no visible hitch vs the Phase 0 baseline numbers; a power-5 explosion's carve ms via `dumpLogs('magic')` compared against the Phase 0 baseline; a 10-minute streaming soak with zero watchdog force-clears (`dumpLogs` filter `ChunkUpdate`).
     - Phase 3B: a torch placed beside water / under a leaf canopy now reads dimmer through the medium IMMEDIATELY on placement (previously only corrected by a reload or full recalc); first load of an existing save takes a one-time-longer relight pass, then behaves normally.
     - Phase 4: a temporary emissive `BLOCK_CONFIG` entry (via console) lights correctly and survives save/load + a forced full recalc.
  2. **Deferred follow-ups** (explicitly out of this CCR's scope, per the Approach section):
     - **CCR-LIGHT-005** -- the full-recalc edge re-import orchestration fix (`bailoutToFullRecalc`/`rebuildTorchLightingForActiveChunks`/`rebuildSkylightForActiveChunks` recalc chunk-local light with no neighbor re-import afterward, causing dark border seams after big carves or settings changes). Deliberately sequenced after this CCR so the edge pass it invokes has correct physics.
     - A **measurement-gated heightmap CCR** for O(1) direct-sky queries -- only if Phase 0/3 numbers still show `computeDirectSkyLight` column-walk cost as a real bottleneck.
     - **Watchdog demotion to diagnostic-only** (D5) -- after a soak period shows zero watchdog-forced clears across sessions; do not remove the safety net until that evidence exists.

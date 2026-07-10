# CCR — Chunk Update / Remesh Consolidation & Efficient Chunking  ✅ IMPLEMENTED (Phases 0–4)

**Project:** VoxEx (`voxEx.html`, single-file Three.js voxel engine)
**Type:** Architecture / performance (chunk meshing pipeline)
**Status:** ✅ **Phases 0–3, 3.5, and 4 implemented & in `voxEx.html` (build `2026-06-18.11`), user-verified in-browser, `node --check` clean.** Off-thread worker meshing is LIVE; only Phase F (light-as-texture) remains deferred to a future CCR. Build order + full line-level spec in `CHUNK-IMPLEMENTATION-PLAN.md`. The audit/proposal below (Parts 1–6) is the original design record; **see the "AS-BUILT" section immediately below for what shipped and where it deviated.**
**ID:** VOXEX-CCR-CHUNK-001

---

## AS-BUILT (reconciled 2026-06-17, build `2026-06-17.19`)

What was actually implemented, and where it differs from the proposal below. The audit (Parts 1–2)
and design rationale (Parts 3–5) are unchanged historical record; Part 6's line-level spec was the
starting point but several details changed during implementation — those are called out here.

### Phase 3.5 + Phase 4 (added 2026-06-18, after the original 0–3 reconciliation)

- **Phase 3.5 — lazy banding.** Banding became **per-chunk**, not global: a chunk streams as a single
  column (cheap) and converts to banded geometry only on its **first edit** (`bandedChunkKeys` +
  `chunkUsesBands()` replacing the 5 global `SETTINGS.bandedMeshing` reads; `markChunkBanded()` on the
  two center-edit sites). A `meshProfile()` A/B showed always-on banding ~doubled streaming mesh load
  (first builds pay banding's 4× overhead for no benefit — banding only helps *edits*).
- **Phase 4 — off-thread worker meshing. LIVE (`WORKER_MESH_PIPELINE_ENABLED = true`).** Re-scoped to
  **unbanded chunks only**: streaming chunks mesh in the worker; banded/edited + torch/fire chunks stay
  on main. The worker mesher is **single-sourced** from the main-thread functions via
  `buildChunkWorkerCode()` injection (the `__MESH_FUNCS__` scaffold) — ~20 functions by
  `Function.toString()` + AO/corner-light/quant/transparency tables as JSON of live values (byte-parity)
  + greedy scratch + `mergedVertexCache` + `logDebug` stub + `getBlockUV` reconcile; the worker's old
  hand-coded AO tables + per-block mesher were deleted. **Gated by a byte-parity test** (no-neighbor +
  8-neighbor) comparing worker buffers to a headless main mesh. `applyWorkerMeshData` rewritten to the
  pooled-mesh / tight-bounds / lightMap attach (the old version referenced a nonexistent material +
  `computeBoundingSphere` over pooled buffers). **Spec deviations:** no per-band worker payload / band
  loop (unbanded-only ⇒ mirrors `renderChunk`'s `numBands===1`); torch/fire not built in the worker
  (`hasTorchFire` chunks fall back to `renderChunk`); parity oracle is a headless `meshChunkHeadless`
  (test-only) since `renderChunk` needs a live scene. **Two bugs surfaced only when the long-dormant
  pipeline first ran** (fixed): fast-flight dispatch starvation (per-frame cap sized for sync builds
  starved the pool → stall) and `ensureChunk` synchronously meshing collision-touched chunks (~65ms
  spikes). **Result:** main-thread mesh load **~203 → ~4 ms/s (−98%)**, over-budget single builds
  **176 → ~2**, no stall, no seams.

### Shipped per phase (Phases 0–3)

- **Phase 0 — coalescing scheduler.** As specified: `DIRTY_REASON` bitmask + `chunkDirtyReason` map,
  `scheduleChunkUpdate({reason})`, light/seam/tree callers tagged, neighbor-drain de-dupe guard, mask
  cleared on rebuild. (The actual duplicate-removal is the neighbor-drain guard; the mask is mostly
  groundwork for Phase 3's routing.)
- **Phase 1 — frustum/build decouple.** As specified, with the corrected memory bound: builds the
  near in-range ring in all directions up to **`BUILD_AHEAD_RADIUS = min(renderDistance, 10)`** (the
  proposal's "bounded by eviction" claim was wrong — see Part 6 self-audit; the cap replaces it).
- **Phase 2 — banded meshing (2a/2b/2c).** Per-band geometry via a hoisted `flushBand()` + a unified
  band loop (`numBands===1` when off ⇒ byte-identical to pre-banding). `chunkMeshes` census routed
  through `isChunkMeshed()` (NOT `meshedChunkKeys` — corrected from an earlier Part 6 draft). 2.6
  per-band dirty scope via `chunkDirtyBands` + `bandMaskForY(y)`. **Shipped ON by default**
  (`SETTINGS.bandedMeshing = true`).
- **Phase 3 — light decoupling.** 3A (light out of the merge key + per-face `CORNER_AB` corner
  sampling) is unconditional. 3B (light-only **color refill**: per-quad `lightMap` +
  `refillChunkLightColors` + shared `cellCornerLightDamped` + drain-branch routing) behind
  `SETTINGS.lightRefill` (**default OFF**, console `setLightRefill(true)`).

### Deviations from the proposal (what was altered)

1. **`isChunkMeshed()` instead of `meshedChunkKeys`** for "currently meshed" checks. `meshedChunkKeys`
   means "ever meshed (data loaded)", so reusing it would block re-meshing of range-released chunks.
   New band-aware helper added.
2. **Phase 2.3 (extra band geometry tier) SKIPPED** — the existing small tier sufficed.
3. **Merge-key layout changed twice.** Proposal 3.1: `(blockId<<8)|AO`. As-built it's
   **`(blockId<<10)|(damp<<8)|AO`** — the wet-shoreline **damp level** was put back in the key (user
   request) so the shoreline stays **crisp/blocky** instead of interpolating. (Removing light from the
   key had softened it — an accepted side effect that the user later wanted reverted.) `_lastDampLevel`
   in `cellCornerLightDamped` feeds it; blockId extraction is `>>10`. General light gradients (caves)
   keep the smooth 3A look; only the damp is crisp.
4. **3.2 corner sampling done robustly, not hand-mapped.** A per-face `CORNER_AB` table derived from
   `computeMergedFaceVertices` (collapses to the seed cell for 1×1 / uniform quads ⇒ verifiable),
   rather than 24 hand-written index mappings.
5. **3.3 refill picked the full-parity option** (per-quad lightMap of 4 corner-cell indices + faceIdx
   + AO, O(quads) refill) with a **separate faithful `buildChunkLightGetters`** (not a refactor of
   `renderChunk`'s hot-path closures, to avoid default-path risk). Water bands **decline to refill**
   (fall back to full remesh — water colors aren't mapped).
6. **Defaults:** `bandedMeshing` flipped **ON** for all players; `lightRefill` left **OFF**
   (experimental, untested-from-boot at flip time).

### Bugs found during bring-up (not anticipated by the proposal)

`node --check` cannot catch undefined references or wrong key parsing; these surfaced only in
in-browser testing and are now fixed:

1. **Missing `chunkBandMeshKeys` generator** — referenced by `releaseMeshForKey`/prune but never
   defined; threw the moment banding was enabled.
2. **`refreshChunkShadowCasters` parsed band keys as chunk coords** (`parseChunkKey("cx,cz#b")` → NaN
   distance) → it switched OFF `castShadow` on every band mesh on chunk-boundary crossings → shadows
   vanished. A `chunkMeshes` census site the proposal missed (it's a shadow helper, not obvious mesh
   management). Fixed with `chunkBaseOfMeshKey()`.
3. **`rebuildAllVisibleChunks` regression** — it released only the `cKey` terrain mesh; after Phase 2b
   changed the queue-skip to `isChunkMeshed()`, that left water/band meshes alive so the skip blocked
   AO/water re-bakes on settings changes. Fixed by marking chunks dirty instead of releasing.

### Known limitations / parking lot

- **Light-CHANGING edits still remesh** the affected bands (a sunlight column can change light far
  below an edit), so the refill's win is on pure-light events (edge-lighting convergence, sunlight
  settle) — not general block edits. Fully addressed only by Phase F (light texture).
- **Banding ≈ 4× draw calls** (one geometry per band) — accepted; offset by per-band frustum culling
  + cheaper per-edit rebuilds.
- **Wet-shoreline gradient is per-cell discrete** (crisp, by request). A genuinely smooth gradient in
  all directions would need per-vertex distance-to-water damp (audited, not implemented).
- **Refill recomputes corner light 4× per quad** (once per corner cell) — correct, mildly wasteful;
  fine for the infrequent refill path.
- **Sandbox bash mount of `voxEx.html` is flaky/truncated** — verification done via Read/Grep + a
  reconstruction-based `node --check`; the authoritative test is `tools/voxex-tests.html` in-browser.

> Line numbers are accurate as of the working tree on **2026-06-17** and *will* drift as the
> file changes — grep the quoted identifier before editing. This document is written to be
> **read and debated first**: it inventories every site that mutates a chunk or forces a
> remesh, then proposes a consolidation, then answers the five design questions the audit
> was scoped around.

---

## TL;DR

1. **Every remesh in VoxEx is a full 320-tall column rebuild.** A chunk produces exactly
   one terrain geometry + one water geometry (`chunkMeshes.get(cKey)` / `cKey + "_WATER"`).
   Sections (20 × 16-tall) are used to *skip* empty work and for LOD, but the **output is a
   single merged buffer**. Editing one block at y=64, or a single border light change,
   re-iterates and re-uploads all 20 sections.

2. **Light is baked into the geometry** — into vertex colors *and* into the greedy-merge key
   (`getMergeKey` packs 4 corner light levels, ~line 38581). So **any light change forces a
   full remesh**, which is the single largest source of "geometry didn't change but the chunk
   remeshed anyway."

3. **Meshing is on the main thread.** `WORKER_MESH_PIPELINE_ENABLED = false` (~line 13441)
   gates off the worker mesher; `processChunkQueue` falls through to the synchronous
   `renderChunk` (~line 40258). Workers still generate *terrain data*, but every mesh build
   spends its full cost on the main thread under a 5 ms/frame budget.

4. **Frustum culling gates *meshing*, not just drawing.** The visibility sweep skips culled
   chunks *before* queueing them to build (~line 41248). A chunk behind you is never meshed
   until you rotate to face it — then a whole ring queues at once on the main thread. **This
   is why "culled chunks take so long to load."**

5. **There are ~16 distinct scheduling entry points feeding 5 queues**, all converging on the
   one main-thread `renderChunk`. They are well-debounced individually but are **not
   coalesced across reasons** — a single neighbor arrival can schedule the same chunk from
   three different paths in the same second.

The proposal: **(A)** coalesce all schedule paths behind one per-chunk dirty-reason mask;
**(B)** make the mesh output **per-vertical-band** so edits/light touch only the affected
band; **(C)** decouple light from the greedy-merge key so light changes become an **in-place
color-attribute upload** instead of a remesh; **(D)** decouple "in range" (mesh exists) from
"in frustum" (drawn) so culled-but-near chunks pre-mesh; **(E)** re-enable the worker mesher
once band-meshing shrinks the per-build cost.

---

## Part 1 — Audit: everything that updates a chunk or calls for a remesh

### 1.1 The pipeline, end to end

```
  block edit / light BFS / neighbor arrival / fire tick / streaming
        │
        ▼
  scheduleChunkUpdate(cx,cz,force,source,{bypassLighting,immediate})   ~17590
        │   (debounce 20ms; defers if chunkOrNeighborsPending)
        ▼
  pendingChunkUpdates (Set)  ──dispatchPendingChunkUpdates()──►  chunkBuildQueue   ~16573
        │                                                        + queuedChunkKeys
        ▼
  processChunkQueue()  (per-frame, 5ms budget, 10ms burst)   ~41374
        │   sorts by distance, dirty-first
        ▼
  renderChunk(cx,cz,distSq)   ← MAIN THREAD (worker path gated off)   ~40258
        │   one terrain buffer + one water buffer per chunk
        ▼
  chunkMeshes.set(cKey, mesh) / set(cKey+"_WATER", mesh)   → MESH_STATE.READY
```

Four **secondary queues** also feed `renderChunk` (or schedule into the primary path),
drained at the tail of `processChunkQueue` with leftover budget:

| Queue | Drained by | Effect |
|---|---|---|
| `chunkNeighborUpdateQueue` | `processChunkQueue` neighbor block (~41526) | direct `renderChunk` for seam fixes |
| `edgeLightingUpdateQueue` / `chunksNeedingLightingUpdate` | `processEdgeLightingUpdates` (~17235) | propagate cross-chunk light, then `scheduleChunkUpdate` |
| `adjacentChunkUpdateQueue` / `chunksAwaitingNeighborUpdate` | `processAdjacentChunkUpdates` (~16765) | cross-chunk tree leaves + lighting, then `scheduleChunkUpdate` |
| `deferredChunkUpdates` | `flushAllDeferredChunkUpdates` (~16496) | replays schedules that were blocked on pending light |

### 1.2 Complete trigger-site inventory

Every call that ultimately forces a chunk mesh rebuild (grep `scheduleChunkUpdate` +
`chunkNeighborUpdateQueue.add` + direct `renderChunk`). Grouped by cause.

**A. Player block edits** (`updateLocalArea`, ~41576, called from the place/break path):

| Source string | Line | Notes |
|---|---|---|
| `edit-center` | 41582 | `immediate:true`, `bypassLighting` — instant feedback |
| `edit-{west,east,north,south}-edge` | 41589–41592 | only when the edited block sits on a chunk boundary |
| `edit-{nw,sw,ne,se}-corner` | 41595–41598 | only on a chunk corner |
| `block-edit-lightneutral` | 24896 | light-neutral edits (char grass→dirt, log→burnt); `bypassLighting`. AIR↔FIRE skips remesh entirely (`meshNeutral`, 24894) |

**B. Lighting propagation:**

| Source string | Line | Notes |
|---|---|---|
| `light-propagation` | 24270 | `createLightTaskTracker.finalize` schedules **every chunk the BFS touched**, `immediate:true` |
| `sunlight-task` | 24535 | `SunlightTask.scheduleChunkRebuilds` after async sunlight settles |
| `light-unblocked` | 16525 | a deferred chunk's neighborhood lighting finished |
| `light-watchdog` | 16550 | watchdog force-clears stuck pending light (300 ms grace) |
| `{reason}-flush` / `{reason}-force` | 16496 / 16508 | `flushAllDeferredChunkUpdates` |

**C. Edge lighting (cross-chunk seams)** — `processEdgeLightingUpdates`:

| Source string | Line | Notes |
|---|---|---|
| `edge-lighting` | 17347 | fired **once on convergence** (no-change pass), debounced `EDGE_REMESH_DEBOUNCE_MS = 150` |
| `edge-lighting-capflush` | 17281 | safety flush when the pass cap (`MAX_EDGE_LIGHTING_PASSES = 3`) is hit before a clean convergence |

**D. Neighbor reconciliation:**

| Source | Line | Notes |
|---|---|---|
| `neighbor-update` | 16814 | `processAdjacentChunkUpdates` after tree/lighting reconcile, gated on `TREE_NEIGHBOR_UPDATE` |
| `neighbor-reconcile` → `chunkNeighborUpdateQueue` | 16643 | `runNeighborReconciliationSweep` re-meshes a chunk when a **neighbor rendered more recently** (`lastRender` compare, 16638) — blocks unchanged, seam fix only |
| `stale-mesh-redo` | 19579 | worker apply-drain re-dirty path (gated off with the worker pipeline) |

**E. Other systems:**

| Source | Line | Notes |
|---|---|---|
| `fire-tick` | 39942 | fire system marks burning chunks dirty each tick |

**F. Streaming (first mesh for a newly-visible chunk):**

| Site | Line | Notes |
|---|---|---|
| frustum sweep → `chunkBuildQueue.push` | 41314–41319 | only chunks that **passed the frustum check** at 41248 are ever queued |

### 1.3 What the audit found is *already* well done

This is not a greenfield file — a lot of the obvious waste is already handled, and the
proposal must not regress it:

- **Debounce** on `scheduleChunkUpdate` (20 ms; player edits bypass via `immediate`, 17609).
- **Light-neutral fast path** in `setBlock` (24882) — fire spread/char skip the lighting BFS;
  AIR↔FIRE skips the remesh entirely.
- **Edge-lighting remesh is deferred to convergence** with a per-chunk pass cap and a 150 ms
  debounce (17268–17348) — an earlier version remeshed on every intermediate brightening and
  caused a "rebuild storm."
- **Section-skip during meshing** — empty sections are skipped (40422–40443); fully-skipped
  chunks short-circuit to `READY`.
- **Deferred release** — old meshes stay attached until the new one is ready (no flash, 40287).
- **Distance + dirty-first queue sort**, per-frame build budget, burst mode (41386–41453).
- **Neighbor reconcile has a cooldown** (`CHUNK_REBUILD_COOLDOWN_MS = 1000`, 16627).

The remaining waste is **structural**, not tuning: full-column rebuilds, light-in-geometry,
frustum-gated meshing, and the lack of cross-reason coalescing.

---

## Part 2 — The five design questions

### Q1. Should we include vertically sliced chunks? → **Yes, slice the mesh *output* (not the data).**

**Current state.** The data model is already vertically sectioned (`SECTIONS_PER_CHUNK = 20`,
`SECTION_HEIGHT = 16`), and `analyzeChunkSections` (~6815) gives per-section
`isEmpty`/`isFullySolid`/bounds. But meshing writes **one merged geometry per chunk**: the
section loop (`for sectionIdx … SECTIONS_PER_CHUNK`, 40438) appends into shared
`terrainPos/terrainCols/…` pools sized `MAX_FACES_PER_CHUNK`, and the result is a single
`chunkMeshes.set(cKey, …)`. So the *data* is sliced; the *mesh* is not.

**Consequence.** Any rebuild — edit, light, seam — re-iterates all 20 sections and re-uploads
the whole column even when 19 sections are byte-identical to last frame.

**Proposal.** Emit geometry **per vertical band**, keyed `cKey + "#" + bandIdx`. A band is one
or a small group of sections (recommend **4 bands of 5 sections = 80 blocks**, or per-section
if profiling supports it). Rebuild touches only the band(s) whose sections were invalidated.

**Trade-offs (must be designed for):**

- **Draw calls** rise from 1→N per chunk. Mitigate by (a) coarse bands (4, not 20), (b)
  merging adjacent **empty/fully-solid** bands into one buffer or skipping them, (c) the
  existing per-section frustum/LOD culling now applies per band.
- **Greedy meshing loses vertical merges across band borders** — a 20-tall stone wall becomes
  ≥2 quads. Acceptable: vertical runs are rarer than horizontal, and `shouldMergeBlocks`
  (9845) already excludes the common transparent/leaf cases.
- **Geometry-pool pressure** — N buffers per chunk instead of 1. The tiered
  `GeometryBufferPool` (small/medium/large) must gain a smaller tier for bands, and band
  buffers should size from `section.faceCount` (already cached, 40240) rather than
  `MAX_FACES_PER_CHUNK`.

**Recommendation:** **Adopt, coarse (4 bands).** It is the prerequisite that makes Q2, Q3, and
Q5 cheap — every other improvement below shrinks from "rebuild a column" to "rebuild a band."
Start behind a `SETTINGS.bandedMeshing` flag so it can be A/B'd against the current path.

---

### Q2. Should we update the chunk data *less* often? → **No — the data updates are already minimal. Coalesce the *mesh schedules* instead.**

**Finding.** Chunk **data** (`blocks`/`skyLight`/`blockLight`) is only mutated on real events:
player edits, lighting BFS, neighbor reconcile. There is no per-frame data churn. So "update
data less often" targets the wrong layer — the cost is in **mesh rebuilds**, and the same
logical event currently schedules the same chunk through several paths.

**The real waste — uncoalesced schedules.** Example: a neighbor chunk streams in. Within ~1 s
this chunk can be scheduled by `neighbor-reconcile` (seam), `edge-lighting` (border light),
and `neighbor-update` (tree leaves) — three independent rebuilds of the same column, each a
full re-iteration. The debounce only coalesces *within* a 20 ms window from *one* path.

**Proposal — single coalescing scheduler with a dirty-reason mask.** Replace the scattered
`scheduleChunkUpdate(...)` + `chunkNeighborUpdateQueue.add(...)` calls with one entry that ORs
a per-chunk (and, post-Q1, per-band) reason bitmask:

```
DIRTY = { GEOMETRY:1, LIGHT:2, SEAM:4, NEIGHBOR_TREE:8 }
markChunkDirty(key, reasonMask, { band, immediate })   // ORs into chunkDirty.get(key)
```

One per-frame drain reads the mask and rebuilds each dirty chunk **once**, choosing the
cheapest action the mask allows (e.g. `LIGHT`-only with Q3 ⇒ color upload, no remesh;
`SEAM`-only ⇒ rebuild only the border band). This removes duplicate rebuilds without changing
*when* data updates — it changes how many times the mesh reacts to them.

**Recommendation:** **Adopt the coalescing scheduler.** Keep data updates exactly as they are.
This is the "consolidating calls" the audit was asked for, and it is the lowest-risk item —
it's a routing change in front of the existing `renderChunk`.

---

### Q3. Should light level change the chunk mesh? → **It does today (it shouldn't). Decouple it.**

**Finding.** Light is baked **into geometry twice**: into per-vertex colors *and* into the
greedy-merge key (`getMergeKey`, 38581, packs `blockId<<20 | 4×3-bit corner light | AO`). The
vertex shader reads `vertexColor = AO × (light/15)`. So a light change alters which faces may
merge *and* the color data → it can only be applied by a **full remesh**. This is the engine's
biggest "unchanged blocks, remeshed anyway" cost (every edge-lighting convergence, every
sunlight settle, every torch place ripples out as full-column rebuilds).

**Options, cheapest→deepest:**

- **(a) Scope-only (free with Q1).** Keep baking light, but per-band meshing means a light
  change rebuilds only the affected band(s). Big constant-factor win, zero new architecture.
- **(b) Pull light out of the merge key + in-place color upload.** Merge faces on
  `blockId + AO` only; store light per-vertex; on a light-only change, recompute just the
  `color` BufferAttribute and set `needsUpdate = true` — **no position/uv/index rebuild, no
  re-merge.** Cost: slightly more faces (light no longer splits merges — usually *fewer*
  splits, so this can *help*), and the mesher must keep a per-vertex→block-cell map to refill
  colors. This is the change that literally answers "light should not change the mesh."
- **(c) Light as a sampled texture.** Upload per-chunk light to a small 3D texture (or a
  packed 2D atlas) and sample it in the chunk shader by world position. Light changes update a
  texture region; geometry never touches light. Cleanest end-state, biggest lift (new shader
  path, new upload path, interacts with `flatShading` normal derivation).

**Recommendation:** **(a) immediately via Q1**, then **(b) as the target**: relax the merge key
to drop light, store light per-vertex, and convert light-only dirties to a color-attribute
upload in the coalescing drain (Q2). Treat **(c)** as a separate future CCR — it's the right
destination but shouldn't block this work. After (b), the answer to the literal question
becomes **"no, a light change updates a color buffer, not the mesh."**

---

### Q4. What causes culled chunks to take so long to load?

**Root cause — frustum culling gates *meshing*, not just drawing.** In the visibility sweep
(`updateChunkSystem`, ~41237):

```js
if (!isChunkInFrustum(cx, cz, ...)) { culled++; continue; }   // 41248 — culled chunk is skipped
neededKeys.add(key);
if (!chunkMeshes.has(key) && !queuedChunkKeys.has(key)) { needed.push({...}); }   // only survivors queue
```

A chunk outside the view cone (beyond the `INNER_RADIUS = 6` exception) is **never pushed to
`needed`**, so it is never generated or meshed. When you rotate, the frustum recomputes and the
entire newly-revealed ring is queued **in one frame**. They then serialize through the
main-thread builder at ~4 ms each under a 5 ms (10 ms burst) budget — a few chunks per frame —
so a wall of terrain visibly streams in over many frames. Compounding factors:

1. **First sight also pays terrain generation** — `if (!chunks.has(job.key)) await generateChunkData(...)` (41491) for chunks that were never even generated while culled.
2. **Main-thread meshing** (`WORKER_MESH_PIPELINE_ENABLED = false`) — the burst competes with rendering for frame time; there's no parallelism.
3. **Edge-lighting second pass** — once those chunks mesh, neighbor light propagation marks them `_edgeMeshDirty` and remeshes them again shortly after (Q5).

**Proposal.** Separate **"in range" (mesh must exist)** from **"in frustum" (mesh is drawn)**:

- Build the mesh for **every chunk within render distance**, frustum or not, at a *low*
  priority for culled ones. Keep using the frustum result purely to set `mesh.visible` /
  decide draw, not to decide *whether to build*. Rotating then reveals already-built geometry
  instantly.
- Keep the current cap/eviction (`maxAllowedMeshes`, 41273) so the off-screen ring doesn't blow
  the memory budget — evict farthest-first as today.
- Pre-generate terrain data for the in-range ring ahead of meshing (the spiral pre-gen at
  `SPIRAL_OFFSETS`, 9894, already exists — extend it to the steady-state ring, not just spawn).
- **Re-enable the worker mesh pipeline** (Q-bonus) once banded meshing (Q1) lowers per-build
  cost, so the reveal burst runs off-thread.

**Recommendation:** **Decouple build-gating from frustum**; this is the direct fix. The memory
cost is bounded by the existing eviction; the compute cost is bounded by keeping culled builds
at low queue priority.

---

### Q5. What causes seemingly-unchanged chunks to need remeshing?

All of these rebuild a chunk whose **blocks** are identical — only **border state** or **light**
changed, and because both are baked into the per-chunk mesh, the whole column rebuilds:

1. **A neighbor arrived ⇒ the border is wrong.** A chunk meshed before its neighbor existed
   used fallbacks at the seam: `getLocal` returns `UNLOADED_BLOCK` and sets `missingNeighbor`
   (40325–40333), and `getLocalLight` clamps to `ownEdgeLight` (40345–40362). When the real
   neighbor loads, both the **face culling** and the **border light** at that seam are stale,
   so the chunk must remesh. This is structural: face visibility *and* light at a chunk edge
   depend on neighbor data.

2. **Edge-lighting convergence** (`edge-lighting` / `edge-lighting-capflush`, 17347/17281) —
   light propagating across the seam (`propagateLightFromNeighbors` → `…EdgesInward`) changes
   border vertex colors and forces a remesh even though no block moved.

3. **Neighbor reconciliation sweep** (`runNeighborReconciliationSweep`, 16617) — if a neighbor
   `lastRender` is newer than this chunk's, it's queued for a seam-fix remesh (16638).

4. **Cross-chunk tree leaves** (`neighbor-update`, 16814) — a neighbor's tree canopy spills
   leaves into this chunk (`TREE_NEIGHBOR_UPDATE`), genuinely changing blocks but on a chunk
   the player never edited, so it *looks* unchanged.

5. **Sunlight settle / light BFS ripple** (`sunlight-task` 24535, `light-propagation` 24270) —
   a distant edit's light BFS can touch many chunks and schedule each for rebuild.

6. **Distance-LOD is sticky, the inverse problem.** A chunk first meshed far away used
   `shouldUseDeferredLighting` (9923, simplified height-based light) and section-LOD skipping
   (`getSectionLODThreshold`, 9833). As you approach, nothing re-meshes it to full quality
   unless one of the above fires — so some "stale-looking" chunks are the *absence* of a
   needed remesh, not an excess.

**How the proposal addresses each:** (1)(2) shrink from full-column to **border-band** rebuilds
(Q1) and, for light-only, to a **color upload** (Q3b). (3) becomes a band-level seam check. (5)
the coalescing mask (Q2) merges the ripple with any concurrent edit so it rebuilds once. (6) is
worth a small explicit "promote to full quality when crossing the deferred-light distance"
schedule — cheap once banded.

---

## Part 3 — Proposed change program (phased, each shippable alone)

| Phase | Change | Risk | Unlocks |
|---|---|---|---|
| **0** | **Coalescing scheduler** (Q2): one `markChunkDirty(key, reasonMask)` in front of the existing `renderChunk`; de-dupe the 16 call sites. No meshing change yet. | Low | Removes duplicate rebuilds immediately |
| **1** | **Decouple build from frustum** (Q4): mesh the whole in-range ring, low-priority for culled; frustum only sets visibility. | Low–Med | Kills rotate-to-load pop-in |
| **2** | **Banded mesh output** (Q1): emit per-band geometry behind `SETTINGS.bandedMeshing`; rebuild only dirty bands. | **High** | Makes every remesh cheap |
| **3** | **Light out of the merge key + in-place color upload** (Q3b): merge on `blockId+AO`; light-only dirties become color uploads. | Med–High | "Light no longer remeshes" |
| **4** | **Re-enable worker mesh pipeline** (`WORKER_MESH_PIPELINE_ENABLED`) now that per-band builds are small and parity is testable. | Med | Moves build burst off main thread |
| **F** | *(separate CCR)* Light-as-texture (Q3c). | — | Full light/geometry decoupling |

Phases 0 and 1 are independent and low-risk — recommend shipping them first to bank the easy
wins and de-risk the measurement of Phase 2.

---

## Part 4 — Safety checks & single-file constraints

Per the project's change rules (`CLAUDE.md`), an implementer of any phase must:

- **Single-file rule** — all changes stay in `voxEx.html`. No new files/assets.
- **No duplicate / shadowed identifiers** — before adding `markChunkDirty`, `chunkDirty`,
  band-key helpers, `SETTINGS.bandedMeshing`, grep for existing names; do not shadow
  `scene`, `camera`, `chunks`, `chunkMeshes`, `SETTINGS`, `WORLD_DIMS`.
- **Settings round-trip** — `SETTINGS.bandedMeshing` (and any LOD/threshold settings) need a
  default in `DEFAULTS` (~5284), wiring into `SETTINGS` (~5067), a DOM binding (~28800+), and
  `saveSettings()`; decide whether they belong in `SETTINGS_PROFILES`.
- **Worker parity** — banded meshing must not desync the worker mesher when Phase 4 re-enables
  it; terrain/tree functions are single-source-injected (markers `__TERRAIN_FUNCS_*` /
  `__TREE_FUNCS_*`) and must stay intact.
- **Per-frame budget** — the coalescing drain and band rebuilds must respect the existing
  `CHUNK_BUILD_BUDGET_MS` (5 ms) / burst path; no new unbounded loops in `processChunkQueue`
  or the render loop.
- **`chunkMeshes` keying** — banded keys (`cKey + "#" + band`) change every site that iterates
  `chunkMeshes` (cleanup 41307, mesh-prune 41278, frustum visibility, leak detection). This is
  the highest-churn part of Phase 2 — census every `chunkMeshes` / `_WATER` usage first.
- **Tests** — extend `tools/voxex-tests.html` (~204 tests) with banding + light-upload cases;
  re-run over localhost. Update `VOXEX_BUILD` / `VOXEX_RECENT_CHANGES` and the
  `tools/terrain-visualizer.html` if any LOD/threshold constant changes.

---

## Part 5 — Open questions for review

1. **Band granularity:** 4 bands of 80 blocks (fewer draw calls) vs per-section 20 bands
   (finest rebuild scope)? Recommend prototyping both and measuring draw-call vs rebuild-cost.
2. **Memory budget for Phase 1:** meshing the full in-range ring (not just the frustum) raises
   resident mesh count toward `currentRenderRadius² × 2`. Confirm `maxAllowedMeshes` (41273)
   and `MemoryBudgetManager` headroom at render distances 16–32.
3. **Greedy-merge regression on light removal (Q3b):** confirm dropping light from the merge
   key doesn't materially raise face counts in lit caves (where corner light varies a lot) —
   measure via `window.printFaceHistogram()`.
4. **Phase ordering:** ship 0+1 before committing to 2, or do 2 first to validate the banded
   architecture end-to-end? Recommend 0+1 first.

---

## Part 6 — Line-level change specification

> **All line numbers verified against the working tree on 2026-06-17 and WILL drift** — grep
> the quoted identifier/string before editing. Each entry gives the **site**, the **current
> code verbatim**, the **proposed code**, and the **reason**. Where a change is a mesher-core
> rewrite rather than a clean drop-in diff, it is flagged ⚠ and specified at the touch-point
> level (the same honesty the other CCRs in this repo use — a fabricated verbatim diff of a
> 600-line function would be worse than useless).

### ✅ Self-audit log (Part 6 reviewed against voxEx.html, 2026-06-17)

Every line number, identifier, and code block below was re-checked against the working tree.
Findings and corrections (all folded into the edits):

- **Identifiers confirmed present & correctly spelled:** `dirtyChunks` (16426),
  `pendingChunkUpdates` (16425), `queuedChunkKeys` (16424), `scheduleChunkUpdate` (17590),
  `recordChunkUpdateState(key, source, state)` (16564), `getMergeKey` (38581),
  `addMergedFaceIndexed` (39202), `greedyLight` (17804), `_greedyLightScratch` (39280 — a
  plain `[0,0,0,0]` array), `AO_QUANT_LOOKUP` (38536), `LIGHT_QUANT_LOOKUP` (38544),
  `isChunkInFrustum` (41165), `SETTINGS.enableFrustumCulling`, `SETTINGS.maxCachedChunks`
  (default 350), `maxAllowedMeshes` (41273), `runNeighborReconciliationSweep` (16617),
  `WORKER_MESH_PIPELINE_ENABLED` (13441). **New names proposed do NOT collide** (`DIRTY_REASON`,
  `chunkDirtyReason`, `refillChunkLightColors`, `bandKey`, `SETTINGS.bandedMeshing`,
  `deprioritize` — 0 existing occurrences each).
- **CORRECTED ❌→✅ (Edit 3.1, dead code):** dropping light from `getMergeKey` leaves the
  `l0..l3` computation (38586–38594) dead in a hot path. Edit 3.1 now also **deletes** those
  lines.
- **CORRECTED ❌→✅ (Edit 1.1, memory-bound claim was WRONG):** the earlier draft said the
  off-screen ring is "bounded by the existing mesh-count eviction (41273)." It is **not** — both
  the proactive prune (41273–41301) and the hard cleanup (41307–41308) only release meshes whose
  base key is **not in `chunksInRange`** (41292). Building the full in-range ring makes *every*
  built chunk in-range, so neither path can relieve the overflow. Resident terrain meshes rise to
  ~`π·maxR²` (the full disc) vs. today's view-cone subset — past ~render distance 12 that exceeds
  `maxAllowedMeshes` and the prune fires every frame doing nothing. Edit 1.1 now bounds builds
  with an explicit **`BUILD_AHEAD_RADIUS`** instead of relying on eviction.
- **CORRECTED ❌→✅ (Edit 0.4 vs 3.3 ordering bug):** Edit 0.4 clears `chunkDirtyReason` at
  41495, which is *before* Edit 3.3's reason read at ~41503. As written, Phase 3 would never see
  the `LIGHT` bit. Edit 3.3 now **relocates** the clear to after the refill/remesh decision.
- **CLARIFIED (Edit 3.2 winding):** the `lightLevel[i] → vertex i` mapping (39246–39254) is
  self-consistent with the proposed corner sampling, but the cell-corner-slot → quad-vertex
  correspondence still needs a visual check (kept as ⚠).
- **CLARIFIED (Edit 3.3 integration):** the real drain site (41503–41510) is the
  `WORKER_MESH_PIPELINE_ENABLED` if/else, not a bare `renderChunk` — the refill check wraps it.
- **CLARIFIED (Phase 0 framing):** the actual duplicate-removal in Phase 0 is **Edit 0.3**;
  0.1/0.2/0.4 are groundwork the Phase 3 consumer reads. Summary table updated.

### Edit index

| # | Phase | Site (fn / ~line) | Kind |
|---|---|---|---|
| 0.1 | 0 | decls near `dirtyChunks` (~16426) | **add** |
| 0.2 | 0 | `scheduleChunkUpdate` (~17590) | **change** |
| 0.3 | 0 | neighbor drain in `processChunkQueue` (~41529) | **add guard** |
| 0.4 | 0 | dirty clear in `processChunkQueue` (~41495) | **add** |
| 1.1 | 1 | frustum sweep loop (~41248) | **change** |
| 1.2 | 1 | `needed` sort (~41312) | **change** |
| 2.x | 2 | mesher output + every `chunkMeshes` iterator | ⚠ **rewrite** |
| 3.1 | 3 | `getMergeKey` (~38581) | **change** |
| 3.2 | 3 | merged-quad light (~39469) + `addMergedFaceIndexed` | ⚠ **change** |
| 3.3 | 3 | new `refillChunkLightColors` + drain branch | ⚠ **add** |
| 4.1 | 4 | `WORKER_MESH_PIPELINE_ENABLED` (13441) | **flag flip (gated)** |

---

### Phase 0 — Coalescing scheduler  *(low risk; ship first)*

**Edit 0.1 — add a per-chunk dirty-reason mask.** Site: declaration block, immediately after
`dirtyChunks` (~16426).

*Current (16426–16427):*
```js
const dirtyChunks = new Set(); // Tracks chunks that need a rebuild while keeping their current mesh visible
const deferredChunkUpdates = new Set(); // Chunk updates blocked while lighting is pending
```
*Proposed — insert between them:*
```js
const dirtyChunks = new Set(); // Tracks chunks that need a rebuild while keeping their current mesh visible
// COALESCING: per-chunk dirty-reason bitmask. Multiple schedule paths (edit, light, seam,
// tree-neighbor) OR their reason here; the build drain reads it to (a) de-dupe and (b) pick the
// cheapest rebuild (e.g. LIGHT-only ⇒ color refill once Phase 3 lands, not a full remesh).
const DIRTY_REASON = { GEOMETRY: 1, LIGHT: 2, SEAM: 4, NEIGHBOR_TREE: 8 };
const chunkDirtyReason = new Map(); // key -> OR'd DIRTY_REASON bits, cleared on rebuild
const deferredChunkUpdates = new Set(); // Chunk updates blocked while lighting is pending
```
*Reason:* one authoritative place to record *why* a chunk is dirty. Without it the ~16 schedule
sites are opaque — the drain can't tell a light-only ripple from a real geometry edit, so it
must assume the worst (full remesh) every time.

**Edit 0.2 — record the reason in `scheduleChunkUpdate`.** Site: ~17590.

*Current (17590, 17600–17601):*
```js
function scheduleChunkUpdate(cx, cz, force = false, source = "generic", { bypassLighting = false, immediate = false } = {}) {
    const key = `${cx},${cz}`;
    ...
    pendingChunkUpdates.add(key);
    dirtyChunks.add(key);
```
*Proposed:*
```js
function scheduleChunkUpdate(cx, cz, force = false, source = "generic", { bypassLighting = false, immediate = false, reason = DIRTY_REASON.GEOMETRY } = {}) {
    const key = `${cx},${cz}`;
    chunkDirtyReason.set(key, (chunkDirtyReason.get(key) || 0) | reason);
    ...
    pendingChunkUpdates.add(key);
    dirtyChunks.add(key);
```
Then pass the bit at the light/seam call sites (the only behavioural change — defaults keep
every other caller identical):
- `edge-lighting` / `edge-lighting-capflush` (17347 / 17281): add `reason: DIRTY_REASON.LIGHT`.
- `sunlight-task` (24535), `light-propagation` (24270): add `reason: DIRTY_REASON.LIGHT`.
- `neighbor-update` (16814): add `reason: DIRTY_REASON.NEIGHBOR_TREE`.

*Reason:* tags each schedule so the drain (and Phase 3) can downgrade light-only dirties to a
color upload. Every untouched caller defaults to `GEOMETRY`, so behaviour is unchanged until a
consumer reads the mask.

**Edit 0.3 — de-dupe the neighbor drain against the primary queue.** Site: neighbor-update loop
in `processChunkQueue` (~41529).

*Current (41529–41531):*
```js
for (const key of toUpdate) {
    chunkNeighborUpdateQueue.delete(key);
    const [cx, cz] = parseChunkKey(key);
```
*Proposed:*
```js
for (const key of toUpdate) {
    chunkNeighborUpdateQueue.delete(key);
    // COALESCE: if this chunk is already scheduled by the primary path, that rebuild will
    // pick up the neighbor change too — a second build here is a duplicate full-column rebuild.
    if (queuedChunkKeys.has(key) || pendingChunkUpdates.has(key) || dirtyChunks.has(key)) continue;
    const [cx, cz] = parseChunkKey(key);
```
*Reason:* the neighbor queue and the primary queue are independent; the same chunk frequently
sits in both within one second (neighbor streamed in **and** edited / edge-lit). This collapses
the two into the single primary rebuild. (`runNeighborReconciliationSweep` already does this
check at 16625 when *enqueuing*; this adds the symmetric check at *dequeue* for entries added by
other paths.)

**Edit 0.4 — clear the reason mask on rebuild.** Site: `processChunkQueue`, where dirty is
cleared (~41495).

*Current (41495):*
```js
if (isDirty) { dirtyChunks.delete(job.key); }
```
*Proposed:*
```js
if (isDirty) { dirtyChunks.delete(job.key); }
chunkDirtyReason.delete(job.key); // rebuild captured all accumulated reasons
```
*Reason:* reset the mask once a build runs so the next event starts clean; prevents a stale
`LIGHT` bit from mis-routing a later geometry edit to the color-only path (Phase 3).

> ⚠ **Ordering dependency:** this clear sits at ~41495, *before* the build branch (~41503).
> Phase 3 (Edit 3.3) reads `chunkDirtyReason` in that branch, so when Phase 3 lands this
> `delete` must move to **after** the refill/remesh decision (or capture the mask into a local
> first). In Phase 0 alone, clearing here is correct because nothing downstream reads the mask.

---

### Phase 1 — Decouple build-gating from frustum  *(low–medium risk)*

**Edit 1.1 — build the whole in-range ring, not just the view cone.** Site: visibility sweep in
`updateChunkSystem` (~41248).

*Current (41248–41250):*
```js
if (!isChunkInFrustum(cx, cz, playerPos, normCamX, normCamZ, distSq, innerRadiusSq, cosThresholdSq, hasHorizontalCameraDir)) { culled++; continue; }
neededKeys.add(key);
if (!chunkMeshes.has(key) && !queuedChunkKeys.has(key)) { needed.push({ key, cx, cz, dist: distSq }); }
```
*Proposed:*
```js
const inFrustum = isChunkInFrustum(cx, cz, playerPos, normCamX, normCamZ, distSq, innerRadiusSq, cosThresholdSq, hasHorizontalCameraDir);
if (inFrustum) { neededKeys.add(key); } else { culled++; }
// BUILD the mesh for in-range chunks even when frustum-culled, but only within BUILD_AHEAD_RADIUS
// (see below) to bound resident memory. Built meshes set mesh.frustumCulled =
// SETTINGS.enableFrustumCulling (40835/40915), so Three.js skips them at DRAW time when
// off-screen — i.e. the manual frustum test was only ever throttling BUILDS, and gating builds is
// what makes rotation reveal a wall of unmeshed chunks.
const buildEvenIfCulled = distSq <= BUILD_AHEAD_RADIUS * BUILD_AHEAD_RADIUS;
if ((inFrustum || buildEvenIfCulled) && !chunkMeshes.has(key) && !queuedChunkKeys.has(key)) {
    needed.push({ key, cx, cz, dist: distSq, deprioritize: !inFrustum });
}
```
Add the cap near the other sweep constants (`INNER_RADIUS`, ~41199):
```js
// Pre-mesh the near ring in all directions so rotation reveals built geometry, while keeping
// the far ring frustum-gated so resident mesh count stays bounded. 10–12 keeps the disc area
// (~π·r²) under maxAllowedMeshes at the default maxCachedChunks (350).
const BUILD_AHEAD_RADIUS = Math.min(currentRenderRadius, 10);
```
*Reason:* **this is the direct fix for Q4 (culled chunks slow to load).** Today a chunk behind
you is never generated/meshed until you rotate, then the whole near ring builds at once on the
main thread. Pre-meshing the near ring means rotation reveals already-built geometry. Draw cost
does not rise (Three.js draw-culls the off-screen meshes).

⚠ **Memory — do NOT pre-mesh the *whole* render disc unbounded.** The existing prune (41273–41301)
and cleanup (41307–41308) only release meshes whose base key is **not in `chunksInRange`** (41292);
since pre-meshed chunks *are* in range, neither path can evict them. An unbounded full-disc build
takes resident terrain meshes to ~`π·maxR²` (e.g. ~800 at render distance 16) vs. today's
view-cone subset (~340), exceeding `maxAllowedMeshes = max(maxCachedChunks≈350, maxR²·2)` past
~render distance 12 — at which point the prune fires every frame and frees nothing. The
`BUILD_AHEAD_RADIUS` cap keeps the always-built disc small (π·10² ≈ 314 ≤ 350) and leaves the far
ring frustum-gated as today.

**Edit 1.2 — keep visible chunks building first.** Site: `needed` sort (~41312).

*Current (41312):*
```js
if (recomputedFrustum) { needed.sort((a, b) => a.dist - b.dist); }
```
*Proposed:*
```js
if (recomputedFrustum) { needed.sort((a, b) => (a.deprioritize - b.deprioritize) || (a.dist - b.dist)); }
```
*Reason:* in-frustum chunks (`deprioritize=false=0`) sort ahead of off-screen ones, so what the
player is looking at still meshes first; the off-screen ring backfills with leftover budget.

**Watch-outs for Phase 1 (call out in review):**
- `runNeighborReconciliationSweep` uses `neededKeys` (now frustum-only) as its candidate set
  (16621) — that's fine and desirable (only seam-fix visible chunks), but confirm no other
  consumer of `neededKeys` expected it to equal the full in-range set.
- Resident mesh count rises by roughly the always-built disc area `π·BUILD_AHEAD_RADIUS²` minus
  today's view cone. With the cap at 10 that's ~314 chunks — within the default
  `maxAllowedMeshes` floor. If `BUILD_AHEAD_RADIUS` is later raised, re-confirm `maxAllowedMeshes`
  (41273) and `MemoryBudgetManager` headroom, **and** teach the prune to evict in-range-but-culled
  chunks (today it can't — 41292), else the budget is unenforceable (Open Question 2).
- `MAX_CHUNK_QUEUE_SIZE = 64` (41325) caps the *build queue*, so the pre-mesh ring backfills
  closest-first over several frames rather than all at once — desirable, but means the far edge of
  `BUILD_AHEAD_RADIUS` populates gradually, not instantly.
- Pair with extending pre-gen (`SPIRAL_OFFSETS`, 9894) so terrain *data* for the ring is ready
  before the build wave, else first-sight `await generateChunkData` (41491) just moves the
  stall earlier.

---

### Phase 2 — Banded mesh output  ⚠ *(high risk; mesher-core; behind `SETTINGS.bandedMeshing`)*

This is **not** expressible as a handful of verbatim before/after edits — it changes the unit of
geometry from "one buffer per chunk" to "one buffer per vertical band," which touches the mesher
output **and every site that iterates `chunkMeshes`**. Specifying it as a fake clean diff would
misrepresent the work. The concrete touch-points an implementer must change:

1. **Mesh key scheme.** `chunkMeshes.set(cKey, …)` / `set(cKey + "_WATER", …)` (40843 / 40920)
   become `set(cKey + "#" + band, …)` / `set(cKey + "#" + band + "_WATER", …)`. **Add** a
   `bandKey(cKey, band)` helper and route all reads/writes through it.
2. **Mesher loop.** The single section loop (`for sectionIdx … SECTIONS_PER_CHUNK`, 40438) must
   flush its work buffers (`terrainPos/Cols/…`) into a band geometry at each band boundary and
   reset counters, instead of accumulating the whole column into one buffer (40771–40845).
   `MAX_FACES_PER_CHUNK` sizing (40367) becomes per-band sizing from `section.faceCount` (40240).
3. **Geometry pool.** `GeometryBufferPool` (class ~18349) needs a band tier (smaller than
   `GEO_TIER_SMALL`) so N band buffers per chunk don't waste the column-sized allocation.
4. **Every `chunkMeshes` iterator** must become band-aware — census before coding:
   - mesh cleanup / out-of-range release (41307–41308),
   - proactive mesh prune (41278–41301),
   - `releaseMeshForKey` and the deferred-release swap (40925+),
   - `terrainMeshCount` / `waterMeshCount` accounting (40844 / 40921),
   - geometry-leak detection (`checkGeometryLeaks`),
   - any `chunkMeshes.get(cKey)` / `cKey + "_WATER"` lookup (e.g. 40290–40291).
5. **Dirty scope.** Pair with Phase 0: `scheduleChunkUpdate`'s options gain a `band` (the
   concrete form of the `markChunkDirty` concept from Part 2 Q2 — Part 6 extends the existing
   function rather than adding a parallel one) so an edit at y=64 rebuilds one band; `setBlock`
   (24852+) computes the band from `y` and passes it through.

*Reason:* once geometry is banded, **every other improvement collapses in cost** — a block edit
or a border light change rebuilds an 80-block band, not a 320-block column, and Phase 3's
color-refill operates on one band. *Trade-offs* (draw calls, lost vertical greedy merges, pool
pressure) are analysed in Part 2 Q1. Recommend prototyping at **4 bands** first and gating on
`SETTINGS.bandedMeshing` for A/B.

---

### Phase 3 — Light out of the geometry  ⚠ *(medium–high risk; depends on Phase 2 for full value)*

**Why this is not a one-liner:** merged quads currently apply the **seed cell's** corner light to
the entire quad — valid *only because light is in the merge key*, so every cell in a quad shares
the same light pattern (comment at 39469–39471: *"cells only merge with identical patterns, so
the seed cell's values are valid across the whole quad"*). Dropping light from the merge key
without also fixing quad-corner light would **flatten lighting across every merged quad**. So
Phase 3 is three coordinated edits.

**Edit 3.1 — remove light from the merge key.** Site: `getMergeKey` (38581–38600).

*Current (38595–38599):*
```js
return (blockId << 20) | (l0 << 17) | (l1 << 14) | (l2 << 11) | (l3 << 8)
     | (AO_QUANT_LOOKUP[Math.round(ao[0] * 100)] << 6)
     | (AO_QUANT_LOOKUP[Math.round(ao[1] * 100)] << 4)
     | (AO_QUANT_LOOKUP[Math.round(ao[2] * 100)] << 2)
     |  AO_QUANT_LOOKUP[Math.round(ao[3] * 100)];
```
*Proposed (drop the 12 light bits; `light` param kept for call-shape but unused):*
```js
// Light is NO LONGER in the merge key — it moved to a per-vertex attribute updated in place
// (see refillChunkLightColors). Faces now merge on blockId + AO only, so a light change does
// not alter the face set and can be applied without re-meshing.
return (blockId << 8)
     | (AO_QUANT_LOOKUP[Math.round(ao[0] * 100)] << 6)
     | (AO_QUANT_LOOKUP[Math.round(ao[1] * 100)] << 4)
     | (AO_QUANT_LOOKUP[Math.round(ao[2] * 100)] << 2)
     |  AO_QUANT_LOOKUP[Math.round(ao[3] * 100)];
```
Update the `blockId` extraction that assumes the old shift: `const blockId = mergeKey >> 20;`
(39457) → `const blockId = mergeKey >> 8;`.

**Also DELETE the now-dead light computation (38586–38594)** — `getMergeKey` is a hot per-face
call, so leaving the unused `l0..l3` block in place wastes the work this edit is meant to save:
```js
// DELETE these lines (38586–38594) — l0..l3 are no longer referenced:
let l0, l1, l2, l3;
if (typeof light === "number") {
    l0 = l1 = l2 = l3 = LIGHT_QUANT_LOOKUP[Math.round(light * 100)];
} else {
    l0 = LIGHT_QUANT_LOOKUP[Math.round(light[0] * 100)];
    l1 = LIGHT_QUANT_LOOKUP[Math.round(light[1] * 100)];
    l2 = LIGHT_QUANT_LOOKUP[Math.round(light[2] * 100)];
    l3 = LIGHT_QUANT_LOOKUP[Math.round(light[3] * 100)];
}
```
(The `light` param itself stays in the signature for call-shape compatibility, like the unused
`norm` param elsewhere.) Sentinel note: the `greedyMergeKeys[idx] === 0` empty-cell test (39423)
still holds — a real face has `blockId ≥ 1`, so the new key is `≥ 256`, never 0.

*Reason:* makes geometry topology **light-independent** — the prerequisite for treating light as
a cheap attribute update instead of a remesh trigger.

**Edit 3.2 — sample merged-quad light at the four physical corners.** ⚠ Site: 39469–39479 and
`addMergedFaceIndexed`.

*Current (39476–39479):*
```js
_greedyLightScratch[0] = greedyLight[idx * 4 + 0];
_greedyLightScratch[1] = greedyLight[idx * 4 + 1];
_greedyLightScratch[2] = greedyLight[idx * 4 + 2];
_greedyLightScratch[3] = greedyLight[idx * 4 + 3];
```
*Proposed (spec — sample the quad's 4 corner cells, not the seed cell; exact corner→vertex
mapping must match the quad winding in `addMergedFaceIndexed`):*
```js
// Quad spans [u..u+width-1] × [v..v+height-1]; with light out of the merge key these cells may
// differ, so take light from the FOUR corner cells and let the GPU interpolate across the quad.
const idxTL = idx;                                   // (u, v)
const idxTR = v * uSize + (u + width - 1);           // (u+w-1, v)
const idxBL = (v + height - 1) * uSize + u;          // (u, v+h-1)
const idxBR = (v + height - 1) * uSize + (u + width - 1);
_greedyLightScratch[0] = greedyLight[idxTL * 4 + 0];
_greedyLightScratch[1] = greedyLight[idxTR * 4 + 1];
_greedyLightScratch[2] = greedyLight[idxBR * 4 + 2];
_greedyLightScratch[3] = greedyLight[idxBL * 4 + 3];
```
*Reason:* preserves smooth lighting/gradients across larger quads now that differing-light cells
can merge. **Verify** the corner index→vertex-slot mapping against `addMergedFaceIndexed`'s
winding for each `faceIdx` before trusting it — this is the single trickiest correctness point in
Phase 3 and warrants a `voxex-texture-tests`/visual check.

**Edit 3.3 — light-only color refill (no remesh).** ⚠ Site: new function + a branch in
`processChunkQueue` (~41503).

*Add* a function that rewrites only the color attribute of an existing band/chunk mesh, reusing
the established partial-upload pattern (40808–40810):
```js
// Rewrite ONLY vertex colors for an already-built mesh from current chunk light — no geometry,
// no re-merge. Requires geo.userData.lightMap: per-vertex (cellIdx, cornerSlot) recorded at
// build time so colors can be recomputed in place. Returns false if no map (forces full remesh).
function refillChunkLightColors(meshKey) {
    const mesh = chunkMeshes.get(meshKey);
    const map = mesh && mesh.geometry.userData.lightMap;
    if (!map) return false;
    const colAttr = mesh.geometry.attributes.color;
    // ... recompute each face's SMOOTH corner light (calculateFaceCornerLight, 38514) — NOT a single
    // cell — so colors match a remesh when smoothLighting is on; write colAttr.array[i..i+2] ...
    // (Full smooth-light-correct version + the per-face lightMap layout is in CHUNK-IMPLEMENTATION-PLAN.md §3.3.)
    colAttr.clearUpdateRanges();
    colAttr.addUpdateRange(0, map.vertexCount * 3);
    colAttr.needsUpdate = true;
    return true;
}
```
*Branch* in the build drain. The real site (41503–41510) is the `WORKER_MESH_PIPELINE_ENABLED`
if/else, **not** a bare `renderChunk`, and Edit 0.4's `chunkDirtyReason.delete` must be relocated
here so the mask survives long enough to be read. Capture the reason first, then wrap the existing
branch:
```js
// (Edit 0.4's `chunkDirtyReason.delete(job.key)` at ~41495 is REMOVED and replaced by the
//  per-branch deletes below, so the mask is still readable here.)
const reasonMask = chunkDirtyReason.get(job.key) || 0;
// LIGHT-only dirty + mesh already exists ⇒ cheap color upload instead of a full remesh.
if (reasonMask === DIRTY_REASON.LIGHT && chunkMeshes.has(job.key) && refillChunkLightColors(job.key)) {
    chunkDirtyReason.delete(job.key);
    recordChunkUpdateState(job.key, "light-refill", "rendered");
    chunkUpdateDiagnostics.pending.delete(job.key);
} else if (WORKER_MESH_PIPELINE_ENABLED && SETTINGS.useWorkersForMesh && chunkWorkerPool) {
    dispatchMeshJob(jobCx, jobCz, job.key, jobDistSq);   // existing path
    chunkDirtyReason.delete(job.key);
} else {
    renderChunk(jobCx, jobCz, jobDistSq);                // existing path
    recordChunkUpdateState(job.key, "processChunkQueue", "rendered");
    chunkUpdateDiagnostics.pending.delete(job.key);
    chunkDirtyReason.delete(job.key);
    // ... existing meshLifecycleStats.mark("dirtyRebuild", ...) ...
}
```
Plus, at build time, populate `geo.userData.lightMap` in the mesher (the vertex write in
`writeFaceVertices`/`addMergedFaceIndexed`).
*Reason:* **the payoff for the whole CCR.** Edge-lighting convergence, sunlight settle, and torch
ripple — the dominant "unchanged geometry, remeshed anyway" costs (Q3/Q5) — become a single
color-buffer upload. Memory cost: one small per-mesh vertex→cell map; prototype behind a flag and
measure before making it the default.

---

### Phase 4 — Re-enable the worker mesh pipeline  *(gated; NOT a safe standalone flip today)*

**Edit 4.1 — flip the gate, only after parity.** Site: 13441.

*Current:*
```js
const WORKER_MESH_PIPELINE_ENABLED = false;
```
*Proposed (eventually):*
```js
const WORKER_MESH_PIPELINE_ENABLED = true;
```
*Reason:* moves the build burst off the main thread. **Do not flip this in isolation.** The
worker mesh path (`renderChunkWorker`/dispatch, ~19262–19580; apply drain
`drainReadyMeshResults`, ~19571) must first reach **parity** with `renderChunk`: greedy meshing,
the new per-vertex light + `lightMap` (Phase 3), water attributes (shore/thickness/foam), tiered
band buffers (Phase 2), and tight bounds. Parity must be proven by the live worker round-trip
tests in `tools/voxex-tests.html` before the flag goes true. Flipping early ships chunks meshed
by a stale code path (the reason it was gated off in the first place). Sequence it **last**, after
Phases 1–3 have shrunk per-build cost and the worker mesher has been brought up to match.

---

### Summary: what each edit buys

| Edit(s) | Removes | Net effect |
|---|---|---|
| 0.3 | duplicate neighbor-vs-primary rebuilds | same chunk rebuilds **once** per frame, not 2–3× |
| 0.1/0.2/0.4 | (groundwork — dirty-reason mask) | enables Phase 3's light-only routing |
| 1.1–1.2 | frustum-gated meshing | **no rotate-to-load pop-in** (Q4) |
| 2.x | full-column rebuilds | edit/light/seam rebuild **one band**, not 320 blocks (Q1) |
| 3.1–3.3 | light baked in geometry | light change ⇒ **color upload, not remesh** (Q3, most of Q5) |
| 4.1 | main-thread build cost | build burst runs **off-thread** |

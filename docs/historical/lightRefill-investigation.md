> **Status: HISTORICAL investigation (lightRefill shipped default-OFF)** _(marked 2026-07-06; see CLAUDE.md Documentation Index)_

# Investigation Brief — `lightRefill` Visual Artifact (VoxEx)

**Status:** Deferred / optional polish. `SETTINGS.lightRefill` is **OFF by default** and should stay
off until this is resolved. Phase 4 (off-thread worker meshing) is complete and correct **without**
lightRefill — this only affects the *edit* path.

**Goal of the investigation:** make `lightRefill` produce **byte-identical** vertex colors to a full
re-mesh, so it can be enabled by default and remove the edit-path frame spikes — without the visible
lighting/AO shift described below.

---

## 0. Findings — code audit 2026-06-19

A full read of the refill + mesh + worker paths narrows the field:

- **(C) color parity — DISPROVEN as a steady-state math bug.** For a *fixed* block+light state the
  refill is provably byte-identical to a fresh mesh: the color write is the same `ao[k]*light[k]` with
  no directional shading or clamp on either side (`addMergedFaceIndexed` vs `_refillChunkLightColorsImpl`);
  `buildChunkLightGetters` is a verbatim copy of the in-mesh `getLocal`/`ownEdgeLight`/`getLocalLight`
  (same missing-neighbor fallback); the light path has **no cached state** (`calculateVertexCornerLight`
  is pure — the only cache, `aoCache`, feeds `calculateFaceAO`, which the refill never calls, so the
  skipped `initAOCache()` is irrelevant); `_lastDampLevel` is read only by `getMergeKey` at mesh time and
  ignored by the refill; and the corner-cell index alignment matches (mesh samples
  `greedyLight[cornerCell*4 + k]`, refill recomputes `cellCornerLightDamped(cornerCell)[k]` — same cell,
  same `k`).

- **(A) stale AO — DISPROVEN for the edit path.** Dirty reasons coalesce (`scheduleChunkUpdate` ORs and
  only clears on drain) and the refill branch fires only on `_reasonMask === LIGHT` *exactly*, so any
  chunk that accumulates `GEOMETRY|LIGHT` re-meshes. Edits flag `GEOMETRY` on every AO-affected chunk
  (center + orthogonal edges + diagonal corners), and pure light propagation never changes blocks/AO.
  So AO cannot be stale on a refill that results from an edit.

- **(B) worker lightMap — OPEN, and it is the live suspect.** Worker meshing is **ON**
  (`WORKER_MESH_PIPELINE_ENABLED = true`; the old "gated off" note is stale). Edited chunks are banded →
  routed to the main mesher; **never-edited (streaming) chunks stay unbanded → meshed by the worker →
  carry a worker-produced lightMap** that the refill later reads. The Phase 4 parity test validated worker
  mesh *colors* with `lightRefill` off, so the worker `lightMap` (`cells`/`ao`/`face`) has **never** been
  byte-compared. The reported scenario hits exactly this: place a block → its unbanded neighbor gets a
  GEOMETRY re-mesh *via the worker* (fresh worker lightMap) → light propagates → neighbor flagged
  `LIGHT`-only → refill reads the worker lightMap.

**Implication:** since refill==mesh for a fixed state, a real shift can only come from the stored `lm`
data not matching a fresh main-thread mesh. With (A) ruled out for edits, that points at the worker
lightMap (B). If (B) also proves clean, the "shift" is the legitimate light update landing as an
**in-place color write on the live mesh** (vs the atomic geometry swap of a re-mesh) — i.e. a perception
artifact, not a parity bug, and the byte-identical goal is already met on the main path.

**Tests added (2026-06-19)** to make this decisive — `tools/voxex-tests.html`, suite
*"Tier 4: lightRefill byte-parity"*:
1. **Criterion #1** — `refillChunkLightColors` == fresh-mesh colors (main thread, exact). Oracle is
   `meshChunkHeadless`, which now records a `lightMap` when `SETTINGS.lightRefill` is on.
2. **Criterion #2** — worker `lightMap` (`cells` exact, `face` exact, `ao` float-tight) == the headless
   lightMap, run with `meshSettings.lightRefill = true`.

**RESULT (2026-06-19): both GREEN (2/2).** So §6 acceptance criteria **#1 and #2 are met** —
`refillChunkLightColors` writes byte-identical colors to a full re-mesh for a fixed state (closes C, and
A for the edit path), and the worker `lightMap` is byte-identical to the main/headless one (closes B).
The parity question is settled in code; the prior "strongest suspect" (worker lightMap) is **not** the
cause.

**Therefore the residual in-game "shift", if still visible, is NOT a parity/color bug.** It can only be
the legitimate light-settle update landing as an **in-place color write on the standing mesh** (refill)
versus the **atomic geometry swap** of a re-mesh — a timing/perception difference, not wrong colors. Next
step is the human visual gate (criterion #3): `setLightRefill(true)`, place blocks + fly, and judge
whether any perceptible shift remains. If clean → flip `SETTINGS.lightRefill` default on + add to
`SETTINGS_PROFILES` (criterion #4). If a pop is still objectionable → address it as a *settle-timing*
issue (e.g. only refill once light is fully settled, or coalesce the refill), NOT as a color bug.

---

## 1. What `lightRefill` is (context)

`voxEx.html` is a single-file Three.js voxel engine (~45K lines). Chunks are meshed into vertex
buffers; each vertex's color is `AO × (light / 15)`.

`lightRefill` (Phase 3B) is an optimization: when a chunk changes **light only** (no geometry change),
instead of re-meshing the whole chunk, it **recomputes just the vertex colors in place** from the
current light — much cheaper than rebuilding geometry.

Mechanism:
- During meshing, when `SETTINGS.lightRefill` is on, the mesher records a per-quad **`lightMap`** onto
  the geometry: `geo.userData.lightMap = { quadCount, cells, ao, face }` where for each quad it stores
  the 4 corner **cell indices** (`cells`), the 4 corner **AO values** (`ao`), and the **face index**
  (`face`). (Built into module scratch arrays `_lmCells` / `_lmAO` / `_lmFace` inside
  `greedyMeshSection`, then sliced onto the geometry in `flushBand` (main thread) or emitted in the
  worker payload + copied in `applyWorkerMeshData`.)
- On a light-only change, `refillChunkLightColors()` recomputes each vertex color as
  `lm.ao[k] × cellCornerLightDamped(face normal, corner cell, getLocal, getLocalLight)[k]` and writes
  it straight into the color attribute — **no geometry rebuild**.
- It's triggered from the chunk-build drain in `processChunkQueue`:
  `if (SETTINGS.lightRefill && _reasonMask === DIRTY_REASON.LIGHT && refillChunkLightColors(key)) {...}`
  — i.e. only when the chunk's accumulated dirty reason is **exactly** `LIGHT` (no geometry).

## 2. The win (why it's worth fixing)

Measured edit-path run (place blocks + fly), `lightRefill` **on** vs **off**:

| metric | off | on |
|---|---|---|
| main-thread `builds` | 106 | **28** |
| `worstFrameMs` | 58.6 | **26.8** |
| `maxBuildMs` | 18.4 | **15.3** (under the 16.7ms frame budget) |
| `meshMsPerSec` | 10.7 | **3.75** |
| refills | 0 | 412 @ ~4ms |

So it cleanly removes the edit-path frame spikes by turning geometry rebuilds into cheap color updates.

## 3. The symptom (why it's gated off)

With `lightRefill` on: **placing a block causes a visible lighting/AO shift on/near the edited chunk
that feels "disconnected" from the placement** — the block appears, then a beat later the shading/shade
amount changes. With `lightRefill` off (re-mesh path) this does not happen.

**Reproduce:** `setLightRefill(true)` in the console, place blocks (especially on surfaces that cast
shadow and near chunk borders), fly around. Watch the shading on and around the placed block in the
frames just after placement. Compare to `setLightRefill(false)`.

## 4. Hypotheses to investigate (most likely first)

### (C) Refill-time light ≠ mesh-time light (color parity) — **DISPROVEN (see §0)**, kept for record
Both the mesher and the refill compute light via the **shared** `cellCornerLightDamped(nx,ny,nz,x,y,z,
getLocal, getLocalLight)` — that was the design intent, so they *should* match. But they call it with
**different getters and in a different context**:
- At **mesh time**, `getLocal`/`getLocalLight` are the closures built inside the mesher.
- At **refill time**, they come from `buildChunkLightGetters(cx,cz)` (a "faithful copy" of the in-mesh
  getters).
If those getters differ at all (neighbor handling, the missing-neighbor `ownEdgeLight` fallback, the
floor-at-3, water attenuation), OR if `cellCornerLightDamped`'s module-level `_lastDampLevel` state is
left in a different value at refill time than at mesh time, the refilled color will differ from the
meshed color — producing a one-time visible shift the first time a chunk is refilled after meshing.
- **Check:** for a fixed chunk + light state, does `refillChunkLightColors` write the **exact same**
  color bytes a full `renderChunk` would? Build a test (extend `tools/voxex-tests.html`): mesh a chunk,
  snapshot its color attribute, force a light-only refill, snapshot again — assert byte-identical.
- **Check `_lastDampLevel`:** it's set as a side effect inside `cellCornerLightDamped` (0 dry / 1 light
  / 2 dark) and read by `getMergeKey`. Confirm the refill path doesn't depend on stale damp state and
  that the damp level is recomputed per cell identically in both paths.

### (A) Stale AO on a light-only refill — **DISPROVEN for edits (see §0)**
The refill multiplies live light by the **stored** `lm.ao` (AO captured at mesh time). It never
recomputes AO. This is correct *only if* AO truly cannot change on a `LIGHT`-only dirty. Verify that
invariant:
- Can a chunk ever be flagged `DIRTY_REASON.LIGHT` (only) while its AO actually changed? (AO is a
  geometry property — a placement that changes a neighbor's AO should flag `GEOMETRY`, forcing a
  re-mesh, not a refill.) Audit the dirty-reason tagging on every path that marks chunks light-dirty
  (`SunlightTask` / `updateSunlightAt` / `updateBlockLightAt` / light-propagation schedules) to confirm
  none of them coincide with an AO change that gets routed to a refill.

### (B) Unvalidated **worker** lightMap — **LIVE SUSPECT (see §0)**; test added
The Phase 4 byte-parity test ran with `lightRefill` **off**, so the worker emitted `lightMap = null`
and the test **never compared worker-vs-main lightMaps**. With `lightRefill` on, worker-meshed
(unbanded/streaming) chunks carry a **worker-produced** lightMap (`cells`/`ao`/`face`) that
`refillChunkLightColors` later reads. If the worker's lightMap differs from what the main thread would
produce, refilling those chunks shifts color.
- **Check:** extend the "worker MESH byte-parity" test (`tools/voxex-tests.html`, Tier 4) to run with
  `meshSettings.lightRefill = true` and byte-compare `terrain.lightMap` (`cells`, `ao`, `face`,
  `quadCount`) worker-vs-`meshChunkHeadless`. (Note: `meshChunkHeadless` currently does **not** build a
  lightMap — it would need to, to serve as the oracle here.)

## 5. Relevant code (search by name; line numbers drift)

- `refillChunkLightColors` / `_refillChunkLightColorsImpl` — the refill itself (reads
  `geo.userData.lightMap`, calls `buildChunkLightGetters` + `cellCornerLightDamped`).
- `buildChunkLightGetters` — the getters the refill uses (vs the in-mesh getters).
- `cellCornerLightDamped` — shared light+damp; sets module `_lastDampLevel`.
- `greedyMeshSection` — builds `_lmCells`/`_lmAO`/`_lmFace` when `SETTINGS.lightRefill` (indexed by
  quad = `state.cIdx / 12`).
- `flushBand` — copies the slice to `geo.userData.lightMap` (main-thread path).
- Worker `'mesh'` handler in `CHUNK_WORKER_CODE` (built by `buildChunkWorkerCode`) — emits
  `terrain.lightMap` when `SETTINGS.lightRefill`.
- `applyWorkerMeshData` — `geo.userData.lightMap = terrain.lightMap || null` (worker path).
- `processChunkQueue` drain branch — `SETTINGS.lightRefill && _reasonMask === DIRTY_REASON.LIGHT &&
  refillChunkLightColors(...)`.
- Console toggles: `setLightRefill(true/false)`; profiler `meshProfile()` reports `refills` /
  `avgMsPerRefill`.
- Test: `tools/voxex-tests.html` → "Tier 4: worker MESH byte-parity".

## 6. Acceptance criteria

1. A test asserts `refillChunkLightColors` writes **byte-identical** colors to a full re-mesh for the
   same light + AO state (closes hypothesis C, and A if AO truly can't be stale).
2. The worker MESH byte-parity test, run with `lightRefill = true`, byte-compares the worker `lightMap`
   to the main/headless lightMap and is green (closes hypothesis B).
3. In-game: `setLightRefill(true)`, place blocks + fly — **no** visible shading/AO shift vs
   `lightRefill` off.
4. Only then: consider flipping `SETTINGS.lightRefill` default to **on** (and add it to
   `SETTINGS_PROFILES`), with the edit-path `meshProfile()` win confirmed.

## 7. Priority

**Low / optional.** Phase 4's objective (streaming meshing off the main thread) is complete without
lightRefill — streaming shows **0 main-thread builds**. lightRefill only improves the *edit* path
(~1% main-thread load + an occasional ~58ms → ~27ms edit-frame spike). Worth doing if the edit-path
spike becomes annoying or before shipping a "max smoothness" config; not blocking anything.

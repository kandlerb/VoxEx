# Implementation Plan — Chunk Update / Remesh Consolidation & Efficient Chunking

**Project:** VoxEx (`voxEx.html`, single-file Three.js voxel engine)
**Companion to:** `CCR-chunk-remesh-consolidation.md` (the audit + design rationale). This document
is the **build order and full code-level spec** for executing that CCR.
**Status:** Plan — nothing here is applied yet.

> **Line numbers verified against the working tree on 2026-06-17 and WILL drift.** Grep the quoted
> identifier before editing. Every code block below was checked against current source; where a
> change is a structural rewrite (Phase 2, parts of 3/4) the spec gives real function bodies and
> the exact touch-point census rather than a fictional verbatim diff of a 600-line function.
>
> **Single-file rule:** all code stays in `voxEx.html`. Tools (`tools/voxex-tests.html`,
> `tools/terrain-visualizer.html`) are the only other files touched.

---

## 0. How to use this plan

Each phase below has the same shape:

1. **Goal** — one line.
2. **Prerequisites** — what must land first.
3. **Tasks** — ordered, each with the exact site, current code, proposed code, reason.
4. **Settings / wiring** — new `SETTINGS` keys and DOM, if any.
5. **Tests** — what to add/update in `tools/voxex-tests.html`.
6. **Acceptance criteria** — how you know it's done and correct.
7. **Rollback** — how to back it out.

Ship phases in the order **0 → 1 → 2 → 3 → 4**. Phases 0 and 1 are independent of each other and
both low-risk; do them first to bank wins and de-risk measurement. Phase 2 is the architectural
core; 3 depends on 2 for full value; 4 is last.

### Dependency graph

```
Phase 0 (coalescing scheduler) ─┐
                                ├─► Phase 2 (banded meshing) ─► Phase 3 (light decoupling) ─► Phase 4 (worker parity)
Phase 1 (frustum/build split) ──┘            ▲                          ▲
                                             │                          │
                              uses DIRTY_REASON band field   uses Phase 2 band buffers
```

### Effort / risk summary

| Phase | Effort | Risk | Reversible? |
|---|---|---|---|
| 0 Coalescing scheduler | S | Low | Yes (pure routing) |
| 1 Frustum/build split | S | Low–Med | Yes (one guard) |
| 2 Banded meshing | **L** | **High** | Yes (behind `SETTINGS.bandedMeshing`) |
| 3 Light decoupling | M–L | Med–High | Yes (behind `SETTINGS.lightRefill`) |
| 4 Worker mesh parity | M | Med | Yes (`WORKER_MESH_PIPELINE_ENABLED`) |

---

## 1. Shared prerequisites (do once, before Phase 0)

### 1.1 Settings-wiring pattern (used by Phases 2, 3)

A new boolean perf setting follows the existing `greedyMeshingEnabled` pattern exactly:

- **SETTINGS load** (~5871): `bandedMeshing: savedSettings.bandedMeshing !== undefined ? savedSettings.bandedMeshing : false,`
- **DEFAULTS** (~6125): `bandedMeshing: false,   // Phase 2: per-band geometry output`
- **DOM toggle** (optional, Graphics > Performance, event wiring ~28800+): only if you want a user
  switch; perf-internal flags can ship without UI and be flipped in `DEFAULTS`. Recommend **no UI**
  for `bandedMeshing`/`lightRefill` during rollout — keep them dev-flags until proven, then expose.
- **Profiles:** leave OUT of `SETTINGS_PROFILES` during rollout (like the touch prefs) so profile
  switches don't toggle an experimental path mid-session.
- **Round-trip:** if exposed in UI, `saveSettings()` already persists any `SETTINGS` key, and
  `updateUIFromSettings()` syncs the DOM — only needed if a DOM control exists.

### 1.2 Test harness

`tools/voxex-tests.html` (~1108 lines) loads the real game in a hidden iframe via the `?test=1`
seam and exposes `window.VoxEx`. Tests use a mini-Jest (`describe`/`it`/`expect`, defined ~46–47).
New unit tests register inside the existing `runTests()` body next to related suites. Must be served
over localhost (Workers + IndexedDB). The deployed copy is
`https://kandlerb.github.io/VoxEx/tools/voxex-tests.html`.

### 1.3 Build banner

Every phase bumps `VOXEX_BUILD` and prepends a line to `VOXEX_RECENT_CHANGES` (top of `voxEx.html`,
console boot banner) — this is the project's change-log convention.

---

## Phase 0 — Coalescing scheduler

**Goal:** one per-chunk dirty-reason mask in front of `renderChunk`, so the ~16 schedule paths
de-dupe and Phase 3 can later route light-only dirties to a cheap path.

**Prerequisites:** none.

### Tasks

**0.1 — Declare the mask.** After `dirtyChunks` (16426):
```js
const dirtyChunks = new Set(); // unchanged
// COALESCING: per-chunk dirty-reason bitmask. Schedule paths OR their reason; the build drain
// reads it to de-dupe and (Phase 3) pick the cheapest rebuild. The `band` field is added in Phase 2.
const DIRTY_REASON = { GEOMETRY: 1, LIGHT: 2, SEAM: 4, NEIGHBOR_TREE: 8 };
const chunkDirtyReason = new Map(); // key -> OR'd DIRTY_REASON bits, cleared on rebuild
const deferredChunkUpdates = new Set(); // unchanged
```
*Reason:* one authoritative record of *why* a chunk is dirty. Verified: `DIRTY_REASON`,
`chunkDirtyReason` have **0** existing occurrences (no collision).

**0.2 — Record the reason in `scheduleChunkUpdate`** (17590). Add a `reason` option and OR it:
```js
function scheduleChunkUpdate(cx, cz, force = false, source = "generic", { bypassLighting = false, immediate = false, reason = DIRTY_REASON.GEOMETRY } = {}) {
    const key = `${cx},${cz}`;
    chunkDirtyReason.set(key, (chunkDirtyReason.get(key) || 0) | reason);
    // ... rest unchanged ...
```
Then tag the light/seam/tree callers (only these four — all others default to `GEOMETRY`, so
behaviour is unchanged):
- `edge-lighting` (17347) and `edge-lighting-capflush` (17281): add `reason: DIRTY_REASON.LIGHT`.
- `light-propagation` (24270) and `sunlight-task` (24535): add `reason: DIRTY_REASON.LIGHT`.
- `neighbor-update` (16814): add `reason: DIRTY_REASON.NEIGHBOR_TREE`.

**0.3 — De-dupe the neighbor drain.** In `processChunkQueue`'s neighbor loop (41529):
```js
for (const key of toUpdate) {
    chunkNeighborUpdateQueue.delete(key);
    // COALESCE: already scheduled by the primary path? That rebuild covers the neighbor change.
    if (queuedChunkKeys.has(key) || pendingChunkUpdates.has(key) || dirtyChunks.has(key)) continue;
    const [cx, cz] = parseChunkKey(key);
    // ... rest unchanged ...
```
*Reason:* the neighbor queue and primary queue are independent; the same chunk often sits in both.
This is the edit that actually removes duplicate rebuilds (0.1/0.2/0.4 are groundwork). The enqueue
side already guards (16625); this adds the symmetric dequeue guard.

**0.4 — Clear the mask on rebuild.** In `processChunkQueue` where dirty is cleared (41495):
```js
if (isDirty) { dirtyChunks.delete(job.key); }
chunkDirtyReason.delete(job.key); // rebuild captured all accumulated reasons
```
> ⚠ **Phase 3 relocates this.** Edit 3.3 reads the mask at ~41503 (after 41495), so when Phase 3
> lands this `delete` moves to after the refill/remesh decision. In Phase 0 alone it's correct here.

### Settings / wiring
None.

### Tests (`tools/voxex-tests.html`)
```js
describe("Phase 0: dirty-reason coalescing", () => {
    it("DIRTY_REASON bits are distinct powers of two", () => {
        const r = VoxEx.DIRTY_REASON; // expose via the ?test=1 seam
        expect(r.GEOMETRY | r.LIGHT | r.SEAM | r.NEIGHBOR_TREE).toBe(15);
    });
    it("scheduleChunkUpdate ORs the reason", () => {
        VoxEx.chunkDirtyReason.clear();
        VoxEx.scheduleChunkUpdate(0, 0, true, "t", { reason: VoxEx.DIRTY_REASON.LIGHT });
        VoxEx.scheduleChunkUpdate(0, 0, true, "t", { reason: VoxEx.DIRTY_REASON.GEOMETRY });
        expect(VoxEx.chunkDirtyReason.get("0,0")).toBe(3); // LIGHT|GEOMETRY
    });
});
```
(Add `DIRTY_REASON`, `chunkDirtyReason`, `scheduleChunkUpdate` to the `window.VoxEx` test export.)

### Acceptance criteria
- A block edit on a chunk corner that also has a streaming neighbor produces **one** rebuild of the
  neighbor, not two (observe `meshLifecycleStats` / `chunkUpdateDiagnostics.neighborStats`).
- No change to visible behaviour; debug overlay rebuild counts drop on neighbor-heavy streaming.

### Rollback
Remove the four `reason:` tags, the guard in 0.3, and the two map lines. Pure routing — no state
migration.

---

## Phase 1 — Decouple build-gating from frustum

**Goal:** pre-mesh the near in-range ring regardless of view direction so rotation reveals built
geometry instead of triggering a build wave (fixes Q4).

**Prerequisites:** none.

### Tasks

**1.1 — Add the build-ahead radius constant** near `INNER_RADIUS` (~41199):
```js
const INNER_RADIUS = 6; // unchanged
// Phase 1: pre-mesh the near ring in ALL directions (not just the view cone) so rotation reveals
// built geometry. Capped so the always-built disc (~π·r²) stays under maxAllowedMeshes at the
// default maxCachedChunks (350): π·10² ≈ 314.
const BUILD_AHEAD_RADIUS = Math.min(currentRenderRadius, 10);
```

**1.2 — Build the near ring even when frustum-culled.** Sweep loop (41248–41250):
```js
// CURRENT:
if (!isChunkInFrustum(cx, cz, playerPos, normCamX, normCamZ, distSq, innerRadiusSq, cosThresholdSq, hasHorizontalCameraDir)) { culled++; continue; }
neededKeys.add(key);
if (!chunkMeshes.has(key) && !queuedChunkKeys.has(key)) { needed.push({ key, cx, cz, dist: distSq }); }

// PROPOSED:
const inFrustum = isChunkInFrustum(cx, cz, playerPos, normCamX, normCamZ, distSq, innerRadiusSq, cosThresholdSq, hasHorizontalCameraDir);
if (inFrustum) { neededKeys.add(key); } else { culled++; }
// Built meshes carry mesh.frustumCulled = SETTINGS.enableFrustumCulling (40835/40915), so Three.js
// DRAW-culls off-screen meshes; the manual test was only ever throttling BUILDS. Pre-mesh the near
// ring (BUILD_AHEAD_RADIUS) in all directions; far ring stays frustum-gated to bound memory.
const buildEvenIfCulled = distSq <= BUILD_AHEAD_RADIUS * BUILD_AHEAD_RADIUS;
if ((inFrustum || buildEvenIfCulled) && !chunkMeshes.has(key) && !queuedChunkKeys.has(key)) {
    needed.push({ key, cx, cz, dist: distSq, deprioritize: !inFrustum });
}
```

**1.3 — Visible chunks build first.** Sort at 41312:
```js
if (recomputedFrustum) { needed.sort((a, b) => (a.deprioritize - b.deprioritize) || (a.dist - b.dist)); }
```

### Settings / wiring
Optional: expose `BUILD_AHEAD_RADIUS` cap as `SETTINGS.buildAheadRadius` (default 10) using the 1.1
pattern, so low-memory devices can lower it. Recommend shipping it hard-coded first.

### Tests
Hard to unit-test (needs the live frustum loop). Add a **manual acceptance check** to the test
page's notes, and a guard test:
```js
it("BUILD_AHEAD_RADIUS never exceeds render radius", () => {
    // exposed helper returns Math.min(currentRenderRadius, 10)
    expect(VoxEx.getBuildAheadRadius()).toBeLessThanOrEqual(VoxEx.currentRenderRadius);
});
```

### Acceptance criteria
- Stand still, spin 360°: chunks within ~10 are already meshed (no pop-in burst). Beyond 10, far
  chunks still stream in as you turn (expected).
- `terrainMeshCount` at render distance 16 settles near ~π·10² (~314) + the visible far cone, and
  stays **below** `maxAllowedMeshes`. If it doesn't, lower `BUILD_AHEAD_RADIUS`.
- No FPS regression while stationary (Three.js draw-culls the off-screen ring).

### Rollback
Revert 1.2/1.3 and delete the constant. One-guard change.

> ⚠ **Memory bound is real:** the prune (41273–41301) and cleanup (41307–41308) only evict
> **out-of-range** meshes (`!chunksInRange.has`, 41292) — they cannot relieve in-range overflow. Do
> **not** raise `BUILD_AHEAD_RADIUS` toward full render distance without also teaching the prune to
> evict in-range-but-frustum-culled chunks; otherwise resident meshes exceed `maxAllowedMeshes` and
> the prune spins doing nothing. `MAX_CHUNK_QUEUE_SIZE = 64` (41325) means the ring backfills
> closest-first over several frames, which is fine.

---

## Phase 2 — Banded mesh output  ⚠ (architectural core)

> **STATUS (build 2026-06-17.13): Phase 2 COMPLETE (2a + 2b + 2c) behind `SETTINGS.bandedMeshing`
> (default off). Verified in-browser by the user; `node --check` clean on the full module.**
> Done: helpers (`bandKey`/`bandOfY`/`bandMaskForY`/`chunkBaseOfMeshKey`/`chunkBandMeshKeys`/
> `isChunkMeshed`/`computeBandBounds`/`ALL_BANDS_MASK`), `SETTINGS.bandedMeshing`, the `flushBand()`
> per-band attach + band loop in `renderChunk` (unified — `numBands===1` when off ⇒ identical to
> pre-banding), the `chunkMeshes` census (release/prune/cleanup/streaming/queue/neighbor/edge-light/
> **shadow-caster** gates), band unit tests, AND §2.6 per-band dirty scope (`chunkDirtyBands` +
> `scheduleChunkUpdate {bands}` option; `updateLocalArea` + light-neutral edits pass `bandMaskForY(y)`;
> `renderChunk` skips clean bands that already have a mesh).
>
> Bugs found & fixed during bring-up: missing `chunkBandMeshKeys` generator; `refreshChunkShadowCasters`
> parsed band keys as chunk keys (NaN dist → shadows vanished); `rebuildAllVisibleChunks` released only
> `cKey` so the `isChunkMeshed` queue-skip blocked AO/water re-bakes. Console toggle: `setBandedMeshing(true/false)`.
>
> **Remaining limitation:** light-CHANGING edits still rebuild all light-affected bands (sunlight
> columns) — the per-edit win there waits for Phase 3 (light → color-only upload). Light-NEUTRAL
> edits (fire/char) + the geometry portion of edits get the band win now.

**Goal:** emit geometry **per vertical band** (a group of sections) instead of one buffer per
320-tall chunk, so an edit/light/seam change rebuilds one band, not the whole column.

**Prerequisites:** Phase 0 (uses the `band` field on the dirty mask). Ship behind
`SETTINGS.bandedMeshing` so the current path stays the default until proven.

**Design decision (from CCR Open Question 1):** start at **4 bands of 5 sections = 80 blocks**.
`BAND_SECTIONS = 5`, `BANDS_PER_CHUNK = 4`. Rationale: keeps draw calls to 4× (mitigated by
per-band frustum + the existing section-skip), preserves most greedy merges (vertical runs > 80
blocks are rare), and bounds geometry-pool growth. Make it a constant so 20-band (per-section) can
be A/B'd later.

### 2.1 — Keys & helpers

The current mesh keys are `cKey` (terrain) and `cKey + "_WATER"`. Banded keys become
`cKey + "#" + band` and `cKey + "#" + band + "_WATER"`. Add helpers near `getChunkKey`:

```js
const BAND_SECTIONS = 5;                              // sections per band
const BANDS_PER_CHUNK = SECTIONS_PER_CHUNK / BAND_SECTIONS; // 20 / 5 = 4  (assert integer!)
function bandKey(cKey, band) { return cKey + "#" + band; }
function bandOfSection(sectionIdx) { return (sectionIdx / BAND_SECTIONS) | 0; }
function bandOfY(y) { return ((y / SECTION_HEIGHT) | 0) / BAND_SECTIONS | 0; }
// Strip "#band" and "_WATER" to recover the true chunk base key (cKey). CRITICAL for torch/fire
// release, which is keyed by the CHUNK, not the band (see releaseMeshForKey fix, 2.5).
function chunkBaseOfMeshKey(meshKey) { return meshKey.replace("_WATER", "").replace(/#\d+$/, ""); }
function* chunkBandMeshKeys(cKey) { for (let b = 0; b < BANDS_PER_CHUNK; b++) { yield bandKey(cKey, b); yield bandKey(cKey, b) + "_WATER"; } }
// "Does this chunk currently have a LIVE mesh?" — true if any band (terrain or water) is attached.
function isChunkMeshed(cKey) { for (let b = 0; b < BANDS_PER_CHUNK; b++) { if (chunkMeshes.has(bandKey(cKey, b)) || chunkMeshes.has(bandKey(cKey, b) + "_WATER")) return true; } return false; }
```
Verified novel: `bandKey`, `bandedMeshing`, `deprioritize` have 0 existing occurrences.

> ⚠ **Do NOT reuse `meshedChunkKeys` for "currently meshed" checks.** Audited 2026-06-17: its
> comment (16306) says *"meshed at least once,"* and it is deleted only in the chunk-**data**
> eviction path (17422), **not** in `releaseMeshForKey` (40162). So a chunk whose mesh was released
> for going out of range (data retained) stays in `meshedChunkKeys` — using it to gate re-meshing
> would leave such chunks permanently unmeshed when they re-enter range. `meshedChunkKeys` keeps its
> real meaning (it still drives `firstMeshForChunk`, 40293). Use the **`isChunkMeshed(cKey)`** helper
> above for "has a live mesh" checks. (If the per-call 8-key scan shows on a profile of the streaming
> sweep, introduce a maintained `liveChunkMeshKeys` Set — added in the flush helpers, removed in
> `releaseMeshForKey` — but that is a *new* set, never `meshedChunkKeys`.)

### 2.2 — Mesher restructure (`renderChunk`, 40258–40923)

Today: buffers are allocated once (40374–40392), the section loop (40438) accumulates the whole
column via `terrainState`/`wFaceCount` counters, then one attach block (40771–40923) builds the
single mesh. **Banding wraps the section loop in a band loop and flushes per band.** The flush is
the *existing* attach code (40782–40845 terrain, 40850–40922 water) extracted into a helper.

**Step A — extract the attach block into `flushTerrainBand` / `flushWaterBand`.** Move 40782–40845
(terrain) verbatim into:
```js
// distSq, tightBounds, oldMeshKey come from renderChunk scope. Returns true if a mesh was attached.
function flushTerrainBand(cKey, band, tFaceCount, buffers, counters, tightBounds, distSq) {
    if (tFaceCount === 0) return false;
    if (tFaceCount > MAX_FACES_PER_CHUNK) { /* existing skip+STALE log, scoped to this band */ return false; }
    const terrainGeo = geometryPool.acquireTerrain(tFaceCount);
    // ... 40786–40821 verbatim: copy buffers.subarray(0, counters.t*), addUpdateRange, setDrawRange ...
    applyTightChunkBounds(terrainGeo, tightBounds);           // band-tight bounds — see 2.4
    const mKey = bandKey(cKey, band);
    const oldMesh = chunkMeshes.get(mKey) || null;            // deferred-release per band
    const terrainMesh = acquireChunkMesh("terrain");
    terrainMesh.name = "CHUNK_TERRAIN_" + mKey;
    terrainMesh.geometry = terrainGeo;
    terrainMesh.frustumCulled = SETTINGS.enableFrustumCulling;
    const shadowChunks = Math.ceil(shadowConfig.radius / WORLD_DIMS.chunkSize);
    terrainMesh.castShadow = SETTINGS.shadows && distSq <= shadowChunks * shadowChunks;
    terrainMesh.receiveShadow = SETTINGS.shadows;
    terrainMesh.updateMatrix();
    scene.add(terrainMesh);
    chunkMeshes.set(mKey, terrainMesh);
    terrainMeshCount++;
    if (oldMesh) { releaseChunkMesh(oldMesh, "terrain"); terrainMeshCount--; } // atomic swap
    return true;
}
```
`flushWaterBand` is the symmetric extraction of 40850–40922 (shore/thickness/foam attrs included).

**Step B — band loop in `renderChunk`.** Replace the single section loop + single attach with:
```js
if (SETTINGS.bandedMeshing) {
    let anyBand = false;
    for (let band = 0; band < BANDS_PER_CHUNK; band++) {
        // reset per-band counters (the tVIdx/tCIdx/... and wVIdx/... locals start at 0 each band)
        tVIdx = tUvIdx = tCIdx = tIIdx = tVertCount = tFaceCount = tQsIdx = 0;
        wVIdx = wUvIdx = wCIdx = wIIdx = wVertCount = wSIdx = wTIdx = wFaceCount = 0;
        const sStart = band * BAND_SECTIONS, sEnd = sStart + BAND_SECTIONS;
        for (let sectionIdx = sStart; sectionIdx < sEnd; sectionIdx++) {
            // ... existing section body (40439–40768) UNCHANGED: skip/LOD/greedyMeshSection/water ...
        }
        const bandBounds = computeBandBounds(centerData, band); // 2.4
        anyBand = flushTerrainBand(cKey, band, tFaceCount, terrainBuffers, counters, bandBounds, distSq) || anyBand;
        flushWaterBand(cKey, band, wFaceCount, waterBuffers, counters, bandBounds, distSq);
    }
    // empty bands: release any stale mesh that used to exist for this band (chunk got carved empty)
    for (let band = 0; band < BANDS_PER_CHUNK; band++) {
        if (/* this band produced 0 faces */ ...) { releaseMeshForKey(bandKey(cKey, band)); releaseMeshForKey(bandKey(cKey, band) + "_WATER"); }
    }
    if (anyBand) meshedChunkKeys.add(cKey); else meshedChunkKeys.delete(cKey);
    chunkDataPool.setMeshState(cKey, MESH_STATE.READY);
    return;
}
// else: existing single-column path stays as-is (default until bandedMeshing proven)
```
*Reason:* `greedyMeshSection` already operates on `startY..endY` of one section (40514), so it bands
with no change. The buffers (40374–40392) can be reused across bands since each band flushes before
the next resets the counters — **no extra allocation per band**.

**Step C — buffer sizing.** The work buffers are sized `MAX_FACES_PER_CHUNK` (40367). A band can't
exceed that, so reuse is safe. The *geometry* tier is picked by `acquireTerrain(tFaceCount)` per
band — a band's `tFaceCount` is ~¼ the column, so most bands land in `GEO_TIER_SMALL`, which is the
memory win. Optionally add a sub-small tier (2.3).

### 2.3 — Geometry pool: optional band tier

`acquireTerrain(estimatedFaces)` selects a tier via `_selectTier` (19770). Bands skew small, so the
existing small tier (4096 faces) already fits most. **Optional:** add a `GEO_TIER_BAND` (~1536
faces) to `terrainPools` and `_selectTier`/`_getTierMaxFaces` for the common sparse band, cutting
per-band buffer waste further. Defer until profiling shows small-tier pressure — start by reusing
small.

### 2.4 — Per-band bounds

`applyTightChunkBounds(geo, bounds)` (40061) reads **`{minX, minY, minZ, maxX, maxY, maxZ}`**
(40063–40064) in **world** coordinates. For correct per-band frustum/draw culling each band needs
its own Y-tight box; X/Z span the full chunk. (`WORLD_DIMS.yOffset === 0`, verified 6589, so world
Y equals local section Y — no offset conversion needed.)
```js
function computeBandBounds(chunkData, band, startX, startZ) {
    const sStart = band * BAND_SECTIONS, sEnd = sStart + BAND_SECTIONS;
    let minY = Infinity, maxY = -Infinity;
    for (let s = sStart; s < sEnd; s++) { const sec = chunkData.sections?.[s];
        if (sec && sec.analyzed && !sec.isEmpty) { if (sec.minBlockY < minY) minY = sec.minBlockY; if (sec.maxBlockY + 1 > maxY) maxY = sec.maxBlockY + 1; } }
    if (minY === Infinity) { minY = sStart * SECTION_HEIGHT; maxY = sEnd * SECTION_HEIGHT; } // fallback: full band span
    return { minX: startX, minY, minZ: startZ, maxX: startX + WORLD_DIMS.chunkSize, maxY, maxZ: startZ + WORLD_DIMS.chunkSize };
}
```
Pass `startX`/`startZ` (already computed in `renderChunk` at 40393–40394). *Reason:* whole-chunk Y
bounds on every band would defeat per-band frustum culling (Three.js would think each band fills 320
blocks). The exact `{minX…maxZ}` field names match `applyTightChunkBounds` — a `{minY,maxY}`-only
object would set `NaN` bounds and cull the band incorrectly.

### 2.5 — `chunkMeshes` census (every site must become band-aware)

This is the highest-churn part. Full census from grep; group by required change. **Do all of these
or the band keys leak / mis-release.**

| Line | Current use | Change |
|---|---|---|
| 40290–40291 | `get(cKey)` / `get(cKey+"_WATER")` old-mesh refs | per-band: handled inside `flushTerrainBand`/`flushWaterBand` (2.2 Step A) |
| 40843 / 40920 | `set(cKey, …)` / `set(cKey+"_WATER", …)` | → `set(bandKey(cKey,band), …)` (in the flush helpers) |
| 41250 | `has(key)` "chunk meshed?" (streaming) | → `isChunkMeshed(key)` |
| 41481 | `has(job.key)` "already meshed, skip" | → `isChunkMeshed(job.key)` |
| 41509 | `has(job.key)` / `has(job.key+"_WATER")` diag | band-aware or `isChunkMeshed` |
| 41278 / 41307 | `keys()` cleanup loops (prune / out-of-range release) | iterate keys, derive base via `chunkBaseOfMeshKey`; dedupe to chunk for distance, release all bands of out-of-range chunks |
| 41058 | `has(nKey)` neighbor-exists (queue neighbor update) | → `isChunkMeshed(nKey)` |
| 16637 / 16813 / 17275 / 17336–17337 | `has(key)` / `has(key+"_WATER")` neighbor & edge-light gates | → `isChunkMeshed(key)` (chunk-level "has a live mesh") |
| 16622 | `keys().filter(!_WATER)` reconcile candidates | derive base via `chunkBaseOfMeshKey`, dedupe to chunk set |
| 10416 / 20193 / 22137 / 41278 | `keys()` iteration (leak check / unload / settings apply) | band-aware: use `chunkBaseOfMeshKey` where a *chunk* is meant |
| 20210 / 20216 | unload count / `has(waterKey)` | band-aware |
| 26284 | `for key of keys(): releaseMeshForKey(key)` | **unchanged** — iterates all keys, band keys included |
| 11359 / 29016 | `chunkMeshes.size` (debug overlay) | now counts band-meshes; for chunk count dedupe base via `chunkBaseOfMeshKey` (NOT `meshedChunkKeys.size`, which counts ever-meshed loaded chunks) |
| 12748 / 12750 / 19934 / 19936 | `keys().filter(_WATER)` terrain/water counts | now band granularity — relabel overlay or dedupe base |

**`releaseMeshForKey` fix (40162).** It does `key.replace("_WATER","")` → baseKey and calls
`releaseChunkTorches(baseKey)` / `releaseChunkFires(baseKey)`. With banded keys the baseKey becomes
`cKey#band`, so torches/fires (keyed by `cKey`) would NOT be released. Fix:
```js
function releaseMeshForKey(key) {
    const isWater = key.includes("_WATER");
    const baseKey = key.replace("_WATER", "");        // still the mesh base (may include #band)
    const chunkBase = chunkBaseOfMeshKey(key);         // the true chunk key for torch/fire
    // Only release torches/fires when the LAST band of the chunk is going away:
    const anyBandLeft = [...chunkBandMeshKeys(chunkBase)].some(k => k !== key && chunkMeshes.has(k));
    if (!anyBandLeft) { releaseChunkTorches(chunkBase); releaseChunkFires(chunkBase); }
    // NOTE: do NOT delete meshedChunkKeys here — it means "ever meshed (data loaded)" and is cleared
    // only on data eviction (17422). Deleting it on a range-release would corrupt firstMeshForChunk.
    const mesh = chunkMeshes.get(key);
    if (!mesh) return;
    // ... rest unchanged (releaseChunkMesh, delete, count decrement) ...
}
```
*Reason:* torches/fires belong to the chunk, not a band; releasing them when only one band detaches
would drop lights for bands that still exist.

### 2.6 — Dirty scope (pairs with Phase 0)

`scheduleChunkUpdate` gains a `band` option (the concrete `markChunkDirty` from the CCR). `setBlock`
(24852+) computes the band from `y` via `bandOfY(y)` and passes it. The build drain rebuilds only
the dirty band(s); if `band` is omitted, rebuild all bands (back-compat for light/neighbor paths
until they're scoped too). Store dirty bands as a small bitmask alongside the reason:
```js
// chunkDirtyReason value could pack reason in low bits + a 4-bit band mask in high bits, OR keep a
// parallel Map<key, bandMask>. Recommend a parallel `chunkDirtyBands` Map<key, number> for clarity.
```

### Settings / wiring
`SETTINGS.bandedMeshing` (default **false**) via the 1.1 pattern. No UI initially; flip the default
to test. Keep out of `SETTINGS_PROFILES`.

### Tests (`tools/voxex-tests.html`)
```js
describe("Phase 2: banding", () => {
    it("BANDS_PER_CHUNK divides SECTIONS_PER_CHUNK evenly", () => { expect(20 % VoxEx.BAND_SECTIONS).toBe(0); });
    it("bandOfY maps section boundaries", () => { expect(VoxEx.bandOfY(0)).toBe(0); expect(VoxEx.bandOfY(79)).toBe(0); expect(VoxEx.bandOfY(80)).toBe(1); expect(VoxEx.bandOfY(319)).toBe(3); });
    it("chunkBaseOfMeshKey strips band and water", () => { expect(VoxEx.chunkBaseOfMeshKey("3,-2#2_WATER")).toBe("3,-2"); expect(VoxEx.chunkBaseOfMeshKey("3,-2#0")).toBe("3,-2"); });
    it("banded mesh face total equals single-column total", () => {
        // Mesh a known chunk both ways; sum band faceCounts == single-column faceCount (greedy
        // differs only at band borders — assert within a small tolerance, see acceptance).
    });
});
```
Plus **update the existing `getMergeKey` suite is NOT affected here** (that's Phase 3).

### Acceptance criteria
- With `bandedMeshing=true`, the world renders identically to `false` (screenshot diff clean; no
  seams between bands, no missing faces at band borders y=80/160/240).
- Editing a block at y=64 rebuilds **one** band geometry (instrument `flushTerrainBand` calls), not
  four; visible rebuild cost per edit drops ~4×.
- Total face count rises only modestly vs. single-column (lost vertical merges at 3 band borders) —
  verify with `window.printFaceHistogram()`; expect < ~5% increase.
- `terrainMeshCount` ≈ 4× chunk count (expected); confirm geometry-pool stats show mostly small-tier
  band buffers and no leak (`window.geometryPool.getStats()`).

### Rollback
`SETTINGS.bandedMeshing = false` restores the single-column path entirely (it's preserved in the
`else` branch). The helpers/census are inert when the flag is off **except** the `meshedChunkKeys`
routing — keep that working for both paths (it already exists).

---

## Phase 3 — Light out of the geometry  ⚠

**Goal:** a light-only change becomes a vertex-**color** upload, not a remesh. This removes the
dominant "unchanged blocks, remeshed anyway" cost (edge-lighting convergence, sunlight settle, torch
ripple).

**Prerequisites:** Phase 0 (reason mask) and Phase 2 (band scope makes the refill cheap and bounded).
Ship behind `SETTINGS.lightRefill`.

**Why three coordinated edits:** merged quads currently apply the **seed cell's** corner light
across the whole quad — valid *only because light is in the merge key* (comment 39469–39471). Drop
light from the key without fixing quad-corner light and you flatten lighting on every merged quad.

### 3.1 — Remove light from the merge key (`getMergeKey`, 38581–38600)

```js
function getMergeKey(blockId, ao, light) {  // `light` kept for call-shape; now UNUSED
    // Light moved to a per-vertex attribute updated in place (refillChunkLightColors). Faces merge
    // on blockId + AO only, so a light change does not alter the face set.
    return (blockId << 8)
         | (AO_QUANT_LOOKUP[Math.round(ao[0] * 100)] << 6)
         | (AO_QUANT_LOOKUP[Math.round(ao[1] * 100)] << 4)
         | (AO_QUANT_LOOKUP[Math.round(ao[2] * 100)] << 2)
         |  AO_QUANT_LOOKUP[Math.round(ao[3] * 100)];
}
```
- **DELETE the now-dead `l0..l3` block (38586–38594)** — `getMergeKey` is per-face hot; leaving it
  wastes the work this edit saves.
- **Update the blockId extraction (39457):** `const blockId = mergeKey >> 20;` → `>> 8`.
- **Sentinel safe:** `greedyMergeKeys[idx] === 0` (39423) still means empty — a real face has
  `blockId ≥ 1` so the key is `≥ 256`.

### 3.2 — Sample merged-quad light at the four physical corners (39469–39479)  ⚠

With differing-light cells now mergeable, take light from the quad's 4 corner **cells**, not the
seed cell, and let the GPU interpolate (`addMergedFaceIndexed` maps `lightLevel[i] → vertex i`,
39246–39254):
```js
// quad spans [u..u+width-1] × [v..v+height-1]:
const idxTL = idx, idxTR = v*uSize + (u+width-1), idxBL = (v+height-1)*uSize + u, idxBR = (v+height-1)*uSize + (u+width-1);
_greedyLightScratch[0] = greedyLight[idxTL*4 + 0];
_greedyLightScratch[1] = greedyLight[idxTR*4 + 1];
_greedyLightScratch[2] = greedyLight[idxBR*4 + 2];
_greedyLightScratch[3] = greedyLight[idxBL*4 + 3];
```
> ⚠ **Verify the corner→vertex winding.** The slot-i→vertex-i mapping is self-consistent, but
> whether slot 1 is the +u or +v corner depends on `getMergedFaceVertices`. **This needs a visual
> check** (`tools/voxex-texture-tests.html` or an in-game lit cave screenshot), not a desk proof. If
> gradients look transposed, swap the `idxTR`/`idxBL` slot indices.

### 3.3 — Light-only color refill + drain branch

> ⚠ **Audit correction (2026-06-17):** the build-time vertex color is **smooth corner light**, not a
> single-cell value. The mesher computes per-corner light via `calculateFaceCornerLight`
> (38514) and bakes `color = ao[i] × cornerLight[i]` (`addMergedFaceIndexed`, 39246–39254), then
> Edit 3.2 samples the merged quad's **four corner cells**. A refill that did
> `ao × extractLightFromChunk(oneCell)/15` would therefore **not match a remesh** whenever
> `SETTINGS.smoothLighting` is on (the default) — it would visibly flatten gradients. The refill must
> reproduce the mesher's corner-light math. Two options:

**Option A — full-parity refill (target).** `lightMap` stores **per face/quad**:
`{faceIdx, lx, ly, lz, width, height, vertBase, ao0..3}`. `refillChunkLightColors` rebuilds the
light-only neighbor getter (the `getLocalLight` closure from `renderChunk`, 40350) over current
chunk+neighbor data, recomputes the 4 corner lights exactly as Edit 3.2 does
(`calculateFaceCornerLight` per corner cell, then the TL/TR/BR/BL sampling), and writes the 4 vertex
colors. This skips greedy expansion, position/uv/index writes, and geometry allocation — still much
cheaper than a full remesh — but it is **not** a single-cell lookup:
```js
function refillChunkLightColors(meshKey) {
    const mesh = chunkMeshes.get(meshKey);
    const map = mesh && mesh.geometry.userData.lightMap;
    if (!map) return false;                                  // no map ⇒ caller falls back to remesh
    const cKey = chunkBaseOfMeshKey(meshKey);
    const chunk = chunkDataPool.get(cKey); if (!chunk) return false;
    const { getLocal, getLocalLight } = buildChunkLightGetters(cKey); // extract the closures renderChunk builds (40320/40350)
    const colAttr = mesh.geometry.attributes.color;
    for (let f = 0; f < map.faceCount; f++) {
        // recompute the 4 corner lights for this face/quad exactly like the mesher (3.2) ...
        const corner = recomputeQuadCornerLight(map, f, getLocal, getLocalLight); // [l0..l3], 0..1
        const vBase = map.vertBase[f];
        for (let i = 0; i < 4; i++) { const c = map.ao[f*4 + i] * corner[i]; const o = (vBase + i) * 3; colAttr.array[o] = colAttr.array[o+1] = colAttr.array[o+2] = c; }
    }
    colAttr.clearUpdateRanges(); colAttr.addUpdateRange(0, mesh.geometry.attributes.color.count * 3); colAttr.needsUpdate = true;
    return true;
}
```
This requires extracting the currently-inline `getLocal`/`getLocalLight` closures (40320–40364) into
a reusable `buildChunkLightGetters(cKey)` so both `renderChunk` and the refill share one source of
truth (do this refactor as part of 3.3).

**Option B — flat-light-only interim.** Gate `lightRefill` behind `!SETTINGS.smoothLighting`. Then
the per-vertex color is exactly `ao × extractLightFromChunk(cell)/15`, so the simple single-cell map
(`{cellIdx, ao}` per vertex) is correct and the trivial loop works. Active only when smooth lighting
is off (uncommon, since it defaults on), so this is a stepping stone, not the finished feature.

**Populate `geo.userData.lightMap`** at build time in the flush helpers (2.2). Option A records the
per-face data above; Option B records per-vertex `{cellIdx, ao}`. Either adds a per-band typed array,
allocated only when `lightRefill` is on.

**Drain branch** — the real site (41503–41510) is the `WORKER_MESH_PIPELINE_ENABLED` if/else, and
Edit 0.4's clear must move here so the mask survives to be read:
```js
// (REMOVE Edit 0.4's chunkDirtyReason.delete at ~41495 — replaced by per-branch deletes below.)
const reasonMask = chunkDirtyReason.get(job.key) || 0;
if (SETTINGS.lightRefill && reasonMask === DIRTY_REASON.LIGHT && isChunkMeshed(job.key)
    && [...chunkBandMeshKeys(job.key)].filter(k => chunkMeshes.has(k)).every(refillChunkLightColors)) {
    chunkDirtyReason.delete(job.key);
    recordChunkUpdateState(job.key, "light-refill", "rendered");
    chunkUpdateDiagnostics.pending.delete(job.key);
} else if (WORKER_MESH_PIPELINE_ENABLED && SETTINGS.useWorkersForMesh && chunkWorkerPool) {
    dispatchMeshJob(jobCx, jobCz, job.key, jobDistSq); chunkDirtyReason.delete(job.key);
} else {
    renderChunk(jobCx, jobCz, jobDistSq);
    recordChunkUpdateState(job.key, "processChunkQueue", "rendered");
    chunkUpdateDiagnostics.pending.delete(job.key); chunkDirtyReason.delete(job.key);
    // ... existing meshLifecycleStats.mark("dirtyRebuild", …) ...
}
```
*Note:* `reasonMask === DIRTY_REASON.LIGHT` (strict) means a chunk dirtied for light **and**
geometry (mask 3) correctly falls through to a full remesh. The refill only fires for pure-light
events.

> 📌 **TODO during implementation — fix the `.every` short-circuit (don't ship as written).** The
> guard `[...chunkBandMeshKeys(job.key)].filter(k => chunkMeshes.has(k)).every(refillChunkLightColors)`
> is **side-effecting**: `.every` runs `refillChunkLightColors` (which mutates vertex colors) on each
> band and stops at the first one that returns `false` (no `lightMap`). So if band 0 refills but
> band 2 has no map, band 0 is recolored **and then the whole chunk takes a full remesh** — wasted
> work, and a brief frame where bands are half-refilled/half-stale. Not incorrect (the remesh
> overwrites), but it defeats the optimization for partially-mapped chunks. **Fix:** pre-check that
> **all** live bands have a `lightMap` *before* mutating anything — e.g.
> `const live = [...chunkBandMeshKeys(job.key)].filter(k => chunkMeshes.has(k));`
> `const canRefill = live.length > 0 && live.every(k => chunkMeshes.get(k).geometry.userData.lightMap);`
> then `if (canRefill) live.forEach(refillChunkLightColors); else <remesh>;`. (`live.length > 0`
> also guards the vacuous-true case where the chunk has no live band mesh.) Tracked here so it isn't
> lost between the audit and the build.

### Settings / wiring
`SETTINGS.lightRefill` (default **false**) via the 1.1 pattern. Depends on `bandedMeshing` for the
lightMap to be band-scoped; gate the UI/flag so it can't be enabled without banding.

### Tests (`tools/voxex-tests.html`)
**The existing `getMergeKey` suite (209–215) WILL FAIL — update it:**
- Line 212 `"different light -> different key"` → now light is NOT in the key. Change to
  `"same blockId+AO, different light -> SAME key"` asserting equality.
- Line 214 `"blockId in upper bits"` checks `key >> 20` → change to `key >> 8`.
- Keep 210/211/213 (same/blockId/AO) — still valid.

Add:
```js
describe("Phase 3: light refill", () => {
    it("getMergeKey ignores light", () => { expect(getMergeKey(GRASS,[1,1,1,1],0.0)).toBe(getMergeKey(GRASS,[1,1,1,1],1.0)); });
    it("getMergeKey blockId at >>8", () => { expect(getMergeKey(GRASS,[0,0,0,0],0) >> 8).toBe(GRASS); });
    it("getMergeKey still splits on AO", () => { expect(getMergeKey(GRASS,[1,1,1,1],1) !== getMergeKey(GRASS,[0.5,1,1,1],1)).toBeTruthy(); });
    // refill: build a chunk mesh, change a skyLight value, refill, assert the matching vertex color changed.
});
```

### Acceptance criteria
- Lit caves and torch-lit rooms look identical to pre-Phase-3 (visual check for the 3.2 winding).
- Placing/breaking a torch updates nearby band colors with **zero** geometry rebuild when only light
  changed (instrument: `light-refill` recorded, `flushTerrainBand` not called).
- Edge-lighting convergence on streamed chunks no longer shows as full remeshes in
  `meshLifecycleStats`.

### Rollback
`SETTINGS.lightRefill = false` → drain always takes the remesh branch. 3.1/3.2 (merge key) are not
behind the flag, so if they regress visuals, revert the `getMergeKey`/corner-sampling edits together
(they're a unit) and restore the original `getMergeKey` test assertions.

---

## Phase 4 — Re-enable the worker mesh pipeline

**Goal:** move the build burst off the main thread by setting `WORKER_MESH_PIPELINE_ENABLED = true`
(13441) — **only after** the worker mesher reaches parity with `renderChunk`.

**Prerequisites:** Phases 2 + 3 (the worker must emit band buffers and the lightMap, else it ships
sub-parity meshes — the exact failure that got it gated off).

### Parity checklist (the code already documents the gaps at 19359–19366)

The `applyWorkerMeshData` path (19308) and the worker mesh generator (in `buildChunkWorkerCode`)
must all match the main-thread mesher before the flag flips:

1. **Pooled-mesh protocol** — `applyWorkerMeshData` currently does `new THREE.Mesh(geo, chunkMaterial)`
   (19367) and `mesh.frustumCulled = true` hard-coded (19369). Switch to `acquireChunkMesh("terrain")`
   / `acquireChunkMesh("water")` so pooling, `customDepthMaterial`, layers, and shadow flags match
   (40074–40094).
2. **Tight bounds, not `computeBoundingSphere`** (19357) — the pooled buffer has stale vertices past
   `drawRange`; computing a sphere over them corrupts culling. Use `applyTightChunkBounds` (and, post
   Phase 2, per-band bounds).
3. **Greedy meshing parity** — the worker mesher must run the same `greedyMeshSection` /
   `getMergeKey` (now light-free, Phase 3) so face counts and merge topology match. This is the
   largest piece: the worker copy in `buildChunkWorkerCode` must be brought in line (and, like the
   terrain functions, ideally single-sourced via the injection markers rather than hand-maintained).
4. **Per-vertex lightMap** (Phase 3) — the worker must emit the same `lightMap` so refill works on
   worker-built meshes.
5. **Band keys** (Phase 2) — `applyWorkerMeshData` must `set(bandKey(cKey,band), …)` and emit one
   payload per band.
6. **Water attributes** — shore/thickness/foam (40857–40859) must be produced and copied.
7. **Zero-face cleanup, `chunkRenderedFaces`/diagnostics, `markShadowsDirty`, torch rebuild** — all
   listed in the in-code warning (19362–19366); wire them in `applyWorkerMeshData`.

### Flag flip (13441)
```js
const WORKER_MESH_PIPELINE_ENABLED = true; // only after 1–7 above + worker round-trip tests pass
```

### Tests
The live **worker round-trip** test already exists in `tools/voxex-tests.html` ("live chunk-worker
round-trip + blendedHeight parity"). Extend it to assert **mesh parity**: worker-built terrain
`faceCount`, positions, and colors match the main-thread `renderChunk` output for the same chunk
(within float tolerance). The flag must not flip until this passes.

### Acceptance criteria
- With the flag on, chunk build cost moves off the main thread (frame-time spikes during streaming
  drop); meshes are visually identical to the main-thread path.
- Worker round-trip parity test green.

### Rollback
`WORKER_MESH_PIPELINE_ENABLED = false` — instant revert to main-thread meshing.

---

## Phase F — Light as a sampled texture  (out of scope — separate CCR)

Q3(c) in the CCR: upload per-chunk light to a small 3D/atlas texture sampled in the chunk shader, so
light never touches geometry *or* vertex colors. This is the cleanest end-state but a distinct
architecture (new shader path, upload path, `flatShading` normal interaction). **Do not fold into
this plan** — write `CCR-light-texture.md` after Phases 0–4 land and are measured.

---

## Cross-cutting work (each phase)

- **Build banner:** bump `VOXEX_BUILD`, prepend `VOXEX_RECENT_CHANGES` line.
- **Settings round-trip:** any new `SETTINGS` key needs `DEFAULTS` + the `savedSettings.X ?? default`
  load (5868-pattern); add to `SETTINGS_PROFILES` only *after* the flag graduates from dev-flag.
- **`terrain-visualizer.html`:** no terrain-generation change in this plan, so the visualizer needs
  **no update** (it mirrors height/biome funcs, which are untouched). Note this explicitly in the
  commit so a reviewer doesn't expect a visualizer diff.
- **Tests:** run `tools/voxex-tests.html` over localhost after every phase (~204 baseline + the new
  suites). Phase 3 **changes** the `getMergeKey` suite — that's expected, not a regression.
- **Diagnostics:** the debug overlay (`~` key) `chunkMeshes.size`/face counts shift meaning under
  banding — relabel "meshes" vs "chunks" (use `meshedChunkKeys.size` for chunk count).

## Risk register

| Risk | Phase | Likelihood | Mitigation |
|---|---|---|---|
| Band seams (missing faces / light discontinuity at y=80/160/240) | 2 | Med | screenshot diff vs single-column; per-band bounds (2.4); face-total parity test |
| `chunkMeshes` census miss → leaked or mis-released band meshes | 2 | Med | the census table (2.5) is a checklist; `geometryPool.getStats()` + leak detector must stay flat |
| Torch/fire dropped when one band releases | 2 | Med | `releaseMeshForKey` "last band" guard (2.5) |
| Light gradients transposed on merged quads | 3 | Med | visual check (3.2 ⚠); single-cell fallback if unverified |
| Reason-mask read after clear (ordering) | 3 | Low | Edit 3.3 relocates Edit 0.4's clear |
| Refill `.every` short-circuits mid-mutation (partial recolor + remesh) | 3 | Low | pre-check all live bands have a `lightMap` before mutating — see 📌 in §3.3 |
| In-range memory blow-up | 1 | Low | `BUILD_AHEAD_RADIUS` cap; do not raise without prune fix |
| Worker ships sub-parity meshes | 4 | Med | parity checklist (1–7) + round-trip parity test gate before flag flip |

## Master task checklist

**Phase 0** — [ ] 0.1 mask decl · [ ] 0.2 reason param + 4 caller tags · [ ] 0.3 neighbor-drain guard · [ ] 0.4 clear · [ ] tests · [ ] banner

**Phase 1** — [ ] 1.1 `BUILD_AHEAD_RADIUS` · [ ] 1.2 sweep · [ ] 1.3 sort · [ ] memory acceptance check · [ ] banner

**Phase 2** — [ ] 2.1 keys/helpers + `meshedChunkKeys` routing · [ ] 2.2 mesher restructure (flush helpers + band loop) · [ ] 2.3 (optional) band tier · [ ] 2.4 per-band bounds · [ ] 2.5 full `chunkMeshes` census (14 rows) + `releaseMeshForKey` fix · [ ] 2.6 dirty-band scope · [ ] `SETTINGS.bandedMeshing` · [ ] tests · [ ] screenshot/face/leak acceptance · [ ] banner

**Phase 3** — [ ] 3.1 `getMergeKey` + delete dead code + `>>8` · [ ] 3.2 corner sampling (visual-verify) · [ ] 3.3 `refillChunkLightColors` + lightMap population + drain branch (relocate 0.4 clear) · [ ] **fix drain `.every` short-circuit (📌 §3.3)** · [ ] `SETTINGS.lightRefill` · [ ] update getMergeKey tests + add refill tests · [ ] banner

**Phase 4** — [ ] parity 1–7 · [ ] worker round-trip parity test · [ ] flag flip 13441 · [ ] banner

**Phase F** — [ ] (later) write `CCR-light-texture.md`

---

*End of plan. Cross-references: `CCR-chunk-remesh-consolidation.md` Parts 1–2 (audit/rationale),
Part 6 (Phase 0/1/3 line-level edits with self-audit log). This plan supersedes Part 6 for build
order and adds the Phase 2/4 full specs Part 6 left at touch-point level.*

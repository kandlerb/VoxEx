# VoxEx — Bug Consolidation Tracker

**Purpose:** track how the 39 open issues are being grouped and squashed into a smaller set of work items.
**Source:** [github.com/kandlerb/VoxEx/issues](https://github.com/kandlerb/VoxEx/issues) · companion to `VoxEx_Issue_Triage.md`
**Created:** Jun 27, 2026
**Reconciled against `CCR's/Finished/` on 2026-07-11.**

**39 open issues → 17 work items** (8 consolidated groups covering 30 issues + 9 standalone fixes).

### How to use
- Each issue appears in exactly **one** work item — no double-counting.
- Update **Status** (`Todo` → `WIP` → `Done`) and **Owner** as you go; tick the issue checkboxes when each is squashed.
- **Type** key: `merge` = literally one fix (same function) · `helper` = one shared helper/constant · `sweep` = independent edits, identical mechanical fix, batch in one PR · `standalone` = own root cause.

---

## Summary

| WI | Title | Issues | Type | Priority | Status | Owner |
|----|-------|--------|------|----------|--------|-------|
| WI-01 | LocalStorage read hardening | #519, #518 | helper | P0 | Done | — |
| WI-02 | Single cache-version constant | #493 | helper | P0 | Done | — |
| WI-03 | ChunkDiskStorage worker `onerror` rejects pending | #512 | standalone | P0 | Done | — |
| WI-04 | preGenerateSpawnChunks fixes | #554, #550 | merge | P1 | Done | — |
| WI-05 | Terrain single-source (height/biome parity) | #514, #517 | sweep | P1 | Todo | — |
| WI-06 | Zombie proximity uniform wired up | #520 | standalone | P1 | Done | — |
| WI-07 | Tree-toggle restores density | #521 | standalone | P1 | Done | — |
| WI-08 | Reset All shadow-bias sign | #495 | standalone | P1 | Done | — |
| WI-09 | ParticleSystem skip-not-despawn | #570 | standalone | P1 | Done | — |
| WI-10 | Glass mesh uses geometry pool | #573 | standalone | P1 | Todo | — |
| WI-11 | console → logDebug in render path | #576 | standalone | P1 | Done | — |
| WI-12 | Volumetric lighting per-frame cleanup | #583, #580 | merge | P2 | Done | — |
| WI-13 | Hot-path perf sweep (allocations + redundant compute) | #572, #574, #575, #549, #546, #544, #525, #513, #555, #577, #548 | sweep | P2 | WIP | — |
| WI-14 | Gate 5s debug `scene.traverse` | #542 | standalone | P2 | Done | — |
| WI-15 | Dead-code & redundant-code sweep | #578, #571, #523, #515, #494, #553, #552 | sweep | P3 | Done | — |
| WI-16 | Constants & docs sync | #545, #541, #581 | sweep | P3 | Done | — |
| WI-17 | Water-color helper dedup | #524 | standalone | P3 | Done | — |

---

## Reconciliation Notes (2026-07-11)

Cross-checked every work item against the actual contents of `CCR's/Finished/` (not just the CCR
Mapping table below, which predates several of these ships). A WI is only marked `Done` here when a
Finished CCR file exists whose `GitHub:` issue list demonstrably covers its issue(s) with an
implemented fix (not just a draft "Proposed" header — several of these older CCRs never grew an
As-built section, so the folder location itself, plus the body's per-issue verified/corrected
fix table, is the completion signal).

- **WI-01** → `CCR-localstorage-hardening.md` (Finished) — #519, #518 both covered.
- **WI-02** → `CCR-cache-version-constant.md` (Finished) — #493 covered.
- **WI-03** → `CCR-opfs-worker-onerror.md` (Finished) — #512 covered.
- **WI-04** → `CCR-pregen-fixes.md` (Finished) — #554, #550 both covered.
- **WI-05** → `CCR-terrain-single-source.md` is still in the ACTIVE `CCR's/` folder (not moved to
  `Finished/`) — remains open. #513 (in WI-13) is explicitly coordinated with this WI and stays
  open for the same reason.
- **WI-06** → `CCR-zombie-proximity-uniform.md` (Finished) — #520 covered.
- **WI-07** → `CCR-tree-toggle-restore.md` (Finished) — #521 covered.
- **WI-08** → `CCR-shadow-bias-reset-sign.md` (Finished) — #495 covered.
- **WI-09** → `CCR-particle-skip-despawn.md` (Finished) — #570 covered.
- **WI-10** → `CCR-glass-geometry-pool.md` exists as a **byte-identical duplicate** in both the
  active `CCR's/` folder AND `CCR's/Finished/`, still headed `Status: 🔴 Proposed` with no
  As-built section — this reads as a stray/incomplete copy, not a genuine ship. Left **Todo**.
- **WI-11** → `CCR-deadcode-cleanup.md` (Finished) — #576 is explicitly in this CCR's issue list
  and per-issue fix table (9 hot-path `console.*` sites routed to `logDebug`).
- **WI-12** → `CCR-render-loop-hygiene.md` (Finished) — #583 and #580 were both formally
  **dropped as not-actionable** (documented with evidence in the CCR's own Audit Outcomes / Dropped
  Items sections: #583's sqrt is mathematically required for a linear interpolation; #580's claimed
  redundant `performance.now()` doesn't exist). Both issues have a final, documented disposition, so
  counted as squashed/Done even though no behavior changed.
- **WI-13** → marked **WIP**, not Done: `CCR-render-loop-hygiene.md` (Finished) covers #572, #574,
  #575, #549, #546, #544, #525, #577 (verified/corrected + implemented) and #555 (dropped,
  not-actionable — `biomeCache` holds objects, not numbers, so no typed-array conversion exists);
  `CCR-updatestreaming-sqrt.md` (Finished) covers #548 (confirmed dead code, deleted). **#513 remains
  open** — it was carved out to coordinate with WI-05 (`getBiomeCellDirect`/terrain single-source),
  which is still active. 10 of 11 issues resolved; #513 blocks full closure.
- **WI-14** → `CCR-render-loop-hygiene.md` (Finished) — #542 verified/implemented (gated behind
  `isDebug`).
- **WI-15** → `CCR-deadcode-cleanup.md` (Finished) — all 7 issues (#578, #571, #523, #515, #494,
  #553, #552) present in its per-issue fix table.
- **WI-16** → `CCR-docs-constants-sync.md` (Finished) — #545, #541, #581 all present in its
  per-issue fix table.
- **WI-17** → `CCR-water-color-dedup.md` — re-audited 2026-07-11: the code was found ALREADY
  IMPLEMENTED in `voxEx.html` (matching the CCR's "After" spec byte-for-byte: `computeWaterFaceColor`
  helper + `_waterColorScratch` scratch, `writeFaceColorsWaterIndexed` reduced to a thin wrapper,
  worker injection via `meshFuncs` + scratch emission, `VOXEX_RECENT_CHANGES` entry present). Verified
  with `parity-check.mjs` GREEN, `terrain-node-checks.mjs` GREEN on 3 seeds, and identical
  `terrain-probe.mjs` height-query output before/after. As-built appended to the CCR and the file
  moved to `Finished/` (the stray duplicate that used to live in both locations is now gone — one
  copy remains, in `Finished/`). Marked **Done**.

**Net:** 14 of 17 work items Done, 1 WIP (WI-13), 2 remain Todo (WI-05,
WI-10). 35 of 39 individual issues squashed (see per-WI checkboxes below); the 4 unsquashed are
#514, #517 (WI-05), #573 (WI-10), and #513 (WI-13, blocked on WI-05).

---

## CCR Mapping

The 17 work items are written up as **15 CCRs** in `CCR's/` (status 🔴 Proposed). Small/behavior-neutral work items are batched; `#513` and `#548` were carved out of the perf batch for parity/reachability risk.

| CCR file | CCR ID | Covers WIs | Issues | Batched? |
|----------|--------|-----------|--------|----------|
| `CCR-render-loop-hygiene.md` | VOXEX-CCR-PERF-014 | WI-12, WI-13†, WI-14 | #572, #574, #575, #549, #546, #544, #525, #577, #542 (actionable); ~~#583, #580, #555~~ dropped | ✅ batch |
| `CCR-deadcode-cleanup.md` | VOXEX-CCR-CLEANUP-001 | WI-15, WI-11 | #578, #571, #523, #515, #494, #553, #552, #576 | ✅ batch |
| `CCR-docs-constants-sync.md` | VOXEX-CCR-DOCS-001 | WI-16 | #545, #541, #581 | ✅ batch |
| `CCR-localstorage-hardening.md` | VOXEX-CCR-ROBUST-001 | WI-01 | #519, #518 | solo (P0) |
| `CCR-cache-version-constant.md` | VOXEX-CCR-CACHE-002 | WI-02 | #493 | solo (P0) |
| `CCR-opfs-worker-onerror.md` | VOXEX-CCR-CACHE-003 | WI-03 | #512 | solo (P0) |
| `CCR-pregen-fixes.md` | VOXEX-CCR-PREGEN-001 | WI-04 | #554, #550 | solo |
| `CCR-terrain-single-source.md` | VOXEX-CCR-TERRAIN-001 | WI-05 (+#513) | #514, #517, #513 | solo (HIGH risk) |
| `CCR-zombie-proximity-uniform.md` | VOXEX-CCR-FX-002 | WI-06 | #520 | solo |
| `CCR-tree-toggle-restore.md` | VOXEX-CCR-WORLDUI-001 | WI-07 | #521 | solo |
| `CCR-shadow-bias-reset-sign.md` | VOXEX-CCR-SHADOW-001 | WI-08 | #495 | solo |
| `CCR-particle-skip-despawn.md` | VOXEX-CCR-FX-003 | WI-09 | #570 | solo |
| `CCR-glass-geometry-pool.md` | VOXEX-CCR-VRAM-003 | WI-10 | #573 | solo |
| `CCR-water-color-dedup.md` | VOXEX-CCR-REFACTOR-001 | WI-17 | #524 | solo |
| `CCR-updatestreaming-sqrt.md` | VOXEX-CCR-PERF-016 | (from WI-13) | #548 → **delete dead code** | solo |

† WI-13 minus #513 (→ TERRAIN-001) and #548 (→ PERF-016).

---

## Audit Outcomes (2026-06-28)

Each CCR was audited against live source (build `2026-06-25.34`) by reading the actual code at every site. Verified, corrected, or flagged per issue; CCRs now carry exact line numbers + verbatim before/after snippets. Material findings:

**Dropped — not actionable (3):**
- **#583** — the sun/moon fade `Math.sqrt` feeds a *linear* interpolation, not a threshold; squared-distance substitution is mathematically wrong. ~2 sqrt/frame, negligible.
- **#580** — false claim: `updateVolumetricLighting` already uses its `time` param; no internal `performance.now()`. Only a trivial call-site dup.
- **#555** — `biomeCache` stores biome **objects** (read via `.tags`), not numbers → typed array impossible.

**Reframed:**
- **#548** — not O(n²), and the method is **dead code** (zero call sites). Fix = delete, not optimize.
- **#573** — the "leak" premise was **false** (glass *is* disposed on remesh/unload). Real defect is missing pooling only; also blocked by a color-schema mismatch (pool uses Uint8 RGBA; glass writes Float32 RGB) — fix must pack via `packColorRGBA8`, not a drop-in.
- **#514** — too large for a snippet: root blocker is the preview using a *different noise source* than the game. CCR documents the divergences + an approach; not a one-line fix.

**Corrected (wrong location/fix in draft):** #572 (real site is main-thread mesher, not worker template), #525 (reuse `_aoResult`, not a new const — worker parity), #520 (`_closestZombieResult` was fabricated; use the `updateZombies` loop), #517 (only the bilinear sample is safely shared), #513 (hoist must be emitted into the worker injection block), #519 (most saveData parses are already guarded; only `loadWorld` is unguarded), #512 (a `worker.onerror` already exists — augment it), #521 (gating already exists; just delete the destructive clause), #495 (positive bias is canonical), #578 (4 unread consts, not 1), #523 (also delete orphaned `@keyframes torchFlicker`), #553 (the "wrong comment" claim was false), #576 (exactly 9 hot-path sites identified), #541 (CLAUDE.md self-contradicts: 18 vs 17), #581 (three stale comments, not one).

**Net:** 39 issues → **36 actionable** across 15 CCRs (3 dropped with evidence).

---

## P0 — Critical

### WI-01 · LocalStorage read hardening  `helper`
**Squashes:** #519 (unguarded `JSON.parse` crash), #518 (XSS via unescaped seed)
**Combined solution:** add one `safeParseLocalStorage(key, fallback)` wrapper and route all reads through it; in the same PR, apply the **existing** `escapeHtml()` to `metadata.seed` in the world-card template. Same subsystem (untrusted persisted data → parse/render).
**Code refs:** unguarded parses at lines 3853, 3909, 6033, 6681, 27267 · `escapeHtml()` already defined at 21970 (already used for world name at 22017–22022) · world-card template ~22013.
**Caveat:** also sanity-check the `JSON.parse(saveData)` paths (22050, 22305, 22340, 22401, 22778, 27231) — fold them into the helper while you're there.

- [x] #519 — localStorage `JSON.parse` without try-catch crashes on corrupt settings
- [x] #518 — world card `innerHTML` injects raw `metadata.seed` without escaping

### WI-02 · Single cache-version constant  `helper`
**Squashes:** #493
**Combined solution:** collapse the hardcoded literals into one module-scope `CURRENT_CACHE_VERSION` referenced at every stamp/compare site. The duplicated const declaration is itself the drift vector — de-duplicate it.
**Code refs:** literal `2` stamped at 27306, literal `4` at 27456, `CURRENT_CACHE_VERSION = 5` **declared twice** at 27555 and 39414.
**Caveat:** confirm intended current version (5) and that bumping rules in CLAUDE.md (v3 water attenuation note) still hold.

- [x] #493 — cache version hardcoded inconsistently across three functions (2, 4, 5)

### WI-03 · ChunkDiskStorage worker `onerror` rejects pending  `standalone`
**Squashes:** #512
**Combined solution:** in the OPFS worker `onerror` handler, reject every pending request promise with the error and clear the map; `logDebug('[Chunks] …')`.

- [x] #512 — worker `onerror` does not reject pending OPFS requests

---

## P1 — High

### WI-04 · preGenerateSpawnChunks fixes  `merge`
**Squashes:** #554 (progress % double-count), #550 (dead duplicate assignment)
**Combined solution:** one pass over `preGenerateSpawnChunks()` — fix the Phase-1C denominator so cached chunks count once, and delete the redundant `_pregenActive = false`.
**Code refs:** `preGenerateSpawnChunks` at 27523 · `_pregenActive = false` at **both** 27662 and 27699 (the "twice").

- [x] #554 — progress-bar % double-counts cached chunks during Phase 1C
- [x] #550 — `_pregenActive` set to false twice (dead code)

### WI-05 · Terrain single-source (height/biome parity)  `sweep`
**Squashes:** #514 (preview ≠ game terrain), #517 (`getPreRiverHeight` ~90% dup of `blendedHeight`)
**Combined solution:** extract the shared height/biome path, have the game, preview, and worker all call it. Kills both the duplication (#517) and the preview mismatch (#514) and reduces future drift.
**Caveat:** respect the `__TERRAIN_FUNCS__` injection markers — edit only main-thread sources; keep `WorldPreviewRenderer` parity. Coordinate with #513 in WI-13 (same `getBiomeCellDirect` neighborhood).

- [ ] #514 — WorldPreviewRenderer biome algorithm doesn't match game generation
- [ ] #517 — `getPreRiverHeight` duplicates ~90% of `blendedHeight`

### WI-06 · Zombie proximity uniform wired up  `standalone`
**Squashes:** #520
**Combined solution:** drive the proximity uniform from real nearest-zombie distance each frame (normalize to configured radius); gate on the zombie-effects setting.

- [x] #520 — zombie vignette/desaturation never activates (uniform hardcoded to 0)

### WI-07 · Tree-toggle restores density  `standalone`
**Squashes:** #521
**Combined solution:** treat the checkbox as an enable flag separate from the numeric value; restore the prior/default `treeDensityMultiplier` on re-check instead of leaving 0.

- [x] #521 — unchecking trees sets multiplier=0, re-enabling doesn't restore

### WI-08 · Reset All shadow-bias sign  `standalone`
**Squashes:** #495
**Combined solution:** remove the spurious negation so reset writes the documented default; verify sign matches the live binding.

- [x] #495 — Reset All inverts shadow bias

### WI-09 · ParticleSystem skip-not-despawn  `standalone`
**Squashes:** #570
**Combined solution:** outside `updateDistance`, skip the physics step but keep the particle alive; only despawn on lifetime/cap.

- [x] #570 — particles despawned outside `updateDistance` instead of paused

### WI-10 · Glass mesh uses geometry pool  `standalone`
**Squashes:** #573
**Combined solution:** acquire/release glass geometry through `GeometryBufferPool` like other chunk geometry; ensure disposal on unload.

- [ ] #573 — glass mesh uses `new THREE.BufferGeometry()` instead of pool

### WI-11 · console → logDebug in render path  `standalone`
**Squashes:** #576
**Combined solution:** route hot-path `console.error/warn` through `logDebug('[Tag] …')`, rate-limit, or move out of the per-frame path.

- [x] #576 — `console.error/warn` in hot render path

---

## P2 — Medium

### WI-12 · Volumetric lighting per-frame cleanup  `merge`
**Squashes:** #583 (per-frame `Math.sqrt` fade), #580 (redundant `performance.now()`)
**Combined solution:** one pass over `updateVolumetricLighting()` — drop the per-frame sqrt on the screen-space fade (compare squared / cache when inputs unchanged) and use the `time` param the function already receives instead of re-sampling.
**Code refs:** `updateVolumetricLighting(time)` at 44271 · called as `updateVolumetricLighting(performance.now())` at 44684 (so #580 = "use the param").

- [x] #583 — `Math.sqrt` for sun/moon fade computed per frame *(dropped, not-actionable — sqrt is mathematically required for the linear interp; see Reconciliation Notes)*
- [x] #580 — `performance.now()` re-sampled when `time` already available *(dropped, not-actionable — no internal `performance.now()` exists; see Reconciliation Notes)*

### WI-13 · Hot-path perf sweep (allocations + redundant compute)  `sweep`
**Squashes:** #572, #574, #575, #549, #546, #544, #525, #513, #555, #577, #548
**Combined solution:** one PR applying the codebase's existing pattern (`_springResult`, `volumetricTempVec2`, `_heldTorchPos`): hoist per-call/per-frame arrays & objects to module-scope scratch and reuse; pre-size/typed arrays where applicable; hoist loop-invariant reads; compute once and pass down. Same reviewer mental model across all of them.
**Per-issue note:**
  - #572 terrainBuffers/terrainState per-section (20×/chunk) · #574 `Array.from().slice()` in processChunkQueue · #575 pickVoxel face-dir literals · #549 hiddenWaterMeshes per refraction · #546 sampleIndices in isLightingDataValid · #544 hoist `maxGreedyQuadSize` out of inner loop · #525 calculateFaceAO `[1,1,1,1]` when AO off · #555 biomeCache → typed/pre-sized · #577 inputSpeed/flySpeedMult computed twice/step (compute once, pass down).
  - #513 `_FH_NEIGHBORS` realloc in `getBiomeCellDirect` — **worker-parity / single-source terrain fn**; coordinate with WI-05.
  - #548 `updateStreaming` `Math.sqrt` in O(n²) loop — labeled dead-code: **first verify the loop is reachable**; if live → squared-distance, if dead → delete (move to WI-15).

- [x] #572 — terrainBuffers/terrainState allocated per-section
- [x] #574 — `Array.from(...).slice()` per processChunkQueue
- [x] #575 — pickVoxel face-direction array literals per step
- [x] #549 — hiddenWaterMeshes array per refraction update
- [x] #546 — sampleIndices array per isLightingDataValid call
- [x] #544 — `maxGreedyQuadSize` read inside inner greedy loop
- [x] #525 — calculateFaceAO allocates `[1,1,1,1]` when AO disabled
- [ ] #513 — `_FH_NEIGHBORS` realloc per cache miss (worker parity!) — **blocked on WI-05** (terrain single-source), still open
- [x] #555 — biomeCache uses plain Array *(dropped, not-actionable — holds objects, not numbers; see Reconciliation Notes)*
- [x] #577 — inputSpeed/flySpeedMult computed twice per physics step
- [x] #548 — `Math.sqrt` in O(n²) updateStreaming loop (verify reachable) — confirmed dead code, deleted (`CCR-updatestreaming-sqrt.md`)

### WI-14 · Gate 5s debug `scene.traverse`  `standalone`
**Squashes:** #542
**Combined solution:** put the diagnostic traversal behind a debug flag (off by default).

- [x] #542 — `renderFrame` calls `scene.traverse()` every 5s for diagnostics

---

## P3 — Low

### WI-15 · Dead-code & redundant-code sweep  `sweep`
**Squashes:** #578, #571, #523, #515, #494, #553, #552
**Combined solution:** one "remove dead code" PR; pure deletions with tombstone comments per project convention.
**Per-issue note:** #578 unused `anyPostEffectsActive` · #571 `if(false && …)` block in updateStars · #523 `#torch-overlay` dead CSS/HTML · #515 no-op padding `p=0` · #494 ~100-line unreachable `updateUIFromSettings` fallback · #553 AudioManager unused `settings` param (+correct comment) · #552 redundant touch-mode guard.

- [x] #578 — `anyPostEffectsActive` computed but never used
- [x] #571 — `if (false && …)` dead block in updateStars
- [x] #523 — `#torch-overlay` CSS + HTML never used
- [x] #515 — padding `p=0` in writeFaceUVs has no effect
- [x] #494 — `updateUIFromSettings` fallback body (~100 lines) unreachable
- [x] #553 — AudioManager stores unused settings param
- [x] #552 — redundant touch-mode guard in onTouchRegionPointerDown

### WI-16 · Constants & docs sync  `sweep`
**Squashes:** #545, #541, #581
**Combined solution:** single-source the block IDs (kill the partial `BLOCKS` duplicate, #545); the doc corrections then follow — CLAUDE.md tile/block counts (#541) and the stale 128→320 chunk comment (#581).

- [x] #545 — `BLOCKS` constant is an incomplete partial duplicate of block IDs
- [x] #541 — CLAUDE.md lists NUM_TILES=18 / 16 blocks (code: 33 tiles / 20 blocks)
- [x] #581 — stale comment says chunk is 16×16×128 (should be 320)

### WI-17 · Water-color helper dedup  `standalone`
**Squashes:** #524
**Combined solution:** extract one helper parameterized by indexed/non-indexed; both `writeFaceColorsWater*` call it.
**Status note (2026-07-11):** Done — re-audit found the refactor already implemented byte-for-byte
per `CCR-water-color-dedup.md`'s "After" spec (`computeWaterFaceColor` + `_waterColorScratch`, worker
injection intact). Full verification re-run GREEN (parity-check, terrain-node-checks x3 seeds,
terrain-probe identity). CCR As-built appended, moved to `Finished/`, stray duplicate resolved.

- [x] #524 — writeFaceColorsWater / …Indexed duplicate ~60 lines

---

### Progress
`35 / 39 issues squashed · 14 / 17 work items done` (WI-13 WIP — 10/11 issues, #513 blocked on WI-05; WI-05 and WI-10 remain Todo)

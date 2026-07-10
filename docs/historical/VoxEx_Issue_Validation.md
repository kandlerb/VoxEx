# VoxEx — Open Issue Validation Report

Reviewed all **84 open issues** (#493–#583) against the actual `voxEx.html` source (45,942 lines). Each issue's claim was located by symbol (issue line numbers are uniformly stale) and checked against the real code.

## Verdict tally

| Verdict | Count | Meaning |
|---|---|---|
| **VALID** | 54 | Problem genuinely exists in current code as described |
| **PARTIAL** | 24 | Real observation but trivial, dead-code, or rationale/location partly wrong |
| **INVALID** | 6 | False positive — code doesn't match claim, or behavior is intentional |
| **UNVERIFIABLE / already fixed** | 0 | — |

> **Verify-pass correction (2026-06-24):** #523 was re-checked and moved from "already fixed" to **VALID dead-code** — the `#torch-overlay` CSS/HTML is still in the file (unused). All 6 INVALID closes were re-confirmed against current source.

Bottom line: the auto-review pass was accurate at *locating real code* — no fabricated symbols — but **~35% of issues (the PARTIAL + INVALID set) overstate severity**, most commonly by flagging dead/unreachable code or by attaching a wrong cause/fix to a real snippet.

---

## False positives (INVALID) — safe to close

| # | Title | Why it's wrong |
|---|---|---|
| 557 | SunlightTask.checkPressure mixes queue counts | Code uses `Math.max(add, remove, buffered)` — **not** a sum. The "single sum denominator" premise is fabricated. |
| 551 | canEvictChunk ignores persistModified | The flagged `VoxelWorld.canEvictChunk` is **dead**; the live module-level `canEvictChunk` honors `persistModified`. |
| 516 | WorldPreviewRenderer uses different seed hash | `hashStringForPreview` is byte-identical to `SeededRandom` (same constants); comment even says "Match SeededRandom exactly." |
| 506 | Worker NUM_TILES=33 vs main 18 | Both main thread and worker copy are `NUM_TILES = 33` — they **match**. Premise ("main=18") is stale. |
| 507 | MAX_POINT_LIGHTS shadows module const | Local `MAX_POINT_LIGHTS = 4` in `init()` is used self-consistently for the 4-light volumetric shader. Intentional; naming smell only, no bug. |
| 496 | Star/cloud GPU leak on Reset All | `createStarField` and `createCloudPlane` both dispose existing geometry+material at the top. No leak. |

## Already fixed / not in code

*None.* (#523 was originally listed here but the verify pass found the markup is still present — it's now classified VALID dead-code below.)

---

## Real but low / no runtime impact (PARTIAL)

These point at real code but the stated consequence doesn't actually occur (dead path) or is negligible/cosmetic, or the cause/location is partly wrong.

**Real bug, but in dead/unreachable code (no live effect):**

- **565** isChunkOccluded `present≠opaque` logic bug — function has no callers.
- **563** Vector3Pool.release() never decrements active count — pool has zero acquire/release usage.
- **562** flushChunkSaves empty stub — `queueChunkSave` has no callers, so no data loss.
- **556** pool `analyzeChunkSections` flags water sections solid — consumer `isSectionSolid()` is never called; renderer uses the correct global analyzer.
- **548** updateStreaming sqrt-in-nested-loop — `VoxelWorld.updateStreaming` is dead.
- **538** getLocalSlope per-call alloc — zero live callers (river slope penalty hardcoded to 0).
- **564** initInventory resize-listener leak — single call site, latent only (needs re-init/reload).

**Real snippet, wrong/overstated rationale or location:**

- **580** redundant `performance.now()` — true, but the claimed clock-drift bug is false (`renderFrame` has no frame-time in scope).
- **558** `dirs` per-face alloc — already hoisted to per-block in the live path (CCR-PERF-010); only the test-only headless mesher still allocates.
- **561** smooth-lighting block-scope "workaround" — no naming collision exists; rationale wrong, cosmetic.
- **553** unused param — AudioManager part true; the UIManager half is false (it does use `this.settings`).
- **545** BLOCKS incomplete-duplicate — true, but the named symptom (missing SNOW reference) is stale.
- **529** deprecated fire settings — exist in DEFAULTS/SETTINGS (true), but do **not** bloat SETTINGS_PROFILES as claimed.
- **539** buildChunkWorkerCode uncached — true, but called **once** at init, not per worker spawn.
- **531** getLocal/getLocalLight duplication — real but deliberate/perf-motivated, not a latent divergence.
- **503** baked GLSL loop count — real, but it's the god-ray `VolumetricLightShader`, not `waterMaterialRefraction` as claimed.
- **510** worker crash orphans jobs — mesh jobs have a 500ms timeout; only terrain/init jobs can hang.
- **508** unknown worker message types hang caller — mesh path saved by 500ms timeout; terrain/init not.
- **505** falsy-zero rotation restore — harmless (`0` falls through `|| 0` to `0`).
- **518** XSS via world card — `saveName` is escaped; only raw `metadata.seed` unescaped → self-XSS only.
- **497** reset handlers call localStorage directly — `saveSettings()` is itself one line; "does more" rationale is false.
- **555** biomeCache plain Array — values are object refs; no typed-array fix, marginal.

---

## Valid & worth fixing (VALID)

**Genuine functional bugs (highest value):**

- **521** World creation: unchecking trees sets `treeDensityMultiplier=0`; re-checking restores only `enableTrees`, never the multiplier → **trees stay off**.
- **520** Zombie vignette/desaturation never activate — `zombieProximity` uniform hardcoded to `0.0` with a TODO; nothing computes proximity.
- **527** Memory warning-level render-distance reduction fires **only once** (`_scaledDown` guard, only resets below 0.7× threshold).
- **519** Module-level `JSON.parse(localStorage…)` with no try-catch → **crashes on corrupt settings** before init.
- **493 / 499 / 530** Chunk cache-version is stamped inconsistently (writers use `2` and `4`, reader invalidates on `< 5`) → cached lighting **needlessly recalculated on every load**. (Three issues, one root cause.)
- **495** Reset All sets `sun.shadow.bias = -SETTINGS.shadowBias` (negated) while every other site uses positive → spurious sign flip.
- **512** ChunkDiskStorage `worker.onerror` never rejects pending OPFS requests and has no timeout → callers can hang.
- **526** HTML FPS slider default labels (30/50) don't match `DEFAULTS` (25/60).
- **581** Stale comment "16×16×128" (two places) — chunks are 16×16×320.
- **541** Docs drift: code has `NUM_TILES=33` / 20 block types; `CLAUDE.md` still says 18 / 16.

**Dead code to remove:**

- **578** anyPostEffectsActive/useComposer computed, never read
- **569** queueGeometryUpdate + unused work arrays; flushGeometryUpdates runs on empty queue
- **568** dirtyFlags object never read/set/reset
- **571** `if (false && …)` block in updateStars()
- **550 / 500** _pregenActive set false pre-loop → deferred-save flush block unreachable
- **552** unreachable second touch-mode guard
- **515** `const p = 0` padding in writeFaceUVs (no-op)
- **532** stale zombie-proximity TODO
- **494** updateUIFromSettings ~100-line fallback body (guard always true; comment admits it's dead)
- **523** `#torch-overlay` CSS (~329–355, incl. `@keyframes torchFlicker`) + `<div id="torch-overlay">` (~2186), no JS refs — unused markup (corrected from "already removed")

**Real allocation-in-hot-path / perf nits (genuine):**

- **511** neighborOffsets literal — 256 allocs/chunk in generateTerrainPass
- **513** _FH_NEIGHBORS literal realloc'd per cache miss in getBiomeCellDirect
- **572** terrainBuffers/terrainState allocated per-section in greedy mesh path
- **575** pickVoxel inline face arrays per DDA step
- **574** Array.from(...).slice() per processChunkQueue
- **573** glass mesh bypasses geometryPool
- **525** calculateFaceAO allocs fresh [1,1,1,1] when AO disabled (hot in Performance profile)
- **567** queueChunkGeneration re-sorts whole queue per enqueue
- **566** rleEncode double-allocates
- **544** maxGreedyQuadSize read inside greedy double-loop
- **528** unregisterChunkFires O(n) over all fire cells
- **502** normalizeAngle closure per frame
- **498** O(n²) Array.find dedup in spiral chunk builder
- **549 / 546 / 559 / 542 / 535 / 537** misc (per-frame allocs, redundant scans, ungated traverse, uncached getElementById, pointless async)

**Real consistency / convention issues:**

- **577** duplicate inputSpeed/flySpeedMult per physics step
- **576 / 501** raw console.error/warn/log instead of logDebug
- **534** worker BIOME_CONFIG is a hand-maintained copy that can drift from main thread
- **533** min/maxRenderDistance hardcoded in SETTINGS, missing from DEFAULTS
- **524 / 517 / 504 / 514 / 509** duplicated logic / preview-vs-game mismatch / non-seeded texture RNG

---

## Full index (sorted by issue #)

| # | Verdict |
|---|---|
| 583 | PARTIAL |
| 581 | VALID |
| 580 | PARTIAL |
| 578 | VALID |
| 577 | VALID |
| 576 | VALID |
| 575 | VALID |
| 574 | VALID |
| 573 | VALID |
| 572 | VALID |
| 571 | VALID |
| 570 | VALID |
| 569 | VALID |
| 568 | VALID |
| 567 | VALID |
| 566 | VALID |
| 565 | PARTIAL (dead-code bug) |
| 564 | PARTIAL |
| 563 | PARTIAL |
| 562 | PARTIAL |
| 561 | PARTIAL |
| 560 | PARTIAL |
| 559 | VALID |
| 558 | PARTIAL |
| 557 | INVALID |
| 556 | PARTIAL |
| 555 | PARTIAL |
| 554 | VALID |
| 553 | PARTIAL |
| 552 | VALID |
| 551 | INVALID |
| 550 | VALID |
| 549 | VALID |
| 548 | PARTIAL |
| 546 | VALID |
| 545 | PARTIAL |
| 544 | VALID |
| 542 | VALID |
| 541 | VALID |
| 539 | PARTIAL |
| 538 | PARTIAL |
| 537 | VALID |
| 535 | VALID |
| 534 | VALID |
| 533 | VALID |
| 532 | VALID |
| 531 | PARTIAL |
| 530 | VALID |
| 529 | PARTIAL |
| 528 | VALID |
| 527 | VALID |
| 526 | VALID |
| 525 | VALID |
| 524 | VALID |
| 523 | VALID (dead code — markup still present) |
| 521 | VALID |
| 520 | VALID |
| 519 | VALID |
| 518 | PARTIAL |
| 517 | VALID |
| 516 | INVALID |
| 515 | VALID |
| 514 | VALID |
| 513 | VALID |
| 512 | VALID |
| 511 | VALID |
| 510 | PARTIAL |
| 509 | VALID |
| 508 | PARTIAL |
| 507 | INVALID (smell only) |
| 506 | INVALID |
| 505 | PARTIAL |
| 504 | VALID |
| 503 | PARTIAL |
| 502 | VALID |
| 501 | VALID |
| 500 | VALID |
| 499 | VALID |
| 498 | VALID |
| 497 | PARTIAL |
| 496 | INVALID |
| 495 | VALID |
| 494 | VALID |
| 493 | VALID |

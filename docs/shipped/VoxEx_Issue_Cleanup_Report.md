# VoxEx Issue-Tracker Cleanup — Run Report

**Source CCR:** `CCR-issue-tracker-cleanup.md`
**Repo:** `kandlerb/VoxEx` · executed via local `gh` (authenticated as `kandlerb`)
**Method:** every finding re-verified by **symbol** against current `voxEx.html` before acting (line numbers in the CCR were stale and ignored). Idempotency confirmed by inspection — all targets still carried their original labels, proving no prior run.

## Summary

| Bucket | Planned | Done | Notes |
|---|---|---|---|
| A. Close — not planned | 6 | **6** | all verified valid |
| B. Close — completed | 1 | **0** | #523 **drifted** — left open + flagged |
| C. Comment + relabel/retitle (keep open) | 24 | **24** | all findings still hold |
| D. Optional cross-refs | 2 | **2** | #499, #530 → #493 (kept open) |

---

## A. Closed as false positive (`--reason "not planned"`) — verified

| Issue | Verified against code | Result |
|---|---|---|
| #557 | `checkPressure()` = `Math.max(addEntries, removeEntries, bufferedEntries)` — no summed denominator | Closed |
| #551 | `VoxelWorld.canEvictChunk` (L7763) has no callers; live path is module-level `canEvictChunk` (L17845, called L42550) | Closed |
| #516 | `hashStringForPreview` identical to both `SeededRandom` hashes (`0xdeadbeef`, `*2654435761`, same finalizer) | Closed |
| #506 | `NUM_TILES = 33` on **both** main thread (L4267) and worker copy (L18415) | Closed |
| #507 | local `MAX_POINT_LIGHTS = 4` (L28041) sizes the volumetric shader consistently; module-level `= 8` is the separate torch system | Closed (wontfix wording) |
| #496 | `createStarField`/`createCloudPlane` both `scene.remove` + dispose geometry & material before rebuild | Closed |

## B. Already-fixed close — NOT performed

| Issue | Expected | Actual | Action |
|---|---|---|---|
| #523 | `torch-overlay` / `torchFlicker` → **zero** matches | **6 matches still present** — `#torch-overlay` CSS (L329/332/343), `@keyframes torchFlicker` (L353/355), `<div id="torch-overlay">` (L2186) | **Left OPEN, flagged for human review** (per CCR rule). Still a valid dead-markup issue — just not yet removed, so closing as "completed" would be false. |

## C. Commented + relabeled/retitled (kept open) — all 24

| Issue | Label change | Retitle | Verified |
|---|---|---|---|
| #583 | +cleanup | "refactor: extract computeSpriteFade() …" | dup `sqrt(dx²+dy²)` sun/moon blocks; no `computeSpriteFade` yet |
| #580 | +cleanup | "cleanup: thread frame time into updateVolumetricLighting …" | `renderFrame()` takes no time arg; `updateVolumetricLighting(performance.now())` |
| #565 | bug → dead-code | — | `isChunkOccluded` uses presence-not-opacity; single occurrence = dead |
| #564 | (keep) | — | anonymous `resize` listener, no remove; single call site → latent |
| #563 | +cleanup | — | `_callCounts.release++` w/o active decrement; `vec3Pool` count = 1 (unused) |
| #562 | bug → dead-code | — | `// Save logic here` empty loop; `queueChunkSave` no callers |
| #561 | +cleanup | — | `_slt` block-scope exists; no real collision |
| #560 | (keep) | — | `getElementById("blocker")` per wheel event |
| #558 | +cleanup | "perf: hoist dirs literal in meshChunkHeadless (test-only) …" | production `_renderChunkImpl` already hoisted; only headless mesher remains |
| #556 | bug → dead-code | — | pool analyzer flags water solid; `isSectionSolid` no callers; global analyzer is live |
| #555 | +cleanup | — | `new Array(chunkSize*chunkSize)` in `precalculateTerrainCaches` (biome refs) |
| #553 | (none) | "code smell: AudioManager stores unused settings param (UIManager part is incorrect)" | AudioManager stores unused `settings`; UIManager actually uses it |
| #548 | perf → dead-code | — | `VoxelWorld.updateStreaming` single occurrence = dead |
| #545 | (keep bug) | — | `BLOCKS` = 12 keys, **no SNOW/GRAVEL**; `BLOCKS.SNOW` referenced (L16263) → `undefined` |
| #539 | perf → cleanup | — | `buildChunkWorkerCode()` called once (L19462); no `_replaceWorker` |
| #538 | perf → dead-code | — | `getLocalSlope` only in injection lists, no call site |
| #531 | +cleanup | — | `_renderChunkImpl` inlines getters (verbatim port of `buildChunkLightGetters`) — deliberate |
| #529 | (keep) | — | fire keys in DEFAULTS/SETTINGS (deprecated), **not** in `SETTINGS_PROFILES` |
| #518 | (keep bug) | — | `escapeHtml` applied to `saveName`; `metadata.seed` raw (L21844) → self-XSS |
| #510 | (keep bug) | — | `_handleWorkerError` doesn't reject; mesh wrapped in 500 ms timeout, terrain/init not |
| #508 | (keep bug) | — | chunk worker `self.onmessage` if-chain, no default branch |
| #505 | bug → cleanup | — | `rot._x || rot.x || 0` falsy-zero — harmless |
| #503 | (keep bug) | — | volumetric loop bound baked at build; it's `VolumetricLightShader`, not `waterMaterialRefraction` |
| #497 | bug → cleanup | — | reset handlers inline `setItem`; `saveSettings()` is that single line — nothing skipped |

> "(keep)" = CCR said keep the existing label; comment only. Issues #564/#560/#545/#529/#503 had no label to keep, so none was added.

## D. Optional — cache-version cluster

- #493 confirmed **OPEN** (canonical).
- #499, #530 — posted cross-reference comment pointing at #493. **Kept open** (not closed, per CCR).

---

## Needs human review

- **#523** — torch-overlay markup/keyframes are still in `voxEx.html`. The dead-code issue is **still valid**; do not close until the markup is actually removed (the torch is a Three.js viewmodel, so the `#torch-overlay` div + CSS + `torchFlicker` keyframes appear safe to delete — but that's a code change, out of scope for this tracker-only CCR).

## Untouched
All 53 VALID issues not named in the CCR were left exactly as-is (incl. the #493/#499/#530 cluster beyond the cross-ref comments, #521/#520/#519/#527/#512/#495, etc.).

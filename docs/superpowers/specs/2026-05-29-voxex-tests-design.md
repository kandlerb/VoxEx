# VoxEx Test Coverage — Design Spec

**Date:** 2026-05-29
**Status:** Approved (pending user review of this document)
**Goal:** Test the *real* logic inside `voxEx.html` (not re-typed copies) and verify that
its subsystems work together, while preserving the project's "single file, zero build" principles.

---

## 1. Problem

`voxEx.html` is a ~42K-line single-file voxel game. A test suite already exists at
`tools/voxex-tests.html` (~127 tests across ~50 suites), but it works by **manually
re-implementing the pure functions** from `voxEx.html` inside the test file. Consequences:

- Tests verify *copies* of the logic, which silently drift from the real source.
- Nothing verifies that subsystems actually interoperate at runtime ("working together").

`voxEx.html` is a `type="module"` IIFE with **no test exports** — nothing is exposed on
`window`, so the real functions cannot currently be reached from a test page.

**Key enabling fact:** the main-thread terrain functions are the single source of truth.
`buildChunkWorkerCode()` (voxEx.html:20006) serializes them into the chunk worker via
`Function.toString()` — the code comment at voxEx.html:20026 states this "guarantees
identical behavior." Therefore, testing the main-scope functions = testing the literal
code the worker executes.

---

## 2. Approach

**Chosen:** Add a minimal, production-inert test seam to `voxEx.html` that exposes the real
internals, then rewrite `tools/voxex-tests.html` to load the real game in a hidden iframe and
run all tests against those real functions/classes.

**Rejected alternative:** A Node + Playwright/Vitest harness. More standard, but introduces
npm/build tooling that violates the project's "zero build steps" principle. A browser iframe
provides the real DOM/Worker/IndexedDB globals for free, so we stay browser-only.

---

## 3. The Test Seam (in `voxEx.html`)

One small block (~15–25 lines) added near the end of the module, gated on a URL flag.
Inert unless the page is loaded with `?test=1`.

```js
// --- TEST SEAM (inert unless ?test=1) ---
if (location.search.includes('test=1')) {
    window.__VOXEX_TEST_MODE__ = true;   // also used to skip game auto-boot side-effects
    window.VoxEx = {
        // constants
        AIR, GRASS, DIRT, STONE, WOOD, LOG, LEAVES, BEDROCK, SAND, WATER, TORCH,
        SNOW, GRAVEL, LONGWOOD_LOG, LONGWOOD_LEAVES, UNLOADED_BLOCK,
        CHUNK_SIZE, CHUNK_HEIGHT, SECTION_HEIGHT, SECTIONS_PER_CHUNK, /* … */
        // terrain (the same fns the worker runs via toString)
        continentalHeight, defaultHeightFunc, hillsHeightFunc, plainsHeightFunc,
        foothillsHeightFunc, mountainsHeightFunc, blendedHeight, getBiomeHeightAtCell,
        getRiverFactor, getOceanFactor, getRiverDepth, getOceanDepth,
        getPreRiverHeight, getLocalSlope, uniformBiomeRoll,
        // noise / rng
        initNoise, noise2D, noise3D, SeededRandom,
        // lighting / meshing / compression / geometry helpers
        rleEncode, rleDecode, compressChunkData, decompressChunkData, /* … */
        // classes that don't need WebGL
        VoxelWorld, ChunkDataPool, TerrainGenerator, /* … */
    };
}
```

The exact export list is finalized during implementation by matching what each test tier
needs. The block must not alter behavior when the flag is absent.

**Auto-boot:** loading `voxEx.html` lands on the menu; the heavy 3D loop only starts after
seed selection. The seam additionally short-circuits any `DOMContentLoaded` init side effects
(e.g. AudioContext creation) when `__VOXEX_TEST_MODE__` is set, so the iframe stays quiet.

---

## 4. The Harness (`tools/voxex-tests.html`, rewritten)

- Keep the existing `describe / it / expect` mini-framework and the terrain-heightmap
  visualizations (already wired to the same functions).
- Load the real game in a hidden iframe: `<iframe src="../voxEx.html?test=1">`. On load,
  read `iframe.contentWindow.VoxEx` and bind it as the namespace all tests call.
- **Async support:** extend `it()` to await a returned promise (Tier 4 needs this). Add
  matchers as required (`toBeDefined`, async `rejects`). The pass/fail summary stays the same.
- Re-point the existing ~127 tests from copied locals to `VoxEx.*`.

---

## 5. Coverage Tiers

All tiers run through the seam in the hidden iframe **without booting the 3D game**. The
iframe is a real browser, so Workers and IndexedDB/OPFS are available for Tier 4.

### Tier 1 — Re-point the existing suite (foundation)
Rewire the current ~127 tests to `VoxEx.*` so they exercise real code. Triage every resulting
mismatch (see §6). This is the safety net established before expanding.

### Tier 2 — Expand pure-logic coverage
- **Terrain** (`blendedHeight`, biome funcs, rivers/oceans, slope): determinism across
  multiple seeds; finite/no-NaN sweeps over wide coordinate ranges; sea-level invariants;
  biome-blend continuity across cell boundaries; river-depth monotonicity.
- **Lighting:** sunlight BFS + block-light propagation on hand-built chunks; attenuation
  correctness; edge propagation via `ChunkNeighborCache`.
- **Compression:** `rleEncode → rleDecode` round-trip identity on random, structured, and
  pathological data (all-air, all-same, alternating); compression-ratio bounds.
- **Meshing:** face culling (hidden faces removed between solids); greedy merge keys; AO
  values; water/leaf special-casing; `estimateChunkFaces` upper-bound sanity; tight-bounds and
  section analysis.
- **Block tables:** every block ID classified consistently across solid/opaque/transparent/
  attenuation tables — catches a new block type added without updating a table.
- **Trees/structures:** deterministic positions per seed; trunk footprint correctness; canopy
  voxels stay within the computed radius.

### Tier 3 — Class / state-level (real classes, no WebGL)
- `VoxelWorld`: block & light get/set round-trips; chunk-key math; batch operations.
- `ChunkDataPool` and memory pools: acquire/release accounting; reuse; no leaks.
- `MemoryBudgetManager`: quota / eviction logic.
- Collision (`playerIntersectsBlock`) and raycast (`pickVoxel`): hits, misses, face normals.

### Tier 4 — Subsystem integration smoke (the truest "working together")
Uses real browser APIs in the iframe; still no game boot.
- **Real chunk Worker round-trip:** post a generate message to an actual `ChunkWorkerPool`
  worker and assert the returned chunk's surface matches main-thread `blendedHeight`. This
  proves the `toString()` injection works end-to-end — the one thing pure tests cannot verify.
- **Persistence round-trip:** write a chunk via IndexedDB/OPFS, read it back, assert
  byte-equality.

### Out of scope (need full game boot / GPU / user gesture; poor ROI here)
`RenderEngine` visuals, post-processing shaders, `AudioManager` output, UI/menu/input flows.

---

## 6. Mismatch Triage Policy

When re-pointing (Tier 1) or new tests surface a failure, do **not** silently edit the test to
make it green. Classify each:

- **(a) Stale test** — the test encoded an out-of-date copy of the logic → correct the test.
- **(b) Real discrepancy** — `voxEx.html` behaves differently than the test expected → flag it
  to the user. Do **not** change game logic without the user's call.

Tier 1's entire value depends on this honesty.

---

## 7. Success Criteria

1. **Seam is inert in normal use:** opening `voxEx.html` without `?test=1` boots and plays
   exactly as before.
2. **Suite runs against real code:** `tools/voxex-tests.html` opens in a browser, loads the
   real game via the iframe, and runs green — or surfaces genuine findings, clearly labeled.
3. **All four tiers present;** the existing 127 tests are preserved and now run against real
   code.
4. **No new build tools, no external dependencies;** the single-file principle is intact.

---

## 8. Verification

- Open `tools/voxex-tests.html` in a browser (the harness appends `?test=1` to the iframe src
  internally); confirm the summary banner and tier results.
- Separately open `voxEx.html` with no query string; confirm the game still starts and the
  seam is inert.

---

## 9. Files Touched

| File | Change |
|------|--------|
| `voxEx.html` | One gated test-seam block (~15–25 lines) near the end of the module. Nothing else. |
| `tools/voxex-tests.html` | Rewritten harness: iframe loader, async-capable runner, re-pointed Tier 1 tests, new Tier 2–4 tests. Heightmap visualizations retained. |
| `docs/superpowers/specs/2026-05-29-voxex-tests-design.md` | This spec. |

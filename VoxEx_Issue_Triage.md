# VoxEx — Open Issue Triage

**Generated:** Jun 27, 2026 · **Source:** [github.com/kandlerb/VoxEx/issues](https://github.com/kandlerb/VoxEx/issues) (logged-out list)
**Open issues found:** 39 (the tab badge shows ~78, but it is a stale cached count — the live paginated list ends at #493 with no results beyond)

Ordered by priority. Explanations and fixes are derived from issue titles + `CLAUDE.md`; confirm against each issue body and the code before committing.

---

## P0 — Critical (crash / security / data integrity)

**1. [#519](https://github.com/kandlerb/VoxEx/issues/519) — localStorage JSON.parse without try-catch crashes the game on corrupt settings**
A bad/partial `localStorage` value throws during parse and takes the whole game down on boot.
*Fix:* wrap every `JSON.parse(localStorage…)` in try-catch; on failure log via `logDebug`, fall back to `DEFAULTS`, and overwrite the corrupt key. This is a load-boundary, exactly where try-catch is sanctioned.

**2. [#518](https://github.com/kandlerb/VoxEx/issues/518) — XSS: world card `innerHTML` injects raw `metadata.seed` from LocalStorage without escaping** `[bug]`
A seed string containing markup is written straight into `innerHTML`, allowing script/markup injection from saved data.
*Fix:* escape the value (textContent, or an `escapeHtml()` helper) before interpolation, or build the node with `createElement`/`textContent`. Audit sibling fields (world name, etc.) for the same pattern.

**3. [#493](https://github.com/kandlerb/VoxEx/issues/493) — Cache version hardcoded inconsistently across three functions (2, 4, 5)**
Three code paths disagree on the chunk cache version, so cached lighting/blocks can be read back as valid when they are stale → visual/lighting corruption on load.
*Fix:* replace the literals with the single `CURRENT_CACHE_VERSION` constant everywhere it is written/compared; verify against the v3 water-attenuation note in `CLAUDE.md`.

**4. [#512](https://github.com/kandlerb/VoxEx/issues/512) — ChunkDiskStorage: worker `onerror` does not reject pending OPFS requests** `[bug]`
If the OPFS worker errors, in-flight request promises never settle — chunk loads hang and memory leaks.
*Fix:* in the worker `onerror` handler, reject all pending requests in the map with the error and clear the map; surface a one-line `logDebug('[Chunks] …')`.

---

## P1 — High (visibly broken features / functional bugs)

**5. [#520](https://github.com/kandlerb/VoxEx/issues/520) — Zombie vignette/desaturation effects never activate (proximity uniform hardcoded to 0)**
The zombie-proximity post-effect is dead — the shader uniform is pinned at 0 so the effect never shows.
*Fix:* drive the uniform from the real nearest-zombie distance each frame (clamp/normalize to the configured radius); gate on the zombie-effects setting.

**6. [#521](https://github.com/kandlerb/VoxEx/issues/521) — World creation: unchecking "trees" sets `treeDensityMultiplier=0` but re-enabling doesn't restore it** `[bug]`
Toggling trees off then on leaves density at 0, producing a treeless world with the box checked.
*Fix:* store the prior multiplier (or restore the preset/default) when re-checking, instead of leaving it at 0. Treat the checkbox as an enable flag separate from the numeric value.

**7. [#514](https://github.com/kandlerb/VoxEx/issues/514) — WorldPreviewRenderer biome algorithm doesn't match game terrain generation** `[bug]`
The creation preview shows a different world than what generates — violates the preview-parity rule in `CLAUDE.md`.
*Fix:* align `WorldPreviewRenderer`/`WorldPreviewNoise` biome selection with `getBiomeCellDirect`/`isMountainRegion`; ideally share the calibrated CDF table rather than a second implementation.

**8. [#495](https://github.com/kandlerb/VoxEx/issues/495) — "Reset All" inverts shadow bias (spurious negation)**
Resetting settings flips the sign of shadow bias, causing shadow acne/peter-panning after a reset.
*Fix:* remove the stray negation so the reset writes the documented default value; confirm the sign matches the live binding.

**9. [#554](https://github.com/kandlerb/VoxEx/issues/554) — preGenerateSpawnChunks: progress-bar % double-counts cached chunks during Phase 1C** `[bug]`
The spawn-gen progress bar overshoots/!=100% because cached chunks are counted twice.
*Fix:* count each chunk once — exclude already-cached chunks from the denominator or from the increment, not both.

**10. [#570](https://github.com/kandlerb/VoxEx/issues/570) — ParticleSystem despawns particles outside `updateDistance` instead of skipping physics**
Particles that leave the update radius are killed rather than paused, so they pop out of existence near the edge.
*Fix:* when outside `updateDistance`, skip the physics/integration step but keep the particle alive; only despawn on lifetime expiry or hard cap.

**11. [#573](https://github.com/kandlerb/VoxEx/issues/573) — Glass mesh uses `new THREE.BufferGeometry()` instead of the geometry pool** `[bug][performance]`
Bypasses `GeometryBufferPool`, so glass geometry isn't pooled or reliably disposed — fragmentation + leak over time.
*Fix:* acquire/release glass geometry through the pool like other chunk geometry; ensure disposal on chunk unload.

**12. [#576](https://github.com/kandlerb/VoxEx/issues/576) — `console.error/warn` in hot render path (violates `logDebug` convention)**
Direct console calls in per-frame code can spam the console and stall the main thread.
*Fix:* route through `logDebug('[Tag] …')`, rate-limit or move out of the per-frame path; reserve raw console for true boundary errors.

---

## P2 — Medium (hot-path performance: per-frame / per-chunk allocations & redundant math)

**13. [#572](https://github.com/kandlerb/VoxEx/issues/572) — `terrainBuffers`/`terrainState` objects allocated per-section in greedy mesh path (20× per chunk)** `[performance]`
*Fix:* hoist to reusable scratch objects reset per section (the file's `_scratch*` pattern); avoid 20 allocations per chunk mesh.

**14. [#583](https://github.com/kandlerb/VoxEx/issues/583) — `Math.sqrt` for screen-space sun/moon fade computed per frame in `updateVolumetricLighting`**
*Fix:* compare squared distances, or cache the result when inputs are unchanged; avoid the sqrt every frame.

**15. [#574](https://github.com/kandlerb/VoxEx/issues/574) — `Array.from(chunkNeighborUpdateQueue).slice()` allocates an array on every `processChunkQueue` call** `[performance]`
*Fix:* iterate the queue directly (index or iterator) without copying; drain into a reused buffer if a snapshot is required.

**16. [#575](https://github.com/kandlerb/VoxEx/issues/575) — `pickVoxel` allocates face-direction arrays as inline literals on every step** `[performance]`
*Fix:* hoist the direction table to a module-scope constant (typed array / frozen literal) reused across calls.

**17. [#577](https://github.com/kandlerb/VoxEx/issues/577) — `inputSpeed`/`flySpeedMult` computed twice per physics step**
*Fix:* compute once in the movement step and pass the value into `applyPlayerVelocity` rather than recomputing.

**18. [#549](https://github.com/kandlerb/VoxEx/issues/549) — `hiddenWaterMeshes` array allocated per refraction update in `renderFrame`**
*Fix:* reuse a persistent array cleared (`length = 0`) each frame instead of reallocating.

**19. [#548](https://github.com/kandlerb/VoxEx/issues/548) — `VoxelWorld.updateStreaming()` calls `Math.sqrt` in an O(n²) nested loop** `[dead-code]`
*Fix:* compare squared distances against a squared radius; the `dead-code` label suggests part of the loop is also unreachable — remove it.

**20. [#546](https://github.com/kandlerb/VoxEx/issues/546) — `sampleIndices` array allocated on every call to `isLightingDataValid`**
*Fix:* precompute the sample-index set once (module constant) and reuse it.

**21. [#544](https://github.com/kandlerb/VoxEx/issues/544) — `SETTINGS.maxGreedyQuadSize` read inside the inner greedy-meshing loop**
*Fix:* read into a local `const` before the loop (hoist the property access out of the hot loop).

**22. [#525](https://github.com/kandlerb/VoxEx/issues/525) — `calculateFaceAO` allocates `[1,1,1,1]` on every call when AO is disabled**
*Fix:* return a shared frozen constant array (or a hoisted scratch) for the AO-off case.

**23. [#513](https://github.com/kandlerb/VoxEx/issues/513) — `_FH_NEIGHBORS` array re-allocated on every cache miss in `getBiomeCellDirect`**
*Fix:* allocate the neighbor scratch once and reuse it; remember worker parity — this terrain function is single-sourced.

**24. [#580](https://github.com/kandlerb/VoxEx/issues/580) — `updateVolumetricLighting` calls `performance.now()` again when the time is already available**
*Fix:* pass the existing frame timestamp into the function instead of re-sampling.

**25. [#542](https://github.com/kandlerb/VoxEx/issues/542) — `renderFrame` calls `scene.traverse()` every 5 seconds for mesh diagnostics**
*Fix:* gate the diagnostic traversal behind a debug flag (off by default) so production frames don't pay for it.

**26. [#555](https://github.com/kandlerb/VoxEx/issues/555) — `biomeCache` uses a plain Array in `precalculateTerrainCaches`** `[cleanup]`
*Fix:* use a pre-sized typed array (or pre-size the array) per the typed-array convention to cut GC pressure.

---

## P3 — Low (dead code, refactors, code smells, docs)

**27. [#494](https://github.com/kandlerb/VoxEx/issues/494) — `updateUIFromSettings` fallback body (~100 lines) is unreachable**
*Fix:* delete the dead branch; leave a tombstone comment per the project's removal convention.

**28. [#578](https://github.com/kandlerb/VoxEx/issues/578) — `anyPostEffectsActive` computed but never used (`useComposer` always true)**
*Fix:* remove the unused computation, or wire `useComposer` to it if the optimization was intended.

**29. [#571](https://github.com/kandlerb/VoxEx/issues/571) — `if (false && …)` debug block in `updateStars()` can never execute**
*Fix:* delete the dead block.

**30. [#523](https://github.com/kandlerb/VoxEx/issues/523) — `#torch-overlay` CSS + HTML div never used (torch is a Three.js viewmodel)** `[dead-code]`
*Fix:* remove the orphaned CSS rule and the HTML element.

**31. [#515](https://github.com/kandlerb/VoxEx/issues/515) — Padding variable `p = 0` in `writeFaceUVs` has no effect**
*Fix:* remove the no-op variable and its usage (or implement real padding if atlas bleed was the intent).

**32. [#550](https://github.com/kandlerb/VoxEx/issues/550) — preGenerateSpawnChunks: `_pregenActive` set to false twice (leftover from old refactor)** `[bug]`
*Fix:* delete the redundant second assignment.

**33. [#524](https://github.com/kandlerb/VoxEx/issues/524) — `writeFaceColorsWater` and `writeFaceColorsWaterIndexed` duplicate ~60 lines**
*Fix:* extract the shared coloring into one helper parameterized by indexed/non-indexed output.

**34. [#517](https://github.com/kandlerb/VoxEx/issues/517) — `getPreRiverHeight` duplicates ~90% of `blendedHeight`**
*Fix:* extract the shared height path; have both call it. Keep worker + `WorldPreviewRenderer` parity.

**35. [#545](https://github.com/kandlerb/VoxEx/issues/545) — `BLOCKS` constant is an incomplete partial duplicate of the block-ID constants** `[bug]`
*Fix:* remove `BLOCKS` and use the canonical block-ID constants, or generate it from them so it can't drift.

**36. [#553](https://github.com/kandlerb/VoxEx/issues/553) — `AudioManager` stores an unused `settings` param (UIManager note is incorrect)**
*Fix:* drop the unused param/field; correct the comment.

**37. [#552](https://github.com/kandlerb/VoxEx/issues/552) — Redundant touch-mode guard in `onTouchRegionPointerDown`**
*Fix:* remove the duplicate `if (!touchModeActive) return;` (the handler already guards once).

**38. [#581](https://github.com/kandlerb/VoxEx/issues/581) — Stale comment says chunk is 16×16×128 — should be 16×16×320** `[documentation]`
*Fix:* correct the comment to 320 / `CHUNK_HEIGHT`.

**39. [#541](https://github.com/kandlerb/VoxEx/issues/541) — Docs: `CLAUDE.md` lists `NUM_TILES=18` and 16 blocks — code has 33 tiles and 20 block types**
*Fix:* update `CLAUDE.md` (block table, `NUM_TILES`, atlas count, and the checklist references) to match the current code.

---

### Suggested order of attack
1. **P0 (#519, #518, #493, #512)** — crash, security, and cache-corruption risks; small, surgical fixes.
2. **P1 functional bugs** — restore visibly broken features (#520, #521, #514, #495, #554, #570) and the pooling/logging bugs (#573, #576).
3. **P2 perf** — batch the allocation/sqrt fixes; several touch the meshing hot path (#572, #574, #575, #544, #525) and share the same "hoist scratch / compare squared distance" pattern.
4. **P3** — sweep dead code and refactors together; finish with the two docs fixes (#581, #541).

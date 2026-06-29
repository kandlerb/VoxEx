# CCR — preGenerateSpawnChunks: Progress Math + Dead Assignment

**ID:** VOXEX-CCR-PREGEN-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #554, #550
**Scope:** Two fixes inside `preGenerateSpawnChunks()` — correct the Phase-1C progress percentage so cached chunks aren't double-counted (#554), and remove a redundant `_pregenActive = false` assignment (#550). One pass over one function.

> Line numbers are as of build `2026-06-24.x` and **will drift** — grep `preGenerateSpawnChunks` and `_pregenActive` before editing.

---

### #554 — Phase-1C progress bar double-counts cached chunks
**Location:** `preGenerateSpawnChunks` Phase-1C generation loop — line ~27687 (grep: `const totalProcessed = processedCached + generatedCount`)
**Why:** The Phase-1C percent formula adds `processedCached` twice — once inside `totalProcessed` and again as a standalone `50 * (processedCached / total)` term — then clamps with `Math.min(50, …)`. The cached fraction is counted twice, so the bar overshoots the 0–50 band and clamps flat instead of advancing smoothly. Phase 1B already advanced the bar to `(processedCached / total) * 50`%, so Phase 1C only needs `(totalProcessed / total) * 50`.
**Change:** Replace the two-term percent with a single-count formula: `Math.floor((totalProcessed / chunksToProcess.length) * 50)`, where `totalProcessed = processedCached + generatedCount`. Each chunk now contributes exactly once across the combined 0–50% band; the clamp becomes redundant but is kept harmless.

**Context:** The three progress-bar bands inside `preGenerateSpawnChunks` share one denominator (`chunksToProcess.length`) and split the 0–100% range as 1B → 0–50% (cached), 1C → still 0–50% (newly generated, ADDED to the cached count), 2 → 50–100% (rendering). The Phase-1C formula being fixed must keep contributing to the SAME 0–50 band that 1B started filling — `totalProcessed = processedCached + generatedCount` already carries the cached chunks forward, so adding `processedCached` a second time is the double-count. Variables: `processedCached` (Phase-1B cached-chunk counter), `generatedCount` (Phase-1C generated-chunk counter), `chunksToProcess.length` (combined total = denominator), `chunksNeedingGeneration.length` (the text-only fraction shown to the user).

Phase 1B (~27647–27650) — fills 0–50% from cached chunks, single-count:
```js
                    // Update progress less frequently for cached chunks (they're fast)
                    if (i % (CACHE_BATCH_SIZE * 2) === 0) {
                        const percent = Math.floor((processedCached / chunksToProcess.length) * 50);
                        if (progressBar) progressBar.style.width = `${percent}%`;
                        if (progressText) progressText.textContent = `Loaded ${processedCached} cached chunks...`;
```
Phase 2 (~27760–27763) — fills 50–100% from rendered chunks (note the `50 +` base offset and separate `chunksToRender.length` denominator — leave untouched):
```js
                    // Update progress and yield after each batch
                    const percent = 50 + Math.floor((rendered / chunksToRender.length) * 50);
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressText) progressText.textContent = `Rendering ${rendered}/${chunksToRender.length}...`;
```
The corrected Phase-1C `Math.floor((totalProcessed / chunksToProcess.length) * 50)` is band-consistent with both: it picks up where 1B left off (cached chunks already counted via `totalProcessed`) and never exceeds 50, so Phase 2's `50 +` base joins it seamlessly.

**Before:**
```js
                        // Update progress
                        const totalProcessed = processedCached + generatedCount;
                        const percent = Math.floor((totalProcessed / chunksToProcess.length) * 50) + 50 * (processedCached / chunksToProcess.length);
                        if (progressBar) progressBar.style.width = `${Math.min(50, percent)}%`;
                        if (progressText) progressText.textContent = `Generated ${generatedCount}/${chunksNeedingGeneration.length} chunks...`;
```
**After:**
```js
                        // Update progress — count each chunk once across the combined cached+generated 0–50% band.
                        // #554: prior formula added processedCached twice (inside totalProcessed AND a standalone term).
                        const totalProcessed = processedCached + generatedCount;
                        const percent = Math.floor((totalProcessed / chunksToProcess.length) * 50);
                        if (progressBar) progressBar.style.width = `${Math.min(50, percent)}%`;
                        if (progressText) progressText.textContent = `Generated ${generatedCount}/${chunksNeedingGeneration.length} chunks...`;
```
**Verify:** Enter a fresh (all-uncached) world and a previously-cached world. In both, the progress bar advances monotonically and reaches 100% (Phase 1B → ≤50%, Phase 1C → ≤50%, Phase 2 → 100%); it never overshoots or sticks flat in the 0–50 band. Chunks still render identically (display-only change).

---

### #550 — Redundant `_pregenActive = false` assignment
**Location:** `preGenerateSpawnChunks` — line ~27699 (grep: `_pregenActive = false`)
**Why:** `_pregenActive = false` is written twice. The first (~27662, at the top of Phase 1C with the build-.23 regression note) is the intended, live reset — Lever-2 deferral is disabled, so the flag is already `false` for the rest of the function. The second (~27699, before the deferred batch-save block) is dead: the flag was set `false` 37 lines earlier and nothing sets it `true` in between, so this re-assignment is a no-op.
**Change:** Delete the redundant second assignment at ~27699; leave a tombstone. Keep the first (~27662). The deferred-save block that follows is untouched.

**Context:** `_pregenActive` is declared `let _pregenActive = false;` at module scope (~13973, comment: "VOXEX-CCR-PERF-013 Lever 2: true while Phase 1C runs"). Inside `preGenerateSpawnChunks` it is assigned `false` at exactly TWO sites. The implementer must KEEP the first and DELETE the second.

KEEP — first site, top of Phase 1C (~27662); the build-.23 regression note makes it the live, intentional reset:
```js
                /* === PHASE 1C: Generate missing chunks (slow path) === */
                // Batch size for parallel generation - allows multiple workers to be utilized
                const GEN_BATCH_SIZE = 18;
                let generatedCount = 0;
                _pregenActive = false; // Lever 2 deferral DISABLED (build .23 regression: synchronous batch compress froze main thread at world-entry — ESC stalled, chunks did not render); reverts to per-chunk saves during pregen
                if (chunksNeedingGeneration.length > 0) {
```
DELETE — second site, before the deferred-save block (~27695–27700); the flag is already `false` from ~27662 and nothing between sets it `true`, so this is a dead no-op:
```js
                    logDebug(`[PreGen] New chunks generated in ${genTime.toFixed(2)}ms`);
                }
                /* VOXEX-CCR-PERF-013 Lever 2: clear flag, then fire deferred batch save. */
                // Does not block Phase 2 rendering — runs concurrently as a fire-and-forget promise.
                _pregenActive = false;
                if (_pregenPendingSaves.size > 0) {
```
(Note: in the live source the `/* ... */` comment fences shown above render as `\` artifacts in some greps — they are ordinary block comments; match on the `_pregenActive = false;` line and its neighbors.)

**Before:**
```js
                // VOXEX-CCR-PERF-013 Lever 2: clear flag, then fire deferred batch save.
                // Does not block Phase 2 rendering — runs concurrently as a fire-and-forget promise.
                _pregenActive = false;
                if (_pregenPendingSaves.size > 0) {
```
**After:**
```js
                // VOXEX-CCR-PERF-013 Lever 2: fire deferred batch save.
                // Does not block Phase 2 rendering — runs concurrently as a fire-and-forget promise.
                // #550: redundant `_pregenActive = false;` removed here — already cleared at Phase-1C start (~27662); nothing re-sets it true.
                if (_pregenPendingSaves.size > 0) {
```
**Verify:** Grep `_pregenActive = false` inside `preGenerateSpawnChunks` — exactly ONE assignment remains (the one with the build-.23 note). Enter a fresh world; chunks generate, render, and cache (deferred flush) exactly as before.

---

## Safety Checks
- [ ] Progress % is monotonic and reaches 100 for both cached and uncached spawns (no overshoot/clamp-flat).
- [ ] Exactly one `_pregenActive = false` remains in `preGenerateSpawnChunks` (the build-.23 note one at ~27662).
- [ ] Both changes are no-op for chunk generation/render counts — only the displayed % (#554) and a dead assignment (#550) change.
- [ ] No new identifiers; no shadowing of `processedCached`/`generatedCount`/`chunksToProcess`.
- [ ] `tools/voxex-tests.html` (~204 tests) green.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

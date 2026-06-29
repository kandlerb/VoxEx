# CCR — Dead-Code & Redundant-Code Cleanup Sweep

**ID:** VOXEX-CCR-CLEANUP-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #578, #571, #523, #515, #494, #553, #552, #576
**Scope:** Pure deletions of unreachable/no-op/unread code plus routing hot-path `console.*` through `logDebug`. Every item is **behavior-neutral** — nothing here changes gameplay output.

> Line numbers are as of build `2026-06-25.34` and **WILL drift** — grep the quoted identifier before editing. Leave a one-line tombstone comment at each removal site per repo convention.

---

## Summary

| # | Site (grep target) | What | Action |
|---|--------------------|------|--------|
| #578 | `anyPostEffectsActive` (~44707), `useComposer` (~44719) | both vars (plus their helpers `volumetricActive`/`underwaterActive`) are computed but never read | delete the unread vars only; FLAG the skip-composer behavior change separately |
| #571 | `updateStars` (~15749) | `if (false && …)` debug block can never execute | delete the dead block |
| #523 | `#torch-overlay` (CSS ~329 + `@keyframes torchFlicker` ~355 + HTML div ~2186) | overlay unused — torch is a Three.js viewmodel | remove the CSS rules, the keyframe, and the HTML element |
| #515 | `writeFaceUVs` (~40057) | padding `const p = 0` has no effect | remove the no-op variable and its uses |
| #494 | `updateUIFromSettings` (~29214) | ~97-line fallback body after an always-true `return` is unreachable | delete the dead branch |
| #553 | `AudioManager` (~8846) | unused `settingsManager` ctor param + `this.settings` field | drop the unused param/field; fix JSDoc |
| #552 | `onTouchRegionPointerDown` (~45989) | redundant second `touchModeActive` guard | remove the duplicate guard line |
| #576 | hot-path `console.error`/`console.warn` (63 total; target the 9 in render/meshing/lighting ticks) | violates `logDebug` convention | route through `logDebug('[Tag] …')`; leave boundary errors as-is |

### Impact

- Smaller, clearer file; removes confusing dead branches (notably the ~97-line `updateUIFromSettings` fallback).
- #576 routes per-frame diagnostics through the sanctioned debug-gated channel without changing gameplay.

---

### #578 — Delete unread post-effect gating vars
**Location:** `anyPostEffectsActive` / `useComposer` — lines ~44705-44719 (grep: `anyPostEffectsActive`)
**Why:** `anyPostEffectsActive` (44707) has **zero readers**; `volumetricActive` (44705) and `underwaterActive` (44706) exist ONLY to compute it; `useComposer` (44719) is declared but never read — the render path calls `renderComposited()` unconditionally. All four are dead. `perfMetrics.composerUsed = true` (44716) IS read by the debug overlay (~11815) — keep it.
**Change:** Delete the four unread `const`s. Do NOT change behavior. `renderComposited()` already makes its own per-effect decisions internally from `SETTINGS.volumetricLightingEnabled`/`isUnderwater`.
**Context:** Block lives in `function renderFrame()` (`renderFrame` declared ~44554), inside the `perfMonitor.start("rendering")`/`.end("rendering")` span. The four `const`s sit at lines 44705-44719 (verbatim shown in **Before**); `perfMetrics.composerUsed = true` at 44716 is between them — KEEP it. Zero-readers proof:
- `grep anyPostEffectsActive` → 1 hit (the decl at 44707) = no readers.
- `grep useComposer` → 1 hit (the decl at 44719) = no readers.
- `volumetricActive`/`underwaterActive` (44705/44706) appear ONLY in the `anyPostEffectsActive` RHS, which is itself dead → both die with it.
- `renderComposited()` is called UNCONDITIONALLY in BOTH render branches: `function renderComposited()` (~44494) is invoked at ~44759 (torch/arms two-pass branch) and ~44778 (single-pass else branch) — neither call is gated on `useComposer`/`anyPostEffectsActive`. So deleting all four changes nothing.
- `perfMetrics.composerUsed` is read by the debug overlay (~11815) — retained. `zombieEffectsEnabled`, `isUnderwater`, `SETTINGS.bloomEnabled`, `SETTINGS.volumetricLightingEnabled` are all read elsewhere — do NOT touch them.
**Before:**
```js
                // OPTIMIZATION: Check if any post-processing effects are active
                // If not, bypass EffectComposer entirely and render directly (composer adds overhead)
                // Use settings/state directly rather than pass.enabled which may be out of sync
                const volumetricActive = SETTINGS.volumetricLightingEnabled;
                const underwaterActive = isUnderwater; // Global state set by updateUnderwaterState
                const anyPostEffectsActive = volumetricActive || underwaterActive || zombieEffectsEnabled || SETTINGS.bloomEnabled;

                // NOTE: Keep ALL passes enabled when using the composer to maintain
                // the render target chain. Disabling passes mid-chain breaks the flow.
                // Shaders short-circuit via uniforms when their effects are disabled.
                // ALWAYS use composer for consistent color output - direct renderer.render()
                // produces different color encoding than composer.render().

                // INSTRUMENTATION: Track composer usage (always true now)
                perfMetrics.composerUsed = true;

                // Always use composer - bypassing causes color/lighting changes
                const useComposer = true;
```
**After:**
```js
                // [CCR-CLEANUP-001 #578] Removed dead post-effect gating vars
                // (anyPostEffectsActive/volumetricActive/underwaterActive/useComposer):
                // all unread — renderComposited() decides per-effect internally.
                // NOTE: Keep ALL passes enabled when using the composer to maintain
                // the render target chain. Shaders short-circuit via uniforms.
                // ALWAYS use the composer for consistent color output.
                // INSTRUMENTATION: Track composer usage (always true now)
                perfMetrics.composerUsed = true;
```
**Verify:** grep confirms zero readers of `anyPostEffectsActive`, `volumetricActive`, `underwaterActive`, `useComposer` after deletion. `zombieEffectsEnabled` and `isUnderwater` are read elsewhere — do NOT remove them.

> **AUDIT FLAG (behavioral, OUT OF SCOPE):** The original comment intent ("bypass EffectComposer when no effects active") is a real performance idea but a **behavioral change** (the codebase notes the composer changes color encoding). Do NOT wire `useComposer` to `anyPostEffectsActive` in this CCR. If desired, open a separate CCR.

---

### #571 — Delete dead `if (false …)` block in `updateStars`
**Location:** `updateStars` — line ~15749 (grep: `if (false && cameraPosition`)
**Why:** Guarded by `if (false && …)` — provably unreachable debug log.
**Change:** Delete the comment + block (lines ~15748-15751).
**Context:** Block is inside `updateStars` (the per-frame star follow update). The `if (false && …)` head is at line 15749 (verbatim); the guard is literally `if (false && …)` so the body (a `console.log('[Stars] …')`) is provably unreachable — JS never evaluates the RHS of `false &&`. Zero-readers proof: `grep "if (false && cameraPosition"` → exactly 1 hit (this site); nothing else references the block. After deletion `updateStars` continues at the next statement (the `starLayers.forEach`/material-uniform update that follows).
**Before:**
```js
                // Debug: Log star position updates (set to true to re-enable)
                if (false && cameraPosition && starLayers.length > 0 && Math.random() < 0.005) {
                    console.log(`[Stars] Following camera at (${cameraPosition.x.toFixed(1)}, ${cameraPosition.y.toFixed(1)}, ${cameraPosition.z.toFixed(1)}), layers: ${starLayers.length}`);
                }
```
**After:**
```js
                // [CCR-CLEANUP-001 #571] Removed dead `if (false …)` star-position debug log.
```
**Verify:** grep confirms the block is gone; `updateStars` still closes correctly.

---

### #523 — Remove unused `#torch-overlay` CSS + HTML
**Location:** `#torch-overlay` — CSS lines ~329-364, HTML div line ~2186 (grep: `torch-overlay`)
**Why:** Zero JS references (grep `torch-overlay` → only the CSS rule + the HTML div). Torch is rendered as a Three.js viewmodel, not this CSS overlay. `@keyframes torchFlicker` (355-364) is used ONLY by `#torch-overlay::after`, so it dies with the overlay.
**Change:** Remove the CSS block (rule + `::before` + `::after` + `@keyframes torchFlicker`) and the HTML div.
**Context:** Zero-JS-reader proof — `grep "torch-overlay|torchFlicker"` returns exactly 6 hits, ALL in CSS/HTML, NONE in JS:
- `#torch-overlay {` (329), `#torch-overlay::before {` (332), `#torch-overlay::after {` (343) — the 3 CSS rules.
- `animation: torchFlicker …` (353) — the only `torchFlicker` consumer, inside `::after`.
- `@keyframes torchFlicker {` (355) — the keyframe (dies with `::after`).
- `<div id="torch-overlay"></div>` (2186) — the HTML element.
No `document.getElementById('torch-overlay')`, no `classList`, no `style.` reference anywhere. Torch is the Three.js viewmodel (`window.torchModel`, rendered Layer 1) — this CSS overlay is fully orphaned. Delete all 6 sites.
**Before (CSS, lines ~329-364):**
```css
            #torch-overlay {
                display: none;
            }
            #torch-overlay::before {
                content: "";
                position: absolute;
                bottom: 0;
                left: 50%;
                transform: translateX(-50%) rotate(-12deg);
                width: 10px;
                height: 75px;
                background: linear-gradient(to bottom, #654321, #3a2415);
                border-radius: 3px;
            }
            #torch-overlay::after {
                content: "";
                position: absolute;
                top: 18px;
                left: 50%;
                transform: translateX(-50%);
                width: 18px;
                height: 26px;
                background: radial-gradient(ellipse at 50% 70%, #ffff99 0%, #ffaa00 45%, #ff6600 100%);
                border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
                animation: torchFlicker 0.3s infinite alternate;
            }
            @keyframes torchFlicker {
                0% {
                    transform: translateX(-50%) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translateX(-50%) scale(1.08, 0.96);
                    opacity: 0.92;
                }
            }
```
**Before (HTML, line ~2186):**
```html
        <div id="torch-overlay"></div>
```
**After (CSS):**
```css
            /* [CCR-CLEANUP-001 #523] Removed unused #torch-overlay CSS + @keyframes torchFlicker — torch is a Three.js viewmodel, not a CSS overlay. */
```
**After (HTML):**
```html
        <!-- [CCR-CLEANUP-001 #523] Removed unused #torch-overlay div. -->
```
**Verify:** grep `torch-overlay` confirms zero references remain; grep `torchFlicker` confirms zero references remain.

---

### #515 — Remove no-op padding in `writeFaceUVs`
**Location:** `writeFaceUVs` — line ~40058 (grep: `function writeFaceUVs`)
**Why:** `const p = 0` adds/subtracts 0 in every UV expression — no effect. Sibling `writeFaceUVsIndexed` (~40133) already uses the clean form (`u0 = uv[0]`, `u1 = uv[0] + tileW`, etc.).
**Change:** Delete `const p = 0` and inline the padding-free expressions.
**Context:** `function writeFaceUVs(uvs, uvIdx, uv)` is at line 40057 (helper that writes 4 UV pairs for a non-indexed face). `const p = 0` is a no-op: every `+ p`/`- p` adds/subtracts zero. The sibling `writeFaceUVsIndexed` (~40133) already uses the clean padding-free form, so this just brings parity. Only the 4 expression lines (`u0`/`u1`/`v0`/`v1c`) change — the 12 `uvs[uvIdx + N] = …` writes below are unchanged. No external reader depends on `p`.
**Before:**
```js
            function writeFaceUVs(uvs, uvIdx, uv) {
                const p = 0;
                const tileW = 1 / NUM_TILES;
                const u0 = uv[0] + p;
                const u1 = uv[0] + tileW - p;
                const v0 = uv[1] + p;
                const v1c = uv[1] + 1.0 - p;
```
**After:**
```js
            function writeFaceUVs(uvs, uvIdx, uv) {
                // [CCR-CLEANUP-001 #515] Removed no-op `const p = 0` padding.
                const tileW = 1 / NUM_TILES;
                const u0 = uv[0];
                const u1 = uv[0] + tileW;
                const v0 = uv[1];
                const v1c = uv[1] + 1.0;
```
**Verify:** `tools/voxex-tests.html` meshing/UV tests green; the 12 `uvs[uvIdx + N]` writes below are unchanged.

---

### #494 — Delete unreachable fallback in `updateUIFromSettings`
**Location:** `updateUIFromSettings` — lines ~29214-29316 (grep: `function updateUIFromSettings`)
**Why:** Line ~29218 is `if (typeof syncSettingsToUI === "function") { syncSettingsToUI(); return; }`. `syncSettingsToUI` is a module-scoped function declaration (~22883, also exposed on `window` ~23342) — it ALWAYS exists, so the guard is always true and everything after the `return` (lines ~29219-29315, ~97 lines) is unreachable.
**Change:** Delete the unreachable body. Keep the signature, comment, and the delegating guard; close the function.
**Context:** `function updateUIFromSettings()` is at line 29214. The always-true guard that makes the body dead is line 29218 — verbatim:
```js
                    if (typeof syncSettingsToUI === "function") { syncSettingsToUI(); return; }
```
`syncSettingsToUI` is a module-scoped function declaration at line 22883 (`function syncSettingsToUI() {`) — a hoisted declaration in the same scope, so `typeof syncSettingsToUI === "function"` is ALWAYS true and the `return` always fires. Therefore lines 29219-29315 (the per-control fallback sync, starting `// Touch Controls (Phase 7)` at 29219 and ending with the `camera.updateProjectionMatrix();` + closing `}`) are unreachable. **Delete lines 29219 through the line before the function's closing brace** (~29315), keeping the signature, the 3-line comment (29215-29217), and the guard (29218). The first dead line to delete is exactly:
```js
                    // Touch Controls (Phase 7)
                    { const el = document.getElementById("touch-controls-select"); if (el) el.value = SETTINGS.touchControls; }
```
**Before (head + tail; delete lines ~29219-29315):**
```js
                function updateUIFromSettings() {
                    // CCR R2: delegate to the comprehensive single-source sync so resets refresh
                    // every control (incl. detail inputs the old body skipped). Old body kept below
                    // as a dead fallback.
                    if (typeof syncSettingsToUI === "function") { syncSettingsToUI(); return; }
                    // Touch Controls (Phase 7)
                    { const el = document.getElementById("touch-controls-select"); if (el) el.value = SETTINGS.touchControls; }
                    /* … ~95 more lines of unreachable per-control sync … */
                    camera.fov = isSprinting ? SETTINGS.sprintFOV : SETTINGS.normalFOV;
                    camera.updateProjectionMatrix();
                }
```
**After:**
```js
                function updateUIFromSettings() {
                    // [CCR-CLEANUP-001 #494] syncSettingsToUI is always defined (module-scoped),
                    // so the ~97-line fallback body below was unreachable — removed.
                    if (typeof syncSettingsToUI === "function") { syncSettingsToUI(); return; }
                }
```
**Verify:** Settings resets still refresh all controls (handled by `syncSettingsToUI`); `tools/voxex-tests.html` green. grep confirms no other caller relies on the removed body.

---

### #553 — Drop unused `settingsManager` param/field in `AudioManager`
**Location:** `AudioManager` constructor — lines ~8843-8847 (grep: `class AudioManager`)
**Why:** `this.settings = settingsManager` (8847) is never read in any `AudioManager` method (grep `this.settings` hits belong to VoxelWorld/ChunkDataPool and UIManager, not this class). The only instantiation is `new AudioManager(null)` (~18280). The param is dead weight.
**Change:** Remove the param and the field; update the JSDoc.
> **AUDIT FLAG (draft claim corrected):** The CCR draft said "a comment about UIManager is wrong." There is **no** UIManager comment inside `AudioManager` — the existing JSDoc at ~8844 already reads "(legacy param, unused)" and is accurate. The draft confused this with the separate `UIManager` constructor (~9205). The only real fix here is dropping the param/field; no UIManager comment to correct.
**Context:** `class AudioManager {` at line 8841; constructor at 8846 (`constructor(settingsManager) {`), field at 8847 (`this.settings = settingsManager;`). Zero-reader proof: `grep "this.settings"` hits belong to OTHER classes (VoxelWorld/ChunkDataPool/UIManager) — none inside `AudioManager` methods read `this.settings`. The sole instantiation is `new AudioManager(null)` (~18280); dropping the param leaves it valid (extra arg is harmless) — optionally tidy it to `new AudioManager()`. Verbatim current head shown in **Before**.
**Before:**
```js
                /**
                 * Create a new AudioManager.
                 * @param {Object|null} settingsManager - Settings manager for audio preferences (legacy param, unused).
                 */
                constructor(settingsManager) {
                    this.settings = settingsManager;
                    this.ctx = null;
```
**After:**
```js
                /**
                 * Create a new AudioManager.
                 * [CCR-CLEANUP-001 #553] Dropped unused legacy `settingsManager` param/field.
                 */
                constructor() {
                    this.ctx = null;
```
**Verify:** grep confirms `this.settings` no longer appears in `AudioManager`; `new AudioManager(null)` (~18280) still works (extra arg is harmless, or update it to `new AudioManager()`).

---

### #552 — Remove redundant touch guard in `onTouchRegionPointerDown`
**Location:** `onTouchRegionPointerDown` — lines ~45989-45990 (grep: `function onTouchRegionPointerDown`)
**Why:** Line 45989 `if (!touchModeActive || !isGameplayActive()) return;` already returns when `!touchModeActive`. Line 45990 `if (e.pointerType === 'mouse' && !touchModeActive) return;` can never be true once 45989 passes — `!touchModeActive` is already false there.
**Change:** Delete the redundant second guard. Keep the first (combined) guard.
**Context:** `function onTouchRegionPointerDown(e)` at line 45988. The two guards are 45989 (`if (!touchModeActive || !isGameplayActive()) return;`) and 45990 (`if (e.pointerType === 'mouse' && !touchModeActive) return;`). Once 45989 passes, `touchModeActive` is necessarily truthy, so `!touchModeActive` in 45990 is always false → the second `&&` clause can never be true → guard is dead. Delete ONLY line 45990. The handler must still open with exactly one `if (!touchModeActive …) return;` (per the repo's touch-listener convention), then proceed to `ensureTouchAudio()` (45991). Verbatim shown in **Before**.
**Before:**
```js
            function onTouchRegionPointerDown(e) {
                if (!touchModeActive || !isGameplayActive()) return;
                if (e.pointerType === 'mouse' && !touchModeActive) return;
                ensureTouchAudio();
```
**After:**
```js
            function onTouchRegionPointerDown(e) {
                if (!touchModeActive || !isGameplayActive()) return;
                // [CCR-CLEANUP-001 #552] Removed redundant `pointerType==='mouse' && !touchModeActive`
                // guard — unreachable after the line above already returns on !touchModeActive.
                ensureTouchAudio();
```
**Verify:** The handler still starts with exactly one `if (!touchModeActive …) return;`. Touch input behavior unchanged.

---

### #576 — Route hot-path `console.error`/`console.warn` through `logDebug`
**Location:** render/meshing/lighting tick sites (grep: `console.error`, `console.warn`)
**Why:** `console.*` in per-frame/meshing/lighting paths violates the `logDebug` convention and can stall the main thread. `logDebug(message, ...args)` (~12108) is module-scoped and debug-gated (`isDebug`). Convert ONLY the 9 hot-path sites below. **Leave the other ~54 as-is** — they are init-time validation (BlockConfig ~4603-4622, texture checks ~30359-31187), boundary errors (AudioManager load ~8944, save/load ~22080/22522/22766/22821, OPFS ~26426/26943+, worker init/markers ~19410-19583, worker error ~19688, WebGL context ~28097), or debug-command output (~12860-13524).

**Context (signature + tag convention):** `logDebug` is defined verbatim at line 12108 as:
```js
            function logDebug(message, ...args) { if (isDebug) { console.log(`[VoxEx Debug]:`, message, ...args); }}
```
So the call form is `logDebug(\`[Tag] message\`, optionalArgs)` — first arg is the tagged template string, extra args spread after (matches `console.log`'s rest-args). Existing in-repo examples to match the `[Tag]` convention (note: tag is the bracketed prefix INSIDE the message string, NOT a separate arg):
```js
            logDebug(`[OPFS] ChunkDataPool init failed: ${e.message}`);
            logDebug(`[OPFS] Seed changed: ${this.currentSeed} -> ${seedStr}`);
```
Per-site containing function/loop (all verified):
- Site 1 (`[Mesh] COMPRESSION BYPASS`, ~41868) → in `function renderChunk(cx, cz, distSq = 0)` (decl ~41718).
- Sites 2-4 (`[renderChunk] … faces exceeds max` ~42261; `… drawRange mismatch` ~42316; `…_WATER: drawRange mismatch` ~42410) → all in `renderChunk`.
- Sites 5-6 (`[ChunkQueue] processChunkQueue error` ~43603; `[ChunkQueue] Stalled` ~43611) → in the per-frame chunk-streaming/update path driven by the `animate()` loop (`animate` ~44938); both run every frame. Site 5 is REDUNDANT — line 43602 already `logDebug`s the same error — so DELETE the `console.error` line (don't convert), folding `e` into the existing logDebug call as the rest-arg.
- Site 7 (`[RenderDiag] Scene meshes`, ~44748) → in `function renderFrame()` (decl ~44554), inside the 5-second-throttled diagnostic block.
- Sites 8-9 (`[Lighting] Soft cap reached` ~25388; `[Lighting] Sunlight fallback triggered` ~25404) → in `class SunlightTask` (decl ~25248): site 8 in the propagation tick (near the `bailoutToFullRecalc("soft cap")` call ~25391), site 9 in `bailoutToFullRecalc(reason)` (~25396). All three preserve their existing `[Tag]` prefix.

Convert each:

1. **~41868** `[Mesh] COMPRESSION BYPASS` (in `renderChunk`):
```js
// BEFORE
                        console.error(`[Mesh] COMPRESSION BYPASS: Chunk ${cKey}`, {
// AFTER
                        logDebug(`[Mesh] COMPRESSION BYPASS: Chunk ${cKey}`, {
```
2. **~42261** `[renderChunk] … faces exceeds max` (in `renderChunk`):
```js
// BEFORE
                            console.warn(`[renderChunk] ${cKey}: ${tFaceCount} faces exceeds max ${MAX_FACES_PER_CHUNK}, skipping (total skipped: ${chunksSkippedDueToFaceLimit})`);
// AFTER
                            logDebug(`[renderChunk] ${cKey}: ${tFaceCount} faces exceeds max ${MAX_FACES_PER_CHUNK}, skipping (total skipped: ${chunksSkippedDueToFaceLimit})`);
```
3. **~42316** `[renderChunk] … drawRange mismatch` (terrain, in `renderChunk`):
```js
// BEFORE
                            console.error(`[renderChunk] ${cKey}: drawRange mismatch! Expected ${tIIdx}, got ${terrainGeo.drawRange.count}`);
// AFTER
                            logDebug(`[renderChunk] ${cKey}: drawRange mismatch! Expected ${tIIdx}, got ${terrainGeo.drawRange.count}`);
```
4. **~42410** `[renderChunk] …_WATER drawRange mismatch` (in `renderChunk`):
```js
// BEFORE
                            console.error(`[renderChunk] ${cKey}_WATER: drawRange mismatch! Expected ${wIIdx}, got ${waterGeo.drawRange.count}`);
// AFTER
                            logDebug(`[renderChunk] ${cKey}_WATER: drawRange mismatch! Expected ${wIIdx}, got ${waterGeo.drawRange.count}`);
```
5. **~43603** `[ChunkQueue] processChunkQueue error` (per-frame `animate`) — REDUNDANT: line ~43602 already `logDebug`s this exact error. Delete the `console.error` line entirely:
```js
// BEFORE
                        processChunkQueue().catch(e => {
                            logDebug(`[ChunkQueue] Error in processChunkQueue: ${e.message}`);
                            console.error('[ChunkQueue] processChunkQueue error:', e);
                        });
// AFTER
                        processChunkQueue().catch(e => {
                            logDebug(`[ChunkQueue] Error in processChunkQueue: ${e.message}`, e);
                        });
```
6. **~43611** `[ChunkQueue] Stalled` (per-frame `animate`, throttled 10s):
```js
// BEFORE
                        console.warn(`[ChunkQueue] Stalled: ${chunkBuildQueue.length} queued, ${pendingChunkUpdates.size} pending, ${deferredChunkUpdates.size} deferred, ${pendingLightChunks.size} light-pending, frameDelta=${(time - prevTime).toFixed(1)}ms`);
// AFTER
                        logDebug(`[ChunkQueue] Stalled: ${chunkBuildQueue.length} queued, ${pendingChunkUpdates.size} pending, ${deferredChunkUpdates.size} deferred, ${pendingLightChunks.size} light-pending, frameDelta=${(time - prevTime).toFixed(1)}ms`);
```
7. **~44748** `[RenderDiag]` (in `renderFrame`, throttled 5s):
```js
// BEFORE
                        console.warn(`[RenderDiag] Scene meshes: ${meshesWithGeometry} with geo, ${meshesWithDrawRange} with drawRange>0, ${meshesWithZeroDrawRange} with drawRange=0, total indices: ${totalDrawCount}`);
// AFTER
                        logDebug(`[RenderDiag] Scene meshes: ${meshesWithGeometry} with geo, ${meshesWithDrawRange} with drawRange>0, ${meshesWithZeroDrawRange} with drawRange=0, total indices: ${totalDrawCount}`);
```
8. **~25387** `[Lighting] Soft cap reached` (in `SunlightTask`, lighting tick):
```js
// BEFORE
                            console.warn(
                                `[Lighting] Soft cap reached (${maxEntries} entries across ${this.touchedChunks.size} chunks, cap ${Math.floor(dynamicSoftCap)}); falling back.`
                            );
// AFTER
                            logDebug(
                                `[Lighting] Soft cap reached (${maxEntries} entries across ${this.touchedChunks.size} chunks, cap ${Math.floor(dynamicSoftCap)}); falling back.`
                            );
```
9. **~25404** `[Lighting] Sunlight fallback triggered` (in `SunlightTask.bailoutToFullRecalc`):
```js
// BEFORE
                    console.warn(`[Lighting] Sunlight fallback triggered (${reason}); scheduling chunk-level recalcs.`);
// AFTER
                    logDebug(`[Lighting] Sunlight fallback triggered (${reason}); scheduling chunk-level recalcs.`);
```
**Verify:** grep `console.error\|console.warn` in `renderChunk`/`animate`/`renderFrame`/`SunlightTask` returns zero hits after conversion; the ~54 boundary/init/debug-command sites are untouched.

---

## Safety Checks

- [ ] **#578 deletion-only:** removed only the four unread `const`s (`anyPostEffectsActive`, `volumetricActive`, `underwaterActive`, `useComposer`); `perfMetrics.composerUsed`, `zombieEffectsEnabled`, `isUnderwater` all retained; no skip-composer behavior introduced (deferred to a separate CCR).
- [ ] Each deletion (#571, #515, #494, #523, #553, #552) confirmed to have **zero readers** via grep before removal.
- [ ] **#523:** grep `torch-overlay` AND `torchFlicker` both return zero references; no DOM ID removed that JS reads.
- [ ] **#494:** `syncSettingsToUI` confirmed always-defined; only the post-`return` body removed; function still closes.
- [ ] **#553:** AUDIT FLAG honored — only the unused param/field dropped; no false "UIManager comment" edit; `new AudioManager(null)` still works.
- [ ] **#552:** touch handler still starts with exactly one `if (!touchModeActive …) return;`.
- [ ] **#576:** only the 9 hot-path sites converted to `logDebug`; boundary errors (save/load, IndexedDB/OPFS, worker init + worker error, AudioManager load, WebGL context) and init-time validation left as `console.*`.
- [ ] `tools/voxex-tests.html` (~204 tests) green.
- [ ] No duplicate/shadowed identifiers introduced; tombstone comments left at each removal site.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

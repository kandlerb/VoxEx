# CCR — Granular Loading-Screen Narration of `init()` Sub-Steps (VOXEX-CCR-LOADUX-001)

**File:** `voxEx.html` (single-file rule honored — all proposed changes stay in this file)
**Date:** 2026-06-23
**Status:** Proposal / report only — **NO code applied by this CCR.** (Builds .25/.26 already landed the prerequisites; see Background.)
**Scope:** Make the "Generating World" loading screen narrate the individual engine-init sub-steps (effects, textures, controls, blocks) that currently only appear in the browser console, so the user sees *what* is loading at each moment instead of one coarse "Building world & textures…" label.

This is a **design + placement spec with verbatim edits**, intended to be handed to an implementing model. It builds on the loading-screen work already shipped.

---

## Background (already shipped — do not redo)

- **Build .25** — fixed the ~10 s blank pre-bar gap: `initGameEngine` (line **24625**) now shows `#world-gen-progress` *before* the heavy `initDatabase` / `init()` / worker-pool setup, with a double-`requestAnimationFrame` paint-yield so the screen renders before the synchronous work blocks the thread.
- **Build .26** — added four coarse phase labels via a local helper `_setGenPhase(msg, pct)` (defined as a `const` inside `initGameEngine`, ~line **24635**): "Initializing engine…", "Preparing storage…" (before `initDatabase`), "Building world & textures…" (before `await init()`), "Starting workers…" (before the worker-pool block). `preGenerateSpawnChunks` then drives its own labels ("Loading cached chunks…", "Generating N new chunks…", "Rendering N chunks…").

**Gap this CCR closes:** the entire body of `init()` — particle/effects creation, the texture-atlas build (the single heaviest synchronous step), controls setup, and block-index/UV-cache build — is covered by the *one* label "Building world & textures…". Those sub-steps are exactly the console lines the user sees:

```
[Particles] ParticleSystem initialized, maxCount: 500
[Textures]  Building atlas: tiles=33 … dimensions=2112x64
[Textures]  Transparency validation passed …
[Textures]  Created per-texture roughness map: 2112x64
[Blocks]    20 blocks loaded from BLOCK_CONFIG
[Blocks]    UV cache built using 33 atlas tiles …
[Controls]  Detected modern PointerLockControls - creating camera rig
[WorkerPool] Initialized with 10 workers
```

The goal is to surface matching labels on the loading screen.

---

## Why this needs two structural changes (not just more label calls)

1. **`_setGenPhase` is currently scoped *inside* `initGameEngine`** (a `const` arrow at ~line **24635**), so `init()` — a separate function — cannot call it. It must be promoted to **module scope** so both `initGameEngine()` and `init()` can use it.
2. **A label only becomes visible if the browser gets to paint after it's set.** `init()` is largely synchronous, so simply setting `gen-progress-text` between steps would *not* repaint until the next yield — every intermediate label would be skipped. `_setGenPhase` already yields two animation frames, so each label must be set via `await _setGenPhase(...)` **at a statement boundary inside `init()`**, immediately before the sub-step it describes. `init()` is already `async` (line **27455**: `async function init()`), so inserting `await` between its top-level statements is legal.

**Safety of inserting yields into `init()`:** the per-frame `animate()` loop has **not** started yet during `init()` (it starts later, after the click-to-play), so yielding the event loop here runs no game logic — only a paint. The added cost is ~8 animation frames total (2 per label × 4 labels ≈ ~130 ms), negligible against the multi-second init.

---

## Verified call sites inside `init()` (current build, line numbers will drift — match on the quoted text)

| Console group | `init()` call site | Line | Label to show before it |
|---|---|---|---|
| `[Particles]` (+ stars/clouds) | `starField = createStarField(scene);` … `particleSystem = new ParticleSystem(scene);` | **27600–27604** | "Creating effects…" |
| `[Textures]` (atlas/validation/roughness — **heaviest step**) | `initTextures();` | **27715** | "Building textures…" |
| `[Blocks]` (load + UV cache) | `initDebugGrid();` — which internally calls `initBlockOptimization()` (where the `[Blocks]` logs come from) | **27718** | "Indexing blocks…" |
| `[Controls]` | `controls = new PointerLockControls(camera, document.body);` | **28421** | "Setting up controls…" |
| `[WorkerPool]` | (in `initGameEngine`, line 24656) | — | already "Starting workers…" |

> **Execution-order note (verified):** `init()` runs **Effects (27600) → Textures (27715) → Blocks (27718) → Controls (28421)**, which matches the user's console exactly (`[Blocks]` before `[Controls]` — the paste *was* chronological).
>
> **Critical placement detail:** the block-load/UV work lives in `initBlockOptimization()` (defined ~line **29566**), which `init()` does **not** call directly — it is called by **`initDebugGrid()`** at line **27718**. `initBlockOptimization();` itself appears at line **29717 inside the non-async `function initDebugGrid()`**, so an `await _setGenPhase(...)` placed there would be a **syntax error** (`await` in a non-async function) and would not execute in init order anyway. The "Indexing blocks…" label must therefore be placed before the **`initDebugGrid();` call** in `init()`'s async body (line 27718), not before `initBlockOptimization();`. The heavy renderer/post-processing setup that runs between the blocks step (27718) and the controls step (28421) is silent in the console too, so it sits under the lingering "Indexing blocks…" label — acceptable.

---

## Proposed changes (verbatim)

### Edit 1 — promote `_setGenPhase` to module scope

**Insert** this function declaration immediately **before** `async function initGameEngine(seedStr, loadedPlayerState) {` (line **24625**):

```js
            /**
             * Update the world-gen loading screen status line (and optional progress %), then yield
             * two animation frames so the browser PAINTS the update before the next synchronous step
             * blocks the main thread. Module-scoped so both initGameEngine() and init() can call it.
             * @param {string|null} msg - Status text, or null to leave the line unchanged.
             * @param {number|null} [pct] - Progress-bar width %, or null/omitted to leave it unchanged.
             * @returns {Promise<void>}
             */
            async function _setGenPhase(msg, pct) {
                const _t = document.getElementById("gen-progress-text");
                const _b = document.getElementById("gen-progress-bar");
                if (_t && msg != null) _t.textContent = msg;
                if (_b && pct != null) _b.style.width = pct + "%";
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            }
```

### Edit 2 — remove the now-duplicate local `_setGenPhase` in `initGameEngine`

The `.26` build defined `_setGenPhase` as a local `const` at the top of `initGameEngine`. With Edit 1 it's module-scoped, so **delete the local arrow definition** (keep the show-div block and the existing call). Replace:

```js
                // _setGenPhase updates the status line (and optional bar %), then yields two
                // frames so the browser PAINTS the update before the next synchronous step blocks
                // the main thread — otherwise every label would only appear after its step finished.
                const _setGenPhase = async (msg, pct) => {
                    const _t = document.getElementById("gen-progress-text");
                    const _b = document.getElementById("gen-progress-bar");
                    if (_t && msg != null) _t.textContent = msg;
                    if (_b && pct != null) _b.style.width = pct + "%";
                    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                };
                {
                    const _gpDiv = document.getElementById("world-gen-progress");
                    if (_gpDiv) _gpDiv.style.display = "block";
                }
                await _setGenPhase("Initializing engine...", 0);
```

with:

```js
                {
                    const _gpDiv = document.getElementById("world-gen-progress");
                    if (_gpDiv) _gpDiv.style.display = "block";
                }
                await _setGenPhase("Initializing engine...", 0);
```

> The four existing `await _setGenPhase(...)` calls elsewhere in `initGameEngine` ("Preparing storage…", etc.) now resolve to the module-scoped function — no change needed to them. (`async function` declarations are hoisted, so calls earlier in the file still bind.)

### Edit 3 — rename the pre-`init()` umbrella label (avoid duplicate wording)

`initGameEngine` sets "Building world & textures…" right before `await init()`. With the new inner "Building textures…" label that becomes redundant. Rename the outer one so it reads as the renderer/scene bring-up that precedes the inner steps. Change:

```js
                await _setGenPhase("Building world & textures...");
                await init(); // Initialize Three.js FIRST (creates scene, materials, controls)
```

to:

```js
                await _setGenPhase("Initializing renderer...");
                await init(); // Initialize Three.js FIRST (creates scene, materials, controls)
```

### Edit 4 — add the four sub-step labels inside `init()`

Each is a single `await _setGenPhase("…");` inserted **immediately before** the named call site. Text-only (no `pct` argument) so the progress bar stays at 0 % until `preGenerateSpawnChunks` drives it — avoids a backwards jump.

**4a — before effects (line 27599–27600):**
```js
                // 3.5. Atmospheric Effects - Stars and Clouds
                starField = createStarField(scene);
```
→
```js
                await _setGenPhase("Creating effects...");
                // 3.5. Atmospheric Effects - Stars and Clouds
                starField = createStarField(scene);
```

**4b — before textures (line 27715):**
```js
                // 5. Init Game Data
                initTextures();
```
→
```js
                // 5. Init Game Data
                await _setGenPhase("Building textures...");
                initTextures();
```

**4c — before controls (line 28421):**
```js
                controls = new PointerLockControls(camera, document.body);
```
→
```js
                await _setGenPhase("Setting up controls...");
                controls = new PointerLockControls(camera, document.body);
```

**4d — before block indexing (line 27718, inside `init()`):**

> ⚠️ Anchor on the **`initDebugGrid();` call in `init()`** (line 27718), NOT on `initBlockOptimization();` (line 29717) — the latter is inside the non-async `initDebugGrid()`, where `await` is illegal. `initDebugGrid()` runs `initBlockOptimization()` first (the `[Blocks]` work), so labeling before the call is correct and in the right order (Blocks before Controls).

```js
                initZombies();
                initDebugGrid();
```
→
```js
                initZombies();
                await _setGenPhase("Indexing blocks...");
                initDebugGrid();
```

### Edit 5 — bump the build banner

`VOXEX_BUILD` (line **3936**) → next number, and prepend a `VOXEX_RECENT_CHANGES` entry (line 3944).

---

## Resulting on-screen sequence

```
Initializing engine…        (initGameEngine, top)
Preparing storage…          (before initDatabase)
Initializing renderer…      (before init())
Creating effects…           (init: stars/clouds/particles)
Building textures…          (init: initTextures — the long one)
Indexing blocks…            (init: initDebugGrid → initBlockOptimization)
Setting up controls…        (init: PointerLockControls)
Starting workers…           (initGameEngine, after init)
Loading cached chunks…  →  Generating N new chunks…  →  Rendering N chunks…   (preGenerateSpawnChunks)
```

---

## Cross-system effects & risk summary

- **Two small structural edits + four one-line inserts + a rename + build bump.** No new DOM IDs (reuses `#world-gen-progress` / `#gen-progress-text` / `#gen-progress-bar`), no settings, no worker/cache changes, no per-frame work.
- **Identifier scope:** `_setGenPhase` moves from a function-local `const` to a module-scoped `async function`. Verify there is exactly one definition after the edit (delete the local one in Edit 2) — a leftover local `const _setGenPhase` would shadow the module function (still works, but is dead duplication) and a *duplicate declaration in the same scope* would be a parse error. There are no other `_setGenPhase` identifiers in the file today.
- **Yields inside `init()`** are safe because `animate()` has not started during init — see the safety note above. If `init()` is ever refactored to start the render loop earlier, re-verify.
- **`init()` called with the screen hidden:** `_setGenPhase` no-ops gracefully (updates a hidden element, still yields) — harmless.
- **No behavior change to generation, lighting, caching, or the worker pipeline** — this is purely loading-screen feedback.
- **Single-file rule honored.**

---

## Verification plan (when implementing)

1. Serve over localhost; **Create New World → Start Game** and watch the loading screen narrate the full sequence above, each label appearing *before* its step (not after). The "Building textures…" label should be visible for the longest stretch (it's the heaviest step).
2. Confirm the on-screen labels appear in execution order **Effects → Textures → Indexing blocks → Setting up controls** (matching the console). If the live order differs, reorder the inserts to match what actually runs.
3. Load an **existing** world (no pregen): confirm the early labels still show during `init()` and the screen is hidden afterward (the existing-world hide added in .25 at the `else` branch).
4. Confirm there is exactly one `_setGenPhase` definition (`grep`), and that the four `initGameEngine` calls + four `init()` calls all resolve (no ReferenceError in console).
5. Run `tools/voxex-tests.html` (285 tests) — all green (this change is UI-only, but confirm no parse/boot regression).
6. On apply: bump `VOXEX_BUILD` (line 3936) and prepend a `VOXEX_RECENT_CHANGES` entry.

---

## Recommendation

Apply Edits 1–5 together — they're interdependent (the inner `init()` labels require the module-scoped helper). It's a low-risk, UI-only change that turns the single "Building world & textures…" stretch into a play-by-play matching the console, so the longest part of the load finally tells the user what it's doing. All changes stay within `voxEx.html`.

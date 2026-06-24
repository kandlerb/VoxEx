# CCR — Init Dwell Fix + Remaining Loading-Screen Steps (VOXEX-CCR-LOADUX-002)

**File:** `voxEx.html` (single-file rule honored — all proposed changes stay in this file)
**Date:** 2026-06-23
**Status:** Proposal / report only — **NO code applied by this CCR.**
**Scope:** (1) Eliminate the real cause of the long "Initializing renderer…" dwell (an OPFS directory scan awaited on the load critical path purely to print a debug line). (2) Audit `init()` for every meaningful step and add labels for the two heavy ones that are currently unnarrated, plus rename the mislabeled "Initializing renderer…". Builds on **VOXEX-CCR-LOADUX-001** (already shipped in build **.27**).

This is a **design spec with verbatim edits** for a follow-up implementer.

---

## Summary

- **Root cause of the dwell (the important fix):** the "Initializing renderer…" label spans `init()`'s opening, whose slowest step is `chunkDataPool.initDiskStorage()` (line **27469**). Inside it, `initDiskStorage()` (line **7853**) does `await this.diskStorage.getStats()` (line **7867**) — an OPFS **directory scan that counts every cached chunk file** — and that scan is `await`ed on the load path **solely to print one `logDebug` line**. `diskStorageReady` is already set *before* the scan (line **7861**), so it blocks init for no functional reason, and it gets **slower the more you've played** (more files to scan). Making it fire-and-forget removes the scan from the load path.
- **Narration audit:** stepping through `init()`, only two heavy steps lack a label:
  1. **OPFS disk-cache init** (worker spawn + the scan above) — currently under "Initializing renderer…".
  2. **WebGL renderer + EffectComposer + 5 post-processing shader passes** (lines **27742–28386**) — currently under the lingering "Indexing blocks…" label. This is the biggest unnarrated block.
- Also **rename "Initializing renderer…"** (line 24665): the WebGL renderer is *not* created in that window (it's created at 27742), so the name is misleading — it actually covers DB/OPFS/scene/sky setup.
- Everything else in `init()` is fast enough to sit under an adjacent label (enumerated below).

---

## Background (shipped in .27 — LOADUX-001)

`_setGenPhase` is a module-scoped `async function` (line **24633**). Current label sequence:

```
Initializing engine… → Preparing storage… → Initializing renderer… →
   [init():] Creating effects… → Building textures… → Indexing blocks… → Setting up controls… →
Starting workers… → Loading/Generating/Rendering chunks…
```

---

## Part 1 — the dwell fix (highest value)

`initDiskStorage()` (ChunkDataPool method), current code at lines **7860–7869**:

```js
                        if (this.diskStorage && this.diskStorage.isReady()) {
                            this.diskStorageReady = true;

                            // Note: We don't pre-load diskCachedKeys here because:
                            // 1. Files may be from different seeds (we validate on load)
                            // 2. diskCachedKeys is populated as chunks are successfully loaded
                            // 3. This avoids false cache hits for wrong-seed chunks
                            const stats = await this.diskStorage.getStats();
                            logDebug(`[OPFS] ChunkDataPool initialized (${stats.count} files on disk, ${stats.totalMB}MB)`);
                            return true;
                        }
```

**Change** the last three lines (the `getStats` await + log + return). Replace:

```js
                            const stats = await this.diskStorage.getStats();
                            logDebug(`[OPFS] ChunkDataPool initialized (${stats.count} files on disk, ${stats.totalMB}MB)`);
                            return true;
```

with:

```js
                            // VOXEX-CCR-LOADUX-002: stats are only for the debug log — don't block
                            // init on the OPFS directory scan (its cost grows with the number of
                            // cached files). diskStorageReady is already set above; return now.
                            this.diskStorage.getStats().then(stats =>
                                logDebug(`[OPFS] ChunkDataPool initialized (${stats.count} files on disk, ${stats.totalMB}MB)`)
                            ).catch(() => {});
                            return true;
```

**Why it's safe:** `stats` is used nowhere else; `this.diskStorageReady = true` is already set (line 7861) before this point, so nothing downstream waits on the stats. The log still prints, just asynchronously. This is the change that actually shortens the dwell.

> Verification hint: clearing the OPFS cache once (DevTools → Application → Storage) should make the *current* dwell shrink even before this fix — that confirms the scan-grows-with-files diagnosis. After the fix, the dwell should be roughly flat regardless of how many cached files exist.

---

## Part 2 — `init()` step audit + the labels to add

Full `init()` sequence (current .27 lines), with the labeling decision for each:

| # | Step | Line | Cost | Label |
|---|---|---|---|---|
| 1 | `await initDatabase()` (redundant — already opened in `initGameEngine`) | ~27463 | low | covered by "Preparing engine…" |
| 2 | **`initDiskStorage()` (OPFS worker spawn + dir scan)** | **27469** | **high** (pre-fix) | **ADD "Opening disk cache…"** |
| 3 | `initBlockLookupTables`, `generateSpiralOffsets(32)` | 27476–27477 | low | "Preparing engine…" |
| 4 | scene + sky shader + sun/moon sprites (canvas textures) | 27507–27605 | low–med | "Preparing engine…" (optional "Building sky…") |
| 5 | `createStarField` / `createCloudPlane` / `ParticleSystem` | ~27607 | med | "Creating effects…" *(exists)* |
| 6 | camera + sun/moon lights + torch viewmodel | 27608–27721 | med | under "Creating effects…" |
| 7 | **`initTextures()` (atlas build — heaviest single step)** | 27724 | **high** | "Building textures…" *(exists)* |
| 8 | `initZombies()` | 27726 | med | under "Building textures…" |
| 9 | `initDebugGrid()` → `initBlockOptimization()` (blocks + UV) | 27728 | med | "Indexing blocks…" *(exists)* |
| 10 | `initPlayerBody()`, selection mesh | 27729–27739 | low | under "Indexing blocks…" |
| 11 | **`renderer = new THREE.WebGLRenderer` + `EffectComposer` + 5 ShaderPasses** | **27742–28386** | **high** | **ADD "Setting up rendering…"** |
| 12 | `controls = new PointerLockControls` | 28431 | low | "Setting up controls…" *(exists)* |
| 13 | input/event listeners (`keydown`, `resize`, …) | ~29460 | low | under "Setting up controls…" (optional "Finishing up…") |

**Two heavy steps are unnarrated: #2 (OPFS) and #11 (renderer/post-processing).** Everything else is fast enough to ride an adjacent label. The optional "Building sky…" (#4) and "Finishing up…" (#13) are listed for completeness but are not worth their own labels — both are sub-frame.

### Edit 2a — rename the misleading "Initializing renderer…" label

The WebGL renderer is created at line 27742, not here. Rename so this label honestly describes the DB/OPFS/scene bring-up it covers. Line **24665**:

```js
                await _setGenPhase("Initializing renderer...");
```
→
```js
                await _setGenPhase("Preparing engine...");
```

### Edit 2b — add "Opening disk cache…" before the OPFS init

Lines **27467–27469**:

```js
                if (SETTINGS.useOPFSCache && supportsOPFS()) {
                    try {
                        await chunkDataPool.initDiskStorage();
```
→
```js
                if (SETTINGS.useOPFSCache && supportsOPFS()) {
                    try {
                        await _setGenPhase("Opening disk cache...");
                        await chunkDataPool.initDiskStorage();
```

(Label sits inside the `if`, so it only shows when OPFS init actually runs.)

### Edit 2c — add "Setting up rendering…" before the renderer/composer block

Lines **27740–27742**:

```js
                // 8. Renderer
                // Note: logarithmicDepthBuffer removed - causes particle rendering issues with custom shaders
                renderer = new THREE.WebGLRenderer({
```
→
```js
                // 8. Renderer
                await _setGenPhase("Setting up rendering...");
                // Note: logarithmicDepthBuffer removed - causes particle rendering issues with custom shaders
                renderer = new THREE.WebGLRenderer({
```

> Note: three.js compiles the post-processing shaders **lazily on first render**, not at pass construction, so most of the *compile* cost actually lands on the first frame at world-entry (the ~135 ms / ~72 ms `requestAnimationFrame` violations seen in the console). The "Setting up rendering…" label still correctly covers the WebGL-context creation + render-target allocation + pass wiring done here, which is the discrete step that was previously hidden under "Indexing blocks…".

### Edit 2d — bump build banner

`VOXEX_BUILD` (line **3936**) → next number; prepend a `VOXEX_RECENT_CHANGES` entry.

---

## Resulting sequence

```
Initializing engine…
Preparing storage…
Preparing engine…          (renamed; DB / block tables / sky / sprites)
Opening disk cache…        (NEW — OPFS init; dwell cut by Part 1)
Creating effects…
Building textures…
Indexing blocks…
Setting up rendering…      (NEW — WebGLRenderer + EffectComposer + post-processing passes)
Setting up controls…
Starting workers…
Loading cached chunks… → Generating N new chunks… → Rendering N chunks…
```

---

## Cross-system effects & risk summary

- **Part 1** is a behavior-preserving micro-optimization: the only change is *when* the stats log prints (now async). No new state, no DOM, no settings. `diskStorageReady` semantics unchanged. This is the change that matters for the dwell.
- **Part 2** is four UI-only inserts (a rename + two `await _setGenPhase` calls + build bump). All three label sites are direct statements in `init()`'s async body (verify 16-space indent), so the `await`s are legal. No per-frame work, no new DOM IDs (reuses `#gen-progress-text`).
- **Anchor uniqueness to verify before applying:** `const stats = await this.diskStorage.getStats();` (Part 1), `await _setGenPhase("Initializing renderer...");` (2a), `// 8. Renderer` (2c) should each be unique; the OPFS `if (SETTINGS.useOPFSCache && supportsOPFS())` block (2b) appears once in `init()`. Confirm with a grep.
- **Single-file rule honored.**

---

## Verification plan

1. **Dwell (Part 1):** with a populated OPFS cache (after several worlds), time Start-Game → first post-"Preparing engine…" label before and after the fix; the gap should drop and stop scaling with cached-file count. Cross-check by clearing OPFS once and confirming the pre-fix dwell shrinks.
2. **Narration (Part 2):** Create New World and confirm "Opening disk cache…" and "Setting up rendering…" appear in the sequence above, each before its step, and that "Initializing renderer…" no longer appears (renamed).
3. Confirm exactly one definition of each changed anchor (grep), no console ReferenceError, and that the `[OPFS] ChunkDataPool initialized …` log still prints (now slightly later).
4. Run `tools/voxex-tests.html` (285 tests) — all green (UI + a non-functional async-log change; confirm no boot regression).
5. On apply: bump `VOXEX_BUILD` (line 3936) + prepend a `VOXEX_RECENT_CHANGES` entry.

---

## Recommendation

Apply **Part 1 first** — it's the only change that actually shortens the "Initializing renderer…" dwell, and it's a safe, behavior-preserving edit. **Part 2** (rename + two labels) then makes the loading screen honest and covers the two remaining heavy steps. After this, every heavy init step (OPFS, effects, textures, blocks, rendering, controls, workers, chunk gen) has its own label, so the screen never sits silently on a long step again. All changes stay within `voxEx.html`.

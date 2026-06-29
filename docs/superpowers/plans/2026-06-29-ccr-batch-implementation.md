# VoxEx CCR Batch Implementation Plan (15 CCRs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 15 pre-audited CCRs in `D:\Projects\voxex\CCR's\` in runbook order, entirely within `voxEx.html`, leaving the test suite green after each one.

**Architecture:** Each CCR is an independent atomic patch to `voxEx.html` (single-file rule). They must be applied in the order below — the runbook groups them by risk (trivial → cleanup → P0 → P1 → meshing cluster → highest risk) and adjacent changes share hot regions (`renderChunk`, `renderFrame`, the worker injection lists) that drift under each successive edit. The `_CROSS_CCR_NOTES.md` is the coordination map; read it before starting.

**Tech Stack:** JavaScript + Three.js r160 in `voxEx.html`; headless Chrome (SwiftShader via puppeteer-core) for `tools/voxex-tests.html`; `python -m http.server 8080` as the static server.

## Global Constraints

- **Single file rule:** ALL code stays in `D:\Projects\voxex\voxEx.html`. No new files, no external scripts.
- **Line numbers drift** — ALWAYS grep the anchor string from the CCR's `Location:` field before editing. NEVER trust the `~` line numbers; they are from build `2026-06-25.34`.
- **Before/After verification:** Before applying any change, confirm the live code matches the CCR's **Before** snippet (allow head/tail elision on long blocks). If it doesn't match, **STOP and report** — do not force the edit.
- **Worker parity:** Functions in `terrainFuncs` and `meshFuncs` lists are injected into the chunk worker via `Function.toString()`. Edit ONLY the main-thread source; the worker copy is auto-generated. When a CCR adds a new module-scope symbol that an injected function references, emit it into the worker via `meshCode +=` / `injectedCode +=` exactly as instructed.
- **Cross-CCR coordination:** Read `D:\Projects\voxex\CCR's\_CROSS_CCR_NOTES.md` before starting. Key interactions: `#494`/`#495` sequence (cleanup deletes a block that shadow-bias cites), four-site glass release requirement, two separate worker injection lists (`terrainFuncs` ~19321 and `meshFuncs` ~19561) that must not clobber each other.
- **After each CCR (required):** Bump `VOXEX_BUILD` suffix + append one `VOXEX_RECENT_CHANGES` entry citing the CCR ID and GitHub issue number(s). Grep anchors: `VOXEX_BUILD` (~line 3999) and `VOXEX_RECENT_CHANGES` (~line 4007).
- **After each CCR (required):** Move the CCR file from `CCR's\` to `CCR's\Finished\`.
- **Test after each CCR:** run `tools/voxex-tests.html` — ALL tests must stay green before moving to the next CCR.
- **Commit hygiene:** Stage ONLY the files you actually touched (`voxEx.html`, + `CLAUDE.md` for Task 3, + the moved CCR `.md`). **Never `git add -A` or `git add .`** — the working tree carries EOL/whitespace churn unrelated to your task. ⚠️ If `.git/index.lock` exists, leave edits in place and report to user.
- **Stop conditions:** Before mismatch, test failure, audit-flag precondition unsatisfied → STOP and report. For Task 15 (`CCR-terrain-single-source`), stop after #517 and #513 and confirm the #514 approach with the user before proceeding.
- **Dropped items:** In Task 12 (PERF-014), items #583, #580, #555 are marked DROPPED — implement NOTHING for them.

---

## Test Command

```bash
# Start static server from D:\Projects\voxex
python -m http.server 8080

# In a separate terminal — run the headless puppeteer test runner
# (Runner lives at %TEMP%\voxex_test_runner\run.cjs — see memory if missing)
node "%TEMP%\voxex_test_runner\run.cjs"
# Expected: "N/N tests passed - All green!" (N ≈ 202-214)
```

---

## Task 1: CCR-updatestreaming-sqrt (PERF-016, #548) — Warm-up

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (one deletion)
- Move: `CCR's\CCR-updatestreaming-sqrt.md` → `CCR's\Finished\`

**What:** Delete the dead `VoxelWorld.updateStreaming` method and its JSDoc; replace with a tombstone comment. Zero behavior change — the method was never called.

- [ ] **Step 1: Read the CCR**
  Open `D:\Projects\voxex\CCR's\CCR-updatestreaming-sqrt.md` and read it in full.

- [ ] **Step 2: Confirm dead code (grep before touching)**
  ```bash
  grep -n "updateStreaming(" voxEx.html
  ```
  Expected: exactly ONE hit (the definition). If any call-site hits appear, STOP.

- [ ] **Step 3: Locate the method**
  Grep anchor: `updateStreaming(playerPosition, renderDistance)`
  Confirm the JSDoc above it (~4 lines) and method body (~35 lines) match the CCR's **Before** snippet.

- [ ] **Step 4: Replace with tombstone**
  Delete from the JSDoc open `/**` through the closing `}` of the method body. Replace with:
  ```js
                  // [TOMBSTONE #548] Removed dead VoxelWorld.updateStreaming() — never called.
                  // Live streaming uses module-level ensureChunk()/scheduleChunkUpdate(), not this
                  // method. It contained a Math.sqrt-per-cell loop that never executed.
  ```

- [ ] **Step 5: Verify**
  ```bash
  grep -n "updateStreaming" voxEx.html
  ```
  Expected: only the tombstone comment line (zero call sites).

- [ ] **Step 6: Bump build banner**
  Grep `VOXEX_BUILD` and `VOXEX_RECENT_CHANGES` near the top of `voxEx.html`. Increment the build suffix and append:
  ```
  // CCR PERF-016 #548: removed dead VoxelWorld.updateStreaming (Math.sqrt loop, never called)
  ```

- [ ] **Step 7: Run tests**
  Start server + run puppeteer runner. All tests must stay green.

- [ ] **Step 8: Move CCR + commit**
  ```bash
  mv "CCR's/CCR-updatestreaming-sqrt.md" "CCR's/Finished/"
  git add voxEx.html "CCR's/Finished/CCR-updatestreaming-sqrt.md"
  git status  # verify ONLY these two files are staged
  git commit -m "$(cat <<'EOF'
  perf: remove dead VoxelWorld.updateStreaming (PERF-016 #548)

  Method was never called — live streaming uses module-level ensureChunk()/
  scheduleChunkUpdate(). Contains a Math.sqrt-per-cell loop that never ran.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: CCR-deadcode-cleanup (CLEANUP-001, #578 #571 #523 #515 #494 #553 #552 #576)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (8 sub-items, all behavior-neutral)
- Move: `CCR's\CCR-deadcode-cleanup.md` → `CCR's\Finished\`

**What:** Pure dead-code deletions + route 9 hot-path `console.*` calls through `logDebug`. Each sub-item must be independently verified before moving to the next. Apply in order: #578 → #571 → #523 → #515 → #494 → #553 → #552 → #576.

**IMPORTANT — interaction with Task 7:** `#494` deletes the unreachable fallback body in `updateUIFromSettings` (~29219–29315), which CONTAINS the positive bias writes that Task 7 (shadow-bias #495) cites as a "canonical reference." This is fine — #495's actual edit target (~29330) is OUTSIDE the deleted range. After this task, rely on the init (~27951/27958) and Reset-Graphics-Lighting (~29454/29459) sites for canonical shadow bias sign.

- [ ] **Step 1: Read the CCR**
  Open `D:\Projects\voxex\CCR's\CCR-deadcode-cleanup.md` and read all 8 sub-items.

- [ ] **Step 2a: #578 — Delete unread post-effect gating vars**
  Grep anchor: `anyPostEffectsActive`
  Confirm the four `const`s (`volumetricActive`, `underwaterActive`, `anyPostEffectsActive`, `useComposer`) + intermediate `perfMetrics.composerUsed = true` match **Before**.
  Delete the 4 dead `const`s, keep `perfMetrics.composerUsed = true` and the surrounding comments (shortened as shown in CCR **After**).
  Verify: `grep "anyPostEffectsActive\|useComposer" voxEx.html` → zero hits (only tombstone comment).

- [ ] **Step 2b: #571 — Delete dead `if (false …)` block in `updateStars`**
  Grep anchor: `if (false && cameraPosition`
  Confirm it matches the `if (false && cameraPosition && starLayers.length > 0 …)` line.
  Delete the comment + `if` block; replace with tombstone:
  ```js
                  // [CCR-CLEANUP-001 #571] Removed dead `if (false …)` star-position debug log.
  ```
  Verify: `grep "if (false && cameraPosition" voxEx.html` → zero hits.

- [ ] **Step 2c: #523 — Remove unused `#torch-overlay` CSS + HTML**
  Grep anchors: `torch-overlay` and `torchFlicker`
  Expected total hits before: 6 (3 CSS rules, 1 animation consumer, 1 keyframe, 1 HTML div).
  Delete all 6. Replace CSS block with:
  ```css
              /* [CCR-CLEANUP-001 #523] Removed unused #torch-overlay CSS + @keyframes torchFlicker — torch is a Three.js viewmodel, not a CSS overlay. */
  ```
  Replace HTML div with:
  ```html
          <!-- [CCR-CLEANUP-001 #523] Removed unused #torch-overlay div. -->
  ```
  Verify: `grep "torch-overlay\|torchFlicker" voxEx.html` → zero hits.

- [ ] **Step 2d: #515 — Remove no-op `const p = 0` in `writeFaceUVs`**
  Grep anchor: `function writeFaceUVs`
  Confirm the `const p = 0` and the four `+ p` / `- p` expressions match **Before**.
  Apply **After**: drop `const p = 0` and inline clean expressions `u0 = uv[0]`, `u1 = uv[0] + tileW`, `v0 = uv[1]`, `v1c = uv[1] + 1.0`. Add tombstone comment.
  Verify: `grep "const p = 0" voxEx.html` → zero hits inside `writeFaceUVs`.

- [ ] **Step 2e: #494 — Delete unreachable fallback in `updateUIFromSettings`**
  Grep anchor: `function updateUIFromSettings`
  Confirm the body matches **Before**: the always-true guard at line 29218 (`if (typeof syncSettingsToUI === "function") { syncSettingsToUI(); return; }`) is present, followed by ~97 lines of unreachable code starting `// Touch Controls (Phase 7)`.
  Delete lines from `// Touch Controls (Phase 7)` through `camera.updateProjectionMatrix();` (the line before the closing `}`). The function after edit must contain only the comment block and the guard, then close:
  ```js
                  function updateUIFromSettings() {
                      // [CCR-CLEANUP-001 #494] syncSettingsToUI is always defined (module-scoped),
                      // so the ~97-line fallback body below was unreachable — removed.
                      if (typeof syncSettingsToUI === "function") { syncSettingsToUI(); return; }
                  }
  ```
  Verify: Settings resets still work (handled by `syncSettingsToUI`).

- [ ] **Step 2f: #553 — Drop unused `settingsManager` param/field in `AudioManager`**
  Grep anchor: `class AudioManager`
  Confirm constructor is `constructor(settingsManager) {` with `this.settings = settingsManager;` on next line.
  Apply **After**: drop the param and `this.settings` field; update JSDoc as shown in CCR.
  Verify: `grep "this.settings" voxEx.html` → any hits belong to OTHER classes (VoxelWorld/UIManager), none inside `AudioManager`.

- [ ] **Step 2g: #552 — Remove redundant touch guard in `onTouchRegionPointerDown`**
  Grep anchor: `function onTouchRegionPointerDown`
  Confirm two-guard pattern matches **Before**.
  Delete only the second guard (`if (e.pointerType === 'mouse' && !touchModeActive) return;`); replace with tombstone comment.
  Verify: function still opens with one `if (!touchModeActive …) return;` guard.

- [ ] **Step 2h: #576 — Route 9 hot-path `console.*` through `logDebug`**
  Apply in order (grep each anchor first):
  1. `[Mesh] COMPRESSION BYPASS` (~in `renderChunk`): `console.error` → `logDebug`
  2. `faces exceeds max` (~in `renderChunk`): `console.warn` → `logDebug`
  3. `drawRange mismatch!` (terrain, ~in `renderChunk`): `console.error` → `logDebug`
  4. `_WATER: drawRange mismatch` (~in `renderChunk`): `console.error` → `logDebug`
  5. `processChunkQueue error` (redundant site, ~in `animate`): **DELETE** the `console.error` line entirely; fold `e` into the existing `logDebug` as rest-arg (see CCR **After** for site 5)
  6. `Stalled:` (~in `animate`, throttled 10s): `console.warn` → `logDebug`
  7. `[RenderDiag] Scene meshes` (~in `renderFrame`): `console.warn` → `logDebug`
  8. `Soft cap reached` (~in `SunlightTask`): `console.warn` → `logDebug`
  9. `Sunlight fallback triggered` (~in `SunlightTask.bailoutToFullRecalc`): `console.warn` → `logDebug`
  **LEAVE untouched:** the ~54 boundary/init/debug-command console sites.
  Verify: `grep -n "console\.error\|console\.warn" voxEx.html | grep -v "//.*console"` inside `renderChunk`/`animate`/`renderFrame`/`SunlightTask` returns zero hits.

- [ ] **Step 3: Bump build banner**
  Append to `VOXEX_RECENT_CHANGES`:
  ```
  // CCR CLEANUP-001 #578/#571/#523/#515/#494/#553/#552/#576: dead-code cleanup + logDebug routing
  ```

- [ ] **Step 4: Run tests** — all green.

- [ ] **Step 5: Move CCR + commit**
  ```bash
  mv "CCR's/CCR-deadcode-cleanup.md" "CCR's/Finished/"
  git add voxEx.html "CCR's/Finished/CCR-deadcode-cleanup.md"
  git commit -m "$(cat <<'EOF'
  chore: dead-code cleanup sweep (CLEANUP-001 #578/#571/#523/#515/#494/#553/#552/#576)

  Behavior-neutral: delete unreachable branches, unused CSS/HTML overlay, no-op
  variable, redundant guard; route 9 hot-path console.* calls through logDebug.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: CCR-docs-constants-sync (DOCS-001, #545 #541 #581)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (code: #545 + #581)
- Modify: `D:\Projects\voxex\CLAUDE.md` (docs: #541)
- Move: `CCR's\CCR-docs-constants-sync.md` → `CCR's\Finished\`

**What:** Delete the partial-duplicate `BLOCKS` convenience object and repoint its 5 readers to bare consts (#545); update CLAUDE.md block/tile counts from stale 16-block/18-tile to 19-block/33-tile (#541); fix 3 stale `16×16×128` chunk-size comments (#581).

- [ ] **Step 1: Read the CCR**
  Open `D:\Projects\voxex\CCR's\CCR-docs-constants-sync.md`.

- [ ] **Step 2a: #545 — Repoint 5 readers, then delete `BLOCKS` object**
  Grep anchor: `const BLOCKS = {` (must NOT hit `BLOCKS_PER_SECTION`)
  Confirm the 12-entry object (IDs 0-10 + UNLOADED: 255) matches **Before**.

  Repoint each reader (grep each anchor first, then apply):
  - `isSolidBlock` (grep: `BLOCKS.AIR`): `id !== BLOCKS.AIR` → `id !== AIR`; `id !== BLOCKS.WATER` → `id !== WATER`
  - `window.VoxExClasses` (grep: `BLOCKS }` near the export): remove `BLOCKS` and its preceding comma
  - `spawnLandingDust` (grep: `BLOCKS.GRASS`): remove each `|| blockId === BLOCKS.X` half on the four `if/else if` lines (keep the `blockId === GRASS` bare-const half)
  - `createHeldBlockMesh` (grep: `BLOCKS.AIR || blockId === AIR`): simplify to `blockId === AIR`
  - `updateHeldBlock` (grep: `BLOCKS.TORCH && blockId !== TORCH`): simplify to `blockId !== TORCH`

  Delete `const BLOCKS = {…}` block; replace with tombstone:
  ```js
              // [CCR-DOCS-001 #545] Removed partial-duplicate BLOCKS enum (only covered IDs 0-10).
              // Canonical block IDs are the const AIR/GRASS/…/BURNT_PLANKS/UNLOADED_BLOCK block (~4135).
  ```

  Verify: `grep -n "BLOCKS" voxEx.html` returns only `BLOCKS_PER_SECTION` hits + tombstone (no `BLOCKS.` property accesses).
  Run block-table invariant tests (subset of the test suite) to confirm.

- [ ] **Step 2b: #581 — Fix 3 stale chunk-height comments**
  Three grep anchors (exact strings from the CCR):
  - `Initialize blockLight with proper size (16 * 16 * 128)` → change `128` to `320`
  - `HOT PATH: Called once per chunk (16×16×128 = 32,768 blocks)` → change to `(16×16×320 = 81,920 blocks)`
  - `Processes up to 32,768 blocks per chunk (16×16×128)` → change to `81,920 blocks per chunk (16×16×320)`

  Verify: `grep "16×16×128\|16 \* 16 \* 128\|32,768 blocks" voxEx.html` → zero hits.

- [ ] **Step 2c: #541 — Update CLAUDE.md block/tile counts**
  Apply each of the 8 line changes listed in the CCR (all confirmed exact strings):
  - `## Block Types (Current: 16 blocks)` → `(Current: 19 blocks)`
  - Block table: add rows for FIRE(16), BURNT_LOG(17), BURNT_PLANKS(18)
  - `NUM_TILES = 18` (tile atlas prose) → `NUM_TILES = 33`
  - `Atlas: 18 tiles` (Rendering section) → `Atlas: 33 tiles`
  - `| \`NUM_TILES\` | 17 |` (Key Constants table) → `| 33 |`
  - Dev guideline: `~line 3552` → `~line 4334`, `count: **18**` → `count: **33**`
  - Checklist: `atlas has 18 tiles` → `atlas has 33 tiles`
  - Tools line: `all 18 tiles` → `all 33 tiles` (both occurrences: repo tree + Testing Tools section)

  Verify: `grep -n "18 tiles\|NUM_TILES = 18\|NUM_TILES | 17\|16 blocks" CLAUDE.md` → zero stale matches.

- [ ] **Step 3: Bump build banner** (append to `VOXEX_RECENT_CHANGES` in `voxEx.html`)
  ```
  // CCR DOCS-001 #545/#541/#581: remove BLOCKS enum; sync CLAUDE.md counts; fix 128→320 comments
  ```

- [ ] **Step 4: Run tests** — all green (block-table invariants specifically).

- [ ] **Step 5: Move CCR + commit**
  ```bash
  mv "CCR's/CCR-docs-constants-sync.md" "CCR's/Finished/"
  git add voxEx.html CLAUDE.md "CCR's/Finished/CCR-docs-constants-sync.md"
  git commit -m "$(cat <<'EOF'
  docs: sync block/tile constants and CLAUDE.md counts (DOCS-001 #545/#541/#581)

  Delete partial-duplicate BLOCKS enum (IDs 0-10 only, missing 11-18); repoint
  5 readers to canonical bare consts. Update CLAUDE.md: 19 blocks, 33 tiles,
  correct chunk-height comments 128→320.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: CCR-cache-version-constant (CACHE-002, #493)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (hoist one const, fix 2 stale stamps, delete 2 duplicates)
- Move: `CCR's\CCR-cache-version-constant.md` → `CCR's\Finished\`

**What:** Replace the two duplicate `const CURRENT_CACHE_VERSION = 5` local declarations and the stale `= 2` / `= 4` stamps with one module-scope constant. Fixes a bug where chunks were written with an older version than readers expect, forcing unnecessary lighting recalculations.

- [ ] **Step 1: Read the CCR** — `CCR-cache-version-constant.md`.

- [ ] **Step 2a: #493a — Add module-scope `CURRENT_CACHE_VERSION`**
  Grep anchor: `const STORE_NAME = "chunks"`
  Insert AFTER the existing `const STORE_NAME = "chunks";` line:
  ```js
  // Bump on any cache-format / lighting change; stamped into every saved chunk and compared on load.
  // v5: re-reconcile trees after deterministic site validation (slope/overhang); v4: canopy-prune fix; v3: water sunlight attenuation.
  const CURRENT_CACHE_VERSION = 5;
  ```

- [ ] **Step 2b: Delete the two local duplicate declarations**
  - Grep anchor 1: `const CURRENT_CACHE_VERSION = 5; // v5:` (in pre-gen function ~27555) — delete this line
  - Grep anchor 2: `const CURRENT_CACHE_VERSION = 5; // v5:` (in per-chunk cache-load ~39414) — delete this line

  Verify: `grep -n "const CURRENT_CACHE_VERSION" voxEx.html` → exactly ONE match (the new module-scope one).

- [ ] **Step 2c: #493b — Fix stale `= 2` stamp in `saveChunkToCache`**
  Grep anchor: `_cacheVersion = 2;  // Current version with valid lighting`
  Replace:
  ```js
  chunkData._cacheVersion = CURRENT_CACHE_VERSION;  // stamp current version (valid lighting)
  ```

- [ ] **Step 2d: #493c — Fix stale `= 4` stamp in `batchSaveChunksToCache`**
  Grep anchor: `_cacheVersion = 4;  // Current version with valid lighting`
  Replace:
  ```js
  chunkData._cacheVersion = CURRENT_CACHE_VERSION;  // stamp current version (valid lighting)
  ```

- [ ] **Step 3: Verify**
  ```bash
  grep -n "_cacheVersion = [0-9]" voxEx.html
  ```
  Expected: zero hits (all stamps now use `= CURRENT_CACHE_VERSION`).
  ```bash
  grep -n "const CURRENT_CACHE_VERSION" voxEx.html
  ```
  Expected: exactly one hit (module-scope declaration).

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR CACHE-002 #493: hoist CURRENT_CACHE_VERSION; fix stale =2/=4 stamps`
  Test: all green. Move CCR. Commit staged files.

---

## Task 5: CCR-localstorage-hardening (ROBUST-001, #519 #518)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (add helper, repoint 5 reads, fix one try-catch, escape seed)
- Move: `CCR's\CCR-localstorage-hardening.md` → `CCR's\Finished\`

**What:** Add `safeParseLocalStorage(key, fallback)` helper and route the 5 unguarded `JSON.parse(localStorage…)` calls through it; wrap the one remaining unguarded `loadWorld` parse in a try-catch; apply `escapeHtml()` to the world-card seed in `innerHTML`.

- [ ] **Step 1: Read the CCR** — `CCR-localstorage-hardening.md`.

- [ ] **Step 2a: #519 — Add `safeParseLocalStorage` helper**
  Grep anchor: `const SaveManager = {`
  Verify `safeParseLocalStorage` does NOT already exist (`grep "safeParseLocalStorage" voxEx.html` → zero hits before this task).
  Insert the helper BEFORE `const SaveManager = {`:
  ```js
  /**
   * Parse a JSON value from localStorage, returning fallback on a missing or corrupt value.
   * @param {string} key - localStorage key.
   * @param {*} fallback - Value returned when the key is absent or unparseable.
   * @returns {*} Parsed value, or fallback.
   */
  function safeParseLocalStorage(key, fallback) {
      try {
          const raw = localStorage.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
          logDebug(`[Storage] corrupt '${key}', using fallback`, e);
          return fallback;
      }
  }
  ```

- [ ] **Step 2b: Repoint the 5 unguarded reads**
  For each, grep the exact string from the CCR, verify it matches, then apply:

  1. `voxex_collapsed_groups` (~3853): `JSON.parse(localStorage.getItem('voxex_collapsed_groups') || '{}')` → `safeParseLocalStorage('voxex_collapsed_groups', {})`
  2. `voxex_collapsed_groups` (~3909, DOMContentLoaded init): same replacement
  3. `voxex_settings` (~6033): `JSON.parse(localStorage.getItem("voxex_settings")) || {}` → `safeParseLocalStorage("voxex_settings", {})`
  4. `voxex_custom_profile` (~6681): `JSON.parse(localStorage.getItem('voxex_custom_profile') || 'null') || { ...DEFAULTS }` → `safeParseLocalStorage('voxex_custom_profile', null) || { ...DEFAULTS }`
  5. `SaveManager.getIndex` (grep: `JSON.parse(localStorage.getItem("voxex_save_index")`): replace body with `safeParseLocalStorage("voxex_save_index", [])`

- [ ] **Step 2c: Wrap the unguarded `loadWorld` parse in try-catch**
  Grep anchor: `const savePacket = JSON.parse(json);   // ← throws on corrupt save`  
  (Or grep: `const savePacket = JSON.parse(json)` in the `loadWorld` function)
  Wrap:
  ```js
  let savePacket;
  try { savePacket = JSON.parse(json); }
  catch (e) { showToast("Save file is corrupt!", "error"); logDebug(`[Save] corrupt save '${saveName}'`, e); return null; }
  ```

- [ ] **Step 3: #518 — Escape `metadata.seed` in world-card `innerHTML`**
  Grep anchor: `class="world-card-meta">Seed:`
  Confirm the current template line has `${metadata.seed || '???'}` without `escapeHtml`.
  Apply:
  ```js
  <div class="world-card-meta">Seed: ${escapeHtml(metadata.seed || '???')} • ${dateStr}<span class="world-card-size">${sizeStr}</span></div>
  ```

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR ROBUST-001 #519/#518: safeParseLocalStorage helper + seed XSS escape`
  Test: all green. Move CCR. Commit staged files.

---

## Task 6: CCR-opfs-worker-onerror (CACHE-003, #512)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (augment `onerror`, add `onmessageerror`, add `failAllPending` closure)
- Move: `CCR's\CCR-opfs-worker-onerror.md` → `CCR's\Finished\`

**What:** Augment the existing OPFS disk-cache worker `onerror` handler to reject all pending requests and clear the pending map; add an `onmessageerror` handler. Currently, a worker-level fault leaves in-flight promises permanently unsettled.

- [ ] **Step 1: Read the CCR** — `CCR-opfs-worker-onerror.md`.

- [ ] **Step 2: Locate `ChunkDiskStorage`**
  Grep anchor: `class ChunkDiskStorage`
  Then grep: `this.worker.onerror = (e) =>`
  Confirm the **Before** block matches (log-only onerror with the surrounding `onmessage` handler visible above it).

- [ ] **Step 3: Apply the change**
  Replace the existing `this.worker.onerror` handler with the **After** block from the CCR:
  - Keep `onmessage` unchanged above
  - Add the `failAllPending` closure between `onmessage` and `onerror`
  - `onerror` now routes to `failAllPending`
  - Add new `onmessageerror` line after `onerror`

  Full **After** block (copy from CCR):
  ```js
                          // Reject every in-flight request on a worker-level fault so callers
                          // fall back to IndexedDB / regeneration instead of awaiting forever.
                          const failAllPending = (reason) => {
                              this._stats.errors++;
                              if (this.pending.size > 0) {
                                  logDebug(`[Chunks] OPFS worker error — rejecting ${this.pending.size} pending request(s)`, reason);
                                  const err = new Error('OPFS worker error: ' + reason);
                                  for (const { reject } of this.pending.values()) reject(err);
                                  this.pending.clear();
                              }
                              // Disk cache is dead for this session; route future calls to fallback.
                              this.ready = false;
                              this.initFailed = true;
                          };

                          this.worker.onerror = (e) => failAllPending(e.message || 'worker onerror');
                          this.worker.onmessageerror = () => failAllPending('worker onmessageerror');
  ```

- [ ] **Step 4: Verify**
  `grep -n "failAllPending" voxEx.html` → appears ONLY inside `ChunkDiskStorage.init`'s try block (local closure, NOT module-scope). Confirm `grep "const failAllPending" voxEx.html` → exactly one hit.

- [ ] **Step 5: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR CACHE-003 #512: OPFS worker onerror rejects pending requests + onmessageerror`
  Test: all green (IndexedDB persistence round-trip). Move CCR. Commit.

---

## Task 7: CCR-shadow-bias-reset-sign (SHADOW-001, #495)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (one line fix + one line addition)
- Move: `CCR's\CCR-shadow-bias-reset-sign.md` → `CCR's\Finished\`

**What:** Fix the spurious negation `-SETTINGS.shadowBias` in the Reset All handler; add the missing moon bias write. Every other apply site uses positive `+SETTINGS.shadowBias`.

**NOTE:** Task 2 (#494) deleted the fallback body in `updateUIFromSettings` which contained the canonical positive bias sites at ~29309–29310. Those sites are now gone, but they were never executed anyway. The LIVE canonical sites remain: init (~27951/27958) and Reset-Graphics-Lighting (~29454/29459). The **actual edit target** (#495 at ~29330) is OUTSIDE the deleted range and survives.

- [ ] **Step 1: Read the CCR** — `CCR-shadow-bias-reset-sign.md`.

- [ ] **Step 2: Locate the bug**
  Grep anchor: `sun.shadow.bias = -SETTINGS.shadowBias`
  Confirm it appears exactly ONCE (in the `btn-reset-all` click handler) and matches the **Before** line.
  Also verify it does NOT appear at the init site (~27951) or Reset-Graphics-Lighting site (~29454) — those should be positive.

- [ ] **Step 3: Apply the fix**
  Replace the buggy line + add moon write. **Before**:
  ```js
                          if (typeof sun !== "undefined" && sun && sun.shadow) { sun.shadow.bias = -SETTINGS.shadowBias; sun.shadow.radius = SETTINGS.shadowRadius; }
  ```
  **After**:
  ```js
                          // #495: write positive bias to match the load/init path (sun.shadow.bias = SETTINGS.shadowBias).
                          // The prior `-SETTINGS.shadowBias` inverted self-shadowing on Reset All vs a fresh load.
                          if (typeof sun !== "undefined" && sun && sun.shadow) { sun.shadow.bias = SETTINGS.shadowBias; sun.shadow.radius = SETTINGS.shadowRadius; }
                          if (typeof moon !== "undefined" && moon && moon.shadow) { moon.shadow.bias = SETTINGS.shadowBias; moon.shadow.radius = SETTINGS.shadowRadius; }
  ```

- [ ] **Step 4: Verify**
  `grep "sun.shadow.bias = -" voxEx.html` → zero hits.
  Confirm the init sites still have `= SETTINGS.shadowBias` (positive): `grep "shadow.bias = SETTINGS" voxEx.html` → multiple positive hits (init, Reset-Graphics-Lighting, now Reset-All).

- [ ] **Step 5: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR SHADOW-001 #495: Reset All shadow bias sign fix + moon bias write`
  Test: all green. Move CCR. Commit.

---

## Task 8: CCR-tree-toggle-restore (WORLDUI-001, #521)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (one handler line)
- Move: `CCR's\CCR-tree-toggle-restore.md` → `CCR's\Finished\`

**What:** Remove the destructive `treeDensityMultiplier = 0` from the tree toggle's uncheck branch. The boolean `enableTrees` is already the sole gate in `applyTerrainSettings`; the zeroing is redundant and prevents slider value from round-tripping.

- [ ] **Step 1: Read the CCR** — `CCR-tree-toggle-restore.md`.

- [ ] **Step 2: Locate and apply**
  Grep anchor: `toggle-trees`
  Confirm the current handler line matches **Before**:
  ```js
              document.getElementById('toggle-trees')?.addEventListener('change', (e) => { customWorldSettings.enableTrees = e.target.checked; if (!e.target.checked) customWorldSettings.treeDensityMultiplier = 0; updateWorldPreview(); });
  ```
  Replace with **After** (remove the `if (!e.target.checked) …` clause):
  ```js
              // #521: do NOT zero treeDensityMultiplier on uncheck — applyTerrainSettings() already gates
              // generation on enableTrees (treeMult = enableTrees ? multiplier : 0), so the boolean is the
              // single source of truth and the numeric value survives a toggle off→on.
              document.getElementById('toggle-trees')?.addEventListener('change', (e) => { customWorldSettings.enableTrees = e.target.checked; updateWorldPreview(); });
  ```

- [ ] **Step 3: Verify**
  `grep "treeDensityMultiplier = 0" voxEx.html` → zero hits (only `applyTerrainSettings`'s `treeMult` calculation using the value, which is correct).

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR WORLDUI-001 #521: tree toggle density round-trip fix`
  Test: all green. Move CCR. Commit.

---

## Task 9: CCR-pregen-fixes (PREGEN-001, #554 #550)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (progress formula + dead assignment)
- Move: `CCR's\CCR-pregen-fixes.md` → `CCR's\Finished\`

**What:** Fix the Phase-1C progress percentage formula that double-counts cached chunks (#554); remove the redundant second `_pregenActive = false` assignment (#550).

- [ ] **Step 1: Read the CCR** — `CCR-pregen-fixes.md`.

- [ ] **Step 2a: #554 — Fix Phase-1C progress formula**
  Grep anchor: `const totalProcessed = processedCached + generatedCount`
  Confirm the buggy line below it matches **Before**:
  ```js
                          const percent = Math.floor((totalProcessed / chunksToProcess.length) * 50) + 50 * (processedCached / chunksToProcess.length);
                          if (progressBar) progressBar.style.width = `${Math.min(50, percent)}%`;
  ```
  Replace with **After**:
  ```js
                          // Update progress — count each chunk once across the combined cached+generated 0–50% band.
                          // #554: prior formula added processedCached twice (inside totalProcessed AND a standalone term).
                          const totalProcessed = processedCached + generatedCount;
                          const percent = Math.floor((totalProcessed / chunksToProcess.length) * 50);
                          if (progressBar) progressBar.style.width = `${Math.min(50, percent)}%`;
  ```

- [ ] **Step 2b: #550 — Remove redundant `_pregenActive = false`**
  Grep anchor: `VOXEX-CCR-PERF-013 Lever 2: clear flag, then fire deferred batch save.`
  (Or grep: `_pregenActive = false;` and look for the SECOND one preceded by a "Lever 2: clear flag" comment — NOT the one with the build-.23 note)
  Confirm the **Before** block matches:
  ```js
                  // VOXEX-CCR-PERF-013 Lever 2: clear flag, then fire deferred batch save.
                  // Does not block Phase 2 rendering — runs concurrently as a fire-and-forget promise.
                  _pregenActive = false;
                  if (_pregenPendingSaves.size > 0) {
  ```
  Replace with **After** (remove the `_pregenActive = false;` line, add tombstone):
  ```js
                  // VOXEX-CCR-PERF-013 Lever 2: fire deferred batch save.
                  // Does not block Phase 2 rendering — runs concurrently as a fire-and-forget promise.
                  // #550: redundant `_pregenActive = false;` removed here — already cleared at Phase-1C start (~27662); nothing re-sets it true.
                  if (_pregenPendingSaves.size > 0) {
  ```

- [ ] **Step 3: Verify**
  `grep -n "_pregenActive = false" voxEx.html` inside `preGenerateSpawnChunks` → exactly ONE hit (the build-.23 note one near Phase-1C start).

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR PREGEN-001 #554/#550: Phase-1C progress formula fix + dead _pregenActive removal`
  Test: all green. Move CCR. Commit.

---

## Task 10: CCR-zombie-proximity-uniform (FX-002, #520)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (add module var, update `updateZombies` loop, update `renderFrame` uniform sync)
- Move: `CCR's\CCR-zombie-proximity-uniform.md` → `CCR's\Finished\`

**What:** Drive the zombie vignette/desat `zombieProximity` shader uniform from the real nearest-zombie distance tracked in `updateZombies`, instead of the hardcoded `0.0`.

- [ ] **Step 1: Read the CCR** — `CCR-zombie-proximity-uniform.md`.

- [ ] **Step 2a: Add module-scope `nearestZombieDistSq`**
  Grep anchor: `let zombieSpawnTimer = 0;`
  Verify `nearestZombieDistSq` does NOT already exist (`grep "nearestZombieDistSq" voxEx.html` → zero hits).
  Insert AFTER `let zombieSpawnTimer = 0;`:
  ```js
              let nearestZombieDistSq = Infinity; // #520: nearest mob→player dist² this frame; drives the zombie post-effect proximity uniform (renderFrame). Reset/updated in updateZombies.
  ```

- [ ] **Step 2b: Update `updateZombies` loop**
  Grep anchor: `for (let i = mobs.length - 1; i >= 0; i--)` (inside `updateZombies`)
  Confirm the loop head matches the **Before** block (includes `_mobCtx.distanceSq = mobTmpA.lengthSq();`).
  Insert `nearestZombieDistSq = Infinity;` before the `for` loop, and add the min-update line after `_mobCtx.distanceSq = mobTmpA.lengthSq();`:
  ```js
                  nearestZombieDistSq = Infinity; // #520: recompute each frame; survives mid-loop despawns
                  for (let i = mobs.length - 1; i >= 0; i--) {
                      const mob = mobs[i];
                      _mobCtx.index = i;
                      _mobCtx.removed = false;
                      _mobCtx.stateHandled = false;
                      mobTmpA.subVectors(playerPos, mob.position);
                      _mobCtx.distanceSq = mobTmpA.lengthSq();
                      if (_mobCtx.distanceSq < nearestZombieDistSq) nearestZombieDistSq = _mobCtx.distanceSq; // #520
                      // ... rest of loop unchanged ...
  ```

- [ ] **Step 2c: Update `renderFrame` zombie-pass uniform sync**
  Grep anchor: `zombieProximity.value = 0.0`
  Confirm the **Before** block (with stale TODO comment) matches.
  Replace with **After**:
  ```js
                  if (zombieScarePass) {
                      // Sync uniforms - shader checks these to short-circuit when disabled
                      zombieScarePass.uniforms.enableVignette.value = SETTINGS.zombieVignetteEnabled;
                      zombieScarePass.uniforms.enableDesaturation.value = SETTINGS.zombieDesaturationEnabled;
                      // #520: drive proximity from the nearest live zombie (computed this frame in updateZombies).
                      // Normalize against detectionRadius: 1 at point-blank, ramps to 0 at the radius edge.
                      // Zero when the feature is off or no zombies are near → identical to the old behaviour.
                      let proximity = 0.0;
                      if (zombieEffectsEnabled && nearestZombieDistSq < Infinity) {
                          const r = ZOMBIE_CONFIG.detectionRadius;
                          const dist = Math.sqrt(nearestZombieDistSq);
                          proximity = Math.max(0, Math.min(1, 1 - dist / r));
                      }
                      zombieScarePass.uniforms.zombieProximity.value = proximity;
                  }
  ```

- [ ] **Step 3: Verify**
  `grep "zombieProximity.value = 0.0" voxEx.html` → zero hits.
  `grep "nearestZombieDistSq" voxEx.html` → exactly 3 hits: declaration, Infinity reset, and the min-update line.

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR FX-002 #520: zombie proximity uniform driven from updateZombies nearest-dist`
  Test: all green. Move CCR. Commit.

---

## Task 11: CCR-particle-skip-despawn (FX-003, #570)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (one branch change in `ParticleSystem.update`)
- Move: `CCR's\CCR-particle-skip-despawn.md` → `CCR's\Finished\`

**What:** In `ParticleSystem.update`, the out-of-range distance branch calls `this.despawn(i)` instead of a bare `continue`. Replace despawn with skip to prevent visible particle pop-out at the 64-unit radius.

- [ ] **Step 1: Read the CCR** — `CCR-particle-skip-despawn.md`.

- [ ] **Step 2: Locate and apply**
  Grep anchor: `> distSq` (the out-of-range check inside `ParticleSystem.update`)
  Or grep: `if (dx * dx + dy * dy + dz * dz > distSq) {`
  Confirm the **Before** block:
  ```js
                          if (dx * dx + dy * dy + dz * dz > distSq) {
                              this.despawn(i);
                              continue;
                          }
  ```
  Replace with **After**:
  ```js
                          // #570: out of update range → skip integration but KEEP the particle.
                          // Lifetime (decremented above) and the maxParticles cap remain the only
                          // despawn authorities, so far particles still age out instead of popping.
                          // Position only matters when in range, so resume integration on return.
                          const dx = p.x - playerPos.x;
                          const dy = p.y - playerPos.y;
                          const dz = p.z - playerPos.z;
                          if (dx * dx + dy * dy + dz * dz > distSq) {
                              continue;
                          }
  ```
  Note: the `dx/dy/dz` declarations are already there in **Before** (just before the branch) — do NOT duplicate them. The only change is the branch body: `this.despawn(i); continue;` → `continue;` plus the comment block.

- [ ] **Step 3: Verify**
  `grep -n "despawn" voxEx.html` inside `ParticleSystem.update` → only the lifetime-expiry despawn remains (`if (p.life <= 0) { this.despawn(i); continue; }`). The distance branch no longer calls `despawn`.

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR FX-003 #570: particle out-of-range skip instead of despawn (no pop)`
  Test: all green. Move CCR. Commit.

---

## Task 12: CCR-render-loop-hygiene (PERF-014, 9 actionable items)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (9 changes; 3 items DROPPED — do NOT implement #583/#580/#555)
- Move: `CCR's\CCR-render-loop-hygiene.md` → `CCR's\Finished\`

**What:** Hoist per-frame/per-chunk allocations to module-scope scratch objects; gate the debug scene-traverse. Applies #572 #574 #575 #549 #546 #544 #525 #577 #542 in that order.

**IMPORTANT — apply in order listed; they touch adjacent but non-overlapping regions.**

- [ ] **Step 1: Read the CCR** — `CCR-render-loop-hygiene.md`. Confirm you see the DROPPED notices for #583/#580/#555.

- [ ] **Step 2a: #572 — Hoist `terrainBuffers`/`terrainState` above section loop**
  Grep anchor: `const useGreedyMeshing = SETTINGS.greedyMeshingEnabled`
  Confirm the inner `const terrainBuffers = {…}` and `let terrainState = {…}` literals match **Before**.
  
  First, add 2 module-scope scratch objects just before `function _renderChunkImpl`:
  ```js
  // VOXEX-CCR-PERF-014 #572: reusable greedy-mesh scratch (was per-section literals)
  const _greedyTerrainBuffers = { pos: null, norm: null, uvs: null, cols: null, quadSize: null, indices: null };
  const _greedyTerrainState = { vIdx: 0, uvIdx: 0, cIdx: 0, qsIdx: 0, iIdx: 0, vertCount: 0, faceCount: 0, inputFaceCount: 0 };
  ```
  
  Then replace the inner literals with field-assigns + `const` aliases (see CCR **After** for exact code).

- [ ] **Step 2b: #574 — Replace `Array.from(queue).slice()` in `processChunkQueue`**
  Grep anchor: `Array.from(chunkNeighborUpdateQueue).slice`
  Add `const _neighborDrainBuf = [];` near `const chunkNeighborUpdateQueue = new Set();`.
  Replace the `Array.from().slice()` call with the bounded drain loop (see CCR **After**).

- [ ] **Step 2c: #575 — Hoist 6 face-direction arrays in `pickVoxel`**
  Grep anchor: `face = stepX > 0 ? [-1, 0, 0]`
  Add 6 frozen consts just before `function pickVoxel`:
  ```js
  const _PICK_FACE_NX = Object.freeze([-1, 0, 0]);
  const _PICK_FACE_PX = Object.freeze([1, 0, 0]);
  const _PICK_FACE_NY = Object.freeze([0, -1, 0]);
  const _PICK_FACE_PY = Object.freeze([0, 1, 0]);
  const _PICK_FACE_NZ = Object.freeze([0, 0, -1]);
  const _PICK_FACE_PZ = Object.freeze([0, 0, 1]);
  ```
  Replace 6 inline literals with the named consts (see CCR **After**).

- [ ] **Step 2d: #549 — Hoist `hiddenWaterMeshes` in refraction block**
  Grep anchor: `const hiddenWaterMeshes = []`
  Add `const _hiddenWaterMeshes = [];` near the `_refractCamWorldPos` / `_refractCamWorldQuat` scratch block.
  Replace `const hiddenWaterMeshes = [];` with `const hiddenWaterMeshes = _hiddenWaterMeshes; hiddenWaterMeshes.length = 0;`.

- [ ] **Step 2e: #546 — Hoist `sampleIndices` in `isLightingDataValid`**
  Grep anchor: `const sampleIndices = [0, 1000, 5000`
  Add `const _lightingSampleIndices = [0, 1000, 5000, 10000, 50000, 0];` before `function isLightingDataValid`.
  Replace the `const sampleIndices = [...]` with:
  ```js
  _lightingSampleIndices[5] = expectedSize - 1;
  const sampleIndices = _lightingSampleIndices;
  ```

- [ ] **Step 2f: #544 — Hoist `maxSize` read in `greedyMeshSection`**
  Grep anchor: `const maxSize = SETTINGS.maxGreedyQuadSize || 16;` (the one INSIDE the expansion loop)
  Add the read once at the top of `greedyMeshSection` (after the `inputFaceCount` guard):
  ```js
  const maxSize = SETTINGS.maxGreedyQuadSize || 16; // VOXEX-CCR-PERF-014 #544: hoisted (loop-invariant)
  ```
  Delete the in-loop `const maxSize = ...` line.
  **Worker propagation:** `greedyMeshSection` is injected via `meshFuncs`; editing the main-thread source auto-propagates. No additional injection needed (worker `SETTINGS` stub already has `maxGreedyQuadSize: 16`).

- [ ] **Step 2g: #525 — Reuse `_aoResult` scratch in AO-off/water path of `calculateFaceAO`**
  Grep anchor: `if (!SETTINGS.AO || blockId === WATER)`
  Confirm the early-return literal `return [1, 1, 1, 1];` matches **Before**.
  Replace with:
  ```js
  if (!SETTINGS.AO || blockId === WATER) {
      // VOXEX-CCR-PERF-014 #525: reuse the shared scratch (was a fresh literal per face).
      _aoResult[0] = _aoResult[1] = _aoResult[2] = _aoResult[3] = 1;
      return _aoResult;
  }
  ```
  **Worker parity:** `calculateFaceAO` is injected via `meshFuncs`; `_aoResult` is already injected as `meshCode += '    const _aoResult = [1, 1, 1, 1];\n';`. No new symbols needed.

- [ ] **Step 2h: #577 — Return `inputSpeed` from `applyPlayerVelocity`; remove recompute**
  Grep anchor (end of `applyPlayerVelocity`): the closing `}` of `applyPlayerVelocity` (after `canJump = false;`)
  Add `return inputSpeed;` before the function's closing `}`.
  
  Grep anchor (caller): `applyPlayerVelocity(dt);` followed immediately by `const flySpeedMultCollision = isFlying ?`
  Replace the call + recompute block with `const inputSpeed = applyPlayerVelocity(dt);` (see CCR **After** for the full block).

- [ ] **Step 2i: #542 — Gate `[RenderDiag]` scene-traverse behind `isDebug`**
  Grep anchor: `if (diagNow - window._lastRenderDiagTime > 5000)`
  Confirm this is the `[RenderDiag]` block (containing `scene.traverse` and the `console.warn`) and NOT `checkGeometryLeaks`.
  Add `isDebug &&` to the condition:
  ```js
  if (isDebug && diagNow - window._lastRenderDiagTime > 5000) {
  ```

- [ ] **Step 3: Verify all new scratch names have no collisions**
  ```bash
  grep -n "_greedyTerrainBuffers\|_greedyTerrainState\|_neighborDrainBuf\|_PICK_FACE_NX\|_hiddenWaterMeshes\|_lightingSampleIndices" voxEx.html
  ```
  Each should appear exactly at its declaration + usage sites (no pre-existing occurrences).

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR PERF-014 #572/#574/#575/#549/#546/#544/#525/#577/#542: render-loop hygiene`
  Test: all green (meshing, parity, raycast, AO toggle). Move CCR. Commit.

---

## Task 13: CCR-water-color-dedup (REFACTOR-001, #524)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (new helper function + scratch + rewrite 2 wrapper functions + 2 worker injection edits)
- Move: `CCR's\CCR-water-color-dedup.md` → `CCR's\Finished\`

**What:** Extract the ~45 lines of identical water vertex-color math from `writeFaceColorsWater` and `writeFaceColorsWaterIndexed` into a shared `computeWaterFaceColor` helper with a module-scope `_waterColorScratch`. Add helper to `meshFuncs` injection list; emit scratch into worker.

- [ ] **Step 1: Read the CCR** — `CCR-water-color-dedup.md`.

- [ ] **Step 2: Add scratch + helper + rewrite both wrappers**
  Grep anchor 1: `function writeFaceColorsWater(`
  Grep anchor 2: `function writeFaceColorsWaterIndexed(`
  Confirm both match **Before** (identical math through `c1..c4`, different write layouts).

  **CRITICAL:** Copy the shared math block VERBATIM from the live `writeFaceColorsWater` (lines ~39963–40046 per CCR; exact content is between `const fogDensity = SETTINGS.waterFogDensity;` and the four `c1/c2/c3/c4` declarations). Do NOT retype from memory.

  Add (before `writeFaceColorsWater`):
  ```js
          // Reused scratch for water vertex colors: [rMult, gMult, bMult, c1, c2, c3, c4].
          const _waterColorScratch = new Float32Array(7);

          function computeWaterFaceColor(ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
              const fogDensity = SETTINGS.waterFogDensity;
              // <<< PASTE VERBATIM SHARED BLOCK HERE — from writeFaceColorsWater lines ~39963-40046 >>>
              _waterColorScratch[0] = rMult;
              _waterColorScratch[1] = gMult;
              _waterColorScratch[2] = bMult;
              _waterColorScratch[3] = c1;
              _waterColorScratch[4] = c2;
              _waterColorScratch[5] = c3;
              _waterColorScratch[6] = c4;
          }
  ```

  Rewrite `writeFaceColorsWater` as thin wrapper (non-indexed, 6-vertex):
  ```js
          function writeFaceColorsWater(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
              computeWaterFaceColor(ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz);
              const rMult = _waterColorScratch[0], gMult = _waterColorScratch[1], bMult = _waterColorScratch[2];
              const c1 = _waterColorScratch[3], c2 = _waterColorScratch[4], c3 = _waterColorScratch[5], c4 = _waterColorScratch[6];
              col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
              col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
              col[cIdx + 6] = c4 * rMult; col[cIdx + 7] = c4 * gMult; col[cIdx + 8] = c4 * bMult;
              col[cIdx + 9] = c2 * rMult; col[cIdx + 10] = c2 * gMult; col[cIdx + 11] = c2 * bMult;
              col[cIdx + 12] = c3 * rMult; col[cIdx + 13] = c3 * gMult; col[cIdx + 14] = c3 * bMult;
              col[cIdx + 15] = c4 * rMult; col[cIdx + 16] = c4 * gMult; col[cIdx + 17] = c4 * bMult;
          }
  ```

  Rewrite `writeFaceColorsWaterIndexed` as thin wrapper (indexed, 4-vertex):
  ```js
          function writeFaceColorsWaterIndexed(col, cIdx, ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz) {
              computeWaterFaceColor(ao, lightLevel, waterDepth, wx, wy, wz, nx, ny, nz);
              const rMult = _waterColorScratch[0], gMult = _waterColorScratch[1], bMult = _waterColorScratch[2];
              const c1 = _waterColorScratch[3], c2 = _waterColorScratch[4], c3 = _waterColorScratch[5], c4 = _waterColorScratch[6];
              col[cIdx + 0] = c1 * rMult; col[cIdx + 1] = c1 * gMult; col[cIdx + 2] = c1 * bMult;
              col[cIdx + 3] = c2 * rMult; col[cIdx + 4] = c2 * gMult; col[cIdx + 5] = c2 * bMult;
              col[cIdx + 6] = c3 * rMult; col[cIdx + 7] = c3 * gMult; col[cIdx + 8] = c3 * bMult;
              col[cIdx + 9] = c4 * rMult; col[cIdx + 10] = c4 * gMult; col[cIdx + 11] = c4 * bMult;
          }
  ```

- [ ] **Step 3: Update worker injection (TWO changes in `buildChunkWorkerCode`)**
  Grep anchor 1: `meshCode += '    const _lightResult = [1, 1, 1, 1];\n';`
  Add next to it: `meshCode += '    const _waterColorScratch = new Float32Array(7);\n';`

  Grep anchor 2: `const meshFuncs = [` (the array near ~19561)
  Add `computeWaterFaceColor` to the list, e.g. on the same line as `writeFaceColorsWaterIndexed`:
  ```js
  writeFaceVerticesIndexed, writeFaceColorsIndexed, computeWaterFaceColor, writeFaceColorsWaterIndexed, writeFaceUVsIndexed, writeFaceIndices,
  ```
  (Order doesn't matter for hoisted function declarations.)

- [ ] **Step 4: Verify**
  `grep "computeWaterFaceColor" voxEx.html` → hits at: definition, 2 wrapper calls, meshFuncs entry.
  `grep "_waterColorScratch" voxEx.html` → hits at: declaration, meshCode emission line, 3 fills + 2 reads (in helper + wrappers).
  Worker markers intact: `grep "__MESH_FUNCS_START__\|__MESH_FUNCS_END__" voxEx.html` → both present.

- [ ] **Step 5: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR REFACTOR-001 #524: computeWaterFaceColor helper deduplicates water vertex-color math`
  Test: all green (especially worker round-trip / mesh parity). Move CCR. Commit.

---

## Task 14: CCR-glass-geometry-pool (VRAM-003, #573)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (4 sites: build, inline-release, 2 stale-drop releases)
- Move: `CCR's\CCR-glass-geometry-pool.md` → `CCR's\Finished\`

**What:** Route glass geometry through `GeometryBufferPool` (acquire/release) instead of `new THREE.BufferGeometry()` / `.dispose()`. Color must be packed via `packColorRGBA8` (Uint8-RGBA) to match the pool's fixed attribute schema. All 4 glass dispose sites must be converted to `releaseTerrain`.

**CRITICAL:** All FOUR glass dispose/release sites must be converted, not just two. After this task, `grep "oldGlassMesh.geometry.dispose\|gMesh.geometry.dispose" voxEx.html` → zero hits in the glass code path.

- [ ] **Step 1: Read the CCR** — `CCR-glass-geometry-pool.md`. Note both AUDIT FLAG callouts.

- [ ] **Step 2a: Site 1 — Replace `new THREE.BufferGeometry()` in glass build**
  Grep anchor: `gGeo = new THREE.BufferGeometry` (inside the glass `if (gFaceCount > 0)` block)
  Confirm **Before** block (5 `setAttribute` calls + `setIndex` + `computeBoundingSphere` + inline `gMesh.geometry.dispose()`).
  Apply **After** block (acquire pool geometry, fill in place with `.set()` + `packColorRGBA8`, set update ranges, `setDrawRange(0, gIIdx)`, `computeBoundingSphere`). The inline old-mesh release inside this block becomes `geometryPool.releaseTerrain(gMesh.geometry)`.

- [ ] **Step 2b: Sites 2 & 3 — Convert stale-drop `oldGlassMesh.geometry.dispose()` (TWO sites)**
  Grep anchor: `oldGlassMesh.geometry.dispose` — expect exactly 2 hits in the glass region.
  First hit (gFaceCount > 0, oldGlassMesh exists but gets replaced): `geometryPool.releaseTerrain(oldGlassMesh.geometry)` + comment.
  Second hit (chunk no longer has glass): `geometryPool.releaseTerrain(oldGlassMesh.geometry)` + comment.
  See CCR **After** block for the exact text including the `posPool.release(gPos)...` line (keep it unchanged).

- [ ] **Step 2c: Site 4 — `releaseMeshForKey` glass branch**
  Grep anchor: `key.includes("_GLASS")`
  Confirm **Before**: `if (gm.geometry) gm.geometry.dispose();`
  Replace with: `if (gm.geometry) geometryPool.releaseTerrain(gm.geometry); // #573: return pooled geo`

- [ ] **Step 3: Verify CRITICAL invariant**
  ```bash
  grep -n "oldGlassMesh\.geometry\.dispose\|gMesh\.geometry\.dispose\|new THREE\.BufferGeometry" voxEx.html
  ```
  Expected: ZERO hits in the glass code path. (Other `BufferGeometry` constructions elsewhere — stars, particles — are fine.)

- [ ] **Step 4: Bump build banner + run tests + move CCR + commit**
  Append: `// CCR VRAM-003 #573: glass mesh routes through GeometryBufferPool (acquire/releaseTerrain)`
  Test: all green (meshing tests). Move CCR. Commit.

---

## Task 15: CCR-terrain-single-source (TERRAIN-001, #517 #513 — stop before #514)

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (#517: new helper + refactor 2 functions; #513: hoist constant + worker emit)
- Move: `CCR's\CCR-terrain-single-source.md` → `CCR's\Finished\` (**ONLY after #517 and #513 are complete and #514 is deferred**)

**What:**
- **#517:** Extract the shared biome-bilinear height sample (~28 lines, duplicated verbatim in `blendedHeight` and `getPreRiverHeight`) into `sampleBiomeBilinearHeight`; add it to `terrainFuncs` injection.
- **#513:** Hoist `_FH_NEIGHBORS` from a per-call-miss local in `getBiomeCellDirect` to module scope; emit it into the worker injection block (REQUIRED — referenced by an injected function).
- **#514:** ⛔ STOP after #517 and #513. Do NOT implement #514 (preview/game biome alignment) — it requires a structural port and user confirmation of approach (A vs B per CCR). Report to user before continuing.

**HIGH RISK — worker injection.** Terrain functions are single-sourced and injected into the chunk worker via `Function.toString()`. Any symbol the functions reference that is NOT injected will throw `X is not defined` in the worker on first terrain call. Follow injection instructions exactly.

- [ ] **Step 1: Read the CCR** — `CCR-terrain-single-source.md` — pay attention to the STOP notice for #514.

- [ ] **Step 2a: #517 — Extract `sampleBiomeBilinearHeight`**
  Grep anchor 1: `function blendedHeight(`
  Grep anchor 2: `function getPreRiverHeight(`
  Confirm both have the same ~28-line block (from `const c = continentalHeight(...)` through `let finalHeight = lerpValue(h0, h1, sz);`).

  Place new helper just before `function blendedHeight`:
  ```js
          // Continentalness + domain-warped 4-corner biome bilinear height sample.
          // Shared by blendedHeight() and getPreRiverHeight(); pre-jagged, pre-ocean.
          function sampleBiomeBilinearHeight(gx, gz, seed) {
              // <<< PASTE VERBATIM BLOCK: const c = continentalHeight(...) through return lerpValue(h0,h1,sz); >>>
          }
  ```
  Replace the shared block in `blendedHeight` with `let finalHeight = sampleBiomeBilinearHeight(gx, gz, seed);`.
  Replace the shared block in `getPreRiverHeight` with `let finalHeight = sampleBiomeBilinearHeight(gx, gz, seed);`.

  Add to the `terrainFuncs` array (grep anchor: `const terrainFuncs = [`):
  ```js
                  sampleBiomeBilinearHeight,  // added before blendedHeight
  ```

  Verify: `grep "sampleBiomeBilinearHeight" voxEx.html` → definition + 2 call sites + terrainFuncs entry.

- [ ] **Step 2b: #513 — Hoist `_FH_NEIGHBORS` to module scope + emit to worker**
  Grep anchor: `const _FH_NEIGHBORS = [` (inside `getBiomeCellDirect`)
  Confirm the 8-element neighbor array is declared inside the function.
  
  Move it to module scope near `_BIOME_CDF_TABLE` (grep: `const _BIOME_CDF_TABLE`):
  ```js
          // Foothill 8-neighbour offsets (Moore neighbourhood, no centre).
          const _FH_NEIGHBORS = [
              [-1,-1], [0,-1], [1,-1],
              [-1, 0],         [1, 0],
              [-1, 1], [0, 1], [1, 1]
          ];
  ```
  Inside `getBiomeCellDirect`, delete the local `const _FH_NEIGHBORS = [...]` declaration (keep the `for` loop that uses it).

  Add worker emission (grep anchor: `injectedCode += '    const _BIOME_CDF_TABLE = '`):
  ```js
                  injectedCode += '    const _FH_NEIGHBORS = ' + JSON.stringify(_FH_NEIGHBORS) + ';\n';
  ```

  Verify:
  ```bash
  grep -n "const _FH_NEIGHBORS" voxEx.html
  ```
  Expected: exactly 2 hits — module-scope declaration and the `injectedCode +=` emission line. Zero local declarations inside `getBiomeCellDirect`.

- [ ] **Step 3: Run tests**
  CRITICAL: `tools/voxex-tests.html` must include the worker `blendedHeight` parity test and terrain determinism test — both must stay green. A missing worker `sampleBiomeBilinearHeight` or `_FH_NEIGHBORS` would cause a worker error or foothill mismatch.

- [ ] **Step 4: STOP — report to user about #514**
  Report to the user:
  > **TERRAIN-001 #517 and #513 complete. #514 (preview/game biome alignment) is a structural port that requires confirming the approach with you before proceeding. The preview uses a different noise source (WorldPreviewNoise with an LCG-shuffled permutation table) than the game (module-level noise2D + global perm seeded by seedMainThreadNoise). Two options per the CCR: (A) True parity — make the preview consume the game's noise2D/perm path directly; (B) Faithful port — replicate the game's algorithm into WorldPreviewRenderer but may still not match without the same noise. Which approach should I take?**

- [ ] **Step 5: Bump build banner**
  Append: `// CCR TERRAIN-001 #517/#513: sampleBiomeBilinearHeight extract + _FH_NEIGHBORS hoist/worker-emit`

- [ ] **Step 6: Move CCR to Finished + commit**
  Move CCR even though #514 is deferred (the CCR file covers all three; the deferred item is noted in commit message).
  ```bash
  mv "CCR's/CCR-terrain-single-source.md" "CCR's/Finished/"
  git add voxEx.html "CCR's/Finished/CCR-terrain-single-source.md"
  git commit -m "$(cat <<'EOF'
  refactor: terrain bilinear sample extract + _FH_NEIGHBORS hoist (TERRAIN-001 #517/#513)

  Extract sampleBiomeBilinearHeight shared by blendedHeight/getPreRiverHeight.
  Hoist _FH_NEIGHBORS to module scope; emit into worker injection block.
  #514 (preview/game biome parity) deferred pending approach confirmation.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Checklist Summary

After all 15 tasks, verify:
- [ ] `grep -n "const CURRENT_CACHE_VERSION" voxEx.html` → exactly one hit
- [ ] `grep -n "BLOCKS\." voxEx.html` → zero property accesses (only `BLOCKS_PER_SECTION` and tombstone)
- [ ] `grep -n "console\.error\|console\.warn" voxEx.html | grep -v "//"` in hot paths → zero hits
- [ ] `grep -n "updateStreaming" voxEx.html` → only tombstone
- [ ] `grep -n "oldGlassMesh\.geometry\.dispose\|gMesh\.geometry\.dispose" voxEx.html` → zero hits
- [ ] `grep -n "zombieProximity.value = 0.0" voxEx.html` → zero hits
- [ ] `grep -n "const CURRENT_CACHE_VERSION" voxEx.html` → one hit
- [ ] All 15 CCRs are in `CCR's/Finished/`
- [ ] `tools/voxex-tests.html` — all tests green
- [ ] `VOXEX_RECENT_CHANGES` has 15 entries (one per CCR)
- [ ] #514 status reported to user (confirmed deferred, awaiting approach decision)

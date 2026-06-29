# CCR — Constants & Docs Sync (Block/Tile Source-of-Truth)

**ID:** VOXEX-CCR-DOCS-001
**File:** `voxEx.html` + `CLAUDE.md` (doc file edit permitted; code change stays single-file)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #545, #541, #581
**Scope:** Single-source the block-ID constants and bring the docs/comments back in line with the actual block/tile/chunk counts. All three are low-risk truth-alignment edits driven by the same drift.

> Line numbers are as of build `2026-06-25.34` and **WILL drift** — grep before editing.

---

## Summary

Code has grown to **33 tiles** (`NUM_TILES = 33`, ~4334) and **19 active block types** (IDs 0-18, plus `UNLOADED_BLOCK = 255`), with FIRE=16, BURNT_LOG=17, BURNT_PLANKS=18. A convenience object and several doc/comment lines still describe the old world.

| # | Site (grep target) | Problem | Fix |
|---|--------------------|---------|-----|
| #545 | `const BLOCKS = {` (~7314; NOT `BLOCKS_PER_SECTION` ~6903) | a 12-entry convenience object that partial-duplicates the canonical block-ID consts (IDs 0-10 only; missing 11-18) → drift hazard | repoint all `BLOCKS.X` readers to the canonical bare consts; delete `BLOCKS` |
| #541 | `CLAUDE.md` block table, `NUM_TILES` refs, "18 tiles" checklist | doc says 16 blocks / `NUM_TILES=18` (and the Key Constants table says 17); code is 19 blocks / 33 tiles | update block table + every tile-count reference |
| #581 | stale `16×16×128` comments (grep `128`) | three code comments still say chunk is 128 tall; actual `CHUNK_HEIGHT = 320` | correct to 320 / 81,920 cells |

### Impact

- Removes a real correctness hazard (#545: a partial block-ID duplicate is a latent bug source).
- `CLAUDE.md` and code comments stop misleading future work on block/tile/chunk counts.

---

### #545 — Delete partial-duplicate `BLOCKS` convenience object
**Location:** `const BLOCKS` — line ~7314 (grep: `const BLOCKS = {` — exclude `BLOCKS_PER_SECTION` ~6903)
**Why:** `BLOCKS` lists IDs 0-10 + `UNLOADED: 255` only — it is **missing** SNOW(11), GRAVEL(12), LONGWOOD_LOG(13), LONGWOOD_LEAVES(14), GLASS(15), FIRE(16), BURNT_LOG(17), BURNT_PLANKS(18). The canonical single source is the `const AIR=0, GRASS=1, … BURNT_PLANKS=18, UNLOADED_BLOCK=255` block (~4135). Every `BLOCKS.X` reader sits right next to the equivalent bare constant already, so `BLOCKS` is pure redundancy that can silently drift.
**Readers (all verified — repoint each, then delete the object + its window export):**
- `~7845` `isSolidBlock`: `id !== BLOCKS.AIR && id !== BLOCKS.WATER` → `id !== AIR && id !== WATER`
- `~9869` `window.VoxExClasses = { …, BLOCKS }` → remove `BLOCKS` from the export (grep `tools/` confirms no external reader)
- `~16431-16438` `spawnLandingDust`: `blockId === GRASS || blockId === BLOCKS.GRASS` (and STONE/SAND/SNOW) → drop the `|| blockId === BLOCKS.X` halves (bare const already covers it)
- `~35727` `createHeldBlockMesh`: `blockId === BLOCKS.AIR || blockId === AIR` → `blockId === AIR`
- `~35774` `updateHeldBlock`: `blockId !== BLOCKS.TORCH && blockId !== TORCH` → `blockId !== TORCH`
**Change:** Delete the `const BLOCKS = {…}` object (~7312-7327) and remove `BLOCKS` from `window.VoxExClasses`; repoint the five reader sites to the canonical bare consts.
**Context — the canonical block-ID source (line 4135, verbatim — `BLOCKS` should defer to THESE, then be deleted):**
```js
            const AIR = 0,
                GRASS = 1,
                DIRT = 2,
                STONE = 3,
                WOOD = 4,
                LOG = 5,
                LEAVES = 6,
                BEDROCK = 7,
                SAND = 8,
                WATER = 9,
                TORCH = 10,
                SNOW = 11,
                GRAVEL = 12,
                LONGWOOD_LOG = 13,
                LONGWOOD_LEAVES = 14,
                GLASS = 15,
                FIRE = 16,
                BURNT_LOG = 17,
                BURNT_PLANKS = 18,
                UNLOADED_BLOCK = 255;
```
(NOTE: a second block-ID const set exists at lines ~18446-18589 with 4-space indent — that is the HAND-MAINTAINED worker-template copy, NOT the canonical readers' source. Do NOT touch it for this CCR.) Every reader already has the bare const in scope (same module), so repointing is mechanical. The 5 reader sites, verbatim current text:
- **7845** (`VoxelWorld` solidity predicate): `return id !== BLOCKS.AIR && id !== BLOCKS.WATER && id !== TORCH && id !== FIRE && id !== undefined;` → replace `BLOCKS.AIR`→`AIR`, `BLOCKS.WATER`→`WATER`.
- **9869** (window export): inside `window.VoxExClasses = { VoxelWorld, AudioManager, UIManager, BLOCKS };` (9865-9870) — drop the trailing `BLOCKS` (and the comma on the prior line). `grep tools/` confirms no external reader of `VoxExClasses.BLOCKS`.
- **16431-16438** (`spawnLandingDust` dust-color chain): four lines `if (blockId === GRASS || blockId === BLOCKS.GRASS) {` / `} else if (blockId === STONE || blockId === BLOCKS.STONE) {` / `… SAND || blockId === BLOCKS.SAND …` / `… SNOW || blockId === BLOCKS.SNOW …` → drop each `|| blockId === BLOCKS.X` half (bare const already covers it).
- **35727** (`createHeldBlockMesh`): `if (blockId === BLOCKS.AIR || blockId === AIR) return null;` → `if (blockId === AIR) return null;`.
- **35774** (`updateHeldBlock`): `if (blockId !== BLOCKS.TORCH && blockId !== TORCH) {` → `if (blockId !== TORCH) {`.

After repointing all 5, `grep "BLOCKS"` should show only `BLOCKS_PER_SECTION` (6903/41935/41952), `INVENTORY_BLOCKS`/`DEFAULT_TREE_GROUND_BLOCKS`, comment-mentions, and the new tombstone.
**Block-table invariant guard:** the safety net for this change lives in `tools/voxex-tests.html` — `describe("block tables: classification invariants")` (~line 737) and `describe("fire: block-table invariants")` (~line 750), which assert `BLOCK_IS_SOLID`/`BLOCK_IS_OPAQUE`/`IS_TRANSPARENT` for AIR/WATER/STONE/LEAVES/GLASS/FIRE/BURNT_LOG/BURNT_PLANKS against the bare consts. Run them green after the repoint.
**Before (the object, ~7311-7327):**
```js
            // -------------------------
            // 0. BLOCKS ENUM (Convenience object)
            // -------------------------
            const BLOCKS = {
                AIR: 0,
                GRASS: 1,
                DIRT: 2,
                STONE: 3,
                WOOD: 4,
                LOG: 5,
                LEAVES: 6,
                BEDROCK: 7,
                SAND: 8,
                WATER: 9,
                TORCH: 10,
                UNLOADED: 255
            };
```
**After:**
```js
            // [CCR-DOCS-001 #545] Removed partial-duplicate BLOCKS enum (only covered IDs 0-10).
            // Canonical block IDs are the const AIR/GRASS/…/BURNT_PLANKS/UNLOADED_BLOCK block (~4135).
```
**Before (reader examples):**
```js
                    return id !== BLOCKS.AIR && id !== BLOCKS.WATER && id !== TORCH && id !== FIRE && id !== undefined;
```
```js
                if (blockId === GRASS || blockId === BLOCKS.GRASS) {
```
```js
                if (blockId === BLOCKS.AIR || blockId === AIR) return null;
```
**After (reader examples):**
```js
                    return id !== AIR && id !== WATER && id !== TORCH && id !== FIRE && id !== undefined;
```
```js
                if (blockId === GRASS) {
```
```js
                if (blockId === AIR) return null;
```
**Verify:** grep `BLOCKS` confirms zero remaining matches except `BLOCKS_PER_SECTION` and the new tombstone. `tools/voxex-tests.html` block-table invariant tests green.

---

### #541 — Sync `CLAUDE.md` block/tile counts to code
**Location:** `CLAUDE.md` — block table (~69-91), Key Constants `NUM_TILES` (~240), checklist (~38, 140, 303, 396)
**Why:** Code is 19 blocks (0-18) / `NUM_TILES = 33`. CLAUDE.md still says 16 blocks and `NUM_TILES = 18` (and the Key Constants table contradicts itself with 17). Doc-only; no runtime effect.
**Change:** Add blocks 16-18 to the table; fix the header count; fix all tile-count references (note: code uses a 33-tile strip because FIRE has 12 animation frames + 3 burnt tiles).
**Context — authoritative code values (verbatim from voxEx.html, all confirmed):**
- `const NUM_TILES = 33;` (line 4334) — the live atlas count.
- `const CHUNK_HEIGHT = 320;` (line 18446); `const CHUNK_DATA_SIZE = WORLD_DIMS.chunkSize * WORLD_DIMS.chunkSize * WORLD_DIMS.chunkHeight; // 81920 bytes per chunk` (line 7249).
- Block count = 19 active IDs (0-18) + `UNLOADED_BLOCK = 255`; FIRE=16, BURNT_LOG=17, BURNT_PLANKS=18 (canonical const block at line 4135, shown under #545 above).

**Current stale CLAUDE.md lines to fix (verbatim, with their real line numbers — all 8 confirmed present):**
- L38: `│   └── voxex-texture-tests.html  # Visual texture atlas tests (all 18 tiles + automated checks)`
- L69: `## Block Types (Current: 16 blocks)`
- L91: `- **Texture Atlas**: \`NUM_TILES = 18\` tiles in a horizontal strip.`
- L140: `- **Textures**: procedural 16x16 pixel art on canvas (Atlas: 18 tiles).`
- L240: `| \`NUM_TILES\` | 17 | Texture atlas tile count |`
- L303: `2. **Texture Atlas**: adding blocks → update \`NUM_TILES\` (~line 3552) + add texture gen in \`initTextures\`. Current count: **18**.` (also fix the stale `~line 3552` → `~line 4334`)
- L396: `- [ ] Chunk size is 16x16x320 (not 128); atlas has 18 tiles (update \`NUM_TILES\` if adding blocks); …`
- L408: `- **\`tools/voxex-texture-tests.html\`** — visual texture tests. Renders all 18 atlas tiles; …` (the "18 atlas tiles" the note flags)

**Before (block table header + tail, ~69 / ~88-91):**
```text
## Block Types (Current: 16 blocks)
```
```text
| 15 | `GLASS` | Transparent + collidable (tags: transparent/cutout/collidable), zero light attenuation |
| 255 | `UNLOADED_BLOCK` | Placeholder for unloaded chunks |

- **Texture Atlas**: `NUM_TILES = 18` tiles in a horizontal strip.
```
**After:**
```text
## Block Types (Current: 19 blocks)
```
```text
| 15 | `GLASS` | Transparent + collidable (tags: transparent/cutout/collidable), zero light attenuation |
| 16 | `FIRE` | Transparent, walk-through, emissive separate-render block; clings to adjacent faces; 12-frame anim |
| 17 | `BURNT_LOG` | Charred log (fire burn result) |
| 18 | `BURNT_PLANKS` | Charred planks (fire burn result) |
| 255 | `UNLOADED_BLOCK` | Placeholder for unloaded chunks |

- **Texture Atlas**: `NUM_TILES = 33` tiles in a horizontal strip (12 fire frames + 3 burnt + base blocks).
```

**Before (Key Constants table, ~240):**
```text
| `NUM_TILES` | 17 | Texture atlas tile count |
```
**After:**
```text
| `NUM_TILES` | 33 | Texture atlas tile count |
```

**Before (rendering line, ~140):**
```text
- **Textures**: procedural 16x16 pixel art on canvas (Atlas: 18 tiles).
```
**After:**
```text
- **Textures**: procedural 16x16 pixel art on canvas (Atlas: 33 tiles).
```

**Before (dev guideline, ~303):**
```text
2. **Texture Atlas**: adding blocks → update `NUM_TILES` (~line 3552) + add texture gen in `initTextures`. Current count: **18**.
```
**After:**
```text
2. **Texture Atlas**: adding blocks → update `NUM_TILES` (~line 4334) + add texture gen in `initTextures`. Current count: **33**.
```

**Before (checklist, ~396):**
```text
- [ ] Chunk size is 16x16x320 (not 128); atlas has 18 tiles (update `NUM_TILES` if adding blocks); block lookup tables updated if adding blocks (`initBlockLookupTables()`)
```
**After:**
```text
- [ ] Chunk size is 16x16x320 (not 128); atlas has 33 tiles (update `NUM_TILES` if adding blocks); block lookup tables updated if adding blocks (`initBlockLookupTables()`)
```

**Before (tools line, ~38 — also "all 18 tiles"):**
```text
│   └── voxex-texture-tests.html  # Visual texture atlas tests (all 18 tiles + automated checks)
```
**After:**
```text
│   └── voxex-texture-tests.html  # Visual texture atlas tests (all 33 tiles + automated checks)
```
> Also fix the analogous "Renders all 18 atlas tiles" line in the Testing Tools section (grep `18 atlas tiles`).
**Verify:** grep CLAUDE.md for `18 tiles`, `NUM_TILES = 18`, `NUM_TILES | 17`, `16 blocks` → zero stale matches; counts match code (`NUM_TILES = 33`, blocks 0-18).

---

### #581 — Fix stale `16×16×128` chunk-dimension comments
**Location:** three comments (grep: `128` near chunk-dimension comments) — ~26158, ~39243, ~41539
**Why:** `CHUNK_HEIGHT = 320` (~18446) and `CHUNK_DATA_SIZE = 81920`. Three comments still say the chunk is 128 tall (and two state `32,768` cells, which is 16×16×128 — the real count is 16×16×320 = 81,920). Comment-only; no runtime effect (the code itself is length-derived and correct).
**Change:** Correct each comment to 320 / 81,920.
**Context:** Authoritative source: `const CHUNK_HEIGHT = 320;` (line 18446); `CHUNK_DATA_SIZE` is length-derived `16 * 16 * 320 = 81,920` (line 7249, comment already says `81920 bytes per chunk`). The three stale comments are **comment-only** (no runtime effect). `grep "16 \* 16 \* 128|16×16×128|32,768 blocks"` returns exactly these 3 hits — confirmed verbatim:
- L26158: `// Initialize blockLight with proper size (16 * 16 * 128) instead of empty array`
- L39243: `//   - HOT PATH: Called once per chunk (16×16×128 = 32,768 blocks)`
- L41539: `//   - Processes up to 32,768 blocks per chunk (16×16×128)`
None of the unrelated `128`s flagged in the **Verify** line appear in those matches, so this grep is a clean, exhaustive target set.

1. **~26158** (`decompressChunkData`, v2 branch):
```js
// BEFORE
                        // Initialize blockLight with proper size (16 * 16 * 128) instead of empty array
// AFTER
                        // Initialize blockLight with proper size (16 * 16 * 320) instead of empty array
```
2. **~39243** (`generateChunkData` optimization audit):
```js
// BEFORE
            //   - HOT PATH: Called once per chunk (16×16×128 = 32,768 blocks)
// AFTER
            //   - HOT PATH: Called once per chunk (16×16×320 = 81,920 blocks)
```
3. **~41539** (`renderChunk` optimization audit):
```js
// BEFORE
            //   - Processes up to 32,768 blocks per chunk (16×16×128)
// AFTER
            //   - Processes up to 81,920 blocks per chunk (16×16×320)
```
**Verify:** grep `16×16×128` / `16 * 16 * 128` / `32,768 blocks` → zero stale chunk-dimension matches. (Leave unrelated `128`s alone: touch-joystick CSS ~110, memory/shadow sliders ~2577/2680/6434/6662/12017, FPS/cache buffer sizes ~10099/10632, foam-mask bit ~31804/40419.)

---

## Safety Checks

- [ ] **#545:** `BLOCKS` removed only after all five readers repointed to canonical bare consts; `BLOCKS` dropped from `window.VoxExClasses`; grep confirms zero `BLOCKS` references except `BLOCKS_PER_SECTION` + tombstone; no external (`tools/`) reader of `VoxExClasses.BLOCKS`.
- [ ] No new DOM IDs / settings; block lookup tables unaffected (this CCR adds no blocks).
- [ ] **#541 / #581:** doc/comment-only — no code logic touched.
- [ ] `tools/voxex-tests.html` block-table invariants green (guards #545).
- [ ] `CLAUDE.md` block table, `NUM_TILES` references (both the prose `18` and the table `17`), and checklist lines all reflect 19 blocks / 33 tiles.
- [ ] Bump `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (only the #545 code change requires it; doc edits alone do not).

> **Status: ALL 5 PHASES BUILT + COMMITTED, on branch `ccr/magic-system` (build `2026-07-07.102`) — NOT YET MERGED to `main`.** All four spells work end-to-end on desktop AND touch. See **§15 As-built summary** for what shipped, concrete deviations from this doc's literal text, and what Phase 5 explicitly did not build. The design intent below (§1-§14) is Rev 2 as originally written — re-grep anchors before trusting any `~line NNNN` reference or code excerpt, per this doc's own rule. _(Rev 2 design intent audited 2026-07-07 against build `2026-07-07.96`; see CLAUDE.md Documentation Index.)_

# VoxEx — Magic System Design Plan

**Status:** Design / planning (no code written yet)
**Author:** Planning pass 2026-06-15 (Rev 1); full code audit + rewrite 2026-07-07 (Rev 2)
**Scope:** Add a player "magic mode" (toggle with **M**) that swaps the hotbar and inventory to a spell loadout, plus four spells: **Explosion**, **Laser (carve)**, **Fire**, **Freeze**.

All `~line NNNN` references below were verified against build `2026-07-07.96` and WILL drift — always re-grep the named anchor before editing (CLAUDE.md rule). Code excerpts in this doc are **verbatim from the live file** at audit time, so an excerpt that no longer matches the file means the section needs re-audit before implementing.

---

## 0. Rev 2 audit — what changed since the original plan

The original plan (2026-06-15, build `2026-06-14.6`) is ~7K lines of file growth and several shipped systems out of date. The Rev 2 audit found:

| Rev 1 assumption | Reality at `2026-07-07.96` | Effect on plan |
|---|---|---|
| Fire system deferred to a future design pass (§7.5, Phase 4 "blocked") | **Fire shipped** (FireImplementation.md): FIRE=16, BURNT_LOG=17, BURNT_PLANKS=18; `burnable` tag + `burnsTo`/`burnTime`/`spreadChance`; 2 Hz budgeted spread tick; glow via `torchLightPool`; water extinguish; fire LOD | Phase 4 collapses to "call the existing ignition sequence" (§7) |
| 18 tiles, ICE+FIRE add ≥4 → "22 minimum" | `NUM_TILES = 33` (12 fire frames + 3 burnt already in the atlas) | ICE + 3 spell-icon tiles → **37** (§5, §4.3) |
| Keyboard/mouse only | **Touch controls shipped** (mobileControlsPlan): virtual joystick, tap=place / hold=mine gesture grammar, `wireTapButton` buttons, `isGameplayActive()` gates | New §4.7: magic needs a touch story — this is the largest unplanned scope |
| All meshing on main thread | **Worker mesh pipeline shipped**: unbanded chunks mesh in workers; chunks containing TORCH/FIRE/GLASS are flagged and re-routed to main-thread `renderChunk` (~line 20458); edited chunks become banded → main thread anyway | ICE needs a routing decision (§5.1); spell edits land on the main mesher regardless |
| Whole-chunk remesh per edit | **Banded meshing shipped**: 4 bands × 5 sections, `bandMaskForY(y)`, per-band mesh keys `'cx,cz#band'` | Bulk edits should OR band masks (§8) |
| "F is a one-off key like E" | F is a **data-driven binding** (`KEY_BINDINGS.torch`) dispatched via `CODE_TO_ACTION`; only E is a true one-off `if` block | M should follow the F pattern (§4.1) |
| `MAX_POINT_LIGHTS = 8` (one constant) | **Two** declarations: 8 (~7259, real torch PointLight pool) and a locally-scoped 4 (~28807, volumetric god-ray shader arrays only) | Spell-light budget reasoning corrected (§6.3) |

Everything else in the Rev 1 architecture (mode flag + parallel data structures, spell registry mirroring `BLOCK_CONFIG`, bulk-edit helper, four delivery shapes) survives the audit intact.

---

## 1. Design decisions (locked)

| Decision | Choice | Consequence |
|---|---|---|
| **Balance** | Free-form / creative | No mana, no cooldowns, no resource HUD. One tiny per-cast interval guard to stop per-frame spam (§10). |
| **Delivery** | Mix per spell | Explosion = instant at aim point; Laser = instant beam; Fire = arcing projectile; Freeze = short-range cone. |
| **World impact** | Permanent + spreading fire | Explosion/laser permanently carve terrain (saved to chunks). Fire uses the **shipped** fire system — spreads per `BURN_SPREAD`, capped by `fireSpreadBudget`/`fireMaxActive`. |
| **Spell icons** | Procedural **atlas tiles** | Icons are drawn into the texture atlas like block tiles, so `setSlotIcon` and the inventory grid work unchanged (§4.3). Fire's icon reuses `TILE.FIRE_FREE_0`. |
| **Secondary cast** | Right-click reserved | Each spell may define `cast` (primary) and `castSecondary`. |
| **Fire** | Use as-built system | The fireball **seeds** existing fire via the same 3-call ignition sequence `tryPlaceBlock` uses (§7). No fire-system changes required. |
| **Water** | Keep as-is | Static water; carved sub-sea holes stay open (§8.5). Water remains a future major workstream. |
| **Touch** | First-class | Magic must work in touch mode: toggle button + gesture mapping (§4.7). Proposed mapping below needs a play-feel confirmation. |

---

## 2. Goals & non-goals

**Goals**

- Press **M** (or tap the magic button) to flip between *block mode* (current behavior) and *magic mode*.
- In magic mode the hotbar scrolls through spells and the inventory assigns spells to hotbar slots — reusing the existing hotbar/inventory machinery, not a parallel UI.
- Four working spells with distinct delivery, visuals, sound, light, and terrain effect.
- Stay inside the three pillars: **single file**, **voxels only** (BoxGeometry / square particles), **performance-first**.

**Non-goals**

- Fluid simulation (§8.5). Spell crafting/progression, multiplayer, mob spellcasting. Rebindable magic key (controls menu is still a static display).

---

## 3. Architecture overview

Mode flag plus parallel data structures, routing the existing hotbar/inventory/click logic through `if (magicMode)` branches. The input/UI code is already mode-agnostic enough that no rewrite is needed.

```
                 ┌─────────────────────────────┐
   press M  ───► │  magicMode (bool, global)   │
                 └──────────────┬──────────────┘
                                │ routes
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                         ▼
  Hotbar select/scroll     Inventory render          Click / tap action
  (blocks │ spells)        (blocks │ spells)         (mine+place │ cast)
        │                       │                         │
        ▼                       ▼                         ▼
  HOTBAR_SLOT_TO_BLOCK     populateInventory()       castSpell(id, "primary"|"secondary")
  HOTBAR_SLOT_TO_SPELL     branch on magicMode       ──► Spell framework (§6)
```

### 3.1 New global state

The block-mode state this mirrors (verified declarations):

```js
10210            let HOTBAR_SLOT_TO_BLOCK = [...initialHotbarSlots];
...
14418            let selectedBlockId = GRASS;
14419            let currentHotbarSlot = 1; // Track current hotbar position (1-8)  ← stale comment; range is 1-9
```

Add alongside (net-new names — search-verified as unused; per CLAUDE.md, re-search before declaring):

```js
let magicMode = false;              // false = blocks, true = spells
let currentSpellSlot = 1;           // 1..9, mirrors currentHotbarSlot
let selectedSpellId = SPELL_EXPLOSION;
const HOTBAR_SLOT_TO_SPELL = [      // parallel to HOTBAR_SLOT_TO_BLOCK
  SPELL_EXPLOSION, SPELL_LASER, SPELL_FIRE, SPELL_FREEZE,
  SPELL_NONE, SPELL_NONE, SPELL_NONE, SPELL_NONE, SPELL_NONE,
];
```

### 3.2 Spell registry (data model)

Mirrors the data-driven `BLOCK_CONFIG` pattern (~line 4660). One source of truth for hotbar, inventory, icons, and dispatch:

```js
const SPELL_NONE = 0, SPELL_EXPLOSION = 1, SPELL_LASER = 2,
      SPELL_FIRE = 3, SPELL_FREEZE = 4;

const SPELL_CONFIG = [
  { id: SPELL_EXPLOSION, key: "explosion", name: "Explosion",
    delivery: "instant-point", color: 0xff7a2a, tileIndex: TILE.ICON_EXPLOSION,
    params: { radius: 4, ignite: true, knockback: 6 },
    cast: castExplosion, castSecondary: null },
  { id: SPELL_LASER, key: "laser", name: "Laser",
    delivery: "instant-beam", color: 0x44e0ff, tileIndex: TILE.ICON_LASER,
    params: { range: 24, boreRadius: 0.6, beamMs: 140 },
    cast: castLaser, castSecondary: null },
  { id: SPELL_FIRE, key: "fire", name: "Fireball",
    delivery: "projectile", color: 0xff5520, tileIndex: TILE.FIRE_FREE_0, // reuse fire frame 0
    params: { speed: 22, gravity: 8, burstRadius: 2 },
    cast: castFireball, castSecondary: null },
  { id: SPELL_FREEZE, key: "freeze", name: "Freeze",
    delivery: "cone", color: 0x9fe8ff, tileIndex: TILE.ICON_FREEZE,
    params: { range: 8, halfAngleDeg: 28, surfaceFreeze: true },
    cast: castFreeze, castSecondary: null },
];
const SPELL_BY_ID = {}; for (const s of SPELL_CONFIG) SPELL_BY_ID[s.id] = s;
```

`tileIndex` (not `icon: string`) is the Rev 2 change: because icons live in the atlas, every existing icon-rendering path works unchanged (§4.3).

---

## 4. Input & UI integration

### 4.1 The M toggle

Key handling is a two-tier system (verified, ~line 45844):

```js
45844            const KEY_BINDINGS = {
45845                forward: ["KeyW", "ArrowUp"],
                     /* … */
45852                torch: ["KeyF"],
45853                view: ["KeyV"],
                     /* … */
45856            };
45857            /** @type {Object<string, {type: string, index?: number}>} code -> action lookup (built once) */
45858            const CODE_TO_ACTION = {};
45859            for (const actionType in KEY_BINDINGS) {
45860                for (const code of KEY_BINDINGS[actionType]) {
45861                    CODE_TO_ACTION[code] = { type: actionType };
45862                }
45863            }
45864            for (let d = 1; d <= 9; d++) {
45865                CODE_TO_ACTION["Digit" + d] = { type: "hotbar", index: d };
45866            }
```

Only **E** (inventory) is a one-off `if` block that runs *before* the gameplay gate (~45977, works while unlocked). **F** (torch) is a normal `KEY_BINDINGS` entry dispatched via the switch, *behind* the gate:

```js
45987                // 2. Game-Only Keys (Blocked if in Menu)
45988                if (!isGameplayActive()) return;
45989                if (event.repeat) return;
45990                const action = CODE_TO_ACTION[event.code];
45991                if (!action) return;
45992                switch (action.type) {
                     /* … movement cases … */
46000                    case "hotbar": selectHotbarSlot(action.index); break;
                     /* … */
46011                    case "torch": toggleTorch(); break;
46012                    case "view": toggleThirdPerson(); break;
46013                }
```

**Plan:** follow the **F pattern** — magic toggling is a gameplay action, and this gets `isGameplayActive()` + `!event.repeat` gating for free:

1. `magic: ["KeyM"]` added to `KEY_BINDINGS` ("KeyM" verified unused in the file).
2. `case "magic": toggleMagicMode(); break;` added to the switch.
3. `toggleMagicMode()` is a **shared action function** (like `toggleTorch` ~46375) so the touch button wires to the identical function (§4.7):

```js
function toggleMagicMode() {
  magicMode = !magicMode;
  document.body.classList.toggle("magic-mode", magicMode);
  refreshHotbarForMode();             // re-skin 9 slots + highlight (§4.3)
  updateActiveSelectionDisplay();     // block name OR spell name (§4.6)
  uiManager.showToast(magicMode ? "Magic mode" : "Block mode", "info");
  if (uiManager.isInventoryOpen()) {  // live-swap an open inventory
    uiManager.populateInventory();
    uiManager.populateInventoryHotbar();
  }
  stopMining();                       // never carry a half-mined block across modes
}
```

Update the comment at ~45842 (the global one-off list) only if M were global — it isn't, so no change there. The Controls menu static display gains one row (M — Toggle Magic).

### 4.2 Hotbar selection & scroll

The live functions are small and clean (verified, ~line 46393):

```js
46393            function selectHotbarSlot(n) {
46394                if (n < 1 || n > 9) return;
46395                selectedBlockId = HOTBAR_SLOT_TO_BLOCK[n - 1];
46396                currentHotbarSlot = n;
46397                highlightSlot(n);
46398                updateHeldBlock(selectedBlockId);
46399            }
                 /* … */
46405            function cycleHotbar(dir) {
46406                currentHotbarSlot = nextHotbarSlot(currentHotbarSlot, dir);
46407                selectedBlockId = HOTBAR_SLOT_TO_BLOCK[currentHotbarSlot - 1];
46408                highlightSlot(currentHotbarSlot);
46409                updateHeldBlock(selectedBlockId);
46410            }
```

Both are **already the single funnel** for every input source: number keys (`case "hotbar"`, 46000), scroll wheel (`onMouseWheel` ~46152 → `cycleHotbar(±1)`), and **touch hotbar swipe** (~46859 also calls `cycleHotbar`). That means the thin-router refactor covers keyboard, mouse, and touch in one place:

```js
function selectHotbarSlot(n) {
  if (magicMode) return selectSpellSlot(n);
  /* existing body unchanged */
}
function cycleHotbar(dir) {
  if (magicMode) return cycleSpellSlot(dir);
  /* existing body unchanged */
}
```

`selectSpellSlot` / `cycleSpellSlot` mirror the block versions: write `currentSpellSlot`/`selectedSpellId` from `HOTBAR_SLOT_TO_SPELL`, reuse `highlightSlot(n)` and `nextHotbarSlot` (~46490, pure 1-9 wrap — reusable as-is), call `updateActiveSelectionDisplay()`. They do **not** call `updateHeldBlock` — see the viewmodel note in §4.6.

### 4.3 Hotbar rendering — icons as atlas tiles

`setSlotIcon` positions the shared atlas strip as a CSS background (verified, ~line 32809):

```js
32809                function setSlotIcon(slotId, tileIndex) {
                     /* … */
32814                    const slotSize = 52;
32815                    const backgroundWidth = NUM_TILES * slotSize;
32816                    const xPos = tileIndex * slotSize;
32817                    slot.style.backgroundImage = `url(${atlasURL})`;
                     /* … */
32822                }
```

**Because it takes a bare `tileIndex`, spell icons drawn into the atlas need zero new icon plumbing** — hotbar slots, inventory grid cells, and inventory-hotbar cells all render from atlas backgrounds today. So:

- Add 3 icon tiles: `TILE.ICON_EXPLOSION`, `TILE.ICON_LASER`, `TILE.ICON_FREEZE` (fireball reuses `TILE.FIRE_FREE_0` = 18). With `TILE.ICE` (§5) that's `NUM_TILES` 33 → **37** — bump **both** copies (main ~4640, worker ~19005) and update `tools/voxex-texture-tests.html`.
- Draw them in `initTextures` as 16×16 pixel art like every block tile (starburst / beam / snowflake-of-squares; no circles). The glass tile generator (~31480) is the pattern to copy: a `logicalFillsize += TILE_SIZE` block with `fillLogicalPixel` calls.
- Icon tiles are never meshed — they're inert atlas columns. Harmless to the mesher; the texture tests' per-tile checks need entries for them.

`refreshHotbarForMode()` then re-skins the nine `#slot-N` via the existing `setSlotIcon`, from `HOTBAR_SLOT_TO_BLOCK`+`BLOCK_BY_ID[..].ui.tileIndex` (block mode — same lookup as the init loop at ~32824) or `HOTBAR_SLOT_TO_SPELL`+`SPELL_BY_ID[..].tileIndex` (magic mode), and re-applies `highlightSlot(magicMode ? currentSpellSlot : currentHotbarSlot)`.

### 4.4 Inventory

`UIManager.populateInventory()` (~9824) renders `this.blockTypes` into grid cells whose `dataset.blockId` drives selection; `populateInventoryHotbar()` (~9855) renders `this.hotbarSlots`. Both branch at the top in magic mode to render `SPELL_CONFIG` / the spell hotbar instead (cell `dataset.spellId`, atlas background from `tileIndex`, name label from `spell.name`).

The write-back path is callback-based and **registered once**, so mode-awareness lives inside the callbacks, not the registration. The live wiring (verified, ~line 32837):

```js
32837                uiManager.setHotbarChangeCallback((slotIndex, blockId) => {
32838                    // Update the HOTBAR_SLOT_TO_BLOCK array
32839                    HOTBAR_SLOT_TO_BLOCK[slotIndex] = blockId;
                     /* … setSlotIcon + selectedBlockId sync + name display … */
32851                });
                 /* … */
32854                uiManager.setInventorySelectCallback((blockId) => {
32855                    selectedBlockId = blockId;
                     /* … */
32858                });
```

In magic mode these route to `HOTBAR_SLOT_TO_SPELL[slotIndex] = spellId` / `selectedSpellId = spellId` and skin via `SPELL_BY_ID`. All four inventory input paths (drag-drop ~9933, click-select ~9949, touch tap-to-assign, pointer-drag ~9960-10042) already converge on these two callbacks, so no per-path work is needed. `UIManager` needs one parallel state field (`this.spellHotbarSlots`) mirroring `this.hotbarSlots` so `populateInventoryHotbar`/`updateInventoryHotbarSlot` can render the right mode.

### 4.5 Casting (desktop mouse) & suppressing build actions

The live click path (verified, ~line 46089) has three things the magic branch must sit **in front of**: melee priority, instant fire-extinguish, and mine/place:

```js
46089            function onMouseClick(e) {
46090                if (touchModeActive) return; // taps drive mine/place via pointer events
46091                if (!isGameplayActive()) return;
                     /* pickVoxel → melee check → FIRE extinguish → breakingBlock / tryPlaceBlock */
```

Magic branch, first thing after the gates:

```js
if (magicMode) {
  if (e.button === 0) castSpell(selectedSpellId, "primary");
  else if (e.button === 2) castSpell(selectedSpellId, "secondary");
  return; // skip melee, extinguish, mine, place entirely
}
```

Continuous actions are NOT in `onMouseClick` — they run per-frame in `animate()` off held flags (verified, ~45696-45740): `breakingBlock` progress, hold-to-mine restart off `leftMouseHeld` + `_highlightHasHit`, and hold-to-place repeat off `rightMouseHeld` + `placeRepeatTimer`. Since the magic branch returns before `leftMouseHeld`/`rightMouseHeld`/`breakingBlock` are ever set, **no `if (magicMode)` early-outs are needed in the animate loop** for desktop — the flags simply never arm. `toggleMagicMode()` calls `stopMining()` (~46411, clears `leftMouseHeld`/`breakingBlock`) to cover toggling mid-hold. Optional: hold-to-cast can reuse the same pattern later (a `castHeld` flag + the §10 interval), but v1 is click-per-cast.

`onMouseUp` (~46034) needs no change: `stopMining()` on a never-armed state is a no-op.

`castSpell(id, mode)` dispatches `SPELL_BY_ID[id].cast` / `.castSecondary` (null secondary = no-op), behind the §10 interval guard.

### 4.6 HUD

- **Name readout:** `highlightSlot` → `updateBlockNameDisplay(slotNumber)` (~9594) reads `this.hotbarSlots[slotNumber-1]` and writes `#block-name-display`. Add `updateActiveSelectionDisplay()` which, in magic mode, writes `SPELL_BY_ID[selectedSpellId].name` into the same element instead (simplest: `uiManager.updateBlockNameDisplay` grows a magic branch, since `highlightSlot` calls it unconditionally).
- **Viewmodel:** `selectHotbarSlot` drives the first-person held block via `updateHeldBlock(selectedBlockId)` (function ~36133). In magic mode, call `updateHeldBlock(AIR)` on toggle (empty hand); a wand/staff viewmodel is Phase 5 polish.
- **Mode badge:** small persistent `#mode-badge` ("✦ Magic") toggled by the `body.magic-mode` class already set in `toggleMagicMode()` — pure CSS, no per-frame cost.
- Optional: tint the crosshair to the active spell's `color`.
- New DOM IDs must exist in HTML and match JS (CLAUDE.md rule).

### 4.7 Touch integration (new in Rev 2)

Touch shipped after Rev 1 and has a fixed gesture grammar on the look region (verified):

```js
46637                // Gesture grammar is fixed: tap = place, hold = mine. …
```

Tap/hold classification (~46508 `classifyLookGesture`), hold starts mining by setting `leftMouseHeld` (~46615 `onLookHoldFired`), tap calls `touchPlaceBlock()` (~46623, mirrors right-click place). Buttons wire shared actions through one helper (verified, ~46774):

```js
46774            function wireTapButton(id, action, needGameplay = true) {
                     /* pointerdown → if (!touchModeActive) return; gameplay gate; action() */
46785            }
                 /* … */
46812                wireTapButton('touch-btn-torch', toggleTorch);
46813                wireTapButton('touch-btn-camera', toggleThirdPerson);
```

**Plan:**

1. **Toggle:** add `<button id="touch-btn-magic" class="touch-btn touch-btn-small">` to the `#touch-buttons` cluster (~2423) and `wireTapButton('touch-btn-magic', toggleMagicMode)` — identical shared-action pattern as torch, so keyboard M and the button cannot drift.
2. **Casting — proposed mapping (needs play-feel confirmation):** in magic mode the look-region gesture handlers branch:
   - **tap** → `castSpell(selectedSpellId, "primary")` (was: place),
   - **hold** → repeated primary casts at the §10 interval (was: mine) — i.e. `onLookHoldFired` sets a `castHeld` flag instead of `leftMouseHeld`, and a small per-frame block fires casts while it's held,
   - **secondary cast** → a `#touch-btn-cast2` button, shown only under `body.magic-mode` (CSS), wired via `wireTapButton('touch-btn-cast2', () => castSpell(selectedSpellId, "secondary"))`.
3. The branch points are `classifyLookGesture`'s consumers (`onTouchLookUp` ~46652) and `onLookHoldFired` — NOT new pointer listeners. Existing touch rules apply: every touch handler body starts with `if (!touchModeActive) return;`, no allocations/closures/logging in `pointermove`, gameplay gates via `isGameplayActive()` (CLAUDE.md checklist).
4. Hotbar swipe and inventory tap-to-assign already funnel through `cycleHotbar` and the UIManager callbacks (§4.2, §4.4) — magic-aware for free.

---

## 5. New block: ICE (FIRE already exists)

Rev 1 planned two new blocks. FIRE (16) shipped with the fire system, along with BURNT_LOG (17) and BURNT_PLANKS (18). **Only ICE is new.** Follow the documented "adding a block" path (CLAUDE.md §"When Modifying voxEx.html").

### 5.1 ICE block spec

Model directly on the live GLASS config (verified, ~line 4833):

```js
4833	                // GLASS
4834	                {
4835	                    id: GLASS,
                     /* … */
4841	                    tags: ["transparent", "collidable", "cullAdjacent"],
4842	                    textures: { all: TILE.GLASS },
4843	                    ui: { showInInventory: true, tileIndex: TILE.GLASS, defaultHotbar: true, hotbarOrder: 7 },
4844	                    lighting: { sunlightAttenuation: 0, blocklightAttenuation: 0 }, // light passes fully
4845	                },
```

ICE entry: `id: ICE (19)`, `tags: ["transparent", "collidable", "cullAdjacent"]`, `textures: { all: TILE.ICE }`, `lighting: { sunlightAttenuation: 1, blocklightAttenuation: 1 }` (frosted — dims 1/block instead of glass's 0; pick 0/0 if clear ice looks better in-game). The lookup tables populate automatically from tags: `initBlockLookupTables` (~11136) sets `BLOCK_IS_SOLID[ICE]=1` via `collidable`, `initBlockOptimization` (~30340) sets `IS_TRANSPARENT`/attenuations/`CULLS_SAME_ID` from tags + the `lighting` override.

**Rendering path decision (important, new in Rev 2):** GLASS is special-cased into a **separate blended-translucent per-chunk mesh** (`<cKey>_GLASS`, ~43240) and forces worker→main mesh re-routing (`hasGlass`, ~19614/20458). ICE should **not** copy that. Give ICE an alpha-cutout texture (opaque body pixels, `alphaTest` handles any holes) and it meshes into the **standard terrain buckets** like LEAVES — no separate mesh, no `hasGlass`-style routing, no depth-material work. Only if a *blended* translucent look is demanded later does the `_GLASS` pattern apply. This single decision removes the largest hidden cost in the Rev 1 block plan.

### 5.2 Checklist for adding ICE (+ the 3 icon tiles)

1. `const ICE = 19;` after BURNT_PLANKS (18); `UNLOADED_BLOCK = 255` stays last. Matching `ICE` const in the worker scope.
2. `TILE.ICE: 33`, `TILE.ICON_EXPLOSION: 34`, `TILE.ICON_LASER: 35`, `TILE.ICON_FREEZE: 36`; **`NUM_TILES` 33 → 37 in BOTH copies** (main ~4640, worker ~19005 — hand-maintained; `parity-check.mjs` P9 fails on mismatch, added 2026-07-07).
3. Texture generation in `initTextures`: ICE = pale-blue with square facets (copy the glass generator shape, ~31480); plus the 3 icon tiles. Add a `MAT_PROFILES`/roughness entry (~31678) — ICE low roughness like glass (`base: ~20-40`) for glints.
4. `BLOCK_CONFIG` entry per §5.1 — inventory/UV/transparency auto-derive.
5. **Worker parity (critical):** hand-maintained worker tables at ~19018-19038: add `IS_TRANSPARENT_WORKER[ICE] = 1;` and `CULLS_SAME_ID_WORKER[ICE] = 1;` (`AO_OCCLUDES_WORKER` derives automatically in the loop at ~19038). ICE is not terrain-generated, so injected `__TERRAIN_FUNCS_*`/`__TREE_FUNCS_*` need no change and `terrain-node-checks` is unaffected.
6. Do **NOT** add ICE to the worker's `hasTorchFire`/`hasGlass` re-route scan (~19614) or the main mesher's skip list (~42809) — standard terrain path per §5.1.
7. Update `tools/voxex-texture-tests.html` (tile count 37 + per-tile opacity/color checks for the 4 new tiles).

---

## 6. Spell delivery framework

Four delivery shapes: **instant point** (explosion), **instant beam** (laser), **projectile** (fireball), **cone** (freeze). All terrain changes converge on §8.

### 6.1 Targeting

Reuse `pickVoxel(origin, dir, range)` (DDA raycast, ~line 43970). Verified semantics that matter for spells:

- Returns `{ x, y, z, face }` on hit (`face` = frozen normal array like `[-1,0,0]`, or `null` for the start voxel) or `null` on miss/out-of-loaded-world.
- **Passes through AIR and WATER** (`if (id !== AIR && id !== WATER) return …`, ~43996). So explosion/laser target the first solid *under* water — a submerged carve works naturally. ICE, being non-AIR, **stops** the ray (freeze→then-laser interactions behave sanely).
- Returns `null` when the ray leaves loaded chunks — for "act at range" spells, fall back to `origin + dir * range`.

Origin = `getPlayerWorldPosition()`, direction = `controls.getDirection(_pickDirTmp)` (both used exactly this way in `onMouseClick` ~46092).

### 6.2 Projectile system (new, lightweight)

Verified: no projectile system exists; mobs are the only per-frame entities. Add a module-scope updater called from the entities block of `animate()` — the verified hook region:

```js
45788  updateZombies(clampedDt);                  // ← updateProjectiles(clampedDt) goes here
45790  if (isGameplayActive()) {
45791      fireSystem.update(clampedDt);
45792      updateFireAnimation(clampedDt);
45793      updateFireLOD(clampedDt);
45794  }
```

```js
const projectilePool = [];          // reuse: {pos, vel, gravity, life, mesh, light, onImpact}
const activeProjectiles = [];
const MAX_PROJECTILES = 12;
function updateProjectiles(dt) {
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const p = activeProjectiles[i];
    p.vel.y -= p.gravity * dt;
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
    if (p.light) p.light.position.copy(p.pos);
    spawnProjectileTrail(p);                     // particle emitter, budgeted
    p.life -= dt;
    const bid = getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z));
    if (BLOCK_IS_SOLID[bid] === 1 || hitsMob(p) || p.life <= 0) {
      p.onImpact(p);
      releaseProjectile(p); activeProjectiles.splice(i, 1);
    }
  }
}
```

- Block hit = `BLOCK_IS_SOLID[getBlock(...)]` (the same table collision uses). `hitsMob` reuses the existing mob-ray/proximity helpers the melee path uses (`pickMobAlongRay` / `damageMob`, ~46108-46114) rather than new entity code.
- Projectile mesh = small emissive `BoxGeometry` (voxel-correct). Pool everything (project pooling discipline); named function, no closures in the loop body (hot-path rules).
- Gate the whole update on `isGameplayActive()` alongside the fire block so projectiles freeze while paused.

### 6.3 Dynamic light for effects (corrected in Rev 2)

Two independent light budgets exist — Rev 1 conflated them:

- `const MAX_POINT_LIGHTS = 8;` (~7259) — the **real THREE.PointLight pool** (`torchLightPool`, `maxLights: 8`, 500 ms refresh interval, ~14130). `MAX_TOTAL_LIGHTS = 12` including sun/moon/ambient.
- `const MAX_POINT_LIGHTS = 4;` (~28807, locally scoped) — only the **volumetric god-ray shader's** uniform array size (`MAX_VOLUMETRIC_POINT_LIGHTS = 4` at ~44833 matches).

**Plan:** spell lights are short-lived `THREE.PointLight`s added **directly to the scene** (not the throttled pool), `castShadow = false`, hard cap ≤ 4 simultaneous, fade-and-remove in the same per-frame update that owns projectiles. This stays inside the 12-total budget worst-case (sun+moon+ambient+8 torch would exceed it with 4 more — in practice torch pool rarely saturates; if it does, spell lights steal the oldest spell light, never a torch). Spell lights do NOT register with the volumetric system (no god rays from casts — cheap and fine).

**Free glow:** fires the fireball starts feed the torch pool automatically — verified: `rebuildTorchPositions` pushes every `chunkFires` model into `torchPositions` (~14200) and the pool's movement-threshold early-return is disabled while fires exist (~14247). New fires glow within one 500 ms pool refresh with zero spell-side work.

### 6.4 Beam geometry (laser)

A glowing `BoxGeometry` scaled `(thin, thin, length)`, oriented along the view ray, `MeshLambertMaterial` with `emissive` = spell color (same approach as the torch flame/glow materials). Spawn for `beamMs`, fade opacity, release to a pool. No cylinders.

### 6.5 Audio

`AudioManager._playSimpleOsc(type, startFreq, endFreq, duration, volume)` (verified full body ~9155: oscillator + exponential pitch ramp + gain envelope). Public-method pattern to copy (verified ~9304):

```js
9304  playBlockPlace() {
9305      if (isDebug) this._callCounts.playBlockPlace++;
9306      if (!this.enabled) return;
9307      this.initContext();
9309      this._playSimpleOsc('triangle', 150, 80, 0.08, 0.4);  // wood-like thunk
9310  }
```

Add: `playExplosion()` (sawtooth 400→60, ~0.5 s, loud — optionally layer a second low osc), `playLaser()` (square 1200→700, ~0.15 s), `playFireball()` (triangle 300→150 whoosh at cast; the fire system's own crackle covers the aftermath), `playFreeze()` (sine 900→300 shimmer, ~0.3 s).

---

## 7. Spell catalog

### 7.1 Explosion — `castExplosion()`

- **Delivery:** instant. `pickVoxel` to the aim point; on `null`, `origin + dir * range` (range ≈ blockReach or slightly beyond).
- **Terrain:** carve a sphere `radius ≈ 4` to AIR via §8 (~270 blocks). Never carve BEDROCK.
- **Ignite:** set FIRE on a few surviving burnable crater-rim faces via `igniteFire()` (§7.3) — the shipped spread system takes it from there.
- **Knockback:** reuse the melee pattern — `pickMobAlongRay`-style proximity + `damageMob(target, dmg, kx, kz)` (verified API in `onMouseClick` ~46110) for mobs in radius; small player velocity kick if inside blast.
- **Visuals:** big square-particle burst (orange→smoke) + expanding square shock ring via `particleSystem.spawn(...)` (options bag verified ~15665: `vx/vy/vz, r/g/b/a, size, life, gravity, fadeOut, type`); one bright short-lived scene light (§6.3); ~150 ms camera shake.
- **Audio:** `playExplosion()`.

### 7.2 Laser — `castLaser()`

- **Delivery:** instant beam, `range ≈ 24`.
- **Terrain:** walk the ray (DDA like `pickVoxel`) carving a thin tube (`boreRadius ≈ 0.6` → center column + immediate cross-section neighbors) to AIR until bedrock/range. Because `pickVoxel` ignores WATER, the beam carves through/under water — accepted (§8.5 holes decision).
- **Visuals:** emissive beam box (§6.4) muzzle→first solid (or full range), square sparks + small impact light at the hit.
- **Audio:** `playLaser()`.
- Long beams cross up to ~3 chunks — bounded by §8's per-chunk batching.

### 7.3 Fire — `castFireball()` (integrates with the SHIPPED fire system)

- **Delivery:** projectile (§6.2), `speed ≈ 22`, `gravity ≈ 8`, emissive box + flame/smoke trail + following light.
- **On impact:** ignite up to `burstRadius ≈ 2` around the hit via a new `igniteFire(x, y, z)` helper. **The helper wraps the exact live ignition sequence** — verified, this trio is currently open-coded in `tryPlaceBlock` (~46075-46079) and `spreadFire` (~42083-42085):

```js
/** Ignite fire at (x,y,z) if the fire system's placement rules allow it. */
function igniteFire(x, y, z) {
  const cur = getBlock(x, y, z);
  if (cur !== AIR && cur !== FIRE) return false;                                  // same guard as tryPlaceBlock
  if (!hasFireSupport(x, y, z)) return false;                                     // ~41865: needs solid/burnable neighbor
  if (SETTINGS.fireWaterExtinguish && hasWaterNeighbor(x, y, z)) return false;    // won't sit next to water
  setBlock(x, y, z, FIRE);      // AIR→FIRE is mesh-neutral (verified ~26233) — no remesh cost
  fireSystem.register(x, y, z);
  addFireModel(x, y, z);        // idempotent; respects the per-chunk model cap
  return true;
}
```

  Refactor bonus: `tryPlaceBlock`'s FIRE branch can call this helper too (single-source the guards).
- **Everything downstream is already built and tuned:** 2 Hz tick, spread weighted UP (`_FIRE_SPREAD` ~42011), per-type `burnTime`/`spreadChance` from BLOCK_CONFIG, `fireSpreadBudget` = 4 new flames/tick, `fireMaxActive` = 128, charring via `BURN_RESULT` (LOG→BURNT_LOG, WOOD→BURNT_PLANKS, GRASS→DIRT, LEAVES→AIR), water extinguish, glow via torch pool (§6.3), particle/animation LOD. **No fire-system changes needed.**
- **Audio:** `playFireball()` at cast; the fire system covers burning SFX/FX.

### 7.4 Freeze — `castFreeze()`

- **Delivery:** cone, `range ≈ 8`, `halfAngle ≈ 28°`: iterate the AABB in front, keep blocks whose angle to view dir ≤ halfAngle and distance ≤ range.
- **Terrain:** WATER → ICE in the cone (+ optional thin ICE skin on exposed surfaces just below reach). Verified mechanics: the swap is **not light-neutral** (WATER attenuates 1/2, ICE per §5.1), so the facade `setBlock` automatically routes each swap through the `lightUpdateQueue` (~26241); and a band rebuild re-emits terrain + `_WATER` (+ `_GLASS`) meshes together (~42609), so both meshes update in one scheduled pass — **no special-case remesh code needed**, just §8's batching.
- **Bonus interaction (free):** placing ICE adjacent to fire douses it if the freeze path calls `extinguishFireNeighbors` — actually simpler: freeze can call `extinguishAt` (~42024) on any FIRE inside the cone. Cheap, delightful, uses shipped code.
- **Visuals:** pale-blue square frost particles, faint cold flash, crackle sparkles on frozen blocks. **Audio:** `playFreeze()`.
- **Polish (Phase 5):** slight slipperiness standing on ICE (movement friction is centralized).

---

## 8. Bulk terrain editing

### 8.1 What one `setBlock` actually costs (verified)

The facade `setBlock` (~26153) per call: chunk-key math, `chunkAutoSave.markModified`, `chunkDataPool.markDirtyForDisk`, `chunkNeighborCache.invalidate`, `invalidateCollisionGrid`, `invalidateFaceCache`, `invalidateSectionAnalysis`, shadow-silhouette check, then **either** (a) light-neutral path → `markChunkBanded` + `scheduleChunkUpdate(..., { bypassLighting: true, bands: bandMaskForY(y) })`, or (b) a job pushed to `lightUpdateQueue` (drained async with budget; its tracker schedules the remesh on completion). Verified relevant excerpt:

```js
26221                const lightNeutral =
26222                    getBlockEmission(oldId) === getBlockEmission(id) &&
26223                    SUNLIGHT_ATTENUATION[oldId] === SUNLIGHT_ATTENUATION[id] &&
                     /* … */
26233                    const meshNeutral = (oldId === AIR || oldId === FIRE) && (id === AIR || id === FIRE);
```

Notes that shape the plan:

- **Mesh scheduling self-coalesces.** `scheduleChunkUpdate` (~18620) ORs dirty reasons and band masks per chunk key — 270 facade calls produce at most a handful of distinct (chunk, band) rebuilds, not 270 meshes.
- **Lighting is the real per-block cost.** Carving STONE→AIR is never light-neutral, so a radius-4 sphere enqueues ~270 `lightUpdateQueue` jobs (each later running `updateSunlightAt` ~25937 + `updateBlockLightAt` ~26056). The queue is budgeted/async, so this *degrades* (light trickles in) rather than stalls — but it's redundant work (270 overlapping BFS floods for one crater).
- `setBlock` does **not** call `updateLocalArea` — seam-neighbor remeshes (~43935: edge/corner `scheduleChunkUpdate`s with band masks) are the caller's job for edits on chunk borders.

### 8.2 Two-stage plan (prototype-first, per repo discipline)

**Stage 1 — facade loop (Phase 2 ships with this):** loop facade `setBlock` over the shape, then ONE `updateLocalArea(x, y, z)` per touched chunk-boundary block cluster (or simply per touched chunk's center-of-edit). Measure with the perf overlay + `dumpLogs`. Radius ≤ 4 explosions and the laser tube may well be acceptable because mesh scheduling coalesces and lighting is async — **measure before building more** (agent-notes §4 discipline).

**Stage 2 — `bulkEdit(edits)` (build only if Stage 1 hitches):**

1. Write blocks via low-level `voxelWorld.setBlock(x, y, z, id)` (~7819 — verified: pure array write + section-analysis invalidation + modified-set tracking; **no** lighting/mesh/cache side effects).
2. Per touched chunk, replicate the facade's invalidation set ONCE: `chunkAutoSave.markModified`, `markDirtyForDisk`, `chunkNeighborCache.invalidate`, `invalidateCollisionGrid`, `invalidateFaceCache`, `invalidateSectionAnalysis`, `markChunkBanded`; `markShadowsDirty()` once overall.
3. Per touched chunk, run one bounded relight: for each edited **column**, one `updateSunlightAt(x, topY, z, oldId, AIR, tracker, /*primeColumn*/ true)` (priming re-floods the column, ~25948) + `updateBlockLightAt` only where emission/attenuation actually changed. The shared `tracker` marks lit chunks and its finalize schedules the remeshes — same machinery the queue path uses.
4. One `scheduleChunkUpdate(cx, cz, true, "spell", { immediate: true, bands: <OR of bandMaskForY(y) for all edited y> })` per touched chunk + seam neighbors when edits touch local x/z 0 or 15 (copy `updateLocalArea`'s edge/corner logic ~43952-43961).

This bounds work to "chunks × columns touched," not "blocks changed."

### 8.3 Shapes

- **Sphere** (explosion): iterate AABB, keep `dx²+dy²+dz² ≤ r²`.
- **Tube** (laser): DDA along the ray + cross-section neighbors within `boreRadius`.
- **Cone** (freeze): AABB in front, angle ≤ halfAngle, dist ≤ range.

Always skip BEDROCK and already-AIR targets. Skip UNLOADED_BLOCK (255) — never edit unloaded space.

### 8.4 Save / streaming

Verified: both facade and low-level paths land in persistence — facade calls `chunkAutoSave.markModified`/`markDirtyForDisk` directly; low-level `voxelWorld.setBlock` adds to `modifiedChunks`/clears `pristineChunks` (~7886), but the OPFS/auto-save marks are facade-side, which is why Stage 2 step 2 replicates them. Carves, ICE, and spell-placed FIRE all persist through save/load and chunk eviction like any player edit (FIRE cells re-register on re-mesh, verified ~43234-43235).

### 8.5 Water reality check (unchanged from Rev 1 — re-verified)

Water is static block IDs from `fillWaterPass` with a separate `_WATER` mesh; no flow/refill. Sub-sea carves leave permanent dry holes; water will not rush in. **Decision stands:** accept the holes this round; freeze (1:1 WATER→ICE swap) is unaffected. Water remains a planned major workstream.

---

## 9. Performance considerations

- **Per-frame:** projectiles + spell lights hook the existing entities block of `animate()` (§6.2); each O(active) with hard caps (12 projectiles, 4 spell lights). No new nested chunk loops in the frame path (≤2 nested loops rule).
- **Lighting:** Stage 1 relies on the budgeted async light queue; Stage 2 bounds relight to chunk/column granularity. Fire glow costs nothing new (torch pool, §6.3).
- **Fire:** all runaway-cost protection already shipped and tuned: `fireSpreadBudget` (4/tick), `fireMaxActive` (128), particle radius/emitter caps, animation LOD. The fireball adds zero new fire-side cost.
- **Particles:** reuse `ParticleSystem` (max 500, ~15559); spell bursts budget within the shared cap — emitters follow the `spawnBlockBreak` pattern (~15833) with a new `type`.
- **Pooling:** projectiles, spell lights, beam meshes pooled; named functions in hot paths; no allocations in `updateProjectiles`.
- **Meshing:** spell-edited chunks become banded and mesh on main (verified routing, §0) — identical to player-edit cost today; band masks keep rebuilds to affected Y-slices.

---

## 10. Free-form casting with a spam guard

No mana, no cooldowns. One global minimum interval between casts (~100 ms, `lastCastTime` check inside `castSpell`) so click-holds and touch hold-to-cast can't fire per-frame. This is a frame-rate guard, not balance; expose as `SETTINGS.spellCastIntervalMs` **only if** a setting is wanted — if so it needs a `DEFAULTS` entry, a real DOM ID, and round-trip (CLAUDE.md settings rules); otherwise keep it a const.

---

## 11. Worker-parity & lookup-table checklist (the things that silently break)

- [ ] `NUM_TILES` 33 → 37 in **both** copies (main ~4640, worker ~19005). Enforced by `parity-check.mjs` P9 (added 2026-07-07) — run it.
- [ ] `ICE` constant in **both** main and worker scopes.
- [ ] Worker tables (~19018-19038): `IS_TRANSPARENT_WORKER[ICE] = 1;`, `CULLS_SAME_ID_WORKER[ICE] = 1;` (AO derives). Do NOT touch the FIRE/TORCH/GLASS re-route scan for ICE.
- [ ] `BLOCK_CONFIG` ICE entry with tags per §5.1 — `initBlockLookupTables`/`initBlockOptimization` derive the rest.
- [ ] No terrain/tree function edits (ICE isn't generated) — `__TERRAIN_FUNCS_*`/`__TREE_FUNCS_*` markers untouched; `parity-check.mjs` green.
- [ ] Carves + ICE + spell-placed FIRE persist through save/load and chunk eviction (F5/F9 + walk-away-and-back test).
- [ ] New DOM IDs exist in HTML and match JS: `#mode-badge`, `#touch-btn-magic`, `#touch-btn-cast2`.
- [ ] Touch handlers: `if (!touchModeActive) return;` first line; no allocations/closures in `pointermove`; gates via `isGameplayActive()`.
- [ ] No duplicate/shadowed identifiers (search before declaring: `magicMode`, `SPELL_CONFIG`, `activeProjectiles`, `igniteFire`, …).
- [ ] New settings (if any) in `DEFAULTS`, wired, round-tripping.
- [ ] `VOXEX_BUILD` bumped + `VOXEX_RECENT_CHANGES` entry citing this doc/CCR. **No** `TERRAIN_GEN_VERSION`/`CURRENT_CACHE_VERSION` bump (no terrain output or lighting-semantics change — ICE is a new ID, not a changed one).
- [ ] Verification ladder: `syntax-check.mjs` → `parity-check.mjs` → `run-browser-tests.mjs` (315+ suite headless); `voxex-texture-tests.html` updated for 37 tiles; in-game eyeball for the visuals.

---

## 12. Phased implementation plan

**Phase 0 — Scaffolding (no gameplay change)**
Globals + `SPELL_CONFIG`/`SPELL_BY_ID`; icon tiles drawn (NUM_TILES 33→37, both copies, texture tests); `magic: ["KeyM"]` binding + `case "magic"` + `toggleMagicMode()`; hotbar routers (`selectHotbarSlot`/`cycleHotbar` → spell twins); inventory branches + callback routing; HUD badge + name display; `#touch-btn-magic`.
*Deliverable:* M (key or button) flips modes; spell hotbar scrolls/assigns on desktop AND touch; casting does nothing yet.

**Phase 1 — ICE + edit foundation**
ICE block per §5 (config, texture, worker parity). Stage-1 edit path (facade loop + `updateLocalArea`) wrapped in shape helpers (sphere/tube/cone) with debug console triggers; **measure** carve cost at r=4 and at chunk borders.
*Deliverable:* console-triggered sphere carve + water→ice conversions, correct and persistent; perf numbers recorded (decides whether Phase 5 includes Stage-2 `bulkEdit`).

**Phase 2 — Explosion & Laser (instant spells)**
`castExplosion` (carve + burst + light + shake + knockback + audio); `castLaser` (beam + tube carve + sparks + audio); desktop primary/secondary dispatch + spam guard.
*Deliverable:* two fully working destructive spells on desktop.

**Phase 3 — Projectiles, Fireball & Freeze**
Projectile system in `animate()` (§6.2); `castFireball` flight + `igniteFire()` impact seeding (fire system does the rest — formerly a whole blocked phase, now ~30 lines); `castFreeze` cone + WATER→ICE + fire-dousing + frost FX.
*Deliverable:* all four spells working on desktop.

**Phase 4 — Touch casting**
Look-region gesture branch (tap = primary, hold = repeat-primary), `#touch-btn-cast2` secondary button, mode-visibility CSS. Play-feel pass on the §4.7 mapping.
*Deliverable:* full magic parity on touch devices.

**Phase 5 — Polish & guardrails**
Stage-2 `bulkEdit` if Phase 1 numbers demand it; caps/tuning; screen-shake feel; optional ICE slipperiness; wand viewmodel; secondary-cast definitions; final checklist + build banner + docs pass (update this file's status, CLAUDE.md block table for ICE, agent-notes if lessons emerged).

---

## 13. Resolved decisions

1. **Spell icons:** ✅ Procedural **atlas tiles** (Rev 2 upgrade from "canvas icons" — zero new icon plumbing).
2. **Right-click / second touch button:** ✅ Reserved for per-spell secondary cast.
3. **Water holes:** ✅ Keep water as-is; accept permanent holes (re-verified §8.5).
4. **Fire:** ✅ Use the shipped fire system verbatim; fireball = ignition seeding via `igniteFire()`. All Rev 1 §7.5 open questions were answered by the fire implementation (see FireImplementation.md): orientation is neighbor-derived quads (`computeFireAttachment`), spread is budgeted 2 Hz, FIRE persists and re-registers on load/re-mesh, glow is dynamic-light-only.
5. **ICE rendering:** ✅ Cutout in the standard terrain mesh (LEAVES-style), NOT the `_GLASS` blended-mesh pattern (§5.1).
6. **M key pattern:** ✅ `KEY_BINDINGS` entry + shared `toggleMagicMode()` action (F-key pattern), touch button wired to the same function.

**Open (needs a decision before/during Phase 4):**
- **Touch cast mapping** (§4.7 proposal: tap = primary, hold = repeat-primary, button = secondary) — confirm by play-feel; alternative is tap = secondary / hold = primary to mirror tap-place/hold-mine semantics.
- **ICE attenuation** 1/1 (frosted) vs 0/0 (clear) — eyeball in-game, trivially changeable (but changing it AFTER ship = relight semantics change = `CURRENT_CACHE_VERSION` bump per CLAUDE.md).

---

## 14. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Worker parity drift (NUM_TILES / ICE tables) | Medium | NUM_TILES now parity-check-enforced (P9, 2026-07-07); ICE worker-table entries remain review-enforced (§11); texture-tests catch atlas off-by-one |
| Lighting hitches on big carves | Medium | Async budgeted light queue absorbs Stage 1; measure in Phase 1; Stage-2 `bulkEdit` is the designed escape hatch (§8.2) |
| Touch/desktop input divergence | Medium | Single funnels only: `toggleMagicMode`, `castSpell`, `selectHotbarSlot`/`cycleHotbar` routers — no per-path logic |
| Spell lights blow the light budget | Low-Medium | ≤4 spell lights, `castShadow=false`, scene-direct with self-eviction; volumetric system untouched (§6.3) |
| Fire runaway from multi-fireball spam | Low | Already governed by shipped `fireSpreadBudget`/`fireMaxActive`; spam guard (§10) limits seeding rate |
| Mid-mine / mid-hold mode toggle leaves stuck state | Low | `toggleMagicMode()` calls `stopMining()`; magic branch returns before held flags arm (§4.5) |
| Water holes (accepted) | Low | Locked decision; freeze unaffected; future water workstream |

---

## 15. As-built summary (Phase 5 closeout)

Written after all 5 phases landed on `ccr/magic-system`. Covers what was actually built, where it deviates from §1-§14's literal text, and what Phase 5 explicitly did not build. Full per-phase detail lives in the `VOXEX_RECENT_CHANGES` banner entries in `voxEx.html` (grep `MAGIC SYSTEM PHASE`); this section is the condensed, doc-form version.

### 15.1 Per-phase summary

- **Phase 0 (build `.97`) — scaffolding.** `magicMode` flag + `SPELL_CONFIG`/`SPELL_BY_ID` registry (4 spells; `cast`/`castSecondary` point at stub functions until Phase 2/3 fill in real bodies — needed so the top-level array literal doesn't throw at module load). 3 icon tiles drawn (`TILE.ICON_EXPLOSION/LASER/FREEZE`, NUM_TILES 33→36). `magic: ["KeyM"]` + `toggleMagicMode()` (shares the `toggleTorch()` pattern: re-skins hotbar, updates name display, empties held-block viewmodel, live-swaps an open inventory, calls `stopMining()`). `selectHotbarSlot`/`cycleHotbar` route to `selectSpellSlot`/`cycleSpellSlot` twins; `UIManager` gained a parallel `spellHotbarSlots` array + magic-mode branches in `populateInventory`/`populateInventoryHotbar` and both write-back callbacks. `#mode-badge` + `#touch-btn-magic`. Found in review: `openInventory()` wasn't calling `populateInventory()` (picker grid stayed in block mode after toggling); a stale `pendingAssignBlock` touch tap-to-assign field could leak a block ID into the spell hotbar array (spell IDs 1-4 numerically collide with low block IDs) — both fixed.
- **Phase 1 (build `.98`) — ICE + Stage-1 edit foundation.** ICE (id 19) modeled on GLASS but meshed through the standard cutout terrain path (LEAVES-style), never the `_GLASS` blended mesh. `TILE.ICE = 36`, NUM_TILES 36→37. Frosted lighting (`sunlightAttenuation: 1, blocklightAttenuation: 1`) locked in per §5.1/§13 rather than left open — see §15.3. Worker parity: `IS_TRANSPARENT_WORKER[ICE] = 1`, `CULLS_SAME_ID_WORKER[ICE] = 1` added to the real hand-maintained tables; confirmed absent from the `hasGlass`/`hasTorchFire` re-route scan (both by code trace and a test that regexes `buildChunkWorkerCode()`'s actual output). Three Stage-1 shape helpers shipped: `carveSphereEdit`, `carveTubeEdit`, `convertConeEdit`, plus a shared `shouldSkipShapeEdit` skip rule (BEDROCK/UNLOADED_BLOCK/already-at-target). Batching follows §8.2's permitted Stage-1 simplification: one `updateLocalArea()` per distinct touched chunk. Fixed in review: `carveTubeEdit`'s `boreRadius` measured literal Euclidean distance from the discrete stamp-voxel center, so any sub-1 `boreRadius` (including the laser's own default 0.6) degenerated to a 1-voxel-thin tube instead of "center column + immediate cross-section neighbors" — fixed by flooring the effective radius at 1. Nothing in this phase was reachable from real gameplay input (console-trigger only).
- **Phase 2 (build `.99`) — Explosion & Laser.** `castSpell(id, mode)` dispatcher behind `SPELL_CAST_INTERVAL_MS = 100` (plain const, not a `SETTINGS` entry, per §10's own stated preference). `onMouseClick` gained a magic-mode branch (left = primary, right = secondary) sitting before melee/fire-extinguish/mine/place; traced that `leftMouseHeld`/`rightMouseHeld`/`breakingBlock` never arm from this path, so no `animate()` changes were needed for desktop suppression. `igniteFire(x, y, z)` built verbatim per §7.3. Two new lightweight per-frame systems: `activeSpellLights` (scene-direct `THREE.PointLight`, `castShadow = false`, cap 4, oldest-eviction, no volumetric registration) and pooled `activeBeams` (cap 4), plus a new camera-shake mechanism (none existed before). `castExplosion` (carve + crater-rim ignition + knockback/damage + burst + light + shake + audio); `castLaser` (tube carve + beam + sparks + light + audio). Two bugs caught and fixed before commit: (a) `igniteCraterRim` originally sampled one block *inside* the carved sphere boundary — already-AIR everywhere for any radius ≥ 2 — fixed by sampling AT the boundary instead; (b) see §15.2 knockback frame-of-reference bug.
- **Phase 3 (build `.100`) — Projectiles, Fireball, Freeze.** `activeProjectiles` pool (cap `MAX_PROJECTILES = 12`), gravity arc, budgeted trail particles, terminates on solid-block hit / mob-proximity hit / expiry, hooked into `animate()`'s existing `isGameplayActive()` block. `castFireball` spawns a projectile; on impact, `igniteFireballBurst` scans a small cube around the impact point for AIR-with-burnable-neighbor cells and calls `igniteFire` on a handful. `castFreeze` calls `convertConeEdit(..., ICE, id => id === WATER)` plus a new `extinguishFireInCone` pass over the same cone geometry (calls the real `extinguishAt` on any FIRE inside). Two deviations made by the coordinator before commit, both Fable-reviewed: see §15.2.
- **Phase 4 (build `.101`) — touch casting.** Built entirely on the pre-existing gesture system (`classifyLookGesture`, `wireTapButton`) — no new touch plumbing, only new branches in existing functions. `#touch-btn-cast2` (CSS-gated to `body.magic-mode`, no new JS state) wired to `castSpell(selectedSpellId, "secondary")`. Tap→primary-cast branch added inside `touchPlaceBlock()` — see §15.2 for why not at the `onTouchLookUp` dispatch site. Hold→repeated-primary-casts via a new `castHeld` flag (set instead of `leftMouseHeld` in `onLookHoldFired` when `magicMode`), consumed by a per-frame check in `animate()` that relies entirely on `castSpell`'s existing spam guard (no new timer). Release is centralized inside the existing `stopMining()` (every reset path — desktop mouse-up, mode toggle, touch blur/cancel/pause, inventory-open — already funnels through it). Touch mapping shipped exactly per §4.7's proposed default (tap = primary, hold = repeat-primary, button = secondary) — this remains the §13 OPEN decision, unconfirmed by real-device play-feel (this build environment cannot playtest touch feel).
- **Phase 5 (this pass) — polish, guardrails, docs.** See §15.4 (final checklist) and §15.5 (skipped items) below; ICE slipperiness is the one item actually built — see §15.3.

### 15.2 Concrete deviations from this doc's literal text

- **Tile-index resequencing (Phase 0/1).** §12 and §5.2 write the new tiles as a single batch landing at fixed indices (33/34/35/36, NUM_TILES→37 in one step). Because Phase 0 shipped before Phase 1, it claimed indices 33-35 for the three spell icons first; Phase 1 then appended `TILE.ICE = 36`. Net result is the same (NUM_TILES 33→37, all four tiles exist), but the ICE tile is index 36, not 33 as a literal reading of §5.2 step 2 would suggest. Established pattern for future multi-phase atlas work: each phase claims the next open indices rather than reserving indices a later phase hasn't landed yet.
- **`findMobNear` vs `pickMobAlongRay` (Phase 3, §6.2).** The CCR's projectile pseudocode calls a `hitsMob(p)` that "reuses the existing mob-ray/proximity helpers the melee path uses (`pickMobAlongRay` / `damageMob`)." The shipped `hitsMob` uses a new proximity check (`findMobNear`) instead of a ray cast, because a projectile already has a discrete position every frame — no ray needs re-deriving from an origin+direction the projectile doesn't carry. `damageMob` is still used for the actual hit (Explosion only — see next bullet for Fireball).
- **Fireball mob-damage removed (Phase 3, §7.3).** The first draft had a direct projectile-mob hit call `damageMob` (HP damage + knockback), reasoning that `hitsMob`+`damageMob` being part of the shared §6.2 framework implied it applied to every spell. Removed before commit as unspecified scope creep: §7.3's prose covers ignite-on-impact only, unlike Explosion's §7.1, which explicitly specifies mob damage + knockback. A direct fireball hit still correctly ends the projectile's flight (it ignites at the mob's position) but deals no HP damage. This is a deliberate, reviewable design gap, not an oversight — revisit only with an explicit decision to add fireball damage.
- **Player-knockback frame-of-reference bug (Phase 2, §7.1).** `velocity.x`/`velocity.z` are INPUT-space (camera-relative) — `applyCollisionStep` expands them through a movement basis before applying world displacement. The first draft added a WORLD-space radial push vector directly into `velocity.x`/`z`, which only looked correct facing north and was actually inverted (pushed the player INTO the blast) facing south, sideways facing east/west. Fixed by extracting the physics step's basis computation into a shared `computeMovementBasis()` (previously inlined only in `applyCollisionStep`) and projecting the world-space push through it before adding to velocity. Mob knockback (`damageMob`'s `kbX`/`kbZ`) was already correct (world-space, matching the existing melee call site) — only the NEW player-push code had the bug. See `docs/agent-notes.md` for the durable gotcha writeup.
- **Touch tap→cast branch site (Phase 4, §4.7).** §4.7 point 3 says the branch points are `classifyLookGesture`'s consumers (`onTouchLookUp`) — not new pointer listeners. The shipped code instead branches inside `touchPlaceBlock()` (called from `onTouchLookUp`'s `place` case), because `onTouchLookUp` has post-dispatch cleanup (`lookMining`/`lookPointerId`/`lookIsDrag` resets) that an early return at the dispatch site would skip, permanently sticking `lookPointerId` and eating the look region. `touchPlaceBlock()` has exactly one caller, so branching inside it is behaviorally identical to branching at the dispatch site and avoids the leak.
- **Separate projectile light budget (Phase 3, §6.3).** §6.3 caps "spell lights" at ≤4 and doesn't separately budget projectile lights. The first Phase 3 draft gave every in-flight projectile (up to 12) an always-visible light, stacking on top of Phase 2's 4-cap spell lights plus the real 8-light torch pool under cast spam — against the light-budget discipline §6.3 itself was written to respect (`MAX_POINT_LIGHTS = 8`, `MAX_TOTAL_LIGHTS = 12`). Fixed with a separate `MAX_PROJECTILE_LIGHTS = 3` cap, oldest-eviction (`litProjectiles` tracking array): every projectile still gets a mesh, only the light is gated, and an evicted-dark projectile stays dark for the rest of its flight by design.
- **Touch cast mapping shipped as the CCR's own proposed default, unconfirmed.** §13 lists the tap/hold/button mapping as an OPEN decision pending real-device play-feel confirmation, with an explicit alternative (tap = secondary / hold = primary) it does not rule out. Phase 4 shipped the proposed default as-is (tap = primary, hold = repeat-primary, button = secondary) because no phase in this build environment can play-test touch feel. This remains open — see §15.4.
- **ICE frosted (1/1) attenuation locked in, not left open.** §13 lists ICE attenuation (1/1 frosted vs 0/0 clear) as an open decision pending an in-game eyeball. Phase 1 picked frosted (1/1) and shipped it as a locked decision (code comment + `docs/agent-notes.md` entry) rather than leaving it open, specifically because flipping it AFTER further building on top is a relight-semantics change requiring a `CURRENT_CACHE_VERSION` bump — cheaper to pin the decision now and revisit deliberately than to leave it ambiguous through 4 more phases of dependent work. Still not yet eyeballed in-game.

### 15.3 ICE slipperiness (Phase 5) — built

Investigated per the Phase 5 scoping: player movement friction (`applyPlayerVelocity()`, grep anchor) turned out to be genuinely centralized — a single scalar `dampingFactor = Math.pow(0.00001, dt)` applied unconditionally to `velocity.x`/`velocity.z` every fixed physics step, with no pre-existing per-surface lookup precedent anywhere in the movement code (the only per-block-keyed movement-adjacent code found, `updateFootstepParticles`'s `blockBelow` check, drives particle color/type only, not physics). This qualified as the "clean, single-point hook" the CCR's Phase 5 note conditioned the attempt on, so it was built:

- New `ICE_DAMPING_BASE = 0.1` const (JSDoc'd, next to `applyPlayerVelocity`).
- In `applyPlayerVelocity`, the block directly below the feet is sampled (`Math.floor(camPos.y - playerEyeHeight - 0.01)`, matching `checkGround`'s own y-formula) whenever the player is grounded and not flying (`canJump && !isFlying`; `canJump` reflects the previous physics step's ground state — a one-step lag, same as the existing `isFalling`/`isJumping` reads, negligible in the continuous-contact steady state). If that block is ICE, `dampingFactor` uses `ICE_DAMPING_BASE` instead of the default `0.00001` — a much slower velocity decay (velocity retains ~10%/second on ICE vs ~0.001%/second normally), i.e., a multi-second slide instead of a near-instant stop.
- `getPlayerWorldPosition()`'s result (`camPos`) was hoisted to before the damping block (previously first computed after it, for the water/swim checks later in the same function) — a pure position read unaffected by anything mutated earlier in the function, so this reordering is behavior-preserving for everything else in `applyPlayerVelocity`.
- Not yet eyeballed in-game (this build environment is headless/no-GPU) — `ICE_DAMPING_BASE` is a reasonable shipped default, documented as needing a human feel-check, same treatment as ICE's frosted attenuation (§15.2).
- No new automated test: this is a physics-feel behavior with no existing headless physics-simulation harness to assert against; `run-browser-tests.mjs` (333/333) confirms no regression to existing movement/physics tests.

### 15.4 Final §11 checklist pass (against live code, this Phase 5 pass)

| §11 item | Status | Evidence |
|---|---|---|
| `NUM_TILES` 33→37 in both copies | ✅ Confirmed | `parity-check.mjs` P9: "both 37" |
| `ICE` constant in both main + worker scopes | ✅ Confirmed | `ICE = 19,` (main, BLOCK_CONFIG enum) and `const ICE = 19;` (worker template) |
| Worker tables `IS_TRANSPARENT_WORKER[ICE]`/`CULLS_SAME_ID_WORKER[ICE]`; FIRE/TORCH/GLASS re-route untouched for ICE | ✅ Confirmed | Both assignments present; `hasTorchFire`/`hasGlass` scan only tests `TORCH`/`FIRE`/`GLASS` |
| `BLOCK_CONFIG` ICE entry per §5.1 | ✅ Confirmed | tags `["transparent","collidable","cullAdjacent"]`, frosted lighting, standard-path comment in-line |
| No terrain/tree function edits; markers untouched | ✅ Confirmed | `parity-check.mjs` all 6 marker checks + P6/P8 green |
| Carves + ICE + spell-placed FIRE persist through save/load and chunk eviction | ⚠️ Partially confirmed by code; full session test needs hands-on | Code-level: `carveSphereEdit`/`carveTubeEdit`/`convertConeEdit` all call the facade `setBlock` (not the low-level bypass), so carves/ICE ride the standard `chunkAutoSave`/OPFS persistence path for free; a dedicated browser-suite test (`"Magic system: ICE persistence round-trip"`) round-trips an ICE-bearing chunk through `compressChunkData`/`decompressChunkData`. FIRE persistence is inherited, pre-existing Fire-system behavior (spell-placed FIRE is byte-identical to any other FIRE cell). NOT verified: a real F5/F9-quicksave-then-walk-away-and-back session in a live browser — needs the user's own hands-on confirmation |
| New DOM IDs exist and match JS: `#mode-badge`, `#touch-btn-magic`, `#touch-btn-cast2` | ✅ Confirmed | All three present in HTML with matching `wireTapButton`/`setActive` JS references |
| Touch handlers start `if (!touchModeActive) return;`; no allocations/closures in `pointermove`; gate via `isGameplayActive()` | ✅ Confirmed for magic-specific additions | `castHeld` per-frame check and `onLookHoldFired`/`touchPlaceBlock` branches add no new allocations; gameplay-gated via existing `isGameplayActive()` checks already in those call sites |
| No duplicate/shadowed identifiers | ✅ Confirmed | Single declarations verified for `magicMode`, `SPELL_CONFIG`, `activeProjectiles`, `igniteFire`, `toggleMagicMode`, `castHeld`, `ICE_DAMPING_BASE` |
| New settings (if any) in `DEFAULTS`, wired, round-tripping | N/A | No new settings added by design (`SPELL_CAST_INTERVAL_MS` stays a plain const per §10's own stated preference); confirmed no `SETTINGS.magic*`/`DEFAULTS.magic*` keys exist |
| `VOXEX_BUILD` bumped + `VOXEX_RECENT_CHANGES` entry; no `TERRAIN_GEN_VERSION`/`CURRENT_CACHE_VERSION` bump | ✅ Confirmed for all 5 phases (each bumped `VOXEX_BUILD` with its own banner entry, Phase 5's bump done by the coordinator as its closing task) | `VOXEX_BUILD` progression `.97`→`.98`→`.99`→`.100`→`.101`→`.102`; no `TERRAIN_GEN_VERSION`/`CURRENT_CACHE_VERSION` change across any phase |
| Verification ladder green | ✅ Confirmed | `syntax-check.mjs` GREEN, `parity-check.mjs` GREEN, `run-browser-tests.mjs` 333/333 GREEN (post-Phase-5-ICE-friction-change) |

Items needing the user's own hands-on confirmation before this CCR can be called fully verified (none of these are code defects — they are exactly the checks this build environment cannot perform, being headless/no-GPU): the F5/F9-then-walk-away persistence test above; ICE's frosted-vs-clear look in-game; camera shake feel; beam/spark/particle visuals; fireball arc/impact feel; freeze cone + fire-dousing feel; projectile light dimming after 3+ simultaneous fireballs; the touch tap/hold/button cast mapping by real-device feel (§13 OPEN decision); and now also ICE slipperiness feel (§15.3).

### 15.5 What Phase 5 explicitly did not build, and why

- **Stage-2 `bulkEdit` (§8.2 Stage 2).** Not built. This build environment has no GPU-accelerated rendering, so there is no way to measure real Stage-1 carve cost, and §8.1's own analysis argues Stage 1 is likely sufficient (mesh-scheduling coalesces per chunk/band; lighting is async-budgeted, not stalling). Building Stage 2 speculatively, with no measured need, would violate the project's own prototype-first/measure-before-you-build discipline. Deferred pending a real in-game measurement pass — not forgotten; §8.2 still describes the exact escape hatch to build if that measurement shows Stage 1 hitching.
- **Caps/tuning.** No changes to any existing cap or constant (`SPELL_CAST_INTERVAL_MS`, `MAX_PROJECTILES`, `MAX_PROJECTILE_LIGHTS`, the 4-cap on `activeSpellLights`/`activeBeams`, particle counts, carve radii, etc.) — same no-real-perf-data reasoning as Stage-2.
- **Screen-shake feel.** Camera shake already works (Phase 2); tuning its feel needs a human eyeballing a real render, not something to guess at blind in a headless environment.
- **Wand/staff viewmodel (§4.6).** Not built. Unlike every other visual element in this CCR — which the CCR's authors specified in enough detail to implement directly (dimensions, BoxGeometry shapes, materials) — §4.6 gives no concrete design for a wand/staff (no dimensions, no shape, no material). Inventing one from scratch would be unspecified scope creep. The first-person hand stays empty in magic mode (`updateHeldBlock(AIR)`, shipped Phase 0) until a real spec exists.
- **Secondary-cast definitions.** None added. Confirmed by grep: all 4 `SPELL_CONFIG` entries still have `castSecondary: null`. The CCR defines no concrete secondary-cast behavior for any spell anywhere in its text (§13 only establishes the architecture — right-click/`#touch-btn-cast2` reserved — not content), so none was invented.
- **ICE slipperiness.** Built — see §15.3 (the one Phase-5 item from §12's bullet that was NOT skipped).

---

*Phases 0-4 built and Phase 5 (polish/guardrails/docs) complete on `ccr/magic-system`, not yet merged to `main`. §1-§14 above remain the original Rev 2 design intent — re-grep anchors before trusting any excerpt or `~line NNNN` reference, per this doc's own rule. See §15 for the as-built record.*

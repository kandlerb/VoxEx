# CCR — Full Menu UI Overhaul (Layout / Space-Use / Landscape Mobile)

**ID:** VOXEX-CCR-UI-001
**Files:** `voxEx.html` (single-file rule honored for the game) **and** `index.html` (the launcher is a separate file — same as the shipped `CCR-launcher-system-exam-and-report`).
**Date:** 2026-06-29
**Status:** 🔴 Proposed
**GitHub:** (none yet — design-driven; supersedes the layout intent in `SETTINGS_MENU_CCR.md` and complements `CCR-menu-overlay-lag.md`)
**Reference build:** `2026-06-29.43`
**Visual source of truth:** `D:\Projects\voxex\ui-mockups.html` — an interactive, single-file mockup of all 8 screens with a Desktop / Mobile(landscape) toggle. It already contains the **exact target CSS idioms and markup patterns** in the live VoxEx palette. Open it side-by-side while implementing; each item below names the mockup screen to port.

**Scope:** Re-layout every menu/overlay screen to make better use of horizontal space on desktop and to work in **landscape** on mobile (VoxEx runs landscape on phones — see `recomputeTouchMode` / `body.touch-mode`). No gameplay, terrain, worker, lighting, or persistence logic changes. Colors, fonts, and "branding" are unchanged — this is layout + a small shared interaction library only.

> Line numbers below are from build `2026-06-29.43` and **drift** — grep the quoted anchor before editing and confirm the live markup before changing it.

> **Worker parity:** N/A — no terrain/mesh/worker-injected code is touched.
> **Single-file rule:** all `voxEx.html` CSS/HTML/JS stays in `voxEx.html`. Launcher changes stay in `index.html`. No new files (the mockup is a throwaway reference, not shipped).

---

## Design principles (the three notes that drive this CCR)

1. **Landscape, not portrait, on mobile.** Mobile menus must be compact *multi-column* layouts, NOT portrait single-column stacks. Target viewport ≈ 880×404. Reuse the existing `body.touch-mode` hook for the compact variant; do not add a portrait breakpoint.
2. **One consistent collapsible method everywhere.** Every place that stacks collapsible groups (Launcher test sections, Settings groups, Create-World option groups) uses the **same** technique: **two independent flex columns** (`display:flex; align-items:flex-start` with each column a `flex-direction:column` stack). Expanding a card only pushes cards **below it in its own column** — it never stretches its row-mate and never reflows items into the other column.
3. **Never use the two anti-patterns that caused the current jank:**
   - ❌ CSS multi-column (`columns: 2`) for collapsibles → expanding reflows items into the next column.
   - ❌ a 2-cell CSS grid row for collapsibles → expanding stretches the row-mate to match height.

---

## Summary

| # | Screen | File · anchor | Status | Core change |
|---|--------|---------------|--------|-------------|
| UI-000 | Shared pattern library | `voxEx.html` `<style>` + one JS handler | NEW | Add `.ui-twocol`/`.ui-col` independent-column pattern, `.ui-collapse` card + one delegated toggle, landscape rules |
| UI-001 | Launcher / system check | `index.html` `.container`, `#tests-*`, `#benchmark`, `#menu-dropdown` | Re-layout | Wide hero + GPU card; test groups become collapsed independent-column dropdowns; **keep** Dev-Tools + Docs menus |
| UI-002 | World Select (main menu) | `voxEx.html` `#seed-menu`, `#saved-worlds-container` | Re-layout | Left action rail + responsive world-card grid |
| UI-003 | Create World | `voxEx.html` `#create-world-panel`, `.panel-content` | Re-layout | Two panes: sticky preview/presets/info left, independent-column option groups right |
| UI-004 | Settings (hub + sub-panels) | `voxEx.html` `#settings-menu` + `#settings-*` panels, `toggleSettingsGroup` | Re-layout | Replace drill-down with sidebar + sub-tabs; groups → shared collapsible independent columns |
| UI-005 | Pause menu | `voxEx.html` `#main-pause-menu` | Re-layout | Two-column card in landscape so it isn't clipped top/bottom; desktop unchanged |
| UI-006 | Controls | `voxEx.html` `#controls-menu` | Re-layout | 3-column key reference grouped Movement / Actions / Interface |
| UI-007 | Inventory | `voxEx.html` `#inventory-overlay` / `#inventory-container` | Re-layout | Wider block grid + category tabs; widen grid in landscape |
| UI-008 | Manage World | `voxEx.html` `#world-manage-modal` | Re-layout | Two-column sections + isolated Danger Zone |

### Impact

- Desktop: far less vertical scrolling; the Launcher and Settings use the full width instead of a ~650px / ~380px column.
- Mobile: every screen is usable in landscape (the orientation VoxEx already enforces); no cramped portrait stacks.
- Consistency: one collapsible interaction across the whole app, so behavior is predictable and the perf footprint is uniform.
- No behavioral/gameplay change; all existing element IDs, settings bindings, and event handlers are preserved (this is a markup/CSS re-wrap, not a rewrite).

---

## UI-000 — Shared pattern library (do this FIRST; everything else depends on it)

**Location:** `voxEx.html` `<style>` block (grep anchor: `.category-btn {` ~1630 for a nearby insertion point) and one new delegated click handler near the existing `function toggleSettingsGroup` (grep: `function toggleSettingsGroup`).
**Why:** Notes 2 and 3 require a single reusable collapsible-in-independent-columns idiom. Defining it once keeps every screen consistent and lets the per-screen items below be pure markup re-wraps.
**Change:** Add these utility classes (verbatim from `ui-mockups.html`) once, then use them everywhere a collapsible stack appears:

```css
/* Independent two-column layout: expanding a card only affects cards BELOW it
   in the SAME column. NOT CSS columns (reflows) and NOT a grid row (stretches). */
.ui-twocol { display: flex; gap: 16px; align-items: flex-start; }
.ui-twocol > .ui-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }

/* Collapsible card: header click toggles .collapsed; chevron rotates. */
.ui-collapse { background: #222; border: 1px solid #444; border-radius: 9px; overflow: hidden; }
.ui-collapse > .ui-collapse-h { display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 12px 14px; cursor: pointer; user-select: none; font-weight: 600; }
.ui-collapse > .ui-collapse-b { padding: 4px 14px 12px; border-top: 1px solid #2a2a2a; }
.ui-collapse.collapsed > .ui-collapse-b { display: none; }
.ui-collapse .ui-chev { transition: transform .15s; color: #888; }
.ui-collapse.collapsed .ui-chev { transform: rotate(-90deg); }

/* Landscape / touch variant: VoxEx runs landscape on mobile. Keep multi-column,
   just narrower. Reuse the existing body.touch-mode hook (no portrait breakpoint). */
body.touch-mode .ui-twocol { gap: 12px; }  /* stays 2 columns; tighten only */
```

Add ONE delegated toggle (replaces the per-element `onclick="toggleSettingsGroup(...)"` pattern over time; can coexist with the old one during migration):

```js
// VOXEX-CCR-UI-001: single collapse handler for all .ui-collapse cards (launcher,
// settings, create-world). Header click toggles; clicks on an inner control
// (toggle switch / input) do NOT collapse.
document.addEventListener('click', (e) => {
  const ctrl = e.target.closest('input, select, button, .switch, label');
  if (ctrl) return;
  const h = e.target.closest('.ui-collapse-h');
  if (h) h.parentElement.classList.toggle('collapsed');
});
```

**Reference:** `ui-mockups.html` — search `.accgrid`, `.gcols`, `.colcards` (all three use exactly this `flex / align-items:flex-start` independent-column idiom) and `.acc` / `.gcard` (the collapse card).
**Verify:** add a throwaway pair of `.ui-collapse` cards in a `.ui-twocol`, confirm expanding the top-left card pushes only the bottom-left card down and leaves the right column untouched. Remove the throwaway.
**Safety:** grep `ui-twocol`, `ui-col`, `ui-collapse`, `ui-chev` first — confirm 0 existing hits (no collision). Do NOT delete `toggleSettingsGroup` yet — UI-004 migrates its call sites, then it can be removed in a follow-up.

---

## UI-001 — Launcher / system check (`index.html`)

**Location:** `index.html` — `.container` (~27, the 650px column), `#tests-critical` / `#tests-storage` / `#tests-optional` (~463-471), `#benchmark` (~473), the hamburger `.hamburger-menu` / `#menu-dropdown` (~401-429), `#play-btn` (~501), `#sysinfo-panel` (~483), `#diag-section` (~489).
**Why:** Today it's one long skinny scroll; sections are always-expanded and stack vertically. It must use width and scale as tests are added.
**Change:**
1. Widen `.container` from `max-width:650px` to a responsive wide shell (≈ `min(1180px, 100%)`), and lay out a **hero row** (left: VoxEx wordmark + protocol badge + Play button + "all required checks passed" pill; right: the GPU tier card built from the existing benchmark result) above the tests.
2. Convert `#tests-critical`, `#tests-storage`, `#tests-optional`, plus Benchmark detail, System Details (`#sysinfo-panel`) and Share Diagnostics (`#diag-section`) into `.ui-collapse` cards, **collapsed by default**, each header showing a status summary (e.g. `8 / 8 ✓`, `2 / 3 !`, `Score 2106`). Place them in a `.ui-twocol`. Keep the existing JS that fills `#detail-*`/`#icon-*` — only the wrapping markup changes.
3. **Keep Developer Tools + Documentation.** Preserve the `.hamburger-menu`/`#menu-dropdown` items (Voxel/Terrain/KeyFrame/Sound editors; README, Roadmap). Either keep the hamburger, or (preferred, per mockup) render them as two top-right dropdown buttons in the launcher header. The links/`href`s are unchanged.
**Reference:** `ui-mockups.html` → **Launcher** screen (header dropdowns, hero, `.acc` collapsed sections in `.acccol` columns).
**Verify:** run the launcher; all probes still populate and gate `#play-btn`; Dev-Tools and Docs links still open the right tools; expanding "Required Features" doesn't move the "Storage & Persistence" card. Check landscape width.

---

## UI-002 — World Select / main menu

**Location:** `voxEx.html` `#seed-menu` (~1929), `#btn-create-world` (~1933), `#saved-worlds-container` (~1937), `#storage-overview` (~1940), `#btn-load-start` (~1946), `#btn-settings-main` (~1949).
**Why:** Saved worlds are a single narrow capped-height list; lots of dead horizontal space.
**Change:** Split `#seed-menu` into a fixed left action rail (wordmark + tagline + Create New World + storage usage + Settings) and a right pane whose `#saved-worlds-container` becomes a responsive card **grid** (thumbnail, name, seed, size, Play/Manage). Preserve the IDs the world-list JS writes into. Landscape: rail + grid stay side-by-side (grid just fits fewer cards/row).
**Reference:** `ui-mockups.html` → **World Select**.
**Verify:** create/select/play/delete still work; selected-world highlight + `#btn-load-start` enable/disable preserved; `#total-storage-display` still updates.

---

## UI-003 — Create World

**Location:** `voxEx.html` `#create-world-panel` (~2009), `.panel-header` (~2010), `.panel-content` (~2014), `#world-preview-container` (~2016), `#preset-selector` (~2023), `#biome-selector` (~2047), the structure/terrain groups (~2051-2095), `.advanced-section`/`#advanced-toggle` (~2098).
**Why:** The whole form is crammed into one ~380px column.
**Change:** Make `.panel-content` a two-pane layout — **left** (sticky): preview canvas + preset grid + World Info (name/seed); **right**: the option groups (Biomes, Structures, Terrain, Advanced) wrapped as `.grp` inside a `.ui-twocol` so they flow into two independent columns. Keep `#world-preview-canvas`, every input ID, and `applyTerrainSettings` bindings intact. Convert the Advanced collapsible to a `.ui-collapse` for consistency. Landscape: keep both panes; right pane may drop to one column (`body.touch-mode .colcards { flex-direction: column }`).
**Reference:** `ui-mockups.html` → **Create World** (`.cw .cols`, `.colcards`/`.ccol`).
**Verify:** preview still updates live from inputs; preset buttons + biome toggles + sliders still drive world creation; Start/Back still work; nothing overflows in landscape.

---

## UI-004 — Settings (hub + ~20 sub-panels)  ← highest value, do after UI-000

**Location:** `voxEx.html` `#settings-menu` (~2451) and the `#settings-*` sub-panels (`#settings-graphics-lighting` ~2615, `#settings-graphics-materials`, `#settings-graphics-water`, `#settings-performance-*`, `#settings-gameplay-*`, `#settings-world-*`, `#settings-touch`), the `category-btn` navigation (grep: `class="menu-btn category-btn"`), `.settings-group` / `toggleSettingsGroup` (grep: `function toggleSettingsGroup`), `.setting-item`, `#settings-search`, `#settings-profiles` / `.profile-btn`.
**Why:** Navigation drills 3 levels deep through ~20 stacked panels; one tall column wastes the width. The user approved the mockup's cleaner arrangement.
**Change:**
1. Replace the **drill-down** (each category a `category-btn` that swaps a `.settings-panel` to `display:block`) with a persistent **left category sidebar** + **sub-tabs** + a content pane. The category/sub-tab buttons already exist (`#btn-settings-graphics`, `#btn-graphics-lighting`, …) — re-style them as sidebar/tab items and keep their existing show/hide handlers (they can still toggle which `.settings-panel` is visible; the panels just render inside the content pane instead of replacing the whole menu).
2. Pin `#settings-search` and the `#settings-profiles` chips (`.profile-btn`) at the top of the content pane.
3. Convert each `.settings-group` (Sun, Moon, Torch, Volumetric, Bloom, GI, …) to the shared `.ui-collapse` card and lay the groups out in a `.ui-twocol` (independent columns). Migrate the `onclick="toggleSettingsGroup(this, 'x')"` headers to the UI-000 delegated handler (keep the data-group hooks the save/restore code relies on).
4. Landscape/touch: sidebar stays (narrower); groups stay 2 columns.
**Cross-ref:** `CCR-menu-overlay-lag.md` / memory `voxex-menu-overlay-perf` — the current lag is `#blocker` `backdrop-filter: blur` + always-on `renderFrame` behind tall scrollable panels. The sidebar layout reduces panel height and count, but **keep an eye on the blur**: if scroll/expand still janks, gate the backdrop blur while a settings panel is open (out of scope here, but note it).
**Reference:** `ui-mockups.html` → **Settings** (`.set .nav`, `.subtabs`, `.gcols`/`.gcol`, `.gcard` collapse).
**Verify:** every setting still round-trips via save/load; profile chips (Perf/Balanced/Quality/Custom) still apply; search still filters; touch settings still survive profile switches; expanding a group doesn't shift any other group between columns.

---

## UI-005 — Pause menu (landscape fix)

**Location:** `voxEx.html` `#main-pause-menu` (~2428), `#pause-seed-display` (~2430), the save/load block (~2436-2452), `#btn-controls`/`#btn-settings` (~2453-2454), `#touch-pause-actions` (~2456), `#btn-quit` (~2462).
**Why:** In landscape the tall single-column card is clipped top and bottom.
**Change:** Wrap the card's children into two column groups so on mobile/landscape it renders as a **two-column** card (left: PAUSED + seed + Resume + save/load; right: Controls/Settings + the `#touch-pause-actions` quick grid + Quit) that fits the short height. Desktop stays the current vertical stack (use `display:contents` on the wrappers at desktop width so layout/order is unchanged). Make the pause backdrop scrollable as a safety net. Keep all button IDs and the touch-only quick-actions block.
**Reference:** `ui-mockups.html` → **Pause Menu** (`.pcard` with two `.pcol`, `.pcol{display:contents}` desktop → flex columns under `body.touch-mode`).
**Verify:** Resume/Save/Load/Controls/Settings/Quit all work; seed copy still works; in landscape nothing is clipped; desktop pause looks identical to today.

---

## UI-006 — Controls reference

**Location:** `voxEx.html` `#controls-menu` (~2464), the `.control-row` list (~2466-2481), `#btn-back-from-controls` (~2482).
**Why:** A tall single list wastes width.
**Change:** Lay the `.control-row` items into a 3-column reference grouped **Movement / Actions / Interface**. Landscape: 3 columns still fit; allow wrap to 2 if needed. Pure markup/CSS regroup — keys/labels unchanged (this remains a static display; rebinding UI is still out of scope).
**Reference:** `ui-mockups.html` → **Controls** (`.kcols`, `.kgroup`).
**Verify:** all current key rows present; Back returns to the pause menu.

---

## UI-007 — Inventory

**Location:** `voxEx.html` `#inventory-overlay` (~3812 region), `#inventory-container`, the inventory grid + hotbar markup, the touch close button.
**Why:** A cramped 6-column box with lots of empty overlay around it.
**Change:** Widen `#inventory-container`; render the block grid at 8 columns with optional category tabs (All / Natural / Building / Light) and a clearer hotbar row. Landscape: widen the grid (≈10 columns) to show more blocks without scrolling. Preserve drag-drop hooks, slot IDs, and the hotbar binding logic.
**Reference:** `ui-mockups.html` → **Inventory** (`.invpanel`, `.invgrid`, `.hbar`).
**Verify:** drag-to-hotbar, slot selection, and E/ESC close all still work; touch close button still shows in touch mode.

---

## UI-008 — Manage World modal

**Location:** `voxEx.html` `#world-manage-modal` (~1953), `.world-modal-content` (~1954), `.world-modal-section` blocks (Rename ~1960, Duplicate ~1968, Storage ~1976, Export/Import ~1993, Danger Zone ~2002).
**Why:** Sections stack in a single narrow column.
**Change:** Lay the sections in a two-column grid (Rename | Duplicate side-by-side; full-width Storage and Export/Import), with the Danger Zone visually isolated below. Landscape: the 680px modal fits as-is. Keep all input/button IDs and the storage-bar update hooks.
**Reference:** `ui-mockups.html` → **Manage World** (`.mmgrid`, `.mmsec`, `.danger`).
**Verify:** rename/duplicate/export/import/clear-cache all still work; storage bar + sizes still populate.

---

## Recommended rollout order

Do **UI-000 first** (the shared library), then ship screen-by-screen so each is independently testable and revertible:

1. **UI-000** shared patterns → 2. **UI-004 Settings** (highest value, exercises the pattern hardest) → 3. **UI-001 Launcher** (separate file, low risk) → 4. **UI-003 Create World** → 5. **UI-005 Pause** (landscape bug) → 6. **UI-002 World Select** → 7. **UI-006 Controls** → 8. **UI-007 Inventory** → 9. **UI-008 Manage World**.

Each screen is a self-contained markup/CSS re-wrap; bump the build banner and commit per screen.

---

## Safety Checks

- [ ] **UI-000 collisions:** grep `ui-twocol` / `ui-col` / `ui-collapse` / `ui-chev` → 0 hits before adding.
- [ ] **No anti-patterns:** no `columns: 2` (or any CSS multi-column) and no 2-cell grid used for a collapsible stack anywhere in the new markup (Note 3).
- [ ] **IDs preserved:** every element ID the existing JS reads/writes (settings inputs, `#saved-worlds-container`, `#world-preview-canvas`, pause buttons, inventory slots, modal inputs) still exists with the same ID after re-wrapping. Grep each ID post-edit.
- [ ] **Settings round-trip:** all settings still save/load; profiles apply; search filters; touch prefs survive profile switches (they're deliberately excluded from `SETTINGS_PROFILES`).
- [ ] **Landscape:** verify each screen at ~880×404 with `body.touch-mode` active — no clipping (esp. Pause UI-005), no portrait single-column fallback, no horizontal overflow.
- [ ] **Independent columns:** on Launcher, Settings, and Create-World, expanding one collapsible pushes only cards below it in the same column; the other column doesn't move and the row-mate doesn't stretch.
- [ ] **Dev Tools + Docs:** Launcher still exposes Voxel/Terrain/KeyFrame/Sound editors + README/Roadmap with correct `href`s.
- [ ] **Menu perf:** watch the `#blocker` `backdrop-filter: blur` + always-on `renderFrame` cost behind open panels (see `CCR-menu-overlay-lag.md`); if scroll/expand janks, gate the blur while a panel is open (follow-up CCR).
- [ ] **No shadowing** of globals (`scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`); the one new delegated listener doesn't double-fire with existing handlers.
- [ ] **Tests:** `tools/voxex-tests.html` (~204 tests) stays green (UI-only change should not affect them; confirms no accidental logic edits). Eyeball each screen on desktop + landscape.
- [ ] **Build banner:** bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` entry per screen shipped (cite `VOXEX-CCR-UI-001` + the UI-00x item).
- [ ] **Commit hygiene:** stage only `voxEx.html` (and `index.html` for UI-001) + this CCR; never `git add -A` (working tree carries unrelated EOL churn).

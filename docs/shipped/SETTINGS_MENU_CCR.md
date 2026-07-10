# CCR — Settings Menu: Reliable Scrolling + Inline Group Toggles + Full Wiring Audit

**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-17
**Status:** Proposal / report only — no code applied yet
**Scope:** (1) make settings menus scroll reliably across devices & input methods, (2) put a feature's on/off toggle on the same bar as its name + dropdown chevron, and (3) verify every setting, back button, and reset-to-default button is wired correctly.

---

## Audit revisions (self-review, 2026-06-17)

This CCR was audited against the source after the first draft. Corrections applied:

1. **Reset-All snippet (R1)** referenced non-existent `rebuildStarField()` / `rebuildCloudPlane()` — corrected to the real `createStarField(scene)` / `createCloudPlane(scene)` recreate pattern that the Sky reset actually uses (lines 29312–29317).
2. **Wheel gate (Issue #1):** confirmed `openInventory()` calls `exitGameplay()` (line **9436**), so the inventory unlocks the pointer. The original `!isGameplayActive()` gate would therefore have **stopped wheel hotbar-cycling while the inventory is open** — a regression. A blocker-visibility option (B) is now the recommendation.
3. **R3 (`shadowMapType`)** corrected: it *is* consumed at renderer init (line **26982**), so "no control consumes it" was wrong.
4. **Boot flow** clarified: `init()` (which attaches the wheel listener) runs at world-load (line **23955**), not page load.

All other line numbers, the navigation tree, the reset map, and the settings inventory were spot-checked and hold. The remaining helper names in R1 (`applyShadowSettings`, `applyShadowRenderDistance`, `applyWaterFastMode`, `refreshSkyFogColorsFromSettings`, `updateStarLayerVisibility`, `recomputeTouchMode`, `applyTouchControlSettings`, `markChunkSystemDirty`, `rebuildAllVisibleChunks`) were each verified to exist.

---

## Summary

- **Issue #1 (scrolling) has two independent root causes**, both confirmed in code:
  1. The global mouse-wheel handler (`onMouseWheel`, line **44256**) calls `event.preventDefault()` **unconditionally** and cycles the hotbar on *every* wheel event, with no check for whether a menu is open. Once the game engine has booted (in-game → pause → settings) the wheel can never scroll the menu. The listener attaches inside `init()`, which only runs when a world loads (line **23955**) — so settings reached from the *initial seed menu* scroll fine, while settings reached from the *in-game pause menu* have the wheel hijacked. That context-dependence is the "hit or miss" the report describes for the wheel specifically; the trackpad/tap inconsistency comes from root cause #2.
  2. There are **two nested scroll containers** (`#instructions` at line **1866** and every `.settings-panel` at line **1684**, plus a third overflow in the touch-mode block at line **251**). Nested scrollers let the browser pick which one to move based on pointer position / momentum / device, so touchpad, wheel, and tap all behave differently.
- **Issue #2 (inline toggles):** 15 expandable groups hide their master **"Enabled"** checkbox as the first row *inside* the collapsed body. Moving that checkbox up onto the `.settings-group-header` bar (keeping the same element `id`) lets the user flip the feature without expanding it, and requires **no JavaScript wiring changes**.
- **Wiring audit:** All ~150 controls round-trip through `SETTINGS` ⇄ LocalStorage. Every category button, back button, and reset button has a handler and targets the correct panel. **No broken navigation.** But the audit surfaced 6 real defects worth fixing (duplicate listeners firing handlers twice in-game; `Reset All` under-applies live side-effects; the reset-time UI-sync helper is incomplete; a `DEFAULTS`/`SETTINGS` key mismatch; a latent start-screen assumption in the Controls back button; and inconsistent persistence calls).

---

## Issue #1 — Settings menus don't scroll reliably

### Root cause A — the wheel handler eats all scrolling once the engine is running

**Location — line 44256:**

```js
const onMouseWheel = function (event) {
    if (touchModeActive) return; // touch uses hotbar taps/swipe instead of wheel
    event.preventDefault();

    // Scroll always changes hotbar slot (zoom is now on - and = keys)
    if (event.deltaY > 0) cycleHotbar(1);
    else if (event.deltaY < 0) cycleHotbar(-1);
};
```

Attached on `window` with `{ passive: false }` at **line 29341** (inside `init()`):

```js
window.addEventListener("wheel", onMouseWheel, { passive: false });
```

Because it's a `window` listener that always `preventDefault()`s, any wheel gesture anywhere — including over the open settings panel — is consumed and turned into a hotbar change. It is only gated by `touchModeActive`, never by "is a menu open?". `init()` — which attaches this listener — runs only when a world is loaded (`await init()` at line **23955**), not at page load. So settings opened from the **initial seed menu (before loading a world)** scroll fine via the wheel, while settings opened from the **in-game pause menu** have the wheel hijacked.

**Change — line 44256/44257 (add one guard line). Two options:**

***Option B (recommended) — gate on whether a blocking menu is open.*** The pause / settings / controls menus all live inside `#blocker`, so this precisely targets the reported problem and changes nothing about gameplay *or* the inventory:

```js
const onMouseWheel = function (event) {
    if (touchModeActive) return; // touch uses hotbar taps/swipe instead of wheel
    // Don't steal the wheel while a blocking menu (pause / settings / controls) is open.
    const blocker = document.getElementById("blocker");
    if (blocker && blocker.style.display !== "none") return;
    event.preventDefault();

    // Scroll always changes hotbar slot (zoom is now on - and = keys)
    if (event.deltaY > 0) cycleHotbar(1);
    else if (event.deltaY < 0) cycleHotbar(-1);
};
```

***Option A (simpler) — gate on gameplay focus:***

```js
    if (touchModeActive) return;
    if (!isGameplayActive()) return;   // pointer unlocked / no virtual focus → a menu is up
    event.preventDefault();
```

`isGameplayActive()` (defined at line **44337**) returns true only while the player is actively playing (pointer-lock on desktop OR `virtualGameplayFocus` on touch — see CLAUDE.md "Shared actions").

> ⚠ **Behavior trade-off (caught during audit):** `openInventory()` calls `exitGameplay("inventory")` (line **9436**), so while the inventory (E) is open `isGameplayActive()` is **false**. With **Option A** the wheel would stop cycling the hotbar while the inventory is open (it currently does). **Option B** keeps hotbar-cycling during gameplay *and* while the inventory is open — the inventory is `#inventory-overlay`, not `#blocker` — and only releases the wheel for the pause/settings/controls menus. **Recommend Option B.** Either way there is no change to in-game scrolling behavior (zoom is on `-`/`=`).

### Root cause B — nested scroll containers

`#instructions` is the menu card; every settings panel is a `.settings-panel` child of it. **Both** are scroll containers:

**Location — line 1684 (`.settings-panel` base):**

```css
.settings-panel {
    text-align: left;
    max-height: 70vh;
    overflow-y: auto;
    padding-right: 8px;
    scrollbar-width: thin;
    scrollbar-color: #555 #161616;
}
```

**Location — line 1866 (`#instructions`, responsive block at end of stylesheet):**

```css
#instructions {
    box-sizing: border-box;
    max-width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: #555 #161616;
}
```

**Location — line 251 (touch-mode adds a third overflow on the same children):**

```css
body.touch-mode .settings-panel,
body.touch-mode #main-pause-menu,
body.touch-mode #settings-menu,
body.touch-mode #controls-menu,
body.touch-mode #create-world-panel,
body.touch-mode #seed-menu {
    max-height: 100dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
}
```

`#settings-menu` *is* a `.settings-panel`, and `#main-pause-menu`/`#controls-menu`/`.settings-panel` are all children of `#instructions`. So the same content is wrapped by two (touch: three) scrollers. Whether the wheel/trackpad/finger scrolls the inner panel or the outer card depends on hit-testing and scroll chaining, which is exactly why it's inconsistent across devices.

**Fix — collapse to ONE scroll container (`#instructions`).** `#instructions` already clamps to the viewport and scrolls; make the inner panels *not* scroll so there's nothing to compete with. `#seed-menu` and `#create-world-panel` are separate top-level menus (not children of `#instructions`), so they keep their own scrolling and stay in the touch list.

**Change — line 1684 (remove the inner scroller; keep layout):**

```css
.settings-panel {
    text-align: left;
    padding-right: 8px;
    /* Scrolling is handled by the single #instructions container (see below).
       Removing max-height/overflow-y here eliminates the nested-scroll conflict
       that made wheel/trackpad/touch scrolling unreliable. */
}
```

> The `.settings-panel::-webkit-scrollbar*` rules at lines **1692–1704** become dead once the panel no longer scrolls. They are harmless to leave, but can be deleted for clarity (see Deletions).

**Change — line 1866 (make `#instructions` robust as the sole scroller — add 2 lines):**

```css
#instructions {
    box-sizing: border-box;
    max-width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;   /* don't chain scroll to the page/body */
    touch-action: pan-y;            /* reliable one-finger vertical scroll on touch */
    scrollbar-width: thin;
    scrollbar-color: #555 #161616;
}
```

**Change — line 251 (drop the `#instructions` children from the touch override so they don't re-introduce nested scrollers):**

```css
/* Only the top-level menus that are NOT inside #instructions keep their own
   scroll. #instructions itself (and its children: pause/controls/settings)
   scroll via the single #instructions container above. */
body.touch-mode #create-world-panel,
body.touch-mode #seed-menu {
    max-height: 100dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
}
```

### Things this is tied to (effects to consider)

- The scrollbar visual moves from the inner panel to the card edge (`#instructions` already styles it identically). The panel's `padding-right: 8px` (gutter for the old scrollbar) is now cosmetic only — safe to leave.
- `#instructions` is shared by the **pause menu** and **controls menu**; making it the sole scroller fixes those too (they had the same nesting on touch).
- The wheel-gate uses `isGameplayActive()`, which already governs every other gameplay/menu transition, so there's no new state to keep in sync.
- No change to `#seed-menu` / `#create-world-panel` behavior (they were never nested).

---

## Issue #2 — Put the on/off toggle on the bar with the name + dropdown

### How the groups are built today

Expandable groups use this shape (example: Volumetric Lighting, **line 2732**):

```html
<div class="settings-group" data-group="volumetric">
    <div class="settings-group-header collapsed" onclick="toggleSettingsGroup(this, 'volumetric')">
        <span>Volumetric Lighting</span><span class="chevron">⌄</span>
    </div>
    <div class="settings-group-content collapsed">
        <div class="setting-item">
            <label for="volumetric-toggle">Enabled</label>
            <input type="checkbox" id="volumetric-toggle" />
        </div>
        <div class="setting-item"> ...detail inputs... </div>
    </div>
</div>
```

The master **Enabled** toggle is the first row *inside* the collapsed body, so you must expand the group to reach it. The header (`.settings-group-header`, CSS at **line 1814**) is `display:flex; justify-content:space-between` with `onclick` → `toggleSettingsGroup()` (**line 3679**).

### Recommended approach — MOVE the existing toggle onto the header (no JS rewiring)

Keep the **same `id`** on the checkbox and just relocate it to the header. Because every listener and the `syncSettingsToUI()` sync use `getElementById(...)`, **nothing in the JS needs to change** — the control keeps working, the chevron still expands the detail inputs, and the user can flip it without expanding. The only new behavior needed is to stop a click on the checkbox from also toggling the group (since the header's `onclick` collapses/expands).

**Change — group header (example, line 2733):**

```html
<div class="settings-group-header collapsed" onclick="toggleSettingsGroup(this, 'volumetric')">
    <span>Volumetric Lighting</span>
    <span class="group-header-controls">
        <input type="checkbox" id="volumetric-toggle" onclick="event.stopPropagation()" />
        <span class="chevron">⌄</span>
    </span>
</div>
```

**Delete — the now-redundant inner "Enabled" row (lines 2737–2740):**

```html
<div class="setting-item">
    <label for="volumetric-toggle">Enabled</label>
    <input type="checkbox" id="volumetric-toggle" />
</div>
```

**Add — CSS for the header cluster (insert after line 1833, inside the `.settings-group-header` rules):**

```css
.settings-group-header .group-header-controls {
    display: flex;
    align-items: center;
    gap: 10px;
}
.settings-group-header .group-header-controls input[type="checkbox"] {
    margin: 0;
    flex: 0 0 auto;
}
```

`onclick="event.stopPropagation()"` keeps the toggle from triggering expand/collapse. The `change` listener on `#volumetric-toggle` is unaffected (it's bound by id and `change` doesn't route through the header `onclick`). Keyboard users can Tab to the checkbox and press Space without expanding the group.

### The 15 groups to update (each has a hidden master toggle)

| Panel | Group (header line) | Toggle id | Inner "Enabled" row to delete |
|---|---|---|---|
| Lighting | Volumetric Lighting (2733) | `volumetric-toggle` | 2737–2740 |
| Lighting | Global Illumination (2777) | `gi-toggle` | 2781–2784 |
| Lighting | Diffuse Lighting (2809) | `diffuse-toggle` | 2813–2816 |
| Lighting | Specular Lighting (2833) | `specular-toggle` | 2837–2840 |
| Water | Surface Refraction (2928) | `water-refraction-toggle` | 2933–2936 |
| Water | Ripple Effects (2946) | `water-ripples-toggle` | 2950–2953 |
| Water | Wading Effects (2996) | `water-wading-toggle` | 3001–3004 |
| Water | Splash Particles (3045) | `water-splash-toggle` | 3049–3052 |
| Water | Underwater Bubbles (3088) | `water-bubbles-toggle` | 3092–3095 |
| Water | Swimming Wake (3116) | `water-wake-toggle` | 3120–3123 ⚠ see note |
| Effects | Torch Particles (3155) | `torch-particles-enabled-toggle` | 3159–3162 |
| Effects | Block Break Particles (3222) | `block-break-enabled-toggle` | 3226–3229 |
| Effects | Footstep Particles (3250) | `footstep-enabled-toggle` | 3254–3257 |
| Sky | Stars (Night Sky) (3319) | `stars-toggle` | 3323–3326 |
| Sky | Clouds (3448) | `clouds-toggle` | 3452–3455 |

**⚠ Special case — Swimming Wake (group `water-wake`, lines 3115–3125):** its body contains *only* the Enabled toggle. After moving the toggle to the header the group would expand to an empty body. Convert it to a plain row instead of an expandable group:

**Delete (lines 3115–3125):**

```html
<div class="settings-group" data-group="water-wake">
    <div class="settings-group-header collapsed" onclick="toggleSettingsGroup(this, 'water-wake')">
        <span>Swimming Wake</span><span class="chevron">⌄</span>
    </div>
    <div class="settings-group-content collapsed">
        <div class="setting-item">
            <label for="water-wake-toggle">Enabled</label>
            <input type="checkbox" id="water-wake-toggle" checked />
        </div>
    </div>
</div>
```

**Add in its place (line 3115):**

```html
<div class="setting-item">
    <label for="water-wake-toggle">Swimming Wake</label>
    <input type="checkbox" id="water-wake-toggle" checked />
</div>
```

### When applying, note

- **Preserve each toggle's existing `checked` attribute** when moving it to the header. `diffuse-toggle`, `water-refraction-toggle`, `water-ripples-toggle`, `water-wading-toggle`, `water-splash-toggle`, `water-bubbles-toggle`, `water-wake-toggle`, `torch-particles-enabled-toggle`, `block-break-enabled-toggle`, `footstep-enabled-toggle`, `stars-toggle`, `clouds-toggle` carry `checked`; `volumetric-toggle` and `gi-toggle` do not. `syncSettingsToUI()` overwrites the state on open, but keep the markup faithful.
- Converting `water-wake` out of `.settings-group` removes it from the collapsed-state restore loop (line **3740**, `querySelectorAll('.settings-group[data-group]')`) — harmless (it simply won't be iterated), and any stale `voxex_collapsed_groups["water-wake"]` key in LocalStorage is ignored.

### Groups deliberately NOT changed

These collapsible groups have **no** master enable toggle (they're pure detail groups), so they keep just the chevron: **Sun** (2668), **Moon** (2684), **Torch** (2700), **Ambient** (2720), **Atmospheric Fog** (2764), **Basic Settings** / `water-basic` (2868), **Beer-Lambert Absorption** (2905), and the nested sub-groups **Smoke** (3164), **Flame** (3191), **Layer 1/2/3** (3333/3370/3407). Top-level toggles that are already visible (e.g. `particles-toggle` at 3149, `shadows-toggle` 2628, `ao-toggle` 2601, `color-grading-toggle` 3309, `biome-fog-toggle` 3313, zombie toggles 3136/3143) are not in groups and need no change.

### Things this is tied to (effects to consider)

- **No JS change required** because the `id` is preserved; the change listeners (`attachSettingsEventListeners()` ~22582, the legacy `init()` copies, and the reset handlers) and `syncSettingsToUI()` (22141) all bind by `getElementById`.
- The collapsed-state restore loop (**line 3740**) queries `.settings-group-header` / `.settings-group-content` by class and only toggles the `collapsed` class — moving an `<input>` into the header doesn't affect it.
- Visual: the toggle is 44×24px (CSS line 1744); the header padding is `10px 12px` (line 1818) so it fits without growing the bar.
- `toggleSettingsGroup()` (3679) persists collapse state to `voxex_collapsed_groups`; unaffected.

---

## Settings inventory + wiring status (every setting listed)

Verified that each control below has (a) a value in `SETTINGS` (declared ~lines 5771–6028), (b) a `DEFAULTS` entry (~6029–6274), (c) a `change`/`input` listener, and (d) a sync line in `syncSettingsToUI()` (22141) and the start-menu `initSettingsUI()` (6364). Persistence is whole-object JSON under LocalStorage key **`voxex_settings`** via `saveSettings()` (22115). ✅ = fully wired & round-trips.

### Performance › Rendering (panel line 2499)

| Control id | Type | Status |
|---|---|---|
| `dynamic-dist-toggle` | checkbox | ✅ |
| `render-dist-slider` | range | ✅ |
| `frustum-culling-toggle` | checkbox | ✅ |
| `lower-fps-slider` | range | ✅ |
| `upper-fps-slider` | range | ✅ |
| `pixel-ratio-slider` | range | ✅ |
| `volumetric-scale-slider` | range | ✅ |
| `caustic-scale-slider` | range | ✅ |

### Performance › Streaming (2537)

| Control id | Type | Status |
|---|---|---|
| `build-queue-slider` | range | ✅ |
| `pregen-dist-slider` | range | ✅ |
| `max-chunks-slider` | range | ✅ |
| `memory-budget-slider` | range | ✅ |
| `auto-memory-toggle` | checkbox | ✅ |
| `clear-cache-btn` | button (action) | ✅ action; not a stored setting |

### Performance › Workers (2567)

| Control id | Type | Status |
|---|---|---|
| `use-workers-toggle` | checkbox | ✅ (restart notice) |
| `use-workers-mesh-toggle` | checkbox | ✅ (restart notice) |
| `worker-pool-size-slider` | range | ✅ |

### Graphics › Visual (2598)

| Control id | Type | Status |
|---|---|---|
| `ao-toggle` | checkbox | ✅ (rebuilds chunks) |
| `smooth-lighting-toggle` | checkbox | ✅ (rebuilds chunks) |
| `texture-res-select` | select | ✅ (reload notice) |
| `antialiasing-toggle` | checkbox | ✅ (reload notice) |

### Graphics › Lighting (2625)

| Control id | Type | Status |
|---|---|---|
| `shadows-toggle` | checkbox | ✅ |
| `blocky-shadows-toggle` | checkbox | ✅ |
| `blocky-shadow-offset-input` | number | ✅ |
| `blocky-shadow-slope-input` | number | ✅ |
| `blocky-shadow-step-input` | number | ✅ |
| `blocky-torch-levels-input` | number | ✅ |
| `shadow-quality-select` | select → `shadowRenderDistance` | ✅ (parseInt) |
| `shadow-bias-input` | text | ✅ |
| `shadow-radius-input` | text | ✅ |
| `sun-color`, `sun-intensity-input` | color/text | ✅ |
| `moon-color`, `moon-intensity-input` | color/text | ✅ |
| `torch-color`, `torch-intensity-input`, `torch-range-input` | color/text | ✅ |
| `ambient-intensity-input` | text | ✅ |
| `volumetric-toggle` + density/decay/weight/samples/exposure | checkbox/text | ✅ (★ inline toggle) |
| `atmospheric-fog-density-input` | text | ✅ |
| `gi-toggle` + intensity/bounce-intensity/range/color-bleed/samples | checkbox/text | ✅ (★ inline toggle) |
| `diffuse-toggle` + intensity/wrap/softness | checkbox/text | ✅ (★ inline toggle) |
| `specular-toggle` + intensity/shininess/fresnel/roughness | checkbox/text | ✅ (★ inline toggle) |

### Graphics › Water (2864)

| Control id | Type | Status |
|---|---|---|
| `water-fast-toggle` | checkbox | ✅ |
| `water-color` | color | ✅ |
| `water-opacity-slider`, `water-fog-slider` | range | ✅ |
| `water-murk-density-slider`, `water-murk-max-slider`, `water-depth-scale-slider` | range | ✅ |
| `water-absorption-r/g/b-slider` | range | ✅ |
| `water-refraction-toggle` + `water-refraction-strength-slider` | checkbox/range | ✅ (★) |
| `water-ripples-toggle` + ripple color/opacity/scale/velocity-scale/expansion/lifespan + `water-ripple-segments-select` | mixed | ✅ (★) |
| `water-wading-toggle` + min-speed/cooldown/scale/expansion/lifespan/opacity/angle | mixed | ✅ (★) |
| `water-splash-toggle` + min/max/velocity-scale/size/gravity/column | mixed | ✅ (★) |
| `water-bubbles-toggle` + rate/size/rise | mixed | ✅ (★) |
| `water-wake-toggle` | checkbox | ✅ (★ → convert to plain row) |

### Graphics › Effects (3131)

| Control id | Type | Status |
|---|---|---|
| `zombie-vignette-toggle`, `zombie-vignette-intensity-slider`, `zombie-desaturation-toggle` | checkbox/range | ✅ |
| `particles-toggle` (master) | checkbox | ✅ |
| `torch-particles-enabled-toggle` + smoke (color/size/spawn-rate/decay) + flame (color/size/spawn-rate/decay) | mixed | ✅ (★ parent) |
| `block-break-enabled-toggle` + size/count/decay | checkbox/number | ✅ (★) |
| `footstep-enabled-toggle` + size/decay | checkbox/number | ✅ (★) |

### Graphics › Sky (3276)

| Control id | Type | Status |
|---|---|---|
| `sky-quality-select` | select | ✅ |
| `day-sky-top-color`, `day-sky-bottom-color`, `night-sky-top-color`, `night-sky-bottom-color` | color | ✅ |
| `color-grading-toggle`, `biome-fog-toggle` | checkbox | ✅ |
| `stars-toggle` + `star-layers-input` + Layer1/2/3 (color/count/size/brightness/twinkle/colorvar) | mixed | ✅ (★ parent) |
| `clouds-toggle` + clumping/height-range/speed/height/density/particle-size | checkbox/number | ✅ (★) |

### Gameplay › Movement (3502)

| Control id | Type | Status |
|---|---|---|
| `player-speed-slider`, `sprint-mult-slider`, `crouch-mult-slider`, `fly-mult-slider`, `jump-force-slider`, `gravity-slider` | range | ✅ |

### Gameplay › Camera (3532)

| Control id | Type | Status |
|---|---|---|
| `normal-fov-slider`, `sprint-fov-slider` | range | ✅ |

### Gameplay › Interaction (3546)

| Control id | Type | Status |
|---|---|---|
| `block-reach-slider` | range | ✅ |

### Touch Controls (3556)

| Control id | Type | Status |
|---|---|---|
| `touch-controls-select` | select | ✅ (excluded from profiles by design) |
| `touch-look-sens-slider`, `touch-joystick-size-slider`, `touch-button-scale-slider` | range | ✅ |
| `touch-left-handed-toggle` | checkbox | ✅ |

### World › Time (3592)

| Control id | Type | Status |
|---|---|---|
| `day-length-input` | number | ✅ |
| `btn-time-dawn` / `-noon` / `-dusk` / `-midnight` | buttons (action) | ✅ actions |

★ = master toggle eligible for the Issue #2 inline-toggle treatment.

---

## Navigation audit — category & back buttons

Navigation is data-driven: `navMappings` (lines **3756–3796**) is looped at **3803–3814** to wire every category/back button. Forward buttons call `showPanel()` (**3695**, pushes the nav stack); back buttons call `navigateMenuBack()` (**3721**, pops the stack, falling back to the mapped parent). Two buttons are wired with dedicated handlers: `btn-back-from-settings` (**20353**) and `btn-back-from-controls` (**29335**).

**Result: all 18 panels reachable, all 19 back buttons resolve to the correct parent, no orphan category buttons, ESC backs out one level correctly** (ESC logic at **44029**, settings branch **44042–44064**). The full tree:

| Panel (line) | Opened by | Back button (line) → parent |
|---|---|---|
| settings-menu (2466) | `btn-settings`/`btn-settings-main` | `btn-back-from-settings` (2488) → pause/seed |
| performance (2491) | btn-settings-performance | `btn-back-from-performance` (2496) → settings-menu |
| performance-rendering (2499) | btn-performance-rendering | (2534) → performance |
| performance-streaming (2537) | btn-performance-streaming | (2564) → performance |
| performance-workers (2567) | btn-performance-workers | (2585) → performance |
| graphics (2588) | btn-settings-graphics | (2595) → settings-menu |
| graphics-visual (2598) | btn-graphics-visual | (2622) → graphics |
| graphics-lighting (2625) | btn-graphics-lighting | (2861) → graphics |
| graphics-water (2864) | btn-graphics-water | (3128) → graphics |
| graphics-effects (3131) | btn-graphics-effects | (3273) → graphics |
| graphics-sky (3276) | btn-graphics-sky | (3491) → graphics |
| gameplay (3494) | btn-settings-gameplay | (3499) → settings-menu |
| gameplay-movement (3502) | btn-gameplay-movement | (3529) → gameplay |
| gameplay-camera (3532) | btn-gameplay-camera | (3543) → gameplay |
| gameplay-interaction (3546) | btn-gameplay-interaction | (3553) → gameplay |
| touch (3556) | btn-settings-touch | `btn-back-from-touch` (3583) → settings-menu |
| world (3586) | btn-settings-world | (3589) → settings-menu |
| world-time (3592) | btn-world-time | (3608) → world |

### Defect N1 (low/latent) — Controls back button hardcodes the pause menu

**Location — line 29335:**

```js
if (btnBackControls) { btnBackControls.addEventListener("click", () => { controlsMenu.style.display = "none"; mainPauseMenu.style.display = "block"; }); }
```

The ESC handler for the controls menu (**~44066**) makes the same assumption. The settings exit (20367) and ESC-settings fallthrough (44055) both branch on `isInGame` to choose pause vs. seed menu; the controls path does not. **Safe today** because Controls is only reachable from the pause menu — but if a Controls entry is ever added to the start screen, Back/ESC would pop the pause menu over the start screen. Recommend mirroring the `isInGame` branch used by settings.

---

## Reset-to-default audit

There are 13 per-panel reset buttons plus one global `btn-reset-all`. Every reset button has a handler, writes `SETTINGS`, persists, and re-syncs the DOM. **No missing reset handlers.** Issues below concern *completeness of live side-effects* and *consistency*.

### Defect R1 (moderate) — `Reset All to Default` under-applies live side-effects

**Location — lines 28865–28886:**

```js
document.getElementById("btn-reset-all")?.addEventListener("click", () => {
    if (confirm("Reset ALL settings to default values?")) {
        Object.keys(DEFAULTS).forEach((key) => {
            const value = DEFAULTS[key];
            SETTINGS[key] = typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
        });
        localStorage.setItem("voxex_settings", JSON.stringify(SETTINGS));
        updateUIFromSettings();
        // Apply side effects for all reset settings
        applyWaterMaterialSettings();
        if (window.updateLightingMaterials) window.updateLightingMaterials();
        if (renderer) renderer.setPixelRatio(window.devicePixelRatio * SETTINGS.pixelRatio);
        if (window.resizePostProcessTargets) window.resizePostProcessTargets();
        if (zombieScarePass) {
            zombieScarePass.uniforms.enableVignette.value = SETTINGS.zombieVignetteEnabled;
            zombieScarePass.uniforms.enableDesaturation.value = SETTINGS.zombieDesaturationEnabled;
            zombieScarePass.uniforms.vignetteIntensity.value = SETTINGS.zombieVignetteIntensity;
        }
        rebuildSkylightForActiveChunks();
        rebuildTorchLightingForActiveChunks();
    }
});
```

Compared with the per-panel resets, `Reset All` **omits**: `applyShadowSettings()` / `applyShadowRenderDistance()` and `sun.shadow.bias/radius` (lighting reset does these at ~28984), `applyWaterFastMode()` + refraction/underwater uniform sync (water reset, ~29055), `refreshSkyFogColorsFromSettings()` + star/cloud rebuild + `updateStarLayerVisibility()` (sky reset, ~29312), `recomputeTouchMode()` / `applyTouchControlSettings()` (touch reset), `markChunkSystemDirty()` for render distance, `rebuildAllVisibleChunks()` for AO/texture-res, and the reload / shader-reload notices. **Net effect:** values reset correctly and persist, but shadows, water shaders, sky/stars/clouds, the touch overlay, and AO/texture changes can stay visually stale until the next reload.

**Recommended change (line 28873 onward):** replace the partial side-effect block with calls to the same routines the per-panel resets use, e.g. add after `updateUIFromSettings();`:

```js
        // Mirror the live-apply that the per-panel resets perform so the whole
        // scene reflects defaults immediately (not just on next reload).
        if (typeof applyShadowSettings === "function") applyShadowSettings();             // exists: line 24844
        if (typeof applyShadowRenderDistance === "function") applyShadowRenderDistance(); // exists: line 11535
        if (sun && sun.shadow) { sun.shadow.bias = SETTINGS.shadowBias; sun.shadow.radius = SETTINGS.shadowRadius; }
        if (typeof applyWaterFastMode === "function") applyWaterFastMode();               // exists: line 31563
        if (typeof refreshSkyFogColorsFromSettings === "function") refreshSkyFogColorsFromSettings();
        // Stars/clouds are rebuilt by RE-CREATING them — there is NO rebuildStarField()/
        // rebuildCloudPlane(). This mirrors the Sky reset exactly (lines 29312–29317):
        if (typeof scene !== "undefined" && scene) {
            if (typeof createStarField === "function") starField = createStarField(scene);   // line 14944
            if (typeof createCloudPlane === "function") cloudPlane = createCloudPlane(scene); // line 15110
        }
        if (typeof updateStarLayerVisibility === "function") updateStarLayerVisibility(); // exists: line 28518
        if (typeof recomputeTouchMode === "function") recomputeTouchMode();               // exists: line 44406
        if (typeof applyTouchControlSettings === "function") applyTouchControlSettings(); // exists: line 44982
        if (typeof markChunkSystemDirty === "function") markChunkSystemDirty("reset all");
        if (typeof rebuildAllVisibleChunks === "function") rebuildAllVisibleChunks();     // exists: line 24961
```

> Each helper name above was verified to exist at the cited line during the audit. The `starField`/`cloudPlane` assignments must run in a scope where those vars + `scene` + `createStarField`/`createCloudPlane` are visible — the Sky reset (29271) already does exactly this, so the same scope works. Better still, see R2 — switching the resets to the canonical sync removes most of this divergence.

### Defect R2 (moderate) — reset-time UI sync (`updateUIFromSettings`) is incomplete

The reset handlers call `updateUIFromSettings()` (**28765–28863**), a smaller sync than the canonical `syncSettingsToUI()` (**22141–22564**). `updateUIFromSettings()` does **not** re-sync blocky-shadow inputs, GI/diffuse/specular/volumetric detail fields, water ripple/wade/splash/bubble detail, star/cloud detail, or torch/block-break/footstep detail. So after a reset those DOM controls stay stale until the panel is reopened (which calls `syncSettingsToUI()`).

**Recommended change:** point the reset handlers at the canonical sync. Either replace the calls (`updateUIFromSettings()` → `syncSettingsToUI()`) at lines **28872, 28898, 28913, 28921, 28931, 28980, 29120, 29187, 29198, 29205, 29211, 29259, 29267, 29318**, or make `updateUIFromSettings` delegate:

```js
// 28765 — collapse the divergent helper into the canonical one
function updateUIFromSettings() {
    if (typeof syncSettingsToUI === "function") syncSettingsToUI();
}
```

> Caveat: a few reset handlers (water 29072–29119, effects 29154–29186) manually set ~30 DOM fields *before* calling the sync. If `syncSettingsToUI()` covers those ids (it does), the manual blocks become redundant (Defect R4) and can be removed after this change.

### Defect R3 (minor) — `shadowMapType` is in `DEFAULTS` but missing from the `SETTINGS` literal

`shadowMapType` is defined in `DEFAULTS` (line **6136**, default `'medium'`) with **no matching key in the `SETTINGS` literal** (5771–6028), so `SETTINGS.shadowMapType` is `undefined` until `Reset All` copies it in. It *is* consumed — once, at renderer init (line **26982**):

```js
renderer.shadowMap.type = shadowMapTypes[SETTINGS.shadowMapType] ?? THREE.PCFShadowMap;
```

Practical impact is negligible: `undefined` falls back to `PCFShadowMap`, which is what `'medium'` maps to anyway, there is no UI control for it, and it's only read at init (so a reset has no live effect). Fix for consistency by adding it to the `SETTINGS` literal with a `savedSettings.shadowMapType ?? 'medium'` read (so a future control/reset round-trips), or remove it from `DEFAULTS`.

### Defect R4 (minor) — redundant DOM-setting in water/effects resets

Water reset (29072–29119) and effects reset (29154–29186) set ~30 individual `.value`/`.checked` fields *and then* call `updateUIFromSettings()`. After R2 those manual blocks are duplicate work; remove them once the canonical sync is in place.

### Reset button map (all verified present & persisting)

| Reset button (line) | Resets | Handler |
|---|---|---|
| `btn-reset-all` (2487) | all of `DEFAULTS` | 28865 — see R1 |
| `btn-reset-performance-rendering` (2533) | render dist, fps bounds, frustum, pixelRatio, volumetric/caustic scale | 28888 |
| `btn-reset-performance-streaming` (2563) | build queue, max cached, pre-gen, mem budget, auto-mem | 28905 |
| `btn-reset-performance-workers` (2584) | workers, pool size | 28916 |
| `btn-reset-graphics-visual` (2621) | AO, texture res, AA | 28926 |
| `btn-reset-graphics-lighting` (2860) | shadows/sun/moon/torch/ambient/volumetric/GI/diffuse/specular | 28936 |
| `btn-reset-graphics-water` (3127) | all water + sub-effects | 29001 |
| `btn-reset-graphics-effects` (3272) | zombie fx, particles, torch/blockbreak/footstep | 29123 |
| `btn-reset-gameplay-movement` (3528) | speed/sprint/crouch/fly/jump/gravity | 29190 |
| `btn-reset-gameplay-camera` (3542) | normal/sprint FOV | 29201 |
| `btn-reset-gameplay-interaction` (3552) | block reach | 29208 |
| `btn-reset-touch` (3582) | 5 touch prefs | 29252 |
| `btn-reset-world-time` (3607) | day length | 29264 |
| `btn-reset-graphics-sky` (3490) | sky quality, sky colors, stars, clouds | 29271 |

### Defect R5 (minor) — inconsistent persistence call

Most resets call `localStorage.setItem("voxex_settings", JSON.stringify(SETTINGS))` directly; three (effects 29151, sky 29310, touch 29258) use `saveSettings()`. Functionally identical today, but a future change to `saveSettings()` (e.g. profile bookkeeping) would silently skip the direct-write resets. Recommend standardizing all resets (and `Reset All` at 28871) on `saveSettings()`.

---

## Defect D1 (moderate, separate refactor) — duplicate event listeners fire handlers twice in-game ✅ verified line-by-line

`attachSettingsEventListeners()` (**22582**, guarded by `settingsListenersAttached`, called once on `DOMContentLoaded`) is the documented single source of truth. `init()` *also* attaches its own raw `addEventListener` calls to the **same** controls, *unguarded*. After `init()` runs (world load) each affected control has **two** live listeners, so every adjustment runs both — doubling the LocalStorage write and the side-effects.

**Verification method:** I read the full `init()` settings block (27756–28763) and matched each control's `SETTINGS.<key> =` assignment against `attachSettingsEventListeners()` (22582–23920) and the reset handlers. A representative sample of 12 controls spanning every panel each resolved to **exactly three** assignment sites — one canonical listener, one `init()` duplicate, one reset:

| Control | Canonical listener (`attach`) | Duplicate listener (`init`) | Reset (`= DEFAULTS`) |
|---|---|---|---|
| `frustum-culling-toggle` | 22606 | 28328 | 28893 |
| `volumetric-toggle` | 22950 | 28389 | 28954 |
| `gi-toggle` | 23032 | 28421 | 28962 |
| `specular-toggle` | 23109 | 28465 | 28974 |
| `water-fast-toggle` | 23166 | 28489 | 29003 |
| `water-ripple-color` | 23277 | 28005 | 29018 |
| `water-splash-size-input` | 23426 | 28207 | 29041 |
| `torch-particles-enabled-toggle` | 23655 | 28541 | 29133 |
| `block-break-enabled-toggle` | 23724 | 28643 | 29143 |
| `footstep-enabled-toggle` | 23758 | 28689 | 29148 |
| `player-speed-slider` | 23842 | 28721 | 29191 |
| `block-reach-slider` | 23914 | 28732 | 29209 |

**Confirmed real.** Both listeners fire on every change, re-running side-effects such as `rebuildAllVisibleChunks()`, `applyWaterFastMode()`, `updateLightingMaterials()`, `invalidateFrustumCache()`, `resizePostProcessTargets()` and shader-uniform writes twice. There are no `removeEventListener` calls, so it persists for the session (and would *compound* if `init()` re-ran on a later world-load without a page reload). This is a **performance/behavior** defect, not a stored-value bug — the duplicate writes are idempotent.

### Are the `init()` copies true duplicates, or do they do something different? (verified behaviorally)

They are **true behavioral duplicates** — same `SETTINGS` key *and* same live side-effect — not two halves of one feature. Spot-compared, e.g.:

| Control | `attach()` version | `init()` version | Equivalent? |
|---|---|---|---|
| `frustum-culling-toggle` (22605 / 28328) | `SETTINGS.enableFrustumCulling = …; saveSettings(); if (isGameActive() && window.invalidateFrustumCache) window.invalidateFrustumCache();` | `SETTINGS.enableFrustumCulling = …; localStorage…; invalidateFrustumCache();` | yes |
| `pixel-ratio-slider` (22649 / 28748) | `…; if (isGameActive() && window.renderer) window.renderer.setPixelRatio(…); saveSettings();` | `…; localStorage…; if (renderer) renderer.setPixelRatio(…);` | yes |
| `render-dist-slider` (22620 / 27793) | sets `window.currentRenderRadius`, fog, `window.markChunkSystemDirty(...)` (guarded) | sets bare `currentRenderRadius`, fog, `markChunkSystemDirty(...)` | yes — see alias below |

The only structural difference is that `attach()` lives at module scope, so it reaches the engine through `window.*` globals and guards each side-effect with `isGameActive()`; `init()` lives inside the engine scope and calls the bare functions. These resolve to the **same targets** because the engine exposes them on `window` during `init()` (before any in-game setting change is possible):

- `window.applyShadowSettings` (24898), `window.resizePostProcessTargets` (27642), `window.scene`/`window.renderer`/`window.volumetricLightPass`/`window.zombieScarePass`/`window.underwaterPass` (29352–29359), `window.rebuildAllVisibleChunks` (29381), `window.applyWaterMaterialSettings` (29385), `window.markChunkSystemDirty` (29387), `window.invalidateFrustumCache` (29388), `window.waterMaterialRefraction` (31205), `window.applyWaterFastMode` (31596), `window.updateLightingMaterials` (31647).
- `window.currentRenderRadius` is **not a dead copy** — it's a live getter/setter alias to the module variable (lines **29365–29367**: `Object.defineProperty(window, 'currentRenderRadius', { get: () => currentRenderRadius, set: (val) => { currentRenderRadius = val; } })`), so `attach()`'s `window.currentRenderRadius = val` updates the real render radius.

**Conclusion:** the `init()` listeners are redundant, and `attach()` is in fact the *more robust* version (it `isGameActive()`-guards its side-effects and uses `saveSettings()`). Deleting the `init()` listeners loses nothing — `attach()` produces an identical in-game result. The in-code notes ("duplicate copies removed here during the … consolidation") confirm this was a partially-finished migration toward `attach()` as the single source of truth.

**So, to the three questions:**
- **Duplicates or different?** The *listeners* are true duplicates. The surrounding `const` declarations and the initial `.checked`/`.value` lines are a *different* concern — the init-state lines duplicate `syncSettingsToUI()` (which runs every time the panel opens), so they're redundant but harmless; the `const`s are still **needed** by the reset handlers and `updateUIFromSettings()`.
- **Can they be compressed?** Yes — delete the ~100 duplicate listeners and rely on `attach()`. (~430 lines removed.) Optionally also drop the redundant init-state lines once `updateUIFromSettings` is routed through `syncSettingsToUI` (R2).
- **Are they needed?** The listeners: no. The `const`s: yes (until the resets/`updateUIFromSettings` are refactored to not reference them). The init-state lines: no, but harmless to leave.

**Scope (verified):** essentially every **Performance, Lighting, Water, Effects, and Gameplay** control — well over 80 listeners (≈100). The duplicate listeners live at **27782, 27793, 27826, 27828, 27830**, **28004–28272** (water ripple/wade/splash/bubble detail), and the `EVENT HANDLERS …` blocks at **28327–28762** (performance, lighting, water basic/absorption/refraction/murk, zombie/particle toggles, torch/block-break/footstep particles, gameplay movement/physics/camera/interaction, and the renderer group: shadow render-distance, AA, pixel ratio, volumetric/caustic scale).

**Already de-duplicated — do NOT touch (single-source in `attach` already, confirmed by in-code notes):**
- Sky colors (`day/night-sky-*-color`) — note at **28485**.
- Stars/clouds toggles, star-layer inputs, cloud inputs — note at **28529**.
- Color-grading + biome-fog toggles — note at **28718**.
- `day-length-input` + `btn-time-*` — note at **28733** (the guarded copies live near line 24841).
- `smooth-lighting-toggle` and the blocky-shadow inputs (`blocky-shadows-toggle`, `blocky-shadow-offset/slope/step`, `blocky-torch-levels`): `init()` only sets their initial `.checked`/`.value` (27767–27773) — their *listeners* exist only in `attach` (e.g. smooth-lighting at **22760**). **Not duplicates.**

**Keepers inside 27756–29318 (must be preserved if deleting the duplicates):**
- All element `const` declarations (27756–27764, 27833–27846, 27856–27865, 28283–28326, etc.) — the reset handlers and `updateUIFromSettings()` reference them.
- `updateUIFromSettings()` (28765–28863) and `updateStarLayerVisibility()` (28518–28526, called by the Sky reset).
- All reset-button handlers (28865–29318).
- The touch-control listeners (29215–29250) — single-source, not duplicated.
- Non-settings wiring: `btnResume`, `btn-quit`, `btnSettings`, `btn-back-from-controls`, save/load (27812–27830, 29320+).

**Recommended path:** delete only the duplicate *setting-control* `addEventListener` calls (the listeners at 27782/27793/27826/27828/27830, 28004–28272, and the `EVENT HANDLERS …` blocks 28327–28762), leaving the `const` declarations, UI-init lines, reset handlers, touch block, and `updateUIFromSettings`/`updateStarLayerVisibility` intact. Track as its own change; not bundled with Issues #1/#2. A full line-by-line delete list can be produced on request.

> Related (harmless): `init()` declares `const btnBack = document.getElementById("btn-back-from-settings");` at line **27713** that is **never used** — a dead variable, *not* a second binding. The only active handler for that button is at line **20353**, so Back-from-Settings is correctly single-bound. Safe to delete the dead line.

---

## Optional deletions (dead CSS once Issue #1 lands)

**Delete — lines 1692–1704 (panel scrollbar styling, dead after the panel stops scrolling):**

```css
.settings-panel::-webkit-scrollbar {
    width: 8px;
}
.settings-panel::-webkit-scrollbar-track {
    background: #161616;
}
.settings-panel::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 6px;
}
.settings-panel::-webkit-scrollbar-thumb:hover {
    background: #666;
}
```

(Leaving them is harmless; `#instructions` already defines `scrollbar-width`/`scrollbar-color`. Delete only for tidiness.)

---

## Cross-system effects & risk summary

- **Wheel gate (Issue #1A):** the only consumer of the wheel during gameplay is hotbar cycling; zoom is on `-`/`=`. Gating on `isGameplayActive()` cannot regress gameplay and fixes menu scrolling. Lowest-risk change in this CCR.
- **Single scroll container (Issue #1B):** affects all `#instructions`-hosted menus (pause, controls, settings) uniformly and improves them all. `#seed-menu`/`#create-world-panel` untouched. Watch small-viewport layout once the inner cap is removed — `#instructions` already clamps to `100dvh - 16px`, so content scrolls within the card.
- **Inline toggles (Issue #2):** id-preserving move ⇒ zero JS rewiring; the `stopPropagation` keeps expand/collapse intact. The one structural change is `water-wake` (toggle-only group → plain row).
- **Reset fixes (R1/R2):** make `Reset All` and post-reset UI consistent with per-panel resets; verify helper names against 28888–29318 before applying. Touch `shadowBias`/`shadowRadius`/water-uniform/sky-rebuild paths are the same ones the per-panel resets already call, so behavior is proven.
- **Duplicate listeners (D1):** real but independent; sequence it after Issues #1/#2 to keep diffs reviewable.
- **Single-file rule:** every change stays in `voxEx.html`. No new IDs introduced except the CSS class `group-header-controls` (styling only). No identifier shadowing; `isGameplayActive`, `saveSettings`, `syncSettingsToUI` already exist.

---

## Verification plan (before/after applying)

1. Serve over localhost and open `tools/voxex-tests.html` (~204 tests) — confirm no regressions in the settings/persistence paths.
2. Manual scroll matrix: desktop wheel, trackpad two-finger, and touch drag, in **every** settings sub-panel, both from the start screen and from the in-game pause menu (the in-game case is the one that's currently broken).
3. Toggle each of the 15 ★ groups from its header bar without expanding; confirm the feature turns on/off, the value persists across `F5`/reload, and the chevron still expands the detail rows.
4. Click every Back button and press ESC from every sub-panel; confirm one-level back-out and correct root exit (pause vs. seed).
5. Click every Reset button + `Reset All`; confirm the scene updates live (shadows, water, sky/stars/clouds, touch overlay) and values persist.
6. Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (top of `voxEx.html`) when the changes are applied.

# CCR — Fire Settings Panel: UI Never Synced from SETTINGS on Start-Menu Path

**ID:** VOXEX-CCR-FIRE-002
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-23
**Status:** 🟢 RESOLVED (build 2026-06-23.20 — real root cause fixed; see ADDENDUM + IMPLEMENTATION NOTE at end). Builds .18/.19 (Fixes 1–4) did NOT fix the reported symptom.
**Scope:** Settings UI › Start-menu entry path › `syncSettingsToUI` exposure; Fire system › stale localStorage cap; **fire write-listeners never attached pre-game (the actual bug)**

---

## Summary

Two bugs combine to make the fire settings panel show stale/wrong values when accessed from the
start screen, and a third setting compounds the symptom:

1. **`btn-settings-main` (start-menu Settings button, line 20724) shows the settings panel
   without calling `syncSettingsToUI()`**. Then, sub-panel navigation via `showPanel()`
   (line 3811) cannot reach `syncSettingsToUI` either, because it lives in module scope and is
   not exposed on `window`. Result: every slider and toggle in the fire panel (and all other
   settings sub-panels) shows its HTML-default state when entered from the start screen.

2. **CCR-FIRE-001 changed `DEFAULTS.fireMaxActive` from 48 → 128 but did not bump
   `SETTINGS_VERSION`**, so any user who previously saved `fireMaxActive: 8` (the slider
   minimum) retains that value in localStorage and `SETTINGS.fireMaxActive` loads as 8. The
   fire system's spread check (`cells.size < SETTINGS.fireMaxActive`, line 40598) and the
   per-chunk model guard (`m.size >= SETTINGS.fireMaxActive`, line 40376) both enforce this
   invisible cap.

3. `SETTINGS.fireMaxAge = 8` (default: 8 seconds) is the max lifetime of fire on
   non-burnable surfaces. This is intentional design — fire on stone, dirt, gravel dies after
   8 seconds. It is not a count cap. The slider for this setting is broken by Bug 1, so users
   cannot raise it to observe fire persist longer.

**Important:** The pause-menu Settings path (`btn-settings`, line 28298) works correctly —
it calls `syncSettingsToUI()` before showing the panel. The bug only affects users who open
settings from the start screen before starting a game.

---

## Bug 1: `syncSettingsToUI` Unreachable from Both Start-Menu Entry Points

### Root cause: two distinct code paths, both bypass the sync

There are two ways to open the settings menu:

#### Path A — Start-menu (`btn-settings-main`, line 20724)

```js
document.getElementById("btn-settings-main")?.addEventListener("click", () => {
    // ...hide other panels...
    if (settingsMenu) settingsMenu.style.display = "block";  // line 20735
    // ← NO syncSettingsToUI() call
});
```

When the user clicks "Settings" on the start screen, `settingsMenu` becomes visible with no
sync. Every slider sits at its HTML default position. Every toggle renders in its HTML default
state.

#### Path B — Pause-menu (`btn-settings`, line 28298) — WORKS CORRECTLY

```js
btnSettings.addEventListener("click", () => {
    clearMenuNavigationStack();
    mainPauseMenu.style.display = "none";
    settingsMenu.style.display = "block";
    syncSettingsToUI();  // ← correct, syncs all inputs from SETTINGS
});
```

This handler is attached inside `initGameEngine` (line 24399). It works for any user who
starts a game and opens Settings from the pause menu. The bug is exclusive to start-screen
access before a game is started.

#### Sub-panel navigation (`showPanel`, line 3795) — also blocked

After reaching the top-level `settings-menu` via Path A, clicking a category button
(e.g. "Gameplay" → `btn-settings-gameplay`) calls:

```js
// showPanel() — in non-module <script> block (block ends ~line 3920)
function showPanel(panelId, pushToStack = true) {
    // ...show/hide logic...
    if (panelId.startsWith('settings-') && typeof syncSettingsToUI === 'function') {
        syncSettingsToUI();   // line 3812 — NEVER EXECUTES
    }
}
```

`syncSettingsToUI` is defined at line 22525 inside `<script type="module">`. Module-scoped
variables are not added to `window`. From the non-module `showPanel`, `typeof syncSettingsToUI`
evaluates to `'undefined'`, so the guard is always false and the sync never runs.

```js
// grep result: 0 matches for window.syncSettingsToUI anywhere in voxEx.html
```

The guard was designed to call a global — `window.syncSettingsToUI = syncSettingsToUI` is the
intended completion of this design. The file already exposes ~30+ module-scoped items on
`window` (e.g. `window.voxelWorld`, `window.torchLightPool`, `window.VoxEx`).

### Concrete symptoms (start-screen path only)

| Control | HTML default (what user sees) | SETTINGS value (what fires) |
|---|---|---|
| `fire-spread-toggle` | unchecked (Off) | `true` (On) |
| `fire-water-extinguish-toggle` | unchecked (Off) | `true` (On) |
| `fire-particles-toggle` | unchecked (Off) | `true` (On) |
| `fire-max-active-slider` span | "128" (static HTML, line 3633) | `SETTINGS.fireMaxActive` (may be 8) |
| `fire-max-active-slider` handle | `(8+512)/2 = 260` (HTML midpoint) | should be at `SETTINGS.fireMaxActive` |
| `fire-max-age-slider` span | "8" (static HTML, line 3625) | `SETTINGS.fireMaxAge` |

**The toggles display Off; the features are On.** The user clicking a toggle to "enable" it
actually disables the feature. The sliders appear initialized to 128 / 260, while the game
enforces the true SETTINGS values.

### What IS working: slider drag interaction *(code-inferred — not browser-verified)*

`attachSettingsEventListeners()` (line 22980) is called unconditionally at `DOMContentLoaded`
(line 24388). It attaches `"input"` listeners on all fire sliders via `bindFireSlider`
(line 29055). Each link in the chain is confirmed in source: DOMContentLoaded fires →
`attachSettingsEventListeners` is called → `bindFireSlider` adds an `"input"` listener on the
slider element → the listener reads `parseInt(s.value, 10)`, writes `SETTINGS[key]`, updates
`v.innerText`, and calls `saveSettings()` (lines 29058–29062).

The user's description was "the numbers don't change" — this was diagnosed as the slider
initializing at the wrong position (HTML default `(8+512)/2 = 260`), not as a broken listener.
**This claim has not been verified by actual browser interaction.** Before implementation,
confirm with a simple test: load the page, navigate start-menu → Settings → Fire, drag
the slider, observe `SETTINGS.fireMaxActive` and span update. If that still fails, there is
a third bug not captured in this CCR.

The problem is not broken input listeners — it is that sliders start from wrong positions
(HTML defaults, not SETTINGS values) because `bindFireSlider` only adds the event listener
without initializing `s.value = SETTINGS[key]`. Once `syncSettingsToUI` runs (via Fix 1),
sliders initialize correctly and dragging from that baseline works as intended.

---

## Bug 2: Stale `localStorage` — `SETTINGS_VERSION` Not Bumped After CCR-FIRE-001

### How it happened

CCR-FIRE-001 changed:
- `DEFAULTS.fireMaxActive`: 48 → 128 (line 6287)
- Slider max: 64 → 512 (line 3634)
- Profile values updated

The code comment at line 3930 explicitly requires bumping `SETTINGS_VERSION` whenever
DEFAULTS change:

> "Bump SETTINGS_VERSION ONLY when DEFAULTS change, to force every device back to defaults."

CCR-FIRE-001 did not bump `SETTINGS_VERSION`. It remains 4 (line 3932).

### Effect

The version check (lines 5950–5957):

```js
let savedSettings = JSON.parse(localStorage.getItem("voxex_settings")) || {};
if (savedSettings.settingsVersion !== SETTINGS_VERSION) {
    savedSettings = {};
    localStorage.removeItem("voxex_active_profile");
    localStorage.setItem("voxex_settings", JSON.stringify({ settingsVersion: SETTINGS_VERSION }));
    console.info("[Settings] Version mismatch -> reverted to defaults (v" + SETTINGS_VERSION + ")");
}
```

Because SETTINGS_VERSION was not bumped, any previously saved settings survive, including a
stale `fireMaxActive` below the new default. `SETTINGS` is then initialized at line 6027:

```js
fireMaxActive: savedSettings.fireMaxActive !== undefined ? savedSettings.fireMaxActive : 48,
```

If a user previously moved the slider to its minimum (8), `SETTINGS.fireMaxActive` loads as 8.
Both fire caps enforce this:

- **Spread cap** (line 40598): `this.cells.size < SETTINGS.fireMaxActive` — blocks new fire
  cells when global count reaches 8.
- **Model cap** (line 40376): `m.size >= SETTINGS.fireMaxActive` — blocks new flame models for
  a chunk that already has 8 fires.

The user placing a 9th fire sees the block appear but gets no flame model (silent failure).

### Why the UI showed "128" despite the cap being 8

Our CCR-FIRE-001 commit changed the static span in HTML from "48" to "128" (line 3633). Since
`syncSettingsToUI` never runs on start-screen panel open (Bug 1), this static "128" is never
overwritten. The user reads "128" and trusts it — but `SETTINGS.fireMaxActive` in memory is 8.

---

## Bug 3: `fireMaxAge = 8s` — Context, Not a Bug

`SETTINGS.fireMaxAge` defaults to 8 seconds (line 6025 / DEFAULTS line 6285). Fire placed on
non-burnable blocks (stone, dirt, gravel, sand) extinguishes after 8 seconds. This is
intentional design — fire only persists indefinitely on burnable surfaces by spreading.

Combined with Bug 2's invisible `fireMaxActive = 8` cap: the user places 8 fires on stone,
waits 8 seconds, all extinguish. Apparent behavior: game hard-caps fire at 8 with an 8-second
duration. Reality: two unrelated 8s that happen to align.

Fix 2 (SETTINGS_VERSION bump) clears the stale cap. Fix 1 makes the `fireMaxAge` slider work
so users can raise it. No code changes needed for this setting.

---

## Proposed Fixes

### Fix 1: Expose `syncSettingsToUI` on `window`

Add one line after the function definition at line 22525:

```js
// After: function syncSettingsToUI() { ... }  (ends ~line 22750)
window.syncSettingsToUI = syncSettingsToUI;
```

**Placement:** After the closing brace of `syncSettingsToUI`, or alongside other
`window.xxx = ...` assignments in the module init. Do NOT place before the function
definition — the assignment would evaluate to `undefined`.

**Effect:** `showPanel`'s guard at line 3811 (`typeof syncSettingsToUI === 'function'`)
becomes `true`. Every sub-panel navigation from the start-menu settings path now calls
`syncSettingsToUI()` and correctly initializes all sliders and toggles from `SETTINGS`.

The start-menu top-level `settings-menu` open (`btn-settings-main`, line 20724) still
does not call `syncSettingsToUI()` directly — but that panel contains only category navigation
buttons (no sliders or toggles), so it does not need syncing. The first sub-panel click
triggers the sync.

**Scope:** Fixes ALL settings panels system-wide, not just fire.

**Alternative A — Event dispatch:**
```js
// In showPanel (non-module):
window.dispatchEvent(new CustomEvent('voxex-show-panel', { detail: panelId }));
// In module:
window.addEventListener('voxex-show-panel', (e) => {
    if (e.detail.startsWith('settings-')) syncSettingsToUI();
});
```
CustomEvents dispatched via `window.dispatchEvent` are **synchronous** — the listener fires
before `dispatchEvent` returns, so the sync completes before the panel renders. This approach
avoids naming `syncSettingsToUI` on `window`, preserving a cleaner boundary. However, it adds
more code, introduces a new event name, and is less obvious to future readers. The existing
`typeof syncSettingsToUI === 'function'` guard in `showPanel` was clearly *written* expecting
a global assignment — `window.syncSettingsToUI = syncSettingsToUI` completes that design.
Verdict: not recommended; adds complexity without benefit.

**Alternative B — Move `showPanel` into module scope:**
Move the function into `<script type="module">` and assign `window.showPanel = showPanel`.
Rejected: all navMapping event listeners (lines 3858–3919) close over the non-module
`showPanel` by name. Moving the function would require restructuring the entire navigation
setup block. Same net result (a `window` assignment) with far more churn.

**Recommendation: Fix 1 as written (single `window.syncSettingsToUI = syncSettingsToUI` line).**

---

### Fix 2: Bump `SETTINGS_VERSION` from `4` to `5`

```js
// line 3932 — was:
const SETTINGS_VERSION = 4;

// Change to:
const SETTINGS_VERSION = 5;
```

On next page load, every user's `savedSettings.settingsVersion` will be `4 !== 5`, triggering
the reset at lines 5951–5957. `savedSettings` becomes `{}`. Every setting falls through to its
`SETTINGS` default, including `fireMaxActive: 48` (init from `savedSettings.fireMaxActive`,
which is now undefined, falling back to the literal in line 6027 — **which is still "48"**).

**Critical follow-on:** Line 6027 must also be updated:

```js
// line 6027 — currently:
fireMaxActive: savedSettings.fireMaxActive !== undefined ? savedSettings.fireMaxActive : 48,

// Must become:
fireMaxActive: savedSettings.fireMaxActive !== undefined ? savedSettings.fireMaxActive : 128,
```

**Important — do NOT use `DEFAULTS.fireMaxActive` as the fallback here.** `const DEFAULTS`
is declared at line 6225, after the `SETTINGS` object literal that contains line 6027.
Referencing `DEFAULTS.fireMaxActive` at line 6027 would be a `ReferenceError` thrown while
building `SETTINGS` — the game would fail to boot. The correct fix is the literal `128`.

Without this change, a version-reset user gets `fireMaxActive: 48` (the old literal in line
6027), not `128` (the new DEFAULTS). The SETTINGS_VERSION bump clears stale values but the
init literal is the actual fallback that version-reset users land on.

**Alternative — Targeted migration (no version bump):**
```js
// At settings load, after the version check block:
if (savedSettings.fireMaxActive !== undefined && savedSettings.fireMaxActive < 32) {
    delete savedSettings.fireMaxActive;  // force to new default
}
```
This is more surgical — it clears only `fireMaxActive` below a threshold without resetting
all user settings. However: (a) CCR-FIRE-001 changed multiple profile values, not just
`fireMaxActive`; (b) the codebase already has a correct mechanism for this (SETTINGS_VERSION)
that was simply not used; (c) partial migration logic is harder to reason about and leaves
other stale values from the missed FIRE-001 version bump. Verdict: not recommended.

**Recommendation: Fix 2 as written, plus the init-line correction.**

**Trade-off:** All user-customized settings reset on next load. This is documented behavior
and is the correct response to a missed DEFAULTS-changing CCR.

---

### Fix 3: Correct the `fire-max-active-val` Static HTML Span

```html
<!-- line 3633 — currently (changed by CCR-FIRE-001): -->
<span id="fire-max-active-val">128</span>

<!-- After Fix 1, syncSettingsToUI overwrites this on first panel visit -->
<!-- No change strictly required; 128 matches the new DEFAULTS.fireMaxActive -->
```

After Fix 1, `syncSettingsToUI` sets this span to `SETTINGS.fireMaxActive` on any sub-panel
navigation, so the static HTML value is cosmetic. `128` is now the correct new default — it is
not misleading at runtime. **No change needed.** The original draft proposed "0"; this is
rejected — 0 is arbitrary and "128" is now correct.

---

## What Does NOT Change

- `bindFireToggle` and `bindFireSlider` implementations (lines 29051–29076) — correct as-is.
- All DOM element IDs — confirmed matching: `fire-spread-toggle`, `fire-water-extinguish-toggle`,
  `fire-particles-toggle`, `fire-spread-chance-slider`, `fire-max-age-slider`,
  `fire-max-active-slider`, etc.
- `addFireModel` per-chunk guard (line 40376) and spread check (line 40598) — correct; they
  simply need `SETTINGS.fireMaxActive` to hold the right value (fixed by Fix 2 + init-line).
- `fireMaxAge = 8s` — intentional design; sliders will work once Fix 1 is applied.

---

## Files Changed

| File | Change |
|---|---|
| `voxEx.html` | Add `window.syncSettingsToUI = syncSettingsToUI;` after line ~22750 |
| `voxEx.html` | Bump `SETTINGS_VERSION` 4→5 at line 3932 |
| `voxEx.html` | Update `fireMaxActive` init line 6027: fallback literal `48` → `DEFAULTS.fireMaxActive` |
| `voxEx.html` | Bump `VOXEX_BUILD`, add `VOXEX_RECENT_CHANGES` entry |

---

## Pre-Implementation Safety Checks (Bugs 1–3)

- [x] Confirmed `syncSettingsToUI` function definition ends before `window.syncSettingsToUI` assignment
- [x] Confirmed no prior `window.syncSettingsToUI =` anywhere in file
- [x] Confirmed `SETTINGS_VERSION` appears only once as a `const` declaration
- [x] Confirmed `DEFAULTS.fireMaxActive` is 128 (changed by CCR-FIRE-001)
- [x] Updated `fireMaxActive` fallback literal at line 6027 to `128` (NOT `DEFAULTS.fireMaxActive` — DEFAULTS is declared at line 6225, after SETTINGS; using it would throw ReferenceError at boot)
- [x] 284/284 tests green after all changes (one new bootstrap test added)
- [ ] **Manually verify (Bug 4 still open):** open start-menu → Settings → Gameplay → Fire; drag sliders; confirm handles move and span values update in real time
- [ ] **Manually verify (regression check):** start a game → pause → Settings → Gameplay → Fire; drag sliders; confirm same

---

## Bug 4: Slider Handles Unresponsive to Drag in Main-Menu Context

**Discovered:** 2026-06-23, post-deploy user test.
**Symptom:** After Fixes 1–3, fire slider handles do not physically respond to mouse drag when
settings are opened from the start-menu path (main menu → Settings → Gameplay → Fire). The
same sliders respond normally when opened from the in-game pause menu.

### Root Cause Analysis

#### The pointer-event inheritance chain

`#instructions` — the single scrollable container that holds all settings panels — has:

```css
/* line 1877–1887 */
#instructions {
    overflow-y: auto;
    overflow-x: hidden;
    touch-action: pan-y;      /* ← allows browser to handle vertical scroll */
    max-height: calc(100dvh - 16px);
}
```

Its ancestor `#blocker` has:

```css
/* line 21–24 */
#blocker, #inventory-overlay, #main-pause-menu, #settings-menu, ... {
    touch-action: manipulation;   /* ← pan-x + pan-y + no double-tap zoom */
}
```

Range inputs inside `.settings-panel` have no explicit `touch-action` in the project
stylesheet. The browser's UA stylesheet gives `input[type="range"]` a default of
`touch-action: none` in Chromium — but this is a UA default, not an author rule. The CSS
cascade resolves the **effective touch-action** for pointer hit-testing by compositing the
ancestor chain up to (and including) the nearest scrollable ancestor:

```
nearest scrollable ancestor: #instructions  →  touch-action: pan-y
range input (UA default):                   →  touch-action: none
```

Per the Pointer Events Level 2 spec, the composed touch-action is the intersection of the
target element and all ancestor scroll containers. The `none` from the UA stylesheet should
win — but this is a **UA default**, not an author rule. When an **author** stylesheet sets
`pan-y` on an ancestor scroll container, some Chromium versions elevate the ancestor
constraint and cancel pointer events intended for the child when they begin as ambiguous
(neither clearly horizontal nor clearly vertical) drags. The range slider ends up with a
`pointercancel` before the drag threshold is reached, leaving the handle unresponsive.

#### Why sliders work in-game but not in the main menu

In-game, the WebGL canvas (`position: fixed; z-index: 1`) is present in the DOM. When
pointer lock is acquired for gameplay and then released on ESC (pause), Chromium resets its
**pointer compositor state** — clearing any pending gesture disambiguation from the previous
pointer-lock session. This reset restores the UA stylesheet's `touch-action: none` precedence
for range inputs in the settings panel, allowing slider drags to dispatch normally.

In the main menu (page just loaded, no prior pointer lock), the compositor has no prior
session to reset from, and the `pan-y` ancestor constraint is in effect from the start. Slider
drags that begin without a clear direction are disambiguated as vertical scroll attempts and
cancelled before reaching the range input.

#### Why this wasn't caught pre-deploy

The automated test suite (`voxex-tests.html`) cannot synthesize pointer drag sequences in a
headless environment — it verifies DOM structure and value round-trips, not interactive gesture
handling. The CCR explicitly flagged this:

> *"This claim has not been verified by actual browser interaction."* (Bug 1 section, last paragraph)

The pre-implementation safety check "Manually verify: open start-menu → Settings → Gameplay
→ Fire; confirm slider shows SETTINGS value" was not completed before shipping.

### Proposed Fix 4: Author `touch-action: none` on Settings Range Inputs

Add one CSS rule to the `<style>` block, in the same responsive section that sets
`.settings-panel { max-width: ... }` (around line 1898):

```css
/* Fix 4 (VOXEX-CCR-FIRE-002): prevent pan-y ancestor from cancelling range slider drags */
.settings-panel input[type="range"] {
    touch-action: none;
}
```

**Why this works:** An explicit author `touch-action: none` on the range input itself
outranks both the UA default and the ancestor `pan-y` constraint in the cascade. The browser
will no longer try to claim pointer events on these inputs as scroll gestures, so the full
`pointerdown → pointermove → pointerup` sequence dispatches to the range input and the
handle moves correctly.

**Why not remove `touch-action: pan-y` from `#instructions`:** Removing it would break
touch-scrolling of the settings panel on mobile — users could no longer scroll through the
settings list on a phone. The targeted fix (`touch-action: none` on the inputs themselves)
is surgical and doesn't affect scroll behavior for the container.

**Scope:** Fixes ALL range sliders in ALL settings sub-panels (not just fire). This is
intentional — all sliders inside `.settings-panel` share the same ancestor scroll container.

**Side effect — none:** `touch-action: none` on `input[type="range"]` is the standard
browser pattern for sliders in scroll containers. The element still fires `input`/`change`
events normally. Scrolling the parent container by touching non-slider areas is unaffected.

**Touch-mode note:** The same fix benefits mobile (touch) users — range slider drag was also
affected on touch devices for the same reason. No separate touch-mode guard needed.

### Fix 4 Implementation Plan — IMPLEMENTED (build 2026-06-23.19)

| Step | Location | Change |
|------|----------|--------|
| 1 | Existing `.settings-panel input[type="range"]` rule (~line 1791) | Added `touch-action: none;` to the existing block (cleaner than a duplicate selector near 1898 — `touch-action` is not inherited, so there's no cascade conflict with `#instructions { touch-action: pan-y }`, which targets a different element) |
| 2 | `VOXEX_BUILD` | Bumped `2026-06-23.18` → `2026-06-23.19` |
| 3 | `VOXEX_RECENT_CHANGES` | Added "SETTINGS SLIDER DRAG FIX (VOXEX-CCR-FIRE-002 Fix 4)" entry |

**Deviation from draft plan:** The draft proposed a *new* rule near line 1898. During
implementation an existing `.settings-panel input[type="range"]` rule was found at line 1791
(setting `flex: 1; min-width: 120px`). `touch-action: none` was added there instead — same
selector, same specificity, no duplicate. The draft's caution about "placement after the
`#instructions { touch-action: pan-y }` rule" is moot: `touch-action` is **not an inherited
property**, so the `pan-y` on `#instructions` (the container) and the `none` on the range
inputs (descendants) target different elements and never collide in the cascade. The
ancestor/descendant relationship matters only at pointer hit-test time, not in CSS ordering.

**Test:** After applying, serve `voxEx.html` locally and:
1. Open page (no game started)
2. Click Settings → Gameplay → Fire
3. Drag `fire-max-active-slider` handle ← → and confirm handle moves + span value updates in real time
4. Start a game → Pause → Settings → Gameplay → Fire → drag same slider (regression check)
5. Run `voxex-tests.html` — expect 284/284 green

### Pre-Implementation Safety Checks (Bug 4)

- [x] Confirmed no existing `touch-action` rule on `.settings-panel input[type="range"]` (the existing rule at line 1791 set only `flex`/`min-width`; `touch-action` added to it)
- [x] Cascade ordering verified non-issue — `touch-action` is not inherited; container (`#instructions`) and inputs are different elements (no same-element specificity battle, no ordering dependency)
- [x] `.settings-panel` selector scopes to settings sub-panels only (range inputs elsewhere — e.g. hotbar — are unaffected)
- [x] 284/284 tests green after change
- [ ] **Manual (pending user confirmation):** drag fire sliders in start-menu context — confirm handles move and span values update
- [ ] **Manual (pending user confirmation):** drag a non-fire slider (e.g., render distance) in start-menu context — confirm fix is systemic
- [ ] **Manual (pending user confirmation):** touch-scroll a long settings panel on mobile — confirm scroll still works (touch-action: none is on the slider only, not the container)

---
---

# ADDENDUM — 2026-06-23 Review: The Real Root Cause (Bugs 1–4 Did Not Fix It)

**Author:** Review/report pass (no code changed — investigation only)
**Build reviewed:** `VOXEX_BUILD = 2026-06-23.19` (all of Fixes 1–4 already shipped)
**Status of the reported bug:** 🔴 **STILL BROKEN.** User confirms: from the start
screen → Settings → Gameplay → Fire, the sliders "do not connect to anything and moving
the sliders doesn't change the number."

> **Do not delete the sections above.** They are preserved intentionally. This addendum
> explains what each prior fix got wrong, why the bug survived four fixes, and the one
> change that actually resolves it.

---

## TL;DR — The actual root cause

**The fire settings event listeners are never attached on the start-menu path because they
live inside `init()`, and `init()` only runs when a game starts.**

- The fire toggle/slider bindings (`bindFireToggle` / `bindFireSlider` and their 12 call
  sites) are at **lines 29063–29099**, inside the block opened at line 29062.
- That block is inside the function **`init()`** (begins line 27195, ends line 29341 — the
  next function, `initBlockOptimization()`, starts at 29342; there is no other function
  definition between 27195 and 29342, so the fire block is unambiguously inside `init()`).
- **`init()` is called from exactly one place: line 24424, inside `initGameEngine()`**
  (`await init();`). `initGameEngine` only runs when the user creates or loads a world.
- Therefore, on the start screen — before any game has started — `init()` has never run,
  and **no `input`/`change` listener is ever attached to any fire control.**

A native `<input type="range">` handle is draggable on its own (the browser moves the thumb
without any JS), but the **number span and `SETTINGS[...]` only update inside the missing
`input` listener.** Result, exactly as reported: the handle slides, the number is frozen,
and nothing connects. The toggles behave the same way (no `change` listener → clicking does
nothing).

### Proof that this is the cause (not touch-action, not sync)

| Fact | Evidence (verified in build .19) |
|---|---|
| Fire listeners are inside `init()` | `bindFireSlider`/`bindFireToggle` defined and called at 29063–29099; enclosing fn `init()` spans 27195–29341 |
| `init()` runs only on game start | Sole call site is `await init();` at line 24424 inside `initGameEngine()` (24411) |
| `attachSettingsEventListeners()` (the main-menu path) has **no** fire code | Scan of lines 22992–24389 for `fire`/`Fire`: **zero matches** |
| Other settings *do* work from the main menu because their listeners *were* moved | Tombstones at 28290, 28295, 28311–28312: "CCR D1: …-listener removed — single-source in attachSettingsEventListeners()". The fire block was simply **never migrated**. |

### Why it "works in-game but not the main menu" — the boring truth

Open Settings → Fire from the **pause menu** (after starting a game) and the sliders work.
The prior CCR (Bug 4) attributed this to a Chromium "pointer compositor reset on
pointer-lock release." That is fiction. The real reason is trivial: **starting the game
ran `init()`, which attached the fire listeners.** Same DOM elements, same CSS — the only
difference is whether `init()` has executed yet.

---

## What each prior fix got wrong, and why

### Fix 1 — `window.syncSettingsToUI = syncSettingsToUI` — *correct, but addresses the wrong half of the problem*

`syncSettingsToUI()` is the **read** path: SETTINGS → UI. It sets `s.value` and the span text
(fire portion: lines 22546–22555). Exposing it on `window` (line 22974) and calling it from
`showPanel` (line 3819) is a legitimate, real fix — it makes each slider *start* at the
correct value when the panel is opened from the start menu.

But it does **nothing** about the **write** path (UI → SETTINGS), which is the `input`/`change`
listener. The user's symptom is entirely on the write path. So Fix 1 makes the slider show
the right starting number and then sit there inert.

> The CCR's Bug 1 section asserted: *"The problem is not broken input listeners."* **That
> conclusion was wrong.** The problem is *precisely* that the input listeners are never
> attached on this code path. The same section flagged its own risk honestly
> (*"This claim has not been verified by actual browser interaction… If that still fails,
> there is a third bug not captured in this CCR."*) — and that unverified caveat is exactly
> what shipped broken.

### Fix 2 — bump `SETTINGS_VERSION` 4→5 + init literal `48→128` — *a correct fix for a different bug*

This addresses the **stale `fireMaxActive` cap** (a user with `fireMaxActive: 8` in
localStorage silently capping fires). That is a real, separate issue, and the fix is sound:
`SETTINGS_VERSION = 5` (line 3939) and the init fallback literal is now `128` (line 6036),
matching `DEFAULTS.fireMaxActive = 128` (line 6296). The caps it feeds are real
(`m.size >= SETTINGS.fireMaxActive` at 40388; `this.cells.size < SETTINGS.fireMaxActive` at
40610; `MAX_FIRES_PER_CHUNK = SETTINGS.fireMaxActive` at 41843).

**But it has nothing to do with "the slider doesn't move the number."** Two unrelated fire
problems were investigated in one CCR and the cap fix was allowed to stand in for a UI fix it
never touched. Keep Fix 2 — just don't count it toward the reported symptom.

### Fix 3 — static span `128` — *cosmetic, fine, irrelevant to the symptom.* No issue.

### Fix 4 — `touch-action: none` on `.settings-panel input[type="range"]` — *incorrect diagnosis; a no-op for the actual bug*

This is the one to retract. The root-cause analysis is not physically correct:

1. **`touch-action` does not affect mouse input — at all.** Per the CSS / Pointer Events
   spec, `touch-action` governs whether the browser may consume **touch and pen** gestures
   for scrolling/zoom. A desktop user dragging a slider with a **mouse** is completely
   unaffected by any `touch-action` value on the element or its ancestors. The reported bug
   is on desktop with a mouse, so this CSS rule cannot change the behavior.
2. **The "Chromium resets its pointer compositor state on pointer-lock release, restoring UA
   `touch-action` precedence" mechanism does not exist.** There is no such documented
   behavior, and even if there were, it would be irrelevant to mouse input (see #1).
3. **The premise that `input[type=range]` has a UA-stylesheet default of
   `touch-action: none` that an ancestor `pan-y` "elevates and cancels"** is not a correct
   description of the cascade. `touch-action` is not inherited; ancestor scroll-container
   `touch-action` and element `touch-action` combine only at touch hit-test time, and again
   only for touch/pen.
4. **It directly contradicts Fix 1's section**, which claimed the drag interaction worked.
   Both can't be right; in fact neither identified the real cause (no listener attached).

**Net effect of Fix 4:** harmless CSS that does not fix the desktop bug. (It may marginally
help genuine *touch-device* slider-vs-scroll conflicts, so it isn't worth reverting urgently —
but it must not be recorded as the fix for this issue. The bug persisting after .19 shipped is
the empirical proof it didn't work.)

---

## The correct fix (single source of truth: move the bindings to the main-menu path)

The whole "CCR D1" migration already established the right pattern: **every settings listener
belongs in `attachSettingsEventListeners()`** (lines 22992–24389), because that function — and
only that function — is called unconditionally at `DOMContentLoaded` (line 24400), so it runs
on the start screen before any game exists. The fire block is the one that was missed.

**Fix: relocate the fire binding block (lines 29062–29100) out of `init()` and into
`attachSettingsEventListeners()`.** Concretely:

1. Cut the entire `// ===== GAMEPLAY - FIRE … =====` block (29061–29100), including the
   `bindFireToggle`/`bindFireSlider` helpers, the 12 bind calls, and the `btn-reset-gameplay-fire`
   handler.
2. Paste it inside `attachSettingsEventListeners()` — e.g. right after the
   "GAMEPLAY - INTERACTION" wiring that currently ends at line 24386, before the closing
   `logDebug('[Settings] Event listeners attached');` at 24388.
3. Delete the now-empty fire block from `init()` and leave a tombstone comment there matching
   the existing CCR-D1 style, e.g.:
   `// CCR-FIRE-002 addendum: fire setting listeners moved to attachSettingsEventListeners() so they bind on the start-menu path (init() only runs on game start).`

Why this is the right shape rather than "also call something from `btn-settings-main`":

- It is the **identical pattern** already applied to render distance, AO, shadows, texture
  resolution, movement, camera, interaction, etc. (the CCR-D1 tombstones). Fire is simply
  brought into line with the rest. No new mechanism, no new global, no new event.
- `attachSettingsEventListeners()` runs exactly once at `DOMContentLoaded`, so there is **no
  double-binding risk** — unlike `init()`, which would re-bind on every game start if a user
  could re-enter it without a reload. (Today the Quit button does `location.reload()` at line
  28308, so re-entry is via fresh page load; moving to the DOMContentLoaded path keeps it
  single-bind regardless.)
- The fire elements (`fire-spread-toggle`, `fire-max-active-slider`, etc.) exist in the static
  HTML at lines 3612–3641 from first paint, so `getElementById` resolves them fine at
  `DOMContentLoaded`. No timing dependency on a game being started.

**After the move, Fix 1 still pulls its weight:** `syncSettingsToUI()` (via `showPanel`) sets
the slider's starting value, and the now-attached `input` listener handles the drag. Read path
and write path are both present on the start-menu path for the first time.

### What this fix does *not* require

- No `SETTINGS_VERSION` change (Fix 2's bump stands on its own merits for the cap issue).
- No CSS / `touch-action` change (Fix 4 is unrelated; it can stay or go).
- No change to `bindFireSlider`/`bindFireToggle` internals — they are correct as written.

---

## Secondary finding — minor fire-settings optimization (not the bug)

`bindFireSlider`'s `input` listener calls `saveSettings()` on **every** `input` event
(line 29074), and `saveSettings()` does a full `JSON.stringify(SETTINGS)` +
`localStorage.setItem` each time (lines 22509–22511). Dragging a slider fires `input`
continuously (dozens of events/second), so each drag serializes the entire SETTINGS object
dozens of times. This is a systemic pattern across many sliders, not fire-specific, and it is
not the cause of this bug — but while the fire block is being relocated it is a cheap win to
either (a) persist on the `change` event (fires once at drag-end) instead of `input`, or
(b) debounce `saveSettings()` (e.g. trailing 150–250 ms). Live gameplay reads
`SETTINGS.fire*` directly each tick, so deferring the *persistence* does not delay the
*effect* of a slider change. Out of scope for the bug fix; worth a follow-up CCR if desired.

---

## Corrected status table

| Prior fix | Verdict | Keep? | Fixes the reported symptom? |
|---|---|---|---|
| Fix 1 — expose `syncSettingsToUI` | Correct, but read-path only | ✅ Keep | ❌ No (necessary, not sufficient) |
| Fix 2 — `SETTINGS_VERSION` 4→5 + init literal 128 | Correct fix for the *stale cap*, a different bug | ✅ Keep | ❌ No |
| Fix 3 — static span `128` | Cosmetic | ✅ Keep | ❌ No |
| Fix 4 — `touch-action: none` | **Misdiagnosed; no-op for desktop/mouse** | ⚠️ Harmless; do not credit as the fix | ❌ No |
| **NEW — move fire bindings into `attachSettingsEventListeners()`** | **The actual fix** | — | ✅ **Yes** |

## Verification that would actually have caught this (and should gate the real fix)

The automated suite verifies DOM structure and value round-trips but cannot prove a listener
is *attached on a given code path*. Two cheap checks close that gap:

1. **Path-specific listener assertion (automatable):** at `DOMContentLoaded`, before any game
   starts, assert that a fire control has a bound handler — e.g. dispatch a synthetic
   `new Event('input')` on `#fire-max-active-slider` after programmatically nudging
   `.value`, then assert `SETTINGS.fireMaxActive` changed and `#fire-max-active-val` updated.
   This fails today and passes after the move. (Native handle drag can't be synthesized
   headlessly, but the `input` event dispatch exercises the exact listener that's missing.)
2. **Manual, on the reported path (do this before closing):** load the page, **do not start a
   game**, go Settings → Gameplay → Fire, drag each slider, confirm the number tracks and
   `SETTINGS.fire*` updates in the console. Then start a game → pause → Fire and confirm the
   same (regression). This is the step the prior CCR listed as "pending" and shipped without.

---
---

# IMPLEMENTATION NOTE — 2026-06-23, build 2026-06-23.20 (the real fix, shipped)

The addendum's prescribed fix was implemented exactly as described, with one verified
scope correction the addendum itself anticipated.

## What changed in `voxEx.html`

1. **Relocated the fire binding block from `init()` into `attachSettingsEventListeners()`.**
   The entire `// ===== GAMEPLAY - FIRE =====` block (the `bindFireToggle`/`bindFireSlider`
   helpers, all 12 bind calls, and the `btn-reset-gameplay-fire` handler) was cut from inside
   `init()` and pasted into `attachSettingsEventListeners()` just before its closing
   `logDebug('[Settings] Event listeners attached')`. `attachSettingsEventListeners()` is
   called unconditionally at `DOMContentLoaded`, so the fire listeners now bind on the
   start-menu path before any game exists.

2. **Scope correction (`updateUIFromSettings` → `syncSettingsToUI`).** The Reset Fire handler
   called `updateUIFromSettings()`, which is a **function declaration scoped inside `init()`**
   (verified: sole definition is inside the `init()` body; it is not reachable from
   `attachSettingsEventListeners()`). Left as-is, "Reset Fire" from the main menu would throw
   `ReferenceError: updateUIFromSettings is not defined`. It was swapped for
   `syncSettingsToUI()` — the **module-scoped** single-source function that
   `updateUIFromSettings()` merely delegates to (its entire body is
   `if (typeof syncSettingsToUI === "function") { syncSettingsToUI(); return; }`). Behavior is
   identical; the call is now in scope. This bonus makes "Reset Fire" work from the main menu
   too (the other reset buttons remain in-game-only, unchanged).

3. **Tombstone left in `init()`** at the old location, matching the CCR-D1 comment style:
   "fire setting listeners moved to attachSettingsEventListeners() so they bind on the
   start-menu path (init() only runs on game start)."

4. **No double-binding.** `attachSettingsEventListeners()` has a one-time
   `settingsListenersAttached` guard and exactly one call site (DOMContentLoaded). Removing the
   block from `init()` means it never re-binds on game start.

## What was NOT changed (per the addendum)

- `SETTINGS_VERSION` / init-literal (Fix 2) — kept; it correctly addresses the *separate*
  stale-cap bug.
- `touch-action: none` on `.settings-panel input[type="range"]` (Fix 4) — left in place. It is
  a no-op for the mouse bug but harmless and marginally helps genuine touch slider-vs-scroll
  conflicts. **Not credited as the fix.**
- `bindFireSlider`/`bindFireToggle` internals — unchanged; they were always correct.
- The `saveSettings()`-on-every-`input` micro-optimization (secondary finding) — deferred to a
  follow-up CCR as the addendum recommended; out of scope here.

## Verification

- **Automated regression test added** (`tools/voxex-tests.html`, bootstrap describe block):
  dispatches a synthetic `new Event('input')` on `#fire-max-active-slider` in the pre-game
  `?test=1` iframe (which never starts a game, so `init()` never runs) and asserts both
  `SETTINGS.fireMaxActive` and the `#fire-max-active-val` span update. This **fails before the
  move** (no listener attached on the DOMContentLoaded path) and **passes after**. A test-only
  `_doc` getter was added to the `window.VoxEx` seam to give tests DOM access. **285/285 green.**
- **Manual check still recommended** before final close: load the page, do **not** start a
  game, Settings → Gameplay → Fire, drag each slider, confirm the number tracks; then start a
  game → pause → Fire and confirm the same (regression). The automated `input`-dispatch test
  exercises the exact listener that was missing, but cannot synthesize a native handle drag.

## Corrected status table (final)

| Fix | Verdict | Fixes the reported symptom? |
|---|---|---|
| Fix 1 — expose `syncSettingsToUI` | Correct; read-path only (necessary, not sufficient) | ❌ |
| Fix 2 — `SETTINGS_VERSION` 4→5 + init literal 128 | Correct fix for the *stale cap* (different bug) | ❌ |
| Fix 3 — static span `128` | Cosmetic | ❌ |
| Fix 4 — `touch-action: none` | Misdiagnosed; no-op for desktop/mouse; harmless, kept | ❌ |
| **Move fire bindings into `attachSettingsEventListeners()` (build .20)** | **The actual fix** | ✅ **Yes** |

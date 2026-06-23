# CCR — Fire Settings Panel: UI Never Synced from SETTINGS on Start-Menu Path

**ID:** VOXEX-CCR-FIRE-002
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-23
**Status:** 🟢 Implemented (build 2026-06-23.18)
**Scope:** Settings UI › Start-menu entry path › `syncSettingsToUI` exposure; Fire system › stale localStorage cap

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

## Pre-Implementation Safety Checks

- [ ] Confirm `syncSettingsToUI` function definition ends before the proposed `window.xxx` assignment
- [ ] Confirm no existing `window.syncSettingsToUI =` anywhere in file (grep: zero matches confirmed)
- [ ] Confirm `SETTINGS_VERSION` appears only once as a `const` declaration (search before adding)
- [ ] Confirm `DEFAULTS.fireMaxActive` is 128 at time of implementation (was changed in CCR-FIRE-001)
- [ ] Update `fireMaxActive` fallback literal at line 6027 to `128` (NOT `DEFAULTS.fireMaxActive` — DEFAULTS is declared at line 6225, after SETTINGS; using it would throw ReferenceError at boot)
- [ ] Run 283/283 tests green after all three changes
- [ ] Manually verify: open start-menu → Settings → Gameplay → Fire; confirm slider shows SETTINGS value, toggles show correct state
- [ ] Manually verify: start a game → pause → Settings → Gameplay → Fire; confirm same (regression check)

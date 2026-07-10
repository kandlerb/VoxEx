# CCR — Menu Overlay Lag: Settings Menu Stutter from `#blocker` Backdrop-Filter

**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** Proposal / report only — no code applied yet
**Scope:** Eliminate the lag/stutter felt in the **Settings** menu (start-screen *and* in-game pause flow) while leaving the main pause menu, seed menu, and world-creation menu untouched (they already run smoothly).

---

## Summary

- The lag is **not** caused by JavaScript (no `setInterval`, no observers, no settings-specific loop) and **not** by the settings DOM being heavy on its own. It is a **GPU compositing cost** from one CSS rule.
- **Root cause:** `#blocker` (the full-screen container that hosts the pause menu, controls menu, and **all** settings panels) has `backdrop-filter: blur(4px)` (line **278**; the touch variant `blur(2px)` at line **250**). A `backdrop-filter` ancestor forces the browser onto a slow path for its whole subtree — main-thread (synchronous) scrolling and a re-rasterized blur region on every repaint.
- **Why only Settings feels it** (all three are confirmed in code):
  1. The settings panels are the only menus in `#blocker` that are **large and scrollable** — a big subtree under the `backdrop-filter` ancestor, so scroll/repaint hits the slow path hard. The **main pause menu** is short (no scroll) so the same blur is cheap; the **seed menu** and **create-world panel** are **separate top-level overlays with no `backdrop-filter`** (so world creation is smooth even with its live terrain preview).
  2. **In-game only**, the cost compounds: `animate()` (line **44165**) calls `renderFrame()` (line **44301**) **unconditionally** every frame — the 3D world keeps repainting behind the menu, so the blur is **re-computed every frame** (not cached), even while paused.
  3. **In-game only**, `updateVisualEffects()` (line **43169**) animates the held-torch flicker with `performance.now()` (lines **43180**, **43210–43213**) instead of the paused-aware `skyClock`, so the scene behind the menu literally changes pixels every frame — defeating any chance the browser caches the blurred backdrop.
- **Recommended fix:** drop the `backdrop-filter` from `#blocker` and compensate with a slightly darker solid scrim + opaque menu card (one CSS edit, ~3 lines). This removes the slow-path scrolling/repaint entirely and fixes **both** the start-screen and in-game cases. Two optional in-game-only hardening changes are listed for defense-in-depth.

---

## Context map (verified)

| Menu | DOM home | Has `backdrop-filter`? | Scrollable? | Reported |
|---|---|---|---|---|
| Main pause menu | `#blocker` → `#instructions` → `#main-pause-menu` | **yes** (inherited from `#blocker`) | no (short) | fine |
| Controls menu | `#blocker` → `#instructions` → `#controls-menu` | **yes** | no | (not reported) |
| **Settings (+ sub-panels)** | `#blocker` → `#instructions` → `.settings-panel` | **yes** | **yes** (`#instructions` `overflow-y:auto`, line **1877**) | **laggy** |
| Seed menu | `#seed-menu` (top-level, line **1918**) | no | yes | fine |
| Create-world | `#create-world-panel` (top-level, line **1998**) | no | yes | fine |

The render loop (`animate()`) is started at **line 24435**, inside the world-init path — **not** at page load. So at the pure start screen there is no 3D canvas repaint; the start-screen settings lag is **purely** the `backdrop-filter` slow-path scrolling. In-game, the always-on `renderFrame()` adds the per-frame blur recompute on top.

---

## Root cause detail

### The expensive rule — `#blocker` (lines 266–279)

```css
#blocker {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 999;
    backdrop-filter: blur(4px);   /* ← line 278: the cost */
}
```

And the touch variant (line **250**):

```css
body.touch-mode #blocker { backdrop-filter: blur(2px); }
```

`backdrop-filter` on a full-screen ancestor of a large, scrollable subtree is a well-known performance trap: it disables threaded/async scrolling for the subtree (scroll handling moves to the main thread) and forces the filtered backdrop to be re-rasterized on repaint. On a weak/integrated laptop GPU this turns settings scrolling and interaction into visible stutter. The `#instructions` card is only `rgba(20, 20, 20, 0.9)` (line **283**), so the blur is also still visible through it — it isn't even fully hidden.

### In-game amplifier #1 — render loop never idles (line 44298–44314)

```js
// Render with timing
perfMonitor.beginSection('render');
const renderStartMs = performance.now();
renderFrame();                       // ← runs every frame, even while paused in a menu
perfMetrics.renderTime = performance.now() - renderStartMs;
perfMonitor.endSection('render');
...
requestAnimationFrame(animate);      // ← loop never stops
```

Physics/day-night are already gated by `isGameplayActive()` (line **44237**), but `renderFrame()` is not. So behind an open menu the full world is redrawn ~60×/s, and the browser must recompute the blurred backdrop each time.

### In-game amplifier #2 — torch flicker uses a non-paused clock (lines 43176–43213)

```js
if (torchActive && torchLight) {
    torchLight.intensity = (SETTINGS.torchIntensity * 3) + Math.sin(time * 0.003) * 0.5;   // time = performance.now()
    ...
    const flameScale = 1.0 + Math.sin(time * 0.001) * 0.03 + Math.sin(time * 0.0023) * 0.01; // keeps changing while paused
}
```

`time` is `performance.now()` (line **44174**), not the paused-aware `skyClock` that the rest of the engine uses to freeze waves/foam/caustics on pause (e.g. lines **44238**, **43863**, **44086**). So with a torch active, the scene keeps changing while paused — the blurred backdrop can never settle.

---

## The fix

### Primary change (recommended) — remove `backdrop-filter` from `#blocker`

One CSS edit. Fixes start-screen scroll lag completely and removes the in-game per-frame blur recompute. Compensate for the lost frosting with a darker solid scrim and a fully opaque menu card so the menus still read clearly.

**Change — line 272 + delete line 278:**

```css
#blocker {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.78);  /* was 0.6 — darker scrim replaces the blur */
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 999;
    /* backdrop-filter removed: it forced main-thread scrolling + per-frame blur
       recompute for the large scrollable settings subtree (menu-overlay-lag CCR). */
}
```

**Change — line 250 (drop the touch blur too):**

```css
/* body.touch-mode #blocker — backdrop-filter blur removed (same lag cause on mobile GPUs). */
```

**Change — line 283 (make the menu card fully opaque so it no longer depends on the blur for contrast):**

```css
#instructions {
    color: white;
    text-align: center;
    background: rgba(20, 20, 20, 0.97);  /* was 0.9 — solid enough to read without the blur */
    ...
}
```

> Net effect: identical layout and behavior, the menus look near-identical (slightly darker dim instead of frosted glass), and the slow GPU path is gone. Lowest-risk option — no JS touched, no IDs changed, nothing to keep in sync.

### Optional hardening A (in-game only) — idle the render loop behind a blocking menu

Stops the world repainting at 60 fps while a menu is open. Safe because nothing in the world moves while paused.

**Change — render section, line ~44298:**

```js
// Only repaint when the scene can actually change. While a blocking menu is open
// the world is frozen, so render at a low keep-alive cadence instead of full rate.
// (Live setting previews still update within ~100 ms; resume restores full rate.)
const blockerEl = uiManager?.elements?.blocker;
const menuOpen = blockerEl && blockerEl.style.display !== "none";
const lowPower = !isGameplayActive() && menuOpen;
if (!lowPower || (frameCount % 6 === 0)) {   // ~10 fps while idling in a menu
    perfMonitor.beginSection('render');
    const renderStartMs = performance.now();
    renderFrame();
    perfMetrics.renderTime = performance.now() - renderStartMs;
    perfMonitor.endSection('render');
}
```

> Throttle (not a full stop) is chosen so live setting previews — toggling shadows, water mode, sky/stars, AO rebuilds — still show up while the menu is open, and there's no black-screen risk from a missed dirty flag. `frameCount` is already incremented each frame (line **44234**). Lower the divisor for snappier previews, raise it for less GPU use.

### Optional hardening B (in-game only) — make the torch flicker paused-aware

So the scene is fully static while paused (also matches every other animated uniform in the engine).

**Change — line 43180 / 43210–43213 / 43223–43226:** swap the `time` used for the held-torch flicker math to the paused-aware `skyClock` (already in scope), e.g.:

```js
const torchClock = isGameplayActive() ? time : skyClock; // freeze flicker while paused
torchLight.intensity = (SETTINGS.torchIntensity * 3) + Math.sin(torchClock * 0.003) * 0.5;
...
const flameScale = 1.0 + Math.sin(torchClock * 0.001) * 0.03 + Math.sin(torchClock * 0.0023) * 0.01;
```

> Pairs naturally with hardening A: with the flicker frozen, the throttled idle frames are visually identical, so the cadence in A could be dropped to "render once on entry" later if desired. Not required if the Primary change lands — without the blur, a static-vs-near-static backdrop costs little either way.

### Out of scope (related, not reported)

`#inventory-overlay` has the same `backdrop-filter: blur(2px)` (line **1422**) but is a small, non-scrolling grid and isn't reported as laggy. If the frosted look is dropped from `#blocker` for consistency, consider matching it here in a follow-up — not part of this CCR.

---

## Cross-system effects & risk summary

- **Primary change is CSS-only.** No JS, no DOM IDs, no settings, no identifier declarations — cannot introduce a shadowing or wiring bug, and the single-file rule is honored.
- **Visual delta:** menus lose the frosted-glass blur and gain a slightly darker, fully-opaque backdrop. Functionally and structurally identical; readability improves (opaque card). If the blur is considered essential to the look, prefer hardening A/B to keep it cheap instead — but on weak GPUs removing it is the reliable fix.
- **Pause/controls menus** share `#blocker`, so they get the same (small) benefit. **Seed/create-world** are untouched (never had the blur).
- **Hardening A risk:** a throttled render path. Verify the menu still shows the frozen world behind it on entry and that live previews update; the `% 6` keep-alive guarantees a redraw within ~100 ms so there is no stuck-frame risk. Gate strictly on `!isGameplayActive() && menuOpen` so gameplay framerate is never throttled.
- **Hardening B risk:** purely cosmetic (torch flicker pauses while the menu is open, which is expected). Uses `skyClock`, already the engine's paused-aware clock — no new state.
- **No per-frame work is added** anywhere; hardening A *removes* per-frame work.

---

## Verification plan (before/after applying)

1. Serve over localhost; open `tools/voxex-tests.html` (~204 tests) — confirm no regressions (this is a CSS/render-gate change, so all should stay green).
2. **Start-screen path:** open Settings from the main menu, scroll every sub-panel (Graphics › Lighting / Water / Effects / Sky are the tall ones) with wheel, trackpad, and touch drag — confirm smooth scrolling. Compare against the current build to confirm the stutter is gone.
3. **In-game path:** load a world, pause → Settings, repeat the scroll matrix; with hardening A, watch the perf overlay (`O`) and confirm idle GPU/frame cost drops while the menu is open. Toggle a live-preview setting (shadows, water fast mode, stars) and confirm it still updates within ~100 ms.
4. Confirm the menus still read clearly against bright/daytime scenes (opaque card + 0.78 scrim).
5. Sanity-check touch mode (`body.touch-mode`) settings scrolling on a phone/emulated coarse pointer — the `blur(2px)` removal should help there most.
6. On apply: update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (top of `voxEx.html`).

---

## Recommendation

Apply the **Primary change** alone first — it is a ~3-line CSS edit that targets the exact root cause and fixes both contexts with essentially zero risk. Add **hardening A** if the in-game pause still shows any GPU pressure on the weakest target hardware, and **hardening B** alongside A for a fully static paused scene. All changes stay within `voxEx.html`.

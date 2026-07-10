> **Status: SHIPPED — touch controls are live** _(marked 2026-07-06; see CLAUDE.md Documentation Index)_

# VoxEx Mobile Controls — Implementation Plan

**Status:** Ready for implementation
**Target:** Full touch-playable parity in `voxEx.html` (single file, no exceptions)
**Control scheme:** Left virtual joystick + right-region drag-to-look + gesture mine/place + on-screen action buttons (Minecraft PE style)
**Audience:** This document is written for an autonomous coding agent. Follow it phase by phase, in order. Each phase ends with a verification step — do not proceed to the next phase until it passes.

---

## 0. How to Use This Document

1. **Read `CLAUDE.md` first.** Every rule in it applies. The non-negotiables for this feature:
   - All code goes in `voxEx.html`. No new files, no external assets.
   - Voxel aesthetic for any 3D additions (none expected here — this is DOM/CSS/JS input work).
   - New settings get a default in `DEFAULTS`, are wired into `SETTINGS`, get a DOM binding in the settings UI, and round-trip through `saveSettings()` / `updateUIFromSettings()`.
   - Use `logDebug("[Touch] ...")`, never raw `console.log`. Sparse logging only — never per-frame or per-touchmove.
   - No allocations, closures, or array methods in hot paths (`touchmove`/`pointermove` handlers ARE hot paths — fire ~60-120 Hz).
   - Before declaring any new identifier, search the file for it. Do not shadow `scene`, `camera`, `controls`, `chunks`, `SETTINGS`, `WORLD_CONFIG`.
   - Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (~line 3388) when done.
2. **Line numbers in this document are hints, not gospel.** They were verified against build `2026-06-12.1` (~41,856 lines). The file changes; always re-locate by searching the **identifier name** given alongside each line number.
3. **One phase per commit/change-set**, with the Change Reporting format from `CLAUDE.md` (Summary / Changes / Rationale / Safety Checks).
4. **Desktop must remain byte-for-byte behaviorally identical.** Every touch code path must be gated so that a desktop user with a mouse sees zero change. This is the single most important regression constraint.

---

## 1. Goals and Non-Goals

### Goals (full parity)

| Desktop input | Mobile equivalent |
|---|---|
| WASD movement | Left virtual joystick (analog) |
| Mouse look | Drag anywhere on right/look region |
| SHIFT sprint | Push joystick past outer ring (sprint zone) |
| SPACE jump / double-tap fly | Jump button; double-tap jump button toggles flight |
| C crouch / fly down | Crouch button (toggle; hold-to-descend while flying) |
| Left click hold = mine | Touch-and-hold on look region (≥200 ms) drives existing hold-to-mine |
| Right click = place | Short tap (<200 ms, <8 px movement) on look region |
| 1-9 / scroll hotbar | Tap hotbar slot; horizontal swipe across hotbar cycles |
| E inventory | Inventory button; tap-to-assign inside inventory |
| F torch | Torch button |
| V third person | Camera button (in expandable button cluster or pause menu) |
| ESC pause | Pause button (top corner) |
| F5/F9 quick save/load | Buttons in pause menu (mobile-visible) |
| O / ~ overlays | Buttons in pause menu (mobile-visible) |

### Non-Goals (explicitly out of scope)

- Gamepad/controller support.
- Raycasting from the touch point instead of the crosshair (crosshair-centered targeting is retained — see §3.4 rationale).
- Key-rebinding UI for touch layout (layout is fixed apart from the settings in Phase 7).
- Changes to terrain, rendering, worker, or persistence systems. **This feature must not touch the `__TERRAIN_FUNCS_*` markers or anything in the worker template.**

---

## 2. Ground-Truth Map of the Current Input Architecture

Everything below was verified in the current build. This is the contract the touch layer plugs into.

### 2.1 Pointer lock & camera

| What | Identifier | ~Line |
|---|---|---|
| Controls instantiation | `controls = new PointerLockControls(camera, document.body)` | 26557 |
| Camera rig (r160 fix: camera is child of `cameraRig`; physics moves `cameraRig.position`) | `cameraRig` | 26568–26591 |
| First-person look | Handled internally by PointerLockControls on `mousemove` (rotates `camera` directly, YXZ order) | — |
| Third-person look | Custom `document` `mousemove` handler feeding `thirdPersonOrbitYaw` / `thirdPersonOrbitPitch` (declared ~13035), then `applyThirdPersonCameraRotation()` | 26596–26610 |
| Camera euler order set explicitly | `camera.rotation.order = 'YXZ'` | 13383, 34976 |
| Lock event → resume gameplay | `controls.addEventListener("lock", ...)` → `clearMenuNavigationStack()`, `setPauseState(false, "gameplay")` | 28233 |
| Unlock event → pause | `controls.addEventListener("unlock", ...)` → `setPauseState(true, "pause")` unless chat/inventory/poseDebug; then `resetTransientInput()` | 28240 |
| Pause state machine | `setPauseState(isPaused, reason)` — **NOTE: line ~19577 calls `controls.lock()` itself when unpausing** | 19574 |
| Other `controls.lock()` call sites (resume buttons etc.) | 8601, 19578, 23146, 26628, 26655, 26720, 41776 | — |
| `controls.unlock()` call sites | 8340, 8590, 34157 | — |

### 2.2 The 18 `controls.isLocked` gate sites (complete list)

These gate "is gameplay active?" and are the core of the Phase 1 refactor:

| ~Line | Context |
|---|---|
| 8340 | UIManager — unlock before opening something |
| 8589, 8600 | UIManager — inventory open/close lock juggling (unlock on open, re-lock on close via `setTimeout(() => controls.lock(), 50)`) |
| 19577 | `setPauseState` — re-locks when unpausing |
| 26597 | Third-person `mousemove` handler (desktop-only by nature) |
| 34156 | Unlock guard somewhere in third-person/pose logic |
| 40527 | Sprint FOV: `isSprinting && !isFlying && controls.isLocked` |
| 41500 | Per-frame hold-to-mine progress (`breakingBlock && controls.isLocked`) |
| 41527 | Per-frame start-mining (`leftMouseHeld && controls.isLocked && _highlightHasHit`) |
| 41535 | Per-frame repeat-place (`rightMouseHeld && controls.isLocked`) |
| 41547 | Per-frame gameplay block in `animate()` |
| 41572 | Torch light pool update |
| 41738, 41787 | `onKeyDown` ESC / E handling |
| 41794 | `onKeyDown` early return for gameplay keys |
| 41912 | `onMouseClick` early return |
| 41962, 41963 | `updateMovementIndicators` args (sprint/crouch icons) |

### 2.3 Keyboard / input state

| What | Identifier | ~Line |
|---|---|---|
| Bindings table | `KEY_BINDINGS`, `CODE_TO_ACTION` | 41640–41662 |
| Handlers | `onKeyDown` (41687), `onKeyUp` (41849) | — |
| Movement state booleans | `moveForward`, `moveBackward`, `moveLeft`, `moveRight`, `isSprinting`, `spacePressed`, `flyUp`, `flyDown`, `isCrouching` (toggle), `isFlying` (toggle), `canJump` | — |
| Jump / double-tap-fly logic | inside `onKeyDown` "jump" case: `now - lastSpaceTime < 300` toggles `isFlying`; single press sets `velocity.y = SETTINGS.jumpForce` if `canJump` | 41803–41810 |
| Torch toggle logic | inside `onKeyDown` "torch" case (sets `torchActive`, viewmodel visibility) | 41832–41845 |
| Stuck-input guard | `resetTransientInput()` (41672), wired to `blur` + `visibilitychange` | 28261–28265 |
| Typing guard | `isTypingInInput()` | 41624 |

### 2.4 Mouse / block interaction

| What | Identifier | ~Line |
|---|---|---|
| Mine/place entry | `onMouseClick` — sets `leftMouseHeld` / `rightMouseHeld`; place calls `tryPlaceBlock(x,y,z,fx,fy,fz)` | 41911–41954 |
| Mouse release | `onMouseUp` — clears held flags, cancels `breakingBlock` | 41868–41878 |
| Block targeting | `pickVoxel(origin, dir, range)` — DDA raycast from `getPlayerWorldPosition()` (10582) along `controls.getDirection(_pickDirTmp)`, range `SETTINGS.blockReach` | 39924 |
| Hold-to-mine per frame | `breakingBlock` / `breakProgress` / `BREAK_TIME` logic in `animate()` | 41500–41542 |
| Place | `tryPlaceBlock` | 41894 |
| Hotbar scroll | `onMouseWheel` — wraps `currentHotbarSlot` 1–9, calls `highlightSlot()` + `updateHeldBlock()` (33241) | 41966–41975 |
| Listener registration (ALL on `window`) | `keydown/keyup/mousedown/mouseup/wheel{passive:false}/resize/blur` + `document` `visibilitychange` | 28255–28265 |

### 2.5 UI layer

| What | Identifier / ID | ~Line |
|---|---|---|
| HUD elements | `#crosshair`, hotbar slots, `#movement-indicators`, `#torch-overlay`, `#debug-overlay`, perf overlay | CSS from ~45 |
| UIManager | `class UIManager` — `openInventory()`, `closeInventory()`, `isInventoryOpen()`, `highlightSlot()`, `updateBlockNameDisplay()`, `updateMovementIndicators()` | 8020 |
| Pause menus | `#blocker`, `#main-pause-menu`, `#settings-menu`, `#controls-menu`, `navigateMenuBack()`, `clearMenuNavigationStack()` | 26612+ |
| Toasts | `#toast-container` | CSS ~333 |
| Misc actions | `toggleThirdPerson()` (34943), `quickSave()` (21227), `quickLoad()` (21267) | — |

### 2.6 Settings

`SETTINGS` (~5067–5343), `DEFAULTS` (~5284–5410), persisted to `localStorage["voxex_settings"]`, DOM bindings wired ~28800+, functions `saveSettings()` / `updateUIFromSettings()`.

### 2.7 Existing mobile support: **none**

Verified: zero occurrences of `touchstart`, `pointerdown`, `maxTouchPoints`, `matchMedia`, or mobile CSS media queries in `voxEx.html`. The viewport meta (line ~5) is `width=device-width, initial-scale=1.0`. You are building this from scratch — there is no legacy touch code to reconcile with.

---

## 3. Design Decisions (read before writing any code)

### 3.1 Use Pointer Events, not Touch Events

Use `pointerdown` / `pointermove` / `pointerup` / `pointercancel` with `e.pointerType === "touch"` checks and `setPointerCapture()` per control. Rationale: one API for mouse+touch+pen, per-pointer `pointerId` makes multi-touch tracking trivial, and `touch-action: none` in CSS removes the passive-listener/`preventDefault` headaches that plague raw touch events. Three.js r160's PointerLockControls already uses pointer events internally; ours coexist cleanly because pointer lock never engages on touch.

### 3.2 Touch writes into the EXISTING input state — no parallel movement system

The joystick and buttons set the same globals the keyboard sets (`isSprinting`, `spacePressed`, `flyUp`, `isCrouching`, `isFlying`, `leftMouseHeld`, `rightMouseHeld`, …). For analog movement, add exactly two new globals (`touchMoveX`, `touchMoveZ`, range −1..1) consumed at the one place `applyPlayerVelocity()` (~40271) converts the booleans into a direction vector. Physics, collision, swimming, flight, animation, and viewmodel code remain untouched and cannot diverge between input methods.

**Mandatory refactor:** extract the bodies of the `onKeyDown` "jump" and "torch" cases into named functions (`handleJumpPressed()`, `handleJumpReleased()`, `toggleTorch()`) called by both keyboard and touch paths. Never copy-paste that logic — the double-tap-fly timing (`lastSpaceTime`, 300 ms) must live in exactly one place. Search first: confirm these names are unused.

### 3.3 "Virtual gameplay focus" replaces pointer lock on touch

Pointer lock does not exist on touch devices (`controls.lock()` would fail or throw). Introduce:

```javascript
/** True when touch controls own the screen instead of pointer lock. */
let virtualGameplayFocus = false;

/**
 * Whether gameplay input should be processed (pointer-locked on desktop,
 * or touch session active on mobile).
 * @returns {boolean}
 */
function isGameplayActive() {
    return (controls && controls.isLocked) || virtualGameplayFocus;
}
```

…and two transition helpers, `enterGameplay()` / `exitGameplay(reason)`, that on desktop call `controls.lock()` / `controls.unlock()` (preserving current behavior exactly, including the `setTimeout(..., 100)` security delay), and on touch set `virtualGameplayFocus` and invoke the same bodies the `"lock"` / `"unlock"` event handlers run today (`clearMenuNavigationStack()` + `setPauseState(false, "gameplay")`, and `setPauseState(true, "pause")` + `resetTransientInput()` respectively). This keeps a single pause/resume state machine for both platforms.

### 3.4 Mine/place stays crosshair-centered

Mining and placing keep using the existing `pickVoxel(getPlayerWorldPosition(), controls.getDirection(...), SETTINGS.blockReach)` pipeline aimed at the screen-center crosshair — exactly like Minecraft PE's default "Split Controls: off" mode. The look-region gesture only decides *when* to mine/place, never *where*. Rationale: reuses the per-frame highlight/`_highlightHasHit`/`breakingBlock` machinery at ~41500–41542 with zero new raycast code, and avoids the fat-finger problem of raycasting under a fingertip.

Gesture grammar on the look region (single source of truth — implement as a tiny state machine, §8):

- **Drag** (movement ≥ 8 px): look around. Once a gesture becomes a drag it can never become a tap.
- **Short tap** (release < 200 ms AND moved < 8 px): **place** block (mirrors right-click body of `onMouseClick`).
- **Hold** (≥ 200 ms, still allowed to drag while holding): **mine** — set `leftMouseHeld = true` so the existing hold-to-mine frame logic does the work; clear on release exactly like `onMouseUp`. Dragging while holding continues mining at the crosshair, which is correct PE-like behavior.
- A settings toggle (`touchSwapMinePlace`, Phase 7) swaps tap/hold meanings for users who prefer tap-to-mine.

### 3.5 Touch UI is a DOM overlay, not canvas-rendered

All touch controls are HTML/CSS inside one root `<div id="touch-controls">` — same approach as the existing HUD. z-index above HUD, **below** `#blocker`/menus/`#toast-container` so pausing visually disables gameplay controls. The overlay (and all its listeners' effects) is inert unless touch mode is active.

### 3.6 Activation model

```
touchControls setting: "auto" (default) | "on" | "off"
IS_TOUCH_CAPABLE = (navigator.maxTouchPoints ?? 0) > 0 || matchMedia("(pointer: coarse)").matches
touchModeActive = setting === "on" || (setting === "auto" && IS_TOUCH_CAPABLE && !matchMedia("(pointer: fine)").matches)
```

The `(pointer: fine)` exclusion keeps touch-screen laptops on mouse controls by default; they can force `"on"`. Compute once at boot into a `let touchModeActive`, recompute when the setting changes. Every touch listener body starts with `if (!touchModeActive) return;`.

---

## 4. Phase 0 — Scaffolding, Detection, and Page Behavior

**Objective:** the page behaves like an app on a phone (no scroll/zoom/selection), touch mode is detectable, and an empty overlay container exists. No gameplay changes yet.

1. **Viewport meta** (line ~5): replace with
   `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />`
   (`viewport-fit=cover` enables `env(safe-area-inset-*)` used in Phase 6.)
2. **Global CSS additions** (in the existing `<style>` block, near the body/canvas rules):
   - `html, body { overscroll-behavior: none; }` — kills pull-to-refresh.
   - On the canvas container and `#touch-controls`: `touch-action: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none;`
   - Menus/inventory keep `touch-action: manipulation` (they need taps but not double-tap zoom) and `touch-action: pan-y` on any scrollable settings list.
3. **Detection constants** — add near `KEY_BINDINGS` (~41640) per §3.6: `IS_TOUCH_CAPABLE` (const), `touchModeActive` (let), and a `recomputeTouchMode()` helper. Log once: `logDebug("[Touch] capable=" + IS_TOUCH_CAPABLE + " active=" + touchModeActive);`
4. **Overlay root** — add `<div id="touch-controls" aria-hidden="true"></div>` to the HUD region of the HTML, `display: none` by default; shown only when `touchModeActive && isGameplayActive()`. Children are created in later phases. Position: `position: fixed; inset: 0; pointer-events: none;` — individual controls re-enable `pointer-events: auto` on themselves; the look region is a child that covers the remainder.
5. **Suppress synthetic/legacy events when touch mode is active.** The window-level `mousedown`/`mouseup`/`wheel` listeners (28255–28259) will receive browser-synthesized mouse events after taps, causing double actions. Add as the FIRST line of `onMouseClick` (41911), `onMouseUp` (41868), and `onMouseWheel` (41966): `if (touchModeActive) return;`. Also register on `#touch-controls` and the canvas: `contextmenu` → `preventDefault()` when `touchModeActive` (long-press context menu).
6. **AudioManager unlock:** Web Audio requires a user gesture. Find where `AudioManager` (~7663) resumes its context on desktop (likely on pointer-lock/click); ensure the first `pointerdown` on the touch overlay also calls the same resume path.

**Verification:** open in Chrome DevTools device emulation (e.g. Pixel 7). Page does not scroll, zoom, or show selection/callout on long-press. Console shows the `[Touch]` boot line. On desktop (fine pointer), `touchModeActive` is false and everything behaves exactly as before. Run `tools/voxex-tests.html` — all ~204 tests still pass.

---

## 5. Phase 1 — Gameplay-Focus Abstraction (the critical refactor)

**Objective:** all "is the player playing?" logic flows through `isGameplayActive()`; pause/resume works on touch without pointer lock. This phase has the highest regression risk — do it alone, test thoroughly.

1. Add `virtualGameplayFocus`, `isGameplayActive()`, `enterGameplay()`, `exitGameplay(reason)` per §3.3. Place them near the controls setup (~26557). Implementation detail: refactor the bodies of the existing `"lock"`/`"unlock"` handlers (28233–28249) into named functions (`onGameplayFocusGained()`, `onGameplayFocusLost()`); the PointerLockControls events AND the touch path both call them. Guard `onGameplayFocusLost()` so a spurious pointer-lock `unlock` event can't fire it while `virtualGameplayFocus` is true.
2. **Replace the reads** of `controls.isLocked` listed in §2.2 with `isGameplayActive()` — every site EXCEPT:
   - 26597 (third-person mousemove): keep as-is; it is inherently mouse-only. Touch third-person look is handled in Phase 2.
   - Sites that immediately call `controls.unlock()` (8340, 8589→8590, 34156→34157): convert to `exitGameplay()` so the touch path also works (e.g. opening inventory must drop gameplay focus on mobile too).
3. **Convert the `controls.lock()` call sites** (8601, 19577, 19578, 23146, 26628, 26655, 26720, 41776) to `enterGameplay()`. Pay special attention to:
   - `setPauseState` (~19577): it self-locks when unpausing. `enterGameplay()` on touch must set `virtualGameplayFocus = true` *before* calling `setPauseState(false, ...)` and the function must be re-entrancy safe (it will be called from inside `setPauseState` on desktop today — trace the call graph and make sure you don't create infinite recursion: `enterGameplay → setPauseState → enterGameplay`). Recommended: `enterGameplay()` returns early if `isGameplayActive()` is already true.
   - Inventory close (~8600): `setTimeout(() => controls.lock(), 50)` → `setTimeout(() => enterGameplay(), 50)`.
4. **ESC equivalent:** nothing to do for the key itself (phones have no ESC); the pause **button** comes in Phase 4. But verify `onKeyDown`'s ESC branch (41731–41780) still works on desktop after the refactor.
5. **`resetTransientInput()` (41672):** extend it to also clear (future) touch state — add a `resetTouchInput()` call stub now (empty function, filled in Phases 3–4) so there is exactly one reset path. `blur`/`visibilitychange` (28261–28265) then cover touch too.
6. **Start-game flow:** find where the player first clicks the blocker/start button to lock (blocker wiring ~26612+, also `19578`, `23146`). On touch these must call `enterGameplay()`; the click handler already exists, taps will fire it — just confirm the handler is `click`-based (taps synthesize clicks on buttons) and doesn't require a `mousedown` that step 5 of Phase 0 now swallows. **Important:** Phase 0's synthetic-mouse suppression must only apply to the *gameplay* window listeners, never to UI buttons/menus — those use per-element `click` handlers and must keep working from taps.

**Verification (desktop, real browser):** start game, pause (ESC), resume via button and via ESC, open/close inventory with E, quick save/load, third-person toggle, sprint FOV, mining/placing — all identical to before. Diff-check that no `controls.isLocked` read remains except the intentional ones (`grep` should find only ~26597 and PointerLockControls internals). **Verification (DevTools touch emulation):** set setting to `"on"` via console, call `enterGameplay()` manually, confirm `setPauseState(false)` runs, HUD shows, and `exitGameplay()` brings the pause menu back. Run the full test suite.

---

## 6. Phase 2 — Touch-Look (camera rotation)

**Objective:** dragging on the look region rotates the camera in first AND third person.

1. **Look region DOM:** a child of `#touch-controls`, `position: absolute; inset: 0; pointer-events: auto;` placed UNDER the joystick/buttons in stacking order so those claim their own pointers. It owns any pointer not captured by another control.
2. **State (module-level, no per-event allocation):**
   ```javascript
   let lookPointerId = -1;
   let lookLastX = 0, lookLastY = 0;
   let lookStartX = 0, lookStartY = 0, lookStartTime = 0; // for Phase 4 gestures
   let lookIsDrag = false;
   ```
3. **pointerdown** (touch only, `isGameplayActive()`, no existing look pointer): record id/positions/time, `setPointerCapture(e.pointerId)`.
4. **pointermove** (matching `pointerId` only): compute `dx = e.clientX - lookLastX`, `dy = e.clientY - lookLastY`, update lasts; if total displacement from start exceeds the 8 px slop, set `lookIsDrag = true`. Then rotate:
   - **First person:** rotate the camera directly — safe because PointerLockControls only writes rotation from `mousemove` while locked, which never happens on touch:
     ```javascript
     camera.rotation.order = 'YXZ'; // set once at touch-session start, matches 13383/34976
     camera.rotation.y -= dx * sens;
     camera.rotation.x -= dy * sens;
     camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
     ```
     where `sens = SETTINGS.touchLookSensitivity * 0.0025` (Phase 7; hardcode `0.0025` with a `// TODO Phase 7` until then). **Verify against the camera-rig setup (26568–26591):** in the modern path the camera itself carries look rotation while `cameraRig` carries position — confirm the rig's rotation stays identity (it is copied once at init, line ~26574; check whether `cameraRig.rotation` is ever non-zero in play; if it is, apply yaw to the rig and pitch to the camera to match whatever PointerLockControls does in this build).
   - **Third person** (`isThirdPerson`): mirror the desktop handler at 26596–26610 — adjust `thirdPersonOrbitYaw` / `thirdPersonOrbitPitch` with the same signs and `ORBIT_PITCH_MIN/MAX` clamps, then call `applyThirdPersonCameraRotation()` immediately.
5. **pointerup / pointercancel:** hand off to the Phase 4 gesture classifier (tap vs hold vs drag); reset `lookPointerId = -1`.
6. **Hot-path rules:** named handler functions at module scope; no object/array creation; no `logDebug` inside move.

**Verification:** in DevTools touch emulation, drag rotates view smoothly in first person; pitch clamps at ±90°; V → third person → drag orbits identically to desktop mouse. Joystick area not yet present, so the whole screen looks. No `console` spam. Desktop unaffected (overlay hidden).

---

## 7. Phase 3 — Virtual Joystick (movement + sprint)

**Objective:** analog movement with a floating left-thumb joystick; sprint via outer ring.

1. **DOM:** `#touch-joystick-base` (circle, default 128 px) + `#touch-joystick-knob` (≈45% of base) inside `#touch-controls`. Pure CSS circles are fine here — this is 2D UI chrome like the crosshair, not world geometry; the voxel "no circles" rule governs 3D content. If you want stylistic consistency with the HUD, use a rounded square (`border-radius: 25%`) — implementer's choice, note it in the change report.
2. **Floating origin:** joystick is invisible until a `pointerdown` lands in the movement zone (left 40% of viewport, bottom 60%); the base centers on the touch point (clamped so it fully fits on-screen), knob follows the finger, both fade out on release. Use `transform: translate(...)` only (no layout thrash), with `will-change: transform`.
3. **State + math (module scope):**
   ```javascript
   let joyPointerId = -1, joyOriginX = 0, joyOriginY = 0;
   let touchMoveX = 0, touchMoveZ = 0;   // -1..1, consumed by applyPlayerVelocity
   let joySprintLatched = false;
   ```
   On move: `dx = x - joyOriginX, dy = y - joyOriginY`; `len = Math.hypot(dx, dy)`; clamp knob to base radius `R`; `touchMoveX = clampedDx / R; touchMoveZ = clampedDy / R;` apply a 15% dead zone (rescale so the edge still reaches 1.0).
4. **Sprint:** when `len > R * 1.0` for forward-dominant input (`-dy > Math.abs(dx)`), latch `isSprinting = true` and nudge the base ring style (CSS class `sprinting`); unlatch when `len < R * 0.8` (hysteresis) or on release. This reuses the existing sprint pipeline including sprint FOV (40527) and `updateMovementIndicators` (41959).
5. **Plumb into movement:** in `applyPlayerVelocity()` (~40271), find where the booleans build the direction vector (something like `direction.z = Number(moveForward) - Number(moveBackward)` then `direction.normalize()` at ~40291). Add, immediately after the boolean-derived values:
   ```javascript
   if (touchModeActive && joyPointerId !== -1) {
       direction.x = touchMoveX;
       direction.z = -touchMoveZ; // verify sign against the boolean convention in THIS build
   }
   ```
   Then ensure the subsequent `normalize()` does not destroy analog magnitude: if the current code normalizes unconditionally, change to normalize only when `lengthSq() > 1` (keyboard yields length 1 or √2 → unchanged behavior after the guard for cardinal/diagonal input — confirm diagonal keyboard speed is identical before/after). **This is the one edit inside player physics; keep it minimal and verify the sign conventions empirically (push up on stick must move forward relative to camera).**
6. **Release/cancel:** zero `touchMoveX/Z`, `isSprinting = false` (only if latched by joystick — don't fight the keyboard), hide joystick, `joyPointerId = -1`. Implement all of this inside `resetTouchInput()` (stub from Phase 1) and call it from pointerup/pointercancel too.
7. **Jump/swim/fly interplay:** none here — vertical movement comes from buttons (Phase 4). Walking into water with the stick must trigger the existing swim logic untouched.

**Verification:** emulated touch — walk all 8 directions, speed scales with stick deflection, diagonal not faster than cardinal, sprint latches at full deflection with FOV kick + HUD icon, releasing mid-sprint stops cleanly, alt-tab/visibility-change zeroes movement (stuck-input guard). Keyboard movement on desktop measured identical (test diagonal + sprint). Full test suite passes.

---

## 8. Phase 4 — Gestures (mine/place) and Action Buttons

**Objective:** complete core gameplay: block interaction, jump/fly, crouch, torch, camera, pause.

### 8.1 Shared action functions (refactor first)

Extract from `onKeyDown`/`onKeyUp` into module-scope named functions, then have BOTH key handlers and touch buttons call them (search the file for each name before declaring):

| Function | Extracted from | Behavior |
|---|---|---|
| `handleJumpPressed()` | "jump" case, 41803–41810 | double-tap window (`lastSpaceTime`, 300 ms) toggles `isFlying`; ground jump sets `velocity.y = SETTINGS.jumpForce` when `canJump`; sets `flyUp`/`spacePressed` as today |
| `handleJumpReleased()` | `onKeyUp` | clears `spacePressed`, `flyUp` |
| `handleCrouchPressed()` / `handleCrouchReleased()` | "crouch" case ~41812 | toggle crouch on ground; `flyDown` while flying (held) |
| `toggleTorch()` | "torch" case 41832–41845 | torch state + viewmodel visibility |
| `cycleHotbar(dir)` | `onMouseWheel` 41966–41975 | wrap slot 1–9, `highlightSlot()` + `updateHeldBlock()` |
| `selectHotbarSlot(n)` | "hotbar" case 41814–41820 | sets `selectedBlockId = HOTBAR_SLOT_TO_BLOCK[n-1]` (table at ~8699), `currentHotbarSlot`, calls the global `highlightSlot()` wrapper (~41957, delegates to `uiManager`) + `updateHeldBlock()` |

Desktop behavior must be bit-identical after extraction — this is a pure mechanical refactor; verify before adding any touch caller.

### 8.2 Look-region gesture classifier

On the Phase 2 look-region pointer, add a tiny state machine (constants: `TAP_MAX_MS = 200`, `TAP_SLOP_PX = 8`, name-check first):

- `pointerdown`: arm a `setTimeout(holdTimerId, TAP_MAX_MS)`. 
- Hold timer fires (pointer still down): **mine** — `leftMouseHeld = true`. The existing per-frame logic (41500–41542, now gated on `isGameplayActive()`) handles highlight, `breakingBlock`, `breakProgress`, and block-break particles. Dragging may continue simultaneously (mining-while-looking is intended).
- `pointerup` before timer with `!lookIsDrag`: **place** — clear the timer, replicate the right-click body of `onMouseClick` (~41946–41954): `pickVoxel(...)` then `tryPlaceBlock(x, y, z, fx, fy, fz)`. Do NOT set `rightMouseHeld` for a tap (no repeat).
- `pointerup` after mining started: `leftMouseHeld = false`, clear `breakingBlock`/`breakProgress` exactly as `onMouseUp` (41868–41878) does — call a shared `stopMining()` extraction if cleaner.
- `pointercancel`: same as up, no place.
- If `SETTINGS.touchSwapMinePlace` (Phase 7): tap mines a single… **no** — tap cannot mine (mining needs `BREAK_TIME` of holding). The swap setting instead means: hold = place-repeat (`rightMouseHeld = true`, reusing `placeRepeatTimer` ~41536), tap = begin/cancel… Keep it simple and honest: the setting swaps **tap→nothing/hold→mine** vs default **tap→place/hold→mine** is the only coherent pair; therefore implement `touchSwapMinePlace` as: default `tap=place, hold=mine`; swapped `tap=mine-tick (starts mining for one frame is useless)`. **Decision: drop the swap setting; it does not map onto hold-to-mine mechanics. Document in change report.** (Kept here so the implementing agent doesn't reinvent it.)

### 8.3 Action buttons

DOM buttons inside `#touch-controls`, bottom-right cluster, `pointer-events: auto`, each ≥ 56 px with ≥ 12 px gaps, semi-transparent HUD styling consistent with hotbar CSS:

| Button | Down | Up | Placement |
|---|---|---|---|
| Jump (large) | `handleJumpPressed()` | `handleJumpReleased()` | right cluster, primary spot |
| Crouch | `handleCrouchPressed()` | `handleCrouchReleased()` | right cluster |
| Torch | `toggleTorch()` | — | right cluster (small) |
| Camera (V) | `toggleThirdPerson()` (34943) | — | right cluster (small) |
| Inventory | `uiManager.openInventory()` via the Phase 1 focus path (mirrors E at 41783–41791) | — | top bar |
| Pause | `exitGameplay("pause")` | — | top corner (respect safe-area) |

Buttons use pointer events with `setPointerCapture` so sliding off a held button still delivers `pointerup` (critical for jump/crouch holds). Add all button state clears to `resetTouchInput()`.

Reflect toggle states visually: flying / crouching / torch-on get an `.active` class — drive this from `updateMovementIndicators()` (41959) or a small per-second sync, NOT per-frame DOM writes; only mutate `classList` when the state actually changed.

### 8.4 Quick save/load, overlays

Add four small buttons to the pause menu (`#main-pause-menu`), visible only when `touchModeActive`: Quick Save → `quickSave()` (21227), Quick Load → `quickLoad()` (21267), Perf Overlay and Debug Overlay → replicate the `KeyO` / `Backquote` toggle bodies (41716–41729, 41689–41695; extract to `togglePerfOverlay()` / `toggleDebugOverlay()` if not already functions).

**Verification:** emulated touch — place a block with a tap, hold to fully mine a block (progress crack overlay shows), drag-while-holding keeps mining at crosshair, jump works, double-tap jump enters/exits flight, crouch toggles (and descends in flight while held), torch toggles with viewmodel, camera button orbits, pause button opens menu and gameplay input freezes, resume restores. Multi-touch: move + look + mine simultaneously (3 pointers) without state bleed. Desktop keyboard/mouse identical post-refactor. Full test suite passes.

---

## 9. Phase 5 — Hotbar and Inventory on Touch

**Objective:** block selection parity.

1. **Hotbar taps:** the in-game hotbar is `<div id="hotbar">` containing `#slot-1`…`#slot-9` (class `.slot`, HTML ~3196). Add pointer handlers (event delegation on `#hotbar` is fine — this is not a hot path) calling `selectHotbarSlot(n)`. Ensure slots have `pointer-events: auto` and ≥ 44 px effective targets when `touchModeActive` (Phase 6 CSS scales them).
2. **Hotbar swipe:** a horizontal drag across the hotbar container (> 24 px) calls `cycleHotbar(±1)` per step. Suppress slot-tap when the gesture became a swipe (same slop pattern as §8.2).
3. **Inventory:** READ the current drag-and-drop implementation inside `UIManager` (~8020) before changing anything. The inventory's own hotbar row uses `.inventory-hotbar-slot` elements (created ~8471) with `e.target.closest('.inventory-hotbar-slot')` handlers and a `.drag-over` CSS state (~8529–8545) — i.e. mouse-event-based, not HTML5 DnD. Choose the lighter path:
   - If it already works with pointer events synthesized from touch — just verify and fix CSS sizing.
   - Otherwise add a **tap-to-assign** mode when `touchModeActive`: tap an inventory item → it highlights → tap a hotbar slot → assigned (and selecting the item also sets it as held block, mirroring desktop semantics). Keep desktop drag-and-drop untouched.
4. **Inventory open/close focus juggling** (8589–8601) was converted in Phase 1 — verify open/close on touch shows/hides the overlay correctly and doesn't try to pointer-lock.

**Verification:** tap-select each slot, swipe cycles with wraparound, inventory opens via button, item assignment works by tap, closing returns to gameplay with touch controls live. Desktop inventory drag-drop unchanged.

---

## 10. Phase 6 — Responsive HUD, Menus, Fullscreen, Orientation

**Objective:** everything readable and reachable on a 360×800 phone screen, both orientations, with notches.

1. **Media-query strategy:** gate mobile CSS on a body class (`body.touch-mode`, toggled by `recomputeTouchMode()`) rather than raw media queries, so the `"on"`/`"off"` setting also restyles. Within it:
   - Hotbar: scale up slots (≥ 44 px), anchor bottom-center above safe-area: `bottom: calc(8px + env(safe-area-inset-bottom));`
   - Crosshair unchanged (center).
   - `#movement-indicators`, block-name display, toasts: reposition so they don't collide with joystick/buttons.
   - Pause/settings menus: `max-height: 100dvh; overflow-y: auto; touch-action: pan-y;` larger fonts/buttons (≥ 44 px rows). The settings menu is long — verify every category is scrollable and sliders are draggable by touch (range inputs work natively).
   - World-creation panel and seed menu: same treatment.
2. **Safe areas:** pause button and top bar use `env(safe-area-inset-top/left/right)`.
3. **Fullscreen:** in `enterGameplay()` on touch, attempt `document.documentElement.requestFullscreen({ navigationUI: "hide" })` wrapped in try/catch + feature check (unavailable on iPhone Safari — degrade silently). Exit fullscreen is left to the OS/back gesture; do not force-exit on pause.
4. **Orientation:** after fullscreen, try `screen.orientation.lock("landscape")` in try/catch (Android only). Add a small non-blocking toast (existing toast system, ~333) suggesting landscape when `matchMedia("(orientation: portrait)")` matches at `enterGameplay()` — do NOT hard-block portrait play.
5. **Resize handling:** `onWindowResize` (registered 28260) already handles renderer/camera. Verify it fires on orientation change and fullscreen transitions; also listen to `visualViewport` resize if the canvas misaligns on iOS toolbar collapse (only add if testing shows a problem).
6. **index-launcher handoff** is Phase 8; in-game `#blocker`/start screens get the same touch-target/CSS pass here.

**Verification:** DevTools responsive mode at 360×800 portrait and 800×360 landscape with notch emulation: all menus fully navigable by tap, no clipped buttons, hotbar above the home-indicator area, joystick/buttons clear of the hotbar. Desktop layout pixel-identical (no `body.touch-mode`).

---

## 11. Phase 7 — Settings Integration

**Objective:** user-tunable touch options, persisted, live-applied — wired exactly per CLAUDE.md.

New settings (search every name before adding):

| Key | Default | Range/Values | Effect |
|---|---|---|---|
| `touchControls` | `"auto"` | auto / on / off | drives `recomputeTouchMode()` |
| `touchLookSensitivity` | `1.0` | 0.2–3.0 slider | multiplier in Phase 2 |
| `touchJoystickSize` | `1.0` | 0.7–1.5 slider | scales base/knob px |
| `touchButtonScale` | `1.0` | 0.8–1.6 slider | scales action-button cluster |
| `touchLeftHanded` | `false` | checkbox | mirrors joystick zone and button cluster |

Steps:

1. Defaults in `DEFAULTS` (~5284), keys in `SETTINGS` (~5067) with the same load-from-localStorage pattern used by neighbors.
2. New **"Touch Controls"** category in the settings menu DOM (follow the structure of an existing category, e.g. Movement). Add the five inputs with unique IDs (`setting-touch-controls`, `setting-touch-look-sens`, …) — confirm IDs are unused.
3. Event-listener wiring in the settings section (~28800+): on change → update `SETTINGS`, call `saveSettings()`, then live-apply: `recomputeTouchMode()` / restyle overlay (a single `applyTouchControlSettings()` that sets CSS custom properties `--touch-joy-size`, `--touch-btn-scale` and toggles a `left-handed` class — avoids touching individual element styles).
4. `updateUIFromSettings()`: sync the five new inputs.
5. Settings search: confirm new settings are discoverable by the existing search bar (it likely indexes labels automatically — verify).
6. Profiles: Performance/Balanced/Quality profiles must NOT clobber touch settings unless they explicitly include them — inspect `SETTINGS_PROFILES` and exclude touch keys (they're preferences, not quality tiers).

**Verification:** change each setting → effect is immediate; reload page → values persist; `localStorage` JSON contains the keys; profile switching leaves them alone; settings search finds "touch". Desktop with `touchControls = "on"` shows the overlay and it works with mouse-as-pointer (useful for development). Full test suite passes.

---

## 12. Phase 8 — `index.html` Launcher

**Objective:** the system-check/launcher page works on phones. (Separate file — the single-file rule applies to the game, `index.html` already exists as the launcher.)

1. Add the same viewport meta upgrade.
2. Verify the WebGL check and GPU benchmark run on mobile GPUs; the GPU tier table already knows some mobile GPUs (e.g. line ~824 `'NVIDIA Mobile'`). Add detection for common mobile renderer strings (Adreno, Mali, Apple GPU, PowerVR) mapping to sensible tiers → recommend the **Performance** profile on low/mid mobile tiers.
3. Touch-target and responsive CSS pass on its buttons.
4. If the launcher surfaces recommended settings, have it recommend `renderDistance` ≤ 8 on mobile tiers (memory: `MemoryBudgetManager` will also auto-scale, but starting low avoids first-minute jank).

**Verification:** launcher loads, benchmark completes, and launches `voxEx.html` on an emulated phone and at least one real device.

---

## 13. Phase 9 — Testing, Docs, Release

1. **Unit tests** (`tools/voxex-tests.html`, served over localhost): the test seam exposes `window.VoxEx` under `?test=1`. Make the pure logic testable and add tests:
   - Expose `isGameplayActive`, the joystick vector math (factor it as a pure function `computeJoystickVector(dx, dy, radius, deadZone)` returning into a scratch object), and the gesture classifier thresholds.
   - Tests: dead-zone rescale correctness; clamping at radius; sprint hysteresis latch/unlatch; tap-vs-hold-vs-drag classification matrix (time × distance); `isGameplayActive()` truth table (locked / virtual / neither); `cycleHotbar` wraparound 9→1 and 1→9.
   - Regression: run the FULL suite (~204 + new) — all green.
2. **Manual matrix** (minimum):
   - Chrome DevTools emulation (fast iteration) — full gameplay loop: new world → move/look/mine/place/swim/fly → inventory → settings → quick save → reload → quick load.
   - Real Android Chrome and real iOS Safari (per memory: serve over localhost / the deployed test URL). iOS extra checks: audio starts after first touch, no double-tap zoom, OPFS/IndexedDB persistence works, fullscreen gracefully absent on iPhone.
   - Desktop Chrome + Firefox: complete regression pass of §2 behaviors with mouse/keyboard, plus a touchscreen-laptop check if available (`auto` must pick mouse mode).
3. **Performance:** on a mid-tier phone, perf overlay (via new pause-menu button) shows stable frame pacing while dragging look + moving + mining (3 active pointers). Confirm no allocations in `pointermove` via DevTools allocation sampling. Confirm zero added per-frame DOM writes when states are unchanged.
4. **Docs:**
   - Update `CLAUDE.md`: Controls table (add touch column or section), new settings, new classes/functions in the search-patterns list (`isGameplayActive`, `enterGameplay`, `touchMoveX`, `#touch-controls`, …), and the Quick Reference Checklist if touch invariants are worth pinning (recommend adding: "touch handlers must start with `if (!touchModeActive) return;`").
   - Update `README.md` (mobile support note) and `futureFeatures.md` (mark done).
   - Bump `VOXEX_BUILD` and append `VOXEX_RECENT_CHANGES` (~3388).
5. **Change report** in the CLAUDE.md format, including explicit Safety Checks confirmation.

---

## 14. Risks and Gotchas (read twice)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Synthesized mouse events** after taps double-fire `onMouseClick`/`onMouseWheel` (registered on `window`, 28255–28259) | Phase 0 step 5 guards; also prefer checking `e.pointerType` where pointer events replace mouse paths |
| 2 | **`setPauseState` ↔ `enterGameplay` recursion** (19577 self-locks) | early-return when already active; trace call graph in Phase 1 before converting |
| 3 | **PointerLockControls fighting touch look** | it only acts while locked; lock never engages on touch — but assert `!controls.isLocked` in the touch-look path during development |
| 4 | **Camera rig ambiguity** (modern vs old PLC path, 26568–26591) | Phase 2 step 4 verification: confirm which object carries yaw in this build before writing rotation |
| 5 | **`normalize()` destroying analog magnitude** or changing keyboard diagonal speed | normalize-only-if-length²>1 guard + explicit before/after measurement (Phase 3 step 5) |
| 6 | **Stuck inputs** on `pointercancel`, incoming calls, app-switch | every touch state cleared in `resetTouchInput()`, called from `resetTransientInput()` (already wired to blur/visibilitychange) AND from pointercancel |
| 7 | **Per-event allocation / GC stutter** in `pointermove` at 120 Hz | module-scope scratch state, named handlers, no closures, no logging |
| 8 | **Double-tap zoom / pull-to-refresh / text selection** hijacking gestures | `touch-action: none`, `overscroll-behavior: none`, `user-select: none`, `touch-callout: none` (Phase 0) |
| 9 | **iOS Safari**: no pointer lock (fine — unused), no fullscreen on iPhone, audio locked until gesture, 300 ms quirks | feature-detect fullscreen; resume AudioManager on first pointerdown; `touch-action` removes tap delay |
| 10 | **UI buttons broken by the synthetic-mouse guard** | guard ONLY the three window-level gameplay listeners; menus keep per-element `click` handlers (Phase 1 step 6) |
| 11 | **Settings profiles overwriting touch preferences** | exclude touch keys from `SETTINGS_PROFILES` application (Phase 7 step 6) |
| 12 | **Multi-touch pointer mix-ups** (look finger vs joystick finger vs button) | strict `pointerId` ownership per control + `setPointerCapture`; never use "first touch" heuristics |
| 13 | **Line-number drift** | always re-search identifiers; never edit by line number alone |
| 14 | **Worker/terrain contamination** | this feature must produce ZERO diffs between `__TERRAIN_FUNCS_START__/END__` markers or in the worker template |

---

## 15. Acceptance Criteria (final gate)

- [ ] On a phone (or emulation), a new player can: create a world, move, look, sprint, jump, fly, crouch, swim, mine, place, use torch, switch hotbar slots, open inventory and assign blocks, toggle third person, pause, change settings, quick save/load — entirely by touch.
- [ ] Desktop mouse/keyboard behavior is unchanged (full §2 regression pass).
- [ ] `tools/voxex-tests.html` passes: all pre-existing ~204 tests + new touch-logic tests.
- [ ] No remaining raw `controls.isLocked` gameplay gates outside the intentional exceptions.
- [ ] All five new settings persist, live-apply, and survive profile switches.
- [ ] No allocations in `pointermove` paths; no new unconditional per-frame DOM writes.
- [ ] Stuck-input guard verified: app-switch mid-sprint-mine-drag leaves no held state.
- [ ] Safe-area, portrait and landscape layouts verified at 360×800.
- [ ] `VOXEX_BUILD`/`VOXEX_RECENT_CHANGES` bumped; `CLAUDE.md`, `README.md`, `futureFeatures.md` updated.
- [ ] Change report delivered in CLAUDE.md format with Safety Checks section.

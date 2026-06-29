# CCR — Reset All: Fix Inverted Shadow Bias (Spurious Negation)

**ID:** VOXEX-CCR-SHADOW-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #495
**Scope:** The settings "Reset All to Default" handler writes `sun.shadow.bias` with a flipped sign (`-SETTINGS.shadowBias`), so resetting produces the opposite self-shadowing behaviour from a fresh load. Solo change — behavioral (alters shadow rendering after reset).

> Line numbers are as of build `2026-06-24.x` and **will drift** — grep `shadow.bias` and `btn-reset-all` before editing.

---

## Summary

### Current behaviour (verified by grep/read)
The canonical convention for applying `SETTINGS.shadowBias` to the directional light is **positive** — confirmed at three independent sites:
- Initial light setup: `sun.shadow.bias = SETTINGS.shadowBias;` (~27951), `moon.shadow.bias = SETTINGS.shadowBias;` (~27958).
- `updateUIFromSettings` apply path: `sun.shadow.bias = SETTINGS.shadowBias;` / `moon.shadow.bias = SETTINGS.shadowBias;` (~29309–29310).
- Reset Graphics › Lighting: `sun.shadow.bias = SETTINGS.shadowBias;` / `moon.shadow.bias = SETTINGS.shadowBias;` (~29454–29459), with an inline comment that the positive bias intentionally masks the contact edge.

`DEFAULTS.shadowBias = 0.0001` (~6436) and the load default (~6166) are positive magnitudes; the UI label reads "default: 0.0001, range: 0-0.001" (~2685).

The **Reset All** handler is the outlier: at ~29330 it writes `sun.shadow.bias = -SETTINGS.shadowBias;` (negated), and `applyShadowSettings()` called just above (~29328) does NOT touch `shadow.bias` (only `castShadow`/`receiveShadow`, verified ~25864). So after Reset All the sun's bias is `-0.0001`, the inverse of a fresh load's `+0.0001` — causing the wrong self-shadowing (acne / peter-panning flip).

### Proposed change
Remove the negation in the Reset All path so it writes the same positive `SETTINGS.shadowBias` the load/init/Reset-Graphics-Lighting paths use. Also add the moon bias write the Reset-All block currently omits (the load path writes both sun and moon at 29309–29310), so Reset All fully matches a fresh load.

### Impact
- Reset All yields shadows identical to a fresh load (correct sign), and resets both sun and moon bias.

---

### #495 — Reset All inverts shadow bias
**Location:** `btn-reset-all` click handler — line ~29330 (grep: `sun.shadow.bias = -SETTINGS.shadowBias`)
**Why:** Reset All negates the bias while every other apply path (init ~27951, `updateUIFromSettings` ~29309, Reset-Graphics-Lighting ~29454) writes it positive; `DEFAULTS.shadowBias` is a positive `0.0001`. The negation makes "reset to default" produce the opposite shadow behaviour from default. The reset path must match the load path.
**Change:** Drop the `-` so the sun bias matches `SETTINGS.shadowBias` (= `DEFAULTS.shadowBias` after the reset loop ran), and add the matching moon bias write for full load-path parity.

**Context:** Every canonical apply site writes the bias POSITIVE (`= SETTINGS.shadowBias`); the Reset-All site is the lone negated outlier. The four positive sites, verbatim:

Initial light setup — sun ~27951, moon ~27958:
```js
                sun.shadow.bias = SETTINGS.shadowBias;
                ...
                moon.shadow.bias = SETTINGS.shadowBias;
```
`updateUIFromSettings` apply path ~29309–29310:
```js
                    if (sun && sun.shadow) { sun.shadow.bias = SETTINGS.shadowBias; sun.shadow.radius = SETTINGS.shadowRadius; }
                    if (moon && moon.shadow) { moon.shadow.bias = SETTINGS.shadowBias; moon.shadow.radius = SETTINGS.shadowRadius; }
```
Reset Graphics › Lighting ~29453–29459:
```js
                    if (sun && sun.shadow) {
                        sun.shadow.bias = SETTINGS.shadowBias;
                        sun.shadow.radius = SETTINGS.shadowRadius;
                    }
                    if (moon && moon.shadow) {
                        moon.shadow.bias = SETTINGS.shadowBias;
                        moon.shadow.radius = SETTINGS.shadowRadius;
                    }
```
Default value: `DEFAULTS.shadowBias: 0.0001` (~6436); load default `shadowBias: savedSettings.shadowBias !== undefined ? savedSettings.shadowBias : 0.0001` (~6166) — both positive. So `+SETTINGS.shadowBias` is unambiguously canonical and `-SETTINGS.shadowBias` at the Reset-All site (~29330) is the bug.

`applyShadowSettings()` (function ~25864) — called one line above the Reset-All bias write (~29328) — only toggles `renderer.shadowMap.enabled` and the lights' `castShadow`/chunk meshes' `receiveShadow`; it NEVER touches `shadow.bias` (confirmed reading 25864–25913). So the negated write at ~29330 is the sole thing setting the sun's bias after Reset All, and the block omits the moon entirely — hence the added moon write for load-path parity.

**Before:**
```js
                        if (typeof sun !== "undefined" && sun && sun.shadow) { sun.shadow.bias = -SETTINGS.shadowBias; sun.shadow.radius = SETTINGS.shadowRadius; }
```
**After:**
```js
                        // #495: write positive bias to match the load/init path (sun.shadow.bias = SETTINGS.shadowBias).
                        // The prior `-SETTINGS.shadowBias` inverted self-shadowing on Reset All vs a fresh load.
                        if (typeof sun !== "undefined" && sun && sun.shadow) { sun.shadow.bias = SETTINGS.shadowBias; sun.shadow.radius = SETTINGS.shadowRadius; }
                        if (typeof moon !== "undefined" && moon && moon.shadow) { moon.shadow.bias = SETTINGS.shadowBias; moon.shadow.radius = SETTINGS.shadowRadius; }
```
**Verify:** Change shadow bias to a non-default value, hit "Reset All to Default", confirm in-game shadows match a fresh page load (no acne/peter-panning flip), and the `shadow-bias-input` field shows `0.0001`. Read back `window.sun.shadow.bias` in the console — it should equal `+0.0001`, not `-0.0001`. Cross-check that Reset Graphics › Lighting (~29454) produces the same shadow appearance as Reset All.

**AUDIT NOTE (related inconsistency, OUT of #495 scope — do not change here):** The live shadow-bias change handler at ~23730 writes `window.sun.shadow.bias = -val;` (negated). This is the same sign inconsistency but on the live-edit path, not the reset path #495 targets. Flag for a follow-up CCR to unify on the positive convention (and to also update the moon there); changing it now would widen scope beyond #495.

---

## Safety Checks
- [ ] After Reset All, `sun.shadow.bias === DEFAULTS.shadowBias` (`+0.0001`), matching init (~27951) and `updateUIFromSettings` (~29309).
- [ ] Reset All shadow appearance == fresh-load default == Reset Graphics › Lighting result.
- [ ] Moon bias is also reset (parity with the load path at ~29310).
- [ ] `shadow-bias-input` reflects `0.0001` after reset; setting round-trips via save/load (`SETTINGS.shadowBias`, ~6166).
- [ ] No other Reset-All defaults disturbed; no new identifiers/shadowing.
- [ ] `tools/voxex-tests.html` green; visual shadow check at default.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

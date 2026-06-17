# CCR — Water Depth Murk & Clarity Controls  ✅ IMPLEMENTED

**Project:** VoxEx (`voxEx.html`, single-file Three.js voxel engine)
**Type:** Feature (graphics / water rendering)
**Mode affected:** Refraction water only (the default; Standard/Fast have no shader murk)
**Status:** Implemented & verified on 2026-06-17. Build `2026-06-17.1`.

> This document was updated post-implementation to reflect **what was actually built**. The original plan under-specified the settings wiring (it listed 3 sync sites + 1 listener block); the codebase actually has **five** parallel settings-UI functions plus reset handlers. Two bugs from that gap were caught during verification and fixed — see "Post-implementation fixes".

---

## What & why

Top-down water used to stay glass-clear to the seabed at any depth. The refraction shader already had a depth-murk haze + Beer-Lambert absorption, but the controlling constants were hardcoded and tuned gently. This change drives them from three settings with stronger defaults and adds live sliders.

| Setting key | UI label | Default (was) | Range | Drives |
|---|---|---|---|---|
| `waterMurkDensity` | Water Murkiness | **0.30** (was lit `0.22`) | 0.1–0.6 | murk curve steepness |
| `waterMurkMax` | Deep-Water Opacity | **0.97** (was lit `0.95`) | 0.5–1.0 | murk ceiling at depth |
| `waterDepthScale` | Murk Depth Scale | **0.22** (was uniform `0.15`) | 0.05–0.5 | Beer-Lambert depth mult |

Murk haze when looking straight down (before absorption darkening):

| Water depth | Before | After |
|---|---|---|
| 2 blocks | ~22% | ~35% |
| 4 blocks | ~53% | ~72% |
| 6 blocks | ~75% | ~90% |
| 8+ blocks | ~87% | ~95% (bottom hidden) |

Murk keys are intentionally **excluded from `SETTINGS_PROFILES`** (like the touch-control prefs) so they persist across Performance/Balanced/Quality switches — zero perf cost, and Performance disables refraction anyway.

---

## As-built changes (current line numbers)

### Shader — `waterMaterialRefraction` (~30700)
1. **Uniform init** (30823–30825): `waterDepthScale` now reads `SETTINGS.waterDepthScale`; added `murkDensity: { value: SETTINGS.waterMurkDensity }` and `murkMax: { value: SETTINGS.waterMurkMax }` (comma added after the `waterDepthScale` line).
2. **Fragment-shader uniform decls** (30891–30892): `uniform float murkDensity;` / `uniform float murkMax;`.
3. **Murk math**: line 31029 `pow(thicknessBlocks * murkDensity, 1.6)` (was `0.22`); line 31035 `murk * murkMax` (was `0.95`). `effectiveDepth` (uses `waterDepthScale`) unchanged.

### Settings storage
4. **DEFAULTS load w/ savedSettings fallback** (5858–5861): `waterDepthScale` 0.22, `waterMurkDensity` 0.30, `waterMurkMax` 0.97.
5. **DEFAULTS object** (6111–6114): same three keys/defaults.

### HTML — Graphics > Water group
6. **Three sliders** (2889–2900): `water-murk-density-slider` (0.1–0.6), `water-murk-max-slider` (0.5–1.0), `water-depth-scale-slider` (0.05–0.5), each with a `…-val` span.

### Settings UI — FIVE parallel functions (all required)
7. `initSettingsUI()` — consts + value-sync (6465–6475).
8. `syncSettingsToUI()` — consts + value-sync (22336–22346).
9. `attachSettingsEventListeners()` — consts (23155–23160) + three `input` listeners (23236–23263). **Runs on `DOMContentLoaded` so the sliders work from the main menu** (see fix #1).
10. `init()` — consts + value-sync (27965–27973) + three `input` listeners (28497–28500).
11. `updateUIFromSettings()` — value-sync (28810–28812); this is what the reset buttons call to refresh slider positions (see fix #2).

### Search + live-apply + reset
12. **Settings-search registry** (21894–21896): three entries under `Graphics › Water`.
13. **`applyWaterFastMode()`** (31553–31555): pushes `waterDepthScale`/`murkDensity`/`murkMax` uniforms on water-mode switch.
14. **`btn-reset-graphics-water`** handler: resets the three `SETTINGS` keys (29010–29012) and pushes the three uniforms (29061–29063).
15. **`btn-reset-all`**: auto-covers murk — it iterates `Object.keys(DEFAULTS)` then calls `updateUIFromSettings()`. No murk-specific code needed.

### Build banner
16. `VOXEX_BUILD` → `"2026-06-17.1"` (3825) + a `VOXEX_RECENT_CHANGES` entry describing the feature (3826).

---

## Post-implementation fixes (found during verification)

The first pass wired murk into three of the five settings functions. Verification (grep-parity against the existing `waterOpacitySlider`) exposed two real bugs:

1. **Dead sliders on the main menu.** `attachSettingsEventListeners()` is invoked on `DOMContentLoaded` precisely so settings work before a game loads. The murk listeners were only in `init()` (game start), so dragging a murk slider from the main menu did nothing. → Added consts + listeners to `attachSettingsEventListeners()` (item 9).
2. **"Reset to Default" ignored murk.** `btn-reset-graphics-water` enumerates each water setting + uniform explicitly; it didn't reset the murk keys or push their uniforms, and `updateUIFromSettings()` (which the reset calls) didn't re-sync the murk slider positions. → Added the three SETTINGS resets + uniform pushes (item 14) and the `updateUIFromSettings()` value-sync (item 11).

---

## Verification performed

- **`node --check`** on the full extracted `<script type="module">` (line 3818 → final `</script>`, ~41.2K lines): **passes**. Also rules out duplicate `const` in any single scope.
- **Grep parity:** each new slider identifier = **11 refs** (identical to `waterOpacitySlider`); each `…Val` const = **10 refs** (identical to `waterOpacityVal`). Confirms the three controls are wired into exactly the same set of locations as the canonical water slider.
- **DOM-id parity:** `water-murk-density-slider` `getElementById` count = **4**, matching `water-fog-slider`.
- **File integrity:** 45,050 lines, closing `</script></body></html>` intact.

### Not yet run
- In-browser `tools/voxex-tests.html` (~204 tests) — the sandbox localhost isn't reachable by the user's browser. **Recommend running locally over localhost as the final gate.**

---

## Known limitation (pre-existing, consistent)

`applyWaterMaterialSettings()` and `btn-reset-all` only live-push the opacity/waterColor uniforms — absorption, refraction-strength, and murk uniforms are **not** pushed by those paths. Murk values still take effect on the next slider touch, on game load (the uniform block reads `SETTINGS`), or via `applyWaterFastMode()`. This matches the existing behavior of the absorption sliders, so murk is consistent — not a regression.

---

## Safety checks (as-built)

- **No worker parity needed** — all new math is in the main-thread fragment shader; the `waterDepth/16` thickness normalization is untouched.
- No identifier collisions: `waterMurkDensity`/`waterMurkMax` are new; `waterDepthScale` previously existed only as a shader-uniform name, now also a SETTINGS key.
- The six slider/val consts are declared in four distinct function scopes — no same-scope redeclaration (confirmed by `node --check`).
- No per-frame work added — uniforms update only on slider `input`, profile/mode switch, or reset.
- Single-file rule preserved; Standard/Fast water materials untouched.

# CCR — Water Depth Murk / Depth Fog & Clarity Controls  ✅ IMPLEMENTED

**Project:** VoxEx (`voxEx.html`, single-file Three.js voxel engine)
**Type:** Feature (graphics / water rendering)
**Mode affected:** Refraction water only (the default; Standard/Fast have no shader murk)
**Status:** Implemented & verified 2026-06-17. Current build **`2026-06-17.2`**.

> This is an as-built record. It was revised twice:
> - **`2026-06-17.1`** — added three settings/sliders driving the existing column-thickness murk (stronger defaults).
> - **`2026-06-17.2`** — **reworked the murk into true depth fog** keyed off real through-water view distance (the `.1` version read as a flat blue surface filter — see "Depth-fog rework").

---

## What & why

Top-down water used to stay glass-clear to the seabed. Two rounds of work fixed this:

1. Exposed the murk/absorption constants as three tunable settings with stronger defaults (build `.1`).
2. **Changed what drives the murk.** The original murk (and the `.1` sliders) keyed off `vWaterThickness` — the *vertical water-column depth* baked per vertex. Across a flat-bottomed lake that value is ~uniform, so the haze applied evenly and read as **a flat blue filter on the surface**, not as fog that swallows the bottom. Build `.2` drives murk + absorption off the **real distance the view ray travels through water**, reconstructed from the refraction depth texture. The seabed now fades into haze with depth *and* view angle.

### The three controls (Graphics > Water)

| Setting key | UI label | Default | Range | Role (build `.2`) |
|---|---|---|---|---|
| `waterMurkDensity` | Water Murkiness | 0.30 | 0.1–0.6 | fog rate: `murk = 1 - exp(-throughWater * density)` |
| `waterMurkMax` | Deep-Water Opacity | 0.97 | 0.5–1.0 | ceiling: `mix(scene, murkColor, min(murk, murkMax))` |
| `waterDepthScale` | Murk Depth Scale | 0.22 | 0.05–0.5 | Beer-Lambert color absorption: `effectiveDepth = throughWater * scale` |

Murk haze vs. through-water view distance at the default density (0.30):

| Through-water distance | Murk |
|---|---|
| 2 blocks | ~45% |
| 4 blocks | ~70% |
| 8 blocks | ~91% |
| 12+ blocks | capped at `waterMurkMax` (0.97) |

Murk keys are intentionally **excluded from `SETTINGS_PROFILES`** (like the touch prefs) so they persist across profile switches — zero perf cost, and Performance disables refraction anyway.

---

## Depth-fog rework (build `2026-06-17.2`) — the core fix

All in the `waterMaterialRefraction` fragment shader + its per-frame sync. No new geometry/attributes; reuses the depth texture already captured for refraction foreground-rejection.

1. **New uniforms** `uCamNear` / `uCamFar` (object 30826–30827; FS decls 30895–30896). Named with a `u`-prefix on purpose — `cameraNear`/`cameraFar` can collide with Three.js-injected uniform names and silently break the shader (a GLSL error `node --check` can't catch).
2. **Per-frame sync** (43466–43467): `mat.uniforms.uCamNear.value = camera.near; mat.uniforms.uCamFar.value = camera.far;` (next to the existing `tRefractionDepth`/`time` sync).
3. **Re-sample depth at the corrected UV** (30995): the foreground-rejection branch now re-reads `sceneDepth` after it falls back to `screenUV`, so the fog distance matches the pixel actually sampled.
4. **Through-water distance** (31001–31011): linearize the captured scene depth and this fragment's depth to eye space, subtract:
   ```glsl
   float sceneEyeDepth = (2.0*uCamNear*uCamFar) / (uCamFar+uCamNear - (sceneDepth*2.0-1.0)*(uCamFar-uCamNear));
   float surfEyeDepth  = (2.0*uCamNear*uCamFar) / (uCamFar+uCamNear - (gl_FragCoord.z*2.0-1.0)*(uCamFar-uCamNear));
   float throughWater  = max(0.0, sceneEyeDepth - surfEyeDepth); // world units (= blocks) along the view ray
   ```
   (Denominator is provably > 0 for depth in [0,1]; `max(0.0, …)` guards the foreground edge case — no NaN/divide-by-zero.)
5. **Absorption** (31021): `effectiveDepth = throughWater * waterDepthScale;` (was `thicknessBlocks * waterDepthScale`).
6. **Murk** (31052 / 31058): `murk = 1.0 - exp(-throughWater * murkDensity);` then `mix(refractedColor, murkColor, min(murk, murkMax));` (was `1 - exp(-pow(thicknessBlocks*0.22,1.6))` / `* 0.95`).
7. **Retained:** `thicknessBlocks = vWaterThickness * 16.0` (31016) still feeds the shallow-water **caustic** fade (`shallowAmt`, 31031) — a column-depth concept, intentionally left as-is.

Result: shallow shorelines (throughWater ≈ 0) stay clear; depth and grazing angles fog out smoothly; the bottom recedes into murk instead of getting a flat tint.

---

## As-built — full change inventory

### Shader — `waterMaterialRefraction`
- Uniform object: `waterDepthScale`/`murkDensity`/`murkMax` from `SETTINGS` + `uCamNear`/`uCamFar` (≈30823–30827).
- FS uniform decls: `murkDensity`, `murkMax`, `uCamNear`, `uCamFar` (≈30891–30896).
- Through-water distance + depth-fog murk/absorption (≈30992–31058, see rework section).

### Settings storage
- DEFAULTS load w/ `savedSettings` fallback (≈5858–5861): `waterDepthScale` 0.22, `waterMurkDensity` 0.30, `waterMurkMax` 0.97.
- DEFAULTS object (≈6111–6114): same.

### HTML — Graphics > Water group (≈2889–2900)
- `water-murk-density-slider` (0.1–0.6), `water-murk-max-slider` (0.5–1.0), `water-depth-scale-slider` (0.05–0.5), each with a `…-val` span.

### Settings UI — FIVE parallel functions (all required)
- `initSettingsUI()` — consts + value-sync.
- `syncSettingsToUI()` — consts + value-sync.
- `attachSettingsEventListeners()` — consts + `input` listeners. **Runs on `DOMContentLoaded` so the sliders work from the main menu.**
- `init()` — consts + value-sync + a second copy of the listeners (double-bound at game start, idempotent — matches the other water sliders).
- `updateUIFromSettings()` — value-sync, used by the reset buttons.

### Search + live-apply + reset
- Settings-search registry: three entries under `Graphics › Water`.
- `applyWaterFastMode()`: pushes `waterDepthScale`/`murkDensity`/`murkMax` uniforms on water-mode switch.
- Per-frame render sync: pushes `uCamNear`/`uCamFar`.
- `btn-reset-graphics-water`: resets the three SETTINGS keys + pushes their uniforms.
- `btn-reset-all`: auto-covers murk via `Object.keys(DEFAULTS)` + `updateUIFromSettings()`.

### Build banner
- `VOXEX_BUILD` = `"2026-06-17.2"` + two `VOXEX_RECENT_CHANGES` entries (depth-fog rework, then the original murk-controls entry).

---

## Bugs found during verification (already fixed)

1. **Dead sliders on the main menu** (`.1`): murk listeners were only in `init()`, but `attachSettingsEventListeners()` (the `DOMContentLoaded` wiring) is what makes settings work before a game loads. → Added consts + listeners there.
2. **"Reset to Default" ignored murk** (`.1`): `btn-reset-graphics-water` enumerates each water setting/uniform explicitly and didn't touch murk. → Added the three SETTINGS resets + uniform pushes, and the murk re-sync in `updateUIFromSettings()`.
3. **Flat blue filter instead of fog** (`.1` → fixed in `.2`): the murk keyed off column thickness, not view distance. → The depth-fog rework above.
4. **Uniform name collision risk**: `cameraNear`/`cameraFar` → renamed `uCamNear`/`uCamFar`.

---

## Verification performed

- **`node --check`** on the full extracted module: passes (also rules out duplicate `const` in any scope).
- **Grep parity:** each new slider identifier = 11 refs (= `waterOpacitySlider`); each `…Val` const = 10 refs (= `waterOpacityVal`); slider DOM-id `getElementById` count = 4 (= `water-fog-slider`).
- **Uniform consistency:** `uCamNear`/`uCamFar` exist in the uniform object, the FS declarations, the linearize expressions, and the per-frame sync; no stray `cameraNear`/`cameraFar` left (the unrelated `shadow.camera.near/far` are untouched).
- **Math safety:** linearize denominator > 0 for all valid depths; `throughWater` clamped ≥ 0.

### Not run from here
- In-browser `tools/voxex-tests.html` (~204 tests) — sandbox localhost isn't reachable by the user's browser. **Run locally as the final gate.**
- Visual confirmation — **hard-reload, look down into water several blocks deep and pan across the surface at a low angle**; the seabed should fade into murk with distance.

---

## Known limitation (pre-existing, consistent)

`applyWaterMaterialSettings()` / `btn-reset-all` only live-push opacity/waterColor uniforms — absorption, refraction-strength, and murk uniforms aren't pushed by those paths; they take effect on the next slider touch, game load, or `applyWaterFastMode()`. Murk matches the existing absorption behavior here — not a regression.

## Safety checks (as-built)

- **No worker parity needed** — all logic is in the main-thread fragment shader + render loop; no terrain/meshing/attribute changes (the `waterDepth/16` thickness normalization is untouched and now only feeds caustics).
- No identifier collisions: `waterMurkDensity`/`waterMurkMax` new; `waterDepthScale` was a uniform-only name, now also a SETTINGS key; depth uniforms namespaced `uCam*`.
- No per-frame CPU work added beyond two uniform writes; the through-water math is per-fragment GPU work reusing an already-bound depth texture.
- Single-file rule preserved; Standard/Fast water materials untouched.

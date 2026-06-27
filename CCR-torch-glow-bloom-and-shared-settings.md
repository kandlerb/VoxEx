# CCR — Torch Device Parity: Handheld Reach Fix + Emissive Glow Controls + Screen-Space Bloom (VoxEx)

**File:** `voxEx.html` (single-file rule honored — all changes stay in this one file)
**Type:** Feature (settings UI + rendering / post-processing)
**Status:** Proposal / report — written to be reviewed before any code is changed. Hand to a Sonnet agent to implement.
**Date:** 2026-06-25. Line numbers verified against the working tree on this date; **re-confirm by grepping the named symbol before editing — the file drifts (~43K lines, 2.7 MB).**

> **Motivating request:** "Add more controls in settings for tweaking the handheld and the placeable torches. They should have the exact same settings — they are the exact same device. (Excludes shadows; this is about brightness, bloom, distance, etc.)" Plus: verify whether screen-space bloom already exists.
>
> **Investigation result (the *why* in one paragraph):** The torch *light* (color, intensity/brightness, range/distance) is **already fully shared** between the handheld viewmodel torch and placed torch blocks — both read `SETTINGS.torchColor` / `SETTINGS.torchIntensity` / `SETTINGS.torchRange` (`applyTorchSettingsToLights`, ~25738; placed-light pool, ~13770), **and all three already have settings-UI controls** ("Torch Color / Intensity / Range," HTML lines 2731–2740). So **brightness is already exposed and already changes both torches** — the existing "Torch Intensity" slider scales held and placed together (the internal `HELD_TORCH_MULT = 3` / `PLACED_TORCH_MULT = 1` asymmetry only compensates for placed torches *also* carrying baked block-light, so the two read as equally bright; see per-user requirement below). Particles are **already shared** too — held and placed both call `spawnTorchEmber` / `spawnTorchFlame` with the same `torchSmoke*` / `torchFlame*` settings. So the things the user can already tune are unified. What is **NOT** exposed: (1) the **emissive "glow" of the torch-head cubes** (flame `emissiveIntensity 0.5`, glow `1.0`) is hardcoded in *three* places; (2) the torch-head model **colors**; (3) the placed-torch **particle radius** (`24`). And critically — **there is no screen-space bloom anywhere** (0 matches for `bloom`/`Bloom`, no `UnrealBloomPass`/`LuminosityHighPass` import). The "halo" around torches today is the **volumetric god-ray pass** (`addPointLightFog`, ~28333), which is light-position-anchored fog scattering, not luminance-based bloom — it does nothing for the emissive cubes themselves.
>
> **Per-user requirement (2026-06-25):** "I want the brightness exposed, but changing it should change the brightness of **both** the handheld torch and the placeable one." The *setting* already does this — the **Torch Intensity** control (`SETTINGS.torchIntensity`, UI line 2735) feeds both via `applyTorchSettingsToLights`. So no held-only brightness knob is added (`torchHeldBrightnessBoost` dropped), and the `3×`/`1×` light multipliers stay internal.
>
> **BUT — follow-up report (2026-06-25): "the handheld torch seems much less bright than the placeable torches; it doesn't cast nearly as far and is not very helpful."** This is a **real rendering asymmetry**, not a settings bug, and it is the actual problem to solve (new **Part 3**). Root cause, verified in code:
> - **Placed torch reach = baked voxel block-light.** A placed torch floods a permanent, occlusion-aware level-14 block-light BFS into the terrain vertex colors (`updateBlockLightAt`), reaching **~14 blocks** and filling the whole cave. That is what "casts far / is helpful" looks like.
> - **Held torch has NO baked light** (it moves every frame — re-baking + remeshing per frame is infeasible). It illuminates terrain **only** via its dynamic `PointLight`.
> - **A chunk-shader gate then clips that dynamic light to ~9 blocks.** `applyCylindricalFog`'s `onBeforeCompile` (line **31925–31928**) multiplies all dynamic `directDiffuse`/`directSpecular` by `bakedLightGate = max(smoothstep(bakedLuminance), camProxGate)`, where `camProxGate = clamp(1 - dist/9.0, 0, 1)`. In a dark cave the baked term is ~0, so **beyond ~9 blocks from the camera the held torch contributes essentially nothing.** That hard 9-block clip — not intensity — is why it "doesn't cast far." (The gate exists for a good reason: the torch `PointLight` casts no terrain shadow, so without it the held light would leak through walls. See Part 3 for the tradeoff.)
>
> Net: the two torches are NOT visually equal today, and no settings change can fix it — the held torch's *terrain reach* is hard-clipped in the shader. **Part 3** widens that clip (and exposes it as `torchHeldReach`).
>
> **Three independent feature blocks.** **Part 1 (S — shared cosmetic device settings: glow, model colors, particle radius)**, **Part 2 (B — new screen-space bloom pass)**, and **Part 3 (P — held-torch terrain-reach parity)** are unrelated and can be implemented/tested independently. **Part 3 is the one that fixes the user's "handheld is weak / doesn't cast far" complaint** — if only one part ships, ship Part 3. Part 1 adds the glow/color knobs; Part 2 adds the true bloom the user assumed already existed.

---

## Verification log (against current `voxEx.html`, 2026-06-25)

| Symbol / site | Current line(s) | Role |
|---|---|---|
| `SETTINGS` torch-light read-back (`torchColor`/`torchIntensity`/`torchRange`) | **6036–6038** | S — add new keys here (read from `savedSettings`) |
| `DEFAULTS` torch-light block | **6296–6298** | S — add new defaults here |
| `DEFAULTS` torch-particle block | **6466–6477** | S — anchor for new particle-radius default |
| `SETTINGS` volumetric read-back (`volumetricScale`, `volumetricLightingEnabled`) | **6109, 6116** | B — pattern + anchor for bloom keys |
| `DEFAULTS` volumetric block (`volumetricScale`, `volumetricLightingEnabled`) | **6367, 6374** | B — anchor for bloom defaults |
| `SETTINGS_PROFILES` (performance/balanced/quality) | **~6490–6580** | B — add `bloomEnabled` per profile; S keys deliberately **excluded** |
| Torch Particles settings UI group (HTML) | **3205–3270** | S — add "Torch Glow" sub-group here |
| `updateUIFromSettings` torch-particle block | **23135–23153** | S — sync new inputs |
| Settings event-wiring torch-particle block | **24371–24439** | S — add `change` listeners |
| Reset-to-defaults torch-particle block | **29360–29368, 29383–29387** | S — reset new keys + re-sync inputs |
| `saveSettings()` | **22767–22769** | Persists **entire** `SETTINGS` → new keys round-trip automatically |
| Existing Torch Color/Intensity/Range UI | **2731–2740** | **No change** — brightness already exposed here and already drives both torches |
| `applyTorchSettingsToLights()` (+ `HELD_TORCH_MULT`/`PLACED_TORCH_MULT`) | **25738–25780** (consts 25748–25751) | **No change** — internal parity tuning; `torchIntensity` already scales both |
| Held torch flicker (`SETTINGS.torchIntensity * 3`) | **43627–43630** | **No change** — stays `* 3` (internal `HELD_TORCH_MULT`); Part 3 sets the reach uniform next to it |
| **Chunk shader dynamic-light gate** (`camProxGate` hardcoded `/ 9.0`) | **31925–31928** | **P3 change site** — held-torch terrain reach is clipped here |
| Chunk fragment uniform prelude (`tileWidth`, `uShininessStrength`) | **31624–31631** | P3 — declare `uniform float uHeldTorchReach;` here |
| `fogVerticalBlend` shared-uniform pattern (decl + bind) | **9822** (decl), **31194 / 31911** (bind) | P3 — mirror this exact pattern for `_heldTorchReachUniform` |
| Baked block-light reach (placed torch flood-fill) | `updateBlockLightAt` | context — the ~14-block reach Part 3 matches the held torch to |
| First-person viewmodel torch flame/glow materials | **27785–27814** | S — emissive-glow site #1 (own materials, `depthTest:false`) |
| Third-person hand torch flame/glow materials (`createThirdPersonTorch`, meshes named `'flame'`/`'glow'`) | **35395–35419** | S — emissive-glow site #2 |
| Shared world/placed torch materials (`getSharedTorchResources`) | **40574–40615** | S — emissive-glow site #3 (singletons → all placed torches) |
| Placed-torch particle radius (`PLACED_TORCH_PARTICLE_RADIUS = 24`) | **43727** | S — replace constant with setting |
| Post-process globals decl (`sceneRT, volumetricGlowRT, causticGlowRT, …`) | **11870** | B — add `bloomRT`, `bloomMaterial` here |
| `CombinedPostShader` uniforms block | **28408–28430** | B — add `tBloom`/`bloomEnabled`/`bloomStrength` |
| `CombinedPostShader` fragment glow-add line | **28486** | B — add bloom contribution next to glow add |
| Post-process init (`combinedPass`, `sceneRT`, `resizePostProcessTargets`) | **28494–28536** | B — create `bloomMaterial` + size `bloomRT` |
| `renderComposited()` glow-render block | **44200–44239** | B — render bloom into `bloomRT`, set uniforms |
| Post-effects-active gate (`anyPostEffectsActive`) | **44390–44407** | B — OR in `bloomEnabled` (future-proof; `useComposer` already forced true) |
| `VOXEX_BUILD` / `VOXEX_RECENT_CHANGES` | **3936, 3944** | bump on ship |

---

# Part 1 — Shared torch "device" settings (S)

All torch models are the **same device**, so a single set of settings must drive all of them. The **light** *setting* (color / intensity / range) is already unified **and already exposed** (UI lines 2731–2740) — the existing **Torch Intensity** slider scales both torches, so **no light-brightness setting is added here**. (The *visible* "handheld is weaker" gap is a rendering-reach problem, fixed in **Part 3** — not a settings problem.) This part exposes the remaining hardcoded *cosmetic* properties. Three sub-changes (**S1**, **S2**, **S4**; **S3 is intentionally a no-op** — see below), plus the SETTINGS/DEFAULTS/UI plumbing (**S0**).

### Design: new SETTINGS keys

| Key | Default | Drives |
|---|---|---|
| `torchGlowIntensity` | `1.0` | Multiplier on the flame/glow **cube** `emissiveIntensity` (base 0.5 / 1.0) — the "glow/brightness of the torch head," on **every** torch model. `1.0` = current look. |
| `torchModelFlameColor` | `0xffaa33` | `.color` + `.emissive` of the flame cube on every torch model. (Distinct from the *particle* color `torchFlameColor`.) |
| `torchModelGlowColor` | `0xffff66` | `.color` + `.emissive` of the glow cube on every torch model. |
| `torchPlacedParticleRadius` | `24` | Replaces hardcoded `PLACED_TORCH_PARTICLE_RADIUS`. Distance (blocks) within which placed torches emit particles. |

> **No held-only brightness knob.** Light brightness is the existing `torchIntensity` slider, which already scales held **and** placed together (with the internal `HELD_TORCH_MULT`/`PLACED_TORCH_MULT` asymmetry left untouched). The originally-floated `torchHeldBrightnessBoost` is **dropped** per the user requirement.

> **Why a multiplier, not an absolute, for `torchGlowIntensity`:** keeping the two base constants (`0.5`, `1.0`) and multiplying preserves the deliberately-tuned flame-vs-glow ratio and makes `1.0` a perfect no-op, so existing saves look identical until the user changes it.

> **Profiles:** these four keys are **aesthetic prefs, not perf tiers** → **exclude them from `SETTINGS_PROFILES`** (same rationale as the touch settings in CLAUDE.md — profiles only set keys they list, so excluded keys survive a profile switch). `bloomEnabled` (Part 2) is the opposite and **does** go in profiles.

---

## S0 — SETTINGS / DEFAULTS plumbing

### S0a — `DEFAULTS` torch-light block (lines 6296–6298)

**Current:**
```js
                torchColor: 0xffaa33,    // Warm torch glow (orange)
                torchIntensity: 3.0,     // Torch brightness multiplier (affects block light level 15)
                torchRange: 48,          // Torch light radius in blocks (affects point light)
```
**Proposed (append three keys):**
```js
                torchColor: 0xffaa33,    // Warm torch glow (orange)
                torchIntensity: 3.0,     // Torch brightness multiplier (affects block light level 15)
                torchRange: 48,          // Torch light radius in blocks (affects point light)
                // Torch device parity (shared by handheld viewmodel, 3rd-person hand, and placed torches)
                torchGlowIntensity: 1.0,        // Multiplier on flame/glow CUBE emissive (base 0.5/1.0). 1.0 = stock.
                torchModelFlameColor: 0xffaa33, // Flame cube color+emissive (NOT the particle color)
                torchModelGlowColor: 0xffff66,  // Glow cube color+emissive
```

### S0b — `SETTINGS` torch-light read-back (lines 6036–6038)

**Current:**
```js
                torchColor: savedSettings.torchColor || 0xffaa33,
                torchIntensity: savedSettings.torchIntensity !== undefined ? savedSettings.torchIntensity : 3.0,
                torchRange: savedSettings.torchRange || 48,
```
**Proposed (append):**
```js
                torchColor: savedSettings.torchColor || 0xffaa33,
                torchIntensity: savedSettings.torchIntensity !== undefined ? savedSettings.torchIntensity : 3.0,
                torchRange: savedSettings.torchRange || 48,
                torchGlowIntensity: savedSettings.torchGlowIntensity ?? 1.0,
                torchModelFlameColor: savedSettings.torchModelFlameColor ?? 0xffaa33,
                torchModelGlowColor: savedSettings.torchModelGlowColor ?? 0xffff66,
```
> Use `??` (not `||`) so a legitimately-saved `0` glow is honored. `saveSettings()` (22768) serializes the whole `SETTINGS` object, so no save-side edit is needed.

### S0c — `torchPlacedParticleRadius` default + read-back

In the `DEFAULTS` particle block (after line 6477, `torchFlameDecay: 0.25,`):
```js
                torchFlameDecay: 0.25,
                torchPlacedParticleRadius: 24,   // blocks; placed torches emit smoke/flame within this radius
```
In the `SETTINGS` particle block (after line 6226, `torchFlameDecay: savedSettings.torchFlameDecay ?? 0.25,`):
```js
                torchFlameDecay: savedSettings.torchFlameDecay ?? 0.25,
                torchPlacedParticleRadius: savedSettings.torchPlacedParticleRadius ?? 24,
```

---

## S1 — Emissive glow of the torch-head cubes (the main "brightness/glow" knob)

The flame/glow cubes are built with hardcoded `emissiveIntensity` (and color) in **three** places. We (a) centralize the base values as named consts, (b) read the SETTINGS multiplier/color at construction so torches created at any time start correct, and (c) add `applyTorchGlowSettings()` to update live materials when the user changes a slider.

### S1a — Base-value consts (new, module scope)

Add immediately **above** `getSharedTorchResources` (~line 40573, just before the `function getSharedTorchResources()` declaration):
```js
            // Single-source base emissive for ALL torch-head cubes (handheld, 3rd-person, placed).
            // Effective emissiveIntensity = base * SETTINGS.torchGlowIntensity (see applyTorchGlowSettings).
            const TORCH_FLAME_BASE_EMISSIVE = 0.5;
            const TORCH_GLOW_BASE_EMISSIVE = 1.0;
```
> Grep first: confirm `TORCH_FLAME_BASE_EMISSIVE` / `TORCH_GLOW_BASE_EMISSIVE` are not already declared.

### S1b — Shared world/placed torch materials (`getSharedTorchResources`, 40591–40605)

**Current:**
```js
                if (!_sharedTorchFlameMat) {
                    _sharedTorchFlameMat = new THREE.MeshLambertMaterial({
                        color: 0xffaa33,
                        emissive: 0xffaa33,
                        emissiveIntensity: 0.5
                    });
                    _sharedTorchFlameMat.userData = { isShared: true };
                }
                if (!_sharedTorchGlowMat) {
                    _sharedTorchGlowMat = new THREE.MeshLambertMaterial({
                        color: 0xffff66,
                        emissive: 0xffff66,
                        emissiveIntensity: 1.0
                    });
                    _sharedTorchGlowMat.userData = { isShared: true };
                }
```
**Proposed:**
```js
                if (!_sharedTorchFlameMat) {
                    _sharedTorchFlameMat = new THREE.MeshLambertMaterial({
                        color: SETTINGS.torchModelFlameColor,
                        emissive: SETTINGS.torchModelFlameColor,
                        emissiveIntensity: TORCH_FLAME_BASE_EMISSIVE * SETTINGS.torchGlowIntensity
                    });
                    _sharedTorchFlameMat.userData = { isShared: true };
                }
                if (!_sharedTorchGlowMat) {
                    _sharedTorchGlowMat = new THREE.MeshLambertMaterial({
                        color: SETTINGS.torchModelGlowColor,
                        emissive: SETTINGS.torchModelGlowColor,
                        emissiveIntensity: TORCH_GLOW_BASE_EMISSIVE * SETTINGS.torchGlowIntensity
                    });
                    _sharedTorchGlowMat.userData = { isShared: true };
                }
```
> These two singletons back **every** placed/world torch, so updating them updates all placed torches at once — no per-instance traversal.

### S1c — First-person viewmodel torch materials (27787–27813)

**Current (flame + glow excerpt):**
```js
                const flameMat = new THREE.MeshLambertMaterial({
                    color: 0xffaa33,
                    depthTest: false,
                    depthWrite: false, // Don't write to depth buffer (fixes rendering over transparent water)
                    emissive: 0xffaa33,
                    emissiveIntensity: 0.5,
                });
                const flame = new THREE.Mesh(flameGeo, flameMat);
                flame.position.set(0, 0.135, 0);
                flame.renderOrder = 9999; // Render last
                flame.castShadow = false; // Flames don't cast shadows
                torchGroup.add(flame);
                torchLight.position.set(0, 0.165, 0);
                torchGroup.add(torchLight);
                // Torch ember glow (bright yellow center)
                const glowGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
                const glowMat = new THREE.MeshLambertMaterial({
                    color: 0xffff66,
                    depthTest: false,
                    depthWrite: false, // Don't write to depth buffer (fixes rendering over transparent water)
                    emissive: 0xffff66,
                    emissiveIntensity: 1.0,
                });
                const glow = new THREE.Mesh(glowGeo, glowMat);
```
**Proposed** — read SETTINGS at construction and **name the meshes** so `applyTorchGlowSettings` can find them (the 3rd-person torch already uses `'flame'`/`'glow'` names; standardize):
```js
                const flameMat = new THREE.MeshLambertMaterial({
                    color: SETTINGS.torchModelFlameColor,
                    depthTest: false,
                    depthWrite: false, // Don't write to depth buffer (fixes rendering over transparent water)
                    emissive: SETTINGS.torchModelFlameColor,
                    emissiveIntensity: TORCH_FLAME_BASE_EMISSIVE * SETTINGS.torchGlowIntensity,
                });
                const flame = new THREE.Mesh(flameGeo, flameMat);
                flame.name = 'flame';
                flame.position.set(0, 0.135, 0);
                flame.renderOrder = 9999; // Render last
                flame.castShadow = false; // Flames don't cast shadows
                torchGroup.add(flame);
                torchLight.position.set(0, 0.165, 0);
                torchGroup.add(torchLight);
                // Torch ember glow (bright yellow center)
                const glowGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
                const glowMat = new THREE.MeshLambertMaterial({
                    color: SETTINGS.torchModelGlowColor,
                    depthTest: false,
                    depthWrite: false, // Don't write to depth buffer (fixes rendering over transparent water)
                    emissive: SETTINGS.torchModelGlowColor,
                    emissiveIntensity: TORCH_GLOW_BASE_EMISSIVE * SETTINGS.torchGlowIntensity,
                });
                const glow = new THREE.Mesh(glowGeo, glowMat);
                glow.name = 'glow';
```
> The existing flame-position lookup `window.torchModel.children[1]` (43694) is unaffected — adding `.name` doesn't change child order.

### S1d — Third-person hand torch materials (35397–35413)

**Current:**
```js
                const flameMat = new THREE.MeshLambertMaterial({
                    color: 0xffaa33,
                    emissive: 0xffaa33,
                    emissiveIntensity: 0.5
                });
                ...
                const glowMat = new THREE.MeshLambertMaterial({
                    color: 0xffff66,
                    emissive: 0xffff66,
                    emissiveIntensity: 1.0
                });
```
**Proposed:**
```js
                const flameMat = new THREE.MeshLambertMaterial({
                    color: SETTINGS.torchModelFlameColor,
                    emissive: SETTINGS.torchModelFlameColor,
                    emissiveIntensity: TORCH_FLAME_BASE_EMISSIVE * SETTINGS.torchGlowIntensity
                });
                ...
                const glowMat = new THREE.MeshLambertMaterial({
                    color: SETTINGS.torchModelGlowColor,
                    emissive: SETTINGS.torchModelGlowColor,
                    emissiveIntensity: TORCH_GLOW_BASE_EMISSIVE * SETTINGS.torchGlowIntensity
                });
```
> These meshes are already named `'flame'` / `'glow'` (35405, 35418) — no rename needed.

### S1e — `applyTorchGlowSettings()` (new) — live update for all three models

Add next to `applyTorchSettingsToLights` (after its close at line 25780):
```js
            /**
             * Push SETTINGS.torchGlowIntensity / torchModelFlameColor / torchModelGlowColor onto
             * every torch-head cube material live (handheld viewmodel, 3rd-person hand, placed/world).
             * Placed torches all share two singleton materials, so one update covers them all.
             * @returns {void}
             */
            function applyTorchGlowSettings() {
                const gi = SETTINGS.torchGlowIntensity;
                const flameHex = SETTINGS.torchModelFlameColor;
                const glowHex = SETTINGS.torchModelGlowColor;
                const setMat = (mat, baseEmissive, hex) => {
                    if (!mat) return;
                    mat.color.setHex(hex);
                    mat.emissive.setHex(hex);
                    mat.emissiveIntensity = baseEmissive * gi;
                    mat.needsUpdate = true;
                };
                // Placed/world torches (shared singletons; may be null before first torch is built)
                if (typeof _sharedTorchFlameMat !== 'undefined') setMat(_sharedTorchFlameMat, TORCH_FLAME_BASE_EMISSIVE, flameHex);
                if (typeof _sharedTorchGlowMat !== 'undefined') setMat(_sharedTorchGlowMat, TORCH_GLOW_BASE_EMISSIVE, glowHex);
                // First-person viewmodel torch
                if (window.torchModel) {
                    const f = window.torchModel.getObjectByName('flame'); if (f) setMat(f.material, TORCH_FLAME_BASE_EMISSIVE, flameHex);
                    const g = window.torchModel.getObjectByName('glow');  if (g) setMat(g.material, TORCH_GLOW_BASE_EMISSIVE, glowHex);
                }
                // Third-person hand torch
                const tpt = (typeof playerBodyMesh !== 'undefined' && playerBodyMesh) ? playerBodyMesh.userData.thirdPersonTorch : null;
                if (tpt) {
                    const f = tpt.getObjectByName('flame'); if (f) setMat(f.material, TORCH_FLAME_BASE_EMISSIVE, flameHex);
                    const g = tpt.getObjectByName('glow');  if (g) setMat(g.material, TORCH_GLOW_BASE_EMISSIVE, glowHex);
                }
            }
            window.applyTorchGlowSettings = applyTorchGlowSettings;
```
> `_sharedTorchFlameMat`/`_sharedTorchGlowMat` are module-scoped `let`s near `getSharedTorchResources`; confirm scope reachability from here (both are in the same IIFE). Because S1b reads SETTINGS at lazy-creation, placed torches built *after* a settings change are already correct even though this function's null-guard skips them when not yet created.

---

## S2 — Torch-head model colors

Covered by the same `torchModelFlameColor` / `torchModelGlowColor` keys and `applyTorchGlowSettings()` above (color + emissive set together). No separate code beyond S0/S1. UI in S0d below.

---

## S3 — Light *brightness setting* — **intentional no-op** (already shared)

> The *perceived* "handheld is dimmer / casts less far" problem is **not** a brightness-setting issue — it is the shader reach clip, fixed in **Part 3**. This section only covers the `torchIntensity` *setting*, which already drives both torches.

**No code change here.** The user requires that the brightness control affect **both** the handheld and the placeable torch. That is **already true today**:

- The **Torch Intensity** UI control exists (`#torch-intensity-input`, HTML line 2735; wired at 22906 / 28735, etc.) and writes `SETTINGS.torchIntensity`.
- `applyTorchSettingsToLights` (25750–25751) feeds `torchIntensity` into **both** the held light (`heldIntensity = torchIntensity * HELD_TORCH_MULT`) and the placed lights (`torchIntensityValue = torchIntensity * PLACED_TORCH_MULT`); the held flicker (43630) uses the same `torchIntensity`. Raising the slider brightens both proportionally.

The `HELD_TORCH_MULT = 3` / `PLACED_TORCH_MULT = 1` asymmetry is **deliberately left untouched**: placed torches also carry baked level-15 block-light, so equal *dynamic* intensities would make placed torches look far brighter than held — the 3×/1× split is what makes the "same device" read as equally bright. It is parity tuning, not a user knob, so it is **not** exposed. (No `torchHeldBrightnessBoost`.)

> If, after playtest, you decide the held/placed balance itself should be tunable, that is a *separate* future CCR — and it should be framed as a single "balance" control, never two independent brightness sliders, to avoid users desyncing the two torches.

---

## S4 — Placed-torch particle radius → `torchPlacedParticleRadius`

### S4a — particle emit loop (43727)

**Current:**
```js
                    const PLACED_TORCH_PARTICLE_RADIUS = 24;
                    const radiusSq = PLACED_TORCH_PARTICLE_RADIUS * PLACED_TORCH_PARTICLE_RADIUS;
```
**Proposed:**
```js
                    const PLACED_TORCH_PARTICLE_RADIUS = SETTINGS.torchPlacedParticleRadius;
                    const radiusSq = PLACED_TORCH_PARTICLE_RADIUS * PLACED_TORCH_PARTICLE_RADIUS;
```
> `cr` (the chunk-window radius, 43737: `Math.ceil(PLACED_TORCH_PARTICLE_RADIUS / chunkSize)`) recomputes from this each frame, so a larger radius automatically widens the scan window. Keep the local name to minimize the diff.

---

## S0d — Settings UI (HTML + wiring) for the new "Torch Glow" controls

### HTML — new sub-group inside the Torch Particles group (after line 3268, before the group's closing `</div>` at 3269–3270)

Mirror the existing Smoke/Flame sub-group markup:
```html
                            <!-- Torch Glow (head cubes) Sub-Group -->
                            <div class="settings-group" data-group="torch-glow" style="margin-left: 8px;">
                                <div class="settings-group-header collapsed" onclick="toggleSettingsGroup(this, 'torch-glow')">
                                    <span>Torch Glow (head)</span><span class="chevron">⌄</span>
                                </div>
                                <div class="settings-group-content collapsed">
                                    <div class="setting-item">
                                        <label for="torch-glow-intensity-input">Glow Intensity</label>
                                        <input type="number" id="torch-glow-intensity-input" step="0.1" min="0" style="width: 80px;" />
                                        <span class="hint-text">Default: 1.0 (flame & glow cube brightness)</span>
                                    </div>
                                    <div class="setting-item">
                                        <label for="torch-model-flame-color">Flame Color</label>
                                        <input type="color" id="torch-model-flame-color" value="#ffaa33" />
                                    </div>
                                    <div class="setting-item">
                                        <label for="torch-model-glow-color">Glow Color</label>
                                        <input type="color" id="torch-model-glow-color" value="#ffff66" />
                                    </div>
                                    <div class="setting-item">
                                        <label for="torch-placed-particle-radius-input">Placed Particle Radius</label>
                                        <input type="number" id="torch-placed-particle-radius-input" step="2" min="0" style="width: 80px;" />
                                        <span class="hint-text">Default: 24 blocks</span>
                                    </div>
                                </div>
                            </div>
```
> `hexToColor` / `#rrggbb` ↔ int conversion already exists (used by `torch-smoke-color`, etc., 23146 / 24387).

### `updateUIFromSettings` — append to the torch block (after line 23153)
```js
                const torchGlowIntensityInput = document.getElementById('torch-glow-intensity-input');
                const torchModelFlameColorInput = document.getElementById('torch-model-flame-color');
                const torchModelGlowColorInput = document.getElementById('torch-model-glow-color');
                const torchPlacedParticleRadiusInput = document.getElementById('torch-placed-particle-radius-input');
                if (torchGlowIntensityInput) torchGlowIntensityInput.value = SETTINGS.torchGlowIntensity;
                if (torchModelFlameColorInput) torchModelFlameColorInput.value = hexToColor(SETTINGS.torchModelFlameColor);
                if (torchModelGlowColorInput) torchModelGlowColorInput.value = hexToColor(SETTINGS.torchModelGlowColor);
                if (torchPlacedParticleRadiusInput) torchPlacedParticleRadiusInput.value = SETTINGS.torchPlacedParticleRadius;
```

### Event wiring — append to the torch block (after line 24439)
```js
                const torchGlowIntensityInput = document.getElementById('torch-glow-intensity-input');
                const torchModelFlameColorInput = document.getElementById('torch-model-flame-color');
                const torchModelGlowColorInput = document.getElementById('torch-model-glow-color');
                const torchPlacedParticleRadiusInput = document.getElementById('torch-placed-particle-radius-input');

                torchGlowIntensityInput?.addEventListener('change', () => {
                    const val = parseFloat(torchGlowIntensityInput.value);
                    if (!Number.isNaN(val) && val >= 0) {
                        SETTINGS.torchGlowIntensity = val;
                        applyTorchGlowSettings();
                        saveSettings();
                    }
                });
                torchModelFlameColorInput?.addEventListener('change', () => {
                    SETTINGS.torchModelFlameColor = parseInt(torchModelFlameColorInput.value.replace('#', ''), 16);
                    applyTorchGlowSettings();
                    saveSettings();
                });
                torchModelGlowColorInput?.addEventListener('change', () => {
                    SETTINGS.torchModelGlowColor = parseInt(torchModelGlowColorInput.value.replace('#', ''), 16);
                    applyTorchGlowSettings();
                    saveSettings();
                });
                torchPlacedParticleRadiusInput?.addEventListener('change', () => {
                    const val = parseFloat(torchPlacedParticleRadiusInput.value);
                    if (!Number.isNaN(val) && val >= 0) {
                        SETTINGS.torchPlacedParticleRadius = val;
                        saveSettings(); // consumed live by the emit loop next frame
                    }
                });
```
> Existing torch handlers use the same `parseFloat` + `change` + `saveSettings()` pattern (24391–24439); matches house style. `saveSettings` (22767) and `hexToColor` are in scope here.

### Reset-to-defaults — append to the block at 29368, and re-sync inputs near 29387
After the existing `SETTINGS.torchFlameDecay = DEFAULTS.torchFlameDecay;` (29368):
```js
                    SETTINGS.torchGlowIntensity = DEFAULTS.torchGlowIntensity;
                    SETTINGS.torchModelFlameColor = DEFAULTS.torchModelFlameColor;
                    SETTINGS.torchModelGlowColor = DEFAULTS.torchModelGlowColor;
                    SETTINGS.torchPlacedParticleRadius = DEFAULTS.torchPlacedParticleRadius;
```
Then, after the reset block re-reads inputs (the `document.getElementById('torch-flame-...')` group ~29383–29387), add the same five `getElementById` + value-sync lines as in `updateUIFromSettings` (or simply call `updateUIFromSettings()` if the reset path already does — grep to confirm), and finally call `applyTorchGlowSettings()` + `applyTorchSettingsToLights()` once so the live materials/lights reflect the reset.

---

# Part 2 — Screen-space bloom (B)

**Confirmed absent today.** This adds a real luminance-thresholded bloom that makes the emissive torch-head cubes (and any bright surface/sun) bleed — distinct from the existing god-ray fog halo. It slots into the **existing** offscreen-RT composite (`renderComposited`, 44200), reusing the same `postQuadMesh` + half-res-RT pattern the god rays/caustics already use, so it adds **one** extra half-res render only when enabled.

### Design: new SETTINGS keys (Part 2)

| Key | Default | Role |
|---|---|---|
| `bloomEnabled` | `true` | Master toggle. In `SETTINGS_PROFILES`: `false` for performance, `true` for balanced/quality. |
| `bloomStrength` | `0.6` | Final additive multiplier of the bloom buffer in the combined pass. |
| `bloomThreshold` | `0.75` | Luminance prefilter knee — only pixels brighter than this bloom. |
| `bloomRadius` | `2.5` | Blur spread, in texels of the (downsampled) bloom RT. |
| `bloomScale` | `0.5` | Bloom RT downscale vs drawing buffer (like `volumetricScale`). Lower = cheaper + softer. |

DEFAULTS (near the volumetric block, after line 6374 `volumetricLightingEnabled: true,`):
```js
                volumetricLightingEnabled: true,
                // Screen-space bloom (post-process; emissive surfaces bleed)
                bloomEnabled: true,
                bloomStrength: 0.6,
                bloomThreshold: 0.75,
                bloomRadius: 2.5,
                bloomScale: 0.5,
```
SETTINGS read-back (near line 6116):
```js
                volumetricLightingEnabled: savedSettings.volumetricLightingEnabled !== undefined ? savedSettings.volumetricLightingEnabled : true,
                bloomEnabled: savedSettings.bloomEnabled ?? true,
                bloomStrength: savedSettings.bloomStrength ?? 0.6,
                bloomThreshold: savedSettings.bloomThreshold ?? 0.75,
                bloomRadius: savedSettings.bloomRadius ?? 2.5,
                bloomScale: savedSettings.bloomScale ?? 0.5,
```
`SETTINGS_PROFILES` — add `bloomEnabled` beside each profile's `volumetricLightingEnabled` (6507 / 6538 / 6569):
```js
                    volumetricLightingEnabled: false,  // performance
                    bloomEnabled: false,
```
```js
                    volumetricLightingEnabled: true,   // balanced
                    bloomEnabled: true,
```
```js
                    volumetricLightingEnabled: true,   // quality
                    bloomEnabled: true,
```

### B1 — Globals (line 11870)

**Current:**
```js
            let combinedPass, godRayMaterial, causticMaterial, sceneRT, volumetricGlowRT, causticGlowRT, postQuadScene, postQuadCam, postQuadMesh, resizePostProcessTargets;
```
**Proposed (append two):**
```js
            let combinedPass, godRayMaterial, causticMaterial, sceneRT, volumetricGlowRT, causticGlowRT, postQuadScene, postQuadCam, postQuadMesh, resizePostProcessTargets, bloomRT, bloomMaterial;
```

### B2 — `CombinedPostShader` uniforms + fragment

**Uniforms** — append inside the `uniforms` object (after line 28429 `vignetteStrength: { value: 0.4 }`, add a comma):
```js
                        vignetteStrength: { value: 0.4 },
                        tBloom: { value: null },
                        bloomEnabled: { value: 0.0 },
                        bloomStrength: { value: SETTINGS.bloomStrength }
```
**Fragment declarations** — add to the `uniform` list (near line 28442):
```glsl
                        uniform sampler2D tBloom; uniform float bloomEnabled; uniform float bloomStrength;
```
**Fragment add** — the existing glow add (line 28486):
```glsl
                            if (glowEnabled > 0.5) { color += texture2D(tGlow, vUv).rgb; }
```
becomes:
```glsl
                            if (glowEnabled > 0.5) { color += texture2D(tGlow, vUv).rgb; }
                            if (bloomEnabled > 0.5) { color += texture2D(tBloom, vUv).rgb * bloomStrength; }
```
> Placed **before** the color-grade lines (28488–28489) so bloom is graded with the rest of the frame — matching how `tGlow` is added pre-grade.

### B3 — `bloomMaterial` + `bloomRT` in post-process init (28500–28531)

Add right after `postQuadScene.add(postQuadMesh);` (28506), before `resizePostProcessTargets = …`:
```js
                // --- Bloom: single-pass bright-prefilter + 9-tap tent blur into a downsampled RT ---
                bloomMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        tDiffuse: { value: null },
                        threshold: { value: SETTINGS.bloomThreshold },
                        radius: { value: SETTINGS.bloomRadius },
                        texelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }
                    },
                    depthTest: false,
                    depthWrite: false,
                    vertexShader: `
                        varying vec2 vUv;
                        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
                    `,
                    fragmentShader: `
                        uniform sampler2D tDiffuse; uniform float threshold; uniform float radius; uniform vec2 texelSize;
                        varying vec2 vUv;
                        vec3 prefilter(vec3 c) {
                            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
                            float contrib = max(0.0, l - threshold) / max(l, 1e-4);
                            return c * contrib;
                        }
                        void main() {
                            vec2 o = texelSize * radius;
                            vec3 s = prefilter(texture2D(tDiffuse, vUv).rgb) * 4.0;
                            s += prefilter(texture2D(tDiffuse, vUv + vec2( o.x, 0.0)).rgb) * 2.0;
                            s += prefilter(texture2D(tDiffuse, vUv + vec2(-o.x, 0.0)).rgb) * 2.0;
                            s += prefilter(texture2D(tDiffuse, vUv + vec2(0.0,  o.y)).rgb) * 2.0;
                            s += prefilter(texture2D(tDiffuse, vUv + vec2(0.0, -o.y)).rgb) * 2.0;
                            s += prefilter(texture2D(tDiffuse, vUv + vec2( o.x,  o.y)).rgb);
                            s += prefilter(texture2D(tDiffuse, vUv + vec2(-o.x,  o.y)).rgb);
                            s += prefilter(texture2D(tDiffuse, vUv + vec2( o.x, -o.y)).rgb);
                            s += prefilter(texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb);
                            gl_FragColor = vec4(s / 16.0, 1.0);
                        }
                    `
                });
```
In `resizePostProcessTargets` (28507–28528), after the `causticGlowRT` sizing line (28527), add:
```js
                    bloomRT = sizeGlow(bloomRT, SETTINGS.bloomScale);
                    if (bloomMaterial && bloomRT) bloomMaterial.uniforms.texelSize.value.set(1 / bloomRT.width, 1 / bloomRT.height);
```
And after `combinedPass.uniforms.tGlow.value = volumetricGlowRT.texture;` (28531), initialize a never-null bloom texture:
```js
                combinedPass.uniforms.tBloom.value = bloomRT.texture; // never null
                combinedPass.uniforms.bloomEnabled.value = 0.0;
```
> Reuses the existing `sizeGlow` helper (28517) → bloom RT is `HalfFloatType`, `LinearFilter`, at `bloomScale`. The blur radius reads wide because the RT is downsampled. `texelSize` is refreshed on every resize.

### B4 — Render bloom in `renderComposited()` (insert after line 44236)

The existing glow block ends at 44236 (`combinedPass.uniforms.glowEnabled.value = glowActive ? 1.0 : 0.0;`). Insert **before** line 44237/44238 (the `tScene` set + `composer.render()`):
```js
                // Bloom: bright-prefilter + blur sceneRT → bloomRT (additive, independent of god-ray/caustic glow).
                const bloomActive = SETTINGS.bloomEnabled && bloomRT && bloomMaterial;
                if (bloomActive) {
                    bloomMaterial.uniforms.tDiffuse.value = sceneRT.texture;
                    bloomMaterial.uniforms.threshold.value = SETTINGS.bloomThreshold;
                    bloomMaterial.uniforms.radius.value = SETTINGS.bloomRadius;
                    postQuadMesh.material = bloomMaterial;
                    renderer.getClearColor(_ppPrevClear);
                    const prevAlpha = renderer.getClearAlpha();
                    renderer.setClearColor(0x000000, 0);
                    renderer.setRenderTarget(bloomRT);
                    renderer.clear();
                    renderer.render(postQuadScene, postQuadCam);
                    renderer.setRenderTarget(null);
                    renderer.setClearColor(_ppPrevClear, prevAlpha);
                    combinedPass.uniforms.tBloom.value = bloomRT.texture;
                }
                combinedPass.uniforms.bloomEnabled.value = bloomActive ? 1.0 : 0.0;
                combinedPass.uniforms.bloomStrength.value = SETTINGS.bloomStrength;
```
> **Order matters:** this runs *after* the god-ray/caustic glow block (which leaves `postQuadMesh.material` set to `godRayMaterial`/`causticMaterial`). Bloom re-swaps `postQuadMesh.material` to `bloomMaterial` and renders into a *different* RT (`bloomRT`), so the two coexist (both additive on the scene). `_ppPrevClear` is the same scratch the glow block uses (44226) — already declared. Bloom reads `sceneRT` (the same HDR-linear capture the god rays read at 44215), so emissive cubes pushed up by `torchGlowIntensity` (Part 1) feed straight into the threshold.

### B5 — Post-effects-active gate (44393–44395)

**Current:**
```js
                const volumetricActive = SETTINGS.volumetricLightingEnabled;
                const underwaterActive = isUnderwater; // Global state set by updateUnderwaterState
                const anyPostEffectsActive = volumetricActive || underwaterActive || zombieEffectsEnabled;
```
**Proposed (OR in bloom):**
```js
                const volumetricActive = SETTINGS.volumetricLightingEnabled;
                const underwaterActive = isUnderwater; // Global state set by updateUnderwaterState
                const anyPostEffectsActive = volumetricActive || underwaterActive || zombieEffectsEnabled || SETTINGS.bloomEnabled;
```
> Currently `useComposer` is hardcoded `true` (44407), so `renderComposited` always runs and bloom would render regardless. This edit is **defensive** — if the direct-render fast path is ever re-enabled, bloom stays correct. Low-risk, recommended.

### B6 — Bloom settings UI

Add a "Bloom" group under **Graphics** (place near the Volumetric group in the settings HTML — grep `data-group="volumetric"` for the neighbor). Controls: a checkbox `#bloom-enabled-toggle` (→ `SETTINGS.bloomEnabled`) and number inputs `#bloom-strength-input`, `#bloom-threshold-input`, `#bloom-radius-input`, `#bloom-scale-input`. Wire them in `updateUIFromSettings` (set `.value`/`.checked`) and the event-wiring block (the same `change` + `saveSettings()` pattern as S0d). The `bloom-scale-input` handler must additionally call `resizePostProcessTargets()` (it resizes `bloomRT`):
```js
                bloomScaleInput?.addEventListener('change', () => {
                    const val = parseFloat(bloomScaleInput.value);
                    if (!Number.isNaN(val) && val > 0 && val <= 1) {
                        SETTINGS.bloomScale = val;
                        if (window.resizePostProcessTargets) resizePostProcessTargets();
                        saveSettings();
                    }
                });
```
> `bloomStrength`/`bloomThreshold`/`bloomRadius` need no apply-callback — `renderComposited` reads them from `SETTINGS` every frame (B4). `bloomEnabled` likewise. Only `bloomScale` needs the resize.

---

# Part 3 — Held-torch terrain reach parity (P) — **the fix for "handheld is weak"**

**Goal:** make the handheld torch light the cave around the player out to roughly the placed torch's ~14-block baked reach, instead of the current hard ~9-block clip — and expose that reach as a setting.

### Why this is the right lever (and what it can't do)

The placed torch's reach is **baked, occlusion-aware** block-light. The held torch can't bake (it moves), so it relies on its dynamic `PointLight`, which the shader gate (`camProxGate`, 31925) clips to 9 blocks. The held `PointLight` is already configured to reach far — `distance = torchRange` (48), `decay 0.8`, intensity `torchIntensity * 3` ≈ 9 (created 27748; refreshed 25756 / 43630) — so **the light is bright and long-range; only the gate clips it.** Widening the gate immediately extends the held torch's terrain illumination using the intensity that's already there.

**Tradeoff (honest):** `camProxGate` ungates *all* dynamic direct light within its radius of the camera (the torch `PointLight` casts no terrain shadow). Widening it to N blocks means the held torch can sheen surfaces around corners within N blocks (mild light-through-walls), and near placed-torch/sun sheen is ungated within N blocks too. The original `9` was a deliberate balance. The held torch is a moving light where some bleed is hard to notice, and the user explicitly wants reach over occlusion purity — so we widen it, **only while the torch is active**, and make it tunable.

### Design: one new key

| Key | Default | Role |
|---|---|---|
| `torchHeldReach` | `16` | Radius (blocks) of the held-torch terrain-light exemption. Replaces the hardcoded `9.0` in `camProxGate` **when the torch is on**; reverts to `9.0` when off (preserves the baseline near-light exemption for other dynamic lights). |

DEFAULTS (after the `torchModelGlowColor` line added in S0a):
```js
                torchModelGlowColor: 0xffff66,  // Glow cube color+emissive
                torchHeldReach: 16,             // Held-torch terrain-light radius (blocks). Placed torches reach ~14 via baked light.
```
SETTINGS read-back (after the `torchModelGlowColor` line in S0b):
```js
                torchModelGlowColor: savedSettings.torchModelGlowColor ?? 0xffff66,
                torchHeldReach: savedSettings.torchHeldReach ?? 16,
```
> Aesthetic/gameplay pref → **excluded from `SETTINGS_PROFILES`** (like the other S keys).

### P1 — Shared uniform object (mirror `_fogVerticalBlendUniform`)

Next to `const _fogVerticalBlendUniform = { value: 0 };` (line **9822**), add:
```js
            const _heldTorchReachUniform = { value: 9.0 }; // held-torch terrain-light gate radius (blocks); driven per-frame from SETTINGS.torchHeldReach when torch active
```
> Grep `_heldTorchReachUniform` first to confirm it's new.

### P2 — Declare the GLSL uniform (fragment prelude, 31624–31631)

**Current:**
```js
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'void main() {',
                            `varying vec3 vWorldPositionCyl;
                            varying vec2 vQuadSize;
                            uniform float tileWidth;
                            uniform float uShininessStrength;
                            void main() {`
                        );
```
**Proposed (add one uniform line):**
```js
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'void main() {',
                            `varying vec3 vWorldPositionCyl;
                            varying vec2 vQuadSize;
                            uniform float tileWidth;
                            uniform float uShininessStrength;
                            uniform float uHeldTorchReach;
                            void main() {`
                        );
```

### P3 — Bind the uniform (next to the `fogVerticalBlend` bind, line 31911)

**Current:**
```js
                        shader.uniforms.fogVerticalBlend = _fogVerticalBlendUniform;
```
**Proposed:**
```js
                        shader.uniforms.fogVerticalBlend = _fogVerticalBlendUniform;
                        shader.uniforms.uHeldTorchReach = _heldTorchReachUniform;
```
> **Bind only at 31911.** `shader.uniforms.fogVerticalBlend` appears twice — **31911** (chunk/glass `onBeforeCompile`, which is the program that also contains the prelude at 31624 and the gate at 31921) and **31978** (a *separate* material's fog setup — water). The `camProxGate` gate exists **only once** in the file (grep `camProxGate` → single hit at 31925), inside the 31911 program. So add the `uHeldTorchReach` bind **next to 31911 only**; do **not** touch 31978 — that shader has no gate and never reads the uniform. The prelude (P2, 31624) and the gate (P4, 31925) are in this same program, so all three P-edits stay consistent. (If `applyCylindricalFog` is shared by both `chunkMaterial` and `glassMaterial`, the single 31911/31624/31925 edits cover both automatically.)

### P4 — Use the uniform in the gate (31925)

**Current:**
```js
                                float camProxGate = clamp(1.0 - length(vWorldPositionCyl - cameraPosition) / 9.0, 0.0, 1.0);
                                float bakedLightGate = max(smoothstep(0.10, 0.55, dot(vColor.rgb, vec3(0.3333))), camProxGate);
                                reflectedLight.directDiffuse *= bakedLightGate;
                                reflectedLight.directSpecular *= bakedLightGate;
```
**Proposed (only the `9.0` → uniform; rest unchanged):**
```js
                                float camProxGate = clamp(1.0 - length(vWorldPositionCyl - cameraPosition) / uHeldTorchReach, 0.0, 1.0);
                                float bakedLightGate = max(smoothstep(0.10, 0.55, dot(vColor.rgb, vec3(0.3333))), camProxGate);
                                reflectedLight.directDiffuse *= bakedLightGate;
                                reflectedLight.directSpecular *= bakedLightGate;
```
> Update the comment block above (31917–31920) that says "~9 blocks" to note the radius is now `uHeldTorchReach` (default 16, torch-gated).

### P5 — Drive the uniform per-frame (animate loop, ~43626)

Immediately **before** the existing `if (torchActive && torchLight) {` block (line 43627), add one allocation-free line:
```js
                // Held-torch terrain-light reach: widen the dynamic-light gate while the torch is on,
                // else fall back to the 9-block baseline exemption used by other near dynamic lights.
                _heldTorchReachUniform.value = torchActive ? SETTINGS.torchHeldReach : 9.0;
```
> `torchActive` and `SETTINGS` are already in scope here (used immediately below). One scalar write per frame — no allocation, no branch cost worth noting. No settings-change callback is needed because the value is recomputed every frame from `SETTINGS`.

### P6 — UI

Add one control to the **Torch Glow (head)** sub-group from S0d (or a sibling "Torch Light" group) — number input `#torch-held-reach-input`:
```html
                                    <div class="setting-item">
                                        <label for="torch-held-reach-input">Handheld Reach</label>
                                        <input type="number" id="torch-held-reach-input" step="1" min="1" style="width: 80px;" />
                                        <span class="hint-text">Default: 16 blocks (placed torches ≈ 14)</span>
                                    </div>
```
`updateUIFromSettings` (with the other new inputs):
```js
                const torchHeldReachInput = document.getElementById('torch-held-reach-input');
                if (torchHeldReachInput) torchHeldReachInput.value = SETTINGS.torchHeldReach;
```
Event wiring (no apply-callback needed — P5 reads it live each frame):
```js
                const torchHeldReachInput = document.getElementById('torch-held-reach-input');
                torchHeldReachInput?.addEventListener('change', () => {
                    const val = parseFloat(torchHeldReachInput.value);
                    if (!Number.isNaN(val) && val >= 1) {
                        SETTINGS.torchHeldReach = val;
                        saveSettings();
                    }
                });
```
Reset-to-defaults (with the other S resets): `SETTINGS.torchHeldReach = DEFAULTS.torchHeldReach;`

### P7 — Optional secondary tuning (only if still not bright enough after P1–P6)

If, after widening the reach, the held torch is bright near the player but still falls off too fast at the new range, the next lever is the held `PointLight` falloff — **not** another gate. Either lower its `decay` (27748: the `0.8` arg → e.g. `0.6`) or raise the `HELD_TORCH_MULT` (25748). Ship P1–P6 first and judge; treat P7 as a follow-up knob, and if exposed, route it through `applyTorchSettingsToLights`. **Do not** raise `torchIntensity`'s effect asymmetrically — that would desync the placed torches.

---

## Worker parity & single-file checks

- **Single-file:** every change is inside `voxEx.html`. ✅
- **Worker parity — none required.** No terrain/tree/noise function is touched. The injected worker code (`buildChunkWorkerCode`, terrain markers ~19552 / 20007) is untouched. Torch materials, post-process passes, the P3 shader gate (`applyCylindricalFog` `onBeforeCompile`, main-thread GLSL only), and the settings UI are all main-thread/render-only.
- **Save format:** `saveSettings()` (22768) serializes the entire `SETTINGS` object, so all **ten** new keys (4 torch-cosmetic + `torchHeldReach` + 5 bloom) round-trip with no save-side edit. Read-back guards use `??` so existing saves load with defaults.
- **`SETTINGS_VERSION` (3939):** bump only if you want to **force** every device back to DEFAULTS. Not required here — new keys default cleanly via `??` on old saves. Recommend **not** bumping (preserves users' other settings); the new keys simply appear at their defaults.
- **No shadowed globals:** new identifiers are `torchGlow*`/`torchModel*Color`/`torchHeld*`/`torchPlaced*`/`bloom*`/`TORCH_*_BASE_EMISSIVE`/`bloomRT`/`bloomMaterial`/`applyTorchGlowSettings`. Grep each before declaring to confirm no collision (esp. `applyTorchGlowSettings`, `bloomMaterial`).

## Testing plan

1. **Serve over localhost** (Workers/IndexedDB), load, then run `tools/voxex-tests.html` (~204 tests) — these are render-agnostic; expect all green.
2. **S — parity (manual):** place a torch and hold a torch side by side. Change **Glow Intensity** → both heads brighten identically. Change **Flame Color** / **Glow Color** → both heads (and 3rd-person hand torch via `V`) recolor. Confirm placed-torch heads update **live** (shared singletons) without replacing the block.
3. **S — `torchGlowIntensity 1.0` is a no-op:** fresh load with default looks pixel-identical to pre-change (base 0.5/1.0 preserved).
4. **S3 — shared brightness (regression check, no new control):** drag the existing **Torch Intensity** slider; confirm **both** the handheld and a placed torch brighten/dim together (the 3×/1× asymmetry is unchanged). Confirm no "Held Light Boost" control exists.
5. **P — held-torch reach (the headline fix):** dig a dark cave with **no** placed torches. With the held torch on, confirm terrain is now lit out to ~16 blocks (was ~9) — the cave should feel as navigable as one with a placed torch. Drag **Handheld Reach** down to ~9 → reverts to the old short throw; up to ~24 → lights farther. Toggle the torch **off** → the wider exemption disappears (reach uniform falls back to 9). Compare side-by-side with a placed torch: reach should now feel comparable.
6. **P — wall-leak sanity (the tradeoff):** with a high **Handheld Reach**, stand near a corner and confirm the bleed of held-torch light onto around-the-corner surfaces within the radius is acceptable. If too leaky, lower the default.
7. **S4 — particle radius:** lower **Placed Particle Radius** to ~6 and walk away from a torch — smoke/flame stop sooner; raise to ~40 — they emit from farther. Watch `O` overlay for particle-count sanity.
8. **B — bloom:** toggle **Bloom**; emissive torch heads and the sun should bleed/halo. Raise **Glow Intensity** (Part 1) and confirm the torch heads bloom *more* (they cross the threshold). Sweep **Threshold** (high = only sun blooms), **Strength**, **Radius**, **Scale**. Confirm **off** = zero bloom and no extra RT render.
9. **B — interaction:** above water with volumetric ON + bloom ON → god-ray halo **and** bloom coexist. Underwater → caustics + bloom coexist. No double-add or flicker.
10. **Perf (`O` overlay):** bloom ON costs one extra half-res pass; expect a small, steady frame-time bump only when enabled. Performance profile (`bloomEnabled:false`) shows no cost. P3 adds zero per-frame cost (one scalar write). Resize the window → no leak/stretch (resize path sizes `bloomRT` + refreshes `texelSize`).
11. **Persistence:** change every new setting, reload → values restored. Reset-to-defaults → torch glow/colors/reach/radius revert and live materials/lights refresh.

## Open questions

1. **Bloom blur quality.** Shipping a single-pass 9-tap tent (cheap, slightly chunky — arguably on-brand for a voxel game). If you want a smoother, wider bloom, the upgrade is a **separable ping-pong blur** (horizontal then vertical, optionally mip-chained) into a second RT — more passes, more cost. Ship single-pass first; escalate only if it looks too blocky.
2. **Default `bloomEnabled`** — **RESOLVED (user, 2026-06-25): ON by default.** `DEFAULTS.bloomEnabled = true`; ON in balanced + quality profiles. **Left OFF in the *performance* profile** to match its other disabled post-effects (volumetric, shadows, AO) — flag if you instead want it forced on even on the performance tier.
3. **Held-only brightness knob** — **RESOLVED (user, 2026-06-25): not added.** Brightness must change *both* torches, which the existing `torchIntensity` slider already does; `torchHeldBrightnessBoost` is dropped and the `3×`/`1×` parity constants stay internal/unchanged (S3 is a no-op).
4. **Model color vs particle color naming.** Two flame colors now exist: `torchFlameColor` (particles, pre-existing) and `torchModelFlameColor` (the cube). The UI labels them "Flame Color" under *Flame Particles* vs *Torch Glow (head)* respectively. Confirm that's clear enough, or rename one.
5. **Tone-mapping headroom.** Bloom thresholds against `sceneRT` (HDR-linear half-float). If torch emissive at `torchGlowIntensity 1.0` sits below ~0.75 luminance, the user must raise glow or lower threshold to see torch bloom. Defaults are tuned so the glow cube (`1.0` emissive, near-white `0xffff66`) blooms lightly; verify on hardware and adjust default `bloomThreshold` if torches don't bloom out-of-the-box.
6. **Held-torch reach default & the leak tradeoff (Part 3).** Default `torchHeldReach = 16` (placed baked reach ≈14). Widening `camProxGate` ungates *all* near dynamic light within the radius while the torch is on, so the held torch can bleed slightly through walls — the deliberate cost of "casts far" without per-frame baking. Acceptable default, or prefer a tighter `12`? Alternative (bigger, later CCR): a held-torch-centered voxel occlusion sample so reach extends *without* the leak — more expensive, deferred.
7. **Why not just raise `torchIntensity`?** It wouldn't help: beyond 9 blocks the shader gate zeroes the held contribution regardless of intensity. Part 3 (the gate) is the only thing that extends reach. Noted here so the fix isn't second-guessed.

## Change-reporting checklist (per CLAUDE.md)

- [ ] Grep each new identifier before declaring (no duplicate/shadowed `const`/`let`/`function`): `torchGlowIntensity`, `torchModelFlameColor`, `torchModelGlowColor`, `torchPlacedParticleRadius`, `torchHeldReach`, `_heldTorchReachUniform`, `uHeldTorchReach`, `bloomEnabled/Strength/Threshold/Radius/Scale`, `bloomRT`, `bloomMaterial`, `applyTorchGlowSettings`, `TORCH_FLAME_BASE_EMISSIVE`, `TORCH_GLOW_BASE_EMISSIVE`.
- [ ] All five S keys (incl. `torchHeldReach`) present in **DEFAULTS** + **SETTINGS** read-back; all five B keys present in **DEFAULTS** + **SETTINGS** + **3 profiles**.
- [ ] **No** `torchHeldBrightnessBoost` introduced; `HELD_TORCH_MULT`/`PLACED_TORCH_MULT` (25748–25749) and the held flicker `* 3` (43630) left untouched.
- [ ] P3: `uHeldTorchReach` declared in the fragment prelude (31624–31631) **and** bound via `shader.uniforms.uHeldTorchReach` (31911); gate (31925) uses it; `_heldTorchReachUniform.value` written each frame (43626).
- [ ] New DOM IDs exist in HTML **and** match every `getElementById` (updateUIFromSettings, event wiring, reset).
- [ ] New functions have JSDoc; strict equality; `??` (not `||`) for numeric defaults that allow `0`.
- [ ] No heavy per-frame work added: B4 is one half-res render **only when bloom enabled**; S4a + P5 are scalar reads. `applyTorchGlowSettings` runs only on settings change.
- [ ] Touch/worker parity untouched (no terrain funcs, no `pointermove` edits).
- [ ] Atlas/block tables untouched (no new blocks).
- [ ] Run `tools/voxex-tests.html` (serve over localhost) — expect all green.
- [ ] Bump `VOXEX_BUILD` (3936) + prepend a line to `VOXEX_RECENT_CHANGES` (3944). Do **not** bump `SETTINGS_VERSION` unless forcing a defaults reset.
- [ ] Stage only `voxEx.html` (+ this CCR); `git diff --stat` to confirm no stray EOL churn.

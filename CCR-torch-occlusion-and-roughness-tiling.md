# CCR — Torch Light Occlusion + Roughness-Map Greedy-Mesh Tiling (VoxEx)

**File:** `voxEx.html` (single-file rule honored — all changes stay in this one file)
**Type:** Bug fix (rendering / lighting + chunk material shader)
**Status:** Proposal / report — written to be reviewed before any code is changed. Hand to a Sonnet agent to implement.
**Date:** 2026-06-24. Line numbers verified against the working tree on this date; **re-confirm by grepping the named symbol before editing — the file drifts.**

> Three reported issues, **two root causes**. Issues 1 and 2 are two symptoms of a single bad gate on the torch's dynamic PointLight and are fixed by one change (**T1**). Issue 3 is an independent chunk-shader bug fixed by one change (**R1**). The two changes are unrelated and can be implemented/tested independently.

---

## Reported issues (developer's words, paraphrased)

1. **Adjacency vs. line-of-sight inconsistency.** When a torch is placed, a block directly *adjacent* to it does NOT block its glare, but a block ~2 cells away that blocks the *camera's line of sight to the torch* DOES block the glare. Introduced when the torch was changed so "the glare on the ground was not visible through blocks."
2. **Illumination fully killed when the torch sprite is hidden.** If a block is between the camera and the torch, ALL of the torch's light is removed — a torch on the lip of a drop gives zero visible illumination once you descend below and can't see the torch itself. Torches should light caves even when the torch sprite isn't directly visible.
3. **Roughness/gloss texels distort under greedy meshing.** The shiny pixels stretch across merged faces when placing blocks. The albedo atlas already tiles correctly across greedy-merged quads; the same per-block tiling needs to be applied to the roughness map.

---

## Verification log (against current `voxEx.html`, 2026-06-24)

| Symbol | Current line(s) | Role |
|---|---|---|
| `torchLightPool` (`updateOcclusion`) | **13725–13738** | **T1 change site** — camera-LOS gate on the dynamic PointLight |
| `torchLightPool.update` → `updateOcclusion(...)` calls | 13627, 13708 | callers (unchanged; behavior simplified via T1) |
| `getPointLightVisibility` | 43798–43854 (offsets 43789–43795) | camera→light 5-ray cone; **keep** — other live callers: legacy bool wrapper L43858, volumetric pass L44024 & L44056 |
| Volumetric pass torch loops (`updateVolumetricLighting`) | 43867+; `getPointLightVisibility` calls at **44024, 44056** | legitimate consumer of camera-LOS — **do not touch** |
| Shader baked-light gate **B1** | 31814–31817 (`bakedLightGate`, `directDiffuse/Specular`) | the *correct* "no light through walls" gate — already present |
| Roughness include (material shader) | **31539–31543** | **R1 change site** |
| Fragment varyings/uniform decls (`vQuadSize`, `tileWidth`) | 31527–31530 | already in scope for R1 |
| Albedo `<map_fragment>` tiled replacement (reference) | 31752–31797 | the tiling pattern R1 mirrors |
| `applyCylindricalFog` (onBeforeCompile owner) | 31496; applied to `chunkMaterial` ~31901 and `glassMaterial` ~31905 | one edit covers terrain + glass |

---

## Part 1 — Torch lighting (Issues 1 & 2)

### Background: three torch-lighting systems

A placed torch is lit by three independent mechanisms:

- **A. Baked voxel block-light flood-fill** — BFS from the torch through air, baked into chunk vertex colors (`updateBlockLightAt`; floored at 3 at mesh time). Physically correct; knows walls. This is the "real" cave light.
- **B. Dynamic `THREE.PointLight` pool** (`torchLightPool`) — up to `MAX_POINT_LIGHTS` real-time point lights tracking the nearest torches; this is the visible *sheen/gloss* on surfaces near a torch. It carries **two** gates:
  - **B1 (correct):** the chunk shader scales `reflectedLight.directDiffuse/Specular` by `bakedLightGate` (31814–31817) — the surface's own baked voxel light (which already encodes occlusion) decides whether the dynamic sheen shows, with a ~9-block held-torch proximity exemption. This is the real "no light through walls."
  - **B2 (the bug):** `torchLightPool.updateOcclusion` (13725–13738) multiplies the **entire light's `intensity`** by `getPointLightVisibility(light.position)`, which casts a 5-ray cone **from the torch toward the camera** (43798–43854).
- **C. Screen-space volumetric / god-ray pass** — the warm haze *in the air* around a light, sampled in screen space; gated by the same camera-LOS `getPointLightVisibility`. This gate is **appropriate** here (god-rays are view-dependent) and is **kept**.

### Root cause (both symptoms = B2)

`getPointLightVisibility` is **camera-relative**: it marches from the torch toward `getPlayerWorldPosition()` and returns `visibleRays/totalRays` (43831–43853). `updateOcclusion` then does `light.intensity = baseIntensity * visFactor` (13736).

- **Symptom 1:** a block *adjacent* to the torch usually isn't on the torch→camera segment, so all rays reach the eye → `visFactor≈1` → no blocking. A block ~2 cells away that *is* on the camera→torch line trips `rayBlocked` → glare killed. The gate keys off the camera's sightline to the torch sprite, not the voxel geometry around the light. (The march also starts at `dist=0.5`, `stepSize=1.5`, so it can skip the immediate-neighbor cell entirely.)
- **Symptom 2:** when the torch sprite goes behind a block, all 5 rays block → `visFactor→0` → `light.intensity→0` → the dynamic sheen on the (physically well-lit) cave floor vanishes. The gate conflates "camera can't see the bulb" with "the bulb can't light this spot."

B2 is redundant *and* wrong: the legitimate "no light through walls" is already handled physically by **B1** (a surface shadowed from the torch has low baked light → B1 suppresses its dynamic sheen). B2 should never have gated the PointLight's diffuse output.

### Change T1 — remove the camera-LOS gate from the dynamic PointLight

**Location:** `torchLightPool.updateOcclusion`, lines **13725–13738**.

**Current code:**
```js
                updateOcclusion(now) {
                    if (now - this._lastVisUpdate < 150) return;
                    this._lastVisUpdate = now;
                    if (typeof getPointLightVisibility !== 'function') return;
                    const baseIntensity = (typeof SETTINGS !== 'undefined' ? SETTINGS.torchIntensity : 2.0) * 1; // PLACED_TORCH_MULT (see applyTorchSettingsToLights)
                    for (const light of this.lights) {
                        if (!light.visible) continue;
                        const target = getPointLightVisibility(light.position);
                        const cur = light.userData.visFactor ?? target; // first sample: jump straight there
                        const next = cur + (target - cur) * 0.35; // ~0.5s settle at 150ms cadence
                        light.userData.visFactor = next;
                        light.intensity = baseIntensity * next;
                    }
                },
```

**Proposed code** (drop the camera-LOS visibility term; keep the function so intensity still tracks `SETTINGS.torchIntensity`, and update the JSDoc just above it to match):
```js
                updateOcclusion(now) {
                    // NOTE: camera line-of-sight gating REMOVED (was a bug — see CCR-torch-occlusion).
                    // Physical occlusion is handled correctly by (A) the baked voxel block-light BFS
                    // and (B1) the shader `bakedLightGate` (reflectedLight.directDiffuse/Specular *= ...,
                    // ~line 31814) which suppresses the dynamic sheen on surfaces the BFS says are dark.
                    // This function now only keeps each pooled light's intensity in sync with the setting.
                    if (now - this._lastVisUpdate < 150) return;
                    this._lastVisUpdate = now;
                    const baseIntensity = (typeof SETTINGS !== 'undefined' ? SETTINGS.torchIntensity : 2.0) * 1; // PLACED_TORCH_MULT (see applyTorchSettingsToLights)
                    for (const light of this.lights) {
                        if (!light.visible) continue;
                        light.intensity = baseIntensity;
                    }
                },
```

**Notes for the implementer:**
- **Do NOT touch** `getPointLightVisibility` (43798) or the volumetric pass (`updateVolumetricLighting`, ~43867) — they still legitimately gate the *in-air* glow by camera LOS, which is the "no glare through walls" feature the dev wants to keep for the haze.
- The two call sites (13627, 13708) can stay; the function is now a cheap intensity refresh.
- `light.userData.visFactor` is now unused — grep it (`grep -n "visFactor" voxEx.html`). It's set in the old loop and reset around line 13703 in the assignment path; remove the now-dead reset for tidiness if present, but only after confirming nothing else reads it.
- **Optional clarity rename:** `updateOcclusion` → `refreshTorchIntensity` (update both call sites and the JSDoc). Optional; keep the name if you prefer a minimal diff.

**Impact / why this satisfies both issues:**
- Symptom 2: the dynamic sheen is no longer zeroed when the sprite is hidden, so a torch on a ledge lights the floor below.
- Symptom 1: there is no longer a camera-relative gate to produce the adjacency-vs-LOS inconsistency. Surfaces physically shadowed from the torch are still darkened — by B1 (their baked light is low), not by where the camera is.
- The original intent ("don't splash dynamic light onto a surface the torch can't physically reach") is preserved by B1; the only thing removed is the *camera-relative* false occlusion.

**Risks:** minor — a surface within B1's 9-block `camProxGate` exemption (31814) always receives sheen regardless of baked light, so in tight quarters a held torch could sheen a surface that's technically wall-shadowed. That is **pre-existing** behavior tied to the held torch and is not changed here; flag for playtest (see Open Questions). Perf is a small *win* (drops ~5 raycasts × ≤8 lights / 150 ms).

---

## Part 2 — Roughness map (Issue 3)

### Background: how albedo tiles across greedy-merged quads

Greedy meshing merges N adjacent same-block faces into one large quad and writes the quad span into a per-vertex `quadSize` attribute, exposed to the fragment shader as `varying vec2 vQuadSize` (declared 31528). The albedo `<map_fragment>` include is replaced (31752–31797) with a per-tile version that does `fract(localUV * vQuadSize)` so a single atlas tile **repeats once per block** across the merged quad, plus a half-texel inset and a `textureGrad` whose gradients come from continuous world position (to kill atlas bleed and seam mips). `tileWidth = 1.0/NUM_TILES` (uniform, set ~31499).

### Root cause

The roughness map is sampled by the **stock** `#include <roughnessmap_fragment>` (31539–31543), which is `texture2D(roughnessMap, vRoughnessMapUv)`. Because `roughnessMap` has an identity UV transform on channel 0, three.js r160 aliases `vRoughnessMapUv` to `vMapUv` — i.e. the UV that spans the **entire merged quad**. So one roughness tile is **stretched across the whole merged quad** while albedo correctly repeats per block. On 1×1 quads `vQuadSize=(1,1)` and `fract(x*1)=x`, so the two paths coincide — which is why the distortion only appears on placed/merged multi-block faces, exactly as reported. The roughness sample simply never got the albedo path's `fract()/vQuadSize` tiling.

### Change R1 — apply the same per-block tiling to the roughness sample

**Location:** lines **31539–31543** (inside `applyCylindricalFog`'s `onBeforeCompile`).

**Current code:**
```js
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <roughnessmap_fragment>',
                            `#include <roughnessmap_fragment>
                            roughnessFactor = mix(1.0, roughnessFactor, uShininessStrength);`
                        );
```

**Proposed code** (replace the stock include with an inlined, per-block-tiled sample that mirrors the albedo path; recomputes its own tiled UV so it doesn't depend on the `#ifdef USE_MAP` block's locals):
```js
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <roughnessmap_fragment>',
                            `float roughnessFactor = roughness;
                            #ifdef USE_ROUGHNESSMAP
                                // Greedy-mesh per-block tiling — mirror of the albedo <map_fragment>
                                // path (~line 31752): repeat one atlas tile per block across a merged
                                // quad instead of stretching it. Without this, roughness/gloss texels
                                // smear across greedy-merged faces.
                                // Uses vMapUv exactly like the albedo path (L31757). map and roughnessMap
                                // share channel-0 identity UVs, so vMapUv == three.js's internal
                                // vRoughnessMapUv, and both chunkMaterial + glassMaterial carry map, so
                                // vMapUv is always declared here.
                                float _rLocalU = mod(vMapUv.x, tileWidth) / tileWidth;
                                float _rLocalV = fract(vMapUv.y);
                                float _rU = clamp(fract(_rLocalU * vQuadSize.x), 0.0078125, 0.9921875);
                                float _rV = clamp(fract(_rLocalV * vQuadSize.y), 0.0078125, 0.9921875);
                                float _rTileBase = floor(vMapUv.x / tileWidth) * tileWidth;
                                vec2 _rTiledUv = vec2(_rTileBase + _rU * tileWidth, _rV);
                                roughnessFactor *= texture2D(roughnessMap, _rTiledUv).g;
                            #endif
                            roughnessFactor = mix(1.0, roughnessFactor, uShininessStrength);`
                        );
```

**Notes for the implementer:**
- `tileWidth` and `vQuadSize` are already declared in this fragment shader (31528–31529) — no new varyings/uniforms.
- This replaces the stock include entirely; the inlined body reproduces stock `<roughnessmap_fragment>` (`roughnessFactor = roughness; ... *= texelRoughness.g;`) with the tiled UV, then keeps the existing `uShininessStrength` matte lerp.
- **Use `vMapUv`, not `vRoughnessMapUv`.** `vRoughnessMapUv` does not appear in `voxEx.html` (it lives only inside three.js's bundled `<roughnessmap_fragment>` chunk). The albedo path uses `vMapUv` (L31757), which is the same UV — `map` and `roughnessMap` share channel-0 identity transforms, and both `chunkMaterial` and `glassMaterial` carry `map`, so `vMapUv` is always declared. Sampling `roughnessMap` at the `vMapUv`-derived tile UV is correct.
- Use plain `texture2D` (above) first. Only upgrade to `textureGrad` with the albedo path's `bppX/bppY` gradients (31787–31791) if seam-mip banding appears on roughness in testing — roughness drives a scalar, so this is usually unnecessary.
- The half-texel inset clamp (`0.0078125, 0.9921875`) mirrors albedo for atlas-bleed parity; keep for correctness.

**Coverage:** `applyCylindricalFog` is the `onBeforeCompile` for **both** `chunkMaterial` and `glassMaterial`, so this one edit fixes terrain and glass together. (Glass is non-greedy, `quadSize=1`, so it's unaffected functionally but shares the path harmlessly.)

**Risks:** one-time shader recompile at load (already normal). Negligible per-fragment ALU cost. The Phase-3 env-reflection inject (~31556) reads `roughnessFactor`; once roughness is correctly per-block, its per-pixel sky reflection also becomes per-block — that's the intended payoff, but eyeball it.

---

## Worker parity & single-file checks

- **Single-file:** both changes stay entirely inside `voxEx.html`. ✅
- **Worker parity — none required for either change.**
  - T1 edits the main-thread `torchLightPool` and touches no terrain/tree function injected into the worker.
  - R1 edits an `onBeforeCompile` GLSL string only. The mesher already writes the `quadSize` attribute the fix consumes, and the worker mesher emits `quadSize` identically — confirm with `grep -n "quadSize" voxEx.html` (expect the attribute written in both the main and worker mesh paths). No `buildChunkWorkerCode` change.
- **No new settings, DOM IDs, or save-format changes.** `SETTINGS.torchIntensity` and `uShininessStrength` already exist and round-trip.

## Testing plan

1. **Serve and load** (Workers/IndexedDB need localhost), then run `tools/voxex-tests.html` (~204 tests) — expect no regressions (these changes are render-only; tests should stay green).
2. **Issue 1/2 (manual):** place a torch; build a 1-block wall between camera and torch — the lit floor area must remain lit. Place a torch on a ledge, descend below line-of-sight — the illuminated area must stay visible. Verify a block placed *between torch and a surface* still darkens that surface (B1 baked-light behavior). Confirm the *in-air* volumetric haze still does NOT bleed through a wall (C unchanged).
3. **Issue 3 (manual):** place a large flat run of a glossy block (stone/sand/snow) so greedy meshing merges it; confirm the shiny texels repeat per block instead of stretching. Re-break/replace to force a remesh and confirm stability. Check both a terrain chunk and a glass pane.
4. **Perf sanity:** `O` overlay — no FPS regression; T1 should marginally reduce per-frame raycasts.

## Open questions

1. **T1 — keep any physical gate on the dynamic PointLight, or rely solely on B1 + baked BFS?** Recommended: rely on B1 (simplest, as written). If playtest shows dynamic sheen leaking onto wall-shadowed surfaces near the camera (the `camProxGate` 9-block exemption at 31814), consider replacing B2 with a *light-centered* voxel test or sampling baked block-light at the light's cell instead — but only if needed.
2. **T1 — volumetric haze (C):** confirm the dev only wants *surface illumination* restored, not the in-air glow when the sprite is fully hidden. This CCR keeps C's camera-LOS gate (the legitimate "no glare through walls" home).
3. **T1 — `updateOcclusion` rename** to `refreshTorchIntensity` for clarity, or keep the name to minimize the diff?
4. **R1 — `texture2D` vs `textureGrad`** for roughness: ship with `texture2D`; only escalate if banding shows.

## Change-reporting checklist (per CLAUDE.md)

- [ ] No duplicate/shadowed identifiers introduced (T1 reuses existing names; R1 locals are `_r*`-prefixed — grep to confirm no collision).
- [ ] `getPointLightVisibility` and `updateVolumetricLighting` left intact (still used by the volumetric pass).
- [ ] `grep -n "visFactor"` — remove only after confirming no remaining readers.
- [ ] `grep -n "quadSize"` — confirm the attribute is emitted by both main + worker mesh paths (R1 consumes it; no parity edit needed).
- [ ] No work added to the per-frame path (T1 is a net reduction; R1 is compile-time GLSL).
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (console boot banner, top of `voxEx.html`).
- [ ] Run `tools/voxex-tests.html` (serve over localhost); expect all green.

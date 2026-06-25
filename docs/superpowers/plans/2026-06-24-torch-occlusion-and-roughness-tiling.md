# Torch Occlusion + Roughness Tiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two independent rendering bugs: (T1) torch PointLight intensity was incorrectly gated by camera line-of-sight, killing illumination when the torch sprite is hidden; (R1) roughness/gloss texels stretch across greedy-merged faces instead of tiling per block.

**Architecture:** Both changes are in `voxEx.html` (single-file project). T1 is a JS runtime change to `torchLightPool.updateOcclusion` — removes a broken camera-LOS intensity gate, relying instead on the already-correct baked-light shader gate (B1). R1 is a compile-time GLSL string injection in `applyCylindricalFog`'s `onBeforeCompile` — replaces the stock `<roughnessmap_fragment>` include with a per-block tiled version that mirrors the existing albedo tiling path.

**Tech Stack:** Vanilla JS, Three.js r160, GLSL (WebGL2), single HTML file

## Global Constraints

- Single-file rule: all changes stay inside `voxEx.html`
- Do NOT modify `getPointLightVisibility` (line ~43798) or `updateVolumetricLighting` (~43867) — they still correctly gate the volumetric in-air haze
- Re-verify line numbers by grepping named symbols before every edit (the file drifts)
- `VOXEX_BUILD` and `VOXEX_RECENT_CHANGES` must be bumped on the commit
- Run `tools/voxex-tests.html` over localhost; all tests must stay green

---

### Task 1: T1 — Remove camera-LOS gate from `updateOcclusion`

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (two edit sites: the function body ~13725–13738, and the stale JSDoc ~13713–13724, and the dead `visFactor` reset ~13698)

**Interfaces:**
- Consumes: `torchLightPool` object, `SETTINGS.torchIntensity`
- Produces: no API change; `updateOcclusion(now)` still exists at same call sites

- [ ] **Step 1: Verify current code matches spec before touching anything**

Run these two greps and confirm the output matches what the CCR describes:

```bash
grep -n "updateOcclusion\|visFactor\|getPointLightVisibility" D:/Projects/voxex/voxEx.html
```

Expected output should include lines ~13625, ~13698, ~13707, ~13725–13736, and the `getPointLightVisibility` call at ~13732. If line numbers have drifted significantly, adjust the Read offsets below accordingly.

- [ ] **Step 2: Replace `updateOcclusion` body and its JSDoc**

In `voxEx.html`, find and replace the JSDoc block + function body. The **old** text (lines ~13713–13738) is:

```js
                /**
                 * Dim each pooled torch PointLight by its voxel line-of-sight to the
                 * player (5-ray cone, same sampling the volumetric pass uses). The
                 * dynamic PointLight is only the "gloss" on top of baked voxel block
                 * light, so an obscured torch must not splash dynamic light onto
                 * surfaces in front of its occluder (torch-behind-a-log ground flare).
                 * Baked block light still illuminates the torch's own area correctly.
                 * Smoothed toward the target factor to avoid popping. Throttled to
                 * every 150ms; ~5 rays x <=8 lights of cheap voxel lookups.
                 * @param {number} now - performance.now() timestamp.
                 * @returns {void}
                 */
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

Replace with:

```js
                /**
                 * Keep each pooled torch PointLight's intensity in sync with
                 * SETTINGS.torchIntensity. Physical occlusion ("no light through walls")
                 * is handled by (A) the baked voxel block-light BFS and (B1) the chunk
                 * shader's bakedLightGate (~line 31814) which suppresses dynamic sheen on
                 * surfaces the BFS says are dark. The former camera-LOS gate (B2) was
                 * removed — it keyed off whether the camera could see the torch sprite,
                 * not whether a surface could receive the torch's light, causing two bugs:
                 * (1) adjacency vs LOS inconsistency, (2) illumination killed when the
                 * torch sprite went behind a block. See CCR-torch-occlusion-and-roughness-tiling.
                 * Throttled to every 150ms (unchanged).
                 * @param {number} now - performance.now() timestamp.
                 * @returns {void}
                 */
                updateOcclusion(now) {
                    if (now - this._lastVisUpdate < 150) return;
                    this._lastVisUpdate = now;
                    const baseIntensity = (typeof SETTINGS !== 'undefined' ? SETTINGS.torchIntensity : 2.0) * 1; // PLACED_TORCH_MULT (see applyTorchSettingsToLights)
                    for (const light of this.lights) {
                        if (!light.visible) continue;
                        light.intensity = baseIntensity;
                    }
                },
```

- [ ] **Step 3: Remove the now-dead `visFactor` reset**

Find this block (~line 13696–13699) — the comment + reset that existed to prevent the old smoothing loop from inheriting the previous torch's dim factor:

```js
                                // Reassigned to a different torch — reset occlusion smoothing
                                // so the new torch doesn't inherit the old one's dim factor.
                                light.userData.visFactor = undefined;
```

Delete those three lines entirely. The `if (!light.visible || ...)` outer condition and `light.position.set(...)` below it stay — only remove the comment + assignment inside.

- [ ] **Step 4: Confirm no remaining `visFactor` readers**

```bash
grep -n "visFactor" D:/Projects/voxex/voxEx.html
```

Expected: zero matches. If any remain, they are stale — remove them.

- [ ] **Step 5: Confirm `getPointLightVisibility` is still intact**

```bash
grep -n "getPointLightVisibility" D:/Projects/voxex/voxEx.html
```

Expected: the function definition (~43798) and its two callers in the volumetric pass (~44024, ~44056) — the two updateOcclusion call-sites at ~13732 are now gone. Do NOT touch the remaining callers.

---

### Task 2: R1 — Apply per-block tiling to the roughness map sample

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (one edit site: the `#include <roughnessmap_fragment>` replace, ~31539–31543)

**Interfaces:**
- Consumes: `vQuadSize` (varying vec2, declared ~31528), `tileWidth` (uniform float, ~31529), `vMapUv` (built-in Three.js UV varying), `roughnessMap` (sampler2D), `roughness` (float), `uShininessStrength` (uniform float)
- Produces: `roughnessFactor` (float) — correctly tiled per block; consumed by the Phase-3 env-reflection inject (~31556) and the standard lighting path

- [ ] **Step 1: Verify the current roughness replace block and surrounding context**

```bash
grep -n "roughnessmap_fragment\|vQuadSize\|tileWidth\|uShininessStrength" D:/Projects/voxex/voxEx.html | head -30
```

Confirm `roughnessmap_fragment` appears at ~31540, and that `vQuadSize` / `tileWidth` are declared earlier in the same shader (should be ~31528–31529). Confirm `uShininessStrength` is in scope.

- [ ] **Step 2: Replace the roughness fragment shader injection**

Find the **old** text (~lines 31535–31543, including the comment block above):

```js
                        // roughnessFactor is set by the stock <roughnessmap_fragment> chunk
                        // (= roughness * roughnessMap.g). Lerp toward 1.0 (matte) by strength so the
                        // baked shiny texels only glint when strength > 0. No-ops safely if the
                        // material ever drops its roughnessMap (the include string vanishes).
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <roughnessmap_fragment>',
                            `#include <roughnessmap_fragment>
                            roughnessFactor = mix(1.0, roughnessFactor, uShininessStrength);`
                        );
```

Replace with:

```js
                        // roughnessFactor: per-block tiled roughness sample, mirroring the albedo
                        // <map_fragment> tiling path (~line 31752). Without tiling, greedy-merged
                        // quads stretch one roughness atlas texel across the whole face.
                        // vMapUv == vRoughnessMapUv (map and roughnessMap share channel-0 identity
                        // UVs; vMapUv is always declared because both chunkMaterial and glassMaterial
                        // carry map). Uses plain texture2D (not textureGrad) — roughness drives a
                        // scalar so seam-mip banding is usually invisible; escalate if needed.
                        // uShininessStrength lerp kept from original: 0 → matte, 1 → full gloss.
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <roughnessmap_fragment>',
                            `float roughnessFactor = roughness;
                            #ifdef USE_ROUGHNESSMAP
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

- [ ] **Step 3: Confirm no name collisions for the `_r*` locals**

```bash
grep -n "_rLocalU\|_rLocalV\|_rU\|_rV\|_rTileBase\|_rTiledUv" D:/Projects/voxex/voxEx.html
```

Expected: only the lines you just added. If any pre-existing matches appear, rename the locals (e.g. `_rgh_U`, `_rgh_V`, etc.) to avoid GLSL redeclaration errors.

- [ ] **Step 4: Confirm `quadSize` attribute parity (worker path)**

```bash
grep -n "quadSize" D:/Projects/voxex/voxEx.html | head -20
```

Expected: `quadSize` written in both the main-thread mesh path and the worker mesh path (both as a BufferAttribute). R1 only *reads* the attribute in the shader; no worker edit needed. Just confirm it's already emitted from both paths.

---

### Task 3: Build bump + commit

**Files:**
- Modify: `D:\Projects\voxex\voxEx.html` (lines ~3936, ~3944)

**Interfaces:**
- Consumes: current `VOXEX_BUILD` value (`"2026-06-23.30"`)
- Produces: bumped `VOXEX_BUILD` (`"2026-06-24.31"`) and updated `VOXEX_RECENT_CHANGES`

- [ ] **Step 1: Bump `VOXEX_BUILD`**

Find:
```js
            const VOXEX_BUILD = "2026-06-23.30";
```

Replace with:
```js
            const VOXEX_BUILD = "2026-06-24.31";
```

- [ ] **Step 2: Prepend entry to `VOXEX_RECENT_CHANGES`**

Find the opening of the array (line ~3944):
```js
            const VOXEX_RECENT_CHANGES = [
                "CAMERA FAR PLANE SCALES WITH RENDER DISTANCE...
```

Insert as the **first** element:
```js
            const VOXEX_RECENT_CHANGES = [
                "TORCH OCCLUSION + ROUGHNESS TILING FIX (CCR-torch-occlusion-and-roughness-tiling, build 2026-06-24.31). Two independent fixes. (T1) Removed camera line-of-sight gate from torchLightPool.updateOcclusion: the gate multiplied PointLight intensity by getPointLightVisibility (a 5-ray torch→camera cone), killing all dynamic sheen when the torch sprite went behind a block (Issue 2) and producing adjacency-vs-LOS inconsistency (Issue 1). Physical 'no light through walls' is already handled correctly by (A) the baked voxel block-light BFS and (B1) the chunk shader's bakedLightGate (~line 31814) which suppresses dynamic sheen on surfaces the BFS marks as dark. The function now only keeps pooled light intensity synced with SETTINGS.torchIntensity. getPointLightVisibility and the volumetric pass (updateVolumetricLighting) are untouched — they still legitimately gate the in-air haze by camera LOS. (R1) Fixed roughness/gloss texels stretching across greedy-merged faces: replaced the stock #include <roughnessmap_fragment> with a per-block tiled sample that mirrors the albedo <map_fragment> path — fract(localUV * vQuadSize) repeats one atlas tile per block. Uses vMapUv (same channel-0 UV as albedo), plain texture2D, half-texel inset clamp (0.0078125). uShininessStrength matte lerp preserved. Covers both chunkMaterial and glassMaterial (single applyCylindricalFog onBeforeCompile path).",
                "CAMERA FAR PLANE SCALES WITH RENDER DISTANCE...
```

(Keep the rest of the existing array unchanged — only add the new first element.)

- [ ] **Step 3: Verify the build string is consistent**

```bash
grep -n "VOXEX_BUILD\|2026-06-24.31" D:/Projects/voxex/voxEx.html
```

Expected: `VOXEX_BUILD = "2026-06-24.31"` at ~3936, and `2026-06-24.31` referenced in the new RECENT_CHANGES entry. No stale `2026-06-23.30` should remain in the BUILD line.

- [ ] **Step 4: Commit**

```bash
git -C D:/Projects/voxex add voxEx.html
git -C D:/Projects/voxex commit -m "$(cat <<'EOF'
fix: torch occlusion bug + roughness tiling on greedy-merged faces (build 2026-06-24.31)

T1: remove camera-LOS gate from torchLightPool.updateOcclusion — the gate
killed PointLight intensity when the torch sprite was occluded and produced
adjacency-vs-LOS flicker. Physical occlusion is correctly handled by the
baked block-light BFS (A) and shader bakedLightGate (B1, ~line 31814).
Also removes dead visFactor smoothing state.

R1: replace stock <roughnessmap_fragment> with per-block tiled sample in
applyCylindricalFog onBeforeCompile, mirroring the albedo <map_fragment>
tiling path. Fixes roughness/gloss texels stretching across greedy-merged
faces. Covers chunkMaterial + glassMaterial.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Testing notes

These are render-only changes; the automated test suite (`tools/voxex-tests.html`, ~204 tests) exercises JS logic, not GPU output, so all tests should stay green without any test edits.

**Manual verification required (serve over localhost):**

- **T1:** Place a torch; build a 1-block wall between camera and torch — the lit floor must stay lit. Descend below a ledge-torch — illuminated area must remain. Confirm a block between torch and surface still darkens that surface (B1 behavior intact). Confirm volumetric in-air haze does NOT bleed through walls (C path unchanged).
- **R1:** Place a long flat run of glossy blocks (stone/sand/snow) so greedy meshing merges them; confirm shiny texels repeat per block instead of stretching. Break/replace to force remesh; confirm stability. Check glass pane (non-greedy, quad=1×1 — functionally unaffected but harmlessly shares the path).

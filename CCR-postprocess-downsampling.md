# CCR — Downsample Post-Processing Passes (VoxEx)

> Hand this to Claude Code. **Single-file rule:** every change stays inside `voxEx.html`.
> Line numbers verified against the working tree on **2026-06-16**; re-confirm by
> searching for the named symbol before editing (the file drifts as it's worked on).
> This document is written to be **reviewed before any code is changed** — each
> change lists the exact site, the current code, the proposed code, and an impact
> analysis of everything it touches.

---

## ✅ Verification log (code in this CCR checked against voxEx.html, 2026-06-16)

What was checked and corrected so the proposed code uses methods that actually exist
in the file:

- **Imports (lines 1899–1903 importmap, 6830–6834):** the file imports `THREE`,
  `PointerLockControls`, `EffectComposer`, `RenderPass`, `ShaderPass` only.
  - ❌ **`Pass.FullScreenQuad` is NOT available** (no `Pass.js` import). *Corrected:*
    this CCR now uses a **manual fullscreen quad** built from THREE core
    (`OrthographicCamera` + `PlaneGeometry(2,2)` + `Mesh`), rendered with
    `renderer.setRenderTarget`/`render` — the exact methods the refraction capture
    already uses (43024–43027). No new addon needed for the quad.
  - ➕ **One new import required:** `TexturePass` (used to feed the captured scene
    back into the composer so the composer keeps owning final color). Add it next to
    the other postprocessing imports (after 6834). It is a stock addon at
    `three/addons/postprocessing/TexturePass.js`.
- **Color management:** there is **no** `outputColorSpace`, `toneMapping`,
  `ColorManagement`, `OutputPass`, or `GammaCorrectionShader` anywhere. Final color
  is defined solely by the composer's last to-screen pass (this is why the code at
  43119 warns that direct `renderer.render()` looks different). *Corrected design:*
  the new **composite is the composer's last pass**, so it inherits the identical
  color path the current `colorGradingPass` has — no manual sRGB matching, far lower
  risk than the previous draft implied.
- **Render targets:** the file never calls `WebGLRenderTarget.setSize()` and never
  reads `composer.readBuffer` — both were assumptions in the earlier draft.
  *Corrected:* new targets are resized with **dispose-and-rebuild** (the file's
  established pattern, 43849–43878), and the scene is captured with the **refraction
  pattern** (`setRenderTarget` → `render`), not via composer internals. `sceneRT` is
  created as `composer.renderTarget1.clone()` so its type/colorspace match RenderPass
  output exactly.
- **God rays vs underwater are mutually exclusive:** `updateVolumetricLighting`
  (42765–42769) zeroes god rays while `isUnderwater`. So a glow buffer only ever holds
  god rays (above water) or caustics (below) — never both at once. Simplifies Change 3.
- **`.uniforms` access preserved:** `volumetricLightPass` becomes the god-ray
  `ShaderMaterial` (a `ShaderMaterial` exposes `.uniforms`), so `updateVolumetricLighting`
  (42762) and the per-frame mutations (43297–43305, 43340–43344) keep working unchanged.
- **Confirmed present & used as written:** `${SETTINGS.volumetricSamples}` (27093) and
  `${MAX_POINT_LIGHTS}` (27064, 27219) shader template literals; `ShaderPass.uniforms`
  (everywhere); `renderer.setRenderTarget/clear/render` (43024–43027);
  `composer.setSize` (43844); `THREE.WebGLRenderTarget` + `THREE.DepthTexture` (refraction).

### Second audit — additional gaps found (2026-06-16)

A follow-up pass found items the first draft missed. All are folded into the changes below:

1. **Second `composer.render()` call site — `captureWorldThumbnail()` (21667–21694, the
   call is at 21675).** World-save thumbnails render one frame via `composer.render()`
   then read `renderer.domElement`. After the refactor that produces a **stale/empty
   thumbnail**, because the composer chain now starts from `sceneRT`, which is only
   populated by the manual scene render inside `renderFrame`. **Fix:** make
   `captureWorldThumbnail` call `renderFrame()` (the full new flow) instead of
   `composer.render()`. Added as Change 4d.
2. **The rewire census (old §7 4c) was incomplete — two per-frame drivers were missing
   and would silently stop updating:**
   - `updateColorGrading()` (15965–15984) sets `colorGradingPass.uniforms.{sunrise,
     sunset}Influence` **every frame**; its guard `if (!colorGradingPass) return;`
     (15966) must become `if (!uberPass) return;` and write `uberPass.uniforms.*`.
   - Per-frame zombie block (43099–43105) sets `zombieScarePass.uniforms.{enableVignette,
     enableDesaturation,zombieProximity}` → repoint to `uberPass`.
   - Also missed: zombie **settings sliders** (23278–23296, via `window.zombieScarePass`),
     zombie **toggles** (28090–28092), and a zombie **apply path** (28825).
   The census is now given in full (Change 4c) — but still **grep all four identifiers**
   and diff against it; treat the list as a checklist, not a guarantee.
3. **Creation-order bug:** `sceneRT = composer.renderTarget1.clone()` needs `composer`
   to already exist (created 26816) **and** the new passes (`uberPass`, `compositePass`)
   to be defined. So the target/quad/chain setup belongs **after ~27250** (after the
   shader/pass definitions), NOT at ~26808 next to the refraction target. Corrected in
   Change 2a.
4. **The glow buffers must be `HalfFloatType`.** The composer's `renderTarget1` is HalfFloat
   (so `sceneRT = clone()` is correctly HDR-linear). God rays + additive caustics can
   exceed 1.0; an 8-bit glow buffer would clamp bright cores before compositing and shift
   the look. Create both glow buffers as `type: THREE.HalfFloatType`. Corrected in Change 2a.
5. **Reuse existing gates:** `renderFrame` already computes `volumetricActive` /
   `underwaterActive` (43112–43114). Drive the glow render from those rather than new
   flags.
6. **Verify `composer.renderTarget1.samples === 0`** before relying on `clone()`. If a
   future change makes the composer multisampled, sampling the clone's `.texture`
   needs a resolve. (Today MSAA is on the renderer, not the composer — expected 0.)
7. **Volumetric settings sliders (22769–22835, 27977–28003) need NO repoint** because
   `volumetricLightPass` stays a `.uniforms`-bearing object (the god-ray `ShaderMaterial`).
   Confirm the material is assigned to **both** `volumetricLightPass` and
   `window.volumetricLightPass`.

---

## 0. Key finding that shapes the whole design

The passes are **not** simple overlays you can render small and paste on top. Two
bake the scene and the effect together, and several sub-effects are per-pixel
*multiplies* that cannot be downsampled without blurring the whole image:

| Pass | What it does to the pixel | Downsamplable? |
|------|---------------------------|----------------|
| Volumetric god rays (~27017) | reads scene, **adds** god rays + sky fog + point-light fog → outputs `scene + glow` | **Yes** — the *added* term is low-frequency. Refactor to emit the glow delta only. |
| Underwater caustics (part of ~26879) | `color += causticEffect` (additive, ~12 trig ops) | **Yes** — additive, low-frequency. Separable. |
| Underwater absorption/tint/vignette/distortion | `color *= transmittance`, `mix(...)`, `color *= vignette`, distorted UV fetch | **No** — per-pixel multiplies; downsampling blurs the scene. Keep full-res. |
| Zombie desaturate + vignette (~26821) | `mix(color, gray, …)`, `color *= …` | **No** — cheap full-frame transform. Keep full-res. |
| Color grade (~15923) | `color *= tint` | **No** — cheap full-frame transform. Keep full-res. |

**Consequence:** the architecture becomes (a) a full-res "uber-pass" for the cheap
transforms, (b) **half-res additive glow buffers** holding god rays (above water) or
caustics (below water), and (c) a final composite that adds the upscaled glow onto
the full-res scene. The expensive raymarch is the only cost that does **not** already
shrink with the existing Pixel Ratio slider (`renderer.setPixelRatio`, 26746), which
is exactly why this is worth doing.

---

## 1. Context — verified pipeline (line numbers 2026-06-16)

**Composer build** (`init`, one block):
- `composer = new EffectComposer(renderer)` — **26816** (inherits Pixel Ratio).
- `renderPass = new RenderPass(scene, camera)` add — **26817–26818**.
- `ZombieScareShader` def **26821–26871**; `zombieScarePass` add **26873–26876**.
- `UnderwaterShader` def **26879–27008**; `underwaterPass` add **27010–27013**.
  - distortion 26954–26960 · absorption 26975–26979 · **caustics (separable)
    26984–26989** · tint 26991–26993 · desat 26995–26997 · vignette 26999–27003.
- `MAX_POINT_LIGHTS = 4` — **27016**.
- `VolumetricLightShader` def **27017–27239**; `volumetricLightPass` add **27241–27244**.
  - `main()` **27174–27237** outputs `scene + glow`; god-ray sample loop **27093–27101**
    reads `tDiffuse`.
- `colorGradingPass = createColorGradingPass()` add **27247–27250**
  (`createColorGradingPass` **15923–15962**, returns `null` if `colorGradingEnabled` false).

**Per-frame** (`renderFrame`, **42980**):
- Refraction capture **42986–43067** (the reduced-res render-target pattern to copy).
- `updateVolumetricLighting(performance.now())` **43090–43091** (defined **42758**;
  **zeroes god rays when `isUnderwater`** at 42765–42769).
- `composer.render()` in **two** places: two-pass torch/viewmodel path **43166–43167**
  and single-pass path **43190–43191**. Layer-1 viewmodel drawn on top **43173–43178**.
- Underwater uniform mutation: `underwaterPass.uniforms.*` **43272–43279**, **43332–43333**;
  `volumetricLightPass.uniforms.{density,fogDensity,exposure}` **43297–43305**, **43340–43344**.

**Resize** (`onWindowResize`): `renderer.setSize` **43842**, `composer.setSize` **43844**,
refraction target **dispose-and-rebuild** (NOT `setSize`) **43849–43878**.

**Settings pattern (Pixel Ratio slider — copy exactly):**
- HTML: **2521–2524** (`#pixel-ratio-slider`/`#pixel-ratio-val`), reset button 2525.
- `SETTINGS` init **5847**; `DEFAULTS` **6089**.
- `SETTINGS_PROFILES`: performance `pixelRatio` **6226** (samples 6233), balanced **6244**
  (samples 6251), quality **6262** (samples 6269).
- `updateUIFromSettings()` defined **28423**; pixel-ratio sync **28502**. **Two more**
  sync blocks also touch `#pixel-ratio-slider`: **22015–22026** and **27908–27912** —
  grep `pixelRatioSlider` and mirror at all three.
- Event listeners at **~22479** (outside `init`, uses `window.renderer`) **and** **28416–28421**
  (in `init`) — this duplication matters; see §1e. Reset-Rendering handler **28538–28551**
  (`pixelRatio` reset 28545); Reset-All **28517–28537** (`Object.keys(DEFAULTS)` loop
  auto-copies new keys; side-effects 28525–28536).

**External references to passes being removed/merged (rewire in Change 4):** 16047,
23010–23030, 28083–28085, 28472–28474 & 28483, 28529–28531, 28700–28703, 29023–29025.

**Not involved:** terrain gen, web workers, texture atlas, block tables.

---

## 2. End goal

1. God rays rendered into a **half-res** buffer, additively composited.
2. Underwater **caustics** moved into a half-res buffer of their own; other underwater
   color ops stay full-res.
3. Cheap full-frame transforms (zombie desaturate+vignette, underwater
   absorption/tint/desat/vignette+distortion, color grade) merged into **one** full-res
   uber-pass.
4. Two new sliders — **Volumetric Resolution** and **Underwater Caustic Resolution** —
   fully wired (DEFAULTS / SETTINGS / 3 profiles / UI / live-apply / save-load).

**Success:** at scales = `1.0` the frame is visually identical to today;
`tools/voxex-tests.html` (~204 tests) pass; sliders persist + apply live; perf overlay
shows fewer GPU ms at low scale.

---

## 3. Target render flow (verified-feasible)

```
ONE-TIME (init), AFTER the pass definitions (~27250 — composer + uberPass/compositePass must exist first):
  import { TexturePass } from "three/addons/postprocessing/TexturePass.js";  // after line 6834
  sceneRT  = composer.renderTarget1.clone()  // full res, matches RenderPass color params
  volumetricGlowRT / causticGlowRT          // HalfFloat RGBA, Linear, each sized by its OWN scale (2a/§13)
  _postQuadScene = new THREE.Scene()
  _postQuadCam   = new THREE.OrthographicCamera(-1,1,1,-1,0,1)
  _postQuadMesh  = new THREE.Mesh(new THREE.PlaneGeometry(2,2), <material swapped per use>)
  godRayMaterial = new THREE.ShaderMaterial(<VolumetricLightShader, delta output>)
  volumetricLightPass = godRayMaterial            // keeps .uniforms working
  causticMaterial = new THREE.ShaderMaterial(<caustic-only, AdditiveBlending>)  // Change 3
  uberPass     = new ShaderPass(UberPostShader)   // Change 4
  compositePass= new ShaderPass(CompositeShader)  // adds tGlow; LAST pass → owns color
  composer.addPass(new TexturePass(sceneRT.texture)); composer.addPass(uberPass); composer.addPass(compositePass)  // see 4b
  // ⭐ §12.1 RECOMMENDED: collapse these 3 into ONE pass reading sceneRT directly (no TexturePass)

PER FRAME (replaces composer.render() at 43166/43190):
  1. camera.layers → 0 (+2 in third person), exclude 1
  2. SCENE → sceneRT      (refraction pattern: setRenderTarget(sceneRT); clear(); render(scene,camera); setRenderTarget(null))
  3. GLOW → active glow buffer (ONLY if that source is contributing — see §13.A gate):
       above water & god rays visible : material=godRayMaterial (tDiffuse=sceneRT.texture); target=volumetricGlowRT
       underwater (Change 3)          : material=causticMaterial;                            target=causticGlowRT
       // ⚠ clear the glow buffer to BLACK, not renderer.clear() — see §11.6 (global clear
       //   color is the dynamic SKY color; clearing to it tints the glow → washes the frame)
       prevColor=getClearColor; prevAlpha=getClearAlpha; setClearColor(0x000000, 0);
       setRenderTarget(target); clear(); render(_postQuadScene,_postQuadCam); setRenderTarget(null);
       setClearColor(prevColor, prevAlpha);
       (god rays are zeroed underwater @42765, so the two never run the same frame;
        if neither contributes — e.g. dark midnight, no torches — skip this step entirely)
  4. compositePass.uniforms.glowEnabled.value = glowActive ? 1 : 0    // skip add when no glow
     if (glowActive) compositePass.uniforms.tGlow.value = activeGlowRT.texture  // else keep last valid tex (never null — §2c init)
  5. composer.render()    // TexturePass(sceneRT) → uberPass → compositePass→screen (color inherited)
  6. (unchanged) draw Layer-1 viewmodel on top  (43173–43178)
```

The existing shader vertex code (`projectionMatrix * modelViewMatrix * vec4(position,
1.0)` + `uv`) is already compatible with the `PlaneGeometry(2,2)` + ortho-cam quad, so
the god-ray vertex shader needs no change.

> **Recommended consolidation (§12.1):** `TexturePass`, `uberPass`, and `compositePass`
> can be a SINGLE full-res `ShaderPass` reading `sceneRT` directly — same math/order/color,
> but full-res post fill drops from 3 passes to 1 and the `TexturePass` import is dropped.
> The split below is described for clarity; §12.1 is the leaner target. Also see §12.2
> (temporally throttle the glow) for a further ~2× on the raymarch.

---

## 4. CHANGE 1 — Settings scaffolding (do first)

### 1a. `SETTINGS` init — after line 5847
```js
pixelRatio: savedSettings.pixelRatio !== undefined ? savedSettings.pixelRatio : 0.5,
// NEW: post-process downsample scales (1.0 = full res / no downsample)
volumetricScale: savedSettings.volumetricScale !== undefined ? savedSettings.volumetricScale : 0.5,
causticScale: savedSettings.causticScale !== undefined ? savedSettings.causticScale : 0.5,
```

### 1b. `DEFAULTS` — after line 6089
```js
pixelRatio: 0.5,
volumetricScale: 0.5,
causticScale: 0.5,
```

### 1c. `SETTINGS_PROFILES` — add next to each `volumetricSamples`
- performance (after 6233): `volumetricScale: 0.5, causticScale: 0.5,`
- balanced (after 6251): `volumetricScale: 0.5, causticScale: 0.5,`
- quality (after 6269): `volumetricScale: 1.0, causticScale: 1.0,` (reproduces today's look)

### 1d. HTML sliders — insert after line 2524 (before reset button 2525)
```html
<div class="setting-item">
    <label for="volumetric-scale-slider">Volumetric Resolution: <span id="volumetric-scale-val">0.5</span>x</label>
    <input type="range" id="volumetric-scale-slider" min="0.25" max="1.0" step="0.05" value="0.5" />
</div>
<div class="setting-item">
    <label for="caustic-scale-slider">Underwater Caustic Resolution: <span id="caustic-scale-val">0.5</span>x</label>
    <input type="range" id="caustic-scale-slider" min="0.25" max="1.0" step="0.05" value="0.5" />
</div>
```

### 1e. Event listeners — wire at EVERY `pixelRatioSlider` listener scope
> ⚠️ **The slider wiring is DUPLICATED across multiple independent scopes** in this file
> (pre-existing). `grep pixelRatioSlider`: there are listener blocks at **~22479** (uses
> `saveSettings()` / `isGameActive()` / **`window.renderer`** → this block is **NOT inside
> `init`**) and **~28416** (uses `localStorage.setItem` / `renderer` → inside `init`). Each
> scope **re-declares** `const pixelRatioSlider = document.getElementById(...)` locally.
> Mirror the new sliders in **each** such scope, declaring their consts **locally there**
> (a const from another scope is not visible — using it throws `ReferenceError`):
```js
const volumetricScaleSlider = document.getElementById("volumetric-scale-slider");
const volumetricScaleVal = document.getElementById("volumetric-scale-val");
const causticScaleSlider = document.getElementById("caustic-scale-slider");
const causticScaleVal = document.getElementById("caustic-scale-val");
volumetricScaleSlider?.addEventListener("input", () => {
    SETTINGS.volumetricScale = parseFloat(volumetricScaleSlider.value);
    if (volumetricScaleVal) volumetricScaleVal.textContent = SETTINGS.volumetricScale.toFixed(2);
    saveSettings();                        // ~22479 block; in the ~28416 block use localStorage.setItem("voxex_settings", JSON.stringify(SETTINGS))
    window.resizePostProcessTargets?.();   // live rebuild of glow buffers
});
causticScaleSlider?.addEventListener("input", () => {
    SETTINGS.causticScale = parseFloat(causticScaleSlider.value);
    if (causticScaleVal) causticScaleVal.textContent = SETTINGS.causticScale.toFixed(2);
    saveSettings();                        // (same persist-call choice per block)
    window.resizePostProcessTargets?.();
});
```
**Use the exact persist call the surrounding block uses — do NOT write `saveSettings ? …`**
(a bare undeclared identifier in a condition throws `ReferenceError`; `saveSettings()` exists
in the ~22479 scope, while the ~28416 scope uses `localStorage.setItem(...)`). **Call `resizePostProcessTargets`
via `window.`** (exposed in §2a) — the ~22479 block is outside `init`, so a bare
`resizePostProcessTargets` is not in scope there and would silently no-op (slider changes
`SETTINGS` but never rebuilds the glow buffers until the next window resize).

### 1f. UI sync — at EVERY `pixelRatioSlider` SYNC site (declare consts locally each time)
The slider→value **sync** appears in these scopes: **22015–22026**, **27908–27912**, and
inside `updateUIFromSettings` (~28502). Each re-declares its consts locally. At each, add the
lookups **and** the sync:
> ⚠️ **Robust rule (avoids duplicate-`const`):** treat this per *function*, not per
> snippet. In each function that references `pixelRatioSlider`, declare the new consts
> **exactly once** and then replicate **every** operation that function performs on
> `pixelRatioSlider` (a value-sync, an `addEventListener`, or both). In the cases traced
> here the listener scopes (22432, 28416) and the sync scopes (22015, 27908,
> `updateUIFromSettings`) are separate functions — but if any one function does both, add a
> single const declaration there and do both ops. Never declare the same const twice in one
> scope, and never reference another scope's const.
```js
const volumetricScaleSlider = document.getElementById("volumetric-scale-slider");
const volumetricScaleVal = document.getElementById("volumetric-scale-val");
const causticScaleSlider = document.getElementById("caustic-scale-slider");
const causticScaleVal = document.getElementById("caustic-scale-val");
if (volumetricScaleSlider) volumetricScaleSlider.value = SETTINGS.volumetricScale;
if (volumetricScaleVal) volumetricScaleVal.textContent = SETTINGS.volumetricScale.toFixed(2);
if (causticScaleSlider) causticScaleSlider.value = SETTINGS.causticScale;
if (causticScaleVal) causticScaleVal.textContent = SETTINGS.causticScale.toFixed(2);
```
> Net: `grep` both `pixel-ratio-slider` (HTML) and `pixelRatioSlider` (JS); for **every**
> hit add the parallel `volumetric-scale`/`caustic-scale` line. Treat each scope as
> self-contained: declare locally, never cross-reference. This duplicated wiring is the
> single most error-prone part of the change.

### 1g. Reset Performance-Rendering — after line 28545
```js
SETTINGS.volumetricScale = DEFAULTS.volumetricScale;
SETTINGS.causticScale = DEFAULTS.causticScale;
```
…and after that handler's `updateUIFromSettings()` call, add
`if (typeof resizePostProcessTargets === "function") resizePostProcessTargets();`.

### 1h. Reset All (28517) — the `Object.keys(DEFAULTS)` loop auto-copies the new keys;
add `if (typeof resizePostProcessTargets === "function") resizePostProcessTargets();`
near the other side-effects (28525–28536).

**Impact — Change 1**
- Save/load automatic (whole `SETTINGS` is serialized; old saves fall back to the
  `!== undefined` defaults). No migration.
- Profiles only set keys they list; all three now list both, so switches are deterministic.
- Only live side effect is rebuilding the glow buffers — no chunk/lighting rebuild.
- Risk: the two **secondary** UI-sync blocks (22015–22026, 27908–27912) are easy to
  miss → slider thumb won't reflect saved value on some menu paths (cosmetic). Mirror all three.

---

## 5. CHANGE 2 — God-ray downsample (highest value)

### 2a. New import + targets + quad — in `init` **after the pass definitions (~27250)**
> ⚠️ Order matters: `composer.renderTarget1.clone()` needs `composer` (created 26816)
> AND `uberPass`/`compositePass` to exist, so this block goes **after ~27250** (where
> `colorGradingPass` is added today), replacing the `composer.addPass(...)` calls — NOT
> next to the refraction target at 26808.

- Import (after 6834): `import { TexturePass } from "three/addons/postprocessing/TexturePass.js";`
- Create `sceneRT = composer.renderTarget1.clone();` then size it (2e). Cloning the
  composer's own target guarantees the TexturePass-fed image matches RenderPass color
  **and inherits its `HalfFloatType`** (HDR-linear).
- Create **two** glow buffers — `volumetricGlowRT` and `causticGlowRT` — each
  **`HalfFloatType`**, LinearFilter, RGBA, no depth, **each sized by its OWN scale** (god
  rays and caustics never run the same frame, so one shared `max()` buffer would over-size;
  see §13). HDR type so bright cores aren't clamped at 1.0 before compositing.
- Create the shared manual quad: `_postQuadScene`, `_postQuadCam`
  (`OrthographicCamera(-1,1,1,-1,0,1)`), `_postQuadMesh` (`Mesh(PlaneGeometry(2,2), …)`).
- Define the resize/rebuild helper (referenced by Change 1 + the resize handler), using
  the file's **dispose-and-rebuild** pattern (not `setSize`):
```js
const _dbSize = new THREE.Vector2();
function resizePostProcessTargets() {
    // Source of truth: the renderer's ACTUAL drawing-buffer size already bakes in
    // devicePixelRatio * SETTINGS.pixelRatio, so post targets track the low pixel ratio
    // exactly and can never render "over the top" of the real frame. (See §13.)
    renderer.getDrawingBufferSize(_dbSize);
    const fw = Math.max(1, Math.floor(_dbSize.x));
    const fh = Math.max(1, Math.floor(_dbSize.y));
    if (window.sceneRT && (window.sceneRT.width !== fw || window.sceneRT.height !== fh)) {
        window.sceneRT.dispose(); window.sceneRT = composer.renderTarget1.clone(); window.sceneRT.setSize(fw, fh);
    }
    // Each glow buffer sized by ITS OWN scale (god rays + caustics never coexist), so a
    // high volumetric scale never bloats the caustic buffer and vice-versa.
    const sizeGlow = (rt, scale) => {
        const gw = Math.max(1, Math.floor(fw * scale)), gh = Math.max(1, Math.floor(fh * scale));
        if (!rt || rt.width !== gw || rt.height !== gh) {
            if (rt) rt.dispose();
            return new THREE.WebGLRenderTarget(gw, gh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType });
        }
        return rt;
    };
    window.volumetricGlowRT = sizeGlow(window.volumetricGlowRT, SETTINGS.volumetricScale);
    window.causticGlowRT     = sizeGlow(window.causticGlowRT, SETTINGS.causticScale);
    logDebug(`[PostFX] scene ${fw}x${fh} (drawing buffer) · volGlow ×${SETTINGS.volumetricScale} · causticGlow ×${SETTINGS.causticScale}`);
}
```
After defining it: assign the initial `window.sceneRT = composer.renderTarget1.clone();`,
expose `window.resizePostProcessTargets = resizePostProcessTargets;` (so the out-of-`init`
settings listeners at ~22479 can call it — §1e), then call `resizePostProcessTargets()`
once to size `sceneRT` and create both glow buffers. Also expose `window.uberPass` /
`window.compositePass` next to `window.volumetricLightPass` (29023) for the settings UI.
> `.clone()` then `.setSize()` is acceptable here because `sceneRT` is **color-only**
> (the ANGLE bug at 43849 was specific to a `DepthTexture` attachment).
> The composite samples `tGlow` = whichever glow buffer is active this frame
> (`volumetricGlowRT` above water, `causticGlowRT` underwater) — see §13.

### 2b. Modify `VolumetricLightShader.main()` to emit the **glow delta only** (27174–27237)
The fog helpers already return `incoming + fogTerm`, so passing `0` yields the term
alone — minimal edit. Replace the scene-passthrough with glow accumulation:
```glsl
// was: vec4 texel = texture2D(tDiffuse, vUv); vec3 color = texel.rgb;
//      if (!enabled) { gl_FragColor = vec4(color, texel.a); return; }
//      if (no lights) { gl_FragColor = vec4(color, texel.a); return; }
if (!enabled) { gl_FragColor = vec4(0.0); return; }
if (sunVisible<=0.0 && moonVisible<=0.0 && pointLightCount==0) { gl_FragColor = vec4(0.0); return; }
... vec3 totalGodRays = vec3(0.0); ...
vec3 glow = vec3(0.0);
glow = addPointLightFog(glow, ...);          // in the point-light loop (replace `color`)
glow = calculateSkyAtmosphericFog(glow, ...);
glow += totalGodRays;
gl_FragColor = vec4(glow, 1.0);
```
**Do not touch** `calculateGodRay` (27081–27105) — it still samples `tDiffuse` (now =
`sceneRT.texture`) for brightness. Keep all uniforms and both `${…}` template literals.
Wrap this shader in a `THREE.ShaderMaterial` and set `volumetricLightPass = thatMaterial`
so `.uniforms` keeps working for 42762 / 43297–43305 / 43340–43344.

### 2c. Composite shader (new `ShaderPass`, LAST in composer → owns color, renders to screen)
**Color grade lives HERE, not in the uber-pass** — see §10 for why (the grade must
multiply `scene + glow`, matching the current order where volumetric runs before
colorGrade).
```glsl
// uniforms: tDiffuse (uber-pass output), tGlow (active glow buffer, half res, linear), glowEnabled (float),
//           sunriseInfluence (float), sunsetInfluence (float)
varying vec2 vUv;
void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec3 glow = glowEnabled > 0.5 ? texture2D(tGlow, vUv).rgb : vec3(0.0);  // bilinear upscale = free blur
    vec3 c = base.rgb + glow;
    // Color grade — identical math to createColorGradingPass (15948–15954), applied to scene+glow
    c = mix(c, c * vec3(1.1, 0.9, 0.7), sunriseInfluence * 0.3);
    c = mix(c, c * vec3(1.2, 0.8, 0.6), sunsetInfluence * 0.4);
    gl_FragColor = vec4(c, base.a);
}
```
`tDiffuse` is auto-wired by `ShaderPass`; set `tGlow`/`glowEnabled` per frame (§3 step 4).
**Initialize `tGlow.value` to a real texture at creation** (e.g. `volumetricGlowRT.texture`)
and start `glowEnabled` at `0`, so the first frame — or any frame with no glow — never binds
a null sampler (a null `sampler2D` uniform warns and can render garbage on some drivers).
`sunriseInfluence`/`sunsetInfluence` are driven by `updateColorGrading` (repointed in 4c).
**Do not set `compositePass.renderToScreen` manually** — EffectComposer auto-assigns it
to the last enabled pass each `render()`; just ensure `compositePass` is last and enabled.

### 2d. `renderFrame` orchestration — replace the two `composer.render()` calls (43166–43167, 43190–43191)
Implement §3 steps 1–6. Keep the surrounding layer logic exactly: scene→`sceneRT` is
Layer 0 (+2 third-person, **not** Layer 1); the Layer-1 viewmodel block (43173–43178)
stays **after** `composer.render()`. When no glow source is active, set
`glowEnabled = 0` and skip the glow render entirely (don't even clear the active glow buffer).

### 2e. Resize handler (43842–43878)
Add a `resizePostProcessTargets()` call. **Keep** the existing
`volumetricLightPass.uniforms.aspectRatio` update (43846–43847) — it now writes to the
god-ray material and is required for the circular glow. Leave the refraction
dispose-rebuild block (43849–43878) untouched.

### 2f. Preserve per-frame uniform mutation
`volumetricLightPass` = the god-ray `ShaderMaterial`; `.uniforms` stays valid, so
42762, 43297–43305, 43340–43344 and `window.volumetricLightPass` (29023–29025) need no
logic change — just confirm they resolve to the material.

**Impact — Change 2**
- **Color (now LOW risk).** Because `compositePass` is the composer's last to-screen
  pass, it inherits the exact color path `colorGradingPass` has today; and `sceneRT` is
  a clone of `composer.renderTarget1`, so the TexturePass-fed scene matches RenderPass
  output. **Parity gate:** scale 1.0, volumetrics off → pixels identical to current;
  then volumetrics on.
- **One scene render, not two.** RenderPass is replaced by `TexturePass(sceneRT)`; the
  scene is rendered once (step 2). No added main-scene cost.
- **Viewmodel** (Layer 1) stays excluded from `sceneRT` (god rays won't sample
  torch/hands) and is drawn after the composite — same as today.
- **Early-exit perf.** When no glow source is active the glow pass is skipped entirely
  → dry-land/effect-off frames cost *less* than today (today the full-res volumetric
  pass still runs and short-circuits in-shader).
- **Point-light fog** moves into the half-res buffer (soft radial glow → fine at half res).
- `perfMetrics.volumetricTime` (43088–43093) measures the uniform update, not the GPU
  pass — still valid.
- **Memory:** +1 full-res RGBA (`sceneRT`) + two half-res RGBA glow buffers — a few MB, negligible.

---

## 6. CHANGE 3 — Underwater caustics → half-res  ⚠️ higher risk / lower reward

Only `caustic()` (26938–26945, ~12 trig ops/pixel) is worth moving; everything else
underwater is cheap and stays full-res (Change 4). Underwater only renders while
submerged, and **god rays are off underwater** (42765), so the caustic quad has `causticGlowRT`
to itself those frames.

### 3a. `causticMaterial` quad → `causticGlowRT` (additive)
New `ShaderMaterial`. Its fragment shader must include the **caustic helper functions, which
live BEFORE the cited range** (a literal copy of "26937–26989" would omit them and fail to
compile): `hash` (26921–26923), `noise` (26926–26935), `caustic` (26938–26945). Then in
`main()` recompute `fibDarkness` from `underwaterDepth` (the ladder 26965–26973) →
`depthFactor` (26982), and apply (26985–26988):
```glsl
float causticPattern = caustic(vUv, time * 0.001);
float causticMask    = smoothstep(0.8, 0.2, vUv.y);
float causticEffect  = causticPattern * causticMask * causticStrength * (1.0 - depthFactor * 0.7);
gl_FragColor = vec4(causticEffect * vec3(0.8, 0.9, 1.0), 1.0);
```
Uniforms: `time`, `underwaterDepth`, `causticStrength` (= the underwater shader's `0.15` at
26893). `THREE.AdditiveBlending`; rendered into `causticGlowRT` (sized by `causticScale`)
only when `isUnderwater` (§3 step 3), which is cleared to **black** first (§11.6).

### 3b. Remove caustic lines from the underwater color path
Delete 26984–26989 (they don't carry into the uber-pass).

**Impact — Change 3 (why you may decline it)**
- **Compositing-order delta (real risk).** Today caustics are added *before* the
  underwater tint/desat/vignette multiplies and before color grade. As a final
  additive overlay they're added *after* those → underwater caustics read slightly
  brighter / less tinted. A subtle but real visual change, not a pure optimization.
- **Mitigations, pick one:**
  1. Accept the minor delta (caustics are faint).
  2. Multiply the caustic buffer by the same vignette/tint factors in the composite
     (re-derive from `underwaterDepth` + screen pos) to restore parity — more code.
  3. **Skip Change 3** — keep caustics in the full-res uber-pass. You still get
     Change 4's bandwidth win and zero underwater visual change. *Recommended unless
     profiling shows underwater caustics are a measured cost.*

---

## 7. CHANGE 4 — Merge cheap transforms into one full-res uber-pass

### 4a. New `UberPostShader` (one `ShaderPass`, full res)
Single fragment shader applied in the **current chain order**: read `tDiffuse` (at the
underwater-distorted UV when `isUnderwater`, else `vUv`) → zombie desaturate + vignette
(26848–26866) → underwater absorption + tint + desat + vignette (26975–27003, **minus**
caustics if Change 3 done). **Color grade is NOT here — it moves to the composite (2c)**
so it can wrap `scene + glow` (§10). Carry the zombie uniforms (`zombieProximity,
vignetteIntensity, enableVignette, enableDesaturation`) and underwater uniforms
(`isUnderwater, underwaterDepth, time, waterColor, absorptionR/G/B, tintStrength,
distortionStrength, vignetteStrength`); gate each block by its uniform. Full GLSL in §10.

> Sampling rule (critical): when `isUnderwater`, sample the scene at the distorted UV,
> but compute **both vignettes (zombie red + underwater) from `vUv`** (screen position),
> exactly as the originals do. Zombie ops are per-pixel so applying them to the distorted
> sample is identical to the current "zombie pass then underwater resamples it".

> Order note: zombie runs before underwater today, so underwater samples the
> zombie-processed image at distorted UVs. Because zombie ops are per-pixel, applying
> zombie to the distorted sample inside the merged pass is identical. Grade stays last.
> Verify with an A/B screenshot.

### 4b. Composer chain edits
Build the new chain with `addPass` (so each pass gets its initial `setSize`), in order:
```js
composer.addPass(new TexturePass(sceneRT.texture));   // replaces RenderPass
composer.addPass(uberPass);
composer.addPass(compositePass);                       // last → auto renderToScreen, owns color
```
- **Remove** `composer.addPass(renderPass)` (26818) — TexturePass(sceneRT) replaces it.
  (`renderPass = new RenderPass(...)` at 26817 may stay constructed but unused, or be removed.)
- **Remove** `composer.addPass(zombieScarePass)` (26876), `composer.addPass(underwaterPass)`
  (27013), `composer.addPass(volumetricLightPass)` (27244 — now the offscreen god-ray
  material), and `composer.addPass(colorGradingPass)` (27247–27250).
- Final `composer.passes` order must be exactly `[TexturePass, uberPass, compositePass]`.

### 4c. Rewire every external reference — FULL census (grep all four identifiers and diff)
Repoint **all** `underwaterPass` / `colorGradingPass` / `zombieScarePass` sites to
`uberPass`. Leave `volumetricLightPass` sites alone (it becomes the god-ray
`ShaderMaterial`, still `.uniforms`-bearing). Declaration at 11366 (`let composer,
renderPass, zombieScarePass, underwaterPass, volumetricLightPass;`) — add `uberPass,
compositePass`; `colorGradingPass` already declared at 15921.

| Site | Today | After |
|------|-------|-------|
| **15966** | `if (!colorGradingPass) return;` (in `updateColorGrading`, per frame) | `if (!compositePass) return;` |
| **15982–15983** | `colorGradingPass.uniforms.{sunrise,sunset}Influence` per frame | `compositePass.uniforms.*` (grade lives in composite, 2c) |
| 16047–16048 | `underwaterPass.uniforms.waterColor` | `uberPass.uniforms.waterColor` |
| 23010–23030 | `window.underwaterPass.uniforms.absorption*` | `uberPass` (keep `window.waterMaterialRefraction`) |
| **23278–23296** | `window.zombieScarePass.uniforms.{enableVignette,vignetteIntensity,enableDesaturation}` (settings sliders) | `window.uberPass` |
| 28083–28085 | absorption slider listeners → `underwaterPass` | `uberPass` |
| **28090–28092** | zombie toggle/slider listeners → `zombieScarePass` | `uberPass` |
| 28472–28474, 28483 | zombie/colorGrading UI checkbox **sync** | unchanged (drive `uberPass` uniforms) |
| 28529–28532 | reset-all `zombieScarePass.uniforms.*` | `uberPass.uniforms.*` |
| 28700–28703 | absorption reset → `underwaterPass` | `uberPass` |
| **28825** | apply-path `zombieScarePass.uniforms.*` | `uberPass.uniforms.*` |
| 29023–29025 | `window.{volumetricLightPass,zombieScarePass,underwaterPass}` exports | add `window.uberPass`; repoint zombie+underwater; keep `window.volumetricLightPass` (the material) |
| **43099–43105** | per-frame `zombieScarePass.uniforms.{enableVignette,enableDesaturation,zombieProximity}` | `uberPass.uniforms.*` |
| 43272–43279, 43332–43333 | `underwaterPass.uniforms.*` per frame | `uberPass.uniforms.*` |
| 43297–43305, 43340–43344 | `volumetricLightPass.uniforms.*` | unchanged (material keeps `.uniforms`) |
| 22769–22835, 27977–28003 | `volumetricLightPass.uniforms.*` (volumetric sliders) | unchanged (material keeps `.uniforms`) |
| **43846–43847** | `volumetricLightPass.uniforms.aspectRatio` in `onWindowResize` (circular god-ray glow) | unchanged (material keeps `.uniforms`) — **keep this line in the resize handler** |

### 4d. Fix the second `composer.render()` site — `captureWorldThumbnail()` (21667–21694)
Line 21675 calls `composer.render()` to render one frame for the world-save thumbnail.
After the refactor the composer chain starts from `sceneRT`, which is only populated by
`renderFrame`'s manual scene render — so a bare `composer.render()` would capture a
stale/empty frame with no glow. **Change 21672–21678 to call `renderFrame()`** (guard
that `sceneRT`/`composer` exist). Then `ctx.drawImage(renderer.domElement, …)` /
`toDataURL` work unchanged.

### 4e. `createColorGradingPass()` (15923) + the enabled gate
Grade folds into the **composite** pass (2c); `createColorGradingPass` is no longer
added as a separate pass (remove the 27247–27250 add). The composite always runs, so the
disabled state must be handled by **zeroing the influences** (today the pass simply isn't
in the chain when `colorGradingEnabled` is false):
- In `updateColorGrading` (15965): add an early branch — if `!SETTINGS.colorGradingEnabled`,
  set `compositePass.uniforms.sunriseInfluence.value = 0; compositePass.uniforms.sunsetInfluence.value = 0;`
  and return; otherwise compute as today and write to `compositePass.uniforms`.
- The `colorGradingToggle` handler (28483 sync / its listener) should likewise force the
  influences to 0 when unchecked. No add/remove of passes at runtime.

**Impact — Change 4**
- **Visual parity** hinges on 4a order. A/B at scale 1.0, underwater + zombie-near +
  sunset, must match current.
- **Every** uniform poke site (4c) must be repointed or that effect silently stops
  updating. Most error-prone change — grep `underwaterPass`, `colorGradingPass`,
  `zombieScarePass` across the file and confirm each hit.
- Bandwidth: 5 full-screen passes → TexturePass + uberPass + compositePass (+ half-res
  glow) = fewer full-res round-trips even before downsampling.
- Watch **duplicate/shadowed identifiers** for `uberPass`, `sceneRT`, `volumetricGlowRT`,
  `causticGlowRT`, `resizePostProcessTargets`, `_postQuad*`, `godRayMaterial`,
  `causticMaterial`, `compositePass` — search first (CLAUDE.md rule).

---

## 8. CHANGE 5 — Verification

1. Serve over localhost; run `tools/voxex-tests.html` (~204 tests) → zero regressions.
2. **Visual A/B at scale 1.0** (both new sliders = 1.0): screenshot (a) sun/god rays,
   (b) submerged/caustics, (c) zombie nearby, (d) **sunset with sun on screen** — this
   one specifically catches the grade-wraps-glow order (§10.1): god rays must read the
   same warm tint as the pre-change build, not brighter/yellower. Parity gate for Changes 2–4.
3. **Visual at 0.5:** god rays + caustics look the same bar fine-detail softening.
4. **Lighting A/B at scale 1.0 (per §11):** (i) **night, torch-lit** — point-light fog
    halos + emissive torch brightness match (catches HDR clamp if an RT is 8-bit);
    (ii) **shadows on, midday** — sun shadows present, not doubled, missing, or a frame
    behind (catches shadow-timing); (iii) **deep cave** — darks read identically (the
    min-light floor of 3 is vertex-color, must be untouched); (iv) **day→night sweep** —
    smooth, with grade still wrapping scene+glow.
5. **Glow black-clear (catches the §11.6 clear-color bug):** submerge with caustics on —
    the frame must NOT take on an overall sky/fog tint or wash out. If it does, the glow
    buffer is being cleared to the renderer's sky clear color instead of black.
6. **Perf:** O-overlay + `renderer.info`, GPU/frame ms at 1.0 vs 0.5 (sun on screen, and
   submerged) → confirm reduction.
7. **Persistence + duplicated wiring:** reload restores both sliders; profile switch sets
   them; Reset Rendering + Reset All restore defaults and rebuild targets. Because the
   slider wiring is duplicated across scopes (§1e/§1f), open **every** settings path that
   shows the Rendering panel and confirm both new sliders read correctly AND apply live
   (the glow buffer visibly rebuilds) — a missed scope = a slider that's dead in one menu.
8. **Resize:** resize / open DevTools → no GL framebuffer errors; refraction still works.
9. **World-save thumbnail:** save a world and confirm the thumbnail is the current
   frame (not black/stale) — verifies the `captureWorldThumbnail` fix (4d).
10. Bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` entry.

---

## 10. Execution-detail & GLSL review (2026-06-16)

### 10.1 Order analysis — why color grade must be in the composite
Current chain per pixel (passes 1–5):
```
final = colorGrade( volumetric( underwater( zombie(scene) ) ) )
      = ( underwaterColor + godRayGlow + fog ) * gradeTint        // grade wraps the glow
```
Volumetric (the glow) runs BEFORE colorGrade, so the glow IS tinted. If grade were in
the uber-pass, the result would be `(underwaterColor * gradeTint) + glow` — glow untinted.
At sunset (`sunsetInfluence` up to 1.0, tint `(1.2,0.8,0.6)`), god rays would read too
bright/yellow. **Fix:** grade is in the composite, computing `(scene + glow) * gradeTint`
(2c). This reproduces the current order exactly.

### 10.2 What is pixel-identical, and the one latent difference
| State (currently reachable) | New vs current |
|---|---|
| Above water, no zombie (zombieProximity=0), volumetric on | **Identical** — uber = zombie(no-op)+underwater(no-op) = scene; glow = god rays+fog; composite = `(scene+glow)*grade`. |
| Above water, volumetric off | **Identical** — glowEnabled=0; composite = `scene*grade`. |
| Underwater | God rays are zeroed (42765); glow = caustics (Change 3). Caustic compositing-order delta is the **only** difference, already flagged in Change 3. |
| Sunset/sunrise god rays | **Identical** now that grade wraps scene+glow (10.1). |

**Latent (not currently reachable):** the god-ray material samples `sceneRT` (= raw
scene `c0`), whereas the current volumetric pass samples `c2` (after zombie + underwater).
They differ only if `zombieProximity > 0` — but that is hardcoded `0.0` (43103–43105,
"TODO when zombies implemented"), and god rays are off underwater, so in every reachable
state `c2 == c0` where god rays are active. **If zombie proximity is ever wired up, god
rays would sample the un-desaturated scene** (minor; the glow's brightness source would
ignore the zombie desaturation). Note it; not worth solving now.

### 10.3 Full merged `UberPostShader` fragment (review target)
```glsl
uniform sampler2D tDiffuse;
// zombie
uniform float zombieProximity; uniform float vignetteIntensity;
uniform bool enableVignette; uniform bool enableDesaturation;
// underwater
uniform bool isUnderwater; uniform float underwaterDepth; uniform float time;
uniform vec3 waterColor; uniform float absorptionR, absorptionG, absorptionB;
uniform float tintStrength; uniform float distortionStrength; uniform float vignetteStrength;
varying vec2 vUv;

void main() {
    // --- underwater distortion picks the SAMPLE uv; vignettes still use vUv ---
    vec2 sampleUV = vUv;
    if (isUnderwater) {
        float waveX = sin(vUv.y * 10.0 + time * 0.0005) * distortionStrength;
        float waveY = cos(vUv.x * 8.0  + time * 0.0003) * distortionStrength * 0.7;
        sampleUV = vUv + vec2(waveX, waveY);
    }
    vec4 texel = texture2D(tDiffuse, sampleUV);
    vec3 color = texel.rgb;

    // --- ZOMBIE (runs first in the current chain) ---
    if (enableDesaturation && zombieProximity > 0.0) {
        float gray = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(color, vec3(gray), zombieProximity * 0.6);
    }
    if (enableVignette && zombieProximity > 0.0) {
        float d = length(vUv - 0.5);                      // vUv, not sampleUV
        float vig = smoothstep(0.5, 1.5, d);
        vec3 redTint = vec3(0.8, 0.1, 0.1);
        float amt = vig * zombieProximity * vignetteIntensity;
        color = mix(color, color * (1.0 - amt) + redTint * amt, amt);
    }

    // --- UNDERWATER color ops (NO caustics — moved to causticGlowRT; NO god rays) ---
    if (isUnderwater) {
        float fibDarkness = 0.5;
        if (underwaterDepth >= 2.0)  fibDarkness = 0.7;
        if (underwaterDepth >= 3.0)  fibDarkness = 0.9;
        if (underwaterDepth >= 5.0)  fibDarkness = 1.1;
        if (underwaterDepth >= 8.0)  fibDarkness = 1.3;
        if (underwaterDepth >= 13.0) fibDarkness = 1.5;
        if (underwaterDepth >= 21.0) fibDarkness = 1.7;
        if (underwaterDepth >= 34.0) fibDarkness = 1.9;
        if (underwaterDepth >= 55.0) fibDarkness = 2.1;
        color *= exp(-vec3(absorptionR, absorptionG, absorptionB) * fibDarkness);
        float depthFactor = clamp(fibDarkness / 1.9, 0.0, 1.0);
        // (caustics intentionally omitted here — see Change 3)
        float tint = tintStrength * 0.5 * (1.0 + depthFactor * 0.3);
        color = mix(color, color * waterColor * 1.5, tint);
        float gray = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(color, vec3(gray) * waterColor * 1.2, depthFactor * 0.15);
        float vig = smoothstep(0.3, 0.9, length(vUv - 0.5));    // vUv
        color *= 1.0 - (vig * vignetteStrength * (1.0 + depthFactor * 0.5));
    }

    gl_FragColor = vec4(color, texel.a);
}
```
This is line-for-line the zombie (26848–26866) then underwater (26963–27003) math, minus
the caustic lines (26984–26989) and minus the grade (→ composite). Vertex shader = the
existing `projectionMatrix * modelViewMatrix * vec4(position,1.0)` + `uv` (quad-compatible).

### 10.4 god-ray delta material — exact diff
Only `main()` of `VolumetricLightShader` changes (2b): early-exits output `vec4(0.0)`
instead of the scene; the accumulator starts at `vec3(0.0)` and feeds `addPointLightFog`
/ `calculateSkyAtmosphericFog` (which return `incoming + term`, so passing `0` yields the
term); output `vec4(glow, 1.0)`. `calculateGodRay` (27081–27105) is untouched and keeps
sampling `tDiffuse` (= `sceneRT.texture`). All uniforms and both `${…}` literals preserved.

### 10.5 Composer mechanics to verify during implementation
- `EffectComposer.render()` auto-sets `renderToScreen` on the last enabled pass — do NOT
  set it manually; just keep `compositePass` last. (This is why today's `colorGradingPass`
  reaches the screen without a manual flag, and why the composite inherits the linear→sRGB
  conversion that defines "correct" color here.)
- `TexturePass` has `needsSwap = true`, so `uberPass` reads its output as `tDiffuse` and
  `compositePass` reads `uberPass`'s output — the swap chain is intact.
- Build the chain with `addPass` (gives each pass its initial `setSize`); resizing is
  handled by `composer.setSize` (43844) for the in-chain passes plus
  `resizePostProcessTargets()` for `sceneRT` + the two glow buffers.

---

## 11. Lighting-safety checks (verify nothing dims, shifts, or double-renders)

Lighting in VoxEx is mostly **baked into vertex colors** at mesh time (`vertexColor =
AO × light/15`, floored at 3) plus Three.js sun/moon/torch lights and manually-controlled
shadow maps. None of that is touched by this CCR — but the scene-capture + composite
rework can still break it in subtle ways. Each item below is verified or must be verified.

1. **Color/tone pipeline — VERIFIED no transforms to lose.** Grepped: there is **no**
   `toneMapping`, `outputColorSpace`, `outputEncoding`, `useLegacyLights`, or
   `physicallyCorrectLights` set anywhere. So the only color transform is the default
   linear→sRGB at the **final to-screen pass**. Because `compositePass` is that pass
   (EffectComposer auto-assigns `renderToScreen` to the last enabled pass), the conversion
   happens identically to today's `colorGradingPass`. The scale-1.0 A/B is the proof.

2. **HDR preservation — `sceneRT` AND both glow buffers must be `HalfFloatType`.** `composer`
   is built as `new EffectComposer(renderer)` (26816, no options) → its `renderTarget1` is
   HalfFloat. `sceneRT = composer.renderTarget1.clone()` inherits that; create
   `volumetricGlowRT` and `causticGlowRT` with `type: THREE.HalfFloatType` too. **Verify** `composer.renderTarget1.texture.type
   === THREE.HalfFloatType` at runtime. If either RT is 8-bit, bright **emissive torches
   and sky** clamp at 1.0 before god-ray brightness sampling and before compositing —
   god rays would dim and highlights would crush. (8-bit is the single most likely way
   this refactor "ruins lighting.")

3. **Shadow-map timing — scene→`sceneRT` MUST run after the shadow block (43071–43085).**
   `shadowMapDirty` is the only thing that sets `renderer.shadowMap.needsUpdate = true`
   (43073), and it runs *before* the `composer.render()` site. The new manual scene
   render replaces `composer.render()` at that same site, so it consumes the shadow
   update exactly as `RenderPass` did — sun/moon shadows bake into `sceneRT`. **Do not
   move the scene render earlier** (e.g., ahead of 43071), or shadows render a frame late
   / into the wrong target. The refraction capture (43026) still uses last frame's shadow
   map as today — unchanged.

4. **`MAX_POINT_LIGHTS` shadow boundary — build the god-ray material in the init scope.**
   There are two declarations: module-scope `= 8` (6485, scene torch lights) and
   init-scope `= 4` (27016, the volumetric fog limit). The god-ray shader's
   `${MAX_POINT_LIGHTS}` and its uniform arrays (`pointLightPositions[…]` etc., built at
   27030) currently bake to **4**. Construct the god-ray `ShaderMaterial` **and** its
   uniform arrays in the same init scope after 27016 so they stay `4`. **Do not hoist**
   the material to module scope to colocate it with other materials — it would resolve to
   `8`, mismatch the uniform arrays, and break torch point-light fog. Leave
   `updateVolumetricLighting` (42758) untouched.

5. **Layers on the scene→`sceneRT` render** — `camera.layers.set(0)` (+`enable(2)` in
   third person), excluding Layer 1, mirroring the refraction capture (43021). This keeps
   the world's torch/sun illumination in `sceneRT` while the **viewmodel torch mesh** is
   excluded so god rays don't sample it. The viewmodel is still drawn after the composite
   (its point light already illuminated the world in `sceneRT`).

6. **Clear color — the glow buffer MUST be cleared to BLACK, not the renderer's clear
   color (real bug if missed).** `renderer`'s global clear color is **not** black: it's set
   to `SETTINGS.daySkyBottom` (26748) and **re-set every frame** to the sky/fog color
   (41923 `_undergroundFogColor`, 41926 `skyMaterial…bottomColor`). The only existing
   `renderer.clear()` (43025, refraction) relies on that because it then draws the whole
   scene. For the glow buffer there is no scene behind it — so a bare `renderer.clear()`
   fills it with the sky color, and the composite then adds *sky color + glow* to the frame.
   Fatal for the additive **caustic** path (underwater washes out); wrong-in-principle for
   god rays too. **Fix:** save clear color, `setClearColor(0x000000, 0)`, clear the glow
   target, render the quad, restore (use a scratch `THREE.Color` for `getClearColor` to
   avoid a per-frame alloc). The scene→`sceneRT` clear, by contrast, *should* keep the
   sky-color clear (it draws the sky over it, exactly like refraction).
   - autoClear is true by default; the two-pass viewmodel block flips it to false at 43175
     and back at 43178 — confirm it's true at the next frame's scene render.
   - God rays (normal blend, full-screen overwrite) and caustics (additive) never share a
     frame (god rays zeroed underwater, 42765), so each glow buffer is unambiguous; the
     black clear is what makes the additive caustic path correct.

7. **Underwater fog/god-ray uniforms unchanged** — the underwater density/exposure tweaks
   (43297–43305) still target `volumetricLightPass.uniforms` (now the god-ray material).
   They're moot underwater (god rays zeroed) but harmless; leave them. `scene.fog`
   handling (43286–43296) is on the scene render → captured in `sceneRT` unchanged.

8. **Debug-overlay draw-call count will rise (not a regression)** — the debug overlay reads
   `renderer.info.render.calls` (29352–29359). The new flow adds passes (scene→`sceneRT`,
   the glow quad, TexturePass, composite) so the per-frame call count goes up by design.
   Don't treat the higher number as a bug; judge perf by the O-overlay GPU/frame ms (§8.6).

9. **`aspectRatio` on resize** — keep the `volumetricLightPass.uniforms.aspectRatio` update
   in `onWindowResize` (43846–43847); without it the god-ray radial glow goes elliptical
   after a window resize. (Census row added in 4c.)

---

## 12. Optimizations review (what's missed, what to adopt)

### 12.1 ⭐ Collapse `TexturePass` + `uberPass` + `compositePass` into ONE full-res pass — RECOMMENDED
As written, three full-res stages run: `TexturePass` (a pure copy of `sceneRT`),
`uberPass` (cheap transforms), `compositePass` (glow + grade). They fold into a **single**
`ShaderPass`:
- Uniforms: `tScene` (= `sceneRT.texture`, set each frame), `tGlow` (the active glow buffer),
  `glowEnabled`, plus all the zombie/underwater/grade uniforms.
- `main()`: sample `tScene` at the distorted UV (if underwater) → §10.3 zombie + underwater
  transforms → `+ glow` (when `glowEnabled`) → §2c color-grade → output. **Identical order
  and math**; the §2c/§10.3 bodies just live in one shader.
- `composer.passes = [thisPass]`; it's last → EffectComposer auto-`renderToScreen` → owns
  the linear→sRGB conversion exactly like today's `colorGradingPass`.
- **Mechanism:** name the scene uniform **`tScene`, not `tDiffuse`**, so `ShaderPass`'s
  auto-wire (`this.uniforms[this.textureID]`, default `tDiffuse`) finds nothing and won't
  clobber it; set `pass.uniforms.tScene.value = sceneRT.texture` each frame.
- **Win:** full-res post fill 3 passes → **1** (removes the `TexturePass` copy + one
  intermediate write/read). No `TexturePass` import needed. **Supersedes the 2c/4a/4b
  split** for perf — keep the split only if you value modular passes over throughput.
- **Risk:** one longer shader, but the `isUnderwater`/`enable*` branches are uniform-driven
  (coherent across the screen → negligible GPU divergence). `composer.renderTarget1/2`
  go unused — keep them (harmless) for the color path rather than hand-rolling sRGB output.
- All §10/§11 guarantees still hold (sceneRT HalfFloat, grade wraps scene+glow, etc.).

### 12.2 ⭐ Temporally throttle the god-ray glow — RECOMMENDED (profile-gated)
The glow is soft/low-frequency: recompute the glow buffer only every N frames and on
camera/sun movement, reuse otherwise — exactly the refraction temporal cache
(`REFRACTION_UPDATE_FRAMES` + move/rotate thresholds, 42987–43007). Halves raymarch cost
in the common near-static case, stacking with the `volumetricScale` downscale. Glow
tolerates staleness even better than refraction; force a recompute past a camera
move/rotate threshold so fast pans don't smear. Good candidate to gate behind a setting
or the Performance profile.

### 12.3 Adjacent, higher leverage, OUT of scope: refraction re-renders the whole scene
Water refraction (43003–43037) renders the **entire scene a second time** (geometry +
lighting) every ~2 frames into `refractionRT`. That extra scene pass likely outweighs all
post-processing fill combined. If raw FPS is the goal, throttling further or adding a
refraction-resolution slider (mirroring `volumetricScale`) is the biggest single lever —
flagged so it isn't overlooked, but it's a separate subsystem from this CCR.

### 12.4 Optional / advanced: scissor the glow render around the sun
The half-res god-ray quad shades every pixel (the shader early-exits at `dist > 1.2` but
still runs the fragment). A scissor/viewport rect around the sun's projected position
(+margin) skips far fragments entirely. Marginal over the early-out; only worth it if the
glow pass profiles hot after downscaling. Skip unless measured.

### 12.5 Considered and rejected (documented so they're not re-litigated)
- **Disabling renderer `antialias`** — rejected: the Layer-1 viewmodel (torch/arms) is real
  geometry drawn straight to the default framebuffer after the composite (43177), so MSAA
  still benefits it.
- **Downsampling the cheap color transforms** (zombie / grade / underwater color) —
  rejected (§0): per-pixel multiplies, downsampling blurs the scene for no real ALU saving,
  and they already scale with the Pixel Ratio slider.

---

## 13. Process only the necessary math — NO feature disabled or removed

**Guiding principle (per the project owner):** keep every lighting feature fully enabled
and visible; the *only* things we reduce are (1) the **internal resolution** of soft
effects, matched to the world's chosen low pixel ratio so we don't compute detail the
output can't show, and (2) **math whose result is provably zero** (computing it would
change nothing). Nothing is gated off by a quality heuristic. If an effect would put a
single visible photon on screen, its full math runs.

### Features that remain ALWAYS active (never disabled by this CCR)
Baked vertex lighting (AO + sky/block light, min-floor 3), sun/moon directional light,
torch point lights, shadow maps, day/night cycle, **god rays**, **moon god rays**,
**point-light (torch) volumetric fog**, **sky atmospheric fog/haze**, underwater
absorption/tint/caustics, color grade (sunrise/sunset), zombie vignette/desaturation.
All keep rendering exactly when they do today — see the parity gates in §8/§10/§11.

### 13.A Elide only provably-zero math (identical output, not a disabled feature)
Today all 5 passes run every frame and short-circuit *inside* the shader — so even a frame
whose glow is mathematically zero still pays for a full-res pass. The refactor does the
same zero-check **one step earlier** (CPU side, per frame, after `updateVolumetricLighting`
sets the visibility uniforms) so we don't dispatch a half-res raymarch that can only output
black. The god-ray shader *already* returns the scene unchanged when `sunVisible<=0 &&
moonVisible<=0 && pointLightCount==0` (27186–27189) — so eliding that exact case is
**byte-identical** output. The moment any of those is `>0`, the quad renders in full:
```js
const u = volumetricLightPass.uniforms;   // the god-ray material
const godRaysActive = SETTINGS.volumetricLightingEnabled && !isUnderwater &&
    (u.sunVisible.value > 0 || u.moonVisible.value > 0 || u.pointLightCount.value > 0);
const causticsActive = isUnderwater;       // Change 3 only; else caustics stay in the pass
let glowActive = false, activeGlowRT = null;
if (godRaysActive)      { /* render god-ray quad → volumetricGlowRT */ activeGlowRT = window.volumetricGlowRT; glowActive = true; }
else if (causticsActive){ /* render caustic quad → causticGlowRT   */ activeGlowRT = window.causticGlowRT;     glowActive = true; }
compositePass.uniforms.glowEnabled.value = glowActive ? 1 : 0;
if (glowActive) compositePass.uniforms.tGlow.value = activeGlowRT.texture;
```
- **No moon, no sun, no torches → the glow buffer would be all black, so the raymarch is
  elided (output is identical).** (`updateVolumetricLighting` zeroes `sunVisible`/
  `moonVisible`/`pointLightCount`, 42766, so the gate reads them directly.) Moon up → moon
  god rays render in full. Torches in a cave → point-light fog renders in full. Sun on
  screen → god rays render in full. No feature is withheld — only an all-zero result is skipped.
- Above water never touches `causticGlowRT`; underwater never touches `volumetricGlowRT`.
- The **single post pass** (§12.1) is the only always-on full-res pass; its zombie /
  underwater / grade blocks are uniform-gated branches that are coherent across the screen
  (≈free when off). That replaces today's 4 always-on effect passes. The scene→`sceneRT`
  render and this present-pass are the irreducible per-frame cost; everything else is on demand.
- Refraction stays as-is — already gated by `REFRACTION_UPDATE_FRAMES` + the move/rotate
  thresholds (42987–43007), and skipped entirely when `waterRefractionEnabled` is off.

### 13.B Resolution tracks the low pixel ratio (never over the top)
- **`sceneRT` and both glow buffers are sized from `renderer.getDrawingBufferSize()`**
  (the `resizePostProcessTargets` in 2a), which already equals `innerWidth/innerHeight ×
  devicePixelRatio × SETTINGS.pixelRatio`. So post-processing renders at the **same low
  resolution as the main frame** — not native, not CSS pixels. Do NOT size any post target
  from `innerWidth`/`clientWidth` directly (that would ignore the pixel ratio and render
  full-res — the exact "over the top" failure to avoid).
- **The glow scale compounds with the pixel ratio.** At `pixelRatio 0.5` + `volumetricScale
  0.5`, the god-ray buffer is `0.25×` the frame per axis (~6% of native area) — appropriately
  tiny. The slider floor is `0.25`, so it can go smaller still. This is intended.
- **Each glow buffer uses its own scale** (`volumetricGlowRT` ← `volumetricScale`,
  `causticGlowRT` ← `causticScale`), so the two never inflate each other.
- `sceneRT` must stay at full drawing-buffer res (the cheap transforms — distortion,
  vignettes — need per-pixel fidelity and it's what goes to screen); only the *glow* is
  downscaled. That's correct, not "over the top."

### 13.C Verify
- **Elision = identical output (the important one):** at solid midnight with no moon and no
  torches, A/B the frame with vs without the glow gate — they must be **pixel-identical**
  (the gate only skips an all-black glow). Then confirm via `renderer.info.render.calls` /
  `logDebug` that the glow quad wasn't dispatched that frame. Bring up the moon or place a
  torch → god rays / point-light fog reappear at full strength (feature intact).
- **Resolution check:** at `pixelRatio 0.5`, log the post-target sizes; `sceneRT` must equal
  the renderer drawing-buffer size (half native per axis on a 1× display), and each glow
  buffer must be that × its scale — never `innerWidth`-sized.

---

## 14. Safety checks to report back (CLAUDE.md format)

- **Summary / Changes / Rationale** grouped by subsystem: Settings > Graphics;
  Rendering > Composer chain; Rendering > Volumetric; Rendering > Underwater.
- Confirm: no duplicate/shadowed identifiers before declaring `uberPass`, `sceneRT`,
  `volumetricGlowRT`, `causticGlowRT`, `_postQuad*`, `godRayMaterial`, `causticMaterial`,
  `compositePass`, `resizePostProcessTargets`.
- Confirm: the new `TexturePass` import added (split design only — §12.1 single-pass needs
  none); all pass references (§7 4c) repointed; new DOM ids exist and match JS; new settings
  round-trip and all three UI-sync sites updated.
- Confirm: no per-frame work on dry land / effects-off (glow pass skipped, not just
  shader-short-circuited); composite inherits composer color (no double-sRGB) — proven
  by the scale-1.0 A/B.
- Strict equality, JSDoc on new functions, `logDebug('[Volumetric]'/'[Water]', …)` not `console.log`.
- State explicitly whether **Change 3** was implemented, skipped, or parity-mitigated, and why.


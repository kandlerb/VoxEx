# CCR-LOD-MIPS-002 — Finish atlas mipmapping: roughness-map per-tile mips + opaque-only colour averaging for cutout tiles

**Build:** `2026-06-25.33` (next after `2026-06-25.32`)
**Status:** Planned (implementation not yet applied)
**Depends on:** **CCR-LOD-MIPS-001** (this modifies the `buildAtlasMipChain()` helper that 001 added, and reuses it for a second texture). Apply only on top of 001.
**File touched:** `voxEx.html` only.
**Subsystem:** Rendering › Textures › Atlas / Mipmaps
**Risk:** Low. Init-time-only; no per-frame cost; no shader/worker/cache/save/DOM changes.

---

## 0. How to apply (read this first)

- **Locate each edit by its "Before" snippet (exact find/replace), not by absolute line number.** Line numbers are hints; they assume edits applied in the order below with no other drift.
- **Apply in this order: G → H → I, then J and K LAST.** J/K (build bump + changelog) sit near the top of the file (~lines 3936 / 3944); doing them last keeps the code-edit line numbers valid.
- **Anchor uniqueness (verified):**
  - Edits G and H are both **inside `buildAtlasMipChain()`** (added by CCR-001, ~line 9908). That function exists exactly once. The multi-line "Before" blocks below are unique within the file.
  - Edit I's anchor — `registerPixelTexture(roughnessMap);` + the `[Textures] Created per-texture roughness map:` `console.log` — occurs once.
  - `tileMeanR` / `tileMeanG` / `tileMeanB` and the loop var `no` are **new** names (0 existing occurrences) — no shadow/redeclare.
- **Do NOT touch any shader/GLSL.** No `<map_fragment>` / `<roughnessmap_fragment>` changes.
- **Leave the existing `dilateTileHiddenColor` dilation in place.** After Edit H it is redundant (colour now comes from opaque texels only), but it is harmless; removing it is out of scope.
- **Use the tile-mean fallback exactly as written in Edit H — do NOT implement a "random colour" variant.** (§2 explains the deliberate deviation from the original request: determinism + no trilinear speckle.)
- **You are MODIFYING the existing `buildAtlasMipChain()` (added by CCR-001), not creating it.** Edits G and H edit its body; do not add a second copy.
- A benign one-time `getImageData … willReadFrequently` console warning may appear (now from two call sites — albedo + roughness). Ignore it; not an error.

**Definition of done:**
1. Edits G–K applied; file parses; game boots (no console syntax error).
2. No duplicate/shadowed identifier introduced.
3. `tools/voxex-tests.html` (localhost) still all green.
4. Required in-browser checks in §6 pass.
5. `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` updated.

---

## 1. What this finishes

CCR-001 killed cross-tile colour bleed on the **albedo** atlas by building a per-tile mip chain. Two gaps remained (its §8):

1. **Roughness map still bleeds.** `roughnessMap` is the *same* 33-tile horizontal strip and still uses the GPU's strip-wide auto-mips, so gloss/roughness values bleed across tiles at distance (e.g. glass's shiny `base:20` smearing into matte neighbours, stone mica bleeding into dirt). Subtler than colour, but the same root cause. Fix: run it through the same `buildAtlasMipChain()`.

2. **Cutout-tile mip colour is diluted by hidden pixels.** CCR-001's `buildAtlasMipChain` averages **all** texels in each box, including the alpha-0 hole texels. Those hole texels carry the *dilated under-hole* colour, not the real leaf colour, so a leaf tile's mip colour is pulled slightly off. Per the chosen behaviour: keep averaging **alpha** over all texels (so distant canopies fill in **solid + stable** — no shimmer), but average **colour** from **opaque texels only**, so the mip colour is the true leaf/flame colour. For the rare box that is entirely transparent, fall back to the tile's mean leaf colour.

Both land entirely in texture-init. No shader change (the existing `textureGrad` albedo path and the `texture2D` roughness path both just sample whatever mip data we hand them).

---

## 2. Behaviour decisions (so the implementer makes none)

- **Alpha:** unchanged — averaged over **all** texels in the box. Distant leaves fill toward solid (stable, no shimmer). This is the user's chosen "fill it and make it solid".
- **Colour:** averaged over **opaque texels only** (`alpha > 0`). Fully-opaque tiles (grass, dirt, stone, …) are **unaffected** because every texel is opaque (`no === n` → identical to a plain average). Only cutout tiles (leaves, fire) change.
- **All-transparent box fallback:** use the **tile's mean opaque colour** (precomputed, deterministic). *Note:* the user requested "a random colour from the leaf's available colours"; mean is used instead for determinism (textures must be reproducible) and because trilinear can faintly surface these near-transparent texels — a stable mean avoids colour speckle. To honour the literal request instead, replace the fallback assignment with a seeded-random pick from the tile's opaque texels; not done here by default.
- **Scope:** the colour change is **universal** in `buildAtlasMipChain` (no per-tile config) because it self-applies via alpha — opaque tiles and the roughness map (all texels alpha 255) are provably unaffected.

---

## 3. Edits

> All "Before edits" line numbers are the **current** file (post CCR-001). "Post edits" includes shifts from earlier edits in this list (G→H→I; J/K applied last).

---

### Edit G — Precompute per-tile mean opaque colour (insert 19 lines, inside `buildAtlasMipChain`)

**Anchor:** between `const levels = [];` and `let L = 0;` near the top of `buildAtlasMipChain()`.
**Before edits:** insert at line **9913**  ·  **Post edits:** new block occupies **9913–9931**.

**Before:**
```javascript
                const levels = [];
                let L = 0;
```

**After:**
```javascript
                const levels = [];
                // CCR-LOD-MIPS-002: per-tile mean OPAQUE colour (RGB). Used as the colour for any
                // downsample box that contains only transparent texels, so a cutout tile's mip
                // colour is always a real leaf/flame colour — never the hidden under-hole colour.
                // Fully-opaque tiles get their plain mean (and never hit the fallback). One pass.
                const tileMeanR = new Float64Array(numTiles);
                const tileMeanG = new Float64Array(numTiles);
                const tileMeanB = new Float64Array(numTiles);
                for (let t = 0; t < numTiles; t++) {
                    const tStart = t * tileW0;
                    let mr = 0, mg = 0, mb = 0, cnt = 0;
                    for (let yy = 0; yy < h0; yy++) {
                        let si = (yy * w0 + tStart) * 4;
                        for (let xx = 0; xx < tileW0; xx++) {
                            if (src[si + 3] > 0) { mr += src[si]; mg += src[si + 1]; mb += src[si + 2]; cnt++; }
                            si += 4;
                        }
                    }
                    if (cnt > 0) { tileMeanR[t] = mr / cnt; tileMeanG[t] = mg / cnt; tileMeanB[t] = mb / cnt; }
                }
                let L = 0;
```

**Reasoning:** one cheap pass over level-0 gives each tile its true leaf/flame colour (from opaque texels). `tileW0` is integer (atlas width = `numTiles * tileW0`), so `tStart` indexes cleanly. Opaque tiles get their plain mean here too, but they never reach the fallback in Edit H, so it's only ever *used* for cutout tiles.

---

### Edit H — Opaque-only colour averaging + fallback (replace 10 lines with 17, inside `buildAtlasMipChain`)

**Anchor:** the per-box accumulation block inside the `L > 0` branch (the `let r = 0, …` through the `od[oi] = r / n; …` line). The loop var `tile` is already computed just above this block (CCR-001) and is reused for the fallback.
**Before edits:** lines **9933–9942**  ·  **Post edits:** lines **9952–9968** (shifted **+19** by Edit G; block grows 10→17, net **+7**).

**Before (post-Edit-G numbering 9952–9961):**
```javascript
                                let r = 0, g = 0, b = 0, a = 0, n = 0;
                                for (let sy = sy0; sy < sy1; sy++) {
                                    let si = (sy * w0 + bx0) * 4;
                                    for (let sx = bx0; sx < bx1; sx++) {
                                        r += src[si]; g += src[si + 1]; b += src[si + 2]; a += src[si + 3];
                                        si += 4; n++;
                                    }
                                }
                                const oi = (oy * lw + ox) * 4;
                                od[oi] = r / n; od[oi + 1] = g / n; od[oi + 2] = b / n; od[oi + 3] = a / n;
```

**After:**
```javascript
                                // CCR-LOD-MIPS-002: average COLOUR from opaque texels only (skip alpha==0)
                                // so a cutout tile's mip colour is the real leaf/flame colour, not the
                                // hidden under-hole colour. Alpha still averages ALL texels (fills toward
                                // solid at distance). Fully-opaque tiles are unaffected (no === n).
                                let r = 0, g = 0, b = 0, a = 0, n = 0, no = 0;
                                for (let sy = sy0; sy < sy1; sy++) {
                                    let si = (sy * w0 + bx0) * 4;
                                    for (let sx = bx0; sx < bx1; sx++) {
                                        const sa = src[si + 3];
                                        if (sa > 0) { r += src[si]; g += src[si + 1]; b += src[si + 2]; no++; }
                                        a += sa; n++; si += 4;
                                    }
                                }
                                const oi = (oy * lw + ox) * 4;
                                if (no > 0) { od[oi] = r / no; od[oi + 1] = g / no; od[oi + 2] = b / no; }
                                else { od[oi] = tileMeanR[tile]; od[oi + 1] = tileMeanG[tile]; od[oi + 2] = tileMeanB[tile]; }
                                od[oi + 3] = a / n;
```

**Reasoning:** `no` counts opaque texels; colour divides by `no` (true leaf colour). Alpha divides by `n` (all texels → fills solid, the chosen stable behaviour). `no === n` for opaque tiles and the roughness map → byte-identical to the old average there (zero risk to existing tiles). `else` branch uses the Edit-G mean for an all-transparent box (rare; near-transparent so usually discarded by `alphaTest`, but matters faintly under trilinear — hence a real leaf colour, not garbage).

---

### Edit I — Per-tile mips for the roughness map (insert 6 lines)

**Anchor:** in `initTextures()`, immediately after `registerPixelTexture(roughnessMap)` + its `console.log`.
**Before edits:** insert after line **31035**  ·  **Post edits:** insert after line **31061** (shifted **+26** = G +19, H +7); new lines **31062–31067**.

**Before (post-shift):**
```javascript
                const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
                registerPixelTexture(roughnessMap);
                console.log(`[Textures] Created per-texture roughness map: ${roughnessCanvas.width}x${roughnessCanvas.height}`);
```

**After:**
```javascript
                const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
                registerPixelTexture(roughnessMap);
                console.log(`[Textures] Created per-texture roughness map: ${roughnessCanvas.width}x${roughnessCanvas.height}`);
                // CCR-LOD-MIPS-002: same per-tile bleed-free mip chain for the roughness strip
                // (gloss bled across tiles at distance, exactly like the albedo did). Build-once;
                // the roughness map is never re-baked live, so no rebuild hook (cf. Edit D) is needed.
                roughnessMap.generateMipmaps = false;
                roughnessMap.mipmaps = buildAtlasMipChain(roughnessCanvas, NUM_TILES);
                roughnessMap.needsUpdate = true;
```

**Reasoning:** identical treatment to the albedo atlas. `minFilter` is already `NearestMipMapLinear` (set globally by `registerPixelTexture` per CCR-001 Edit A) → smooth gloss fade. `buildAtlasMipChain` on the roughness canvas: every texel is opaque (alpha 255), so Edit H's opaque-only path is a plain average and the fallback never triggers — roughness mips are pure per-tile box-downsamples. No live re-bake of the roughness map exists, so unlike glass it needs no rebuild hook.

---

### Edit J — bump `VOXEX_BUILD` — APPLY LAST

**Before:**
```javascript
            const VOXEX_BUILD = "2026-06-25.32";
```
**After:**
```javascript
            const VOXEX_BUILD = "2026-06-25.33";
```

### Edit K — prepend changelog entry (~line 3944) — APPLY LAST

Insert as the **first element** of `VOXEX_RECENT_CHANGES` (immediately after the opening `[`). Keep the trailing comma; match the existing entries' indentation.

**Before:**
```javascript
            const VOXEX_RECENT_CHANGES = [
```
**After:**
```javascript
            const VOXEX_RECENT_CHANGES = [
                "ATLAS MIPMAPPING FINISHED — ROUGHNESS MIPS + OPAQUE-ONLY COLOUR (CCR-LOD-MIPS-002, build 2026-06-25.33). Follow-up to CCR-LOD-MIPS-001. (1) Roughness map (same 33-tile strip) now gets the same per-tile mip chain via buildAtlasMipChain(roughnessCanvas, NUM_TILES) + generateMipmaps=false, so gloss/roughness no longer bleeds across tiles at distance (e.g. glass base:20 into matte neighbours). Build-once; no live re-bake so no rebuild hook. (2) buildAtlasMipChain now averages COLOUR from opaque texels only (skip alpha==0) so cutout-tile mips (leaves, fire) carry the real leaf/flame colour instead of the hidden under-hole colour; ALPHA still averages all texels so distant canopies fill in solid + stable (no shimmer). Fully-opaque tiles and the roughness map are byte-identical to before (no===n). All-transparent boxes fall back to the tile's precomputed mean opaque colour (deterministic; matters faintly under trilinear). The CCR-001 dilateTileHiddenColor pass is now redundant but left in place (harmless). Init-time only; shader/worker/cache/save/DOM unchanged. NEEDS IN-BROWSER TEST: distant leaves stay true-green & solid (not washed/olive), gloss on stone/glass/snow looks right at distance, no black chunks.",
```

---

## 4. Line-number accounting

| Edit | What | Anchor | Before-edit line(s) | Net Δ | Shift from earlier | Post-edit line(s) |
|------|------|--------|---------------------|-------|--------------------|-------------------|
| G | precompute tile means | inside `buildAtlasMipChain` (after `const levels = []`) | insert at 9913 | +19 | 0 | **9913–9931** |
| H | opaque-only colour + fallback | accumulation block in `buildAtlasMipChain` | 9933–9942 | +7 | +19 | **9952–9968** |
| I | roughness map mips | after `registerPixelTexture(roughnessMap)` | insert after 31035 | +6 | +26 | new **31062–31067** |
| J | build bump | `VOXEX_BUILD` | 3936 | 0 | (apply last) | 3936 |
| K | changelog | `VOXEX_RECENT_CHANGES` | 3944 | +1 | (apply last) | 3945 |

Net code growth: **+32 lines** (G 19 + H 7 + I 6). Plus 1 changelog line.

---

## 5. Why no shader / no other change

- **Albedo path** (`#include <map_fragment>`, `textureGrad`) — already samples whatever mip levels we provide; cleaner colour just means cleaner samples.
- **Roughness path** (`#include <roughnessmap_fragment>`, `texture2D`, half-texel inset — from the torch CCR) — selects a mip via hardware derivatives and now reads clean per-tile roughness mips. The half-texel inset already keeps samples within the tile.
- `minFilter = NearestMipMapLinear` is already set for both maps (CCR-001 Edit A, shared `registerPixelTexture`).
- No new params on `buildAtlasMipChain` → its three existing call sites (albedo Edit C, glass-rebake Edit D, new roughness Edit I) are all source-compatible.

---

## 6. Verification plan

### Required
1. File parses; game boots; no console syntax error.
2. `tools/voxex-tests.html` (localhost) — existing ~204 tests stay **green** (no logic path they cover changed; opaque tiles + roughness are byte-identical).
3. In-browser:
   - Fly to the render edge: distant **leaves** read **true green and solid** (not washed-out/olive, not brown) — confirms opaque-only colour + solid alpha.
   - **Gloss/roughness at distance** on stone, snow, sand, glass looks consistent with up-close (no smeared/averaged sheen bleeding between block types) — confirms roughness mips.
   - **No black/blank chunks** at distance (mip completeness).
   - Toggle **Glass Opacity** — still correct near/far (the albedo rebuild hook from CCR-001 Edit D still runs and now also uses opaque-only colour, which is a no-op for glass).
   - Change **Texture Resolution** (re-runs `initTextures`) — no errors.
   - FPS / `window.memoryBudgetManager.getStatus()` unchanged.

### Optional (skip if harness API isn't obvious — inspect first)
- Assert `chunkMaterial.roughnessMap.generateMipmaps === false` and `.mipmaps.length === 12`.
- Sample the LEAF tile colour at a mid mip level vs an opaque tile and assert the leaf RGB matches the tile's opaque mean within tolerance (no dilution).

---

## 7. Revert plan

Additive and isolated:
1. Edit I: delete the 6 roughness-mip lines (roughness falls back to auto-mips).
2. Edit H: restore the 10-line plain-average block.
3. Edit G: delete the `tileMean*` precompute.
4. Edits J/K: restore build string / remove changelog entry.

(`buildAtlasMipChain` itself and the albedo wiring stay — they belong to CCR-001.)

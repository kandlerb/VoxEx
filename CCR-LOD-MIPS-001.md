# CCR-LOD-MIPS-001 — Per-tile mip chain for the chunk atlas (kill distant brown leaves/grass + hard LOD band)

**Build:** `2026-06-25.32` (next after `2026-06-24.31`)
**Status:** Planned (implementation not yet applied)
**File touched:** `voxEx.html` only (single-file rule respected — no new files/assets)
**Subsystem:** Rendering › Textures › Atlas / Mipmaps
**Risk:** Low–medium. Init-time-only work; no per-frame cost; no worker/cache/save/DOM changes; shader untouched.

---

## 0. How to apply (read this first)

This CCR is turnkey — apply the edits exactly as written. Notes for the implementing agent:

- **Locate each edit by its "Before" snippet (exact find/replace), not by absolute line number.** Line numbers are cross-reference hints only; they assume the edits are applied in the order below with no other file drift.
- **Apply in this order: A → B → C → D, then E and F LAST.** Edits E/F (build bump + changelog) sit near the top of the file (~lines 3936 / 3944); applying them first would push every other edit's line number down. Doing them last keeps all code line numbers valid.
- **Anchor uniqueness (verified against the current file):**
  - **Edit A** line `tex.minFilter = THREE.NearestMipMapNearestFilter;` occurs **exactly once** → safe single-line replace.
  - **Edit C** — its first two lines (`const tex = new THREE.CanvasTexture(cvs);` + `registerPixelTexture(tex);`) occur **11 times** across texture-gen functions → **NOT unique.** You MUST match the **full 4-line block** including the `// CCR 2a.1: capture atlas refs...` comment and the `_glassAtlas = { ctx, tex, imageData: atlasImageData };` line (that line occurs once). Matching only the first lines will edit the wrong function.
  - `buildAtlasMipChain` does **not** exist yet (0 occurrences) → safe to declare (no duplicate-identifier violation).
  - **Edit D**'s `_glassAtlas.ctx.putImageData(...)` line occurs once.
- **Do NOT implement §8 (optional follow-ups). Do NOT touch any shader/GLSL** (the `#include <map_fragment>` block stays as-is — §6 explains why).
- A benign one-time console warning (`getImageData ... willReadFrequently`) may appear from `buildAtlasMipChain` at load — ignore it; it is not an error.

**Definition of done:**
1. Edits A–F applied; file parses and the game boots (no syntax error in console).
2. No duplicate/shadowed identifier introduced (`buildAtlasMipChain` is new).
3. `tools/voxex-tests.html` (served on localhost) still all green.
4. The **Required** in-browser checks in §9 pass.
5. `VOXEX_BUILD` and `VOXEX_RECENT_CHANGES` updated (Edits E/F).

---

## 1. Symptom (as reported)

Flying out toward the render-distance edge, blocks degrade "fast and hard" rather than gracefully:

- **Leaves** viewed at grazing angles (looking at the *top/bottom* faces edge-on) go almost **brown**.
- **Grass** trends **brownish** at distance.
- The transition is a **hard line**, not a gradient.

The user correctly intuited this is "an average color of the pixels on the block, but not done well." That is exactly what a mipmap is — the problem is *how* the averages are currently produced.

---

## 2. Root cause

### 2.1 What a mipmap is (grounding)
The GPU keeps a ladder of pre-shrunk copies of a texture (full → ½ → ¼ → … → 1×1) and samples a smaller copy as a surface gets farther away or is viewed edge-on. This prevents shimmer and is what keeps distant terrain cheap to draw. The chunk atlas has these turned on:

`registerPixelTexture()` (`voxEx.html` ~line 9871) sets `generateMipmaps = true`, `minFilter = NearestMipMapNearestFilter`, `magFilter = NearestFilter`, plus anisotropy.

### 2.2 Why the colors go brown
The block atlas is a **single horizontal strip** — 33 tiles laid side-by-side with **no gutters** between them:

- `initTextures()` builds it at `cvs.width = NUM_TILES * TILE_SIZE`, `cvs.height = TILE_SIZE` (~line 29978).
- `NUM_TILES = 33` (~line 4268); `TILE_SIZE = PIXELS_PER_TILE * 4` (~line 29977), i.e. 64 px per tile at the default texture resolution → a 2112×64 atlas.

When the GPU auto-generates mips, it box-filters the **whole strip at once**, ignoring tile boundaries. So each successively smaller level averages neighboring tiles into one another. Tile order (`TILE` map, ~line 4242) makes this visible exactly where the user sees it:

```
0 GRASS_TOP | 1 GRASS_SIDE | 2 DIRT | 3 STONE | 4 PLANK | 5 LOG_SIDE(bark) | 6 LEAF | 7 BEDROCK | ...
```

- **LEAF (6)** sits directly between **LOG_SIDE (5, brown bark)** and **BEDROCK (7, dark)** → shrunk leaf = green averaged with brown + dark = **muddy brown**.
- **GRASS_TOP (0)** bleeds into **GRASS_SIDE (1)**, which is half brown dirt → distant grass = brownish.

### 2.3 Why it's worst at grazing angles
Looking at a leaf face edge-on makes blocks-per-pixel huge along one screen axis, which selects a **very high (heavily-averaged) mip level** — the most polluted one. This is driven by `bppY = length(dFdy(vWorldPositionCyl))` in the shader's `textureGrad` call (~line 31792).

### 2.4 Why it's a hard line, not a gradient
`minFilter = NearestMipMapNearestFilter` snaps to a **single** nearest mip level with **no blending** between levels, so you see a sharp band where it jumps from level N to N+1.

### 2.5 Why the existing mitigations don't cover this
The code already fights two *related* failures, but neither addresses cross-tile bleed:

- `dilateTileHiddenColor()` (~line 30833) floods opaque leaf RGB into the transparent hole texels so holes don't mip down to black — fixes *within-tile* transparency only.
- The shader's `textureGrad` with world-position-derived gradients (~line 31791) fixes the `fract()` seam-derivative spike (old "lines between blocks") — it selects the *correct* level, but the level's texels are already polluted.
- The half-texel inset clamp `0.0078125 = 0.5/64` (~line 31771) is calibrated for **mip level 0 only**; at level L the tile is `64/2^L` texels wide, so the inset is far less than half a texel there, and the pollution is baked into the mip texel regardless.

**Conclusion:** the mip *pyramid itself* is built across the full strip. The fix is to build it **ourselves, per tile**.

---

## 3. The fix (design + rationale)

Two parts, both small and contained to the texture-init path. **The shader does not change.**

### 3.1 Smooth the LOD band — trilinear-between-levels (Edit A)
Switch `minFilter` from `NearestMipMapNearestFilter` → `NearestMipMapLinearFilter`.

- **Nearest** *within* a level → texels stay crisp/pixel-art up close.
- **Linear** *between* the two nearest levels → the GPU blends them, removing the hard band. This is the "gradient instead of a clear line" the user asked for, and the GPU does the distance selection + blending for free.

This is applied in the shared `registerPixelTexture()`, so every pixel-art texture benefits (all are single images except the atlas/roughness strips; trilinear-between-mips is a strict improvement everywhere and changes nothing up close).

### 3.2 Kill the brown — hand-built per-tile mip chain (Edits B + C)
Build the mip chain ourselves with a new helper `buildAtlasMipChain(srcCanvas, numTiles)` and assign it to the atlas texture with `generateMipmaps = false`.

**Key algorithm property — clamp every averaging box to the source tile it belongs to.** For each output texel at level L, the source box in level-0 coordinates is `[ox*2^L, (ox+1)*2^L)`; we compute which tile that texel maps to (`tile = floor(sx0 / tileW0)`) and **clamp the averaging box to that single tile's column** `[tile*tileW0, (tile+1)*tileW0)`. Therefore a tile can only ever average **with itself** — zero cross-tile bleed at *every* level, including the deepest. (At extreme levels where a tile is sub-pixel, each output texel resolves to one tile's mean — still no blend; the surface is sub-pixel on screen there anyway.)

**Each level is derived from the pristine level-0**, not from the previous level, so downsampling error never accumulates.

**Why per-tile mips and not padding/gutters:** adding gutters only delays bleed to deeper levels *and* forces a UV remap (tiles would no longer sit at clean `1/33` steps), touching the mesher/shader. Per-tile mips keep UVs and the shader exactly as they are.

**Why not a `sampler2DArray` (texture array):** cleanest long-term, but it changes the shader's sampling and the mesher's UV writes — much larger, riskier change. Deferred (see §8).

**Alpha note (intentionally minimal):** the box filter averages alpha too. With `chunkMaterial.alphaTest = 0.1` (~line 30968), averaged leaf alpha stays above threshold, so distant canopies get *fuller* (lose hole detail), not brown or sparse — acceptable and normal. Coverage-preserving alpha is listed as optional polish in §8, not part of this change.

### 3.3 Keep live glass re-bake correct (Edit D)
`setGlassBodyAlpha()` (~line 13829) edits the atlas canvas at runtime (Glass Opacity slider) and flips `tex.needsUpdate`. With manual mips + `generateMipmaps = false`, the GPU re-uploads the *stored* mip array, which would be stale for the GLASS tile. So after the canvas edit we rebuild the chain. (Cheap; glass edits are rare and user-driven.)

---

## 4. Edits — before/after line numbers, snippets, reasoning

Line numbers are given as **Before edits** (current file) and **Post edits** (after all *earlier* edits in this list have shifted the file). See the accounting table in §5. Snippets are exact against the current `voxEx.html`; if you reflow whitespace when applying, re-derive the downstream offsets from §5.

---

### Edit A — Trilinear filtering (1-line, net 0 lines)

**Anchor:** `registerPixelTexture()`
**Before edits:** line **9873**  ·  **Post edits:** line **9873** (no earlier edit shifts this)

**Before:**
```javascript
                tex.minFilter = THREE.NearestMipMapNearestFilter;
```

**After:**
```javascript
                tex.minFilter = THREE.NearestMipMapLinearFilter; // CCR-LOD-MIPS-001: linear BETWEEN mip levels = smooth LOD fade (no hard band); nearest WITHIN a level keeps texels crisp up close
```

**Reasoning:** removes the discrete mip snap (the "hard line"). Shared helper, so it benefits all pixel-art textures; the atlas additionally gets the custom chain below. `magFilter` stays `NearestFilter` (crisp up close); anisotropy untouched.

**Uniqueness:** this exact line occurs **once** in the file → safe single-line find/replace.

---

### Edit B — New helper `buildAtlasMipChain()` (insert 62 lines)

**Anchor:** immediately after `refreshPixelTextureAnisotropy()` closes (current line **9889**); next existing line is the `AO_LOOKUP` comment at 9890.
**Before edits:** insert at line **9890**  ·  **Post edits:** new block occupies **9890–9951** (no earlier edit shifts this).

> The snippet below is **62 lines**. If you add a blank separator line before/after it, add that to every downstream offset in §5.

**Where exactly:** insert the block immediately **after** the closing `}` of `refreshPixelTextureAnisotropy()` and immediately **before** this unique existing comment line (use it as the find anchor and insert the block just above it):
```javascript
            // --- OPTIMIZATION: Pre-computed AO power curve lookup table ---
```

**Insert:**
```javascript
            // ===== CCR-LOD-MIPS-001: per-tile mip chain for the chunk atlas =====
            // The block atlas is a single horizontal STRIP (numTiles tiles side-by-side,
            // no gutters). GPU auto-mipmapping box-filters the whole strip, so each tile
            // bleeds into its neighbours at distance (leaf[6] sits between bark[5] and
            // bedrock[7] -> distant leaves go brown; grass blends with the dirt half of
            // grass-side). Fix: build the mip chain OURSELVES, clamping every averaging
            // box to the source tile it belongs to, so a tile can only ever average with
            // itself. Each level is derived from the PRISTINE level-0 (not the previous
            // level) so error never accumulates. Returns <canvas> levels for tex.mipmaps
            // (caller must set generateMipmaps = false). Resolution-agnostic: tile width
            // is derived from the canvas, so it tracks the Texture Resolution setting.
            /**
             * Build a per-tile (bleed-free) mipmap chain for a horizontal strip atlas.
             * @param {HTMLCanvasElement} srcCanvas - Full-res atlas canvas (level 0).
             * @param {number} numTiles - Number of equal-width tiles in the strip.
             * @returns {HTMLCanvasElement[]} Mip levels 0..N (down to 1x1), each a canvas.
             */
            function buildAtlasMipChain(srcCanvas, numTiles) {
                const w0 = srcCanvas.width, h0 = srcCanvas.height;
                const tileW0 = w0 / numTiles;            // level-0 tile width (px)
                const src = srcCanvas.getContext("2d").getImageData(0, 0, w0, h0).data;
                const levels = [];
                let L = 0;
                for (;;) {
                    const lw = Math.max(1, w0 >> L), lh = Math.max(1, h0 >> L);
                    const c = document.createElement("canvas");
                    c.width = lw; c.height = lh;
                    const lctx = c.getContext("2d");
                    if (L === 0) {
                        lctx.drawImage(srcCanvas, 0, 0); // level 0 = exact copy
                    } else {
                        const out = lctx.createImageData(lw, lh);
                        const od = out.data;
                        const scale = 1 << L;            // source px per output px
                        for (let oy = 0; oy < lh; oy++) {
                            const sy0 = oy * scale, sy1 = Math.min(h0, sy0 + scale);
                            for (let ox = 0; ox < lw; ox++) {
                                const sx0 = ox * scale;
                                const tile = (sx0 / tileW0) | 0;            // tile this texel maps to
                                const tx0 = tile * tileW0, tx1 = tx0 + tileW0;
                                const bx0 = Math.max(sx0, tx0);             // clamp box to ONE tile
                                const bx1 = Math.min(sx0 + scale, tx1, w0);
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
                            }
                        }
                        lctx.putImageData(out, 0, 0);
                    }
                    levels.push(c);
                    if (lw === 1 && lh === 1) break;     // full chain to 1x1 (WebGL requires completeness)
                    L++;
                }
                return levels;
            }
```

**Reasoning:**
- **Per-tile clamp** (`bx0/bx1` pinned to `[tx0, tx1)`) is the whole fix — neighbors can never enter the average.
- **From pristine level-0** every level — no progressive contamination.
- **Full chain to 1×1** — an incomplete mip chain renders the texture **black** in WebGL; the `if (lw === 1 && lh === 1) break;` guarantees completeness.
- **Resolution-agnostic** — `tileW0 = w0 / numTiles`, so it adapts when the Texture Resolution setting changes `TILE_SIZE` and `initTextures` re-runs.
- Returns **canvases**; three.js (r160) uploads each as a mip level via `texImage2D` when `mipmaps.length > 0 && generateMipmaps === false`. **This is the only approach to implement.** (If — and only if — verification shows black/blank distant terrain, see the canvas-vs-ImageData fallback row in §7. Do not pre-emptively use it.)

---

### Edit D — Rebuild mips on live glass re-bake (insert 2 lines)

**Anchor:** inside `setGlassBodyAlpha()`, between the `putImageData` and `needsUpdate` lines.
**Before edits:** original lines **13834–13835**  ·  **Post edits:** lines **13896–13897** (shifted **+62** by Edit B).

**Before (post-Edit-B numbering 13896–13897):**
```javascript
                _glassAtlas.ctx.putImageData(_glassAtlas.imageData, 0, 0);
                _glassAtlas.tex.needsUpdate = true; // re-uploads the atlas (small; debounce if it ever hitches on drag)
```

**After (inserts 2 lines; `needsUpdate` moves to 13899):**
```javascript
                _glassAtlas.ctx.putImageData(_glassAtlas.imageData, 0, 0);
                // CCR-LOD-MIPS-001: the live atlas edit invalidates the hand-built mip chain — rebuild it so distant glass tracks the slider
                if (_glassAtlas.tex.mipmaps && _glassAtlas.tex.mipmaps.length) _glassAtlas.tex.mipmaps = buildAtlasMipChain(_glassAtlas.ctx.canvas, NUM_TILES);
                _glassAtlas.tex.needsUpdate = true; // re-uploads the atlas (small; debounce if it ever hitches on drag)
```

**Reasoning:** keeps the Glass Opacity slider correct at distance. `NUM_TILES` and `buildAtlasMipChain` are both in module scope here. The `if (... .mipmaps ...)` guard makes this a no-op if Edit C is ever reverted (defensive).

---

### Edit C — Wire the chain onto the atlas texture (insert 8 lines)

**Anchor:** in `initTextures()`, immediately after `registerPixelTexture(tex)`.
**Before edits:** original lines **30897–30900**  ·  **Post edits:** original 30897–30900 are now **30961–30964** (shifted **+64** = Edit B +62, Edit D +2).

> ⚠️ **Match the FULL 4-line block below.** `const tex = new THREE.CanvasTexture(cvs);` + `registerPixelTexture(tex);` appear **11 times** in the file (zombie/other texture functions). Only the `// CCR 2a.1: capture atlas refs...` comment + `_glassAtlas = { ctx, tex, imageData: atlasImageData };` line make this location unique — they MUST be part of your find string.

**Before (post-shift numbering 30961–30964):**
```javascript
                const tex = new THREE.CanvasTexture(cvs);
                registerPixelTexture(tex);
                // CCR 2a.1: capture atlas refs so setGlassBodyAlpha() can re-bake the glass body opacity live.
                _glassAtlas = { ctx, tex, imageData: atlasImageData };
```

**After (inserts 8 lines after `registerPixelTexture(tex)`):**
```javascript
                const tex = new THREE.CanvasTexture(cvs);
                registerPixelTexture(tex);
                // CCR-LOD-MIPS-001: replace the GPU's strip-wide auto-mips (which bleed
                // neighbouring tiles together -> brown leaves/grass at distance) with a
                // hand-built per-tile chain. minFilter stays a *MipMapLinear* (set in
                // registerPixelTexture) so the distance fade is smooth; magFilter stays
                // Nearest (crisp texels up close); anisotropy from registerPixelTexture
                // is preserved. Must set generateMipmaps=false so the manual chain sticks.
                tex.generateMipmaps = false;
                tex.mipmaps = buildAtlasMipChain(cvs, NUM_TILES);
                tex.needsUpdate = true;
                // CCR 2a.1: capture atlas refs so setGlassBodyAlpha() can re-bake the glass body opacity live.
                _glassAtlas = { ctx, tex, imageData: atlasImageData };
```

**Reasoning:** ordering matters — call `registerPixelTexture(tex)` first (keeps anisotropy registration + `magFilter` Nearest + Edit A's trilinear `minFilter`), **then** override `generateMipmaps=false` and install the manual chain. Placed before `_glassAtlas = {...}` so the capture is unaffected; the glass re-bake (Edit D) reuses `_glassAtlas.ctx.canvas`.

---

## 5. Line-number accounting

Edits are listed in file order; each "Post edits" position already includes the shift from all edits **above** it.

| Edit | What | Anchor | Before-edit line(s) | Net Δ lines | Shift from earlier edits | Post-edit line(s) |
|------|------|--------|---------------------|-------------|--------------------------|-------------------|
| A | `minFilter` → trilinear | `registerPixelTexture` | 9873 | 0 | 0 | 9873 |
| B | new `buildAtlasMipChain()` | after `refreshPixelTextureAnisotropy` (9889) | insert at 9890 | +62 | 0 | new **9890–9951** |
| D | rebuild mips in `setGlassBodyAlpha` | after `putImageData` | 13834→13835 | +2 | +62 | insert at **13897**; `needsUpdate` → **13899** |
| C | install chain on atlas `tex` | after `registerPixelTexture(tex)` | 30898 | +8 | +64 | insert at **30963–30970** |

**Downstream anchors (for reference; not modified):**
- `setGlassBodyAlpha()` start: 13829 → **13891** (+62).
- `chunkMaterial` `alphaTest: 0.1`: 30968 → **31040** (+62 B, +2 D, +8 C).
- Shader `#include <map_fragment>` replacement: 31757 → **~31829** (+72 after all edits) — **left unchanged**.

> Net file growth: **+72 lines** (B 62 + D 2 + C 8). The shader/UV path, mesher, workers, cache, save format, and DOM are all untouched.

---

## 6. Why no shader change is needed (important, low-risk property)

The albedo path at `#include <map_fragment>` (current ~line 31757; ~31829 post-edits) already:
- computes `tiledUv` (per-block tiling via `fract`) for the *coordinate*, and
- supplies **manual gradients** to `textureGrad(map, tiledUv, ddx, ddy)` for *level selection*.

With the clean per-tile chain in place:
- `textureGrad` still selects the right level from those gradients;
- `NearestMipMapLinearFilter` blends the two nearest levels (smooth);
- the selected level's texels are now **clean** (no neighbor bleed);
- the half-texel inset (`0.0078125`) becomes belt-and-suspenders (per-tile levels already have clean edges).

So the visual fix lands entirely through the texture object — no GLSL edit, no recompile-path risk.

---

## 7. Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Incomplete mip chain → texture renders **black** at distance | Low | Loop builds **down to 1×1**; verify no black chunks when flying out. |
| three.js build rejects canvas mip levels | Low | r160 uploads canvas levels via `texImage2D`. Fallback: push `ImageData` (`{data,width,height}`) instead of canvases. |
| NPOT atlas (2112×64) + mipmaps | Very low | Engine already runs `generateMipmaps=true` on this NPOT atlas → WebGL2 NPOT mips confirmed working here; manual chain on identical dims is equally valid. |
| Glass Opacity slider shows stale distant glass | Low | Edit D rebuilds the chain on re-bake. |
| Distant canopies look *too* solid (holes gone) | Cosmetic | Expected with `alphaTest 0.1`; not brown. Add coverage-preserving alpha (§8) only if it bothers you. |
| Init slower | Negligible | One-time canvas downsample of a 2112×64 image; sub-ms–few ms, dwarfed by worldgen. |

---

## 8. Optional follow-ups (NOT in this change)

**The implementing agent must NOT do any of these.** Listed only for future reference.

1. **Roughness map** (`roughnessMap`, ~line 30959) is the *same* strip layout and bleeds too — but gloss bleed is subtle. If desired, run it through `buildAtlasMipChain` with the identical 3-line wiring after `registerPixelTexture(roughnessMap)`.
2. **Coverage-preserving alpha** for cutout tiles (leaves) — per level, scale alpha so the fraction passing `alphaTest` matches level-0 coverage (Unity's `mipMapsPreserveCoverage` technique). Add only if distant canopies read too solid.
3. **`sampler2DArray`** — the textbook end state (one layer per tile, hardware mips never bleed). Larger change (shader sampling + mesher UVs); revisit if the atlas grows much beyond 33 tiles.

---

## 9. Verification plan

### Required
1. File parses; the game boots with no console syntax error.
2. `tools/voxex-tests.html` (served over localhost) — the existing ~204 tests stay **green**. This change touches no logic path they cover, so any red is a regression to fix.
3. In-browser checks:
   - Fly to the render-distance edge; leaf **tops/bottoms at a grazing angle** stay **green**, not brown.
   - Distant grass stays **green**, not brown.
   - The LOD transition **fades smoothly** (no hard band).
   - **No black/blank chunks** at distance (a black distant surface = incomplete mip chain → see §7).
   - Toggle **Glass Opacity** (Graphics › Materials) — glass updates correctly near *and* far.
   - Change **Texture Resolution** (re-runs `initTextures`) — no errors.
   - FPS and `window.memoryBudgetManager.getStatus()` unchanged.

### Optional (do NOT block on this)
Only if the `voxex-tests.html` / `voxex-texture-tests.html` harness API is obvious from reading the file — **inspect it first, do not guess** — add:
- a test asserting `chunkMaterial.map.generateMipmaps === false` and `chunkMaterial.map.mipmaps.length === 12`;
- a LEAF-tile purity check (sample the leaf tile at a mid-deep mip level, assert `g > r && g > b`).

If the harness API isn't immediately clear, **skip these** — the Required checks above are sufficient sign-off.

---

## 10. Revert plan

Fully additive and isolated:
1. Edit A: restore `NearestMipMapNearestFilter`.
2. Edit C: delete the 8 inserted lines (the texture falls back to auto-mips).
3. Edit D: delete the 2 inserted lines (the `if` guard makes it a no-op even if left in).
4. Edit B: delete `buildAtlasMipChain` (unused once C/D are gone).

---

## 11. Edit E (build bump) + Edit F (changelog) — APPLY LAST

> These two edits are near the **top** of the file (~lines 3936 / 3944). Apply them **after** Edits A–D so they don't shift the code-edit line numbers. Both anchors are unique.

### Edit E — bump `VOXEX_BUILD` (~line 3936)

**Before:**
```javascript
            const VOXEX_BUILD = "2026-06-24.31";
```
**After:**
```javascript
            const VOXEX_BUILD = "2026-06-25.32";
```

### Edit F — prepend the changelog entry (~line 3944)

Insert the new string as the **first element** of the `VOXEX_RECENT_CHANGES` array (immediately after the opening `[`).

**Before:**
```javascript
            const VOXEX_RECENT_CHANGES = [
```
**After:**
```javascript
            const VOXEX_RECENT_CHANGES = [
                "PER-TILE ATLAS MIPMAPS + TRILINEAR (CCR-LOD-MIPS-001, build 2026-06-25.32). Distant leaves went brown and grass browned at grazing angles/distance, with a hard LOD band. Root cause: the block atlas is a 33-tile horizontal STRIP with no gutters, and GPU auto-mipmapping box-filtered the whole strip — so each tile bled into its neighbours at coarse mips (LEAF[6] between LOG_SIDE[5] bark and BEDROCK[7] dark → brown; GRASS_TOP[0] into the dirt half of GRASS_SIDE[1]). Existing dilation (within-tile holes) and the textureGrad+half-texel-inset shader path (seam derivatives) didn't touch cross-tile bleed. Fix (texture-init only; shader UNCHANGED): (A) registerPixelTexture minFilter NearestMipMapNearest→NearestMipMapLinear (smooth fade between levels, crisp Nearest within a level). (B) new buildAtlasMipChain() builds the chain by hand, clamping every averaging box to the ONE source tile it maps to (a tile only ever averages with itself; every level derived from pristine level-0; full chain to 1×1) → zero cross-tile bleed at all levels. (C) atlas tex: generateMipmaps=false + tex.mipmaps=buildAtlasMipChain(cvs, NUM_TILES). (D) setGlassBodyAlpha rebuilds the chain after live atlas edits so distant glass tracks the Opacity slider. Init-time only; no per-frame cost; no worker/cache/save/DOM changes. NEEDS IN-BROWSER TEST: fly to render edge, check leaf tops/bottoms + grass stay green with a smooth fade, no black chunks, glass slider still works.",
```

(Keep the trailing comma — the next element is the existing build `2026-06-24.31` entry. Match the existing entries' indentation.)

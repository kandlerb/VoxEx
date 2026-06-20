# CCR — Per-Pixel Texture Material Response (shininess / matteness)

**ID:** VOXEX-CCR-MATRESP-001
**Status:** Phase 1 SHIPPED (build 2026-06-19.04); Phase 2 (clear glass) planned below, not yet built
**Date:** 2026-06-19
**Area:** Rendering › Materials › Texture Atlas
**Single-file impact:** `voxEx.html` only (no worker parity needed — textures/materials are main-thread)
**Author:** design pass for Kandler

---

## 0. Decisions (2026-06-19)

Resolved with Kandler; these supersede the original open questions (now Section 10):

1. **Ship Phase 1 only first.** Implement per-pixel roughness (stone flecks, dirt/gravel pebbles, snow sparkle, glass roughness), playtest, then narrow tuning before deciding on later phases.
2. **Sky reflection (Phase 3) is wanted — but proven before it's a default.** Build it behind a **non-default** toggle, test in-game, and only then decide whether it earns a slot in the Quality profile.
3. **Subtle by default, but tunable.** Default the glint to subtle, and expose a **live "shininess strength" slider** in Phase 1 so Kandler can dial it in-game and report back the value that should become the default. (This pulls one control forward from Phase 4 — see Phase 1 below.)
4. **Repurpose-or-retire the dead specular settings, decided here:**
   - `specularIntensity` → **repurposed** as the live shininess-strength control (Phase 1).
   - `specularFresnel` → **repurposed** as glass/edge Fresnel strength (Phase 2c, when glass lands).
   - `specularShininess` → **retired** (Phong-era leftover; roughness replaces it). Remove from UI + `DEFAULTS`/`SETTINGS` or hide it.
   - `specularRoughness` → **demoted**: no longer drives terrain (the map does); keep only if still useful for water, else fold into the strength control.
   - `specularEnabled` → kept as the master on/off.

### 0.1 Audit log (2026-06-19)

Self-review of this CCR against the live code. Corrections applied:

1. **Logical bug — glass stayed shiny with specular OFF.** The draft `updateLightingMaterials` left `roughness = 1.0` in the off branch while the map carries low-roughness texels, so glass never went matte. **Fixed:** the off-switch now routes through `uShininessStrength = 0` (§5.5-D).
2. **Simplification — dropped the `luminance` match mode.** It produced an all-over gradient (contradicting "matte matrix, only flecks shine") and was a second code path. **Fixed:** stone now uses exact color-keying like every other tile; one match rule total (§3.1, §3.3).
3. **Bug risk — color-key tolerance.** Snow base `#FAFAFA` is only 15 from sparkle `#FFFFFF`; a loose tolerance flags the whole surface. **Fixed:** tolerance pinned to **8** (exact texels make this safe) (§4 footnotes, §5.5-B).
4. **Correctness — `specularRoughness` cannot be fully retired.** It still drives the **water** material (line 31234). **Fixed:** demoted (terrain stops using it) but kept for water (§5.5-E).
5. **Scope — metalness does nothing in Phase 1.** No env map ⇒ metalness only darkens. **Fixed:** Phase 1 is roughness-only; Section 4 metal values flagged Phase-3-gated (§3.2).
6. **Clarity — `sunGlintColor` is not directly reusable** by the chunk shader (separate water material). **Fixed:** Phase 2c would add its own `uGlintColor` uniform (§5.4).
7. **Recompile hitch removed.** Old code set `chunkMaterial.needsUpdate = true` on every specular change; the new uniform path needs no recompile (§5.5-D).

**Verified accurate (no change needed):** `roughnessMap` is already wired into `chunkMaterial` (30343); `roughnessFactor` is the correct stock shader variable; no existing `#include <roughnessmap_fragment>` replace to collide with; `chunkMaterial.roughness/metalness` are written **only** in `updateLightingMaterials` (31221–31225); `applyCylindricalFog` is chunk-only (31175); all draw-code hex colors in Section 4 match the source.

**Pre-existing bug noticed (not part of this CCR):** in the stone draw (~29817) `if (rand > 0.6) … else if (rand > 0.9)` makes the `#757575` branch unreachable. Harmless to this plan (color-keying targets the flecks, not the base), but worth a separate fix.

### 0.2 Phase 1 as-built (shipped 2026-06-19, build .04)

Changes A–E landed as designed (§5.5). Post-ship tuning from in-game review:

- **Strength default 0.6 → 1.0; slider range 0–1 → 0–2** (listener clamps to 0–2; values >1 extrapolate past the baked map, three clamps roughness to its min). The 0.6 placeholder was too matte to see glints.
- **Shiny accents need roughness ≲110 to glint at strength 1.0; ≳140 reads matte.** Dirt grit, gravel, sand, and bedrock specks were originally baked too rough (150/140/160/120) and didn't glint; lowered to ~100–125 to match the stone flecks. Stone/snow/glass were already in range.
- **Known limits (per in-game review):** sparse flecks mip to matte beyond a few blocks (close-up effect; glass-tile survives because it's whole-tile). **Glass only glints on its frame/specks** because it's a cutout in the opaque mesh — addressed by **Phase 2** below.

---

## 1. Goal

Make light interact with each block surface in a way that matches what the material *is*, and — critically — let **individual pixels within one texture** have **different roughness (matte vs. shiny)**. Concretely:

- Grass, dirt, stone, sand, snow stay **matte overall**, but the *darker grey flecks in stone* and the *pebble/grit pixels in dirt and gravel* read as **damp/polished** (a moving sun glint).
- **Glass looks genuinely glassy** — a hard, low-roughness surface with a sweeping highlight — instead of being as flat as dirt.
- Each texture gets an explicit, documented "material feel" rather than the current single global value.

The good news: the engine is already 80% wired for this. A `roughnessMap` exists and is plumbed into `chunkMaterial`; it is simply filled with a flat per-tile value today. The work is mostly *authoring data into a map that already ships*, plus reconciling one function that currently flattens the effect.

---

## 2. How the texture & material system works today

### 2.1 The atlas

`initTextures()` (~line 29393) procedurally paints a horizontal strip atlas onto a 2D canvas, one tile per block face, `NUM_TILES = 33` tiles (`TILE` map ~line 4141). Every tile is drawn pixel-by-pixel with **named hex colors** via `fillLogicalPixel()` — so at build time we know the exact color of every texel. After all tiles are drawn, the full pixel buffer is read back into `atlasImageData` / `atlasData` (~line 30209) for a validation/dilation pass. **That readback is the natural hook for deriving a per-pixel roughness/metalness map** — the color data is already in hand.

Textures are filtered as pixel art: `registerPixelTexture()` (~line 9721) sets `NearestFilter` + mipmaps + anisotropy. No `colorSpace` is set, so the maps are treated as linear data (correct for roughness/metalness; an existing quirk for albedo, out of scope here).

### 2.2 The chunk material

`chunkMaterial` (~line 30341) is a `MeshStandardMaterial`:

```js
new THREE.MeshStandardMaterial({
    map: tex,
    roughnessMap: roughnessMap,   // <-- already wired, currently flat per-tile
    vertexColors: true,           // baked sky/block light lives here
    side: THREE.FrontSide,
    alphaTest: 0.1,
    roughness: 1.0,               // scalar that MULTIPLIES roughnessMap
    metalness: 0.0,               // scalar that MULTIPLIES (absent) metalnessMap
    flatShading: true,            // per-face normals via dFdx/dFdy; no normal attribute
});
applyCylindricalFog(chunkMaterial); // onBeforeCompile: fog + blocky-shadow/torch quant injection
```

### 2.3 The existing roughness map (the thing to extend)

~line 30299–30339:

```js
// Grayscale values: 255 = fully rough/matte, 0 = smooth/shiny  (condensed; exact text in §5.5-B)
const tileRoughness = [255, 255, 255, /* … all 17 entries … */ 255];
for (let i = 0; i < NUM_TILES; i++) {
    const roughness = tileRoughness[i] !== undefined ? tileRoughness[i] : 255;
    roughnessCtx.fillStyle = `rgb(${roughness},${roughness},${roughness})`;
    roughnessCtx.fillRect(i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE); // <-- flat fill per tile
}
```

So the map exists and is the right resolution, but every tile is a flat `255` (fully matte). It carries **zero intra-tile variation** — which is exactly the capability you're asking for. The array only has 17 entries while `NUM_TILES` is 33; tiles 17–32 (glass, fire, burnt) fall through to the `: 255` default.

### 2.4 The function that currently *defeats* per-pixel roughness

`updateLightingMaterials()` (~line 31217) runs on load and on every specular-setting change:

```js
if (SETTINGS.specularEnabled) {            // default: true
    chunkMaterial.roughness = SETTINGS.specularRoughness;        // 0.5
    chunkMaterial.metalness = (1.0 - SETTINGS.specularRoughness) * 0.3; // 0.15
} else {
    chunkMaterial.roughness = 1.0;
    chunkMaterial.metalness = 0.0;
}
```

**This is the key finding.** `roughness`/`metalness` are scalars that *multiply* the map. Because the map is a flat `255` (=1.0), the net effect today is: with specular **on** (the default), **every terrain surface in the game** gets a uniform roughness `0.5` and metalness `0.15`. That is why everything — dirt, wood, glass — feels equally, mildly shiny and equally flat. There is no per-material differentiation anywhere; one slider moves all blocks together.

Any per-pixel map we author will be *scaled* by that `0.5`, so the design must reconcile with this function (Section 5.3) or the variation gets crushed.

### 2.5 Lighting & specular reality check

- Real direct light exists: `sun` is a `DirectionalLight` (base intensity `0.8 × diffuseIntensity`, ~line 27063 / 31258); `moon` 0.15; `ambient` 1.0. A `MeshStandardMaterial` specular lobe from a direct light **does** respond to roughness with **no environment map needed** — lowering roughness on a pixel produces a visible sun glint that sweeps as the day/night cycle rotates the sun. This is the cheap win.
- **There is no `envMap` and no `scene.environment`.** Consequence: **`metalness` is the wrong lever for "shiny."** A metallic surface reflects its surroundings; with no environment to reflect, raising metalness mostly *darkens* the surface (and tints its tiny specular by albedo). So "shiny glass / shiny pebble" should come from **low roughness (dielectric specular)**, not high metalness. Metalness should stay ~0 until/unless we add an env map (Phase 3).
- `flatShading: true` means each voxel face has one flat normal. A given face glints uniformly when the sun is near its mirror angle; the **per-pixel roughness map then modulates how strong that glint is per texel**. That's the blocky look we want — shiny pebbles pop inside an otherwise matte face.
- The chunk shader is modified by `applyCylindricalFog`'s `onBeforeCompile` (~line 30836) which injects "blocky" quantized shadows/torch light into the **diffuse** path. A code comment (~line 30985) notes specular is treated as roughness-dependent and "negligible" for rough chunks — i.e. the specular BRDF still runs in the standard shader. **Verification item:** confirm a low-roughness pixel still shows a highlight after the blocky-shadow injection (Section 8).

### 2.6 Half-built "Specular" settings group (dead controls)

There is a **Specular Lighting** settings group (`data-group="specular-lighting"`, ~line 2841) with five settings:

| Setting | Default | Consumed today? |
|---|---|---|
| `specularEnabled` | `true` | Yes — branch in `updateLightingMaterials` |
| `specularRoughness` | `0.5` | Yes — sets `chunkMaterial.roughness` |
| `specularIntensity` | `0.5` | **No** — saved, never read by any shader |
| `specularShininess` | `32` | **No** — saved, never read |
| `specularFresnel` | `0.5` | **No** — saved, never read |

Three of the five are inert. This CCR gives them real meaning (Phase 4 disposition table; `specularIntensity` wired in §5.5-E) so the UI already in the menu starts doing something.

---

## 3. The core capability: per-pixel material response

**Feasibility: high.** Everything needed is already present:

1. Per-texel color is known at atlas-build time (`atlasData`).
2. A `roughnessMap` of the correct size is already created and bound to the material.
3. `MeshStandardMaterial` samples `roughnessMap` per-fragment and (optionally) `metalnessMap` per-fragment — both standard PBR inputs, zero custom-shader work for the roughness path.

The change is to **replace the flat per-tile fill with a per-pixel pass** that, for each tile, maps each texel's albedo color → a roughness value using a documented per-tile *profile*. Optionally add a parallel `metalnessMap` (Phase 3, env-gated).

### 3.1 Profile-driven generation (recommended design)

Each tile gets a tiny profile: a matte `base` value plus an optional list of accent-color overrides. There is **one** matching rule — exact color key — so the generator is a single short loop (the original draft had a second "luminance" mode; the audit dropped it, see 3.3).

```js
// Roughness authoring scale: 255 = dead matte, 0 = mirror. Unlisted tiles default matte (255).
const MAT_PROFILES = {
  [TILE.STONE]:  { base: 245, keys: [{ hex:'#505050', r:90 }, { hex:'#6b6a6a', r:110 }, { hex:'#78909c', r:70 }] }, // dark flecks polished, mica glint
  [TILE.DIRT]:   { base: 250, keys: [{ hex:'#795548', r:150 }] },                        // grit pebbles = damp sheen
  [TILE.GRASS_SIDE]: { base: 250, keys: [{ hex:'#795548', r:180 }] },
  [TILE.GRASS_TOP]:  { base: 250, keys: [{ hex:'#4caf50', r:235 }] },
  [TILE.GRAVEL]: { base: 245, keys: [{ hex:'#9E9E9E', r:140 }, { hex:'#8B8B8B', r:150 }] }, // wet pebbles
  [TILE.SNOW]:   { base: 235, keys: [{ hex:'#FFFFFF', r:80 }] },                          // sparkle crystals
  [TILE.SAND]:   { base: 245, keys: [{ hex:'#F2E6C9', r:160 }] },                         // quartz sparkle
  [TILE.BEDROCK]:{ base: 245, keys: [{ hex:'#777777', r:120 }, { hex:'#999999', r:120 }] },// mineral specks
  [TILE.PLANK]:  { base: 230 },                                                           // satin timber
  [TILE.LEAF]:   { base: 248, keys: [{ hex:'#4CAF50', r:220 }] },                         // waxy hint
  [TILE.LOG_TOP]:{ base: 240, keys: [{ hex:'#A6764A', r:215 }] },
  [TILE.LONGWOOD_LOG_TOP]: { base: 240 },
  [TILE.GLASS]:  { base: 20 },                                                            // hero: hard glass
  // bark, longwood/oak leaves, burnt tiles, fire frames, torch → omitted ⇒ matte 255
};
```

Two rules cover everything:

- **base** — every texel of the tile starts matte at `base`.
- **keys** — texels whose albedo matches a listed accent color (within a tight tolerance) are overridden to `r`. Because each logical texel is painted as a *solid block of an exact hex* (`fillLogicalPixel` → `fillRect`, no anti-aliasing), exact color-keying is reliable and needs **no change to any drawing function**.

A single post-draw loop reads `atlasData`, looks up the tile's profile, and writes grayscale into the roughness canvas. One place, data-driven, easy to tune.

### 3.2 Metalness is out of scope for Phase 1

There is no env map, so metalness only darkens (see 2.5). Phase 1 ships **roughness only**; metalness stays `0`. The "metal" notes in Section 4 (stone mica, bedrock specks) are **Phase-3-gated** and do nothing until an env map + `metalnessMap` exist.

### 3.3 Audit note — why no "luminance" mode

The first draft proposed a `luminance` mode for stone (roughness interpolated from pixel brightness). The audit rejected it for two reasons: (1) it produces a *gradient* — every stone texel gets some sheen — which contradicts the goal of "matte matrix, only the flecks shine"; (2) it's a second code path. Exact color-keying is both simpler and more faithful to the bimodal look, because the flecks are discrete named colors (`#505050`, `#6b6a6a`, `#78909c`).

### 3.4 Why color-keying instead of tagging at draw time

An alternative is to write roughness as each `fillLogicalPixel` runs (a parallel buffer). It's pixel-exact but touches *every* draw call across ~33 tiles — large, noisy diff, easy to desync. Because the "shiny" pixels here are always drawn with **specific named colors** (`#795548` grit, `#9E9E9E` pebble, `#FFFFFF` sparkle, `#78909c` mica), **color-keying the readback achieves the same result with one localized change** and no risk to the texture art. Recommend color-keying; reserve draw-time tagging only for a tile whose shiny color collides with a matte color of the same value.

---

## 4. Per-texture material design (every tile)

Roughness on the authoring scale (255 = dead matte → 0 = mirror). "Feel" is the target. Metalness stays 0 in Phases 1–2 (no env map); the right-hand column notes where a future env map would help.

| # | Tile | Today | Target feel | Base rough | Shiny pixels (color → rough) | Notes / env-map upside |
|---|---|---|---|---|---|---|
| 0 | GRASS_TOP | flat matte | Dry matte blades | 250 | brightest blade `#4caf50` → 235 (faint fresh sheen) | Keep subtle; grass should not glint |
| 1 | GRASS_SIDE | flat matte | Matte; soil grit slightly damp | 250 | grit `#795548` → 180 | Matches dirt grit |
| 2 | DIRT | flat matte | Matte earth, **damp pebbles** | 250 | grit `#795548` → 150 | Your example case |
| 3 | STONE | flat matte | Matte rock, **dark flecks polished, mica glint** | 245 (colorKey) | `#505050` → 90, `#6b6a6a` → 110, `#78909c` → 70 (metal 0.12 = P3) | Your example case; mica reflects sky w/ env |
| 4 | PLANK | flat matte | Satin-finished wood | 230 | gaps `#8B5A2B`/`#6D4C41` stay 250 | Worked timber reads smoother than bark |
| 5 | LOG_SIDE (oak bark) | flat matte | Rough bark | 252 | none | Bark should be the roughest thing |
| 6 | LEAF (cutout) | flat matte | Matte foliage, waxy hint | 248 | lightest `#4CAF50` → 220 | Don't over-shine; reads plastic if you do |
| 7 | BEDROCK | flat matte | Dark matte, **mineral specks glint** | 245 | specks `#777`/`#999` → 120 | Adds menace/sparkle; great with env |
| 8 | LOG_TOP (oak rings) | flat matte | Cut-wood, faint center sheen | 240 | center knot `#A6764A` → 215 | Optional |
| 9 | SAND | flat matte | Matte dune, **quartz sparkle** | 245 | brightest grains `#F2E6C9` → 160 | Sparse, subtle |
| 10 | WATER (in atlas) | n/a | — | — | — | Rendered by separate water material; leave |
| 11 | TORCH (icon/face) | flat matte | Matte handle, bright flame | 250 | flame `#ffeb3b`/`#ff9800` emissive-ish | Roughness ~irrelevant on emissive bits |
| 12 | SNOW | flat matte | Matte powder, **glittering crystals** | 235 | sparkle `#FFFFFF` → 80 | High-impact, very "wintry" |
| 13 | GRAVEL | flat matte | Matte bed, **wet pebbles** | 245 | light pebbles `#9E9E9E`/`#8B8B8B` → 140–150 | Your example case |
| 14 | LONGWOOD_LOG_SIDE | flat matte | Very rough dark bark | 253 | none | Roughest |
| 15 | LONGWOOD_LOG_TOP | flat matte | Cut wood | 240 | center → 215 | Mirror oak top |
| 16 | LONGWOOD_LEAF (cutout) | flat matte | Matte dark foliage | 250 | none | |
| 17 | GLASS (cutout) | falls to 255 | **Hard glass, sweeping highlight** | **20 (flat)** | whole tile; + Fresnel rim (5.4) | The hero change; biggest env-map upside |
| 18–29 | FIRE (12 frames, cutout) | falls to 255 | Emissive, no spec | 255 | — | Roughness moot — emissive/animated |
| 30 | BURNT_LOG_SIDE | falls to 255 | Charcoal matte | 252 | lightest char `#4a3528` → 230 | Charcoal is matte/sooty |
| 31 | BURNT_LOG_TOP | falls to 255 | Charcoal matte | 250 | center → 235 | |
| 32 | BURNT_PLANK | falls to 255 | Charcoal matte | 250 | none | |

All hex values above are taken from the actual draw code (Section 9 cross-references the lines).

> **Footnotes (from audit):**
> - **Metalness columns are Phase-3-gated.** Phase 1 has no `metalnessMap`/env map, so stone-mica/bedrock metalness does nothing until Phase 3 (see 3.2).
> - **Color-key tolerance must be tight (≈8).** Snow's base `#FAFAFA` is only 15 (sum-of-abs-channel) away from its sparkle key `#FFFFFF`; a loose tolerance would wrongly flag the whole snow surface as sparkly. Exact texels mean a tolerance of ~8 cleanly separates every base/accent pair here.
> - **Water tile (#10) roughness is dead data** — water faces render via the separate water material, which has no `roughnessMap`; the chunk material never samples that tile. Left matte, harmless.
> - **Matte-only tiles are omitted from `MAT_PROFILES` ⇒ they default to 255.** The 250–253 "base" values shown above for bark (LOG_SIDE, LONGWOOD_LOG_SIDE), leaves (LONGWOOD_LEAF), TORCH, and the BURNT tiles are within an imperceptible range of full matte, so they aren't worth a table entry. If you want those exact values, add the entry; otherwise 255 is visually identical.

---

## 5. Implementation plan (phased)

### Phase 1 — Per-pixel roughness map + live strength slider *(low risk, highest value/effort ratio)* — **the v1 ship**

Exact before/after for all five edits is in **§5.5 (changes A–E)**. In brief:

1. **A** — add the `MAT_PROFILES` table (§3.1) inside `initTextures`, above the roughness block (~30299).
2. **B** — replace the flat per-tile fill loop (lines 30307–30335) with a per-texel pass over `atlasData` (base + exact color-key overrides, tolerance 8). Map is baked at the **full stylized target** so the slider has headroom; existing canvas/texture creation stays.
3. **C** — extend the existing chunk `onBeforeCompile` (`applyCylindricalFog`) with a live `uShininessStrength` uniform that lerps roughness toward matte: `roughnessFactor = mix(1.0, roughnessFactor, uShininessStrength)`.
4. **D** — rewrite the `updateLightingMaterials` chunk branch (31218–31228) to keep scalars neutral and drive the uniform (fixes the specular-off bug; drops the per-change recompile).
5. **E** — default the slider to **0.6 (subtle placeholder)** via the repurposed `specularIntensity`; retire `specularShininess`. Kandler tunes `specularIntensity` in-game and reports the value to bake as the real default.

No new texture, no new sampler, no worker changes. This alone delivers shiny stone flecks, damp dirt/gravel pebbles, sparkling snow, glass roughness, matte everything-else — **and a live dial to taste it.**

### Phase 2 — Real glass: a translucent surface that glints across the whole face *(medium risk)*

> **AS-BUILT (option 2a SHIPPED 2026-06-19, build .05 — pending in-browser test):** Implemented decoupled to limit blast radius. Glass texture → solid pale-blue tint (frame + glints, `cutout` tag dropped). New transparent `glassMaterial` (DoubleSide, `opacity=SETTINGS.glassOpacity` default 0.4, `roughnessMap`, `applyCylindricalFog` for fog + the per-pixel glint, `depthWrite:false`). Glass is excluded from BOTH opaque mesher paths (`greedyMeshSection` + per-block) and emitted in a dedicated **lazy** loop at the end of `renderChunk` via `addFaceIndexed` (identical lighting/AO/UV/quadSize) into one per-chunk mesh keyed `<cKey>_GLASS`. The worker scans a `hasGlass` flag and routes glass chunks to the main-thread `renderChunk` (exactly like `hasTorchFire`) — so **no worker-mesh-buffer/parity changes were needed** (simpler than the table below anticipated). Lifecycle: `_GLASS` handled in `releaseMeshForKey` (disposed directly, not pooled), `chunkBaseOfMeshKey`, purge/prune, shadow/occlusion skips, `isChunkMeshed`. New "Glass Opacity" slider in Graphics › Water. Glass casts/receives no shadows. The build-template table below is retained for reference; the as-built used the lazy-rebuild variant instead of integrating glass into `flushBand`'s banded buffers.

**Root cause of the current limitation.** Glass is tagged `["transparent","cutout","collidable","cullAdjacent"]` and is greedy-merged into the **opaque** chunk mesh (`chunkMaterial`, `alphaTest 0.1`, no blending). Its see-through interior is therefore **discarded texels (holes)** — there is no surface there, so only the opaque frame/specks can catch a highlight. An opaque-with-alphaTest material is binary per texel (fully solid or fully gone); it can *never* be a smooth low-opacity tint. That is why glass only glints on its edges/specks today.

**Water already solves this, and is the template.** Water's transparency comes from its **material, not its texture**: the water tile is a solid image, but water renders as its **own separate per-chunk mesh** with a blended material (`transparent: true`, `opacity: SETTINGS.waterOpacity`, `depthWrite: false`). That whole surface is a real translucent pane — see-through *and* it catches a sheen everywhere, no stippling. The engine already carries the entire pipeline this needs: a separate face bucket in the mesher, a dedicated mesh + material, an attach/detach lifecycle, and worker-thread parity.

Options, recommended first:

- **2a (recommended) — Clear glass via the water-style translucent pass.** Give glass the water treatment: its own per-chunk translucent mesh, a transparent glass material (low `opacity` tint + low roughness so the sun glints across the face, sampling the Phase-1 atlas `roughnessMap`), and a **solid** glass texture (keep the pale frame, fill the interior with a faint blue tint instead of holes). Result: a smooth, nearly-transparent tinted pane that glints across the whole face — the look Kandler described. This is the proper fix.
- **2b — Frosted stipple (cheap stopgap, texture-only).** Leave glass a cutout but redraw the interior as a fine pale stipple so glint-catching texels cover more of the pane (transparent gaps remain see-through). Zero perf cost, no mesher/worker change. Look: frosted / screen-door, **not** a smooth tint. Use only as an interim if 2a isn't worth the effort yet.
- **2c — Fresnel rim (optional polish, layers onto 2a).** Add a grazing-angle rim brighten so edges read as glass; drive it with the repurposed `specularFresnel` setting. Shader sketch in §5.4. Complements clear glass; not needed on its own.

**Water pipeline as the build template (as-built — verify line numbers, they drift).** Mirror these for glass; glass is *simpler* than water (it needs none of water's depth/shore/foam/thickness attributes — just position/uv/color/index):

| Water (existing) | Glass (to add) | ~Line |
|---|---|---|
| `waterMaterialStandard`: `transparent:true`, `opacity:SETTINGS.waterOpacity`, `depthWrite:false`, `depthTest:true`, `side:DoubleSide`, low `roughness`, `flatShading:true` | `glassMaterial`: same shape, glass tint + `opacity` (new `SETTINGS.glassOpacity`), low roughness, **`roughnessMap`** for the per-pixel glint | 30366 |
| `addFaceWaterIndexed` → `waterPos/waterUvs/waterCols/waterIndices` → `chunk.waterMesh` | parallel `addFaceGlassIndexed` → `glassPos/...` → `chunk.glassMesh` | 18640–18731 |
| `_WATER` mesh-key suffix + `waterMeshCount` + `isWater` flag (attach/detach) | `_GLASS` equivalents | 19521–19562, 40399–40412 |
| Worker mesher emits the water buffers + adds them to the Transferable list | **must add the glass bucket to the worker path + transfer list** (parity), or glass won't render on worker-meshed chunks | buildChunkWorkerCode |

**Cost / risk.** One extra translucent draw per chunk that contains glass (same class of cost as water), plus transparency **sorting** between glass and water when both are present (depthWrite off on both). Touches the mesher, the mesh pool/lifecycle, and worker parity — the biggest change in this CCR, but well-precedented since water proves the whole path. The Phase-1 `roughnessMap`/`uShininessStrength` system carries straight over (the glass material samples the same atlas roughness, so the dark/pale glass texels keep their authored shininess). New setting `glassOpacity` (range ~0.1–0.6) follows the same DEFAULTS/SETTINGS/UI/round-trip wiring as `waterOpacity`.

### Phase 2a.1 — Glass body opacity rework: real per-pixel alpha mix + specular punch-through *(BUILT 2026-06-19 build .08; supersedes the build .06 shader-marker approach — pending in-browser test/tuning)*

> **AS-BUILT:** Both parts shipped exactly as planned below. Part 1: body opacity baked into texture alpha (`a0 = round(glassOpacity*255)`), exact body texel offsets recorded in `_glassBodyTexels`, `_glassAtlas` refs stashed after atlas `tex` creation, `setGlassBodyAlpha()` re-bakes live; the build-.06 `uGlassBodyOpacity` override removed; the 3 poke sites re-pointed. Part 2: punch-through wrap injects after `#include <opaque_fragment>` (`gl_FragColor.a += specLuma * uGlintReflect`), driven by the repurposed `specularFresnel` (UI relabeled "Glass Reflection", range 0–2). All new JS blocks syntax-checked in isolation; `uGlassBodyOpacity` is gone from live code. Optional Fresnel rim NOT added (left as a tuning follow-up).

**Why.** Build .06 set body opacity with a *shader marker*: body texels tagged alpha 0, then `diffuseColor.a = (diffuseColor.a < 0.5) ? uGlassBodyOpacity : 1.0` after `<map_fragment>`. In practice the body reads wrong (all-opaque or invisible) — fragile and unverifiable. Kandler wants a genuine **mix**: opaque frame + opaque accent/glint pixels, and a ~90%-transparent body that still reflects/refracts. Do **both** parts.

#### Is this the best way? (options weighed)

| Approach | Look | Cost / risk | Verdict |
|---|---|---|---|
| **Texture-alpha base + shader punch-through glint** *(chosen)* | Opaque frame/accents + ~10% body + a bright sun-glint that sweeps the body | Base is texture-only (robust); glint is one additive shader inject. **Key property: if the shader half fails, base alpha is still correct** (alpha lives in the texture, not the shader) | **Best balance** |
| Shader-uniform alpha (build .06) | Same target | Cheap live slider (no re-upload) but the alpha lives in a fragile inject — current bug | Rejected (fragile) |
| `MeshPhysicalMaterial` `transmission`/`ior`/`clearcoat`/`specularIntensity` | True refraction + controllable reflectivity (best-looking glass) | Needs a transmission render pass (renders scene-behind to a buffer) → real perf cost + bigger rewrite | **Premium, deferred** (note in Phase 3) |

The chosen path keeps the robust base in the texture and uses the shader only for the *additive* glint, so a shader bug can't make glass disappear.

#### Part 1 — real per-pixel alpha mix baked into the texture *(robust base; no shader alpha trick)*

**P1-1. Bake real body alpha + record body texel indices** — replace the build-.06 marker loop. **Before** (lines **30340–30355**):

```js
                // ... GLASS body alpha mask ... Body texels (the #bcd9e3 tint) get alpha 0 ...
                {
                    const gX0 = TILE.GLASS * TILE_SIZE;
                    for (let py = 0; py < TILE_SIZE; py++) {
                        const rowBase = py * cvs.width;
                        for (let px = 0; px < TILE_SIZE; px++) {
                            const di = (rowBase + gX0 + px) * 4;
                            if (Math.abs(atlasData[di] - 0xbc) + Math.abs(atlasData[di + 1] - 0xd9) + Math.abs(atlasData[di + 2] - 0xe3) <= 10) {
                                atlasData[di + 3] = 0; // body marker (frame/glints keep 255)
                            }
                        }
                    }
                    ctx.putImageData(atlasImageData, 0, 0);
                }
```

**After** — alpha = the real opacity, and remember which texels are body so the live slider can re-bake exactly them:

```js
                // CCR 2a.1: bake the REAL body opacity into the texture alpha (frame/accents stay 255).
                // Record body texel indices so setGlassBodyAlpha() can re-bake just them on the slider.
                _glassBodyTexels = [];
                {
                    const gX0 = TILE.GLASS * TILE_SIZE;
                    const a0 = Math.round((SETTINGS.glassOpacity ?? 0.1) * 255);
                    for (let py = 0; py < TILE_SIZE; py++) {
                        const rowBase = py * cvs.width;
                        for (let px = 0; px < TILE_SIZE; px++) {
                            const di = (rowBase + gX0 + px) * 4;
                            if (Math.abs(atlasData[di] - 0xbc) + Math.abs(atlasData[di + 1] - 0xd9) + Math.abs(atlasData[di + 2] - 0xe3) <= 10) {
                                atlasData[di + 3] = a0;      // body = real opacity
                                _glassBodyTexels.push(di);   // exact body indices (robust vs. opacity==1.0)
                            }
                        }
                    }
                    ctx.putImageData(atlasImageData, 0, 0);
                }
```

**P1-2. Stash atlas refs for the live re-bake** — immediately after `const tex = new THREE.CanvasTexture(cvs); registerPixelTexture(tex);` (~line **30357**) add:

```js
                _glassAtlas = { ctx, tex, imageData: atlasImageData }; // for setGlassBodyAlpha() live re-bake
```

**P1-3. New module-scope state + helper** (near the other `let glassMaterial;` decl, ~line **13569**):

```js
            let _glassAtlas = null;        // { ctx, tex, imageData } captured in initTextures
            let _glassBodyTexels = [];     // atlas byte-offsets of glass BODY texels (RGBA stride)
            // CCR 2a.1: re-bake glass body opacity into the texture alpha (frame/accents untouched).
            function setGlassBodyAlpha(opacity) {
                if (!_glassAtlas || !_glassBodyTexels.length) return;
                const a = Math.max(0, Math.min(255, Math.round(opacity * 255)));
                const d = _glassAtlas.imageData.data;
                for (let k = 0; k < _glassBodyTexels.length; k++) d[_glassBodyTexels[k] + 3] = a;
                _glassAtlas.ctx.putImageData(_glassAtlas.imageData, 0, 0);
                _glassAtlas.tex.needsUpdate = true; // re-uploads the atlas (debounce if it hitches on drag)
            }
```

**P1-4. Remove the build-.06 shader alpha override** — delete the wrap at **31300–31312** (keep `applyCylindricalFog(glassMaterial);` at 31299; glass keeps fog + `uShininessStrength` through it). **Delete:**

```js
                // CCR Phase 2a: wrap the fog onBeforeCompile to add per-pixel glass alpha. ...
                {
                    const _glassFogCompile = glassMaterial.onBeforeCompile;
                    glassMaterial.onBeforeCompile = (shader) => {
                        _glassFogCompile(shader);
                        shader.uniforms.uGlassBodyOpacity = { value: SETTINGS.glassOpacity };
                        shader.fragmentShader = shader.fragmentShader
                            .replace('void main() {', 'uniform float uGlassBodyOpacity;\nvoid main() {')
                            .replace('#include <map_fragment>', '#include <map_fragment>\n    diffuseColor.a = (diffuseColor.a < 0.5) ? uGlassBodyOpacity : 1.0;');
                    };
                }
```
*(Part 2 re-adds a wrap, but only for the additive glint — never for alpha.)*

**P1-5. `glassMaterial` unchanged** — it already has `opacity: 1.0` (line **30485**) and `alphaTest: 0`; the texture alpha is now the per-pixel opacity. ✅ Keep `transparent:true`, `depthWrite:false`, `side:DoubleSide`. **Ensure `tex.premultiplyAlpha` stays the default `false`** (non-premultiplied) or the low-alpha body RGB blends wrong.

**P1-6. Re-wire the 3 sites that poke the removed uniform → call `setGlassBodyAlpha`:**
- Slider handler, **line 23423**: `…uniforms.uGlassBodyOpacity.value = SETTINGS.glassOpacity;` → `setGlassBodyAlpha(SETTINGS.glassOpacity);`
- `applyWaterMaterialSettings`, **lines 16378–16381** (the `if (glassMaterial && glassMaterial.userData.shader) …uGlassBodyOpacity…` block) → `setGlassBodyAlpha(SETTINGS.glassOpacity);`
- Reset Materials handler, **line 28563**: same swap → `setGlassBodyAlpha(SETTINGS.glassOpacity);`

**P1-7. Slider range** — keep **max < 1.0** (e.g. 0–0.8, current) so body alpha never hits 255 (frame value); `_glassBodyTexels` makes this safe regardless, but it keeps "glass" from going fully solid. Default 0.1.

Part 1 alone delivers the mix (opaque frame/accents + ~90%-transparent body) with **zero shader-alpha fragility**. The body still catches a faint glint (whole tile is low-roughness); accents are the static opaque highlights.

#### Part 2 — specular punch-through *(the moving glassy reflection; additive, can't break the base)*

Real glass reflects more than its transparency implies (transmission ≠ reflection). Without this the body glint blends at ~10% (faint). Fix: where the sun specular is strong, raise the **alpha** so that bright spot shows — the specular color is already in `gl_FragColor.rgb` (it's part of `outgoingLight`), so raising alpha reveals it; no rgb math needed (and no tonemapping-order issue, since alpha isn't tonemapped).

**P2-1. Add a punch-through wrap** after `applyCylindricalFog(glassMaterial);` (where P1-4's wrap was):

```js
                // CCR 2a.1 Part 2: additive glint punch-through (NOT alpha base — that's in the texture).
                // After <opaque_fragment>, reflectedLight + gl_FragColor are in scope (three.js r160).
                {
                    const _glassFog = glassMaterial.onBeforeCompile;
                    glassMaterial.onBeforeCompile = (shader) => {
                        _glassFog(shader); // fog + uShininessStrength + stash userData.shader
                        shader.uniforms.uGlintReflect = { value: SETTINGS.specularFresnel };
                        shader.fragmentShader = shader.fragmentShader
                            .replace('void main() {', 'uniform float uGlintReflect;\nvoid main() {')
                            .replace('#include <opaque_fragment>',
                                `#include <opaque_fragment>
                                float _glSpec = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.299, 0.587, 0.114));
                                gl_FragColor.a = clamp(gl_FragColor.a + _glSpec * uGlintReflect, 0.0, 1.0);`);
                    };
                }
```

*Optional Fresnel rim* (glass edges catch more — strong glass cue) — add before the `gl_FragColor.a` line: `float _glFres = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 5.0);` then `+ _glFres * uGlintReflect` in the boost. `normal`/`vViewPosition` are in scope.

**P2-2. Repurpose `specularFresnel` → `uGlintReflect` (it's currently dead):**
- Live update: Fresnel `change` handler, **lines 23356–23358** — after `SETTINGS.specularFresnel = val; saveSettings();` add: `if (glassMaterial && glassMaterial.userData.shader) glassMaterial.userData.shader.uniforms.uGlintReflect.value = val;`
- UI relabel, **line 2865**: `Fresnel Strength` → `Glass Reflection`. Default stays 0.5 (try 0.6–1.5 in-browser); range maybe widen to 0–2.
- Reset Materials already resets `specularFresnel`; add a `uGlintReflect` poke there too.

#### Other shader settings considered (and why not now)

- **`MeshStandardMaterial` F0 is fixed at 0.04** (dielectric) → its raw glint is dim; Part 2's alpha boost is what makes it read. For genuinely brighter/real reflections, `MeshPhysicalMaterial` (`specularIntensity`, `clearcoat`, or `transmission`/`ior` for true refraction) — deferred (perf + rewrite), noted in the options table.
- **`premultiplyAlpha`**: must stay `false` (default) — premultiplied + low body alpha would darken the body RGB.
- **`depthWrite:false` + `DoubleSide`**: triangles inside ONE glass mesh aren't depth-sorted, so a glass *box* (multiple stacked panes) can show sorting glitches; single panes are fine. Acceptable for v1; the alternative (`depthWrite:true`) would stop you seeing through glass at all.
- **Tonemapping/colorspace**: only `gl_FragColor.a` is touched (after `<opaque_fragment>`), and alpha is not tonemapped — so injection order is safe. (If we later boost `.rgb`, it must go *before* `<tonemapping_fragment>`.)

#### Correctness check (verified against r160 + current code)

- `#include <opaque_fragment>` is present in `MeshStandardMaterial` and is where `gl_FragColor` is first set (`vec4(outgoingLight, diffuseColor.a)`); `reflectedLight` (and `totalSpecular`) are in scope there and after. ✅
- The body color-key (`#bcd9e3`, tol 10) matches the painted body texels exactly (`fillLogicalPixel` writes solid hex, no AA). ✅
- `_glassBodyTexels` (explicit indices) makes the live re-bake robust even if frame and body alphas ever coincide. ✅
- All three uniform-poke sites (16378, 23423, 28563) are re-pointed to `setGlassBodyAlpha`; the now-unused `uGlassBodyOpacity` is fully removed. ✅

#### Will it look right? (honest)

- **Body**: ~10% tinted, see-through — a clear pane. At 0.1 it's *subtle* (can read as almost-absent in flat light); the slider goes to 0.8 if you want frostier. Mipmaps make **distant** glass body drift slightly more opaque (frame/body alpha average) — usually reads fine, occasionally a touch solid at range.
- **Frame + accent specks**: solid, crisp — the static "edges + glints."
- **Part 2 glint**: a brighter, more-opaque highlight that sweeps the body as the sun moves — the "reflects like glass" cue. Magnitude depends on sun + roughness; **tune `uGlintReflect` in-browser** (0.04 dielectric F0 means it needs a healthy multiplier). The optional Fresnel rim adds edge sparkle.
- **Caveats**: glass-box self-sorting (above); and at very low opacity the body's own diffuse tint nearly vanishes in shade — that's physically reasonable for clear glass.

**Rollout.** Ship **Part 1** first (texture-only, robust) and confirm in-browser; then add **Part 2** (additive — can't break the base). Removes `uGlassBodyOpacity`; repurposes `specularFresnel` → `uGlintReflect`. Reset Materials resets both.

### Phase 2a.2 — Glass refraction: the "looking-through-glass bends/compresses the view" effect *(BUILT 2026-06-19 build .09 — pending in-browser test/tuning)*

> **AS-BUILT:** Shipped as planned with the audit fixes applied. `refractionScale` setting + slider (Graphics › Performance › Rendering, recreates the RT on "change"); `REFRACTION_SCALE` now reads it. Capture gate fires for glass too; `_GLASS` hidden during capture. Glass `onBeforeCompile` extended with a **compile-gated** (`SETTINGS.glassRefractionEnabled`) screen-space refraction inject (vertex `vGlassScreen`; fragment after `<opaque_fragment>`: `refract()` IOR 1.5 + depth-modulated offset + foreground reject; body mask = `diffuseColor.a`; composite `bg + totalDiffuse*uGlassTint + totalSpecular*uGlintReflect`). Per-frame uniform feed guarded on `glassRefractionEnabled && uniforms.tRefraction`. New Materials controls: Refraction toggle (sets `glassMaterial.needsUpdate`) + Refraction Strength; Reset Materials resets both. **Full module syntax-checks clean** (41,537 lines). NOT wired into `SETTINGS_PROFILES` (opt-in via toggle, off by default). Optional Fresnel rim still not added. **Tuning (build .10):** the depth-modulation was multiplying the offset *down* (invisible even at max); fixed to ADD to the bend (`*= 1.0 + clamp(throughGlass*0.02, 0, 2.0)`) so the base offset is always full. Strength slider max 0.1→**0.5** (default 0.03→**0.2**); `glassRefractionEnabled` now defaults **on** (≈free since water already captures the RT). Caveat surfaced: head-on viewing is physically ~no bend — refraction shows at an angle and grows with depth.

**Resolution question (answered).** `REFRACTION_SCALE` (0.5, ~line 27265) is applied **on top of** the pixel ratio: `_refractW = innerWidth × (devicePixelRatio × SETTINGS.pixelRatio) × REFRACTION_SCALE` (~27272), while the main framebuffer is `renderer.setPixelRatio(devicePixelRatio × pixelRatio)` (~27230). So they **compound** — at the default `pixelRatio 0.5`, the refraction RT is **0.25× native** (a quarter of the main framebuffer's pixels). For water that's deliberate (wave distortion hides the blur); for glass (which should read crisp) 0.25× is likely too soft.

**Decision:** expose it as `refractionScale` (slider 0.25–1.0, **default 0.5** to preserve current cost; compounds with pixelRatio exactly like the existing `volumetricScale`/`causticScale`). Shared by water + glass. Raise toward 1.0 for crisp glass — the capture then renders at the full main-framebuffer res (more cost, also sharpens water). So: no, we don't *need* the extra half — it's now a dial; 0.5 is the cheap default.

**Pipeline reused (already built for water).** Capture the opaque scene (refractive meshes hidden) into `refractionRenderTarget` (RGBA + `DepthTexture`, ~27274), throttled every ~2 frames / on camera move (~43570). Sample it at a distorted screen-UV with depth-based foreground rejection (~30686–30743). Glass plugs into all of it.

**Changes (with line numbers):**

1. **`refractionScale` setting.** `const REFRACTION_SCALE = 0.5;` (27265) → `const REFRACTION_SCALE = SETTINGS.refractionScale ?? 0.5;`. Add `refractionScale: 0.5` to DEFAULTS (~6264, by `volumetricScale`) + SETTINGS (~6009) + the 3 profiles; add a slider in Graphics › Performance › Rendering next to Volumetric/Caustic Resolution; on change, resize `refractionRenderTarget` (mirror the pixelRatio resize path ~44430).

2. **Capture fires for glass too + hide `_GLASS`.**
   - Gate (~43552): `const refractionEnabled = (SETTINGS.waterRefractionEnabled || SETTINGS.glassRefractionEnabled) && !SETTINGS.waterFastMode;`
   - Hide loop (~43578) — also hide glass during the capture so it doesn't self-refract:
     ```js
     if ((key.endsWith("_WATER") || key.endsWith("_GLASS")) && mesh && mesh.visible) { mesh.visible = false; hiddenWaterMeshes.push(mesh); }
     ```

3. **Feed glass the refraction uniforms** each frame (next to water's, ~43607):
   ```js
   // guard on the uniform existing — it's only injected when glassRefractionEnabled was on at compile time
   if (SETTINGS.glassRefractionEnabled && glassMaterial && glassMaterial.userData.shader && glassMaterial.userData.shader.uniforms.tRefraction) {
       const gu = glassMaterial.userData.shader.uniforms;
       gu.tRefraction.value = window.refractionRenderTarget.texture;
       gu.tRefractionDepth.value = window.refractionRenderTarget.depthTexture;
       gu.uCamNear.value = camera.near; gu.uCamFar.value = camera.far;
       gu.uGlassRefract.value = SETTINGS.glassRefractionStrength;
   }
   ```

4. **Glass shader inject** — extend the existing glass `onBeforeCompile` wrap (the Part-2 punch-through, ~31324). **Compile-time gate on `SETTINGS.glassRefractionEnabled`** (recompile on toggle, like blocky shadows) so the samplers/uniforms only exist when on; OFF ⇒ falls straight back to the 2a.1 alpha body.
   - **Vertex:** after `#include <project_vertex>`, `vGlassScreen = gl_Position;` (+ `varying vec4 vGlassScreen;`).
   - **Fragment, after the Part-2 `#include <opaque_fragment>` block** (`gl_FragColor`, `normal`, `vViewPosition`, `reflectedLight`, `totalDiffuse`, `totalSpecular` all in scope in r160):
     ```glsl
     vec2 screenUV = (vGlassScreen.xy / vGlassScreen.w) * 0.5 + 0.5;
     // slab refraction: bend the camera->fragment ray through the face normal by IOR
     vec3 R = refract(normalize(-vViewPosition), normalize(normal), 1.0/1.5); // IOR 1.5
     vec2 off = R.xy * uGlassRefract;
     // depth-modulate so the bend + apparent compression grow with through-glass distance ("back looks closer")
     float dRaw   = texture2D(tRefractionDepth, screenUV).x;
     float bgEye  = (2.0*uCamNear*uCamFar)/(uCamFar+uCamNear-(dRaw*2.0-1.0)*(uCamFar-uCamNear));
     float frgEye = (2.0*uCamNear*uCamFar)/(uCamFar+uCamNear-(gl_FragCoord.z*2.0-1.0)*(uCamFar-uCamNear));
     off *= clamp((bgEye - frgEye) * 0.15, 0.0, 1.5);
     vec2 dUV = clamp(screenUV + off, 0.001, 0.999);
     if (texture2D(tRefractionDepth, dUV).x < gl_FragCoord.z - 0.0005) dUV = screenUV; // foreground reject
     vec3 bg = texture2D(tRefraction, dUV).rgb;
     // body texels = refracted view (transmission) + faint lit tint + the glint (reflection) ON TOP
     // body flag = the baked low texture alpha. Use diffuseColor.a (set by <map_fragment> = texAlpha×opacity,
     // opacity=1.0, and NOT touched by lighting) — `texColor` is NOT a stock three.js variable.
     float isBody = 1.0 - step(0.99, diffuseColor.a);
     vec3 glassBody = bg + totalDiffuse * uGlassTint + totalSpecular * uGlintReflect;
     gl_FragColor.rgb = mix(gl_FragColor.rgb, glassBody, isBody);
     gl_FragColor.a   = max(gl_FragColor.a, isBody); // body becomes opaque-composited, like water refraction
     ```
   - Uniforms registered in the wrap: `tRefraction`, `tRefractionDepth`, `uCamNear`, `uCamFar`, `uGlassRefract`, `uGlassTint` (+ the existing `uGlintReflect`).

5. **Settings (Graphics › Materials):** `glassRefractionEnabled` (toggle, Quality-tier; the toggle handler must set `glassMaterial.needsUpdate = true` to recompile with/without the inject) + `glassRefractionStrength` (~0–0.1, default ~0.03). Reset Materials resets them. Profiles: off in Performance/Balanced, on in Quality.

**Correctness & logic pass.**
- **r160 anchors:** `<project_vertex>` (sets gl_Position) and `<opaque_fragment>` (sets gl_FragColor; `normal`/`vViewPosition`/`reflectedLight`/`totalDiffuse`/`totalSpecular` in scope right after) are the correct injection points — the same ones used by 2a.1 Part 2 and the water material. ✅
- **Depth compare validity:** `gl_FragCoord.z` (glass, main render) and the captured `tRefractionDepth` are both NDC depth in the **same camera projection**, so foreground-reject + the eye-space linearization are valid even though the RT is a different resolution (depth is resolution-independent; `screenUV` is normalized). This is exactly what water does. ✅
- **Capture order:** the refraction RT is captured at the TOP of `renderFrame`, before the main scene render where glass draws — so glass samples a current capture the same frame. ✅
- **Self-refraction:** glass hidden during the capture ⇒ a pane samples the scene BEHIND it, not itself. Glass-behind-glass isn't refracted (edge case). ✅
- **Alpha-model switch (the subtle one):** with refraction ON the body is **opaque-composited** (`a = 1`, like water); the 2a.1 texture body-alpha (~0.1) is reused only as the *body mask* (`isBody`), never for blending. Frame/accents (texAlpha 1 ⇒ isBody 0) keep their lit opaque color. With refraction OFF (compile-gated out) the body falls back to the 2a.1 alpha-blend. No conflict. ✅
- **Glint preserved (the one real bug risk):** the composite **adds** `totalSpecular` on top of `bg` (reflection over transmission) rather than overwriting with the background — so glass still glints. Tint uses `totalDiffuse` (lit), so there's no double-count of the specular. ✅
- **Body mask variable (audit fix):** use `diffuseColor.a` for `isBody`, NOT `texColor` (not a stock var). After `<map_fragment>` `diffuseColor.a = texAlpha × opacity` (opacity 1.0) and lighting never touches it, so it's the clean baked body alpha at the inject point. (Part-2 boosts `gl_FragColor.a`, not `diffuseColor.a`, so the mask stays clean.) ✅
- **Uniform-feed guard (audit fix):** the per-frame feed must guard on `SETTINGS.glassRefractionEnabled` AND `uniforms.tRefraction` existing — when refraction is compiled OUT, those uniforms don't exist and an unguarded `gu.tRefraction.value=…` would throw. ✅
- **First frame:** `userData.shader` doesn't exist until glass first compiles (during the main render), so the feed skips frame 0 and glass samples the compile-time `tRefraction` value — set that initial value to `refractionRenderTarget.texture` in the wrap (like water) so there's no black-sample flash. ✅
- **Fallback safety:** refraction is compile-gated + additive; if disabled or the inject fails, glass = the proven 2a.1 alpha glass. ✅

**Will it really look right?** The bend/displacement: **yes** — identical math to the water refraction already shipping here and to Minecraft glass shaders (angled views bend, head-on faces stay ~straight, depth-aware so foreground objects don't smear onto the glass). The **"back looks closer" compression**: the `refract()` offset + depth-modulation **approximate** it convincingly (the displaced sample plus the depth-scaled offset pull the background "inward"), but honestly — screen-space refraction can't truly remap depth, so it's a strong *approximation*, not physically exact; expect it to read as real refraction and to need `glassRefractionStrength` tuning. Caveats (all already true for water): half-res softness unless `refractionScale` is raised, mild screen-edge smear (off-screen geometry can't be sampled), throttled-capture lag for fast-moving things behind glass. Shader-inject is the main risk, but it's compile-gated and falls back to 2a.1 glass.

### Phase 3 — Environment reflections *(wanted; ship behind a non-default toggle first — decision #2)*

Add a small `scene.environment` (PMREM of the existing sky, or a cheap static cubemap). This is the single change that makes low-roughness/metal pixels actually **reflect the sky** — glass, water, stone mica, bedrock specks all gain real reflections, and `metalness` becomes a usable lever (so the metal entries in Section 4 light up). Cost: a PMREM render; amortize by regenerating only every N seconds as the sky color shifts, or use a static low-res cubemap.

**Rollout per decision #2:** introduce as a **non-default** setting (off in every shipping profile initially). Playtest perf + look in-game, *then* decide whether it earns a place as a Quality-profile default. Do **not** wire it into `SETTINGS_PROFILES` as a default until that test passes.

### Phase 4 — Settings cleanup & profiles *(mostly resolved in Section 0)*

Per decision #4, the specular settings are finalized as:

| Setting | Disposition |
|---|---|
| `specularEnabled` | Keep — master on/off (off ⇒ strength 0 ⇒ all matte) |
| `specularIntensity` | **Repurposed** → live shininess-strength slider (lands in **Phase 1**) |
| `specularFresnel` | **Repurposed** → glass/edge Fresnel strength (lands with **Phase 2c**) |
| `specularShininess` | **Retire** — remove/hide from UI + `DEFAULTS`/`SETTINGS` (Phong leftover) |
| `specularRoughness` | **Demote** — no longer drives terrain; keep only if water still needs it, else fold into strength |

Profiles: Performance = strength low/0 (matte, cheapest); Balanced = subtle; Quality = full. Env reflection (Phase 3) stays out of profile defaults until proven.

### 5.3 Reconciling `updateLightingMaterials` (required for Phase 1 to show)

Exact diff and rationale: **§5.5 change D**. In one line: stop letting the scalar flatten the map — set `roughness = 1.0`, drive everything through `uShininessStrength` (off ⇒ 0 ⇒ matte). `specularRoughness` stays for water (line 31234), unused by terrain.

### 5.5 Phase 1 — exact code changes (before → after)

Five edits, all in `voxEx.html`. Line numbers are current as of 2026-06-19 and **will drift — match on the code, not the number.**

#### Change A — add `MAT_PROFILES` (new code)

Insert once, just **above** the roughness-map block (before ~line 30299, inside `initTextures`, so `TILE`/`atlasData` are in scope). Use the table from §3.1 verbatim. No existing code removed.

#### Change B — replace the flat roughness fill with a per-texel pass

**Before** (lines **30307–30335** — 17-entry array + flat fill loop; array body elided):

```js
                // Per-tile roughness values (0-255)
                // All terrain is fully matte (255) - only water has shine (separate material)
                const tileRoughness = [
                    255,  // 0: GRASS_TOP - fully matte
                    /* …15 more 255 entries… */
                    255,  // 16: LONGWOOD_LEAF - fully matte
                ];

                // Fill each tile region with its roughness value
                for (let i = 0; i < NUM_TILES; i++) {
                    const roughness = tileRoughness[i] !== undefined ? tileRoughness[i] : 255;
                    const grayValue = roughness;
                    roughnessCtx.fillStyle = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
                    roughnessCtx.fillRect(i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
                }
```

**After** (keeps the surrounding `roughnessCanvas` creation at 30302–30305 and the `new THREE.CanvasTexture(roughnessCanvas)` at 30337 untouched):

```js
                // --- PER-PIXEL ROUGHNESS: derive each texel from its painted albedo ---
                // 255 = matte, 0 = mirror. MAT_PROFILES tiles get base + accent overrides;
                // unlisted tiles stay matte. atlasData (read ~30209) is the painted atlas.
                for (const prof of Object.values(MAT_PROFILES)) {
                    if (prof.keys) for (const k of prof.keys) {
                        k.rgb = [parseInt(k.hex.slice(1, 3), 16), parseInt(k.hex.slice(3, 5), 16), parseInt(k.hex.slice(5, 7), 16)];
                    }
                }
                const rImg = roughnessCtx.createImageData(roughnessCanvas.width, roughnessCanvas.height);
                const rData = rImg.data;
                for (let p = 0; p < rData.length; p += 4) {
                    const tile = (((p >> 2) % cvs.width) / TILE_SIZE) | 0;
                    const prof = MAT_PROFILES[tile];
                    let rough = 255;
                    if (prof) {
                        rough = prof.base;
                        if (prof.keys) {
                            const cr = atlasData[p], cg = atlasData[p + 1], cb = atlasData[p + 2];
                            for (const k of prof.keys) {
                                if (Math.abs(cr - k.rgb[0]) + Math.abs(cg - k.rgb[1]) + Math.abs(cb - k.rgb[2]) <= 8) { rough = k.r; break; }
                            }
                        }
                    }
                    rData[p] = rData[p + 1] = rData[p + 2] = rough; rData[p + 3] = 255;
                }
                roughnessCtx.putImageData(rImg, 0, 0);
```

*Correctness:* `rData` and `atlasData` are the same dimensions (roughness canvas = atlas canvas), so index `p` aligns 1:1. `((p>>2) % cvs.width) / TILE_SIZE | 0` is the tile column. Runs once at load; the key-RGB parse is hoisted out of the pixel loop. No new texture/sampler.

#### Change C — extend the existing `applyCylindricalFog` `onBeforeCompile` (chunk-only)

This function is applied **only** to `chunkMaterial` (~line 31175), so it's the right place. Three small additions:

**C1** — register the live uniform + stash the shader handle. Insert right after line **30839** (`shader.uniforms.tileWidth = { value: 1.0 / NUM_TILES };`):

```js
                        // Live per-pixel shininess strength (0 = matte everywhere, 1 = full baked map).
                        shader.uniforms.uShininessStrength = { value: SETTINGS.specularEnabled ? SETTINGS.specularIntensity : 0.0 };
                        material.userData.shader = shader; // handle so updateLightingMaterials can poke the uniform live
```

**C2** — declare the uniform in the fragment shader. The block at **30857–30863** already injects `uniform float tileWidth;`; add one line:

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

**C3** — scale roughness toward matte by strength. Add a new replace after C2 (order vs. the blocky-shadow block doesn't matter):

```js
                        // roughnessFactor is set by the stock <roughnessmap_fragment> chunk
                        // (= roughness * roughnessMap.g). Lerp it toward 1.0 (matte) by strength.
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <roughnessmap_fragment>',
                            `#include <roughnessmap_fragment>
                            roughnessFactor = mix(1.0, roughnessFactor, uShininessStrength);`
                        );
```

*Correctness:* verified there is **no existing replace of `#include <roughnessmap_fragment>`** in the file (no collision), and `roughnessFactor` is the stock variable name three.js r160 emits from that chunk. The `<roughnessmap_fragment>` include is present because `chunkMaterial` sets a `roughnessMap` (`USE_ROUGHNESSMAP`); if the map were ever removed, the replace simply no-ops (safe). Custom uniforms added in `onBeforeCompile` are uploaded every frame, so updating `.value` needs no recompile.

#### Change D — make `updateLightingMaterials` drive the uniform (fixes the off-state bug)

**Before** (lines **31218–31228**):

```js
                    if (chunkMaterial) {
                        // Specular/roughness settings
                        if (SETTINGS.specularEnabled) {
                            chunkMaterial.roughness = SETTINGS.specularRoughness;
                            chunkMaterial.metalness = (1.0 - SETTINGS.specularRoughness) * 0.3;
                        } else {
                            chunkMaterial.roughness = 1.0;
                            chunkMaterial.metalness = 0.0;
                        }
                        chunkMaterial.needsUpdate = true;
                    }
```

**After**:

```js
                    if (chunkMaterial) {
                        // Per-pixel roughnessMap is authoritative; scalars stay neutral (no env map ⇒ metalness 0).
                        chunkMaterial.roughness = 1.0;
                        chunkMaterial.metalness = 0.0;
                        // Live shininess strength: master off ⇒ 0 (matte). No needsUpdate — a uniform
                        // upload is per-frame; recompiling here would hitch on every slider tick.
                        const strength = SETTINGS.specularEnabled ? SETTINGS.specularIntensity : 0.0;
                        if (chunkMaterial.userData.shader) {
                            chunkMaterial.userData.shader.uniforms.uShininessStrength.value = strength;
                        }
                    }
```

*Why this is the fix:* the old "off" path left `roughness = 1.0` while the map still holds low-roughness texels (glass ≈ 0.08), so glass stayed shiny with specular disabled. Routing the off-switch through `uShininessStrength = 0` forces a true matte. Dropping `needsUpdate = true` removes a full shader recompile on every change (the scalars are uniforms; no recompile needed). The water branch below (uses `specularRoughness` at line 31234) is **unchanged** — that setting is kept for water, only demoted for terrain.

#### Change E — settings: new default + retire `specularShininess`

- **Default strength → 0.6 (subtle placeholder; Kandler re-tunes in-game):** change `specularIntensity: 0.5,` at **line 6268** (`DEFAULTS`) and the savedSettings fallback `… : 0.5,` at **line 6013** (`SETTINGS`) to `0.6`.
- **Retire `specularShininess`** (decision #4 — never consumed by any shader): remove its `DEFAULTS` entry (line **6269**), `SETTINGS` init (line **6014**), reset line (~**28494**), the DOM input + `change` listener (~**23330**), and its row in the Specular settings group (~**2841**). Mechanical; no behavior depends on it.
- **`specularRoughness` / `specularFresnel`:** leave as-is for now — `specularRoughness` still drives water (31234); `specularFresnel` waits for Phase 2c.

> **As-shipped note:** the strength default above was raised from 0.6 to **1.0** and the slider range opened to **0–2** after in-game review — see §0.2.

### 5.4 Fresnel rim for glass (Phase 2c sketch)

Inside the existing `chunkMaterial.onBeforeCompile`, after lighting, add a rim term and a per-fragment "is this a glass texel?" test (cheapest: detect via the bound roughness sample being below a threshold, or pass a small flag through vertex color/UV). Pseudocode:

```glsl
float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0); // grazing-angle brightening
// gate to low-roughness (glassy) fragments so dirt doesn't get a rim:
float glassy = 1.0 - smoothstep(0.05, 0.25, roughnessFactor);
gl_FragColor.rgb += fres * glassy * uFresnelStrength * sunGlintColor;
```

`sunGlintColor` is a uniform of the **separate water shader** (defined ~line 30437, synced from `sun.color * min(1, sun.intensity)` ~line 43371). The chunk shader can't read it directly; Phase 2c would add its own `uGlintColor` uniform to the chunk material fed from the same source. *(Phase 2c is a future sketch — not part of the v1 ship and not given exact diffs here.)*

---

## 6. Performance & risk

| Item | Cost | Notes |
|---|---|---|
| Per-pixel roughness map (P1) | **~Zero runtime** | Same single sampler already in the material; only build-time loop changes (runs once at load). Map is mipmapped like albedo. |
| `updateLightingMaterials` change (P1) | Zero | Fewer scalar writes, not more. |
| Fresnel rim (P2a) | Tiny | A few ALU ops in a shader that already runs `onBeforeCompile`. |
| Separate glass material (P2b) | Moderate | +1 draw call per chunk containing glass; breaks single greedy mesh. Avoid unless needed. |
| `metalnessMap` (P3) | +1 texture fetch in chunk FS | Minor; only worth it with an env map. |
| `scene.environment` PMREM (P3) | Moderate, amortizable | Regenerate on a timer, not per-frame. Quality-profile gated. |

**Risks / watch-items**

- **The `updateLightingMaterials` overwrite** is the #1 gotcha — if not changed, Phase 1 appears to "do nothing" because the flat scalar logic is replaced but the map variation still gets multiplied. (Section 8 verifies.)
- **Blocky-shadow injection** (`onBeforeCompile`) modifies diffuse; confirm specular highlight survives for low-roughness pixels (Section 8).
- **No env map** means metalness ≈ darkening — keep metal at 0 until Phase 3, or shiny pixels look dirty, not bright.
- **Over-shine** on organics (grass/leaves) reads as plastic — keep their deltas small (Section 4).
- **`alphaTest` on cutout tiles** (glass/leaves/fire): the roughness map's values under transparent texels don't matter (discarded), but keep the map opaque to avoid mipmap bleed — mirror the existing albedo dilation if glints appear at cutout edges.

---

## 7. Single-file / worker / determinism checklist

- [ ] All changes stay in `voxEx.html` (single-file rule). ✅ design touches only `initTextures` + `updateLightingMaterials` (+ optional `onBeforeCompile`).
- [ ] **No worker parity needed** — `initTextures` and materials are main-thread only; workers do terrain/meshing and never touch the atlas.
- [ ] Texture generation already seeded/deterministic where it matters; the roughness pass is a pure function of `atlasData` (deterministic by construction).
- [ ] New settings (if Phase 4) get defaults in `DEFAULTS` (~line 6267 block), wire into `SETTINGS` (~line 6012 block), DOM binding in the Specular group (~line 2841 / 23321), and round-trip via `saveSettings()`.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` banner.

## 8. Verification plan

1. **Visual A/B:** stand on stone at low sun angle — dark flecks should glint and sweep as time advances (`btn-time-*`), matrix stays matte. Repeat for dirt/gravel pebbles and snow sparkle.
2. **Glass:** place a glass wall, orbit/rotate sun — expect a moving highlight + brighter edges; compare against dirt (should stay flat).
3. **Regression — the overwrite:** confirm with specular **on** that terrain is no longer uniformly semi-gloss (the current `roughness 0.5` look) and that matte blocks are actually matte.
4. **Specular survives blocky shadows:** toggle `SETTINGS.blockyShadows` and confirm low-roughness pixels still show a highlight.
5. **Perf:** O-overlay FPS unchanged within noise vs. baseline (Phase 1 should be free).
6. **Profiles:** Performance profile = matte; Quality = full effect (+env if Phase 3).
7. Run `tools/voxex-tests.html` (~204 tests) — no texture/atlas regressions; optionally extend `voxex-texture-tests.html` to assert the roughness map has intra-tile variance for stone/dirt/gravel/snow/glass and is flat for grass/bark.

## 9. Source cross-reference (verify before editing — line numbers drift)

| Thing | ~Line |
|---|---|
| `TILE` index map / `NUM_TILES = 33` | 4141 / 4168 |
| `initTextures()` | 29393 |
| `fillLogicalPixel` helper | 29407 |
| Grass top/side draw | 29708 / 29726 |
| Dirt draw (`dirtColors`, grit `#795548`) | 29702 / 29792 |
| Stone draw (flecks `#505050`,`#6b6a6a`,`#78909c`) | 29812 |
| Plank / log / leaf / bedrock / log-top / sand | 29835 / 29864 / 29899 / 29933 / 29963 / 29985 |
| Snow (sparkle `#FFFFFF`) / gravel (pebbles `#9E9E9E`,`#8B8B8B`) | 30055 / 30081 |
| Glass draw (`#cfe8ef`,`#9fc4cf`,`#e8f7fb`) | 30152 |
| Atlas pixel readback `atlasData` | 30209 |
| **Roughness map build (flat — the thing to extend)** | 30299–30339 |
| `chunkMaterial` (MeshStandardMaterial, roughnessMap) | 30341 |
| Water materials (separate, already shiny) | 30366 / 30382 |
| `applyCylindricalFog` onBeforeCompile (fog/blocky/specular note) | 30836 / 30985 |
| **`updateLightingMaterials` (overwrites roughness/metalness)** | 31217 |
| Sun/moon/ambient lights | 27056 / 27063 / 27070 |
| Specular settings group (UI) | 2841 |
| Specular settings defaults / wiring | 6012 / 6267 / 23321 |
| `sunGlintColor` reuse (water path) | 43371 |
| `registerPixelTexture` (filters/mipmaps) | 9721 |

---

## 10. Open questions — RESOLVED

All four are answered in **Section 0 (Decisions, 2026-06-19)**:

1. **Scope for v1** → Phase 1 only; test, then narrow before deciding on Phase 2+.
2. **Env map** → wanted, but ship behind a non-default toggle and prove it in-game first.
3. **Glint intensity** → subtle default, with a live strength slider so Kandler sets the real default after playtesting.
4. **Dead settings** → repurpose `specularIntensity` (strength) + `specularFresnel` (glass), retire `specularShininess`, demote `specularRoughness`.

**Remaining for implementation time (not blocking):** the exact baked roughness numbers in Section 4 are first-pass targets — expect to re-tune once the strength slider is in-game.
```

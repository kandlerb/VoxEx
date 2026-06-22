# CCR — Chunk Geometry VRAM Reduction: Attribute Packing (Phase 1) + Idle Pool Drain (Phase 2)

**ID:** VOXEX-CCR-VRAM-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** Phase 1 IMPLEMENTED in `voxEx.html` build **2026-06-22.4** (terrain only; water packing remains Phase 1.5, Phase 2 deferred). One plan correction surfaced during implementation — see the **vColor vec4** note below. Phase 2 sections remain proposal-only.
**Scope:** Reduce the engine's single largest, render-distance²-scaling GPU memory consumer — chunk **terrain** (and later **water**) geometry — by two compose-cleanly levers:

- **Phase 1 (recommended first) — Attribute packing.** Store baked vertex `color` and greedy-quad `quadSize` as small integer types instead of `Float32`, cutting terrain geometry from **184 → 136 bytes/face (~26%)** with **zero visible change**. Affects **every** buffer (active + idle); deterministic. The terrain color pack runs **in the worker** (streaming hot path stays off the main thread) — see Phase 1 §B1.
- **Phase 2 (deprioritized companion) — Idle pool drain.** Release idle GPU memory held by `GeometryBufferPool`, which today keeps up to 32 released geometries per tier and **never disposes one until the pool overflows**. Affects **idle** buffers only; runtime-dependent.

> **Merge note:** this CCR absorbs the former standalone `CCR-geometry-pool-idle-vram.md` (VOXEX-CCR-VRAM-002). The two were always explicit companions on the same subsystem (`GeometryBufferPool`), the same per-face byte formula, the same `MemoryBudgetManager`/`gpuGeometriesMB` metric, and the same 4 GB-Quadro target. They are folded here as Phase 1 (packing) and Phase 2 (drain). They **compose** — packing shrinks every buffer ~26% so the idle-pool ceiling drops with it; neither blocks or depends on the other. Phase 1 is the higher-ROI lever and is the recommendation; Phase 2 is documented so it can be picked up later without re-deriving it.

> Line numbers are as of the working tree on **2026-06-22** and **will drift** — grep the quoted identifier/string before editing, per repo convention.

---

## Why this matters most (shared rationale)

On the target hardware (NVIDIA Quadro P1000, **4 GB VRAM**), geometry VRAM is the resource that trips `MemoryBudgetManager` (~line 18714) into **automatically reducing render distance** under pressure. Both levers raise the render-distance ceiling before that downscaling kicks in — a user-visible quality win on exactly the device the project optimizes for. Packing also shrinks every per-chunk GPU buffer upload by ~26%, easing the batched-upload `requestAnimationFrame` stalls documented in `CCR-idle-streaming-remesh-reduction.md` (CCR-CHUNK-002); the worker-side color pack further shrinks the zero-copy `Transferable` (terrain color goes 12 B/vert Float32 → 4 B/vert Uint8 RGBA, a 3× cut on the color payload).

A documented nuance ties both phases together: **idle pooled geometries are counted by the authoritative memory-pressure metric.** `MemoryBudgetManager.update()` builds `totalMB` from `gpuGeometriesMB = renderer.info.memory.geometries × avgGeoSizeMB` (line 20308), and Three.js counts a geometry from its first render until `geometry.dispose()` — a pooled-but-not-disposed geometry **stays counted**. (Corroborated by line 20340, which deliberately excludes `geometryPoolMB` from the total *"to avoid double-counting"* against `gpuGeometriesMB` — only sensible if the pool's geos are already inside `gpuGeometriesMB`.) So both shrinking each buffer (Phase 1) and draining idle buffers (Phase 2) free real VRAM **and** lower the metric that triggers the render-distance cut.

---

# Phase 1 — Attribute Packing (RECOMMENDED, highest-confidence)

## Summary

- **What:** every chunk vertex stores its baked light/AO `color` as **3 × Float32 (12 B)** and its greedy-quad `quadSize` as **2 × Float32 (8 B)** — both grossly over-precise. Repacking `color` → **Uint8 RGBA (normalized, 4 B)** and `quadSize` → **Uint16 (4 B)** cuts terrain geometry **184 → 136 bytes/face (−26.1%)** with **zero visible change**.
- **Why RGBA (4 B) and not RGB (3 B):** a `Uint8 × 3` color is a **3-byte vertex stride**, which is not 4-byte aligned. Misaligned vertex attributes can trip a driver/ANGLE **slow path** (a silent per-upload repack) on some backends — and these geometries use `DynamicDrawUsage` (re-uploaded on every remesh), so any such repack recurs. Padding to `Uint8 × 4` (RGBA, normalized) makes the stride 4-byte aligned at a cost of **+1 B/vert** (→ 136 B/face instead of 132, still −26%). The alpha lane is unused (written `255`); it's free headroom for a future per-vertex flag. This is what Three.js's own color handling and glTF loaders do.
- **Why it's safe:**
  - `color` is baked light × AO, always in **[0, 1]** (`vertexColor = AO × (lightLevel/15)`). 8-bit normalized (256 levels) is effectively lossless — vertex light is already quantized to ~15 sky levels × a few AO values, far fewer than 256 distinct products. `MeshStandardMaterial { vertexColors: true }` reads normalized `Uint8` RGBA color natively (the standard glTF vertex-color format); itemSize 4 with `vertexColors` is read as RGBA with the alpha used as vertex alpha (always 1.0 here, so visually inert).
  - **⚠️ vColor becomes vec4 (plan correction — one GLSL edit IS required).** The original plan said color needs *no* GLSL change. That holds for the STOCK three.js color chunks, but is **wrong for this material's custom injections**: itemSize 4 makes three.js define `USE_COLOR_ALPHA`, so the stock `vColor` varying switches from **vec3 → vec4**. `applyCylindricalFog`'s two custom reads (`dot(vColor, vec3(0.3333))` — the env-reflection sky-exposure gate and the dynamic-light occlusion gate) then become `dot(vec4, vec3)` → **silent shader compile failure**. Fix applied: both reads now use `dot(vColor.rgb, ...)`, which is valid whether `vColor` is vec3 (glass, still itemSize 3) or vec4 (terrain) — so the shared fog path stays correct for both. The stock `diffuseColor *= vColor` path is unaffected (alpha = 1.0). No other `vColor` reader touches the terrain material (water/particle/star/sky `vColor`s are separate attributes/materials).
  - `quadSize` holds integer block-spans of greedy-merged quads. A vertical wall quad on an **unbanded full-column** chunk can be up to **320** tall, so **Uint8 (max 255) would overflow** — `Uint16` (max 65535) is required and exact. The shader consumes it as a `vec2` float via auto int→float conversion in the vertex fetch, so **no GLSL change is needed**.
- **The one trap (must be handled at every write site):** today the apply path copies **Float32** color data into the pooled attribute with `colAttr.array.set(srcFloat)`. `Uint8Array.prototype.set` on `[0,1]` floats **truncates toward zero → every color becomes 0 (a black world)**, so a plain `.set()` cannot be reused — the convert must be an explicit per-vertex `×255` pack. There are **two** twists vs. a naïve retype: (1) the source is **RGB** (3/vert) but the destination is now **RGBA** (4/vert), so the pack is a 3→4 **expansion** that writes `alpha = 255`; (2) because the per-vertex component count changes 3→4, the `addUpdateRange` element counts on the main-thread sites scale by **4/3** (see B3/B5). For the **streaming hot path** the pack runs **in the worker** (it emits Uint8 RGBA directly), so the main-thread apply for worker chunks stays a native byte `.set()` — see B1.

## Current geometry layout (verified against source)

### Terrain — `GeometryBufferPool._createTerrainGeometry()` (lines 19888–19933)

```js
const posArray      = new Float32Array(maxVerts * 3);
const uvArray       = new Float32Array(maxVerts * 2);
const colArray      = new Float32Array(maxVerts * 3);   // <-- 12 B/vert, holds [0,1]
const quadSizeArray = new Float32Array(maxVerts * 2);   // <-- 8 B/vert, holds integers 1..320
const idxArray      = new Uint32Array(maxIndices);

const colAttr      = new THREE.Float32BufferAttribute(colArray, 3);
const quadSizeAttr = new THREE.Float32BufferAttribute(quadSizeArray, 2);
```

There is **no normal attribute** — chunk materials use `flatShading` and derive normals in-shader via `dFdx/dFdy` (line 19895). Per-vertex/per-face bytes today:

| Attribute | Type | Bytes/vert | Notes |
|-----------|------|-----------:|-------|
| `position` | Float32 × 3 | 12 | block-corner coords; keep (Phase 3 candidate) |
| `uv` | Float32 × 2 | 8 | atlas tile UV; keep (Phase 3 candidate) |
| `color` | **Float32 × 3** | **12** | baked light × AO ∈ [0,1] → **Uint8 RGBA normalized = 4 B** (4-byte aligned; alpha lane = 255) |
| `quadSize` | **Float32 × 2** | **8** | integer block-spans → **Uint16 = 4 B** |
| **vertex total** | | **40** | → **28** proposed |
| index (per face) | Uint32 × 6 | 24 | shared; Phase 3 candidate (Uint16) |
| **per face (4v + 6i)** | | **184** | → **136** proposed (**−26.1%**) |

The byte formula is documented at line 6795 (`pos 3 + uv 2 + color 3 + quadSize 2`), matching the file's own accounting. **On implementation, update that comment and the per-geometry byte formula at line 6799** to the packed layout (`pos 12 + uv 8 + color 4 (RGBA u8) + quadSize 4 (u16) + index 24 = 136 B/face`) so the in-file accounting doesn't drift from reality.

### How `quadSize` is consumed by the shader (lines 31141–31172, 31400–31414)

```glsl
attribute vec2 quadSize;
varying   vec2 vQuadSize;
// vertex:   vQuadSize = quadSize;
// fragment: float tiledU = fract(localU * vQuadSize.x);
//           float tiledV = fract(localV * vQuadSize.y);
```

`vQuadSize` is a per-quad tile-repeat count, always a positive integer. A **non-normalized** integer attribute is converted to float by the GL vertex fetch, so the shader receives `1.0 .. 320.0` unchanged — **no GLSL edit**. (`normalized` MUST be `false` for `quadSize`; see "Two load-bearing flags".)

## The Float32 → Uint8 `.set()` trap (the make-or-break detail)

`TypedArray.prototype.set(src)` performs an **element-type conversion**, not a bitwise copy. Writing `[0,1]` floats into a `Uint8Array` invokes `ToUint8` (truncate toward zero), so `0.83 → 0`, `0.2 → 0` — the entire color buffer becomes zeros and the world renders **black**. (Note: a native `.set()` IS correct when **both** sides are `Uint8` — that's exactly why the worker emitting bytes lets its apply stay a plain `.set()`; see B1.) For `quadSize`, the float→`Uint16Array` conversion is *exactly what we want* (`16.0 → 16`, `320.0 → 320`), so `quadSize` needs **no convert** — only the attribute retype. A **Float32 RGB → Uint8 RGBA** color buffer needs an explicit `×255` **expand-pack** (3 components in, 4 out, alpha = 255):

```js
// dst: Uint8Array RGBA (4/vert); src: Float32 RGB [0,1] (3/vert); nVerts: vertex count
function packColorRGBA8(dst, src, nVerts) {
    for (let v = 0; v < nVerts; v++) {
        const s = v * 3, d = v * 4;
        let r = (src[s]     * 255 + 0.5) | 0; if (r > 255) r = 255;   // round + clamp
        let g = (src[s + 1] * 255 + 0.5) | 0; if (g > 255) g = 255;
        let b = (src[s + 2] * 255 + 0.5) | 0; if (b > 255) b = 255;
        dst[d] = r; dst[d + 1] = g; dst[d + 2] = b; dst[d + 3] = 255;  // alpha lane unused
    }
}
```

The clamp is cheap insurance: source color is `AO × cl ≤ 1.0` everywhere today, but a future emissive/boost write `>1.0` would *wrap* in a `Uint8Array` and produce a garish wrong color rather than a clamped white. The branch prevents that class of regression for free. The **identical** routine is used by the worker (emitting its transferable, off the main thread) and by the main-thread mesher at B3; the refill path (B5) inlines the same round/clamp because it computes the grayscale value per corner rather than reading an RGB source.

## Change sites (COMPLETE enumeration — all paths into the pooled attributes)

There are **two mesh-build paths** that fill these pooled attributes (the off-thread worker path and the main-thread path for edited/banded/glass/torch chunks) **plus** one light-only refill path. Covering only the worker path would leave every **edited or banded** chunk rendering black. With decision (b), the **worker path packs in the worker**; the two main-thread paths pack inline.

### A. Attribute allocation (retype here)
- **A1 — terrain pool**, `_createTerrainGeometry` (lines 19900–19908, 19919–19920):
  - `colArray` → `new Uint8Array(maxVerts * 4)` (**RGBA**); `colAttr` → `new THREE.Uint8BufferAttribute(colArray, 4, /*normalized*/ true)`.
  - `quadSizeArray` → `new Uint16Array(maxVerts * 2)`; `quadSizeAttr` → `new THREE.Uint16BufferAttribute(quadSizeArray, 2, /*normalized*/ false)`.
  - Keep `setUsage(THREE.DynamicDrawUsage)` and `setAttribute(...)` lines unchanged.

### B. Color write sites (`quadSize` `.set()` left as-is at every site)
- **B1 — worker apply, terrain** `applyWorkerMeshData` (line 19625): **apply site is unchanged** — `colAttr.array.set(terrain.colors)` stays, because the **worker now emits `terrain.colors` as a `Uint8Array` RGBA (4/vert)** so this is a native byte→byte copy (no truncation, no JS loop on the main thread). The work moves into the worker mesher: after its Float32 RGB color scratch is built, run one `packColorRGBA8`-equivalent expand-pass into a `Uint8Array(verts*4)` and post **that** as the transferable (color payload shrinks 3×). The update-range entry `[colAttr, terrain.colors.length]` (line 19627) stays correct — `terrain.colors.length` is now `verts*4`, matching the dest. (`qsAttr.array.set(terrain.quadSize)` unchanged — Uint16 conversion is correct.) *Worker-parity note:* this is generated-worker code; if the pack lives in an injected function keep it single-source, otherwise it is hand-maintained worker code — verify it matches `packColorRGBA8`.
- **B2 — worker apply, water** (line 19652): `colAttr.array.set(water.colors)` **unchanged**. *(Water color retype is Phase 1.5; water geometry stays Float32 RGB in Phase 1, so the worker keeps emitting Float32 water color.)*
- **B3 — main mesher, terrain** `_renderChunkImpl`/`flushBand` (line 41577): `colAttr.array.set(terrainCols.subarray(0, tCIdx))` → `packColorRGBA8(colAttr.array, terrainCols, tCIdx / 3)` (the source `terrainCols` is Float32 RGB; `tCIdx` is its filled **element** count, so `tCIdx/3` = vertex count). The matching `colAttr.addUpdateRange(0, tCIdx)` (line 41592) → `addUpdateRange(0, (tCIdx / 3) * 4)` (RGB→RGBA scales the element count by 4/3). (`quadSizeAttr.array.set(...)` and its update range at line 41578/41596 unchanged.) This path fires only for **edited/banded/glass/torch** chunks (lower frequency than streaming), so a main-thread pack here is acceptable.
- **B4 — main mesher, water** (line 41661): `colAttr.array.set(waterCols.subarray(0, wCIdx))` **unchanged**. *(Water — Phase 1.5.)*
- **B5 — light-only refill** `refillChunkLightColors` (line 40987): the direct grayscale write `const o = q*12 + k*3; colArr[o]=c; colArr[o+1]=c; colArr[o+2]=c;` (where `c = lm.ao[...] * cl[k] ∈ [0,1]`) → **RGBA stride**: `const o = q*16 + k*4; const v=(c*255+0.5)|0; const cb=v>255?255:v; colArr[o]=cb; colArr[o+1]=cb; colArr[o+2]=cb; colArr[o+3]=255;`. The matching `colAttr.addUpdateRange(0, lm.quadCount * 12)` (line 40992) → `addUpdateRange(0, lm.quadCount * 16)` (4 verts × **4** comps/quad). **Easy to miss** — it rewrites the existing color attribute in place when only lighting changed (no remesh), so it must convert + restride or relit chunks go black/misaligned.

The remaining `clearUpdateRanges()/needsUpdate` calls are untouched; only the `addUpdateRange` **counts** at B3/B5 change (×4/3 for the RGB→RGBA component bump). B1's update count is unchanged because the worker now supplies a 4/vert array.

### C. Out of scope / confirmed unaffected
- **Glass mesh:** `acquireTerrain` is called from only the two sites above (grep confirms lines 19621, 41564); the translucent glass mesh builds its own geometry and is **not** pooled through `acquireTerrain`, so it keeps Float32 color and is unaffected (attribute types are per-geometry; no uniformity required).
- **Shadow / depth material:** uses position (+ UV alphaTest for cutout), not vertex `color`, so Uint8 RGBA color is invisible to the shadow pass. If the depth material binds `quadSize` for tiling, the Uint16 non-normalized → float auto-convert keeps it correct (chunk meshes set `castShadow`, so verified, not assumed).
- **Worker mesher / Transferables:** **changed for terrain color** — the worker now packs and emits `Uint8` RGBA terrain color (decision b). Water color/attrs are still Float32 in Phase 1. **Save format:** RLE chunk persistence stores **blocks + light**, never geometry, so it is untouched.

### D. Shader edits (REQUIRED by itemSize 4 — the plan-correction)
- **D1 — `applyCylindricalFog` custom fragment injections** (the two `dot(vColor, vec3(0.3333))` reads): change to **`dot(vColor.rgb, ...)`**. Required because itemSize 4 flips the stock `vColor` varying to **vec4** (`USE_COLOR_ALPHA`); `.rgb` is correct for both the terrain material (vec4) and the glass material (vec3, still itemSize 3) that share this fog path. Without it the terrain/glass shaders fail to compile (no console error from the attribute change itself — it shows as a non-rendering or fallback material). This is the single GLSL edit Phase 1 requires; `quadSize` still needs none.

### As-built code sites (build 2026-06-22.4)
- A1 `_createTerrainGeometry`: `colArray`→`Uint8Array(maxVerts*4)`, `colAttr`→`Uint8BufferAttribute(...,4,true)`; `quadSizeArray`→`Uint16Array`, `quadSizeAttr`→`Uint16BufferAttribute(...,2,false)`.
- B1 worker mesh emit: `tColsOut` built as `Uint8Array(tVertsOut*4)` via inline expand-pack (alpha 255); apply site `colAttr.array.set(terrain.colors)` unchanged.
- B3 `flushBand`: `packColorRGBA8(colAttr.array, terrainCols, tCIdx/3)`; `addUpdateRange(0, (tCIdx/3)*4)`.
- B5 `refillChunkLightColors`: stride `q*16+k*4`, alpha 255, `addUpdateRange(0, lm.quadCount*16)`.
- D1 shader: both `dot(vColor.rgb, vec3(0.3333))`.
- New module helper `packColorRGBA8`. Memory-estimate constants `GEO_TIER_*_BYTES` updated `*4*10*4` → `*4*28` (40→28 B/vert).
- Tests (`voxex-tests.html`): the two worker mesh-parity color compares + the refill-parity compare now unpack the Uint8 RGBA (÷255) and compare within `1/255 + slack`, asserting the alpha lane is 255. Verified offline: `node --check` clean on both files; the worker/helper/refill packers are byte-identical and the B3/B5/worker update-range counts all equal `F*16`.

## Two load-bearing flags (state explicitly — silent failure if wrong)

- **`color` → `Uint8BufferAttribute(arr, 4, normalized = TRUE)`.** itemSize **4** (RGBA, 4-byte aligned); the shader must read byte/255 back into [0,1]; with `normalized = false` every lit surface would read 3..255 and blow out to white. The alpha lane must be written `255` (an unwritten/zero alpha would read as vertex alpha 0 — potentially transparent surfaces if any material path consumes vertex alpha).
- **`quadSize` → `Uint16BufferAttribute(arr, 2, normalized = FALSE)`.** The shader needs the literal integer repeat count (1..320); with `normalized = true` it would read ~0.0002..0.005 and the texture tiling would collapse.

All three errors render with **no console error** — they only show as wrong pixels. Call them out in the diff.

## Phase 1 savings (exact per-face anchor; world total illustrative)

The **defensible, exact** figure is per-face: **184 → 136 bytes = −26.1%** of chunk terrain geometry VRAM, and the same fraction off every per-chunk GPU buffer upload. This applies to the **full reserved tier buffer** of every geometry (active *and* pooled-idle), because the GPU allocates each attribute buffer at its tier size on first upload regardless of fill — so the cut is deterministic and pool-wide.

Illustrative world total (depends on actual face counts — read `window._faceCountHistogram` / `window.printFaceHistogram()`): at render distance 12 (~625 chunks in view) averaging ~3 K faces/chunk, geometry drops from ~3 K × 184 B × 625 ≈ **345 MB → ~255 MB**, freeing **~90 MB** — material headroom on a 4 GB GPU and enough to defer `MemoryBudgetManager`'s render-distance cut. Treat the MB as order-of-magnitude; the 26% is the load-bearing claim.

## Phase 1.5 (separable follow-on within packing): water attributes

> The former "worker-emits-bytes" item has been **promoted into Phase 1** for terrain color (decision b) — see B1. Phase 1.5 now covers only the **water** geometry, which stays Float32 in Phase 1.

- Repack water `color` (Uint8 RGBA norm, same 3→4 expand-pack as terrain), and the three single-float water attributes `shoreDist`/`waterThickness` (∈ [0,1] → Uint8 normalized) and `foamEdges` (small land-adjacency value → Uint8; verify the shader read of `foamEdges` is normalize-safe before flipping). Sites B2, B4, and `_createWaterGeometry` (lines 19952–19979). When taken, the worker's **water** color emit moves to bytes too (mirroring the terrain change already shipped in Phase 1), and the water `addUpdateRange` counts scale 4/3 like B3/B5.

## Phase 3 (future, larger but higher-risk): position & index quantization

- `position` → `Uint16` with a per-chunk origin/scale (positions are integer block corners, so lossless), and `index` → `Uint16` (max tier = 16384 faces × 4 = **65536 verts → indices 0…65535**, all representable). Both require injecting a position-decode/format change into **every** chunk material **including the shadow depth material**, so they belong in their own CCR with their own shadow regression pass — not bundled here.

---

# Phase 2 — Idle GeometryBufferPool Drain (DEPRIORITIZED companion)

## Summary

- **What:** `GeometryBufferPool` (class line 19832, instantiated `new GeometryBufferPool(32)` at line 20136) reuses chunk geometries to avoid per-mesh GPU buffer churn. On `releaseTerrain`/`releaseWater` (lines 20049, 20067) a geometry is pushed back to its tier pool **with its GPU buffers intact**; `geo.dispose()` is called **only when the pool is already full** (`pool.length < this.maxPoolSizePerTier` else dispose). There is **no other disposal path** — grep confirms no `drainPool`/`trimPool`/`clearPool`/evict anywhere. So once a pool reaches 32 via streaming churn, it stays at 32, each entry holding a tier-sized buffer, until the page reloads.
- **The opportunity:** strict worst-case (all four pools full) is **~184 MB** of GPU VRAM doing nothing (derivation below) — material on the 4 GB Quadro P1000. The scan's "~192 MB" estimate is the same order; both are the **ceiling, not the expected value**.
- **The pool fills precisely under pressure:** when `_handleWarningMemory`/`_handleCriticalMemory` reduce render distance, the unloaded meshes' geometries flow into `releaseTerrain` and top the pools up to 32/tier. The pressure response then evicts chunk **data** and unloads distant chunk **meshes** — but **never disposes the idle geometry pool**. So idle geometry weight rides in the metric that triggers the cut, yet is never relieved by it. Draining would both free real VRAM and lower the metric.
- **Recommended disposition:** **document and defer.** Ship Phase 1 (packing) first; it deterministically shrinks the same buffers ~26% and covers active geometry too. Pool trimming then composes as a later add-on (preferred form: the pressure-gated drain in *Design option B*).

## Current behavior (verified against source)

### The cap and the only disposal path — `GeometryBufferPool` (lines 19832–20136)

```js
constructor(maxPoolSizePerTier = 32) {
    this.terrainPools = { small: [], medium: [], large: [] }; // 4K / 8K / 16K faces
    this.waterPool = [];
    this.maxPoolSizePerTier = maxPoolSizePerTier;
}
// ...
releaseTerrain(geo) {
    const tier = geo.userData.tier || 'large';
    const pool = this.terrainPools[tier];
    if (pool.length < this.maxPoolSizePerTier) {
        geo.setDrawRange(0, 0);
        pool.push(geo);          // <-- GPU buffers RETAINED, never disposed
    } else {
        geo.dispose();           // <-- only ever disposed on overflow
    }
}
```

`releaseWater` (line 20067) is identical against `this.waterPool`. The cap is applied **per pool**, so the effective ceiling is `32 × (small + medium + large + water)` geometries, not 32 total.

### Per-geometry buffer size (line 6799 formula)

```
bytes/geometry = maxFaces × 4 verts × 10 floats × 4 B   (position3 + uv2 + color3 + quadSize2; no normals)
               + maxFaces × 6 indices × 4 B
             = maxFaces × 184 B            (184 B/face — the figure Phase 1 reduces to 136)
```

| Pool (tier) | Max faces | MB/geometry | × 32 idle |
|-------------|----------:|------------:|----------:|
| terrain small | 4 096 | 0.719 | 23.0 MB |
| terrain medium | 8 192 | 1.438 | 46.0 MB |
| terrain large | 16 384 | 2.875 | 92.0 MB |
| water (≈ large/4) | — | ~0.719 | ~23.0 MB |
| **all four full** | | | **~184 MB** |

(`GEO_TIER_*_MB` at lines 6804–6806 round to ~0.78/1.56/3.12 → the scan's ~192–200 MB. Order ~190 MB ceiling either way.)

## Honest savings (ceiling vs. expected — reinforces the deprioritization)

The **~184 MB is a strict ceiling assuming all four pools sit full**, which they generally do not:
- **The large tier dominates the ceiling (92 of 184 MB) but is the rarest geometry.** Per the file's own distribution note (line 6789, *"~70% small, ~25% medium, ~5% large"*), accumulating 32 idle *large* geometries requires 32 ≥8K-face chunks meshed then released near-simultaneously — an unusual transient, not a steady state.
- **The saving is runtime-dependent** — a function of travel pattern, render distance, and face counts. Contrast Phase 1's −26%, deterministic per face whether active or idle.

So the headline is "**up to ~184 MB at the worst-case ceiling, typically much less**." Phase 1 packing's win is unconditional; that's why packing leads.

## Phase 1 × Phase 2 interaction

If packing ships first, every pooled geometry is already ~136 B/face, so the same all-full ceiling drops from **~184 MB → ~136 MB** and the marginal win from trimming shrinks proportionally. Packing first is strictly higher ROI; trimming is a later add-on layered on the already-smaller buffers — neither blocks nor depends on the other, and the drain/cap logic is attribute-type-agnostic.

## Design options (for the eventual add-on — all main-thread-only, no worker parity)

### Option A — Lower the static cap (smallest, weakest)
Change `new GeometryBufferPool(32)` (line 20136) to a smaller constant, or make the cap per-tier (large needs far less reserve than small).
- **Upside:** caps idle VRAM unconditionally; zero new code paths.
- **Downside:** 32 was sized to absorb streaming-churn bursts during fast travel; a smaller cap raises dispose/recreate frequency in that hot path. **Tune, don't slash:** a per-tier cap (e.g. small 24 / medium 12 / large 6 / water 8) targets cheap-to-recreate tiers generously and the expensive large tier tightly, capping the ceiling near ~60 MB without starving the churn-absorbing small pool.

### Option B — Pressure-gated drain (RECOMMENDED add-on)
Add a `trim(keepPerTier)` / `drainIdle()` method that `pool.pop().dispose()`s each pool down to a small floor, and **call it from `MemoryBudgetManager._handleWarningMemory()` (line 20480) BEFORE the render-distance reduction.** Drain idle VRAM first; only cut render distance if that is insufficient.
- **Upside:** highest value — releases idle VRAM exactly when it matters and, because the idle pool is inside `gpuGeometriesMB`, lowers the pressure metric itself. A small per-tier floor (e.g. 4) preserves most churn absorption; `_restoreQuality` (line 20507) already walks render distance back up when pressure subsides.
- **Timing nuance:** `_cachedUsage.percentage` is computed once per `update()` tick (`updateInterval = 1000 ms`, line 20236) **before** `_checkMemoryPressure` runs, so a drain inside `_handleWarningMemory` relieves memory for the **next** tick. Phrase the benefit as *"can prevent escalation to the critical render-distance cut on a subsequent tick,"* not "averts the cut instantly."
- **Metric-accuracy nuance:** `gpuGeometriesMB` uses a single flat weighted-average size per geometry (line 20305), so a drain's per-tier relief registers only **approximately**. The *real* VRAM is freed exactly; only the estimate is fuzzy.
- **Downside:** churn after the drain if the player keeps moving; mitigated by the floor and by gating strictly on the warning threshold.

### Option C — LRU / TTL idle eviction (most complete, most state)
Stamp each pooled geometry with a release timestamp; in an existing periodic hook (e.g. alongside `checkGeometryLeaks`, line 20150, 5 s interval) dispose entries idle longer than N seconds, down to a per-tier floor.
- **Upside:** releases idle VRAM after travel **stops**, without waiting for pressure.
- **Downside:** most new state (timestamps) + `performance.now()` plumbing; releases memory that may be under no pressure, paying churn speculatively. Lowest priority.

**Recommendation if/when Phase 2 is taken:** Option B (pressure-gated drain with a per-tier floor), optionally with Option A's per-tier caps as a cheap complementary ceiling. Skip C unless idle-after-exploration VRAM proves a measured problem.

## Adjacent latent bug found during audit (fold in or explicitly defer)

`window.memoryDebug.fixLeaks()` (line 12984) iterates `geometryPool.terrainPool` (**singular**) to collect pooled geometries into its keep-set:

```js
for (const geo of geometryPool.terrainPool || []) { activeGeos.add(geo); }   // <-- terrainPool is undefined
```

The field was renamed to `terrainPools` (object of `{small, medium, large}`) — there is no `terrainPool`, so `|| []` makes this a no-op and the three tier pools are **silently skipped**. Consequence: `fixLeaks` undercounts legitimate pooled terrain geometries by up to 96 (3 tiers × 32) and could dispose live pooled buffers as "leaked." The correct read mirrors `checkGeometryLeaks` (lines 20163–20165):

```js
for (const tier of ['small', 'medium', 'large']) {
    for (const geo of geometryPool.terrainPools?.[tier] || []) activeGeos.add(geo);
}
for (const geo of geometryPool.waterPool || []) activeGeos.add(geo);
```

A pool-VRAM change is the natural place to fix it — **either fold this one-liner in or note it as explicitly deferred to its own change.**

---

## Combined safety checks

- **Single-file rule:** all edits confined to `voxEx.html` — Phase 1: pool allocation (color → Uint8 RGBA ×4), the color-write sites (worker emit + B3/B5 inline packs), one new module-scope `packColorRGBA8` helper, and the worker mesher's color-emit pass (generated/injected — keep single-source or verify the hand-maintained copy matches). Phase 2: a cap constant / a `trim`/`drainIdle` method / one call site in `_handleWarningMemory` / the `fixLeaks` field-name fix. No new files/assets.
- **No duplicate/shadowed identifiers:** `packColorRGBA8` (Phase 1) and any `trim`/`drainIdle` (Phase 2) are new names — grep first to confirm uniqueness; locals (`r`, `g`, `b`, `cb`, `v`) are block-scoped. No globals (`scene`, `SETTINGS`, `chunkMeshes`, `geometryPool`) reshadowed.
- **No new DOM/settings:** Phase 1 wires nothing into `DEFAULTS`/`SETTINGS`/UI/save-load. Phase 2's Option A cap *could* optionally surface as a setting, but recommended Option B needs none — it hangs off the existing `enableAutoMemoryScaling`/threshold machinery.
- **Hot-path discipline:** the **streaming** terrain pack runs **in the worker** (off the main thread), so the per-frame/apply main-thread cost for worker chunks is just a native byte `.set()` — strictly cheaper than today's Float32 `.set()`. A main-thread `packColorRGBA8` loop runs only on the **lower-frequency** edited/banded path (B3) and the light-only refill (B5), per chunk, **not** per frame — a single flat `for` loop over the vertex count. (This is the key reason RGBA-in-worker beats a naïve main-thread `Uint8` pack: the original `.set()` was native, and replacing it with a JS loop on the streaming path would have *added* main-thread work — exactly what we avoid by packing in the worker.) Phase 2 draining runs only at the **1 s** memory-budget tick (Option B) or **5 s** leak-check tick (Option C); `dispose()` is O(pool length) ≤ ~96 calls, never in the render loop. Honors the "≤2 nested loops in hot paths" rule.
- **Behavioral/visual parity:** 8-bit normalized color is below the perceptual floor for baked vertex light (~15×AO discrete levels); the RGBA alpha lane is a constant `255` (visually inert); `quadSize` Uint16 is exact for all block-spans ≤ 320. Disposing an *idle* geometry (Phase 2) is invisible — not bound to any mesh. Topology, draw order, transparency, AO, and lighting math byte-for-byte unchanged.
- **Glass / shadows / save:** unaffected (see Phase 1 §C). **Worker:** terrain color emit changes to Uint8 RGBA in Phase 1 (decision b) — water emit and save format untouched. Phase 2 touches no worker/save/lighting/terrain-gen — main-thread-only.
- **Correctness of the Phase 2 metric claim:** the "idle pool inflates `gpuGeometriesMB`" reasoning rests on Three.js counting undisposed geometries in `renderer.info.memory.geometries` — **verify empirically in the test plan** (read the counter before/after a forced drain) rather than shipping on the inference alone.

## Combined test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204–214 tests; serve over localhost; headless via the memory note's puppeteer-core/SwiftShader recipe — expect `214/214 ... All green!`). Meshing/codec coverage exercises the pooled geometry and acquire/release. *In-scope for Phase 1 (decision b):* because the worker now emits **Uint8 RGBA** terrain color, the worker↔main color byte-parity test must switch from a `1e-4` float compare to an **exact integer-byte compare** and account for the **RGB→RGBA expansion** — i.e. apply the same `packColorRGBA8` to the main/headless reference (or compare the worker's post-pack RGBA against a reference-packed RGBA), asserting `alpha === 255`.
- **Visual (Phase 1):** `tools/voxex-texture-tests.html` for atlas sanity, then in-game — confirm terrain lighting/AO gradients, tree-canopy shading, cave darkness floor, and **greedy-tiled textures** (the `quadSize` path) look identical before/after. Specifically exercise all three terrain color paths: stream fresh chunks (worker B1 — the byte-emit path), place/break blocks (main-thread mesher B3 — the 4/3 update-range restride), and toggle a torch / time-of-day (light refill B5 — the RGBA stride rewrite) to confirm no black, blown-out, or misaligned-color chunks. A wrong alpha-lane write would show as unexpectedly transparent terrain — watch for it.
- **VRAM (Phase 1):** before/after `window.memoryBudgetManager.getStatus()` and `window.geometryPool.getStats()` at a fixed render distance + seed; expect terrain geometry bytes down ~26% and the render distance holding higher before auto-downscale on the 4 GB box.
- **Metric-counting verification (Phase 2 — validates the load-bearing inference):** at a fixed seed + render distance, fill the pools (travel to churn meshes, then stop), record `renderer.info.memory.geometries` and `geometryPool.getStats()`; call a forced `drainIdle()`; confirm `renderer.info.memory.geometries` **drops** by the disposed count and `geometryPool.getMemoryUsageMB().total` falls. If the counter does **not** drop, the metric-inflation argument is wrong and Option B's "lowers the pressure metric" benefit must be struck.
- **Churn cost (Phase 2):** with Option B's floor in place, fly continuously at high render distance across a warning-threshold crossing; confirm `geometryPool.getStats().terrainCreated` does not spike pathologically and FPS holds.
- **Pressure-relief behavior (Phase 2):** drive memory to the warning threshold on the 4 GB box; confirm the drain registers on the **next** `update()` tick and, where it brings `percentage` under threshold, the render-distance cut is **not** taken (or taken later/less). Compare `_stats.scaleDownCount` before/after.
- **`fixLeaks` fix (if folded in):** trigger `window.memoryDebug.fixLeaks()` with full pools; confirm pooled terrain geometries are now in the keep-set and not disposed as leaked.
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`).

# CCR — Chunk Geometry VRAM: Pack Vertex Color & quadSize into Small Integer Attributes

**ID:** VOXEX-CCR-VRAM-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** Proposal / report only — no code applied yet. Read & debate first.
**Scope:** Shrink the per-vertex memory of every chunk **terrain** (and, in Phase 2, **water**) mesh by storing two attributes — baked vertex `color` and greedy-quad `quadSize` — as small integer types instead of `Float32`. No change to terrain generation, lighting math, meshing topology, gameplay, or visuals. The greedy mesher, worker transfer, and save format are untouched in Phase 1.

> Line numbers are as of the working tree on **2026-06-22** and **will drift** — grep the quoted identifier/string before editing, per repo convention.

---

## Summary

- **What:** Chunk geometry is the single largest and most scalable GPU memory consumer in the engine (it grows with render-distance²). Today every chunk vertex stores its baked light/AO `color` as **3 × Float32 (12 bytes)** and its greedy-quad `quadSize` as **2 × Float32 (8 bytes)** — both grossly over-precise for the values they hold. Repacking `color` → **Uint8 (normalized, 3 bytes)** and `quadSize` → **Uint16 (4 bytes)** cuts terrain geometry from **184 → 132 bytes/face (~28%)** with **zero visible change**.
- **Why it matters most:** On the target hardware (NVIDIA Quadro P1000, **4 GB VRAM**), geometry VRAM is the resource that trips `MemoryBudgetManager` (~line 18714) into **automatically reducing render distance** under pressure. Cutting ~28% off every chunk's reserved geometry buffer directly raises the render-distance ceiling before that downscaling kicks in — a user-visible quality win on exactly the device the project optimizes for. It also shrinks every per-chunk GPU buffer upload by the same fraction, easing the batched-upload `requestAnimationFrame` stalls documented in `CCR-idle-streaming-remesh-reduction.md` (VOXEX-CCR-CHUNK-002).
- **Why it's safe:**
  - `color` is baked light × AO, always in **[0, 1]** (`vertexColor = AO × (lightLevel/15)`). 8-bit normalized (256 levels) is effectively lossless — vertex light is already quantized to ~15 sky levels × a few AO values, far fewer than 256 distinct products. `MeshStandardMaterial { vertexColors: true }` reads normalized `Uint8` color natively (it is the standard glTF vertex-color format).
  - `quadSize` holds integer block-spans of greedy-merged quads. A vertical wall quad on an **unbanded full-column** chunk can be up to **320** tall, so **Uint8 (max 255) would overflow** — `Uint16` (max 65535) is required and exact. The shader consumes it as a `vec2` float via auto int→float conversion in the vertex fetch, so **no GLSL change is needed**.
- **The one trap (must be handled at every write site):** the apply path copies worker/scratch **Float32** color data into the pooled attribute with `colAttr.array.set(srcFloat)`. `Uint8Array.prototype.set` on `[0,1]` floats **truncates toward zero → every color becomes 0 (a black world)**. The fix is a tiny per-vertex `×255` convert at the **five** color-write sites (enumerated below), *not* in the worker. (Phase 2 optionally moves the conversion into the worker to also shrink the zero-copy transfer.)
- **Recommended fix:** Phase 1 — retype the two pooled terrain attributes and add the color convert at all five sites. Phases 2–3 (water attributes, worker-emits-bytes, position/index quantization) are separable follow-ons.

---

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

There is **no normal attribute** — chunk materials use `flatShading` and derive normals in-shader via `dFdx/dFdy` (already an optimization; noted at line 19895). Per-vertex/per-face bytes today:

| Attribute | Type | Bytes/vert | Notes |
|-----------|------|-----------:|-------|
| `position` | Float32 × 3 | 12 | block-corner coords; keep (Phase 3 candidate) |
| `uv` | Float32 × 2 | 8 | atlas tile UV; keep (Phase 3 candidate) |
| `color` | **Float32 × 3** | **12** | baked light × AO ∈ [0,1] → **Uint8 normalized = 3 B** |
| `quadSize` | **Float32 × 2** | **8** | integer block-spans → **Uint16 = 4 B** |
| **vertex total** | | **40** | → **27** proposed |
| index (per face) | Uint32 × 6 | 24 | shared; Phase 3 candidate (Uint16) |
| **per face (4v + 6i)** | | **184** | → **132** proposed (**−28.3%**) |

The byte formula is documented at line 6795 (`pos 3 + uv 2 + color 3 + quadSize 2`), so this matches the file's own accounting.

### How `quadSize` is consumed by the shader (lines 31141–31172, 31400–31414)

```glsl
attribute vec2 quadSize;
varying   vec2 vQuadSize;
// vertex:   vQuadSize = quadSize;
// fragment: float tiledU = fract(localU * vQuadSize.x);
//           float tiledV = fract(localV * vQuadSize.y);
```

`vQuadSize` is a per-quad **tile-repeat count** (the quad's width/height in blocks). It is always a positive integer. A **non-normalized** integer attribute is converted to float by the GL vertex fetch, so the shader receives `1.0 .. 320.0` unchanged — **no GLSL edit**. (`normalized` MUST be `false` for `quadSize`; see "Two load-bearing flags" below.)

---

## The Float32 → Uint8 `.set()` trap (the make-or-break detail)

`TypedArray.prototype.set(src)` performs an **element-type conversion**, not a bitwise copy. Writing `[0,1]` floats into a `Uint8Array` invokes `ToUint8` (truncate toward zero), so `0.83 → 0`, `0.2 → 0` — the entire color buffer becomes zeros and the world renders **black**. For `quadSize`, the same conversion into `Uint16Array` is *exactly what we want* (`16.0 → 16`, `320.0 → 320`), so `quadSize` needs **no convert** — only the attribute retype. `color` needs an explicit `×255` pack:

```js
// dst: Uint8Array (the pooled color attribute .array); src: Float32 [0,1]; n: element count
function packColor8(dst, src, n) {
    for (let i = 0; i < n; i++) {
        const v = (src[i] * 255 + 0.5) | 0;     // round
        dst[i] = v > 255 ? 255 : v;              // clamp belt: src is ≤1.0 today, but
    }                                            // a Uint8Array silently wraps mod 256
}
```

The clamp is cheap insurance: source color is `AO × cl ≤ 1.0` everywhere today (verified — see Change sites #1–#5), but a future emissive/boost write `>1.0` would *wrap* in a `Uint8Array` and produce a garish wrong color rather than a clamped white. One `Math.min` prevents that class of regression for free.

---

## Change sites (COMPLETE enumeration — all paths into the pooled attributes)

There are **two mesh-build paths** that fill these pooled attributes (the off-thread worker path and the main-thread path for edited/banded/glass/torch chunks) **plus** one light-only refill path. Covering only the worker path would leave every **edited or banded** chunk rendering black — this enumeration is the heart of the CCR.

### A. Attribute allocation (retype here)
- **A1 — terrain pool**, `_createTerrainGeometry` (lines 19900–19908, 19919–19920):
  - `colArray` → `new Uint8Array(maxVerts * 3)`; `colAttr` → `new THREE.Uint8BufferAttribute(colArray, 3, /*normalized*/ true)`.
  - `quadSizeArray` → `new Uint16Array(maxVerts * 2)`; `quadSizeAttr` → `new THREE.Uint16BufferAttribute(quadSizeArray, 2, /*normalized*/ false)`.
  - Keep `setUsage(THREE.DynamicDrawUsage)` and `setAttribute(...)` lines unchanged.

### B. Color write sites (add `packColor8`; `quadSize` `.set()` left as-is)
- **B1 — worker apply, terrain** `applyWorkerMeshData` (line 19625): `colAttr.array.set(terrain.colors)` → `packColor8(colAttr.array, terrain.colors, terrain.colors.length)`. (`qsAttr.array.set(terrain.quadSize)` on the same line is **unchanged** — Uint16 conversion is correct.)
- **B2 — worker apply, water** (line 19652): `colAttr.array.set(water.colors)` → `packColor8(...)`. *(Water color retype is Phase 2; if Phase 1 ships terrain-only, leave B2/water as Float32.)*
- **B3 — main mesher, terrain** `_renderChunkImpl`/`flushBand` (line 41577): `colAttr.array.set(terrainCols.subarray(0, tCIdx))` → `packColor8(colAttr.array, terrainCols, tCIdx)`. (`quadSizeAttr.array.set(...)` at line 41578 unchanged.)
- **B4 — main mesher, water** (line 41661): `colAttr.array.set(waterCols.subarray(0, wCIdx))` → `packColor8(...)`. *(Phase 2.)*
- **B5 — light-only refill** `refillChunkLightColors` (line 40987): the direct write `colArr[o] = c; colArr[o+1] = c; colArr[o+2] = c;` (where `c = lm.ao[...] * cl[k] ∈ [0,1]`) → `const b = (c*255+0.5)|0; const cb = b>255?255:b; colArr[o]=cb; colArr[o+1]=cb; colArr[o+2]=cb;`. **This path is easy to miss** — it rewrites the existing color attribute in place when only lighting changed (no remesh), so it must convert too or relit chunks go black.

Each site already calls `clearUpdateRanges()/addUpdateRange()/needsUpdate` afterward — **leave that untouched**; the update-range counts are element counts, which are identical whether the array is Float32 or Uint8.

### C. Out of scope / confirmed unaffected
- **Glass mesh:** `acquireTerrain` is called from only the two sites above (grep confirms lines 19621, 41564); the translucent glass mesh builds its own geometry and is **not** pooled through `acquireTerrain`, so it keeps Float32 color and is unaffected (attribute types are per-geometry; no uniformity required).
- **Shadow / depth material:** uses position (+ UV alphaTest for cutout), not vertex `color`, so the Uint8 color is invisible to the shadow pass. If the depth material binds `quadSize` for tiling, the Uint16 non-normalized → float auto-convert keeps it correct (chunk meshes set `castShadow`, so this was verified, not assumed).
- **Worker mesher / Transferables / save format:** unchanged in Phase 1 (worker still emits Float32; conversion happens at apply). RLE chunk persistence stores **blocks + light**, never geometry, so the save format is untouched.

---

## Proposed change — phased

**Phase 1 (core, highest-confidence, this CCR's recommendation):** terrain only.
1. Retype the two terrain pool attributes (A1) with the correct `normalized` flags.
2. Add `packColor8` (module-scope helper) and apply it at color sites **B1, B3, B5**.
3. `quadSize` needs no convert — the existing `.set()` into a `Uint16Array` truncates the integer block-spans exactly.

Result: terrain geometry **184 → 132 B/face (−28.3%)**, no shader/worker/save change, no visual change.

**Phase 2 (separable):** water attributes + worker-emits-bytes.
- Repack water `color` (Uint8 norm), and the three single-float water attributes `shoreDist`/`waterThickness` (∈ [0,1] → Uint8 normalized) and `foamEdges` (small land-adjacency value → Uint8; verify the shader read of `foamEdges` is normalize-safe before flipping). Sites B2, B4, and `_createWaterGeometry` (lines 19952–19979).
- Optionally move the `×255` color pack **into the worker mesher** so the zero-copy `Transferable` shrinks too (extra bandwidth win). This drags in the shared `writeFaceColors*` writers, the color scratch pool, and the `voxex-tests.html` worker↔main byte-parity test (its `1e-4` float tolerance becomes an integer-byte compare) — which is exactly why it is **deferred out of Phase 1**, where the VRAM win lives entirely in the pooled GPU attribute type, not in what the worker transfers.

**Phase 3 (future, larger but higher-risk):** position & index quantization.
- `position` → `Uint16` with a per-chunk origin/scale (positions are integer block corners, so lossless), and `index` → `Uint16` (max tier = 16384 faces × 4 = **65536 verts → indices 0…65535**, all representable, so the math works). Both require injecting a position-decode/format change into **every** chunk material **including the shadow depth material**, so they belong in their own CCR with their own shadow regression pass — not bundled here.

---

## Savings (exact per-face anchor; world total illustrative)

The **defensible, exact** figure is per-face: **184 → 132 bytes = −28.3%** of chunk terrain geometry VRAM, and the same fraction off every per-chunk GPU buffer upload. This applies to the **full reserved tier buffer** of every geometry (active *and* pooled-idle), because the GPU allocates each attribute buffer at its tier size on first upload regardless of fill — so the cut is deterministic and pool-wide, and composes with (does not depend on) any future pool-size trimming.

Illustrative world total (depends on actual face counts — read `window._faceCountHistogram` / `window.printFaceHistogram()` for the real distribution): at render distance 12 (~625 chunks in view) averaging ~3 K faces/chunk, geometry drops from ~3 K × 184 B × 625 ≈ **345 MB → ~248 MB**, freeing **~95 MB** — material headroom on a 4 GB GPU and enough to defer `MemoryBudgetManager`'s render-distance cut. Treat the MB as order-of-magnitude; the 28% is the load-bearing claim.

---

## Two load-bearing flags (state explicitly — silent failure if wrong)

- **`color` → `Uint8BufferAttribute(arr, 3, normalized = TRUE)`.** The shader must read byte/255 back into [0,1]; with `normalized = false` every lit surface would read 3..255 and blow out to white.
- **`quadSize` → `Uint16BufferAttribute(arr, 2, normalized = FALSE)`.** The shader needs the literal integer repeat count (1..320); with `normalized = true` it would read ~0.0002..0.005 and the texture tiling would collapse.

Both errors render with **no console error** — they only show as wrong pixels. Call them out in the diff.

---

## Safety checks

- **Single-file rule:** all edits confined to `voxEx.html` (pool allocation, three color-write sites, one new module-scope helper). No new files/assets.
- **No duplicate/shadowed identifiers:** `packColor8` is a new module-scope name (grep first to confirm uniqueness); locals (`b`, `cb`, `v`) are block-scoped at each site. No globals (`scene`, `SETTINGS`, `chunkMeshes`, geometry pool) reshadowed.
- **No new DOM/settings:** nothing to wire into `DEFAULTS`/`SETTINGS`/UI; nothing to round-trip through save/load.
- **Hot-path discipline:** `packColor8` runs only at **mesh-apply** time (per chunk build/relight), **not** in the per-frame render loop, and is a single flat `for` loop over the filled element count (≤ `faceCount × 12`). It replaces a `TypedArray.set` of identical length — same memory-bandwidth order, no nested loops, honors the "≤2 nested loops in hot paths" rule.
- **Behavioral/visual parity:** 8-bit normalized color is below the perceptual floor for baked vertex light (already ~15×AO discrete levels); `quadSize` Uint16 is exact for all block-spans ≤ 320. Topology, draw order, transparency, AO, and lighting math are byte-for-byte unchanged.
- **Glass / shadows / worker / save:** unaffected in Phase 1 (see "Out of scope / confirmed unaffected").

## Test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204 tests, served over localhost; headless via the memory note's puppeteer-core/SwiftShader recipe — expect "All green!"). Meshing/codec coverage exercises the pooled geometry. *Note:* if Phase 2's worker-emits-bytes is taken, the worker↔main color byte-parity test there must switch from a `1e-4` float compare to an integer-byte compare; Phase 1 leaves that test untouched.
- **Visual:** `tools/voxex-texture-tests.html` for atlas sanity, then in-game — confirm terrain lighting/AO gradients, tree-canopy shading, cave darkness floor, and **greedy-tiled textures** (large flat faces must still tile correctly — that is the `quadSize` path) look identical before/after. Place/break blocks (exercises the **main-thread** mesher B3) and toggle a torch / time-of-day (exercises the **light refill** B5) to confirm no black or blown-out chunks on edited/banded/relit chunks specifically.
- **VRAM:** before/after `window.memoryBudgetManager.getStatus()` and `window.geometryPool.getStats()` at a fixed render distance + seed; expect terrain geometry bytes down ~28% and, on the 4 GB box, the render distance holding higher before auto-downscale.
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`).

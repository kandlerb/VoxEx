> **Status: SHIPPED — produced the terrainSurface rewrite; do not re-implement** _(marked 2026-07-06; see CLAUDE.md Documentation Index)_

# VoxEx — Terrain Generation Architecture Plan (proper rebuild)

The "best/most correct" plan for VoxEx terrain. This supersedes the pragmatic `terrain-climate-fields-plan.md`: that one bolted a climate table onto the existing per‑biome height blend; **this one changes the architecture** so terrain shape and biome identity are fully decoupled — the approach used by modern voxel engines (Minecraft 1.18+ "multi‑noise" + terrain splines). It is more code up front, but it removes more code than it adds once consolidated, and it structurally eliminates findings 1, 2, and 6 rather than patching them.

**Reference build:** `VOXEX_BUILD = "2026-06-30.75"` (voxEx.html:4243). Ties back to all 9 findings in `terrain-improvement-opportunities.md` (mapping in §10).

**Working style (per your call):** build it correct and explicit first — separate functions, verbose, easy to reason about and tune — get it right in‑game, *then* compress/consolidate (Phase 5). Don't optimize for line count during the build.

**➡ To implement:** follow `terrain-implementation-guide.md` — a self‑contained, step‑by‑step guide with paste‑ready code and exact insertion points (built for handoff to an implementing agent). This doc is the "why"; the guide is the "how".

---

## 0. The core idea (read this first)

Today VoxEx computes height **per biome**: each biome has a height function (`mountainsHeightFunc`, `plainsHeightFunc`, …), and `sampleBiomeBilinearHeight` (38007) blends 4 neighbouring biome cells over a 64‑block grid. Biome identity therefore *drives* height, which is why:

- biome selection has to be 1‑D and pre‑height (finding 1),
- mountains need a bespoke boolean mask separate from everything (finding 2),
- and biome borders produce height ramps/seams where amplitudes mismatch (finding 6).

**The fix is to invert the relationship.** Terrain height becomes a single **continuous global function of continuous terrain parameters** (continentalness, erosion, peaks‑&‑valleys) via **splines**. Biomes are chosen **afterwards** from a larger set of parameters (those three + temperature + humidity) and are **cosmetic only** — they pick surface blocks, trees, colours, and the snow line, but **never change the height**. A snowy mountain and a warm mountain have identical shape; only the skin differs.

Because height no longer depends on biome, there is no per‑biome blend and therefore no border seam — the single biggest structural win.

---

## 1. Architectural decisions

### 1.1 Decouple shape from biome (the chosen architecture)

| | **A. Decoupled multi‑noise + splines (CHOSEN)** | B. Climate table + per‑biome height (the pragmatic plan) |
|---|---|---|
| Height source | one global continuous spline function of params | per‑biome funcs blended on a grid |
| Biome role | cosmetic skin only | drives height |
| Border seams (finding 6) | eliminated structurally | reduced but still present |
| Mountains (finding 2) | emergent from erosion/PV params | still a special case |
| Code up front | more (splines, param fields, multi‑noise selector) | less |
| Code after consolidation | **less** (deletes bilinear grid, foothills, CDF, mask, per‑biome funcs) | about the same |
| Correctness ceiling | high (industry best practice) | medium |

We choose **A**. It is the correct architecture and the extra up‑front code is offset by large deletions later.

### 1.2 Stay 2‑D heightmap; defer 3‑D density

The "purest" MC approach uses a full **3‑D density function** (enables overhangs, floating islands, noise caves, aquifers). VoxEx is deeply **heightmap‑based**: `heightCache` is a 2‑D `Int16Array` (38918), `fillWaterPass` (39351) and the surface loop iterate columns from a single top‑Y. Converting to 3‑D density would touch meshing, water, lighting, and caves — a separate multi‑month epic with its own risks.

**Decision:** keep the 2‑D heightmap and apply multi‑noise + splines to it. This gets ~90% of the visual benefit at a fraction of the risk. 3‑D density is explicitly **deferred** (§13). Caves stay as the existing 3‑D‑noise carve on top of the heightmap.

### 1.3 Preserve biome *character*, don't throw it away

`mountainsHeightFunc`'s ridged multifractal and the billowy hills noise are good — the problem is that they're *gated to biomes*. In the new model they survive as **detail styles** (ridged vs. billowy) selected continuously by the erosion/PV params (§3.3), so mountainous character appears wherever the params say "mountainous," biome or not.

---

## 2. The parameter fields

Six conceptual parameters (MC uses these); VoxEx needs **five** (we drop `depth`, which only matters for 3‑D density). All are **pure functions of `(gx, gz, seed)`**, low‑frequency, normalized, and cheap. Noise has no seed arg — decorrelate with `seed * k` coordinate offsets (per `perm` seeding at 21323).

| Param | Range | Freq (pre‑BiomeSize) | Role | Replaces / relates to |
|-------|-------|------|------|-----------------------|
| **Continentalness** `C` | −1..1 | ~0.0015 | shape + biome | reuse `continentalHeight` (38155) |
| **Erosion** `E` | −1..1 | ~0.0011 | shape (flatness) + biome | new; subsumes `isMountainRegion` (37973) |
| **Peaks‑&‑Valleys** `PV` | −1..1 | ~0.004 | shape (ridge/valley) + biome | new (derived from a "weirdness" noise) |
| **Temperature** `T` | 0..1 | ~0.0009 | biome + snow line | new |
| **Humidity** `H` | 0..1 | ~0.0011 | biome + vegetation | new |

> `depth` (MC's 6th) is intentionally omitted — it exists to feed the 3‑D density field, which we deferred (§1.2).

Sketches (starting points; tune in the Phase‑0 visualizer):

```js
// Biome Size slider still works: bigger size ⇒ lower freq ⇒ larger provinces.
function paramFreq(base) { return base / (worldConfig.biomeSizeMultiplier || 1); }

// CRITICAL CALIBRATION (see §8.6): VoxEx's noise2D concentrates in ~±0.45 and multi-octave
// fbm2D is NARROWER still (~±0.3). Raw fbm therefore never reaches ±0.8, so any spline domain
// or BIOME_PARAMS target that assumes full −1..1 is unreachable. normField() stretches the
// working range to full −1..1 so the domains/targets below are valid. FIELD_GAIN ≈ 1/0.33;
// verify empirically in the Phase‑0 visualizer (histogram each field) and adjust per field.
const FIELD_GAIN = 3.0;
function normField(v) { return Math.max(-1, Math.min(1, v * FIELD_GAIN)); }

/** Continentalness −1..1. Reuses continentalHeight, which already clamps to −1..1 but skews
 *  POSITIVE (+0.3 bias, 38161) → its usable range is roughly 0..0.7, NOT symmetric. Keep its
 *  own scaling; set SPLINE_CONTINENTAL / BIOME_PARAMS.c to that skewed range, do NOT normField it. */
function continentalness(gx, gz) { return continentalHeight(gx, gz, worldConfig.seed); }

/** Erosion −1..1. HIGH erosion = flatter/eroded; LOW = uneroded/mountainous (MC convention).
 *  NOTE: named `erosionParam`, NOT `erosion` — `erosion` is already a local const inside
 *  continentalHeight (38159); a global `erosion` would shadow it (banned by CLAUDE.md). */
function erosionParam(gx, gz) {
    const s = worldConfig.seed;
    return normField(fbm2D(gx * paramFreq(0.0011) + s * 4.1, gz * paramFreq(0.0011) - s * 2.7, 3, 0.5, 2.0));
}

/** Weirdness −1..1 (normalized so the PV fold below actually reaches its peaks/valleys). */
function weirdness(gx, gz) {
    const s = worldConfig.seed;
    return normField(fbm2D(gx * paramFreq(0.004) - s * 1.3, gz * paramFreq(0.004) + s * 3.9, 4, 0.5, 2.0));
}
/** Peaks & Valleys −1..1: valleys at w≈0, peaks at w≈±2/3 (standard fold). Requires w in full
 *  −1..1 (why weirdness is normField'd) or it stays stuck on one side. */
function peaksValleys(gx, gz) {
    const w = weirdness(gx, gz);
    return 1 - Math.abs(3 * Math.abs(w) - 2);   // −1 (valley) .. +1 (peak)
}

/** Temperature 0..1 (1 = hot); optional latitude banding. normField before mapping so the
 *  full 0..1 range is used (raw fbm would sit ~0.35..0.65). */
function temperature(gx, gz) {
    const s = worldConfig.seed;
    let t = (normField(fbm2D(gx * paramFreq(0.0009) + s * 1.7, gz * paramFreq(0.0009) - s * 0.9, 3, 0.5, 2.0)) + 1) * 0.5;
    // t = t * 0.7 + (0.5 + 0.5 * Math.sin(gz * 0.00035)) * 0.3;   // enable for N–S climate bands
    return Math.max(0, Math.min(1, t));
}

/** Humidity 0..1 (1 = wet). */
function humidity(gx, gz) {
    const s = worldConfig.seed;
    return Math.max(0, Math.min(1, (normField(fbm2D(gx * paramFreq(0.0011) - s * 2.3, gz * paramFreq(0.0011) + s * 1.1, 3, 0.5, 2.0)) + 1) * 0.5));
}
```

---

## 3. Terrain shape — splines + detail (replaces per‑biome height)

A single global function turns the shape params into a height. No biome input.

### 3.1 What a spline is here

A **piecewise‑linear (or Catmull‑Rom) mapping** from one param to a height contribution, defined by a small list of control points. Deterministic, cheap, and — crucially — **the primary tuning surface**. You shape the world by editing control points, not by rewriting noise math.

```js
/** Piecewise-linear spline eval. pts = [[x0,y0],[x1,y1],...] sorted by x. */
function spline(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i][0]) {
            const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
            const t = (x - x0) / (x1 - x0);
            return y0 + (y1 - y0) * (t * t * (3 - 2 * t));   // smoothstep for C1-ish joins
        }
    }
    return pts[pts.length - 1][1];
}

// NEW JS HELPER — `smoothstep` currently exists ONLY inside GLSL shader strings, never in JS.
// The sketches below call it, so it must be defined once (or inline `t*t*(3-2*t)` as the rest
// of the codebase does). Guard against redefinition if a future shared helper is added.
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
```

### 3.2 Base height

```js
// Offsets are in blocks relative to sea level (WORLD_DIMS.seaLevel = 60; yOffset = 0, so height
// is world-Y in [0, 319], matching how heightCache/generateTerrainPass read it today).
// PEAKS max tuned to VoxEx's ACTUAL mountain scale, not the clamp: mountainsHeightFunc produces
// rawHeight = 64 + totalHeight(~1.0) · effectiveAmplitude(180·0.9=162) ≈ 200–250 typical, and only
// RARELY reaches its 285 clamp (38341). So a full peak here should land ~250–265, NOT ~285 — a max
// of ~205 (an earlier draft) would pin most peaks flat against the clamp (mesa tops), unlike today.
// A big peak ≈ 60 + continental(~16) + peaks(1.0)·reliefScale(~0.95) + detail(~14) ≈ ~262.
const SPLINE_CONTINENTAL = [[-1.0,-45],[-0.45,-20],[-0.2,-4],[0.0,3],[0.3,8],[0.6,16],[1.0,28]];
// Keep the NEGATIVE side gentle: deep-ocean floor is owned by getOceanFactor's lerp in
// blendedHeight (it replaces height toward oceanFloor), so a steep negative here would double-carve
// coasts. The negative points mainly shape the shallow coastal shelf.
// Retuned after in-game test + the "interior notch" regression test: shorter peaks (was max 180),
// widened via weirdness freq 0.004→0.0018 (freq = ridge spacing), and RAISED valley floor (was -24)
// so mountain regions are broad elevated massifs, not spires over lowland slots that plunge <78.
const SPLINE_PEAKS       = [[-1.0,28],[-0.4,34],[0.0,42],[0.4,64],[0.8,100],[1.0,135]];
// Erosion → relief scale (HIGH erosion ⇒ flat): multiplies the PV contribution + detail.
const SPLINE_EROSION     = [[-1.0,1.0],[-0.4,0.85],[0.0,0.55],[0.4,0.25],[1.0,0.05]];
const MAX_SURFACE_Y      = 285;   // safety clamp only (matches 38341); should be hit RARELY, not often

function terrainBaseHeight(gx, gz) {
    const C = continentalness(gx, gz);
    const E = erosionParam(gx, gz);
    const PV = peaksValleys(gx, gz);
    const reliefScale = spline(SPLINE_EROSION, E);          // 0..1
    let h = WORLD_DIMS.seaLevel + spline(SPLINE_CONTINENTAL, C)
                                + spline(SPLINE_PEAKS, PV) * reliefScale;
    return { h, E, PV, reliefScale };
}
```

### 3.3 Detail overlay (character, without biomes)

The good parts of `mountainsHeightFunc` (38190) and `hillsHeightFunc` (38175) become **styles** blended by the params — ridged where it's peaky and uneroded, billowy on gentle relief:

```js
const DETAIL_MAX = 18;   // blocks of fine relief at full uneroded mountain

function terrainDetail(gx, gz, E, PV, reliefScale) {
    // PERF: skip the expensive ridged multifractal on flat/eroded terrain. Today plains columns
    // NEVER call mountainsHeightFunc; without this gate they would, adding ~25 noise2D/column.
    const ridgeWeight = smoothstep(0.2, 0.7, PV) * reliefScale;
    const amp = reliefScale * DETAIL_MAX;
    if (amp < 0.5) return 0;                        // essentially flat: no detail, no ridged cost
    const billowy = billowNoise(gx, gz);           // gentle |noise| hills (cheap)
    if (ridgeWeight < 0.02) return billowy * amp;   // no ridge contribution: skip ridged entirely
    const ridged = ridgedMultifractal(gx, gz);     // extracted, cleaned mountain core (finding 3A)
    return lerpValue(billowy, ridged, ridgeWeight) * amp;
}

// Named computeSurfaceHeight, NOT terrainHeight — `terrainHeight` is already a local const in
// getRiverFactor (38471); a global with that name would shadow it (banned by CLAUDE.md).
function computeSurfaceHeight(gx, gz) {
    const { h, E, PV, reliefScale } = terrainBaseHeight(gx, gz);
    const y = h + terrainDetail(gx, gz, E, PV, reliefScale);
    return Math.min(MAX_SURFACE_Y, Math.max(1, Math.floor(y)));   // clamp like today (38341)
}
```

`computeSurfaceHeight` **replaces** the internals of `sampleBiomeBilinearHeight` → `getBiomeHeightAtCell` → `HEIGHT_FUNCS`. `blendedHeight` is KEPT as the public entry point (many external callers — see §8.2) and rewritten to call `computeSurfaceHeight` then carve oceans/rivers exactly as today (§7 Stage 2).

### 3.4 Why the border seam vanishes

`computeSurfaceHeight` is a continuous function of continuous fields. Adjacent columns differ by the smooth gradient of the params — there is no cell grid, no per‑biome amplitude, and nothing to blend. Finding 6 is gone by construction, and `sampleBiomeBilinearHeight`, the 64‑block grid, `MAX_FOOTHILL_RINGS`, and `_FH_NEIGHBORS` are all deleted.

---

## 4. Biome assignment — multi‑noise (cosmetic layer)

Biomes are chosen from the full 5‑param vector and used **only** for surface material, trees, tint, and snow‑line bias. Because the params are all pre‑height, there is **no cycle** (§ two‑temperature rule below).

### 4.1 Declarative biome parameter targets

Each biome declares a target point (and weight) in normalized param space. This replaces `_BIOME_CDF_TABLE` (37944), `uniformBiomeRoll` (37952), `biomeTable`, and the weighted roll in `getRawBiomeParams` (37981). **The `t/h/e/pv` targets below assume the fields are normalized to −1..1 via `normField` (§8.6); `c` uses continentalness's skewed 0..0.7 range.** With raw (un‑normalized) fbm these targets would be unreachable.

```js
// axes normalized to −1..1 (T,H mapped from 0..1). null = "don't care".
const BIOME_PARAMS = {
    //            T      H      C      E      PV
    plains:    { t: 0.1,  h:-0.1, c: 0.3, e: 0.6, pv:-0.2, weight: 2 },
    forests:   { t: 0.0,  h: 0.4, c: 0.4, e: 0.3, pv: 0.0, weight: 2 },
    hills:     { t: 0.0,  h: 0.0, c: 0.4, e:-0.1, pv: 0.4, weight: 2 },
    swamp:     { t: 0.5,  h: 0.8, c: 0.1, e: 0.8, pv:-0.6, weight: 1 },
    longwoods: { t: 0.2,  h: 0.6, c: 0.4, e: 0.4, pv: 0.1, weight: 2 },
    mountains: { t:-0.3,  h:-0.1, c: 0.6, e:-0.8, pv: 0.7, weight: 1 },   // low E + high PV = the mountain skin
    // later: tundra {t:-0.9,...}, desert {t:0.9,h:-0.8,...}
};
```

### 4.2 Selection = nearest target (weighted)

Nearest‑in‑parameter‑space always returns a biome (no gaps, no bands). A linear scan over ~7 biomes is trivial cost.

```js
// Named resolveBiome, NOT selectBiome — `selectBiome(biomeName)` already exists as the
// create-world UI handler (21463). getBiomeParams (KEPT, public) wraps this — see §4.3.
// sq() instead of ** to match codebase style (Math.pow ×24, no ** operator in JS today).
function sq(x) { return x * x; }
const AXIS_W = { t: 1.0, h: 1.0, c: 0.6, e: 1.2, pv: 0.9 };   // erosion/PV weighted so mountain skin tracks shape
function resolveBiome(gx, gz) {
    const T = temperature(gx,gz)*2-1, H = humidity(gx,gz)*2-1;
    const C = continentalness(gx,gz), E = erosionParam(gx,gz), PV = peaksValleys(gx,gz);
    let best = null, bestD = Infinity;
    for (const name in BIOME_PARAMS) {
        const b = BIOME_PARAMS[name];
        let d = AXIS_W.t*sq(T-b.t) + AXIS_W.h*sq(H-b.h) + AXIS_W.c*sq(C-b.c)
              + AXIS_W.e*sq(E-b.e) + AXIS_W.pv*sq(PV-b.pv);
        d /= (b.weight || 1);                 // higher weight ⇒ larger catchment
        if (d < bestD) { bestD = d; best = name; }
    }
    return biomeByName.get(best);
}
```

### 4.3 Sampling granularity

Since biome no longer feeds height, we can sample it **per column** (biome affects only surface/decoration, and a natural hard-ish border there looks fine). Optionally keep a light 8–16‑block quantization for cache cheapness and to smooth tree placement — but the 64‑block bilinear cell grid is **removed**. `getBiomeCellDirect`/`getRawBiomeCellDirect`/foothill rings collapse into `resolveBiome`.

> **KEEP `getBiomeParams(gx, gz)` as the public entry point.** It is called by trees (5621/5701), the player/fog biome lookup (17027), `WorldPreviewRenderer.getBiomeTint` (21875), the worker `biomeCache` (19094), and the test harness (46458). Do **not** rename or remove it — reimplement its body as `return resolveBiome(gx, gz);` (add the optional quantization there). Same rule for `blendedHeight` and `getPreRiverHeight` (§8.2).

`mountain_foothills` as a distinct biome is **retired** — foothills are now just the continuous `reliefScale` mid‑band produced by the erosion spline.

---

## 5. Surface, snow, and vegetation

### 5.1 Two‑temperature rule (no cycle)

- **Climate temperature** `temperature(gx,gz)` — pure noise — used in `resolveBiome` (pre‑height). No cycle.
- **Local temperature** — `climateT − elevationLapse` — computed in the surface pass where final height is known — used only for the snow line:

```js
// generateTerrainPass (38964), per column:
const climT      = tempCache[idx];
const localT     = climT - Math.max(0, worldTopY - WORLD_DIMS.seaLevel) / 220;
// Shift the WHOLE elevation ladder by one temperature offset — NOT just SNOW_LINE.
const bandShift  = Math.round((localT - 0.5) * 80);   // cold/high localT LOW ⇒ shift NEGATIVE ⇒ snow line DROPS ⇒ peaks snowy. (0.5-localT) is INVERTED.
const snowLine       = 190 + bandShift;   // was fixed 190  (38973)
const snowPatchLine  = 160 + bandShift;   // was fixed 160
const highRockLine   = 140 + bandShift;   // was fixed 140
const rockLine       = 110 + bandShift;   // was fixed 110
const alpineLine     =  85 + bandShift;   // was fixed  85
```

> **Do NOT make only `SNOW_LINE` temperature‑relative.** `generateTerrainPass` (38973+) has a cascade of absolute bands (`SNOW_LINE 190 > SNOW_PATCHES_LINE 160 > HIGH_ROCK_LINE 140 > ROCK_LINE 110 > ALPINE_LINE 85`) read as `if (worldTopY >= SNOW_LINE) … else if (>= SNOW_PATCHES_LINE) …`. If only the top band moves, a cold snow line (~110) can fall *below* `SNOW_PATCHES_LINE` and the cascade inverts (snow zone starts under the patches zone). Shift the whole ladder by one `bandShift`, or refactor the cascade to compare against the shifted set.

### 5.2 Per‑biome palette in config

Move surface materials + snow line into `BIOME_CONFIG` (the `BIOME_DEFAULTS` comment at 5341 already lists `snowLine` as intended). The elevation ladder in `generateTerrainPass` becomes a fallback; each biome supplies `surfaceBlock`, `subSurfaceBlock`, `soilDepth`, `snowLineBias`. This is what makes deserts sandy and tundra snowy without code branches (findings 5, 7).

### 5.3 Humidity‑driven vegetation

Multiply tree density by a humidity factor so wet biomes are lush and dry ones sparse — currently a flat per‑biome constant (`getTreeDensityForBiome`).

---

## 6. Rivers and physical erosion (how they fit)

- **Rivers.** Out of scope for the core rebuild but they benefit: with a real continuous height field available pre‑carve, re‑enable a downhill/elevation bias (finding 4A) so channels prefer valleys, then optionally add flow‑accumulation drainage (4B) later. The canyon/tunnel special‑casing shrinks once rivers stop knifing through peaks.
- **Physical erosion ≠ the `erosion` param.** The `E` parameter here is a *macro flatness control* (MC naming). It does **not** move material. A thermal‑erosion **post‑pass** (finding 8) is still a separate, later addition that operates on the finished heightfield to add talus/valley sediment. The two are complementary: `E` decides "is this region rugged," the post‑pass decides "how does rugged material settle."

---

## 7. Full pipeline order — and why

```
Stage 0  PARAMETERS        [NEW]  C, E, PV(weirdness), T, H          pure noise, depend on nothing
            ▼
Stage 1  TERRAIN SHAPE     [NEW]  splines(C,E,PV) + detail → height   GLOBAL, continuous, NO biome
            ▼                     └─ why before biome: shape no longer needs biome; biome will need params only
Stage 2  OCEANS + RIVERS   [same] carve height (getOceanFactor / getRiverFactor)
            ▼
Stage 3  BIOME ASSIGN      [NEW]  resolveBiome(params) — cosmetic      can run parallel to Stage 1; needs params, not height
            ▼
Stage 4  SURFACE FILL      [MOD]  blocks/palette by biome; snow line by LOCAL temp   needs height + biome
            ▼
Stage 5  CAVES             [same] 3D-noise carve on the heightmap
            ▼
Stage 6  DECORATIONS       [MOD]  trees by biome × humidity
            ▼
Stage 7  LIGHTING          [same]
```

The ordering is forced by dependencies: **parameters depend on nothing → shape depends on parameters → biome depends on parameters (not height) → surface depends on height + biome.** The removal of the "height depends on biome" edge is the whole point — it's what breaks the old constraints.

---

## 8. Code architecture & insertion points (`voxEx.html`)

### 8.1 New functions / data (final, collision‑checked names)

- Helpers: `smoothstep` (NEW in JS — only exists in GLSL today), `sq`, `spline`, `paramFreq`, `normField` + `FIELD_GAIN` (noise calibration, §8.6).
- Param fields: `continentalness` (wrap `continentalHeight`), **`erosionParam`** (not `erosion`), `weirdness`, `peaksValleys`, `temperature`, `humidity`. Place near `continentalHeight` (38155). `MAX_SURFACE_Y` const near the splines.
- Shape: `SPLINE_CONTINENTAL/PEAKS/EROSION`, `DETAIL_MAX`, `terrainBaseHeight`, `terrainDetail`, **`computeSurfaceHeight`** (not `terrainHeight`), plus `ridgedMultifractal` (extracted clean core of `mountainsHeightFunc`) and `billowNoise`.
- Biome: `BIOME_PARAMS`, `AXIS_W`, **`resolveBiome`** (not `selectBiome`).
- Cache: add `tempCache` (and optionally a coarse `paramCache`, see §9) to `precalculateTerrainCaches` (38917).

All new symbols were grepped against `voxEx.html` and are collision‑free **as named here**. See §8.5 for the ones that required renaming.

### 8.2 Removed / repurposed vs. KEEP‑PUBLIC

**Reimplement the body, KEEP the name/signature** (external callers depend on them — renaming breaks trees, VoxelWorld, fog, preview, worker, tests):

| Public symbol | Line | New body |
|--------|------|------|
| `blendedHeight(gx,gz,seed)` | 38037 | `computeSurfaceHeight` + ocean/river carve. Callers: 5628/5663/5718 (trees/spawn), 10923 (VoxelWorld heightMap), 19092 (worker), tests |
| `getPreRiverHeight(gx,gz,seed)` | 38390 | `terrainBaseHeight` (pre‑carve, no ocean/river). Callers: `getRiverFactor` (38471), `getLocalSlope` (38413), worker, tests |
| `getBiomeParams(gx,gz)` | 37915 | `return resolveBiome(gx,gz)`. Callers: 5621/5701 (trees), 17027 (player/fog), 21875 (preview tint), 19094 (worker), tests |

**Remove / repurpose** (also delete from the worker injection list §8.3 **and** the `?test=1` exposure block §8.4):

| Symbol | Line | Fate |
|--------|------|------|
| `sampleBiomeBilinearHeight` | 38007 | **remove** (logic moves into `computeSurfaceHeight`) |
| `getBiomeHeightAtCell` | 38113 | **remove** |
| `HEIGHT_FUNCS` | 38370 | **remove** |
| `plainsHeightFunc` / `hillsHeightFunc` / `defaultHeightFunc` | 38185 / 38175 / 38166 | **repurpose** into `billowNoise` |
| `mountainsHeightFunc` | 38190 | **repurpose** into `ridgedMultifractal` (finding 3) |
| `foothillsHeightFunc` | 38353 | **remove** (foothills now emergent) |
| `isMountainRegion` + `MOUNTAIN_REGION_THRESHOLD` | 37973 / 37972 | **remove** (mountains = low E, high PV) |
| `_BIOME_CDF_TABLE` / `uniformBiomeRoll` | 37944 / 37952 | **remove** |
| `getRawBiomeParams` / `getRawBiomeCellDirect` / `getBiomeCellDirect` | 37981 / 37829 / 37857 | **collapse** into `resolveBiome` |
| `_FH_NEIGHBORS` / `MAX_FOOTHILL_RINGS` | 37939 / 37873 | **remove** |
| `mountain_foothills` in `BIOME_CONFIG` | 5302 | **remove** — first grep every `'mountain_foothills'` string ref (config, worker biomeTable exclusion, tint) |

Net: the tangled selection+blend+foothill+mask machinery (~several hundred lines) is replaced by param fields + splines + a nearest‑biome scan.

### 8.3 Worker parity (mandatory — terrain gen runs ON the worker)

Terrain generation runs in the chunk worker whenever `SETTINGS.useWorkers` is on (`generateTerrainViaWorker`, 20165; `ChunkWorkerPool` does gen **and** meshing). Parity is not optional — a main/worker mismatch shows as per‑chunk cliffs at chunk borders.

All new pure functions (`smoothstep`, `sq`, `spline`, `paramFreq`, param fields, the `computeSurfaceHeight` chain, `resolveBiome`) go into the `__TERRAIN_FUNCS_*` injection list consumed by `buildChunkWorkerCode()` (19566) — the current terrain list is at ~19576–19590. Bake `SPLINE_*`, `DETAIL_MAX`, `MAX_SURFACE_Y`, `FIELD_GAIN`, `BIOME_PARAMS`, `AXIS_W` into the worker config like `MOUNTAIN_REGION_THRESHOLD`/`_BIOME_CDF_TABLE`/`_FH_NEIGHBORS` are today (emit block ~19602–19654). (A stale/absent `FIELD_GAIN` in the worker would desync heights vs. the main thread → chunk‑border cliffs — the exact failure mode this section exists to prevent.) **Delete the now‑unused emits** for removed symbols (`_BIOME_CDF_TABLE`, `_FH_NEIGHBORS`, `HEIGHT_FUNCS`, `isMountainRegion`, etc.). Keep the markers intact. Tree funcs (`__TREE_FUNCS_*`, 19065) still read the injected `getBiomeParams`/`blendedHeight`/`getRiverFactor`/`biomeByName` — which is exactly why those three **keep their names** (§8.2).

### 8.4 Mirrors + test harness

- **`WorldPreviewRenderer`** and **`tools/terrain-visualizer.html`** must implement identical param/spline/biome logic. Rebuild the visualizer first (Phase 0) as the authoring tool — it becomes the source of truth you copy into the game.
- **`?test=1` exposure block (`window.VoxEx`, ~46450–46460)** lists the terrain funcs handed to `tools/voxex-tests.html`. Add the new public entry points and **remove the deleted symbols** (`getBiomeHeightAtCell`, `mountainsHeightFunc`, `plainsHeightFunc`, `hillsHeightFunc`, `foothillsHeightFunc`, `getBiomeCellDirect`, `isMountainRegion`) or the ~204‑test suite throws on a missing reference.

### 8.5 Integration audit — collisions found & resolved

Every identifier in this doc was grepped against `voxEx.html`. Four collided and were renamed; one helper was missing and is now defined. **Use the right‑hand names.**

| In an early draft | Collides with | Use instead |
|---|---|---|
| `selectBiome(gx,gz)` | `selectBiome(biomeName)` — create‑world UI handler (21463) | **`resolveBiome`** |
| `terrainHeight(gx,gz)` | `const terrainHeight` local in `getRiverFactor` (38471) | **`computeSurfaceHeight`** |
| `erosion(gx,gz)` | `const erosion` local in `continentalHeight` (38159) | **`erosionParam`** |
| `smoothstep(...)` in JS | only exists in GLSL shader strings — **undefined in JS** | define the JS helper (§3.1) |
| `**` operator | style: codebase uses `Math.pow` (×24), no `**` in JS | use `sq()` / `Math.pow` |

Confirmed **safe** (0 existing JS defs): `temperature`, `humidity`, `weirdness`, `peaksValleys`, `continentalness`, `paramFreq`, `normField`, `FIELD_GAIN`, `MAX_SURFACE_Y`, `terrainBaseHeight`, `terrainDetail`, `ridgedMultifractal`, `billowNoise`, `spline`, `sq`, `SPLINE_*`, `DETAIL_MAX`, `BIOME_PARAMS`, `AXIS_W`, `tempCache`, `paramCache`, `useNewTerrain`. (`continentalness` appears only in comments today; the function name is free. `lerpValue` already exists and is reused.)

### 8.6 Calibration to VoxEx's actual noise distribution (must‑fix, not tuning)

This is the biggest *reasonableness* gap and it is a correctness issue, not a taste one. VoxEx's `noise2D` (Perlin gradient) concentrates in **~±0.45**, proven by the `_BIOME_CDF_TABLE` domain (0.28–0.73 in normalized space, 37944). Multi‑octave `fbm2D` averages octaves so its range is **narrower still (~±0.3)**. Consequences if the fields are used raw:

- **`BIOME_PARAMS` targets are unreachable.** Values like `mountains e:-0.8, pv:0.7` sit outside what raw fbm ever produces, so the nearest‑target scan would almost never pick them — mountains (and any extreme‑param biome) would effectively vanish.
- **The PV fold never reaches its peaks.** `1 - |3|w| - 2|` peaks at `|w| ≈ 0.67`; raw weirdness barely reaches 0.3, so PV would be pinned negative (valleys only, no peaks).
- **Temperature/humidity would cluster around 0.5**, collapsing the climate space so most of the world reads as one mid biome.

**Fix (already applied in §2/§3):** wrap the fbm fields in `normField()` (gain ≈ 1/0.33 ≈ 3.0, clamped) so each spans a usable −1..1 before the splines/targets consume it. Two caveats:
- **Continentalness is the exception** — `continentalHeight` already clamps to −1..1 but skews **positive** (+0.3 bias, 38161), usable range ~0..0.7. Do **not** `normField` it; set `SPLINE_CONTINENTAL` and `BIOME_PARAMS.c` to that skewed range (already done — `.c` targets are 0.1–0.6).
- **`FIELD_GAIN` is a starting guess.** Histogram each field in the Phase‑0 visualizer and set the gain per field so its output actually fills −1..1 without excessive clamping. This replaces the calibration job that `_BIOME_CDF_TABLE` did for the old single‑scalar selector — the non‑uniformity of Perlin noise does not disappear just because selection changed.
- **Linear gain + hard clamp SATURATES the extremes.** `normField` = `clamp(v·GAIN)`. Too high a gain piles probability mass at exactly −1 and +1 (every strong sample clips there), which *over‑represents* extreme biomes/heights (endless deserts+tundra, flat mesa tops) and *under‑represents* the middle. It also distorts the PV fold (§3.2): PV is very sensitive to how weirdness is spread — a valley‑dominated or peak‑dominated map both come from a mis‑set gain. **Prefer a smooth remap** (`tanh(v·k)`, or a per‑field empirical CDF like the old table) over linear‑gain‑plus‑clamp if the histograms show pile‑up at the rails. Decide this in Phase 0 — it's cheap there and painful later.

### 8.7 Worker‑template hand‑maintained copies (extra sync burden)

Beyond the injected `__TERRAIN_FUNCS_*` list, the worker template contains **hand‑maintained** copies that also need editing:

- **`precalculateTerrainCaches` (19081)** is a hand‑written copy in the worker template (only `generateTerrainPass`/`fillWaterPass` are dynamically injected). Adding `tempCache`/`paramCache` means editing **both** it and the main‑thread copy (38917).
- **`WORLD_DIMS` (18717) and `BIOME_CONFIG` (18750)** are hand‑maintained worker copies (CLAUDE.md flags a past `yOffset` drift that silently broke worker trees). Phase‑3 palette fields added to `BIOME_CONFIG`, and `BIOME_PARAMS`, must be mirrored here.

### 8.8 Cross‑system interactions (rest of the program)

Decoupling shape from biome ripples into systems that assume today's "biome drives height" model. Audited:

1. **Create‑world "Terrain Amplitude" slider/presets break (must fix).** The slider scales `config.amplitude = original.amplitude * ampMult` (21546); presets `amplified`/`flat`/`superflat` set `terrainAmplitude` 200/0/0. The new shape reads `SPLINE_PEAKS`/`DETAIL_MAX`, **not** `biome.amplitude`, so the slider and those presets would become **no‑ops** — a "Flat" world would still grow full mountains. **Fix:** apply `worldConfig.terrainAmplitudeMultiplier` to the spline outputs (multiply `spline(SPLINE_PEAKS,…)` and `DETAIL_MAX`), and let 0 collapse to flat.

2. **Create‑world "Force single biome" changes meaning (design decision).** Today it works by setting `config.weight = (name===selected) ? 10 : 0` (21492) so the weighted roll always lands on the chosen biome — which *also* forces that biome's height func, so the world takes on its terrain. Under decoupling: (a) `resolveBiome` is nearest‑target and **ignores weights**, so it must honour `worldConfig.forceSingleBiome` via an explicit short‑circuit (like `getRawBiomeParams` does today, 37985); and (b) more importantly, biome is now cosmetic — forcing "mountains" would paint mountain *skin* on whatever shape the params produce (possibly flat). **Decision needed:** forcing a biome should also force a **param/shape profile** (set C/E/PV/T/H to that biome's `BIOME_PARAMS` target, or map each forced biome to a terrain preset) so the world actually looks like the chosen biome. Without this, the biome selector silently stops shaping terrain.

3. **`persistence`/`lacunarity` sliders lose most of their reach.** They currently feed `continentalHeight`'s base (38158) **and** per‑biome `defaultHeightFunc` detail (38168). `continentalness` keeps them, but `defaultHeightFunc` is removed and the new param fields hardcode `fbm2D(…, 3, 0.5, 2.0)`. **Fix or accept:** thread `worldConfig.persistence`/`lacunarity` into the new fbm fields, or note in the UI that they now only affect the continental base.

4. **Save/cache seams — already handled by `TERRAIN_GEN_VERSION` (4250).** Cached chunks are stamped with it (26293) and rejected on mismatch (27554/27627), regenerating from the new algorithm. **Action:** bump `TERRAIN_GEN_VERSION` when the new path becomes default (Phase 4). During flagged A/B, treat the flag like a version too — don't reuse cached chunks generated under the other path (seams).

5. **Foothills removal touches fog/preview/biome‑table.** `'mountain_foothills'` is referenced by the main + worker `biomeTable` exclusion (37745 / 19614), `getBiomeCellDirect`'s conversion (37843/37885, removed with the biome), and `WorldPreviewRenderer.getBiomeTint`'s `case 'mountain_foothills'` (21799, becomes dead). Grep them all when removing the biome. New biomes (tundra/desert) added later need `BIOME_FOG_TINTS` (17010) **and** preview‑tint entries or they silently fall back to `default`.

6. **Biome fog can flicker on crisp borders.** Fog tint reads `getBiomeParams(playerPos).name` (17029). Per‑column `resolveBiome` gives sharper biome borders than today's 64‑block cells, so fog color could snap as the player crosses one. If noticeable, keep the light biome quantization (§4.3) or smooth the tint transition.

7. **Robust by design — surface material already keys off elevation, not just biome.** `generateTerrainPass` uses `isMountain || worldTopY >= ALPINE_LINE` (38984+), so tall columns get rock/snow **regardless of biome**. That means decoupling doesn't strand high peaks with grassy skins even before the Phase‑3 palette work — a point in the architecture's favor. Spawn finding (`findAndSetSpawnPosition` 27682, `findSpawnHeight` 34130) also reads the actual generated surface Y, so it self‑adjusts; just re‑validate players don't land in water more often under the new land/ocean split.

8. **River canyon/tunnel thresholds are tuned to the old height field.** The canyon vs. tunnel band (`worldTopY > 80`, `CANYON_FULL=70`/`CANYON_NONE=90`, ~38096/39283) assumes today's height distribution. New heights may need these retuned — folds into the rivers follow‑up (finding 4), which is already out of the core scope.

---

## 9. Determinism, performance, testing

**Determinism:** every field stays a pure function of `(gx,gz,seed)`. No load‑order dependence. Splines are constant tables; nearest‑biome is deterministic.

### 9.1 Performance audit — where lag could come from, and the fixes

The naive version of this design **is** a lag risk. Three concrete hazards and their mitigations (all already reflected in the sketches above):

1. **Ridged multifractal on every column (biggest risk).** `ridgedMultifractal` is the extracted `mountainsHeightFunc` — ~25 `noise2D` calls. **Today plains columns never call it** (the bilinear blend only invokes `mountainsHeightFunc` when a corner cell is the mountains biome). If `terrainDetail` called it unconditionally, every flat column would gain ~25 noise samples — a multi‑× regression in plains. **Fix (in §3.3):** gate it — return early when `amp < 0.5` (flat) and skip the ridged branch when `ridgeWeight < 0.02`, so only genuinely mountainous columns pay for it. Net cost then tracks today's (mountains were always the expensive case).
2. **Double evaluation per column.** `precalculateTerrainCaches` calls `blendedHeight` (→ `computeSurfaceHeight`) **and** `getRiverFactor` → `getPreRiverHeight` (→ `terrainBaseHeight`) for the same column — the shape is computed twice, as it already is today. Don't let the new, heavier shape double up: **compute the base/pre‑river height once per column and reuse it** for both the height cache and the river factor (pass it in, or cache `getPreRiverHeight(idx)`).
3. **Low‑frequency params sampled per column.** C/E/PV/T/H vary over hundreds of blocks, so per‑block sampling is wasteful. **Sample them on a coarse grid and interpolate** — reuse the exact pattern `precalculateCaveNoise`/`interpolateCaveNoise` already use (sample every 4 blocks, trilinear/bilinear interp). This cuts the Stage‑0 fbm cost by ~10–16× with no visible difference. Cache into a `paramCache` in `precalculateTerrainCaches` (38917).

Biome selection itself is cheap: `resolveBiome` is a ~7‑iteration loop; keep the per‑cell (or coarse) sampling + `biomeCellCache` rather than an uncached per‑column call. **Target:** stay within today's `blendedHeight` cost envelope; verify with the perf overlay (O) and the worldgen‑timing notes (spawn gen is already ~71s main‑thread‑bound — don't make Stage 0/1 worse than the bilinear path it replaces).

### 9.2 Testing (`tools/voxex-tests.html`, ~204 tests)

Add: (a) worker↔main **byte‑parity** for `blendedHeight`/`getPreRiverHeight`/`getBiomeParams` under the new impl (the existing `blendedHeight` parity test already guards this — keep it green); (b) determinism (same seed ⇒ same output); (c) invariants — height finite and within `[0, chunkHeight)`, mountain coverage in target range, every biome reachable in param space; (d) **continuity** — neighbouring‑column height delta bounded (guards against reintroducing seams). Update the `?test=1` exposure block (§8.4) so removed symbols aren't referenced.

### 9.3 New tool

A **parameter visualizer** (maps of C/E/PV/T/H + resulting biome and height, shaded relief + cross‑section) is the single most valuable build aid — author and tune splines/`BIOME_PARAMS` there before touching the game (Phase 0).

---

## 10. How this addresses the 9 findings

| # | Finding | Handled by |
|---|---------|-----------|
| 1 | 1‑D biome selection | §4 multi‑noise `resolveBiome` (5 params) |
| 2 | Binary mountain mask | §2/§3 erosion + PV shape it continuously; `isMountainRegion` removed |
| 3 | `mountainsHeightFunc` over‑layered | §3.3 extracted into a clean `ridgedMultifractal` detail style |
| 4 | Rivers noise ribbon | §6 benefits (bias then drainage) — separate follow‑up |
| 5 | Fixed elevation ladder | §5 local‑temp snow line + per‑biome palettes |
| 6 | Bilinear border seams | §3.4 **eliminated** — height is global/continuous |
| 7 | Uniform soil depth | §5.2 per‑biome `soilDepth` |
| 8 | No erosion sim | §6 thermal post‑pass (distinct from the `E` param) — separate follow‑up |
| 9 | No ores | independent ore pass — unchanged from deep‑dive item 9 |

Items 4, 8, 9 remain separate follow‑ups; the core rebuild fully resolves 1, 2, 3, 5, 6, 7.

---

## 11. Rollout plan (correctness‑first, then consolidate)

**Phase 0 — Authoring tool.** Rebuild `tools/terrain-visualizer.html` to show the 5 params, the spline outputs, resulting height (shaded relief + cross‑section), and `resolveBiome`. **Histogram each field first** and set `FIELD_GAIN`/`normField` so they fill −1..1 (§8.6) — do this before tuning splines or `BIOME_PARAMS`, since every target/domain depends on it. Tune splines + `BIOME_PARAMS` here. *No game changes yet.*

**Phase 1 — Shape behind a flag.** Add param fields + `computeSurfaceHeight` in `voxEx.html` under `worldConfig.useNewTerrain`; have `blendedHeight` branch on the flag (new path vs. old bilinear). Add worker injection for the new funcs. A/B compare against the old world in the visualizer and in‑game. *Verbose and explicit — do not consolidate yet.*

**Phase 2 — Biome decoupling.** Add `resolveBiome` behind the same flag; route `getBiomeParams` through it; wire surface/trees only (height already independent). Verify no cycle, no seams.

**Phase 3 — Surface/snow/vegetation + world‑creation rewire.** Two‑temperature snow line; per‑biome palettes in `BIOME_CONFIG`; humidity‑scaled trees; per‑biome soil depth. **Rewire the create‑world controls (§8.8):** Terrain Amplitude → scale the splines; Force‑single‑biome → force its param profile via `resolveBiome` short‑circuit; decide persistence/lacunarity scope. Add fog/preview tint entries for any new biomes.

**Phase 4 — Validate & flip default.** Full `voxex-tests.html` parity/determinism/continuity suite green; perf within budget; new tuning locked. Make `useNewTerrain` the default **and bump `TERRAIN_GEN_VERSION` (4250)** so all cached/saved chunks regenerate under the new algorithm (no old/new seams).

**Phase 5 — Consolidate (your "compress later").** Delete the old path per §8.2 (bilinear, foothills, CDF, mask, per‑biome funcs, mountain_foothills biome). Merge helpers, remove the flag, update `CLAUDE.md` (including the stale River section) and the class/section maps.

**Phase 6 — Extensions.** New biomes (tundra/desert) via `BIOME_PARAMS` + palettes; rivers (finding 4); thermal erosion post‑pass (finding 8); ores (finding 9); later, evaluate 3‑D density (§13).

Each phase is independently shippable and testable; Phases 1–2 are the keystone.

---

## 12. Open decisions to lock before Phase 1

- **Field calibration (`FIELD_GAIN`/`normField`) — do this first.** Set per‑field gains from real histograms so the fields fill −1..1 (§8.6). Everything downstream (splines, targets, PV fold) is invalid until this is right.
- **Spline control points** for continental/peaks/erosion (start from §3.2; tune in visualizer). Governs the whole look.
- **Height budget:** `SPLINE_PEAKS` is set so a full mountain ≈ ~275, matching the current `285` ceiling (`MAX_SURFACE_Y`, 38341). Confirm this still reads well against the existing snow lines (`SNOW_LINE=190`, etc.) — the snow bands were tuned to the old mountain scale.
- **Latitude banding** for temperature: on (N–S climate zones) or off (isotropic)?
- **Biome granularity:** per‑column vs light 8–16‑block quantization (perf vs. crispness of borders).
- **Mountain skin:** keep a `mountains` biome for pine/snow/rock, or drive all of that from elevation+temperature and drop the biome? (Recommend keep, for control.)
- **Forced‑biome semantics (§8.8 #2):** when the create‑world biome selector forces a biome, should it force that biome's *shape params* too (so terrain matches), or only the cosmetic skin? Recommend forcing the param profile — otherwise the selector stops shaping terrain. Decide before wiring Phase 2.
- **World‑creation sliders (§8.8 #1/#3):** rewire Terrain Amplitude to scale the splines, and decide whether persistence/lacunarity thread into the new fields or are scoped down.
- **Amplitude re‑tune:** ensure the new detail (`DETAIL_MAX`) stays under the mean‑step ceiling the `VOXEX-CCR-TERRAIN-*` constants protect (they exist specifically to fight mountain choppiness).

---

## 13. Deferred (out of scope)

- **3‑D density terrain** (overhangs, floating islands, noise caves, aquifers) — a separate epic that would rework meshing/water/lighting. The heightmap decision (§1.2) can be revisited later; the param/spline layer built here is a prerequisite for it anyway.
- **Hydraulic (droplet) erosion** — heavier than the thermal post‑pass; revisit with flow‑based rivers since they share regional‑heightfield machinery.
- **Full 6th parameter (`depth`)** — only meaningful with 3‑D density.

---

### Relationship to the other docs
- `terrain-improvement-opportunities.md` — the 9 findings (what's wrong).
- `terrain-improvement-deep-dive.md` — 3+ options per finding (menu of fixes).
- `terrain-climate-fields-plan.md` — the *pragmatic* climate plan (table bolted onto per‑biome height).
- **this doc** — the *proper* rebuild (shape decoupled from biome). If you build this, it replaces the pragmatic plan.

# VoxEx — Climate Fields & Generation Pipeline Plan

A concrete plan for moving VoxEx from **1‑D biome selection** to a **climate‑driven** model built on a small set of noise fields (temperature, humidity, relief) layered on the existing continentalness. Covers what each field is, how it works, the order the pipeline runs in and *why*, and exactly where each piece plugs into `voxEx.html`.

**Reference build:** `VOXEX_BUILD = "2026-06-30.75"` (voxEx.html:4243). Addresses findings 1, 2, 5 (and enables 8) from `terrain-improvement-opportunities.md`.

---

## 1. Design principles

These constrain every decision below:

- **Fields are sampleable functions, not raster passes.** VoxEx evaluates terrain lazily — `continentalHeight`, `getOceanFactor`, `getRiverFactor` are all pure functions of `(gx, gz, seed)` called on demand and cached per‑cell/per‑column. The new climate fields follow the same shape. There is no full‑world array "pass"; "the humidity pass" means "add `humidity(gx,gz)` and call it where biomes are decided."
- **Determinism is mandatory.** Every field must be a pure function of position + seed, independent of chunk load order, so main thread / worker / preview agree and `tools/voxex-tests.html` parity tests pass.
- **No dependency cycles.** Biome selection must not depend on final height (height depends on biome). Climate temperature used for *selection* is pure noise; elevation cooling is applied later, only for the snow line (see §4).
- **Minimal disruption to the height blend.** The existing 64‑block bilinear height blend (`sampleBiomeBilinearHeight`, 38007) is kept. It already samples the 4 surrounding cells' biomes and blends their per‑biome height funcs — it does not care whether the biome was chosen by a 1‑D roll or a 2‑D climate table.
- **Noise has no seed argument.** `noise2D`/`fbm2D` read a per‑world `perm` table shuffled from the seed once (21323). Fields decorrelate by adding `seed * k` offsets to coordinates.

---

## 2. The fields

Four fields drive generation. One already exists; three are new. All return normalized ranges and are cheap (a few `noise`/`fbm` calls).

### 2.1 Continentalness — *existing, reused*

- **What:** ocean ↔ inland. Already implemented as `continentalHeight` (38155), range −1..1.
- **How it works now:** `fbmWithDomainWarp` base + erosion fbm, biased inland. Consumed by `getBiomeHeightAtCell` (38113) for height scaling and, separately, oceans come from `getOceanFactor` (38568).
- **Why we keep it:** it's the coast/inland axis and already tuned. We do **not** force it into biome *selection* (VoxEx expresses beaches/oceans in the height + surface pass, not as biomes). It stays in its current role and optionally feeds `relief` (§2.4).

### 2.2 Temperature — *new*

- **What:** hot ↔ cold, range 0..1. The primary climate axis for selection and the snow line.
- **How it works:** low‑frequency fbm, optionally with a gentle latitude gradient so climate zones band north↔south.

```js
const CLIMATE_FREQ = 0.0009;   // ~1100-block climate provinces (before Biome Size scaling)

/** Climate temperature 0..1 (1 = hot). Pure noise — NO height input (keeps selection acyclic). */
function climateTemperature(gx, gz) {
    const seed = worldConfig.seed;
    let t = fbm2D(gx * climateFreq() + seed * 1.7, gz * climateFreq() - seed * 0.9, 3, 0.5, 2.0);
    t = (t + 1) * 0.5;
    // Optional north–south banding — comment out for isotropic climate:
    // t = t * 0.7 + (0.5 + 0.5 * Math.sin(gz * 0.00035)) * 0.3;
    return Math.max(0, Math.min(1, t));
}
```

- **Why:** temperature + humidity give a true 2‑D climate space (Whittaker), so biomes cluster naturally (cold biomes together, deserts hot+dry) and adjacency stops being dictated by a 1‑D table order. Temperature is reused by the snow line (§4), so one field pays off twice.

### 2.3 Humidity — *new*

- **What:** dry ↔ wet, range 0..1. The second selection axis; also a natural driver for vegetation density.
- **How it works:** independent low‑frequency fbm, decorrelated from temperature via different frequency + seed offsets.

```js
/** Humidity 0..1 (1 = wet). */
function humidity(gx, gz) {
    const seed = worldConfig.seed;
    const h = fbm2D(gx * climateFreq() * 1.3 - seed * 2.3, gz * climateFreq() * 1.3 + seed * 1.1, 3, 0.5, 2.0);
    return Math.max(0, Math.min(1, (h + 1) * 0.5));
}
```

- **Why:** the second axis is what makes selection 2‑D instead of renamed‑1‑D. Also lets tree/vegetation density scale with moisture (currently a flat per‑biome constant), and feeds swamp/desert placement.

### 2.4 Relief (erosion) — *new; replaces the mountain mask*

- **What:** flat ↔ mountainous, range 0..1. Decides where mountains occur.
- **How it works:** low‑frequency, domain‑warped noise. To preserve current mountain *placement* during migration, reuse the exact warp from `isMountainRegion` (37973):

```js
const MOUNTAIN_RELIEF_THRESHOLD = 0.64;   // ≈ old 0.28 gate mapped to 0..1; tune to keep 7–15% coverage

/** Relief 0..1 (1 = mountainous). Replaces isMountainRegion(). */
function relief(gx, gz) {
    const seed = worldConfig.seed;
    const wx = noise2D(gx * 0.002 + seed * 5, gz * 0.002) * 60;         // same warp as isMountainRegion
    const wz = noise2D(gx * 0.002 + 100, gz * 0.002 + seed * 5) * 60;
    const r = noise2D((gx + wx) * 0.0015 + seed * 0.9, (gz + wz) * 0.0015 - seed * 0.4);
    return (r + 1) * 0.5;                                                // -1..1 -> 0..1
}
```

- **Why:** it folds finding 2 (the binary mountain mask) into the same field family. Mountains emerge where `relief` is high instead of a bespoke boolean, killing the standalone `isMountainRegion` gate and its threshold‑tuning treadmill. It also opens the door (later) to a **continuous** mountain‑ness that modulates amplitude directly and makes foothills emergent (see §7 Extensions).

> **Biome Size slider parity.** `climateFreq()` returns `CLIMATE_FREQ / worldConfig.biomeSizeMultiplier` so the existing "Biome Size" control still works — larger size ⇒ lower frequency ⇒ bigger climate provinces. Apply the same `/biomeSizeMultiplier` to `relief`'s low‑frequency term if you want mountain provinces to scale too.

---

## 3. Biome selection: 1‑D roll → 2‑D climate table

### 3.1 What it replaces

Today `getRawBiomeParams` (37981): `forceSingleBiome` check → `isMountainRegion` boolean → `uniformBiomeRoll(noiseVal)` (37952) maps one noise scalar through `_BIOME_CDF_TABLE` (37944) into a cumulative‑weight scan. Selection is a function of **one scalar**, so biomes band along a 1‑D axis.

### 3.2 The Whittaker table

A small temperature × humidity matrix. Biome *rarity* is now expressed by how much table area a biome occupies (and by making the bin thresholds non‑uniform), so **`_BIOME_CDF_TABLE` and `uniformBiomeRoll` are retired.**

```js
// rows = temperature band (cold/temperate/hot), cols = humidity band (dry/mid/wet)
const CLIMATE_TABLE = [
  // dry          mid           wet
  ['plains',     'plains',     'swamp'    ],  // cold      (later: 'tundra' in dry/mid)
  ['hills',      'forests',    'longwoods'],  // temperate
  ['plains',     'forests',    'swamp'    ],  // hot       (later: 'desert' in dry)
];

function climateBiome(gx, gz) {
    const t = climateTemperature(gx, gz);
    const h = humidity(gx, gz);
    const ti = t < 0.34 ? 0 : t < 0.67 ? 1 : 2;   // thresholds double as rarity knobs
    const hi = h < 0.34 ? 0 : h < 0.67 ? 1 : 2;
    return biomeByName.get(CLIMATE_TABLE[ti][hi]);
}
```

### 3.3 New `getRawBiomeParams`

```js
function getRawBiomeParams(gx, gz) {
    const forced = worldConfig.forceSingleBiome;
    if (forced) { const fb = biomeByName.get(forced); if (fb) return fb; }
    // Mountains now come from the relief field, not a bespoke mask:
    if (relief(gx, gz) > MOUNTAIN_RELIEF_THRESHOLD) return biomeByName.get('mountains');
    return climateBiome(gx, gz);
}
```

Everything downstream is unchanged: `getRawBiomeCellDirect` (37829) still samples this at the cell centre and caches per cell; `getBiomeCellDirect` (37857) still converts non‑mountain cells adjacent to mountains into foothills; `sampleBiomeBilinearHeight` (38007) still blends the 4 cells' heights. **Only the selector's internals change.**

- **Why a table and not more noise:** a 2‑D lookup makes placement *intentional and legible* — you can read off exactly which biome sits in each climate cell, tune rarity by editing cells/thresholds, and grow the table (add tundra/desert rows‑cols) without touching selection logic.

---

## 4. The two‑temperature rule (avoiding the cycle)

Realistic snow needs temperature to fall with altitude — but altitude comes from the biome height func, which selection is trying to pick *using* temperature. Resolve by splitting temperature into two uses evaluated at different pipeline stages:

- **Climate temperature** — `climateTemperature(gx,gz)`, pure noise, used in **Stage 1 (selection)**. No height input ⇒ no cycle.
- **Local temperature** — `climateTemp − elevationLapse`, computed in **Stage 4 (surface material)** where final height is already known, used only for the snow line:

```js
// In generateTerrainPass, per column (worldTopY known):
const climT     = tempCache[idx];                                   // 0..1, cached in Stage 0
const elevLapse = Math.max(0, worldTopY - WORLD_DIMS.seaLevel) / 220;
const localT    = climT - elevLapse;                                // < 0 allowed at peaks
const snowLine  = 150 + localT * 110;                               // cold/high ⇒ lower snow line
// then: if (worldTopY >= snowLine) ... instead of the fixed SNOW_LINE=190 constant (38973)
```

- **Why:** keeps the whole generator a clean forward pipeline (no feedback loop) while still giving snowy lowlands in cold regions and bare warm highlands — the payoff of finding 5.

---

## 5. Pipeline order — and why

Per‑chunk generation, new/changed steps marked. Order is dictated by data dependencies: climate depends on nothing, biome depends on climate, height depends on biome, surface depends on height.

```
Stage 0  CLIMATE FIELDS            [NEW]   temperature, humidity, relief   (pure noise)
            │  why first: inputs to selection; depend on nothing
            ▼
Stage 1  BIOME SELECTION           [MOD]   climate → Whittaker table; mountains via relief
            │  why here: needs climate; produces biome identity for height + surface
            │  where: per 64-block cell centre (getRawBiomeParams), cached per cell
            ▼
Stage 2  HEIGHT                    [same]  per-biome height funcs, bilinear blend,
            │                              continentalness scaling  (blendedHeight)
            │  why after biome: height funcs are per-biome
            ▼
Stage 3  OCEANS + RIVERS CARVE     [same]  getOceanFactor / getRiverFactor into blendedHeight
            │
            ▼
Stage 4  TERRAIN FILL + SURFACE    [MOD]   generateTerrainPass; snow line uses LOCAL temp
            │  why here: needs final height (elevation lapse) and biome
            ▼
Stage 5  CAVES                     [same]  3D-noise carve
            ▼
Stage 6  DECORATIONS / TREES       [MOD]   density may scale with humidity
            ▼
Stage 7  LIGHTING                  [same]
```

**Where Stages 0–1 physically live in code:**

- **Per‑cell (selection):** `getRawBiomeParams` (37981) calls the three climate fields. Because `getRawBiomeCellDirect` (37829) evaluates once per 64‑block cell centre and `getBiomeCellDirect` caches by `"cellX,cellZ"`, climate is sampled ~once per cell — cheap.
- **Per‑column (surface):** cache `climateTemperature` into a new `tempCache` inside `precalculateTerrainCaches` (38917), right beside `widthNoiseCache`, so `generateTerrainPass` reads it without re‑sampling. (Humidity can be cached too if trees/surface need it per column.)

```js
// precalculateTerrainCaches (38917) — add alongside the existing caches:
const tempCache = new Float32Array(chunkSize * chunkSize);
// inside the lx/lz loop:
tempCache[idx] = climateTemperature(gx, gz);
// return { heightCache, riverCache, biomeCache, widthNoiseCache, tempCache };
```

---

## 6. Insertion points & change checklist

| Change | Location | Action |
|--------|----------|--------|
| Add `climateTemperature`, `humidity`, `relief`, `climateFreq` | near other terrain fns (~38155 `continentalHeight`) | new pure functions |
| Add `CLIMATE_TABLE`, `climateBiome` | near `_BIOME_CDF_TABLE` (37944) | new table + selector |
| Rewrite `getRawBiomeParams` | 37981 | climate + relief; drop `uniformBiomeRoll` call |
| Retire `_BIOME_CDF_TABLE` (37944) + `uniformBiomeRoll` (37952) | 37944–37962 | remove once selection no longer uses them |
| Replace `isMountainRegion` (37973) usage | 37973 / 37990 | mountains via `relief` threshold |
| Add `tempCache` | `precalculateTerrainCaches` (38917) | cache climate temp per column |
| Snow line uses local temp | `generateTerrainPass` (38964); `SNOW_LINE` 38973 | variable snow line |
| Biome Size parity | `climateFreq()` | divide freq by `biomeSizeMultiplier` |
| Clear cache on climate param change | `biomeCellCache` (used in 37859) | clear when climate/size changes (as done today for size) |

**Worker parity (mandatory):** add `climateTemperature`, `humidity`, `relief`, `climateFreq`, `climateBiome` and the rewritten `getRawBiomeParams` to the `__TERRAIN_FUNCS_*` injection list in `buildChunkWorkerCode()`; bake `CLIMATE_TABLE`, `CLIMATE_FREQ`, `MOUNTAIN_RELIEF_THRESHOLD` into the worker config like `MOUNTAIN_REGION_THRESHOLD` is today (worker emission ~19629). Keep the markers intact.

**Mirrors:** update `WorldPreviewRenderer` (create‑world preview) and `tools/terrain-visualizer.html` with the same climate fields + table, or the preview/debugger will diverge from the world.

**Tests:** run `tools/voxex-tests.html` — worker `blendedHeight` byte‑parity and biome determinism must still pass; add cases asserting `climateBiome` is deterministic and that mountain coverage stays in range.

---

## 7. Extensions (later, optional)

- **Continuous mountain‑ness (fuller item 2 fix).** Instead of a hard `relief > threshold`, let `smoothstep(0.55, 0.75, relief)` produce a 0..1 factor that both tags mountains *and* scales amplitude in `getBiomeHeightAtCell`. Foothills become the emergent mid‑band, letting you retire the adjacency‑ring foothill code entirely.
- **New biomes.** Add `tundra` (cold/dry) and `desert` (hot/dry) rows‑cols to `CLIMATE_TABLE` + `BIOME_CONFIG`; needs new surface palette + possibly new blocks (sand exists; snow exists).
- **Per‑biome palette + snow line in config.** Move the snow line and surface materials into `BIOME_CONFIG` (the `BIOME_DEFAULTS` comment at 5341 already lists `snowLine` as intended). Composes with §4.
- **Humidity‑driven vegetation.** Multiply tree density by `humidity` so wet zones are lush and dry zones sparse.
- **Relief feeds erosion (item 8).** A thermal‑erosion post‑pass keyed to high‑relief regions would let `mountainsHeightFunc` shed its additive‑noise detail (item 3).

---

## 8. Rollout phases

1. **Phase A — fields + selection.** Add the three fields; swap `getRawBiomeParams` to climate + relief; retire the CDF/roll and `isMountainRegion`. Tune `MOUNTAIN_RELIEF_THRESHOLD` for 7–15% mountain coverage and the climate thresholds for biome balance. Update worker + mirrors. Verify parity.
2. **Phase B — climate snow line.** Add `tempCache`; make the snow line use local temperature. Verify snowy‑lowland / bare‑highland behavior.
3. **Phase C — new biomes + palettes.** Grow `CLIMATE_TABLE` (tundra/desert) and move palettes into `BIOME_CONFIG`.
4. **Phase D — continuous relief + erosion.** Promote relief to a continuous amplitude driver; retire ring‑based foothills; wire the erosion post‑pass.

Each phase is independently shippable and testable; A is the keystone the rest depend on.

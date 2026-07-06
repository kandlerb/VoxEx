# VoxEx — Terrain Generation Deep Dive & Method Options

Companion to `terrain-improvement-opportunities.md`. For each of the 9 findings this doc explains **how the code works today** (with verified line refs) and gives **at least 3 concrete methods** you could use to fix or improve it, with trade-offs and a recommendation.

**Reference build:** `VOXEX_BUILD = "2026-06-30.75"` (voxEx.html:4243). Line numbers are the **main-thread single-source** functions; `buildChunkWorkerCode()` regenerates the worker copies between the `__TERRAIN_FUNCS_*` markers, and `WorldPreviewRenderer` + `tools/terrain-visualizer.html` are hand-mirrors that must be updated alongside any terrain change.

### Shared infrastructure the options refer to

A few of the options below lean on the same small pieces of new infrastructure, described once here:

- **Noise is per-world Perlin gradient noise.** `noise2D` (21262) / `noise3D` (21271) read a 512-entry `perm` table that is Fisher–Yates shuffled from the world seed once (21323). There is **no `seed` argument** — callers decorrelate fields by adding `seed * k` offsets to the coordinates. Any new field (temperature, humidity, erosion mask, ore) uses the same trick: `noise2D(gx * f + seed * k1, gz * f + seed * k2)`.
- **Per-column caches.** `precalculateTerrainCaches` (38917) fills `heightCache` (Int16, 16×16), `riverCache`, `biomeCache`, `widthNoiseCache` once per chunk, then `generateTerrainPass` (38964) consumes them. This is the natural place to add a `tempCache` / `humidityCache` / eroded-height cache.
- **Slope today is in-chunk only.** The 8-neighbour slope scan in `generateTerrainPass` (39006–39025) skips samples outside `[0,chunkSize)`, so slope is subtly wrong at chunk edges. Anything that needs correct cross-chunk slope (items 6, 8) must sample `blendedHeight`/`getPreRiverHeight` on a **padded** region rather than reading `heightCache`.
- **Determinism is mandatory.** Every value must be a pure function of `(gx, gz, seed)` (and `gy` for 3D), independent of chunk load order, or worker vs. main vs. preview will diverge and `tools/voxex-tests.html` parity tests will fail.

---

# 1. Biome selection is 1-dimensional

**Where:** `getRawBiomeParams` (37981), `uniformBiomeRoll` (37952), `_BIOME_CDF_TABLE` (37944); table built into `biomeTable` (37743).

### How it works now

One noise sample decides the biome:

```
noiseVal = noise2D(gx*biomeFrequency + seed*0.37, gz*biomeFrequency - seed*0.71)   // one scalar
t        = uniformBiomeRoll(noiseVal)     // remap to uniform [0,1] via the empirical CDF table
target   = t * totalWeight
// linear scan of cumulative-weight table → biome
```

`_BIOME_CDF_TABLE` is an empirically-sampled inverse-CDF that flattens the noise distribution so the configured `weight` values are respected. `mountains` and `mountain_foothills` are excluded from this table — mountains come from `isMountainRegion` (item 2), foothills from adjacency.

The consequence is structural: because the biome is a monotonic function of a single scalar `t`, the biomes are ordered on a 1-D line. Two biomes only border each other if they're adjacent in the cumulative table; distant entries can meet only by crossing every band between them. There is no temperature/humidity/elevation dimension.

### Options

**Option A — 2-D Whittaker climate table (recommended).**
Sample two decorrelated low-frequency fields, `temperature` and `humidity`, and look the biome up in a 2-D matrix:

```
T = fbm2D(gx*0.0008 + seed*1.7, gz*0.0008 - seed*0.9, 3)   // -1..1 → 0..1
H = fbm2D(gx*0.0011 - seed*2.3, gz*0.0011 + seed*1.1, 3)
biome = CLIMATE_TABLE[quantize(T)][quantize(H)]
```

- *Pros:* natural adjacency (hot+dry deserts cluster, cold biomes cluster), intentional placement, and it produces a `temperature` field that items 3, 5, 8 can reuse (e.g. climate-driven snow line). Deterministic and cheap.
- *Cons:* need to author the T×H matrix and re-tune weights; `weight` becomes a rarity tie-breaker rather than the primary control; you must add a blended border strategy (see below) so cells don't hard-switch.
- *Effort:* Medium. Touches `getRawBiomeParams` + adds two cache fields; CDF table becomes unnecessary (or repurposed to shape T/H distributions).

**Option B — Voronoi / cellular biome regions with jittered seeds.**
Divide the world into large jittered cells (seeded point per grid cell), assign each cell a biome by weighted roll, and pick the nearest cell centre. Blend near the boundaries by distance to the two nearest centres.

- *Pros:* biomes become coherent "provinces" of controllable size; easy to guarantee every biome appears; borders are organic if you add the existing domain warp to the query point.
- *Cons:* Voronoi height blending is harder than the current bilinear grid — you need to interpolate height across 2–3 nearest cells to avoid cliffs; more per-column cost (find nearest N cells).
- *Effort:* Medium–High. Replaces both the selection *and* the height-blend cell grid (item 6 folds in).

**Option C — Multi-axis noise with priority overrides.**
Keep a noise-driven base roll but add independent "special biome" masks layered by priority, exactly as `isMountainRegion` already does for mountains: a swamp mask (low + wet), a desert mask (hot + dry), etc., each a thresholded low-freq field, checked in priority order before falling back to the weighted roll.

- *Pros:* incremental — reuses the pattern already in the codebase; you can add one biome mask at a time without a full rewrite; each mask is independently tunable.
- *Cons:* doesn't fix the underlying 1-D fallback for the "ordinary" biomes; threshold-tuning brittleness multiplies with each mask (mountains already show this); interactions between masks get fiddly.
- *Effort:* Low per biome, but it accretes complexity.

**Recommendation:** **Option A.** It's the cleanest structural fix, directly removes the 1-D banding, and pays dividends elsewhere (a real temperature field is the enabling dependency for items 5 and 8). Use a smoothstep blend on the two nearest quantized climate bins, or keep the existing 64-block bilinear height grid (item 6) so borders stay smooth. Re-derive/retire `_BIOME_CDF_TABLE` since selection is no longer a single-scalar roll.

---

# 2. Mountains are a separate binary region mask

**Where:** `isMountainRegion` (37973), `MOUNTAIN_REGION_THRESHOLD = 0.28` (37972); foothill conversion in `getBiomeCellDirect` with `MAX_FOOTHILL_RINGS = 1` (37873); height blended separately in `sampleBiomeBilinearHeight` (38007).

### How it works now

```
m = noise2D(warpedX*0.0015 + seed*0.9, warpedZ*0.0015 - seed*0.4)   // one warped field
isMountain = m > 0.28                                                // hard boolean
```

`getRawBiomeParams` returns `mountains` whenever this boolean is true, bypassing the weighted roll. A cell that is *adjacent* (8-neighbour) to a mountain cell becomes `mountain_foothills` with a single ring of decay (`ringFactor` ≈ 0.75 at the one ring). Height comes from a completely different mechanism — the bilinear grid samples `mountainsHeightFunc` for mountain cells and blends with neighbours.

Two independent systems (boolean identity mask vs. bilinear height grid) decide "is this a mountain" and "how tall is it," and the transition zone is only one 64-block cell wide.

### Options

**Option A — Continuous "mountain-ness" weight (recommended).**
Replace the boolean with a smooth factor and drive both amplitude and tagging from it:

```
mtn = smoothstep(0.20, 0.45, m)          // 0..1 instead of a hard gate
amplitude = lerp(baseAmp, mountainAmp, mtn)
isMountainTag = mtn > 0.5                 // for surface-material logic only
```

- *Pros:* removes the sheer-transition brittleness and the repeated threshold re-tuning; foothills become emergent (the 0.2–0.8 band *is* the foothill) so you can delete much of the ring machinery; mountains "grow" out of terrain.
- *Cons:* need to thread `mtn` into the height sample and surface pass; interacts with the bilinear grid (you're now blending a continuous amplitude across cells); preview + visualizer mirrors must follow.
- *Effort:* Medium.

**Option B — Widen the foothill transition (minimal change).**
Keep the boolean mask but raise `MAX_FOOTHILL_RINGS` to 3–4 with a quadratic `ringFactor` decay, so the base tapers over ~200 blocks instead of ~64.

- *Pros:* smallest diff; directly addresses the abrupt base; the ring system already exists and is documented.
- *Cons:* doesn't fix the identity-vs-height seam or the threshold brittleness; more rings = more `getRawBiomeCellDirect` neighbour probes per cell (cost); still fundamentally a stamped region.
- *Effort:* Low.

**Option C — Fold mountains into continentalness/elevation.**
Drive mountains from the existing `continentalHeight` continuum (38155) instead of a dedicated mask: high-continentalness inland regions get a mountain amplitude ramp, so mountains appear where the land is already high and interior.

- *Pros:* unifies elevation and identity into one field; mountains naturally sit inland away from coasts (more realistic); eliminates a whole standalone noise field.
- *Cons:* biggest conceptual change; you lose independent control of "where mountains are" vs. "where land is high"; needs careful re-tuning so mountains don't smear everywhere high; ocean/river interplay shifts.
- *Effort:* High.

**Recommendation:** **Option A**, optionally as a stepping stone from **Option B**. Ship B first (cheap, immediate visual win on the abrupt bases), then move to A to remove the structural seam and the threshold-tuning treadmill. Keep A's `mtn` factor in a cache field so the surface pass (item 5) can read it.

---

# 3. `mountainsHeightFunc` is an over-layered stack fighting its own detail

**Where:** `mountainsHeightFunc` (38190); post-blend jagged block in `blendedHeight` (38047–38061).

### How it works now

Thirteen labelled stages, combined additively at stage 12:

1. domain warp (winding ridgelines), 2. regional scale (foothills vs peaks), 3. 6-octave ridged noise `1-|noise|` with sharpness exponents, 3b. peak amplification (`pow` boosts above 0.5 and 0.9), 4. jagged micro-ridges (freq 0.08/0.18), 5. valley carve, 6. saddles, 7. peak-type variation (spires), 8. cliff bands, 9. 3-octave erosion (freq 0.08/0.15/0.25), 10. gullies, 11. ridge connection, then regional + amplitude scaling with `MOUNTAIN_RELIEF_SCALE 0.90`.

The change-log constants tell the story of a losing fight with high-frequency choppiness: `POST_JAGGED_SCALE 0.65→0.40`, jagged detail halved, erosion cut ~half. The stacked raw-coordinate high-frequency terms (stages 4 and 9) are the corduroy source; every tuning pass just scales the symptom.

### Options

**Option A — Clean ridged-multifractal core + single warp (recommended).**
Rebuild around one well-behaved ridged multifractal where each octave's weight is modulated by the previous octave (so detail only appears where there's already relief), band-limited so the finest octave's wavelength stays ≳ a few blocks:

```
sum=0; freq=f0; amp=1; prev=1
for o in octaves:
    n = 1 - |noise2D(p*freq)|;  n *= n
    n *= clamp(prev, 0, 1)      // detail gated by coarse structure ⇒ smooth valleys, sharp peaks
    sum += n*amp; prev = n
    freq *= 2.0; amp *= 0.5
```

Keep one domain-warp pass for winding ranges. Drop stages 4 and 9 entirely; let erosion come from item 8's post-pass.

- *Pros:* the multifractal gating removes corduroy *by construction* (no additive high-freq layer on flat ground), so you can delete the pile of scale-down constants; far easier to reason about and tune with 3–4 knobs.
- *Cons:* it's a genuine rewrite; you must re-tune amplitude to preserve current peak heights and re-validate mean-step; risk of losing some of the hand-placed character (spires, cliff bands) unless re-added deliberately.
- *Effort:* Medium–High.

**Option B — Erosion-driven detail (warp + post-pass, keep a simple base).**
Keep a simple base (2–3 ridged octaves, no jagged/erosion stages) and move *all* fine detail into a thermal-erosion post-pass on the heightfield (item 8). Weathering then produces the roughness instead of noise.

- *Pros:* physically-motivated detail (talus, smoothed vs. sharp) that noise can't fake; base function becomes trivial; shared with item 8 so you build one system.
- *Cons:* erosion post-pass has cross-chunk seam cost (needs padded heightfield); iteration count trades quality vs. speed; determinism care required.
- *Effort:* High (but overlaps item 8).

**Option C — Feature-masked billow+ridge hybrid.**
Blend two simple primitives — billow (`|noise|`, rounded) for lower slopes and ridged (`1-|noise|`, sharp) for peaks — using a low-freq "peakness" mask, plus explicit, *sparse* feature placement (spires/cliffs) only where a mask fires, instead of everywhere.

- *Pros:* keeps the current "sharp peaks, rounded flanks" look with far fewer always-on layers; sparse features avoid global choppiness; moderate rewrite.
- *Cons:* still hand-authored masks to tune; two primitives to blend cleanly; less principled than A.
- *Effort:* Medium.

**Recommendation:** **Option A** for the core, adopting **Option B**'s erosion pass once item 8 exists. The multifractal gating is the single change that removes the choppiness at the source rather than scaling it down. Validate against `tools/terrain-visualizer.html` cross-sections and the mean-step ceiling that the CCR-TERRAIN constants were protecting.

---

# 4. Rivers are a noise ribbon with terrain-awareness disabled

**Where:** `getRiverFactor` (38467); penalties zeroed at `slopePenalty = 0` (38521); canyon/tunnel logic in `blendedHeight` (~38096) and the river-tunnel block in `generateTerrainPass` (~39283); legacy flag `usePathBasedRivers = false` (22048).

### How it works now

The river path is where a warped, meandered `|noise|` field crosses near zero:

```
n = |noise2D((warped + meander + macroMeander)*0.001 + seed*0.1, ...)|
if n < effectiveWidth: riverFactor = smoothstep(0, width, n)   // 0 = centre
```

`slopePenalty` and `heightPenalty` are hardcoded to `0` (comment: the old penalties kept rivers out of mountain interiors, which is now *wanted* so they become tunnels). So the path ignores the actual heightfield. Because a ribbon can cross a mountain, `blendedHeight` and `generateTerrainPass` carry a canyon-vs-tunnel system (carve a channel at low elevation; punch a covered water tube through high terrain). `RiverNetworkCache` and gradient-descent tracing described in `CLAUDE.md` **do not exist** in the live code.

### Options

**Option A — Re-enable a downhill/elevation bias (minimal, recommended first).**
Restore a soft penalty so the ribbon prefers valleys and low ground:

```
heightPenalty = smoothstep(seaLevel+8, seaLevel+40, terrainHeight)   // wider channels low, none high
effectiveWidth = baseWidth * (1 - heightPenalty*0.9)
```

- *Pros:* tiny change; rivers stop knifing through peaks so most tunnel special-casing rarely triggers; keeps the cheap noise-ribbon architecture.
- *Cons:* still not true drainage (rivers won't necessarily connect source→sea coherently); tunnels stay in the codebase for edge cases.
- *Effort:* Low.

**Option B — Flow-accumulation drainage (the "real" fix).**
Implement the intended Phase-2 rivers: from `getPreRiverHeight` (38390), trace/accumulate flow downhill on a coarse grid, carve channels where accumulation exceeds a threshold, cache per region (the `RiverNetworkCache` the docs already assume).

- *Pros:* rivers that actually collect tributaries, flow downhill to sea, and widen downstream — the biggest realism jump available; removes the "why is there a river here" arbitrariness.
- *Cons:* expensive and stateful; hard to keep deterministic and chunk-parallel (flow crosses chunk borders); needs the regional cache + careful seam handling; largest effort in this doc.
- *Effort:* High.

**Option C — Valley-constrained ribbon (hybrid).**
Keep the noise ribbon but *gate* it: only allow a river where the terrain also forms a local low (e.g. the ribbon AND a low-curvature/valley mask both fire). Add lakes where a low basin has no outlet.

- *Pros:* much of B's "rivers live in valleys" look at a fraction of the cost; no global flow state; lets you delete most tunnel code because ribbons rarely hit high ground.
- *Cons:* rivers still don't guarantee connectivity to the sea; valley detection is another tuned mask; can leave short disconnected segments.
- *Effort:* Medium.

**Recommendation:** Ship **Option A** immediately (near-free, removes most of the tunnel weirdness), then invest in **Option B** if rivers are a headline feature — it's the only option that yields believable drainage. **Option C** is the pragmatic middle if B is too costly. Regardless, **fix the `CLAUDE.md` River section** to describe the actual noise-ribbon implementation and note that `RiverNetworkCache`/gradient-descent never shipped.

---

# 5. Surface material is a fixed elevation ladder

**Where:** `generateTerrainPass` (38964); thresholds `SNOW_LINE = 190`, `SNOW_PATCHES_LINE = 160`, `HIGH_ROCK_LINE`, `ROCK_LINE`, `ALPINE_LINE` (38973+).

### How it works now

Surface block is chosen by a cascade of `if (worldTopY >= SNOW_LINE) … else if (>= SNOW_PATCHES_LINE) …`, refined by slope (`isCliff`/`isSteep`/`isModerate`) and aspect (`northFacing`) plus surface noise. The thresholds are global constants, so the snow line is at y=190 everywhere in every world; there's no temperature input, no desert/sand palette, no latitudinal variation.

### Options

**Option A — Temperature-driven thresholds (recommended, depends on item 1).**
Make the snow/rock lines a function of a temperature field rather than constants:

```
snowLine = SNOW_LINE - (0.5 - T) * 120     // cold regions: snow at low elevation; hot: pushed up
```

- *Pros:* snowy lowlands, warm high plateaus, real climate variety; reuses the temperature field from item 1's Whittaker selection (one field, many payoffs).
- *Cons:* requires item 1 (or at least a standalone temperature field) first; must re-check all the `>=` band logic against a variable line.
- *Effort:* Medium (Low if the temperature field already exists).

**Option B — Per-biome palette in `BIOME_CONFIG`.**
Add `surface`/`subsurface`/`snowLine` fields to `BIOME_CONFIG` (the `BIOME_DEFAULTS` comment at 5341 already lists `snowLine` as intended). Each biome supplies its own ground-cover rules; the elevation cascade becomes a fallback.

- *Pros:* data-driven and very readable; lets a "desert" biome specify sand, a "tundra" biome specify snow-at-low-elevation, with no code branches; composes with the existing tag system.
- *Cons:* doesn't by itself give smooth climate gradients (biome borders can hard-switch palettes unless blended); more config surface to maintain.
- *Effort:* Medium.

**Option C — Noise-perturbed thresholds (cheapest).**
Keep global lines but break their dead-straightness with a low-freq offset so the snow/rock lines wander ±10–20 blocks:

```
snowLine = SNOW_LINE + noise2D(gx*0.002+seed, gz*0.002)*18
```

- *Pros:* trivial; immediately kills the "perfectly flat snow line" tell; no dependency on other items.
- *Cons:* still no real climate; every world still snows at ~y=190 on average; cosmetic only.
- *Effort:* Very Low.

**Recommendation:** **Option A** as the target, with **Option B** layered on for per-biome character (they compose: temperature sets the line, biome palette sets the material). Do **Option C** now as a one-line stopgap if item 1 isn't imminent.

---

# 6. Biome-height blend can ramp linearly where amplitudes mismatch

**Where:** `sampleBiomeBilinearHeight` (38007) → `getBiomeHeightAtCell` (38113).

### How it works now

Height at a point is a smoothstep-weighted **bilinear blend of 4 biome cells** over a 64-block grid (`gridScale = BIOME_CELL_SIZE * biomeSizeMultiplier`). Each corner evaluates its biome's height func, then `lerp` in x and z. When neighbouring cells have very different amplitudes (plains `amplitude:8` vs mountains `amplitude:180`, `BIOME_CONFIG` 5160), the blend across the cell is essentially a straight ramp, and only 2×2 interpolation limits how organic a border can be.

### Options

**Option A — Blend base height and relief separately (recommended).**
Split each biome's height into `baseHeight` + `relief` (the noise part). Bilerp the base smoothly, but blend the relief with a weight biased toward the lower-amplitude neighbour near borders, so a plains→mountain edge curves up rather than ramping linearly.

- *Pros:* removes the tell-tale straight ramps; keeps cost near current (still 4 samples); no grid-topology change.
- *Cons:* needs each height func to expose base vs. relief (small refactor); border-bias curve needs tuning.
- *Effort:* Medium.

**Option B — 3×3 distance-weighted kernel + warped sample point.**
Sample a 3×3 neighbourhood with smooth distance weights and offset the query point by a low-freq warp, so borders meander and no single straight edge dominates.

- *Pros:* organically wiggly borders; more neighbours = smoother large-amplitude transitions; warp reuses existing domain-warp machinery.
- *Cons:* 9 samples instead of 4 in a per-column hot path (measure cost); still a grid underneath.
- *Effort:* Medium.

**Option C — Widen transitions via a global smoothing of the height field.**
Leave the biome grid but apply a small blur/low-pass to `blendedHeight` near detected biome borders (or just globally at low amplitude), softening amplitude discontinuities.

- *Pros:* simple, general; doesn't require touching per-biome funcs.
- *Cons:* global smoothing also rounds off intended sharp features (mountain edges) unless border-gated; a blur needs neighbour samples (cross-chunk padding, like item 8); blunt instrument.
- *Effort:* Medium.

**Recommendation:** **Option A.** It targets the actual defect (amplitude mismatch ramps) without adding hot-path samples or global blurring, and it composes cleanly with item 2's continuous mountain-ness (blend the relief weight by `mtn`). Consider A+B together if border shape is a priority.

---

# 7. Uniform soil depth everywhere

**Where:** subsurface branch of `generateTerrainPass`, `else if (depth < 4)` (39243).

### How it works now

For non-elevated terrain the column is: surface block, then `DIRT` for depth 1–3, then `STONE`. The `< 4` boundary is a constant, so every lowland column shows exactly three dirt blocks — visible on every cliff, cave wall, and cut-through.

### Options

**Option A — Low-frequency noise depth (recommended).**
```
soilDepth = 2 + floor((noise2D(gx*0.03+seed, gz*0.03)*0.5+0.5) * 4)   // 2..5
id = (depth < soilDepth) ? DIRT : STONE
```

- *Pros:* one extra noise lookup per column kills the uniform band; gentle regional variation reads as natural.
- *Cons:* none significant; just pick a frequency that doesn't shimmer.
- *Effort:* Low.

**Option B — Per-biome `soilDepth` field.**
Add `soilDepth` to `BIOME_CONFIG` (swamp deep, mountains thin) and read `biome.soilDepth`.

- *Pros:* data-driven, biome character (rich swamp soil vs. rocky highlands); composes with item 5's palette work.
- *Cons:* config-only variation is uniform *within* a biome unless combined with A; another field to maintain.
- *Effort:* Low.

**Option C — Slope/curvature-based depth.**
Thin soil on steep slopes (erosion strips it) and thicken it in concave hollows (deposition), using the slope already computed in the surface pass.

- *Pros:* physically motivated; pairs naturally with item 8's erosion; slope is already available.
- *Cons:* slope is in-chunk-only today (edge inaccuracy); more logic than A for a subtle effect.
- *Effort:* Low–Medium.

**Recommendation:** **Option A + Option B** together — noise for organic variation, biome field for character. Cheap, high readability win. Add C's slope thinning if item 8 lands.

---

# 8. No erosion model — "erosion" is additive noise only

**Where:** erosion terms inside `mountainsHeightFunc` (38294+); talus/scree handled only cosmetically in the surface pass (~39134).

### How it works now

What the code calls erosion is `|noise|`-based additive height detail. There is no material transport — no simulation of gravity or water moving material downslope. So there are no talus fans at cliff bases, no sediment filling valleys, and no slope-stability limit (surfaces can be steeper than real material would hold). The per-chunk `heightCache` and in-chunk-only slope scan mean any real erosion pass must sample a **padded** heightfield to stay seamless across chunks.

### Options

**Option A — Thermal (slope-limited) erosion post-pass (recommended).**
On a per-chunk heightfield **padded** by the erosion radius, run a few iterations: wherever the slope between neighbours exceeds a talus angle, move a fraction of material downhill. Then read eroded heights into `heightCache`.

- *Pros:* cheap, stable, deterministic (fixed iterations over a pure-function height sample); produces talus fans and rounded-but-stable slopes; lets item 3 delete its additive-noise erosion layers.
- *Cons:* padded sampling costs extra `blendedHeight` calls at chunk edges (radius-dependent); iteration count trades quality vs. time; must pad enough that results are chunk-order-independent.
- *Effort:* Medium–High.

**Option B — Hydraulic droplet erosion (pre-baked, regional).**
Simulate water droplets carrying sediment downhill over a **regional** heightfield (bigger than one chunk), bake the result into a cached height offset that chunks sample.

- *Pros:* the most realistic — carves dendritic valleys and deposits deltas; would also give item 4 real drainage lines for free.
- *Cons:* heavy, stateful, regional caching + seam management; hardest to keep deterministic and parallel; large effort.
- *Effort:* High.

**Option C — Erosion *masks* (fake it, no simulation).**
Precompute cheap proxies — a slope map and a curvature map — and use them to *place materials and small height offsets* (gravel/talus where slope is high and concave, smoothing where convex) without moving real material.

- *Pros:* far cheaper than simulation; captures much of the *look* (talus at cliff bases, scree on slopes); no cross-chunk state beyond padded slope.
- *Cons:* not physically consistent (no conservation of material); can look wrong where the proxy disagrees with reality; still needs padded neighbour samples for slope/curvature.
- *Effort:* Medium.

**Recommendation:** **Option A** — thermal erosion is the high-value, low-cost first step and is deterministic enough to parallelize. Fold item 3's detail into it (Option 3B). Reserve hydraulic (B) for a later push if you also pursue flow-based rivers (4B), since they share the regional-heightfield machinery. **Option C** is a reasonable cheap stand-in if a real pass is too costly now.

---

# 9. No ore / underground variety

**Where:** deep-rock `else` branch of `generateTerrainPass` (39262–39263, `id = STONE`); no ore pass exists. Cave model to imitate: `precalculateCaveNoise` (38936) + `interpolateCaveNoise` (38877), 3-D Perlin at scale 0.02/0.03, sampled every 4 blocks and trilinearly interpolated.

### How it works now

Everything below the soil layer is `STONE` (minus air where caves carve). There is no ore/vein/mineral generation anywhere. The cave system is the template to copy: it thresholds two 3-D noise fields (`n1² + n2² < threshold`) on a coarse (step-4) interpolated grid for speed.

### Options

**Option A — 3-D noise veins, depth-banded (recommended).**
Mirror the cave approach: after cave carving, for solid stone below a depth, threshold a 3-D noise field per ore type, gated by a `worldY` band so different ores sit at different depths:

```
if id==STONE and worldY in oreBand and noise3D(gx*f+ok, gy*f, gz*f) > oreThreshold: id = ORE
```

Reuse the step-4 interpolation cache pattern for cost.

- *Pros:* matches existing cave architecture (low code risk); deterministic; depth bands give the classic "coal shallow, rare ore deep" feel; tunable density per ore.
- *Cons:* noise blobs look slightly rounder than hand-authored veins; needs new block IDs + atlas tiles (bump `NUM_TILES`) and lookup-table updates per `CLAUDE.md`'s add-block checklist.
- *Effort:* Low (generation) + the standard add-block plumbing.

**Option B — Seeded vein walkers.**
Deterministically seed vein start points per region (hash of region + seed) and "walk" each vein a few steps in a noise-directed line, laying ore blocks — closer to Minecraft's authored veins.

- *Pros:* stringy, realistic veins rather than blobs; very controllable count/length.
- *Cons:* walkers cross chunk boundaries → need region-level determinism (compute all veins whose bounding box overlaps the chunk, like trees already do at `generateTreesForChunk`); more code than A.
- *Effort:* Medium.

**Option C — Blue-noise / Poisson blob scatter.**
Place ore pockets on a jittered lattice (one candidate per NxN region, hashed offset), each a small ellipsoid blob, sized/typed by depth.

- *Pros:* even, controllable distribution (no clumping); simple determinism (per-cell hash); good for gameplay balance.
- *Cons:* pockets can look regular if the lattice shows through; less "veiny" than B.
- *Effort:* Low–Medium.

**Recommendation:** **Option A** to start — it slots into the existing cave pass with minimal risk and is fully deterministic. If ore *aesthetics* matter later, add **Option B** vein walkers (reusing the cross-chunk determinism pattern that trees already use). In all cases follow the add-block checklist: new IDs, `NUM_TILES` bump, `initTextures`, and `initBlockLookupTables()`.

---

## Cross-cutting dependencies & suggested order

Several items share a spine, so sequencing matters:

- **Temperature/humidity field** is the keystone: it unlocks item 1 (2-D biome selection), item 5 (climate snow line), and informs item 2 (mountains inland/cold). Build it first.
- **Padded heightfield sampling** underpins item 8 (erosion) and helps items 6 and 7 (correct cross-chunk slope). Build the padded-sample helper once.
- **Erosion pass (item 8)** lets item 3 shed its additive-noise detail layers, and a hydraulic version (8B) shares machinery with flow-based rivers (4B).
- **Suggested order:** (1) temperature field → items 1, 5. (2) continuous mountain-ness → item 2, feeding item 6. (3) padded-height helper → items 6, 7. (4) thermal erosion → item 8, then rewrite item 3 on top. (5) river bias/drainage → item 4. (6) ores → item 9 (independent; can be done anytime). Fix the `CLAUDE.md` river/RiverNetworkCache divergence alongside item 4.

Every change above must preserve worker parity (edit main-thread sources only; keep the `__TERRAIN_FUNCS_*` markers intact), update the `WorldPreviewRenderer` and `tools/terrain-visualizer.html` mirrors, keep all fields pure functions of `(gx, gz, seed)`, and pass `tools/voxex-tests.html` parity/determinism tests.

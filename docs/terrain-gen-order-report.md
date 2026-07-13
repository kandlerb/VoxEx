# Terrain Generation Order Report

**Date**: 2026-07-12 · **Scope**: default path (`WORLD_CONFIG.useNewTerrain: true`) · **Purpose**: document the current pass order and data flow, explain why it's ordered that way, and diagnose the "mountains in hills biomes / hills in mountains biomes" mismatch. Point-in-time exploration report, not a change doc.

---

## 1. Verdict up front

**The pass ORDER is not the problem — it's correct and each ordering constraint has a real reason.** The mountains-in-hills mismatch is caused by a deliberate **decoupling decision**, not a sequencing bug: terrain height is a pure function of 2 climate fields (continentalness, erosion), while the biome label is a nearest-centroid classification over 5 climate fields (temperature, humidity, continentalness, erosion, peaks-valleys). Nothing forces the two to agree, and the shipped code comment says so explicitly: `resolveBiome` is annotated *"multi-noise biome selection (cosmetic only; never affects height)"*.

The good news: the fix does not require reordering anything, and it does not risk resurrecting the border-seam problem the decoupling was built to kill. Details in §6.

---

## 2. The per-chunk pass order (as-built)

From `generateChunkData` (main-thread path; the worker path runs the identical logical passes folded into one message):

| # | Pass | Function | Reads | Writes |
|---|------|----------|-------|--------|
| 0a | Terrain caches | `precalculateTerrainCaches` | seed, world config | `heightCache`, `riverCache`, `oceanCache`, `biomeCache`, `tempCache`, `widthNoiseCache`, `heightPad` (padded +2 ring) |
| 0b | Cave noise | `precalculateCaveNoise` | seed | `caveCache1/2` (coarse 3D grid, CAVE_STEP=4) |
| 1 | TERRAIN | `generateTerrainPass` | all of the above | block array: full column fill (material cascade) + in-place cave carving |
| 2 | WATER | `fillWaterPass` | `heightCache`, blocks | fills AIR→WATER from `worldTopY+1` up to sea level |
| 3 | DECORATIONS | `generateDecorationsPass` → `generateTreesForChunk` | pure noise fns (NOT the caches) | own-chunk trunks + any overlapping canopies |
| 4 | SUNLIGHT | `calculateChunkSunlight` | final blocks (incl. trees) | `skyLight` |
| 5 | BLOCKLIGHT | `calculateBlockLight` | blocks (emitters) | `blockLight` |
| 6 | Section analysis | `analyzeChunkSections` | blocks | per-section culling metadata |
| 7 (deferred) | NEIGHBOR_UPDATE / TREE_NEIGHBOR_UPDATE | `runNeighborUpdatePass` (once all 4 cardinal neighbors exist) | neighbor chunks | prune phantom leaves → place neighbor canopy leaves → `recalculateEdgeLighting` |

### Inside pass 0a, the per-column height chain (order is strict):

1. `computePreRiverHeight` → base height (`computeSurfaceHeight`/`terrainSurface`) blended with ocean (`getOceanFactor`/`getOceanDepth`)
2. `getRiverFactor(gx, gz, seed, preHeight)` — needs pre-river height for the elevation pinch-out (rivers narrow 75–95, vanish above)
3. `applyRiverCarve` — valley depression first, then channel incision, both fading to zero *before* the width cutoff bites
4. Result floored → `heightCache`. `generateTerrainPass` never recomputes height; it only reads the cache.

`resolveBiome` is also called once per column here and cached in `biomeCache`.

---

## 3. Why each ordering exists

The order is essentially forced by data dependencies, and the code comments confirm each one:

**Caches before terrain pass** — the terrain pass does 8-neighbor slope/aspect analysis (cliff detection, ridge detection, lake beds) using the padded `heightPad` ring, so height must be a *pure function of (gx, gz)* computed up front, identical across chunk borders. Computing it lazily inside the pass would either break border continuity or force redundant recomputation.

**Height → river factor → river carve** — the river's width pinch-out is elevation-gated, so it must see pre-river height; the carve must see the river factor. Circular by nature, resolved by staging.

**Terrain before water** — `fillWaterPass` only fills AIR above `worldTopY` up to sea level. Cave carving (which runs *inside* pass 1, after material assignment per block) explicitly guards against carving within 8 blocks below submerged floors, precisely because pass 2 can't reach sub-floor air. The two passes are co-designed around this ordering.

**Water before decorations** — trees validate against final terrain (underwater rejection, river exclusion `riverFactor < 0.8`).

**Decorations before lighting** — leaves and logs occlude sunlight; lighting a treeless chunk then adding trees would require a full relight anyway.

**Tree placement bypasses the chunk caches on purpose** — `getChunkTreePositions` recomputes biome/height/river from the pure noise functions rather than reading `biomeCache`/`heightCache`, because chunk N must be able to derive chunk N+1's trees deterministically without N+1's caches existing (canopies cross chunk borders). This is why `isTreeSoilSurface` must mirror the material cascade in lockstep.

**Neighbor passes deferred** — cross-chunk canopy backfill and edge lighting can only run once all cardinal neighbors exist; comment-enforced internal order (prune phantoms → place leaves → relight).

No pass reads data produced by a later pass. There is no ordering defect here.

---

## 4. What information is generated, and from what

Two independent stacks are computed from the same seed:

**Shape stack (drives height):**

- `C` — continentalness: domain-warped fbm at freq 0.002/0.004
- `E` — erosion: 3-octave fbm at `paramFreq(0.0011)`, ×`FIELD_GAIN`
- `terrainSurface(gx, gz)`: `relief = spline(SPLINE_EROSION, E)` sets gain/ridgeMix/amplitude/lift → domain-warped 6-octave multifractal with swiss-turbulence + crest-following peak boost → `height = seaLevel + spline(SPLINE_CONTINENTAL, C) + lift + centered-fractal term`

The function header states it outright: *"terrain surface (global, continuous, NO biome input)."* **Height = f(C, E) and nothing else.**

**Skin stack (drives biome label):**

- `T` temperature (`paramFreq(0.0009)`), `H` humidity (`paramFreq(0.0011)`), `PV` peaks-valleys (folded from weirdness at `paramFreq(0.0018)`), plus the same `C` and `E`
- `resolveBiome`: nearest-centroid in 5-D space — `d = 1.0·(T−t)² + 1.0·(H−h)² + 0.6·(C−c)² + 1.2·(E−e)² + 0.9·(PV−pv)²`, then `d /= weight`. Smallest d wins.

Notable: `PV` and `weirdness` are computed but consumed **only** by `resolveBiome` — the original architecture plan listed PV as a height input, but the shipped `terrainSurface` never calls it. Height is even *less* coupled to biome than the design intended.

**What the biome label actually controls downstream:** tree density/profile, fog tint, preview tint, and the `isMountain` tag that biases the snow/rock material ladder. It never feeds back into height.

---

## 5. Root cause of the mismatch

Three compounding mechanisms, all confirmed in code:

**5.1 — Independent noise fields.** Each of T, H, C, E, PV is a separately-offset, separately-phased noise field. In a region where E is deeply negative (relief ≈ 0.8 → full mountain amplitude in `terrainSurface`), the local T/H/PV values can still sit closer to the *hills* centroid (t=0, h=0, c=0.4, **e=−0.1**, pv=0.4) than the *mountains* centroid (t=−0.3, h=−0.1, c=0.6, **e=−0.8**, pv=0.7). T and H together carry weight 2.0 against E's 1.2, so two "skin" fields can outvote the one field that actually made the terrain mountainous. This isn't a rare edge case — with five independent fields it's statistically routine.

**5.2 — The weight divisor shrinks mountains' capture region.** `d /= weight` with hills at weight 2 and mountains at weight 1 means hills claims a region ~2× larger in climate space. Columns near the mountains centroid get poached by hills; the label "mountains" fires less often than mountain-shaped terrain occurs.

**5.3 — The `isMountain` OR-branch amplifies the visual mismatch both ways.** In `generateTerrainPass`: `isMountain || worldTopY >= ALPINE_LINE` triggers the snow/rock cascade. So a hills-labeled column that reaches mountain elevation gets alpine dressing anyway (elevation band) — it *looks* like a mountain in a hills biome. And a mountains-labeled column sitting at gentle elevation gets snow/rock **forced onto rolling terrain** by the tag — hills-shaped terrain wearing a mountain costume. This branch converts the label/shape disagreement into exactly the two visuals you reported.

**Why it was built this way (from `docs/shipped/terrain-architecture-plan.md`):** the old system computed height *per biome* and blended at borders, producing seams, ramps, and the bespoke `isMountainRegion` mask. The rewrite inverted the relationship — one global continuous height function, biome as "cosmetic skin only": *"A snowy mountain and a warm mountain have identical shape; only the skin differs."* Killing border seams and the mountain mask were real wins. The label/shape divergence is the accepted (and now visible) cost.

---

## 6. Is there a better ordering? — Analysis

**Reordering the passes buys nothing.** Biome is already resolved in the same cache pass as height; moving it earlier or later changes no inputs. The issue is *what resolveBiome consumes*, not *when it runs*.

The key architectural insight: the "cosmetic only" invariant only needs to hold in **one direction**. *Biome must never affect height* (that's what killed the seams). But **height/relief affecting biome is perfectly safe** — biome only drives materials, trees, and fog, none of which can create a height seam. The decoupling threw away a safe dependency along with the dangerous one.

And the ingredient is already sitting there: `terrainSurface` computes `relief = spline(SPLINE_EROSION, E)` — the exact scalar that decides whether a column gets mountain-scale amplitude. `resolveBiome` just never looks at it.

### Options, roughly in order of leverage-per-risk

**A. Feed relief into biome selection (recommended direction).** Make the mountains/hills/plains *shape axis* of classification use the same relief scalar that shapes the terrain, and keep T/H for the skin axis (which mountain: snowy vs. forested; which lowland: plains vs. swamp vs. longwoods). Two concrete forms:

- *Gate form*: `relief > ~0.7` → mountains (T/H pick the variant); `0.4–0.7` → hills/forests; `< 0.4` → plains/swamp/longwoods by T/H/C. Simple, guarantees label/shape agreement, and `resolveBiome` already receives (gx, gz) so it can obtain relief cheaply (or the E it derives from).
- *Sixth-axis form*: add relief (or reuse E with much higher weight) as an axis with centroids aligned to actual shape outcomes. Softer transitions than a hard gate, but agreement is probabilistic rather than guaranteed.

This is also what Minecraft 1.18+ actually does — its biome selection *includes* erosion and PV consistently with how its density function uses them, which is why you don't see "windswept hills" labels on flat plains. VoxEx's plan borrowed the multi-noise idea but dropped the field-sharing discipline that makes it coherent.

**B. Fix the classifier's economics (cheap tuning, partial fix).** Raise `AXIS_W.e` (1.2 → 3-4) so erosion dominates the mountains/hills distinction, and/or equalize the weight divisor (mountains 1 → 2). This shrinks the mismatch rate without structural change, but can't eliminate it — T/H/PV still vote independently.

**C. Fix the `isMountain` OR-branch.** Regardless of A/B: stop forcing alpine dressing at low elevation from the tag alone. Let elevation + temperature drive snow/rock (the lapse-rate shift already does most of this), and the "mountain biome on gentle terrain" costume problem disappears even where labels still disagree. Worth doing alongside either option.

**D. Rename instead of recouple (zero-terrain-change option).** Accept the divergence and rename biomes as what they really are — climate skins (e.g. meadow/woodland/marsh/frost) — so the label stops promising a shape it doesn't control. Honest, but it abandons "biome tells you what terrain to expect," which per your framing is the point of having biomes at all.

### Costs to be aware of (any of A–C)

- Changing biome output changes trees + surface materials → **terrain output changes → `TERRAIN_GEN_VERSION` bump**, saved chunks regenerate.
- `resolveBiome`/`terrainSurface` are injected worker functions — edit main-thread source only, run `parity-check.mjs`; `getChunkTreePositions`'s independent recomputation picks up the change for free (it calls `getBiomeParams`).
- Lockstep check: `isTreeSoilSurface` mirrors the material cascade — touching the `isMountain` branch (option C) touches that mirror.
- Per repo convention: prototype in Node first (`terrain-probe.mjs` hillshade before/after, `terrain-node-checks.mjs` on ≥3 seeds), and a relief-gated classifier is exactly the kind of thing `tools/terrain-probe.mjs stats` can measure (e.g. % of mountain-relief columns labeled mountains, before vs. after).

---

## 7. Summary answers to the questions posed

**"List the order of passes"** — §2. Caches (height→river→carve, biome, climate, cave noise) → terrain fill + caves → water → trees → sunlight → blocklight → section analysis → deferred neighbor reconciliation.

**"Why is it in this order?"** — §3. Every ordering is a hard data dependency; none are arbitrary; no reordering opportunity exists.

**"Why are mountains in hills biomes?"** — §5. Height = f(C, E); biome = nearest-of-5-fields with T/H outweighing E and a weight divisor that shrinks mountains' territory; the material cascade's OR-branch then paints the disagreement in both directions.

**"If biomes don't denote terrain, why have them?"** — Under the current architecture they are honestly just climate skins (trees, fog, surface dressing). To make them mean "what terrain to expect" again, they must consume the relief scalar the terrain already computes — which is safe, cheap, and does not reintroduce the border seams the decoupling was built to prevent (§6, option A + C).

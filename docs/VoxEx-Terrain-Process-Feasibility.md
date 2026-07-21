# Applying Real-World Terrain Processes to VoxEx — Feasibility & Pass-Order Design

*Exploratory design companion to `Real-World-Terrain-Processes-for-Voxel-Worldgen.md`. Nothing here changes the game. It answers two questions: (1) how each real process would be implemented in the **ideal**, unconstrained case, and (2) how to reorder/rebuild VoxEx's passes so those results are produced while preserving the thing that must not break — **infinite, deterministic, on-demand, noise/algorithm-driven streaming**. The terrain pipeline can be torn up and rebuilt; the streaming contract cannot.*

---

## 0. The one hard constraint, and the tension it creates

**The streaming contract (non-negotiable).** Every chunk in VoxEx is generated on demand as a **pure function of `(seed, gx, gz)`**, must be **byte-identical whether generated on the worker or the main thread** (functions are injected via `Function.toString()` and gated by `parity-check.mjs`), must be **seam-free across chunk borders**, must use **no global mutable state, no `Math.random`, no `Date`**, and must be cheap enough to stream as the player moves through an unbounded world. Height in particular is computed **up front as a pure `f(gx,gz)`** in `precalculateTerrainCaches`, with a **+2 padded ring (`heightPad`)** so that 8-neighbour slope/aspect analysis (cliff, ridge, lakebed detection) is identical on both sides of every border. This is the whole game's foundation and the reason it can render an infinite world.

**The tension.** Almost every *real* geomorphic process is the opposite of a pure local function. A river's shape here depends on its **entire upstream basin** (which can be arbitrarily far away). Erosion is **iterative** — it relaxes the whole grid over many passes. Plates **tile the entire planet**. Longshore drift **walks a whole coastline**. Glaciers **integrate a whole valley network**. "Global and iterative" fights "local, pure, and on-demand" head-on. This is *the* problem, and it's why most voxel games stop at noise.

**The resolution VoxEx already discovered: the region-bake pattern.** You reconcile the two by running the global/iterative algorithm on a **bounded region tile** — with a **halo margin larger than the feature's influence distance** — **deterministically** (seeded, stable-sorted, no RNG/time), **caching** the result, and having the per-column sampler **bilinearly sample** the region raster. It is seam-free because the halo ≥ influence radius; deterministic because it's seeded and stable; and streaming-friendly because the (expensive) bake is **amortized over every chunk in the region** and computed only on first demand.

VoxEx already does exactly this, twice:

- **`buildOrogenRegion` / `_orogenRegionCache`** — a per-region **stream-power erosion bake** (426²–512² cells, `EROSION_CELL` 20–48), producing a Δh raster *and* a √-area **flow raster**, bilinearly sampled per column by `tectonicErosionAt` / `tectonicRiverFactor`. It has a recursion guard (`_orogenBaking`), a determinism contract (LCG jitter from the region key, stable sort with index tie-break, no `Math.random`/`Date` — "any nondeterminism = chunk seams"), a 1024 halo (measured 0.8-block border seam), and a beltless pre-scan (8×8 `rangeAmp`) to skip regions with no mountains.
- **`hydroRegionCache` / `floodSpill`** — drainage tracing over a 1024-block `HYDRO_REGION`: springs on a global lattice, greedy 8-neighbour descent, then **Barnes-style pit-centred priority-flood breaching** bounded by a 32-cell `HYDRO_HALO` *measured from the pit* (seam-free by construction) → **100% ocean connectivity**, with **flow accumulation along each traced path setting channel width at confluences for free**.

**So the central finding of this document is: VoxEx has already paid for and proven the hard architecture.** The overhaul is not "invent a way to do global processes in a streamed world" — it's "**make the region-bake pattern the universal spine, and populate it with the remaining process stages.**"

---

## 1. The four feasibility buckets (how a process interacts with streaming)

Every process from the companion catalog falls into one of four buckets. This classification *is* the feasibility answer.

| Bucket | Definition | VoxEx machinery it needs | Cost to add |
|--------|-----------|--------------------------|-------------|
| **NATIVE** | Pure per-column / per-voxel function of `(gx,gz[,y])`. The answer here depends only on here. | None new — it's just a formula sampled in `terrainSurface` or `generateTerrainPass`. | Low |
| **APRON** | Bounded-neighbourhood: influence reaches a fixed finite distance. | The **`heightPad` +2 ring** and the **deferred `NEIGHBOR_UPDATE` pass** — both already exist. Widen the pad to the influence radius. | Low–Medium |
| **REGION-BAKE** | Globally coupled but **halo-boundable**: influence is unbounded in principle but decays / can be clipped at a region halo. | A **cached region raster** with a determinism contract — exactly `buildOrogenRegion` / `hydroRegionCache`. | Medium–High (bake cost) |
| **DEFER / APPROXIMATE** | Truly global with no acceptable bounded form (planet-scale plate history, basin-wide knickpoint sweeps, global sediment mass-balance). | Replace the simulation with an **analytic/closed-form proxy** that captures the *look* per-column. | Design-only |

Two things make this tractable for VoxEx specifically:

1. **All four buckets already have a home.** NATIVE → `terrainSurface`/`generateTerrainPass`. APRON → `heightPad` + `NEIGHBOR_UPDATE`. REGION-BAKE → the region caches. DEFER → the analytic terms already in `terrainSurface` (e.g. `plateLookup` is an *analytic* plate field, not a simulated one — a DEFER-done-right example).
2. **The `FEATURES = 128` GEN_PASS bit is already reserved** (PIPELINE-001 Phase 1) as a no-op hook with no producer/consumer yet — a pre-built socket for a feature/set-piece pass.

---

## 2. Ideal vs. VoxEx-feasible, process by process

For each stage from the companion doc: the **ideal** (unconstrained) implementation, then the **VoxEx-feasible** one with its bucket, noting what already exists.

### Stage A — Tectonic bones
- **Ideal:** simulate plate motion over geologic time; uplift emerges from convergence history.
- **VoxEx:** **DEFER-done-right, already shipped.** `plateLookup` is an *analytic* Voronoi plate field with per-region memo fields (`rangeD/rangeAlong/rangeW/rangeAmp`, `rangeRegime`, `upliftLocal`) and regime differentiation (Andean asymmetry, island arcs, rifts/transforms, `tectonicConeHeight` volcano lattice, `tectonicMarginFactor` cliff coasts). This is the right call — you don't simulate plates, you *author a plate field*. **Keep as the Tier-R spine; nothing to change except to let more downstream passes read its regime/uplift outputs.**

### Stage B — Structure & lithology *(the biggest current gap)*
- **Ideal:** deposit and deform real stratigraphy over time; hardness varies by layer; differential erosion does the rest.
- **VoxEx:** **NATIVE, mostly missing.** Height is `f(C,E)` with a material cascade keyed to altitude bands and `isMountain` — there is **no first-class rock-stack or hardness field**. Add a pure per-column **stratigraphic sampler**: `material = bandTable[dot(worldPos, dipVector)]` with low-freq band thicknesses, a regional dip vector, fold warp, and an unconformity switch — all pure `f(gx,gz,y)`, zero new machinery. The high-value coupling: **emit a per-column `erodibility` scalar from the rock stack and feed it into the `buildOrogenRegion` bake** so the erosion you *already run* becomes **differential** — ledges, benches, mesas, hoodoos fall out of the existing sim for near-free. (This creates a data-dependency wrinkle; see §4.)

### Stage C — Fluvial
- **Ideal:** route flow over the whole grid, integrate drainage area, incise by stream power, iterate to a graded profile.
- **VoxEx:** **REGION-BAKE, already shipped and strong.** `hydroRegionCache` traces springs → greedy descent → priority-flood breaching (100% connectivity) with **flow accumulation → width**, and `buildOrogenRegion` **already exports a flow raster** that belt rivers derive from (CCR-004: `riverFactorAt` returns `min(ribbon, tectonicRiverFactor)`). `applyRiverCarve` does valley-then-channel incision with fade-outs. **Gaps to fill within the same pattern:** lakes at true minima and endorheic basins (deferred to a hydro v2 per OD5), and using the flow raster for **grain-size/sediment sorting** (coarse near headwaters, fine near mouth) which is currently unused.

### Stage D — Glacial *(missing, but cheap given the drainage tier)*
- **Ideal:** flow ice down the network above the ELA; abrade/pluck U-troughs, cirques, fjords.
- **VoxEx:** **REGION-BAKE reusing the hydro network + APRON for the cross-section.** You already have the drainage polylines and flow accumulation. Add a `snowLine` gate and, for flagged reaches, swap the V cross-section for a **parabolic U-profile** (widen band, deepen thalweg, flatten floor) as an apron carve; scale incision by flow (→ hanging valleys automatically); allow coast-crossing troughs to incise **below sea level** (fjords) — which `applyRiverCarve` *already does* for fjords (CCR WS8 F1). Cirques = source-node scoops. **Low effort, high recognition, because the network already exists.**

### Stage E — Volcanic
- **Ideal:** build edifices, carve craters/calderas, flood lava downhill, joint columns.
- **VoxEx:** **NATIVE (edifices) + APRON (flows), partly shipped.** `tectonicConeHeight` already stamps a subduction/arc volcano lattice. Extend to shield/strato/cinder profiles (radial SDF variants) and add: a summit-crater carve (NATIVE), a **lava-flow flood-fill** (APRON — steepest-descent within a bounded radius), lava tubes (NATIVE 3D carve), and columnar basalt (NATIVE Voronoi prisms). Calderas = large cylinder subtract (NATIVE). All per-column or bounded — no new region tier needed.

### Stage F — Karst *(missing; fits natively)*
- **Ideal:** dissolve soluble rock along joints and the water table over time.
- **VoxEx:** **NATIVE 3D + REGION-BAKE(reuse).** Gate on the new lithology stack (limestone bands). Caves = 3D dissolution noise biased to a water-table band (VoxEx already carves caves from a coarse 3D noise grid at `CAVE_STEP=4` — same machinery). Dolines = NATIVE surface stamps; collapse sinks = stamp *above* an existing cave void; tower karst = the **residual-mask** trick (same shape as `tectonicRangeHeight`'s land-gated masks). The water-table can reuse an aquifer noise. No new tier.

### Stage G — Weathering & mass wasting *(the missing "relaxation" pass)*
- **Ideal:** iterate gravity until no slope exceeds the material's angle of repose; weather rock into regolith and soil.
- **VoxEx:** **APRON (talus) + NATIVE (weathering/soil).** The one genuinely new *pass* worth adding is **angle-of-repose relaxation** — a bounded slump sweep. Its influence radius is finite (material only travels so far), so it fits the `heightPad` apron if the pad is widened to the max slump distance, or runs in the deferred `NEIGHBOR_UPDATE` window. Differential weathering → hoodoos/mesas is the Stage-B hardness field feeding erosion. Soil horizons (grass→dirt→saprolite→bedrock), regolith depth, oxidation tint, laterite/peat are all **NATIVE per-column dressing** — a natural extension of the existing material cascade, run last.

### Stage H — Coastal
- **Ideal:** waves erode cliffs and redistribute sediment along the whole shore.
- **VoxEx:** **APRON, partly shipped.** CCR WS8 already added fjords, relief-sharpened **cliffs**, and flow-driven **deltas**, plus water-proximity beach sand. Cliffs/beaches are a band around sea level (APRON). The one REGION-ish piece — **longshore drift** walking the coastline — is DEFER/APPROXIMATE: fake spits/bars as bounded stamps at coastline bends rather than simulating alongshore transport.

### Stage I — Aeolian *(missing; pure NATIVE)*
- **Ideal:** saltation transports sand; dunes migrate and orient to the wind regime.
- **VoxEx:** **NATIVE.** Dunes = anisotropic noise oriented by a wind field (stretch the noise domain along/across wind for transverse/linear), with a **slipface clamp at ~34°** that reuses the same angle-of-repose relaxation primitive as talus. Loess = additive silt blanket. Yardangs = anisotropic subtractive noise. All per-column; gate on arid biome + dry surface.

### Stage J — Ores, minerals, sediment *(missing; NATIVE + reuse)*
- **Ideal:** ores concentrate by depth/host-rock/hydrothermal history; sediments sort by transport energy.
- **VoxEx:** **NATIVE.** Veins = thin 3D Worley threads in basement; porphyry = disseminated blob; banded iron = a stratigraphic band; coal = flat lenses; placers = rare heavies in river/beach sediment **downstream of a lode** (reuses the flow raster). Grain-size sorting = choose the surface sediment block from `f(slope, flow, distToRidge)` — the flow raster already exists. All per-column/per-voxel, gated on the lithology stack.

### Stage K — Biotic
- **Ideal:** vegetation cover modulates erosion; roots reinforce slopes.
- **VoxEx:** **NATIVE, free.** VoxEx already has biome + tree density. Thread a **`(1 − vegetationDensity)` multiplier through every erosion coefficient** (including the orogen bake's erodibility and the talus rate) — a field lookup, no new pass. Root reinforcement = raise the local repose threshold where vegetation is dense.

---

## 3. The overhauled pass order (four tiers)

The current order is a single per-chunk sequence (caches → terrain+caves → water → trees → light → neighbour). The overhaul **keeps that chunk sequence as the innermost tier** and formalizes the two outer tiers VoxEx already has ad hoc, plus the reserved feature tier. Read top-to-bottom; each tier feeds the next.

### Tier R — Region bakes *(cached per region key; seeded; halo-bounded; first-demand, amortized over all chunks in the region)*
This is where **every globally-coupled process lives.** Output is a small set of bilinear-samplable rasters.

```
R1  PLATES & REGIMES      plateLookup — analytic plate/boundary/regime/uplift field          [HAVE]
R2  OROGEN + EROSION BAKE  buildOrogenRegion — stream-power Δh + flow raster                  [HAVE]
                          → generalize erodibility to read the Stage-B hardness field (differential erosion)  [NEW coupling]
R3  HYDROLOGY             hydroRegionCache — drainage trace + priority-flood + flow-accum      [HAVE]
                          → + lakes at minima, endorheic basins, snowLine glaciation flags    [NEW, hydro v2]
R4  CLIMATE & SEDIMENT    coarse temp/humidity/precip (rain-shadow from R2 relief) +          [NEW]
                          sediment-energy raster (from R3 flow) for grain-size sorting
```
*Rule: a process belongs in Tier R iff "the answer here depends on faraway there." Everything here obeys the determinism contract (`_orogenBaking`-style recursion guards, LCG-from-region-key, stable sort, halo ≥ max influence).*

### Tier C — Per-column height & classification *(precalculateTerrainCaches / terrainSurface; pure `f(gx,gz)`, +2 padded ring)*
```
C1  HEIGHT ASSEMBLY   sample R1–R4 rasters (uplift, erosion Δh, river factor, flow, climate)
                      + fractal detail → height = f(C, E, region-samples). Pure & up-front.   [HAVE, extend]
C2  RIVER FACTOR→CARVE getRiverFactor/riverFactorAt → applyRiverCarve (valley then channel)    [HAVE]
C3  LITHOLOGY STACK    stratigraphic sampler + hardness/erodibility field (feeds R2 — see §4)  [NEW, NATIVE]
C4  BIOME RESOLVE      resolveBiome — but feed relief in (the known label/shape fix)            [HAVE, fix]
```

### Tier V — Per-voxel chunk fill *(generateTerrainPass)*
```
V1  MATERIAL CASCADE   by height/strata/biome/hardness → extend with lithology bands,          [HAVE, extend]
                       ores, grain-size-sorted sediments, soil horizons
V2  3D CARVES          caves (coarse 3D noise) + karst/lava-tube/arch carves                    [HAVE + NEW, NATIVE 3D]
V3  WATER FILL         fillWaterPass (+ aquifer/lake fill for cave & minima water)              [HAVE, extend]
```

### Tier A — Apron / neighbour passes *(heightPad ring + deferred NEIGHBOR_UPDATE)*
```
A1  TALUS RELAXATION   angle-of-repose slump (bounded) — the one new mass-wasting pass          [NEW, APRON]
A2  GLACIAL CROSS-SEC  U-profile widen/flatten along R3 network above snowLine                  [NEW, APRON]
A3  COASTAL BAND       cliffs/beaches/dunes-slipface around sea level                           [PARTLY HAVE]
A4  DECOR + LIGHT      trees, sunlight, blocklight, section analysis, neighbour reconciliation  [HAVE]
```

### Tier F — Feature / set-piece pass *(the reserved FEATURES = 128 hook)*
```
F1  SET-PIECES   deterministic jittered-grid placement of mesas, hoodoos, arches, volcanic     [NEW — socket exists]
                 plugs, karst towers, etc., selected by region/biome/hardness zone; each a
                 bounded stamp or 3D carve, chunk-batched like the magic-system carves.
```

**Why this ordering.** It is the companion doc's 20-step geologic sequence, folded onto VoxEx's execution model: *global processes* (plates → erosion → hydrology → climate) resolve **once per region** in Tier R; *the pure height field* samples them in Tier C; *materials and 3D detail* fill in Tier V; *finite-influence relaxation and reconciliation* happen in the Tier A apron; and *discrete landmarks* stamp in Tier F. Nothing samples a later tier. It generalizes precisely the two bespoke caches VoxEx already ships into one organizing principle.

---

## 4. Determinism & seam rules any new pass must obey (VoxEx-specific)

These are not optional — they are what "maintain the current format" *means*:

1. **Pure function of `(seed, coords)`.** No `Math.random`, no `Date`, no dependence on visit order or neighbour-load order. Region-scope randomness comes from an LCG seeded on the region key.
2. **Byte-parity worker ↔ main.** New gen functions are injected via `Function.toString()`; edit main-thread source only and run `parity-check.mjs`. `noise2Dd` is *algebraically equal but not bit-identical* to `noise2D` — rerouting either shifts all terrain by float epsilons.
3. **Region bakes need a halo ≥ max feature influence** (orogen 1024, hydro 32-from-pit) or you get seams; and a **recursion guard** if the bake samples the same function it feeds (`_orogenBaking` returns 0 for `tectonicErosionAt` *during* the bake — "without it the bake input includes a previous bake").
4. **Height stays pure and computed up front** so the `heightPad` slope/aspect analysis matches across borders. An apron pass may *read* neighbour height but the base height function must be border-identical.
5. **Biome may read relief, but must never feed height** — the one-directional coupling that keeps the "label and shape agree" fix from resurrecting border seams.
6. **Every terrain-output change bumps `TERRAIN_GEN_VERSION`** (saved chunks regenerate) and must clear the gate ladder: prototype in Node (`terrain-probe.mjs` hillshade/stats before *and* after, `terrain-node-checks.mjs` on ≥3 seeds) → `parity-check.mjs` → browser worker-parity suite.
7. **First-demand region-bake cost is the real budget ceiling.** `buildOrogenRegion` already measures **4.0–5.8 s per region** (a knowing deviation from the 300 ms budget), amortized across the region's chunks and skipped for beltless regions via an 8×8 pre-scan. **This is the single biggest risk in adding more Tier-R sims** (see §6).

---

## 5. Gap table — what VoxEx has vs. what's missing

| Process stage | VoxEx status | Bucket | Effort |
|---|---|---|---|
| Plates / regimes / uplift | **Have** (`plateLookup`, regimes, `tectonicConeHeight`, `tectonicMarginFactor`) | DEFER(analytic) | — |
| Stream-power erosion | **Have** (`buildOrogenRegion` bake) | REGION-BAKE | — |
| Drainage / flow accumulation / rivers | **Have** (`hydroRegionCache`, priority-flood, flow→width) | REGION-BAKE | — |
| Belt rivers from erosion flow | **Have** (CCR-004 flow raster) | REGION-BAKE | — |
| Coastal cliffs / fjords / deltas | **Have** (CCR WS8) | APRON | — |
| Caves | **Have** (coarse 3D noise) | NATIVE 3D | — |
| Biomes | **Have** (cosmetic skins; known label/shape mismatch) | NATIVE | fix (feed relief) |
| **Lithology / stratigraphy / hardness field** | **Missing** | NATIVE | Medium — *unlocks differential erosion* |
| **Differential erosion (mesas/hoodoos/ledges)** | **Partial** (hardness not first-class) | REGION-BAKE(reuse) | Medium |
| **Angle-of-repose / talus relaxation** | **Missing** | APRON | Medium |
| **Glaciation (U-valleys/cirques)** | **Missing** (fjords only) | APRON(reuse network) | Low–Medium |
| **Volcanic edifices/flows/columns** | **Partial** (cones only) | NATIVE+APRON | Medium |
| **Karst caves / towers / sinkholes** | **Missing** | NATIVE 3D | Medium |
| **Aeolian dunes / loess / yardangs** | **Missing** | NATIVE | Low–Medium |
| **Soil horizons / regolith / weathering** | **Partial** (altitude cascade) | NATIVE | Low |
| **Ores / minerals / sediment sorting** | **Missing** (grain sorting unused despite flow raster) | NATIVE | Low–Medium |
| **Set-pieces (arches, plugs, hoodoos…)** | **Missing** (FEATURES bit reserved, no producer) | NATIVE/APRON via FEATURES | Medium |
| Deposition (deltas/fans/floodplains) | **Partial** (deltas subtle) | APRON | Medium |

**Read of the table:** VoxEx has already built the *hard* two-thirds — the tectonic and hydrologic region tiers, the streaming/determinism discipline, and even the reserved feature socket. What's missing is mostly **NATIVE per-column/per-voxel passes** (lithology, soil, dunes, ores, karst) that carry *no* new streaming risk, plus **one new APRON pass** (talus relaxation) and **one high-value coupling** (hardness → the existing erosion bake).

---

## 6. Recommended overhaul sequence (highest leverage, streaming-safe first)

1. **Formalize the region-bake tier as one abstraction.** Today it's two bespoke caches (`_orogenRegionCache`, `hydroRegionCache`) with hand-rolled halos, determinism guards, LRU, and pre-scans. Extract a single `RegionField` concept (region key → seeded bake → halo'd raster → bilinear sampler) so every future global process plugs in the same way. This is refactor-only, no `TERRAIN_GEN_VERSION` change, and it's the foundation for everything below.
2. **Add the lithology/hardness field (NATIVE) and couple it into the existing erosion bake.** A pure per-column stratigraphic sampler + an `erodibility` scalar that `buildOrogenRegion` reads → **differential erosion (mesas, hoodoos, ledges, caprock) for near-free**, because the erosion sim already runs. Highest realism-per-effort item on the board.
3. **Add angle-of-repose relaxation (APRON).** One bounded slump pass in the `heightPad`/`NEIGHBOR_UPDATE` window — gives every slope a stable profile and produces talus, and is *reused* by dune slipfaces and scree.
4. **Extend the hydro tier: lakes at minima + glaciation flags,** then U-valley/cirque carving along the network above `snowLine` (fjords already work). Reuses the drainage polylines you already trace.
5. **Populate the FEATURES pass** with set-piece stamps keyed to hardness/biome/regime zones (mesas, hoodoos, plugs, arches, karst towers).
6. **Fill the remaining NATIVE passes** (karst, aeolian, soil horizons, ores, grain-size sorting from the existing flow raster) as independent per-column/per-voxel additions.

**The two things to prototype before committing** (the real risks, honestly flagged):

- **Region-bake cost stacking.** One orogen bake is already 4–6 s/region on first demand. Adding more Tier-R sims (a separate glacial network, a separate sediment bake, a climate bake) multiplies first-visit stalls. The mitigation is a **shared, single-pass region bake** that outputs *all* rasters at once at a common `EROSION_CELL`, plus aggressive beltless/oceanic pre-scan skipping — not N independent bakes. Measure this before adding the second sim.
- **The hardness ↔ erosion data-dependency.** Differential erosion wants the **hardness field before the erosion bake**, but a full geologic model has hardness partly *revealed by* erosion depth (unroofing). VoxEx already resolved an identical circularity for `height → river factor → carve` by **staging** it. Use the same staging: compute a *pre-erosion* hardness field from the stratigraphic column (pure `f(gx,gz,y)`), bake erosion against it, then let the material cascade read *post-erosion* exposure. Don't attempt a fixpoint.

---

*Bottom line: VoxEx doesn't need a new paradigm to become process-based — it needs to generalize the region-bake pattern it already ships and populate the empty stages, almost all of which are streaming-safe NATIVE passes. The infinite, deterministic, noise-driven contract is preserved throughout because the one architecture that could threaten it — global iterative simulation — is already boxed inside seeded, halo-bounded, cached region tiles that the pure per-column height function merely samples.*

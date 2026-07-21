# Real-World Terrain Formation → Voxel Worldgen: A Process Catalog

*A clean-slate survey of (1) how procedural/voxel games build terrain, and (2) the real-world geological and geomorphic processes worth mimicking — each tagged for how cheaply it can be faked at world-load time, on a small voxelized scale, in seconds rather than over the millions of years nature takes.*

---

## 0. How to read this document

The core idea: real landscapes are not noise — they are the **accumulated output of an ordered chain of processes**. Tectonics builds the bones, rock layers set what's hard and soft, water and ice carve, gravity relaxes, wind and waves finish, and life and chemistry dress the surface. A world-load generator can't run those processes for a million years, but it *can* run a cheap, one-shot **approximation of each process in the right order** — and because the order is what makes real terrain look coherent, respecting the order buys most of the realism for a fraction of the cost.

Every process below is tagged so you can triage what to build:

**Cost tier** — how expensive the fake is at load time:

| Tier | Meaning | Typical technique |
|------|---------|-------------------|
| **T0** | Per-column, closed-form. Cheapest — fits a heightmap pass. | One height value / material per (x,z) from a formula |
| **T1** | 2D neighborhood / kernel over the grid. | Blur, slope-limit, stamp, mask |
| **T2** | Iterative or graph/network pass; several sweeps. | Flow accumulation, angle-of-repose relaxation, erosion iterations |
| **T3** | True 3D volumetric carve/deposit. Can't be a heightmap. | Caves, overhangs, arches, tubes |

**Representation** — heightmap (2.5D, one surface per column) vs. **3D voxel field** (needed for anything that folds back on itself: overhangs, caves, arches, floating rock).

**Fakeability / payoff** — how faithfully a *cheap* approximation captures the *look*. High = a simple trick nails it; Low = you need a real simulation or it reads wrong.

**Ordering** — where in the pipeline it must run, and what it depends on. This is the most important tag: many processes are cheap *only because* an earlier pass already computed the field they read (a river carve is cheap if flow-accumulation already ran; a collapse sinkhole is cheap if a cave void already exists).

Part 1 is the voxel toolbox. Part 2 is the process catalog, ordered as a pipeline. Part 3 is a menu of recognizable "set-piece" landforms. Part 4 is a proposed master ordering and the handful of reusable primitives that implement most of it. Part 5 is a build-priority shortlist. Appendices hold a starter block palette and sources.

---

# PART 1 — The voxel terrain toolbox

Before mimicking nature, here is the set of techniques procedural and voxel games actually use. Real-world processes get *implemented* on top of these.

## 1.1 Noise & heightmap methods (the workhorses)

A **heightmap** stores one surface height per (x,z). It is cheap, cache-friendly, and sufficient for the majority of terrain — but it *cannot* represent overhangs, caves, arches, or floating islands (those need §1.2).

- **Base coherent noise.** Value noise (cheapest, blobby, grid-aligned), **Perlin** (smooth, faint 45°/90° artifacts), **Simplex / OpenSimplex2** (smoother, more isotropic, scales better into 3D — the usual default in open-source voxel engines). All are per-sample cheap.
- **Fractal Brownian motion (fBm).** Sum N octaves of a base noise, each at higher frequency (`lacunarity`, default 2.0) and lower amplitude (`persistence`/`gain`, default 0.5). This is *the* "terrain look": rolling hills plus fine detail. Cost is linear in octave count. Higher persistence = rougher.
- **Ridged multifractal.** Invert the absolute value per octave (`ridge = (1−|noise|)²`), optionally weight each octave by the previous one. Produces **sharp mountain ridge-lines and dendritic crests** — the single best cheap trick for "mountainous." Same cost class as fBm.
- **Billow noise.** `2·|noise|−1` — puffy, rounded bulges; good for dunes and rolling boulders. The inverse partner to ridged.
- **Domain warping.** Feed noise coordinates through *other* noise: `f(p + A·fbm(p))`. This is the strongest single trick for making noise "look natural" — it bends grid-aligned ridges into organic, meandering, erosion-like swirls. Iterated warping (`f(p + fbm(p + fbm(p)))`) compounds it (diminishing returns past ~2 levels).
- **Analytic derivatives.** Some noise implementations return the value *and* its gradient nearly for free. This gives exact slope/normals for shading, material and tree gating, and enables a cheap **"erosion-look" fBm** that damps each octave's amplitude where the accumulated slope is already steep (flattens detail on steep faces without simulating anything).
- **Redistribution & terracing.** Reshape the height histogram with `pow(h, k)` (k>1 flattens valleys, sharpens peaks); quantize with `round(h·n)/n` for stepped plateaus/strata. Both are trivial per-column post-passes.
- **Masks & spline maps.** Radial/island masks force continents and coastlines. The **Minecraft-style spline approach** uses several low-frequency "climate" noises — **continentalness** (ocean↔inland), **erosion** (mountainous↔flat), **peaks-and-valleys** — each pushed through an authored spline to yield a height *offset* and vertical *squash factor*. The same axes drive biome choice, so **shape and label agree by construction** (you never get a "mountains" biome painted on a flat plain).
- **Composition operators.** `add` layers detail; `multiply`/`mask` gates one field by another (ridges *only* where a mountain mask is high); `min`/`max` carve or union; `lerp` blends terrain types. This is the connective tissue of every pipeline.

## 1.2 Beyond the heightmap: 3D density fields

To get overhangs, caves and arches you evaluate a **3D density field** `d(x,y,z)`; solid where `d>0`, air/fluid otherwise (the surface is the `d=0` isosurface).

- **Density from a vertical bias + 3D noise:** `d = (surfaceH(x,z) − y)·squash + noise3D(x,y,z)`. The heightmap still dominates (keeps plains flat and cheap); the 3D noise, injected only in a band around the surface and underground, is what lets the surface fold back into overhangs. A steeper "squash" flattens toward a pure heightmap; a gentler one yields more overhangs and floating chunks.
- **Cost.** 3D noise is evaluated *per voxel* (O(volume)), ~80× a heightmap for a tall chunk. Mitigation (used by Minecraft): sample the 3D noise on a coarse cell grid (e.g. every 4 blocks horizontal, 8 vertical) and trilinearly interpolate; short-circuit where the vertical bias alone forces the sign.
- **SDF / carver framing.** Treat terrain as a field you can do arithmetic on: `max(field, −carverSDF)` subtracts a cave/tunnel; `min`/`smoothmin` unions primitives. A river is `heightmap − valleyProfile(distToChannel)`; a tunnel is a subtracted swept capsule. This is the clean way to bolt 3D features onto a 2D base without special-casing each one.
- **Meshing the field.** *Blocky* worlds skip isosurface extraction and emit cube faces, then **greedy-mesh** (merge coplanar same-material faces) — orthogonal to how voxels were generated. *Smooth* worlds extract an isosurface: **Surface Nets** (fastest, rounds edges), **Marching Cubes** (industry default; *cannot represent sharp edges*), **Dual Contouring** (*preserves sharp edges/creases* via a QEF solve, needs gradients), **Transvoxel** (a Marching-Cubes variant that stitches **crack-free seams between chunks of different LOD** — the standard fix for LOD popping).
- **3D cave noise.** 3D Worley/cellular gives rounded chambers (F1) and connected tunnels (F2−F1). The **cheese / spaghetti / noodle** taxonomy (Minecraft 1.18) layers three carvers: cheese = big caverns (low-freq noise thresholded, with pillar noise so they aren't hollow), spaghetti = long winding tubes (a 3D noise band near an isovalue), noodle = thinner squigglier tubes. Each is an independent subtractive term.
- **Aquifers.** Fill carved cavities *contextually* from a coarse local water-table noise instead of "everything below sea level is water" — so caves can hold perched lakes or be dry, and lava fills the deep.

## 1.3 Placement, biomes, and streaming

- **Feature scatter.** True Poisson-disk sampling guarantees minimum spacing (blue-noise) but is sequential/stateful; the **jittered grid** (one hashed random point per cell, `hash(seed,cx,cz)`) is the stateless, deterministic, chunk-friendly approximation everyone actually uses for infinite worlds. Validate each candidate against slope/altitude/biome afterward.
- **Determinism.** Every generator must be a **pure function of world coordinates + seed** — no dependence on visit order, no float drift — or chunks won't match across workers/reloads. Cross-chunk features (rivers, big trees, light) need overlap sampling or a border-reconciliation pass.

## 1.4 The two realism multipliers: hydraulic & thermal erosion

These are the passes that make noise stop looking like noise. Both operate on a finished heightmap.

- **Hydraulic erosion (droplet/particle sim).** Spawn tens of thousands of water droplets; each picks up sediment on steep ground (capacity ∝ slope·speed·water) and drops it on flat ground, carving **dendritic V-valleys, channels, and sediment fans**. The single biggest realism boost noise can't fake — but **iterative and expensive** (hundreds of thousands of droplet steps; ~10–20 s on CPU for a mid map). Reserve full sims for offline bakes; approximate at load time with flow-accumulation carving (§2.3).
- **Thermal erosion (talus / angle-of-repose sim).** Repeatedly move material downhill wherever the local slope exceeds the material's stable angle, until nothing is too steep. Manufactures **talus/scree slopes** and knocks the spikes off cliffs. Cheaper per iteration than hydraulic; a few sweeps suffice. This same "slope-limited relaxation" primitive reappears all over Part 2 (talus, dune slipfaces, sediment settling).

## 1.5 How shipped games actually do it (brief)

- **Minecraft (Java 1.18+):** 3D density field on a coarse interpolated grid; continentalness/erosion/peaks-and-valleys noises → splines → height offset + squash added to 3D Perlin (so terrain overhangs); same climate axes pick biomes; cheese/spaghetti/noodle caves; aquifers; strict order noise → surface → carvers → features. The best-documented modern reference pipeline.
- **No Man's Sky:** voxel/density fields stored in octrees on cube-sphere planets, polygonized (dual-contouring family) for caves/arches/overhangs; a composable stack of small noise/SDF deformers per planet; triplanar texturing at planet scale.
- **Dwarf Fortress:** not noise-sculpting but **simulation** — midpoint-displacement elevation, then correlated rainfall/temperature/drainage/volcanism fields, then an erosion-cycle pass and drainage-traced rivers. Terrain is a *consequence* of simulated water. (The philosophical opposite of Minecraft, and the closest to "mimic the processes.")
- **Astroneer / Deep Rock Galactic:** fully deformable signed-density voxel fields meshed with marching-cubes/dual-contouring; edits add/subtract density and re-polygonize only touched chunks.
- **Terraria:** 2D, but an instructive model — an ordered **sequence of named passes** (terrain → biomes → caves → structures → ores → liquid settle → decoration), each mutating a shared grid. The "pipeline of passes" mental model this whole document uses.

---

# PART 2 — The process catalog (ordered as a pipeline)

Presented in the order they should run. Each entry: **what it is** (real mechanism + real timescale), **what it makes**, **how to fake it** at load time, and the feasibility tags.

## Stage A — Tectonic bones (the large-scale structure)

Everything else reads from this. The trick is a **plate/boundary field** computed once, that every later pass consults.

- **Plate framework.** *Real:* ~15 rigid lithospheric plates drift 1–15 cm/yr; boundary type dictates where mountains, basins and coasts sit. *Fake:* seed N points, build a **Voronoi partition** = plates; give each a drift vector and a type (oceanic = low base height, continental = high); per column compute nearest plate + **distance-to-nearest-boundary**, and classify each boundary as convergent / divergent / transform from the two plates' relative motion. **T1–T2, 2D field. Runs FIRST — foundation for all of Stage A.** Payoff: high (turns uniform noise into a world with a *reason* for its mountains).
- **Divergent — mid-ocean ridge.** *Real:* plates part, new crust forms, cools and deepens ∝ √age. *Fake:* ridge bump peaking at the boundary line + √distance seafloor-deepening away from it. **T0, cheap.**
- **Continental rifting (East African Rift type).** *Real:* crust stretches and drops into a fault valley with uplifted shoulders and volcanoes. *Fake:* narrow linear trough (negative band on the boundary) with raised Gaussian shoulders; stamp axial volcano cones; pair with a lake-fill pass. **T0–T1, cheap–moderate.**
- **Convergent — oceanic subduction / volcanic arc (Andes, Cascades).** *Real:* ocean plate dives under; trench offshore + a volcanic mountain arc set ~100–300 km inland; rugged active coast. *Fake:* carve a trench (sharp negative band on the ocean side), add a broad arc-uplift ridge **offset inland** by a fixed distance (peak *not* at the boundary), stamp discrete volcano cones along that line. **T1–T2, moderate.**
- **Convergent — continental collision (Himalaya type).** *Real:* neither plate subducts, crust doubles to ~60–70 km thick → the highest, broadest belts + a high plateau (Tibet) + flanking foreland basins. *Fake:* a **wide, tall uplift envelope** (broad plateau across a thick band both sides of the boundary) scaled by closing velocity, with ridged noise layered on top for peaks. **T1–T2, moderate.** Feeds isostasy + foreland-basin passes.
- **Fold-and-thrust belts.** *Real:* compression crumples layered rock into parallel anticline/syncline ridges (Appalachian Valley-and-Ridge, Zagros). *Fake:* a directional sinusoid `h += amp·sin(distanceAlongCompressionAxis·freq)` with crests **perpendicular to convergence**, amplitude tapering off the belt. **T0, cheap.** Runs on top of the collision uplift.
- **Thrust faults.** *Real:* low-angle reverse faults push crust up-and-over, stepping the surface. *Fake:* a few directed line features that add a one-sided height step (steep front, gentle back-slope). **T0, cheap.** Detail pass on the belt front.
- **Fault-block / Basin and Range (extension).** *Real:* stretching breaks crust into up-thrown **horsts** (ranges) and down-dropped **grabens** (sediment-filled basins) — dozens of parallel ranges. *Fake:* parallel striped bands with alternating up/down tilted blocks and flat-filled graben floors. **T0, cheap.** Follow with a basin flatten/fill.
- **Broad uplift & plateaus (Colorado Plateau, Tibet).** *Real:* whole regions rise 1–5 km with little deformation; rivers then incise the flat deck. *Fake:* a large low-freq plateau mask set to a high near-constant height with a **steep edge falloff**, *then* let the river pass cut canyons into it. **T1, moderate.** Must precede river carving so canyons incise the raised deck.
- **Isostasy & rebound.** *Real:* mountains float on deep low-density roots; as erosion strips the top, the root rebounds, so ranges stay high. Post-glacial rebound is the fast analog (up to ~11 mm/yr in Scandinavia / Hudson Bay). *Fake:* after erosion, add `h += k·smoothedUplift` so eroded highlands don't collapse to sea level; optional broad rebound dome over a "recently deglaciated" flag. **T0, cheap. Runs AFTER erosion** (it's the answer to erosion).
- **Hotspot chains (Hawaii).** *Real:* a fixed mantle plume burns through a moving plate → an age-progressive line of volcanoes, tall/young at one end, eroded/submerged seamounts at the other. *Fake:* pick a plume point + drift vector, stamp a line of cones whose height **decays with distance** (so far ones sit below sea level). **T0, cheap.** Independent overlay.
- **Passive vs active margins.** *Real:* passive coasts (mid-plate, Atlantic-type) = wide gentle shelf, coastal plain, beaches, deltas; active coasts (on a subduction boundary, Pacific-type) = narrow shelf, steep cliffs. *Fake:* classify each coast by nearest-boundary type; passive → wide gentle offshore gradient + coastal sediment flatten; active → keep the steep trench/arc profile. **T0–T1, cheap–moderate.**

## Stage B — Structure & lithology (what's hard, what's soft, and in what layers)

This is the layer most noise-only generators skip, and it's what makes cliffs, ledges, mesas and banded canyon walls *possible*. The key realization: **rock hardness varies in layers, and differential erosion of those layers is what carves the most recognizable landforms.** So lithology isn't just a coloring pass — a hardness field must exist *before* erosion.

- **The canonical vertical column.** *Real:* everywhere, top-to-bottom: soil → weathered regolith/saprolite → sedimentary beds → crystalline basement (granite/gneiss). *Fake — the master recipe:* per column, from the surface down, assign blocks by depth: `topsoil (grass/dirt) → regolith (dirt/gravel) → sedimentary bands (sandstone/shale/limestone/coal) → basement (granite/gneiss) → bedrock floor`. Band thicknesses and order come from **low-frequency noise** so geology varies smoothly across the map. **T0, cheap — a material-assignment pass after height is decided.**
- **Horizontal bedding / "layer-cake" (Grand Canyon walls).** *Fake:* assign material by absolute Y into named bands, boundaries wobbled by low-freq noise so they undulate. **T0.**
- **Dipping / tilted strata (hogbacks, cuestas).** *Fake:* instead of sampling the band table by Y, sample along a tilted axis: `stratPos = dot(worldPos, dipVector)`; a regional dip vector from low-freq noise tilts the whole cake, and hard bands outcrop as parallel ridges under differential erosion. **T0, one dot product per column.**
- **Folded strata (anticlines/synclines).** *Fake:* make the `stratPos` axis vary with a sinusoidal/curl fold field, so bands arch and dive → eroded folds become zigzag ridge-and-valley. **T0–T1.**
- **Unconformities.** *Real:* older tilted beds eroded flat, then flat new beds laid on top (angular unconformity); or sediment resting straight on basement (nonconformity — the "Great Unconformity"). *Fake:* two stacked stratigraphic samplers split at a noisy surface — below it sample the tilted/folded column and **truncate**, above it lay a fresh flat column (often a basal conglomerate band). **T0, a conditional switch.**
- **Differential erosion → ledges, benches, caprock.** *Real:* hard beds form cliffs, soft beds retreat into slopes; a hard cap shelters soft rock beneath → mesas, buttes, hoodoos. *Fake:* give each band an **erosion-resistance weight** and feed it into the erosion pass (§C/§F): lower each column by `rate ÷ hardness`, and **shield any column that has a hard band above it**. Iterating this on a hard/soft stack *spontaneously* produces mesas and hoodoos. **T1–T2, moderate. This is the one lithology effect that must run *inside* erosion, not after it.** Highest payoff in Stage B.
- **Rock-type palette (see Appendix A).** Igneous (granite basement, basalt caprock, tuff soft-erodes-to-hoodoos), sedimentary (sandstone = hard cliff-former, shale = soft slope-former, limestone = hard but karst-soluble, coal = thin dark marker seam), metamorphic (quartzite = hardest ridge-capper, gneiss = banded basement, slate/schist = mountain-interior bands). Mostly a **T0 material swap**, but each carries a *hardness* used by differential erosion.

## Stage C — Fluvial (water carves the land)

Runs **after** uplift and lithology. The linchpin is one pass — **flow accumulation** — that almost everything downstream reads.

- **Flow routing + accumulation.** *Real:* every point's upstream contributing area is the master variable — discharge ∝ area, channel width ∝ √area. *Fake:* sort columns by height descending; process high→low; each pushes its accumulated area to its steepest downhill neighbor (D8). Fill/breach pits first (priority-flood) so flow reaches the sea. The resulting field *is* a dendritic river network for free. **T2, moderate, one sweep. The single most valuable non-tectonic pass.**
- **Drainage patterns.** Dendritic emerges automatically; bias toward **trellis/rectangular** by warping the flow field with a jointed "structure grain" noise; **radial** by seeding flow away from a peak mask. **T2, cheap add-on.**
- **Channel width from order.** *Fake:* half-width ≈ `k·√area` (hydraulic geometry); or walk the graph once for true Strahler order → width tiers. **T0–T2.**
- **Stream-power incision.** *Real:* `E = K·A^m·S^n` (m≈0.5, n≈1, concavity m/n≈0.5) cuts concave-up valley profiles. *Fake:* lower each channel column by `dt·K·A^m·S^n` over a few iterations — **or**, cheapest, a single "carve-to-profile" pass that sets bed height analytically by integrating the steady-state slope upstream from base level (the χ method) — one pass, realistic concave rivers, no iteration. **T2, moderate.** Strictly after uplift + accumulation.
- **V-valley vs canyon vs slot.** *Fake:* incise the channel, then treat the walls: apply the talus/diffusion pass → V-valley; *skip* it (+ a vertical clamp) → slot canyon/gorge. Tuning the incision-depth : wall-diffusion ratio slides continuously canyon↔broad valley. **T1–T2.**
- **Knickpoints & waterfalls.** *Real:* a base-level drop sends a knickpoint retreating upstream (faster on big-area trunks), leaving waterfalls and terraces. *Fake:* emerges from iterating incision with a lowered outlet; or place explicit vertical steps where the channel crosses a hard-rock band. **T2.**
- **Meanders, point bars, oxbows.** *Real:* helical flow erodes outer banks, deposits on inner; loops cut off into oxbow lakes. *Fake:* don't simulate — **procedurally generate a sinuous centerline** (sine-generated / curvature-biased walk / Chaikin-smoothed) on low-slope reaches, stamp an asymmetric cross-section (deep-steep outer, shallow point-bar inner), and drop an oxbow where a loop nearly touches. **T2 (polyline + stamp), moderate.**
- **Braided rivers.** *Real:* high sediment + steep + erodible banks → many shifting threads. *Fake:* carve several shallow parallel/anastomosing channels separated by bar strips over a wide flat valley; trigger on high slope + aggradation. **T1–T2.**
- **Deposition — floodplains & levees.** *Fake:* flood-fill outward from a lowland channel to a flood height, deposit a flat sediment skirt, raise a thin levee ridge 1–2 blocks on the banks. **T1, cheap.**
- **Deposition — alluvial fans.** *Fake:* detect a mountain-front exit (steep→flat break), stamp a radial cone of deposition, coarse at apex → fine at toe. **T1, cheap.**
- **Deposition — deltas.** *Fake:* where a channel meets sea level, build a low fan and split into 2–4 bifurcating distributaries; pick planform from a wave/tide-energy parameter (bird's-foot = few long fingers; cuspate = smoothed arc; tidal = elongate parallel fingers). **T2, moderate.** Last deposition step.
- **Badlands, rills, gullies.** *Real:* weak, dry, unvegetated fine sediment cuts a very high-density erosion network fast. *Fake:* on flagged weak/arid/steep zones, run a high-density, low-threshold version of accumulation+incision (many tiny closely-spaced channels), or overlay a high-freq dendritic detail-carve. **T1–T2.** Surface-detail stage, last.

## Stage D — Glacial & periglacial (ice sculpts)

Runs after drainage exists (ice reuses valley networks) and, for fjords, before sea level is applied.

- **Glacial trough (U-valley).** *Real:* ice abrades + plucks a pre-existing V-valley into a wide, flat-floored, steep-walled trough — but only above the snowline. *Fake:* walk the drainage network above a `snowLine` elevation; for flagged reaches, replace the V cross-section with a **parabolic U-profile** (widen the band, deepen the thalweg, flatten the floor), then smooth the walls 1–2 passes. **T2.** High payoff — U vs V is instantly readable.
- **Cirque + tarn.** *Fake:* at network sources above snowline, stamp a hemispherical scoop with a raised downhill lip and a steepened headwall; fill the overdeepened floor with water. **T1.**
- **Arête + horn.** *Fake:* emergent — where two cirque/trough carves leave a thin wall, sharpen the residual ridge; a horn appears where ≥3 cirques ring a peak. **T1, post-pass.**
- **Hanging valley.** *Fake:* scale trough incision depth by upstream ice flux (Strahler order); low-order tributaries carve shallower, so their mouths perch above the deep trunk → automatic step + waterfall. **T2.**
- **Fjord.** *Real:* a trough carved *below* sea level, later drowned. *Fake:* allow trough carving to incise below `seaLevel` on coast-crossing valleys (don't clamp the floor), leave a shallow entrance sill; the sea-level flood pass drowns it. **T2.** Must carve before sea level is set.
- **Moraines & till.** *Fake:* deposit lateral ridges along trough shoulders, a transverse terminal ridge across the valley at the terminus (can dam a lake), and a bumpy ground-moraine veneer (mixed dirt/gravel/boulder). **T1–T2.**
- **Drumlins / eskers / kettles.** *Fake:* drumlins = anisotropic Gaussian bumps elongated along ice-flow, blunt end up-ice, scattered in lowland till; eskers = a meandering polyline gravel ridge that *ignores* topography; kettles = circular pits (water-filled) punched into a flat outwash apron. **T1.**
- **Periglacial: frost shattering, talus, patterned ground, solifluction.** *Fake:* on steep high-elevation rock, roughen faces and scatter angular rubble (which the talus pass then piles at ~35°); overlay a Voronoi cell pattern on flat cold ground for stone polygons (cosmetic material overlay); apply gentle downslope soil-creep smoothing + lobe fronts on cold moderate slopes. **T0–T2.**

## Stage E — Volcanic (construction + carving + flow)

Mostly *additive* (build cones) then *subtractive* (craters) then *flood* (lava). Order within the stage: edifice → crater/caldera → lava flow → tube → jointing/plug masks → tephra mantle.

- **Shield / strato / cinder / dome edifices.** *Fake:* radial cone SDFs of different profiles — shield = broad low slope (`h = summit − dist·smallSlope`); stratovolcano = steeper concave curve (`summit − k·dist^1.3`) + summit crater; cinder cone = small cone clamped to the ~30–33° repose angle + deep crater + optional one-sided breach; lava dome = a bulbous metaball blob. **T0–T1, cheap–moderate.**
- **Caldera collapse.** *Fake:* a large flat-bottomed cylinder subtract carved into an existing massif (radius ≫ crater), steep walls, optional central resurgent dome + water fill. **T1, moderate.** After building the massif.
- **Lava flows (pahoehoe/aa).** *Fake:* steepest-descent flood-fill a thin surface layer from the vent that pools in local lows; texture = smooth low-freq noise (pahoehoe) or high-freq blocky displacement (aa) by distance-from-vent. **T2, moderate.**
- **Lava tubes.** *Fake:* carve a tubular air channel along a downhill spline *inside* an emplaced flow (swept-sphere/DDA bore), with occasional roof-collapse skylights. **T3, moderate.**
- **Flood basalt / lava plateau + columnar jointing.** *Fake:* raise a broad flat plateau, quantize Y at flow boundaries for "trap" stair-steps; for columns, a **Voronoi/Worley cell partition** extruded vertically with small per-cell top-height jitter and joint-gap seams (blocky ≈ hexagons at voxel res). **T0 plateau / T1–T2 jointing.**
- **Volcanic plug / neck.** *Real:* magma solidifies in a conduit; softer cone erodes away leaving a resistant tower (Shiprock is a classic neck; **Devils Tower is an eroded igneous intrusion often described as a neck, though its exact origin is debated**). *Fake:* a tall narrow **residual-hardness mask** (cylinder) exempt from the surrounding-terrain lowering pass; optional radial dike-wall lines; columnar jointing on the flanks. **T1–T2.** Define the hardness mask *before* the lowering pass. (Same "residual mask" trick as karst towers.)
- **Maar / tuff ring.** *Fake:* a broad shallow subtract *below* the ground surface + a low raised rim ring; water-fill if below the water table. **T1.**
- **Hydrothermal features & tephra mantle.** *Fake:* scatter small sinter/terrace mound stamps and mud/water pools near volcanic centers (cosmetic); tephra = an additive surface-conformal ash layer thickest near vent and downwind, thinning with distance, filling hollows. **T0–T1.** Tephra is the final volcanic surface pass.

## Stage F — Karst & dissolution (soluble rock dissolves)

Only where the lithology stack placed limestone/gypsum. Order: dissolvability field → big basins → 3D cave network → surface dolines & tower masks → collapse sinks (need the voids) → speleothems/tufa/springs.

- **Dissolvability field (root).** *Fake:* a global 3D "solubility" field (noise + a jointing lattice) gated to soluble blocks, driving all carves below; surface limestone pavement = thin joint-gap carves on flat tops. **T1.**
- **Solution & collapse sinkholes (dolines).** *Fake:* solution type = a smooth conical subtract at scattered points weighted by the field; collapse type = a steep-walled cylinder subtract placed **above an existing cave void**. **T1 / T2.** Collapse sinks must run after the cave pass. Water-fill below the table = cenote.
- **Cave systems.** *Fake:* 3D dissolution noise (ridged/Worley thresholded, biased to a horizontal water-table band) carving air networks, or swept-sphere tubes along descending joint-aligned splines. **T3, expensive.** The core underground pass; feeds sinks, springs, bridges.
- **Speleothems.** *Fake:* after carving, add downward/upward tapering calcite cones at scattered drip points inside cave voids. **T0, cheap decoration.**
- **Tower / cockpit karst (Guilin, Ha Long Bay).** *Real:* extreme dissolution lowers the plain, leaving residual steep towers. *Fake:* the **inverse/residual-mask** trick — lower the whole plain but preserve jittered tower-column masks; if sea-filled → drowned Ha Long islands. **T1–T2.** Define towers before lowering.
- **Poljes / uvalas / natural bridges / tufa.** *Fake:* uvala = union of overlapping doline stamps; polje = a large flat-floored steep-walled basin with an edge ponor + seasonal water; natural bridge = a tunnel carve through a ridge that *keeps a roof band*; tufa = additive stepped rimstone terraces at spring/waterfall outlets. **T1–T3.**

## Stage G — Weathering & mass wasting (gravity and time relax everything)

Runs late, after carving. The unifying primitive is **angle-of-repose relaxation**, and the unifying modifier is a **vegetation-density multiplier** that gates every erosion rate.

- **Angle of repose (the master granular constraint).** *Real:* loose material can't sit steeper than ~34° (dry sand) to ~45° (angular gravel); exceed it and it avalanches. *Fake:* iterate over loose columns — if the drop to a neighbor exceeds the repose threshold, move a block downslope; repeat until stable. **T2, iterative (cap the sweeps).** This one rule underlies talus, dune slipfaces, and all granular settling.
- **Physical weathering (frost, thermal, salt, unloading).** *Real:* freeze-thaw (water expands ~9% freezing) shatters rock; thermal fatigue flakes it; salt crystallization pits coastal rock (tafoni); unloading peels sheeting joints off granite → exfoliation domes. *Fake:* on exposed rock, flag by elevation/aridity/coast fields and convert a thin skin of stone to loose rubble/sand (fed to the talus pass); round hard-rock highs with a convex-biased smoothing for domes. **T0–T1, cheap.**
- **Chemical weathering (hydrolysis, oxidation, dissolution).** *Fake:* hydrolysis = a per-column weathering-front depth (deeper in warm/wet) converting stone→clay/subsoil (feeds soil); oxidation = a cosmetic "rusty" tint where an iron/moisture mask is high; dissolution = §F. **T0, cheap.**
- **Differential weathering → hoodoos/mesas/tors.** *Fake:* see Stage B — protect columns under a hard caprock, erode softer ones faster. **T1–T2.** The marquee sculpting pass.
- **Regolith & soil horizons.** *Real:* O/A/E/B/C/R profile from leaching + accumulation. *Fake — the last dressing pass:* per column from the surface down, grass/humus → dirt/subsoil → saprolite → bedrock, thickness gated by slope + moisture; laterite/duricrust = a hard red cap in hot-wet biomes (which itself becomes caprock); peat = an additive layer in cold wet flats. **T0, cheap. Runs LAST** so soil drapes the *final* landform.
- **Mass wasting (rockfall, slump, debris flow, lahar, creep, solifluction).** *Fake:* rockfall = spawn rubble at cliff feet → talus relaxation; slump = a stamped concave scarp + back-tilted bench + toe bulge at oversteep/undercut banks; debris flow/lahar = flood loose material down existing drainage into a fan; creep/solifluction = a light soil-only smoothing pass. **T1–T2.**

## Stage H — Coastal (waves erode and deposit at sea level)

Runs after `seaLevel` is set. Order: sea-level flood → cliffs → beaches → longshore drift → spits/bars → deltas/estuaries.

- **Sea level (the datum).** *Fake:* flood-fill everything below `seaLevel` as water; optional stepped marine terraces at old stillstands. **T1.** Gates all coastal work.
- **Wave erosion → cliffs & platforms.** *Fake:* in a band at `seaLevel ± waveHeight`, on steep land, cut a notch and steepen the face into a cliff; extend a near-flat wave-cut platform just below sea level. **T1.**
- **Cave→arch→stack→stump.** *Fake:* on protruding **headlands** (convex coastline), carve 3D tunnels through the rock at the wave band; a full perforation = an arch; occasionally detach the seaward remnant as a freestanding stack; shorten some to stumps. **T3, but headland-localized so affordable.**
- **Longshore drift.** *Fake:* a drift-direction vector along the coast; walk the coastline polyline carrying a sediment budget — erode updrift, deposit downdrift. **T2.** Driver for the depositional forms.
- **Beaches.** *Fake:* on low-slope coast, lay a gentle sand ramp from just above to just below sea level (the shallow-slope counterpart to the steep-slope cliff mask). **T0–T1.** High payoff, very cheap.
- **Spits / bars / tombolos / barrier islands.** *Fake:* where the drift polyline leaves the coast, extrude a sand ridge in the drift direction across open water at ~sea level, hooked at the tip; if it seals a bay → lagoon; if it reaches an island → tombolo. **T2.**
- **Deltas / estuaries.** *Fake:* §C delta stamp at river mouths; if the sea drowns the lower valley instead, leave a widening estuary funnel. **T2.**

## Stage I — Aeolian (wind, last; redresses dry unvegetated sand)

Runs last, on dry unvegetated sand-supply surfaces. Every dune shares one rule: a **slipface clamp at the ~34° angle of repose**.

- **Dune fields by wind regime.** *Fake:* choose the form from the wind field + sand supply. **Barchan** (unidirectional, low sand) = crescent stamps, horns downwind, lee clamped to repose. **Transverse** (unidirectional, abundant sand) = anisotropic noise stretched *along* the wind so ridges run perpendicular to it. **Linear/seif** (bidirectional) = anisotropic noise stretched *parallel* to the resultant, with interdune corridors. **Star** (multidirectional) = tall cones with 3–4 radiating arms. **Parabolic** (unidirectional + vegetation) = a barchan *flipped* (arms upwind), seeded from blowouts. **T1, cheap, covers large areas.**
- **Deflation, blowouts, desert pavement, yardangs.** *Fake:* punch shallow bowl depressions in sand (down to a lag base), pile removed sand on the downwind rim; reclass deflated flats to gravel (cosmetic pavement); carve parallel wind-aligned grooves in soft desert rock for yardangs. **T0–T1.**
- **Loess.** *Real:* wind-blown silt draped downwind of glacial outwash/deserts, standing in vertical bluffs (Loess Plateau up to ~335 m). *Fake:* an additive near-uniform soft-silt blanket downwind of source zones, thinning with distance, that supports steep erosion faces later. **T1.**

## Stage J — Ores, minerals & sediment (the material fill)

Runs interleaved with lithology/caves (ores) and as surface dressing (sediments/placers). Ores reference the *host rock they replace*; placers reference *upstream sources*.

- **Grain-size sorting (coarse near mountains, fine near sea).** *Fake:* per surface column, `energy = f(slope, flowAccumulation, distToRidge)` mapped through thresholds to a block ladder: boulder/cobble/gravel (steep, near-source) → sand (mid) → silt → clay/mud (flat, far, near sea). Angular variants near source, rounded far; well-sorted in fast water, poorly-sorted in fans. **T0–T1.**
- **Ore genesis mapped to placement.** Hydrothermal veins = thin 3D Worley/ridge threads through deep basement, clustered on a fault field; porphyry = a large ellipsoidal blob of disseminated copper fading from a rich core; magmatic segregation = flat ore lenses inside mafic plutons; **banded iron** = a dedicated deep stratigraphic package alternating iron-oxide/chert bands; coal = flat pinch-out lenses in sedimentary strata; evaporites = vertically zoned gypsum→salt→potash bands in arid basins; **supergene enrichment** = a rusty gossan cap + rich blanket at the water table (a prospecting tell); **placers** = rare heavy grains (gold, cassiterite) in the bottom of river/beach sediment, on inside meanders, *downstream of a lode source*. **T0–T3 depending on type.** Ores after the stack + caves; placers after rivers + beaches.

## Stage K — Biotic (life stabilizes and builds)

Threads through the whole pipeline as gates and dressing.

- **Vegetation-gated erosion (the free multiplier).** *Real:* vegetated slopes erode orders of magnitude slower than bare ones. *Fake:* scale *every* erosion/weathering coefficient by `(1 − vegetationDensity)` from a biome/tree-density field. **Free (a field lookup).** Threads through every weathering/mass-wasting pass.
- **Root reinforcement.** *Fake:* raise the local repose/failure threshold where vegetation is dense (rooted soil holds a steeper angle). **Free, per-column.**
- **Tree throw, bioturbation, peat, reef, biocrust.** *Fake:* sparse pit-and-mound dimples in forest; a light soil-only mix; additive peat in cold wet flats; additive coral/reef blocks up to just below sea level in warm shallow water near coasts; a desert erosion-resistance flag for biocrust. **T0–T1, mostly cosmetic dressing.**

---

# PART 3 — Iconic set-pieces (recognizable landforms as recipes)

These are the postcard landforms players *recognize*. Each is a composition of three reusable primitives — a **radial/plateau mask**, a **path carve** (reuse the river spline), and a **caprock/material-band overlay** — keyed off an upstream field (a differential-erosion zone, the river network, or sea level). The overhang/hole family needs true 3D carving; the rest are cheap heightmap stamps.

**Cheap heightmap stamps (per-column, chunk-batchable):**

- **Mesa & butte** — flat caprock disc, near-vertical wall falloff, talus skirt below; butte = a narrow mesa. Keys off a caprock zone on arid lowland.
- **Tepui / table mountain** (Roraima) — a *giant* mesa: huge plateau mask, very high flat top, essentially vertical cliff (no talus), noise-warped rim. Keys off a caprock highland.
- **Inselberg / bornhardt** (Uluru, Sugarloaf) — a smooth radial **dome** (bell falloff, steep flanks, rounded top — *no horizontal banding*, uniform hard rock, faint vertical fluting). Keys off an exhumed-pluton mask on a flat plain.
- **Half Dome** — an inselberg dome **clipped by a vertical plane** (rounded three sides, one sheer cliff). Keys off a granite zone, ideally at a glacial valley head.
- **Badlands** — not an object but a **noise field**: high-freq ridged/turbulence at low amplitude-per-distance (close-packed knife ridges + V-gullies) with strong horizontal color banding. The substrate that hosts hoodoos.
- **Karst tower field** (Guilin/Ha Long) — many tall steep bell/cone stamps on a flat base or at sea level; optional 3D undercut caves at the waterline.
- **Layered canyon** (Grand Canyon) — a wide valley carve along a river path with a **stepped staircase** wall cross-section (cliffs at hard bands, benches at soft) and material banded by Y.

**Overhang / hole family (require true 3D voxel carving — budget like cave/tube carves, and verify the lintel/neck stays connected):**

- **Natural arch** — carve a 3D tunnel through a thin rock **fin**, leaving a ≥2-layer lintel on two legs. Keys off a fin/badlands zone.
- **Natural bridge** — same, but the tunnel is aligned with a **river** cutting through a meander neck (water flows under it).
- **Slot canyon** (Antelope) — a very narrow (1–2 wide), deep (10–25), sinuous vertical trench along a river-spline path; pinched at the floor. Keys off a small tributary on soft sandstone.
- **Goosenecks / entrenched meanders** — the canyon carve with meander amplitude cranked and near-vertical walls, preserving the hairpin planform.
- **Balancing / pedestal rock** — a thin neck with a wide caprock boulder overhanging on all sides (an exaggerated single hoodoo).
- **Hoodoo** (Bryce) — a thin vertical stem with a wider hard caprock ring mushrooming the top; color-banded; scattered in fields inside a badlands amphitheater. (Mostly heightmap, tiny 3D cap lip.)
- **Columnar basalt colonnade** (Giant's Causeway) — a Voronoi/hex cell partition, each cell extruded to a slightly different top height (stepped-tile look), uniform dark hard rock; pairs with coasts and plugs.
- **Volcanic plug** (Devils Tower / Shiprock) — a steep tall tower stamp + columnar-basalt fluting on the outer shell, isolated on a flat plain.
- **Fjord** — a long narrow deep **U-valley** carve reaching below sea level, flooded to the waterline, with hanging tributary notches.
- **Sea stack** (Old Man of Hoy, Twelve Apostles) — a narrow vertical pillar of headland rock standing just offshore, surrounded by water; optional collapsed-arch stub.

---

# PART 4 — A proposed master pipeline

The whole catalog collapses to one ordered sequence. Each stage reads fields the previous stages wrote; that data dependency is *why* the fakes are cheap.

```
 1. PLATES        Voronoi plates + boundary classification (convergent/divergent/transform)
 2. TECTONIC LIFT per-boundary uplift/rift/trench/arc/collision height fields
 3. STRUCTURE     fold-thrust + fault-block overlays; plateau masks; hotspot cone chains
 4. LITHOLOGY     assign the rock stack + hardness field (bands, dip, folds, unconformities)   ← hardness must exist before erosion
 5. DRAINAGE      flow routing + accumulation (the master hydrologic field)
 6. GLACIAL       U-trough / cirque / fjord carving above snowline (fjords before sea level)
 7. FLUVIAL       stream-power incision (differential-erosion aware) → knickpoints
 8. HILLSLOPE     diffusion + angle-of-repose relaxation (talus, valley walls)
 9. DEPOSITION    floodplains → levees → alluvial fans → deltas
10. VOLCANIC      edifices → crater/caldera → lava flow → tubes → jointing/plug masks → tephra
11. KARST         dissolvability → caves → dolines/towers → collapse sinks → speleothems/tufa
12. WEATHERING    physical/chemical weathering; differential weathering → hoodoos/mesas
13. MASS WASTING  rockfall/slump/debris sourcing → repose relaxation (settle debris)
14. ISOSTASY      rebound adjust (answers the erosion just done)
15. SEA LEVEL     flood-fill below seaLevel; marine terraces
16. COASTAL       cliffs → beaches → longshore drift → spits/bars → estuaries
17. AEOLIAN       dunes (by wind regime) → deflation/yardangs → loess blanket
18. ORES          veins/porphyry/magmatic/stratabound/BIF into solid rock; placers in river+beach sediment
19. SOIL DRESSING grain-size sorting; soil horizons; laterite/peat/reef/biocrust; oxidation tint  ← LAST, drapes final landform
20. BIOTA GATE    (threaded through 7–19) vegetation-density multiplier on every erosion coefficient
```

**The reusable primitives** — build these once and most stages are a thin call over them:

1. **A field cache** keyed on (x,z): plate id, distance-to-boundary, boundary type, base height, hardness, flow-accumulation, drainage direction, vegetation density, distance-to-ridge, distance-to-coast. Every stage reads and writes here.
2. **Flow accumulation** (one downhill sort + sweep) — powers rivers, valleys, glaciers, debris flows, placers, grain sorting.
3. **Angle-of-repose relaxation** (slope-limited slump) — powers talus, dune slipfaces, sediment settling, scree.
4. **Residual-hardness mask + lowering pass** — "define what resists, then lower everything else" — powers mesas, buttes, hoodoos, volcanic plugs, karst towers, inselbergs.
5. **Flood-fill** (fill below a level) — powers oceans, lakes, lava flows, aquifers, deltas, fjords.
6. **Path carve along a spline** (with a cross-section profile) — powers rivers, canyons, slots, fjords, lava tubes, eskers, natural bridges.
7. **Radial/plateau mask stamp** — powers volcanoes, domes, mesas, towers, craters.
8. **Stratigraphic sampler** (`material = bandTable[dot(pos, dipVector)]`) — powers all lithology, canyon walls, differential erosion.

Note the payoff structure: primitives 2, 3, and 4 alone — flow accumulation, repose relaxation, and residual-mask lowering — deliver rivers-with-valleys, stable talus slopes, and the entire mesa/butte/hoodoo/tower/plug family. They are the highest-leverage things to build.

---

# PART 5 — Build-priority shortlist (biggest realism per unit cost)

If you implement in this order, each step visibly improves the world before the next:

1. **Plate/boundary field + tectonic uplift (Stage A).** Turns "noise" into "a world with mountain belts and basins that have a reason to be where they are." Moderate cost, transformational payoff.
2. **Lithology stack with a hardness field (Stage B).** Cheap (a material pass) but *unlocks* differential erosion — the prerequisite for cliffs, ledges, mesas, and banded canyons.
3. **Flow accumulation + stream-power incision (Stage C).** The biggest single realism jump after tectonics: real drainage networks and concave valleys, cheaply, via the χ one-pass carve.
4. **Angle-of-repose relaxation (Stage G).** One iterative primitive that gives every slope a believable, stable profile and produces talus for free.
5. **Differential weathering (Stages B+G).** The residual-mask trick → mesas, buttes, hoodoos, tors, plugs, karst towers all fall out of one mechanism.
6. **Sea level + beaches/cliffs (Stage H)** and **U-valley glaciation (Stage D).** Cheap, high-recognition coastal and glacial reads.
7. **Soil-horizon dressing + vegetation-gated erosion (Stages G+K).** The finishing layer that makes surfaces look lived-on and ties erosion to biomes for free.
8. **Set-pieces & 3D features (Part 3).** Caves, arches, slot canyons, columnar basalt — the expensive-but-memorable T3 carves, added last and selected by biome/zone.

Everything else (deltas, dunes by regime, karst cave systems, ore genesis, iconic set-pieces) is incremental polish layered on this spine.

**What this document does *not* settle:** exact parameter values (erosion K, snowline, repose angles per material, band thicknesses) are tuning problems that need iteration against your voxel scale and chunk budget; and the true-3D features (Part 3's overhang family, karst caves) carry a real per-voxel cost that must be measured, not assumed, against your load-time budget. Those are the two areas to prototype before committing.

---

# Appendix A — Starter voxel block / material palette

**Bedrock & stone (the geology stack):** `BEDROCK` (floor) · `DEEPSLATE` (deep ore host) · `STONE`/granite (default crust) · `BASALT`/`GABBRO` (mafic, caprock, magmatic-ore host) · `LIMESTONE` (karst + MVT ore host) · `SANDSTONE` (hard cliff-former, reservoir/roll-front host) · `SHALE`/`MUDSTONE` (soft slope-former, source rock/seal) · `CHERT` (silica bands, pairs with BIF) · `MARBLE`/`SLATE`/`SCHIST`/`GNEISS`/`QUARTZITE` (metamorphic accents; quartzite = hardest ridge-capper).

**Soils & sediments (surface, energy-sorted):** `CLAY` · `SILT` · `MUD` · `DIRT`/`LOAM` · `SAND` · `GRIT`/`COARSE_SAND` · `GRAVEL` · `COBBLES` · `BOULDER` · `BLACK_SAND` (heavy-mineral beach lag) · `PEAT` · `LATERITE` (hard tropical cap).

**Ores & minerals (injected into host rock, by rarity tier):** `COAL` (low) · `IRON_ORE_BANDED` (BIF, low-mid) · `IRON_ORE`/`MAGNETITE` (mid) · `COPPER_ORE`/`COPPER_ORE_RICH` (porphyry/supergene, mid/high) · `NICKEL_ORE`/`CHROMITE_ORE` (magmatic, mid-high) · `LEAD_ORE`/`ZINC_ORE` (veins/MVT, mid) · `TIN_ORE`/`CASSITERITE` (mid-high) · `SILVER_ORE`/`GOLD_ORE` (veins, high) · `GOLD_NUGGET` (placer, very high) · `URANIUM_ORE` (roll-front, high) · `QUARTZ_VEIN` (gold indicator) · `GEM_ORE` (deep, very high).

**Chemical / basin / special surface:** `ROCK_SALT` · `GYPSUM` · `POTASH` (evaporite zonation) · `GOSSAN` (rusty supergene cap, prospecting tell) · `MALACHITE` (green Cu flecks) · `OIL_SHALE`/`OIL`/`GAS` · `TAR` · `ICE`/`PERMAFROST` · `SNOW`.

*Grain-size boundaries (Udden–Wentworth, verified):* clay <0.0039 mm · silt 0.0039–0.0625 mm · sand 0.0625–2 mm · granule 2–4 mm · pebble 4–64 mm · cobble 64–256 mm · boulder >256 mm. *Angles of repose:* dry sand ~34°, angular talus/scree ~34–38°, coarse angular rock up to ~45°.

---

# Appendix B — Sources

**Voxel / procedural technique:**
- Red Blob Games — *Making maps with noise functions* — https://www.redblobgames.com/maps/terrain-from-noise/
- FastNoise2 Wiki — *Understanding Noise Types* — https://github.com/Auburn/FastNoise2/wiki/Understanding-Noise-Types
- Inigo Quilez — *Domain Warping* — https://iquilezles.org/articles/warp/ and *morenoise* — https://iquilezles.org/articles/morenoise/
- Job Talle — *Simulating hydraulic erosion* — https://jobtalle.com/simulating_hydraulic_erosion.html
- Nick McDonald — *Simple Particle-Based Hydraulic Erosion* — https://nickmcd.me/2020/04/10/simple-particle-based-hydraulic-erosion/
- dandrino — *terrain-erosion-3-ways* — https://github.com/dandrino/terrain-erosion-3-ways
- Minecraft Wiki — *World generation* — https://minecraft.wiki/w/World_generation
- 0 FPS — *Smooth Voxel Terrain* — https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/

**Tectonics & mountains:**
- Wikipedia — *Orogeny* — https://en.wikipedia.org/wiki/Orogeny
- NPS — *Plate Tectonics & Collisional Mountain Ranges* — https://www.nps.gov/subjects/geology/plate-tectonics-collisional-mountain-ranges.htm
- Wikipedia — *Hotspot (geology)* — https://en.wikipedia.org/wiki/Hotspot_(geology)
- Wikipedia — *Post-glacial rebound* — https://en.wikipedia.org/wiki/Post-glacial_rebound

**Fluvial & erosion:**
- Wikipedia — *Stream power law* — https://en.wikipedia.org/wiki/Stream_power_law
- Wikipedia — *Drainage system (geomorphology)* — https://en.wikipedia.org/wiki/Drainage_system_(geomorphology)
- Wikipedia — *Knickpoint* — https://en.wikipedia.org/wiki/Knickpoint
- Geosciences LibreTexts — *Classification of deltas* — https://geo.libretexts.org/Bookshelves/Oceanography/Coastal_Dynamics_(Bosboom_and_Stive)

**Glacial / coastal / aeolian:**
- Geosciences LibreTexts — *Glacial Landforms* — https://geo.libretexts.org/Bookshelves/Geology/Book:_An_Introduction_to_Geology
- USGS — *Eolian (wind) processes* — https://pubs.usgs.gov/gip/deserts/eolian/
- Wikipedia — *Dune* — https://en.wikipedia.org/wiki/Dune
- OpenGeology — *Shorelines* — https://opengeology.org/textbook/12-shorelines/

**Volcanic & karst:**
- NPS — *Columnar Jointing* — https://www.nps.gov/subjects/volcanoes/columnar-jointing.htm
- Sandatlas — *Types of Lava Flows* — https://sandatlas.org/types-lava-flows/
- Wikipedia — *Lava tube* — https://en.wikipedia.org/wiki/Lava_tube
- NPS — *Karst Landscapes* — https://www.nps.gov/subjects/caves/karst-landscapes.htm
- Britannica — *Karst* — https://www.britannica.com/science/karst-geology

**Weathering, rock types, minerals & sediment:**
- Wikipedia — *Weathering* — https://en.wikipedia.org/wiki/Weathering
- Wikipedia — *Angle of repose* — https://en.wikipedia.org/wiki/Angle_of_repose
- Wikipedia — *Vegetation and slope stability* — https://en.wikipedia.org/wiki/Vegetation_and_slope_stability
- OpenGeology — *Igneous / Sedimentary / Metamorphic rocks* — https://opengeology.org/textbook/
- NPS — *Grand Canyon's Three Sets of Rocks* — https://www.nps.gov/articles/000/grcatime-grand-canyon-s-three-sets-of-rocks.htm
- Geosciences LibreTexts — *Unconformities* — https://geo.libretexts.org/Bookshelves/Geology/Geology_of_California
- Wikipedia — *Banded iron formation* — https://en.wikipedia.org/wiki/Banded_iron_formation
- Britannica — *Placer deposit* — https://www.britannica.com/science/placer-deposit
- OpenTextBC — *Clastic sedimentary rocks* — https://opentextbc.ca/geology/chapter/6-1-clastic-sedimentary-rocks/

**Iconic formations:**
- Wikipedia — *Mesa*, *Hoodoo (geology)*, *Natural arch*, *Tepui*, *Bornhardt*, *Stack (geology)*, *Fjord*, *Giant's Causeway*, *Exfoliation joint*
- NPS — *Bryce Canyon Hoodoos* — https://www.nps.gov/brca/learn/nature/hoodoos.htm
- NPS — *Devils Tower formation* — https://www.nps.gov/deto/learn/nature/tower-formation.htm

*All quantitative claims in this report were independently fact-checked; grain-size boundaries, angle-of-repose values, the stream-power exponents, isostatic-rebound rates, dune orientations, and the Minecraft 1.18 pipeline were confirmed against the sources above. The one correction applied: Devils Tower is presented as an eroded igneous intrusion whose exact emplacement (volcanic neck vs. laccolith vs. maar-diatreme) is genuinely debated, rather than asserted flatly as a volcanic neck.*

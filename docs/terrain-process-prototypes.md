# Terrain-Process Pre-CCR Prototypes — Measured Findings

*Resolves the three items flagged before drafting CCR-1 (RegionField) and CCR-2 (lithology/hardness): the two prototypes `VoxEx-Terrain-Process-Feasibility.md` §6 calls out, plus the under-specified talus-placement bucket. **Measure & design only — `voxEx.html` was not modified, no flags flipped, no `TERRAIN_GEN_VERSION` bump, nothing committed.** Every number below came from a command that was actually run against the REAL functions extracted by `tools/lib/extract-terrain.mjs`.*

## Verdicts at a glance

| Item | Verdict | One-line reason |
|---|---|---|
| **A — shared multi-raster bake** | **GO** | Unifying climate+sediment into the orogen bake = **1.010× single**; the only real waste (independent sediment re-baking flow = **1.98×**) is exactly what a shared RegionField avoids. |
| **B — hardness-in-loop differential erosion** | **NO-GO as a bake coupling; REDIRECT** | Even strong contrast yields **no voxel-scale benches** from the cell-20 bake; per-iteration is *worse and costlier* than surface-scalar. Move lithology to a NATIVE per-column pass. |
| **C — talus/angle-of-repose home** | **PICK: Tier-R talus raster (option c)** | Only option that keeps height a pure, border-identical `f(gx,gz)`; the deferred block-mutating pass (b) provably desyncs trees + seams. |

## Method & environment

- **Repo access:** `voxEx.html` staged and byte-verified (3,786,449 B = device size; ends at `</html>`; CRLF 54,825 = LF 54,825 — a complete copy, not a mount-truncated read). Prototypes ran in a **cloud Node v22.22.2, 2-core** container against the staged copy; `voxEx.html` was read-only input, never an edit target.
- **Real functions only.** All inputs come from `buildTerrainApi(file, seed, {tectonicPlates:true})` — the real `buildOrogenRegion`, `tectonicErosionAt`, `plateLookup`, `terrainSurface`, `temperature`, `humidity`, `noise2D`, `GEN_TUNABLES`. Prototype B ports the 40-iteration erosion loop (a compiled closure can't be edited in place) and **proves the port null-equivalent to the real `buildOrogenRegion`** before trusting any modified run.
- **Timing is reported as RATIOS.** The cloud's 2 cores make a single bake ≈ **9.6–9.9 s** vs the owner's **5.8 s** baseline (≈1.6× slower). Every go/no-go rule here is a ratio (unified/single, variant/null), which is CPU-invariant; absolute ms are context only.
- **Determinism contract checked** on every prototype: bake-twice → byte-identical, on seeds **1337, 42, 9001**.
- **Confirmed tunables (shipped defaults):** `EROSION_CELL 20`, `OROGEN_REGION 8192`, `OROGEN_HALO 1024`, `EROSION_ITERS 40`, `EROSION_K 28`, `EROSION_CAP 3`, `EROSION_TALUS 0.75`, `EROSION_KT 0.09`, `EROSION_UPLIFT 0.32` → grid **n=512, N²=262,144** (matches the "5.8 s per 512² region" fact exactly). `HYDRO_REGION 1024`, `HYDRO_STEP 32`. `TERRAIN_GEN_VERSION 43`.

---

## Prototype A — shared multi-raster bake cost → **GO**

**Question:** if `buildOrogenRegion` emitted N rasters in one pass (existing Δh + flow, plus stand-in climate and sediment-energy at the same `EROSION_CELL` grid), does it stay ≤ 1.5× the single bake, or should the extra rasters be deferred?

**Measured (seed 1337; re-confirmed seed 42):**

| Component | Time | vs single |
|---|---:|---:|
| `T_single` (orogen bake, median of 3 warm) | 9,603 ms | 1.000× |
| empty N² traversal (loop overhead fusion saves) | 4.4 ms | — |
| climate raster (`temperature`+`humidity` × N²) | 72.1 ms | +0.75% |
| sediment-energy raster (derived from the bake's `flow`) | 22.0 ms | +0.23% |
| **UNIFIED** (erosion+flow+climate+sediment, one pass) | **9,697 ms** | **1.010×** |
| N-INDEP (orogen + separate climate walk) | 9,697 ms | 1.010× |
| **N-INDEP with sediment re-baking flow** | **19,048 ms** | **1.984×** |

Decision rule **UNIFIED ≤ 1.5× → PASS** with enormous margin (1.010×). Seed 42 re-run: `T_single` 9,879 ms, UNIFIED **1.010×**, independent-sediment **1.981×** — identical conclusion.

**The real insight isn't "unified is cheap" — it's *why*.** Climate is a couple of noise samples per cell (cheap unified *or* independent). Sediment-energy is a function of the **`flow` raster that only the erosion bake produces** — so baking it independently means re-running flow accumulation, which **doubles the cost (1.98×)**. That is the concrete argument for the shared RegionField: not loop-fusion savings (negligible — 4.4 ms), but **never recomputing flow for a flow-derived raster.**

**Grid mismatch (favorable):** `OROGEN_REGION 8192` is an exact **8×** `HYDRO_REGION 1024`, divides evenly, and **a hydro region never straddles two orogen regions** (verified over ±40 regions) → **one orogen bake serves 64 hydro regions**. Hydro consuming the orogen raster is a bilinear sample at its 32² lattice = **0.42 ms** (0.67 ms seed 42) — the same pattern `tectonicRiverFactor` already ships. No extra bakes, no resampling penalty.

**Recommendation — GO (CCR-1 RegionField).** Unify cheap **derived** (sediment from flow) and **noise** (climate) rasters into one region bake / one `RegionField` abstraction. The 1.5× budget is untouched.

> **Ledger candidate (efficiency):** *Never bake a flow-derived raster (sediment-energy) independently of the erosion bake — it silently re-runs flow accumulation and ~doubles cost (measured 1.98×). Derive it from the bake's `flow` in the same pass.*
>
> **Scope caveat for CCR-1:** the 1.5× budget is only threatened by a future raster that needs its **own iterative simulation** (e.g. a separate glacial flow-accumulation). Those must share the grid-walk or be gated behind their own belt pre-scan — never added as an independent full bake. Cheap noise/derived rasters (this prototype's climate+sediment) are free.
>
> **Climate stand-in caveat (review flag 2026-07-20):** the 72 ms climate raster measured here is the **cheap stand-in** (per-cell `temperature`+`humidity` noise samples). The feasibility doc's real R4 climate — **rain-shadow derived from R2 relief** — is a directional sweep over the relief raster, not a per-cell sample, and its cost is **unmeasured**. CCR-1 must not cite 72 ms as the cost of real climate; a rain-shadow raster falls under the iterative-sim rule above (share the grid-walk, measure before adding).

---

## Prototype B — hardness-in-loop differential erosion → **NO-GO as a bake coupling; REDIRECT to a NATIVE per-column pass**

**Question:** does feeding a stratigraphic hardness field into the erosion loop produce benches/mesas/caprock, and is the "correct" per-iteration re-sampling worth its cost over a once-per-cell surface scalar?

### Port validation (must pass before any hardness run is trusted)

The base input was reconstructed from real functions as `terrainSurface_full − tectonicErosionAt` (the erosion term cancels to the guarded base surface), plus the bake's exact per-cell LCG jitter. The ported loop with **hardness = 1** was compared to the real `buildOrogenRegion` `dh`:

| seed | max\|Δ\| | cells \|Δ\|>0.5 | port bake-twice identical | real bake-twice identical |
|---|---:|---:|---|---|
| 1337 | 9.87 | 510 / 262,144 (0.195%) | ✔ | ✔ (dhCksum 3510706343) |
| 42 | 1.03 | 9 / 262,144 (0.003%) | ✔ | ✔ |
| 9001 | 0.25 | 0 / 262,144 (0.000%) | ✔ | ✔ (dhCksum 1164727116) |

The port is faithful: ≥99.8% of cells match to <0.5 block, and the heavy-tailed residual is **drainage-reroute at sort ties** from ~1e-3 base-reconstruction float error — the exact tie-break sensitivity agent-notes §1 documents ("flow accumulation MUST walk cells sequentially high→low; stable sort, index tie-break"), **not a loop discrepancy.** Because every hardness comparison below is measured **port-null vs port-hardness on the identical base**, that reconstruction error cancels out.

### Cost delta (loop only; the full bake adds ~3.6 s of H-init on top)

| variant | loop time | vs null |
|---|---:|---:|
| null (hardness = 1) | 5,989 ms | 1.00× |
| **(a) surface-scalar** (sample hardness once at the initial surface) | 6,116 ms | **1.02×** |
| **(b) per-iteration** (re-sample at the current eroded depth) | 6,366 ms | **1.06×** |

Both are cheap. But cost isn't the deciding factor — effect is.

### Effect (3 seeds, strong contrast hard 5 / soft 0.25, fine 8-block bands)

Bench proxy = % of cells that are a slope-sign inflection (a bench edge):

| seed | peak H0 | real | (a) surface-scalar | (b) per-iteration | ceiling: cap 12 + no smoothing |
|---|---:|---:|---:|---:|---:|
| 1337 | 137 | 1.07 | **1.28** | 1.08 | 1.77 |
| 42 | 98 | 1.26 | **1.46** | 1.33 | 2.10 |
| 9001 | 117 | 1.03 | **1.19** | 1.04 | — |

mean\|ΔD\| vs real stayed **0.11–0.29 blocks** across seeds. Two hard results:

1. **Per-iteration (the "correct but costly" version) produces *less* benching than surface-scalar, and costs more.** Re-sampling hardness at the descending surface makes the modulation chase the surface and average out; the surface-scalar variant locks the hard/soft pattern in place spatially, so a consistent differential accumulates. So the expensive version is strictly worse for this purpose.

2. **The differential only becomes visible when `EROSION_CAP` and the 3×3 smoothing are removed** (the "ceiling" column). Those are load-bearing: the cap limits per-iteration incision, and the 3×3 smoothing exists specifically to kill D8 grid-axis furrow aliasing (per the bake's own comment and agent-notes §1's rejected "worm-ring canyon" ledger entry). Removing them to expose benches would degrade the bake's core job — smooth dendritic valleys.

### Visual evidence

Hillshade crops (160 cells = 3,200 blocks) around each region's peak show the real bake vs strong per-iteration hardness vs the ceiling variant. Across all three seeds the hardness variants read as **slightly rougher terrain with dendritic valleys — no recognizable benches, mesas, caprock steps, or hoodoos.**
Artifacts: `tools/scratch/B_out/mtn_real_{1337,42,9001}.png`, `mtn_strongb_{1337,42,9001}.png`, `mtn_ceiling_1337.png` (ceiling vs real is near-indistinguishable to the eye). *Provenance note (2026-07-20 review): the seed-42 and seed-9001 crops were regenerated during independent verification by re-running `protoB3.mjs` against the byte-verified `voxEx.html` (sha `17d46eff…`). Seed 9001 reproduced the original run exactly (same max-relief region, bench proxies 1.03/1.19/1.04, real-bake `dhCksum 1164727116`). Seed 42's crop is from its max-rangeAmp region (peak H0 248; proxies real 1.40 / a 1.89 / b 1.38) — a different, higher-relief region than the table row above, with the identical ordering (surface-scalar > per-iteration ≈ real) and the same visual result: no benches.*

### Root cause & recommendation

The erosion bake is a **macro-scale instrument**: cell-20 grid + 3×3 smoothing ≈ a 60-block blur, then bilinear column sampling + domain warp. It **cannot resolve the 5–30-block features** that read as lithology (benches, caprock, hoodoos) at voxel scale, and stream-power erosion concentrates in channels rather than the broad slopes where horizontal-band benching would show.

**NO-GO on coupling hardness into `buildOrogenRegion` to produce differential-erosion landforms.** Redirect **CCR-2's scope**: implement lithology/hardness as a **NATIVE per-column, block-resolution field** (feasibility doc Stage B), **decoupled from the region erosion bake**. The erosion bake stays as-is (its job is smooth valleys, and it does that well).

**Height/material split (binding for CCR-2, review flag 2026-07-20):** the hardness field has two consumers and they live in different places. Any **height-shaping** component (terracing/bench steps derived from hardness) MUST live in the **pure height chain** (`terrainSurface`/`blendedHeight` — pure `f(gx,gz)`, border-identical, TGV bump, worker-injected). `generateTerrainPass` gets **only the material half** (band/caprock block selection at fill time). Shaping height inside the per-voxel pass would desync `heightCache`, `fillWaterPass`, and cross-chunk tree `groundY` — the exact stale-height failure class Design C rejects as option (b) below.

> **Ledger candidate:** *Per-iteration hardness re-sampling in the orogen erosion loop is worse-and-costlier than a once-per-cell surface scalar (measured: bench proxy lower on all 3 seeds, cost 1.06× vs 1.02×). Do not retry per-iteration hardness. And do not expect voxel-scale benches/mesas from the cell-20 erosion bake at all — its 3×3 smoothing + cap suppress sub-60-block differential by design; lithological terracing belongs in a per-column pass.*
>
> **If** hardness is ever added to the bake for a *different* reason (biasing macro valley erodibility, not making benches), use surface-scalar (a), never per-iteration (b).

---

## Design C — talus / angle-of-repose placement → **PICK option (c), a Tier-R talus raster**

The feasibility doc filed repose relaxation under APRON but didn't resolve the contradiction with its own §4 rule 4: a slump pass mutates height, yet height must stay a pure, border-identical `f(gx,gz)` that trees/rivers/biomes read *before* any deferred pass runs. Three candidate homes, evaluated against the real consumer graph (grep-confirmed):

### The stale-height consumers (why placement matters)

Everything that reads surface height **before** the deferred `NEIGHBOR_UPDATE` pass, and whether a later height mutation breaks it:

| Consumer | reads | pass | breaks if height mutated later? |
|---|---|---|---|
| 8-neighbor slope/aspect/cliff/ridge/lakebed analysis | `heightPad` (chunkSize+2, **radius-1**) | 0a build / P1 | **Yes** — cliff/ridge/scree/lakebed materials placed for the pre-slump surface |
| `generateTerrainPass` material cascade | `heightCache`, `heightPad` | P1 | **Yes** — bands, beach/river-sand gates, cave-breakthrough keyed to pre-slump top |
| `fillWaterPass` | `heightCache` | P2 | **Yes** — a column slumped below/above sea level after P2 is left dry / stranded-wet |
| **cross-chunk tree placement** (`getChunkTreePositions`, `isTreeSiteViable`, `isTreeSoilSurface`) | **pure `Math.floor(blendedHeight)`**, not the cache | P3 **and** deferred P7 | **Yes, worst** — `groundY` mispredicts the real surface; the P7 log-scan tolerates only ±6 blocks → cross-chunk canopies vanish/float |
| sunlight / blocklight | final blocks | P4/P5 | Indirect; P7 `recalculateEdgeLighting` re-runs, so only a P7 slump is absorbed |

### Option (b) — deferred block-mutating pass in the NEIGHBOR_UPDATE window → **REJECT**

Directly violates the pure-height contract. Chunk N mutating a border column while chunk N+1 recomputes its `heightPad` ring from the untouched pure `blendedHeight` → the two disagree → **material/lake border seam** (the exact class the contract prevents). And tree placement's cross-chunk `groundY` comes from pure `blendedHeight`, so a slump the pure function doesn't know about desyncs canopies. Also breaks worker↔main parity (a block mutation isn't a pure `f(gx,gz)`). The Lockstep Registry already anticipates the material half — it names **"talus aprons"** as a new outcome that must be mirrored into `isTreeSoilSurface`.

### Option (a) — fixed-sweep slump *inside* the pure height function → **VIABLE, but costly and range-capped**

Keeps height pure if the slump is a bounded, deterministic `f(gx,gz)`. Cost: the `heightPad` ring must grow from `chunkSize+2` (radius-1) to roughly **`chunkSize + 2·(1 + R·K)`** for a stencil reach R over K sweeps — more per-chunk `blendedHeight` ring calls (e.g. pad 28 vs 18 → ~112 vs ~68 border evals) plus K sweeps over the padded grid (for K=5, R=1 ≈ a few thousand cheap ops/chunk). Two real drawbacks: (1) **every adjacent chunk re-slumps the shared border cells** and must agree, so the stencil must be bounded — which **caps talus runout at R·K blocks** (long scree runouts exceed the pad); (2) redundant recompute across the overlap. TGV bump; lives in the injected height chain (worker-parity); `isTreeSoilSurface` mirror if it changes surface material.

### Option (c) — a Tier-R talus Δh raster, bilinear-sampled like `tectonicErosionAt` → **PICK**

Bake talus relaxation as an additive Δh raster in the region tier (halo-bounded, seeded, cached), and **sample it into the pure height exactly like `tectonicErosionAt` already does.** Height stays a pure, border-identical `f(gx,gz)` **by construction** (same bilinear-sample-of-a-cached-raster pattern that already ships), so **no seam, no tree desync, no per-chunk redundant recompute, and no runout cap** (the whole region relaxes together). It **reuses the RegionField from CCR-1/Prototype A**, and — critically — **the erosion bake already performs talus relaxation in-loop** (`EROSION_TALUS`/`EROSION_KT`), so this is *generalizing a proven mechanism* (to all regions, or as a dedicated cheap raster), not inventing one.

Implications: **TGV bump** (terrain output changes); **worker-parity trivial** (the raster sampler joins the injected height chain beside `tectonicErosionAt`); **`isTreeSoilSurface` mirror** only if it introduces a new surface material (a talus-apron block) — which per the Lockstep Registry it then must.

### The scale caveat (ties C back to B)

A cell-20 talus raster handles **macro** relaxation (slopes wider than ~60 blocks) only — the *same resolution limit* Prototype B ran into. **Block-scale scree at cliff feet cannot come from the coarse raster**; express that as a **per-column material treatment** in the existing slope-analysis cascade (no height mutation), not a deferred height pass. So the unifying rule across all three items is: **the region tier is a macro instrument; anything block-sharp — benches, scree — must be a NATIVE per-column pass.**

---

## Proposed CCR scope split

- **CCR-1 — RegionField.** Generalize the two bespoke region caches (`_orogenRegionCache`, `hydroRegionCache`) into one halo-bounded, seeded, LRU-cached `RegionField` abstraction that can emit **multiple rasters per bake** (Δh, flow, and cheap derived/noise rasters like sediment-energy and climate). Prototype A shows the multi-raster cost is **1.010×** and that sharing `flow` avoids a **1.98×** re-bake. Include the **talus Δh raster (Design C option c)** as a RegionField output, sampled like `tectonicErosionAt`. No new iterative sims added as independent bakes. **Accepted scope (state in the CCR, don't rediscover as a bug):** the cell-20 talus raster delivers **macro relaxation only** — block-scale slopes steeper than the repose angle will persist, and block-scale scree at cliff feet is a cosmetic per-column material treatment, not a height change.
- **CCR-2 — Lithology / hardness (revised).** Implement as a **NATIVE per-column, block-resolution** stratigraphic hardness field — **not** a coupling into `buildOrogenRegion` (Prototype B: the bake can't resolve voxel-scale benches). **Split per the binding rule above:** height-shaping (hardness-driven terracing) goes in the pure height chain (`terrainSurface`/`blendedHeight`, TGV bump, worker parity); `generateTerrainPass` gets the material half only. Mirror any new surface material into `isTreeSoilSurface`.

## Do-not-retry ledger candidates (for `agent-notes.md §1`)

1. **Independent sediment-energy bake** — re-runs flow accumulation, ~2× cost (measured 1.98×). Derive from the erosion bake's `flow`.
2. **Per-iteration hardness re-sampling in the erosion loop** — lower bench signal than a once-per-cell surface scalar on all 3 seeds, and 1.06× vs 1.02× cost. Use surface-scalar if hardness is ever added to the bake.
3. **Expecting voxel-scale benches/mesas from the cell-20 orogen bake** — its 3×3 smoothing (≈60-block blur) + `EROSION_CAP` suppress sub-60-block differential by design. Lithological terracing must be a per-column pass.
4. **A block-mutating slump in the NEIGHBOR_UPDATE window** — desyncs cross-chunk tree `groundY` (pure `blendedHeight`, ±6 slack) and `heightPad` border agreement → seams. Talus must be a pure-height raster (Design C option c), not a deferred block mutation.

## Determinism & repo-untouched evidence

- **Bake-twice byte-identical** verified: real `buildOrogenRegion` (seeds 1337, 9001) and the erosion-loop port (all 3 seeds). No `Math.random`/`Date` anywhere in the prototypes.
- **`node tools/terrain-node-checks.mjs` → ALL HARD CHECKS GREEN on seeds 1337, 42, 9001**, confirming the staged `voxEx.html` and the extraction path produce the shipped invariants — i.e. nothing in the terrain pipeline was altered. `voxEx.html` was never an edit target; nothing was git-staged or committed.

## Reproduction artifacts (cloud working tree, mirrored to `tools/scratch/`)

- `protoA_cost.mjs` — Prototype A single/unified/independent + grid-mismatch timing.
- `protoB_erosion.mjs` — Prototype B port, null-equivalence, cost, bench proxy, raster dump.
- `protoB2.mjs` — B diagnostics: divergent-cell count, port determinism, strong contrast, ceiling variant, mountain crops.
- `protoB3.mjs` — B on each seed's highest-relief region + real-bake determinism.
- `protoB_render.mjs` — hillshade renderer for the saved rasters.
- `B_out/*.png` — hillshade evidence (mountain crops per seed; ceiling vs real).

*All prototype scripts are one-off probes intended for `tools/scratch/` (gitignored); they import the real functions via `tools/lib/extract-terrain.mjs` and contain no hand-copied terrain replicas beyond the erosion-loop port, which is proven null-equivalent to the live `buildOrogenRegion` before use.*

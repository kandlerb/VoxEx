# VoxEx Terrain-Gen Overhaul — Keep / Generalize / Retire Triage (measured)

*Companion to `VoxEx-Terrain-Process-Feasibility.md`. This one is measured, not estimated: function spans were brace-matched directly from `voxEx.html`. Exploratory — nothing changed in the game.*

## Method & integrity

`voxEx.html` was staged into the sandbox and byte-verified before measuring (3,786,449 bytes = device size; ends at `</html>`; CRLF 54,825 = LF 54,825 — a complete, coherent copy, not a mount-truncated read). Each terrain-gen symbol from CLAUDE.md's *Common Search Patterns* was located and its body measured by a brace-matched scan (strings/comments skipped). Numbers below are **function-body LOC** for the core generation functions. They deliberately exclude the `GEN_TUNABLES`/schema tables, the terrain-editor UI, save/load plumbing, and the worker-injection template — so "total terrain-gen" in the codebase is larger than the ~3.1k core-function LOC measured here; this triage is about the *generation logic itself*.

## Headline answer

**~91% of the core terrain-gen logic stays; ~9% is cleanly-retirable legacy — and that 9% is *live fallback today*, not dead code.** It only becomes deletable the moment you commit to a single path and drop the flag-OFF branches. There is no large block of pure dead weight to cut; the "bloat" is (a) a small set of superseded legacy functions kept alive as fallbacks, and (b) dual-path flag branches scattered *inside* otherwise-keep functions. The genuinely *obstructive* material is tiny in line count but high in reasoning cost: the glue that arbitrates between two competing mountain authors.

| Bucket | Measured LOC | Share of core | Meaning |
|--------|-------------:|--------------:|---------|
| **KEEP — Foundation** (streaming spine, caches, passes, dispatchers, water, caves) | ~1,467 | ~47% | Untouchable; role intact |
| **KEEP — Aligned** (already the target process architecture) | ~1,367 | ~44% | Build *on* it, don't replace |
| **RETIRE-on-commit** (live legacy fallback) | ~275 | ~9% | Delete when flags collapse |
| *Core total* | *~3,109* | *100%* | |
| *Trees (orthogonal, keep)* | *~331* | *—* | Not part of the height/material pipeline |

So **keep ≈ 91%, retire ≈ 9%** of core generation logic.

## KEEP — Foundation (~1,467 LOC): the streaming contract and orchestration

These survive unchanged in role; some get *extended* (noted), none get removed.

| Function | LOC | Note |
|---|---:|---|
| `generateTerrainPass` | 589 | The per-voxel material cascade + cave carving. Extended (lithology/ores), not replaced. Holds 9 flag-branch sites. |
| `generateChunkData` | 310 | Pass orchestrator. Zero flag branches — pure sequencing. |
| `precalculateTerrainCaches` | 127 | The pure-`f(gx,gz)` + `heightPad` contract. Foundational. |
| `riverFactorAt` | 135 | River dispatcher (ribbon vs hydro). Keep; the ribbon arm retires. |
| `applyRiverCarve` | 121 | Valley→channel carve, shared by both river systems. |
| `computePreRiverHeight` | 62 | Height→ocean blend; dispatch point (holds flag branches). |
| `getOceanFactor` / `getOceanDepth` | 42 / 11 | Ocean shaping. |
| `precalculateCaveNoise` | 27 | Coarse 3D cave grid — reused directly for karst. |
| `getRiverDepth` | 17 | |
| `fillWaterPass` | 14 | |
| `blendedHeight` | 4 | Shared height accessor (`preRiver`→`carve`); called 64× incl. tree placement. NOT legacy. |
| `computeSurfaceHeight` | 3 | `floor(terrainSurface)`. |
| `generateDecorationsPass` | 5 | |

## KEEP — Aligned (~1,367 LOC): already the process architecture

This is the newest code and it *is* the target. The region-bake machinery here is exactly what the feasibility doc says to generalize.

| Function | LOC | Role in the process model |
|---|---:|---|
| `buildHydroRegion` | 384 | Tier-R drainage bake (trace + priority-flood + flow→width). Some hand-tuned organic-shape octaves inside will shrink as erosion-driven drainage takes over, but the function stays. |
| `terrainSurface` | 267 | Per-column height assembly. Keep, but its *role shrinks* from primary author to "detail on top of region bakes." Holds 9 flag/style branches. |
| `plateLookup` | 216 | Tier-R plate/regime/uplift field. Crown jewel. Zero flag branches. |
| `buildOrogenRegion` | 95 | Tier-R stream-power erosion bake (Δh + flow raster). The single highest-value asset. |
| `floodSpill` | 58 | Priority-flood breaching (100% ocean connectivity). |
| `tectonicRangeHeight` | 56 | Crest envelope. |
| `continentalHeight` | 39 | C-authored land/sea. |
| `tectonicErosionAt` / `tectonicRiverFactor` | 30 / 31 | Bilinear samplers of the bake. |
| `classifyBiome` / `resolveBiome` | 30 / 29 | Biome selection (now relief-coupled via `styleBlend`). |
| `getDeltaFingerFactor` | 27 | Flow-driven deltas (WS8). |
| `tectonicConeHeight` | 26 | Volcano lattice. |
| `oceanFactorFromC` | 20 | C→ocean dispatch. |
| `styleBlend` / `reliefParam` | 16 / 10 | Height-style coupling (the "label & shape agree" fix, shipped). |
| `tectonicReliefBlend` | 13 | ⚠️ Mountain-authority reconciliation — see *Obstructive* below. |
| `tectonicMarginFactor` | 11 | Active-margin cliff coasts. |
| `hydroRegionOf` / `hydroLatticeH` / `erosionParam` | 3 / 3 / 3 | Small helpers. |

## RETIRE-on-commit (~275 LOC): superseded legacy, live only as flag-OFF fallback

Every one of these is still *called* today (they're the `useNewTerrain=false` / `hydroRivers=false` escape hatches, kept byte-identical). None are dead now; all become deletable the moment the corresponding flag is retired.

| Function / group | LOC | Superseded by | Refs |
|---|---:|---|---:|
| `mountainsHeightFunc` ("COMPREHENSIVE MOUNTAIN GENERATION") | 152 | plates + `buildOrogenRegion` + `terrainSurface` | 14 |
| `getRiverFactor` (ribbon rivers) | 84 | `buildHydroRegion` / hydro drainage | 39 |
| `foothillsHeightFunc` | 15 | biome-driven `terrainSurface` | — |
| `HEIGHT_FUNCS` (per-biome height map) | 9 | `terrainSurface` | 5 |
| `hillsHeightFunc` / `plainsHeightFunc` / `defaultHeightFunc` | 5 / 5 / 5 | `terrainSurface` | — |

`mountainsHeightFunc` is the poster child: 152 lines of the old per-biome mountain generator, fully superseded by the plate + erosion-bake path, kept alive only because `useNewTerrain=false` still exists. Retiring the two flags (`useNewTerrain`, `hydroRivers`) deletes ~275 LOC in one stroke and removes the dispatch branches that reference them.

## The distributed bloat: dual-path flag branches inside keep functions

The legacy *functions* are only part of the story. The flag machinery is also woven *through* the keep functions as `if(flag)`/ternary branches. Measured inside the 10 hottest generation functions: **29 flag-gate sites** (`generateTerrainPass` 9, `terrainSurface` 9, `computePreRiverHeight` 3, `riverFactorAt` 3, `getOceanFactor` 2, `precalculateTerrainCaches` 2, `applyRiverCarve` 1). Each is a small OFF-branch that vanishes on commit.

File-wide flag references — `tectonicPlates` 63, `hydroRivers` 52, `continentalOceans` 48, `useNewTerrain` 29, `BIOME_STYLE_ACTIVE` 15 (≈207 total) — are **mostly plumbing** (tunable schema, terrain-editor UI, save/load, worker-pool rebuild), *not* duplicated generation math. That's the good news: collapsing a flag is mostly deleting config/branch scaffolding, not untangling parallel algorithms. The one exception is the two mountain flags, where the OFF path is a genuinely separate algorithm (the `*HeightFunc` family above).

## Obstructive (small LOC, high reasoning cost): competing mountain authorities

The one thing that will actively *fight* a clean process model isn't big — it's the glue that arbitrates between two mountain authors while the handoff is half-finished:

- `tectonicReliefBlend` (13 LOC) + `RANGE_RELIEF_SWAP` (12 refs) + `R_BASELINE_CAP` (15 refs) — machinery whose entire job is to demote the legacy E-field's mountain amplitude so plates can win, per column. It exists *only* because both authors coexist. CCR-003 already made "plates the sole mountain author flag-ON"; committing fully makes this glue not just removable but a reasoning hazard — it's the layer that makes "who decides this mountain?" ambiguous. Retire the E-field-as-mountain-author path and it collapses to nothing.

This is why the *feasibility* doc flagged competing authorities as the #1 obstruction: it's cheap to delete but expensive to keep thinking about.

## Keep / Generalize / Retire — the one-screen summary

| Verdict | What | Why |
|---|---|---|
| **KEEP as-is** | Streaming contract (`precalculateTerrainCaches`, `heightPad`), pass framework (`generateChunkData`, `GEN_PASS`, reserved `FEATURES`), water, caves, lighting, meshing, trees, `blendedHeight`/carve spine | Foundational or orthogonal to the gen algorithm |
| **KEEP & build on** | `plateLookup`, `buildOrogenRegion`, `buildHydroRegion`, `floodSpill`, tectonic samplers, coastal erosion, biome `styleBlend` | Already the target Tier-R process architecture |
| **KEEP but shrink/extend** | `terrainSurface` (→ detail layer), `generateTerrainPass` (→ + lithology/ores) | Role changes; code mostly survives |
| **GENERALIZE** | The two bespoke region caches → one `RegionField` abstraction | Refactor, not rewrite; no `TERRAIN_GEN_VERSION` change |
| **RETIRE on commit** | `*HeightFunc` family (182), ribbon `getRiverFactor` (84), `HEIGHT_FUNCS`, their flag branches | Superseded; live only as flag-OFF fallback (~275 LOC + branches) |
| **SIMPLIFY on commit** | `tectonicReliefBlend` + `RANGE_RELIEF_SWAP` + `R_BASELINE_CAP` reconciliation glue | Exists only to arbitrate two mountain authors |

## Honest caveats

- **"Stays" ≠ "unchanged."** Several keeps get extended (`generateTerrainPass` + lithology/ores) or demoted in role (`terrainSurface`). The 91% is "survives the overhaul," not "never touched."
- **The 9% is live today.** Retiring it means *first* deciding to drop `useNewTerrain=false` and `hydroRivers=false` — a product decision (owner soak, per WS7/OD4), not a mechanical cleanup. Until then it's correct, not bloat.
- **LOC ≠ effort or risk.** The 95-line `buildOrogenRegion` is worth more than the 589-line `generateTerrainPass`; the 13-line reconciliation glue costs more to reason about than its size suggests. Treat these numbers as *scope*, not *priority*.
- **Measurement scope.** Function-body LOC only; tunable tables, schema, editor UI, and worker template not counted. A full "delete-on-commit" tally would add the flag branches in those plumbing areas (the bulk of the ~207 flag refs), which are mechanical to remove.

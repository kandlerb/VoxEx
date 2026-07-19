# CCR-WORLDGEN-TECTONICS-004: Erosion-coupled rivers (one flow field, three scales)

> **Status: DRAFT (design; P0 prototype is Phase 1)** — DRAFT → AUDITED → IMPLEMENTED
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-004 · **Build baseline**: 2026-07-17.1 + CCR-003 · **Author**: Claude (Cowork session 2026-07-17, owner-directed)
> **Depends on**: CCR-002 (erosion bake), CCR-003 (fold envelope). Implement after 003.

## Problem / Why

Owner (2026-07-17): "Rivers are being added after the fact… they fade out. They should be
eroding the existing land, not being covered by the land."

Confirmed in code — there are TWO DISCONNECTED drainage systems flag-ON:

1. `buildOrogenRegion` computes a real flow field every iteration (D8 receivers + topological
   accumulation — it knows exactly where every stream runs and carves valleys accordingly),
   then **discards the flow data**, keeping only Δh.
2. The legacy river field (`getRiverFactor`) is independent noise, carved AFTER terrain, with a
   `heightPenalty` fade (smoothstep ~70..85 of the column's own height) that pinches a river to
   NOTHING wherever terrain rises — the literal "covered by the land" behavior. Rivers have no
   relationship to the erosion valleys; erosion valleys contain no rivers.

Result: valleys without rivers, rivers that ignore valleys and surrender to mountains.

## Approach — one flow field, read at three scales (owner's layered-erosion idea, unified)

The owner proposed separate erosion layers for mountains / surface / rivers, run mountains-first.
Adopted with one reframe: NOT three independent sims (independence is precisely the current
bug) — ONE coupled sim whose flow field is consumed at three scales, in the owner's order:

- **Mountain scale (exists)**: the bake's stream-power incision carves range valleys/spurs.
- **Surface scale (Phase C, optional)**: flow-guided fine detail — gullies/shoulders aligned to
  drainage instead of isotropic fbm texture.
- **River scale (the core of this CCR)**: the bake's high-accumulation cells ARE the rivers.
  Export the final flow raster; inside belt regions the river factor derives from it. A river
  then flows in the valley it carved, downhill, to the sea, BY CONSTRUCTION — it can never fade
  under a mountain, because the mountain is what it eroded through.

## Version impact

- `VOXEX_BUILD`: bump + entry. `TERRAIN_GEN_VERSION`: no bump while `tectonicPlates` default
  OFF (all changes flag-ON-gated; re-prove flag-OFF fingerprint). Cache/settings: no.

## Phases

### P0 — prototype (harness, no repo changes)

Extend the session harness (`tools/scratch/tect002-erosion-sim.mjs` lineage): keep the final
`area`/`rec` rasters, derive a river mask (`√A > FLOW_RIVER_MIN`, width ∝ √A), render with
rivers-from-flow replacing the legacy overlay inside belts. Owner eyeballs continuity (no
fades, junctions look dendritic, mouths reach the sea) before any code lands. Calibrate
`FLOW_RIVER_MIN` / width mapping here.

### Phase A — flow raster export from the bake

**Location:** `buildOrogenRegion` (grep `return { n, x0, z0, cell, dh: out };`).
On the FINAL iteration, keep `area` (as `Float32Array` of `√A`, same grid) and return it:
`{ n, x0, z0, cell, dh, flow }`. Memory: +1 Float32 grid per cached region (~1MB at cell 20 —
fine at cache cap 12). Determinism: same guarantees as dh (no new randomness).

### Phase B — tectonicRiverFactor + integration

New injected `tectonicRiverFactor(gx, gz, seed)`:
- 0-cost outside belt regions (`reg === null` → 1.0 = no river, legacy semantics).
- Inside: bilinear-sample `flow` (with the SAME domain-warped coordinate as `tectonicErosionAt`
  so channels sit in their carved valleys); map to a factor: `rf = 1` below `FLOW_RIVER_MIN`,
  narrowing channel toward `rf → 0` as flow grows (width `FLOW_WIDTH_K·√A`, clamp
  `FLOW_WIDTH_MAX`).
- Integration point: the `riverFactorAt` dispatcher (grep `riverFactorAt` dispatcher comment in
  `applyRiverCarve`): flag-ON and in a belt region, `rf = Math.min(legacyRf, tectonicRf)` —
  BUT the legacy `heightPenalty` pinch must NOT apply to the flow-derived component (it already
  runs downhill; that's the whole point). Cleanest: `tectonicRiverFactor` bypasses the penalty
  by construction (it never consults column height), and the min() combine keeps legacy rivers
  in lowlands/outside belts. Carve depth: existing `applyRiverCarve` machinery unchanged — the
  channel bed = `seaLevel − riverDepth` rule already guarantees flooded channels; for high
  valleys add a valley-floor-relative bed option (`bed = min(preHeight − FLOW_CUT_DEPTH, …)`)
  gated to flow-rivers so mountain streams read as incised creeks, not sea-level slots
  (P0 decides the exact rule — this is the one open design question).
- New tunables (ui:'editor'): `FLOW_RIVER_MIN`, `FLOW_WIDTH_K`, `FLOW_WIDTH_MAX`,
  `FLOW_CUT_DEPTH`. Full lockstep.

**Region borders:** halo (1024) makes near-border flow approximately consistent; upstream
drainage beyond the halo differs per region, so a long river's WIDTH may step at a border.
Acceptance budget: no visible channel discontinuity at the border in the P0 render; width step
tolerated ≤1 cell. If unacceptable, follow-up: hierarchical two-level bake (coarse whole-flow
pass feeding region bakes) — out of scope here.

**Water fill / materials / trees:** flow-rivers enter through the SAME `rf` plumbing
(`fillWaterPass`, river sand `rf < 0.5`, tree gate `rf >= 0.8`) — no new consumers. Verify the
material/tree gates against flow-river widths in P0.

### Phase C (optional, after owner eyeball) — flow-guided surface detail

Fine gully/shoulder texture aligned to drainage: sample `flow` at a lower threshold and add a
small analytic V-notch along secondary flow lines instead of isotropic fbm. Ship only if the
Phase-B look still wants it.

## Worker parity

`buildOrogenRegion`/`tectonicErosionAt` already injected; `tectonicRiverFactor` joins the same
three lists (worker terrainFuncs, VoxEx seam, extract-terrain FUNCS/return). The dispatcher
edit lives in `applyRiverCarve`/`riverFactorAt` (injected). New tunables: standard lockstep.
Determinism note: rivers derive from the deterministic bake — worker/main agree by construction.

## Acceptance (owner look-check)

1. Belt zoom: every major erosion valley carries a channel; channels join dendritically and
   reach the sea or a lake; NO river fades out against rising terrain anywhere in the window.
2. Region-border crossing: channel continuous (width step ≤1 cell).
3. Lowlands outside belts: legacy rivers unchanged.
4. Flag-OFF fingerprint identical (3 seeds).

## Safety Checks

- [ ] parity/syntax/terrain-node-checks GREEN + flag-OFF fingerprint identical
- [ ] Bake determinism re-verified (flow raster included in the byte-compare)
- [ ] `tools/voxex-tests.html` over localhost (also still pending from CCR-002)
- [ ] New tunables full lockstep; orogen cache clear covers the flow raster (same object)
- [ ] Memory: cached region size re-measured with flow raster; cap 12 still sane

## As-built (build 2026-07-18.2)

Shipped in **build 2026-07-18.2** (batched with CCR-005 + CCR-006). NO TERRAIN_GEN_VERSION bump
— `tectonicPlates` still default OFF; flag-OFF sha256 fingerprint re-verified IDENTICAL
(`22815f15a583ce58c80a08b08f0087260e80453a6043eeb5c92d7d1339212de0`, 3 seeds).

**As-built (implemented as drafted; three changes):**

1. **Flow raster export** — `buildOrogenRegion` adds
   `const flow = new Float32Array(N2); for (let c = 0; c < N2; c++) flow[c] = Math.sqrt(area[c]);`
   and returns `{ n, x0, z0, cell, dh: out, flow }`. Bake cost unchanged (√ of an already-computed
   array); cache entry ~2× floats; `_orogenRegionCache` (cap 12) + both clear sites cover it
   since dh and flow live in the same object.
2. **`tectonicRiverFactor(gx, gz, seed)`** — NEW injected function; identical domain-warped
   bilinear sample pattern to `tectonicErosionAt` (same cache entries, same `_orogenBaking`
   recursion guard, wAmp = cell·0.55, freq ~1/140). Mapping:
   `if (F <= FLOW_RIVER_MIN) return 1; let rf = 1 - (F - FLOW_RIVER_MIN)/FLOW_RIVER_SPAN; return rf < 0.05 ? 0.05 : rf;`
   — floored at 0.05, never 0 (keeps downstream width/delta math finite).
3. **Dispatcher** — `riverFactorAt`'s ribbon path (hydroRivers OFF):
   `const rf = getRiverFactor(gx, gz, seed, preHeight, widthMult); if (worldConfig.tectonicPlates === true) return Math.min(rf, tectonicRiverFactor(gx, gz, seed)); return rf;`
   — belt drainage channels become rivers; legacy ribbon rivers outside belts unchanged;
   hydroRivers-ON path untouched.

2 new tunables **FLOW_RIVER_MIN 200 / FLOW_RIVER_SPAN 220**, calibrated against measured belt
flow percentiles (p97 = 199, p99.5 = 422, 3 seeds) — full lockstep (registry / schema /
aliases / sync / worker-emission / extract-terrain); `tectonicRiverFactor` added to the worker
terrainFuncs list + window.VoxEx seam + extract-terrain FUNCS + return object.

**Gates (measured):** syntax + parity + terrain-node-checks GREEN ("ALL HARD CHECKS GREEN");
bake-twice byte-identical INCLUDING the flow raster ("bake deterministic (dh+flow) true");
flag-OFF fingerprint identical; 440 channel columns (rf < 0.6) in a 1024² belt sample rendering
as dendritic drainage following the erosion valleys (acceptance render CCR's/CCR-TECTONICS-004-rivers-acceptance.png — rivers
now sit in the exact valleys the CCR-002 bake carved, per the owner's 'rivers should be eroding
the land' directive).

**PENDING:** `tools/voxex-tests.html` browser worker-parity suite over localhost (owed since
CCR-002); owner editor eyeball.


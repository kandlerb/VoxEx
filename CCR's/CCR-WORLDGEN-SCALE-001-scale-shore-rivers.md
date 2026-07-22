# CCR-WORLDGEN-SCALE-001: terrain scale/relief "meet in the middle" + shoreline sand fix + wider rivers

> **Status: IMPLEMENTED** — committed locally, PUSH HELD (owner eyeball). Build 2026-07-21.3.
> **ID**: VOXEX-CCR-WORLDGEN-SCALE-001 · **Baseline**: 2026-07-21.2 (post CCR-007 F1a) · **Author**: Fable + owner (Kandler)
> **TERRAIN_GEN_VERSION 43 → 44** — terrain regenerates (owner is sole player; regen approved).

## Problem / Why
Owner eyeball of flag-ON tectonics: (1) scale reads "insurmountably vast" — plate interiors dead-flat, mountains
enormous stone plateaus (CCR-003's R_BASELINE_CAP 0.45 flattening seen at play-scale). (2) At Y≈62 an ugly
grass/sand CAMO patchwork inland. (3) Rivers too narrow.

## Approach (owner-approved via in-game fly-test + measured)
1. **Scale/relief "meet in the middle"** (keep biomes/expanses large, kill the dead-flat): `R_BASELINE_CAP` 0.45→0.55
   (interior undulation — the sanctioned interior-hills use, NOT the mountain-dial crank), `PLATE_SIZE` 6000→5000 and
   `OROGEN_WIDTH` 3600→3000 (mountains ~17% denser, belts narrower). Owner flew it: "steepness and slopes of banks is
   actually perfect now." Flag-ON tectonic layout re-rolls (PLATE_SIZE changes the Voronoi lattice).
2. **Shoreline sand fix (root cause).** The CCR-TERRAIN-011 beach gate's ocean arm `oceanFactor < 0.999` treated the
   ~80-block `oceanFactor` fade as "coast" → wide inland sand aprons across the Y59–63 band (amplified by the relief
   bump putting more terrain in that band). Measured falloff (real beach median oceanFactor ≈0.52; dry inland ≈1.0)
   → tighten to `oceanFactor < 0.60`. Verified: sand collapses to thin tapering beaches + riverbanks; deep inland
   (26% of the world at of>0.95) gets NO sand. Changed in `generateTerrainPass` AND the `isTreeSoilSurface` mirror
   (lockstep; both injected → worker auto-propagates). River-sand arm (rf<0.7 / rf<0.5) left as-is (already tuned).
3. **Wider rivers.** `HYDRO_CHANNEL_HALF_WIDTH` 9→12 (`R_QUERY` auto-derives from it — no separate bump).

## Changes
- GEN_TUNABLES defaults (auto-propagate to worker via `JSON.stringify(GEN_TUNABLES.X)` emission): `PLATE_SIZE` 5000,
  `OROGEN_WIDTH` 3000, `R_BASELINE_CAP` 0.55, `HYDRO_CHANNEL_HALF_WIDTH` 12.
- Sand gate literal `oceanFactor < 0.999` → `< 0.60` at BOTH: grep `oceanFactor < 0.60 && !isSwampCol`
  (generateTerrainPass) and `getOceanFactor(gx, gz, worldSeed) < 0.60` (isTreeSoilSurface).
- `TERRAIN_GEN_VERSION` 43→44; `VOXEX_BUILD` → 2026-07-21.3 + changelog.

## Verification (all against edited voxEx.html)
- syntax GREEN; parity LOCKSTEP GREEN (injected funcs auto-propagate).
- terrain-node-checks ALL HARD GREEN: T5 rivers 417 channel cols (was 320 — wider), 0.0% dry; T7 y62 soil 79%
  (was 76% — inland sand→grass, the fix); continuity max|Δ|=3.
- Sand fix measured: deep-inland (of>0.95) = 26% of world → no sand; beach band (of 0.4–0.6) ≈1.7% of area (thin strips).
  Visual A/B (committed-scale) confirmed camo→beaches.
- **NEW flag-OFF fingerprint baseline (TGV 44): `cd1df4afac0cac720322785273255072ba4d5f646b373fbe3289cabe193b14d7`**
  (R_BASELINE_CAP affects flag-OFF; old `7487c1955a87…b086b3e46` was the TGV-43 baseline, now superseded).
- CCR-007 flip-line crest blend intact (code unchanged; parity/syntax green).

## OWED before push
- Browser worker-parity suite (sandbox cannot run headless — device 45s cap; cloud headless hangs at load).
- Owner in-game eyeball (open the committed `voxEx.html`, create a NEW world — TGV bumped, regenerates).

## Follow-ups noted (NOT in this CCR)
- Distant-Horizons-style far-terrain LoD (owner wants 256+ render distance on high-end; see memory `voxex-performance-scalability`).
- Ground/grass visual variation (shader-based), independent of worldgen.
- R_BASELINE_CAP is a blunt relief lever; a dedicated mid-frequency relief term would be cleaner if more undulation is wanted (do-not-retry: don't crank R_BASELINE_CAP hard → "squiggly patches").

---

## As-built addendum — SCALE-001b (seabed material + deep oceans), build 2026-07-21.4

Owner eyeball on the shipped build flagged two more: ocean floor was dirt (wanted sand + dirt/gravel flecks), and oceans only 2-3 blocks deep. Both flag-ON, ride TGV 44. Applied on disk (commit still lock-blocked).

1. **Seabed material.** `generateTerrainPass` had no underwater-floor rule → seabed fell through to the lowland grass/dirt default. Added, before the DESERT gate: `else if (worldTopY < seaLevel) { id = detailNoise>0.68 ? GRAVEL : (detailNoise<-0.72 ? DIRT : SAND); }` (sand-dominant, dithered flecks). `isTreeSoilSurface` gains `if (groundY < seaLevel) return false;` (mirror — seabed sand is never tree soil).

2. **Deep oceans (C-gate).** Flag-ON ocean depth = C via `SPLINE_TECTONIC_OCEAN` (deep-capable to −90) but oceanic-plate identity is diluted (`TECT_PLATE_TINT` 0.15 + the plate-baseline smear), so ocean C hugged the waterline → ~2-3 blk floors. Added in `continentalHeight` flag-ON, gated on `_pl.oceanic`: `cc -= OCEAN_INTERIOR_DEEPEN(0.11) * smootherstep((COAST_THRESHOLD_TECT − cc)/OCEAN_DEEP_C_SPAN(0.12))` — deepen by how far cc already sits BELOW the coast contour, exactly 0 at the waterline. **Coast-preserving by construction** (only lowers already-submerged columns).
   - REJECTED first attempt (agent-notes §1 do-not-retry): a **dEdge**-gated deepen — `dEdge` anti-correlates with depth on waterline-hugging seeds (117658), so it deepened the wrong columns and marched the coast −8.8pt. The C-gate fixed it.
   - MEASURED: 628000 deep-ocean depth 7→15 (interior p90 33), land 0.191→0.190; 117658 deep offshore →32, same-grid land 0.520→0.506 with **572 land→ocean flips and 0 ocean→land** (coastline byte-identical; the 1.4pt is sub-coast shoals submerging). flag-OFF fingerprint `cd1df4af…` UNCHANGED (flag-ON only). syntax + parity + terrain-node-checks green.
   - Consts (`OCEAN_DEEP_C_SPAN`, `OCEAN_INTERIOR_DEEPEN`, seabed thresholds) are INTERNAL consts — promotable to editor tunables later.

---

## As-built addendum — SCALE-001c (terrace-break warp on gentle slopes), build 2026-07-21.5

Owner eyeball: gentle interior slopes (from SCALE-001 R_BASELINE_CAP 0.55) terraced into regular parallel diagonal contour bands ("armor plates"). Root cause: the `TERRACE_WARP` contour-break domain warp is relief-gated (`TERRACE_WARP_RELIEF_MIN` 0.4) → only fired on STEEP terrain; the gentle armor-plate slopes sat below the gate un-warped. Confirmed isotropic contour-stepping (per-axis steps ~even), not a noise grain.

Fix (flag-ON tunables): `TERRACE_WARP_RELIEF_MIN` 0.4→0.15 (warp gentle slopes too), `TERRACE_WARP_AMP_TECT` 6→26 (stronger break), `TERRACE_WARP_FREQ` 0.02→0.009 (broad meanders, not busy swirl — owner "higher amp but less swirly"). It's a coordinate warp, not added surface noise, so clean voxel steps are preserved (made irregular/organic, not textured — respects the settled clean-steps rule).

Verified: before/after per-block hillshade (owner-approved far-right) shows parallel bands → organic sweeping contours; flag-ON continuity clean (the maxAdjStep-40 near (1146,1141) 117658 is a REAL tectonic scarp — identical at amp 6 vs 26, warp adds no spikes); syntax + parity green; flag-OFF fingerprint `cd1df4af…` UNCHANGED (flag-OFF byte-identical, warp amp stays 0 there). Consts are registry tunables (Domain Warp section) — dial in the editor.

# CCR-WORLDGEN-TECTONICS-009: slope terraces, bent plate boundaries, organic belt rivers, piedmont convergence, no-bake preview

> **Status: IMPLEMENTED** — build `2026-09-10.2`, `TERRAIN_GEN_VERSION` 45 → 46 (terrain regenerates).
> **ID**: VOXEX-CCR-WORLDGEN-TECTONICS-009 · **Build baseline**: 2026-09-10.1 (CCR-008 merged, PR #584) · **Author**: Fable as integrator + five Sonnet workstream agents in isolated worktrees (owner brief: "I'm still getting these ridges along slopes. and fix the other things you found and marked.")

## Problem / Why

| # | Defect | Evidence |
|---|---|---|
| A | **"Ridges along slopes"** (owner screenshot: river valley, sand flanks up to a grass line, long parallel stepped bands running along the valley) | `applyRiverCarve`'s valley depression is a pure function of distance-to-channel (`vfRaw = riverFactorAt(…, 3)`); floored to integers its contours run parallel to the river. Measured band-parallelism (fraction of step edges parallel to the channel) 0.270 vs a random baseline of 0.167; mean along-channel tread run 4.07 columns. The existing contour wiggle peaks at ±0.125 and vanishes at both band edges. |
| B | Tectonic belts and coasts ruler-straight at map scale (CCR-008 residual) | 1500-block boundary windows: mean RMS deviation from a straight fit 22–25 blocks; the boundary warp had only two octaves with ~2000-block wavelength at `PLATE_SIZE` 5000. |
| C | Ribbon-path erosion rivers (`hydroRivers` OFF + `tectonicPlates` ON) render as 45°/90° slot channels (CCR-008 residual) | 87.5–93.8% of channel chords within ±6° of a grid direction; mean turn angle 21.5°. Single fine warp octave (11 blocks, 1/140) cannot bend a 300-block D8 run. |
| D | Create-world preview froze ~3 s per seed (CCR-008 residual) | `WorldPreviewRenderer.render()` → `blendedHeight` → `tectonicErosionAt` → `orogenField.get` bakes on the main thread. |
| E | "Piedmont comb": parallel hydro channels down a smooth mountain-front slope with no confluences (CCR-008 finding) | springs 3–5 lattice cells apart on a planar slope never come within `HYDRO_CAPTURE_RADIUS` (1 cell); confluence rate 0.832. |

## Approach (per workstream, all prototype-first with measurements)

- **A — valley-flank terrace break** (`applyRiverCarve`, grep `CCR-WORLDGEN-VALLEY-TERRACE-001`): warp the `(gx,gz)` point fed to the valley-band factor (`RIVER_VALLEY_WARP_AMP` 15, `RIVER_VALLEY_WARP_FREQ` 0.006) and promote the hardcoded 0.5 wiggle multiplier to `RIVER_VALLEY_WIGGLE_MULT` (2.0). Chosen over warp-only / wiggle-only / floor-relief-keep by the metric table below. Ledger items (dither-before-floor, hi-freq detail, amplitude-down) were not retried; this is a coordinate warp + value wiggle, the two levers WS1 measured as real. A second pass evaluated the flag-OFF general-slope terrace warp default (`TERRACE_WARP_AMP`) — see As-built.
- **B — multi-octave boundary warp** (`plateLookup`, grep `fMacro`/`fFine`): macro octave (`BOUNDARY_WIGGLE_MACRO_FREQ_MULT`, `BOUNDARY_WIGGLE_MACRO_AMP_MULT`) + fine octave (`BOUNDARY_WIGGLE_FINE_FREQ_MULT` 4.5, `BOUNDARY_WIGGLE_FINE_AMP_MULT` 0.25) added to the two existing octaves; fold safety checked via the warp Jacobian (min det > 0.05 on 3 seeds). `BLEND_BAND`/`BLEND_BAND_C` promoted to `TECT_BLEND_BAND` (64) / `TECT_BLEND_BAND_C` (256). Flag-ON only.
- **C — organic belt rivers** (grep `function orogenSampleRaster`): the warp + bilinear tail shared by `tectonicErosionAt` / `tectonicTalusAt` / `tectonicRiverFactor` is one injected helper; a broad second warp octave (`OROGEN_WARP_BROAD_AMP_MULT` 4.0 × cell, `OROGEN_WARP_BROAD_FREQ` 0.0067) is applied identically to all three rasters so channels stay in their carved valleys. Bake untouched (dh/flow/talusDh sha256 identical). Flag-ON only.
- **D — no-bake preview** (grep `CCR-WORLDGEN-PREVIEW-NOBAKE-001`): module flag `_orogenBakeSuppressed` (declared in main, worker injection, harness stub); the three samplers return their neutral value for an uncached region while the preview renders; the label reads "Terrain Preview (erosion not previewed)" when a region was skipped. Preview-time hydro bakes are discarded by the existing `hydroField.clear()` in `applyGenParams` and `seedMainThreadNoise` before generation. Real generation byte-identical (flag-ON grid hash unchanged).
- **E — lateral attraction** (`buildHydroRegion`, grep `HYDRO_ATTRACT_RADIUS`): on a near-planar step (best drop ≤ `HYDRO_ATTRACT_SLOPE_MAX` 20 blk) re-rank the strictly-downhill neighbours by Euclidean distance to the nearest claimed cell within `HYDRO_ATTRACT_RADIUS` (6 cells); join-termination/capture then merge the traces. Never steps uphill (M15 holds by construction). Raising `HYDRO_CAPTURE_RADIUS` instead was rejected (one artificial long jump, more discarded stubs).

## Version impact

- `VOXEX_BUILD` 2026-09-10.1 → **2026-09-10.2**; `VOXEX_RECENT_CHANGES` entry.
- `TERRAIN_GEN_VERSION` **45 → 46**: A and E change the default (non-tectonic) river carve/routing; flag-OFF fingerprint `e02bfb2a…242a7e` → see As-built for the final token.
- `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION`: no.

## As-built measurements

**A (seed VoxEx, 4 valley sites, flag-OFF):**

| Candidate | bandParallelism | mean along-run | wideTerraceValley |
|---|---|---|---|
| baseline | 0.270 | 4.07 | 0.314 |
| coord warp only (amp 22–40) | 0.22–0.25 | 3.3–3.7 | ~0.31 |
| wiggle mult 2–3 only | 0.19–0.23 | 2.3–2.6 | drops at ≥2.5 |
| **shipped: warp 15/0.006 + mult 2.0** | **0.206** | **2.69** | 0.302 |

Generalizes: tectonic-ON same seed 0.256 → 0.190; seed 1337 flag-OFF 0.217 → 0.168 (random baseline 0.167). Honest residual: tread AREA barely moved (the fix targets band direction); very gentle flanks at the exact band edges get a smaller nudge.

**B:** straightness (1500-block windows, RMS from a straight fit): VoxEx 23.1 → 41.7 mean / 20.7 → 27.8 median; 1337 25.5 → 37.8 / 23.7 → 32.2; 9001 22.4 → 32.8 / 18.9 → 24.9. Fold check 0/90000 samples, min Jacobian det 0.05–0.26. `plateLookup` cost ~6.0–6.8 µs/call before and after. Continuity maxAdjStep 50 → 30 (VoxEx), unchanged on 1337/9001. Honest residual: the longest belts still read straight-ish at 8 blk/px; a second sweep with a longer-wavelength macro octave is recorded below.

**C (seed VoxEx, two 1024² windows):** grid-locked chords 87.5% → 21.9% and 93.8% → 69.6%; mean |turn| 21.5° → 8.1°; local-dh-min coincidence 51.8% → 62.5% and 61.3% → 63.9%. Bake-twice deterministic; flag-OFF fingerprint unchanged by this workstream.

**D:** flag-ON `computeSurfaceHeight` grid hash identical before/after (`b80302bf…`); flag-OFF fingerprint unchanged; Node mechanism check: suppressed+uncached → neutral with zero bakes, suppressed+cached → cached value, unsuppressed → bakes.

**E:** confluence rate 0.832 → 0.867; coast-transect channel crossings −15–20%; `biome-pipeline-checks --hydro` M8/M14/M15/M16/M17 PASS ×3 seeds before and after (M21 fails identically on the untouched base — pre-existing, unrelated); region-build cost 0.94× median / 1.01× mean.

Gates on the integrated branch: syntax GREEN; parity LOCKSTEP GREEN; terrain-node-checks ALL HARD GREEN ×3; browser suite via CI (cannot run in the cloud sandbox — agent-notes §7).

## Residuals

- Terrace tread AREA on very gentle slopes is unchanged by A (only direction/regularity); the open-slope warp default is evaluated in the second pass (see As-built addendum).
- B's macro octave is bounded by fold safety; multi-thousand-block belts still bend only gently.
- C's "channel sits in a Δh < −3 valley" test was uninformative on the sampled seed (belt-gated erosion is weak away from high-relief interiors).
- E: a short comb can still appear at the very first springs before attraction/capture acts (same residual WS6-P3 documented).
- The ribbon path remains the legacy escape hatch; the hydro default was not changed by C.

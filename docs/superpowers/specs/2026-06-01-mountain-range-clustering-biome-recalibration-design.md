# Mountain-Range Clustering + Biome Recalibration — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorming), pending implementation plan
**Predecessors:** `2026-05-29-noise-isotropy-mountain-retune-design.md` (the noise-isotropy fix that surfaced this work)

## Problem

The `noise2D` isotropy fix (the `& 15` gradient mask) is correct and stays. But it revealed that the
**broken anisotropic noise was load-bearing**: the biome/terrain system had been calibrated and
art-directed around it. With correct isotropic noise, two downstream defects surfaced, observed by
the user on a brand-new default world:

1. **Plains/foothill notches amid mountains.** Traveling through mountain country, the surface
   plunges from mountain height to ~y64 (a flat foothill/plains chunk) and back up. Diagnosis: at
   default biome size (`biomeFrequency = 0.5`) the biome-selection noise **decorrelates between
   adjacent 64-block cells**, so mountains are scattered *single* cells, never coherent ranges. The
   y64 pockets are ~69% `mountain_foothills` cells (not river/ocean carving — ocean/river factors
   were 1.0): `foothillsHeightFunc` = `base + (mountainsHeightFunc − 64) × ringFactor×0.9`, so where
   the mountain field dips between scattered peaks, the foothill bottoms out at plains level.
   Pre-fix, the anisotropic bug suppressed X-axis variation, so this (and the jaggedness) was hidden
   on one axis; the fix equalizes the axes and exposes it everywhere.

2. **Biome distribution miscalibration.** `_BIOME_CDF_TABLE` was empirically fit to the *old* noise's
   value distribution. Measured aggregate raw biome proportions vs configured weights
   (plains 20 / hills 20 / forests 20 / mountains 10 / swamp 10 / longwoods 20):
   - pre-mask: forests **2.5%**, mountains 4.5%, swamp 16.5%, longwoods 29.2% (already off);
   - post-mask: forests 12.9%, hills 12.5%, swamp 7.1%, plains 30.8% (off differently).
   The table is stale relative to the corrected noise.

## Goal

Restructure the mountain placement and biome selection so they work *correctly* with isotropic
noise — believable mountain **ranges** (no sea-level notches between peaks) and biome proportions
matching configured weights. Keep the isotropy fix and the existing mountain re-tune.

## Non-goals

- Changing `mountainsHeightFunc` further (the re-tune is preserved; it met its gates).
- Reverting the isotropy mask.
- Reworking non-mountain height functions, rivers, oceans, or lighting.
- Per-world noise versioning (save seams remain accepted, per the predecessor design).

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mountain placement | **Dedicated low-frequency, domain-warped region mask** (Approach A), optionally continentalness-modulated during tuning | Full control over range size/prevalence independent of land/ocean; targets the notch root cause |
| Mountains in weighted roll | **Removed** — placed only by the mask | Decouples coherent mountain placement from the per-cell variety roll |
| Biome CDF | **Recalibrate** for the corrected noise + reweight to the 5 non-mountain biomes | Restores configured proportions (fixes near-absent forests) |
| Foothill logic | **Unchanged formula**; clustering fixes notches structurally | Notches are eliminated by continuous range interiors, not by patching foothill height |
| Validation | Harness metrics (prevalence, range coherence, notch count, biome distribution) + in-game spot-check | "Looks right" is the user's call; data guides each step |

## Architecture

Biome assignment changes from "one weighted per-cell roll over 6 biomes" to "region-masked mountains
+ weighted per-cell roll over 5 non-mountain biomes," with a recalibrated CDF. Everything else in the
terrain pipeline (`blendedHeight`, foothill conversion, `mountainsHeightFunc`, rivers/oceans) is
unchanged. The chunk worker mirrors the new logic via `toString()` injection.

### 1. Mountain-region mask

New module-scope function near the biome functions (`voxEx.html:~36106`):

```js
function isMountainRegion(gx, gz) {
    const { seed } = worldConfig;
    const wx = noise2D(gx * 0.002 + seed * 5, gz * 0.002) * 60;        // domain warp → winding ranges
    const wz = noise2D(gx * 0.002 + 100, gz * 0.002 + seed * 5) * 60;
    const m = noise2D((gx + wx) * MOUNTAIN_REGION_FREQ + seed * 0.9,
                      (gz + wz) * MOUNTAIN_REGION_FREQ - seed * 0.4);
    return m > MOUNTAIN_REGION_THRESHOLD;
}
```

Two module-scope constants, tuned via the harness then in-game:
- `MOUNTAIN_REGION_FREQ` (start ~0.0015) — range size. Low enough that adjacent 64-block cell
  centers are correlated (`64 × freq ≈ 0.1`), producing contiguous multi-cell ranges.
- `MOUNTAIN_REGION_THRESHOLD` (start ~0.34) — tuned so ~10% of cells are mountains. (`noise2D` at the region frequency ranges ~[-0.79, 0.81], p90 ≈ 0.34; verified — 0.6 would give <1%.)

### 2. Biome selection restructure

`getRawBiomeParams(gx, gz)`:
```js
function getRawBiomeParams(gx, gz) {
    if (isMountainRegion(gx, gz)) return biomeByName.get('mountains');
    const { seed, biomeFrequency } = worldConfig;
    const noiseVal = noise2D(gx * biomeFrequency + seed * 0.37, gz * biomeFrequency - seed * 0.71);
    const t = uniformBiomeRoll(noiseVal);                 // recalibrated CDF
    // weighted pick over the 5 non-mountain biomes (plains2/hills2/forests2/swamp1/longwoods2, total 9)
    ...
}
```
- The biome weight table used by the roll drops the `mountains` row; new total weight 9. `mountains`
  remains in `BIOME_CONFIG`/`biomeByName` (referenced by the mask, foothills, height funcs).
- `_BIOME_CDF_TABLE` is regenerated: sample corrected `noise2D` at `biomeFrequency` over a large point
  set (headless, via `?test=1`), build the empirical CDF inverse, bake the new static table in.

### 3. Foothills (unchanged formula, fixed by context)

`getBiomeCellDirect` foothill conversion and `foothillsHeightFunc` are unchanged. With clustered
ranges, foothills apron the range perimeter (correct), range interiors are continuous mountains
(no notches), and interior low spots are natural mountain valleys via `mountainsHeightFunc`.
`MAX_FOOTHILL_RINGS` stays 1; widen only if the perimeter transition reads too abruptly in validation.

### 4. Worker parity

`buildChunkWorkerCode()` must inject `isMountainRegion`, the two new constants, the modified
`getRawBiomeParams`, and the recalibrated CDF table — exactly as it already injects the biome-cell
functions. The Tier-4 worker↔main parity test is the guard.

## Validation

Harness (`tools/voxex-tests.html`) metrics via the `?test=1` seam (new seam export: `isMountainRegion`):
- **Mountain prevalence** ≈ 10% of cells (tune `MOUNTAIN_REGION_THRESHOLD`).
- **Range coherence** — mountain-cell cluster sizes are multi-cell (cluster-size distribution; runs > 1).
- **Notch count → ~0** inside mountain regions (reuse the high→y64→high pocket diagnostic; classified
  foothill/plains pockets amid mountains collapse to ~0).
- **Biome distribution** — aggregate non-mountain proportions match 2/2/2/1/2; overall mountains ~10%.
- **Mountain isotropy gate** still passes (asymmetry ≈1, steps ≤ old-X ceiling; the re-tune preserved).
- **Full suite 193/193 green; worker↔main parity green.**
- A top-down mountain-region map + cluster-size + notch-count added to the harness "Mountain Tuning"
  panel, alongside the existing cross-sections.
- **In-game spot-check** at agreed seeds — user confirms believable ranges, notches gone.

## Acceptance gates

- Mountain prevalence in ~[8%, 13%] across seeds.
- Median mountain cluster size ≥ 3 cells (coherent ranges, not singles).
- Notch count inside mountain regions ≈ 0 (≥90% reduction vs current).
- Non-mountain biome proportions within ±5 points of configured weights.
- Isotropy gate + full suite + worker parity all green.
- User in-game sign-off.

## Risks

- **Worker drift** — the new function/constants/table must be injected identically; parity test guards.
- **Tuning interplay** — `FREQ`/`THRESHOLD` interact (bigger ranges at fixed threshold → more mountain
  area); tune prevalence and coherence together on the harness before in-game.
- **CDF regeneration correctness** — validate the new table reproduces uniform `[0,1]` and the target
  weights before baking; keep the generation method documented.

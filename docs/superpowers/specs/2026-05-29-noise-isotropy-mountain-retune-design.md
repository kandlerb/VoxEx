# noise2D Isotropy Fix + Mountain Re-tune — Design

**Date:** 2026-05-29
**Status:** Approved (brainstorming), pending implementation plan

## Problem

`noise2D`'s 2D Perlin gradient (`grad`) never masks its hash. It receives a raw `perm`
value (0–255); its direction logic (`h < 8`, `h < 4`, `h === 12 || h === 14`) only behaves
for `h < 16` (~6% of values). For `h ≥ 16` (~94%) it degenerates to a `±y`-only gradient, so
~94% of 2D gradients point purely along the Z axis. The sibling `grad3D` correctly does
`hash & 15`; the 2D `grad` is missing exactly that mask.

**Player-visible symptom:** terrain is smooth along X but jumpy / dropping along Z. Measured
via the test harness, `mountainsHeightFunc` is 6–18× jaggier along Z than along X across all
seeds tested (systematic, not per-seed ridge orientation). Plains/hills/forests are also
anisotropic but hide it at their low frequency/amplitude.

This was found, fixed (commit `91ecef5`), verified, then **reverted** (`430372a`) because
`mountainsHeightFunc` was implicitly tuned against the broken anisotropic noise — the bug made
one axis nearly flat, so full ruggedness read as smooth ridgelines. With correct isotropic
noise the full ruggedness applies to *both* axes → extreme spires / near-vertical walls.

## Goal

1. Re-apply the gradient mask so 2D noise is isotropic.
2. Re-tune `mountainsHeightFunc` so isotropic mountains read as **believable, tamer ranges**:
   rounder shoulders, far fewer impossible spires / vertical walls, ridgelines still dramatic
   but traversable.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Feedback loop | Heightmap/metrics tool (real code via `?test=1` seam) for fast iteration + in-game spot-checks at agreed checkpoints | I cannot judge terrain aesthetics; user closes the loop visually, but data drives each step |
| Mountain target | **Tamer, more natural** — believable ranges, not the current pre-fix silhouette | User choice; the fix is the opportunity to soften impossible geometry |
| Save compatibility | **Accept seams** — apply globally; existing saves seam, new worlds are correct; no versioning | Simplest; matches the original finding's stated plan |
| Tuning target | Bring both axes' jaggedness to — or gently below — the **old X-axis profile** | The user played the anisotropic build and complained *only about Z*, so the old-X distribution is their implicitly-tolerated ceiling, turning "tamer" into a measurable target |

## Architecture

Two parts: a small mechanical core and a large empirical loop around it.

### Mechanical fix (exact, verifiable)

Add `h &= 15;` at the top of **both** 2D `grad` copies — they must stay byte-identical because
`buildChunkWorkerCode()` injects the main-scope terrain functions into the worker via
`Function.toString()`, and the suite's worker↔main parity test depends on that equivalence.

- Worker template copy: `voxEx.html:18926`
- Main module copy: `voxEx.html:21416`

```js
const grad = (h, x, y) => {
    h &= 15;                       // <-- the fix (mirrors grad3D)
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};
```

No other logic changes in this part. The one-line fix is preserved in history at `91ecef5`.

### Save compatibility

Applied globally. Existing saved worlds will show a seam where old-noise stored chunks meet
newly-generated corrected-noise chunks, and a given seed regenerates differently across **all**
biomes. New worlds are correct. No `noiseVersion` / versioning code.

## Instrumentation (the feedback loop)

Added to the harness (`tools/voxex-tests.html`), real-code-backed via the `?test=1` seam.
**Never** the stale copy-paste `tools/terrain-visualizer.html` (it reimplements the noise, so it
would drift — the exact anti-pattern the test suite eliminated). Kept lean: a cross-section line
plus ~4 summary stats, not an elaborate visualizer.

### `mountainMetrics(seed, opts)` helper

Samples `mountainsHeightFunc` over a grid and reports, **per axis (X and Z separately)**:

- **Mean |single-block step|** and **P99 |step|** — jaggedness / wall measure.
- **% of columns with step > 3 blocks** — near-vertical / impassable measure.
- **Peak height P99 + max** — spire measure.
- **X/Z asymmetry ratio** (mean-Z-step ÷ mean-X-step) — isotropy measure (target ≈ 1×;
  currently 6–18×).

### Cross-section profile

Render one row of `mountainsHeightFunc` heights along X and one along Z as side-by-side line
graphs. This reveals spires / walls that top-down shading hides.

### Capture order (critical)

1. Run `mountainMetrics` and **save the numbers before applying the mask** (anisotropic
   baseline) — especially the **old X-axis distribution**, which becomes the tuning ceiling.
2. Apply the mask; re-measure (shows what the mask did, which stages spawn spires).
3. Re-measure after each tuning pass.

## Re-tune: knobs mapped to symptoms

Tune the *specific* knobs per symptom, not global amplitude.

| Symptom | Knob(s) | Location |
|---|---|---|
| Spires (sharp pinnacles) | cubed peak-amplification `+= ((ridgeSum-0.5)*2)^3 * 0.4`; ultra-peak boost; spire `peakBonus` | `voxEx.html:36464–36470`, `36497–36502` |
| Near-vertical walls / pointy crests | ridge `sharpness` exponents (1.6 / 1.4) | `36454` |
| Surface roughness / impassability | `jaggedAmount`, `erosionAmount` (both altitude-scaled) | `36480`, `36522` |
| Overall height ceiling | `biome.amplitude` (180); final clamp (285) | `21909`, `36557` |

**Order of attack:** soften peak-amplification and spire `peakBonus` first (these create the
impossible pinnacles), then ridge sharpness (rounder shoulders), then jagged/erosion
(traversability). Touch global amplitude last and only if needed, to preserve the dramatic
ridgelines the user wants to keep.

## Acceptance gates (guardrails, not done-ness)

- X/Z asymmetry ratio ≈ 1× (isotropy achieved).
- Both axes' step distribution **at or gently below the old-X ceiling** captured pre-mask.
- Peak P99 / max within world bounds; no pathological columns.
- Worker↔main parity test stays green.
- **Full suite stays 193/193 green.**
- Non-mountain biomes (plains/hills/forests) spot-checked — they change with the mask but must
  not visibly regress (we are only *tuning* mountains).

**Done is the user's eye, not the gates.** Gates green → user does an in-game spot-check at 2–3
agreed seed/coordinate checkpoints. Only user approval closes the work.

## Out of scope

- Rewriting `mountainsHeightFunc` from scratch.
- Re-tuning non-mountain biomes (only verify they don't regress).
- Per-world noise versioning / migrating existing saves (seams accepted).

## Verification

- Harness metrics + cross-section before/after each change (real code via seam).
- Full automated suite (`tools/voxex-tests.html`) run over a local server, must stay green.
- Worker↔main parity test (Tier 4) must stay green — proves the worker copy of `grad` matches.
- In-game spot-checks in `voxEx.html` at agreed checkpoints (final sign-off).

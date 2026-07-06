# VoxEx — Domain-Warped Multi-Scale Terrain Detail (plan)

Goal: replace the current "smooth macro spline + bolted-on detail + anti-terracing jitter" stack with **one coherent domain-warped fractal surface**, so terrain has natural detail at every scale — no clean terraces, no random speckle — and so tuning is a handful of **orthogonal** knobs instead of whack-a-mole.

## 1. Why we keep ping-ponging (the diagnosis)

The surface is currently built as three fighting layers:

1. A **smooth macro** (`SPLINE_PEAKS`·relief + continental) — low-frequency, so on any slope it floors into clean terraces.
2. A **weak detail** layer (`billowNoise` for hills, `ridgedMultifractal` for mountains) added on top — too small and too smooth to break the terraces on hills.
3. A **post-hoc jitter** (`+ noise * antiTerrace`) to break terraces — but it's *uncorrelated additive noise applied uniformly*, so at any strength that breaks terraces it also reads as speckle.

"Break terracing" (more high-freq) and "reduce noise" (less high-freq) are the **same knob pulled opposite ways** → every fix trades one artifact for the other.

**What good terrain actually is:** a single **fractal** field where detail exists at *every* scale and — critically — the fine detail is **spatially correlated** with the coarse structure (a bump sits *on* a ridge, not randomly everywhere). Correlated fine detail reads as "rock texture / erosion"; uncorrelated fine detail reads as "static." Terracing disappears because the fractal already has sub-block content on slopes; noise disappears because that content is concentrated on structure and scales *down* on flats.

## 2. The technique (three ingredients)

**(a) fBm — fractal Brownian motion.** Sum octaves of noise at doubling frequency and shrinking amplitude:
`h = Σ ampᵢ·noise(freqᵢ·p)`, `freq *= lacunarity(≈2)`, `amp *= gain(≈0.45)`. Self-similar detail at all scales. `gain` is the single "roughness" control.

**(b) Domain warping.** Sample the fractal at a coordinate that's itself displaced by noise: `p' = p + A·noise(fw·p)`. Turns round/straight features into winding, organic ridgelines and coastlines, and — because the warp is isotropic — kills any axis-aligned "corduroy." One or two warp levels.

**(c) Multiplicative multifractal (coherence, no derivatives needed).** Each octave is scaled by the running product of previous octaves: `v *= (k + (1−k)·prev)`. This concentrates fine detail where coarse structure is already high (ridges get textured) and suppresses it in flats (valleys/plains stay smooth). This is the ingredient that makes detail read as terrain, not noise — and it's what our `ridgedMultifractal` already half-does, just only for mountains.

> Optional gold-standard upgrade (§7): IQ's **derivative-based erosion fBm** damps octaves by local slope for even more realistic smooth valleys / sharp ridges — but it needs a noise function that returns its gradient (a bigger change). The multiplicative multifractal above gets ~80% of the look with the existing `noise2D`.

## 3. The unified surface function

One function replaces `terrainBaseHeight` + `terrainDetail` + `billowNoise` + `ridgedMultifractal` + the anti-terrace jitter. Octave count is **fixed**; amplitude, gain (roughness), smooth-vs-ridged character, and warp strength are **driven continuously by the climate params** (continentalness `C`, erosion→`relief`), so plains / hills / mountains emerge from one formula. (`PV`/peaks-valleys is NOT used in height — the fractal makes the peaks; `PV` stays only for biome selection, per §9.)

```js
// Drives everything off the existing climate fields. Isotropic noise2D (post gradient-fix).
function terrainSurface(gx, gz) {
    const s   = worldConfig.seed;
    const amp0 = worldConfig.terrainAmplitudeMultiplier ?? 1.0;
    const C  = continentalness(gx, gz);
    const E  = erosionParam(gx, gz);
    const relief = spline(SPLINE_EROSION, E);      // 0 flat .. 1 mountainous (existing curve)

    // --- climate → fractal parameters (the ORTHOGONAL knobs live in these mappings) ---
    // octaves FIXED (not relief-scaled): fine detail must exist EVERYWHERE to break terraces. What
    // makes plains smooth vs mountains rugged is the AMPLITUDE, not the octave count — see note below.
    const octaves    = OCTAVES;                             // fixed 6
    const gain       = BASE_GAIN + relief * GAIN_BY_RELIEF; // roughness: smoother plains, rougher peaks
    const ridgeMix   = smoothstep(0.42, 0.82, relief);      // 0 hills=smooth .. 1 mountains=ridged
    const warpAmp    = WARP_BASE + relief * WARP_BY_RELIEF;  // more winding at altitude

    // --- domain warp (organic, non-axis-aligned) ---
    const wx = gx + noise2D(gx * WARP_FREQ + s,        gz * WARP_FREQ)        * warpAmp;
    const wz = gz + noise2D(gx * WARP_FREQ + 100, gz * WARP_FREQ + s)   * warpAmp;

    // --- multifractal accumulation ---
    // Blend SMOOTH fBm (gentle rolls for hills/plains) → RIDGED (sharp for mountains). Do NOT use
    // |n| billow for the gentle end — it creases at zero-crossings and looks lumpy, not rolling.
    let sum = 0, a = 1, f = FRACT_FREQ0, norm = 0, prev = 1;
    for (let i = 0; i < octaves; i++) {
        const n = noise2D(wx * f + s * 10 + i * 13.1, wz * f - s * 10 - i * 7.3);
        const smooth = (n + 1) * 0.5;                 // 0..1 gentle (hills/plains)
        const ridge  = 1 - Math.abs(n);               // 0..1 sharp ridge (mountains)
        let v = smooth + (ridge * ridge - smooth) * ridgeMix;   // sharpen only the ridged end
        const pc = prev < 0 ? 0 : (prev > 1 ? 1 : prev);
        v = v * (0.35 + 0.65 * pc);                   // multifractal coherence (detail sits on structure)
        sum += v * a; norm += a; prev = v;
        a *= gain; f *= 2.0;
    }
    let hf = sum / norm;                              // ~0..1 fractal surface
    if (ridgeMix > 0.5 && hf > 0.6) hf += (hf - 0.6) * (hf - 0.6) * PEAK_AMP; // sharp summits

    // --- assemble height ---
    const base      = WORLD_DIMS.seaLevel + spline(SPLINE_CONTINENTAL, C);   // ocean..inland baseline
    const amplitude = relief * RELIEF_AMPLITUDE * amp0;                       // how tall this region gets
    const lift      = relief * relief * NOTCH_LIFT * amp0;                    // mountain base lift (notch-safe, ~0 on plains)
    return base + lift + hf * amplitude;
}
function computeSurfaceHeight(gx, gz) {
    return Math.min(MAX_SURFACE_Y, Math.max(1, Math.floor(terrainSurface(gx, gz))));
}
```

**The key insight — amplitude, not octave count, is what smooths plains and roughens mountains.** With a fixed 6 octaves, the finest octave's height contribution ≈ `gain⁵/norm × amplitude`. Because `amplitude = relief × RELIEF_AMPLITUDE`:
- **Plains** (amplitude ≈9): finest octave ≈ **0.2 blocks** → sub-block → invisible → smooth, even though the detail is "there." No terraces (gentle), no speckle (sub-block).
- **Hills** (amplitude ≈38): finest octave ≈ **0.8–1 block** → just enough to *break* the 4-block terraces, and because it's the coherent bottom of the same fractal it reads as surface texture, not static.
- **Mountains** (amplitude ≈95): finest octave ≈ **~2 blocks**, ridged + peak-amplified + strongly warped → rugged ridgelines and summits.

Same octaves, same gain — the amplitude does the work. This is why the old relief-scaled octave count was wrong: it starved hills of the fine octaves they need to de-terrace. `gain` is the one texture dial: too low ⇒ fine octaves too weak ⇒ terraces; too high ⇒ fine octaves too strong on plains ⇒ speckle. Start ~0.5.

> **Caveat on these estimates — `noise2D` range.** The block figures above assume `noise2D` spans ~±1. VoxEx's noise is narrower (that's why `FIELD_GAIN = 3.0` exists to stretch fbm's ~±0.3); a single octave is wider than fbm but still likely ~±0.5–0.7 effective. If so, the finest-octave energy is roughly half the estimate and hills may still terrace at `BASE_GAIN 0.48` — expect the tuned value to land higher (~0.55–0.6). Not a design problem (the §8 protocol converges on it); just don't read a still-terraced first build as a failure of the approach.

> **Correctness note — `RELIEF_AMPLITUDE` is NOT the old `DETAIL_MAX` value.** In the old code, height = `SPLINE_PEAKS·relief` (macro, ~55) **plus** `DETAIL_MAX·relief` (detail, 45). The fractal now carries **both**, so `RELIEF_AMPLITUDE` must ≈ (old macro + old detail) ≈ **~110**, not 45. Using 45 would give tiny, flat mountains. `hf` is a weighted average that peaks ~0.9 at summits (after `PEAK_AMP`), so a big peak ≈ `base(~70) + lift + 0.9·(relief·110) ≈ ~70 + 30 + 84 ≈ 180`, matching today's mountains. Set this first (§8 step 1).

## 4. Parameter map (the orthogonal knobs)

These are the *only* dials, and they're independent — changing one doesn't reopen another:

| Knob | Controls | Start | If "too terraced/smooth" | If "too noisy/busy" |
|------|----------|-------|--------------------------|----------------------|
| `BASE_GAIN` | overall surface **roughness** (fine-octave energy) — the one texture dial | 0.48 | raise | lower |
| `GAIN_BY_RELIEF` | extra roughness on mountains vs plains | 0.08 | raise | lower |
| `OCTAVES` | fixed octave count (fine-detail reach) | 6 | +1 (finer) | −1 (coarser) |
| `RELIEF_AMPLITUDE` | **height** of hills/mountains (carries macro+detail; NOT old 45 — see note above) | ~110 | — | — (this is height, not texture) |
| `SPLINE_EROSION` | how much of the map is flat vs rugged | (existing) | — | shift toward flat |
| `WARP_BASE`/`WARP_BY_RELIEF` | how **winding/organic** ridgelines are | 40 / 90 | — | — |
| `PEAK_AMP` | summit sharpness (mountains) | ~2.0 | — | — |
| `NOTCH_LIFT` | mountain-valley base lift for the notch test | ~35 | — | — |
| `FRACT_FREQ0` | size of the biggest fractal features (mountain width) | 0.004 | lower for wider/gentler | raise for tighter |

The crucial split: **`gain` = texture, `RELIEF_AMPLITUDE` = height, `WARP` = shape.** Terracing vs. noise is now *only* `gain`, and it's decoupled from how tall things are — so we tune texture once and never touch it to fix height.

## 5. What it replaces / keeps

**Remove / fold in** (all currently in `voxEx.html`):
- `terrainBaseHeight` (macro spline dominance) → folded into `terrainSurface`.
- `terrainDetail` (billow/ridged split + gully) → folded in (gully can return later as a subtractive octave).
- `billowNoise`, `ridgedMultifractal` → replaced by the inline multifractal loop.
- The **anti-terracing jitter** in `computeSurfaceHeight` → deleted (the fractal does it correctly now).
- `SPLINE_PEAKS` → deleted (macro shape now comes from the fractal's low octaves; `PV` retained only for biome selection).
- `DETAIL_MAX` → renamed `RELIEF_AMPLITUDE` (same role: total relief height).

**Keep unchanged:**
- `continentalness` + `SPLINE_CONTINENTAL` (ocean↔inland baseline).
- `erosionParam` + `SPLINE_EROSION` (→ `relief`).
- `temperature`/`humidity`/`peaksValleys` (biome selection via `resolveBiome`).
- `blendedHeight`/`getPreRiverHeight` wrappers (still call `computeSurfaceHeight`); ocean/river carve; the river-bank fix.
- `reliefScale²` notch lift (now `NOTCH_LIFT`).

## 6. Notch test, worker parity, performance

- **Notch test:** unchanged strategy — the `NOTCH_LIFT` (relief², ~0 on plains) keeps mountain valleys above 78. Verify: mountain min = `base + lift + 0` (fractal can dip to ~0) must stay >78 at low continentalness. **`NOTCH_LIFT = 35`, not the old 20**: the old valley floor was `20·relief²` lift **plus** `SPLINE_PEAKS(valley)≈22·relief` from the macro spline; the fractal valley (hf→0) loses that spline term, so 35 compensates.
- **Worker parity:** `terrainSurface` is a pure function → add it to the `terrainFuncs` injection list (it replaces the ones removed); bake the new consts (`BASE_GAIN`, `GAIN_BY_RELIEF`, `RELIEF_AMPLITUDE`, `WARP_*`, `PEAK_AMP`, `NOTCH_LIFT`, `FRACT_FREQ0`) alongside the existing baked consts; delete the emits for removed symbols. Update the `window.VoxEx` test seam.
- **Preview parity:** free — `WorldPreviewRenderer.render()` delegates directly to the game's `blendedHeight` (~21890), so the create-world preview tracks the new surface automatically. No preview edits needed.
- **`tools/terrain-visualizer.html`:** currently contains extracted copies of the **OLD** (pre-`useNewTerrain`) system only — no `continentalness`/`erosionParam`/spline code — so it is *already* stale for new-terrain worlds; this rewrite doesn't make it worse. **Deferred:** port `terrainSurface` + the climate funcs to the visualizer as a follow-up (it's the tuning tool for §8, so sooner is better), or tune in-game via the debug overlay.
- **Performance:** fixed 6 fractal octaves + 2 warp samples + `continentalness` (~10) + `erosionParam` (~3) ≈ **~21 `noise2D`/column** — comparable to today's continental + ridged(6) + billow(2) + warp, and it drops the separate `peaksValleys`/`weirdness` height sample. `computeSurfaceHeight` is still evaluated twice per column (via `blendedHeight` and `getPreRiverHeight`) — the same pre-existing perf debt, cache/reuse later. Cache params per column as now.

## 7. Optional upgrade — derivative-based erosion (later)

For the most realistic result (smooth dendritic valleys, knife-edge ridges), adopt Inigo Quilez's erosion fBm: use a noise variant that returns value **and** analytic gradient `(v, dx, dz)`, accumulate the gradient, and damp each octave by the running slope: `a *= gain / (1 + SLOPE_ERODE·(dx²+dz²))`. Cost: a `noise2D` that also returns derivatives (a new function, kept single-source + injected). Recommend shipping §3 first, then evaluating whether this is worth it — the multifractal coherence already removes the noise/terrace problem.

## 8. Rollout & tuning protocol (so we stop ping-ponging)

**Build (one pass):**
1. Add `terrainSurface` + the new consts; rewrite `computeSurfaceHeight` to call it. Keep the old functions temporarily so `blendedHeight`'s flag path is unchanged.
2. Worker injection + seam + const-bake edits (§6). Bump `TERRAIN_GEN_VERSION`.
3. Run `tools/voxex-tests.html` (notch, determinism, worker parity). Fix `NOTCH_LIFT` if the notch test complains.
4. Delete the now-dead `terrainBaseHeight`/`terrainDetail`/`billowNoise`/`ridgedMultifractal`/jitter/`SPLINE_PEAKS`.

**Tune (converges, doesn't oscillate):** change **one knob at a time**, in this order, and only move to the next once the current reads right:
1. `RELIEF_AMPLITUDE` — get mountain/hill **height** right (texture will look wrong; ignore it).
2. `SPLINE_EROSION` — get the **proportion** of flat vs rugged right.
3. `BASE_GAIN` (+ `GAIN_BY_RELIEF`) — get the **texture** right: raise if terraced, lower if busy. Height won't move.
4. `WARP_*` / `PEAK_AMP` — final **shape/character** polish.

Because these are orthogonal, step 3 (the texture dial we kept fighting) no longer disturbs steps 1–2. That's the whole point.

## 9. Confirmed decisions (locked 2026-07-01)

- **`PV` dropped from height — CONFIRMED.** `peaksValleys` is NOT used by `terrainSurface`; the fractal's low octaves make the peaks/valleys. `PV` is retained **only** for biome selection in `resolveBiome`. `SPLINE_PEAKS` is deleted. (The §3 code already reflects this — it references only `C` and `E`.)
- **Derivative-erosion upgrade (§7) — DEFERRED.** Ship the multiplicative multifractal (§3) first; revisit IQ derivative erosion later.
- **Gully carve — LEFT OUT for now.** Re-add later together with the erosion pass (deferred). Not in the §3 code.
- **Starter numbers:** the §4 table are estimates; set `RELIEF_AMPLITUDE`/`SPLINE_EROSION` first per §8's protocol.

## 10. Compatibility audit vs current `voxEx.html` (verified 2026-07-01, build ≥.77)

Audited against the live file after all the iterative tuning. **Verdict: compatible.** Everything the plan assumes exists as described; everything it removes is internal-only; all new names are free.

**Current state confirmed:**
- Functions present as the plan expects: `continentalness` (38234), `erosionParam` (38235), `peaksValleys` (38245), `ridgedMultifractal` (38265), `billowNoise` (38283), `terrainBaseHeight` (38294), `terrainDetail` (38309, sig `(gx,gz,PV,reliefScale,ampMult)`), `computeSurfaceHeight` (38326), `resolveBiome` (38353). Consts: `DETAIL_MAX=45`, `SPLINE_CONTINENTAL`, `SPLINE_PEAKS`, `SPLINE_EROSION`, `FIELD_GAIN`, `MAX_SURFACE_Y` — all present.
- The `reliefScale²` notch lift currently lives **inside `terrainBaseHeight`** → folds into `terrainSurface` as `NOTCH_LIFT` (§3). Nothing else references it.
- **All new identifiers are collision-free** (0 occurrences): `terrainSurface`, `BASE_GAIN`, `GAIN_BY_RELIEF`, `RELIEF_AMPLITUDE`, `WARP_BASE`, `WARP_BY_RELIEF`, `WARP_FREQ`, `PEAK_AMP`, `NOTCH_LIFT`, `FRACT_FREQ0`.

**Removed symbols are internal-only (clean removal):**
- `ridgedMultifractal` / `billowNoise` → called only by `terrainDetail` (being rewritten).
- `terrainBaseHeight` / `terrainDetail` → called only by `computeSurfaceHeight` (being rewritten) + injection + seam.
- `SPLINE_PEAKS` → referenced only by `terrainBaseHeight` + its const-bake line.
- `peaksValleys` → after removal it's used ONLY by `resolveBiome` (38357). **Keep `peaksValleys` and `weirdness`** (biome selection). Confirmed the fractal drops PV (§9).

**Exact edits required (4 sites):**
1. **Injection list** `terrainFuncs` (19601–19603): delete `ridgedMultifractal, billowNoise, terrainBaseHeight, terrainDetail`; add `terrainSurface`. Keep `continentalness, erosionParam, weirdness, peaksValleys, temperature, humidity, computeSurfaceHeight, resolveBiome`.
2. **Const bake block** (19647–19651): delete the `SPLINE_PEAKS` emit; add emits for `BASE_GAIN, GAIN_BY_RELIEF, RELIEF_AMPLITUDE, WARP_BASE, WARP_BY_RELIEF, WARP_FREQ, PEAK_AMP, NOTCH_LIFT, FRACT_FREQ0`. Keep `SPLINE_CONTINENTAL, SPLINE_EROSION, FIELD_GAIN, MAX_SURFACE_Y`, delete `DETAIL_MAX` emit (renamed).
3. **Test seam** `window.VoxEx` (voxEx.html 46696–46697): delete `terrainBaseHeight`; add `terrainSurface`.
4. **Test file** (`tools/voxex-tests.html` line 194): delete `terrainBaseHeight` from the destructure — it is destructured but **never asserted on** (no test uses it), so this is a cleanup, not a breakage. Optionally add `terrainSurface`.

**Naming note:** `DETAIL_MAX` → `RELIEF_AMPLITUDE` is a clarity rename touching its def + bake line. Keeping the name `DETAIL_MAX` is equally fine and lower-churn — implementer's choice.

**Build-time verification (these are the ones to actually watch):**
- **Notch test** (`rangeMetrics` → `blendedHeight`, ≤6 notches): the fractal can dip its surface to ~0, so a mountain valley = `base + NOTCH_LIFT + ~0`. Start `NOTCH_LIFT = 35` (see §6 — the old system's valley floor also got ~22·relief from `SPLINE_PEAKS`, which the fractal drops) so that stays >78 even at low continentalness. This is the one most likely to need a nudge.
- **Continuity test** (`computeSurfaceHeight` adjacent-column |Δ| **< 30**, voxex-tests.html 784–795): a well-behaved multifractal stays well under this, but a too-hot finest octave (high `gain`, high `FRACT_FREQ0`·2^octaves, or strong `PEAK_AMP`) could spike it. If it trips, lower the finest-octave energy. The current ridged mountains already pass, so the bar is reachable.
- **Determinism + worker byte-parity** (existing Tier-4 suites): `terrainSurface` is pure `(gx,gz,seed)` → should pass once injected + consts baked. A missing baked const shows as a chunk-border cliff.
- Bump `TERRAIN_GEN_VERSION`.

No blockers found. The rewrite is contained to the surface layer; climate fields, biome selection, ocean/river carve, and the river-bank fix are all untouched.

## 11. Line-by-line implementation

Order matters: do **Phase A** (add + wire + test) fully — it leaves a working game with the old functions dead-but-harmless — then **Phase B** (delete) once tests pass. Line numbers are anchors; locate by the quoted text.

### Phase A

**A1 — Replace the amplitude const + add the new consts.** Find `const DETAIL_MAX   = 45;` (~38198). Replace that single line with:
```js
            const RELIEF_AMPLITUDE = 110;   // total relief height (macro+detail); NOT the old DETAIL_MAX 45 — see plan §3 note
            const OCTAVES          = 6;     // FIXED octave count (fine detail everywhere; amplitude decides visibility)
            const BASE_GAIN        = 0.48;  // base roughness (fine-octave energy): higher=rougher, lower=smoother
            const GAIN_BY_RELIEF   = 0.08;  // extra roughness on mountains vs plains
            const WARP_FREQ        = 0.003; // domain-warp frequency (large-scale bends)
            const WARP_BASE        = 40;    // warp displacement on flat terrain
            const WARP_BY_RELIEF   = 90;    // extra warp at altitude (winding ridgelines)
            const PEAK_AMP         = 2.0;   // mountain summit sharpening
            const NOTCH_LIFT       = 35;    // mountain-valley base lift (notch-test safety; ~0 on plains)
            const FRACT_FREQ0      = 0.004; // biggest fractal feature size (mountain width)
```
(`DETAIL_MAX` is now gone; nothing else references it once `terrainDetail` is deleted in Phase B.)

**A2 — Add `terrainSurface`.** Insert the full `terrainSurface` function from §3 (with the §3 corrected loop) **immediately above** `function computeSurfaceHeight(gx, gz) {` (~38326). It uses only already-defined symbols: `worldConfig`, `continentalness`, `erosionParam`, `spline`, `smoothstep`, `noise2D`, `SPLINE_EROSION`, `SPLINE_CONTINENTAL`, `WORLD_DIMS`, and the A1 consts — all in scope.

**A3 — Rewrite `computeSurfaceHeight`.** Replace its whole body (currently `terrainBaseHeight` + `terrainDetail` + the anti-terrace jitter) with the two-line §3 version:
```js
            function computeSurfaceHeight(gx, gz) {
                return Math.min(MAX_SURFACE_Y, Math.max(1, Math.floor(terrainSurface(gx, gz))));
            }
```

**A4 — Worker injection list.** In `buildChunkWorkerCode` (~19602–19604), replace:
```js
                    ridgedMultifractal, billowNoise,
                    terrainBaseHeight, terrainDetail, computeSurfaceHeight,
```
with:
```js
                    terrainSurface, computeSurfaceHeight,
```

**A5 — Worker const bake.** In the bake block (~19647–19651): **delete** the `DETAIL_MAX` line (19647) and the `SPLINE_PEAKS` line (19650), and add (order-independent, anywhere in that const block, which runs before the function-inject loop at 19668):
```js
                injectedCode += '    const RELIEF_AMPLITUDE = ' + JSON.stringify(RELIEF_AMPLITUDE) + ';\n';
                injectedCode += '    const OCTAVES = ' + JSON.stringify(OCTAVES) + ';\n';
                injectedCode += '    const BASE_GAIN = ' + JSON.stringify(BASE_GAIN) + ';\n';
                injectedCode += '    const GAIN_BY_RELIEF = ' + JSON.stringify(GAIN_BY_RELIEF) + ';\n';
                injectedCode += '    const WARP_FREQ = ' + JSON.stringify(WARP_FREQ) + ';\n';
                injectedCode += '    const WARP_BASE = ' + JSON.stringify(WARP_BASE) + ';\n';
                injectedCode += '    const WARP_BY_RELIEF = ' + JSON.stringify(WARP_BY_RELIEF) + ';\n';
                injectedCode += '    const PEAK_AMP = ' + JSON.stringify(PEAK_AMP) + ';\n';
                injectedCode += '    const NOTCH_LIFT = ' + JSON.stringify(NOTCH_LIFT) + ';\n';
                injectedCode += '    const FRACT_FREQ0 = ' + JSON.stringify(FRACT_FREQ0) + ';\n';
```
(Keep the `SPLINE_CONTINENTAL`, `SPLINE_EROSION`, `FIELD_GAIN`, `MAX_SURFACE_Y`, `BIOME_PARAMS`, `AXIS_W` bakes.)

**A6 — Test seam.** In `window.VoxEx` (~46697) change `terrainBaseHeight,` → `terrainSurface,`.

**A7 — Test file.** In `tools/voxex-tests.html` (~line 194) change `terrainBaseHeight,` → `terrainSurface,` in the `= VoxEx` destructure.

**A8 — Bump `TERRAIN_GEN_VERSION`** (~4250) **and `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`** (top of voxEx.html, per the CLAUDE.md checklist).

**A9 — Test.** Serve localhost, open `tools/voxex-tests.html`. Expect green except possibly the notch and continuity checks (see §10). Nudge `NOTCH_LIFT` up if notches > 6; reduce `BASE_GAIN`/`PEAK_AMP` if adjacent-Δ ≥ 30. Only once green:

### Phase B — delete the dead code

Now unreferenced (verified §10): delete the function definitions `terrainBaseHeight`, `terrainDetail`, `ridgedMultifractal`, `billowNoise`, and the const `SPLINE_PEAKS` (def ~38207). Re-grep each name to confirm zero remaining references before removing. Re-run the suite.

### Tuning (per §8, one knob at a time)

`RELIEF_AMPLITUDE` (height) → `SPLINE_EROSION` (flat-vs-rugged proportion) → `BASE_GAIN`/`GAIN_BY_RELIEF` (texture) → `WARP_*`/`PEAK_AMP` (shape). These are orthogonal, so step 3 no longer disturbs steps 1–2.

### Why this is the right approach for VoxEx specifically

- **Additive-then-delete** keeps a working, testable state at every step (matches the "correctness-first, then consolidate" philosophy used throughout this project) and never leaves the injected worker in a broken intermediate.
- **Single pure function** fits the existing inject-by-`toString()` + bake-consts machinery exactly — no new mechanism, no flag plumbing (it lives under the existing `useNewTerrain` path via `computeSurfaceHeight`).
- **Orthogonal knobs** end the terracing↔noise oscillation that's been the actual cost.
- **No new dependencies** (uses the existing isotropic `noise2D`, `spline`, `smoothstep`), so worker parity and determinism are preserved by construction.

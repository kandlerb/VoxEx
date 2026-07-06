# VoxEx — Mountain Overhaul: Erosion, Gullies, Valleys, Ridges, Peaks (investigation)

Status: **INVESTIGATION ONLY** (2026-07-05, against build .91 / TERRAIN_GEN_VERSION 28). No voxEx.html changes.
Prototype evidence: `Node replica renders (ov_cur91 / ov_swiss / ov_swiss_gully in the session outputs)`; continuity numbers measured against the real constants.

**Audit status (technique level, mapped to the §8 roadmap):** Swiss warp (§3) + crest peaks (§4c) — both prototyped with measured continuity → **Phase 1, implementation-ready**. IQ damping (§4a) — prototyped (`p2_iq_v2`), technically safe but visually inferior to Phase 1 alone → demoted to an optional Phase-4 experiment. Flow-aligned rills (§4b) — prototyped twice incl. the proposed fix, **REJECTED** (structural: gradient frames degenerate at gradient zeros). Tributary ravines (§4d) — design-audited, unprototyped → **Phase 2, prototype-gated**. Talus/strata materials (§6) — design-audited, cost corrected → **Phase 3**. Tile droplet sim (§5) — design-audited only (circularity fixed; derivative-seam + droplet-boundary risks open) → **Phase 5, spike-gated**.

**AUDIT (2026-07-05, against the live .91 file — all Phase-1 dependencies verified present):**
`noise2Dd` (~21279) + main `_nd2/_fd2/_ed2` (~21259) + worker copies (~18908); noise injection entry `fadeDeriv, noise2Dd, fbm2Dd` (~19536); terrain injection entry `splineDeriv, erosionParamD` (~19561); `HF_PIVOT`/`VALLEY_RATIO` consts (~38325) + worker bakes (~19615); `erosionParam → erosionParamD` delegation (~38409); `terrainSurface` loop/peak-block insertion points match §3/§4c. Audit corrections applied in-place: §5 circular raw/final surface definition split (`rawTerrainSurface`); §4d rewritten — the existing river valley carve CANNOT reach mountains (sea-level floor + strength fades end by ~95), tributaries are a new terrain-relative carve gated by `erosionParam`-derived relief; §6 talus cost corrected (heightPad is 1-ring — use lazy uphill sampling, not a wider pad); §4c capture-`ridge0` note; §3 chain-factor note so the validated accumulation isn't "corrected" into something unvalidated; Phase 2's dependency on Phase 1 made explicit.

## 1. Where mountains stand today (.91)

The current mountain look comes from: domain-warped 6-octave multifractal (coherence k=0.22), smooth→ridged blend by relief (`ridgeMix`), centered fractal (`HF_PIVOT` 0.35 — ridges amplify, interiors dip), peak boost (broad, crest-ish), foothill-stretched `SPLINE_EROSION`, and the river valley system carving the lowlands. What it still lacks, in the user's words: real **erosion character** — drainage textures on flanks, gullies, sharper structured ridge networks, summits that belong to crests rather than sitting on cones.

## 2. The constraint that decides everything

**Heights are a pure function of `(gx, gz, seed)`.** Any chunk and the worker must compute identical values with no neighbor data and no generation-order dependence (PAR-7 discipline; determinism + worker byte-parity tests enforce it). This immediately sorts erosion techniques into three classes:

- **Class A — per-column analytic** (fits natively): anything computable from noise fields + their analytic derivatives at the queried column. We already ship the tooling: `noise2Dd`/`fbm2Dd`/`erosionParamD`/`splineDeriv` (CCR-TERRAIN-007, kept after .91).
- **Class B — bounded-neighborhood** (fits with care): results depending on a FIXED-radius neighborhood of pure values. Precedent: the padded grove CA (CCR-TREE-004) and TER-7's padded slope analysis. Pure, but cost multiplies for scattered callers (trees call `blendedHeight` ad hoc), so anything here must either be cheap or folded into batch passes only if it does NOT change canonical heights.
- **Class C — global/sequential simulation** (violates purity as normally written): classic droplet hydraulic erosion and iterative thermal relaxation operate on a whole heightmap with sequential passes. Only admissible via the deterministic tile trick (§5).

## 3. Recommended core: gradient-warped ("swiss") turbulence — PROTOTYPED, WORKS

The single highest-value change. Technique (after de Carpentier's swiss turbulence): during the octave loop, accumulate the **negative analytic gradient** of the ridged octaves and offset later octave *sample positions* by it — later detail slides "downhill", which widens valleys, sharpens crests, and drags texture into dendritic drainage patterns on flanks.

Prototype (replica, real constants, mountain patch at −19600, 8800):
- **Visual**: `ov_swiss` render shows drainage-like striations flowing down the massif, eroded spurs, connected sharp crest — dramatically more "hydraulic" than `ov_cur91`, from the same underlying fields.
- **Safety**: max adjacent-column delta 6.8–8.2 for warp strength SW = 8–12 (continuity bar 30); SW = 14 spikes to 26.3 — **cap SW ≈ 10–12**.
- **Cost**: all 6 octaves via `noise2Dd` (~1.4× a plain call) ≈ +2.5 noise-equivalents/column. The accumulation is ~6 mults/octave.
- **Wiring**: entirely inside `terrainSurface` (injected — worker parity free). Gradient accumulation should be scaled by `ridgeMix` so plains/hills keep their current character exactly.
- **Knobs**: `SWISS_WARP` (drainage strength, 0 = today's look), per-octave gradient weight (whether coarse octaves steer fine ones only, or all steer all).

Implementation sketch (validated in probe):

```js
let dsx = 0, dsz = 0;
for (let i = 0; i < OCTAVES; i++) {
    const n = noise2Dd((wx + SWISS_WARP * dsx) * f + …, (wz + SWISS_WARP * dsz) * f − …);
    // … existing smooth/ridge/coherence accumulation …
    dsx += -_nd2.dx * a * ridgeMix; dsz += -_nd2.dz * a * ridgeMix;
    a *= gain; f *= 2;
}
```

Audit note on the accumulation line: `_nd2` holds the derivative w.r.t. the **scaled** coordinate (`p·f`), so the world-space chain factor `×f` and the offset's `/f` normalization cancel — the line above is EXACTLY what the validated probe ran (`dsx += -(_nd2.dx·f)·a·ridgeMix/f`). Don't "fix" it by adding an `f` factor; that changes octave weighting and was not what was validated.

## 4. The rest of the per-column menu

**4a. IQ derivative-damped octaves ("erosion fBm") — PROTOTYPED, MIXED RESULT.** `a_i *= 1 / (1 + E·|∇sum|²)` — fine octaves fade on steep accumulated slope. Probe (`p2_iq_v2`, ERODE=1.5 in scratch-gradient units — NOTE: 40 annihilates all detail, the constant is extremely scale-sensitive): technically safe (mtn max delta 3.9, plains OK) and produces smooth eroded faces with sharply incised drainage lines — but it LOSES the dendritic flank texture that makes §3 attractive, and dropping the k-coherence changes hills/plains texture globally. Current evidence does **not** support shipping it over §3 alone. Status: optional later experiment with joint gain/ERODE retuning; not part of the recommended path.

**4b. Flow-aligned gullies/rills — REJECTED (two independent prototype failures, structural cause).** Idea: carve stripe noise in a slope-aligned coordinate frame so rills run downhill. Attempt 1 (`ov_swiss_gully`, full accumulated gradient as frame): checkerboard garbage — frame direction flips at fine-octave scale. Attempt 2 (`p3_rills_v2`, the hypothesized fix — smoothed octave-0-only frame): **checkerboard again**. Root cause is structural, not a tuning issue: ANY gradient-aligned frame degenerates where the gradient magnitude passes through zero — and gradient zeros are precisely the ridges and valley floors, i.e. everywhere on a mountain at ~150-block spacing. The (across, along) mapping becomes non-affine and sweeps wildly near every extremum → adjacent columns decorrelate. A correct flow-frame needs global streamline integration (not per-column computable). Gully-scale drainage in this architecture must come from §3's swiss warp (which achieves it implicitly), §4d tributary ravines, or the §5 tile simulation. Do not re-attempt without a fundamentally different frame construction.

**4c. Crest-following peak boost (better peaks) — PROTOTYPED, WORKS.** Today's boost is radial in `hf` — high blobs become cones. Reuse octave-0's ridge factor as a crest-proximity mask so the boost follows ridgelines. Validated formula (`p1_crest` render: summit line follows the main crest, drainage texture preserved; max delta 8.1, summits 228):

```js
// capture during octave 0:  ridge0 = 1 - Math.abs(n);
const crest = 0.25 + 0.75 * smoothstep(0.55, 0.9, ridge0);
hf += (hf - 0.55) * (hf - 0.55) * PEAK_AMP * peakGate * crest;
```

Nearly zero cost (one capture + one smoothstep). Do together with §3 (Phase 1).

**4d. Tributary ravines (NEW carve stage — the river machinery does NOT reach mountains).** AUDIT FIX: the existing valley carve cannot be reused as-is — it floors at `seaLevel + 2` and its strength fades reach zero by preHeight ~93-95, i.e. it is *defined out* of mountain terrain. Tributaries need their own stage in `applyRiverCarve` (or `terrainSurface`): a second, higher-frequency `|noise|`-band field (independent seed offsets, width ~⅓ river) carving a **terrain-relative** floor (`preHeight − ravineDepth`, depth ≤ ~15, slope-faded), gated by relief recomputed from `erosionParam` (`ridgeMix` is `terrainSurface`-internal and not available in the river layer — recomputing relief costs ~3 noise). Topologically still loops, but at ravine scale inside mountains, loops read as basins/couloirs — acceptable where the .88 surface-wide worm-gullies were not. Cost ~8-12 noise/mountain column. Medium value; consider after §3+4c land; watch the notch metric (terrain-relative depth is safer than sea-level flooring here).

## 5. True hydraulic simulation — the deterministic tile design (Class C)

If analytic erosion isn't enough, real droplet erosion CAN be made architecture-legal:

- Partition the world into **erosion tiles** (e.g., 512×512 blocks at 4-block resolution → 128×128 cells) with a 32-cell apron.
- **AUDIT FIX — no circular definition**: split the surface into `rawTerrainSurface` (today's `terrainSurface`, renamed) and a new thin `terrainSurface = rawTerrainSurface + displacement`. The tile sim reads ONLY `rawTerrainSurface`; every existing consumer keeps calling the (new) outer `terrainSurface`. Written the naive way ("build tiles from terrainSurface, then terrainSurface adds tiles") the definition is circular.
- Per tile: seed a PRNG from `(tileX, tileZ, worldSeed)`, build the raw heightfield (pure), run N deterministic droplet passes (fixed order, fixed count — determinism by construction), producing a **displacement field** (eroded − raw).
- The outer surface bilinearly samples displacement with smooth cross-tile blending over the apron (each column blends ≤4 tiles → still a pure function of `(gx, gz, seed)`, just an expensive one).
- Cache tiles (LRU; 128² Float32 ≈ 65KB stored, ~147KB transient during padded build); workers compute their own (identical) tiles.

Payoff: genuine flow-accumulated drainage, alluvial fans, coherent regional erosion no analytic trick matches. Costs/risks: a new subsystem (~300–500 lines: tile cache, droplet sim, blend sampler, worker duplication of the cache); first-touch latency per tile (~128²×droplets — needs budget-slicing); 4-block resolution limits it to LANDFORM-scale erosion (fine gully texture must come from §3 — §4b is rejected); TERRAIN_GEN_VERSION churn while tuning is expensive (every knob change reshapes the world). Two additional audit-identified risks, unresolved at design level: (a) **derivative seams** — heights can blend smoothly across tile aprons while SLOPES (shading, material slope classes) still show a visible line where independently-simulated drainage patterns meet; may need gradient-continuity in the blend or generous apron overlap, unproven; (b) **droplet boundary behavior** — droplets exiting the padded region truncate their deposition, biasing erosion near tile edges even inside the apron; needs edge-discard margins. **Recommendation: defer** until the analytic package (§3/§4c) is judged insufficient — it may well not be.

## 6. Thermal erosion (talus) — where it actually fits

True thermal erosion (slopes above the repose angle shed material until stable) is iterative and neighborhood-coupled. Options here:

- **Height-changing talus relaxation** (Class B): fold a fixed-iteration talus clamp into the canonical height function — `relaxedHeight(gx,gz)` = f(raw heights over a (2k+1)² neighborhood). Pure and chunk-consistent (compute the padded grid per chunk, or the neighborhood per scattered call). Cost is the killer: k=2, 2 iterations ⇒ 25 raw surface evals per scattered call (trees' `isTreeSiteViable` would go from ~9–25 to ~225–625 evals per candidate). **Not recommended** at current perf budgets.
- **Material-level talus** (already half-built, cheap-ish): the cascade already places scree/gravel by slope class. Extending it — gravel *aprons at the FOOT of steep faces* (my column is gentle but an uphill neighbor is a cliff → debris) — touches only materials (no height purity issues). AUDIT FIX on cost: the TER-7 `heightPad` is only **1-ring** (18×18, verified `pad = chunkSize + 2`), so free detection reaches 1 block → aprons 1 block wide. Wider aprons need either (a) widening the pad (3-ring = +160 extra full `blendedHeight` evals per chunk ≈ roughly doubling per-chunk surface-eval cost — NOT recommended), or (b) **lazy reach**: only for columns whose 1-ring already shows a big uphill step, sample 2-3 further uphill neighbors on demand (rare columns → cheap). Option (b) recommended. Still the right "thermal" answer.
- Cliff-face detailing (exposed strata bands by `worldY` noise in the cascade) pairs well with this.

## 7. What NOT to do (session-validated dead ends)

- **Closed-loop gully fields** (`1−|noise|` carving on raw coords): zero-lines loop → worm-ring canyons (.88 prototype, rejected).
- **Uniform/relief-gated jitter** to break terraces: reads as speckle (pre-rewrite system, removed).
- **Slope-gated fine noise** on top of smooth slopes: reads as "messy and noisy" over residual steps (.90, user-rejected and reverted).
- **Full-strength swiss warp** (SW ≥ 14): continuity spikes (26.3 measured) — cap it.

## 8. ROADMAP — start to finish

| Phase | Contents | Status | Effort | Ships a build? |
|---|---|---|---|---|
| 0 | Baseline lock | ready | ~15 min | no |
| 1 | Swiss warp + crest-following peaks | **validated, implementation-ready** | ~1 session | yes (TGV bump) |
| 2 | Tributary ravines (drainage negative space) | design-audited, prototype-gated | ~1 session | conditional |
| 3 | Erosion materials (talus aprons, cliff strata) | design-audited | ~1 session | yes (TGV bump) |
| 4 | Assessment gate (+ optional IQ-damping retune) | — | fly-through | no |
| 5 | Tile-based droplet simulation | deferred; 3 derisk spikes required first | multi-session | only after spikes |

Global discipline for every phase: renders before edits → one knob at a time → `node tools/terrain-node-checks.mjs` (≥2 seeds) after every edit → browser suite before commit → bump `TERRAIN_GEN_VERSION` + `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` for anything terrain-shaping → stage only touched files.

### Phase 0 — Baseline lock (prerequisite, no code)
Run the harness on the current build and keep the output; capture reference probe renders (mountain patch −19600,8800; a coastal range; a foothill transition; a mid-relief hill) for A/B against every later phase. Confirm working tree is clean of unrelated churn. Record: TGV 28, build .91.

### Phase 1 — Hydraulic core (swiss warp + crest peaks) — ALL NUMBERS VALIDATED

Single `terrainSurface` edit + one const. Every ingredient prototyped this investigation (`ov_swiss`, `p1_crest`).

1. **Const**: `SWISS_WARP = 10` next to `HF_PIVOT` (~38325) + a worker bake line next to the `HF_PIVOT` emit (~19615). Hard bound in the comment: **must stay < 14** (continuity 26.3 measured at 14 vs 6.8–8.2 at 8–12; bar 30).
2. **Loop rewrite**: switch octave sampling to `noise2Dd`, init `dsx = 0, dsz = 0, ridge0 = 0`; sample at `(wx + SWISS_WARP * dsx) * f + …`; capture `ridge0 = 1 - Math.abs(n)` when `i === 0`; after the coherence accumulation add `dsx += -_nd2.dx * a * ridgeMix; dsz += -_nd2.dz * a * ridgeMix;` (chain factors cancel — see §3 audit note; do NOT add an `f`).
3. **Peak block**: multiply the existing boost by `crest = 0.25 + 0.75 * smoothstep(0.55, 0.9, ridge0)` (§4c, validated).
4. **Parity**: all touched code is injected; `noise2Dd`/`_nd2` already exist in both scopes (audit-verified lines in the header). No new hand-maintained items.
5. **Byte-identity note**: `noise2Dd` = same field, different op order → plains change by float-epsilon even at zero warp. Expected; covered by the TGV bump; don't chase it.
6. **Validate**: harness T1–T3/T5 green on ≥2 seeds; T4 notch (deep swiss valleys are the one risk — if the browser notch test trips, first lower `SWISS_WARP` to 8, then raise `NOTCH_LIFT`); browser suite for worker byte-parity; in-game checklist: dendritic texture on flanks, connected crest summits, foothill belt intact, plains/hills unchanged in character.
7. **Tuning order** (only after tests green): `SWISS_WARP` 8→12 by eye → crest floor (the 0.25) 0.15–0.4 → stop.
8. **Rollback**: `SWISS_WARP = 0` + drop the `crest` factor ≈ exact .91 character.

**Exit criteria**: tests green + user approves mountains in-game. If mountains are now satisfactory overall, jump to Phase 3 (materials) and skip Phase 2.

### Phase 2 — Tributary ravines (conditional; prototype gate MANDATORY)

**Entry condition**: after Phase 1, mid-scale discrete ravines/couloirs are still missed (swiss provides drainage *texture*; this adds drainage *landforms*).

**Site decision (supersedes §4d's river-layer framing)**: implement inside `terrainSurface`, after assembly — `ridgeMix` and the warped `wx/wz` are in scope there (no relief recompute needed), and terrain-relative depth is trivial: `h -= ravineCut * amplitudeScale`. The river layer stays waterline-only.

**Prototype protocol (required, no game edits until passed)**: extend the Node probe with an independent `|noise|` band field (freq ≈ 0.003 on warped coords — ~3× the river field, half-width ~0.02), cut `= smoothstep(band) * RAVINE_DEPTH * smoothstep(0.3, 0.6, ridgeMix)`, `RAVINE_DEPTH ≤ 10` blocks. **Acceptance**: renders read as couloirs/basins (loops acceptable at this scale — explicitly re-judge, this is the .88 failure mode's scale-cousin); max adjacent delta < 15; notch metric 0; foothill/hill zones untouched.

**Implementation** (only after acceptance): 2 consts (`RAVINE_DEPTH`, `RAVINE_WIDTH`) + bake lines; ~6 lines in `terrainSurface`; cost ~2 noise calls on `ridgeMix > 0.3` columns. Validate + bump per global discipline.

### Phase 3 — Erosion materials (height-neutral, safe any time after Phase 1)

**3a. Talus aprons** (the thermal-erosion answer, §6): in `generateTerrainPass`'s cascade — column is gentle (`!isSteep`) but its 1-ring shows an uphill step ≥ 5 (from existing `heightPad`) → apron candidate; extend reach lazily (sample `blendedHeight` at 2–3 further offsets along the max-step direction only for candidates) → place GRAVEL/STONE dithered by `screeNoise`.
**LOCKSTEP (critical)**: aprons are a new flat-ground non-soil outcome → `isTreeSoilSurface` MUST mirror the apron rule (same neighbor sampling; costs +3–4 `blendedHeight` per tree candidate — acceptable) or trees will plant on gravel. Update the lockstep comments at BOTH sites.
**3b. Cliff strata**: on `isCliff` columns, band STONE/GRAVEL by `(worldY + low-freq noise)` stripes — pure cosmetics, ~1 noise per cliff column.
**3c (optional)**: scree in Phase-2 ravine floors — requires recomputing the ravine band in the cascade (~2 noise); skip unless 2 shipped.

**Validate**: heights unchanged by construction — harness output must be IDENTICAL to Phase-1/2 baseline (that's the regression test); texture suite unaffected; in-game: debris at cliff feet, banded rock faces, no trees on aprons.

### Phase 4 — Assessment gate (no code)
Fly-through against the original goals: erosion look ✓? gullies/ravines ✓? valleys ✓? ridges ✓? peaks ✓? Three outcomes: **(a) satisfied** → close this plan, done. **(b) texture wrong** → revisit §4a IQ damping as a *joint* gain/ERODE retune experiment (probe first; current evidence says it over-smooths — demand a render that beats Phase 1 before shipping). **(c) regional drainage realism demanded** → Phase 5.

### Phase 5 — Tile-based droplet simulation (research project; only via Phase 4c)

**Derisk spikes first — all in Node, zero game edits, ~1 session total:**
- **S1 (quality)**: droplet-erode a 128² @ 4-block-res raw heightfield; does it read as drainage at voxel scale, or is 4-block res too coarse to matter? If unconvincing → stop, plan closed.
- **S2 (seams)**: simulate two adjacent tiles independently + apron-blend; render heights AND hillshade. The audit-flagged risk: heights blend smoothly while *derivatives* (shading/material slope classes) show a wall. Quantify; if visible, test wider aprons / gradient-blended displacement before proceeding.
- **S3 (perf)**: time a tile build (target: budget-sliceable under `TIME_SLICE_MS` chunks; ~1M ops expected).

**Implementation (only if S1–S3 pass)**: rename `terrainSurface` → `rawTerrainSurface`; new thin `terrainSurface = raw + sampleDisplacement(gx, gz)`; `ErosionTileCache` (LRU ≈ 32 tiles ≈ 2MB; seeded per `(tileX, tileZ, worldSeed)`; droplets discard deposition within an edge margin — audit risk (b)); duplicate cache in the worker (hand-maintained — add to the CLAUDE.md parity checklist); budget-sliced tile builds; extend the browser suite with a main-vs-worker tile byte-parity test and the harness with displacement determinism. Expect several TGV bumps while tuning — batch tuning in the probe first to minimize them.

**Definition of done for the overhaul**: Phase 4 outcome (a) — user-approved mountains with tests green — regardless of how many optional phases were used to get there.

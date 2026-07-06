# VoxEx — Terrain Generation Improvement Opportunities

**Scope:** Findings from a read-only investigation of the terrain-generation pipeline in `voxEx.html`. No code was changed. Each item records **where** it is, **what** the issue is, **why** it matters, and **how** it could be fixed.

**Reference build:** `VOXEX_BUILD = "2026-06-30.75"` (voxEx.html:4243). Line numbers below point at the **main-thread single-source** functions. Per the worker-parity rule in `CLAUDE.md`, most of these are auto-injected into the chunk worker by `buildChunkWorkerCode()` between the `__TERRAIN_FUNCS_*` / `__TREE_FUNCS_*` markers — fixes go in the main-thread source only, and `WorldPreviewRenderer` + `tools/terrain-visualizer.html` must be kept in sync.

**Pipeline recap (top → bottom):** `continentalHeight` → biome selection (`getRawBiomeParams` / `isMountainRegion`) → per-biome height funcs (`HEIGHT_FUNCS`) → 4-corner bilinear blend (`sampleBiomeBilinearHeight`) → oceans/rivers carve (`blendedHeight`) → surface-material pass (`generateTerrainPass`) → caves → decorations/trees → lighting.

## Priority summary

| # | Finding | Area | Impact | Effort |
|---|---------|------|--------|--------|
| 1 | Biome selection is 1-dimensional (single noise scalar) | Biome placement | High | Medium |
| 2 | Mountains are a separate binary region mask, decoupled from biome/height | Biome + height seam | High | Medium |
| 3 | `mountainsHeightFunc` is an over-layered stack fighting its own high-freq detail | Mountain shape | High | Medium–High |
| 4 | Rivers are a noise ribbon with terrain-awareness disabled (+ stale doc claim) | Hydrology | Medium–High | High |
| 5 | Surface material is a fixed elevation ladder, not climate-driven | Surface variety | Medium | Medium |
| 6 | Biome-height blend can ramp linearly where amplitudes mismatch | Blending | Medium | Medium |
| 7 | Uniform soil depth everywhere (always 3 dirt then stone) | Surface detail | Low | Low |
| 8 | No erosion model — "erosion" is additive noise only | Realism | Medium | High |
| 9 | No ore / underground variety (subsurface is 100% stone) | Content gap | Low–Medium | Low |

---

## 1. Biome selection is 1-dimensional

**Location:** `getRawBiomeParams` (voxEx.html:37981), `uniformBiomeRoll` (37952), `_BIOME_CDF_TABLE` (37944). Weighted table built in `biomeTable` (see 37743 / worker copy at 19604).

**Issue:** A single `noise2D` sample is mapped through one empirical CDF (`uniformBiomeRoll`) into a cumulative-weight scan to pick the biome. Biome identity is a function of exactly **one scalar** — there is no temperature, humidity, or elevation input.

**Why it's an issue:** Because selection is 1-D, biomes are laid out as **bands along a single noise axis**, and adjacency is fixed by the order of the cumulative-weight table. Two biomes that are far apart in the table can only meet by crossing every biome band in between (e.g. plains can't directly border longwoods). The result reads as repetitive/gradient-like rather than a natural patchwork, and there's no way to express "cold biomes cluster together" or "deserts are hot + dry."

**How to fix:** Move to a 2-D climate lookup. Sample two decorrelated low-frequency fields — temperature and humidity — and select the biome from a Whittaker-style 2-D table (optionally add elevation/continentalness as a third axis). This gives natural adjacency, lets you place biomes intentionally in climate space, and produces a temperature signal that items 3 and 5 can reuse. Keep the existing weight field as a tie-breaker/rarity control. Worker parity: `getRawBiomeParams` is already in the injection list, so only the main-thread version + the two mirrors change.

## 2. Mountains are a separate binary region mask, decoupled from biome + height

**Location:** `isMountainRegion` (voxEx.html:37973) + `MOUNTAIN_REGION_THRESHOLD = 0.28` (37972); foothill conversion in `getBiomeCellDirect` with `MAX_FOOTHILL_RINGS = 1` (37873); height is blended separately on a 64-block grid in `sampleBiomeBilinearHeight` (38007).

**Issue:** Mountains bypass the weighted biome roll entirely — `getRawBiomeParams` returns `mountains` whenever `isMountainRegion` hard-thresholds a single warped noise field above `0.28`. So "mountain or not" is a boolean, while the *height* comes from an independent bilinear grid. Two different mechanisms decide identity vs. elevation.

**Why it's an issue:** The boolean gate is brittle — the in-code comments show `MOUNTAIN_REGION_THRESHOLD` has already been re-tuned (0.34 → 0.28) just to keep coverage in range after a noise change. With only **one** foothill ring, a full-amplitude mountain cell can transition to lowland across a single 64-block cell, producing abrupt bases. And because identity (mask) and height (grid) are decoupled, a tall mountain cell can land next to a plains cell with no shared shaping.

**How it could be fixed:** Replace the boolean gate with a **continuous "mountain-ness" weight** derived from the same continentalness/elevation continuum, and drive both biome tagging and height amplitude from that single field. Alternatively (smaller change): widen the foothill transition to 3–4 rings with a smooth `ringFactor` decay so the base tapers over ~200 blocks instead of ~64. Either way the goal is to remove the identity-vs-height seam so mountains grow out of the terrain rather than being stamped onto it.

## 3. `mountainsHeightFunc` is an over-layered stack fighting its own detail

**Location:** `mountainsHeightFunc` (voxEx.html:38190) and the post-blend jagged block in `blendedHeight` (38047–38061).

**Issue:** This is a 13-stage hand-tuned pipeline: 6-octave ridged noise, peak amplification, jagged micro-ridges, valley carve, saddles, peak-type variation, cliff bands, 3-octave erosion, gullies, ridge connection, then regional + amplitude scaling. Several stages are high-frequency raw-coordinate noise (jagged at freq 0.08/0.18, erosion at 0.08/0.15/0.25).

**Why it's an issue:** The change-log constants document a running battle against axis-aligned "corduroy" choppiness: `POST_JAGGED_SCALE` 0.65→0.40, jagged detail halved, erosion cut ~half, `MOUNTAIN_RELIEF_SCALE 0.90`. The high-frequency detail layers *are* the choppiness source, so each new tuning pass just scales the symptom down. The function is also the hardest section to reason about or extend, and its many `Math.pow`/`Math.abs(noise)` terms make behavior at borders non-obvious.

**How it could be fixed:** Rewrite around a single well-behaved **ridged-multifractal** (proper `1 - |noise|` octaves with frequency/gain that stays band-limited to the block grid), plus **one** domain-warp pass for winding ridgelines, and fold "erosion" into a slope-aware post-pass (see item 8) instead of additive high-frequency noise. Fewer octaves at controlled frequencies will remove the corduroy without needing the growing pile of scale-down constants. Validate with `tools/terrain-visualizer.html` cross-sections and the mean-step check.

## 4. Rivers are a noise ribbon with terrain-awareness disabled

**Location:** `getRiverFactor` (voxEx.html:38467); penalties zeroed at `slopePenalty = 0` / `heightPenalty` (38521); canyon/tunnel machinery in `blendedHeight` (~38096) and `generateTerrainPass` river-tunnel block (~39283). Legacy flag `usePathBasedRivers = false` (22048).

**Issue:** The river path is a `Math.abs(noise)` ribbon; the slope and height penalties that used to make rivers follow terrain are hardcoded to `0`. Rivers therefore ignore the actual heightfield and get carved wherever the river noise crosses zero — including straight through mountains, which is why the covered-tunnel system exists to punch a tube through high terrain.

**Why it's an issue:** Rivers don't follow drainage, so they don't collect into valleys, don't flow consistently downhill, and require significant special-case code (canyon-vs-tunnel blending, delta fingers) to look plausible. It's a lot of machinery compensating for a path that isn't terrain-aware. **Doc divergence:** `CLAUDE.md` describes "gradient-descent tracing" rivers and a `RiverNetworkCache` — neither exists in the current code (`RiverNetworkCache` has zero references; the "Phase 2" path-based rivers are disabled). The docs describe an implementation that never landed.

**How it could be fixed:** Re-enable terrain awareness at minimum — restore a downhill/slope bias so channels prefer valleys and low elevations, which would shrink the tunnel special-casing. For a fuller fix, implement the intended flow-based rivers (accumulate flow downhill from `getPreRiverHeight`, carve where accumulation is high) and cache per region as the docs already anticipate. Separately, update `CLAUDE.md`'s River System section to match the live noise-ribbon implementation so future work isn't misled.

## 5. Surface material is a fixed elevation ladder, not climate-driven

**Location:** `generateTerrainPass` (voxEx.html:38964); elevation thresholds `SNOW_LINE = 190`, `SNOW_PATCHES_LINE = 160`, `HIGH_ROCK_LINE`, `ROCK_LINE`, `ALPINE_LINE`, etc. (38973+).

**Issue:** Snow, rock, scree, and meadow are selected purely by **absolute world height** plus slope/aspect noise. There's no temperature input, so the snow line is a global constant regardless of location.

**Why it's an issue:** Every world has snow at exactly the same altitude and never below it — no snowy lowlands, no warm high plateaus, no desert/sand palette, no latitudinal variety. The palette is a hardcoded ladder, which makes biome character depend almost entirely on tree type rather than ground cover.

**How it could be fixed:** Feed a temperature field (ideally the same one added for item 1) into the surface pass so the snow line and palette shift with climate: cold regions get snow/gravel at low elevation, hot regions push rock/sand higher, temperate regions keep today's behavior. Optionally add a `snowLine`/`palette` field to `BIOME_CONFIG` (the `BIOME_DEFAULTS` comment at 5341 already lists `snowLine` as intended future extensibility).

## 6. Biome-height blend can ramp linearly where amplitudes mismatch

**Location:** `sampleBiomeBilinearHeight` (voxEx.html:38007) → `getBiomeHeightAtCell` (38113); 2×2 corner sample with smoothstep weights.

**Issue:** Height at a point is a bilinear blend of 4 biome cells over a 64-block grid. When neighboring cells have very different amplitudes (plains `amplitude: 8` vs mountains `amplitude: 180`, from `BIOME_CONFIG` at 5160), the blend between them is a smooth but essentially **linear ramp** across the cell.

**Why it's an issue:** Large amplitude jumps across a single 64-block cell can read as an unnaturally even slope connecting a flat biome to a tall one, and only 2×2 interpolation limits how organic the border can look. Combined with item 2 (mountains chosen by a separate mask), a border cell can carry a big height delta the blend has to smear.

**How it could be fixed:** Blend in an amplitude-aware way — e.g. weight toward the lower-amplitude biome near borders, or interpolate a "relief" term separately from base height so the transition curves rather than ramps. A wider kernel (3×3 with distance weighting) or an extra low-frequency warp on the sample point would also break up the straight ramps. Keep it cheap; this is in the per-column hot path.

## 7. Uniform soil depth everywhere

**Location:** Subsurface block selection in `generateTerrainPass`, `else if (depth < 4)` branch (voxEx.html:39243).

**Issue:** For non-mountain terrain, every column is surface block, then exactly 3 blocks of `DIRT`, then `STONE`. The dirt depth is a constant.

**Why it's an issue:** It's a minor but pervasive uniformity — cliff faces, cut-throughs, and cave walls all show the same crisp 3-dirt band worldwide, which looks synthetic.

**How it could be fixed:** Vary dirt depth by biome and/or a low-frequency noise sample (e.g. 2–6 blocks), and optionally thin it on slopes (partially done for `isSteep`). A single extra `noise2D` lookup per column is enough; add an optional `soilDepth` field to `BIOME_CONFIG`.

## 8. No erosion model — "erosion" is additive noise only

**Location:** Erosion terms inside `mountainsHeightFunc` (voxEx.html:38294+), talus/scree handled cosmetically in `generateTerrainPass` (~39134).

**Issue:** What the code calls "erosion" is additive high-frequency noise, not material transport. There's no simulation of water carving or gravity moving material downslope.

**Why it's an issue:** Without transport you don't get the features that make mountains read as real — talus fans at the base of cliffs, sediment filling valley floors, smoothed vs. sharp ridge variation from actual weathering. It also means slope-limited stability is never enforced, so surfaces can be steeper than material would naturally hold.

**How it could be fixed:** Add a cheap **thermal (slope-limited) erosion** post-pass on the per-chunk heightfield before the surface pass: where the slope to a neighbor exceeds a talus angle, move a little material downhill. Even a few iterations noticeably improves realism and would let item 3 drop most of its additive-noise "erosion" layers. Hydraulic erosion is the fuller version but is heavier and harder to keep deterministic/worker-parallel — thermal is the high-value, low-cost first step.

## 9. No ore / underground variety

**Location:** Deep-rock `else` branch of `generateTerrainPass` (voxEx.html:39262–39263, `id = STONE`). There is no ore/vein generation pass anywhere in the pipeline.

**Issue:** Everything below the soil layer is `STONE` (plus air where caves carve). No coal/iron/mineral distribution exists.

**Why it's an issue:** Not a terrain-*shape* problem, but a clear content gap — underground exploration has no visual or gameplay variety, and it's the natural companion to the existing cave system.

**How it could be fixed:** Add an ore pass after cave carving that seeds veins via 3-D noise thresholds or seeded blob placement, gated by depth bands (different ores at different `worldY`). Requires new block IDs + atlas tiles (bump `NUM_TILES`) and the lookup-table updates described in `CLAUDE.md`'s "adding blocks" checklist. Small, self-contained, and worker-compatible.

---

## Notes on making any of these changes

- **Worker parity is mandatory.** Edit only the main-thread sources listed above; `buildChunkWorkerCode()` regenerates the worker copy. Keep the `__TERRAIN_FUNCS_*` / `__TREE_FUNCS_*` markers intact.
- **Two mirrors must stay in sync:** `WorldPreviewRenderer` (create-world preview) and `tools/terrain-visualizer.html` reimplement the terrain math. Terrain changes need matching edits there or the preview/debugger will diverge.
- **Regression coverage:** `tools/voxex-tests.html` (~204 tests, served over localhost) includes worker `blendedHeight` byte-parity and determinism checks — run it after any terrain edit.
- **Determinism:** all noise must stay a pure function of `(gx, gz, seed)`; the erosion post-pass (item 8) must be computed identically regardless of chunk load order.

# CCR-WORLDGEN-TUNABLES-001: Every gen constant editable (value plumbing only) + editor preview redesign

> **Status: IMPLEMENTED** (2026-07-11, build 2026-07-11.2) — pending: browser-suite run on a real machine + in-browser editor eyeball (see As-built). Move to `Finished/` after those pass.
> **ID**: VOXEX-CCR-WORLDGEN-TUNABLES-001 · **Build baseline**: 2026-07-11.1 · **Author**: Claude (requested by Kandler, 2026-07-11)
> **Prerequisite**: CCR-WORLDGEN-UI-001 (IMPLEMENTED — schema-driven UIs, seam-delegating editor)

## Problem / Why

1. **The editor exposes 13 params; the terrain's real character lives in ~35 module constants.** Kandler's goal is to dial in what the DEFAULT world-gen settings should be, with freedom to change anything. The old (pre-CCR-WORLDGEN-UI-001) editor *appeared* to offer river/cave/noise dials, but they parameterized a replica model and never affected the game — honest delegation removed them without replacing them with the real dials. The real dials are module-scope consts: fractal shape (`RELIEF_AMPLITUDE`, `PEAK_AMP`, `NOTCH_LIFT`, `OCTAVES`, `BASE_GAIN`, `GAIN_BY_RELIEF`, `WARP_FREQ/BASE/BY_RELIEF`, `HF_PIVOT`, `VALLEY_RATIO`, `SWISS_WARP`, `FRACT_FREQ0`), the two spline tables (`SPLINE_CONTINENTAL`, `SPLINE_EROSION`), climate-field params (`BIOME_PARAMS`, `AXIS_W`, `FIELD_GAIN`), and the full river/ocean family (`RIVER_BASE_WIDTH`, `OCEAN_THRESHOLD_DEEP/SHALLOW`, `OCEAN_WARP_*` ×4, `RIVER_WARP_*` ×4, plus `getRiverDepth`'s internal depths). All of these are ALREADY serialized into the worker at pool creation (grep `OCEAN_THRESHOLD_DEEP = ' + JSON.stringify` in `buildChunkWorkerCode`) — the plumbing is half-done.

2. **The editor's Heightmap view renders the WRONG height.** It renders raw `terrainSurface` — the PRE-CARVE base surface. River/ocean carving is a separate pass (`getPreRiverHeight` = surface + ocean carve at grep `function getPreRiverHeight`; `applyRiverCarve` on top of that; `blendedHeight` composes the final carved height and is what the in-game create-world preview renders — grep `render() now delegates to blendedHeight`). Result: rivers are invisible in Heightmap, and Combined papers over it with a factor overlay instead of real carved depths. The views are "accurate" only for the pre-carve surface — misleading as "the terrain you'll get."

3. **Biome selection not changing the heightmap is CORRECT behavior, documented here to kill the confusion.** Under `useNewTerrain: true`, height and biome are BOTH derived from the shared climate fields (temperature/humidity/continentalness/erosion/peaks-valleys); `resolveBiome`'s `forceSingleBiome` short-circuit changes biome identity (materials/trees/fog) but never feeds back into `terrainSurface`. The "height derived from biomes" mental model describes the LEGACY path only. Making forced biomes also *shape* terrain is possible (bias the climate fields toward the biome's `BIOME_PARAMS` centroid) but is a TERRAIN-GEN CHANGE — explicitly OUT OF SCOPE here (owner constraint: "don't change the terrain gen methods"); see Deferred items.

## Approach

**Value plumbing only — zero algorithm changes.** A `GEN_TUNABLES` registry whose defaults ARE the current constant values; every listed const's read sites switch to reading the registry; the worker emission block switches from serializing the const to serializing the live registry value (the CCR-WORLDGEN-UI-001 #11 seaLevel bake is the exact template). Same expressions, same defaults ⇒ byte-identical output at defaults (gated by `terrain-node-checks` on ≥3 seeds). The editor grows an "Advanced Tunables" area built from a `GEN_TUNABLE_SCHEMA` (same row machinery as `GEN_PARAM_SCHEMA`, marked `ui: 'editor-only'` — the create-world panel does NOT show tunables). Preview modes are rebuilt around the FINAL carved height (`blendedHeight`).

**The persistence design insight (RESOLVED: Option A ships in this CCR, Option B deferred — owner 2026-07-11):** if a tunable can affect a CREATED world, it MUST persist per-world — otherwise a reload regenerates new chunks with baked defaults and they seam/cliff against cached chunks (the exact failure mode `TERRAIN_GEN_VERSION` exists to prevent). So there are only two coherent designs:
- **Option A — dialing instrument (recommended for v1):** tunables live ONLY in the editor session (localStorage-autosaved, JSON export/import). They never flow into world creation. The workflow for changing defaults: dial in the editor → export → hand the values to a "bake new defaults" commit that edits `GEN_TUNABLES`' default values (THAT commit bumps `TERRAIN_GEN_VERSION`). Zero save-format risk; matches the stated goal (finding the right defaults).
- **Option B — per-world tunables (genParams v4):** `savePacket.genParams` gains a `tunables` block (only non-default values stored), applied in `applyGenParams`, baked to the worker per-world. Full freedom (every world can differ), but: v4 format migration, a bigger worker-bake surface, and the create-world UI needs at least an import path for tunables. Can be layered on later without redoing Option A's work.

**Rejected:** exposing tunables by editing constants through the seam ad hoc (no registry) — no single source, no export/import, no defaults story. Re-adding replica knobs that don't map to real code — the exact disease CCR-WORLDGEN-UI-001 cured; never again.

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry (always).
- `TERRAIN_GEN_VERSION`: **no bump for this CCR** — plumbing is value-identical at defaults (prove with `terrain-node-checks`, ≥3 seeds, before/after identical). The FUTURE "bake new defaults" commits that change registry defaults each bump it. Under Option B, creating a world with custom tunables does NOT need a bump (per-world params, like seaLevel today).
- `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION`: **no**.

## Phasing

- **Phase A** — `GEN_TUNABLES` registry + const-read rerouting + worker emission switch (#1–#3).
- **Phase B** — `GEN_TUNABLE_SCHEMA` + seam exports + editor "Advanced Tunables" panel + export/import (#4–#5).
- **Phase C** — preview redesign: Heightmap / Biomes / Map / Combined on carved heights (#6).
- **Phase D** — cave tunables (needs extraction from a HAND-MAINTAINED worker pair — see #7; can slip to a follow-up if it fights back).
- **Deferred (own CCRs, listed in #8):** per-biome overrides; forced-biome-shapes-terrain; spline curve UI; Option B persistence.

## Changes

### #1 — `GEN_TUNABLES` registry

**Location:** add beside the ocean/river constants block, grep `OCEAN & RIVER TUNING CONSTANTS` in `voxEx.html`
**Why:** one mutable, single-source home for every tunable; defaults = today's constants.

**Sketch:**
```js
/** Live world-gen tunables. Defaults ARE the shipped constants — editing a value here
 *  (or via applyGenTunables) changes generation; the worker bakes these at pool creation.
 *  CCR-WORLDGEN-TUNABLES-001: value plumbing only — the formulas that consume these are unchanged. */
const GEN_TUNABLES = {
    // fractal shape (grep each name near `function terrainSurface`)
    RELIEF_AMPLITUDE: <current>, PEAK_AMP: <current>, NOTCH_LIFT: <current>,
    OCTAVES: <current>, BASE_GAIN: <current>, GAIN_BY_RELIEF: <current>,
    WARP_FREQ: <current>, WARP_BASE: <current>, WARP_BY_RELIEF: <current>,
    HF_PIVOT: <current>, VALLEY_RATIO: <current>, SWISS_WARP: <current>, FRACT_FREQ0: <current>,
    // climate fields
    FIELD_GAIN: <current>,
    AXIS_W: { ...current }, BIOME_PARAMS: <deep copy of current>,
    // splines (control-point arrays)
    SPLINE_CONTINENTAL: <deep copy>, SPLINE_EROSION: <deep copy>,
    // ocean / rivers
    OCEAN_THRESHOLD_DEEP: <current>, OCEAN_THRESHOLD_SHALLOW: <current>,
    RIVER_BASE_WIDTH: <current>,
    OCEAN_WARP_FREQ: <current>, OCEAN_WARP_AMP: <current>, OCEAN_WARP_VAR_FREQ: <current>, OCEAN_WARP_VAR_STRENGTH: <current>,
    RIVER_WARP_FREQ: <current>, RIVER_WARP_AMP: <current>, RIVER_WARP_VAR_FREQ: <current>, RIVER_WARP_VAR_STRENGTH: <current>,
    RIVER_DEPTH_SCALE: 1.0, OCEAN_DEPTH_SCALE: 1.0   // NEW multiplier-style knobs (see AUDIT NOTE)
};
const GEN_TUNABLE_DEFAULTS = Object.freeze(JSON.parse(JSON.stringify(GEN_TUNABLES)));
```

**Implementation rule for read-site rerouting:** the existing `const NAME = value;` declarations become `const NAME = GEN_TUNABLES.NAME;`? **NO — AUDIT FLAG:** that would freeze the value at boot. Two acceptable patterns, chosen per const by hot-path status: (a) for consts read inside per-column hot loops (`terrainSurface`'s family), keep local `let` aliases that `applyGenTunables()` refreshes (one assignment per tunable in a single `syncGenTunableAliases()` function) — preserves current property-lookup-free hot-path performance; (b) for cool paths (river/ocean factor functions are per-column but already do FBM work that dwarfs a property read), read `GEN_TUNABLES.NAME` directly. The implementer measures nothing here — default to (a) for everything `terrainSurface` touches, (b) elsewhere, and note the split in as-built.

**AUDIT NOTE (`RIVER_DEPTH_SCALE`/`OCEAN_DEPTH_SCALE`):** `getRiverDepth`/`getOceanDepth` have internal literal depths tuned against the carve fades (agent-notes §4: fades must reach zero before the width cutoff — the cliff-ring lesson). Rather than exposing every internal literal, add ONE output multiplier each (`return depth * GEN_TUNABLES.RIVER_DEPTH_SCALE;`), default 1.0 — byte-identical at default, and the soft-warn range keeps users near tested territory. This is the ONLY shape of change allowed inside those functions.

**AUDIT NOTE (`BIOME_PARAMS`/`AXIS_W`/splines as objects):** these are consumed by reference in `resolveBiome`/`terrainSurface`. Registry holds the live objects; `applyGenTunables` mutates them IN PLACE (or reassigns and re-syncs aliases) so every reader sees updates. Editing `BIOME_PARAMS` centroids changes where biomes LAND, not terrain shape — label it so in the editor.

**Verify:** `terrain-node-checks` on ≥3 seeds — output byte-identical to pre-CCR at defaults; grep confirms zero remaining bare reads of each converted const outside the registry/alias-sync.

### #2 — Worker emission block reads the registry

**Location:** grep `RELIEF_AMPLITUDE = ' + JSON.stringify` in `buildChunkWorkerCode` (and the ocean/river emission lines below it)
**Why:** the worker must bake the LIVE values, not the (now-registry-backed) boot values.

**Sketch:** each `JSON.stringify(NAME)` becomes `JSON.stringify(GEN_TUNABLES.NAME)`; `SPLINE_*`/`BIOME_PARAMS`/`AXIS_W` lines likewise (they already serialize objects). The worker-side code is UNCHANGED — it still receives plain consts. Editor/tuning sessions that change tunables must rebuild the pool (`rebuildChunkWorkerPoolForActiveWorld()`) — but note the editor iframe never creates a pool (`?test=1` is inert), so for the editor this is moot; it matters only under Option B.

**Verify:** browser-suite string test (pattern of CCR-WORLDGEN-UI-001's #11 test): set `RELIEF_AMPLITUDE` to a sentinel via `applyGenTunables`, `buildChunkWorkerCode()` contains the sentinel, restore.

### #3 — `applyGenTunables` / `resetGenTunables`

**Location:** beside `applyGenParams` (grep `function applyGenParams`)
**Why:** single mutation path: validates keys against the registry, writes values, re-syncs hot-path aliases, clears terrain-dependent caches (`biomeCellCache`, tree caches — same list `applyGenParams` clears).

**Sketch:** `applyGenTunables(partial)` merges KNOWN keys only (unknown → logWarn + skip); `resetGenTunables()` deep-restores from `GEN_TUNABLE_DEFAULTS`. Both seam-exported. **AUDIT NOTE:** unlike `applyGenParams`, a PARTIAL object here must NOT reset omitted keys (tunables are a big sparse surface; the editor sends deltas) — document the asymmetry at both functions.

**Verify:** seam round-trip test: apply sentinel → `terrainSurface` output changes at a sample point → `resetGenTunables()` → output byte-equal to pre-apply.

### #4 — `GEN_TUNABLE_SCHEMA` + seam exports

**Location:** below `GEN_PARAM_SCHEMA` (grep `const GEN_PARAM_SCHEMA`)
**Why:** the editor builds its Advanced Tunables panel from a schema, same machinery as gen params.

**Sketch:** one entry per scalar tunable: `{ key, label, section, kind: 'number', tested: [lo, hi], format, note? }`, sections like "Relief & Peaks", "Fractal Detail", "Domain Warp", "Climate Fields", "Oceans", "Rivers", "Splines". `tested` ranges come from the mountain-overhaul probe history where known (`SWISS_WARP` note: HARD bound < 14 — this is the ONE tunable where the soft warn becomes a hard cap, documented owner-approved exception, enforced in `applyGenTunables`). Splines + `BIOME_PARAMS` + `AXIS_W` get `kind: 'json'` — rendered as a validated JSON textarea in v1 (curve UI deferred). Seam export: `GEN_TUNABLES, GEN_TUNABLE_DEFAULTS, GEN_TUNABLE_SCHEMA, applyGenTunables, resetGenTunables`.

**Verify:** schema↔registry key-parity browser test (every scalar registry key has a schema row; every schema key exists in the registry).

### #5 — Editor: Advanced Tunables panel + export/import

**Location:** `tools/terrain-parameter-editor.html`, params panel builder (grep `buildParamsPanel`)
**Why:** the actual dialing surface.

**Sketch:** below the existing genparam sections, an "Advanced Tunables" group of collapsed sections built from `VX.GEN_TUNABLE_SCHEMA` — same free-text/soft-warn rows (reuse `VX.parseGenParamInput`-style semantics; tunables are raw values, no percent format unless the schema says so). `kind: 'json'` rows: textarea + Apply button + parse-error display. A "Reset tunables" button calls `resetGenTunables` + refresh. Every change → `applyGenTunables(delta)` → re-render preview. Export gains a second block: the JSON becomes `{ genParams: {...}, tunables: {...only non-default keys...} }` (import accepts both this and the bare-genParams v3 shape for backward compat with CCR-WORLDGEN-UI-001 exports). Autosave includes tunables. **Under Option A the create-world import IGNORES a `tunables` block with a visible note** ("tunables are editor-only — bake them as defaults to use in worlds"); revisit under Option B.

**Verify:** dial `RELIEF_AMPLITUDE` down → preview flattens live; export → reload editor → import → identical preview; reset restores the stock look.

### #6 — Preview redesign (four views, carved heights)

**Location:** `tools/terrain-parameter-editor.html`, `PreviewRenderer` (grep `class PreviewRenderer`)
**Why:** current Heightmap is pre-carve (no rivers — problem 2); views should answer "what will this world look like."

- **Heightmap** — PURE elevation of the FINAL carved height (`VX.blendedHeight(gx, gz, VX.worldSeed)` — already seam-exported), hypsometric ramp (deep blue → cyan → green → tan → brown → white), NO water rendering, optional sea-level contour line. A "Base surface (pre-carve)" checkbox swaps in `VX.terrainSurface` for shape-tuning without carve interference — labeled explicitly so the two are never confused again.
- **Biomes** — flat `resolveBiome` colors only (unchanged behavior, simplified rendering).
- **Map** (NEW) — top-down "what it looks like": carved height + hillshade (light from NW, slope-shaded — same idea as `terrain-probe`'s hillshade), WATER fill wherever carved height < `seaLevel` (oceans, rivers, lakes all emerge from the real carved data — no factor overlays), beach sand within a couple blocks above water adjacency, snow above the treeline band, biome-tinted land. **AUDIT NOTE:** the land-material coloring is a DOCUMENTED APPROXIMATION (the real per-column material cascade lives inline in `generateTerrainPass`, not on the seam — same honesty note `terrain-visualizer.html` carries); heights and water are REAL.
- **Combined** — Map + stronger biome tint overlay; KEEPING it (owner decision 2026-07-11) — four views ship.

Cursor info gains carved height + pre-carve height side by side. **Performance note:** `blendedHeight` per pixel is heavier than `terrainSurface` (ocean+river factors per sample) — keep the quality selector, default 512, and debounce as today; if 1024 is painful, render progressive rows (nice-to-have, not required).

**Verify:** rivers visible in Heightmap (as carved valleys) and Map (as water); Map's waterline matches an actual created world's shoreline at the same seed (spot check 2–3 coordinates in-game); Biomes view unchanged from today.

### #7 — Phase D: cave tunables (extraction required — may split off)

**Location:** grep `caveScale = 0.02` — NOTE it sits in a HAND-MAINTAINED pair: the cave-cache code exists in the worker template (~19600) AND main-thread `precalculateTerrainCaches` is itself hand-copied per the Lockstep Registry.
**Why:** cave shape (scale, threshold, Y-band, lava level) is the one old-editor knob family with real game analogs that are still inline literals.

**Sketch:** lift the inline cave literals into `GEN_TUNABLES` on the MAIN side; the worker gets them via the existing per-generate `worldGenSettings` message (where `caveDensityMultiplier` already travels — grep `worldGenSettings: window.worldGenSettings`) rather than by editing the hand-maintained template copy's structure. **AUDIT FLAG:** touching the hand-maintained pair means updating BOTH sides in lockstep and re-running `parity-check` — if the extraction turns out to require restructuring `precalculateTerrainCaches`, STOP and split this phase into its own CCR (prototype-first rule, agent-notes §4).

**Verify:** default cave output byte-identical (browser-suite worker round-trip on a caves-heavy chunk); cave threshold tunable visibly changes cave density in a test world.

### #8 — Deferred items (documented, NOT built here)

- **Per-biome overrides** (weight/roughness/amplitude/baseHeight/treeDensity per biome — the old biome editor's real analog): feasible via the existing `BIOME_CONFIG`-mutate → `buildBiomesFromConfig()` → worker-bake path `applyGenParams` already uses; needs genParams v4 if per-world. Own CCR.
- **Forced-biome-shapes-terrain**: bias climate fields toward the forced biome's `BIOME_PARAMS` centroid so "Mountains only" is mountain-SHAPED. Terrain-gen change (owner-excluded here) + `TERRAIN_GEN_VERSION` bump + prototype-first. Own CCR when wanted.
- **Spline curve UI**: draggable control points over the JSON textarea. Pure editor UX, any time.
- **Option B persistence** (per-world tunables, genParams v4): layer over this CCR's registry without rework.

## Worker parity

- Registry, schema, apply/reset, aliases: **main-only** definitions; the worker consumes BAKED VALUES exactly as today (emission block value-source change only, #2). No injected-function edits in Phases A–C; injection markers untouched.
- Phase D touches the hand-maintained cave pair — both sides, `parity-check` gates it, split-off rule in #7.
- `parity-check.mjs` needs NO new rules for Phases A–C (the emitted literals change VALUE only when tunables differ from defaults; at defaults the generated worker source is byte-identical).

## Safety Checks

- [ ] `node tools/syntax-check.mjs` + `node tools/parity-check.mjs` GREEN every phase
- [ ] `node tools/terrain-node-checks.mjs` on ≥3 seeds: byte-identical output at defaults after Phase A (the core no-regression gate of this CCR)
- [ ] `node tools/run-browser-tests.mjs` GREEN + new tests: tunables schema↔registry parity; apply/reset round-trip; worker-bake sentinel string test; (Phase D) cave-chunk byte-parity at defaults
- [ ] `SWISS_WARP` hard cap enforced in `applyGenTunables` (< 14) with a test
- [ ] No duplicate identifiers: `GEN_TUNABLES`, `GEN_TUNABLE_DEFAULTS`, `GEN_TUNABLE_SCHEMA`, `applyGenTunables`, `resetGenTunables`, `syncGenTunableAliases` (grep before declaring)
- [ ] No new per-column allocations or property-lookup regressions in `terrainSurface`'s hot loop (alias pattern per #1)
- [ ] JSDoc on all new functions; strict `===`; no `var`
- [ ] `VOXEX_BUILD` bumped per shipped phase; NO `TERRAIN_GEN_VERSION` bump (this CCR); CLAUDE.md (World Creation / Testing Tools / Key Constants note that shape consts moved into `GEN_TUNABLES`) + agent-notes §3 updated
- [ ] Editor eyeball over localhost: all four views, tunables panel, export/import round-trip, reset

## Open questions — ALL RESOLVED by owner 2026-07-11 (implementation unblocked)

1. **Persistence: A then B.** This CCR ships Option A (editor-only dialing instrument; tunables never enter world creation; create-world import ignores a `tunables` block with a visible note). Option B (per-world tunables, genParams v4) stays a deferred follow-up CCR (#8) layered on this registry with no rework.
2. **Heightmap default: final carved height** with the "Base surface (pre-carve)" checkbox — as specced in #6.
3. **Combined view: KEEP** (Map + biome tint) — four views ship.
4. **`OCTAVES`: expose it**, with an explanatory `note` in its schema row rendered in the editor UI — wording to the effect of: "Number of noise layers stacked to build terrain detail. Fine detail exists at EVERY octave count on purpose — smoothness vs ruggedness comes from amplitude, not octave count. Lower = blockier/terraced terrain (the artifact the fixed value was chosen to prevent), higher = slower generation for little visual gain. Tested value: <current>." Same treatment (a `note` string surfaced as help text) applies to any other tunable with non-obvious intent — `HF_PIVOT`, `VALLEY_RATIO`, and the spline JSON rows at minimum.

## As-built (2026-07-11, build 2026-07-11.2, NO version bumps beyond VOXEX_BUILD)

Implemented by four Sonnet agents (registry+plumbing; editor panel+previews; Phase D caves; tests) plus one recovery agent, orchestrated per this CCR. All phases in one build.

**Shipped as specced:** #1 registry (29 scalars + 4 objects + RIVER/OCEAN_DEPTH_SCALE multipliers, defaults copied verbatim from the live consts) + frozen `GEN_TUNABLE_DEFAULTS`; alias rerouting via `syncGenTunableAliases()`; #2 emission block reads `GEN_TUNABLES.*` + two new depth-scale lines; #3 `applyGenTunables`/`resetGenTunables` (partial-no-reset asymmetry documented at BOTH apply functions; SWISS_WARP hard-caps to 13.9); #4 schema (6 sections + Splines/Caves, all `ui: 'editor-only'`, notes on OCTAVES/HF_PIVOT/VALLEY_RATIO/splines per resolved Q4) + seam exports; #5 editor Advanced Tunables panel (post-apply registry read-back so the hard-cap/fallback never lies to the user; dirty-dot section markers; `{genParams, tunables}` export with legacy bare-v3 import compat; Option A note rendered; missing-seam degrades to a banner without killing the rest); #6 four preview views — Heightmap = carved `blendedHeight` + hypsometric ramp + pre-carve checkbox, Biomes unchanged, Map = cached height/biome grid + real water below seaLevel + approximated sand/snow materials + NW hillshade (probe-style) + honesty caption, Combined = Map with stronger tint; cursor shows carved AND pre-carve heights; #7 caves.

**Deviations (all reviewed):**
- Ocean/river consts got the SAME alias pattern as the shape block instead of the suggested hot/cool split (CCR-permitted; simpler, strictly faster).
- **#7 cave inventory corrected**: the real literals are `caveScale 0.02` / `caveYScale 0.03` (in the hand-maintained `precalculateCaveNoise` pair), `threshold = (0.015 + widthNoise·0.025) · caveDensityMult`, and the lowland fade band `fadeStart 30`/`fadeEnd 50` (in injected `generateTerrainPass`). **No lava level exists** (no LAVA block) — the CCR's "lava level" guess was wrong. Shipped as 6 registry keys (CAVE_SCALE/CAVE_Y_SCALE/CAVE_THRESHOLD_BASE/CAVE_THRESHOLD_WIDTH/CAVE_FADE_START/CAVE_FADE_END) carried to the worker via the per-generate `worldGenSettings` message (new `syncGenTunableCaveSettings()` called from applyGenTunables/resetGenTunables/applyGenParams; matching literal defaults in the early `window.worldGenSettings` init, which cannot reference the later-declared registry). `precalculateCaveNoise` pair edited BOTH sides identically (+`worldGenSettings` param at both call sites). No STOP condition hit. `CAVE_STEP` deliberately NOT exposed (array-sizing resolution, not a shape knob). The elevated-terrain `subsurfaceCeiling` fade is a formula, not a literal — not exposed.
- **Unplanned lockstep change (found by verification, not anticipated by the CCR):** `tools/lib/extract-terrain.mjs` scanned for `const NAME = value;` declarations that no longer exist — terrain-node-checks failed with "const FIELD_GAIN not found". Updated per its own header rule ("update THIS file in the same commit"): it now extracts the `GEN_TUNABLES` object and derives all tunables from a `REGISTRY_KEYS` list (GRAD2D/MAX_SURFACE_Y still source-scanned). Documented in CLAUDE.md Testing Tools + agent-notes §3.

**Tests added** (suite "WorldGen Tunables (CCR-WORLDGEN-TUNABLES-001)", 9 tests): registry↔schema parity; defaults integrity+frozen; apply round-trip + partial semantics + hot-path alias proof via terrainSurface + exact reset; SWISS_WARP cap; unknown-key ignore; spline in-place object identity; worker-bake sentinel; cave→worldGenSettings propagation (via `VoxEx._doc.defaultView`); RIVER_DEPTH_SCALE exact-2× on `getRiverDepth(riverFactor, gx, gz, seed, oceanFactor)`.

**Verification (final state):** syntax-check GREEN on voxEx.html + editor + tests; parity-check GREEN (P1–P9; the `precalculateCaveNoise` pair has no parity rule — pre-existing gap, noted); terrain-node-checks ALL HARD CHECKS GREEN on seeds 12345/777/424242 with T6/T7 values **byte-identical to the pre-CCR baseline** (the core no-regression gate); CRLF integrity confirmed. **NOT yet run:** the browser suite (no Chromium in the sandbox) — run `node tools/run-browser-tests.mjs` locally. **In-browser gates outstanding:** editor over localhost — tunables panel + missing-seam banner path, four views (hypsometric ramp, hillshade, sand/snow bands: `TREELINE_Y=130` and tint strengths are first-pass guesses to tune visually), export/import round-trip (both shapes), undo/redo across param+tunable edits, Map render cost at 1024 quality.

**Environment record:** the sandbox mount served stale/truncated views of every Edit-tool-modified pre-existing file — the §7 recovery (content-anchored truncate + Read-tool tail re-append) was performed FOUR times (voxEx.html ×2, editor, tests), all verified by syntax-check + line/CRLF counts afterward; §7 updated with the refined procedure. Scratch tail files remain in the session outputs folder (sandbox couldn't delete them; harmless).

**Interop note (RESOLVED by the Option B addendum below):** the create-world 📥 import now accepts both the wrapped `{genParams, tunables}` shape and bare genParams.

## Option B addendum (same day, owner request — build 2026-07-11.3)

Owner reversed the Option A resolution hours after Option A shipped: tunables must be exposed and wired on the Create New World page, per-world. Implemented by three further Sonnet agents:

- **Persistence**: `genParams` gains an OPTIONAL `tunables` DELTA field (non-default keys only). Deliberately NOT a `DEFAULT_GEN_PARAMS` key — the strict schema↔defaults parity test forbids it; `restoreGenParams`'s merge carries the extra key through untouched, quickSave/saveWorld inherit it via `activeWorldGenParams`.
- **`applyGenParams` TRI-STATE contract** on `p.tunables`: absent/undefined → `resetGenTunables()` (old saves get pure defaults); plain object → reset then `applyGenTunables(delta)`; **explicit `null` → skip** (leave registry untouched). The `null` state exists because review caught that the terrain editor calls `applyGenParams(currentParams)` per genparam edit with no tunables field — under a two-state contract every genparam tweak would have silently WIPED the user's dialed tunables. The editor's new `applyParamsToGame()` wrapper now passes `tunables: computeNonDefaultTunables()` (self-healing: re-syncs its mirror from the live registry before computing), covering its boot/undo-redo/import paths through the single `commitParamsChange` call site.
- **Create-world UI**: `populateGenParamControls()` appends an "Advanced Tunables" divider (+ `#btn-reset-tunables`) and one collapsed `.ui-collapse` per `GEN_TUNABLE_SCHEMA` section; number rows (`data-gentunable`, schema `note` rendered as muted help text) + JSON textareas for the 4 object keys; delta semantics (values equal to default are REMOVED from the delta); soft warns feed the existing preview badge; `customWorldTunables` is the UI-side delta, attached by `collectGenParamsFromUI` only when non-empty. Preview honors tunables automatically (updateWorldPreview → applyTerrainSettings → applyGenParams).
- **Import**: 📥 accepts wrapped `{genParams, tunables}` (editor export) AND bare genParams; unknown tunable keys toast+skip.
- **Schema**: all `ui` flags 'editor-only' → 'both'; seam comment updated. Editor: Option A note removed, all "editor-only"/"ignores them" messaging replaced ("Exports (incl. tunables) import directly into the game's Create New World page").
- **Tests**: ui-flag assertion updated to 'both'; new tri-state test (object applies / null skips / absent resets).
- **Versions**: VOXEX_BUILD → 2026-07-11.3 only. No TERRAIN_GEN_VERSION bump (defaults unchanged; worlds without the field byte-identical — re-proven: terrain-node-checks T6/T7 unchanged on 3 seeds).
- **Verification**: syntax GREEN on all three files, parity GREEN, terrain checks GREEN ×3 seeds. Browser suite still pending a local run. Two more §7 mount recoveries were needed (voxEx.html — with a FRESH tail capture since the seam-comment edit invalidated the stored one; voxex-tests.html), bringing the session total to six; agent-notes §7 already documents the refined procedure.
- **In-browser gates outstanding (Option B additions)**: create-world Advanced Tunables sections render + preview responds; create a world with a modified tunable (e.g. RIVER_BASE_WIDTH ×2) → save → reload → terrain consistent (no seams, delta visible in the save's genParams); editor export → create-world import round-trip including tunables; editor dial-a-tunable then tweak a genparam → tunable survives (the tri-state fix).

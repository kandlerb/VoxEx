# CCR-WORLDGEN-UI-001: Unified world-gen settings — one schema, free-form inputs, collapsible sections, editor delegation

> **Status: IMPLEMENTED** (2026-07-11, build 2026-07-11.1) — pending: browser-suite run on a real machine + in-game visual gates (see As-built). Move to `Finished/` after those pass.
> **ID**: VOXEX-CCR-WORLDGEN-UI-001 · **Build baseline**: 2026-07-10.9 · **Author**: Claude (requested by Kandler, 2026-07-11)
> **Audit record (two passes, both 2026-07-11):**
> *Pass 1 (UI scope)* — all grep anchors verified against build 2026-07-10.9; 7 defects fixed in place (schema-parity test contradiction, invalid terrain-probe verify, undeclared `GEN_PARAM_SCHEMA_BY_KEY`, missing toggle side-effect notes + latent cave-density value-loss quirk, vestigial `advanced-toggle` listener discovered, `selectedBiome` import routing, partial-object `applyGenParams` reset hazard).
> *Pass 2 (after folding the wiring fixes in as Phase D, changes #10–#13)* — injection ordering for #11 verified against the live file (worker `WORLD_DIMS` const at template top precedes the `__TERRAIN_FUNCS_START__` marker, so the injected override runs after the declaration); negative-coordinate chunk math in #13 checked (`Math.floor(-300/16) = -19` ✓); 8 further defects fixed (amp-0 verify formula included a `lift` term that is itself scaled by `amp0` and therefore zero; "visibly flat" wording would read as a false failure since the continental baseline still varies; stale `livePaths`/Phase-C-tense wording; `customWorldSettings` scattered-init consolidation was unaddressed; #3's 14-key round-trip count is phase-dependent; #5's partial-object test needed a cross-reference to #7's reset hazard; stale DRAFT text in the As-built placeholder; Open-questions heading said "during AUDIT" after the audit was done).
> Open questions 1–4 below remain OWNER decisions — resolve before implementing.

## Problem / Why

Three related problems, verified against the live code at build 2026-07-10.9:

1. **`tools/terrain-parameter-editor.html` is a drifted standalone replica, not the game.**
   It hand-copies its own `SeededNoise`/`TerrainGenerator`/`mulberry32` (grep `class SeededNoise` in the tool) and models the LEGACY biome-cell terrain — its `DEFAULT_PARAMS` (grep `const DEFAULT_PARAMS` in the tool) contains parameters that do not exist in the game's model at all: `caves.{threshold,scale,octaves,lacunarity,persistence,minY,maxY,lavaLevel}` and `rivers.{threshold,frequency,width,depth}` (the game's rivers are a domain-warped noise ribbon via `getRiverFactor` with `RIVER_BASE_WIDTH` in noise units — none of the tool's river knobs map to it). Its "MUST match voxEx.html" comments describe the pre-`terrainSurface` era; under the game's default `useNewTerrain: true` the entire cell/`blendedHeight` model the tool renders is the inert A/B path. `tools/terrain-visualizer.html` had the identical disease and was already cured by delegating to the real game via the `?test=1` seam (TERRAIN-001 #514) — this tool never got that treatment.
   Its "Copy for VoxEx" export (grep `btn-copy-voxex`) emits `BIOME_CONFIG` source snippets for hand-pasting, not a `genParams` object the game can consume.

2. **The Create New World page exposes only a clamped subset of the canonical gen params.**
   The game's single source of truth per world is `DEFAULT_GEN_PARAMS` (grep `const DEFAULT_GEN_PARAMS` in `voxEx.html`) — 14 fields, persisted as `savePacket.genParams` v3, applied by `applyGenParams()`. The create-world UI covers most of them but through hard-clamped sliders: amplitude 0–200%, sea level 40–80, cave/tree density 0–200%, biome size 25–400%, persistence 0.20–0.80, lacunarity 1.5–3.0 (grep `terrain-amplitude-slider` for the HTML block). `usePathBasedRivers` has no UI at all. Exact values (e.g. sea level 63, persistence 0.55) are awkward or impossible; anything outside the slider range is impossible.

3. **No consistent collapsed-section navigation, and sliders instead of free inputs.**
   The create-world right pane has exactly one collapsible ("More Options", a `.ui-collapse`); everything else is always expanded. The parameter editor has its own separate `createSection` collapse implementation, defaulting to expanded. User requirement: every settings group in BOTH UIs starts collapsed, and every numeric setting is a free-form text box (any number), not a slider.

Root cause of 1 and 2: there is no machine-readable registry of "the world-gen settings" — the param list lives implicitly in four places (`DEFAULT_GEN_PARAMS`, the create-world HTML, its slider handlers, and the tool's replica schema) that drift independently.

### Baseline wiring audit (2026-07-11 — resolves most of Phase C up front)

Every create-world knob traced to its consumer under the default `useNewTerrain: true` + workers-on configuration:

| Param | Verdict | Evidence (grep anchors) |
|---|---|---|
| `terrainAmplitudeMultiplier` | **DEAD (bug)** | `terrainSurface` reads `worldConfig.terrainAmplitudeMultiplier` (grep `const amp0 =`), the getter reads `WORLD_CONFIG.terrainAmplitudeMultiplier`, the worker bakes it (grep `', terrainAmplitudeMultiplier: '` in `buildChunkWorkerCode`) — but **nothing ever assigns it**. `applyGenParams` scales only `BIOME_CONFIG` amplitudes, which the new path never reads for height. The init comment even says "(Step 11 wires the create-world slider)" — Step 11 never happened. Slider + the Amplified/Flat/Superflat presets' amplitude have NO effect on generated terrain OR the preview. |
| `seaLevel` | **HALF-WIRED (bug)** | `applyGenParams` sets main-thread `WORLD_DIMS.seaLevel`; the preview honors it. But the worker's hand-maintained `WORLD_DIMS` literal hardcodes `seaLevel: 60` (grep `seaLevel: 60,` in the worker template), and neither the `init` message (`{ type: 'init', jobId, seedStr }`) nor the `generate` message (`{ type, jobId, cx, cz, seedStr, worldGenSettings }`) carries it. With workers on (default), generated terrain/water ignores a custom sea level → Archipelago (75), Flat (55), Superflat (30) generate at sea 60 while the preview shows otherwise. Needs one in-game confirmation, but the code path is unambiguous. |
| `usePathBasedRivers` | **DEAD (vestigial)** | Written in 4 places (`DEFAULT_GEN_PARAMS`, `applyGenParams`, `collectGenParamsFromUI`, `worldGenSettings` default), read by ZERO generation code. No UI either. |
| `spawnX` / `spawnZ` | **UI-ONLY (misleading)** | Only consumer is the create-world preview pan (grep `const spawnX = customWorldSettings.spawnX` in `WorldPreviewRenderer`). Actual spawn is hardcoded: `initGameEngine` sets `const spawnChunkX = 0`, and `findAndSetSpawnPosition` positions at `(0, y, 0)`. The "Spawn Coordinates" label promises something the game doesn't do. |
| `noisePersistence` / `noiseLacunarity` | **LIVE (both paths)** | New path: `continentalness()` delegates to `continentalHeight()` which reads `worldConfig.persistence/lacunarity` (grep `function continentalHeight`) → shapes the C climate field → `terrainSurface` baseline + `resolveBiome`. Legacy: also `defaultHeightFunc`. Worker gets them baked. |
| `biomeSizeMultiplier` | LIVE (both) | `applyGenParams` sets `WORLD_CONFIG.biomeSizeMultiplier`; new path reads via `paramFreq`, legacy via grid scale; worker-baked. |
| `selectedBiome` | LIVE, semantic quirk | `resolveBiome` short-circuits on `forceSingleBiome` → biome identity (materials, trees, fog) is forced everywhere, but new-path terrain SHAPE stays climate-driven — "Mountains only" gives mountain biome identity on plains-shaped land. Worth a UI hint, not a bug per se. |
| `treeDensityMultiplier` / `enableTrees` | LIVE | `applyGenParams` scales `BIOME_CONFIG.trees.density` (0 when disabled); biome objects rebuilt + worker-baked. |
| `caveDensityMultiplier` / `enableCaves` | LIVE | carried per-generate in `worldGenSettings`; read in `generateTerrainPass` (grep `caveDensityMult`). |
| `enableRivers` | LIVE | `worldConfig.enableRivers` getter reads `worldGenSettings`; read at both river gates (grep `const riversOn`); carried per-generate. |

The two BUGS (amplitude, sea level), the dead `usePathBasedRivers` key, and the fake spawn inputs are **fixed in Phase D of THIS CCR** (changes #10–#13 — folded in from the planned companion CCR at owner request, 2026-07-11). Phase D is the only part of this CCR that changes terrain output (non-default worlds only) and therefore owns the `TERRAIN_GEN_VERSION` bump; keep its edits in a separately revertable commit from the UI phases.

## Approach

Introduce one data-driven registry, `GEN_PARAM_SCHEMA`, in `voxEx.html` (same pattern as `BLOCK_CONFIG`/`SPELL_CONFIG`): one entry per canonical gen param with key, label, section, kind (number/toggle/biome), tested range, display format, and a `live` field (which terrain path consumes it — populated from the baseline wiring audit). Both UIs build their controls FROM the schema:

- **Create-world page**: the right-pane groups are rebuilt as schema-driven `.ui-collapse` sections (the ONE approved dropdown pattern — agent-notes §3 Menus), all starting collapsed. Numeric params render as free-form text inputs (`type="text"`, `inputmode="decimal"`): any finite number is accepted and used as-is; values outside the schema's tested range get a soft amber warning class + tooltip, never a clamp; NaN/empty falls back to the schema default. Presets keep working by writing values through the same setter the inputs use.
- **Terrain parameter editor**: rebuilt as a seam-delegating tool (exactly the `terrain-visualizer.html` model): load `../voxEx.html?test=1` in a hidden iframe, build the params panel from `window.VoxEx.GEN_PARAM_SCHEMA`, apply edits via the (newly seam-exposed) `applyGenParams`, and render previews from the REAL `terrainSurface`/`computeSurfaceHeight`/`resolveBiome`/`getRiverFactor`/`getOceanFactor`. The replica noise/terrain classes are deleted. Export/import becomes a `genParams` JSON round-trip (drop-in compatible with `savePacket.genParams` v3), so an editor preset can be pasted straight into the create-world flow (a small "Import genParams JSON" affordance on the create-world panel closes the loop). Its sections default collapsed.

**Rejected alternatives:**
- *Keep the editor's replica and just rename its params to match `DEFAULT_GEN_PARAMS`* — stays a hand-synced copy; the repo has repeatedly paid for exactly this (visualizer pre-#514, `WorldPreviewNoise` removal). Rejected by owner 2026-07-11.
- *Extend scope to per-biome overrides (weight/roughness/amplitude per biome) editable in both UIs* — requires a `genParams` v4 save format, worker re-bake semantics, and preview plumbing; deferred, not rejected (possible follow-up CCR). Owner chose canonical-params-only scope 2026-07-11.
- *Hard-clamp text inputs at physical limits* — rejected by owner in favor of unclamped + soft warning. Generation-breaking values are the user's prerogative; the warning is informational only.

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry citing CCR-WORLDGEN-UI-001 (always; per-phase if phases ship in separate builds)
- `TERRAIN_GEN_VERSION`: **Phases A–C: no** (UI plumbing only, byte-identical output at all values). **Phase D: YES** — wiring amplitude (#10) and sea level (#11) changes generated terrain for any world whose saved `genParams` carry non-default values (those worlds were generating WRONG terrain; after the fix their cached chunks no longer match what generation produces → without a bump, newly generated chunks would seam/cliff against cached ones). The bump forces a one-time regen for ALL worlds; default-param worlds regenerate byte-identically (verify with `terrain-node-checks` on ≥3 seeds at defaults before/after). Bump in the same commit as Phase D, not earlier.
- `CURRENT_CACHE_VERSION`: **no** — no lighting-semantics or cache-format change in any phase.
- `SETTINGS_VERSION`: **no** — gen params are per-world (`savePacket.genParams`), not `SETTINGS`/`DEFAULTS`. Phase A leaves genParams v3 at 14 keys; Phase D (#12) removes the dead `usePathBasedRivers` key (13 keys — still called v3: old saves carrying the key load fine, the merged extra key is simply never read).

## Phasing

- **Phase A** — `GEN_PARAM_SCHEMA` + create-world rebuild (changes #1–#6).
- **Phase B** — terrain-parameter-editor delegation rebuild (changes #7–#8).
- **Phase C** — liveness audit (RESOLVED at draft time — see the baseline audit table) + interim UI labels IF phases ship separately (change #9).
- **Phase D** — wiring fixes (changes #10–#13): amplitude wire, seaLevel→worker, `usePathBasedRivers` removal, real spawn coordinates. **The only output-changing phase — own commit, owns the `TERRAIN_GEN_VERSION` bump.** May land before OR after A–C (no code dependency, only the schema `live` labels differ — see #1's AUDIT NOTE).

## Candidate NEW exposures (not currently in any UI — follow-up scope, genParams v4)

Everything below is a module-scope const already serialized into the worker at pool creation (grep `RELIEF_AMPLITUDE = ' + JSON.stringify` in `buildChunkWorkerCode`) — the worker plumbing is half-done; exposing one means making it `worldConfig`-backed, adding it to `DEFAULT_GEN_PARAMS` (v4 format bump), and a schema row. Ordered by likely user value:

| Candidate | What it does | Caution |
|---|---|---|
| `useNewTerrain` | Terrain engine A/B (new climate+spline vs legacy biome-cell) | Already a live getter + worker-baked; cheapest of all — just needs a genParams key + toggle |
| `RIVER_BASE_WIDTH` | River channel width | Tested value 0.064 noise units; wide ranges untested |
| `getRiverDepth` depth scale | River bed depth | Carve fades were tuned against current depth (agent-notes §4 cliff-ring lesson) |
| `OCEAN_THRESHOLD_DEEP` / `OCEAN_THRESHOLD_SHALLOW` | Ocean coverage / shelf width | Noise-std-calibrated; soft-warn range should be narrow |
| `RELIEF_AMPLITUDE`, `PEAK_AMP`, `NOTCH_LIFT` | Overall relief / summit character | Interacts with the notch metric gates; `tested` ranges from the mountain-overhaul probes |
| `SWISS_WARP` | Erosion-drift strength | HARD bound < 14 (documented on the const) — the one place a soft warn arguably should be a hard cap |
| `OCTAVES`, `BASE_GAIN`, `GAIN_BY_RELIEF`, `WARP_*`, `HF_PIVOT`, `VALLEY_RATIO`, `FRACT_FREQ0` | Fractal shape internals | Editor-tier knobs; probably expose in the terrain editor only, not create-world |
| Cave shape (minY/maxY/lava level) | Cave band + lava | Lives inline in `generateTerrainPass` — needs extraction to consts first |
| `MOUNTAIN_REGION_FREQ` / `THRESHOLD` | Mountain range coverage | Legacy-path mask only — skip unless legacy A/B matters |

NOT recommended: per-biome `TREE_CONFIG` / `BIOME_CONFIG` numeric fields (hand-maintained worker copies — every exposure widens the lockstep registry).

## Changes

### #1 — Add `GEN_PARAM_SCHEMA` beside `DEFAULT_GEN_PARAMS`

**Location:** grep `const DEFAULT_GEN_PARAMS` in `voxEx.html`
**Why:** single machine-readable source for both UIs; kills the four-way drift.

**Before:**
```js
const DEFAULT_GEN_PARAMS = Object.freeze({
    terrainAmplitudeMultiplier: 1.0,
    treeDensityMultiplier: 1.0,
    caveDensityMultiplier: 1.0,
    seaLevel: 60,
    biomeSizeMultiplier: 1.0,
    noisePersistence: 0.5,
    noiseLacunarity: 2.0,
    enableRivers: true,
    enableTrees: true,
    enableCaves: true,
    usePathBasedRivers: false,
    selectedBiome: null,
    spawnX: 0,
    spawnZ: 0
});
```

**After (add BELOW the unchanged `DEFAULT_GEN_PARAMS`; defaults are derived from it, never duplicated):**
```js
/**
 * Registry of the canonical per-world generation parameters. Single source for
 * the create-world UI AND tools/terrain-parameter-editor.html (via the ?test=1
 * seam). One entry per DEFAULT_GEN_PARAMS key (checked by the browser suite).
 * `tested` is the soft-warning range (NOT a clamp — CCR-WORLDGEN-UI-001).
 * `live` documents which terrain path consumes it (from the baseline wiring audit).
 * @type {Array<{key: string, label: string, section: string, kind: string,
 *               tested?: [number, number], format?: string, live: string, note?: string}>}
 */
const GEN_PARAM_SCHEMA = [
    { key: 'terrainAmplitudeMultiplier', label: 'Terrain Amplitude', section: 'Terrain Shape', kind: 'number', tested: [0, 2],    format: 'percent', live: 'both' },   // wired by #10 (Phase D)
    { key: 'seaLevel',                   label: 'Sea Level',         section: 'Terrain Shape', kind: 'number', tested: [40, 80],  format: 'int',     live: 'both' },   // worker-baked by #11 (Phase D)
    { key: 'biomeSizeMultiplier',        label: 'Biome Size',        section: 'Biomes',        kind: 'number', tested: [0.25, 4], format: 'percent', live: 'both' },
    { key: 'selectedBiome',              label: 'Single Biome',      section: 'Biomes',        kind: 'biome',                                        live: 'both' },
    { key: 'noisePersistence',           label: 'Noise Persistence', section: 'Noise',         kind: 'number', tested: [0.2, 0.8], format: 'float2', live: 'both' },
    { key: 'noiseLacunarity',            label: 'Noise Lacunarity',  section: 'Noise',         kind: 'number', tested: [1.5, 3.0], format: 'float1', live: 'both' },
    { key: 'enableTrees',                label: 'Trees',             section: 'Structures',    kind: 'toggle',                                       live: 'both' },
    { key: 'treeDensityMultiplier',      label: 'Tree Density',      section: 'Structures',    kind: 'number', tested: [0, 2],    format: 'percent', live: 'both', showIf: 'enableTrees' },
    { key: 'enableCaves',                label: 'Caves',             section: 'Structures',    kind: 'toggle',                                       live: 'both' },
    { key: 'caveDensityMultiplier',      label: 'Cave Density',      section: 'Structures',    kind: 'number', tested: [0, 2],    format: 'percent', live: 'both', showIf: 'enableCaves' },
    { key: 'enableRivers',               label: 'Rivers',            section: 'Structures',    kind: 'toggle',                                       live: 'both' },
    // usePathBasedRivers: DEAD (zero readers — baseline audit). NO schema entry / NO UI;
    // the key itself is removed from DEFAULT_GEN_PARAMS by #12 (Phase D).
    { key: 'spawnX',                     label: 'Spawn X',           section: 'Spawn',         kind: 'number', tested: [-100000, 100000], format: 'int', live: 'both' }, // real spawn wired by #13 (Phase D)
    { key: 'spawnZ',                     label: 'Spawn Z',           section: 'Spawn',         kind: 'number', tested: [-100000, 100000], format: 'int', live: 'both' }  // real spawn wired by #13 (Phase D)
];
```

Also derive the lookup map used by the delegated handler (change #3), immediately after the schema:
```js
const GEN_PARAM_SCHEMA_BY_KEY = Object.fromEntries(GEN_PARAM_SCHEMA.map(e => [e.key, e]));
const GEN_PARAM_DEAD_KEYS = ['usePathBasedRivers']; // deliberately no schema row; entry deleted when #12 (Phase D) removes the key
```

**AUDIT NOTE (phase interleaving):** the schema above shows the FINAL (post-Phase-D) state. If Phase A ships in a build BEFORE Phase D, use the interim values from the baseline audit table instead (`live: 'legacy-only'` amplitude / `'main-only'` seaLevel / `'ui-only'` spawn, with their explanatory `note`s, spawn labeled "Preview X/Z") and flip them in the Phase D commit. If A and D land in one build, write the final values directly. Either way `GEN_PARAM_DEAD_KEYS` exists only while `usePathBasedRivers` remains in `DEFAULT_GEN_PARAMS`.

**AUDIT NOTE:** `format: 'percent'` means the UI DISPLAYS/ACCEPTS percent (e.g. `100`) but the stored value stays the multiplier (`1.0`) — same conversion the sliders do today (`val / 100`). Do not change the stored representation; `genParams` v3 compatibility depends on it.

**Verify:** browser-suite test asserting (a) every `GEN_PARAM_SCHEMA` key exists in `DEFAULT_GEN_PARAMS`, and (b) every `DEFAULT_GEN_PARAMS` key has a schema row OR is listed in `GEN_PARAM_DEAD_KEYS`. NOT plain both-direction equality — `usePathBasedRivers` intentionally has no schema row (final-audit fix 2026-07-11).

### #2 — Rebuild the create-world right pane as schema-driven collapsed sections

**Location:** grep `id="terrain-amplitude-slider"` in `voxEx.html` (the whole `.cw-rcol` inner markup, from `<div class="section-title">Biome Selection</div>` through the Spawn Coordinates `input-group`)
**Why:** all option groups become `.ui-collapse` sections (starting `collapsed`), populated at panel-open time from `GEN_PARAM_SCHEMA` — the HTML stops hand-listing params.

**Before (representative — one of seven hand-written groups):**
```html
<div class="slider-group">
    <label>
        <span>Terrain Amplitude</span>
        <span id="terrain-amplitude-val">100%</span>
    </label>
    <input type="range" id="terrain-amplitude-slider" min="0" max="200" value="100" />
</div>
```

**After (markup shrinks to section shells; rows are generated):**
```html
<!-- CCR-WORLDGEN-UI-001: option rows generated from GEN_PARAM_SCHEMA by
     populateGenParamControls(). One .ui-collapse per schema section, ALL
     start collapsed. Biome Selection keeps its existing #biome-selector grid
     (moved inside its section's .ui-collapse-b). -->
<div id="genparam-sections"></div>
```
plus a `populateGenParamControls()` function beside `populateBiomeSelector()` that, per section, emits the approved `.ui-collapse collapsed` shell and per param either a toggle row (reusing `.toggle-row`) or:
```html
<div class="genparam-row">
    <label for="genparam-<key>"><span>Label</span></label>
    <input type="text" id="genparam-<key>" inputmode="decimal" autocomplete="off" />
</div>
```

**AUDIT FLAG:** do NOT keep the old element IDs as aliases — update all readers (change #4) to the new `genparam-<key>` IDs and delete the old ones. Baseline grep of the browser suite found only `fire-max-active-slider` (unrelated); re-grep before deleting in case tests were added since. Do not leave orphan IDs.

**AUDIT NOTE:** the World Name + Seed inputs in `.cw-lcol` stay as-is (they are not gen params). The preset grid stays as-is. The `#cave-density-row` / `#tree-density-group` show/hide behavior is generalized via the schema's `showIf`. `kind: 'biome'` rows do NOT render a text input — the section embeds the existing `#biome-selector` grid (wired via `selectBiome()`, untouched); the generic change listener must skip them.

**Verify:** open Create New World — every option section renders collapsed; expanding shows text inputs; `node tools/syntax-check.mjs` green.

### #3 — One delegated input handler replaces the seven per-slider listeners

**Location:** grep `tree-density-slider'\)?.addEventListener` in `voxEx.html` (and the sibling handlers through `spawn-z-input`)
**Why:** free-form parsing, default fallback, and soft-warning logic in ONE place.

**Before (representative):**
```js
document.getElementById('terrain-amplitude-slider')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('terrain-amplitude-val').textContent = val + '%';
    customWorldSettings.terrainAmplitudeMultiplier = val / 100;
    updateWorldPreview();
});
```

**After (sketch — one listener on `#genparam-sections`, `change` for numbers / `change` for checkboxes):**
```js
function parseGenParamInput(schemaEntry, raw) {
    const def = DEFAULT_GEN_PARAMS[schemaEntry.key];
    let v = parseFloat(raw);
    if (!Number.isFinite(v)) return { value: def, warned: false, fellBack: true };
    if (schemaEntry.format === 'percent') v = v / 100;
    const t = schemaEntry.tested;
    const warned = !!t && (v < t[0] || v > t[1]);
    return { value: v, warned, fellBack: false };
}
document.getElementById('genparam-sections')?.addEventListener('change', (e) => {
    const key = e.target.dataset.genparam;
    if (!key) return;
    const entry = GEN_PARAM_SCHEMA_BY_KEY[key];
    if (entry.kind === 'toggle') { customWorldSettings[key] = e.target.checked; }
    else {
        const r = parseGenParamInput(entry, e.target.value);
        customWorldSettings[key] = r.value;
        e.target.classList.toggle('genparam-warn', r.warned);
        e.target.title = r.warned ? `Outside tested range ${entry.tested[0]}–${entry.tested[1]} — may look broken or fail to generate` : '';
        if (r.fellBack) e.target.value = formatGenParam(entry, r.value);
    }
    updateWorldPreview();
});
```
Plus `.genparam-warn { border-color: #d69a2d !important; color: #ffcf7a; }` in the create-world CSS block, and a `formatGenParam(entry, value)` helper (the parse inverse: multiplier→percent display, `float1`/`float2` fixed decimals, `int` rounded) used by #3's fallback, #4, and #6.

**AUDIT NOTE — old-handler side effects (final-audit additions 2026-07-11):**
- `'change'` (not `'input'`) is DELIBERATE for text boxes — half-typed numbers must not churn the preview; commit on blur/Enter. Checkboxes fire `change` natively.
- Toggle changes must also apply `showIf` visibility (the old `#tree-density-group` / `#cave-density-row` show/hide) — drive it from the schema, generically.
- Do NOT replicate the old caves handler's `customWorldSettings.caveDensityMultiplier = 0` on uncheck. It is redundant (`applyGenParams` already gates: `caveMult = enableCaves !== false ? mult : 0`) AND destructive — it loses the typed density across an off→on toggle, the exact bug #521 already fixed for trees. Dropping it is a behavior FIX, not an omission; note it in as-built.
- DELETE the vestigial `advanced-toggle` listener (grep `advanced-toggle` — it targets DOM IDs `advanced-toggle`/`advanced-content` that do not exist in the HTML; only orphaned `.advanced-content` CSS rules remain — delete those too). Found during final audit.
- CONSOLIDATE `customWorldSettings` initialization: today it starts with 3 fields (grep `let customWorldSettings`) and gets the rest tacked on at two later sites (grep `customWorldSettings.enableTrees = true` and `customWorldSettings.noisePersistence = 0.5`). Replace all three with one init derived from the single source: `let customWorldSettings = Object.assign({}, DEFAULT_GEN_PARAMS);` (declared AFTER `DEFAULT_GEN_PARAMS`; `selectedBiome` stays the separate module global it is today — delete it from the copy or ignore it, `collectGenParamsFromUI` already reads the global). Delete the two tack-on blocks.

**AUDIT NOTE:** NO clamping anywhere in this path (owner decision). `Math.max/Math.min` on the parsed value is a bug, not a safeguard. Keep the delegated listener body allocation-light but this is menu UI, not a hot path — clarity wins.

**Verify:** type `63` into Sea Level → preview updates, no warn; type `500` → amber warn, value still used; clear the box → resets to default; uncheck+recheck Caves → typed density survives. `collectGenParamsFromUI()` round-trips every `DEFAULT_GEN_PARAMS` key (14 pre-#12, 13 after).

### #4 — `applyPreset` writes through the schema path

**Location:** grep `function applyPreset` in `voxEx.html`
**Why:** presets currently poke seven slider elements + `-val` spans by ID; those elements are gone.

**Before:** `applyPreset` sets `terrainSlider.value`, `document.getElementById('terrain-amplitude-val').textContent`, etc. per param.

**After (sketch):** map `WORLD_PRESETS` entries onto genparam keys (`terrainAmplitude`→`terrainAmplitudeMultiplier` percent, etc.), then for each: set `customWorldSettings[key]`, set `#genparam-<key>` input/checkbox display via `formatGenParam`, honor `showIf` visibility, then one `updateWorldPreview()`. `WORLD_PRESETS` values themselves are unchanged.

**Verify:** clicking each of the 6 presets fills the text boxes with the preset values and the preview changes accordingly; Superflat still yields no trees/caves/rivers in a created world.

### #5 — Expose the schema + `applyGenParams` on the `?test=1` seam

**Location:** grep `WORLD_CONFIG, BIOME_PARAMS,` inside the `window.VoxEx = {` literal in `voxEx.html`
**Why:** the editor (change #7) needs the schema, defaults, and the real apply function; none are currently exported (`applyGenParams` is absent from the seam — verified at baseline).

**After (add adjacent lines):**
```js
// --- CCR-WORLDGEN-UI-001: world-gen param registry + apply, for
//     tools/terrain-parameter-editor.html seam delegation ---
GEN_PARAM_SCHEMA, DEFAULT_GEN_PARAMS, applyGenParams,
get activeWorldGenParams() { return activeWorldGenParams; },
```

**Verify:** in the browser suite iframe, `window.VoxEx.applyGenParams({ seaLevel: 70 })` changes `WORLD_DIMS.seaLevel` to 70 (then restore defaults in the test's cleanup). The partial object deliberately resets every other knob to default — acceptable inside this test, and exactly the hazard #7's AUDIT FLAG warns the editor about.

### #6 — Create-world: "Import genParams JSON" affordance

**Location:** grep `btn-random-seed` in `voxEx.html` (seed-row area of `.cw-lcol`)
**Why:** closes the editor→game loop: paste the editor's exported JSON, get exactly those settings in the panel.

**After (sketch):** a small `📥` seed-row-style button opening a prompt/paste box; parsed object is merged over `DEFAULT_GEN_PARAMS`, written into `customWorldSettings`, all controls refreshed via the same routine `applyPreset` uses, `updateWorldPreview()` called. Unknown keys ignored with a toast.

**AUDIT NOTE (final-audit fix 2026-07-11):** `selectedBiome` is NOT a `customWorldSettings` field — it's a module global managed by `selectBiome()` (which also owns the grid's `.selected` state). The import routine must call `selectBiome(imported.selectedBiome || 'default')`, never write `customWorldSettings.selectedBiome`.

**Verify:** export JSON from the rebuilt editor → import in create-world → every text box matches; created world's `savePacket.genParams` equals the imported object (plus selectedBiome/spawn defaults if absent).

### #7 — Rewrite `tools/terrain-parameter-editor.html` as a seam-delegating tool

**Location:** whole file `tools/terrain-parameter-editor.html`
**Why:** kill the replica (problem 1). Model: `tools/terrain-visualizer.html` (already delegates via `?test=1`; grep its iframe bootstrap for the loading pattern).

Keep: the three-panel layout, `createSection` collapse mechanics (now defaulting `collapsed = true` for every section), presets-in-localStorage, JSON export/import, pan/zoom canvas, cursor info.
Delete: `SeededNoise`, `mulberry32`, `hashSeed`, `TerrainGenerator`, the entire `DEFAULT_PARAMS` tree, the biome-type editor rows, `generateVoxExBiomeConfig` ("Copy for VoxEx" now copies the genParams JSON instead), the caves/rivers replica models.
Replace with:
- iframe bootstrap of `../voxEx.html?test=1` (must be served over localhost — same constraint as the visualizer/suite; show a friendly banner if `file:`).
- params panel built from `VoxEx.GEN_PARAM_SCHEMA` — same sections, same `parseGenParamInput` semantics (free text box, soft amber warn outside `tested`, no clamp). Reuse by copying the small helper into the tool OR exposing it on the seam (prefer seam export: one source).
- every edit → `VoxEx.applyGenParams(currentParams)` on the iframe + re-render.
- seed box → `VoxEx.seedNoise(seedStr)` (already on the seam).
- preview modes: Heightmap/Biomes/Combined render from `VoxEx.terrainSurface` / `VoxEx.resolveBiome` / `VoxEx.getRiverFactor` / `VoxEx.getOceanFactor` (all already seam-exported). **Caves mode: REMOVED in this CCR** — cave carving lives inline in `generateTerrainPass` with no per-point seam function; faking it would recreate the replica problem. Leave a tombstone comment; a follow-up CCR may add a real seam hook.
- export: `JSON.stringify(currentParams)` — the exact `genParams` v3 shape.

**AUDIT FLAG:** the editor must NOT keep any terrain math of its own. If a preview mode can't be built from seam exports, drop the mode (as with Caves) rather than approximating. This is the lesson the visualizer already paid for.

**AUDIT FLAG (final-audit fix 2026-07-11):** always pass the COMPLETE params object to `VoxEx.applyGenParams` — every field uses `??`/`||` default fallbacks, so a partial object silently RESETS every omitted knob to default. The editor keeps one full `currentParams` object (initialized from `VoxEx.DEFAULT_GEN_PARAMS`) and mutates keys in place.

**Verify:** the editor and `tools/terrain-visualizer.html` (also seam-driven) render matching heightmaps for the same seed string; a few `cursor-info` height readouts match `window.VoxEx.computeSurfaceHeight(gx, gz)` evaluated in the suite iframe at the same seed. Do NOT verify against `terrain-probe.mjs` — its extraction layer uses its own perm PRNG and is documented as NOT byte-identical to in-game seed strings (`tools/lib/extract-terrain.mjs` header). Then: changing Sea Level in the editor and importing the JSON into create-world produces an identical preview.

### #8 — Editor sections start collapsed

**Location:** grep `createSection('Seed')` in `tools/terrain-parameter-editor.html` (rebuilt in #7)
**Why:** user requirement — navigate directly to the wanted group. `createSection(title, collapsed = true)` becomes the default; the Seed section MAY stay open (it's the entry point) — implementer's call, note it in as-built.

**Verify:** load editor — all param sections collapsed; expanding one doesn't disturb the others.

### #9 — Phase C: param liveness audit — **RESOLVED at draft time** (see "Baseline wiring audit" table above)

The audit was completed 2026-07-11 while drafting; findings live in the table and the schema comments. Remaining Phase C work (only applies if Phase D ships in a LATER build than Phase A — skip entirely if they land together):

1. **Interim UI liveness labels**: render the interim `live: 'legacy-only'` / `'main-only'` / `'ui-only'` entries with a muted suffix ("(no effect until fix lands)") so users aren't misled during the gap; the Phase D commit deletes the suffixes and flips the schema fields (see #1's phase-interleaving AUDIT NOTE).
2. **Optional in-game confirmation of the sea-level defect** (pre-Phase-D baseline evidence): create an Archipelago-preset world (seaLevel 75, workers on) and confirm generated water sits at 60 while the preview showed 75. Record in as-built.

**Verify:** each schema entry's `live` field is evidenced by a grep citation (done — table in Problem/Why); interim labels render if applicable.

---

**The changes below are PHASE D — the wiring fixes folded in from the planned companion CCR (owner request 2026-07-11). They are the only output-changing edits in this CCR: one commit, `TERRAIN_GEN_VERSION` bumped in that commit, independently revertable from Phases A–C.**

### #10 — Wire `terrainAmplitudeMultiplier` into the live config ("Step 11", finally)

**Location:** grep `const ampMult = p.terrainAmplitudeMultiplier` in `voxEx.html` (inside `applyGenParams`)
**Why:** `terrainSurface` reads `worldConfig.terrainAmplitudeMultiplier` (grep `const amp0 =`) and `buildChunkWorkerCode` bakes it (grep `', terrainAmplitudeMultiplier: '`), but nothing assigns it — the create-world Amplitude control and the Amplified/Flat/Superflat presets have never affected the default terrain path.

**Before:**
```js
// Amplitude + tree-density multipliers (tree density 0 when trees disabled).
const ampMult = p.terrainAmplitudeMultiplier ?? 1.0;
```

**After:**
```js
// Amplitude + tree-density multipliers (tree density 0 when trees disabled).
const ampMult = p.terrainAmplitudeMultiplier ?? 1.0;
// CCR-WORLDGEN-UI-001 #10: feed the NEW terrain path too (terrainSurface's amp0).
// The BIOME_CONFIG amplitude scaling below only reaches the LEGACY path; this
// line was the missing "Step 11" promised at the WORLD_CONFIG declaration.
WORLD_CONFIG.terrainAmplitudeMultiplier = ampMult;
```

**AUDIT NOTE:** the main-thread assignment is sufficient for the worker too — `buildChunkWorkerCode` serializes `worldConfig.terrainAmplitudeMultiplier` at pool creation, and every flow creates/rebuilds the pool AFTER `applyGenParams` runs (create: `applyTerrainSettings()` → `initGameEngine`; in-session load: `restoreGenParams` → `rebuildChunkWorkerPoolForActiveWorld()`; title load: reload → restore → fresh pool). Also update the stale `WORLD_CONFIG` declaration comment (grep `Step 11 wires the create-world slider`) to cite this CCR.

**Verify:** `terrain-node-checks` unchanged on ≥3 seeds at defaults; browser-suite test: with `applyGenParams({...defaults, terrainAmplitudeMultiplier: 0})`, `terrainSurface(x, z)` equals `WORLD_DIMS.seaLevel + spline(SPLINE_CONTINENTAL, continentalness(x, z))` EXACTLY at sample points — both the `amplitude` and `lift` terms carry an `amp0` factor, so amp0 = 0 leaves only the base (restore defaults in cleanup); amplitude 200% → exaggerated relief in-game. **In-game expectation-setting:** amplitude 0% removes all FRACTAL relief but the smooth continental baseline (`spline(SPLINE_CONTINENTAL, C)`) still varies gently with position — rolling ocean-to-inland gradient, not a perfect plane. That is correct behavior, not a failed fix.

### #11 — Bake `seaLevel` into the worker at pool creation

**Location:** grep `', terrainAmplitudeMultiplier: '` in `voxEx.html` (the injected-`worldConfig` block inside `buildChunkWorkerCode`) — append a new injected line after the `worldConfig` literal closes
**Why:** the worker template's hand-maintained `WORLD_DIMS` literal hardcodes `seaLevel: 60`; neither worker message carries it, so worker-generated terrain ignores custom sea levels (Archipelago previews islands, generates coastline).

**Before:**
```js
    + ', terrainAmplitudeMultiplier: ' + JSON.stringify(worldConfig.terrainAmplitudeMultiplier)
    + ' };\n\n';
```

**After:**
```js
    + ', terrainAmplitudeMultiplier: ' + JSON.stringify(worldConfig.terrainAmplitudeMultiplier)
    + ' };\n\n';
// CCR-WORLDGEN-UI-001 #11: override the template's hand-maintained WORLD_DIMS.seaLevel
// (a static literal, always 60) with the live per-world value. Injected code executes
// at the __TERRAIN_FUNCS_START__ marker, AFTER the template's `const WORLD_DIMS`
// declaration, so the property assignment is safe. The template literal itself stays
// untouched at 60 — parity-check's WORLD_DIMS literal-equality check stays green.
injectedCode += '    WORLD_DIMS.seaLevel = ' + JSON.stringify(WORLD_DIMS.seaLevel) + ';\n\n';
```

**AUDIT FLAG:** do NOT edit the template's `WORLD_DIMS` literal (grep `seaLevel: 60,` in the worker template) — `parity-check.mjs` enforces main↔worker literal equality (Lockstep Registry), and the main-thread literal's default is also 60. The runtime override via injection is the whole point: defaults stay byte-identical, custom worlds get the live value. Same lifecycle argument as #10 (pool always built after `applyGenParams`).

**AUDIT NOTE:** `WORLD_DIMS` is a `const` OBJECT in the worker — property assignment is legal; only rebinding is not.

**Verify:** `parity-check.mjs` GREEN (template untouched); `terrain-node-checks` unchanged at defaults; browser-suite worker round-trip: set seaLevel 75 via `applyGenParams`, rebuild pool, request a chunk, assert water blocks at y ≤ 74 above the old 60 line where terrain is below 75 (restore + rebuild in cleanup); in-game: Archipelago world now floods to match its preview.

### #12 — Remove the dead `usePathBasedRivers` key

**Location:** grep `usePathBasedRivers` in `voxEx.html` — all 5 sites: `DEFAULT_GEN_PARAMS`, `applyGenParams`'s `worldGenSettings` assign, `collectGenParamsFromUI`, the `customWorldSettings` init line (grep `Phase 2: gradient descent rivers`), and the `window.worldGenSettings` default literal + its JSDoc (grep `Can be modified from console`)
**Why:** zero readers in generation code (baseline audit) — it's a never-built feature flag masquerading as a setting. Removing it beats exposing it.

**After (sketch):** delete the key from all 5 sites + the JSDoc `@type` line. Old saves carrying the key still load — `restoreGenParams` merges the saved object over `DEFAULT_GEN_PARAMS`, the stray key rides along unread. Once removed, delete `GEN_PARAM_DEAD_KEYS` (change #1) and tighten the schema-parity browser test to strict both-direction equality.

**Verify:** grep `usePathBasedRivers` in `voxEx.html` → zero hits; load a pre-CCR save in the suite → no errors; schema-parity test (strict form) green.

### #13 — Make Spawn Coordinates real

**Location:** grep `const spawnChunkX = 0` in `voxEx.html` (inside `initGameEngine`) and grep `function findAndSetSpawnPosition`
**Why:** the create-world spawn inputs currently only pan the preview; the game hardcodes spawn at world origin. The schema's "Spawn X/Z" label (change #1) promises real placement.

**Before:**
```js
const spawnChunkX = 0;
const spawnChunkZ = 0;
```
and in `findAndSetSpawnPosition`: candidates hardcoded around `(0, 0)`, final `posTarget.position.set(0, spawnY, 0)`.

**After (sketch):**
```js
const spawnBX = Math.floor(activeWorldGenParams.spawnX ?? 0);
const spawnBZ = Math.floor(activeWorldGenParams.spawnZ ?? 0);
const spawnChunkX = Math.floor(spawnBX / CHUNK_SIZE);
const spawnChunkZ = Math.floor(spawnBZ / CHUNK_SIZE);
```
`findAndSetSpawnPosition` takes `(spawnBX, spawnBZ)` (default `(0, 0)`), builds its 4 candidates around them, and sets `posTarget.position.set(spawnBX, spawnY, spawnBZ)`.

**AUDIT NOTE:** only NEW-world first-spawn is affected — loads restore `loadedPlayerState` position and never call `findAndSetSpawnPosition` for placement (verify this claim at implementation time; if a load path DOES call it, thread the coords there too). `restoreGenParams` already repopulates `activeWorldGenParams.spawnX/Z` from the save, so a re-created/regenerated world respects its stored spawn. Pre-gen center follows the spawn chunk automatically via the variables above.

**AUDIT NOTE:** no `TERRAIN_GEN_VERSION` relevance — terrain output is untouched; this changes only where the player and pre-gen start.

**Verify:** create a world with spawn (500, -300) → progress screen pre-gens around chunk (31, -19), player lands on the surface near (500, -300); create with blank/0 inputs → identical behavior to today; quick-load of an existing save → player at saved position, not spawn.

## Worker parity

- `GEN_PARAM_SCHEMA`, `GEN_PARAM_SCHEMA_BY_KEY`, `populateGenParamControls`, `parseGenParamInput`, `formatGenParam`, seam exports: **main-only** — never injected, no worker copy.
- Phase D #10: `applyGenParams` gains one main-thread assignment; the value reaches the worker through the EXISTING `worldConfig` bake in `buildChunkWorkerCode` — no new injection.
- Phase D #11: adds ONE line to `injectedCode` (a `WORLD_DIMS.seaLevel` runtime override). The hand-maintained `WORLD_DIMS` template literal is NOT edited — parity-check's literal-equality check stays green by construction. Injection markers untouched.
- No injected FUNCTION touched in any phase; `NUM_TILES` untouched. `node tools/parity-check.mjs` must stay green with zero registry changes.
- Net parity WIN: the editor's hand-copied `SeededNoise`/`grad2D`/`fadeFast`-equivalents are deleted, removing an (unenforced) drift surface entirely.

## Safety Checks

- [ ] `node tools/parity-check.mjs` GREEN (all phases — #11 must not touch the WORLD_DIMS template literal)
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds at DEFAULT params — Phases A–C: proves zero output change; Phase D: proves default-value worlds regenerate byte-identically despite the wiring
- [ ] `TERRAIN_GEN_VERSION` bumped in the Phase D commit ONLY (not in A–C)
- [ ] `node tools/run-browser-tests.mjs` GREEN — including new tests: schema↔DEFAULT_GEN_PARAMS key parity (allowlist form pre-#12, strict form after); `parseGenParamInput` (percent conversion, NaN fallback, warn flags, no clamping); seam `applyGenParams` round-trip; #10 amplitude-0 flatness; #11 worker seaLevel round-trip
- [ ] Grep the browser suite for the retired `-slider` DOM IDs; update any test that drove them
- [ ] No duplicate/shadowed identifiers (`GEN_PARAM_SCHEMA`, `GEN_PARAM_SCHEMA_BY_KEY`, `GEN_PARAM_DEAD_KEYS`, `populateGenParamControls`, `parseGenParamInput`, `formatGenParam`, `spawnBX`, `spawnBZ` — grep before declaring; first six verified absent at baseline 2026-07-11)
- [ ] All new functions have JSDoc (`@param`/`@returns` per CLAUDE.md code-quality rules)
- [ ] `genParams` shape: Phase A — 14 keys, deep-equals `DEFAULT_GEN_PARAMS` at defaults; after #12 — 13 keys, and a pre-CCR save carrying `usePathBasedRivers` still loads clean
- [ ] Old saves (pre-CCR) load with identical terrain at DEFAULT params; saves with custom amplitude/seaLevel are EXPECTED to change once (Phase D fixes them — they were generating wrong; the `TERRAIN_GEN_VERSION` bump regenerates their chunks consistently)
- [ ] No unbatched per-frame work added (all new code is menu-time or pool-creation-time)
- [ ] `VOXEX_BUILD` bumped + `VOXEX_RECENT_CHANGES` entry citing this CCR (per shipped phase)
- [ ] CLAUDE.md updated: World Creation System (spawn now real, amplitude/seaLevel wiring, `usePathBasedRivers` gone), Testing Tools (editor now seam-delegating; caves preview removed), Lockstep Registry NOTE that worker `WORLD_DIMS.seaLevel` is runtime-overridden by injection (literal stays 60); `docs/agent-notes.md` §3 world-gen params note extended likewise
- [ ] In-game eyeball: create-world panel on desktop AND touch mode (`body.touch-mode` panel scrolling — grep `body.touch-mode #create-world-panel`); editor over localhost; Archipelago world floods to preview level (#11); amplitude 0% world is flat (#10); spawn (500, -300) world spawns there (#13)

## Open questions — ALL RESOLVED by owner 2026-07-11 (implementation unblocked)

1. Preview warn badge: **YES** — reuse `.genparam-warn` styling on `#world-preview-label` whenever any active param is outside its tested range.
2. Editor presets: **YES** — surface the game's 6 `WORLD_PRESETS` as read-only rows (adds `WORLD_PRESETS` to the change #5 seam exports) alongside the editor's own localStorage presets.
3. Editor biome picker: **biome grid** (visual parity with create-world; agent-notes §5 consistency).
4. Editor spawn pan: **YES** — changing Spawn X/Z pans the editor preview to that location.

Phasing resolution: all phases (A, B, D) land in ONE build → schema ships the FINAL `live` values (per #1's phase-interleaving AUDIT NOTE) and Phase C's interim labels (#9 item 1) are SKIPPED.

## As-built (2026-07-11, build 2026-07-11.1, `TERRAIN_GEN_VERSION` 31→32)

Implemented by three Sonnet agents (voxEx.html Phases A+D; editor rewrite Phase B; browser-suite tests) orchestrated per this CCR, all phases in one build (interim labels skipped per the phasing resolution).

**Shipped as specced:** #1 schema (13 entries, FINAL `live` values) + `GEN_PARAM_SCHEMA_BY_KEY`; #2 `populateGenParamControls()` generating collapsed `.ui-collapse` sections into `#genparam-sections`, reusing the file's existing delegated `.ui-collapse-h` click handler; #3 `parseGenParamInput`/`formatGenParam` + one delegated change listener (with `showIf` visibility, preview-label warn badge per resolved Q1, NO cave-density zeroing) + `customWorldSettings = Object.assign({}, DEFAULT_GEN_PARAMS)` consolidation + vestigial `advanced-toggle` listener and orphaned CSS deleted; #4 `applyPreset` via shared `refreshGenParamControlsFromSettings()`; #5 seam exports (incl. `WORLD_PRESETS`, `parseGenParamInput`, `formatGenParam` per resolved Q2 / #7's shared-helper preference); #6 `#btn-import-genparams` (`prompt()`-based v1, `selectBiome()` routing honored); #7/#8 editor rewritten 4113→2419 lines as a seam delegate (replica noise/terrain/biome-editor/caves-mode all deleted; Heightmap/Biomes/Combined modes; free inputs + amber warn; complete-object `applyGenParams`; built-in presets read-only; genParams JSON export/import incl. repurposed "Copy for VoxEx"; biome grid per Q3; spawn-pan per Q4; Seed section open, all others collapsed); #10 amplitude wire + stale comment updated; #11 injected `WORLD_DIMS.seaLevel` override (template literals untouched); #12 `usePathBasedRivers` fully removed (grep-zero); #13 real spawn (single call site confirmed new-world-only).

**Deviations (all minor, reviewed):** `GEN_PARAM_DEAD_KEYS` never created (#12 shipped simultaneously, so the allowlist window never existed — schema-parity test is strict-form from day one); `#genparam-sections` rendered as a single column inside `.ui-twocol` rather than split columns (CCR allowed "keep it simple"); "Randomize All" relabeled "Randomize Seed" (behavior change was specced, label wasn't); BOTH imports (editor AND create-world) merge onto CURRENT values rather than resetting omitted keys to defaults — the create-world handler computes a defaults-merge but only writes keys present in the pasted JSON (caught in post-implementation double-check; kept deliberately: it matches the editor's semantics, and the editor always exports complete objects so the paths are equivalent in practice); cosmetic `GEN_PARAM_TOGGLE_ICONS` map added.

**Tests added** (suite "WorldGen Params (CCR-WORLDGEN-UI-001)", 7 tests): strict schema↔defaults parity + `usePathBasedRivers` regression; `parseGenParamInput` semantics (percent, warn-not-clamp, NaN fallback); format/parse round-trip over all number entries; seam `applyGenParams` round-trip; #10 amplitude-0 via determinism + variance-collapse (the exact-formula variant needs `SPLINE_CONTINENTAL` on the seam — not exported; acceptable weaker form per the test brief); #11 via the string-level `buildChunkWorkerCode()` variant (live worker flood test would be seed-flaky without a known-ocean fixture); `WORLD_PRESETS` sanity.

**Verification:** syntax-check GREEN; parity-check GREEN (all P1–P9, WORLD_DIMS literal equality intact); terrain-node-checks ALL HARD CHECKS GREEN on seeds 12345/777/424242 with output identical to pre-edit (default-param terrain byte-identical despite Phase D); CRLF integrity confirmed on both edited files (CR count == LF count). **NOT yet run:** `tools/run-browser-tests.mjs` (no Chromium available in the sandbox within the 45s bash cap) — run locally before commit. **In-game gates outstanding:** create-world panel desktop + touch eyeball; editor over localhost (incl. per-pixel seam-call render performance at 1024px quality — flagged risk); Archipelago floods to preview level (#11); amplitude 0% = fractal-flat with gently varying continental baseline (#10 — expected, not a bug); spawn (500, −300) placement (#13).

**Environment incident (recorded for §7):** the tests agent hit the documented near-EOF mount truncation on `tools/voxex-tests.html` after an Edit; `syntax-check` caught it and the agent recovered via the documented truncate-and-append-CRLF-tail procedure. voxEx.html itself stayed coherent throughout.

**Docs updated in the same change:** CLAUDE.md (World Creation System rewritten; Lockstep Registry WORLD_DIMS row seaLevel-override note; repo tree entry for the editor; Config search patterns) and `docs/agent-notes.md` §3 (wiring lesson: "a live getter + worker bake proves nothing about a knob being wired — trace the WRITER"; `applyGenParams` partial-object caution; schema registry note).

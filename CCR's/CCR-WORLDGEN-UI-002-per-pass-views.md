# CCR-WORLDGEN-UI-002: Per-pass terrain views in the terrain parameter editor

> **Status: IMPLEMENTED (Phases 1–3) · STAYS in `CCR's/` (do NOT move to `Finished/`)** — DRAFT → AUDITED → IMPLEMENTED.
> Phase 1 (voxEx.html seam + debug hook), Phase 2 (pass selector + generic per-pass renderer +
> panel filter), and Phase 3 (diff view, A/B toggle, commit-time filmstrip) are all SHIPPED in
> `tools/terrain-parameter-editor.html`. **Phase 4 remains DEFERRED** (real material-cascade view),
> and Phase-D/E-style polish follow-ups are still possible, so per the CLAUDE.md CCR convention this
> doc stays under `CCR's/` until Phase 4 lands or is formally dropped.
> **ID**: VOXEX-CCR-WORLDGEN-UI-002 · **Build baseline**: 2026-07-14.3 (implemented at 2026-07-15.1) · **Author**: agent (delegated)
> **Independent gate (reconcile session, 2026-07-15):** coherence + static + headless CDP functional
> re-check + full browser suite ALL GREEN — see the "Independent verification" block at the end of the As-built.

## Problem / Why

`tools/terrain-parameter-editor.html` only renders **composite** views of the terrain:
the heightmap (the fully-composed `blendedHeight` — or `terrainSurface` via the pre-carve
checkbox), the biome map, an approximated material map, and a combined material render.
There is no way to see what any **single pass** of the generation pipeline contributes, or
how a given tunable affects **only** that pass.

Concretely, someone tuning:

- a **climate field** (temperature / humidity / continentalness / erosion / peaks-valleys /
  relief) cannot see that field in isolation — only its downstream effect on the fully-composed
  height, where it is entangled with every other field and the fractal;
- the **base-surface fractal** (`terrainSurface`'s internal `base`/`amplitude`/`hf`/`warp`
  components) cannot see any of those intermediate scalars at all — they are function-local and
  never leave `terrainSurface`;
- the **ocean blend** or **river carve** cannot see the height *before* that pass versus *after*,
  so it is impossible to visually attribute a change to the carve rather than to the surface it
  carves into.

Tuning any single pass is therefore **blind** — the editor shows only the end product, and the
intermediate scalars that the pass math actually keys off are invisible.

## Approach

Add a **data-driven `PASS_REGISTRY`** to the editor (Phase 2). A **pass selector** replaces the
current four mode buttons; the legacy modes fold in as passes so nothing is lost:

- `heightmap` → the `carved` pass (final `blendedHeight`) **plus** the new `surface` pass
  (pre-carve `terrainSurface`); the old "pre-carve" checkbox is **removed** and replaced by the
  `surface` pass being a first-class selectable view.
- `biome` → the `biome` pass.
- `map` → the `material_map` pass.
- `combined` → the `material_combined` pass.

Each pass declares which existing editor sections it is relevant to, so the panel **filters**
to show only the sections that affect the selected pass (with a "Show all params" escape
checkbox). Phase 3 adds a **per-pass diff view** (a diverging color ramp of the pass versus the
*composed result before that pass*), an **A/B cached-grid toggle**, and a **96px commit-time
filmstrip** of recent renders.

**All controls are EXISTING `GEN_TUNABLES` / `GEN_PARAM_SCHEMA` entries** — this CCR adds **no new
terrain math**. `TERRAIN_GEN_VERSION` is explicitly **NOT** bumped: terrain output is byte-identical.

The only voxEx.html changes (Phase 1) are: two test-seam exports and one optional, zero-cost
debug out-param on `terrainSurface`. Everything else lives in `terrain-parameter-editor.html`
and delegates to the game's own functions through the `?test=1` seam — no duplicated terrain math.

### Rejected alternative — a separate `terrainSurfaceDebug()` wrapper

The obvious alternative to the `outDbg` out-param is a separate `terrainSurfaceDebug()` function
that re-runs the surface math with instrumentation and returns the intermediate scalars. **Rejected**:
it duplicates the surface math, which is a **single-source violation** (the same class of bug the
Lockstep Registry exists to prevent — the wrapper and the real `terrainSurface` would drift, and
the debug view would silently lie about what the game actually generates). The **out-param on the
real function is the house idiom** for exactly this — it mirrors the reusable scratch out-objects
already used in hot terrain paths (`_nd2`/`_fd2`/`_ed2`) and `applyRiverCarve`'s `_riverFlowScratch`
flow-accumulation out-param. The debug values come from the *one* real computation, guarded so the
common (no-arg) call path is byte-identical and allocation-free. → do-not-retry: the `*Debug()`
re-implementation wrapper.

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry (2026-07-14.3 → **2026-07-15.1**, cites this CCR)
- `TERRAIN_GEN_VERSION`: **NO** — terrain output is byte-identical (the `outDbg` block is skipped
  entirely when the arg is omitted, which every production/worker call site does; the seam exports
  add no call sites). The worker↔main `blendedHeight` byte-parity browser test is the proof.
- `CURRENT_CACHE_VERSION`: **NO**
- `SETTINGS_VERSION`: **NO**

## Changes

### Phase 1 (this change — voxEx.html only)

#### #1 — test-seam exports of `computePreRiverHeight` + `applyRiverCarve`

**Location:** grep `getBiomeHeightAtCell, blendedHeight, getPreRiverHeight,` inside the
`window.VoxEx = {` object near the end of `voxEx.html`.
**Why:** the editor's `preRiver` and `carved`/diff passes need the real ocean-blend pre-river
height and the real river-carve function, not a re-implementation.

**Before:**
```js
                    getBiomeHeightAtCell, blendedHeight, getPreRiverHeight,
                    getRiverFactor, getOceanFactor, getOceanDepth,
```

**After:**
```js
                    getBiomeHeightAtCell, blendedHeight, getPreRiverHeight,
                    // CCR-WORLDGEN-UI-002 Phase 1: exported for the terrain editor's per-pass views
                    computePreRiverHeight, applyRiverCarve,
                    getRiverFactor, getOceanFactor, getOceanDepth,
```

**Verify:** `window.VoxEx.computePreRiverHeight` and `window.VoxEx.applyRiverCarve` are functions
under `?test=1`. Both are shorthand exports matching the object's existing style. Touches ONLY the
`window.VoxEx` object — not any injected/worker code.

#### #2 — `terrainSurface` optional `outDbg` out-param

**Location:** grep `function terrainSurface(gx, gz)` in `voxEx.html`.
**Why:** the `surface` sub-views (`surface.base`/`.amplitude`/`.hf`/`.warpMag`) need the
function-local intermediate scalars, which otherwise never leave the function. An out-param on the
real function gives the debug view the *one* real computation (no duplicate math).

**Before (signature + tail):**
```js
            function terrainSurface(gx, gz) {
                ...
                const dHf = hf - HF_PIVOT;
                return base + lift + (dHf >= 0 ? dHf : dHf * VALLEY_RATIO) * amplitude;
            }
```

**After:**
```js
            function terrainSurface(gx, gz, outDbg) {
                ...
                const dHf = hf - HF_PIVOT;
                const surf = base + lift + (dHf >= 0 ? dHf : dHf * VALLEY_RATIO) * amplitude;
                if (outDbg) {
                    outDbg.base = base; outDbg.relief = relief; outDbg.amplitude = amplitude;
                    outDbg.lift = lift; outDbg.hf = hf; outDbg.ridgeMix = ridgeMix; outDbg.gain = gain;
                    outDbg.warpAmp = warpAmp; outDbg.warpMag = Math.hypot(wx - gx, wz - gz);
                    outDbg.surface = surf;
                }
                return surf;
            }
```
JSDoc gains an `@param {Object} [outDbg]` line documenting the component set and that `warpMag` is
the domain-warp displacement magnitude (distance between the warped sample coords `wx`/`wz` and the
incoming `gx`/`gz`).

**AUDIT NOTE (byte-identity):** the return expression is moved verbatim into `const surf`, and the
whole `outDbg` block is inside `if (outDbg)`. Omitting the third arg (every production + worker call
site) runs exactly the pre-CCR code path with one extra `const` binding — no behavior change. The
`warpMag` semantics are honest to the live function: `gx`/`gz` may already carry the (default-off)
TERRACE_WARP displacement by the time `wx`/`wz` are derived, so `wx-gx` is specifically the **domain-warp**
offset (`noise2D(...)*warpAmp`), which is what the JSDoc states.

**Verify:** `node tools/syntax-check.mjs` + `node tools/parity-check.mjs` GREEN;
`terrain-node-checks` GREEN on ≥3 seeds; the browser suite's worker↔main `blendedHeight`
byte-parity test GREEN (proves output byte-identity through the injected worker copy).

### Phase 2 (DRAFT — terrain-parameter-editor.html)

- **#3 pass selector** — replaces the 4 mode buttons; drives all rendering off `PASS_REGISTRY`.
- **#4 generic `renderField` scalar renderer** — a single renderer that samples any scalar sampler
  over the grid and colorizes it with the pass's declared ramp (unitGray / signedGray / hypso /
  auto-ranged variants).
- **#5 panel filter** — show only the sections a pass declares; "Show all params" checkbox escape.

### Phase 3 (DRAFT — terrain-parameter-editor.html)

- **#6 diff / A-B** — per-pass diff (diverging ramp vs. the composed result *before* that pass);
  A/B cached-grid toggle.
- **#7 filmstrip** — 96px commit-time filmstrip of recent renders.

### Phase 4 (DEFERRED — real material-cascade view)

A true per-column material render (grass/stone/sand/snow/... exactly as generated), replacing the
editor's current *approximation*. **Design sketch:** export `generateTerrainPass` +
`precalculateTerrainCaches` + a small per-column driver on the seam; render at chunk granularity
(the cascade needs the per-chunk caches). **DEFERRED because** `generateTerrainPass` is **injected**
(worker single-source) and its material cascade is **lockstep-mirrored** with `isTreeSoilSurface` —
exposing/driving it requires the full parity-gate treatment (parity-check + worker byte-parity +
the `isTreeSoilSurface` mirror review), which is out of scope for a UI-only CCR. Track as a
follow-up if the approximated map proves insufficient for material tuning.

## Pass registry (spec for Phase 2's implementer)

Grouped passes. `sampler` names are `window.VoxEx` (`VX`) members. `before` is the pass whose
composed result the diff view (Phase 3) compares against (`null` = no diff baseline). `sections`
are the editor section titles the panel filter keeps for that pass.

### Climate fields — cost: cheap · before: `null` · sections: `['Climate Fields','Biomes']` (except `relief`)

| Pass | sampler | ramp |
|---|---|---|
| `temperature` | `VX.temperature` | unitGray 0..1 |
| `humidity` | `VX.humidity` | unitGray 0..1 |
| `continentalness` | `VX.continentalness` | signedGray −1..1 |
| `erosion` | `VX.erosionParam` | signedGray −1..1 |
| `peaksValleys` | `VX.peaksValleys` | signedGray −1..1 |
| `relief` | `VX.reliefParam` | unitGray 0..1 · sections `['Splines','Biome Classification','Climate Fields']` |

### Base surface — cost: medium · sections: `['Relief & Peaks','Fractal Detail','Domain Warp','Terrain Shape']`

| Pass | sampler | ramp | before |
|---|---|---|---|
| `surface` | `VX.terrainSurface` | hypso | `null` |
| `surface.base` | `VX.terrainSurface(wx,wz,dbg)` → `dbg.base` | hypso | — |
| `surface.amplitude` | `dbg.amplitude` | unitGray-auto | — |
| `surface.hf` | `dbg.hf` | unitGray | — |
| `surface.warpMag` | `dbg.warpMag` | unitGray-auto | — |

(The `surface.*` sub-views call `VX.terrainSurface(wx, wz, dbg)` with a reused `dbg` out-object and
read the named component — the CCR #2 hook.)

### Composition — cost: expensive

| Pass | sampler | ramp | before | sections |
|---|---|---|---|---|
| `preRiver` | `VX.computePreRiverHeight(...).height` | hypso | `terrainSurface` | `['Oceans','Coastal Erosion','Terrain Shape']` |
| `oceanFactor` | `VX.getOceanFactor` | unitGray | — | `['Oceans','Coastal Erosion']` |
| `riverFactor` | `VX.riverFactorAt` | unitGray | — | `['Rivers']` |
| `carved` | `VX.blendedHeight` | hypso | `computePreRiverHeight().height` | `['Rivers','Coastal Erosion']` |

### Classification / material — cost: bespoke (`renderFn`, not `renderField`)

| Pass | renderFn | sections |
|---|---|---|
| `biome` | `renderBiomeMap` | `['Biomes','Biome Classification','Climate Fields']` |
| `featureAt` | placeholder: flat mid-gray + caption "featureAt is an inert stub (returns 0) — placeholder view" | `[]` |
| `material_map` | `renderMap` | `['Biomes','Coastal Erosion']` |
| `material_combined` | `renderCombined` | `['Biomes','Coastal Erosion']` |

## Worker parity

- `terrainSurface` (#2) is **injected** via `Function.toString()` between the `__TERRAIN_FUNCS__`
  markers — edit the **main-thread source only**; the worker copy is regenerated. Worker call sites
  pass 2 args, so `outDbg` is `undefined` off-thread and the debug block never runs. **parity-check
  P7 (marker integrity) unaffected**; the worker byte-parity test proves output identity.
- `computePreRiverHeight` / `applyRiverCarve` (#1) are added ONLY to the `window.VoxEx` seam object —
  **not injected, not hand-maintained copies** — so no lockstep obligation.
- No hand-maintained copy (GRAD2D, WORLD_DIMS, BIOME_CONFIG, etc.) is touched.

## Safety Checks

- [x] `node tools/parity-check.mjs` GREEN
- [x] `node tools/syntax-check.mjs` GREEN
- [x] Terrain touched (hook only, output-neutral)? `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds
- [x] `tools/voxex-tests.html` over localhost — no regressions (headless `run-browser-tests.mjs`: **405/405 GREEN** at reconcile, 2026-07-15)
- [x] No duplicate/shadowed identifiers (`outDbg`/`surf` are new locals; seam adds two existing function names as exports)
- [x] New settings: none added
- [x] No unbatched per-frame work added
- [x] Version constants bumped per "Version impact" (VOXEX_BUILD only)
- [x] CLAUDE.md / docs/agent-notes.md updated — done at reconcile (2026-07-15): CLAUDE.md Repository-Structure `terrain-parameter-editor.html` entry now cites the per-pass views; agent-notes §3 gained a "Terrain parameter editor — per-pass views" subsection (outDbg idiom + seam exports + "editor holds no hand-copied terrain math"); §1 do-not-retry ledger gained the rejected `terrainSurfaceDebug()` wrapper row.

## As-built

### Phase 1 (implemented, build 2026-07-15.1)

<!-- Fill/confirm during reconcile. Initial record: -->
- Edits applied exactly as speced. All `terrainSurface` locals named in the spec
  (`base`/`relief`/`amplitude`/`lift`/`hf`/`ridgeMix`/`gain`/`warpAmp`/`wx`/`wz`/`dHf`) exist in the
  live function; `wx`/`wz` are the domain-warped sample coords derived from the (possibly
  TERRACE_WARP-displaced, default-off) `gx`/`gz`, so `warpMag = Math.hypot(wx-gx, wz-gz)` is the
  domain-warp displacement magnitude (documented as such in the JSDoc).
- The live `terrainSurface` had a TERRACE_WARP guard block at the top (WS1, default-off `TERRACE_WARP_AMP===0`)
  that can reassign `gx`/`gz` before `wx`/`wz` are derived — noted in the JSDoc/audit so `warpMag`'s
  meaning is unambiguous. No existing computation reordered; the return expression is character-identical
  inside `const surf`.
- Gate results (confirmed at reconcile, 2026-07-15): `node tools/syntax-check.mjs` GREEN
  (importmap + classic + 48 777-line module all parse); `node tools/parity-check.mjs` GREEN
  (P7 marker integrity intact — `terrainSurface` still injected single-source); full browser suite
  405/405 GREEN (worker↔main `blendedHeight` byte-parity among them — proves the `outDbg` block is
  output-neutral off-thread). Live source confirms `function terrainSurface(gx, gz, outDbg)`
  (voxEx.html ~L41059) with the guarded `outDbg.warpMag = Math.hypot(wx - gx, wz - gz)` block
  (~L41235), and the two seam exports `computePreRiverHeight, applyRiverCarve` in `window.VoxEx`
  (~L52821). Under `?test=1` both are functions and `terrainSurface(x,z)` === `terrainSurface(x,z,{})`.

### Phase 2 (implemented — `tools/terrain-parameter-editor.html` only; recorded at reconcile)

No voxEx.html changes (Phase 1's seam already covered the data). Single-source preserved — every
sample routes through `VX.*`; no terrain math was added to the editor.

- **#3 pass selector (`PASS_REGISTRY` + grouped selector).** A data-driven `PASS_REGISTRY` (19
  entries) replaces the old four mode buttons. Each entry declares `id`/`group`/`sampler`-or-
  `dbgField`-or-`renderFn`/`ramp`/`domain`/`before`/`sections`/`cost`/`caption`. `buildPassSelector`
  emits one labeled button-row per `PASS_GROUPS` group (Climate fields / Base surface / Composition /
  Classification & material); `renderer.setPass(id)` is the single entry point (used by the selector,
  the filmstrip, and legacy-mode autosave migration via `LEGACY_MODE_TO_PASS`). `DEFAULT_PASS_ID =
  'carved'` preserves the old default Heightmap-carved view; the old pre-carve checkbox is gone —
  `surface` is now a first-class pass.
- **#4 generic `renderField` scalar renderer.** One method samples any pass's scalar over the grid
  (dispatching `sampler` / `dbgField`-via-`terrainSurface(wx,wz,dbg)` / placeholder), auto-ranges or
  uses the pass's declared `domain`, and colorizes through `rampColor` (unitGray / signedGray / hypso /
  placeholder). The `surface.*` sub-views read the CCR #2 `outDbg` scratch — no re-implemented math.
  Bespoke passes (`biome`/`material_map`/`material_combined`) still use their verbatim legacy
  `renderFn`s.
- **#5 panel filter + "Show all params".** `applyPassFilter(pass)` shows only the sections a pass
  declares (`pass.sections`, matched by title against BOTH the gen-param section map `paramSectionEls`
  AND the Advanced-Tunables map `tunableSectionEls`) and hides the rest; the Seed section is built
  outside the registries so it always stays visible. A "Show all params" header checkbox
  (`showAllParams`, persisted in autosave, never pushes history) bypasses the filter entirely.

### Phase 3 (implemented — `tools/terrain-parameter-editor.html` only)

All three features shipped; no voxEx.html changes (Phase 1's seam exports already covered the
data needs). Single-source preserved — every sample still goes through `VX.*`; no terrain math
was added to the editor.

**F1 — Difference view (#6).** A "Diff" toggle button in the preview toolbar, `disabled` unless the
active pass declares a non-null `before` (generic — reads the baseline entirely from
`PASS_BY_ID[pass.before]`, so `carved` (before `preRiver`) and `preRiver` (before `surface`) light
up today and any future `before`-bearing pass gets a diff for free). `PreviewRenderer.renderDiff(pass)`
samples BOTH the active pass and its baseline over the view grid via a shared `_sampleField(pass, wx, wz)`
helper (dispatches sampler / `dbgField` / 0), computes `delta = after − before`, and colorizes through
a module-scope `divergingColor(delta, maxAbs)` ramp symmetric around `max(|delta|)`: red = removed
(negative), near-white = unchanged (~0), blue = added (positive). The legend becomes a diverging
red→white→blue bar labeled `−m / 0 / +m` with a `Δ` header (`drawDiffLegend`), and the caption is
written generically from the registry: `Δ vs <before.label> — red = removed, blue = added`. Diff state
is per-session on the renderer (`diffMode`); it is NOT pushed to history and (deviation, see below) is
NOT persisted to autosave.

**F2 — A/B toggle (#6).** An "A/B" button next to Diff (same `before` enablement). `renderAB(pass)`
renders the active ("after") pass and its `before` pass to full-quality `ImageData` caches
(`_abImageA` / `_abImageB`) and blits the selected one; `flipAB()` swaps the displayed cache via a
single `putImageData` — measured **0.7 ms** headless, no resampling. The caches are rebuilt on every
`render()` (param/pan/zoom/quality/pass change) and cleared whenever a normal render runs, so a flip
can never show a stale grid. A DOM chip (`#ab-indicator`) shows `A (after: <label>)` / `B (before:
<label>)`. Flip affordances: the **'b' key while the pointer is over the canvas** (CCR-sanctioned;
gated on a `pointerOverCanvas` flag set by canvas mouseenter/leave, and skipped while typing in an
input/textarea) AND the **A/B button itself** via a 3-state cycle (1st click → enter, cache both, show
A; 2nd click → flip to B; 3rd click → exit A/B). Diff and A/B are mutually exclusive (turning one on
turns the other off + clears the A/B cache).

**F3 — Thumbnail filmstrip (#7).** A horizontal `#filmstrip-track` strip below the main canvas with one
clickable, labeled 96 px `<canvas>` thumbnail per PASS_REGISTRY entry (all 19), plus a "↻" manual
rebuild button. `buildFilmstrip()` builds the DOM once (with a per-tile loading overlay); clicking a
tile calls `renderer.setPass(id)` and syncs the top pass-selector highlight. Thumbnails are REAL for
every pass — including the bespoke `renderBiomeMap`/`renderMap`/`renderCombined` — via `_renderThumb`,
which temporarily swaps the renderer's `canvas`/`ctx`/`zoom` to the thumb (matched so each tile shows
the same world extent as the main view) and dispatches the pass's normal render method; a `_thumbMode`
flag suppresses the legend/caption chrome that would overflow a 96 px tile. This is the CCR's
"temporarily drive the existing method at small size" fallback, chosen over a separate thumbnail
renderer because it gives real thumbs for all 19 passes with zero duplicated sampling code (the
`material_map`/`material_combined`/`biome` placeholder path was NOT needed). Cost control: `rebuildFilmstrip()`
queues passes cheap-first (by `pass.cost`) and drains one thumb per `requestAnimationFrame` so the UI
never blocks; each tile shows its loading state until rendered. Rebuild triggers: boot (first commit),
`commitParamsChange`, `afterTunablesChanged`, `resetTunables`, `handleSeedChange` — all via a 150 ms-
debounced `scheduleFilmstripRebuild()` (the settled points), plus the manual ↻. A per-keystroke `input`
event does NOT rebuild (verified); a committed `change` on a gen-param/tunable does.

**Deviations (honest):**
- **Diff/A-B state is NOT persisted** to autosave (the CCR made persistence optional). Simpler and
  avoids an extra autosave key; each session starts with both off.
- **The A/B button is a 3-state cycle** (off → show A → flip B → off) rather than a pure on/off toggle,
  so the button itself performs the flip (honoring the CCR's "the A/B button ... flips" wording) while
  still giving an explicit off. The 'b' key is an additional direct A↔B flip that never cycles to off.
- Filmstrip thumbs reflect the main view's center/zoom at the last rebuild (a "commit-time" feature per
  the CCR title); panning/zooming the main view does not auto-rebuild them — the ↻ button refreshes on
  demand. Considered acceptable, not a bug.

**Gate results (this session):**
- `node tools/syntax-check.mjs` — GREEN (voxEx.html untouched: importmap + classic + 48 777-line module all parse).
- Extracted editor inline script `node --check` — OK (3 042-line script).
- Headless CDP smoke (Chromium, localhost, seed "VoxEx") — **22/22 checks PASS**: Diff enable/disable by
  `before`, diverging render (near-white zeros + red carved channels; pixel signs match `VX.blendedHeight −
  VX.computePreRiverHeight().height` at 46/49 sampled points — the 3 "misses" are small |Δ|≈3 pixels
  correctly rendered near-white under the symmetric ramp); A/B instant flip 0.7 ms, distinct cached image,
  exact flip-back, indicator + 3-state cycle + mutual exclusivity; filmstrip 19 labeled real thumbs,
  progressive non-blocking fill, click-to-select, ↻ rebuild, keystroke-no-rebuild vs commit-rebuild; **zero
  JS exceptions** (the only 404 is `favicon.ico`, pre-existing/benign). Screenshots: `p3_diff_carved.png`,
  `p3_editor_filmstrip.png`.
- Sandbox note: this session hit the §7 mount-truncation issue repeatedly on the large editor file; the
  final file was restored to coherence via the documented truncate-and-append recovery (byte-correct mount
  prefix + authoritative tail from the Read tool), verified via `node --check` + unique-token counts.

### Phase 4 — DEFERRED (design sketch above; not implemented)

### Independent verification (reconcile session, 2026-07-15 — trust-nothing re-check)

Run by the final gate agent against the live tree (voxEx.html build 2026-07-15.1), NOT the
implementer's own report.

- **Coherence (§7 mount-vs-Read):** editor 177 827 bytes / 4247 lines, CR count 0 (LF file, correct),
  `</html>` tail intact; distinctive-token counts match between the bash mount and the Read tool
  (`renderDiff` 2, `flipAB` 4, `rebuildFilmstrip` 4, `divergingColor` 3, `PASS_REGISTRY` 19).
- **Static:** editor inline script extracted + `node --check` OK; `node tools/syntax-check.mjs` GREEN;
  `node tools/parity-check.mjs` GREEN (all P1–P9, marker integrity intact).
- **Headless CDP functional (Chromium, localhost, seed default):** 14/14 substantive checks PASS,
  zero JS exceptions/console.errors. Highlights: seam exports present + `terrainSurface` 3-arg
  byte-identical; **Diff on `carved` — all significant FIELD pixels EXACTLY equal
  `divergingColor(VX.blendedHeight − VX.computePreRiverHeight().height, globalMaxAbs)`** (41/41 exact
  colour match after masking out the legend/caption chrome; the diff view had to be relocated onto a
  carved region first because the default view sat in a no-river area — a probe detail, not a defect);
  Diff button disabled on `temperature` / enabled on `carved`; A/B flips to a DISTINCT cached image
  and back to a byte-EXACT original; filmstrip 19 labeled thumbs, click-selects, a per-keystroke
  `input` does NOT rebuild while `commitParamsChange` DOES; Phase-2 regression (pass-selector button,
  per-pass panel filter hiding non-listed sections, "Show all params" revealing them, undo/redo of a
  live tunable change, `{genParams, tunables}` export shape) all green.
- **Authoritative suite:** `node tools/run-browser-tests.mjs` — **405/405 GREEN** (voxEx.html no-regression).
- **As-built spot-check:** 3/3 claims verified in live source (seam exports ~L52821; `terrainSurface(gx,
  gz, outDbg)` ~L41059 + guarded `warpMag` ~L41235; filmstrip 19 thumbs + keystroke/commit behaviour).
  Gap found and fixed during reconcile: the Phase 2 As-built section was empty (now filled above) and
  the Phase 1 gate line was a placeholder (now recorded).

Verdict: **Phases 1–3 verified as-built.** Phase 4 correctly deferred; doc stays in `CCR's/`.

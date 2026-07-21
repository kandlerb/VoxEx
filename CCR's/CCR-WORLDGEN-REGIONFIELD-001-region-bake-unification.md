# CCR-WORLDGEN-REGIONFIELD-001: Unify the region-bake tier (RegionField) + talus Δh raster

> **Status: IMPLEMENTED** (2026-07-21, build `2026-07-21.1`) — all 3 phases landed byte-identical/flag-ON-additive; full gate stack green (see `## As-built`). Owner-pending before move to `Finished/`: browser worker-parity suite + editor eyeball + git commit. DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-WORLDGEN-REGIONFIELD-001 · **Build baseline**: 2026-07-18.2 · **Author**: agent (for Kandler)
> This is the "CCR-1" referenced in `docs/terrain-process-prototypes.md`.

## Resolved decisions & pre-change gate (owner, 2026-07-20)

1. **Venue = on-computer Cowork** — chosen because the cloud bridge dropped ~5× during drafting. *Implementation-environment note (verified 2026-07-20):* the session executing this CCR is actually running in the **cloud sandbox reaching the repo via the `remote-devices` bridge** (`pwd`=/home/claude; no native `D:\Projects\voxex` mount; prior-turn `/tmp/vox` cloud copy persists), **not** natively. So Risk R6 (CRLF / stage→edit→commit-back care) applies in full; `voxEx.html` is edited on a staged copy and written back via `device_commit_files`. Surfaced to the owner before any surgery.
2. **Talus reach = NARROW (R5 resolved):** the talus Δh raster relaxes **only over-steep macro slopes (post-erosion slope > repose threshold)**, on the `tectonicPlates===true` path only. Not a broad relaxation pass; not deferred.
3. **Fingerprint (resolved):** the historical token `22815f15…2de0` is **NOT reproducible** (CCR-002 script never preserved; grid/serialization unrecorded) → **do-not-retry**. Live byte-identity gates: (a) `tools/scratch/regionfield_baseline.mjs` before/after equality, and (b) a new durable **`tools/flagoff-fingerprint.mjs`** (shipped this CCR; documented sha256 grid).

**Pre-change gate values** (captured against `voxEx.html`@2026-07-18.2, seeds 1337/42/9001):
- flag-OFF `regionfield_baseline.mjs` blendedHeight: `bc6d07f4` / `4393b103` / `7265877d`; flag-ON dh/flow in `regionfield-baseline.json`.
- flag-OFF `flagoff-fingerprint.mjs` token: **`7487c1955a87ca7ec38170335303e4e90f6ee78495a47f1c6219466b086b3e46`** (grid origin −2048, step 64, N=64; config tectonicPlates OFF / hydroRivers ON; 141,917 serialized bytes; determinism confirmed).
- **Phases 1–2 must reproduce ALL of the above exactly.** Phase 3 leaves the flag-OFF values identical and changes only flag-ON output.

## Problem / Why

VoxEx already ships the hard architecture the terrain-process overhaul needs — a **region-bake pattern** (seeded, halo-bounded, cached, bilinear-sampled) — but as **two bespoke, independently hand-rolled caches** with duplicated scaffolding:

- **Orogen erosion bake**: `buildOrogenRegion` (grep `function buildOrogenRegion`) + cache `_orogenRegionCache` / cap `OROGEN_REGION_CACHE_CAP = 12` / recursion guard `_orogenBaking`, with the cache lookup/evict/bake/set dance inlined in `tectonicErosionAt` (grep `function tectonicErosionAt`) and `tectonicRiverFactor`.
- **Hydro drainage bake**: `buildHydroRegion` (grep `function buildHydroRegion`) + `hydroRegionCache` / cap `HYDRO_REGION_CACHE_CAP = 64`, with the lookup inlined in `riverFactorAt` (grep `function riverFactorAt`).

Each re-implements the same five concerns — a region-key → cache Map, an eviction cap, a first-demand bake, a halo, a beltless/cheap-skip pre-scan, and (orogen) a recursion guard. The `docs/terrain-process-prototypes.md` measurements make the case for consolidating and extending them:

- **Prototype A (GO):** a multi-raster bake is **1.010× a single bake** (measured; climate 72 ms + sediment 22 ms on a ~9.6 s/512² bake). The one real waste — baking a flow-derived raster independently re-runs flow accumulation = **1.98×** — is exactly what a shared field avoids. `OROGEN_REGION 8192` is an exact **8×** `HYDRO_REGION 1024` with **no straddling**, so the tiers already compose cleanly.
- **Design C:** the talus/angle-of-repose relaxation should be a **RegionField output Δh raster, bilinear-sampled in the pure height chain exactly like `tectonicErosionAt`.** The deferred block-mutating alternative was rejected (it desyncs cross-chunk tree `groundY` and `heightPad` borders — see the ledger).

**Duplication cost is real but the primary driver is forward capability:** CCR-2 (lithology) and future rasters (sediment, real rain-shadow climate) need a single, disciplined place to add a raster with correct halo/determinism/pre-scan, instead of a third and fourth bespoke cache.

**Structural fact that shapes this CCR (verified):** the cache declarations exist in **two hand-maintained copies** — the main-thread module scope (grep `const _orogenRegionCache = new Map()`; also `const hydroRegionCache = new Map()`) **and** the worker-injection strings inside `buildChunkWorkerCode` (grep `injectedCode += '    const _orogenRegionCache`). This is the Lockstep Registry "hand-maintained copies" group. Any `RegionField` refactor is therefore surgery on the **worker-injection machinery**, and every new symbol must be declared identically on both sides.

## Approach

Introduce one **`RegionField`** abstraction: `{ regionSize, halo, cell, cap, evictPolicy, preScan(rx,rz,seed)→bool, bake(rx,rz,seed)→rasters|null, recursionGuard? }`, exposing `get(rx,rz,seed)` (key → cache lookup → evict-per-policy → guard → bake → set, caching `null` for skipped regions) and a `sample(field, gx, gz, seed, rasterName)` bilinear helper matching the current `tectonicErosionAt` domain-warp math. Port both existing caches onto it **with byte-identical output**, then add a **talus Δh raster** as a new orogen-field output, sampled by a new `tectonicTalusAt` beside `tectonicErosionAt` and added in `terrainSurface` **only on the `tectonicPlates===true` path** (so flag-OFF is untouched). Leave **declared-but-empty sockets** for future `sediment` and `climate` rasters (do not populate them).

**Byte-identity rests on one invariant:** the region caches are **pure memoization of deterministic bakes** — output bytes depend only on the bake body + key, never on the cache/eviction machinery. So a caching refactor cannot change output *as long as the bake bodies and key computation are kept character-for-character identical.* That is the design rule for Phases 1–2.

**Rejected alternatives** (→ `agent-notes.md §1` after implementation):
- *Deferred block-mutating talus pass* — desyncs cross-chunk tree `groundY` (pure `blendedHeight`, ±6 slack) and `heightPad` border agreement → seams. (Prototype/Design C ledger candidate #4.)
- *Adding a climate raster in this CCR* — the 72 ms figure was a **stand-in**; real orographic rain-shadow is unmeasured. **Leave a socket only.** (Verbatim from the prototypes doc.)
- *Folding hydro and orogen into a single shared bake grid* — rejected for this CCR: they run at different cells (orogen `EROSION_CELL 20`, hydro `HYDRO_STEP 32`) and region sizes; unify the *abstraction*, not the grid. (A shared grid is a possible future step, out of scope here.)

## Version impact

- `VOXEX_BUILD`: **bump** (grep `const VOXEX_BUILD` — currently `"2026-07-18.2"`) + a `VOXEX_RECENT_CHANGES` entry citing this CCR. (always)
- `TERRAIN_GEN_VERSION`: **NO** — recommended. Talus applies only inside `tectonicPlates===true` (like `tectonicErosionAt`), which defaults **OFF**; Phases 1–2 are byte-identical. This is the **CCR-002…006 precedent**, stated verbatim on the current `VOXEX_BUILD` line: *"no TERRAIN_GEN_VERSION bump — tectonicPlates default OFF; flag-OFF fingerprint verified identical."*
  - > **AUDIT FLAG (owner-reserved):** the default config is `tectonicPlates:false` **but `hydroRivers:true`**, so the flag-OFF gate (now `tools/flagoff-fingerprint.mjs` token `7487c195…b3e46` + `regionfield_baseline.mjs`; the historical `22815f15…2de0` is irreproducible → do-not-retry) covers the **hydro path**. If Phase 2's hydro port changes the default-path output *at all* (it must not), a TGV bump is required → **STOP and surface as an owner decision**. Byte-identity of the hydro port is therefore fingerprint-critical, not just nice-to-have.
- `CURRENT_CACHE_VERSION`: **NO** (no chunk cache format/lighting change).
- `SETTINGS_VERSION`: **NO** (no DEFAULTS change).

## Accepted scope (verbatim from `docs/terrain-process-prototypes.md`)

> "cell-20 talus is MACRO relaxation only; block-scale scree stays a per-column material treatment (NOT in this CCR)."

So the talus raster softens over-steep **macro** slopes (wider than ~60 blocks, the bake's resolution). Block-scale scree/talus aprons at cliff feet are **out of scope** and remain a per-column material treatment in the existing slope-analysis cascade.

## Phase plan & gates

Each phase is a self-contained edit batch with a byte-identity or visual gate; **run the full gate stack after every phase and paste raw output into the As-built.**

### Phase 1 — Extract `RegionField`; port the orogen bake onto it (byte-identical)

Define `RegionField` (main-thread + worker-injection string). Replace the inlined orogen cache dance in `tectonicErosionAt`/`tectonicRiverFactor` with `orogenField.get(...)`; make `buildOrogenRegion` the field's `bake` callback and the 8×8 `rangeAmp>0.02` scan its `preScan`, `_orogenBaking` its `recursionGuard`. **Keep the numeric loop body verbatim.**
- **Gate:** `dh` + `flow` checksums identical before/after — bake-twice, seeds **1337/42/9001**, **both** flag states; flag-OFF fingerprint unchanged; `syntax-check` + `parity-check` green. No behavior knobs added.

### Phase 2 — Port `hydroRegionCache` onto `RegionField` (byte-identical, fingerprint-critical)

Same treatment for `buildHydroRegion`/`riverFactorAt`. Preserve the hydro field's **true-LRU** eviction (delete-on-hit; agent-notes §1 lesson) vs orogen's **clear-on-full** — expose as an `evictPolicy` param. *Eviction policy does not affect output bytes* (pure memoization), only cache hit-rate, so byte-identity holds regardless — but the bake body and key must stay verbatim. Declare (do not populate) empty `sediment` / `climate` raster sockets on the field.
- **Gate:** same byte-identical gate as Phase 1, **including the default (hydroRivers-ON) path** = the fingerprint path. Any diff → STOP (see AUDIT FLAG).

### Phase 3 — Talus Δh raster + sampler (flag-ON only)

Add a **standalone** angle-of-repose relaxation as a new orogen-field output `talusDh`, using the **same rule as the existing in-loop talus** (grep `EROSION_TALUS` / `EROSION_KT` inside `buildOrogenRegion`) but run as its own pass over the **post-erosion** surface and tracked as its own displacement field (NOT folded into `dh`). Add `tectonicTalusAt(gx,gz,seed)` beside `tectonicErosionAt` (identical domain-warp bilinear), and add its term in `terrainSurface` on the `tectonicPlates` path.
- > **DESIGN DECISION (owner-reserved — see Risk R5):** to avoid double-counting the talus already in `dh`, the new pass relaxes the **base+dh** surface with a threshold **≥ `EROSION_TALUS`**, so it only touches slopes the in-loop pass left over-steep. Recommended default: reuse `EROSION_TALUS` for the threshold and a small fixed sweep count (e.g. 3–5), tuned in a Node probe first. Confirm the intended reach (does it lightly re-relax belt interiors, or only non-belt over-steep slopes?).
- **Gate:** flag-OFF fingerprint identical; **flag-ON** `terrain-probe hillshade` before/after on 3 seeds (expect softened over-steep macro slopes, no new artifacts); **render a region-border-straddling crop** to prove no seam at region boundaries; bake-twice determinism including `talusDh`; **bake cost ratio ≤ 1.1× pre-CCR** (the raster derives from work the loop already does).

## Changes (per edit site — grep anchors, not line numbers)

> Sketches below show intent; exact Before/After snippets to be filled during implementation against the live file (the implementer must confirm the Before matches and reconcile any drift).

### #1 — Define `RegionField` (main-thread)
**Location:** grep `const _orogenRegionCache = new Map();` (module scope, near `getOceanFactor`) — declare `RegionField` just above the existing cache decls.
**Why:** one abstraction both fields instantiate.
**After (shape):** a small class/factory holding `{cache:Map, cap, evict, preScan, bake, guard}` with `get(rx,rz,seed)` reproducing the current lookup→evict→(guard)→bake→set, caching `null`.
**Verify:** `syntax-check` green; no duplicate identifier (grep the new name first).

### #2 — Define `RegionField` (worker-injection copy)
**Location:** grep `injectedCode += '    const _orogenRegionCache = new Map();'` inside `buildChunkWorkerCode`.
**Why:** Lockstep — the worker template hand-maintains these decls; the class must be emitted identically into the worker.
**AUDIT NOTE:** edit BOTH #1 and #2 in the same batch; `parity-check` after.

### #3 — Instantiate `orogenField`; rewire `tectonicErosionAt` / `tectonicRiverFactor`
**Location:** grep `function tectonicErosionAt` (the `_orogenRegionCache.get(key)` block) and the sibling in `tectonicRiverFactor`.
**Before:** inline `get / if size≥cap clear / bake / set`.
**After:** `const reg = orogenField.get(rx, rz, seed);` (guard + prescan + cache now inside the field). Sampling math unchanged.
**Verify:** Phase 1 byte-identical gate.

### #4 — Instantiate `hydroField`; rewire `riverFactorAt` (Phase 2)
**Location:** grep `function riverFactorAt` (the `hydroRegionCache` lookup).
**After:** `const reg = hydroField.get(rx, rz, seed);` preserving true-LRU via `evictPolicy`.
**Verify:** Phase 2 byte-identical gate (incl. default path).

### #5 — Talus raster output + `tectonicTalusAt` + `terrainSurface` term (Phase 3)
**Location:** inside `buildOrogenRegion` after the erosion loop (grep `EROSION_TALUS`); a new sampler beside grep `function tectonicErosionAt`; the tectonic-term addition in grep `function terrainSurface`.
**AUDIT FLAG:** the `terrainSurface` addition must sit on the same `tectonicPlates` gate as the existing `tectonicErosionAt` term so flag-OFF stays byte-identical.
**Verify:** Phase 3 visual + cost + fingerprint gates.

## Worker parity

- `RegionField` (class/factory), `orogenField`, `hydroField`, and `tectonicTalusAt` are all reachable from the injected terrain path → **injected**: edit the main-thread source AND the `buildChunkWorkerCode` injection strings (the hand-maintained decls at grep `injectedCode += '    const _orogenRegionCache`, and `tectonicTalusAt` joins the injected terrain-funcs list between the `__TERRAIN_FUNCS__` markers). `buildOrogenRegion`/`buildHydroRegion`/`tectonicErosionAt`/`riverFactorAt` are already injected — edit main-thread only, keep markers intact.
- Run `node tools/parity-check.mjs` after **every** edit batch. Note: the cache-decl copies are in the review-only lockstep group (parity-check covers the injected *functions*, not necessarily these bare decls) — so both copies must be edited by hand and eyeballed.

## Risk register

- **R1 — Two-copies lockstep.** New symbols must be declared identically main-thread + worker-injection string. *Mitigation:* edit both in one batch; parity-check; grep both copies for the new names.
- **R2 — Recursion guard timing.** `_orogenBaking` must be true exactly around the bake's `terrainSurface` H-init (else `tectonicErosionAt` recurses). *Mitigation:* the field's `get` sets/clears the guard with identical timing to the current `try/finally`; Phase 1 byte gate catches any drift.
- **R3 — `null` (beltless) caching.** The pre-scan skip returns `null`, which is cached and makes the sampler return 0. *Mitigation:* `get` must cache `null` (not treat it as "miss" and re-bake every call).
- **R4 — Hydro default-path byte-identity (fingerprint-critical).** `hydroRivers` defaults ON, so Phase 2 is on the fingerprint path. *Mitigation:* keep `buildHydroRegion` + key verbatim; gate on the fingerprint; STOP on any diff.
- **R5 — Talus double-count semantics (owner decision).** The in-loop talus is already in `dh`; the new raster must not re-apply the same displacement. *Mitigation:* relax the post-erosion surface with threshold ≥ `EROSION_TALUS`; confirm reach with owner; Node-probe before implementing.
- **R6 — Editing environment (Cowork cloud bridge).** `voxEx.html` is 3.7 MB, **CRLF**, and reached via the file-staging bridge, which dropped/recovered several times this session; agent-notes §7 documents mount truncation on large-file edits. *Mitigation:* stage → edit the cloud copy → after each write verify byte-count delta is sane, CRLF preserved (`tr -cd '\r' | wc -c` == `wc -l`), and `syntax-check` passes (catches near-EOF truncation) BEFORE committing back; never mix bash overwrites with Edit on the same file; **owner commits — never git-add**.
- **R7 — Browser worker-parity suite.** The Safety Checks require `tools/voxex-tests.html` (byte-parity suite) — **owed since CCR-002** and a deploy blocker. It runs headless in the sandbox (agent-notes §7 Chromium bootstrap, ~160 MB) but is most robust natively. Must be green before deploy regardless of venue.

## Safety Checks (run after every phase)

- [ ] `node tools/parity-check.mjs` GREEN
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] `node tools/terrain-node-checks.mjs` GREEN on seeds 1337 / 42 / 9001
- [ ] Byte-identity gate (Phases 1–2): `regionfield_baseline.mjs` flag-OFF blendedHeight `bc6d07f4`/`4393b103`/`7265877d` + flag-ON `dh`/`flow` identical before/after; **`flagoff-fingerprint.mjs` token `7487c195…b3e46` unchanged** (the `22815f15…` token is do-not-retry)
- [ ] `terrain-node-checks` green AFTER the `extract-terrain.mjs` update (BLOCKER 1) — gate harness must run before any checksum is trusted
- [ ] Non-byte gates: beltless/`null` region bakes exactly once; hydro delete-on-hit preserved (bake-count instrumentation)
- [ ] Phase 3: `dh`+`flow` checksums UNCHANGED vs Phase 2; `talusDh≈0` on ≤repose slopes; measured border seam ≤ `dh` budget; flag-ON hillshade before/after (3 seeds) + border-straddle crop; bake cost ≤ 1.1×; bake-twice determinism incl. `talusDh`
- [ ] `parity-check` P10 (RegionField/field construction identical across the 3 copies)
- [ ] Phase 3: flag-ON hillshade before/after (3 seeds) + border-straddle crop (no seam) + bake cost ≤ 1.1× + bake-twice determinism incl. `talusDh`
- [ ] `tools/voxex-tests.html` over localhost — no regressions (owed since CCR-002)
- [ ] No duplicate/shadowed identifiers (grep both copies before declaring)
- [ ] `VOXEX_BUILD` bumped + `VOXEX_RECENT_CHANGES` entry citing this CCR; `TERRAIN_GEN_VERSION` **not** bumped (confirm via AUDIT FLAG)
- [ ] Docs updated: `agent-notes.md §1` (4 ledger candidates from the prototypes doc), `§3` (RegionField pattern note); CLAUDE.md search patterns if any anchor name changed

## Docs to update in the same change (Todo #6)

Add to `agent-notes.md §1` (do-not-retry ledger), from `docs/terrain-process-prototypes.md`:
1. Independent sediment-energy bake re-runs flow accumulation (~1.98×) — derive from the erosion bake's `flow`.
2. Per-iteration hardness re-sampling in the erosion loop is worse-and-costlier than a surface scalar — use surface-scalar if hardness is ever added to the bake.
3. No voxel-scale benches/mesas from the cell-20 orogen bake (3×3 smoothing + cap suppress sub-60-block differential) — lithological terracing is a per-column pass (CCR-2).
4. A block-mutating slump in the NEIGHBOR_UPDATE window desyncs cross-chunk tree `groundY` + `heightPad` borders → seams — talus must be a pure-height raster (this CCR), not a deferred block mutation.

Note the **RegionField pattern** in `§3` (region key → seeded bake → halo'd multi-raster → bilinear sampler; both region tiers run on it).

## Audit (fresh independent review, 2026-07-20) — findings & resolution

A fresh skeptical reviewer audited this CCR against the live code, agent-notes §1/§3, and the prototypes doc. Verdict: **NEEDS-REVISION** (the byte-identity *thesis* is sound — bakes are pure/deterministic in `(rx,rz,seed)` so memoization can't move output bytes — but the *verification plan could not run as written*). All findings below are accepted and folded into the plan; the inline text of Approach/#5/R2/Safety-Checks is **superseded by these resolutions where they conflict**.

- **BLOCKER 1 — THIRD lockstep copy: `tools/lib/extract-terrain.mjs`.** The gate harness hand-declares `_orogenRegionCache`/`OROGEN_REGION_CACHE_CAP`/`_orogenBaking` and `hydroRegionCache`/`HYDRO_REGION_CACHE_CAP` as env stubs and extracts terrain funcs by name. After the refactor the extracted samplers reference `orogenField`/`hydroField`/`RegionField` as undefined free vars → `buildTerrainApi()` ReferenceErrors → **every** Node gate (`terrain-node-checks`, `regionfield_baseline`, `flagoff-fingerprint`) dies before it can compare. **Resolution:** add `extract-terrain.mjs` as **Change #6** — (a) extract `RegionField` by name (single-source; add a `class`/const extraction path — do NOT hand-stub a clone, that is the §1 line-34 `terrainSurfaceDebug` trap); (b) construct `orogenField`/`hydroField` **after** the FUNCS block (TDZ: env stubs run before extraction, so field construction must move below `buildOrogenRegion`/`buildHydroRegion`); (c) add `tectonicTalusAt` to the FUNCS list + return object. This edit is in the same batch and `terrain-node-checks` must be green before any checksum is trusted.
- **BLOCKER 2 — durable gate scripts.** `flagoff-fingerprint.mjs` ships as a **committed `tools/` tool** (done; pre-change token `7487c195…b3e46`). `regionfield_baseline.mjs` remains the scratch flag-ON dh/flow A/B harness; its `regionfield-baseline.json` is the recorded reference. Re-capture both from the committed scripts before Phase 1.
- **BLOCKER 3 — `voxex-tests.html`.** It exists on-device but is the CCR-002-owed deploy blocker and cannot be a per-phase gate in this environment. **Resolution:** downgrade it from per-phase to **deploy prerequisite**; add mechanical coverage for the new decls via parity **P10** (below).
- **SHOULD-FIX 4 — recursion guard (corrects R2).** `_orogenBaking` **STAYS a module-scope free variable** in all three copies; the sampler early-out (`if (_orogenBaking) return 0/1`) **stays at the top of `tectonicErosionAt`/`tectonicRiverFactor`, BEFORE `orogenField.get(...)`**; the write stays inside `buildOrogenRegion`'s verbatim body. `RegionField.get` **must not own or touch the guard** (if it did, H-init → `terrainSurface` → `tectonicErosionAt` → `get` (key not yet cached) → re-bake → infinite recursion). Drop `recursionGuard` from the `get` signature.
- **SHOULD-FIX 5 — Phase-3 insertion + dh-invariance (corrects #5).** "after the erosion loop" is BEFORE `flow`/`dh` are extracted (`flow`@grep `new Float32Array(N2)` post-loop; `dh`=`H−Hin`). Compute `talusDh` from a **copy** of the post-erosion surface, strictly **after** `dh`/`flow` are snapshotted, so `dh` is provably untouched. **New Phase-3 gate:** re-run the Phase-2 `dh`+`flow` checksums and assert **UNCHANGED** — isolating the entire Phase-3 delta to the additive `talusDh` term.
- **SHOULD-FIX 6 — talus fidelity.** `talusDh` is baked over the **same haloed grid** as `dh`, carries the **same center-weighted 3×3 smoothing** (D8 furrow-aliasing parity) and the **same interior-only border handling** as the in-loop pass; add a **numeric** gate asserting `talusDh ≈ 0` on cells with post-erosion slope ≤ `EROSION_TALUS`, plus a **measured** region-border seam ≤ the `dh` seam budget (§3: ≤0.8–2.0 blk) — not the visual crop alone.
- **SHOULD-FIX 7 — token fix.** Safety-Checks byte-identity line now cites `7487c195…b3e46` + the `bc6d07f4/4393b103/7265877d` triplet (the `22815f15…` token is do-not-retry).
- **SHOULD-FIX 8 — eviction/null blind spot.** The byte gate is **blind** to eviction-policy and `null`-cache regressions (pure-memoization ⇒ identical output). Audit **verified the live hydro cache is true-LRU** (delete-on-hit refresh + evict-oldest-on-insert; the *in-file comments* mislabeling it FIFO are stale) and orogen is clear-on-full. **New non-byte gate:** instrument bake-count and assert (a) a beltless/`null` region bakes exactly once across repeated samples (use `has()`/`=== undefined`, never falsy `if(!reg)`), and (b) hydro still delete-on-hit under a working-set > cap (would thrash under FIFO — §1 line-31 regression).
- **NIT 9 — exact predicate.** The `terrainSurface` tectonic term is gated `worldConfig.tectonicPlates === true && !forcedCentroid`; `tectonicTalusAt` must sit in that **same** block (not `tectonicPlates` alone, or the editor forced-centroid preview diverges).
- **NIT 10 — parity P10.** Add a `parity-check.mjs` P10 asserting the `RegionField` body + `orogenField`/`hydroField` construction are byte-identical across main-thread ↔ worker-injection ↔ extract-terrain (indent-stripped), same commit.

**Net effect on scope:** the refactor touches **three** lockstep copies (main-thread, worker-injection strings, extract-terrain.mjs), needs an extraction-path + TDZ-ordering change in the gate harness, adds two non-byte gates (bake-count, dh-invariance) and parity P10, and the only mechanical worker-injection byte-parity backstop (`voxex-tests.html`) is a deploy-time gate that can't run per-phase here. This materially raises the surgery's blast radius versus the original draft.

## As-built (implemented 2026-07-21, build `2026-07-21.1`)

**What landed (matches the plan; no structural deviations).**

**Phase 1 — `RegionField` + orogen port.** Added `class RegionField` (main-thread module scope, near the old `_orogenRegionCache`; single-sourced into the worker via `RegionField.toString()`). Orogen cache dance in `tectonicErosionAt`/`tectonicRiverFactor` → `orogenField.get(rx,rz,seed)`; `buildOrogenRegion` stays the pure `bake`. Recursion guard `_orogenBaking` stays module-scope with the sampler early-out **before** `get()` (per audit SHOULD-FIX 4 — RegionField does NOT own the guard). Editor `.clear()` sites retargeted to `orogenField`. 3rd-copy: `tools/lib/extract-terrain.mjs` gained `extractClass()` + constructs `orogenField` after the FUNCS block (audit BLOCKER 1).

**Phase 2 — hydro port (fingerprint-critical, default path).** `RegionField` extended with an `evictPolicy` param: `'clear'` (orogen, wipe-on-full) / `'lru'` (hydro, delete-on-hit + evict-oldest) — semantics of the old `hydroRegionCache` preserved exactly. `buildHydroRegion` stripped to a **pure** bake (cache lookup/delete-on-hit/set/evict dance removed from top+tail, moved into `RegionField.get`); its self-memo key `rx,rz,seed` → RegionField's `seed:rx:rz` (output-invariant, pure memo). Sampler `riverFactorAt`'s 3×3 loop → `hydroField.get(...)`. `hydroRegionCache` decl removed from main + worker-injection + extract-terrain stub; `hydroField` constructed in all three. Editor `.clear()` ×3 → `hydroField.clear()`. Declared-but-empty `sediment`/`climate` sockets added to `RegionField`. **No STOP triggered** — fingerprint + flag-ON dh/flow byte-identical.

**Phase 3 — talus `Δh` raster (flag-ON only).** `buildOrogenRegion` emits a new `talusDh` output: `TALUS_SWEEPS=4` of the in-loop talus rule (`EROSION_TALUS`/`EROSION_KT`) over a **copy** of the post-erosion `H`, computed **strictly after** `dh`(`out`)/`flow` are snapshotted (audit SHOULD-FIX 5 — `dh`/`flow` provably untouched), same haloed grid + center-weighted 3×3 smoothing + interior-only borders as `dh`. New injected `tectonicTalusAt(gx,gz,seed)` (identical domain-warp/bilinear/recursion-guard as `tectonicErosionAt`), added in `terrainSurface` inside the **`worldConfig.tectonicPlates===true && !forcedCentroid`** block (audit NIT 9). Added to terrainFuncs list, editor seam, extract-terrain FUNCS + return object. **Reach = NARROW** — threshold = `EROSION_TALUS` reused (no double-count with the in-loop pass); no new tunables (sweep count hardcoded).

**Raw gate output (final, build `2026-07-21.1`):**
```
[syntax]        SYNTAX GREEN — all script blocks parse
[fingerprint]   7487c1955a87ca7ec38170335303e4e90f6ee78495a47f1c6219466b086b3e46   (flag-OFF, UNCHANGED)
[baseline]      seed 1337: flagOFF bh=bc6d07f4 | flagON dh=d14120a7 flow=a209ddf7
                seed 42:   flagOFF bh=4393b103 | flagON dh=f9bc0067 flow=15e63c8d
                seed 9001: flagOFF bh=7265877d | flagON dh=342f4b0a flow=98901d51   (ALL identical to pre-CCR)
[parity]        P10a/b/c PASS; LOCKSTEP GREEN
[evict-sem]     EVICT-SEMANTICS GREEN (LRU delete-on-hit + clear-on-full + null-cached-once + sockets)
[node-checks]   1337/42/9001 → ALL HARD CHECKS GREEN
[phase3 talus]  determinism 0/0; NARROW 5/259326 (0.00%) ≤repose cells nonzero, max-resid 0.001;
                max|talusDh|=1.170 blk; touches 0.3% of interior cells; seam bound 1.170<2.0;
                bake cost 0.979× no-talus
```

**Measurements / findings.** Talus is genuinely NARROW — relaxes only ridge-crest/scarp lines (heatmap `tools/scratch/talus-heatmap-1337.png`); the in-loop pass already handles most talus, so the standalone pass adds ≤1.17 blk on residual over-steep macro slopes (this is by design — threshold ≥ `EROSION_TALUS` avoids double-count). Bake cost unchanged (0.98×; talus reuses the erosion loop's grid). Seam is bounded by the field's own magnitude (max |talusDh| 1.17 < 2.0 `dh` budget); a direct active-boundary transect wasn't sampled (talus too sparse to hit the scanned borders) — bounded-argument only.

**Files touched:** `voxEx.html` (Phases 1–3 + VOXEX_BUILD/RECENT_CHANGES), `tools/lib/extract-terrain.mjs` (RegionField/orogenField/hydroField construction + `tectonicTalusAt` in FUNCS/return), `tools/parity-check.mjs` (P10). New: `tools/flagoff-fingerprint.mjs` (Phase-0, already shipped), `tools/scratch/regionfield-evict-test.mjs`, `tools/scratch/phase3-talus-probe.mjs`, `tools/scratch/render-talus-evidence.mjs`.

**Deviations from plan:** none structural. Sweep count hardcoded (`TALUS_SWEEPS=4`) rather than a new tunable (audit-recommended "small fixed sweep count") to avoid a 5-place lockstep add; owner can promote it later if editor-dialing is wanted.

**Owner-pending (do-not-forget):** browser worker-parity suite (owed since CCR-002 — deploy blocker, unrun here: no localhost); editor eyeball of the flag-ON talus look; **git commit (sessions never commit)**; a stale `.git/index.lock` on the device blocks git — clear it before committing (`del .git\index.lock`).

## Owner-reserved decisions & standing list

**Resolved 2026-07-20** (see top "Resolved decisions" block):
1. ~~TGV~~ → **stays NO**; talus rides the `tectonicPlates` gate. Phase 2 hydro-path perturbation still forces STOP + owner TGV call.
2. ~~Talus reach~~ → **NARROW** (over-steep macro slopes only, post-erosion, flag-ON).
4. ~~Venue~~ → **on-computer decided**, but this executing session is **cloud-via-bridge** (see env note) — surfaced to owner before surgery.

**Still standing (before/at deploy):**
3. **browser worker-parity suite owed since CCR-002** — deploy blocker; **editor eyeball of the flag-ON talus look**; **git commit is owner-only** (sessions never git-add/commit).

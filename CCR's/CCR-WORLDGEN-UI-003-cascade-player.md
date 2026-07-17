# CCR-WORLDGEN-UI-003 — Cascade Player + Deferred Commit

**Status:** IMPLEMENTED P1-P3 (P4 future).
**Baseline:** editor as of build 2026-07-16.11 (responsive layout + dependency-gated rendering + progressive render, all shipped).
**Owner intent (his words):** "watch the passes happen... whatever pass you're on, it would animate each pass that precedes it accurately as it generates. That would make it not feel as slow and also be helpful to see exactly where potential generation issues are occurring." Plus: "Auto-play-on-commit. but add a button that says commit changes, because it has already been a bit annoying that it freezes the page as soon as I change a number."

## Honest framing

The engine computes per-column (each column runs the whole chain in one call), NOT as sequential whole-map passes. The Cascade Player is therefore a **faithful reconstruction** of the dataflow: each stage's map is rendered by the same seam function the pipeline actually uses, in true dependency order. Values, order, and composition are exact; only the "sweep over the map" is presentational. Diagnostically equivalent to a live trace. State this in the UI docs; never imply a literal execution trace.

## Part 1 — Deferred commit (kills the type-freeze)

- Editing any gen-param/tunable control does NO work: no applyGenTunables, no render, no filmstrip, no autosave, no history. The change lands in a `pendingEdits` map; the control gets a `.pending` amber style; a **Commit Changes** button (preview toolbar + floating pill when pending>0, shows count) pulses.
- **Commit Changes** applies all pending edits in one batch (one applyGenParams round-trip — the no-op cache-skip from build .11 makes clean batching cheap), runs ONE history snapshot (better undo granularity than per-keystroke), one autosave, dependency-gated renders — and auto-plays the Cascade (Part 2).
- Enter key inside a field = commit. Esc = revert that field to committed value. Discard-all link next to the button.
- Pass switching, pan/zoom, diff/A-B, quality changes stay INSTANT (view-only, no commit needed).
- Preset load / import / seed change / reset / undo / redo commit implicitly (they are batch operations by nature; they also cascade-play).
- Autosave persists BOTH committed state and pendingEdits (additive keys) so a reload doesn't lose half-typed work; pending edits restore as pending.
- Compatibility: all existing element ids survive; `commitParamsChange`/`afterTunablesChanged` become the internals of the batch commit.

## Part 2 — Cascade Player

- **Trigger:** every commit auto-plays (owner default). Also a ▶ button to replay on demand. A toolbar toggle can disable auto-play (persisted, default ON).
- **Stage chain** per active pass, derived from the existing SECTION_AFFECTS/dependency data + a static ordered `CASCADE_CHAIN` list reflecting real dataflow:
  plates → continentalness (crust+tint+ΔC) → temperature/humidity (grouped as one "climate" tick) → relief (erosion+uplift blend) → surface → oceanFactor → preRiver → riverFactor → carved → biome → material. The chain is truncated at the active pass (Surface shows 5 ticks; Material Map shows all).
  Surface INTERNALS (base/amplitude/hf/warp) are NOT separate ticks by default; the "surface" tick is expandable (click) to scrub through them — keeps the default show tight.
- **Rendering:** each stage at CASCADE_QUALITY (256², tunable 128/256), through the existing progressive renderer (no main-thread blocks). Stage completes → 250-400ms crossfade to the next + caption ("+ river carving — channels incised, valleys widened"). Final stage refines to the user's selected quality.
- **Timeline scrubber** with a tick per stage: click/drag to jump; playback controls (play/pause, speed 0.5-2×). Scrubbing uses cached grids — instant.
- **Grid cache:** per (stage, params-hash, view-rect, cascade-quality). Invalidated by the existing dependency map (a Tectonics commit invalidates plates→downstream; FREQ_TEMPERATURE only climate→downstream). Replay after no change = fully cached = instant flip-book. Memory ~11 × 256² Float32 ≈ 2.9 MB — trivial.
- **Interruption:** a new commit mid-play cancels cleanly (generation counter, same idiom as _cancelRefine).

## Part 3 (V2) — Delta flash

Between stages, an optional brief diverging-ramp flash (reuse divergingColor/diff infra) of what the incoming stage changed vs the composed height before it. Toggle in the toolbar ("show stage deltas"). This is the debugging half of the owner's ask — pathological stages light up.

## Part 4 (V3, future) — Intra-stage true animation

Real sequences that genuinely exist in the math: hydro river tracing spring-by-spring (seam already exposes buildHydroRegion polylines), flood-spill basin breaching, plate drift vector field. Needs 1-2 seam exports (polylines with trace order). Spectacular but separable; do not block V1/V2 on it.

## Implementation notes

- Editor-only for V1/V2 — NO voxEx.html changes. V3 needs seam exports (own mini-phase with the usual gates).
- Height-composition captions must be honest about what each stage contributes; write them from the CCR-TECTONICS-001/CONTINENTAL-OCEANS-001 as-builts.
- The existing 100ms scheduleRender debounce becomes irrelevant for edits (nothing renders pre-commit) but stays for pan/zoom.
- Smoke matrix (no automated suite covers the editor): pending-edit accumulate/commit/discard/Enter/Esc; cascade plays on commit + replay + scrub + interrupt; delta flash toggle; autosave round-trip incl. pending edits; all existing smokes (pass switching, diff/A-B, filmstrip gating, presets, undo/redo) re-run.

## Phases

- **P1** Deferred commit (Part 1) — standalone value even without the player; removes the last "freezes when I change a number" annoyance.
- **P2** Cascade Player V1 (Part 2).
- **P3** Delta flash (Part 3).
- **P4** (future CCR or phase) Intra-stage animation (Part 4).

## As-built

### 2026-07-17 — P1 Deferred commit

Handlers stage into `pendingEdits` (zero work on edit — no render/filmstrip/applyGenTunables, verified by counters); `.pending` amber styling; `#btn-commit` + count badge + `#commit-pill` + `#btn-discard-pending`; `commitPendingEdits` = one batch apply (pending tunables applied before `computeNonDefaultTunables`, tri-state honored) + ONE history snapshot (batch undo) + one autosave + dependency-gated renders (union of affected passes) + `onCommitCompleted` hook; Enter commits/Esc reverts field; 6 implicit-commit sites discard pending first (wholesale-state rationale); pending persists in autosave and restores across reload. Smoke 8/8.

### 2026-07-17 — P2 Cascade player

`CASCADE_CHAIN` (11 stages, climate grouped under temperature visual) + `PASS_CASCADE_TRUNCATE` for all 22 passes; stages render at 256 via the existing render machinery into cached canvases (LRU keyed stage|gen|view|quality; invalidated per commit by affected-pass set); 300ms speed-scaled crossfades + honest captions; `#cascade-timeline` ticks (click-scrub), `#cascade-play`, `#cascade-speed` (0.5/1/2×), `#cascade-autoplay` (default ON, persisted); generation-counter cancellation on commit/pass-switch/pan/zoom/quality; ends with normal full-quality progressive render. Smoke 13/13: first play 7899ms → cached replay 1000ms; 9 ticks for carved, 3 for temperature (climate grouped — the CCR prose's implied 4 was a spec inconsistency, chain data is authoritative).

### 2026-07-17 — P3 Delta flash

`#cascade-deltas` toggle (default OFF, persisted); flashes ONLY between commensurable height pairs (surface→preRiver, preRiver→carved — `FLASH_PREV_STAGE` map); raw Float32 grids retained on the cached canvases for the three flash-capable stages; 400ms speed-scaled diverging frame (divergingColor, symmetric max|Δ|) + "Δ what <stage> changed" caption; same generation-counter cancellation. Smoke 12/12. Honest note: river-deepening deltas are one-signed (red only) — the two-color ideal appears only for two-signed deltas.

All three phases editor-only; voxEx.html untouched (still build 2026-07-16.11); editor has no automated suite — the headless smoke matrices above are the acceptance record.

# CCR-<AREA>-<NNN>: <one-line title>

> **Status: DRAFT** — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-CCR-<AREA>-<NNN> · **Build baseline**: <VOXEX_BUILD when written> · **Author**: <human/agent>

## Problem / Why

<What is wrong or missing, how it manifests (screenshots/measurements if visual/perf),
and the root cause if known. Cite evidence — "measured X", not "probably X".>

## Approach

<The chosen fix in 2-5 sentences, plus alternatives REJECTED and why (rejected
approaches with structural reasons belong in docs/agent-notes.md's do-not-retry
ledger after implementation).>

## Version impact

- `VOXEX_BUILD`: bump + `VOXEX_RECENT_CHANGES` entry (always)
- `TERRAIN_GEN_VERSION`: <yes/no — ANY terrain output change, incl. float-epsilon>
- `CURRENT_CACHE_VERSION`: <yes/no — chunk cache format/lighting semantics>
- `SETTINGS_VERSION`: <yes/no — DEFAULTS change that must override saved settings>

## Changes

<!-- One block per edit site. Location is a GREP ANCHOR, never a line number.
     Before/After snippets let the implementer verify they're at the right code
     and detect drift since the CCR was written. Add AUDIT FLAG / AUDIT NOTE
     callouts for anything that overrides intuition — implementers must obey them. -->

### #1 — <short description>

**Location:** grep `<anchor string>` in `voxEx.html`
**Why:** <one sentence>

**Before:**
```js
<exact current code — head/tail elision OK for long blocks, mark with …>
```

**After:**
```js
<exact new code>
```

**Verify:** <what proves this edit worked — a check command, a test name, an in-game observation>

### #2 — …

## Worker parity

<For each touched function: injected (edit main only) / hand-maintained copy
(edit BOTH — see CLAUDE.md Lockstep Registry) / main-only. New helpers the
worker needs: which injection list they join.>

## Safety Checks

- [ ] `node tools/parity-check.mjs` GREEN
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] Terrain touched? `node tools/terrain-node-checks.mjs` GREEN on ≥3 seeds
- [ ] `tools/voxex-tests.html` over localhost — no regressions
- [ ] No duplicate/shadowed identifiers (grep before declaring)
- [ ] New settings: in `DEFAULTS`, round-trip, real DOM IDs
- [ ] No unbatched per-frame work added
- [ ] Version constants bumped per "Version impact" above
- [ ] CLAUDE.md / docs/agent-notes.md updated if this staled them

## As-built (fill in AFTER implementation)

<What was actually done, deviations from the plan and why, measurements,
follow-ups discovered. Then move this file to `CCR's/Finished/`.>

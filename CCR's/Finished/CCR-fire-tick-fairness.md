# CCR-fire-tick-fairness.md — Fire Tick Fairness Fixes

| Field | Value |
|-------|-------|
| **CCR ID** | VOXEX-CCR-FIRE-003 |
| **Title** | Fire tick fairness: fresh-flame skip, deferred-age freeze, dead-setting annotation |
| **Target file** | `voxEx.html` |
| **Date** | 2026-07-07 |
| **Baseline build** | `2026-07-05.94` → shipped in `2026-07-07.95` |
| **Status** | **IMPLEMENTED** |
| **Risk level** | Low (fire sim tick only — main-thread, not worker-injected, no lighting/meshing/persistence impact) |
| **Parent** | VOXEX-CCR-FIRE-001 (FireImplementation.md), VOXEX-CCR-FIRE-002 (CCR-fire-system-limits.md) |

## Summary

Three small fixes found in a 2026-07-07 code review of the fire system (which otherwise verified clean — all FIRE-001 §17 gaps G1–G5 confirmed closed in code):

- **Fresh-flame skip**: newly spread flames no longer age a full `tickDt` and roll spread in the tick that created them.
- **Deferred-age freeze**: flames deferred at a chunk boundary (`scan.unloaded`) no longer accumulate age, so they can't instant-char everything when the player returns.
- **`fireMaxEditsPerTick` annotated DEPRECATED/unused** in `DEFAULTS` (comment claimed an anti-thrash budget the tick never implemented).

## Changes

### 1. Fresh-flame skip (`fireSystem.register` + `fireSystem.update`)

**Problem:** `spreadFire` inserts new cells into `fireSystem.cells` while `update()` is iterating it. Per JS `Map` semantics, mid-loop inserts ARE visited by the same iteration. Two consequences:

- The new flame's first visit ran `f.age += tickDt` (0.5 s) at ~0 s of real display time. For fast fuels (grass/leaves, `BURN_TIME` 1.5 s × burnScale ≥0.8 → 1.2 s min window), that ate up to a third of the visible burn.
- The new flame also got its own spread roll in the same tick, so fire could chain up to `fireSpreadBudget` (4) cells in a straight line per tick instead of each flame crawling one cell per tick.

**Fix:** cells are created with `fresh: true`; the tick's first action per cell is `if (f.fresh) { f.fresh = false; continue; }`. Cells registered outside a tick (placement, chunk-load rescan in `renderChunk`) also wait one tick — harmless (≤0.5 s onset delay).

### 2. Deferred-age freeze (`fireSystem.update`)

**Problem:** the order was age → scan → `if (scan.unloaded) continue`. A flame next to an unloaded chunk aged forever while deferred (charring/removal checks all skipped). On return, its stockpiled age exceeded every `BURN_TIME × burnScale`, so `charReadyBurnables` charred ALL adjacent burnables on the first tick after load — an instant char explosion instead of a resumed burn.

**Fix:** `f.age += tickDt` moved below the `scan.unloaded` guard. Deferred flames are now fully frozen (age, char, spread, removal), resuming exactly where they left off. Note: the `fireMaxAge` safety cap is also frozen while deferred — acceptable, since the flame is invisible/irrelevant until the neighbour loads, and the cap re-arms immediately after.

### 3. Dead-setting annotation (`DEFAULTS`)

`fireMaxEditsPerTick: 32` was commented "per-tick edit budget (anti-thrash)" but is consulted nowhere — charring is deliberately unbudgeted (see the tick's design comment) and spread is capped by `fireSpreadBudget`. Comment now marks it DEPRECATED/unused, kept for save compat, matching the existing `fireConsumeChance`/`fireLightLevel` precedent. No value changed → **no `SETTINGS_VERSION` bump**.

## Rationale

Correctness/fairness of the burn pacing: per-block `BURN_TIME` tuning (FIRE-001 rev. 11) is only honoured if flames age from when they visibly appear and only while their neighbourhood is fully loaded. The chain-spread fix restores the "rate-limited crawl" intent of the spread-budget design (the budget still caps global spread per tick; it just can't be spent as an instant multi-cell dash by one fire front).

## Safety Checks

- [x] No new globals; `fresh` is a cell property (checked: `.fresh` had zero prior uses in the file); single `cells.set` site.
- [x] Fire sim functions are NOT worker-injected and not in the lockstep registry — no parity impact (`parity-check.mjs` green).
- [x] No lighting/meshing/persistence semantics changed (`TERRAIN_GEN_VERSION`/`CURRENT_CACHE_VERSION`/`SETTINGS_VERSION` untouched).
- [x] No per-frame cost added (one boolean check per cell per 2 Hz tick).
- [x] `VOXEX_BUILD` → `2026-07-07.95`, `VOXEX_RECENT_CHANGES` entry added citing this CCR.
- [x] Browser suite (`tools/run-browser-tests.mjs`) — **315/315 green** (headless, sandbox Chromium, 2026-07-07).
- [ ] In-game eyeball: grove fire advances one cell per flame per tick; boundary fire resumes (not explodes) on return.

## Docs updated

- `docs/agent-notes.md` §"Fire & torch light" — stale "known gaps" line replaced (gaps closed in 2026-06-17.6) in the same session.

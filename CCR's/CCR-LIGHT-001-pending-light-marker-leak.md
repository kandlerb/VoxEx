# CCR-LIGHT-001: Remesh stall after big carves — pending-light marker leak + seam gap

> **Status: IMPLEMENTED** (build `2026-07-09.4`, same day as diagnosis) — move to `Finished/` after the in-game verification below passes
> **ID**: VOXEX-CCR-LIGHT-001 · **Build baseline**: `2026-07-09.3` · **Author**: Kandler (play-test report) + Claude (root-cause / fix)

## Problem / Why

Play-test report (power-5 explosion, render distance 32): some chunks kept their OLD mesh for **minutes** after the carve — the player falls through ground that is still drawn (block data carved, mesh stale), fire spreads through and past the stale chunks without their meshes updating, "until something else happens." Debug overlay at the time: `Light Q: 0 | Defer: 1`, `EdgeLight: 1358 | Wait: 1467`.

**Root cause (traced, all sites verified):**

1. **The marker leak.** Every facade `setBlock` light job increments a per-chunk counter via `markPendingLight(key)` when pushed to `lightUpdateQueue`; the balancing `clearPendingLight` runs only when the job is actually processed (tracker `finalize()`). When a `SunlightTask` hits its pressure bailout (`HARD_CAP_MAX_CHUNKS = 12` — a radius-6/8 carve trips it repeatedly), `cleanupPendingUpdates` **spliced every queued job in the affected region out of the queue without running its tracker** — releasing the per-block `queuedLightUpdates` key but orphaning the per-chunk `pendingLightChunks` count. `chunkOrNeighborsPending()` then stayed true, so every non-forced `scheduleChunkUpdate` (including the fire tick's) parked in `deferredChunkUpdates` indefinitely.
2. **Why the watchdog couldn't save it.** `watchdogPendingLightChunks` reaps markers only when `idle > 1000ms` — but `clearPendingLight` bumps `entry.lastSeen` on **every** call, including non-zeroing decrements. With a large edge-lighting backlog churning nearby (the 1467/1358 above — chronic at render distance 32), completions in the same chunk kept resetting `idle`, making leaked markers effectively immortal until the whole backlog drained.
3. **The seam gap (user's own hypothesis, confirmed).** The magic shape helpers batch remeshes as one `updateLocalArea(representativePoint)` per touched chunk. `updateLocalArea` only schedules edge/corner NEIGHBORS when its single representative point sits on the border — so a carve that removed border blocks left the neighbor chunk's newly-exposed faces stale/missing whenever the representative happened to be interior.
4. Two hygiene holes found during the trace: chunk eviction (`purgeChunkData`) never deleted `pendingLightChunks` markers; and the bailout's own rebuilds were scheduled `force=false`, letting them park behind the very markers the bailout had just leaked.

## Changes (as-built, grep anchors)

- `cleanupPendingUpdates` (grep it): each spliced job's `job.pendingLightChunks` entries now get `clearPendingLight` before the splice — the balanced clear the tracker would have done.
- `scheduleChunkRebuilds` (grep `"sunlight-task"`): bailout rebuilds now `force: true, bypassLighting: true` — their lighting was just recomputed synchronously by `recalculateAffectedChunks`.
- `watchdogPendingLightChunks`: new state-aware reap — when `lightUpdateQueue` AND `sunlightWorkQueue` are both empty, any marker older than `LIGHT_PENDING_GRACE_MS` is reaped regardless of idle timers.
- `purgeChunkData` (grep `edgeLightingPassCount.delete`): evicted chunks delete their marker.
- `recordTouchedChunk`/`flushTouchedChunks` (grep them): touched-chunk records now carry a 4-bit border mask (any edited block at local x/z 0 or 15); flush schedules the corresponding seam neighbors with `DIRTY_REASON.SEAM`.

## Version impact

`VOXEX_BUILD` → `2026-07-09.4` (+ recent-changes entry). No terrain/cache/settings bumps (scheduling/bookkeeping only — no lighting VALUES changed).

## Verification

- Gates: syntax + parity green; full browser suite **379/379** headless (identical patch validated on a git-archive copy of `.3` before mirroring).
- **In-game (pending, real hardware):** power-5 explosion straddling a chunk border → all touched chunks AND their neighbors remesh within ~1s (no fall-through ground, no missing faces at crater edges); let fire spread across chunk borders afterward → scorched chunks keep updating; overlay's `Light Q` returns to 0 AND stale meshes are gone (not merely the former).

## Lessons (agent-notes candidates)

- `pendingLightChunks` is a counted marker: EVERY `markPendingLight` needs exactly one `clearPendingLight` on every job outcome path (processed, spliced, evicted). Any new light-queue eviction path must clear markers or chunks strand.
- Timer-based watchdogs need a state-based escape hatch: "no work in flight" beats any idle heuristic that shares its clock with the thing that's stuck.
- Batched shape edits must propagate BORDER contact to seam neighbors explicitly — the single-representative `updateLocalArea` trick under-schedules by design.

# CCR-DEBUG-001: Channelized debug logging, always-on ring buffer, global error capture

> **Status: IMPLEMENTED** (build 2026-07-07.96) — move to `Finished/` once the browser suite is green
> Audit 2026-07-07: Before snippet matches live .95 byte-for-byte; all 12 new identifiers grep-count 0; both anchors inside the main module script (line 4235+); diagSnapshot globals verified (`chunkWorkerPool`, `chunkMeshes`, `chunkRenderedFaces`, `getPlayerWorldPosition`, `fpsInstant`/`fpsAvg`, `dayNightTime`, `memoryBudgetManager`, `activeWorldGenParams`, `window.currentWorldName`); no existing `window "error"`/`unhandledrejection` listeners to collide with.
> **ID**: VOXEX-CCR-DEBUG-001 · **Build baseline**: 2026-07-07.95 · **Author**: agent (Fable), requested by Kandler

## Problem / Why

Diagnosing runtime issues (streaming stalls, lighting watchdog trips, memory pressure,
worker failures) from logs is the workflow we want for AI-assisted debugging (Opus/Sonnet
reading the console via CDP / the Chrome extension), but the current plumbing fights it:

1. **All-or-nothing gate.** `logDebug`/`logWarn` are gated by the single `isDebug` flag,
   which is coupled to the `~` debug overlay. You cannot enable `[Lighting]` without also
   getting `[PreGen]`/`[OPFS]`/`[Mesh]` noise — and noise is the enemy when a model reads logs.
2. **Warnings are silently dropped.** `logWarn` is behind `isDebug`, so during normal play
   (exactly when issues arise) warnings never reach the console.
3. **No history.** Nothing buffers past output. If a user hits an issue with logging off,
   the evidence is gone; there is no `dumpLogs()` to paste into a chat.
4. **No global error capture.** There is no `window.onerror`/`unhandledrejection` handler
   (verified: zero matches outside per-request IndexedDB/worker handlers), so uncaught
   exceptions carry no game-state context and vanish unless devtools happened to be open.

Measured call-site inventory (build .95): 133 `logDebug` calls, ~118 already carrying a
`[Tag]` prefix across ~35 distinct tags — which is why per-channel filtering can be added
by parsing the existing prefix inside `logDebug`, with **zero call-site edits**. `logWarn`/
`logError` have only ~7 call sites total, so un-gating warnings is spam-safe.

## Approach

Upgrade the central logging functions only (one contiguous block at the `let isDebug`
anchor): parse the `[Tag]` prefix into a channel; add an explicit channel filter
(`setDebugChannels('mesh,lighting')`, persisted to localStorage) that works independently
of the overlay-coupled `isDebug`; record EVERY logDebug/logWarn/logError call into a
500-entry ring buffer regardless of console gates (`dumpLogs()` to retrieve); make
`logWarn` always-on with logError-style throttling; add `window.onerror` +
`unhandledrejection` → `logError`; add `window.diagSnapshot()` (build, seed, position,
chunk/mesh/face counts, memory status, recent errors) as a one-call bug-report dump.

**Rejected:** (a) a sweeping instrumentation pass adding log lines across all subsystems —
big diff in a 46K-line file, violates the "sparse logs" rule, marginal benefit; add lines
opportunistically when an under-instrumented system bites. (b) A per-channel `SETTINGS`
entry / settings-menu UI — this is a developer console facility, not a player setting;
keeping it out of `SETTINGS` avoids DEFAULTS/round-trip/DOM-ID requirements. (c) Requiring
an explicit channel argument on `logDebug(channel, msg)` — would touch all 133 call sites
for no gain over prefix parsing. (d) Worker→main log relay — deferred (workers stay silent;
smallest useful scope first; noted as follow-up).

## Version impact

- `VOXEX_BUILD`: bump `2026-07-07.95` → `2026-07-07.96` + `VOXEX_RECENT_CHANGES` entry (this CCR)
- `TERRAIN_GEN_VERSION`: **no** (zero terrain impact)
- `CURRENT_CACHE_VERSION`: **no** (no chunk/lighting semantics change)
- `SETTINGS_VERSION`: **no** (no `DEFAULTS` change; channel filter persists under its own
  localStorage key `voxex-debug-channels`, deliberately outside `SETTINGS`)

## Changes

### #1 — Replace the logging block (single edit site)

**Location:** grep `let isDebug = false;` in `voxEx.html` (the block runs through the
one-line `logWarn` definition; `function logDebug(message` is the tail anchor)
**Why:** all four fixes live in this one contiguous block; `logError` keeps its exact
console behavior and gains a ring push.

**Before:**
```js
            let isDebug = false;
            const errorThrottle = new Map(); // Track last error time by error type
            const ERROR_THROTTLE_MS = 5000; // Only same error once per 5 seconds
            function logError(errorType, message, error = null) {
                const now = Date.now();
                const lastLogged = errorThrottle.get(errorType) || 0;
                if (now - lastLogged > ERROR_THROTTLE_MS) { // Always errors, but throttle duplicates
                    errorThrottle.set(errorType, now);
                    if (error) { console.error(`[VoxEx Error - ${errorType}]:`, message, error);
                    } else { console.error(`[VoxEx Error - ${errorType}]:`, message); }
                    return true; // Error was logged
                }
                return false; // Error was throttled
            }
            function logDebug(message, ...args) { if (isDebug) { console.log(`[VoxEx Debug]:`, message, ...args); }}
            function logWarn(message, ...args) { if (isDebug) { console.warn(`[VoxEx Warning]:`, message, ...args); }}
```

**After:** (full replacement — see snippet below; behavior contract:)

- `logDebug(msg, ...args)`: channel = lowercase `[Tag]` prefix of `msg` (or `"misc"`);
  ALWAYS pushes to ring; console output when `debugChannels` is null → `isDebug`
  (today's behavior, preserved), when `debugChannels` is a Set → membership or `"*"`.
- `logWarn(msg, ...args)`: ALWAYS pushes to ring; console.warn always attempted but
  throttled per message-prefix key (5s, shares `errorThrottle` with `"W:"` key prefix).
- `logError(...)`: unchanged console contract (always, 5s-throttled by errorType) +
  ring push (level `"error"`) even when console-throttled.
- Ring: `logRing` (500 entries `{t, level, ch, msg, args?}`, `t` = ms since boot).
  `formatLogArg` renders args to primitives/short strings at push time — typed arrays
  become `"[Uint8Array x81920]"`, objects a ≤300-char JSON, Errors `"[Name: msg]"` —
  so the ring NEVER retains object references (no GC pinning of chunks/geometries).
- `setDebugChannels(spec)`: `"mesh,lighting"` | `"*"` | `null`/`""` to clear; persists
  to localStorage (guarded try/catch per CCR-localstorage-hardening convention); loaded
  at boot.
- `dumpLogs(filter?, limit=200)`: returns oldest→newest entries (optionally channel-
  filtered) AND prints one compact JSON line (copy-paste / CDP-readable).
- `diagSnapshot()`: `{build, at, upMs, seed (chunkWorkerPool.currentSeed), world
  (window.currentWorldName), pos, fps, dayTime, chunks/meshes/faces, memory
  (memoryBudgetManager.getStatus()), workers, renderDistance, genParams, recentIssues
  (last 20 warn/error ring entries)}` — every field individually try/caught (TDZ-safe:
  `typeof` throws on TDZ `let`s, so guards are try/catch, NOT typeof checks).
- Global handlers: `window.addEventListener("error", …)` and `("unhandledrejection", …)`
  → `logError("Uncaught"| "UnhandledRejection", …)`.
- `window.setDebugChannels/dumpLogs/diagSnapshot` attached (same pattern as
  `window.memoryDebug`).

**AUDIT NOTE (per-frame cost):** `logDebug` call sites are event-based, not per-frame;
the added cost per call is one short-string regex + one ring push. `formatLogArg`'s
`JSON.stringify` runs only for plain-object args (rare). Do NOT "optimize" the ring to
only record when a gate is on — always-recording is the point (post-hoc `dumpLogs()`).

**AUDIT NOTE (double print):** the `window "error"` listener does not suppress the
browser's default console display, so uncaught errors will appear twice (native + tagged
`[VoxEx Error - Uncaught]`). Accepted — the tagged copy is throttled and ring-captured.

**Verify:** console: `setDebugChannels('lighting')` → only `[Lighting]` lines appear
without the `~` overlay; `setDebugChannels(null)` → back to overlay-gated; reload →
filter persists; `dumpLogs()` returns entries recorded while all gates were off;
`throw new Error("x")` in console → `[VoxEx Error - Uncaught]` + ring entry;
`Promise.reject(new Error("y"))` → `[VoxEx Error - UnhandledRejection]`;
`diagSnapshot()` at main menu (pre-world) returns without throwing (guards) and in-game
shows seed/pos/counts.

### #2 — Bump `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` entry

**Location:** grep `const VOXEX_BUILD` in `voxEx.html`
**Why:** every deploy bumps; entry cites this CCR.

`"2026-07-07.95"` → `"2026-07-07.96"`; prepend a `VOXEX_RECENT_CHANGES` entry
summarizing the four fixes + new console globals + NEEDS VERIFICATION list.

**Verify:** boot banner shows .96.

### #3 — CLAUDE.md doc sync (same commit)

**Location:** CLAUDE.md → "Debug console globals" line + "Logging" paragraph in
Claude Code Guidelines.
**Why:** CLAUDE.md is LIVE; new globals and the channel convention must be discoverable.

Add `setDebugChannels('a,b'|'*'|null)`, `dumpLogs(filter?, limit?)`, `diagSnapshot()` to
the globals list; note in the Logging paragraph that the `[Tag]` prefix IS the filter
channel (so new logs should always carry one), and that `logWarn` is now always-on
(throttled) — don't put per-frame chatter in it.

## Worker parity

**None.** All edits are main-thread-only, outside the injected/hand-maintained regions.
The worker's `logDebug` no-op stub (grep `the worker has no logDebug`) is intentionally
untouched. `parity-check.mjs` still run as a gate (must stay green / unaffected).
Follow-up candidate (separate CCR): worker→main log relay so worker terrain/mesh code
can report through the same ring.

## Safety Checks

- [x] `node tools/parity-check.mjs` GREEN (2026-07-07, all P1–P8 + 6 markers)
- [x] `node tools/syntax-check.mjs` GREEN (importmap + classic + module script, 42,873 lines parse)
- [x] Terrain touched? — N/A (no terrain change)
- [ ] `tools/voxex-tests.html` over localhost — NOT RUN (sandbox session; CI / next Windows session)
- [x] In-console verification (Kandler, 2026-07-07, localhost:8080): boot banner .96;
      `setDebugChannels('lighting')` mutes other logDebug channels (remaining console lines
      were direct console.log boot logs, by design); filter survives reload
      (`localStorage` = `'lighting'`); `dumpLogs()` returned entries recorded while
      console-muted (2420 lifetime, 500 retained); `diagSnapshot()` fully populated
      in-game; `Promise.reject()` → `[VoxEx Error - UnhandledRejection]`;
      `setTimeout(() => { throw new Error('x') }, 0)` → `[VoxEx Error - Uncaught]`
      (note: a bare `throw` typed in DevTools runs in the console VM and never dispatches
      a window error event — throw from a page task to test).
      FINDING for possible follow-up: during worldgen streaming, [OPFS] seed-mismatch +
      [Mesh] chatter filled the 500-entry ring in ~250 ms — consider LOG_RING_SIZE 2000
      or an exclude filter on dumpLogs if mid-streaming evidence windows matter.
- [x] No duplicate/shadowed identifiers — verified pre- and post-edit (all 12 new identifiers grep count = expected occurrences only)
- [x] New settings — N/A (deliberately not a `SETTINGS` entry)
- [x] No unbatched per-frame work added (see AUDIT NOTE)
- [x] `VOXEX_BUILD` bumped 2026-07-07.95 → .96 + `VOXEX_RECENT_CHANGES` entry
- [x] CLAUDE.md updated (Debug console globals + Logging paragraph)

## As-built (2026-07-07, build .96)

Implemented exactly as audited — single contiguous block replacement at the `let isDebug`
anchor, zero call-site edits, zero deviations from the plan. Final shapes:

- `logDebug`: parses `[Tag]` → channel, ring-pushes always, console when
  `debugChannels` (explicit Set, `"*"` wildcard) or — with no filter set — `isDebug`.
- `logWarn`: always-on console.warn, 5s throttle keyed `"W:" + msg.slice(0,60)` in the
  shared `errorThrottle` map; ring level `"warn"`.
- `logError`: console contract unchanged; ring push happens even when console-throttled,
  message stored as `` `[${errorType}] ${message}` `` so error rows are self-describing.
- Ring: 500 entries `{t, level, ch, msg, args?}`; `formatLogArg` passes primitives,
  truncates strings/JSON at 300 chars, renders typed arrays/ArrayBuffers/Errors as short
  descriptors — no object retention.
- `setDebugChannels` persists to localStorage key `voxex-debug-channels` (guarded
  try/catch), loaded at module init; `dumpLogs(filter?, limit=200)` prints one compact
  JSON line + returns entries; `diagSnapshot()` per-field try/catch (TDZ-safe), includes
  `recentIssues` = last 20 non-debug ring entries.
- `window.setDebugChannels/dumpLogs/diagSnapshot` attached; `window "error"` +
  `"unhandledrejection"` listeners → `logError("Uncaught"/"UnhandledRejection", …)`.

**Verification note (sandbox):** the bash mount served a truncated voxEx.html
(agent-notes §7 failure — cut at the pre-edit byte length, mid-line, `</html>` missing
from the mount view while the Read/Grep tools confirmed the real file intact at 47,111
lines). Gates were run against a reconstructed copy in `/tmp` (mount's first 46,932
intact lines — grep-verified to contain the new code — + the authoritative tail read via
the file tools); both GREEN. The real file was NOT overwritten from the sandbox side.
**Do not `git add voxEx.html` from this sandbox session** — commit from Windows, where
the pre-commit hook re-runs gates 1–3 against the true file.

**Follow-ups discovered:** (1) worker→main log relay (separate CCR) so injected
terrain/mesh code can report through the ring; (2) under-instrumented channels worth
opportunistic tags when next touched: terrain gen, settings, zombie AI, touch, fire
(≤4 tagged lines combined at draft time).

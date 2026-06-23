# CCR — Click → Screen-Appearance Timing Instrumentation (VOXEX-CCR-TIMING-001)

**File:** `voxEx.html` (single-file rule honored — all proposed changes stay in this file)
**Date:** 2026-06-23
**Status:** Proposal / report only — **NO code applied. `voxEx.html` is unchanged by this session.**
**Scope:** Add lightweight, always-available instrumentation that timestamps (a) every UI click and (b) the moment the next screen/menu actually appears, then reports the gap between them in `hh:mm:ss.ss` (plus a precise millisecond delta). The goal is a *full breakdown* of "click → next screen shows" latency across every interaction, so we can later decide where loading spinners / progress animations are worth adding so the game never feels locked up.

This CCR is the **design + placement spec only**. It lists exact insertion points (line numbers + the current lines there), the proposed code, why each change is made, and why this approach beats the alternatives. Implementation is a follow-up session.

---

## Summary

- The game has **no central screen-router**. Menu transitions are done with **direct `element.style.display = 'block'/'flex'/'none'` writes** scattered across the file (dozens of sites), and there are **~67 separate `addEventListener('click', …)` handlers**. Instrumenting each one individually would be a huge, error-prone diff and would violate the project's "keep changes focused / no noisy edits" rule.
- **Recommended approach: two central hooks + one tiny module**, no per-handler edits:
  1. **One capture-phase `click` listener on `document`** — fires for *every* click before any handler runs, so it records the true "onclick" instant for everything, present and future.
  2. **One `MutationObserver`** watching `style`/`class`/`hidden` attribute changes on the menu/overlay containers — fires when the browser actually applies a screen's `display` flip (none → visible). This is the closest proxy to "the new screen appeared," and it captures **async** appearances (e.g. the *Generating World* screen that shows after `await`) for free.
  3. A small **`UITiming` module** (formatter + ring buffer + the two hooks + a `dumpUITimings()` console dump) so you get a copy-pasteable breakdown to hand back for the placement analysis.
- This is genuinely "across the board for all on-click items" while touching only **two insertion points** (module definition + one install call), plus an **allowlist constant** of screen IDs. Optional **precise hooks** at three exact show-sites are listed for sub-frame accuracy if the observer proves too coarse.
- Cost is negligible and there is **no per-frame work**: one capture listener (passive) + one observer that only fires on the rare attribute mutations that menu toggles produce. It is gated by a flag so it can be turned off with zero residue.

---

## Why instrument centrally instead of per-handler (the core decision)

Verified facts about the current structure:

| Fact | Evidence |
|---|---|
| Clicks are wired in ~67 independent places | `addEventListener('click', …)` — **67 matches** across `voxEx.html` |
| There is no `showScreen()` router; screens toggle via raw `style.display` writes | e.g. lines **20907–20908**, **20924–20925**, **27013–27014**, and the UIManager methods **9159–9192** all assign `.style.display` directly |
| A capture-phase delegated click listener already works here | UIManager `initButtonAudio()` already attaches `{ capture: true }` click listeners to play button sounds (lines **9146–9152**) — proves the pattern is sound in this codebase |
| Menus are plain DOM nodes with stable IDs | `seed-menu`, `create-world-panel`, `world-gen-progress`, `blocker`, `instructions`, `settings-menu`, `controls-menu`, `main-pause-menu`, `inventory-overlay`, `debug-overlay`, `perf-overlay` |

Editing 67 click handlers and ~30+ `display` write-sites would (a) be a massive noisy diff, (b) risk shadowing/typo bugs the CLAUDE.md checklist explicitly warns against, and (c) silently miss every future button. Two central observers capture **everything, forever**, with a diff small enough to review at a glance. That is why the central approach is the recommended one.

---

## Context map (verified line numbers)

These are the anchor points the implementation references. Lines are current as of build `2026-06-23.20`; re-confirm before editing (the file changes frequently).

| What | Line(s) | Current line(s) there |
|---|---|---|
| Module script start | **3928** | `<script type="module">` |
| Build banner (must bump on apply) | **3936**, **3944** | `const VOXEX_BUILD = "2026-06-23.20";` … `const VOXEX_RECENT_CHANGES = [` |
| `isDebug` flag | **11890** | `let isDebug = false;` |
| `logDebug` / `logWarn` (proposed module goes right after) | **11904–11905** | `function logDebug(message, ...args) { … }` / `function logWarn(message, ...args) { … }` |
| UIManager menu show methods (raw `display` writes) | **9159–9192** | `showSeedMenu()` / `showPauseMenu()` / `hidePauseMenu()` … |
| Existing capture-phase click listener (precedent) | **9146–9152** | `initButtonAudio()` → `button.addEventListener('click', …, { capture: true })` |
| "Create World" panel show | **20906–20920** | `document.getElementById('btn-create-world')?.addEventListener('click', () => { … 'create-world-panel'…display='block' … })` |
| "Start New World" → engine | **20951–20970** | `document.getElementById('btn-start-new-world')?.addEventListener('click', async () => { … await initGameEngine(seedStr, null); })` |
| `initGameEngine` (async) | **24459** | `async function initGameEngine(seedStr, loadedPlayerState) {` |
| **"Generating World" screen show** | **27014** | `if (progressDiv) progressDiv.style.display = "block";` (inside `preGenerateSpawnChunks`, line **27005**) |
| Unconditional `DOMContentLoaded` (runs on start-menu path too) — proposed install site | **24443–24449** | `document.addEventListener('DOMContentLoaded', () => { initWorldPreview(); populateWorldCards(); … attachSettingsEventListeners(); });` |
| Pointer-lock `lock`/`unlock` (optional "gameplay interactive" hook) | **29221–29231** | `controls.addEventListener("lock", () => { onGameplayFocusGained(); });` / `"unlock"` |
| Debug overlay element / toggle (optional on-screen readout) | **2214**, **44996–45002** | `<div id="debug-overlay">…</div>` / `function toggleDebugOverlay()` |

Worked example of the flow the user described, fully mapped:

```
Click "Create New World" (btn-create-world, handler @20906)
   └─ capture listener records click @ hh:mm:ss.ss
   └─ handler sets #create-world-panel display='block' (@20908)
        └─ MutationObserver fires → records "create-world-panel appeared" @ hh:mm:ss.ss, Δ ms

Click "Start Game" (btn-start-new-world, handler @20951)
   └─ capture listener records click @ hh:mm:ss.ss
   └─ handler → await initGameEngine (@24459) → preGenerateSpawnChunks (@27005)
        └─ sets #world-gen-progress display='block' (@27014)
             └─ MutationObserver fires → records "Generating World appeared" @ hh:mm:ss.ss, Δ ms
```

---

## Proposed changes

### Change 1 (primary) — add the `UITiming` module — **INSERT after line 11905**

New code only. Nothing existing is modified. Placed immediately after `logDebug`/`logWarn` so it is in module scope and the loggers are already defined.

> Insertion boundary (verified current): line **11905** is `function logWarn(message, ...args) { … }` and line **11906** begins a `/**` comment for `PerformanceMonitor`. Paste the block **between** them. The block is pre-indented with 12 spaces to match this scope — paste verbatim; do not re-indent. These are top-level module declarations (same scope as `logDebug`), so `const UITiming` is valid here and is in scope at the Change 2 install site.

```js
            // =====================================================
            // UI TIMING INSTRUMENTATION (VOXEX-CCR-TIMING-001)
            // Two central hooks — NO per-handler edits:
            //   (1) capture-phase click listener → timestamps every click
            //   (2) MutationObserver on screen containers → timestamps the
            //       moment a menu/overlay's display flips none → visible.
            // Reports the gap so we can see where "click → next screen" time
            // goes and where loading animations are worth adding.
            // =====================================================
            const UITiming = (() => {
                let enabled = (typeof window !== 'undefined' && window.VOXEX_TIMING !== false); // on unless explicitly disabled
                let installed = false;
                const log = [];                 // ring buffer of {click, clickAt, screen, screenAt, deltaMs}
                const LOG_MAX = 500;
                let lastClick = null;           // { label, perf, clock }
                const shown = new Set();        // screen elements currently considered visible (dedupe)

                // Screen/overlay containers to time. Curated core — widen freely.
                const SCREEN_IDS = new Set([
                    'seed-menu', 'create-world-panel', 'world-gen-progress',
                    'blocker', 'instructions', 'settings-menu', 'controls-menu',
                    'main-pause-menu', 'inventory-overlay', 'debug-overlay', 'perf-overlay'
                ]);

                /** Wall-clock as hh:mm:ss.ss (centiseconds). @param {number} ms @returns {string} */
                function fmtClock(ms) {
                    const d = new Date(ms);
                    const p2 = (n) => String(n).padStart(2, '0');
                    const cs = Math.floor((ms % 1000) / 10);
                    return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p2(cs)}`;
                }

                /** Best-effort human label for a clicked element. @param {EventTarget} t @returns {string} */
                function labelFor(t) {
                    if (!(t instanceof Element)) return '(non-element)';
                    const withId = t.closest('[id]');
                    if (withId && withId.id) return '#' + withId.id;
                    const txt = (t.textContent || '').trim().replace(/\s+/g, ' ');
                    if (txt) return '"' + txt.slice(0, 40) + '"';
                    return t.tagName.toLowerCase();
                }

                function recordClick(target) {
                    const now = performance.now();
                    const clock = Date.now();
                    lastClick = { label: labelFor(target), perf: now, clock };
                    if (enabled) console.log(`[Timing] CLICK ${lastClick.label} @ ${fmtClock(clock)}`);
                }

                function recordScreen(id, srcClock) {
                    const clock = (srcClock != null) ? srcClock : Date.now();
                    const now = performance.now();
                    // Only pair with a click that happened within the last 10s.
                    const paired = lastClick && (now - lastClick.perf) < 10000 ? lastClick : null;
                    const deltaMs = paired ? Math.round(now - paired.perf) : null;
                    const entry = {
                        click: paired ? paired.label : '(no recent click)',
                        clickAt: paired ? fmtClock(paired.clock) : '—',
                        screen: '#' + id,
                        screenAt: fmtClock(clock),
                        deltaMs
                    };
                    log.push(entry);
                    if (log.length > LOG_MAX) log.shift();
                    if (enabled) {
                        console.log(
                            `[Timing] SCREEN #${id} @ ${entry.screenAt}` +
                            (deltaMs != null ? `  (Δ ${deltaMs} ms after ${entry.click} @ ${entry.clickAt})`
                                             : `  (no preceding click)`)
                        );
                    }
                }

                /** Manual mark for exact instrumentation at a known show-site (optional). */
                function mark(id) { recordScreen(id); }

                function isVisible(el) {
                    if (!el || el.nodeType !== 1) return false;
                    if (el.hidden) return false;
                    const cs = getComputedStyle(el);
                    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                    return el.getClientRects().length > 0;
                }

                function install() {
                    if (installed) return;
                    installed = true;

                    // Hook 1 — capture phase: runs before any per-button handler.
                    document.addEventListener('click', (e) => {
                        if (!enabled) return;
                        recordClick(e.target);
                    }, { capture: true, passive: true });

                    // Hook 2 — screen appearance via attribute mutations.
                    const obs = new MutationObserver((muts) => {
                        if (!enabled) return;
                        for (let i = 0; i < muts.length; i++) {
                            const el = muts[i].target;
                            if (!(el instanceof Element) || !el.id || !SCREEN_IDS.has(el.id)) continue;
                            const vis = isVisible(el);
                            const was = shown.has(el);
                            if (vis && !was) { shown.add(el); recordScreen(el.id); }
                            else if (!vis && was) { shown.delete(el); }
                        }
                    });
                    obs.observe(document.body, {
                        subtree: true, attributes: true,
                        attributeFilter: ['style', 'class', 'hidden']
                    });
                }

                if (typeof window !== 'undefined') {
                    window.__uiTimings = log;
                    window.dumpUITimings = () => { console.table(log); return log; };
                    window.setUITiming = (on) => { enabled = !!on; };
                }
                return { install, mark, fmtClock, get enabled() { return enabled; } };
            })();
```

**Why this shape:**
- **IIFE module** keeps all new identifiers private — zero risk of shadowing the globals the checklist guards (`scene`, `camera`, `SETTINGS`, etc.). Only `window.__uiTimings` / `dumpUITimings` / `setUITiming` are exported, and those names don't exist today (verified).
- **Capture phase** (`{ capture: true }`) guarantees the click timestamp is taken *before* the button's own handler runs any work — that is the true "onclick" moment the user asked for. Precedent already in the file at 9146–9152.
- **`MutationObserver` on attribute changes** is the right tool because there is no router to wrap: it fires exactly when the browser applies the `display` flip, including for **async** screens (the *Generating World* screen appears only after `await preGenerateSpawnChunks`, so a synchronous wrapper around the click handler could never time it — the observer does, for free).
- **`getComputedStyle` + `getClientRects()`** correctly handles screens toggled by **class** as well as inline `style` (e.g. settings panels), not just inline `display`.
- **10-second pairing window** prevents a stale click from being falsely attributed to a programmatic screen change (e.g. an auto-opened overlay).
- **Ring buffer + `console.table`** gives you the copy-pasteable "full breakdown" to hand back for the placement decision.
- **`hh:mm:ss.ss`** is centiseconds (2 fractional digits) exactly as requested; the precise `Δ ms` is added because cross-screen reasoning needs sub-centisecond resolution and `performance.now()` is monotonic (immune to wall-clock adjustments).

### Change 2 (primary) — install the hooks once — **EDIT lines 24443–24449**

The existing unconditional `DOMContentLoaded` block runs on **every** load, including the pure start-menu path (it already calls `attachSettingsEventListeners()` for exactly that reason). One line added.

> ⚠️ **There are multiple `DOMContentLoaded` handlers in this file** (around lines 3844, 6730, and 24443). Edit the **specific one whose body calls `initWorldPreview()` and `populateWorldCards()`** — that uniquely identifies the correct block (the snippet below includes those lines, so match the full multi-line block, not just the `document.addEventListener('DOMContentLoaded', () => {` line). Do **not** add the install call to either of the other two handlers.

Current (24443–24449):

```js
            document.addEventListener('DOMContentLoaded', () => {
                initWorldPreview();
                populateWorldCards();
                if (activeProfileName) { document.querySelectorAll('.profile-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.profile === activeProfileName)); }
                // Attach settings event listeners early so settings work from main menu
                attachSettingsEventListeners();
            });
```

Proposed:

```js
            document.addEventListener('DOMContentLoaded', () => {
                UITiming.install();   // VOXEX-CCR-TIMING-001: start click/screen timing (start-menu path included)
                initWorldPreview();
                populateWorldCards();
                if (activeProfileName) { document.querySelectorAll('.profile-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.profile === activeProfileName)); }
                // Attach settings event listeners early so settings work from main menu
                attachSettingsEventListeners();
            });
```

**Why here:** `install()` is idempotent (guarded by `installed`) and needs `document.body`, which exists by `DOMContentLoaded`. This site is the single place that already runs unconditionally at load for both the start-menu and game paths, so timing covers the very first click ("Create New World") onward. (The module script is `type="module"` → deferred, so even if you prefer to call `UITiming.install()` immediately at the end of Change 1, `document.body` is guaranteed present; the `DOMContentLoaded` site is chosen only to match the file's existing init convention.)

### Change 3 (recommended, optional) — precise marks at the exact show-sites

The observer is accurate to the attribute-mutation tick. For the **two highest-value transitions** the user named, an explicit `UITiming.mark()` at the exact `display` write removes any observer-scheduling jitter and self-documents the intent. These are additive one-liners; if Change 1+2 land, these are belt-and-suspenders.

**3a — Generating World screen — EDIT line 27014** (inside `preGenerateSpawnChunks`):

Current:
```js
                if (progressDiv) progressDiv.style.display = "block";
```
Proposed:
```js
                if (progressDiv) { progressDiv.style.display = "block"; UITiming.mark('world-gen-progress'); }
```

**3b — Create World panel — EDIT line 20908** (inside the `btn-create-world` handler):

Current:
```js
                document.getElementById('create-world-panel').style.display = 'block';
```
Proposed:
```js
                document.getElementById('create-world-panel').style.display = 'block'; UITiming.mark('create-world-panel');
```

> If 3a/3b are applied, the matching `SCREEN_IDS` entries will also fire the observer — `recordScreen` would log twice for those two screens. Either (a) accept the duplicate (harmless, clearly labeled), or (b) remove `'world-gen-progress'` and `'create-world-panel'` from `SCREEN_IDS` so those two are *only* timed by the explicit mark. Recommendation: **start with Change 1+2 only** (observer-driven, zero extra edits), read the breakdown, and add 3a/3b later *only if* a specific transition's timing looks jittery.

### Change 4 (optional) — "gameplay actually interactive" timestamp — near lines 29221 / 29231

The *Generating World* screen appearing is the user's stated target, but the moment the world becomes **playable** (pointer lock acquired after pregen finishes) is the other end of the perceived-latency window. Marking it lets you measure the full "Start Game click → world interactive" span, which is exactly where a progress animation matters most.

Add inside the existing `lock` handler (29221–29224):
```js
                controls.addEventListener("lock", () => {
                    UITiming.mark('gameplay-interactive');   // VOXEX-CCR-TIMING-001 (optional)
                    onGameplayFocusGained();
                });
```
(`'gameplay-interactive'` is a virtual id — no DOM element — so it is timed only via this explicit mark, not the observer. Add it to no allowlist.)

### Change 5 (optional) — on-screen readout in the debug overlay

If you'd rather see the last transition on-screen than in the console, the most recent `log` entry can be appended to the `#debug-overlay` text in `updateDebugInfo` (the debug overlay is line **2214**, toggled at **44996–45002**). This is purely cosmetic and is **not recommended for the first pass** — the console + `dumpUITimings()` table is the better data-collection surface for the placement analysis you want. Listed for completeness only.

---

## How you'll read the result

After Change 1+2, open the browser console and interact normally. You'll see, live:

```
[Timing] CLICK #btn-create-world @ 14:02:11.07
[Timing] SCREEN #create-world-panel @ 14:02:11.09  (Δ 18 ms after #btn-create-world @ 14:02:11.07)
[Timing] CLICK #btn-start-new-world @ 14:02:19.42
[Timing] SCREEN #world-gen-progress @ 14:02:19.71  (Δ 287 ms after #btn-start-new-world @ 14:02:19.42)
```

Then run `dumpUITimings()` for a sortable table of every click→screen pair in the session — that's the "full breakdown" to hand back so we can pick where loading animations earn their keep (any Δ the user would perceive as a freeze — rule of thumb ≳100 ms — is a candidate).

---

## Cross-system effects & risk summary

- **Two insertion points + one allowlist constant.** No per-handler edits, no worker code, no terrain functions, no settings round-trip, no cache version, no new DOM IDs in HTML. Honors the single-file rule and the "focused diff" rule.
- **No identifier collisions** (verified): `UITiming`, `window.__uiTimings`, `dumpUITimings`, `setUITiming` do not exist in `voxEx.html` today. All internal names live inside the IIFE.
- **No per-frame work.** The capture listener fires only on real clicks; the observer fires only on the rare attribute mutations menu toggles produce. Both early-return when `enabled` is false. There is nothing in `animate()`/`renderFrame()`.
- **Observer scope.** It watches `document.body` subtree for `style`/`class`/`hidden` only, and ignores any element whose `id` isn't in `SCREEN_IDS`, so per-mutation work is an `id` check + a `Set.has`. The expensive `getComputedStyle` path runs only for allowlisted IDs (≤11 elements), and only when they actually mutate.
- **Known limitations (documented, acceptable for a diagnostic):**
  - The observer times the **attribute-mutation tick**, not the exact composite/paint. The `Δ ms` is "click → display flip", which is the meaningful number for finding where work blocks the transition. For sub-frame precision on a specific screen, use the explicit `mark()` (Change 3).
  - A parent+child both in the allowlist (e.g. `#blocker` flips to `flex` and `#settings-menu` to `block` together) can log two entries for one visual transition. Acceptable (both are labeled); trim `SCREEN_IDS` if it's noisy.
  - Clicks that open nothing produce a CLICK line with no SCREEN line — that's intended (it's still data about user intent).
  - Pointer-lock gameplay clicks (mining/placing) are also captured by the capture listener. They simply won't pair with a screen. If that's noisy, gate Hook 1 on `!isGameplayActive()` (the engine's existing gameplay-state check) — a one-line addition if desired.
- **Reversibility:** delete the module (Change 1) and the one install line (Change 2); optional marks are independent one-liners. `window.VOXEX_TIMING = false` (or `setUITiming(false)`) disables it at runtime with no code removal.

---

## Verification plan (when implementing in the follow-up session)

1. Serve over localhost; load `voxEx.html`. Open console. From the **start menu**, click "Create New World" → confirm a `CLICK #btn-create-world` line, then a `SCREEN #create-world-panel` line with a sane Δ.
2. Click "Start Game" → confirm `CLICK #btn-start-new-world`, then `SCREEN #world-gen-progress` with a Δ that reflects real pregen setup time. This is the headline case ("where does the freeze happen?").
3. Exercise pause/settings/controls/inventory/seed menus; confirm each allowlisted screen logs on first appearance and re-logs after being hidden and reshown.
4. Run `dumpUITimings()` → confirm the table has one row per click→screen pair with `deltaMs` populated.
5. Set `window.VOXEX_TIMING = false` then `setUITiming(false)`; confirm logging stops and the observer/listener become no-ops.
6. Open `tools/voxex-tests.html` (285 tests as of build 2026-06-23.20) over localhost — confirm no regressions (this change adds an inert module + one install line; all should stay green).
7. Sanity-check performance: with timing on, idle in a menu and in-game (perf overlay `O`) — confirm no measurable frame-time change (there should be none; no per-frame code added).
8. On apply: bump `VOXEX_BUILD` (line 3936) and prepend a `VOXEX_RECENT_CHANGES` entry (line 3944).

---

## Recommendation

Apply **Change 1 + Change 2 only** for the first pass — a single self-contained module plus one install line gives complete click→screen timing across every current and future button, with essentially zero risk and no per-frame cost. Collect a session's `dumpUITimings()` output, hand it back, and we'll use the real deltas to decide exactly which transitions deserve a loading animation. Add the precise `mark()` hooks (Changes 3–4) only for the specific transitions whose observer timing looks jittery once we see the data. All changes stay within `voxEx.html`.

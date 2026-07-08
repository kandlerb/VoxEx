# CCR-MAGIC-006: Spell polish — channeled beams, true-aim range, power scaling, impact FX

> **Status: AUDITED** (2026-07-08) — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-MAGIC-006 · **Build baseline**: `2026-07-07.102` (branch `ccr/magic-system`, all 5 magic phases) · **Author**: Kandler (design intent) + Claude (code audit / plan / self-audit)

**READ FIRST, implementer:** (1) CLAUDE.md sections "How to Work in This Repo", "Magic System", "Lockstep Registry", "JavaScript Code Quality Rules". (2) `magicSystem.md` §15 (as-built record — the code you are extending). (3) This CCR end-to-end BEFORE editing anything. Every "Before" snippet below is verbatim from build `2026-07-07.102` — if a Before snippet no longer matches the live file, STOP and reconcile (the code drifted after this audit); do not force the edit. Locate by grep anchor, never by line number. AUDIT FLAG / AUDIT NOTE callouts override your intuition — obey them.

**If you are an orchestrator agent that can spawn subagents:** the [Orchestration plan](#orchestration-plan-nested-subagents) section defines the agent tree, work packets, and copy-paste subagent prompts. Follow it instead of improvising a delegation structure.

---

## Audit record (2026-07-08, applied to this revision)

Every anchor, Before snippet, and cited helper was re-verified against build `2026-07-07.102`, and the draft's designs were checked for logic holes. All findings below are ALREADY FIXED in this document — they are listed so the implementer understands *why* the specs read the way they do, and so nobody "simplifies" a fix back into a bug.

**References verified (exists at .102, grep anchor):** `igniteFire` (~44673) · `findMobNear` (~45170) · `spawnProjectileTrail` (~45190) · `getBlockParticleColor` (~16154) · `springDamper` (~15274) · `MAX_TOTAL_LIGHTS = 12` (~7380) · `selectSpellSlot`/`cycleSpellSlot` (~48092/48104) · `stopMining` clears `castHeld` (~48115, confirming it is the single release funnel) · `uiManager.showToast` (used by `toggleMagicMode`) · `wireTapButton` · `recordTouchedChunk`/`flushTouchedChunks` · `debugCarveSphere` (console.time-instrumented). **All new identifiers confirmed net-new (zero grep hits):** `spellPower`, `adjustSpellPower`, `updatePowerDisplay`, `spellParam`, `SPELL_TARGET_RANGE`, `channelActive`, `channelSpellId`, `channelDepth`, `CRACKED_STONE/_DIRT/_PLANKS`, `crackedFrom`, `CRACKED_VARIANT`, `drawCrackOverlay`, `activeExplosions`, `BEAM_COLLAPSE_SPEED`, `placeWallEdit`.

| # | Finding (in the draft) | Resolution (in this revision) |
|---|---|---|
| F1 | A3's `powerScale` example showed ONE map keyed by spell name while the prose said "add to each entry" — contradictory; a literal implementer would build the wrong shape | A3 now shows the exact per-entry shape + the exact `spellParam()` accessor |
| F2 | `params.knockback` (=6) is a **radius**, and the draft scaled carve radius to 8 while leaving knockback radius at 6 — mobs standing inside the crater would take no knockback | Knockback radius is now derived: `carveRadius + 2` (A3) |
| F3 | Desktop channels had NO held-state: in magic mode the mouse branch returns before `leftMouseHeld` arms, so nothing would ever tick a desktop channel | B1 now specifies explicit `channelActive`/`channelSpellId` state, armed in the mouse branch, ticked in `animate()`, ended in `stopMining()` |
| F4 | A quick tap (<100 ms press-release) on a channeled spell would do nothing | Channel start performs one minimum dig tick immediately (B1) |
| F5 | Turning mid-channel: `channelDepth` earned on the old ray would let the beam/carve tunnel appear PAST un-carved wall on the new ray | Per-frame `channelDepth = Math.min(channelDepth, firstSolidDist + 0.5)` clamp (B2); beam sweeping is deliberate — do not "fix" it |
| F6 | Forced fireball impact at `t ≥ 1` placed the burst center inside the solid target block, wasting half of `igniteFireballBurst`'s AIR scan | Impact point = hit voxel center + `face * 0.5` (the AIR side) (C1) |
| F7 | Explosion knockback/damage/shake were scheduled on shell 3 (~140 ms after cast) — a blast that shoves you a seventh of a second late feels broken | Force/damage/shake/audio/light all fire at t=0; only carve + ignite + scarring stage across shells (D1) |
| F8 | Debris particles need the removed blocks' colors, but `carveSphereEdit` doesn't return IDs | Sample ~24 in-sphere block IDs BEFORE shell 1, stash on the staging entry (D1) |
| F9 | Shell staging had no scheduler spec | `activeExplosions` array ticked in the effects block, exact entry shape given (D1) |
| F10 | Draft claimed a transient 5th spell light was "inside MAX_TOTAL_LIGHTS=12 headroom" — dishonest: the shipped worst case is already 3+8+4+3=18 potential vs the 12 convention | Hard rule: spell lights steady+fading ≤ 5 total; a 6th spawn instantly kills the oldest fading light. Net worst-case delta vs shipped: +1 light for ≤80 ms (D3) |
| F11 | Particle collide flag only handles falling (`vy < 0`); horizontal wall penetration unhandled | Accepted limitation, documented — implementer must NOT expand scope (D2) |
| F12 | E7 cited "reuse spawn-safety checks" — no such helper exists | Concrete rule spelled out: 2-block AIR column, 3 step-up retries, else fizzle (E7) |
| F13 | Inventory overlay is NOT `#blocker` (verified in `onMouseWheel`'s own comment), so wheel-power also works with inventory open in magic mode | Accepted, harmless; documented (A2) |
| F14 | Instant char sphere (C2) chars burnables through thin walls (no line-of-sight) | Accepted at `charRadius ≤ 2`; do NOT add LOS raycasts (C2) |
| F15 | `CRACKED_VARIANT` build site was unspecified; and a variant with its own `crackedFrom` could chain | Build line goes in the existing BLOCK_CONFIG compile loop; variants must not declare `crackedFrom` themselves (C3) |
| F16 | Freeze 150 ms sweep cost unquantified | Bounded: power-5 AABB ≈ 15.6k iterations/sweep ≈ same order as the shipped 100 ms re-cast; approved (B3) |
| F17 | Per-frame dig `digRate * dt` can be < 1 voxel — calling `carveTubeEdit` for zero-voxel segments churns the DDA | Accumulate depth; only carve when ≥ 1 whole voxel of new depth exists (B2) |
| F18 | There are FOUR `castSpell` dispatchers at .102, not three — the draft missed `wireTapButton('touch-btn-cast2', …)` (~48531), a **tap** button with no release event; a channeled secondary started from it would never end until an unrelated reset path fired | `#touch-btn-cast2` is rewired as a HOLD button for channeled secondaries: `pointerdown` → `beginChannel`, `pointerup`/`pointercancel` → `endChannel` (copy the jump/crouch hold-button wiring pattern); one-shot secondaries keep tap behavior (B1) |

---

## Problem / Why

Five user-reported issues from first play sessions of the shipped magic system, each with a verified root cause:

1. **Laser strobes instead of being a solid beam.** `castLaser` calls `spawnBeam(..., params.beamMs)` with `beamMs: 140`, and `updateBeams` fades opacity linearly to 0 over that window. Holding to cast repeats `castSpell` every `SPELL_CAST_INTERVAL_MS = 100` ms, so a held laser is a sawtooth of overlapping 140 ms fade-outs — a flicker, not a beam.
2. **Explosion only works at arm's length.** `castExplosion` raycasts with `pickVoxel(origin, dir, SETTINGS.blockReach)` (default 8) — the shared block-interaction reach, not a spell param. Laser (24) and freeze (8) have their own short arbitrary ranges. Spells should land wherever the crosshair points.
3. **No power control.** Verified: no charge/scale mechanism exists anywhere in the cast path — `castSpell(id, mode)` dispatches `fn()` with no power argument; every cast function reads fixed `SPELL_BY_ID[..].params` plus fixed tuning consts.
4. **Impacts are abrupt.** Explosion = one-frame carve; fireball impact only seeds ≤4 flames; no impact scarring; frost particles fall through terrain (verified: `ParticleSystem.update` has no `getBlock` anywhere — no collision support exists).
5. **General un-smoothness.** Camera shake is per-frame `Math.random()` (jitter, not a decaying oscillation); spell lights fade but hard-evict (pop) at the cap; an evicted-dark projectile stays dark; discrete 100 ms repeat-casts make held freeze/laser feel like a machine gun.

## Approach

Four pillars, in dependency order. (1) **True-aim range + power scaling foundation**: long raycast range with the existing loaded-chunk fallback; a global `spellPower` (1–5) adjusted by the **scroll wheel** in magic mode (decision 2026-07-08 — zoom keys untouched; desktop magic-mode spell selection moves to number keys; touch swipe unaffected); per-spell effective params derived from power. (2) **Channeled delivery** for Laser and Freeze: while held, ONE persistent effect updated per frame with the carve advancing at a dig rate; on release, a collapse animation (beam tail travels hand→endpoint at a fixed speed). (3) **Deterministic fireball**: raycast the full range at cast time, animate the projectile along a parabola guaranteed to arrive at the aim point, cheap per-frame solid check for early detonation; impact instantly chars a power-scaled core via the existing `BURN_RESULT` table and seeds rim fire. (4) **Impact/feel FX**: staged multi-shell explosion carve + block-colored colliding debris, generic CRACKED_ scarring variants, opt-in particle terrain collision, sprung camera shake, light fade-in/out.

**Rejected (do not retry):** slow voxel-by-voxel explosion carve (re-meshes the same bands dozens of times; 3 shells is the budget ceiling) · per-block damage **overlay** at render time (one tile per face + no per-block metadata layer — same structural wall that forced FIRE's neighbor-derived orientation; fracture must be a block swap, C3) · physical free-flight fireball aim (replaced by deterministic path per user decision) · making all particles collide (only flagged emitters pay) · branching wheel-vs-power inside `cycleHotbar` (breaks touch spell selection — see A2 AUDIT FLAG).

**Performance gate:** power-5 explosion is radius 8 ≈ 2,145 blocks — this CCR finally forces the Stage-1 vs Stage-2 `bulkEdit` decision deferred in magicSystem.md §8.2. **Measure first**: run `window.debugCarveSphere` (already `console.time`-instrumented) at radius 4 / 6 / 8 on real hardware BEFORE implementing Phase D or enabling power ≥ 4. If the radius-8 hitch exceeds ~2 frames, implement Stage-2 `bulkEdit` (spec: magicSystem.md §8.2 Stage 2) as part of Phase D; otherwise ship Stage 1 and cap explosion at power 5 = radius 8.

## Version impact

- `VOXEX_BUILD`: bump per phase + `VOXEX_RECENT_CHANGES` entry per phase (always)
- `TERRAIN_GEN_VERSION`: **no** (no worldgen output change; cracked variants are spell-placed only)
- `CURRENT_CACHE_VERSION`: **no** (new block IDs only; no change to existing lighting semantics)
- `SETTINGS_VERSION`: **no** (no DEFAULTS overrides; nothing new goes in SETTINGS)

## New-symbol registry (implementer: declare EXACTLY these names; search the file for each before declaring — all were verified absent at .102)

| Symbol | Kind | Declared near (grep) | Phase |
|---|---|---|---|
| `SPELL_TARGET_RANGE` (=96) | const | `SPELL_CAST_INTERVAL_MS` | A |
| `spellPower` (=3), `SPELL_POWER_MIN/MAX` | let/const | `let castHeld` | A |
| `adjustSpellPower(delta)`, `updatePowerDisplay()` | function | spell globals | A |
| `spellParam(spell, key)` | function | `SPELL_BY_ID` build | A |
| `channelActive` (=false), `channelSpellId` (=0), `channelDepth` (=0), `channelCastMode` ("primary") | let | `let castHeld` | B |
| `beginChannel(spellId, mode)`, `endChannel()`, `tickChannel(dt)` | function | `castSpell` | B |
| `BEAM_COLLAPSE_SPEED` (=48) | const | `MAX_BEAMS` | B |
| `activeExplosions` (=[]) | const array | `EXPLOSION_TUNING` | D |
| `tickStagedExplosions(dt)` | function | `castExplosion` | D |
| `CRACKED_STONE` (=20), `CRACKED_DIRT` (=21), `CRACKED_PLANKS` (=22) | const | `ICE = 19` | C |
| `CRACKED_VARIANT` | Uint8Array(256) | `BURN_RESULT` | C |
| `drawCrackOverlay(...)` | function | `initTextures` glass tile | C |
| `TILE.CRACKED_STONE: 37/.._DIRT: 38/.._PLANKS: 39` | TILE entries | `TILE.ICE: 36` | C |
| `placeWallEdit(...)` | function | `convertConeEdit` | E4 |
| `SPELL_LIGHTNING` (=5), `SPELL_TERRAFORM` (=6), `SPELL_BLINK` (=7) + config entries + icon tiles 40–42 | const/config | `SPELL_CONFIG` | E5–E7 |

## Orchestration plan (nested subagents)

This CCR is written to be implemented by an orchestrator agent (e.g., Sonnet in Claude Code) that spawns subagents, which may spawn their own subagents. **Approved scope for this run: Phases A → B → C, committed per phase** (decisions log #8/#9). Phase D (gated on the carve measurement) and Phase E are later runs.

### Ground rules (violating any of these has caused real damage in this repo)

1. **ONE writer at a time.** `voxEx.html` is a single ~48K-line file. Never let two subagents edit it concurrently — no exceptions, including "they're touching different regions." Parallelism is for READ-ONLY work only (scouting code, reviewing diffs).
2. **Subagents start with ZERO context.** Every subagent prompt must be self-contained: absolute file paths, the CCR path + the exact section names to read, the grep anchors, and the required report format. Never write "as discussed above" in a subagent prompt.
3. **The orchestrator runs the gates itself** after every packet — do not accept a subagent's claim of green. `node tools/syntax-check.mjs` + `node tools/parity-check.mjs` after each packet; `node tools/run-browser-tests.mjs` at each phase end.
4. **Before-snippet mismatch = full stop.** If any subagent reports that a Before snippet doesn't match the live file, halt the phase, reconcile the drift yourself (re-audit that edit site), update this CCR, then resume. Subagents never improvise around drift.
5. **The reviewer is never the implementer.** Spawn a FRESH agent for review; its prompt gets only the diff, the CCR section, and the do-not list — not the implementer's reasoning (prior phases caught real bugs exactly this way; see magicSystem.md §15 "FIXES FROM REVIEW").
6. **Environment check first:** running in a Cowork/FUSE sandbox → read `docs/agent-notes.md` §7 before ANY git write and verify every commit with `git show HEAD:voxEx.html | tail` (must end `</html>`). Native Claude Code on Windows → §7 does not apply.
7. **Model budget:** scouts and reviewers work fine on a cheap/fast model; implementer packets should use the strongest model available to you. Keep each subagent's job small enough to finish well inside its context (that is what the packet boundaries below are for).

### Agent tree (per phase)

```
Orchestrator (persistent: owns the task list, gates, commits, this CCR's As-built notes)
└─ Phase coordinator (one per phase, spawned fresh; may spawn its own subagents ↓)
   ├─ Scout        (Explore-type, read-only, cheap — may run BEFORE the phase in parallel with the
   │                previous phase's review: re-grep every anchor in the phase, return verbatim
   │                current code per edit site, flag any drift vs this CCR's Before snippets)
   ├─ Implementer  (edits voxEx.html; ONE packet at a time, sequential)
   ├─ Test-writer  (edits tools/voxex-tests.html only, after the implementer finishes)
   └─ Reviewer     (fresh read-only agent; PASS/FAIL per requirement against the diff;
                    may spawn its own Explore sub-subagent to pull surrounding code context)
```

A phase coordinator that cannot spawn subagents (tool-restricted) should degrade gracefully: do scout → implement → test → self-review sequentially itself, but tell the orchestrator review was not independent so the orchestrator can spawn the fresh reviewer.

### Work packets (each row = one implementer-subagent dispatch, in order)

| Packet | CCR sections | Files touched | Done when |
|---|---|---|---|
| A-1 | A1 + A2 + A3 (+ registry, findings F1/F2) | voxEx.html | syntax+parity green; wheel/power/params compile |
| A-2 | A4 | voxEx.html (HTML+CSS+JS) | pips + 2 touch buttons exist, IDs match |
| A-3 | tests from A2/A3 Verify lines | tools/voxex-tests.html | suite green incl. new tests |
| A-4 | reviewer + phase gates + commit | — | review PASS, 3 gates green, committed |
| B-1 | B1 (+ F3/F4/F18 — all 5 wiring points incl. the cast2 hold-button) | voxEx.html | channel lifecycle works from console |
| B-2 | B2 (+ F5/F17) | voxEx.html | solid beam, depth clamp, collapse |
| B-3 | B3 (+ F16) | voxEx.html | frost stream + 150 ms sweeps |
| B-4 | tests from B1/B2 Verify lines | tools/voxex-tests.html | suite green |
| B-5 | reviewer + gates + commit | — | as A-4 |
| C-1 | C1 (+ F6) | voxEx.html | deterministic-impact suite test passes |
| C-2 | C2 (+ F14) | voxEx.html | char core works, power-gated |
| C-3 | C3 (+ F15; NUM_TILES BOTH copies; texture-tests) | voxEx.html + tools/voxex-texture-tests.html | parity P9 = 40; texture tests green |
| C-4 | tests from C Verify lines | tools/voxex-tests.html | suite green |
| C-5 | reviewer + gates + commit | — | as A-4 |

### Subagent prompt templates (copy, fill [brackets], send verbatim)

**Scout (Explore-type, read-only):**
> Read `D:\Projects\voxex\CCR's\CCR-MAGIC-006-spell-polish.md` sections [X]. For EVERY grep anchor and Before snippet in those sections, grep `D:\Projects\voxex\voxEx.html`, and return: the anchor, the current line number, the verbatim current code at that site, and MATCH or DRIFT vs the CCR's Before snippet. Do not edit anything. Report DRIFT items first.

**Implementer:**
> You are editing `D:\Projects\voxex\voxEx.html` (a single-file browser game — all code stays in this one file). First read, in `D:\Projects\voxex\CCR's\CCR-MAGIC-006-spell-polish.md`: section(s) [X], the "New-symbol registry", the "Implementer do NOT list", and audit findings [F-list]. Also read `D:\Projects\voxex\CLAUDE.md` section "JavaScript Code Quality Rules". Implement section(s) [X] EXACTLY as specified. Rules: before each edit, grep the anchor and confirm the Before snippet matches verbatim — on ANY mismatch, stop immediately and report the mismatch instead of adapting; declare ONLY symbol names from the registry, and search the file for each name before declaring it; obey every AUDIT FLAG/NOTE even where it contradicts your judgment; touch no code between `__TERRAIN_FUNCS`/`__TREE_FUNCS`/`__TERRAIN_PASS` markers. When done run `node tools/syntax-check.mjs` and `node tools/parity-check.mjs` and paste their full output, then list every edit site as (grep anchor → one-line description of the change).

**Reviewer (fresh agent, read-only):**
> Do not fix anything — report only. Read `D:\Projects\voxex\CCR's\CCR-MAGIC-006-spell-polish.md` section(s) [X], its "Implementer do NOT list", and audit findings [F-list]. Then review the working-tree diff of `D:\Projects\voxex` ([git diff command or attached diff]). For each numbered requirement and each AUDIT FLAG in section(s) [X], output PASS or FAIL with the exact evidence (anchor + code line). Additionally check: no duplicate declarations of [registry symbols in scope], no edits between worker injection markers, every do-not-list item respected. You may spawn a read-only Explore subagent to pull surrounding context from voxEx.html. End with a single verdict line: APPROVE or REJECT(reasons).

**Test-writer:**
> Read `D:\Projects\voxex\CCR's\CCR-MAGIC-006-spell-polish.md` section(s) [X] "Verify" lines. Add the tests they name to `D:\Projects\voxex\tools\voxex-tests.html`, following that file's existing suite/test registration pattern (read a nearby suite first and copy its shape; tests access game internals via the `window.VoxEx` ?test=1 seam). Any test that registers real fire cells or edits real chunks must clean up in a finally block (see the Phase-3 precedent noted in `VOXEX_RECENT_CHANGES`). Then run `node tools/run-browser-tests.mjs` and paste the result.

### Per-phase closeout (orchestrator, after the reviewer APPROVEs)

1. Gates: syntax → parity → full browser suite, all green (run them yourself).
2. Bump `VOXEX_BUILD` (date `.N`) + add a `VOXEX_RECENT_CHANGES` entry citing `VOXEX-MAGIC-006 Phase [A]` — include a NEEDS VERIFICATION list of in-game items.
3. Commit: stage ONLY touched files (never `git add -A`); message `feat(magic): CCR-MAGIC-006 Phase [A] — [summary]`; sandboxed → §7 procedure + truncation check.
4. Append a short as-built note to this CCR's As-built section (deviations, test count).

### Failure handling

- A gate fails after a packet → do NOT proceed; revert that packet's edits, re-dispatch the SAME packet with the failure output pasted into the implementer prompt.
- The same packet fails twice → stop the run and escalate to the human with the diff + failure output. Do not attempt a third variation.
- Reviewer REJECTs → implementer (new instance) gets the reviewer's evidence list as its input; reviewer re-reviews. One cycle only, then escalate.

## Changes

Phases are independently shippable, in order A → B → C → D → E; each gets its own `VOXEX_BUILD` bump + recent-changes entry. Within a phase, implement the edit sites in the order listed.

---

### Phase A — True-aim range + power scaling

#### A1 — Spell range becomes long and shared

**Location:** grep `castExplosion` in `voxEx.html`
**Why:** explosions cap at `SETTINGS.blockReach` (8).

**Before:**
```js
                const hit = pickVoxel(origin, dir, SETTINGS.blockReach);
                const tx = hit ? hit.x : Math.floor(origin.x + dir.x * SETTINGS.blockReach);
                const ty = hit ? hit.y : Math.floor(origin.y + dir.y * SETTINGS.blockReach);
                const tz = hit ? hit.z : Math.floor(origin.z + dir.z * SETTINGS.blockReach);
```

**After:** replace all four `SETTINGS.blockReach` occurrences in this function with `SPELL_TARGET_RANGE`, declared once next to `SPELL_CAST_INTERVAL_MS`:
```js
            /** Max spell targeting distance (blocks). pickVoxel returns null past loaded
             *  chunks, so the off-the-end fallback below still applies (magicSystem.md §6.1). */
            const SPELL_TARGET_RANGE = 96;
```
`pickVoxel` already handles everything else (skips AIR/WATER, null off the loaded world; `carveSphereEdit` already skips `undefined`/`UNLOADED_BLOCK` targets). Do not change laser/freeze ranges here — they become power-scaled in A3.

**Verify:** aim at a mountainside ~80 blocks away, cast explosion — crater at the crosshair. Aim at open sky — explosion at 96 blocks out (or nothing visible if unloaded; no error).

#### A2 — Scroll wheel routes to power in magic mode

**Location:** grep `const onMouseWheel` in `voxEx.html`
**Why:** decision 2026-07-08 — the wheel is the power dial; -/= zoom untouched. Tradeoff (accepted): desktop magic-mode spell selection is number-keys-only; touch swipe still cycles spells.

**Before (full function, verbatim):**
```js
            const onMouseWheel = function (event) {
                if (touchModeActive) return; // touch uses hotbar taps/swipe instead of wheel
                // Don't steal the wheel while a blocking menu (pause/settings/controls) is open —
                // let the browser scroll it. The inventory (#inventory-overlay) is NOT #blocker, so
                // wheel hotbar-cycling still works there. (CCR Issue #1A)
                const _blocker = document.getElementById("blocker");
                if (_blocker && _blocker.style.display !== "none") return;
                event.preventDefault();

                // Scroll always changes hotbar slot (zoom is now on - and = keys)
                if (event.deltaY > 0) cycleHotbar(1);
                else if (event.deltaY < 0) cycleHotbar(-1);
            };
```

**After (replace the last three code lines + stale comment):**
```js
                // Magic mode: wheel is the spell POWER dial (scroll up = more power).
                // Spell selection in magic mode: number keys (desktop) / hotbar swipe (touch).
                if (magicMode) {
                    if (event.deltaY < 0) adjustSpellPower(1);
                    else if (event.deltaY > 0) adjustSpellPower(-1);
                    return;
                }
                // Block mode: scroll changes hotbar slot (zoom is on - and = keys)
                if (event.deltaY > 0) cycleHotbar(1);
                else if (event.deltaY < 0) cycleHotbar(-1);
```

> **AUDIT FLAG (do not move this branch):** it must live in `onMouseWheel`, NOT inside `cycleHotbar`. Touch hotbar swipe funnels through `cycleHotbar` → `cycleSpellSlot` and MUST keep cycling spells (swipe is the touch spell selector; touch power gets buttons in A4). Branching inside `cycleHotbar` breaks touch spell selection.

> **AUDIT NOTE (F13):** the inventory overlay is not `#blocker`, so the wheel also adjusts power while the inventory is open in magic mode. Accepted and harmless — do not add an inventory check.

State + helpers, declared next to the other spell globals (grep `let castHeld`):
```js
            let spellPower = 3;                       // 1..5, global across spells
            const SPELL_POWER_MIN = 1, SPELL_POWER_MAX = 5;
            /** Adjust global spell power and refresh HUD. @param {number} delta - +1 or -1. @returns {void} */
            function adjustSpellPower(delta) {
                const p = Math.max(SPELL_POWER_MIN, Math.min(SPELL_POWER_MAX, spellPower + delta));
                if (p === spellPower) return;
                spellPower = p;
                updatePowerDisplay();
                uiManager.showToast(`Power ${p}`, "info");
            }
```

**Verify:** in magic mode the wheel changes pips + toast and does NOT move the spell slot; number keys still select spells; block-mode wheel still cycles the hotbar; touch swipe still cycles spells; `-`/`=` third-person zoom unchanged in both modes.

#### A3 — Power-derived params (exact shape — F1/F2)

**Location:** grep `const SPELL_CONFIG` in `voxEx.html`
**Why:** single source for per-spell scaling; cast functions read effective values through one accessor.

**After — each entry gains its OWN `powerScale` object** (5-element arrays indexed by `spellPower - 1`; keys shadow the same-named `params` key). Exact additions:
```js
                // in the SPELL_EXPLOSION entry:
                powerScale: { radius: [2, 3, 4, 6, 8] },
                // in the SPELL_LASER entry:
                powerScale: { boreRadius: [0.6, 0.6, 1, 1.5, 2], digRate: [8, 10, 12, 14, 16] },
                // in the SPELL_FIRE entry:
                powerScale: { burstRadius: [1, 1.5, 2, 3, 4], igniteMax: [2, 3, 4, 8, 12],
                              charRadius: [0, 0, 1, 1.5, 2], meshScale: [0.7, 0.85, 1, 1.3, 1.6] },
                // in the SPELL_FREEZE entry:
                powerScale: { halfAngleDeg: [14, 20, 28, 36, 44], range: [6, 7, 8, 10, 12] },
```
Accessor, declared right after the `SPELL_BY_ID` build loop:
```js
            /** Power-scaled spell param: powerScale table if present, else base params.
             *  @param {Object} spell - SPELL_BY_ID entry. @param {string} key - param name.
             *  @returns {number} effective value at the current spellPower. */
            function spellParam(spell, key) {
                const table = spell.powerScale && spell.powerScale[key];
                return table ? table[spellPower - 1] : spell.params[key];
            }
```
Every cast function replaces its `params.<key>` reads with `spellParam(spell, "<key>")` for scaled keys (unscaled keys — `speed`, `gravity`, `surfaceFreeze`, `beamMs` — keep reading `params`). Additional derived scaling:
- **Knockback radius (F2):** in `castExplosion`, pass `spellParam(spell, "radius") + 2` to `applyExplosionKnockback` instead of `params.knockback` (the base `knockback: 6` param becomes dead — remove it from the entry).
- **Force/damage/shake:** multiply `EXPLOSION_TUNING.mobDamage/mobKnockback/playerKnockback/playerUpkick` and the shake magnitude by `[0.5, 0.75, 1, 1.4, 1.8][spellPower - 1]` at the call sites (add `powerFactor()` returning that value next to `spellParam`). `igniteMax` for the explosion rim: `Math.round(EXPLOSION_TUNING.igniteMax * powerFactor())`.

> **AUDIT FLAG:** do NOT enable power 4–5 for explosion until the §Approach measurement gate is run and its result recorded in this file's As-built section. Until then clamp `SPELL_POWER_MAX` at 3 for explosion only (one-line check in `castExplosion`: `const eff = Math.min(spellPower, EXPLOSION_POWER_CAP)` reading its table at `eff - 1`).

**Verify:** suite tests — `spellParam` returns the table value for all 5 powers × all scaled keys, and the base param when no table; power 1 vs 3 explosion craters differ in-game.

#### A4 — Power HUD + touch buttons

**Location:** grep `id="mode-badge"` in `voxEx.html`
**Why:** power needs a visible cue and a touch input (touch has no wheel).

- `#mode-badge` gains `<span id="power-pips">` with 5 pip elements; `updatePowerDisplay()` sets a `data-power` attribute (or toggles a `filled` class on the first N pips) — one DOM write per change, zero per-frame cost. Call it once at init and from `adjustSpellPower`.
- Two buttons in the `#touch-buttons` cluster next to `#touch-btn-cast2`: `#touch-btn-power-down`, `#touch-btn-power-up`, CSS-gated to `body.magic-mode` (copy `#touch-btn-cast2`'s rule), wired: `wireTapButton('touch-btn-power-down', () => adjustSpellPower(-1)); wireTapButton('touch-btn-power-up', () => adjustSpellPower(1));`

**Verify:** DOM IDs exist in HTML and match JS; pips update from wheel AND buttons; buttons invisible in block mode; `node tools/syntax-check.mjs` green.

---

### Phase B — Channeled Laser + Freeze

#### B1 — Channel state machine (F3/F4)

**Location:** grep `function castSpell` in `voxEx.html`
**Why:** press/release semantics; desktop has no held-state in magic mode today (the mouse branch returns before `leftMouseHeld` arms — verified), so channels need their own flag.

New state (see registry) + three functions next to `castSpell`:
```js
            function beginChannel(spellId, mode) {
                const spell = SPELL_BY_ID[spellId];
                if (!spell || spell.delivery !== "channeled") return false;
                const now = performance.now();
                if (now - lastCastTime < SPELL_CAST_INTERVAL_MS) return false; // spam guard on STARTS
                lastCastTime = now;
                channelActive = true; channelSpellId = spellId; channelCastMode = mode; channelDepth = 0;
                spell.onChannelStart(spell);
                tickChannel(1 / 60);            // F4: a quick tap still produces one tick's effect
                return true;
            }
            function tickChannel(dt) {
                if (!channelActive) return;
                const spell = SPELL_BY_ID[channelSpellId];
                spell.onChannelTick(spell, dt);
            }
            function endChannel() {
                if (!channelActive) return;
                channelActive = false;
                const spell = SPELL_BY_ID[channelSpellId];
                spell.onChannelEnd(spell);
            }
```
Wiring (four existing funnels, no new listeners):
1. **`castSpell`** — at the top, before the spam-guard check: `if (spell.delivery === "channeled") { beginChannel(id, mode); return; }` (beginChannel does its own guard).
2. **`onMouseUp`** (grep `function onMouseUp`) — magic release: inside the `touchModeActive`-guarded function, add `if (magicMode) endChannel();` before the button checks (releasing either button ends any channel; harmless when none active).
3. **`stopMining`** (grep `function stopMining`) — add `endChannel();` as the last line. This is the single shared release funnel (verified: mouse-up, mode toggle, touch blur/pointercancel, pause, inventory-open all flow through it) — putting `endChannel` here covers every path; the `onMouseUp` call in (2) is for right-button releases which don't call `stopMining`.
4. **Per-frame tick** — in the `castHeld` consumer block (grep `HOLD-TO-CAST`), change to:
```js
                    if (castHeld && magicMode && isGameplayActive()) {
                        const _heldSpell = SPELL_BY_ID[selectedSpellId];
                        if (_heldSpell && _heldSpell.delivery === "channeled") {
                            if (!channelActive) beginChannel(selectedSpellId, "primary");
                        } else {
                            castSpell(selectedSpellId, "primary"); // one-shots: unchanged (self-guarded)
                        }
                    }
                    if (channelActive && isGameplayActive()) tickChannel(clampedDt);
```
   (`tickChannel` runs for desktop channels too — `channelActive` alone drives it; `castHeld` only matters for touch arming.)

> **AUDIT NOTE:** `SPELL_CONFIG` channeled entries replace `cast: castLaser` with `delivery: "channeled"` + `onChannelStart/Tick/End` fields. All FOUR `castSpell` dispatch sites at .102 (verified): `onMouseClick` (~47710), `touchPlaceBlock` (~48338), the HOLD-TO-CAST block (~47341), and `wireTapButton('touch-btn-cast2', …)` (~48531). The first three are covered by the routing above; the fourth needs F18's fix:

5. **`#touch-btn-cast2` (F18):** the current wiring is tap-only (`pointerdown`, no release). Replace it with hold-capable wiring: `pointerdown` → if the selected spell's SECONDARY is channeled, `beginChannel(selectedSpellId, "secondary")`, else `castSpell(selectedSpellId, "secondary")`; `pointerup`/`pointercancel` on the button → `endChannel()`. Copy the existing jump/crouch hold-button pattern (they already do press/release wiring); keep the `if (!touchModeActive) return;` + gameplay gates.

**Verify (suite tests, all must exist):** channel starts once per press (not per 100 ms); mode-toggle mid-channel ends it (`toggleMagicMode` → `stopMining` → `endChannel`); inventory-open mid-channel ends it; secondary-button release ends a secondary channel; `channelActive` never true with `magicMode` false; quick tap fires exactly one tick.

#### B2 — Solid laser channel (F5/F17)

**Location:** grep `function castLaser` in `voxEx.html`
**Why:** the strobe (Problem 1).

**Before (the strobe mechanism, verbatim):**
```js
                spawnBeam(origin, dir, beamLength, spell.color, params.beamMs);
```
(and `updateBeams`: `b.mesh.material.opacity = Math.max(0, b.remainingMs / b.durationMs);`)

**After (design — the laser entry becomes channeled):**
- `onChannelStart`: acquire ONE mesh from `_beamPool` (do NOT register it in `activeBeams` — the channel owns it); opacity ramps 0→1 over ~60 ms; `playLaser()` zap.
- `onChannelTick(spell, dt)`: re-read `getPlayerWorldPosition()` + `controls.getDirection(_pickDirTmp)` every frame. Then:
  1. `const firstSolid = pickVoxel(origin, dir, params.range);` `const solidDist = firstSolid ? distance(origin, firstSolid) : params.range;`
  2. **F5 clamp:** `channelDepth = Math.min(channelDepth, solidDist + 0.5);` (sweeping onto fresh wall re-grounds the dig frontier; beam sweeping across terrain while turning is DELIBERATE — do not prevent it).
  3. **F17 accumulate:** `channelDepth += spellParam(spell, "digRate") * dt;` clamp to `params.range`. Only when `Math.floor(channelDepth) > Math.floor(_lastCarvedDepth)`: `carveTubeEdit(originOffsetBy(_lastCarvedDepth), dir, channelDepth - _lastCarvedDepth, spellParam(spell, "boreRadius"), AIR)` then `_lastCarvedDepth = channelDepth`. (`_lastCarvedDepth` resets to 0 in `beginChannel`.)
  4. Rescale/position the owned mesh hand→`min(channelDepth, solidDist)` (reuse `spawnBeam`'s orient math as a shared helper or inline); move the endpoint sparks + ONE persistent spell light to the head (reuse the same light object — do not respawn per frame).
  5. Audio: retrigger a soft hum (`_playSimpleOsc('square', 800, 780, 0.18, 0.12)` via a new `playLaserHum()`) every ~150 ms while channeling.
- `onChannelEnd`: collapse — over `beamLen / BEAM_COLLAPSE_SPEED` seconds, animate the beam origin from the hand toward the endpoint (scale shrinks toward the far end), then hide + return the mesh to `_beamPool` and release the channel light. Implement as a tiny `collapsingBeams` list handled inside the existing `updateBeams` (a second entry kind: `{mesh, from, to, progress}`).

**Verify:** in-game — held laser is one steady solid beam that tracks aim, digs progressively deeper (visibly slower than instant), never pokes through un-carved wall after a fast turn, retracts forward on release; no flicker at any frame rate. Suite: `channelDepth` clamp unit test with a mocked `pickVoxel`.

#### B3 — Freeze becomes a frost stream (F16)

**Location:** grep `function castFreeze` in `voxEx.html`
**Why:** same press/release model.

The freeze entry becomes channeled:
- `onChannelStart`: `playFreeze()`.
- `onChannelTick`: (a) emit frost particles every frame, budgeted (≤6/frame), `collide: true` (D2), velocities spread inside the power-scaled cone; (b) every 150 ms (accumulator on the channel state), run `convertConeEdit(origin, dir, spellParam(spell,"range"), spellParam(spell,"halfAngleDeg"), ICE, id => id === WATER)` + `extinguishFireInCone(...)` — both already skip non-matching blocks, so repeat sweeps are cheap scans (power-5 AABB ≈ 15.6k iterations per sweep, same order as the shipped 100 ms re-cast).
- `onChannelEnd`: stop emitting; existing particles finish naturally (~200 ms visual taper for free). No carve on release.

**Verify:** holding freeze reads as a continuous cryo-jet; ice appears in 150 ms waves; frost settles on terrain; release tapers.

---

### Phase C — Deterministic fireball + instant char + generic CRACKED_

#### C1 — Raycast-first fireball (F6)

**Location:** grep `function castFireball` in `voxEx.html`

**Before:**
```js
                const vel = { x: dir.x * params.speed, y: dir.y * params.speed, z: dir.z * params.speed };
                spawnProjectile(origin, vel, params.gravity, FIREBALL_TUNING.life, spell.color, onFireballImpact);
```

**After (design):**
1. `const hit = pickVoxel(origin, dir, SPELL_TARGET_RANGE);`
2. Target point: if `hit`, **the AIR side of the face** — `{ x: hit.x + 0.5 + hit.face[0] * 0.5, … }` with `hit.face ?? [0,0,0]` (F6); else `origin + dir * SPELL_TARGET_RANGE`.
3. `const T = dist(origin, target) / params.speed;` spawn a projectile with `p.pathMode = true, p.pathFrom = origin copy, p.pathTo = target, p.pathT = 0, p.pathDur = T, p.arcHeight = dist * 0.08`.
4. In `updateProjectiles`, branch: path-mode projectiles skip gravity/velocity integration and instead `p.pathT += dt / p.pathDur;` position = lerp(from, to, t) + `(0, p.arcHeight * 4 * t * (1 - t), 0)`. KEEP the existing per-frame `BLOCK_IS_SOLID` + `findMobNear` checks (early detonation if something moved into the path). At `p.pathT >= 1`: force impact at `p.pathTo` exactly.
5. Mesh + light scale: `p.mesh.scale.setScalar(spellParam(spell, "meshScale"))` at spawn (shared geometry is fine — scale is per-mesh); reset scale to 1 in `releaseProjectile`.

> **AUDIT NOTE:** the parabola arcs ABOVE the straight ray — under a ceiling it can clip and detonate early. That is correct physical behavior; do not special-case it.

**Verify:** suite — cast at a known target 40 blocks out in the test world, step the sim, assert the impact voxel equals the raycast prediction; scale resets on pool reuse. In-game: long-range fireballs land on the crosshair.

#### C2 — Instant char core at impact (F14)

**Location:** grep `function onFireballImpact` in `voxEx.html`

Before the existing `igniteFireballBurst` call, add: iterate the sphere `charRadius = spellParam(spell, "charRadius")` (0 at power 1–2 — skip entirely when 0) around the impact; for each block with `isBurnable(id)`, `setBlock(x, y, z, BURN_RESULT[id])` (`LOG→BURNT_LOG`, `WOOD→BURNT_PLANKS`, `GRASS→DIRT`, `LEAVES→AIR` — the fire tick's own table, skipping the cling timer); batch with `recordTouchedChunk`/`flushTouchedChunks`. Then `igniteFireballBurst` runs with power-scaled `burstRadius`/`igniteMax` (A3).

> **AUDIT NOTE (F14):** yes, this chars burnables through a 1-block wall at charRadius 2. Accepted; do NOT add line-of-sight raycasts.

**Verify:** power-5 fireball into a tree: instant charred core + live spreading fire around it; power-1 fireball chars nothing (charRadius 0) but still ignites.

#### C3 — Generic "CRACKED_" mechanism (F15)

**Location:** grep `BURNT_PLANKS` (BLOCK_CONFIG entry) + `BURN_RESULT[block.id] = block.burnsTo` (compile loop) + `const NUM_TILES` (BOTH copies) in `voxEx.html`
**Why:** user decision 2026-07-08 — one reusable crack design applicable to any block. A render-time overlay is structurally impossible (one tile per face; no per-block metadata) — this is the same idea moved to texture-gen time + block swap.

1. **Crack stamp, authored once:** `drawCrackOverlay()` in `initTextures` near the glass tile generator — draws 2–3 jagged dark 1-px polylines + corner chips over an already-drawn tile at the current atlas offset (no circles). Signature: `(logicalOffset, seed)`.
2. **Three variants minted with it:** copy each base tile's generator output, then stamp. `CRACKED_STONE = 20` (tile 37), `CRACKED_DIRT = 21` (tile 38), `CRACKED_PLANKS = 22` (tile 39). **`NUM_TILES` 37 → 40 in BOTH copies** (parity-check P9 enforces).
3. **BLOCK_CONFIG entries:** `CRACKED_STONE`/`CRACKED_DIRT`: `tags: ["solid"]`, `crackedFrom: STONE` / `crackedFrom: DIRT`. `CRACKED_PLANKS`: `tags: ["solid", "burnable"], crackedFrom: WOOD, burnsTo: BURNT_PLANKS, burnTime: 5, spreadChance: 0.2` (cracked wood still burns like WOOD).
4. **Lookup, built in the existing compile loop** (the one that already reads `burnsTo`/`burnTime`): add
```js
                if (block.crackedFrom !== undefined) CRACKED_VARIANT[block.crackedFrom] = block.id;
```
   with `const CRACKED_VARIANT = new Uint8Array(256);` declared beside `BURN_RESULT`.
   > **AUDIT FLAG (F15):** variant blocks must NOT declare `crackedFrom` pointing at themselves or each other — `CRACKED_VARIANT[<variant id>]` stays 0, so cracked blocks never re-crack.
5. **Generic scar rule at all sites** (explosion rim within `radius+1` of the carve surface, laser bore walls, fireball impact patch): `const cv = CRACKED_VARIANT[id]; if (cv && Math.random() < 0.6) setBlock(x, y, z, cv);` inside the existing chunk batching. The 0.6 dither makes it read as fracture, not paint.
6. Solid+opaque ⇒ NO worker `IS_TRANSPARENT_WORKER`/`CULLS_SAME_ID_WORKER` entries (defaults correct); the only worker-template touch is `NUM_TILES`. Update `tools/voxex-texture-tests.html` (count 40 + 3 new tile checks) and the CLAUDE.md block table.

**Verify:** `parity-check.mjs` GREEN (P9 = 40); texture tests GREEN; suite test that `CRACKED_VARIANT[STONE] === CRACKED_STONE` and `CRACKED_VARIANT[CRACKED_STONE] === 0`; in-game craters show cracked rims, and a fireball-scarred plank wall cracks AND burns.

---

### Phase D — Impact & feel FX

**Prerequisite: the §Approach measurement gate result must be recorded in As-built before this phase ships.**

#### D1 — Staged explosion (F7/F8/F9)

**Location:** grep `carveSphereEdit(tx, ty, tz` in `voxEx.html`

`castExplosion` is restructured — **immediate at t=0:** knockback + mob damage + shake + `playExplosion()` + spell light + the F8 pre-sample (read ~24 random in-sphere block IDs via `getBlock` for debris colors, BEFORE any carve). **Staged:** push `{ x: tx, y: ty, z: tz, radius, shell: 0, nextAtMs: performance.now(), debrisIds }` onto `activeExplosions`; `tickStagedExplosions(dt)` (called in the effects block next to `updateBeams`) processes due entries: shell 1 = `carveSphereEdit` at `r/3`; shell 2 (+70 ms) at `2r/3` skipping inside `r/3`; shell 3 (+140 ms) at full `r` skipping inside `2r/3`, then rim ignite + cracked-variant scarring (C3) + the debris burst (particles colored via `getBlockParticleColor(debrisIds[i])`, `collide: true`) + lingering smoke. Add an optional `innerR2 = 0` last param to `carveSphereEdit` (skip voxels with `distSq <= innerR2`) — default 0 changes nothing for existing callers/tests.

> **AUDIT FLAG:** exactly 3 shells, ~70 ms apart. Do NOT add more shells or per-voxel timing (rejected — remesh budget). Do NOT move knockback/shake back into the shells (F7).

**Verify:** suite — staged entry carves the full sphere across 3 ticks (total voxel count equals the one-shot count for the same radius); knockback applies before any carve. Perf overlay: power-3 staged worst frame ≤ single-carve worst frame + ~2 ms.

#### D2 — Terrain-colliding particles, opt-in (F11)

**Location:** grep `p.vy -= p.gravity * dt;` (ParticleSystem.update) in `voxEx.html`

**Before:**
```js
                        // Physics
                        p.vy -= p.gravity * dt;
                        p.x += p.vx * dt;
                        p.y += p.vy * dt;
                        p.z += p.vz * dt;
```

**After:** add `particle.collide = options.collide ?? false;` in `spawn` (next to the `gravity` line), and immediately after the physics block:
```js
                        if (p.collide && p.vy < 0) {
                            const bid = getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
                            if (bid !== undefined && BLOCK_IS_SOLID[bid] === 1) {
                                p.y = Math.floor(p.y) + 1.001;   // rest on the top face
                                p.vx = 0; p.vy = 0; p.vz = 0; p.gravity = 0;
                                p.life = Math.min(p.life, 0.6);  // settle, then fade
                            }
                        }
```
Cost: one `getBlock` per flagged FALLING particle per frame, only inside the existing `updateDistance` gate. Default `false`; existing emitters unaffected.

> **AUDIT NOTE (F11):** horizontal penetration into walls is deliberately unhandled — do not add side checks.

**Verify:** suite — flagged particle above solid settles at `floor + 1.001` with zeroed velocity/gravity; unflagged passes through; perf overlay `particles` section unchanged with 100 flagged particles.

#### D3 — Sprung camera shake + light fades (F10)

**Location:** grep `triggerCameraShake` and `function spawnSpellLight` in `voxEx.html`

- **Shake:** replace the per-frame `(Math.random() - 0.5) * 2 * mag * falloff` on both axes with a decaying oscillation: at trigger time store two random phases; per frame `offset = mag * falloff * falloff * Math.sin(elapsed * 0.055 + phase)` per axis (elapsed in ms; ~9 Hz). Keep the existing save/apply/restore wrap in `renderFrame` exactly as is. Magnitude × `powerFactor()` at the explosion call site.
- **Spell light fades:** new lights ramp intensity 0→base over the first 50 ms of their life (factor `Math.min(1, age / 0.05)`); cap-evicted lights are NOT removed instantly — they get `remaining = Math.min(remaining, 0.08)` and keep fading (reuse the existing fade path). **Hard rule (F10): steady + fading spell lights ≤ 5 total; if a spawn would make 6, `scene.remove` the oldest fading one immediately.** Net worst-case vs shipped: +1 light for ≤80 ms.
- **Projectile light handoff:** in `releaseProjectile`, if the released projectile was lit and a dark in-flight projectile exists, light the oldest dark one (move the slot in `litProjectiles`).

**Verify:** in-game — shake reads as a thump ringing down; six rapid casts show no light pops; the third fireball regains light when the first lands. Suite: light-count invariant test (never > 5 spell lights in the scene).

---

### Phase E — Secondary casts + new spells (**approved 2026-07-08: ALL of E1–E7**; each its own build bump)

Suggested order: E1–E4 (complete existing spells) → E7 (cheapest new spell) → E5 → E6. E5–E7 each add one icon tile (`NUM_TILES` 40 → 43 stepwise; P9 guards every step) and a `SPELL_*` id (5–7) + `SPELL_CONFIG` entry — after Phase A/B exists, a new spell is config + cast function + icon only.

- **E1 Charged explosion (secondary):** hold right-click: power ramps from 1 toward current `spellPower` over 1.5 s (pips animate), release detonates via the normal staged path. Implement as a channeled secondary whose `onChannelEnd` fires the cast.
- **E2 Mining bore (laser secondary):** channeled, `boreRadius` one tier above current power's, `digRate` halved.
- **E3 Meteor (fireball secondary):** raycast target; spawn a path-mode projectile from `target + (0, 40, 0)` falling steeply (same C1 machinery, `arcHeight = 0`); power-scaled burst ×1.5; longer shake.
- **E4 Ice wall (freeze secondary):** new `placeWallEdit(center, viewDir, width, height, targetId)` — plane perpendicular to the horizontal view direction at the raycast point, `(3 + 2*spellPower) × 3` blocks, places ICE into AIR only (skip everything else), one `updateLocalArea` per touched chunk (copy `convertConeEdit`'s batching).
- **E5 Lightning:** instant at raycast point — 3–4 stacked thin emissive boxes with X/Z jitter from `y+12` down to the target, 90 ms lifetime (reuse the beam pool pattern); `igniteFire` at the strike (1–2 cells) + cracked-variant scar; white flash spell light; thunder = `_playSimpleOsc('sawtooth', 90, 30, 0.6, 0.5)` layered with `('square', 800, 200, 0.08, 0.3)`.
- **E6 Terraform:** channeled — grows a STONE pillar upward at the raycast point, 2 blocks/s × power (place into AIR only, cap height 12); the shape helper is `carveTubeEdit` pointed straight up with `targetId = STONE` and an AIR-only guard — verify `shouldSkipShapeEdit` semantics: it skips `currentId === targetId` but NOT other solids, so add an explicit `if (getBlock(...) !== AIR) continue;` predicate variant (small wrapper, do not modify the shared helper).
- **E7 Blink (F12):** raycast point; teleport rule: candidate = hit voxel + face normal; require `getBlock(candidate) === AIR && getBlock(candidate + up) === AIR`; on failure try up to 3 upward steps; else fizzle with a toast. Set player position via the same fields the spawn/load path uses (grep `player position` restore in `loadWorld` for the exact setter); frost-style particles at both ends; `playFreeze()`-like whoosh.

## Worker parity

- **No injected function is touched** (`__TERRAIN_FUNCS__`/`__TREE_FUNCS__`/`__TERRAIN_PASS__` markers untouched) — all spell code is main-thread. If you find yourself editing anything between injection markers, you are in the wrong place — STOP.
- `NUM_TILES` 37 → 40 (C3) → up to 43 (E5–E7): **both copies** (main + worker template), `parity-check.mjs` P9 enforces every step.
- Cracked variants are solid+opaque — **no** worker table entries (defaults correct). Do not add worker-side `CRACKED_*` consts.
- ICE/GLASS mesh routing unchanged; no new separate meshes; nothing added to the worker's `hasTorchFire`/`hasGlass` scan.

## Safety Checks

- [ ] `node tools/syntax-check.mjs` GREEN after EVERY phase
- [ ] `node tools/parity-check.mjs` GREEN after EVERY phase (P9 at 40, then 41/42/43)
- [ ] Terrain untouched — confirm no edits landed between injection markers (`git diff` inspection)
- [ ] `node tools/run-browser-tests.mjs` GREEN — new tests enumerated per phase in the Verify lines (A3 spellParam; B1 channel lifecycle ×6 paths; B2 depth clamp; C1 deterministic impact + scale reset; C3 CRACKED_VARIANT derivation; D1 staged-carve completeness; D2 settle; D3 light-count invariant)
- [ ] No duplicate/shadowed identifiers — every symbol from the New-symbol registry searched before declaring
- [ ] No new SETTINGS keys; no DOM IDs referenced that don't exist in the HTML (`#power-pips`, `#touch-btn-power-down`, `#touch-btn-power-up`)
- [ ] Touch handlers: `if (!touchModeActive) return;` first line; nothing added to `pointermove`; gates via `isGameplayActive()`
- [ ] No unbatched per-frame work: channel tick O(segment); collide only on flagged particles; exactly 3 shells; freeze sweep on the 150 ms accumulator
- [ ] **Measurement gate** (debugCarveSphere r=4/6/8, real hardware) recorded in As-built BEFORE Phase D / explosion power ≥ 4
- [ ] `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` per phase; CLAUDE.md (block table +3 cracked variants, Magic System section, Controls note: wheel = power in magic mode) + magicSystem.md §15 pointer + agent-notes (add the render-time-overlay rejection to the do-not-retry ledger) updated in the same commits

## Implementer "do NOT" list (each of these was considered and rejected — doing them is a bug)

1. Do NOT branch wheel-vs-power inside `cycleHotbar` (breaks touch spell selection — A2).
2. Do NOT schedule knockback/damage/shake on a carve shell (F7 — they fire at t=0).
3. Do NOT add more than 3 explosion shells or per-voxel carve timing.
4. Do NOT add line-of-sight checks to the char core (F14) or side-collision to particles (F11).
5. Do NOT put `endChannel()` anywhere except `stopMining()` + the `onMouseUp` magic branch.
6. Do NOT make `SPELL_CAST_INTERVAL_MS` or `spellPower` SETTINGS entries.
7. Do NOT modify the shared shape helpers' skip semantics (wrap them instead — E6).
8. Do NOT touch anything between worker injection markers, or add worker table entries for cracked variants.
9. Do NOT "fix" the beam sweeping across terrain while turning (F5 — the depth clamp is the fix; sweeping is intended).
10. Do NOT ship explosion power 4–5 before the measurement gate is recorded.

## Decisions log (resolved 2026-07-08, owner: Kandler)

1. **Power input** — scroll wheel in magic mode (zoom keys untouched; desktop magic-mode spell selection = number keys; touch swipe unaffected).
2. **Power step tables (A3)** — first-guess values approved; tune in-game.
3. **CRACKED_ (C3)** — approved as a generic mechanism (one compositor + `crackedFrom`-derived lookup; STONE/DIRT/PLANKS first). Runtime overlay rejected (structural — ledger candidate).
4. **Channeled freeze carve interval (B3)** — 150 ms approved.
5. **Fireball arc (C1)** — `dist * 0.08` approved as starting point.
6. **Touch power controls (A4)** — two buttons approved.
7. **Phase E scope** — ALL of E1–E7 approved.
8. **First implementation run scope** — Phases A → B → C only (Phase D gated on the carve measurement; D2/D3 + E in later runs). Run by a subagent-spawning orchestrator per the Orchestration plan.
9. **Commits** — one commit per phase as it lands (repo convention), with the §7 truncation check when committing from a sandbox.

**Still open (minor):** additional cracked variants beyond the first three (2 lines each); power-pip visual style.

## As-built (fill in AFTER implementation)

_(pending — MUST include: the r=4/6/8 carve measurements and the Stage-1 vs Stage-2 decision; per-phase deviations; final NUM_TILES; test count.)_

### Phase A (build 2026-07-08.1)

Implemented per the Orchestration plan: implementer edits done directly against `voxEx.html` (a fresh general-purpose subagent was used only for the independent Reviewer role, per ground rule 5; scouting/gate-running/committing done by the orchestrator itself, per ground rules 3/6/7). Packets A-1/A-2/A-3/A-4 all landed.

- **A1/A2/A3/A4 implemented as specified.** `SPELL_TARGET_RANGE=96`, wheel-routes-to-power (branch lives in `onMouseWheel`, not `cycleHotbar`, per the AUDIT FLAG), `powerScale` tables + `spellParam`/`powerFactor` accessors, `EXPLOSION_POWER_CAP=3` gate, `#power-pips` HUD + 2 touch buttons.
- **Deviation (correct, not a bug):** the CCR's A2 snippet calls `uiManager.showToast(...)`; the live codebase's actual pattern (used by `toggleMagicMode` itself, ~30 call sites) is the bare module-level `showToast(...)` — `uiManager` has no `showToast` method. Implemented using the real `showToast(...)` to match the live convention; the CCR's snippet would have thrown.
- **Review-caught gap (fixed before commit):** the first implementation pass wired `spellParam`/power scaling into `castExplosion` only — `spellParam()` was dead code everywhere else, so the power dial had zero effect on Laser, Fireball, or Freeze. A fresh independent reviewer subagent caught this (REJECT, first cycle); fixed by wiring `castLaser` (`boreRadius`), `castFreeze` (`range`, `halfAngleDeg`), and `onFireballImpact` (`burstRadius`, `igniteMax` — the now-dead `FIREBALL_TUNING.igniteMax` constant was removed) through `spellParam`. Reviewer re-reviewed the fix and APPROVEd (second cycle, per the CCR's one-cycle-then-escalate rule — not needed here since the second review passed).
- Explosion's dead `params.knockback` (a radius, mismatched against the new power-scaled carve radius per F2) removed from the SPELL_EXPLOSION config entry; knockback radius is now always `carveRadius + 2`, unconditionally applied (previously guarded by `params.knockback > 0`).
- No terrain/worker/atlas changes this phase; `NUM_TILES` unchanged at 37. No `SETTINGS`/`DEFAULTS` entries added.
- **Test count: 342 → 344** (spellParam/powerFactor/EXPLOSION_POWER_CAP/power-HUD coverage in the first pass, +2 regression tests added after the review fix that directly exercise `onFireballImpact`'s burstRadius/igniteMax scaling — the only one of the three fixed cast functions reachable via the `?test=1` seam without a live camera/controls).
- Gates: `syntax-check` GREEN, `parity-check` GREEN, full browser suite 344/344 GREEN.
- **NEEDS VERIFICATION (in-game, real hardware — this environment can't render):** wheel/button power changes feel right and don't fight zoom (`-`/`=` unchanged in both modes); power 1 vs 5 fireball/laser/freeze visibly differ; power 1 vs 3 explosion craters differ; number keys still select spells in magic mode; touch swipe still cycles spells.

### Phase B (build 2026-07-08.2)

Implemented per the Orchestration plan (same division of labor as Phase A: implementer edits done directly, fresh independent reviewer subagent for review only, orchestrator ran all gates/commits). Packets B-1/B-2/B-3/B-4/B-5 all landed. Review took 2 cycles (both against the same reviewer instance, per the failure-handling rule).

- **B1/B2/B3 implemented as specified**, including all 5 of B1's wiring points (`castSpell`'s channeled short-circuit, `onMouseUp`'s magic-mode `endChannel()`, `stopMining()`'s trailing `endChannel()`, the HOLD-TO-CAST per-frame arm/tick split, and F18's `#touch-btn-cast2` rewire to `wireHoldButton`), F5's per-frame depth-clamp, F17's whole-voxel-only carve accumulation, and F16's 150ms freeze sweep accumulator.
- **Extraction for testability (not in the CCR's literal text, judgment call):** F5/F17's clamp+accumulate math was pulled out of `laserChannelTick` into a small pure `nextLaserChannelDepth(depth, solidDist, digRate, dt, maxRange)` function so it's unit-testable without a live `pickVoxel`/chunk world (`pickVoxel` reads real chunk data directly, not through the `voxelWorld.getBlock` facade the existing test-stubbing idiom relies on, so it can't be mocked the way `carveSphereEdit`/`igniteFireballBurst` tests do). Behavior is identical, only named.
- **Review-caught gap (fixed before commit, cycle 1):** the first pass covered 3 of the 6 lifecycle behaviors named in B1's Verify line. Added a `toggleMagicMode()`-mid-channel test (drives the real function; had to stub `window.setSlotIcon` on the *iframe's own* window — `initTextures()`, which assigns that global, never runs in this headless test harness since `init()` is never called).
- **Discovered gap, NOT fixed (surfaced to human, cycle 2):** investigating the remaining two named behaviors ("inventory-open mid-channel ends it" and "channelActive never true with magicMode false") surfaced a genuine, pre-existing bug the reviewer independently confirmed by tracing the same call chain: `uiManager.openInventory()` → `exitGameplay("inventory")` → (desktop) `controls.unlock()` → `onGameplayFocusLost()` → `resetTransientInput()`. That last function resets `leftMouseHeld`/`rightMouseHeld`/`breakingBlock` etc. but **never calls `stopMining()` or `endChannel()`**. The CCR's own B1 rationale for routing everything through `stopMining()` ("verified: mouse-up, mode toggle, touch blur/pointercancel, pause, inventory-open all flow through it") is factually wrong for the inventory-open path — this predates Phase B (nothing in this diff touches that chain) but is now a real, visible symptom for the first time: **opening the inventory mid-laser-channel leaves the beam mesh + persistent light frozen in-scene** (frozen, not ticking, since `isGameplayActive()` gates `tickChannel`) until a later mouseup eventually fires `endChannel()`. Not fixed here — do-not list item 5 restricts `endChannel()` to `stopMining()`/`onMouseUp` only, and the actual fix site (`resetTransientInput`/`openInventory`/`exitGameplay`) is outside this CCR's B1 edit surface. **Needs a human decision**: either amend this CCR to accept the gap as known, or authorize a small follow-up (likely: call `stopMining()` — not `endChannel()` directly, to stay within the do-not list's letter — from `resetTransientInput()` or `onGameplayFocusLost()`). "`channelActive` never true with `magicMode` false" was left uncovered too, but is a design characteristic (not a regression): `beginChannel` has never checked `magicMode` itself, same caller-gated pattern `castSpell` already used pre-Phase-B.
- No terrain/worker/atlas changes this phase; `NUM_TILES` unchanged at 37. No `SETTINGS`/`DEFAULTS` entries added. `cast: null` now on both `SPELL_LASER`/`SPELL_FREEZE` (channeled spells never read it); `FIREBALL_TUNING.igniteMax` and the old one-shot `spawnFreezeParticles`/`FREEZE_FROST_PARTICLE_COUNT` removed as dead code superseded by Phase A/B's replacements.
- **Test count: 344 → 357.**
- Gates: `syntax-check` GREEN, `parity-check` GREEN, full browser suite 357/357 GREEN.
- **NEEDS VERIFICATION (in-game, real hardware — this environment can't render):** held laser reads as one steady solid beam, digs progressively deeper (visibly slower than instant), never pokes through un-carved wall after a fast turn, retracts forward on release, no flicker at any frame rate; held freeze reads as a continuous cryo-jet with ice appearing in visible 150ms waves, frost settling on terrain, tapering on release; the rewired `#touch-btn-cast2` still works as a press for the (still null) one-shot secondaries; and — the newly-discovered inventory-open-mid-channel stuck-beam/light symptom, to gauge real severity before deciding whether/how to fix it.

# CCR-MAGIC-007: Laser hand anchor + casting pose, webbed crack texture, fireball juice

> **Status: IMPLEMENTED** (Phases A/B/C all shipped on `main`, build `2026-07-09.3`) — moved to `Finished/`
> **ID**: VOXEX-MAGIC-007 · **Build baseline**: `2026-07-08.5` (main + uncommitted .4/.5 fixes) · **Author**: Kandler (play-test feedback) + Claude (code scout / spec)

**READ FIRST, implementer/orchestrator:** same rules as CCR-MAGIC-006 — read its "Orchestration plan (nested subagents)" section and follow it (ground rules, prompt templates, per-phase closeout, failure handling all apply verbatim to this CCR). Read CLAUDE.md "Magic System" + "JavaScript Code Quality Rules". Locate by grep anchor, never line number; a Before snippet that doesn't match the live file = STOP and reconcile. AUDIT FLAG/NOTE callouts override intuition.

## Problem / Why (play-test round 2, build .4/.5)

1. **The laser beam doesn't come from the player's left hand.** In 3rd person it originates from a synthetic eye-offset muzzle (`LASER_MUZZLE_RIGHT/DOWN`) that ignores the visible body entirely; in 1st person the muzzle is offset to the RIGHT while the user wants the LEFT hand. Requirement: the beam originates from the actual left hand, wherever that hand currently is, in both view modes — and the hand is raised while the beam is being cast.
2. **Cracked-variant texture reads as random black dots, not fracture.** Current `drawCrackOverlay` draws 2-3 short orthogonal random walks in near-black (`#1a1a1a`/`#0d0d0d`) plus fixed corner chips. User wants: MORE cracking, LESS black, grey shadowing around cracks, Minecraft-style webbing that radiates/forks from impact points.
3. **Fireball is lackluster.** Trail is 1 tiny particle/frame, impact is 14 modest particles, light is small (intensity 2.5, distance 8), cast sound is a 200 ms whoosh with no impact sound.

(Round-2 items already shipped in build `2026-07-08.5`, NOT in this CCR: tap-stuck channel fix, explosion power 4-5 + organic carve measurement, whole-beam laser lights, freeze particle density.)

## Approach

**(A) Hand anchor + casting pose:** a `getCastingHandPosition(out)` helper branching on `isThirdPerson` — 3P reads the real left-hand scene node's world position (the `torchHolder` Group on `leftElbowPivot`, exactly how the held-torch light/particles already do it); 1P reads the viewmodel left arm's world position (the viewmodel is `camera.add`-ed, so its nodes have valid world transforms). The laser channel uses this as the VISUAL beam origin (`muzX/Y/Z`), replacing the synthetic muzzle consts — the beam then follows the hand automatically, including during the raise animation. The raise itself uses the two existing per-frame pose-override idioms verbatim: the 3P mining-swing/torch-arm pattern inside `animatePlayerLimbs`, and direct pivot writes inside `animateViewmodelArms` for 1P. **Rejected:** parenting the beam mesh to the hand node (beam spans hand→world-target; it must live in world space and be re-aimed per tick, as it already is).

**(B) Crack texture:** rewrite `drawCrackOverlay` as an epicenter web — 1-2 impact points, 4-6 arms radiating outward with per-step jitter and one fork each, drawn in soft dark-grey with `ctx.globalAlpha` (tints over ANY base tile instead of stamping opaque near-black), plus a 1-px lighter-grey halo around every crack pixel at low alpha (the "grey shadowing"). No new tiles, no NUM_TILES change — tiles 37-39 just redraw differently.

**(C) Fireball juice:** denser/larger trail, brighter core + bigger light, an impact flash light + doubled impact burst with an expanding square ring (mini version of the explosion ring), a real impact thump sound, and a small proximity camera shake. All values scale with the existing `meshScale`/`powerFactor` machinery.

## Version impact

- `VOXEX_BUILD`: bump per phase + `VOXEX_RECENT_CHANGES` entries (always)
- `TERRAIN_GEN_VERSION` / `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION`: **no** (no worldgen/cache/DEFAULTS changes; no new tiles or block IDs)

## New-symbol registry (all verified absent at `2026-07-08.5`; search before declaring)

| Symbol | Kind | Declared near (grep) | Phase |
|---|---|---|---|
| `getCastingHandPosition(out)` | function | `laserChannelStart` | A |
| `_castHandPos` | scratch THREE.Vector3 | `_laserChannelLastDir` | A |
| `castingRaisePhase` | let (number) | `miningSwingPhase` | A |
| `playFireballImpact()` | AudioManager method | `playFireball` | C |
| `spawnFireballImpactRing(...)` | function | `spawnFireballImpactParticles` | C |

## Changes

### Phase A — Beam from the left hand + casting arm raise

#### A1 — `getCastingHandPosition(out)` helper

**Location:** declare above `laserChannelStart` (grep it); scratch vector next to `_laserChannelLastDir`.
**Why:** one origin source for both view modes, reusing the held-torch anchor idiom (verified precedent: the render loop's `flame.getWorldPosition(_torchWorldPos)` branch on `isThirdPerson`, grep `_torchWorldPos`).

```js
            /** @type {THREE.Vector3} Scratch for the casting hand's world position. */
            const _castHandPos = new THREE.Vector3();
            /**
             * World position of the player's casting (LEFT) hand for beam/effect origins,
             * branching on view mode (CCR-MAGIC-007 A1). 3P: the real left-hand node
             * (torchHolder Group on leftElbowPivot). 1P: the viewmodel left arm (camera-childed,
             * so world transforms are valid). Falls back to the eye position if either node is
             * missing (early boot / body not built yet).
             * @param {THREE.Vector3} out - Written in place.
             * @returns {THREE.Vector3} out.
             */
            function getCastingHandPosition(out) {
                if (isThirdPerson) {
                    const parts = playerBodyMesh && playerBodyMesh.userData.parts;
                    const node = parts && (parts.torchHolder || parts.leftElbow);
                    if (node) return node.getWorldPosition(out);
                } else if (playerArmsModel && playerArmsModel.userData.parts.leftArm) {
                    return playerArmsModel.userData.parts.leftArm.getWorldPosition(out);
                }
                const eye = getPlayerWorldPosition();
                out.set(eye.x, eye.y, eye.z);
                return out;
            }
```

> **AUDIT NOTE (verified structure):** `playerBodyMesh.userData.parts` exposes `torchHolder` (child of `leftElbowPivot`, grep `torchHolder.name = 'torchHolder'`) and `leftElbow`; `playerArmsModel` is `camera.add`-ed (grep `camera.add(playerArmsModel)`) with `userData.parts.leftArm` = the left arm pivot at camera-space `(-0.35, -0.40, -0.35)`. `getWorldPosition` is valid on all of them — the torch light already relies on this every frame.

**Verify:** suite — helper returns a finite Vector3 in both modes with the body/viewmodel present, and the eye fallback when absent.

#### A2 — Laser channel uses the hand as visual origin

**Location:** grep `const muzX = origin.x + _rvx * LASER_MUZZLE_RIGHT;` in `laserChannelTick`.
**Why:** replace the synthetic eye-offset muzzle with the real hand.

**Before (build .4's muzzle math):**
```js
                const _horiz = Math.hypot(ndx, ndz);
                const _rvx = _horiz > 1e-4 ? ndz / _horiz : 1;  // right = dir x worldUp, degenerate-safe
                const _rvz = _horiz > 1e-4 ? -ndx / _horiz : 0;
                const muzX = origin.x + _rvx * LASER_MUZZLE_RIGHT;
                const muzY = origin.y - LASER_MUZZLE_DOWN;
                const muzZ = origin.z + _rvz * LASER_MUZZLE_RIGHT;
```

**After:**
```js
                getCastingHandPosition(_castHandPos);
                const muzX = _castHandPos.x, muzY = _castHandPos.y, muzZ = _castHandPos.z;
```
Everything downstream (beam span muzzle→head, collapse anchors, carve/aim on the eye ray) already works off `muzX/Y/Z` — no other tick changes. Remove the now-dead `LASER_MUZZLE_RIGHT`/`LASER_MUZZLE_DOWN` consts (grep both; they were introduced in build .4 and have no other users — verify by grep before deleting).

> **AUDIT NOTE:** in 1P the viewmodel arm pivot sits ~0.5 blocks from the eye at lower-LEFT — the user's requested side (build .4's synthetic muzzle was on the RIGHT; this change also fixes that). Because A3 raises the arm while channeling, the beam origin rises with it for free.

**Verify:** in-game 1P: beam starts at the raised left hand; 3P orbit around the player: beam visibly starts at the body's left hand from every angle; collapse retracts along the same line.

#### A3 — Arm raise while channeling

**Location A (3P):** grep `// Mining arm swing (overrides other right arm poses)` in `animatePlayerLimbs`.
**Why:** the mining-swing block (verified at that anchor) is the exact per-frame override idiom — targets mutated after the state switch, before constraints + spring smoothing.

Add immediately after the mining-swing `if/else` block:
```js
                // Casting arm raise (CCR-MAGIC-007 A3): while channeling a spell, the LEFT arm
                // points forward at the aim, overriding torch/state poses (same idiom as the
                // mining swing above). Spring smoothing below makes the raise/lower feel natural.
                if (isThirdPerson && channelActive) {
                    castingRaisePhase += dt * 6;
                    targetArmLX = -1.35 + Math.sin(castingRaisePhase) * 0.05; // forward + slight tremble
                    targetArmLZ = 0.05;
                    targetLeftElbow = 0.1;
                } else {
                    castingRaisePhase = 0;
                }
```
with `let castingRaisePhase = 0;` declared next to `miningSwingPhase` (grep it).

**Location B (1P):** grep `function animateViewmodelArms`. After the bob/sway writes (verified: they set `parts.leftArm.position.y/.rotation.x/.rotation.z` directly), add:
```js
                // Casting raise (CCR-MAGIC-007 A3): channeling lifts the left viewmodel arm to
                // point at the aim; lerp toward the pose so enter/exit is smooth (~120ms).
                if (channelActive && parts.leftArm) {
                    const t = Math.min(1, dt * 8);
                    parts.leftArm.rotation.x += ((-0.55) - parts.leftArm.rotation.x) * t;
                    parts.leftArm.rotation.z += (0.0 - parts.leftArm.rotation.z) * t;
                    parts.leftArm.position.y += ((-0.28) - parts.leftArm.position.y) * t;
                }
```

> **AUDIT FLAG:** the 3P override must be placed AFTER the torch-arm override (grep `// Override LEFT arm position when holding torch`) so casting wins over torch-holding when both are active. Do NOT touch the spring/constraint plumbing itself.
> **AUDIT NOTE (open decision, owner):** with the torch active, the torch model sits in the same left hand the beam fires from. Accepted for v1 (the raise pose reads as "casting with the torch hand"); if it looks bad in-game, the follow-up is hiding the held torch while `channelActive` — do not implement that preemptively.

**Verify:** in-game 3P: arm raises toward the aim while channeling laser OR freeze, lowers smoothly on release; mining swing and torch pose still work when not channeling. 1P: left arm lifts while channeling. Tune the pose constants by eyeball.

### Phase B — Webbed crack texture

#### B1 — `drawCrackOverlay` rewrite

**Location:** grep `function drawCrackOverlay` in `initTextures`.
**Why:** Problem 2. Current body (verbatim, for drift detection): 2-3 orthogonal random walks in `#1a1a1a`/`#0d0d0d` + 6 fixed corner-chip pixels.

**After (algorithm — exact code left to the implementer, behavior is spec):**
1. Same signature `(logicalOffset, seed)`, same `SeededRNG` + `fillLogicalPixel` helpers (both in scope; verified).
2. **Epicenter web:** pick 1-2 epicenters (`rng`, biased toward the tile's middle half). From each, radiate `4 + floor(rng()*3)` arms at spread-out initial headings; each arm walks `4 + floor(rng()*5)` steps, stepping mostly along its heading with jitter (diagonal pixel steps allowed — the voxel rule bans curves/circles, not diagonals), and each arm forks once at ~40% probability (fork walks 2-4 steps at a diverged heading).
3. **Softer color via alpha tinting:** save `ctx.globalAlpha`; crack-core pixels drawn `#2e2b28` at `globalAlpha 0.8` (tints over any base tile — stone/dirt/planks each keep their character; NO pure black); every 3rd-ish core pixel `#1c1a18` at 0.8 for depth variation; restore alpha after.
4. **Grey halo ("shadowing"):** track core pixels in a `Set` of `x,y` keys; after the walks, paint the 4-neighborhood of every core pixel (where not itself core) `#8a857f` at `globalAlpha 0.30`.
5. Delete the fixed corner-chip pixels (the web replaces them).
6. Keep it deterministic per tile (seeded) — the three call sites (grep `drawCrackOverlay(tileX, 12345 + TILE.CRACKED_`) pass distinct seeds and stay unchanged.

> **AUDIT NOTE:** `fillLogicalPixel(tileX, gx, gy, color)` fills opaquely through `ctx.fillRect` — the alpha comes from setting `ctx.globalAlpha` around the calls (the ctx is shared module state in `initTextures`; ALWAYS restore it to its prior value or every later tile draws translucent).

**Verify:** `tools/voxex-texture-tests.html` still green (update its cracked-tile expectations if it asserts specific colors); in-game: cracked rims read as radiating grey fractures, not black dots — screenshot for the eyeball pass. Confirm non-cracked tiles are unaffected (the globalAlpha restore).

### Phase C — Fireball juice

#### C1 — Flight feel

**Location:** grep `function spawnProjectileTrail` and `const light = new THREE.PointLight(0xffffff, 2.5, 8, 2);` (in `acquireProjectile`).

- Trail: 1 → **2-3 particles/frame** (2 + 1 at 50% rng), sizes `0.10-0.22` (up from 0.08-0.14), lives up to 0.55 s, and a 15% chance of a bright ember (`r:1, g:0.8, b:0.3`, gravity 1). Keep the smoky mix.
- Light: intensity `2.5 → 3.5`, distance `8 → 12`. In `spawnProjectile`, scale both by the projectile's mesh scale if set (power-5 fireballs glow bigger; reset with the scale reset in `releaseProjectile` — grep `p.mesh.scale.setScalar(1)`).
- Core: `emissiveIntensity: 2 → 3` on the projectile material (grep it in `acquireProjectile`).

#### C2 — Impact feel

**Location:** grep `function onFireballImpact` and `function spawnFireballImpactParticles`.

- **Flash:** `spawnSpellLight(impactPos, 0xffcc66, 3.5, 0.25)` at the top of `onFireballImpact`.
- **Burst:** impact particles 14 → **28**, velocities ×1.6, plus a new `spawnFireballImpactRing(x, y, z)` — 12 particles on a horizontal square outline (copy the explosion ring's Chebyshev-normalized pattern, grep `explosionRing`, at 60% scale/speed, `type: "fireballRing"`).
- **Sound:** new `AudioManager.playFireballImpact()` — `this._playSimpleOsc('sine', 160, 45, 0.3, 0.45);` layered with `this._playSimpleOsc('square', 500, 120, 0.08, 0.2);` (thump + crack); called from `onFireballImpact`. Follow the `playBlockPlace` method shape (enabled guard + `initContext()`).
- **Shake:** `if (distSqToPlayer < 144) triggerCameraShake(0.012 * powerFactor(), 100);` (within 12 blocks; reuse the existing squared-distance idiom — no sqrt).

**Verify:** in-game power-3 fireball reads punchy at cast, in flight, and on impact; power-5 visibly bigger everywhere; suite unchanged-green (no pure-function changes; add a test only if `spawnFireballImpactRing` is made pure enough to seam-export — optional).

## Worker parity

**None.** No new tiles, block IDs, or injected-function edits; `NUM_TILES` stays 40 (crack tiles redraw in place). `parity-check.mjs` must stay green anyway (run it — it is free).

## Safety Checks

- [ ] `node tools/syntax-check.mjs` + `node tools/parity-check.mjs` GREEN after every phase
- [ ] `node tools/run-browser-tests.mjs` GREEN (374 baseline; add the A1 helper test)
- [ ] No duplicate/shadowed identifiers (registry above; search each before declaring)
- [ ] No per-frame allocations: `_castHandPos` is the ONLY Vector3 for hand reads (no `new` in tick/animate paths); trail/burst particles respect the shared 500 cap
- [ ] `ctx.globalAlpha` restored after every tinted draw in `drawCrackOverlay` (B1 audit note)
- [ ] Pose overrides placed exactly per A3's ordering flag; spring/constraint code untouched
- [ ] `VOXEX_BUILD` bump + `VOXEX_RECENT_CHANGES` entry per phase citing VOXEX-MAGIC-007; CLAUDE.md Magic System section updated where staled (muzzle consts removed, hand anchor + raise); this CCR's As-built filled in
- [ ] In-game eyeball items listed per phase (this CCR is mostly art/feel — the eyeball IS the acceptance test)

## Do NOT list

1. Do NOT parent the beam mesh to a hand node (world-space beam, re-aimed per tick — only the ORIGIN reads the hand).
2. Do NOT change the carve/aim ray (eye-based) — hand anchoring is visual-only, same as build .4's muzzle.
3. Do NOT touch spring/constraint plumbing in `animatePlayerLimbs`; only mutate `target*` values in the override slot.
4. Do NOT hide the held torch while casting (open decision — ship v1 with both visible).
5. Do NOT add tiles or bump `NUM_TILES` (crack rework redraws existing tiles 37-39).
6. Do NOT leave `ctx.globalAlpha` modified after `drawCrackOverlay` returns.
7. Do NOT exceed 3 trail particles/frame per projectile (12 projectiles × 3 = 36/frame worst case against the 500 cap).

## Open decisions (owner: Kandler)

1. Torch + casting in the same left hand (A3 note) — accept v1, revisit after eyeball.
2. Exact pose constants (A3) and crack palette/alpha values (B1) — tuned by eyeball, initial values above.

## As-built (fill in AFTER implementation)

### Phase A (build 2026-07-09.1)

Implemented A1/A2/A3 as specced. `getCastingHandPosition(out)` and `_castHandPos` declared exactly at the registry's stated locations; `castingRaisePhase` next to `miningSwingPhase`. `LASER_MUZZLE_RIGHT`/`LASER_MUZZLE_DOWN` deleted (grep-confirmed zero remaining code references before deletion). The 3P casting-raise override was placed immediately after the mining-swing block, which itself sits after the torch-arm override in the live file — satisfying the AUDIT FLAG (casting wins over torch) without needing to reorder anything. 1P lerp placed after the bob/sway writes in `animateViewmodelArms`, gated on `channelActive && parts.leftArm`. No spring/constraint plumbing touched; torch not hidden while casting (v1 decision, per the CCR's own note).

REVIEW FINDING, FIXED (fresh independent reviewer, 2 cycles): cycle 1 flagged the eye-fallback suite test for stubbing `VoxEx.controls` without nulling `VoxEx.cameraRig` (`getPlayerWorldPosition()` checks `cameraRig` FIRST). Fixed by exposing `cameraRig` as a get/set pair on the `?test=1` seam (mirrors `controls`) and nulling it defensively in both eye-fallback tests. Notably, the reviewer's own stated premise for *why* this mattered — "the live test iframe boots a real non-null `cameraRig`" — was independently tested and found FALSE: this headless iframe never runs the real `init()` (a pre-existing comment on the `controls` seam accessor already said so), and a live gate run proved it by crashing on `camera.position` when a test tried to rely on "the real live cameraRig" with no stubs at all. The reviewer, on re-review, agreed and flagged it as a miscalibration in its own evidence trail worth noting for future reviews (weigh in-repo comments already in context over general inference). Cycle 1 also flagged a missing `VOXEX_BUILD`/`VOXEX_RECENT_CHANGES` bump and a stale CLAUDE.md muzzle reference — both were closeout-timing items (due at closeout, not mid-diff), fixed in the same pass regardless. Cycle 2: APPROVE.

No terrain/worker/atlas changes (parity-check unaffected, NUM_TILES unchanged at 40); no SETTINGS/DEFAULTS entries. Test suite: 374 → 379. NEEDS VERIFICATION (in-game, real hardware — this sandbox can't render): beam visibly starts at the left hand in both 1P and 3P from every camera angle; left arm raises toward the aim while channeling and lowers smoothly on release; mining swing/torch pose unaffected when not channeling; torch + casting sharing the left hand doesn't look broken (open decision — may need a follow-up to hide the torch while casting).

### Phase B (build 2026-07-09.2)

Implemented B1 (`drawCrackOverlay` epicenter-web rewrite) in `voxEx.html` and mirrored the algorithm in `tools/voxex-texture-tests.html`'s own local copy. Same signature, same `SeededRNG`/`fillLogicalPixel`, same 3 call sites/seeds. No `NUM_TILES` change (tiles 37-39 redraw in place, parity P9 stays 40); no worker parity impact (texture generation isn't injected).

REVIEW FINDING, FIXED (fresh independent reviewer, 2 cycles): `drawCrackOverlay` itself passed cleanly on cycle 1 — matched the CCR's spec exactly (epicenter count/bias, arm count/heading/steps, fork probability, alpha tinting with `try`/`finally` restore, 4-neighborhood halo, no Do-Not-list violations, no new global symbols). The reviewer's one finding was that my first attempt to fix `tools/voxex-texture-tests.html`'s sanity check (an absolute `minLum < 30` → relative `minLum < avgLum - 20`) was itself VACUOUS: STONE's own dark flecks and PLANKS' own grain stripes already sit >20 below the tile's average luminance whether or not the overlay ever runs — the reviewer proved this by simulating both base-tile generators 500 times each, with and without the overlay, and got 500/500 pass either way. Fixed by snapshotting each cracked tile's pixels via `ctx.getImageData` immediately BEFORE `drawCrackOverlay` stamps it (same base-texture instance, so any difference is attributable only to the overlay), then requiring more than 2% of the tile's pixels to have actually changed. The reviewer re-simulated the new check: 500/500 pass with the overlay running (42-57% of pixels changed), 0/500 pass against a no-op control (0% changed) — confirmed genuinely non-vacuous. Cycle 2: APPROVE.

No terrain/worker/atlas changes (parity-check unaffected, NUM_TILES unchanged at 40); no SETTINGS/DEFAULTS entries; no `tools/voxex-tests.html` changes (this phase only touches texture generation, outside that suite's coverage). Test suite unaffected: still 379/379. NEEDS VERIFICATION (in-game, real hardware — this sandbox can't render): cracked rims read as radiating grey fractures, not black dots; non-cracked tiles are visually unaffected (confirms the `globalAlpha` restore holds in practice).

### Phase C (build 2026-07-09.3)

Implemented C1 (flight feel) and C2 (impact feel) in `voxEx.html` only — no test files touched, per the CCR's own "add a test only if optional" guidance (none of the touched functions are pure enough to seam-export usefully; they're all scene/particleSystem/audioManager-bound).

C1: `spawnProjectileTrail` now emits 2-3 particles/frame (2 guaranteed + 1 at 50% odds) at sizes 0.10-0.22, life up to 0.55s, with a 15% chance of a bright ember mutually exclusive with the existing smoky roll. `acquireProjectile`'s pooled light/material start at intensity 3.5/distance 12 (up from 2.5/8) and `emissiveIntensity: 3` (up from 2). `spawnProjectile` gained an optional `meshScale` param (default 1) that scales the mesh AND writes the light's intensity/distance as absolute values each spawn (no reset needed beyond the existing `releaseProjectile` mesh-scale-to-1); `castFireball`'s call site passes `spellParam(spell, "meshScale")` into the new param instead of a separate post-hoc `scale.setScalar()` call.

C2: `onFireballImpact` opens with a `spawnSpellLight` flash before any char/ignite logic; `spawnFireballImpactParticles` doubled to 28 particles at 1.6x velocity (all three axes); new `spawnFireballImpactRing(x,y,z)` mirrors `spawnExplosionParticles`' own Chebyshev-normalized square ring at exactly 60% scale/speed; new `AudioManager.playFireballImpact()` layers a sine thump with a square crack, following `playBlockPlace`'s enabled-guard/`initContext()` shape; a proximity camera shake fires within 12 blocks via a squared-distance check (no sqrt, same idiom as `applyExplosionKnockback`'s own player-distance gate).

REVIEW FINDING NONE — APPROVED FIRST PASS (fresh independent reviewer): all C1/C2 numeric/behavioral requirements matched spec exactly on direct inspection (trail particle distribution, ember/smoky mutual exclusivity, light/mesh scaling semantics, ring's 60% figures verified against the live `spawnExplosionParticles` source, camera-shake idiom verified against `applyExplosionKnockback`). The reviewer specifically traced the one real risk I flagged for it myself — the new camera-shake code calls `getPlayerWorldPosition()`, which throws in the headless test harness when `scene`/`camera`/`controls`/`cameraRig` are all undefined (the exact failure mode Phase A's original eye-fallback test hit) — and confirmed the `typeof scene !== "undefined" && scene` guard correctly keeps it inert in that harness (`scene` is only ever assigned inside `init()`, which the test suite never calls), then independently re-ran the full gate ladder (syntax/parity/379-suite) rather than trusting the reported numbers.

No terrain/worker/atlas changes (parity-check unaffected, NUM_TILES unchanged at 40); no SETTINGS/DEFAULTS entries. Test suite unaffected: still 379/379. NEEDS VERIFICATION (in-game, real hardware — this sandbox can't render): power-3 fireball reads punchy at cast/in-flight/impact; power-5 visibly bigger everywhere (trail, light, impact burst, ring); impact thump+crack sound is audible and not jarring; camera shake within 12 blocks feels like impact, not a glitch.

## Run summary (Phases A-C complete)

All three approved phases shipped on `main` (builds `2026-07-09.1`/`.2`/`.3`), each independently reviewed by a fresh reviewer subagent per the orchestration ground rules (2 cycles each for Phase A and Phase B, 1 cycle for Phase C), each phase gated (syntax-check + parity-check + the full 379-test browser suite, all green) and committed separately. Test suite grew 374 → 379 (Phase A's 5 new `getCastingHandPosition` tests; Phases B/C deliberately added none).

Every reviewer REJECT across the run was for a real, confirmed defect, never a style nitpick — and in one case (Phase A) the reviewer's own stated justification for its finding turned out to be empirically false, caught and corrected on the SAME cycle rather than accepted at face value. Two genuinely reusable lessons came out of this run: (1) this headless test iframe never runs the game's real `init()`, so `scene`/`camera`/`controls`/`cameraRig` are all undefined by default — any new code path that calls `getPlayerWorldPosition()` (directly or via a helper) needs an explicit guard or stub, and this bit both Phase A (an eye-fallback test) and nearly bit Phase C (the new camera-shake code, caught before it ever became a bug); (2) a "verify the fix isn't vacuous" instinct is worth building into sanity checks generally — Phase B's luminance-based crack-detection check passed 100% of the time whether or not the code under test ever ran, and only a snapshot-diff approach actually proved causation.

Open items carried forward, NOT part of this CCR's scope: the open decision on hiding the held torch while casting (A3, v1 ships with both visible); exact pose constants (A3) and crack palette/alpha values (B1) remain eyeball-tunable, not yet confirmed on real hardware (this sandbox cannot render the game). No terrain/worker/cache/settings version bumps were needed anywhere in this CCR.

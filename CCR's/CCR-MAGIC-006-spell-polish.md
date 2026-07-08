# CCR-MAGIC-006: Spell polish — channeled beams, true-aim range, power scaling, impact FX

> **Status: DRAFT** — DRAFT → AUDITED → IMPLEMENTED (then move to `Finished/`)
> **ID**: VOXEX-MAGIC-006 · **Build baseline**: `2026-07-07.102` (branch `ccr/magic-system`, all 5 magic phases) · **Author**: Kandler (design intent) + Claude (code audit / plan)

All "Before" snippets are verbatim from build `2026-07-07.102`. Grep the anchors — line numbers cited are hints only (CLAUDE.md drift rule).

## Problem / Why

Five user-reported issues from first play sessions of the shipped magic system, each with a verified root cause:

1. **Laser strobes instead of being a solid beam.** `castLaser` calls `spawnBeam(..., params.beamMs)` with `beamMs: 140`, and `updateBeams` fades opacity linearly to 0 over that window. Holding to cast repeats `castSpell` every `SPELL_CAST_INTERVAL_MS = 100` ms, so a held laser is a sawtooth of overlapping 140 ms fade-outs — a flicker, not a beam.
2. **Explosion only works at arm's length.** `castExplosion` raycasts with `pickVoxel(origin, dir, SETTINGS.blockReach)` (default 8) — the shared block-interaction reach, not a spell param. The fallback endpoint also multiplies by `blockReach`. Laser (24) and freeze (8) have their own short arbitrary ranges. The user expects spells to land wherever the crosshair points.
3. **No power control.** Verified: no charge/scale mechanism exists anywhere in the cast path — `castSpell(id, mode)` dispatches `fn()` with no power argument, and every cast function reads fixed `SPELL_BY_ID[..].params` plus fixed tuning consts (`EXPLOSION_TUNING`, `FIREBALL_TUNING`). User wants a live power dial (explosion size, fireball burst + projectile size, ice amount + cone width, laser bore + dig amount).
4. **Impacts are abrupt.** Explosion = one-frame carve ("boom, blocks are gone"); fireball impact only seeds up to 4 flames; no impact scarring on stone; frost particles fall through terrain (verified: `ParticleSystem.update` integrates gravity + position only — no `getBlock` anywhere in the particle step, and `spawn` exposes no collision option).
5. **General un-smoothness.** Camera shake is per-frame `Math.random()` offsets (jitter, not a decaying oscillation); spell lights fade out but hard-*evict* (instant pop) at the 4-light cap; a projectile whose light is evicted stays dark forever; discrete 100 ms repeat-casts make held freeze/laser feel like a machine gun rather than a stream.

## Approach

Four pillars, in dependency order. (1) **True-aim range + power scaling foundation**: give every spell a long raycast range with the existing loaded-chunk fallback, add a global `spellPower` (1–5) adjusted by the **scroll wheel** in magic mode (decision 2026-07-08, replacing the earlier -/= idea — zoom keys stay untouched; magic-mode spell selection moves to the number keys / touch swipe, see A2), and derive per-spell effective params from power. (2) **Channeled delivery** for Laser and Freeze: while held, ONE persistent effect updated per frame (solid beam / continuous frost stream) with the carve advancing at a dig rate; on release, a collapse animation (beam tail travels from hand to endpoint at `dist/speed` — the user's own design, and correct). (3) **Deterministic fireball**: raycast the full range up front, animate the projectile along a parabola guaranteed to arrive at the aim point (classic fake-projectile pattern), with a cheap per-frame solid check for early detonation; impact instantly chars a power-scaled core via the existing `BURN_RESULT` table and seeds rim fire. (4) **Impact/feel FX**: staged multi-shell explosion carve + block-colored debris, `CRACKED_STONE` scarring block, terrain-colliding particles (opt-in flag), sprung camera shake, light fade-in/out.

**Rejected:** slow voxel-by-voxel explosion carve (re-meshes the same chunk bands dozens of times — 2–4 shells is the budget-respecting version of the same visual); per-block damage/fracture *overlay* on existing blocks (the chunk format has no per-block metadata layer — same constraint that shaped FIRE's orientation design; fracture must be a block swap — see C3's generic cracked-variant mechanism); physical projectile with real aim (replaced by deterministic path per user request — the old behavior remains as the arc the path follows); making every particle collide (only flagged emitters pay the `getBlock` cost).

**Performance gate:** power 5 explosion is radius 8 ≈ 2,145 blocks — this CCR is what finally forces the Stage-1 vs Stage-2 `bulkEdit` decision deferred in magicSystem.md §8.2. **Measure first**: `window.debugCarveSphere` is already `console.time`-instrumented; run at radius 4/6/8 on real hardware before implementing Phase D. If p95 cast hitch at radius 8 exceeds ~2 frames, implement Stage-2 `bulkEdit` (spec already written: magicSystem.md §8.2 Stage 2) as part of this CCR; otherwise ship Stage 1 with a radius cap.

## Version impact

- `VOXEX_BUILD`: bump per phase + `VOXEX_RECENT_CHANGES` entries (always)
- `TERRAIN_GEN_VERSION`: **no** (no worldgen output change; CRACKED_STONE is spell-placed only)
- `CURRENT_CACHE_VERSION`: **no** (new block ID, no change to existing lighting semantics)
- `SETTINGS_VERSION`: **no** (no DEFAULTS overrides; any new settings are additive and merge-safe)

## Changes

Grouped into phases; each phase is independently shippable and separately build-bumped.

---

### Phase A — True-aim range + power scaling

#### A1 — Spell range becomes a real, long param

**Location:** grep `castExplosion` in `voxEx.html`
**Why:** explosions currently cap at `SETTINGS.blockReach` (8).

**Before:**
```js
                const hit = pickVoxel(origin, dir, SETTINGS.blockReach);
                const tx = hit ? hit.x : Math.floor(origin.x + dir.x * SETTINGS.blockReach);
                const ty = hit ? hit.y : Math.floor(origin.y + dir.y * SETTINGS.blockReach);
                const tz = hit ? hit.z : Math.floor(origin.z + dir.z * SETTINGS.blockReach);
```

**After:**
```js
                const hit = pickVoxel(origin, dir, SPELL_TARGET_RANGE);
                const tx = hit ? hit.x : Math.floor(origin.x + dir.x * SPELL_TARGET_RANGE);
                /* … ty/tz likewise … */
```
with a shared `const SPELL_TARGET_RANGE = 96;` near `SPELL_CAST_INTERVAL_MS`. Laser `range: 24` and freeze stream reach also derive from power (A3). `pickVoxel` already returns `null` past loaded chunks, so the fallback endpoint keeps working; 96 stays inside even a render-distance-8 world (128 blocks).

**Verify:** stand on a hill, aim at a mountainside ~80 blocks away, cast explosion — crater appears at the crosshair.

#### A2 — Scroll wheel routes to power in magic mode

**Location:** grep `const onMouseWheel` in `voxEx.html`
**Why:** decision 2026-07-08 — the wheel is a better live power dial than -/= (which stay third-person zoom, untouched). Accepted tradeoff: in magic mode the wheel no longer cycles spell slots — with only 4 (later 7) spells, the number keys select spells on desktop; touch swipe still cycles spells (see AUDIT FLAG).

**Before:**
```js
            const onMouseWheel = function (event) {
                if (touchModeActive) return; // touch uses hotbar taps/swipe instead of wheel
                /* … #blocker menu check … */
                event.preventDefault();

                // Scroll always changes hotbar slot (zoom is now on - and = keys)
                if (event.deltaY > 0) cycleHotbar(1);
                else if (event.deltaY < 0) cycleHotbar(-1);
            };
```

**After:**
```js
                // Magic mode: wheel is the spell POWER dial (scroll up = more power).
                // Spell selection in magic mode: number keys (desktop) / hotbar swipe (touch).
                if (magicMode) {
                    if (event.deltaY < 0) adjustSpellPower(1);
                    else if (event.deltaY > 0) adjustSpellPower(-1);
                    return;
                }
                if (event.deltaY > 0) cycleHotbar(1);
                else if (event.deltaY < 0) cycleHotbar(-1);
```

> **AUDIT FLAG:** branch in `onMouseWheel`, NOT inside `cycleHotbar`. Touch hotbar swipe funnels through `cycleHotbar` → `cycleSpellSlot` and MUST keep cycling spells (swipe is the touch spell selector; touch power gets its own buttons, A4). Putting the branch in `cycleHotbar` would break touch spell selection. Also update the now-stale `// Scroll always changes hotbar slot` comment.

New state + helper next to the other spell globals (grep `let castHeld`):
```js
let spellPower = 3;                       // 1..5, global across spells
const SPELL_POWER_MIN = 1, SPELL_POWER_MAX = 5;
function adjustSpellPower(delta) {
  const p = Math.max(SPELL_POWER_MIN, Math.min(SPELL_POWER_MAX, spellPower + delta));
  if (p === spellPower) return;
  spellPower = p;
  updatePowerDisplay();                   // A4 pips
  uiManager.showToast(`Power ${p}`, "info");
}
```

**Verify:** in magic mode the wheel changes pips + toast and no longer moves the spell slot; number keys still select spells; block-mode wheel still cycles the hotbar; touch swipe still cycles spells; `-`/`=` third-person zoom unchanged in BOTH modes. Search file first — `spellPower`/`adjustSpellPower` must be net-new names.

#### A3 — Power-derived params

**Location:** grep `const SPELL_CONFIG` in `voxEx.html`
**Why:** single source for how each spell scales; cast functions read effective values.

**After (add to each entry; base `params` unchanged):**
```js
// per-spell multiplier tables indexed by spellPower-1 (explicit tables, not formulas,
// so each step is a deliberately tuned value):
powerScale: {
  explosion: { radius: [2, 3, 4, 6, 8] },                       // blocks
  laser:     { boreRadius: [0.6, 0.6, 1, 1.5, 2], digRate: [8, 10, 12, 14, 16] }, // blocks/s channeled
  fire:      { burstRadius: [1, 1.5, 2, 3, 4], igniteMax: [2, 3, 4, 8, 12],
               charRadius: [0, 0, 1, 1.5, 2], meshScale: [0.7, 0.85, 1, 1.3, 1.6] },
  freeze:    { halfAngleDeg: [14, 20, 28, 36, 44], range: [6, 7, 8, 10, 12] },
}
```
plus a tiny accessor `spellParam(spell, key)` that returns the power-scaled value or the base param. Knockback/damage/shake magnitude scale with the same index (explosion `EXPLOSION_TUNING` values × `[0.5, 0.75, 1, 1.4, 1.8]`).

> **AUDIT FLAG:** radius 8 explosion ≈ 2,145 blocks. Do NOT ship power 5 before the §Approach measurement gate is run; if Stage 1 hitches, Stage-2 `bulkEdit` (magicSystem.md §8.2) lands in this phase, not later.

**Verify:** browser-suite unit tests on `spellParam` (all 5 powers × 4 spells return the table values); in-game power 1 vs 3 explosion craters differ visibly.

#### A4 — Power HUD + touch controls

**Location:** grep `id="mode-badge"` in `voxEx.html`
**Why:** power needs an always-visible cue and a touch story (CLAUDE.md touch rules).

- `#mode-badge` gains 5 pip spans (`#power-pips`), filled count = `spellPower`, pure CSS + one `updatePowerDisplay()` DOM write on change (no per-frame cost). Updated by both the wheel (A2) and the touch buttons.
- Two small touch buttons `#touch-btn-power-down` / `#touch-btn-power-up` next to `#touch-btn-cast2`, CSS-gated to `body.magic-mode`, wired via the existing `wireTapButton(id, () => adjustSpellPower(∓1))` — the identical shared-action pattern as `#touch-btn-magic`. (Touch has no wheel, so buttons are the touch power dial; hotbar swipe remains the touch spell selector.)

**Verify:** DOM IDs exist in HTML and match JS (checklist rule); pips update from both keyboard and touch; buttons invisible in block mode.

---

### Phase B — Channeled Laser + Freeze

#### B1 — New delivery type: `channeled`

**Location:** grep `function castSpell` in `voxEx.html`
**Why:** press/release semantics instead of discrete repeat-casts.

Design: spells whose `delivery === "channeled"` get `onChannelStart(spell)` / `onChannelTick(spell, dt)` / `onChannelEnd(spell)` instead of a one-shot `cast()`. Integration points (all existing funnels, no new listeners):

- **Desktop:** the `onMouseClick` magic branch starts a channel for channeled spells (`channelActive = true`) instead of `castSpell`; `onMouseUp` (grep `function onMouseUp`) gains `if (magicMode && channelActive) endChannel();` before `stopMining()`.
- **Touch:** `onLookHoldFired` already sets `castHeld` in magic mode; the per-frame `castHeld` consumer (grep `HOLD-TO-CAST`) becomes the channel tick for channeled spells; `stopMining()` (the single release funnel — every reset path already goes through it, per the Phase-4 as-built) additionally calls `endChannel()`.
- The per-frame tick lives in the existing `isGameplayActive()` effects block next to `updateBeams(clampedDt)`.
- Explosion and Fireball stay one-shot (`castSpell` unchanged for them); the 100 ms spam guard still applies to one-shots and to channel *starts*.

> **AUDIT NOTE:** `stopMining()` is the correct single release funnel — Phase 4's as-built traced every reset path (mouse-up, mode toggle, blur/pointercancel, pause, inventory-open) through it. Put `endChannel()` there, not at individual call sites.

**Verify:** new browser-suite tests: channel starts once per press (not per 100 ms), ends on every release path (simulate mode-toggle mid-channel, inventory-open mid-channel); no `leftMouseHeld`/`castHeld` stuck-flag regressions.

#### B2 — Solid laser channel

**Location:** grep `function castLaser` + `function updateBeams` in `voxEx.html`
**Why:** the strobe (Problem 1).

**Before (the strobe mechanism):**
```js
                spawnBeam(origin, dir, beamLength, spell.color, params.beamMs);
                /* … updateBeams: b.mesh.material.opacity = Math.max(0, b.remainingMs / b.durationMs); */
```

**After (design):** the laser channel owns ONE beam mesh for its whole lifetime (acquired from `_beamPool`, not registered in `activeBeams`):

- `onChannelStart`: acquire mesh, opacity ramps 0→1 over ~60 ms (fade-IN, not out).
- `onChannelTick(dt)`: re-read `getPlayerWorldPosition()` + `controls.getDirection()` every frame; advance a `channelDepth` by `digRate * dt` (power table, A3) up to `params.range`; call `carveTubeEdit` ONLY for the newly-entered segment (origin offset by previous depth — the helper already normalizes `dir` and skips already-AIR voxels, so short segments are cheap); re-scale/position the mesh from hand to current carve head; endpoint sparks + one persistent spell light follow the head (reuse, don't respawn).
- `onChannelEnd`: collapse animation — over `beamLength / BEAM_COLLAPSE_SPEED` (~48 blocks/s) animate the beam's *origin* from the hand toward the endpoint (scale shrinks, position advances), then release to pool. This is the user's "collapse away from the hands" design and is purely cosmetic.
- Audio: retrigger a soft `playLaserHum()` (square, low volume, ~200 ms) every ~150 ms while channeling; `playLaser()` zap on start.

**Verify:** in-game — held laser is one steady solid beam that tracks aim, digs progressively deeper, and retracts forward on release; no flicker at any frame rate.

#### B3 — Freeze becomes a frost stream

**Location:** grep `function castFreeze` in `voxEx.html`
**Why:** same press/release model; freeze re-cast every 100 ms is wasteful and jerky.

`onChannelTick`: emit frost particles continuously (budgeted per frame, `collide: true` from D3 so they settle on terrain); apply `convertConeEdit(..., ICE, id => id === WATER)` + `extinguishFireInCone` on a modest interval (~150 ms) rather than per frame — both already skip non-matching/already-ICE blocks, so repeat sweeps are near-free scans; power scales `halfAngleDeg`/`range` (A3) and the particle stream width matches the cone. `onChannelEnd`: stream tapers over ~200 ms (no carve on release; the "collapse" here is just the particle tail catching up).

**Verify:** holding freeze looks like a continuous cryo-jet, ice appears progressively, frost settles on the ground; releasing tapers rather than cutting.

---

### Phase C — Deterministic fireball + instant char + scarring

#### C1 — Raycast-first fireball

**Location:** grep `function castFireball` in `voxEx.html`
**Why:** guaranteed hit at the crosshair (Problem 2/user design); current projectile is real physics and can land elsewhere.

**Before:**
```js
                const vel = { x: dir.x * params.speed, y: dir.y * params.speed, z: dir.z * params.speed };
                spawnProjectile(origin, vel, params.gravity, FIREBALL_TUNING.life, spell.color, onFireballImpact);
```

**After (design):** raycast `pickVoxel(origin, dir, SPELL_TARGET_RANGE)` at cast time → target point (or off-the-end fallback). Travel time `T = dist / params.speed`. The projectile becomes **path-parameterized**: each frame advance `t += dt/T` and place the mesh on a parabola from hand to target (lateral = lerp, vertical = lerp + `arcHeight * 4t(1-t)`, `arcHeight ∝ dist * 0.08` so long shots arc visibly). Keep the existing per-frame solid check (`BLOCK_IS_SOLID[getBlock(...)]`) and `findMobNear` so anything that moved into the path detonates it early — the deterministic point is where it *ends up* if nothing intervenes. At `t ≥ 1`, force impact at the raycast target exactly. Mesh + light scale by `meshScale` power table (A3) via `p.mesh.scale.setScalar(...)` — the shared `_projectileGeometry` is per-mesh-scaled, no geometry change.

`spawnProjectile`/`updateProjectiles`/pooling/light-cap machinery is reused as-is; only the integration step branches on `p.pathMode`.

**Verify:** browser-suite test — cast at a known target 40 blocks away, step the sim, assert impact voxel == raycast voxel; in-game long-range fireballs land on the crosshair.

#### C2 — Instant char core at impact

**Location:** grep `function onFireballImpact` in `voxEx.html`
**Why:** user wants blocks at the impact point to burn instantly, with more fire at higher power.

**After (design):** before rim ignition, iterate the sphere `charRadius` (power table; 0 at low power) around the impact: for each burnable block (`isBurnable(id)`), `setBlock(x, y, z, BURN_RESULT[id])` — the same table the fire tick uses (`LOG→BURNT_LOG`, `WOOD→BURNT_PLANKS`, `GRASS→DIRT`, `LEAVES→AIR`), just skipping the cling timer. Then `igniteFireballBurst` with power-scaled `burstRadius`/`igniteMax` (A3) seeds spreading fire around the char. Batch remesh via the existing `recordTouchedChunk`/`flushTouchedChunks` pattern.

**Verify:** power-5 fireball into a tree: instant charred core + live spreading flames around it; ignition counts scale with power (suite test on `igniteMax` table).

#### C3 — Generic "CRACKED_" mechanism: one crack design, composited onto any block (blocks 20–22, tiles 37–39)

**Location:** grep `BURNT_PLANKS` (BLOCK_CONFIG) + `const NUM_TILES` (both copies) in `voxEx.html`
**Why:** user decision 2026-07-08 — make CRACKED_ a reusable precedent, not a one-off stone block.

**Constraint check on the "layer a tile onto any block at render time" reading:** the mesher assigns exactly ONE atlas tile per face (single UV per face, one material), and the chunk format has no per-block metadata to record cracked-ness — a true runtime overlay would need either a second texture layer in the mesher (shader + UV plumbing rework) or a decal mesh driven by per-block state that has nowhere to live or persist. **REJECTED: runtime crack overlay** (same structural wall that forced FIRE's neighbor-derived orientation). **ACCEPTED — the same idea moved to texture-gen time:**

- **One reusable crack stamp**, authored once: `drawCrackOverlay()` in `initTextures` — 2–3 jagged dark 1-px polylines + corner chips (no circles), drawn OVER an already-rendered base tile in the atlas strip. This is the "generic CRACKED_ that can be added onto any block": minting a cracked variant of any block is one compositor call + one `BLOCK_CONFIG` entry.
- **Initial set (3 variants):** `CRACKED_STONE = 20` (tile 37), `CRACKED_DIRT = 21` (tile 38), `CRACKED_PLANKS = 22` (tile 39) — the three block families spells realistically scar. **`NUM_TILES` 37 → 40 in BOTH copies** (parity-check P9 enforces).
- **Generic application at world time:** a `CRACKED_VARIANT` Uint8Array(256) lookup (0 = no variant), built from a `crackedFrom: <baseId>` field on the variant's `BLOCK_CONFIG` entry. All scar sites share one rule: `const cv = CRACKED_VARIANT[id]; if (cv) setBlock(x, y, z, cv);` — adding a cracked variant for another block later is 1 config entry + 1 compositor call, zero changes at the scar sites.
- `CRACKED_STONE`/`CRACKED_DIRT`: `tags: ["solid"]`. `CRACKED_PLANKS`: `tags: ["solid", "burnable"], burnsTo: BURNT_PLANKS, burnTime: 5, spreadChance: 0.2` — cracked wood still burns like WOOD (nice interaction with fireball for free). All solid+opaque ⇒ no worker transparency/cull entries needed; the only worker touch is `NUM_TILES`.
- Applied at: explosion rim (surviving blocks with a variant within `radius+1` of the carve surface, dithered ~60% so it reads as fracture, not paint), laser bore walls, fireball impact patch. All inside the existing shape-helper chunk batching.
- `tools/voxex-texture-tests.html`: tile count 40 + per-tile checks for the 3 new tiles.

**Verify:** `parity-check.mjs` GREEN (P9 at 40); texture tests GREEN; suite test on `CRACKED_VARIANT` derivation from `crackedFrom`; in-game craters show cracked stone/dirt rims, and a fireball-scarred plank wall both cracks AND catches fire.

---

### Phase D — Impact & feel FX

#### D1 — Staged explosion (the "animation")

**Location:** grep `carveSphereEdit(tx, ty, tz` in `voxEx.html`
**Why:** one-frame carve reads as a glitch, not an explosion.

**After (design):** `castExplosion` schedules a tiny 3-entry sequence instead of carving once: shell 1 (`r/3`) immediately + flash light + shake start; shell 2 (`2r/3`) at ~70 ms; shell 3 (full `r`) + rim ignite + cracked-variant scarring (C3) + knockback at ~140 ms. Each shell is `carveSphereEdit` with an inner-radius skip (add optional `innerR2` param so shells don't re-visit carved voxels). Debris: on the final shell, sample up to ~24 of the removed block IDs and spawn particles colored via the existing `getBlockParticleColor(blockType)` with `collide: true` (D3) — blocks visibly "fly out" and land. Smoke column lingers 2–3 s.

> **AUDIT NOTE:** 3 shells = at most 3 immediate band rebuilds of the same chunks ~70 ms apart. That is the budget ceiling — do NOT add more shells or per-voxel timing (rejected in §Approach).

**Verify:** measured — power-3 staged explosion's worst frame ≤ the current single-carve worst frame + ~2 ms; visually reads as an outward blast.

#### D2 — Terrain-colliding particles (opt-in)

**Location:** grep `p.vy -= p.gravity * dt;` (ParticleSystem.update) in `voxEx.html`
**Why:** frost/debris passing through the ground breaks the illusion; user explicitly wants settling frost.

**Before:**
```js
                        // Physics
                        p.vy -= p.gravity * dt;
                        p.x += p.vx * dt;
                        p.y += p.vy * dt;
                        p.z += p.vz * dt;
```

**After (design):** add `particle.collide = options.collide ?? false;` in `spawn`, and after integration:
```js
                        if (p.collide && p.vy < 0) {
                            const bid = getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
                            if (bid !== undefined && BLOCK_IS_SOLID[bid] === 1) {
                                p.y = Math.floor(p.y) + 1.001;   // rest on top face
                                p.vx = 0; p.vy = 0; p.vz = 0; p.gravity = 0;
                                p.life = Math.min(p.life, 0.6);  // settle, then fade
                            }
                        }
```
One `getBlock` per *flagged falling* particle per frame, only inside the existing `updateDistance` gate — at frost/debris counts (≤ ~100 flagged) this is well under budget. Default stays `false`; existing emitters unaffected.

**Verify:** suite test — flagged particle dropped above a solid block settles at `floor+1.001` with zeroed velocity; unflagged particle passes through. Frame cost: no measurable `particles` section increase in the perf overlay with 100 flagged particles.

#### D3 — Sprung camera shake + light fades

**Location:** grep `triggerCameraShake` and `function spawnSpellLight` in `voxEx.html`
**Why:** random-per-frame rotation offsets read as jitter; light cap-eviction pops.

- Shake: replace the per-frame `(Math.random()-0.5)*2*mag*falloff` with a damped oscillation — two fixed random phase seeds at trigger time, offset = `mag * falloff² * sin(elapsed * freq + phase)` per axis (or drive through the existing `springDamper()`); magnitude scales with `spellPower`. Same save/apply/restore wrap in `renderFrame` (keep it — it's correct).
- Spell lights: new lights ramp intensity 0→base over ~50 ms; cap-evicted lights move to a fast 80 ms fade-out list instead of `scene.remove` popping (cap accounting counts them until removed — transiently 5 lights for 80 ms is inside `MAX_TOTAL_LIGHTS = 12` headroom with the 8-torch pool rarely saturated; document this).
- Projectile lights: when a lit projectile impacts/expires, hand its light slot to the oldest dark in-flight projectile instead of leaving it dark (`litProjectiles` already tracks order).

**Verify:** in-game — shake feels like a thump that rings down, not static; casting 6 spells rapidly shows no light pops; third fireball regains light when the first lands.

---

### Phase E — Secondary casts + new spells (**approved 2026-07-08: ALL of E1–E7 are in scope**; each still lands as its own build bump)

The architecture is complete and all four `castSecondary` are `null` — this phase fills them, plus three new spells that reuse this CCR's machinery. E5–E7 each add one icon tile (`NUM_TILES` 40 → up to 43 as they land; P9 guards every step) and a `SPELL_*` id (5–7). Suggested order: E1–E4 (complete the existing spells) → E7 (cheapest new spell) → E5 → E6.

- **E1 Charged explosion (secondary):** hold right-click to grow radius from power-1 to current power over 1.5 s (crosshair pips fill), release to detonate. Reuses A3 tables + D1 staging.
- **E2 Mining bore (laser secondary):** channeled wide-bore (`boreRadius` +1 tier), half dig rate — a deliberate tunnel-digger.
- **E3 Meteor (fireball secondary):** raycast target, spawn the path-parameterized projectile from ~40 blocks above the target falling steeply; power-scaled burst. Almost entirely C1 reuse.
- **E4 Ice wall (freeze secondary):** place a `5×3`(×power) ICE plane perpendicular to view at the raycast point via a new `placeWallEdit` shape helper (trivial variant of `convertConeEdit`'s loop with a plane gate, placing into AIR only).
- **E5 Lightning (new spell):** instant vertical emissive voxel bolt (3–4 stacked thin boxes with jitter) at the raycast point, ignite + `CRACKED_STONE` scar + white flash light + noise-burst thunder (`_playSimpleOsc` sawtooth 90→30 layered with a short square blip). Cheap, very on-vibe.
- **E6 Terraform (new spell):** inverse carve — channeled STONE pillar/wall growth using the existing shape helpers with `targetId = STONE` and an AIR-only predicate. Nearly zero new machinery.
- **E7 Blink (new spell):** teleport to the raycast point (+1 above surface, reuse spawn-safety checks), frost-style particles at both ends. Trivial and fun.

New spells need: `SPELL_*` id, `SPELL_CONFIG` entry, icon tile (+1 each, P9 guards the count), hotbar assignment via the existing inventory. No new UI plumbing.

## Worker parity

- **No injected function is touched** (`__TERRAIN_FUNCS__`/`__TREE_FUNCS__`/`__TERRAIN_PASS__` markers untouched) — all spell code is main-thread.
- `NUM_TILES` 37 → 40 (C3), then +1 per E-phase spell icon (up to 43 with E5–E7): **both copies**, `parity-check.mjs` P9 enforces every step.
- The three cracked variants are solid+opaque — worker transparency/cull tables need **no** entries (defaults are correct). Add worker-side `CRACKED_*` consts ONLY if a worker table entry ever references them (it shouldn't).
- ICE/GLASS routing unchanged; no new separate meshes.

## Safety Checks

- [ ] `node tools/parity-check.mjs` GREEN (P9 at the new tile count)
- [ ] `node tools/syntax-check.mjs` GREEN
- [ ] Terrain untouched — `terrain-node-checks` N/A (confirm no worldgen edits crept in)
- [ ] `node tools/run-browser-tests.mjs` GREEN — new tests: `spellParam` tables, channel start/end paths (incl. mode-toggle + inventory-open mid-channel), deterministic-impact assertion, particle collide/settle, no stuck `castHeld`/`channelActive`
- [ ] No duplicate/shadowed identifiers (`spellPower`, `adjustSpellPower`, `channelActive`, `CRACKED_STONE`/`_DIRT`/`_PLANKS`, `CRACKED_VARIANT`, `drawCrackOverlay`, … — search before declaring)
- [ ] New DOM IDs exist + match JS: `#power-pips`, `#touch-btn-power-down`, `#touch-btn-power-up`
- [ ] Touch handlers: `if (!touchModeActive) return;` first line; nothing added to `pointermove`; gates via `isGameplayActive()`
- [ ] No unbatched per-frame work: channel tick is O(segment); collide flag only on flagged particles; shells capped at 3
- [ ] **Measurement gate run** (debugCarveSphere r=4/6/8 on real hardware) BEFORE power 5 / Phase D ships; Stage-2 `bulkEdit` decision recorded here
- [ ] `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` per phase; CLAUDE.md (block table for cracked variants, magic section, wheel-is-power-in-magic-mode in the Controls notes) + magicSystem.md §15 pointer + agent-notes updated in the same commits

## Decisions log (resolved 2026-07-08, owner: Kandler)

1. **Power input** — scroll wheel in magic mode (replaces the -/= proposal; zoom keys untouched). Accepted tradeoff: desktop magic-mode spell selection is number-keys-only; touch swipe unaffected. (A2)
2. **Power step tables (A3)** — first-guess values approved; tune in-game.
3. **CRACKED_ (C3)** — approved as a GENERIC mechanism: one reusable crack compositor + `crackedFrom`-derived `CRACKED_VARIANT` lookup; ships with STONE/DIRT/PLANKS variants. Runtime overlay rejected (no per-block metadata layer / one tile per face — structural, candidate for the do-not-retry ledger after implementation).
4. **Channeled freeze carve interval (B3)** — 150 ms sweep approved.
5. **Fireball arc (C1)** — `dist * 0.08` approved as starting point; flatten if long shots feel floaty.
6. **Touch power controls (A4)** — two buttons approved.
7. **Phase E scope** — ALL of E1–E7 approved.

**Still open (minor):** which additional blocks get cracked variants after the initial three (mechanism makes each a 2-line addition); exact power-pip visual style.

## As-built (fill in AFTER implementation)

_(pending)_

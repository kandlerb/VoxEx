# Zombie AI Investigation — Findings, Fixes & Optimizations

> Investigation round only. No code was changed. All line numbers refer to `voxEx.html` as of 2026-06-13.

## Overview

There is exactly **one mob type: the zombie**. There is no other living entity (the player body is separate, not a mob). The AI is a clean **rule-pipeline** system:

- `updateZombies(dt)` (~33353) fills a shared `_mobCtx` once per frame, then runs each mob's ordered rule list.
- Rules live in `MOB_RULES` (~32997): `despawnWhenFar → tickTimers → burnInSunlight → attackInReach → chaseInRange → wanderWhenIdle → moveWithPhysics → faceAndAnimate`.
- `MOB_TYPE_CONFIG.zombie` (~33234) selects which rules apply; `MOB_RULE_SETS.dying = [collapseAndExpire]` is swapped in on death.
- Movement is **purely greedy/reactive steering** — no graph search. `chaseInRange` (~33064) steers toward the player; `pickZombieMoveDirection` / `probeDirectionForZombie` (~32953) probe forward + two side detours ~1.6 blocks ahead.
- `damageMob` (~33262) applies damage + knockback; `startMobDeath` (~33278) and `collapseAndExpire` (~33212) handle death.

The architecture is solid and extensible. The problems are concentrated in (a) the hit/death reaction, and (b) the fact that steering is local-only with a self-defeating jump gate.

---

## Part 1 — Bugs

### BUG 1 — Death topple ignores hit direction (zombies don't reliably fall away from you)
**Severity: High (matches your report)**
**Where:** `collapseAndExpire` (~33212), `startMobDeath` (~33278), `damageMob` (~33262)

**Cause:** On death the rule set is replaced with only `collapseAndExpire`, which topples purely around the mob's facing-relative X axis:
```js
mob.rotation.x = -ease * Math.PI * 0.45;   // always a "forward" topple
```
`rotation.y` (yaw) is **frozen at whatever it was on the last living frame** — and `faceAndAnimate` is no longer running. So the fall direction is entirely determined by which way the zombie happened to be facing when it died, *not* by where you are:
- Killed mid-attack → yaw faces you → it topples **toward** you.
- Killed just after a hit → `faceAndAnimate` had already rotated it to face its knockback velocity (away from you) → it topples **away**, but only by coincidence.
Nothing captures the actual damage direction, so the result looks random.

**Recommended fix:** Capture a death direction at the moment of the killing blow and topple relative to it.
1. In `damageMob`, before `startMobDeath`, compute the horizontal hit direction (the knockback vector, or player→mob if no knockback) and store it: `ud.deathDir.set(kbX, 0, kbZ)` (normalized; fallback to player→mob).
2. In `startMobDeath`, set the mob's yaw to face the player (`Math.atan2(-deathDir.x, -deathDir.z)`) so the topple axis is consistent.
3. Keep the forward topple — now "forward" reliably means "away from the player." Optionally add a tiny random roll (`rotation.z`) for variety so corpses don't all fall identically.

---

### BUG 2 — Knockback makes the zombie turn its back to you ("turning away")
**Severity: High (this is the core of what you noticed)**
**Where:** `faceAndAnimate` (~33186), `damageMob` (~33262)

**Cause:** `damageMob` adds the knockback to velocity (it points *away* from you, along your look direction). On the next frame `faceAndAnimate` unconditionally yaws the mob toward its velocity vector:
```js
if (mob.userData.state !== "attack") {
    if (velXSq + velZSq > 1e-8) mob.rotation.y = Math.atan2(vel.x, vel.z);
}
```
Because velocity now points away from you, the zombie **spins around to face the direction it's being shoved**. Once drag kills the knockback and `chaseInRange` re-accelerates it back toward you, it spins around *again*. That is exactly the "turn around, get pushed, turn back to pursue" behavior — the zombie is just always facing its current velocity.

**Recommended fix:** Add a short **hit-stun / knockback timer** and suppress velocity-facing during it.
1. In `damageMob`, set `ud.hitStunTimer = ZOMBIE_CONFIG.hitStunDuration` (e.g. `0.35`) and record the threat direction (player position).
2. In `faceAndAnimate`, if `ud.hitStunTimer > 0`, **face the player/threat** instead of the velocity vector (and decrement the timer). The zombie then slides backward while still facing you — the natural "getting knocked back" look.
3. (`tickTimers` is the natural place to decrement `hitStunTimer` if you prefer to keep timers together.)

---

### BUG 3 — Every hit triggers an upward hop ("jumping away")
**Severity: Medium**
**Where:** `damageMob` (~33269)

**Cause:**
```js
if (Math.abs(vel.y) < 0.1) vel.y = 2.5; // small hop on hit
```
Combined with the horizontal knockback (5) and the wrong facing (Bug 2), every hit launches the zombie up and back while spun around — reading as "it jumps away from me." The hop alone isn't wrong, but its magnitude + always-on behavior amplify the other two bugs.

**Recommended fix:** Make the hop conditional and smaller. Only hop when actually grounded (track a `grounded` flag set in `moveWithPhysics` when a downward collision zeroes `vel.y`), and reduce to ~`1.0–1.5`. Better: gate it behind a chance or only apply on the killing blow. Once Bug 2 is fixed (zombie keeps facing you), even the current hop will look like a stagger rather than a leap.

---

### BUG 4 — Zombies can't climb a step directly in front of them (jump gate is self-defeating)
**Severity: High (this is your "be able to jump up blocks" request)**
**Where:** `chaseInRange` (~33086–33111), `probeDirectionForZombie` (~32953)

**Cause:** `probeDirectionForZombie` returns `Infinity` the moment it sees a solid block at foot or foot+1 height ahead:
```js
if (isSolidBlock(gx, footY, gz) || isSolidBlock(gx, footY+1, gz)) return Infinity;
```
A climbable **1-block step** is exactly that — a solid foot-height block. So the forward direction scores `Infinity`. But the jump logic that would hop the step is **nested inside** `if (moveDir.score !== Infinity)`:
```js
const moveDir = pickZombieMoveDirection(pos, mobTmpA, sideDir);
if (moveDir.score !== Infinity) {
    ...
    // jump check lives HERE — never reached if the step blocks the path
}
```
If forward and both detours are blocked by the step, `moveDir.score === Infinity`, `stateHandled` stays false, and the mob **falls through to `wanderWhenIdle` and wanders off randomly** instead of jumping. So zombies only climb steps when they happen to approach where a side-detour is clear. This is why step/stair climbing is unreliable.

**Recommended fix:** Distinguish "climbable step" from "wall" in the probe and decouple the jump from the score gate.
1. In `probeDirectionForZombie`, when foot-height is solid **but foot+2 is air** (a 1-high step the mob can climb), don't return `Infinity` — return a small penalty (e.g. `+0.5`) and flag it climbable.
2. Move the jump trigger so it runs whenever the desired direction is climbable, regardless of detour score. If the chosen direction is a step-up and `grounded`, set `vel.y = ZOMBIE_CONFIG.jumpForce`.
3. Verify `jumpForce` (4.25) at half-gravity clears 1 block — it does, but confirm after the gravity note below.

---

### BUG 5 — Zombie attacks never damage the player
**Severity: High *if* combat is intended; otherwise informational**
**Where:** `attackInReach` (~33042), `ZOMBIE_CONFIG.attackDamage` (13035)

**Cause:** `attackInReach` sets `state = "attack"`, plays the swing animation, and resets `attackCooldown` — but **no code ever applies `attackDamage` to the player.** There is no `playerHealth` / `takeDamage` path anywhere in the file. Zombies are currently harmless. `attackDamage: 2` is dead config.

**Recommended fix:** If a player-health system is planned, this is the hook: when `attackCooldown` resets in `attackInReach`, call a `damagePlayer(ZOMBIE_CONFIG.attackDamage)` and apply a small knockback to the player. If combat is deliberately out of scope for now, leave a `// TODO` so it's not mistaken for a regression. (Flagging because it directly affects "make them smarter/more threatening.")

---

### BUG 6 — Detection sees through walls (no line of sight)
**Severity: Medium**
**Where:** `chaseInRange` / `attackInReach` (detection is `distanceSq < detectionRadiusSq` only)

**Cause:** Aggro and attack are pure radius checks. A zombie on the far side of a wall detects and paths toward you through solid terrain, then jams against the wall. There is no `hasLineOfSight` function in the file.

**Recommended fix:** Add a cheap voxel ray/DDA `hasLineOfSight(mob, player)` (eye-to-eye, stop at first opaque block). Gate the *acquisition* of a target on LOS, but let the existing `lastSeenPos` memory (already implemented, ~33064) drive pursuit once contact is lost — that "investigate where I last saw you" behavior is already wired and would shine once LOS gates detection. Throttle the LOS check (every ~0.2 s, staggered per mob like `sunCheckTimer`).

---

### BUG 7 — `cliffCheckDistance` is dead config; wander walks off cliffs and into walls
**Severity: Medium**
**Where:** `ZOMBIE_CONFIG.cliffCheckDistance` (13037 — defined, never referenced), `wanderWhenIdle` (~33118)

**Cause:** `cliffCheckDistance: 2.5` is never read anywhere. `wanderWhenIdle` picks a random direction with **no obstacle or edge avoidance**, so idle zombies repeatedly walk into walls (relying on the stuck timer to bail) and stroll off ledges. The chase probe has a soft hole penalty (`+0.35`/step) but wander has none.

**Recommended fix:** Either remove the unused constant or wire it in. Give `wanderWhenIdle` the same `probeDirectionForZombie` check chase uses (re-roll the wander direction if the probe is blocked or there's no ground within `cliffCheckDistance`). This single change makes idle behavior look far more deliberate.

---

### BUG 8 — Zombies hard-block each other (clumping / mutual jamming)
**Severity: Medium**
**Where:** `checkZombieCollision` (~32702), used in `moveWithPhysics` (~33148/33154)

**Cause:** Mob-vs-mob collision uses **double radius** (`r = radius * 2 = 1.1`) as a hard stop — any move that brings two zombies within ~1.1 units center-to-center is fully reverted. With up to 8 zombies converging on you they jam into a frozen scrum and can't reach you, and none can pass another. There is no separation/steering — only a binary block.

**Recommended fix:** Replace the hard block with **separation steering**: instead of reverting the move, add a small repulsion velocity away from the nearest neighbor (boids-style), and shrink the collision radius (use `radius * 1.3`–`1.5`, not `2`) so they can stand shoulder-to-shoulder around you. This removes the scrum and looks like a coordinated horde.

---

### Minor issues / smells
- **Frame-rate-dependent decay:** `tickTimers` does `lastObstacleNormal.multiplyScalar(0.9)` per *frame*, not per *dt* — obstacle memory fades faster at high FPS. Use `Math.pow(0.9, dt*60)` or a dt-scaled lerp.
- **Half gravity:** `_mobCtx.gravityDelta = SETTINGS.gravity * dt * 0.5` — mobs fall at half the configured gravity. Likely intentional floatiness, but it couples jump arc to a magic `0.5`; document it or fold into `jumpForce`. Re-verify step-up height after any Bug 4 change.
- **`mobTmpD.score` monkey-patch:** `pickZombieMoveDirection` stashes `.score` on a `THREE.Vector3` scratch. Works, but returning a small `{x,z,score}` struct (or a parallel out-param) is clearer and avoids a hidden-class deopt on the shared scratch.
- **No grounded flag:** jump readiness is inferred from `Math.abs(vel.y) < 0.1`, which is true at the apex of a jump too. A real `grounded` boolean (set on downward collision in `moveWithPhysics`) makes Bug 3 and Bug 4 fixes robust.

---

## Part 2 — Making the AI genuinely smarter (your feature ask)

The current steering is the ceiling of what local probing can do. To get real navigation, layer these in, cheapest first:

1. **Reliable step-up (Bug 4 fix)** — biggest single win for "feels smart"; lets them follow you up stairs, hills, and 1-block builds.
2. **Line of sight + the existing memory system (Bug 6)** — turns "wallhack swarm" into "hunt, lose you, investigate last position, give up" — which the `lastSeenPos`/`memoryDuration` code already supports.
3. **Separation steering (Bug 8)** — coordinated horde instead of a jam.
4. **Throttled grid pathfinding** — the real upgrade. Add a lightweight **BFS/A\*** over the voxel grid:
   - Node = walkable column cell; expansion allows step-up 1, step-down up to ~3, and flat moves (jump-aware).
   - Run it **only when** the mob has LOS-lost the player or the greedy probe reports stuck, recompute every ~0.5–1 s, and **cache the path** (a few waypoints). Steer along waypoints with the existing physics.
   - Cap cost: limit expanded nodes (e.g. ≤256) and search radius (≤24 blocks) so a stuck mob spends a bounded budget; fall back to current greedy steering if no path found. This keeps it within the project's frame-budget philosophy.
   - This is what lets zombies route *around* buildings and out of pits — the thing greedy steering structurally cannot do.
5. **Smarter target loss** — already 80% built (`lastSeenPos`, `targetLostWanderDelay`); just gate it on LOS and it pays off.

Suggested rollout order: Bug 4 → Bug 1/2/3 (hit & death feel) → Bug 6 (LOS) → Bug 8 (separation) → pathfinding. Each is independently shippable.

---

## Part 3 — Performance / optimization notes

The hot path (`updateZombies` → per-mob rules) is already well-optimized (shared `_mobCtx`, hoisted scratch vectors, `lengthSq` instead of `sqrt`, capped at 8 mobs). Opportunities:

- **Throttle/stagger expensive checks.** Any new LOS or pathfinding work must be staggered per-mob (reuse the `sunCheckTimer` pattern) and time-sliced, not run every frame for every mob. Path search should respect `shouldYield()` / a node budget.
- **`zombieCollides` is up to a 3×N×3 triple loop per sub-step.** With `radius 0.55`, x/z span 2 cells and y spans `floor(height)+1 = 3` cells → up to ~27 `isSolidBlock` calls *per axis move per sub-step*, and `moveWithPhysics` sub-steps. Acceptable at 8 mobs, but if mob count ever rises, cache the broadphase or early-out on the cells that actually changed between sub-steps.
- **`checkZombieCollision` is O(n²)** across all mobs each sub-step. Fine at n=8; if it grows, route it through the existing **Spatial Hash Grid** (mentioned in CLAUDE.md) instead of the linear scan.
- **Pathfinding cache reuse.** When you add path search, cache per-region results briefly (several mobs chasing the same player can share a path target) to avoid N independent searches.
- **`pickMobAlongRay`** (melee, ~33331) is O(n) per click — fine; no action needed.

---

## Quick reference — bug → location → one-line fix

| # | Bug | Location | Fix in one line |
|---|-----|----------|-----------------|
| 1 | Death fall direction random | `collapseAndExpire` ~33212 | Capture hit direction in `damageMob`, face away-from-player in `startMobDeath` |
| 2 | Turns its back when knocked back | `faceAndAnimate` ~33186 | Add `hitStunTimer`; face the player (not velocity) during it |
| 3 | Hops away on every hit | `damageMob` ~33269 | Hop only when grounded, smaller magnitude |
| 4 | Can't climb a step ahead | `chaseInRange`/`probe` ~33086 | Treat 1-block step as climbable (not `Infinity`); run jump outside the score gate |
| 5 | Attacks deal no damage | `attackInReach` ~33042 | Call `damagePlayer()` on cooldown reset (if combat intended) |
| 6 | Detects through walls | detection checks | Add throttled `hasLineOfSight`; gate acquisition, keep `lastSeenPos` pursuit |
| 7 | Walks off cliffs / dead config | `wanderWhenIdle` ~33118 | Wire `cliffCheckDistance`; probe-check wander direction |
| 8 | Zombies jam each other | `checkZombieCollision` ~32702 | Separation steering + smaller radius instead of hard block |

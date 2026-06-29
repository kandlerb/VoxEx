# CCR — ParticleSystem: Skip Physics Outside updateDistance (Don't Despawn)

**ID:** VOXEX-CCR-FX-003
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #570
**Scope:** Particles that leave `PARTICLE_CONFIG.updateDistance` (64) are despawned mid-flight instead of having their physics paused, so they visibly pop out of existence at the edge of the update radius.

> Line numbers are as of build `2026-06-24.x` and **WILL DRIFT** — grep the `distSq` out-of-range branch inside `ParticleSystem.update()` before editing. Verified: lifetime is decremented (line ~15308) BEFORE the distance check (line ~15318), so distant particles still age out naturally after this change.

---

### #570 — Skip integration for out-of-range particles instead of despawning
**Location:** `ParticleSystem.update()` distance branch — line ~15318 (grep: `> distSq`, config `updateDistance` ~15300)
**Why:** The out-of-range branch calls `this.despawn(i)`, so a particle whose world position (or the moving viewpoint) crosses the 64-unit radius is destroyed instantly — a visible pop. The intended optimization is to *skip the physics integration* for far particles, not to kill them.
**Change:** Replace `this.despawn(i); continue;` in the distance branch with a bare `continue;` — skip integration/buffer-write but keep the particle alive. Lifetime (already decremented just above) and the `maxParticles` cap remain the only despawn authorities, so distant particles still age out and the active set stays bounded.

**Context:**
- **`ParticleSystem.update(dt, playerPos)` loop** (method starts line ~15297). Structure, top to bottom:
  ```js
  const distSq = PARTICLE_CONFIG.updateDistance * PARTICLE_CONFIG.updateDistance; // line ~15300
  const startCount = this.activeCount;   // high-water mark for the bounded upload (line ~15301)
  for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p.active) continue;
      // Update life  ── lifetime decrement (line ~15308), BEFORE the distance check
      p.life -= dt;
      if (p.life <= 0) { this.despawn(i); continue; }     // ages out — keep as-is
      // Distance check for performance ── the branch to change (line ~15314-15321)
      const dx = p.x - playerPos.x; const dy = p.y - playerPos.y; const dz = p.z - playerPos.z;
      if (dx * dx + dy * dy + dz * dz > distSq) { this.despawn(i); continue; }  // <-- becomes bare `continue;`
      // Physics (line ~15323+): p.vy -= p.gravity*dt; integrate x/y/z; write positions/colors/sizes buffers
  }
  ```
  The lifetime decrement (line ~15308) is unconditionally above the distance branch (line ~15318), so far particles keep aging even when integration is skipped — no immortals.
- **`despawn(index)` signature/behavior** (line ~15362): `despawn(index)` — swap-removes the particle: the LAST particle takes over `index`'s buffer slot (copies its pos/color/size into the freed GPU slot), the old tail slot is hidden (`positions[... +1] = -1000`, `colors[... +3] = 0`), then `p.active = false` and the particle returns to `this.pool` (and `activeCount--`). It is a destructive removal + buffer reshuffle — exactly what the distance branch should STOP doing for merely-far (still-alive) particles. The lifetime branch keeps calling it (correct: those are genuinely dead).
- **Cap-based eviction backstop in `spawn(x, y, z, options)`** (line ~15241): the FIRST line is `if (this.activeCount >= this.maxCount) return null;` (line ~15242) — i.e. when full, `spawn` DROPS the new request and returns null (it does NOT evict an existing particle). So the active set is bounded at `this.maxCount` (= `PARTICLE_CONFIG.maxParticles`, 500) by refusing new spawns, and shrinks only via `despawn` (lifetime expiry or the cap). After this change, lifetime expiry remains the sole way far particles leave; the spawn-cap remains the backstop that bounds total count. (Note: the existing Verify text says "spawn evicts the oldest when full" — the real mechanism is drop-new-on-full; the bound still holds.)
- **Bounded buffer upload still correct:** after the loop, `const touched = Math.max(startCount, this.activeCount);` (line ~15348) re-uploads the `[0, touched)` prefix. Skipped (far) particles keep their last-written buffer slot untouched; they're >64 units away so off-screen. `despawn` still clears vacated tail slots, so no stale ghost.

**Before** (line ~15303):
```js
                    for (let i = this.particles.length - 1; i >= 0; i--) {
                        const p = this.particles[i];
                        if (!p.active) continue;

                        // Update life
                        p.life -= dt;
                        if (p.life <= 0) {
                            this.despawn(i);
                            continue;
                        }

                        // Distance check for performance
                        const dx = p.x - playerPos.x;
                        const dy = p.y - playerPos.y;
                        const dz = p.z - playerPos.z;
                        if (dx * dx + dy * dy + dz * dz > distSq) {
                            this.despawn(i);
                            continue;
                        }

                        // Physics
                        p.vy -= p.gravity * dt;
```
**After:**
```js
                    for (let i = this.particles.length - 1; i >= 0; i--) {
                        const p = this.particles[i];
                        if (!p.active) continue;

                        // Update life
                        p.life -= dt;
                        if (p.life <= 0) {
                            this.despawn(i);
                            continue;
                        }

                        // #570: out of update range → skip integration but KEEP the particle.
                        // Lifetime (decremented above) and the maxParticles cap remain the only
                        // despawn authorities, so far particles still age out instead of popping.
                        // Position only matters when in range, so resume integration on return.
                        const dx = p.x - playerPos.x;
                        const dy = p.y - playerPos.y;
                        const dz = p.z - playerPos.z;
                        if (dx * dx + dy * dy + dz * dz > distSq) {
                            continue;
                        }

                        // Physics
                        p.vy -= p.gravity * dt;
```
**Verify:** Emit a burst (break a block, walk for footstep dust, or splash water), then move >64 units away before the particles' lifetimes expire — they must fade/age out on their own (or freeze in place if not fading) instead of snapping off the instant you cross the radius. Spawn many particles and watch `this.activeCount` / `PARTICLE_CONFIG.maxParticles` (500) — the cap must still hold (`spawn` evicts the oldest when full). Returning within range mid-life must resume motion.

## Safety Checks
- [ ] Far particles are retained (not pooled/despawned) and resume integration when back in range.
- [ ] Lifetime decrement still runs every frame for far particles (it's above the distance branch) → they age out; no immortal particles.
- [ ] Active count stays ≤ `maxParticles`; the cap-based eviction in `spawn()` is unchanged and still the backstop.
- [ ] No new per-frame allocation in the loop (the change only removes a call).
- [ ] The bounded buffer upload (`touched`/`addUpdateRange`) still works — skipped particles keep their last-written buffer slot; no stale ghost (they're out of view at >64 units, and despawn still clears slots).
- [ ] `tools/voxex-tests.html` (~204 tests) green; visual check at the radius boundary.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

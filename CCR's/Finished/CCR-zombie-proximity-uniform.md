# CCR — Zombie Proximity Post-Effect: Wire Up the Uniform

**ID:** VOXEX-CCR-FX-002
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #520
**Scope:** The zombie vignette/desaturation post-effect never activates because its proximity uniform is hardcoded to `0.0` every frame. Drive it from the real nearest-zombie distance.

> Line numbers are as of build `2026-06-24.x` and **WILL DRIFT** — grep `zombieScarePass.uniforms.zombieProximity.value = 0.0` before editing. Audited against the live tree: zombies ARE implemented (`mobs[]`, `updateZombies`), the in-code `// TODO: ... when zombies are implemented` comment is STALE.

---

### #520 — Drive `zombieProximity` from nearest-zombie distance
**Location:** `renderFrame()` zombie-pass uniform sync — line ~44698 (grep: `zombieProximity.value = 0.0`)
**Why:** The uniform is pinned at `0.0` behind a stale TODO, so the vignette/desat shader short-circuits (`if (... && zombieProximity > 0.0)`) and the feature is dead even when zombies are present and the setting is on.
**Change:** In `updateZombies()` track the nearest-zombie squared distance into a module var (the loop already computes `_mobCtx.distanceSq` per mob — no new scan). In `renderFrame()` convert that to a normalized `1 - dist/detectionRadius` proximity, gate by the vignette/desat enable flags, and write it to the uniform. `updateZombies` runs earlier in `animate()` (line ~45054) than `renderFrame()` (line ~45074), so the value is fresh.

**Context:**
- **Nearest-distance source — `updateZombies(dt)` per-mob loop** (function starts line ~34966; loop at ~34986). It already computes `_mobCtx.distanceSq` per mob, so no new scan is needed:
  ```js
  // line ~34991-34992 (inside the for-loop over mobs[])
  mobTmpA.subVectors(playerPos, mob.position);
  _mobCtx.distanceSq = mobTmpA.lengthSq();
  ```
  `mobs` is the live mob array (`const mobs = []`, line ~14019, alongside `const mobPool = []` and `let zombieSpawnTimer = 0;` — the module-var insertion point). The loop iterates `for (let i = mobs.length - 1; i >= 0; i--)` so it tolerates mid-loop despawns (`_mobCtx.removed`); resetting `nearestZombieDistSq = Infinity` at the top of the loop is correct.
- **`ZOMBIE_CONFIG.detectionRadius` = `28`** — confirmed at line ~14026 inside `const ZOMBIE_CONFIG = { ... }` (line ~14022). The mob context already derives `_mobCtx.detectionRadiusSq = ZOMBIE_CONFIG.detectionRadius * ZOMBIE_CONFIG.detectionRadius;` once per frame at line ~34981, so the radius constant is in scope and already used for sensing.
- **Post-effect pass + uniform — `zombieScarePass`.** Defined as `const ZombieScareShader = { uniforms: { ..., zombieProximity: { value: 0.0 }, ... } }` (line ~28147), instantiated `zombieScarePass = new ShaderPass(ZombieScareShader)` (line ~28199). NOTE: there is a SECOND combined-pass path — `zombieScarePass = combinedPass;` (line ~28719) aliases it (along with `underwaterPass`/`colorGradingPass`) so `zombieScarePass.uniforms.zombieProximity.value = …` works either way; that combined shader has its OWN `zombieProximity` uniform/branch (lines ~28632, ~28675-28683). The write site touches `zombieScarePass.uniforms.zombieProximity.value`, which reaches whichever object is active.
- **How the uniform is consumed (fragment shader, lines ~28162-28195, mirrored in combined pass ~28658-28683):**
  ```glsl
  if (enableDesaturation && zombieProximity > 0.0) {        // short-circuits at 0
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(gray), zombieProximity * 0.6);
  }
  if (enableVignette && zombieProximity > 0.0) {
      ...
      float vignetteAmount = vignette * zombieProximity * vignetteIntensity;
      color = mix(color, color * (1.0 - vignetteAmount) + redTint * vignetteAmount, vignetteAmount);
  }
  ```
  So a proximity of `0.0` is a no-op (current behavior); a value in `(0,1]` ramps desat + red vignette. Clamping to `[0,1]` keeps the shader math well-behaved.
- **Ordering (read downstream of write) — both inside `animate()`:** `updateZombies(clampedDt);` runs at line ~45054 (in the 'entities' perf section); `renderFrame();` runs at line ~45074 (in the 'render' section). The write happens in `updateZombies`, the read in `renderFrame`, same frame — fresh.
- **Gate — `zombieEffectsEnabled`** is declared in `renderFrame()` just above the uniform-sync block: `const zombieEffectsEnabled = SETTINGS.zombieVignetteEnabled || SETTINGS.zombieDesaturationEnabled;` (line ~44691). It is in scope at the write site (line ~44698) and is the correct master gate.

**Before** (module var — add near `let zombieSpawnTimer = 0;`, line ~14021):
```js
            const mobs = [];
            const mobPool = [];
            let zombieSpawnTimer = 0;
```
**After:**
```js
            const mobs = [];
            const mobPool = [];
            let zombieSpawnTimer = 0;
            let nearestZombieDistSq = Infinity; // #520: nearest mob→player dist² this frame; drives the zombie post-effect proximity uniform (renderFrame). Reset/updated in updateZombies.
```

**Before** (`updateZombies` per-mob loop, line ~34985):
```js
                // Run each mob's rule list (shared arrays from MOB_RULE_SETS)
                for (let i = mobs.length - 1; i >= 0; i--) {
                    const mob = mobs[i];
                    _mobCtx.index = i;
                    _mobCtx.removed = false;
                    _mobCtx.stateHandled = false;
                    mobTmpA.subVectors(playerPos, mob.position);
                    _mobCtx.distanceSq = mobTmpA.lengthSq();
                    const rules = mob.userData.rules || MOB_RULE_SETS.zombie;
                    for (let r = 0; r < rules.length; r++) {
                        rules[r](mob, _mobCtx);
                        if (_mobCtx.removed) break;
                    }
                }
            }
```
**After:**
```js
                // Run each mob's rule list (shared arrays from MOB_RULE_SETS)
                nearestZombieDistSq = Infinity; // #520: recompute each frame; survives mid-loop despawns
                for (let i = mobs.length - 1; i >= 0; i--) {
                    const mob = mobs[i];
                    _mobCtx.index = i;
                    _mobCtx.removed = false;
                    _mobCtx.stateHandled = false;
                    mobTmpA.subVectors(playerPos, mob.position);
                    _mobCtx.distanceSq = mobTmpA.lengthSq();
                    if (_mobCtx.distanceSq < nearestZombieDistSq) nearestZombieDistSq = _mobCtx.distanceSq; // #520
                    const rules = mob.userData.rules || MOB_RULE_SETS.zombie;
                    for (let r = 0; r < rules.length; r++) {
                        rules[r](mob, _mobCtx);
                        if (_mobCtx.removed) break;
                    }
                }
            }
```

**Before** (`renderFrame()` zombie-pass uniform sync, line ~44692):
```js
                if (zombieScarePass) {
                    // Sync uniforms - shader checks these to short-circuit when disabled
                    zombieScarePass.uniforms.enableVignette.value = SETTINGS.zombieVignetteEnabled;
                    zombieScarePass.uniforms.enableDesaturation.value = SETTINGS.zombieDesaturationEnabled;
                    // TODO: Add zombie proximity detection here when zombies are implemented
                    // For now, set to 0 (no effect)
                    zombieScarePass.uniforms.zombieProximity.value = 0.0;
                }
```
**After:**
```js
                if (zombieScarePass) {
                    // Sync uniforms - shader checks these to short-circuit when disabled
                    zombieScarePass.uniforms.enableVignette.value = SETTINGS.zombieVignetteEnabled;
                    zombieScarePass.uniforms.enableDesaturation.value = SETTINGS.zombieDesaturationEnabled;
                    // #520: drive proximity from the nearest live zombie (computed this frame in updateZombies).
                    // Normalize against detectionRadius: 1 at point-blank, ramps to 0 at the radius edge.
                    // Zero when the feature is off or no zombies are near → identical to the old behaviour.
                    let proximity = 0.0;
                    if (zombieEffectsEnabled && nearestZombieDistSq < Infinity) {
                        const r = ZOMBIE_CONFIG.detectionRadius;
                        const dist = Math.sqrt(nearestZombieDistSq);
                        proximity = Math.max(0, Math.min(1, 1 - dist / r));
                    }
                    zombieScarePass.uniforms.zombieProximity.value = proximity;
                }
```
**Verify:** Wait for night so zombies spawn (or force spawn), approach one — the red vignette + desaturation must ramp in as you close to within `detectionRadius` (28) and out as you retreat. Toggle Zombie Vignette/Desaturation off in Settings → Zombie Effects: effect must vanish. With no zombies on screen: no effect (`proximity === 0`). Confirm `perfMetrics.zombiePassTime` shows no new cost (no added loop).

## Safety Checks
- [ ] `nearestZombieDistSq` declared ONCE (grep first — not redeclared, not shadowing a global).
- [ ] `proximity` clamped to `[0,1]`; `0` when `zombieEffectsEnabled` is false OR `mobs` is empty (reset to `Infinity` each `updateZombies` call).
- [ ] No new per-frame loop — reuses the existing `updateZombies` per-mob loop and its `_mobCtx.distanceSq`.
- [ ] Ordering holds: `updateZombies(clampedDt)` (line ~45054) runs before `renderFrame()` (line ~45074) inside `animate()`; if either moves, re-verify the read is downstream of the write.
- [ ] `zombieEffectsEnabled` is in scope at the uniform-sync site (it is — declared just above at line ~44691).
- [ ] No new setting added (reuses `ZOMBIE_CONFIG.detectionRadius` + existing `zombieVignetteEnabled`/`zombieDesaturationEnabled`/`zombieVignetteIntensity`); nothing new to round-trip.
- [ ] `tools/voxex-tests.html` (~204 tests) green; visual ramp-in/out confirmed.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

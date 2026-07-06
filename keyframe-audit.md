> **Status: HISTORICAL investigation** _(marked 2026-07-06; see CLAUDE.md Documentation Index)_

# VoxEx Keyframe & Pose-Transition Audit

**Scope:** `voxEx.html` knockdown keyframe system + the state-pose blending that feeds it.
**Date:** 2026-06-14 · **Rev 2** (self-review pass: corrections + dependency analysis)
**Subsystems:** `KNOCKDOWN_KEYFRAMES`, `updateKnockdown`, `endKnockdown`, `captureCurrentPose`, `animatePlayerLimbs`, `applyPoseFromSliders`, `POSE_PRESETS`.

> Line numbers reference the current `voxEx.html` and will drift as edits land — search by named anchors if they don't line up.

---

## Implementation status — 2026-06-14 (build 2026-06-14.1)

**All items implemented** in `voxEx.html` via the structural track (Track B) plus polish and O2:

- **B1 + B2** — `endKnockdown` now seeds the smoothing caches from the live mesh; `updateKnockdown` negates elbows. Fixes the recovery snap and the confirmed elbow inversion.
- **C2** — new `POSE_BINDINGS` table drives `captureCurrentPose`, `updateKnockdown`, and the `endKnockdown` seed (single source of truth).
- **B3** — clamped cubic-Hermite (`knockdownSample`) with Catmull-Rom tangents, zeroed at endpoints/holds; replaces per-segment smoothstep. Clamp prevents floor-clip overshoot.
- **B4** — `startKnockdown` snapshots the airborne pose; `updateKnockdown` blends it into the keyframe path over `KNOCKDOWN_ENTRY_BLEND` (0.08 s), seamless at the window edge.
- **B5 / O1** — dead branch gone; helpers (`poseGetAxis`/`poseSetAxis`/`knockdownSample`/`ksSmooth`) hoisted to module scope, no per-frame closures.
- **C1** — duplicate ground keyframe collapsed to `hold: 2.0`; `KNOCKDOWN_TOTAL_DURATION` derived; preset indices updated.
- **O2** — player pose transitions migrated to `springPlayerPose` (critically-damped springs, factor→halflife mapped); landing-impact block resets spring velocities. Zombie `smoothPose` left untouched.

**Verification done:** static integrity only — 0 stale `smoothPose(playerPose` calls, 30 spring calls, no orphan keys, rewritten functions brace-balanced. **NOT yet run:** `tools/voxex-tests.html` (needs localhost+browser) and a live playtest. **Playtest priorities:** (1) knockdown elbows now bend correctly + no recovery pop; (2) O2 — overall movement feel across idle/walk/sprint/crouch/fly/swim/land, since spring halflives are mapped, not hand-tuned.

> Note: the sandbox bash mount of this repo is stale (a known issue), so an automated `node --check` couldn't be trusted; verification was done against the live file via search/read.

---

## 0. Review notes — what changed in Rev 2

A second pass against the code corrected and expanded Rev 1:

- **Rev 1's B1 fix was wrong.** It seeded `playerPose.leftElbowX = -finalPose.leftElbow`. The negation is backwards: `updateKnockdown` applies elbow keyframes **un-negated**, so the mesh sits at `+finalPose.leftElbow` at handoff. Seeding the negative would *cause* the very snap it's meant to fix. **Corrected approach below: seed the caches from the live mesh rotations — sign-agnostic and also fixes head position.**
- **B1 is broader than elbows/knees.** `endKnockdown` also never seeds `headY`/`headZ` (head position), so the head can pop too. The live-mesh seed fixes all of them at once.
- **B2 is a CONFIRMED bug (user-verified 2026-06-14): the knockdown elbows visibly invert the wrong way at runtime.** This resolves the "can't tell statically" caveat from earlier. The keyframes are authored in the editor's "stored positive → render negated" convention, but `updateKnockdown` applies them un-negated. **Fix = add the negation in `updateKnockdown`; do NOT re-sign the keyframes** (they're already correct). Upgraded to a required correctness fix, paired with B1.
- **C2 would overwrite B1 and B2** (same code region). They must be combined or sequenced deliberately — see §5.
- **C1 ripples** into index-based preset wiring and a duplicated duration constant — not trivial.
- **B3 has an overshoot hazard**: knockdown does **not** run `applyPoseConstraints`, so a spline that overshoots is unguarded.

---

## 1. Summary

The knockdown system is functionally correct (triggers, plays, returns control) but has **one real handoff bug** with several facets, one **motion-quality defect**, and cleanup/condensation opportunities.

| # | Issue | Severity | Type | Couples with |
|---|-------|----------|------|--------------|
| B1 | Recovery handoff: smoothing caches not seeded from final mesh state (elbows, knees, head pos) | High | Bug | C2 (overwrites), B2 |
| B2 | **Confirmed:** knockdown elbows render inverted (un-negated vs editor/normal) | High | Bug | C2, **pair with B1** |
| B3 | Per-segment smoothstep stutters at every keyframe | Medium | Motion quality | B4, constraints |
| B4 | Entry into knockdown snaps (ignores mid-air pose) | Low | Motion quality | B3 |
| B5 | Dead "past last keyframe" branch | Low | Cleanup | O1 (same region) |
| C1 | Duplicate hold keyframe → ripples to index wiring + dup duration const | Low | Condense | preset wiring |
| C2 | Pose key list duplicated in 4 places | Medium | Condense | **subsumes B1+B2** |
| O1 | `lerp` arrow + inline smoothstep allocated per frame | Low | Optimization | B5 (same region) |
| O2 | Mixed blend methods (spring vs exponential) | Low | Consistency | — |

---

## 2. Bugs

### B1 — Recovery handoff doesn't seed the smoothing caches from the final mesh state
**Severity: High** · **`endKnockdown` ~13790–13825; cache read in `animatePlayerLimbs` ~34827–34897**

`animatePlayerLimbs` smooths every joint through the `playerPose` cache, and `smoothPose` keeps `playerPose[key]` **identical to the mesh `rotation`/`position` it just wrote** (it returns the value that's assigned to the mesh). So a seamless handoff requires only that, the instant control returns, **every cache key equals the current mesh value**.

`endKnockdown` fails this three ways:

1. **Wrong key names for joints.** It writes `playerPose.leftElbow / rightElbow / leftKnee / rightKnee` (~13812, ~13819), but the cache actually read uses the **`X`-suffixed** keys `leftElbowX / rightElbowX / leftKneeX / rightKneeX` (init ~34237–34240; read ~34848–34860). The written names are orphans; the real keys stay stale → snap.
2. **Missing head position.** It seeds `headX` but never `headY`/`headZ` (~13808 only). `updateKnockdown` *does* drive `head.position.y/z` (~13889–13890), so those caches are stale at handoff → head can pop.
3. **(Rev 1 error)** the suggested `-finalPose.leftElbow` sign is wrong; see B2.

**Corrected fix — seed caches from the live mesh, not from the keyframe object.** This is sign-agnostic (it copies whatever `updateKnockdown` actually rendered) and covers head position for free. `captureCurrentPose()` (~13738) already reads the live mesh; reuse it:

```javascript
function endKnockdown() {
    isKnockedDown = false;
    knockdownTime = 0;
    enablePlayerControls();

    // Seed smoothing caches from the ACTUAL mesh pose so the next
    // animatePlayerLimbs frame starts exactly where knockdown ended.
    const m = captureCurrentPose();        // reads live rotation/position
    playerPose.bodyY = m.bodyY;
    playerPose.lowerSpineX = m.lowerSpineX; playerPose.lowerSpineZ = m.lowerSpineZ; playerPose.lowerSpineY = m.lowerSpineY;
    playerPose.midSpineX = m.midSpineX;     playerPose.midSpineZ = m.midSpineZ;     playerPose.midSpineY = m.midSpineY;
    playerPose.upperSpineX = m.upperSpineX; playerPose.upperSpineZ = m.upperSpineZ; playerPose.upperSpineY = m.upperSpineY;
    playerPose.headX = m.headX; playerPose.headY = m.headY; playerPose.headZ = m.headZ;
    playerPose.leftArmX = m.leftArmX; playerPose.leftArmZ = m.leftArmZ; playerPose.leftArmY = m.leftArmY;
    playerPose.rightArmX = m.rightArmX; playerPose.rightArmZ = m.rightArmZ; playerPose.rightArmY = m.rightArmY;
    playerPose.leftLegX = m.leftLegX; playerPose.leftLegZ = m.leftLegZ;
    playerPose.rightLegX = m.rightLegX; playerPose.rightLegZ = m.rightLegZ;
    // Joints: cache is X-suffixed; capture reads raw rotation.x → already correct sign.
    playerPose.leftElbowX = m.leftElbow;   playerPose.rightElbowX = m.rightElbow;
    playerPose.leftKneeX  = m.leftKnee;    playerPose.rightKneeX  = m.rightKnee;
}
```

Because `captureCurrentPose().leftElbow` is the *raw* `parts.leftElbow.rotation.x`, it already carries whatever sign `updateKnockdown` produced — so this is correct whether or not B2 is ever done.

> Note: on its own, B1 still leaves the elbow easing *toward* the idle target over the smoothing window (smooth, ~100 ms, not a snap) because B2 leaves the knockdown elbow in the inverted sign. With B2 also applied, the handoff elbow is already the correct sign and there is no residual drift. Do B1 and B2 together.

---

### B2 — Knockdown elbows render inverted (CONFIRMED)
**Severity: High** · **`updateKnockdown` ~13895/13899 vs `applyPoseFromSliders` ~35234/35238 and `animatePlayerLimbs` ~34857/34860**

**Status: confirmed visually by the user (2026-06-14) — the elbows bend the wrong way during the knockdown.**

The pose editor negates elbows on apply — `parts.leftElbow.rotation.x = -getRot('leftElbow')`, literally commented *"elbows stored as negative"* (~35234). Normal animation negates identically (~34857). **`updateKnockdown` does not** — it applies the keyframe value directly (~13895). Every keyframe was authored/previewed in the editor's negated convention, so applying them un-negated mirrors the elbows at runtime. Knees and all other joints are applied directly in all three paths and are consistent; **only elbows are affected** — which matches the user seeing only the elbows invert.

**Fix:** add the negation in `updateKnockdown` so it matches the editor/normal convention. **Do NOT re-sign the keyframes** — they are already correct; the bug is purely the missing minus sign at apply time. (The negative ground-pose value `leftElbow: -0.5` at ~13436 is correct editor-convention data: stored −0.5 → editor renders +0.5; un-negated runtime renders −0.5, i.e. inverted — consistent with the confirmed symptom.)

**Pairs with B1:** once B2 negates, the mesh elbow at the recovery handoff is in the *same* sign convention normal animation uses, so B1's live-mesh seed makes the handoff seamless with no residual drift. B1 alone leaves the elbows inverted throughout the animation; B2 alone still snaps at handoff. Do both.

---

### B3 — Per-segment smoothstep stutters at every keyframe
**Severity: Medium (motion quality)** · **Line ~13872**

```javascript
t = t * t * (3 - 2 * t);   // applied per segment
```

Zero derivative at `t=0` and `t=1` → the body fully decelerates and re-accelerates at every waypoint (impact→collapse→ground→pushup→kneel). C0 but not C1 across keyframes → stop-motion feel, worst on the fast 0.0→0.35 impact phase.

**Fix options:** (A) continuous tangents (Catmull-Rom / cubic Hermite) so velocity flows through waypoints; (B) cheap — restrict smoothstep to the two hold-bordering segments, linear elsewhere.

**⚠ Overshoot hazard (new in Rev 2):** `updateKnockdown` does **not** call `applyPoseConstraints` (that runs only in `animatePlayerLimbs`, ~34811). A Catmull-Rom spline can overshoot between keyframes and there is **no interpenetration guard during knockdown** — overshoot at the ground pose could clip limbs through the floor. Mitigate with **centripetal Catmull-Rom + per-component clamping to the bracketing keyframe min/max**, or route the knockdown result through `applyPoseConstraints` too. Endpoint values are unchanged, so B3 does **not** affect the B1 handoff.

---

### B4 — Entry into knockdown snaps
**Severity: Low (motion quality)** · **`startKnockdown` ~13777; first `updateKnockdown` frame**

First frame hard-sets limbs to `KEYFRAMES[0]` regardless of the mid-air pose. `captureCurrentPose()` already exists; a ~0.08 s cross-fade captured→`KEYFRAMES[0]` softens the hit.

**Couples with B3:** if B3 adopts Catmull-Rom, a captured entry pose becomes the spline's leading control point and changes the tangent at `KEYFRAMES[0]`. Design B3 and B4 together if both are done.

---

### B5 — Dead "past last keyframe" branch
**Severity: Low (cleanup)** · **Lines ~13861–13864**

Unreachable: `knockdownTime >= 3.50` already hits `endKnockdown()` + `return true` at ~13842 (last keyframe time == `KNOCKDOWN_TOTAL_DURATION` == 3.50). Delete it. Combine with O1 (same function/region).

---

## 3. Condensation opportunities

### C1 — Duplicate hold keyframe (ripples further than it looks)
**Lines ~13428–13455 (`KEYFRAMES[2]`@0.35 and `[3]`@2.35, identical)**

Collapsing the copy-pasted hold to a single pose + `hold` flag is desirable, **but it shifts array indices**, and these consumers use explicit indices / length:

- Preset wiring `POSE_PRESETS.knockdown_* = KNOCKDOWN_KEYFRAMES[0|1|2|4|5]` (~13503–13507, incl. the `// [3] is duplicate` comment).
- `.length - 1` references (~13739, ~13797, ~13861).

Also: **`KNOCKDOWN_TOTAL_DURATION` (~13500) duplicates the last keyframe's `time` (3.50)** — a second condense: derive it as `KNOCKDOWN_KEYFRAMES.at(-1).time` so timing edits can't desync. Do C1 + this together and update all index references in the same change.

### C2 — Pose key list duplicated in 4 places (subsumes B1 & B2)
**`captureCurrentPose` ~13742, `endKnockdown` ~13798, `updateKnockdown` ~13879, `playerPose` init ~34233**

The ~26 properties are hand-listed four times; any new joint must be added to all four or motion desyncs — **this is exactly how B1 happened.** A single descriptor table eliminates the class:

```javascript
// part, meshTarget, poseKey, cacheKey, negateOnApply
const POSE_BINDINGS = [
  ['lowerSpine','position.y','bodyY','bodyY', false],
  ['leftElbow','rotation.x','leftElbow','leftElbowX', true /* reconciles B2 */],
  // ...
];
```

`captureCurrentPose`, `updateKnockdown`'s apply block, and `endKnockdown`'s seed all collapse to one loop. **Important interaction:** the `negate` column only works for *both* consumers once B2 is reconciled (today `updateKnockdown` and `animatePlayerLimbs` disagree on elbow sign). So a clean C2 **includes the B2 decision**; if B2 is deferred, the table needs the elbow rows handled per-consumer (messier). **C2 also rewrites the same lines B1 touches — doing B1 first then C2 edits `endKnockdown` twice.**

---

## 4. Optimizations

### O1 — Per-frame allocation in `updateKnockdown` — **Line ~13877**
`const lerp = (a,b,f) => ...` plus inline smoothstep are allocated every frame while a knockdown is active. CLAUDE.md flags both "anonymous funcs in hot paths" and "allocations in hot paths." Hoist `lerp` and a named `smoothstep` to module scope. Combine with B5 (same region, one commit).

### O2 — Mixed blend methods — **`smoothPose` ~13577 vs `springDamper` ~13548**
State transitions use exponential smoothing (C0); flight/impact use critically-damped springs (C1). Unifying on `springDamper` makes all transitions equally fluid. Polish only, needs re-tuning; independent of everything else.

---

## 5. Combine / overwrite analysis

What the review was asked for — how the fixes interact:

**Same code region (will overwrite each other if done separately):**
- **B1 ⊂ C2.** C2 rewrites `endKnockdown`'s seed and `captureCurrentPose`. If you intend to do C2, **implement the B1 handoff fix inside C2** rather than editing `endKnockdown` now and again later.
- **B2 ⊂ C2.** The table's negate column *is* the B2 fix. If doing C2, set the elbow rows' `negate: true` and B2 is handled. If not doing C2, B2 is a tiny standalone edit (two minus signs in `updateKnockdown`) and should ship *with* B1.
- **B5 + O1** both edit `updateKnockdown`'s tail/region → one commit.
- **C1 + derive-duration** both edit the keyframe array + its consumers → one commit.

**Functionally coupled (design together):**
- **B3 + B4** share the interpolation path and entry tangents.
- **B3 + constraints** — B3 must not overshoot since knockdown is unguarded.

**Independent (any order):** O2; C1 vs the plumbing fixes (C1 touches data + index wiring, C2 touches plumbing — coordinate only the preset-wiring lines ~13503–13507, which both may touch).

**No fix changes the keyframe endpoint values**, so none of them alters the B1 handoff target — B1/C2 can be validated independently of B3/B4.

---

## 6. Implementation plan (dependency-ordered)

Two viable tracks depending on appetite. **Pick one for the plumbing; don't do both A1 and B-track's C2 or you edit `endKnockdown` twice.**

### Track A — fast correctness patch (minimal risk)
**A1. Fix the handoff + elbow inversion (B1 + B2, together).** Replace `endKnockdown`'s manual copy with the live-mesh seed (§2 B1), writing the `X`-suffixed joint keys + `headY/headZ`; and add the two negations in `updateKnockdown` (§2 B2). Do NOT re-sign keyframes.
*Verify:* >18 m/s fall in 3rd person; elbows now bend the correct way during the knockdown, and on recovery there's no elbow/knee/head pop. Run `tools/voxex-tests.html`.

**A2. Cleanup (B5 + O1), one commit.** Delete the dead branch; hoist `lerp`/`smoothstep`.
*Verify:* knockdown visually unchanged.

> Accept that if you later do C2, A1 gets rewritten. That's the trade for shipping the fix now.

### Track B — structural fix (do this if you'll touch the plumbing anyway)
**B1‑step. Build `POSE_BINDINGS` (C2) and route `captureCurrentPose` + `updateKnockdown` apply + `endKnockdown` seed through it — this *is* the B1 fix.** Decide B2 here: set the elbow `negate` column, re-sign keyframes if needed, and **visually verify the knockdown elbows** in `tools/KeyFrame_editor.html` before/after.
*Verify:* full knockdown identical (or intentionally corrected if B2 reconciled); handoff clean; tests green.

**B2‑step. Cleanup (B5 + O1).** As A2.

**B3‑step. Condense data (C1 + derive `KNOCKDOWN_TOTAL_DURATION`).** Collapse the hold keyframe; update the index-based preset wiring (~13503–13507) and `.length` refs.
*Verify:* timing and presets unchanged.

### Both tracks — optional polish (separate, A/B-able)
**P1. Smoother motion (B3).** Continuous-tangent interpolation with overshoot clamping (or route through `applyPoseConstraints`). Tune in the keyframe editor.
**P2. Entry blend (B4)** — design with P1's tangents.
**P3. Unify blends (O2)** — migrate state transitions to `springDamper`; re-tune halflives.

### Cross-cutting checklist (per CLAUDE.md)
- [ ] No duplicate/shadowed identifiers (`POSE_BINDINGS`, hoisted `lerp`/`smoothstep`).
- [ ] No new per-frame allocations/closures in the apply path.
- [ ] Knockdown elbows visually verified (B2 decision) — static analysis can't settle the sign.
- [ ] `tools/voxex-tests.html` green over localhost.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` banner.
- [ ] Animation is main-thread only — no worker-parity edits needed.

### Suggested commit slicing
- **Track A:** `fix(anim): correct knockdown elbow inversion + seed pose caches on recovery (B1+B2)` · `chore(anim): drop dead keyframe branch, hoist lerp/smoothstep (B5+O1)`
- **Track B:** `refactor(anim): drive knockdown poses from POSE_BINDINGS, fix recovery handoff + elbow sign (B1+B2+C2)` · `chore(anim): dead branch + hoist (B5+O1)` · `refactor(anim): collapse hold keyframe, derive duration (C1)`
- **Polish:** `feat(anim): continuous-tangent knockdown interpolation (B3)` · `feat(anim): blended knockdown entry (B4)`

---

## 7. Per-item detail (line, full fix, reasoning, impact, outcome, blowbacks)

Each entry gives the exact site, the complete replacement code, and the four assessment fields. Verify line numbers by the named anchor before editing — they drift.

---

### B1 — Seed smoothing caches from the live mesh on recovery

**Line:** `endKnockdown` body, ~13790–13825 (replace the entire `playerPose.* = finalPose.*` block, ~13796–13822).

**Full suggested fix:**
```javascript
function endKnockdown() {
    isKnockedDown = false;
    knockdownTime = 0;
    enablePlayerControls();

    // Seed the smoothing caches from the ACTUAL mesh pose (not the keyframe
    // object) so the first animatePlayerLimbs frame continues exactly where
    // the knockdown ended. captureCurrentPose() reads live rotation/position,
    // so the values already carry whatever sign updateKnockdown produced.
    const m = captureCurrentPose();
    playerPose.bodyY = m.bodyY;
    playerPose.lowerSpineX = m.lowerSpineX; playerPose.lowerSpineZ = m.lowerSpineZ; playerPose.lowerSpineY = m.lowerSpineY;
    playerPose.midSpineX   = m.midSpineX;   playerPose.midSpineZ   = m.midSpineZ;   playerPose.midSpineY   = m.midSpineY;
    playerPose.upperSpineX = m.upperSpineX; playerPose.upperSpineZ = m.upperSpineZ; playerPose.upperSpineY = m.upperSpineY;
    playerPose.headX = m.headX; playerPose.headY = m.headY; playerPose.headZ = m.headZ;
    playerPose.leftArmX  = m.leftArmX;  playerPose.leftArmZ  = m.leftArmZ;  playerPose.leftArmY  = m.leftArmY;
    playerPose.rightArmX = m.rightArmX; playerPose.rightArmZ = m.rightArmZ; playerPose.rightArmY = m.rightArmY;
    playerPose.leftLegX  = m.leftLegX;  playerPose.leftLegZ  = m.leftLegZ;
    playerPose.rightLegX = m.rightLegX; playerPose.rightLegZ = m.rightLegZ;
    // Joint caches are X-suffixed; capture reads raw rotation.x → correct sign.
    playerPose.leftElbowX = m.leftElbow; playerPose.rightElbowX = m.rightElbow;
    playerPose.leftKneeX  = m.leftKnee;  playerPose.rightKneeX  = m.rightKnee;

    logDebug('[Knockdown] Recovery complete');
}
```

**Reasoning:** `smoothPose` keeps `playerPose[key]` identical to the mesh value it writes, so a seamless handoff requires only that every cache key equals the current mesh value the instant control returns. The old code wrote orphan keys (`leftElbow` vs the read key `leftElbowX`) and never seeded `headY/headZ`, leaving those caches stale. Reading the live mesh is sign-agnostic and complete.

**Impact:** `endKnockdown` only; no per-frame cost (runs once on recovery). Touches the exact region C2 will later rewrite.

**Expected outcome:** No elbow/knee/head pop on the frame control returns after a knockdown; limbs ease from the final knockdown pose into the idle pose.

**Potential blowbacks:** `captureCurrentPose` early-returns the last keyframe pose if `playerBodyMesh.userData.parts` is missing (~13739) — in that edge case the seed uses keyframe (un-suffixed) values, so keep the explicit `leftElbowX = m.leftElbow` mapping (do not blind-spread `m`). The residual elbow drift toward the opposite-sign idle target is smooth, not a snap; eliminating it is B2's job. If C2 lands later, this whole block is replaced — see §5.

---

### B2 — Negate knockdown elbows (CONFIRMED inversion)

**Line:** `updateKnockdown`, ~13895 and ~13899.

**Full suggested fix:**
```javascript
// Before (un-negated — renders elbows inverted, confirmed):
parts.leftElbow.rotation.x  = lerp(poseA.leftElbow,  poseB.leftElbow,  t);
parts.rightElbow.rotation.x = lerp(poseA.rightElbow, poseB.rightElbow, t);
// After (match editor/normal "stored positive, render negated" convention):
parts.leftElbow.rotation.x  = -lerp(poseA.leftElbow,  poseB.leftElbow,  t);
parts.rightElbow.rotation.x = -lerp(poseA.rightElbow, poseB.rightElbow, t);
```
**Do NOT re-sign the keyframes.** They are already authored in the editor convention (the same one normal animation uses); the only error is the missing minus sign at apply time. If B3's `cr()`/Catmull-Rom replaces `lerp`, apply the negation to those two elbow lines instead.

**Reasoning:** the editor (`applyPoseFromSliders` ~35234) and normal animation (~34857) both negate elbows; `updateKnockdown` alone does not, so it renders the same data mirrored. User confirmed the elbows visibly invert during the knockdown.

**Impact:** two lines in `updateKnockdown`; knockdown-only. Knees/other joints unaffected.

**Expected outcome:** elbows bend the correct (natural) way throughout the knockdown, matching the editor preview; and combined with B1, the recovery handoff has no residual elbow drift.

**Potential blowbacks:** very low — this aligns three code paths on one convention. Sanity-re-check the full knockdown once in `tools/KeyFrame_editor.html` to confirm no keyframe was previously hand-patched to a mixed sign (the uniform inversion the user reports indicates a single consistent convention, so this is just diligence). Ship with B1.

---

### B3 — Continuous-tangent interpolation with overshoot clamp

**Line:** module scope near `springDamper` (~13565) for the helper; `updateKnockdown` interpolation ~13866–13905 (replace the smoothstep + per-property `lerp`).

**Full suggested fix:**
```javascript
// Module scope — Catmull-Rom with hard clamp to the active segment so the
// spline cannot overshoot (knockdown does NOT run applyPoseConstraints).
function catmullRomClamped(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const v = 0.5 * (2 * p1
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    const lo = p1 < p2 ? p1 : p2;
    const hi = p1 < p2 ? p2 : p1;
    return v < lo ? lo : (v > hi ? hi : v);
}
```
Then in `updateKnockdown`, after the bracket loop finds index `i` (keyframeA = `[i]`, keyframeB = `[i+1]`):
```javascript
const i0 = Math.max(0, i - 1);
const i3 = Math.min(KNOCKDOWN_KEYFRAMES.length - 1, i + 2);
const p0 = KNOCKDOWN_KEYFRAMES[i0].pose;
const p1 = keyframeA.pose;
const p2 = keyframeB.pose;
const p3 = KNOCKDOWN_KEYFRAMES[i3].pose;
// raw t (NO smoothstep — tangents provide the smoothing)
const cr = (key) => catmullRomClamped(p0[key] ?? 0, p1[key] ?? 0, p2[key] ?? 0, p3[key] ?? 0, t);
parts.lowerSpine.position.y = cr('bodyY');
parts.lowerSpine.rotation.x = cr('lowerSpineX');
// ...same for every property, replacing each lerp(poseA.X, poseB.X, t) with cr('X')
```
Note: the bracket loop must expose `i` (currently it only keeps `keyframeA/B`); store the index.

**Reasoning:** smoothstep per segment zeroes velocity at every keyframe; Catmull-Rom carries continuous tangents through waypoints. The clamp substitutes for the missing `applyPoseConstraints` guard.

**Impact:** `updateKnockdown` per-frame math only (active during knockdown). Endpoint values unchanged → does not affect the B1 handoff.

**Expected outcome:** fluid, momentum-carrying fall→recover instead of stop-motion pauses.

**Potential blowbacks:** without the clamp, overshoot can clip limbs through the floor at the ground pose. The `cr` arrow allocates per frame — fold into the O1 hoist or the C2 loop. Re-verify timing feel in the keyframe editor; the hold segment (identical p1==p2) yields a flat clamp range, which is correct (no motion).

---

### B4 — Blended entry into knockdown

**Line:** `startKnockdown` ~13777–13785; consumed in `updateKnockdown`.

**Full suggested fix:**
```javascript
let knockdownEntryPose = null;          // module scope
const KNOCKDOWN_ENTRY_BLEND = 0.08;     // seconds

function startKnockdown(impactVelocity) {
    if (isKnockedDown) return;
    isKnockedDown = true;
    knockdownTime = 0;
    knockdownEntryPose = captureCurrentPose();   // remember mid-air pose
    disablePlayerControls();
    logDebug('[Knockdown] Started - impact velocity: ' + impactVelocity.toFixed(1) + ' m/s');
}
```
In `updateKnockdown`, before the normal keyframe path:
```javascript
if (knockdownEntryPose && knockdownTime < KNOCKDOWN_ENTRY_BLEND) {
    const bt = knockdownTime / KNOCKDOWN_ENTRY_BLEND;        // 0..1
    const k0 = KNOCKDOWN_KEYFRAMES[0].pose;
    const blend = (key) => lerp(knockdownEntryPose[key] ?? 0, k0[key] ?? 0, bt);
    // apply blend('bodyY') etc. to parts, then return false;
}
```

**Reasoning:** the first frame currently hard-sets `KEYFRAMES[0]` regardless of the player's airborne pose, producing a discontinuity.

**Impact:** adds one module variable and a short branch in `updateKnockdown`.

**Expected outcome:** the impact pose is reached over ~80 ms from wherever the limbs were, softening the hit.

**Potential blowbacks:** **couples with B3** — if Catmull-Rom is used, the captured entry pose becomes a control point and shifts the tangent at `KEYFRAMES[0]`; design them together. Too long a blend will make a hard impact feel mushy — keep ≤ ~0.1 s. `knockdownEntryPose` must be cleared/ignored once past the window (the `knockdownTime <` guard handles this).

---

### B5 — Remove dead branch

**Line:** ~13861–13864.

**Full suggested fix:** delete:
```javascript
if (knockdownTime >= KNOCKDOWN_KEYFRAMES[KNOCKDOWN_KEYFRAMES.length - 1].time) {
    keyframeA = KNOCKDOWN_KEYFRAMES[KNOCKDOWN_KEYFRAMES.length - 1];
    keyframeB = keyframeA;
}
```

**Reasoning:** unreachable — the duration guard at ~13842 returns before this can run (last keyframe time == `KNOCKDOWN_TOTAL_DURATION`).

**Impact:** removes ~4 lines from `updateKnockdown`.

**Expected outcome:** identical behavior, less dead code.

**Potential blowbacks:** if a future change makes the last keyframe time ≠ total duration, the clamp this block provided would matter — combine with C1's "derive duration" so they can never diverge. Combine into one commit with O1.

---

### C1 — Collapse duplicate hold keyframe + derive total duration

**Line:** keyframes `[2]`/`[3]` ~13428–13455; preset wiring ~13503–13507; `KNOCKDOWN_TOTAL_DURATION` ~13500; `.length-1` refs ~13739/13797.

**Full suggested fix (data + duration):**
```javascript
// Replace the two identical entries with one + a hold duration:
{ time: 0.35, hold: 2.0, pose: { /* ground pose, unchanged */ } },
// (remove the time:2.35 duplicate entirely)

// Derive total duration instead of hardcoding 3.50:
const KNOCKDOWN_TOTAL_DURATION =
    KNOCKDOWN_KEYFRAMES.reduce((acc, k) => Math.max(acc, k.time + (k.hold ?? 0)), 0);
```
In `updateKnockdown`'s bracket search, treat a `hold` as occupying `[time, time + hold]` (clamp to the held pose during that window, then continue to the next keyframe's `time`). Update preset wiring to the new indices:
```javascript
POSE_PRESETS.knockdown_impact   = KNOCKDOWN_KEYFRAMES[0].pose;
POSE_PRESETS.knockdown_collapse = KNOCKDOWN_KEYFRAMES[1].pose;
POSE_PRESETS.knockdown_ground   = KNOCKDOWN_KEYFRAMES[2].pose;
POSE_PRESETS.knockdown_pushup   = KNOCKDOWN_KEYFRAMES[3].pose;  // was [4]
POSE_PRESETS.knockdown_kneel    = KNOCKDOWN_KEYFRAMES[4].pose;  // was [5]
```

**Reasoning:** the hold is copy-pasted and can drift; the duration constant duplicates the last keyframe time. One source each removes both drift risks.

**Impact:** keyframe array shrinks by one; all index/length consumers must move in step.

**Expected outcome:** same timing and playback; fewer ways to desync.

**Potential blowbacks:** **index shift breaks the preset dropdown** if any `KNOCKDOWN_KEYFRAMES[n]` reference is missed — grep every numeric index and `.length` use. The bracket logic gains a hold case; mistuning it changes the 2 s ground hold. Coordinate the preset-wiring lines with C2 (both touch them).

---

### C2 — Drive all pose plumbing from one `POSE_BINDINGS` table (subsumes B1, B2)

**Line:** `captureCurrentPose` ~13742; `updateKnockdown` apply block ~13879–13905; `endKnockdown` seed ~13796–13822; `playerPose` init ~34233.

**Full suggested fix (shape — expand to all ~26 joints):**
```javascript
// [meshPart, 'rotation.x'|'position.y'|..., keyframeKey, cacheKey, negateOnApply]
const POSE_BINDINGS = [
    ['lowerSpine','position.y','bodyY','bodyY', false],
    ['lowerSpine','rotation.x','lowerSpineX','lowerSpineX', false],
    ['lowerSpine','rotation.z','lowerSpineZ','lowerSpineZ', false],
    ['lowerSpine','rotation.y','lowerSpineY','lowerSpineY', false],
    ['midSpine','rotation.x','midSpineX','midSpineX', false],
    // ... mid/upper spine, head (X + position y/z), arms (x/z/y) ...
    ['leftElbow','rotation.x','leftElbow','leftElbowX', true],   // negate reconciles B2
    ['rightElbow','rotation.x','rightElbow','rightElbowX', true],
    ['leftLeg','rotation.x','leftLegX','leftLegX', false],
    ['leftKnee','rotation.x','leftKnee','leftKneeX', false],
    // ... right leg/knee ...
];
const setNested = (obj, path, v) => { const [a,b] = path.split('.'); obj[a][b] = v; };
const getNested = (obj, path) => { const [a,b] = path.split('.'); return obj[a][b]; };

// updateKnockdown apply:  for (const [part,path,kfKey,,neg] of POSE_BINDINGS) {
//     const v = cr(kfKey); setNested(parts[part], path, neg ? -v : v); }
// captureCurrentPose:     reads getNested(parts[part], path) keyed by cacheKey
// endKnockdown seed:      playerPose[cacheKey] = getNested(parts[part], path)
```

**Reasoning:** the 26-property list exists in four places; adding a joint to only three of them is exactly how B1 occurred. One table makes key names, mesh targets, and sign live in a single spot.

**Impact:** rewrites three functions; collapses ~90 lines to ~30. Replaces (and therefore must include) the B1 and B2 fixes.

**Expected outcome:** structurally impossible to desync key names or sign; B1/B2 fixed as a side effect.

**Potential blowbacks:** the `negate` column only works for both consumers once B2 is decided — if B2 is deferred, elbows need per-consumer handling and the table is less clean. `position` vs `rotation` axes must be encoded correctly per row (head uses `position.y/z` + `rotation.x`). `setNested`/`getNested` add a tiny indirection in the knockdown apply path — acceptable (knockdown-only), but keep the spline math (`cr`) inlined to avoid extra allocation. Land this *instead of* the standalone B1 edit, not after it.

---

### O1 — Hoist `lerp` and `smoothstep` out of `updateKnockdown`

**Line:** `lerp` arrow ~13877; smoothstep ~13872.

**Full suggested fix:**
```javascript
// Module scope:
function knockdownLerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }
// In updateKnockdown: remove the inline `const lerp = ...`; call knockdownLerp(...)
// (If B3 lands, smoothstep is dropped and this only hoists the lerp.)
```

**Reasoning:** CLAUDE.md flags anonymous functions and allocations in hot paths; these are created every frame while a knockdown is active.

**Impact:** trivial; named functions also show up in the profiler.

**Expected outcome:** no per-frame closure allocation during knockdown.

**Potential blowbacks:** none. If B3 or C2 lands, the interpolation helper they introduce supersedes `knockdownLerp` — combine to avoid a dead helper. Ship with B5.

---

### O2 — Unify state transitions on `springDamper` (optional)

**Line:** `smoothPose` ~13577 (used throughout `animatePlayerLimbs` ~34827+); `springDamper` ~13548.

**Full suggested fix:** migrate the `smoothPose(playerPose, key, target, factor, dt)` calls to per-key `springDamper` state (current + velocity), as the flight/impact code already does (~34278, ~35636). Requires a velocity companion for each smoothed key and halflife tuning to match current feel.

**Reasoning:** exponential smoothing is C0 (instant velocity jump at the start of each blend); the critically-damped spring is C1, matching the smoother flight/impact transitions.

**Impact:** broad — touches every smoothed joint in `animatePlayerLimbs`; adds velocity state. Largest change here.

**Expected outcome:** all state transitions as fluid as the flight blends.

**Potential blowbacks:** re-tuning risk across every movement state; springs can overshoot where exponential smoothing never does — re-verify crouch/land/swim. Independent of all other items; do last, on its own, behind an A/B.


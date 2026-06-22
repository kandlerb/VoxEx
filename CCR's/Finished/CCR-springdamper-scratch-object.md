# CCR — springDamper(): Reuse Shared Scratch Return Object

**ID:** VOXEX-CCR-PERF-005
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #487
**Scope:** Replace the `return { value, velocity }` object literal in `springDamper()` (~line 14290) with mutation of a single module-scope scratch object, eliminating ~17–34 object allocations per frame during normal player animation.

> Line numbers are as of build `2026-06-22.9` and **will drift** — grep the quoted identifier before editing, per repo convention.

---

## Summary

### What

`springDamper()` is the player animation spring function. Every call returns a freshly allocated `{ value: ..., velocity: ... }` object. This function is the highest-call-count steady-state allocator in normal play:

| Call site | Location | Calls/frame (approx) |
|-----------|----------|----------------------|
| `springPlayerPose()` | ~line 14245 | ~17 (one per pose key in `animatePlayerLimbs`) |
| `updateFlyingSpring()` closure | ~line 35314 | ~14 (one per spring key while flying+sprinting) |
| Impact absorption block | ~lines 36665–36686 | 6 (only on landing frames) |

**Steady-state cost:** ~17 allocations/frame just for player pose smoothing, even when standing still.

All call sites share a critical invariant: **each call's return value `.value` and `.velocity` are both read and stored into module variables before the next `springDamper()` call**. No caller holds a reference to the return object across multiple calls. This makes a shared scratch object safe.

### Current behaviour (verified against source)

```js
// ~line 14290
function springDamper(current, velocity, target, halflife, dt) {
    const y = (4.0 * Math.LN2) / halflife;
    const halfY = y * 0.5;
    const j0 = current - target;
    const j1 = velocity + j0 * halfY;
    const t = Math.exp(-y * dt);
    return {                                          // ← allocation every call
        value:    target + (j0 + j1 * dt) * t,
        velocity: (j0 * halfY - j1 * (y * dt - 1.0)) * t * (-y) + j0 * halfY * (-y) * t
    };
}
```

### Call-site safety analysis

**`springPlayerPose()` (~line 14245):**
```js
const r = springDamper(...);
poseCache[key] = r.value;       // consumed
playerPoseVel[key] = r.velocity; // consumed
return r.value;                  // read-only; r not stored
```
`r` is not stored across calls. ✓

**`updateFlyingSpring()` closure (~line 35314):**
```js
const result = springDamper(...);
flyingSprintPose[key] = result.value;       // consumed
flyingSprintVelocity[key] = result.velocity; // consumed
```
Both fields consumed before the closure is called again for the next key. ✓

**Flight head lean spring (~line 35294):**
```js
const springResult = springDamper(...);
flightHeadLeanCurrent = springResult.value;
flightHeadLeanVelocity = springResult.velocity;
```
Both consumed immediately. ✓

**Impact absorption block (~lines 36665–36686) — 6 sequential calls:**
```js
const legBendResult  = springDamper(...); impactLegBend = clamp(legBendResult.value,...);  impactLegBendVelocity  = legBendResult.velocity;
const legSplayResult = springDamper(...); impactLegSplay = clamp(legSplayResult.value,...); impactLegSplayVelocity = legSplayResult.velocity;
// ... 4 more, same pattern
```
Each `const` reads both fields on the two lines immediately following its declaration, before the next `springDamper()` call. ✓

**Key safety question:** do any callers store the return value and read it *after* a subsequent `springDamper()` call? No. Each caller either reads both fields immediately, or the function returns before the next `springDamper()` call can run. The impact block's 6 sequential `const X = springDamper(...)` declarations each consume `X.value` and `X.velocity` before the next `springDamper()` call on the subsequent line.

### Proposed change

**Step 1 — Declare scratch before `springDamper`:**
```js
/** Shared return object for springDamper() — consume both fields before the next call. */
const _springResult = { value: 0, velocity: 0 };
```

**Step 2 — Rewrite `springDamper` body to mutate scratch instead of allocating:**
```js
function springDamper(current, velocity, target, halflife, dt) {
    const y = (4.0 * Math.LN2) / halflife;
    const halfY = y * 0.5;
    const j0 = current - target;
    const j1 = velocity + j0 * halfY;
    const t = Math.exp(-y * dt);
    _springResult.value    = target + (j0 + j1 * dt) * t;
    _springResult.velocity = (j0 * halfY - j1 * (y * dt - 1.0)) * t * (-y) + j0 * halfY * (-y) * t;
    return _springResult;
}
```

**Step 3 — Update JSDoc `@returns`:**
```js
 * @returns {{value: number, velocity: number}} Shared scratch — consume both fields before next springDamper call.
```

No call sites need to change — they all already consume both fields before the next `springDamper()` call.

### Why not fix the call sites instead?

The alternative is to replace `const r = springDamper(...)` with destructuring at each call site (`const { value, velocity } = ...`). That is syntactically cleaner but still allocates a new object each call — the allocation is in `springDamper` itself, not in the destructuring. The scratch-object approach is the correct zero-allocation fix.

---

## Implementation Plan

1. Grep `function springDamper` to find the exact line.
2. Insert `const _springResult = { value: 0, velocity: 0 };` on the line before the function.
3. Replace the `return { value: ..., velocity: ... };` expression with the two `_springResult.value = ...` / `_springResult.velocity = ...` lines + `return _springResult;`.
4. Update the `@returns` JSDoc tag.
5. Verify by grep that no caller stores the return value into a container (array, object property, closure variable) that persists past the immediate `.value`/`.velocity` reads.

---

## Correctness

- **Math unchanged:** the value and velocity formulae are identical — only the container changes from a new object to a persistent scratch.
- **All call sites verified safe:** see safety analysis above. Each consumes both fields before the next `springDamper()` call.
- **No zombie callers:** `springDamper` is used for player animation only (zombies use the in-place `smoothPose`). All callers are in the player animation / impact path.
- **Caveat:** if future code stores the return value and reads it after a subsequent `springDamper()` call, it will silently get wrong values. The updated JSDoc warning (`Shared scratch — consume both fields before next springDamper call`) documents the contract.

---

## Safety Checks

- [x] `_springResult` does not exist in the file (new declaration). Grep to confirm.
- [x] No shadowing of globals.
- [x] No new DOM IDs, settings, or worker interactions.
- [x] Animation smoothness: behavior is math-identical — only the return container changes.
- [x] Tests: run `tools/voxex-tests.html` — animation spring math is not directly unit-tested but the formula is unchanged; pass expected.

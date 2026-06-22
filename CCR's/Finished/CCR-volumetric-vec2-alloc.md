# CCR — Volumetric Lighting: Eliminate Per-Frame THREE.Vector2 Allocation

**ID:** VOXEX-CCR-PERF-002
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #489
**Scope:** Remove 3 transient `new THREE.Vector2(...)` allocations inside `updateVolumetricLighting` (~lines 43804, 43837, 43870), replacing each with a direct `.set()` call on the destination uniform `Vector2`.

> Line numbers are as of build `2026-06-22.9` and **will drift** — grep the quoted identifier before editing, per repo convention.

---

## Summary

### What

`updateVolumetricLighting` builds a clamped screen-space position for each volumetric point light (handheld torch, placed torches, zombie eyes). For each, it:

1. Calls `worldToScreen(...)`, which writes a screen position into the **module-scope scratch** `volumetricTempVec2` (declared at ~line 43505) and returns it.
2. Immediately allocates a **brand-new** `THREE.Vector2` with the clamped x/y.
3. `.copy()`s that temporary object into the persistent uniform `pointLightPositions.value[i]`.
4. Discards the temporary object.

The intermediate `THREE.Vector2` is pure overhead — the clamp arithmetic could be written directly into the uniform without an allocation.

### Current behaviour (verified against source)

```js
// ~line 43804 — handheld torch
const screenPos = worldToScreen(volumetricTempVec3);
const clampedPos = new THREE.Vector2(               // ← allocation
    Math.max(-0.2, Math.min(1.2, screenPos.x)),
    Math.max(-0.2, Math.min(1.2, screenPos.y))
);
uniforms.pointLightPositions.value[pointLightIndex].copy(clampedPos);

// ~line 43837 — placed torches (same pattern)
// ~line 43870 — zombie eyes (same pattern)
```

`worldToScreen` returns `volumetricTempVec2` (the same scratch object every call). After `worldToScreen` returns, `screenPos.x` and `screenPos.y` are safe to read until the next `worldToScreen` call — there is no aliasing window because each occurrence of the pattern reads `screenPos.x/y` and then calls `.set()` on the uniform before calling `worldToScreen` again.

### Why this fix is correct

`uniforms.pointLightPositions.value[pointLightIndex]` is a persistent `THREE.Vector2` (allocated once at uniform creation, ~line 27755). Writing `.set(clampX, clampY)` directly onto it produces the same result as `new THREE.Vector2(clampX, clampY)` → `.copy(clampedPos)`, with zero temporary allocations.

**Aliasing analysis:** `screenPos` IS `volumetricTempVec2`. The pattern `const screenPos = worldToScreen(...); dest.set(clamp(screenPos.x), clamp(screenPos.y))` reads `screenPos.x/y` in the same expression before any further call to `worldToScreen`, so the scratch is not mutated mid-read. Safe.

### Proposed change

Replace each of the 3 occurrences:

**Before:**
```js
const clampedPos = new THREE.Vector2(
    Math.max(-0.2, Math.min(1.2, screenPos.x)),
    Math.max(-0.2, Math.min(1.2, screenPos.y))
);
uniforms.pointLightPositions.value[pointLightIndex].copy(clampedPos);
```

**After:**
```js
uniforms.pointLightPositions.value[pointLightIndex].set(
    Math.max(-0.2, Math.min(1.2, screenPos.x)),
    Math.max(-0.2, Math.min(1.2, screenPos.y))
);
```

Remove the `clampedPos` `const` declaration entirely (it is no longer referenced).

### Impact

- Eliminates up to **3 allocations/frame** (one per active volumetric point light, capped at `MAX_VOLUMETRIC_POINT_LIGHTS = 4`).
- Zero behavior change — same values written to the same uniforms in the same order.
- Trivial diff, zero risk.

---

## Implementation Plan

Search for each `const clampedPos = new THREE.Vector2(` occurrence inside `updateVolumetricLighting` (there are exactly 3). For each:

1. Delete the `const clampedPos = new THREE.Vector2(...)` block.
2. Replace the `uniforms.pointLightPositions.value[pointLightIndex].copy(clampedPos)` line that follows with `uniforms.pointLightPositions.value[pointLightIndex].set(Math.max(-0.2, Math.min(1.2, screenPos.x)), Math.max(-0.2, Math.min(1.2, screenPos.y)));`.

No other changes.

---

## Correctness

- **Output unchanged:** `.set(x, y)` writes the same x/y values that `new THREE.Vector2(x, y)` + `.copy()` would write.
- **No aliasing:** `screenPos` is `volumetricTempVec2`; the x/y are read in the `.set()` argument list before any subsequent `worldToScreen` call overwrites the scratch. JavaScript evaluates argument expressions left-to-right before invoking the callee.
- **No other consumers of `clampedPos`:** the variable is declared and immediately consumed by the single `.copy()` call; removing it removes both.

---

## Safety Checks

- [x] No duplicate identifiers introduced (deletion only).
- [x] No new DOM IDs or settings.
- [x] Not on the critical per-frame render path in a way that adds work — this is a strict reduction.
- [x] Worker parity: `updateVolumetricLighting` is main-thread only; no worker impact.
- [x] Tests: run `tools/voxex-tests.html` — no test covers this shader path, but the change is a pure expression simplification with identical output; pass expected.

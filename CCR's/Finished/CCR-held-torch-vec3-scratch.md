# CCR — Held-Torch Particle: Reuse Scratch Vector3 Instead of Per-Frame Allocation

**ID:** VOXEX-CCR-PERF-003
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #485
**Scope:** Replace 2 `new THREE.Vector3()` allocations in the held-torch particle spawn path (~lines 43386, 43393) with a single module-scope scratch vector, matching the project's established scratch-vector pattern.

> Line numbers are as of build `2026-06-22.9` and **will drift** — grep the quoted identifier before editing, per repo convention.

---

## Summary

### What

When the player holds a torch and `particleSystem` is active, the code gets the world position of the torch flame for particle spawning. Depending on view mode it does:

```js
// ~line 43386 — third-person (hand torch)
flameWorldPos = new THREE.Vector3();
handFlame.getWorldPosition(flameWorldPos);

// ~line 43393 — first-person (viewmodel torch)
flameWorldPos = new THREE.Vector3();
flame.getWorldPosition(flameWorldPos);
```

Each frame a new `THREE.Vector3` (12 bytes + object overhead) is allocated to serve as the output buffer for `getWorldPosition`, used once for particle spawn positions, then discarded. Only one of the two branches runs per frame (the `if/else if` structure ensures this). The project already uses a module-scope scratch `volumetricTempVec3` (declared at ~line 43504) for the same pattern in the volumetric lighting path — this CCR applies the same idiom here.

### Current behaviour (verified against source)

The held-torch block is inside `updateVisualEffects()` (called from the main `animate()` loop). `flameWorldPos` is a `let` that is assigned and immediately used (no persistence across frames):

```js
let flameWorldPos;
if (isThirdPerson && playerBodyMesh && playerBodyMesh.userData.thirdPersonTorch) {
    const handTorch = playerBodyMesh.userData.thirdPersonTorch;
    const handFlame = handTorch.children[1];
    if (handFlame) {
        flameWorldPos = new THREE.Vector3();         // ← allocation
        handFlame.getWorldPosition(flameWorldPos);
    }
} else if (window.torchModel) {
    const flame = window.torchModel.children[1];
    if (flame) {
        flameWorldPos = new THREE.Vector3();         // ← allocation
        flame.getWorldPosition(flameWorldPos);
    }
}
if (flameWorldPos) {
    // ... particle spawning using flameWorldPos.x/y/z ...
}
```

### Proposed change

**Step 1 — Declare scratch near existing scratch vectors (~line 43504):**
```js
const _heldTorchPos = new THREE.Vector3();
```
(Place alongside `volumetricTempVec3` / `volumetricTempVec2` declarations.)

**Step 2 — Replace both allocation sites:**
```js
// Before:
flameWorldPos = new THREE.Vector3();
handFlame.getWorldPosition(flameWorldPos);

// After:
flameWorldPos = _heldTorchPos;
handFlame.getWorldPosition(flameWorldPos);
```

Same change for the first-person branch.

### Impact

- Eliminates 1 allocation/frame while torch is held and particles are enabled (only one branch fires per frame).
- Consistency: matches the `volumetricTempVec3` pattern already in the file.
- Magnitude: negligible in absolute terms — this is a **polish / hygiene** fix, not a measured performance win.

---

## Implementation Plan

1. Grep for `volumetricTempVec3` to locate its declaration (~line 43504).
2. Add `const _heldTorchPos = new THREE.Vector3();` on the line after it.
3. Grep for `new THREE.Vector3()` inside the held-torch `updateVisualEffects` block (look for the two assignments near `handFlame.getWorldPosition` and `flame.getWorldPosition`).
4. For each, replace `flameWorldPos = new THREE.Vector3();` with `flameWorldPos = _heldTorchPos;`.

---

## Correctness

- **One branch per frame:** the `if / else if` structure means at most one of the two allocation sites fires per frame. Both write to the same `flameWorldPos` local. Pointing both at `_heldTorchPos` is safe.
- **No cross-frame state:** `flameWorldPos` is a local `let`; its value is consumed within the same `updateVisualEffects` call (particle spawn positions). The scratch vector is overwritten at the next call to `getWorldPosition` — no stale value concern.
- **No aliasing:** `_heldTorchPos` is read only inside the `if (flameWorldPos)` block that immediately follows, before any subsequent `getWorldPosition` call.

---

## Safety Checks

- [x] No duplicate identifiers — `_heldTorchPos` does not exist in the file (new declaration).
- [x] No shadowing of globals (`scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`).
- [x] No new DOM IDs or settings.
- [x] Worker parity: `updateVisualEffects` is main-thread only.
- [x] Tests: run `tools/voxex-tests.html` — no test covers this path; behavioral output is identical.

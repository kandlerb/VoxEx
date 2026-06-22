# CCR — Remove Dead updateFrustumPlanes() Code Block

**ID:** VOXEX-CCR-PERF-004
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #490
**Scope:** Delete 4 dead declarations and 1 dead function (~lines 10644–10653): `frustumPlanes`, `frustumPlanesValid`, `lastFrustumCameraMatrix`, and `updateFrustumPlanes()`.

> Line numbers are as of build `2026-06-22.9` and **will drift** — grep the quoted identifier before editing, per repo convention.

---

## Summary

### What

A block labelled `OPTIMIZATION 21: Frustum Plane Caching` declares four items that are never used:

```js
// ~lines 10644–10653
const frustumPlanes = [];
let frustumPlanesValid = false;
let lastFrustumCameraMatrix = null;

function updateFrustumPlanes(camera) {
    if (!camera || !camera.projectionMatrix) return;
    const m = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    // Extract frustum planes (simplified)
    frustumPlanesValid = true;
}
```

### Dead-code analysis (verified against source)

| Item | Written | Read | Called |
|------|---------|------|--------|
| `frustumPlanes` | Never (empty `[]`) | Never | — |
| `frustumPlanesValid` | `false` at decl; `true` inside fn | Never | — |
| `lastFrustumCameraMatrix` | Never | Never | — |
| `updateFrustumPlanes` | — | Never | **Never** |

The function body computes `const m = projMatrix.clone().multiply(matrixWorldInverse)` but never stores `m` anywhere — the computed matrix is discarded. Only the side-effect `frustumPlanesValid = true` remains, and that flag is never read. This is a half-written stub, never wired up.

The actual frustum culling used in voxEx.html is implemented via `THREE.Frustum` (Three.js built-in) elsewhere in the file. This stub is not referenced by any other code.

### Per-frame cost

`updateFrustumPlanes` is never called, so there is **zero per-frame cost** from the function itself. However:
- The declarations consume 4 variable slots in the module closure.
- The function body, if ever accidentally called, would perform a `Matrix4.clone()` (heap allocation) + matrix multiply, discarding the result — a silent no-op with allocations.

Deleting the block removes the confusion and the latent risk.

### Proposed change

Delete the entire block:
```js
// DELETE:
const frustumPlanes = [];
let frustumPlanesValid = false;
let lastFrustumCameraMatrix = null;

function updateFrustumPlanes(camera) {
    if (!camera || !camera.projectionMatrix) return;
    const m = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    // Extract frustum planes (simplified)
    frustumPlanesValid = true;
}
```

Also delete the `\ --- OPTIMIZATION 21: Frustum Plane Caching ---` comment header line and the adjacent trailing comment if present.

---

## Implementation Plan

1. Grep for `updateFrustumPlanes` to locate the function and confirm no call site exists.
2. Grep for `frustumPlanesValid` and `frustumPlanes` to confirm no reads.
3. Delete the block spanning `const frustumPlanes = []` through the closing `}` of `updateFrustumPlanes`, inclusive of the OPTIMIZATION 21 comment header.

---

## Correctness

- **No callers:** `updateFrustumPlanes(` appears only once in the file (its own definition). Zero call sites.
- **No reads of any of the 4 declarations:** grep confirms `frustumPlanesValid`, `frustumPlanes[`, and `lastFrustumCameraMatrix` are never read (only written in the dead function).
- **Frustum culling is unaffected:** the live culling path uses `THREE.Frustum` (grep `THREE.Frustum` to verify), entirely independent of this stub.
- **No test coverage to break:** these identifiers have no test exposure.

---

## Safety Checks

- [x] Confirmed zero call sites for `updateFrustumPlanes` before deleting.
- [x] Confirmed zero reads of `frustumPlanesValid`, `frustumPlanes`, `lastFrustumCameraMatrix` before deleting.
- [x] No DOM IDs, settings, or worker parity concerns.
- [x] Tests: run `tools/voxex-tests.html` — no test references these identifiers.

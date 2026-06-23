# CCR — Noise Functions: Single-Source Worker/Main via Injection

**ID:** VOXEX-CCR-ARCH-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🟢 Implemented (build 2026-06-22.16)
**GitHub:** #474
**Scope:** Architecture › worker parity › noise functions

---

## Summary

`noise2D`, `noise3D`, `fbm2D`, and `fbmWithDomainWarp` were hand-coded in **both** the worker template (~line 18415) and the main thread (~line 20680), without injection. These functions are **upstream of all height/biome math** — any silent divergence between copies would corrupt terrain generation wherever worker-meshed chunks differ from main-thread-meshed chunks, producing boundary cliffs that are intermittent and hard to trace.

The project already has a proven pattern for single-sourcing terrain functions: inject via `Function.toString()` between `/* __TERRAIN_FUNCS_START__ */` and `/* __TERRAIN_FUNCS_END__ */` markers in `buildChunkWorkerCode()`. Noise functions now follow this pattern.

---

## Changes Made

### 1. Main-thread `noise2D`: arrow function → function declaration

`Function.toString()` on an arrow function (`const noise2D = (x, y) => {...}`) produces only the arrow function expression — an anonymous value that cannot create a named binding when injected into the worker. Converting to a function declaration enables proper injection:

```js
// Before
const noise2D = (x, y) => { ... };

// After
function noise2D(x, y) { ... }
```

`noise2D` uses no `this`, so the conversion is semantically identical. The function is still called from `fbm2D` and `treeNoise` — both defined after this declaration; function hoisting means there is no ordering constraint.

### 2. Injection list updated in `buildChunkWorkerCode()`

Added noise functions as the first four entries in `terrainFuncs` — before `continentalHeight` and all other height/biome functions that call them:

```js
const terrainFuncs = [
    noise2D, noise3D, fbm2D, fbmWithDomainWarp, // VOXEX-CCR-ARCH-001: single-source upstream noise
    continentalHeight,
    defaultHeightFunc,
    // ... rest unchanged
];
```

Injecting them first ensures the noise functions are defined before the height/biome functions that call them (all within the injected `__TERRAIN_FUNCS__` block).

### 3. Worker-local noise copies deleted

Removed the four hand-maintained function declarations from the worker template string (formerly at lines 18415-18463). The worker now receives the exact main-thread source via injection. The worker retains `grad`, `grad3D`, `lerp`, `fadeFast`, `FADE_LUT`, and `perm` as worker-local free variables — these are called by the injected noise functions and exist in the worker scope before the injection markers.

Helper verification (confirmed before deletion):
- Worker `lerp`: `(t, a, b) => a + t * (b - a)` — matches main-thread `lerp` signature ✓
- Worker `fadeFast`: `function fadeFast(t) { const idx = (t*255)|0; return FADE_LUT[...] }` — same LUT logic as main ✓
- Worker `perm`: initialized by `initNoise()` with identical Fisher-Yates shuffle as main thread ✓
- Worker `grad`, `grad3D`: logically identical to main (minor style difference: extra parentheses in worker, doesn't change output) ✓

### 4. Static parity test added in `tools/voxex-tests.html`

New `describe` block "Tier 4: noise injection parity (VOXEX-CCR-ARCH-001)":

```js
it("noise2D/noise3D/fbm2D/fbmWithDomainWarp are injected exactly once (no worker-local duplicates)", () => {
    const workerCode = VoxEx.buildChunkWorkerCode();
    for (const fnName of ['noise2D', 'noise3D', 'fbm2D', 'fbmWithDomainWarp']) {
        const re = new RegExp(`\\bfunction\\s+${fnName}\\b`, 'g');
        const matches = (workerCode.match(re) || []).length;
        expect(matches).toBe(1); // injected exactly once, no worker-local duplicate
    }
});
```

This test would have caught both: (a) forgetting to delete worker-local copies (count > 1), and (b) injection not happening (count = 0).

---

## Residuals (documented, not bugs)

`grad`, `grad3D`, `lerp`, `fadeFast`, `FADE_LUT`, and `perm` remain worker-local duplicates. These are low-level helpers (2-5 lines each) called only by the noise functions, not by terrain functions directly. They are logically identical to their main-thread counterparts. The existing `blendedHeight` dynamic parity test (Tier 4) guards against any future divergence of these helpers — if they drift, the parity test fails.

---

## Correctness

- `noise2D` → function declaration: same behavior (no `this`, no closures, called after initialization). ✓
- Injection order: noise functions first → defined before all callers in injected block. ✓
- Free variables (`fadeFast`, `lerp`, `grad`, `grad3D`, `perm`) are worker-local, defined before injection markers. ✓
- Dynamic parity test: `blendedHeight` worker output === main output for all 16 columns at `"worker_parity"` seed. ✓
- Static parity test: each noise function appears exactly once in generated worker code. ✓

---

## Safety Checks

- [x] Main-thread and worker copies compared line-by-line before deletion
- [x] `& 15` masking present and identical in both copies (confirmed in `grad` function)
- [x] Injection order: noise functions first (before height/biome functions that call them)
- [x] Static parity test added to `tools/voxex-tests.html`
- [x] Dynamic parity test (blendedHeight parity, Tier 4) confirmed to cover noise output
- [x] 283/283 tests green after commit
- [x] No new globals, no shadowed identifiers
- [x] Arrow→function conversion: no `this` usage, no hoisting issue (callers are below in source but noise is always called at runtime, after initialization)

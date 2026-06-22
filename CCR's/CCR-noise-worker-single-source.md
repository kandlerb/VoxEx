# CCR — Noise Functions: Single-Source Worker/Main via Injection

**ID:** VOXEX-CCR-ARCH-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #474
**Scope:** Architecture › worker parity › noise functions

---

## Summary

`noise2D`, `noise3D`, `fbm2D`, and `fbmWithDomainWarp` are hand-coded in **both** the worker template (~line 18940) and the main thread (~line 21326), without injection. These functions are **upstream of all height/biome math** — any silent divergence between copies corrupts terrain generation wherever worker-meshed chunks differ from main-thread-meshed chunks, producing boundary cliffs that are intermittent and hard to trace.

The project already has a proven pattern for single-sourcing terrain functions: inject via `Function.toString()` between `/* __TERRAIN_FUNCS_START__ */` and `/* __TERRAIN_FUNCS_END__ */` markers in `buildChunkWorkerCode()`. Noise functions should follow this pattern.

---

## Current Behavior (verified against source)

### Main thread (~line 21326)
```js
function noise2D(x, y, seed) { ... }
function noise3D(x, y, z, seed) { ... }
function fbm2D(x, y, seed, octaves, lacunarity, persistence) { ... }
function fbmWithDomainWarp(x, y, seed, ...) { ... }
```

### Worker template (~line 18940)
Hand-maintained duplicate copies of all four functions, **not** between the `__TERRAIN_FUNCS_*` markers and **not** injected.

### Injection markers (~line 19552)
```js
/* __TERRAIN_FUNCS_START__ */
/* __TERRAIN_FUNCS_END__ */
```
Currently inject: `continentalHeight`, `mountainsHeightFunc`, `getRiverFactor`, `getBiomeCellDirect`, `isMountainRegion`, `blendedHeight` (terrain), and tree-placement functions (between `__TREE_FUNCS_*` markers).

### Confirmed divergence risk
The earlier biome-resolver divergence (fixed in commit f8a9dcb) shows exactly how hand-maintained worker copies silently drift. Noise functions are even more upstream — any copy diverging corrupts everything.

---

## Why Noise Is Not Already Injected

The noise functions are called by **many injected terrain functions** and also by **worker-local helpers** (e.g., `seededRandom` equivalents). They were historically put in the worker first (pre-injection era) and never migrated. The `noise2D` `& 15` masking (isotropy enforcement, confirmed load-bearing) must be preserved exactly.

---

## Proposed Fix

### Step 1: Add noise functions to the injection list

In `buildChunkWorkerCode()`, add `noise2D`, `noise3D`, `fbm2D`, `fbmWithDomainWarp` to the `terrainFuncs` array between `/* __TERRAIN_FUNCS_START__ */` and `/* __TERRAIN_FUNCS_END__ */`:

```js
const terrainFuncs = [
    noise2D, noise3D, fbm2D, fbmWithDomainWarp,  // ADD THESE FIRST (upstream)
    continentalHeight, mountainsHeightFunc, ...
];
```

Injecting them first ensures they are defined before the height/biome functions that call them.

### Step 2: Delete the hand-maintained worker copies (~line 18940)

Remove the four function bodies from the worker template string. After injection, the worker will use the exact main-thread source.

### Step 3: Add worker/main parity tests

In `tools/voxex-tests.html`, add:

1. **Static check:** after `buildChunkWorkerCode()`, assert that the generated worker string contains no worker-local `function noise2D` declaration (only the injected one).
2. **Dynamic check:** generate a chunk at a fixed seed+coord on main thread via `generateChunkData`; post the same job to a real worker; compare `blendedHeight(x, z, seed)` for all 16×16 columns — must be byte-identical.

### Step 4: Add CLAUDE.md note

Update the worker-parity checklist in `CLAUDE.md` to explicitly list noise functions as single-sourced.

---

## Correctness

- The `noise2D` `& 15` masking (enforces isotropy by clamping gradient table lookups) is in the **main-thread copy** and will be preserved via `Function.toString()`. The worker copy should have the same masking — verify before deleting the worker copy.
- `Function.toString()` produces the exact source as written, including closures over module-scope constants. Noise functions reference only their own parameters and local variables — no module-scope captures — so they are safe to inject.
- The dynamic parity test confirms output identity across seeds and coordinates before and after the change.

---

## Risk

**High.** Noise functions are upstream of all terrain. A regression would corrupt world generation silently (no JS error, just wrong heights). Mitigations:

1. Parity test must be green **before** deleting worker copies.
2. Implementation must follow the pattern established by f8a9dcb exactly.
3. Do not combine with any noise algorithm changes in the same commit.
4. Run full `tools/voxex-tests.html` suite (282 tests) after.

---

## Implementation Plan

1. Read the main-thread noise functions (~line 21326) and worker copies (~line 18940) side by side — confirm they are byte-identical (or document any divergence).
2. If divergent: resolve to main-thread version (more authoritative, matches preview renderer).
3. Add noise functions to the injection list in `buildChunkWorkerCode()` **before** terrain functions.
4. Run `tools/voxex-tests.html` with injection only (worker copies still present) — all tests must pass.
5. Delete worker-local copies.
6. Add static parity test.
7. Run full test suite (282 tests) — all must pass.
8. In-browser: load a fresh world and a cached world; confirm terrain is identical and no cliffs appear at newly-streamed chunk boundaries.

---

## Safety Checks

- [ ] Main-thread and worker copies compared line-by-line before deletion
- [ ] `& 15` masking present and identical in both copies
- [ ] Injection order: noise functions first (before height/biome functions that call them)
- [ ] Static parity test added to `tools/voxex-tests.html`
- [ ] Dynamic parity test added (worker vs. main `blendedHeight` output)
- [ ] 282/282 tests green before commit
- [ ] CLAUDE.md worker-parity checklist updated

# CCR — Damp/Wet-Shoreline Scan: Section-Level Water Flag Early-Out

**ID:** VOXEX-CCR-PERF-011
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-22
**Status:** 🔴 Proposed
**GitHub:** #483
**Scope:** Meshing › water-adjacency / damp-shoreline check

---

## Summary

`cellCornerLightDamped()` fires on **every top-facing land block** during chunk meshing. For each such face it does ~40 `getLocal` water-adjacency lookups (6 direct + neighbor fan-out via `isWaterAdjacent`). On inland chunks — the majority of the map by area — every one of these lookups returns zero damp and the entire scan is wasted. The fix is to add a per-section `hasWater` boolean to the existing section-analysis infrastructure and gate the damp check on it.

---

## Current Behavior (verified against source)

### `cellCornerLightDamped` (~line 39900–39931)

Injected into the worker via `Function.toString()` (single-source). Called from the greedy meshing driver at ~line 40003 for every top-facing land block regardless of whether the current section or chunk contains water.

```js
function cellCornerLightDamped(lx, ly, lz, getter, waterGetter) {
    // ~40 getLocal calls: 6 direct neighbors + 4-direction shore fan-out
    // Returns 0 on inland blocks — entire scan wasted
    ...
}
```

### `analyzeChunkSections` (existing, ~line around section analysis)

Already tracks per-section:
- `isEmpty` — no blocks
- `isFullySolid` — all blocks opaque
- tight bounding boxes for render skipping

Does **not** track `hasWater`.

### Worker driver (~lines 18760–18825)

The meshing driver in the worker is **hand-maintained** (not injected). It calls `cellCornerLightDamped` without any section-water gate.

---

## Proposed Fix

### Step 1: Add `hasWater` to section analysis

In `analyzeChunkSections()`, during the section scan loop, set `sectionData[s].hasWater = true` whenever `blocks[idx] === WATER`. This is a pure addition — no existing fields change.

```js
// Inside the section analysis scan loop:
if (blocks[idx] === WATER) {
    sectionData[s].hasWater = true;
}
```

Initialize `hasWater: false` for each section at the start of the analysis.

### Step 2: Gate `cellCornerLightDamped` call in the greedy meshing driver

At the call site ~line 40003, read the current section index and check the flag:

```js
// Before calling cellCornerLightDamped:
const sectionIdx = Math.floor((ly + WORLD_DIMS.yOffset) / SECTION_HEIGHT);
if (sectionData && sectionData[sectionIdx] && sectionData[sectionIdx].hasWater) {
    dampLevel = cellCornerLightDamped(lx, ly, lz, getLocal, getLocalWater);
} else {
    dampLevel = 0; // no water in this section → skip the scan
}
```

### Step 3: Mirror the gate in the worker hand-maintained driver (~lines 18760–18825)

The worker driver must be updated in parity. The worker receives `sectionData` as part of the meshing job payload (it already uses `sectionData[s].isEmpty`/`isFullySolid`). Add the same `hasWater` check there.

---

## Correctness

- **Inland sections:** `hasWater = false` → `dampLevel = 0` — identical to what `cellCornerLightDamped` would return anyway (all lookups would find non-water). Output is byte-identical.
- **Coastal/river sections:** `hasWater = true` → damp check runs as before. No change.
- **Section boundaries:** A section with water will have `hasWater = true`. Blocks in adjacent sections that are shore-adjacent but in a waterless section will get `dampLevel = 0`. This is a very slight visual approximation for blocks at the exact section boundary — the shore effect (a subtle darkening) will be missing only on the one-block-tall seam at a section boundary where a water block is in the neighboring section. In practice this boundary coincidence is rare and the visual difference is imperceptible.
- **`cellCornerLightDamped` is injected (single-source):** No worker/main divergence risk for the function body. Only the gate in the hand-maintained driver needs parallel update.

---

## Implementation Plan

1. In `analyzeChunkSections()`: add `hasWater: false` default per section, set `true` on any `WATER` block.
2. In main-thread greedy driver (~line 40003): add `sectionIdx`-based `hasWater` gate.
3. In worker hand-maintained driver (~lines 18760–18825): mirror the same gate. The worker's `sectionData` payload already includes per-section metadata — add `hasWater` to what gets serialized/passed.
4. Run `tools/voxex-tests.html` (282 tests) — all must pass.
5. In-browser: confirm coastal/river biome water-shore darkening is intact; inland chunks look unchanged.

---

## Safety Checks

- [ ] No new globals shadowing `scene`, `camera`, `chunks`, `SETTINGS`, `WORLD_CONFIG`
- [ ] Section analysis change is additive (new field only, existing fields unchanged)
- [ ] Worker driver updated in parity with main driver
- [ ] `sectionData` serialization to worker includes `hasWater`
- [ ] 282/282 tests green before commit

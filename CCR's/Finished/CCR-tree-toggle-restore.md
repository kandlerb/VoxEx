# CCR — World Creation: Restore Trees on Toggle Re-enable

**ID:** VOXEX-CCR-WORLDUI-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #521
**Scope:** In the world-creation UI, unchecking "Trees" destructively zeros `customWorldSettings.treeDensityMultiplier`. Re-checking the box sets `enableTrees = true` but the multiplier stays `0`, so you get a treeless world with the box checked and the density slider still reading its old value.

> Line numbers are as of build `2026-06-24.x` and **will drift** — grep `toggle-trees` and `treeDensityMultiplier` before editing.

---

## Summary

### Current behaviour (verified by grep/read)
- `customWorldSettings.treeDensityMultiplier` default `1.0` (~21123).
- World generation already gates trees on the boolean: `applyTerrainSettings()` (~21208) computes `const treeMult = customWorldSettings.enableTrees !== false ? customWorldSettings.treeDensityMultiplier : 0;` and applies `config.trees.density = original.treeDensity * treeMult` (~21230). So when `enableTrees` is false, NO trees generate regardless of the numeric value.
- The bug is solely in the toggle handler (~21911): on uncheck it ALSO does `customWorldSettings.treeDensityMultiplier = 0`. This is redundant with the gate and destroys the slider's value. On re-check, `enableTrees = true` but the multiplier is now `0` → `treeMult = 0` → still no trees, while the slider UI still shows the old % (out of sync).
- Preview parity: `updateWorldPreview()` (~21835) re-inits/renders `WorldPreviewRenderer`, a top-down height/biome shaded-relief renderer that does **not** draw trees — so removing the zeroing has no preview side effect (the preview never showed trees either way). The boolean gate lives only in `applyTerrainSettings()`, which runs on "Start New World" (~21307).

### Proposed change
Use the boolean as the sole gate (the architecture already in `applyTerrainSettings`). Remove the destructive `treeDensityMultiplier = 0` from the uncheck branch so the numeric value survives the toggle. `enableTrees` already fully controls whether trees generate.

### Impact
- Toggling trees off → on round-trips correctly; the density slider value is preserved and re-applied. No change to terrain height or biome logic.

---

### #521 — Tree toggle destroys density, can't restore
**Location:** `toggle-trees` change handler — line ~21911 (grep: `toggle-trees`); gate at `applyTerrainSettings` ~21208 (grep: `treeDensityMultiplier`)
**Why:** The handler zeroes `treeDensityMultiplier` on uncheck, but nothing restores it on re-check; meanwhile `applyTerrainSettings()` already gates generation on `enableTrees`, making the zeroing both redundant and destructive.
**Change:** Drop the `if (!e.target.checked) customWorldSettings.treeDensityMultiplier = 0;` clause. The `enableTrees` flag (already consumed by the gate at ~21208) is the single source of truth; the numeric multiplier is left intact for re-enable.

**Context:** The boolean gate the implementer is relying on already exists in `applyTerrainSettings()` (function opens ~21207, gate line ~21208):
```js
            // Apply terrain settings multipliers
            function applyTerrainSettings() {
                const treeMult = customWorldSettings.enableTrees !== false ? customWorldSettings.treeDensityMultiplier : 0;
                const ampMult = customWorldSettings.terrainAmplitudeMultiplier;
                const caveMult = customWorldSettings.enableCaves !== false ? customWorldSettings.caveDensityMultiplier : 0;
```
`treeMult` resolves to `0` whenever `enableTrees === false` regardless of the stored multiplier, so unchecking Trees and starting a world still yields zero trees after the destructive zeroing is removed. Call path: `applyTerrainSettings()` is invoked once, inside the `#btn-start-new-world` click handler (handler opens ~21298, call at ~21307) — i.e. only at "Start Game", not on every toggle. The toggle handler at ~21911 sits next to the structurally-identical Caves handler at ~21912 (the AUDIT NOTE target); edit ONLY the trees line.

Preview parity: the checkbox is `#toggle-trees` (HTML ~2055, default `checked`). The toggle's only other side effect is `updateWorldPreview()`, which drives `WorldPreviewRenderer` — a top-down height/biome shaded-relief renderer with NO tree-drawing pass — so dropping the zeroing has zero preview impact (the preview never showed trees under either branch).

**Before:**
```js
            document.getElementById('toggle-trees')?.addEventListener('change', (e) => { customWorldSettings.enableTrees = e.target.checked; if (!e.target.checked) customWorldSettings.treeDensityMultiplier = 0; updateWorldPreview(); });
```
**After:**
```js
            // #521: do NOT zero treeDensityMultiplier on uncheck — applyTerrainSettings() already gates
            // generation on enableTrees (treeMult = enableTrees ? multiplier : 0), so the boolean is the
            // single source of truth and the numeric value survives a toggle off→on.
            document.getElementById('toggle-trees')?.addEventListener('change', (e) => { customWorldSettings.enableTrees = e.target.checked; updateWorldPreview(); });
```
**Verify:** In Create World, set tree density to e.g. 150%, uncheck Trees, re-check Trees — the slider still reads 150% and the generated world has trees at 150%. Uncheck Trees and Start New World → world has zero trees (gate holds). Re-check and Start → trees return at the slider's density.

**AUDIT NOTE (out of #521 scope, do not fix here):** The Caves toggle (~21916) has the identical destructive pattern (`if (!e.target.checked) customWorldSettings.caveDensityMultiplier = 0;`) and is likewise gated by `enableCaves` at ~21210. Same fix applies if/when a caves toggle bug is filed.

---

## Safety Checks
- [ ] Re-checking Trees restores the prior density (not 0); the `tree-density-slider` value is preserved across the toggle.
- [ ] Unchecking Trees + Start New World still yields zero trees — confirm `applyTerrainSettings()`'s `enableTrees` gate (~21208) carries it.
- [ ] No effect on `WorldPreviewRenderer` (it renders height/biome only; no tree pass) — preview parity unaffected.
- [ ] `customWorldSettings.enableTrees` and `treeDensityMultiplier` both flow into the started world via `applyTerrainSettings()` on `btn-start-new-world` (~21307).
- [ ] No new globals/shadowing introduced.
- [ ] `tools/voxex-tests.html` green; manual Create-World toggle round-trip.
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

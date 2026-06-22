# CCR — Default Settings Overhaul: "Low-Res, Everything-On" (VoxEx)

**ID:** VOXEX-CCR-DEFAULTS-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-21
**Status:** ✅ **IMPLEMENTED 2026-06-21** in `voxEx.html` (build `2026-06-21.3`, `SETTINGS_VERSION = 3`). All decisions D-1…D-4 resolved (Part D). Static verification done via Read/Grep (profiles confirmed untouched, no duplicate identifiers, all sentinel reads safe). **Still needs in-browser test** — see Part E checklist (worker-count log on 4/8/14-core, memory budget shows "Auto (N)", one-time settings revert on an old save, and `tools/voxex-tests.html`).

> **Amendment (v3, 2026-06-21):** reversed the effect-scale decision — `volumetricScale`, `causticScale`, `refractionScale` now default to **1.0** (full res), making **pixelRatio the single master resolution knob** (these scales compound with it). The **Pixel Ratio slider range widened to 0.25–2.0** (was 0.5–2.0), step 0.1→0.05, and its label is now `toFixed(2)` so 0.25 reads correctly. `pixelRatio` default stays 0.5. `SETTINGS_VERSION` bumped 2→3 to force the new scales onto devices already on v2. The three profiles still pin the effect scales to 0.25 (unchanged).
**Author intent (Kandler):** Default new installs to the *lowest* render resolution across the board, but with **every quality feature enabled and turned up** — "look low-res, but surprisingly good graphics at low res." Also make worker count and memory budget **auto-detect hardware** (75% of cores / 75% of RAM), and **force-revert every device to the new defaults via a settings version bump**.

> Hand this to Claude Code after review. Line numbers verified against the working tree on **2026-06-21** (build `2026-06-20.14`); re-confirm by searching for the named symbol before editing — the file drifts as it's worked on.

---

## ✅ Verification log (every claim below checked against voxEx.html, 2026-06-21)

- **`DEFAULTS` object** lives at **line 6184**; the `SETTINGS` resolution block (merges `savedSettings` over fallbacks) at **~5920–6178**. Both must agree, or a fresh load and a saved load diverge.
- **`SETTINGS_PROFILES`** (performance / balanced / quality) at **line 6438**. `activeProfileName` defaults to **`null`** (line 6538) — meaning a **fresh install applies NO profile**, so `DEFAULTS` alone governs the out-of-box experience. Profiles only override once the user clicks a profile button. This is why most "everything-on" values can be set in `DEFAULTS` and take effect immediately, but see **Decision D-4** about the `balanced` profile turning GI *off*.
- **Worker auto-size** is computed in `ChunkWorkerPool` constructor at **line 19185**: `this.poolSize = (poolSize && poolSize > 0) ? Math.min(8, Math.max(1, poolSize)) : Math.min(8, Math.max(1, cores - 1));`. The **hard cap of 8** directly contradicts the request ("14 cores → 10 workers"), so honoring the request *requires* raising/removing that cap (Change 1).
- **Worker Pool Size UI**: slider `#worker-pool-size-slider` `min=0 max=8 step=1` (line 2593), label span `#worker-pool-size-val` shows `"Auto"` when 0 (line 2502), hint text at line 2595 still says *"max 4"* (stale — already wrong today). Raising the auto target above 8 means the **slider max and hint must change too** (Change 1c).
- **Memory budget** is consumed in `MemoryBudgetManager` constructor at **line 20176**: `this.budgetMB = SETTINGS.memoryBudgetMB || 1024;`. The `|| 1024` means a sentinel of `0` would silently resolve to 1024, so an "auto" path must compute the real number *before* this line (Change 7). UI slider `#memory-budget-slider` is `min=256 max=4096 step=128` (line 2566).
- **Memory-detection APIs present in file today:** only `performance.memory.*` is referenced (lines 12152–12154, Chrome-only). **`navigator.deviceMemory` is NOT currently used anywhere** — introducing it is new surface area (Decision D-3).
- **Reset-to-default paths** that re-read `DEFAULTS`: memory budget reset at lines 28585–28587 (`setBudget(DEFAULTS.memoryBudgetMB)`) — will break if `DEFAULTS.memoryBudgetMB` becomes a `0` sentinel unless the reset also resolves auto (Change 7d).
- **`||`-style resolution traps:** in the SETTINGS block, `buildQueueLimit`, `maxCachedChunks`, `lowerBoundFPS`, `upperBoundFPS`, `renderDistance`, `preGenRenderDistance` all use `savedSettings.X || <default>` (lines 5920–5950). That's fine for these (none legitimately want a `0`), but it means **the fallback literal in the SETTINGS block must be updated in lockstep with `DEFAULTS`** — two edit sites per value, not one.

---

## Summary

- **Good news — most requested values are ALREADY the default.** Of the 18 requested settings, **11 already match** today's `DEFAULTS`: `pixelRatio 0.5`, `volumetricScale 0.25`, `causticScale 0.25`, `renderDistance 8`, `preGenRenderDistance 16`, `useWorkers true`, `useWorkersForMesh true`, `AO true`, `smoothLighting true`, `textureResolution 16`, `antialiasing true`. No code change needed for those — this CCR just confirms and locks them.
- **9 areas require code changes** (5 simple value edits + 2 auto-detect mechanisms + maxed-quality bumps + a version-reset):
  1. **Worker pool auto-size** → `floor(cores × 0.75)`, capped at **`cores − 1`** (D-2), with a **dynamic slider max**.
  2. **`refractionScale`** `0.5 → 0.25`.
  3. **`lowerBoundFPS`** `30 → 25`.
  4. **`upperBoundFPS`** `50 → 60`.
  5. **`buildQueueLimit`** `2 → 6`.
  6. **`maxCachedChunks`** `350 → 500`.
  7. **`memoryBudgetMB`** → new **"auto"** mode that detects RAM (`navigator.deviceMemory`) and allots 75% (D-3).
  8. **"Maxed" quality knobs** (D-1): `volumetricSamples 8→16`, `skyQuality 'medium'→'high'`, `cloudDensity 1.0→2.0`, star counts `400/200/100→700/350/180`. (`giSamples` held at 8.)
  9. **Settings version reset** (D-4): new `SETTINGS_VERSION` constant; on load, a saved-settings version mismatch **wipes the device's saved settings and reverts to these defaults**.
- **"Everything on" is already true:** `DEFAULTS` already *enables* every feature (GI, volumetric, refraction, shadows, stars, clouds, color grading, biome fog, all water FX). Change 8 turns the per-effect *quality* up to max while keeping the low resolution scales.

---

## Part A — Requested settings: current vs proposed (the full table)

| # | Setting (key) | Requested | Current `DEFAULTS` | Match? | Action |
|---|---|---|---|---|---|
| 1 | Worker pool size (`workerPoolSize` / auto formula) | Auto = 75% cores, floor (14c→10) | `0` (auto = `min(8, cores−1)`) | ❌ | **Change 1** — new formula + raise cap |
| 2 | Terrain workers (`useWorkers`) | On | `true` | ✅ | none |
| 3 | Mesh workers (`useWorkersForMesh`) | On | `true` | ✅ | none |
| 4 | Pixel ratio (`pixelRatio`) | 0.5 | `0.5` | ✅ | none (lock) |
| 5 | Volumetric resolution (`volumetricScale`) | 0.25 | `0.25` | ✅ | none (lock) |
| 6 | Underwater caustic resolution (`causticScale`) | 0.25 | `0.25` | ✅ | none (lock) |
| 7 | Refraction resolution (`refractionScale`) | 0.25 | `0.5` | ❌ | **Change 2** |
| 8 | Render distance (`renderDistance`) | 8 | `8` | ✅ | none (lock) |
| 9 | Min FPS (`lowerBoundFPS`) | 25 | `30` | ❌ | **Change 3** |
| 10 | Max FPS (`upperBoundFPS`) | 60 | `50` | ❌ | **Change 4** |
| 11 | Build queue (`buildQueueLimit`) | 6 | `2` | ❌ | **Change 5** |
| 12 | Pregen distance (`preGenRenderDistance`) | 16 | `16` | ✅ | none (lock) |
| 13 | Max caches (`maxCachedChunks`) | 500 | `350` | ❌ | **Change 6** |
| 14 | Memory budget (`memoryBudgetMB`) | Auto = 75% of RAM | `2048` | ❌ | **Change 7** — new auto mode |
| 15 | Ambient occlusion (`AO`) | On | `true` | ✅ | none (lock) |
| 16 | Smooth lighting (`smoothLighting`) | On | `true` | ✅ | none (lock) |
| 17 | Texture resolution (`textureResolution`) | 16 | `16` | ✅ | none (lock) |
| 18 | Antialiasing (`antialiasing`) | On | `true` | ✅ | none (lock) |
| — | "All fancy features on" | On | already all `true` in `DEFAULTS` | ✅ | confirmed (see Part C) |
| 19 | `volumetricSamples` | Max | `8` | ❌ | **Change 8** (D-1) → 16 |
| 20 | `skyQuality` | Max | `'medium'` | ❌ | **Change 8** (D-1) → `'high'` |
| 21 | `cloudDensity` | Max | `1.0` | ❌ | **Change 8** (D-1) → 2.0 |
| 22 | `starLayer1/2/3Count` | Max | `400/200/100` | ❌ | **Change 8** (D-1) → 700/350/180 |
| 23 | `giSamples` | (held) | `8` | ✅ | held at 8 per recommendation |
| 24 | Settings version reset | force-revert on mismatch | none | ❌ | **Change 9** (D-4) |

---

## Part B — Per-change detail (sites, current, proposed, impact)

> Each value lives in **two** places that must stay in sync: the `SETTINGS` resolution block (~5920–6022) and the `DEFAULTS` object (6184+). Edit both.

### Change 1 — Worker pool auto-size = 75% of cores, cap raised

**Why:** Request is explicit — "use 75% of available cores rounded down; 14 cores → 10 workers." Today's auto formula is `min(8, cores−1)`, which (a) uses the wrong ratio and (b) caps at 8, so a 14-core box gets 8, not 10.

**Decision D-2 (resolved):** cap = **`cores − 1`** (not a fixed 16). Note `floor(cores × 0.75) ≤ cores − 1` for all `cores ≥ 2`, so the cap never alters the *auto* value — it only clamps a **manual override** and sets the **slider's max**.

**1a — Auto formula. Site: line 19185.**

```js
// CURRENT
this.poolSize = (poolSize && poolSize > 0) ? Math.min(8, Math.max(1, poolSize)) : Math.min(8, Math.max(1, cores - 1));

// PROPOSED
const maxWorkers = Math.max(1, cores - 1);                 // D-2: ceiling = cores - 1
const autoSize   = Math.max(1, Math.floor(cores * 0.75));  // 75% of cores, rounded down
this.poolSize = (poolSize && poolSize > 0)
    ? Math.min(maxWorkers, Math.max(1, poolSize))          // manual override, clamped to cores-1
    : Math.min(maxWorkers, autoSize);                      // auto (autoSize already <= maxWorkers)
```

Resulting auto sizes: 2c→1, 4c→3, 8c→6, 12c→9, **14c→10 ✓**, 16c→12, 24c→18.

**1b — Doc comment. Site: lines 19172 & 19176–19184.** Update the JSDoc `@param` ("max 8") and the inline comment block to describe the 75%/cap-`(cores−1)` rule. (Documentation only; no behavior.)

**1c — UI: dynamic slider max + corrected hint. Sites: line 2593 (slider), line 2595 (hint), and the settings-init sync (~line 22497–22502).**

The slider `max` can no longer be a static literal — it must equal `cores − 1`, set at runtime. Set it where the worker-pool slider is first synced:

```js
// in the settings-init / syncSettingsToUI worker-pool block (~22497):
const _cores = navigator.hardwareConcurrency || 4;
workerPoolSizeSlider.max = Math.max(1, _cores - 1);   // D-2 dynamic ceiling
```

```html
<!-- CURRENT (2593) -->
<input type="range" id="worker-pool-size-slider" min="0" max="8" step="1" />
<!-- PROPOSED — keep a sane static fallback; JS overwrites max at runtime -->
<input type="range" id="worker-pool-size-slider" min="0" max="32" step="1" />

<!-- CURRENT hint (2595) -->
<p id="worker-pool-hint" ...>0 = Auto (CPU cores - 1, max 4). ...</p>
<!-- PROPOSED -->
<p id="worker-pool-hint" ...>0 = Auto (75% of CPU cores, rounded down). Manual max = CPU cores − 1. Higher values may improve chunk loading but use more resources.</p>
```

> The static `max="32"` is just a pre-JS fallback so the slider isn't pinned to 8 before init runs; the runtime line clamps it to `cores − 1`. The hint's old "max 4" was already stale (cap was 8) — this fixes it.

**Impact:** The pool does **double duty** (terrain gen + meshing), and `baseCap = max(buildQueueLimit, poolSize)` plus the per-frame dispatch `baseCap*2` both scale off `poolSize` — so a bigger pool widens the *entire* gen+mesh pipeline (the documented intent behind the earlier 4→8 raise, line 3946). The apply-drain budget self-tunes. Worker count only re-reads on pool construction → the existing "Worker changes take effect on next world load" notice (line 2596) still applies. **Low-core machines unchanged** (auto already ≤ cores−1); the `cores−1` ceiling guarantees at least one core stays free for the main thread (render + apply-drain + audio) even at manual max.

---

### Change 2 — `refractionScale` 0.5 → 0.25

**Sites:** SETTINGS block **line 6022**, `DEFAULTS` **line 6283**.

```js
// CURRENT (6283)            refractionScale: 0.5,
// PROPOSED                  refractionScale: 0.25,
// CURRENT (6022)  refractionScale: savedSettings.refractionScale !== undefined ? savedSettings.refractionScale : 0.5,
// PROPOSED        refractionScale: savedSettings.refractionScale !== undefined ? savedSettings.refractionScale : 0.25,
```

**Also (cosmetic, recommended): UI initial display, line 2543–2544** — the static HTML hard-codes `0.5` in both the value span and `value="0.5"`. `syncSettingsToUI` overwrites it at runtime, but updating the literals to `0.25` keeps the pre-sync paint correct:

```html
<span id="refraction-scale-val">0.25</span>  ...  value="0.25"
```

**Impact:** Refraction RT is captured at `pixelRatio × refractionScale` of canvas size. Going 0.5→0.25 quarters that target's pixel count → **lower water/glass refraction sharpness, meaningfully cheaper**. Consistent with the "lowest resolution across the board" intent (now matches `volumetricScale`/`causticScale`). Refraction *feature* stays on; only its internal resolution drops. Slider min is already 0.25, so the new default sits at the slider floor.

---

### Change 3 — `lowerBoundFPS` 30 → 25

**Sites:** SETTINGS **line 5949**, `DEFAULTS` **line 6213**.

```js
// CURRENT  lowerBoundFPS: 30   /  savedSettings.lowerBoundFPS || 30
// PROPOSED lowerBoundFPS: 25   /  savedSettings.lowerBoundFPS || 25
```

**Impact:** This is the lower trigger for `dynamicRenderDistance` (auto render-distance scaling). A lower floor means the game tolerates dipping to 25 fps before shrinking render distance → **more world visible on weaker hardware before it claws back**. Note `dynamicRenderDistance` is `false` in `DEFAULTS` (line 6212) but `true` in the balanced/performance *profiles*; the bound only bites when dynamic scaling is on. Pairs with Change 4.

---

### Change 4 — `upperBoundFPS` 50 → 60

**Sites:** SETTINGS **line 5950**, `DEFAULTS` **line 6214**.

```js
// CURRENT  upperBoundFPS: 50   /  savedSettings.upperBoundFPS || 50
// PROPOSED upperBoundFPS: 60   /  savedSettings.upperBoundFPS || 60
```

**Impact:** Upper trigger for dynamic render-distance *growth* — the game must sustain 60 fps (was 50) before expanding render distance. Slightly more conservative about growing distance, which suits the "stay smooth at low res" goal. With the 60 fps target matching `FRAME_BUDGET_MS` (16.67 ms), the band becomes 25–60.

---

### Change 5 — `buildQueueLimit` 2 → 6

**Sites:** SETTINGS **line 5923**, `DEFAULTS` **line 6187**.

```js
// CURRENT  buildQueueLimit: 2  /  savedSettings.buildQueueLimit || 2
// PROPOSED buildQueueLimit: 6  /  savedSettings.buildQueueLimit || 6
```

**Impact:** Max chunk meshes built per drain cycle. `baseCap = max(buildQueueLimit, poolSize)` and worker-mesh dispatch (`baseCap*2`) scale off it → **faster terrain pop-in / streaming**, at the cost of bigger per-frame work spikes during heavy streaming. This is well-matched to the wider worker pool from Change 1 (more workers feeding a deeper queue). Watch for frame hitches on low-end during initial load; the frame-budget yield system (`shouldYield`/`checkFrameBudget`) bounds it.

---

### Change 6 — `maxCachedChunks` 350 → 500

**Sites:** SETTINGS **line 5924**, `DEFAULTS` **line 6188**.

```js
// CURRENT  maxCachedChunks: 350  /  savedSettings.maxCachedChunks || 350
// PROPOSED maxCachedChunks: 500  /  savedSettings.maxCachedChunks || 500
```

**Impact:** More resident chunk meshes before eviction → **less re-meshing when backtracking**, smoother revisits, at higher steady-state memory. Matches the `quality` profile's 500. Plays into the memory-budget auto-detection (Change 7): on a low-RAM machine, 500 cached chunks may be the thing that nudges the budget — but auto-scaling is **off by default** (`enableAutoMemoryScaling: false`, line 6197), so 500 is a hard resident count regardless of budget unless the user enables scaling.

---

### Change 7 — `memoryBudgetMB` → "auto" (detect RAM, allot 75%)

**Why:** Request — "Can we make this detect the amount of memory available and allot 75%, then the default would be auto like the worker count is."

**Design:** Mirror the worker-pool pattern: a **`0` sentinel = auto**, resolved by a helper at startup. See **Decision D-3** for the detection-source trade-off (this CCR recommends `navigator.deviceMemory`).

**7a — New helper (place near `MemoryBudgetManager`, ~line 20170).**

```js
/**
 * Resolve the auto memory budget: 75% of detected device RAM, in MB.
 * Falls back to a safe 2048 MB when the browser hides RAM size.
 * @returns {number} Budget in MB.
 */
function resolveAutoMemoryBudgetMB() {
    // navigator.deviceMemory is GB, coarse (0.25/0.5/1/2/4/8) and CAPPED AT 8 for privacy.
    // Chromium/Edge only; undefined on Firefox/Safari -> fallback.
    const gb = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : 0;
    if (!gb) return 2048; // unchanged from today's default when undetectable
    const mb = Math.round(gb * 1024 * 0.75);
    return Math.max(1024, Math.min(8192, mb)); // floor 1GB, ceiling 8GB (matches deviceMemory cap)
}
```

**7b — Make the sentinel the default. Sites:** SETTINGS **line 5930**, `DEFAULTS` **line 6194**.

```js
// CURRENT  memoryBudgetMB: 2048   /  savedSettings.memoryBudgetMB ?? 2048
// PROPOSED memoryBudgetMB: 0      /  savedSettings.memoryBudgetMB ?? 0   // 0 = auto (75% of device RAM)
```

**7c — Resolve at consumption. Site: line 20176.**

```js
// CURRENT
this.budgetMB = SETTINGS.memoryBudgetMB || 1024;

// PROPOSED
this.budgetMB = (SETTINGS.memoryBudgetMB && SETTINGS.memoryBudgetMB > 0)
    ? SETTINGS.memoryBudgetMB
    : resolveAutoMemoryBudgetMB();
```

> ⚠️ Do **not** leave a bare `|| 1024` anywhere that reads `memoryBudgetMB`, or the `0` sentinel collapses to 1024. Grep all reads (lines 20176, 28587, and the slider sync sites 22490, 28199, 28441).

**7d — Reset-to-default path. Sites: lines 28585–28587.**

```js
// CURRENT
SETTINGS.memoryBudgetMB = DEFAULTS.memoryBudgetMB;        // now 0
if (memoryBudgetManager) memoryBudgetManager.setBudget(DEFAULTS.memoryBudgetMB);  // setBudget(0) -> bad

// PROPOSED
SETTINGS.memoryBudgetMB = DEFAULTS.memoryBudgetMB;        // 0 = auto
if (memoryBudgetManager) memoryBudgetManager.setBudget(resolveAutoMemoryBudgetMB());
```

(`setBudget` writes both `this.budgetMB` and `SETTINGS.memoryBudgetMB`, line 20506 — passing the resolved number keeps the live manager correct while `SETTINGS` stays at the `0` sentinel for persistence. If you prefer `SETTINGS.memoryBudgetMB` to also reflect `0`, adjust `setBudget` to not overwrite it on auto.)

**7e — UI: show "Auto (N MB)". Sites: label span line 2565, sync sites 22490/28199/28441, slider value 2566.** Mirror the worker-pool label pattern:

```js
// where the slider/label currently sync:
const isAuto = !(SETTINGS.memoryBudgetMB > 0);
memoryBudgetVal.textContent = isAuto ? `Auto (${resolveAutoMemoryBudgetMB()})` : SETTINGS.memoryBudgetMB;
memoryBudgetSlider.value = isAuto ? resolveAutoMemoryBudgetMB() : SETTINGS.memoryBudgetMB;
```

> The input handler at line 23016–23021 sets `SETTINGS.memoryBudgetMB = parseInt(value)` on drag — i.e., **any manual drag leaves auto mode**, which is the desired behavior (same as worker pool). To let users *return* to auto, consider an "Auto" checkbox or a slider position 0 — see **Decision D-3**.

**Impact:** On a detectable Chromium machine with ≥8 GB RAM, auto resolves to **6144 MB** (8 × 0.75 × 1024, since `deviceMemory` caps at 8). 4 GB → 3072 MB. Undetectable browsers (Firefox/Safari) keep today's effective 2048. Because `enableAutoMemoryScaling` is **off by default**, the budget is mostly **informational** (perf overlay) today — it only triggers render-distance auto-reduction when the user turns scaling on. So this change is low-risk now but makes the budget *correct* if/when scaling is enabled.

**Return-to-auto (D-3 resolved):** keep it simple — manual drag leaves auto; **reset-to-default returns to auto** (Change 7d). No separate "Auto" checkbox this pass.

---

### Change 8 — "Maxed" quality knobs (D-1 resolved)

**Why:** "All quality settings enabled and **maxed**." Resolution scales stay at their floor (0.25/0.5), but the per-effect *quality* dials rise to the `quality`-profile / slider-max tier. Cheap knobs go to max; `giSamples` stays at 8 (GI cost) and `volumetricSamples` goes to 16 (the low 0.25 volumetric scale pays for the extra samples). Your explicit numbers — render distance 8, texture res 16, the .25/.5 scales — are **unchanged**.

Each key has **two** sites: the SETTINGS fallback (the literal that actually applies after a version reset, since `savedSettings` is empty) **and** the `DEFAULTS` object (used by reset-to-default). Edit both.

| Key | SETTINGS fallback site | `DEFAULTS` site | Current | Proposed |
|---|---|---|---|---|
| `volumetricSamples` | ~6061 | 6321 | 8 | **16** |
| `skyQuality` | ~6085 | 6344 | `'medium'` | **`'high'`** |
| `cloudDensity` | ~6153 | 6406 | 1.0 | **2.0** |
| `starLayer1Count` | ~6131 | 6389 | 400 | **700** |
| `starLayer2Count` | ~6138 | 6395 | 200 | **350** |
| `starLayer3Count` | ~6145 | 6401 | 100 | **180** |
| `giSamples` | ~6070 | 6330 | 8 | 8 (unchanged) |

> The SETTINGS-block guards stay as-is, only the trailing literal changes, e.g.
> `skyQuality: ['low','medium','high'].includes(savedSettings.skyQuality) ? savedSettings.skyQuality : 'high',`
> and `cloudDensity: (savedSettings.cloudDensity !== undefined && savedSettings.cloudDensity <= 5) ? savedSettings.cloudDensity : 2.0,`.

**Impact:** `volumetricSamples 8→16` is the only meaningful cost (2× god-ray ray-march), partly offset by the 0.25 volumetric scale. `cloudDensity 2.0` doubles cloud particles (`CLOUD_BASE_COUNT × density`); `skyQuality 'high'` and the star-count bumps are cheap. This is the intended "looks rich at low res" trade. **Tension with the "runs on any device" priority is acknowledged** — if FPS suffers on low-end, the Performance profile still exists as the user's escape hatch (it sets `volumetricSamples 4`, `skyQuality 'low'`, etc.).

---

### Change 9 — Settings version: force-revert devices to new defaults (D-4 resolved)

**Why:** "When the game loads on a device, check the saved settings; if the version number doesn't match, overwrite and revert to the default." This guarantees every existing player picks up the new baseline exactly once, and is the clean way to push future default changes.

**Mechanism:** A manually-bumped `SETTINGS_VERSION` integer (separate from `VOXEX_BUILD`, which changes every deploy — we do **not** want to wipe settings on every deploy, only when defaults change). It's persisted inside `voxex_settings`. On load, a mismatch (including the *absence* of the field on pre-versioning saves) empties `savedSettings`, so every key falls through to its in-line default, and a stale active profile is cleared so it can't re-impose old values.

**9a — Define the constant** (near `VOXEX_BUILD`, ~line 3933):

```js
const SETTINGS_VERSION = 2; // bump ONLY when DEFAULTS change, to force all devices back to defaults
```

**9b — Version gate at load. Site: line 5916** (change `const` → `let` so it can be reassigned):

```js
// CURRENT
const savedSettings = JSON.parse(localStorage.getItem("voxex_settings")) || {};

// PROPOSED
let savedSettings = JSON.parse(localStorage.getItem("voxex_settings")) || {};
if (savedSettings.settingsVersion !== SETTINGS_VERSION) {
    // Defaults changed (or first run / pre-versioning save) -> revert this device to defaults.
    savedSettings = {};                                  // every key now falls through to its default
    localStorage.removeItem("voxex_active_profile");     // don't let a stale profile re-impose old values
    localStorage.setItem("voxex_settings", JSON.stringify({ settingsVersion: SETTINGS_VERSION }));
    console.info("[Settings] Version mismatch — reverted to defaults (v" + SETTINGS_VERSION + ")");
}
```

**9c — Carry the version in `SETTINGS`** so full saves keep it. Add one line inside the `SETTINGS` object (anywhere, e.g. right after `renderDistance`):

```js
settingsVersion: SETTINGS_VERSION,
```

`saveSettings()` (line 22394) serializes the whole `SETTINGS` object, so the version persists automatically; the reset-to-default buttons don't touch `settingsVersion`, so it survives those too.

**Impact / ordering:**
- The gate runs at **5916**, *before* `activeProfileName` is read at **6538** — so clearing `voxex_active_profile` lands the device on `DEFAULTS` (no profile) as intended.
- After a reset, the **SETTINGS-block fallback literals** are what apply (because `savedSettings` is empty) — this is exactly why Changes 1–8 must edit those fallbacks, not just the `DEFAULTS` object.
- World saves (`voxex_save_*`) and the custom profile (`voxex_custom_profile`) are **untouched** — only device *settings* and the active-profile pointer reset. Saved worlds, seeds, and inventories are safe.
- One-time only: after the revert writes `{settingsVersion: 2}`, the next load matches and behaves normally. Bumping to `3` later repeats the one-time revert.
- **For this rollout, set `SETTINGS_VERSION = 2`** (current saves are unversioned → treated as mismatch → everyone reverts once to the new defaults).

---

## Part C — "All fancy features ON" — confirmation (no change needed)

`DEFAULTS` already enables every feature the request implies. Verified `true`/on in `DEFAULTS`:

`shadows`, `AO`, `smoothLighting`, `greedyMeshingEnabled`, `bandedMeshing`, `enableFrustumCulling`, `enableSectionLOD`, `volumetricLightingEnabled`, `giEnabled`, `diffuseEnabled`, `specularEnabled`, `waterRefractionEnabled`, `glassRefractionEnabled`, `particlesEnabled`, `starsEnabled`, `cloudsEnabled`, `waterRipplesEnabled`, `waterSplashParticlesEnabled`, `waterWadingRipplesEnabled`, `waterWakeEnabled`, `waterBubblesEnabled`, `colorGradingEnabled`, `biomeFogEnabled`, `torchParticlesEnabled`, `blockBreakEnabled`, `footstepEnabled`, `zombieVignetteEnabled`, `zombieDesaturationEnabled`.

So a **fresh install already shows everything on**. The only place a fancy feature is *off* by default is inside the **`balanced` profile** (`giEnabled: false`, line 6483) — which only matters if the user picks that profile. See **Decision D-4**.

---

## Part D — Decisions (RESOLVED 2026-06-21)

### D-1 — "Maxed" effect-quality knobs → **adopt the recommendation** ✅
Bump `volumetricSamples 8→16`, `skyQuality 'medium'→'high'`, `cloudDensity 1.0→2.0`, star counts `400/200/100→700/350/180`; hold `giSamples` at 8. Explicit numbers (render distance 8, texture res 16, .25/.5 scales) unchanged. → **Change 8.**

### D-2 — Worker cap → **`cores − 1`** ✅
Ceiling is the number of cores available minus one (keeps a core free for the main thread). Auto = `floor(cores × 0.75)`, which is always ≤ `cores − 1`, so the cap only clamps manual overrides and sets the slider's max (now dynamic). → **Change 1.**

### D-3 — Memory detection → **recommended path** ✅
Use `navigator.deviceMemory × 0.75` (MB), floor 1024 / ceiling 8192, **2048 fallback** when undetectable (Firefox/Safari). Accept the 8 GB `deviceMemory` privacy cap. Manual drag leaves auto; **reset-to-default returns to auto** (no separate Auto checkbox this pass). → **Change 7.**

### D-4 — Force-revert via settings version → **implement** ✅
Add `SETTINGS_VERSION`; on load, a version mismatch wipes the device's saved settings and the active-profile pointer, reverting to these defaults exactly once. Set `SETTINGS_VERSION = 2` for this rollout. Profiles themselves are left as-is (the version reset clears the *active* profile pointer, so a fresh device lands on `DEFAULTS`; the balanced profile's `giEnabled:false` only matters if the user re-selects Balanced afterward — out of scope here). → **Change 9.**

---

## Part E — Safety checks (to perform when code is applied)

- [ ] Each changed value edited in **both** the `SETTINGS` resolution block (~5920–6022) **and** `DEFAULTS` (6184+) — no drift.
- [ ] No duplicate/shadowed identifiers introduced (`resolveAutoMemoryBudgetMB`, `AUTO_WORKER_CAP` are new — grep first).
- [ ] No bare `|| 1024` / `|| 2048` left on any `memoryBudgetMB` read (the `0` sentinel must survive; grep lines 20176, 28587, 22490, 28199, 28441, 23016).
- [ ] Worker slider `max` set dynamically to `cores − 1` at init; static fallback raised off 8; hint text corrected (no more "max 4").
- [ ] Memory-budget reset path resolves auto instead of calling `setBudget(0)`.
- [ ] UI sync shows `"Auto (N)"` for the `0` sentinel on both worker pool and memory budget; manual drag leaves auto as intended.
- [ ] Change 8 effect-quality knobs edited in **both** the SETTINGS fallback literal **and** `DEFAULTS` (after a version reset, the SETTINGS fallback is what actually applies).
- [ ] `savedSettings` changed `const`→`let` (Change 9b); `settingsVersion` added to the `SETTINGS` object (9c) so it persists; `SETTINGS_VERSION` defined once (9a) and not shadowed.
- [ ] Version gate runs **before** `activeProfileName` is read (5916 < 6538) and clears `voxex_active_profile`; verify world saves (`voxex_save_*`) and `voxex_custom_profile` are untouched.
- [ ] `SETTINGS_VERSION = 2` for this rollout; confirm a pre-existing `voxex_settings` (no version field) triggers exactly one revert, then loads normally on the second refresh.
- [ ] No new work added to the per-frame render loop (these are all init/config-time reads).
- [ ] `VOXEX_BUILD` (line 3933) bumped and a one-line entry added to `VOXEX_RECENT_CHANGES` (line 3934). (Distinct from `SETTINGS_VERSION` — build bumps every deploy, version only when defaults change.)
- [ ] Round-trip: change → `saveSettings()` → reload → values persist; reset-to-default returns to the new defaults (incl. auto sentinels).
- [ ] Sanity-check auto worker count by logging on 2/4/8/14-core (the `[WorkerPool] Initialized with N workers` line at 19194 already prints it).
- [ ] Run `tools/voxex-tests.html` (~204 tests) over localhost — no regressions from the settings-load/version changes.

---

## Appendix — exact edit site index

| Change | Site(s) | Symbol to search |
|---|---|---|
| 1a auto formula | 19185 | `this.poolSize = (poolSize && poolSize > 0)` |
| 1b doc | 19172, 19176 | `Create a worker pool` |
| 1c UI (slider + dynamic max + hint) | 2593, 2595, ~22497 | `worker-pool-size-slider`, `worker-pool-hint` |
| 2 refractionScale | 6283, 6022, (2543–2544) | `refractionScale:` |
| 3 lowerBoundFPS | 6213, 5949 | `lowerBoundFPS` |
| 4 upperBoundFPS | 6214, 5950 | `upperBoundFPS` |
| 5 buildQueueLimit | 6187, 5923 | `buildQueueLimit` |
| 6 maxCachedChunks | 6188, 5924 | `maxCachedChunks` |
| 7a helper | ~20170 | `class MemoryBudgetManager` |
| 7b sentinel | 6194, 5930 | `memoryBudgetMB` |
| 7c resolve | 20176 | `this.budgetMB = SETTINGS.memoryBudgetMB` |
| 7d reset | 28585–28587 | `setBudget(DEFAULTS.memoryBudgetMB)` |
| 7e UI | 2565–2566, 22490, 28199, 28441 | `memory-budget-slider` / `memory-budget-val` |
| 8 maxed knobs | SETTINGS ~6061/6070/6085/6131/6138/6145/6153; DEFAULTS 6321/6344/6389/6395/6401/6406 | `volumetricSamples`, `skyQuality`, `cloudDensity`, `starLayer*Count` |
| 9a version const | ~3933 | `SETTINGS_VERSION` |
| 9b load gate | 5916 | `const savedSettings = JSON.parse` → `let` |
| 9c carry in SETTINGS | ~5920 | `settingsVersion: SETTINGS_VERSION` |
| build banner | 3933–3934 | `VOXEX_BUILD` |

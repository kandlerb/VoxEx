# CCR — Chunk Memory Cap Doesn't Scale to Render Distance

**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-23
**Status:** Symptom B-1 (camera far plane, render-distance **and altitude** aware) **implemented** in build `2026-06-23.30`. Symptom A (cache cap) and Symptom B-2 (emergency-unload hardening) remain proposal-only.
**Scope:** Make the chunk-hold limit cover the full set of chunks a render distance puts in view, and stop in-view chunks from being evicted when the whole disc is meshed at once (looking down from altitude). Two related symptoms:

- **Symptom A (settings mismatch):** at render distance 32 the view contains ~3,200 chunks but the **Max Cached Chunks** control tops out at **1,000** (default 500), so the user-facing memory cap is well below what the render distance demands.
- **Symptom B (shrinking disc when flying up):** the rendered disc *shrinks the higher you fly*. **This is a camera-frustum clipping issue, not a memory, eviction, or save issue** — the chunks are meshed and in memory the whole time. The camera's **far clip plane is hard-coded to 800** (line **27623**) and never scales with render distance or altitude, so once you climb high enough the far plane cuts through the terrain disc and trims it from the outside in. (Confirmed against the user's config: Auto Memory Scaling is **off**, so the eviction path below is not the cause here — it's documented as a secondary hardening item.)

---

## Summary

- **Observed:** Render distance 32 puts **~3,209 chunks** in view (an exact lattice count for a disc of radius 32; π·32² ≈ 3,217). The **Max Cached Chunks** slider only allows **100–1,000** (default 500, profiles 200/350/500). The user-facing "how many chunks can be held" number can't even be *set* high enough to cover the view.
- **Root cause #1 — wrong geometry in the auto-derived ceiling.** The real mesh ceiling is `maxAllowedMeshes = Math.max(SETTINGS.maxCachedChunks, currentRenderRadius² × 2)` (line **42457**). The in-view region is a **disc** (area ≈ π·R² ≈ **3.14·R²**), but the formula uses **2·R²**. At R=32 that's **2,048** — about **36% short** of the 3,209 chunks actually in range. The factor is wrong at *every* render distance (e.g. R=16 → formula 512 vs disc 797).
- **Root cause #2 — the setting is mislabeled / effectively inert.** `maxCachedChunks` is presented as "Max Cached Chunks" (a hard count of chunks held) but its *only* use in the engine is as a floor inside that `maxAllowedMeshes` formula. It does **not** cap chunk **data** (that's `maxChunkDataMemoryMB`), and the proactive mesh-prune that consumes it (block **42456–42489**) is defensively filtered to **out-of-range chunks only** (`!chunksInRange.has(baseKey)`, line **42468**) — so in-view chunks are never pruned by it regardless of the cap. The control therefore both **misleads** (its name/range imply a 1,000-chunk ceiling) and **under-serves** (it doesn't actually govern the in-view set).
- **Root cause #3 — `dataKeepDistance` is not pinned to render distance.** Chunk *data* eviction only ever targets chunks **outside** `dataKeepDistance` (default 48; lines **8193–8205**). That's fine while RD ≤ 48, but it's a static default, not derived from `currentRenderRadius`. If a user lowers it below the render distance, in-view chunk data becomes an eviction candidate. There is no guard tying it to the active render radius.
- **Symptom B root cause — the camera far plane doesn't scale.** The camera is built once as `new THREE.PerspectiveCamera(fov, aspect, 0.01, 800)` (line **27623**); `far = 800` is never updated. Render distance 32 is a 512-block disc, faded by **cylindrical** fog (XZ-only) to ~480 blocks. From altitude *H*, the deepest the camera can see straight down is `sqrt(800² − H²)`. That stays above the ~480 fog radius until **H ≈ 640 blocks**, beyond which the far plane clips *inside* the fog and the visible circle shrinks; at **H ≥ 800** you see nothing directly below. Because fog is cylindrical it does not hide the cut (height doesn't add fog), so the clipped edge is a hard, shrinking boundary — exactly "the more I climb to see, the smaller the circle gets." The chunks are still meshed and resident; only the draw is clipped.
- **Symptom B secondary (only if Auto Memory Scaling is on) — emergency unload eats the visible disc.** Looking straight down sets `hasHorizontalCameraDir = false`, so `isChunkInFrustum` returns `true` for every in-range chunk (line **42341**) and the whole disc meshes at once; `renderer.info.memory.geometries` climbs and the crude estimate `count × ~1.09 MB` (lines **20524–20528**) can trip `MemoryBudgetManager`. `_emergencyChunkUnload()` (lines **20651–20695**) then frees up to **20% of meshes beyond `0.75 × renderDistance`** (the outer quarter of the in-view disc), Chebyshev-keyed off the static `SETTINGS.renderDistance`. **Gated by `enableAutoMemoryScaling`, which the user has off**, so it is not the active cause — but it's a latent in-view-eviction bug worth fixing so the feature is safe to enable.
- **Recommended fix — Symptom A (3 small, localized edits):**
  1. Replace the `2·R²` term with the actual in-view disc count plus headroom (`⌈π·R²·1.15⌉`, or the safe square superset `(2R+1)²`) so the auto-ceiling always covers the view.
  2. Re-scope the **Max Cached Chunks** control as an **optional manual override** (0 = Auto, tracks render distance) and raise its ceiling to ~5,000 so a manual value can actually represent a high-RD view. Re-label to "Max Cached Chunk Meshes (0 = Auto)".
  3. Clamp the effective data-keep radius to `Math.max(dataKeepDistance, currentRenderRadius + 2)` so in-view chunk data is never an eviction candidate.
- **Recommended fix — Symptom B (primary):**
  4. **Scale the camera far plane with render distance AND altitude.** A render-distance-only far plane still clips once you climb past it, because looking straight down the distance to the ground ≈ camera altitude. Recompute `camera.far` **every frame** in `renderFrame()` as `max(renderRadius×chunkSize×2 + 256, cameraWorldY + renderRadius×chunkSize + 256)`, using the camera's **world** position (`camera.position` is local under the rig). Gate the `updateProjectionMatrix()` call on a >16-block change to avoid churn. (Doing it in `updateChunks` fails — that function early-exits during pure vertical flight.) `uCamFar` self-syncs from `camera.far` in the water render path; nudge `near` 0.01 → 0.05 to offset the larger depth range.
- **Recommended fix — Symptom B (secondary hardening, for when scaling is on):**
  5. Make the emergency unload **view-aware**: only release chunks genuinely outside the live `currentRenderRadius` (not `0.75 × SETTINGS.renderDistance`), using the same Euclidean disc the loader uses — so it can never shrink the visible disc.
  6. Use the geometry pool's real tiered byte total (`geometryPool.getMemoryUsageMB().total`) for the GPU-geometry term instead of `count × flat-avg`, so a fully-meshed disc doesn't trip a false `CRITICAL`.

---

## Reproduction

1. Settings → Performance → turn **Dynamic Render Distance** off (dynamic auto-scaling caps at `maxRenderDistance: 16`, line **5979**, so the 3,000-chunk case requires the static slider).
2. Set **Render Distance** to **32** (slider max is 32; line **2527**).
3. Open Performance → Streaming. **Max Cached Chunks** maxes at **1,000** (line **2573**) — visibly far below the ~3,200 chunks the world is streaming in.

---

## Context map (verified)

| Knob | Where defined | Range / default | What it *actually* controls |
|---|---|---|---|
| Render Distance | slider line **2527**; `SETTINGS.renderDistance` line **5977** | 2–32, default 8 | Radius (chunks) of the in-view disc |
| `maxRenderDistance` | line **5979** | 16 | Cap for **dynamic** auto-scaling only (static slider still reaches 32) |
| **Max Cached Chunks** | slider line **2573**; `SETTINGS.maxCachedChunks` line **5981**; `DEFAULTS` line **6243** | **100–1,000**, default 500 | **Only** a floor in the `maxAllowedMeshes` formula (line 42457) |
| `maxAllowedMeshes` | line **42457** | `max(maxCachedChunks, R²·2)` | Threshold that triggers the proactive mesh-prune |
| Proactive mesh-prune (6A) | lines **42456–42489** | removes 30% of excess | Prunes **out-of-range** chunks only (line 42468) |
| `dataKeepDistance` | `SETTINGS` line **5983**; `DEFAULTS` line **6245** | default 48 | Chunk **data** kept within this radius; eviction targets only chunks *beyond* it (lines 8193–8205) |
| `maxChunkDataMemoryMB` | `SETTINGS` line **5984**; `DEFAULTS` line **6246** | default 1024 | Byte budget for chunk **data**; eviction trigger (line 8233) |

---

## Root cause detail

### The numbers

A chunk's in-memory data is three `Uint8Array`s of `CHUNK_DATA_SIZE` (81,920 bytes each — `16×16×320`) plus ~100 bytes overhead (`estimateChunkSize`, lines **8163–8183**):

```
per chunk ≈ 81,920 × 3 + 100 = 245,860 bytes ≈ 240.1 KB
```

| Render distance R | In-view disc (exact lattice count) | `2·R²` (current formula) | `(2R+1)²` (safe square) | Disc data @ 240 KB |
|---:|---:|---:|---:|---:|
| 16 | 797 | 512 | 1,089 | ~187 MB |
| **32** | **3,209** | **2,048** | **4,225** | **~754 MB** |
| 37 | 4,293 | 2,738 | 5,625 | ~1,007 MB |
| 38 | 4,513 | 2,898 | 5,929 | ~1,058 MB |

Key takeaways:

- **`2·R²` is always below the disc** (by the constant factor 2 vs π ≈ 1.57). At R=32 the auto-ceiling is 2,048 vs the 3,209 chunks actually streamed — a **~36% shortfall**. Even at the dynamic cap R=16 it's 512 vs 797.
- The **Max Cached Chunks** slider's hard max of 1,000 can never represent a high-RD view; at R=32 the view alone is 3,209 chunks.
- The **data** budget (`maxChunkDataMemoryMB` = 1024 MB) holds **~4,367 chunks** uncompressed, so it comfortably covers the R=32 disc (~754 MB). The data budget is *not* the binding constraint at R=32 — it first becomes insufficient for the in-view disc around **R=38** (~4,513 chunks ≈ 1,058 MB). So the limit the user is hitting is the **mesh / setting** side, not the byte budget.

### Why this doesn't currently corrupt the view (but is still wrong)

The proactive prune (6A) pre-filters candidates to out-of-range chunks (line **42468**), and the secondary cleanup (6B, lines **42490–42496**) also deletes only chunks not in `chunksInRange`. So when `terrainMeshCount` (≈3,209 in-view) exceeds `maxAllowedMeshes` (2,048), there usually are **no in-view candidates to remove** — in-view meshes survive. That means:

- The **stated** purpose of `maxCachedChunks` ("limit chunks held") is not what the code does; it's an inert floor in a formula whose geometry is wrong.
- The auto-ceiling (2,048) under-reports the true in-view requirement (3,209). Anything that reasons off `maxAllowedMeshes` (e.g. the debug overlay's `expectedMax` near line **11704**, the BUILD_AHEAD comment at line **42375**) is reasoning off a number that's too small.
- The user's mental model — "I set render distance 32, so I need to hold ~3,200 chunks, but the setting says 1,000" — is correct and the UI actively contradicts the engine's real behavior.

### `dataKeepDistance` is a static default, not RD-derived

`getEvictionCandidates` (lines **8192–8205**) only proposes chunks with `distSq > dataKeepDistSq` for eviction. `dataKeepDistance` defaults to 48 and is never reconciled against `currentRenderRadius`. At RD ≤ 48 in-view data is safe by luck of the default; there is no guard that keeps it safe if the value is lowered or if render distance is raised relative to it.

---

## Proposed fix

> All edits stay inside `voxEx.html`. Three changes; none touch the per-frame hot path beyond the single arithmetic line that already runs there.

### 1. Correct the auto-derived ceiling (geometry fix) — line 42457

```js
// BEFORE
const maxAllowedMeshes = Math.max(SETTINGS.maxCachedChunks, currentRenderRadius * currentRenderRadius * 2);

// AFTER — cover the actual in-view disc (π·R²) plus 15% headroom for band/water/glass
// sub-meshes and transient out-of-range stragglers. maxCachedChunks becomes an
// optional manual floor (0 = Auto): only applied when the user sets it > 0.
const inViewDiscMeshes = Math.ceil(Math.PI * currentRenderRadius * currentRenderRadius * 1.15);
const manualFloor = SETTINGS.maxCachedChunks > 0 ? SETTINGS.maxCachedChunks : 0;
const maxAllowedMeshes = Math.max(manualFloor, inViewDiscMeshes);
```

At R=32 this yields `⌈π·1024·1.15⌉ = 3,699` (covers the 3,209 in-view chunks); at R=8 it yields 232; at R=16, 924.

### 2. Re-scope the user control to "Auto / manual override"

- **HTML, line 2572–2573** — relabel and widen the slider, allow 0 = Auto:

```html
<label for="max-chunks-slider">Max Cached Chunk Meshes: <span id="max-chunks-val">Auto</span></label>
<input type="range" id="max-chunks-slider" min="0" max="5000" step="50" />
```

- **`DEFAULTS` (line 6243) and `SETTINGS` init (line 5981):** change default from 500 → **0** (Auto). The auto-ceiling in change #1 now sizes itself from render distance.
- **Profiles (lines 6496 / 6527 / 6558):** set `maxCachedChunks: 0` for all three so Auto is the norm; users opt into a manual cap only to *constrain* memory on weak devices.
- **UI sync (lines 22761–22762, 28611, 28866) and the input listener (lines 23283–23287):** render `0` as the text "Auto" instead of the raw number, mirroring the Memory Budget slider's existing "Auto (N)" pattern (`syncMemoryBudgetUI`). The listener already writes `parseInt(...)`; just map 0 → "Auto" in the label.
- **Reset handler (line 29010):** already restores `DEFAULTS.maxCachedChunks`; no change needed once the default is 0.

> Round-trip: `maxCachedChunks` already loads via `savedSettings.maxCachedChunks || 500` (line 5981). Switching to Auto means `?? 0` semantics — change `|| 500` to `?? 0` so a saved 0 (Auto) survives reload instead of being coerced back to 500.

### 3. Pin the data-keep radius to render distance — `getEvictionCandidates`, line 8193

```js
// BEFORE
const dataKeepDist = this.settings.dataKeepDistance || 48;

// AFTER — never let in-view chunk data become an eviction candidate
const activeRadius = (typeof currentRenderRadius === 'number') ? currentRenderRadius : (this.settings.renderDistance || 8);
const dataKeepDist = Math.max(this.settings.dataKeepDistance || 48, activeRadius + 2);
```

This is a pure clamp; it only ever *raises* the keep radius, so it can't regress existing behavior at the default (48 ≥ 32+2).

### Optional follow-up (not required to fix the report)

- **Data budget headroom at extreme RD.** `maxChunkDataMemoryMB` (1024) holds ~4,367 chunks; the in-view disc first exceeds that at **R≈38**. If static RD > 37 is to be a supported configuration, either auto-raise the byte budget from `⌈π·R²·240KB⌉` or surface a toast when the configured budget is below the in-view requirement. Today's binding limit at R=32 is the mesh ceiling/setting, not bytes, so this is lower priority.

---

## Symptom B — visible disc shrinks when flying up

### What the user sees

> "When I fly up there's only so far away I can view even though it's set to 32 render distance. As I'm able to see more of the circle, the size of the circle shrinks."

This is **not** a save or memory bug — chunk data is resident and the chunks are meshed the whole time. The disc is being **clipped by the camera frustum**: the far clip plane is too close, so from altitude the far edge (and eventually everything below) falls outside the view frustum and isn't drawn.

### B-1 (primary cause) — the camera far plane is fixed at 800 and never scales

The camera is constructed once (line **27623**):

```js
camera = new THREE.PerspectiveCamera(SETTINGS.normalFOV, window.innerWidth / window.innerHeight, 0.01, 800);
//                                                                                              near↑   far↑ (never updated)
```

`far = 800` is a constant — it does **not** track render distance or player altitude. (The only `*.far` updates in the file are the *shadow* cameras and `scene.fog.far`; the main camera's far is set here and nowhere else.)

Render distance 32 is a `32 × 16 = 512`-block disc, faded by **cylindrical** fog (XZ-only distance) to a clear radius of ~480 blocks. Looking down from altitude *H*, the farthest the camera can see straight down is `sqrt(800² − H²)`. Because the fog is cylindrical, altitude adds **no** fog — so the far-plane cut is a hard edge, not a soft fade. The visible radius versus altitude (RD 32):

| Altitude *H* (blocks) | Straight-down visible radius `sqrt(800²−H²)` | vs ~480 fog radius |
|---:|---:|---|
| 200 | 775 | full disc |
| 400 | 693 | full disc |
| 600 | 529 | full disc (just) |
| **640** | **480** | far plane meets fog edge — **shrink begins** |
| 700 | 387 | **disc clipped to 387** |
| 790 | 126 | **disc clipped to 126** |
| ≥ 800 | 0 | **nothing visible straight down** |

So above ~640 blocks the circle starts shrinking and keeps shrinking as you climb — precisely "the more I fly up to see, the smaller the circle gets." It reproduces regardless of memory settings, which is why it shows up with Auto Memory Scaling **off**.

### B-2 (secondary, only when Auto Memory Scaling is ON) — emergency unload trims the in-view disc

Independently of B-1, there is a latent in-view-eviction bug that would *also* shrink the disc, but only with the (default-off) Auto Memory Scaling toggle enabled — so it is **not** the user's current cause. Recorded here because it should be fixed before that feature is recommended:

1. Looking straight down sets `hasHorizontalCameraDir = false`, so `isChunkInFrustum` returns `true` for every in-range chunk (line **42341**) and the whole disc meshes at once.
2. `renderer.info.memory.geometries` climbs; `_getGPUMemory()` estimates `geometries × ~1.09 MB` (lines **20524–20528**) — a crude flat average that over-counts (most chunks are small-tier) and can cross the `budgetMB` warning/critical thresholds.
3. `_handleCriticalMemory()` → `_emergencyChunkUnload()` (lines **20651–20695**) frees up to **20% of meshes beyond `0.75 × SETTINGS.renderDistance`** (radius 24 at RD 32), Chebyshev-keyed — i.e. the outer quarter of the in-view disc — then re-meshing re-triggers it: a shrink/thrash loop.

Both `_handleWarningMemory` and `_handleCriticalMemory` start with `if (!SETTINGS.enableAutoMemoryScaling) return;` (lines **20701**, **20603**); `enableAutoMemoryScaling` defaults to `false` (lines **5990**, **6252**). Toggle is Settings → Performance → Streaming → *Auto Memory Scaling* (line **2580**).

> Either way, "chunks not saving" is a misread: nothing is lost to disk. Data eviction (`chunkDataPool.evictIfNeeded`) writes dirty/pristine chunks to OPFS **before** freeing them (lines **8255–8265**), and B-1 doesn't touch data at all — it only changes what's drawn.

### Proposed fix — Symptom B

**4. (Primary) Scale the camera far plane with render distance AND altitude — construction + per-frame in `renderFrame()`. (Implemented build 2026-06-23.30.)**

```js
// Helper (module scope): horizontal reach to the fog disc edge with headroom.
function computeCameraFar(renderRadius) {
    return renderRadius * WORLD_DIMS.chunkSize * 2 + 256;
}
const _camFarWorldPos = new THREE.Vector3(); // scratch

// At construction (was `..., 0.01, 800`): larger near offsets the bigger depth range.
camera = new THREE.PerspectiveCamera(SETTINGS.normalFOV, window.innerWidth / window.innerHeight, 0.05, computeCameraFar(currentRenderRadius));

// Per frame, at the top of renderFrame() — far must cover vertical drop (≈ camera world-Y, since
// looking down the ground is ~that far) PLUS horizontal reach to the disc edge. camera.position is
// LOCAL under the rig, so read the WORLD position. Gate on >16-block change to avoid projection churn.
if (camera) {
    camera.getWorldPosition(_camFarWorldPos);
    const horizReach = currentRenderRadius * WORLD_DIMS.chunkSize;
    const desiredFar = Math.max(computeCameraFar(currentRenderRadius), _camFarWorldPos.y + horizReach + 256);
    if (Math.abs(desiredFar - camera.far) > 16) {
        camera.far = desiredFar;
        camera.updateProjectionMatrix();
    }
}
```

Why per-frame in `renderFrame()` and not at the render-distance update sites: a render-distance-only far plane (build .29) still clipped when flying high, because the straight-down view distance grows with altitude. `updateChunks` (where `scene.fog.far` updates) **early-exits during pure vertical flight** (it only runs on chunk/frustum/memory change), so the far plane there never refreshes while ascending. `renderFrame()` runs every frame. `uCamFar` needs no manual sync — the water render path already sets it from `camera.far`. Depth-precision trade: larger `far` with old `near = 0.01` worsens z-fighting, so `near` is raised to 0.05.

**5. (Secondary) View-aware emergency unload — `_emergencyChunkUnload`, lines 20659–20674.**

```js
// BEFORE
const currentRD = SETTINGS.renderDistance || 8;
const safeRadius = Math.floor(currentRD * 0.75);
...
const dist = Math.max(Math.abs(cx - playerCX), Math.abs(cz - playerCZ)); // Chebyshev
if (dist > safeRadius) { toUnload.push({ key, dist }); }

// AFTER — never unload chunks that are inside the live render disc
const activeRD = (typeof currentRenderRadius === 'number') ? currentRenderRadius : (SETTINGS.renderDistance || 8);
const safeRadiusSq = activeRD * activeRD;                 // full render distance, not 0.75×
...
const ddx = cx - playerCX, ddz = cz - playerCZ;
const distSq = ddx * ddx + ddz * ddz;                     // Euclidean disc, matches the loader
if (distSq > safeRadiusSq) { toUnload.push({ key, dist: distSq }); }
```

This guarantees the emergency unload can only ever free chunks **outside** the disc the player is rendering — so it can relieve memory (out-of-view chunks meshed during the look-down) without shrinking what the player sees. If there are no out-of-view meshes to free, it does nothing (correct — the real fix for in-view pressure is the budget/estimate, below).

**6. (Secondary) Honest GPU-memory estimate — `_getGPUMemory` / `update`, lines 20517–20531, 20554–20561.**

Replace `info.geometries × avgGeoSizeMB` with the pool's actual tiered byte total, which already classifies each live mesh by tier:

```js
// Prefer the pool's real per-tier accounting over count × flat-average
const geoMB = (typeof geometryPool !== 'undefined' && geometryPool.getMemoryUsageMB)
    ? geometryPool.getMemoryUsageMB().total
    : (info.geometries || 0) * avgGeoSizeMB;   // fallback
```

Most chunks are small-tier, so `count × 1.09 MB` over-counts and manufactures false `CRITICAL` events the moment the whole disc is meshed. The tiered total reflects what is actually allocated.

**Optional (defense-in-depth):** when `enableAutoMemoryScaling` is on and `dynamicRenderDistance` is off, a sustained critical state currently has no lever except the emergency unload. Consider surfacing a one-time toast ("Render distance 32 exceeds your memory budget — lower render distance or raise the Memory Budget") instead of silently thrashing the disc.

---

## Safety checks

- **No duplicate / shadowed identifiers.** New locals `inViewDiscMeshes`, `manualFloor`, `activeRadius` are function-scoped; searched for existing uses — none collide. `currentRenderRadius` is read (window getter/setter at lines 29495–29498), not shadowed.
- **DOM/settings wiring.** Reuses the existing `#max-chunks-slider` / `#max-chunks-val` IDs (no new IDs). The Auto-label pattern mirrors the proven Memory Budget slider (`syncMemoryBudgetUI`). Setting still round-trips through `saveSettings()` / `updateUIFromSettings()`; the only load-path change is `|| 500` → `?? 0` so Auto persists.
- **Per-frame cost.** Change #1 replaces one `Math.max` with one extra multiply + `Math.ceil` on a line that already runs once per `updateChunks` pass — negligible, no new loops. Change #3 adds one `Math.max` inside `getEvictionCandidates`, which runs only when the data budget is exceeded.
- **Profiles & touch prefs.** Only `maxCachedChunks` values change in the three profiles; no touch-pref keys touched (they remain excluded from `SETTINGS_PROFILES`).
- **Backward compatibility.** Saves with a stored `maxCachedChunks` of 100–1,000 keep working — a non-zero value is honored as a manual floor; only the *default* moves to Auto.
- **Symptom B — far plane (change #4).** `camera.far` is only ever *increased* and is recomputed at the existing render-distance update sites (no new per-frame work — those handlers fire on RD change, not every frame). Larger far range is offset by raising `near` 0.01 → 0.05 to preserve depth precision; `uCamFar` is kept in sync so water depth linearization stays correct. `computeCameraFar` is a new top-level helper — searched, no name collision. No effect on chunk data, meshing, or save paths.
- **Symptom B — emergency unload (change #5).** Only ever *raises* the protected radius (`currentRenderRadius` ≥ `0.75 × RD`), so the unload becomes strictly less aggressive — it cannot regress into freeing more. New locals `activeRD`, `safeRadiusSq`, `distSq` are function-scoped; `currentRenderRadius` read via the existing window accessor, not shadowed. Change #6 is read-only accounting that falls back to the old estimate if `geometryPool.getMemoryUsageMB` is absent. Both run inside `MemoryBudgetManager.update()` (throttled to `updateInterval`), not the per-frame path.

---

## Verification plan

1. **Unit math (offline):** confirm `⌈π·R²·1.15⌉ ≥` exact disc count for R ∈ {2…32} (holds; headroom ≥ disc/π·1.15 > 1).
2. **`tools/voxex-tests.html`** (~204 tests, served over localhost): run full suite — no regressions in chunk/meshing/persistence groups.
3. **In-game, RD=32, dynamic off:** stand still until streaming settles; debug overlay (`~`) should show terrain mesh count tracking the in-view disc (~3,200) with `maxAllowedMeshes` ≈ 3,699 (no longer 2,048). Confirm no perpetual prune/rebuild churn on the perf overlay (`O`).
4. **Movement sweep:** walk a long straight line at RD=32; confirm out-of-range chunks still evict (6A/6B unchanged for out-of-range) and no in-view pop-out.
5. **Manual-cap path:** set the slider to e.g. 1,500 on a weak device; confirm the manual floor is honored as a *lower* bound and "Auto" (0) renders correctly in the label and survives a reload.
6. **Data-keep clamp:** set `dataKeepDistance` below render distance (via saved settings) and confirm in-view chunk data is no longer evicted.
7. **Symptom B-1 (far plane) repro/fix:** RD=32, dynamic off, Auto Memory Scaling off. Fly straight up to several hundred — then several thousand — blocks and look straight down. *Before:* terrain "derenders" from the outer edge inward as you climb (build .29 only pushed the threshold to ~1,250 blocks; pre-fix it was ~640). *After (change #4, altitude-aware):* the full fog disc stays visible at any altitude because `camera.far` tracks `cameraWorldY + horizontal reach`. Check for new z-fighting at close range (raised `near` should prevent it) and confirm no per-frame stutter (projection matrix only updates on >16-block altitude change).
8. **Symptom B-2 (emergency unload) repro/fix:** same spot but **Auto Memory Scaling ON**. *Before:* overlay logs `[MemoryBudget] Emergency unloaded N …` and the disc thrashes. *After (changes #5/#6):* unloads, if any, only target chunks beyond `currentRenderRadius`, and the GPU-memory line (overlay `O`) reads materially lower (tiered total vs count×avg).

---

## Files / identifiers touched (for the implementer)

| Concern | Location |
|---|---|
| Auto-ceiling formula | `voxEx.html` line **42457** |
| Slider HTML | lines **2572–2573** |
| `SETTINGS` init / load coercion | line **5981** |
| `DEFAULTS` | line **6243** |
| Settings profiles | lines **6496 / 6527 / 6558** |
| UI sync (3 sites) | lines **22761–22762**, **28611**, **28866** |
| Input listener | lines **23283–23287** |
| Reset handler | line **29010** |
| Data-keep clamp | `getEvictionCandidates`, line **8193** |
| (Read-only) debug overlay expectedMax | near line **11704** |
| **Camera far plane construction (Symptom B-1)** | `camera = new THREE.PerspectiveCamera(...)`, line **27623** (now `0.05`, `computeCameraFar(currentRenderRadius)`) |
| **Per-frame altitude-aware far update** | top of `renderFrame()` (~line **44138**); helper `computeCameraFar` + `_camFarWorldPos` scratch near line **9787** |
| Water shader `uCamFar` (self-syncs from `camera.far`) | water render path in `renderFrame()` |
| Frustum bypass when looking down | `isChunkInFrustum`, line **42341** |
| View-aware emergency unload (Symptom B-2) | `_emergencyChunkUnload`, lines **20659–20674** |
| GPU-memory estimate (count×avg → tiered total) | `_getGPUMemory` / `update`, lines **20517–20531**, **20554–20561** |
| Auto-scaling gate / default | `_handleCriticalMemory` line **20603**, `_handleWarningMemory` line **20701**; default `enableAutoMemoryScaling: false` lines **5990 / 6252** |
| Auto Memory Scaling checkbox | line **2580** |

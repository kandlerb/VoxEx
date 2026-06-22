# CCR — GeometryBufferPool: Release Idle Per-Tier VRAM (Shrink Cap / Pressure-Drain / LRU)

**ID:** VOXEX-CCR-VRAM-002
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟡 **Proposal / report only — no code applied yet. DEPRIORITIZED behind VOXEX-CCR-VRAM-001.** Read & debate first. This is the explicit companion to `CCR-chunk-geometry-vram.md` (VOXEX-CCR-VRAM-001, attribute packing): the two **compose** (this trims idle buffers; that one shrinks every buffer including active), but VRAM-001 is the recommended-first lever for the reasons in *Why this ranks behind VRAM-001*.
**Scope:** Release idle GPU memory held by `GeometryBufferPool`, which today keeps up to `maxPoolSizePerTier = 32` released geometries in **each of its four pools** (terrain small/medium/large + water) and **never disposes a pooled geometry until the pool overflows**. Three candidate mechanisms are documented (lower the static cap, a pressure-gated drain hook, or LRU/TTL eviction); none changes meshing, lighting, gameplay, or visuals — only how long released geometries linger before their GPU buffers are freed.

> Line numbers are as of the working tree on **2026-06-22** and **will drift** — grep the quoted identifier/string before editing, per repo convention.

---

## Summary

- **What:** `GeometryBufferPool` (class at line 19832, instantiated `new GeometryBufferPool(32)` at line 20136) reuses chunk geometries to avoid per-mesh GPU buffer churn. On `releaseTerrain`/`releaseWater` (lines 20049, 20067) a geometry is pushed back to its tier pool **with its GPU buffers intact**; `geo.dispose()` is called **only when the pool is already full** (`pool.length < this.maxPoolSizePerTier` else dispose). There is **no other disposal path** — grep confirms no `drainPool`/`trimPool`/`clearPool`/evict for this pool anywhere in the file. So once a pool reaches 32 via streaming churn, it stays at 32, each entry holding a tier-sized buffer, until the page reloads.
- **The opportunity:** shrink that idle reservation. Strict worst-case (all four pools full) is **~184 MB** of GPU VRAM doing nothing (derivation below) — material on the project's target 4 GB Quadro P1000. The scan's "~192 MB" estimate is the same order; both are the **ceiling, not the expected value** (see *Honest savings*).
- **Why it's more than its raw size — a real, documented nuance:** the idle pool's geometries are counted by the authoritative memory-pressure metric. `MemoryBudgetManager.update()` builds `totalMB` from `gpuGeometriesMB` = `renderer.info.memory.geometries × avgGeoSizeMB` (line 20308), and Three.js counts a geometry from its first render until `geometry.dispose()` — a pooled-but-not-disposed geometry **stays counted**. (Corroborated by the code itself: line 20340 deliberately excludes `geometryPoolMB` from the total *"to avoid double-counting"* against `gpuGeometriesMB` — which only makes sense if the pool's geos are already inside `gpuGeometriesMB`.) Worse, the pool *fills precisely under pressure*: when `_handleWarningMemory`/`_handleCriticalMemory` reduce render distance, the unloaded meshes' geometries flow into `releaseTerrain` and top the pools up to 32/tier. The pressure response then evicts chunk **data** and unloads distant chunk **meshes** — but **never disposes the idle geometry pool**. So idle geometry weight rides in the metric that triggers the render-distance cut, yet is never relieved by the cut. Draining it would both free real VRAM and lower the metric.
- **Recommended disposition:** **document and defer.** Ship VOXEX-CCR-VRAM-001 (attribute packing) first; it deterministically shrinks the same buffers ~28% and also covers active geometry. Pool trimming then composes as a later add-on (preferred form: the pressure-gated drain in *Design option B*). This CCR records the analysis so the add-on can be picked up without re-deriving it.

---

## Current behavior (verified against source)

### The cap and the only disposal path — `GeometryBufferPool` (lines 19832–20136)

```js
constructor(maxPoolSizePerTier = 32) {
    this.terrainPools = { small: [], medium: [], large: [] }; // 4K / 8K / 16K faces
    this.waterPool = [];
    this.maxPoolSizePerTier = maxPoolSizePerTier;
}
// ...
releaseTerrain(geo) {
    const tier = geo.userData.tier || 'large';
    const pool = this.terrainPools[tier];
    if (pool.length < this.maxPoolSizePerTier) {
        geo.setDrawRange(0, 0);
        pool.push(geo);          // <-- GPU buffers RETAINED, never disposed
    } else {
        geo.dispose();           // <-- only ever disposed on overflow
    }
}
```

`releaseWater` (line 20067) is identical against `this.waterPool`. `acquireTerrain`/`acquireWater` (lines 19996, 20035) `pool.pop()` or create. The cap is applied **per pool**, so the effective ceiling is `32 × (small + medium + large + water)` geometries, not 32 total.

### Per-geometry buffer size (line 6799 formula)

```
bytes/geometry = maxFaces × 4 verts × 10 floats × 4 B   (position3 + uv2 + color3 + quadSize2; no normals — flatShading)
               + maxFaces × 6 indices × 4 B
             = maxFaces × 184 B            (184 B/face — the same figure VRAM-001 reduces to 132)
```

| Pool (tier) | Max faces | Bytes/geometry | MB/geometry | × 32 idle |
|-------------|----------:|---------------:|------------:|----------:|
| terrain small | 4 096 | 753 664 | 0.719 | 23.0 MB |
| terrain medium | 8 192 | 1 507 328 | 1.438 | 46.0 MB |
| terrain large | 16 384 | 3 014 656 | 2.875 | 92.0 MB |
| water (≈ large/4) | — | ~753 664 | ~0.719 | ~23.0 MB |
| **all four full** | | | | **~184 MB** |

(`GEO_TIER_*_MB` at lines 6804–6806 round these to ~0.78/1.56/3.12 — using those rounder figures yields the scan's ~192–200 MB. Either way: order ~190 MB ceiling.)

---

## Honest savings (ceiling vs. expected — this reinforces the deprioritization)

The **~184 MB is a strict ceiling that assumes all four pools sit full**, which they generally do not:

- **The large tier dominates the ceiling (92 of 184 MB) but is the rarest geometry.** Per the file's own distribution note (line 6789, *"~70% small, ~25% medium, ~5% large"*), accumulating **32 idle *large* geometries** requires 32 ≥8K-face chunks to have been meshed and then released near-simultaneously — an unusual transient, not a steady state. Realistic idle VRAM is small/medium-dominated and well under the ceiling.
- **The saving is runtime-dependent.** It exists only to the extent the pools were actually full, which is a function of travel pattern, render distance, and terrain face counts — not a fixed, claimable number. Contrast VRAM-001's −28%, which is deterministic per face and applies whether the buffer is active or idle.

So the headline figure is "**up to ~184 MB at the worst-case ceiling, typically much less**." This is exactly why the item is a *band-aid relative to packing* — the honest savings range is wide and only materializes under specific conditions, whereas packing's win is unconditional.

---

## Why this ranks behind VOXEX-CCR-VRAM-001 (and composes with it)

| | VRAM-002 (this — pool trim) | VRAM-001 (attribute packing) |
|---|---|---|
| Buffers affected | **idle only** (active meshes keep full buffers) | **every** buffer (active + idle) |
| Savings nature | runtime-dependent (only if pools full) | **deterministic** −28% (184→132 B/face) |
| Trade-off introduced | re-create/upload churn after draining (the exact churn the pool exists to prevent) | none (pure retype + one convert at write sites) |
| Mechanism | dispose idle geometries sooner | smaller GPU attribute types |

**They stack.** If packing ships first, every pooled geometry is already ~132 B/face, so the same all-full ceiling drops from **~184 MB → ~132 MB** and the marginal win from trimming shrinks proportionally. Doing packing first is strictly higher ROI; trimming is a later add-on layered on top of the already-smaller buffers — it does not block or depend on packing, and packing does not block or depend on it.

---

## Design options (for the eventual add-on — not for now)

Three shapes, increasing in value and in implementation surface. All are main-thread-only (no worker parity).

### Option A — Lower the static cap (smallest change, weakest)
Change `new GeometryBufferPool(32)` (line 20136) to a smaller constant (e.g. 8–12), or make the cap per-tier (large needs far less reserve than small). Trivial one-line edit.
- **Upside:** caps idle VRAM unconditionally; zero new code paths.
- **Downside:** 32 was sized to absorb streaming-churn bursts during fast travel; a smaller cap raises dispose/recreate frequency in that hot path — re-introducing the allocation churn the pool exists to avoid, and adding GPU re-upload cost. The savings still only materialize when the pool *was* full. **Tune, don't slash:** a per-tier cap (e.g. small 24 / medium 12 / large 6 / water 8) targets the cheap-to-recreate tiers generously and the expensive large tier tightly, capping the ceiling near ~60 MB without starving the churn-absorbing small pool.

### Option B — Pressure-gated drain (recommended add-on)
Add a `trim(keepPerTier)` / `drainIdle()` method to `GeometryBufferPool` that `pool.pop().dispose()`s each pool down to a small floor, and **call it from `MemoryBudgetManager._handleWarningMemory()` (line 20480) BEFORE the render-distance reduction.** Drain idle VRAM first; only cut render distance if that is insufficient.
- **Upside:** highest value — releases idle VRAM **exactly when it matters** and, because the idle pool is inside `gpuGeometriesMB`, lowers the pressure metric itself. Keeping a small per-tier floor (e.g. 4) preserves most churn absorption. When pressure subsides, `_restoreQuality` (line 20507) already exists to walk render distance back up; the pools refill naturally on subsequent meshing.
- **Timing nuance (state it precisely):** `_cachedUsage.percentage` is computed once per `update()` tick (`updateInterval = 1000 ms`, line 20236) **before** `_checkMemoryPressure` runs, so a drain inside `_handleWarningMemory` relieves memory for the **next** tick's reading. Phrase the benefit as *"can prevent escalation to the critical render-distance cut on a subsequent tick,"* **not** "averts the cut instantly."
- **Metric-accuracy nuance:** `gpuGeometriesMB` uses a single flat weighted-average size per geometry (line 20305), so a drain's per-tier relief registers only **approximately** (undercounts a large-tier drain, overcounts a small-tier drain). The *real* VRAM is freed exactly; only the estimate is fuzzy.
- **Downside:** churn after the drain when the player keeps moving; mitigated by the floor and by gating strictly on the warning threshold.

### Option C — LRU / TTL idle eviction (most complete, most state)
Stamp each pooled geometry with a release timestamp; in an existing periodic hook (e.g. alongside `checkGeometryLeaks`, line 20150, which already runs on a 5 s interval) dispose entries idle longer than N seconds, down to a per-tier floor.
- **Upside:** releases idle VRAM after travel **stops**, without waiting for memory pressure — good for a player who explores then stands still.
- **Downside:** most new state (per-geometry timestamps), and `performance.now()` plumbing; releases memory that may not be under any pressure, so the churn cost is paid speculatively. Lowest priority of the three.

**Recommendation if/when this is taken:** Option B (pressure-gated drain with a per-tier floor), optionally with Option A's per-tier caps as a cheap complementary ceiling. Skip C unless idle-after-exploration VRAM proves to be a measured problem.

---

## Adjacent latent bug found during audit (fold in or explicitly defer)

`window.memoryDebug.fixLeaks()` (line 12984) iterates `geometryPool.terrainPool` (**singular**) to collect pooled geometries into its keep-set:

```js
for (const geo of geometryPool.terrainPool || []) { activeGeos.add(geo); }   // <-- terrainPool is undefined
```

The field was renamed to `terrainPools` (object of `{small, medium, large}`) — there is no `terrainPool`, so `|| []` makes this a no-op and the three tier pools are **silently skipped**. Consequence: `fixLeaks` undercounts legitimate pooled terrain geometries by up to 96 (3 tiers × 32) and could dispose live pooled buffers as "leaked." The correct read mirrors `checkGeometryLeaks` (lines 20163–20165):

```js
for (const tier of ['small', 'medium', 'large']) {
    for (const geo of geometryPool.terrainPools?.[tier] || []) activeGeos.add(geo);
}
for (const geo of geometryPool.waterPool || []) activeGeos.add(geo);
```

This directly concerns idle-geometry accounting, so a pool-VRAM change is the natural place to fix it — **either fold this one-liner in or note it as explicitly deferred to its own change.** (Listed here so it is not left implicit.)

---

## Out of scope / confirmed unaffected

- **Active chunk meshes:** untouched — only *released* geometries are affected. Acquire/release contract (lines 19996–20075) is unchanged; `acquireTerrain` still pops-or-creates transparently, so a drained pool just creates fresh geometries on the next mesh (the pre-existing miss path).
- **Worker / save format / lighting / terrain gen:** none touched. The pool is main-thread-only; no `buildChunkWorkerCode()` change, no RLE/OPFS change, no `_cacheVersion` bump.
- **VRAM-001 (attribute packing):** independent. If both ship, the pool simply holds the smaller (132 B/face) geometries; the drain/cap logic is type-agnostic.
- **`GeometryBufferPool` stats (`getStats`/`getMemoryUsageMB`, lines 20081/20115):** already report per-tier pool sizes and idle MB — a drain would be observable here with no new instrumentation needed.

---

## Safety checks (for the eventual implementation)

- **Single-file rule:** all candidate edits (cap constant, a `trim`/`drainIdle` method, one call site in `_handleWarningMemory`, the `fixLeaks` field-name fix) stay in `voxEx.html`. No new files/assets.
- **No duplicate/shadowed identifiers:** a new `trim`/`drainIdle` method name must be grepped first (none exists today); it lives on the class, shadowing nothing global. No reshadow of `geometryPool`, `SETTINGS`, `chunkMeshes`.
- **DOM/settings:** Option A's cap could optionally surface as a setting (`DEFAULTS`→`SETTINGS`→UI→round-trip), but the recommended Option B needs **no** new setting — it hangs off the existing `enableAutoMemoryScaling`/threshold machinery. Keep it setting-free unless a tunable floor is wanted.
- **Hot-path discipline:** draining runs only at the **1 s memory-budget tick** (Option B) or the **5 s leak-check tick** (Option C) — never per frame. `dispose()` is O(pool length) ≤ ~96 calls, not in the render loop. No nested loops added to per-frame code.
- **Behavioral/visual parity:** disposing an *idle* geometry is invisible — it is not bound to any mesh. The only behavioral change is more `_createTerrainGeometry` calls (and GPU re-uploads) after a drain if the player keeps meshing; the per-tier floor bounds that. No topology, lighting, or draw-order change.
- **Correctness of the metric claim:** the "idle pool inflates `gpuGeometriesMB`" reasoning rests on Three.js counting undisposed geometries in `renderer.info.memory.geometries`. **Verify empirically in the test plan** (read the counter before/after a forced drain) rather than shipping on the inference alone — honest-scoping per the sibling CCRs.

## Test plan (for the eventual implementation)

- **Regression suite:** `tools/voxex-tests.html` (~204 tests; serve over localhost; headless via the memory note's puppeteer-core/SwiftShader recipe — expect `214/214 ... All green!`). Meshing coverage exercises acquire/release.
- **Metric-counting verification (validates the load-bearing inference):** at a fixed seed + render distance, fill the pools (travel to churn meshes, then stop), record `renderer.info.memory.geometries` and `geometryPool.getStats()`; call a forced `drainIdle()`; confirm `renderer.info.memory.geometries` **drops** by the disposed count and `geometryPool.getMemoryUsageMB().total` falls accordingly. If the renderer counter does **not** drop, the metric-inflation argument is wrong and Option B's "lowers the pressure metric" benefit must be struck — find this out before relying on it.
- **Churn cost:** with Option B's floor in place, fly continuously at high render distance across a warning-threshold crossing; confirm `geometryPool.getStats().terrainCreated` does not spike pathologically (the floor should absorb most re-acquires) and FPS holds — i.e. the drain does not trade a VRAM win for a frame-time regression.
- **Pressure-relief behavior:** on the 4 GB box, drive memory to the warning threshold; confirm the drain (Option B) registers on the **next** `update()` tick and, where it brings `percentage` back under threshold, the render-distance cut in `_handleWarningMemory` is **not** taken (or is taken later/less). Compare `_stats.scaleDownCount` before/after.
- **`fixLeaks` fix (if folded in):** trigger `window.memoryDebug.fixLeaks()` with full pools; confirm pooled terrain geometries are now in the keep-set and not disposed as leaked (renderer geometry count unchanged for live pooled buffers).
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`).

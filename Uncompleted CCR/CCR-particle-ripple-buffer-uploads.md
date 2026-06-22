# CCR — Particle/Ripple Per-Frame Buffer Uploads: Bound the Upload to the Active Prefix

**ID:** VOXEX-CCR-FX-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22 (build `2026-06-22.3`)
**Status:** 🟢 **Proposal / report only — no code applied yet. LOW PRIORITY.** Read & debate first.
**Scope:** Two per-frame effect costs. (1) `ParticleSystem.update()` flags all three vertex buffers `needsUpdate = true` whenever ≥1 particle is active (lines **14974–14979**), and because the attributes carry **no** `updateRange` and **no** `setDrawRange`, three.js re-uploads the **entire 500-slot arrays** and the vertex shader runs for all **500** points — regardless of how few are active. (2) `updateWaterRipples()` (lines **15938–15961**) mutates each live ripple's scene-graph scale and rewrites its `material.opacity` every frame. The proposed win is to **bound the particle upload (and optionally the draw) to the active prefix** and skip uploading the one attribute that doesn't change.

> **This is a low-value item by design.** Particles are hard-capped at **500** (`PARTICLE_CONFIG.maxParticles`, line 14777) and ripples at **20** (`MAX_WATER_RIPPLES`, line 15617). The absolute cost is **small and intermittent — it is paid only while effects are active** (block-break, footstep, torch, water splash/wake) and is **zero at steady-state idle**. So this **cannot move the render-distance / steady-state-FPS ceiling** the way the geometry-VRAM and edge-lighting CCRs do. It is filed for completeness and as a cheap, self-contained cleanup, not as a performance lever. Length is kept short on purpose — document volume should track impact.

> Line numbers are as of the working tree on **2026-06-22 (build `2026-06-22.3`)** and **will drift** — grep the quoted identifier/string before editing, per repo convention.

---

## Summary

- **What (particles):** `ParticleSystem` is a **singleton** (`particleSystem = new ParticleSystem(scene)`, line 27247) backed by three `Float32Array`s sized to `maxCount = 500`: `positions` (500×3 = **6 KB**), `colors` (500×4 = **8 KB**), `sizes` (500×1 = **2 KB**) — **~16 KB total**. They are wrapped in plain `THREE.BufferAttribute` (lines 14816–14818) — i.e. **`StaticDrawUsage`**, no `setUsage`. Every frame with ≥1 active particle, `update()` sets `needsUpdate = true` on all three (lines 14974–14979). With **no `updateRange`** registered, three.js r160 re-uploads the **whole** array (`gl.bufferSubData(0, fullArray)`), so all **~16 KB** is re-sent even when **5** particles are active. The `THREE.Points` mesh also has **no `setDrawRange`**, so the vertex shader is invoked for all **500** points every frame (inactive slots sit at `y = -1000`, `alpha = 0` and are clipped/discarded — but still shaded).
- **What (ripples):** `updateWaterRipples()` iterates ≤20 ripples and, for each live one, calls `ripple.mesh.scale.set(scale, 1, scale)` (marks that Object3D's matrix dirty) and writes `ripple.material.opacity` (each ripple owns its own material → its own draw call).
- **The win is narrow and specific** — not generic "dirty-range tracking":
  - **Bound the upload to the active prefix.** Active particles are **densely packed** in `[0, activeCount)` (spawn assigns `index = activeCount`; despawn swap-removes — see *Packing* below), so an `addUpdateRange(0, activeCount × itemSize)` uploads only the live slots. At 5/500 active that is a **~99%** cut of the *upload* (not of the cap). This is the same API the chunk pool already uses (`clearUpdateRanges()/addUpdateRange()`, line 19628).
  - **`size` is the one skippable attribute.** `positions` change every active frame (physics integration, lines 14954–14963) and `colors` change every frame for any `fadeOut` particle (`alpha = a × life/maxLife`, line 14965) — so "skip when nothing moved" buys **~nothing** on those two. But **`p.size` is never mutated in `update()`** — it only changes at `spawn()`. So the `size` buffer can be left un-flagged except on spawn/despawn frames: a genuine skip-when-unchanged candidate.
- **Ripples yield ~zero and that's stated plainly.** A *living* ripple expands and fades **every frame by definition**, so `scale` and `opacity` genuinely change each frame — there is no "nothing moved" frame to skip. With ≤20 of them: `opacity` is a free per-frame **uniform** write (no `needsUpdate`, no recompile), and `scale.set` is one matrix compose per ripple. There is **no meaningfully skippable work** in `updateWaterRipples()`. Documented here only because the task names it; **no ripple change is recommended.**
- **Recommended fix:** **Option A** (below) — bound the particle upload to the touched prefix and skip the unchanged `size` upload. Leave draw-range and ripples alone.

---

## Current behavior (verified against source)

### Particle buffers — allocation (lines 14797–14818)

```js
this.positions = new Float32Array(this.maxCount * 3);   // 500×3 = 6 KB
this.colors    = new Float32Array(this.maxCount * 4);   // 500×4 = 8 KB
this.sizes     = new Float32Array(this.maxCount);       // 500×1 = 2 KB
// ...
this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3)); // StaticDrawUsage, no updateRange
this.geometry.setAttribute('color',    new THREE.BufferAttribute(this.colors, 4));
this.geometry.setAttribute('size',     new THREE.BufferAttribute(this.sizes, 1));
this.mesh = new THREE.Points(this.geometry, this.material);   // no setDrawRange → draws all 500
```

### Particle buffers — per-frame flag (lines 14974–14979)

```js
// Mark buffers for update
if (this.activeCount > 0) {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;   // <-- size rarely actually changed
}
```

No `updateRange` ⇒ full-array re-upload. Contrast the chunk geometry pool, which uses both `DynamicDrawUsage` (lines 19912–19916) and bounded `addUpdateRange` (line 19628) — the pattern this CCR proposes to reuse.

### Packing invariant (why a prefix range is correct)

- `spawn()` (line 14879): `particle.index = this.activeCount`, writes that slot, `this.particles.push(...)`, `this.activeCount++`. New particles always land at the top of the active range.
- `despawn(i)` (lines 14982–15023): swap-removes — the last active particle is copied into slot `i`, the **old last slot** (`lastPOldBufferIndex`) is hidden (`y = -1000`, `alpha = 0`), then `this.particles.pop(); this.activeCount--`.

So at all times active particles occupy **exactly `[0, activeCount)`**. **The trap:** after a despawn, the *just-hidden* slot sits at index **`== activeCount`** — i.e. **one past** a `[0, activeCount)` upload range. If you bound the upload to `[0, activeCount)` but keep **drawing all 500**, that stale slot still holds a visible particle's last data on the GPU and renders as a **ghost**. Two ways out, per the option below.

### Ripples — per-frame mutation (lines 15938–15961)

```js
function updateWaterRipples(dt) {
    for (let i = waterRipples.length - 1; i >= 0; i--) {
        const ripple = waterRipples[i];
        ripple.life -= dt;
        if (ripple.life <= 0) { scene.remove(ripple.mesh); ripple.geometry.dispose(); ripple.material.dispose(); waterRipples.splice(i, 1); continue; }
        ripple.scale += dt * (ripple.expansionRate ?? 2);
        ripple.mesh.scale.set(ripple.scale, 1, ripple.scale);            // matrix dirty (1 compose)
        ripple.material.opacity = (ripple.initialOpacity ?? 0.5) * (ripple.life / ripple.maxLife);  // free uniform write
    }
}
```

Both writes are intrinsic to the animation. Nothing to skip.

---

## Proposed change — two options (Option A recommended)

### Option A — bound the upload + skip the unchanged `size` (RECOMMENDED, minimal contract)

Keep drawing all 500 (current behavior — **no new draw-range contract**), but upload only what was touched and only the attributes that changed:

1. In `update()`, after the loop, replace the blanket three-flag block with a **bounded** upload over the prefix actually written this frame. Because despawns shrink `activeCount` mid-loop, the upper bound must be the **high-water mark of slots touched this frame** = the `activeCount` *at the start of the frame* (covers every slot a despawn may have hidden). Snapshot it before the loop:
   ```js
   const startCount = this.activeCount;          // before the despawn loop
   // ... existing update loop ...
   const touched = Math.max(startCount, this.activeCount);   // slots that may have changed (incl. just-hidden)
   if (touched > 0) {
       const pos = this.geometry.attributes.position, col = this.geometry.attributes.color;
       pos.clearUpdateRanges(); pos.addUpdateRange(0, touched * 3); pos.needsUpdate = true;
       col.clearUpdateRanges(); col.addUpdateRange(0, touched * 4); col.needsUpdate = true;
   }
   ```
2. **Flag `size` only when it changed.** `size` is written in `spawn()` and in the despawn swap-copy, never in the integration loop. So set a `this._sizesDirty = true` flag in `spawn()` and `despawn()`, and in `update()` flag `size.needsUpdate` (bounded the same way) **only if** `this._sizesDirty`, then clear it. On the common frame (particles in flight, none spawned/despawned) the 2 KB `size` upload is skipped entirely.
3. **`spawn()` (lines 14917–14920)** keeps flagging `position`/`color` for immediate visibility, but should likewise use a bounded `addUpdateRange(0, activeCount × itemSize)` covering its new top slot rather than a full re-flag, and set `_sizesDirty`.
4. Optionally call `attr.setUsage(THREE.DynamicDrawUsage)` once at `init()` (lines 14816–14818) so the three per-frame buffers carry the correct usage hint (these are re-uploaded constantly; `StaticDrawUsage` can provoke driver-side reallocation/sync on some GPUs). Low-confidence micro-win; harmless.

**Why A is the proportionate pick:** it directly removes the cost the task names (full-array re-upload) with **no new rendering contract** — the ghost trap never arises because all 500 are still drawn *and* the high-water-mark range re-uploads the just-hidden slot's transparent data. Self-contained, one method.

### Option B — also `setDrawRange(0, activeCount)` (thorough, but adds a contract)

Additionally cap drawn vertices to the active prefix, cutting vertex-shader invocations from 500 → `activeCount` and *also* neutralizing the ghost trap (the hidden tail slot is simply never drawn). **But** this introduces a contract that must hold at **every** render: **`drawRange.count` must equal `activeCount`**, maintained across **both** `update()` *and* `spawn()`. `spawn()` fires mid-frame from input/physics (e.g. `spawnBlockBreak`, `spawnWaterEntrySplash`) and currently only flips `needsUpdate`; if it does not also extend the draw range, a particle spawned after that frame's `update()` **vanishes for a frame**. The extra win (vertex shading of ≤500 cheap points) is tiny, and the regression surface (every spawn path must touch the draw range) is larger than A's. **Not recommended for a low-priority item** — listed for completeness.

### Ripples — no change recommended

See *Summary*. The per-frame `scale.set`/`opacity` writes are intrinsic to a living, expanding, fading ripple; opacity is a free uniform write and there are ≤20 meshes. There is no skippable work; touching it would add risk for no measurable gain.

---

## Savings (honest framing)

- **Upload bytes:** from a fixed **~16 KB/frame** (when ≥1 active) down to **~itemBytes × activeCount**, plus skipping the 2 KB `size` upload on non-spawn frames. At a typical few-to-dozens of active particles this is a large *proportional* cut of a *small, intermittent* cost. **At idle (no active particles) the cost is already zero**, today and after — the block does nothing when `activeCount === 0`.
- **What it does NOT do:** it does not reduce the 500/20 caps, does not touch geometry VRAM, and does not raise the steady-state render-distance/FPS ceiling. The defensible claim is "a proportional reduction of an intermittent ~16 KB/frame upload during active effects," nothing larger. Treat any per-frame-ms figure as device-dependent and measure in-browser before quoting one.

---

## Safety checks

- **Single-file rule:** all edits confined to `ParticleSystem.update()/spawn()/despawn()/init()` in `voxEx.html`. No new files/assets.
- **No duplicate/shadowed identifiers:** new names are instance fields (`this._sizesDirty`) and locals (`startCount`, `touched`); no globals (`scene`, `SETTINGS`, `particleSystem`, geometry pool) reshadowed. Grep `_sizesDirty` first to confirm uniqueness.
- **No DOM/settings wiring:** no new settings, DOM IDs, or save/load fields; nothing to round-trip. No `SETTINGS_VERSION` bump.
- **Hot-path discipline:** the change *replaces* per-frame work (three full re-uploads) with strictly less (bounded re-uploads, one skipped attribute). It adds no nested loops — the snapshot/flag are O(1) around the existing single update loop.
- **Packing / ghost correctness (Option A):** the upload range upper bound is the **start-of-frame** `activeCount` (high-water mark), so every slot a despawn may have hidden is re-uploaded transparent — **no ghost**, even though all 500 are still drawn. (Option B instead relies on `setDrawRange` clipping the tail and must maintain the draw-range contract on every spawn — the reason it is not recommended.)
- **Worker parity:** none — `ParticleSystem` is main-thread-only. No `buildChunkWorkerCode()` change.
- **Ripples:** untouched by recommendation.

## Test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204 tests; serve over localhost; on this headless box drive installed Chrome via puppeteer-core/SwiftShader — expect `214/214 ... All green!`). No particle-specific tests today, so this mainly guards against collateral breakage.
- **Visual — the load-bearing check:** in-game, exercise every spawn path and confirm **no ghost / no missing-frame** particles:
  - **Block break** (mine blocks rapidly — high spawn/despawn churn, exercises the swap-remove + high-water-mark range).
  - **Footstep dust**, **torch embers/smoke** (steady low-count streams — exercises the bounded prefix at small `activeCount`).
  - **Water entry splash + swim/wading wake** (bursts — exercises `spawn()` mid-frame visibility).
  - Confirm a despawning particle disappears cleanly (no lingering ghost at its last position) and a just-spawned particle is visible the **same** frame.
- **Counter sanity:** with `window`-exposed stats if available, verify active particles still render correctly at `activeCount` near the 500 cap (e.g. a big block-break burst) — the prefix range must cover the full active set there.
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`).

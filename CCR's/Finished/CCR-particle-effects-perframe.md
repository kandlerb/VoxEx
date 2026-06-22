# CCR — Particle / Effects Per-Frame Cleanup: Bound Buffer Uploads + Placed-Torch Spawner Allocations

**ID:** VOXEX-CCR-FX-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22 (build `2026-06-22.3`)
**Status:** 🟢 **Implemented — build `2026-06-22.8`.** Both parts shipped. Part A: bounded buffer uploads + `_sizesDirty` gate + ghost-particle fix + `DynamicDrawUsage`. Part B: Phase 1 (timing on torch object, Maps dropped) + Phase 2 (5×5 chunk window). Code review passed — no Critical/Important issues. 282/282 tests green.
**Scope:** Two self-contained per-frame CPU/GC cleanups in the effects layer (neither touches VRAM nor the worker):

- **Part A — Particle buffer uploads.** `ParticleSystem.update()` flags all three vertex buffers `needsUpdate = true` whenever ≥1 particle is active and, lacking any `updateRange`, three.js re-uploads the **entire 500-slot arrays**. Bound the upload to the active prefix and skip the one attribute that doesn't change.
- **Part B — Placed-torch spawner.** The flame/smoke spawner in `updateVisualEffects()` allocates a fresh template-string key **per nearby torch every frame** and iterates **every** torch-bearing chunk before distance-culling. Move the timing onto the torch object (kills the allocation + a latent eviction bug) and optionally window the outer loop.

> **Merge note:** this CCR absorbs the former standalone `CCR-torch-particle-perframe.md` (VOXEX-CCR-PERF-001). Both were low-priority per-frame CPU/GC cleanups in the particle/effects systems on the main thread — Part B's spawner *feeds* the particle system Part A optimizes — so they are folded here as Parts A and B with one shared Safety/Test section. **These are low-value items by design.** Particles are hard-capped at **500** (`PARTICLE_CONFIG.maxParticles`, line 14796) and ripples at **20** (`MAX_WATER_RIPPLES`, line 15636); placed torches are typically few. The absolute cost is **small and intermittent — paid only while effects are active** and **zero at steady-state idle**. So this **cannot move the render-distance / steady-state-FPS ceiling** the way the geometry-VRAM and edge-lighting CCRs do. Filed for completeness and as cheap, correctness-improving cleanup; it should sequence **behind** the VRAM (`CCR-chunk-geometry-vram.md`, VRAM-001) and edge-lighting (`CCR-edge-lighting-streaming-cost.md`, LIGHT-001) CCRs that actually target the 4 GB-Quadro constraint.

> Line numbers are as of the working tree on **2026-06-22 (build `2026-06-22.3`)** and **WILL drift** — grep the quoted identifier/string before editing, per repo convention.

---

# Part A — Particle Buffer Uploads

## Summary

- **What:** `ParticleSystem` is a **singleton** (`particleSystem = new ParticleSystem(scene)`, line 27314) backed by three `Float32Array`s sized to `maxCount = 500`: `positions` (500×3 = **6 KB**), `colors` (500×4 = **8 KB**), `sizes` (500×1 = **2 KB**) — **~16 KB total**. They are wrapped in plain `THREE.BufferAttribute` (lines 14835–14837) — i.e. **`StaticDrawUsage`**, no `setUsage`. Every frame with ≥1 active particle, `update()` sets `needsUpdate = true` on all three (lines 14994–14998). With **no `updateRange`** registered, three.js r160 re-uploads the **whole** array (`gl.bufferSubData(0, fullArray)`), so all **~16 KB** is re-sent even when **5** particles are active. The `THREE.Points` mesh also has **no `setDrawRange`**, so the vertex shader is invoked for all **500** points every frame (inactive slots sit at `y = -1000`, `alpha = 0` and are clipped/discarded — but still shaded).
- **The win is narrow and specific** — not generic dirty-range tracking:
  - **Bound the upload to the active prefix.** Active particles are **densely packed** in `[0, activeCount)` (spawn assigns `index = activeCount`; despawn swap-removes — see *Packing*), so `addUpdateRange(0, activeCount × itemSize)` uploads only the live slots. At 5/500 active that is a **~99%** cut of the *upload*. Same API the chunk pool already uses (`clearUpdateRanges()/addUpdateRange()`, line 19673).
  - **`size` is the one skippable attribute.** `positions` change every active frame (physics integration, lines 14972–14976) and `colors` change every frame for any `fadeOut` particle (`alpha = a × life/maxLife`, line 14984) — so "skip when nothing moved" buys ~nothing on those two. The `size` buffer **is** written every frame in the integration loop (`this.sizes[idx] = p.size`, line 14990), **but the value it writes never changes**: `p.size` is set once at `spawn()` and is never mutated afterward, so the loop just rewrites the same constant. A slot's stored size therefore only *changes* on a `spawn()` (new value into the top slot) or a `despawn()` swap (a different particle's size copied into the freed slot). So the `size` buffer upload can be skipped on any frame with no spawn/despawn — the CPU-side bytes are already correct and identical to what's on the GPU. (Note: the line-14990 loop write is redundant given this invariant, but it is harmless and left in place — this part does not remove it.)

## Current behavior (verified against source)

### Particle buffers — allocation (lines 14819–14837)

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

### Per-frame flag (lines 14994–14998)

```js
if (this.activeCount > 0) {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;   // <-- size rarely actually changed
}
```

No `updateRange` ⇒ full-array re-upload. Contrast the chunk geometry pool, which uses both `DynamicDrawUsage` (lines 19962–19966) and bounded `addUpdateRange` (line 19673) — the pattern this part proposes to reuse.

### Packing invariant (why a prefix range is correct)

- `spawn()` (line 14898): `particle.index = this.activeCount` (line 14907), writes that slot, `this.particles.push(...)`, `this.activeCount++` (line 14942). New particles always land at the top of the active range.
- `despawn(i)` (lines 15001–15042): swap-removes — the last active particle is copied into slot `i`, the **old last slot** (`lastPOldBufferIndex`) is hidden (`y = -1000`, `alpha = 0`), then `this.particles.pop(); this.activeCount--`.

So active particles occupy **exactly `[0, activeCount)`**. **The trap:** after a despawn, the *just-hidden* slot sits at index **`== activeCount`** — one past a `[0, activeCount)` upload range. If you bound the upload to `[0, activeCount)` but keep **drawing all 500**, that stale slot still holds visible data on the GPU and renders as a **ghost**. Two ways out, per the options below.

## Proposed change — two options (Option A recommended)

### Option A — bound the upload + skip the unchanged `size` (RECOMMENDED, minimal contract)

Keep drawing all 500 (no new draw-range contract), but upload only what was touched and only the attributes that changed:

1. In `update()`, after the loop, replace the blanket three-flag block with a **bounded** upload over the prefix actually written this frame. Because despawns shrink `activeCount` mid-loop, the upper bound must be the **high-water mark of slots touched this frame** = the `activeCount` *at the start of the frame*. Snapshot it before the loop:
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
2. **Flag `size` only when its value changed.** The integration loop *does* write `this.sizes[idx] = p.size` every frame (line 14990), but — as established above — it rewrites an unchanged constant; a slot's size only takes a **new** value in `spawn()` (new top slot) or in the `despawn()` swap-copy (a different particle moved into the freed slot). So set `this._sizesDirty = true` in `spawn()`/`despawn()`, and in `update()` flag `size.needsUpdate` (bounded the same way) **only if** `this._sizesDirty`, then clear it. On the common frame (particles in flight, none spawned/despawned) the GPU copy is already byte-identical, so the 2 KB `size` upload is skipped entirely. (The line-14990 loop write may be left as-is — it is redundant but harmless and out of scope for this change.)
3. **`spawn()` (needsUpdate flags at lines 14937–14939)** keeps flagging `position`/`color` for immediate visibility, but should likewise use a bounded range covering its new top slot rather than a full re-flag, and set `_sizesDirty`. **Mind the off-by-one:** in the current `spawn()` the `needsUpdate` flags fire at lines **14937–14939**, *before* `this.activeCount++` at line **14942**, and the new particle occupies `index === activeCount` (the pre-increment value). So a literal `addUpdateRange(0, activeCount × itemSize)` taken at the existing flag site would cover `[0, activeCount)` and **exclude the just-written top slot** — the new particle would not upload. Use the post-increment count: either move the flag/range below line 14942, or write `addUpdateRange(0, (idx + 1) × itemSize)` using the slot index `idx` already in scope (line 14926). This matters because a `spawn()` that fires *after* `update()` within a frame relies solely on `spawn()`'s own range for that frame's upload.
4. Optionally `attr.setUsage(THREE.DynamicDrawUsage)` once at `init()` (lines 14835–14837) so the three per-frame buffers carry the correct usage hint. Low-confidence micro-win; harmless.

**Why A is the proportionate pick:** removes the cost the task names (full-array re-upload) with **no new rendering contract** — the ghost trap never arises because all 500 are still drawn *and* the high-water-mark range re-uploads the just-hidden slot's transparent data. Self-contained, one method.

> **Bonus — Option A also fixes a latent ghost bug in the *current* code.** Today's `update()` gates the whole upload behind `if (this.activeCount > 0)` (line 14994). On a frame where the **last** active particle(s) despawn, `activeCount` reaches **0**, so the just-written hidden-slot data (`y = -1000`, `alpha = 0`) is **never uploaded** — and stays un-uploaded every subsequent idle frame until the next `spawn()` re-flags a full upload. The result is a lingering ghost of the final particle (faint for `fadeOut: true`, **fully opaque** for `fadeOut: false` particles). Option A's guard is `if (touched > 0)` with `touched = startCount` (the *start-of-frame* `activeCount`), which is `> 0` precisely on the frame everything despawned — so the hidden slots are uploaded and the ghost is cleared immediately. This is not merely an optimization side effect: Option A's "keep drawing all 500, no ghost" correctness argument **depends** on this `touched`-based guard replacing the old `activeCount`-based one. Implementers must use `touched > 0`, **not** `this.activeCount > 0`, for the gate.

### Option B — also `setDrawRange(0, activeCount)` (thorough, but adds a contract)

Additionally cap drawn vertices to the active prefix, cutting vertex-shader invocations 500 → `activeCount` and neutralizing the ghost trap. **But** this introduces a contract that must hold at **every** render: `drawRange.count` must equal `activeCount`, maintained across **both** `update()` *and* `spawn()`. `spawn()` fires mid-frame from input/physics (`spawnBlockBreak`, `spawnWaterEntrySplash`) and currently only flips `needsUpdate`; if it does not also extend the draw range, a particle spawned after that frame's `update()` **vanishes for a frame**. The extra win (vertex shading of ≤500 cheap points) is tiny, the regression surface larger. **Not recommended for a low-priority item** — listed for completeness.

### Ripples — no change recommended

`updateWaterRipples()` (lines 15957–15980) mutates each live ripple's `scale` and rewrites `material.opacity` every frame. A *living* ripple expands and fades **every frame by definition**, so both writes are intrinsic — there is no "nothing moved" frame to skip. With ≤20 of them: `opacity` is a free per-frame **uniform** write (no `needsUpdate`, no recompile), and `scale.set` is one matrix compose per ripple. There is **no meaningfully skippable work**; touching it would add risk for no gain. Documented only because the originating note named it.

## Part A savings (honest framing)

- **Upload bytes:** from a fixed **~16 KB/frame** (when ≥1 active) down to **~itemBytes × activeCount**, plus skipping the 2 KB `size` upload on non-spawn frames. At a few-to-dozens of active particles, a large *proportional* cut of a *small, intermittent* cost. **At idle (no active particles) the cost is already zero** — the block does nothing when `activeCount === 0`.
- **What it does NOT do:** does not reduce the 500/20 caps, does not touch geometry VRAM, does not raise the steady-state ceiling. Defensible claim: "a proportional reduction of an intermittent ~16 KB/frame upload during active effects."

---

# Part B — Placed-Torch Particle Spawner

## Summary

- **The original observation is partly stale — verify before quoting it.** The code already added a distance cull: `PLACED_TORCH_PARTICLE_RADIUS = 24` (line **43400**) with a squared-distance gate (line **43412**), and torches are grouped per chunk in the `chunkTorches` Map (`Map<"cx,cz", torchModel[]>`). So it is **not** "loops over every torch to *spawn*" — particles only spawn for torches within 24 blocks. What remains true and removable:
  - **Cost A — outer iteration is still O(all torch-chunks).** The loop is `for (const [chunkKey, torches] of chunkTorches)` (line **43404**), so every chunk holding any torch is visited and every torch gets a 3D distance computation **every frame**, regardless of distance.
  - **Cost B — a per-frame string allocation per *nearby* torch.** Inside the radius gate, `` const torchKey = `${torchPos.x},${torchPos.y},${torchPos.z}` `` (line **43413**) builds a new string **every frame for every torch within 24 blocks**, purely to index the `placedTorchLastSmoke`/`placedTorchLastFlame` timing Maps. A steady GC trickle whenever the player stands near any lit area (a base, a mineshaft, a torch-lined corridor), independent of the world's total torch count.
- **Two separable wins, different value profiles:**
  - **Cost B is the universal, highest-confidence win.** The allocation recurs every frame for every near torch even in a "few torches" world. Caching the key (or storing the timers on the torch object) removes the allocation, the two side Maps, **and** the flawed cleanup block (below) outright.
  - **Cost A (the "O(all)→O(nearby)" restriction) is a guard for the many-torch / large-base case.** In a sparse world it is roughly *neutral* — iterating a handful of `chunkTorches` entries is already cheap, and a fixed 5×5 chunk window could even be marginally *more* Map lookups. Its real payoff is bounding the pathological case (a player who has torched a wide area). Ship it, but scoped honestly as a ceiling, not a typical-case speedup.
- **A latent correctness wart removed for free.** The cleanup block (lines **43438–43444**) fires only when **`placedTorchLastSmoke.size > 100`** (gated on the smoke Map alone, not "either Map"), and then deletes the **oldest-inserted** entries down to the newest 50 — i.e. it removes `size − 50` keys (51 at `size === 101`), keyed off `placedTorchLastSmoke.keys()` and applied to *both* Maps. Insertion order ≠ distance, so it can delete the timing entry of a torch the player is *currently standing next to* — that torch then immediately re-passes both spawn gates next frame (its `.get()` returns `0`), producing a tiny double-puff. With the key cached on the torch object the Maps disappear and this block goes with them.
- **Recommended fix:** **Phase 1 (Cost B, do first):** store the smoke/flame timing on the torch model object (`torch.userData`) instead of in position-keyed Maps. **Phase 2 (Cost A, separable):** restrict the outer loop to a chunk window around the player.

## Current code (verified against source)

### The placed-torch spawner — `updateVisualEffects()` (lines 43396–43445)

```js
if (particleSystem && controls && SETTINGS.torchParticlesEnabled) {
    const playerPos = getPlayerWorldPosition();
    const smokeInterval = getTorchSmokeInterval();
    const flameInterval = getTorchFlameInterval();
    const PLACED_TORCH_PARTICLE_RADIUS = 24;
    const radiusSq = PLACED_TORCH_PARTICLE_RADIUS * PLACED_TORCH_PARTICLE_RADIUS;

    for (const [chunkKey, torches] of chunkTorches) {          // <-- Cost A: visits ALL torch-chunks
        for (const torch of torches) {
            const torchPos = torch.position;
            const dx = torchPos.x - playerPos.x;
            const dy = torchPos.y - playerPos.y;
            const dz = torchPos.z - playerPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < radiusSq) {
                const torchKey = `${torchPos.x},${torchPos.y},${torchPos.z}`;  // <-- Cost B: per-frame alloc
                const smokeY = torchPos.y + 0.5;
                const flameY = torchPos.y + 0.45;

                const lastSmokeTime = placedTorchLastSmoke.get(torchKey) || 0;
                if (time - lastSmokeTime > smokeInterval) {
                    placedTorchLastSmoke.set(torchKey, time);
                    particleSystem.spawnTorchEmber(torchPos.x, smokeY, torchPos.z);
                }
                const lastFlameTime = placedTorchLastFlame.get(torchKey) || 0;
                if (time - lastFlameTime > flameInterval) {
                    placedTorchLastFlame.set(torchKey, time);
                    const flameCount = 2 + Math.floor(Math.random() * 2);
                    for (let i = 0; i < flameCount; i++) {
                        particleSystem.spawnTorchFlame(torchPos.x, flameY, torchPos.z);
                    }
                }
            }
        }
    }

    if (placedTorchLastSmoke.size > 100) {                     // <-- evicts by INSERTION order, not distance
        const keys = Array.from(placedTorchLastSmoke.keys());  // <-- allocates a keys array on overflow
        for (let i = 0; i < keys.length - 50; i++) {
            placedTorchLastSmoke.delete(keys[i]);
            placedTorchLastFlame.delete(keys[i]);
        }
    }
}
```

### Supporting facts (grepped, not assumed)

- **`updateVisualEffects(time, dt)` runs every frame, ungated** — called unconditionally from the animate loop at line **44399**. So this loop executes on every rendered frame.
- **`chunkTorches`** (line **13328**) is `Map<chunkKey, torchModel[]>`, `chunkKey = "cx,cz"` (`getChunkKey`, line **18453**, returns `cx + ',' + cz`). Entries written only when a chunk has ≥1 torch (line **41879**, guarded by `torchArray.length > 0` at line **41878**), cleared on unload via `releaseChunkTorches`. So the Map holds **only torch-bearing, currently-loaded** chunks — Cost A's loop is over torch-chunks, not all chunks.
- **Torch models** are `THREE.Group`s from `createWorldTorch(wx, wy, wz)` (line **40289**) with `.position` set to integer world coords; a torch in chunk `(cx,cz)` has `.position.x ∈ [cx*16, cx*16+15]` (`wx = startX + x`, `startX = cx*16`), so `floor(torch.position.x / 16) === cx` — which is why the Phase 2 window's `floor(playerPos/16)` keys line up with the stored `getChunkKey(cx,cz)`. They are **recreated** on chunk re-mesh (`releaseChunkTorches(cKey)` at line **41840**, then rebuild + `createWorldTorch` at line **41870**) — matters for where timing state should live (see *Correctness*).
- **`placedTorchLastSmoke`/`placedTorchLastFlame`** (lines **43264–43265**) are the only consumers of `torchKey` — grep confirms all references are inside this one block. So they can be removed entirely if timing moves onto the torch object.
- **`getPlayerWorldPosition()`** (line **11728**) returns a live `THREE.Vector3` with `.x/.y/.z`.

## Proposed fix — phased

### Phase 1 (Cost B — the universal win; recommended first)

Move the per-torch timing onto the torch model object and drop the position-keyed Maps + cleanup block:

```js
for (const [chunkKey, torches] of chunkTorches) {
    for (const torch of torches) {
        const torchPos = torch.position;
        const dx = torchPos.x - playerPos.x;
        const dy = torchPos.y - playerPos.y;
        const dz = torchPos.z - playerPos.z;
        if (dx * dx + dy * dy + dz * dz >= radiusSq) continue;

        const smokeY = torchPos.y + 0.5;
        const flameY = torchPos.y + 0.45;

        if (time - (torch._lastSmokeTime || 0) > smokeInterval) {
            torch._lastSmokeTime = time;
            particleSystem.spawnTorchEmber(torchPos.x, smokeY, torchPos.z);
        }
        if (time - (torch._lastFlameTime || 0) > flameInterval) {
            torch._lastFlameTime = time;
            const flameCount = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < flameCount; i++) {
                particleSystem.spawnTorchFlame(torchPos.x, flameY, torchPos.z);
            }
        }
    }
}
// (cleanup block deleted — no Maps to bound)
```

Then **delete** the two Map declarations (`placedTorchLastSmoke`/`placedTorchLastFlame`, lines **43264–43265**) and the cleanup block (lines **43438–43444**). Result: **zero allocations** in this path per frame, the buggy insertion-order eviction gone.

**The one behavioral delta to disclose (minor, benign):** the current Maps are keyed by world *position*, so a torch's spawn phase **survives a chunk re-mesh** (the new model re-derives the same key, reads the old timer). With per-object timers, a re-mesh creates a fresh model whose `_lastSmokeTime`/`_lastFlameTime` are `undefined → 0`, so the just-rebuilt torch emits one smoke + one flame burst on its first post-remesh frame — a single sub-frame double-puff at a re-mesh boundary, visually lost in the remesh itself. If even that is unwanted, the **conservative variant** caches the key once on the torch (`torch.userData.pKey ??= torchPos.x + ',' + torchPos.y + ',' + torchPos.z;` at creation, reused each frame) — removes the per-frame allocation while preserving exact cross-remesh continuity, at the cost of keeping the two Maps and their cleanup. Recommend the per-object form unless the double-puff is observed to matter.

### Phase 2 (Cost A — separable; a ceiling, not a typical-case speedup)

Restrict the outer iteration to a chunk window centered on the player. Radius 24 over a 16-block chunk reaches at most `Math.ceil(24 / 16) = 2` chunks per axis (a 5×5 = 25-cell window), so no in-radius torch is missed:

```js
const chunkSize = WORLD_DIMS.chunkSize; // 16
const pcx = Math.floor(playerPos.x / chunkSize);
const pcz = Math.floor(playerPos.z / chunkSize);
const cr = Math.ceil(PLACED_TORCH_PARTICLE_RADIUS / chunkSize); // 2 → 5x5 window
for (let dcz = -cr; dcz <= cr; dcz++) {
    for (let dcx = -cr; dcx <= cr; dcx++) {
        const torches = chunkTorches.get((pcx + dcx) + ',' + (pcz + dcz));
        if (!torches) continue;            // most window cells have no torches
        for (const torch of torches) {
            // ... identical per-torch body from Phase 1 (3D distSq gate stays — culls Y + exact radius) ...
        }
    }
}
```

**Why the window math is safe:** the window culls in **XZ only** (chunk columns are full-height, 320 blocks). A torch directly above/below the player in a near chunk is still visited and rejected by the unchanged 3D `distSq < radiusSq` test, which handles the Y term and the exact circular radius. Build keys inline as `cx + ',' + cz` (matching `getChunkKey`'s format) to avoid any scope question about the `getChunkKey` binding.

**Honest scoping:** in a sparse world (`chunkTorches.size` small) this is ~neutral or marginally costlier (up to 25 `Map.get` calls vs. iterating a few entries). Its value is the ceiling it imposes when a player has torched a wide area: a 60-entry `chunkTorches` scanned every frame collapses to ≤25 lookups, most returning `undefined`. If desired, gate it (`if (chunkTorches.size > 25) { window } else { iterate all }`) for the best of both — but plain window iteration is the cleaner default.

## Part B correctness / parity

- **Particle output is byte-for-byte identical** in the dominant case. The spawn-gate arithmetic (`time - last > interval`), spawn positions (`smokeY`/`flameY`), the `flameCount = 2 + floor(random()*2)` burst, and the radius test are all unchanged. Only *where the "last spawn time" is stored* and *which torches are iterated* change.
- **No torch is dropped by Phase 2.** `cr = ceil(radius/chunkSize)` provably covers every chunk any in-radius torch can occupy; the precise 3D gate inside is unchanged.
- **Phase 1's only divergence** is the post-remesh single double-puff above — a transient that self-corrects on the next interval. The conservative cached-key variant has *zero* behavioral divergence.
- **`SETTINGS.torchParticlesEnabled` and the held-torch viewmodel path are untouched** — this part changes only the placed-torch block (43300–43350); the held/viewmodel torch spawner (43279–43296) is a separate path and is not modified.

---

## Combined safety checks

- **Single-file rule:** all edits confined to `voxEx.html` — Part A: `ParticleSystem.update()/spawn()/despawn()/init()`; Part B: the one placed-torch block in `updateVisualEffects()` plus deletion of two Map declarations (Phase 1). No new files/assets.
- **No duplicate/shadowed identifiers:** Part A's new names are instance fields (`this._sizesDirty`) and locals (`startCount`, `touched`); Part B's Phase 1 introduces no module-scope names (it *removes* `placedTorchLastSmoke`/`placedTorchLastFlame`) — `_lastSmokeTime`/`_lastFlameTime` are new properties on the existing torch model object; Phase 2's `pcx`/`pcz`/`cr`/`dcx`/`dcz`/`chunkSize` are block-scoped inside the existing `if`. Grep `_sizesDirty` and confirm no collisions before editing. No globals (`scene`, `SETTINGS`, `particleSystem`, `chunkTorches`, `WORLD_DIMS`, geometry pool) reshadowed.
- **No DOM/settings wiring:** no new settings, DOM IDs, or save/load fields; `SETTINGS.torchParticlesEnabled` semantics unchanged; nothing to round-trip; no `SETTINGS_VERSION` bump.
- **Hot-path discipline:** both parts **replace** per-frame work with strictly less — Part A: bounded re-uploads + one skipped attribute (O(1) snapshot/flag around the existing single update loop); Part B: removes a per-near-torch string allocation and (Phase 2) the all-torch scan. Phase 2 keeps the nesting at **two** loops (chunk window × torches-in-cell), within the "≤2 nested loops in per-frame code" rule. No new allocations added to any path.
- **Packing / ghost correctness (Part A Option A):** the upload range upper bound is the **start-of-frame** `activeCount` (high-water mark), so every slot a despawn may have hidden is re-uploaded transparent — **no ghost**, even though all 500 are still drawn. (Option B instead relies on `setDrawRange` clipping the tail and must maintain the draw-range contract on every spawn — why it is not recommended.)
- **Worker parity:** none — `ParticleSystem`, `updateVisualEffects`, `chunkTorches`, and the particle system are all main-thread-only. No `buildChunkWorkerCode()` change.
- **Ripples:** untouched by recommendation.

## Combined test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204–214 tests; serve over localhost; on this headless box drive installed Chrome via puppeteer-core/SwiftShader — expect `214/214 ... All green!`). No particle/torch-specific tests today, so this mainly guards against collateral breakage in surrounding systems.
- **Part A visual — the load-bearing check:** in-game, exercise every spawn path and confirm **no ghost / no missing-frame** particles:
  - **Block break** (mine blocks rapidly — high spawn/despawn churn, exercises swap-remove + high-water-mark range).
  - **Footstep dust**, **torch embers/smoke** (steady low-count streams — bounded prefix at small `activeCount`).
  - **Water entry splash + swim/wading wake** (bursts — `spawn()` mid-frame visibility).
  - Confirm a despawning particle disappears cleanly (no lingering ghost) and a just-spawned particle is visible the **same** frame. Verify correct rendering near the 500 cap (a big block-break burst).
- **Part B visual parity:** place a **cluster of torches** (a small lit room / torch-lined corridor) and stand inside it. Confirm flame + smoke density, rate, and positions look identical before/after, with `SETTINGS.torchParticlesEnabled` both on and off. Walk in/out of the 24-block radius and confirm particles start/stop at the same distance.
- **GC / allocation check (validates Part A and Part B Cost B):** with effects/torches in view, DevTools → Performance, record ~10 s, and confirm the per-frame minor-GC sawtooth from these paths is gone (no `${...}` string churn from the torch loop, no full-array re-upload from particles). A Memory → Allocation-instrumentation timeline over the same scene shows the allocations removed.
- **Many-torch ceiling (validates Part B Cost A):** torch a wide area so `chunkTorches.size` is large (check via console), then profile a stationary frame — confirm the placed-torch loop time no longer scales with total torch count (only with torches in the 5×5 window).
- **Remesh double-puff (validates the Part B Phase-1 disclosure):** stand next to a placed torch and trigger a re-mesh of its chunk (place/break an adjacent block); confirm at most a single, visually-negligible extra puff and no sustained cadence change. If the conservative cached-key variant is chosen, confirm *no* extra puff.
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`).

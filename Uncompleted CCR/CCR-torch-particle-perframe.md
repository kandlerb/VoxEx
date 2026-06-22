# CCR — Placed-Torch Particle Loop: Per-Frame String Allocation + All-Torch Iteration

**ID:** VOXEX-CCR-PERF-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** 🟡 **Proposal / report only — no code applied yet.** Read & debate first.
**Scope:** Remove two per-frame costs from the **placed-torch** flame/smoke spawner inside `updateVisualEffects()` (~line 43300): (1) a fresh template-string key (`` `${x},${y},${z}` ``) allocated **per nearby torch, every frame**, and (2) an outer loop that visits **every torch-bearing chunk** in the world before distance-culling. No change to particle cadence, appearance, count, spawn positions, or any other system. CPU/GC only — touches neither VRAM nor the worker.

> **Line numbers are as of the working tree on 2026-06-22 and WILL drift** — grep the quoted identifier/string before editing, per repo convention.

---

## Summary

- **The original observation is partly stale — verify before quoting it.** The code already added a distance cull: `PLACED_TORCH_PARTICLE_RADIUS = 24` (line **43305**) with a squared-distance gate (line **43317**), and torches are already grouped per chunk in the `chunkTorches` Map (`Map<"cx,cz", torchModel[]>`). So it is **not** "loops over every torch to *spawn*" — particles are only spawned for torches within 24 blocks. What remains true and removable:
  - **Cost A — outer iteration is still O(all torch-chunks).** The loop is `for (const [chunkKey, torches] of chunkTorches)` (line **43309**), so every chunk that holds any torch is visited and every one of its torches gets a 3D distance computation **every frame**, regardless of how far that chunk is from the player.
  - **Cost B — a per-frame string allocation per *nearby* torch.** Inside the radius gate, `` const torchKey = `${torchPos.x},${torchPos.y},${torchPos.z}` `` (line **43318**) builds a new string **every frame for every torch within 24 blocks**, purely to index the `placedTorchLastSmoke` / `placedTorchLastFlame` timing Maps. This is a steady GC trickle whenever the player stands near any lit area (a base, a mineshaft, a torch-lined corridor), independent of the world's total torch count.
- **Two separable wins, different value profiles (be honest about which is which):**
  - **Cost B is the universal, highest-confidence win.** The allocation recurs every frame for every near torch even in a "few torches" world — the moment the player is next to a cluster, it is paying N strings/frame for nothing. Caching the key (or storing the timers on the torch object) removes the allocation, the two side Maps, **and** the flawed cleanup block (below) outright.
  - **Cost A (the "O(all)→O(nearby)" restriction) is a guard for the many-torch / large-base case.** In the typical sparse world it is roughly *neutral* — iterating a handful of `chunkTorches` entries is already cheap, and a fixed 5×5 chunk window could even be marginally *more* Map lookups than there are torch-chunks. Its real payoff is bounding the pathological case (a player who has torched a wide area, so `chunkTorches` holds dozens of entries spread across the map): there it converts an unbounded per-frame scan into a constant ~25-cell window. Recommend shipping it, but scoped honestly as a ceiling, not a typical-case speedup.
- **A latent correctness wart removed for free.** The cleanup block (lines **43342–43349**) evicts the **oldest-inserted 50** keys when either Map exceeds 100. Insertion order ≠ distance, so it can delete the timing entry of a torch the player is *currently standing next to* — that torch then immediately re-passes both spawn gates next frame (its `.get()` returns `0`), producing a tiny double-puff. With the key cached on the torch object the Maps disappear and this whole block goes with them.
- **Recommended fix:** **Phase 1 (Cost B, do first):** store the smoke/flame timing on the torch model object (`torch.userData`) instead of in position-keyed Maps, eliminating the per-frame string and the cleanup block. **Phase 2 (Cost A, separable):** restrict the outer loop to a chunk window around the player (`cx ± ceil(radius/chunkSize)`), keeping the exact 3D `distSq` gate inside it.

---

## Current code (verified against source)

### The placed-torch spawner — `updateVisualEffects()` (lines 43300–43350)

```js
// Spawn smoke and flame particles for placed torches (nearby only for performance)
if (particleSystem && controls && SETTINGS.torchParticlesEnabled) {
    const playerPos = getPlayerWorldPosition();
    const smokeInterval = getTorchSmokeInterval();
    const flameInterval = getTorchFlameInterval();
    const PLACED_TORCH_PARTICLE_RADIUS = 24; // Only spawn particles for torches within this radius
    const radiusSq = PLACED_TORCH_PARTICLE_RADIUS * PLACED_TORCH_PARTICLE_RADIUS;

    // Iterate over nearby chunks and their torches
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

    // Clean up old entries from torches that are no longer nearby
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

- **`updateVisualEffects(time, dt)` runs every frame, ungated.** Called unconditionally from the animate loop at line **44304** (`updateVisualEffects(time, clampedDt)`); there is no frame-skip wrapper around it. So this loop executes on every rendered frame.
- **`chunkTorches`** (declared line **13309**) is `Map<chunkKey, torchModel[]>` where `chunkKey = "cx,cz"` (`getChunkKey`, line **18420**: `return cx + ',' + cz;`). Entries are written only when a chunk has ≥1 torch (line **41784**, guarded by `torchArray.length > 0`), and cleared on unload via `releaseChunkTorches`. So the Map already contains **only torch-bearing, currently-loaded** chunks — Cost A's loop is over torch-chunks, not all chunks.
- **Torch models** are `THREE.Group`s from `createWorldTorch(wx, wy, wz)` (line **41775**) with `.position` set to integer world coords. They are **recreated** on chunk re-mesh (`releaseChunkTorches(cKey)` then rebuild, lines **41745**/41775), which matters for where timing state should live (see *Correctness*).
- **`placedTorchLastSmoke` / `placedTorchLastFlame`** (lines **43169–43170**) are the only consumers of `torchKey`. Nothing else reads them — grep confirms all references are inside this one block (43323–43347). So they can be removed entirely if the timing moves onto the torch object.
- **`getPlayerWorldPosition()`** (line **11709**) returns a live `THREE.Vector3` (`cameraRig.position` / controls object position) with `.x/.y/.z`.

---

## Proposed fix — phased

### Phase 1 (Cost B — the universal win; recommended first)

Move the per-torch timing onto the torch model object and drop the position-keyed Maps + cleanup block. The torch is already the natural owner of its own spawn cadence.

```js
for (const [chunkKey, torches] of chunkTorches) {
    for (const torch of torches) {
        const torchPos = torch.position;
        const dx = torchPos.x - playerPos.x;
        const dy = torchPos.y - playerPos.y;
        const dz = torchPos.z - playerPos.z;
        if (dx * dx + dy * dy + dz * dz >= radiusSq) continue;

        // Per-torch timing lives on the model (no string key, no side Maps).
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

Then **delete** lines 43169–43170 (`placedTorchLastSmoke`/`placedTorchLastFlame` declarations) and the cleanup block (43342–43349). Result: **zero allocations** in this path per frame, the buggy insertion-order eviction gone.

**The one behavioral delta to disclose (minor, benign):** the current Maps are keyed by world *position*, so a torch's spawn phase **survives a chunk re-mesh** (the new model re-derives the same key and reads the old timer). With per-object timers, a re-mesh creates a fresh model whose `_lastSmokeTime`/`_lastFlameTime` are `undefined → 0`, so the just-rebuilt torch emits one smoke + one flame burst on its first post-remesh frame. This is a single sub-frame double-puff at a re-mesh boundary — visually lost in the remesh itself, and re-meshes near the player are already infrequent. If even that is unwanted, the **conservative variant** keeps the Maps but caches the key once on the torch (`torch.userData.pKey ??= torchPos.x + ',' + torchPos.y + ',' + torchPos.z;` at creation, reused each frame) — this removes the per-frame allocation while preserving exact cross-remesh timing continuity, at the cost of keeping the two Maps and their cleanup. Recommend the per-object form (simpler, removes more) unless the double-puff is observed to matter.

### Phase 2 (Cost A — separable; a ceiling, not a typical-case speedup)

Restrict the outer iteration to a chunk window centered on the player, so the loop is `O(nearby torch-chunks)` instead of `O(all torch-chunks)`. Radius 24 over a 16-block chunk reaches at most `Math.ceil(24 / 16) = 2` chunks in each axis (a 5×5 = 25-cell window), so no in-radius torch can be missed.

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

**Why the window math is safe:** the window culls in **XZ only** (chunk columns are full-height, 320 blocks). A torch directly above/below the player in a near chunk is still visited and then rejected by the unchanged 3D `distSq < radiusSq` test, which handles the Y term and the exact circular radius. Build keys inline as `cx + ',' + cz` (matching `getChunkKey`'s format exactly) to avoid any question about whether the `getChunkKey` binding is in scope at this call site — both produce identical strings.

**Honest scoping:** in a sparse world (`chunkTorches.size` small, the documented common case) this is ~neutral or marginally costlier (up to 25 `Map.get` calls vs. iterating a few entries). Its value is the ceiling it imposes when a player has torched a wide area: a 60-entry `chunkTorches` scanned every frame collapses to ≤25 lookups, most returning `undefined` immediately. If desired, gate it (`if (chunkTorches.size > 25) { window } else { iterate all }`) to take the best of both — but that adds a branch and two code paths for a cost that is small either way; plain window iteration is the cleaner default.

---

## Correctness / parity

- **Particle output is byte-for-byte identical** in the dominant case. The spawn-gate arithmetic (`time - last > interval`), the spawn positions (`smokeY`/`flameY` offsets), the `flameCount = 2 + floor(random()*2)` burst, and the radius test are all unchanged. Only *where the "last spawn time" is stored* and *which torches are iterated* change.
- **No torch is dropped by Phase 2.** `cr = ceil(radius/chunkSize)` provably covers every chunk any in-radius torch can occupy (worst-case alignment lands the reachable XZ span within `cx-2..cx+2`); the precise 3D gate inside is unchanged, so the set of torches that actually spawn is identical to today's.
- **Phase 1's only divergence** is the post-remesh single double-puff described above — a transient that self-corrects on the next interval and is dominated by the remesh it rides on. The conservative cached-key variant has *zero* behavioral divergence.
- **`SETTINGS.torchParticlesEnabled` and the held-torch viewmodel path are untouched** — this CCR changes only the placed-torch block (43300–43350); the held/viewmodel torch spawner above it (43279–43296) is a separate path and is not modified.

---

## Why this was deprioritized (carried from the originating note)

It is a **CPU/GC cost, not VRAM**, and is **bounded in practice** — typical worlds have few placed torches, so Cost A's all-torch scan is already cheap and Cost B's allocation is small in absolute terms. It does **not** touch the constraint that actually limits the target hardware (the NVIDIA Quadro P1000's **4 GB VRAM**, where `MemoryBudgetManager` and chunk geometry are the binding resources — see `CCR-chunk-geometry-vram.md`, VOXEX-CCR-VRAM-001). This CCR is a correctness-and-cleanliness win (removes a per-frame allocation and a latent eviction bug) with a modest, situational CPU benefit; it is not on the critical path for the hardware target and should sequence behind the VRAM and edge-lighting CCRs.

---

## Safety checks

- **Single-file rule:** all edits confined to `voxEx.html` — the one placed-torch block in `updateVisualEffects()`, plus deletion of two Map declarations (Phase 1). No new files or assets.
- **No duplicate/shadowed identifiers:** Phase 1 introduces no module-scope names (it *removes* `placedTorchLastSmoke`/`placedTorchLastFlame`); `_lastSmokeTime`/`_lastFlameTime` are new properties on the existing torch model object, not new bindings. Phase 2's `pcx`/`pcz`/`cr`/`dcx`/`dcz`/`chunkSize` are block-scoped `const`/`let` inside the existing `if`; grep confirms none collide with an outer binding in that scope. No globals (`scene`, `SETTINGS`, `chunkTorches`, `WORLD_DIMS`) reshadowed.
- **No DOM/settings wiring:** no new settings, DOM IDs, or save/load fields; `SETTINGS.torchParticlesEnabled` semantics unchanged; nothing to round-trip.
- **Hot-path discipline:** the change **removes** work from the per-frame path (one string allocation per near torch, and — Phase 2 — the all-torch scan). Phase 2 keeps the nesting at **two** loops (chunk window × torches-in-cell), within the "≤2 nested loops in per-frame code" rule. No new allocations are added to any path.
- **Worker parity:** none required — `updateVisualEffects`, `chunkTorches`, and the particle system are main-thread-only. No `buildChunkWorkerCode()` change.

## Test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204 tests; serve over localhost — on this headless box drive installed Chrome via the memory note's puppeteer-core/SwiftShader recipe; expect the documented `214/214 ... All green!`). This block isn't directly unit-tested, so the suite is a no-regression guard on the surrounding systems.
- **Visual parity:** place a **cluster of torches** (a small lit room / torch-lined corridor) and stand inside it. Confirm flame + smoke particle density, rate, and positions look identical before/after, with `SETTINGS.torchParticlesEnabled` both on and off. Walk in and out of the 24-block radius and confirm particles start/stop at the same distance as the current build.
- **GC / allocation check (validates Cost B):** with the torch cluster in view, open DevTools → Performance, record ~10 s standing still, and confirm the per-frame minor-GC sawtooth from this path is gone (no `${...}` string churn). Before/after a Memory → Allocation-instrumentation timeline over the same scene shows the string allocations removed.
- **Many-torch ceiling (validates Cost A):** torch a wide area so `chunkTorches.size` is large (check via console), then profile a stationary frame — confirm the placed-torch loop time no longer scales with total torch count (only with torches in the 5×5 window).
- **Remesh double-puff (validates the Phase-1 disclosure):** stand next to a placed torch and trigger a re-mesh of its chunk (place/break an adjacent block); confirm at most a single, visually-negligible extra puff and no sustained change in cadence. If the conservative cached-key variant is chosen instead, confirm *no* extra puff.
- **Build banner:** on implementation, bump `VOXEX_BUILD` + add a `VOXEX_RECENT_CHANGES` line (top of `voxEx.html`).

# CCR — updateStreaming: Math.sqrt in Loop → DEAD CODE, delete it

**ID:** VOXEX-CCR-PERF-016
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #548
**Scope:** `VoxelWorld.updateStreaming()` was flagged for a `Math.sqrt` in a nested loop. Audit resolves it: the method is **dead code** — never called by the live game. Fix = delete it (tombstone comment), not a perf rewrite.

> Line numbers are as of build `2026-06-24.x` and **WILL DRIFT** — grep `updateStreaming(playerPosition, renderDistance)` (~7618).

---

## Audit findings (verified against source)

- **Reachability: DEAD.** The only occurrence of `updateStreaming(` in `voxEx.html` is the definition at ~7618. There are zero call sites (grep across the repo finds only the definition + tracker/CCR docs). The live streaming path uses the module-level `ensureChunk` (~43295) + `scheduleChunkUpdate`, not `VoxelWorld.updateStreaming`.
- **Cross-confirmed** by the project's own triage docs: `CCR-issue-tracker-cleanup.md` (#548 entry), `VoxEx_Issue_Cleanup_Report.md`, and `VoxEx_Issue_Validation.md` all independently state `VoxelWorld.updateStreaming` is not called by the live game.
- **Note on the loop shape (draft said "O(n²)"):** it is a `(2r+1)²` grid scan over `dx,dz` with ONE `Math.sqrt` per cell (line ~7628), and its result (`neededChunks`) IS consumed locally to drive load/unload — i.e. if it WERE live, the squared-distance fix would apply. But it is dead, so the loop is moot.
- **Scope guard:** the cross-referenced `VoxelWorld` methods in #551/#556/#559 are SEPARATE issues. This CCR deletes ONLY `updateStreaming` (and its JSDoc). Do not remove the others here.

---

### #548 — Delete dead `VoxelWorld.updateStreaming`

**Location:** `VoxelWorld.updateStreaming` — line ~7618 (grep: `updateStreaming(playerPosition, renderDistance)`); includes its JSDoc block (~7612–7617).
**Why:** Method is never called by the live game (streaming uses module-level `ensureChunk`/`scheduleChunkUpdate`). The `Math.sqrt` "perf issue" doesn't execute.
**Change:** Delete the JSDoc + method (~7612–7652) and replace with a one-line tombstone comment (matching the file's existing dead-code tombstone convention).

**Context:** Confirmed against source — `updateStreaming` has exactly ONE occurrence in `voxEx.html` (the definition at ~7618); zero call sites. What conceptually REPLACES it is the live module-level streaming path: `ensureChunk(x, z)` (~43295) loads/creates chunks around the player, and `scheduleChunkUpdate(cx, cz, ...)` (~18204) queues their (re)mesh. These are the real writers of chunk lifecycle — `VoxelWorld.updateStreaming` was never wired into them. Deleting it is inert.

**Before:** (~7612–7652)
```js
                /**
                 * Update chunk streaming based on player position.
                 * @param {THREE.Vector3} playerPosition - Player position
                 * @param {number} renderDistance - Render distance in chunks
                 * @returns {void}
                 */
                updateStreaming(playerPosition, renderDistance) {
                    const chunkSize = WORLD_DIMS.chunkSize;
                    const playerCX = Math.floor(playerPosition.x / chunkSize);
                    const playerCZ = Math.floor(playerPosition.z / chunkSize);

                    const neededChunks = new Set();

                    // Determine which chunks should be loaded
                    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
                        for (let dz = -renderDistance; dz <= renderDistance; dz++) {
                            const dist = Math.sqrt(dx * dx + dz * dz);
                            if (dist <= renderDistance) {
                                const key = this.getChunkKey(playerCX + dx, playerCZ + dz);
                                neededChunks.add(key);
                            }
                        }
                    }

                    // Unload chunks that are too far
                    for (const key of this.activeChunks) {
                        if (!neededChunks.has(key)) {
                            this.unloadChunk(key);
                        }
                    }

                    // Load new chunks
                    for (const key of neededChunks) {
                        if (!this.activeChunks.has(key)) {
                            const { cx, cz } = this.parseChunkKey(key);
                            this.ensureChunk(cx, cz);
                        }
                    }

                    this.activeChunks = neededChunks;
                }
```
**After:**
```js
                // [TOMBSTONE #548] Removed dead VoxelWorld.updateStreaming() — never called.
                // Live streaming uses module-level ensureChunk()/scheduleChunkUpdate(), not this
                // method. It contained a Math.sqrt-per-cell loop that never executed.
```

**Verify:**
- After deletion, grep `updateStreaming` in `voxEx.html` → only the tombstone comment remains (no callers existed, so nothing breaks).
- Confirm `this.activeChunks` is still maintained by its real writers (`ensureChunk` ~7552, init ~7357, restore ~7395, `unloadChunk` ~7666) — `updateStreaming` was not their dependency.
- `tools/voxex-tests.html` → VoxelWorld/streaming/collision tests stay green.

---

## Safety Checks
- [ ] Reachability confirmed dead (zero call sites in `voxEx.html`; cross-confirmed by triage docs) before deleting.
- [ ] Deleted ONLY `updateStreaming` + its JSDoc; #551/#556/#559 methods untouched.
- [ ] `this.activeChunks` writers/readers unaffected (no other code depended on `updateStreaming`'s output).
- [ ] No change to which chunks stream in/out (method never ran).
- [ ] `tools/voxex-tests.html` green (streaming/VoxelWorld tests).
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

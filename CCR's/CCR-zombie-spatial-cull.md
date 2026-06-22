# CCR — Zombie Proximity Distance Calculation Analysis (No-Change Finding)

**ID:** VOXEX-CCR-PERF-008
**File:** `voxEx.html`
**Date:** 2026-06-22
**Status:** 🟡 Analysis Complete — Recommended Action: Close as Already-Adequate
**GitHub:** #492
**Scope:** Evaluate whether a spatial-hash cull should be added to `updateZombies()` per-mob distance calculation.

---

## Summary

GitHub #492 reports that `updateZombies()` (~line 34303) computes player distance for every mob every frame with no spatial cull, and suggests gating the distance work behind the existing `spatialHash` grid.

**Assessment after code review: the current implementation is already optimal for the constrained mob count. No code change is recommended.**

---

## Current Implementation (verified)

### Per-mob distance calculation (~line 34236)

```js
// mobTmpA is a module-scope scratch THREE.Vector3 — no allocation
mobTmpA.subVectors(playerPos, mob.position);
const distSq = mobTmpA.lengthSq();
```

Key facts:
1. **`mobTmpA` is a scratch vector** — no allocation, no GC pressure. The issue was filed under "no spatial cull," but there is no allocation problem either.
2. **Zombie pool is capped at 10** (`MAX_ZOMBIES = 10`, ~line 34127). Worst-case per-frame cost: 10 × (vector subtract + lengthSq) = ~30 arithmetic ops. This is negligible.
3. **The state machine short-circuits heavily** — most mobs bail early on wander/idle checks before reaching expensive pathfinding logic.
4. **The existing `spatialHash` grid** (lines ~10889–10900) is used for entity-entity proximity (zombie-to-zombie collision avoidance), not player-to-mob distance. Adapting it for a player-to-mob pre-check would cost: `getSpatialKey(x, z)` → string concat → `Map.get` — more overhead than the simple `subVectors + lengthSq` it would replace.

### Why spatial-hash cull would be net negative here

For 10 mobs:
- **Current cost:** 10 × (3 subtracts + 3 squares + 2 adds) ≈ 80 arithmetic ops/frame
- **Spatial-hash cost:** 10 × (2 divisions + 2 floors + string concat + Map lookup) — likely more ops and a Map allocation/lookup on every call
- **Break-even:** spatial-hash pays off at ~50+ entities (hash overhead amortizes). At 10 mobs it adds overhead.

---

## Recommendation

**Close GitHub #492 as "already adequately implemented."**

The filed concern (distance computed for all mobs, no spatial cull) is accurate at the code level, but the analysis underestimates the cost of the proposed fix relative to the existing work at the constrained mob count. The current `subVectors + lengthSq` pattern is already the cheapest possible approach for ≤10 entities.

If the zombie cap is ever raised significantly (e.g., >50), a spatial-hash or culled approach would become worthwhile. That can be a future CCR with the cap change as its prerequisite.

---

## If a Future Change Is Desired

If the zombie cap is raised, the correct fix would be:
- Replace the per-mob full loop with a `getEntitiesNear(playerPos, DESPAWN_RADIUS)` query against the spatial hash
- Update the spatial hash cell size to match the zombie detection radius
- This CCR and its analysis should be referenced as prior art

---

## Safety Checks

- [ ] No code changes in this CCR
- [ ] GitHub #492 closed with reference to this analysis document

# CCR — Player Collision Vertical Gap: Walk-Through of Blocks in the Middle of the Player Box

**ID:** VOXEX-CCR-COLLIDE-001
**File:** `voxEx.html` (single-file rule honored — all changes stay in this file)
**Date:** 2026-06-22
**Status:** **Implemented** 2026-06-22 (build **2026-06-22.3**). The `collide()` loop fix below is applied; 3 TDD tests added to `tools/voxex-tests.html` (the mid-body case was RED before the fix), full headless suite **281/281 green**. `collide`/`checkGround`/`voxelWorld`/`playerEyeHeight` were exposed on the `?test=1` seam (inert in production). Still pending: the **in-browser** manual checks in the Test plan. (Doc was first revised 2026-06-22 after a line-by-line code audit: added the `zombieCollides()` precedent, the placement-path consistency note, a relabeled numeric table, a tightened jump-only repro, and the "stuck inside a block" risk.)
**Scope:** Fix horizontal walk-through of solid blocks that sit inside the player's vertical extent but between the two Y planes that `collide()` samples. No change to swimming, ground-snap, or step behavior intended.

---

## Summary

- **Observed:** Standing on a block, with a clear cell at head height and a solid block one cell higher, the player walks straight through that higher block instead of being stopped.
- **Root cause:** `collide()` (lines **42610–42626**) tests collision at exactly **two** vertical sample planes — `y0` near the feet and `y1` near the eye — and nothing in between. This bakes in an assumption that the player's body never spans more than two block cells. The standing player is **1.8 blocks tall**, so whenever the feet sit at a **fractional** Y the box spans **three** cells and the **middle cell is never tested**. A solid block in that middle cell is walked through. The asymmetry is the whole story — the player box is **0.6 wide but 1.8 tall**: because the width is **less than one block**, any cell the box overlaps in XZ always contains one of the four sampled corners, so the 4-corner XZ sampling is *exact* and needs no change; because the height is **greater than one block**, a cell can lie fully *interior* to the body with neither the feet plane nor the eye plane inside it — so Y, and only Y, must be iterated.
- **Why it looks intermittent / "off by one":** At an exact integer feet height the body spans only two cells and both are tested (no bug). The bug appears the moment feet go fractional — which is the entire airborne arc of every **jump and fall**. The in-game debug overlay also reports `displayY = feetY - 1` (line **29420**), so the Y the player reads off-screen is one less than the true world feet, which is why the reported coordinates ("feet Y:0 / block Y:2") look shifted from the world cells the code actually checks.
- **Recommended fix:** Replace the two fixed samples with a tiny `for` loop over **every** integer cell from `y0` to `y1` inclusive (1–3 iterations, body unrolled across the 4 XZ corners). This tests the whole vertical span and closes the gap. It is exactly the full-span iteration the sibling `zombieCollides()` (line **33229**) already uses, so the fix brings the player collider in line with a pattern the engine already depends on (see *Precedent*). Optional secondary hardening for true head height is listed but not required to fix the report.

---

## Reproduction

Concrete setup (absolute world Y; standing on a surface whose top is at **Y = 64**, so feet = 64, eye ≈ 65.8):

1. Stand on flat ground so feet rest at an integer Y (ground-snap guarantees this) — here **feet = 64**.
2. Place a single floating solid block at cell **y = 66** (two cells above the surface top), leaving cells **65** and **67** empty. Standing, the body spans cells 64–65, so cell 66 is above the eye (65.8): the block does **not** block standing and the head cell (65) is clear.
3. **Jump straight up while drifting forward into the block.** With the default `jumpForce 10` / `gravity 30`, apex ≈ `10²/(2·30)` ≈ **1.67 blocks**, so feet sweep up to ≈ **65.67**.
4. **Expected:** the body is stopped when it overlaps the block at cell 66.
5. **Actual:** while feet are in ≈ **[65.1, 65.67]** (near apex), `collide()` samples cells {65, 67} and skips cell **66** — the player slides horizontally through the block. It never registers as a wall.

**Walking forward on the ground does NOT reproduce it:** at integer feet the body only reaches the eye (65.8), so a block at cell 66 is simply passed *under*, not *through*. The walk-through is exclusive to the airborne (fractional-feet) window — **jumping is the deterministic trigger**. (Fly mode reproduces it even more directly: `collide()` runs in flight too, so you can hold any fractional feet height and move horizontally straight through a mid-body block at will.)

---

## Root cause detail

### The collision sampler — `collide()` (lines 42610–42626)

```js
function collide(p) {
    const r = 0.3;
    // OPTIMIZATION: Pre-compute floor values once instead of repeatedly in loop
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r);
    const z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
    const y0 = Math.floor(p.y - playerEyeHeight + 0.1), y1 = Math.floor(p.y + 0.1);
    // OPTIMIZATION: Unrolled loop - 8 checks, avoids array iteration overhead
    if (isSolidBlock(x0, y0, z0)) return true;
    if (isSolidBlock(x0, y0, z1)) return true;
    if (isSolidBlock(x0, y1, z0)) return true;
    if (isSolidBlock(x0, y1, z1)) return true;
    if (isSolidBlock(x1, y0, z0)) return true;
    if (isSolidBlock(x1, y0, z1)) return true;
    if (isSolidBlock(x1, y1, z0)) return true;
    if (isSolidBlock(x1, y1, z1)) return true;
    return false;
}
```

`p` is the **eye/camera** position (`p.y`). The player's vertical extent is `[feet, eye]` where `feet = p.y - playerEyeHeight` and `playerEyeHeight = 1.8` standing (the `let playerEyeHeight` at line **12602** is initialized from `const PLAYER_EYE_HEIGHT_STAND = 1.8` at line **12601**, and lerped 1.4↔1.8 at lines **43138–43142**).

The function picks **two** Y cells:

- `y0 = floor(feet + 0.1)` — the feet cell. The `+0.1` is an intentional step tolerance so the block the player is *standing on* doesn't count as a horizontal wall.
- `y1 = floor(eye + 0.1)` — the head cell.

It then probes the 4 XZ corners (`r = 0.3` → a 0.6-wide box) at **only those two cells**. The XZ coverage is correct; the **Y coverage is not** — a 1.8-tall AABB can overlap three integer cells, and the third (middle) cell is silently skipped.

`collide()` is the sole solid-collision test for all three axes in the sweep (`applyCollisionStep`, lines **43082–43090**), so the gap affects X, Z, and Y movement alike.

### Numeric proof

Simulating `collide()`'s `[y0, y1]` choice against the true set of cells the AABB `[feet, feet+1.8]` overlaps, swept over feet height:

```
feet  | sampled cells | overlapped cells | MISSED CELL (index, not a count)
0.00  | [0,1]         | [0,1]            | —
0.10  | [0,2]         | [0,1]            | 1
0.30  | [0,2]         | [0,1,2]          | 1
0.50  | [0,2]         | [0,1,2]          | 1
0.80  | [0,2]         | [0,1,2]          | 1
0.90  | [1,2]         | [0,1,2]          | 0
1.00  | [1,2]         | [1,2]            | —
1.10  | [1,3]         | [1,2]            | 2
1.30  | [1,3]         | [1,2,3]          | 2
1.50  | [1,3]         | [1,2,3]          | 2
1.80  | [1,3]         | [1,2,3]          | 2
1.90  | [2,3]         | [1,2,3]          | 1
2.00  | [2,3]         | [2,3]            | —
```

The **MISSED CELL** column is the *cell index* that is overlapped but not sampled — **not a count** (each fractional row misses exactly one cell; the `0` at feet 0.90 is "cell index 0", which would be wrong as a count). Every **integer** feet height (0.00, 1.00, 2.00) tests the full span — no miss. At **fractional** feet exactly one cell is missed, falling into two distinct categories:

- **Interior miss** (rows 0.10–0.80, 1.10–1.80): the missed cell lies strictly *between* the feet and eye planes. **This is the bug** — a solid block there is walked through, and the fix below closes it.
- **Bottom-edge miss** (rows 0.90 → cell 0, 1.90 → cell 1): the missed index is the *lowest* cell, the ≤ 0.1-block sliver below `floor(feet+0.1)` — the existing step/penetration tolerance. The fix **deliberately leaves these untested** (`yBottom` is unchanged), because not blocking on that sliver is what lets the player rest on / step over the block underfoot.

So the narrative "skips one *interior* cell" applies only to the first category; the fix targets exactly those rows and intentionally does **not** touch the bottom-edge rows. Because a jump/fall continuously sweeps feet through fractional values, whichever cell is currently interior gets skipped — so a mid-body block can be passed through somewhere in the airborne window.

### Why the reported coordinates look shifted

The debug overlay prints `displayY = feetY - 1` (lines **29419–29420**), i.e. the index of the block *under* the feet rather than the world feet height. So "feet at Y:0" on-screen corresponds to world feet ≈ **1.0**, eye ≈ **2.8**, where the body spans world cells 1–2–3 during a jump and cell **2** is the one `collide()` skips. The report and the code are describing the same defect through a one-cell display offset.

### Not the cause (checked)

- **Horizontal sampling** — the 4 XZ corners at `r = 0.3` correctly cover the 0.6-wide footprint; not implicated.
- **`checkGround()`** (lines **42627–42639**) — samples a single plane below the feet by design; it governs ground/jump state, not horizontal walls, and is unaffected by this fix.
- **Ground-snap** (lines **43097–43101**) — only snaps when feet are within 0.25 of a boundary; it does not eliminate the fractional-feet window during jumps.

### Precedent — the zombie collider already iterates the full span

The fix is not a new idea; it is the pattern the engine already uses for its **other** collider. `zombieCollides()` (line **33229**) tests every cell the entity overlaps:

```js
const y0 = Math.floor(pos.y);
const y1 = Math.floor(pos.y + h);
for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
            if (isSolidBlock(x, y, z)) return true;
        }
    }
}
```

The player's `collide()` is the **outlier** that samples only two Y planes; `zombieCollides()` has never had the vertical gap. So the fix below brings the player collider in line with a pattern the engine already depends on for zombie movement. (The zombie version brute-forces all overlapped XZ cells with a triple loop; the player fix keeps the cheaper 4-corner XZ sampling — valid because the player box is < 1 block wide. Both iterate Y in full, which is the part that matters.)

---

## Proposed fix

Iterate every cell the vertical span touches instead of just the endpoints. The loop runs 1–3 times (height 1.8 → at most 3 cells), so the cost is at most 12 `isSolidBlock` checks vs. the current 8 — negligible, and only one new loop with an unrolled body.

```js
function collide(p) {
    const r = 0.3;
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r);
    const z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
    // Test EVERY block cell the player's vertical AABB overlaps, not just the
    // feet/eye planes. A 1.8-tall body spans up to three cells at fractional
    // feet heights (every jump/fall); sampling only the endpoints let solid
    // blocks in the middle cell pass through. (+0.1 at the feet is the existing
    // step tolerance for the block being stood on.)
    const yBottom = Math.floor(p.y - playerEyeHeight + 0.1);
    const yTop = Math.floor(p.y + 0.1);
    for (let y = yBottom; y <= yTop; y++) {
        if (isSolidBlock(x0, y, z0)) return true;
        if (isSolidBlock(x1, y, z0)) return true;
        if (isSolidBlock(x0, y, z1)) return true;
        if (isSolidBlock(x1, y, z1)) return true;
    }
    return false;
}
```

This preserves the existing feet step tolerance (`+0.1`) and the existing head plane (`floor(eye + 0.1)`); it only fills in the cells between them.

**Why this is the minimal-risk shape:** the new `yBottom`/`yTop` are *bit-identical* to the old `y0`/`y1`. The loop never widens the Y-envelope — it only inserts the integer cells *between* two cells that were already tested. So at integer feet it visits the exact same two cells, and no pre-existing boundary / step / ground-snap behavior can change; the only new behavior is detecting a block in a previously-skipped interior cell.

**Consistency with block placement (already in the codebase):** the right-click placement path already rejects placing a block that would overlap the player via `playerIntersectsBlock()` (line **7129**), called from `tryPlaceBlock()` (line **44571**) over exactly `feet+0.1 → eye+0.1` — its own comment says it *"matches collide()'s ACTUAL player box."* That path uses the **full** vertical extent, so today the two paths disagree: you cannot *place* a block into a cell that `collide()` would happily let you *walk through*. After this fix they agree on the same volume — and `playerIntersectsBlock` independently confirms the exact box bounds this fix uses.

**Alternative considered and rejected — reuse `playerIntersectsBlock()` per cell.** It is a true AABB test, but driving it over the integer cell range means a triple loop with a `Box3.set` + `intersectsBox` per cell — strictly more work than the 4-corner sampling, for no extra correctness (corner sampling is exact for a < 1-block-wide box). The proposed loop is the better implementation, and matches `zombieCollides()` rather than introducing a third collision style.

### Optional secondary hardening (not required for this bug)

The head plane is derived from the **eye** (1.8) plus the 0.1 epsilon, giving an effective top reach of ~1.9. If the design intent is a "true" 2-block-tall player (head top at 2.0), the top sample undershoots by ~0.1 of a cell at integer feet. If desired, introduce an explicit `PLAYER_HEIGHT` (e.g. 1.8 today) and compute `yTop = Math.floor(feet + PLAYER_HEIGHT)` so head clearance is a named, tunable value rather than implied by eye height. This is a **gameplay-feel** change (affects which 1-high gaps you can squeeze under) and should be decided separately from the walk-through fix above.

---

## Safety checks

- **Single-file rule:** change is confined to `collide()` inside `voxEx.html`; no new files or assets.
- **No duplicate/shadowed identifiers:** `yBottom`/`yTop` are new locals scoped to `collide()`; no existing `collide`-scope names reused. Globals `playerEyeHeight`, `isSolidBlock`, `AIR`/`WATER`/`TORCH`/`FIRE` are read, not shadowed.
- **Per-frame cost:** adds one bounded loop (1–3 iterations) with an unrolled 4-corner body — at most 12 `isSolidBlock` calls vs. 8, well within the per-frame budget; honors the "≤2 nested loops in hot paths" rule (one loop, no nesting).
- **No DOM/settings wiring:** no new settings, DOM IDs, or save fields; nothing to round-trip.
- **Behavioral parity:** at integer feet the loop yields the identical two cells the old code tested, so existing standing/ground behavior is unchanged; the only new behavior is detecting the previously-skipped middle cell.
- **One genuinely new failure mode (low risk):** `collide()` returns a boolean and `applyCollisionStep` resolves a hit by *reverting* the move (it does not push the player out). A player who is *already* inside a mid-body block — a pre-fix save, a block updated/placed into them, or a teleport — was previously able to walk out *through* the gap and will now have every axis delta reverted, i.e. be **stuck**. This is pathological (normal play can no longer enter such a state, and placement is already rejected by `playerIntersectsBlock`), but it is the one previously-valid escape this fix removes. If it ever surfaces, the mitigation is an unstick nudge — out of scope here.

## Test plan

- **Regression suite:** run `tools/voxex-tests.html` (~204 tests; serve over localhost) — collision/raycast coverage exercises `VoxelWorld`/collision and should stay green.
- **Manual:** float a block two cells above a flat surface with the head cell clear (the Reproduction setup); confirm the player is now **stopped when jumping up into it** (apex ≈ 1.67 blocks) — note that walking on the ground still correctly passes *under* it. Check from both first- and third-person, and most directly by flying horizontally into it at a fractional feet height.
- **Manual (no regressions):** confirm the player can still walk under a true 2-high clearance, still steps onto the block underfoot without sticking (step tolerance intact), and crouch (eyeHeight 1.4) still fits a 2-high gap.

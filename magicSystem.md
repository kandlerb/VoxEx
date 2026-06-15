# VoxEx — Magic System Design Plan

**Status:** Design / planning (no code written yet)
**Author:** Planning pass, 2026-06-15
**Scope:** Add a player "magic mode" (toggle with **M**) that swaps the hotbar and inventory to a spell loadout, plus four spells: **Explosion**, **Laser (carve)**, **Fire**, **Freeze**.

This document is a build plan, not an implementation. Line numbers reference `voxEx.html` as of build `2026-06-14.6` and will drift as the file changes — treat them as "search anchors," and re-grep the named function/constant before editing.

---

## 1. Design decisions (locked for this round)

| Decision | Choice | Consequence for the plan |
|---|---|---|
| **Balance** | Free-form / creative | No mana, no cooldowns, no resource HUD. (One tiny per-cast guard recommended only to stop accidental per-frame spam — see §10.) |
| **Delivery** | Mix per spell | Explosion = instant at aim point; Laser = instant beam; Fire = traveling projectile (fireball) that arcs and bursts; Freeze = short-range cone/area. |
| **World impact** | Permanent + spreading fire | Explosion/laser permanently carve terrain (saved to chunks). Fire ignites flammable blocks, spreads over time, then burns out to air. |
| **Deliverable** | Standalone design doc (this file) | — |

---

## 2. Goals & non-goals

**Goals**
- Press **M** to flip between *block mode* (current behavior) and *magic mode*.
- In magic mode, the hotbar scrolls through spells and the inventory selects which spells fill the hotbar — reusing the existing hotbar/inventory machinery, not a parallel UI.
- Four working spells with distinct delivery, visuals, sound, light, and terrain effect.
- Stay inside the project's three pillars: **single file**, **voxels only (BoxGeometry / square particles)**, **performance-first**.

**Non-goals (this round)**
- Full fluid simulation. Water is static today (§8.5); carved holes under the sea stay open. A refill pass is proposed as optional, full flow sim is out of scope.
- Spell crafting/progression, multiplayer, mob spellcasting.
- Rebindable magic keys (controls menu is still a static display per CLAUDE.md).

---

## 3. Architecture overview

The cleanest approach is a **mode flag plus parallel data structures**, routing the existing hotbar/inventory/click logic through `if (magicMode)` branches. The current input/UI code is already mode-agnostic, so no monolithic rewrite is needed.

```
                 ┌─────────────────────────────┐
   press M  ───► │  magicMode (bool, global)   │
                 └──────────────┬──────────────┘
                                │ routes
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                         ▼
  Hotbar select/scroll     Inventory render          Left-click action
  (blocks │ spells)        (blocks │ spells)         (mine/place │ cast)
        │                       │                         │
        ▼                       ▼                         ▼
  HOTBAR_SLOT_TO_BLOCK     populateInventory()       castSpell(spellId)
  HOTBAR_SLOT_TO_SPELL     swap source list          ──► Spell framework (§6)
```

### 3.1 New global state

Add near the existing hotbar globals (the block hotbar lives around the `selectHotbarSlot` / `cycleHotbar` region, ~line 43148; `HOTBAR_SLOT_TO_BLOCK` and `currentHotbarSlot` are declared earlier in that module scope):

```js
let magicMode = false;              // false = blocks, true = spells
let currentSpellSlot = 1;          // 1..9, mirrors currentHotbarSlot
let selectedSpellId = SPELL_EXPLOSION;
const HOTBAR_SLOT_TO_SPELL = [      // parallel to HOTBAR_SLOT_TO_BLOCK
  SPELL_EXPLOSION, SPELL_LASER, SPELL_FIRE, SPELL_FREEZE,
  SPELL_NONE, SPELL_NONE, SPELL_NONE, SPELL_NONE, SPELL_NONE,
];
```

Guard against shadowing existing globals (`SETTINGS`, `chunks`, `scene`, `camera`, `selectedBlockId`, `currentHotbarSlot`) — these are net-new names.

### 3.2 Spell registry (data model)

Mirror the data-driven `BLOCK_CONFIG` pattern (~line 4048). One source of truth so the hotbar, inventory, icons, and dispatch all read the same table:

```js
const SPELL_NONE = 0, SPELL_EXPLOSION = 1, SPELL_LASER = 2,
      SPELL_FIRE = 3, SPELL_FREEZE = 4;

const SPELL_CONFIG = [
  {
    id: SPELL_EXPLOSION, key: "explosion", name: "Explosion",
    delivery: "instant-point",       // raycast to aim point, act there
    color: 0xff7a2a, icon: "explosion",
    params: { radius: 4, ignite: true, knockback: 6 },
    cast: castExplosion,             // function ref
  },
  { id: SPELL_LASER, key: "laser", name: "Laser",
    delivery: "instant-beam",
    color: 0x44e0ff, icon: "laser",
    params: { range: 24, boreRadius: 0.6, beamMs: 140 },
    cast: castLaser },
  { id: SPELL_FIRE, key: "fire", name: "Fireball",
    delivery: "projectile",
    color: 0xff5520, icon: "fire",
    params: { speed: 22, gravity: 8, burstRadius: 2, ignite: true },
    cast: castFireball },
  { id: SPELL_FREEZE, key: "freeze", name: "Freeze",
    delivery: "cone",
    color: 0x9fe8ff, icon: "freeze",
    params: { range: 8, halfAngleDeg: 28, surfaceFreeze: true },
    cast: castFreeze },
];
const SPELL_BY_ID = {}; for (const s of SPELL_CONFIG) SPELL_BY_ID[s.id] = s;
```

Spell **icons** can't be emoji (and we avoid circles), so generate small procedural canvas icons the same way block tiles are drawn in `initTextures` — e.g. a starburst for explosion, a beam for laser, a flame for fire, a snowflake-as-squares for freeze. Render them into `<div class="slot">` backgrounds exactly like block tiles are set via `setSlotIcon`.

---

## 4. Input & UI integration

### 4.1 The M toggle

`onKeyDown` is at **~line 42677**; `KEY_BINDINGS` at **~line 42628**. **M (`"KeyM"`) is currently unused** (verified — no `KeyM` references in the file). Add a handler in the "global-ish but gameplay-only" area alongside the **E** (inventory) and **F** (torch) handling. Pattern:

```js
if (event.code === "KeyM") {
  if (isTypingInInput()) return;
  if (isGameplayActive()) {
    magicMode = !magicMode;
    refreshHotbarForMode();           // re-skin the 9 slots + highlight
    updateActiveSelectionDisplay();   // block name OR spell name
    uiManager.showToast(magicMode ? "Magic mode" : "Block mode", "info");
    if (uiManager.isInventoryOpen()) { // live-swap an open inventory
      uiManager.populateInventory();
      uiManager.populateInventoryHotbar();
    }
  }
  event.preventDefault();
  return;
}
```

> Optionally register `magic` in `KEY_BINDINGS` for consistency, but a direct `"KeyM"` check is fine and matches how E/F are handled.

### 4.2 Hotbar selection & scroll

Two call sites must branch on `magicMode`:

- **Number keys 1–9** dispatch through `CODE_TO_ACTION` → `case "hotbar": selectHotbarSlot(action.index)` (~line 42782).
- **Scroll wheel** → `cycleHotbar(±1)` in `onMouseWheel` (~line 42914).

Cleanest refactor: keep `selectHotbarSlot` / `cycleHotbar` (~lines 43148, 43160) as thin routers:

```js
function selectHotbarSlot(n) {
  if (magicMode) return selectSpellSlot(n);
  /* existing block-slot body */
}
function cycleHotbar(dir) {
  if (magicMode) return cycleSpellSlot(dir);
  /* existing block-slot body */
}
```

`selectSpellSlot` / `cycleSpellSlot` mirror the block versions but write `currentSpellSlot` / `selectedSpellId` from `HOTBAR_SLOT_TO_SPELL`, reuse `highlightSlot(n)`, and update the name display. `nextHotbarSlot` (the 1..9 wrap helper) is reusable as-is.

### 4.3 Hotbar rendering

A `refreshHotbarForMode()` helper re-skins the nine `#slot-N` elements: in block mode use block tile icons (current behavior), in magic mode use the spell icons for `HOTBAR_SLOT_TO_SPELL`. It re-applies `highlightSlot(magicMode ? currentSpellSlot : currentHotbarSlot)`. Called on toggle and after inventory edits.

### 4.4 Inventory

`UIManager.populateInventory()` (fills the full grid) and `populateInventoryHotbar()` (fills the 9 hotbar slots inside the inventory) branch at their top:

```js
populateInventory() {
  const list = magicMode ? SPELL_CONFIG.filter(s => s.id !== SPELL_NONE)
                         : this.blockTypes;
  /* render `list` into the grid; dataset carries blockId OR spellId */
}
```

The existing select/drag callbacks (`setInventorySelectCallback`, `setHotbarChangeCallback`) already write generic IDs — route them to `selectedSpellId` / `HOTBAR_SLOT_TO_SPELL` when `magicMode`. Drag-drop, open/close (E), and pointer-lock handling are unchanged.

### 4.5 Casting (left-click) & suppressing build actions

Mouse handling lives around `onMouseClick` / `onMouseUp` (the place/break path; `tryPlaceBlock` is at ~line 42841, continuous-mine logic runs in `animate` ~line 42488). In magic mode:

- **Left-click** → `castSpell(selectedSpellId)` instead of starting a mine.
- **Right-click** → ignored (or reserved for a future "alt cast").
- The continuous-break block in `animate` must early-out when `magicMode` so you don't chew terrain while aiming.

```js
// inside the mouse-down handler
if (magicMode) {
  if (e.button === 0) castSpell(selectedSpellId);
  return; // skip mine/place entirely
}
```

### 4.6 HUD

- Reuse the block-name readout to show the spell name in magic mode.
- Add a small persistent indicator (e.g. `#mode-badge` showing "✦ Magic") toggled by `body.magic-mode` class — pure CSS, no per-frame cost.
- Optionally tint the crosshair to the active spell's `color`.
- New DOM IDs must exist in the HTML and match JS refs (CLAUDE.md rule).

---

## 5. New block types: FIRE and ICE

Spells need two new blocks. Follow the documented "adding a block" path (CLAUDE.md §"When Modifying voxEx.html").

| | FIRE (id 16) | ICE (id 17) |
|---|---|---|
| Tags | `transparent`, `cutout`, `emissive` (non-solid — walk through) | `transparent`, `cutout`, `collidable`, `cullAdjacent` (solid, like GLASS) |
| Collision | none | solid/walkable |
| Light | glow via dynamic point lights, **not** blockLight (see §7.3) | passes light |
| `lighting` | `{ sunlightAttenuation: 0, blocklightAttenuation: 0 }` | `{ sunlightAttenuation: 0, blocklightAttenuation: 0 }` (or `1/1` for a frosted look) |
| Reference config | model on TORCH (emissive, non-solid) | model on GLASS (~line 4192) almost verbatim |

**Checklist for each new block:**

1. Add ID constants after `GLASS = 15` (and `UNLOADED_BLOCK = 255` stays last).
2. Add `TILE.FIRE` / `TILE.ICE` and **bump `NUM_TILES`** from 18 → **20** in *both* copies (main ~line 4020 **and** the worker template ~line 17550).
3. Add texture generation in `initTextures` (procedural 16×16; fire = flickery orange/yellow cutout, ice = pale blue translucent with square facets).
4. Add `BLOCK_CONFIG` entries (~line 4048) — the system auto-derives inventory/UV/transparency.
5. Confirm lookup tables populate: `initBlockLookupTables()` (~line 10168) builds `BLOCK_IS_SOLID` from tags; `initBlockOptimization()` (~line 28789) builds `IS_TRANSPARENT` / `SUNLIGHT_ATTENUATION` / `BLOCKLIGHT_ATTENUATION` / `CULLS_SAME_ID` / `AO_OCCLUDES`.
6. **Worker parity (critical):** the meshing worker keeps *hand-maintained* copies at **~lines 17563–17582**. Add:
   - `IS_TRANSPARENT_WORKER[FIRE] = 1; IS_TRANSPARENT_WORKER[ICE] = 1;`
   - `CULLS_SAME_ID_WORKER[ICE] = 1;`
   - (`AO_OCCLUDES_WORKER` is derived from `IS_TRANSPARENT_WORKER` in the loop right after — fire/ice will correctly not occlude AO.)
   - Add matching `FIRE` / `ICE` numeric constants in the worker scope.
   These blocks are **not** terrain-generated, so the injected terrain/tree functions (`__TERRAIN_FUNCS_*`, `__TREE_FUNCS_*`) need no change.
7. Update `tools/voxex-texture-tests.html` expectations (tile count → 20; new tiles' opacity/transparency/color checks).

> **Atlas note:** verify `initTextures` and the atlas strip width handle 20 tiles; the texture-tests tool renders all tiles and will catch an off-by-one in the strip.

---

## 6. Spell delivery framework

Three delivery shapes are needed: **instant point** (explosion), **instant beam** (laser), **traveling projectile** (fireball), and **cone/area** (freeze). All converge on the shared **bulk terrain editor** (§8) for the actual block changes.

### 6.1 Targeting

Reuse `pickVoxel(origin, dir, range)` (DDA voxel raycast, **~line 40892**). Origin = `getPlayerWorldPosition()`, direction = `controls.getDirection(_pickDirTmp)`. It returns `{x,y,z,face}` or `null` (open sky). For "act at aim point," use the hit block; if `null`, use `origin + dir * range` as the target point.

### 6.2 Projectile system (new, lightweight)

There is **no existing projectile system** — mobs are the only per-frame updated entities. Add a tiny module-scope system, updated from the main `animate()` loop (~line 42463), right after `updateZombies(clampedDt)` (~line 42578):

```js
const activeProjectiles = [];   // {pos, vel, type, life, mesh, light}
function updateProjectiles(dt) {
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const p = activeProjectiles[i];
    p.vel.y -= p.gravity * dt;
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
    if (p.light) p.light.position.copy(p.pos);
    spawnProjectileTrail(p);                 // particles
    p.life -= dt;
    if (hitsBlock(p.pos) || hitsEntity(p.pos) || p.life <= 0) {
      p.onImpact(p);                         // spell-specific burst
      disposeProjectile(p); activeProjectiles.splice(i, 1);
    }
  }
}
```

- `hitsBlock` = `BLOCK_IS_SOLID[getBlock(floor(pos))]`. `hitsEntity` reuses the spatial-hash / mob proximity already used for zombie targeting.
- The projectile mesh is a small emissive `BoxGeometry` (voxel-correct). Cap active projectiles (e.g. 12) and reuse a small pool to avoid GC, consistent with the project's pooling discipline.

### 6.3 Dynamic light for effects

`MAX_POINT_LIGHTS = 8` (torches use a throttled `torchLightPool`). Add spell lights **directly to the scene** (not the pool, which is throttled), with `castShadow = false`, and keep a hard cap (≤4 simultaneous spell lights) so we never blow the WebGL uniform budget shared with torches. Each spell light has a short fade-out lifetime and is removed in the same per-frame update.

### 6.4 Beam geometry (laser)

A glowing **`BoxGeometry`** scaled to `(thin, thin, length)`, oriented along the view ray, `MeshLambertMaterial` with `emissive` set to the spell color (same approach as the torch flame/glow materials). Spawn it for `beamMs`, fade alpha, dispose. No cylinders — stays voxel-true.

### 6.5 Audio

`AudioManager` (~line 8225) synthesizes everything via `_playSimpleOsc(type, startFreq, endFreq, dur, vol)`. Add `playExplosion()` (sawtooth 400→60, longer/louder), `playFireball()` (triangle crackle), `playFreeze()` (sine 900→300 shimmer), `playLaser()` (square 1200→700 zap). One method per spell, called at cast time.

---

## 7. Spell catalog

### 7.1 Explosion — `castExplosion()`

- **Delivery:** instant. Raycast to the aim point (or `origin + dir*range`).
- **Terrain:** carve a sphere of `radius ≈ 4` to `AIR` via the bulk editor (§8). ~250–500 blocks.
- **Side effects:** if `ignite`, set a few `FIRE` blocks on surviving flammable faces at the crater rim (feeds §7.5 spread). Optional knockback to nearby mobs/player using existing velocity fields.
- **Visuals:** one big particle burst (orange→smoke gradient, square particles, outward velocity + gravity), a brief expanding "shock" ring made of square particles, one bright short-lived scene light, screen-shake (small camera offset for ~150 ms).
- **Audio:** `playExplosion()`.

### 7.2 Laser — `castLaser()`

- **Delivery:** instant beam along the view ray for `range ≈ 24`.
- **Terrain:** walk the ray (reuse `pickVoxel`'s DDA, or step in small increments) and carve a thin tube (`boreRadius ≈ 0.6`, i.e. the center column plus immediate neighbors) to `AIR` until it hits bedrock/range. Permanent.
- **Visuals:** the emissive beam box (§6.4) from muzzle to first solid hit (or full range), plus sparks (square particles) at the impact point and a small impact light.
- **Audio:** `playLaser()`.
- **Note:** this is the cleanest "tunnel digger." Keep the tube radius small to bound block-edit count (long beams can touch many chunks — see §9).

### 7.3 Fire — `castFireball()`

- **Delivery:** traveling projectile. Spawn at the player's hand, `speed ≈ 22`, `gravity ≈ 8` (gentle arc).
- **In flight:** emissive box mesh + flame/smoke trail particles + a following spell light.
- **On impact (block or entity):** place `FIRE` blocks in a small radius (`burstRadius ≈ 2`) on/adjacent to flammable surfaces, ignite the block hit, spawn a flame burst. Does **not** carve terrain by itself — burning does (§7.5).
- **Fire light:** handled by the projectile's scene light in flight and by a **small pool of dynamic point lights snapped to the nearest/biggest active fire clusters** afterward (cap ~4). We deliberately do **not** emit `blockLight` from fire, because spreading/changing fire would thrash the lighting engine (constant relight + remesh). This keeps fire cheap and is the recommended trade-off.
- **Audio:** `playFireball()` on cast, soft crackle loop optional while fires burn.

### 7.4 Freeze — `castFreeze()`

- **Delivery:** short-range cone in front of the player (`range ≈ 8`, `halfAngle ≈ 28°`). Iterate blocks in front, keep those within the cone.
- **Terrain:** convert `WATER` → `ICE` in the cone. If `surfaceFreeze`, also lay a thin `ICE` skin on exposed water surfaces just below the cone's reach. Converting water blocks remeshes both the terrain mesh and the separate `_WATER` mesh and triggers a small relight (ICE attenuation differs from water).
- **Visuals:** frost particles (pale-blue squares) drifting/settling, a faint cold-tint flash, subtle "crackle" sparkles on newly frozen blocks.
- **Audio:** `playFreeze()`.
- **Optional polish (future):** make `ICE` slightly slippery by reducing ground friction when standing on it (movement code already centralizes friction).

### 7.5 Fire spread & burnout (tick system)

A small cellular-automaton tick, throttled (e.g. every ~0.4 s, time-budgeted), drives spreading:

```
state: activeFires = Map(blockKey -> { x,y,z, ageMs })
tick:
  for each fire (cap N, e.g. 200):
    age it; if age > burnoutMs:
       - turn the FIRE block to AIR
       - if the block beneath was flammable, consume it (-> AIR or -> FIRE briefly)
       - remove from activeFires
    else with spreadChance:
       - pick a neighbor; if BLOCK_IS_FLAMMABLE -> replace with FIRE, add to activeFires
  rebuild affected chunks once per tick (batched, §8)
```

- **Flammable set:** add a `"flammable"` tag in `BLOCK_CONFIG` (WOOD, LOG, LEAVES, LONGWOOD_LOG, LONGWOOD_LEAVES, GRASS) → build a `BLOCK_IS_FLAMMABLE[256]` lookup in `initBlockLookupTables()`.
- **Caps:** hard cap on `activeFires` and on per-tick spreads to bound cost; fire near the player only (skip distant chunks) to avoid simulating the whole world.
- **Persistence:** terrain changes from burning are permanent (blocks already became air/fire and save normally). The transient `activeFires` map need not be serialized — on load, convert any saved `FIRE` blocks to `AIR` (or re-seed them as fresh fires). Decide and document in `saveWorld`/`loadWorld`.
- **Light:** as in §7.3, fire glow is dynamic point lights, not blockLight, specifically so the spread tick doesn't trigger lighting storms.

---

## 8. Bulk terrain editing

### 8.1 Why a dedicated helper

Per-block `setBlock` (~line 24269) is correct but **heavy in bulk**: each call queues a lighting job and several cache invalidations. A radius-4 sphere is ~250 blocks → 250 lighting jobs + many invalidations + uncoordinated remeshes. Two paths:

- **Simple (fine for small edits / prototype):** loop `setBlock(...)` then `updateLocalArea(...)` (~line 40868) once per affected block. Easiest, but can hitch.
- **Recommended (sphere/laser/freeze):** a `bulkEdit(edits)` helper that
  1. writes blocks via the low-level `voxelWorld.setBlock` (no per-block lighting queue),
  2. collects the set of touched chunk keys (+ their edge neighbors),
  3. runs **one** sunlight/blocklight recompute per affected chunk,
  4. issues **one** `scheduleChunkUpdate(cx, cz, true, "spell", { immediate:true })` per affected chunk (+ `_WATER` remesh where water changed).

This bounds work to "chunks touched," not "blocks changed," matching the engine's existing batched edit philosophy (`updateLocalArea` already fans out to edge/corner neighbors).

### 8.2 Shapes

- **Sphere** (explosion/fireball burst): iterate the AABB, keep `dx²+dy²+dz² ≤ r²`.
- **Line/tube** (laser): DDA along the ray; for `boreRadius`, also include the small cross-section neighbors.
- **Cone** (freeze): iterate AABB in front of player, keep blocks whose angle to view dir ≤ `halfAngle` and distance ≤ `range`.

Respect `BEDROCK` (never carve), and skip already-`AIR` targets.

### 8.3 Save / streaming

`setBlock`/`voxelWorld.setBlock` already mark chunks modified (`chunkAutoSave.markModified`, `markDirtyForDisk`). Bulk edits inherit this; just make sure the bulk path also marks each touched chunk modified so carves persist through save/load and chunk eviction.

### 8.4 Cost guardrails

- Cap spell radii/range so a single cast can't touch a huge area (explosion r≤6, laser range≤32, freeze range≤12).
- The bulk relight is the expensive part; keep radii modest and rely on the chunk-level (not block-level) relight.

### 8.5 Water reality check ("how water works")

Water today is **static block IDs** placed at generation (`fillWaterPass`), with a **separate `_WATER` surface mesh** and depth computed at mesh time — there is **no flow/refill**. Implications:

- Exploding/lasering below the sea leaves a **permanent hole**; water will not rush in.
- Options, in increasing effort: **(a)** accept holes (simplest, ship it); **(b)** a light post-edit flood-fill that re-fills connected sub-sea-level air with water up to sea level within the edited region; **(c)** a real cellular fluid system (large, separate project — out of scope).
- Recommendation: ship **(a)** for v1, note **(b)** as a fast-follow. Freeze (water→ice) needs none of this since it's a 1:1 block swap.

---

## 9. Performance considerations

- **Per-frame work:** projectile + spell-light + active-fire updates all hook the existing `animate()` loop; keep each O(active count) with hard caps. No new nested chunk loops in the frame path (CLAUDE.md rule: ≤2 nested loops in per-frame code).
- **Lighting:** chunk-level relight on bulk edits, not per block. Fire uses dynamic lights, not blockLight, to avoid relight storms.
- **Particles:** reuse `ParticleSystem` (~line 14215, max 500) and its square shader; spell bursts must budget within that cap.
- **Pooling:** projectiles, spell lights, beam meshes, and fire entries all use small reusable pools (no allocations in hot paths).
- **Distance:** simulate fire/projectiles only near the player; skip distant chunks.

---

## 10. Free-form casting (no resource), with a spam guard

No mana, no cooldown by design. The only safeguard: a tiny **global minimum interval** between casts (e.g. 80–120 ms) so a single click/hold can't fire a spell every frame and instantly carve a canyon or spawn 60 fireballs. This is a frame-rate guard, not a balance mechanic, and can be disabled via a setting if you want truly unrestricted casting.

---

## 11. Worker-parity & lookup-table checklist (the things that silently break)

- [ ] `NUM_TILES` updated in **both** copies (main ~4020, worker ~17550).
- [ ] FIRE/ICE constants added in **both** main and worker scopes.
- [ ] `IS_TRANSPARENT_WORKER` / `CULLS_SAME_ID_WORKER` updated (~17563–17582) to match main `IS_TRANSPARENT` / `CULLS_SAME_ID`.
- [ ] `BLOCK_IS_SOLID`, `IS_TRANSPARENT`, `SUNLIGHT_ATTENUATION`, `BLOCKLIGHT_ATTENUATION`, `AO_OCCLUDES`, new `BLOCK_IS_FLAMMABLE` all populated from `BLOCK_CONFIG` tags.
- [ ] No terrain/tree function edits needed (fire/ice aren't generated) — keep `__TERRAIN_FUNCS_*` / `__TREE_FUNCS_*` markers intact.
- [ ] New DOM IDs (mode badge, spell name) exist in HTML and match JS.
- [ ] New settings (if any: spell radii, cast interval) added to `DEFAULTS`, wired into `SETTINGS`, round-trip via save/load.
- [ ] `VOXEX_BUILD` + recent-changes banner bumped.
- [ ] `tools/voxex-tests.html` run (serve over localhost); `tools/voxex-texture-tests.html` updated for 20 tiles.

---

## 12. Phased implementation plan

**Phase 0 — Scaffolding (no gameplay change)**
- Add `magicMode` + parallel spell globals, `SPELL_CONFIG`/`SPELL_BY_ID`, spell icon generation.
- Wire **M** toggle, hotbar routing (`selectHotbarSlot`/`cycleHotbar`), inventory branching, HUD badge.
- *Deliverable:* you can press M, scroll a spell hotbar, pick spells in inventory — casting does nothing yet.

**Phase 1 — Block + edit foundation**
- Add FIRE/ICE blocks (config, textures, lookup tables, worker parity, NUM_TILES).
- Implement `bulkEdit()` (sphere/line/cone) with chunk-level relight + batched remesh.
- *Deliverable:* internal test calls can carve a sphere / convert water→ice correctly and persistently.

**Phase 2 — Explosion & Laser (instant spells)**
- `castExplosion` (sphere carve + burst + light + shake + audio).
- `castLaser` (beam mesh + tube carve + sparks + audio).
- *Deliverable:* two fully working destructive spells.

**Phase 3 — Projectiles & Fire**
- Projectile system in `animate()`; `castFireball`.
- FIRE placement on impact; flame trail + dynamic fire lights.
- *Deliverable:* working fireball that starts fires.

**Phase 4 — Fire spread & Freeze**
- Fire spread/burnout tick + `BLOCK_IS_FLAMMABLE`; save/load handling of FIRE.
- `castFreeze` cone + water→ice + frost particles.
- *Deliverable:* all four spells complete; fire spreads and burns out.

**Phase 5 — Polish & guardrails**
- Spam-interval guard, caps/tuning, screen-shake feel, optional ice slipperiness, optional water refill pass (§8.5b).
- Tests + texture tests + build banner; final CLAUDE.md checklist pass.

---

## 13. Open questions for you

1. **Spell icons:** procedural canvas glyphs (matches block-tile pipeline) — OK, or do you want simple colored squares with a letter for v1?
2. **Right-click in magic mode:** leave unused, or reserve now for a future secondary cast?
3. **Water holes (§8.5):** ship with permanent holes for v1, or do you want the simple flood-fill refill in scope from the start?
4. **Fire reach:** should fire be allowed to spread arbitrarily far (whole forests), or stay capped to a radius around the ignition point for performance/safety?
5. **Saved fire on load:** convert leftover FIRE blocks to air, or re-ignite them?

---

## 14. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Worker parity drift (new blocks render wrong / crash worker) | High if forgotten | §11 checklist; the file has prior history of `yOffset`/parity breaks |
| Lighting hitches on big carves | Medium | Chunk-level relight, modest radii, bulk path |
| Fire sim runaway cost | Medium | Hard caps, near-player only, dynamic lights not blockLight |
| Atlas off-by-one with 20 tiles | Medium | texture-tests tool catches it |
| Water holes feel broken to players | Low/Medium | Decide §8.5 policy up front; freeze unaffected |
| Point-light budget overflow (torches + spells) | Medium | Cap spell lights ≤4, `castShadow=false`, add to scene not pool |

---

*End of plan. Nothing in this document has been implemented; it's the blueprint for the phased build above.*

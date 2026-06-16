# FireImplementation.md — Fire System Change Control Request (CCR)

| Field | Value |
|-------|-------|
| **CCR ID** | VOXEX-CCR-FIRE-001 |
| **Title** | Add a fire block, fire state manager, burnable-block tag, and burn-out simulation |
| **Target file** | `voxEx.html` (single-file rule applies — all code stays in this file) |
| **Author** | Engineering (drafted for Kandler) |
| **Date drafted** | 2026-06-15 |
| **Baseline build** | `VOXEX_BUILD = "2026-06-15.1"` (`voxEx.html:3792`) |
| **Status** | DRAFT rev. 8 — water-extinguish (D10) + pause-gate (D11) signed off, awaiting approval |
| **Risk level** | **High** (touches block tables, lighting propagation, chunk meshing, collision/pathing predicates, worker parity, persistence, and the per-frame loop) |
| **Estimated effort** | 3–4 focused sessions, phased (see §13 Rollout); player-damage descoped to a follow-up CCR |

**Revision history**
- **rev. 1** (2026-06-15) — initial draft.
- **rev. 2** (2026-06-15) — audited against `voxEx.html`. Corrected the false "solidity is tag-driven" assumption (new §6.5b: 6 ad-hoc `=== TORCH` predicates — incl. **player collision** and **zombie pathing** — that fire must join); added the **missed greedy mesh loop** (§6.8a, `39163`); fixed the non-existent `blockAtlasTexture` → `chunkMaterial.map`; flagged the worker mesh pipeline as **gated off** (parity-only); added a remesh-thrash mitigation (§6.13); added collision/pathing + test-seam wiring to the test plan (§11) and risks (§14).
- **rev. 3** (2026-06-15) — integration review. **Mob fire damage** now integrates as a mob rule reusing `burnInSunlight`'s `ud.burning`/`startMobDeath`/burn-FX machinery (was a standalone `applyFireDamageToEntities` spatial pass); **tick edits** now batch one non-immediate `scheduleChunkUpdate` per chunk (was per-edit `updateLocalArea`, which forces immediate remesh — `40915`); **fire particles** moved to a per-frame throttled emitter (were stuttering in the 2 Hz tick); spread/active caps + `fireMaxEditsPerTick` promoted to settings; named the two `releaseChunkTorches` call sites precisely; documented the deliberate **baked-light-only** non-integration (no dynamic `PointLight`); added the **§10.1 integration map**.
- **rev. 4** (2026-06-15) — texture/animation/particle deep-dive. **Composite multi-surface fire** (D8): `computeFireAttachment` returns six face booleans and `createWorldFire` renders the ground layer + a flame per solid wall + a ceiling flame simultaneously (was a single below→side→above pick that couldn't represent boxed-in / ceiling+wall / two-wall cases). **Animated flames** (D7): 4 looping frames per layer (`NUM_TILES` 18→**33**), procedurally generated with loop-seam guidelines (§6.11), animated via shared cloned-texture `offset.x` writes (§6.7d) — O(1) regardless of fire count. **Particle perf fixed**: distance-culled + capped emitter mirroring the placed-torch loop (was per-fire, would exhaust the 500 pool). Added `ALLOW_TRANSPARENCY` registration for all 12 frames, perf settings, composite/animation/particle tests, and risks.
- **rev. 5** (2026-06-15) — **distance animation LOD** (D9): fires beyond `fireAnimationRadius` (24) freeze on frame 0 via a separate shared **static** material set; a throttled (~4 Hz) `updateFireLOD` flips each `chunkFires` model between the animated and static sets as the player moves, seeded correctly at spawn by `_fireNearPlayer`. Keeps animation O(1) and lets distant flames share one untouched material. Added the `fireAnimationRadius` setting, LOD test (§11.7), and updated the integration map + safety checks.
- **rev. 6** (2026-06-15) — **GC / memory / performance review (new §10.2).** Fixed two High GC sources inline: cells now store **numeric coords** (kill `key.split(',').map(Number)` per fire per tick/emit) and the tick does **one combined `scanFireNeighbors`** instead of 3 separate 6×`getBlock` scans (every `getBlock` allocates a chunk-key string, `voxEx.html:6892`). Fixed a **High memory leak**: `releaseChunkFires` now unregisters the chunk's `fireSystem.cells` on unload (was orphaning entries unbounded). Documented the **emissive-fire light-flood cost** (P1, dominant per-edit cost — tune `fireMaxEditsPerTick`), **transparent overdraw/sort** (P2), **model churn** (M2), **clone VRAM** (M3, verify), and recommended **per-profile cap scaling** (P3). Added GC/leak tests (§11.12) and risks.
- **rev. 7** (2026-06-15) — **lifecycle & gameplay edge-case review (new §10.3).** Fixed inline: **L3** leaves are burnable-but-non-solid → support refined to solid **OR** burnable so canopies actually burn (refines D4); **L2** chunk-boundary fires no longer extinguish against unloaded neighbours (`scan.unloaded` defer guard). Documented & specced fixes for: **L1** ghost-fire/`cells` leak across world loads (explicit clear in `loadWorld`, `25733`); **L4** fire spreading while paused (gate on `isGameplayActive()`); **L5** hand-extinguish polish (instant + ember particles vs the 0.3 s mine flow, since `pickVoxel` targets fire); plus L6–L11 (iteration mutation, held-block, forward-compat, audio, shadows, frame-budget). Opened decisions **D10** (water extinguishes fire?) and **D11** (pause behaviour); added lifecycle tests + risks.
- **rev. 8** (2026-06-15) — **D10 + D11 signed off.** Water extinguishes fire: `scanFireNeighbors` reports a WATER neighbour → tick extinguishes; `trySpreadFrom` won't spread next to water; fire can't be placed next to water; placing WATER extinguishes adjacent fire (`extinguishFireNeighbors`); toggle `fireWaterExtinguish` (default true). Fire pauses with the game: `fireSystem.update` + animation/LOD gated on `isGameplayActive()`. Updated §3.2/§6.7d/§6.12/§6.13, settings, decisions (D10/D11/D4 now resolved), §10.3 L4/L12, and risks.
- **rev. 9** (2026-06-15) — IMPLEMENTED (build `2026-06-15.2`); briefly tried an IGNITE-IN-PLACE model (blocks replaced by fire). **Reverted in rev. 10** — it destroyed blocks instead of clinging.
- **rev. 10** (2026-06-15) — **final fire behaviour: CLING-AND-SPREAD** (per user direction). Fire lives in AIR and never enters/replaces a block. It crawls into adjacent AIR cells that touch a burnable block — `spreadFire` uses a weighted single-pass pick biased **UP** (heat rises) but spreads in all directions — so it climbs the *outside* of logs/walls. After ~2-4 s (`burnTime = fireMaxAge·[0.7,1.3]`, default `fireMaxAge=3`) it chars the burnable block(s) it touches **in place** via `convertAdjacentBurnables` (grass→dirt, all logs→burnt log, planks→burnt planks, leaves→air) and then `removeFire` empties its air cell — so the flame that burned a block goes out exactly when the block chars. A flame with nothing left to cling to (`!scan.any`) or touching water dies. `register(x,y,z)` stores `{age,burnTime}`; `createWorldFire` renders flames only against the faces it clings to; spawn loop skips unsupported cells. `fireSpreadChance` raised to 0.5 so it propagates within the burn window. Replaces rev. 9's `igniteNeighbor`/in-place model. Verified: isolated `node --check` of the simulation block + a full module-mode parse of all fire edits (lines 3785–43600) with no errors.

> **Line numbers in this document are references against baseline build `2026-06-15.1`.** Every insertion shifts the lines below it, so apply changes **top-to-bottom** and re-search the anchor strings (given alongside each line number) rather than trusting absolute numbers after the first edit.

---

## 1. Executive summary

Add **fire** as a first-class block that:

1. Renders as a separate, oriented model (not baked into chunk geometry) in three visual states — **free-standing** (sitting on top of a block), **side** (clinging to a vertical block face), and **bottom** (hanging from the underside of a block) — mirroring the existing **torch** special-render pattern.
2. **Emits light** (reuses/generalises the torch block-light propagation).
3. **Spreads** to adjacent burnable blocks on a throttled simulation tick.
4. **Burns out / consumes** its supporting block per a `burnsTo` map:
   - Grass → **Dirt**
   - Leaves (Oak + Longwood) → **destroyed (Air)**
   - Logs (Oak + Longwood) → **Burnt Log** (new block + texture)
   - Planks (Wood) → **Burnt Planks** (new block + texture)
5. **Damages mobs** standing in it (zombies via the existing `damageMob`). **Player damage is deferred** to a follow-up CCR — no player-health system exists yet (§9, §16 D6).
6. Is created by **hotbar placement** only (flint-and-steel deferred to "Future work", §15).

The design deliberately reuses three existing, proven subsystems so the blast radius stays controlled:

| Need | Existing system reused | Why |
|------|------------------------|-----|
| Separate per-instance rendering | Torch model + `chunkTorches` Map | Torch already renders outside chunk geometry, is tracked per-chunk, cleaned up on chunk unload, and skipped by all three mesh loops (§6.8). |
| Light emission | `updateBlockLightAt` torch path + chunk block-light seed scan | Torch is already a level-N point block-light source with full propagation. |
| Behaviour flags | Tag-derived `*_BLOCK_IDS` Sets in `BLOCK_CONFIG` | `burnable` becomes just another tag, like `log`/`leaves`/`fluid`. |
| Particles | `spawnTorchFlame` / `spawnTorchEmber` | Flame/smoke already exist and are settings-gated. |
| Mob fire damage | **mob rule list** (`MOB_RULE_SETS.zombie`) + the `burnInSunlight` pattern | Zombies already have a per-mob "burning" damage rule (`ud.burning`, `ud.health`, burn-FX timer, `startMobDeath`). Fire damage is a sibling rule, not a new pass. |
| Block edits from the tick | `scheduleChunkUpdate` batched-update path | The engine already de-dupes/queues chunk rebuilds; fire edits feed the same queue (NOT the immediate `updateLocalArea`). |

---

## 2. Scope & requirements (approved)

**In scope:** light emission, spread to neighbours, burn-out/consume with the mapping above, **mob (zombie) damage**, hotbar placement, three fire visual states, new burnt-block textures (burnt log + burnt planks; 6 new atlas tiles total incl. the 3 fire states), placeable burnt blocks, concrete code.

**Out of scope (this CCR):** **player damage** (deferred — no player-health system exists yet; tracked as follow-up CCR, see §9 and §15), flint-and-steel item, fire from lava/lightning, fire-resistance, smoke accumulation, world-gen-placed fire, burning dropped items (no item-entity system exists).

**New blocks introduced:** `FIRE`, `BURNT_LOG`, `BURNT_PLANKS` (burnt blocks are **placeable** from the inventory).

**New behaviour tag:** `burnable` — applied to Grass, Wood/Planks, **all logs (Oak + Longwood)**, and **all leaves (Oak + Longwood)**. **All logs burn to `BURNT_LOG`; all leaves burn to Air.** (Resolved — §16 D2.)

---

## 3. Design overview

### 3.1 Why fire is a "torch-style" separate model, not a meshed cube

A meshed cube cannot represent the three requested orientations cleanly, and a full opaque cube would block light/AO. Fire must be **transparent, non-solid (walk-through), non-occluding, and emissive** — exactly the torch profile. Torch is already excluded from all three mesh loops (§6.8) and drawn as its own `THREE.Group` per block. Fire follows the same lifecycle, which means **zero new chunk-meshing math** and automatic cleanup on chunk eviction.

Fire renders as flat square `PlaneGeometry` quads (Resolved §16 D3). The three tile *types* are **composable layers, not mutually-exclusive states** — a single fire cell shows **all** the layers its neighbours justify, simultaneously:
- **ground layer** (`FIRE_FREE_*` frames): two crossed vertical quads centred in the cell — shown when the block **below** is solid.
- **wall layer** (`FIRE_SIDE_*` frames): one vertical quad flush against an adjacent **solid side** face — shown **once per solid horizontal neighbour** (up to 4: −X, +X, −Z, +Z), each rotated to face inward.
- **ceiling layer** (`FIRE_BOTTOM_*` frames): one quad licking down from the **block above** — shown when the block above is solid.

### 3.2 Fire attachment model (composite, multi-surface)

> **Correction (rev. 4):** earlier drafts picked a *single* state (below → side → above priority). That was wrong — it cannot represent fire wedged among multiple surfaces. A real fire cell can touch the floor, several walls, and the ceiling at once, and must render a flame on **each**.

Fire's attachment is **derived, not stored** — recomputed from the 6 neighbours whenever fire is placed, spread, or a neighbour changes. `computeFireAttachment(x,y,z)` returns a composite descriptor (six independent booleans), not a single enum:

```
isSupport(n) = BLOCK_IS_SOLID[n] || isBurnable(n)   // see note below — leaves are burnable but NOT solid
floor   = isSupport(below)
ceiling = isSupport(above)
sideNX  = isSupport(-x)   sidePX = isSupport(+x)
sideNZ  = isSupport(-z)   sidePZ = isSupport(+z)
any     = floor || ceiling || sideNX || sidePX || sideNZ || sidePZ
```

`createWorldFire` then builds a `Group` containing **every** layer whose flag is true: ground quads if `floor`, one wall quad per true `side*`, a ceiling quad if `ceiling`. This resolves all the awkward cases directly:

| Scenario | floor | ceiling | sides | Renders |
|----------|:---:|:---:|:---:|---------|
| Ground lit, fully boxed in by walls | ✓ | maybe | up to 4 | ground flames **+** a flame on each wall |
| **No floor**, ceiling lit + one wall lit | ✗ | ✓ | 1 | ceiling flame **+** that wall's flame |
| No floor, two opposite walls lit | ✗ | ✗ | 2 | a flame on **both** walls |
| Only the floor lit (open field) | ✓ | ✗ | 0 | ground flames only |
| Nothing solid on any of the 6 faces | ✗ | ✗ | 0 | `any === false` → **fire cannot exist → extinguish** |

Support for *existence* is **any solid OR burnable block** on any face (`any`). **This refines §16 D4** — the original "support = any solid" would have made tree canopies un-burnable, because **leaves are `burnable` but `transparent`/non-solid** (`BLOCK_IS_SOLID[LEAVES] === 0`). With solid-only support, a fire in an air pocket inside a canopy (neighbours = leaves + air, no solid) would have `any === false` and extinguish instantly, so fire could never propagate through foliage — defeating the headline "leaves burn" requirement. Including burnable blocks as support lets fire cling to and consume leaves. The **fuel** to consume is whichever touched support is `isBurnable` (floor → side → ceiling priority); a fire touching only non-burnable solids (stone, or the dirt left after grass burned) keeps burning until its age timer expires with nothing to consume. *Spread* remains burnable-only (D4 unchanged on that point).

### 3.3 Fire registry & tick model

A single module-scope `fireSystem` holds the set of active fire cells (`Map<"gx,gy,gz", {state, age, fuel}>`). It is:
- **Populated** on placement/spread, and rebuilt by scanning `FIRE` blocks when a chunk loads (so saved fire resumes ticking).
- **Ticked** on a throttled cadence (default 0.5 s, *not* per-frame) from `animate()`. Each tick: age++, maybe spread, maybe consume fuel, maybe extinguish, apply entity damage.
- **Persisted implicitly** — `FIRE` is a normal block ID in `chunk.blocks`, so RLE save/load already round-trips it. `age`/`state` are transient and recomputed, so **no save-format change is required**.

This keeps the hot per-frame path clean (the per-frame loop only does cheap entity-overlap damage checks against nearby fire; the expensive spread/consume logic runs at 2 Hz).

---

## 4. New block IDs

Current IDs occupy 0–15, with `UNLOADED_BLOCK = 255` (`voxEx.html:3836-3852`). Next free IDs are 16, 17, 18.

| ID | Constant | Kind | Notes |
|----|----------|------|-------|
| 16 | `FIRE` | transparent, non-solid, emissive, separate-render | walk-through; damages mobs (player damage deferred, D6) |
| 17 | `BURNT_LOG` | solid cube | burn result of all logs (Oak + Longwood) |
| 18 | `BURNT_PLANKS` | solid cube | burn result of `WOOD` (planks) |

> IDs ≤ 254 are safe; `255` stays reserved for `UNLOADED_BLOCK`. RLE values are stored per-cell as `Uint8`, so 16–18 need no codec change.

---

## 5. New texture tiles

`NUM_TILES` is currently **18** (tiles 0–17; Glass is 17). Each fire layer is **animated with 4 looping frames** (Resolved §16 D7), so fire needs 3 layers × 4 frames = **12 contiguous tiles**; Burnt Log needs 2 (side + top, mirroring oak Log), Burnt Planks needs 1 → **15 new tiles → `NUM_TILES = 33`** (tiles 18–32).

Frames of a layer **must be contiguous** in the atlas — the animation advances a shared texture's `offset.x` through the layer's 4 columns (§6.7d), which only works if they're adjacent.

| New TILE key | Index | Used by |
|--------------|-------|---------|
| `FIRE_FREE_0` … `FIRE_FREE_3` | 18–21 | ground layer, frames 0–3 |
| `FIRE_SIDE_0` … `FIRE_SIDE_3` | 22–25 | wall layer, frames 0–3 |
| `FIRE_BOTTOM_0` … `FIRE_BOTTOM_3` | 26–29 | ceiling layer, frames 0–3 |
| `BURNT_LOG_SIDE` | 30 | BURNT_LOG side |
| `BURNT_LOG_TOP` | 31 | BURNT_LOG top/bottom |
| `BURNT_PLANK` | 32 | BURNT_PLANKS all faces |

All **12 fire frame tiles are cutout/transparent** (flame shape over transparency): their draw code **must `ctx.clearRect` first** (Glass rule, `voxEx.html:29876-29880`), and — critically — **all 12 must be added to `ALLOW_TRANSPARENCY`** in the atlas builder. The auto-population at `voxEx.html:29247-29265` only registers tiles referenced through a block's `textures` (i.e. just the frame-0 tiles via FIRE's config), so frames 1–3 of each layer would otherwise trip the validator's "tile has alpha < 255" warning (`voxEx.html:29929`) **and** miss the mipmap hidden-colour dilation (`voxEx.html:29938`) that prevents black bleed at distance. See §6.11.

---

## 6. Change list by subsystem

Each change below gives **Location → Insert → Affects → Why**. Code is concrete but line numbers are pre-change baselines.

### 6.1 Block ID constants

**Location:** `voxEx.html:3836-3852` (the `const AIR = 0, … UNLOADED_BLOCK = 255;` block), anchor `LONGWOOD_LEAVES = 14,`.

**Insert** (after `GLASS = 15,`):
```javascript
                GLASS = 15,
                FIRE = 16,
                BURNT_LOG = 17,
                BURNT_PLANKS = 18,
                UNLOADED_BLOCK = 255;
```

**Affects:** every downstream table sized 256 (auto-handled), all `=== BLOCKNAME` checks (new IDs only).
**Why here:** single source of truth for numeric IDs; everything else derives from `BLOCK_CONFIG` keyed by these.

---

### 6.2 TILE index map + `NUM_TILES`

**Location:** `voxEx.html:4005-4025` (the `const TILE = { … }` object and `const NUM_TILES = 18;`), anchor `GLASS: 17,`.

**Insert** (frames per layer MUST stay contiguous — the animation steps `offset.x` across them):
```javascript
                GLASS: 17,
                // Fire — 3 layers × 4 looping animation frames (contiguous per layer)
                FIRE_FREE_0: 18, FIRE_FREE_1: 19, FIRE_FREE_2: 20, FIRE_FREE_3: 21,
                FIRE_SIDE_0: 22, FIRE_SIDE_1: 23, FIRE_SIDE_2: 24, FIRE_SIDE_3: 25,
                FIRE_BOTTOM_0: 26, FIRE_BOTTOM_1: 27, FIRE_BOTTOM_2: 28, FIRE_BOTTOM_3: 29,
                BURNT_LOG_SIDE: 30,
                BURNT_LOG_TOP: 31,
                BURNT_PLANK: 32,
            };
            const NUM_TILES = 33;
            const FIRE_ANIM_FRAMES = 4;
            // Base (frame-0) tile of each fire layer — the animation driver (§6.7d) adds the frame index.
            const FIRE_LAYER_BASE = { free: TILE.FIRE_FREE_0, side: TILE.FIRE_SIDE_0, bottom: TILE.FIRE_BOTTOM_0 };
```

**Affects:** atlas width (now 33 columns — verify it stays under the GPU max texture size; at TILE_SIZE≤64 that's ≤2112 px, safe), UV step (`1/NUM_TILES`), atlas-column validation (`voxEx.html:29215`), inventory atlas slicing (`voxEx.html:30941`, `30960`), worker `NUM_TILES` copy (§6.10), the fire animation driver (§6.7d).
**Why here:** `TILE` ordering **must** match the draw order in `initTextures`; `NUM_TILES` must equal the number of tiles drawn or UVs shift atlas-wide.

---

### 6.3 BLOCK_CONFIG entries + `burnable`/`burnsTo`/`lightEmission`

**Location:** inside the `BLOCK_CONFIG` array, before the `UNLOADED_BLOCK` entry at `voxEx.html:4210-4219`. Also **edit existing entries** to add the `burnable` tag.

**6.3a — Tag existing burnable blocks.** Add `"burnable"` + a `burnsTo` field to the `tags` of all six fuel blocks (Resolved — §16 D2: every log → `BURNT_LOG`, every leaf → Air):

| Block | Line | New `tags` | `burnsTo` |
|-------|------|-----------|-----------|
| `GRASS` | `voxEx.html:4068` | `["solid", "burnable"]` | `DIRT` |
| `WOOD` (Planks) | `voxEx.html:4095` | `["solid", "burnable"]` | `BURNT_PLANKS` |
| `LOG` (Oak) | `voxEx.html:4104` | `["solid", "log", "burnable"]` | `BURNT_LOG` |
| `LEAVES` (Oak) | `voxEx.html:4113` | `["transparent", "leaves", "burnable"]` | `AIR` |
| `LONGWOOD_LOG` | `voxEx.html:4183` | `["solid", "log", "burnable"]` | `BURNT_LOG` |
| `LONGWOOD_LEAVES` | `voxEx.html:4192` | `["transparent", "leaves", "burnable"]` | `AIR` |

Example (GRASS):
```javascript
                // GRASS
                { id: GRASS, key: "grass", name: "Grass",
                  tags: ["solid", "burnable"], burnsTo: DIRT,
                  textures: { top: TILE.GRASS_TOP, side: TILE.GRASS_SIDE, bottom: TILE.DIRT },
                  ui: { showInInventory: true, tileIndex: TILE.GRASS_SIDE, defaultHotbar: true, hotbarOrder: 0 } },
                // LOG & LONGWOOD_LOG → BURNT_LOG ; WOOD → BURNT_PLANKS ; LEAVES & LONGWOOD_LEAVES → AIR (destroyed)
```

**6.3b — New block entries** (insert before `UNLOADED_BLOCK` at `voxEx.html:4210`):
```javascript
                // FIRE — transparent, walk-through, emissive, rendered as a separate model (like TORCH)
                {
                    id: FIRE,
                    key: "fire",
                    name: "Fire",
                    // transparent: no AO/light blocking, walk-through (not solid, not collidable)
                    // cutout: atlas tiles may have alpha (flame over transparency)
                    // emissive: marks it a light source; fire-specific behaviour via "fire" tag
                    tags: ["transparent", "cutout", "emissive", "fire"],
                    // FIRE is drawn by createWorldFire() (animated, §6.7), NOT via the chunk
                    // mesher. textures/tileIndex point at frame-0 tiles only — used for the
                    // static inventory icon; the in-world quads animate via §6.7d, not uvMap.
                    textures: { top: TILE.FIRE_FREE_0, side: TILE.FIRE_SIDE_0, bottom: TILE.FIRE_BOTTOM_0 },
                    ui: { showInInventory: true, tileIndex: TILE.FIRE_FREE_0, defaultHotbar: false },
                    lighting: { sunlightAttenuation: 0, blocklightAttenuation: 0 }, // light passes through
                    lightEmission: 14, // default block-light level → BLOCK_LIGHT_EMISSION[FIRE]; the `fireLightLevel` setting (§7) overrides it at runtime. Single source of truth — no separate FIRE_LIGHT_LEVEL const.
                },
                // BURNT_LOG — solid cube, burn result of every log type (Oak + Longwood)
                {
                    id: BURNT_LOG,
                    key: "burnt_log",
                    name: "Burnt Log",
                    // "log" tag KEPT (Resolved §16 D2) — tree logic treats it as wood.
                    // NOT "burnable" — already burnt, won't re-ignite.
                    tags: ["solid", "log"],
                    textures: { top: TILE.BURNT_LOG_TOP, side: TILE.BURNT_LOG_SIDE, bottom: TILE.BURNT_LOG_TOP },
                    ui: { showInInventory: true, tileIndex: TILE.BURNT_LOG_SIDE }, // placeable (Resolved §16 D5)
                },
                // BURNT_PLANKS — solid cube, burn result of WOOD
                {
                    id: BURNT_PLANKS,
                    key: "burnt_planks",
                    name: "Burnt Planks",
                    tags: ["solid"], // NOT "burnable"
                    textures: { all: TILE.BURNT_PLANK },
                    ui: { showInInventory: true, tileIndex: TILE.BURNT_PLANK }, // placeable (Resolved §16 D5)
                },
```

**Affects:** auto-derived `BLOCK_BY_ID`, `blockIds`, the tag Sets (§6.4), `INVENTORY_BLOCKS`, `initialHotbarSlots`, atlas `ALLOW_TRANSPARENCY` (fire is `cutout` → auto-added at `voxEx.html:29247-29265`), UV map (§6.9), solidity/opacity (`initBlockLookupTables`, auto via tags), transparency/attenuation (auto via tags+`lighting` at `voxEx.html:28845-28867`).
**Why here:** `BLOCK_CONFIG` is the documented single source of truth (`voxEx.html:4043-4051`); adding entries here auto-wires inventory, textures, transparency, and collision with no further table edits — except the genuinely new concepts (`burnable`, `burnsTo`, `lightEmission`) handled in §6.4 and §6.6.

> **`BURNT_LOG` "log" tag (Resolved §16 D2 — keep it):** keeping `"log"` puts it in `LOG_BLOCK_IDS`, which tree-meshing/canopy code consults. Since burnt logs are player-created/burn-result only (never placed by world-gen), this is low-risk; verify `LOG_BLOCK_IDS` membership (§11.1) and spot-check no odd tree-neighbour behaviour in a manual play-test.

---

### 6.4 Derive `BURNABLE_BLOCK_IDS` + `BURN_RESULT` table

**Location:** the tag-derived Sets loop at `voxEx.html:4270-4279`, anchor `if (block.tags.includes("fluid")) FLUID_BLOCK_IDS.add(block.id);`.

**Insert:**
```javascript
            const BURNABLE_BLOCK_IDS = new Set();
            const FIRE_BLOCK_IDS = new Set();
            // BURN_RESULT[id] = block id this burnable block leaves behind (default AIR)
            const BURN_RESULT = new Uint8Array(256).fill(AIR);
            for (const block of BLOCK_CONFIG) {
                if (block.tags.includes("log")) LOG_BLOCK_IDS.add(block.id);
                if (block.tags.includes("leaves")) LEAF_BLOCK_IDS.add(block.id);
                if (block.tags.includes("transparent")) TRANSPARENT_BLOCK_IDS.add(block.id);
                if (block.tags.includes("fluid")) FLUID_BLOCK_IDS.add(block.id);
                if (block.tags.includes("burnable")) BURNABLE_BLOCK_IDS.add(block.id);
                if (block.tags.includes("fire")) FIRE_BLOCK_IDS.add(block.id);
                if (block.burnsTo !== undefined) BURN_RESULT[block.id] = block.burnsTo;
            }
```
(Replace the existing 4274-4279 loop body — keep the existing four lines, append the three new ones.)

Add helper predicates next to `isLeafBlock`/`isLogBlock` (`voxEx.html:4305-4316`):
```javascript
            /** @param {BlockId} id @returns {boolean} */
            function isBurnable(id) { return BURNABLE_BLOCK_IDS.has(id); }
            /** @param {BlockId} id @returns {boolean} */
            function isFire(id) { return id === FIRE; }
```

**Affects:** the fire spread step (which neighbours can catch), the consume step (`BURN_RESULT`).
**Why here:** matches the existing tag→Set derivation pattern exactly, so `burnable` is "just another tag" and stays data-driven.

---

### 6.5 Solidity / collision / occlusion — table is auto, but six ad-hoc `=== TORCH` predicates MUST be updated

**6.5a — Lookup tables: no edit needed.** `initBlockLookupTables` (`voxEx.html:10178-10198`) is tag-driven: `FIRE` is `transparent` (→ `BLOCK_IS_SOLID=0`, `BLOCK_IS_OPAQUE=0`), burnt blocks are `solid` (default). So **anything that consults `BLOCK_IS_SOLID`/`BLOCK_IS_OPAQUE`/`IS_TRANSPARENT` is already correct.**

**6.5b — Ad-hoc predicates that DON'T use the tables (CRITICAL).** Several hot-path helpers hardcode `=== TORCH` / `=== WATER` instead of reading the lookup tables. Because they don't consult `BLOCK_IS_SOLID`, **fire is NOT automatically walk-through / non-occluding** — each of these must explicitly exclude `FIRE`, or fire will behave as a solid, sight-blocking block. This is the single most error-prone part of the integration.

| # | Function | Location | Current check | Required edit | Impact if missed |
|---|----------|----------|---------------|---------------|------------------|
| 1 | `isSolidBlock` (module fn — **player collision**, via `collide()` at `41013-41040`) | `voxEx.html:41008-41012` | `b !== AIR && b !== WATER && b !== TORCH` | add `&& b !== FIRE` | **Player cannot walk through fire; placed fire blocks the player. CRITICAL.** |
| 2 | `VoxelWorld.isSolidBlock` (method) | `voxEx.html:7241` | (verify body) | exclude `FIRE` if it mirrors #1 | secondary collision/query path |
| 3 | `pathCellSolid` (**zombie pathfinding**) | `voxEx.html:32819` | `b !== AIR && b !== WATER && b !== TORCH` | add `&& b !== FIRE` | zombies path AROUND fire and never enter it → **mob fire-damage rarely triggers** |
| 4 | `isFoamLand` (shoreline foam) | `voxEx.html:38956` | `id !== WATER && id !== AIR && id !== TORCH && id !== UNLOADED_BLOCK && !isLeafBlock(id)` | add `&& id !== FIRE` | foam laps against fire placed beside water (cosmetic) |
| 5 | volumetric point-light occlusion ray | `voxEx.html:41907` | `block !== AIR && block !== WATER && !isLeafBlock(block) && block !== TORCH && block !== GLASS` | add `&& block !== FIRE` | fire wrongly blocks god-rays / point-light volumetrics (cosmetic) |
| 6 | `shouldMergeBlocks` (greedy merge) | `voxEx.html:9542` | `id1 === AIR || id1 === WATER || id1 === TORCH || isLeafBlock(id1)` | **no edit required** (fire is skipped before meshing, §6.8) — listed for completeness | none |

> Zombie navigation also calls the module `isSolidBlock` (#1) at `voxEx.html:32492, 32525, 32757`, so fixing #1 makes zombies treat fire as walkable (they'll step into it and take damage — the desired behaviour). Mob nav also uses `pathCellSolid` (#3).

**Why this matters:** the original assumption that "tags make fire walk-through" is **false for this codebase** — collision and pathing predate the data-driven tables and were never refactored to use them. Treat 6.5b as mandatory, not optional. (Optional cleanup: refactor #1/#3 to `return !!BLOCK_IS_SOLID[b]` so future non-solid blocks are handled automatically — but that is a broader change; the targeted `&& !== FIRE` edits are the low-risk path for this CCR.)

---

### 6.6 Light emission — generalise the torch source check

Fire must emit block light. Today emission is hard-coded to `TORCH` in two places. Generalise both to a `BLOCK_LIGHT_EMISSION` table so torch behaviour is preserved and fire is added declaratively.

**6.6a — Build the emission table.** **Location:** end of the block-init transparency loop, `voxEx.html:28866-28867` (just after the `if (block.lighting)` block, before the closing `}` of the `for (const block of BLOCK_CONFIG)` at 28867).

First declare the array near the other 256-wide tables (next to `SUNLIGHT_ATTENUATION`/`BLOCKLIGHT_ATTENUATION` at `voxEx.html:16022-16023`):
```javascript
            const BLOCK_LIGHT_EMISSION = new Uint8Array(256); // 0 = not a light source
```
Then populate it inside the init loop (`voxEx.html:28858-28866` region):
```javascript
                    if (block.lightEmission) {
                        BLOCK_LIGHT_EMISSION[id] = block.lightEmission;
                    }
```
> Note: TORCH's level is dynamic (`getTorchBlockLightLevel()` depends on `SETTINGS.torchIntensity`, `voxEx.html:23659-23663`), so TORCH keeps using that function; `BLOCK_LIGHT_EMISSION` covers fire (and any future static emitter). Add a small accessor:
```javascript
            /** @param {BlockId} id @returns {LightLevel} */
            function getBlockEmission(id) {
                if (id === TORCH) return getTorchBlockLightLevel();
                return BLOCK_LIGHT_EMISSION[id] || 0;
            }
```
(Place near `getTorchBlockLightLevel`, `voxEx.html:23659`.)

**6.6b — Runtime propagation.** **Location:** `updateBlockLightAt`, `voxEx.html:24211-24218` and the neighbour-relight line `voxEx.html:24262`.

Replace the torch-only source detection:
```javascript
            function updateBlockLightAt(x, y, z, oldId, newId, tracker) {
                const wasSource = getBlockEmission(oldId) > 0;   // was: oldId === TORCH
                const isSource  = getBlockEmission(newId) > 0;   // was: newId === TORCH
                const currentLight = clampBlockLight(getBlockLight(x, y, z));
                const addQueue = [];
                const removeQueue = [];
                const baseLevel = isSource ? getBlockEmission(newId) : 0; // was: isSource ? torchLevel : 0
```
And at `voxEx.html:24262`:
```javascript
                            const desiredNeighbor = Math.max(computeNeighborBlockLight(nx, ny, nz), getBlockEmission(nId));
                            // was: ... nId === TORCH ? torchLevel : 0
```

**6.6c — Chunk-load block-light seed.** **Location:** the block-light BFS seed scan (calculates a chunk's stored `blockLight`), `voxEx.html:37156-37175`, anchor `if (blocks[idx] === TORCH) {`.

Generalise the seed so saved/loaded fire re-emits light:
```javascript
                // seed any emissive block (torch OR fire), not just torches
                for (let ly = 0; ly < chunkHeight; ly++) {
                    const yOff = ly << 8;
                    for (let lz = 0; lz < cs; lz++) {
                        const zOff = lz << 4;
                        for (let lx = 0; lx < cs; lx++) {
                            const idx = lx + zOff + yOff;
                            const emit = blocks[idx] === FIRE ? BLOCK_LIGHT_EMISSION[FIRE] : (blocks[idx] === TORCH ? torchLevel : 0);
                            if (emit > 0) { blockLight[idx] = emit; queue.push(lx, ly, lz, emit); }
                        }
                    }
                }
```
> **Single source of truth for fire emission:** use `BLOCK_LIGHT_EMISSION[FIRE]` everywhere (here, in `getBlockEmission`, and at runtime), seeded from `lightEmission: 14` in `BLOCK_CONFIG` and overridden by the `fireLightLevel` setting (§7). Do **not** introduce a parallel `FIRE_LIGHT_LEVEL` constant.
>
> The early-return guard at `voxEx.html:37157` is currently `if (torchLevel <= 0) return;` — that would skip fire seeding when torches are dimmed to 0. Change it to `if (torchLevel <= 0 && BLOCK_LIGHT_EMISSION[FIRE] <= 0) return;` so fire still seeds light independently of the torch intensity setting.

**Affects:** all block-light propagation (torch + fire). **This is the highest-correctness-risk change** — torch lighting must be regression-tested.
**Why here:** these are the only two seed points for block light (runtime edits + chunk generation/load). Generalising rather than copy-pasting a fire path keeps a single propagation algorithm.

> **Deliberate non-integration — fire gets baked block light only, NOT a dynamic `PointLight`.** Torches get *both* baked block light *and* a pooled `PointLight` via `torchLightPool.registerTorch(...)` in `setBlock` (`voxEx.html:24325`). `torchLightPool` rebuilds its positions from the `chunkTorches` map (`voxEx.html:12894-12898`), so adding fire dynamic lights would mean generalising the pool to also scan `chunkFires` — a larger change competing for the same `MAX_POINT_LIGHTS = 8` budget. For this CCR, fire relies on baked block light (the dominant component of torch lighting anyway), which the §6.6 generalisation already provides. If flickering dynamic fire light is wanted later, the integration point is `torchLightPool` (generalise to a `blockLightPool` keyed off both maps) — noted in §15.

---

### 6.7 Fire model rendering (mirror `createWorldTorch`)

**6.7a — Shared fire resources (3 animated materials) + composite `createWorldFire`.** **Location:** next to `createWorldTorch`, `voxEx.html:39388-39414`.

Each layer gets its **own material** backed by an **independent clone of the atlas texture** so its UV transform (`offset`/`repeat`) can scrub through that layer's 4 frames without disturbing `chunkMaterial.map` (the chunk atlas). Geometry keeps default `0..1` UVs — the texture transform selects the visible tile+frame, so **no `applyAtlasUV` / baked-UV helper is needed**, and animation is just an `offset.x` write (§6.7d).

Two material sets per layer support the **distance LOD** (Resolved §16 D9): an **animated** set whose `offset.x` the driver scrubs, and a **static** set frozen on frame 0 for distant fires. A fire model uses one set or the other; the throttled LOD pass swaps a model between them as the player moves (§6.7d).

```javascript
            let _sharedFireResources = null;
            function getSharedFireResources() {
                if (_sharedFireResources) return _sharedFireResources;
                const atlas = chunkMaterial.map;          // the shared atlas CanvasTexture (voxEx.html:30040)
                const layerMat = (baseTile) => {
                    const t = atlas.clone();              // clones share the image but have an INDEPENDENT transform
                    t.needsUpdate = true;
                    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; // pixel-art crisp
                    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
                    t.repeat.set(1 / NUM_TILES, 1);       // show exactly one tile column
                    t.offset.set(baseTile / NUM_TILES, 0);// frame 0 of this layer
                    const m = new THREE.MeshBasicMaterial({
                        map: t, transparent: true, alphaTest: 0.4,
                        depthWrite: false, side: THREE.DoubleSide,
                        // MeshBasic = full-bright (fire is its own light); fog optional
                    });
                    m.userData.isShared = true;
                    m.userData.fireBaseTile = baseTile;   // used by the animation driver
                    return m;
                };
                const quad = new THREE.PlaneGeometry(1, 1); // ONE shared unit quad for every layer
                quad.userData.isShared = true;
                _sharedFireResources = {
                    quad,
                    // animated set — driver advances offset.x; static set — frozen on frame 0 (distant LOD)
                    anim:   { free: layerMat(FIRE_LAYER_BASE.free), side: layerMat(FIRE_LAYER_BASE.side), bottom: layerMat(FIRE_LAYER_BASE.bottom) },
                    static: { free: layerMat(FIRE_LAYER_BASE.free), side: layerMat(FIRE_LAYER_BASE.side), bottom: layerMat(FIRE_LAYER_BASE.bottom) },
                };
                return _sharedFireResources;
            }

            // Side layer placement table: inward-facing wall quad per solid neighbour.
            // [flag, offsetX, offsetZ from cell origin, yRotation, layer]
            const _FIRE_SIDES = [
                ['sideNX', 0.02, 0.5,  Math.PI / 2],   // wall at -X, quad faces +X
                ['sidePX', 0.98, 0.5, -Math.PI / 2],   // wall at +X
                ['sideNZ', 0.5, 0.02,  0],             // wall at -Z, quad faces +Z
                ['sidePZ', 0.5, 0.98,  Math.PI],       // wall at +Z
            ];

            /**
             * Build a COMPOSITE fire model: every layer the attachment justifies (§3.2).
             * @param {GlobalCoord} x @param {GlobalCoord} y @param {GlobalCoord} z
             * @param {Object} att composite descriptor from computeFireAttachment()
             * @param {boolean} animated near-player? use the animated material set (§6.7d LOD)
             * @returns {THREE.Group}
             */
            function createWorldFire(x, y, z, att, animated) {
                const r = getSharedFireResources();
                const set = animated ? r.anim : r.static;
                const g = new THREE.Group();
                const addQuad = (layer, px, py, pz, rx, ry) => {
                    const m = new THREE.Mesh(r.quad, set[layer]);
                    m.position.set(px, py, pz);
                    if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry;
                    m.userData.fireLayer = layer;          // lets the LOD pass swap to the matching set
                    g.add(m);
                };
                if (att.floor) { addQuad('free', 0.5, 0.5, 0.5, 0, 0); addQuad('free', 0.5, 0.5, 0.5, 0, Math.PI / 2); }
                for (const [flag, ox, oz, ry] of _FIRE_SIDES) { if (att[flag]) addQuad('side', ox, 0.5, oz, 0, ry); }
                if (att.ceiling) addQuad('bottom', 0.5, 0.95, 0.5, -Math.PI / 2, 0);
                g.position.set(x, y, z);
                g.frustumCulled = true;                   // bound draw cost; fires only exist in loaded chunks
                g.userData.fireAnimated = animated;       // current LOD state (§6.7d toggles it)
                return g;
            }
```
> **Atlas texture reference:** there is **no** global `blockAtlasTexture`. The atlas `CanvasTexture` is the local `tex` in `initTextures` (`voxEx.html:29994`) → `chunkMaterial.map` (`30040`). Fire `.clone()`s it so its `offset`/`repeat` are independent (THREE clones share the image source but not the transform). `getSharedFireResources()` runs lazily on first fire spawn. **One** shared `PlaneGeometry` + **six** shared materials (3 animated, 3 static) serve every fire quad in the world → trivial memory; the §6.7d driver animates with 3 `offset.x` writes/step and the LOD pass only flips a far/near model's child-material references.

**6.7b — `chunkFires` registry + release.** **Location:** beside `chunkTorches`, `voxEx.html:12808`:
```javascript
            const chunkFires = new Map(); // Store fire 3D models per chunk (parity with chunkTorches)
```
Add `releaseChunkFires(baseKey)` mirroring `releaseChunkTorches` (`voxEx.html:39492+`): remove each group from the scene, **skip disposing the shared geo/materials** (they're `isShared`), and `chunkFires.delete(baseKey)`.

> **MEMORY-LEAK FIX (important):** `releaseChunkFires` must **also unregister the `fireSystem.cells` for that chunk.** When a chunk unloads, its fire *blocks* persist to disk but the simulation must stop and the registry entries must be freed — otherwise `fireSystem.cells` grows unbounded as the player explores a fire-y world (orphaned entries for unloaded fires that the tick only cleans lazily, and `fireMaxEditsPerTick` throttles even that). Since each fire group is positioned at its world cell, iterate the chunk's groups and `fireSystem.unregister(g.position.x, g.position.y, g.position.z)` before removing them. On chunk reload, §6.7c re-registers (age restarts — acceptable; the alternative, persisting age, isn't worth a save-format change). This ties the registry's lifetime to the model's, exactly as the cells' simulation should only run for loaded chunks.

**6.7c — Spawn fires during chunk render.** **Location:** the torch creation loop in the render path, `voxEx.html:40312-40356`, anchor `// --- CREATE TORCH MODELS ---`.

Add a parallel loop after the torch loop:
```javascript
                    releaseChunkFires(cKey);
                    const fireArray = [];
                    for (let y = 0; y < height; y++) {
                        const yOff = y * 256;
                        for (let z = 0; z < 16; z++) {
                            const zOff = z * 16;
                            for (let x = 0; x < 16; x++) {
                                if (blockData[x + zOff + yOff] !== FIRE) continue;
                                const wx = startX + x, wy = y - WORLD_DIMS.yOffset, wz = startZ + z;
                                const att = computeFireAttachment(wx, wy, wz); // composite descriptor (§3.2)
                                if (!att.any) continue; // unsupported cell — don't model it (tick will extinguish)
                                // Distance LOD (§6.7d): near fires animate, far fires spawn static on frame 0.
                                const animated = _fireNearPlayer(wx, wy, wz);
                                const model = createWorldFire(wx, wy, wz, att, animated);
                                scene.add(model);
                                fireArray.push(model);
                                fireSystem.register(wx, wy, wz, att); // sync tick registry on (re)load; register() is idempotent so re-mesh won't reset age (§6.13)
                            }
                        }
                    }
                    if (fireArray.length > 0) chunkFires.set(cKey, fireArray);
```
Also call `releaseChunkFires(...)` at **both** of the existing `releaseChunkTorches` call sites — `releaseMeshForKey` (`voxEx.html:39538`, the chunk-unload/disposal path) and the `renderChunk` rebuild loop (`voxEx.html:40316`). Those are the only two; mirroring both gives fire the exact same create-on-mesh / destroy-on-unload lifecycle as torches with no separate eviction bookkeeping.

**Affects:** scene graph, chunk lifecycle, the fire tick registry (rebuilt from chunk data on load — satisfies §3.3 persistence).
**Why here:** identical lifecycle to torches guarantees fires are created when a chunk meshes and destroyed when it unloads — no leaks, no manual bookkeeping.

**6.7d — Fire animation driver + distance LOD (D9).** **Location:** call both from the per-frame visual-effects pass (`updateVisualEffects`, `voxEx.html:42638`), or right after `fireSystem.update` in `animate()` — **gated on `isGameplayActive()`** so flames freeze with the rest of the world while paused (D11).

**Near fires animate; far fires sit frozen on frame 0** (Resolved §16 D9) — you can't perceive flicker at distance, and freezing them lets every distant flame share one static, never-touched material. The animation step advances **only** the animated material set (3 writes); the LOD pass (throttled) flips each fire model between the animated and static sets as the player moves.

```javascript
            // (1) Animate ONLY the animated set — far fires use the static set and never move.
            let _fireAnimFrame = 0, _fireAnimAccum = 0;
            function updateFireAnimation(dt) {
                if (!_sharedFireResources) return;                       // no fires spawned yet
                _fireAnimAccum += dt;
                const step = 1 / Math.max(1, SETTINGS.fireAnimationFps); // e.g. 8 fps → 0.125 s/frame
                if (_fireAnimAccum < step) return;
                _fireAnimAccum -= step;
                _fireAnimFrame = (_fireAnimFrame + 1) % FIRE_ANIM_FRAMES;
                const a = _sharedFireResources.anim;
                for (const k in a) a[k].map.offset.x = (a[k].userData.fireBaseTile + _fireAnimFrame) / NUM_TILES;
            }

            // (2) Distance LOD: flip each fire model's quads between the animated and static
            //     material sets based on distance to the player. Throttled; a distance check +
            //     occasional material-ref swap is cheap (no geometry work).
            let _fireLodAccum = 0;
            function _fireNearPlayer(x, y, z) {
                if (!controls) return true;
                const p = getPlayerWorldPosition();
                const R = SETTINGS.fireAnimationRadius;                  // e.g. 24 blocks
                const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, dz = z + 0.5 - p.z;
                return dx * dx + dy * dy + dz * dz <= R * R;
            }
            function updateFireLOD(dt) {
                if (!_sharedFireResources || chunkFires.size === 0) return;
                _fireLodAccum += dt;
                if (_fireLodAccum < 0.25) return;                       // ~4 Hz is plenty for LOD
                _fireLodAccum = 0;
                const r = _sharedFireResources;
                for (const arr of chunkFires.values()) {
                    for (const g of arr) {
                        const near = _fireNearPlayer(g.position.x, g.position.y, g.position.z);
                        if (near === g.userData.fireAnimated) continue; // no boundary crossing → skip
                        g.userData.fireAnimated = near;
                        const set = near ? r.anim : r.static;
                        for (const child of g.children) child.material = set[child.userData.fireLayer];
                    }
                }
            }
```
**Affects:** animation cost stays **O(1)** (3 offset writes/step); the LOD pass is a throttled distance check over the existing `chunkFires` models (bounded by loaded chunks × `fireMaxActive`, ~4 Hz) that only does work on the handful of models that cross the radius. Distant fires render a single shared static material (one frame), near fires animate.
**Why here:** reuses the already-existing `chunkFires` model list and the same distance pattern as particle culling; no new per-fire state beyond two booleans (`g.userData.fireAnimated`, child `fireLayer`). Spawn-time `_fireNearPlayer` seeds the correct set so a fire is right on its first frame; the throttled pass handles the player walking toward/away from persistent fires.

> **Tile-boundary bleed guard:** with `NearestFilter` + `repeat.x = 1/NUM_TILES`, sampling lands inside one column; if a half-texel seam ever shows the neighbouring frame, inset `repeat.x` by a half-texel (`(1/NUM_TILES) - (0.5/atlasWidthPx)`) — the same precaution the baked `uvMap` path relies on.

---

### 6.8 Exclude FIRE from ALL THREE mesh loops

> **There are three block→face loops, not two.** `renderChunk` (the active mesher) has **both** a greedy-slice path **and** a per-block path, plus the (currently gated-off) worker loop. The original draft patched only the per-block path; missing the greedy path would render fire as a solid cube in greedy-meshed chunks **and** double it with the separate model. All three need the skip.

**6.8a — Main-thread GREEDY path (ACTIVE).** **Location:** `voxEx.html:39163`, anchor `if (blockId === AIR || blockId === WATER || blockId === TORCH) continue;`.
```javascript
                            if (blockId === AIR || blockId === WATER || blockId === TORCH || blockId === FIRE) continue;
```

**6.8b — Main-thread PER-BLOCK path (ACTIVE).** **Location:** `voxEx.html:39987`, anchor `if (id === AIR || id === TORCH) continue; // Skip air and torches`.
```javascript
                                        if (id === AIR || id === TORCH || id === FIRE) continue; // torches/fire rendered separately
```

**6.8c — Worker mesh loop (GATED OFF — parity only).** **Location:** `voxEx.html:18208`, anchor `if (id === AIR || id === TORCH) continue;`.
```javascript
                            if (id === AIR || id === TORCH || id === FIRE) continue;
```
> The worker mesh pipeline is disabled today (`WORKER_MESH_PIPELINE_ENABLED = false`, `voxEx.html:13089`); `applyWorkerMeshData` is dead and doesn't even create torches yet (see warning at `voxEx.html:18972`). Patch 6.8c for parity so the code is correct when that pipeline is eventually enabled, but **expect it to be exercised only by the active main-thread paths (6.8a/6.8b) today.** When the worker pipeline IS enabled later, `applyWorkerMeshData` will additionally need fire-model creation (the §6.7c loop), exactly as it will need torch creation.

**Affects:** chunk geometry (fire excluded so it never becomes a meshed cube). Neighbour faces behind fire stay visible because fire is `transparent` (worker parity in §6.10).
**Why here:** these are the loops that turn block IDs into faces; each already special-cases TORCH for the same reason.

---

### 6.9 UV map — no edit needed (auto), but verify

**Location:** UV map build, `voxEx.html:28875-28905`.
**Action:** none — `uvMap[FIRE]`, `uvMap[BURNT_LOG]`, `uvMap[BURNT_PLANKS]` are auto-built from each entry's `textures`. `BURNT_LOG`/`BURNT_PLANKS` render as normal cubes using these. FIRE's `textures` (frame-0 tiles) feed only the static inventory icon — its in-world quads animate via §6.7d, not `uvMap`.
**Why noted:** confirms burnt blocks need **no** custom mesh code — they flow through the standard solid-cube path on both threads (UVs are passed to the worker via `uvMapData`, `voxEx.html:18760`, `18895`).

---

### 6.10 Worker parity

The worker keeps **hand-maintained** copies of a few tables (per CLAUDE.md). Required edits:

| Worker location | Edit | Why |
|-----------------|------|-----|
| `voxEx.html:17572-17574` (worker `const TORCH = 10; …`) | add `const FIRE = 16;` | the worker mesh skip (§6.8c) references `FIRE` |
| `voxEx.html:17587-17595` (`IS_TRANSPARENT_WORKER`) | add `IS_TRANSPARENT_WORKER[FIRE] = 1;` | so neighbour faces behind fire are **not** culled (parity with main `IS_TRANSPARENT`) |
| `voxEx.html:18208` | the skip from §6.8c | exclude fire from worker faces |

> **All §6.10 edits are parity-only today** — the worker mesh path is gated off (`WORKER_MESH_PIPELINE_ENABLED = false`). They prevent a latent bug if/when that pipeline is enabled, but the live fire rendering is driven entirely by §6.7 + §6.8a/§6.8b on the main thread.

**No worker edits needed for `BURNT_LOG`/`BURNT_PLANKS`** — they are opaque solids (default worker tables), and their UVs arrive via `uvMapData`. They are also **not** terrain/tree-generated, so the injected `__TERRAIN_FUNCS__` / `__TREE_FUNCS__` blocks (`voxEx.html:17890-17901`, `18356` `buildChunkWorkerCode`) need **no** changes.

> Parity check for the release checklist: confirm worker `NUM_TILES` (`voxEx.html:17574`) is updated to **33** to match §6.2 — `tileW = 1/NUM_TILES` is used in the worker UV write (`voxEx.html:18261`); a stale value misaligns every tile.

---

### 6.11 Texture drawing (`initTextures`)

**Location:** append after the Glass tile (the current last tile), `voxEx.html:29902` (just before the transparency-validation pass at `voxEx.html:29904`). Each tile advances the cursor with `logicalFillsize += TILE_SIZE;`.

Append the 15 tiles in **exactly** `TILE` order (18→32): the 12 fire frames first, then the 3 burnt tiles. The 12 fire frames are generated by a loop so the 4 frames of each layer are guaranteed contiguous. Pattern:
```javascript
                // ---- Fire animation frames: 3 layers × 4 frames (tiles 18–29) ----
                // Each frame is a cutout flame over transparency → clearRect first, then draw.
                const FIRE_LAYERS = ['free', 'side', 'bottom'];
                for (const layer of FIRE_LAYERS) {
                    for (let f = 0; f < FIRE_ANIM_FRAMES; f++) {
                        logicalFillsize += TILE_SIZE;
                        ctx.clearRect(logicalFillsize, 0, TILE_SIZE, TILE_SIZE);
                        // Deterministic per (layer, frame); frames sample ONE flame field at
                        // 4 evenly-spaced phases of a full loop so frame 3 → frame 0 is seamless.
                        drawFlameFrame(logicalFillsize, layer, f, FIRE_ANIM_FRAMES);
                    }
                }
                // ---- Burnt blocks (tiles 30–32) ----
                logicalFillsize += TILE_SIZE;
                drawLogSide(logicalFillsize, BURNT_PALETTE, new SeededRNG(12345 + TILE.BURNT_LOG_SIDE)); // 30
                logicalFillsize += TILE_SIZE;
                drawLogTop(logicalFillsize, BURNT_PALETTE, new SeededRNG(12345 + TILE.BURNT_LOG_TOP));   // 31
                logicalFillsize += TILE_SIZE;
                drawBurntPlank(logicalFillsize);                                                         // 32

                // ---- Register ALL 12 fire frames as cutout (CRITICAL) ----
                // Auto-population (voxEx.html:29247) only added the frame-0 tiles referenced by
                // FIRE.textures. Add the rest so the validator (29929) doesn't warn AND the
                // mipmap hidden-colour dilation (29938) runs on them (prevents black bleed).
                for (let t = TILE.FIRE_FREE_0; t <= TILE.FIRE_BOTTOM_3; t++) ALLOW_TRANSPARENCY.add(t);
```

**`drawFlameFrame(tileX, layer, frame, frameCount)` — procedural fire guidelines (so it reads as fire and loops):**
- **Palette / vertical gradient** (root → tip): deep red `#7a1500` → red-orange `#e63600` → orange `#ff7b00` → yellow `#ffcf3a` → near-white core `#fff3b0`. Hotter (brighter/whiter) toward the centre and base; cooler/darker at the edges and tips.
- **Silhouette:** a single tongue that is **wide at the root and narrows to a flicker tip**; carve transparency outside it. Add 1–2 small detached embers near the top.
- **Loop seam:** drive shape from a continuous phase `p = frame / frameCount` (0..1). Sample wobble as `sin(2π·(p + column/width))` etc. so the field is **periodic** — frame `frameCount-1` flows back into frame `0` with no jump. Do **not** use unconstrained `Math.random()` for the silhouette (it would strobe); use a seeded RNG **only** for static fine-grain speckle that's identical across frames, or omit it.
- **Per-frame motion:** advance the lateral phase and tip height slightly each frame (small amplitude — "mildly animated", per the request) so flames lick rather than thrash.
- **Layer variants:**
  - `free` (ground): symmetric tongue rooted at the **bottom** edge, tallest.
  - `side` (wall): rooted at the **bottom**, but **leaning away from the wall** (bias the tongue's horizontal centre toward +U) so it reads as climbing a surface.
  - `bottom` (ceiling): **vertically flipped** — rooted at the **top** edge, licking **downward**, gradient inverted (hot near the ceiling).
- Reference the existing inline torch-flame colours/shape at `voxEx.html:29764-29772`.
- Add `BURNT_PALETTE` near `OAK_PALETTE`/`LONGWOOD_PALETTE` (`voxEx.html:29287-29320`): near-black bark `#1c1410`, charcoal grooves `#0d0a08`, faint ember highlights `#5a3a22`. `drawBurntPlank` = dark charred fill `#1a1410` with sparse ember flecks.

**Affects:** the atlas canvas (now 33 columns), the validation pass (`voxEx.html:29904-29932`, now 33 tiles) — all 12 fire frames must be in `ALLOW_TRANSPARENCY` (added explicitly above; **not** auto-covered), and the mipmap dilation (`29938`).
**Why here:** tiles are drawn sequentially by a moving cursor; appending after the last tile keeps every existing index stable and only adds new columns. The frame loop keeps each layer's 4 frames contiguous for the `offset.x` animation (§6.7d).

---

### 6.12 Placement — set FIRE & compute attachment

**Location:** `tryPlaceBlock`, `voxEx.html:42906-42922`.

Today `tryPlaceBlock` blindly places `selectedBlockId`. Fire needs a support check (it can only exist next to a solid block). Add a guard before `setBlock`:
```javascript
            function tryPlaceBlock(x, y, z, fx, fy, fz) {
                const nx = x + fx, ny = y + fy, nz = z + fz;
                // ... existing player-overlap check ...
                if (selectedBlockId === FIRE) {
                    if (!hasFireSupport(nx, ny, nz)) return false;     // needs a solid/burnable face to cling to
                    if (getBlock(nx, ny, nz) !== AIR && getBlock(nx, ny, nz) !== FIRE) return false;
                    // D10: don't place fire next to water (it would douse next tick anyway)
                    if (SETTINGS.fireWaterExtinguish && hasWaterNeighbor(nx, ny, nz)) return false;
                }
                setBlock(nx, ny, nz, selectedBlockId);
                updateLocalArea(nx, ny, nz);
                if (selectedBlockId === FIRE) {
                    fireSystem.register(nx, ny, nz, computeFireAttachment(nx, ny, nz));
                } else if (SETTINGS.fireWaterExtinguish && selectedBlockId === WATER) {
                    // Pour water on fire: extinguish FIRE in the 6 neighbours immediately (D10).
                    extinguishFireNeighbors(nx, ny, nz);
                }
                // ... existing water-ripple check ...
                return true;
            }
```
- `hasFireSupport(x,y,z)`: true if **any of the 6 neighbours is `BLOCK_IS_SOLID` OR `isBurnable`** (§3.2 — burnable-but-non-solid leaves must count as support or canopies can't burn; *spread* is still burnable-only via `trySpreadFrom`). At placement this is a one-off call; the tick uses the combined `scanFireNeighbors` instead (§6.13).
- `computeFireAttachment(x,y,z)`: returns the **composite six-boolean descriptor** (`floor`/`ceiling`/`sideNX…sidePZ`/`any`) per §3.2 — used by `createWorldFire` for rendering at spawn/placement.
- `hasWaterNeighbor(x,y,z)` / `extinguishFireNeighbors(x,y,z)`: small 6-neighbour helpers for D10 — the first guards fire placement next to water; the second, called when WATER is placed, `setBlock(AIR)` + `fireSystem.unregister`s any adjacent FIRE for immediate "pour water on fire" feedback (the 2 Hz tick would catch it within 0.5 s regardless).

**Affects:** placement flow (mouse + touch both call `tryPlaceBlock`; the hold-to-place repeat at `voxEx.html:42588-42596` also routes here, so no extra wiring).
**Why here:** `tryPlaceBlock` is the single placement choke-point for desktop, touch, and hold-to-place; `setBlock` (`voxEx.html:24308`) already triggers lighting (now fire-aware via §6.6) and meshing (which spawns the fire model via §6.7c).

---

### 6.13 Fire simulation tick (state manager)

**Location:** new module-scope object near other systems; tick call inside `animate()` in the "Game active updates" / entity section, `voxEx.html:42640-42646` (after `updateZombies(clampedDt)`).

```javascript
            const fireSystem = {
                cells: new Map(),                 // key -> { key, x, y, z, age, fuel }  (NUMERIC coords stored on the value)
                _accum: 0,
                TICK_INTERVAL: 0.5,               // seconds (2 Hz) — keep off the per-frame path
                register(x, y, z, att) {
                    // IDEMPOTENT: §6.7c re-runs this on every chunk re-mesh — preserve age/fuel.
                    const key = x + ',' + y + ',' + z;
                    if (this.cells.has(key)) return;
                    this.cells.set(key, { key, x, y, z, age: 0, fuel: this._fuelBlock(x, y, z, att) });
                },
                unregister(x, y, z) { this.cells.delete(x + ',' + y + ',' + z); },
                _fuelBlock(x, y, z, att) { /* first isBurnable support (floor→side→ceiling) → {fx,fy,fz,id} | null */ },
                update(dt) {
                    if (this.cells.size === 0) return;
                    this._emitParticles(dt);                       // per-frame, throttled + distance-culled
                    this._accum += dt;
                    if (this._accum < this.TICK_INTERVAL) return;
                    const tickDt = this._accum; this._accum = 0;
                    const dirty = _fireDirtyChunks; dirty.clear();
                    let edits = 0;
                    // GC: iterate VALUES (numeric coords on the cell) — no key.split('/').map(Number)
                    // allocation per fire per tick. f.key gives a zero-alloc delete handle.
                    for (const f of this.cells.values()) {
                        if (edits >= SETTINGS.fireMaxEditsPerTick) break;  // round-robin the rest next tick
                        const x = f.x, y = f.y, z = f.z;
                        if (getBlock(x, y, z) !== FIRE) { this.cells.delete(f.key); continue; }
                        f.age += tickDt;
                        // ONE 6-neighbour scan: support (any solid) + fuel (first burnable) + anyBurnable,
                        // in a single pass. Avoids 3 separate 6×getBlock scans (hasFireSupport +
                        // _fuelBlock + anyBurnableNeighbor) — and every getBlock allocates a chunk-key
                        // string (voxEx.html:6892), so fewer calls = materially less GC. Writes into a
                        // reused scratch result (no per-fire object alloc).
                        const scan = scanFireNeighbors(x, y, z, _fireScan);
                        // CHUNK-BOUNDARY GUARD: if a neighbour chunk isn't loaded, getBlock returns
                        // UNLOADED/undefined → it reads as "not support". Don't extinguish on
                        // incomplete data — defer this fire until its neighbours load.
                        if (scan.unloaded) continue;
                        // WATER extinguishes fire (Resolved §16 D10): a WATER neighbour douses it.
                        if (SETTINGS.fireWaterExtinguish && scan.water) { extinguishFire(f, dirty); edits++; continue; }
                        if (!scan.any) { extinguishFire(f, dirty); edits++; continue; }
                        f.fuel = scan.fuel;
                        if (SETTINGS.fireSpread && Math.random() < SETTINGS.fireSpreadChance && this.cells.size < SETTINGS.fireMaxActive)
                            { if (trySpreadFrom(x, y, z, dirty)) edits++; }
                        if (f.fuel && Math.random() < SETTINGS.fireConsumeChance) { if (consumeFuel(f, dirty)) edits++; }
                        if (f.age > SETTINGS.fireMaxAge && !scan.anyBurnable) { extinguishFire(f, dirty); edits++; }
                    }
                    // ONE batched, non-immediate remesh per affected chunk (engine's queue). NOT
                    // updateLocalArea — that forces an IMMEDIATE remesh per edit (voxEx.html:40915).
                    for (const ck of dirty) scheduleChunkUpdate(ck.cx, ck.cz, false, "fire-tick");
                },
                _emitParticles(dt) {
                    // PERFORMANCE-CRITICAL: never iterate ALL fires unconditionally. Distance-cull +
                    // per-call emitter cap mirror the PLACED-TORCH loop (voxEx.html:41675-41710); the
                    // 500-particle pool no-ops when full (voxEx.html:14337) so we must not starve it.
                    if (!particleSystem || !SETTINGS.fireParticles || !controls) return;
                    this._fxTimer = (this._fxTimer || 0) - dt;
                    if (this._fxTimer > 0) return;
                    this._fxTimer = 0.08;                         // ~12 Hz emit window
                    const p = getPlayerWorldPosition();           // reference, no alloc (voxEx.html:11214)
                    const rSq = SETTINGS.fireParticleRadius * SETTINGS.fireParticleRadius;
                    let emitted = 0;
                    for (const f of this.cells.values()) {        // numeric coords — no key parsing
                        if (emitted >= SETTINGS.fireMaxEmittersPerFrame) break;   // hard cap
                        const dx = f.x + 0.5 - p.x, dy = f.y + 0.5 - p.y, dz = f.z + 0.5 - p.z;
                        if (dx * dx + dy * dy + dz * dz > rSq) continue;          // distance cull
                        particleSystem.spawnTorchFlame(f.x + 0.5, f.y + 0.55, f.z + 0.5);
                        if (Math.random() < 0.25) particleSystem.spawnTorchEmber(f.x + 0.5, f.y + 0.75, f.z + 0.5);
                        emitted++;
                    }
                }
            };
            // Dirty-chunk set keyed by string but storing {cx,cz} so the flush needs no string parse.
            // Bounded by fireMaxEditsPerTick (≤32), so the per-tick churn is negligible.
            const _fireDirtyChunks = { _m: new Map(), clear() { this._m.clear(); },
                add(cx, cz) { const k = cx + ',' + cz; if (!this._m.has(k)) this._m.set(k, { cx, cz }); },
                [Symbol.iterator]() { return this._m.values(); } };
            const _fireScan = { any: false, fuel: null, anyBurnable: false }; // reused scratch (no per-fire alloc)
            function fireCount() { return fireSystem.cells.size; }
```
Supporting functions (same scope). They call `setBlock` (handles light + cache invalidation) and record the touched chunk via `dirty.add(cx, cz)`; they do **not** call `updateLocalArea`. **All take the cell object or coords directly — none re-parse a key string:**
- `scanFireNeighbors(x,y,z,out)` → ONE pass over the 6 faces: sets `out.any` (any **solid-or-burnable** support, §3.2), `out.fuel` (first `isBurnable` support `{fx,fy,fz,id}` or `null`, floor→side→ceiling priority), `out.anyBurnable` (any burnable in the 6), `out.water` (any neighbour is `WATER` — triggers extinguish, §16 D10), and `out.unloaded` (any neighbour returned `undefined`/`UNLOADED_BLOCK` — defer, §10.3 L2). Returns `out` (the reused scratch). Replaces the separate `hasFireSupport`/`computeFireAttachment`/`anyBurnableNeighbor` calls in the tick — `computeFireAttachment` is still used at spawn/placement where the full face descriptor is needed for rendering.
- `extinguishFire(f,dirty)` → `setBlock(f.x,f.y,f.z,AIR); fireSystem.cells.delete(f.key); dirty.add(f.x>>4, f.z>>4);`
- `trySpreadFrom(x,y,z,dirty)` → pick a neighbour cell that is `AIR`, **adjacent to an `isBurnable` block (spread is burnable-only, §16 D4)**, has support, **and is not adjacent to `WATER`** (D10 — fire won't spread next to water); `setBlock(nbr, FIRE)`, `fireSystem.register(nbr, computeFireAttachment(nbr))`, `dirty.add(...)`; returns true if it placed fire.
- `consumeFuel(f,dirty)` → `f.fuel` is `{fx,fy,fz,id}` (guaranteed non-null by the caller); `setBlock(f.fuel.fx,f.fuel.fy,f.fuel.fz, BURN_RESULT[f.fuel.id])`, `dirty.add(f.fuel.fx>>4, f.fuel.fz>>4)`, then null `f.fuel`; returns true. If the result is `AIR` (leaves) the fire may lose support and self-extinguish next tick.

Wire into `animate()` (`voxEx.html:42643`):
```javascript
                    updateZombies(clampedDt);
                    // PAUSE GATE (Resolved §16 D11): only simulate fire during active gameplay,
                    // so the world doesn't burn down behind the pause/inventory menus.
                    if (isGameplayActive()) fireSystem.update(clampedDt);
                    updatePlayerBody(clampedDt);
```
> The animation + LOD driver (§6.7d) is likewise gated on `isGameplayActive()` for consistency — flames freeze while paused. (Cheap either way, but a frozen world with animating flames looks wrong.)

**`fireSystem` is justified as its own system** (it owns spatial state + a cadence nothing else provides), but every *edge* it touches integrates with an existing system rather than reinventing one: edits → `setBlock` + batched `scheduleChunkUpdate`; light → the `updateBlockLightAt` path (§6.6); particles → `spawnTorchFlame`/`spawnTorchEmber`; models → the `renderChunk` spawn loop (§6.7c); mob damage → the mob-rule list (§6.14).

**Affects:** per-frame loop (adds one cheap, gameplay-gated call; heavy logic throttled to 2 Hz), block edits via `setBlock` + batched `scheduleChunkUpdate` (fire models respawn through §6.7c when affected chunks re-mesh).
**Why here:** the entity/update section is the established home for gameplay simulation (zombies tick right above it); the explicit `isGameplayActive()` gate keeps fire paused with the rest of gameplay (unlike `updateZombies`, which ticks unpaused — fire deliberately does not copy that quirk).

> **Spread containment:** `SETTINGS.fireMaxActive` (default 256) bounds total active fires + scene nodes (the spread step checks `this.cells.size < SETTINGS.fireMaxActive`; `fireCount()` is the external accessor), conceptually mirroring `MAX_TORCHES_PER_CHUNK = 64` (`voxEx.html:40324`). `SETTINGS.fireMaxEditsPerTick` (default 32) bounds edits/tick.

> **⚠ Mesh-thrash — resolved by batched updates (above).** The naïve approach (calling `updateLocalArea` per edit) forces an **immediate** remesh each time (`voxEx.html:40915`) and would thrash; a spreading tree fire (each `leaves→AIR` + each new `FIRE` = one `setBlock`) is the worst case. The `update()` snippet above avoids this by (a) collecting affected chunks into `_fireDirtyChunks` and issuing **one non-immediate `scheduleChunkUpdate(cx,cz,false)` per chunk per tick** (rides the engine's existing de-duped queue), and (b) capping edits via `fireMaxEditsPerTick` with round-robin. **Optional further win:** make §6.7c incremental — diff `chunkFires` against the chunk's `FIRE` cells and add/remove only deltas instead of rebuilding all fire models on every remesh. Defer unless profiling flags it.

---

### 6.14 Entity damage

**Mobs (zombies) — integrate as a mob RULE, not a separate pass.** Zombies already run a per-mob rule list `MOB_RULE_SETS.zombie` each frame (`voxEx.html:33459-33468`) with a shared `_mobCtx`, and one of those rules — `burnInSunlight` (`voxEx.html:32987-33012`) — already implements exactly the machinery fire needs: it sets `ud.burning`, applies `ud.health -= DPS * ctx.dt`, runs throttled flame/ember FX via `ud.burnFxTimer`, and calls `startMobDeath(mob)` at `health <= 0`. **Fire damage should reuse this, not duplicate it.** Two clean options:

- **Preferred — extend `burnInSunlight`'s burning condition.** After the sunlight check, also set `ud.burning = true` (and damage source DPS) when the mob occupies a fire cell: `if (fireSystem.cells.has(blockKeyOf(mob.position))) ud.burning = true;`. The existing DPS/FX/death code then runs unchanged. Simplest, fully reuses the burning visual state. (If fire DPS should differ from sunburn, branch the DPS on the cause.)
- **Alternative — add a sibling `burnInFire` rule** to `MOB_RULE_SETS.zombie` that does the per-mob fire-cell test (`fireSystem.cells.has(key)`, O(mobs), max 10) and applies `SETTINGS.fireDPS * ctx.dt` + `startMobDeath`. Use this if you want fire damage decoupled from the sunburn flag.

Either way the cost is one Map lookup per mob per frame inside the existing loop — **no separate spatial pass, no new iteration over fires**. **Prerequisite:** the zombie-nav fix in §6.5b #1/#3 (fire excluded from `isSolidBlock`/`pathCellSolid`) — without it zombies route around fire and never enter it.

**Player — DEFERRED to a follow-up CCR (Resolved §16 D6).** Today zombies deal **no** player damage "by design (no player-health system yet)" (`voxEx.html:33044-33047`). Since no player-health system exists, **player fire damage is out of scope for this CCR** — the mob rule above damages **mobs only**. The player-health subsystem (§9) is the prerequisite for a future CCR that adds a player-side fire-cell check (mirroring the mob rule) plus zombie melee damage.

---

## 7. Settings additions

**Location:** add defaults in `DEFAULTS` (~`voxEx.html:5284` region) and wire into `SETTINGS` (~`voxEx.html:5067`), plus DOM bindings in the settings UI (~`voxEx.html:28800+`), per the documented settings recipe (CLAUDE.md "When adding settings").

| Key | Default | Purpose |
|-----|---------|---------|
| `fireSpread` | `true` | master toggle for spread |
| `fireSpreadChance` | `0.10` | per-tick spread probability |
| `fireConsumeChance` | `0.20` | per-tick fuel-consume probability |
| `fireMaxAge` | `15` (s) | burnout time with no fuel |
| `fireDPS` | `3` | damage/second to mobs in fire (consumed by the §6.14 mob rule) |
| `fireMaxActive` | `256` | global active-fire cap (spread step checks this) |
| `fireMaxEditsPerTick` | `32` | per-tick edit budget (anti-thrash, round-robin remainder) |
| `fireLightLevel` | `14` | block-light emission; apply-callback writes `BLOCK_LIGHT_EMISSION[FIRE]` and triggers a relight (single source of truth — no separate `FIRE_LIGHT_LEVEL` const) |
| `fireParticles` | `true` | flame/smoke particle toggle (can ride existing torch-particle settings) |
| `fireWaterExtinguish` | `true` | a WATER neighbour douses fire and blocks spread next to water (§16 D10) |
| `fireParticleRadius` | `20` | only fires within this many blocks of the player emit particles (perf cull, §6.13) |
| `fireMaxEmittersPerFrame` | `24` | hard cap on fires emitting per frame-window (protects the 500-particle pool) |
| `fireAnimationFps` | `8` | flame animation speed; drives the §6.7d `offset.x` frame stepping |
| `fireAnimationRadius` | `24` | fires beyond this many blocks freeze on frame 0 (static LOD, §6.7d D9) |

These belong under a new **Gameplay → Fire** settings group (or **Graphics → Effects** for the particle/light ones). All must round-trip through save/load (`saveSettings`). **Add the four caps (`fireMaxActive`, `fireParticleRadius`, `fireMaxEmittersPerFrame`, `fireAnimationRadius`) to `SETTINGS_PROFILES`** so they scale with the Performance/Balanced/Quality profiles (smaller on low-end) — see §10.2 P3. Per the touch-settings precedent, only keys a profile lists are overwritten, so user-tuned values survive profile switches for keys left out.

---

## 8. Persistence & cache version

- **Blocks persist for free.** `FIRE`/`BURNT_LOG`/`BURNT_PLANKS` are ordinary `Uint8` cell values; RLE v2 + OPFS binary already store arbitrary block IDs. No codec change.
- **Fire metadata is transient.** `age`/`state` are recomputed on load by the §6.7c scan (`fireSystem.register`), so the save format is unchanged.
- **Cache version (`CURRENT_CACHE_VERSION = 5`, `voxEx.html:26028` & `37884`):** a bump is **not required** for existing worlds, because the new blocks don't change the lighting of any *existing* block, and the §6.6 generalisation produces identical torch results. **However**, if §6.6c changes how a previously-saved chunk's `blockLight` is interpreted (it does not, for torches), or if you want to force a relight, bump to **6** and update both occurrences plus `_cacheVersion` writes (`voxEx.html:25929`, `26104`, `37906`). **Recommendation: do not bump**, and instead verify torch lighting is byte-identical in tests (§11).

---

## 9. Follow-up dependency: minimal player-health subsystem (NOT in this CCR)

**Deferred (Resolved §16 D6).** There is **no player health today** (`voxEx.html:33044-33047`), so player fire damage is **excluded from this CCR**. This section is retained as the spec for a **future** CCR; nothing here is built as part of fire. The fire system ships fully functional against mobs without it.

Minimal proposal (future CCR):
- **State:** `let playerHealth = PLAYER_MAX_HEALTH (e.g. 20); let playerMaxHealth = 20; let isPlayerDead = false;` near other player state.
- **HUD:** a health bar/hearts element added to the HUD DOM (the HUD lives in the UI layer, `voxEx.html` lines 1–1550), updated by `UIManager`.
- **API:** `function damagePlayer(amount, cause)` (clamp ≥ 0, set `isPlayerDead` at 0, trigger respawn), `function healPlayer(amount)`, passive regen optional.
- **Respawn:** on death, reset position to spawn (reuse the spawn-coords used by world creation) and restore health.
- **Wire-ups:** player fire damage (a player-side mirror of the §6.14 mob fire-cell check → `damagePlayer`), and — bonus — finally enable `ZOMBIE_CONFIG.attackDamage` at `voxEx.html:33043-33048`.
- **Persistence:** save `playerHealth` in the world save JSON (alongside player pos/inventory).

This was the largest and riskiest part of the original scope; descoping it (D6) keeps this CCR focused and shippable. The fire system fully functions against mobs without it.

---

## 10. How it fits the existing architecture

- **Single-file rule:** every change is inside `voxEx.html`. ✔
- **"Only squares" aesthetic:** fire uses flat square `PlaneGeometry` quads, no curved geometry. ✔
- **Data-driven blocks:** new blocks/tags flow through `BLOCK_CONFIG`; `burnable` is just a tag, `burnsTo`/`lightEmission` are two small declarative fields. ✔
- **Performance-first:** fire excluded from meshing; simulation throttled to 2 Hz with per-chunk and global caps; particles distance-culled + capped (reuse the pooled torch particles); animation is 3 shared-material offset writes; per-frame mob-damage cost is one Map lookup per mob. ✔

### 10.1 Integration map — every fire concern hooks an existing system

| Fire concern | Integrates with (existing) | New code | Notes |
|--------------|---------------------------|----------|-------|
| Block identity / inventory / textures / solidity / transparency | `BLOCK_CONFIG` + derived tables | tag/field values only | fully data-driven |
| `burnable` / `burnsTo` | tag→Set derivation loop (§6.4) | 3 lines | same pattern as `log`/`leaves`/`fluid` |
| Separate-model render + lifecycle | `chunkTorches` create/release (§6.7) | `chunkFires`, `createWorldFire` | identical create-on-mesh / destroy-on-unload |
| Mesh exclusion | the 3 mesh loops (§6.8) | `\|\| id===FIRE` ×3 | mirrors TORCH skip |
| Block-light emission + propagation | `updateBlockLightAt` + seed scan (§6.6) | generalise to `BLOCK_LIGHT_EMISSION` | one algorithm, torch + fire |
| Flame/smoke particles | `spawnTorchFlame`/`spawnTorchEmber` + the **placed-torch distance-culled emit loop** (`voxEx.html:41675`) | radius-culled, capped emitter | same pattern as placed torches; protects the 500 pool |
| Flame animation + distance LOD | atlas `CanvasTexture` `.clone()` + `offset`/`repeat`; `chunkFires` model list | `updateFireAnimation` + `updateFireLOD` | 3 offset writes/step; far fires freeze on frame 0 (static material), throttled swap |
| Placement | `tryPlaceBlock` choke-point (§6.12) | support guard | covers mouse+touch+hold |
| Chunk edits from tick | `setBlock` + batched `scheduleChunkUpdate` (§6.13) | per-tick dirty-set flush | avoids immediate-remesh thrash |
| Mob damage | mob-rule list + `burnInSunlight` machinery (§6.14) | 1 condition or 1 rule | reuses `ud.burning`/`startMobDeath` |
| Settings | `DEFAULTS`/`SETTINGS`/save-load recipe (§7) | 12 keys | standard wiring; caps should scale per profile (§10.2) |
| Persistence | RLE + OPFS block storage | none | block IDs persist free |
| **Tick scheduler / spatial registry** | *(none suitable)* | **`fireSystem` — genuinely new** | owns fire-cell state + 2 Hz cadence; no existing block-tick system to reuse |

The only genuinely standalone addition is `fireSystem` (state + cadence); everything else rides an existing seam. The deliberate non-integration is the dynamic `PointLight` (fire uses baked block light only — see §6.6 note).

- **Reuses proven lifecycles:** torch render/cleanup, torch light propagation, mob-rule damage, tag-Set derivation, atlas tile cursor, `setBlock` facade + batched chunk-update queue. ✔

### 10.2 GC / memory / performance review

This codebase is allocation-conscious (typed arrays, object pools, scratch objects — CLAUDE.md "Anti-Patterns"). The fire design is held to the same bar. Issues found in this review and how the spec addresses them:

| # | Concern | Where | Severity | Resolution in this CCR |
|---|---------|-------|----------|------------------------|
| G1 | **Per-fire key parsing** `key.split(',').map(Number)` (2 array allocs) ran per fire **per tick AND per emit** → heavy GC at 256 fires | tick + particles | **High** | Fixed (§6.13): cells store numeric `{key,x,y,z,age,fuel}`; hot loops iterate `cells.values()`; deletes use `f.key`. Zero per-fire parsing. |
| G2 | **`getBlock` allocates a chunk-key string on every call** (`voxEx.html:6892`, even cache hits); the tick's 3 separate 6-neighbour scans = ~18 `getBlock`/fire/tick → ~9k key-string allocs/s at 256 fires | tick neighbour scans | **High** | Fixed (§6.13): one combined `scanFireNeighbors` per fire (≤6 `getBlock`) into a reused scratch — ~3× fewer calls; result object reused (no per-fire alloc). |
| M1 | **`fireSystem.cells` leak on chunk unload** — orphaned entries for unloaded fires grow unbounded as the player travels | `releaseChunkFires` | **High** | Fixed (§6.7b): `releaseChunkFires` unregisters the chunk's cells. Registry lifetime = model lifetime = loaded-chunk lifetime. |
| P1 | **Emissive-fire light cost** — every spread/consume/extinguish `setBlock` triggers a torch-level (level-14) block-light BFS flood via `updateBlockLightAt`; a spreading fire fires many floods/tick. This is the **dominant per-edit cost**, far more than a normal block edit. | `setBlock`→`updateBlockLightAt` | **High** | Bounded by `fireMaxEditsPerTick` (default lowered guidance: keep ≤16–32) + 2 Hz throttle + batched remesh. Documented as the reason to tune the edit cap conservatively; the light algorithm itself is unchanged (reused, §6.6). |
| P2 | **Transparent overdraw + per-frame transparency sort** — up to 7 quads/fire × `fireMaxActive` (≈1.8k transparent meshes), all `depthWrite:false` → THREE re-sorts transparent objects every frame + GPU overdraw | rendering | **Med** | `frustumCulled:true` on each fire group; bounded by `fireMaxActive` and render distance (fires only exist in loaded chunks); shared geometry/material minimises state changes. **Optional:** set a fixed `renderOrder` on fire to group draws; lower `fireMaxActive` on the Performance profile (§10.2 note below). |
| M2/G3 | **Mesh/Group churn** — §6.7c tears down and rebuilds **all** fire models in a chunk on **any** block change there; a spreading chunk rebuilds Groups+Meshes every edit → allocation + GC | `renderChunk` rebuild | **Med** | Acceptable at the edit cap, but **elevate the §6.13 "incremental fire-model upkeep"** (diff `chunkFires` vs the chunk's FIRE cells, add/remove deltas) from optional to recommended once profiling shows churn; or pool fire Groups/Meshes like the chunk-mesh pools. Documented. |
| M3 | **Cloned-texture VRAM** — 6 `atlas.clone()` textures | `getSharedFireResources` | Low | In THREE r160 clones share the `Source` (one GPU upload), so VRAM ≈ one extra atlas at most. **Verify** `image`/`source` sharing on the target THREE build; if a build re-uploads per clone, switch to 1 clone with per-draw `offset` (lose simultaneous-frame independence) or a tiny dedicated fire strip. |
| P3 | **Profile scaling** — fire caps are flat defaults; the engine has Performance/Balanced/Quality profiles that already scale effects | `SETTINGS_PROFILES` | Low | Add `fireMaxActive`/`fireParticleRadius`/`fireMaxEmittersPerFrame`/`fireAnimationRadius` to the profiles so low-end devices get smaller caps (Performance) and high-end more (Quality). |
| P4 | **MemoryBudgetManager blind spot** — fire scene-nodes/cells aren't counted by the auto-scaler | memory mgr | Low | Under pressure the manager drops render distance → chunks unload → fires unload (M1 fix makes this fully reclaim). No action needed beyond M1; noted for awareness. |
| G4 | **Particle options-object alloc** — `spawnTorchFlame/Ember` allocate an options literal per spawn (existing engine behaviour) | particle spawn | Low | Inherited, not fire-specific; bounded by `fireMaxEmittersPerFrame`. No change. |

**Net:** the two High-severity GC items (G1, G2) and the High memory leak (M1) are **fixed inline** in the rev. 6 snippets. P1 (light-flood cost) is the headline *runtime* cost and is bounded by the edit cap + throttle — call it out in tuning. M2/G3 (model churn) and P2 (overdraw) are bounded by the active cap but should be watched; the incremental-upkeep path is the escape hatch. P3 (profile scaling) is a cheap, recommended polish.

### 10.3 Lifecycle & gameplay edge cases (rev. 7)

Behaviours beyond the steady-state hot path — where fire meets the rest of the game's lifecycle and player interactions:

| # | Edge case | Detail (code) | Severity | Resolution / recommendation |
|---|-----------|---------------|----------|------------------------------|
| L1 | **World load / switch must clear fire state** | `loadWorld` (`voxEx.html:25733-25742`) clears the scene by calling `releaseMeshForKey` per chunk → `releaseChunkTorches`. Fire piggybacks **iff** `releaseChunkFires` is wired into `releaseMeshForKey` (it is, §6.7c). **But** a fire-only chunk with no terrain mesh isn't in `chunkMeshes`, so its models/cells wouldn't be cleared → ghost fires + `cells` leak across worlds. | **Med-High** | In `loadWorld`'s scene-clear block add an explicit `fireSystem.cells.clear()` and a `chunkFires` sweep (remove every group from the scene, then `chunkFires.clear()`). Do the same in any other world-reset/new-world path. Belt-and-suspenders over the transitive cleanup. |
| L2 | **Chunk-boundary fire vs. unloaded neighbours** | At a chunk edge, a neighbour in an unloaded chunk makes `getBlock` return `UNLOADED`/`undefined` → reads as "no support" → fire wrongly extinguishes during streaming. | **Med** | **Fixed inline (§6.13):** `scanFireNeighbors` sets `out.unloaded`; the tick `continue`s (defers) when a neighbour is unloaded instead of extinguishing. |
| L3 | **Leaves are burnable but non-solid** | Solid-only support would make canopies un-burnable. | **High** | **Fixed inline (§3.2):** support = solid **OR** burnable (refines D4). |
| L4 | **Simulation runs while paused** | `fireSystem.update` is wired after `updateZombies`, which sits **outside** the `if (isGameplayActive())` block (`voxEx.html:42600-42617`) — so fire would spread/consume while the pause menu is open. | **Med** | **Resolved (D11):** `fireSystem.update` + the animation/LOD driver are gated on `isGameplayActive()` (§6.13, §6.7d) — sim and flames freeze while paused. |
| L5 | **Hand-extinguish via the mining flow** | `pickVoxel` (`voxEx.html:40959`) stops on any non-AIR/non-WATER block, so the crosshair targets fire (like a torch). Left-click routes through hold-to-mine → `breakProgress` over `BREAK_TIME` (0.3 s) → `setBlock(AIR)`, and spawns **block-break** particles using `getBlockParticleColor(FIRE)` (no entry → default colour). | **Med** | Special-case FIRE in `onMouseClick` (`voxEx.html:42955`): left-click on fire = **instant** `setBlock(AIR)` + `fireSystem.unregister` + ember particles (not the 0.3 s mine + block-break burst). Also note: fire blocks the raycast to blocks behind it — consistent with torches, accepted. |
| L6 | **Map mutation during iteration** | `trySpreadFrom` calls `register` (adds to `cells`) **during** the `for (…of cells.values())` tick loop; JS includes newly-added entries in the same iteration → a freshly-spread fire can tick the same frame (cascade). | Low | Bounded by `fireMaxEditsPerTick`. If same-tick cascades are undesirable, tag new cells with `spawnedTick` and skip them until the next tick. |
| L7 | **Fire while held in hotbar** | The held-block viewmodel/third-person hand renders the selected block as a cube; FIRE would show a cube wrapped in the transparent `FIRE_FREE_0` flame tile — visually odd. | Low | Optional: suppress the held-block model for FIRE, or show a small torch-style flame. Cosmetic. |
| L8 | **Forward-compat (new save in old build)** | A save containing IDs 16–18 opened in a pre-fire build renders them via the default UV (`DIRT`) and default tables — garbage, not a crash. | Low | Forward-compat isn't guaranteed; note in release notes. No action. |
| L9 | **Audio** | Minecraft fire crackles; `AudioManager` exists (procedural SFX). | Low | Out of scope; future polish — a distance-culled ambient crackle could reuse the placed-torch emit pattern. |
| L10 | **Shadows** | Fire meshes are `MeshBasicMaterial`; `THREE.Mesh` defaults `castShadow=false`/`receiveShadow=false`. | Low | Confirm fire neither casts nor receives shadows (it's full-bright). Default is correct; just verify. |
| L11 | **Frame-budget spike** | A full tick (up to `fireMaxEditsPerTick` light floods) lands in a single frame every 0.5 s. | Low-Med | The edit cap bounds it; if spikes show in profiling, integrate `shouldYield()`/frame-budget to spread edits across ticks, or lower the cap. |
| L12 | **Water ↔ fire** | Fire next to water, or water poured on fire. | — | **Resolved (D10):** WATER neighbour douses fire (§6.13), blocks spread (`trySpreadFrom`), blocks placement, and placing WATER extinguishes adjacent fire (§6.12). Toggle `fireWaterExtinguish`. |

---

## 11. Testing plan (verification)

Per CLAUDE.md, all changes must pass `tools/voxex-tests.html` (~204 tests, served over localhost). Add/extend:

> **Test-seam wiring (prerequisite):** the suite reads constants off `window.VoxEx` (`voxEx.html:43751-43759`). Add `FIRE, BURNT_LOG, BURNT_PLANKS, BURNABLE_BLOCK_IDS, BURN_RESULT, BLOCK_LIGHT_EMISSION` (and any new predicate fns under test) to that export object, or the new tests below can't reach them.

1. **Block-table invariants:** `FIRE` transparent + not solid + not opaque; `BURNT_LOG`/`BURNT_PLANKS` solid + opaque; `BURN_RESULT` maps GRASS→DIRT, LOG→BURNT_LOG, LONGWOOD_LOG→BURNT_LOG, WOOD→BURNT_PLANKS, LEAVES→AIR, LONGWOOD_LEAVES→AIR; `BURNABLE_BLOCK_IDS` membership (all 6 fuels, NOT burnt blocks).
2. **Collision & pathing (critical — §6.5b):** assert `isSolidBlock(fireCell) === false` (player walks through fire) and `pathCellSolid(fireCell) === false` (zombies enter fire); assert `isSolidBlock` still returns `true` for normal solids and burnt blocks. This is the regression guard for the headline bug.
3. **Lighting regression (critical):** assert torch block-light propagation is **unchanged** after §6.6 (compare a known column's `blockLight` before/after); assert FIRE seeds light at `BLOCK_LIGHT_EMISSION[FIRE]` and propagates with −1/step.
4. **Mesh exclusion:** assert a chunk containing FIRE produces **identical** terrain geometry to the same chunk with the FIRE cell set to AIR (fire contributes zero faces) — covers BOTH renderChunk paths (§6.8a greedy + §6.8b per-block). Force each path if the mesher selects between them by block density.
5. **Texture atlas (`tools/voxex-texture-tests.html`):** now **33 tiles**; **all 12 fire frames** must contain transparency (cutout inverted check — confirms they were added to `ALLOW_TRANSPARENCY`); burnt tiles must be fully opaque; colour sanity (fire warm gradient, burnt dark). Spot-check the 4 frames of a layer differ (animation isn't static) yet share a silhouette family (loops cleanly).
6. **Composite attachment (new, covers the user's scenarios):** assert `computeFireAttachment` returns the right multi-surface descriptor for: floor-only; floor+4 walls (boxed in); ceiling+1 wall, no floor; 2 opposite walls only; nothing solid → `any === false`. Assert `createWorldFire` builds the matching quad count (floor=2 crossed, +1 per wall, +1 ceiling).
7. **Animation loop + distance LOD:** drive `updateFireAnimation` through `FIRE_ANIM_FRAMES` steps and assert each **animated** material's `map.offset.x` cycles `base/NUM_TILES … (base+3)/NUM_TILES` and wraps back to `base` (seamless loop); assert the **static** materials never move (stay at `base`). Then assert `updateFireLOD` leaves a far fire's quads on the static set (frozen frame 0) and a near fire's on the animated set, and that walking the player across `fireAnimationRadius` flips the model (D9).
8. **Particle perf cull:** with many fires registered, assert `_emitParticles` emits for **0** fires when the player is far, and **≤ `fireMaxEmittersPerFrame`** when near — never one-per-fire.
9. **Worker parity round-trip:** the live worker mesh test must still match `blendedHeight`/main meshing; verify faces behind fire are NOT culled (parity `IS_TRANSPARENT_WORKER[FIRE]`). *(Parity-only while `WORKER_MESH_PIPELINE_ENABLED=false`.)*
10. **Persistence round-trip:** save/load a chunk containing FIRE + BURNT_* and assert block IDs survive RLE + OPFS binary serialize/deserialize.
11. **Simulation unit checks:** `scanFireNeighbors` (support/fuel/anyBurnable in one pass); consume mapping (`BURN_RESULT`); extinguish-on-no-support; spread is burnable-only while support is solid-or-burnable (§3.2 / §16 D4); `register()` idempotency (age survives a re-register).
12. **Memory / GC / lifecycle checks (§10.2, §10.3):** (M1) load fires, unload the chunk → `fireSystem.cells.size` returns to baseline (no orphans); (L1) load world A with fire, then load world B → `fireSystem.cells.size === 0` and no fire groups remain in the scene; (L2) a fire at a chunk edge with an unloaded neighbour does **not** extinguish; (L3) fire placed against/among leaves survives and consumes them; (G1) cells store numeric coords and the tick/emit loops don't call `String.split`; (P1) micro-benchmark a spreading fire — frame time bounded by `fireMaxEditsPerTick`.
13. **High-stakes review:** run a subagent/code-review pass on the §6.6 lighting diff, the §6.5b predicate edits, and the §6.13 GC-sensitive tick loop.

`tools/terrain-visualizer.html` needs **no** update (no terrain-generation change).

---

## 12. Safety checks (per CLAUDE.md change-reporting)

- **Duplicate/shadow check:** `FIRE`, `BURNT_LOG`, `BURNT_PLANKS`, `BURNABLE_BLOCK_IDS`, `BURN_RESULT`, `BLOCK_LIGHT_EMISSION`, `FIRE_ANIM_FRAMES`, `FIRE_LAYER_BASE`, `chunkFires`, `fireSystem`, `createWorldFire`, `getSharedFireResources`, `releaseChunkFires`, `computeFireAttachment`, `hasFireSupport`, `scanFireNeighbors`, `extinguishFire`, `trySpreadFrom`, `consumeFuel`, `updateFireAnimation`, `updateFireLOD`, `_fireNearPlayer`, `drawFlameFrame` must be searched before declaring (none exist today; confirmed against baseline).
- **Ad-hoc TORCH predicates (§6.5b) — DO NOT rely on tags:** verify FIRE is excluded from `isSolidBlock` (`41008`), `VoxelWorld.isSolidBlock` (`7241`), `pathCellSolid` (`32819`), `isFoamLand` (`38956`), and the volumetric ray test (`41907`). These do **not** read `BLOCK_IS_SOLID`, so the tag system will NOT cover them. This is the most-likely-to-be-missed item in the whole CCR.
- **All three mesh loops patched (§6.8):** greedy (`39163`) + per-block (`39987`) + worker (`18208`). Missing the greedy path renders fire as a cube.
- **Atlas texture reference:** `createWorldFire` uses `chunkMaterial.map` (no `blockAtlasTexture` global exists).
- **New DOM IDs:** any fire settings inputs must exist in HTML and match JS references. *(No player-health HUD — descoped, D6.)*
- **No heavy per-frame work:** simulation throttled to 2 Hz; per-frame work is one Map lookup per mob (damage, §6.14), a distance-culled + capped particle emit (§6.13), and 3 texture-offset writes for animation (§6.7d); fire-driven `setBlock` edits coalesced per chunk per tick to avoid remesh thrash.
- **Particle pool safety:** `_emitParticles` is distance-culled (`fireParticleRadius`) and capped (`fireMaxEmittersPerFrame`) — it must never iterate all fires (would exhaust the 500 pool, `voxEx.html:14337`).
- **Animation cost is O(1):** all fires share 6 materials (3 animated + 3 static); animation is `offset.x` writes on the 3 animated ones only. The distance-LOD pass (`updateFireLOD`) is throttled (~4 Hz) and only swaps material refs on models that cross `fireAnimationRadius` — no per-frame all-fire work, no UV rewrites.
- **No GC in the fire hot loops (§10.2):** cells store numeric coords (no `key.split`); tick/emit iterate `cells.values()`; one `scanFireNeighbors` per fire into a reused scratch (fewer `getBlock` key-string allocs); `_fireDirtyChunks` stores `{cx,cz}` (no flush-time parse).
- **No `fireSystem.cells` leak (§10.2 M1):** `releaseChunkFires` unregisters the chunk's cells on unload — registry lifetime tracks loaded chunks.
- **Light-flood awareness (§10.2 P1):** every fire `setBlock` triggers a level-14 block-light BFS — keep `fireMaxEditsPerTick` conservative; this is the dominant per-edit cost.
- **Worker parity (parity-only, gated off):** worker `NUM_TILES`=**33**, `FIRE` constant, `IS_TRANSPARENT_WORKER[FIRE]`, and the §6.8c skip — verified but not live until `WORKER_MESH_PIPELINE_ENABLED`.
- **Build banner:** update `VOXEX_BUILD` and prepend a `VOXEX_RECENT_CHANGES` entry (`voxEx.html:3792-3793`).
- **CLAUDE.md:** update block count (16→19 world blocks, IDs 0–18; `UNLOADED_BLOCK` stays 255), `NUM_TILES` (18→**33**), the block-types table (add FIRE/BURNT_LOG/BURNT_PLANKS + the `burnable` tag), and add a "Fire System" subsection (note the 12-tile animated atlas region).

---

## 13. Rollout / phasing

| Phase | Deliverable | Gate |
|-------|-------------|------|
| **P1 — Blocks & textures** | §6.1–6.4, §6.5a, §6.9, §6.11 | Atlas + inventory show fire & burnt blocks; place & break burnt blocks; texture tests green (33 tiles, all 12 fire frames cutout) |
| **P2 — Render, walk-through, light & animation** | §6.5b (all 6 predicates), §6.6, §6.7 (incl. §6.7d animation), §6.8 (all 3 mesh loops) | Placed fire renders the correct **composite** layers (ground + each wall + ceiling), **animates** (4-frame loop), **player walks through it**, emits light, no mesh/lighting regressions |
| **P3 — Simulation** | §6.12, §6.13, §7 settings, mob damage (§6.14 mobs) | Fire spreads (burnable-only), consumes (grass→dirt, all logs→burnt log, planks→burnt planks, leaves→air), burns out, zombies path into it and take damage |

> Worker parity (§6.10) is parity-only (gated off) and can land alongside P2 without a functional gate.

Each phase is independently shippable. **Player fire damage is NOT part of this CCR** (Resolved §16 D6) — it is a separate future CCR gated on the player-health subsystem (§9).

---

## 14. Risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Fire is solid (ad-hoc predicates don't read the tag tables)** — player can't pass, zombies route around it | **High** | §6.5b: exclude FIRE from all 6 hardcoded predicates; collision/pathing tests §11.2 |
| **Missed greedy mesh loop** → fire renders as a cube + doubles with the model | **High** | §6.8a patches the greedy path (`39163`) in addition to per-block (`39987`); mesh-exclusion test §11.4 covers both |
| §6.6 lighting generalisation regresses torch light | High | Dedicated before/after equality test (§11.3); keep `getTorchBlockLightLevel` as the dynamic torch source |
| Tile-order / `NUM_TILES` mismatch → atlas-wide UV shift | High | Append tiles only at the end; update worker `NUM_TILES`=**33**; texture test asserts column count; keep each layer's 4 frames contiguous |
| **Animation frames omitted from `ALLOW_TRANSPARENCY`** → validator warnings + black-bleed mipmaps on frames 1–3 | Med | §6.11 explicitly adds all 12 fire tiles to `ALLOW_TRANSPARENCY`; texture test §11.5 checks all 12 |
| **Particle pool exhaustion** from emitting per-fire (256 fires → 2560 spawns/s) | Med | §6.13 distance-cull (`fireParticleRadius`) + `fireMaxEmittersPerFrame` cap, mirroring placed-torch emit |
| **GC churn** from key parsing + `getBlock` key-string allocs in the tick/emit loops | Med | §10.2 G1/G2: numeric coords on cells, value-iteration, single combined neighbour scan, reused scratch — fixed inline |
| **`fireSystem.cells` leak** when chunks unload (orphaned entries) | Med | §10.2 M1 / §6.7b: `releaseChunkFires` unregisters the chunk's cells |
| **Emissive-fire light-flood cost** per spread/consume/extinguish (level-14 BFS each) | Med | §10.2 P1: bounded by `fireMaxEditsPerTick` (keep ≤32) + 2 Hz throttle; dominant per-edit cost — tune the cap |
| **Transparent overdraw / per-frame sort** of ~1.8k fire quads at the cap | Med | §10.2 P2: frustum culling, shared geo/mat, `fireMaxActive` cap, per-profile scaling; optional fixed `renderOrder` |
| **Fire-model Group/Mesh churn** on per-edit chunk rebuilds | Low–Med | §10.2 M2: bounded by edit cap; escalate to incremental `chunkFires` diffing / pooling if profiling flags it |
| Remesh thrash from spread/consume `setBlock` storms (esp. tree fires) | Med | §6.13: coalesce edits per chunk per tick, `SETTINGS.fireMaxEditsPerTick` budget, batched non-immediate `scheduleChunkUpdate` (NOT `updateLocalArea`) |
| Runaway spread → CPU/scene-node blowup | Med | Per-chunk + global fire caps; per-tick spread cap; 2 Hz throttle; composite quads bounded by `fireMaxActive` × ≤7 + frustum culling |
| Fire model leak on chunk unload | Med | `releaseChunkFires` wired everywhere `releaseChunkTorches` is (shared-resource dispose guard) |
| **Ghost fire / `cells` leak across world loads** | Med | §10.3 L1: explicit `fireSystem.cells.clear()` + `chunkFires` sweep in `loadWorld` (`25733`) and other world-reset paths |
| **Fire wrongly extinguishes at chunk boundaries** (unloaded neighbours read as no-support) | Med | §10.3 L2: `scan.unloaded` guard defers the tick instead of extinguishing |
| **Canopies won't burn** (leaves burnable but non-solid) | High | §10.3 L3 / §3.2: support = solid **OR** burnable |
| Fire spreads while game is paused | Med | **Resolved (D11):** `fireSystem.update` + animation gated on `isGameplayActive()` (§6.13, §6.7d) |
| Saved fire loses light after reload | Med | §6.6c seed scan + §6.7c registry rebuild on chunk load |
| Player-health scope creep | Low | **Descoped (D6)** — player damage moved to a future CCR; fire fully works against mobs without it |

---

## 15. Future work (explicitly out of scope)

**Player-health subsystem + player fire damage** (see §9 — the immediate next CCR, also unblocks zombie melee damage); **dynamic fire `PointLight`** (generalise `torchLightPool` → a `blockLightPool` keyed off both `chunkTorches` and `chunkFires`, sharing the `MAX_POINT_LIGHTS` budget — see §6.6 note); flint-and-steel ignition item; fire from lava/lightning; fire spread probability scaling with wind/biome; smoke column accumulation; fire-resistance for entities; burning dropped items; configurable burn-result chains (e.g., burnt log → ash). The `burnsTo` field and `lightEmission`/`burnable` tags are forward-compatible with all of these.

---

## 16. Resolved decisions (signed off 2026-06-15)

| ID | Decision | Resolution |
|----|----------|-----------|
| **D1** | Fire light level | **14** (one below sun max, matches torch). Stored in `BLOCK_LIGHT_EMISSION[FIRE]` (default from `lightEmission: 14`; the `fireLightLevel` setting overrides). |
| **D2** | Longwood burnable + `BURNT_LOG` log tag | **Yes.** All logs (Oak + Longwood) are burnable and map to `BURNT_LOG`; all leaves (Oak + Longwood) are burnable and burn to Air. **Keep** the `"log"` tag on `BURNT_LOG`. |
| **D3** | Fire geometry | **`PlaneGeometry`** (flat square quads). |
| **D4** | Fire support vs spread | **Support = any solid OR burnable block; spread = burnable-only.** (rev. 7 refined "solid" → "solid OR burnable" so non-solid leaves can hold/feed fire — §3.2. Needs sign-off but is required for canopies to burn.) |
| **D5** | Burnt blocks placeable | **Yes** — `BURNT_LOG` and `BURNT_PLANKS` have `ui.showInInventory: true`. |
| **D6** | Player damage timing | **Later.** No player-health system exists; player fire damage is excluded from this CCR and moved to a follow-up (§9, §15). This CCR damages **mobs only**. |
| **D7** | Animated fire | **Yes — 4 looping frames per layer** (12 fire tiles total), procedurally generated (§6.11), animated via shared-material `offset.x` stepping at `fireAnimationFps` (§6.7d). Mild motion. |
| **D8** | Multi-surface fire | **Composite** — a fire cell renders the ground layer (if floor) **plus** a wall flame per solid side **plus** a ceiling flame (if block above), all at once (§3.2). Not a single-state pick. |
| **D9** | Distance animation LOD | **Yes** — fires within `fireAnimationRadius` (24) animate; farther fires freeze on frame 0 via a shared static material set, flipped by a throttled LOD pass as the player moves (§6.7d). |
| **D10** | Water extinguishes fire | **Yes** (signed off). A WATER neighbour douses fire (`scan.water` → extinguish, §6.13), `trySpreadFrom` won't spread next to water, fire can't be placed next to water, and placing WATER extinguishes adjacent fire (§6.12). Toggle: `fireWaterExtinguish` (default true). |
| **D11** | Fire pauses with the game | **Yes** (signed off). `fireSystem.update` and the animation/LOD driver are gated on `isGameplayActive()` (§6.13, §6.7d) — fire freezes behind the pause/inventory menus. |
| **D4 (refined)** | Support = solid **OR** burnable | **Confirmed** — required for canopies to burn (leaves are burnable but non-solid, §10.3 L3). |

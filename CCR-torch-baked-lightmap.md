# CCR — Baked Per-Texel Torch Lightmap (VoxEx) — PRESCRIPTIVE

**File:** `voxEx.html` (single-file rule honored)
**Type:** Feature — **new subsystem**, built in ordered phases.
**Status:** Prescriptive spec. **Every design decision is already made (see "Decisions" — do NOT re-open them).** Implement the PHASES **one per hand-off, in order**; each ends with an **ACCEPTANCE GATE** that must pass in-browser before the next phase starts. This is not a one-shot edit.
**Date:** 2026-06-24. Line numbers verified against build `2026-06-24.31`; re-confirm each symbol by grep before editing.

> **How to hand this off:** give the agent ONE phase at a time ("implement Phase 0 of CCR-torch-baked-lightmap"). Verify its acceptance gate yourself in-game, then hand off the next. Do not ask for the whole thing in one shot — it's a subsystem.

---

## Goal

Placed torches cast **crisp, grid-locked pixel-art shadows** at 16 texels/block, on the same world lattice the sun's `blockyShadows` path uses, for **every** torch within the shadow-distance cull. Achieved by baking per-texel torch light into a per-chunk lightmap on placement and sampling it in the chunk shader.

## Decisions (ALL MADE — do not re-open)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Approach | Baked per-texel lightmap (CPU bake → texture) | owner-chosen; scales to all torches, no 8-light cap, static so cheap at runtime |
| D2 | Storage | **Per-chunk lightmap as a `THREE.DataTexture` (RGBA8)** + a **new per-vertex `Uint16`×2 lightmap-UV attribute** assigned at mesh time | mesh already iterates faces → assign atlas slots deterministically; simplest correct path |
| D3 | Resolution / filter | 16×16 texels per face; `NearestFilter`, no mipmaps | hard pixel edges, matches block texture grid |
| D4 | Ownership | Lightmap owns **placed-torch surface light**; block-light BFS unchanged (volumetric fill); **held torch stays dynamic**; placed **fires** are sources too | avoids double-count; caves still get ambient fill; can't bake a moving held torch |
| D5 | Shadow darkness | Torch term may reach **0**; the existing skylight/BFS floor (min 3 in `extractLightFromChunk`) keeps faces faintly lit — **no pure black** | caves stay navigable |
| D6 | Cull radius | `deriveShadowConfig(SETTINGS.shadowRenderDistance).radius` | rides the existing shadow slider |
| D7 | Invalidation | Whole-torch re-bake on place/remove and on any block edit within a torch's radius; remesh reassigns UV slots + re-bakes the chunk's torches | simplest correct; optimize later only if it hitches |
| D8 | Scheduling | `TorchBakeTask` queue, step-budgeted (model on `SunlightTask`); **never** synchronous in `setBlock` | no placement hitch |
| D9 | Specular | **Diffuse-only v1.** Drop the dynamic `PointLight` for placed torches; the lightmap supplies diffuse color × falloff × occlusion | pixel aesthetic; lifts the 8-light cap |
| D10 | Atlas cap | Per-chunk lightmap max **1024×1024** (4096 face-tiles). Faces beyond the cap fall back to the existing per-block gate | bounded VRAM |
| D11 | Worker | **Main-thread v1.** Worker mesh path is OFF (`WORKER_MESH_PIPELINE_ENABLED`, ~13521) so no worker parity needed now | smallest correct surface |

## Hook-point map (build 2026-06-24.31 — re-grep before editing)

| System | Symbol | Line |
|---|---|---|
| Geometry alloc / attributes | `_createTerrainGeometry` | 20110 |
| Face writer (assign UV slot here) | `addFaceIndexed`, `writeFaceUVsIndexed`, `packColorRGBA8` | 39967 / 39739 / 39541 |
| Material shader inject | `applyCylindricalFog` (vertex varyings 31502–31514) | 31488 |
| Combine site (dynamic-light gate) | `<lights_fragment_end>` / `bakedLightGate` | 31815–31822 |
| Sun world grid to mirror | `floor(vWorldPositionCyl*16.0)…`, dFdx/dFdy normal | 31662 / 31748 |
| Torch place/remove trigger | `setBlock` TORCH branch | 25487–25497 |
| Torch registry | `torchLightPool.torchPositions` / `registerTorch` / `unregisterTorch` | 13527 / 13543 / 13554 |
| Fire sources | `chunkFires` | 13497 |
| Block-light BFS (keep) | `updateBlockLightAt` | 25365 |
| Light→vertex bake (floor 3) | `extractLightFromChunk` | 41162 |
| Raycast primitive (fork inner loop) | `getPointLightVisibility` (inner march 43836), `getBlock` | 43802 / 24778 |
| Frame budget model | `SunlightTask`, `processSunlightQueue`, `shouldYield`, `TIME_SLICE_MS` | 24974 / 25356 / 10745 / 10742 |
| Cull source | `SETTINGS.shadowRenderDistance`, `deriveShadowConfig`, `refreshChunkShadowCasters` | 6353 / 11834 / 11891 |
| Texture filter pattern | `registerPixelTexture` (NearestFilter) | 9871 |

---

# PHASE 0 — Storage + shader plumbing with a FAKE lightmap (validate the architecture first)

**Goal:** prove D2/D3 before writing any bake. No real torch light yet — fill the lightmap with a hardcoded pattern and confirm it samples per-face, crisp, grid-aligned.

**Steps:**
1. **Geometry attribute.** In `_createTerrainGeometry` (20110) add a `lightmapUV` attribute: `new THREE.Uint16BufferAttribute(lmArray, 2, /*normalized*/ false)` alongside `uv`/`color`/`quadSize`. Add a matching scratch array in the geometry buffer pool.
2. **Assign UV slots at mesh time.** In the terrain mesh face loop (`addFaceIndexed`, 39967), maintain a per-chunk `faceSlot` counter; each exposed face gets slot `n`. Write the face's 4 vertices' `lightmapUV` as the integer tile origin `(n % tilesPerRow, floor(n / tilesPerRow))` in tile units (the shader converts to texel UV). Store `faceCount` on the chunk for sizing.
3. **Per-chunk lightmap texture.** Create a `THREE.DataTexture(data, texW, texH, THREE.RGBAFormat)` sized `tilesPerRow*16 × ceil(faceCount/tilesPerRow)*16`, `magFilter=minFilter=NearestFilter`, `generateMipmaps=false`, `needsUpdate=true`. Store it on the chunk mesh's material as a custom uniform (set in `applyCylindricalFog`). **FAKE FILL:** color each face's 16×16 tile a deterministic color from its slot index (e.g. hash slot→RGB) so distinct faces are visibly distinct.
4. **Shader sample.** In `applyCylindricalFog` (31488): add `attribute vec2 lightmapUV; varying vec2 vLightmapUV;` to the vertex shader and pass it through; add `uniform sampler2D torchLightmap; uniform vec2 torchLightmapTexSize; varying vec2 vLightmapUV;` to the fragment shader. Compute the in-tile texel from the fragment's position within the face (use the same per-block fract used by `<map_fragment>` at 31757 to get 0..1 across the face, ×16 → texel), add to the tile origin, divide by `torchLightmapTexSize`, sample `NearestFilter`. For Phase 0, just output the sampled color additively so you can SEE the tiles (temporary debug).
5. Gate the whole thing behind a new `SETTINGS.torchLightmap` boolean (default true) so it can be toggled.

**ACCEPTANCE GATE 0:** in-world, every terrain face shows its own solid lightmap tile color, crisp (NearestFilter), with the tile aligned to the block's 16-grid and not bleeding across greedy-merged quads. Toggling `SETTINGS.torchLightmap` off restores normal rendering. No FPS regression, `window.memoryBudgetManager.getStatus()` VRAM bounded. **Do not proceed until this passes** — it proves the storage + per-face UV + shader sampling end to end.

---

# PHASE 1 — The bake (real per-texel torch shadows)

**Goal:** replace the fake fill with a real CPU bake of visibility × falloff × torch color.

**Steps:**
1. **`TorchBakeTask`** (model on `SunlightTask`, 24974) + `torchBakeQueue` array + `processTorchBakeQueue(stepBudget)` drained from the main loop next to `processSunlightQueue` (call site near 43178/43202). One task per (torch, affected chunk).
2. **Tight DDA.** Fork the inner single-ray march of `getPointLightVisibility` (43836–43849) into `bakeRayVisible(fromTexelWorldPos, torchPos)` using a **0.5 step or Amanatides-Woo** voxel traversal (the 1.5 step is too coarse). Reuse the pass-through set (AIR/WATER/leaves/TORCH/FIRE/GLASS, 43844) and `getBlock` (24778).
3. **Per face in range, coarse-to-fine (D7/owner's adaptive idea, receiver-side):**
   - Cull: only exposed faces within `cullRadius` (D6) that face the torch (normal·(torch−face) > 0).
   - Coarse: 1 ray from face center → torch. If the whole face's block-level neighbors agree (all lit or all shadowed), fill the face's 16×16 tile uniformly.
   - Refine: only faces straddling a shadow edge (block-neighbors disagree) cast a ray per texel (16×16) from that texel's world center → torch.
   - Value per texel = `visibility * falloff * torchColor`, where `falloff = clamp(1 - dist/range, 0, 1)` (range from `SETTINGS.torchRange`). Accumulate (additive, clamp to 1) across multiple torches touching the face.
4. **Trigger** from `setBlock` TORCH branch (25487): on place/remove, enqueue bake/invalidate for the torch and every chunk within its radius (D7). Cover `chunkFires` sources too (13497), glow at `y+0.1`.
5. **Upload** the updated `DataTexture` (`needsUpdate=true`) budgeted via the queue, not synchronously.
6. Remove the Phase-0 debug additive output; the lightmap now feeds the combine in Phase 2 (for Phase 1 testing, keep adding it as light so you can see shadows).

**ACCEPTANCE GATE 1:** place a torch behind a 1-block lip and descend below line of sight → the floor stays lit with a **crisp pixel shadow** of the lip, edges on the 16-grid. Two torches with overlapping range → additive, no seams. Placement causes no visible hitch (watch `O` overlay). Break/replace a nearby block → shadow re-bakes within a couple frames.

---

# PHASE 2 — Integrate as the placed-torch light source & lifecycle

**Goal:** make the lightmap the real placed-torch light (not just additive debug), wire culling + invalidation cleanly, and drop the now-redundant dynamic point lights for placed torches.

**Steps:**
1. **Combine** at the gate site (31815): the placed-torch surface contribution becomes the lightmap sample (diffuse × torch color), added to `reflectedLight.indirectDiffuse` (or directly to outgoing light), **on top of** the BFS vertex-color ambient. Keep `camProxGate` only for the **held** torch. The per-block `bakedLightGate` for placed torches is now replaced by the per-texel lightmap.
2. **Drop placed-torch dynamic lights (D9).** In `torchLightPool` (13527): stop assigning hardware `PointLight`s to placed torches (the held torch keeps its dynamic light). This lifts the 8-light cap and removes per-frame light cost. Leave `getPointLightVisibility` + the volumetric pass untouched (still used for in-air haze).
3. **Cull (D6)** beyond `shadowRenderDistance`: free those chunks' lightmap tiles for distant torches; faces sample a shared "zero" texel (no torch term; BFS still lights). Re-evaluate on player-chunk change next to `refreshChunkShadowCasters` (11891).
4. **Atlas cap (D10):** if a chunk's `faceCount` would exceed 1024×1024, the overflow faces point at the zero texel and use the per-block gate fallback.
5. **`// WORKER PARITY TODO`** marker at the geometry-attribute sites (D11).

**ACCEPTANCE GATE 2:** placed torches light their surroundings purely via the lightmap with correct color/falloff and crisp shadows; held torch unchanged; no light through walls; walking past `shadowRenderDistance` drops the shadow cleanly and walking back re-bakes; many torches in one area cause no 8-light popping. Steady-state FPS ≥ pre-feature.

---

# PHASE 3 — Polish (deferred; only if needed)

- **Worker offload** of the bake (only if Phase 1/2 hitches in practice): add a `'bake'` job to `ChunkWorkerPool` (19413); blocker — must ship multi-chunk block data + a worker-local `getBlock`. Mirror the dormant `WORKER_MESH_PIPELINE_ENABLED` approach.
- **Specular** glint for placed torches (bake a cheap term) if diffuse-only looks flat.
- **Dirty-AABB partial re-bake** instead of whole-torch, if edit-time re-bake hitches.

---

## Risks & mitigations

- **Placement/edit hitch** → step-budgeted `TorchBakeTask` (D8), enforced.
- **VRAM** → cull off shadow distance (D6) + per-chunk atlas cap (D10).
- **Greedy-merge UV correctness** → the lightmap UV is per-face (slot-assigned at mesh time), and the in-tile fract reuses the proven `<map_fragment>` per-block tiling (31757) so it's correct across merged quads. Phase 0 gate explicitly tests this.
- **Attribute VRAM** (the new Uint16×2) → ~4 B/vert; accepted for v1, flagged for the in-shader-derive optimization later.
- **Worker parity** → deferred while the worker mesh path is off; `// WORKER PARITY TODO` left at the sites.

## Testing (per phase gate above) + final

1. Each phase's ACCEPTANCE GATE, verified in-browser, before proceeding.
2. Final: run `tools/voxex-tests.html` (serve over localhost) — expect green (render-only).
3. Memory: `window.memoryBudgetManager.getStatus()` with many torches — bounded.
4. Confirm torch shadows and sun shadows sit on the same pixel grid (place a torch beside a sunlit block edge).

## Change-reporting checklist

- [ ] Phases implemented in order, each gate verified before the next.
- [ ] No duplicate/shadowed identifiers (`TorchBakeTask`, `processTorchBakeQueue`, `torchLightmap`, `lightmapUV`, `vLightmapUV`).
- [ ] Bake step-budgeted; nothing synchronous in `setBlock`.
- [ ] Cull reads `SETTINGS.shadowRenderDistance`; held torch + fires handled; BFS untouched.
- [ ] Lightmap `NearestFilter`; per-face UV correct across greedy merges (Gate 0).
- [ ] `// WORKER PARITY TODO` left at geometry-attribute sites.
- [ ] New `SETTINGS.torchLightmap` has a `DEFAULTS` entry, round-trips, and is in the right `SETTINGS_PROFILES` (or deliberately excluded).
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.

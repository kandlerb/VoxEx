# Cross-CCR Coordination Notes

Read this alongside `_IMPLEMENTATION_RUNBOOK.md`. It exists so the 15 CCRs are implemented as a coherent set — no colliding identifiers, no redundant constants, and no two changes clobbering each other. Verified against live `voxEx.html` (build `2026-06-25.34`).

## 1. New-symbol registry (every identifier the batch introduces)

All names below were grepped against live source and against each other — **no collisions, no duplicates across CCRs.**

| CCR | New symbol | Kind | Notes |
|-----|-----------|------|-------|
| PERF-014 render-loop | `_greedyTerrainBuffers`, `_greedyTerrainState` | module-scope objects | greedy-mesh scratch (#572) |
| PERF-014 | `_neighborDrainBuf` | module-scope array | #574 |
| PERF-014 | `_PICK_FACE_NX/_PX/_NY/_PY/_NZ/_PZ` | 6 frozen const arrays | #575 |
| PERF-014 | `_hiddenWaterMeshes` | module-scope array | #549 |
| PERF-014 | `_lightingSampleIndices` | module-scope array | #546 |
| REFACTOR-001 water | `computeWaterFaceColor` | function | #524; **added to worker `meshFuncs`** |
| REFACTOR-001 | `_waterColorScratch` | const Float32Array(7) | #524; **emitted into worker** next to `_lightResult` |
| TERRAIN-001 | `sampleBiomeBilinearHeight` | function | #517; **added to worker `terrainFuncs`** |
| TERRAIN-001 | `_FH_NEIGHBORS` | const array — **hoisted** from a per-call local to module scope | #513; **emitted into worker** next to `_BIOME_CDF_TABLE` |
| ROBUST-001 | `safeParseLocalStorage` | function | #519 |
| CACHE-002 | `CURRENT_CACHE_VERSION` | **single** module-scope const | #493; see §2 |
| CACHE-003 | `failAllPending` | local closure (inside `init`) | #512; intentionally NOT module-scope |
| FX-002 | `nearestZombieDistSq` | module-scope `let` (Infinity-init) | #520 |

CCRs introducing **no** new identifiers: glass (VRAM-003), particle (FX-003), pregen (PREGEN-001), tree-toggle (WORLDUI-001), shadow-bias (SHADOW-001), dead-code (CLEANUP-001), docs (DOCS-001).

## 2. Redundant-constant findings (the specific thing to watch)

- **`CURRENT_CACHE_VERSION` is currently declared TWICE** as identical local consts (`= 5` at ~27555 and ~39414) — this duplication is the exact drift mechanism CACHE-002 fixes by deleting both and hoisting ONE module-scope const. After CACHE-002 there must be **exactly one** `const CURRENT_CACHE_VERSION`. No other CCR may re-declare it.
- **`_FH_NEIGHBORS` is re-allocated per call** today (local in `getBiomeCellDirect`); TERRAIN-001 #513 hoists it to one module-scope const (and emits it into the worker).
- **`BLOCKS` object (≈line 7314) is a partial duplicate** of the canonical bare block-ID consts (`const AIR=0…BURNT_PLANKS=18`, ≈line 4135). DOCS-001 #545 **deletes** `BLOCKS` and repoints its 5 readers to the bare consts. It does NOT create a derived replacement.
- **By-design "duplication" — do NOT try to dedupe:** the worker hand-maintains copies of constants/tables (`SUNLIGHT_ATTENUATION`, `_BIOME_CDF_TABLE`, `_lightResult`, `_aoResult`, `WORLD_DIMS`, `BIOME_CONFIG`) via the injection system. These intentional copies are how worker parity works; new scratch (`_waterColorScratch`, `_FH_NEIGHBORS`) must follow the SAME emit pattern, not be "shared."

## 3. Shared touchpoints — where CCRs must be mindful of each other

**A. Worker injection system (`buildChunkWorkerCode`) — TWO CCRs edit it.**
- REFACTOR-001 (water): adds `computeWaterFaceColor` to `meshFuncs` (~19561) + emits `_waterColorScratch` near `_lightResult` (~19555).
- TERRAIN-001: adds `sampleBiomeBilinearHeight` to `terrainFuncs` (~19321) + emits `_FH_NEIGHBORS` near `_BIOME_CDF_TABLE` (~19356).
- The two lists are ~240 lines apart in the same function and **do not overlap textually**. `terrainFuncs` (~19321) sits ABOVE `meshFuncs` (~19561), so the runbook order (water #13 before terrain #15) is safe — water's additions are below terrain's anchors and won't shift them. Still **re-grep the list anchors** before each edit. Both CCRs require re-running the worker `blendedHeight`/mesh parity tests.

**B. Meshing region (~37700–42600) — FOUR CCRs edit nearby code.** TERRAIN-001 (~37748–38265), REFACTOR-001 water (~39959–40253), PERF-014 (#525 ~39730, #544 ~40748, #572 ~41982), VRAM-003 glass (~41509, ~42571–42616). No textual overlap, but heavy line drift. The runbook groups them consecutively (12 render-loop → 13 water → 14 glass → 15 terrain); **grep every anchor, never trust line numbers**, and re-run `voxex-tests.html` after each.

**C. `renderFrame` (~44494–44784) — render-loop + dead-code overlap.** CLEANUP-001 touches it (#578 deletes unread consts ~44705–44719; #576 converts a console at ~44748) and PERF-014 touches it (#549 ~44600, #542 gates the RenderDiag block ~44721–44750). The **RenderDiag block (~44721–44750) is touched by BOTH** #576 (console→logDebug, inside it) and #542 (wrap it in the `isDebug` gate). Runbook order does CLEANUP (step 2) before PERF-014 (step 12), so the console becomes `logDebug` first, then #542 gates the whole block around it — they compose. Just re-grep.

**D. `renderChunk` — dead-code + render-loop + glass.** CLEANUP-001 #576 converts consoles at 41868/42261/42316/42410; PERF-014 #572 edits ~41982; VRAM-003 edits ~42571–42616. CLEANUP runs first → those consoles convert, then the later CCRs edit different lines in the same function. No overlap; grep.

**E. `updateUIFromSettings` — CLEANUP-001 deletes code that SHADOW-001 cites.** CLEANUP-001 #494 deletes the unreachable fallback body (~29219–29315), which CONTAINS the positive bias writes (~29309–29310) that SHADOW-001 #495 lists as a "canonical reference." This is fine: (1) #495's actual edit target is the Reset-All negation at **~29330**, which is OUTSIDE the deleted range, so it survives; (2) #495's sign conclusion still stands via the LIVE canonical sites (init ~27951/27958, Reset-Graphics-Lighting ~29454/29458) — the deleted fallback was never executing anyway. **Guidance:** when implementing #495 (step 7, after #494 at step 2), rely on the init / Reset-Graphics-Lighting sites for the canonical sign, not the now-deleted fallback.

**F. Build banner (`VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`, ~3999/4007) — ALL 15 edit it.** Each CCR bumps the build suffix and **appends** a `VOXEX_RECENT_CHANGES` entry citing its ID + GitHub #. Append, never overwrite; bump the suffix incrementally so entries don't collide.

**G. Block-ID constants — DOCS-001 #545 is foundational.** It deletes `BLOCKS` and removes it from `window.VoxExClasses`. Confirmed the only 5 `BLOCKS.` consumers are the ones it repoints; no other CCR in this batch references `BLOCKS.X`, so order is not strictly forced — but do #545 as scheduled (step 3) so the constant surface is clean early.

## 4. Minor doc corrections surfaced during enrichment (already noted in the CCRs)
- **Particle (FX-003):** the cap backstop is `spawn()` returning null when full (it **drops the new particle**, it does not "evict the oldest"). The bound still holds; the Context block notes the accurate behavior.
- **Glass (VRAM-003):** now covers all FOUR `dispose()`→`releaseTerrain()` sites (the two stale-drop paths were added — see the CCR's CRITICAL note). This was a correctness gap, not cosmetic.
- **pickVoxel (#575):** three call sites (not two) — all read-only/immediate, so the frozen-const hoist stays safe.

## TL;DR for the implementer
No two CCRs create the same symbol. The only "redundant constant" is the existing double `CURRENT_CACHE_VERSION` that CACHE-002 collapses. The real coordination is **line-number drift** in three hot regions (meshing, `renderFrame`, `renderChunk`) and the **two worker injection lists** — handled by doing the related CCRs consecutively and **always grepping anchors instead of trusting line numbers**, plus the `#494`/`#495` and four-site-glass notes above.

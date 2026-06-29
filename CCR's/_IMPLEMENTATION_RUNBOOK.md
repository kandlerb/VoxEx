# CCR Implementation Runbook — Agent Prompt

Hand the text below (everything under the line) to the implementation agent. It is self-contained.

---

You are implementing a batch of 15 pre-written, pre-audited change docs ("CCRs") for **VoxEx**, a single-file browser voxel engine. All CCRs live in `D:\Projects\voxex\CCR's\` and are written in an exact format (Location / Why / Change / Before / After / Verify + a Safety Checks list). Your job is to implement them **one at a time, in the order below**, and move each to `CCR's\Finished\` when its tests pass.

**Before you start, read `_CROSS_CCR_NOTES.md` in this folder.** It is the coordination map for the whole batch: the registry of every new identifier (all collision-checked), the one redundant constant being consolidated (`CURRENT_CACHE_VERSION`), and the shared regions where changes must be sequenced and re-grepped so they don't clobber each other — the two worker injection lists, the meshing region, `renderFrame`/`renderChunk`, the `#494`-deletes-what-`#495`-cites interaction, and the four-site glass release requirement.

## Non-negotiable project rules
- **Single file.** ALL game code lives in `D:\Projects\voxex\voxEx.html` (~43K lines). No new files, no external scripts. CSS/HTML/JS all stay in this one file.
- **Line numbers DRIFT.** Every CCR's line numbers are from build `2026-06-25.34` and are already stale. **Always re-locate each change by grepping the anchor string given in the CCR's `Location:` field.** Before editing, confirm the live code matches the CCR's **Before** snippet. If it doesn't match, STOP (see Stop conditions).
- **Worker parity.** Some functions are single-sourced on the main thread and injected into the chunk worker via `Function.toString()` between the `/* __TERRAIN_FUNCS__ */` and `/* __TREE_FUNCS__ */` / `meshFuncs` markers. Edit ONLY the main-thread source; never edit the generated worker copy. If a CCR adds a new helper/scratch that the worker needs, add it to the injection list exactly as the CCR instructs, and keep the markers intact.
- **Read the AUDIT FLAG / AUDIT NOTE callouts.** Several CCRs contain them. They correct the original premise or flag a blocker (e.g. the glass color-schema mismatch, the zombie nearest-distance source). Obey them — they override any contradicting intuition.
- **Code quality:** strict equality, typed arrays for numeric data, `for` loops in hot paths, no allocations/closures in `renderChunk`/`pointermove`, JSDoc on new functions. Match the conventions in `CLAUDE.md`.

## Per-CCR workflow (repeat for each, fully, before moving on)
1. **Read** the entire CCR file.
2. For each `### #NNN` block: **grep the `Location:` anchor** to find the real site. Verify the live code equals the **Before** snippet (allowing for the documented head/tail elision on long blocks).
3. **Apply the change** to match the **After** snippet exactly. Honor every AUDIT FLAG/NOTE.
4. If the edited function is worker-injected, confirm the worker still gets correct code (markers intact; new scratch emitted where the CCR says).
5. **Run the CCR's Safety Checks** list — tick each item honestly.
6. **Test:** serve the repo over localhost and run `tools/voxex-tests.html` (~204 tests) — all must stay green. For visual changes (FX, glass, water, shadows, particles, loading), also eyeball the game in a browser.
7. **Update the build banner** near the top of `voxEx.html`: bump `VOXEX_BUILD` and add a one-line `VOXEX_RECENT_CHANGES` entry citing the CCR ID + GitHub issue number(s).
8. **Move the CCR** from `CCR's\` to `CCR's\Finished\`.
9. **Commit hygiene:** stage ONLY the files you actually edited (`voxEx.html`, plus `CLAUDE.md` for the docs CCR, plus the moved CCR). **Never `git add -A`/`.`** — the working tree carries unrelated EOL/whitespace churn. ⚠️ The repo's git index is currently corrupt and `.git/index.lock` is held by another process; if git operations fail, do NOT fight it — leave the file edits in place and tell the user to clear the lock and repair the index first.

## Order (recommended — ascending risk, with same-region edits grouped and the riskiest last)
Work top to bottom. Each is independent; you may pull the three **P0** items forward if you want highest-value-first, but otherwise follow this order.

**Warm-up (trivial, validates your test → build-bump → move loop):**
1. `CCR-updatestreaming-sqrt.md` (PERF-016, #548) — delete one dead method + tombstone. Zero behavior change.

**Cleanup batch (behavior-neutral):**
2. `CCR-deadcode-cleanup.md` (CLEANUP-001, #578 #571 #523 #515 #494 #553 #552 #576) — pure deletions + route 9 hot-path `console.*` to `logDebug`. Confirm "zero readers" by grep before each deletion.
3. `CCR-docs-constants-sync.md` (DOCS-001, #545 #541 #581) — single-source the `BLOCKS` constant in `voxEx.html`; fix the stale counts/comments in `CLAUDE.md` and the three `128` comments.

**P0 — crash / security / data integrity (small, surgical, high value):**
4. `CCR-cache-version-constant.md` (CACHE-002, #493) — collapse the `2`/`4`/duplicate-`5` cache-version literals into one module-scope `CURRENT_CACHE_VERSION`.
5. `CCR-localstorage-hardening.md` (ROBUST-001, #519 #518) — add `safeParseLocalStorage()` + escape the world-card seed. Touches the boot path; test corrupt-key fallback and a markup seed.
6. `CCR-opfs-worker-onerror.md` (CACHE-003, #512) — augment the existing OPFS `worker.onerror` to reject pending requests.

**P1 — small behavioral fixes:**
7. `CCR-shadow-bias-reset-sign.md` (SHADOW-001, #495) — remove the spurious negation in Reset All; add the moon bias write.
8. `CCR-tree-toggle-restore.md` (WORLDUI-001, #521) — delete the destructive `treeDensityMultiplier = 0` clause (gating already lives in `applyTerrainSettings`).
9. `CCR-pregen-fixes.md` (PREGEN-001, #554 #550) — fix the Phase-1C progress formula; remove the duplicate `_pregenActive = false`.
10. `CCR-zombie-proximity-uniform.md` (FX-002, #520) — drive the proximity uniform from the nearest-zombie distance (use the `updateZombies` loop source per the CCR — NOT a fabricated symbol).
11. `CCR-particle-skip-despawn.md` (FX-003, #570) — change the out-of-range branch from despawn to skip-integration.

**Meshing-region cluster (do together — adjacent code; bigger but mechanical):**
12. `CCR-render-loop-hygiene.md` (PERF-014, 9 actionable: #572 #574 #575 #549 #546 #544 #525 #577 #542) — hoist per-frame/per-chunk allocations + gate the debug traverse. NOTE the 3 items marked **DROPPED** (#583, #580, #555) — implement nothing for those.
13. `CCR-water-color-dedup.md` (REFACTOR-001, #524) — extract one `computeWaterFaceColor` helper; add it (and its scratch) to the worker `meshFuncs` injection.
14. `CCR-glass-geometry-pool.md` (VRAM-003, #573) — route glass geometry through `geometryPool.acquireTerrain/releaseTerrain`; pack color via `packColorRGBA8` (Uint8-RGBA), per the two AUDIT FLAGs. This is a perf/consistency fix, NOT a leak fix.

**Highest risk — do last, alone, with extra care:**
15. `CCR-terrain-single-source.md` (TERRAIN-001, #517 #513 #514) — terrain math parity across game/worker/preview. Do #517 (extract the shared bilinear sample) and #513 (`_FH_NEIGHBORS` hoist + emit into worker) first; they're concrete. **#514 (preview ≠ game biome) is large and flagged** — the root blocker is that the preview uses a different noise source; do NOT attempt the full port without confirming the approach with the user first. The worker `blendedHeight` parity test must stay green, and `tools/terrain-visualizer.html` must match.

## Stop conditions (STOP and report to the user; do not force it)
- The live **Before** code no longer matches the CCR (the file changed since the audit).
- Any `tools/voxex-tests.html` test fails after your change and you can't trivially fix it.
- An AUDIT FLAG's precondition isn't satisfied (e.g. the geometry-pool schema differs from what the CCR describes).
- A change would require touching a worker-injected function in a way that breaks `Function.toString()`.
- `#514` (terrain preview parity) — stop after #517/#513 and confirm the #514 approach before the full port.

## Out of scope (do NOT touch)
- The two CCRs in the project root (`CCR-chunk-memory-cap-render-distance.md`, `CCR-worldgen-mainthread-cost.md`) — they are only partially implemented and are intentionally parked.
- Anything in `CCR's\Finished\` — already shipped.
- The dropped issues #583, #580, #555 — documented as non-actionable in `CCR-render-loop-hygiene.md`.

Work one CCR at a time. After each, report: what you changed, test result, the new `VOXEX_BUILD`, and that you moved the CCR to `Finished\`. Then proceed to the next.

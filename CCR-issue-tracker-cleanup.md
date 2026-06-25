# CCR — GitHub Issue Tracker Cleanup (VoxEx)

**Project:** VoxEx — repo `kandlerb/VoxEx`
**Type:** Tracker maintenance (no `voxEx.html` code changes in this CCR)
**Status:** Ready for handoff — verified against current `voxEx.html` on 2026-06-24. Hand this whole file to a terminal agent (Sonnet + `gh`).
**Source of findings:** `VoxEx_Issue_Validation.md` (repo root) — a full validation of all 84 open issues against the current source.

> This CCR tells you (the agent) exactly which open issues to **close** and which to **update/flesh out**, with ready-to-post comment text and the exact `gh` commands. It does **not** change game code.

---

## Verification log (2026-06-24, against current `voxEx.html`)

The 7 destructive close-targets were re-checked by symbol against the working tree. Results below — the agent should still re-confirm, but these are the expected findings and current line numbers:

| # | Expected finding | Confirmed at |
|---|---|---|
| 557 | `checkPressure()` uses chained `Math.max`, not a sum | L25084 (`Math.max` at 25095–25096) |
| 551 | `VoxelWorld.canEvictChunk` is dead; live module-level fn honors `persistModified` | dead def L7763; live def L17845 (saves to cache when set); only caller L42550 |
| 516 | `hashStringForPreview` == `SeededRandom` hash | L21679 uses `0xdeadbeef` + `Math.imul(h^c,2654435761)`, same as L18509/18511 |
| 506 | `NUM_TILES = 33` in both copies | main L4267, worker L18415 |
| 507 | local `MAX_POINT_LIGHTS = 4` is intentional shader sizing | module L6859 (=8), local L28041 (=4) |
| 496 | star/cloud builders dispose-then-rebuild | `createStarField` L15422 (disposes L15426–15430), `createCloudPlane` L15588 (disposes L15592–15596) |
| **523** | **CORRECTION — NOT already fixed.** `#torch-overlay` markup still present, unused | CSS L329–355 (incl. `@keyframes torchFlicker` L355), `<div id="torch-overlay">` L2186, **0 JS refs** → keep open as dead-code (see §B) |

All 6 false-positive closes (557, 551, 516, 506, 507, 496) are confirmed safe. **#523 must NOT be closed** — it flipped to a VALID dead-code item.

---

## 0. Operating rules (read first)

1. **You are acting as the repo owner via the local `gh` CLI.** Confirm before doing anything:
   ```bash
   gh auth status
   gh repo view kandlerb/VoxEx --json nameWithOwner -q .nameWithOwner   # expect: kandlerb/VoxEx
   ```
   Run all `gh` commands with `--repo kandlerb/VoxEx`.

2. **Verify before you act — the file drifts.** The 7 close-targets were pre-verified on 2026-06-24 (see the Verification log above), but re-confirm anyway: for **every** issue below, before commenting/closing, `grep` the named symbol in `voxEx.html` and confirm the current code still matches the finding. The issue line numbers are stale — **search by symbol, never by line number.**
   - If a **"close as invalid"** issue now actually matches its claim in current code → **do NOT close it.** Leave it open and add it to your final "needs human review" list.
   - If an **"update"** (partial) issue has since been **fully fixed** in current code → close it with `--reason completed` instead of just commenting, and note it.

3. **Do not touch VALID issues.** Anything not listed in Sections A/B/C stays exactly as-is. In particular leave the cache-version cluster (#493, #499, #530), #521, #520, #519, #527, #512, #495, and all other VALID items open and untouched (except the optional Section D).

4. **Comment, then close — in one command where possible.** Use `gh issue close N --reason ... --comment "..."`. For multi-line comments use a heredoc into `--body-file -` (see snippet in §1).

5. **Be idempotent.** Before commenting, check you haven't already (`gh issue view N --comments`). Skip if your comment is already present.

6. **Produce a final report** (Section E) listing every action taken and every issue you skipped/flagged.

---

## 1. `gh` command reference

Comment only (used for partials):
```bash
gh issue comment <N> --repo kandlerb/VoxEx --body-file - <<'EOF'
...comment text...
EOF
```

Comment **and** close as a false positive (used for invalids):
```bash
gh issue close <N> --repo kandlerb/VoxEx --reason "not planned" --comment "$(cat <<'EOF'
...comment text...
EOF
)"
```

Comment and close as done (used for the already-fixed item):
```bash
gh issue close <N> --repo kandlerb/VoxEx --reason completed --comment "$(cat <<'EOF'
...comment text...
EOF
)"
```

Retitle / relabel (best-effort; skip the label flag if the label doesn't exist):
```bash
gh issue edit <N> --repo kandlerb/VoxEx --title "..." --add-label "dead-code" --remove-label "bug"
```

Optional — create the labels this CCR uses, once, before relabeling (ignore "already exists" errors):
```bash
gh label create dead-code -c "#cfd3d7" -d "Dead/unreachable code to remove" --repo kandlerb/VoxEx
gh label create cleanup   -c "#c5def5" -d "Cleanup / refactor, low priority"  --repo kandlerb/VoxEx
gh label create wontfix   -c "#ffffff" -d "Intentional / not a bug"           --repo kandlerb/VoxEx
```
Label edits are **best-effort**: if a label flag fails, retry the `gh issue edit` without it. Never let a label error block the comment/close.

---

## 2. Scope summary

| Action | Count | Issues |
|---|---|---|
| **A. Close — false positive** (`not planned`) | 6 | 557, 551, 516, 506, 507, 496 |
| **B. Close — already fixed** (`completed`) | 0 | — (none; see §B note re: #523) |
| **C. Update + flesh out** (comment, keep open) | 24 | 583, 580, 565, 564, 563, 562, 561, 560, 558, 556, 555, 553, 548, 545, 539, 538, 531, 529, 518, 510, 508, 505, 503, 497 |

Everything else (54 VALID issues, incl. #523) is left untouched.

> **Verify-pass correction (2026-06-24):** #523 was originally slated to close as "already fixed," but that was wrong — see §B.

---

## A. Close as false positive — `--reason "not planned"`

For each: verify the symbol, then close with the comment below.

### #557
Verify: `grep -n "checkPressure" voxEx.html` → confirm it uses `Math.max(...)`, not a sum.
```
Closing as a false positive after source validation.

The premise is incorrect. `SunlightTask.checkPressure()` computes pressure with `Math.max(addEntries, removeEntries, bufferedEntries)` — it takes the MAX of the three queue counts, not a sum. There is no "mixed/summed denominator" that mis-estimates pressure; the described over-estimation cannot occur. No code change needed.
```

### #551
Verify: `grep -n "canEvictChunk" voxEx.html` → confirm the `VoxelWorld.canEvictChunk` method is never called, and a module-level `canEvictChunk` is the live one.
```
Closing as a false positive (dead code, no live effect).

`VoxelWorld.canEvictChunk()` does ignore `persistModified`, but that method has no callers — it is dead. The LIVE eviction path uses the module-level `canEvictChunk(...)`, which correctly honors `persistModified`. No runtime bug exists. (If we want to delete the dead duplicate, that belongs with the dual-implementation cleanup in #559, not here.)
```

### #516
Verify: `grep -n "hashStringForPreview\|SeededRandom" voxEx.html` → confirm identical hash constants.
```
Closing as a false positive.

`hashStringForPreview` is byte-for-byte identical to `SeededRandom`'s hash (same `0xdeadbeef` seed, same `Math.imul(h ^ c, 2654435761)`, same `(h ^ (h >>> 16)) >>> 0` finalizer) — the code comment even states "Match SeededRandom exactly." The preview and the game derive the same numeric seed from a given seed string, so there is no hash mismatch.

Note: the *real* preview-vs-game divergence is the biome-selection algorithm, which is tracked separately in #514 — that one stays open.
```

### #506
Verify: `grep -n "NUM_TILES" voxEx.html` → confirm BOTH the main-thread const and the worker-template copy are `33`.
```
Closing as a false positive (stale premise).

Both the main thread and the injected worker copy define `NUM_TILES = 33` — they match. The "main thread has 18" premise predates the fire-system tile expansion (18 → 33). The only stale "18" is in CLAUDE.md, which is tracked by #541.
```

### #507
Verify: `grep -n "MAX_POINT_LIGHTS" voxEx.html` → confirm the local in `init()` is `4` and used consistently for the volumetric shader.
```
Closing as wontfix (intentional, not a bug).

The local `const MAX_POINT_LIGHTS = 4` inside `init()` is used self-consistently to size the VolumetricLightShader's uniforms and GLSL loop, and matches `MAX_VOLUMETRIC_POINT_LIGHTS = 4`. It shadows the module-level constant in name only; there is no correctness bug. At most this is a naming smell — renaming the local to `VOLUMETRIC_LIGHT_COUNT` would remove the confusion, but no behavior changes.
```

### #496
Verify: `grep -n "createStarField\|createCloudPlane" voxEx.html` → confirm both dispose existing geometry/material before rebuild.
```
Closing as a false positive.

`createStarField()` and `createCloudPlane()` both dispose the previous geometry and material (and remove the old object from the scene) at the top before rebuilding. "Reset All" therefore does not leak GPU resources via these paths. No code change needed.
```

---

## B. Close as already fixed — `--reason completed`

**None.** (#523 was originally placed here; the verify pass corrected it — see below.)

### #523 — DO NOT CLOSE (corrected: this is VALID dead code, keep open)
The original review claimed the `#torch-overlay` markup was already removed. That was wrong. A re-grep of the current `voxEx.html` confirms it is **still present and unused**:
- CSS: `#torch-overlay` and `@keyframes torchFlicker` at lines ~329–355
- HTML: `<div id="torch-overlay"></div>` at line ~2186
- JS references: **none** (`getElementById('torch-overlay')` / `querySelector('#torch-overlay')` / `torchOverlay` → zero hits)

So #523 is an accurate **dead-code** issue. **Leave it open.** Optionally relabel:
```bash
gh issue edit 523 --repo kandlerb/VoxEx --add-label "dead-code"
```
Optional clarifying comment (do not close):
```
Confirmed still valid as of 2026-06-24: the `#torch-overlay` CSS (~lines 329–355, incl. `@keyframes torchFlicker`) and `<div id="torch-overlay">` (~line 2186) are still in the file with no JS references. Safe to delete as dead markup.
```

---

## C. Update + flesh out the partials (comment, keep open)

For each: verify the symbol, post the comment, then apply the recommended retitle/relabel (best-effort). **Keep these open** unless verification shows the code was already fixed (then close `completed` and note it).

### #583 — relabel `performance` → `cleanup`; retitle to "refactor: extract computeSpriteFade() — dedupe sun/moon screen-fade blocks"
```
Validated against source. Scoping this down.

The duplication is real: the sun and moon fade blocks are identical, each computing `Math.sqrt(dx*dx + dy*dy)`. But (a) the sqrt cannot be removed — the fade is linear in distance — and (b) this runs on the throttled occlusion path, so the perf impact is negligible. Re-scoping from a perf issue to a pure readability refactor: extract `computeSpriteFade(screenPos)` and call it for both sprites. Low priority.
```

### #580 — relabel to `cleanup`; retitle "cleanup: thread frame time into updateVolumetricLighting instead of a second performance.now()"
```
Validated. The core claim is wrong; keeping a smaller cleanup.

The redundant `performance.now()` call is real, but the stated premise — that a frame `time` is "already available / passed down the call chain" — is false. `renderFrame()` takes no `time` argument and holds no frame-time variable, so there is no clock-drift or visual-discontinuity bug. The only real item is a trivial micro-optimization: thread a single `time` from `animate()` down into `renderFrame`/`updateVolumetricLighting`. Low priority.
```

### #565 — relabel `bug` → `dead-code`
```
Validated. Real logic flaw, but it's in dead code.

`isChunkOccluded()` does use `neighbors.every(n => n !== undefined)` (presence, not opacity), which would over-cull. However the function has no callers — it never executes, so there is no live mis-culling. Re-scoping from "bug" to dead-code: either delete `isChunkOccluded` (and any helper only it uses), or, if chunk-level occlusion is actually wanted, implement it correctly (check opacity, not presence) and wire it in.
```

### #564 — keep `bug`; add note it's latent
```
Validated — real but latent.

`initInventory()` adds an anonymous `resize` listener with no `removeEventListener`. But there is a single call site, so this only leaks if the inventory is re-initialized (e.g., a soft re-init/reload), not on every call. Fix: store the handler reference and remove it on teardown, or guard against double-registration. Severity: low/latent.
```

### #563 — relabel `bug` → `cleanup`
```
Validated — accurate but no runtime impact.

`Vector3Pool.release()` increments `_callCounts.release` and never decrements the active count, so the "active" stat is wrong. But `vec3Pool` has zero acquire/release usage anywhere in the codebase, so nothing is affected at runtime. Fix for correctness, or remove the unused pool entirely. Trivial.
```

### #562 — relabel `bug` → `dead-code`
```
Validated — unfinished stub, not data loss.

`flushChunkSaves()` does have an empty loop body (a `// Save logic here` stub). But `queueChunkSave` has no callers — nothing is ever queued, so no saves are actually discarded. Re-scoping from "silent data loss" to "dead/unfinished stub": either implement the flush or remove `flushChunkSaves`/`queueChunkSave`.
```

### #561 — relabel to `cleanup`
```
Validated — the rationale is wrong; cosmetic only.

The block-scoped `{ const _slt = ... }` exists, but there is no `smoothLightingToggle` naming collision in that scope, so the "workaround avoids a collision" explanation is incorrect. This is just a readability nit — the block scoping can be flattened. No functional concern.
```

### #560 — keep; trivial
```
Validated — real, trivial.

`onMouseWheel` calls `document.getElementById("blocker")` on every wheel event. Fix: cache the element once (`_blockerEl`). Note this fires per wheel-notch, not continuously, so impact is minor. Low priority.
```

### #558 — retitle "perf: hoist dirs literal in meshChunkHeadless (test-only); production path already fixed"; relabel `performance` → `cleanup`
```
Validated. The production path is already fixed; narrowing to the test mesher.

In the live `_renderChunkImpl`, `dirs` is already hoisted above the face loop (per CCR-PERF-010) — the per-face allocation this issue describes no longer exists in the production path. The only remaining occurrence is in the test-only `meshChunkHeadless`. Re-scoping to that (low value), or this can be closed if we don't care about allocations in the headless test harness.
```

### #556 — relabel `bug` → `dead-code`; cross-ref #559
```
Validated — real flaw in dead code.

The pool's `analyzeChunkSections` does flag water-filled sections as fully solid (it counts `blockId !== 0`), but its consumer `isSectionSolid()` is never called, and the renderer uses the global `analyzeChunkSections` (which correctly checks `BLOCK_IS_SOLID && BLOCK_IS_OPAQUE`). So there is no live render-skipping bug. Fold this into the dual section-analysis cleanup (#559): remove the dead `isSectionSolid`/pool analyzer, or fix its solidity test if it's meant to be used.
```

### #555 — relabel `performance` → `cleanup`
```
Validated — marginal.

`precalculateTerrainCaches` does allocate `new Array(chunkSize*chunkSize)` per chunk. But the entries are biome object references, so a typed array isn't applicable; the only available win is reusing a module-level scratch array. Trivial.
```

### #553 — retitle "code smell: AudioManager stores unused settings param (UIManager part is incorrect)"
```
Validated — half right.

AudioManager does store an unused `this.settings` — valid. But the secondary claim about UIManager is wrong: UIManager actively uses `this.settings.get/set`. Re-scoping to AudioManager only: drop the unused parameter there.
```

### #548 — relabel `performance` → `dead-code`
```
Validated — dead code (the issue's own caveat is correct).

The sqrt-in-an-O(n²)-loop is in `VoxelWorld.updateStreaming`, which is not called by the live game (streaming uses module-level functions). So there's no actual perf hit. Re-scoping to dead-code removal: delete `VoxelWorld.updateStreaming` (and the other unused `VoxelWorld` methods flagged in #551/#556/#559).
```

### #545 — keep `bug`; flesh out the real latent bug
```
Validated — real, and there's a latent bug the issue understates.

`BLOCKS` is a genuine incomplete (~12-entry) duplicate of the block-id constants and is still referenced. The issue's stated symptom (that SNOW/GRAVEL/etc. "aren't referenced") is stale — they ARE referenced (e.g. `BLOCKS.SNOW`), and since those keys are missing from `BLOCKS`, those sites resolve to `undefined`. Fix: either complete `BLOCKS` or replace its usages with the canonical block-id constants, and audit the `undefined` reference sites.
```

### #539 — relabel `performance` → `cleanup`
```
Validated — one-time cost, not per-spawn.

`buildChunkWorkerCode()` is uncached, but it is called once from `_initWorkers` (in the pool constructor). There is no `_replaceWorker` path, so it does not run "3–4× per worker spawn" — it's a one-time startup string build. Optional: memoize the result. Trivial.
```

### #538 — relabel `performance` → `dead-code`
```
Validated — cold/dead path.

`getLocalSlope` does allocate an offsets array per call, but it has no live callers (it's injected into the worker template and listed, and the river slope penalty is hardcoded to 0). Not a hot path. If kept, hoist the constant offsets; otherwise remove it.
```

### #531 — relabel `refactor`→`cleanup`; add perf caveat
```
Validated — real duplication, but deliberate.

`_renderChunkImpl` inlines its own `getLocal`/`getLocalLight`, duplicating `buildChunkLightGetters`. This is intentional hot-path inlining, not a latent divergence. If consolidated, keep the inlined fast path for the render loop and only share the cold path — don't regress meshing perf. Low priority.
```

### #529 — keep `cleanup`; correct the profiles claim
```
Validated — valid cleanup, but the profiles claim is wrong.

`fireConsumeChance` and `fireLightLevel` do exist in `DEFAULTS` and `SETTINGS` (marked deprecated) and are worth removing. But they are NOT in `SETTINGS_PROFILES` (grep confirms), so they don't bloat the profiles. Scope: remove the two keys from `DEFAULTS`/`SETTINGS` (and any UI), and drop the profiles assertion.
```

### #518 — keep `bug`; downgrade severity to low/self-XSS
```
Validated — real but lower severity than stated.

An `escapeHtml()` helper already exists and is applied to `saveName`. The remaining gap is `metadata.seed`, which is interpolated raw into the world-card template. Since LocalStorage is only attacker-writable with local access, this is self-XSS. Fix: wrap `metadata.seed` (and any other raw metadata, e.g. thumbnail) in `escapeHtml`, or build the card via `createElement`/`textContent`.
```

### #510 — keep `bug`; narrow scope; cross-ref #508, #512
```
Validated — narrowing scope.

`_handleWorkerError` never rejects `pendingJobs` — correct. But mesh jobs are wrapped in a 500ms `promiseWithTimeout`, so they don't hang; only the unwrapped terrain/init jobs can hang indefinitely on a worker crash. Fix: on worker error, reject the terrain/init promises (or wrap them in timeouts too). Related: #508, #512.
```

### #508 — keep `bug`; narrow scope; cross-ref #510, #512
```
Validated — narrowing scope.

The chunk worker's `self.onmessage` is an `if (type === ...)` chain with no default branch, so an unknown message type posts nothing back and the caller's promise never settles. The mesh path survives via the 500ms timeout; terrain/init do not. Fix: add a default branch that posts an error/ack so callers can reject, or wrap terrain/init jobs in timeouts. Related: #510, #512.
```

### #505 — relabel `bug` → `cleanup`
```
Validated — cosmetic, no functional bug.

The rotation restore uses `rot._x || rot.x || 0`, which is a falsy-zero smell, but it's harmless: an exact `0` falls through `||` to the final `0`, yielding the correct value. Optional cleanup: use `??` or explicit `!== undefined` checks. Not a bug.
```

### #503 — keep `bug`; correct the location
```
Validated — real, but the location in the issue is wrong.

The loop bound is baked into the shader source at build time via a template literal, so the slider only updates an unused uniform and the sample count can't change without rebuilding the shader. But this is the god-ray `VolumetricLightShader`, NOT `waterMaterialRefraction` as the issue states. Fix: rebuild the shader when the setting changes, or document it as build-time-only. (Correcting the referenced symbol.)
```

### #497 — relabel `bug` → `cleanup`; correct the rationale
```
Validated — consistency nit, not a bug.

The reset handlers do call `localStorage.setItem("voxex_settings", ...)` inline. But `saveSettings()` is itself just that single line, so the "you're bypassing saveSettings' side-effects" rationale is false — nothing is skipped. Optional: route through `saveSettings()` for consistency. Low priority.
```

---

## D. Optional (do only if time permits; report what you did)

1. **De-duplicate the cache-version cluster.** #493, #499, and #530 are all VALID and describe the **same** root cause (chunk cache version stamped inconsistently as 2/4 while the reader invalidates on `< 5`). Consider keeping #493 as the canonical issue and adding a one-line cross-reference comment on #499 and #530 pointing at #493 (do **not** close them unless the user confirms). Comment text you may use on #499 and #530:
   ```
   Note: same root cause as #493 (inconsistent chunk cache-version stamping). Tracking the fix there; keeping this open for now as a cross-reference.
   ```

2. **Labeling pass for unlabeled VALID issues** is out of scope here — leave it unless the user asks.

---

## E. Final report (required output)

After the run, print a summary table:

| Issue | Action taken | Verified-against-code? | Notes |
|---|---|---|---|

Then explicitly list:
- **Closed (not planned):** the 6 invalids actually closed (557, 551, 516, 506, 507, 496).
- **Closed (completed):** none expected. (#523 is NOT a close — it's kept open as dead-code per §B.)
- **Commented / updated:** the 24 partials, with any retitle/relabel applied vs. skipped.
- **Skipped / needs human review:** any issue where current code did NOT match the finding (e.g., an "invalid" that now reproduces, or a partial that's already fully fixed) — do not guess; hand these back to the user.

Do not modify any VALID issue not named in this CCR.
```

# VoxEx Agent Notes — hard-won knowledge

> **Status: LIVE — maintained.** Read alongside `CLAUDE.md`. CLAUDE.md holds the
> rules, registries, and checklists; this file holds the *why* — failed
> approaches, debugging lessons, and as-built subsystem notes that would
> otherwise be re-learned the expensive way. When a change invalidates a note
> here, update it in the same commit.

---

## 1. Do-not-retry ledger

Approaches that were tried, failed for structural reasons, and must not be
re-attempted without new information. Each entry says *why* so a future agent
can tell whether circumstances actually changed.

| Approach | Verdict | Why it fails |
|---|---|---|
| **Screen-space refraction for glass** (retired build 2026-06-21.4) | Never retry | View-space refraction xy used as a screen offset slides with camera rotation; depth term amplifies offsets off-screen; clamped UVs smear grazing pixels into gray squares; never depth-correct → parallax see-around. Structural to screen-space — tuning can't fix it. If glass bend is ever wanted: `MeshPhysicalMaterial` transmission (heavy) or leave glass plain. WATER refraction survives because water is viewed near-planar from above. |
| **Deferring chunk compression to post-entry** (CCR-PERF-013 Lever 2, reverted) | Never retry as-is | `batchSaveChunksToCache` compresses ALL chunks in one synchronous loop — moving it from behind the loading screen to after world-entry produced one ~8.7 s freeze. Compression is unavoidable main-thread CPU unless moved OFF-thread; the real fix is compressing in the OPFS `ChunkDiskStorage` worker (Lever 2 Option B, not yet built). |
| **Non-interpolating LUTs for continuous fields** (FADE_LUT, deleted CCR-TERRAIN-006) | Never retry | A 256-entry LUT without lerp turns every noise fade into a stair function → axis-aligned strips of 1–4 blocks across ALL terrain. Invisible while other noise masks it; dominant once the surface is smooth. The exact polynomial also benchmarked FASTER than the LUT on modern JITs. Rule is in CLAUDE.md Performance Tips. |
| **Gradient/flow-aligned frames for terrain features** (gullies, rejected in prototype) | Never retry | Any frame aligned to the height gradient degenerates at gradient zeros — which are exactly the ridgelines and valley floors you care about. Even a smoothed octave-0 frame checkerboards. Swiss-style gradient-*warp* turbulence works (offset, not frame); gradient-aligned *features* do not. |
| **Standalone gully/drainage carve from one noise field** (rejected, CCR-SURF-002) | Never retry | Zero-lines of a single 2D noise field form closed loops → "worm-ring" canyons, not dendritic drainage. Use swiss turbulence (shipped, Phase 1) or a real flow sim (mountain-overhaul-plan Phase 5, spike-gated). |
| **Pure Y-band shoreline materials** (fixed CCR-TERRAIN-011) | Never retry | Any "sand if y ≈ sea level" rule paints inland low plains as sand fields. Shoreline materials must be WATER-PROXIMITY gated (`oceanFactor`/`riverFactor`), with dithered edges — never a bare height band. User rule: "sand should only spawn near river banks and beaches along water." |
| **Global always-on banded meshing** (made lazy, Phase 3.5) | Don't re-enable eagerly | `meshProfile()` A/B showed always-on banding ~doubled streaming mesh load (146 vs 81 ms/s) — first builds pay banding's 4× overhead for zero benefit. Banding only helps EDITS, so chunks band lazily on first edit (`markChunkBanded`). `setEagerBanding(true)` exists for A/B only. |
| **World-axis camera snap for soft shadows** (fixed build 2026-06-20.14) | Never retry | Snapping the shadow camera on world axes can't align with the LIGHT-space texel grid (rotated by the sun) — sub-texel swim persists. Snap in the light basis (see §3 Shadows). Also: re-rounding the light POSITION after computing the snapped target re-introduces the swim. |

## 2. Three.js / browser gotchas (version-specific, verified r160)

- **`customDepthMaterial.alphaTest` is IGNORED**: `WebGLShadowMap.getDepthMaterial()`
  overwrites the depth material's `alphaTest`/`map`/`alphaMap` with the MESH's
  own material values every shadow draw. For cutout shadows the casting mesh's
  material must itself carry `alphaTest > 0` (strip `#include <alphatest_fragment>`
  from its color pass if the color pass must not discard). Glass shadows broke
  on exactly this; see `glassDepthMaterial` (separate instance — terrain's
  per-frame `alphaTest = 0.1` write would leak onto a shared one).
- **Depth materials don't run your tiling shader**: the chunk material repeats
  one atlas tile per block in-shader for greedy-merged quads; `MeshDepthMaterial`
  has no such injection, so merged-quad shadows stretch one tile across the quad.
  Non-greedy per-block meshes (like the glass mesh) dodge this inherently.
- **`backdrop-filter` on an ancestor forces main-thread scrolling + repaint for
  its whole subtree.** That — not DOM weight — is why the tall scrollable
  settings panel janked while short menus in the same overlay were fine. Fixed
  by removing the blur and using a darker opaque scrim (CCR-menu-overlay-lag.md).
  The render loop never pauses behind menus (torch flicker uses
  `performance.now()`), so any blurred backdrop re-blurs every frame.
- **Resized render targets must be disposed and rebuilt, not resized in place**:
  on some drivers (ANGLE) a reallocated depth texture keeps its old size on the
  framebuffer attachment → endless `GL_INVALID_FRAMEBUFFER_OPERATION`. See the
  refraction-target rebuild in `onWindowResize`.
- **Browser GPU-process state can masquerade as a code bug**: the 2026-06-11
  "attachments not same size" + stalled chunks reproduced only in one Chrome
  profile — GPU-process crash fallback, not code. When something reproduces in
  one profile only, suspect the profile.

## 3. Subsystem as-built notes

### Shadows (two stability paths — `updateDayNight`, gated `posChanged || angleChanged`)
- `renderer.shadowMap.autoUpdate = false`; re-render via `markShadowsDirty()`.
- **Blocky ON (default)**: camera follows the sun smoothly; stability = per-fragment
  world-space snap in the chunk shader + the `blockyShadowStep` angle RATCHET
  (freezes the depth map between committed sun steps so edges step monotonically).
  Wobble with blocky shadows ⇒ suspect the ratchet, not the camera.
- **Blocky OFF (soft)**: camera IS texel-snapped — in the LIGHT basis. Key enabler:
  the sun always arcs in the X-Y plane (`shadowLightDir.z === 0`), so the basis
  (forward=(LX,LY,0), right=worldZ, up=(LY,−LX,0)) is never degenerate. Snap
  camPos along right+up to `texelWorldSize` (1/16 block), keep forward continuous,
  set light position = target ± lightDir·offset with NO extra world re-round.
  The moon shares the snapped target.

### Worker mesh pipeline (CCR-chunk-remesh-consolidation, Phases 0–4 SHIPPED)
- `WORKER_MESH_PIPELINE_ENABLED = true`: workers mesh UNBANDED (streaming,
  never-edited) chunks; banded/edited/torch/fire/glass chunks mesh on main via
  `renderChunk`. Worker mesher is single-sourced by `buildChunkWorkerCode`
  injection and byte-parity-gated in the browser suite. Revert switch: set the
  flag false.
- Banded meshing is PER-CHUNK LAZY: `chunkUsesBands(cKey)`, chunks band on first
  edit via `markChunkBanded`. Mesh keys become `'cx,cz#band'` (+`_WATER`);
  `chunkBaseOfMeshKey()` strips both. 4 bands × 5 sections.
- Light is baked into vertex colors; light changes still force remeshes
  (Phase F "light as texture" deferred). `SETTINGS.lightRefill` (default OFF)
  is the partial mitigation.
- Diagnosis tool: `meshProfile.reset()` → fly fresh terrain → `meshProfile()`
  (builds, avg ms/build, mesh ms/s, worst frame). Result of the CCR: main-thread
  mesh load ~203 → ~4 ms/s.
- Integration lessons from first enabling the long-dormant pipeline: dispatch
  caps sized for sync builds starved the worker path (now burst-scaled), and
  `ensureChunk` (collision) synchronously meshed chunks it only needed DATA from.

### Glass & materials (CCR-texture-material-response, CCR's in repo root)
- Per-texel `roughnessMap` authored in `initTextures` from `MAT_PROFILES`
  (matte base + color-keyed shiny accents per tile). Shiny accents need
  roughness ≲110 to glint; ≳140 reads matte. Sparse flecks mip away at
  distance (intended close-up effect).
- `uShininessStrength` uniform (injected after `roughnessmap_fragment`) is
  driven by the REPURPOSED `SETTINGS.specularIntensity` ("Shininess Strength").
  `specularEnabled` off ⇒ fully matte — and ALSO zeroes env reflections
  (roughnessFactor coupling); `specularShininess` was retired.
- Glass is a SEPARATE translucent mesh per chunk (`<cKey>_GLASS`), non-greedy
  1×1 quads, emitted at the end of `renderChunk`; workers route `hasGlass`
  chunks to main. Body opacity is baked into texture alpha (`_glassBodyTexels`,
  `setGlassBodyAlpha()` re-bakes live); glint punch-through via `uGlintReflect`
  (repurposed `specularFresnel`). Glass casts cutout shadows via
  `glassDepthMaterial` + `glassMaterial.alphaTest = 0.5` (see §2 gotcha).
- Env reflections (Phase 3): ANALYTIC sky reflection (same approach as water),
  chunk-material-only, gated `envReflectionEnabled` (default false, not in
  profiles). Deliberately NOT PMREM/cubemap — single-file rule + near-free.

### Fire & torch light
- FIRE bakes **zero** block light (`lightEmission: 0`) and glows via the dynamic
  `torchLightPool` PointLights (pool scans `chunkFires`) — this keeps `setBlock`
  on the light-neutral fast path. Fire lives in AIR adjacent to burnables,
  climbs biased-up, chars via per-block `BURN_TIME`/`BURN_RESULT`.
  Former gaps (settings UI, profile caps, fire tests, VoxelWorld.isSolidBlock,
  eager cell unregister) were ALL closed in build 2026-06-17.6 (FireImplementation.md
  §17 G1-G5); `fireMaxActive` default raised 48→128 by CCR-fire-system-limits.
  `fireMaxEditsPerTick`/`fireConsumeChance`/`fireLightLevel` are dead/deprecated
  settings (kept for save compat; not consulted by the tick).

### World-gen params persistence (VOXEX-CCR-UI-001 item 4/4b)
- `worldConfig` has LIVE getters (biomeFrequency, biomeSizeMultiplier,
  persistence, lacunarity, enableRivers, forceSingleBiome) — it was a static
  snapshot once, which is why create-world knobs used to be dead.
- `activeWorldGenParams` is the single source of truth for the ACTIVE world
  (NOT `customWorldSettings` — that's create-world UI state). `applyGenParams(p)`
  applies + rebuilds `worldConfig.biomes` (shallow copy — BIOME_CONFIG edits
  need the rebuild). Persisted as `savePacket.genParams` (v3), restored BEFORE
  generation.
- The chunk worker bakes `worldConfig` + biomes ONCE at pool creation. In-session
  loads (pause-menu Load, F9) must call `rebuildChunkWorkerPoolForActiveWorld()`
  to re-bake; title-screen loads get it free via `location.reload()`.

### World-gen performance (CCR-PERF-013)
- Spawn generation is MAIN-THREAD bound, not worker bound (trace: 71 s to
  playable, workers ~85% idle; sunlight 18.8 s + compression 8.7 s on main).
- Lever 1 (worker sunlight, `WORKER_LIGHTING_ENABLED`) shipped — bought
  headroom, little wall-clock (the pipeline is paced by async caching, not CPU).
  Worker ships zero blockLight (fresh terrain has no torches); `calculateBlockLight`
  stays main-only. Lever 2 Option B (compress in the OPFS worker) is the real
  remaining fix; Lever 3 (lower `preGenRenderDistance` on low-end) is the cheap win.

### Menus / UI overlays
- `#seed-menu` and `#create-world-panel` are SEPARATE top-level overlays (no
  backdrop-filter) — that's why world creation stays smooth. Keep new heavy
  overlays out of `#blocker`. `#inventory-overlay` still has blur(2px) (small,
  non-scrolling, tolerable).
- Approved UI-overhaul directions + mockups: `ui-mockups.html` + CCR-ui-overhaul
  (mobile = landscape multi-column; ONE collapsible-dropdown method everywhere =
  two independent flex columns, never CSS multicol, never 2-cell grid;
  settings = sidebar + sub-tabs + group cards).

## 4. Terrain lessons (beyond the ledger)

- **"Directional-looking" ≠ anisotropic.** The corduroy mountain ribbing measured
  isotropic (per-axis mean-step ratio ~1.0) — it was grid-aligned high-frequency
  noise sampled at RAW (un-warped) coordinates. Fix was halving the offending
  frequencies. Separately, the old 3D-projected gradient table WAS ~7–27%
  Z-biased (fixed with the 16-direction table, magnitude √(11/8) to preserve
  noise std ≈ 0.253 so ocean/river thresholds survived). Diagnose with per-axis
  step statistics before assuming either cause.
- **Tune only on a clean base.** The FADE_LUT quantization contaminated every
  texture/roughness judgment made while it was live ("tune ONLY after the LUT
  fix"). If a systemic artifact is suspected, fix it before tuning constants.
- **SWISS_WARP hard bound < 14** (continuity 26.3 at 14 vs 6.8–8.2 at 8–12,
  bar 30) — documented on the const. If the notch test trips, lower SWISS_WARP
  to 8 before raising NOTCH_LIFT.
- **River carve strength fades must reach zero BEFORE the width cutoff bites**
  (valley 80–93, channel 82–95 vs width fade 75–95) — otherwise a cliff ring /
  dam forms at the pinch (measured 62-block cliff without it, 2 with).
- **noise2Dd is algebraically-equal-but-not-bit-identical to noise2D** — any
  reroute through it shifts ALL terrain by float epsilons ⇒ TERRAIN_GEN_VERSION
  bump required.
- **Prototype before implementing terrain features.** The mountain-overhaul work
  validated swiss turbulence, rejected flow-aligned gullies, and pre-measured
  every constant in Node probes before touching voxEx.html. Keep that discipline:
  probe → numbers → implement → `terrain-node-checks` → browser suite → in-game.
  The instruments are first-class now: `tools/terrain-probe.mjs` (point queries,
  transects with max-step, per-axis anisotropy stats, hillshade PNG renders).
  Baseline the metric/render BEFORE the change, re-run AFTER, cite both.

## 5. Product/aesthetic decisions (user-settled; don't re-litigate)

- Natural mountains: connected ridges with internal valleys rising through
  foothills — no fantasy needle spires; some cliffs OK. Summit aspect ~0.9:1.
- CLEAN slopes preferred over de-terrace texture ("messy and noisy" verdict on
  slope noise) — voxel contour steps are the accepted Minecraft look.
- The emergent stepped stone/grass river-gorge walls are LIKED — keep them.
- Sand only near actual water (riverbanks, ocean shores) — never height-banded.
- Blocky shadows default ON, but Kandler personally prefers the soft-shadow look.
- Wet-shoreline damp edge stays CRISP/blocky (deliberately kept in the merge key).
- Menus: consistency over cleverness (one dropdown pattern everywhere).

## 6. Verification thresholds (the numbers the suites enforce)

| Check | Bar |
|---|---|
| Adjacent-column continuity | < 30 blocks (post-overhaul terrain legitimately has 10–20 gorge walls) |
| Notch metric (browser suite) | ≤ 6 per seed |
| River flood integrity | < 5% dry channel cores |
| Worker mesh/terrain parity | BYTE-exact (browser suite) |
| meshProfile streaming load | ~81 ms/s reference (lazy banding); worst frame ≤ ~17 ms |
| Mountain region coverage | ~10–13% |
| Frame budget | 16.67 ms; 8 ms per sliced operation |

Multi-seed rule: terrain acceptance = harness green on ≥3 seeds, not one.

## 7. Agent environment notes (Cowork sandbox — SKIP if running Claude Code on Windows)

These apply ONLY to agents running in the Cowork Linux sandbox with
`D:\Projects\voxex` FUSE-mounted; native Windows agents are unaffected.

- **The bash mount serves STALE/TRUNCATED reads of large pre-existing files**
  (voxEx.html especially) — frozen at an old byte offset, hard-cut mid-line,
  persisting across sleeps. The Read/Grep/Edit tools bypass the mount and are
  authoritative. NEVER trust bash `cat`/`wc`/`stat` on voxEx.html; NEVER
  `git add` voxEx.html from the sandbox without proving the mount view matches
  the real file (git reads through the mount → commits truncated content).
  New files sync fine; bash-side writes (`cp`, heredoc) are coherent.
  **Edit-tool edits to ANY pre-existing file can leave the mount stale for
  that file** — after editing, verify (`grep` the new text via bash) before
  any `git add`; if stale, rewrite the full file to the outputs folder and
  `cp` it over (the cp makes the mount the writer, restoring coherence).
- **Sandbox git corrupts `.git/index` intermittently** ("bad signature") and
  cannot always unlink its own `.lock` files (needs `allow_cowork_file_delete`).
  Workaround: `rm -f .git/index*`, then run git with
  `GIT_INDEX_FILE=/tmp/vox.index` (+ `git read-tree HEAD` first), and rebuild
  the real index (`git reset -q`) at the end. Prefer committing from Windows
  when possible. **After EVERY commit, verify the committed blobs aren't
  truncated**: `git show HEAD:<file> | tail` must end where the real file ends.
- **Do NOT mix bash file-overwrites with the Edit tool on the same file** —
  it desyncs the harness cache and re-truncates (documented 2.6 MB-file loss;
  recover via `git show HEAD:voxEx.html`).
- Kandler PLAYS VoxEx in a different Chrome profile than the extension-connected
  one — saved worlds/localStorage differ. "Works for me / broken for him" ⇒
  check which profile first.
- Deployed game: https://kandlerb.github.io/VoxEx/voxEx.html (GitHub Pages from
  pushed main). Browser suite: /tools/voxex-tests.html (serve over localhost),
  or headlessly via `tools/run-browser-tests.mjs`.
- **Headless Chromium bootstrap without root (VALIDATED 2026-07-06, 315/315
  green in ~30 s):**
  ```sh
  npx -y @puppeteer/browsers install chromium@latest --path /tmp/br
  apt-get download libxdamage1 && dpkg -x libxdamage1_*.deb /tmp/libs   # the one missing lib
  LD_LIBRARY_PATH=/tmp/libs/usr/lib/x86_64-linux-gnu \
    CHROME=/tmp/br/chromium/<snapshot>/chrome-linux/chrome \
    node tools/run-browser-tests.mjs --timeout=600
  ```
  The download is ~160 MB — run it under nohup and poll if the shell has a
  per-command timeout. `ldd <chrome> | grep "not found"` tells you which libs
  (if any) still need the apt-get download + dpkg -x treatment.

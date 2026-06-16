# CCR — Sky Consolidation, Optimization & Pause Behavior

> **Type:** Feature + Refactor + Optimization · single-file `voxEx.html`
> **Line numbers verified against the current working copy** (read directly, not from memory). They will still drift as edits land — every step below also names the symbol/string to search for so anchors are self-correcting.
> **Decisions already made:** consolidated UI lives in a **new Graphics › Sky panel**; optimization = **tune + quality presets**; **consolidate the duplicated wiring**.

---

## 0. Architecture you must understand first (this is where it can break)

The settings system is **not** single-source. Sky controls are currently touched by **five** separate code paths, and several are **duplicates that both run**:

| Path | Function (verified line) | Runs when | Touches sky? |
|---|---|---|---|
| Early UI sync | `initSettingsUI()` **6302** (sky colors ~6407–6413) | page load | colors only |
| Menu-open UI sync | `syncSettingsToUI()` **22031** (toggles ~22295–22298, sync ~22310–22344, colors ~22385–22392) | every time settings menu opens | all |
| **Canonical event wiring** | `attachSettingsEventListeners()` **22459** (toggles 23390–23410, stars 23412–23456, clouds 23458–23478, colors ~23616–23640) | once at `DOMContentLoaded` (called 23768) | all |
| **Duplicate** wiring + sync + reset | `init()` **26523** (sync 28102–28109 & colors ~27771–27778; **duplicate** wiring colors 28314, toggles 28355, clouds 28422; nested `updateUIFromSettings()` **28675**; reset block 29030–29119) | once when a world starts (called 23792) | all |
| Reset (colors) | World‑Env reset handler in `init()` ~29237 | reset button | colors only |

### ⚠️ Breakage fact #1 — sky controls are double event-bound today
`attachSettingsEventListeners()` (22459, fires at page load) **and** `init()` (26523, fires at world start) each call `getElementById("stars-toggle")` / `"clouds-toggle"` / `"cloud-density-input"` / the sky color inputs and attach a **second** `change` listener. After a world starts, toggling Stars runs the handler **twice** → `createStarField()` rebuilds twice per click. Idempotent (same value written twice) so it's not *visibly* broken, but it is wasteful and is exactly the duplication to collapse. **Do not add a third binding.** Pick `attachSettingsEventListeners()` as the single wiring home and **delete** the duplicate wiring inside `init()` (28314, 28355, 28422 blocks).

### ⚠️ Breakage fact #2 — reset logic lives *inside* `init()` and uses closures
The Graphics‑Effects reset (29030–29119) and `updateUIFromSettings()` (28675) are **nested inside `init()`**, so they close over `scene`, `createStarField`, `cloudPlane`, and especially `updateStarLayerVisibility()` (defined nested at **28345**). If you move reset/sync logic out of `init()`, `updateStarLayerVisibility()` must be **hoisted to module scope** or the moved code throws `ReferenceError`. Verify closure access for `scene` / `starField` / `cloudPlane` (module-level `let`s — fine) vs the nested helper (not fine).

### ⚠️ Breakage fact #3 — there are TWO sync functions
`syncSettingsToUI()` (22031, menu-open) and `updateUIFromSettings()` (28675, reset/profile) both mirror SETTINGS→DOM and **both** list sky controls. Any moved/added sky control must be reflected in **both**, plus the early `initSettingsUI()` (6302). Missing one = control silently shows a stale value.

### Profiles (verified)
`SETTINGS_PROFILES` (**6232–6293**) has `performance` / `balanced` / `quality`, and currently lists **zero** sky keys. Per CLAUDE.md, a profile only writes the keys it lists, so **adding** sky keys is safe and won't disturb other settings (mirrors the deliberate touch-settings exclusion).

---

## 1. The sky subsystems and their update paths (verified)

| Subsystem | Create (line) | Update (line) | Animation driver | Pauses today? |
|---|---|---|---|---|
| Sky dome gradient `skyMaterial` | 26571 (sphere `skybox` 26621) | `updateDayNight()` **42144** (colors 42184–42201) | `dayNightTime` | ✅ gated |
| Sun / Moon sprites | 26623 / 26645 | `updateDayNight()` (42154–42157) | `dayNightTime` | ✅ gated |
| Day/night colors + fog | init 26540, `refreshSkyFogColorsFromSettings()` 26546 | `updateDayNight()` | `dayNightTime` | ✅ gated |
| Stars (3 layers) | `createStarField()` **14866** | `updateStars(time,…)` **14994**; twinkle uniform set at **15009** | **real `performance.now()`** | ❌ no |
| Clouds (particles) | `createCloudPlane()` **15031**; `CLOUD_BASE_COUNT=1500` **15029** | `updateClouds(time,…)` **15193**; drift uniform set at **15196** | **real `performance.now()`** | ❌ no |
| Color grading pass | `createColorGradingPass()` **15947** | `updateColorGrading()` **15989** | `dayNightTime` | ➖ static, still runs |
| Biome fog tint | `BIOME_FOG_TINTS` **16020** | `updateBiomeFogTint()` **16034** | player pos | ➖ runs every frame |

**Orchestration:** `updateVisualEffects(time, dt)` (**42673**) handles FOV, torch flicker, torch particles **and** the sky calls (`updateStars` 42839, `updateClouds` 42844, `updateColorGrading` 42855, `updateBiomeFogTint` 42859). It is called **unconditionally** at **43775** in `animate()`. `updateDayNight(clampedDt)` by contrast sits inside `if (isGameplayActive())` at **43737–43738** — which is why the dome/sun freeze on pause but stars/clouds (driven by `performance.now()`) keep moving.

> **Do NOT wrap all of `updateVisualEffects` in a pause gate** — it also runs FOV/torch logic that should keep working. The fix is surgical (Workstream A).

### Audit notes (re-verified against the working copy)
- `updateStars` / `updateClouds` have **exactly one** caller each (`updateVisualEffects`, 42839/42844) — so the `skyClock` swap is a complete pause fix; nothing else feeds them real `time`.
- `time` is still needed inside `updateVisualEffects` for torch flicker (42684, `Math.sin(time * 0.003)`) — only the two sky calls switch to `skyClock`; leave torch logic on real `time`.
- New identifiers `skyClock`, `skyQuality`, `MAX_CLOUD_PARTICLES` are **unused** today — no shadowing.
- `initSettingsUI()` is **live** (registered at 6433), not dead — it must be kept in sync.
- The `init()` reset block (29025–29119) and `updateUIFromSettings()` (28675) are **nested inside `init()`**; keep relocated reset/sync logic inside `init()` to preserve closure access, or hoist `updateStarLayerVisibility()` (28345).

---

## End Goal
1. **Consolidated:** one **Graphics › Sky** panel exposes sky colors, stars, clouds, color grading, biome fog (+ a master Sky Quality). All round-trip through save/load and Reset.
2. **Single-source wiring:** the duplicate `init()` sky wiring is removed; `attachSettingsEventListeners()` is the only place sky controls are bound; both sync functions and the (now single) reset cover the moved controls.
3. **Optimized:** cloud default retuned to ~10k particles with a high ceiling (particles are cheap) and a safety cap; per-frame logging gone; star/cloud budgets driven by Sky Quality and wired into the three profiles. No visible quality regression.
4. **Pauses:** stars stop twinkling and clouds stop drifting the instant the game pauses, and resume with **no time jump**.

---

## Workstream A — Pause the sky (surgical, low risk)

**A1.** Declare a paused-aware clock at module scope, next to `let dayNightTime = 0.25;` (**11392**):
```js
let skyClock = 0; // ms; advances only during active gameplay so sky animation freezes on pause
```

**A2.** Advance it only during gameplay. In `animate()` (**43737–43738**):
```js
// BEFORE
                    if (isGameplayActive()) {
                        updateDayNight(clampedDt);
// AFTER
                    if (isGameplayActive()) {
                        skyClock += clampedDt * 1000; // paused-aware ms clock for star twinkle + cloud drift
                        updateDayNight(clampedDt);
```

**A3.** Feed `skyClock` (not real `time`) to the two animated subsystems, in `updateVisualEffects` (**42839** and **42844**):
```js
// BEFORE
                updateStars(time, dayNightTime, controls ? getPlayerWorldPosition() : null);
                ...
                updateClouds(time, sunY, controls ? getPlayerWorldPosition() : null, dayNightTime);
// AFTER
                updateStars(skyClock, dayNightTime, controls ? getPlayerWorldPosition() : null);
                ...
                updateClouds(skyClock, sunY, controls ? getPlayerWorldPosition() : null, dayNightTime);
```
The internal `time * 0.001` math (15009, 15196) is unchanged — feeding a frozen ms clock freezes drift/twinkle and resumes seamlessly because the clock never jumped. **No signature changes** to `updateStars`/`updateClouds`.

**A4 (optional micro-opt).** When paused, the two calls still rewrite uniforms to the same value — harmless. If you want zero paused-frame sky math, early-return those two calls behind `isGameplayActive()`; leave `updateColorGrading`/`updateBiomeFogTint` as-is (cheap, and `dayNightTime` is frozen anyway).

**Why it can't regress day/night:** `dayNightTime` and the dome/sun are still driven entirely by `updateDayNight`, untouched here.

---

## Workstream B — Consolidate into Graphics › Sky

### B1. New panel + nav (HTML)
- Add a category button in `#settings-graphics` (after Effects, **2593**): `<button class="menu-btn category-btn" id="btn-graphics-sky">Sky</button>`.
- Add a panel `<div id="settings-graphics-sky" class="settings-panel" …>` with `<h1>Graphics › Sky</h1>`, a `btn-reset-graphics-sky` reset button, and a `btn-back-from-graphics-sky` back button (mirror `#settings-graphics-effects` 3118–3444).
- Register routes in the nav map (**3747–3756**): add `['btn-graphics-sky','settings-graphics-sky']` and `['btn-back-from-graphics-sky','settings-graphics']`.

### B2. Move existing DOM blocks in (keep every `id`/`data-group` unchanged)
Relocate, don't rebuild — preserving ids means the existing handlers keep matching:
- Sky **Colors**: the four color inputs from World › Environment (**3567–3580**: `day-sky-top-color`, `day-sky-bottom-color`, `night-sky-top-color`, `night-sky-bottom-color`).
- **Stars** group `data-group="stars"` (**3270–3396**, includes `star-layers-input` + the three `star-layer{1,2,3}` subgroups).
- **Clouds** group `data-group="clouds"` (**3399–3439**).
- **Color Grading** toggle (`color-grading-toggle`, 3262) and **Biome Fog** toggle (`biome-fog-toggle`, 3266).
- Then **delete** the emptied World › Environment panel (3563–3584) + its `btn-world-environment` button (3541) + its nav-map rows + its reset handler (~29237), OR keep the panel as a stub — but don't leave a button pointing at an empty panel.
- **Leave World › Time (day length / time-of-day) where it is** (out of scope).

### B3. Update EVERY settings touchpoint (the map in §0)
For each moved control, confirm it is handled in all of: `initSettingsUI()` (6302, live — called at 6433), `syncSettingsToUI()` (22031), `attachSettingsEventListeners()` (22459), `updateUIFromSettings()` (28675), and the reset path. Because ids don't change, most handlers keep working. Specifics:
- Also remove the now-orphaned **"Atmospheric Effects"** section label (`settings-section-label`, **3258**) from the Effects panel once stars/clouds/toggles move out, so the Effects panel doesn't show an empty heading.
- **Reset split:** the Effects reset handler (`btn-reset-graphics-effects`) currently resets sky **and** non-sky in one block (29025–29119: zombie/particles **+** stars/clouds/grading/fog/star-layers/cloud-inputs **+** torch/block-break/footstep). **Extract only the sky lines** (29031–29061 + the input-reset loops 29089–29119) into the new `btn-reset-graphics-sky` handler, and fold the sky-color reset (~29237) in with them. Leave the zombie/particles/torch/block-break/footstep resets in `btn-reset-graphics-effects`.
- **Keep the new sky-reset handler *inside* `init()`** (next to the existing reset handlers) so it retains closure access to `scene`, `createStarField`, `cloudPlane`, and `updateStarLayerVisibility()` (28345) — this avoids any hoist.

### B4. Collapse the duplicate wiring (the actual consolidation)
- **Delete** the duplicate sky **event wiring inside `init()`**: the color-input wiring (~28314–28316), toggle wiring (~28355–28364), and cloud/star input wiring (~28422–28427). Keep `attachSettingsEventListeners()` (22459) as the single source.
- Keep `init()`'s sky **sync** lines only if still needed for first-world-start display; prefer routing that through `syncSettingsToUI()`/`updateUIFromSettings()` so sync lives in one place too.
- **Before deleting,** diff the two wiring copies — confirm `attachSettingsEventListeners()` covers every control the `init()` copy did (it does today: toggles 23390–23410, stars 23412–23456, clouds 23458–23478, colors ~23616–23640). Any control only wired in `init()` must be added to `attachSettingsEventListeners()` first.
- If you hoist `updateStarLayerVisibility()` (28345) out of `init()` to support a relocated reset, make it module scope and re-point its one call site.

### B5. Add the Sky Quality control (see C3) at the top of the new panel, fully plumbed.

---

## Workstream C — Optimize (look good, run well)

**C1. Retune cloud count — default ~10k, ceiling much higher (particles are cheap).** `createCloudPlane` computes `count = Math.floor(CLOUD_BASE_COUNT * SETTINGS.cloudDensity)` (**15041**) = `1500 × 10 = 15,000` particles today, while density default is `10` and the hint says `1.0`. Clouds are a single `THREE.Points` draw call with a custom shader, so more particles cost little. Make density an intuitive multiplier where **`1.0` = the ~10k default**, by setting the base to 10,000 — which also makes the **existing hint text ("Default: 1.0, Range: 0.1–5.0", 3431) correct with no HTML change**:
```js
// CLOUD_BASE_COUNT (15029) — 10000 × 1.0 = 10,000 particles at default; only other use is 15041
const CLOUD_BASE_COUNT = 10000;
const MAX_CLOUD_PARTICLES = 50000; // safety ceiling only (0.1–5.0 density => 1k–50k)
// DEFAULTS (6200)
cloudDensity: 1.0,
// SETTINGS initializer (5959) — migrate legacy saves: old scheme stored density 10 (=>100k under the new base);
// any persisted value above the new 5.0 max is old-scheme, snap it back to the 1.0 default.
cloudDensity: (savedSettings.cloudDensity !== undefined && savedSettings.cloudDensity <= 5 ? savedSettings.cloudDensity : 1.0),
// createCloudPlane (15041) — generous safety ceiling only
const count = Math.min(MAX_CLOUD_PARTICLES, Math.floor(CLOUD_BASE_COUNT * SETTINGS.cloudDensity));
```
Net: default 10,000 particles (down from 15,000), users can push to ~50,000 via density up to 5.0, the UI hint becomes accurate, and existing saves migrate cleanly. `CLOUD_BASE_COUNT` has only the two references (15029 def, 15041 use), so the base change is fully localized. Keep the comment at 15029 ("Base particle count, multiplied by density setting") — still accurate.

**C2. Remove the per-frame log** in `updateClouds` (**15226–15231**) — it runs `console.log` on ~1% of night frames, violating the no-per-frame-logging rule:
```js
// DELETE this whole block:
                if (dayNightTime > 0.7 || dayNightTime < 0.2) {
                    if (Math.random() < 0.01) { // Only log occasionally
                        console.log(`[Clouds] dayNightTime=${dayNightTime.toFixed(3)}, dayNightFactor=${dayNightFactor.toFixed(3)}`);
                    }
                }
```
Sweep `createStarField`/`updateStars`/`createCloudPlane` for any other stray `console.log`; use `logDebug('[Sky] …')` only where needed.

**C3. Master `skyQuality` (`low`/`medium`/`high`, default `medium`).** Add to DEFAULTS + SETTINGS + a `<select>` in the new panel + wiring in `attachSettingsEventListeners()` + sync in both sync functions + reset. It scales the expensive knobs (cloud particle count via density/cap, total star count via `starLayerCount`/per-layer counts) and triggers the existing rebuild paths (`createStarField`/`createCloudPlane`, the same calls toggles already use at 23393/23399).

**C4. Wire sky budgets into profiles.** Add `skyQuality` (and matching `cloudDensity` / star counts) to each of `SETTINGS_PROFILES.performance/balanced/quality` (6233/6253/6273). With the new `1.0 = ~10k` scale and cheap particles, keep these generous — e.g. performance→low/`0.6` (≈6k), balanced→medium/`1.0` (≈10k), quality→high/`2.0` (≈20k). Keep user **color** choices out of profiles (preference, not perf).

**C5. Cheap cloud rendering wins (keep look identical).** Lower default particle count and compensate with `cloudParticleSize`; optionally add a distance alpha-fade in the existing cloud shader (15116–15171). **Preserve `clouds.frustumCulled = false` and its comment (15181–15186)** — clouds are re-centered on the player in the vertex shader (`playerPos` uniform) and culling them by static origin bounds makes the whole layer flicker out. Stars: keep twinkle in-shader (already cheap); only scale counts.

**C6. Measure.** Capture FPS + draw calls (debug overlay `~`, perf overlay `O`, `window.geometryPool.getStats()`) before/after at each Sky Quality level, day and night.

---

## Safety checks (state these in the summary)
- [ ] No duplicate/shadowed identifiers for new names (`skyClock`, `skyQuality`, `MAX_CLOUD_PARTICLES`) — searched first.
- [ ] Sky controls bound in **exactly one** place after the change (deleted the `init()` duplicate wiring; `attachSettingsEventListeners()` is sole source) — verified no element gets two `change` listeners.
- [ ] `updateStarLayerVisibility()` reachable from wherever reset now lives (hoisted if moved).
- [ ] Every moved/added control reflected in `initSettingsUI()` + `syncSettingsToUI()` + `updateUIFromSettings()` and the single merged reset; new ids exist in HTML; settings round-trip via save/load + Reset.
- [ ] `CLOUD_BASE_COUNT=10000` so density `1.0`≈10k; `cloudDensity` default `1.0`; `MAX_CLOUD_PARTICLES=50000` cap; legacy saves (>5) migrated to `1.0`; existing hint now accurate (no HTML change).
- [ ] `clouds.frustumCulled = false` + comment preserved.
- [ ] No new heavy per-frame loops; sky does no animation math while paused; no allocations added to `updateClouds`/`updateStars` hot paths; `logDebug` not `console.log`; strict equality; single-file rule intact.
- [ ] Bumped `VOXEX_BUILD` + added a `VOXEX_RECENT_CHANGES` line.

## Testing
1. Serve over localhost; run `tools/voxex-tests.html` (~204 tests) — no regressions.
2. Pause/unpause repeatedly: clouds + stars must freeze instantly and resume with no snap-forward; toggle Stars/Clouds and confirm a **single** rebuild per click (e.g. temporary count log, then remove).
3. Cross Dawn/Noon/Dusk/Midnight (World › Time): sky colors, star visibility window, color grading, biome fog all still behave.
4. Round-trip: change every sky control, switch profiles, hit Reset, reload — persistence holds; Sky Quality + profiles actually change particle/star budgets.
5. Perf: FPS + draw calls per Sky Quality level; confirm pushing cloud density to max (5.0 ≈ 50k particles) stays smooth — particles should be cheap (single Points draw call). Confirm a legacy save (cloudDensity 10) loads as ~10k, not 100k.

## Out of scope
- Day length / time-of-day stay in World › Time.
- No new sky features (weather/aurora). Consolidation + optimization + pause only.
- Deeper unification of the two sync functions (`syncSettingsToUI` vs `updateUIFromSettings`) beyond sky is **not** required here — note it as follow-up tech debt.

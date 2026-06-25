# CCR — Sun Shadow Pixel-Consistency Tuning (VoxEx)

**File:** `voxEx.html` (single-file rule honored)
**Type:** Tuning (settings defaults) — small, low-risk.
**Status:** Proposal — hand to a Sonnet agent. One firm default change + a documented recommended `blockyShadow*` set with one optional knob.
**Date:** 2026-06-24. Verified against build `2026-06-24.31`; re-confirm by grep before editing.

> Context: the block-grid pixel-snapped sun shadow is already fully built and ON by default (`SETTINGS.blockyShadows`, in-shader `floor(world*16)/16` snap at ~line 31662, hard `blockyGetShadow` tap, 16-texels/block locked by `deriveShadowConfig`, sun-angle ratchet). The snap is **receiver-side** and applied to the chunk + glass materials, so **any** caster's shadow landing on terrain/glass — including mobs — is already grid-locked. This CCR does **not** rebuild any of that. It (1) optionally hardens shadows *received on* non-terrain surfaces (mob/prop bodies — the one place stock soft PCF still shows), and (2) records the recommended `blockyShadow*` values.

> **Correction note (2026-06-24):** an earlier draft claimed mob shadows weren't grid-locked. That was wrong — a mob's shadow **on the ground is already pixel-snapped** (terrain is the receiver and it snaps, regardless of what cast the shadow). The only un-snapped case is a shadow falling **on** a mob's own body. Change 1 is therefore a minor polish, not a visible ground-shadow fix.

---

## Change 1 (optional / minor) — default `shadowMapType` `'medium'` → `'low'`

**Why (corrected — read carefully):** the pixel snap is **receiver-side**. The chunk (terrain) and glass shaders quantize the shadow lookup to the 16/block grid (`floor(vWorldPositionCyl*16)/16`) and read it with the hard `blockyGetShadow` tap; this is applied only via `applyCylindricalFog` (→ `chunkMaterial` 31905, `glassMaterial` 31909). The shadow **map** holds depth from every caster, so any shadow landing **on terrain or glass is already grid-locked regardless of what cast it — including a mob's shadow on the ground.** `shadowMapType` only governs how **non-terrain/glass receivers** (mob bodies, props) sample the map, via stock `getShadow`. So this change affects **only shadows that fall onto a mob's body / a prop**, which is a rare, subtle case (self-shading from the light angle is plain diffuse N·L, not shadow-mapped). `'low'` (BasicShadowMap) makes those received-on-mob shadows hard instead of soft (PCF), for consistency, and is marginally cheaper. **It is not required and changes nothing about the prominent ground shadows.** Keep or skip based on whether soft shadows on mob bodies actually bother you in-game.

**Site A — `DEFAULTS`, line 6354**

Current:
```js
                shadowMapType: 'medium', // 'low' = BasicShadowMap, 'medium' = PCFShadowMap, 'high' = PCFSoftShadowMap
```
Proposed:
```js
                shadowMapType: 'low', // 'low' = BasicShadowMap (hard, matches blocky terrain), 'medium' = PCFShadowMap, 'high' = PCFSoftShadowMap
```

**Site B — `SETTINGS` literal fallback, line 6095**

Current:
```js
                shadowMapType: savedSettings.shadowMapType ?? 'medium', // CCR R3: was DEFAULTS-only; now round-trips
```
Proposed:
```js
                shadowMapType: savedSettings.shadowMapType ?? 'low', // CCR R3: round-trips; default 'low' for hard non-terrain shadows
```

**Applied at** line 27777 (`renderer.shadowMap.type = shadowMapTypes[SETTINGS.shadowMapType]`), read **once at renderer init** — there is no live handler and no UI control for this key.

**Honest caveats (read before shipping):**
1. **It only affects shadows *received on* non-terrain surfaces.** A mob's shadow cast on the **ground is already grid-locked** (terrain is the receiver and snaps it). This change touches only the rarer case of a shadow falling **on** a mob's body / a prop. Those receivers use stock `getShadow`, so even on `'low'` they're hard but **not** block-grid-snapped (only terrain/glass snap) — hard/aliased, not pixel-aligned. If that aliasing looks worse than soft, revert to `'medium'`. Net: low stakes either way.
2. **Round-trip means existing saves override it.** `shadowMapType` persists to the `voxex_settings` LocalStorage key, and there's no UI to change it. So after this edit, an existing install (yours) keeps its saved `'medium'` until you **reset lighting settings** (or clear the `voxex_settings` key). Decide one of:
   - simplest: just reset settings after the change (fine for a solo dev), or
   - add a one-time settings migration (bump a settings-version and force `shadowMapType='low'` on load if the saved value is the old default), or
   - add a small UI select in Graphics > Lighting so it's switchable without a reset (optional nicety, not required).
3. **Not in `SETTINGS_PROFILES`** (verified) — Performance/Balanced/Quality don't set `shadowMapType`, so a profile switch won't override this. No profile edits needed.

---

## Change 2 (documentation + one optional knob) — `blockyShadow*` recommended values

Audit result: these are **already well-tuned**; the recommended set equals the current defaults. The only conditional change is `blockyShadowSlopeScale`, and only if you actually see acne — raising it has a peter-panning tradeoff, so it is **left at 0.0 by default** here.

| Key | DEFAULTS line | Current = Recommended | Note |
|---|---|---|---|
| `blockyShadows` | 6357 | `true` | the whole effect — keep on |
| `blockyShadowOffset` | 6358 | `0.5` | normal-bias anti-acne (texels); good as-is |
| `blockyShadowDepthBias` | 6359 | `0.0` | advanced, no UI; leave |
| `blockyShadowSlopeScale` | 6360 | `0.0` | **optional knob** — see below |
| `blockyShadowStep` | 6361 | `1.0` | ratchet = 1 block/commit; lower = finer motion + more shadow re-renders |
| `blockyTorchLevels` | 6362 | `8` | held-torch quantization (not the sun); leave |

**Optional — `blockyShadowSlopeScale` 0.0 → 0.5** *(do NOT apply unless you see the artifact)*: at low sun (sunrise/sunset) a leading-edge "stripe" acne can appear because the blocky path drops THREE's stock normal-bias. `blockyShadowSlopeScale` restores a grazing-angle depth push to kill it. `~0.7` is strong; `0.5` is a moderate start. The tradeoff is **more peter-panning** (shadow contact gap) at extreme grazing, which is why it ships at `0.0`. If you adopt it, change both:
- DEFAULTS line 6360: `blockyShadowSlopeScale: 0.0,` → `blockyShadowSlopeScale: 0.5,`
- SETTINGS literal line 6101: fallback `: 0.0,` → `: 0.5,`

It's **live-tunable** in Graphics > Lighting (handler ~line 23397), so the better path is to leave the default at 0.0 and dial it in-game at dawn/dusk, only baking a new default if you settle on a value.

---

## Verification log (build 2026-06-24.31)

- `shadowMapType`: DEFAULTS 6354, SETTINGS literal 6095, renderer apply 27777 (init-only, no live handler, no UI). Not in profiles.
- `blockyShadow*`: DEFAULTS 6357–6362, SETTINGS literal 6098–6103, UI handlers 23374–23424, shader reads 31603–31721, ratchet 43073–43095. Not in profiles.
- Terrain bypasses `shadowMapType` via `blockyGetShadow` (blocky path, line ~31636) — confirmed `shadowMapType` change can't regress terrain.

## Single-file / worker parity

- Both changes are settings-default edits in `voxEx.html`. ✅
- No worker parity (lighting/shadow config is main-thread). No new DOM IDs. No save-format change.

## Testing

1. Apply Change 1; **reset lighting settings** (or clear `voxex_settings`) so the new default is picked up, reload.
2. Put a mob **in another object's shadow** (e.g. under an overhang or behind a wall) so a shadow falls **on its body** → that received shadow should now be hard, not soft. The mob's own **ground** shadow won't change (already hard). If the on-body aliasing looks worse than soft, revert to `'medium'`.
3. Confirm **terrain** sun shadows AND mob **ground** shadows are visually unchanged (both already snap — they ignore this setting).
4. Sunrise/sunset pass: watch for leading-edge stripe acne; if present, dial `blockyShadowSlopeScale` up in Graphics > Lighting (don't bake the default unless you settle on a value).
5. `O` perf overlay: `'low'` should be equal-or-slightly-better FPS than `'medium'`.

## Change-reporting checklist

- [ ] `shadowMapType` changed in BOTH DEFAULTS (6354) and the SETTINGS literal fallback (6095).
- [ ] Decided the round-trip adoption path (reset / migration / UI) — at minimum document that a reset is required.
- [ ] `blockyShadowSlopeScale` left at 0.0 unless the acne artifact is confirmed (peter-pan tradeoff).
- [ ] No `SETTINGS_PROFILES` edits needed (keys absent there).
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.
- [ ] Verify terrain shadows visually unchanged; mob/prop shadows hardened.

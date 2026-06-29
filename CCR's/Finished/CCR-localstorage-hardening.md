# CCR — LocalStorage Read Hardening (Safe Parse + Seed Escaping)

**ID:** VOXEX-CCR-ROBUST-001
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #519, #518
**Scope:** Add one `safeParseLocalStorage()` helper and route the unguarded `localStorage` JSON reads through it (#519); apply the existing `escapeHtml()` to `metadata.seed` in the world-card template (#518). Both harden the **same subsystem**: untrusted persisted data flowing into parse/render.

> Line numbers are as of build `2026-06-25.34` and **WILL drift** — grep each anchor before editing.

---

### #519 — Unguarded `JSON.parse(localStorage…)` crashes the game on corrupt storage
**Location:** `voxex_settings` load — line ~6033 (grep: `JSON.parse(localStorage.getItem("voxex_settings"))`)
**Why:** A malformed/partial `localStorage` value throws inside `JSON.parse`. The `|| '{}'` / `|| 'null'` / `|| '[]'` fallbacks only guard a *null* item — a corrupt non-null string still throws — and the settings read at ~6033 has no fallback at all, so one corrupt key hard-fails boot.
**Change:** Add a module-scope `safeParseLocalStorage(key, fallback)` helper near `escapeHtml`/`formatBytes` (or any top-level utility region), then repoint the unguarded reads to it. Highest-impact site shown below; remaining sites listed under Verify.

**Context:**
- **Insertion point for the helper** — place it next to the existing `SaveManager` storage helpers. `getIndex()` already does the exact try-less pattern this helper replaces (live, ~27267):
  ```js
  const SaveManager = {
      getIndex() { return JSON.parse(localStorage.getItem("voxex_save_index") || "[]"); },
      updateIndex(name) { const index = SaveManager.getIndex(); if (!index.includes(name)) { index.push(name); localStorage.setItem("voxex_save_index", JSON.stringify(index)); }},
  ```
  The IndexedDB constants block (`const DB_NAME = "VoxExWorldData"; const DB_VERSION = 2; const STORE_NAME = "chunks";`, ~27285) sits just below `SaveManager`. Declaring `safeParseLocalStorage` at module scope anywhere in this utilities region (e.g. just above `const SaveManager`) is fine — it's a top-level function, not a `SaveManager` method.
- **Exact 5 call sites** (grep-confirmed against the live file; line numbers will drift):
  | Line | Key | Current read | New read |
  |------|-----|-------------|----------|
  | ~3853 | `voxex_collapsed_groups` | `JSON.parse(localStorage.getItem('voxex_collapsed_groups') \|\| '{}')` | `safeParseLocalStorage('voxex_collapsed_groups', {})` |
  | ~3909 | `voxex_collapsed_groups` (DOMContentLoaded init) | same as ~3853 | `safeParseLocalStorage('voxex_collapsed_groups', {})` |
  | ~6033 | `voxex_settings` | `JSON.parse(localStorage.getItem("voxex_settings")) \|\| {}` | `safeParseLocalStorage("voxex_settings", {})` |
  | ~6681 | `voxex_custom_profile` | `JSON.parse(localStorage.getItem('voxex_custom_profile') \|\| 'null') \|\| { ...DEFAULTS }` | `safeParseLocalStorage('voxex_custom_profile', null) \|\| { ...DEFAULTS }` |
  | ~27267 | `voxex_save_index` (`SaveManager.getIndex`) | `JSON.parse(localStorage.getItem("voxex_save_index") \|\| "[]")` | `safeParseLocalStorage("voxex_save_index", [])` |
- **Does any site need to overwrite the corrupt key?** No. None of these 5 reads writes the parsed value back inline, so a corrupt value is simply ignored at read time and the next legitimate `setItem` (settings save, profile save, `updateIndex`, collapse-group toggle) overwrites it. The helper deliberately does NOT `removeItem` — leaving the corrupt blob is harmless and avoids surprise data loss; it self-heals on the next write. (The `voxex_save_index` rewrite paths at ~22056 and ~22262 already do `localStorage.setItem('voxex_save_index', …)` after `getIndex()`, so even a corrupt index recovers there.)

**Before:**
```js
let savedSettings = JSON.parse(localStorage.getItem("voxex_settings")) || {};
```
**After:**
```js
let savedSettings = safeParseLocalStorage("voxex_settings", {});
```

Helper to add once (place near other storage/string utilities; confirm the name is unused first):
```js
/**
 * Parse a JSON value from localStorage, returning fallback on a missing or corrupt value.
 * @param {string} key - localStorage key.
 * @param {*} fallback - Value returned when the key is absent or unparseable.
 * @returns {*} Parsed value, or fallback.
 */
function safeParseLocalStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
        logDebug(`[Storage] corrupt '${key}', using fallback`, e);
        return fallback;
    }
}
```

Other unguarded `JSON.parse(localStorage…)` reads to convert (same pattern, drop the inline `|| 'x'` fallback string and pass the typed fallback):
- ~3853 — `voxex_collapsed_groups`: `JSON.parse(localStorage.getItem('voxex_collapsed_groups') || '{}')` → `safeParseLocalStorage('voxex_collapsed_groups', {})`
- ~3909 — `voxex_collapsed_groups` (DOMContentLoaded init): same replacement.
- ~6681 — `voxex_custom_profile`: `JSON.parse(localStorage.getItem('voxex_custom_profile') || 'null') || { ...DEFAULTS }` → `safeParseLocalStorage('voxex_custom_profile', null) || { ...DEFAULTS }` (keep the trailing `|| { ...DEFAULTS }`; the helper returns `null` for missing/corrupt, which then falls through to the spread).
- ~27267 — `voxex_save_index` (`SaveManager.getIndex`): `JSON.parse(localStorage.getItem("voxex_save_index") || "[]")` → `safeParseLocalStorage("voxex_save_index", [])`.

**AUDIT FLAG (saveData paths):** The `JSON.parse(saveData)` / `JSON.parse(json)` reads at ~22050, ~22305, ~22340, ~22401, ~22778 are **already wrapped in boundary try-catch** — they are NOT bugs. Only **`loadWorld` at ~27231** is genuinely unguarded:
```js
const json = localStorage.getItem(`voxex_save_${saveName}`);
if (!json) { showToast("Save file not found!", "error"); return null; }
const savePacket = JSON.parse(json);   // ← throws on corrupt save
```
This read does not use a fixed `key` (the key is templated per save name), so the helper does not apply directly. Wrap it in try-catch at the boundary instead:
```js
let savePacket;
try { savePacket = JSON.parse(json); }
catch (e) { showToast("Save file is corrupt!", "error"); logDebug(`[Save] corrupt save '${saveName}'`, e); return null; }
```
Leave the five already-guarded saveData sites as-is (optional: migrate for consistency, but no behavior change).

**Verify:** In devtools set `localStorage.setItem('voxex_settings','{')` then reload → game boots on defaults instead of throwing; repeat for `voxex_collapsed_groups`, `voxex_custom_profile`, `voxex_save_index`, and a `voxex_save_<name>` entry. Confirm settings still round-trip: change a setting, reload, value persists. Run `tools/voxex-tests.html` persistence tests.

---

### #518 — XSS: world card injects raw `metadata.seed` via `innerHTML`
**Location:** world-card template — line ~22018 (grep: `class="world-card-meta">Seed:`)
**Why:** `escapeHtml()` (~21970) is already applied to the world **name** (~22017) and `data-save` (~22021–22022) in the card template (~22013), but `metadata.seed` is interpolated raw into `card.innerHTML`. A save whose seed contains markup (e.g. `<img src=x onerror=alert(1)>`) executes when the world list renders.
**Change:** Wrap the seed interpolation with `escapeHtml(...)`. `escapeHtml` sets `div.textContent`, which safely coerces numbers and strings, so numeric seeds are unaffected.

**Context:**
- **`escapeHtml` definition** (live, ~21970) — it coerces ANY value (number or string) safely via `textContent`, so wrapping a numeric seed is fine:
  ```js
  function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
  }
  ```
- **The world-card template** (live, ~22013) — shows the established `escapeHtml` pattern already applied to the name and `data-save` attrs; the seed line (~22018) is the only raw interpolation:
  ```js
  card.innerHTML = `
      <div class="world-card-thumbnail">${thumbHtml}</div>
      <div class="world-card-content">
          <div class="world-card-info">
              <div class="world-card-name">${escapeHtml(saveName)}</div>
              <div class="world-card-meta">Seed: ${metadata.seed || '???'} • ${dateStr}<span class="world-card-size">${sizeStr}</span></div>
          </div>
          <div class="world-card-actions">
              <button class="world-card-btn manage" data-save="${escapeHtml(saveName)}" title="Manage">⚙️</button>
              <button class="world-card-btn delete" data-save="${escapeHtml(saveName)}" title="Delete">🗑️</button>
          </div>
      </div>
  `;
  ```
  Only the `Seed:` line changes; leave name/data-save (already escaped) and `thumbHtml` (~22009, the out-of-scope second injection point flagged below) untouched.

**Before:**
```js
<div class="world-card-meta">Seed: ${metadata.seed || '???'} • ${dateStr}<span class="world-card-size">${sizeStr}</span></div>
```
**After:**
```js
<div class="world-card-meta">Seed: ${escapeHtml(metadata.seed || '???')} • ${dateStr}<span class="world-card-size">${sizeStr}</span></div>
```

**AUDIT FLAG (out of scope, same template):** `metadata.thumbnail` (~22010, `<img src="${metadata.thumbnail}">`) is also interpolated unescaped and is a second, weaker injection point. Not in this CCR's scope — note for a follow-up; do NOT change here.

**Verify:** Create a world with seed text `<img src=x onerror=alert(1)>`, open the world-list menu, confirm the literal text renders and no alert fires. Confirm normal numeric seeds still display correctly.

---

## Safety Checks

- [ ] `safeParseLocalStorage` name is unique (grep before declaring); declared once at module scope; no global shadowing.
- [ ] Settings round-trip via save/load after the change (`voxex_settings`): change → reload → persists.
- [ ] try-catch lives only at the storage boundary (the helper + the `loadWorld` read), not pushed into pure functions.
- [ ] `voxex_custom_profile` keeps its `|| { ...DEFAULTS }` fallback (helper returns `null`, not the spread).
- [ ] World-card renders correctly for normal seeds; a markup seed renders inert (escaped).
- [ ] `tools/voxex-tests.html` green (persistence round-trip tests).
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES` (~line 3999/4007).

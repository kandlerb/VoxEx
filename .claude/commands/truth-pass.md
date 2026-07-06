---
description: Sweep CLAUDE.md and docs/agent-notes.md for drift against the live code
---

Documentation truth pass — find and fix places where CLAUDE.md or docs/agent-notes.md no longer match `voxEx.html` reality. $ARGUMENTS

1. Grep the live values and compare against what the docs claim:
   - `VOXEX_BUILD`, `TERRAIN_GEN_VERSION`, `CURRENT_CACHE_VERSION`, `SETTINGS_VERSION`
   - `NUM_TILES` and the block count in `BLOCK_CONFIG`
   - Feature flags: `WORKER_MESH_PIPELINE_ENABLED`, `WORKER_LIGHTING_ENABLED`, `useNewTerrain`
   - The classes table (every `class X` in CLAUDE.md still exists; no new major class missing)
   - The Lockstep Registry (run `node tools/parity-check.mjs`; if it needed updating recently, check the registry table matches)
2. Read the last ~10 `VOXEX_RECENT_CHANGES` entries and check each shipped change is reflected in the relevant CLAUDE.md section (or deliberately isn't — small tweaks don't need doc updates).
3. Check the Documentation Index statuses: any plan doc that shipped since last pass moves to SHIPPED; anything superseded moves to HISTORICAL.
4. Fix what you find with focused edits. Do NOT restructure the docs or reword accurate content — this is a drift sweep, not a rewrite.
5. Report a short list of what was stale and what you corrected.

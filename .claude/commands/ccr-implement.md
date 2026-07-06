---
description: Implement a CCR change doc end-to-end with verification and build bump
---

Implement the CCR the user names (or the one in `CCR's/` they point you at): $ARGUMENTS

Follow the per-change loop from CLAUDE.md "Change Workflow (CCRs)" exactly:

1. Read the ENTIRE CCR file before editing anything. Note every AUDIT FLAG / AUDIT NOTE — they override contradicting intuition.
2. For each change block: locate the site by grepping the anchor string (NEVER by the CCR's line numbers — they are stale by definition). Confirm the live code matches the CCR's "Before" snippet. If it does not match, STOP and report the mismatch instead of forcing the edit.
3. Apply the change to match the "After" snippet. Respect the single-file rule and the code-quality conventions in CLAUDE.md.
4. Worker parity: if you touched an injected function, verify you edited ONLY the main-thread source and the injection markers are intact. If you touched a hand-maintained copy (see CLAUDE.md "Lockstep Registry"), update BOTH sides.
5. Verify, cheapest first:
   - `node tools/parity-check.mjs` must be GREEN
   - terrain touched? `node tools/terrain-node-checks.mjs voxEx.html <seed>` on at least 3 different seeds, all GREEN, and bump `TERRAIN_GEN_VERSION`
   - remind the user to run `tools/voxex-tests.html` over localhost (you cannot run the browser suite yourself) and to eyeball in-game for visual changes
6. Bump `VOXEX_BUILD` and add a `VOXEX_RECENT_CHANGES` entry citing the CCR ID. Bump `CURRENT_CACHE_VERSION` / `SETTINGS_VERSION` if the CCR's change class requires it (CLAUDE.md "Version Constants").
7. Update the CCR's as-built section with what you actually did, update any CLAUDE.md / docs/agent-notes.md content the change made stale, and move the CCR to `CCR's/Finished/`.
8. Stage ONLY the files you touched (never `git add -A`). Report: Summary / Changes / Rationale / Safety Checks.

---
description: Run the VoxEx verification ladder and report results
---

Run the automated verification ladder from CLAUDE.md and report concisely:

1. `node tools/parity-check.mjs` — lockstep copies + injection markers.
2. `node tools/terrain-node-checks.mjs voxEx.html seedA`, then again with `seedB` and `seedC` (three different seed strings) — terrain invariants.
3. Report PASS/FAIL per check with the failing detail lines only. If anything fails, identify the offending change with `git diff` before proposing a fix — do not "fix" a checker to make it pass unless the checker itself is provably stale (and say so explicitly).
4. Remind the user which verification you CANNOT run: `tools/voxex-tests.html` (browser suite, localhost) and in-game visual checks.

Extra arguments (optional focus area): $ARGUMENTS

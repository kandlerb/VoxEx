---
description: Run the VoxEx verification ladder and report results
---

Run the automated verification ladder from CLAUDE.md and report concisely:

1. `node tools/syntax-check.mjs` — every script block parses (truncation/redeclaration gate).
2. `node tools/parity-check.mjs` — lockstep copies + injection markers.
3. `node tools/terrain-node-checks.mjs voxEx.html seedA`, then `seedB`, then `seedC` (three different seed strings) — terrain invariants.
4. `node tools/run-browser-tests.mjs` — the full 315+ browser suite, headless (needs a local Chrome/Edge/Chromium; pass `--chrome=` or set `$CHROME` if discovery fails; in a Linux sandbox see docs/agent-notes.md §7 for the no-root Chromium bootstrap).
5. Report PASS/FAIL per gate with only the failing detail lines. If anything fails, identify the offending change with `git diff` before proposing a fix — do not "fix" a checker to make it pass unless the checker itself is provably stale (and say so explicitly).
6. The only verification you cannot run is the in-game visual check — remind the user when the change is visual.

Extra arguments (optional focus area): $ARGUMENTS

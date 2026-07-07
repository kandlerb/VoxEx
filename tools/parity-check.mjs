#!/usr/bin/env node
// ============================================================================
// parity-check.mjs — mechanical lockstep checks for VoxEx hand-maintained copies
// ----------------------------------------------------------------------------
// voxEx.html single-sources most worker code via Function.toString() injection,
// but a few things are HAND-MAINTAINED in two places (main thread + worker
// template) and MUST stay in sync. Humans and agents forget; this script does
// not. Run it after ANY change to terrain, noise, worker, or config code:
//
//   node tools/parity-check.mjs [path/to/voxEx.html]
//
// Exit 0 = all green. Exit 1 = drift found. Exit 2 = extraction failed
// (usually means the code moved/renamed — update this script in the same
// commit as the refactor, it is part of the lockstep).
//
// What it checks (see CLAUDE.md "Lockstep registry" for the why):
//   P1 GRAD2D table          — all copies byte-identical (after indent strip)
//   P2 grad() line           — all copies byte-identical
//   P3 fadeFast formula      — main arrow vs worker function, same expression
//   P4 _nd2/_fd2/_ed2        — derivative-noise scratches present + identical
//   P5 WORLD_DIMS            — main vs worker template, deep value equality
//   P6 BIOME_CONFIG          — biome name sets + shared numeric fields equal
//   P7 injection markers     — all 6 __*_FUNCS/PASS__ markers exactly once
//   P8 TREE_CONFIG           — main vs worker template, deep value equality
//   P9 NUM_TILES             — atlas tile count, main vs worker template equal
// NOT covered: behavioral byte-parity of injected functions — that is the
// browser suite's "worker MESH/blendedHeight byte-parity" tests.
// ============================================================================
import { readFileSync } from 'node:fs';

const file = process.argv[2] || new URL('../voxEx.html', import.meta.url).pathname;
const src = readFileSync(file, 'utf8');
const lines = src.split('\n');

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};
const die = (msg) => { console.error(`EXTRACTION FAILED: ${msg} — code moved? Update tools/parity-check.mjs in the same commit.`); process.exit(2); };

// --- helpers -----------------------------------------------------------------
/** All lines whose trimmed text starts with `prefix`. */
function findLines(prefix) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith(prefix)) out.push({ line: i + 1, text: t });
  }
  return out;
}
/** Extract balanced `{...}` starting at the first '{' at/after index `from`. */
function extractBraced(from) {
  const open = src.indexOf('{', from);
  let depth = 0, inStr = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === inStr && src[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}
/** All `const NAME = {...}` object definitions (skips emitter/JSON.stringify lines). */
function findObjectDefs(name) {
  const out = [];
  const needle = `const ${name} = {`;
  let from = 0;
  for (;;) {
    const i = src.indexOf(needle, from);
    if (i === -1) return out;
    const obj = extractBraced(i);
    if (obj) out.push({ at: i, text: obj });
    from = i + 1;
  }
}
/** Strip // and /* comments (naive but fine for these config literals). */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** Eval an object literal; free identifiers resolve to their own name (string sentinel). */
function evalLiteral(objText) {
  const sandbox = new Proxy({}, { has: () => true, get: (_, k) => (typeof k === 'string' ? k : undefined) });
  // eslint-disable-next-line no-new-func
  return new Function('S', `with (S) { return (${stripComments(objText)}); }`)(sandbox);
}
function numericLeaves(obj, path = '', out = new Map()) {
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) numericLeaves(obj[k], path ? `${path}.${k}` : k, out);
  } else if (typeof obj === 'number') out.set(path, obj);
  return out;
}
function allIdentical(items, label) {
  if (items.length < 2) { check(false, label, `expected >=2 copies, found ${items.length}`); return; }
  const first = items[0].text;
  const bad = items.filter((it) => it.text !== first);
  check(bad.length === 0, `${label} (${items.length} copies)`,
    bad.length ? `line ${bad[0].line} differs from line ${items[0].line}` : `all byte-identical`);
}

// --- P1/P2: GRAD2D + grad ------------------------------------------------------
allIdentical(findLines('const GRAD2D = ['), 'P1 GRAD2D gradient table');
allIdentical(findLines('const grad = (h, x, y) =>'), 'P2 grad() dot-product line');

// --- P3: fadeFast --------------------------------------------------------------
{
  const arrow = src.match(/const fadeFast = \(t\) =>\s*([^;]+);/);
  const fn = src.match(/function fadeFast\(t\)\s*\{\s*return\s+([^;]+);/);
  if (!arrow || !fn) die('fadeFast copies not found (arrow on main, function in worker template)');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  check(norm(arrow[1]) === norm(fn[1]), 'P3 fadeFast formula (main arrow vs worker fn)',
    norm(arrow[1]) === norm(fn[1]) ? norm(arrow[1]) : `main "${norm(arrow[1])}" vs worker "${norm(fn[1])}"`);
}

// --- P4: derivative-noise scratches ---------------------------------------------
for (const s of ['_nd2', '_fd2', '_ed2']) allIdentical(findLines(`const ${s} = {`), `P4 scratch ${s}`);

// --- P5/P8: WORLD_DIMS + TREE_CONFIG deep value equality -------------------------
for (const [tag, name] of [['P5', 'WORLD_DIMS'], ['P8', 'TREE_CONFIG']]) {
  const defs = findObjectDefs(name);
  if (defs.length !== 2) { check(false, `${tag} ${name}`, `expected exactly 2 definitions (main + worker template), found ${defs.length}`); continue; }
  let a, b;
  try { a = numericLeaves(evalLiteral(defs[0].text)); b = numericLeaves(evalLiteral(defs[1].text)); }
  catch (e) { die(`${name} literal did not eval: ${e.message}`); }
  const keys = new Set([...a.keys(), ...b.keys()]);
  const diffs = [];
  for (const k of keys) if (a.get(k) !== b.get(k)) diffs.push(`${k}: ${a.get(k)} vs ${b.get(k)}`);
  check(diffs.length === 0, `${tag} ${name} (main vs worker template)`, diffs.slice(0, 3).join('; ') || `${keys.size} numeric fields match`);
}

// --- P6: BIOME_CONFIG ------------------------------------------------------------
{
  const defs = findObjectDefs('BIOME_CONFIG');
  if (defs.length !== 2) { check(false, 'P6 BIOME_CONFIG', `expected exactly 2 definitions, found ${defs.length}`); }
  else {
    let a, b;
    try { a = evalLiteral(defs[0].text); b = evalLiteral(defs[1].text); }
    catch (e) { die(`BIOME_CONFIG literal did not eval: ${e.message}`); }
    const an = Object.keys(a).sort().join(','), bn = Object.keys(b).sort().join(',');
    check(an === bn, 'P6a BIOME_CONFIG biome name sets', an === bn ? an : `"${an}" vs "${bn}"`);
    const la = numericLeaves(a), lb = numericLeaves(b);
    const diffs = [];
    for (const [k, v] of la) if (lb.has(k) && lb.get(k) !== v) diffs.push(`${k}: ${v} vs ${lb.get(k)}`);
    check(diffs.length === 0, 'P6b BIOME_CONFIG shared numeric fields', diffs.slice(0, 3).join('; ') || 'all shared numeric fields match');
  }
}

// --- P7: injection markers --------------------------------------------------------
{
  const markers = [
    '/* __TERRAIN_FUNCS_START__ */', '/* __TERRAIN_FUNCS_END__ */',
    '/* __TREE_FUNCS_START__ */', '/* __TREE_FUNCS_END__ */',
    '/* __TERRAIN_PASS_START__ */', '/* __TERRAIN_PASS_END__ */',
  ];
  for (const m of markers) {
    const n = lines.filter((l) => l.trim() === m).length;
    check(n === 1, `P7 marker ${m}`, n === 1 ? 'exactly one' : `found ${n} standalone occurrences (must be exactly 1)`);
  }
}

// --- P9: NUM_TILES (texture atlas tile count) ---------------------------------------
// Hand-maintained in two places (main ~4640, worker template ~19005). Drift ships a
// mis-sliced atlas: worker UVs sample the wrong tile columns for every block.
{
  const defs = findLines('const NUM_TILES =');
  if (defs.length !== 2) {
    check(false, 'P9 NUM_TILES', `expected exactly 2 declarations (main + worker template), found ${defs.length}`);
  } else {
    const vals = defs.map((d) => {
      const m = d.text.match(/const NUM_TILES = (\d+)\s*;/);
      return m ? Number(m[1]) : NaN;
    });
    if (vals.some(Number.isNaN)) die('NUM_TILES declaration did not parse as an integer literal');
    check(vals[0] === vals[1], 'P9 NUM_TILES (main vs worker template)',
      vals[0] === vals[1] ? `both ${vals[0]}` : `line ${defs[0].line}: ${vals[0]} vs line ${defs[1].line}: ${vals[1]}`);
  }
}

console.log(failures === 0 ? '\nLOCKSTEP GREEN — hand-maintained copies in sync' : `\n${failures} LOCKSTEP CHECK(S) FAILED — fix BOTH copies before committing`);
process.exit(failures === 0 ? 0 : 1);

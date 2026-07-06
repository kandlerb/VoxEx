#!/usr/bin/env node
// ============================================================================
// terrain-node-checks.mjs — headless terrain invariant checks for VoxEx
// ----------------------------------------------------------------------------
// Extracts the REAL terrain/river functions from voxEx.html (no hand-copied
// replicas to drift) and runs the math-level invariants without a browser:
//   T1 determinism            T2 finite/integer/bounds
//   T3 adjacent continuity    T4 notch metric (informational)
//   T5 river flood integrity  T6 sand-pan proxy (informational)
//   T7 tree-soil elevation gradient (informational)
// Complements tools/voxex-tests.html (which additionally covers workers,
// meshing, lighting, persistence — still run it over localhost for releases).
//
// Usage: node tools/terrain-node-checks.mjs [path/to/voxEx.html] [seedString]
// Exit code 0 = hard checks green (T1/T2/T3/T5). T4/T6/T7 are reported only.
// NOTE: uses its own PRNG for the perm table — results are internally
// consistent but not byte-identical to a specific in-game seed string.
// ============================================================================
import { readFileSync } from 'node:fs';

const file = process.argv[2] || new URL('../voxEx.html', import.meta.url).pathname;
const seedStr = process.argv[3] || 'node-checks';
const src = readFileSync(file, 'utf8');

// --- extraction helpers ------------------------------------------------------
function lastIndexOfDef(needle) {
  let idx = -1, from = 0;
  for (;;) {
    const i = src.indexOf(needle, from);
    if (i === -1) return idx;
    idx = i; from = i + 1;
  }
}
function extractFunction(name) {
  const start = lastIndexOfDef(`function ${name}(`);
  if (start === -1) return null;
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}
function extractConstArrow(name) {
  const start = lastIndexOfDef(`const ${name} = `);
  if (start === -1) return null;
  // scan to the ';' at paren/brace/bracket depth 0
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated const ${name}`);
}
function extractConstValue(name) {
  // pick the DEFINITION (skip worker const-bake emitter lines, which contain JSON.stringify)
  const re = new RegExp(`const ${name}\\s*=\\s*([^;\\n]+);`, 'g');
  let m, best = null;
  while ((m = re.exec(src)) !== null) {
    if (m[1].includes('JSON.stringify') || m[1].includes("' +")) continue;
    best = m[1].trim();
  }
  if (best === null) throw new Error(`const ${name} not found`);
  return best;
}

const FUNCS = [
  'noise2D', 'fbm2D', 'fbmWithDomainWarp', 'fadeFast',
  'fadeDeriv', 'noise2Dd', 'fbm2Dd', 'splineDeriv', 'erosionParamD', // CCR-TERRAIN-007 derivative chain
  'normField', 'sq', 'smoothstep', 'paramFreq', 'spline',
  'continentalHeight', 'continentalness', 'erosionParam', 'weirdness',
  'peaksValleys', 'temperature', 'humidity',
  'terrainSurface', 'computeSurfaceHeight', 'resolveBiome',
  'getOceanFactor', 'getOceanDepth', 'getRiverFactor', 'getRiverDepth',
  'getDeltaFingerFactor', 'computePreRiverHeight', 'applyRiverCarve',
  'blendedHeight', 'getPreRiverHeight', 'isTreeSoilSurface',
];
const CONSTS = [
  'SPLINE_CONTINENTAL', 'SPLINE_EROSION',
  'FIELD_GAIN', 'MAX_SURFACE_Y', 'RELIEF_AMPLITUDE', 'OCTAVES', 'BASE_GAIN',
  'GAIN_BY_RELIEF', 'WARP_FREQ', 'WARP_BASE', 'WARP_BY_RELIEF', 'PEAK_AMP',
  'NOTCH_LIFT', 'FRACT_FREQ0', 'HF_PIVOT', 'VALLEY_RATIO', 'SWISS_WARP', 'RIVER_BASE_WIDTH',
  'OCEAN_WARP_FREQ', 'OCEAN_WARP_AMP', 'OCEAN_WARP_VAR_FREQ', 'OCEAN_WARP_VAR_STRENGTH',
  'RIVER_WARP_FREQ', 'RIVER_WARP_AMP', 'RIVER_WARP_VAR_FREQ', 'RIVER_WARP_VAR_STRENGTH',
  'OCEAN_THRESHOLD_DEEP', 'OCEAN_THRESHOLD_SHALLOW',
];
// multi-line object consts extracted with the arrow scanner
const OBJ_CONSTS = ['GRAD2D', 'BIOME_PARAMS', 'AXIS_W'];

let assembled = '"use strict";\n';

// --- environment stubs -------------------------------------------------------
assembled += `
// deterministic perm from the seed string (internal-consistency PRNG; not the
// game's SeededRandom — checks don't require byte-parity with in-game worlds)
let s0 = 0;
for (let i = 0; i < SEED_STR.length; i++) s0 = (s0 * 31 + SEED_STR.charCodeAt(i)) >>> 0;
const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
const perm = new Uint8Array(512);
{ const p = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const numericSeed = rnd() * 1000;

// derivative-noise out-param scratches (CCR-TERRAIN-007)
const _nd2 = { dx: 0, dz: 0 };
const _fd2 = { dx: 0, dz: 0 };
const _ed2 = { dx: 0, dz: 0 };

const WORLD_DIMS = { seaLevel: 60, chunkSize: 16, chunkHeight: 320, yOffset: 0 };
const worldConfig = {
  get seed() { return numericSeed; },
  useNewTerrain: true, persistence: 0.5, lacunarity: 2.0,
  biomeSizeMultiplier: 1, enableRivers: true, forceSingleBiome: null,
  terrainAmplitudeMultiplier: 1.0,
};
const lerp = (t, a, b) => a + t * (b - a);
const lerpValue = (a, b, t) => a + t * (b - a);
`;

for (const name of OBJ_CONSTS) {
  const s = extractConstArrow(name);
  if (!s) throw new Error(`missing const ${name}`);
  assembled += s + '\n';
}
assembled += 'const grad = (h, x, y) => { const g = GRAD2D[h & 15]; return g[0] * x + g[1] * y; };\n';
for (const name of CONSTS) assembled += `const ${name} = ${extractConstValue(name)};\n`;

// biomeByName stub: resolveBiome only needs .name/.tags/.trees here
assembled += `
const biomeByName = new Map(Object.keys(BIOME_PARAMS).map((n) => [n,
  { name: n, tags: n === 'mountains' ? ['mountain'] : [], trees: { density: 0.1 } }]));
`;

for (const name of FUNCS) {
  let s = extractFunction(name);
  if (!s && name === 'fadeFast') s = extractConstArrow('fadeFast');
  if (!s) throw new Error(`function ${name} not found in ${file}`);
  assembled += s + '\n';
}
// getBiomeParams: new-terrain dispatch only (legacy body needs the biome-cell system)
assembled += 'function getBiomeParams(gx, gz) { return resolveBiome(gx, gz); }\n';
assembled += `return { computeSurfaceHeight, blendedHeight, terrainSurface, getRiverFactor,
  getPreRiverHeight, computePreRiverHeight, isTreeSoilSurface, getOceanFactor, noise2D };\n`;

let api;
try {
  api = new Function('SEED_STR', assembled)(seedStr);
} catch (e) {
  console.error('ASSEMBLY FAILED (extraction produced invalid JS):', e.message);
  process.exit(2);
}
const { computeSurfaceHeight, blendedHeight, getRiverFactor, computePreRiverHeight, isTreeSoilSurface } = api;
const SEA = 60;

// --- checks ------------------------------------------------------------------
let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// T1 determinism
{
  let ok = true;
  for (let i = 0; i < 200 && ok; i++) {
    const gx = (i * 977) % 60000 - 30000, gz = (i * 1597) % 60000 - 30000;
    if (computeSurfaceHeight(gx, gz) !== computeSurfaceHeight(gx, gz)) ok = false;
    if (blendedHeight(gx, gz, 0) !== blendedHeight(gx, gz, 0)) ok = false;
  }
  check(ok, 'T1 determinism (surface + blended)');
}
// T2 finite / integer / bounds
{
  let ok = true, worst = '';
  for (let i = 0; i < 500 && ok; i++) {
    const gx = (i * 311) % 80000 - 40000, gz = (i * -219) % 80000 + 1;
    const h = computeSurfaceHeight(gx, gz);
    if (!Number.isFinite(h) || h !== Math.floor(h) || h < 1 || h > 285) { ok = false; worst = `h=${h} @ ${gx},${gz}`; }
  }
  check(ok, 'T2 finite/integer/bounds [1..285]', worst);
}
// T3 adjacent-column continuity (< 30), both axes, surface AND blended
{
  let maxS = 0, maxB = 0;
  for (let t = 0; t < 4; t++) {
    const oz = t * 4111 - 8000;
    for (let x = -400; x < 400; x++) {
      maxS = Math.max(maxS, Math.abs(computeSurfaceHeight(x, oz) - computeSurfaceHeight(x + 1, oz)));
      maxS = Math.max(maxS, Math.abs(computeSurfaceHeight(oz, x) - computeSurfaceHeight(oz, x + 1)));
      maxB = Math.max(maxB, Math.abs(blendedHeight(x, oz, 0) - blendedHeight(x + 1, oz, 0)));
      maxB = Math.max(maxB, Math.abs(blendedHeight(oz, x, 0) - blendedHeight(oz, x + 1, 0)));
    }
  }
  check(maxS < 30, 'T3a surface continuity', `max |Δ| = ${maxS.toFixed(1)} (bar 30)`);
  check(maxB < 30, 'T3b blended (rivers/ocean) continuity', `max |Δ| = ${maxB.toFixed(1)} (bar 30)`);
}
// T4 notch metric (informational): high>150 -> low<78 within 160 -> high within 160
{
  let notches = 0;
  for (let t = 0; t < 8; t++) {
    const oz = t * 977 - 4000;
    let prevHi = -1e9, lowAt = -1e9;
    for (let x = -2048; x < 2048; x += 2) {
      const h = blendedHeight(x, oz, 0);
      if (h > 150) {
        if (lowAt > prevHi && x - lowAt <= 160 && lowAt - prevHi <= 160 && prevHi > -1e8) notches++;
        prevHi = x; lowAt = -1e9;
      } else if (h < 78 && prevHi > -1e8 && x - prevHi <= 160) lowAt = x;
    }
  }
  console.log(`INFO  T4 notch metric: ${notches} (browser suite bar: <=6 per seed over its own region — treat >10 here as suspicious)`);
}
// T5 river flood integrity: channel cores on low ground must flood
{
  let chan = 0, dry = 0;
  for (let gx = -20000; gx < 20000; gx += 23) {
    for (let gz = -20000; gz < 20000; gz += 1013) {
      const pre = computePreRiverHeight(gx, gz, 0);
      if (pre.height <= SEA || pre.height >= 80) continue;
      const rf = getRiverFactor(gx, gz, 0, pre.height);
      if (rf < 0.35) { chan++; if (blendedHeight(gx, gz, 0) >= SEA) dry++; }
    }
  }
  const pct = chan ? (dry / chan) * 100 : 0;
  check(chan === 0 || pct < 5, 'T5 river flood integrity (channel cores < 80 high)',
    `${chan} channel cols, ${pct.toFixed(1)}% dry (bar 5%)`);
}
// T6 valley-floor pan signature (informational): valley floors near rivers
// legitimately sit low, but DEAD-FLAT floors pinned at one height are the
// "sand pan" artifact. Report the pinned fraction + mean relief above sea.
{
  let n = 0, pinned = 0, sumRel = 0;
  const counts = new Map();
  for (let gx = -20000; gx < 20000; gx += 37) {
    for (let gz = -20000; gz < 20000; gz += 1511) {
      const pre = computePreRiverHeight(gx, gz, 0);
      if (pre.height <= SEA + 2 || pre.height >= 85) continue;
      const rf = getRiverFactor(gx, gz, 0, pre.height);
      if (rf < 0.5 || rf >= 1) continue; // valley floor beyond the sand/shore lip
      const h = blendedHeight(gx, gz, 0);
      if (h < SEA) continue;
      n++; sumRel += h - SEA;
      counts.set(h, (counts.get(h) || 0) + 1);
    }
  }
  for (const [, c] of counts) pinned = Math.max(pinned, c);
  console.log(`INFO  T6 valley-floor pans: ${n} cols, mode-height share ${(n ? (pinned / n) * 100 : 0).toFixed(1)}% (dead-flat pan signature; pure-vf^2 clamp would push this toward 100), mean relief +${(n ? sumRel / n : 0).toFixed(1)} blocks above sea`);
}
// T7 tree-soil elevation gradient (informational + monotonic-ish sanity)
{
  const bands = [[62, 0], [70, 0], [80, 0], [90, 0], [100, 0], [112, 0], [130, 0]];
  const N = 4000;
  for (const b of bands) {
    let ok = 0;
    for (let i = 0; i < N; i++) ok += isTreeSoilSurface(i * 13 - 26000, i * 7 - 14000, b[0], 0) ? 1 : 0;
    b[1] = ok / N;
  }
  const line = bands.map(([y, f]) => `y${y}:${(f * 100).toFixed(0)}%`).join(' ');
  const declines = bands[1][1] >= bands[4][1] && bands[4][1] >= bands[6][1];
  check(declines, 'T7 tree-soil gradient declines with altitude', line);
}

console.log(failures === 0 ? '\nALL HARD CHECKS GREEN' : `\n${failures} HARD CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
// ============================================================================
// terrain-probe.mjs — diagnostic instrument for the REAL VoxEx terrain
// ----------------------------------------------------------------------------
// The measure-before-you-touch tool. Every terrain investigation that shipped
// (corduroy ribbing, FADE_LUT strips, river dams, mound mountains) started as
// numbers and renders from probes like these — run them BEFORE tuning any
// constant, and again AFTER to prove the effect. Uses tools/lib/extract-terrain
// (real functions extracted by name — never hand-copy terrain code).
//
// Usage:
//   node tools/terrain-probe.mjs height <gx> <gz>              point query
//   node tools/terrain-probe.mjs transect <x0> <z0> <x1> <z1> [samples=200]
//   node tools/terrain-probe.mjs stats [centerX centerZ size=4000] [--json]
//   node tools/terrain-probe.mjs hillshade <centerX> <centerZ> <size> [out.png]
// Common flags: --seed=<string> (default 'probe') --file=<voxEx.html>
//   --biome-driven (force the biome-driven climate+spline path) --hydro (force
//   worldConfig.hydroRivers true — CCR-WORLDGEN-PIPELINE-002 WS6 hydrological rivers)
//
// Reading the outputs:
//   stats: anisotropy(Z/X) far from 1.0 => axis-biased noise (see agent-notes §4);
//     a high max-step pinpoints cliffs — probe them with transect.
//   hillshade: axis-aligned striping => quantization/grid-aligned noise;
//     rings/ovals => clamped floors; view the PNG before and after a change.
// ============================================================================
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildTerrainApi } from './lib/extract-terrain.mjs';

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (const a of argv) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) flags[m[1]] = m[2] ?? true; else pos.push(a); // bare --json supported
}
const cmd = pos.shift();
const file = flags.file || fileURLToPath(new URL('../voxEx.html', import.meta.url));
const seed = flags.seed || 'probe';
const SEA = 60;

// CCR-WORLDGEN-PIPELINE-001 Phase 2 (Gate D): --biome-driven flips the flag-ON height path
// (SPLINE_RELIEF relief + style biases) so hillshade/stats render the biome-driven terrain.
const biomeDriven = flags['biome-driven'] === true || flags.biomeDriven === true;
// CCR-WORLDGEN-PIPELINE-002 WS6: --hydro forces worldConfig.hydroRivers true (independent of
// whatever the live file default is) so hillshades/height/transect probes can render/compare
// the hydrological river system explicitly, mirroring --biome-driven's override pattern.
const hydroRivers = flags.hydro === true;
const api = buildTerrainApi(file, seed, { biomeDrivenTerrain: biomeDriven, hydroRivers });
const { computeSurfaceHeight, blendedHeight, riverFactorAt, computePreRiverHeight, isTreeSoilSurface, getOceanFactor, resolveBiome } = api;

const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) { console.error(`bad number for ${name}: ${v}`); process.exit(2); } return n; };

// --- height ------------------------------------------------------------------
if (cmd === 'height') {
  const gx = num(pos[0], 'gx'), gz = num(pos[1], 'gz');
  const pre = computePreRiverHeight(gx, gz, 0);
  const h = blendedHeight(gx, gz, 0);
  const rf = riverFactorAt(gx, gz, 0, pre.height);
  const of_ = getOceanFactor(gx, gz, 0);
  let biome = '';
  try { const b = resolveBiome(gx, gz); biome = typeof b === 'object' ? (b.name ?? '?') : String(b); } catch { biome = 'n/a'; }
  console.log(`(${gx}, ${gz})  seed="${seed}"`);
  console.log(`  surface height : ${computeSurfaceHeight(gx, gz)}`);
  console.log(`  blended height : ${h}${h < SEA ? '  (FLOODED — below sea ' + SEA + ')' : ''}`);
  console.log(`  pre-river      : ${pre.height}`);
  console.log(`  riverFactor    : ${rf.toFixed(3)}  (0=channel center, 1=no river)`);
  console.log(`  oceanFactor    : ${of_.toFixed(3)}`);
  console.log(`  biome          : ${biome}`);
  console.log(`  tree soil      : ${isTreeSoilSurface(gx, gz, h, 0) ? 'YES (grass/dirt)' : 'no'}`);
  process.exit(0);
}

// --- transect ------------------------------------------------------------------
if (cmd === 'transect') {
  const x0 = num(pos[0], 'x0'), z0 = num(pos[1], 'z0'), x1 = num(pos[2], 'x1'), z1 = num(pos[3], 'z1');
  const n = Math.max(2, Math.floor(num(pos[4] ?? 200, 'samples')));
  const hs = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    hs.push(blendedHeight(Math.round(x0 + (x1 - x0) * t), Math.round(z0 + (z1 - z0) * t), 0));
  }
  const min = Math.min(...hs), max = Math.max(...hs);
  let maxStep = 0, maxAt = 0;
  for (let i = 1; i < n; i++) if (Math.abs(hs[i] - hs[i - 1]) > maxStep) { maxStep = Math.abs(hs[i] - hs[i - 1]); maxAt = i; }
  // ascii profile, 16 rows
  const ROWS = 16;
  const rows = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    const lo = min + ((max - min) * r) / ROWS, hi = min + ((max - min) * (r + 1)) / ROWS;
    let line = '';
    for (const h of hs) line += h >= lo && (h < hi || r === ROWS - 1) ? '#' : h >= hi ? ' ' : h < SEA && lo <= SEA ? '~' : ' ';
    rows.push(`${String(Math.round(hi)).padStart(4)} |${line}`);
  }
  console.log(`transect (${x0},${z0}) -> (${x1},${z1}), ${n} samples, seed="${seed}"`);
  console.log(rows.join('\n'));
  console.log(`min ${min}  max ${max}  max adjacent step ${maxStep} (at sample ${maxAt}, ~${Math.round(x0 + ((x1 - x0) * maxAt) / (n - 1))},${Math.round(z0 + ((z1 - z0) * maxAt) / (n - 1))})  [continuity bar: 30]`);
  process.exit(0);
}

// --- stats ----------------------------------------------------------------------
if (cmd === 'stats') {
  const cx = num(pos[0] ?? 0, 'centerX'), cz = num(pos[1] ?? 0, 'centerZ'), size = num(pos[2] ?? 4000, 'size');
  const step = Math.max(1, Math.floor(num(flags.step ?? 4, 'step')));
  let n = 0, sum = 0, min = 1e9, max = -1e9, below = 0, high = 0;
  let dxSum = 0, dzSum = 0, dn = 0, maxStep = 0; let maxStepAt = null;
  for (let x = cx - size / 2; x < cx + size / 2; x += step) {
    for (let z = cz - size / 2; z < cz + size / 2; z += step) {
      const h = blendedHeight(x, z, 0);
      n++; sum += h; if (h < min) min = h; if (h > max) max = h;
      if (h < SEA) below++; if (h > 150) high++;
      const dx = Math.abs(blendedHeight(x + 1, z, 0) - h);
      const dz = Math.abs(blendedHeight(x, z + 1, 0) - h);
      dxSum += dx; dzSum += dz; dn++;
      const worst = Math.max(dx, dz);
      if (worst > maxStep) { maxStep = worst; maxStepAt = [x, z]; }
    }
  }
  if (flags.json) {
    // --json (CCR-WORLDGEN-PIPELINE-001 Phase 0): machine-parseable stats block.
    process.stdout.write(JSON.stringify({
      minH: min, meanH: sum / n, maxH: max,
      pctBelowSea: (below / n) * 100, pctAbove150: (high / n) * 100,
      meanDX: dxSum / dn, meanDZ: dzSum / dn, anisotropy: dzSum / dxSum,
      maxAdjStep: maxStep, maxAdjStepAt: maxStepAt,
    }) + '\n');
    process.exit(0);
  }
  console.log(`stats over ${size}x${size} @ (${cx},${cz}), step ${step}, ${n} columns, seed="${seed}"`);
  console.log(`  height        : min ${min}  mean ${(sum / n).toFixed(1)}  max ${max}`);
  console.log(`  below sea     : ${((below / n) * 100).toFixed(1)}%    above 150 (mountain): ${((high / n) * 100).toFixed(1)}%  [coverage ref ~10-13%]`);
  console.log(`  mean |Δ| X    : ${(dxSum / dn).toFixed(4)}   mean |Δ| Z: ${(dzSum / dn).toFixed(4)}`);
  console.log(`  anisotropy Z/X: ${(dzSum / dxSum).toFixed(3)}  (≈1.000 isotropic; sustained bias => axis-aligned noise, agent-notes §4)`);
  console.log(`  max adj step  : ${maxStep} at (${maxStepAt})  [continuity bar: 30 — probe big steps with transect]`);
  process.exit(0);
}

// --- hillshade -------------------------------------------------------------------
if (cmd === 'hillshade') {
  const cx = num(pos[0], 'centerX'), cz = num(pos[1], 'centerZ'), size = Math.floor(num(pos[2], 'size'));
  const out = pos[3] || `hillshade_${cx}_${cz}_${size}.png`;
  const step = Math.max(1, Math.floor(num(flags.step ?? 1, 'step')));
  const W = Math.floor(size / step), H = W;
  const hmap = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++)
      hmap[j * W + i] = blendedHeight(cx - size / 2 + i * step, cz - size / 2 + j * step, 0);
  // light from NW-high; simple Lambert on central-difference normals
  const L = [-0.55, 0.62, -0.55];
  const px = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const h = hmap[j * W + i];
      const hx1 = hmap[j * W + Math.min(i + 1, W - 1)], hx0 = hmap[j * W + Math.max(i - 1, 0)];
      const hz1 = hmap[Math.min(j + 1, H - 1) * W + i], hz0 = hmap[Math.max(j - 1, 0) * W + i];
      const nx = -(hx1 - hx0) / (2 * step), nz = -(hz1 - hz0) / (2 * step), ny = 1.5;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const shade = Math.max(0.15, nx * inv * L[0] + ny * inv * L[1] + nz * inv * L[2]);
      let r, g, b;
      if (h < SEA) { const d = Math.min(1, (SEA - h) / 25); r = 40 * (1 - d); g = 90 - 50 * d; b = 170 - 60 * d; }
      else if (h > 210) { r = g = b = 235; }                                    // snow
      else if (h > 150) { const t = (h - 150) / 60; r = 120 + 60 * t; g = 118 + 58 * t; b = 116 + 62 * t; } // rock
      else { const t = (h - SEA) / 90; r = 70 + 80 * t; g = 130 - 20 * t; b = 55 + 10 * t; }               // grass->dry
      const k = shade * 1.05;
      px[(j * W + i) * 3] = Math.min(255, r * k); px[(j * W + i) * 3 + 1] = Math.min(255, g * k); px[(j * W + i) * 3 + 2] = Math.min(255, b * k);
    }
  }
  writeFileSync(out, encodePng(W, H, px));
  console.log(`hillshade ${size}x${size} @ (${cx},${cz}) step ${step} seed="${seed}" -> ${out}`);
  console.log('look for: axis-aligned striping (quantization), rings/ovals (clamped floors), sawtooth banks, needle summits');
  process.exit(0);
}

console.error(`unknown command "${cmd ?? ''}" — commands: height, transect, stats, hillshade (see header)`);
process.exit(2);

// --- minimal PNG encoder (truecolor 8-bit, zlib from node) ------------------------
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let j = 0; j < h; j++) { raw[j * (w * 3 + 1)] = 0; rgb.copy(raw, j * (w * 3 + 1) + 1, j * w * 3, (j + 1) * w * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

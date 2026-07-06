#!/usr/bin/env node
// ============================================================================
// terrain-node-checks.mjs — headless terrain invariant checks for VoxEx
// ----------------------------------------------------------------------------
// Extracts the REAL terrain/river functions from voxEx.html (via
// tools/lib/extract-terrain.mjs — no hand-copied replicas to drift) and runs
// the math-level invariants without a browser:
//   T1 determinism            T2 finite/integer/bounds
//   T3 adjacent continuity    T4 notch metric (informational)
//   T5 river flood integrity  T6 sand-pan proxy (informational)
//   T7 tree-soil elevation gradient (informational)
// Complements tools/voxex-tests.html (which additionally covers workers,
// meshing, lighting, persistence — run it headlessly via
// tools/run-browser-tests.mjs for releases).
//
// Usage: node tools/terrain-node-checks.mjs [path/to/voxEx.html] [seedString]
// Exit code 0 = hard checks green (T1/T2/T3/T5). T4/T6/T7 are reported only.
// NOTE: uses its own PRNG for the perm table — results are internally
// consistent but not byte-identical to a specific in-game seed string.
// ============================================================================
import { buildTerrainApi } from './lib/extract-terrain.mjs';

const file = process.argv[2] || new URL('../voxEx.html', import.meta.url).pathname;
const seedStr = process.argv[3] || 'node-checks';

let api;
try {
  api = buildTerrainApi(file, seedStr);
} catch (e) {
  console.error(e.message);
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

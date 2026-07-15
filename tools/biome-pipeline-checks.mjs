#!/usr/bin/env node
// ============================================================================
// biome-pipeline-checks.mjs — biome-driven-terrain metrics runner
// (CCR-WORLDGEN-PIPELINE-001). REAL-MODE since Phase 2 (P2-R4).
// ----------------------------------------------------------------------------
// Runs the M-table metrics (tools/lib/biome-metrics.mjs) against the REAL
// game pipeline extracted from voxEx.html with the biomeDrivenTerrain flag ON:
//   - labels        <- api.classifyBiome (softmax argmin over T/H/Cn/R)
//   - R axis        <- api.reliefParam (SPLINE_RELIEF)
//   - heights       <- api.blendedHeight / computeSurfaceHeight (FLAG-ON path,
//                       terrainSurface sourcing relief from SPLINE_RELIEF)
// so M4/M5/M6/M8 now measure the ACTUAL flag-ON terrain, not the Phase-0
// prototype. The classifier tunables (tau, AXIS_W.r, centroids, splines) live in
// the game's GEN_TUNABLES registry; the Phase-0 --tau/--wr overrides were DROPPED
// (the constants are no longer local knobs — re-lock them in voxEx.html's
// GEN_TUNABLES DEFAULTS if a metric fails, per P2-R5).
//
//   node tools/biome-pipeline-checks.mjs [--seed=S] [--seeds=a,b,c]
//        [--json] [--size=..] [--step=..] [--file=voxEx.html] [--hydro]
//
// Exit 0 iff all GATING metrics pass on ALL seeds (M14 monitor-only when hydroRivers is
// off; M9-M11 are deferred non-gating stubs — Phase 3 material cascade).
// M21 (CCR-WORLDGEN-PIPELINE-002 WS3, Q6): forced-shape agreement — builds its OWN
// 6 forceSingleBiome api instances per seed (one per BIOME_ID_ORDER biome) via
// buildProto's carried-through file/seed; gating.
// --hydro (CCR-WORLDGEN-PIPELINE-002 WS6): bakes worldConfig.hydroRivers = true into every
// buildProto instance this run, activating M14's gating fork (>=99% springs reach an
// outlet) plus the M15 (monotonic-descent invariant), M16 (cross-region determinism/seam),
// and M17 (basin extent <= HYDRO_HALO) hydro-only gates — all four auto-skip (deferred,
// non-gating) without this flag, so the default run (no --hydro) is unaffected.
// ============================================================================
import { buildTerrainApi } from './lib/extract-terrain.mjs';
import { runAllMetrics } from './lib/biome-metrics.mjs';

const argv = process.argv.slice(2);
const flags = {};
for (const a of argv) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) flags[m[1]] = m[2] ?? true; }

const file = flags.file ? String(flags.file) : 'voxEx.html';
const seeds = flags.seeds ? String(flags.seeds).split(',') : [String(flags.seed ?? '1337')];
const sampleOpts = {};
if (flags.size !== undefined) sampleOpts.size = Number(flags.size);
if (flags.step !== undefined) sampleOpts.step = Number(flags.step);
// CCR-WORLDGEN-PIPELINE-002 WS6: bare --hydro activates the hydrological river system
// (worldConfig.hydroRivers baked true into every buildProto instance this run) so M14's
// gating fork and the M15/M16/M17 hydro-only metrics stop auto-skipping. Omitted (default)
// = hydroRivers false everywhere, byte-identical to every pre-WS6 run of this tool.
const hydroOn = !!flags.hydro;
// CCR-WORLDGEN-CONTINENTAL-OCEANS-001: bare --legacy-ocean (or env VOXEX_CO_OFF=1) forces
// worldConfig.continentalOceans = false into every buildProto instance, so the pre-CCR noise-ocean
// terrain can be A/B'd against the (live default) C-authored ocean — used to separate feature-induced
// metric shifts (coast/sand/roughness) from pre-existing state. Omitted = the live default (ON).
const legacyOcean = !!flags['legacy-ocean'] || process.env.VOXEX_CO_OFF === '1';

/**
 * Real-mode metrics adapter: exposes the interface biome-metrics.mjs expects
 * ({ api, names, CENTROIDS, AXIS_W, TAU, climateAxes, classifyBiome,
 *   selfTestIdentity }) backed by the FLAG-ON extracted game pipeline.
 * @param {string|number} seed - world seed string.
 * @returns {object} proto adapter.
 */
function buildProto(seed) {
  const api = buildTerrainApi(file, String(seed), { biomeDrivenTerrain: true, hydroRivers: hydroOn, ...(legacyOcean ? { continentalOceans: false } : {}) });
  const GT = api.GEN_TUNABLES;
  const names = api.BIOME_ID_ORDER;
  const CENTROIDS = GT.BIOME_CENTROIDS;
  const AXIS_W = GT.AXIS_W;
  const TAU = GT.BIOME_SOFTMAX_TAU;
  const _w = new Float32Array(names.length);
  // Climate remaps MIRROR the game's classifyBiome exactly (T native -1..1, H raw
  // 0..1, Cn = clamp((C+1)/2), R = reliefParam) so the metric axes match the labels.
  function climateAxes(gx, gz) {
    const C = api.continentalness(gx, gz);
    return {
      T: api.temperature(gx, gz) * 2 - 1,
      H: api.humidity(gx, gz),
      Cn: C < -1 ? 0 : (C > 1 ? 1 : (C + 1) * 0.5),
      R: api.reliefParam(gx, gz),
    };
  }
  function classifyBiome(gx, gz) {
    const label = api.classifyBiome(gx, gz, _w); // fills _w with normalized softmax weights
    const ax = climateAxes(gx, gz);
    const weights = {};
    for (let i = 0; i < names.length; i++) weights[names[i]] = _w[i]; // fresh snapshot (shared _w is copied out)
    return { T: ax.T, H: ax.H, Cn: ax.Cn, R: ax.R, label, weights };
  }
  function selfTestIdentity() {
    // Real-mode: heights ARE the flag-ON api's own computeSurfaceHeight/blendedHeight
    // (no separate protoHeight to reconcile). Verify determinism + finiteness instead.
    for (let i = 0; i < 100; i++) {
      const gx = (i * 977) % 40000 - 20000, gz = (i * 1597) % 40000 - 20000;
      const h = api.blendedHeight(gx, gz, 0);
      if (!Number.isFinite(h)) return { ok: false, firstBadAt: `nonfinite height @ ${gx},${gz}` };
      if (api.classifyBiome(gx, gz) !== api.classifyBiome(gx, gz)) return { ok: false, firstBadAt: `nondeterministic label @ ${gx},${gz}` };
    }
    return { ok: true };
  }
  // file/seed carried through so real-mode-only metrics (M21, CCR-WORLDGEN-PIPELINE-002
  // WS3; M16, CCR-WORLDGEN-PIPELINE-002 WS6) can build their OWN api instances from the
  // same source/seed. hydroRivers carried through so M14's fork and M15/M16/M17 know
  // whether to engage (CCR-WORLDGEN-PIPELINE-002 WS6).
  // continentalOceans carried through so the metric-recalibration branches (M4/M5/M6/M10/M17/
  // M18/M20/M22/M23) can select the C-authored-ocean thresholds vs the legacy-ocean calibration
  // (CCR-WORLDGEN-CONTINENTAL-OCEANS-001 Phase 3). !legacyOcean == the live default (flag ON).
  return { api, names, CENTROIDS, AXIS_W, TAU, climateAxes, classifyBiome, selfTestIdentity, file, seed: String(seed), hydroRivers: hydroOn, continentalOceans: !legacyOcean };
}

const perSeed = [];
let allGatingPass = true;
for (const seed of seeds) {
  const proto = buildProto(seed);
  const id = proto.selfTestIdentity();
  if (!id.ok) { console.error(`SELF-TEST FAIL (real-mode determinism/finiteness) seed ${seed} @ ${id.firstBadAt}`); process.exit(3); }
  const metrics = runAllMetrics(proto, { sample: sampleOpts });
  for (const mtr of metrics) if (mtr.gating && !mtr.pass) allGatingPass = false;
  perSeed.push({ seed, metrics });
}

if (flags.json) {
  process.stdout.write(JSON.stringify(perSeed) + '\n');
  process.exit(allGatingPass ? 0 : 1);
}

// --- human table -------------------------------------------------------------
const cfg0 = perSeed.length ? buildProto(perSeed[0].seed) : null;
if (cfg0) console.log(`config[REAL flag-ON]: tau=${cfg0.TAU}  AXIS_W.r=${cfg0.AXIS_W.r}  seeds=${seeds.join(',')}  sample=${(sampleOpts.size ?? 16384)}x/${(sampleOpts.step ?? 64)}  file=${file}  hydroRivers=${hydroOn}`);
for (const { seed, metrics } of perSeed) {
  console.log(`\n=== seed ${seed} ===`);
  for (const mtr of metrics) {
    const tag = mtr.deferred ? 'DEFER' : mtr.monitor ? 'MONI ' : mtr.pass ? 'PASS ' : 'FAIL ';
    const star = mtr.star ? '*' : ' ';
    console.log(`${tag}${star}${mtr.id.padEnd(4)} ${mtr.name.padEnd(40)} ${mtr.detail}`);
  }
}
const gatingFails = [];
for (const { seed, metrics } of perSeed)
  for (const mtr of metrics) if (mtr.gating && !mtr.pass) gatingFails.push(`${seed}:${mtr.id}`);
console.log(allGatingPass ? '\nALL GATING METRICS GREEN (all seeds)' : `\nGATING FAILURES: ${gatingFails.join(' ')}`);
process.exit(allGatingPass ? 0 : 1);

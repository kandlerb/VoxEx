// ============================================================================
// extract-terrain.mjs — build a headless terrain API from the REAL voxEx.html
// ----------------------------------------------------------------------------
// Single-source extraction machinery shared by tools/terrain-node-checks.mjs
// (the invariant gate) and tools/terrain-probe.mjs (the diagnostic instrument).
// Extracts the live terrain/river/soil functions BY NAME from voxEx.html — no
// hand-copied replicas to drift (see CLAUDE.md: never commit replicas).
//
//   import { buildTerrainApi } from './lib/extract-terrain.mjs';
//   const api = buildTerrainApi('voxEx.html', 'my-seed');
//   api.computeSurfaceHeight(gx, gz); api.blendedHeight(gx, gz, 0); ...
//
// CCR-WORLDGEN-TUNABLES-001: the shape/climate/river tunables moved from bare
// `const NAME = value;` declarations into the GEN_TUNABLES registry (the game
// reads them through `let` aliases). This extractor now extracts the REGISTRY
// object and derives each tunable from it — extracting the aliases directly
// would find `GEN_TUNABLES.NAME` references with no registry in the sandbox.
//
// NOTE: uses its own PRNG for the perm table — results are internally
// consistent but not byte-identical to a specific in-game seed string.
// If extraction throws, the code moved/renamed: update THIS file in the same
// commit as the refactor (it is part of the lockstep).
// ============================================================================
import { readFileSync } from 'node:fs';

/**
 * Assemble the real terrain pipeline from voxEx.html into a callable API.
 * @param {string} file - path to voxEx.html
 * @param {string} seedStr - seed string for the internal perm-table PRNG
 * @returns {object} terrain functions (computeSurfaceHeight, blendedHeight, ...)
 */
export function buildTerrainApi(file, seedStr, opts = {}) {
  const src = readFileSync(file, 'utf8');
  // CCR-WORLDGEN-PIPELINE-001 Phase 2 (P2-R4) + Phase 4 (THE FLIP): opts.biomeDrivenTerrain flips
  // the flag in the assembled worldConfig. Phase 4 changed the DEFAULT from hardcoded-false to the
  // LIVE WORLD_CONFIG.biomeDrivenTerrain value parsed from the source file, so no-opts harnesses
  // (terrain-node-checks) automatically track the shipping default. An explicit boolean override
  // (true OR false) still wins -- false forces the legacy path for A/B cost/byte-identity baselines.
  // Anchor to a line-start object-property declaration (`  biomeDrivenTerrain: true,`) so the
  // VOXEX_RECENT_CHANGES narrative text (which contains literal `biomeDrivenTerrain:false`
  // describing Phase 1, EARLIER in the file) can never win the parse.
  const _liveBiomeDrivenMatch = src.match(/^[ \t]*biomeDrivenTerrain:\s*(true|false)\b/m);
  const _liveBiomeDriven = _liveBiomeDrivenMatch ? _liveBiomeDrivenMatch[1] === 'true' : false;
  const biomeDriven = (opts && typeof opts.biomeDrivenTerrain === 'boolean')
    ? opts.biomeDrivenTerrain
    : _liveBiomeDriven;
  // CCR-WORLDGEN-PIPELINE-002 WS3: opts.forceSingleBiome bakes a forced biome name into the
  // assembled worldConfig (mirrors the biomeDrivenTerrain opt above) so M21 can build one API
  // instance per forced biome without touching voxEx.html. null/omitted = unforced (default).
  const forcedBiome = (opts && typeof opts.forceSingleBiome === 'string') ? opts.forceSingleBiome : null;
  // CCR-WORLDGEN-PIPELINE-002 WS6 (P0/P1): opts.hydroRivers overrides the live worldConfig.hydroRivers
  // flag (mirrors the biomeDrivenTerrain opt above) so the harness can build BOTH a flag-OFF
  // (default, byte-identity regression) and a flag-ON (--hydro, M14-M17 gating) api from the SAME
  // file/seed. Default false when omitted (the shipping default — flag-ON is a harness-only ask
  // pending the Bump-B flip).
  const _liveHydroMatch = src.match(/^[ \t]*hydroRivers:\s*(true|false)\b/m);
  const _liveHydro = _liveHydroMatch ? _liveHydroMatch[1] === 'true' : false;
  const hydroRivers = (opts && typeof opts.hydroRivers === 'boolean') ? opts.hydroRivers : _liveHydro;

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
    // CCR-WORLDGEN-PIPELINE-001 Phase 1 biome-driven classifier (inert until Phase 2)
    'reliefParam', 'classifyBiomeFromFields', 'classifyBiome', 'styleBlend', 'featureAt', 'recomputeBiomeStyleActive',
    'getOceanFactor', 'getOceanDepth', 'getRiverFactor', 'getRiverDepth',
    'getDeltaFingerFactor', 'computePreRiverHeight', 'applyRiverCarve',
    'blendedHeight', 'getPreRiverHeight', 'isTreeSoilSurface',
    // CCR-WORLDGEN-PIPELINE-002 WS6 (P0/P1): hydrological rivers (inert unless opts.hydroRivers).
    'hydroRegionOf', 'hydroLatticeH', 'floodSpill', 'buildHydroRegion', 'riverFactorAt',
    // CCR-WORLDGEN-PIPELINE-001 Phase 3 (P3-R6): REAL chunk block output for M9/M10/M11.
    // generateTerrainPass runs the actual surface-material cascade; precalculateTerrainCaches
    // builds the caches it reads (incl. featureCache/climCache/biomeIdCache); caves are
    // disabled by the caller (caveDensityMultiplier 0) so precalculateCaveNoise/noise3D only
    // need to not crash interpolateCaveNoise (threshold 0 => no carve).
    'grad3D', 'noise3D', 'interpolateCaveNoise', 'precalculateCaveNoise',
    'precalculateTerrainCaches', 'generateTerrainPass', 'fillWaterPass',
  ];
  // Registry-backed tunables (CCR-WORLDGEN-TUNABLES-001): derived from the
  // extracted GEN_TUNABLES object below, NOT scanned as standalone consts.
  const REGISTRY_KEYS = [
    'SPLINE_CONTINENTAL', 'SPLINE_EROSION', 'BIOME_PARAMS', 'AXIS_W',
    // CCR-WORLDGEN-PIPELINE-001 Phase 1 classifier tunables (AXIS_W.r rides on AXIS_W above)
    'SPLINE_RELIEF', 'BIOME_SOFTMAX_TAU', 'BIOME_CENTROIDS', 'BIOME_STYLE',
    // CCR-WORLDGEN-PIPELINE-002 WS4: climate field frequencies (temperature/humidity/erosion
    // fbm base freqs + continentalHeight's bare-literal base/erosion freqs).
    'FREQ_TEMPERATURE', 'FREQ_HUMIDITY', 'FREQ_EROSION',
    'FREQ_CONTINENTAL_BASE', 'FREQ_CONTINENTAL_EROSION',
    // CCR-WORLDGEN-PIPELINE-002 WS1: terracing contour-break warp (0 amp = inert default).
    'TERRACE_WARP_AMP', 'TERRACE_WARP_FREQ', 'TERRACE_WARP_RELIEF_MIN',
    // CCR-WORLDGEN-PIPELINE-002 WS6: hydrological river tunables (inert unless opts.hydroRivers).
    'HYDRO_REGION', 'HYDRO_STEP', 'HYDRO_HALO', 'HYDRO_SPRING_H', 'FLOW_WIDTH_SCALE',
    // CCR-WORLDGEN-PIPELINE-002 WS6-P3: organic-shape tunables (owner defect fix — meander/bank
    // warp + join-termination; inert unless opts.hydroRivers, same as the WS6 tunables above).
    'HYDRO_MEANDER_SUBDIV', 'HYDRO_MEANDER_AMP', 'HYDRO_MEANDER_FREQ', 'HYDRO_BANK_AMP', 'HYDRO_BANK_FREQ',
    // CCR-WORLDGEN-PIPELINE-002 WS6-P4: plains-meander + channel-width tunables (owner defect #2
    // fix — rivers still ran near-straight through plains; channels read thin). Same inert-unless-
    // opts.hydroRivers gating as the WS6/WS6-P3 tunables above.
    'HYDRO_MEANDER_MACRO_FREQ', 'HYDRO_MEANDER_MACRO_AMP', 'HYDRO_CHANNEL_HALF_WIDTH',
    // CCR-WORLDGEN-PIPELINE-002 WS6-P5: erosion-look tunables (owner defect #3 — "too many arms,
    // too straight, not erosion-based"). Same inert-unless-opts.hydroRivers gating as above.
    'HYDRO_VALLEY_SNAP', 'HYDRO_SPRING_KEEP',
    // CCR-WORLDGEN-PIPELINE-002 WS6-P7: elevation-progressive width tunables (owner defect #5 —
    // rivers read as thin dry ravines, not water). Same inert-unless-opts.hydroRivers gating.
    'HYDRO_LOWLAND_WIDEN', 'HYDRO_HEADWATER_TAPER',
    // CCR-WORLDGEN-PIPELINE-002 WS6-P10: stream-capture tunable (owner defect #6 — "bear claws",
    // parallel rivers eroding adjacent strips with untouched ridges between). Same inert-unless-
    // opts.hydroRivers gating as the WS6 tunables above.
    'HYDRO_CAPTURE_RADIUS',
    'FIELD_GAIN', 'RELIEF_AMPLITUDE', 'OCTAVES', 'BASE_GAIN',
    'GAIN_BY_RELIEF', 'WARP_FREQ', 'WARP_BASE', 'WARP_BY_RELIEF', 'PEAK_AMP',
    'NOTCH_LIFT', 'FRACT_FREQ0', 'HF_PIVOT', 'VALLEY_RATIO', 'SWISS_WARP', 'RIVER_BASE_WIDTH',
    'OCEAN_WARP_FREQ', 'OCEAN_WARP_AMP', 'OCEAN_WARP_VAR_FREQ', 'OCEAN_WARP_VAR_STRENGTH',
    'RIVER_WARP_FREQ', 'RIVER_WARP_AMP', 'RIVER_WARP_VAR_FREQ', 'RIVER_WARP_VAR_STRENGTH',
    'OCEAN_THRESHOLD_DEEP', 'OCEAN_THRESHOLD_SHALLOW',
    'RIVER_DEPTH_SCALE', 'OCEAN_DEPTH_SCALE',
    // CCR-WORLDGEN-PIPELINE-002 WS8: coastal erosion (fjords, cliff/bluff coast profile,
    // flow-driven deltas). FJORD_DEPTH_SCALE/CLIFF_SHARPNESS_MAX/DELTA_FLOW_SCALE ship
    // staging-neutral (0/1/0) at P1; real values land at the P2 flip.
    'FJORD_COAST_BAND', 'FJORD_OCEAN_GATE', 'FJORD_RELIEF_MIN', 'FJORD_DEPTH_SCALE',
    'CLIFF_RELIEF_MIN', 'CLIFF_SHARPNESS_MAX', 'DELTA_FLOW_SCALE',
  ];
  // still-bare consts scanned from source
  // CCR-WORLDGEN-PIPELINE-001 Phase 3: block IDs the material cascade emits (simple `const X = N;`).
  const CONSTS = ['MAX_SURFACE_Y',
    'AIR', 'GRASS', 'DIRT', 'STONE', 'BEDROCK', 'SAND', 'WATER', 'SNOW', 'GRAVEL'];
  // multi-line object/array consts extracted with the arrow scanner.
  // BIOME_ID_ORDER (CCR-WORLDGEN-PIPELINE-001): classifyBiome/styleBlend iterate it; the
  // extractConstArrow's lastIndexOfDef picks the real declaration (the worker-emission line,
  // which is EARLIER in the file, is skipped because it isn't the last occurrence).
  const OBJ_CONSTS = ['GRAD2D', 'BIOME_ID_ORDER'];

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
  biomeSizeMultiplier: 1, enableRivers: true, forceSingleBiome: ${forcedBiome ? JSON.stringify(forcedBiome) : 'null'},
  terrainAmplitudeMultiplier: 1.0,
  biomeDrivenTerrain: ${biomeDriven}, // CCR-WORLDGEN-PIPELINE-001 Phase 2 (P2-R4)
  hydroRivers: ${hydroRivers}, // CCR-WORLDGEN-PIPELINE-002 WS6 (P0/P1)
};
// Phase-2 style-path bindings terrainSurface references (mirror the module decls near
// terrainSurface + recomputeBiomeStyleActive; all-zero styles keep BIOME_STYLE_ACTIVE false).
let BIOME_STYLE_ACTIVE = false;
const _tsWeights = new Float32Array(9); // CCR-WORLDGEN-PIPELINE-002 Bump A: sized for the 9-name
// BIOME_ID_ORDER post-activation (mirrors the main-file _tsWeights sizing, WS5); a size-6 sink would
// silently drop desert/tundra/snowy_peaks softmax weights once BIOME_STYLE_ACTIVE is true on a 9-name file.
const _tsStyle = { ridgeMixBias: 0, roughnessBias: 0, warpBias: 0, baseBias: 0, soilDepth: 0 };
// CCR-WORLDGEN-PIPELINE-002 WS2 (cut-2): step-8 T/H style memo (mirror the module decls near terrainSurface).
const _styleThCache = new Map();
const _STYLE_TH_CAP = 16384;
// CCR-WORLDGEN-PIPELINE-002 WS6 (P0/P1): hydrology region cache + 8-neighbor lattice offsets
// (mirror the module decls near getRiverFactor/getPreRiverHeight in the main file).
const hydroRegionCache = new Map();
const HYDRO_REGION_CACHE_CAP = 64;
const HYDRO_NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
// CCR-WORLDGEN-PIPELINE-002 WS6 (Bump-B perf fix): riverFactorAt's 3x3 neighborhood memo
// scratches (mirror the module decls beside hydroRegionCache in the main file).
let _hydroNbKey = null;
let _hydroNbSeed = null;
const _hydroNb = new Array(9);
// CCR-WORLDGEN-PIPELINE-002 WS8 (F3): zero-alloc transport scratch riverFactorAt writes on every
// return and applyRiverCarve/precalculateTerrainCaches read adjacent to their own riverFactorAt call
// (mirror the module-scope decl beside hydroRegionCache in the main file). Declared here pre-emptively
// so the harness never ReferenceErrors regardless of which WS8 phase voxEx.html is at.
const _riverFlowScratch = { flow: 1 };
// CCR-WORLDGEN-PIPELINE-002 Bump A (C5): fused-pass distance cache for classifyBiomeFromFields (mirror
// the module decl near _tsWeights in the main file).
const _classifyDistScratch = new Float32Array(9);
const lerp = (t, a, b) => a + t * (b - a);
const lerpValue = (a, b, t) => a + t * (b - a);
`;

  for (const name of OBJ_CONSTS) {
    const s = extractConstArrow(name);
    if (!s) throw new Error(`missing const ${name}`);
    assembled += s + '\n';
  }
  assembled += 'const grad = (h, x, y) => { const g = GRAD2D[h & 15]; return g[0] * x + g[1] * y; };\n';

  // GEN_TUNABLES registry (defaults = shipped values), then per-key aliases.
  const registry = extractConstArrow('GEN_TUNABLES');
  if (!registry) throw new Error('const GEN_TUNABLES not found');
  assembled += registry + '\n';
  for (const name of REGISTRY_KEYS) assembled += `const ${name} = GEN_TUNABLES.${name};\n`;

  for (const name of CONSTS) assembled += `const ${name} = ${extractConstValue(name)};\n`;

  // biomeByName stub: resolveBiome/materials only need .name/.tags/.trees here.
  // CCR-WORLDGEN-PIPELINE-002 WS5: keyed off the UNION of BIOME_PARAMS (legacy classifier) and
  // BIOME_ID_ORDER (new softmax classifier) so desert/tundra/snowy_peaks — which live ONLY in
  // BIOME_CENTROIDS/BIOME_ID_ORDER, not BIOME_PARAMS — are visible to the Node harness after Bump A
  // activation (else classifyBiome('desert') would fall back to plains and the new biomes would be
  // invisible). snowy_peaks fabricates the mountain tag; desert/tundra fabricate density 0 (treeless).
  assembled += `
const __biomeUnionNames = Array.from(new Set([...Object.keys(BIOME_PARAMS), ...BIOME_ID_ORDER]));
const biomeByName = new Map(__biomeUnionNames.map((n) => [n, {
  name: n,
  tags: (n === 'mountains' || n === 'snowy_peaks') ? ['mountain'] : [],
  trees: { density: (n === 'desert' || n === 'tundra') ? 0 : 0.1 },
}]));
`;

  for (const name of FUNCS) {
    let s = extractFunction(name);
    if (!s && name === 'fadeFast') s = extractConstArrow('fadeFast');
    if (!s) throw new Error(`function ${name} not found in ${file}`);
    assembled += s + '\n';
  }
  // CCR-WORLDGEN-PIPELINE-001 Phase 2: seed BIOME_STYLE_ACTIVE from the live styles
  // (a bench mutating GEN_TUNABLES.BIOME_STYLE can re-call the exported recomputeBiomeStyleActive).
  assembled += 'recomputeBiomeStyleActive();\n';
  // getBiomeParams: new-terrain dispatch only (legacy body needs the biome-cell system).
  // Phase 3 (P3-R2/R6): pass outClimate through so the flag-ON reroute (resolveBiome ->
  // classifyBiome) drives biomeCache in precalculateTerrainCaches and tempCache gets raw t.
  assembled += 'function getBiomeParams(gx, gz, outClimate) { return resolveBiome(gx, gz, outClimate); }\n';
  assembled += `return { computeSurfaceHeight, blendedHeight, terrainSurface, getRiverFactor,
  getPreRiverHeight, computePreRiverHeight, isTreeSoilSurface, getOceanFactor, noise2D,
  resolveBiome, getBiomeParams, getRiverDepth, erosionParam, continentalness, temperature, humidity,
  spline, paramFreq, GEN_TUNABLES, worldConfig,
  reliefParam, classifyBiomeFromFields, classifyBiome, styleBlend, featureAt, BIOME_ID_ORDER, recomputeBiomeStyleActive,
  precalculateTerrainCaches, precalculateCaveNoise, generateTerrainPass, fillWaterPass, interpolateCaveNoise,
  hydroRegionOf, hydroLatticeH, floodSpill, buildHydroRegion, riverFactorAt,
  // CCR-WORLDGEN-PIPELINE-002 WS8: exposed for the P0 collision experiment + M22/M23 (harness-only;
  // applyRiverCarve/getDeltaFingerFactor were extracted into FUNCS all along, just not returned).
  applyRiverCarve, getDeltaFingerFactor,
  BLOCKS: { AIR, GRASS, DIRT, STONE, BEDROCK, SAND, WATER, SNOW, GRAVEL } };\n`;

  try {
    return new Function('SEED_STR', assembled)(seedStr);
  } catch (e) {
    throw new Error(`ASSEMBLY FAILED (extraction produced invalid JS): ${e.message}`);
  }
}

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
export function buildTerrainApi(file, seedStr) {
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
  getPreRiverHeight, computePreRiverHeight, isTreeSoilSurface, getOceanFactor, noise2D,
  resolveBiome, getRiverDepth, erosionParam, continentalness, temperature, humidity };\n`;

  try {
    return new Function('SEED_STR', assembled)(seedStr);
  } catch (e) {
    throw new Error(`ASSEMBLY FAILED (extraction produced invalid JS): ${e.message}`);
  }
}

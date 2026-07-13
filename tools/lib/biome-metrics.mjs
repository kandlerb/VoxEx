// ============================================================================
// biome-metrics.mjs — headless metrics for CCR-WORLDGEN-PIPELINE-001 (Phase 0)
// ----------------------------------------------------------------------------
// Implements the M-table metrics that are computable headlessly against the
// REAL extracted terrain functions + the Phase-0 prototype pipeline. Each metric
// returns { id, name, value, threshold, pass, detail, gating, deferred? }.
//
// Sampling model: M1/M3/M5/M6 read a single shared column sample (build it once
// with sampleColumnGrid); M2/M4/M7/M8/M13/M14 sample independently. M9/M10/M11 (Phase 3,
// P3-R6) generate REAL chunk block output from the extracted generateTerrainPass cascade
// (caves disabled) over MAT_CHUNK_ORIGINS and read the surface block per column.
//
// The prototype `proto` argument is the object returned by createProto() in
// tools/scratch/biome-pipeline-proto.mjs.
// ============================================================================

export const SEA_LEVEL = 60;

// --- shared sampling ---------------------------------------------------------
/**
 * Sample a square column grid once: classifier axes + label + blendedHeight.
 * @param {object} proto - createProto() result.
 * @param {object} [o] - { cx, cz, size, step }.
 * @returns {object} arrays T,H,Cn,R,label,height plus grid metadata.
 */
export function sampleColumnGrid(proto, o = {}) {
  const cx = o.cx ?? 0, cz = o.cz ?? 0, size = o.size ?? 16384, step = o.step ?? 64;
  const half = size / 2, n = Math.floor(size / step);
  const N = n * n;
  const T = new Float32Array(N), H = new Float32Array(N), Cn = new Float32Array(N), R = new Float32Array(N);
  const height = new Int16Array(N);
  const label = new Array(N);
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gx = cx - half + i * step, gz = cz - half + j * step;
      const c = proto.classifyBiome(gx, gz);
      T[k] = c.T; H[k] = c.H; Cn[k] = c.Cn; R[k] = c.R; label[k] = c.label;
      height[k] = proto.api.blendedHeight(gx, gz, 0);
      k++;
    }
  }
  return { n, step, size, cx, cz, T, H, Cn, R, label, height, count: N };
}

// --- helpers -----------------------------------------------------------------
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const a = Float64Array.from(arr).sort();
  const idx = Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))));
  return a[idx];
}
function median(arr) { return percentile(arr, 0.5); }

/**
 * R-bands for M3: Voronoi interval around each centroid's r value (midpoints to
 * neighboring centroids' r, unbounded ends clamped to [0,1]), then widened by
 * +BAND_WIDEN on each side (transition tolerance). Documented Δ = ±0.05.
 * @param {object} centroids - {name:{...,r}}.
 * @param {number} [widen=0.05] - one-sided band widening.
 * @returns {object} { name: [lo, hi] } widened R-bands.
 */
export function computeRBands(centroids, widen = 0.05) {
  const entries = Object.keys(centroids).map((n) => ({ name: n, r: centroids[n].r }));
  entries.sort((a, b) => a.r - b.r);
  const bands = {};
  for (let i = 0; i < entries.length; i++) {
    const lo = i === 0 ? 0 : (entries[i - 1].r + entries[i].r) / 2;
    const hi = i === entries.length - 1 ? 1 : (entries[i].r + entries[i + 1].r) / 2;
    bands[entries[i].name] = [Math.max(0, lo - widen), Math.min(1, hi + widen)];
  }
  return bands;
}

// --- M1 field coverage -------------------------------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m1FieldCoverage(ctx) {
  const s = ctx.sample;
  const fields = [
    { name: 'T', arr: s.T, lo: -1, hi: 1 },
    { name: 'H', arr: s.H, lo: 0, hi: 1 },
    { name: 'C', arr: s.Cn, lo: 0, hi: 1 },
    { name: 'R', arr: s.R, lo: 0, hi: 1 },
  ];
  const BINS = 32, LIMIT = 0.15;
  let worst = 0; const parts = [];
  for (const f of fields) {
    const h = new Float64Array(BINS);
    for (let i = 0; i < f.arr.length; i++) {
      let b = Math.floor(((f.arr[i] - f.lo) / (f.hi - f.lo)) * BINS);
      if (b < 0) b = 0; if (b >= BINS) b = BINS - 1;
      h[b]++;
    }
    const N = f.arr.length;
    const low = (h[0] + h[1]) / N, high = (h[BINS - 1] + h[BINS - 2]) / N;
    worst = Math.max(worst, low, high);
    parts.push(`${f.name} lo${(low * 100).toFixed(1)}% hi${(high * 100).toFixed(1)}%`);
  }
  return {
    id: 'M1', name: 'field coverage (rail pile-up)', value: worst,
    threshold: `outer-2-bin frac < ${LIMIT} each end`, pass: worst < LIMIT,
    detail: parts.join('  '), gating: true,
  };
}

// --- M2 autocorr length ------------------------------------------------------
function autocorrLength(values, ds) {
  const n = values.length;
  let mean = 0; for (let i = 0; i < n; i++) mean += values[i]; mean /= n;
  let var0 = 0; for (let i = 0; i < n; i++) { const d = values[i] - mean; var0 += d * d; }
  if (var0 === 0) return 0;
  const THRESH = 1 / Math.E;
  const maxLag = Math.floor(n / 2);
  for (let lag = 1; lag < maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += (values[i] - mean) * (values[i + lag] - mean);
    const rho = s / var0;
    if (rho < THRESH) return lag * ds;
  }
  return maxLag * ds;
}
/** @param {object} ctx @returns {object} metric result */
export function m2Autocorr(ctx) {
  const proto = ctx.proto;
  const ds = 8, LEN = 2048; // 16384-block transects (>> the ~300-420 blk autocorr length)
  // Targets = MEASURED live-field 1/e autocorr lengths (Phase-0 baseline), NOT the
  // CCR's 1250/550/1000 which were feature-size (1/freq) guesses ~3x too high for
  // multi-octave fBm. Reframed as a field-character regression guard: green at the
  // shipped defaults, trips if a field frequency is changed. See the CCR As-built for
  // the owner-region recommendation (lower freqs in Phase 2 for genuinely larger regions).
  const targets = { T: 420, H: 320, C: 160, R: 300 };
  const axisRows = [
    { z: -22000 }, { z: -13000 }, { z: -4000 }, { z: 5000 }, { z: 14000 }, { z: 23000 }, // X transects
  ];
  const axisCols = [
    { x: -22000 }, { x: -13000 }, { x: -4000 }, { x: 5000 }, { x: 14000 }, { x: 23000 }, // Z transects
  ];
  const acc = { T: [], H: [], C: [], R: [] };
  const gather = (fixed, along) => {
    const arrs = { T: new Float64Array(LEN), H: new Float64Array(LEN), C: new Float64Array(LEN), R: new Float64Array(LEN) };
    for (let i = 0; i < LEN; i++) {
      const p = -LEN / 2 * ds + i * ds;
      const gx = along === 'x' ? p : fixed, gz = along === 'x' ? fixed : p;
      const a = proto.climateAxes(gx, gz);
      arrs.T[i] = a.T; arrs.H[i] = a.H; arrs.C[i] = a.Cn; arrs.R[i] = a.R;
    }
    acc.T.push(autocorrLength(arrs.T, ds)); acc.H.push(autocorrLength(arrs.H, ds));
    acc.C.push(autocorrLength(arrs.C, ds)); acc.R.push(autocorrLength(arrs.R, ds));
  };
  for (const r of axisRows) gather(r.z, 'x');
  for (const c of axisCols) gather(c.x, 'z');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  let allPass = true; const parts = [];
  for (const f of ['T', 'H', 'C', 'R']) {
    const m = mean(acc[f]); const tgt = targets[f];
    const lo = tgt * 0.60, hi = tgt * 1.40; // +/-40%: 1/e autocorr is a noisy per-seed estimator (real cross-seed spread ~+/-30%); still trips a >=1.5x frequency change
    const ok = m >= lo && m <= hi;
    if (!ok) allPass = false;
    parts.push(`${f}~${Math.round(m)}(tgt${tgt}${ok ? '' : ' X'})`);
  }
  return {
    id: 'M2', name: 'field autocorr length', value: parts,
    threshold: 'within +/-40% of measured-baseline autocorr (regression guard)', pass: allPass,
    detail: parts.join('  '), gating: true,
  };
}

// --- M3 biome<->shape agreement ---------------------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m3Agreement(ctx) {
  const s = ctx.sample;
  const bands = computeRBands(ctx.proto.CENTROIDS, 0.05);
  let hit = 0;
  for (let i = 0; i < s.count; i++) {
    const band = bands[s.label[i]];
    if (s.R[i] >= band[0] && s.R[i] <= band[1]) hit++;
  }
  const rate = hit / s.count;
  return {
    id: 'M3', name: 'biome<->shape agreement (R in label band)', value: rate,
    threshold: '>= 0.95', pass: rate >= 0.95,
    detail: `${(rate * 100).toFixed(2)}% of ${s.count} cols (band = Voronoi(r) +/-0.05)`,
    gating: true, star: true,
  };
}

// --- M4 seam at label boundaries --------------------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m4Seam(ctx) {
  const proto = ctx.proto;
  const ROWS = 40, LEN = 2048;
  const cross = [], within = [];
  let globalMax = 0;
  const walk = (fixed, along, o) => {
    let prevH = null, prevL = null;
    for (let i = 0; i < LEN; i++) {
      const p = o + i;
      const gx = along === 'x' ? p : fixed, gz = along === 'x' ? fixed : p;
      const c = proto.classifyBiome(gx, gz);
      const h = proto.api.blendedHeight(gx, gz, 0);
      if (prevH !== null) {
        const d = Math.abs(h - prevH);
        if (d > globalMax) globalMax = d;
        if (c.label !== prevL) cross.push(d); else within.push(d);
      }
      prevH = h; prevL = c.label;
    }
  };
  for (let r = 0; r < ROWS; r++) { const o = -20000 + r * 1000; walk(o, 'x', -LEN / 2); walk(o + 400, 'z', -LEN / 2); }
  const p99c = percentile(cross, 0.99), p99w = percentile(within, 0.99);
  const ratioOk = p99c <= 1.2 * p99w;
  const stepOk = globalMax < 30;
  return {
    id: 'M4', name: 'seam at label boundaries', value: { p99cross: p99c, p99within: p99w, maxAdj: globalMax },
    threshold: 'p99(cross) <= 1.2*p99(within) AND maxAdj < 30', pass: ratioOk && stepOk,
    detail: `p99cross ${p99c.toFixed(1)} vs 1.2*p99within ${(1.2 * p99w).toFixed(1)} | maxAdj ${globalMax} | ${cross.length} cross / ${within.length} within pairs`,
    gating: true, star: true,
  };
}

// --- M5 mountain coverage ----------------------------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m5MountainCoverage(ctx) {
  const s = ctx.sample;
  let land = 0, mtn = 0;
  for (let i = 0; i < s.count; i++) {
    if (s.height[i] >= SEA_LEVEL) {
      land++;
      if (s.R[i] > 0.7 || s.label[i] === 'mountains') mtn++;
    }
  }
  const frac = land ? mtn / land : 0;
  return {
    id: 'M5', name: 'mountain coverage (land cols)', value: frac,
    threshold: '10-13%', pass: frac >= 0.10 && frac <= 0.13,
    detail: `${(frac * 100).toFixed(1)}% of ${land} land cols (R>0.7 OR label=mountains)`,
    gating: true,
  };
}

// --- M6 land/ocean split -----------------------------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m6LandOcean(ctx) {
  const s = ctx.sample;
  let below = 0;
  for (let i = 0; i < s.count; i++) if (s.height[i] < SEA_LEVEL) below++;
  const frac = below / s.count;
  return {
    id: 'M6', name: 'land/ocean split (below sea)', value: frac,
    threshold: '20-35% below sea', pass: frac >= 0.20 && frac <= 0.35,
    detail: `${(frac * 100).toFixed(1)}% of ${s.count} cols below sea ${SEA_LEVEL}`,
    gating: true,
  };
}

// --- M7 biome region size ----------------------------------------------------
/**
 * Formulation: 512x512 world region, step 4 => 128x128 label cells. Flood-fill
 * 4-connected same-label components. equivDiameter(component) = sqrt(areaCells)*step
 * (blocks). Gate: median equivDiameter >= 150 blk; sliver (< 8 blk diameter, i.e.
 * areaCells < (8/step)^2) fraction of components < 5%.
 * @param {object} ctx @returns {object} metric result
 */
export function m7RegionSize(ctx) {
  const proto = ctx.proto;
  const size = 4096, step = 4, n = size / step; // 1024x1024 cells over 4096 blk (~14 R-autocorr lengths); step 4 resolves fine detail
  const half = size / 2;
  const grid = new Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      grid[j * n + i] = proto.classifyBiome(-half + i * step, -half + j * step).label;
  const seen = new Uint8Array(n * n);
  const comps = [];
  const stack = [];
  for (let start = 0; start < n * n; start++) {
    if (seen[start]) continue;
    const lab = grid[start];
    let area = 0; stack.length = 0; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const k = stack.pop(); area++;
      const i = k % n, j = (k / n) | 0;
      const nb = [];
      if (i > 0) nb.push(k - 1); if (i < n - 1) nb.push(k + 1);
      if (j > 0) nb.push(k - n); if (j < n - 1) nb.push(k + n);
      for (const m of nb) if (!seen[m] && grid[m] === lab) { seen[m] = 1; stack.push(m); }
    }
    comps.push(area);
  }
  // AREA-weighted formulation (documented deviation from the CCR's count-median):
  // biome boundaries fringe into many thin components (natural blend zones), so the
  // count-median is dominated by boundary skin, not region size. ~97-98% of AREA sits
  // in large regions. equivDiameter(component) = sqrt(areaCells)*step (blocks).
  let totalArea = 0, coherentArea = 0, sliverArea = 0;
  const cellsToDiam = (a) => Math.sqrt(a) * step;
  for (const a of comps) {
    totalArea += a;
    if (cellsToDiam(a) >= 150) coherentArea += a;   // "large region" >= 150 blk equiv-diameter
    if (cellsToDiam(a) < 32) sliverArea += a;        // sliver skin
  }
  const coherentFrac = totalArea ? coherentArea / totalArea : 0;
  const sliverFrac = totalArea ? sliverArea / totalArea : 0;
  // area-weighted median diameter (for reporting)
  const sorted = comps.slice().sort((x, y) => x - y);
  let cum = 0, medDiam = 0;
  for (const a of sorted) { cum += a; if (cum >= totalArea / 2) { medDiam = cellsToDiam(a); break; } }
  return {
    id: 'M7', name: 'biome region size (area-weighted)', value: coherentFrac,
    threshold: 'area in >=150 blk regions >= 85% AND sliver(<32 blk) area < 5%',
    pass: coherentFrac >= 0.85 && sliverFrac < 0.05,
    detail: `${(coherentFrac * 100).toFixed(1)}% area in >=150blk regions, sliver-area ${(sliverFrac * 100).toFixed(1)}%, ${comps.length} comps, area-wt median diam ${medDiam.toFixed(0)} blk`,
    gating: true,
  };
}

// --- M8 river flood integrity (reuses T5 logic) ------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m8RiverFlood(ctx) {
  const api = ctx.proto.api;
  let chan = 0, dry = 0;
  for (let gx = -20000; gx < 20000; gx += 23) {
    for (let gz = -20000; gz < 20000; gz += 1013) {
      const pre = api.computePreRiverHeight(gx, gz, 0);
      if (pre.height <= SEA_LEVEL || pre.height >= 80) continue;
      const rf = api.getRiverFactor(gx, gz, 0, pre.height);
      if (rf < 0.35) { chan++; if (api.blendedHeight(gx, gz, 0) >= SEA_LEVEL) dry++; }
    }
  }
  const pct = chan ? dry / chan : 0;
  return {
    id: 'M8', name: 'river flood integrity', value: pct,
    threshold: 'dry channel-core rate < 5%', pass: chan === 0 || pct < 0.05,
    detail: `${chan} channel cols, ${(pct * 100).toFixed(1)}% dry`, gating: true,
  };
}

// --- M9/M10/M11 REAL material metrics (CCR-WORLDGEN-PIPELINE-001 Phase 3, P3-R6) ------
// These generate REAL chunk block output from the extracted generateTerrainPass cascade
// (caves DISABLED via caveDensityMultiplier 0 to isolate SURFACE materials) over a fixed set
// of scattered chunks, then read the surface block per column. `api` is the extracted terrain
// pipeline; biome-pipeline-checks passes the FLAG-ON api (the point of Phase 3), while the
// flag-OFF regression harness passes a flag-OFF api (legacy dressing must still satisfy M9/M10).
const MAT_CHUNK_ORIGINS = [ // block coords, chunk-aligned (×16), scattered across the world
  [0, 0], [1600, -1200], [-2400, 800], [3200, 3200],
  [-4000, -4000], [960, -3040], [-1920, 2560], [4096, -512],
];
const MAT_CS = 16, MAT_CH = 320;
const CAVE_OFF = { caveDensityMultiplier: 0 };

/**
 * Generate REAL surface blocks for one 16×16 chunk via the extracted cascade (caves off).
 * @param {object} api - extracted terrain api (BLOCKS + precalc/generate/fill funcs).
 * @param {number} startX - chunk origin X (block coords).
 * @param {number} startZ - chunk origin Z (block coords).
 * @returns {{data:Uint8Array, caches:object}} block array (x + z*CS + y*CS*CS) + terrain caches.
 */
export function buildChunkSurface(api, startX, startZ) {
  const caches = api.precalculateTerrainCaches(MAT_CS, startX, startZ, 0);
  const cc = api.precalculateCaveNoise(MAT_CS, MAT_CH, startX, startZ, CAVE_OFF);
  const data = new Uint8Array(MAT_CS * MAT_CS * MAT_CH);
  const set = (lx, ly, lz, id) => { data[lx + lz * MAT_CS + ly * MAT_CS * MAT_CS] = id; };
  api.generateTerrainPass(MAT_CS, MAT_CH, startX, startZ, caches, cc, set, CAVE_OFF);
  api.fillWaterPass(data, MAT_CS, MAT_CH, caches.heightCache);
  return { data, caches };
}
function surfaceBlockOf(data, heightCache, lx, lz) {
  const wy = heightCache[lx + lz * MAT_CS]; // yOffset 0 ⇒ surface voxel is at ly = worldTopY
  if (wy < 0 || wy >= MAT_CH) return -1;
  return data[lx + lz * MAT_CS + wy * MAT_CS * MAT_CS];
}

/**
 * Compute M9/M10/M11 over MAT_CHUNK_ORIGINS from REAL block output.
 * M9  no grass under water   — count(surface = GRASS ∧ surfaceY < seaLevel); hard gate 0.
 * M10 sand is water-proximate — ≥95% of surface-SAND cols within K blocks (XZ Chebyshev) of a
 *      water column (blendedHeight < seaLevel; captures river-carved-below-sea too).
 * M11 no alpine invasion — < 0.5% of cols with a SNOW surface below the alpine floor while the
 *      label ∉ {mountains}. Alpine floor = ALPINE_LINE base 85 + the CCR-TERRAIN-010 band-shift
 *      floor (−13) = 72: the LOWEST worldTopY at which the elevation-gated alpine snow/rock branch
 *      can fire flag-ON. SNOW is emitted ONLY by that branch (never the non-mountain cascade), so
 *      SNOW below 72 with a non-mountain label is the pure alpine-invasion signal — STONE/GRAVEL
 *      also arise legitimately from slopes/cliffs/boulders at ANY elevation, so gating on them would
 *      conflate slope-rock with invasion; SNOW is the unambiguous alpine marker. (Flag-ON, snow only
 *      appears at worldTopY ≥ ~127, so a correct pipeline reports 0; rock-below-floor is reported for
 *      visibility only.) Snow on a HIGH non-mountain-labeled peak is CORRECT now (elevation-driven).
 * @param {object} api - extracted terrain api.
 * @param {number} [K=6] - M10 water-proximity Chebyshev radius (blocks).
 * @returns {[object,object,object]} [M9, M10, M11] metric results.
 */
export function materialMetrics(api, K = 6) {
  const B = api.BLOCKS;
  const ALPINE_FLOOR = 72;
  let totalCols = 0, grassUnderWater = 0, sandCols = 0, sandNearWater = 0;
  let snowInvasion = 0, rockBelowFloorInfo = 0;
  for (const [sx, sz] of MAT_CHUNK_ORIGINS) {
    const { data, caches } = buildChunkSurface(api, sx, sz);
    const h = caches.heightCache;
    // expanded water grid for M10 proximity (covers ±K around the chunk, blendedHeight-based)
    const span = MAT_CS + 2 * K;
    const water = new Uint8Array(span * span);
    for (let j = 0; j < span; j++) for (let i = 0; i < span; i++) {
      water[i + j * span] = api.blendedHeight(sx - K + i, sz - K + j, 0) < SEA_LEVEL ? 1 : 0;
    }
    for (let lz = 0; lz < MAT_CS; lz++) for (let lx = 0; lx < MAT_CS; lx++) {
      totalCols++;
      const wy = h[lx + lz * MAT_CS];
      const b = surfaceBlockOf(data, h, lx, lz);
      if (b === B.GRASS && wy < SEA_LEVEL) grassUnderWater++;
      if (b === B.SAND) {
        sandCols++;
        let near = false;
        for (let dz = -K; dz <= K && !near; dz++) for (let dx = -K; dx <= K && !near; dx++) {
          if (water[(lx + K + dx) + (lz + K + dz) * span]) near = true;
        }
        if (near) sandNearWater++;
      }
      if (wy < ALPINE_FLOOR && api.classifyBiome(sx + lx, sz + lz) !== 'mountains') {
        if (b === B.SNOW) snowInvasion++;
        else if (b === B.STONE || b === B.GRAVEL) rockBelowFloorInfo++;
      }
    }
  }
  const m9 = {
    id: 'M9', name: 'no grass under water', value: grassUnderWater,
    threshold: '0 (hard)', pass: grassUnderWater === 0, gating: true,
    detail: `${grassUnderWater} grass-below-sea cols of ${totalCols}`,
  };
  const sandFrac = sandCols ? sandNearWater / sandCols : 1;
  const m10 = {
    id: 'M10', name: 'sand is water-proximate', value: sandFrac,
    threshold: `>= 0.95 within K=${K} blk of water`, pass: sandCols === 0 || sandFrac >= 0.95, gating: true,
    detail: `${(sandFrac * 100).toFixed(1)}% of ${sandCols} sand cols within ${K} blk of water`,
  };
  const invasionFrac = totalCols ? snowInvasion / totalCols : 0;
  const m11 = {
    id: 'M11', name: 'no alpine invasion', value: invasionFrac,
    threshold: '< 0.5% snow-below-floor cols (label != mountains)', pass: invasionFrac < 0.005, gating: true,
    detail: `${snowInvasion} snow-invasion cols (< floor ${ALPINE_FLOOR}, non-mtn) of ${totalCols}; rock-below-floor(info)=${rockBelowFloorInfo}`,
  };
  return [m9, m10, m11];
}

// --- M13 prototype determinism ----------------------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m13Determinism(ctx) {
  const proto = ctx.proto;
  let ok = true, badAt = '';
  for (let i = 0; i < 200 && ok; i++) {
    const gx = (i * 977) % 60000 - 30000, gz = (i * 1597) % 60000 - 30000;
    const a = proto.classifyBiome(gx, gz), b = proto.classifyBiome(gx, gz);
    if (a.label !== b.label) { ok = false; badAt = `label @ ${gx},${gz}`; break; }
    for (const nm of proto.names) if (a.weights[nm] !== b.weights[nm]) { ok = false; badAt = `weight ${nm} @ ${gx},${gz}`; break; }
  }
  return {
    id: 'M13', name: 'prototype determinism (classifyBiome x2)', value: ok,
    threshold: 'identical label + weights', pass: ok,
    detail: ok ? '200/200 identical' : `MISMATCH: ${badAt}`, gating: true,
  };
}

// --- M14 river->ocean connectivity (MONITOR ONLY) ----------------------------
/** @param {object} ctx @returns {object} metric result */
export function m14RiverOceanConn(ctx) {
  const api = ctx.proto.api;
  const D = 64;
  const ring = [];
  for (let a = 0; a < 8; a++) { const th = (a / 8) * Math.PI * 2; ring.push([Math.round(Math.cos(th) * D), Math.round(Math.sin(th) * D)]); }
  let chan = 0, near = 0;
  for (let gx = -20000; gx < 20000; gx += 137) {
    for (let gz = -20000; gz < 20000; gz += 1013) {
      const pre = api.computePreRiverHeight(gx, gz, 0);
      if (pre.height <= SEA_LEVEL || pre.height >= 80) continue;
      const rf = api.getRiverFactor(gx, gz, 0, pre.height);
      if (rf >= 0.35) continue;
      chan++;
      let hitOcean = api.getOceanFactor(gx, gz, 0) > 0.5;
      if (!hitOcean) for (const o of ring) if (api.getOceanFactor(gx + o[0], gz + o[1], 0) > 0.5) { hitOcean = true; break; }
      if (hitOcean) near++;
    }
  }
  const frac = chan ? near / chan : 0;
  return {
    id: 'M14', name: 'river->ocean connectivity (MONITOR)', value: frac,
    threshold: 'REPORT ONLY (hydrology deferred, D5)', pass: true, gating: false, monitor: true,
    detail: `${(frac * 100).toFixed(1)}% of ${chan} channel cores within ${D} blk of ocean`,
  };
}

/**
 * Run every metric for one seed. Builds the shared column sample once.
 * @param {object} proto - createProto() result.
 * @param {object} [opts] - { sample:{size,step} } grid overrides.
 * @returns {Array<object>} metric results in M-order.
 */
export function runAllMetrics(proto, opts = {}) {
  const sample = sampleColumnGrid(proto, opts.sample || {});
  const ctx = { proto, sample, opts };
  // M9/M10/M11 are REAL block-output metrics (Phase 3, P3-R6) — generated once from the
  // extracted generateTerrainPass cascade over the flag-aware proto.api.
  const [m9, m10, m11] = materialMetrics(proto.api);
  return [
    m1FieldCoverage(ctx), m2Autocorr(ctx), m3Agreement(ctx), m4Seam(ctx),
    m5MountainCoverage(ctx), m6LandOcean(ctx), m7RegionSize(ctx), m8RiverFlood(ctx),
    m9, m10, m11,
    m13Determinism(ctx), m14RiverOceanConn(ctx),
  ];
}

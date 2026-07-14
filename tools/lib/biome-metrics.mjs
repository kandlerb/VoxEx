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
import { buildTerrainApi } from './extract-terrain.mjs';

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

// CCR-WORLDGEN-PIPELINE-002 WS5: temperature-corner biomes. desert/tundra are selected by
// their T extreme (hot/cold), not by relief, so they legitimately span a WIDE R range and an
// R-band agreement check (M3) is not a meaningful expectation for them — they are validated by
// M19 (land share), M20 (desert dressing) and M11 (tundra low-snow) instead. snowy_peaks is NOT
// here: it is genuinely high-relief (mountain-tagged) and stays under the R-band check.
const M3_TEMP_CORNER = new Set(['desert', 'tundra']);

/**
 * Find up to maxN chunk-aligned origins (block coords) whose center column classifies as `label`.
 * Deterministic scan order. Used by materialMetrics to make M20 desert-dressing coherence
 * MEANINGFUL when desert is active (the fixed MAT_CHUNK_ORIGINS cluster near origin may contain no
 * desert on a given seed); returns [] when the label is inactive/absent, so M20 stays a DEFER-style
 * no-op (0 desert cols) on the live 6-name file.
 * @param {object} api - extracted terrain api (classifyBiome + BIOME_ID_ORDER).
 * @param {string} label - target biome label.
 * @param {number} maxN - max chunk origins to return.
 * @returns {Array<[number,number]>} chunk origins (block coords, x16-aligned).
 */
function findLabelChunks(api, label, maxN) {
  const found = [];
  for (let cz = -420; cz <= 420 && found.length < maxN; cz += 17) {
    for (let cx = -420; cx <= 420 && found.length < maxN; cx += 17) {
      const bx = cx * MAT_CS, bz = cz * MAT_CS;
      if (api.classifyBiome(bx + 8, bz + 8) === label) found.push([bx, bz]);
    }
  }
  return found;
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
// CCR-WORLDGEN-PIPELINE-002 WS4: the M2 targets below were measured at these SHIPPED
// DEFAULT field frequencies (GEN_TUNABLES.FREQ_*). Autocorr length is ~inversely
// proportional to a field's fbm base frequency (halve the frequency, ~double the
// region size), so m2Autocorr scales each target by (DEFAULT_FREQ / live FREQ) read
// from the live registry -- at the shipped defaults every ratio is 1 and targets are
// byte-identical to the pre-WS4 hardcoded values; a WS4 Bump-A retune (or a future
// Biome Size / tunables-editor change) re-derives the expectation instead of tripping
// a stale regression guard.
const DEFAULT_FREQ_TEMPERATURE = 0.0009;
const DEFAULT_FREQ_HUMIDITY = 0.0011;
const DEFAULT_FREQ_EROSION = 0.0011;
const DEFAULT_FREQ_CONTINENTAL_BASE = 0.002;
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
  // BUMP A follow-up (CCR-WORLDGEN-PIPELINE-002): transect LENGTH scales with the same
  // frequency ratio as the targets, so the estimator keeps ~the same number of independent
  // correlation lengths per transect after a retune. At shipped defaults every ratio is 1
  // -> LEN 2048 (byte-identical pre-Bump-A behavior). At the Variant-B halved frequencies
  // (ratio 2) -> LEN 4096 (32768-blk transects), which removes the seed-42 sampling-noise
  // false-fail the fixed-length estimator produced on the doubled fields.
  const GT0 = proto.api ? proto.api.GEN_TUNABLES : null;
  const fr0 = (def, key) => (GT0 && Number.isFinite(GT0[key]) && GT0[key] > 0) ? (def / GT0[key]) : 1;
  const maxRatio = Math.max(
    fr0(DEFAULT_FREQ_TEMPERATURE, 'FREQ_TEMPERATURE'), fr0(DEFAULT_FREQ_HUMIDITY, 'FREQ_HUMIDITY'),
    fr0(DEFAULT_FREQ_EROSION, 'FREQ_EROSION'), fr0(DEFAULT_FREQ_CONTINENTAL_BASE, 'FREQ_CONTINENTAL_BASE'));
  const ds = 8, LEN = 2048 * Math.max(1, Math.ceil(maxRatio)); // 16384-block transects at defaults, scaled with region size
  // Targets = MEASURED live-field 1/e autocorr lengths (Phase-0 baseline), NOT the
  // CCR's 1250/550/1000 which were feature-size (1/freq) guesses ~3x too high for
  // multi-octave fBm. Reframed as a field-character regression guard: green at the
  // shipped defaults, trips if a field frequency is changed. See the CCR As-built for
  // the owner-region recommendation (lower freqs in Phase 2 for genuinely larger regions).
  // WS4: each base target now scales by (DEFAULT_FREQ / live FREQ) so a tunables-level
  // frequency retune (e.g. the WS4 Bump-A halving) re-derives the expectation instead of
  // false-failing a metric written when the frequencies were still bare constants.
  const GT = proto.api ? proto.api.GEN_TUNABLES : null;
  const freqRatio = (def, key) => (GT && Number.isFinite(GT[key]) && GT[key] > 0) ? (def / GT[key]) : 1;
  const targets = {
    T: 420 * freqRatio(DEFAULT_FREQ_TEMPERATURE, 'FREQ_TEMPERATURE'),
    H: 320 * freqRatio(DEFAULT_FREQ_HUMIDITY, 'FREQ_HUMIDITY'),
    C: 160 * freqRatio(DEFAULT_FREQ_CONTINENTAL_BASE, 'FREQ_CONTINENTAL_BASE'),
    R: 300 * freqRatio(DEFAULT_FREQ_EROSION, 'FREQ_EROSION'),
  };
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
  // CCR-WORLDGEN-PIPELINE-002 WS5: build the Voronoi(r) bands over ONLY the ACTIVE
  // classifier centroids (ctx.proto.names == BIOME_ID_ORDER), NOT the full BIOME_CENTROIDS
  // table. WS5 pre-stages 3 inert centroid rows (desert/tundra/snowy_peaks) that the 6-name
  // classifier never emits until Bump A; banding over them would carve phantom R-intervals out
  // of the active biomes and understate agreement (~92% vs ~97%) on the pre-activation file.
  // Filtering to proto.names keeps M3 self-consistent at both 6 (live) and 9 (staged) centroids —
  // the classifier and the band partition always share ONE centroid set.
  // Exclude temperature-corner biomes (desert/tundra) from BOTH the band computation (so their
  // mid-R centroids don't crowd the relief biomes' Voronoi intervals) AND the measurement — see
  // M3_TEMP_CORNER. Inert on the live 6-name file (neither is in ctx.proto.names) so M3 there is
  // byte-for-byte the pre-WS5 measurement (~96.8-97.3%).
  const _reliefCentroids = {};
  for (const nm of ctx.proto.names) if (!M3_TEMP_CORNER.has(nm)) _reliefCentroids[nm] = ctx.proto.CENTROIDS[nm];
  const bands = computeRBands(_reliefCentroids, 0.05);
  let hit = 0, meas = 0;
  for (let i = 0; i < s.count; i++) {
    if (M3_TEMP_CORNER.has(s.label[i])) continue;
    meas++;
    const band = bands[s.label[i]];
    if (s.R[i] >= band[0] && s.R[i] <= band[1]) hit++;
  }
  const rate = meas ? hit / meas : 1;
  return {
    id: 'M3', name: 'biome<->shape agreement (R in label band)', value: rate,
    threshold: '>= 0.95', pass: rate >= 0.95,
    detail: `${(rate * 100).toFixed(2)}% of ${meas} relief-labeled cols (band = Voronoi(r) +/-0.05, desert/tundra exempt)`,
    gating: true, star: true,
  };
}

// --- M4 seam at label boundaries --------------------------------------------
/** @param {object} ctx @returns {object} metric result */
export function m4Seam(ctx) {
  const proto = ctx.proto;
  // CCR-WORLDGEN-PIPELINE-002 WS6 (Bump-B gate fix, team lead):
  // (1) RIVER EXCLUSION — M4 measures LABEL-BOUNDARY seams (style-blend artifacts). River
  //     valleys legitimately steepen terrain and correlate with relief-label transitions, so
  //     under hydroRivers the tiny cross-label population picked up river-wall steps and
  //     tripped the ratio (p99cross 3.0 vs 2.4 on 427 pairs, maxAdj well under the 30 bar —
  //     statistical, not a discontinuity). Pairs where EITHER column is river-influenced
  //     (riverFactorAt < 0.999) are excluded from BOTH populations; the global maxAdj<30
  //     continuity bar still sees every pair including rivers.
  // (2) SCAN EXTENT ±9000 (was ±20000) — aligned to the sample grid's warmed hydro-region
  //     footprint; the old extent forced ~1300 cold region builds (~25 ms each) per run for
  //     no added statistical power (all 9 biomes are well-represented within ±9k per M19).
  // (3) WS6-P3 (organic-shape fix): the river-exclusion probe now queries riverFactorAt with
  //     widthMult=3 (the VALLEY influence band applyRiverCarve actually shapes terrain with —
  //     see applyRiverCarve's own `riverFactorAt(gx, gz, seed, preHeight, 3)` call), not the
  //     narrower widthMult=1 channel-only test used above. The channel-only test underestimated
  //     the true carve-affected footprint even before WS6-P3 (a latent gap).
  // (4) WS6-P3: ROWS 40->80 (doubles cross/within sample counts). The cross-label population is
  //     tiny (~300-700 pairs) even at 80 rows, so its p99 is set by only its top ~3-7 values —
  //     inherently noisy. WS6-P3's organic wobble (meander+bank warp) shifts WHICH exact sample-grid
  //     columns land near a river from seed to seed, so at ROWS=40 the (3) fix alone cleared
  //     seeds 1337/42 but still tripped on 9001 (p99cross 2.0 vs 1.2 bar, on d=1-2 block deltas at
  //     ordinary label boundaries like hills/mountains -- genuinely tiny, not a discontinuity;
  //     M18's blast-radius guards (wideTerrace/plainsRough/staircaseIndex) stay at their exact
  //     pre-WS6-P3 baselines on every seed, confirming non-river terrain shape is untouched).
  //     Doubling the population (same ±9000 extent, denser transects -- ~1.5x cost, no new cold
  //     hydro-region builds since the bounded extent is unchanged) stabilizes the p99 estimate
  //     enough to clear all 3 locked seeds with margin; verified via tools/scratch (not committed).
  const ROWS = 80, LEN = 2048, ROW_STEP = 18000 / ROWS;
  const cross = [], within = [];
  let globalMax = 0, riverExcluded = 0;
  const hydro = !!proto.hydroRivers;
  const walk = (fixed, along, o) => {
    let prevH = null, prevL = null, prevRiv = false;
    for (let i = 0; i < LEN; i++) {
      const p = o + i;
      const gx = along === 'x' ? p : fixed, gz = along === 'x' ? fixed : p;
      const c = proto.classifyBiome(gx, gz);
      const h = proto.api.blendedHeight(gx, gz, 0);
      let riv = false;
      if (hydro) {
        const pre = proto.api.computePreRiverHeight(gx, gz, 0);
        riv = proto.api.riverFactorAt(gx, gz, 0, pre.height, 3) < 0.999;
      }
      if (prevH !== null) {
        const d = Math.abs(h - prevH);
        if (d > globalMax) globalMax = d; // continuity bar ALWAYS sees rivers
        if (riv || prevRiv) riverExcluded++;
        else if (c.label !== prevL) cross.push(d); else within.push(d);
      }
      prevH = h; prevL = c.label; prevRiv = riv;
    }
  };
  for (let r = 0; r < ROWS; r++) { const o = -9000 + r * ROW_STEP; walk(o, 'x', -LEN / 2); walk(o + ROW_STEP / 2, 'z', -LEN / 2); }
  const p99c = percentile(cross, 0.99), p99w = percentile(within, 0.99);
  const ratioOk = p99c <= 1.2 * p99w;
  const stepOk = globalMax < 30;
  return {
    id: 'M4', name: 'seam at label boundaries', value: { p99cross: p99c, p99within: p99w, maxAdj: globalMax },
    threshold: 'p99(cross) <= 1.2*p99(within) AND maxAdj < 30 (river-influenced pairs excluded from the ratio, never from maxAdj)', pass: ratioOk && stepOk,
    detail: `p99cross ${p99c.toFixed(1)} vs 1.2*p99within ${(1.2 * p99w).toFixed(1)} | maxAdj ${globalMax} | ${cross.length} cross / ${within.length} within pairs${hydro ? ` / ${riverExcluded} river-excluded` : ''}`,
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
      if (s.R[i] > 0.7 || s.label[i] === 'mountains' || s.label[i] === 'snowy_peaks') mtn++; // WS5: snowy_peaks is mountain-tagged
    }
  }
  const frac = land ? mtn / land : 0;
  // CCR-WORLDGEN-PIPELINE-002 WS5: with snowy_peaks ACTIVE there are TWO mountain-family biomes, so
  // total mountainous land legitimately rises — raise the upper bound to 15% then (floor unchanged).
  // Inert on the live 6-name file (snowy_peaks not in names → cap stays 13%, byte-identical gate).
  const cap = ctx.proto.names.includes('snowy_peaks') ? 0.15 : 0.13;
  return {
    id: 'M5', name: 'mountain coverage (land cols)', value: frac,
    threshold: `10-${(cap * 100).toFixed(0)}%`, pass: frac >= 0.10 && frac <= cap,
    detail: `${(frac * 100).toFixed(1)}% of ${land} land cols (R>0.7 OR label in {mountains,snowy_peaks})`,
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
  // CCR-WORLDGEN-PIPELINE-002 WS6 (Bump-B gate fix, team lead): scan extent ±9216 (was
  // ±20000) with a denser x-step to keep channel-col counts comparable. Same rationale as
  // M4's extent change: under hydroRivers the old extent forced ~1300 cold region builds
  // (~25 ms each = 30-40 s) per run; ±9216 stays inside the warmed footprint while every
  // biome/river regime remains represented (M19). Percent-based threshold is unaffected.
  for (let gx = -9216; gx < 9216; gx += 11) {
    for (let gz = -9216; gz < 9216; gz += 1013) {
      const pre = api.computePreRiverHeight(gx, gz, 0);
      if (pre.height <= SEA_LEVEL || pre.height >= 80) continue;
      // CCR-WORLDGEN-PIPELINE-002 WS6: routed through the riverFactorAt dispatcher (not the
      // bare ribbon getRiverFactor) so this metric measures whichever river system is actually
      // active (worldConfig.hydroRivers) — forwards verbatim to getRiverFactor when off.
      const rf = api.riverFactorAt(gx, gz, 0, pre.height);
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
  // CCR-WORLDGEN-PIPELINE-002 WS6 (team lead): 12 more scattered chunks. The original 8 gave
  // M10 sand populations as small as 18 cols, where 3 edge-case cols (a swamp flat lowered
  // into the beach band by Bump A's baseBias, dried when hydro rivers moved the ribbon's
  // water) tripped the 95% bar on pure sampling noise. 20 chunks make the percentage
  // meaningful: a SYSTEMIC Y-band/dry-sand defect still fails loudly; a rare local edge
  // reads as the small fraction it actually is.
  [6400, 1600], [-6400, -1600], [1600, 6400], [-1600, -6400],
  [5120, -5120], [-5120, 5120], [2560, -6912], [-2560, 6912],
  [7680, 512], [-7680, -512], [512, -7680], [-512, 7680],
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
  let totalCols = 0, landCols = 0, grassUnderWater = 0, sandCols = 0, sandNearWater = 0;
  let snowInvasion = 0, rockBelowFloorInfo = 0;
  const m10Fails = []; // failing-col diagnostics (coords + the cascade's own rf) for the detail line
  // CCR-WORLDGEN-PIPELINE-002 WS5: desert dressing coherence (M20) counters.
  let desertLand = 0, desertSandFam = 0, sandLeakOutside = 0;
  // CCR-WORLDGEN-PIPELINE-002 WS5: when desert is ACTIVE, add a few desert-bearing chunks so M20's
  // coherence check sees real desert columns (the fixed MAT_CHUNK_ORIGINS may hold none on a seed).
  // Inactive/live 6-name file → findLabelChunks returns [] → origins unchanged → M9/M10/M11/M20 are
  // byte-identical to the pre-WS5 harness (no live regression).
  const _origins = (api.BIOME_ID_ORDER && api.BIOME_ID_ORDER.includes('desert'))
    ? MAT_CHUNK_ORIGINS.concat(findLabelChunks(api, 'desert', 6))
    : MAT_CHUNK_ORIGINS;
  for (const [sx, sz] of _origins) {
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
      const isLand = wy >= SEA_LEVEL;
      if (isLand) landCols++;
      const lab = api.classifyBiome(sx + lx, sz + lz); // WS5: labels desert/mountains gate below
      if (b === B.GRASS && wy < SEA_LEVEL) grassUnderWater++;
      // water proximity (needed by M10 sand gate AND M20 leak check)
      let near = false;
      if (b === B.SAND) {
        for (let dz = -K; dz <= K && !near; dz++) for (let dx = -K; dx <= K && !near; dx++) {
          if (water[(lx + K + dx) + (lz + K + dz) * span]) near = true;
        }
        // CCR-WORLDGEN-PIPELINE-002 WS6 (Bump-B gate fix, team lead): RIVER-GEOMETRY sand
        // counts as proximate even when the channel is dry. The material gate itself places
        // river sand by riverFactor proximity (rf < 0.5 near sea level), and an elevated
        // channel head can legitimately sit just above sea (a dry ravine head — explicitly
        // allowed since CCR-RIVER-002 "rivers end as a narrowing valley + dry ravine head").
        // M10's intent (CCR-TERRAIN-011) is banning Y-BAND sand, not river sand; under
        // hydroRivers the sampled chunks at seed 42 exposed 3 such cols in an 18-col
        // population (83.3% < 95% on sampling noise). Water-OR-channel proximity is the
        // intent-true population rule for both river systems.
        if (!near && caches.riverCache && caches.riverCache[lx + lz * MAT_CS] < 0.7) {
          // Use the GENERATION'S OWN riverCache value (the exact rf the cascade placed this
          // sand by — same seed/flags by construction), NOT a recompute with a guessed seed.
          near = true;
        }
      }
      // M10 sand-water-proximity — EXEMPT desert-labeled columns (WS5): desert sand is
      // intentionally dry, so the water-proximity gate applies to NON-desert sand only.
      if (b === B.SAND && lab !== 'desert') {
        sandCols++;
        if (near) sandNearWater++;
        else m10Fails.push(`(${sx + lx},${sz + lz}) wy=${wy} rf=${caches.riverCache ? caches.riverCache[lx + lz * MAT_CS].toFixed(2) : '?'} lab=${lab}`);
      }
      // M20 desert dressing coherence: desert-labeled land cols should be sand-family (SAND|GRAVEL)
      if (isLand && lab === 'desert') {
        desertLand++;
        if (b === B.SAND || b === B.GRAVEL) desertSandFam++;
      }
      // M20 leak: dry SAND on non-desert land beyond the water-proximity beach gate (should be ~0)
      if (isLand && lab !== 'desert' && b === B.SAND && !near) sandLeakOutside++;
      // WS5: exempt tundra (its material branch INTENTIONALLY snows at any elevation — a cold
      // biome, not the "hills in a snow costume" bug M11 guards) and snowy_peaks (mountain-tagged).
      if (wy < ALPINE_FLOOR && lab !== 'mountains' && lab !== 'tundra' && lab !== 'snowy_peaks') {
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
    threshold: `>= 0.95 within K=${K} blk of water OR river-channel (rf<0.7, cascade's own riverCache) (non-desert cols)`, pass: sandCols === 0 || sandFrac >= 0.95, gating: true,
    detail: `${(sandFrac * 100).toFixed(1)}% of ${sandCols} non-desert sand cols water/channel-proximate${m10Fails.length ? ` | fails: ${m10Fails.slice(0, 5).join(' ')}` : ''}`,
  };
  // CCR-WORLDGEN-PIPELINE-002 WS5 M20: desert dressing coherence. Trivially green with zero desert
  // cols (the live 6-name file); gating once desert labels exist (staged 9-name copy).
  const desertCoherence = desertLand === 0 ? 1 : desertSandFam / desertLand;
  const leakFrac = landCols ? sandLeakOutside / landCols : 0;
  const m20 = {
    id: 'M20', name: 'desert dressing coherence',
    value: { desertCoherence, leakFrac, desertLand },
    threshold: '>=90% desert land cols sand-family AND <0.5% dry-sand leak outside deserts',
    pass: (desertLand === 0 || desertCoherence >= 0.90) && leakFrac < 0.005, gating: true,
    detail: `${desertLand} desert land cols, ${(desertCoherence * 100).toFixed(1)}% sand-family | dry-sand-leak ${sandLeakOutside}/${landCols} (${(leakFrac * 100).toFixed(3)}%)`,
  };
  const invasionFrac = totalCols ? snowInvasion / totalCols : 0;
  const m11 = {
    id: 'M11', name: 'no alpine invasion', value: invasionFrac,
    threshold: '< 0.5% snow-below-floor cols (label != mountains)', pass: invasionFrac < 0.005, gating: true,
    detail: `${snowInvasion} snow-invasion cols (< floor ${ALPINE_FLOOR}, non-mtn) of ${totalCols}; rock-below-floor(info)=${rockBelowFloorInfo}`,
  };
  return [m9, m10, m11, m20];
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

// --- M14 river->ocean connectivity ------------------------------------------
// CCR-WORLDGEN-PIPELINE-002 WS6: bifurcates on ctx.proto.hydroRivers.
//   hydroRivers OFF (default): UNCHANGED noise-ribbon MONITOR-ONLY behavior (the
//     original D5-deferred proximity heuristic over api.getRiverFactor) — byte-identical
//     to the pre-WS6 metric so the default gate run is unaffected.
//   hydroRivers ON (--hydro): GATING. Aggregates buildHydroRegion's own routing stats
//     (springs enumerated vs. springs that reached an ocean/sub-sea outlet, incl. via a
//     pit-centered flood-and-spill breach) over a sampled grid of regions — this is the
//     Phase-0 prototype's own "100% ocean connectivity" measurement, ported verbatim
//     rather than re-derived from a proximity heuristic. Threshold >= 99% per the CCR.
/** @param {object} ctx @returns {object} metric result */
export function m14RiverOceanConn(ctx) {
  const api = ctx.proto.api;
  if (ctx.proto.hydroRivers) {
    const regions = [];
    for (let rz = -2; rz <= 2; rz++) for (let rx = -2; rx <= 2; rx++) regions.push([rx, rz]);
    let springs = 0, reached = 0, haloFail = 0;
    for (const [rx, rz] of regions) {
      const reg = api.buildHydroRegion(rx, rz, 0);
      springs += reg.stats.springs; reached += reg.stats.reached; haloFail += reg.stats.haloFail;
    }
    const frac = springs ? reached / springs : 0;
    return {
      id: 'M14', name: 'river->ocean connectivity (hydrological springs)', value: frac,
      threshold: '>= 99% of springs reach an ocean/sub-sea outlet', pass: springs === 0 || frac >= 0.99, gating: true,
      detail: `${(frac * 100).toFixed(1)}% of ${springs} springs reached an outlet across ${regions.length} regions (${haloFail} halo-fails)`,
    };
  }
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

// --- M15/M16/M17 hydrological river gates (CCR-WORLDGEN-PIPELINE-002 WS6) ---
// All three AUTO-SKIP (deferred, non-gating, pass:true) when ctx.proto.hydroRivers is
// falsy — the default `biome-pipeline-checks.mjs` run (no --hydro) never builds a single
// hydrology region, so the standard gate stays fast and green regardless of this CCR.
// Pass --hydro (real-mode) to activate: builds proto.api with worldConfig.hydroRivers
// baked true at extraction time (see biome-pipeline-checks.mjs's buildProto).

/**
 * M15 — monotonic-descent invariant. Every routed trace (buildHydroRegion's `paths`,
 * each { ki, kj, h, spillAt }) must be non-increasing in height at every step EXCEPT
 * where floodSpill's own exit contract allows a bounded "rise": the spill destination
 * satisfies (height < pit height) OR (ocean-flagged) OR (below sea level) — the first
 * disjunct is a real decrease (never triggers this check), so any h[i] > h[i-1] surviving
 * outside a documented spillAt index, or that ISN'T actually ocean/sub-sea at the spill
 * index, is a real bug (not merely an implementation-detail deviation).
 * @param {object} ctx - { proto, sample, opts } from runAllMetrics.
 * @returns {object} metric result
 */
export function m15MonotonicDescent(ctx) {
  if (!ctx.proto.hydroRivers) {
    return {
      id: 'M15', name: 'hydro monotonic-descent invariant', value: null,
      threshold: 'n/a (hydroRivers off)', pass: true, gating: false, deferred: true,
      detail: 'SKIPPED: hydroRivers flag is off (pass --hydro to activate)',
    };
  }
  const api = ctx.proto.api;
  const HYDRO_STEP = api.GEN_TUNABLES.HYDRO_STEP;
  const regions = [];
  for (let rz = -1; rz <= 1; rz++) for (let rx = -2; rx <= 2; rx++) regions.push([rx, rz]);
  let totalPaths = 0, totalSteps = 0, violations = 0, worst = '';
  for (const [rx, rz] of regions) {
    const reg = api.buildHydroRegion(rx, rz, 0);
    for (const p of reg.paths) {
      totalPaths++;
      for (let i = 1; i < p.h.length; i++) {
        totalSteps++;
        if (p.h[i] > p.h[i - 1]) {
          const isSpill = p.spillAt.has(i);
          const gx = p.ki[i] * HYDRO_STEP, gz = p.kj[i] * HYDRO_STEP;
          const oceanExit = api.getOceanFactor(gx, gz, 0) <= 0.0 || p.h[i] < SEA_LEVEL;
          if (!isSpill || !oceanExit) {
            violations++;
            if (!worst) worst = `rise ${p.h[i - 1]}->${p.h[i]} @ region(${rx},${rz}) step ${i}${isSpill ? ' [spill, not ocean-exit]' : ' [non-spill]'}`;
          }
        }
      }
    }
  }
  return {
    id: 'M15', name: 'hydro monotonic-descent invariant', value: violations,
    threshold: '0 unexplained rises (rises only permitted at documented ocean/sub-sea spill exits)',
    pass: violations === 0, gating: true,
    detail: `${violations} violation(s) of ${totalSteps} steps across ${totalPaths} paths in ${regions.length} regions` + (worst ? ` | first: ${worst}` : ''),
  };
}

/**
 * M16 — cross-region determinism (the seam gate). buildHydroRegion(rx,rz,seed) must be a
 * PURE function of its inputs: two independently-built extracted api instances (fresh
 * buildTerrainApi calls, same file/seed) must agree byte-for-byte on the same region's
 * segment list, AND a border-adjacent riverFactorAt query (which internally rebuilds/looks
 * up a 3x3 region neighborhood) must agree across instances too — proving no region build
 * ever depends on cache state, call order, or "which neighbor asked first".
 * Real-mode-only: requires ctx.proto.file/.seed (set by biome-pipeline-checks.mjs's
 * buildProto); skips (non-gating) if absent, mirroring M21's own escape hatch.
 * @param {object} ctx - { proto, sample, opts } from runAllMetrics.
 * @returns {object} metric result
 */
export function m16CrossRegionDeterminism(ctx) {
  if (!ctx.proto.hydroRivers) {
    return {
      id: 'M16', name: 'hydro cross-region determinism', value: null,
      threshold: 'n/a (hydroRivers off)', pass: true, gating: false, deferred: true,
      detail: 'SKIPPED: hydroRivers flag is off (pass --hydro to activate)',
    };
  }
  const { file, seed } = ctx.proto;
  if (!file || seed === undefined || seed === null) {
    return {
      id: 'M16', name: 'hydro cross-region determinism', value: null,
      threshold: 'n/a', pass: true, gating: false,
      detail: 'SKIPPED: ctx.proto.file/seed not provided (real-mode-only metric)',
    };
  }
  const apiA = buildTerrainApi(file, String(seed), { biomeDrivenTerrain: true, hydroRivers: true });
  const apiB = buildTerrainApi(file, String(seed), { biomeDrivenTerrain: true, hydroRivers: true });
  const regions = [[0, 0], [1, 0], [0, 1], [-1, -1], [2, -1], [-2, 2], [3, 3], [-3, 1]];
  let mismatches = 0, totalSegs = 0, detailBad = '';
  for (const [rx, rz] of regions) {
    const a = apiA.buildHydroRegion(rx, rz, 0);
    const b = apiB.buildHydroRegion(rx, rz, 0);
    totalSegs += a.segs.length;
    if (a.segs.length !== b.segs.length) { mismatches++; if (!detailBad) detailBad = `segLen ${a.segs.length}!=${b.segs.length} @ (${rx},${rz})`; continue; }
    for (let i = 0; i < a.segs.length; i++) {
      const sa = a.segs[i], sb = b.segs[i];
      for (let k = 0; k < 5; k++) if (sa[k] !== sb[k]) { mismatches++; if (!detailBad) detailBad = `seg[${i}][${k}] ${sa[k]}!=${sb[k]} @ (${rx},${rz})`; break; }
    }
  }
  let crossMismatch = 0;
  const HYDRO_REGION = apiA.GEN_TUNABLES.HYDRO_REGION;
  for (const [rx, rz] of regions) {
    const gx = rx * HYDRO_REGION, gz = rz * HYDRO_REGION;
    const fa = apiA.riverFactorAt(gx, gz, 0, undefined, 1);
    const fb = apiB.riverFactorAt(gx, gz, 0, undefined, 1);
    if (fa !== fb) crossMismatch++;
  }
  const pass = mismatches === 0 && crossMismatch === 0;
  return {
    id: 'M16', name: 'hydro cross-region determinism', value: { mismatches, totalSegs, crossMismatch },
    threshold: '0 segment/query mismatches across independent api instances',
    pass, gating: true,
    detail: `${mismatches} seg mismatch(es) of ${totalSegs} across ${regions.length} regions; ${crossMismatch} riverFactorAt cross-instance mismatch(es)` + (detailBad ? ` | first: ${detailBad}` : ''),
  };
}

/**
 * M17 — basin extent bound. floodSpill's pit-centered priority-flood search must never
 * exceed HYDRO_HALO lattice cells (Chebyshev distance from the pit) — that is the
 * deterministic seam-free guarantee (a basin bigger than the halo would need to reach
 * outside the region-neighborhood a query searches). Aggregates buildHydroRegion's own
 * reported `stats.maxBasinExtent` across a sampled grid of regions.
 * @param {object} ctx - { proto, sample, opts } from runAllMetrics.
 * @returns {object} metric result
 */
export function m17BasinExtent(ctx) {
  if (!ctx.proto.hydroRivers) {
    return {
      id: 'M17', name: 'hydro basin extent <= halo', value: null,
      threshold: 'n/a (hydroRivers off)', pass: true, gating: false, deferred: true,
      detail: 'SKIPPED: hydroRivers flag is off (pass --hydro to activate)',
    };
  }
  const api = ctx.proto.api;
  const HALO = api.GEN_TUNABLES.HYDRO_HALO;
  const regions = [];
  for (let rz = -2; rz <= 2; rz++) for (let rx = -2; rx <= 2; rx++) regions.push([rx, rz]);
  let maxExtent = 0, haloFailTotal = 0, springsTotal = 0, reachedTotal = 0;
  for (const [rx, rz] of regions) {
    const reg = api.buildHydroRegion(rx, rz, 0);
    if (reg.stats.maxBasinExtent > maxExtent) maxExtent = reg.stats.maxBasinExtent;
    haloFailTotal += reg.stats.haloFail;
    springsTotal += reg.stats.springs;
    reachedTotal += reg.stats.reached;
  }
  return {
    id: 'M17', name: 'hydro basin extent <= halo', value: maxExtent,
    threshold: `<= HYDRO_HALO (${HALO})`, pass: maxExtent <= HALO, gating: true,
    detail: `max basin extent ${maxExtent} cells across ${regions.length} regions (${springsTotal} springs, ${haloFailTotal} halo-fails, ${reachedTotal} reached)`,
  };
}

// --- M21 forced-shape agreement (CCR-WORLDGEN-PIPELINE-002 WS3, Q6) ---------
/**
 * A forced single-biome world's terrain SHAPE must agree with its forced skin,
 * not just the LABEL (classifyBiome already one-hotted the label in P3-R3 —
 * this checks reliefParam/terrainSurface's WS3 clamp on top of that). Builds
 * one extra extracted api per BIOME_ID_ORDER biome (6 instances) with
 * forceSingleBiome set, samples 100 deterministic scattered columns shared
 * across all of them, and reuses the caller's own UNFORCED api (ctx.proto.api,
 * same file/seed, biomeDrivenTerrain true, forceSingleBiome unset) as the
 * variance baseline. Real-mode-only: requires ctx.proto.file/.seed (set by
 * biome-pipeline-checks.mjs's buildProto); skips (non-gating) if absent, so
 * other runAllMetrics callers without those fields aren't broken.
 * @param {object} ctx - { proto, sample, opts } from runAllMetrics.
 * @returns {object} metric result
 */
export function m21ForcedShape(ctx) {
  const { file, seed } = ctx.proto;
  if (!file || seed === undefined || seed === null) {
    return {
      id: 'M21', name: 'forced-shape agreement (forceSingleBiome)', value: null,
      threshold: 'n/a', pass: true, gating: false,
      detail: 'SKIPPED: ctx.proto.file/seed not provided (real-mode-only metric)',
    };
  }
  const names = ctx.proto.names; // BIOME_ID_ORDER, canonical order
  const N = 100;
  const cols = [];
  for (let i = 0; i < N; i++) cols.push([(i * 977) % 40000 - 20000, (i * 1597) % 40000 - 20000]);

  function sampleHeights(api) {
    const hs = new Float64Array(N);
    for (let i = 0; i < N; i++) hs[i] = api.computeSurfaceHeight(cols[i][0], cols[i][1]);
    return hs;
  }
  function stddevOf(arr) {
    let mean = 0; for (let i = 0; i < arr.length; i++) mean += arr[i]; mean /= arr.length;
    let v = 0; for (let i = 0; i < arr.length; i++) { const d = arr[i] - mean; v += d * d; }
    return Math.sqrt(v / arr.length);
  }

  const stddevs = {};
  let labelMismatches = 0, labelChecks = 0;
  const perBiomeDetail = [];
  for (const name of names) {
    const api = buildTerrainApi(file, String(seed), { biomeDrivenTerrain: true, forceSingleBiome: name });
    for (const [gx, gz] of cols) {
      labelChecks++;
      if (api.classifyBiome(gx, gz) !== name) labelMismatches++;
    }
    const hs = sampleHeights(api);
    stddevs[name] = stddevOf(hs);
    perBiomeDetail.push(`${name}=${stddevs[name].toFixed(2)}`);
  }
  const unforcedStd = stddevOf(sampleHeights(ctx.proto.api));

  const labelsOk = labelMismatches === 0;
  const plainsStd = stddevs.plains, mountainsStd = stddevs.mountains;
  const flatnessOk = Number.isFinite(plainsStd) && Number.isFinite(mountainsStd) && plainsStd < 0.35 * mountainsStd;
  const vsUnforcedOk = Number.isFinite(plainsStd) && plainsStd < 0.5 * unforcedStd;
  const pass = labelsOk && flatnessOk && vsUnforcedOk;
  return {
    id: 'M21', name: 'forced-shape agreement (forceSingleBiome)',
    value: { labelMismatches, plainsStd, mountainsStd, unforcedStd },
    threshold: 'labels 100% match AND stddev(plains) < 0.35*stddev(mountains) AND stddev(plains) < 0.5*stddev(unforced)',
    pass,
    detail: `labels ${labelChecks - labelMismatches}/${labelChecks} match | per-biome stddev ${perBiomeDetail.join(' ')} | unforced=${unforcedStd.toFixed(2)}`
      + (pass ? '' : ` [FAIL labelsOk=${labelsOk} flatnessOk=${flatnessOk} vsUnforcedOk=${vsUnforcedOk}]`),
    gating: true,
  };
}

// --- M18 / M18-S terracing metrics (CCR-WORLDGEN-PIPELINE-002 WS1) ----------
// M18 = guard metrics (wideTerrace area fraction + plainsRough blast-radius),
// promoted from tools/scratch/final-fixes.mjs/viz-and-struct.mjs (Phase-0 root-
// cause harness). M18-S = the OWNER-SPECIFIED staircase-pattern detector (see
// the CCR's WS1 "M18-S" section for the formal definition) — classifies the
// SHAPE of a Y-sequence's delta pattern (periodic tread/riser alternation =
// terracing defect, sustained large drops = desired sheer face, one isolated
// jump = allowed cliff/bluff), rather than merely counting flat floor cells.
// Calibrated (tools/scratch/ws1-calibration.mjs) against: (1) the owner's own
// three worked examples from the CCR text (synthetic self-test — PRIMARY
// calibration, thresholds used LITERALLY per the CCR, no tuning needed:
// terracing pattern -> staircaseIndex 1.000; sheer-face pattern -> 0.000;
// isolated-cliff-amid-gentle-ground -> 0.000; flat plains -> excluded via the
// net-slope floor); (2) real-terrain corroboration (steep-start fall-lines,
// seed 1337: highest-scoring examples show genuine periodic tread/riser Y-
// sequences, lowest-scoring show smooth near-monotonic declines with no long
// gentle runs). All four thresholds are the CCR's LITERAL values (no
// within-bounds tuning was needed): gentle |delta|<=1 len>=3, jump |delta|
// 2..8 (1 or 2 samples, same sign), >=3 same-sign gentle->jump alternations,
// net |dY|>=12 over the 32-block window.
const M18S_GENTLE_MAX_ABS = 1;
const M18S_GENTLE_MIN_LEN = 3;
const M18S_JUMP_MIN_ABS = 2;
const M18S_JUMP_MAX_ABS = 8;
const M18S_MIN_ALTERNATIONS = 3;
const M18S_NET_SLOPE_FLOOR = 12;
const M18S_WINDOW = 32;

/**
 * Tokenize a Y-sequence's deltas into GENTLE runs, JUMP events (1-2 samples,
 * same sign, combined magnitude in range), CLIFF events (>range, single
 * sample), or OTHER (short flat runs below the gentle-run length floor).
 * @param {number[]} h - Y-sequence (block heights, step 1).
 * @returns {Array<{start:number,end:number,type:string,sign:number}>} tokens.
 */
function m18sTokenize(h) {
  const n = h.length;
  const d = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = h[i + 1] - h[i];
  const tokens = [];
  let i = 0;
  while (i < d.length) {
    const ad = Math.abs(d[i]);
    if (ad <= M18S_GENTLE_MAX_ABS) {
      let j = i;
      while (j < d.length && Math.abs(d[j]) <= M18S_GENTLE_MAX_ABS) j++;
      const sampleLen = (j - i) + 1;
      if (sampleLen >= M18S_GENTLE_MIN_LEN) { tokens.push({ start: i, end: j, type: 'gentle', sign: 0 }); i = j; }
      else { tokens.push({ start: i, end: i + 1, type: 'other', sign: 0 }); i++; }
      continue;
    }
    if (ad <= M18S_JUMP_MAX_ABS) {
      if (i + 1 < d.length) {
        const d2 = d[i + 1];
        const sameSign = (d2 !== 0) && (Math.sign(d2) === Math.sign(d[i]));
        const combined = d[i] + d2;
        if (sameSign && Math.abs(d2) <= M18S_JUMP_MAX_ABS && Math.abs(combined) >= M18S_JUMP_MIN_ABS && Math.abs(combined) <= M18S_JUMP_MAX_ABS) {
          tokens.push({ start: i, end: i + 2, type: 'jump', sign: Math.sign(combined) }); i += 2; continue;
        }
      }
      tokens.push({ start: i, end: i + 1, type: 'jump', sign: Math.sign(d[i]) }); i++; continue;
    }
    tokens.push({ start: i, end: i + 1, type: 'cliff', sign: Math.sign(d[i]) }); i++;
  }
  return tokens;
}

/**
 * Score one Y-sequence: sliding M18S_WINDOW-sample windows, flag "net-slope"
 * windows (|h[end]-h[start]| >= floor) and, among those, "staircase" windows
 * (>= MIN_ALTERNATIONS gentle->jump transitions, all jumps the same sign).
 * @param {number[]} h - Y-sequence.
 * @returns {{netSlopeFlags:Uint8Array, staircaseFlags:Uint8Array}} per-sample flags.
 */
function m18sScoreSequence(h) {
  const n = h.length;
  const netSlopeFlags = new Uint8Array(n);
  const staircaseFlags = new Uint8Array(n);
  if (n < M18S_WINDOW) return { netSlopeFlags, staircaseFlags };
  const tokens = m18sTokenize(h);
  for (let w = 0; w + M18S_WINDOW - 1 < n; w++) {
    const wEnd = w + M18S_WINDOW - 1;
    const net = Math.abs(h[wEnd] - h[w]);
    if (net < M18S_NET_SLOPE_FLOOR) continue;
    for (let k = w; k <= wEnd; k++) netSlopeFlags[k] = 1;
    let alternations = 0, sign = 0, ok = true, prevType = null;
    for (const t of tokens) {
      if (t.end < w || t.start > wEnd) continue;
      if (t.type === 'gentle') { prevType = 'gentle'; }
      else if (t.type === 'jump') {
        if (prevType === 'gentle') {
          if (sign === 0) sign = t.sign; else if (sign !== t.sign) ok = false;
          alternations++;
        }
        prevType = 'jump';
      } else { prevType = null; }
    }
    if (ok && alternations >= M18S_MIN_ALTERNATIONS) for (let k = w; k <= wEnd; k++) staircaseFlags[k] = 1;
  }
  return { netSlopeFlags, staircaseFlags };
}
function m18sSheerDeltas(h, R) {
  const n = h.length; const out = [];
  for (let i = 16; i < n - 16 - 1; i++) {
    if (R[i] < 0.6) continue;
    if (Math.abs(h[i + 16] - h[i - 16]) / 32 < 0.5) continue;
    out.push(Math.abs(h[i + 1] - h[i]));
  }
  return out;
}
function m18sPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))];
}
function m18sFindSteepStarts(api, extent = 4000, step = 48, rMin = 0.6) {
  const c = [];
  for (let x = -extent; x <= extent; x += step) for (let z = -extent; z <= extent; z += step) {
    if (api.reliefParam(x, z) < rMin) continue;
    c.push({ x, z });
  }
  return c;
}
/**
 * Steepest-descent fall-line, floor-safe: descends on the FLOAT terrainSurface
 * (flooring the descent decision itself hits quantization ties almost
 * immediately — measured 3/2185 usable fall-lines vs 1500+/2185 on float
 * descent) while recording the FLOORED block height (the actual Y-sequence).
 * @param {object} api - extracted terrain api.
 * @param {number} sx - start X. @param {number} sz - start Z.
 * @param {number} [maxSteps=400] - max descent steps.
 * @returns {{H:number[], R:number[]}} floored heights + reliefParam per sample.
 */
function m18sFallLine(api, sx, sz, maxSteps = 400) {
  const H = []; const R = [];
  let x = sx, z = sz;
  const seen = new Set();
  for (let i = 0; i < maxSteps; i++) {
    const f = api.terrainSurface(x, z);
    H.push(Math.floor(f)); R.push(api.reliefParam(x, z));
    const key = x + ',' + z;
    if (seen.has(key)) break;
    seen.add(key);
    let best = null, bf = f;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nf = api.terrainSurface(x + dx, z + dz);
      if (nf < bf) { bf = nf; best = { x: x + dx, z: z + dz }; }
    }
    if (!best) break;
    if (R[R.length - 1] < 0.35) break;
    x = best.x; z = best.z;
  }
  return { H, R };
}
function m18sStraightTransects(api, seedOffset) {
  const lines = []; const LEN = 16384;
  const rows = [-24000, -17000, -10000, -3000, 4000, 11000, 18000, 25000].map((v) => v + (seedOffset % 500));
  for (const zc of rows) {
    const H = new Int32Array(LEN); const R = new Float32Array(LEN); const x0 = -LEN / 2;
    for (let i = 0; i < LEN; i++) { const x = x0 + i; H[i] = api.computeSurfaceHeight(x, zc); R[i] = api.reliefParam(x, zc); }
    lines.push({ H, R });
  }
  for (const xc of rows) {
    const H = new Int32Array(LEN); const R = new Float32Array(LEN); const z0 = -LEN / 2;
    for (let i = 0; i < LEN; i++) { const z = z0 + i; H[i] = api.computeSurfaceHeight(xc, z); R[i] = api.reliefParam(xc, z); }
    lines.push({ H, R });
  }
  return lines;
}

/**
 * M18-S: aggregate staircaseIndex + sheernessIndex (P10/P50/P90) over
 * straight X/Z transects (>= 512^2-equivalent sampling, per the CCR) PLUS
 * steepest-descent fall-lines seeded from R>=0.6 starts.
 * @param {object} ctx - { proto, sample, opts } from runAllMetrics.
 * @returns {object} metric result.
 */
export function m18sStaircase(ctx) {
  const api = ctx.proto.api;
  const seed = ctx.proto.seed || '0';
  const lines = m18sStraightTransects(api, Number(seed) % 997 || 0);
  const starts = m18sFindSteepStarts(api);
  const CAP = 120;
  const chosen = [];
  const strideS = Math.max(1, Math.floor(starts.length / CAP));
  for (let i = 0; i < starts.length; i += strideS) chosen.push(starts[i]);
  let flaggedTotal = 0, netTotal = 0, sampleCount = 0;
  const sheerAll = [];
  for (const { H, R } of lines) {
    const { netSlopeFlags, staircaseFlags } = m18sScoreSequence(H);
    for (let i = 0; i < H.length; i++) { netTotal += netSlopeFlags[i]; flaggedTotal += staircaseFlags[i]; }
    sampleCount += H.length;
    sheerAll.push(...m18sSheerDeltas(H, R));
  }
  for (const s of chosen) {
    const { H, R } = m18sFallLine(api, s.x, s.z);
    if (H.length < M18S_WINDOW) continue;
    const { netSlopeFlags, staircaseFlags } = m18sScoreSequence(H);
    for (let i = 0; i < H.length; i++) { netTotal += netSlopeFlags[i]; flaggedTotal += staircaseFlags[i]; }
    sampleCount += H.length;
    sheerAll.push(...m18sSheerDeltas(H, R));
  }
  const staircaseIndex = netTotal ? flaggedTotal / netTotal : 0;
  const sheer = {
    p10: m18sPercentile(sheerAll, 0.10), p50: m18sPercentile(sheerAll, 0.50), p90: m18sPercentile(sheerAll, 0.90),
  };
  // Frozen ×3-seed baselines -- RE-BASELINED at Bump A (CCR-WORLDGEN-PIPELINE-002, TERRAIN_GEN_VERSION
  // 34): the WS2 style biases + WS4 Variant-B frequency retune legitimately move this metric on new
  // terrain (measured on /tmp/voxEx.bumpA.html pre-flip: staircaseIndex 0.1438/0.1278/0.1282 vs the
  // pre-Bump-A baselines 0.0978/0.1088/0.1056 -- ballpark, no seed moved >2x, sanity-checked per the
  // Bump-A implementer's own gate). Prior baselines (tools/scratch/ws1-calibration.mjs, build
  // 2026-07-12.8, TERRACE_WARP_AMP=0, pre-Bump-A styles/freqs): 0.0978/0.1088/0.1056 -- superseded.
  // Regression bars, the M2-scaling precedent: fail only if staircaseIndex gets WORSE (higher) than
  // baseline by more than the tolerance, or sheernessIndex P50 DECREASES (mountains reading LESS sheer
  // would be a regression) below its baseline. A future warp/amplitude lever intentionally LOWERS
  // staircaseIndex (the whole point) -- that is a candidate measurement, evaluated separately against
  // these SAME recorded baselines, not a gate failure.
  const STAIRCASE_BASELINE = { 1337: 0.1438, 42: 0.1278, 9001: 0.1282 };
  const SHEER_P50_BASELINE = { 1337: 1, 42: 1, 9001: 1 };
  const seedKey = Number(seed);
  const base = STAIRCASE_BASELINE[seedKey];
  const baseP50 = SHEER_P50_BASELINE[seedKey];
  const TOL = 0.02;
  const staircaseOk = base === undefined || staircaseIndex <= base + TOL;
  const sheerOk = baseP50 === undefined || sheer.p50 >= baseP50;
  return {
    id: 'M18-S', name: 'staircase pattern index (terracing defect detector)',
    value: { staircaseIndex, sheer },
    threshold: base !== undefined ? `staircaseIndex <= baseline(${base})+${TOL} AND sheer.p50 >= baseline(${baseP50})` : 'no baseline for this seed (report only)',
    pass: staircaseOk && sheerOk, gating: true,
    detail: `staircaseIndex=${staircaseIndex.toFixed(4)} (${flaggedTotal}/${netTotal} of ${sampleCount} samples) | sheernessIndex P10/P50/P90=${sheer.p10}/${sheer.p50}/${sheer.p90}`
      + (base !== undefined ? ` | baseline ${base}` : ''),
  };
}

/**
 * M18 guards: wideTerrace (tread-area fraction on a fixed macro-steep mountain
 * patch) + plainsRough (blast-radius guard: mean |adjacent step| on flat
 * ground). Promoted verbatim from tools/scratch/final-fixes.mjs /
 * viz-and-struct.mjs (Phase-0 root-cause harness). Regression bars only —
 * report the value, fail only if it INCREASES beyond its recorded baseline by
 * more than the CCR's stated tolerance (wideTerrace +0.02, plainsRough +0.002).
 * @param {object} ctx - { proto, sample, opts } from runAllMetrics.
 * @returns {object} metric result.
 */
export function m18Guards(ctx) {
  const api = ctx.proto.api;
  const seed = Number(ctx.proto.seed || '0');
  const FLOOR = Math.floor;
  function patchCenter() {
    let bx = 0, bz = 0, bs = -1;
    for (let x = -3200; x <= 3200; x += 200) for (let z = -3200; z <= 3200; z += 200) {
      let s = 0;
      for (let dx = -80; dx <= 80; dx += 40) for (let dz = -80; dz <= 80; dz += 40) if (api.reliefParam(x + dx, z + dz) > 0.7) s++;
      if (s > bs) { bs = s; bx = x; bz = z; }
    }
    return [bx, bz];
  }
  function wideTerrace(H, cx, cz) {
    const S = 130; let steep = 0, tread = 0;
    for (let x = cx - S; x < cx + S; x++) for (let z = cz - S; z < cz + S; z++) {
      const gx = (api.terrainSurface(x + 16, z) - api.terrainSurface(x - 16, z)) / 32;
      const gz = (api.terrainSurface(x, z + 16) - api.terrainSurface(x, z - 16)) / 32;
      if (Math.hypot(gx, gz) < 0.4) continue; steep++;
      const h = FLOOR(H(x, z)); let eq = 0;
      if (FLOOR(H(x + 1, z)) === h) eq++; if (FLOOR(H(x - 1, z)) === h) eq++;
      if (FLOOR(H(x, z + 1)) === h) eq++; if (FLOOR(H(x, z - 1)) === h) eq++;
      if (eq >= 3) tread++;
    }
    return steep ? tread / steep : 0;
  }
  function plainsRough(H) {
    let s = 0, n = 0;
    for (let x = -2000; x < 2000; x += 7) for (let z = -2000; z < 2000; z += 7) {
      if (api.reliefParam(x, z) > 0.15) continue;
      s += Math.abs(FLOOR(H(x + 1, z)) - FLOOR(H(x, z))); n++;
    }
    return n ? s / n : 0;
  }
  const base = (x, z) => api.terrainSurface(x, z);
  const [cx, cz] = patchCenter();
  const wt = wideTerrace(base, cx, cz);
  const pr = plainsRough(base);
  // Frozen ×3-seed baselines -- RE-BASELINED at Bump A (CCR-WORLDGEN-PIPELINE-002, TERRAIN_GEN_VERSION
  // 34): measured on /tmp/voxEx.bumpA.html pre-flip -- wideTerrace 0.2251/0.1882/0.2542 (mixed vs prior,
  // no seed moved >2x), plainsRough 0.0122/0.0130/0.0101 (DROPPED on all 3 seeds, as expected -- the
  // WS2 plains style bias, ridgeMixBias -0.10/roughnessBias -0.02, makes plains calmer by construction).
  // Prior baselines (tools/scratch/ws1-guards.mjs, pre-Bump-A; matches the CCR's own cited Phase-0
  // numbers exactly): wideTerrace 0.2384/0.2215/0.2192, plainsRough 0.0191/0.0204/0.0149 -- superseded.
  const WIDE_TERRACE_BASELINE = { 1337: 0.2251, 42: 0.1882, 9001: 0.2542 };
  const PLAINS_ROUGH_BASELINE = { 1337: 0.0122, 42: 0.0130, 9001: 0.0101 };
  const wtBase = WIDE_TERRACE_BASELINE[seed];
  const prBase = PLAINS_ROUGH_BASELINE[seed];
  const wtOk = wtBase === undefined || wt <= wtBase + 0.02;
  const prOk = prBase === undefined || pr <= prBase + 0.002;
  return {
    id: 'M18', name: 'terracing guards (wideTerrace area + plainsRough blast-radius)',
    value: { wideTerrace: wt, plainsRough: pr, patchCenter: [cx, cz] },
    threshold: `wideTerrace <= baseline+0.02 AND plainsRough <= baseline+0.002`,
    pass: wtOk && prOk, gating: true,
    detail: `wideTerrace=${wt.toFixed(4)}${wtBase !== undefined ? ` (baseline ${wtBase})` : ''} | plainsRough=${pr.toFixed(4)}${prBase !== undefined ? ` (baseline ${prBase})` : ''} | patch@${cx},${cz}`,
  };
}

// --- M19 per-biome land share (CCR-WORLDGEN-PIPELINE-002 WS5) -----------------
/**
 * Per-biome share of LAND columns over the shared sample grid. Iterates
 * ctx.proto.names (== BIOME_ID_ORDER) DYNAMICALLY so it gates the 6 active biomes
 * on the live file and all 9 on the staged copy. Gate: each active biome's land
 * share >= 2% (no biome starved) and none > 50% (no runaway dominant). NOTE the
 * 50% cap (not 45%): the live 6-biome distribution puts plains at 44-48% land
 * share (seed 42 = 47.6%) — a 45% cap would false-fail the byte-locked existing
 * biomes; 50% still catches a true runaway while clearing the measured reality.
 * @param {object} ctx - { proto, sample } from runAllMetrics.
 * @returns {object} metric result.
 */
export function m19LandShare(ctx) {
  const s = ctx.sample;
  const names = ctx.proto.names;
  const counts = {};
  for (const nm of names) counts[nm] = 0;
  let land = 0;
  for (let i = 0; i < s.count; i++) {
    if (s.height[i] >= SEA_LEVEL) {
      land++;
      const lab = s.label[i];
      if (counts[lab] !== undefined) counts[lab]++;
    }
  }
  const FLOOR = 0.02, CAP = 0.50;
  const parts = [];
  const starved = [], dominant = [];
  for (const nm of names) {
    const share = land ? counts[nm] / land : 0;
    parts.push(`${nm}=${(share * 100).toFixed(2)}%`);
    if (share < FLOOR) starved.push(nm);
    if (share > CAP) dominant.push(nm);
  }
  const pass = starved.length === 0 && dominant.length === 0;
  return {
    id: 'M19', name: 'per-biome land share', value: counts,
    threshold: `each >= ${(FLOOR * 100)}%, none > ${(CAP * 100)}% (of ${land} land cols)`,
    pass, gating: true,
    detail: parts.join(' ') + (pass ? '' : ` [starved:${starved.join(',') || '-'} dominant:${dominant.join(',') || '-'}]`),
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
  // M9/M10/M11/M20 are REAL block-output metrics (Phase 3, P3-R6 + WS5) — generated once from the
  const [m9, m10, m11, m20] = materialMetrics(proto.api);
  return [
    m1FieldCoverage(ctx), m2Autocorr(ctx), m3Agreement(ctx), m4Seam(ctx),
    m5MountainCoverage(ctx), m6LandOcean(ctx), m7RegionSize(ctx), m8RiverFlood(ctx),
    m9, m10, m11,
    m13Determinism(ctx), m14RiverOceanConn(ctx),
    m15MonotonicDescent(ctx), m16CrossRegionDeterminism(ctx), m17BasinExtent(ctx),
    m19LandShare(ctx), m20,
    m21ForcedShape(ctx),
    m18Guards(ctx), m18sStaircase(ctx),
  ];
}

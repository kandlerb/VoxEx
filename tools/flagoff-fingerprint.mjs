#!/usr/bin/env node
// ============================================================================
// flagoff-fingerprint.mjs — durable flag-OFF terrain fingerprint
// CCR-WORLDGEN-REGIONFIELD-001. Replaces the irreproducible CCR-002 token
// 22815f15…2de0 (that script was never preserved; its grid origin/step/
// serialization are unrecorded — see agent-notes §1 / project memory).
//
// Deterministic sha256 over the flag-OFF terrain surface so future CCRs have a
// STABLE regression token. Byte-identical refactors must leave the token
// unchanged. DO NOT change the grid/serialization below without minting (and
// recording) a new token — the value is only meaningful relative to this recipe.
//
// GRID (fixed): seeds [1337,42,9001]; origin (-2048,-2048), step 64, N=64/axis
//   => 4096 columns/seed covering [-2048 .. +1984]^2 (land, ocean, rivers).
// API: buildTerrainApi(file, seed) with NO opts = live flag-OFF defaults
//   (tectonicPlates OFF; hydroRivers/continentalOceans/biomeDrivenTerrain ON).
// PER COLUMN: computeSurfaceHeight (pre-carve int), Math.floor(blendedHeight)
//   (post-river-carve int), Math.round(getOceanFactor*1e6).
// SERIALIZATION: per seed `${seed};` + row-major (j outer, i inner) join of
//   `${h},${bh},${of}` with '|'; seeds joined by '\n'. TOKEN = sha256 hex.
//
// Usage: node tools/flagoff-fingerprint.mjs [path/to/voxEx.html]
// ============================================================================
import { buildTerrainApi } from './lib/extract-terrain.mjs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const file = process.argv[2] || fileURLToPath(new URL('../voxEx.html', import.meta.url));
const SEEDS = ['1337', '42', '9001'];
const ORIGIN = -2048, STEP = 64, N = 64;

let ser = '';
for (const s of SEEDS) {
  const api = buildTerrainApi(file, s); // flag-OFF (live defaults, tectonicPlates OFF)
  const parts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const gx = ORIGIN + i * STEP, gz = ORIGIN + j * STEP;
    const h = api.computeSurfaceHeight(gx, gz);
    const bh = Math.floor(api.blendedHeight(gx, gz, 0));
    const of = Math.round(api.getOceanFactor(gx, gz, 0) * 1e6);
    parts.push(`${h},${bh},${of}`);
  }
  ser += (ser ? '\n' : '') + s + ';' + parts.join('|');
}
const token = createHash('sha256').update(ser, 'utf8').digest('hex');
const cfg = buildTerrainApi(file, SEEDS[0]).worldConfig;
console.log(JSON.stringify({
  token,
  seeds: SEEDS, grid: { origin: ORIGIN, step: STEP, n: N },
  config: { tectonicPlates: cfg.tectonicPlates, hydroRivers: cfg.hydroRivers, continentalOceans: cfg.continentalOceans, biomeDrivenTerrain: cfg.biomeDrivenTerrain },
  serializedBytes: Buffer.byteLength(ser, 'utf8'),
}, null, 2));

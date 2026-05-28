const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
globalThis.window = { addEventListener: () => {} };
globalThis.document = {
    getElementById: () => ({innerHTML:'',appendChild:()=>{}}),
    createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})})
};
new Function(vizCode + `;
biomeCellCache.clear();
initNoise('orange');
const seed = workerNumericSeed;
const mb = BIOME_CONFIG.mountains;

console.log('seed value:', seed);

// Decompose mountainsHeightFunc at the cliff: z=-65 and z=-64, x=31
for (const gz of [-65, -64]) {
    const gx = 31;
    console.log('\\n=== z=' + gz + ' ===');

    // Domain warp
    const warpScale = 0.0015, warpStrength = 80;
    const warpX = gx + noise2D(gx * warpScale + seed, gz * warpScale) * warpStrength;
    const warpZ = gz + noise2D(gx * warpScale + 100, gz * warpScale + seed) * warpStrength;
    console.log('warpX=' + warpX.toFixed(2) + ' warpZ=' + warpZ.toFixed(2));

    // Regional variation
    const rn = noise2D(gx * 0.0006 + seed * 0.3, gz * 0.0006 - seed * 0.3);
    const rn2 = noise2D(gx * 0.001 + seed * 0.7, gz * 0.001 + seed * 0.2);
    const regionScale = 0.15 + Math.pow((rn + 1) * 0.5, 0.8) * 0.55 + Math.pow((rn2 + 1) * 0.5, 1.2) * 0.30;
    console.log('regionScale=' + regionScale.toFixed(4));

    // Main ridge
    const rx = warpX * mb.roughness, rz = warpZ * mb.roughness;
    let ridgeSum = 0, amp = 1.0, freq = 1.0;
    for (let i = 0; i < 6; i++) {
        const n = 1.0 - Math.abs(noise2D(rx * freq + seed * 10, rz * freq + seed * 10));
        const sharp = i < 2 ? 1.6 : 1.4;
        const ridgeVal = Math.pow(n, sharp) * amp;
        console.log('  octave ' + i + ': noise_input=(' + (rx*freq+seed*10).toFixed(2) + ',' + (rz*freq+seed*10).toFixed(2) + ') n=' + n.toFixed(4) + ' contribution=' + ridgeVal.toFixed(4));
        ridgeSum += ridgeVal;
        freq *= 2.0; amp *= 0.52;
    }
    ridgeSum /= 1.9;
    console.log('ridgeSum=' + ridgeSum.toFixed(4));

    // Peak amplification
    let peakRidge = ridgeSum;
    if (peakRidge > 0.5) peakRidge += Math.pow((peakRidge - 0.5) * 2.0, 3.0) * 0.4;
    if (peakRidge > 0.9) peakRidge += (peakRidge - 0.9) * 1.5;
    console.log('after peak amp=' + peakRidge.toFixed(4));

    // Edge falloff
    const cellX = Math.floor(gx / 64), cellZ = Math.floor(gz / 64);
    const lfZ = (gz / 64) - cellZ;
    console.log('cell=(' + cellX + ',' + cellZ + ') lfZ=' + lfZ.toFixed(4));

    // Final
    const h = mountainsHeightFunc(gx, gz, mb, seed);
    console.log('FINAL HEIGHT: ' + (h|0));
}

// Check: is noise2D continuous at the offending coordinates?
console.log('\\n=== noise2D continuity check around seed*10 offset ===');
const rx_test = 31 * 0.003; // rough approximation
for (let dz = -2; dz <= 2; dz++) {
    const gz = -64 + dz * 0.5;
    const rz_test = gz * 0.003;
    const n = noise2D(rx_test + seed * 10, rz_test + seed * 10);
    console.log('  gz=' + gz.toFixed(1) + ' noise=' + n.toFixed(6));
}
`)();

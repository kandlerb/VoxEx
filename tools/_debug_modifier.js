// What modifier is raising mountain cells relative to foothills cells?
const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
globalThis.window = { addEventListener: () => {} };
globalThis.document = {
    getElementById: () => ({innerHTML:'',appendChild:()=>{}}),
    createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},...{getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})}})
};
new Function(vizCode + `;
biomeCellCache.clear();
initNoise('orange');
const seed = workerNumericSeed;

// Find a mountain cell next to a foothills cell
// From earlier: cz=-2 = mountains, cz=-1 = foothills ring 1
const mountainCell = getBiomeCellValue(0, -2);
const foothillsCell = getBiomeCellValue(0, -1);
console.log('Mountain cell: baseHeight=' + mountainCell.baseHeight + ' amplitude=' + mountainCell.amplitude);
console.log('Foothills cell: baseHeight=' + foothillsCell.baseHeight + ' amplitude=' + foothillsCell.amplitude + ' ring=' + foothillsCell._foothillRing + ' ringFactor=' + foothillsCell._ringFactor);

// Pick a position in the middle of where both cells are sampled
const gx = 0, gz = -96; // Middle of mountain territory
const c = continentalHeight(gx, gz, seed);
console.log('');
console.log('At position (' + gx + ',' + gz + '):');
console.log('  continentalFactor c = ' + c.toFixed(4));
const factor = 0.3 + (c + 1) * 0.5 * 0.7;
console.log('  continental scaling factor = ' + factor.toFixed(4));

// What does mountainsHeightFunc produce at this position?
const mtnRawH = mountainsHeightFunc(gx, gz, BIOME_CONFIG.mountains, seed);
console.log('  mountainsHeightFunc raw output = ' + mtnRawH.toFixed(1));

// What does foothillsHeightFunc produce?
const fthRawH = foothillsHeightFunc(gx, gz, foothillsCell, seed);
console.log('  foothillsHeightFunc raw output = ' + fthRawH.toFixed(1));
console.log('  RAW gap (before getBiomeHeightAtCell): ' + (mtnRawH - fthRawH).toFixed(1));

// Now trace getBiomeHeightAtCell for EACH cell
console.log('');
console.log('=== getBiomeHeightAtCell decomposition ===');
for (const [label, cx, cz] of [['Mountain', 0, -2], ['Foothills', 0, -1]]) {
    const biome = getBiomeCellValue(cx, cz);
    const hf = HEIGHT_FUNCS[biome.name] || defaultHeightFunc;
    const rawH = hf(gx, gz, biome, seed);
    const t = (c + 1) * 0.5;
    const scaleFactor = 0.3 + t * 0.7;
    const scaled = biome.baseHeight + (rawH - biome.baseHeight) * scaleFactor;
    const boost = Math.max(0, c - 0.15) * 10;
    const final = scaled + boost;
    console.log(label + ' cell (' + cx + ',' + cz + '):');
    console.log('  biome.baseHeight = ' + biome.baseHeight);
    console.log('  heightFunc raw = ' + rawH.toFixed(1));
    console.log('  relief (raw - base) = ' + (rawH - biome.baseHeight).toFixed(1));
    console.log('  after continental scale = ' + scaled.toFixed(1) + ' (base + relief * ' + scaleFactor.toFixed(3) + ')');
    console.log('  continental boost = +' + boost.toFixed(1));
    console.log('  FINAL = ' + final.toFixed(1));
}

// Now check: what's the gap at multiple positions?
console.log('');
console.log('=== GAP between mountain and foothills getBiomeHeightAtCell at multiple positions ===');
for (let z = -120; z <= -40; z += 10) {
    const c = continentalHeight(0, z, seed);
    const mH = getBiomeHeightAtCell(0, -2, 0, z, seed, c);
    const fH = getBiomeHeightAtCell(0, -1, 0, z, seed, c);
    const gap = mH - fH;
    console.log('  z=' + z + ': mountain=' + Math.round(mH) + ' foothills=' + Math.round(fH) + ' GAP=' + Math.round(gap));
}

// The smoking gun: what mountainWeight would close this gap?
console.log('');
console.log('=== WHAT MOUNTAIN WEIGHT CLOSES THE GAP? ===');
for (const mw of [0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
    // Simulate foothillsHeightFunc with different weight
    const mtnH = mountainsHeightFunc(0, -96, BIOME_CONFIG.mountains, seed);
    const baseH = 70 + noise2D(0 * 0.005 + seed * 3, -96 * 0.005 - seed * 3) * 15;
    const simFthH = baseH + (mtnH - BIOME_CONFIG.mountains.baseHeight) * mw;

    // Apply getBiomeHeightAtCell continental scaling
    const c = continentalHeight(0, -96, seed);
    const t = (c + 1) * 0.5;
    const f = 0.3 + t * 0.7;
    const boost = Math.max(0, c - 0.15) * 10;

    const mtnScaled = BIOME_CONFIG.mountains.baseHeight + (mtnH - BIOME_CONFIG.mountains.baseHeight) * f + boost;
    const fthScaled = 70 + (simFthH - 70) * f + boost;
    const gap = mtnScaled - fthScaled;
    console.log('  mountainWeight=' + mw + ': mtn=' + Math.round(mtnScaled) + ' fth=' + Math.round(fthScaled) + ' gap=' + Math.round(gap));
}
`)();

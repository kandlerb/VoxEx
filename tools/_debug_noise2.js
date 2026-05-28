// Measure noise distribution over the SAME cells the biome-distribution test uses
const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
globalThis.window = { addEventListener: () => {} };
globalThis.document = { getElementById: () => ({innerHTML:'',appendChild:()=>{}}), createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})}) };

const diagCode = vizCode + `;
biomeCellCache.clear();
initNoise('orange');

// Sample raw noise from the same cells as the distribution test (-200..200, 160k cells)
const samples = [];
for (let cx = -200; cx < 200; cx++) {
    for (let cz = -200; cz < 200; cz++) {
        const raw = noise2D(cx * 0.1 + 1000, cz * 0.1 + 1000);
        samples.push((raw + 1) * 0.5);
    }
}
samples.sort((a, b) => a - b);

// Print empirical CDF at fine percentile steps
console.log('Empirical CDF over the 160k cell region:');
const checkpoints = [0.01, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99];
for (const p of checkpoints) {
    const idx = Math.floor(p * samples.length);
    const v = samples[idx];
    console.log('  ' + (p * 100).toFixed(0).padStart(2) + '% percentile: noise=' + v.toFixed(4));
}
console.log('');
console.log('Min: ' + samples[0].toFixed(4) + '  Max: ' + samples[samples.length-1].toFixed(4));
`;
new Function(diagCode)();

// Empirical distribution of the biome-selection noise
const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
globalThis.window = { addEventListener: () => {} };
globalThis.document = { getElementById: () => ({innerHTML:'',appendChild:()=>{}}), createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})}) };

const diagCode = vizCode + `;
biomeCellCache.clear();
initNoise('orange');

// Sample 100k normalized noise values
const bins = new Array(20).fill(0);
const N = 100000;
for (let i = 0; i < N; i++) {
    const cx = Math.floor(Math.random() * 1000 - 500);
    const cz = Math.floor(Math.random() * 1000 - 500);
    const raw = noise2D(cx * 0.1 + 1000, cz * 0.1 + 1000);
    const norm = (raw + 1) * 0.5;
    const bin = Math.min(19, Math.floor(norm * 20));
    bins[bin]++;
}
console.log('Distribution of (noise2D + 1) * 0.5 across 20 bins (each = 5% range):');
let cum = 0;
for (let i = 0; i < 20; i++) {
    const pct = (bins[i]/N*100).toFixed(2);
    cum += bins[i];
    const cumPct = (cum/N*100).toFixed(1);
    const bar = '#'.repeat(Math.round(bins[i]/N*200));
    console.log('  [' + (i*5).toString().padStart(3) + '-' + ((i+1)*5).toString().padStart(3) + '%]  ' + pct.padStart(5) + '%  cum=' + cumPct + '%  ' + bar);
}
`;
new Function(diagCode)();

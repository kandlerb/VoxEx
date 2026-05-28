// Verify uniformBiomeRoll output is uniformly distributed
const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
globalThis.window = { addEventListener: () => {} };
globalThis.document = { getElementById: () => ({innerHTML:'',appendChild:()=>{}}), createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})}) };

const diagCode = vizCode + `;
biomeCellCache.clear();
initNoise('orange');

const bins = new Array(20).fill(0);
const N = 160000;
let count = 0;
for (let cx = -200; cx < 200; cx++) {
    for (let cz = -200; cz < 200; cz++) {
        const u = uniformBiomeRoll(noise2D(cx * 0.1 + 1000, cz * 0.1 + 1000));
        const bin = Math.min(19, Math.floor(u * 20));
        bins[bin]++;
        count++;
    }
}
console.log('uniformBiomeRoll output across 20 bins (target: each ~5%):');
for (let i = 0; i < 20; i++) {
    const pct = (bins[i]/count*100).toFixed(2);
    const bar = '#'.repeat(Math.round(bins[i]/count*200));
    console.log('  [' + (i*5).toString().padStart(3) + '-' + ((i+1)*5).toString().padStart(3) + '%]  ' + pct.padStart(5) + '%  ' + bar);
}
`;
new Function(diagCode)();

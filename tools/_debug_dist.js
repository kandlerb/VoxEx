// Biome distribution sample over a 400x400 cell area
const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
globalThis.window = { addEventListener: () => {} };
globalThis.document = { getElementById: () => ({innerHTML:'',appendChild:()=>{}}), createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})}) };

const diagCode = vizCode + `;
biomeCellCache.clear();
initNoise('orange');
const counts = {};
const N = 200;
for (let cx = -N; cx < N; cx++) {
    for (let cz = -N; cz < N; cz++) {
        const b = getBiomeCellValue(cx, cz);
        counts[b.name] = (counts[b.name]||0) + 1;
    }
}
const total = (2*N)**2;
console.log('Biome distribution over '+total+' cells:');
for (const [k,v] of Object.entries(counts).sort((a,b)=>b[1]-a[1]))
    console.log('  '+k+': '+v+' ('+(v/total*100).toFixed(1)+'%)');
const mtn = counts.mountains||0, fh = counts.mountain_foothills||0;
console.log('Mountain:Foothill ratio = 1:' + (fh/mtn).toFixed(2));
`;
new Function(diagCode)();

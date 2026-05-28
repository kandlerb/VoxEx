// Trace raw pre-floor fh values at the worst mountain-internal jump
const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];

globalThis.window = { addEventListener: () => {} };
globalThis.document = {
    getElementById: () => ({innerHTML:'',appendChild:()=>{}}),
    createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})})
};

// Patch the visualizer to expose raw fh
const patchedViz = vizCode.replace(
    'return Math.floor(fh);',
    'return {h: Math.floor(fh), raw: fh, h00, h10, h01, h11};'
);

const diagCode = patchedViz + `;
biomeCellCache.clear();
initNoise('orange');
const seed = workerNumericSeed;

console.log('=== Raw float trace at (15, z) for z in [-80, -76] ===');
for (let z = -80; z <= -76; z++) {
    const r = blendedHeight(15, z, seed);
    console.log('  z='+z+'  h='+r.h+'  raw='+r.raw.toFixed(2)+'  corners=['+r.h00.toFixed(1)+','+r.h10.toFixed(1)+','+r.h01.toFixed(1)+','+r.h11.toFixed(1)+']');
}

console.log('');
console.log('=== Raw float trace at (15, z) for z in [-82, -74] (wider) ===');
let prev = null;
for (let z = -82; z <= -74; z++) {
    const r = blendedHeight(15, z, seed);
    const delta = prev !== null ? (r.raw - prev).toFixed(2) : '   -';
    console.log('  z='+z+'  raw='+r.raw.toFixed(2)+'  delta='+delta);
    prev = r.raw;
}
`;

new Function(diagCode)();

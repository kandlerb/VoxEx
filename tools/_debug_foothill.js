// Trace the 18-block jump at (183,99) inside foothills
const fs = require('fs');
const html = fs.readFileSync('tools/terrain-visualizer.html', 'utf8');
const vizCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];

globalThis.window = { addEventListener: () => {} };
globalThis.document = {
    getElementById: () => ({innerHTML:'',appendChild:()=>{}}),
    createElement: () => ({width:0,height:0,className:'',style:{},textContent:'',appendChild:()=>{},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})})
};

const diagCode = vizCode + `;
biomeCellCache.clear();
initNoise('orange');
const seed = workerNumericSeed;

const z = 99;
console.log('=== TRACE: x sweep at z='+z+' near worst jump (183,99) ===');
for (let x = 178; x <= 195; x++) {
    const cellX = Math.floor(x/64), cellZ = Math.floor(z/64);
    const b = getBiomeCellValue(cellX, cellZ);
    const b_e = getBiomeCellValue(cellX+1, cellZ);
    const h = blendedHeight(x, z, seed);
    console.log('  x='+x+' cell('+cellX+','+cellZ+') biome='+b.name+(b._ringFactor?' rf='+b._ringFactor.toFixed(3):'')+' h='+h+' east_cell='+b_e.name+(b_e._ringFactor?' rf='+b_e._ringFactor.toFixed(3):''));
}

console.log('');
console.log('=== TRACE: z sweep at x=184 near (184,99-101) ===');
for (let zz = 95; zz <= 105; zz++) {
    const cellX = Math.floor(184/64), cellZ = Math.floor(zz/64);
    const b = getBiomeCellValue(cellX, cellZ);
    const b_s = getBiomeCellValue(cellX, cellZ+1);
    const h = blendedHeight(184, zz, seed);
    console.log('  z='+zz+' cell('+cellX+','+cellZ+') biome='+b.name+(b._ringFactor?' rf='+b._ringFactor.toFixed(3):'')+' h='+h+' south_cell='+b_s.name+(b_s._ringFactor?' rf='+b_s._ringFactor.toFixed(3):''));
}

console.log('');
console.log('=== Surrounding cells around (183,99) ===');
const cx = Math.floor(183/64), cz = Math.floor(99/64);
console.log('  cell-center=('+cx+','+cz+') maps to gx='+(cx*64+32)+' gz='+(cz*64+32));
for (let dz = -2; dz <= 2; dz++) {
    let row = '  z='+(cz+dz)+': ';
    for (let dx = -2; dx <= 2; dx++) {
        const b = getBiomeCellValue(cx+dx, cz+dz);
        const tag = b.name === 'mountains' ? 'MTN' :
                    b.name === 'mountain_foothills' ? ('FH'+b._foothillRing+'@'+b._ringFactor.toFixed(2)) :
                    b.name.substring(0,3);
        row += tag.padEnd(11);
    }
    console.log(row);
}

// raw height of each foothill cell at (183,99)
console.log('');
console.log('=== Raw heightFunc outputs at (183,99) and (184,99) ===');
for (const gx of [183, 184]) {
    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
            const c = getBiomeCellValue(cx+dx, cz+dz);
            const hf = HEIGHT_FUNCS[c.name];
            const h = hf(gx, 99, c, seed);
            console.log('  gx='+gx+' sample cell('+(cx+dx)+','+(cz+dz)+')='+c.name+(c._ringFactor?' rf='+c._ringFactor.toFixed(2):'')+' rawH='+h.toFixed(1));
        }
    }
    console.log('');
}
`;

new Function(diagCode)();

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

// Check ALL neighbors of cells (0,-2) and (0,-1)
for (const [cellX, cellZ] of [[0, -2], [0, -1]]) {
    console.log('\\nCell (' + cellX + ',' + cellZ + '):');
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            const nb = getBiomeCellValue(cellX + dx, cellZ + dz);
            const isM = nb && nb.tags && nb.tags.includes("mountain");
            console.log('  neighbor (' + (cellX+dx) + ',' + (cellZ+dz) + ') = ' + nb.name + ' isMountain=' + isM);
        }
    }
}

// Now manually compute edge falloff for z=-65 (cell 0,-2, lfZ=0.984) and z=-64 (cell 0,-1, lfZ=0.000)
function computeEdgeFalloff(cellX, cellZ, lfX, lfZ) {
    let ef = 1.0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            const nb = getBiomeCellValue(cellX + dx, cellZ + dz);
            const isM = nb && nb.tags && nb.tags.includes("mountain");
            if (!isM) {
                let ed;
                if (dx === 0) ed = dz > 0 ? (1 - lfZ) : lfZ;
                else if (dz === 0) ed = dx > 0 ? (1 - lfX) : lfX;
                else ed = Math.min(dx > 0 ? (1 - lfX) : lfX, dz > 0 ? (1 - lfZ) : lfZ);
                const fs = 0.35;
                if (ed < fs) {
                    const t = ed / fs;
                    const smooth = t * t * (3 - 2 * t);
                    const lf = 0.25 + smooth * 0.75;
                    if (lf < ef) {
                        ef = lf;
                        console.log('    FALLOFF from (' + (cellX+dx) + ',' + (cellZ+dz) + ')=' + nb.name + ' edgeDist=' + ed.toFixed(4) + ' -> falloff=' + lf.toFixed(4));
                    }
                }
            }
        }
    }
    return ef;
}

const lfX_65 = (31/64) - Math.floor(31/64);
console.log('\\nz=-65: cell=(0,-2) lfX=' + lfX_65.toFixed(4) + ' lfZ=0.9844');
const ef65 = computeEdgeFalloff(0, -2, lfX_65, 0.984375);
console.log('  edgeFalloff = ' + ef65.toFixed(4));

console.log('\\nz=-64: cell=(0,-1) lfX=' + lfX_65.toFixed(4) + ' lfZ=0.0000');
const ef64 = computeEdgeFalloff(0, -1, lfX_65, 0.0);
console.log('  edgeFalloff = ' + ef64.toFixed(4));
`)();

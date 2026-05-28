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

// Find the worst single-block jump in mountainsHeightFunc raw output
console.log('=== SCANNING mountainsHeightFunc FOR DISCONTINUITIES ===');
let maxJump = 0, worstX = 0, worstZ = 0;

// X direction
for (let z = -200; z < 200; z++) {
    let prev = mountainsHeightFunc(-200, z, mb, seed);
    for (let x = -199; x < 200; x++) {
        const h = mountainsHeightFunc(x, z, mb, seed);
        const j = Math.abs(h - prev);
        if (j > maxJump) { maxJump = j; worstX = x; worstZ = z; }
        prev = h;
    }
}
// Z direction
for (let x = -200; x < 200; x++) {
    let prev = mountainsHeightFunc(x, -200, mb, seed);
    for (let z = -199; z < 200; z++) {
        const h = mountainsHeightFunc(x, z, mb, seed);
        const j = Math.abs(h - prev);
        if (j > maxJump) { maxJump = j; worstX = x; worstZ = z; }
        prev = h;
    }
}
console.log('Max single-block jump in mountainsHeightFunc: ' + (maxJump|0) + ' blocks');
console.log('At (' + worstX + ', ' + worstZ + ')');

// Trace the worst location
console.log('');
console.log('=== TRACE AROUND WORST JUMP ===');
for (let dz = -3; dz <= 3; dz++) {
    const gz = worstZ + dz;
    const h = mountainsHeightFunc(worstX, gz, mb, seed);
    console.log('  z=' + gz + ' height=' + (h|0));
}

// Now check: does this correlate with the EDGE FALLOFF?
console.log('');
console.log('=== EDGE FALLOFF AT WORST LOCATION ===');
for (let dz = -3; dz <= 3; dz++) {
    const gx = worstX, gz = worstZ + dz;
    const cellX = Math.floor(gx / 64), cellZ = Math.floor(gz / 64);
    const lfX = (gx / 64) - cellX, lfZ = (gz / 64) - cellZ;
    let edgeFalloff = 1.0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let ddz = -1; ddz <= 1; ddz++) {
            if (dx === 0 && ddz === 0) continue;
            const nb = getBiomeCellValue(cellX + dx, cellZ + ddz);
            const isM = nb && nb.tags && nb.tags.includes("mountain");
            if (!isM) {
                let ed;
                if (dx === 0) ed = ddz > 0 ? (1 - lfZ) : lfZ;
                else if (ddz === 0) ed = dx > 0 ? (1 - lfX) : lfX;
                else ed = Math.min(dx > 0 ? (1 - lfX) : lfX, ddz > 0 ? (1 - lfZ) : lfZ);
                if (ed < 0.35) {
                    const t = ed / 0.35;
                    const smooth = t * t * (3 - 2 * t);
                    edgeFalloff = Math.min(edgeFalloff, 0.25 + smooth * 0.75);
                }
            }
        }
    }
    const h = mountainsHeightFunc(gx, gz, mb, seed);
    console.log('  z=' + gz + ' cell=(' + cellX + ',' + cellZ + ') lfZ=' + lfZ.toFixed(3) + ' edgeFalloff=' + edgeFalloff.toFixed(3) + ' rawH=' + (h|0));
}

// Check: how many of all neighbors of the mountain cells at the cliff are actually non-mountain?
console.log('');
console.log('=== BIOME CELLS AROUND (30, -64) ===');
for (let cz = -3; cz <= 1; cz++) {
    let row = 'cz=' + cz + ': ';
    for (let cx = -2; cx <= 2; cx++) {
        const b = getBiomeCellValue(cx, cz);
        row += (b.name.substring(0,5) + '     ').substring(0,8);
    }
    console.log(row);
}

// Now the real question: is the jump in mountainsHeightFunc caused by the edge falloff
// changing between z=-65 and z=-64?
console.log('');
console.log('=== MOUNTAIN HEIGHT WITHOUT EDGE FALLOFF (disable it) ===');
// Temporarily check if the height func itself is continuous when edge falloff = 1.0
// The edge falloff is inside mountainsHeightFunc, we cant disable it without modifying code
// BUT we can check: if both z=-65 and z=-64 have edgeFalloff=1.0, the jump is in the noise
// If one has falloff and the other doesnt, that causes the cliff

`)();

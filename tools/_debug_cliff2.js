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
const gs = 64;

// Trace the exact cliff at (30, -64) in Z direction
console.log('=== DETAILED TRACE: z=-67 to z=-61, x=30 ===');
for (let z = -67; z <= -61; z++) {
    const gx = 30, gz = z;
    const c = continentalHeight(gx, gz, seed);
    const wX = noise2D(gx*0.003+seed*0.13,gz*0.003-seed*0.07)+noise2D(gx*0.012+seed*0.31,gz*0.012-seed*0.17)*0.5;
    const wZ = noise2D(gx*0.003-seed*0.19,gz*0.003+seed*0.11)+noise2D(gx*0.012-seed*0.43,gz*0.012+seed*0.29)*0.5;
    const u = gx/gs - 0.5 + wX, v = gz/gs - 0.5 + wZ;
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const wx = u-x0, wz = v-z0;
    const sx = wx*wx*(3-2*wx), sz = wz*wz*(3-2*wz);
    const h00 = getBiomeHeightAtCell(x0,z0,gx,gz,seed,c);
    const h10 = getBiomeHeightAtCell(x0+1,z0,gx,gz,seed,c);
    const h01 = getBiomeHeightAtCell(x0,z0+1,gx,gz,seed,c);
    const h11 = getBiomeHeightAtCell(x0+1,z0+1,gx,gz,seed,c);
    const b00 = getBiomeCellValue(x0,z0).name;
    const b10 = getBiomeCellValue(x0+1,z0).name;
    const b01 = getBiomeCellValue(x0,z0+1).name;
    const b11 = getBiomeCellValue(x0+1,z0+1).name;
    const h0 = h00+(h10-h00)*sx, h1 = h01+(h11-h01)*sx;
    const fh = h0 + (h1-h0)*sz;
    const bH = blendedHeight(gx,gz,seed);
    console.log('z='+gz+' v='+v.toFixed(4)+' floor_z='+z0+' wz='+wz.toFixed(4)+' sz='+sz.toFixed(4));
    console.log('  corners: ('+x0+','+z0+')='+b00+'='+Math.round(h00)+' ('+x0+','+z0+'+1)='+b01+'='+Math.round(h01));
    console.log('  interp: h0='+Math.round(h0)+' h1='+Math.round(h1)+' fh='+Math.round(fh)+' blended='+bH);
}

// Also: what exactly is mountainsHeightFunc returning at these positions?
console.log('');
console.log('=== mountainsHeightFunc output at z=-67 to z=-61, x=30 ===');
for (let z = -67; z <= -61; z++) {
    const mH = mountainsHeightFunc(30, z, BIOME_CONFIG.mountains, seed);
    const fBiome = getBiomeCellValue(0, Math.floor(z/64));
    let fH = '(not foothills)';
    if (fBiome.name === 'mountain_foothills') fH = foothillsHeightFunc(30, z, fBiome, seed) + '';
    console.log('z='+z+' mountainsH='+(mH|0)+' foothillsH='+fH+' cell_biome='+fBiome.name);
}

// Now check: what biome cells exist around z=-64?
console.log('');
console.log('=== BIOME CELL MAP around z=-64 ===');
for (let cz = -3; cz <= 0; cz++) {
    let row = 'cz='+cz+': ';
    for (let cx = -2; cx <= 1; cx++) {
        row += getBiomeCellValue(cx,cz).name.substring(0,4)+' ';
    }
    console.log(row);
}
`)();

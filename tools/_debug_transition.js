// Trace height across a full mountain -> foothills -> plains transition
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

// Find a line that crosses mountain -> foothills -> lowland
// From the biome map: mountains are around cells (-2,-2) to (1,-1), foothills ring around them
// Let's scan Z at x=0 from z=-200 to z=100

console.log('=== HEIGHT PROFILE: x=0, z=-200 to z=50 ===');
console.log('z, height, biome, cellZ');
let prev = blendedHeight(0, -200, seed);
let maxJump = 0;
for (let z = -200; z <= 50; z++) {
    const h = blendedHeight(0, z, seed);
    const cellZ = Math.floor(z / 64);
    const biome = getBiomeCellValue(0, cellZ).name;
    const jump = Math.abs(h - prev);
    const marker = jump > 10 ? ' <<< JUMP ' + jump : '';
    if (z % 4 === 0 || jump > 5) { // Print every 4th or if big jump
        console.log(z + ', ' + h + ', ' + biome.substring(0,8) + ', cz=' + cellZ + marker);
    }
    if (jump > maxJump) maxJump = jump;
    prev = h;
}
console.log('Max jump in profile: ' + maxJump);

// Also print biome cell boundaries clearly
console.log('');
console.log('=== BIOME CELLS along x=0 ===');
for (let cz = -4; cz <= 1; cz++) {
    const b = getBiomeCellValue(0, cz);
    console.log('  cz=' + cz + ' (z=' + (cz*64) + '..' + ((cz+1)*64-1) + '): ' + b.name + (b._foothillRing ? ' ring=' + b._foothillRing : ''));
}

// Now do a more detailed trace around the worst jump
console.log('');
console.log('=== DETAILED: every block around z=-64 (cell boundary) ===');
for (let z = -70; z <= -58; z++) {
    const h = blendedHeight(0, z, seed);
    const cellZ = Math.floor(z / 64);
    const biome = getBiomeCellValue(0, cellZ).name;
    const prevH = blendedHeight(0, z - 1, seed);
    const jump = h - prevH;
    console.log('z=' + z + ' h=' + h + ' biome=' + biome.substring(0,10) + ' delta=' + (jump > 0 ? '+' : '') + jump);
}
`)();

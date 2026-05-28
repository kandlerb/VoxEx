// Check: do adjacent chunks produce consistent heights at their shared edges?
// And: do height steps correlate with 16-block chunk boundaries vs 64-block cell boundaries?
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

// 1. Check height continuity at EVERY chunk boundary in a 256-block strip
console.log('=== HEIGHT JUMPS AT CHUNK BOUNDARIES (every 16 blocks) vs MID-CHUNK ===');
console.log('Scanning X direction at z=0...');
const chunkJumps = [];
const midJumps = [];
for (let x = -128; x < 128; x++) {
    const h1 = blendedHeight(x, 0, seed);
    const h2 = blendedHeight(x + 1, 0, seed);
    const jump = Math.abs(h2 - h1);
    if ((x + 1) % 16 === 0) chunkJumps.push({ x: x+1, jump, h1, h2 });
    else midJumps.push({ x: x+1, jump });
}

const avgChunkJump = chunkJumps.reduce((s, j) => s + j.jump, 0) / chunkJumps.length;
const avgMidJump = midJumps.reduce((s, j) => s + j.jump, 0) / midJumps.length;
const maxChunkJump = Math.max(...chunkJumps.map(j => j.jump));
const maxMidJump = Math.max(...midJumps.map(j => j.jump));

console.log('  At chunk boundaries (x%16==0): avg=' + avgChunkJump.toFixed(1) + ' max=' + maxChunkJump);
console.log('  Mid-chunk:                     avg=' + avgMidJump.toFixed(1) + ' max=' + maxMidJump);
console.log('  Chunk boundaries are ' + (avgChunkJump / avgMidJump).toFixed(1) + 'x worse than mid-chunk');

// 2. Check if cell boundaries (64) are worse than other chunk boundaries
const cellBoundaryJumps = chunkJumps.filter(j => j.x % 64 === 0);
const nonCellChunkJumps = chunkJumps.filter(j => j.x % 64 !== 0);
if (cellBoundaryJumps.length > 0) {
    console.log('');
    console.log('  At CELL boundaries (x%64==0): avg=' + (cellBoundaryJumps.reduce((s,j)=>s+j.jump,0)/cellBoundaryJumps.length).toFixed(1));
    console.log('  At non-cell chunk boundaries:  avg=' + (nonCellChunkJumps.reduce((s,j)=>s+j.jump,0)/nonCellChunkJumps.length).toFixed(1));
}

// 3. Do the same scan across Z at multiple X positions through mountain terrain
console.log('');
console.log('=== SCANNING THROUGH MOUNTAIN TERRAIN (multiple Z lines) ===');
for (const testZ of [0, -32, -64, -96, -128]) {
    let maxJ = 0, atX = 0;
    for (let x = -128; x < 127; x++) {
        const j = Math.abs(blendedHeight(x+1, testZ, seed) - blendedHeight(x, testZ, seed));
        if (j > maxJ) { maxJ = j; atX = x + 1; }
    }
    const biome = getBiomeCellValue(Math.floor(atX/64), Math.floor(testZ/64)).name;
    console.log('  z=' + testZ + ': maxJump=' + maxJ + ' at x=' + atX + ' (x%16=' + (atX%16) + ' x%64=' + (atX%64) + ') biome=' + biome);
}

// 4. THE KEY TEST: simulate what happens at chunk generation level
// Generate heights as two adjacent chunks would, check the shared edge
console.log('');
console.log('=== SIMULATING CHUNK GENERATION: adjacent chunks share edge ===');
const chunkSize = 16;
// Two adjacent chunks: cx=0 and cx=1, at cz=-1
const cx1 = 0, cx2 = 1, cz = -1;
const startX1 = cx1 * chunkSize, startX2 = cx2 * chunkSize;
const startZ = cz * chunkSize;

// Generate heightCaches like precalculateTerrainCaches would
const hc1 = new Int16Array(chunkSize * chunkSize);
const hc2 = new Int16Array(chunkSize * chunkSize);
for (let lz = 0; lz < chunkSize; lz++) {
    for (let lx = 0; lx < chunkSize; lx++) {
        hc1[lx + lz * chunkSize] = blendedHeight(startX1 + lx, startZ + lz, seed);
        hc2[lx + lz * chunkSize] = blendedHeight(startX2 + lx, startZ + lz, seed);
    }
}

// Compare right edge of chunk1 (lx=15) with left edge of chunk2 (lx=0)
let maxEdgeJump = 0;
console.log('  Chunk1 (' + cx1 + ',' + cz + ') right edge vs Chunk2 (' + cx2 + ',' + cz + ') left edge:');
for (let lz = 0; lz < chunkSize; lz++) {
    const h_right = hc1[15 + lz * chunkSize]; // rightmost column of chunk1
    const h_left = hc2[0 + lz * chunkSize];   // leftmost column of chunk2
    const jump = Math.abs(h_left - h_right);
    if (jump > 5) {
        const gz = startZ + lz;
        const biome1 = getBiomeCellValue(Math.floor((startX1+15)/64), Math.floor(gz/64)).name;
        const biome2 = getBiomeCellValue(Math.floor(startX2/64), Math.floor(gz/64)).name;
        console.log('    z=' + gz + ': chunk1=' + h_right + ' chunk2=' + h_left + ' jump=' + jump + ' biomes=' + biome1 + '/' + biome2);
    }
    if (jump > maxEdgeJump) maxEdgeJump = jump;
}
console.log('  Max edge jump: ' + maxEdgeJump);

// 5. Check: does blendedHeight give IDENTICAL results for the same (gx,gz)?
// The shared edge is at gx = startX2 = cx2 * 16
// Chunk1 would compute this as blendedHeight(startX1 + 16, startZ + lz) but it doesn't (lx only goes 0-15)
// Chunk2 computes blendedHeight(startX2 + 0, startZ + lz)
// But the RIGHT edge of chunk1 is gx = startX1 + 15, and LEFT edge of chunk2 is gx = startX2 + 0 = startX1 + 16
// These are ADJACENT blocks, not the same block. So any jump is from the terrain, not a computation mismatch.
console.log('');
console.log('=== VERIFY: blendedHeight is deterministic (same inputs = same output) ===');
biomeCellCache.clear();
const test1 = blendedHeight(30, -20, seed);
biomeCellCache.clear();
const test2 = blendedHeight(30, -20, seed);
console.log('  Same inputs: ' + test1 + ' vs ' + test2 + ' match=' + (test1 === test2));

// 6. Check the actual game's generateTerrainPass slope calculation
// At chunk edges, slope neighbors outside the chunk are SKIPPED (bounds check)
// This means edge blocks have lower detected slope -> different surface block
console.log('');
console.log('=== SLOPE CALCULATION AT CHUNK EDGES ===');
// Simulate: at chunk edge (lx=0), how many neighbors are checked vs interior (lx=8)?
const neighborOffsets = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
for (const testLx of [0, 1, 8, 14, 15]) {
    let validNeighbors = 0;
    for (const [dx, dz] of neighborOffsets) {
        const nx = testLx + dx, nz = 8 + dz; // test at lz=8 (middle)
        if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16) validNeighbors++;
    }
    console.log('  lx=' + testLx + ': ' + validNeighbors + '/8 neighbors checked' + (validNeighbors < 8 ? ' *** REDUCED' : ''));
}
`)();

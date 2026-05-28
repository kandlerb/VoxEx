// Diagnostic: node tools/_debug_cliff.js
// Analyzes mountain-foothills cliff from ORIGINAL voxEx.html (no modifications)
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

// Q1: Top jumps
const bigJumps = [];
for (let z = -200; z < 200; z++) {
    let prev = blendedHeight(-200, z, seed);
    for (let x = -199; x < 200; x++) {
        const h = blendedHeight(x, z, seed);
        const jump = Math.abs(h - prev);
        if (jump > 10) {
            const cx1 = Math.floor((x-1)/64), cx2 = Math.floor(x/64), cz = Math.floor(z/64);
            bigJumps.push({x,z,jump:jump|0,from:getBiomeCellValue(cx1,cz).name,to:getBiomeCellValue(cx2,cz).name,h:h|0,hPrev:prev|0});
        }
        prev = h;
    }
}
for (let x = -200; x < 200; x++) {
    let prev = blendedHeight(x, -200, seed);
    for (let z = -199; z < 200; z++) {
        const h = blendedHeight(x, z, seed);
        const jump = Math.abs(h - prev);
        if (jump > 10) {
            const cx = Math.floor(x/64), cz1 = Math.floor((z-1)/64), cz2 = Math.floor(z/64);
            bigJumps.push({x,z,jump:jump|0,from:getBiomeCellValue(cx,cz1).name,to:getBiomeCellValue(cx,cz2).name,h:h|0,hPrev:prev|0,dir:'Z'});
        }
        prev = h;
    }
}
bigJumps.sort((a,b) => b.jump - a.jump);

console.log('=== TOP 20 LARGEST JUMPS ===');
for (let i = 0; i < Math.min(20, bigJumps.length); i++) {
    const j = bigJumps[i];
    console.log('  '+j.jump+' blocks at ('+j.x+','+j.z+') '+j.from+' -> '+j.to+'  h:'+j.hPrev+'->'+j.h+(j.dir?' [Z]':''));
}

// Q2: By transition type
const byTrans = {};
for (const j of bigJumps) {
    const k = j.from+' -> '+j.to;
    if (!byTrans[k]) byTrans[k] = {count:0,max:0,sum:0};
    byTrans[k].count++; byTrans[k].max = Math.max(byTrans[k].max,j.jump); byTrans[k].sum += j.jump;
}
console.log('');
console.log('=== BY BIOME TRANSITION ===');
for (const [k,v] of Object.entries(byTrans).sort((a,b)=>b[1].max-a[1].max))
    console.log('  '+k+': count='+v.count+' max='+v.max+' avg='+(v.sum/v.count|0));

// Q3: Chunk boundary correlation
let atChunk=0;
for (const j of bigJumps) if(j.x%16===0||j.z%16===0) atChunk++;
console.log('');
console.log('=== CHUNK BOUNDARY CORRELATION ===');
console.log('  At chunk boundary: '+atChunk+'/'+bigJumps.length+' ('+(atChunk/bigJumps.length*100).toFixed(1)+'%)');
console.log('  Random expectation: ~6.25%');

// Q4: Cell boundary correlation
let atCell=0;
for (const j of bigJumps) if(j.x%64===0||j.z%64===0) atCell++;
console.log('');
console.log('=== BIOME CELL BOUNDARY CORRELATION ===');
console.log('  At cell boundary: '+atCell+'/'+bigJumps.length+' ('+(atCell/bigJumps.length*100).toFixed(1)+'%)');

// Q5: Raw height functions at known mountain->foothills boundary
console.log('');
console.log('=== RAW HEIGHT COMPARISON AT BOUNDARY ===');
for (let cx = -3; cx < 3; cx++) {
    for (let cz = -3; cz < 3; cz++) {
        if (getBiomeCellValue(cx,cz).name !== 'mountains') continue;
        const east = getBiomeCellValue(cx+1,cz);
        if (east.name !== 'mountain_foothills') continue;
        const bx = (cx+1)*64, tz = cz*64+32;
        console.log('Mountain('+cx+','+cz+') -> Foothills('+cx+'+1,'+cz+')  boundary x='+bx);
        console.log('  FH config: amp='+east.amplitude+' base='+east.baseHeight+' ring='+east._foothillRing+' rf='+east._ringFactor);
        for (let dx = -8; dx <= 8; dx++) {
            const gx = bx+dx;
            const mH = mountainsHeightFunc(gx,tz,BIOME_CONFIG.mountains,seed)|0;
            const fH = foothillsHeightFunc(gx,tz,east,seed)|0;
            const bH = blendedHeight(gx,tz,seed);
            console.log('    x='+gx+' mtn='+mH+' fth='+fH+' blended='+bH+' gap='+(mH-fH));
        }
        break;
    }
    break;
}

// Q6: Mountain-Mountain boundary (control test)
console.log('');
console.log('=== MOUNTAIN->MOUNTAIN BOUNDARY (control) ===');
for (let cx = -3; cx < 3; cx++) {
    for (let cz = -3; cz < 3; cz++) {
        if (getBiomeCellValue(cx,cz).name !== 'mountains') continue;
        if (getBiomeCellValue(cx+1,cz).name !== 'mountains') continue;
        const bx = (cx+1)*64, tz = cz*64+32;
        console.log('Mountain('+cx+','+cz+') -> Mountain('+(cx+1)+','+cz+')  boundary x='+bx);
        let maxJ = 0;
        let prev = blendedHeight(bx-5,tz,seed);
        for (let dx = -4; dx <= 5; dx++) {
            const h = blendedHeight(bx+dx,tz,seed);
            const j = Math.abs(h-prev);
            if (j>maxJ) maxJ=j;
            console.log('    x='+(bx+dx)+' h='+h+' jump='+j);
            prev = h;
        }
        console.log('  Max jump across boundary: '+maxJ);
        break;
    }
    break;
}

// Q7: Warped coordinates at the worst cliff
console.log('');
console.log('=== WARP TRACE AT WORST CLIFF ===');
if (bigJumps.length > 0) {
    const w = bigJumps[0];
    console.log('Worst: '+w.jump+' at ('+w.x+','+w.z+')');
    for (let d = -3; d <= 3; d++) {
        const gx=w.x+d, gz=w.z, gs=64;
        const wX = noise2D(gx*0.003+seed*0.13,gz*0.003-seed*0.07)+noise2D(gx*0.012+seed*0.31,gz*0.012-seed*0.17)*0.5;
        const wZ = noise2D(gx*0.003-seed*0.19,gz*0.003+seed*0.11)+noise2D(gx*0.012-seed*0.43,gz*0.012+seed*0.29)*0.5;
        const u=gx/gs-0.5+wX, v=gz/gs-0.5+wZ;
        const x0=Math.floor(u), z0=Math.floor(v);
        const h=blendedHeight(gx,gz,seed);
        console.log('  x='+gx+' u='+u.toFixed(3)+' v='+v.toFixed(3)+' floor=('+x0+','+z0+') h='+h+' wX='+wX.toFixed(3)+' wZ='+wZ.toFixed(3));
    }
}
`;

new Function(diagCode)();

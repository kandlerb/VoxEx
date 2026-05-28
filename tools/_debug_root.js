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
const mb = BIOME_CONFIG.mountains; // baseHeight=64, amplitude=180, roughness=0.003

// The cliff is at x=31, z=-65 -> z=-64
// mountainsHeightFunc returns 157 at z=-65 and 284 at z=-64
// But ridgeSum is nearly identical (~0.94). So something else differs.

// Manually decompose mountainsHeightFunc for BOTH positions, comparing EVERY value
for (const gz of [-65, -64]) {
    const gx = 31;
    console.log('\\n====== z=' + gz + ' ======');

    const warpScale = 0.0015, warpStrength = 80;
    const warpX = gx + noise2D(gx * warpScale + seed, gz * warpScale) * warpStrength;
    const warpZ = gz + noise2D(gx * warpScale + 100, gz * warpScale + seed) * warpStrength;
    console.log('warp: warpX=' + warpX.toFixed(4) + ' warpZ=' + warpZ.toFixed(4));

    const rn = noise2D(gx * 0.0006 + seed * 0.3, gz * 0.0006 - seed * 0.3);
    const rn2 = noise2D(gx * 0.001 + seed * 0.7, gz * 0.001 + seed * 0.2);
    const regionScale = 0.15 + Math.pow((rn + 1) * 0.5, 0.8) * 0.55 + Math.pow((rn2 + 1) * 0.5, 1.2) * 0.30;
    console.log('regionScale=' + regionScale.toFixed(6));

    const rx = warpX * mb.roughness, rz = warpZ * mb.roughness;
    let ridgeSum = 0, amp = 1.0, freq = 1.0;
    for (let i = 0; i < 6; i++) {
        let n = 1.0 - Math.abs(noise2D(rx * freq + seed * 10, rz * freq + seed * 10));
        const sharpness = i < 2 ? 1.6 : 1.4;
        n = Math.pow(n, sharpness);
        ridgeSum += n * amp;
        freq *= 2.0; amp *= 0.52;
    }
    ridgeSum /= 1.9;
    console.log('ridgeSum=' + ridgeSum.toFixed(6));

    if (ridgeSum > 0.5) ridgeSum += Math.pow((ridgeSum - 0.5) * 2.0, 3.0) * 0.4;
    if (ridgeSum > 0.9) ridgeSum += (ridgeSum - 0.9) * 1.5;
    console.log('after peak amp=' + ridgeSum.toFixed(6));

    // Jagged
    const jf = 0.08;
    const j1 = 1.0 - Math.abs(noise2D(gx * jf + seed * 30, gz * jf - seed * 30));
    const j2 = 1.0 - Math.abs(noise2D(gx * jf * 2.3 - seed * 17, gz * jf * 2.3 + seed * 13));
    const jaggedAmount = (Math.pow(j1, 1.8) * 0.12 + Math.pow(j2, 2.2) * 0.08) * (0.4 + ridgeSum * 0.6);
    console.log('jaggedAmount=' + jaggedAmount.toFixed(6));

    // Valley
    const vn = noise2D(gx * 0.003 + seed * 5, gz * 0.003 - seed * 5);
    const vn2 = noise2D(gx * 0.006 - seed * 2, gz * 0.006 + seed * 2);
    const valleyCarve = Math.max(0, -vn * 0.5 - vn2 * 0.3) * 0.35;
    console.log('valleyCarve=' + valleyCarve.toFixed(6));

    // Saddle
    const sn = noise2D(gx * 0.008 + seed * 8, gz * 0.008 - seed * 8);
    const saddleFactor = sn > 0.6 ? (sn - 0.6) * 0.5 : 0;
    console.log('saddleFactor=' + saddleFactor.toFixed(6));

    // Peak bonus
    const ptn = noise2D(gx * 0.004 + seed * 12, gz * 0.004 - seed * 12);
    let peakBonus = 0;
    if (ptn > 0.3 && ridgeSum > 0.55) {
        const sp = noise2D(gx * 0.02 + seed * 15, gz * 0.02 - seed * 15);
        if (sp > 0.45) peakBonus = Math.pow((sp - 0.45) * 1.8, 2.5) * 0.35;
    } else if (ptn < -0.3 && ridgeSum > 0.5) peakBonus = ridgeSum * 0.1;
    console.log('peakBonus=' + peakBonus.toFixed(6));

    // Cliff bands
    const preHeight = ridgeSum - valleyCarve - saddleFactor + peakBonus;
    const cbn = noise2D(gx * 0.05 + seed * 20, gz * 0.05);
    let cliffBonus = 0;
    if (preHeight > 0.35 && preHeight < 0.45 && cbn > 0.3) cliffBonus = (cbn - 0.3) * 0.08;
    else if (preHeight > 0.65 && preHeight < 0.75 && cbn > 0.2) cliffBonus = (cbn - 0.2) * 0.1;
    console.log('cliffBonus=' + cliffBonus.toFixed(6));

    // Erosion
    const en = noise2D(gx * 0.08 + seed * 3, gz * 0.08 - seed * 3);
    const en2 = noise2D(gx * 0.15 - seed * 4, gz * 0.15 + seed * 4);
    const en3 = noise2D(gx * 0.25 + seed * 7, gz * 0.25 - seed * 7);
    const erosionAmount = (Math.abs(en) * 0.05 + Math.abs(en2) * 0.03 + Math.abs(en3) * 0.02) * (0.4 + ridgeSum * 0.6);
    console.log('erosionAmount=' + erosionAmount.toFixed(6));

    // Gully
    const gn = 1.0 - Math.abs(noise2D(gx * 0.025 + seed * 25, gz * 0.025 - seed * 25));
    const gullyCarve = gn > 0.85 ? (gn - 0.85) * 0.15 : 0;
    console.log('gullyCarve=' + gullyCarve.toFixed(6));

    // Ridge connect
    const rc1 = 1.0 - Math.abs(noise2D(gx * 0.004 + seed * 40, gz * 0.004 - seed * 40));
    const rc2 = 1.0 - Math.abs(noise2D(gx * 0.008 - seed * 25, gz * 0.008 + seed * 35));
    const ridgeConnect = Math.pow(rc1, 2.0) * 0.12 * ridgeSum + Math.pow(rc2, 2.5) * 0.08 * ridgeSum;
    console.log('ridgeConnect=' + ridgeConnect.toFixed(6));

    // Edge falloff
    const cellX = Math.floor(gx / 64), cellZ = Math.floor(gz / 64);
    const lfX = (gx / 64) - cellX, lfZ = (gz / 64) - cellZ;
    let edgeFalloff = 1.0;
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
                if (ed < 0.35) {
                    const t = ed / 0.35;
                    const smooth = t * t * (3 - 2 * t);
                    const lf = 0.25 + smooth * 0.75;
                    edgeFalloff = Math.min(edgeFalloff, lf);
                }
            }
        }
    }
    console.log('edgeFalloff=' + edgeFalloff.toFixed(6) + ' cell=(' + cellX + ',' + cellZ + ') lfZ=' + lfZ.toFixed(4));

    // totalHeight
    let totalHeight = ridgeSum - valleyCarve - saddleFactor + peakBonus + cliffBonus + erosionAmount + jaggedAmount + ridgeConnect - gullyCarve;
    console.log('totalHeight BEFORE regionScale*edgeFalloff=' + totalHeight.toFixed(6));
    totalHeight *= regionScale;
    totalHeight *= edgeFalloff;
    console.log('totalHeight AFTER regionScale*edgeFalloff=' + totalHeight.toFixed(6));

    // Foothill transition
    const baseNoise = noise2D(gx * 0.002, gz * 0.002);
    const foothillBase = (baseNoise + 1) * 0.5 * 0.04;
    totalHeight = foothillBase + totalHeight * 0.96;
    console.log('totalHeight after foothill transition=' + totalHeight.toFixed(6));

    // Amplitude
    const amplitudeScale = mb._amplitudeScale ?? 1.0;
    const effectiveAmplitude = mb.amplitude * amplitudeScale;
    const rawHeight = mb.baseHeight + totalHeight * effectiveAmplitude;
    console.log('rawHeight=' + rawHeight.toFixed(2) + ' (baseHeight=' + mb.baseHeight + ' + ' + totalHeight.toFixed(4) + ' * ' + effectiveAmplitude + ')');
    const final = Math.min(Math.max(rawHeight, mb.baseHeight - 10), 285);
    console.log('FINAL (clamped)=' + final.toFixed(2));
}
`)();

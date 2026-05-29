# noise2D Isotropy Fix + Mountain Re-tune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-apply the missing `& 15` mask to both 2D Perlin `grad` copies (isotropic noise), then re-tune `mountainsHeightFunc` against the now-isotropic noise so mountains read as tamer, more natural ranges instead of spires/vertical walls.

**Architecture:** A tiny exact mechanical fix (one line in two byte-identical `grad` copies) wrapped in a measured empirical loop. Instrumentation lives in the existing real-code test harness (`tools/voxex-tests.html`) and reads the REAL terrain functions through the `?test=1` seam — never the stale copy-paste `terrain-visualizer.html`. The user's pre-fix build was acceptable along X, so the **old X-axis jaggedness profile is the tuning ceiling**: capture it before masking, then tune both axes to/below it.

**Tech Stack:** Plain browser JS (no build). Three.js r160 already loaded by `voxEx.html`. Headless verification on this Windows box (Python is NOT installed) uses Node 24 + the cached Playwright chromium-headless-shell driven over the Chrome DevTools Protocol, via three small scripts in the OS temp dir (recreated in Task 0). Nothing in `tools/_*` or temp is committed.

**Design spec:** `docs/superpowers/specs/2026-05-29-noise-isotropy-mountain-retune-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `voxEx.html` | The game. Two 2D `grad` copies (`:18926` worker template, `:21416` main) get `h &= 15`. `mountainsHeightFunc` (`:36416`) knobs get re-tuned. | Modify only these regions. No structural changes. |
| `tools/voxex-tests.html` | Real-code test harness. Gains a `mountainMetrics()` helper, a mountain cross-section render, a reporting panel, and (after tuning) one isotropy/traversability gate suite. | Modify (additive). |
| `docs/superpowers/plans/2026-05-29-noise-isotropy-mountain-retune.md` | This plan; gains recorded baseline numbers. | Modify (record measurements). |
| `docs/superpowers/plans/2026-05-29-voxex-test-coverage.md` | Holds the `## Findings` log; finding #14 gets a resolution note. | Modify (Task 8). |
| `%TEMP%/voxex-server.cjs`, `%TEMP%/cdp-eval.cjs`, `%TEMP%/cdp-run.cjs` | Headless tooling (server + JS-eval + suite-runner). | Recreate if absent (Task 0). Not committed. |

**Triage policy (carried from the test-coverage plan):** the mechanical mask and the metrics tooling are exact. The re-tune is creative. Do NOT change any game logic beyond the named `grad` mask and the named `mountainsHeightFunc` knobs. If the acceptance gates cannot be met by tuning those knobs, STOP and report — do not widen the blast radius.

---

## Task 0: Headless tooling setup (recreate if absent)

**Files:**
- Create (in OS temp, not committed): `%TEMP%/voxex-server.cjs`, `%TEMP%/cdp-eval.cjs`, `%TEMP%/cdp-run.cjs`

These may already exist from the prior session. Recreate them so later tasks have stable commands. `%TEMP%` is `C:\Users\kandl\AppData\Local\Temp` (bash: `$(cygpath "$TEMP")` or `/c/Users/kandl/AppData/Local/Temp`).

- [ ] **Step 1: Write the static server**

Write `/c/Users/kandl/AppData/Local/Temp/voxex-server.cjs`:

```js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve('D:/Projects/voxex');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.resolve(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found: ' + p); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8080, () => console.log('VoxEx static server on http://localhost:8080'));
```

- [ ] **Step 2: Write the CDP eval runner**

Write `/c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs` (navigates to a URL, evaluates one JS expression with `awaitPromise`, prints the JSON value):

```js
const { spawn } = require('child_process');
const os=require('os'),path=require('path'),fs=require('fs');
const CHROME='C:/Users/kandl/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe';
const URL_ARG=process.argv[2], EXPR=process.argv[3], PORT=9224;
const udir=fs.mkdtempSync(path.join(os.tmpdir(),'cdpe-'));
const chrome=spawn(CHROME,['--headless','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+udir,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let nid=1,ws;const pend=new Map();
function send(m,p={}){const id=nid++;ws.send(JSON.stringify({id,method:m,params:p}));return new Promise(r=>pend.set(id,r));}
(async()=>{let u;for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const t=await r.json();const pg=t.find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break;}}catch(e){}await sleep(200);}
ws=new WebSocket(u);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:URL_ARG});
await sleep(3000);
const r=await send('Runtime.evaluate',{expression:EXPR,returnByValue:true,awaitPromise:true});
console.log(JSON.stringify(r.result&&r.result.value!==undefined?r.result.value:r,null,2));
if(r.exceptionDetails)console.log('EXC:',JSON.stringify(r.exceptionDetails.exception));
ws.close();chrome.kill();process.exit(0);})().catch(e=>{console.log('ERR',e.message);try{chrome.kill()}catch{}process.exit(1)});
```

- [ ] **Step 3: Write the CDP suite runner**

Write `/c/Users/kandl/AppData/Local/Temp/cdp-run.cjs` (navigates, waits for a ready selector, then scrapes the summary + any failing suites/tests + page errors):

```js
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');
const CHROME = 'C:/Users/kandl/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe';
const URL_ARG = process.argv[2];
const READY_SEL = process.argv[3] || '#summary .summary';
const TIMEOUT = parseInt(process.argv[4] || '40000', 10);
const PORT = 9223;
const udir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, ['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port='+PORT, '--user-data-dir='+udir, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let nextId = 1, ws; const pending = new Map();
function send(method, params={}) { const id = nextId++; ws.send(JSON.stringify({id,method,params})); return new Promise(res=>pending.set(id,res)); }
const FAIL_EXPR = `(()=>{const sum=(document.querySelector('#summary')||{}).innerText||'';const fails=[...document.querySelectorAll('.suite.fail')].map(s=>{const title=(s.querySelector('.suite-title')||{}).innerText||'';const items=[...s.querySelectorAll('.test.fail')].map(t=>{const d=t.nextElementSibling&&t.nextElementSibling.classList.contains('test-detail')?t.nextElementSibling.innerText:'';return '  FAIL '+t.innerText+(d?' :: '+d:'');});return title+String.fromCharCode(10)+items.join(String.fromCharCode(10));}).join(String.fromCharCode(10)+String.fromCharCode(10));return sum+String.fromCharCode(10)+'=== FAILURES ==='+String.fromCharCode(10)+(fails||'(none)');})()`;
(async () => {
  let wsUrl;
  for (let i=0;i<50;i++){ try { const r=await fetch(`http://127.0.0.1:${PORT}/json`); const t=await r.json();
    const pg=t.find(x=>x.type==='page'); if(pg){wsUrl=pg.webSocketDebuggerUrl;break;} } catch(e){} await sleep(200); }
  if(!wsUrl){ console.log('ERR: no CDP target'); chrome.kill(); process.exit(1); }
  const errors=[]; ws = new WebSocket(wsUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data);
    if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
    else if(m.method==='Runtime.exceptionThrown'){ errors.push('EXC: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)); }
    else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'){ errors.push('LOG: '+m.params.entry.text); }
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate',{url:URL_ARG});
  const deadline=Date.now()+TIMEOUT; let txt='';
  while(Date.now()<deadline){ await sleep(300);
    const r=await send('Runtime.evaluate',{expression:`(document.querySelector(${JSON.stringify(READY_SEL)})||{}).innerText||''`,returnByValue:true});
    txt=r.result&&r.result.value||''; if(txt.trim())break; }
  const full=await send('Runtime.evaluate',{expression:FAIL_EXPR,returnByValue:true});
  console.log(full.result.value||txt||'(no summary)');
  if(errors.length){ console.log('=== PAGE ERRORS ==='); errors.slice(0,20).forEach(e=>console.log(e)); }
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e=>{console.log('RUNNER ERR',e.message);try{chrome.kill()}catch{}process.exit(1)});
```

- [ ] **Step 4: Start the server (leave running) and smoke-test eval**

```bash
node /c/Users/kandl/AppData/Local/Temp/voxex-server.cjs &
sleep 1
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/voxEx.html?test=1" "typeof window.VoxEx + ':' + (window.VoxEx && typeof window.VoxEx.mountainsHeightFunc)"
```
Expected output: `"object:function"` — confirms the server serves and the seam exposes the real `mountainsHeightFunc`.

No commit (tooling is not tracked).

---

## Task 1: Add real-code mountain metrics + cross-section to the harness

**Files:**
- Modify: `tools/voxex-tests.html` (add helpers near `renderTerrainVisualizations`, ~line 725; add a results panel container in the HTML body; call the render at the end of `runAllTests`)

This task only ADDS reporting (no pass/fail gate yet — pre-mask the asymmetry is 6–18× by design). It uses the real `mountainsHeightFunc` via the seam locals already destructured in `runAllTests`.

- [ ] **Step 1: Add the `mountainMetrics` helper**

Add this function in the `<script>` near `renderTerrainVisualizations` (it reads `VoxEx`, which is module-global in the harness after bootstrap):

```js
// Real-code mountain metrics via the ?test=1 seam. Floors heights to match
// in-game block steps (blendedHeight floors; the player sees integer columns).
// Returns per-axis single-block step stats, peak stats, and the X/Z asymmetry
// ratio (mean Z step / mean X step). Pure: re-seeds with a throwaway rng.
function mountainMetrics(seedStr, N = 384) {
    const { mountainsHeightFunc, BIOME_CONFIG, seedNoise } = VoxEx;
    seedNoise(seedStr);
    const sd = VoxEx.worldSeed;
    const biome = BIOME_CONFIG.mountains;
    const H = (gx, gz) => Math.floor(mountainsHeightFunc(gx, gz, biome, sd));
    const xSteps = [], zSteps = [], peaks = [];
    for (let gz = 0; gz < N; gz += 8) {           // X-axis steps along rows
        let prev = H(0, gz);
        for (let gx = 1; gx < N; gx++) { const h = H(gx, gz); xSteps.push(Math.abs(h - prev)); peaks.push(h); prev = h; }
    }
    for (let gx = 0; gx < N; gx += 8) {           // Z-axis steps along columns
        let prev = H(gx, 0);
        for (let gz = 1; gz < N; gz++) { const h = H(gx, gz); zSteps.push(Math.abs(h - prev)); prev = h; }
    }
    const stats = (arr) => {
        const s = arr.slice().sort((a, b) => a - b);
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return { mean, p99: s[Math.floor(s.length * 0.99)], max: s[s.length - 1], pctOver3: arr.filter(v => v > 3).length / arr.length };
    };
    const x = stats(xSteps), z = stats(zSteps);
    const ps = peaks.slice().sort((a, b) => a - b);
    return { seed: seedStr, xStep: x, zStep: z, asymmetry: z.mean / x.mean, peakP99: ps[Math.floor(ps.length * 0.99)], peakMax: ps[ps.length - 1] };
}
window.mountainMetrics = mountainMetrics;   // expose for headless cdp-eval
```

- [ ] **Step 2: Add the cross-section render**

Add this function (draws X-profile and Z-profile of `mountainsHeightFunc` along a center line, side by side — reveals spires/walls top-down shading hides):

```js
function renderMountainCrossSection(seedStr, mount) {
    const { mountainsHeightFunc, BIOME_CONFIG, seedNoise } = VoxEx;
    seedNoise(seedStr); const sd = VoxEx.worldSeed; const biome = BIOME_CONFIG.mountains;
    const W = 512, Hpx = 200;
    const xs = [], zs = [];
    for (let i = 0; i < W; i++) { xs.push(mountainsHeightFunc(i, 0, biome, sd)); zs.push(mountainsHeightFunc(0, i, biome, sd)); }
    const all = xs.concat(zs); const mn = Math.min(...all), mx = Math.max(...all), rng = (mx - mn) || 1;
    for (const [label, arr, color] of [["X profile", xs, "#4caf50"], ["Z profile", zs, "#ff9800"]]) {
        const c = document.createElement('canvas'); c.width = W; c.height = Hpx; c.style.cssText = 'border:1px solid #444;border-radius:4px;margin:4px';
        const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, W, Hpx);
        g.strokeStyle = color; g.beginPath();
        for (let i = 0; i < W; i++) { const y = Hpx - ((arr[i] - mn) / rng) * (Hpx - 10) - 5; if (i === 0) g.moveTo(i, y); else g.lineTo(i, y); }
        g.stroke();
        g.fillStyle = '#ccc'; g.font = '12px monospace'; g.fillText(`${label} (seed ${seedStr}, ${mn.toFixed(0)}-${mx.toFixed(0)})`, 6, 14);
        mount.appendChild(c);
    }
}
```

- [ ] **Step 3: Add a results panel and wire it into `runAllTests`**

In the HTML body, after the `terrain-viz-container` element, add:
```html
<div id="mountain-tuning-panel" style="margin-top:16px"></div>
```
At the END of `runAllTests` (right after `renderTerrainVisualizations();`, line ~719), add:
```js
    renderMountainTuning();
```
And add the render function next to the others:
```js
function renderMountainTuning() {
    const panel = document.getElementById('mountain-tuning-panel');
    panel.innerHTML = '<h2 style="color:#4caf50;margin:16px 0 8px">Mountain Tuning Metrics</h2>';
    const seeds = ["alpha", "bravo", "12345", "test_seed_42", "ridgetest"];
    const rows = seeds.map(s => mountainMetrics(s));
    const pre = document.createElement('pre');
    pre.style.cssText = 'background:#1a1a1a;color:#bdf;padding:10px;border-radius:6px;font-size:12px;overflow:auto';
    pre.textContent = rows.map(m =>
        `${m.seed.padEnd(14)} asym=${m.asymmetry.toFixed(2)}  Xmean=${m.xStep.mean.toFixed(3)} Zmean=${m.zStep.mean.toFixed(3)}  ` +
        `Xp99=${m.xStep.p99} Zp99=${m.zStep.p99}  X>3=${(m.xStep.pctOver3*100).toFixed(1)}% Z>3=${(m.zStep.pctOver3*100).toFixed(1)}%  ` +
        `peakP99=${m.peakP99} peakMax=${m.peakMax}`).join('\n');
    panel.appendChild(pre);
    const cs = document.createElement('div'); cs.style.cssText = 'display:flex;flex-wrap:wrap;margin-top:8px';
    renderMountainCrossSection("test_seed_42", cs); renderMountainCrossSection("ridgetest", cs);
    panel.appendChild(cs);
}
```

- [ ] **Step 4: Run the harness headless and confirm the panel renders**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#mountain-tuning-panel pre" 45000
```
(All three scripts were created in Task 0.) This confirms the suite still runs and the panel populated.

Then read the metric numbers directly:
```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/tools/voxex-tests.html" "new Promise(r=>{const t=setInterval(()=>{if(window.mountainMetrics){clearInterval(t);r(['alpha','test_seed_42'].map(s=>window.mountainMetrics(s)));}},300);})"
```
Expected: JSON for two seeds, each with `asymmetry` between roughly **6 and 18** (the anisotropy, still present — mask not applied yet), finite `xStep`/`zStep`/`peak` numbers. This proves the metrics read real code and the anisotropy is measurable.

- [ ] **Step 5: Commit**

```bash
git add tools/voxex-tests.html
git commit -m "Add real-code mountain metrics + cross-section panel to harness"
```

---

## Task 2: Capture and record the pre-mask anisotropic baseline

**Files:**
- Modify: this plan file (record numbers in the "Baseline (pre-mask)" block below)

This is the critical measurement: the user accepted the X axis, so **mean X step is the tuning ceiling.** Capture it BEFORE masking.

- [ ] **Step 1: Read metrics for all five seeds (headless)**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/tools/voxex-tests.html" "new Promise(r=>{const t=setInterval(()=>{if(window.mountainMetrics){clearInterval(t);r(['alpha','bravo','12345','test_seed_42','ridgetest'].map(s=>window.mountainMetrics(s)));}},300);})"
```

- [ ] **Step 2: Compute the old-X ceiling**

From the output, take `xStep.mean` across the five seeds. Record the **maximum** `xStep.mean` (the most generous tolerated value) as `OLD_X_CEILING`, and note the per-seed `xStep.p99` and `xStep.pctOver3` too — these define "acceptable jaggedness along X" that both axes must meet after tuning.

- [ ] **Step 3: Record the baseline in this plan**

Fill in the block below (replace the dashes with the measured numbers) and commit. This block is the source of truth for the gate constants in Task 5.

```
### Baseline (pre-mask) — RECORDED 2026-05-29 (current reverted/buggy noise)
seed          asym   Xmean  Zmean  Xp99  Zp99  X>3%   Z>3%   peakP99 peakMax
alpha         2.13   1.141  2.428  6     12    7.7    28.7   285     285
bravo         2.16   0.929  2.003  5     10    3.4    19.7   285     285
12345         1.73   1.312  2.271  6     10    7.9    22.3   285     285
test_seed_42  1.67   1.213  2.028  6     8     5.8    17.6   285     285
ridgetest     1.82   1.378  2.514  6     10    8.0    27.4   285     285

OLD_X_CEILING      (max xStep.mean across seeds) = 1.378
OLD_X_P99_CEILING  (max xStep.p99  across seeds) = 6
OLD_X_OVER3_CEILING(max xStep.pctOver3, %)       = 8.0
```

#### Reconciliation note (IMPORTANT — corrects finding #14's framing)

Finding #14 documented "6–18× jaggier along Z" and "raw noise2D X=0.005 vs Z=0.076 (~15×)".
On a consistent finite-difference instrument the **current** reverted code measures:
- raw `noise2D` mean-step asymmetry ≈ **2.5×** (f=0.1: X=0.027, Z=0.069);
- `mountainsHeightFunc` **mean**-step asymmetry ≈ **1.7–2.2×** (floored == unfloored).

The "6–18×" was a **tail/large-jump count**, not a mean (the finding's own "28 X-jumps vs 1216
Z-jumps" is a count of large steps). The tail asymmetry IS large: ~18–29% of Z steps exceed 3
blocks vs ~3–8% along X (the visible "dropping along Z"). The bug doesn't make X perfectly flat
because bilinear interpolation still mixes the ±y corner gradients along X. **Methodology is
unaffected** — we anchor to the old-X profile and tune both axes to/below it; absolute ratio is
irrelevant.

Also notable: **peakP99 == peakMax == 285 for every seed** — mountains saturate at the
`Math.min(rawHeight, 285)` clamp (voxEx.html:36557). ≥1% of columns are flat-topped at the ceiling
(amplitude 180 + baseHeight 64 + peak-amplification overshoots the clamp). The re-tune should
reduce this saturation as a side effect of softening peak amplification.

#### Post-mask (pre-tune) — RECORDED 2026-05-29 (after `h &= 15` on both grad copies; suite 193/193)
```
seed          asym   Xmean  Zmean  Xp99  Zp99  X>3%   Z>3%   peakMax
alpha         1.05   1.995  2.089  9     9     17.5   18.8   285
bravo         1.00   2.148  2.143  9     9     20.7   20.6   285
12345         1.05   1.947  2.053  9     9     15.8   17.7   285
test_seed_42  1.03   1.850  1.910  8     8     14.4   15.5   285
ridgetest     0.99   1.769  1.743  10    9     11.8   11.2   285
```
Isotropy achieved (asym ≈ 1). The mask pulled X UP (mean 1.1–1.4 → 1.8–2.1) and Z slightly down;
**both axes now exceed the old-X ceiling** (mean 1.378 / p99 6 / over3 8%). Re-tune target: cut
both axes' mean step ~35% and over3 ~½ to reach the old-X profile, holding asym ≈ 1. Peaks still
clamp-saturate at 285.

#### Post-tune (pass 1) — RECORDED 2026-05-29 (suite 193/193; meets all gates)
Knobs changed in `mountainsHeightFunc`: ridge sharpness 1.6/1.4→1.3/1.2; peak-amp `^3.0*0.4`→`^2.0*0.18`;
ultra-peak `*1.5`→`*0.5`; spire peakBonus `*0.35`→`*0.15`; jagged `0.12/0.08`→`0.07/0.05`;
erosion `0.05/0.03/0.02`→`0.03/0.02/0.012`. Amplitude (180) and clamp (285) untouched.
```
seed          asym   Xmean  Zmean  Xp99  Zp99  X>3%  Z>3%  peakMean  peakMax
alpha         1.05   1.310  1.372  5     5     4.2   4.8   194       269
bravo         1.02   1.188  1.209  4     4     2.4   2.5   192       248
12345         1.06   1.246  1.316  4     5     3.1   3.9   194       278
test_seed_42  1.03   0.999  1.031  4     4     1.2   1.2   162       234
ridgetest     0.99   1.124  1.113  4     4     2.7   2.5   166       247
```
All gates met: mean ≤ 1.378 (OLD_X_CEILING), p99 ≤ 6, over3 ≤ 8%, asym ∈ [0.7,1.4], peakMax < 320.
Peak clamp-saturation (was 285 for all) ELIMINATED (peakMax 234–278). Roughness landed gently
BELOW old-X. Cross-sections (harness panel) confirm X/Z now match in character, rounded peaks,
broad valleys, no spikes/walls, macro relief preserved (≈84–101 over a 512-block slice; full-field
peaks 234–278 above ≈140 foothills). Pending user in-game sign-off (Task 7).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-29-noise-isotropy-mountain-retune.md
git commit -m "Record pre-mask anisotropic mountain baseline (old-X ceiling)"
```

---

## Task 3: Apply the `& 15` gradient mask to both `grad` copies

**Files:**
- Modify: `voxEx.html:18926` (worker template `grad`), `voxEx.html:21416` (main `grad`)

- [ ] **Step 1: Confirm both copies are byte-identical before editing**

Run: `grep -n "const grad = (h, x, y)" voxEx.html`
Expected: exactly two hits, `18926` and `21416`. Read 4 lines after each; both bodies must match:
```js
const u = h < 8 ? x : y;
const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
```

- [ ] **Step 2: Add the mask to the worker-template copy (`:18926`)**

Change the body so the first line of the arrow body becomes `h &= 15;`:
```js
    const grad = (h, x, y) => {
        h &= 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    };
```

- [ ] **Step 3: Add the identical mask to the main copy (`:21416`)**

```js
            const grad = (h, x, y) => {
                h &= 15;
                const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
                return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
            };
```
(Match the existing indentation/formatting of each copy; only the `h &= 15;` line is added.)

- [ ] **Step 4: Run the FULL suite headless — must stay green**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#summary .summary" 60000
```
Expected: the summary reports all tests passing (the existing suite — ~193 — does NOT gate isotropy, and the worker↔main parity test must still pass, proving both `grad` copies changed identically). `=== FAILURES === (none)`.
If the worker-parity test fails: the two `grad` edits diverged — re-diff Steps 2–3 and fix.

- [ ] **Step 5: Re-measure and record the post-mask numbers**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/tools/voxex-tests.html" "new Promise(r=>{const t=setInterval(()=>{if(window.mountainMetrics){clearInterval(t);r(['alpha','bravo','12345','test_seed_42','ridgetest'].map(s=>window.mountainMetrics(s)));}},300);})"
```
Expected: `asymmetry` now near **1.0** (isotropy achieved), but `Zmean`/`Zp99`/`peakMax`/`Z>3%` now much WORSE than the old-X ceiling (the spires the re-tune must tame). Paste these numbers under a `### Post-mask (pre-tune)` heading in this plan.

- [ ] **Step 6: Commit**

```bash
git add voxEx.html docs/superpowers/plans/2026-05-29-noise-isotropy-mountain-retune.md
git commit -m "Re-apply & 15 mask to both 2D grad copies (isotropic noise); record post-mask metrics"
```

---

## Task 4: Re-tune `mountainsHeightFunc` toward the old-X ceiling

**Files:**
- Modify: `voxEx.html:36416-36558` (`mountainsHeightFunc`) — ONLY the named knobs below.

This is the iterative creative loop. After EACH edit, re-run the metrics command from Task 3 Step 5 and compare to `OLD_X_CEILING`. The order tackles the worst geometry first. The values below are first-pass starting points; adjust by measurement, not by guessing. **Do not edit anything in `mountainsHeightFunc` other than these named knobs.** If after exhausting them the gates (Task 5) cannot be met, STOP and report.

- [ ] **Step 1: Soften peak amplification (spires) — `:36464-36470`**

The cubed peak boost and ultra-peak boost create impossible pinnacles. Reduce the exponent and coefficients:
```js
                // --- PEAK AMPLIFICATION ---
                if (ridgeSum > 0.5) {
                    ridgeSum += Math.pow((ridgeSum - 0.5) * 2.0, 2.0) * 0.18;   // was ^3.0 * 0.4
                }
                if (ridgeSum > 0.9) {
                    ridgeSum += (ridgeSum - 0.9) * 0.5;                          // was * 1.5
                }
```
Re-measure (Task 3 Step 5). Note the change in `peakMax`/`Zp99`.

- [ ] **Step 2: Soften the spire `peakBonus` — `:36497-36502`**

```js
                if (peakTypeNoise > 0.3 && ridgeSum > 0.55) {
                    const spireNoise = noise2D(gx * 0.02 + seed * 15, gz * 0.02 - seed * 15);
                    if (spireNoise > 0.45) {
                        peakBonus = Math.pow((spireNoise - 0.45) * 1.8, 2.5) * 0.15;   // was * 0.35
                    }
                }
```
Re-measure.

- [ ] **Step 3: Round the shoulders — ridge `sharpness` at `:36454`**

```js
                    const sharpness = i < 2 ? 1.3 : 1.2;   // was 1.6 : 1.4 — lower = rounder ridges
```
Re-measure. This should drop `mean`/`p99` step on both axes.

- [ ] **Step 4: Reduce surface roughness for traversability — `jaggedAmount` `:36480`, `erosionAmount` `:36522`**

```js
                const jaggedAmount = (Math.pow(jagged1, 1.8) * 0.07 + Math.pow(jagged2, 2.2) * 0.05) *
                                    (0.4 + ridgeSum * 0.6);                                   // was 0.12 / 0.08
```
```js
                const erosionAmount = (Math.abs(erosionNoise) * 0.03 + Math.abs(erosionNoise2) * 0.02 +
                                      Math.abs(erosionNoise3) * 0.012) * (0.4 + ridgeSum * 0.6);   // was 0.05 / 0.03 / 0.02
```
Re-measure.

- [ ] **Step 5: Only if still above ceiling — trim global amplitude/clamp**

Touch these LAST (they flatten everything; the user wants dramatic-but-tame, not flat). If `peakMax` is still pushing world bounds or `mean` step stays above `OLD_X_CEILING`:
- `voxEx.html:21909` mountains `amplitude: 180` → try `150`.
- `voxEx.html:36557` final clamp `285` → leave unless `peakMax` approaches `CHUNK_HEIGHT` (320).

Re-measure after each.

- [ ] **Step 6: Iterate to convergence against the ceiling**

Loop Steps 1–5 adjustments until, across all five seeds:
- `asymmetry` stays in `[0.7, 1.4]` (mask preserved isotropy),
- both `xStep.mean` and `zStep.mean` ≤ `OLD_X_CEILING` (from Task 2),
- both `*.p99` ≤ `OLD_X_P99_CEILING` (gently below is fine),
- `peakMax` < 320.

Record the converged numbers under `### Post-tune` in this plan.

- [ ] **Step 7: Run the full suite (must still be green)**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#summary .summary" 60000
```
Expected: still all passing. The worker injects `mountainsHeightFunc` via `toString()`, so the worker↔main parity test transitively verifies the worker got the re-tuned function.

- [ ] **Step 8: CHECKPOINT — present to user before locking gates**

Capture the cross-section canvases (open in the real browser) and the converged metric table; present both to the user. Do NOT proceed to Task 5/6 sign-off without the user confirming the cross-sections look tamer/natural. To open in the user's browser:
```bash
cmd.exe /c start "" "http://localhost:8080/tools/voxex-tests.html"
```

- [ ] **Step 9: Commit**

```bash
git add voxEx.html docs/superpowers/plans/2026-05-29-noise-isotropy-mountain-retune.md
git commit -m "Re-tune mountainsHeightFunc for isotropic noise (tamer ranges); record post-tune metrics"
```

---

## Task 5: Add the isotropy + traversability gate to the suite

**Files:**
- Modify: `tools/voxex-tests.html` (add one `describe` suite inside `runAllTests`, after the existing terrain suites)

Now that tuning meets the targets, lock them in as a regression gate. Use the numbers recorded in Task 2.

- [ ] **Step 1: Add the gate suite**

Insert inside `runAllTests` (use the actual measured ceilings from Task 2 in place of the two constants — they are concrete numbers recorded in this plan, not placeholders):

```js
    await describe("mountains: isotropy + traversability (post-fix)", () => {
        const OLD_X_CEILING = /* value recorded in Task 2 Step 3 */ 0;
        const OLD_X_P99_CEILING = /* value recorded in Task 2 Step 3 */ 0;
        const seeds = ["alpha", "bravo", "12345", "test_seed_42", "ridgetest"];
        it("X/Z step asymmetry within [0.7, 1.4] across seeds", () => {
            for (const s of seeds) { const m = mountainMetrics(s); expect(m.asymmetry).toBeGreaterThan(0.7); expect(m.asymmetry).toBeLessThan(1.4); }
        });
        it("both axes' mean step <= old-X ceiling", () => {
            for (const s of seeds) { const m = mountainMetrics(s); expect(m.xStep.mean).toBeLessThanOrEqual(OLD_X_CEILING); expect(m.zStep.mean).toBeLessThanOrEqual(OLD_X_CEILING); }
        });
        it("both axes' p99 step <= old-X p99 ceiling", () => {
            for (const s of seeds) { const m = mountainMetrics(s); expect(m.xStep.p99).toBeLessThanOrEqual(OLD_X_P99_CEILING); expect(m.zStep.p99).toBeLessThanOrEqual(OLD_X_P99_CEILING); }
        });
        it("peaks stay within world bounds", () => {
            for (const s of seeds) { const m = mountainMetrics(s); expect(m.peakMax).toBeLessThan(CHUNK_HEIGHT); }
        });
    });
```

- [ ] **Step 2: Run the full suite — gate must pass**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-run.cjs "http://localhost:8080/tools/voxex-tests.html" "#summary .summary" 60000
```
Expected: all green, total count increased by 4. `=== FAILURES === (none)`.
If the gate fails, the tuning regressed against the ceiling — return to Task 4 (do NOT loosen the gate to pass).

- [ ] **Step 3: Commit**

```bash
git add tools/voxex-tests.html
git commit -m "Add mountain isotropy + traversability gate to suite (locks the re-tune)"
```

---

## Task 6: Non-mountain biome regression spot-check

**Files:**
- None modified (verification only; record observations in the checkpoint message).

The mask changed `noise2D` output for plains/hills/forests too. We are NOT tuning them, but they must not visibly regress.

- [ ] **Step 1: Compare the biome heightmaps before/after visually**

The harness `renderTerrainVisualizations` already draws Plains/Hills/Forests/blendedHeight from real code. Open the harness in the real browser and inspect those four panels:
```bash
cmd.exe /c start "" "http://localhost:8080/tools/voxex-tests.html"
```
Expected: plains stay gently rolling, hills stay billowy, forests stay moderate — no new spikes/walls (they are low-frequency/amplitude, so isotropy barely shows). Note anything that looks newly broken.

- [ ] **Step 2: Sanity-check their height ranges via eval**

```bash
node /c/Users/kandl/AppData/Local/Temp/cdp-eval.cjs "http://localhost:8080/tools/voxex-tests.html" "new Promise(r=>{const t=setInterval(()=>{if(window.VoxEx&&window.VoxEx.blendedHeight){clearInterval(t);const V=window.VoxEx;V.seedNoise('alpha');const sd=V.worldSeed;const cfg=V.BIOME_CONFIG;const out={};for(const[name,fn]of[['plains',V.plainsHeightFunc],['hills',V.hillsHeightFunc],['forests',V.defaultHeightFunc]]){let mn=1e9,mx=-1e9;for(let i=0;i<2000;i++){const h=fn(i*7,i*-5,cfg[name],sd);mn=Math.min(mn,h);mx=Math.max(mx,h);}out[name]=[mn.toFixed(1),mx.toFixed(1)];}r(out);}},300);})"
```
Expected: plains tightest range, hills moderate, forests moderate — all finite and within sane bounds (no Infinity/NaN, no ranges blowing past mountain scale). Record the ranges in the checkpoint message.

- [ ] **Step 3: Report to user** — present the visual observation + ranges; flag any regression. No commit (verification only).

---

## Task 7: In-game spot-check (user sign-off)

**Files:**
- None modified (final acceptance).

- [ ] **Step 1: Launch the real game at agreed checkpoints**

```bash
cmd.exe /c start "" "http://localhost:8080/voxEx.html"
```
Have the user start a NEW world (seam-on-old-saves is accepted) with each agreed seed (e.g. `test_seed_42`, `ridgetest`), fly to a mountain range, and confirm: tamer ranges, rounder shoulders, no impossible spires/vertical walls, ridgelines still dramatic, smooth along BOTH X and Z.

- [ ] **Step 2: If the user requests changes** — return to Task 4, adjust the named knobs, re-converge, re-present. Only the user's confirmation closes this task.

- [ ] **Step 3: No commit** (sign-off gate; the tuning commit already landed in Task 4/5).

---

## Task 8: Finalize — docs and findings

**Files:**
- Modify: `docs/superpowers/plans/2026-05-29-voxex-test-coverage.md` (finding #14 resolution)
- Modify: `CLAUDE.md` (testing-tools note, if the metrics panel warrants a mention)

- [ ] **Step 1: Resolve finding #14 in the test-coverage plan**

In `docs/superpowers/plans/2026-05-29-voxex-test-coverage.md`, under finding #14, append a resolution note: the `& 15` mask was re-applied (this plan), `mountainsHeightFunc` re-tuned toward the old-X ceiling for tamer isotropic ranges, a metrics gate added, save-seams accepted (new worlds only). Reference this plan and the converged numbers.

- [ ] **Step 2: Note the metrics panel in CLAUDE.md testing-tools section**

In the `## Testing Tools` section (CLAUDE.md ~line 774), add one line under the `voxex-tests.html` entry: the harness now includes a real-code "Mountain Tuning Metrics" panel (per-axis step stats, X/Z asymmetry, cross-sections) used to keep noise isotropic.

- [ ] **Step 3: Final commit**

```bash
git add docs/superpowers/plans/2026-05-29-voxex-test-coverage.md CLAUDE.md
git commit -m "Docs: resolve noise2D anisotropy finding (#14); note mountain metrics panel"
```

---

## Self-review notes (for the implementer)

- The two `grad` edits MUST be identical in logic — the worker↔main parity test (Tier 4) is the guard. If it fails after Task 3, the copies diverged.
- `OLD_X_CEILING`/`OLD_X_P99_CEILING` are concrete numbers measured in Task 2 and recorded in this file; Task 5's gate uses those exact values. Do not invent them.
- The re-tune knob values in Task 4 are STARTING points; the metrics + cross-sections + user eye decide the finals. Stay within the named knobs.
- Everything reads REAL code via `?test=1`; never tune against `terrain-visualizer.html` (stale copy).

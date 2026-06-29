# Launcher System Examination + Shareable Diagnostic Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the launcher's client examination (OS/browser/device, display/input, WebGL caps, storage, network) and add Copy Report + Download .json buttons so testers can send full diagnostics.

**Architecture:** All changes are purely additive edits to `index.html`. No new files, no external deps. Eight targeted inserts/edits in source order, then a build bump. The JS, CSS, and HTML all stay inline in the single file. New functions and state are added; no existing pass/fail logic or benchmark math changes.

**Tech Stack:** Vanilla JS (ES2020: `?.`, `??`, `async/await`, UA Client Hints where available), plain CSS, no build step.

## Global Constraints

- Single-file rule: all CSS/HTML/JS stays inline in `index.html` — no new files, no CDN deps.
- The launcher uses plain `console.log` — not `logDebug`. All new code follows that convention.
- No `var` — use `const`/`let` throughout.
- `??`/`?.` for optional fields (not `||` where `0`/`''`/`false` are valid).
- Every system probe must be guarded — `collectSystemInfo()` / `collectWebGLCaps()` must return a partial object (never throw) on browsers lacking UA-CH, `deviceMemory`, `navigator.connection`, `storage.estimate`, or WebGL.
- No change to existing test pass/fail logic, `classifyGPU`, `getPerformanceTier`, or benchmark math.
- Build bump goes in `voxEx.html` (not `index.html`) — current: `"2026-06-25.34"`, next: `"2026-06-29.35"`.

---

### Task 1: State declarations — REPORT_SCHEMA + report state vars (#1)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (~line 435 and ~line 490)

**Interfaces:**
- Produces: `REPORT_SCHEMA` (const, value `1`), `systemInfo` (let `{}`), `benchmarkData` (let `null`), `testRecords` (const `[]`) — all referenced by Tasks 4–8.

- [ ] **Step 1: Verify the anchor text exists**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "const isSecure = protocol === 'https:';"
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "let gpuInfo = \{ renderer: null, vendor: null \};"
```

Expected: one match each, at approximately lines 435 and 490.

- [ ] **Step 2: Add REPORT_SCHEMA after the isSecure line**

In `D:\Projects\voxex\index.html`, find this block (around line 432):
```js
        // ==== Protocol Detection ====
        const protocol = location.protocol;
        const isFileProtocol = protocol === 'file:';
        const isSecure = protocol === 'https:';
```

Replace with:
```js
        // ==== Protocol Detection ====
        const protocol = location.protocol;
        const isFileProtocol = protocol === 'file:';
        const isSecure = protocol === 'https:';

        // VOXEX-CCR-LAUNCHER-001: bump when the report shape changes (for your data collection).
        const REPORT_SCHEMA = 1;
```

- [ ] **Step 3: Add report state vars after gpuInfo**

Find this block (around line 488):
```js
        // ==== State ====
        let results = {};
        let gpuInfo = { renderer: null, vendor: null };
```

Replace with:
```js
        // ==== State ====
        let results = {};
        let gpuInfo = { renderer: null, vendor: null };
        // VOXEX-CCR-LAUNCHER-001: state for the diagnostic report
        let systemInfo = {};        // populated by collectSystemInfo()
        let benchmarkData = null;   // { perf, raw } captured after runBenchmark()
        const testRecords = [];     // ordered { id, name, category, status, detail, reason }
```

- [ ] **Step 4: Verify no duplicate declarations**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "REPORT_SCHEMA|let systemInfo|let benchmarkData|const testRecords"
```

Expected: exactly 1 match each — the lines just added.

---

### Task 2: CSS — System Details panel + Share Diagnostics styles (#7)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (~line 231)

**Interfaces:**
- Produces: CSS classes `.sysinfo`, `.sysinfo summary`, `.sysinfo-body`, `.sysinfo-body .si-label`, `.diag-section`, `.diag-help`, `.diag-input`, `.btn-row`, `.diag-status` — consumed by Task 3's HTML.

- [ ] **Step 1: Verify the CSS anchor**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "\.btn-secondary:hover \{ background: #333; \}"
```

Expected: one match around line 231.

- [ ] **Step 2: Insert CSS block**

Find this exact text:
```css
        .btn-secondary:hover { background: #333; }

        .hidden { display: none !important; }
```

Replace with:
```css
        .btn-secondary:hover { background: #333; }

        /* VOXEX-CCR-LAUNCHER-001: System Details panel + Share Diagnostics */
        .sysinfo {
            margin-top: 12px;
            background: #222;
            border: 1px solid #333;
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 12px;
        }
        .sysinfo summary {
            cursor: pointer;
            color: #888;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-size: 11px;
        }
        .sysinfo-body {
            margin-top: 10px;
            color: #aaa;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 11px;
        }
        .sysinfo-body .si-label { color: #4caf50; }

        .diag-section { margin-top: 16px; }
        .diag-help {
            font-size: 12px;
            color: #888;
            margin-bottom: 10px;
            line-height: 1.4;
        }
        .diag-input {
            width: 100%;
            background: #2a2a2a;
            border: 1px solid #3a3a3a;
            border-radius: 5px;
            color: #eee;
            padding: 8px 10px;
            font-size: 13px;
            font-family: inherit;
            margin-bottom: 8px;
            resize: vertical;
        }
        .diag-input:focus { outline: none; border-color: #4caf50; }
        .btn-row { display: flex; gap: 8px; }
        .btn-row .btn { margin-top: 0; }
        .diag-status {
            text-align: center;
            font-size: 12px;
            margin-top: 8px;
            min-height: 1.2em;
        }

        .hidden { display: none !important; }
```

- [ ] **Step 3: Sanity-check the file still has one `.hidden` rule**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "\.hidden \{ display: none"
```

Expected: exactly 1 match.

---

### Task 3: HTML — System Details panel + Share Diagnostics section (#6)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (~line 423)

**Interfaces:**
- Produces DOM IDs: `sysinfo-panel`, `sysinfo-body`, `diag-section`, `diag-name`, `diag-notes`, `copy-report-btn`, `download-report-btn`, `diag-status` — all referenced in Task 7's JS functions.

- [ ] **Step 1: Verify the HTML anchor**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern '<div id="error-container">'
```

Expected: one match around line 423.

- [ ] **Step 2: Insert the panel + diagnostics section**

Find this exact HTML:
```html
        <div id="error-container"></div>

        <button class="btn btn-primary" id="play-btn" disabled>Checking...</button>
        <button class="btn btn-secondary hidden" id="skip-btn">Continue Anyway (Limited Features)</button>
```

Replace with:
```html
        <div id="error-container"></div>

        <!-- VOXEX-CCR-LAUNCHER-001: collected system details (populated after tests) -->
        <details class="sysinfo hidden" id="sysinfo-panel">
            <summary>System Details</summary>
            <div class="sysinfo-body" id="sysinfo-body"></div>
        </details>

        <!-- VOXEX-CCR-LAUNCHER-001: shareable diagnostic report (works even if checks fail) -->
        <div class="diag-section hidden" id="diag-section">
            <div class="section-title">Share Diagnostics</div>
            <p class="diag-help">Having trouble? Copy or download this report and send it over so the issue can be investigated.</p>
            <input type="text" class="diag-input" id="diag-name" placeholder="Your name (optional)" maxlength="80">
            <textarea class="diag-input" id="diag-notes" placeholder="What went wrong? (optional)" rows="2" maxlength="500"></textarea>
            <div class="btn-row">
                <button class="btn btn-secondary" id="copy-report-btn">📋 Copy Report</button>
                <button class="btn btn-secondary" id="download-report-btn">⬇️ Download .json</button>
            </div>
            <p class="diag-status" id="diag-status"></p>
        </div>

        <button class="btn btn-primary" id="play-btn" disabled>Checking...</button>
        <button class="btn btn-secondary hidden" id="skip-btn">Continue Anyway (Limited Features)</button>
```

- [ ] **Step 3: Verify all 8 new DOM ids exist exactly once**

```powershell
foreach ($id in @('sysinfo-panel','sysinfo-body','diag-section','diag-name','diag-notes','copy-report-btn','download-report-btn','diag-status')) {
    $count = (Select-String -Path "D:\Projects\voxex\index.html" -Pattern "id=""$id""").Count
    Write-Host "$id : $count"
}
```

Expected: each id shows `1`.

---

### Task 4: Deeper client examination — `collectSystemInfo()` + `collectWebGLCaps()` (#2)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (insert after `showError` function, ~line 1193)

**Interfaces:**
- Consumes: nothing (pure probes)
- Produces: `collectSystemInfo()` → `Promise<{os_browser, display, webgl, storage, network}>`, `collectWebGLCaps()` → `{available, webgl2, version, ...}` — both called in Task 8.

- [ ] **Step 1: Verify the insertion anchor**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "// ==== Main Test Runner ===="
```

Expected: one match. Note the line number — insert just before it.

- [ ] **Step 2: Insert the two examination functions**

Find this exact text (end of `showError` + the `// ==== Main Test Runner ====` banner):
```js
            errorContainer.appendChild(div);
        }

        // ==== Main Test Runner ====
```

Replace with:
```js
            errorContainer.appendChild(div);
        }

        // ==== Expanded System Examination (VOXEX-CCR-LAUNCHER-001) ====
        // Pure data-gathering for the diagnostic report. Every probe is guarded so a
        // single unsupported API can't abort the whole collection. Returns a plain object.
        async function collectSystemInfo() {
            const info = {};
            const nav = navigator;

            // --- OS / Browser / Device ---
            info.os_browser = {
                userAgent: nav.userAgent || '',
                language: nav.language || '',
                languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 5) : [],
                timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
                hardwareConcurrency: nav.hardwareConcurrency ?? null,
                deviceMemoryGB: nav.deviceMemory ?? null,
                maxTouchPoints: nav.maxTouchPoints ?? 0,
                cookiesEnabled: nav.cookieEnabled ?? null
            };
            // High-entropy UA Client Hints (Chromium) — async, optional, best source of OS/device.
            if (nav.userAgentData && typeof nav.userAgentData.getHighEntropyValues === 'function') {
                try {
                    const ch = await nav.userAgentData.getHighEntropyValues([
                        'platform', 'platformVersion', 'architecture', 'bitness',
                        'model', 'uaFullVersion', 'fullVersionList'
                    ]);
                    info.os_browser.platform = ch.platform || '';
                    info.os_browser.platformVersion = ch.platformVersion || '';
                    info.os_browser.architecture = ch.architecture || '';
                    info.os_browser.bitness = ch.bitness || '';
                    info.os_browser.model = ch.model || '';
                    info.os_browser.brands = (ch.fullVersionList || nav.userAgentData.brands || [])
                        .map(b => `${b.brand} ${b.version}`);
                    info.os_browser.mobile = !!nav.userAgentData.mobile;
                } catch (e) { info.os_browser.uaClientHintsError = e.name || 'failed'; }
            } else {
                info.os_browser.platform = nav.platform || '';
            }

            // --- Display & Input ---
            info.display = {
                screen: `${screen.width}x${screen.height}`,
                available: `${screen.availWidth}x${screen.availHeight}`,
                window: `${window.innerWidth}x${window.innerHeight}`,
                devicePixelRatio: window.devicePixelRatio || 1,
                colorDepth: screen.colorDepth || null,
                orientation: (screen.orientation && screen.orientation.type) || '',
                pointerCoarse: matchMedia('(pointer: coarse)').matches,
                hover: matchMedia('(hover: hover)').matches,
                prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
            };

            // --- WebGL capabilities ---
            info.webgl = collectWebGLCaps();

            // --- Storage quota & persistence ---
            info.storage = {};
            try {
                if (nav.storage && nav.storage.estimate) {
                    const est = await nav.storage.estimate();
                    info.storage.quotaMB = est.quota ? Math.round(est.quota / 1048576) : null;
                    info.storage.usageMB = est.usage ? Math.round(est.usage / 1048576) : null;
                }
                if (nav.storage && nav.storage.persisted) {
                    info.storage.persisted = await nav.storage.persisted();
                }
            } catch (e) { info.storage.error = e.name || 'failed'; }

            // --- Network ---
            const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
            info.network = {
                onLine: nav.onLine,
                effectiveType: conn?.effectiveType || '',
                downlinkMbps: conn?.downlink ?? null,
                rttMs: conn?.rtt ?? null,
                saveData: conn?.saveData ?? null
            };

            return info;
        }

        // Detailed WebGL limits/extensions from a throwaway context (VOXEX-CCR-LAUNCHER-001).
        function collectWebGLCaps() {
            const caps = {};
            try {
                const canvas = document.createElement('canvas');
                const gl2 = canvas.getContext('webgl2');
                const gl = gl2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return { available: false };
                caps.available = true;
                caps.webgl2 = !!gl2;
                caps.version = gl.getParameter(gl.VERSION);
                caps.glsl = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    caps.unmaskedVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
                    caps.unmaskedRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
                }
                caps.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                caps.maxCubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
                caps.maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
                caps.maxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
                caps.maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
                caps.maxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS);
                caps.maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
                caps.maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
                const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
                if (vp) caps.maxViewportDims = `${vp[0]}x${vp[1]}`;
                // Fragment high-float precision affects lighting/fog shader quality.
                const fp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
                if (fp) caps.fragHighFloat = { precision: fp.precision, rangeMin: fp.rangeMin, rangeMax: fp.rangeMax };
                caps.contextLossExt = !!gl.getExtension('WEBGL_lose_context');
                const exts = gl.getSupportedExtensions() || [];
                caps.extensionCount = exts.length;
                caps.extensions = exts;
                // Extensions VoxEx specifically relies on (mirrors testWebGL's requiredExts).
                caps.hasElementIndexUint = exts.includes('OES_element_index_uint');
                caps.hasStandardDerivatives = caps.webgl2 || exts.includes('OES_standard_derivatives');
            } catch (e) {
                caps.error = e.name || 'failed';
            }
            return caps;
        }

        // ==== Main Test Runner ====
```

- [ ] **Step 3: Verify functions are present and unique**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "async function collectSystemInfo|function collectWebGLCaps"
```

Expected: exactly one match per function name.

---

### Task 5: Tag tests with category + record normalized test status (#3)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (~line 1199 and ~line 1230, inside `runTests()`)

**Interfaces:**
- Consumes: `testRecords` (const array from Task 1), `ERRORS` (existing object)
- Produces: `testRecords` populated with `{ id, name, category, status, detail, reason }` per test after each run.

- [ ] **Step 1: Verify both anchors**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "CRITICAL_TESTS\.map\(t => \(\{ \.\.\.t, critical: true \}\)\)"
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "results\[test\.id\] = result;"
```

Expected: one match each.

- [ ] **Step 2: Tag tests with category**

Find:
```js
            const allTests = [
                ...CRITICAL_TESTS.map(t => ({ ...t, critical: true })),
                ...STORAGE_TESTS.map(t => ({ ...t, critical: false })),
                ...OPTIONAL_TESTS.map(t => ({ ...t, critical: false })),
            ];
```

Replace with:
```js
            const allTests = [
                ...CRITICAL_TESTS.map(t => ({ ...t, critical: true, category: 'Required' })),
                ...STORAGE_TESTS.map(t => ({ ...t, critical: false, category: 'Storage' })),
                ...OPTIONAL_TESTS.map(t => ({ ...t, critical: false, category: 'Optional' })),
            ];
```

- [ ] **Step 3: Record normalized status + reason after each test**

Find:
```js
                const fn = testFunctions[test.id];
                const result = fn ? await fn() : { pass: false, detail: 'Not implemented' };
                results[test.id] = result;

                updateTest(test.id, result);

                if (!result.pass && test.critical && !result.skipError) {
                    criticalFailed.push(test.id);
                }
```

Replace with:
```js
                const fn = testFunctions[test.id];
                const result = fn ? await fn() : { pass: false, detail: 'Not implemented' };
                results[test.id] = result;

                updateTest(test.id, result);

                // VOXEX-CCR-LAUNCHER-001: normalized status + reason for the shareable report.
                const status = result.pass ? 'pass' : (result.warn ? 'warn' : 'fail');
                let reason = result.detail || '';
                if (status === 'fail' && ERRORS[test.id]) {
                    reason = (reason ? reason + ' — ' : '') + ERRORS[test.id].message;
                }
                testRecords.push({
                    id: test.id, name: test.name, category: test.category,
                    status, detail: result.detail || '', reason
                });

                if (!result.pass && test.critical && !result.skipError) {
                    criticalFailed.push(test.id);
                }
```

- [ ] **Step 4: Verify `category` now appears in allTests**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "category: 'Required'"
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "testRecords\.push"
```

Expected: one match each.

---

### Task 6: Capture benchmark data for the report (#4)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (~line 1249, inside `runTests()`)

**Interfaces:**
- Consumes: `benchmarkData` (let from Task 1), `getPerformanceTier` (existing function)
- Produces: `benchmarkData` set to `{ perf, raw }` when benchmark succeeds — consumed by `buildReportData()` in Task 7.

- [ ] **Step 1: Verify the benchmark anchor**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "const perf = getPerformanceTier\(benchResult\);"
```

Expected: one match.

- [ ] **Step 2: Capture benchmarkData**

Find:
```js
                if (benchResult) {
                    const perf = getPerformanceTier(benchResult);
                    benchmarkResultEl.textContent = perf.tier;
                    benchmarkResultEl.style.color = perf.color;
```

Replace with:
```js
                if (benchResult) {
                    const perf = getPerformanceTier(benchResult);
                    benchmarkData = { perf, raw: benchResult }; // VOXEX-CCR-LAUNCHER-001
                    benchmarkResultEl.textContent = perf.tier;
                    benchmarkResultEl.style.color = perf.color;
```

- [ ] **Step 3: Verify the line was inserted**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "benchmarkData = \{ perf, raw: benchResult \}"
```

Expected: exactly 1 match.

---

### Task 7: Report builders + copy/download + panel/controls wiring (#5)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (insert alongside Task 4's additions, just before `// ==== Main Test Runner ====`)

**Interfaces:**
- Consumes: `REPORT_SCHEMA`, `systemInfo`, `testRecords`, `benchmarkData` (all from Task 1); `collectSystemInfo` (Task 4); DOM ids from Task 3.
- Produces: `buildReportData()`, `buildReportText(data)`, `copyReport()`, `downloadReport()`, `flashDiagStatus(msg, isError)`, `_diagStatusTimer`, `renderSystemDetails(info)`, `enableDiagnostics()` — all called in Task 8.

- [ ] **Step 1: Verify the insertion point (end of collectWebGLCaps + before Main Test Runner)**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "// ==== Main Test Runner ===="
```

Confirm it still exists. The new block will be inserted immediately before it.

- [ ] **Step 2: Insert the diagnostic report functions**

Find:
```js
        // ==== Main Test Runner ====
        async function runTests() {
```

Replace with:
```js
        // ==== Diagnostic Report (VOXEX-CCR-LAUNCHER-001) ====
        // Assemble the structured report object (the pure-JSON payload for Download).
        function buildReportData() {
            const nameInput = document.getElementById('diag-name');
            const notesInput = document.getElementById('diag-notes');
            const tester = {
                name: (nameInput?.value || '').trim(),
                notes: (notesInput?.value || '').trim()
            };
            return {
                report: { schema: REPORT_SCHEMA, app: 'VoxEx System Check', generatedAt: new Date().toISOString() },
                page: { url: location.href, protocol: location.protocol },
                tester,
                system: systemInfo,
                tests: testRecords,
                benchmark: benchmarkData ? {
                    tier: benchmarkData.perf.tier,
                    capped: benchmarkData.perf.capped,
                    gpu: benchmarkData.perf.gpuClass,
                    scores: benchmarkData.perf.scores,
                    isMobile: benchmarkData.perf.isMobile
                } : null
            };
        }

        // Human-readable report (summary up top, full JSON block below) for the clipboard.
        function buildReportText(data) {
            const L = [];
            const ob = data.system.os_browser || {};
            const d = data.system.display || {};
            const w = data.system.webgl || {};
            const s = data.system.storage || {};
            const n = data.system.network || {};

            L.push('===== VoxEx System Check Report =====');
            L.push(`Generated: ${data.report.generatedAt}`);
            L.push(`Page: ${data.page.url} (${data.page.protocol})`);
            if (data.tester.name) L.push(`Tester: ${data.tester.name}`);
            if (data.tester.notes) L.push(`Notes: ${data.tester.notes}`);
            L.push('');

            L.push('--- System ---');
            L.push(`OS/Platform: ${(ob.platform || '') + ' ' + (ob.platformVersion || '')}`.trim());
            if (ob.architecture) L.push(`Architecture: ${ob.architecture} ${ob.bitness || ''}`.trim());
            if (ob.model) L.push(`Device model: ${ob.model}`);
            if (ob.brands && ob.brands.length) L.push(`Browser: ${ob.brands.join(', ')}`);
            L.push(`CPU threads: ${ob.hardwareConcurrency ?? 'n/a'} | Device memory: ${ob.deviceMemoryGB ?? 'n/a'} GB`);
            L.push(`Language: ${ob.language || ''} | Timezone: ${ob.timezone || ''}`);
            L.push(`User agent: ${ob.userAgent || ''}`);
            L.push('');

            L.push('--- Display & Input ---');
            L.push(`Screen: ${d.screen} | Window: ${d.window} | DPR: ${d.devicePixelRatio} | Color depth: ${d.colorDepth}`);
            L.push(`Pointer coarse: ${d.pointerCoarse} | Hover: ${d.hover} | Reduced motion: ${d.prefersReducedMotion}`);
            L.push('');

            L.push('--- WebGL ---');
            if (!w.available) {
                L.push('WebGL: NOT AVAILABLE');
            } else {
                L.push(`Renderer: ${w.unmaskedRenderer || '(masked)'} | Vendor: ${w.unmaskedVendor || '(masked)'}`);
                L.push(`Version: ${w.version} | WebGL2: ${w.webgl2}`);
                L.push(`Max texture: ${w.maxTextureSize} | Max viewport: ${w.maxViewportDims} | Max renderbuffer: ${w.maxRenderBufferSize}`);
                L.push(`Varyings: ${w.maxVaryingVectors} | Vertex attribs: ${w.maxVertexAttribs} | Tex units: ${w.maxTextureImageUnits}`);
                L.push(`Extensions: ${w.extensionCount} | element_index_uint: ${w.hasElementIndexUint} | std_derivatives: ${w.hasStandardDerivatives}`);
            }
            L.push('');

            L.push('--- Storage & Network ---');
            L.push(`Storage quota: ${s.quotaMB ?? 'n/a'} MB | used: ${s.usageMB ?? 'n/a'} MB | persisted: ${s.persisted ?? 'n/a'}`);
            L.push(`Online: ${n.onLine} | Connection: ${n.effectiveType || 'n/a'} | Downlink: ${n.downlinkMbps ?? 'n/a'} Mbps | RTT: ${n.rttMs ?? 'n/a'} ms`);
            L.push('');

            L.push('--- Test Results ---');
            for (const t of data.tests) {
                const mark = t.status === 'pass' ? 'PASS' : t.status === 'warn' ? 'WARN' : 'FAIL';
                L.push(`[${mark}] (${t.category}) ${t.name}: ${t.reason || t.detail || ''}`);
            }

            if (data.benchmark) {
                L.push('');
                L.push('--- Benchmark ---');
                L.push(`Tier: ${data.benchmark.tier}${data.benchmark.capped ? ' (capped by GPU)' : ''}`);
                L.push(`GPU class: ${data.benchmark.gpu.brand} (${data.benchmark.gpu.type}, ${data.benchmark.gpu.tier})`);
                const sc = data.benchmark.scores || {};
                L.push(`Scores - combined: ${sc.combined}, upload: ${sc.upload}, draw: ${sc.draw}, fill: ${sc.fill}`);
            }

            L.push('');
            L.push('===== Machine-readable JSON =====');
            L.push(JSON.stringify(data, null, 2));
            return L.join('\n');
        }

        async function copyReport() {
            const text = buildReportText(buildReportData());
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                } else {
                    // Insecure-context fallback (e.g. file://): hidden textarea + execCommand.
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.top = '-9999px';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                flashDiagStatus('Report copied to clipboard ✓');
            } catch (e) {
                flashDiagStatus('Copy failed — use Download instead', true);
            }
        }

        function downloadReport() {
            const json = JSON.stringify(buildReportData(), null, 2);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voxex-syscheck-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            flashDiagStatus('Report downloaded ✓');
        }

        let _diagStatusTimer = null;
        function flashDiagStatus(msg, isError) {
            const el = document.getElementById('diag-status');
            if (!el) return;
            el.textContent = msg;
            el.style.color = isError ? '#f44336' : '#4caf50';
            if (_diagStatusTimer) clearTimeout(_diagStatusTimer);
            _diagStatusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
        }

        // Render a compact, human-readable system summary into the on-screen panel.
        function renderSystemDetails(info) {
            const body = document.getElementById('sysinfo-body');
            const panel = document.getElementById('sysinfo-panel');
            if (!body || !panel) return;
            const ob = info.os_browser || {};
            const d = info.display || {};
            const w = info.webgl || {};
            const s = info.storage || {};
            const n = info.network || {};
            const row = (label, val) => `<div><span class="si-label">${label}:</span> ${val ?? 'n/a'}</div>`;
            const html = [
                row('OS', `${(ob.platform || '') + ' ' + (ob.platformVersion || '')}`.trim() || 'n/a'),
                ob.model ? row('Device', ob.model) : '',
                ob.brands && ob.brands.length ? row('Browser', ob.brands.join(', ')) : '',
                row('CPU threads', ob.hardwareConcurrency ?? 'n/a'),
                row('Device memory', ob.deviceMemoryGB != null ? ob.deviceMemoryGB + ' GB' : 'n/a'),
                row('Screen', `${d.screen} @ ${d.devicePixelRatio}x`),
                row('GPU', w.available ? (w.unmaskedRenderer || '(masked)') : 'WebGL unavailable'),
                row('WebGL2', w.available ? w.webgl2 : false),
                row('Max texture', w.maxTextureSize ?? 'n/a'),
                row('Storage quota', s.quotaMB != null ? s.quotaMB + ' MB' : 'n/a'),
                row('Connection', n.effectiveType || 'n/a')
            ].filter(Boolean).join('');
            body.innerHTML = html;
            panel.classList.remove('hidden');
        }

        // Reveal + wire the report controls (idempotent — safe to call once).
        function enableDiagnostics() {
            const section = document.getElementById('diag-section');
            const copyBtn = document.getElementById('copy-report-btn');
            const dlBtn = document.getElementById('download-report-btn');
            if (section) section.classList.remove('hidden');
            if (copyBtn && !copyBtn._wired) { copyBtn.addEventListener('click', copyReport); copyBtn._wired = true; }
            if (dlBtn && !dlBtn._wired) { dlBtn.addEventListener('click', downloadReport); dlBtn._wired = true; }
        }

        // ==== Main Test Runner ====
        async function runTests() {
```

- [ ] **Step 3: Verify all new function names exist exactly once**

```powershell
foreach ($fn in @('buildReportData','buildReportText','copyReport','downloadReport','flashDiagStatus','_diagStatusTimer','renderSystemDetails','enableDiagnostics')) {
    $count = (Select-String -Path "D:\Projects\voxex\index.html" -Pattern "function $fn|let $fn|_diagStatusTimer").Count
    Write-Host "$fn : $count"
}
```

Expected: each shows at least 1. (Some will appear in the function definition AND a call site — that is correct.)

---

### Task 8: Wire it into `runTests()` + build bump (#8)

**Files:**
- Modify: `D:\Projects\voxex\index.html` (end of `runTests()`, ~line 1291)
- Modify: `D:\Projects\voxex\voxEx.html` (~line 3999) — build bump

**Interfaces:**
- Consumes: `collectSystemInfo()` (Task 4), `renderSystemDetails()` (Task 7), `enableDiagnostics()` (Task 7)
- Produces: system info gathered + panel rendered + controls wired after every test run, regardless of pass/fail outcome.

- [ ] **Step 1: Verify the end-of-runTests anchor**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "playBtn\.textContent = 'Play VoxEx';"
```

Expected: one match. Note the surrounding context to confirm it's the final `else` branch.

- [ ] **Step 2: Insert the wiring block after the play-button enable**

Find (the last 4 lines of `runTests()`):
```js
                playBtn.textContent = 'Play VoxEx';
                playBtn.disabled = false;
            }
        }
```

Replace with:
```js
                playBtn.textContent = 'Play VoxEx';
                playBtn.disabled = false;
            }

            // VOXEX-CCR-LAUNCHER-001: gather full system info, render the details panel, and
            // enable the copy/download report controls (runs even if critical tests failed).
            systemInfo = await collectSystemInfo();
            renderSystemDetails(systemInfo);
            enableDiagnostics();
        }
```

- [ ] **Step 3: Verify the wiring lines were inserted**

```powershell
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "systemInfo = await collectSystemInfo"
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "renderSystemDetails\(systemInfo\)"
Select-String -Path "D:\Projects\voxex\index.html" -Pattern "enableDiagnostics\(\)"
```

Expected: one match each.

- [ ] **Step 4: Bump VOXEX_BUILD in voxEx.html**

```powershell
Select-String -Path "D:\Projects\voxex\voxEx.html" -Pattern "const VOXEX_BUILD"
```

Confirm current value is `"2026-06-25.34"`.

Find in `D:\Projects\voxex\voxEx.html`:
```js
            const VOXEX_BUILD = "2026-06-25.34";
```

Replace with:
```js
            const VOXEX_BUILD = "2026-06-29.35";
```

- [ ] **Step 5: Add VOXEX_RECENT_CHANGES entry**

```powershell
Select-String -Path "D:\Projects\voxex\voxEx.html" -Pattern "const VOXEX_RECENT_CHANGES" | Select-Object -First 1
```

Note the line number. Find the opening of the array (it starts with `const VOXEX_RECENT_CHANGES = [`). Prepend a new entry as the first element:

```js
            const VOXEX_RECENT_CHANGES = [
                "VOXEX-CCR-LAUNCHER-001: launcher system exam + shareable diagnostic report (Copy/Download)",
```

(The existing first entry follows on the next line — do not remove it.)

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/voxex
git add index.html voxEx.html
git commit -m "feat(launcher): add system exam + shareable diagnostic report (VOXEX-CCR-LAUNCHER-001)

- Deeper client probes: OS/browser via UA Client Hints, CPU/memory, display,
  full WebGL caps + extension list, storage quota, network class
- Copy Report button (Async Clipboard + textarea fallback for file://)
- Download .json button — pure JSON, parses cleanly
- Optional tester name/notes field
- System Details disclosure panel rendered after tests
- All additive; no existing pass/fail or benchmark logic changed
- VOXEX_BUILD bump: 2026-06-25.34 → 2026-06-29.35

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Safety Checks (run after Task 8 commit)

- [ ] Single-file rule: `git diff HEAD index.html` — no new files in the diff; only `index.html` and `voxEx.html` changed.
- [ ] No duplicate identifiers: grep `index.html` for each new name — `REPORT_SCHEMA`, `systemInfo`, `benchmarkData`, `testRecords`, `collectSystemInfo`, `collectWebGLCaps`, `buildReportData`, `buildReportText`, `copyReport`, `downloadReport`, `flashDiagStatus`, `_diagStatusTimer`, `renderSystemDetails`, `enableDiagnostics`, `sysinfo-panel`, `sysinfo-body`, `diag-section`, `diag-name`, `diag-notes`, `copy-report-btn`, `download-report-btn`, `diag-status` — none should have existed before this CCR.
- [ ] Copy works on `https`/`http` (Async Clipboard) and `file://` (textarea + execCommand).
- [ ] Download produces valid, `JSON.parse`-able `.json` (pure JSON, no readable preamble).
- [ ] Report + controls visible when critical tests fail (Play disabled).
- [ ] Page loads and all tests run without console errors.

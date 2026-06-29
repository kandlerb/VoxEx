# CCR — Launcher System Examination + Shareable Diagnostic Report

**ID:** VOXEX-CCR-LAUNCHER-001
**File:** `index.html` (the System Check & launcher — NOT `voxEx.html`)
**Date:** 2026-06-29
**Status:** 🔴 Proposed
**Scope:** Deepen the launcher's client examination (OS/browser/device, display/input, detailed WebGL caps, storage quota + network) and add a shareable diagnostic report — a **Copy Report** button (clipboard, with an insecure-context fallback) and a **Download .json** button — so a tester who hits problems can send back full system info plus exactly which checks passed/failed and why. Includes an optional tester name/notes field and an on-screen **System Details** panel.

> `index.html` is a self-contained launcher with no build step and no external scripts. **Keep it self-contained** — all CSS/HTML/JS stays inline in this one file (same single-file ethos as `voxEx.html`; no new files, no CDN deps). The launcher uses plain `console.log` (it has no `logDebug`), so new code follows that local convention.

> Line numbers below are from `index.html` as read on 2026-06-29 (1336 lines) and **drift** — grep the quoted anchor before editing and confirm the live code matches the **Before** snippet.

---

## Summary

| # | Site (grep anchor) | Type | Change |
|---|--------------------|------|--------|
| #1 | `const isSecure = protocol === 'https:'` (~435) and `let gpuInfo = {` (~490) | EDIT | Add `REPORT_SCHEMA` const + `systemInfo` / `benchmarkData` / `testRecords` state |
| #2 | after `function showError` (~1193) | ADD | `collectSystemInfo()` + `collectWebGLCaps()` — the deeper examination |
| #3 | `const allTests = [` (~1199) and `results[test.id] = result;` (~1232) | EDIT | Tag each test with a `category`; record normalized `status` + `reason` per test |
| #4 | `const perf = getPerformanceTier(benchResult);` (~1250) | EDIT | Capture `benchmarkData = { perf, raw }` for the report |
| #5 | after `function showError` (~1193) | ADD | `buildReportData()` / `buildReportText()` / `copyReport()` / `downloadReport()` / `flashDiagStatus()` / `renderSystemDetails()` / `enableDiagnostics()` |
| #6 | `<div id="error-container"></div>` (~423) | EDIT | Insert the **System Details** panel + **Share Diagnostics** section |
| #7 | `.btn-secondary:hover { background: #333; }` (~231) | EDIT | CSS for the panel, inputs, button row, status line |
| #8 | end of `runTests()` (~1291) | EDIT | After all tests: collect system info, render the panel, enable the report controls |

### Impact

- Far richer per-machine diagnostics: parsed OS/browser/device (incl. UA Client Hints where available), CPU threads, device memory, display/DPR/input modality, detailed WebGL limits + full extension list, storage quota, and network class.
- One-click **Copy** (human-readable summary + JSON block) and **Download** (pure `.json` for aggregation) — both work even when critical checks fail and **Play** is disabled (the exact case where a tester needs to send a report).
- Optional tester name/notes so reports can be attributed.
- No change to existing pass/fail logic, GPU classification, or the benchmark — these are purely additive.

---

### #1 — Add report schema constant + richer state

**Location:** state declarations — `const isSecure = protocol === 'https:'` (~435) and `let gpuInfo = { renderer: null, vendor: null };` (~490)
**Why:** The report needs a stable schema version (for your aggregation) and three new pieces of state: the collected `systemInfo`, the captured `benchmarkData`, and an ordered list of `testRecords` (id/name/category/status/detail/reason).
**Before (protocol block, ~432-435):**
```js
        // ==== Protocol Detection ====
        const protocol = location.protocol;
        const isFileProtocol = protocol === 'file:';
        const isSecure = protocol === 'https:';
```
**After:**
```js
        // ==== Protocol Detection ====
        const protocol = location.protocol;
        const isFileProtocol = protocol === 'file:';
        const isSecure = protocol === 'https:';

        // VOXEX-CCR-LAUNCHER-001: bump when the report shape changes (for your data collection).
        const REPORT_SCHEMA = 1;
```
**Before (state block, ~488-490):**
```js
        // ==== State ====
        let results = {};
        let gpuInfo = { renderer: null, vendor: null };
```
**After:**
```js
        // ==== State ====
        let results = {};
        let gpuInfo = { renderer: null, vendor: null };
        // VOXEX-CCR-LAUNCHER-001: state for the diagnostic report
        let systemInfo = {};        // populated by collectSystemInfo()
        let benchmarkData = null;   // { perf, raw } captured after runBenchmark()
        const testRecords = [];     // ordered { id, name, category, status, detail, reason }
```
**Verify:** page still loads and runs all tests; `REPORT_SCHEMA` / `systemInfo` / `benchmarkData` / `testRecords` are not declared anywhere else (grep returns exactly these new sites).

---

### #2 — Deeper client examination: `collectSystemInfo()` + `collectWebGLCaps()`

**Location:** insert after the `showError` function (`function showError(testId) { … }`, ends ~1193) and before the `// ==== Main Test Runner ====` banner (~1195).
**Why:** The current launcher only learns GPU renderer/vendor (from `testWebGL`) and a handful of booleans. For data collection you want a full picture: OS/browser/device, CPU/memory, display + input modality, detailed WebGL limits and the full extension list, storage quota, and network class. Each probe is individually guarded so the gather **never throws** — partial data is better than none on locked-down browsers.
**Change:** Add the two functions below verbatim. They allocate nothing global beyond their return object and use modern guards (`?.`, `??`) consistent with the project's JS rules.
**Add (new code):**
```js
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
```
**Verify:** in the browser console after load, `await collectSystemInfo()` returns a populated object on Chrome/Edge (with `os_browser.platform`, `webgl.maxTextureSize`, `storage.quotaMB`, etc.) and a still-valid (partial) object on Firefox/Safari where UA-CH / `deviceMemory` are absent (those fields are `null`/omitted, no throw).

---

### #3 — Record per-test status + reason (what passed/failed and why)

**Location:** `const allTests = [` (~1199) and the test loop body around `results[test.id] = result;` (~1232) inside `runTests()`.
**Why:** `results` is keyed by id and loses category + a human-readable reason. The report needs an ordered list saying, per check, its category, PASS/WARN/FAIL, and *why* (the test's own `detail`, plus the fuller `ERRORS[id].message` for hard failures).
**Change (a) — tag tests with a category.**
**Before (~1199-1203):**
```js
            const allTests = [
                ...CRITICAL_TESTS.map(t => ({ ...t, critical: true })),
                ...STORAGE_TESTS.map(t => ({ ...t, critical: false })),
                ...OPTIONAL_TESTS.map(t => ({ ...t, critical: false })),
            ];
```
**After:**
```js
            const allTests = [
                ...CRITICAL_TESTS.map(t => ({ ...t, critical: true, category: 'Required' })),
                ...STORAGE_TESTS.map(t => ({ ...t, critical: false, category: 'Storage' })),
                ...OPTIONAL_TESTS.map(t => ({ ...t, critical: false, category: 'Optional' })),
            ];
```
**Change (b) — record a normalized status + reason after each test runs.**
**Before (~1230-1238):**
```js
                const fn = testFunctions[test.id];
                const result = fn ? await fn() : { pass: false, detail: 'Not implemented' };
                results[test.id] = result;

                updateTest(test.id, result);

                if (!result.pass && test.critical && !result.skipError) {
                    criticalFailed.push(test.id);
                }
```
**After:**
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
**Verify:** after a run, `testRecords` has one entry per check in display order, each with the right `category` and a `reason` string (e.g. a failed `webgl` row's reason ends with the `ERRORS.webgl.message` text; a warned `opfs` on `file://` reads `Needs HTTP server`).

---

### #4 — Capture benchmark data for the report

**Location:** the benchmark-result block in `runTests()` — `const perf = getPerformanceTier(benchResult);` (~1250).
**Why:** The benchmark currently writes straight to the DOM. The report wants the tier, GPU classification, scores, and capped flag as data.
**Before (~1249-1252):**
```js
                if (benchResult) {
                    const perf = getPerformanceTier(benchResult);
                    benchmarkResultEl.textContent = perf.tier;
                    benchmarkResultEl.style.color = perf.color;
```
**After:**
```js
                if (benchResult) {
                    const perf = getPerformanceTier(benchResult);
                    benchmarkData = { perf, raw: benchResult }; // VOXEX-CCR-LAUNCHER-001
                    benchmarkResultEl.textContent = perf.tier;
                    benchmarkResultEl.style.color = perf.color;
```
**Verify:** after a successful run on a WebGL-capable machine, `benchmarkData.perf.tier` matches the on-screen tier and `benchmarkData.perf.scores` matches the displayed Upload/Draw/Fill numbers.

---

### #5 — Report builders + copy/download + panel/controls wiring

**Location:** insert after the `showError` function (~1193), alongside the #2 additions (before `// ==== Main Test Runner ====`).
**Why:** Turns the collected state into (a) a pure-JSON object for download/aggregation, (b) a human-readable text report (summary + embedded JSON) for the clipboard, plus the clipboard/file handlers, the transient status line, the on-screen System Details renderer, and the idempotent control wiring. **Copy** uses the Async Clipboard API when available and falls back to a hidden-textarea `execCommand('copy')` on insecure origins (e.g. `file://`), so it works in the launcher's restricted contexts. **Download** writes a pure `.json` file (valid JSON — no readable preamble) so it ingests cleanly.
**Add (new code):**
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
```
**Verify:** with the UI from #6/#7 present, clicking **Copy Report** puts a report on the clipboard (the textarea fallback fires on `file://`); **Download .json** saves `voxex-syscheck-<timestamp>.json` whose contents `JSON.parse` cleanly; the tester name/notes appear in both outputs when filled.

---

### #6 — HTML: System Details panel + Share Diagnostics section

**Location:** between `<div id="error-container"></div>` (~423) and the Play button (`<button class="btn btn-primary" id="play-btn" …>`, ~425), inside `#main-container`.
**Why:** Surfaces the collected info on screen and gives the tester the name/notes inputs plus the two buttons. Placed **above** the Play/Skip buttons so it is visible whether the run passed or failed (a failing run is exactly when a report is needed). Both blocks start `hidden` and are revealed by `enableDiagnostics()` / `renderSystemDetails()` after tests finish.
**Before (~421-426):**
```html
        </div>

        <div id="error-container"></div>

        <button class="btn btn-primary" id="play-btn" disabled>Checking...</button>
        <button class="btn btn-secondary hidden" id="skip-btn">Continue Anyway (Limited Features)</button>
```
**After:**
```html
        </div>

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
**Verify:** after a run, the "System Details" disclosure and "Share Diagnostics" block appear above Play; the disclosure expands to show the summary rows; on a critical failure (Play disabled) both blocks are still present and the buttons work.

---

### #7 — CSS for the new UI

**Location:** between `.btn-secondary:hover { background: #333; }` (~231) and `.hidden { display: none !important; }` (~233), inside the existing `<style>` block.
**Why:** Styles the disclosure panel, the inputs, the side-by-side button row, and the status line, matching the launcher's dark theme. Reuses existing `.btn`/`.btn-secondary` and `.section-title`.
**Before (~231-233):**
```css
        .btn-secondary:hover { background: #333; }

        .hidden { display: none !important; }
```
**After:**
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
**Verify:** panel/inputs/buttons render in the dark theme; on a narrow phone viewport the two buttons sit side-by-side and stay ≥48px tall (the existing `@media (pointer: coarse) .btn { min-height: 48px }` still applies).

---

### #8 — Wire it into `runTests()`

**Location:** the end of `runTests()` — just before its closing brace, after the final pass/fail `if (criticalFailed.length > 0) { … } else { … }` block (~1273-1291).
**Why:** After all checks (and the benchmark) run, gather the full system info, paint the System Details panel, and reveal/wire the report controls — in **both** the pass and fail branches (the code below the `if/else` runs unconditionally, so a failed run still gets a working report).
**Before (~1289-1292):**
```js
                playBtn.textContent = 'Play VoxEx';
                playBtn.disabled = false;
            }
        }
```
**After:**
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
**Verify:** on a healthy machine, the panel fills and both buttons work; force a critical failure (e.g. open in a context without WebGL, or temporarily make `testWebGL` return `{ pass:false }`) and confirm the report still generates with `webgl.available:false` and the failing test's reason captured.

---

## Safety Checks

- [ ] Single-file rule honored: all CSS/HTML/JS stays inline in `index.html`; no new files, no external/CDN scripts added.
- [ ] New identifiers don't collide — grep `index.html` confirms zero prior hits for: `REPORT_SCHEMA`, `systemInfo`, `benchmarkData`, `testRecords`, `collectSystemInfo`, `collectWebGLCaps`, `buildReportData`, `buildReportText`, `copyReport`, `downloadReport`, `flashDiagStatus`, `_diagStatusTimer`, `renderSystemDetails`, `enableDiagnostics`, and DOM ids `sysinfo-panel`/`sysinfo-body`/`diag-section`/`diag-name`/`diag-notes`/`copy-report-btn`/`download-report-btn`/`diag-status`.
- [ ] No change to existing test logic, `classifyGPU`, `getPerformanceTier`, or the benchmark math — #3/#4 only *read* their outputs; #1/#2/#5/#8 are additive.
- [ ] Strict equality throughout; `??`/`?.` for optional fields (not `||` where `0`/`''`/`false` are valid); no `var`.
- [ ] Every system probe is guarded — `collectSystemInfo()` / `collectWebGLCaps()` return partial objects (never throw) on browsers lacking UA Client Hints, `deviceMemory`, `navigator.connection`, `storage.estimate`, or WebGL.
- [ ] Copy works on `https`/`http` (Async Clipboard) **and** `file://` (textarea + `execCommand` fallback); Download produces valid, `JSON.parse`-able `.json` (pure JSON, no readable preamble).
- [ ] Report + controls function when `criticalFailed.length > 0` (Play disabled) — the #8 block runs in both branches.
- [ ] DOM ids referenced in JS (#5/#8) all exist in the #6 HTML; new buttons are wired exactly once (`_wired` guard).
- [ ] Manual matrix: Chrome/Edge (full UA-CH), Firefox & Safari (partial — no UA-CH/deviceMemory), one mobile browser (touch + coarse pointer), and a `file://` open (OPFS/CDN warn paths still copy/download).
- [ ] No new privacy surprise: the report contains only client-capability data the page already had access to (UA, GPU strings, screen, quota) plus whatever the tester voluntarily types into name/notes; nothing is auto-uploaded — the tester explicitly copies/downloads and sends it themselves.

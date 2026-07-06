#!/usr/bin/env node
// ============================================================================
// run-browser-tests.mjs — run the AUTHORITATIVE browser suite headlessly
// ----------------------------------------------------------------------------
// Serves the repo over localhost, drives headless Chrome/Edge/Chromium via the
// DevTools protocol (zero npm dependencies — uses Node 22's built-in
// WebSocket), clicks "Run All Tests" on tools/voxex-tests.html, waits for the
// summary, and prints failures. This is the same 283+ test suite the release
// checklist requires — now runnable by any agent without a human at a browser.
//
// Usage:
//   node tools/run-browser-tests.mjs [--chrome=/path/to/chrome] [--timeout=300]
//
// Chrome discovery order: --chrome=, $CHROME, then common install paths
// (Windows Chrome/Edge, Linux chromium/google-chrome, macOS Chrome).
// Exit 0 = all tests passed. 1 = failures. 2 = infrastructure problem.
//
// NOTE for sandboxed agents: this needs a real Chromium binary. See
// docs/agent-notes.md §7 for the no-root bootstrap if none is installed.
// ============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const TIMEOUT_S = Number(args.timeout || 300);

// --- find a browser ------------------------------------------------------------
const candidates = [
  args.chrome, process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chrome = candidates.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome/Edge/Chromium found. Pass --chrome=/path or set $CHROME.');
  process.exit(2);
}

// --- static server ---------------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(join(repoRoot, decodeURIComponent(new URL(req.url, 'http://x').pathname))).replace(/[?#].*$/, '');
    if (!path.startsWith(repoRoot)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const testUrl = `http://127.0.0.1:${port}/tools/voxex-tests.html`;

// --- launch headless browser ------------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'voxex-chrome-'));
const proc = spawn(chrome, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--mute-audio',
  '--disable-extensions', '--no-first-run', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const onData = (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  };
  proc.stderr.on('data', onData); proc.stdout.on('data', onData);
  proc.on('exit', (c) => reject(new Error(`browser exited early (code ${c})\n${buf.slice(-800)}`)));
  setTimeout(() => reject(new Error(`no DevTools endpoint after 20s\n${buf.slice(-800)}`)), 20000);
});

// --- minimal CDP client -------------------------------------------------------------
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP connect failed')); });
let msgId = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
};
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const cleanup = () => { try { proc.kill(); } catch { } try { server.close(); } catch { } try { rmSync(profile, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);

let exitCode = 2;
try {
  const { targetId } = await cdp('Target.createTarget', { url: testUrl });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'page evaluate threw');
    return r.result.value;
  };

  // wait for the page + suite to be ready
  const t0 = Date.now();
  while (await evaluate('typeof runAllTests') !== 'function') {
    if (Date.now() - t0 > 30000) throw new Error('voxex-tests.html loaded but runAllTests never appeared');
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`Suite loaded at ${testUrl} — running (timeout ${TIMEOUT_S}s)...`);
  await evaluate('void runAllTests()');

  // poll the summary until done
  let summary = '';
  for (; ;) {
    if ((Date.now() - t0) / 1000 > TIMEOUT_S) throw new Error(`suite did not finish within ${TIMEOUT_S}s (last progress: "${await evaluate("document.getElementById('progress')?.textContent || ''")}")`);
    summary = await evaluate("document.getElementById('summary')?.textContent || ''");
    if (/tests passed/.test(summary)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const suitesJson = await evaluate(`JSON.stringify(suites.map(s => ({
    name: s.name,
    tests: s.tests.map(t => ({ name: t.name, passed: t.passed, error: t.error }))
  })))`);
  const suitesData = JSON.parse(suitesJson);
  const failures = [];
  for (const s of suitesData) for (const t of s.tests) if (!t.passed) failures.push(`  FAIL  [${s.name}] ${t.name}${t.error ? ` — ${t.error}` : ''}`);

  console.log(`\n${summary}`);
  if (failures.length) { console.log(`\nFailures:\n${failures.join('\n')}`); exitCode = 1; }
  else exitCode = 0;
} catch (e) {
  console.error(`INFRASTRUCTURE ERROR: ${e.message}`);
  exitCode = 2;
} finally {
  cleanup();
}
process.exit(exitCode);

#!/usr/bin/env node
// ============================================================================
// syntax-check.mjs — headless JS syntax gate for voxEx.html
// ----------------------------------------------------------------------------
// Extracts every <script> block from voxEx.html and runs `node --check` on it
// (module semantics for type="module"). No browser, no execution — pure parse.
//
// Catches, in seconds, the failure classes that used to reach the browser:
//   - syntax errors / unbalanced braces from a bad edit
//   - duplicate `const`/`let`/`class` declarations in the same scope
//     (SyntaxError at parse time — the checklist's "no redeclaration" item)
//   - FILE TRUNCATION (missing </html>, unterminated script -> parse error);
//     sandboxed agents: a FAIL here on an un-edited file usually means the
//     FUSE mount is serving a stale/truncated view — check with the Read tool
//     before assuming the real file is broken (docs/agent-notes.md section 7)
//
// Usage: node tools/syntax-check.mjs [path/to/voxEx.html]
// Exit 0 = all script blocks parse. Exit 1 = failure (details with REAL
// voxEx.html line numbers). Exit 2 = extraction problem.
// ============================================================================
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.argv[2] || fileURLToPath(new URL('../voxEx.html', import.meta.url));
const src = readFileSync(file, 'utf8');
const lines = src.split('\n');

let failures = 0;

// --- structural sanity ---------------------------------------------------------
if (!src.trimEnd().endsWith('</html>')) {
  console.log('FAIL  file does not end with </html> — TRUNCATED file (or stale sandbox mount; verify with the Read tool)');
  failures++;
}

// --- collect script blocks ------------------------------------------------------
/** @type {{startLine:number, endLine:number, type:string, code:string}[]} */
const blocks = [];
{
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/<script(\s[^>]*)?>/);
    if (m && !/src\s*=/.test(m[1] || '')) {
      const type = /type\s*=\s*"([^"]+)"/.exec(m[1] || '')?.[1] || 'classic';
      const start = i;
      let j = i + 1;
      while (j < lines.length && !/<\/script>/.test(lines[j])) j++;
      if (j >= lines.length) {
        console.log(`FAIL  <script> opened at line ${start + 1} never closes — truncated file`);
        failures++;
        break;
      }
      blocks.push({ startLine: start + 2, endLine: j, type, code: lines.slice(i + 1, j).join('\n') });
      i = j + 1;
    } else i++;
  }
}
if (blocks.length === 0) { console.error('EXTRACTION FAILED: no <script> blocks found'); process.exit(2); }

// --- parse each block ------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'voxex-syntax-'));
try {
  for (const b of blocks) {
    if (b.type === 'importmap' || b.type === 'application/json') {
      try { JSON.parse(b.code); console.log(`PASS  importmap (lines ${b.startLine}-${b.endLine}) — valid JSON`); }
      catch (e) { console.log(`FAIL  importmap (lines ${b.startLine}-${b.endLine}) — ${e.message}`); failures++; }
      continue;
    }
    const isModule = b.type === 'module';
    const tmp = join(dir, `block-${b.startLine}.${isModule ? 'mjs' : 'cjs'}`);
    writeFileSync(tmp, b.code, 'utf8');
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    if (r.status === 0) {
      console.log(`PASS  ${b.type} script (lines ${b.startLine}-${b.endLine}, ${b.endLine - b.startLine + 1} lines)`);
    } else {
      failures++;
      // map "block-NNN.mjs:K" back to the real voxEx.html line (K + startLine - 1)
      const msg = (r.stderr || r.stdout || 'unknown parse error')
        .replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)', 'g'),
          (_, k) => `voxEx.html:${Number(k) + b.startLine - 1}`)
        .split('\n').slice(0, 6).join('\n');
      console.log(`FAIL  ${b.type} script (lines ${b.startLine}-${b.endLine}):\n${msg}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nSYNTAX GREEN — all script blocks parse' : `\n${failures} SYNTAX CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

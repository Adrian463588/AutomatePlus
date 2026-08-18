import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readRuntimePackReport, findVerifiedPack } from './runtime-pack-check.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const enabled = process.env.AUTOMATEPLUS_ONLINE_E2E === '1';
const targetUrl = process.env.AUTOMATEPLUS_K6_TARGET_URL || 'https://petstore.swagger.io/v2/store/inventory';
const evidenceRoot = join(root, '.automateplus', 'evidence');
const runtimeReport = readRuntimePackReport(root);
const pack = findVerifiedPack(runtimeReport, { names: ['k6'], capabilities: ['k6'] });
const allowedTargets = new Set([
  'https://petstore.swagger.io/v2/store/inventory',
  'https://reqres.in/api/users?page=1',
]);

function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function blocked(reason) {
  console.log(JSON.stringify({ status: 'Blocked', reason, targetUrl }, null, 2));
  process.exitCode = 2;
}

if (!enabled) {
  blocked('Set AUTOMATEPLUS_ONLINE_E2E=1 to allow explicit target-online load traffic.');
} else if (!allowedTargets.has(targetUrl)) {
  blocked('AUTOMATEPLUS_K6_TARGET_URL must be one of the declared Petstore or ReqRes acceptance targets.');
} else if (!pack || !existsSync(pack.path)) {
  blocked('A checksum- and license-verified local k6 runtime pack is required; no download or PATH fallback is permitted.');
} else {
  const work = mkdtempSync(join(tmpdir(), 'automateplus-k6-'));
  const script = `import http from 'k6/http';\nimport { check } from 'k6';\nexport const options = { vus: 1, duration: '1s' };\nexport default function () { const response = http.get(__ENV.TARGET_URL); check(response, { 'target returned 2xx': (value) => value.status >= 200 && value.status < 300 }); }\n`;
  const scriptPath = join(work, 'target.js');
  writeFileSync(scriptPath, script, 'utf8');
  try {
    const result = spawnSync(pack.path, ['run', '--summary-export', join(work, 'summary.json'), scriptPath], {
      cwd: work,
      env: { ...process.env, TARGET_URL: targetUrl },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120_000,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'explicit-target-online-k6',
      status: result.status === 0 ? 'Verified' : 'Failed',
      targetUrl,
      exitCode: result.status ?? 1,
      outputSha256: sha256(output),
      secretPolicy: 'environment values are not emitted',
    };
    mkdirSync(evidenceRoot, { recursive: true });
    const evidence = JSON.stringify(report, null, 2);
    const evidencePath = join(evidenceRoot, `k6-online-${Date.now()}.json`);
    writeFileSync(evidencePath, evidence, 'utf8');
    console.log(JSON.stringify({ ...report, evidencePath: evidencePath.replaceAll('\\', '/'), evidenceSha256: sha256(evidence) }, null, 2));
    process.exitCode = report.status === 'Verified' ? 0 : 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

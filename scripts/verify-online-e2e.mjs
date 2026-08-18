import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readRuntimePackReport } from './runtime-pack-check.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceRoot = join(root, '.automateplus', 'evidence');
const enabled = process.env.AUTOMATEPLUS_ONLINE_E2E === '1';
const timeoutMs = 20_000;

const targets = {
  sauceDemo: 'https://www.saucedemo.com/',
  demoQa: 'https://demoqa.com/',
  reqRes: 'https://reqres.in/api/users?page=1',
  petstoreInventory: 'https://petstore.swagger.io/v2/store/inventory',
  petstoreAvailablePets: 'https://petstore.swagger.io/v2/pet/findByStatus?status=available',
};

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function request(name, url, { headers = {}, validate } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const body = await response.text();
    const checks = validate ? validate(response, body) : [];
    const passed = response.ok && checks.every((check) => check.passed);
    return {
      name,
      status: passed ? 'Verified' : 'Failed',
      url,
      httpStatus: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      bytes: Buffer.byteLength(body),
      bodySha256: sha256(body),
      durationMs: Date.now() - startedAt,
      checks,
    };
  } catch (error) {
    return {
      name,
      status: 'Failed',
      url,
      durationMs: Date.now() - startedAt,
      checks: [{ name: 'request completed', passed: false, detail: error instanceof Error ? error.message : String(error) }],
    };
  } finally {
    clearTimeout(timer);
  }
}

function htmlChecks(body, expectedText, expectedSelector) {
  return [
    { name: `contains ${expectedText}`, passed: body.includes(expectedText) },
    { name: `contains ${expectedSelector}`, passed: body.includes(expectedSelector) },
  ];
}

function jsonChecks(body, predicate) {
  try {
    const parsed = JSON.parse(body);
    return [{ name: 'JSON response shape', passed: predicate(parsed) }];
  } catch {
    return [{ name: 'JSON response shape', passed: false, detail: 'response was not valid JSON' }];
  }
}

function statusOf(results) {
  if (results.some((result) => result.status === 'Failed')) return 'Failed';
  if (results.some((result) => result.status === 'Blocked')) return 'Blocked';
  if (results.some((result) => result.status === 'NeedsReview')) return 'NeedsReview';
  return 'Verified';
}

function componentMatrixStatus() {
  const script = join(root, 'scripts', 'verify-generators.mjs');
  if (!existsSync(join(root, 'frontend', 'packages', 'generators', 'dist', 'index.js')) || !existsSync(script)) {
    return { status: 'Blocked', reason: 'generator build output is unavailable; run npm run verify:generators first' };
  }
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  return result.status === 0
    ? { status: 'Verified', combinations: 27, evidenceSha256: sha256(`${result.stdout ?? ''}\n${result.stderr ?? ''}`), note: 'all generated projects passed structural authenticity checks; real framework execution is reported separately below' }
    : { status: 'Failed', reason: 'generator matrix command failed', outputSha256: sha256(`${result.stdout ?? ''}\n${result.stderr ?? ''}`) };
}

function runtimeStatus(report) {
  const missing = [];
  if (!report.packs.length) missing.push(report.reason ?? 'no verified offline runtime packs are available');
  if (!process.env.AUTOMATEPLUS_BROWSER_EXECUTABLE || !existsSync(process.env.AUTOMATEPLUS_BROWSER_EXECUTABLE)) {
    missing.push('AUTOMATEPLUS_BROWSER_EXECUTABLE is not set to a local browser executable');
  }
  return missing.length ? { status: 'Blocked', reasons: missing } : { status: 'NeedsReview', reasons: ['browser driver execution command is not configured'] };
}

async function main() {
  if (!enabled) {
    const blocked = { status: 'Blocked', reason: 'Set AUTOMATEPLUS_ONLINE_E2E=1 to allow explicit target-online traffic.' };
    console.log(JSON.stringify(blocked, null, 2));
    process.exitCode = 2;
    return;
  }

  const results = [];
  results.push(await request('SauceDemo landing page', targets.sauceDemo, {
    validate: (_response, body) => htmlChecks(body, 'Swag Labs', 'id="root"'),
  }));
  results.push(await request('DemoQA landing page', targets.demoQa, {
    validate: (_response, body) => htmlChecks(body, 'demosite', 'id="root"'),
  }));
  const reqResKey = process.env.AUTOMATEPLUS_REQRES_API_KEY;
  results.push(reqResKey
    ? await request('ReqRes users API', targets.reqRes, {
      headers: { 'x-api-key': reqResKey, accept: 'application/json' },
      validate: (_response, body) => jsonChecks(body, (value) => Array.isArray(value?.data) && value.data.length > 0),
    })
    : { name: 'ReqRes users API', status: 'Blocked', url: targets.reqRes, checks: [{ name: 'credential available', passed: false, detail: 'AUTOMATEPLUS_REQRES_API_KEY is not set; the service currently requires x-api-key' }] });
  results.push(await request('Swagger Petstore inventory', targets.petstoreInventory, {
    headers: { accept: 'application/json' },
    validate: (_response, body) => jsonChecks(body, (value) => value && typeof value === 'object' && !Array.isArray(value)),
  }));
  results.push(await request('Swagger Petstore available pets', targets.petstoreAvailablePets, {
    headers: { accept: 'application/json' },
    validate: (_response, body) => jsonChecks(body, (value) => Array.isArray(value)),
  }));

  const packReport = readRuntimePackReport(root);
  const componentMatrix = componentMatrixStatus();
  const runtime = runtimeStatus(packReport);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'explicit-target-online',
    status: statusOf([...results, componentMatrix, runtime]),
    targetResults: results,
    componentGeneratorMatrix: componentMatrix,
    realFrameworkRuntime: runtime,
    secretPolicy: 'credentials are read from environment and never emitted in this report',
  };
  mkdirSync(evidenceRoot, { recursive: true });
  const evidence = JSON.stringify(report, null, 2);
  const evidencePath = join(evidenceRoot, `online-e2e-${Date.now()}.json`);
  writeFileSync(evidencePath, evidence, 'utf8');
  console.log(JSON.stringify({ ...report, evidencePath: evidencePath.replaceAll('\\', '/'), evidenceSha256: sha256(evidence) }, null, 2));
  process.exitCode = report.status === 'Verified' ? 0 : report.status === 'Failed' ? 1 : 2;
}

await main();

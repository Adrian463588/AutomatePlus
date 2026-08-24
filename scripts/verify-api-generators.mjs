import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { GeneratorFactory } from '@automate-plus/generators';
import { readCatalog } from './runtime-catalog.mjs';

const root = resolve(import.meta.dirname, '..');
const evidenceRoot = join(root, '.automateplus', 'evidence');
const onlineEnabled = process.env.AUTOMATEPLUS_ONLINE_E2E === '1';
const reqResApiKey = process.env.AUTOMATEPLUS_REQRES_API_KEY;

const targets = [
  {
    id: 'petstore-inventory',
    url: 'https://petstore.swagger.io/v2/store/inventory',
    baseUrl: 'https://petstore.swagger.io/v2',
    expectedStatus: 200,
    headers: {},
  },
  {
    id: 'reqres-user',
    url: 'https://reqres.in/api/users/2',
    baseUrl: 'https://reqres.in/api',
    expectedStatus: 200,
    headers: { 'x-api-key': { kind: 'secret', key: 'AUTOMATEPLUS_REQRES_API_KEY' } },
  },
];

const combinations = GeneratorFactory.getSupportedCombinations()
  .filter((combination) => combination.platforms.includes('api'))
  .map(({ framework, language }) => ({ framework, language }));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sessionFor(target, combination) {
  const prefix = `${target.id}-${combination.framework}-${combination.language}`;
  const steps = [
    {
      id: `00000000-0000-4000-8000-${sha256(`${prefix}-request`).slice(0, 12)}`,
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method: 'GET',
        url: target.url,
        headers: target.headers,
        queryParams: {},
        bodyType: 'none',
        extractedVariables: [],
      },
      timeoutMs: 15_000,
      timestamp: 1,
      optional: false,
    },
    {
      id: `00000000-0000-4000-8000-${sha256(`${prefix}-status`).slice(0, 12)}`,
      schemaVersion: 2,
      stepNumber: 2,
      platform: 'api',
      action: 'assertStatusCode',
      expectedValue: String(target.expectedStatus),
      timeoutMs: 15_000,
      timestamp: 2,
      optional: false,
    },
  ];
  if (combination.framework === 'http') {
    steps.push(
      {
        id: `00000000-0000-4000-8000-${sha256(`${prefix}-header`).slice(0, 12)}`,
        schemaVersion: 2,
        stepNumber: 3,
        platform: 'api',
        action: 'assertHeader',
        attributeName: 'content-type',
        expectedValue: 'application/json',
        timeoutMs: 15_000,
        timestamp: 3,
        optional: false,
      },
      {
        id: `00000000-0000-4000-8000-${sha256(`${prefix}-time`).slice(0, 12)}`,
        schemaVersion: 2,
        stepNumber: 4,
        platform: 'api',
        action: 'assertResponseTime',
        expectedValue: '15000',
        timeoutMs: 15_000,
        timestamp: 4,
        optional: false,
      },
    );
  }
  return {
    id: `00000000-0000-4000-8000-${sha256(prefix).slice(0, 12)}`,
    projectId: '00000000-0000-4000-8000-000000000301',
    name: `API ${target.id}`,
    platform: 'api',
    targetConfig: { baseUrl: target.baseUrl },
    environmentVariables: {},
    steps,
    createdAt: 1,
    updatedAt: 1,
  };
}

function sourceFor(project) {
  return project.files.map((file) => `${file.relativePath}\n${file.content}`).join('\n');
}

function assertNoFabricatedOutput(project) {
  for (const file of project.files) {
    assert.doesNotMatch(file.content, /\bTODO\b|50%,50%|com\.example|\.local(?:\/|['"])/u, `${file.relativePath} contains fabricated output`);
    assert.doesNotMatch(file.content, /fixed serial|fake|dummy|placeholder/iu, `${file.relativePath} contains fake output marker`);
  }
}

function syntaxCheck(file, tempRoot) {
  const path = join(tempRoot, file.relativePath);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, file.content, 'utf8');

  if (file.language === 'javascript') {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? undefined : result.stderr || result.stdout || 'node --check failed';
  }
  if (file.language === 'typescript') {
    const result = ts.transpileModule(file.content, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true },
      reportDiagnostics: true,
    });
    const diagnostics = result.diagnostics ?? [];
    return diagnostics.length === 0 ? undefined : ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n');
  }
  if (file.language === 'python') {
    const result = spawnSync('python', ['-m', 'py_compile', path], { encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? undefined : result.stderr || result.stdout || 'python -m py_compile failed';
  }
  if (file.language === 'java') {
    assert.match(file.content, /public class [A-Za-z0-9_]+ApiTest/u, `${file.relativePath} Java class missing`);
    assert.match(file.content, /@Test/u, `${file.relativePath} Java test method missing`);
  }
  return undefined;
}

function runtimeStatus(catalog) {
  const manifestPath = join(root, 'runtime-packs', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) {
    return { status: 'Blocked', reason: 'No verified offline runtime packs are present; generated API runners cannot be executed.' };
  }
  const required = new Set(combinations.flatMap(({ framework, language }) => {
    const generator = GeneratorFactory.getGenerator(framework, language);
    return generator.manifest.requiredRuntimePacks;
  }));
  const missing = [...required].filter((id) => !manifest.packs.some((pack) => pack.id === id && pack.status === 'verified'));
  if (missing.length > 0) return { status: 'Blocked', reason: `Verified API runtime packs are missing: ${missing.join(', ')}` };
  return { status: 'NeedsReview', reason: 'Runtime packs exist but generated-project execution still requires fresh health evidence.' };
}

async function checkTarget(target) {
  if (!onlineEnabled) return { status: 'Blocked', reason: 'Set AUTOMATEPLUS_ONLINE_E2E=1 for explicit target-online checks.' };
  if (target.id.startsWith('reqres') && !reqResApiKey) return { status: 'Blocked', reason: 'AUTOMATEPLUS_REQRES_API_KEY is not set; no credential was fabricated.' };

  const headers = target.id.startsWith('reqres') ? { 'x-api-key': reqResApiKey } : {};
  const startedAt = Date.now();
  try {
    const response = await fetch(target.url, { headers, signal: AbortSignal.timeout(15_000) });
    const body = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? '';
    const status = response.status === target.expectedStatus && contentType.toLowerCase().includes('application/json') ? 'Verified' : 'Failed';
    return {
      status,
      httpStatus: response.status,
      contentType,
      bytes: body.byteLength,
      bodySha256: sha256(body),
      durationMs: Date.now() - startedAt,
      ...(status === 'Failed' ? { reason: `Expected HTTP ${target.expectedStatus} and JSON content type.` } : {}),
    };
  } catch (error) {
    return { status: 'Failed', durationMs: Date.now() - startedAt, reason: error instanceof Error ? error.message : String(error) };
  }
}

const catalog = readCatalog(undefined, { requireGeneratorCoverage: true });
if (!catalog.validation.ok) throw new Error(`runtime catalog is invalid: ${catalog.validation.errors.join('; ')}`);
assert.equal(combinations.length, 5, `Expected 5 API generators, received ${combinations.length}`);

const tempRoot = mkdtempSync(join(tmpdir(), 'automateplus-api-generators-'));
const generated = [];
try {
  for (const combination of combinations) {
    const generator = GeneratorFactory.getGenerator(combination.framework, combination.language);
    for (const target of targets) {
      const project = await generator.generateFullProject(sessionFor(target, combination));
      assert.equal(project.entrypoint, project.files[0]?.relativePath, `${combination.framework}/${combination.language}: entrypoint mismatch`);
      assert.ok(project.files.some((file) => file.relativePath === 'automateplus.manifest.json'), `${combination.framework}/${combination.language}: manifest missing`);
      assertNoFabricatedOutput(project);
      const syntaxErrors = project.files
        .map((file) => ({ file: file.relativePath, error: syntaxCheck(file, tempRoot) }))
        .filter((entry) => entry.error);
      assert.equal(syntaxErrors.length, 0, `${combination.framework}/${combination.language}: syntax errors ${JSON.stringify(syntaxErrors)}`);
      generated.push({
        ...combination,
        target: target.id,
        entrypoint: project.entrypoint,
        sourceSha256: sha256(sourceFor(project)),
        requiredRuntimePacks: project.manifest.requiredRuntimePacks,
        status: 'GeneratedAndParsed',
      });
    }
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

const targetChecks = [];
for (const target of targets) targetChecks.push({ target: target.id, ...(await checkTarget(target)) });
const execution = runtimeStatus(catalog);
const report = {
  generatedAt: new Date().toISOString(),
  suite: 'ApiGeneratorMatrix',
  targetContract: 'Generated projects reference real ReqRes and Petstore endpoints; no mock response, interceptor, or fabricated credential is used.',
  combinations: generated,
  targetChecks,
  generatedProjectCount: generated.length,
  execution,
  status: targetChecks.some((result) => result.status === 'Failed') ? 'Failed' : targetChecks.some((result) => result.status === 'Blocked') || execution.status === 'Blocked' ? 'Blocked' : 'Verified',
};

mkdirSync(evidenceRoot, { recursive: true });
const evidence = JSON.stringify(report, null, 2);
const evidencePath = join(evidenceRoot, `api-generators-${Date.now()}.json`);
writeFileSync(evidencePath, evidence, 'utf8');
console.log(JSON.stringify({ ...report, evidencePath: evidencePath.replaceAll('\\', '/'), evidenceSha256: sha256(evidence) }, null, 2));
process.exitCode = report.status === 'Verified' ? 0 : report.status === 'Blocked' ? 2 : 1;

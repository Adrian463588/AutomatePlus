import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { GeneratorFactory } from '@automate-plus/generators';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceRoot = join(root, '.automateplus', 'evidence');
const webCombinations = GeneratorFactory.getSupportedCombinations()
  .filter((combination) => combination.platforms.includes('web'))
  .map(({ framework, language }) => ({ framework, language }));

const targets = [
  {
    id: 'saucedemo-login',
    url: 'https://www.saucedemo.com/',
    steps: [
      { action: 'navigate', value: 'https://www.saucedemo.com/' },
      { action: 'fill', locator: '[data-test="username"]', value: 'standard_user' },
      { action: 'fill', locator: '[data-test="password"]', value: 'secret_sauce' },
      { action: 'click', locator: '[data-test="login-button"]' },
      { action: 'assertVisible', locator: '#inventory_container' },
      { action: 'assertText', locator: '#item_4_title_link', expectedValue: 'Sauce Labs Backpack' },
    ],
  },
  {
    id: 'demoqa-text-box',
    url: 'https://demoqa.com/text-box',
    steps: [
      { action: 'navigate', value: 'https://demoqa.com/text-box' },
      { action: 'fill', locator: '#userName', value: 'AutomatePlus User' },
      { action: 'fill', locator: '#userEmail', value: 'automateplus@example.com' },
      { action: 'click', locator: '#submit' },
      { action: 'assertVisible', locator: '#output' },
      { action: 'assertText', locator: '#name', expectedValue: 'Name:AutomatePlus User' },
    ],
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sessionFor(target) {
  return {
    id: `00000000-0000-4000-8000-${target.id === 'saucedemo-login' ? '000000000201' : '000000000202'}`,
    projectId: '00000000-0000-4000-8000-000000000200',
    name: target.id,
    platform: 'web',
    targetConfig: { startUrl: target.url, viewport: { width: 1280, height: 800 } },
    environmentVariables: {},
    steps: target.steps.map((step, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      schemaVersion: 2,
      stepNumber: index + 1,
      platform: 'web',
      action: step.action,
      ...(step.locator ? { locators: [{ strategy: 'css', value: step.locator, score: 100 }] } : {}),
      ...(step.value !== undefined ? { value: step.value } : {}),
      ...(step.expectedValue !== undefined ? { expectedValue: step.expectedValue } : {}),
      timeoutMs: 10_000,
      timestamp: index + 1,
      optional: false,
    })),
    createdAt: 1,
    updatedAt: 1,
  };
}

function actionContractSession(combination) {
  const generator = GeneratorFactory.getGenerator(combination.framework, combination.language);
  const locator = { strategy: 'css', value: '#automation-target', score: 100 };
  const steps = generator.manifest.supportedActions.map((action, index) => ({
    action,
    ...(['navigate', 'scroll', 'sleep', 'takeScreenshot', 'assertUrl'].includes(action) ? {} : { locators: [locator] }),
    value: ['navigate', 'fill', 'pressKey', 'takeScreenshot'].includes(action)
      ? action === 'navigate'
        ? 'https://www.saucedemo.com/'
        : action === 'pressKey'
          ? 'ENTER'
          : action === 'takeScreenshot'
            ? `web-action-${index + 1}.png`
            : 'AutomatePlus value'
      : undefined,
    expectedValue: ['assertText', 'assertValue', 'assertUrl'].includes(action)
      ? action === 'assertUrl'
        ? 'saucedemo.com'
        : 'AutomatePlus value'
      : undefined,
    ...(action === 'scroll' ? { scrollOffset: { deltaX: 0, deltaY: 120 } } : {}),
    ...(action === 'dragAndDrop'
      ? { dragTarget: { locators: [{ strategy: 'css', value: '#automation-drop-target', score: 100 }] } }
      : {}),
  }));
  return {
    ...sessionFor(targets[0]),
    id: `00000000-0000-4000-8000-${String(300 + webCombinations.findIndex((item) => item.framework === combination.framework && item.language === combination.language)).padStart(12, '0')}`,
    name: `${combination.framework}-${combination.language}-action-contract`,
    steps: steps.map((step, index) => ({
      id: `00000000-0000-4000-8000-${String(400 + index).padStart(12, '0')}`,
      schemaVersion: 2,
      stepNumber: index + 1,
      platform: 'web',
      ...step,
      timeoutMs: 10_000,
      timestamp: index + 1,
      optional: false,
    })),
  };
}

function assertionContractSession() {
  const base = sessionFor(targets[0]);
  const { value: _value, expectedValue: _expectedValue, ...firstStep } = base.steps[0];
  return {
    ...base,
    name: 'assertion-metadata-fallback',
    steps: [{
      ...firstStep,
      action: 'assertText',
      locators: [{ strategy: 'css', value: '#automation-target', score: 100 }],
      assertion: { operator: 'equals', expected: 'Assertion fallback value' },
    }],
  };
}

function writeTempFile(rootPath, relativePath, content) {
  const filePath = join(rootPath, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function syntaxCheck(file, tempRoot) {
  const filePath = writeTempFile(tempRoot, file.relativePath, file.content);
  if (file.relativePath.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? undefined : `${result.stderr || result.stdout}`.trim();
  }
  if (file.relativePath.endsWith('.ts')) {
    const result = ts.transpileModule(file.content, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext },
      reportDiagnostics: true,
    });
    const diagnostics = result.diagnostics ?? [];
    return diagnostics.length === 0
      ? undefined
      : diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('; ');
  }
  if (file.relativePath.endsWith('.py')) {
    const result = spawnSync('python', ['-m', 'py_compile', filePath], { encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? undefined : `${result.stderr || result.stdout}`.trim();
  }
  return undefined;
}

function assertRunnerContract(project) {
  const entrypoint = project.files.find((file) => file.relativePath === project.entrypoint);
  assert.ok(entrypoint, `${project.framework}/${project.language}: entrypoint missing`);
  const packageFile = project.files.find((file) => file.relativePath === 'package.json');
  const packageJson = packageFile ? JSON.parse(packageFile.content) : undefined;
  const content = project.files.map((file) => file.content).join('\n');

  if (packageJson) {
    assert.equal(packageJson.type, 'module', `${project.framework}/${project.language}: generated Node project must be ESM`);
    assert.ok(packageJson.scripts?.test, `${project.framework}/${project.language}: test command missing`);
  }
  if (['puppeteer', 'selenium'].includes(project.framework) && ['typescript', 'javascript'].includes(project.language)) {
    assert.match(content, /async function main\(/u, `${project.framework}/${project.language}: standalone runner missing`);
    assert.match(content, /await main\(\);/u, `${project.framework}/${project.language}: standalone invocation missing`);
    assert.doesNotMatch(content, /\b(?:describe|beforeAll|afterAll|expect)\s*\(/u, `${project.framework}/${project.language}: undeclared test-runner API emitted`);
  }
  if (project.framework === 'playwright' && ['typescript', 'javascript'].includes(project.language)) assert.match(content, /@playwright\/test/u);
  if (project.framework === 'playwright' && project.language === 'python') assert.match(content, /playwright\.sync_api/u);
  if (project.framework === 'playwright' && project.language === 'java') assert.match(content, /com\.microsoft\.playwright/u);
  if (project.framework === 'cypress') assert.match(content, /\bdescribe\(/u);
  if (project.language === 'python') assert.match(project.files.find((file) => file.relativePath === 'requirements.txt')?.content ?? '', /pytest==/u);
  if (project.language === 'robot') assert.match(project.files.find((file) => file.relativePath === 'requirements.txt')?.content ?? '', /robotframework==/u);
  if (project.language === 'java') assert.match(project.files.find((file) => file.relativePath === 'pom.xml')?.content ?? '', /<artifactId>/u);
  if (['puppeteer', 'selenium'].includes(project.framework) && project.language === 'java') {
    assert.doesNotMatch(content, /\bexpect\s*\(/u, `${project.framework}/${project.language}: undeclared assertion API emitted`);
    assert.doesNotMatch(content, /WebElement el\b/u, `${project.framework}/${project.language}: non-unique element variable emitted`);
  }
}

function checkLocalRuntime(combination) {
  if (['typescript', 'javascript'].includes(combination.language)) {
    const packageName = combination.framework === 'playwright' ? '@playwright/test' : combination.framework;
    const probe = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(packageName)}).then(() => process.exit(0)).catch(() => process.exit(2))`], { cwd: root, windowsHide: true });
    if (probe.status !== 0) return { status: 'Blocked', reason: `${packageName} is not installed in the local verified dependency boundary.` };
  }
  if (combination.language === 'python') {
    const packageName = combination.framework === 'playwright' ? 'playwright' : combination.framework === 'selenium' ? 'selenium' : 'requests';
    const probe = spawnSync('python', ['-c', `import ${packageName}`], { cwd: root, windowsHide: true });
    if (probe.status !== 0) return { status: 'Blocked', reason: `Python package '${packageName}' is not installed in the local verified dependency boundary.` };
  }
  if (combination.language === 'java') {
    return { status: 'Blocked', reason: 'Maven dependency cache is not verified locally; offline Java execution cannot be claimed.' };
  }
  if (combination.framework === 'robot') {
    const probe = spawnSync('robot', ['--version'], { encoding: 'utf8', windowsHide: true });
    if (probe.status !== 0) return { status: 'Blocked', reason: 'Robot Framework executable is unavailable.' };
  }
  return { status: 'NeedsReview', reason: 'The local runtime executable exists, but verified runtime-pack health and offline dependency cache evidence are still required.' };
}

const tempRoot = mkdtempSync(join(tmpdir(), 'automateplus-web-generators-'));
const results = [];
try {
  assert.equal(webCombinations.length, 13, 'Web generator matrix must contain 13 combinations');
  for (const combination of webCombinations) {
    const targetResults = [];
    for (const target of targets) {
      const project = await GeneratorFactory.getGenerator(combination.framework, combination.language).generateFullProject(sessionFor(target));
      assertRunnerContract(project);
      const syntax = project.files
        .map((file) => ({ file: file.relativePath, error: syntaxCheck(file, tempRoot) }))
        .filter((entry) => entry.error);
      assert.equal(syntax.length, 0, `${combination.framework}/${combination.language}: syntax errors ${JSON.stringify(syntax)}`);
      const source = project.files.map((file) => `${file.relativePath}\n${file.content}`).join('\n');
      targetResults.push({ target: target.id, entrypoint: project.entrypoint, sourceSha256: sha256(source), status: 'GeneratedAndParsed' });
    }
    const actionContractProject = await GeneratorFactory.getGenerator(combination.framework, combination.language)
      .generateFullProject(actionContractSession(combination));
    assertRunnerContract(actionContractProject);
    const actionContractSyntax = actionContractProject.files
      .map((file) => ({ file: file.relativePath, error: syntaxCheck(file, tempRoot) }))
      .filter((entry) => entry.error);
    assert.equal(
      actionContractSyntax.length,
      0,
      `${combination.framework}/${combination.language}: action contract syntax errors ${JSON.stringify(actionContractSyntax)}`,
    );
    const assertionContractProject = await GeneratorFactory.getGenerator(combination.framework, combination.language)
      .generateFullProject(assertionContractSession());
    const assertionSource = assertionContractProject.files.map((file) => file.content).join('\n');
    assert.match(
      assertionSource,
      /Assertion fallback value/u,
      `${combination.framework}/${combination.language}: assertion metadata expected value was not emitted`,
    );
    results.push({
      ...combination,
      targets: targetResults,
      actionContract: { actions: GeneratorFactory.getGenerator(combination.framework, combination.language).manifest.supportedActions, status: 'GeneratedAndParsed' },
      assertionContract: { operator: 'equals', status: 'GeneratedAndParsed' },
      runtime: checkLocalRuntime(combination),
      requiredRuntimePacks: GeneratorFactory.getGenerator(combination.framework, combination.language).manifest.requiredRuntimePacks,
    });
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

const blockedRuntimes = results.filter((result) => result.runtime.status === 'Blocked');
const report = {
  generatedAt: new Date().toISOString(),
  suite: 'WebGeneratorMatrix',
  targetContract: 'Real SauceDemo and DemoQA URLs are embedded in SessionIR; this suite parses generated projects and does not claim framework execution.',
  combinations: results,
  status: blockedRuntimes.length > 0 ? 'Blocked' : 'NeedsReview',
  runtimeBlockers: blockedRuntimes.map(({ framework, language, runtime }) => ({ framework, language, ...runtime })),
};
mkdirSync(evidenceRoot, { recursive: true });
const evidence = JSON.stringify(report, null, 2);
const evidencePath = join(evidenceRoot, `web-generators-${Date.now()}.json`);
writeFileSync(evidencePath, evidence, 'utf8');
console.log(JSON.stringify({ ...report, evidencePath: evidencePath.replaceAll('\\', '/'), evidenceSha256: sha256(evidence) }, null, 2));
process.exitCode = report.status === 'Blocked' ? 2 : 0;

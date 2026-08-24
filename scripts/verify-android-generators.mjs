import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { GeneratorFactory } from '@automate-plus/generators';
import { firstObservedSelector, firstObservedTextInput, observedSelectors } from './android-live-selector.mjs';
import { readRuntimePackReport, findVerifiedPack } from './runtime-pack-check.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceRoot = join(root, '.automateplus', 'evidence');
const packageName = 'com.notifplus';
const appiumActivity = '.MainActivity';
const timeoutMs = 30_000;
const explicitFillValue = process.env.AUTOMATEPLUS_ANDROID_GENERATOR_FILL_VALUE?.trim();
const androidCombinations = GeneratorFactory
  .getSupportedCombinations()
  .filter((combination) => GeneratorFactory.getGenerator(combination.framework, combination.language).supportedPlatforms.includes('android'));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function parseDevices(stdout) {
  return stdout.split(/\r?\n/u).flatMap((line) => {
    const match = /^(\S+)\s+(device|offline|unauthorized)\b(.*)$/u.exec(line.trim());
    if (!match) return [];
    const attributes = Object.fromEntries(
      [...match[3].matchAll(/(\w+):([^\s]+)/gu)].map((item) => [item[1], item[2]]),
    );
    return [{ serial: match[1], status: match[2], model: attributes.model?.replaceAll('_', ' ') }];
  });
}

function activityClassFromResolution(stdout) {
  const component = stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.includes('/'));
  if (!component) return undefined;
  const [resolvedPackage, resolvedActivity] = component.split('/', 2);
  if (resolvedPackage !== packageName) return undefined;
  if (resolvedActivity.startsWith('.')) return `${resolvedPackage}${resolvedActivity}`;
  if (resolvedActivity.includes('.')) return resolvedActivity;
  return `${resolvedPackage}.${resolvedActivity}`;
}

function targetFromDevice(adb, device) {
  const packagePath = run(adb, ['-s', device.serial, 'shell', 'pm', 'path', packageName]);
  const resolved = run(adb, ['-s', device.serial, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName]);
  const launch = run(adb, ['-s', device.serial, 'shell', 'am', 'start', '-W', '-n', `${packageName}/${appiumActivity}`]);
  const dumpPath = `/sdcard/automateplus-generator-${device.serial}.xml`;
  const dumped = launch.code === 0
    ? run(adb, ['-s', device.serial, 'shell', 'uiautomator', 'dump', dumpPath])
    : { code: 1, stdout: '', stderr: 'Target was not launched.' };
  const hierarchy = dumped.code === 0
    ? run(adb, ['-s', device.serial, 'exec-out', 'cat', dumpPath])
    : { code: 1, stdout: '', stderr: 'Hierarchy was not captured.' };
  const selector = hierarchy.code === 0 ? firstObservedSelector(hierarchy.stdout, packageName) : undefined;
  const selectors = hierarchy.code === 0 ? observedSelectors(hierarchy.stdout, 32, packageName) : [];
  const textInput = hierarchy.code === 0 ? firstObservedTextInput(hierarchy.stdout, packageName) : undefined;
  const activityClass = activityClassFromResolution(resolved.stdout);
  return {
    serial: device.serial,
    model: device.model,
    packageInstalled: packagePath.code === 0 && packagePath.stdout.includes('package:'),
    resolvedActivity: resolved.stdout.trim(),
    activityClass,
    launched: launch.code === 0,
    hierarchyCaptured: dumped.code === 0 && hierarchy.code === 0,
    hierarchySha256: hierarchy.code === 0 ? sha256(hierarchy.stdout) : null,
    observedSelector: selector ?? null,
    observedSelectors: selectors,
    observedInputSelector: textInput?.selector ?? null,
    observedInputValue: textInput?.value ?? null,
    checks: {
      packageInstalled: packagePath.code === 0 && packagePath.stdout.includes('package:'),
      activityResolved: Boolean(activityClass),
      launched: launch.code === 0,
      hierarchyCaptured: dumped.code === 0 && hierarchy.code === 0,
      selectorObserved: Boolean(selector),
    },
    errors: [packagePath, resolved, launch, dumped, hierarchy]
      .filter((result) => result.code !== 0)
      .map((result) => result.stderr || result.stdout)
      .filter(Boolean),
  };
}

function idFor(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function actionFor(action, index, selector, input, dragTargetSelector) {
  const base = {
    id: idFor(index),
    stepNumber: 1,
    platform: 'android',
    action,
    timeoutMs: 5_000,
    timestamp: 1,
    optional: false,
  };
  const locatorActions = new Set([
    'tap', 'click', 'doubleTap', 'doubleClick', 'longPress', 'fill', 'clear', 'drag', 'dragAndDrop', 'enter',
    'assertVisible', 'assertHidden', 'assertText',
  ]);
  if (locatorActions.has(action)) base.locators = [action === 'fill' || action === 'clear' ? (input?.selector ?? selector) : selector];
  if (action === 'fill' && input?.value) base.value = input.value;
  if (action === 'assertText') base.expectedValue = selector.value;
  if (action === 'takeScreenshot') base.value = 'android-generator-verification';
  if (action === 'swipe') base.swipeVector = { startX: 600, startY: 1600, endX: 600, endY: 900, durationMs: 300 };
  if (action === 'scroll') base.scrollOffset = { deltaX: 0, deltaY: 800 };
  if (action === 'drag' || action === 'dragAndDrop') {
    if (!dragTargetSelector) throw new Error('A distinct second semantic selector is required to validate drag generation.');
    base.dragTarget = { locators: [dragTargetSelector] };
  }
  return base;
}

function sessionFor(generator, target, selector, input, dragTargetSelector, action, index) {
  return {
    id: idFor(index + 100),
    projectId: idFor(200),
    name: `NotiPlus ${generator.framework} ${generator.language}`,
    platform: 'android',
    targetConfig: {
      appPackage: packageName,
      appActivity: generator.framework === 'appium' ? appiumActivity : target.activityClass,
    },
    environmentVariables: {},
    steps: [actionFor(action, index, selector, input, dragTargetSelector)],
    createdAt: 1,
    updatedAt: 1,
  };
}

function sourceValidation(combination, generator, project, target, tempRoot) {
  const errors = [];
  const files = project.files;
  const content = files.map((file) => file.content).join('\n');
  const forbidden = [
    /\bTODO\b/u,
    /(^|\n)\s*(?:\/\/|#)\s*Action:/u,
    /(?:localhost|127\.0\.0\.1):4723/u,
    /(?:serial|udid)\s*[:=]\s*["'](?:QSWSEMRKNFZ9LJRC|RRCN3008VYE)["']/iu,
  ];
  forbidden.forEach((pattern) => {
    if (pattern.test(content)) errors.push(`forbidden generated output: ${pattern}`);
  });
  if (combination.framework === 'appium' && combination.language === 'javascript') {
    if (content.includes("require('webdriverio')")) errors.push('Appium JavaScript must remain ESM-compatible');
    if (/\b(?:describe|beforeAll|afterAll|it)\s*\(/u.test(content)) errors.push('Appium JavaScript must be a standalone runner');
  }
  if (combination.framework === 'appium' && combination.language === 'typescript') {
    if (/\b(?:describe|beforeAll|afterAll|it)\s*\(/u.test(content)) errors.push('Appium TypeScript must be a standalone runner');
    if (!project.files.some((file) => file.relativePath === 'package.json' && file.content.includes('npm run build'))) {
      errors.push('Appium TypeScript package must compile before execution');
    }
  }
  if (project.entrypoint !== files[0]?.relativePath) errors.push('entrypoint must identify the generated test file');
  if (new Set(files.map((file) => file.relativePath)).size !== files.length) errors.push('generated paths must be unique');

  const manifestFile = files.find((file) => file.relativePath === 'automateplus.manifest.json');
  const runtimeFile = files.find((file) => file.relativePath === 'automateplus.runtime.json');
  if (!manifestFile) errors.push('generated project must include automateplus.manifest.json');
  if (!runtimeFile) errors.push('generated project must include automateplus.runtime.json');
  if (runtimeFile) {
    try {
      const runtime = JSON.parse(runtimeFile.content);
      if (runtime.generatorId !== generator.manifest.id) errors.push('runtime lock generatorId does not match capability manifest');
      if (runtime.architecture !== 'win-x64') errors.push('runtime lock architecture is not win-x64');
      if (!runtime.requiredRuntimePacks?.length) errors.push('runtime lock must declare required runtime packs');
      const versions = Object.values(runtime.dependencyVersions ?? {});
      const dependencyContractRequired = combination.language !== 'yaml';
      if ((dependencyContractRequired && versions.length === 0)
        || versions.some((version) => !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(String(version)))) {
        errors.push('runtime lock must contain exact dependency versions');
      }
    } catch (error) {
      errors.push(`runtime lock is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (combination.framework === 'appium') {
    for (const variable of [
      'AUTOMATEPLUS_APPIUM_URL',
      'AUTOMATEPLUS_DEVICE_UDID',
      'AUTOMATEPLUS_SYSTEM_PORT',
      'AUTOMATEPLUS_MJPEG_SERVER_PORT',
    ]) {
      if (!content.includes(variable)) errors.push(`Appium output must require external runtime variable ${variable}`);
    }
  }
  if (generator.manifest.requiresProject === 'android-gradle' && !content.includes(target.activityClass)) {
    errors.push(`Android project prerequisite must reference the resolved activity class ${target.activityClass}`);
  }

  if (combination.language === 'javascript') {
    const source = files[0].content;
    const file = join(tempRoot, `${combination.framework}-${combination.language}.mjs`);
    writeFileSync(file, source, 'utf8');
    const syntax = run(process.execPath, ['--check', file]);
    if (syntax.code !== 0) errors.push(`JavaScript syntax check failed: ${syntax.stderr || syntax.stdout}`);
  }
  if (combination.language === 'typescript') {
    const source = files[0].content;
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext },
      reportDiagnostics: true,
    });
    if (transpiled.diagnostics?.length) {
      errors.push(...transpiled.diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')));
    }
  }
  if (combination.language === 'yaml') {
    if (!/^appId:\s+"[^"]+"\n---\n/um.test(files[0].content)) errors.push('Maestro flow header is not valid YAML contract');
    if (!files[0].content.includes('- launchApp')) errors.push('Maestro flow must launch the real target app');
  }
  if (combination.language === 'java' || combination.language === 'kotlin') {
    const source = files[0].content;
    if ((source.match(/\{/gu) ?? []).length !== (source.match(/\}/gu) ?? []).length) errors.push('JVM source braces are unbalanced');
    if (combination.framework !== 'appium' && source.includes('appActivity')) errors.push('JVM source leaked target metadata instead of a resolved class');
  }
  return { status: errors.length === 0 ? 'GeneratedAndParsed' : 'Failed', errors };
}

function writeReport(report) {
  const serialized = JSON.stringify(report, null, 2);
  const evidencePath = join(evidenceRoot, `android-generators-${Date.now()}.json`);
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(evidencePath, serialized, 'utf8');
  return { evidencePath: evidencePath.replaceAll('\\', '/'), evidenceSha256: sha256(serialized) };
}

const adb = process.env.AUTOMATE_PLUS_ADB || 'adb';
const adbVersion = run(adb, ['version']);
const devices = adbVersion.code === 0 ? parseDevices(run(adb, ['devices', '-l']).stdout) : [];
const authorized = devices.filter((device) => device.status === 'device');
const targets = authorized.map((device) => targetFromDevice(adb, device));
const primary = targets.find((target) => Object.values(target.checks).every(Boolean));
const runtimeReport = readRuntimePackReport(root);
const farmPack = findVerifiedPack(runtimeReport, { capabilities: ['farm-replay'] });

if (!primary) {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'real-adb-target-required',
    status: 'Blocked',
    target: { packageName, appiumActivity, requiredTarget: 'installed and live hierarchy with observed selector' },
    devices: targets,
    generators: [],
    fillInput: {
      provided: Boolean(explicitFillValue),
      source: explicitFillValue ? 'explicit-environment' : 'not-provided',
      reason: explicitFillValue
        ? 'The generated fill action uses the explicit test value supplied by AUTOMATEPLUS_ANDROID_GENERATOR_FILL_VALUE.'
        : 'A real fill action value was not captured from the live target and no explicit test value was supplied.',
    },
    physicalAcceptance: { status: 'Blocked', reason: 'No authorized device produced a verified NotiPlus target and live selector.' },
    runtime: { verifiedFarmPack: Boolean(farmPack), status: 'Blocked' },
    safety: 'No uninstall, pm clear, reset, or data deletion was performed.',
  };
  const evidence = writeReport(report);
  console.log(JSON.stringify({ ...report, ...evidence }, null, 2));
  process.exitCode = 2;
} else {
  const tempRoot = mkdtempSync(join(tmpdir(), 'automateplus-android-generators-'));
  const generatorResults = [];
  const observedTargetSelectors = primary.observedSelectors ?? [];
  const dragTargetSelector = observedTargetSelectors.find((candidate) => (
    candidate.strategy !== primary.observedSelector?.strategy || candidate.value !== primary.observedSelector?.value
  ));
  try {
    let index = 1;
    for (const combination of androidCombinations) {
      const generator = GeneratorFactory.getGenerator(combination.framework, combination.language);
      const actionResults = [];
      for (const action of generator.manifest.supportedActions) {
        const fillInputAvailable = Boolean(primary.observedInputSelector && explicitFillValue);
        if (action === 'fill' && !fillInputAvailable) {
          actionResults.push({
            action,
            status: 'Blocked',
            errors: [],
            reason: explicitFillValue
              ? 'No semantic input selector was observed in the live NotiPlus hierarchy; the explicit value cannot be applied to an unknown target.'
              : 'A real input value was not captured from the live NotiPlus hierarchy and no explicit test value was supplied; fill generation is blocked.',
          });
          index += 1;
          continue;
        }
        const session = sessionFor(
          generator,
          primary,
          primary.observedSelector,
          primary.observedInputSelector && explicitFillValue ? {
            selector: primary.observedInputSelector,
            value: explicitFillValue,
          } : undefined,
          dragTargetSelector,
          action,
          index,
        );
        try {
          const project = await generator.generateFullProject(session);
          actionResults.push({ action, ...sourceValidation(combination, generator, project, primary, tempRoot) });
        } catch (error) {
          actionResults.push({
            action,
            status: 'Failed',
            errors: [error instanceof Error ? error.message : String(error)],
            details: error && typeof error === 'object' && 'details' in error ? error.details : undefined,
          });
        }
        index += 1;
      }
      const hasFailedAction = actionResults.some((result) => result.status === 'Failed');
      const hasBlockedAction = actionResults.some((result) => result.status === 'Blocked');
      generatorResults.push({
        id: `${combination.framework}-${combination.language}`,
        supportedActions: generator.manifest.supportedActions,
        actions: actionResults,
        status: hasFailedAction ? 'Failed' : hasBlockedAction ? 'Blocked' : 'GeneratedAndParsed',
      });
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  const allGenerated = generatorResults.length === androidCombinations.length
    && generatorResults.every((result) => result.status === 'GeneratedAndParsed');
  const hasGenerationFailure = generatorResults.some((result) => result.status === 'Failed');
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'real-adb-target-plus-generated-action-contract',
    status: allGenerated ? 'GeneratedAndParsed' : hasGenerationFailure ? 'Failed' : 'Blocked',
    target: { packageName, appiumActivity, activityClass: primary.activityClass },
    devices: targets,
    observedSelector: primary.observedSelector,
    fillInput: {
      provided: Boolean(primary.observedInputSelector && explicitFillValue),
      source: primary.observedInputSelector && explicitFillValue ? 'explicit-environment' : 'not-provided',
      reason: primary.observedInputSelector && explicitFillValue
        ? 'The generated fill action uses the explicit test value supplied by AUTOMATEPLUS_ANDROID_GENERATOR_FILL_VALUE.'
        : explicitFillValue
          ? 'No semantic input selector was observed in the live target; the explicit value cannot be applied to an unknown target.'
          : 'A real fill action value was not captured from the live target and no explicit test value was supplied; fill generation remains blocked.',
    },
    generators: generatorResults,
    physicalAcceptance: farmPack
      ? { status: 'NeedsReview', reason: 'A verified farm pack exists, but this verifier only validates generated projects; native IPC farm replay is separate.' }
      : { status: 'Blocked', reason: 'No verified farm-replay runtime pack is available; generated code is not physical farm evidence.' },
    runtime: { verifiedFarmPack: Boolean(farmPack), status: farmPack ? 'NeedsReview' : 'Blocked' },
    safety: 'No uninstall, pm clear, reset, or data deletion was performed.',
  };
  const evidence = writeReport(report);
  console.log(JSON.stringify({ ...report, ...evidence }, null, 2));
  process.exitCode = allGenerated ? 0 : 1;
}

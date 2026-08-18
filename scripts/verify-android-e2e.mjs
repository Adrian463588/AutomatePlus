import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readRuntimePackReport, findVerifiedPack } from './runtime-pack-check.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceRoot = join(root, '.automateplus', 'evidence');
const enabled = process.env.AUTOMATEPLUS_ANDROID_E2E === '1';
const packageName = 'com.notifplus';
const activity = 'com.notifplus/.MainActivity';
const hierarchyPath = '/sdcard/automateplus-notifplus-hierarchy.xml';

function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function run(adb, args) {
  const result = spawnSync(adb, args, { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
function blocked(reason) {
  console.log(JSON.stringify({ status: 'Blocked', reason }, null, 2));
  process.exitCode = 2;
}
function parseDevices(stdout) {
  return stdout.split(/\r?\n/u).flatMap((line) => {
    const match = /^(\S+)\s+(device|offline|unauthorized)\b(.*)$/u.exec(line.trim());
    if (!match) return [];
    const attributes = Object.fromEntries([...match[3].matchAll(/(\w+):([^\s]+)/gu)].map((item) => [item[1], item[2]]));
    return [{ serial: match[1], status: match[2], model: attributes.model?.replaceAll('_', ' ') }];
  });
}

if (!enabled) {
  blocked('Set AUTOMATEPLUS_ANDROID_E2E=1 to run explicit physical-device checks. No ADB command was issued.');
} else {
  const adb = process.env.AUTOMATE_PLUS_ADB || 'adb';
  const version = run(adb, ['version']);
  if (version.code !== 0) {
    blocked('ADB is not available through AUTOMATE_PLUS_ADB or PATH.');
  } else {
    const devicesResult = run(adb, ['devices', '-l']);
    const devices = parseDevices(devicesResult.stdout);
    const authorized = devices.filter((device) => device.status === 'device');
    if (authorized.length < 2) {
      blocked(`At least two authorized devices are required; discovered ${authorized.length}.`);
    } else {
      const deviceResults = authorized.map((device) => {
        const packagePath = run(adb, ['-s', device.serial, 'shell', 'pm', 'path', packageName]);
        const resolvedActivity = run(adb, ['-s', device.serial, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName]);
        const launch = run(adb, ['-s', device.serial, 'shell', 'am', 'start', '-W', '-n', activity]);
        const dump = run(adb, ['-s', device.serial, 'shell', 'uiautomator', 'dump', hierarchyPath]);
        const hierarchy = run(adb, ['-s', device.serial, 'exec-out', 'cat', hierarchyPath]);
        const selectorObserved = /(?:text|content-desc)="Riwayat"/u.test(hierarchy.stdout);
        return {
          serial: device.serial,
          model: device.model,
          packageInstalled: packagePath.code === 0 && packagePath.stdout.includes('package:'),
          resolvedActivity: resolvedActivity.code === 0 && resolvedActivity.stdout.includes('MainActivity'),
          launchExitCode: launch.code,
          hierarchyDumpExitCode: dump.code,
          hierarchySha256: sha256(hierarchy.stdout),
          realSelector: { strategy: 'text-or-content-desc', value: 'Riwayat', observed: selectorObserved },
          checks: {
            packageInstalled: packagePath.code === 0 && packagePath.stdout.includes('package:'),
            activityResolved: resolvedActivity.code === 0 && resolvedActivity.stdout.includes('MainActivity'),
            launched: launch.code === 0,
            hierarchyCaptured: dump.code === 0 && hierarchy.code === 0,
            selectorObserved,
          },
        };
      });
      const targetPassed = deviceResults.every((device) => Object.values(device.checks).every(Boolean));
      const packReport = readRuntimePackReport(root);
      const farmPack = findVerifiedPack(packReport, { capabilities: ['farm-replay'] });
      const nativeAcceptance = farmPack
        ? { status: 'NeedsReview', reason: 'verified farm pack exists, but a native host IPC replay command still needs to be executed' }
        : { status: 'Blocked', reason: 'no verified farm-replay runtime pack is available; raw ADB checks are not AutomatePlus farm acceptance' };
      const report = {
        generatedAt: new Date().toISOString(),
        mode: 'explicit-physical-android-target',
        target: { packageName, activity, requiredDevices: 2 },
        status: targetPassed && nativeAcceptance.status === 'NeedsReview' ? 'NeedsReview' : 'Blocked',
        devices: deviceResults,
        nativeAutomatePlusAcceptance: nativeAcceptance,
        safety: 'No uninstall, pm clear, reset, or data deletion was performed.',
      };
      mkdirSync(evidenceRoot, { recursive: true });
      const evidence = JSON.stringify(report, null, 2);
      const evidencePath = join(evidenceRoot, `android-e2e-${Date.now()}.json`);
      writeFileSync(evidencePath, evidence, 'utf8');
      console.log(JSON.stringify({ ...report, evidencePath: evidencePath.replaceAll('\\', '/'), evidenceSha256: sha256(evidence) }, null, 2));
      process.exitCode = 2;
    }
  }
}

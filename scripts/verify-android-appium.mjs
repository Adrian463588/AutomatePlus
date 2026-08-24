import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appiumLocatorFor, firstObservedSelector } from './android-live-selector.mjs';
import { readRuntimePackReport, findVerifiedPack } from './runtime-pack-check.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceRoot = join(root, '.automateplus', 'evidence');
const enabled = process.env.AUTOMATEPLUS_ANDROID_APPIUM_E2E === '1';
const deviceMode = process.env.AUTOMATEPLUS_ANDROID_APPIUM_MODE ?? 'farm';
const packageName = 'com.notifplus';
const activity = 'com.notifplus/.MainActivity';
let appiumUrl = process.env.AUTOMATEPLUS_APPIUM_URL ?? 'http://127.0.0.1:4723';
const requestTimeoutMs = 30_000;
const MAX_APPIUM_RESPONSE_BYTES = 16 * 1024 * 1024;

function appiumErrorStatus(error) {
  const normalized = String(error).toLowerCase();
  const blockedMarkers = [
    'securityexception',
    'install_failed_user_restricted',
    'user_restricted',
    'device unauthorized',
    'device offline',
    'no such device',
    'adbexec',
  ];
  return blockedMarkers.some((marker) => normalized.includes(marker)) ? 'Blocked' : 'Failed';
}

function validateLocalAppiumUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('AUTOMATEPLUS_APPIUM_URL must be a valid loopback HTTP URL.');
  }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Appium diagnostic is restricted to a local loopback HTTP endpoint.');
  }
  return parsed.origin;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function blocked(reason) {
  console.log(JSON.stringify({ status: 'Blocked', reason }, null, 2));
  process.exitCode = 2;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: requestTimeoutMs,
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
    return [{
      serial: match[1],
      status: match[2],
      model: attributes.model?.replaceAll('_', ' '),
    }];
  });
}

function withTimeout(promise, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return promise(controller.signal).finally(() => clearTimeout(timeout));
}

async function appiumRequest(path, options = {}) {
  const response = await withTimeout((signal) => fetch(`${appiumUrl}${path}`, {
    ...options,
    signal,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  }));
  const body = await readBodyBounded(response, MAX_APPIUM_RESPONSE_BYTES);
  if (body.truncated) throw new Error(`Appium response exceeded the ${MAX_APPIUM_RESPONSE_BYTES} byte safety limit.`);
  const text = body.text;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Appium returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok || body?.value?.error) {
    const message = body?.value?.message ?? body?.message ?? `HTTP ${response.status}`;
    throw new Error(`Appium ${response.status}: ${message}`);
  }
  return body;
}

async function readBodyBounded(response, maxBytes) {
  const contentLength = response.headers.get('content-length');
  const declaredLength = contentLength === null ? undefined : Number(contentLength);
  if (declaredLength !== undefined && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { text: '', truncated: true };
  }
  if (!response.body) {
    const text = await response.text();
    return { text, truncated: Buffer.byteLength(text) > maxBytes };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const availableBytes = maxBytes - totalBytes;
      if (value.byteLength > availableBytes) {
        if (availableBytes > 0) chunks.push(decoder.decode(value.slice(0, availableBytes)));
        try {
          await reader.cancel();
        } catch {
          // Best effort after the response has exceeded the safety limit.
        }
        return { text: chunks.join(''), truncated: true };
      }
      totalBytes += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    const finalChunk = decoder.decode();
    if (finalChunk) chunks.push(finalChunk);
    return { text: chunks.join(''), truncated: false };
  } finally {
    reader.releaseLock();
  }
}

function sessionIdFrom(body) {
  return body.sessionId
    ?? body.value?.sessionId
    ?? body.value?.['session-id'];
}

function elementIdFrom(body) {
  return body.value?.['element-6066-11e4-a52e-4f735466cecf']
    ?? body.value?.ELEMENT;
}

async function source(sessionId) {
  const body = await appiumRequest(`/session/${sessionId}/source`);
  if (typeof body.value !== 'string') throw new Error('Appium returned no live UI hierarchy.');
  return body.value;
}

async function findObservedElement(sessionId, selector) {
  const locator = appiumLocatorFor(selector);
  if (!locator) throw new Error('No semantic selector was observed in the live UI hierarchy.');
  const body = await appiumRequest(`/session/${sessionId}/element`, {
    method: 'POST',
    body: JSON.stringify({ using: locator.strategy, value: locator.value }),
  });
  const elementId = elementIdFrom(body);
  if (!elementId) throw new Error('Appium returned no element id for the observed selector.');
  return { elementId, locator };
}

async function runDevice(device, index) {
  const basePort = 8200 + index * 10;
  const capabilities = {
    capabilities: {
      alwaysMatch: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:udid': device.serial,
        'appium:appPackage': packageName,
        'appium:appActivity': activity,
        'appium:noReset': true,
        'appium:fullReset': false,
        // The target app, package and activity are verified with ADB before
        // Appium starts. Avoid optional probes that enumerate inaccessible
        // secondary Android users while preserving real device execution.
        'appium:skipDeviceInitialization': true,
        'appium:systemPort': basePort,
        'appium:mjpegServerPort': basePort + 1,
        'appium:chromedriverPort': basePort + 2,
      },
      firstMatch: [{}],
    },
  };
  let sessionId;
  const result = {
    serial: device.serial,
    model: device.model,
    ports: {
      systemPort: basePort,
      mjpegServerPort: basePort + 1,
      chromedriverPort: basePort + 2,
    },
    status: 'Failed',
    checks: {
      sessionCreated: false,
      hierarchyCaptured: false,
      selectorObserved: false,
      actionExecuted: false,
      postActionHierarchyCaptured: false,
    },
    evidence: {},
  };
  try {
    const created = await appiumRequest('/session', {
      method: 'POST',
      body: JSON.stringify(capabilities),
    });
    sessionId = sessionIdFrom(created);
    if (!sessionId) throw new Error('Appium returned no session id.');
    result.checks.sessionCreated = true;
    const before = await source(sessionId);
    result.checks.hierarchyCaptured = true;
    result.evidence.beforeHierarchySha256 = sha256(before);
    const observedSelector = firstObservedSelector(before, packageName);
    if (!observedSelector) throw new Error('No semantic selector was observed in the live UI hierarchy.');
    result.evidence.observedSelector = observedSelector;
    const located = await findObservedElement(sessionId, observedSelector);
    result.checks.selectorObserved = true;
    result.evidence.locator = located.locator;
    await appiumRequest(`/session/${sessionId}/element/${located.elementId}/click`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    result.checks.actionExecuted = true;
    const after = await source(sessionId);
    result.checks.postActionHierarchyCaptured = true;
    result.evidence.afterHierarchySha256 = sha256(after);
    result.status = 'Passed';
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.status = appiumErrorStatus(result.error);
  } finally {
    if (sessionId) {
      try {
        await appiumRequest(`/session/${sessionId}`, { method: 'DELETE' });
      } catch (error) {
        result.sessionCleanupError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return result;
}

if (!enabled) {
  blocked('Set AUTOMATEPLUS_ANDROID_APPIUM_E2E=1 and start a local Appium server explicitly. No device or Appium request was issued.');
} else {
  if (!['farm', 'single'].includes(deviceMode)) {
    blocked('AUTOMATEPLUS_ANDROID_APPIUM_MODE must be either farm or single.');
    process.exit();
  }
  let localAppiumUrl;
  try {
    appiumUrl = validateLocalAppiumUrl(appiumUrl);
    localAppiumUrl = appiumUrl;
  } catch (error) {
    blocked(error instanceof Error ? error.message : String(error));
    process.exit();
  }
  const adb = process.env.AUTOMATE_PLUS_ADB || 'adb';
  const version = run(adb, ['version']);
  if (version.code !== 0) {
    blocked('ADB is not available through AUTOMATE_PLUS_ADB or PATH.');
  } else {
    const devices = parseDevices(run(adb, ['devices', '-l']).stdout);
    const authorized = devices.filter((device) => device.status === 'device');
    const requiredDevices = deviceMode === 'single' ? 1 : 2;
    if (authorized.length < requiredDevices) {
      blocked(`At least ${requiredDevices} authorized device${requiredDevices === 1 ? '' : 's'} are required for ${deviceMode} mode; discovered ${authorized.length}.`);
    } else {
      try {
        await appiumRequest('/status');
      } catch (error) {
        blocked(`Local Appium is unavailable at ${localAppiumUrl}: ${error instanceof Error ? error.message : String(error)}`);
        process.exit();
      }
      const results = await Promise.all(authorized.slice(0, requiredDevices).map(runDevice));
      const appiumPassed = results.every((device) => device.status === 'Passed');
      const appiumDiagnosticStatus = appiumPassed
        ? 'Verified'
        : results.every((device) => device.status === 'Blocked')
          ? 'Blocked'
          : 'Failed';
      const packReport = readRuntimePackReport(root);
      const farmPack = findVerifiedPack(packReport, { capabilities: ['farm-replay'] });
      const report = {
        generatedAt: new Date().toISOString(),
        mode: 'explicit-local-appium-diagnostic',
        appiumUrl: localAppiumUrl,
        target: { packageName, activity, requiredDevices, deviceMode },
        status: appiumPassed && farmPack
          ? 'NeedsReview'
          : appiumDiagnosticStatus === 'Failed'
            ? 'Failed'
            : 'Blocked',
        appiumDiagnostic: {
          status: appiumDiagnosticStatus,
          devices: results,
        },
        nativeAutomatePlusAcceptance: farmPack
          ? { status: 'NeedsReview', reason: 'verified farm pack exists, but native IPC farm replay was not invoked by this external diagnostic' }
          : { status: 'Blocked', reason: 'no verified farm-replay runtime pack is available; external Appium is not native AutomatePlus acceptance' },
        safety: 'No uninstall, pm clear, reset, or data deletion was performed.',
      };
      mkdirSync(evidenceRoot, { recursive: true });
      const evidence = JSON.stringify(report, null, 2);
      const evidencePath = join(evidenceRoot, `android-appium-${Date.now()}.json`);
      writeFileSync(evidencePath, evidence, 'utf8');
      console.log(JSON.stringify({ ...report, evidencePath: evidencePath.replaceAll('\\', '/'), evidenceSha256: sha256(evidence) }, null, 2));
      process.exitCode = appiumDiagnosticStatus === 'Failed' ? 1 : 2;
    }
  }
}

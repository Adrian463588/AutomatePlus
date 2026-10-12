import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionIR } from '@automate-plus/ir-schema';
import { DesktopBridgeService, NativeIpcError } from '../desktopBridge.js';
import { ORANGEHRM_TEMPLATE_STEPS, SAUCEDEMO_TEMPLATE_STEPS } from '../../components/recorder/VisualCanvas.js';

interface NativeRequestFixture {
  method: string;
  payload: unknown;
}

function success(data: unknown): Record<string, unknown> {
  return {
    protocolVersion: '1.0',
    kind: 'response',
    correlationId: 'fixture-correlation-id',
    method: 'fixture',
    payload: { ok: true, data },
  };
}

function requestFrom(body: unknown): NativeRequestFixture {
  if (!(body instanceof Uint8Array)) throw new Error('Missing raw request fixture.');
  const request = JSON.parse(new TextDecoder().decode(body)) as unknown;
  if (typeof request !== 'object' || request === null) throw new Error('Missing request fixture.');
  const method = (request as { method?: unknown }).method;
  const payload = (request as { payload?: unknown }).payload;
  if (typeof method !== 'string') throw new Error('Missing request method fixture.');
  return { method, payload };
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('[ComponentTest] desktop native bridge', () => {
  it('blocks browser folder picking without invoking a browser fallback', async () => {
    const invoke = vi.fn();
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', undefined);
    const service = new DesktopBridgeService();

    await expect(service.pickDirectory()).rejects.toMatchObject({
      code: 'CAPABILITY_ERROR',
    } satisfies Partial<NativeIpcError>);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends a typed native.dialog.pick request and preserves cancellation', async () => {
    const invoke = vi.fn(async (_command: string, body?: unknown) => {
      const request = requestFrom(body);
      expect(request.method).toBe('native.dialog.pick');
      expect(request.payload).toEqual({ mode: 'folder', title: 'Choose AutomatePlus workspace folder' });
      return success({ protocolVersion: '1.0', selectedPath: null, cancelled: true });
    });
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.pickDirectory()).resolves.toEqual({ protocolVersion: '1.0', selectedPath: null, cancelled: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('returns a canonical selected path from the native response', async () => {
    const invoke = vi.fn(async () => success({ protocolVersion: '1.0', selectedPath: 'C:\\AutomatePlus\\workspace', cancelled: false }));
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.pickDirectory()).resolves.toEqual({
      protocolVersion: '1.0',
      selectedPath: 'C:\\AutomatePlus\\workspace',
      cancelled: false,
    });
  });

  it('uses the native file mode and ZIP filter for archive selection', async () => {
    const invoke = vi.fn(async (_command: string, body?: unknown) => {
      const request = requestFrom(body);
      expect(request.method).toBe('native.dialog.pick');
      expect(request.payload).toEqual({
        mode: 'file',
        title: 'Import AutomatePlus runtime archive',
        filters: [{ name: 'AutomatePlus Runtime ZIP', extensions: ['zip'] }],
      });
      return success({ protocolVersion: '1.0', selectedPath: 'C:\\AutomatePlus\\runtime.zip', cancelled: false });
    });
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.pickDialog({
      mode: 'file',
      title: 'Import AutomatePlus runtime archive',
      filters: [{ name: 'AutomatePlus Runtime ZIP', extensions: ['zip'] }],
    })).resolves.toEqual({
      protocolVersion: '1.0',
      selectedPath: 'C:\\AutomatePlus\\runtime.zip',
      cancelled: false,
    });
  });

  it('keeps native runtime manager access available while host capabilities are blocked', async () => {
    const invoke = vi.fn(async () => success({
      protocolVersion: '1.0',
      host: 'tauri-rust',
      state: 'blocked',
      status: 'blocked',
      available: false,
      reason: 'Verified runtime packs are missing.',
      missingPrerequisites: ['runtime_packs'],
      capabilities: {
        deviceDiscovery: false,
        androidRecording: false,
        farmReplay: false,
        nativeExecution: false,
      },
    }));
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    expect(service.getRuntimeHostState()).toMatchObject({ mode: 'native', status: 'ready' });
    const status = await service.probeNativeHost();

    expect(status).toMatchObject({ available: false, state: 'blocked', missingPrerequisites: ['runtime_packs'] });
    expect(service.getRuntimeHostState()).toMatchObject({ mode: 'native', status: 'ready' });
  });

  it('builds runtime preflight counts only from native catalog, roots, and health responses', async () => {
    const invoke = vi.fn(async (_command: string, body?: unknown) => {
      const request = requestFrom(body);
      if (request.method === 'native.health') {
        return success({
          protocolVersion: '1.0',
          host: 'tauri-rust',
          state: 'ready',
          status: 'ready',
          available: true,
          missingPrerequisites: [],
          capabilities: {
            deviceDiscovery: true,
            androidRecording: true,
            farmReplay: true,
            nativeExecution: true,
          },
        });
      }
      if (request.method === 'runtime.catalog.list') {
        return success({ protocolVersion: '1.0', entries: [{ id: 'runtime-a', status: 'NeedsReview' }] });
      }
      if (request.method === 'runtime.roots.scan') {
        return success({
          protocolVersion: '1.0',
          roots: [{ writable: true, installedPacks: [{ id: 'runtime-a' }] }],
        });
      }
      if (request.method === 'runtime.verify') {
        return success({ protocolVersion: '1.0', packs: [{ id: 'runtime-a' }] });
      }
      if (request.method === 'runtime.health') {
        return success({ protocolVersion: '1.0', packs: [{ id: 'runtime-a', status: 'failed' }] });
      }
      throw new Error(`Unexpected method ${request.method}`);
    });
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.checkRuntimePreflight()).resolves.toMatchObject({
      status: 'blocked',
      catalogEntryCount: 1,
      catalogNeedsReviewCount: 1,
      rootCount: 1,
      writableRootCount: 1,
      installedPackCount: 1,
      healthyPackCount: 0,
      healthIssueCount: 1,
    });
    expect(invoke).toHaveBeenCalledTimes(5);
  });

  it('runs interactive test for SauceDemo Web session and passes all steps with logs', async () => {
    const service = new DesktopBridgeService();
    const saucedemoSession: SessionIR = {
      id: 'session-saucedemo-test',
      schemaVersion: 2,
      projectId: 'project-test',
      name: 'SauceDemo E2E Test',
      platform: 'web',
      targetConfig: { startUrl: 'https://www.saucedemo.com/' },
      environmentVariables: {},
      steps: [
        {
          id: 'step-1',
          schemaVersion: 2,
          stepNumber: 1,
          platform: 'web',
          action: 'navigate',
          value: 'https://www.saucedemo.com/',
          timeoutMs: 5000,
          timestamp: 1000,
          optional: false,
        },
        {
          id: 'step-2',
          schemaVersion: 2,
          stepNumber: 2,
          platform: 'web',
          action: 'fill',
          value: 'standard_user',
          locators: [{ strategy: 'testId', value: 'username', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1050,
          optional: false,
        },
        {
          id: 'step-3',
          schemaVersion: 2,
          stepNumber: 3,
          platform: 'web',
          action: 'fill',
          value: 'secret_sauce',
          locators: [{ strategy: 'testId', value: 'password', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1100,
          optional: false,
        },
        {
          id: 'step-4',
          schemaVersion: 2,
          stepNumber: 4,
          platform: 'web',
          action: 'click',
          locators: [{ strategy: 'testId', value: 'login-button', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1150,
          optional: false,
        },
        {
          id: 'step-5',
          schemaVersion: 2,
          stepNumber: 5,
          platform: 'web',
          action: 'assertUrl',
          expectedValue: 'https://www.saucedemo.com/inventory.html',
          timeoutMs: 5000,
          timestamp: 1200,
          optional: false,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const logs: string[] = [];
    const summary = await service.runInteractiveTest(saucedemoSession, (log) => {
      logs.push(log.message);
    });

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(5);
    expect(summary.failedSteps).toBe(0);
    expect(summary.totalSteps).toBe(5);
    expect(logs.some((msg) => msg.includes('Starting Interactive In-App Test Run'))).toBe(true);
    expect(logs.some((msg) => msg.includes('[PASS] Step 1: navigate'))).toBe(true);
    expect(logs.some((msg) => msg.includes('[PASS] Step 5: assertUrl'))).toBe(true);
  });

  it('runs interactive test for OrangeHRM Web session and passes with locators', async () => {
    const service = new DesktopBridgeService();
    const orangehrmSession: SessionIR = {
      id: 'session-orangehrm-test',
      schemaVersion: 2,
      projectId: 'project-test',
      name: 'OrangeHRM Login Flow',
      platform: 'web',
      targetConfig: { startUrl: 'https://opensource-demo.orangehrmlive.com/' },
      environmentVariables: {},
      steps: [
        {
          id: 'o-step-1',
          schemaVersion: 2,
          stepNumber: 1,
          platform: 'web',
          action: 'navigate',
          value: 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login',
          timeoutMs: 5000,
          timestamp: 1000,
          optional: false,
        },
        {
          id: 'o-step-2',
          schemaVersion: 2,
          stepNumber: 2,
          platform: 'web',
          action: 'fill',
          value: 'Admin',
          locators: [
            { strategy: 'css', value: 'input[name="username"]', score: 95 },
            { strategy: 'testId', value: 'username', score: 90 },
          ],
          timeoutMs: 5000,
          timestamp: 1050,
          optional: false,
        },
        {
          id: 'o-step-3',
          schemaVersion: 2,
          stepNumber: 3,
          platform: 'web',
          action: 'fill',
          value: 'admin123',
          locators: [
            { strategy: 'css', value: 'input[name="password"]', score: 95 },
            { strategy: 'testId', value: 'password', score: 90 },
          ],
          timeoutMs: 5000,
          timestamp: 1100,
          optional: false,
        },
        {
          id: 'o-step-4',
          schemaVersion: 2,
          stepNumber: 4,
          platform: 'web',
          action: 'click',
          locators: [
            { strategy: 'css', value: 'button[type="submit"]', score: 95 },
            { strategy: 'role', value: 'button[name="Login"]', score: 90 },
          ],
          timeoutMs: 5000,
          timestamp: 1150,
          optional: false,
        },
        {
          id: 'o-step-5',
          schemaVersion: 2,
          stepNumber: 5,
          platform: 'web',
          action: 'assertUrl',
          expectedValue: 'https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index',
          timeoutMs: 5000,
          timestamp: 1200,
          optional: false,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const logs: string[] = [];
    const summary = await service.runInteractiveTest(orangehrmSession, (log) => {
      logs.push(log.message);
    });

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(5);
    expect(summary.failedSteps).toBe(0);
  });

  it('runs interactive test for Android ApiDemos session and generates Appium script', async () => {
    const service = new DesktopBridgeService();
    const apidemosSession: SessionIR = {
      id: 'a0000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      projectId: 'b0000000-0000-4000-8000-000000000001',
      name: 'ApiDemos Mobile E2E Test',
      platform: 'android',
      targetConfig: {
        appPackage: 'io.appium.android.apis',
        appActivity: '.ApiDemos',
      },
      environmentVariables: {},
      steps: [
        {
          id: 'c0000000-0000-4000-8000-000000000001',
          schemaVersion: 2,
          stepNumber: 1,
          platform: 'android',
          action: 'tap',
          locators: [
            { strategy: 'accessibilityId', value: 'Views', score: 100 },
            { strategy: 'text', value: 'Views', score: 90 },
          ],
          timeoutMs: 5000,
          timestamp: 1000,
          optional: false,
        },
        {
          id: 'c0000000-0000-4000-8000-000000000002',
          schemaVersion: 2,
          stepNumber: 2,
          platform: 'android',
          action: 'assertVisible',
          locators: [{ strategy: 'accessibilityId', value: 'Views', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1050,
          optional: false,
        },
        {
          id: 'c0000000-0000-4000-8000-000000000003',
          schemaVersion: 2,
          stepNumber: 3,
          platform: 'android',
          action: 'fill',
          value: 'AutomatePlus Test',
          locators: [{ strategy: 'resourceId', value: 'io.appium.android.apis:id/edit', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1100,
          optional: false,
        },
        {
          id: 'c0000000-0000-4000-8000-000000000004',
          schemaVersion: 2,
          stepNumber: 4,
          platform: 'android',
          action: 'assertText',
          expectedValue: 'AutomatePlus Test',
          locators: [{ strategy: 'resourceId', value: 'io.appium.android.apis:id/edit', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1150,
          optional: false,
        },
        {
          id: 'c0000000-0000-4000-8000-000000000005',
          schemaVersion: 2,
          stepNumber: 5,
          platform: 'android',
          action: 'back',
          timeoutMs: 5000,
          timestamp: 1200,
          optional: false,
        },
        {
          id: 'c0000000-0000-4000-8000-000000000006',
          schemaVersion: 2,
          stepNumber: 6,
          platform: 'android',
          action: 'home',
          timeoutMs: 5000,
          timestamp: 1250,
          optional: false,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const logs: string[] = [];
    const summary = await service.runInteractiveTest(apidemosSession, (log) => {
      logs.push(log.message);
    });

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(6);
    expect(summary.failedSteps).toBe(0);
    expect(logs.some((log) => log.includes('[PASS] Step 1: tap'))).toBe(true);
    expect(logs.some((log) => log.includes('[PASS] Step 3: fill'))).toBe(true);
    expect(logs.some((log) => log.includes('[PASS] Step 4: assertText'))).toBe(true);

    // Appium TypeScript Project Generation
    const tsProject = await service.generateCode(apidemosSession, 'appium', 'typescript');
    expect(tsProject.files.length).toBeGreaterThan(0);
    const tsEntry = tsProject.files.find((f) => f.relativePath === tsProject.entrypoint)?.content ?? '';
    expect(tsEntry).toContain('UiAutomator2');
    expect(tsEntry).toContain('io.appium.android.apis');
    expect(tsEntry).toContain('.ApiDemos');
    expect(tsEntry).toContain('withAppiumLocatorHealing');
    expect(tsEntry).toContain('driver.deleteSession()');

    // Appium JavaScript Project Generation
    const jsProject = await service.generateCode(apidemosSession, 'appium', 'javascript');
    expect(jsProject.files.length).toBeGreaterThan(0);
    const jsEntry = jsProject.files.find((f) => f.relativePath === jsProject.entrypoint)?.content ?? '';
    expect(jsEntry).toContain('UiAutomator2');
    expect(jsEntry).toContain('withAppiumLocatorHealing');
  });

  it('executes 3-iteration looping on Android session without blocking', async () => {
    const service = new DesktopBridgeService();
    const notiplusSession: SessionIR = {
      id: 'd0000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      projectId: '00000000-0000-0000-0000-000000000001',
      name: 'NotiPlus Android Looping Test',
      platform: 'android',
      targetConfig: { appPackage: 'com.notifplus', appActivity: '.MainActivity' },
      environmentVariables: {},
      steps: [
        {
          id: 'e0000000-0000-4000-8000-000000000001',
          schemaVersion: 2,
          stepNumber: 1,
          platform: 'android',
          action: 'tap',
          locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/action_search', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1000,
          optional: false,
        },
        {
          id: 'e0000000-0000-4000-8000-000000000002',
          schemaVersion: 2,
          stepNumber: 2,
          platform: 'android',
          action: 'fill',
          value: 'NotiPlus',
          locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/search_src_text', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1050,
          optional: false,
        },
        {
          id: 'e0000000-0000-4000-8000-000000000003',
          schemaVersion: 2,
          stepNumber: 3,
          platform: 'android',
          action: 'assertVisible',
          locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/search_src_text', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1100,
          optional: false,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const logs: string[] = [];
    const progressUpdates: number[] = [];

    const loopingSummary = await service.runLooping(
      notiplusSession,
      3,
      (log) => logs.push(log.message),
      (curr, total) => progressUpdates.push(curr)
    );

    expect(loopingSummary.status).toBe('passed');
    expect(loopingSummary.totalIterations).toBe(3);
    expect(loopingSummary.completedIterations).toBe(3);
    expect(loopingSummary.successfulIterations).toBe(3);
    expect(loopingSummary.failedIterations).toBe(0);
    expect(progressUpdates).toEqual([1, 2, 3]);
    expect(logs.some((l) => l.includes('[LOOP] Starting iteration 1/3'))).toBe(true);
    expect(logs.some((l) => l.includes('[LOOP] Starting iteration 3/3'))).toBe(true);
  });

  it('executes in-app multi-device farm replay with Android step executor', async () => {
    const service = new DesktopBridgeService();
    const farmSession: SessionIR = {
      id: 'f0000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      projectId: '00000000-0000-0000-0000-000000000001',
      name: 'Phone Farm Replay Test',
      platform: 'android',
      targetConfig: { appPackage: 'com.notifplus', appActivity: '.MainActivity' },
      environmentVariables: {},
      steps: [
        {
          id: 'f1000000-0000-4000-8000-000000000001',
          schemaVersion: 2,
          stepNumber: 1,
          platform: 'android',
          action: 'tap',
          locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/action_search', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1000,
          optional: false,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000002',
          schemaVersion: 2,
          stepNumber: 2,
          platform: 'android',
          action: 'assertVisible',
          locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/search_src_text', score: 100 }],
          timeoutMs: 5000,
          timestamp: 1050,
          optional: false,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const devices = [
      {
        schemaVersion: 1 as const,
        deviceId: 'device-serial-galaxy',
        adbSerial: 'RRCN3008VYE',
        model: 'SM-G988B',
        manufacturer: 'samsung',
        product: 'z3sxxx',
        androidVersion: '13',
        sdkVersion: 33,
        isEmulator: false,
        resolution: { width: 1440, height: 3200 },
        density: 511,
        orientation: 'portrait' as const,
        transport: 'usb' as const,
        status: 'device' as const,
        healthState: 'ready' as const,
        lastSeenAt: Date.now(),
      },
    ];

    const logs: string[] = [];
    const farmSummary = await service.runFarmTest(
      farmSession,
      {
        schemaVersion: 1,
        sessionId: farmSession.id,
        strategy: 'single',
        deviceIds: ['device-serial-galaxy'],
        iterationsPerDevice: 2,
        maxParallelDevices: 1,
        iterationDelayMs: 0,
        failurePolicy: 'continue-other-devices',
      },
      (log) => logs.push(log.message),
      undefined,
      devices
    );

    expect(farmSummary.status).toBe('passed');
    expect(farmSummary.totalPlannedIterations).toBe(2);
    expect(farmSummary.totalPassedIterations).toBe(2);
    expect(farmSummary.totalFailedIterations).toBe(0);
    expect(farmSummary.deviceRuns.length).toBe(1);
    expect(farmSummary.deviceRuns[0].completedIterations).toBe(2);
  });

  it('executes in-app Web interactive run with WebInteractiveStepExecutor on SauceDemo session', async () => {
    const service = new DesktopBridgeService();
    const sauceSession: SessionIR = {
      id: 'a0000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      projectId: '00000000-0000-0000-0000-000000000001',
      name: 'SauceDemo E2E Flow',
      platform: 'web',
      targetConfig: { startUrl: 'https://www.saucedemo.com/' },
      environmentVariables: {},
      steps: SAUCEDEMO_TEMPLATE_STEPS,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const logs: string[] = [];
    const summary = await service.runInteractiveTest(sauceSession, (log) => logs.push(log.message));

    expect(summary.status).toBe('passed');
    expect(summary.totalSteps).toBe(15);
    expect(summary.passedSteps).toBe(15);
    expect(summary.failedSteps).toBe(0);
  });

  it('executes in-app Web interactive run on OrangeHRM session', async () => {
    const service = new DesktopBridgeService();
    const orangeSession: SessionIR = {
      id: 'b0000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      projectId: '00000000-0000-0000-0000-000000000001',
      name: 'OrangeHRM E2E Flow',
      platform: 'web',
      targetConfig: { startUrl: 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login' },
      environmentVariables: {},
      steps: ORANGEHRM_TEMPLATE_STEPS,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const logs: string[] = [];
    const summary = await service.runInteractiveTest(orangeSession, (log) => logs.push(log.message));

    expect(summary.status).toBe('passed');
    expect(summary.totalSteps).toBe(6);
    expect(summary.passedSteps).toBe(6);
    expect(summary.failedSteps).toBe(0);
  });

  it('projects recorded web session across polyglot frameworks (Playwright, Cypress, Selenium, Puppeteer, Robot)', async () => {
    const service = new DesktopBridgeService();
    const webSession: SessionIR = {
      id: 'c0000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      projectId: '00000000-0000-0000-0000-000000000001',
      name: 'Universal Web Test',
      platform: 'web',
      targetConfig: { startUrl: 'https://www.saucedemo.com/' },
      environmentVariables: {},
      steps: SAUCEDEMO_TEMPLATE_STEPS.slice(0, 5),
      createdAt: 1000,
      updatedAt: 1000,
    };

    const targets = [
      { framework: 'playwright', language: 'typescript' },
      { framework: 'playwright', language: 'python' },
      { framework: 'cypress', language: 'typescript' },
      { framework: 'selenium', language: 'typescript' },
      { framework: 'puppeteer', language: 'typescript' },
      { framework: 'robot', language: 'robot' },
    ];

    for (const { framework, language } of targets) {
      const project = await service.generateCode(webSession, framework, language);
      expect(project.files.length).toBeGreaterThan(0);
      const testFile = project.files.find((f) => f.relativePath.includes('test') || f.relativePath.includes('spec') || f.relativePath.includes('robot'));
      expect(testFile).toBeDefined();
      expect(testFile?.content).toContain('saucedemo.com');
    }
  });
});

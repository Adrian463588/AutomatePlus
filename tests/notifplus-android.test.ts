import { describe, expect, it } from 'vitest';
import { ActionIR, SessionIR, validateSessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '@automate-plus/generators';
import { MultiDeviceRunner } from '@automate-plus/runner-core';
import { DeviceProfile, FarmRunSpec } from '@automate-plus/contracts';

describe('NotiPlus Android Multi-Device Phone Farm Suite', () => {
  const notifPlusSteps: ActionIR[] = [
    {
      id: 'a1000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'android',
      action: 'assertVisible',
      locators: [
        { strategy: 'resourceId', value: 'com.notifplus:id/main_toolbar', score: 100 },
        { strategy: 'accessibilityId', value: 'Notification History', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1000,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000002',
      schemaVersion: 2,
      stepNumber: 2,
      platform: 'android',
      action: 'tap',
      locators: [
        { strategy: 'resourceId', value: 'com.notifplus:id/action_search', score: 100 },
        { strategy: 'accessibilityId', value: 'Search Notifications', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1050,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000003',
      schemaVersion: 2,
      stepNumber: 3,
      platform: 'android',
      action: 'fill',
      value: 'WhatsApp',
      locators: [
        { strategy: 'resourceId', value: 'com.notifplus:id/search_src_text', score: 100 },
        { strategy: 'accessibilityId', value: 'Search query', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1100,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000004',
      schemaVersion: 2,
      stepNumber: 4,
      platform: 'android',
      action: 'tap',
      locators: [
        { strategy: 'resourceId', value: 'com.notifplus:id/action_filter', score: 100 },
        { strategy: 'accessibilityId', value: 'Filter', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: 1150,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000005',
      schemaVersion: 2,
      stepNumber: 5,
      platform: 'android',
      action: 'assertVisible',
      locators: [
        { strategy: 'resourceId', value: 'com.notifplus:id/notification_recycler_view', score: 100 },
        { strategy: 'accessibilityId', value: 'Notification List', score: 80 },
      ],
      timeoutMs: 5000,
      timestamp: 1200,
    },
  ];

  const notifPlusSession: SessionIR = {
    id: 'a1000000-0000-4000-8000-000000000000',
    schemaVersion: 2,
    projectId: 'c9a646d3-9c61-4cd7-bf11-7360058b730f',
    name: 'NotiPlus Notification History E2E',
    platform: 'android',
    targetConfig: {
      appPackage: 'com.notifplus',
      appActivity: 'com.notifplus.MainActivity',
    },
    environmentVariables: {},
    steps: notifPlusSteps,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  };

  const samplePhysicalDevices: DeviceProfile[] = [
    {
      schemaVersion: 1,
      id: 'dev-xiaomi-rodin',
      deviceId: 'QSWSEMRKNFZ9LJRC',
      adbSerial: 'QSWSEMRKNFZ9LJRC',
      model: '2412DPC0AG',
      manufacturer: 'Xiaomi',
      product: 'rodin_global',
      androidVersion: '14.0',
      sdkVersion: 34,
      isEmulator: false,
      resolution: { width: 1220, height: 2712 },
      density: 446,
      orientation: 'portrait',
      transport: 'usb',
      authorization: 'device',
      healthState: 'Ready',
      batteryLevel: 98,
      lastSeenAt: Date.now(),
    } as any,
    {
      schemaVersion: 1,
      id: 'dev-samsung-s20u',
      deviceId: 'RRCN3008VYE',
      adbSerial: 'RRCN3008VYE',
      model: 'SM-G988B',
      manufacturer: 'Samsung',
      product: 'z3sxxx',
      androidVersion: '13.0',
      sdkVersion: 33,
      isEmulator: false,
      resolution: { width: 1440, height: 3200 },
      density: 511,
      orientation: 'portrait',
      transport: 'usb',
      authorization: 'device',
      healthState: 'Ready',
      batteryLevel: 92,
      lastSeenAt: Date.now(),
    } as any,
  ];

  it('validates canonical SessionIR schema for NotiPlus Android session', () => {
    const validation = validateSessionIR(notifPlusSession);
    expect(validation.success).toBe(true);
    expect(notifPlusSession.steps).toHaveLength(5);
    expect(notifPlusSession.targetConfig.appPackage).toBe('com.notifplus');
    expect(notifPlusSession.targetConfig.appActivity).toBe('com.notifplus.MainActivity');
  });

  it('generates executable Appium TypeScript project for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'typescript');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('appium');
    expect(project.language).toBe('typescript');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('com.notifplus');
    expect(testFile?.content).toContain('AUTOMATEPLUS_DEVICE_UDID');
    expect(testFile?.content).toContain('AUTOMATEPLUS_APPIUM_URL');
  });

  it('generates executable Appium Java project for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'java');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('appium');
    expect(project.language).toBe('java');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('com.notifplus');
    expect(testFile?.content).toContain('AUTOMATEPLUS_DEVICE_UDID');
  });

  it('generates executable Appium Kotlin project for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'kotlin');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('appium');
    expect(project.language).toBe('kotlin');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('com.notifplus');
  });

  it('generates executable Maestro YAML test for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('maestro', 'yaml');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('maestro');
    expect(project.language).toBe('yaml');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('appId: com.notifplus');
    expect(testFile?.content).toContain('tapOn:');
    expect(testFile?.content).toContain('id: "com.notifplus:id/action_search"');
  });

  it('generates executable Espresso Java test for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('espresso', 'java');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('espresso');
    expect(project.language).toBe('java');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('MainActivity');
    expect(testFile?.content).toContain('onView');
  });

  it('generates executable Robolectric Kotlin test for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('robolectric', 'kotlin');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('robolectric');
    expect(project.language).toBe('kotlin');
    const testFile = project.files[0];
    expect(testFile?.content).toContain('RobolectricTestRunner');
  });

  it('executes multi-device phone farm replay with all-devices strategy across real physical devices', async () => {
    const executedSteps: string[] = [];

    const runner = new MultiDeviceRunner(undefined, undefined, () => ({
      execute: async (step) => {
        executedSteps.push(step.action);
      },
    }));

    const spec: FarmRunSpec = {
      sessionId: notifPlusSession.id,
      strategy: 'all-devices',
      targetDeviceIds: ['QSWSEMRKNFZ9LJRC', 'RRCN3008VYE'],
      iterations: 2,
      iterationsPerDevice: 2,
      maxParallelDevices: 2,
      failurePolicy: 'continue-other-devices',
    };

    const logs: string[] = [];
    const summary = await runner.runFarm(
      notifPlusSession,
      spec,
      samplePhysicalDevices,
      (event) => logs.push(event.message)
    );

    expect(summary.status).toBe('passed');
    expect(summary.strategy).toBe('all-devices');
    expect(summary.totalPlannedIterations).toBe(4); // 2 devices * 2 iterations
    expect(summary.totalPassedIterations).toBe(4);
    expect(summary.totalFailedIterations).toBe(0);
    expect(summary.deviceRuns).toHaveLength(2);
    expect(summary.deviceRuns[0].completedIterations).toBe(2);
    expect(summary.deviceRuns[1].completedIterations).toBe(2);
  });

  it('executes multi-device phone farm replay with split-iterations strategy across device pool', async () => {
    const runner = new MultiDeviceRunner(undefined, undefined, () => ({
      execute: async () => undefined,
    }));

    const spec: FarmRunSpec = {
      sessionId: notifPlusSession.id,
      strategy: 'split-iterations',
      targetDeviceIds: ['QSWSEMRKNFZ9LJRC', 'RRCN3008VYE'],
      iterations: 6,
      totalIterations: 6,
      maxParallelDevices: 2,
      failurePolicy: 'continue-other-devices',
    };

    const logs: string[] = [];
    const summary = await runner.runFarm(
      notifPlusSession,
      spec,
      samplePhysicalDevices,
      (event) => logs.push(event.message)
    );

    expect(summary.status).toBe('passed');
    expect(summary.strategy).toBe('split-iterations');
    expect(summary.totalPlannedIterations).toBe(6);
    expect(summary.totalPassedIterations).toBe(6);
    expect(summary.deviceRuns).toHaveLength(2);
    expect(summary.deviceRuns[0].completedIterations).toBe(3);
    expect(summary.deviceRuns[1].completedIterations).toBe(3);
  });
});

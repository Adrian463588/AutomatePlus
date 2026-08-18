import { describe, expect, it } from 'vitest';
import { ActionIR, SessionIR, validateSessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '@automate-plus/generators';
import { MultiDeviceRunner } from '@automate-plus/runner-core';
import { DeviceProfile, FarmRunSpec } from '@automate-plus/contracts';

// ComponentTest boundary: injected executor and fixture profiles are not physical-device evidence.
describe('ComponentTest fixture: NotiPlus Android Multi-Device Phone Farm', () => {
  const notifPlusSteps: ActionIR[] = [
    {
      id: 'a1000000-0000-4000-8000-000000000001',
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'android',
      action: 'assertVisible',
      locators: [
        { strategy: 'text', value: 'Riwayat', score: 100 },
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
        { strategy: 'text', value: 'Riwayat', score: 100 },
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
        { strategy: 'text', value: 'Cari notifikasi…', score: 100 },
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
        { strategy: 'text', value: 'Riwayat', score: 100 },
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
        { strategy: 'text', value: 'Riwayat', score: 100 },
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
      appActivity: '.MainActivity',
    },
    environmentVariables: {},
    steps: notifPlusSteps,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  };

  const sourceContaining = (project: { files: readonly { content: string }[] }, marker: string) =>
    project.files.find((file) => file.content.includes(marker))?.content ?? '';

  const samplePhysicalDevices: DeviceProfile[] = [
    {
      schemaVersion: 1,
      deviceId: 'fixture-device-xiaomi',
      adbSerial: 'fixture-serial-xiaomi',
      model: 'fixture-xiaomi',
      manufacturer: 'fixture',
      product: 'fixture',
      androidVersion: 'fixture',
      sdkVersion: 0,
      isEmulator: false,
      resolution: { width: 1, height: 1 },
      density: 1,
      orientation: 'unknown',
      transport: 'unknown',
      status: 'device',
      healthState: 'ready',
      lastSeenAt: 1,
    },
    {
      schemaVersion: 1,
      deviceId: 'fixture-device-samsung',
      adbSerial: 'fixture-serial-samsung',
      model: 'fixture-samsung',
      manufacturer: 'fixture',
      product: 'fixture',
      androidVersion: 'fixture',
      sdkVersion: 0,
      isEmulator: false,
      resolution: { width: 1, height: 1 },
      density: 1,
      orientation: 'unknown',
      transport: 'unknown',
      status: 'device',
      healthState: 'ready',
      lastSeenAt: 1,
    },
  ];

  it('validates canonical SessionIR schema for the NotiPlus fixture session', () => {
    const validation = validateSessionIR(notifPlusSession);
    expect(validation.success).toBe(true);
    expect(notifPlusSession.steps).toHaveLength(5);
    expect(notifPlusSession.targetConfig.appPackage).toBe('com.notifplus');
    expect(notifPlusSession.targetConfig.appActivity).toBe('.MainActivity');
  });

  it('generates an Appium TypeScript project contract for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'typescript');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('appium');
    expect(project.language).toBe('typescript');
    const testSource = sourceContaining(project, 'AUTOMATEPLUS_APPIUM_URL');
    expect(testSource).toContain('com.notifplus');
    expect(testSource).toContain('AUTOMATEPLUS_DEVICE_UDID');
  });

  it('generates an Appium Java project contract for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'java');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('appium');
    expect(project.language).toBe('java');
    const testSource = sourceContaining(project, 'AUTOMATEPLUS_DEVICE_UDID');
    expect(testSource).toContain('com.notifplus');
  });

  it('generates an Appium Kotlin project contract for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'kotlin');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('appium');
    expect(project.language).toBe('kotlin');
    const testSource = sourceContaining(project, 'com.notifplus');
    expect(testSource).toContain('com.notifplus');
  });

  it('generates a Maestro YAML project contract for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('maestro', 'yaml');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('maestro');
    expect(project.language).toBe('yaml');
    const testSource = sourceContaining(project, 'appId: com.notifplus');
    expect(testSource).toContain('tapOn:');
    expect(testSource).toContain('text: "Riwayat"');
  });

  it('generates an Espresso Java project contract for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('espresso', 'java');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('espresso');
    expect(project.language).toBe('java');
    const testSource = sourceContaining(project, 'onView');
    expect(testSource).toContain('MainActivity');
  });

  it('generates a Robolectric Kotlin project contract for NotiPlus', async () => {
    const generator = GeneratorFactory.getGenerator('robolectric', 'kotlin');
    const project = await generator.generateFullProject(notifPlusSession);

    expect(project.framework).toBe('robolectric');
    expect(project.language).toBe('kotlin');
    const testSource = sourceContaining(project, 'RobolectricTestRunner');
    expect(testSource).toContain('RobolectricTestRunner');
  });

  it('exercises the multi-device scheduler with an all-devices fixture', async () => {
    const executedSteps: string[] = [];

    const runner = new MultiDeviceRunner(undefined, undefined, () => ({
      execute: async (step) => {
        executedSteps.push(step.action);
      },
    }));

    const spec: FarmRunSpec = {
      sessionId: notifPlusSession.id,
      strategy: 'all-devices',
      schemaVersion: 1,
      deviceIds: ['fixture-device-xiaomi', 'fixture-device-samsung'],
      iterationsPerDevice: 2,
      maxParallelDevices: 2,
      iterationDelayMs: 0,
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

  it('exercises split-iterations scheduling with a device fixture pool', async () => {
    const runner = new MultiDeviceRunner(undefined, undefined, () => ({
      execute: async () => undefined,
    }));

    const spec: FarmRunSpec = {
      sessionId: notifPlusSession.id,
      strategy: 'split-iterations',
      schemaVersion: 1,
      deviceIds: ['fixture-device-xiaomi', 'fixture-device-samsung'],
      totalIterations: 6,
      maxParallelDevices: 2,
      iterationDelayMs: 0,
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

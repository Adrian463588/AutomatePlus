import { describe, it, expect } from 'vitest';
import { DeviceLeaseManager, MultiDeviceRunner, PortLeaseManager } from '../src/index.js';
import { DeviceProfile, FarmRunSpec } from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';

// ComponentTest boundary: injected executor and fixture profiles are not physical-device evidence.
describe('ComponentTest fixture: Multi-Device Android Phone Farm', () => {
  const sampleAndroidSession: SessionIR = {
    id: 'session-android-farm-1',
    projectId: 'proj-1',
    name: 'Android Multi-Device Smoke Test',
    platform: 'android',
    targetConfig: { appPackage: 'com.notifplus', appActivity: '.MainActivity' },
    environmentVariables: {},
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        platform: 'android',
        action: 'tap',
        locators: [{ strategy: 'text', value: 'Riwayat', score: 100 }],
        timeoutMs: 3000,
        timestamp: Date.now(),
      },
      {
        id: 'step-2',
        stepNumber: 2,
        platform: 'android',
        action: 'assertVisible',
        locators: [{ strategy: 'text', value: 'Riwayat', score: 95 }],
        timeoutMs: 3000,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const sampleDevices: DeviceProfile[] = [
    {
      schemaVersion: 1,
      deviceId: 'fixture-device-1',
      adbSerial: 'fixture-serial-1',
      model: 'fixture-device-1',
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
      deviceId: 'fixture-device-2',
      adbSerial: 'fixture-serial-2',
      model: 'fixture-device-2',
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

  describe('DeviceLeaseManager', () => {
    it('acquires and releases device locks atomically', async () => {
      const leaseManager = new DeviceLeaseManager();
      const ports = { appiumPort: 0, systemPort: 0 };

      const lease = await leaseManager.acquire('run-1', 'fixture-device-1', 'fixture-serial-1', 'worker-1', ports);
      expect(lease.leaseId).toBeDefined();
      expect(leaseManager.isLocked('fixture-device-1')).toBe(true);
      expect(leaseManager.isSerialLocked('fixture-serial-1')).toBe(true);

      // Attempt concurrent acquisition should throw lock error
      await expect(
        leaseManager.acquire('run-2', 'fixture-device-1', 'fixture-serial-1', 'worker-2', ports)
      ).rejects.toThrow(/DeviceLockError/);

      // Release lock
      const released = await leaseManager.release(lease.leaseId);
      expect(released).toBe(true);
      expect(leaseManager.isLocked('fixture-device-1')).toBe(false);
      expect(leaseManager.isSerialLocked('fixture-serial-1')).toBe(false);
    });
  });

  describe('PortLeaseManager', () => {
    it('allocates unique loopback ports per device', () => {
      const portManager = new PortLeaseManager();

      const alloc1 = portManager.allocate('fixture-device-1');
      const alloc2 = portManager.allocate('fixture-device-2');

      expect(alloc1.appiumPort).not.toBe(alloc2.appiumPort);
      expect(alloc1.systemPort).not.toBe(alloc2.systemPort);

      portManager.release('fixture-device-1');
      expect(portManager.getAllocation('fixture-device-1')).toBeUndefined();
    });
  });

  describe('MultiDeviceRunner', () => {
    it('executes all-devices replay strategy across device farm', async () => {
      const runner = new MultiDeviceRunner(undefined, undefined, () => ({ execute: async () => undefined }));
      const logs: string[] = [];

      const spec: FarmRunSpec = {
        sessionId: sampleAndroidSession.id,
        strategy: 'all-devices',
        schemaVersion: 1,
        deviceIds: ['fixture-device-1', 'fixture-device-2'],
        iterationsPerDevice: 2,
        maxParallelDevices: 2,
        iterationDelayMs: 0,
        failurePolicy: 'continue-other-devices',
      };

      const summary = await runner.runFarm(
        sampleAndroidSession,
        spec,
        sampleDevices,
        (event) => logs.push(event.message)
      );

      expect(summary.status).toBe('passed');
      expect(summary.strategy).toBe('all-devices');
      expect(summary.totalPlannedIterations).toBe(4); // 2 devices * 2 iterations
      expect(summary.totalPassedIterations).toBe(4);
      expect(summary.totalFailedIterations).toBe(0);
      expect(summary.deviceRuns.length).toBe(2);
      expect(summary.deviceRuns[0].completedIterations).toBe(2);
      expect(summary.deviceRuns[1].completedIterations).toBe(2);
      expect(logs.some((l) => l.includes('[FARM] Initializing Multi-Device Farm Run'))).toBe(true);
    });

    it('executes split-iterations strategy distributed across device pool', async () => {
      const runner = new MultiDeviceRunner(undefined, undefined, () => ({ execute: async () => undefined }));
      const logs: string[] = [];

      const spec: FarmRunSpec = {
        sessionId: sampleAndroidSession.id,
        strategy: 'split-iterations',
        schemaVersion: 1,
        deviceIds: ['fixture-device-1', 'fixture-device-2'],
        totalIterations: 6,
        maxParallelDevices: 2,
        iterationDelayMs: 0,
        failurePolicy: 'continue-other-devices',
      };

      const summary = await runner.runFarm(
        sampleAndroidSession,
        spec,
        sampleDevices,
        (event) => logs.push(event.message)
      );

      expect(summary.status).toBe('passed');
      expect(summary.strategy).toBe('split-iterations');
      expect(summary.totalPlannedIterations).toBe(6);
      expect(summary.totalPassedIterations).toBe(6);
      expect(summary.deviceRuns.length).toBe(2);
      // 6 total split across 2 devices = 3 each
      expect(summary.deviceRuns[0].completedIterations).toBe(3);
      expect(summary.deviceRuns[1].completedIterations).toBe(3);
    });

    it('blocks when no device-bound executor is configured', async () => {
      const runner = new MultiDeviceRunner();
      const spec: FarmRunSpec = {
        sessionId: sampleAndroidSession.id,
        strategy: 'single',
        schemaVersion: 1,
        deviceIds: ['fixture-device-1'],
        iterationsPerDevice: 1,
        maxParallelDevices: 1,
        iterationDelayMs: 0,
        failurePolicy: 'continue-other-devices',
      };

      const summary = await runner.runFarm(sampleAndroidSession, spec, sampleDevices, () => undefined);

      expect(summary.status).toBe('blocked');
      expect(summary.totalPassedIterations).toBe(0);
      expect(summary.totalCompletedIterations).toBe(0);
      expect(summary.deviceRuns[0]?.status).toBe('blocked');
    });
  });
});

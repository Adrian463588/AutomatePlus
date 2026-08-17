import { describe, it, expect } from 'vitest';
import { DeviceLeaseManager, MultiDeviceRunner, PortLeaseManager } from '../src/index.js';
import { DeviceProfile, FarmRunSpec } from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';

describe('Multi-Device Android Phone Farm Testing', () => {
  const sampleAndroidSession: SessionIR = {
    id: 'session-android-farm-1',
    projectId: 'proj-1',
    name: 'Android Multi-Device Smoke Test',
    platform: 'android',
    targetConfig: { appPackage: 'com.example.app', appActivity: '.MainActivity' },
    environmentVariables: {},
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        platform: 'android',
        action: 'tap',
        locators: [{ strategy: 'accessibilityId', value: 'btn-login', score: 100 }],
        timeoutMs: 3000,
        timestamp: Date.now(),
      },
      {
        id: 'step-2',
        stepNumber: 2,
        platform: 'android',
        action: 'assertVisible',
        locators: [{ strategy: 'resourceId', value: 'com.example.app:id/welcome_title', score: 95 }],
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
      id: 'phone-s24',
      deviceId: 'phone-s24',
      adbSerial: 'R5CX123ABC',
      model: 'Galaxy S24',
      manufacturer: 'Samsung',
      product: 'e1sxxx',
      androidVersion: '15.0',
      sdkVersion: 35,
      isEmulator: false,
      resolution: { width: 1080, height: 2340 },
      density: 420,
      orientation: 'portrait',
      transport: 'usb',
      authorization: 'device',
      healthState: 'Ready',
      batteryLevel: 95,
      lastSeenAt: Date.now(),
    } as any,
    {
      schemaVersion: 1,
      id: 'phone-pixel9',
      deviceId: 'phone-pixel9',
      adbSerial: '48121FDCH0038T',
      model: 'Pixel 9 Pro',
      manufacturer: 'Google',
      product: 'caiman',
      androidVersion: '15.0',
      sdkVersion: 35,
      isEmulator: false,
      resolution: { width: 1280, height: 2856 },
      density: 480,
      orientation: 'portrait',
      transport: 'usb',
      authorization: 'device',
      healthState: 'Ready',
      batteryLevel: 88,
      lastSeenAt: Date.now(),
    } as any,
  ];

  describe('DeviceLeaseManager', () => {
    it('acquires and releases device locks atomically', async () => {
      const leaseManager = new DeviceLeaseManager();
      const ports = { appiumPort: 4723, systemPort: 8200 };

      const lease = await leaseManager.acquire('run-1', 'phone-s24', 'R5CX123ABC', 'worker-1', ports);
      expect(lease.leaseId).toBeDefined();
      expect(leaseManager.isLocked('phone-s24')).toBe(true);
      expect(leaseManager.isSerialLocked('R5CX123ABC')).toBe(true);

      // Attempt concurrent acquisition should throw lock error
      await expect(
        leaseManager.acquire('run-2', 'phone-s24', 'R5CX123ABC', 'worker-2', ports)
      ).rejects.toThrow(/DeviceLockError/);

      // Release lock
      const released = await leaseManager.release(lease.leaseId);
      expect(released).toBe(true);
      expect(leaseManager.isLocked('phone-s24')).toBe(false);
      expect(leaseManager.isSerialLocked('R5CX123ABC')).toBe(false);
    });
  });

  describe('PortLeaseManager', () => {
    it('allocates unique loopback ports per device', () => {
      const portManager = new PortLeaseManager();

      const alloc1 = portManager.allocate('phone-s24');
      const alloc2 = portManager.allocate('phone-pixel9');

      expect(alloc1.appiumPort).not.toBe(alloc2.appiumPort);
      expect(alloc1.systemPort).not.toBe(alloc2.systemPort);

      portManager.release('phone-s24');
      expect(portManager.getAllocation('phone-s24')).toBeUndefined();
    });
  });

  describe('MultiDeviceRunner', () => {
    it('executes all-devices replay strategy across device farm', async () => {
      const runner = new MultiDeviceRunner();
      const logs: string[] = [];

      const spec: FarmRunSpec = {
        sessionId: sampleAndroidSession.id,
        strategy: 'all-devices',
        targetDeviceIds: ['phone-s24', 'phone-pixel9'],
        iterations: 2,
        iterationsPerDevice: 2,
        maxParallelDevices: 2,
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
      const runner = new MultiDeviceRunner();
      const logs: string[] = [];

      const spec: FarmRunSpec = {
        sessionId: sampleAndroidSession.id,
        strategy: 'split-iterations',
        targetDeviceIds: ['phone-s24', 'phone-pixel9'],
        iterations: 6,
        totalIterations: 6,
        maxParallelDevices: 2,
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
  });
});

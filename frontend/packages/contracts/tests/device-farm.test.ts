import { describe, expect, it } from 'vitest';
import {
  APPIUM_RUNTIME_CONTEXT,
  DEVICE_FARM_CONTRACT_VERSION,
  DeviceProfile,
  DeviceLease,
  FarmRunReport,
  FarmRunSpec,
  PortLease,
  RecordingPlan,
  validateFarmRunSpec,
} from '../src/index.js';

describe('versioned offline device-farm contracts', () => {
  it('defines the required runtime context without a default device or port', () => {
    expect(APPIUM_RUNTIME_CONTEXT.schemaVersion).toBe(DEVICE_FARM_CONTRACT_VERSION);
    expect(APPIUM_RUNTIME_CONTEXT.source).toBe('environment');
    expect(APPIUM_RUNTIME_CONTEXT.variables).toEqual([
      { key: 'appiumUrl', name: 'AUTOMATEPLUS_APPIUM_URL', valueType: 'url', required: true },
      { key: 'udid', name: 'AUTOMATEPLUS_DEVICE_UDID', valueType: 'string', required: true },
      { key: 'systemPort', name: 'AUTOMATEPLUS_SYSTEM_PORT', valueType: 'port', required: true },
      { key: 'mjpegServerPort', name: 'AUTOMATEPLUS_MJPEG_SERVER_PORT', valueType: 'port', required: true },
      { key: 'chromedriverPort', name: 'AUTOMATEPLUS_CHROMEDRIVER_PORT', valueType: 'port', required: false },
    ]);
  });

  it('keeps device identity, leases, evidence, and recording plans versioned', () => {
    const profile: DeviceProfile = {
      schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
      deviceId: 'device-1',
      adbSerial: 'serial-1',
      model: 'phone',
      manufacturer: 'vendor',
      product: 'product',
      androidVersion: '15',
      sdkVersion: 35,
      isEmulator: false,
      resolution: { width: 1080, height: 2400 },
      density: 420,
      orientation: 'portrait',
      transport: 'usb',
      status: 'device',
      healthState: 'ready',
      lastSeenAt: 1,
    };
    const spec: FarmRunSpec = {
      schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
      sessionId: 'session-1',
      strategy: 'split-iterations',
      deviceIds: [profile.deviceId],
      maxParallelDevices: 1,
      iterationDelayMs: 0,
      failurePolicy: 'continue-other-devices',
      totalIterations: 2,
    };
    const lease: DeviceLease = {
      schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
      leaseId: 'lease-1',
      runId: 'run-1',
      deviceId: profile.deviceId,
      adbSerialSnapshot: profile.adbSerial,
      ownerId: 'worker-1',
      state: 'running',
      acquiredAt: 1,
    };
    const portLease: PortLease = {
      schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
      leaseId: 'port-lease-1',
      runId: lease.runId,
      deviceId: profile.deviceId,
      allocations: [
        { kind: 'system', port: 8201 },
        { kind: 'mjpeg', port: 9201 },
      ],
      state: 'active',
      acquiredAt: 1,
    };
    const recording: RecordingPlan = {
      schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
      recordingId: 'recording-1',
      sessionId: spec.sessionId,
      mode: 'primary-followers',
      primaryDeviceId: profile.deviceId,
      followerDeviceIds: [],
    };
    const report: FarmRunReport = {
      schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
      runId: lease.runId,
      sessionId: spec.sessionId,
      strategy: spec.strategy,
      status: 'blocked',
      completion: 'partial',
      plannedIterations: spec.totalIterations ?? 0,
      startedIterations: 0,
      passedIterations: 0,
      failedIterations: 0,
      blockedIterations: spec.totalIterations ?? 0,
      deviceRuns: [],
      startedAt: 1,
    };

    expect([profile, spec, lease, portLease, recording, report].every((value) => value.schemaVersion === 1)).toBe(true);
  });

  it('rejects ambiguous strategy iteration fields and mixed device selectors', () => {
    const errors = validateFarmRunSpec({
      schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
      sessionId: '00000000-0000-4000-8000-000000000001',
      strategy: 'split-iterations',
      deviceGroupId: '00000000-0000-4000-8000-000000000002',
      deviceIds: ['00000000-0000-4000-8000-000000000003'],
      iterationsPerDevice: 2,
      maxParallelDevices: 2,
      iterationDelayMs: 0,
      failurePolicy: 'continue-other-devices',
    });

    expect(errors).toEqual(expect.arrayContaining([
      'deviceGroupId and deviceIds are mutually exclusive',
      'totalIterations must be a positive integer for split-iterations',
      'iterationsPerDevice is invalid for split-iterations',
    ]));
  });
});

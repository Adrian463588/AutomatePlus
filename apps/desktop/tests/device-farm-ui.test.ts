import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeFixture = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../src/store/appStore.js', () => ({
  useAppStore: () => storeFixture.value,
}));

vi.mock('../src/components/farm/FarmRunModal.js', () => ({
  FarmRunModal: () => null,
}));

import { DeviceFarmView } from '../src/components/farm/DeviceFarmView.js';
import { DeviceFarmPanel } from '../src/components/recorder/DeviceFarmPanel.js';

const androidSession = {
  id: 'session-android',
  platform: 'android',
  ir: { steps: [{ stepNumber: 1 }] },
};

function deviceProfile(deviceId: string, status: 'device' | 'offline' = 'device') {
  return {
    schemaVersion: 1,
    deviceId,
    adbSerial: `serial-${deviceId}`,
    model: `Android ${deviceId}`,
    manufacturer: 'Test fixture',
    product: 'test-fixture',
    androidVersion: '15',
    sdkVersion: 35,
    isEmulator: false,
    resolution: { width: 1080, height: 2400 },
    density: 420,
    orientation: 'portrait',
    transport: 'usb',
    status,
    healthState: status === 'device' ? 'ready' : 'offline',
    lastSeenAt: 1,
  };
}

function androidDevice(id: string, status: 'device' | 'offline' = 'device') {
  return {
    id,
    model: `Android ${id}`,
    product: 'test-fixture',
    androidVersion: '15',
    sdkVersion: 35,
    isEmulator: false,
    status,
  };
}

function buttonMarkup(markup: string, label: string): string {
  return markup.match(/<button\b[\s\S]*?<\/button>/g)?.find((button) => button.includes(label)) ?? '';
}

function setStore(overrides: Record<string, unknown> = {}) {
  storeFixture.value = {
    activeSession: androidSession,
    devices: [androidDevice('device-1'), androidDevice('device-2')],
    deviceProfiles: [deviceProfile('device-1'), deviceProfile('device-2')],
    deviceGroups: [],
    selectedDeviceIds: ['device-1', 'device-2'],
    primaryDeviceId: 'device-1',
    activeDevice: 'device-1',
    nativeHostAvailable: true,
    nativeHostMessage: 'Tauri/Rust host is ready.',
    deviceDiscoveryMessage: '2 Android devices discovered by the Tauri/Rust host.',
    isRunning: false,
    isRecording: false,
    discoverDevices: vi.fn(),
    toggleDeviceSelection: vi.fn(),
    setPrimaryDevice: vi.fn(),
    runFarmTest: vi.fn(),
    refreshDevices: vi.fn(),
    selectAllDevices: vi.fn(),
    clearDeviceSelection: vi.fn(),
    createDeviceGroup: vi.fn(),
    deleteDeviceGroup: vi.fn(),
    startMultiDeviceRecording: vi.fn(),
    stopMultiDeviceRecording: vi.fn(),
    ...overrides,
  };
}

describe('recorder farm renderer states', () => {
  beforeEach(() => setStore());

  it('keeps the replay action enabled only when the panel is actually ready', () => {
    const markup = renderToStaticMarkup(createElement(DeviceFarmPanel));
    const replayButton = buttonMarkup(markup, 'Replay selected devices');

    expect(replayButton).not.toContain('disabled=""');
    expect(replayButton).toContain('aria-describedby="device-farm-status"');
    expect(markup).toContain('Ready to replay selected devices.');
    expect(markup).not.toContain('Native host prerequisites are still required before replay.');
  });

  it('explains Tauri/Rust readiness and disables farm actions while a run is active', () => {
    setStore({
      nativeHostAvailable: false,
      nativeHostMessage: 'Native Android host is unavailable.',
      isRunning: true,
    });

    const markup = renderToStaticMarkup(createElement(DeviceFarmView));

    expect(markup).toContain('Tauri/Rust Android host is unavailable.');
    expect(buttonMarkup(markup, 'Refresh')).toContain('disabled');
    expect(buttonMarkup(markup, 'Select all')).toContain('disabled');
    expect(buttonMarkup(markup, 'Configure farm replay')).toContain('disabled');
    expect(markup).toContain('Wait for the current recording or replay to finish.');
    expect(markup).toContain('Live Android frames require the Tauri/Rust host');
  });

  it('does not expose selection or primary actions for an unauthorized device', () => {
    setStore({
      deviceProfiles: [deviceProfile('device-offline', 'offline')],
      selectedDeviceIds: [],
      primaryDeviceId: undefined,
    });

    const markup = renderToStaticMarkup(createElement(DeviceFarmView));

    expect(buttonMarkup(markup, 'Select all')).toContain('disabled');
    expect(buttonMarkup(markup, 'Select all')).toContain('No authorized devices are available to select.');
    expect(markup).toContain('Device is offline; only authorized devices can be selected.');
    expect(markup).toContain('Device is offline; only authorized devices can be primary.');
  });
});

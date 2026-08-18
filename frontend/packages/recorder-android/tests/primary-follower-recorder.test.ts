import { describe, expect, it } from 'vitest';
import { AndroidBridgeError } from '../src/android-errors.js';
import {
  AndroidFollowerLocatorObserver,
  AndroidPrimaryFollowerRecorder,
  AndroidRecorder,
} from '../src/index.js';
import type { IDeviceBridge } from '@automate-plus/contracts';
import type { RecordingPlan } from '@automate-plus/contracts';

const primarySerial = 'serial-primary';
const followerSerial = 'serial-follower';

function bridge(): IDeviceBridge {
  return {
    listDevices: async () => [{
      id: primarySerial,
      model: 'Pixel Primary',
      product: 'pixel',
      androidVersion: '14',
      sdkVersion: 34,
      isEmulator: false,
      status: 'device',
    }],
    startScreenMirror: async () => undefined,
    stopScreenMirror: async () => undefined,
    sendTap: async () => undefined,
    sendSwipe: async () => undefined,
    dumpUiHierarchy: async () => '<hierarchy/>',
  };
}

function plan(): RecordingPlan {
  return {
    schemaVersion: 1,
    recordingId: 'recording-1',
    sessionId: 'session-1',
    mode: 'primary-followers',
    primaryDeviceId: 'primary-id',
    followerDeviceIds: ['follower-id'],
  };
}

describe('Android primary/follower recording', () => {
  it('persists one primary action and separate follower semantic observation', async () => {
    const recorder = new AndroidRecorder(bridge());
    const observer = new AndroidFollowerLocatorObserver({
      dumpUiHierarchy: async (deviceId) => deviceId === followerSerial
        ? '<hierarchy><node resource-id="com.example:id/submit" class="android.widget.Button" bounds="[0,0][100,100]"/></hierarchy>'
        : '<hierarchy/>',
    });
    const coordinator = new AndroidPrimaryFollowerRecorder(recorder, observer);
    const events: Array<{ primaryAction: unknown; observations: readonly { status: string; deviceId: string }[] }> = [];

    await coordinator.start(
      plan(),
      {
        primary: { deviceId: 'primary-id', adbSerialSnapshot: primarySerial },
        followers: [{ deviceId: 'follower-id', adbSerialSnapshot: followerSerial }],
      },
      (event) => events.push({ primaryAction: event.primaryAction, observations: event.observations }),
    );
    recorder.recordTouchEvent('tap', {
      resourceId: 'com.example:id/submit',
      bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    });
    await coordinator.stop();

    expect(events).toHaveLength(1);
    expect(events[0]?.primaryAction).toMatchObject({ action: 'tap', schemaVersion: 2 });
    expect(events[0]?.observations).toEqual([
      expect.objectContaining({ status: 'MATCHED', deviceId: 'follower-id', fallbackUsed: false }),
    ]);
  });

  it('emits blocked follower evidence when the follower hierarchy is unavailable', async () => {
    const recorder = new AndroidRecorder(bridge());
    const observer = new AndroidFollowerLocatorObserver({
      dumpUiHierarchy: async () => {
        throw new AndroidBridgeError('HIERARCHY_UNAVAILABLE', 'hierarchy unavailable', { blocked: true });
      },
    });
    const coordinator = new AndroidPrimaryFollowerRecorder(recorder, observer);
    const statuses: string[] = [];

    await coordinator.start(
      plan(),
      {
        primary: { deviceId: 'primary-id', adbSerialSnapshot: primarySerial },
        followers: [{ deviceId: 'follower-id', adbSerialSnapshot: followerSerial }],
      },
      (event) => event.observations.forEach((observation) => statuses.push(observation.status)),
    );
    recorder.recordTouchEvent('tap', {
      resourceId: 'com.example:id/submit',
      bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    });
    await coordinator.stop();

    expect(statuses).toEqual(['BLOCKED']);
  });
});

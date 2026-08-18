import { describe, expect, it } from 'vitest';
import { AndroidFollowerLocatorObserver } from '../src/index.js';
import type { ActionIR } from '@automate-plus/ir-schema';

const action = (locators: ActionIR['locators']): ActionIR => ({
  id: '00000000-0000-4000-8000-000000000001',
  schemaVersion: 2,
  stepNumber: 1,
  platform: 'android',
  action: 'tap',
  locators,
  timeoutMs: 5000,
  optional: false,
  timestamp: 1,
});

describe('Android follower locator observation', () => {
  it('matches a semantic locator on the follower hierarchy', async () => {
    const observer = new AndroidFollowerLocatorObserver({
      dumpUiHierarchy: async () =>
        '<hierarchy><node resource-id="com.example:id/submit" class="android.widget.Button" bounds="[0,0][100,100]"/></hierarchy>',
    });

    const observation = await observer.observe(
      action([{ strategy: 'resourceId', value: 'com.example:id/submit', score: 100 }]),
      { recordingId: 'recording-1', deviceId: 'device-2', adbSerialSnapshot: 'serial-2' },
    );

    expect(observation.status).toBe('MATCHED');
    expect(observation.fallbackUsed).toBe(false);
    expect(observation.hierarchyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks semantic gaps instead of broadcasting coordinate fallbacks', async () => {
    const observer = new AndroidFollowerLocatorObserver({
      dumpUiHierarchy: async () => '<hierarchy><node class="android.widget.Button" bounds="[0,0][100,100]"/></hierarchy>',
    });

    const observation = await observer.observe(
      action([{ strategy: 'bounds', value: '[0,0][100,100]', score: 30 }]),
      { recordingId: 'recording-1', deviceId: 'device-2' },
    );

    expect(observation.status).toBe('SEMANTIC_SELECTOR_MISSING');
    expect(observation.fallbackUsed).toBe(false);
  });
});

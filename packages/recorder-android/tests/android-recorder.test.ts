import { describe, it, expect } from 'vitest';
import {
  parseBounds,
  findNodeByCoordinates,
  extractAndroidLocators,
  AndroidRecorder,
} from '../src/index.js';
import { ActionIR } from '@automate-plus/ir-schema';

describe('Android Recorder & Hierarchy Parser', () => {
  it('should parse bounds correctly', () => {
    const bounds = parseBounds('[120,340][560,780]');
    expect(bounds).toEqual({ left: 120, top: 340, right: 560, bottom: 780 });
  });

  it('should find matching node by touch coordinate and extract locators', () => {
    const nodes = [
      {
        className: 'android.widget.FrameLayout',
        bounds: { left: 0, top: 0, right: 1080, bottom: 2400 },
      },
      {
        resourceId: 'com.app:id/submit_button',
        contentDesc: 'Submit Payment',
        text: 'Pay Now',
        className: 'android.widget.Button',
        bounds: { left: 100, top: 500, right: 980, bottom: 650 },
      },
    ];

    const match = findNodeByCoordinates(nodes, 200, 550);
    expect(match).toBeDefined();
    expect(match?.resourceId).toBe('com.app:id/submit_button');

    const locators = extractAndroidLocators(match);
    expect(locators[0].strategy).toBe('resourceId');
    expect(locators[0].value).toBe('com.app:id/submit_button');
    expect(locators[1].strategy).toBe('accessibilityId');
  });

  it('should record android tap and emit ActionIR', async () => {
    const recorder = new AndroidRecorder();
    const recordedActions: ActionIR[] = [];

    await recorder.start({ deviceId: 'emulator-5554' }, (action) => {
      recordedActions.push(action);
    });

    expect(recordedActions.length).toBe(1);
    expect(recordedActions[0].action).toBe('launchApp');

    recorder.recordTouchEvent('tap', {
      resourceId: 'com.app:id/checkout_btn',
      text: 'Checkout',
      bounds: { left: 50, top: 200, right: 450, bottom: 300 },
    });

    expect(recordedActions.length).toBe(2);
    expect(recordedActions[1].action).toBe('tap');
    expect(recordedActions[1].locators?.[0].value).toBe('com.app:id/checkout_btn');

    await recorder.stop();
  });
});

import { describe, it, expect } from 'vitest';
import { extractElementLocators, WebRecorder } from '../src/index.js';
import { ActionIR } from '@automate-plus/ir-schema';

describe('Web Recorder & Locator Extraction', () => {
  it('should extract and rank locators with data-testid as top priority', () => {
    const locators = extractElementLocators({
      tagName: 'BUTTON',
      testId: 'submit-checkout',
      role: 'button',
      ariaLabel: 'Submit Order',
      id: 'btn-submit',
      innerText: 'Submit Order',
    });

    expect(locators[0].strategy).toBe('testId');
    expect(locators[0].value).toBe('submit-checkout');
    expect(locators[1].strategy).toBe('role');
  });

  it('should record actions and emit ActionIR events', async () => {
    const recorder = new WebRecorder();
    const recordedActions: ActionIR[] = [];

    await recorder.start({ targetUrl: 'https://test.local' }, (action) => {
      recordedActions.push(action);
    });

    expect(recorder.state).toBe('recording');
    expect(recordedActions.length).toBe(1);
    expect(recordedActions[0].action).toBe('navigate');
    expect(recordedActions[0].value).toBe('https://test.local');

    recorder.handleRawDomEvent({
      actionType: 'click',
      element: {
        tagName: 'INPUT',
        testId: 'login-btn',
        id: 'login',
      },
    });

    expect(recordedActions.length).toBe(2);
    expect(recordedActions[1].action).toBe('click');
    expect(recordedActions[1].locators?.[0].value).toBe('login-btn');

    await recorder.stop();
    expect(recorder.state).toBe('idle');
  });
});

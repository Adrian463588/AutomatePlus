import { describe, expect, it } from 'vitest';
import { AutomationError } from '@automate-plus/contracts';
import { ActionIR } from '@automate-plus/ir-schema';
import {
  BrowserRecorderTransport,
  BrowserTransportOptions,
  BrowserTransportSession,
  RawBrowserEvent,
  WebRecorder,
  extractElementLocators,
} from '../src/index.js';

const element = {
  tagName: 'BUTTON',
  testId: 'submit-checkout',
  role: 'button',
  ariaLabel: 'Submit Order',
  id: 'btn-submit',
  innerText: 'Submit Order',
};

describe('Web Recorder & Locator Extraction', () => {
  it('extracts and ranks locators with data-testid as top priority', () => {
    const locators = extractElementLocators(element);

    expect(locators[0].strategy).toBe('testId');
    expect(locators[0].value).toBe('submit-checkout');
    expect(locators[1].strategy).toBe('role');
  });

  it('records legacy DOM events through an injected fake transport', async () => {
    const transport = new FakeTransport();
    const recorder = new WebRecorder(transport);
    const recordedActions: ActionIR[] = [];

    await recorder.start({ targetUrl: 'https://test.local' }, (action) => {
      recordedActions.push(action);
    });

    expect(recorder.state).toBe('recording');
    transport.emit({ type: 'navigation', url: 'https://test.local' });
    recorder.handleRawDomEvent({
      actionType: 'click',
      element: {
        tagName: 'INPUT',
        testId: 'login-btn',
        id: 'login',
      },
    });

    expect(recordedActions).toHaveLength(2);
    expect(recordedActions[0].action).toBe('navigate');
    expect(recordedActions[0].value).toBe('https://test.local');
    expect(recordedActions[1].action).toBe('click');
    expect(recordedActions[1].locators?.[0].value).toBe('login-btn');

    await recorder.stop();
    expect(recorder.state).toBe('idle');
    expect(transport.stopCalled).toBe(true);
  });

  it('normalizes browser events while preserving semantic mappings for legacy IR', async () => {
    const transport = new FakeTransport();
    const recorder = new WebRecorder(transport);
    const actions: ActionIR[] = [];
    await recorder.start({}, (action) => actions.push(action));

    const events: RawBrowserEvent[] = [
      { type: 'doubleClick', element },
      { type: 'rightClick', element },
      { type: 'hover', element },
      { type: 'fill', element, value: 'Ada' },
      { type: 'keyboard', element, key: 'Enter' },
      { type: 'clear', element },
      { type: 'select', element, value: 'pro' },
      { type: 'check', element, value: 'checked' },
      { type: 'scroll', element, deltaX: 2, deltaY: 80 },
      {
        type: 'dragAndDrop',
        element,
        dragTarget: { element: { tagName: 'DIV', id: 'drop-zone' }, coordinates: { x: 12, y: 24 } },
      },
      { type: 'popup', url: 'https://test.local/popup' },
      { type: 'iframe', frame: { url: 'https://test.local/frame' } },
      { type: 'fileChooser', element, filePaths: ['fixture.txt'] },
      { type: 'assertion', element, assertion: { type: 'text', expected: 'Welcome' } },
    ];

    for (const event of events) transport.emit(event);

    expect(actions.map((action) => action.action)).toEqual([
      'doubleClick',
      'rightClick',
      'hover',
      'fill',
      'pressKey',
      'clear',
      'fill',
      'click',
      'scroll',
      'dragAndDrop',
      'navigate',
      'waitFor',
      'fill',
      'assertText',
    ]);
    expect(actions[6].description).toBe('browserEvent:select');
    expect(actions[6].attributeName).toBe('selectedOption');
    expect(actions[7].description).toBe('browserEvent:check');
    expect(actions[9].dragTarget?.locators[0].value).toBe('drop-zone');
    expect(actions[10].description).toBe('browserEvent:popup');
    expect(actions[11].description).toBe('browserEvent:iframe');
    expect(actions[12].description).toBe('browserEvent:fileChooser');
    expect(actions[13].expectedValue).toBe('Welcome');
  });

  it('exposes manual assertion capture without requiring a browser page', async () => {
    const transport = new FakeTransport();
    const recorder = new WebRecorder(transport);
    const actions: ActionIR[] = [];
    await recorder.start({}, (action) => actions.push(action));

    recorder.recordAssertion({ type: 'visible', element });

    expect(actions[0].action).toBe('assertVisible');
    expect(actions[0].locators?.[0].value).toBe('submit-checkout');
  });

  it('rejects unsupported browser events instead of emitting fallback code', async () => {
    const transport = new FakeTransport();
    const recorder = new WebRecorder(transport);
    await recorder.start({}, () => undefined);

    expect(() => transport.emit({ type: 'unsupported-browser-action' })).toThrowError(
      /Unsupported browser event type/,
    );
  });

  it('returns a typed blocked runtime-missing error when Playwright is unavailable', async () => {
    const missingRuntime = new FakeTransport(new AutomationError('RUNTIME_MISSING', 'Playwright is unavailable'));
    const recorder = new WebRecorder(missingRuntime);

    await expect(recorder.start({}, () => undefined)).rejects.toMatchObject({
      code: 'RUNTIME_MISSING',
    });
    expect(recorder.state).toBe('idle');
    expect(recorder.status).toBe('blocked');
    expect(recorder.lastError?.code).toBe('RUNTIME_MISSING');
  });
});

class FakeTransport implements BrowserRecorderTransport {
  private onEvent?: (event: RawBrowserEvent) => void;
  public stopCalled = false;

  public constructor(private readonly startError?: Error) {}

  public async start(
    _options: BrowserTransportOptions,
    onEvent: (event: RawBrowserEvent) => void,
  ): Promise<BrowserTransportSession> {
    if (this.startError) throw this.startError;
    this.onEvent = onEvent;
    return {
      stop: async () => {
        this.stopCalled = true;
      },
    };
  }

  public emit(event: RawBrowserEvent): void {
    this.onEvent?.(event);
  }
}

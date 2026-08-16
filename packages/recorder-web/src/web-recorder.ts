import { AutomationError, IRecorder, RecorderOptions, RecorderState, ActionCallback } from '@automate-plus/contracts';
import { ActionIR, PlatformType } from '@automate-plus/ir-schema';
import {
  BrowserRecorderTransport,
  BrowserTransportOptions,
  BrowserTransportSession,
  PlaywrightCdpBrowserTransport,
} from './browser-transport.js';
import { normalizeBrowserEvent, RawBrowserEvent } from './event-normalizer.js';
import { BrowserElementSnapshot } from './injected-script.js';

export interface WebRecorderStartOptions extends RecorderOptions {
  headless?: boolean;
  cdpEndpoint?: string;
}

export type WebRecorderStatus = RecorderState | 'blocked';

export class WebRecorder implements IRecorder {
  public readonly platform: PlatformType = 'web';
  private _state: RecorderState = 'idle';
  private actionCallback?: ActionCallback;
  private transportSession?: BrowserTransportSession;
  private stepCounter = 1;
  private _lastError?: AutomationError;

  public constructor(private readonly transport: BrowserRecorderTransport = new PlaywrightCdpBrowserTransport()) {}

  public get state(): RecorderState {
    return this._state;
  }

  public get status(): WebRecorderStatus {
    return this._lastError?.code === 'RUNTIME_MISSING' && this._state === 'idle' ? 'blocked' : this._state;
  }

  public get lastError(): AutomationError | undefined {
    return this._lastError;
  }

  public async start(options: WebRecorderStartOptions, onAction: ActionCallback): Promise<void>;
  public async start(options: RecorderOptions, onAction: ActionCallback): Promise<void>;
  public async start(options: WebRecorderStartOptions, onAction: ActionCallback): Promise<void> {
    if (this._state === 'recording' || this._state === 'paused' || this._state === 'starting') {
      throw new AutomationError('PROTOCOL_ERROR', 'Web recorder is already active');
    }

    this._state = 'starting';
    this.actionCallback = onAction;
    this.stepCounter = 1;
    this._lastError = undefined;

    try {
      const transportOptions: BrowserTransportOptions = {
        targetUrl: options.targetUrl,
        viewport: options.viewport,
        headless: options.headless,
        cdpEndpoint: options.cdpEndpoint,
      };
      this.transportSession = await this.transport.start(transportOptions, (raw) => this.handleRawBrowserEvent(raw));
      this._state = 'recording';
    } catch (error) {
      this._lastError = toAutomationError(error);
      this.transportSession = undefined;
      this.actionCallback = undefined;
      this._state = 'idle';
      throw error;
    }
  }

  public handleRawDomEvent(raw: {
    actionType: string;
    value?: string;
    element: BrowserElementSnapshot;
  }): void {
    this.handleRawBrowserEvent(raw);
  }

  public handleRawBrowserEvent(raw: RawBrowserEvent): void {
    if ((this._state !== 'recording' && this._state !== 'starting') || !this.actionCallback) return;
    const action = normalizeBrowserEvent(raw, this.stepCounter++);
    this.actionCallback(action);
  }

  public recordAssertion(assertion: {
    type: string;
    expected?: string;
    expectedValue?: string;
    attributeName?: string;
    element?: BrowserElementSnapshot;
  }): void {
    this.handleRawBrowserEvent({
      type: 'assertion',
      assertion,
      element: assertion.element,
      value: assertion.expected ?? assertion.expectedValue,
    });
  }

  public async pause(): Promise<void> {
    if (this._state !== 'recording') return;
    this._state = 'paused';
    await this.transportSession?.pause?.();
  }

  public async resume(): Promise<void> {
    if (this._state !== 'paused') return;
    await this.transportSession?.resume?.();
    this._state = 'recording';
  }

  public async stop(): Promise<void> {
    if (this._state === 'idle') return;
    this._state = 'stopping';
    try {
      await this.transportSession?.stop();
    } finally {
      this.transportSession = undefined;
      this.actionCallback = undefined;
      this._state = 'idle';
    }
  }
}

function toAutomationError(error: unknown): AutomationError {
  if (error instanceof AutomationError) return error;
  return new AutomationError('PROTOCOL_ERROR', error instanceof Error ? error.message : 'Web recorder failed', {
    cause: error,
  });
}

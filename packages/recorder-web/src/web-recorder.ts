import { ActionCallback, IRecorder, RecorderOptions, RecorderState } from '@automate-plus/contracts';
import { ActionIR, PlatformType } from '@automate-plus/ir-schema';
import { extractElementLocators } from './injected-script.js';
import crypto from 'node:crypto';

export class WebRecorder implements IRecorder {
  public readonly platform: PlatformType = 'web';
  private _state: RecorderState = 'idle';
  private actionCallback?: ActionCallback;
  private stepCounter = 1;

  public get state(): RecorderState {
    return this._state;
  }

  public async start(options: RecorderOptions, onAction: ActionCallback): Promise<void> {
    this._state = 'recording';
    this.actionCallback = onAction;
    this.stepCounter = 1;

    // Emits initial navigation action if URL provided
    if (options.targetUrl) {
      const navAction: ActionIR = {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        stepNumber: this.stepCounter++,
        platform: 'web',
        action: 'navigate',
        value: options.targetUrl,
        timeoutMs: 10000,
        timestamp: Date.now(),
        optional: false,
      };
      this.actionCallback(navAction);
    }
  }

  public handleRawDomEvent(raw: {
    actionType: string;
    value?: string;
    element: Parameters<typeof extractElementLocators>[0];
  }): void {
    if (this._state !== 'recording' || !this.actionCallback) return;

    const locators = extractElementLocators(raw.element);
    const action: ActionIR = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: this.stepCounter++,
      platform: 'web',
      action: raw.actionType as any,
      value: raw.value,
      locators,
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    };

    this.actionCallback(action);
  }

  public async pause(): Promise<void> {
    if (this._state === 'recording') {
      this._state = 'paused';
    }
  }

  public async resume(): Promise<void> {
    if (this._state === 'paused') {
      this._state = 'recording';
    }
  }

  public async stop(): Promise<void> {
    this._state = 'idle';
    this.actionCallback = undefined;
  }
}

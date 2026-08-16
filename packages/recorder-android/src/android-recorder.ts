import { ActionCallback, IRecorder, RecorderOptions, RecorderState } from '@automate-plus/contracts';
import { ActionIR, PlatformType } from '@automate-plus/ir-schema';
import { AndroidUiNode, extractAndroidLocators } from './hierarchy-parser.js';
import crypto from 'node:crypto';

export class AndroidRecorder implements IRecorder {
  public readonly platform: PlatformType = 'android';
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

    // Emits initial launch app action if device or package provided
    if (options.deviceId) {
      const launchAction: ActionIR = {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        stepNumber: this.stepCounter++,
        platform: 'android',
        action: 'launchApp',
        value: options.deviceId,
        timeoutMs: 10000,
        timestamp: Date.now(),
        optional: false,
      };
      this.actionCallback(launchAction);
    }
  }

  public recordTouchEvent(actionType: 'tap' | 'swipe' | 'fill' | 'back', node?: AndroidUiNode, value?: string): void {
    if (this._state !== 'recording' || !this.actionCallback) return;

    const locators = extractAndroidLocators(node);
    const action: ActionIR = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: this.stepCounter++,
      platform: 'android',
      action: actionType,
      value,
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

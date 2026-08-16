import { randomUUID } from 'node:crypto';
import { ActionCallback, IDeviceBridge, IRecorder, RecorderOptions, RecorderState } from '@automate-plus/contracts';
import { ActionIR, PlatformType } from '@automate-plus/ir-schema';
import { AdbBridge } from './adb-bridge.js';
import { AndroidBridgeError } from './android-errors.js';
import { AndroidDeviceLock } from './device-lock.js';
import { AndroidUiNode, extractAndroidLocators } from './hierarchy-parser.js';

export interface AndroidRecorderBridge extends IDeviceBridge {
  acquireDeviceLock?(deviceId: string): Promise<AndroidDeviceLock>;
}

export type AndroidRecordedAction =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'swipe'
  | 'drag'
  | 'fill'
  | 'back'
  | 'home'
  | 'enter'
  | 'launchApp'
  | 'closeApp';

export class AndroidRecorder implements IRecorder {
  public readonly platform: PlatformType = 'android';
  private _state: RecorderState = 'idle';
  private actionCallback?: ActionCallback;
  private stepCounter = 1;
  private deviceLock?: AndroidDeviceLock;

  public constructor(private readonly deviceBridge: AndroidRecorderBridge = new AdbBridge()) {}

  public get state(): RecorderState {
    return this._state;
  }

  public async start(options: RecorderOptions, onAction: ActionCallback): Promise<void> {
    if (this._state !== 'idle') {
      throw new AndroidBridgeError('DEVICE_BUSY', 'The Android recorder is already active.', { blocked: true });
    }
    if (!options.deviceId) {
      throw new AndroidBridgeError('DEVICE_REQUIRED', 'Select an Android device before starting a recording.', {
        blocked: true,
      });
    }

    this._state = 'starting';
    this.actionCallback = onAction;
    this.stepCounter = 1;

    try {
      if (this.deviceBridge.acquireDeviceLock) {
        this.deviceLock = await this.deviceBridge.acquireDeviceLock(options.deviceId);
      } else {
        await this.assertDeviceReady(options.deviceId);
      }
      this._state = 'recording';
    } catch (error) {
      this.actionCallback = undefined;
      this._state = 'idle';
      throw error;
    }
  }

  public recordTouchEvent(
    actionType: AndroidRecordedAction,
    node?: AndroidUiNode,
    value?: string,
  ): void {
    if (this._state !== 'recording' || !this.actionCallback) return;

    const action: ActionIR = {
      id: randomUUID(),
      schemaVersion: 1,
      stepNumber: this.stepCounter++,
      platform: 'android',
      action: actionType,
      value,
      locators: extractAndroidLocators(node),
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
    if (this._state === 'idle') return;
    this._state = 'stopping';
    this.deviceLock?.release();
    this.deviceLock = undefined;
    this.actionCallback = undefined;
    this._state = 'idle';
  }

  private async assertDeviceReady(deviceId: string): Promise<void> {
    const device = (await this.deviceBridge.listDevices()).find((candidate) => candidate.id === deviceId);
    if (!device) {
      throw new AndroidBridgeError('DEVICE_UNAVAILABLE', `Android device '${deviceId}' was not discovered.`, {
        blocked: true,
        deviceId,
      });
    }
    if (device.status === 'unauthorized') {
      throw new AndroidBridgeError('DEVICE_UNAUTHORIZED', `Android device '${deviceId}' is unauthorized.`, {
        blocked: true,
        deviceId,
      });
    }
    if (device.status === 'offline') {
      throw new AndroidBridgeError('DEVICE_OFFLINE', `Android device '${deviceId}' is offline.`, {
        blocked: true,
        deviceId,
      });
    }
  }
}

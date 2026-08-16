import type { ActionCallback, RecorderOptions, RecorderState } from '@automate-plus/contracts';
import { AndroidBridgeError } from './android-errors.js';

/** Browser migration facade. Native ADB control belongs to the host process. */
export class AndroidRecorder {
  public readonly platform = 'android' as const;
  private _state: RecorderState = 'idle';

  public get state(): RecorderState {
    return this._state;
  }

  public async start(options: RecorderOptions, _onAction: ActionCallback): Promise<void> {
    this._state = 'starting';
    this._state = 'idle';
    throw new AndroidBridgeError(
      'DEVICE_UNAVAILABLE',
      options.deviceId
        ? `Android recording is host-only; device '${options.deviceId}' is not available in the browser migration shell.`
        : 'Select an Android device in the native host before recording.',
      { blocked: true, deviceId: options.deviceId },
    );
  }

  public async stop(): Promise<void> {
    this._state = 'idle';
  }
}

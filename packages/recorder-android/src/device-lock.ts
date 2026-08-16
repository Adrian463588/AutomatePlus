import { randomUUID } from 'node:crypto';
import { invalidArgument } from './android-errors.js';
import { AndroidBridgeError } from './android-errors.js';

export interface AndroidDeviceLock {
  readonly deviceId: string;
  readonly token: string;
  release(): void;
}

export class DeviceSerialLock {
  private readonly owners = new Map<string, string>();

  public acquire(deviceId: string): AndroidDeviceLock {
    if (!deviceId.trim()) {
      throw invalidArgument('A device serial is required to acquire a lock.');
    }
    if (this.owners.has(deviceId)) {
      throw new AndroidBridgeError('DEVICE_BUSY', `Android device '${deviceId}' is already locked.`, {
        blocked: true,
        deviceId,
      });
    }

    const token = randomUUID();
    this.owners.set(deviceId, token);
    let released = false;

    return {
      deviceId,
      token,
      release: (): void => {
        if (released) return;
        released = true;
        if (this.owners.get(deviceId) === token) {
          this.owners.delete(deviceId);
        }
      },
    };
  }

  public isLocked(deviceId: string): boolean {
    return this.owners.has(deviceId);
  }
}

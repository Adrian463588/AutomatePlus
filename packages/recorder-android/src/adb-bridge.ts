import { AndroidDeviceInfo, IDeviceBridge, TouchPoint } from '@automate-plus/contracts';
import { AdbCommandBuilder, AdbInvocation } from './adb-command-builder.js';
import { AndroidBridgeError } from './android-errors.js';
import { AndroidDeviceLock, DeviceSerialLock } from './device-lock.js';
import {
  ProcessExecutionError,
  ProcessExecutionOptions,
  ProcessExecutor,
  SpawnProcessExecutor,
} from './process-executor.js';

export interface AdbBridgeOptions {
  adbPath?: string;
  commandTimeoutMs?: number;
  executor?: ProcessExecutor;
  lockManager?: DeviceSerialLock;
}

export interface ParsedDevice {
  id: string;
  status: AndroidDeviceInfo['status'];
  model: string;
  product: string;
  isEmulator: boolean;
}

export type DeviceProperties = Record<string, string>;

const UNKNOWN_ANDROID_VERSION = 'unknown';
const UNKNOWN_DEVICE_VALUE = 'unknown';

export class AdbBridge implements IDeviceBridge {
  private readonly executor: ProcessExecutor;
  private readonly commands: AdbCommandBuilder;
  private readonly commandTimeoutMs: number;
  private readonly lockManager: DeviceSerialLock;
  private readonly activeLocks = new Map<string, AndroidDeviceLock>();

  public constructor(options: AdbBridgeOptions = {}) {
    if (options.commandTimeoutMs !== undefined && (!Number.isInteger(options.commandTimeoutMs) || options.commandTimeoutMs <= 0)) {
      throw new AndroidBridgeError('INVALID_ARGUMENT', 'ADB command timeout must be a positive integer.', {
        details: { commandTimeoutMs: options.commandTimeoutMs },
      });
    }
    this.executor = options.executor ?? new SpawnProcessExecutor();
    this.commands = new AdbCommandBuilder(options.adbPath ?? process.env.AUTOMATEPLUS_ADB_PATH ?? 'adb');
    this.commandTimeoutMs = options.commandTimeoutMs ?? 15_000;
    this.lockManager = options.lockManager ?? new DeviceSerialLock();
  }

  public async listDevices(): Promise<AndroidDeviceInfo[]> {
    const output = await this.execute(this.commands.listDevices());
    const parsedDevices = parseDeviceList(output);
    return Promise.all(
      parsedDevices.map(async (device) => {
        if (device.status !== 'device') {
          return {
            ...device,
            androidVersion: UNKNOWN_ANDROID_VERSION,
            sdkVersion: 0,
          };
        }

        const properties = await this.tryReadProperties(device.id);
        return {
          id: device.id,
          model: properties['ro.product.model'] ?? device.model,
          product: properties['ro.product.name'] ?? device.product,
          androidVersion: properties['ro.build.version.release'] ?? UNKNOWN_ANDROID_VERSION,
          sdkVersion: parseSdkVersion(properties['ro.build.version.sdk']),
          isEmulator: device.isEmulator || properties['ro.kernel.qemu'] === '1',
          status: device.status,
        };
      }),
    );
  }

  public async acquireDeviceLock(deviceId: string): Promise<AndroidDeviceLock> {
    const managerLock = this.lockManager.acquire(deviceId);
    let released = false;
    const lock: AndroidDeviceLock = {
      deviceId: managerLock.deviceId,
      token: managerLock.token,
      release: (): void => {
        if (released) return;
        released = true;
        if (this.activeLocks.get(deviceId)?.token === managerLock.token) {
          this.activeLocks.delete(deviceId);
        }
        managerLock.release();
      },
    };
    try {
      await this.requireAvailableDevice(deviceId);
      this.activeLocks.set(deviceId, lock);
      return lock;
    } catch (error) {
      lock.release();
      throw error;
    }
  }

  public isDeviceLocked(deviceId: string): boolean {
    return this.lockManager.isLocked(deviceId);
  }

  public async startScreenMirror(_deviceId: string, _onFrame: (nalUnit: Uint8Array) => void): Promise<void> {
    throw new AndroidBridgeError(
      'MIRROR_UNAVAILABLE',
      'Screen mirroring is unavailable until a supported local mirror runtime is installed.',
      { blocked: true },
    );
  }

  public async stopScreenMirror(_deviceId: string): Promise<void> {
    throw new AndroidBridgeError(
      'MIRROR_UNAVAILABLE',
      'Screen mirroring is unavailable until a supported local mirror runtime is installed.',
      { blocked: true },
    );
  }

  public async sendTap(deviceId: string, point: TouchPoint): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.tap(deviceId, point.x, point.y));
  }

  public async sendDoubleTap(deviceId: string, point: TouchPoint): Promise<void> {
    await this.withDeviceLock(deviceId, async () => {
      await this.execute(this.commands.tap(deviceId, point.x, point.y), deviceId);
      await this.execute(this.commands.tap(deviceId, point.x, point.y), deviceId);
    });
  }

  public async sendLongPress(deviceId: string, point: TouchPoint, durationMs = 800): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.longPress(deviceId, point.x, point.y, durationMs));
  }

  public async sendSwipe(
    deviceId: string,
    start: TouchPoint,
    end: TouchPoint,
    durationMs = 300,
  ): Promise<void> {
    await this.executeForDevice(
      deviceId,
      this.commands.swipe(deviceId, start.x, start.y, end.x, end.y, durationMs),
    );
  }

  public async sendDrag(
    deviceId: string,
    start: TouchPoint,
    end: TouchPoint,
    durationMs = 500,
  ): Promise<void> {
    await this.sendSwipe(deviceId, start, end, durationMs);
  }

  public async sendInputText(deviceId: string, value: string): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.inputText(deviceId, value));
  }

  public async sendBack(deviceId: string): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.back(deviceId));
  }

  public async sendHome(deviceId: string): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.home(deviceId));
  }

  public async sendEnter(deviceId: string): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.enter(deviceId));
  }

  public async launchApp(deviceId: string, packageName: string, activityName?: string): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.launchApp(deviceId, packageName, activityName));
  }

  public async closeApp(deviceId: string, packageName: string): Promise<void> {
    await this.executeForDevice(deviceId, this.commands.closeApp(deviceId, packageName));
  }

  public async dumpUiHierarchy(deviceId: string): Promise<string> {
    const output = await this.executeForDevice(deviceId, this.commands.dumpUiHierarchy(deviceId));
    const hierarchy = output.trim();
    if (!hierarchy.includes('<hierarchy')) {
      throw new AndroidBridgeError(
        'HIERARCHY_UNAVAILABLE',
        `ADB returned no UI hierarchy for device '${deviceId}'.`,
        { blocked: true, deviceId, details: { output: hierarchy.slice(0, 500) } },
      );
    }
    return hierarchy;
  }

  private async executeForDevice(deviceId: string, invocation: AdbInvocation): Promise<string> {
    return this.withDeviceLock(deviceId, () => this.execute(invocation, deviceId));
  }

  private async withDeviceLock<T>(deviceId: string, operation: () => Promise<T>): Promise<T> {
    const existingLock = this.activeLocks.get(deviceId);
    if (existingLock) {
      return operation();
    }

    const lock = await this.acquireDeviceLock(deviceId);
    try {
      return await operation();
    } finally {
      lock.release();
    }
  }

  private async requireAvailableDevice(deviceId: string): Promise<AndroidDeviceInfo> {
    const device = (await this.listDevices()).find((candidate) => candidate.id === deviceId);
    if (!device) {
      throw new AndroidBridgeError('DEVICE_UNAVAILABLE', `Android device '${deviceId}' was not discovered.`, {
        blocked: true,
        deviceId,
      });
    }
    if (device.status === 'unauthorized') {
      throw new AndroidBridgeError(
        'DEVICE_UNAUTHORIZED',
        `Android device '${deviceId}' is unauthorized. Accept the ADB authorization prompt on the device.`,
        { blocked: true, deviceId },
      );
    }
    if (device.status === 'offline') {
      throw new AndroidBridgeError('DEVICE_OFFLINE', `Android device '${deviceId}' is offline.`, {
        blocked: true,
        deviceId,
      });
    }
    return device;
  }

  private async tryReadProperties(deviceId: string): Promise<DeviceProperties> {
    try {
      const output = await this.execute(this.commands.getProperties(deviceId), deviceId);
      return parseProperties(output);
    } catch (error) {
      if (error instanceof AndroidBridgeError && error.code === 'ADB_COMMAND_FAILED') {
        return {};
      }
      throw error;
    }
  }

  private async execute(invocation: AdbInvocation, deviceId?: string): Promise<string> {
    const options: ProcessExecutionOptions = { timeoutMs: this.commandTimeoutMs };
    let result;
    try {
      result = await this.executor.execute(invocation.executable, invocation.args, options);
    } catch (error) {
      if (error instanceof ProcessExecutionError) {
        if (error.failureCode === 'CANCELLED') {
          throw new AndroidBridgeError('CANCELLED', error.message, { deviceId, cause: error });
        }
        if (error.failureCode === 'PROCESS_TIMEOUT') {
          throw new AndroidBridgeError('ADB_TIMEOUT', error.message, { blocked: true, deviceId, cause: error });
        }
        throw new AndroidBridgeError('ADB_UNAVAILABLE', error.message, {
          blocked: true,
          deviceId,
          cause: error,
        });
      }
      throw new AndroidBridgeError('ADB_UNAVAILABLE', 'The ADB process could not be started.', {
        blocked: true,
        deviceId,
        cause: error,
      });
    }

    if (result.exitCode !== 0) {
      const diagnostic = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
      const lowerDiagnostic = diagnostic.toLowerCase();
      if (deviceId && lowerDiagnostic.includes('unauthorized')) {
        throw new AndroidBridgeError('DEVICE_UNAUTHORIZED', diagnostic, { blocked: true, deviceId });
      }
      if (deviceId && lowerDiagnostic.includes('offline')) {
        throw new AndroidBridgeError('DEVICE_OFFLINE', diagnostic, { blocked: true, deviceId });
      }
      throw new AndroidBridgeError('ADB_COMMAND_FAILED', `ADB command failed: ${diagnostic}`, {
        deviceId,
        details: { executable: invocation.executable, args: invocation.args, exitCode: result.exitCode },
      });
    }
    return result.stdout;
  }
}

export function parseDeviceList(output: string): ParsedDevice[] {
  const devices: ParsedDevice[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('List of devices attached')) continue;

    const match = line.match(/^(\S+)\s+(device|offline|unauthorized|no permissions)(?:\s+(.*))?$/i);
    if (!match) continue;

    const statusToken = match[2].toLowerCase();
    const status: AndroidDeviceInfo['status'] =
      statusToken === 'offline'
        ? 'offline'
        : statusToken === 'unauthorized' || statusToken === 'no permissions'
          ? 'unauthorized'
          : 'device';
    const attributes = parseDeviceAttributes(match[3] ?? '');
    devices.push({
      id: match[1],
      status,
      model: attributes.model ? attributes.model.replaceAll('_', ' ') : UNKNOWN_DEVICE_VALUE,
      product: attributes.product ?? UNKNOWN_DEVICE_VALUE,
      isEmulator: match[1].startsWith('emulator-'),
    });
  }
  return devices;
}

export function parseProperties(output: string): DeviceProperties {
  const properties: DeviceProperties = {};
  const propertyPattern = /^\[([^\]]+)\]: \[([^\]]*)\]$/gm;
  for (const match of output.matchAll(propertyPattern)) {
    properties[match[1]] = match[2];
  }
  return properties;
}

function parseDeviceAttributes(attributes: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const match of attributes.matchAll(/([A-Za-z0-9_-]+):([^\s]+)/g)) {
    parsed[match[1]] = match[2];
  }
  return parsed;
}

function parseSdkVersion(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

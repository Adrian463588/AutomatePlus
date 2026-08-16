import { describe, expect, it } from 'vitest';
import {
  AdbBridge,
  AdbCommandBuilder,
  AndroidBridgeError,
  AndroidRecorder,
  ProcessExecutionError,
  extractAndroidLocators,
  findNodeByCoordinates,
  parseBounds,
  parseUiHierarchy,
} from '../src/index.js';
import { FakeProcessExecutor } from '../src/fake-executor.js';
import { ActionIR } from '@automate-plus/ir-schema';

const DEVICE_ID = 'emulator-5554';
const DEVICE_LIST = `List of devices attached\n${DEVICE_ID}\tdevice product:sdk_gphone64_x86_64 model:Pixel_7 device:emu64xa\n`;
const DEVICE_PROPERTIES = [
  '[ro.product.model]: [Pixel 7]',
  '[ro.product.name]: [sdk_gphone64_x86_64]',
  '[ro.build.version.release]: [14]',
  '[ro.build.version.sdk]: [34]',
  '[ro.kernel.qemu]: [1]',
].join('\n');

function success(stdout = ''): { exitCode: number; signal: null; stdout: string; stderr: string } {
  return { exitCode: 0, signal: null, stdout, stderr: '' };
}

function queueDeviceDiscovery(executor: FakeProcessExecutor): void {
  executor.enqueueResponse(success(DEVICE_LIST));
  executor.enqueueResponse(success(DEVICE_PROPERTIES));
}

describe('Android hierarchy parsing', () => {
  it('parses bounds and selects the smallest matching node', () => {
    const bounds = parseBounds('[120,340][560,780]');
    expect(bounds).toEqual({ left: 120, top: 340, right: 560, bottom: 780 });

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
    expect(match?.resourceId).toBe('com.app:id/submit_button');
    expect(extractAndroidLocators(match)[0]).toMatchObject({ strategy: 'resourceId', value: 'com.app:id/submit_button' });
  });

  it('parses a real uiautomator hierarchy into recorder nodes', () => {
    const nodes = parseUiHierarchy(
      '<hierarchy><node class="android.widget.FrameLayout" bounds="[0,0][1080,2400]"><node resource-id="com.app:id/login" content-desc="Log In" text="Log &amp; In" class="android.widget.Button" package="com.app" bounds="[100,200][980,350]"/></node></hierarchy>',
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toMatchObject({
      resourceId: 'com.app:id/login',
      contentDesc: 'Log In',
      text: 'Log & In',
      packageName: 'com.app',
      bounds: { left: 100, top: 200, right: 980, bottom: 350 },
    });
  });
});

describe('ADB command construction', () => {
  it('constructs only allowlisted shell operations with argument arrays', () => {
    const builder = new AdbCommandBuilder('adb.exe');

    expect(builder.tap(DEVICE_ID, 10, 20)).toEqual({
      executable: 'adb.exe',
      args: ['-s', DEVICE_ID, 'shell', 'input', 'tap', '10', '20'],
    });
    expect(builder.longPress(DEVICE_ID, 10, 20, 900).args).toEqual([
      '-s',
      DEVICE_ID,
      'shell',
      'input',
      'swipe',
      '10',
      '20',
      '10',
      '20',
      '900',
    ]);
    expect(builder.inputText(DEVICE_ID, 'hello world').args).toEqual([
      '-s',
      DEVICE_ID,
      'shell',
      'input',
      'text',
      'hello%sworld',
    ]);
    expect(builder.launchApp(DEVICE_ID, 'com.example.app', '.MainActivity').args).toEqual([
      '-s',
      DEVICE_ID,
      'shell',
      'am',
      'start',
      '-n',
      'com.example.app/com.example.app.MainActivity',
    ]);
    expect(builder.closeApp(DEVICE_ID, 'com.example.app').args).toEqual([
      '-s',
      DEVICE_ID,
      'shell',
      'am',
      'force-stop',
      'com.example.app',
    ]);
    expect(() => builder.tap('bad serial; command', 10, 20)).toThrowError(AndroidBridgeError);
    expect(() => builder.launchApp(DEVICE_ID, 'com.example.app;bad')).toThrowError(AndroidBridgeError);
  });
});

describe('AdbBridge', () => {
  it('discovers connected devices and enriches metadata through getprop', async () => {
    const executor = new FakeProcessExecutor();
    queueDeviceDiscovery(executor);
    const bridge = new AdbBridge({ executor, adbPath: 'adb.exe' });

    await expect(bridge.listDevices()).resolves.toEqual([
      {
        id: DEVICE_ID,
        model: 'Pixel 7',
        product: 'sdk_gphone64_x86_64',
        androidVersion: '14',
        sdkVersion: 34,
        isEmulator: true,
        status: 'device',
      },
    ]);
    expect(executor.calls.map((call) => call.args)).toEqual([
      ['devices', '-l'],
      ['-s', DEVICE_ID, 'shell', 'getprop'],
    ]);
  });

  it('returns a truthful blocked unauthorized error instead of sending input', async () => {
    const executor = new FakeProcessExecutor();
    executor.enqueueResponse(success(`List of devices attached\n${DEVICE_ID}\tunauthorized\n`));
    const bridge = new AdbBridge({ executor });

    await expect(bridge.sendTap(DEVICE_ID, { x: 10, y: 20 })).rejects.toMatchObject({
      code: 'DEVICE_UNAUTHORIZED',
      blocked: true,
      deviceId: DEVICE_ID,
    });
    expect(executor.calls).toHaveLength(1);
  });

  it('runs tap and hierarchy dump through the injected executor', async () => {
    const executor = new FakeProcessExecutor();
    queueDeviceDiscovery(executor);
    executor.enqueueResponse(success());
    await new AdbBridge({ executor }).sendTap(DEVICE_ID, { x: 10, y: 20 });
    expect(executor.calls[2].args).toEqual(['-s', DEVICE_ID, 'shell', 'input', 'tap', '10', '20']);

    const hierarchyExecutor = new FakeProcessExecutor();
    queueDeviceDiscovery(hierarchyExecutor);
    hierarchyExecutor.enqueueResponse(success('<hierarchy rotation="0"/>'));
    const hierarchy = await new AdbBridge({ executor: hierarchyExecutor }).dumpUiHierarchy(DEVICE_ID);
    expect(hierarchy).toBe('<hierarchy rotation="0"/>');
    expect(hierarchyExecutor.calls[2].args).toEqual([
      '-s',
      DEVICE_ID,
      'exec-out',
      'uiautomator',
      'dump',
      '/dev/tty',
    ]);
  });

  it('executes the supported touch, text, navigation, and app lifecycle actions', async () => {
    const executor = new FakeProcessExecutor();
    queueDeviceDiscovery(executor);
    const bridge = new AdbBridge({ executor });
    const lock = await bridge.acquireDeviceLock(DEVICE_ID);
    const actions = [
      () => bridge.sendLongPress(DEVICE_ID, { x: 10, y: 20 }, 900),
      () => bridge.sendSwipe(DEVICE_ID, { x: 10, y: 20 }, { x: 30, y: 40 }, 300),
      () => bridge.sendDrag(DEVICE_ID, { x: 30, y: 40 }, { x: 50, y: 60 }, 500),
      () => bridge.sendInputText(DEVICE_ID, 'hello world'),
      () => bridge.sendBack(DEVICE_ID),
      () => bridge.sendHome(DEVICE_ID),
      () => bridge.sendEnter(DEVICE_ID),
      () => bridge.launchApp(DEVICE_ID, 'com.example.app', '.MainActivity'),
      () => bridge.closeApp(DEVICE_ID, 'com.example.app'),
      () => bridge.sendDoubleTap(DEVICE_ID, { x: 70, y: 80 }),
    ];

    for (let index = 0; index < actions.length + 1; index += 1) {
      executor.enqueueResponse(success());
    }
    for (const action of actions) {
      await action();
    }
    lock.release();

    expect(executor.calls.slice(2).map((call) => call.args)).toEqual([
      ['-s', DEVICE_ID, 'shell', 'input', 'swipe', '10', '20', '10', '20', '900'],
      ['-s', DEVICE_ID, 'shell', 'input', 'swipe', '10', '20', '30', '40', '300'],
      ['-s', DEVICE_ID, 'shell', 'input', 'swipe', '30', '40', '50', '60', '500'],
      ['-s', DEVICE_ID, 'shell', 'input', 'text', 'hello%sworld'],
      ['-s', DEVICE_ID, 'shell', 'input', 'keyevent', '4'],
      ['-s', DEVICE_ID, 'shell', 'input', 'keyevent', '3'],
      ['-s', DEVICE_ID, 'shell', 'input', 'keyevent', '66'],
      ['-s', DEVICE_ID, 'shell', 'am', 'start', '-n', 'com.example.app/com.example.app.MainActivity'],
      ['-s', DEVICE_ID, 'shell', 'am', 'force-stop', 'com.example.app'],
      ['-s', DEVICE_ID, 'shell', 'input', 'tap', '70', '80'],
      ['-s', DEVICE_ID, 'shell', 'input', 'tap', '70', '80'],
    ]);
  });

  it('serializes ownership and releases the lock deterministically', async () => {
    const executor = new FakeProcessExecutor();
    queueDeviceDiscovery(executor);
    const bridge = new AdbBridge({ executor });
    const lock = await bridge.acquireDeviceLock(DEVICE_ID);

    await expect(bridge.acquireDeviceLock(DEVICE_ID)).rejects.toMatchObject({
      code: 'DEVICE_BUSY',
      blocked: true,
    });
    expect(bridge.isDeviceLocked(DEVICE_ID)).toBe(true);
    lock.release();
    expect(bridge.isDeviceLocked(DEVICE_ID)).toBe(false);

    queueDeviceDiscovery(executor);
    const secondLock = await bridge.acquireDeviceLock(DEVICE_ID);
    secondLock.release();
  });

  it('maps a missing adb executable to an unavailable blocked state', async () => {
    const executor = new FakeProcessExecutor();
    executor.enqueueError(new ProcessExecutionError('adb was not found', 'PROCESS_NOT_FOUND'));
    const bridge = new AdbBridge({ executor });

    await expect(bridge.listDevices()).rejects.toMatchObject({ code: 'ADB_UNAVAILABLE', blocked: true });
  });

  it('does not pretend that screen mirroring is available without its runtime', async () => {
    const bridge = new AdbBridge({ executor: new FakeProcessExecutor() });
    await expect(bridge.startScreenMirror(DEVICE_ID, () => undefined)).rejects.toMatchObject({
      code: 'MIRROR_UNAVAILABLE',
      blocked: true,
    });
  });
});

describe('AndroidRecorder', () => {
  it('holds the device lock for the recording lifecycle and records user actions', async () => {
    const executor = new FakeProcessExecutor();
    queueDeviceDiscovery(executor);
    const bridge = new AdbBridge({ executor });
    const recorder = new AndroidRecorder(bridge);
    const recordedActions: ActionIR[] = [];

    await recorder.start({ deviceId: DEVICE_ID }, (action) => recordedActions.push(action));
    expect(recorder.state).toBe('recording');
    expect(bridge.isDeviceLocked(DEVICE_ID)).toBe(true);
    executor.enqueueResponse(success());
    await bridge.sendTap(DEVICE_ID, { x: 10, y: 20 });
    expect(executor.calls[2].args).toEqual(['-s', DEVICE_ID, 'shell', 'input', 'tap', '10', '20']);

    recorder.recordTouchEvent(
      'tap',
      {
        resourceId: 'com.app:id/checkout',
        text: 'Checkout',
        bounds: { left: 50, top: 200, right: 450, bottom: 300 },
      },
    );

    expect(recordedActions).toHaveLength(1);
    expect(recordedActions[0]).toMatchObject({ action: 'tap', stepNumber: 1, platform: 'android' });
    await recorder.stop();
    expect(recorder.state).toBe('idle');
    expect(bridge.isDeviceLocked(DEVICE_ID)).toBe(false);
  });

  it('blocks starting without an explicit device', async () => {
    const recorder = new AndroidRecorder(new AdbBridge({ executor: new FakeProcessExecutor() }));
    await expect(recorder.start({}, () => undefined)).rejects.toMatchObject({
      code: 'DEVICE_REQUIRED',
      blocked: true,
    });
  });
});

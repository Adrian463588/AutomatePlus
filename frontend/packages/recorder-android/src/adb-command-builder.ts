import { invalidArgument } from './android-errors.js';

export interface AdbInvocation {
  executable: string;
  args: readonly string[];
}

const SAFE_SERIAL = /^[^\s\u0000"';&|<>]+$/;
const SAFE_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/;
const SAFE_ACTIVITY = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

function assertCoordinate(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw invalidArgument(`${name} must be a non-negative integer.`, { [name]: value });
  }
}

function assertDuration(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0 || value > 120_000) {
    throw invalidArgument(`${name} must be an integer between 1 and 120000 milliseconds.`, { [name]: value });
  }
}

function assertSerial(serial: string): void {
  if (!serial || !SAFE_SERIAL.test(serial)) {
    throw invalidArgument('The Android device serial is invalid.', { serial });
  }
}

function assertPackage(packageName: string): void {
  if (!SAFE_PACKAGE.test(packageName)) {
    throw invalidArgument('The Android package name is invalid.', { packageName });
  }
}

function normalizeActivity(packageName: string, activityName: string): string {
  assertPackage(packageName);
  const normalized = activityName.startsWith('.') ? `${packageName}${activityName}` : activityName;
  if (!SAFE_ACTIVITY.test(normalized)) {
    throw invalidArgument('The Android activity name is invalid.', { activityName });
  }
  return normalized;
}

function encodeInputText(value: string): string {
  if (!value || /[\u0000\r\n]/.test(value)) {
    throw invalidArgument('Input text must be non-empty and contain no NUL or newline characters.');
  }

  return value
    .replaceAll('%', '%25')
    .replaceAll(' ', '%s')
    .replace(/[\\"'&|;<>()$`*?!#]/g, '\\$&');
}

export class AdbCommandBuilder {
  public constructor(private readonly executable = 'adb') {}

  public listDevices(): AdbInvocation {
    return this.create(['devices', '-l']);
  }

  public getProperties(serial: string): AdbInvocation {
    return this.shell(serial, ['getprop']);
  }

  public dumpUiHierarchy(serial: string): AdbInvocation {
    assertSerial(serial);
    return this.create(['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty']);
  }

  public tap(serial: string, x: number, y: number): AdbInvocation {
    assertCoordinate(x, 'x');
    assertCoordinate(y, 'y');
    return this.shell(serial, ['input', 'tap', String(x), String(y)]);
  }

  public longPress(serial: string, x: number, y: number, durationMs = 800): AdbInvocation {
    assertCoordinate(x, 'x');
    assertCoordinate(y, 'y');
    assertDuration(durationMs, 'durationMs');
    return this.shell(serial, ['input', 'swipe', String(x), String(y), String(x), String(y), String(durationMs)]);
  }

  public swipe(
    serial: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs = 300,
  ): AdbInvocation {
    assertCoordinate(startX, 'startX');
    assertCoordinate(startY, 'startY');
    assertCoordinate(endX, 'endX');
    assertCoordinate(endY, 'endY');
    assertDuration(durationMs, 'durationMs');
    return this.shell(serial, [
      'input',
      'swipe',
      String(startX),
      String(startY),
      String(endX),
      String(endY),
      String(durationMs),
    ]);
  }

  public inputText(serial: string, value: string): AdbInvocation {
    return this.shell(serial, ['input', 'text', encodeInputText(value)]);
  }

  public back(serial: string): AdbInvocation {
    return this.keyEvent(serial, '4');
  }

  public home(serial: string): AdbInvocation {
    return this.keyEvent(serial, '3');
  }

  public enter(serial: string): AdbInvocation {
    return this.keyEvent(serial, '66');
  }

  public launchApp(serial: string, packageName: string, activityName?: string): AdbInvocation {
    assertPackage(packageName);
    if (activityName) {
      return this.shell(serial, ['am', 'start', '-n', `${packageName}/${normalizeActivity(packageName, activityName)}`]);
    }
    return this.shell(serial, ['monkey', '-p', packageName, '1']);
  }

  public closeApp(serial: string, packageName: string): AdbInvocation {
    assertPackage(packageName);
    return this.shell(serial, ['am', 'force-stop', packageName]);
  }

  private keyEvent(serial: string, keyCode: '3' | '4' | '66'): AdbInvocation {
    return this.shell(serial, ['input', 'keyevent', keyCode]);
  }

  private shell(serial: string, command: readonly string[]): AdbInvocation {
    assertSerial(serial);
    return this.create(['-s', serial, 'shell', ...command]);
  }

  private create(args: readonly string[]): AdbInvocation {
    return { executable: this.executable, args: [...args] };
  }
}

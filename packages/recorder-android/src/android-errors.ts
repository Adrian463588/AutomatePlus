export type AndroidBridgeErrorCode =
  | 'ADB_UNAVAILABLE'
  | 'ADB_COMMAND_FAILED'
  | 'ADB_TIMEOUT'
  | 'CANCELLED'
  | 'DEVICE_REQUIRED'
  | 'DEVICE_UNAVAILABLE'
  | 'DEVICE_UNAUTHORIZED'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_BUSY'
  | 'INVALID_ARGUMENT'
  | 'HIERARCHY_UNAVAILABLE'
  | 'MIRROR_UNAVAILABLE';

export interface AndroidBridgeErrorOptions {
  blocked?: boolean;
  deviceId?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AndroidBridgeError extends Error {
  public override readonly name = 'AndroidBridgeError';

  public constructor(
    public readonly code: AndroidBridgeErrorCode,
    message: string,
    public readonly options: AndroidBridgeErrorOptions = {},
  ) {
    super(message);
    this.cause = options.cause;
  }

  public get blocked(): boolean {
    return this.options.blocked ?? false;
  }

  public get deviceId(): string | undefined {
    return this.options.deviceId;
  }

  public get details(): Record<string, unknown> | undefined {
    return this.options.details;
  }
}

export function invalidArgument(message: string, details?: Record<string, unknown>): AndroidBridgeError {
  return new AndroidBridgeError('INVALID_ARGUMENT', message, { details });
}

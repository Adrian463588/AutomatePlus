export type AutomationErrorCode =
  | 'CAPABILITY_ERROR'
  | 'RUNTIME_MISSING'
  | 'DEVICE_UNAVAILABLE'
  | 'PROJECT_PREREQUISITE_MISSING'
  | 'PATH_DENIED'
  | 'PROCESS_TIMEOUT'
  | 'CANCELLED'
  | 'PROTOCOL_ERROR';

export interface SerializedAutomationError {
  code: AutomationErrorCode;
  name: string;
  message: string;
  details: Record<string, unknown>;
}

const AUTOMATION_ERROR_CODES = new Set<AutomationErrorCode>([
  'CAPABILITY_ERROR',
  'RUNTIME_MISSING',
  'DEVICE_UNAVAILABLE',
  'PROJECT_PREREQUISITE_MISSING',
  'PATH_DENIED',
  'PROCESS_TIMEOUT',
  'CANCELLED',
  'PROTOCOL_ERROR',
]);

export class AutomationError extends Error {
  public readonly code: AutomationErrorCode;
  public readonly details: Record<string, unknown>;

  constructor(code: AutomationErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AutomationError';
    this.code = code;
    this.details = details;
  }

  public toJSON(): SerializedAutomationError {
    return serializeAutomationError(this);
  }
}

export class CapabilityError extends AutomationError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('CAPABILITY_ERROR', message, details);
    this.name = 'CapabilityError';
  }
}

export class ProtocolError extends AutomationError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('PROTOCOL_ERROR', message, details);
    this.name = 'ProtocolError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return /password|passcode|token|secret|authorization|cookie|api[-_]?key/iu.test(key);
}

function toSerializable(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';

  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => toSerializable(item, seen));
    seen.delete(value);
    return result;
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = isSensitiveKey(key) ? '[REDACTED]' : toSerializable(value[key], seen);
    seen.delete(value);
    return result;
  }
  seen.delete(value);
  return String(value);
}

function normalizeDetails(details: unknown): Record<string, unknown> {
  const normalized = toSerializable(isRecord(details) ? details : {}, new WeakSet<object>());
  return isRecord(normalized) ? normalized : {};
}

export function isAutomationErrorCode(value: unknown): value is AutomationErrorCode {
  return typeof value === 'string' && AUTOMATION_ERROR_CODES.has(value as AutomationErrorCode);
}

export function isAutomationError(value: unknown): value is AutomationError {
  return value instanceof AutomationError || (
    isRecord(value) &&
    typeof value.message === 'string' &&
    isAutomationErrorCode(value.code)
  );
}

export function serializeAutomationError(error: unknown): SerializedAutomationError {
  if (isAutomationError(error)) {
    return {
      code: error.code,
      name: error instanceof Error ? error.name : 'AutomationError',
      message: error.message,
      details: normalizeDetails(isRecord(error) ? error.details : {}),
    };
  }
  if (error instanceof Error) {
    return { code: 'PROTOCOL_ERROR', name: error.name || 'Error', message: error.message, details: {} };
  }
  return { code: 'PROTOCOL_ERROR', name: 'Error', message: typeof error === 'string' ? error : 'Unknown automation error', details: {} };
}

export function stringifyAutomationError(error: unknown): string {
  return stableStringify(serializeAutomationError(error));
}

export function deserializeAutomationError(serialized: unknown): AutomationError {
  if (!isRecord(serialized) || !isAutomationErrorCode(serialized.code) || typeof serialized.message !== 'string' || !isRecord(serialized.details)) {
    throw new ProtocolError('Invalid serialized automation error', { value: serialized });
  }
  if (serialized.code === 'CAPABILITY_ERROR') return new CapabilityError(serialized.message, normalizeDetails(serialized.details));
  if (serialized.code === 'PROTOCOL_ERROR') return new ProtocolError(serialized.message, normalizeDetails(serialized.details));
  return new AutomationError(serialized.code, serialized.message, normalizeDetails(serialized.details));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = sortValue(value[key]);
    return result;
  }, {});
}

import {
  ProtocolError,
  SerializedAutomationError,
  deserializeAutomationError,
  serializeAutomationError,
  stableStringify,
} from './errors.js';
import { createRuntimeId } from './runtime-id.js';

export const IPC_PROTOCOL_VERSION = '1.0' as const;
export type IpcProtocolVersion = typeof IPC_PROTOCOL_VERSION;
export type IpcMethod = string;
export type IpcCorrelationId = string;
export type CorrelationId = IpcCorrelationId;
export type IpcKind = 'request' | 'response' | 'event' | 'cancel';
export type IpcMessageKind = IpcKind;

export interface ProtocolEnvelopeBase<Kind extends IpcKind> {
  protocolVersion: IpcProtocolVersion;
  kind: Kind;
  correlationId: IpcCorrelationId;
  method: IpcMethod;
}

export type IpcEnvelope<Payload = unknown> = ProtocolEnvelopeBase<IpcKind> & { payload: Payload };

export interface IpcRequest<Payload = unknown> extends ProtocolEnvelopeBase<'request'> {
  payload: Payload;
}

export interface IpcSuccessPayload<Payload = unknown> {
  ok: true;
  data: Payload;
}

export interface IpcFailurePayload {
  ok: false;
  error: SerializedAutomationError;
}

export type IpcResponsePayload<Payload = unknown> = IpcSuccessPayload<Payload> | IpcFailurePayload;

export interface IpcResponse<Payload = unknown> extends ProtocolEnvelopeBase<'response'> {
  payload: IpcResponsePayload<Payload>;
}

export interface IpcEvent<Payload = unknown> extends ProtocolEnvelopeBase<'event'> {
  sequence: number;
  payload: Payload;
}

export interface IpcCancelPayload {
  targetCorrelationId: IpcCorrelationId;
  reason?: string;
  gracePeriodMs: number;
}

export interface IpcCancel extends ProtocolEnvelopeBase<'cancel'> {
  method: 'request.cancel';
  payload: IpcCancelPayload;
}

export type IpcMessage<Payload = unknown> =
  | IpcRequest<Payload>
  | IpcResponse<Payload>
  | IpcEvent<Payload>
  | IpcCancel;

export type NdjsonEnvelope<Payload = unknown> = IpcEnvelope<Payload>;
export type NdjsonRequest<Payload = unknown> = IpcRequest<Payload>;
export type NdjsonResponse<Payload = unknown> = IpcResponse<Payload>;
export type NdjsonEvent<Payload = unknown> = IpcEvent<Payload>;
export type NdjsonCancel = IpcCancel;

export interface ProtocolMethodMap {
  'session.validate': { session: unknown };
  'session.normalize': { session: unknown };
  'generator.generate': { session: unknown; framework: string; language: string };
  'runner.run': { session: unknown; options: unknown };
}

export type MethodPayload<Method extends keyof ProtocolMethodMap> = ProtocolMethodMap[Method];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IPC_KINDS: readonly IpcKind[] = ['request', 'response', 'event', 'cancel'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidCorrelationId(value: unknown): value is IpcCorrelationId {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export const isCorrelationId = isValidCorrelationId;

function isSerializedError(value: unknown): value is SerializedAutomationError {
  return isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    isRecord(value.details) &&
    deserializeWithoutThrow(value as unknown as SerializedAutomationError);
}

function deserializeWithoutThrow(value: unknown): boolean {
  try {
    deserializeAutomationError(value);
    return true;
  } catch {
    return false;
  }
}

function protocolFailure(message: string, details: Record<string, unknown> = {}): never {
  throw new ProtocolError(message, details);
}

function assertBaseEnvelope(value: unknown): asserts value is ProtocolEnvelopeBase<IpcKind> & { payload: unknown } {
  if (!isRecord(value)) protocolFailure('IPC message must be a JSON object');
  if (value.protocolVersion !== IPC_PROTOCOL_VERSION) protocolFailure('Unsupported IPC protocol version', { protocolVersion: value.protocolVersion });
  if (typeof value.kind !== 'string' || !IPC_KINDS.includes(value.kind as IpcKind)) protocolFailure('IPC message kind is invalid', { kind: value.kind });
  if (!isValidCorrelationId(value.correlationId)) protocolFailure('IPC correlationId must be a UUID', { correlationId: value.correlationId });
  if (typeof value.method !== 'string' || value.method.trim().length === 0) protocolFailure('IPC method must be a non-empty string');
  if (!Object.prototype.hasOwnProperty.call(value, 'payload')) protocolFailure('IPC message payload is required');
}

export function assertIpcMessage(value: unknown): asserts value is IpcMessage {
  assertBaseEnvelope(value);

  switch (value.kind) {
    case 'request':
      return;
    case 'response':
      if (!isRecord(value.payload) || typeof value.payload.ok !== 'boolean') protocolFailure('IPC response payload must contain a boolean ok field');
      if (value.payload.ok === false && !isSerializedError(value.payload.error)) protocolFailure('IPC failure response must contain a serialized error');
      return;
    case 'event': {
      const sequence = (value as unknown as { sequence?: unknown }).sequence;
      if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 0) protocolFailure('IPC event sequence must be a non-negative integer');
      return;
    }
    case 'cancel':
      if (value.method !== 'request.cancel' || !isRecord(value.payload)) protocolFailure('IPC cancellation must use request.cancel and an object payload');
      if (!isValidCorrelationId(value.payload.targetCorrelationId)) protocolFailure('IPC cancellation targetCorrelationId must be a UUID');
      if (value.payload.reason !== undefined && typeof value.payload.reason !== 'string') protocolFailure('IPC cancellation reason must be a string');
      if (typeof value.payload.gracePeriodMs !== 'number' || !Number.isInteger(value.payload.gracePeriodMs) || value.payload.gracePeriodMs < 0) protocolFailure('IPC cancellation gracePeriodMs must be a non-negative integer');
      return;
  }
}

export function createCorrelationId(): IpcCorrelationId {
  return createRuntimeId();
}

export function createRequest<Payload>(correlationId: IpcCorrelationId, method: IpcMethod, payload: Payload): IpcRequest<Payload>;
export function createRequest<Payload>(method: IpcMethod, payload: Payload, correlationId?: IpcCorrelationId): IpcRequest<Payload>;
export function createRequest<Payload>(first: string, second: string | Payload, third?: Payload | IpcCorrelationId): IpcRequest<Payload> {
  const oldSignature = isValidCorrelationId(first) && typeof second === 'string';
  const correlationId = oldSignature ? first : (typeof third === 'string' ? third : createCorrelationId());
  const method = oldSignature ? second : first;
  const payload = (oldSignature ? third : second) as Payload;
  const message: IpcRequest<Payload> = { protocolVersion: IPC_PROTOCOL_VERSION, kind: 'request', correlationId, method, payload };
  assertIpcMessage(message);
  return message;
}

export function createResponse<Payload>(request: Pick<IpcRequest, 'correlationId' | 'method'>, data: Payload): IpcResponse<Payload> {
  const message: IpcResponse<Payload> = {
    protocolVersion: IPC_PROTOCOL_VERSION,
    kind: 'response',
    correlationId: request.correlationId,
    method: request.method,
    payload: { ok: true, data },
  };
  assertIpcMessage(message);
  return message;
}

export function createErrorResponse(request: Pick<IpcRequest, 'correlationId' | 'method'>, error: unknown): IpcResponse<never> {
  const message: IpcResponse<never> = {
    protocolVersion: IPC_PROTOCOL_VERSION,
    kind: 'response',
    correlationId: request.correlationId,
    method: request.method,
    payload: { ok: false, error: serializeAutomationError(error) },
  };
  assertIpcMessage(message);
  return message;
}

export function createEvent<Payload>(correlationId: IpcCorrelationId, method: IpcMethod, sequence: number, payload: Payload): IpcEvent<Payload> {
  const message: IpcEvent<Payload> = { protocolVersion: IPC_PROTOCOL_VERSION, kind: 'event', correlationId, method, sequence, payload };
  assertIpcMessage(message);
  return message;
}

export function createCancel(
  correlationId: IpcCorrelationId,
  targetCorrelationId: IpcCorrelationId,
  reason?: string,
  gracePeriodMs = 5000,
): IpcCancel {
  const message: IpcCancel = {
    protocolVersion: IPC_PROTOCOL_VERSION,
    kind: 'cancel',
    correlationId,
    method: 'request.cancel',
    payload: { targetCorrelationId, ...(reason === undefined ? {} : { reason }), gracePeriodMs },
  };
  assertIpcMessage(message);
  return message;
}

export function serializeIpcMessage(message: IpcMessage): string {
  assertIpcMessage(message);
  try {
    return `${stableStringify(message)}\n`;
  } catch (error) {
    protocolFailure('IPC message is not JSON serializable', { cause: serializeAutomationError(error) });
  }
}

export function parseIpcLine(line: string): IpcMessage {
  if (typeof line !== 'string' || line.trim().length === 0) protocolFailure('IPC line must be a non-empty string');
  const withoutTerminator = line.endsWith('\n') ? line.slice(0, -1).replace(/\r$/u, '') : line;
  if (withoutTerminator.includes('\n') || withoutTerminator.includes('\r')) protocolFailure('IPC input must contain exactly one NDJSON record');

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutTerminator) as unknown;
  } catch (error) {
    protocolFailure('IPC line is not valid JSON', { cause: serializeAutomationError(error) });
  }
  assertIpcMessage(parsed);
  return parsed;
}

export const serializeNdjsonMessage = serializeIpcMessage;
export const parseNdjsonMessage = parseIpcLine;

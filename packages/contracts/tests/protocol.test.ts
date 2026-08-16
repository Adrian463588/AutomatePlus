import { describe, expect, it } from 'vitest';
import {
  AutomationError,
  createCancel,
  createErrorResponse,
  createEvent,
  createCorrelationId,
  createRequest,
  deserializeAutomationError,
  parseIpcLine,
  serializeAutomationError,
  stringifyAutomationError,
  serializeIpcMessage,
} from '@automate-plus/contracts';

const requestId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const targetId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

describe('typed NDJSON IPC contracts', () => {
  it('round-trips a request as one newline-delimited record', () => {
    const request = createRequest(requestId, 'session.validate', { session: { id: requestId } });
    const line = serializeIpcMessage(request);
    const parsed = parseIpcLine(line);

    expect(line.endsWith('\n')).toBe(true);
    expect(parsed).toEqual(request);
  });

  it('validates event sequence and cancellation payloads', () => {
    const event = createEvent(requestId, 'session.progress', 3, { state: 'running' });
    const cancel = createCancel(requestId, targetId, 'user requested stop', 2500);

    expect(parseIpcLine(serializeIpcMessage(event))).toEqual(event);
    expect(parseIpcLine(serializeIpcMessage(cancel))).toEqual(cancel);
  });

  it('serializes typed errors with stable fields and redacted details', () => {
    const error = new AutomationError('CAPABILITY_ERROR', 'Unsupported action', {
      token: 'do-not-leak',
      zeta: 2,
      alpha: 1,
    });
    const serialized = serializeAutomationError(error);
    const request = createRequest(requestId, 'generator.generate', {});
    const response = createErrorResponse(request, error);
    const roundTrip = deserializeAutomationError(serialized);

    expect(serialized).toEqual({
      code: 'CAPABILITY_ERROR',
      name: 'AutomationError',
      message: 'Unsupported action',
      details: { alpha: 1, token: '[REDACTED]', zeta: 2 },
    });
    expect(roundTrip.code).toBe('CAPABILITY_ERROR');
    expect(response.payload.ok).toBe(false);
    if (!response.payload.ok) expect(response.payload.error).toEqual(serialized);
  });

  it('rejects malformed protocol records with a stable protocol error', () => {
    let caught: unknown;
    try {
      parseIpcLine(JSON.stringify({
        protocolVersion: '0.9',
        kind: 'request',
        correlationId: requestId,
        method: 'session.validate',
        payload: {},
      }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AutomationError);
    expect((caught as AutomationError).code).toBe('PROTOCOL_ERROR');
  });

  it('emits deterministic error JSON and UUID correlation IDs', () => {
    const serialized = stringifyAutomationError(new AutomationError('RUNTIME_MISSING', 'Runtime missing', { z: 2, a: 1 }));

    expect(serialized).toBe('{"code":"RUNTIME_MISSING","details":{"a":1,"z":2},"message":"Runtime missing","name":"AutomationError"}');
    expect(createCorrelationId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  });
});

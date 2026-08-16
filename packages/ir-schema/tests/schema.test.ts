import { describe, it, expect } from 'vitest';
import {
  ActionIRSchema,
  CURRENT_IR_SCHEMA_VERSION,
  migrateActionIR,
  migrateSessionIR,
  normalizeActionIR,
  validateActionIR,
  validateSessionIR,
} from '@automate-plus/ir-schema';

describe('Automation IR Schema Validation', () => {
  it('should successfully validate a valid web click ActionIR', () => {
    const rawAction = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'submit-btn', score: 100 },
        { strategy: 'css', value: '#submit-btn', score: 50 },
      ],
      timeoutMs: 5000,
      timestamp: Date.now(),
    };

    const result = validateActionIR(rawAction);
    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('click');
    expect(result.data?.locators?.length).toBe(2);
  });

  it('should reject ActionIR with invalid platform or action', () => {
    const rawAction = {
      id: 'invalid-id',
      stepNumber: -1,
      platform: 'invalid_platform',
      action: 'fly_to_moon',
    };

    const result = validateActionIR(rawAction);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('should validate a full SessionIR test case', () => {
    const rawSession = {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      projectId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      name: 'User Login E2E Flow',
      platform: 'web',
      targetConfig: {
        startUrl: 'https://example.com/login',
        viewport: { width: 1440, height: 900 },
      },
      environmentVariables: {
        USER_EMAIL: 'qa@automateplus.com',
      },
      steps: [
        {
          id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          stepNumber: 1,
          platform: 'web',
          action: 'fill',
          locators: [{ strategy: 'testId', value: 'email-input', score: 100 }],
          value: 'qa@automateplus.com',
          timeoutMs: 5000,
          timestamp: Date.now(),
        },
        {
          id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
          stepNumber: 2,
          platform: 'web',
          action: 'click',
          locators: [{ strategy: 'role', role: 'button', name: 'Log In', value: 'Log In', score: 95 }],
          timeoutMs: 5000,
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = validateSessionIR(rawSession);
    expect(result.success).toBe(true);
    expect(result.data?.steps.length).toBe(2);
  });

  it('should normalize legacy versions and keep locator ranking deterministic', () => {
    const legacyAction = {
      schemaVersion: 1,
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      step: 1,
      platform: 'web',
      type: 'click',
      locators: [
        { strategy: 'css', value: '#submit', score: 40 },
        { strategy: 'testId', value: 'submit', score: 95 },
      ],
    };

    const result = validateActionIR(legacyAction);
    expect(result.success).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.data?.schemaVersion).toBe(CURRENT_IR_SCHEMA_VERSION);
    expect(result.data?.locators?.map((locator) => locator.score)).toEqual([95, 40]);
    expect(normalizeActionIR(legacyAction).schemaVersion).toBe(CURRENT_IR_SCHEMA_VERSION);
    expect(legacyAction).toHaveProperty('schemaVersion', 1);
    expect(legacyAction).toHaveProperty('step', 1);
  });

  it('should reject platform/action and payload mismatches', () => {
    const webRequest = validateActionIR({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'web',
      action: 'httpRequest',
    });
    const missingApiPayload = validateActionIR({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'api',
      action: 'httpRequest',
    });

    expect(webRequest.success).toBe(false);
    expect(missingApiPayload.success).toBe(false);
    expect(missingApiPayload.errors?.some((error) => error.includes('apiPayload'))).toBe(true);
  });

  it('should accept secret references without treating them as plaintext values', () => {
    const action = validateActionIR({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'web',
      action: 'fill',
      locators: [{ strategy: 'testId', value: 'password', score: 100 }],
      value: { kind: 'secret', key: 'USER_PASSWORD' },
    });

    expect(action.success).toBe(true);
    expect(action.data?.value).toEqual({ kind: 'secret', key: 'USER_PASSWORD' });
    expect(validateActionIR({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'web',
      action: 'fill',
      locators: [{ strategy: 'testId', value: 'password', score: 100 }],
      value: { kind: 'secret', key: 'not a valid key' },
    }).success).toBe(false);
  });

  it('should validate assertion metadata against the action kind', () => {
    const valid = validateActionIR({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'api',
      action: 'assertJsonPath',
      assertion: { operator: 'equals', jsonPath: '$.status', expected: 'ok' },
    });
    const invalid = validateActionIR({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'api',
      action: 'assertJsonPath',
      assertion: { operator: 'equals' },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.errors?.some((error) => error.includes('JSONPath'))).toBe(true);
  });

  it('should reject non-contiguous or cross-platform session steps', () => {
    const result = validateSessionIR({
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      projectId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      name: 'Invalid Session',
      platform: 'web',
      targetConfig: {},
      steps: [
        {
          id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          stepNumber: 1,
          platform: 'web',
          action: 'click',
          locators: [{ strategy: 'testId', value: 'one', score: 100 }],
        },
        {
          id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
          stepNumber: 3,
          platform: 'api',
          action: 'assertStatusCode',
          expectedValue: '200',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => error.includes('contiguous'))).toBe(true);
    expect(result.errors?.some((error) => error.includes('must match'))).toBe(true);
  });

  it('should expose migration helpers that do not mutate the source object', () => {
    const legacySession = {
      schemaVersion: 1,
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      projectId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      name: 'Legacy Session',
      platform: 'web',
      actions: [
        {
          id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          platform: 'web',
          action: 'click',
          locators: [{ strategy: 'testId', value: 'submit', score: 100 }],
        },
      ],
    };

    const migrated = migrateSessionIR(legacySession) as { schemaVersion: number; steps: Array<{ stepNumber: number }> };
    expect(migrated.schemaVersion).toBe(CURRENT_IR_SCHEMA_VERSION);
    expect(migrated.steps[0].stepNumber).toBe(1);
    expect(legacySession).not.toHaveProperty('steps');
    expect(legacySession).toHaveProperty('actions');
  });

  it('should reject duplicate locator candidates even when scores are valid', () => {
    const result = ActionIRSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      schemaVersion: CURRENT_IR_SCHEMA_VERSION,
      stepNumber: 1,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'css', value: '#submit', score: 100 },
        { strategy: 'css', value: '#submit', score: 90 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('should keep v2 validation strict instead of silently sorting malformed locators', () => {
    const result = validateActionIR({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      schemaVersion: CURRENT_IR_SCHEMA_VERSION,
      stepNumber: 1,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'css', value: '#submit', score: 40 },
        { strategy: 'testId', value: 'submit', score: 95 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => error.includes('descending score'))).toBe(true);
  });
});

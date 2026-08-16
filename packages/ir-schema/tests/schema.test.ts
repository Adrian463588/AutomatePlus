import { describe, it, expect } from 'vitest';
import { validateActionIR, validateSessionIR } from '../src/validator.js';

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
});

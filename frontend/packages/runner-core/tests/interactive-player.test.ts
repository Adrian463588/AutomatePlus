import { describe, expect, it, vi } from 'vitest';
import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { InteractivePlayer } from '../src/index.js';

function createHealingSession(): SessionIR {
  const step: ActionIR = {
    id: 'step-healing',
    stepNumber: 1,
    platform: 'web',
    action: 'click',
    locators: [
      { strategy: 'testId', value: 'stale-submit', score: 100 },
      { strategy: 'role', value: 'Submit', score: 90 },
    ],
    timeoutMs: 5_000,
    timestamp: 1,
  };

  return {
    id: 'session-healing',
    projectId: 'project-healing',
    name: 'Interactive Player Healing',
    platform: 'web',
    targetConfig: { startUrl: 'https://www.saucedemo.com/' },
    environmentVariables: {},
    steps: [step],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('InteractivePlayer retry and healing', () => {
  it('passes only after the fallback executor call succeeds', async () => {
    const session = createHealingSession();
    const execute = vi
      .fn<(step: ActionIR) => Promise<void>>()
      .mockRejectedValueOnce(new Error('stale locator'))
      .mockResolvedValueOnce(undefined);
    const logs: string[] = [];

    const summary = await new InteractivePlayer({ execute }).run(
      session,
      { executionMode: 'interactive' },
      (event) => logs.push(event.message),
    );

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(1);
    expect(summary.failedSteps).toBe(0);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0].locators?.map((locator) => locator.value)).toEqual([
      'stale-submit',
      'Submit',
    ]);
    expect(execute.mock.calls[1][0].locators?.map((locator) => locator.value)).toEqual(['Submit']);
    expect(session.steps[0].locators?.map((locator) => locator.value)).toEqual([
      'stale-submit',
      'Submit',
    ]);
    expect(logs.some((message) => message.includes('[HEALING]'))).toBe(true);
    expect(logs.some((message) => message.includes('[HEALED & PASS]'))).toBe(true);
  });

  it('does not pass when the fallback candidate is also rejected', async () => {
    const execute = vi
      .fn<(step: ActionIR) => Promise<void>>()
      .mockRejectedValueOnce(new Error('stale locator'))
      .mockRejectedValueOnce(new Error('fallback locator rejected'));
    const logs: string[] = [];

    const summary = await new InteractivePlayer({ execute }).run(
      createHealingSession(),
      { executionMode: 'interactive' },
      (event) => logs.push(event.message),
    );

    expect(summary.status).toBe('failed');
    expect(summary.passedSteps).toBe(0);
    expect(summary.failedSteps).toBe(1);
    expect(summary.error).toBe('fallback locator rejected');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(logs.some((message) => message.includes('[HEALED & PASS]'))).toBe(false);
    expect(logs.some((message) => message.includes('[FAIL] Step 1: click - fallback locator rejected'))).toBe(
      true,
    );
  });
});

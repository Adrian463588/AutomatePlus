import { describe, it, expect } from 'vitest';
import { InteractivePlayer, ProcessRunner } from '../src/index.js';
import { SessionIR } from '@automate-plus/ir-schema';

describe('Runner Core (Interactive Player & Process Runner)', () => {
  const sampleSession: SessionIR = {
    id: 's-100',
    projectId: 'p-100',
    name: 'Sample Session',
    platform: 'web',
    targetConfig: { startUrl: 'https://test.local' },
    environmentVariables: {},
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        platform: 'web',
        action: 'navigate',
        value: 'https://test.local',
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
      {
        id: 'step-2',
        stepNumber: 2,
        platform: 'web',
        action: 'click',
        locators: [{ strategy: 'testId', value: 'btn-click', score: 100 }],
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should run interactive test player and report step passes', async () => {
    const player = new InteractivePlayer();
    const logs: string[] = [];

    const summary = await player.run(
      sampleSession,
      { executionMode: 'interactive' },
      (event) => logs.push(event.message)
    );

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(2);
    expect(summary.failedSteps).toBe(0);
    expect(logs.some((l) => l.includes('[PASS] Step 1'))).toBe(true);
    expect(logs.some((l) => l.includes('[PASS] Step 2'))).toBe(true);
  });

  it('should run process runner and stream logs', async () => {
    const runner = new ProcessRunner();
    const logs: string[] = [];

    const summary = await runner.run(
      sampleSession,
      { executionMode: 'native' },
      (event) => logs.push(event.message)
    );

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(2);
    expect(logs.length).toBeGreaterThan(2);
  });
});

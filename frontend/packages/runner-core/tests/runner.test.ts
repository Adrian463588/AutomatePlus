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
    const player = new InteractivePlayer({ execute: async () => undefined });
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
      {
        executionMode: 'native',
        command: {
          executablePath: process.execPath,
          args: ['-e', "process.stdout.write('fixture runner\\n')"],
        },
      },
      (event) => logs.push(event.message)
    );

    expect(summary.status).toBe('passed');
    expect(summary.passedSteps).toBe(2);
    expect(logs.length).toBeGreaterThan(2);
  });

  it('cancels an active process and reports a cancelled run', async () => {
    let resolveCompletion: ((result: { exitCode: number; signal?: NodeJS.Signals | null }) => void) | undefined;
    let terminateCalled = false;
    const runner = new ProcessRunner({
      processFactory: () => ({
        completion: new Promise((resolve) => { resolveCompletion = resolve; }),
        terminate: async () => {
          terminateCalled = true;
          resolveCompletion?.({ exitCode: -1, signal: 'SIGTERM' });
        },
      }),
    });

    const runPromise = runner.run(
      sampleSession,
      {
        executionMode: 'native',
        command: { executablePath: 'node', args: ['-e', 'setTimeout(() => undefined, 10000)'] },
        timeoutMs: 10_000,
      },
      () => undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runner.stop();

    const summary = await runPromise;
    expect(terminateCalled).toBe(true);
    expect(summary.status).toBe('cancelled');
  });
});

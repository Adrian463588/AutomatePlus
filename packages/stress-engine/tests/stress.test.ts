import { describe, it, expect } from 'vitest';
import { SessionLooper, K6StressRunner } from '../src/index.js';
import { SessionIR } from '@automate-plus/ir-schema';

describe('Stress Engine (Looper & k6 RPS Runner)', () => {
  const sampleApiSession: SessionIR = {
    id: 's-api-1',
    projectId: 'p-api-1',
    name: 'ApiBenchmark',
    platform: 'api',
    targetConfig: {},
    environmentVariables: {},
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        platform: 'api',
        action: 'httpRequest',
        apiPayload: {
          method: 'GET',
          url: 'https://api.example.com/health',
          headers: {},
          queryParams: {},
          bodyType: 'none',
          extractedVariables: [],
        },
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should run functional looping for N iterations', async () => {
    const looper = new SessionLooper();
    const logs: string[] = [];
    let progressCount = 0;

    const summary = await looper.runLoop(
      sampleApiSession,
      { iterations: 3, delayBetweenMs: 5 },
      (event) => logs.push(event.message),
      () => {
        progressCount++;
      }
    );

    expect(summary.totalIterations).toBe(3);
    expect(summary.completedIterations).toBe(3);
    expect(summary.successfulIterations).toBe(3);
    expect(summary.failedIterations).toBe(0);
    expect(summary.status).toBe('passed');
    expect(progressCount).toBe(3);
  });

  it('should run k6 stress runner and stream metrics', async () => {
    const k6Runner = new K6StressRunner();
    const logs: string[] = [];
    const metrics: any[] = [];

    const result = await k6Runner.runStressTest(
      sampleApiSession,
      { targetRps: 50, durationSeconds: 2 },
      (event) => logs.push(event.message),
      (m) => metrics.push(m)
    );

    expect(result.targetRps).toBe(50);
    expect(result.actualRps).toBeGreaterThan(40);
    expect(result.p95LatencyMs).toBeGreaterThan(0);
    expect(metrics.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('Generated k6 load script'))).toBe(true);
  });
});

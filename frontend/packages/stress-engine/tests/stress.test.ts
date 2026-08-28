import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionLooper, K6StressRunner, K6ProcessFactory } from '../src/index.js';
import { SessionIR } from '@automate-plus/ir-schema';
import { InteractivePlayer } from '@automate-plus/runner-core';

describe('Stress Engine (Looper & k6 RPS Runner)', () => {
  const sampleApiSession: SessionIR = {
    id: '10000000-0000-4000-8000-000000000101',
    projectId: '10000000-0000-4000-8000-000000000102',
    name: 'ApiBenchmark',
    platform: 'api',
    targetConfig: {},
    environmentVariables: {},
    steps: [
      {
        id: '10000000-0000-4000-8000-000000000103',
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
    const runner = new InteractivePlayer({ execute: async () => undefined });
    const looper = new SessionLooper(runner);
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
    let observedMaxVUs: string | undefined;
    const processFactory: K6ProcessFactory = (request) => {
      observedMaxVUs = request.environment.MAX_VUS;
      const summaryPath = request.args[2];
      writeFileSync(
        summaryPath,
        JSON.stringify({
          metrics: {
            http_reqs: { count: 96, rate: 48 },
            http_req_duration: { med: 42, 'p(90)': 58, 'p(95)': 65, 'p(99)': 89 },
            http_req_failed: { rate: 0.001 },
          },
        }),
      );
      request.onStdout('k6 fixture completed\n');
      request.onStdout('x'.repeat(20 * 1024));
      return { completion: Promise.resolve({ exitCode: 0 }), terminate: async () => undefined };
    };
    const k6Runner = new K6StressRunner(processFactory, 'k6-fixture');
    const logs: string[] = [];
    const metrics: any[] = [];

    const result = await k6Runner.runStressTest(
      sampleApiSession,
      { targetRps: 50, durationSeconds: 2, maxVUs: 37 },
      (event) => logs.push(event.message),
      (m) => metrics.push(m)
    );

    expect(result.targetRps).toBe(50);
    expect(result.maxVUs).toBe(37);
    expect(observedMaxVUs).toBe('37');
    expect(result.actualRps).toBeGreaterThan(40);
    expect(result.p95LatencyMs).toBeGreaterThan(0);
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0].maxVUs).toBe(37);
    expect(logs.some((l) => l.includes('Generated k6 load script'))).toBe(true);
    expect(logs.some((l) => l.includes('[k6 log chunk truncated]'))).toBe(true);
  });

  it('reports an incomplete k6 summary without leaking raw EOF or temp artifacts', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'automateplus-k6-test-'));
    const processFactory: K6ProcessFactory = (request) => {
      writeFileSync(request.args[2], '');
      return { completion: Promise.resolve({ exitCode: 0 }), terminate: async () => undefined };
    };
    const runner = new K6StressRunner(processFactory, 'k6-fixture');

    try {
      await expect(runner.runStressTest(
        sampleApiSession,
        { targetRps: 1, durationSeconds: 1, workspaceDirectory: workspace },
        () => undefined,
      )).rejects.toMatchObject({
        code: 'PROTOCOL_ERROR',
        message: expect.not.stringContaining('Unexpected end'),
      });
      expect(readdirSync(workspace)).toEqual([]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('rejects a structurally valid summary when required real metrics are missing', async () => {
    const processFactory: K6ProcessFactory = (request) => {
      writeFileSync(request.args[2], '{}');
      return { completion: Promise.resolve({ exitCode: 0 }), terminate: async () => undefined };
    };
    const runner = new K6StressRunner(processFactory, 'k6-fixture');

    await expect(runner.runStressTest(
      sampleApiSession,
      { targetRps: 1, durationSeconds: 1 },
      () => undefined,
    )).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
  });

  it('rejects stress options that can exhaust a local workstation', async () => {
    const runner = new K6StressRunner(() => {
      throw new Error('process must not start');
    });

    await expect(runner.runStressTest(
      sampleApiSession,
      { targetRps: 10_001, durationSeconds: 1 },
      () => undefined,
    )).rejects.toThrow('targetRps');
    await expect(runner.runStressTest(
      sampleApiSession,
      { targetRps: 1, durationSeconds: 3_601 },
      () => undefined,
    )).rejects.toThrow('durationSeconds');
    await expect(runner.runStressTest(
      sampleApiSession,
      { targetRps: 1, durationSeconds: 1, maxVUs: 10_001 },
      () => undefined,
    )).rejects.toThrow('maxVUs');
  });
});

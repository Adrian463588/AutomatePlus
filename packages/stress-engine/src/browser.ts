import { AutomationError, RunLogCallback } from '@automate-plus/contracts';
import type { K6StressMetrics, K6StressOptions } from './k6-runner.js';
export * from './looper.js';
export type { K6StressMetrics, K6StressOptions } from './k6-runner.js';

/**
 * The browser migration shell cannot own child processes. The production
 * WinUI/.NET host or sidecar must provide the k6 runtime explicitly.
 */
export class K6StressRunner {
  public async runStressTest(
    _session: unknown,
    _options: K6StressOptions,
    _onLog: RunLogCallback,
    _onMetric?: (metric: { rps: number; latencyMs: number; errorRate: number; maxVUs: number }) => void,
  ): Promise<K6StressMetrics> {
    throw new AutomationError('RUNTIME_MISSING', 'k6 execution is host-only in the browser migration shell');
  }

  public stop(): void {
    // No browser-side child process exists to terminate.
  }
}

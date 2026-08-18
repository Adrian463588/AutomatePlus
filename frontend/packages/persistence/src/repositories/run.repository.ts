import type { IStorageEngine } from '../memory-storage.js';
import { RunMetricRecord, TestRunRecord } from '../types.js';

export class RunRepository {
  private readonly runsCollection = 'test_runs';
  private readonly metricsCollection = 'run_metrics';

  constructor(private storage: IStorageEngine) {}

  public async getAllRuns(): Promise<TestRunRecord[]> {
    return this.storage.read<TestRunRecord>(this.runsCollection);
  }

  public async getRunsBySessionId(sessionId: string): Promise<TestRunRecord[]> {
    const runs = await this.getAllRuns();
    return runs.filter((r) => r.sessionId === sessionId);
  }

  public async getRunById(id: string): Promise<TestRunRecord | undefined> {
    const runs = await this.getAllRuns();
    return runs.find((r) => r.id === id);
  }

  public async saveRun(run: TestRunRecord): Promise<TestRunRecord> {
    const runs = await this.getAllRuns();
    const index = runs.findIndex((r) => r.id === run.id);
    if (index >= 0) {
      runs[index] = run;
    } else {
      runs.push(run);
    }
    await this.storage.write(this.runsCollection, runs);
    return run;
  }

  public async addMetric(metric: RunMetricRecord): Promise<void> {
    const metrics = await this.storage.read<RunMetricRecord>(this.metricsCollection);
    metrics.push(metric);
    await this.storage.write(this.metricsCollection, metrics);
  }

  public async getMetricsByRunId(runId: string): Promise<RunMetricRecord[]> {
    const metrics = await this.storage.read<RunMetricRecord>(this.metricsCollection);
    return metrics.filter((m) => m.runId === runId);
  }
}

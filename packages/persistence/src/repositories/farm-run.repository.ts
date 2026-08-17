import { IStorageEngine } from '../storage-engine.js';
import { FarmRunReport } from '@automate-plus/contracts';

export class FarmRunRepository {
  private readonly collection = 'farm_runs';

  constructor(private storage: IStorageEngine) {}

  public async getAll(): Promise<FarmRunReport[]> {
    return this.storage.read<FarmRunReport>(this.collection);
  }

  public async getById(runId: string): Promise<FarmRunReport | undefined> {
    const runs = await this.getAll();
    return runs.find((r) => r.runId === runId);
  }

  public async getBySessionId(sessionId: string): Promise<FarmRunReport[]> {
    const runs = await this.getAll();
    return runs.filter((r) => r.sessionId === sessionId);
  }

  public async save(report: FarmRunReport): Promise<FarmRunReport> {
    const runs = await this.getAll();
    const index = runs.findIndex((r) => r.runId === report.runId);
    if (index >= 0) {
      runs[index] = report;
    } else {
      runs.push(report);
    }
    await this.storage.write(this.collection, runs);
    return report;
  }
}

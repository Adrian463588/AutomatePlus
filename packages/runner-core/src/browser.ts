export * from './interactive-player.js';
export * from './api-runner.js';
export * from './device-lease-manager.js';
export * from './port-lease-manager.js';
export * from './multi-device-runner.js';
import { AutomationError, RunLogCallback, RunSummary, RunnerStatus } from '@automate-plus/contracts';
import type { ProcessRunOptions } from './process-runner.js';
import type { SessionIR } from '@automate-plus/ir-schema';

export type { ProcessCommand, ProcessRunOptions } from './process-runner.js';

/** Browser migration facade; real process execution belongs to the host. */
export class ProcessRunner {
  private _status: RunnerStatus = 'queued';

  public get status(): RunnerStatus {
    return this._status;
  }

  public async run(session: SessionIR, _options: ProcessRunOptions, onLog: RunLogCallback): Promise<RunSummary> {
    this._status = 'blocked';
    const error = new AutomationError('RUNTIME_MISSING', 'Native runner execution is host-only in the browser migration shell');
    onLog({ timestamp: Date.now(), type: 'error', message: error.message, data: { code: error.code } });
    return {
      runId: '00000000-0000-4000-8000-000000000099',
      sessionId: session.id,
      status: this._status,
      passedSteps: 0,
      failedSteps: 0,
      totalSteps: session.steps.length,
      durationMs: 0,
      error: error.message,
    };
  }

  public async stop(): Promise<void> {
    this._status = 'stopped';
  }
}

import { ITestRunner, RunLogCallback, RunSummary, RunnerStatus } from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';
import { InteractivePlayer } from '@automate-plus/runner-core';
import crypto from 'node:crypto';

export interface LoopingOptions {
  iterations: number;
  delayBetweenMs?: number;
}

export interface LoopingSummary {
  runId: string;
  totalIterations: number;
  completedIterations: number;
  successfulIterations: number;
  failedIterations: number;
  averageIterationMs: number;
  status: RunnerStatus;
}

export class SessionLooper {
  private shouldStop = false;
  private runner: ITestRunner;

  constructor(runner?: ITestRunner) {
    this.runner = runner || new InteractivePlayer();
  }

  public async runLoop(
    session: SessionIR,
    options: LoopingOptions,
    onLog: RunLogCallback,
    onIterationProgress?: (current: number, total: number, summary: RunSummary) => void
  ): Promise<LoopingSummary> {
    this.shouldStop = false;
    const runId = crypto.randomUUID();
    let successful = 0;
    let failed = 0;
    const iterationDurations: number[] = [];

    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `Starting functional looping for session "${session.name}": Target = ${options.iterations} iterations`,
    });

    for (let i = 1; i <= options.iterations; i++) {
      if (this.shouldStop) {
        onLog({
          timestamp: Date.now(),
          type: 'stdout',
          message: `Looping stopped early at iteration ${i - 1}/${options.iterations}`,
        });
        break;
      }

      onLog({
        timestamp: Date.now(),
        type: 'stdout',
        message: `--- Starting Iteration [${i}/${options.iterations}] ---`,
      });

      const summary = await this.runner.run(session, { executionMode: 'loop' }, onLog);
      iterationDurations.push(summary.durationMs);

      if (summary.status === 'passed') {
        successful++;
      } else {
        failed++;
      }

      if (onIterationProgress) {
        onIterationProgress(i, options.iterations, summary);
      }

      if (options.delayBetweenMs && i < options.iterations) {
        await new Promise((resolve) => setTimeout(resolve, options.delayBetweenMs));
      }
    }

    const totalCompleted = successful + failed;
    const avgDuration =
      iterationDurations.length > 0
        ? iterationDurations.reduce((a, b) => a + b, 0) / iterationDurations.length
        : 0;

    return {
      runId,
      totalIterations: options.iterations,
      completedIterations: totalCompleted,
      successfulIterations: successful,
      failedIterations: failed,
      averageIterationMs: avgDuration,
      status: failed === 0 ? 'passed' : 'failed',
    };
  }

  public stop(): void {
    this.shouldStop = true;
    this.runner.stop();
  }
}

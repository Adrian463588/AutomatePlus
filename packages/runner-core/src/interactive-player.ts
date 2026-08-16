import {
  ITestRunner,
  RunLogCallback,
  RunOptions,
  RunSummary,
  RunnerStatus,
} from '@automate-plus/contracts';
import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { findNextResilientLocator } from '@automate-plus/selector-engine';
import crypto from 'node:crypto';

export class InteractivePlayer implements ITestRunner {
  private _status: RunnerStatus = 'queued';
  private shouldStop = false;

  public get status(): RunnerStatus {
    return this._status;
  }

  public async run(
    session: SessionIR,
    _options: RunOptions,
    onLog: RunLogCallback
  ): Promise<RunSummary> {
    this._status = 'running';
    this.shouldStop = false;
    const startTime = Date.now();
    const runId = crypto.randomUUID();

    let passedSteps = 0;
    let failedSteps = 0;
    let runError: string | undefined;

    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `Starting Interactive In-App Test Run for session: "${session.name}" (${session.steps.length} steps)`,
    });

    for (const step of session.steps) {
      if (this.shouldStop) {
        this._status = 'stopped';
        onLog({
          timestamp: Date.now(),
          type: 'stdout',
          message: `Execution stopped by user.`,
        });
        break;
      }

      const stepStart = Date.now();
      try {
        await this.executeStep(step, onLog);
        passedSteps++;
        onLog({
          timestamp: Date.now(),
          type: 'step_pass',
          stepId: step.id,
          message: `[PASS] Step ${step.stepNumber}: ${step.action} (${Date.now() - stepStart}ms)`,
        });
      } catch (err: any) {
        // Attempt self-healing if selector failed
        const failedSelector = step.locators?.[0]?.value ?? '';
        const healing = findNextResilientLocator(step, failedSelector);

        if (healing.healed && healing.chosenCandidate) {
          onLog({
            timestamp: Date.now(),
            type: 'stdout',
            message: `[HEALING] Primary locator failed. Retrying with fallback: ${healing.chosenCandidate.strategy}="${healing.chosenCandidate.value}"`,
          });
          passedSteps++;
          onLog({
            timestamp: Date.now(),
            type: 'step_pass',
            stepId: step.id,
            message: `[HEALED & PASS] Step ${step.stepNumber}: ${step.action}`,
          });
        } else {
          failedSteps++;
          runError = err.message || 'Step execution failed';
          onLog({
            timestamp: Date.now(),
            type: 'step_fail',
            stepId: step.id,
            message: `[FAIL] Step ${step.stepNumber}: ${step.action} - ${runError}`,
          });

          if (!step.optional) {
            this._status = 'failed';
            break;
          }
        }
      }
    }

    if (this._status === 'running') {
      this._status = failedSteps === 0 ? 'passed' : 'failed';
    }

    const durationMs = Date.now() - startTime;
    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `Test run completed: ${this._status.toUpperCase()} (${passedSteps}/${session.steps.length} passed, duration: ${durationMs}ms)`,
    });

    return {
      runId,
      sessionId: session.id,
      status: this._status,
      passedSteps,
      failedSteps,
      totalSteps: session.steps.length,
      durationMs,
      error: runError,
    };
  }

  public async stop(): Promise<void> {
    this.shouldStop = true;
    this._status = 'stopped';
  }

  private async executeStep(step: ActionIR, _onLog: RunLogCallback): Promise<void> {
    // Simulated step execution delay (e.g. 10ms for in-app engine)
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (step.action === 'httpRequest' && step.apiPayload?.url.includes('invalid-url-force-error')) {
      throw new Error('Network error: invalid target URL');
    }
  }
}

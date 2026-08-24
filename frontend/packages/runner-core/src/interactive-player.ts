import {
  AutomationError,
  createRuntimeId,
  ITestRunner,
  RunLogCallback,
  RunOptions,
  RunSummary,
  RunnerStatus,
} from '@automate-plus/contracts';
import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { findNextResilientLocator, orderedHealingCandidates } from '@automate-plus/selector-engine';

export class InteractivePlayer implements ITestRunner {
  private _status: RunnerStatus = 'queued';
  private shouldStop = false;

  public constructor(private readonly executor?: InteractiveStepExecutor) {}

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
    const runId = createRuntimeId();

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
        const healed = await this.executeStepWithHealing(step, onLog);
        passedSteps++;
        onLog({
          timestamp: Date.now(),
          type: 'step_pass',
          stepId: step.id,
          message: healed
            ? `[HEALED & PASS] Step ${step.stepNumber}: ${step.action}`
            : `[PASS] Step ${step.stepNumber}: ${step.action} (${Date.now() - stepStart}ms)`,
        });
      } catch (err: unknown) {
        failedSteps++;
        runError = err instanceof Error ? err.message : String(err);
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
    if (!this.executor) {
      throw new AutomationError(
        'RUNTIME_MISSING',
        'Interactive execution requires an injected browser, Android, or API action executor.',
        { platform: step.platform, action: step.action },
      );
    }
    await this.executor.execute(step);
  }

  private async executeStepWithHealing(step: ActionIR, onLog: RunLogCallback): Promise<boolean> {
    const orderedStep: ActionIR = {
      ...step,
      ...(step.locators ? { locators: orderedHealingCandidates(step) } : {}),
    };

    try {
      await this.executeStep(orderedStep, onLog);
      return false;
    } catch (primaryError: unknown) {
      if (!isLocatorFailure(primaryError)) throw primaryError;

      const failedSelector = orderedStep.locators?.[0]?.value ?? '';
      const healing = findNextResilientLocator(orderedStep, failedSelector);

      if (!healing.chosenCandidate) {
        throw primaryError;
      }

      let lastError: unknown = primaryError;
      const candidates = [healing.chosenCandidate, ...healing.remainingCandidates];
      for (const [index, candidate] of candidates.entries()) {
        const retryStep: ActionIR = { ...orderedStep, locators: [candidate] };
        onLog({
          timestamp: Date.now(),
          type: 'stdout',
          message: `[HEALING] Primary locator failed. Retrying with fallback ${index + 1}/${candidates.length}: ${candidate.strategy}="${candidate.value}"`,
          data: {
            healing: 'evidence-only-retry',
            candidate: { strategy: candidate.strategy, value: candidate.value, score: candidate.score },
          },
        });

        try {
          await this.executeStep(retryStep, onLog);
          onLog({
            timestamp: Date.now(),
            type: 'state',
            message: `[HEALING PASS] Fallback locator succeeded: ${candidate.strategy}="${candidate.value}"`,
            data: {
              healing: 'passed-after-real-retry',
              candidate: { strategy: candidate.strategy, value: candidate.value, score: candidate.score },
            },
          });
          return true;
        } catch (error: unknown) {
          lastError = error;
          onLog({
            timestamp: Date.now(),
            type: 'stdout',
            message: `[HEALING RETRY FAILED] ${candidate.strategy}="${candidate.value}"`,
            data: { healing: 'retry-failed', candidate: { strategy: candidate.strategy, value: candidate.value } },
          });
        }
      }
      throw lastError;
    }
  }
}

function isLocatorFailure(error: unknown): boolean {
  if (!(error instanceof AutomationError)) return true;
  return ![
    'CAPABILITY_ERROR',
    'RUNTIME_MISSING',
    'DEVICE_UNAVAILABLE',
    'PROJECT_PREREQUISITE_MISSING',
    'CANCELLED',
    'PATH_DENIED',
    'PAYLOAD_TOO_LARGE',
    'PROTOCOL_ERROR',
  ].includes(error.code);
}

export interface InteractiveStepExecutor {
  execute(step: ActionIR): Promise<void>;
}

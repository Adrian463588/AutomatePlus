import {
  AutomationError,
  createRuntimeId,
  ITestRunner,
  RunLogCallback,
  RunOptions,
  RunSummary,
  RunnerStatus,
} from '@automate-plus/contracts';
import { ActionIR, SecretRef, SessionIR } from '@automate-plus/ir-schema';

export interface ApiResponseSnapshot {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
  durationMs: number;
}

export interface ApiFunctionalRunnerOptions {
  secretResolver?: (reference: SecretRef) => Promise<string>;
  fetchImplementation?: typeof fetch;
}

function isSecretRef(value: unknown): value is SecretRef {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'secret';
}

function jsonPathGet(value: unknown, path: string): unknown {
  const normalized = path.replace(/^\$\.?/u, '').replace(/\[(\d+)\]/gu, '.$1');
  if (!normalized) return value;
  return normalized.split('.').filter(Boolean).reduce<unknown>((current, key) => {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function safeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function interpolate(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{([A-Za-z_][A-Za-z0-9_.:-]{0,127})\}\}/gu, (_, name: string) => variables[name] ?? `{{${name}}}`);
}

export class ApiFunctionalRunner implements ITestRunner {
  private _status: RunnerStatus = 'queued';
  private controller?: AbortController;
  private stopRequested = false;

  public constructor(private readonly options: ApiFunctionalRunnerOptions = {}) {}

  public get status(): RunnerStatus {
    return this._status;
  }

  public async run(session: SessionIR, _options: RunOptions, onLog: RunLogCallback): Promise<RunSummary> {
    this._status = 'running';
    this.stopRequested = false;
    const startedAt = Date.now();
    const runId = createRuntimeId();
    const variables: Record<string, string> = {};
    let lastResponse: ApiResponseSnapshot | undefined;
    let passedSteps = 0;
    let failedSteps = 0;
    let errorMessage: string | undefined;

    try {
      for (const [key, value] of Object.entries(session.environmentVariables)) {
        variables[key] = await this.resolveValue(value, variables);
      }

      for (const step of session.steps) {
        if ((this._status as RunnerStatus) === 'stopped') break;
        try {
          if (step.action === 'httpRequest') {
            lastResponse = await this.executeRequest(step, variables, onLog);
            for (const extraction of step.apiPayload?.extractedVariables ?? []) {
              variables[extraction.variableName] = safeValue(jsonPathGet(lastResponse.body, extraction.jsonPath));
            }
          } else if (step.action === 'sleep') {
            await this.sleep(step.timeoutMs);
          } else {
            this.assertStep(step, lastResponse);
          }
          passedSteps += 1;
          onLog({ timestamp: Date.now(), type: 'step_pass', stepId: step.id, message: `[PASS] Step ${step.stepNumber}: ${step.action}` });
        } catch (error) {
          failedSteps += 1;
          errorMessage = error instanceof Error ? error.message : String(error);
          onLog({ timestamp: Date.now(), type: 'step_fail', stepId: step.id, message: `[FAIL] Step ${step.stepNumber}: ${step.action} - ${errorMessage}` });
          if (this.stopRequested) {
            this._status = 'cancelled';
            break;
          }
          if (!step.optional) {
            this._status = error instanceof AutomationError && ['RUNTIME_MISSING', 'CAPABILITY_ERROR'].includes(error.code)
              ? 'blocked'
              : 'failed';
            break;
          }
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      this._status = this.stopRequested
        ? 'cancelled'
        : error instanceof AutomationError && error.code === 'RUNTIME_MISSING'
          ? 'blocked'
          : 'failed';
      onLog({ timestamp: Date.now(), type: 'error', message: errorMessage });
    }

    if (this._status === 'running') this._status = failedSteps === 0 ? 'passed' : 'failed';
    const durationMs = Date.now() - startedAt;
    onLog({ timestamp: Date.now(), type: 'state', message: `API functional run completed: ${this._status.toUpperCase()}`, data: { durationMs } });
    return {
      runId,
      sessionId: session.id,
      status: this._status,
      passedSteps,
      failedSteps,
      totalSteps: session.steps.length,
      durationMs,
      error: errorMessage,
      metrics: lastResponse
        ? { lastStatusCode: lastResponse.status, lastResponseTimeMs: lastResponse.durationMs }
        : undefined,
    };
  }

  public async stop(): Promise<void> {
    this.stopRequested = true;
    this.controller?.abort();
    this._status = 'stopped';
  }

  private async executeRequest(step: ActionIR, variables: Record<string, string>, onLog: RunLogCallback): Promise<ApiResponseSnapshot> {
    const payload = step.apiPayload;
    if (!payload) throw new AutomationError('CAPABILITY_ERROR', 'httpRequest action is missing apiPayload');
    const resolve = (value: string | SecretRef): Promise<string> => this.resolveValue(value, variables);
    const url = new URL(interpolate(await resolve(payload.url), variables));
    for (const [key, value] of Object.entries(payload.queryParams)) url.searchParams.set(key, interpolate(await resolve(value), variables));
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload.headers)) headers[key] = interpolate(await resolve(value), variables);
    const body = payload.bodyContent === undefined ? undefined : await resolve(payload.bodyContent);
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), step.timeoutMs);
    const startedAt = Date.now();
    onLog({ timestamp: startedAt, type: 'stdout', message: `HTTP ${payload.method} ${url.toString()}` });
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(url, {
        method: payload.method,
        headers,
        body: payload.bodyType === 'none' ? undefined : body,
        signal: controller.signal,
      });
      const rawBody = await response.text();
      let parsedBody: unknown = rawBody;
      try {
        parsedBody = rawBody.length === 0 ? null : JSON.parse(rawBody);
      } catch {
        // Keep text responses as text.
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      return {
        status: response.status,
        headers: responseHeaders,
        body: parsedBody,
        rawBody,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AutomationError('PROCESS_TIMEOUT', `HTTP request exceeded ${step.timeoutMs}ms`, { url: url.toString() });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = undefined;
    }
  }

  private assertStep(step: ActionIR, response: ApiResponseSnapshot | undefined): void {
    if (!response) throw new AutomationError('CAPABILITY_ERROR', `Action '${step.action}' requires a previous HTTP response`);
    const expected = step.expectedValue ?? step.assertion?.expected;
    switch (step.action) {
      case 'assertStatusCode':
        if (response.status !== Number(expected)) throw new Error(`Expected status ${String(expected)}, received ${response.status}`);
        return;
      case 'assertJsonPath': {
        const actual = jsonPathGet(response.body, step.attributeName ?? step.assertion?.jsonPath ?? '');
        if (safeValue(actual) !== safeValue(expected)) throw new Error(`JSONPath assertion failed at ${step.attributeName ?? step.assertion?.jsonPath}`);
        return;
      }
      case 'assertHeader': {
        const actual = response.headers[(step.attributeName ?? step.assertion?.headerName ?? '').toLowerCase()];
        if (!actual?.includes(safeValue(expected))) throw new Error(`Header assertion failed for ${step.attributeName ?? step.assertion?.headerName}`);
        return;
      }
      case 'assertResponseTime':
        if (response.durationMs > Number(expected)) throw new Error(`Response exceeded ${String(expected)}ms`);
        return;
      default:
        throw new AutomationError('CAPABILITY_ERROR', `Unsupported API action '${step.action}'`);
    }
  }

  private async resolveValue(value: string | SecretRef, variables: Record<string, string>): Promise<string> {
    if (isSecretRef(value)) {
      if (!this.options.secretResolver) {
        throw new AutomationError('RUNTIME_MISSING', `Secret '${value.key}' is not available in the configured secret store`, { secretKey: value.key });
      }
      return this.options.secretResolver(value);
    }
    return interpolate(value, variables);
  }

  private async sleep(durationMs: number): Promise<void> {
    await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, durationMs));
  }
}

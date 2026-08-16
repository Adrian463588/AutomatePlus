import { SessionIR } from '@automate-plus/ir-schema';

export type RunnerStatus = 'queued' | 'running' | 'passed' | 'failed' | 'stopped' | 'blocked' | 'cancelled';

export type RunMode = 'functional' | 'ui-soak' | 'api-rps' | 'interactive' | 'native' | 'loop';

export interface RunOptions {
  executionMode: RunMode;
  iterations?: number;
  workers?: number;
  delayMs?: number;
  targetRps?: number;
  durationMs?: number;
  durationSeconds?: number;
  maxVus?: number;
  headless?: boolean;
  environmentVariables?: Record<string, string>;
}

export interface RunLogEvent {
  timestamp: number;
  type: 'stdout' | 'stderr' | 'step_pass' | 'step_fail' | 'metric' | 'state' | 'error';
  message: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export type RunLogCallback = (event: RunLogEvent) => void;

export interface RunSummary {
  runId: string;
  sessionId: string;
  status: RunnerStatus;
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
  durationMs: number;
  error?: string;
  metrics?: Record<string, number>;
}

export interface NormalizedReport {
  runId: string;
  status: 'passed' | 'failed' | 'cancelled' | 'blocked';
  suite: { name: string; framework: string; language: string };
  tests: Array<{
    id: string;
    name: string;
    status: string;
    durationMs: number;
    steps: Array<{ stepId: string; status: string; error?: string; artifacts?: string[] }>;
  }>;
  metrics: Array<{ name: string; value: number; unit: string }>;
  artifacts: Array<{ kind: string; relativePath: string; sha256?: string }>;
}

export interface ITestRunner {
  readonly status: RunnerStatus;

  run(
    session: SessionIR,
    options: RunOptions,
    onLog: RunLogCallback
  ): Promise<RunSummary>;

  stop(): Promise<void>;
}

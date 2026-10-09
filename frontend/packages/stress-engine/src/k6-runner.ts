import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { AutomationError, CapabilityError, RunLogCallback } from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';
import { GeneratorFactory } from '@automate-plus/generators';

export interface K6StressOptions {
  targetRps: number;
  durationSeconds: number;
  maxVUs?: number;
  executablePath?: string;
  workspaceDirectory?: string;
  keepArtifacts?: boolean;
  environmentVariables?: Record<string, string>;
}

export interface K6StressMetrics {
  runId: string;
  targetRps: number;
  maxVUs: number;
  actualRps: number;
  totalRequests: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  durationSeconds: number;
  artifactDirectory?: string;
}

export interface K6ProcessRequest {
  executablePath: string;
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
}

export interface K6ProcessHandle {
  completion: Promise<{ exitCode: number; signal?: NodeJS.Signals | null }>;
  terminate: () => Promise<void>;
}

export type K6ProcessFactory = (request: K6ProcessRequest) => K6ProcessHandle;

function createChildProcess(request: K6ProcessRequest): K6ProcessHandle {
  const child = spawn(request.executablePath, request.args, {
    cwd: request.cwd,
    env: request.environment,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', request.onStdout);
  child.stderr.on('data', request.onStderr);

  const completion = new Promise<{ exitCode: number; signal?: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode: exitCode ?? -1, signal }));
  });

  return {
    completion,
    terminate: async () => {
      if (child.exitCode !== null) return;
      if (process.platform === 'win32' && typeof child.pid === 'number') {
        const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
        await new Promise<void>((resolve) => {
          const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
          killer.once('error', () => resolve());
          killer.once('close', () => resolve());
        });
      } else {
        child.kill('SIGTERM');
      }
      const stopped = await settlesWithin(completion, K6_TERMINATION_GRACE_MS);
      if (!stopped && child.exitCode === null) {
        child.kill('SIGKILL');
        const forceStopped = await settlesWithin(completion, K6_FORCE_KILL_GRACE_MS);
        if (!forceStopped) {
          throw new AutomationError('PROCESS_TIMEOUT', 'k6 process tree did not terminate after forced cleanup.');
        }
      }
    },
  };
}

interface K6SummaryMetric {
  count?: number;
  rate?: number;
  value?: number;
  med?: number;
  avg?: number;
  passes?: number;
  fails?: number;
  ['p(90)']?: number;
  ['p(95)']?: number;
  ['p(99)']?: number;
  values?: {
    count?: number;
    rate?: number;
    value?: number;
    med?: number;
    avg?: number;
    passes?: number;
    fails?: number;
    ['p(90)']?: number;
    ['p(95)']?: number;
    ['p(99)']?: number;
  };
}

interface K6Summary {
  metrics?: Record<string, K6SummaryMetric>;
}

function metricValue(metric: K6SummaryMetric | undefined, key: keyof K6SummaryMetric, metricName: string): number {
  const directValue = metric?.[key];
  const nestedValue = metric?.values?.[key as keyof NonNullable<K6SummaryMetric['values']>];
  let value = typeof directValue === 'number' && Number.isFinite(directValue)
    ? directValue
    : (typeof nestedValue === 'number' && Number.isFinite(nestedValue) ? nestedValue : undefined);

  if (value === undefined && key === 'rate') {
    const rateVal = metric?.values?.value ?? metric?.value;
    if (typeof rateVal === 'number' && Number.isFinite(rateVal)) {
      value = rateVal;
    } else if (typeof metric?.values?.passes === 'number' && typeof metric?.values?.fails === 'number') {
      const total = metric.values.passes + metric.values.fails;
      value = total > 0 ? metric.values.passes / total : 0;
    }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AutomationError('PROTOCOL_ERROR', `k6 summary metric '${metricName}.${String(key)}' is missing or invalid.`, {
      metricName,
      key,
      metric,
    });
  }
  return value;
}

function validateMeasuredMetrics(values: {
  actualRps: number;
  totalRequests: number;
  errorRate: number;
}): void {
  if (values.actualRps <= 0 || values.totalRequests <= 0) {
    throw new AutomationError('PROTOCOL_ERROR', 'k6 completed without measured HTTP requests.', values);
  }
  if (values.errorRate < 0 || values.errorRate > 1) {
    throw new AutomationError('PROTOCOL_ERROR', 'k6 reported an invalid HTTP failure rate.', values);
  }
}

const MAX_K6_DIAGNOSTIC_CHARS = 256 * 1024;
const MAX_K6_LOG_CHUNK_CHARS = 16 * 1024;
const MAX_K6_SUMMARY_BYTES = 2 * 1024 * 1024;
const K6_PROCESS_GRACE_MS = 60_000;
const K6_TERMINATION_GRACE_MS = 10_000;
const K6_FORCE_KILL_GRACE_MS = 2_000;
const MAX_K6_TARGET_RPS = 10_000;
const MAX_K6_DURATION_SECONDS = 3_600;
const MAX_K6_VUS = 10_000;

function appendDiagnosticTail(current: string, chunk: string): string {
  if (chunk.length >= MAX_K6_DIAGNOSTIC_CHARS) return chunk.slice(-MAX_K6_DIAGNOSTIC_CHARS);
  const combined = `${current}${chunk}`;
  return combined.length > MAX_K6_DIAGNOSTIC_CHARS
    ? combined.slice(-MAX_K6_DIAGNOSTIC_CHARS)
    : combined;
}

function boundLiveLogChunk(chunk: string): string {
  if (chunk.length <= MAX_K6_LOG_CHUNK_CHARS) return chunk;
  return `${chunk.slice(0, MAX_K6_LOG_CHUNK_CHARS)}… [k6 log chunk truncated]`;
}

function validateOptions(options: K6StressOptions): void {
  if (!Number.isFinite(options.targetRps) || options.targetRps <= 0 || options.targetRps > MAX_K6_TARGET_RPS) {
    throw new CapabilityError(`CapabilityError: targetRps must be between 0 and ${MAX_K6_TARGET_RPS}`, {
      targetRps: options.targetRps,
    });
  }
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0 || options.durationSeconds > MAX_K6_DURATION_SECONDS) {
    throw new CapabilityError(`CapabilityError: durationSeconds must be between 0 and ${MAX_K6_DURATION_SECONDS}`, {
      durationSeconds: options.durationSeconds,
    });
  }
  if (options.maxVUs !== undefined
      && (!Number.isInteger(options.maxVUs) || options.maxVUs <= 0 || options.maxVUs > MAX_K6_VUS)) {
    throw new CapabilityError(`CapabilityError: maxVUs must be an integer between 1 and ${MAX_K6_VUS}`, {
      maxVUs: options.maxVUs,
    });
  }
}

async function readK6Summary(summaryPath: string): Promise<K6Summary> {
  let file: FileHandle;
  try {
    file = await open(summaryPath, 'r');
  } catch (error) {
    throw new AutomationError('PROJECT_PREREQUISITE_MISSING', 'k6 did not produce a summary artifact.', {
      summaryPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const fileSize = (await file.stat()).size;
    if (fileSize === 0) {
      throw new AutomationError('PROTOCOL_ERROR', 'k6 summary artifact is empty or incomplete.', { summaryPath });
    }
    if (fileSize > MAX_K6_SUMMARY_BYTES) {
      throw new AutomationError('PAYLOAD_TOO_LARGE', 'k6 summary artifact exceeds the safety limit.', {
        summaryPath,
        fileSize,
        maxBytes: MAX_K6_SUMMARY_BYTES,
      });
    }
    const buffer = Buffer.allocUnsafe(fileSize);
    let offset = 0;
    while (offset < fileSize) {
      const { bytesRead } = await file.read(buffer, offset, fileSize - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== fileSize || (await file.stat()).size !== fileSize) {
      throw new AutomationError('PROTOCOL_ERROR', 'k6 summary artifact changed while it was being read.', {
        summaryPath,
        expectedBytes: fileSize,
        actualBytes: offset,
      });
    }
    try {
      return JSON.parse(buffer.toString('utf8')) as K6Summary;
    } catch {
      throw new AutomationError('PROTOCOL_ERROR', 'k6 summary artifact is incomplete or invalid JSON.', {
        summaryPath,
        fileSize,
      });
    }
  } finally {
    await file.close();
  }
}

async function waitForK6Process(
  processHandle: K6ProcessHandle,
  timeoutMs: number,
): Promise<{ exitCode: number; signal?: NodeJS.Signals | null }> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    const outcome = await Promise.race([
      processHandle.completion.then((completion) => ({ kind: 'completed' as const, completion })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
      }),
    ]);
    if (outcome.kind === 'completed') return outcome.completion;
    await processHandle.terminate();
    throw new AutomationError('PROCESS_TIMEOUT', 'k6 process exceeded its bounded execution window.', {
      timeoutMs,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then(() => true, () => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class K6StressRunner {
  private activeProcess: K6ProcessHandle | undefined;
  private stopRequested = false;
  private runInProgress = false;

  public constructor(
    private readonly processFactory: K6ProcessFactory = createChildProcess,
    private readonly defaultExecutablePath = process.env.AUTOMATEPLUS_K6_PATH ?? 'k6',
  ) {}

  public async runStressTest(
    session: SessionIR,
    options: K6StressOptions,
    onLog: RunLogCallback,
    onMetric?: (metric: { rps: number; latencyMs: number; errorRate: number; maxVUs: number }) => void,
  ): Promise<K6StressMetrics> {
    validateOptions(options);
    if (this.runInProgress) {
      throw new CapabilityError('CapabilityError: a k6 stress run is already active for this runner.');
    }
    this.runInProgress = true;
    try {
      return await this.executeStressTest(session, options, onLog, onMetric);
    } finally {
      this.runInProgress = false;
    }
  }

  private async executeStressTest(
    session: SessionIR,
    options: K6StressOptions,
    onLog: RunLogCallback,
    onMetric?: (metric: { rps: number; latencyMs: number; errorRate: number; maxVUs: number }) => void,
  ): Promise<K6StressMetrics> {
    this.stopRequested = false;
    const runId = crypto.randomUUID();
    const generator = GeneratorFactory.getGenerator('k6', 'javascript');
    const project = await generator.generateFullProject(session);
    const root = options.workspaceDirectory
      ? await mkdtemp(join(options.workspaceDirectory, `automateplus-k6-${runId}-`))
      : await mkdtemp(join(tmpdir(), `automateplus-k6-${runId}-`));
    try {
    const scriptPath = join(root, project.entrypoint.replaceAll('/', delimiter));
    const summaryPath = join(root, 'k6-summary.json');
    const script = project.files.find((file) => file.relativePath === project.entrypoint)?.content;
    if (!script) {
      throw new Error(`Generated k6 project is missing entrypoint '${project.entrypoint}'`);
    }
    await mkdir(dirname(scriptPath), { recursive: true });
    await writeFile(scriptPath, script, 'utf8');

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.environmentVariables,
      TARGET_RPS: String(options.targetRps),
      DURATION: `${options.durationSeconds}s`,
      PREALLOCATED_VUS: String(options.maxVUs ?? 20),
      MAX_VUS: String(options.maxVUs ?? 100),
    };
    const args = ['run', '--summary-export', summaryPath, scriptPath];
    // Keep only a bounded diagnostic tail. The live log callback is already
    // bounded by the renderer store, and retaining every k6 chunk here would
    // make a long/verbose run grow the sidecar heap indefinitely.
    let stdoutDiagnostic = '';
    let stderrDiagnostic = '';

    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `Generated k6 load script: ${project.entrypoint}`,
      data: { runId, artifactDirectory: root },
    });
    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `Executing k6 with target RPS=${options.targetRps}, duration=${options.durationSeconds}s, maxVUs=${options.maxVUs ?? 100}`,
      data: { executablePath: options.executablePath ?? this.defaultExecutablePath },
    });

    let completion: { exitCode: number; signal?: NodeJS.Signals | null };
    try {
      this.activeProcess = this.processFactory({
        executablePath: options.executablePath ?? this.defaultExecutablePath,
        args,
        cwd: root,
        environment,
        onStdout: (chunk) => {
          stdoutDiagnostic = appendDiagnosticTail(stdoutDiagnostic, chunk);
          onLog({ timestamp: Date.now(), type: 'stdout', message: boundLiveLogChunk(chunk).trimEnd() });
        },
        onStderr: (chunk) => {
          stderrDiagnostic = appendDiagnosticTail(stderrDiagnostic, chunk);
          onLog({ timestamp: Date.now(), type: 'stderr', message: boundLiveLogChunk(chunk).trimEnd() });
        },
      });
      completion = await waitForK6Process(
        this.activeProcess,
        Math.ceil(options.durationSeconds * 1000) + K6_PROCESS_GRACE_MS,
      );
    } finally {
      this.activeProcess = undefined;
    }

    if (this.stopRequested) {
      throw new AutomationError('CANCELLED', 'k6 execution cancelled by user.');
    }
    if (completion.exitCode !== 0) {
      const diagnostic = stderrDiagnostic.trim() || stdoutDiagnostic.trim() || `exit code ${completion.exitCode}`;
      throw new Error(`k6 exited unsuccessfully: ${diagnostic}`);
    }

    const summary = await readK6Summary(summaryPath);
    const requests = summary.metrics?.http_reqs;
    const duration = summary.metrics?.http_req_duration;
    const failed = summary.metrics?.http_req_failed;
    const actualRps = metricValue(requests, 'rate', 'http_reqs');
    const totalRequests = metricValue(requests, 'count', 'http_reqs');
    const p50LatencyMs = metricValue(duration, 'med', 'http_req_duration');
    const p90LatencyMs = metricValue(duration, 'p(90)', 'http_req_duration');
    const p95LatencyMs = metricValue(duration, 'p(95)', 'http_req_duration');
    const p99LatencyMs = metricValue(duration, 'p(99)', 'http_req_duration');
    const errorRate = metricValue(failed, 'rate', 'http_req_failed');
    validateMeasuredMetrics({ actualRps, totalRequests, errorRate });
    const maxVUs = options.maxVUs ?? 100;
    const metric = { rps: actualRps, latencyMs: p95LatencyMs, errorRate, maxVUs };
    onLog({
      timestamp: Date.now(),
      type: 'metric',
      message: `[k6 metric] RPS=${actualRps.toFixed(2)} | p95=${p95LatencyMs.toFixed(2)}ms | errors=${(errorRate * 100).toFixed(2)}%`,
      data: metric,
    });
    onMetric?.(metric);
    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `k6 execution completed. Total requests: ${totalRequests}, achieved RPS: ${actualRps.toFixed(2)}`,
      data: { summaryPath },
    });

    return {
      runId,
      targetRps: options.targetRps,
      maxVUs,
      actualRps,
      totalRequests,
      p50LatencyMs,
      p90LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      errorRate,
      durationSeconds: options.durationSeconds,
      artifactDirectory: options.keepArtifacts ? root : undefined,
    };
    } finally {
      this.activeProcess = undefined;
      if (!options.keepArtifacts) {
        await rm(root, { recursive: true, force: true });
      }
    }
  }

  public async stop(): Promise<void> {
    this.stopRequested = true;
    await this.activeProcess?.terminate();
  }
}

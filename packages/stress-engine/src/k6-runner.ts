import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  terminate: () => void;
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
    terminate: () => {
      if (!child.killed) child.kill('SIGTERM');
    },
  };
}

interface K6SummaryMetric {
  count?: number;
  rate?: number;
  value?: number;
  med?: number;
  avg?: number;
  ['p(90)']?: number;
  ['p(95)']?: number;
  ['p(99)']?: number;
}

interface K6Summary {
  metrics?: Record<string, K6SummaryMetric>;
}

function metricValue(metric: K6SummaryMetric | undefined, key: keyof K6SummaryMetric): number {
  const value = metric?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function validateOptions(options: K6StressOptions): void {
  if (!Number.isFinite(options.targetRps) || options.targetRps <= 0) {
    throw new CapabilityError('CapabilityError: targetRps must be greater than zero', { targetRps: options.targetRps });
  }
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) {
    throw new CapabilityError('CapabilityError: durationSeconds must be greater than zero', {
      durationSeconds: options.durationSeconds,
    });
  }
  if (options.maxVUs !== undefined && (!Number.isInteger(options.maxVUs) || options.maxVUs <= 0)) {
    throw new CapabilityError('CapabilityError: maxVUs must be a positive integer', { maxVUs: options.maxVUs });
  }
}

export class K6StressRunner {
  private activeProcess: K6ProcessHandle | undefined;
  private stopRequested = false;

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
    this.stopRequested = false;
    const runId = crypto.randomUUID();
    const generator = GeneratorFactory.getGenerator('k6', 'javascript');
    const project = await generator.generateFullProject(session);
    const root = options.workspaceDirectory
      ? await mkdtemp(join(options.workspaceDirectory, `automateplus-k6-${runId}-`))
      : await mkdtemp(join(tmpdir(), `automateplus-k6-${runId}-`));
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
    const stdout: string[] = [];
    const stderr: string[] = [];

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
          stdout.push(chunk);
          onLog({ timestamp: Date.now(), type: 'stdout', message: chunk.trimEnd() });
        },
        onStderr: (chunk) => {
          stderr.push(chunk);
          onLog({ timestamp: Date.now(), type: 'stderr', message: chunk.trimEnd() });
        },
      });
      completion = await this.activeProcess.completion;
    } finally {
      this.activeProcess = undefined;
    }

    if (this.stopRequested) {
      throw new AutomationError('CANCELLED', 'k6 execution cancelled by user.');
    }
    if (completion.exitCode !== 0) {
      const diagnostic = stderr.join('').trim() || stdout.join('').trim() || `exit code ${completion.exitCode}`;
      throw new Error(`k6 exited unsuccessfully: ${diagnostic}`);
    }

    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as K6Summary;
    const requests = summary.metrics?.http_reqs;
    const duration = summary.metrics?.http_req_duration;
    const failed = summary.metrics?.http_req_failed;
    const actualRps = metricValue(requests, 'rate');
    const totalRequests = metricValue(requests, 'count');
    const p50LatencyMs = metricValue(duration, 'med');
    const p90LatencyMs = metricValue(duration, 'p(90)');
    const p95LatencyMs = metricValue(duration, 'p(95)');
    const p99LatencyMs = metricValue(duration, 'p(99)');
    const errorRate = metricValue(failed, 'rate');
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

    if (!options.keepArtifacts) {
      await rm(root, { recursive: true, force: true });
    }

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
  }

  public stop(): void {
    this.stopRequested = true;
    this.activeProcess?.terminate();
  }
}

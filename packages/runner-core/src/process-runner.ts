import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import crypto from 'node:crypto';
import {
  AutomationError,
  GeneratedProject,
  ITestRunner,
  RunLogCallback,
  RunOptions,
  RunSummary,
  RunnerStatus,
} from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';

export interface ProcessCommand {
  executablePath: string;
  args: string[];
}

export interface ProcessExecutionRequest {
  command: ProcessCommand;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
}

export interface ProcessExecutionHandle {
  pid?: number;
  completion: Promise<{ exitCode: number; signal?: NodeJS.Signals | null }>;
  terminate: () => Promise<void>;
}

export type ProcessFactory = (request: ProcessExecutionRequest) => ProcessExecutionHandle;

export interface ProcessRunnerOptions {
  workspaceDirectory?: string;
  processFactory?: ProcessFactory;
  allowedExecutableNames?: readonly string[];
}

export interface ProcessRunOptions extends RunOptions {
  project?: GeneratedProject;
  command?: ProcessCommand;
  timeoutMs?: number;
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
  keepArtifacts?: boolean;
}

const DEFAULT_EXECUTABLES = [
  'adb',
  'cypress',
  'dotnet',
  'java',
  'k6',
  'k6.exe',
  'node',
  'node.exe',
  'playwright',
  'playwright.cmd',
  'python',
  'python.exe',
  'robot',
  'selenium',
];

function isAllowedExecutable(executablePath: string, allowlist: readonly string[]): boolean {
  const executableName = basename(executablePath).toLowerCase();
  return allowlist.some((allowed) => executableName === allowed.toLowerCase());
}

async function terminateChildTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.killed) return;
  child.kill('SIGTERM');
  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    });
    await new Promise<void>((resolveTaskkill) => {
      taskkill.once('close', () => resolveTaskkill());
      taskkill.once('error', () => resolveTaskkill());
    });
  }
}

function createProcess(request: ProcessExecutionRequest): ProcessExecutionHandle {
  const child = spawn(request.command.executablePath, request.command.args, {
    cwd: request.cwd,
    env: request.environment,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', request.onStdout);
  child.stderr?.on('data', request.onStderr);

  const completion = new Promise<{ exitCode: number; signal?: NodeJS.Signals | null }>((resolveCompletion, rejectCompletion) => {
    const timeout = setTimeout(() => {
      void terminateChildTree(child).then(() => rejectCompletion(new AutomationError('PROCESS_TIMEOUT', 'Process exceeded its timeout', {
        executablePath: request.command.executablePath,
        timeoutMs: request.timeoutMs,
      })));
    }, request.timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectCompletion(error);
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolveCompletion({ exitCode: exitCode ?? -1, signal });
    });
  });

  return {
    pid: child.pid,
    completion,
    terminate: () => terminateChildTree(child),
  };
}

export class ProcessRunner implements ITestRunner {
  private _status: RunnerStatus = 'queued';
  private activeProcess: ProcessExecutionHandle | undefined;
  private stopRequested = false;

  public constructor(private readonly options: ProcessRunnerOptions = {}) {}

  public get status(): RunnerStatus {
    return this._status;
  }

  public async run(
    session: SessionIR,
    options: ProcessRunOptions,
    onLog: RunLogCallback,
  ): Promise<RunSummary> {
    this._status = 'running';
    this.stopRequested = false;
    const startedAt = Date.now();
    const runId = crypto.randomUUID();
    const allowlist = this.options.allowedExecutableNames ?? DEFAULT_EXECUTABLES;

    if (!options.command) {
      this._status = 'blocked';
      const error = 'A real runner command is required; simulated process execution is disabled.';
      onLog({ timestamp: Date.now(), type: 'error', message: error, data: { code: 'RUNTIME_MISSING' } });
      return {
        runId,
        sessionId: session.id,
        status: this._status,
        passedSteps: 0,
        failedSteps: 0,
        totalSteps: session.steps.length,
        durationMs: Date.now() - startedAt,
        error,
      };
    }

    if (!isAllowedExecutable(options.command.executablePath, allowlist)) {
      this._status = 'blocked';
      const error = new AutomationError('PATH_DENIED', `Executable is not allowlisted: ${options.command.executablePath}`, {
        executablePath: options.command.executablePath,
      });
      onLog({ timestamp: Date.now(), type: 'error', message: error.message, data: { code: error.code } });
      return {
        runId,
        sessionId: session.id,
        status: this._status,
        passedSteps: 0,
        failedSteps: 0,
        totalSteps: session.steps.length,
        durationMs: Date.now() - startedAt,
        error: error.message,
      };
    }

    let workspace: string | undefined;
    try {
      workspace = await this.writeProject(options.project);
      const cwd = options.workingDirectory ?? workspace ?? this.options.workspaceDirectory ?? process.cwd();
      const environment = { ...process.env, ...(options.environmentVariables ?? {}) };
      onLog({
        timestamp: Date.now(),
        type: 'stdout',
        message: `Spawning allowlisted runner '${basename(options.command.executablePath)}' in isolated workspace.`,
        data: { runId, cwd, args: options.command.args },
      });

      this.activeProcess = (this.options.processFactory ?? createProcess)({
        command: options.command,
        cwd,
        environment,
        timeoutMs: options.timeoutMs ?? options.durationMs ?? 120_000,
        onStdout: (chunk) => onLog({ timestamp: Date.now(), type: 'stdout', message: chunk.trimEnd() }),
        onStderr: (chunk) => onLog({ timestamp: Date.now(), type: 'stderr', message: chunk.trimEnd() }),
      });
      const completion = await this.activeProcess.completion;
      this.activeProcess = undefined;
      if (this.stopRequested) {
        this._status = 'cancelled';
      } else {
        this._status = completion.exitCode === 0 ? 'passed' : 'failed';
      }
      const error = this.stopRequested
        ? 'Runner cancelled by user.'
        : completion.exitCode === 0
          ? undefined
          : `Runner exited with code ${completion.exitCode}`;
      if (error) onLog({ timestamp: Date.now(), type: 'error', message: error, data: { signal: completion.signal } });
      else onLog({ timestamp: Date.now(), type: 'state', message: 'Runner completed successfully.' });

      return {
        runId,
        sessionId: session.id,
        status: this._status,
        passedSteps: this._status === 'passed' ? session.steps.length : 0,
        failedSteps: this._status === 'failed' ? session.steps.length : 0,
        totalSteps: session.steps.length,
        durationMs: Date.now() - startedAt,
        error,
      };
    } catch (error) {
      this.activeProcess = undefined;
      if (this.stopRequested || (error instanceof AutomationError && error.code === 'CANCELLED')) this._status = 'cancelled';
      else if (error instanceof AutomationError && error.code === 'PROCESS_TIMEOUT') this._status = 'failed';
      else this._status = 'failed';
      const message = error instanceof Error ? error.message : String(error);
      onLog({ timestamp: Date.now(), type: 'error', message });
      return {
        runId,
        sessionId: session.id,
        status: this._status,
        passedSteps: 0,
        failedSteps: session.steps.length,
        totalSteps: session.steps.length,
        durationMs: Date.now() - startedAt,
        error: message,
      };
    } finally {
      if (workspace && !options.keepArtifacts) await rm(workspace, { recursive: true, force: true });
    }
  }

  public async stop(): Promise<void> {
    this.stopRequested = true;
    if (!this.activeProcess) {
      this._status = 'stopped';
      return;
    }
    await this.activeProcess.terminate();
    this._status = 'stopped';
  }

  private async writeProject(project?: GeneratedProject): Promise<string | undefined> {
    if (!project) return undefined;
    const root = await mkdtemp(join(this.options.workspaceDirectory ?? tmpdir(), 'automate-plus-run-'));
    for (const file of project.files) {
      const target = resolve(root, file.relativePath.replaceAll('/', delimiter));
      if (target !== root && !target.startsWith(`${root}${delimiter}`)) {
        throw new AutomationError('PATH_DENIED', `Generated file escapes workspace: ${file.relativePath}`);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
    return root;
  }
}

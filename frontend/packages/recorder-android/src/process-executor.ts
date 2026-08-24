import { spawn } from 'node:child_process';

export interface ProcessExecutionOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ProcessExecutionResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export type ProcessExecutionFailureCode =
  | 'PROCESS_NOT_FOUND'
  | 'PROCESS_START_FAILED'
  | 'PROCESS_TIMEOUT'
  | 'PROCESS_OUTPUT_LIMIT'
  | 'CANCELLED';

export const DEFAULT_MAX_PROCESS_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_CONFIGURED_PROCESS_OUTPUT_BYTES = 64 * 1024 * 1024;

export function appendBoundedText(
  current: string,
  chunk: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const currentBytes = Buffer.byteLength(current, 'utf8');
  const chunkBytes = Buffer.byteLength(chunk, 'utf8');
  const availableBytes = Math.max(0, maxBytes - currentBytes);
  if (chunkBytes <= availableBytes) return { value: current + chunk, truncated: false };
  if (availableBytes === 0) return { value: current, truncated: true };
  const boundedChunk = Buffer.from(chunk, 'utf8').subarray(0, availableBytes).toString('utf8');
  return { value: current + boundedChunk, truncated: true };
}

export class ProcessExecutionError extends Error {
  public override readonly name = 'ProcessExecutionError';
  public override readonly cause?: unknown;
  public readonly failureCode: ProcessExecutionFailureCode;

  public constructor(message: string, failureCode: ProcessExecutionFailureCode, cause?: unknown) {
    super(message);
    this.failureCode = failureCode;
    this.cause = cause;
  }
}

export interface ProcessExecutor {
  execute(
    executable: string,
    args: readonly string[],
    options?: ProcessExecutionOptions,
  ): Promise<ProcessExecutionResult>;
}

export class SpawnProcessExecutor implements ProcessExecutor {
  public execute(
    executable: string,
    args: readonly string[],
    options: ProcessExecutionOptions = {},
  ): Promise<ProcessExecutionResult> {
    return new Promise<ProcessExecutionResult>((resolve, reject) => {
      const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_PROCESS_OUTPUT_BYTES;
      if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0 || maxOutputBytes > MAX_CONFIGURED_PROCESS_OUTPUT_BYTES) {
        reject(new ProcessExecutionError(
          `Process output limit must be an integer between 1 and ${MAX_CONFIGURED_PROCESS_OUTPUT_BYTES} bytes.`,
          'PROCESS_OUTPUT_LIMIT',
        ));
        return;
      }
      const child = spawn(executable, [...args], {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      let aborted = false;
      let timeoutHandle: NodeJS.Timeout | undefined;
      let outputLimitExceeded = false;

      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        options.signal?.removeEventListener('abort', onAbort);
        callback();
      };

      const onAbort = (): void => {
        aborted = true;
        child.kill();
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        const bounded = appendBoundedText(stdout, chunk, maxOutputBytes);
        stdout = bounded.value;
        outputLimitExceeded ||= bounded.truncated;
      });
      child.stderr.on('data', (chunk: string) => {
        const bounded = appendBoundedText(stderr, chunk, maxOutputBytes);
        stderr = bounded.value;
        outputLimitExceeded ||= bounded.truncated;
      });
      child.once('error', (error: NodeJS.ErrnoException) => {
        const failureCode: ProcessExecutionFailureCode = error.code === 'ENOENT' ? 'PROCESS_NOT_FOUND' : 'PROCESS_START_FAILED';
        settle(() => reject(new ProcessExecutionError(`Unable to start '${executable}'.`, failureCode, error)));
      });
      child.once('close', (exitCode, signal) => {
        settle(() => {
          if (aborted) {
            reject(new ProcessExecutionError(`Process '${executable}' was cancelled.`, 'CANCELLED'));
            return;
          }
          if (timedOut) {
            reject(new ProcessExecutionError(`Process '${executable}' timed out.`, 'PROCESS_TIMEOUT'));
            return;
          }
          if (outputLimitExceeded) {
            reject(new ProcessExecutionError(
              `Process '${executable}' exceeded the ${maxOutputBytes} byte stdout/stderr capture limit.`,
              'PROCESS_OUTPUT_LIMIT',
            ));
            return;
          }
          resolve({ exitCode: exitCode ?? -1, signal, stdout, stderr });
        });
      });

      if (options.timeoutMs !== undefined) {
        if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
          child.kill();
          settle(() => reject(new ProcessExecutionError('Process timeout must be a positive integer.', 'PROCESS_TIMEOUT')));
          return;
        }
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, options.timeoutMs);
      }

      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
        } else {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }
      }
    });
  }
}

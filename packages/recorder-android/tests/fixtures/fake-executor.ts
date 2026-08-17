import {
  ProcessExecutionOptions,
  ProcessExecutionResult,
  ProcessExecutor,
} from '../../src/process-executor.js';

export interface RecordedProcessCall {
  executable: string;
  args: readonly string[];
  options?: ProcessExecutionOptions;
}

export class FakeProcessExecutor implements ProcessExecutor {
  public readonly calls: RecordedProcessCall[] = [];
  private readonly responses: Array<ProcessExecutionResult | Error> = [];

  public enqueueResponse(response: ProcessExecutionResult): void {
    this.responses.push(response);
  }

  public enqueueError(error: Error): void {
    this.responses.push(error);
  }

  public async execute(
    executable: string,
    args: readonly string[],
    options?: ProcessExecutionOptions,
  ): Promise<ProcessExecutionResult> {
    this.calls.push({ executable, args: [...args], options });
    const response = this.responses.shift();
    if (!response) {
      throw new Error(`No fake process response configured for '${executable}'.`);
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }
}

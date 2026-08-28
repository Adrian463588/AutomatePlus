import { StringDecoder } from 'node:string_decoder';
import {
  BoundedNdjsonFramer,
  IpcMessage,
  IpcRequest,
  createErrorResponse,
  createEvent,
  createResponse,
  parseIpcLine,
  serializeIpcMessage,
} from '@automate-plus/contracts';
import { GeneratorFactory } from '@automate-plus/generators';
import { migrateSessionIR, validateSessionIR } from '@automate-plus/ir-schema';

const controllers = new Map<string, AbortController>();
const EXPECTED_GENERATOR_COUNT = 27;
const STDOUT_DRAIN_TIMEOUT_MS = 10_000;

await readInput();

async function readInput(): Promise<void> {
  const decoder = new StringDecoder('utf8');
  const framer = new BoundedNdjsonFramer();
  try {
    for await (const chunk of process.stdin) {
      const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      for (const line of framer.push(text)) await handleLine(line);
    }
    const trailingText = decoder.end();
    for (const line of framer.push(trailingText)) await handleLine(line);
    framer.finish();
  } catch (error) {
    process.stderr.write(`[protocol] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

async function handleLine(line: string): Promise<void> {
  let message: IpcMessage;
  try {
    message = parseIpcLine(line);
  } catch (error) {
    process.stderr.write(`[protocol] ${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }

  if (message.kind === 'cancel') {
    controllers.get(message.payload.targetCorrelationId)?.abort();
    await writeMessage(createEvent(message.correlationId, 'run.cancelled', 0, {
      targetCorrelationId: message.payload.targetCorrelationId,
      reason: message.payload.reason,
    }));
    return;
  }
  if (message.kind !== 'request') return;

  const controller = new AbortController();
  controllers.set(message.correlationId, controller);
  try {
    const result = await dispatch(message, controller.signal);
    await writeMessage(createResponse(message, result));
  } catch (error) {
    await writeMessage(createErrorResponse(message, error));
  } finally {
    controllers.delete(message.correlationId);
  }
}

async function dispatch(request: IpcRequest, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new Error('Request cancelled');
  const payload = asRecord(request.payload);
  switch (request.method) {
    case 'health':
      {
        const generatorCount = GeneratorFactory.getSupportedCombinations().length;
        const ready = generatorCount === EXPECTED_GENERATOR_COUNT;
        return {
          status: ready ? 'ready' : 'blocked',
          host: 'typescript-sidecar',
          processId: process.pid,
          protocolVersion: '1.0',
          generatorCount,
          expectedGeneratorCount: EXPECTED_GENERATOR_COUNT,
          missingPrerequisites: ready ? [] : [`generator_matrix:${EXPECTED_GENERATOR_COUNT}`],
        };
      }
    case 'session.validate': {
      const result = validateSessionIR(payload.session ?? payload);
      return { valid: result.success, errors: result.errors ?? [], data: result.data };
    }
    case 'session.normalize':
      return migrateSessionIR(payload.session ?? payload);
    case 'generator.capabilities':
      return GeneratorFactory.getSupportedCombinations();
    case 'generator.generate': {
      const session = validateSessionIR(payload.session).data;
      if (!session) throw new Error('Session IR is invalid');
      const framework = stringValue(payload.framework, 'framework');
      const language = stringValue(payload.language, 'language');
      return GeneratorFactory.getGenerator(framework, language).generateFullProject(session);
    }
    default:
      throw new Error(`Unsupported sidecar method: ${request.method}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`);
  return value;
}

async function writeMessage(message: IpcMessage): Promise<void> {
  if (!process.stdout.write(serializeIpcMessage(message))) {
    await waitForStdoutDrain();
  }
}

async function waitForStdoutDrain(): Promise<void> {
  if (process.stdout.destroyed || process.stdout.writableEnded) {
    throw new Error('Sidecar stdout closed before IPC backpressure drained.');
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      process.stdout.off('drain', onDrain);
      process.stdout.off('error', onError);
      process.stdout.off('close', onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Sidecar stdout closed while waiting for IPC backpressure.'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Sidecar stdout did not drain within ${STDOUT_DRAIN_TIMEOUT_MS}ms.`));
    }, STDOUT_DRAIN_TIMEOUT_MS);
    process.stdout.once('drain', onDrain);
    process.stdout.once('error', onError);
    process.stdout.once('close', onClose);
  });
}

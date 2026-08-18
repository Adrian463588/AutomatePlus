import readline from 'node:readline';
import {
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
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const EXPECTED_GENERATOR_COUNT = 27;

for await (const line of input) {
  if (!line.trim()) continue;
  await handleLine(line);
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
  process.stdout.write(serializeIpcMessage(message));
}

import { isRecord } from './version.js';

export const MAX_SESSION_STEPS = 1_000;
export const MAX_SESSION_IR_ESTIMATED_BYTES = 8 * 1024 * 1024;
const MAX_SESSION_IR_NODES = 100_000;

export class SessionLimitError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SessionLimitError';
  }
}

/** Rejects oversized input before migration clones its steps and nested data. */
export function assertSessionWithinLimits(raw: unknown): void {
  if (isRecord(raw)) {
    const steps = Array.isArray(raw.steps)
      ? raw.steps
      : Array.isArray(raw.actions)
        ? raw.actions
        : [];
    if (steps.length > MAX_SESSION_STEPS) {
      throw new SessionLimitError(`Session exceeds the ${MAX_SESSION_STEPS}-step limit.`);
    }
  }

  const pending: unknown[] = [raw];
  const seen = new WeakSet<object>();
  let estimatedBytes = 0;
  let nodes = 0;

  while (pending.length > 0) {
    const value = pending.pop();
    nodes += 1;
    if (nodes > MAX_SESSION_IR_NODES) {
      throw new SessionLimitError(`Session exceeds the ${MAX_SESSION_IR_NODES}-node limit.`);
    }

    if (typeof value === 'string') estimatedBytes += value.length * 2;
    else if (typeof value === 'number' || typeof value === 'bigint') estimatedBytes += 8;
    else if (typeof value === 'boolean') estimatedBytes += 4;
    else if (value && typeof value === 'object') {
      if (seen.has(value)) continue;
      seen.add(value);
      estimatedBytes += Array.isArray(value) ? 32 + (value.length * 8) : 64;
      for (const [key, child] of Object.entries(value)) {
        estimatedBytes += key.length * 2;
        pending.push(child);
      }
    }

    if (estimatedBytes > MAX_SESSION_IR_ESTIMATED_BYTES) {
      throw new SessionLimitError(
        `Session exceeds the ${MAX_SESSION_IR_ESTIMATED_BYTES}-byte in-memory budget.`,
      );
    }
  }
}

import { ProtocolError } from './errors.js';

export function createRuntimeId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (!randomUuid) throw new ProtocolError('No UUID generator is available in this runtime');
  return randomUuid.call(globalThis.crypto);
}

import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync } from 'node:fs';

const HASH_CHUNK_BYTES = 64 * 1024;

/** Hash a file with constant memory, including multi-gigabyte runtime packs. */
export function sha256FileSync(filePath) {
  const descriptor = openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
  const hash = createHash('sha256');
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
    return hash.digest('hex');
  } finally {
    closeSync(descriptor);
  }
}

import { describe, expect, it } from 'vitest';
import { appendBoundedText, DEFAULT_MAX_PROCESS_OUTPUT_BYTES } from '../src/process-executor.js';

describe('Process output safety', () => {
  it('keeps captured output bounded and reports truncation', () => {
    const result = appendBoundedText('', 'x'.repeat(DEFAULT_MAX_PROCESS_OUTPUT_BYTES + 128), DEFAULT_MAX_PROCESS_OUTPUT_BYTES);

    expect(Buffer.byteLength(result.value, 'utf8')).toBeLessThanOrEqual(DEFAULT_MAX_PROCESS_OUTPUT_BYTES);
    expect(result.truncated).toBe(true);
  });

  it('does not mark output truncated when it fits the configured limit', () => {
    const result = appendBoundedText('adb ', 'ready', 32);

    expect(result).toEqual({ value: 'adb ready', truncated: false });
  });
});

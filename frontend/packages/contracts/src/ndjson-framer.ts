import { ProtocolError } from './errors.js';
import { MAX_IPC_LINE_CHARS } from './limits.js';

/** Splits NDJSON without allowing a missing newline to grow memory without bound. */
export class BoundedNdjsonFramer {
  private remainder = '';

  public push(chunk: string): string[] {
    const frames: string[] = [];
    let start = 0;
    let newline = chunk.indexOf('\n');
    while (newline >= 0) {
      const segment = chunk.slice(start, newline);
      this.assertFits(segment.length);
      const frame = `${this.remainder}${segment}`.replace(/\r$/u, '');
      this.remainder = '';
      if (frame.trim()) frames.push(frame);
      start = newline + 1;
      newline = chunk.indexOf('\n', start);
    }

    const tail = chunk.slice(start);
    if (tail.length > 0) {
      this.assertFits(tail.length);
      this.remainder += tail;
    }
    return frames;
  }

  public finish(): void {
    if (this.remainder.trim().length > 0) {
      const bufferedChars = this.remainder.length;
      this.remainder = '';
      throw new ProtocolError('IPC stream ended with an incomplete NDJSON record', { bufferedChars });
    }
    this.remainder = '';
  }

  private assertFits(additionalChars: number): void {
    if (this.remainder.length + additionalChars > MAX_IPC_LINE_CHARS) {
      this.remainder = '';
      throw new ProtocolError('IPC record exceeds the configured size limit', {
        maxChars: MAX_IPC_LINE_CHARS,
      });
    }
  }
}

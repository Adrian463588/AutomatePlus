import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('[ComponentTest] native transport security contract', () => {
  it('allows only local Tauri IPC and development connections', () => {
    const config = JSON.parse(readFileSync(fileURLToPath(new URL('../../backend/tauri.conf.json', import.meta.url)), 'utf8'));
    const connect = config.app.security.csp.split(';').find((directive: string) => directive.trim().startsWith('connect-src'));
    expect(connect?.trim().split(/\s+/u)).toEqual([
      'connect-src', "'self'", 'ipc:', 'http://ipc.localhost', 'http://127.0.0.1:*', 'ws://127.0.0.1:*',
    ]);
    // Without ipc.localhost WebView2 falls back to JSON postMessage; Rust correctly
    // rejects it because bounded raw-byte decoding must happen before JSON parsing.
    expect(config.app.withGlobalTauri).toBe(true);
  });
});

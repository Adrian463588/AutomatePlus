import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopBridgeService, NativeIpcError } from '../desktopBridge.js';

interface NativeRequestFixture {
  method: string;
  payload: unknown;
}

function success(data: unknown): Record<string, unknown> {
  return {
    protocolVersion: '1.0',
    kind: 'response',
    correlationId: 'fixture-correlation-id',
    method: 'fixture',
    payload: { ok: true, data },
  };
}

function requestFrom(args: Record<string, unknown> | undefined): NativeRequestFixture {
  const request = args?.request;
  if (typeof request !== 'object' || request === null) throw new Error('Missing request fixture.');
  const method = (request as { method?: unknown }).method;
  const payload = (request as { payload?: unknown }).payload;
  if (typeof method !== 'string') throw new Error('Missing request method fixture.');
  return { method, payload };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('[ComponentTest] desktop native bridge', () => {
  it('blocks browser folder picking without invoking a browser fallback', async () => {
    const invoke = vi.fn();
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', undefined);
    const service = new DesktopBridgeService();

    await expect(service.pickDirectory()).rejects.toMatchObject({
      code: 'CAPABILITY_ERROR',
    } satisfies Partial<NativeIpcError>);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends a typed native.dialog.pick request and preserves cancellation', async () => {
    const invoke = vi.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = requestFrom(args);
      expect(request.method).toBe('native.dialog.pick');
      expect(request.payload).toEqual({ mode: 'folder', title: 'Choose AutomatePlus workspace folder' });
      return success({ protocolVersion: '1.0', selectedPath: null, cancelled: true });
    });
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.pickDirectory()).resolves.toEqual({ protocolVersion: '1.0', selectedPath: null, cancelled: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('returns a canonical selected path from the native response', async () => {
    const invoke = vi.fn(async () => success({ protocolVersion: '1.0', selectedPath: 'C:\\AutomatePlus\\workspace', cancelled: false }));
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.pickDirectory()).resolves.toEqual({
      protocolVersion: '1.0',
      selectedPath: 'C:\\AutomatePlus\\workspace',
      cancelled: false,
    });
  });

  it('uses the native file mode and ZIP filter for archive selection', async () => {
    const invoke = vi.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = requestFrom(args);
      expect(request.method).toBe('native.dialog.pick');
      expect(request.payload).toEqual({
        mode: 'file',
        title: 'Import AutomatePlus runtime archive',
        filters: [{ name: 'AutomatePlus Runtime ZIP', extensions: ['zip'] }],
      });
      return success({ protocolVersion: '1.0', selectedPath: 'C:\\AutomatePlus\\runtime.zip', cancelled: false });
    });
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.pickDialog({
      mode: 'file',
      title: 'Import AutomatePlus runtime archive',
      filters: [{ name: 'AutomatePlus Runtime ZIP', extensions: ['zip'] }],
    })).resolves.toEqual({
      protocolVersion: '1.0',
      selectedPath: 'C:\\AutomatePlus\\runtime.zip',
      cancelled: false,
    });
  });

  it('keeps native runtime manager access available while host capabilities are blocked', async () => {
    const invoke = vi.fn(async () => success({
      protocolVersion: '1.0',
      host: 'tauri-rust',
      state: 'blocked',
      status: 'blocked',
      available: false,
      reason: 'Verified runtime packs are missing.',
      missingPrerequisites: ['runtime_packs'],
      capabilities: {
        deviceDiscovery: false,
        androidRecording: false,
        farmReplay: false,
        nativeExecution: false,
      },
    }));
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    expect(service.getRuntimeHostState()).toMatchObject({ mode: 'native', status: 'ready' });
    const status = await service.probeNativeHost();

    expect(status).toMatchObject({ available: false, state: 'blocked', missingPrerequisites: ['runtime_packs'] });
    expect(service.getRuntimeHostState()).toMatchObject({ mode: 'native', status: 'ready' });
  });

  it('builds runtime preflight counts only from native catalog, roots, and health responses', async () => {
    const invoke = vi.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = requestFrom(args);
      if (request.method === 'native.health') {
        return success({
          protocolVersion: '1.0',
          host: 'tauri-rust',
          state: 'ready',
          status: 'ready',
          available: true,
          missingPrerequisites: [],
          capabilities: {
            deviceDiscovery: true,
            androidRecording: true,
            farmReplay: true,
            nativeExecution: true,
          },
        });
      }
      if (request.method === 'runtime.catalog.list') {
        return success({ protocolVersion: '1.0', entries: [{ id: 'runtime-a', status: 'NeedsReview' }] });
      }
      if (request.method === 'runtime.roots.scan') {
        return success({
          protocolVersion: '1.0',
          roots: [{ writable: true, installedPacks: [{ id: 'runtime-a' }] }],
        });
      }
      if (request.method === 'runtime.verify') {
        return success({ protocolVersion: '1.0', packs: [{ id: 'runtime-a' }] });
      }
      if (request.method === 'runtime.health') {
        return success({ protocolVersion: '1.0', packs: [{ id: 'runtime-a', status: 'failed' }] });
      }
      throw new Error(`Unexpected method ${request.method}`);
    });
    vi.stubGlobal('__AUTOMATE_PLUS_NATIVE_BRIDGE__', { invoke });
    const service = new DesktopBridgeService();

    await expect(service.checkRuntimePreflight()).resolves.toMatchObject({
      status: 'blocked',
      catalogEntryCount: 1,
      catalogNeedsReviewCount: 1,
      rootCount: 1,
      writableRootCount: 1,
      installedPackCount: 1,
      healthyPackCount: 0,
      healthIssueCount: 1,
    });
    expect(invoke).toHaveBeenCalledTimes(5);
  });
});

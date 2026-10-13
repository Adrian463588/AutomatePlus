import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridge } from '../src/services/desktopBridge.js';
import { useAppStore } from '../src/store/appStore.js';

afterEach(() => vi.restoreAllMocks());

describe('Workspace BDD error and cancellation behavior', () => {
  it('given browser mode, Browse returns no invented Windows path', async () => {
    vi.spyOn(bridge, 'hasNativeBridge').mockReturnValue(false);
    useAppStore.setState({ workspaceBrowse: { status: 'idle', canBrowse: false } });
    await expect(useAppStore.getState().browseWorkspaceFolder()).resolves.toBeUndefined();
    expect(useAppStore.getState().workspaceBrowse).toMatchObject({ status: 'blocked', canBrowse: false });
  });

  it('given a native picker cancellation, no replacement workspace path is returned', async () => {
    vi.spyOn(bridge, 'hasNativeBridge').mockReturnValue(true);
    vi.spyOn(bridge, 'pickDirectory').mockResolvedValue({ protocolVersion: '1.0', cancelled: true, selectedPath: null });
    useAppStore.setState({ workspaceBrowse: { status: 'idle', canBrowse: true } });
    await expect(useAppStore.getState().browseWorkspaceFolder()).resolves.toBeUndefined();
    expect(useAppStore.getState().workspaceBrowse.status).toBe('cancelled');
  });

  it('given persistence failure, session creation reports an error and keeps the existing session', async () => {
    vi.spyOn(bridge.sessionRepo, 'save').mockRejectedValue(new Error('Local storage is full'));
    useAppStore.setState({ activeProject: { id: '10000000-0000-4000-8000-000000000001', name: 'Component project', workspacePath: 'C:\\component-workspace', defaultFramework: '', defaultLanguage: '', createdAt: 1, updatedAt: 1 }, activeSession: undefined, sessions: [] });
    await useAppStore.getState().createSession('Unsaved draft', 'web');
    expect(useAppStore.getState().sessions).toEqual([]);
    expect(useAppStore.getState().feedback).toMatchObject({ kind: 'error', message: 'Session could not be saved: Local storage is full' });
  });
});

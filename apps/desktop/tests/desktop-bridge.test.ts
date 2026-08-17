import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionIR } from '@automate-plus/ir-schema';
import { SessionRecord } from '@automate-plus/persistence';
import { DesktopBridgeService } from '../src/services/desktopBridge.js';
import { useAppStore } from '../src/store/appStore.js';

describe('Desktop migration bridge truthfulness', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('starts without seeded projects or sessions', async () => {
    const service = new DesktopBridgeService();

    await expect(service.projectRepo.getAll()).resolves.toEqual([]);
    await expect(service.sessionRepo.getAll()).resolves.toEqual([]);
  });

  it('exposes the registered capability manifest without a duplicated UI matrix', () => {
    const service = new DesktopBridgeService();
    const capabilities = service.getCapabilities();

    expect(capabilities).toHaveLength(27);
    expect(new Set(capabilities.map((capability) => capability.id)).size).toBe(capabilities.length);
    expect(capabilities.every((capability) => capability.supportedActions.length > 0)).toBe(true);
  });

  it('persists API assertions and extraction variables in the session IR', async () => {
    const now = Date.now();
    const session: SessionRecord = {
      id: '10000000-0000-4000-8000-000000000001',
      projectId: '10000000-0000-4000-8000-000000000002',
      name: 'API assertion fixture',
      platform: 'api',
      ir: {
        id: '10000000-0000-4000-8000-000000000001',
        schemaVersion: 2,
        projectId: '10000000-0000-4000-8000-000000000002',
        name: 'API assertion fixture',
        platform: 'api',
        targetConfig: {},
        environmentVariables: {},
        steps: [],
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    useAppStore.setState({ activeSession: session, sessions: [session], selectedFramework: '', selectedLanguage: '', generatedCode: '' });

    const request: ActionIR = {
      id: '10000000-0000-4000-8000-000000000003',
      schemaVersion: 2,
      stepNumber: 1,
      platform: 'api',
      action: 'httpRequest',
      apiPayload: {
        method: 'GET',
        url: 'https://example.invalid/health',
        headers: {},
        queryParams: {},
        bodyType: 'none',
        extractedVariables: [{ variableName: 'healthId', jsonPath: '$.data.id' }],
      },
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    };

    await useAppStore.getState().saveApiRequest(request, [
      { action: 'assertStatusCode', expectedValue: '204' },
      { action: 'assertJsonPath', attributeName: '$.data.id', expectedValue: 'present' },
    ]);

    const steps = useAppStore.getState().activeSession?.ir.steps ?? [];
    expect(steps.map((step) => step.action)).toEqual(['httpRequest', 'assertStatusCode', 'assertJsonPath']);
    expect(steps[0]?.apiPayload?.extractedVariables).toEqual([{ variableName: 'healthId', jsonPath: '$.data.id' }]);
    expect(steps[1]?.expectedValue).toBe('204');
    expect(steps[2]?.assertion).toMatchObject({ operator: 'equals', jsonPath: '$.data.id', expected: 'present' });
  });
});

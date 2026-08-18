import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_RUNTIME_BLOCKED_REASON,
  RuntimeManagerBlockedError,
  RuntimeManagerClient,
  type RuntimeCatalogEntry,
  type RuntimeHealthResponse,
  type RuntimeInstallResponse,
  type RuntimeJobResponse,
  type RuntimeManagerInvoke,
  type RuntimeMethod,
  type RuntimeImportedResponse,
  type RuntimeVerificationResponse,
  buildRuntimePackViews,
  getRuntimeActionState,
  resolveRuntimePackState,
  selectMissingRuntimePacks,
  validateRuntimeCatalog,
  withRuntimeJobProgress,
} from '../runtimeManager.js';

const entry = (id: string, sha256 = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'): RuntimeCatalogEntry => ({
  id,
  category: 'library',
  version: '1.0.0',
  architecture: 'win-x64',
  source: {
    url: `https://nodejs.org/dist/${id}.zip`,
    allowedHost: 'nodejs.org',
    sha256,
    sizeBytes: 1024,
  },
  archive: { format: 'zip', executablePaths: [`${id}/bin/tool.exe`] },
  license: { spdx: 'MIT', url: 'https://opensource.org/license/mit' },
  provides: [id],
  requires: [],
  healthCommand: [`${id}/bin/tool.exe`, '--version'],
  generatorIds: [id],
});

const readyPack = (pack: RuntimeCatalogEntry['id'], sha256 = entry(pack).source.sha256 ?? '') => ({
  id: pack,
  version: '1.0.0',
  architecture: 'win-x64',
  sha256,
  sourceSha256: sha256,
  rootPath: 'D:/AutomatePlus/runtime-packs',
  verified: true,
  licenseAccepted: true,
  health: 'ready' as const,
});

const job = {
  jobId: 'job-1',
  operation: 'install' as const,
  packIds: ['node'],
  status: 'Downloading' as const,
};

describe('[ComponentTest] runtime catalog and job helpers', () => {
  it('rejects unpinned or non-allowlisted catalog metadata', () => {
    const invalid = { ...entry('node'), source: { ...entry('node').source, url: 'http://mirror.invalid/node.zip', allowedHost: 'nodejs.org', sha256: 'bad' } };
    const issues = validateRuntimeCatalog([invalid]);

    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['source.url', 'source.allowedHost', 'source.sha256']));
  });

  it('reuses only an exact verified id, version, architecture, and SHA', () => {
    const catalog = [entry('node'), entry('python')];
    const views = buildRuntimePackViews(catalog, [readyPack('node')]);

    expect(views.map((view) => view.status)).toEqual(['Ready', 'Missing']);
    expect(selectMissingRuntimePacks(catalog, [readyPack('node')]).map((item) => item.id)).toEqual(['python']);
    expect(resolveRuntimePackState(entry('node', 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'), [readyPack('node')]).status).toBe('NeedsReview');
  });

  it('keeps a failed health check out of the ready state', () => {
    const failed = { ...readyPack('node'), health: 'failed' as const };
    expect(resolveRuntimePackState(entry('node'), [failed])).toMatchObject({ status: 'Failed' });
  });

  it('accepts only real byte progress and preserves indeterminate progress', () => {
    expect(withRuntimeJobProgress(job, { downloadedBytes: 512, totalBytes: 1024 }).progress).toEqual({ downloadedBytes: 512, totalBytes: 1024 });
    expect(withRuntimeJobProgress(job, { downloadedBytes: 512 }).progress).toEqual({ downloadedBytes: 512 });
    expect(() => withRuntimeJobProgress(job, { downloadedBytes: 1025, totalBytes: 1024 })).toThrow('downloadedBytes cannot exceed totalBytes');
  });
});

describe('[ComponentTest] RuntimeManagerClient injected invoke boundary', () => {
  it('maps client methods to versioned runtime methods and observes the job', async () => {
    const installResponse: RuntimeInstallResponse = { protocolVersion: '1.0', job };
    const jobResponse: RuntimeJobResponse = { protocolVersion: '1.0', job: { ...job, status: 'Installed' } };
    const importedResponse: RuntimeImportedResponse = { protocolVersion: '1.0', imported: [], needsReview: [] };
    const verificationResponse: RuntimeVerificationResponse = { protocolVersion: '1.0', packs: [] };
    const healthResponse: RuntimeHealthResponse = { protocolVersion: '1.0', packs: [] };
    const invokeMock = vi.fn();
    invokeMock.mockImplementation(async (method: RuntimeMethod) => {
      if (method === 'runtime.install.start') return installResponse;
      if (method === 'runtime.install.status' || method === 'runtime.install.cancel') return jobResponse;
      if (method === 'runtime.import') return importedResponse;
      if (method === 'runtime.verify') return verificationResponse;
      if (method === 'runtime.health') return healthResponse;
      if (method === 'runtime.open-folder') return { protocolVersion: '1.0', openedPath: 'D:/AutomatePlus/runtime-packs' };
      throw new Error(`Unexpected method ${method}`);
    });
    const invoke = invokeMock as unknown as RuntimeManagerInvoke;

    const client = new RuntimeManagerClient(invoke);
    const observed: string[] = [];
    await client.installStart({ packIds: ['node'], licenseAccepted: true }, (currentJob) => { observed.push(currentJob.jobId); });
    await client.installStatus('job-1');
    await client.cancel('job-1');
    await client.importArchive('D:/incoming/node.zip', true);
    await client.verifyAll();
    await client.health();
    await client.openFolder('D:/AutomatePlus/runtime-packs');

    expect(observed).toEqual(['job-1']);
    expect(invokeMock).toHaveBeenCalledWith('runtime.install.start', { packIds: ['node'], licenseAccepted: true, allowOnlineDownload: true });
    expect(invokeMock).toHaveBeenCalledWith('runtime.import', { archivePath: 'D:/incoming/node.zip', licenseAccepted: true });
    expect(invokeMock).toHaveBeenCalledWith('runtime.verify', {});
    expect(invokeMock).toHaveBeenCalledWith('runtime.health', {});
  });

  it('blocks browser-shell calls and unaccepted licenses before invoking native IPC', async () => {
    const invokeMock = vi.fn();
    const invoke = invokeMock as unknown as RuntimeManagerInvoke;
    const client = new RuntimeManagerClient(invoke, { mode: 'browser', status: 'blocked', reason: BROWSER_RUNTIME_BLOCKED_REASON });

    await expect(client.catalogList()).rejects.toBeInstanceOf(RuntimeManagerBlockedError);
    await expect(client.importArchive('D:/incoming/node.zip', false)).rejects.toThrow('Accept the pack license');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(getRuntimeActionState({ mode: 'browser', status: 'blocked' }, 'onDownloadMissing')).toEqual({ enabled: false, reason: BROWSER_RUNTIME_BLOCKED_REASON });
  });
});

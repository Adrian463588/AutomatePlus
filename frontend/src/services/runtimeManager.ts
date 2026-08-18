export const RUNTIME_PROTOCOL_VERSION = '1.0' as const;
export const RUNTIME_ARCHITECTURE = 'win-x64' as const;

export type RuntimeCategory = 'bootstrap' | 'web' | 'api' | 'android' | 'library' | 'build';
export type RuntimeArchiveFormat = 'zip' | 'tar.gz' | 'msi' | 'directory';
export type RuntimeHostMode = 'native' | 'browser';
export type RuntimeHostStatus = 'ready' | 'blocked';
export type RuntimeHealthStatus = 'ready' | 'failed' | 'unknown';
export type RuntimePackStatus =
  | 'Ready'
  | 'Missing'
  | 'Scanning'
  | 'Downloading'
  | 'Verifying'
  | 'Installing'
  | 'Installed'
  | 'Cancelled'
  | 'Failed'
  | 'Blocked'
  | 'NeedsReview';

export interface RuntimeManagerHostState {
  mode: RuntimeHostMode;
  status: RuntimeHostStatus;
  reason?: string;
}

export interface RuntimeCatalogEntry {
  id: string;
  category: RuntimeCategory;
  version: string | null;
  architecture: typeof RUNTIME_ARCHITECTURE;
  source: {
    url?: string | null;
    allowedHost?: string | null;
    sha256?: string | null;
    sizeBytes?: number | null;
    officialReference?: string | null;
  };
  archive: {
    format: RuntimeArchiveFormat;
    executablePaths: readonly string[];
  };
  license: {
    spdx?: string | null;
    url?: string | null;
    sha256?: string | null;
    officialReference?: string | null;
  };
  provides: readonly string[];
  requires: readonly string[];
  healthCommand: readonly string[];
  generatorIds: readonly string[];
  status?: RuntimePackStatus;
  reviewReason?: string;
}

export interface RuntimeInstalledPack {
  id: string;
  version: string | null;
  architecture: string;
  sha256: string;
  sourceSha256?: string;
  rootPath: string;
  verified: boolean;
  licenseAccepted: boolean;
  health: RuntimeHealthStatus;
}

export interface RuntimeProgress {
  downloadedBytes: number;
  totalBytes?: number;
}

export interface RuntimeJobState {
  jobId: string;
  operation: 'install' | 'import' | 'verify' | 'scan' | 'health';
  packIds: readonly string[];
  status: RuntimePackStatus;
  progress?: RuntimeProgress;
  reason?: string;
}

export interface RuntimePackView {
  entry: RuntimeCatalogEntry;
  status: RuntimePackStatus;
  reason?: string;
  progress?: RuntimeProgress;
  jobId?: string;
}

export type RuntimeRootSource = 'selected' | 'workspace' | 'local-app-data' | 'program-data' | 'bundled';

export interface RuntimeRootSnapshot {
  path: string;
  source: RuntimeRootSource;
  writable: boolean;
  selected: boolean;
  installedPacks: readonly RuntimeInstalledPack[];
}

export interface RuntimeCatalogListResponse {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  entries: readonly RuntimeCatalogEntry[];
}

export interface RuntimeRootsScanResponse {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  activeRoot?: RuntimeRootSnapshot;
  roots: readonly RuntimeRootSnapshot[];
}

export interface RuntimeInstallResponse {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  job: RuntimeJobState;
}

export interface RuntimeJobResponse {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  job: RuntimeJobState;
}

export interface RuntimeImportedResponse {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  imported: readonly RuntimeInstalledPack[];
  needsReview: readonly RuntimeInstalledPack[];
}

export interface RuntimeVerificationResponse {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  packs: readonly RuntimeInstalledPack[];
}

export interface RuntimeHealthResponse {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  packs: ReadonlyArray<{
    id: string;
    status: RuntimeHealthStatus;
    reason?: string;
  }>;
}

export type RuntimeMethod =
  | 'runtime.catalog.list'
  | 'runtime.roots.scan'
  | 'runtime.root.select'
  | 'runtime.install.start'
  | 'runtime.install.status'
  | 'runtime.install.cancel'
  | 'runtime.import'
  | 'runtime.verify'
  | 'runtime.health'
  | 'runtime.open-folder';

export interface RuntimeMethodPayloads {
  'runtime.catalog.list': undefined;
  'runtime.roots.scan': { rootPath?: string };
  'runtime.root.select': { rootPath: string };
  'runtime.install.start': { packIds: readonly string[]; licenseAccepted: true; allowOnlineDownload: true };
  'runtime.install.status': { jobId: string };
  'runtime.install.cancel': { jobId: string };
  'runtime.import': { archivePath?: string; licenseAccepted: true };
  'runtime.verify': { packIds?: readonly string[] };
  'runtime.health': { packIds?: readonly string[] };
  'runtime.open-folder': { rootPath?: string };
}

export interface RuntimeMethodResponses {
  'runtime.catalog.list': RuntimeCatalogListResponse;
  'runtime.roots.scan': RuntimeRootsScanResponse;
  'runtime.root.select': RuntimeRootsScanResponse;
  'runtime.install.start': RuntimeInstallResponse;
  'runtime.install.status': RuntimeJobResponse;
  'runtime.install.cancel': RuntimeJobResponse;
  'runtime.import': RuntimeImportedResponse;
  'runtime.verify': RuntimeVerificationResponse;
  'runtime.health': RuntimeHealthResponse;
  'runtime.open-folder': { protocolVersion: typeof RUNTIME_PROTOCOL_VERSION; openedPath: string };
}

export interface RuntimeManagerTransport {
  invoke<M extends RuntimeMethod>(method: M, payload: RuntimeMethodPayloads[M]): Promise<RuntimeMethodResponses[M]>;
}

export type RuntimeManagerInvoke = RuntimeManagerTransport['invoke'];

export interface RuntimeInstallRequest {
  packIds: readonly string[];
  licenseAccepted: boolean;
}

export type RuntimeJobObserver = (job: RuntimeJobState) => void | Promise<void>;

export interface RuntimeManagerAdapter {
  readonly host: RuntimeManagerHostState;
  catalogList(): Promise<RuntimeCatalogListResponse>;
  rootsScan(rootPath?: string): Promise<RuntimeRootsScanResponse>;
  selectRoot(rootPath: string): Promise<RuntimeRootsScanResponse>;
  installStart(packIds: readonly string[], licenseAccepted: boolean): Promise<RuntimeInstallResponse>;
  installStatus(jobId: string): Promise<RuntimeJobResponse>;
  installCancel(jobId: string): Promise<RuntimeJobResponse>;
  importArchive(): Promise<RuntimeImportedResponse>;
  verify(packIds?: readonly string[]): Promise<RuntimeVerificationResponse>;
  health(packIds?: readonly string[]): Promise<RuntimeHealthResponse>;
  openFolder(rootPath?: string): Promise<RuntimeMethodResponses['runtime.open-folder']>;
}

export interface RuntimeManagerCallbacks {
  onScanLocal: () => void | Promise<void>;
  onChooseInstallPath: () => void | Promise<void>;
  onDownloadMissing: (packIds: readonly string[]) => void | Promise<void>;
  onImportArchive: () => void | Promise<void>;
  onVerifyAll: (packIds: readonly string[]) => void | Promise<void>;
  onRetryFailed: (packIds: readonly string[]) => void | Promise<void>;
  onCancel: (jobId: string) => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
}

export const BROWSER_RUNTIME_BLOCKED_REASON = 'Runtime Manager requires the native Tauri/Rust host. Browser migration shell cannot scan, download, import, verify, or install packs.';

export class RuntimeManagerBlockedError extends Error {
  readonly code = 'RUNTIME_HOST_BLOCKED';

  constructor(reason = BROWSER_RUNTIME_BLOCKED_REASON) {
    super(reason);
    this.name = 'RuntimeManagerBlockedError';
  }
}

export class RuntimeManagerClient {
  constructor(
    private readonly invoke: RuntimeManagerInvoke,
    private readonly host: RuntimeManagerHostState = { mode: 'native', status: 'ready' },
  ) {}

  catalogList(): Promise<RuntimeCatalogListResponse> {
    return this.call('runtime.catalog.list', undefined);
  }

  scanRoots(rootPath?: string): Promise<RuntimeRootsScanResponse> {
    return this.call('runtime.roots.scan', { rootPath });
  }

  selectRoot(rootPath: string): Promise<RuntimeRootsScanResponse> {
    return this.call('runtime.root.select', { rootPath });
  }

  async installStart(request: RuntimeInstallRequest, onJob?: RuntimeJobObserver): Promise<RuntimeInstallResponse> {
    if (!request.licenseAccepted) throw new RuntimeManagerBlockedError('Accept the pack license before starting installation.');
    if (request.packIds.length === 0) throw new RuntimeManagerBlockedError('No missing runtime pack was selected for installation.');
    const response = await this.call('runtime.install.start', { packIds: [...request.packIds], licenseAccepted: true, allowOnlineDownload: true });
    await onJob?.(response.job);
    return response;
  }

  installStatus(jobId: string): Promise<RuntimeJobResponse> {
    return this.call('runtime.install.status', { jobId });
  }

  cancel(jobId: string): Promise<RuntimeJobResponse> {
    return this.call('runtime.install.cancel', { jobId });
  }

  async importArchive(path?: string, licenseAccepted = false): Promise<RuntimeImportedResponse> {
    if (!licenseAccepted) throw new RuntimeManagerBlockedError('Accept the pack license before importing an archive.');
    return this.call('runtime.import', { ...(path ? { archivePath: path } : {}), licenseAccepted: true });
  }

  verifyAll(): Promise<RuntimeVerificationResponse> {
    return this.call('runtime.verify', {});
  }

  health(): Promise<RuntimeHealthResponse> {
    return this.call('runtime.health', {});
  }

  openFolder(path: string): Promise<RuntimeMethodResponses['runtime.open-folder']> {
    return this.call('runtime.open-folder', { rootPath: path });
  }

  private async call<M extends RuntimeMethod>(method: M, payload: RuntimeMethodPayloads[M]): Promise<RuntimeMethodResponses[M]> {
    if (this.host.mode !== 'native' || this.host.status !== 'ready') throw new RuntimeManagerBlockedError(this.host.reason);
    return this.invoke(method, payload);
  }
}

export interface RuntimeCatalogIssue {
  entryId: string;
  field: string;
  message: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;

export function validateRuntimeCatalogEntry(entry: RuntimeCatalogEntry): RuntimeCatalogIssue[] {
  const issues: RuntimeCatalogIssue[] = [];
  const issue = (field: string, message: string) => issues.push({ entryId: entry.id || '<unknown>', field, message });

  if (!IDENTIFIER_PATTERN.test(entry.id)) issue('id', 'must contain only lowercase letters, digits, dot, underscore, or hyphen');
  if (!entry.version?.trim()) issue('version', 'must be pinned');
  if (entry.architecture !== RUNTIME_ARCHITECTURE) issue('architecture', `must be ${RUNTIME_ARCHITECTURE}`);
  if (entry.source.sizeBytes != null && (!Number.isSafeInteger(entry.source.sizeBytes) || entry.source.sizeBytes <= 0)) issue('source.sizeBytes', 'must be a positive artifact size when present');
  if (!SHA256_PATTERN.test(entry.source.sha256 ?? '')) issue('source.sha256', 'must be a 64-character SHA-256 digest');
  if (entry.archive.executablePaths.length === 0) issue('archive.executablePaths', 'must list at least one verified executable path');
  if (entry.healthCommand.length === 0) issue('healthCommand', 'must list a real health command');
  if (!entry.license.spdx?.trim()) issue('license.spdx', 'must identify the pack license');

  try {
    const sourceUrl = new URL(entry.source.url ?? '');
    if (sourceUrl.protocol !== 'https:') issue('source.url', 'must use HTTPS');
    if (!entry.source.allowedHost || sourceUrl.hostname.toLowerCase() !== entry.source.allowedHost.toLowerCase()) issue('source.allowedHost', 'must match the HTTPS source hostname');
  } catch {
    issue('source.url', 'must be an absolute HTTPS URL');
  }

  try {
    const licenseUrl = new URL(entry.license.url ?? '');
    if (licenseUrl.protocol !== 'https:') issue('license.url', 'must be an HTTPS URL');
  } catch {
    issue('license.url', 'must be an absolute HTTPS URL');
  }

  if (entry.license.sha256 != null && !SHA256_PATTERN.test(entry.license.sha256)) issue('license.sha256', 'must be a 64-character SHA-256 digest when present');
  return issues;
}

export function validateRuntimeCatalog(entries: readonly RuntimeCatalogEntry[]): RuntimeCatalogIssue[] {
  const issues = entries.flatMap(validateRuntimeCatalogEntry);
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.id}@${entry.version}`;
    if (seen.has(key)) issues.push({ entryId: entry.id, field: 'version', message: `duplicate catalog entry ${key}` });
    seen.add(key);
  }
  return issues;
}

function exactVerifiedPack(entry: RuntimeCatalogEntry, installed: RuntimeInstalledPack): boolean {
  return installed.id === entry.id
    && installed.version === entry.version
    && installed.architecture === entry.architecture
    && Boolean(entry.source.sha256)
    && installed.sourceSha256?.toLowerCase() === entry.source.sha256?.toLowerCase()
    && installed.verified
    && installed.licenseAccepted
    && installed.health === 'ready';
}

export function resolveRuntimePackState(
  entry: RuntimeCatalogEntry,
  installedPacks: readonly RuntimeInstalledPack[],
  jobs: readonly RuntimeJobState[] = [],
): RuntimePackView {
  const job = jobs.find((candidate) => candidate.packIds.includes(entry.id));
  if (job) return { entry, status: job.status, reason: job.reason, progress: job.progress, jobId: job.jobId };

  if (entry.status === 'NeedsReview') {
    return { entry, status: 'NeedsReview', reason: entry.reviewReason ?? 'Catalog metadata is not verified for download.' };
  }

  const installed = installedPacks.find((candidate) => candidate.id === entry.id);
  if (!installed) return { entry, status: 'Missing', reason: 'No verified local pack matches this catalog entry.' };
  if (exactVerifiedPack(entry, installed)) return { entry, status: 'Ready', reason: `Verified in ${installed.rootPath}` };
  if (installed.health === 'failed') return { entry, status: 'Failed', reason: 'Local health check failed; review the pack before retrying.' };
  if (installed.sourceSha256?.toLowerCase() !== entry.source.sha256?.toLowerCase()) return { entry, status: 'NeedsReview', reason: 'Local pack SHA-256 differs from the pinned catalog digest; it will not be overwritten automatically.' };
  return { entry, status: 'NeedsReview', reason: 'Local pack metadata or license verification is incomplete.' };
}

export function buildRuntimePackViews(
  entries: readonly RuntimeCatalogEntry[],
  installedPacks: readonly RuntimeInstalledPack[],
  jobs: readonly RuntimeJobState[] = [],
): RuntimePackView[] {
  return entries.map((entry) => resolveRuntimePackState(entry, installedPacks, jobs));
}

export function selectMissingRuntimePacks(
  entries: readonly RuntimeCatalogEntry[],
  installedPacks: readonly RuntimeInstalledPack[],
): RuntimeCatalogEntry[] {
  return entries.filter((entry) => resolveRuntimePackState(entry, installedPacks).status === 'Missing');
}

export function withRuntimeJobProgress(job: RuntimeJobState, progress: RuntimeProgress): RuntimeJobState {
  if (!Number.isSafeInteger(progress.downloadedBytes) || progress.downloadedBytes < 0) throw new RangeError('downloadedBytes must be a non-negative integer');
  if (progress.totalBytes !== undefined && (!Number.isSafeInteger(progress.totalBytes) || progress.totalBytes <= 0)) throw new RangeError('totalBytes must be a positive integer when provided');
  if (progress.totalBytes !== undefined && progress.downloadedBytes > progress.totalBytes) throw new RangeError('downloadedBytes cannot exceed totalBytes');
  return { ...job, progress: { ...progress } };
}

export function getRuntimeActionState(
  host: RuntimeManagerHostState,
  action: keyof RuntimeManagerCallbacks,
): { enabled: boolean; reason?: string } {
  if (host.mode !== 'native') return { enabled: false, reason: host.reason || BROWSER_RUNTIME_BLOCKED_REASON };
  if (host.status !== 'ready') return { enabled: false, reason: host.reason || 'Tauri/Rust host is not ready.' };
  if (action === 'onDownloadMissing') return { enabled: true, reason: 'Download only after explicit user confirmation.' };
  return { enabled: true };
}

export function createRuntimeManagerAdapter(
  transport: RuntimeManagerTransport,
  host: RuntimeManagerHostState,
): RuntimeManagerAdapter {
  const call = async <M extends RuntimeMethod>(method: M, payload: RuntimeMethodPayloads[M]): Promise<RuntimeMethodResponses[M]> => {
    if (host.mode !== 'native' || host.status !== 'ready') throw new RuntimeManagerBlockedError(host.reason);
    return transport.invoke(method, payload);
  };

  return {
    host,
    catalogList: () => call('runtime.catalog.list', undefined),
    rootsScan: (rootPath) => call('runtime.roots.scan', { rootPath }),
    selectRoot: (rootPath) => call('runtime.root.select', { rootPath }),
    installStart: (packIds, licenseAccepted) => {
      if (!licenseAccepted) throw new RuntimeManagerBlockedError('Accept the pack license before starting installation.');
      if (packIds.length === 0) throw new RuntimeManagerBlockedError('No missing runtime pack was selected for installation.');
      return call('runtime.install.start', { packIds: [...packIds], licenseAccepted: true, allowOnlineDownload: true });
    },
    installStatus: (jobId) => call('runtime.install.status', { jobId }),
    installCancel: (jobId) => call('runtime.install.cancel', { jobId }),
    importArchive: () => call('runtime.import', { licenseAccepted: true }),
    verify: (packIds) => call('runtime.verify', packIds === undefined ? {} : { packIds: [...packIds] }),
    health: (packIds) => call('runtime.health', packIds === undefined ? {} : { packIds: [...packIds] }),
    openFolder: (rootPath) => call('runtime.open-folder', { rootPath }),
  };
}

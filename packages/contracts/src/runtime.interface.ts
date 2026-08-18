export type RuntimePackCategory =
  | 'bootstrap'
  | 'web'
  | 'api'
  | 'android'
  | 'library'
  | 'build';

export type RuntimeArchitecture = 'win-x64';
export type RuntimeArchiveFormat = 'zip' | 'tar.gz' | 'msi' | 'directory';

export type RuntimeJobStatus =
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

export interface RuntimeCatalogSource {
  url?: string | null;
  allowedHost?: string | null;
  /** Absent means the official artifact has not been pinned yet. */
  sha256?: string | null;
  /** Absent means the server does not provide a verified fixed-size artifact. */
  sizeBytes?: number | null;
  officialReference?: string | null;
}

export interface RuntimeLicenseMetadata {
  spdx?: string | null;
  url?: string | null;
  sha256?: string | null;
  officialReference?: string | null;
}

export interface RuntimeArchiveMetadata {
  format: RuntimeArchiveFormat;
  executablePaths: readonly string[];
}

export interface RuntimeCatalogEntry {
  id: string;
  category: RuntimePackCategory;
  version: string | null;
  architecture: RuntimeArchitecture;
  source: RuntimeCatalogSource;
  archive: RuntimeArchiveMetadata;
  license: RuntimeLicenseMetadata;
  provides: readonly string[];
  requires: readonly string[];
  healthCommand: readonly string[];
  generatorIds: readonly string[];
  status?: RuntimeJobStatus;
  reviewReason?: string;
}

export interface RuntimeCatalog {
  schemaVersion: 1;
  product: 'AutomatePlus';
  architecture: RuntimeArchitecture;
  entries: readonly RuntimeCatalogEntry[];
}

export interface RuntimeRootRecord {
  path: string;
  source: 'selected' | 'workspace' | 'localAppData' | 'programData' | 'bundled';
  writable: boolean;
  manifestPresent: boolean;
  status: 'Ready' | 'Missing' | 'NeedsReview' | 'Blocked';
}

export interface RuntimePackRecord {
  id: string;
  version: string;
  architecture: RuntimeArchitecture;
  sha256: string;
  root: string;
  relativePath: string;
  status: RuntimeJobStatus;
  verified: boolean;
  licenseAccepted: boolean;
  health?: 'passed' | 'failed' | 'not-run';
  reason?: string;
}

export interface RuntimeCatalogResponse {
  protocolVersion: '1.0';
  entries: readonly RuntimeCatalogEntry[];
}

export interface RuntimeInstalledPack {
  id: string;
  version: string | null;
  architecture: string;
  sha256: string;
  sourceSha256?: string | null;
  rootPath: string;
  verified: boolean;
  licenseAccepted: boolean;
  health: 'ready' | 'failed' | 'unknown';
}

export interface RuntimeProgress {
  downloadedBytes: number;
  totalBytes?: number | null;
}

export interface RuntimeJobState {
  jobId: string;
  operation: 'install' | 'import' | 'verify' | 'scan' | 'health';
  packIds: readonly string[];
  status: RuntimeJobStatus;
  progress?: RuntimeProgress | null;
  reason?: string | null;
  startedAt?: number;
  updatedAt?: number;
}

export interface RuntimeRootSnapshot {
  path: string;
  source: 'selected' | 'workspace' | 'local-app-data' | 'program-data' | 'bundled';
  writable: boolean;
  selected: boolean;
  installedPacks: readonly RuntimeInstalledPack[];
}

export interface RuntimeRootsScanResponse {
  protocolVersion: '1.0';
  activeRoot?: RuntimeRootSnapshot;
  roots: readonly RuntimeRootSnapshot[];
}

export interface RuntimeRootSelectRequest {
  path: string;
}

export interface RuntimeInstallStartRequest {
  packIds?: readonly string[];
  licenseAccepted: boolean;
  allowOnlineDownload: boolean;
}

export interface RuntimeInstallJob {
  jobId: string;
  status: RuntimeJobStatus;
  packIds: readonly string[];
  completedPackIds: readonly string[];
  currentPackId?: string;
  bytesDownloaded: number;
  totalBytes?: number;
  message: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

export interface RuntimeInstallStatusResponse {
  protocolVersion: '1.0';
  job: RuntimeJobState;
}

export interface RuntimeInstallResponse extends RuntimeInstallStatusResponse {}

export interface RuntimeImportRequest {
  archivePath: string;
  licenseAccepted: boolean;
}

export interface RuntimeVerifyResponse {
  protocolVersion: '1.0';
  packs: readonly RuntimeInstalledPack[];
}

export interface RuntimeImportedResponse {
  protocolVersion: '1.0';
  imported: readonly RuntimeInstalledPack[];
  needsReview: readonly unknown[];
}

export interface RuntimeHealthResponse {
  protocolVersion: '1.0';
  packs: ReadonlyArray<{
    id: string;
    status: 'ready' | 'failed' | 'unknown';
    reason?: string;
  }>;
}

export interface RuntimeOpenFolderResponse {
  protocolVersion: '1.0';
  openedPath: string;
}

export interface RuntimeProtocolMethodMap {
  'runtime.catalog.list': Record<string, never>;
  'runtime.roots.scan': Record<string, never>;
  'runtime.root.select': RuntimeRootSelectRequest;
  'runtime.install.start': RuntimeInstallStartRequest;
  'runtime.install.status': { jobId: string };
  'runtime.install.cancel': { jobId: string };
  'runtime.import': RuntimeImportRequest;
  'runtime.verify': Record<string, never>;
  'runtime.health': Record<string, never>;
  'runtime.open-folder': { path?: string };
}

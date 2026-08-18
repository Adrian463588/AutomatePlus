import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Square,
  Upload,
  X,
} from 'lucide-react';
import {
  BROWSER_RUNTIME_BLOCKED_REASON,
  getRuntimeActionState,
  type RuntimeJobState,
  type RuntimeManagerCallbacks,
  type RuntimeManagerHostState,
  type RuntimePackStatus,
  type RuntimePackView,
  type RuntimeRootSnapshot,
} from '../../services/runtimeManager.js';

export interface RuntimeManagerPanelProps extends RuntimeManagerCallbacks {
  host: RuntimeManagerHostState;
  activeRoot?: RuntimeRootSnapshot;
  packs: readonly RuntimePackView[];
  activeJob?: RuntimeJobState;
  busy?: boolean;
  statusMessage?: string;
  onCheckRuntime?: (packIds: readonly string[]) => void | Promise<void>;
  pickerReady?: boolean;
  pickerBlockedReason?: string;
}

export type RuntimeManagerPanelInput = Partial<RuntimeManagerPanelProps>;

type LicenseDialogPurpose = 'install' | 'import';

const ACTIVE_JOB_STATUSES: readonly RuntimePackStatus[] = ['Scanning', 'Downloading', 'Verifying', 'Installing'];

const DEFAULT_HOST: RuntimeManagerHostState = {
  mode: 'browser',
  status: 'blocked',
  reason: BROWSER_RUNTIME_BLOCKED_REASON,
};

const DEFAULT_CALLBACKS: RuntimeManagerCallbacks = {
  onScanLocal: () => undefined,
  onChooseInstallPath: () => undefined,
  onDownloadMissing: () => undefined,
  onImportArchive: () => undefined,
  onVerifyAll: () => undefined,
  onRetryFailed: () => undefined,
  onCancel: () => undefined,
  onOpenFolder: () => undefined,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function sourceHost(entry: RuntimePackView['entry']): string {
  return entry.source.allowedHost ?? 'Not pinned';
}

function licenseLabel(entry: RuntimePackView['entry']): string {
  return entry.license.spdx ?? 'Not pinned';
}

function sourceDigest(entry: RuntimePackView['entry']): string {
  return entry.source.sha256 ? `${entry.source.sha256.slice(0, 12)}…` : 'Not pinned';
}

function sourceSize(entry: RuntimePackView['entry']): string {
  return entry.source.sizeBytes == null ? 'Not pinned' : formatBytes(entry.source.sizeBytes);
}

function sourceReference(entry: RuntimePackView['entry']): string {
  return entry.source.url ?? entry.source.officialReference ?? 'Official artifact URL not pinned';
}

function licenseReference(entry: RuntimePackView['entry']): string {
  return entry.license.url ?? entry.license.officialReference ?? 'License URL not pinned';
}

function statusLabel(status: RuntimePackStatus): string {
  return status === 'NeedsReview' ? 'Needs review' : status;
}

function statusIcon(status: RuntimePackStatus): React.ReactNode {
  if (status === 'Ready' || status === 'Installed') return <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
  if (status === 'Missing') return <CircleDashed className="h-4 w-4 text-slate-500" aria-hidden="true" />;
  if (ACTIVE_JOB_STATUSES.includes(status)) return <LoaderCircle className="h-4 w-4 animate-spin text-amber-300 motion-reduce:animate-none" aria-hidden="true" />;
  if (status === 'Failed' || status === 'Blocked' || status === 'NeedsReview') return <ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden="true" />;
  if (status === 'Cancelled') return <X className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  return <Info className="h-4 w-4 text-slate-400" aria-hidden="true" />;
}

function statusClasses(status: RuntimePackStatus): string {
  if (status === 'Ready' || status === 'Installed') return 'border-emerald-700/70 bg-emerald-950/40 text-emerald-200';
  if (status === 'Missing') return 'border-slate-700 bg-slate-950 text-slate-300';
  if (status === 'Failed' || status === 'Blocked' || status === 'NeedsReview') return 'border-amber-700/70 bg-amber-950/40 text-amber-200';
  if (status === 'Cancelled') return 'border-slate-700 bg-slate-900 text-slate-300';
  return 'border-indigo-700/70 bg-indigo-950/40 text-indigo-200';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ProgressIndicator({ progress }: { progress: NonNullable<RuntimePackView['progress']> }): React.ReactNode {
  if (progress.totalBytes === undefined) {
    return (
      <div className="mt-3 rounded border border-indigo-800/70 bg-indigo-950/30 px-3 py-2 text-[11px] text-indigo-200" role="status" aria-live="polite">
        Downloading; server did not provide a content length. No percentage is estimated.
      </div>
    );
  }

  const percentage = Math.min(100, Math.max(0, (progress.downloadedBytes / progress.totalBytes) * 100));
  return (
    <div className="mt-3" role="group" aria-label="Runtime download progress">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
        <span>Bytes received</span>
        <span className="font-mono">{formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={progress.totalBytes} aria-valuenow={progress.downloadedBytes} aria-label="Runtime download progress">
        <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

/**
 * Controlled panel. The no-props form is intentionally a blocked browser-shell view
 * until App/Header inject a native host snapshot and RuntimeManagerCallbacks.
 */
export const RuntimeManagerPanel: React.FC<RuntimeManagerPanelInput> = ({
  host = DEFAULT_HOST,
  activeRoot,
  packs = [],
  activeJob,
  busy = false,
  statusMessage,
  onCheckRuntime,
  pickerReady = false,
  pickerBlockedReason = 'Native directory and archive picker callbacks are unavailable.',
  onScanLocal = DEFAULT_CALLBACKS.onScanLocal,
  onChooseInstallPath = DEFAULT_CALLBACKS.onChooseInstallPath,
  onDownloadMissing = DEFAULT_CALLBACKS.onDownloadMissing,
  onImportArchive = DEFAULT_CALLBACKS.onImportArchive,
  onVerifyAll = DEFAULT_CALLBACKS.onVerifyAll,
  onRetryFailed = DEFAULT_CALLBACKS.onRetryFailed,
  onCancel = DEFAULT_CALLBACKS.onCancel,
  onOpenFolder = DEFAULT_CALLBACKS.onOpenFolder,
}) => {
  const [licenseDialogPurpose, setLicenseDialogPurpose] = useState<LicenseDialogPurpose | null>(null);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [actionMessage, setActionMessage] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const missingPacks = useMemo(() => packs.filter((pack) => pack.status === 'Missing'), [packs]);
  const failedPacks = useMemo(() => packs.filter((pack) => pack.status === 'Failed'), [packs]);
  const reviewPacks = useMemo(() => packs.filter((pack) => pack.status === 'NeedsReview'), [packs]);
  const verifiedCount = useMemo(() => packs.filter((pack) => pack.status === 'Ready' || pack.status === 'Installed').length, [packs]);
  const nativeReady = host.mode === 'native' && host.status === 'ready';
  const blockedReason = host.mode === 'browser'
    ? host.reason || BROWSER_RUNTIME_BLOCKED_REASON
    : host.reason || 'Tauri/Rust host is not ready.';
  const operationBusy = busy || (activeJob !== undefined && ACTIVE_JOB_STATUSES.includes(activeJob.status));
  const callbackConnected = {
    onScanLocal: onScanLocal !== DEFAULT_CALLBACKS.onScanLocal,
    onChooseInstallPath: onChooseInstallPath !== DEFAULT_CALLBACKS.onChooseInstallPath,
    onDownloadMissing: onDownloadMissing !== DEFAULT_CALLBACKS.onDownloadMissing,
    onImportArchive: onImportArchive !== DEFAULT_CALLBACKS.onImportArchive,
    onVerifyAll: onVerifyAll !== DEFAULT_CALLBACKS.onVerifyAll,
    onRetryFailed: onRetryFailed !== DEFAULT_CALLBACKS.onRetryFailed,
    onCancel: onCancel !== DEFAULT_CALLBACKS.onCancel,
    onOpenFolder: onOpenFolder !== DEFAULT_CALLBACKS.onOpenFolder,
  };

  useEffect(() => {
    if (!licenseDialogPurpose) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled])';
    const focusFirst = () => {
      const first = dialog?.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    };
    focusFirst();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLicenseDialogPurpose(null);
        setLicenseAccepted(false);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog?.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [licenseDialogPurpose]);

  const invokeAction = async (label: string, action: () => void | Promise<void>) => {
    setActionError(undefined);
    try {
      await action();
      setActionMessage(`${label} completed; native host returned control.`);
    } catch (error) {
      const message = getErrorMessage(error);
      setActionError(`${label} failed: ${message}`);
      setActionMessage(undefined);
    }
  };

  const actionState = (action: keyof RuntimeManagerCallbacks) => getRuntimeActionState(host, action);
  const disabledTitle = (action: keyof RuntimeManagerCallbacks, extra?: string) => {
    const state = actionState(action);
    if (!state.enabled) return state.reason;
    if (operationBusy) return 'Wait for the current native runtime operation to finish.';
    return extra;
  };

  const closeLicenseDialog = () => {
    setLicenseDialogPurpose(null);
    setLicenseAccepted(false);
  };

  const confirmLicenseAction = () => {
    if (!licenseAccepted) return;
    const purpose = licenseDialogPurpose;
    closeLicenseDialog();
    if (purpose === 'install') {
      void invokeAction('Runtime download and install', () => onDownloadMissing(missingPacks.map((pack) => pack.entry.id)));
    } else {
      void invokeAction('Runtime archive import', onImportArchive);
    }
  };

  const scanDisabled = !callbackConnected.onScanLocal || !actionState('onScanLocal').enabled || operationBusy;
  const chooseRootDisabled = !callbackConnected.onChooseInstallPath || !actionState('onChooseInstallPath').enabled || operationBusy;
  const importDisabled = !callbackConnected.onImportArchive || !actionState('onImportArchive').enabled || operationBusy;
  const verifyDisabled = !callbackConnected.onVerifyAll || !actionState('onVerifyAll').enabled || operationBusy || packs.length === 0;
  const checkDisabled = !actionState('onVerifyAll').enabled || operationBusy || packs.length === 0 || !onCheckRuntime;
  const retryDisabled = !callbackConnected.onRetryFailed || !actionState('onRetryFailed').enabled || operationBusy || failedPacks.length === 0;
  const downloadDisabled = !callbackConnected.onDownloadMissing || !actionState('onDownloadMissing').enabled || operationBusy || missingPacks.length === 0;
  const cancelDisabled = !callbackConnected.onCancel || !activeJob || !ACTIVE_JOB_STATUSES.includes(activeJob.status) || !actionState('onCancel').enabled;
  const openFolderDisabled = !callbackConnected.onOpenFolder || !actionState('onOpenFolder').enabled || operationBusy || !activeRoot;
  const chooseRootTitle = !callbackConnected.onChooseInstallPath
    ? 'Install path handler is not connected.'
    : disabledTitle('onChooseInstallPath', pickerReady ? 'Choose a writable local runtime root through the native picker.' : pickerBlockedReason);
  const importTitle = !callbackConnected.onImportArchive
    ? 'Archive import handler is not connected.'
    : disabledTitle('onImportArchive', pickerReady ? 'Choose a local runtime archive through the native picker.' : pickerBlockedReason);
  const checkTitle = disabledTitle('onVerifyAll', onCheckRuntime ? 'Check installed runtime health through the native host.' : 'Native runtime check callback is not connected.');
  const dialogEntries = licenseDialogPurpose === 'install' ? missingPacks : [];

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-slate-950/60 text-xs text-slate-200" aria-labelledby="runtime-manager-heading" aria-busy={operationBusy}>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <PackageCheck className="mt-0.5 h-6 w-6 shrink-0 text-indigo-400" aria-hidden="true" />
          <div className="min-w-0">
            <h1 id="runtime-manager-heading" className="truncate text-base font-bold text-white">Runtime Manager</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-400">Install verified local packs once. Test execution stays offline after the selected runtime root is healthy.</p>
          </div>
        </div>
        <div className={`flex min-h-12 items-center gap-2 rounded border px-3 py-2 text-[11px] ${nativeReady ? 'border-emerald-700/70 bg-emerald-950/30 text-emerald-200' : 'border-amber-700/70 bg-amber-950/30 text-amber-200'}`} role={nativeReady ? 'status' : 'alert'} aria-live="polite">
          {nativeReady ? <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{nativeReady ? 'Native Tauri/Rust host ready' : blockedReason}</span>
        </div>
      </header>

      <section className="grid min-w-0 gap-3 border-b border-slate-800 bg-slate-900/70 p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Runtime summary">
        <div className="min-w-0 rounded border border-slate-800 bg-slate-950/80 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Active root</p>
          <p className="mt-2 break-all font-mono text-[11px] text-slate-200">{activeRoot?.path || 'No verified install root selected'}</p>
          {activeRoot && <p className="mt-1 text-[10px] text-slate-500">{activeRoot.writable ? 'Writable' : 'Read-only'} · {activeRoot.source}</p>}
        </div>
        <div className="min-w-0 rounded border border-slate-800 bg-slate-950/80 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Catalog</p>
          <p className="mt-2 text-sm font-semibold text-white">{packs.length} pack{packs.length === 1 ? '' : 's'}</p>
          <p className="mt-1 text-[10px] text-slate-500">Metadata comes from the bundled pinned catalog.</p>
        </div>
        <div className="min-w-0 rounded border border-slate-800 bg-slate-950/80 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Verified local</p>
          <p className="mt-2 text-sm font-semibold text-emerald-300">{verifiedCount} / {packs.length}</p>
          <p className="mt-1 text-[10px] text-slate-500">SHA, license, architecture, and health must pass.</p>
        </div>
        <div className="min-w-0 rounded border border-slate-800 bg-slate-950/80 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Install policy</p>
          <p className="mt-2 text-sm font-semibold text-indigo-200">Explicit action only</p>
          <p className="mt-1 text-[10px] text-slate-500">No startup download or cloud fallback.</p>
        </div>
      </section>

      <section className="flex min-w-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/80 p-4" aria-label="Runtime actions">
        <button type="button" onClick={() => void invokeAction('Local runtime scan', onScanLocal)} disabled={scanDisabled} title={disabledTitle('onScanLocal')} className="button-primary min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><ScanSearch className="h-4 w-4" aria-hidden="true" />Scan local</button>
        <button type="button" onClick={() => void invokeAction('Runtime health check', () => onCheckRuntime?.(packs.map((pack) => pack.entry.id)))} disabled={checkDisabled} title={checkTitle} className="button-muted min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Check runtime</button>
        <button type="button" onClick={() => void invokeAction('Install root selection', onChooseInstallPath)} disabled={chooseRootDisabled || !pickerReady} title={chooseRootTitle} className="button-muted min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><FolderOpen className="h-4 w-4" aria-hidden="true" />Choose install path</button>
        <button type="button" onClick={() => void invokeAction('Runtime folder open', onOpenFolder)} disabled={openFolderDisabled} title={disabledTitle('onOpenFolder', activeRoot ? 'Open the active runtime root.' : 'Scan and select a writable runtime root first.')} className="button-muted min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><FolderOpen className="h-4 w-4" aria-hidden="true" />Open folder</button>
        <button type="button" onClick={() => setLicenseDialogPurpose('import')} disabled={importDisabled || !pickerReady} title={importTitle} className="button-muted min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-4 w-4" aria-hidden="true" />Import archive</button>
        <button type="button" onClick={() => void invokeAction('Runtime verification', () => onVerifyAll(packs.map((pack) => pack.entry.id)))} disabled={verifyDisabled} title={disabledTitle('onVerifyAll', packs.length === 0 ? 'A catalog scan is required first.' : 'Verify every catalog pack in the selected roots.')} className="button-muted min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Verify all</button>
        <button type="button" onClick={() => void invokeAction('Retry failed runtime packs', () => onRetryFailed(failedPacks.map((pack) => pack.entry.id)))} disabled={retryDisabled} title={disabledTitle('onRetryFailed', failedPacks.length === 0 ? 'No failed pack is available for retry.' : 'Retry only packs with a recorded native failure.')} className="button-muted min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Retry failed</button>
        <button type="button" onClick={() => setLicenseDialogPurpose('install')} disabled={downloadDisabled} title={disabledTitle('onDownloadMissing', missingPacks.length === 0 ? 'All catalog packs have a verified local match.' : 'Review licenses, then explicitly download missing packs.')} className="button-execute min-h-12 bg-indigo-600 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" />Download all missing ({missingPacks.length})</button>
        {activeJob && (
          <button type="button" onClick={() => void invokeAction('Runtime cancellation', () => onCancel(activeJob.jobId))} disabled={cancelDisabled} title={cancelDisabled ? 'No cancellable native runtime job is active.' : 'Cancel the active native runtime job.'} className="button-muted min-h-12 border-rose-700/70 text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"><Square className="h-4 w-4 fill-current" aria-hidden="true" />Cancel</button>
        )}
      </section>

      {(statusMessage || actionMessage || actionError || reviewPacks.length > 0) && (
        <section className="space-y-2 border-b border-slate-800 bg-slate-950/80 px-4 py-3" aria-label="Runtime status messages">
          {(statusMessage || actionMessage) && <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-300" role="status" aria-live="polite"><Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />{statusMessage || actionMessage}</p>}
          {actionError && <p className="flex items-start gap-2 text-[11px] leading-5 text-rose-200" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />{actionError}</p>}
          {reviewPacks.length > 0 && <p className="flex items-start gap-2 text-[11px] leading-5 text-amber-200" role="alert"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />{reviewPacks.length} local pack{reviewPacks.length === 1 ? '' : 's'} differ from pinned metadata and will not be overwritten automatically.</p>}
        </section>
      )}

      {activeJob && (
        <section className="border-b border-slate-800 bg-indigo-950/20 px-4 py-3" aria-label="Active runtime job" role="status" aria-live="polite">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2"><LoaderCircle className={`h-4 w-4 shrink-0 text-indigo-300 ${ACTIVE_JOB_STATUSES.includes(activeJob.status) ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /><span className="font-semibold text-indigo-100">Native job {activeJob.jobId}</span></div>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClasses(activeJob.status)}`}>{statusLabel(activeJob.status)}</span>
          </div>
          {activeJob.reason && <p className="mt-2 text-[11px] text-slate-300">{activeJob.reason}</p>}
          {activeJob.progress && <ProgressIndicator progress={activeJob.progress} />}
        </section>
      )}

      <section className="min-w-0 flex-1 p-4" aria-labelledby="runtime-pack-list-heading">
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2"><PackageCheck className="h-5 w-5 shrink-0 text-indigo-400" aria-hidden="true" /><h2 id="runtime-pack-list-heading" className="truncate text-sm font-semibold text-slate-200">Runtime catalog</h2></div>
          <span className="text-[10px] text-slate-500">{missingPacks.length} missing · {reviewPacks.length} review · {verifiedCount} ready</span>
        </div>
        {packs.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 p-6 text-center" role="status">
            <AlertTriangle className="mb-2 h-8 w-8 text-amber-300" aria-hidden="true" />
            <p className="font-semibold text-slate-300">No runtime catalog entries loaded</p>
            <p className="mt-1 max-w-md text-[11px] leading-5 text-slate-500">Use the native Tauri/Rust host to load the bundled pinned catalog. Empty state does not imply runtimes are installed.</p>
          </div>
        ) : (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-3" role="list" aria-label="Runtime packs">
            {packs.map((pack) => (
              <li key={`${pack.entry.id}@${pack.entry.version}`} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-white">{pack.entry.id}</h3>
                    <p className="mt-1 break-words font-mono text-[10px] text-slate-500">{pack.entry.category} · v{pack.entry.version ?? 'unresolved'} · {pack.entry.architecture}</p>
                  </div>
                  <span className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClasses(pack.status)}`} aria-label={`Status ${statusLabel(pack.status)}`}>{statusIcon(pack.status)}{statusLabel(pack.status)}</span>
                </div>
                <dl className="mt-4 grid min-w-0 gap-2 text-[10px] sm:grid-cols-2">
                  <div className="min-w-0"><dt className="text-slate-500">Source host</dt><dd className="mt-1 break-all font-mono text-slate-300">{sourceHost(pack.entry)}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">License</dt><dd className="mt-1 break-words text-slate-300">{licenseLabel(pack.entry)}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">Pinned SHA-256</dt><dd className="mt-1 break-all font-mono text-slate-300">{sourceDigest(pack.entry)}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">Artifact size</dt><dd className="mt-1 font-mono text-slate-300">{sourceSize(pack.entry)}</dd></div>
                </dl>
                {(pack.reason ?? pack.entry.reviewReason) && <p className="mt-4 break-words text-[11px] leading-5 text-slate-400">{pack.reason ?? pack.entry.reviewReason}</p>}
                {pack.progress && <ProgressIndicator progress={pack.progress} />}
                <p className="mt-4 flex min-w-0 items-start gap-2 text-[10px] leading-4 text-slate-500"><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-all">{sourceReference(pack.entry)}</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {licenseDialogPurpose && (
        <div className="dialog-backdrop" role="presentation">
          <div ref={dialogRef} className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="runtime-license-heading" aria-describedby="runtime-license-description">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" aria-hidden="true" /><div className="min-w-0"><h2 id="runtime-license-heading" className="text-sm font-bold text-white">Accept runtime licenses</h2><p id="runtime-license-description" className="mt-1 text-[11px] leading-5 text-slate-400">Native host will validate SHA-256, license metadata, executable paths, and health before marking a pack ready.</p></div></div>
              <button type="button" onClick={closeLicenseDialog} className="min-h-12 min-w-12 rounded text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" aria-label="Close license dialog" title="Close license dialog"><X className="mx-auto h-4 w-4" aria-hidden="true" /></button>
            </div>
            {licenseDialogPurpose === 'install' ? (
              <ul className="mt-4 max-h-48 space-y-2 overflow-auto rounded border border-slate-800 bg-slate-950 p-3" aria-label="Licenses for missing runtime packs">
                {dialogEntries.map((pack) => <li key={pack.entry.id} className="min-w-0 text-[11px] text-slate-300"><span className="font-semibold text-white">{pack.entry.id}</span><span className="text-slate-500"> · {licenseLabel(pack.entry)} · </span><span className="break-all font-mono text-[10px] text-slate-500">{licenseReference(pack.entry)}</span></li>)}
              </ul>
            ) : (
              <p className="mt-4 rounded border border-slate-800 bg-slate-950 p-3 text-[11px] leading-5 text-slate-300">The selected archive license is not trusted until the native host reads and verifies its manifest. Import remains blocked if metadata, SHA-256, architecture, or health checks fail.</p>
            )}
            <label className="mt-4 flex min-h-12 items-start gap-3 rounded border border-slate-800 bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">
              <input type="checkbox" checked={licenseAccepted} onChange={(event) => setLicenseAccepted(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-indigo-500" />
              <span>I accept the licenses declared for this runtime operation and understand that verification must still pass.</span>
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeLicenseDialog} className="button-muted min-h-12">Cancel</button>
              <button type="button" onClick={confirmLicenseAction} disabled={!licenseAccepted} className="button-primary min-h-12 disabled:cursor-not-allowed disabled:opacity-50" title={licenseAccepted ? 'Confirm license acceptance and continue.' : 'Accept the listed licenses to continue.'}>{licenseDialogPurpose === 'install' ? <Download className="h-4 w-4" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}{licenseDialogPurpose === 'install' ? 'Install missing packs' : 'Import archive'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};


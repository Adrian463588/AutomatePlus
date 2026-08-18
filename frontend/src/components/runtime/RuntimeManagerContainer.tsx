import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RuntimeManagerPanel } from './RuntimeManagerPanel.js';
import {
  buildRuntimePackViews,
  type RuntimeCatalogEntry,
  type RuntimeJobState,
  type RuntimeManagerHostState,
  type RuntimePackView,
  type RuntimeRootSnapshot,
  type RuntimeInstalledPack,
} from '../../services/runtimeManager.js';
import { bridge } from '../../services/desktopBridge.js';

const TERMINAL_JOB_STATUSES = new Set(['Installed', 'Cancelled', 'Failed', 'Blocked', 'NeedsReview', 'Ready']);
const PICKER_BLOCKED_REASON = 'Native directory and archive picker callbacks are unavailable.';

export interface RuntimeNativePickerCallbacks {
  chooseInstallPath: () => Promise<string | null>;
  chooseArchivePath: () => Promise<string | null>;
}

export interface RuntimeManagerContainerProps {
  nativePickers?: RuntimeNativePickerCallbacks;
}

type RuntimeHealthEvidence = {
  status: 'ready' | 'failed' | 'unknown';
  reason?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export const RuntimeManagerContainer: React.FC<RuntimeManagerContainerProps> = ({ nativePickers }) => {
  const [host, setHost] = useState<RuntimeManagerHostState>(() => bridge.getRuntimeHostState());
  const [entries, setEntries] = useState<RuntimeCatalogEntry[]>([]);
  const [roots, setRoots] = useState<RuntimeRootSnapshot[]>([]);
  const [activeRoot, setActiveRoot] = useState<RuntimeRootSnapshot>();
  const [activeJob, setActiveJob] = useState<RuntimeJobState>();
  const [healthEvidence, setHealthEvidence] = useState<Record<string, RuntimeHealthEvidence>>({});
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(() => {
    const initialHost = bridge.getRuntimeHostState();
    return initialHost.mode === 'native'
      ? 'Runtime Manager has not scanned the local roots yet.'
      : initialHost.reason ?? 'Runtime Manager is blocked in browser mode.';
  });
  const managerRef = useRef(bridge.getRuntimeManager());

  const installedPacks = useMemo<RuntimeInstalledPack[]>(
    () => roots.flatMap((root) => root.installedPacks),
    [roots],
  );
  const packs = useMemo<RuntimePackView[]>(
    () => buildRuntimePackViews(entries, installedPacks, activeJob ? [activeJob] : []).map((pack) => {
      const health = healthEvidence[pack.entry.id];
      if (!health || activeJob?.packIds.includes(pack.entry.id)) return pack;
      if (health.status === 'failed') {
        return { ...pack, status: 'Failed' as const, reason: health.reason ?? 'Native runtime health check failed.' };
      }
      if (health.status === 'unknown') {
        return { ...pack, status: 'NeedsReview' as const, reason: health.reason ?? 'Native runtime health is unknown.' };
      }
      if (pack.status === 'Ready' || pack.status === 'Installed') {
        return { ...pack, status: 'Ready' as const, reason: 'Native runtime health check passed.' };
      }
      return pack;
    }),
    [entries, installedPacks, activeJob, healthEvidence],
  );

  const applyRoots = useCallback((response: { roots: readonly RuntimeRootSnapshot[]; activeRoot?: RuntimeRootSnapshot }) => {
    const nextRoots = [...response.roots];
    setRoots(nextRoots);
    setActiveRoot(response.activeRoot ?? nextRoots.find((root) => root.selected));
  }, []);

  const scanLocal = useCallback(async () => {
    setBusy(true);
    setHealthEvidence({});
    setStatusMessage('Scanning configured, workspace, local-app-data, program-data, and bundled roots…');
    try {
      const response = await managerRef.current.scanRoots();
      applyRoots(response);
      setStatusMessage('Local runtime scan completed from verified manifest evidence.');
    } catch (error) {
      setStatusMessage(`Local runtime scan blocked: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }, [applyRoots]);

  const loadCatalog = useCallback(async () => {
    const currentHost = bridge.getRuntimeHostState();
    setHost(currentHost);
    if (currentHost.mode !== 'native') return;
    try {
      const response = await managerRef.current.catalogList();
      setEntries([...response.entries]);
    } catch (error) {
      setStatusMessage(`Runtime catalog blocked: ${errorMessage(error)}`);
    }
  }, []);

  useEffect(() => {
    const currentHost = bridge.getRuntimeHostState();
    setHost(currentHost);
    if (currentHost.mode !== 'native') {
      setStatusMessage(currentHost.reason ?? 'Runtime Manager is blocked in browser mode.');
      return;
    }
    void loadCatalog().then(() => scanLocal());
  }, [loadCatalog, scanLocal]);

  const waitForJob = useCallback(async (job: RuntimeJobState): Promise<void> => {
    setActiveJob(job);
    if (TERMINAL_JOB_STATUSES.has(job.status)) return;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await wait(500);
      const response = await managerRef.current.installStatus(job.jobId);
      setActiveJob(response.job);
      if (TERMINAL_JOB_STATUSES.has(response.job.status)) return;
    }
    setStatusMessage('Native runtime job is still active; polling stopped without fabricating completion.');
  }, []);

  const startInstall = useCallback(async (packIds: readonly string[]) => {
    setBusy(true);
    setStatusMessage(`Starting explicit download for ${packIds.length} missing runtime pack(s)…`);
    try {
      const response = await managerRef.current.installStart({ packIds, licenseAccepted: true });
      await waitForJob(response.job);
      await scanLocal();
    } finally {
      setBusy(false);
    }
  }, [scanLocal, waitForJob]);

  const chooseInstallPath = useCallback(async () => {
    if (!nativePickers) {
      setStatusMessage(`Install path selection blocked: ${PICKER_BLOCKED_REASON}`);
      return;
    }
    const path = await nativePickers.chooseInstallPath();
    if (!path?.trim()) {
      setStatusMessage('Install path selection cancelled; existing roots were not changed.');
      return;
    }
    setBusy(true);
    try {
      const response = await managerRef.current.selectRoot(path.trim());
      applyRoots(response);
      setStatusMessage(`Selected runtime root: ${path.trim()}`);
    } finally {
      setBusy(false);
    }
  }, [applyRoots, nativePickers]);

  const importArchive = useCallback(async () => {
    if (!nativePickers) {
      setStatusMessage(`Archive import blocked: ${PICKER_BLOCKED_REASON}`);
      return;
    }
    const archivePath = await nativePickers.chooseArchivePath();
    if (!archivePath?.trim()) {
      setStatusMessage('Archive import cancelled; no local file was changed.');
      return;
    }
    setBusy(true);
    try {
      const response = await managerRef.current.importArchive(archivePath.trim(), true);
      setStatusMessage(`Imported ${response.imported.length} verified pack(s); ${response.needsReview.length} need review.`);
      await scanLocal();
    } finally {
      setBusy(false);
    }
  }, [nativePickers, scanLocal]);

  const verifyAll = useCallback(async () => {
    setBusy(true);
    try {
      const response = await managerRef.current.verifyAll();
      setStatusMessage(`Verification completed for ${response.packs.length} local pack record(s).`);
      await scanLocal();
    } finally {
      setBusy(false);
    }
  }, [scanLocal]);

  const checkRuntime = useCallback(async () => {
    setBusy(true);
    setStatusMessage('Checking installed runtime health with native evidence…');
    try {
      const catalog = await managerRef.current.catalogList();
      const rootsResponse = await managerRef.current.scanRoots();
      const verification = await managerRef.current.verifyAll();
      const response = await managerRef.current.health();
      setEntries([...catalog.entries]);
      applyRoots(rootsResponse);
      const nextEvidence = Object.fromEntries(response.packs.map((pack) => [pack.id, { status: pack.status, reason: pack.reason }]));
      setHealthEvidence(nextEvidence);
      const readyCount = response.packs.filter((pack) => pack.status === 'ready').length;
      const attentionCount = response.packs.length - readyCount;
      setStatusMessage(`Runtime check completed from native evidence: ${catalog.entries.length} catalog entries, ${verification.packs.length} local records, ${readyCount} ready, ${attentionCount} need attention.`);
    } finally {
      setBusy(false);
    }
  }, [applyRoots]);

  const retryFailed = useCallback(async (packIds: readonly string[]) => startInstall(packIds), [startInstall]);

  const cancel = useCallback(async (jobId: string) => {
    setBusy(true);
    try {
      const response = await managerRef.current.cancel(jobId);
      setActiveJob(response.job);
      setStatusMessage('Runtime cancellation acknowledged by the native host.');
    } finally {
      setBusy(false);
    }
  }, []);

  const openFolder = useCallback(async () => {
    if (!activeRoot) throw new Error('Scan and select a runtime root before opening its folder.');
    await managerRef.current.openFolder(activeRoot.path);
  }, [activeRoot]);

  return (
    <RuntimeManagerPanel
      host={host}
      activeRoot={activeRoot}
      packs={packs}
      activeJob={activeJob}
      busy={busy}
      statusMessage={statusMessage}
      pickerReady={Boolean(nativePickers)}
      pickerBlockedReason={PICKER_BLOCKED_REASON}
      onScanLocal={scanLocal}
      onChooseInstallPath={chooseInstallPath}
      onDownloadMissing={(packIds) => startInstall(packIds)}
      onImportArchive={importArchive}
      onVerifyAll={() => verifyAll()}
      onCheckRuntime={() => checkRuntime()}
      onRetryFailed={retryFailed}
      onCancel={cancel}
      onOpenFolder={openFolder}
    />
  );
};

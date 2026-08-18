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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export const RuntimeManagerContainer: React.FC = () => {
  const [host, setHost] = useState<RuntimeManagerHostState>(() => bridge.getRuntimeHostState());
  const [entries, setEntries] = useState<RuntimeCatalogEntry[]>([]);
  const [roots, setRoots] = useState<RuntimeRootSnapshot[]>([]);
  const [activeRoot, setActiveRoot] = useState<RuntimeRootSnapshot>();
  const [activeJob, setActiveJob] = useState<RuntimeJobState>();
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Runtime Manager has not scanned the local roots yet.');
  const managerRef = useRef(bridge.getRuntimeManager());

  const installedPacks = useMemo<RuntimeInstalledPack[]>(
    () => roots.flatMap((root) => root.installedPacks),
    [roots],
  );
  const packs = useMemo<RuntimePackView[]>(
    () => buildRuntimePackViews(entries, installedPacks, activeJob ? [activeJob] : []),
    [entries, installedPacks, activeJob],
  );

  const applyRoots = useCallback((response: { roots: readonly RuntimeRootSnapshot[]; activeRoot?: RuntimeRootSnapshot }) => {
    const nextRoots = [...response.roots];
    setRoots(nextRoots);
    setActiveRoot(response.activeRoot ?? nextRoots.find((root) => root.selected));
  }, []);

  const scanLocal = useCallback(async () => {
    setBusy(true);
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
    setHost(bridge.getRuntimeHostState());
    if (bridge.getRuntimeHostState().mode !== 'native') return;
    try {
      const response = await managerRef.current.catalogList();
      setEntries([...response.entries]);
    } catch (error) {
      setStatusMessage(`Runtime catalog blocked: ${errorMessage(error)}`);
    }
  }, []);

  useEffect(() => {
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
    const path = window.prompt('Enter a writable local runtime-pack directory. No network action occurs here.');
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
  }, [applyRoots]);

  const importArchive = useCallback(async () => {
    const archivePath = window.prompt('Enter the full path to a local runtime archive or manifest package.');
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
  }, [scanLocal]);

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
      onScanLocal={scanLocal}
      onChooseInstallPath={chooseInstallPath}
      onDownloadMissing={(packIds) => startInstall(packIds)}
      onImportArchive={importArchive}
      onVerifyAll={() => verifyAll()}
      onRetryFailed={retryFailed}
      onCancel={cancel}
      onOpenFolder={openFolder}
    />
  );
};

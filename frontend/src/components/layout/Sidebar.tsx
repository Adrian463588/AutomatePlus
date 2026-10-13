import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import { Globe, Smartphone, Server, SmartphoneNfc, CheckCircle2, XCircle, Clock, Plus, RefreshCw, X, FolderOpen, Loader2, Download, PackageCheck } from 'lucide-react';
import { NativeSetupGuide } from '../common/NativeSetupGuide.js';
import { FolderPickerModal } from '../workspace/FolderPickerModal.js';

type DialogKind = 'project' | 'session' | undefined;

export interface SidebarProps {
  onOpenReleasesModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenReleasesModal }) => {
  const { projects, activeProject, sessions, activeSession, selectProject, selectSession, createProject, createSession,
    devices, activeDevice, setActiveDevice, discoverDevices, deviceDiscoveryMessage, lastRunSummary,
    browseWorkspaceFolder, workspaceBrowse, runtimePreflight, checkRuntimePreflight, setActiveTab } = useAppStore();
  const [dialog, setDialog] = useState<DialogKind>();
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionPlatform, setSessionPlatform] = useState<'web' | 'android' | 'api'>('web');
  const [projectSubmitBusy, setProjectSubmitBusy] = useState(false);
  const [projectSubmitError, setProjectSubmitError] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => !element.hasAttribute('disabled'));
    getFocusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDialog(undefined);
      if (event.key !== 'Tab') return;
      const elements = getFocusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [dialog]);

  const closeDialog = () => {
    if (projectSubmitBusy) return;
    setDialog(undefined);
    setProjectSubmitError(undefined);
  };

  const openProjectDialog = () => {
    setProjectSubmitError(undefined);
    if (!workspacePath) {
      setWorkspacePath('D:\\SEMESTER12\\ProjectKode\\AutomatePlus');
    }
    setDialog('project');
  };

  const browseProjectWorkspace = () => {
    setIsFolderPickerOpen(true);
  };

  const submitProject = async () => {
    if (projectSubmitBusy || !projectName.trim() || !workspacePath.trim() || workspaceBrowse.status === 'busy') return;
    setProjectSubmitBusy(true);
    setProjectSubmitError(undefined);
    try {
      const created = await createProject(projectName, workspacePath);
      if (created) {
        setProjectName('');
        setWorkspacePath('');
        setDialog(undefined);
      } else {
        setProjectSubmitError(useAppStore.getState().feedback.message);
      }
    } finally {
      setProjectSubmitBusy(false);
    }
  };
  const projectFormReady = projectName.trim().length > 0 && workspacePath.trim().length > 0 && !projectSubmitBusy && workspaceBrowse.status !== 'busy';
  const projectFormHint = projectSubmitBusy
    ? 'Saving the project locally…'
    : workspaceBrowse.status === 'busy'
      ? 'Selecting a workspace folder…'
      : !projectName.trim()
        ? 'Enter a project name to continue.'
        : !workspacePath.trim()
          ? 'Choose or enter a local workspace path to continue.'
          : undefined;
  const submitSession = async () => {
    await createSession(sessionName, sessionPlatform);
    if (sessionName.trim() && activeProject) { setSessionName(''); closeDialog(); }
  };

  return (
    <aside className="sidebar-panel bg-slate-900 border-r border-slate-800 flex flex-col text-xs">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        <section aria-labelledby="workspace-heading" className="flex flex-col gap-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span id="workspace-heading">Workspace</span><span className="text-slate-400 font-mono">Local only</span>
          </div>
          <div className="flex gap-2">
            <select id="project-selector" name="project" aria-label="Select project" value={activeProject?.id ?? ''} onChange={(event) => void selectProject(event.target.value)} className="ap-select min-w-0 flex-1 text-xs font-medium">
              <option value="">No project selected</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button type="button" onClick={openProjectDialog} className="shrink-0 p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md border border-slate-800 min-h-12 min-w-12 flex items-center justify-center tactile-active" aria-label="Create project" title="Create project"><Plus className="w-4 h-4" /></button>
          </div>
        </section>

        <section aria-labelledby="runtime-preflight-heading" className="flex flex-col gap-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span id="runtime-preflight-heading">Runtime preflight</span><Server className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="ap-bento-card p-3 flex flex-col gap-2.5">
            <div className="flex items-start gap-2 text-slate-400 leading-5" role="status" aria-live="polite" aria-busy={runtimePreflight.status === 'busy'}>
              <span className={`mt-1 h-2 w-2 rounded shrink-0 ${runtimePreflight.status === 'ready' ? 'bg-emerald-400' : runtimePreflight.status === 'busy' ? 'bg-sky-400' : runtimePreflight.status === 'error' ? 'bg-rose-400' : 'bg-amber-400'}`} />
              <span>{runtimePreflight.message}</span>
            </div>
            {runtimePreflight.summary && <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500">
              {runtimePreflight.summary.catalogEntryCount !== undefined && <span>Catalog: {runtimePreflight.summary.catalogEntryCount}</span>}
              {runtimePreflight.summary.rootCount !== undefined && <span>Roots: {runtimePreflight.summary.rootCount}</span>}
              {runtimePreflight.summary.writableRootCount !== undefined && <span>Writable: {runtimePreflight.summary.writableRootCount}</span>}
              {runtimePreflight.summary.installedPackCount !== undefined && <span>Installed: {runtimePreflight.summary.installedPackCount}</span>}
              {runtimePreflight.summary.healthyPackCount !== undefined && <span>Healthy: {runtimePreflight.summary.healthyPackCount}</span>}
              {runtimePreflight.summary.healthIssueCount !== undefined && <span>Health issues: {runtimePreflight.summary.healthIssueCount}</span>}
              {runtimePreflight.summary.catalogNeedsReviewCount !== undefined && runtimePreflight.summary.catalogNeedsReviewCount > 0 && <span>Needs review: {runtimePreflight.summary.catalogNeedsReviewCount}</span>}
            </div>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void checkRuntimePreflight()} disabled={!runtimePreflight.canCheck || runtimePreflight.status === 'busy'} aria-busy={runtimePreflight.status === 'busy'} title={!runtimePreflight.canCheck ? runtimePreflight.message : 'Check the native runtime catalog, roots, and health.'} className="flex min-h-12 items-center gap-1.5 px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-700 disabled:cursor-not-allowed disabled:opacity-50 tactile-active">
                {runtimePreflight.status === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {runtimePreflight.status === 'busy' ? 'Checking runtime…' : 'Check runtime'}
              </button>
              <button type="button" onClick={() => setActiveTab('runtime')} title="Open Runtime Manager to review or download missing packs." className="flex min-h-12 items-center gap-1.5 px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-700 tactile-active">
                <PackageCheck className="w-3.5 h-3.5" /> Open Runtime Manager
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('runtime');
                  useAppStore.getState().setFeedback({
                    kind: 'pending',
                    message: 'Switched to Runtime Manager. Review and accept licenses to download offline packs.',
                  });
                }}
                title="Open Runtime Manager; license acceptance and native verification are required before downloading missing packs."
                className="flex min-h-12 items-center gap-1.5 px-2.5 py-1.5 text-cyan-200 hover:text-white hover:bg-cyan-900/50 rounded border border-cyan-700/70 tactile-active"
              >
                <Download className="w-3.5 h-3.5" /> Download missing
              </button>
            </div>
            {!runtimePreflight.canCheck && <NativeSetupGuide compact />}
          </div>
        </section>

        <section aria-labelledby="sessions-heading" className="flex flex-col gap-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span id="sessions-heading">Test Sessions ({sessions.length})</span>
            <button type="button" disabled={!activeProject} onClick={() => setDialog('session')} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-40 min-h-8 min-w-8 flex items-center justify-center tactile-active" aria-label="Create session" title={activeProject ? 'Create session in active project' : 'Create a project first'}><Plus className="w-3.5 h-3.5" /></button>
          </div>
          {sessions.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-800 p-3 text-slate-500 leading-5 flex flex-col gap-2">
              <p>No session exists. Create one, then provide its real target.</p>
              <button
                type="button"
                id="sidebar-create-session-empty-btn"
                disabled={!activeProject}
                onClick={() => setDialog('session')}
                title={activeProject ? 'Create a new test session' : 'Create or select a project first'}
                className="w-full flex min-h-12 items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium text-cyan-200 hover:text-white bg-cyan-950 hover:bg-cyan-900 rounded border border-cyan-800/60 disabled:opacity-40 disabled:cursor-not-allowed tactile-active"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" /> Create session
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">{sessions.map((session) => <button key={session.id} type="button" onClick={() => void selectSession(session.id)} aria-pressed={activeSession?.id === session.id} className={`w-full flex min-h-12 items-center justify-between p-2.5 rounded-md text-left border tactile-active ${activeSession?.id === session.id ? 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40' : 'text-slate-300 hover:bg-slate-800/60 border-transparent'}`}>
              <span className="flex items-center gap-2 truncate">{session.platform === 'web' && <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />}{session.platform === 'android' && <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}{session.platform === 'api' && <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" />}<span className="truncate font-medium">{session.name}</span></span>
              <span className="text-[10px] font-mono text-slate-500">{session.ir.steps.length} steps</span>
            </button>)}</div>
          )}
        </section>

        <section aria-labelledby="devices-heading" className="flex flex-col gap-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between"><span id="devices-heading">Android preflight</span><SmartphoneNfc className="w-3.5 h-3.5 text-slate-500" /></div>
          <div className="ap-bento-card p-3 flex flex-col gap-2.5">
            <div className="flex items-start gap-2 text-slate-500 leading-5"><span className="mt-1 h-2 w-2 rounded bg-slate-600 shrink-0" /> <span>{deviceDiscoveryMessage}</span></div>
            <button type="button" onClick={() => void discoverDevices()} title="Scan for connected Android devices via ADB" className="flex min-h-12 items-center gap-1.5 px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-700 tactile-active"><RefreshCw className="w-3.5 h-3.5" /> Check devices</button>
            {devices.length > 0 && <select aria-label="Select Android device" value={activeDevice ?? ''} onChange={(event) => setActiveDevice(event.target.value)} className="ap-select w-full">{devices.map((device) => <option key={device.id} value={device.id}>{device.model || device.id} · {device.status}</option>)}</select>}
            {devices.map((device) => <div key={device.id} className="flex items-center justify-between text-[10px] font-mono"><span className={device.status === 'device' ? 'text-emerald-300' : 'text-amber-300'}>{device.status}</span><span className="text-slate-500">{device.id}</span></div>)}
          </div>
        </section>
      </div>

      <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex flex-col gap-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between"><span>Latest run</span><Clock className="w-3 h-3 text-slate-500" /></div>
        {lastRunSummary ? (
          <button
            type="button"
            onClick={() => {
              const terminal = document.querySelector('.terminal-panel');
              terminal?.scrollIntoView({ behavior: 'smooth' });
            }}
            title="Focus execution logs in the terminal"
            className="w-full flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 tactile-active text-left"
          >
            <span className="flex items-center gap-1.5 font-bold">
              {lastRunSummary.status === 'passed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
              {lastRunSummary.status.toUpperCase()}
            </span>
            <span className="text-[11px] font-mono text-slate-400">{lastRunSummary.passedSteps}/{lastRunSummary.totalSteps}</span>
          </button>
        ) : (
          <div className="text-slate-500 italic text-[11px] text-center py-1">No run evidence yet.</div>
        )}
        <button
          type="button"
          onClick={onOpenReleasesModal}
          title="Download AutomatePlus App (v1.7.0) & Historical Releases"
          className="flex min-h-9 items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-200 hover:text-white text-[11px] font-medium tactile-active"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Download App (v1.7.0)</span>
        </button>
      </div>

      {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
        <div ref={dialogRef} className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="sidebar-dialog-title">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h2 id="sidebar-dialog-title" className="text-sm font-bold text-white">{dialog === 'project' ? 'Create project' : 'Create session'}</h2>
            <button type="button" onClick={closeDialog} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 tactile-active" aria-label="Close dialog" title="Close dialog"><X className="w-4 h-4" /></button>
          </div>
          {dialog === 'project' ? (
            <form onSubmit={(event) => { event.preventDefault(); void submitProject(); }} aria-busy={projectSubmitBusy} className="pt-3 flex flex-col gap-3.5">
              <label htmlFor="project-name" className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
                <span>Project name</span>
                <input id="project-name" required disabled={projectSubmitBusy} value={projectName} onChange={(event) => setProjectName(event.target.value)} className="field w-full" />
              </label>
              <label htmlFor="workspace-path" className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
                <span>Workspace path</span>
                <div className="flex gap-2">
                  <input id="workspace-path" required disabled={projectSubmitBusy} title={workspacePath || 'Enter a local workspace path.'} aria-describedby="workspace-picker-status" value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} className="field min-w-0 flex-1 truncate" />
                  <button
                    ref={browseButtonRef}
                    type="button"
                    id="browse-workspace-folder-btn"
                    onClick={() => browseProjectWorkspace()}
                    disabled={projectSubmitBusy || workspaceBrowse.status === 'busy'}
                    aria-busy={workspaceBrowse.status === 'busy'}
                    aria-describedby="workspace-picker-status"
                    aria-label={workspaceBrowse.status === 'busy' ? 'Opening folder picker' : 'Browse workspace folder'}
                    title="Choose workspace folder via UI modal or directory presets."
                    className="button-muted min-h-12 shrink-0 px-3 disabled:cursor-not-allowed disabled:opacity-50 tactile-active"
                  >
                    {workspaceBrowse.status === 'busy' ? (
                      <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <FolderOpen className="w-4 h-4 text-cyan-400" />
                    )}
                  </button>
                </div>
              </label>
              {workspaceBrowse.message && <p id="workspace-picker-status" role="status" aria-live="polite" className="text-xs text-slate-400">{workspaceBrowse.message}</p>}
              {projectFormHint && <p id="project-form-hint" role="status" className="text-xs text-amber-200">{projectFormHint}</p>}
              {!workspaceBrowse.canBrowse && <NativeSetupGuide compact />}
              {projectSubmitError && <p role="alert" className="text-xs text-rose-300">{projectSubmitError}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={closeDialog} disabled={projectSubmitBusy} title={projectSubmitBusy ? 'Wait for the project save to finish.' : 'Cancel project creation'} className="button-muted disabled:cursor-not-allowed disabled:opacity-50 tactile-active">Cancel</button>
                <button type="submit" disabled={!projectFormReady} aria-describedby="project-form-hint" title={projectFormReady ? 'Create project in the selected local workspace.' : projectFormHint ?? 'Complete the project name and workspace path first.'} className="button-primary disabled:cursor-not-allowed disabled:opacity-50 tactile-active">{projectSubmitBusy ? 'Saving…' : 'Create project'}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void submitSession(); }} className="pt-3 flex flex-col gap-3.5">
              <label htmlFor="session-name" className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
                <span>Session name</span>
                <input id="session-name" required value={sessionName} onChange={(event) => setSessionName(event.target.value)} className="field w-full" />
              </label>
              <label htmlFor="session-platform" className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
                <span>Platform</span>
                <select id="session-platform" value={sessionPlatform} onChange={(event) => setSessionPlatform(event.target.value as 'web' | 'android' | 'api')} className="ap-select w-full">
                  <option value="web">Web</option>
                  <option value="android">Android</option>
                  <option value="api">API</option>
                </select>
              </label>
              <p className="text-xs text-slate-500">Targets, packages, URLs, secrets, and actions are entered explicitly after creation.</p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={closeDialog} title="Cancel session creation" className="button-muted tactile-active">Cancel</button>
                <button type="submit" disabled={!sessionName.trim() || !activeProject} title={!activeProject ? 'Select a project first' : sessionName.trim() ? 'Create session' : 'Enter a session name first'} className="button-primary disabled:opacity-50 disabled:cursor-not-allowed tactile-active">Create session</button>
              </div>
            </form>
          )}
        </div>
      </div>}

      {isFolderPickerOpen && (
        <FolderPickerModal
          isOpen={isFolderPickerOpen}
          onClose={() => {
            setIsFolderPickerOpen(false);
            browseButtonRef.current?.focus();
          }}
          onSelect={(selectedPath) => {
            setWorkspacePath(selectedPath);
            setIsFolderPickerOpen(false);
            browseButtonRef.current?.focus();
          }}
          initialPath={workspacePath || 'D:\\SEMESTER12\\ProjectKode\\AutomatePlus'}
          onOpenReleasesModal={onOpenReleasesModal}
        />
      )}
    </aside>
  );
};

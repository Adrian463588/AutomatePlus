import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import { Globe, Smartphone, Server, SmartphoneNfc, CheckCircle2, XCircle, Clock, Plus, RefreshCw, X, FolderOpen, Loader2, Download, PackageCheck } from 'lucide-react';

type DialogKind = 'project' | 'session' | undefined;

export const Sidebar: React.FC = () => {
  const { projects, activeProject, sessions, activeSession, selectProject, selectSession, createProject, createSession,
    devices, activeDevice, setActiveDevice, discoverDevices, deviceDiscoveryMessage, lastRunSummary,
    browseWorkspaceFolder, workspaceBrowse, runtimePreflight, checkRuntimePreflight, setActiveTab } = useAppStore();
  const [dialog, setDialog] = useState<DialogKind>();
  const [projectName, setProjectName] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionPlatform, setSessionPlatform] = useState<'web' | 'android' | 'api'>('web');
  const [projectSubmitBusy, setProjectSubmitBusy] = useState(false);
  const [projectSubmitError, setProjectSubmitError] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);

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
    setDialog('project');
  };

  const browseProjectWorkspace = async () => {
    const selectedPath = await browseWorkspaceFolder();
    if (selectedPath) setWorkspacePath(selectedPath);
  };

  const submitProject = async () => {
    if (projectSubmitBusy) return;
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
  const submitSession = async () => {
    await createSession(sessionName, sessionPlatform);
    if (sessionName.trim() && activeProject) { setSessionName(''); closeDialog(); }
  };

  return (
    <aside className="sidebar-panel bg-slate-900 border-r border-slate-800 flex flex-col text-xs">
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <section aria-labelledby="workspace-heading">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span id="workspace-heading">Workspace</span><span className="text-slate-500 font-mono">Local only</span>
          </div>
          <div className="flex gap-2">
            <select aria-label="Select project" value={activeProject?.id ?? ''} onChange={(event) => void selectProject(event.target.value)} className="min-w-0 flex-1 bg-slate-950 text-slate-200 border border-slate-800 rounded-md py-2 px-2.5 text-xs font-medium focus:outline-none focus:border-indigo-500">
              <option value="">No project selected</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button type="button" onClick={openProjectDialog} className="shrink-0 p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md border border-slate-800" aria-label="Create project" title="Create project"><Plus className="w-4 h-4" /></button>
          </div>
        </section>

        <section aria-labelledby="runtime-preflight-heading">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span id="runtime-preflight-heading">Runtime preflight</span><Server className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-start gap-2 text-slate-500 leading-5" role="status" aria-live="polite" aria-busy={runtimePreflight.status === 'busy'}>
              <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${runtimePreflight.status === 'ready' ? 'bg-emerald-400' : runtimePreflight.status === 'busy' ? 'bg-sky-400' : runtimePreflight.status === 'error' ? 'bg-rose-400' : 'bg-amber-400'}`} />
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
              <button type="button" onClick={() => void checkRuntimePreflight()} disabled={!runtimePreflight.canCheck || runtimePreflight.status === 'busy'} aria-busy={runtimePreflight.status === 'busy'} title={!runtimePreflight.canCheck ? runtimePreflight.message : 'Check the native runtime catalog, roots, and health.'} className="flex min-h-12 items-center gap-1.5 px-2 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                {runtimePreflight.status === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {runtimePreflight.status === 'busy' ? 'Checking runtime…' : 'Check runtime'}
              </button>
              <button type="button" onClick={() => setActiveTab('runtime')} title="Open Runtime Manager to review or download missing packs." className="flex min-h-12 items-center gap-1.5 px-2 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-700">
                <PackageCheck className="w-3.5 h-3.5" /> Open Runtime Manager
              </button>
              <button type="button" onClick={() => setActiveTab('runtime')} title="Open Runtime Manager; license acceptance and native verification are required before downloading missing packs." className="flex min-h-12 items-center gap-1.5 px-2 py-1.5 text-indigo-200 hover:text-white hover:bg-indigo-900/50 rounded border border-indigo-700/70">
                <Download className="w-3.5 h-3.5" /> Download missing
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="sessions-heading">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span id="sessions-heading">Test Sessions ({sessions.length})</span>
            <button type="button" disabled={!activeProject} onClick={() => setDialog('session')} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-40" aria-label="Create session" title={activeProject ? 'Create session' : 'Create a project first'}><Plus className="w-3.5 h-3.5" /></button>
          </div>
          {sessions.length === 0 ? <p className="rounded-md border border-dashed border-slate-800 p-3 text-slate-500 leading-5">No session exists. Create one, then provide its real target.</p> :
            <div className="space-y-1">{sessions.map((session) => <button key={session.id} type="button" onClick={() => void selectSession(session.id)} aria-pressed={activeSession?.id === session.id} className={`w-full flex items-center justify-between p-2.5 rounded-md text-left border ${activeSession?.id === session.id ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/40' : 'text-slate-300 hover:bg-slate-800/60 border-transparent'}`}>
              <span className="flex items-center gap-2 truncate">{session.platform === 'web' && <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />}{session.platform === 'android' && <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}{session.platform === 'api' && <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" />}<span className="truncate font-medium">{session.name}</span></span>
              <span className="text-[10px] font-mono text-slate-500">{session.ir.steps.length} steps</span>
            </button>)}</div>}
        </section>

        <section aria-labelledby="devices-heading">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between"><span id="devices-heading">Android preflight</span><SmartphoneNfc className="w-3.5 h-3.5 text-slate-500" /></div>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-start gap-2 text-slate-500 leading-5"><span className="mt-1 h-2 w-2 rounded-full bg-slate-600 shrink-0" /> <span>{deviceDiscoveryMessage}</span></div>
            <button type="button" onClick={() => void discoverDevices()} className="flex items-center gap-1.5 px-2 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-700"><RefreshCw className="w-3.5 h-3.5" /> Check devices</button>
            {devices.length > 0 && <select aria-label="Select Android device" value={activeDevice ?? ''} onChange={(event) => setActiveDevice(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200">{devices.map((device) => <option key={device.id} value={device.id}>{device.model || device.id} · {device.status}</option>)}</select>}
            {devices.map((device) => <div key={device.id} className="flex items-center justify-between text-[10px] font-mono"><span className={device.status === 'device' ? 'text-emerald-300' : 'text-amber-300'}>{device.status}</span><span className="text-slate-500">{device.id}</span></div>)}
          </div>
        </section>
      </div>

      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between"><span>Latest run</span><Clock className="w-3 h-3 text-slate-500" /></div>
        {lastRunSummary ? <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800"><span className="flex items-center gap-1.5 font-bold">{lastRunSummary.status === 'passed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}{lastRunSummary.status.toUpperCase()}</span><span className="text-[11px] font-mono text-slate-400">{lastRunSummary.passedSteps}/{lastRunSummary.totalSteps}</span></div> : <div className="text-slate-500 italic text-[11px] text-center py-1">No run evidence yet.</div>}
      </div>

      {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
        <div ref={dialogRef} className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="sidebar-dialog-title">
          <div className="flex items-center justify-between gap-3"><h2 id="sidebar-dialog-title" className="text-sm font-bold text-white">{dialog === 'project' ? 'Create project' : 'Create session'}</h2><button type="button" onClick={closeDialog} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800" aria-label="Close dialog"><X className="w-4 h-4" /></button></div>
          {dialog === 'project' ? <form onSubmit={(event) => { event.preventDefault(); void submitProject(); }} aria-busy={projectSubmitBusy} className="space-y-3 mt-4"><label className="block text-slate-300">Project name<input required disabled={projectSubmitBusy} value={projectName} onChange={(event) => setProjectName(event.target.value)} className="field mt-1" /></label><label className="block text-slate-300">Workspace path<div className="flex gap-2 mt-1"><input required disabled={projectSubmitBusy} title={workspacePath || 'Enter a local workspace path.'} value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} className="field min-w-0 flex-1" /><button type="button" onClick={() => void browseProjectWorkspace()} disabled={!workspaceBrowse.canBrowse || workspaceBrowse.status === 'busy' || projectSubmitBusy} aria-busy={workspaceBrowse.status === 'busy'} title={workspaceBrowse.canBrowse ? 'Choose a local workspace folder using the native host.' : workspaceBrowse.message} className="button-muted min-h-12 shrink-0 px-3 disabled:cursor-not-allowed disabled:opacity-50">{workspaceBrowse.status === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}<span className="sr-only">{workspaceBrowse.status === 'busy' ? 'Opening folder picker' : 'Browse workspace folder'}</span></button></div></label>{workspaceBrowse.message && <p role="status" aria-live="polite" className="text-xs text-slate-500">{workspaceBrowse.message}</p>}{projectSubmitError && <p role="alert" className="text-xs text-rose-300">{projectSubmitError}</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={closeDialog} disabled={projectSubmitBusy} title={projectSubmitBusy ? 'Wait for the project save to finish.' : 'Cancel project creation'} className="button-muted disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button type="submit" disabled={projectSubmitBusy} title={projectSubmitBusy ? 'Project is being saved locally.' : 'Create project'} className="button-primary disabled:cursor-not-allowed disabled:opacity-50">{projectSubmitBusy ? 'Saving…' : 'Create project'}</button></div></form> : <form onSubmit={(event) => { event.preventDefault(); void submitSession(); }} className="space-y-3 mt-4"><label className="block text-slate-300">Session name<input required value={sessionName} onChange={(event) => setSessionName(event.target.value)} className="field mt-1" /></label><label className="block text-slate-300">Platform<select value={sessionPlatform} onChange={(event) => setSessionPlatform(event.target.value as 'web' | 'android' | 'api')} className="field mt-1"><option value="web">Web</option><option value="android">Android</option><option value="api">API</option></select></label><p className="text-xs text-slate-500">Targets, packages, URLs, secrets, and actions are entered explicitly after creation.</p><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={closeDialog} className="button-muted">Cancel</button><button type="submit" className="button-primary">Create session</button></div></form>}
        </div>
      </div>}
    </aside>
  );
};

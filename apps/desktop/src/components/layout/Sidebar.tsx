import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import { bridge } from '../../services/desktopBridge.js';
import { SessionRecord } from '@automate-plus/persistence';
import {
  Plus,
  Globe,
  Smartphone,
  Server,
  SmartphoneNfc,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    projects,
    activeProject,
    sessions,
    activeSession,
    selectProject,
    selectSession,
    devices,
    lastRunSummary,
  } = useAppStore();

  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionPlatform, setNewSessionPlatform] = useState<'web' | 'android' | 'api'>('web');

  const handleCreateSession = async () => {
    if (!newSessionName.trim() || !activeProject) return;
    const newSessionId = crypto.randomUUID();
    const newSession: SessionRecord = {
      id: newSessionId,
      projectId: activeProject.id,
      name: newSessionName.trim(),
      platform: newSessionPlatform,
      ir: {
        id: newSessionId,
        schemaVersion: 2,
        projectId: activeProject.id,
        name: newSessionName.trim(),
        platform: newSessionPlatform,
        targetConfig:
          newSessionPlatform === 'web'
            ? { startUrl: 'http://127.0.0.1:4173' }
            : newSessionPlatform === 'android'
            ? { appPackage: 'com.example.app' }
            : { baseUrl: 'http://127.0.0.1:4173' },
        environmentVariables: {},
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await bridge.sessionRepo.save(newSession);
    useAppStore.setState((state) => ({
      sessions: [...state.sessions, newSession],
      activeSession: newSession,
    }));

    setNewSessionName('');
    setShowNewSessionModal(false);
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between text-xs select-none">
      {/* Top Explorer Section */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Project Selector */}
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>Workspace</span>
            <span className="text-slate-500 font-mono">Offline</span>
          </div>
          <div className="relative">
            <select
              value={activeProject?.id || ''}
              onChange={(e) => selectProject(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-md py-1.5 px-2.5 text-xs font-medium focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Test Sessions List */}
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Test Sessions ({sessions.length})</span>
            <button
              onClick={() => setShowNewSessionModal(true)}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors"
              title="Add New Test Session"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {sessions.map((session) => {
              const isActive = activeSession?.id === session.id;
              return (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-md transition-all text-left group ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/40 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {session.platform === 'web' && <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                    {session.platform === 'android' && (
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    {session.platform === 'api' && <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <span className="truncate font-medium">{session.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">
                    {session.ir?.steps?.length ?? 0} steps
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Connected Android Devices */}
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Android Devices</span>
            <SmartphoneNfc className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="space-y-1">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-slate-300 text-[11px]">{d.model}</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1 rounded font-mono">
                  {d.id}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Run Summary Status */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Latest Run Outcome</span>
          <Clock className="w-3 h-3 text-slate-500" />
        </div>
        {lastRunSummary ? (
          <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-1.5 font-medium">
              {lastRunSummary.status === 'passed' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400" />
              )}
              <span
                className={
                  lastRunSummary.status === 'passed' ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'
                }
              >
                {lastRunSummary.status.toUpperCase()}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {lastRunSummary.passedSteps}/{lastRunSummary.totalSteps} in {lastRunSummary.durationMs}ms
            </span>
          </div>
        ) : (
          <div className="text-slate-500 italic text-[11px] text-center py-1">Ready for execution</div>
        )}
      </div>

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" /> Create Test Session
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Session Name</label>
                <input
                  type="text"
                  placeholder="e.g. User Signup & Checkout Flow"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Target Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSessionPlatform('web')}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-[11px] font-medium transition-all ${
                      newSessionPlatform === 'web'
                        ? 'bg-sky-950/60 border-sky-500 text-sky-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-sky-400" /> Web
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSessionPlatform('android')}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-[11px] font-medium transition-all ${
                      newSessionPlatform === 'android'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-emerald-400" /> Android
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSessionPlatform('api')}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-[11px] font-medium transition-all ${
                      newSessionPlatform === 'api'
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Server className="w-4 h-4 text-amber-400" /> API
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateSession()}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md shadow-sm"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

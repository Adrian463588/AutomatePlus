import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import { Play, PlaySquare, Repeat, Zap, Globe, Server, Layers, Square, Activity, Smartphone } from 'lucide-react';

interface HeaderProps { onOpenStressModal: () => void; }

export const Header: React.FC<HeaderProps> = ({ onOpenStressModal }) => {
  const { activeProject, activeSession, isRunning, runTest, runLooping, cancelExecution, activeDevice, activeTab, setActiveTab, feedback } = useAppStore();
  const [loopCount, setLoopCount] = useState('');
  const [showLoopInput, setShowLoopInput] = useState(false);
  const hasSession = Boolean(activeSession);
  const canLoop = Number.isInteger(Number(loopCount)) && Number(loopCount) > 0;
  const runReason = hasSession ? 'Run the current user-created session' : 'Create and select a session first';

  return (
    <header className="app-header bg-slate-900 border-b border-slate-800 px-4 py-2 select-none">
      <div className="header-brand flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shrink-0">A+</div>
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-wide text-white flex items-center gap-2">
            AutomatePlus<span className="text-[10px] font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800 px-1.5 py-0.5 rounded">Sprint 2</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate">{activeProject?.name ?? 'No project selected'}</div>
        </div>
      </div>

      <nav className="header-tabs flex items-center bg-slate-950/70 p-1 rounded-lg border border-slate-800" aria-label="Workspace view">
        <button
          type="button"
          onClick={() => setActiveTab('visual')}
          aria-pressed={activeTab === 'visual'}
          aria-label="Recorder"
          title="Recorder"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'visual' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span>Recorder</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('device_farm')}
          aria-pressed={activeTab === 'device_farm'}
          aria-label="Device Farm"
          title="Device Farm"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'device_farm' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span>Device Farm</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('api_builder')}
          aria-pressed={activeTab === 'api_builder'}
          aria-label="API Builder"
          title="API Builder"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'api_builder' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-amber-400" />
          <span>API Builder</span>
        </button>
      </nav>

      <div className="header-session flex items-center gap-2 font-mono text-xs text-slate-300 bg-slate-950/80 px-3 py-1.5 rounded-md border border-slate-800/80 min-w-0">
        <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="font-semibold text-white truncate">{activeSession?.name ?? 'No active session'}</span>
        {activeSession?.platform === 'android' && activeDevice && (
          <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-1.5 rounded flex items-center gap-1 shrink-0">
            <Activity className="w-2.5 h-2.5" />{activeDevice}
          </span>
        )}
      </div>

      <div className="header-actions flex items-center gap-2">
        <button
          type="button"
          disabled={isRunning || !hasSession}
          onClick={() => void runTest('interactive')}
          title={runReason}
          className="button-execute bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>In-app run</span>
        </button>

        <button
          type="button"
          disabled={isRunning || !hasSession}
          onClick={() => void runTest('native')}
          title={hasSession ? 'Requires a registered capability and native runtime' : runReason}
          className="button-execute bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
        >
          <PlaySquare className="w-3.5 h-3.5" />
          <span>Native run</span>
        </button>

        {showLoopInput ? (
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-md p-1">
            <label htmlFor="loop-count" className="sr-only">Loop count</label>
            <input
              id="loop-count"
              type="number"
              min="1"
              value={loopCount}
              onChange={(event) => setLoopCount(event.target.value)}
              className="w-16 bg-transparent text-xs text-center font-mono text-white focus:outline-none"
            />
            <button
              type="button"
              disabled={!canLoop || isRunning}
              onClick={() => { setShowLoopInput(false); void runLooping(Number(loopCount)); }}
              title={canLoop && !isRunning ? 'Run the requested loop count' : 'Enter a positive loop count while no run is active'}
              className="button-small bg-amber-600 disabled:opacity-50"
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => { setShowLoopInput(false); setLoopCount(''); }}
              className="button-small bg-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isRunning || !hasSession}
            onClick={() => setShowLoopInput(true)}
            title="Provide a loop count"
            className="button-execute bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
          >
            <Repeat className="w-3.5 h-3.5 text-amber-400" />
            <span>Loop</span>
          </button>
        )}

        <button
          type="button"
          disabled={isRunning || activeSession?.platform !== 'api'}
          onClick={onOpenStressModal}
          title={activeSession?.platform === 'api' ? 'Provide stress values' : 'Select an API session first'}
          className="button-execute bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 disabled:opacity-50"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Stress</span>
        </button>

        {isRunning && (
          <button
            type="button"
            onClick={() => void cancelExecution()}
            className="button-execute bg-rose-700 hover:bg-rose-600"
            aria-label="Cancel running operation"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Cancel</span>
          </button>
        )}
      </div>

      <div className={`header-feedback feedback-${feedback.kind}`} role="status" aria-live="polite" aria-atomic="true">
        {feedback.message}
      </div>
    </header>
  );
};

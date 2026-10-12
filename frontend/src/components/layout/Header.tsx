import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import { Play, PlaySquare, Repeat, Zap, Globe, Server, Layers, Square, Activity, Smartphone, HardDriveDownload, Bot } from 'lucide-react';

interface HeaderProps { onOpenStressModal: () => void; }

export const Header: React.FC<HeaderProps> = ({ onOpenStressModal }) => {
  const { activeProject, activeSession, sessions, selectSession, isRunning, runTest, runLooping, cancelExecution, activeDevice, activeTab, setActiveTab, feedback } = useAppStore();
  const [loopCount, setLoopCount] = useState('');
  const [showLoopInput, setShowLoopInput] = useState(false);
  const hasSession = Boolean(activeSession);
  const canLoop = Number.isInteger(Number(loopCount)) && Number(loopCount) > 0;
  const runReason = hasSession ? 'Run the current user-created session' : 'Create and select a session first';

  const handleStressClick = () => {
    if (activeSession?.platform === 'api') {
      onOpenStressModal();
    } else {
      const apiSession = sessions.find((s) => s.platform === 'api');
      if (apiSession) {
        void selectSession(apiSession.id);
        setActiveTab('api_builder');
        onOpenStressModal();
      } else {
        setActiveTab('api_builder');
      }
    }
  };

  return (
    <header className="app-header select-none">
      <div className="header-brand flex items-center gap-3 min-w-0">
        <div className="header-mark shrink-0" aria-hidden="true">A+</div>
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-wide text-[var(--ap-text)] flex items-center gap-2">
            AutomatePlus
          </div>
          <div className="text-[11px] text-[var(--ap-text-muted)] font-mono truncate">{activeProject?.name ?? 'No project selected'}</div>
        </div>
      </div>

      <nav className="header-tabs flex items-center" aria-label="Workspace view">
        <button
          type="button"
          onClick={() => setActiveTab('visual')}
          aria-pressed={activeTab === 'visual'}
          aria-label="Recorder"
          title="Recorder"
          className="header-tab flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
        >
          <Globe className="w-3.5 h-3.5 text-cyan-300" />
          <span>Recorder</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('runtime')}
          aria-pressed={activeTab === 'runtime'}
          aria-label="Runtime Manager"
          title="Scan, import, verify, and explicitly download offline runtime packs"
          className="header-tab flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
        >
          <HardDriveDownload className="w-3.5 h-3.5 text-cyan-300" />
          <span>Runtime</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('device_farm')}
          aria-pressed={activeTab === 'device_farm'}
          aria-label="Device Farm"
          title="Device Farm"
          className="header-tab flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
        >
          <Smartphone className="w-3.5 h-3.5 text-cyan-300" />
          <span>Device Farm</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('api_builder')}
          aria-pressed={activeTab === 'api_builder'}
          aria-label="API Builder"
          title="API Builder"
          className="header-tab flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
        >
          <Server className="w-3.5 h-3.5 text-cyan-300" />
          <span>API Builder</span>
        </button>

        <button
          type="button"
          id="mcp-bridge-tab-button"
          onClick={() => setActiveTab('mcp')}
          aria-pressed={activeTab === 'mcp'}
          aria-label="MCP Agent Bridge"
          title="Model Context Protocol Bridge for AI Agents"
          className="header-tab flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
        >
          <Bot className="w-3.5 h-3.5 text-cyan-300" />
          <span>MCP Bridge</span>
        </button>
      </nav>

      <div className="header-session flex items-center gap-2 font-mono text-xs min-w-0">
        <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="font-semibold text-[var(--ap-text)] truncate">{activeSession?.name ?? 'No active session'}</span>
        {activeSession?.platform === 'android' && activeDevice && (
          <span className="header-device-chip text-[10px] px-1.5 flex items-center gap-1 shrink-0">
            <Activity className="w-2.5 h-2.5" />{activeDevice}
          </span>
        )}
      </div>

      <div className="header-actions flex items-center gap-2">
        <button
          type="button"
          id="in-app-run-button"
          disabled={isRunning || !hasSession}
          onClick={() => void runTest('interactive')}
          title={runReason}
          className="button-execute bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>In-app run</span>
        </button>

        <button
          type="button"
          id="native-run-button"
          disabled={isRunning || !hasSession}
          onClick={() => void runTest('native')}
          title={hasSession ? 'Requires a registered capability and native runtime' : runReason}
          className="button-execute bg-cyan-800 hover:bg-cyan-700 disabled:opacity-50"
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
              id="loop-go-button"
              disabled={!canLoop || isRunning}
              onClick={() => { setShowLoopInput(false); void runLooping(Number(loopCount)); }}
              title={canLoop && !isRunning ? 'Run the requested loop count' : 'Enter a positive loop count while no run is active'}
              className="button-small bg-amber-600 disabled:opacity-50"
            >
              Go
            </button>
            <button
              type="button"
              id="loop-cancel-button"
              onClick={() => { setShowLoopInput(false); setLoopCount(''); }}
              className="button-small bg-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            id="loop-button"
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
          disabled={isRunning}
          onClick={handleStressClick}
          title={
            isRunning
              ? 'Execution in progress'
              : activeSession?.platform === 'api'
                ? 'Provide stress values'
                : 'Open API stress testing'
          }
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

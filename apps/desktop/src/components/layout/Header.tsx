import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Play,
  PlaySquare,
  Repeat,
  Zap,
  Globe,
  Smartphone,
  Server,
  Layers,
  StopCircle,
  Activity,
} from 'lucide-react';

interface HeaderProps {
  onOpenStressModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenStressModal }) => {
  const {
    activeProject,
    activeSession,
    isRunning,
    isRecording,
    runTest,
    runLooping,
    activeDevice,
    activeTab,
    setActiveTab,
  } = useAppStore();

  const [loopCount, setLoopCount] = useState(5);
  const [showLoopInput, setShowLoopInput] = useState(false);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/30">
            A+
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide text-white flex items-center gap-2">
              AutomatePlus
              <span className="text-[10px] font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800 px-1.5 py-0.5 rounded">
                v1.0.0 Offline
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {activeProject?.name || 'No Project Selected'}
            </div>
          </div>
        </div>

        {/* Platform Indicator Tabs */}
        <div className="h-6 w-px bg-slate-800 mx-1" />
        <div className="flex items-center bg-slate-950/70 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('visual')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeTab === 'visual'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeSession?.platform === 'android' ? (
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>{activeSession?.platform === 'android' ? 'Android Mirror' : 'Web Canvas'}</span>
          </button>
          <button
            onClick={() => setActiveTab('api_builder')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeTab === 'api_builder'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-amber-400" />
            <span>API Builder</span>
          </button>
        </div>
      </div>

      {/* Center Session Title */}
      <div className="flex items-center gap-2 font-mono text-xs text-slate-300 bg-slate-950/80 px-3 py-1 rounded-md border border-slate-800/80">
        <Layers className="w-3.5 h-3.5 text-indigo-400" />
        <span className="font-semibold text-white">{activeSession?.name || 'No Active Session'}</span>
        {activeSession?.platform === 'android' && (
          <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-1.5 rounded flex items-center gap-1">
            <Activity className="w-2.5 h-2.5" /> {activeDevice}
          </span>
        )}
      </div>

      {/* Execution Controls */}
      <div className="flex items-center gap-2">
        {/* Interactive In-App Run */}
        <button
          disabled={isRunning || !activeSession}
          onClick={() => runTest('interactive')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Run Step-by-Step Interactive Test"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>In-App Play</span>
        </button>

        {/* Native Process Runner */}
        <button
          disabled={isRunning || !activeSession}
          onClick={() => runTest('native')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-700/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Run Native Framework Suite (Process Isolated)"
        >
          <PlaySquare className="w-3.5 h-3.5" />
          <span>Native Run</span>
        </button>

        {/* Looping Control */}
        <div className="relative">
          {showLoopInput ? (
            <div className="flex items-center bg-slate-950 border border-slate-700 rounded-md p-0.5">
              <input
                type="number"
                min="1"
                max="1000"
                value={loopCount}
                onChange={(e) => setLoopCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 bg-transparent text-xs text-center font-mono text-white focus:outline-none"
              />
              <button
                onClick={() => {
                  setShowLoopInput(false);
                  runLooping(loopCount);
                }}
                className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-[11px] font-bold text-white rounded"
              >
                Go
              </button>
            </div>
          ) : (
            <button
              disabled={isRunning || !activeSession}
              onClick={() => setShowLoopInput(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
              title="Run Functional Looping"
            >
              <Repeat className="w-3.5 h-3.5 text-amber-400" />
              <span>Loop Test</span>
            </button>
          )}
        </div>

        {/* k6 RPS Stress Test Modal Button */}
        <button
          disabled={isRunning || !activeSession}
          onClick={onOpenStressModal}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 transition-all"
          title="Configure & Launch k6 RPS Stress Test"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span>RPS Stress</span>
        </button>
      </div>
    </header>
  );
};

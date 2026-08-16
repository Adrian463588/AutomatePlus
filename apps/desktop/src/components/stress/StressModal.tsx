import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Zap,
  X,
  Play,
  Gauge,
  Timer,
  Users,
  Activity,
} from 'lucide-react';

interface StressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StressModal: React.FC<StressModalProps> = ({ isOpen, onClose }) => {
  const { activeSession, runK6Stress, isRunning } = useAppStore();

  const [targetRps, setTargetRps] = useState(50);
  const [durationSec, setDurationSec] = useState(30);
  const [maxVus, setMaxVus] = useState(50);

  if (!isOpen) return null;

  const handleLaunchStress = async () => {
    onClose();
    await runK6Stress(targetRps, durationSec);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 bg-slate-950 px-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2 font-bold text-white text-sm">
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>k6 Concurrency & RPS Stress Test</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 mb-1 font-mono">Target Session:</div>
            <div className="font-bold text-white text-xs truncate">
              {activeSession?.name || 'No session selected'}
            </div>
          </div>

          {/* Sliders and Configuration */}
          <div className="space-y-4">
            {/* Target RPS */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" /> Target Throughput (RPS)
                </label>
                <span className="font-mono text-amber-400 font-bold bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded">
                  {targetRps} req/s
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="500"
                step="5"
                value={targetRps}
                onChange={(e) => setTargetRps(parseInt(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                <span>5 RPS</span>
                <span>250 RPS</span>
                <span>500 RPS</span>
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-sky-400" /> Test Duration
                </label>
                <span className="font-mono text-sky-400 font-bold bg-sky-950/60 border border-sky-800/80 px-2 py-0.5 rounded">
                  {durationSec} seconds
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="180"
                step="5"
                value={durationSec}
                onChange={(e) => setDurationSec(parseInt(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                <span>5s</span>
                <span>60s</span>
                <span>180s (3m)</span>
              </div>
            </div>

            {/* Max VUs */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-400" /> Max Virtual Users (VUs)
                </label>
                <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
                  {maxVus} VUs
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={maxVus}
                onChange={(e) => setMaxVus(parseInt(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-800/40 p-3 rounded-lg flex items-start gap-2.5">
            <Activity className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              k6 will automatically allocate virtual workers using the <code>constant-arrival-rate</code> executor to ensure exact RPS arrival metrics regardless of response latencies.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 bg-slate-950 px-5 flex items-center justify-end gap-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunchStress}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-md shadow-md shadow-amber-600/30 disabled:opacity-50 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch k6 Stress Test</span>
          </button>
        </div>
      </div>
    </div>
  );
};

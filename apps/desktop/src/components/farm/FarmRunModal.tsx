import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Smartphone,
  X,
  Play,
  Layers,
  Repeat,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { DeviceExecutionStrategy, FarmFailurePolicy } from '@automate-plus/contracts';

interface FarmRunModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FarmRunModal: React.FC<FarmRunModalProps> = ({ isOpen, onClose }) => {
  const {
    activeSession,
    deviceProfiles,
    selectedDeviceIds,
    nativeHostAvailable,
    nativeHostMessage,
    runFarmTest,
    isRunning,
    lastFarmSummary,
  } = useAppStore();

  const [strategy, setStrategy] = useState<DeviceExecutionStrategy>('all-devices');
  const [failurePolicy, setFailurePolicy] = useState<FarmFailurePolicy>('continue-other-devices');
  const [iterations, setIterations] = useState(5);
  const [delayMs, setDelayMs] = useState(100);
  const [maxParallel, setMaxParallel] = useState(4);

  if (!isOpen) return null;

  const targetDevices = deviceProfiles.filter((d) => selectedDeviceIds.includes(d.deviceId) && d.status === 'device');
  const isAndroidSession = activeSession?.platform === 'android';
  const hasSteps = (activeSession?.ir.steps.length ?? 0) > 0;
  const canLaunch = Boolean(activeSession && isAndroidSession && hasSteps && nativeHostAvailable && targetDevices.length > 0 && !isRunning);

  const handleLaunchFarm = async () => {
    if (!activeSession || !isAndroidSession || !hasSteps || targetDevices.length === 0 || !nativeHostAvailable || isRunning) return;
    await runFarmTest({
      schemaVersion: 1,
      sessionId: activeSession.id,
      strategy,
      deviceIds: targetDevices.map((d) => d.deviceId),
      iterationsPerDevice: strategy === 'all-devices' ? iterations : undefined,
      totalIterations: strategy === 'split-iterations' ? iterations : undefined,
      maxParallelDevices: maxParallel,
      iterationDelayMs: delayMs,
      failurePolicy,
    });
    onClose();
  };

  const launchReason = !activeSession
    ? 'Select an Android session before launching a farm run.'
    : !isAndroidSession
      ? 'Farm replay requires an Android session.'
      : !hasSteps
        ? 'Add at least one user-created action before launching a farm run.'
        : !nativeHostAvailable
      ? nativeHostMessage
      : targetDevices.length === 0
        ? 'Select at least one authorized device.'
        : isRunning
          ? 'Wait for the current run to finish.'
          : 'Launch the configured native farm run.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="presentation">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="farm-run-title">
        {/* Header */}
        <div className="flex min-h-14 items-center justify-between border-b border-slate-800 bg-slate-950 px-5">
          <div className="flex items-center gap-2 font-bold text-white text-sm">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span id="farm-run-title">Android phone farm — multi-device replay</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 rounded text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            aria-label="Close farm replay dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {/* Target Session Banner */}
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div>
              <div className="text-[10px] text-slate-400 font-mono">TARGET SESSION</div>
              <div className="font-bold text-white text-xs">{activeSession?.name || 'No session selected'}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-mono">SELECTED DEVICES</div>
              <div className="font-bold text-emerald-400 text-xs">{targetDevices.length} selected</div>
            </div>
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Strategy Selection */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" /> Execution Strategy
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as DeviceExecutionStrategy)}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all-devices">All Devices (Run N times on each device)</option>
                <option value="split-iterations">Split Iterations (Distribute N total across pool)</option>
                <option value="single">Single Device (Run on primary device only)</option>
              </select>
            </div>

            {/* Failure Policy */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Failure Policy
              </label>
              <select
                value={failurePolicy}
                onChange={(e) => setFailurePolicy(e.target.value as FarmFailurePolicy)}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="continue-other-devices">Continue Other Devices (Isolate errors)</option>
                <option value="fail-fast">Fail Fast (Abort entire farm immediately)</option>
              </select>
            </div>
          </div>

          {/* Iteration & Delay Sliders */}
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-amber-400" />
                  {strategy === 'split-iterations' ? 'Total Iterations (Distributed)' : 'Iterations Per Device'}
                </span>
                <span className="font-mono text-amber-400 font-bold bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded">
                  {iterations} Iterations
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Delay Between Iterations (ms)</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={delayMs}
                  onChange={(e) => setDelayMs(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Max Parallel Workers</label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={maxParallel}
                  onChange={(e) => setMaxParallel(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Target Devices Checklist */}
          <div>
            <div className="text-[11px] font-semibold text-slate-300 mb-1.5">Enrolled Devices ({targetDevices.length})</div>
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
              {targetDevices.length === 0 ? (
                <div className="py-2 text-center text-slate-500">No authorized devices selected.</div>
              ) : (
                targetDevices.map((dev) => (
                  <div key={dev.deviceId} className="flex items-center justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800 text-[11px]">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-bold text-white">{dev.model}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({dev.adbSerial})</span>
                    </div>
                    <span className="rounded border border-emerald-800 bg-emerald-950 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                      API {dev.sdkVersion}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live / Last Execution Summary */}
          {lastFarmSummary && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Farm Execution Summary
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                  lastFarmSummary.status === 'passed' ? 'border border-emerald-800 bg-emerald-950 text-emerald-400' : lastFarmSummary.status === 'blocked' ? 'border border-amber-800 bg-amber-950 text-amber-300' : 'border border-rose-800 bg-rose-950 text-rose-400'
                }`}>
                  {lastFarmSummary.status.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <div className="text-slate-400">Planned</div>
                  <div className="font-bold text-white text-xs">{lastFarmSummary.totalPlannedIterations}</div>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <div className="text-slate-400">Passed</div>
                  <div className="font-bold text-emerald-400 text-xs">{lastFarmSummary.totalPassedIterations}</div>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <div className="text-slate-400">Failed</div>
                  <div className="font-bold text-rose-400 text-xs">{lastFarmSummary.totalFailedIterations}</div>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <div className="text-slate-400">Duration</div>
                  <div className="font-bold text-sky-400 text-xs">{(lastFarmSummary.durationMs / 1000).toFixed(1)}s</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950 px-5">
          <p className="text-[11px] leading-5 text-amber-300" role="status" aria-live="polite">{launchReason}</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded px-3 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleLaunchFarm}
            disabled={!canLaunch}
            className="flex min-h-12 items-center gap-2 rounded-md bg-emerald-600 px-5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title={launchReason}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isRunning ? 'Running Farm...' : 'Launch Farm Run'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

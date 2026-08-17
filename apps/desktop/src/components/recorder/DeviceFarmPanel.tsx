import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Layers3, LockKeyhole, Radio, Smartphone } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';

type FarmStrategy = 'single' | 'all-devices' | 'split-iterations';

export const DeviceFarmPanel: React.FC = () => {
  const {
    activeSession,
    devices,
    deviceDiscoveryMessage,
    activeDevice,
    selectedDeviceIds,
    primaryDeviceId,
    nativeHostAvailable,
    nativeHostMessage,
    discoverDevices,
    toggleDeviceSelection,
    setPrimaryDevice,
    runFarmTest,
  } = useAppStore();
  const [strategy, setStrategy] = useState<FarmStrategy>('all-devices');
  const [iterations, setIterations] = useState('2');
  const [maxParallelDevices, setMaxParallelDevices] = useState('2');

  const eligibleDevices = useMemo(
    () => devices.filter((device) => device.status === 'device'),
    [devices],
  );
  const resolvedPrimaryId = selectedDeviceIds.includes(primaryDeviceId ?? '')
    ? primaryDeviceId ?? ''
    : selectedDeviceIds.includes(activeDevice ?? '')
      ? activeDevice ?? ''
      : selectedDeviceIds[0] || '';
  const followers = selectedDeviceIds.filter((id) => id !== resolvedPrimaryId);
  const isAndroid = activeSession?.platform === 'android';
  const numericIterations = Number(iterations);
  const numericParallel = Number(maxParallelDevices);
  const minimumDevices = strategy === 'single' ? 1 : 2;
  const farmReady = isAndroid
    && nativeHostAvailable
    && activeSession.ir.steps.length > 0
    && selectedDeviceIds.length >= minimumDevices
    && Number.isInteger(numericIterations)
    && numericIterations > 0
    && Number.isInteger(numericParallel)
    && numericParallel > 0;

  const runFarm = () => {
    if (!farmReady) return;
    const resolvedDeviceIds = strategy === 'single' ? [resolvedPrimaryId] : selectedDeviceIds;
    if (!resolvedPrimaryId || resolvedDeviceIds.length === 0) return;
    void runFarmTest({
      schemaVersion: 1,
      sessionId: activeSession.id,
      strategy,
      deviceIds: resolvedDeviceIds,
      iterationsPerDevice: strategy === 'all-devices' ? numericIterations : undefined,
      totalIterations: strategy === 'split-iterations' ? numericIterations : undefined,
      maxParallelDevices: numericParallel,
      iterationDelayMs: 0,
      failurePolicy: 'continue-other-devices',
    });
  };

  const reason = !isAndroid
    ? 'Select an Android session to configure a device farm.'
    : devices.length === 0
      ? nativeHostMessage
      : !nativeHostAvailable
        ? nativeHostMessage
      : selectedDeviceIds.length < minimumDevices
        ? `Select at least ${minimumDevices} authorized device${minimumDevices === 1 ? '' : 's'} for this replay strategy.`
        : activeSession.ir.steps.length === 0
          ? 'Add at least one user-created action before replay.'
          : 'Native host prerequisites are still required before replay.';

  return (
    <section className="farm-panel border-t border-slate-800 bg-slate-950/80 p-4" aria-labelledby="device-farm-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-indigo-400" aria-hidden="true" />
            <h2 id="device-farm-heading" className="text-sm font-semibold text-slate-100">Android device farm</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">Primary/follower recording and bounded local replay. No cloud or synthetic devices.</p>
        </div>
        <span className="farm-status-badge" role="status">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> one lease per serial
        </span>
      </div>

      <div className="farm-controls mt-4">
        <label className="farm-control">
          <span>Replay strategy</span>
          <select className="min-h-12" value={strategy} onChange={(event) => setStrategy(event.target.value as FarmStrategy)} disabled={!isAndroid}>
            <option value="single">Single device</option>
            <option value="all-devices">All selected devices</option>
            <option value="split-iterations">Split iterations</option>
          </select>
        </label>
        <label className="farm-control">
          <span>{strategy === 'split-iterations' ? 'Total iterations' : 'Iterations per device'}</span>
          <input className="min-h-12" type="number" min="1" step="1" value={iterations} onChange={(event) => setIterations(event.target.value)} disabled={!isAndroid} inputMode="numeric" />
        </label>
        <label className="farm-control">
          <span>Max parallel devices</span>
          <input className="min-h-12" type="number" min="1" step="1" value={maxParallelDevices} onChange={(event) => setMaxParallelDevices(event.target.value)} disabled={!isAndroid} inputMode="numeric" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400" role="status" aria-live="polite">
          <Radio className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          <span>{deviceDiscoveryMessage}</span>
        </div>
        <button type="button" className="button-small min-h-12 bg-slate-800 hover:bg-slate-700" onClick={() => void discoverDevices()}>
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Refresh devices
        </button>
      </div>

      <div className="farm-device-grid mt-3" role="group" aria-label="Android farm device selection">
        {devices.length === 0 ? (
          <div className="farm-empty-state">
            <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span>No Android devices were reported by the native host. Browser mode does not fabricate devices.</span>
          </div>
        ) : devices.map((device) => {
          const selected = selectedDeviceIds.includes(device.id);
          const eligible = device.status === 'device';
          return (
            <label key={device.id} className={`farm-device-card ${selected ? 'farm-device-card-selected' : ''} ${!eligible ? 'farm-device-card-blocked' : ''}`}>
              <input type="checkbox" checked={selected} disabled={!eligible || !isAndroid || !nativeHostAvailable} onChange={() => toggleDeviceSelection(device.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-100"><Smartphone className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />{device.model || device.id}</span>
                <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">{device.id}</span>
                <span className={`mt-1 block text-[10px] ${eligible ? 'text-emerald-300' : 'text-amber-300'}`}>{device.status} · Android {device.androidVersion || 'unknown'}</span>
              </span>
              {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />}
            </label>
          );
        })}
      </div>

      <div className="farm-recording-row mt-3">
        <label className="farm-control">
          <span>Recording mode</span>
          <select className="min-h-12" value="primary-followers" disabled aria-label="Recording mode">
            <option value="primary-followers">Primary + followers</option>
          </select>
        </label>
        <label className="farm-control">
          <span>Primary device</span>
          <select className="min-h-12" value={resolvedPrimaryId} onChange={(event) => setPrimaryDevice(event.target.value)} disabled={selectedDeviceIds.length === 0 || !isAndroid || !nativeHostAvailable}>
            <option value="">Select primary</option>
            {selectedDeviceIds.map((id) => <option key={id} value={id}>{eligibleDevices.find((device) => device.id === id)?.model || id}</option>)}
          </select>
        </label>
        <div className="farm-observation-summary" role="status" aria-live="polite">
          <span>Followers</span>
          <strong>{followers.length}</strong>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="button-primary min-h-12" disabled={!farmReady} onClick={runFarm} title={reason}>
          <Circle className="h-3.5 w-3.5" aria-hidden="true" /> Replay selected devices
        </button>
        <span className="text-xs leading-5 text-amber-300" role="status" aria-live="polite">{reason}</span>
      </div>
    </section>
  );
};

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { FarmRunModal } from './FarmRunModal.js';

function formatTauriHostMessage(message: string): string {
  return message
    .replace(/native android host/gi, 'Tauri/Rust Android host')
    .replace(/native desktop host/gi, 'Tauri/Rust desktop host')
    .replace(/native host/gi, 'Tauri/Rust host');
}

export const DeviceFarmView: React.FC = () => {
  const {
    activeSession,
    deviceProfiles,
    deviceGroups,
    selectedDeviceIds,
    primaryDeviceId,
    nativeHostAvailable,
    nativeHostMessage,
    deviceDiscoveryMessage,
    isRunning,
    isRecording,
    toggleDeviceSelection,
    selectAllDevices,
    clearDeviceSelection,
    setPrimaryDevice,
    createDeviceGroup,
    deleteDeviceGroup,
    refreshDevices,
    startMultiDeviceRecording,
    stopMultiDeviceRecording,
  } = useAppStore();
  const [isFarmModalOpen, setIsFarmModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showGroupInput, setShowGroupInput] = useState(false);

  const eligibleDeviceCount = deviceProfiles.filter((device) => device.status === 'device').length;
  const selectedEligibleDeviceIds = selectedDeviceIds.filter((deviceId) => deviceProfiles.some((device) => device.deviceId === deviceId && device.status === 'device'));
  const hostMessage = formatTauriHostMessage(nativeHostMessage) || 'Tauri/Rust host is not ready.';
  const discoveryMessage = formatTauriHostMessage(deviceDiscoveryMessage);
  const isBusy = isRunning || isRecording;
  const primaryDevice = deviceProfiles.find((device) => device.deviceId === primaryDeviceId && selectedEligibleDeviceIds.includes(device.deviceId));
  const canRecord = nativeHostAvailable && activeSession?.platform === 'android' && selectedEligibleDeviceIds.length >= 2 && !isBusy;
  const canReplay = nativeHostAvailable && activeSession?.platform === 'android' && selectedEligibleDeviceIds.length > 0 && !isBusy;

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (isBusy || !name || selectedEligibleDeviceIds.length === 0) return;
    await createDeviceGroup(name, selectedEligibleDeviceIds, primaryDeviceId);
    setNewGroupName('');
    setShowGroupInput(false);
  };

  const recordReason = !activeSession
    ? 'Create an Android session before recording.'
    : activeSession.platform !== 'android'
      ? 'Select an Android session before recording.'
      : !nativeHostAvailable
        ? hostMessage
        : isRunning
          ? 'Wait for the current run to finish before starting recording.'
          : selectedEligibleDeviceIds.length < 2
          ? 'Select at least two authorized devices for primary/follower recording.'
          : 'Start primary/follower recording.';

  const replayReason = !activeSession
    ? 'Create an Android session before replay.'
    : activeSession.platform !== 'android'
      ? 'Select an Android session before replay.'
      : !nativeHostAvailable
        ? hostMessage
        : isBusy
          ? isRecording ? 'Stop recording before configuring a farm replay.' : 'Wait for the current run to finish.'
        : selectedEligibleDeviceIds.length === 0
          ? 'Select at least one authorized device.'
          : 'Configure and launch a Tauri/Rust farm replay.';

  const refreshDisabled = isBusy;
  const refreshTitle = refreshDisabled ? 'Wait for the current recording or replay to finish.' : 'Refresh device discovery.';
  const selectAllDisabled = isBusy || !nativeHostAvailable || eligibleDeviceCount === 0;
  const selectAllTitle = !nativeHostAvailable
    ? hostMessage
    : isBusy
      ? 'Wait for the current recording or replay to finish.'
      : eligibleDeviceCount === 0
        ? 'No authorized devices are available to select.'
        : 'Select all authorized devices.';
  const clearDisabled = isBusy || selectedDeviceIds.length === 0;
  const clearTitle = isBusy
    ? 'Wait for the current recording or replay to finish.'
    : selectedDeviceIds.length === 0
      ? 'No devices are selected.'
      : 'Clear device selection.';
  const groupSaveDisabled = isBusy || !newGroupName.trim() || selectedEligibleDeviceIds.length === 0;
  const groupSaveTitle = isBusy
    ? 'Wait for the current recording or replay to finish.'
    : !newGroupName.trim()
      ? 'Enter a device group name.'
      : selectedEligibleDeviceIds.length === 0
        ? 'Select at least one authorized device before saving a group.'
        : 'Save device group.';

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950/60 text-xs text-slate-200" aria-labelledby="device-farm-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Smartphone className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
          <div className="min-w-0">
            <h1 id="device-farm-heading" className="truncate text-sm font-bold text-white">Android device farm</h1>
            <p className="mt-0.5 text-[11px] text-slate-400" role="status" aria-live="polite">{discoveryMessage}</p>
          </div>
          <span className="hidden rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-400 sm:inline-flex">
            {eligibleDeviceCount} authorized
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void refreshDevices()} disabled={refreshDisabled} className="min-h-12 rounded border border-slate-700 bg-slate-800 px-3 text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={refreshTitle}>
            <RefreshCw className="mr-1.5 inline h-4 w-4" aria-hidden="true" />Refresh
          </button>
          <button type="button" onClick={selectAllDevices} disabled={selectAllDisabled} className="min-h-12 rounded border border-slate-700 bg-slate-800 px-3 text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={selectAllTitle}>Select all</button>
          <button type="button" onClick={clearDeviceSelection} disabled={clearDisabled} className="min-h-12 rounded border border-slate-700 bg-slate-800 px-3 text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={clearTitle}>Clear</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto xl:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-800 xl:border-b-0 xl:border-r" aria-labelledby="device-pool-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
            <h2 id="device-pool-heading" className="flex items-center gap-2 font-semibold text-slate-300"><Layers className="h-4 w-4 text-cyan-400" aria-hidden="true" />Device groups ({deviceGroups.length})</h2>
            {showGroupInput ? (
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <label className="sr-only" htmlFor="new-device-group">Device group name</label>
                <input id="new-device-group" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:w-40" aria-describedby="group-help" />
                <span id="group-help" className="sr-only">Enter a name for the selected device group.</span>
                <button type="button" onClick={() => void handleCreateGroup()} disabled={groupSaveDisabled} className="min-h-12 rounded bg-cyan-600 px-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={groupSaveTitle}>Save</button>
                <button type="button" onClick={() => { setShowGroupInput(false); setNewGroupName(''); }} className="min-h-12 rounded border border-slate-700 px-3 text-slate-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowGroupInput(true)} disabled={isBusy || selectedEligibleDeviceIds.length === 0} className="min-h-12 rounded border border-slate-700 bg-slate-800 px-3 text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={isBusy ? 'Wait for the current recording or replay to finish.' : selectedEligibleDeviceIds.length === 0 ? 'Select an authorized device before creating a group.' : 'Create a group from selected devices'}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add group</button>
            )}
          </div>

          {deviceGroups.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-slate-800 bg-slate-950/80 px-4 py-3" aria-label="Saved device groups">
              {deviceGroups.map((group) => (
                <div key={group.id} className="flex min-h-12 items-center gap-2 rounded border border-slate-800 bg-slate-900 px-3 text-slate-200">
                  <span className="font-semibold text-cyan-300">{group.name}</span>
                  <span className="font-mono text-[10px] text-slate-500">{group.deviceIds.length} selected</span>
                  <button type="button" onClick={() => void deleteDeviceGroup(group.id)} disabled={isBusy} className="min-h-12 min-w-12 rounded text-slate-400 hover:bg-slate-800 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400" aria-label={`Delete device group ${group.name}`} title={isBusy ? 'Wait for the current recording or replay to finish.' : `Delete ${group.name}`}><Trash2 className="mx-auto h-4 w-4" aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="grid min-h-0 flex-1 content-start gap-3 overflow-auto p-4 sm:grid-cols-2" role="list" aria-label="Discovered Android devices">
            {deviceProfiles.length === 0 ? (
              <div className="col-span-full flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 p-6 text-center text-slate-500" role="status">
                <AlertTriangle className="mb-2 h-8 w-8 text-amber-400" aria-hidden="true" />
                <p className="font-semibold text-slate-300">No Android devices reported</p>
                <p className="mt-1 max-w-md text-[11px] leading-5">{nativeHostMessage} Connect an authorized device, then refresh discovery.</p>
              </div>
            ) : deviceProfiles.map((device) => {
              const selected = selectedDeviceIds.includes(device.deviceId);
              const available = device.status === 'device';
              const isPrimary = primaryDeviceId === device.deviceId;
              return (
                <article key={device.deviceId} role="listitem" className={`rounded-lg border p-4 ${selected ? 'border-cyan-500/70 bg-slate-900' : 'border-slate-800 bg-slate-900/60'} ${!available ? 'opacity-70' : ''}`}>
                  <div className="flex items-start gap-3">
                    <label className="flex min-h-12 min-w-12 shrink-0 items-start justify-center pt-0.5">
                      <input type="checkbox" checked={selected} disabled={!available || !nativeHostAvailable || isBusy} onChange={() => toggleDeviceSelection(device.deviceId)} className="mt-1 h-5 w-5 accent-cyan-500" aria-label={`Select ${device.model || device.adbSerial}`} title={!available ? `Device is ${device.status}; only authorized devices can be selected.` : !nativeHostAvailable ? hostMessage : isBusy ? 'Wait for the current recording or replay to finish.' : `Select ${device.model || device.adbSerial}`} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-white">{device.model}</h3>
                        {isPrimary && <span className="rounded border border-cyan-700 bg-cyan-950 px-2 py-1 text-[10px] font-bold text-cyan-300">Primary</span>}
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{device.adbSerial}</p>
                      <p className={`mt-2 flex items-center gap-1 text-[10px] ${available ? 'text-emerald-300' : 'text-amber-300'}`}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{device.status} · Android {device.androidVersion} · API {device.sdkVersion}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{device.resolution.width}×{device.resolution.height} · {device.transport} · {device.healthState}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setPrimaryDevice(device.deviceId)} disabled={!available || !selected || isPrimary || !nativeHostAvailable || isBusy} className="mt-3 min-h-12 w-full rounded border border-slate-700 px-3 text-cyan-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={!available ? `Device is ${device.status}; only authorized devices can be primary.` : !nativeHostAvailable ? hostMessage : isBusy ? 'Wait for the current recording or replay to finish.' : !selected ? 'Select this device before making it primary.' : isPrimary ? 'This device is already primary.' : 'Use this device as primary.'}>{isPrimary ? 'Primary device' : 'Set as primary'}</button>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="flex min-h-56 min-w-0 flex-1 flex-col bg-slate-950 p-4" aria-labelledby="mirror-heading">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3"><EyeOff className="h-4 w-4 text-slate-500" aria-hidden="true" /><h2 id="mirror-heading" className="font-semibold text-slate-300">Device mirror</h2></div>
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-slate-500" role="status" aria-live="polite">
            <p className="font-semibold text-slate-300">Live Android frames require the Tauri/Rust host</p>
            <p className="mt-2 max-w-md text-[11px] leading-5">The Tauri/Rust host must provide a device-bound stream. No app screen, battery, clock, progress, or validation state is fabricated here.</p>
            {primaryDevice && <p className="mt-3 font-mono text-[10px] text-slate-500">Selected primary: {primaryDevice.model}</p>}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
            <button type="button" onClick={() => void (isRecording ? stopMultiDeviceRecording() : startMultiDeviceRecording())} disabled={isRecording ? false : !canRecord} className="min-h-12 flex-1 rounded border border-cyan-500/50 bg-cyan-950/50 px-3 font-semibold text-cyan-200 hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={isRecording ? 'Stop primary/follower recording.' : recordReason}><Radio className="mr-1.5 inline h-4 w-4" aria-hidden="true" />{isRecording ? 'Stop recording' : 'Primary/follower recording'}</button>
            <button type="button" onClick={() => setIsFarmModalOpen(true)} disabled={!canReplay} className="min-h-12 flex-1 rounded bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" title={replayReason}>Configure farm replay</button>
          </div>
          <p className="mt-2 text-[11px] text-amber-300" role="status" aria-live="polite">{isRecording ? 'Recording is active in the Tauri/Rust host.' : hostMessage}</p>
        </aside>
      </div>

      <FarmRunModal isOpen={isFarmModalOpen} onClose={() => setIsFarmModalOpen(false)} />
    </main>
  );
};

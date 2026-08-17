import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Smartphone,
  RefreshCw,
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  Play,
  Eye,
  Radio,
  ShieldCheck,
  MousePointerClick,
  Zap,
} from 'lucide-react';
import { FarmRunModal } from './FarmRunModal.js';

export const DeviceFarmView: React.FC = () => {
  const {
    deviceProfiles,
    deviceGroups,
    selectedDeviceIds,
    primaryDeviceId,
    toggleDeviceSelection,
    selectAllDevices,
    clearDeviceSelection,
    setPrimaryDevice,
    createDeviceGroup,
    deleteDeviceGroup,
    refreshDevices,
    isRunning,
    isRecording,
    startMultiDeviceRecording,
    stopMultiDeviceRecording,
  } = useAppStore();

  const [isFarmModalOpen, setIsFarmModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showGroupInput, setShowGroupInput] = useState(false);

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || selectedDeviceIds.length === 0) return;
    createDeviceGroup(newGroupName.trim(), selectedDeviceIds, primaryDeviceId);
    setNewGroupName('');
    setShowGroupInput(false);
  };

  const primaryDevice = deviceProfiles.find((d) => d.deviceId === primaryDeviceId) || deviceProfiles[0];
  const followerDevices = deviceProfiles.filter((d) => d.deviceId !== primaryDevice?.deviceId && selectedDeviceIds.includes(d.deviceId));

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950/60 overflow-hidden select-none border-r border-slate-800 text-xs">
      {/* Top Farm Toolbar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between gap-4">
        {/* Left: Device Discovery & Selection Controls */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-bold text-white text-sm">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Android Phone Farm</span>
            <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
              {deviceProfiles.length} Devices Online
            </span>
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1" />

          <button
            onClick={() => refreshDevices()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-all font-medium cursor-pointer"
            title="Refresh connected devices via ADB"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => selectAllDevices()}
            className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
          >
            Select All
          </button>

          <button
            onClick={() => clearDeviceSelection()}
            className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
          >
            Clear
          </button>
        </div>

        {/* Right: Farm Execution & Multi-Recording Actions */}
        <div className="flex items-center gap-2">
          {/* Multi-Device Recording Button */}
          {isRecording ? (
            <button
              onClick={() => stopMultiDeviceRecording()}
              className="flex items-center gap-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-md animate-pulse shadow-md shadow-rose-600/30 transition-all cursor-pointer"
            >
              <span>Stop Multi-Record</span>
            </button>
          ) : (
            <button
              onClick={() => startMultiDeviceRecording()}
              disabled={selectedDeviceIds.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 font-semibold rounded-md transition-all disabled:opacity-40 cursor-pointer"
              title="Record on primary device while validating observations on followers"
            >
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>Primary/Follower Record</span>
            </button>
          )}

          {/* Launch Multi-Device Replay Modal */}
          <button
            onClick={() => setIsFarmModalOpen(true)}
            disabled={isRunning || selectedDeviceIds.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-md shadow-md shadow-emerald-600/30 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Farm Replay ({selectedDeviceIds.length})</span>
          </button>
        </div>
      </div>

      {/* Main Split: Left Device Grid + Right Screencast/Mirror */}
      <div className="flex-1 flex min-h-0">
        {/* Left Column: Device Pool Cards & Groups */}
        <div className="w-1/2 flex flex-col border-r border-slate-800 overflow-hidden bg-slate-950/40">
          {/* Groups Bar */}
          <div className="h-10 bg-slate-900/80 border-b border-slate-800 px-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-slate-300">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Device Groups ({deviceGroups.length})</span>
            </div>
            {showGroupInput ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Group Name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono"
                />
                <button
                  onClick={handleCreateGroup}
                  className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[11px] cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowGroupInput(false)}
                  className="px-1 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowGroupInput(true)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Group
              </button>
            )}
          </div>

          {/* Device Groups Badges */}
          {deviceGroups.length > 0 && (
            <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800 flex flex-wrap gap-2">
              {deviceGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-200"
                >
                  <span className="font-bold text-indigo-400">{group.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">({group.deviceIds.length} devs)</span>
                  <button
                    onClick={() => deleteDeviceGroup(group.id)}
                    className="p-0.5 text-slate-500 hover:text-rose-400 rounded ml-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Device Grid Cards */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
            {deviceProfiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                <Smartphone className="w-8 h-8 text-slate-600" />
                <p>No Android devices detected via ADB.</p>
                <p className="text-[11px] text-slate-600">Connect devices via USB or start Android emulators.</p>
              </div>
            ) : (
              deviceProfiles.map((dev) => {
                const devId = dev.deviceId;
                const isSelected = selectedDeviceIds.includes(devId);
                const isPrimary = primaryDevice?.deviceId === devId;

                return (
                  <div
                    key={devId}
                    className={`p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-slate-900 border-indigo-600/60 shadow-xs'
                        : 'bg-slate-900/50 border-slate-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Selection Checkbox & Model */}
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDeviceSelection(devId)}
                          className="mt-1 accent-indigo-500 cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{dev.model}</span>
                            {isPrimary && (
                              <span className="text-[9px] bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold px-1.5 py-0.5 rounded">
                                PRIMARY RECORDER
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {dev.manufacturer} • Serial: {dev.adbSerial}
                          </div>
                        </div>
                      </div>

                      {/* Health & Status Badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> API {dev.sdkVersion} (Android {dev.androidVersion})
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span>{dev.resolution.width}x{dev.resolution.height}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Strip */}
                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPrimaryDevice(devId)}
                          disabled={isPrimary}
                          className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-40 cursor-pointer"
                        >
                          {isPrimary ? '● Primary Active' : 'Set as Primary'}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                        <span className="capitalize">{dev.transport}</span>
                        <span>•</span>
                        <span>{dev.healthState || 'ready'}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Multi-Mirror Interactive Screencast */}
        <div className="w-1/2 flex flex-col bg-slate-950 overflow-hidden">
          {/* Header */}
          <div className="h-10 bg-slate-900/80 border-b border-slate-800 px-4 flex items-center justify-between">
            <span className="font-semibold text-slate-300">Live Device Farm Mirror</span>
            {primaryDevice && (
              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" /> Focused: {primaryDevice.model}
              </span>
            )}
          </div>

          {/* Screencast Arena */}
          <div className="flex-1 p-4 overflow-auto flex flex-col items-center justify-center space-y-4">
            {/* Primary Interactive Device Frame */}
            {primaryDevice ? (
              <div className="w-64 bg-slate-900 rounded-3xl border-4 border-slate-700 shadow-2xl p-2.5 flex flex-col justify-between h-96">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono px-2">
                  <span>10:45</span>
                  <span className="text-indigo-400 font-bold">PRIMARY</span>
                  <span>100%</span>
                </div>

                <div className="space-y-2 py-2 text-center">
                  <div className="font-bold text-xs text-white">{primaryDevice.model}</div>
                  <div className="text-[10px] text-slate-400 font-mono">Interactive Live Control</div>

                  {/* Simulated App View */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 my-2">
                    <div className="text-[11px] font-semibold text-emerald-300">ShopApp Multi-Device</div>
                    <button className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer">
                      <MousePointerClick className="w-3 h-3" /> Add Item to Cart
                    </button>
                    <button className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer">
                      <Zap className="w-3 h-3" /> Checkout Order
                    </button>
                  </div>
                </div>

                <div className="w-20 h-1 bg-slate-700 rounded-full mx-auto" />
              </div>
            ) : (
              <div className="text-slate-500 text-center">No primary device selected.</div>
            )}

            {/* Follower Devices Thumbnail Strip */}
            {followerDevices.length > 0 && (
              <div className="w-full border-t border-slate-800 pt-3">
                <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Follower Validator Mirrors ({followerDevices.length})</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {followerDevices.map((fDev) => (
                    <div
                      key={fDev.deviceId}
                      className="w-40 bg-slate-900 rounded-xl border border-slate-800 p-2 shrink-0 space-y-1.5"
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="font-bold text-white truncate">{fDev.model}</span>
                        <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1 rounded">SYNC</span>
                      </div>
                      <div className="h-20 bg-slate-950 rounded border border-slate-800/80 flex items-center justify-center text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" /> Validated
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Farm Run Modal */}
      <FarmRunModal isOpen={isFarmModalOpen} onClose={() => setIsFarmModalOpen(false)} />
    </div>
  );
};

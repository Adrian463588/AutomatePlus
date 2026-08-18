import React, { useEffect, useState } from 'react';
import { AlertTriangle, Circle, Globe, ShieldCheck, Smartphone, Square } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { ActionTimeline } from './ActionTimeline.js';
import { DeviceFarmPanel } from './DeviceFarmPanel.js';

export const VisualCanvas: React.FC = () => {
  const {
    activeSession,
    activeDevice,
    devices,
    isRecording,
    startRecording,
    stopRecording,
    addStep,
    updateTargetConfig,
  } = useAppStore();
  const [inputUrl, setInputUrl] = useState('');
  const [appPackage, setAppPackage] = useState('');
  const [assertionStrategy, setAssertionStrategy] = useState<'testId' | 'role' | 'accessibilityId' | 'resourceId' | 'text'>('testId');
  const [assertionLocator, setAssertionLocator] = useState('');
  const isAndroid = activeSession?.platform === 'android';
  const isApi = activeSession?.platform === 'api';

  useEffect(() => {
    setInputUrl(activeSession?.ir.targetConfig.startUrl ?? '');
    setAppPackage(activeSession?.ir.targetConfig.appPackage ?? '');
    setAssertionLocator('');
  }, [activeSession?.id, activeSession?.ir.targetConfig.startUrl, activeSession?.ir.targetConfig.appPackage]);

  const selectedDevice = devices.find((device) => device.id === activeDevice);
  const recordingBlockedReason = !activeSession
    ? 'Create and select a session first.'
    : isApi
      ? 'API sessions use the API builder; recording is not available.'
      : isAndroid
        ? (!appPackage.trim()
          ? 'Enter the real Android application package.'
          : !selectedDevice || selectedDevice.status !== 'device'
            ? 'Select an authorized device discovered by the native host.'
            : '')
        : !inputUrl.trim()
          ? 'Enter the real web target URL.'
          : '';

  const handleTargetBlur = async () => {
    if (!activeSession) return;
    if (isAndroid) {
      await updateTargetConfig({ ...activeSession.ir.targetConfig, appPackage: appPackage.trim() || undefined });
    } else {
      await updateTargetConfig({ ...activeSession.ir.targetConfig, startUrl: inputUrl.trim() || undefined });
    }
  };

  const handleAddAssertion = async () => {
    if (!activeSession || !assertionLocator.trim()) return;
    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: activeSession.ir.steps.length + 1,
      platform: isAndroid ? 'android' : 'web',
      action: 'assertVisible',
      locators: [{ strategy: assertionStrategy, value: assertionLocator.trim(), score: 0 }],
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
    setAssertionLocator('');
  };

  const targetLabel = isAndroid ? 'Package: ' + appPackage : 'Target: ' + inputUrl;
  const preflightClass = [
    'border-b border-slate-800 px-4 py-2 text-xs',
    recordingBlockedReason ? 'bg-amber-950/20 text-amber-300' : 'text-slate-500',
  ].join(' ');

  return (
    <div className="visual-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-800 bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isRecording ? (
            <button type="button" onClick={() => void stopRecording()} className="button-execute bg-rose-600 hover:bg-rose-500">
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />Recording · Stop
            </button>
          ) : (
            <button type="button" disabled={Boolean(recordingBlockedReason)} onClick={() => void startRecording(isAndroid ? 'android' : 'web', isAndroid ? undefined : inputUrl)} title={recordingBlockedReason || 'Start native recorder'} className="button-execute border border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white disabled:opacity-40">
              <Circle className="h-3.5 w-3.5 fill-rose-500" aria-hidden="true" />Start recorder
            </button>
          )}
          {isApi ? (
            <span className="text-xs text-slate-400">Use the API builder to send and record a real request.</span>
          ) : !isAndroid ? (
            <label className="field-inline">
              <Globe className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span className="sr-only">Web recording target URL</span>
              <input type="url" value={inputUrl} onChange={(event) => setInputUrl(event.target.value)} onBlur={() => void handleTargetBlur()} aria-describedby="recording-preflight" />
            </label>
          ) : (
            <label className="field-inline">
              <Smartphone className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span className="sr-only">Android application package</span>
              <input value={appPackage} onChange={(event) => setAppPackage(event.target.value)} onBlur={() => void handleTargetBlur()} aria-describedby="recording-preflight" />
            </label>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="field-inline">
            <span className="text-[10px] text-slate-500">Locator</span>
            <select value={assertionStrategy} onChange={(event) => setAssertionStrategy(event.target.value as typeof assertionStrategy)} aria-label="Assertion locator strategy">
              <option value="testId">testId</option>
              <option value="role">role</option>
              <option value="accessibilityId">accessibilityId</option>
              <option value="resourceId">resourceId</option>
              <option value="text">text</option>
            </select>
            <input value={assertionLocator} onChange={(event) => setAssertionLocator(event.target.value)} aria-label="Assertion locator value" />
          </label>
          <button type="button" onClick={() => void handleAddAssertion()} disabled={!activeSession || isApi || isRecording || !assertionLocator.trim()} title={isApi ? 'API sessions use the API builder for assertions' : 'Add a user-provided assertion locator'} className="button-small bg-slate-800 hover:bg-slate-700 disabled:opacity-40">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />Add assertion
          </button>
        </div>
      </div>
      <p id="recording-preflight" className={preflightClass} role="status" aria-live="polite">
        {recordingBlockedReason || targetLabel}
      </p>
      {isAndroid && <DeviceFarmPanel />}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="recorder-status-card flex min-h-[35%] items-center justify-center border-b border-slate-800/80 bg-slate-950/80 p-6">
          <div className="w-full max-w-3xl rounded-lg border border-slate-800 bg-slate-900/80 p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-400" aria-hidden="true" />
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-100">{!activeSession ? 'Workspace setup required' : isApi ? 'API builder required' : isAndroid ? 'Android recorder preflight' : 'Web recorder preflight'}</h2>
                <p className="text-sm leading-6 text-slate-300">
                  {!activeSession
                    ? 'Create a local project and a session in the explorer. The shell will not create a target, device, or sample actions for you.'
                    : isApi
                      ? 'API sessions are configured in the API builder so requests, assertions, and extraction variables stay in the canonical IR.'
                      : isAndroid
                        ? 'The native Tauri/Rust host owns ADB discovery, device locks, hierarchy capture, and gesture recording.'
                        : 'The native Tauri/Rust host owns the headed browser, CDP transport, and ActionIR event capture.'}
                </p>
                <p className="text-xs text-amber-300/90">Browser migration evidence is status-only. Missing runtimes, devices, packages, and targets remain blocked.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col bg-slate-950">
          <ActionTimeline />
        </div>
      </div>
    </div>
  );
};

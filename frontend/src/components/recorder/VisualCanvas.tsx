import React, { useEffect, useState } from 'react';
import { Circle, Plus, Square } from 'lucide-react';
import { type ActionType, type LocatorStrategy } from '@automate-plus/ir-schema';
import { useAppStore } from '../../store/appStore.js';
import { bridge } from '../../services/desktopBridge.js';
import { Button, Field, Select, StatusMessage } from '../common/UiPrimitives.js';
import { ActionTimeline } from './ActionTimeline.js';
import { DeviceFarmPanel } from './DeviceFarmPanel.js';

export const VisualCanvas: React.FC = () => {
  const { activeSession, activeDevice, devices, isRecording, startRecording, stopRecording, addStep, updateTargetConfig, setActiveTab } = useAppStore();
  const [target, setTarget] = useState('');
  const [action, setAction] = useState<ActionType>('navigate');
  const [strategy, setStrategy] = useState<LocatorStrategy>('role');
  const [locator, setLocator] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAndroid = activeSession?.platform === 'android';
  const isApi = activeSession?.platform === 'api';
  const noLocator = ['navigate', 'assertUrl', 'back', 'home', 'enter', 'sleep'].includes(action);
  const needsValue = ['fill', 'navigate', 'assertUrl', 'assertText', 'assertValue', 'sleep'].includes(action);
  const effectiveValue = action === 'navigate' ? value.trim() || target.trim() : value;
  const ready = Boolean(activeSession && !isApi && !busy && !isRecording && (noLocator || locator.trim()) && (!needsValue || effectiveValue.trim()));
  const host = bridge.getNativeHostStatus();
  const selectedDevice = devices.find((device) => device.id === activeDevice && device.status === 'device');
  const recordingReason = !activeSession ? 'Create a project and session first.'
    : isApi ? 'Use API Builder to compose requests.'
      : !target.trim() ? `Enter the ${isAndroid ? 'application package' : 'target URL'} first.`
        : isAndroid && !selectedDevice ? 'Select an authorized Android device.'
          : !(isAndroid ? host.androidRecording : host.nativeExecution) ? 'Recording requires a connected native recorder and verified runtime. Compose explicit actions below.' : '';

  useEffect(() => {
    setTarget(isAndroid ? activeSession?.ir.targetConfig.appPackage ?? '' : activeSession?.ir.targetConfig.startUrl ?? '');
    setAction(isAndroid ? 'tap' : 'navigate');
    setStrategy(isAndroid ? 'accessibilityId' : 'role');
    setLocator(''); setValue(''); setError('');
  }, [activeSession?.id]);

  const saveTarget = async () => {
    if (!activeSession) return;
    try {
      await updateTargetConfig({ ...activeSession.ir.targetConfig, ...(isAndroid ? { appPackage: target.trim() || undefined } : { startUrl: target.trim() || undefined }) });
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };

  const submitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !activeSession) return;
    setBusy(true); setError('');
    try {
      if (action === 'navigate' || action === 'assertUrl') {
        const parsed = new URL(effectiveValue);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a complete HTTP or HTTPS URL.');
      }
      if (action === 'sleep' && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 600000)) throw new Error('Sleep duration must be an integer between 1 and 600000 ms.');
      await addStep({
        id: crypto.randomUUID(), schemaVersion: 2, stepNumber: activeSession.ir.steps.length + 1,
        platform: isAndroid ? 'android' : 'web', action,
        locators: noLocator ? undefined : [{ strategy, value: locator.trim(), score: 0 }],
        value: action === 'navigate' || action === 'fill' ? effectiveValue : undefined,
        expectedValue: ['assertUrl', 'assertText', 'assertValue'].includes(action) ? effectiveValue : undefined,
        timeoutMs: action === 'sleep' ? Number(value) : 5000, timestamp: Date.now(), optional: false,
      });
      setLocator(''); setValue('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };

  const actionTypes = isAndroid
    ? ['tap', 'fill', 'assertVisible', 'assertText', 'back', 'home', 'enter', 'sleep']
    : ['navigate', 'click', 'fill', 'assertVisible', 'assertText', 'assertValue', 'assertUrl'];
  const locatorTypes = isAndroid
    ? ['accessibilityId', 'resourceId', 'text', 'xpath']
    : ['role', 'testId', 'id', 'label', 'text', 'css', 'xpath'];

  return (
    <section className="visual-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-800" aria-label="Recorder and action editor">
      <div className="recorder-form overflow-y-auto">
        <div className="flex flex-col gap-2">
          <h2>{activeSession ? activeSession.name : 'Build your first automation'}</h2>
          <p className="recorder-hint">{activeSession ? 'Set a real target, compose actions, then choose a framework in Generated code.' : 'Create a project in Workspace, add a Web, Android or API session, then compose your test.'}</p>
        </div>
        {isApi ? (
          <Button onClick={() => setActiveTab('api_builder')}>Open API Builder</Button>
        ) : (
          <>
            <Field id={isAndroid ? 'android-application-package' : 'web-recording-target-url'} label={isAndroid ? 'Android application package' : 'Target URL'} type={isAndroid ? 'text' : 'url'} value={target} disabled={!activeSession} title={!activeSession ? 'Create a session to configure its target.' : undefined} onChange={(event) => setTarget(event.target.value)} onBlur={() => void saveTarget()} hint={isAndroid ? 'Use the installed application package.' : 'Use the full address of the website under test.'} />
            <div className="recorder-actions">
              {isRecording ? (
                <Button onClick={() => void stopRecording()}><Square className="h-4 w-4" aria-hidden="true" />Stop recording</Button>
              ) : (
                <Button disabled={Boolean(recordingReason)} disabledReason={recordingReason} onClick={() => void startRecording(isAndroid ? 'android' : 'web', isAndroid ? undefined : target)}><Circle className="h-4 w-4" aria-hidden="true" />Start recorder</Button>
              )}
              <Button onClick={() => setActiveTab('runtime')}>Review runtimes</Button>
            </div>
            {recordingReason && <p className="recorder-hint" role="status">{recordingReason}</p>}
            <form onSubmit={(event) => void submitAction(event)} aria-busy={busy} className="flex flex-col gap-4">
              <div className="recorder-form-row">
                <Select id="action-type" label="Action" value={action} disabled={!activeSession || busy} title={!activeSession ? 'Create a session first.' : 'Choose an action to add.'} onChange={(event) => { setAction(event.target.value as ActionType); setError(''); }} options={actionTypes.map((item) => ({ value: item, label: item }))} />
                {!noLocator && <Select id="locator-strategy" label="Locator strategy" value={strategy} onChange={(event) => setStrategy(event.target.value as LocatorStrategy)} options={locatorTypes.map((item) => ({ value: item, label: item }))} />}
              </div>
              {!noLocator && <Field id="action-locator" label="Element locator" value={locator} onChange={(event) => setLocator(event.target.value)} hint="Enter a selector observed on the real target. Recorded candidates are ranked automatically." />}
              {needsValue && <Field id="action-value" label={action === 'sleep' ? 'Duration (ms)' : action.startsWith('assert') ? 'Expected value' : 'Action value'} value={value} onChange={(event) => setValue(event.target.value)} hint={action === 'navigate' ? 'Leave empty to use Target URL.' : undefined} />}
              {error && <StatusMessage tone="error">{error}</StatusMessage>}
              <div className="recorder-actions">
                <Button type="submit" variant="primary" busy={busy} disabled={!ready} disabledReason={!activeSession ? 'Create a session first.' : 'Complete the action fields before adding it.'}><Plus className="h-4 w-4" aria-hidden="true" />Add action</Button>
              </div>
            </form>
          </>
        )}
      </div>
      {isAndroid && <DeviceFarmPanel />}
      <ActionTimeline />
    </section>
  );
};

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Circle, Globe, Plus, Repeat, ShieldCheck, Smartphone, Square } from 'lucide-react';
import { type ActionIR, type ActionType, type LocatorStrategy } from '@automate-plus/ir-schema';
import { useAppStore } from '../../store/appStore.js';
import { ActionTimeline } from './ActionTimeline.js';
import { DeviceFarmPanel } from './DeviceFarmPanel.js';
import { WebDriverCanvas } from './WebDriverCanvas.js';

export const SAUCEDEMO_TEMPLATE_STEPS: ActionIR[] = [
  { id: 'a1000000-0000-4000-8000-000000000001', schemaVersion: 2, stepNumber: 1, platform: 'web', action: 'navigate', value: 'https://www.saucedemo.com/', timeoutMs: 5000, timestamp: 1000, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000002', schemaVersion: 2, stepNumber: 2, platform: 'web', action: 'fill', value: 'standard_user', locators: [{ strategy: 'testId', value: 'username', score: 100 }, { strategy: 'css', value: '#user-name', score: 80 }], timeoutMs: 5000, timestamp: 1050, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000003', schemaVersion: 2, stepNumber: 3, platform: 'web', action: 'fill', value: 'secret_sauce', locators: [{ strategy: 'testId', value: 'password', score: 100 }, { strategy: 'css', value: '#password', score: 80 }], timeoutMs: 5000, timestamp: 1100, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000004', schemaVersion: 2, stepNumber: 4, platform: 'web', action: 'click', locators: [{ strategy: 'testId', value: 'login-button', score: 100 }, { strategy: 'css', value: '#login-button', score: 80 }], timeoutMs: 5000, timestamp: 1150, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000005', schemaVersion: 2, stepNumber: 5, platform: 'web', action: 'assertUrl', expectedValue: 'https://www.saucedemo.com/inventory.html', timeoutMs: 5000, timestamp: 1200, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000006', schemaVersion: 2, stepNumber: 6, platform: 'web', action: 'assertVisible', locators: [{ strategy: 'testId', value: 'inventory-container', score: 100 }, { strategy: 'css', value: '.inventory_list', score: 80 }], timeoutMs: 5000, timestamp: 1250, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000007', schemaVersion: 2, stepNumber: 7, platform: 'web', action: 'click', locators: [{ strategy: 'testId', value: 'add-to-cart-sauce-labs-backpack', score: 100 }], timeoutMs: 5000, timestamp: 1300, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000008', schemaVersion: 2, stepNumber: 8, platform: 'web', action: 'click', locators: [{ strategy: 'testId', value: 'shopping-cart-link', score: 100 }], timeoutMs: 5000, timestamp: 1350, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000009', schemaVersion: 2, stepNumber: 9, platform: 'web', action: 'click', locators: [{ strategy: 'testId', value: 'checkout', score: 100 }], timeoutMs: 5000, timestamp: 1400, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000010', schemaVersion: 2, stepNumber: 10, platform: 'web', action: 'fill', value: 'John', locators: [{ strategy: 'testId', value: 'firstName', score: 100 }], timeoutMs: 5000, timestamp: 1450, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000011', schemaVersion: 2, stepNumber: 11, platform: 'web', action: 'fill', value: 'Doe', locators: [{ strategy: 'testId', value: 'lastName', score: 100 }], timeoutMs: 5000, timestamp: 1500, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000012', schemaVersion: 2, stepNumber: 12, platform: 'web', action: 'fill', value: '94043', locators: [{ strategy: 'testId', value: 'postalCode', score: 100 }], timeoutMs: 5000, timestamp: 1550, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000013', schemaVersion: 2, stepNumber: 13, platform: 'web', action: 'click', locators: [{ strategy: 'testId', value: 'continue', score: 100 }], timeoutMs: 5000, timestamp: 1600, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000014', schemaVersion: 2, stepNumber: 14, platform: 'web', action: 'click', locators: [{ strategy: 'testId', value: 'finish', score: 100 }], timeoutMs: 5000, timestamp: 1650, optional: false },
  { id: 'a1000000-0000-4000-8000-000000000015', schemaVersion: 2, stepNumber: 15, platform: 'web', action: 'assertText', expectedValue: 'Thank you for your order!', locators: [{ strategy: 'testId', value: 'complete-header', score: 100 }], timeoutMs: 5000, timestamp: 1700, optional: false },
];

export const ORANGEHRM_TEMPLATE_STEPS: ActionIR[] = [
  { id: 'b1000000-0000-4000-8000-000000000001', schemaVersion: 2, stepNumber: 1, platform: 'web', action: 'navigate', value: 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login', timeoutMs: 5000, timestamp: 1000, optional: false },
  { id: 'b1000000-0000-4000-8000-000000000002', schemaVersion: 2, stepNumber: 2, platform: 'web', action: 'fill', value: 'Admin', locators: [{ strategy: 'css', value: 'input[name="username"]', score: 95 }, { strategy: 'testId', value: 'username', score: 90 }], timeoutMs: 5000, timestamp: 1050, optional: false },
  { id: 'b1000000-0000-4000-8000-000000000003', schemaVersion: 2, stepNumber: 3, platform: 'web', action: 'fill', value: 'admin123', locators: [{ strategy: 'css', value: 'input[name="password"]', score: 95 }, { strategy: 'testId', value: 'password', score: 90 }], timeoutMs: 5000, timestamp: 1100, optional: false },
  { id: 'b1000000-0000-4000-8000-000000000004', schemaVersion: 2, stepNumber: 4, platform: 'web', action: 'click', locators: [{ strategy: 'css', value: 'button[type="submit"]', score: 95 }, { strategy: 'role', value: 'button[name="Login"]', score: 90 }], timeoutMs: 5000, timestamp: 1150, optional: false },
  { id: 'b1000000-0000-4000-8000-000000000005', schemaVersion: 2, stepNumber: 5, platform: 'web', action: 'assertUrl', expectedValue: 'https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index', timeoutMs: 5000, timestamp: 1200, optional: false },
  { id: 'b1000000-0000-4000-8000-000000000006', schemaVersion: 2, stepNumber: 6, platform: 'web', action: 'assertVisible', locators: [{ strategy: 'css', value: '.oxd-topbar-header-breadcrumb', score: 95 }], timeoutMs: 5000, timestamp: 1250, optional: false },
];

const APIDEMOS_TEMPLATE_STEPS: ActionIR[] = [
  { id: 'ad000000-0000-4000-8000-000000000001', schemaVersion: 2, stepNumber: 1, platform: 'android', action: 'tap', locators: [{ strategy: 'accessibilityId', value: 'Views', score: 100 }, { strategy: 'text', value: 'Views', score: 90 }], timeoutMs: 5000, timestamp: 1000, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000002', schemaVersion: 2, stepNumber: 2, platform: 'android', action: 'assertVisible', locators: [{ strategy: 'accessibilityId', value: 'Views', score: 100 }], timeoutMs: 5000, timestamp: 1050, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000003', schemaVersion: 2, stepNumber: 3, platform: 'android', action: 'tap', locators: [{ strategy: 'accessibilityId', value: 'Controls', score: 100 }, { strategy: 'text', value: 'Controls', score: 90 }], timeoutMs: 5000, timestamp: 1100, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000004', schemaVersion: 2, stepNumber: 4, platform: 'android', action: 'tap', locators: [{ strategy: 'accessibilityId', value: '1. Light Theme', score: 100 }, { strategy: 'text', value: '1. Light Theme', score: 90 }], timeoutMs: 5000, timestamp: 1150, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000005', schemaVersion: 2, stepNumber: 5, platform: 'android', action: 'fill', value: 'AutomatePlus Test', locators: [{ strategy: 'resourceId', value: 'io.appium.android.apis:id/edit', score: 100 }, { strategy: 'xpath', value: '//android.widget.EditText', score: 80 }], timeoutMs: 5000, timestamp: 1200, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000006', schemaVersion: 2, stepNumber: 6, platform: 'android', action: 'assertText', expectedValue: 'AutomatePlus Test', locators: [{ strategy: 'resourceId', value: 'io.appium.android.apis:id/edit', score: 100 }], timeoutMs: 5000, timestamp: 1250, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000007', schemaVersion: 2, stepNumber: 7, platform: 'android', action: 'tap', locators: [{ strategy: 'accessibilityId', value: 'Checkbox 1', score: 100 }, { strategy: 'resourceId', value: 'io.appium.android.apis:id/check1', score: 90 }], timeoutMs: 5000, timestamp: 1300, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000008', schemaVersion: 2, stepNumber: 8, platform: 'android', action: 'sleep', timeoutMs: 500, timestamp: 1350, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000009', schemaVersion: 2, stepNumber: 9, platform: 'android', action: 'back', timeoutMs: 5000, timestamp: 1400, optional: false },
  { id: 'ad000000-0000-4000-8000-000000000010', schemaVersion: 2, stepNumber: 10, platform: 'android', action: 'home', timeoutMs: 5000, timestamp: 1450, optional: false },
];

const NOTIPLUS_TEMPLATE_STEPS: ActionIR[] = [
  { id: 'np000000-0000-4000-8000-000000000001', schemaVersion: 2, stepNumber: 1, platform: 'android', action: 'tap', locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/action_search', score: 100 }, { strategy: 'accessibilityId', value: 'Search', score: 90 }], timeoutMs: 5000, timestamp: 1000, optional: false },
  { id: 'np000000-0000-4000-8000-000000000002', schemaVersion: 2, stepNumber: 2, platform: 'android', action: 'fill', value: 'NotiPlus', locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/search_src_text', score: 100 }, { strategy: 'xpath', value: '//android.widget.EditText', score: 80 }], timeoutMs: 5000, timestamp: 1050, optional: false },
  { id: 'np000000-0000-4000-8000-000000000003', schemaVersion: 2, stepNumber: 3, platform: 'android', action: 'assertVisible', locators: [{ strategy: 'resourceId', value: 'com.notifplus:id/search_src_text', score: 100 }], timeoutMs: 5000, timestamp: 1100, optional: false },
  { id: 'np000000-0000-4000-8000-000000000004', schemaVersion: 2, stepNumber: 4, platform: 'android', action: 'enter', timeoutMs: 5000, timestamp: 1150, optional: false },
  { id: 'np000000-0000-4000-8000-000000000005', schemaVersion: 2, stepNumber: 5, platform: 'android', action: 'back', timeoutMs: 5000, timestamp: 1200, optional: false },
  { id: 'np000000-0000-4000-8000-000000000006', schemaVersion: 2, stepNumber: 6, platform: 'android', action: 'home', timeoutMs: 5000, timestamp: 1250, optional: false },
];

export const VisualCanvas: React.FC = () => {
  const {
    activeSession,
    activeDevice,
    devices,
    isRecording,
    startRecording,
    stopRecording,
    addStep,
    loadTemplateSteps,
    updateTargetConfig,
    runLooping,
  } = useAppStore();
  const [inputUrl, setInputUrl] = useState('');
  const [appPackage, setAppPackage] = useState('');
  const [assertionStrategy, setAssertionStrategy] = useState<LocatorStrategy>('role');
  const [assertionLocator, setAssertionLocator] = useState('');
  const [webAction, setWebAction] = useState<ActionType>('click');
  const [webLocator, setWebLocator] = useState('');
  const [webValue, setWebValue] = useState('');
  const [androidAction, setAndroidAction] = useState<ActionType>('tap');
  const [androidLocator, setAndroidLocator] = useState('');
  const [androidValue, setAndroidValue] = useState('');
  const isAndroid = activeSession?.platform === 'android';
  const isApi = activeSession?.platform === 'api';
  const assertionOptions: Array<{ value: LocatorStrategy; label: string }> = isAndroid
    ? [
      { value: 'accessibilityId', label: 'Accessibility ID' },
      { value: 'resourceId', label: 'Resource ID' },
      { value: 'text', label: 'Visible text' },
      { value: 'xpath', label: 'XPath (last resort)' },
    ]
    : [
      { value: 'role', label: 'Role (semantic)' },
      { value: 'testId', label: 'Test ID (data-testid)' },
      { value: 'id', label: 'HTML id' },
      { value: 'label', label: 'Label' },
      { value: 'text', label: 'Visible text' },
      { value: 'css', label: 'CSS (explicit)' },
      { value: 'xpath', label: 'XPath (last resort)' },
    ];

  useEffect(() => {
    setInputUrl(activeSession?.ir.targetConfig.startUrl ?? '');
    setAppPackage(activeSession?.ir.targetConfig.appPackage ?? '');
    setAssertionLocator('');
  }, [activeSession?.id, activeSession?.ir.targetConfig.startUrl, activeSession?.ir.targetConfig.appPackage]);

  useEffect(() => {
    setAssertionStrategy(activeSession?.platform === 'android' ? 'accessibilityId' : 'role');
  }, [activeSession?.id, activeSession?.platform]);

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

  const handleAddWebAction = async () => {
    if (!activeSession) return;
    const isNav = webAction === 'navigate';
    const isAssertUrl = webAction === 'assertUrl';
    const isNoLoc = isNav || isAssertUrl;
    if (!isNoLoc && !webLocator.trim()) return;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: activeSession.ir.steps.length + 1,
      platform: 'web',
      action: webAction,
      locators: isNoLoc ? undefined : [{ strategy: assertionStrategy, value: webLocator.trim(), score: 90 }],
      value: isNav ? (webValue.trim() || inputUrl.trim()) : (webAction === 'fill' ? webValue : undefined),
      expectedValue: (isAssertUrl || webAction === 'assertText' || webAction === 'assertValue') ? webValue.trim() : undefined,
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
    setWebLocator('');
    setWebValue('');
  };

  const handleAddAndroidAction = async () => {
    if (!activeSession) return;
    const isNoLoc = androidAction === 'back' || androidAction === 'home' || androidAction === 'enter' || androidAction === 'sleep';
    if (!isNoLoc && !androidLocator.trim()) return;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: activeSession.ir.steps.length + 1,
      platform: 'android',
      action: androidAction,
      locators: isNoLoc ? undefined : [{ strategy: assertionStrategy, value: androidLocator.trim(), score: 90 }],
      value: androidAction === 'fill' ? androidValue : undefined,
      expectedValue: (androidAction === 'assertText' || androidAction === 'assertValue') ? androidValue.trim() : undefined,
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
    setAndroidLocator('');
    setAndroidValue('');
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
              <input id="web-recording-target-url" name="targetUrl" type="url" value={inputUrl} onChange={(event) => setInputUrl(event.target.value)} onBlur={() => void handleTargetBlur()} aria-describedby="recording-preflight" />
            </label>
          ) : (
            <label className="field-inline">
              <Smartphone className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span className="sr-only">Android application package</span>
              <input id="android-application-package" name="appPackage" value={appPackage} onChange={(event) => setAppPackage(event.target.value)} onBlur={() => void handleTargetBlur()} aria-describedby="recording-preflight" />
            </label>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isAndroid && !isApi && (
            <div className="flex items-center gap-1.5 border-r border-slate-800 pr-2">
              <label htmlFor="web-action-type" className="sr-only">Web action type</label>
              <select
                id="web-action-type"
                name="webActionType"
                value={webAction}
                onChange={(e) => setWebAction(e.target.value as ActionType)}
                className="ap-select text-xs py-1"
                aria-label="Action type"
              >
                <option value="click">click</option>
                <option value="fill">fill</option>
                <option value="navigate">navigate</option>
                <option value="assertUrl">assertUrl</option>
                <option value="assertVisible">assertVisible</option>
                <option value="assertText">assertText</option>
              </select>
              {webAction !== 'navigate' && webAction !== 'assertUrl' && (
                <input
                  id="web-action-locator"
                  name="webActionLocator"
                  value={webLocator}
                  onChange={(e) => setWebLocator(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono w-32 focus:outline-none focus:border-cyan-500"
                  aria-label="Web action locator"
                />
              )}
              {(webAction === 'fill' || webAction === 'navigate' || webAction === 'assertUrl' || webAction === 'assertText') && (
                <input
                  id="web-action-value"
                  name="webActionValue"
                  value={webValue}
                  onChange={(e) => setWebValue(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono w-32 focus:outline-none focus:border-cyan-500"
                  aria-label="Web action value"
                />
              )}
              <button
                type="button"
                onClick={() => void handleAddWebAction()}
                disabled={!activeSession || isRecording}
                className="button-small bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-700/60 disabled:opacity-40"
                title="Add web action step"
              >
                <Plus className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />Add step
              </button>
            </div>
          )}
          {isAndroid && (
            <div className="flex items-center gap-1.5 border-r border-slate-800 pr-2">
              <label htmlFor="android-action-type" className="sr-only">Android action type</label>
              <select
                id="android-action-type"
                name="androidActionType"
                value={androidAction}
                onChange={(e) => setAndroidAction(e.target.value as ActionType)}
                className="ap-select text-xs py-1"
                aria-label="Action type"
              >
                <option value="tap">tap</option>
                <option value="fill">fill</option>
                <option value="assertVisible">assertVisible</option>
                <option value="assertText">assertText</option>
                <option value="back">back</option>
                <option value="home">home</option>
                <option value="enter">enter</option>
                <option value="sleep">sleep</option>
              </select>
              {androidAction !== 'back' && androidAction !== 'home' && androidAction !== 'enter' && androidAction !== 'sleep' && (
                <input
                  id="android-action-locator"
                  name="androidActionLocator"
                  value={androidLocator}
                  onChange={(e) => setAndroidLocator(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono w-32 focus:outline-none focus:border-cyan-500"
                  aria-label="Android action locator"
                />
              )}
              {(androidAction === 'fill' || androidAction === 'assertText') && (
                <input
                  id="android-action-value"
                  name="androidActionValue"
                  value={androidValue}
                  onChange={(e) => setAndroidValue(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono w-32 focus:outline-none focus:border-cyan-500"
                  aria-label="Android action value"
                />
              )}
              <button
                type="button"
                id="add-android-step-button"
                onClick={() => void handleAddAndroidAction()}
                disabled={!activeSession || isRecording}
                className="button-small bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-700/60 disabled:opacity-40"
                title="Add android action step"
              >
                <Plus className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />Add step
              </button>
            </div>
          )}
          <label className="field-inline">
            <span className="text-[10px] text-slate-400">Locator</span>
            <select id="assertion-locator-strategy" name="assertionStrategy" value={assertionStrategy} onChange={(event) => setAssertionStrategy(event.target.value as LocatorStrategy)} aria-label="Assertion locator strategy">
              {assertionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input id="assertion-locator-value" name="assertionLocator" value={assertionLocator} onChange={(event) => setAssertionLocator(event.target.value)} aria-label="Assertion locator value" />
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
        {activeSession?.platform === 'web' ? (
          <WebDriverCanvas />
        ) : (
          <div className="recorder-status-card flex min-h-[35%] items-center justify-center border-b border-slate-800/80 bg-slate-950/80 p-6">
            <div className="w-full max-w-3xl rounded-lg border border-slate-800 bg-slate-900/80 p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-400" aria-hidden="true" />
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-slate-100">{!activeSession ? 'Workspace setup required' : isApi ? 'API builder required' : 'Android recorder preflight'}</h2>
                  <p className="text-sm leading-6 text-slate-300">
                    {!activeSession
                      ? 'Create a local project and a session in the explorer. The shell will not create a target, device, or sample actions for you.'
                      : isApi
                        ? 'API sessions are configured in the API builder so requests, assertions, and extraction variables stay in the canonical IR.'
                        : 'The native Tauri/Rust host owns ADB discovery, device locks, hierarchy capture, and gesture recording.'}
                  </p>
                  {activeSession?.platform === 'android' && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                      <span className="text-xs text-slate-400">Quick E2E Targets:</span>
                      <button
                        type="button"
                        id="load-apidemos-flow"
                        onClick={() => {
                          setAppPackage('io.appium.android.apis');
                          void loadTemplateSteps(APIDEMOS_TEMPLATE_STEPS, { appPackage: 'io.appium.android.apis', appActivity: '.ApiDemos' });
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/70"
                        title="Load ApiDemos mobile test flow"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ApiDemos Flow (10 steps)</span>
                      </button>
                      <button
                        type="button"
                        id="load-notiplus-flow"
                        onClick={() => {
                          setAppPackage('com.notifplus');
                          void loadTemplateSteps(NOTIPLUS_TEMPLATE_STEPS, { appPackage: 'com.notifplus', appActivity: '.MainActivity' });
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold bg-teal-950 hover:bg-teal-900 text-teal-200 border border-teal-700/70"
                        title="Load NotiPlus notification test flow"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-teal-400" />
                        <span>NotiPlus Flow (6 steps)</span>
                      </button>
                      <button
                        type="button"
                        id="run-notiplus-loop-3x"
                        onClick={async () => {
                          setAppPackage('com.notifplus');
                          await loadTemplateSteps(NOTIPLUS_TEMPLATE_STEPS, { appPackage: 'com.notifplus', appActivity: '.MainActivity' });
                          void runLooping(3);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-700/70"
                        title="Run 3x Looping replay on NotiPlus"
                      >
                        <Repeat className="w-3.5 h-3.5 text-amber-400" />
                        <span>Run 3x Loop (NotiPlus)</span>
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-amber-300/90">Browser migration evidence is status-only. Missing runtimes, devices, packages, and targets remain blocked.</p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col bg-slate-950">
          <ActionTimeline />
        </div>
      </div>
    </div>
  );
};

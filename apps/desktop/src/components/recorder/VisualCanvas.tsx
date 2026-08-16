import React, { useState } from 'react';
import { AlertTriangle, Circle, Globe, ShieldCheck, Smartphone, Square } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { ActionTimeline } from './ActionTimeline.js';

/**
 * Browser-safe migration surface for the native recorder workspace.
 *
 * The actual browser/device interaction belongs to the WinUI host and its
 * verified runtime packs. Keeping this surface status-driven prevents a mock
 * canvas from being mistaken for recorder evidence.
 */
export const VisualCanvas: React.FC = () => {
  const {
    activeSession,
    isRecording,
    startRecording,
    stopRecording,
    addStep,
  } = useAppStore();
  const [inputUrl, setInputUrl] = useState(activeSession?.ir.targetConfig.startUrl || 'http://127.0.0.1:4173');
  const isAndroid = activeSession?.platform === 'android';

  const handleStart = async () => {
    await startRecording(isAndroid ? 'android' : 'web', isAndroid ? undefined : inputUrl);
  };

  const handleAddAssertion = async () => {
    if (!activeSession) return;
    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: activeSession.ir.steps.length + 1,
      platform: isAndroid ? 'android' : 'web',
      action: 'assertVisible',
      locators: [
        {
          strategy: isAndroid ? 'resourceId' : 'testId',
          value: isAndroid ? 'com.automateplus.shop:id/header_title' : 'dashboard-header',
          score: 100,
        },
      ],
      timeoutMs: 5_000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950/40 border-r border-slate-800 overflow-hidden">
      <div className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRecording ? (
            <button
              onClick={() => void stopRecording()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs animate-pulse shadow-md shadow-rose-600/30 transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Recording... Stop</span>
            </button>
          ) : (
            <button
              onClick={() => void handleStart()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 font-semibold text-xs shadow-sm transition-all"
            >
              <Circle className="w-3.5 h-3.5 fill-rose-500" />
              <span>Start native recorder</span>
            </button>
          )}

          {!isAndroid ? (
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300 w-80">
              <Globe className="w-3.5 h-3.5 text-sky-400 mr-2 shrink-0" />
              <input
                type="url"
                value={inputUrl}
                onChange={(event) => setInputUrl(event.target.value)}
                className="bg-transparent text-xs w-full focus:outline-none font-mono text-slate-200"
                placeholder="http://127.0.0.1:4173"
                aria-label="Web recording target URL"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/40 px-3 py-1 rounded border border-emerald-800/60">
              <Smartphone className="w-3.5 h-3.5" />
              <span>{activeSession?.ir.targetConfig.appPackage || 'Select an Android package'}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => void handleAddAssertion()}
          disabled={!activeSession || isRecording}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-40"
          title="Add a manual assertion to the session"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Add assertion</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="min-h-[46%] p-6 bg-slate-950/80 flex items-center justify-center border-b border-slate-800/80">
          <div className="w-full max-w-3xl rounded-lg border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-100">
                  {isAndroid ? 'Android device recorder' : 'Web browser recorder'}
                </h3>
                <p className="text-sm text-slate-300 leading-6">
                  {isAndroid
                    ? 'The native WinUI host acquires an exclusive ADB device lock, reads the UI hierarchy, and records tap, swipe, drag, text, and navigation events.'
                    : 'The native WinUI host launches a headed Playwright/CDP browser and converts observed DOM events into ranked ActionIR locators.'}
                </p>
                <p className="text-xs text-amber-300/90">
                  The browser migration shell does not render a synthetic device or website. Missing host runtimes and devices stay Blocked.
                </p>
                <div className="rounded border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-mono text-slate-400">
                  {isAndroid ? 'ADB / scrcpy runtime health is owned by the native host.' : `Target: ${inputUrl}`}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-slate-950 flex flex-col">
          <ActionTimeline />
        </div>
      </div>
    </div>
  );
};

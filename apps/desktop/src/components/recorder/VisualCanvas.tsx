import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Circle,
  Square,
  Globe,
  Smartphone,
  MousePointerClick,
  TextCursorInput,
  Plus,
  ShieldCheck,
  Move,
  ArrowUpDown,
  Hand,
  RotateCcw,
} from 'lucide-react';
import { ActionTimeline } from './ActionTimeline.js';

export const VisualCanvas: React.FC = () => {
  const {
    activeSession,
    isRecording,
    startRecording,
    stopRecording,
    addStep,
  } = useAppStore();

  const [inputUrl, setInputUrl] = useState(
    activeSession?.ir.targetConfig.startUrl || 'https://demo.automateplus.io'
  );
  const [typedInput, setTypedInput] = useState('');

  const isAndroid = activeSession?.platform === 'android';

  const handleSimulateWebClick = (testId: string, label: string) => {
    if (!isRecording) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: testId, score: 100 },
        { strategy: 'role', role: 'button', name: label, value: label, score: 90 },
      ],
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  const handleSimulateWebDragAndDrop = () => {
    if (!isRecording) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'web',
      action: 'dragAndDrop',
      locators: [{ strategy: 'testId', value: 'draggable-item-1', score: 100 }],
      dragTarget: {
        locators: [{ strategy: 'testId', value: 'dropzone-target', score: 100 }],
      },
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  const handleSimulateWebScroll = () => {
    if (!isRecording) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'web',
      action: 'scroll',
      scrollOffset: { deltaX: 0, deltaY: 300 },
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  const handleSimulateWebType = (testId: string, value: string) => {
    if (!isRecording || !value.trim()) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'web',
      action: 'fill',
      value: value.trim(),
      locators: [{ strategy: 'testId', value: testId, score: 100 }],
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
    setTypedInput('');
  };

  const handleSimulateAndroidTap = (resourceId: string, text: string) => {
    if (!isRecording) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'android',
      action: 'tap',
      locators: [
        { strategy: 'resourceId', value: resourceId, score: 100 },
        { strategy: 'text', value: text, score: 65 },
      ],
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  const handleSimulateAndroidSwipe = () => {
    if (!isRecording) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'android',
      action: 'swipe',
      swipeVector: { startX: 540, startY: 1600, endX: 540, endY: 600, durationMs: 400 },
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  const handleSimulateAndroidDrag = () => {
    if (!isRecording) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'android',
      action: 'drag',
      locators: [{ strategy: 'resourceId', value: 'com.app:id/item_card', score: 100 }],
      dragTarget: {
        locators: [{ strategy: 'resourceId', value: 'com.app:id/cart_dropzone', score: 100 }],
      },
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  const handleSimulateAndroidBack = () => {
    if (!isRecording) return;
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: 'android',
      action: 'back',
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  const handleAddAssertion = () => {
    addStep({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      stepNumber: (activeSession?.ir.steps.length ?? 0) + 1,
      platform: isAndroid ? 'android' : 'web',
      action: 'assertVisible',
      locators: [
        {
          strategy: isAndroid ? 'resourceId' : 'testId',
          value: isAndroid ? 'com.app:id/header_title' : 'header-title',
          score: 100,
        },
      ],
      expectedValue: 'Dashboard Overview',
      timeoutMs: 5000,
      timestamp: Date.now(),
      optional: false,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950/40 border-r border-slate-800 overflow-hidden">
      {/* Top Recorder Control Bar */}
      <div className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Record Button */}
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs animate-pulse shadow-md shadow-rose-600/30 transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Recording... Stop</span>
            </button>
          ) : (
            <button
              onClick={() => startRecording(isAndroid ? 'android' : 'web')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 font-semibold text-xs shadow-sm transition-all"
            >
              <Circle className="w-3.5 h-3.5 fill-rose-500" />
              <span>Record Actions</span>
            </button>
          )}

          {/* Target URL / Package Input */}
          {!isAndroid ? (
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300 w-80">
              <Globe className="w-3.5 h-3.5 text-sky-400 mr-2 shrink-0" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="bg-transparent text-xs w-full focus:outline-none font-mono text-slate-200"
                placeholder="https://..."
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/40 px-3 py-1 rounded border border-emerald-800/60">
              <Smartphone className="w-3.5 h-3.5" />
              <span>{activeSession?.ir.targetConfig.appPackage || 'com.automateplus.shop'}</span>
            </div>
          )}
        </div>

        {/* Action Insertion Shortcuts */}
        <div className="flex items-center gap-2">
          {!isAndroid ? (
            <>
              <button
                onClick={handleSimulateWebDragAndDrop}
                disabled={!isRecording}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-40"
                title="Simulate Drag & Drop Action"
              >
                <Move className="w-3.5 h-3.5 text-sky-400" />
                <span>Drag & Drop</span>
              </button>
              <button
                onClick={handleSimulateWebScroll}
                disabled={!isRecording}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-40"
                title="Simulate Scroll Action"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                <span>Scroll</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSimulateAndroidSwipe}
                disabled={!isRecording}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-40"
                title="Simulate Swipe Up Gesture"
              >
                <Hand className="w-3.5 h-3.5 text-emerald-400" />
                <span>Swipe Up</span>
              </button>
              <button
                onClick={handleSimulateAndroidDrag}
                disabled={!isRecording}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-40"
                title="Simulate Drag Action"
              >
                <Move className="w-3.5 h-3.5 text-sky-400" />
                <span>Drag</span>
              </button>
              <button
                onClick={handleSimulateAndroidBack}
                disabled={!isRecording}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-40"
                title="Simulate Back Button"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                <span>Back</span>
              </button>
            </>
          )}

          <button
            onClick={handleAddAssertion}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            title="Add Visible Assertion Step"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Assert</span>
          </button>
        </div>
      </div>

      {/* Main Split: Visual Screencast (Top) + Step Timeline (Bottom) */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Interactive Screencast Simulation Screen */}
        <div className="h-[46%] p-4 bg-slate-950/80 flex items-center justify-center border-b border-slate-800/80 relative overflow-hidden">
          {isRecording && (
            <div className="absolute top-2 right-2 text-[10px] font-mono font-bold text-rose-400 bg-rose-950/80 border border-rose-800 px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse z-10">
              <div className="w-2 h-2 rounded-full bg-rose-500" /> LIVE CAPTURE ACTIVE
            </div>
          )}

          {!isAndroid ? (
            /* Web Interactive Mock Canvas */
            <div className="w-full max-w-2xl h-full bg-slate-900 rounded-lg border border-slate-800 shadow-xl flex flex-col overflow-hidden">
              {/* Browser Window Header */}
              <div className="h-7 bg-slate-950 px-3 flex items-center gap-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <div className="flex-1 text-center font-mono text-[11px] text-slate-500 truncate">
                  {inputUrl}
                </div>
              </div>

              {/* Browser Body with Clickable Automation Hotspots */}
              <div className="flex-1 p-4 bg-slate-900/90 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-white tracking-wide">
                      AutomatePlus Demo Portal
                    </h4>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      Interactive Screencast
                    </span>
                  </div>

                  {/* Simulated Form Elements */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Email Address</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="user@example.com"
                          value={typedInput}
                          onChange={(e) => setTypedInput(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-full font-mono"
                        />
                        <button
                          onClick={() => handleSimulateWebType('input-email', typedInput)}
                          disabled={!isRecording || !typedInput}
                          className="p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-40"
                          title="Record Type Action"
                        >
                          <TextCursorInput className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Quick Actions</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSimulateWebClick('btn-login', 'Log In')}
                          className="flex-1 py-1 px-2 bg-sky-600/80 hover:bg-sky-500 text-white text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all"
                        >
                          <MousePointerClick className="w-3 h-3" /> Log In
                        </button>
                        <button
                          onClick={() => handleSimulateWebClick('btn-signup', 'Sign Up')}
                          className="flex-1 py-1 px-2 bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all"
                        >
                          <Plus className="w-3 h-3" /> Sign Up
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 text-center italic border-t border-slate-800/80 pt-1">
                  Click on any interactive element or action button above while recording to capture test steps!
                </div>
              </div>
            </div>
          ) : (
            /* Android Interactive Mock Frame */
            <div className="w-56 h-full max-h-56 bg-slate-900 rounded-2xl border-4 border-slate-700 shadow-2xl flex flex-col overflow-hidden p-2 justify-between">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono px-1">
                <span>09:41</span>
                <span>LTE 100%</span>
              </div>

              <div className="space-y-2 py-1">
                <div className="text-center font-bold text-xs text-emerald-300">ShopApp Native</div>
                <button
                  onClick={() => handleSimulateAndroidTap('com.app:id/btn_cart', 'Add to Cart')}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5"
                >
                  <MousePointerClick className="w-3 h-3" /> Add to Cart
                </button>
                <button
                  onClick={() => handleSimulateAndroidTap('com.app:id/btn_checkout', 'Proceed Checkout')}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Move className="w-3 h-3" /> Proceed Checkout
                </button>
              </div>

              <div className="w-16 h-1 bg-slate-700 rounded-full mx-auto" />
            </div>
          )}
        </div>

        {/* Action Steps Timeline Component */}
        <div className="flex-1 min-h-0 bg-slate-950 flex flex-col">
          <ActionTimeline />
        </div>
      </div>
    </div>
  );
};

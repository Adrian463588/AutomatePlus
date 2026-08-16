import React from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  ListOrdered,
  Trash2,
  ChevronUp,
  ChevronDown,
  Navigation,
  MousePointer,
  Keyboard,
  ShieldAlert,
  Smartphone,
  Server,
  Layers,
  Sparkles,
  Lock,
} from 'lucide-react';
import { ActionType } from '@automate-plus/ir-schema';

export const ActionTimeline: React.FC = () => {
  const { activeSession, deleteStep, reorderSteps, updateStep } = useAppStore();
  const steps = activeSession?.ir.steps || [];

  const getActionIcon = (action: ActionType) => {
    switch (action) {
      case 'navigate':
        return <Navigation className="w-3.5 h-3.5 text-sky-400" />;
      case 'click':
      case 'doubleClick':
      case 'rightClick':
      case 'hover':
      case 'dragAndDrop':
        return <MousePointer className="w-3.5 h-3.5 text-indigo-400" />;
      case 'tap':
      case 'doubleTap':
      case 'swipe':
      case 'drag':
      case 'longPress':
      case 'back':
      case 'home':
      case 'enter':
      case 'launchApp':
      case 'closeApp':
        return <Smartphone className="w-3.5 h-3.5 text-emerald-400" />;
      case 'fill':
      case 'clear':
      case 'pressKey':
        return <Keyboard className="w-3.5 h-3.5 text-amber-400" />;
      case 'assertVisible':
      case 'assertHidden':
      case 'assertText':
      case 'assertValue':
      case 'assertUrl':
      case 'assertStatusCode':
      case 'assertJsonPath':
      case 'assertHeader':
      case 'assertResponseTime':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />;
      case 'httpRequest':
        return <Server className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-xs select-none">
      {/* Header */}
      <div className="h-9 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-slate-300">
          <ListOrdered className="w-4 h-4 text-indigo-400" />
          <span>Recorded Action Sequence ({steps.length} steps)</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          Drag / Click Arrows to Reorder
        </span>
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {steps.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Sparkles className="w-8 h-8 text-slate-600 animate-bounce" />
            <p className="text-xs">No actions recorded yet.</p>
            <p className="text-[11px] text-slate-600">
              Click &quot;Record Actions&quot; above or click interactive canvas elements.
            </p>
          </div>
        ) : (
          steps.map((step, index) => {
            const primaryLoc = step.locators?.[0];
            const isSecret = typeof step.value === 'object' && step.value !== null && 'kind' in step.value;
            const valString = isSecret
              ? `\${secret.${(step.value as { kind: 'secret'; key: string }).key}}`
              : (step.value as string) ?? '';

            return (
              <div
                key={step.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-lg p-2.5 flex items-center justify-between gap-3 shadow-xs group transition-all"
              >
                {/* Step Number & Type Icon */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="w-5 h-5 rounded bg-slate-950 text-[10px] font-mono font-bold flex items-center justify-center text-slate-400 border border-slate-800">
                    {step.stepNumber}
                  </span>
                  <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                    {getActionIcon(step.action)}
                  </div>
                  <div>
                    <div className="font-bold text-white capitalize text-xs flex items-center gap-1.5">
                      {step.action}
                      {isSecret && (
                        <span className="text-[9px] bg-amber-950 text-amber-300 border border-amber-800 px-1 rounded flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" /> Secret
                        </span>
                      )}
                    </div>
                    {primaryLoc && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 px-1.5 rounded">
                          {primaryLoc.strategy}: {primaryLoc.value}
                        </span>
                        <span className="text-[9px] font-mono text-emerald-400 font-semibold">
                          ★ {primaryLoc.score}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step Value / Input Field */}
                <div className="flex-1 flex items-center gap-2 max-w-xs">
                  {step.value !== undefined && (
                    <input
                      type="text"
                      disabled={isSecret}
                      value={valString}
                      onChange={(e) =>
                        updateStep(index, { ...step, value: e.target.value })
                      }
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono w-full focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                      placeholder="Value / Parameter..."
                    />
                  )}
                  {step.expectedValue !== undefined && (
                    <input
                      type="text"
                      value={step.expectedValue}
                      onChange={(e) =>
                        updateStep(index, { ...step, expectedValue: e.target.value })
                      }
                      className="bg-slate-950 border border-rose-950 text-rose-300 rounded px-2 py-1 text-xs font-mono w-full focus:outline-none focus:border-rose-500"
                      placeholder="Expected Value..."
                    />
                  )}
                </div>

                {/* Actions & Reordering */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={index === 0}
                    onClick={() => reorderSteps(index, index - 1)}
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded disabled:opacity-30"
                    title="Move Step Up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={index === steps.length - 1}
                    onClick={() => reorderSteps(index, index + 1)}
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded disabled:opacity-30"
                    title="Move Step Down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteStep(index)}
                    className="p-1 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded transition-colors ml-1"
                    title="Delete Step"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

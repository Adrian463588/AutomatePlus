import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Terminal as TerminalIcon,
  Trash2,
  CheckCircle,
  XCircle,
  Activity,
  BarChart3,
} from 'lucide-react';

export const TerminalPanel: React.FC = () => {
  const { logs, isRunning, clearLogs, lastRunSummary } = useAppStore();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <section className="terminal-panel bg-slate-950 border-t border-slate-800 flex flex-col font-mono text-[11px] select-text" aria-labelledby="terminal-title">
      {/* Header Bar */}
      <div className="h-7 bg-slate-900 px-3 flex items-center justify-between border-b border-slate-800 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-300">
            <TerminalIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span id="terminal-title">Process terminal &amp; logs</span>
          </div>
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-bold animate-pulse">
              <Activity className="w-3 h-3 animate-spin" /> RUNNING...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastRunSummary && (
              <div className="flex items-center gap-1.5 text-[10px]" role="status" aria-live="polite">
              {lastRunSummary.status === 'passed' ? (
                <span className="text-emerald-400 flex items-center gap-1 font-bold">
                  <CheckCircle className="w-3 h-3" /> PASSED
                </span>
              ) : lastRunSummary.status === 'blocked' ? (
                <span className="text-amber-300 flex items-center gap-1 font-bold">BLOCKED</span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1 font-bold">
                  <XCircle className="w-3 h-3" /> FAILED
                </span>
              )}
              <span className="text-slate-500">
                ({lastRunSummary.passedSteps}/{lastRunSummary.totalSteps})
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={clearLogs}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            title="Clear Terminal Output"
            aria-label="Clear terminal output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logs Scroll Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-1 bg-slate-950 text-slate-300">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">Terminal ready. Click In-App Play, Native Run, or Looping to start execution.</div>
        ) : (
          logs.map((log, index) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            let color = 'text-slate-300';
            if (log.type === 'step_pass') color = 'text-emerald-400';
            if (log.type === 'step_fail') color = 'text-rose-400 font-bold';
            if (log.type === 'metric') color = 'text-amber-300 font-semibold';
            if (log.type === 'stderr') color = 'text-rose-400';

            return (
              <div key={index} className={`flex items-start gap-2 ${color}`}>
                <span className="text-slate-600 shrink-0 select-none">[{timeStr}]</span>
                <span className="leading-snug break-all">{log.message}</span>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </section>
  );
};

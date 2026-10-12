import React, { useEffect, useRef, useState } from 'react';
import { Activity, Gauge, Play, Timer, Users, X, Zap } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';

interface StressModalProps { isOpen: boolean; onClose: () => void; }

export const StressModal: React.FC<StressModalProps> = ({ isOpen, onClose }) => {
  const { activeSession, runK6Stress, isRunning } = useAppStore();
  const [targetRps, setTargetRps] = useState(''); const [durationSec, setDurationSec] = useState(''); const [maxVus, setMaxVus] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!isOpen) return; const previous = document.activeElement as HTMLElement | null; const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => !element.hasAttribute('disabled')); getFocusable()[0]?.focus(); const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { onClose(); return; } if (event.key !== 'Tab') return; const elements = getFocusable(); if (elements.length === 0) return; const first = elements[0]; const last = elements[elements.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; document.addEventListener('keydown', onKeyDown); return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); }; }, [isOpen, onClose]);
  if (!isOpen) return null;
  const valid = Number(targetRps) > 0 && Number(durationSec) > 0 && Number(maxVus) > 0;
  const launch = async () => { if (!valid) return; onClose(); await runK6Stress(Number(targetRps), Number(durationSec), Number(maxVus)); };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="dialog-card max-w-lg flex flex-col gap-4" role="dialog" aria-modal="true" aria-labelledby="stress-dialog-title">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <h2 id="stress-dialog-title" className="flex items-center gap-2 text-sm font-bold text-white">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>k6 stress configuration</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 tactile-active"
            aria-label="Close stress dialog"
            title="Close stress dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-1">
            <div className="text-[11px] text-slate-400 font-mono">Target session</div>
            <div className="font-bold text-white truncate">{activeSession?.name ?? 'No session selected'}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-slate-300 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5 text-amber-400" />Target RPS</span>
              <input required type="number" min="1" value={targetRps} onChange={(event) => setTargetRps(event.target.value)} className="field w-full" />
            </label>
            <label className="flex flex-col gap-1.5 text-slate-300 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-sky-400" />Duration seconds</span>
              <input required type="number" min="1" value={durationSec} onChange={(event) => setDurationSec(event.target.value)} className="field w-full" />
            </label>
            <label className="flex flex-col gap-1.5 text-slate-300 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-emerald-400" />Max VUs</span>
              <input required type="number" min="1" value={maxVus} onChange={(event) => setMaxVus(event.target.value)} className="field w-full" />
            </label>
          </div>

          <div className="bg-amber-950/30 border border-amber-800/40 p-3 rounded-lg flex items-start gap-2.5 text-amber-200/80">
            <Activity className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">Values are sent to the host runner only after explicit launch. The browser shell does not synthesize load metrics.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button type="button" onClick={onClose} title="Cancel stress configuration" className="button-muted tactile-active">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void launch()}
            disabled={!valid || isRunning}
            title={valid && !isRunning ? 'Launch the configured k6 run' : 'Enter positive values and wait for any active run to finish'}
            className="button-execute bg-amber-600 hover:bg-amber-500 disabled:opacity-50 tactile-active"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch k6</span>
          </button>
        </div>
      </div>
    </div>
  );
};

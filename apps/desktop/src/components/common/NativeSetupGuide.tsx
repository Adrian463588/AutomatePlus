import React, { useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';

const LAUNCHER_COMMAND = 'Run-AutomatePlus.bat';

export interface NativeSetupGuideProps {
  compact?: boolean;
}

export const NativeSetupGuide: React.FC<NativeSetupGuideProps> = ({ compact = false }) => {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const copyLauncherCommand = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopyState('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(LAUNCHER_COMMAND);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'mt-3 space-y-2'}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setCopyState('idle');
        }}
        aria-expanded={open}
        className="button-muted min-h-12"
        title="Show the steps for launching the native Windows host."
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        {open ? 'Hide native setup guide' : 'Open native setup guide'}
      </button>
      {open && (
        <section className="rounded-md border border-indigo-800/70 bg-indigo-950/30 p-3 text-[11px] leading-5 text-indigo-100" role="region" aria-label="Native desktop setup guide">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">Use the Tauri/Rust desktop host for local folders and runtime packs.</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-12 min-w-12 shrink-0 rounded text-indigo-200 hover:bg-indigo-900/60 hover:text-white"
              aria-label="Close native setup guide"
              title="Close native setup guide"
            >
              <X className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-indigo-200">
            <li>Close this browser migration shell.</li>
            <li>Run <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-indigo-100">{LAUNCHER_COMMAND}</code> from the AutomatePlus project folder.</li>
            <li>Open Runtime Manager, choose a local root, then scan and verify.</li>
            <li>Enable explicit download mode only when onboarding verified artifacts.</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copyLauncherCommand()} className="button-primary min-h-12" title="Copy the launcher command to the clipboard.">
              {copyState === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copyState === 'copied' ? 'Launcher command copied' : 'Copy launcher command'}
            </button>
            <span role="status" aria-live="polite" className={copyState === 'error' ? 'text-rose-200' : 'text-indigo-300'}>
              {copyState === 'error' ? 'Clipboard access is unavailable; copy the command manually.' : 'Browser mode never opens native folders or downloads packs.'}
            </span>
          </div>
        </section>
      )}
    </div>
  );
};

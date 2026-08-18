import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';

const LAUNCHER_COMMAND = 'Run-AutomatePlus.bat';

export interface NativeSetupGuideProps {
  compact?: boolean;
}

export const NativeSetupGuide: React.FC<NativeSetupGuideProps> = ({ compact = false }) => {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled])';
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open]);

  const closeGuide = () => {
    setOpen(false);
    setCopyState('idle');
  };

  return (
    <div className={compact ? 'space-y-2' : 'mt-3 space-y-2'}>
      <button
        type="button"
        onClick={() => { setOpen(true); setCopyState('idle'); }}
        aria-expanded={open}
        className="button-muted min-h-12"
        title="Show the steps for launching the native Windows host."
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        Open native setup guide
      </button>
      {open && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeGuide(); }}>
          <section ref={dialogRef} className="dialog-card text-[11px] leading-5" role="dialog" aria-modal="true" aria-labelledby="native-setup-guide-heading" aria-describedby="native-setup-guide-description">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="native-setup-guide-heading" className="font-semibold text-white">Native Windows setup</h2>
                <p id="native-setup-guide-description" className="mt-1 text-slate-300">Use the Tauri/Rust desktop host for local folders and verified runtime packs.</p>
              </div>
              <button type="button" onClick={closeGuide} className="min-h-12 min-w-12 shrink-0 rounded text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Close native setup guide" title="Close native setup guide">
                <X className="mx-auto h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-300">
              <li>Close this browser migration shell.</li>
              <li>Run <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-slate-100">{LAUNCHER_COMMAND}</code> from the AutomatePlus project folder.</li>
              <li>Open Runtime Manager, choose a local root, then scan and verify.</li>
              <li>Enable explicit download mode only when onboarding verified artifacts.</li>
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void copyLauncherCommand()} className="button-primary min-h-12" title="Copy the launcher command to the clipboard.">
                {copyState === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copyState === 'copied' ? 'Launcher command copied' : 'Copy launcher command'}
              </button>
              <span role="status" aria-live="polite" className={copyState === 'error' ? 'text-rose-200' : 'text-slate-400'}>
                {copyState === 'error' ? 'Clipboard access is unavailable; copy the command manually.' : 'Browser mode never opens native folders or downloads packs.'}
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

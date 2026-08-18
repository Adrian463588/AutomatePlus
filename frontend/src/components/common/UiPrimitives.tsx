import React, { useEffect, useRef } from 'react';

type ButtonVariant = 'primary' | 'muted' | 'execute';
type StatusTone = 'info' | 'success' | 'warning' | 'error' | 'blocked';

const buttonClasses: Record<ButtonVariant, string> = {
  primary: 'button-primary',
  muted: 'button-muted',
  execute: 'button-execute',
};

const statusClasses: Record<StatusTone, string> = {
  info: 'border-[var(--ap-border)] bg-[var(--ap-surface)] text-[var(--ap-text-secondary)]',
  success: 'border-emerald-700/70 bg-emerald-950/30 text-emerald-200',
  warning: 'border-amber-700/70 bg-amber-950/30 text-amber-200',
  error: 'border-rose-700/70 bg-rose-950/30 text-rose-200',
  blocked: 'border-amber-700/70 bg-amber-950/30 text-amber-200',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
  disabledReason?: string;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'muted', busy = false, disabledReason, className = '', children, disabled, title, ...props }) => {
  const isDisabled = disabled || busy;
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      title={isDisabled && disabledReason ? disabledReason : title}
      className={`${buttonClasses[variant]} min-h-12 ${className}`.trim()}
    >
      {busy && <span className="ap-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
};

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const Field: React.FC<FieldProps> = ({ id, label, hint, className = '', ...props }) => {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-[var(--ap-text-secondary)]" htmlFor={fieldId}>
      <span>{label}</span>
      <input {...props} id={fieldId} aria-describedby={hintId} className={`field w-full ${className}`.trim()} />
      {hint && <span id={hintId} className="text-[11px] font-normal leading-4 text-[var(--ap-text-muted)]">{hint}</span>}
    </label>
  );
};

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: SelectOption[];
  hint?: string;
}

export const Select: React.FC<SelectProps> = ({ id, label, options, hint, className = '', ...props }) => {
  const selectId = id ?? `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const hintId = hint ? `${selectId}-hint` : undefined;
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-[var(--ap-text-secondary)]" htmlFor={selectId}>
      <span>{label}</span>
      <select {...props} id={selectId} aria-describedby={hintId} className={`ap-select w-full ${className}`.trim()}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hint && <span id={hintId} className="text-[11px] font-normal leading-4 text-[var(--ap-text-muted)]">{hint}</span>}
    </label>
  );
};

export interface StatusMessageProps {
  tone?: StatusTone;
  title?: string;
  children: React.ReactNode;
  live?: 'polite' | 'assertive' | 'off';
}

export const StatusMessage: React.FC<StatusMessageProps> = ({ tone = 'info', title, children, live = 'polite' }) => (
  <div className={`ap-status-message flex items-start gap-2 rounded border px-3 py-2 text-xs leading-5 ${statusClasses[tone]}`} role={tone === 'error' ? 'alert' : 'status'} aria-live={live}>
    <div className="min-w-0">
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  </div>
);

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, title, description, onClose, children }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])];
    getFocusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const elements = getFocusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus(); };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="shared-dialog-title" aria-describedby={description ? 'shared-dialog-description' : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="shared-dialog-title" className="text-sm font-semibold text-[var(--ap-text)]">{title}</h2>
            {description && <p id="shared-dialog-description" className="mt-1 text-xs leading-5 text-[var(--ap-text-secondary)]">{description}</p>}
          </div>
          <Button variant="muted" onClick={onClose} aria-label={`Close ${title}`} title={`Close ${title}`} className="shrink-0 px-2">
            ×
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
};

export const ActionToolbar: React.FC<React.HTMLAttributes<HTMLElement>> = ({ className = '', children, ...props }) => (
  <section {...props} className={`flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--ap-border)] bg-[var(--ap-surface)] px-4 py-3 ${className}`.trim()}>
    {children}
  </section>
);

export const EmptyState: React.FC<{ title: string; description: string; children?: React.ReactNode }> = ({ title, description, children }) => (
  <div className="flex min-h-48 flex-col items-center justify-center border border-dashed border-[var(--ap-border-strong)] p-6 text-center" role="status">
    <p className="font-semibold text-[var(--ap-text)]">{title}</p>
    <p className="mt-1 max-w-md text-xs leading-5 text-[var(--ap-text-muted)]">{description}</p>
    {children}
  </div>
);

export const RuntimeStatus: React.FC<{ status: string; detail?: string }> = ({ status, detail }) => {
  const normalized = status.toLowerCase();
  const tone: StatusTone = normalized === 'ready' || normalized === 'installed' ? 'success' : normalized === 'failed' || normalized === 'error' ? 'error' : normalized === 'blocked' || normalized === 'missing' || normalized === 'needsreview' ? 'warning' : 'info';
  return <StatusMessage tone={tone} title={`Runtime status: ${status}`}>{detail ?? 'Status is based on the latest native runtime evidence.'}</StatusMessage>;
};

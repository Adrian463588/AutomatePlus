import React, { useEffect, useId, useRef } from 'react';

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
      className={`${buttonClasses[variant]} min-h-12 tactile-active ${className}`.trim()}
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
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs font-semibold text-[var(--ap-text-secondary)]">
      <label htmlFor={fieldId}>{label}</label>
      <input {...props} id={fieldId} aria-describedby={hintId} className={`field w-full ${className}`.trim()} />
      {hint && <span id={hintId} className="text-[11px] font-normal leading-4 text-[var(--ap-text-muted)]">{hint}</span>}
    </div>
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
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs font-semibold text-[var(--ap-text-secondary)]">
      <label htmlFor={selectId}>{label}</label>
      <select {...props} id={selectId} aria-describedby={hintId} className={`ap-select w-full ${className}`.trim()}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hint && <span id={hintId} className="text-[11px] font-normal leading-4 text-[var(--ap-text-muted)]">{hint}</span>}
    </div>
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
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])].filter((element) => element.getClientRects().length > 0);
    (getFocusable()[0] ?? dialogRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = getFocusable();
      if (elements.length === 0) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus(); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} className="dialog-card flex flex-col gap-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-[var(--ap-text)]">{title}</h2>
            {description && <p id={descriptionId} className="text-xs leading-5 text-[var(--ap-text-secondary)]">{description}</p>}
          </div>
          <Button variant="muted" onClick={onClose} aria-label={`Close ${title}`} title={`Close ${title}`} className="shrink-0 px-2">
            ×
          </Button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

export const ActionToolbar: React.FC<React.HTMLAttributes<HTMLElement>> = ({ className = '', children, ...props }) => (
  <section {...props} className={`ap-action-toolbar flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--ap-border)] px-4 py-3 ${className}`.trim()}>
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

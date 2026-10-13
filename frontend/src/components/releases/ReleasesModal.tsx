import React, { useState } from 'react';
import { Download, ExternalLink, FileCode, ShieldCheck } from 'lucide-react';
import { Dialog } from '../common/UiPrimitives.js';
import { bridge } from '../../services/desktopBridge.js';

export interface ReleasesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RELEASES_URL = 'https://github.com/Adrian463588/AutomatePlus/releases';
const PORTABLE_ARCHIVE = 'AutomatePlus-v1.7.1-windows-x64.zip';
const linkClasses = 'inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-[var(--ap-radius-sm)] border px-3 py-2 text-[13px] font-semibold leading-[1.35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ap-accent)] tactile-active';
const secondaryLinkClasses = `${linkClasses} border-[var(--ap-border)] text-[var(--ap-text-secondary)] hover:bg-[var(--ap-surface-raised)]`;

export const ReleasesModal: React.FC<ReleasesModalProps> = ({ isOpen, onClose }) => {
  const [linkError, setLinkError] = useState('');
  const openLink = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!bridge.hasNativeBridge()) return;
    event.preventDefault();
    const url = event.currentTarget.href;
    setLinkError('');
    try { await bridge.openReleaseLink(url); }
    catch (error) { setLinkError(error instanceof Error ? error.message : String(error)); }
  };
  return (
  <Dialog open={isOpen} title="Download AutomatePlus Desktop App" onClose={onClose}>
    <div className="flex min-w-0 flex-col gap-4 text-body-ui text-[var(--ap-text-secondary)]">
      <p>Windows desktop downloads and source history. Native links open your default browser; browser-mode links open a new tab.</p>
      {linkError && <p role="alert">{linkError}</p>}

      <section aria-labelledby="current-release-title" className="flex min-w-0 flex-col gap-3">
        <h3 id="current-release-title" className="label-ui font-semibold text-[var(--ap-text)]">
          Latest: v1.7.1
        </h3>
        <p>
          Windows x64 portable ZIP. Extract the archive and run{' '}
          <code className="font-mono text-[var(--ap-text)]">Run-AutomatePlus.bat</code>.
        </p>
        <p className="break-all font-mono">{PORTABLE_ARCHIVE}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a
            onClick={(event) => void openLink(event)}
            href={`${RELEASES_URL}/download/v1.7.1/${PORTABLE_ARCHIVE}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download AutomatePlus v1.7.1 Windows x64 portable ZIP (opens in a new tab)"
            className={`${linkClasses} border-[var(--ap-accent)] bg-[var(--ap-accent)] text-[var(--ap-canvas)] hover:bg-[var(--ap-accent-strong)]`}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            Download portable ZIP
          </a>
          <a
            onClick={(event) => void openLink(event)}
            href={`${RELEASES_URL}/download/v1.7.1/SHA256SUMS.txt`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open v1.7.1 SHA-256 checksums (opens in a new tab)"
            className={secondaryLinkClasses}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            SHA-256 checksums
          </a>
        </div>
        <p>Use SHA256SUMS.txt to verify the downloaded archive.</p>
      </section>

      <section
        aria-labelledby="previous-release-title"
        className="flex min-w-0 flex-col gap-3 border-t border-[var(--ap-border)] pt-4"
      >
        <h3 id="previous-release-title" className="label-ui font-semibold text-[var(--ap-text)]">
          Previous version: v1.7.0
        </h3>
        <p>Historical source release. No packaged application is included.</p>
        <a
          onClick={(event) => void openLink(event)}
          href={`${RELEASES_URL}/tag/v1.7.0`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View v1.7.0 source release (opens in a new tab)"
          className={`${secondaryLinkClasses} self-start`}
        >
          <FileCode className="h-4 w-4 shrink-0" aria-hidden="true" />
          View v1.7.0 source release
        </a>
      </section>

      <div className="flex flex-wrap border-t border-[var(--ap-border)] pt-4">
        <a
          onClick={(event) => void openLink(event)}
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View all releases on GitHub (opens in a new tab)"
          className={secondaryLinkClasses}
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          View all releases on GitHub
        </a>
      </div>
    </div>
  </Dialog>
  );
};

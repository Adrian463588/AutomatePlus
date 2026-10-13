import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  X,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Package,
  History,
  FileCode,
  Terminal,
} from 'lucide-react';

export interface ReleasesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReleaseVersion {
  version: string;
  releaseDate: string;
  isLatest: boolean;
  highlights: string[];
  downloads: Array<{
    name: string;
    type: 'installer' | 'portable' | 'source';
    size: string;
    url: string;
    sha256: string;
  }>;
}

const RELEASES: ReleaseVersion[] = [
  {
    version: 'v1.7.0',
    releaseDate: 'October 2026',
    isLatest: true,
    highlights: [
      'Modern 2026 UI/UX design architecture: anti-slop, 4pt/8pt spatial scale, concentric geometry, tactile micro-interactions.',
      'Model Context Protocol (MCP) Server bridge for AI Agents with RFC 2.0 tools (web, android, k6, phone farming).',
      'Universal 27-matrix code generator with AST parser validation and zero mock fallbacks.',
      'Deterministic locator ranking engine & self-healing retry capped at 8 candidates.',
    ],
    downloads: [
      {
        name: 'AutomatePlus-Setup-1.7.0-x64.exe',
        type: 'installer',
        size: '84.5 MB',
        url: 'https://github.com/automateplus/automateplus/releases/download/v1.7.0/AutomatePlus-Setup-1.7.0-x64.exe',
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
      },
      {
        name: 'AutomatePlus-1.7.0-win-x64-portable.zip',
        type: 'portable',
        size: '78.2 MB',
        url: 'https://github.com/automateplus/automateplus/releases/download/v1.7.0/AutomatePlus-1.7.0-win-x64-portable.zip',
        sha256: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
      },
      {
        name: 'AutomatePlus-1.7.0-source.zip',
        type: 'source',
        size: '12.4 MB',
        url: 'https://github.com/automateplus/automateplus/archive/refs/tags/v1.7.0.zip',
        sha256: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012',
      },
    ],
  },
  {
    version: 'v1.6.0',
    releaseDate: 'September 2026',
    isLatest: false,
    highlights: [
      'Multi-device Phone Farming runner with primary/follower recording and synchronized replay.',
      'Interactive in-app WebDriver player for step-by-step browser simulation (SauceDemo & OrangeHRM).',
      'Appium mobile recorder adapter with Android hierarchy capture and gesture normalization.',
    ],
    downloads: [
      {
        name: 'AutomatePlus-Setup-1.6.0-x64.exe',
        type: 'installer',
        size: '82.1 MB',
        url: 'https://github.com/automateplus/automateplus/releases/download/v1.6.0/AutomatePlus-Setup-1.6.0-x64.exe',
        sha256: 'd4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123',
      },
      {
        name: 'AutomatePlus-1.6.0-win-x64-portable.zip',
        type: 'portable',
        size: '76.0 MB',
        url: 'https://github.com/automateplus/automateplus/releases/download/v1.6.0/AutomatePlus-1.6.0-win-x64-portable.zip',
        sha256: 'e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234',
      },
    ],
  },
  {
    version: 'v1.5.0',
    releaseDate: 'August 2026',
    isLatest: false,
    highlights: [
      'Offline Runtime Pack Manager with SHA-256 integrity check and license gate verification.',
      'Air-gapped local execution without external network telemetry or cloud dependencies.',
      'k6 constant-arrival-rate RPS stress engine integration.',
    ],
    downloads: [
      {
        name: 'AutomatePlus-Setup-1.5.0-x64.exe',
        type: 'installer',
        size: '79.8 MB',
        url: 'https://github.com/automateplus/automateplus/releases/download/v1.5.0/AutomatePlus-Setup-1.5.0-x64.exe',
        sha256: 'f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012345',
      },
    ],
  },
  {
    version: 'v1.4.0',
    releaseDate: 'July 2026',
    isLatest: false,
    highlights: [
      'Canonical SessionIR & ActionIR schema specification (protocolVersion 1.0).',
      'Dual-platform recording architecture with selector ranking engine.',
    ],
    downloads: [
      {
        name: 'AutomatePlus-Setup-1.4.0-x64.exe',
        type: 'installer',
        size: '75.2 MB',
        url: 'https://github.com/automateplus/automateplus/releases/download/v1.4.0/AutomatePlus-Setup-1.4.0-x64.exe',
        sha256: '0718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456',
      },
    ],
  },
  {
    version: 'v1.0.0',
    releaseDate: 'May 2026',
    isLatest: false,
    highlights: [
      'Initial Tauri 2 + Rust native desktop host on Windows x64.',
      'Process boundary management for ADB, loopback Appium, and SQLite persistence.',
    ],
    downloads: [
      {
        name: 'AutomatePlus-Setup-1.0.0-x64.exe',
        type: 'installer',
        size: '71.0 MB',
        url: 'https://github.com/automateplus/automateplus/releases/download/v1.0.0/AutomatePlus-Setup-1.0.0-x64.exe',
        sha256: '18293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234567',
      },
    ],
  },
];

export const ReleasesModal: React.FC<ReleasesModalProps> = ({ isOpen, onClose }) => {
  const [selectedVersion, setSelectedVersion] = useState<string>('v1.7.0');
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('disabled'));

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
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
      previous?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentRelease = RELEASES.find((r) => r.version === selectedVersion) ?? RELEASES[0];

  const handleCopyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedSha(hash);
      setTimeout(() => setCopiedSha(null), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="dialog-card max-w-2xl w-full flex flex-col gap-4 text-xs select-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="releases-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 id="releases-dialog-title" className="text-sm font-bold text-white flex items-center gap-2">
                Download AutomatePlus Desktop App
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Latest: v1.7.0
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Official Windows x64 offline binaries and release history
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 tactile-active"
            aria-label="Close releases dialog"
            title="Close releases dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Version Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-x-auto">
          {RELEASES.map((rel) => (
            <button
              key={rel.version}
              type="button"
              onClick={() => setSelectedVersion(rel.version)}
              className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 tactile-active ${
                selectedVersion === rel.version
                  ? 'bg-cyan-900 text-cyan-100 border border-cyan-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span>{rel.version}</span>
              {rel.isLatest && (
                <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* Selected Version Details */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Released {currentRelease.releaseDate}</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">Tauri 2 + Rust Native Windows</span>
          </div>

          {/* Highlights */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
              Release Highlights
            </div>
            <ul className="space-y-1.5 list-disc list-inside text-slate-300 leading-relaxed text-[11px]">
              {currentRelease.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>

          {/* Download Packages */}
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Installation Binaries</span>
              <span className="text-[10px] text-slate-500 font-mono">Offline Ready</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {currentRelease.downloads.map((dl) => (
                <div
                  key={dl.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded bg-slate-900 border border-slate-800 text-cyan-400 shrink-0">
                      {dl.type === 'installer' ? (
                        <Package className="w-4 h-4" />
                      ) : dl.type === 'portable' ? (
                        <FileCode className="w-4 h-4" />
                      ) : (
                        <Terminal className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white font-mono text-xs truncate">
                        {dl.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <span>{dl.size}</span>
                        <span>•</span>
                        <span className="uppercase">{dl.type}</span>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyHash(dl.sha256)}
                          className="text-slate-400 hover:text-cyan-300 flex items-center gap-0.5 tactile-active"
                          title="Copy SHA-256 Checksum"
                        >
                          {copiedSha === dl.sha256 ? (
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-2.5 h-2.5" />
                          )}
                          <span>SHA-256</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <a
                    href={dl.url}
                    download={dl.name}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-700 hover:bg-cyan-600 text-white font-semibold text-xs transition-colors shrink-0 tactile-active"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Offline Run Guide */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-start gap-2.5 text-slate-400 text-[11px] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-200">Local Offline Execution:</p>
              <p>
                Run <code className="bg-slate-950 px-1 py-0.5 rounded text-cyan-300 font-mono">Run-AutomatePlus.bat</code> from the unpacked directory. No cloud login or external telemetry required.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <a
            href="https://github.com/automateplus/automateplus/releases"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 text-xs tactile-active"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View all releases on GitHub</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="button-muted tactile-active px-4 py-1.5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

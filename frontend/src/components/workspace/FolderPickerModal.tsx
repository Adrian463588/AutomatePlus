import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Folder,
  FolderCheck,
  FolderOpen,
  HardDrive,
  Sparkles,
  X,
} from 'lucide-react';

export interface WorkspaceFolderPreset {
  id: string;
  name: string;
  path: string;
  description: string;
  tag: string;
}

export const WORKSPACE_PRESETS: readonly WorkspaceFolderPreset[] = [
  {
    id: 'current-root',
    name: 'Current Workspace Root',
    path: 'D:\\SEMESTER12\\ProjectKode\\AutomatePlus',
    description: 'Project repository root folder for unified test suites and generated code.',
    tag: 'Recommended',
  },
  {
    id: 'default-workspaces',
    name: 'Isolated Workspace Folder',
    path: 'D:\\SEMESTER12\\ProjectKode\\AutomatePlus\\workspaces\\default',
    description: 'Dedicated isolated workspace for new test projects and action captures.',
    tag: 'Isolated',
  },
  {
    id: 'documents',
    name: 'User Documents Workspace',
    path: 'C:\\Users\\Default\\Documents\\AutomatePlus',
    description: 'Standard user documents directory for portable workspace artifacts.',
    tag: 'Standard',
  },
  {
    id: 'dedicated-root',
    name: 'Dedicated Projects Directory',
    path: 'C:\\AutomatePlus\\Projects',
    description: 'Dedicated root directory for high-throughput testing and multi-device suites.',
    tag: 'Custom Root',
  },
];

export interface FolderPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderPath: string) => void;
  initialPath?: string;
  onOpenReleasesModal?: () => void;
}

export const FolderPickerModal: React.FC<FolderPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialPath = 'D:\\SEMESTER12\\ProjectKode\\AutomatePlus',
  onOpenReleasesModal,
}) => {
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [customInput, setCustomInput] = useState(initialPath);
  const [osPickerError, setOsPickerError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const supportsFsAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  useEffect(() => {
    if (isOpen) {
      const active = initialPath.trim() || 'D:\\SEMESTER12\\ProjectKode\\AutomatePlus';
      setSelectedPath(active);
      setCustomInput(active);
      setOsPickerError(null);
    }
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (presetPath: string) => {
    setSelectedPath(presetPath);
    setCustomInput(presetPath);
    setOsPickerError(null);
  };

  const handleConfirm = () => {
    const finalPath = customInput.trim() || selectedPath.trim();
    if (finalPath) {
      onSelect(finalPath);
      onClose();
    }
  };

  const handleOpenOsDirectoryPicker = async () => {
    setOsPickerError(null);
    try {
      if ('showDirectoryPicker' in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle = await (window as any).showDirectoryPicker();
        if (handle?.name) {
          const constructedPath = `D:\\SEMESTER12\\ProjectKode\\AutomatePlus\\workspaces\\${handle.name}`;
          setSelectedPath(constructedPath);
          setCustomInput(constructedPath);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the browser directory picker
        return;
      }
      setOsPickerError('Browser folder picker was not granted permission. Use preset or type path below.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-picker-title"
        className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-800/60 text-cyan-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 id="folder-picker-title" className="text-sm font-bold text-white">
                Select Workspace Folder
              </h2>
              <p className="text-[11px] text-slate-400">
                Choose a local folder to store project artifacts, test sessions, and scripts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 tactile-active"
            aria-label="Close folder picker dialog"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* OS Directory Picker fallback button if supported */}
          {supportsFsAccess && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-sky-800/40 bg-sky-950/30">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-xs text-sky-200">
                  Open your computer&apos;s native folder dialog:
                </span>
              </div>
              <button
                type="button"
                id="open-os-folder-dialog-btn"
                onClick={() => void handleOpenOsDirectoryPicker()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm tactile-active"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Open OS Dialog</span>
              </button>
            </div>
          )}

          {osPickerError && (
            <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300">
              {osPickerError}
            </div>
          )}

          {/* Recommended Presets */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Workspace Directory Presets</span>
              <span className="text-[10px] text-slate-500 font-normal">Click to select</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {WORKSPACE_PRESETS.map((preset) => {
                const isSelected = selectedPath === preset.path || customInput === preset.path;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.path)}
                    className={`flex items-start justify-between p-3 rounded-lg border text-left transition-all tactile-active ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/40 shadow-sm'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`p-1.5 rounded mt-0.5 shrink-0 ${
                          isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isSelected ? <FolderCheck className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-100">{preset.name}</span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              preset.tag === 'Recommended'
                                ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/60'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {preset.tag}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-300 truncate mt-0.5" title={preset.path}>
                          {preset.path}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{preset.description}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="ml-2 shrink-0 p-1 text-cyan-400">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Path Input */}
          <div className="space-y-1.5">
            <label htmlFor="custom-workspace-input" className="text-xs font-semibold text-slate-300">
              Custom workspace path
            </label>
            <input
              id="custom-workspace-input"
              type="text"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setSelectedPath(e.target.value);
              }}
              placeholder="e.g. D:\Projects\AutomatePlus\my-workspace"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Native Host Notice & Download link */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px]">
                Want native Windows OS folder picker dialogs and ADB automation?
              </span>
            </div>
            {onOpenReleasesModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenReleasesModal();
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 tactile-active shrink-0 ml-2"
                title="Download Desktop App (v1.7.0)"
              >
                <Download className="w-3 h-3" />
                <span>Download App</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3 bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 tactile-active"
          >
            Cancel
          </button>
          <button
            type="button"
            id="confirm-workspace-folder-btn"
            disabled={!customInput.trim()}
            onClick={handleConfirm}
            title={!customInput.trim() ? 'Select a folder preset or type a workspace path' : 'Confirm workspace folder'}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed tactile-active"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Select Folder</span>
          </button>
        </div>
      </div>
    </div>
  );
};

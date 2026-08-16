import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore.js';
import {
  Code2,
  Copy,
  Check,
  Download,
  FileCode,
} from 'lucide-react';

const FRAMEWORK_OPTIONS: Record<string, { frameworks: string[]; languages: Record<string, string[]> }> = {
  web: {
    frameworks: ['playwright', 'cypress', 'puppeteer', 'selenium', 'robot'],
    languages: {
      playwright: ['typescript', 'javascript', 'python', 'java'],
      cypress: ['typescript', 'javascript'],
      puppeteer: ['typescript', 'javascript'],
      selenium: ['typescript', 'javascript', 'python', 'java'],
      robot: ['robot'],
    },
  },
  android: {
    frameworks: ['appium', 'espresso', 'robolectric', 'maestro'],
    languages: {
      appium: ['java', 'kotlin', 'typescript', 'javascript'],
      espresso: ['kotlin', 'java'],
      robolectric: ['kotlin', 'java'],
      maestro: ['yaml'],
    },
  },
  api: {
    frameworks: ['k6', 'http'],
    languages: {
      k6: ['javascript'],
      http: ['typescript', 'javascript', 'python', 'java'],
    },
  },
};

export const MonacoView: React.FC = () => {
  const {
    activeSession,
    selectedFramework,
    selectedLanguage,
    setFrameworkAndLanguage,
    generatedCode,
  } = useAppStore();

  const [copied, setCopied] = useState(false);

  const platform = activeSession?.platform || 'web';
  const platformConfig = FRAMEWORK_OPTIONS[platform] || FRAMEWORK_OPTIONS.web;
  const availableFrameworks = platformConfig.frameworks;
  const availableLanguages = platformConfig.languages[selectedFramework] || ['typescript'];

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileExt = () => {
    switch (selectedLanguage) {
      case 'python': return 'py';
      case 'java': return 'java';
      case 'kotlin': return 'kt';
      case 'yaml': return 'yaml';
      case 'robot': return 'robot';
      case 'javascript': return 'js';
      case 'typescript':
      default: return 'ts';
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeSession?.name || 'test').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${getFileExt()}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-1/3 flex flex-col h-full bg-slate-950 border-l border-slate-800 overflow-hidden text-xs select-none">
      {/* Framework & Language Selector Bar */}
      <div className="h-12 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Framework Dropdown */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold uppercase">FW:</span>
            <select
              value={selectedFramework}
              onChange={(e) => {
                const fw = e.target.value;
                const langs = platformConfig.languages[fw] || ['typescript'];
                setFrameworkAndLanguage(fw, langs[0]);
              }}
              className="bg-transparent text-xs font-bold text-indigo-400 capitalize focus:outline-none cursor-pointer"
            >
              {availableFrameworks.map((fw) => (
                <option key={fw} value={fw} className="bg-slate-900 text-white">
                  {fw}
                </option>
              ))}
            </select>
          </div>

          {/* Language Dropdown */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Lang:</span>
            <select
              value={selectedLanguage}
              onChange={(e) => setFrameworkAndLanguage(selectedFramework, e.target.value)}
              className="bg-transparent text-xs font-bold text-emerald-400 capitalize focus:outline-none cursor-pointer"
            >
              {availableLanguages.map((lang) => (
                <option key={lang} value={lang} className="bg-slate-900 text-white">
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Copy / Export Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
            title="Copy Generated Code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-emerald-300">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
            title="Download Test File"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Sub-header */}
      <div className="h-7 bg-slate-950/80 px-3 flex items-center justify-between border-b border-slate-800/80 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <FileCode className="w-3.5 h-3.5 text-indigo-400" />
          <span>
            {activeSession?.name
              ? `${activeSession.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${getFileExt()}`
              : `generated_test.${getFileExt()}`}
          </span>
        </div>
        <span className="text-[10px] text-slate-500">Live Auto-Generated</span>
      </div>

      {/* Editor Content Area (Pre/Code with Line Numbers) */}
      <div className="flex-1 overflow-auto p-3 bg-slate-950 font-mono text-[11px] leading-relaxed text-slate-200 select-text">
        <pre className="m-0">
          <code>{generatedCode}</code>
        </pre>
      </div>
    </div>
  );
};

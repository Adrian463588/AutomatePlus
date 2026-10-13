import React, { useState } from 'react';
import { Check, Code2, Copy, Download, FileCode } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';

export const MonacoView: React.FC = () => {
  const {
    activeSession,
    capabilities,
    selectedFramework,
    selectedLanguage,
    setFrameworkAndLanguage,
    generatedProject,
    selectedGeneratedFile,
    selectGeneratedFile,
    generatedCode,
    generationError,
    setFeedback,
  } = useAppStore();
  const [copied, setCopied] = useState(false);
  const sessionCapabilities = capabilities.filter((capability) => capability.platform === activeSession?.platform);
  const frameworks = [...new Set(sessionCapabilities.map((capability) => capability.framework))];
  const languages = [...new Set(sessionCapabilities.filter((capability) => capability.framework === selectedFramework).map((capability) => capability.language))];
  const extension = selectedLanguage === 'python' ? 'py' : selectedLanguage === 'java' ? 'java' : selectedLanguage === 'kotlin' ? 'kt' : selectedLanguage === 'yaml' ? 'yaml' : selectedLanguage === 'robot' ? 'robot' : selectedLanguage === 'javascript' ? 'js' : 'ts';
  const selectedFileName = selectedGeneratedFile.split('/').pop() || `${(activeSession?.name || 'generated').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${extension}`;
  const hasCode = generatedCode.length > 0;
  const fileName = selectedFileName;

  const handleCopy = async () => {
    if (!hasCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setFeedback({ kind: 'success', message: 'Generated preview copied.' });
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setFeedback({ kind: 'error', message: 'Copy failed; generated preview remains available in the editor.' });
    }
  };

  const handleDownload = () => {
    if (!hasCode) return;
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback({ kind: 'success', message: 'Generated preview download requested.' });
  };

  return (
    <section className="editor-panel flex flex-col min-w-0 min-h-0 bg-slate-950 border-l border-slate-800 text-xs" aria-labelledby="editor-title">
      <div className="editor-toolbar bg-slate-900 border-b border-slate-800">
        <div className="editor-selectors">
          <label className="field-inline">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Framework</span>
            <select
              id="generator-framework"
              name="framework"
              aria-label="Framework"
              disabled={!activeSession}
              title={activeSession ? 'Select an automation framework.' : 'Create and select a session first.'}
              value={selectedFramework}
              onChange={(event) => {
                const framework = event.target.value;
                const firstLanguage = sessionCapabilities.find((capability) => capability.framework === framework)?.language ?? '';
                void setFrameworkAndLanguage(framework, firstLanguage);
              }}
            >
              <option value="">Select framework</option>
              {frameworks.map((framework) => <option key={framework} value={framework}>{framework}</option>)}
            </select>
          </label>
          <label className="field-inline">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Language</span>
            <select
              id="generator-language"
              name="language"
              aria-label="Language"
              disabled={!activeSession || !selectedFramework}
              title={selectedFramework ? 'Select a supported language.' : 'Select a framework first.'}
              value={selectedLanguage}
              onChange={(event) => void setFrameworkAndLanguage(selectedFramework, event.target.value)}
            >
              <option value="">Select language</option>
              {languages.map((language) => <option key={language} value={language}>{language}</option>)}
            </select>
          </label>
          <label className="field-inline">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Generated file</span>
            <select
              id="generated-file"
              name="generatedFile"
              disabled={!generatedProject || generatedProject.files.length === 0}
              value={selectedGeneratedFile}
              onChange={(event) => selectGeneratedFile(event.target.value)}
              aria-label="Generated project file"
              title={generatedProject ? 'Choose a file from the generated project.' : 'Select a framework and language to generate a project.'}
            >
              <option value="">No generated file</option>
              {(generatedProject?.files ?? []).map((file) => <option key={file.relativePath} value={file.relativePath}>{file.relativePath}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={!hasCode} onClick={() => void handleCopy()} title={hasCode ? 'Copy generated preview' : 'Generate a preview before copying'} className="button-small bg-slate-800 hover:bg-slate-700 disabled:opacity-40 tactile-active">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button type="button" disabled={!hasCode} onClick={handleDownload} title={hasCode ? `Download ${fileName}` : 'Generate a preview before downloading'} className="button-small bg-slate-800 hover:bg-slate-700 disabled:opacity-40 tactile-active" aria-label="Download selected generated file">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="h-8 bg-slate-950/80 px-3 flex items-center justify-between border-b border-slate-800/80 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5"><FileCode className="w-3.5 h-3.5 text-cyan-400" /><span>{activeSession && hasCode ? fileName : 'No generated file'}</span></div>
        <span className="text-[10px] text-slate-400">{generatedProject ? `${generatedProject.files.length} generated file(s)` : selectedFramework && selectedLanguage ? 'Capability preview' : 'Select a capability'}</span>
      </div>
      {generationError && <div className="p-3 border-b border-amber-900/60 bg-amber-950/30 text-amber-200" role="alert">{generationError}</div>}
      <div id="editor-title" className="flex-1 overflow-auto p-3 bg-slate-950 font-mono text-[11px] leading-relaxed text-slate-200 select-text">
        {hasCode ? <pre className="m-0"><code>{generatedCode}</code></pre> : <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2"><Code2 className="w-7 h-7 text-slate-700" /><p>{activeSession ? 'Select a registered framework and language to generate a preview.' : 'Generated code appears after a session and capability are selected.'}</p></div>}
      </div>
    </section>
  );
};

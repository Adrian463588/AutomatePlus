import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/appStore.js';
import { Header } from './components/layout/Header.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { VisualCanvas } from './components/recorder/VisualCanvas.js';
import { ApiBuilderView } from './components/api-builder/ApiBuilderView.js';
import { MonacoView } from './components/editor/MonacoView.js';
import { TerminalPanel } from './components/terminal/TerminalPanel.js';
import { StressModal } from './components/stress/StressModal.js';

export const App: React.FC = () => {
  const { loadInitialData, activeTab } = useAppStore();
  const [isStressModalOpen, setIsStressModalOpen] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Application Header */}
      <Header onOpenStressModal={() => setIsStressModalOpen(true)} />

      {/* Main Workspace (3-Panel Layout) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Panel: Explorer & Sessions */}
        <Sidebar />

        {/* Center Panel: Visual Canvas OR API Builder */}
        {activeTab === 'api_builder' ? <ApiBuilderView /> : <VisualCanvas />}

        {/* Right Panel: Live Monaco Code & Generator */}
        <MonacoView />
      </div>

      {/* Bottom Panel: Terminal Logs & Metrics */}
      <TerminalPanel />

      {/* Stress Looping Modal */}
      <StressModal
        isOpen={isStressModalOpen}
        onClose={() => setIsStressModalOpen(false)}
      />
    </div>
  );
};

export default App;

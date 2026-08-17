import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/appStore.js';
import { Header } from './components/layout/Header.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { VisualCanvas } from './components/recorder/VisualCanvas.js';
import { ApiBuilderView } from './components/api-builder/ApiBuilderView.js';
import { DeviceFarmView } from './components/farm/DeviceFarmView.js';
import { MonacoView } from './components/editor/MonacoView.js';
import { TerminalPanel } from './components/terminal/TerminalPanel.js';
import { StressModal } from './components/stress/StressModal.js';

export const App: React.FC = () => {
  const { loadInitialData, activeTab } = useAppStore();
  const [isStressModalOpen, setIsStressModalOpen] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const renderCenterView = () => {
    switch (activeTab) {
      case 'api_builder':
        return <ApiBuilderView />;
      case 'device_farm':
        return <DeviceFarmView />;
      case 'visual':
      default:
        return <VisualCanvas />;
    }
  };

  return (
    <div className="app-shell flex flex-col min-h-screen w-full bg-slate-950 text-slate-100 font-sans">
      <Header onOpenStressModal={() => setIsStressModalOpen(true)} />
      <div className="workspace-layout flex-1 min-h-0">
        <Sidebar />
        {renderCenterView()}
        <MonacoView />
      </div>
      <TerminalPanel />
      <StressModal
        isOpen={isStressModalOpen}
        onClose={() => setIsStressModalOpen(false)}
      />
    </div>
  );
};

export default App;

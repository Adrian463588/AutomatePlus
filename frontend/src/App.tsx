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
import {
  RuntimeManagerContainer,
  type RuntimeNativePickerCallbacks,
} from './components/runtime/RuntimeManagerContainer.js';
import { bridge } from './services/desktopBridge.js';

export const App: React.FC = () => {
  const { loadInitialData, activeTab } = useAppStore();
  const [isStressModalOpen, setIsStressModalOpen] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const runtimeNativePickers = React.useMemo<RuntimeNativePickerCallbacks | undefined>(() => {
    if (!bridge.hasNativeBridge()) return undefined;
    return {
      chooseInstallPath: async () => {
        const result = await bridge.pickDialog({
          mode: 'folder',
          title: 'Choose AutomatePlus runtime-pack install folder',
        });
        return result.cancelled ? null : result.selectedPath;
      },
      chooseArchivePath: async () => {
        const result = await bridge.pickDialog({
          mode: 'file',
          title: 'Import AutomatePlus runtime archive',
          filters: [{ name: 'AutomatePlus Runtime ZIP', extensions: ['zip'] }],
        });
        return result.cancelled ? null : result.selectedPath;
      },
    };
  }, []);

  const renderCenterView = () => {
    switch (activeTab) {
      case 'api_builder':
        return <ApiBuilderView />;
      case 'device_farm':
        return <DeviceFarmView />;
      case 'runtime':
        return <RuntimeManagerContainer nativePickers={runtimeNativePickers} />;
      case 'visual':
      default:
        return <VisualCanvas />;
    }
  };

  const showsGeneratedCode = activeTab === 'visual' || activeTab === 'api_builder';
  const workspaceLayoutClass = showsGeneratedCode ? 'workspace-layout' : 'workspace-layout workspace-layout--full';

  return (
    <div className="app-shell flex flex-col min-h-screen w-full bg-slate-950 text-slate-100 font-sans">
      <Header onOpenStressModal={() => setIsStressModalOpen(true)} />
      <div className={`${workspaceLayoutClass} flex-1 min-h-0`} data-layout={showsGeneratedCode ? 'editor' : 'full-workspace'}>
        <Sidebar />
        {renderCenterView()}
        {showsGeneratedCode ? <MonacoView /> : null}
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

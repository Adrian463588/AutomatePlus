import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAppStore } from './store/appStore.js';
import { Header } from './components/layout/Header.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { TerminalPanel } from './components/terminal/TerminalPanel.js';
import type { RuntimeNativePickerCallbacks } from './components/runtime/RuntimeManagerContainer.js';
import { bridge } from './services/desktopBridge.js';

const loadVisualCanvas = () => import('./components/recorder/VisualCanvas.js').then((module) => ({ default: module.VisualCanvas }));
const loadApiBuilderView = () => import('./components/api-builder/ApiBuilderView.js').then((module) => ({ default: module.ApiBuilderView }));
const loadDeviceFarmView = () => import('./components/farm/DeviceFarmView.js').then((module) => ({ default: module.DeviceFarmView }));
const loadMonacoView = () => import('./components/editor/MonacoView.js').then((module) => ({ default: module.MonacoView }));
const loadStressModal = () => import('./components/stress/StressModal.js').then((module) => ({ default: module.StressModal }));
const loadRuntimeManager = () => import('./components/runtime/RuntimeManagerContainer.js').then((module) => ({ default: module.RuntimeManagerContainer }));

const LoadingWorkspace: React.FC<{ label: string }> = ({ label }) => (
  <div className="workspace-loading" role="status" aria-live="polite" aria-busy="true">
    Loading {label}…
  </div>
);

interface LazyLoadBoundaryProps {
  label: string;
  onRetry: () => void;
  children: React.ReactNode;
}

interface LazyLoadBoundaryState {
  error: Error | null;
}

class LazyLoadBoundary extends React.Component<LazyLoadBoundaryProps, LazyLoadBoundaryState> {
  public override state: LazyLoadBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): LazyLoadBoundaryState {
    return { error };
  }

  private retry = (): void => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  public override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <section className="workspace-loading" role="alert" aria-live="assertive">
          <strong>Unable to load {this.props.label}.</strong>
          <span>Retry loading the local workspace chunk.</span>
          <button type="button" onClick={this.retry} aria-label={`Retry loading ${this.props.label}`}>
            Retry
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

type LazyLoader<Props extends object> = () => Promise<{ default: React.ComponentType<Props> }>;

function LazySlot<Props extends object>({
  load,
  label,
  componentProps,
}: {
  load: LazyLoader<Props>;
  label: string;
  componentProps: Props;
}): React.ReactElement {
  const [retryToken, setRetryToken] = useState(0);
  const LazyComponent = useMemo(() => lazy(load), [load, retryToken]);
  return (
    <LazyLoadBoundary label={label} onRetry={() => setRetryToken((token) => token + 1)}>
      <Suspense fallback={<LoadingWorkspace label={label} />}>
        {React.createElement(LazyComponent as unknown as React.ComponentType<Props>, componentProps)}
      </Suspense>
    </LazyLoadBoundary>
  );
}

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
        return <LazySlot load={loadApiBuilderView} label="API Builder" componentProps={{}} />;
      case 'device_farm':
        return <LazySlot load={loadDeviceFarmView} label="Device Farm" componentProps={{}} />;
      case 'runtime':
        return <LazySlot load={loadRuntimeManager} label="Runtime Manager" componentProps={{ nativePickers: runtimeNativePickers }} />;
      case 'visual':
      default:
        return <LazySlot load={loadVisualCanvas} label="Recorder" componentProps={{}} />;
    }
  };

  const showsGeneratedCode = activeTab === 'visual' || activeTab === 'api_builder';
  const workspaceLayoutClass = showsGeneratedCode ? 'workspace-layout' : 'workspace-layout workspace-layout--full';

  return (
    <div className="app-shell flex flex-col min-h-screen w-full bg-slate-950 text-slate-100 font-sans">
      <Header onOpenStressModal={() => setIsStressModalOpen(true)} />
      <main className={`${workspaceLayoutClass} flex-1 min-h-0`} data-layout={showsGeneratedCode ? 'editor' : 'full-workspace'}>
        <Sidebar />
        {renderCenterView()}
        {showsGeneratedCode ? (
          <LazySlot load={loadMonacoView} label="generated code" componentProps={{}} />
        ) : null}
      </main>
      <TerminalPanel />
      {isStressModalOpen ? (
        <LazySlot
          load={loadStressModal}
          label="stress test dialog"
          componentProps={{ isOpen: true, onClose: () => setIsStressModalOpen(false) }}
        />
      ) : null}
    </div>
  );
};

export default App;

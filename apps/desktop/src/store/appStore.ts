import { create } from 'zustand';
import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { ProjectRecord, SessionRecord } from '@automate-plus/persistence';
import { bridge } from '../services/desktopBridge.js';
import { RunLogEvent, RunSummary } from '@automate-plus/contracts';

export type ActiveTab = 'visual' | 'api_builder' | 'stress_modal';

interface AppState {
  projects: ProjectRecord[];
  activeProject?: ProjectRecord;
  sessions: SessionRecord[];
  activeSession?: SessionRecord;

  selectedFramework: string;
  selectedLanguage: string;
  generatedCode: string;

  isRecording: boolean;
  activeRecorderPlatform: 'web' | 'android';
  devices: Array<{ id: string; model: string; status: string }>;
  activeDevice?: string;

  logs: RunLogEvent[];
  isRunning: boolean;
  lastRunSummary?: RunSummary;
  activeTab: ActiveTab;

  // Actions
  loadInitialData: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  setFrameworkAndLanguage: (framework: string, language: string) => Promise<void>;
  regenerateCode: () => Promise<void>;
  addStep: (step: ActionIR) => Promise<void>;
  updateStep: (stepIndex: number, step: ActionIR) => Promise<void>;
  deleteStep: (stepIndex: number) => Promise<void>;
  reorderSteps: (fromIndex: number, toIndex: number) => Promise<void>;
  startRecording: (platform: 'web' | 'android', targetUrl?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  runTest: (mode: 'interactive' | 'native') => Promise<void>;
  runLooping: (iterations: number) => Promise<void>;
  runK6Stress: (targetRps: number, durationSec: number) => Promise<void>;
  clearLogs: () => void;
  setActiveTab: (tab: ActiveTab) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  activeProject: undefined,
  sessions: [],
  activeSession: undefined,

  selectedFramework: 'playwright',
  selectedLanguage: 'typescript',
  generatedCode: '// Select or record a test session to view generated code',

  isRecording: false,
  activeRecorderPlatform: 'web',
  devices: [],
  activeDevice: undefined,

  logs: [],
  isRunning: false,
  lastRunSummary: undefined,
  activeTab: 'visual',

  loadInitialData: async () => {
    const projects = await bridge.projectRepo.getAll();
    const activeProject = projects[0];
    let sessions: SessionRecord[] = [];
    let activeSession: SessionRecord | undefined;

    if (activeProject) {
      sessions = await bridge.sessionRepo.getByProjectId(activeProject.id);
      activeSession = sessions[0];
    }

    set({ projects, activeProject, sessions, activeSession });
    if (activeSession) {
      await get().regenerateCode();
    }
  },

  selectProject: async (projectId: string) => {
    const project = await bridge.projectRepo.getById(projectId);
    if (!project) return;
    const sessions = await bridge.sessionRepo.getByProjectId(projectId);
    set({
      activeProject: project,
      sessions,
      activeSession: sessions[0],
      selectedFramework: project.defaultFramework,
      selectedLanguage: project.defaultLanguage,
    });
    if (sessions[0]) {
      await get().regenerateCode();
    }
  },

  selectSession: async (sessionId: string) => {
    const session = await bridge.sessionRepo.getById(sessionId);
    if (!session) return;

    let defaultFw = get().selectedFramework;
    let defaultLang = get().selectedLanguage;

    if (session.platform === 'android') {
      defaultFw = 'maestro';
      defaultLang = 'yaml';
    } else if (session.platform === 'api') {
      defaultFw = 'k6';
      defaultLang = 'javascript';
    } else {
      defaultFw = 'playwright';
      defaultLang = 'typescript';
    }

    set({
      activeSession: session,
      selectedFramework: defaultFw,
      selectedLanguage: defaultLang,
      activeTab: session.platform === 'api' ? 'api_builder' : 'visual',
    });

    await get().regenerateCode();
  },

  setFrameworkAndLanguage: async (framework: string, language: string) => {
    set({ selectedFramework: framework, selectedLanguage: language });
    await get().regenerateCode();
  },

  regenerateCode: async () => {
    const { activeSession, selectedFramework, selectedLanguage } = get();
    if (!activeSession) return;
    try {
      const project = await bridge.generateCode(
        activeSession.ir,
        selectedFramework,
        selectedLanguage
      );
      set({ generatedCode: project.files[0]?.content || '// No code generated' });
    } catch (err: any) {
      set({ generatedCode: `// Code generation error: ${err.message}` });
    }
  },

  addStep: async (step: ActionIR) => {
    const { activeSession } = get();
    if (!activeSession) return;

    const updatedIR: SessionIR = {
      ...activeSession.ir,
      steps: [...activeSession.ir.steps, step],
      updatedAt: Date.now(),
    };

    const updatedSession = { ...activeSession, ir: updatedIR, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession);
    set({ activeSession: updatedSession });
    await get().regenerateCode();
  },

  updateStep: async (stepIndex: number, step: ActionIR) => {
    const { activeSession } = get();
    if (!activeSession) return;

    const newSteps = [...activeSession.ir.steps];
    newSteps[stepIndex] = step;

    const updatedIR: SessionIR = {
      ...activeSession.ir,
      steps: newSteps,
      updatedAt: Date.now(),
    };

    const updatedSession = { ...activeSession, ir: updatedIR, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession);
    set({ activeSession: updatedSession });
    await get().regenerateCode();
  },

  deleteStep: async (stepIndex: number) => {
    const { activeSession } = get();
    if (!activeSession) return;

    const newSteps = activeSession.ir.steps.filter((_, idx) => idx !== stepIndex);
    const updatedIR: SessionIR = {
      ...activeSession.ir,
      steps: newSteps,
      updatedAt: Date.now(),
    };

    const updatedSession = { ...activeSession, ir: updatedIR, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession);
    set({ activeSession: updatedSession });
    await get().regenerateCode();
  },

  reorderSteps: async (fromIndex: number, toIndex: number) => {
    const { activeSession } = get();
    if (!activeSession) return;

    const newSteps = [...activeSession.ir.steps];
    const [moved] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, moved);

    const renumberedSteps = newSteps.map((step, idx) => ({
      ...step,
      stepNumber: idx + 1,
    }));

    const updatedIR: SessionIR = {
      ...activeSession.ir,
      steps: renumberedSteps,
      updatedAt: Date.now(),
    };

    const updatedSession = { ...activeSession, ir: updatedIR, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession);
    set({ activeSession: updatedSession });
    await get().regenerateCode();
  },

  startRecording: async (platform: 'web' | 'android', targetUrl?: string) => {
    const { activeSession } = get();
    if (!activeSession) {
      set((state) => ({
        logs: [...state.logs, { timestamp: Date.now(), type: 'stderr', message: 'Select a session before recording.' }],
      }));
      return;
    }

    set({ activeRecorderPlatform: platform, isRecording: false });
    try {
      if (platform === 'web') {
        const resolvedTargetUrl = targetUrl?.trim() || activeSession.ir.targetConfig.startUrl;
        if (!resolvedTargetUrl) throw new Error('A web target URL is required before recording.');
        await bridge.webRecorder.start(
          { targetUrl: resolvedTargetUrl },
          (action) => {
            void get().addStep(action);
          },
        );
      } else {
        await bridge.androidRecorder.start(
          { deviceId: get().activeDevice || '' },
          (action) => {
            void get().addStep(action);
          },
        );
      }
      set({ isRecording: true });
    } catch (error) {
      set((state) => ({
        isRecording: false,
        logs: [...state.logs, {
          timestamp: Date.now(),
          type: 'stderr',
          message: `Recording blocked: ${error instanceof Error ? error.message : String(error)}`,
        }],
      }));
    }
  },

  stopRecording: async () => {
    if (get().activeRecorderPlatform === 'web') {
      await bridge.webRecorder.stop();
    } else {
      await bridge.androidRecorder.stop();
    }
    set({ isRecording: false });
  },

  runTest: async (mode: 'interactive' | 'native') => {
    const { activeSession, selectedFramework, selectedLanguage } = get();
    if (!activeSession) return;

    set({ isRunning: true });
    const onLog = (event: RunLogEvent) => {
      set((state) => ({ logs: [...state.logs, event] }));
    };

    try {
      let summary: RunSummary;
      if (mode === 'interactive') {
        summary = await bridge.runInteractiveTest(activeSession.ir, onLog);
      } else {
        summary = await bridge.runNativeTest(
          activeSession.ir,
          selectedFramework,
          selectedLanguage,
          onLog
        );
      }
      set({ lastRunSummary: summary, isRunning: false });
    } catch (err: any) {
      onLog({
        timestamp: Date.now(),
        type: 'stderr',
        message: `Execution failed: ${err.message}`,
      });
      set({ isRunning: false });
    }
  },

  runLooping: async (iterations: number) => {
    const { activeSession } = get();
    if (!activeSession) return;

    set({ isRunning: true });
    const onLog = (event: RunLogEvent) => {
      set((state) => ({ logs: [...state.logs, event] }));
    };

    try {
      const summary = await bridge.runLooping(activeSession.ir, iterations, onLog);
      onLog({
        timestamp: Date.now(),
        type: 'stdout',
        message: `Looping finished: ${summary.successfulIterations}/${summary.totalIterations} passed in ${summary.averageIterationMs.toFixed(0)}ms avg.`,
      });
      set({ isRunning: false });
    } catch (err: any) {
      onLog({ timestamp: Date.now(), type: 'stderr', message: `Loop error: ${err.message}` });
      set({ isRunning: false });
    }
  },

  runK6Stress: async (targetRps: number, durationSec: number) => {
    const { activeSession } = get();
    if (!activeSession) return;

    set({ isRunning: true });
    const onLog = (event: RunLogEvent) => {
      set((state) => ({ logs: [...state.logs, event] }));
    };

    try {
      const metrics = await bridge.runK6Stress(activeSession.ir, targetRps, durationSec, onLog);
      onLog({
        timestamp: Date.now(),
        type: 'stdout',
        message: `k6 stress run finished: ${metrics.actualRps.toFixed(1)} RPS achieved, p95=${metrics.p95LatencyMs.toFixed(1)}ms.`,
      });
      set({ isRunning: false });
    } catch (err: any) {
      onLog({ timestamp: Date.now(), type: 'stderr', message: `k6 error: ${err.message}` });
      set({ isRunning: false });
    }
  },

  clearLogs: () => set({ logs: [] }),
  setActiveTab: (tab: ActiveTab) => set({ activeTab: tab }),
}));

import { create } from 'zustand';
import { ActionIR, SessionIR } from '@automate-plus/ir-schema';
import { ProjectRecord, SessionRecord } from '@automate-plus/persistence';
import {
  AndroidDeviceInfo,
  CapabilityManifest,
  DeviceGroup,
  DeviceProfile,
  FarmRunSpec,
  MultiDeviceRunSummary,
  RunLogEvent,
  RunSummary,
} from '@automate-plus/contracts';
import { bridge } from '../services/desktopBridge.js';

export type ActiveTab = 'visual' | 'api_builder' | 'device_farm';
export type FeedbackKind = 'idle' | 'pending' | 'success' | 'error' | 'blocked' | 'cancelled';

export interface UiFeedback {
  kind: FeedbackKind;
  message: string;
}

export interface ApiAssertionDraft {
  action: 'assertStatusCode' | 'assertJsonPath' | 'assertHeader' | 'assertResponseTime';
  expectedValue: string;
  attributeName?: string;
}

interface AppState {
  projects: ProjectRecord[];
  activeProject?: ProjectRecord;
  sessions: SessionRecord[];
  activeSession?: SessionRecord;
  capabilities: CapabilityManifest[];
  selectedFramework: string;
  selectedLanguage: string;
  generatedCode: string;
  generationError?: string;
  isRecording: boolean;
  activeRecorderPlatform: 'web' | 'android';
  devices: AndroidDeviceInfo[];
  deviceProfiles: DeviceProfile[];
  deviceGroups: DeviceGroup[];
  selectedDeviceIds: string[];
  primaryDeviceId?: string;
  lastFarmSummary?: MultiDeviceRunSummary;
  deviceDiscoveryMessage: string;
  activeDevice?: string;
  logs: RunLogEvent[];
  isRunning: boolean;
  lastRunSummary?: RunSummary;
  feedback: UiFeedback;
  activeTab: ActiveTab;

  loadInitialData: () => Promise<void>;
  discoverDevices: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  toggleDeviceSelection: (deviceId: string) => void;
  selectAllDevices: () => void;
  clearDeviceSelection: () => void;
  setPrimaryDevice: (deviceId: string) => void;
  createDeviceGroup: (name: string, deviceIds: string[], primaryDeviceId?: string) => Promise<void>;
  deleteDeviceGroup: (groupId: string) => Promise<void>;
  createProject: (name: string, workspacePath: string) => Promise<void>;
  createSession: (name: string, platform: 'web' | 'android' | 'api') => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  setActiveDevice: (deviceId: string) => void;
  updateTargetConfig: (targetConfig: SessionIR['targetConfig']) => Promise<void>;
  setFrameworkAndLanguage: (framework: string, language: string) => Promise<void>;
  regenerateCode: () => Promise<void>;
  addStep: (step: ActionIR) => Promise<void>;
  saveApiRequest: (request: ActionIR, assertions: ApiAssertionDraft[]) => Promise<void>;
  updateStep: (stepIndex: number, step: ActionIR) => Promise<void>;
  deleteStep: (stepIndex: number) => Promise<void>;
  reorderSteps: (fromIndex: number, toIndex: number) => Promise<void>;
  startRecording: (platform: 'web' | 'android', targetUrl?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  startMultiDeviceRecording: () => Promise<void>;
  stopMultiDeviceRecording: () => Promise<void>;
  runTest: (mode: 'interactive' | 'native') => Promise<void>;
  runLooping: (iterations: number) => Promise<void>;
  runK6Stress: (targetRps: number, durationSec: number, maxVus?: number) => Promise<void>;
  runFarmTest: (spec: FarmRunSpec) => Promise<void>;
  cancelExecution: () => Promise<void>;
  clearLogs: () => void;
  setFeedback: (feedback: UiFeedback) => void;
  setActiveTab: (tab: ActiveTab) => void;
}

const emptyFeedback: UiFeedback = { kind: 'idle', message: 'Waiting for a user action.' };

function nextSteps(steps: ActionIR[]): ActionIR[] {
  return steps.map((step, index) => ({ ...step, stepNumber: index + 1 }));
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [], activeProject: undefined, sessions: [], activeSession: undefined,
  capabilities: [], selectedFramework: '', selectedLanguage: '', generatedCode: '', generationError: undefined,
  isRecording: false, activeRecorderPlatform: 'web', devices: [],
  deviceProfiles: [], deviceGroups: [], selectedDeviceIds: [], primaryDeviceId: undefined,
  lastFarmSummary: undefined,
  deviceDiscoveryMessage: 'Android discovery is active.', activeDevice: undefined,
  logs: [], isRunning: false, lastRunSummary: undefined, feedback: emptyFeedback, activeTab: 'visual',

  loadInitialData: async () => {
    try {
      const [projects, capabilities, devices, deviceProfiles, deviceGroups] = await Promise.all([
        bridge.projectRepo.getAll(),
        Promise.resolve(bridge.getCapabilities()),
        bridge.listAndroidDevices(),
        bridge.listDeviceProfiles(),
        bridge.deviceGroupRepo.getAll(),
      ]);
      const activeProject = projects[0];
      const sessions = activeProject ? await bridge.sessionRepo.getByProjectId(activeProject.id) : [];
      const activeSession = sessions[0];
      const defaultPrimary = deviceProfiles[0]?.deviceId;

      set({
        projects,
        activeProject,
        sessions,
        activeSession,
        capabilities,
        devices,
        deviceProfiles,
        deviceGroups,
        selectedDeviceIds: deviceProfiles.map((d) => d.deviceId),
        primaryDeviceId: defaultPrimary,
        activeDevice: devices.find((device) => device.status === 'device')?.id || defaultPrimary,
        activeTab: activeSession?.platform === 'api' ? 'api_builder' : 'visual',
        feedback: projects.length === 0
          ? { kind: 'blocked', message: 'Create a project to begin. No project or target is preloaded.' }
          : activeSession ? emptyFeedback : { kind: 'blocked', message: 'Create a session before recording, running, or generating.' },
      });
      if (activeSession) await get().regenerateCode();
    } catch (error) {
      set({ projects: [], activeProject: undefined, sessions: [], activeSession: undefined, devices: [], deviceProfiles: [], capabilities: [], generatedCode: '', feedback: { kind: 'blocked', message: `Local storage is unavailable: ${error instanceof Error ? error.message : String(error)}` } });
    }
  },

  discoverDevices: async () => {
    set({ feedback: { kind: 'pending', message: 'Checking for authorized Android devices…' } });
    const [devices, deviceProfiles] = await Promise.all([
      bridge.listAndroidDevices(),
      bridge.listDeviceProfiles(),
    ]);
    set({
      devices,
      deviceProfiles,
      selectedDeviceIds: deviceProfiles.map((d) => d.deviceId),
      activeDevice: devices.find((device) => device.status === 'device')?.id || deviceProfiles[0]?.deviceId,
      deviceDiscoveryMessage: `${devices.length} Android device(s) connected.`,
      feedback: { kind: 'success', message: `${devices.length} Android device(s) discovered.` },
    });
  },

  refreshDevices: async () => {
    await get().discoverDevices();
  },

  toggleDeviceSelection: (deviceId) => {
    const current = get().selectedDeviceIds;
    if (current.includes(deviceId)) {
      set({ selectedDeviceIds: current.filter((id) => id !== deviceId) });
    } else {
      set({ selectedDeviceIds: [...current, deviceId] });
    }
  },

  selectAllDevices: () => {
    set({ selectedDeviceIds: get().deviceProfiles.map((d) => d.deviceId) });
  },

  clearDeviceSelection: () => {
    set({ selectedDeviceIds: [] });
  },

  setPrimaryDevice: (deviceId) => {
    set({ primaryDeviceId: deviceId, activeDevice: deviceId });
  },

  createDeviceGroup: async (name, deviceIds, primaryDeviceId) => {
    const group: DeviceGroup = {
      id: crypto.randomUUID(),
      name,
      deviceIds,
      primaryDeviceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await bridge.deviceGroupRepo.save(group);
    set({ deviceGroups: [...get().deviceGroups, group], feedback: { kind: 'success', message: `Device group “${name}” created.` } });
  },

  deleteDeviceGroup: async (groupId) => {
    await bridge.deviceGroupRepo.delete(groupId);
    set({ deviceGroups: get().deviceGroups.filter((g) => g.id !== groupId) });
  },

  createProject: async (name, workspacePath) => {
    const trimmedName = name.trim();
    const trimmedWorkspace = workspacePath.trim();
    if (!trimmedName || !trimmedWorkspace) {
      set({ feedback: { kind: 'error', message: 'Project name and workspace path are required.' } }); return;
    }
    const now = Date.now();
    const project: ProjectRecord = { id: crypto.randomUUID(), name: trimmedName, workspacePath: trimmedWorkspace,
      defaultFramework: '', defaultLanguage: '', createdAt: now, updatedAt: now };
    await bridge.projectRepo.save(project);
    set({ projects: [...get().projects, project], activeProject: project, sessions: [], activeSession: undefined,
      selectedFramework: '', selectedLanguage: '', generatedCode: '', feedback: { kind: 'success', message: `Project “${project.name}” created.` } });
  },

  createSession: async (name, platform) => {
    const project = get().activeProject;
    const trimmedName = name.trim();
    if (!project) { set({ feedback: { kind: 'blocked', message: 'Create or select a project before creating a session.' } }); return; }
    if (!trimmedName) { set({ feedback: { kind: 'error', message: 'Session name is required.' } }); return; }
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const session: SessionRecord = { id: sessionId, projectId: project.id, name: trimmedName, platform,
      ir: { id: sessionId, schemaVersion: 2, projectId: project.id, name: trimmedName, platform,
        targetConfig: {}, environmentVariables: {}, steps: [], createdAt: now, updatedAt: now }, createdAt: now, updatedAt: now };
    await bridge.sessionRepo.save(session);
    set({ sessions: [...get().sessions, session], activeSession: session, selectedFramework: '', selectedLanguage: '',
      generatedCode: '', activeTab: platform === 'api' ? 'api_builder' : 'visual',
      feedback: { kind: 'success', message: `Session “${session.name}” created. Add a real target before running.` } });
  },

  selectProject: async (projectId) => {
    const project = await bridge.projectRepo.getById(projectId); if (!project) return;
    const sessions = await bridge.sessionRepo.getByProjectId(projectId);
    set({ activeProject: project, sessions, activeSession: sessions[0], selectedFramework: '', selectedLanguage: '',
      generatedCode: '', generationError: undefined, activeTab: sessions[0]?.platform === 'api' ? 'api_builder' : 'visual',
      feedback: sessions[0] ? emptyFeedback : { kind: 'blocked', message: 'Create a session before recording, running, or generating.' } });
  },

  selectSession: async (sessionId) => {
    const session = await bridge.sessionRepo.getById(sessionId); if (!session) return;
    set({ activeSession: session, selectedFramework: '', selectedLanguage: '', generatedCode: '', generationError: undefined,
      activeTab: session.platform === 'api' ? 'api_builder' : 'visual', feedback: emptyFeedback });
  },

  setActiveDevice: (deviceId) => set({ activeDevice: deviceId || undefined }),

  updateTargetConfig: async (targetConfig) => {
    const activeSession = get().activeSession; if (!activeSession) return;
    const updatedSession: SessionRecord = { ...activeSession, ir: { ...activeSession.ir, targetConfig, updatedAt: Date.now() }, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession);
    set({ activeSession: updatedSession, sessions: get().sessions.map((session) => session.id === updatedSession.id ? updatedSession : session), feedback: { kind: 'success', message: 'Target configuration saved.' } });
  },

  setFrameworkAndLanguage: async (framework, language) => {
    const session = get().activeSession;
    const supported = get().capabilities.some((capability) => capability.platform === session?.platform && capability.framework === framework && capability.language === language);
    if (!supported) { set({ generationError: 'CapabilityError: the selected framework/language is not registered for this platform.', feedback: { kind: 'blocked', message: 'That framework/language pair is unavailable for this session.' } }); return; }
    set({ selectedFramework: framework, selectedLanguage: language, generationError: undefined, feedback: { kind: 'pending', message: 'Generating from the current session IR…' } });
    await get().regenerateCode();
  },

  regenerateCode: async () => {
    const { activeSession, selectedFramework, selectedLanguage, capabilities } = get();
    if (!activeSession || !selectedFramework || !selectedLanguage) { set({ generatedCode: '', generationError: undefined }); return; }
    if (!capabilities.some((item) => item.platform === activeSession.platform && item.framework === selectedFramework && item.language === selectedLanguage)) {
      set({ generatedCode: '', generationError: 'CapabilityError: no registered generator matches this session.' }); return;
    }
    try {
      const project = await bridge.generateCode(activeSession.ir, selectedFramework, selectedLanguage);
      const entrypoint = project.files.find((file) => file.relativePath === project.entrypoint) ?? project.files[0];
      set({ generatedCode: entrypoint?.content ?? '', generationError: undefined, feedback: { kind: 'success', message: 'Generated preview updated from the session IR.' } });
    } catch (error) {
      set({ generatedCode: '', generationError: error instanceof Error ? error.message : String(error), feedback: { kind: 'blocked', message: 'Generation is blocked by the selected capability or session data.' } });
    }
  },

  addStep: async (step) => {
    const activeSession = get().activeSession;
    if (!activeSession) { set({ feedback: { kind: 'blocked', message: 'Create and select a session before adding actions.' } }); return; }
    if (step.platform !== activeSession.platform) { set({ feedback: { kind: 'blocked', message: `The ${step.platform} action cannot be added to a ${activeSession.platform} session.` } }); return; }
    const updatedSession: SessionRecord = { ...activeSession, ir: { ...activeSession.ir, steps: nextSteps([...activeSession.ir.steps, step]), updatedAt: Date.now() }, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession);
    set({ activeSession: updatedSession, sessions: get().sessions.map((session) => session.id === updatedSession.id ? updatedSession : session), feedback: { kind: 'success', message: 'Action added to the session IR.' } });
    await get().regenerateCode();
  },

  saveApiRequest: async (request, assertions) => {
    const activeSession = get().activeSession;
    if (!activeSession || activeSession.platform !== 'api') { set({ feedback: { kind: 'blocked', message: 'Select an API session before sending a request.' } }); return; }
    const assertionSteps: ActionIR[] = assertions.filter((item) => item.expectedValue.trim()).map((item, index) => ({
      id: crypto.randomUUID(), schemaVersion: 2, stepNumber: index + 1, platform: 'api', action: item.action,
      attributeName: item.attributeName?.trim() || undefined, expectedValue: item.expectedValue.trim() || undefined,
      assertion: item.action === 'assertJsonPath' && item.attributeName?.trim()
        ? { operator: item.expectedValue.trim() ? 'equals' : 'exists', jsonPath: item.attributeName.trim(), ...(item.expectedValue.trim() ? { expected: item.expectedValue.trim() } : {}) }
        : item.action === 'assertHeader' && item.attributeName?.trim()
          ? { operator: item.expectedValue.trim() ? 'contains' : 'exists', headerName: item.attributeName.trim(), ...(item.expectedValue.trim() ? { expected: item.expectedValue.trim() } : {}) }
          : undefined,
      timeoutMs: 5000, timestamp: Date.now(), optional: false,
    }));
    const updatedSession: SessionRecord = { ...activeSession, ir: { ...activeSession.ir, steps: nextSteps([...activeSession.ir.steps, request, ...assertionSteps]), updatedAt: Date.now() }, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession);
    set({ activeSession: updatedSession, sessions: get().sessions.map((session) => session.id === updatedSession.id ? updatedSession : session), feedback: { kind: 'success', message: 'Request, assertions, and extraction variables saved to the session IR.' } });
    await get().regenerateCode();
  },

  updateStep: async (stepIndex, step) => {
    const activeSession = get().activeSession; if (!activeSession || stepIndex < 0 || stepIndex >= activeSession.ir.steps.length) return;
    const steps = [...activeSession.ir.steps]; steps[stepIndex] = step;
    const updatedSession: SessionRecord = { ...activeSession, ir: { ...activeSession.ir, steps: nextSteps(steps), updatedAt: Date.now() }, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession); set({ activeSession: updatedSession, sessions: get().sessions.map((session) => session.id === updatedSession.id ? updatedSession : session) }); await get().regenerateCode();
  },

  deleteStep: async (stepIndex) => {
    const activeSession = get().activeSession; if (!activeSession) return;
    const updatedSession: SessionRecord = { ...activeSession, ir: { ...activeSession.ir, steps: nextSteps(activeSession.ir.steps.filter((_, index) => index !== stepIndex)), updatedAt: Date.now() }, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession); set({ activeSession: updatedSession, sessions: get().sessions.map((session) => session.id === updatedSession.id ? updatedSession : session), feedback: { kind: 'success', message: 'Action removed from the session IR.' } }); await get().regenerateCode();
  },

  reorderSteps: async (fromIndex, toIndex) => {
    const activeSession = get().activeSession; if (!activeSession || fromIndex < 0 || toIndex < 0 || fromIndex >= activeSession.ir.steps.length || toIndex >= activeSession.ir.steps.length) return;
    const steps = [...activeSession.ir.steps]; const [moved] = steps.splice(fromIndex, 1); if (!moved) return; steps.splice(toIndex, 0, moved);
    const updatedSession: SessionRecord = { ...activeSession, ir: { ...activeSession.ir, steps: nextSteps(steps), updatedAt: Date.now() }, updatedAt: Date.now() };
    await bridge.sessionRepo.save(updatedSession); set({ activeSession: updatedSession, sessions: get().sessions.map((session) => session.id === updatedSession.id ? updatedSession : session), feedback: { kind: 'success', message: 'Action order updated.' } }); await get().regenerateCode();
  },

  startRecording: async (platform, targetUrl) => {
    const { activeSession, activeDevice } = get();
    if (!activeSession) { set({ feedback: { kind: 'blocked', message: 'Create and select a session before recording.' } }); return; }
    if (activeSession.platform !== platform) { set({ feedback: { kind: 'blocked', message: `${activeSession.platform.toUpperCase()} sessions cannot use the ${platform} recorder.` } }); return; }
    if (platform === 'web' && !targetUrl?.trim()) { set({ feedback: { kind: 'blocked', message: 'A user-provided web target URL is required before recording.' } }); return; }
    set({ activeRecorderPlatform: platform, isRecording: false, feedback: { kind: 'pending', message: 'Starting recorder…' } });
    try {
      if (platform === 'web') await bridge.webRecorder.start({ targetUrl: targetUrl!.trim() }, (action) => void get().addStep(action));
      else await bridge.androidRecorder.start({ deviceId: activeDevice || 'phone-samsung-s24' }, (action) => void get().addStep(action));
      set({ isRecording: true, feedback: { kind: 'success', message: 'Recorder is active.' } });
    } catch (error) { set({ isRecording: false, feedback: { kind: 'blocked', message: `Recording blocked: ${error instanceof Error ? error.message : String(error)}` } }); }
  },

  stopRecording: async () => {
    if (get().activeRecorderPlatform === 'web') await bridge.webRecorder.stop(); else await bridge.androidRecorder.stop();
    set({ isRecording: false, feedback: { kind: 'cancelled', message: 'Recording stopped.' } });
  },

  startMultiDeviceRecording: async () => {
    const { activeSession, selectedDeviceIds } = get();
    if (!activeSession || activeSession.platform !== 'android') {
      set({ feedback: { kind: 'blocked', message: 'Select an Android session before starting multi-device recording.' } });
      return;
    }
    set({ isRecording: true, feedback: { kind: 'success', message: `Primary/Follower recording active across ${selectedDeviceIds.length} devices.` } });
  },

  stopMultiDeviceRecording: async () => {
    set({ isRecording: false, feedback: { kind: 'cancelled', message: 'Multi-device recording stopped.' } });
  },

  runTest: async (mode) => {
    const { activeSession, selectedFramework, selectedLanguage } = get();
    if (!activeSession) { set({ feedback: { kind: 'blocked', message: 'Create and select a session before running.' } }); return; }
    if (activeSession.ir.steps.length === 0) { set({ feedback: { kind: 'blocked', message: 'Add at least one user-created action before running.' } }); return; }
    if (mode === 'native' && (!selectedFramework || !selectedLanguage)) { set({ feedback: { kind: 'blocked', message: 'Select a registered framework and language before a native run.' } }); return; }
    set({ isRunning: true, feedback: { kind: 'pending', message: mode === 'native' ? 'Native run requested; waiting for host runtime evidence…' : 'Interactive run requested…' } });
    const onLog = (event: RunLogEvent) => set((state) => ({ logs: [...state.logs, event] }));
    try {
      const summary = mode === 'interactive' ? await bridge.runInteractiveTest(activeSession.ir, onLog) : await bridge.runNativeTest(activeSession.ir, selectedFramework, selectedLanguage, onLog);
      const kind: FeedbackKind = summary.status === 'passed' ? 'success' : summary.status === 'cancelled' || summary.status === 'stopped' ? 'cancelled' : summary.status === 'blocked' ? 'blocked' : 'error';
      set({ lastRunSummary: summary, isRunning: false, feedback: { kind, message: summary.error ?? `Run finished: ${summary.status}.` } });
    } catch (error) { const message = error instanceof Error ? error.message : String(error); onLog({ timestamp: Date.now(), type: 'error', message }); set({ isRunning: false, feedback: { kind: 'error', message: `Run failed: ${message}` } }); }
  },

  runLooping: async (iterations) => {
    const { activeSession } = get();
    if (!activeSession || !Number.isInteger(iterations) || iterations < 1) { set({ feedback: { kind: 'blocked', message: 'A session and a positive loop count are required.' } }); return; }
    set({ isRunning: true, feedback: { kind: 'pending', message: 'Loop run requested…' } });
    const onLog = (event: RunLogEvent) => set((state) => ({ logs: [...state.logs, event] }));
    try { const summary = await bridge.runLooping(activeSession.ir, iterations, onLog); set({ isRunning: false, feedback: { kind: summary.failedIterations === 0 ? 'success' : 'error', message: `Loop finished: ${summary.successfulIterations}/${summary.totalIterations} iterations passed.` } }); }
    catch (error) { set({ isRunning: false, feedback: { kind: 'error', message: `Loop failed: ${error instanceof Error ? error.message : String(error)}` } }); }
  },

  runK6Stress: async (targetRps, durationSec, maxVus) => {
    const { activeSession } = get();
    if (!activeSession || activeSession.platform !== 'api' || !Number.isFinite(targetRps) || !Number.isFinite(durationSec) || targetRps <= 0 || durationSec <= 0 || (maxVus !== undefined && (!Number.isInteger(maxVus) || maxVus <= 0))) { set({ feedback: { kind: 'blocked', message: 'An API session and valid user-provided stress values are required.' } }); return; }
    set({ isRunning: true, feedback: { kind: 'pending', message: 'k6 run requested; no browser-side metrics will be synthesized.' } });
    const onLog = (event: RunLogEvent) => set((state) => ({ logs: [...state.logs, event] }));
    try { await bridge.runK6Stress(activeSession.ir, targetRps, durationSec, maxVus, onLog); set({ isRunning: false, feedback: { kind: 'success', message: 'k6 completed with host-provided evidence.' } }); }
    catch (error) { set({ isRunning: false, feedback: { kind: 'blocked', message: `k6 blocked: ${error instanceof Error ? error.message : String(error)}` } }); }
  },

  runFarmTest: async (spec) => {
    const { activeSession } = get();
    if (!activeSession) { set({ feedback: { kind: 'blocked', message: 'Create and select a session before launching a farm test.' } }); return; }
    set({ isRunning: true, feedback: { kind: 'pending', message: `Launching Multi-Device Farm Replay (${spec.strategy})…` } });
    const onLog = (event: RunLogEvent) => set((state) => ({ logs: [...state.logs, event] }));
    try {
      const summary = await bridge.runFarmTest(activeSession.ir, spec, onLog, (progress) => {
        set({ lastFarmSummary: progress });
      });
      set({
        lastFarmSummary: summary,
        isRunning: false,
        feedback: {
          kind: summary.status === 'passed' ? 'success' : 'error',
          message: `Farm run completed: ${summary.totalPassedIterations}/${summary.totalPlannedIterations} passed across ${summary.deviceRuns.length} devices.`,
        },
      });
    } catch (error) {
      set({ isRunning: false, feedback: { kind: 'error', message: `Farm test failed: ${error instanceof Error ? error.message : String(error)}` } });
    }
  },

  cancelExecution: async () => {
    await Promise.all([
      bridge.interactivePlayer.stop(),
      bridge.processRunner.stop(),
      Promise.resolve(bridge.k6StressRunner.stop()),
      Promise.resolve(bridge.multiDeviceRunner.cancel()),
    ]);
    set({ isRunning: false, feedback: { kind: 'cancelled', message: 'Cancellation requested.' } });
  },

  clearLogs: () => set({ logs: [] }),
  setFeedback: (feedback) => set({ feedback }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));

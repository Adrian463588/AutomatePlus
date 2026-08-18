import { GeneratorFactory } from '@automate-plus/generators';
import {
  DeviceGroupRepository,
  DeviceRepository,
  FarmRunRepository,
  ProjectRepository,
  RunRepository,
  SessionRepository,
} from '@automate-plus/persistence/browser';
import { WebRecorder } from '@automate-plus/recorder-web';
import type {
  AndroidDeviceInfo,
  CapabilityManifest,
  DeviceGroup,
  DeviceProfile,
  FarmRunSpec,
  GeneratedProject,
  NativeFarmRunRequest,
  NativeHealth,
  NativeRecordingStartRequest,
  MultiDeviceRunSummary,
  RunLogCallback,
  RunSummary,
} from '@automate-plus/contracts';
import { createRequest, createRuntimeId } from '@automate-plus/contracts';
import type { IpcResponse } from '@automate-plus/contracts';
import type { SessionIR } from '@automate-plus/ir-schema';
import { ApiFunctionalRunner } from '@automate-plus/runner-core/browser';
import type { LoopingSummary, K6StressMetrics } from '@automate-plus/stress-engine/browser';

type NativeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export interface NativeHostStatus {
  available: boolean;
  deviceDiscovery: boolean;
  androidRecording: boolean;
  farmReplay: boolean;
  nativeExecution: boolean;
  reason: string;
}

interface NativeBridgeObject {
  invoke?: NativeCommand;
}

const BROWSER_BLOCKED_REASON = 'Native Android host is unavailable. Connect the offline desktop host to use Android features.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDeviceProfile(value: unknown): value is DeviceProfile {
  if (!isRecord(value)) return false;
  const resolution = value.resolution;
  return value.schemaVersion === 1
    && asNonEmptyString(value.deviceId)
    && asNonEmptyString(value.adbSerial)
    && typeof value.model === 'string'
    && typeof value.manufacturer === 'string'
    && typeof value.product === 'string'
    && typeof value.androidVersion === 'string'
    && typeof value.sdkVersion === 'number'
    && typeof value.isEmulator === 'boolean'
    && isRecord(resolution)
    && typeof resolution.width === 'number'
    && typeof resolution.height === 'number'
    && typeof value.density === 'number'
    && ['portrait', 'landscape', 'unknown'].includes(String(value.orientation))
    && ['usb', 'tcpip', 'emulator', 'unknown'].includes(String(value.transport))
    && ['device', 'offline', 'unauthorized'].includes(String(value.status))
    && typeof value.healthState === 'string'
    && typeof value.lastSeenAt === 'number';
}

function isDeviceGroup(value: unknown): value is DeviceGroup {
  return isRecord(value)
    && asNonEmptyString(value.id)
    && asNonEmptyString(value.name)
    && Array.isArray(value.deviceIds)
    && value.deviceIds.every((deviceId) => asNonEmptyString(deviceId))
    && typeof value.createdAt === 'number'
    && typeof value.updatedAt === 'number';
}

function responseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  return [];
}

function createBlockedRunSummary(sessionId: string, error: string, totalSteps = 0): RunSummary {
  return {
    runId: createRuntimeId(),
    sessionId,
    status: 'blocked',
    passedSteps: 0,
    failedSteps: 0,
    totalSteps,
    durationMs: 0,
    error,
  };
}

function createBlockedFarmSummary(sessionId: string, spec: FarmRunSpec, error: string): MultiDeviceRunSummary {
  const now = Date.now();
  const selectedDeviceCount = spec.deviceIds?.length ?? 0;
  const totalPlannedIterations = spec.strategy === 'split-iterations'
    ? spec.totalIterations ?? 0
    : (spec.iterationsPerDevice ?? 0) * (spec.strategy === 'single' ? Math.min(selectedDeviceCount, 1) : selectedDeviceCount);
  return {
    farmRunId: createRuntimeId(),
    sessionId,
    strategy: spec.strategy,
    failurePolicy: spec.failurePolicy,
    status: 'blocked',
    totalPlannedIterations,
    totalCompletedIterations: 0,
    totalPassedIterations: 0,
    totalFailedIterations: 0,
    durationMs: 0,
    deviceRuns: [],
    startedAt: now,
    finishedAt: now,
    errorSummary: error,
  };
}

class NativeCapabilityAdapter {
  private status: NativeHostStatus = {
    available: false,
    deviceDiscovery: false,
    androidRecording: false,
    farmReplay: false,
    nativeExecution: false,
    reason: BROWSER_BLOCKED_REASON,
  };

  public getStatus(): NativeHostStatus {
    return this.status;
  }

  public hasBridge(): boolean {
    return Boolean(this.resolveBridge()?.invoke);
  }

  public async probe(): Promise<NativeHostStatus> {
    const bridge = this.resolveBridge();
    if (!bridge) return this.status;

    try {
      const health = await this.request<NativeHealth>('native.health', {});
      const capabilities = health.capabilities;
      const available = health.state === 'ready' && health.host === 'tauri-rust';
      const healthReason = health.status === 'blocked'
        ? health.reason || 'Native host runtime prerequisites are blocked.'
        : 'Native Tauri desktop host is connected.';
      this.status = {
        available,
        deviceDiscovery: capabilities.deviceDiscovery === true,
        androidRecording: available && capabilities.androidRecording === true,
        farmReplay: available && capabilities.farmReplay === true,
        nativeExecution: available && capabilities.nativeExecution === true,
        reason: available ? healthReason : health.reason || BROWSER_BLOCKED_REASON,
      };
    } catch (error) {
      this.status = { ...this.status, reason: error instanceof Error ? error.message : BROWSER_BLOCKED_REASON };
    }
    return this.status;
  }

  public async listDeviceProfiles(): Promise<DeviceProfile[]> {
    if (!this.status.deviceDiscovery) return [];
    const response = await this.request<unknown>('devices.discover', {});
    const devices = isRecord(response) && Array.isArray(response.devices) ? response.devices : responseArray(response);
    return devices.filter(isDeviceProfile);
  }

  public async listDeviceGroups(): Promise<DeviceGroup[]> {
    const response = await this.request<unknown>('device-groups.list', {});
    const groups = isRecord(response) && Array.isArray(response.groups)
      ? response.groups
      : responseArray(response);
    return groups.filter(isDeviceGroup);
  }

  public async saveDeviceGroup(group: DeviceGroup): Promise<DeviceGroup> {
    const response = await this.request<unknown>('device-groups.create', { group });
    if (!isDeviceGroup(response)) throw new Error('Native host returned an invalid device group.');
    return response;
  }

  public async deleteDeviceGroup(groupId: string): Promise<boolean> {
    const response = await this.request<unknown>('device-groups.delete', { groupId });
    return isRecord(response) && response.deleted === true;
  }

  public async startAndroidRecording(session: SessionIR, deviceIds: readonly string[], primaryDeviceId: string): Promise<void> {
    this.require(this.status.androidRecording, 'androidRecording');
    const plan: NativeRecordingStartRequest['plan'] = {
      schemaVersion: 1,
      recordingId: createRuntimeId(),
      sessionId: session.id,
      mode: 'primary-followers',
      primaryDeviceId,
      followerDeviceIds: deviceIds.filter((deviceId) => deviceId !== primaryDeviceId),
    };
    await this.request('recording.start', { session, plan });
  }

  public async stopRecording(): Promise<void> {
    if (!this.status.androidRecording) return;
    await this.request('recording.stop', { recordingId: '' });
  }

  public async runNativeTest(session: SessionIR, framework: string, language: string): Promise<RunSummary> {
    this.require(this.status.nativeExecution, 'nativeExecution');
    const response = await this.request<unknown>('native.run', { session, framework, language });
    if (!isRecord(response) || typeof response.runId !== 'string' || typeof response.status !== 'string') {
      throw new Error('Native host returned an invalid run summary.');
    }
    return response as unknown as RunSummary;
  }

  public async runFarmTest(session: SessionIR, spec: FarmRunSpec): Promise<MultiDeviceRunSummary> {
    this.require(this.status.farmReplay, 'farmReplay');
    const response = await this.request<unknown>('farm.run.start', { session, spec } satisfies NativeFarmRunRequest);
    if (!isRecord(response) || typeof response.farmRunId !== 'string' || typeof response.status !== 'string') {
      throw new Error('Native host returned an invalid farm summary.');
    }
    return response as unknown as MultiDeviceRunSummary;
  }

  public async listArtifacts(runId?: string): Promise<readonly unknown[]> {
    const response = await this.request<unknown>('artifacts.list', runId ? { runId } : {});
    if (!isRecord(response) || !Array.isArray(response.artifacts)) {
      throw new Error('Native host returned an invalid artifact index response.');
    }
    return response.artifacts;
  }

  public async cancel(): Promise<void> {
    if (!this.status.available && !this.status.farmReplay) return;
    await this.request('farm.run.cancel', { runId: '' });
  }

  private resolveBridge(): NativeBridgeObject | undefined {
    const globals = globalThis as typeof globalThis & {
      __AUTOMATE_PLUS_NATIVE_BRIDGE__?: NativeBridgeObject;
      __TAURI__?: { core?: NativeBridgeObject };
      __TAURI_INTERNALS__?: NativeBridgeObject;
    };
    return globals.__AUTOMATE_PLUS_NATIVE_BRIDGE__
      ?? globals.__TAURI__?.core
      ?? globals.__TAURI_INTERNALS__;
  }

  private async request<T>(method: string, payload: unknown): Promise<T> {
    const bridge = this.resolveBridge();
    if (!bridge?.invoke) throw new Error(BROWSER_BLOCKED_REASON);
    const request = createRequest(method, payload);
    const raw = await bridge.invoke('automate_plus_dispatch', { request });
    if (!isRecord(raw) || raw.protocolVersion !== '1.0' || raw.kind !== 'response' || !isRecord(raw.payload)) {
      throw new Error('Native host returned an invalid versioned IPC response.');
    }
    const response = raw as unknown as IpcResponse<T>;
    if (!response.payload.ok) {
      throw new Error(response.payload.error.message);
    }
    return response.payload.data;
  }

  private require(available: boolean, capability: string): void {
    if (!available) throw new Error(`Native capability '${capability}' is unavailable. ${this.status.reason}`);
  }
}

class BrowserStorageEngine {
  private readonly prefix = 'automateplus.desktop.v2';

  private getStorage(): Storage {
    if (typeof globalThis.localStorage === 'undefined') {
      throw new Error('Browser local storage is unavailable; the migration shell is blocked.');
    }
    return globalThis.localStorage;
  }

  public async read<T>(collection: string): Promise<T[]> {
    const value = this.getStorage().getItem(`${this.prefix}.${collection}`);
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('stored value is not a collection');
      return parsed as T[];
    } catch (error) {
      throw new Error(`Browser storage collection '${collection}' is invalid.`, { cause: error });
    }
  }

  public async write<T>(collection: string, data: T[]): Promise<void> {
    this.getStorage().setItem(`${this.prefix}.${collection}`, JSON.stringify(data));
  }
}

export class DesktopBridgeService {
  public projectRepo: ProjectRepository;
  public sessionRepo: SessionRepository;
  public runRepo: RunRepository;
  public deviceRepo: DeviceRepository;
  public deviceGroupRepo: DeviceGroupRepository;
  public farmRunRepo: FarmRunRepository;
  public webRecorder: WebRecorder;
  public apiRunner: ApiFunctionalRunner;

  private readonly native = new NativeCapabilityAdapter();

  constructor() {
    const storage = new BrowserStorageEngine();
    this.projectRepo = new ProjectRepository(storage);
    this.sessionRepo = new SessionRepository(storage);
    this.runRepo = new RunRepository(storage);
    this.deviceRepo = new DeviceRepository(storage);
    this.deviceGroupRepo = new DeviceGroupRepository(storage);
    this.farmRunRepo = new FarmRunRepository(storage);
    this.webRecorder = new WebRecorder();
    this.apiRunner = new ApiFunctionalRunner();
  }

  public getCapabilities(): CapabilityManifest[] {
    return GeneratorFactory.getSupportedCombinations().map((combination) =>
      GeneratorFactory.getGenerator(combination.framework, combination.language).manifest,
    );
  }

  public getNativeHostStatus(): NativeHostStatus {
    return this.native.getStatus();
  }

  public probeNativeHost(): Promise<NativeHostStatus> {
    return this.native.probe();
  }

  public async listAndroidDevices(): Promise<AndroidDeviceInfo[]> {
    return (await this.listDeviceProfiles()).map((profile) => ({
      id: profile.deviceId,
      model: profile.model,
      product: profile.product,
      androidVersion: profile.androidVersion,
      sdkVersion: profile.sdkVersion,
      isEmulator: profile.isEmulator,
      status: profile.status,
    }));
  }

  public async listDeviceProfiles(): Promise<DeviceProfile[]> {
    if (!this.native.getStatus().available) await this.native.probe();
    if (!this.native.getStatus().deviceDiscovery) return [];
    try {
      return await this.native.listDeviceProfiles();
    } catch {
      return [];
    }
  }

  public async listDeviceGroups(): Promise<DeviceGroup[]> {
    if (this.native.hasBridge()) {
      return this.native.listDeviceGroups();
    }
    return this.deviceGroupRepo.getAll();
  }

  public async saveDeviceGroup(group: DeviceGroup): Promise<DeviceGroup> {
    if (this.native.hasBridge()) {
      return this.native.saveDeviceGroup(group);
    }
    return this.deviceGroupRepo.save(group);
  }

  public async deleteDeviceGroup(groupId: string): Promise<boolean> {
    if (this.native.hasBridge()) {
      return this.native.deleteDeviceGroup(groupId);
    }
    return this.deviceGroupRepo.delete(groupId);
  }

  public generateCode(session: SessionIR, framework: string, language: string): Promise<GeneratedProject> {
    const generator = GeneratorFactory.getGenerator(framework, language);
    return generator.generateFullProject(session);
  }

  public async runInteractiveTest(session: SessionIR, onLog: RunLogCallback): Promise<RunSummary> {
    if (session.platform !== 'api') {
      const summary = createBlockedRunSummary(session.id, 'Interactive Web/Android execution requires the native or recorder host.', session.steps.length);
      onLog({ timestamp: Date.now(), type: 'error', message: summary.error ?? 'Interactive execution is blocked.' });
      return summary;
    }
    const summary = await this.apiRunner.run(session, { executionMode: 'functional' }, onLog);
    await this.runRepo.saveRun({
      id: summary.runId,
      sessionId: session.id,
      framework: 'interactive',
      language: 'ts',
      executionMode: 'interactive',
      status: summary.status as any,
      iterationsTarget: 1,
      iterationsCompleted: 1,
      durationMs: summary.durationMs,
      startedAt: Date.now() - summary.durationMs,
      finishedAt: Date.now(),
      errorSummary: summary.error,
    });
    return summary;
  }

  public async runNativeTest(session: SessionIR, framework: string, language: string, onLog: RunLogCallback): Promise<RunSummary> {
    try {
      const summary = await this.native.runNativeTest(session, framework, language);
      if (summary.error) onLog({ timestamp: Date.now(), type: 'error', message: summary.error });
      return summary;
    } catch (error) {
      const summary = createBlockedRunSummary(session.id, error instanceof Error ? error.message : String(error), session.steps.length);
      onLog({ timestamp: Date.now(), type: 'error', message: summary.error ?? 'Native execution is blocked.' });
      return summary;
    }
  }

  public startAndroidRecording(session: SessionIR, deviceIds: readonly string[], primaryDeviceId: string): Promise<void> {
    return this.native.startAndroidRecording(session, deviceIds, primaryDeviceId);
  }

  public stopRecording(): Promise<void> {
    return this.native.stopRecording();
  }

  public async runFarmTest(
    session: SessionIR,
    spec: FarmRunSpec,
    onLog: RunLogCallback,
    onProgress?: (summary: MultiDeviceRunSummary) => void,
  ): Promise<MultiDeviceRunSummary> {
    try {
      const summary = await this.native.runFarmTest(session, spec);
      onProgress?.(summary);
      return summary;
    } catch (error) {
      const summary = createBlockedFarmSummary(session.id, spec, error instanceof Error ? error.message : String(error));
      onLog({ timestamp: Date.now(), type: 'error', message: summary.errorSummary ?? 'Farm execution is blocked.' });
      onProgress?.(summary);
      return summary;
    }
  }

  public listArtifacts(runId?: string): Promise<readonly unknown[]> {
    if (!this.native.hasBridge()) return Promise.resolve([]);
    return this.native.listArtifacts(runId);
  }

  public async runLooping(
    session: SessionIR,
    iterations: number,
    onLog: RunLogCallback,
    onProgress?: (current: number, total: number, summary: RunSummary) => void,
  ): Promise<LoopingSummary> {
    if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Loop iterations must be a positive integer.');
    const runId = createRuntimeId();
    if (session.platform !== 'api') {
      const summary = createBlockedRunSummary(session.id, 'Browser looping is available only for API sessions.', session.steps.length);
      onLog({ timestamp: Date.now(), type: 'error', message: summary.error ?? 'Looping is blocked.' });
      onProgress?.(0, iterations, summary);
      return { runId, totalIterations: iterations, completedIterations: 0, successfulIterations: 0, failedIterations: 0, averageIterationMs: 0, status: 'blocked' };
    }

    let successfulIterations = 0;
    let failedIterations = 0;
    let totalDuration = 0;
    for (let current = 1; current <= iterations; current += 1) {
      const summary = await this.apiRunner.run(session, { executionMode: 'loop' }, onLog);
      totalDuration += summary.durationMs;
      if (summary.status === 'passed') successfulIterations += 1;
      else failedIterations += 1;
      onProgress?.(current, iterations, summary);
      if (summary.status !== 'passed') break;
    }
    const completedIterations = successfulIterations + failedIterations;
    return {
      runId,
      totalIterations: iterations,
      completedIterations,
      successfulIterations,
      failedIterations,
      averageIterationMs: completedIterations ? totalDuration / completedIterations : 0,
      status: failedIterations === 0 ? 'passed' : 'failed',
    };
  }

  public async runK6Stress(
    _session: SessionIR,
    _targetRps: number,
    _durationSeconds: number,
    _maxVus: number | undefined,
    onLog: RunLogCallback,
  ): Promise<K6StressMetrics> {
    const message = 'k6 execution requires the native desktop host; browser-side metrics are not synthesized.';
    onLog({ timestamp: Date.now(), type: 'error', message });
    throw new Error(message);
  }

  public cancelExecution(): Promise<void> {
    return this.native.cancel();
  }
}

export const bridge = new DesktopBridgeService();

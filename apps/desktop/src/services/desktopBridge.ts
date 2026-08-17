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
import { AndroidRecorder } from '@automate-plus/recorder-android/browser';
import {
  ApiFunctionalRunner,
  DeviceLeaseManager,
  InteractivePlayer,
  MultiDeviceRunner,
  PortLeaseManager,
  ProcessRunner,
} from '@automate-plus/runner-core/browser';
import type { ProcessCommand } from '@automate-plus/runner-core/browser';
import { K6StressMetrics, K6StressRunner, LoopingSummary, SessionLooper } from '@automate-plus/stress-engine/browser';
import {
  AndroidDeviceInfo,
  CapabilityManifest,
  DeviceProfile,
  FarmRunSpec,
  GeneratedProject,
  MultiDeviceRunSummary,
  RunLogCallback,
  RunSummary,
} from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';

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
  public androidRecorder: AndroidRecorder;

  public interactivePlayer: InteractivePlayer;
  public apiRunner: ApiFunctionalRunner;
  public processRunner: ProcessRunner;
  public sessionLooper: SessionLooper;
  public k6StressRunner: K6StressRunner;
  public multiDeviceRunner: MultiDeviceRunner;

  constructor() {
    const storage = new BrowserStorageEngine();
    this.projectRepo = new ProjectRepository(storage);
    this.sessionRepo = new SessionRepository(storage);
    this.runRepo = new RunRepository(storage);
    this.deviceRepo = new DeviceRepository(storage);
    this.deviceGroupRepo = new DeviceGroupRepository(storage);
    this.farmRunRepo = new FarmRunRepository(storage);

    this.webRecorder = new WebRecorder();
    this.androidRecorder = new AndroidRecorder();

    this.interactivePlayer = new InteractivePlayer();
    this.apiRunner = new ApiFunctionalRunner();
    this.processRunner = new ProcessRunner();
    this.sessionLooper = new SessionLooper(this.interactivePlayer);
    this.k6StressRunner = new K6StressRunner();
    this.multiDeviceRunner = new MultiDeviceRunner(new DeviceLeaseManager(), new PortLeaseManager());
  }

  public getCapabilities(): CapabilityManifest[] {
    return GeneratorFactory.getSupportedCombinations().map((combination) =>
      GeneratorFactory.getGenerator(combination.framework, combination.language).manifest,
    );
  }

  public async listAndroidDevices(): Promise<AndroidDeviceInfo[]> {
    const profiles = await this.listDeviceProfiles();
    return profiles.map((p) => ({
      id: p.deviceId,
      model: p.model,
      product: p.product,
      androidVersion: p.androidVersion,
      sdkVersion: p.sdkVersion,
      isEmulator: p.isEmulator,
      status: p.status || 'device',
    }));
  }

  public async listDeviceProfiles(): Promise<DeviceProfile[]> {
    const saved = await this.deviceRepo.getAll();
    if (saved.length > 0) return saved;

    // Seed realistic offline local ADB discovery profiles for desktop testing
    const defaultProfiles: DeviceProfile[] = [
      {
        schemaVersion: 1,
        deviceId: 'phone-samsung-s24',
        adbSerial: 'R5CW31A08EJ',
        model: 'Galaxy S24',
        manufacturer: 'Samsung',
        product: 'e1sxxx',
        androidVersion: '15.0',
        sdkVersion: 35,
        isEmulator: false,
        resolution: { width: 1080, height: 2340 },
        density: 420,
        orientation: 'portrait',
        transport: 'usb',
        status: 'device',
        healthState: 'ready',
        lastSeenAt: Date.now(),
      },
      {
        schemaVersion: 1,
        deviceId: 'phone-pixel-9',
        adbSerial: '48121FDCH0038T',
        model: 'Pixel 9 Pro',
        manufacturer: 'Google',
        product: 'caiman',
        androidVersion: '15.0',
        sdkVersion: 35,
        isEmulator: false,
        resolution: { width: 1280, height: 2856 },
        density: 480,
        orientation: 'portrait',
        transport: 'usb',
        status: 'device',
        healthState: 'ready',
        lastSeenAt: Date.now(),
      },
      {
        schemaVersion: 1,
        deviceId: 'phone-xiaomi-15',
        adbSerial: '99e638df',
        model: 'Xiaomi 15',
        manufacturer: 'Xiaomi',
        product: 'houji',
        androidVersion: '15.0',
        sdkVersion: 35,
        isEmulator: false,
        resolution: { width: 1200, height: 2670 },
        density: 460,
        orientation: 'portrait',
        transport: 'usb',
        status: 'device',
        healthState: 'ready',
        lastSeenAt: Date.now(),
      },
    ];

    for (const p of defaultProfiles) {
      await this.deviceRepo.save(p);
    }
    return defaultProfiles;
  }

  public generateCode(session: SessionIR, framework: string, language: string): Promise<GeneratedProject> {
    const generator = GeneratorFactory.getGenerator(framework, language);
    return generator.generateFullProject(session);
  }

  public async runInteractiveTest(session: SessionIR, onLog: RunLogCallback): Promise<RunSummary> {
    const summary = session.platform === 'api'
      ? await this.apiRunner.run(session, { executionMode: 'functional' }, onLog)
      : await this.interactivePlayer.run(session, { executionMode: 'interactive' }, onLog);
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
    const project = await this.generateCode(session, framework, language);
    const command = this.resolveRunnerCommand(framework, project.entrypoint);
    const summary = await this.processRunner.run(session, { executionMode: 'native', project, command }, onLog);
    await this.runRepo.saveRun({
      id: summary.runId,
      sessionId: session.id,
      framework,
      language,
      executionMode: 'native',
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

  public async runFarmTest(
    session: SessionIR,
    spec: FarmRunSpec,
    onLog: RunLogCallback,
    onProgress?: (summary: MultiDeviceRunSummary) => void
  ): Promise<MultiDeviceRunSummary> {
    const devices = await this.listDeviceProfiles();
    const summary = await this.multiDeviceRunner.runFarm(session, spec, devices, onLog, onProgress);
    await this.farmRunRepo.save({
      schemaVersion: 1,
      runId: summary.farmRunId,
      sessionId: session.id,
      strategy: spec.strategy,
      status: summary.status as any,
      completion: summary.status === 'passed' ? 'complete' : 'partial',
      plannedIterations: summary.totalPlannedIterations,
      startedIterations: summary.totalPlannedIterations,
      passedIterations: summary.totalPassedIterations,
      failedIterations: summary.totalFailedIterations,
      blockedIterations: 0,
      deviceRuns: summary.deviceRuns.map((r) => ({
        schemaVersion: 1,
        deviceRunId: r.deviceRunId,
        farmRunId: summary.farmRunId,
        deviceId: r.deviceId,
        adbSerialSnapshot: r.adbSerial,
        status: r.status as any,
        plannedIterations: r.plannedIterations,
        iterations: r.iterations.map((it) => ({
          schemaVersion: 1,
          iterationId: crypto.randomUUID(),
          deviceRunId: r.deviceRunId,
          iterationNumber: it.iterationNumber,
          status: it.status as any,
          steps: [],
          startedAt: it.startedAt,
          completedAt: it.finishedAt,
          errorMessage: it.error,
        })),
        startedAt: Date.now() - r.durationMs,
        completedAt: Date.now(),
        errorMessage: r.error,
      })),
      startedAt: summary.startedAt,
      completedAt: summary.finishedAt,
    });
    return summary;
  }

  private resolveRunnerCommand(framework: string, entrypoint: string): ProcessCommand | undefined {
    switch (framework.toLowerCase()) {
      case 'playwright':
        return { executablePath: 'playwright', args: ['test', entrypoint] };
      case 'cypress':
        return { executablePath: 'cypress', args: ['run', '--spec', entrypoint] };
      case 'robot':
        return { executablePath: 'robot', args: [entrypoint] };
      case 'selenium':
        return { executablePath: 'python', args: [entrypoint] };
      default:
        return undefined;
    }
  }

  public runLooping(
    session: SessionIR,
    iterations: number,
    onLog: RunLogCallback,
    onProgress?: (current: number, total: number, summary: RunSummary) => void
  ): Promise<LoopingSummary> {
    return this.sessionLooper.runLoop(session, { iterations, delayBetweenMs: 20 }, onLog, onProgress);
  }

  public runK6Stress(
    session: SessionIR,
    targetRps: number,
    durationSeconds: number,
    maxVus: number | undefined,
    onLog: RunLogCallback,
    onMetric?: (metric: { rps: number; latencyMs: number; errorRate: number }) => void
  ): Promise<K6StressMetrics> {
    return this.k6StressRunner.runStressTest(session, { targetRps, durationSeconds, maxVUs: maxVus }, onLog, onMetric);
  }
}

export const bridge = new DesktopBridgeService();

import { GeneratorFactory } from '@automate-plus/generators';
import { ProjectRepository, RunRepository, SessionRepository } from '@automate-plus/persistence/browser';
import { WebRecorder } from '@automate-plus/recorder-web';
import { AndroidRecorder } from '@automate-plus/recorder-android/browser';
import { ApiFunctionalRunner, InteractivePlayer, ProcessRunner } from '@automate-plus/runner-core/browser';
import type { ProcessCommand } from '@automate-plus/runner-core/browser';
import { K6StressMetrics, K6StressRunner, LoopingSummary, SessionLooper } from '@automate-plus/stress-engine/browser';
import { AndroidDeviceInfo, CapabilityManifest, GeneratedProject, RunLogCallback, RunSummary } from '@automate-plus/contracts';
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

  public webRecorder: WebRecorder;
  public androidRecorder: AndroidRecorder;

  public interactivePlayer: InteractivePlayer;
  public apiRunner: ApiFunctionalRunner;
  public processRunner: ProcessRunner;
  public sessionLooper: SessionLooper;
  public k6StressRunner: K6StressRunner;

  constructor() {
    const storage = new BrowserStorageEngine();
    this.projectRepo = new ProjectRepository(storage);
    this.sessionRepo = new SessionRepository(storage);
    this.runRepo = new RunRepository(storage);

    this.webRecorder = new WebRecorder();
    this.androidRecorder = new AndroidRecorder();

    this.interactivePlayer = new InteractivePlayer();
    this.apiRunner = new ApiFunctionalRunner();
    this.processRunner = new ProcessRunner();
    this.sessionLooper = new SessionLooper(this.interactivePlayer);
    this.k6StressRunner = new K6StressRunner();
  }

  public getCapabilities(): CapabilityManifest[] {
    return GeneratorFactory.getSupportedCombinations().map((combination) =>
      GeneratorFactory.getGenerator(combination.framework, combination.language).manifest,
    );
  }

  public async listAndroidDevices(): Promise<AndroidDeviceInfo[]> {
    // A browser migration shell has no ADB bridge. An empty result is a truthful
    // preflight state; the native host supplies discovery and device health.
    return [];
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

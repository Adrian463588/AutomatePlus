import { GeneratorFactory } from '@automate-plus/generators';
import { MemoryStorageEngine, ProjectRepository, RunRepository, SessionRecord, SessionRepository } from '@automate-plus/persistence/browser';
import { WebRecorder } from '@automate-plus/recorder-web';
import { AndroidRecorder } from '@automate-plus/recorder-android/browser';
import { ApiFunctionalRunner, InteractivePlayer, ProcessRunner } from '@automate-plus/runner-core/browser';
import type { ProcessCommand } from '@automate-plus/runner-core/browser';
import { K6StressMetrics, K6StressRunner, LoopingSummary, SessionLooper } from '@automate-plus/stress-engine/browser';
import { GeneratedProject, RunLogCallback, RunSummary } from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';

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
    const memoryStorage = new MemoryStorageEngine();
    this.projectRepo = new ProjectRepository(memoryStorage);
    this.sessionRepo = new SessionRepository(memoryStorage);
    this.runRepo = new RunRepository(memoryStorage);

    this.webRecorder = new WebRecorder();
    this.androidRecorder = new AndroidRecorder();

    this.interactivePlayer = new InteractivePlayer();
    this.apiRunner = new ApiFunctionalRunner();
    this.processRunner = new ProcessRunner();
    this.sessionLooper = new SessionLooper(this.interactivePlayer);
    this.k6StressRunner = new K6StressRunner();

    this.seedInitialData();
  }

  private async seedInitialData(): Promise<void> {
    const existing = await this.projectRepo.getAll();
    if (existing.length > 0) return;

    const defaultProj = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Default Workspace Project',
      description: 'Pre-configured low-code multiplatform testing workspace',
      workspacePath: './workspace',
      defaultFramework: 'playwright',
      defaultLanguage: 'typescript',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.projectRepo.save(defaultProj);

    const defaultWebSession: SessionRecord = {
      id: '00000000-0000-4000-8000-000000000002',
      projectId: defaultProj.id,
      name: 'Web E-Commerce Login Flow',
      platform: 'web',
      ir: {
      id: '00000000-0000-4000-8000-000000000002',
        schemaVersion: 1,
        projectId: defaultProj.id,
        name: 'Web E-Commerce Login Flow',
        platform: 'web',
        targetConfig: {
          startUrl: 'http://127.0.0.1:4173/login',
          viewport: { width: 1440, height: 900 },
        },
        environmentVariables: {
          USER_EMAIL: 'qa@example.test',
          E2E_PASSWORD: { kind: 'secret', key: 'E2E_PASSWORD' },
          BASE_URL: 'http://127.0.0.1:4173',
        },
        steps: [
          {
            id: '00000000-0000-4000-8000-000000000011',
            schemaVersion: 1,
            stepNumber: 1,
            platform: 'web',
            action: 'navigate',
            value: 'http://127.0.0.1:4173/login',
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: '00000000-0000-4000-8000-000000000012',
            schemaVersion: 1,
            stepNumber: 2,
            platform: 'web',
            action: 'fill',
            locators: [{ strategy: 'testId', value: 'input-email', score: 100 }],
            value: 'qa@example.test',
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: '00000000-0000-4000-8000-000000000013',
            schemaVersion: 1,
            stepNumber: 3,
            platform: 'web',
            action: 'fill',
            locators: [{ strategy: 'testId', value: 'input-password', score: 100 }],
            value: { kind: 'secret', key: 'E2E_PASSWORD' },
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: '00000000-0000-4000-8000-000000000014',
            schemaVersion: 1,
            stepNumber: 4,
            platform: 'web',
            action: 'click',
            locators: [{ strategy: 'role', role: 'button', name: 'Log In', value: 'Log In', score: 95 }],
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: '00000000-0000-4000-8000-000000000015',
            schemaVersion: 1,
            stepNumber: 5,
            platform: 'web',
            action: 'assertVisible',
            locators: [{ strategy: 'testId', value: 'dashboard-header', score: 100 }],
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.sessionRepo.save(defaultWebSession);

    const defaultAndroidSession: SessionRecord = {
      id: '00000000-0000-4000-8000-000000000003',
      projectId: defaultProj.id,
      name: 'Android Native Checkout Flow',
      platform: 'android',
      ir: {
        id: '00000000-0000-4000-8000-000000000003',
        schemaVersion: 1,
        projectId: defaultProj.id,
        name: 'Android Native Checkout Flow',
        platform: 'android',
        targetConfig: {
          appPackage: 'com.automateplus.shop',
          appActivity: '.MainActivity',
        },
        environmentVariables: {},
        steps: [
          {
            id: '00000000-0000-4000-8000-000000000021',
            schemaVersion: 1,
            stepNumber: 1,
            platform: 'android',
            action: 'launchApp',
            value: 'com.automateplus.shop',
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: '00000000-0000-4000-8000-000000000022',
            schemaVersion: 1,
            stepNumber: 2,
            platform: 'android',
            action: 'tap',
            locators: [{ strategy: 'resourceId', value: 'com.automateplus.shop:id/btn_cart', score: 100 }],
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: '00000000-0000-4000-8000-000000000023',
            schemaVersion: 1,
            stepNumber: 3,
            platform: 'android',
            action: 'tap',
            locators: [{ strategy: 'resourceId', value: 'com.automateplus.shop:id/btn_checkout', score: 100 }],
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.sessionRepo.save(defaultAndroidSession);

    const defaultApiSession: SessionRecord = {
      id: '00000000-0000-4000-8000-000000000004',
      projectId: defaultProj.id,
      name: 'Auth & Profile API Benchmark',
      platform: 'api',
      ir: {
        id: '00000000-0000-4000-8000-000000000004',
        schemaVersion: 1,
        projectId: defaultProj.id,
        name: 'Auth & Profile API Benchmark',
        platform: 'api',
        targetConfig: {
          baseUrl: 'http://127.0.0.1:4173',
        },
        environmentVariables: {},
        steps: [
          {
            id: '00000000-0000-4000-8000-000000000031',
            schemaVersion: 1,
            stepNumber: 1,
            platform: 'api',
            action: 'httpRequest',
            apiPayload: {
              method: 'POST',
              url: 'http://127.0.0.1:4173/api/login',
              headers: { 'Content-Type': 'application/json' },
              queryParams: {},
              bodyType: 'json',
              bodyContent: JSON.stringify({ email: 'qa@example.test', password: '{{API_PASSWORD}}' }),
              extractedVariables: [{ variableName: 'AUTH_TOKEN', jsonPath: '$.token' }],
            },
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.sessionRepo.save(defaultApiSession);
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
    onLog: RunLogCallback,
    onMetric?: (metric: { rps: number; latencyMs: number; errorRate: number }) => void
  ): Promise<K6StressMetrics> {
    return this.k6StressRunner.runStressTest(session, { targetRps, durationSeconds }, onLog, onMetric);
  }
}

export const bridge = new DesktopBridgeService();

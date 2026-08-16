import { GeneratorFactory } from '@automate-plus/generators';
import { MemoryStorageEngine, ProjectRepository, RunRepository, SessionRecord, SessionRepository } from '@automate-plus/persistence';
import { WebRecorder } from '@automate-plus/recorder-web';
import { AndroidRecorder } from '@automate-plus/recorder-android';
import { InteractivePlayer, ProcessRunner } from '@automate-plus/runner-core';
import { K6StressMetrics, K6StressRunner, LoopingSummary, SessionLooper } from '@automate-plus/stress-engine';
import { GeneratedProject, RunLogCallback, RunSummary } from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';

export class DesktopBridgeService {
  public projectRepo: ProjectRepository;
  public sessionRepo: SessionRepository;
  public runRepo: RunRepository;

  public webRecorder: WebRecorder;
  public androidRecorder: AndroidRecorder;

  public interactivePlayer: InteractivePlayer;
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
    this.processRunner = new ProcessRunner();
    this.sessionLooper = new SessionLooper(this.interactivePlayer);
    this.k6StressRunner = new K6StressRunner();

    this.seedInitialData();
  }

  private async seedInitialData(): Promise<void> {
    const existing = await this.projectRepo.getAll();
    if (existing.length > 0) return;

    const defaultProj = {
      id: 'proj-offline-default',
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
      id: 'session-web-1',
      projectId: defaultProj.id,
      name: 'Web E-Commerce Login Flow',
      platform: 'web',
      ir: {
        id: 'session-web-1',
        schemaVersion: 1,
        projectId: defaultProj.id,
        name: 'Web E-Commerce Login Flow',
        platform: 'web',
        targetConfig: {
          startUrl: 'https://demo.automateplus.io/login',
          viewport: { width: 1440, height: 900 },
        },
        environmentVariables: {
          USER_EMAIL: 'qa.lead@automateplus.io',
          BASE_URL: 'https://demo.automateplus.io',
        },
        steps: [
          {
            id: 'step-w-1',
            schemaVersion: 1,
            stepNumber: 1,
            platform: 'web',
            action: 'navigate',
            value: 'https://demo.automateplus.io/login',
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: 'step-w-2',
            schemaVersion: 1,
            stepNumber: 2,
            platform: 'web',
            action: 'fill',
            locators: [{ strategy: 'testId', value: 'input-email', score: 100 }],
            value: 'qa.lead@automateplus.io',
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: 'step-w-3',
            schemaVersion: 1,
            stepNumber: 3,
            platform: 'web',
            action: 'fill',
            locators: [{ strategy: 'testId', value: 'input-password', score: 100 }],
            value: 'SecurePass123!',
            timeoutMs: 5000,
            timestamp: Date.now(),
            optional: false,
          },
          {
            id: 'step-w-4',
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
            id: 'step-w-5',
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
      id: 'session-android-1',
      projectId: defaultProj.id,
      name: 'Android Native Checkout Flow',
      platform: 'android',
      ir: {
        id: 'session-android-1',
        schemaVersion: 1,
        projectId: defaultProj.id,
        name: 'Android Native Checkout Flow',
        platform: 'android',
        targetConfig: {
          appPackage: 'com.automateplus.shop',
          appActivity: '.MainActivity',
          deviceId: 'emulator-5554',
        },
        environmentVariables: {},
        steps: [
          {
            id: 'step-a-1',
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
            id: 'step-a-2',
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
            id: 'step-a-3',
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
      id: 'session-api-1',
      projectId: defaultProj.id,
      name: 'Auth & Profile API Benchmark',
      platform: 'api',
      ir: {
        id: 'session-api-1',
        schemaVersion: 1,
        projectId: defaultProj.id,
        name: 'Auth & Profile API Benchmark',
        platform: 'api',
        targetConfig: {
          baseUrl: 'https://api.automateplus.io',
        },
        environmentVariables: {},
        steps: [
          {
            id: 'step-api-1',
            schemaVersion: 1,
            stepNumber: 1,
            platform: 'api',
            action: 'httpRequest',
            apiPayload: {
              method: 'POST',
              url: 'https://api.automateplus.io/v1/auth/login',
              headers: { 'Content-Type': 'application/json' },
              queryParams: {},
              bodyType: 'json',
              bodyContent: JSON.stringify({ email: 'qa@automateplus.io', password: 'secretpassword' }),
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
    const summary = await this.interactivePlayer.run(session, { executionMode: 'interactive' }, onLog);
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
    const summary = await this.processRunner.run(session, { executionMode: 'native' }, onLog);
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

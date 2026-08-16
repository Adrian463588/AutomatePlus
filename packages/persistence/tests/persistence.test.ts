import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageEngine } from '../src/storage-engine.js';
import { ProjectRepository } from '../src/repositories/project.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';
import { RunRepository } from '../src/repositories/run.repository.js';

describe('Persistence Layer Repositories', () => {
  let storage: MemoryStorageEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let runRepo: RunRepository;

  beforeEach(() => {
    storage = new MemoryStorageEngine();
    projectRepo = new ProjectRepository(storage);
    sessionRepo = new SessionRepository(storage);
    runRepo = new RunRepository(storage);
  });

  it('should save, retrieve and delete projects', async () => {
    const project = {
      id: 'p-1',
      name: 'E-Commerce Testing',
      workspacePath: '/workspace/ecom',
      defaultFramework: 'playwright',
      defaultLanguage: 'typescript',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await projectRepo.save(project);
    const retrieved = await projectRepo.getById('p-1');
    expect(retrieved?.name).toBe('E-Commerce Testing');

    const all = await projectRepo.getAll();
    expect(all.length).toBe(1);

    const deleted = await projectRepo.delete('p-1');
    expect(deleted).toBe(true);
    const afterDelete = await projectRepo.getById('p-1');
    expect(afterDelete).toBeUndefined();
  });

  it('should save and retrieve sessions by project ID', async () => {
    const session = {
      id: 's-1',
      projectId: 'p-1',
      name: 'Checkout Flow',
      platform: 'web' as const,
      ir: {
        id: 's-1',
        projectId: 'p-1',
        name: 'Checkout Flow',
        platform: 'web' as const,
        targetConfig: { startUrl: 'https://store.test' },
        environmentVariables: {},
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await sessionRepo.save(session);
    const byProject = await sessionRepo.getByProjectId('p-1');
    expect(byProject.length).toBe(1);
    expect(byProject[0].name).toBe('Checkout Flow');
  });

  it('should track test runs and metrics', async () => {
    const run = {
      id: 'run-1',
      sessionId: 's-1',
      framework: 'playwright',
      language: 'typescript',
      executionMode: 'native' as const,
      status: 'passed' as const,
      iterationsTarget: 1,
      iterationsCompleted: 1,
      durationMs: 1420,
      startedAt: Date.now() - 1420,
      finishedAt: Date.now(),
    };

    await runRepo.saveRun(run);
    const retrieved = await runRepo.getRunById('run-1');
    expect(retrieved?.status).toBe('passed');

    await runRepo.addMetric({
      id: 'm-1',
      runId: 'run-1',
      timestamp: Date.now(),
      metricType: 'p95_latency',
      value: 120.5,
    });

    const metrics = await runRepo.getMetricsByRunId('run-1');
    expect(metrics.length).toBe(1);
    expect(metrics[0].value).toBe(120.5);
  });
});

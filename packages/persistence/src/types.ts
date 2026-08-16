import { SessionIR } from '@automate-plus/ir-schema';

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  workspacePath: string;
  defaultFramework: string;
  defaultLanguage: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  name: string;
  platform: 'web' | 'android' | 'api';
  ir: SessionIR;
  createdAt: number;
  updatedAt: number;
}

export interface TestRunRecord {
  id: string;
  sessionId: string;
  framework: string;
  language: string;
  executionMode: 'interactive' | 'native' | 'loop' | 'k6_stress';
  status: 'queued' | 'running' | 'passed' | 'failed' | 'stopped';
  iterationsTarget: number;
  iterationsCompleted: number;
  targetRps?: number;
  durationMs?: number;
  startedAt: number;
  finishedAt?: number;
  errorSummary?: string;
}

export interface RunMetricRecord {
  id: string;
  runId: string;
  timestamp: number;
  metricType: 'rps' | 'p50_latency' | 'p95_latency' | 'error_rate' | 'cpu_usage' | 'memory_usage';
  value: number;
}

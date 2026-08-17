export interface AndroidDeviceInfo {
  id: string;
  model: string;
  product: string;
  androidVersion: string;
  sdkVersion: number;
  isEmulator: boolean;
  status: 'device' | 'offline' | 'unauthorized';
}

export interface TouchPoint {
  x: number;
  y: number;
}

export interface DeviceGroup {
  id: string;
  name: string;
  description?: string;
  deviceIds: string[];
  primaryDeviceId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceIterationResult {
  iterationNumber: number;
  status: 'passed' | 'failed' | 'blocked' | 'cancelled';
  durationMs: number;
  startedAt: number;
  finishedAt: number;
  error?: string;
}

export interface DeviceRunResult {
  deviceRunId: string;
  deviceId: string;
  adbSerial: string;
  model: string;
  status: 'passed' | 'failed' | 'blocked' | 'cancelled';
  plannedIterations: number;
  completedIterations: number;
  passedIterations: number;
  failedIterations: number;
  durationMs: number;
  iterations: DeviceIterationResult[];
  error?: string;
}

export interface MultiDeviceRunSummary {
  farmRunId: string;
  sessionId: string;
  strategy: 'single' | 'all-devices' | 'split-iterations';
  failurePolicy: 'continue-other-devices' | 'fail-fast';
  status: 'passed' | 'failed' | 'blocked' | 'cancelled' | 'running';
  totalPlannedIterations: number;
  totalCompletedIterations: number;
  totalPassedIterations: number;
  totalFailedIterations: number;
  durationMs: number;
  deviceRuns: DeviceRunResult[];
  startedAt: number;
  finishedAt: number;
  errorSummary?: string;
}

export interface IDeviceBridge {
  listDevices(): Promise<AndroidDeviceInfo[]>;
  startScreenMirror(deviceId: string, onFrame: (nalUnit: Uint8Array) => void): Promise<void>;
  stopScreenMirror(deviceId: string): Promise<void>;
  sendTap(deviceId: string, point: TouchPoint): Promise<void>;
  sendSwipe(deviceId: string, start: TouchPoint, end: TouchPoint, durationMs?: number): Promise<void>;
  dumpUiHierarchy(deviceId: string): Promise<string>;
}

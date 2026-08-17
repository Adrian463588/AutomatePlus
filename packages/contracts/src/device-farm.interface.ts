import { LocatorCandidate } from '@automate-plus/ir-schema';

export const DEVICE_FARM_CONTRACT_VERSION = 1 as const;
export type DeviceFarmContractVersion = typeof DEVICE_FARM_CONTRACT_VERSION;

export type DeviceExecutionStrategy = 'single' | 'all-devices' | 'split-iterations';
export type FarmFailurePolicy = 'continue-other-devices' | 'fail-fast';
export type FarmRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'blocked' | 'cancelled';
export type FarmRunCompletion = 'complete' | 'partial';
export type DeviceTransport = 'usb' | 'tcpip' | 'emulator' | 'unknown';
export type DeviceHealthState =
  | 'unknown'
  | 'ready'
  | 'blocked'
  | 'offline'
  | 'unauthorized'
  | 'disconnected'
  | 'failed'
  | 'quarantined';
export type DeviceLeaseState =
  | 'reserved'
  | 'preparing'
  | 'running'
  | 'cleaning'
  | 'released'
  | 'disconnected'
  | 'failed'
  | 'quarantined';
export type PortLeaseState = 'active' | 'released';
export type FarmPortKind = 'appium' | 'system' | 'mjpeg' | 'chromedriver' | 'forwarding';
export type DeviceObservationStatus =
  | 'MATCHED'
  | 'FALLBACK_USED'
  | 'SEMANTIC_SELECTOR_MISSING'
  | 'DEVICE_VARIANT_MISMATCH'
  | 'NEEDS_REVIEW'
  | 'BLOCKED'
  | 'FAILED';
export type StepEvidenceStatus = 'passed' | 'failed' | 'blocked' | 'cancelled' | 'skipped';
export type RecordingMode = 'primary-followers';
export type ParallelSessionModel = 'none' | 'single-session' | 'multi-session';

export type RuntimeContextKey =
  | 'appiumUrl'
  | 'udid'
  | 'systemPort'
  | 'mjpegServerPort'
  | 'chromedriverPort';
export type RuntimeContextValueType = 'url' | 'string' | 'port';

export interface RuntimeContextVariable {
  key: RuntimeContextKey;
  name: string;
  valueType: RuntimeContextValueType;
  required: boolean;
}

export interface RuntimeContextSpec {
  schemaVersion: DeviceFarmContractVersion;
  source: 'environment';
  variables: readonly RuntimeContextVariable[];
}

export const APPIUM_RUNTIME_CONTEXT: RuntimeContextSpec = {
  schemaVersion: DEVICE_FARM_CONTRACT_VERSION,
  source: 'environment',
  variables: [
    { key: 'appiumUrl', name: 'AUTOMATEPLUS_APPIUM_URL', valueType: 'url', required: true },
    { key: 'udid', name: 'AUTOMATEPLUS_DEVICE_UDID', valueType: 'string', required: true },
    { key: 'systemPort', name: 'AUTOMATEPLUS_SYSTEM_PORT', valueType: 'port', required: true },
    { key: 'mjpegServerPort', name: 'AUTOMATEPLUS_MJPEG_SERVER_PORT', valueType: 'port', required: true },
    { key: 'chromedriverPort', name: 'AUTOMATEPLUS_CHROMEDRIVER_PORT', valueType: 'port', required: false },
  ],
};

export interface DeviceProfile {
  schemaVersion: DeviceFarmContractVersion;
  deviceId: string;
  adbSerial: string;
  model: string;
  manufacturer: string;
  product: string;
  androidVersion: string;
  sdkVersion: number;
  isEmulator: boolean;
  resolution: { width: number; height: number };
  density: number;
  orientation: 'portrait' | 'landscape' | 'unknown';
  transport: DeviceTransport;
  status: 'device' | 'offline' | 'unauthorized';
  healthState: DeviceHealthState;
  lastSeenAt: number;
}

export interface FarmRunSpec {
  schemaVersion: DeviceFarmContractVersion;
  sessionId: string;
  strategy: DeviceExecutionStrategy;
  deviceGroupId?: string;
  deviceIds?: readonly string[];
  iterationsPerDevice?: number;
  totalIterations?: number;
  maxParallelDevices: number;
  iterationDelayMs: number;
  failurePolicy: FarmFailurePolicy;
}

export interface DeviceLease {
  schemaVersion: DeviceFarmContractVersion;
  leaseId: string;
  runId: string;
  deviceId: string;
  adbSerialSnapshot: string;
  ownerId: string;
  state: DeviceLeaseState;
  acquiredAt: number;
  releasedAt?: number;
}

export interface PortAllocation {
  kind: FarmPortKind;
  port: number;
}

export interface PortLease {
  schemaVersion: DeviceFarmContractVersion;
  leaseId: string;
  runId: string;
  deviceId: string;
  allocations: readonly PortAllocation[];
  state: PortLeaseState;
  acquiredAt: number;
  releasedAt?: number;
}

export interface DeviceRunContext {
  schemaVersion: DeviceFarmContractVersion;
  runId: string;
  deviceRunId: string;
  deviceId: string;
  adbSerialSnapshot: string;
  appiumUrl: string;
  udid: string;
  systemPort: number;
  mjpegServerPort: number;
  chromedriverPort?: number;
}

export interface ArtifactReference {
  artifactId: string;
  kind: string;
  relativePath: string;
  sha256?: string;
}

export interface StepEvidence {
  schemaVersion: DeviceFarmContractVersion;
  farmRunId: string;
  deviceRunId: string;
  iterationId: string;
  actionId: string;
  deviceId: string;
  adbSerialSnapshot: string;
  status: StepEvidenceStatus;
  resolvedLocator?: LocatorCandidate;
  matchCount?: number;
  fallbackUsed: boolean;
  hierarchyHash?: string;
  artifacts: readonly ArtifactReference[];
  durationMs: number;
  timestamp: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface DeviceIteration {
  schemaVersion: DeviceFarmContractVersion;
  iterationId: string;
  deviceRunId: string;
  iterationNumber: number;
  status: FarmRunStatus | 'skipped';
  steps: readonly StepEvidence[];
  startedAt?: number;
  completedAt?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface DeviceRun {
  schemaVersion: DeviceFarmContractVersion;
  deviceRunId: string;
  farmRunId: string;
  deviceId: string;
  adbSerialSnapshot: string;
  status: FarmRunStatus;
  plannedIterations: number;
  iterations: readonly DeviceIteration[];
  startedAt?: number;
  completedAt?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface DeviceObservation {
  schemaVersion: DeviceFarmContractVersion;
  recordingId: string;
  actionId: string;
  deviceId: string;
  adbSerialSnapshot: string;
  status: DeviceObservationStatus;
  resolvedLocator?: LocatorCandidate;
  matchCount?: number;
  fallbackUsed: boolean;
  hierarchyHash?: string;
  screenshotArtifact?: ArtifactReference;
  timestamp: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface RecordingPlan {
  schemaVersion: DeviceFarmContractVersion;
  recordingId: string;
  sessionId: string;
  mode: RecordingMode;
  primaryDeviceId: string;
  followerDeviceIds: readonly string[];
}

export interface FarmRunReport {
  schemaVersion: DeviceFarmContractVersion;
  runId: string;
  sessionId: string;
  strategy: DeviceExecutionStrategy;
  status: FarmRunStatus;
  completion: FarmRunCompletion;
  plannedIterations: number;
  startedIterations: number;
  passedIterations: number;
  failedIterations: number;
  blockedIterations: number;
  deviceRuns: readonly DeviceRun[];
  startedAt: number;
  completedAt?: number;
}

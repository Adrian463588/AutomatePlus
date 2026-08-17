import type { SessionIR } from '@automate-plus/ir-schema';
import type { DeviceGroup } from './device.interface.js';
import type {
  DeviceProfile,
  FarmRunReport,
  FarmRunSpec,
  RecordingPlan,
} from './device-farm.interface.js';
import type { RunSummary } from './runner.interface.js';

export type NativeHostState = 'ready' | 'blocked' | 'stopped';

export interface NativeCapabilitySet {
  deviceDiscovery: boolean;
  androidRecording: boolean;
  farmReplay: boolean;
  nativeExecution: boolean;
}

export interface NativeHealth {
  protocolVersion: string;
  host: 'tauri-rust';
  state: NativeHostState;
  reason?: string;
  missingPrerequisites: readonly string[];
  capabilities: NativeCapabilitySet;
}

export interface NativeDevicesResponse {
  devices: readonly DeviceProfile[];
}

export interface NativeDeviceGroupsResponse {
  groups: readonly DeviceGroup[];
}

export interface NativeRecordingStartRequest {
  session: SessionIR;
  plan: RecordingPlan;
}

export interface NativeRecordingStopRequest {
  recordingId: string;
}

export interface NativeFarmRunRequest {
  session: SessionIR;
  spec: FarmRunSpec;
}

export interface NativeFarmCancelRequest {
  runId: string;
  reason?: string;
}

export interface NativeArtifactsRequest {
  runId?: string;
}

export interface NativeProtocolMethodMap {
  'native.health': { expectedProtocolVersion?: string };
  'native.capabilities': Record<string, never>;
  'devices.discover': Record<string, never>;
  'device-groups.list': Record<string, never>;
  'device-groups.create': { group: DeviceGroup };
  'device-groups.delete': { groupId: string };
  'ports.validate': { ports: readonly number[] };
  'ports.allocate': { runId: string; deviceId: string; count: number };
  'ports.release': { leaseId: string };
  'process.start': { executable: string; args?: readonly string[] };
  'process.stop': { processId: number };
  'recording.start': NativeRecordingStartRequest;
  'recording.stop': NativeRecordingStopRequest;
  'farm.run.start': NativeFarmRunRequest;
  'farm.run.cancel': NativeFarmCancelRequest;
  'artifacts.list': NativeArtifactsRequest;
  'native.run': { session: SessionIR; framework: string; language: string };
}

export interface NativeProtocolResponseMap {
  'native.health': NativeHealth;
  'native.capabilities': NativeCapabilitySet;
  'devices.discover': NativeDevicesResponse;
  'device-groups.list': NativeDeviceGroupsResponse;
  'device-groups.create': DeviceGroup;
  'device-groups.delete': { deleted: boolean };
  'ports.validate': { valid: boolean };
  'ports.allocate': { leaseId: string; ports: readonly number[] };
  'ports.release': { released: boolean };
  'process.start': { processId: number };
  'process.stop': { stopped: boolean };
  'recording.start': { recordingId: string; state: NativeHostState };
  'recording.stop': { recordingId: string; state: NativeHostState };
  'farm.run.start': FarmRunReport;
  'farm.run.cancel': { runId: string; cancelled: boolean };
  'artifacts.list': readonly unknown[];
  'native.run': RunSummary;
}

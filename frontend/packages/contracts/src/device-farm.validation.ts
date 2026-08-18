import { DEVICE_FARM_CONTRACT_VERSION, FarmRunSpec } from './device-farm.interface.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function validateFarmRunSpec(specification: FarmRunSpec): string[] {
  const errors: string[] = [];
  if (specification.schemaVersion !== DEVICE_FARM_CONTRACT_VERSION) errors.push('schemaVersion is unsupported');
  if (!UUID_PATTERN.test(specification.sessionId)) errors.push('sessionId must be a UUID');
  if (specification.deviceGroupId === undefined && (!specification.deviceIds || specification.deviceIds.length === 0)) {
    errors.push('deviceGroupId or deviceIds is required');
  }
  if (specification.deviceGroupId !== undefined && specification.deviceIds && specification.deviceIds.length > 0) {
    errors.push('deviceGroupId and deviceIds are mutually exclusive');
  }
  if (specification.deviceIds?.some((deviceId) => !UUID_PATTERN.test(deviceId))) errors.push('deviceIds must contain UUIDs');
  if (specification.deviceIds && new Set(specification.deviceIds).size !== specification.deviceIds.length) {
    errors.push('deviceIds must be unique');
  }
  if (!Number.isInteger(specification.maxParallelDevices) || specification.maxParallelDevices < 1) {
    errors.push('maxParallelDevices must be a positive integer');
  }
  if (!Number.isInteger(specification.iterationDelayMs) || specification.iterationDelayMs < 0) {
    errors.push('iterationDelayMs must be a non-negative integer');
  }
  if (specification.strategy === 'split-iterations') {
    if (!Number.isInteger(specification.totalIterations) || (specification.totalIterations ?? 0) < 1) {
      errors.push('totalIterations must be a positive integer for split-iterations');
    }
    if (specification.iterationsPerDevice !== undefined) errors.push('iterationsPerDevice is invalid for split-iterations');
  } else {
    if (!Number.isInteger(specification.iterationsPerDevice) || (specification.iterationsPerDevice ?? 0) < 1) {
      errors.push('iterationsPerDevice must be a positive integer');
    }
    if (specification.totalIterations !== undefined) errors.push('totalIterations is invalid for this strategy');
  }
  if (specification.strategy === 'single' && (specification.deviceIds?.length ?? 0) > 1) {
    errors.push('single strategy accepts exactly one device');
  }
  return errors;
}

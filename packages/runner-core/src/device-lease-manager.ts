import { DeviceLease, DeviceLeaseState, PortAllocation } from '@automate-plus/contracts';
import crypto from 'node:crypto';

export class DeviceLeaseManager {
  private leases: Map<string, DeviceLease> = new Map(); // leaseId -> Lease
  private deviceToLease: Map<string, string> = new Map(); // deviceId -> leaseId
  private serialToLease: Map<string, string> = new Map(); // serial -> leaseId

  public async acquire(
    farmRunId: string,
    deviceId: string,
    adbSerialSnapshot: string,
    ownerId: string,
    _ports?: PortAllocation[]
  ): Promise<DeviceLease> {
    if (this.isLocked(deviceId) || this.isSerialLocked(adbSerialSnapshot)) {
      throw new Error(`DeviceLockError: Device '${deviceId}' (${adbSerialSnapshot}) is currently locked by another active run.`);
    }

    const leaseId = crypto.randomUUID();
    const lease: DeviceLease = {
      schemaVersion: 1,
      leaseId,
      runId: farmRunId,
      deviceId,
      adbSerialSnapshot,
      ownerId,
      state: 'reserved',
      acquiredAt: Date.now(),
    };

    this.leases.set(leaseId, lease);
    this.deviceToLease.set(deviceId, leaseId);
    this.serialToLease.set(adbSerialSnapshot, leaseId);

    return lease;
  }

  public updateState(leaseId: string, state: DeviceLeaseState): void {
    const lease = this.leases.get(leaseId);
    if (lease) {
      lease.state = state;
      if (state === 'released' || state === 'failed' || state === 'disconnected') {
        lease.releasedAt = Date.now();
      }
    }
  }

  public async release(leaseId: string): Promise<boolean> {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;

    lease.state = 'released';
    lease.releasedAt = Date.now();

    this.deviceToLease.delete(lease.deviceId);
    this.serialToLease.delete(lease.adbSerialSnapshot);
    this.leases.delete(leaseId);

    return true;
  }

  public getLease(leaseId: string): DeviceLease | undefined {
    return this.leases.get(leaseId);
  }

  public getLeaseByDeviceId(deviceId: string): DeviceLease | undefined {
    const leaseId = this.deviceToLease.get(deviceId);
    return leaseId ? this.leases.get(leaseId) : undefined;
  }

  public isLocked(deviceId: string): boolean {
    return this.deviceToLease.has(deviceId);
  }

  public isSerialLocked(serial: string): boolean {
    return this.serialToLease.has(serial);
  }

  public getActiveLeases(): DeviceLease[] {
    return Array.from(this.leases.values());
  }

  public reset(): void {
    this.leases.clear();
    this.deviceToLease.clear();
    this.serialToLease.clear();
  }
}

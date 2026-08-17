import { PortAllocation, PortLease } from '@automate-plus/contracts';
import crypto from 'node:crypto';

export interface DevicePorts {
  appiumPort: number;
  systemPort: number;
  chromedriverPort?: number;
  mjpegServerPort?: number;
}

export class PortLeaseManager {
  private baseAppiumPort = 4723;
  private baseSystemPort = 8200;
  private baseChromedriverPort = 9500;
  private baseMjpegPort = 9100;

  private allocatedPorts: Set<number> = new Set();
  private deviceAllocations: Map<string, DevicePorts> = new Map(); // deviceId -> DevicePorts
  private activeLeases: Map<string, PortLease> = new Map();

  public allocate(deviceId: string, runId?: string): DevicePorts {
    if (this.deviceAllocations.has(deviceId)) {
      return this.deviceAllocations.get(deviceId)!;
    }

    let appiumPort = this.findFreePort(this.baseAppiumPort, 100);
    let systemPort = this.findFreePort(this.baseSystemPort, 100);
    let chromedriverPort = this.findFreePort(this.baseChromedriverPort, 100);
    let mjpegServerPort = this.findFreePort(this.baseMjpegPort, 100);

    const ports: DevicePorts = {
      appiumPort,
      systemPort,
      chromedriverPort,
      mjpegServerPort,
    };

    this.allocatedPorts.add(appiumPort);
    this.allocatedPorts.add(systemPort);
    this.allocatedPorts.add(chromedriverPort);
    this.allocatedPorts.add(mjpegServerPort);

    this.deviceAllocations.set(deviceId, ports);

    const allocations: PortAllocation[] = [
      { kind: 'appium', port: appiumPort },
      { kind: 'system', port: systemPort },
      { kind: 'chromedriver', port: chromedriverPort },
      { kind: 'mjpeg', port: mjpegServerPort },
    ];

    const lease: PortLease = {
      schemaVersion: 1,
      leaseId: crypto.randomUUID(),
      runId: runId || crypto.randomUUID(),
      deviceId,
      allocations,
      state: 'active',
      acquiredAt: Date.now(),
    };
    this.activeLeases.set(deviceId, lease);

    return ports;
  }

  public release(deviceId: string): void {
    const alloc = this.deviceAllocations.get(deviceId);
    if (alloc) {
      this.allocatedPorts.delete(alloc.appiumPort);
      this.allocatedPorts.delete(alloc.systemPort);
      if (alloc.chromedriverPort) this.allocatedPorts.delete(alloc.chromedriverPort);
      if (alloc.mjpegServerPort) this.allocatedPorts.delete(alloc.mjpegServerPort);
      this.deviceAllocations.delete(deviceId);
    }
    const lease = this.activeLeases.get(deviceId);
    if (lease) {
      (lease as any).state = 'released';
      (lease as any).releasedAt = Date.now();
      this.activeLeases.delete(deviceId);
    }
  }

  public getAllocation(deviceId: string): DevicePorts | undefined {
    return this.deviceAllocations.get(deviceId);
  }

  public getLease(deviceId: string): PortLease | undefined {
    return this.activeLeases.get(deviceId);
  }

  public reset(): void {
    this.allocatedPorts.clear();
    this.deviceAllocations.clear();
    this.activeLeases.clear();
  }

  private findFreePort(base: number, range: number): number {
    for (let offset = 0; offset < range; offset++) {
      const port = base + offset;
      if (!this.allocatedPorts.has(port)) {
        return port;
      }
    }
    return base + Math.floor(Math.random() * 500);
  }
}

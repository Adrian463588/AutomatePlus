import { createRuntimeId, PortAllocation, PortLease } from '@automate-plus/contracts';

export interface DevicePorts {
  appiumPort: number;
  systemPort: number;
  chromedriverPort?: number;
  mjpegServerPort?: number;
}

export interface PortLeaseManagerOptions {
  appiumStart?: number;
  systemStart?: number;
  chromedriverStart?: number;
  mjpegStart?: number;
  rangeSize?: number;
}

export class PortLeaseManager {
  private readonly baseAppiumPort: number;
  private readonly baseSystemPort: number;
  private readonly baseChromedriverPort: number;
  private readonly baseMjpegPort: number;
  private readonly rangeSize: number;

  private allocatedPorts: Set<number> = new Set();
  private deviceAllocations: Map<string, DevicePorts> = new Map(); // deviceId -> DevicePorts
  private activeLeases: Map<string, PortLease> = new Map();

  public constructor(options: PortLeaseManagerOptions = {}) {
    this.baseAppiumPort = options.appiumStart ?? 49152;
    this.baseSystemPort = options.systemStart ?? 49252;
    this.baseChromedriverPort = options.chromedriverStart ?? 49352;
    this.baseMjpegPort = options.mjpegStart ?? 49452;
    this.rangeSize = options.rangeSize ?? 100;
  }

  public allocate(deviceId: string, runId?: string): DevicePorts {
    if (this.deviceAllocations.has(deviceId)) {
      return this.deviceAllocations.get(deviceId)!;
    }

    const appiumPort = this.findFreePort(this.baseAppiumPort, this.rangeSize);
    const systemPort = this.findFreePort(this.baseSystemPort, this.rangeSize);
    const chromedriverPort = this.findFreePort(this.baseChromedriverPort, this.rangeSize);
    const mjpegServerPort = this.findFreePort(this.baseMjpegPort, this.rangeSize);

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
      leaseId: createRuntimeId(),
      runId: runId || createRuntimeId(),
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
    throw new Error(`PortLeaseError: no available port in range ${base}-${base + range - 1}`);
  }
}

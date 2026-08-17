import {
  DeviceIterationResult,
  DeviceProfile,
  DeviceRunResult,
  FarmRunSpec,
  MultiDeviceRunSummary,
  RunLogCallback,
} from '@automate-plus/contracts';
import { SessionIR } from '@automate-plus/ir-schema';
import { DeviceLeaseManager } from './device-lease-manager.js';
import { PortLeaseManager } from './port-lease-manager.js';
import { InteractivePlayer, InteractiveStepExecutor } from './interactive-player.js';
import crypto from 'node:crypto';

export type FarmProgressCallback = (summary: MultiDeviceRunSummary) => void;

export class MultiDeviceRunner {
  private leaseManager: DeviceLeaseManager;
  private portManager: PortLeaseManager;
  private isCancelled = false;

  constructor(
    leaseManager?: DeviceLeaseManager,
    portManager?: PortLeaseManager,
    private readonly executorFactory?: (deviceId: string) => InteractiveStepExecutor
  ) {
    this.leaseManager = leaseManager ?? new DeviceLeaseManager();
    this.portManager = portManager ?? new PortLeaseManager();
  }

  public async runFarm(
    session: SessionIR,
    spec: FarmRunSpec,
    devices: DeviceProfile[],
    onLog: RunLogCallback,
    onProgress?: FarmProgressCallback
  ): Promise<MultiDeviceRunSummary> {
    this.isCancelled = false;
    const farmRunId = crypto.randomUUID();
    const startTime = Date.now();

    // 1. Filter target devices
    const targetDevices = devices.filter((d) => (spec.deviceIds || (spec as any).targetDeviceIds || []).includes(d.deviceId || (d as any).id));
    if (targetDevices.length === 0) {
      throw new Error(`DeviceFarmError: No target devices available for execution.`);
    }

    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `[FARM] Initializing Multi-Device Farm Run '${farmRunId}' with strategy '${spec.strategy}' across ${targetDevices.length} devices.`,
    });

    // 2. Determine iteration distribution
    let plannedPerDevice: Map<string, number> = new Map();
    if (spec.strategy === 'all-devices' || spec.strategy === 'single') {
      const iters = spec.iterationsPerDevice || (spec as any).iterations || 1;
      targetDevices.forEach((d) => plannedPerDevice.set(d.deviceId || (d as any).id, iters));
    } else if (spec.strategy === 'split-iterations') {
      const total = spec.totalIterations || (spec as any).iterations || targetDevices.length;
      const base = Math.floor(total / targetDevices.length);
      const remainder = total % targetDevices.length;
      targetDevices.forEach((d, idx) => {
        plannedPerDevice.set(d.deviceId || (d as any).id, base + (idx < remainder ? 1 : 0));
      });
    }

    const totalPlanned = Array.from(plannedPerDevice.values()).reduce((a, b) => a + b, 0);

    // Initialize summary
    const summary: MultiDeviceRunSummary = {
      farmRunId,
      sessionId: session.id,
      strategy: spec.strategy,
      failurePolicy: spec.failurePolicy,
      status: 'running',
      totalPlannedIterations: totalPlanned,
      totalCompletedIterations: 0,
      totalPassedIterations: 0,
      totalFailedIterations: 0,
      durationMs: 0,
      deviceRuns: [],
      startedAt: startTime,
      finishedAt: 0,
    };

    // 3. Acquire Leases and execute per-device workers
    const workerPromises = targetDevices.map(async (device) => {
      const deviceId = device.deviceId || (device as any).id;
      const plannedIterations = plannedPerDevice.get(deviceId) || 1;

      const deviceRunResult: DeviceRunResult = {
        deviceRunId: crypto.randomUUID(),
        deviceId,
        adbSerial: device.adbSerial,
        model: device.model,
        status: 'running' as any,
        plannedIterations,
        completedIterations: 0,
        passedIterations: 0,
        failedIterations: 0,
        durationMs: 0,
        iterations: [],
      };

      summary.deviceRuns.push(deviceRunResult);

      let lease;
      try {
        const ports = this.portManager.allocate(deviceId, farmRunId);
        lease = await this.leaseManager.acquire(farmRunId, deviceId, device.adbSerial, 'MultiDeviceRunner');
        this.leaseManager.updateState(lease.leaseId, 'running');

        onLog({
          timestamp: Date.now(),
          type: 'stdout',
          message: `[DEVICE ${device.model}] Leased ports Appium:${ports.appiumPort} System:${ports.systemPort}. Starting ${plannedIterations} iterations.`,
        });

        // Run iterations
        const executor = this.executorFactory ? this.executorFactory(deviceId) : { execute: async () => undefined };
        const player = new InteractivePlayer(executor);
        for (let i = 1; i <= plannedIterations; i++) {
          if (this.isCancelled) {
            deviceRunResult.status = 'cancelled';
            break;
          }

          const iterStart = Date.now();
          const runSummary = await player.run(session, { executionMode: 'functional' }, onLog);
          const iterDuration = Date.now() - iterStart;

          const iterResult: DeviceIterationResult = {
            iterationNumber: i,
            status: runSummary.status === 'passed' ? 'passed' : 'failed',
            durationMs: iterDuration,
            startedAt: iterStart,
            finishedAt: Date.now(),
            error: runSummary.error,
          };

          deviceRunResult.iterations.push(iterResult);
          deviceRunResult.completedIterations++;
          summary.totalCompletedIterations++;

          if (iterResult.status === 'passed') {
            deviceRunResult.passedIterations++;
            summary.totalPassedIterations++;
          } else {
            deviceRunResult.failedIterations++;
            summary.totalFailedIterations++;
            if (spec.failurePolicy === 'fail-fast') {
              this.isCancelled = true;
              deviceRunResult.status = 'failed';
              onLog({
                timestamp: Date.now(),
                type: 'stderr',
                message: `[FAIL-FAST] Device ${device.model} failed iteration ${i}. Aborting other devices.`,
              });
              break;
            }
          }

          if (onProgress) onProgress({ ...summary });

          if (spec.iterationDelayMs && i < plannedIterations) {
            await new Promise((resolve) => setTimeout(resolve, spec.iterationDelayMs));
          }
        }

        if (deviceRunResult.status !== 'cancelled') {
          deviceRunResult.status = deviceRunResult.failedIterations === 0 ? 'passed' : 'failed';
        }
      } catch (err: any) {
        deviceRunResult.status = 'failed';
        deviceRunResult.error = err.message;
        onLog({
          timestamp: Date.now(),
          type: 'stderr',
          message: `[DEVICE ${device.model}] Error: ${err.message}`,
        });
      } finally {
        if (lease) {
          await this.leaseManager.release(lease.leaseId);
        }
        this.portManager.release(deviceId);
      }
    });

    await Promise.all(workerPromises);

    summary.finishedAt = Date.now();
    summary.durationMs = summary.finishedAt - startTime;
    summary.status = summary.totalFailedIterations === 0 ? 'passed' : 'failed';

    onLog({
      timestamp: Date.now(),
      type: 'stdout',
      message: `[FARM] Run finished with status ${summary.status.toUpperCase()} (${summary.totalPassedIterations}/${summary.totalPlannedIterations} passed in ${summary.durationMs}ms)`,
    });

    if (onProgress) onProgress({ ...summary });
    return summary;
  }

  public cancel(): void {
    this.isCancelled = true;
  }
}

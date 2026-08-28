import {
  DeviceObservation,
  DeviceObservationStatus,
  RecordingPlan,
} from '@automate-plus/contracts';
import { ActionIR } from '@automate-plus/ir-schema';
import { AndroidRecorder } from './android-recorder.js';
import { AndroidBridgeError } from './android-errors.js';
import { AndroidFollowerLocatorObserver, isFollowerObservationBlocked } from './follower-observer.js';

export interface RecordingDeviceBinding {
  deviceId: string;
  adbSerialSnapshot: string;
}

export interface PrimaryFollowerRecordingBindings {
  primary: RecordingDeviceBinding;
  followers: readonly RecordingDeviceBinding[];
}

export interface PrimaryFollowerRecordingEvent {
  primaryAction: ActionIR;
  observations: readonly DeviceObservation[];
}

export type PrimaryFollowerRecordingEventHandler = (event: PrimaryFollowerRecordingEvent) => void;

const MAX_PENDING_FOLLOWER_OBSERVATIONS = 64;
const FOLLOWER_DRAIN_TIMEOUT_MS = 30_000;

/**
 * Coordinates one canonical primary recorder with independent follower
 * hierarchy observations. Follower input is never synthesized from primary
 * coordinates; every follower resolves the action against its own hierarchy.
 */
export class AndroidPrimaryFollowerRecorder {
  private active = false;
  private pendingObservations: Promise<void> = Promise.resolve();
  private pendingObservationCount = 0;
  private pendingObservationError: unknown;
  private observationGeneration = 0;
  private observationAbort = new AbortController();

  public constructor(
    private readonly primaryRecorder: AndroidRecorder,
    private readonly followerObserver: AndroidFollowerLocatorObserver,
  ) {}

  public async start(
    plan: RecordingPlan,
    bindings: PrimaryFollowerRecordingBindings,
    onEvent: PrimaryFollowerRecordingEventHandler,
  ): Promise<void> {
    this.validatePlan(plan, bindings);
    if (this.active) {
      throw new AndroidBridgeError('DEVICE_BUSY', 'Primary/follower recording is already active.', {
        blocked: true,
      });
    }

    this.beginObservationSession();
    this.active = true;
    const generation = this.observationGeneration;
    try {
      await this.primaryRecorder.start(
        { deviceId: bindings.primary.adbSerialSnapshot },
        (action) => {
          this.enqueueFollowerObservation(plan, action, bindings.followers, onEvent, generation);
        },
      );
    } catch (error) {
      this.active = false;
      this.cancelObservationSession();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.active && this.primaryRecorder.state === 'idle') return;
    try {
      await this.primaryRecorder.stop();
      await withTimeout(this.pendingObservations, FOLLOWER_DRAIN_TIMEOUT_MS, () => {
        this.observationAbort.abort();
      });
      if (this.pendingObservationError) throw this.pendingObservationError;
    } finally {
      this.active = false;
      this.cancelObservationSession();
    }
  }

  public async pause(): Promise<void> {
    await this.primaryRecorder.pause();
  }

  public async resume(): Promise<void> {
    await this.primaryRecorder.resume();
  }

  private enqueueFollowerObservation(
    plan: RecordingPlan,
    action: ActionIR,
    followers: readonly RecordingDeviceBinding[],
    onEvent: PrimaryFollowerRecordingEventHandler,
    generation: number,
  ): void {
    if (!this.active || generation !== this.observationGeneration || this.observationAbort.signal.aborted) return;
    if (this.pendingObservationCount >= MAX_PENDING_FOLLOWER_OBSERVATIONS) {
      const error = new AndroidBridgeError(
        'DEVICE_BUSY',
        `Follower observation queue reached its ${MAX_PENDING_FOLLOWER_OBSERVATIONS}-action limit.`,
        { blocked: true, details: { queueLimit: MAX_PENDING_FOLLOWER_OBSERVATIONS } },
      );
      onEvent({
        primaryAction: action,
        observations: followers.map((follower) => this.blockedObservation(plan, action, follower, error)),
      });
      return;
    }

    this.pendingObservationCount += 1;
    const observation = this.pendingObservations
      .then(() => this.observeFollowers(plan, action, followers, onEvent, generation));
    this.pendingObservations = observation
      .catch((error: unknown) => {
        this.pendingObservationError ??= error;
      })
      .finally(() => {
        if (generation === this.observationGeneration) this.pendingObservationCount -= 1;
      });
  }

  private async observeFollowers(
    plan: RecordingPlan,
    action: ActionIR,
    followers: readonly RecordingDeviceBinding[],
    onEvent: PrimaryFollowerRecordingEventHandler,
    generation: number,
  ): Promise<void> {
    const signal = this.observationAbort.signal;
    const observations = await Promise.all(
      followers.map(async (follower) => {
        try {
          return await raceWithAbort(this.followerObserver.observe(action, {
            recordingId: plan.recordingId,
            deviceId: follower.adbSerialSnapshot,
            adbSerialSnapshot: follower.adbSerialSnapshot,
          }), signal).then((observation) => ({ ...observation, deviceId: follower.deviceId }));
        } catch (error) {
          return this.blockedObservation(plan, action, follower, error);
        }
      }),
    );
    if (!this.active || generation !== this.observationGeneration || signal.aborted) return;
    onEvent({ primaryAction: action, observations });
  }

  private beginObservationSession(): void {
    this.cancelObservationSession();
    this.observationAbort = new AbortController();
  }

  private cancelObservationSession(): void {
    this.observationAbort.abort();
    this.observationGeneration += 1;
    this.pendingObservations = Promise.resolve();
    this.pendingObservationCount = 0;
    this.pendingObservationError = undefined;
  }

  private blockedObservation(
    plan: RecordingPlan,
    action: ActionIR,
    follower: RecordingDeviceBinding,
    error: unknown,
  ): DeviceObservation {
    const blocked = isFollowerObservationBlocked(error);
    const errorCode = error instanceof AndroidBridgeError ? error.code : 'FOLLOWER_OBSERVATION_FAILED';
    const errorMessage = error instanceof Error ? error.message : 'Follower observation failed.';
    return {
      schemaVersion: 1,
      recordingId: plan.recordingId,
      actionId: action.id,
      deviceId: follower.deviceId,
      adbSerialSnapshot: follower.adbSerialSnapshot,
      status: blocked ? 'BLOCKED' : ('FAILED' as DeviceObservationStatus),
      fallbackUsed: false,
      timestamp: Date.now(),
      errorCode,
      errorMessage,
    };
  }

  private validatePlan(plan: RecordingPlan, bindings: PrimaryFollowerRecordingBindings): void {
    if (plan.schemaVersion !== 1 || plan.mode !== 'primary-followers') {
      throw new AndroidBridgeError('INVALID_ARGUMENT', 'Unsupported primary/follower recording plan.', {
        blocked: true,
      });
    }
    if (!plan.recordingId.trim() || !plan.sessionId.trim()) {
      throw new AndroidBridgeError('INVALID_ARGUMENT', 'Recording ID and session ID are required.', {
        blocked: true,
      });
    }
    if (plan.primaryDeviceId !== bindings.primary.deviceId) {
      throw new AndroidBridgeError('INVALID_ARGUMENT', 'Primary device binding does not match the recording plan.', {
        blocked: true,
      });
    }
    const followerIds = bindings.followers.map((follower) => follower.deviceId);
    if (followerIds.length === 0 || new Set(followerIds).size !== followerIds.length) {
      throw new AndroidBridgeError('INVALID_ARGUMENT', 'At least one unique follower device is required.', {
        blocked: true,
      });
    }
    if (followerIds.includes(bindings.primary.deviceId)) {
      throw new AndroidBridgeError('INVALID_ARGUMENT', 'The primary device cannot also be a follower.', {
        blocked: true,
      });
    }
    if (plan.followerDeviceIds.length !== followerIds.length
      || plan.followerDeviceIds.some((deviceId) => !followerIds.includes(deviceId))) {
      throw new AndroidBridgeError('INVALID_ARGUMENT', 'Follower bindings do not match the recording plan.', {
        blocked: true,
      });
    }
    for (const binding of [bindings.primary, ...bindings.followers]) {
      if (!binding.deviceId.trim() || !binding.adbSerialSnapshot.trim()) {
        throw new AndroidBridgeError('INVALID_ARGUMENT', 'Every recording device needs a stable ID and serial snapshot.', {
          blocked: true,
        });
      }
    }
  }
}

async function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw new AndroidBridgeError('CANCELLED', 'Follower observation was cancelled.');
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AndroidBridgeError('CANCELLED', 'Follower observation was cancelled.'));
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function withTimeout(operation: Promise<void>, timeoutMs: number, onTimeout: () => void): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          reject(new AndroidBridgeError(
            'ADB_TIMEOUT',
            `Follower observations did not finish within ${timeoutMs}ms.`,
            { blocked: true },
          ));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

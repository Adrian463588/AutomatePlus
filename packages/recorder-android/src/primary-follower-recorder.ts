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

/**
 * Coordinates one canonical primary recorder with independent follower
 * hierarchy observations. Follower input is never synthesized from primary
 * coordinates; every follower resolves the action against its own hierarchy.
 */
export class AndroidPrimaryFollowerRecorder {
  private active = false;
  private pendingObservations: Promise<void> = Promise.resolve();

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

    this.active = true;
    try {
      await this.primaryRecorder.start(
        { deviceId: bindings.primary.adbSerialSnapshot },
        (action) => {
          this.pendingObservations = this.pendingObservations
            .then(() => this.observeFollowers(plan, action, bindings.followers, onEvent));
        },
      );
    } catch (error) {
      this.active = false;
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.active && this.primaryRecorder.state === 'idle') return;
    try {
      await this.primaryRecorder.stop();
      await this.pendingObservations;
    } finally {
      this.active = false;
      this.pendingObservations = Promise.resolve();
    }
  }

  public async pause(): Promise<void> {
    await this.primaryRecorder.pause();
  }

  public async resume(): Promise<void> {
    await this.primaryRecorder.resume();
  }

  private async observeFollowers(
    plan: RecordingPlan,
    action: ActionIR,
    followers: readonly RecordingDeviceBinding[],
    onEvent: PrimaryFollowerRecordingEventHandler,
  ): Promise<void> {
    const observations = await Promise.all(
      followers.map(async (follower) => {
        try {
          return await this.followerObserver.observe(action, {
            recordingId: plan.recordingId,
            deviceId: follower.adbSerialSnapshot,
            adbSerialSnapshot: follower.adbSerialSnapshot,
          }).then((observation) => ({ ...observation, deviceId: follower.deviceId }));
        } catch (error) {
          return this.blockedObservation(plan, action, follower, error);
        }
      }),
    );
    onEvent({ primaryAction: action, observations });
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

import { ActionIR, PlatformType } from '@automate-plus/ir-schema';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping';

export interface RecorderOptions {
  targetUrl?: string;
  deviceId?: string;
  viewport?: { width: number; height: number };
}

export type ActionCallback = (action: ActionIR) => void;

export interface IRecorder {
  readonly platform: PlatformType;
  readonly state: RecorderState;

  start(options: RecorderOptions, onAction: ActionCallback): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

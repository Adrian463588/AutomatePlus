export interface AndroidDeviceInfo {
  id: string;
  model: string;
  product: string;
  androidVersion: string;
  sdkVersion: number;
  isEmulator: boolean;
  status: 'device' | 'offline' | 'unauthorized';
}

export interface TouchPoint {
  x: number;
  y: number;
}

export interface IDeviceBridge {
  listDevices(): Promise<AndroidDeviceInfo[]>;
  startScreenMirror(deviceId: string, onFrame: (nalUnit: Uint8Array) => void): Promise<void>;
  stopScreenMirror(deviceId: string): Promise<void>;
  sendTap(deviceId: string, point: TouchPoint): Promise<void>;
  sendSwipe(deviceId: string, start: TouchPoint, end: TouchPoint, durationMs?: number): Promise<void>;
  dumpUiHierarchy(deviceId: string): Promise<string>;
}

import { AndroidDeviceInfo, IDeviceBridge, TouchPoint } from '@automate-plus/contracts';

export class AdbBridge implements IDeviceBridge {
  private mockDevices: AndroidDeviceInfo[] = [
    {
      id: 'emulator-5554',
      model: 'Pixel 7 Pro',
      product: 'cheetah',
      androidVersion: '14.0',
      sdkVersion: 34,
      isEmulator: true,
      status: 'device',
    },
  ];

  public async listDevices(): Promise<AndroidDeviceInfo[]> {
    return this.mockDevices;
  }

  public async startScreenMirror(_deviceId: string, _onFrame: (nalUnit: Uint8Array) => void): Promise<void> {
    // Screen mirror initialized
  }

  public async stopScreenMirror(_deviceId: string): Promise<void> {
    // Screen mirror stopped
  }

  public async sendTap(_deviceId: string, _point: TouchPoint): Promise<void> {
    // Tap sent via ADB input tap
  }

  public async sendSwipe(_deviceId: string, _start: TouchPoint, _end: TouchPoint, _durationMs?: number): Promise<void> {
    // Swipe sent via ADB input swipe
  }

  public async dumpUiHierarchy(_deviceId: string): Promise<string> {
    return `<hierarchy rotation="0"><node bounds="[0,0][1080,2400]" class="android.widget.FrameLayout"><node bounds="[100,200][980,350]" class="android.widget.Button" resource-id="com.example:id/btn_login" text="Log In"/></node></hierarchy>`;
  }
}

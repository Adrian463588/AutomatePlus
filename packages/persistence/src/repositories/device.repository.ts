import { IStorageEngine } from '../storage-engine.js';
import { DeviceProfile } from '@automate-plus/contracts';

export class DeviceRepository {
  private readonly collection = 'device_profiles';

  constructor(private storage: IStorageEngine) {}

  public async getAll(): Promise<DeviceProfile[]> {
    return this.storage.read<DeviceProfile>(this.collection);
  }

  public async getById(deviceId: string): Promise<DeviceProfile | undefined> {
    const devices = await this.getAll();
    return devices.find((d) => d.deviceId === deviceId);
  }

  public async getBySerial(serial: string): Promise<DeviceProfile | undefined> {
    const devices = await this.getAll();
    return devices.find((d) => d.adbSerial === serial);
  }

  public async save(device: DeviceProfile): Promise<DeviceProfile> {
    const devices = await this.getAll();
    const index = devices.findIndex((d) => d.deviceId === device.deviceId || d.adbSerial === device.adbSerial);
    if (index >= 0) {
      devices[index] = { ...device, lastSeenAt: Date.now() };
    } else {
      devices.push({ ...device, lastSeenAt: Date.now() });
    }
    await this.storage.write(this.collection, devices);
    return device;
  }

  public async delete(deviceId: string): Promise<boolean> {
    const devices = await this.getAll();
    const filtered = devices.filter((d) => d.deviceId !== deviceId);
    if (filtered.length !== devices.length) {
      await this.storage.write(this.collection, filtered);
      return true;
    }
    return false;
  }
}

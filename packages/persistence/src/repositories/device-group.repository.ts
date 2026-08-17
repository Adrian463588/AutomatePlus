import { IStorageEngine } from '../storage-engine.js';
import { DeviceGroup } from '@automate-plus/contracts';

export class DeviceGroupRepository {
  private readonly collection = 'device_groups';

  constructor(private storage: IStorageEngine) {}

  public async getAll(): Promise<DeviceGroup[]> {
    return this.storage.read<DeviceGroup>(this.collection);
  }

  public async getById(id: string): Promise<DeviceGroup | undefined> {
    const groups = await this.getAll();
    return groups.find((g) => g.id === id);
  }

  public async save(group: DeviceGroup): Promise<DeviceGroup> {
    const groups = await this.getAll();
    const index = groups.findIndex((g) => g.id === group.id);
    if (index >= 0) {
      groups[index] = { ...group, updatedAt: Date.now() };
    } else {
      groups.push({ ...group, createdAt: Date.now(), updatedAt: Date.now() });
    }
    await this.storage.write(this.collection, groups);
    return group;
  }

  public async delete(id: string): Promise<boolean> {
    const groups = await this.getAll();
    const filtered = groups.filter((g) => g.id !== id);
    if (filtered.length !== groups.length) {
      await this.storage.write(this.collection, filtered);
      return true;
    }
    return false;
  }
}

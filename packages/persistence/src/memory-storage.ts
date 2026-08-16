export interface IStorageEngine {
  read<T>(collection: string): Promise<T[]>;
  write<T>(collection: string, data: T[]): Promise<void>;
}

export class MemoryStorageEngine implements IStorageEngine {
  private readonly store = new Map<string, unknown[]>();

  public async read<T>(collection: string): Promise<T[]> {
    return (this.store.get(collection) ?? []) as T[];
  }

  public async write<T>(collection: string, data: T[]): Promise<void> {
    this.store.set(collection, data);
  }
}

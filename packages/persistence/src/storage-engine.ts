import fs from 'node:fs';
import path from 'node:path';

export interface IStorageEngine {
  read<T>(collection: string): Promise<T[]>;
  write<T>(collection: string, data: T[]): Promise<void>;
}

export class MemoryStorageEngine implements IStorageEngine {
  private store: Map<string, unknown[]> = new Map();

  public async read<T>(collection: string): Promise<T[]> {
    return (this.store.get(collection) || []) as T[];
  }

  public async write<T>(collection: string, data: T[]): Promise<void> {
    this.store.set(collection, data);
  }
}

export class FileStorageEngine implements IStorageEngine {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async read<T>(collection: string): Promise<T[]> {
    const filePath = path.join(this.baseDir, `${collection}.json`);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T[];
    } catch {
      return [];
    }
  }

  public async write<T>(collection: string, data: T[]): Promise<void> {
    const filePath = path.join(this.baseDir, `${collection}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

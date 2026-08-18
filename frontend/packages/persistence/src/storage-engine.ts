import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { IStorageEngine } from './memory-storage.js';

export { IStorageEngine, MemoryStorageEngine } from './memory-storage.js';

const require = createRequire(import.meta.url);
const sqliteModuleName = ['node', 'sqlite'].join(':');
const { DatabaseSync: DatabaseSyncConstructor } = require(sqliteModuleName) as {
  DatabaseSync: new (databasePath: string) => DatabaseSync;
};

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

/**
 * Durable local storage for the desktop host. The collection API remains small
 * so repositories do not know whether they are backed by memory, JSON files,
 * or SQLite. Payloads are stored as JSON while collection ownership and row
 * ordering are enforced by SQLite.
 */
export class SQLiteStorageEngine implements IStorageEngine {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    const parentDirectory = path.dirname(databasePath);
    fs.mkdirSync(parentDirectory, { recursive: true });
    this.database = new DatabaseSyncConstructor(databasePath);
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS storage_records (
        collection TEXT NOT NULL,
        position INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (collection, position)
      );
      CREATE TABLE IF NOT EXISTS storage_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
  }

  public async read<T>(collection: string): Promise<T[]> {
    const statement = this.database.prepare(
      'SELECT payload FROM storage_records WHERE collection = ? ORDER BY position ASC',
    );
    const rows = statement.all(collection) as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as T);
  }

  public async write<T>(collection: string, data: T[]): Promise<void> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM storage_records WHERE collection = ?').run(collection);
      const insert = this.database.prepare(
        'INSERT INTO storage_records (collection, position, payload) VALUES (?, ?, ?)',
      );
      data.forEach((value, position) => insert.run(collection, position, JSON.stringify(value)));
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public close(): void {
    this.database.close();
  }
}

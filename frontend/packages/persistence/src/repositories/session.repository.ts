import type { IStorageEngine } from '../memory-storage.js';
import { SessionRecord } from '../types.js';

export class SessionRepository {
  private readonly collection = 'sessions';

  constructor(private storage: IStorageEngine) {}

  public async getAll(): Promise<SessionRecord[]> {
    return this.storage.read<SessionRecord>(this.collection);
  }

  public async getByProjectId(projectId: string): Promise<SessionRecord[]> {
    const sessions = await this.getAll();
    return sessions.filter((s) => s.projectId === projectId);
  }

  public async getById(id: string): Promise<SessionRecord | undefined> {
    const sessions = await this.getAll();
    return sessions.find((s) => s.id === id);
  }

  public async save(session: SessionRecord): Promise<SessionRecord> {
    const sessions = await this.getAll();
    const index = sessions.findIndex((s) => s.id === session.id);
    if (index >= 0) {
      sessions[index] = { ...session, updatedAt: Date.now() };
    } else {
      sessions.push({ ...session, createdAt: Date.now(), updatedAt: Date.now() });
    }
    await this.storage.write(this.collection, sessions);
    return session;
  }

  public async delete(id: string): Promise<boolean> {
    const sessions = await this.getAll();
    const filtered = sessions.filter((s) => s.id !== id);
    if (filtered.length !== sessions.length) {
      await this.storage.write(this.collection, filtered);
      return true;
    }
    return false;
  }
}

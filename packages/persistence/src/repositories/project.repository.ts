import { IStorageEngine } from '../storage-engine.js';
import { ProjectRecord } from '../types.js';

export class ProjectRepository {
  private readonly collection = 'projects';

  constructor(private storage: IStorageEngine) {}

  public async getAll(): Promise<ProjectRecord[]> {
    return this.storage.read<ProjectRecord>(this.collection);
  }

  public async getById(id: string): Promise<ProjectRecord | undefined> {
    const projects = await this.getAll();
    return projects.find((p) => p.id === id);
  }

  public async save(project: ProjectRecord): Promise<ProjectRecord> {
    const projects = await this.getAll();
    const index = projects.findIndex((p) => p.id === project.id);
    if (index >= 0) {
      projects[index] = { ...project, updatedAt: Date.now() };
    } else {
      projects.push({ ...project, createdAt: Date.now(), updatedAt: Date.now() });
    }
    await this.storage.write(this.collection, projects);
    return project;
  }

  public async delete(id: string): Promise<boolean> {
    const projects = await this.getAll();
    const filtered = projects.filter((p) => p.id !== id);
    if (filtered.length !== projects.length) {
      await this.storage.write(this.collection, filtered);
      return true;
    }
    return false;
  }
}

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../../../');

function dirname(path: string): string {
  return path.replace(/[\\/][^\\/]+$/u, '');
}

describe('Release Versioning & DevSecOps Regression Contract', () => {
  it('synchronizes release version across all workspace manifests', () => {
    const rootPkgPath = join(repoRoot, 'package.json');
    const frontendPkgPath = join(repoRoot, 'frontend', 'package.json');
    const tauriConfPath = join(repoRoot, 'backend', 'tauri.conf.json');
    const cargoTomlPath = join(repoRoot, 'backend', 'Cargo.toml');

    expect(existsSync(rootPkgPath)).toBe(true);
    expect(existsSync(frontendPkgPath)).toBe(true);
    expect(existsSync(tauriConfPath)).toBe(true);
    expect(existsSync(cargoTomlPath)).toBe(true);

    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
    const frontendPkg = JSON.parse(readFileSync(frontendPkgPath, 'utf8'));
    const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
    const cargoToml = readFileSync(cargoTomlPath, 'utf8');

    const expectedVersion = rootPkg.version;
    expect(expectedVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(frontendPkg.version).toBe(expectedVersion);
    expect(tauriConf.version).toBe(expectedVersion);

    const cargoVersionMatch = /^version\s*=\s*"([^"]+)"/m.exec(cargoToml);
    expect(cargoVersionMatch).not.toBeNull();
    expect(cargoVersionMatch?.[1]).toBe(expectedVersion);
  });

  it('enforces DevSecOps .gitignore exclusion rules to prevent reference and docs leak regression', () => {
    const gitignorePath = join(repoRoot, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);

    const gitignore = readFileSync(gitignorePath, 'utf8');
    const lines = gitignore.split(/\r?\n/u).map((l) => l.trim());

    expect(lines).toContain('reference/');
    expect(lines).toContain('**/reference/');
    expect(lines).toContain('*.zip');
    expect(lines).toContain('docs/*.md');
    expect(lines).toContain('docs/**/*.md');
    expect(lines).toContain('docs/Sprint2/');
    expect(lines).toContain('!docs/assets/**');
  });

  it('validates 1-click execution launchers exist for desktop users', () => {
    const runBatPath = join(repoRoot, 'Run-AutomatePlus.bat');
    const automateBatPath = join(repoRoot, 'automate-plus.bat');

    expect(existsSync(runBatPath)).toBe(true);
    expect(existsSync(automateBatPath)).toBe(true);

    const runBatContent = readFileSync(runBatPath, 'utf8');
    expect(runBatContent.includes('node') || runBatContent.includes('AutomatePlus')).toBe(true);
  });
});

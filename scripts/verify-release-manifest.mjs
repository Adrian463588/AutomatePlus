import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const releaseRoot = join(root, 'release');
const manifestOutput = join(releaseRoot, 'release-manifest.json');
const requiredArtifacts = [
  'AutomatePlus.exe',
  'AutomatePlusBootstrap.exe',
  'WebView2RuntimeInstallerX64.exe',
];

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function artifact(path) {
  return {
    path: relative(root, path).replaceAll('\\', '/'),
    sizeBytes: statSync(path).size,
    sha256: digest(path),
  };
}

function buildReport() {
  const missing = requiredArtifacts
    .map((name) => join(releaseRoot, name))
    .filter((path) => !existsSync(path))
    .map((path) => relative(root, path).replaceAll('\\', '/'));
  const catalogPath = join(root, 'runtime-packs', 'catalog.json');
  if (!existsSync(catalogPath)) missing.push('runtime-packs/catalog.json');

  const files = existsSync(catalogPath)
    ? [catalogPath, ...requiredArtifacts.map((name) => join(releaseRoot, name))]
      .filter((path) => existsSync(path))
      .map(artifact)
    : [];
  return {
    schemaVersion: 1,
    product: 'AutomatePlus',
    architecture: 'win-x64',
    status: missing.length === 0 ? 'Verified' : 'Blocked',
    files,
    missing,
    policy: 'A release manifest is written only after every bootstrap artifact exists and is hashed from disk.',
  };
}

const report = buildReport();
const writeRequested = process.argv.includes('--write');
if (writeRequested && report.status === 'Verified') {
  writeFileSync(manifestOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify({ ...report, manifestOutput: relative(root, manifestOutput).replaceAll('\\', '/') }, null, 2)}\n`);
process.exitCode = report.status === 'Verified' ? 0 : 2;

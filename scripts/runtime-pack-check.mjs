import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function inside(base, candidate) {
  const root = resolve(base);
  const value = resolve(candidate);
  const prefix = `${root}${process.platform === 'win32' ? '\\' : '/'}`;
  return value === root || value.startsWith(prefix);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function packPath(root, value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const runtimeRoot = join(root, 'runtime-packs');
  const candidate = resolve(runtimeRoot, value);
  if (!inside(runtimeRoot, candidate) || !existsSync(candidate)) return undefined;
  try {
    const canonicalRoot = realpathSync(runtimeRoot);
    const canonicalCandidate = realpathSync(candidate);
    return inside(canonicalRoot, canonicalCandidate) ? canonicalCandidate : undefined;
  } catch {
    return undefined;
  }
}

function metadataIsValid(root, pack, manifest) {
  const hasLicense = (typeof pack.license === 'string' && pack.license.trim().length > 0)
    || (pack.license && typeof pack.license === 'object')
    || (typeof pack.licenseFile === 'string' && Boolean(packPath(root, pack.licenseFile)));
  const hasHealthCommand = (typeof pack.healthCommand === 'string' && pack.healthCommand.trim().length > 0)
    || (Array.isArray(pack.healthCommand) && pack.healthCommand.length > 0);
  return typeof pack.name === 'string'
    && pack.name.trim().length > 0
    && typeof pack.version === 'string'
    && pack.version.trim().length > 0
    && typeof pack.executable === 'string'
    && pack.executable.trim().length > 0
    && pack.architecture === manifest.architecture
    && hasLicense
    && hasHealthCommand
    && typeof pack.sha256 === 'string'
    && /^[a-f0-9]{64}$/iu.test(pack.sha256);
}

export function readRuntimePackReport(root) {
  const manifestPath = join(root, 'runtime-packs', 'manifest.json');
  if (!existsSync(manifestPath)) return { manifest: undefined, packs: [], reason: 'runtime-packs/manifest.json is missing' };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest?.product !== 'AutomatePlus' || !Array.isArray(manifest.packs) || typeof manifest.architecture !== 'string') {
      return { manifest, packs: [], reason: 'runtime-packs/manifest.json has an invalid product, architecture, or packs array' };
    }
    const packs = manifest.packs.flatMap((pack) => {
      const path = packPath(root, pack?.path);
      if (!path || !metadataIsValid(root, pack, manifest) || pack.verified !== true) return [];
      try {
        return sha256(path).toLowerCase() === pack.sha256.toLowerCase() ? [{ ...pack, path }] : [];
      } catch {
        return [];
      }
    });
    return { manifest, packs, reason: packs.length === manifest.packs.length ? undefined : 'one or more runtime packs are missing, unverified, or metadata-invalid' };
  } catch (error) {
    return { manifest: undefined, packs: [], reason: `runtime-packs/manifest.json is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function findVerifiedPack(report, { names = [], capabilities = [] } = {}) {
  const normalize = (value) => String(value).replace(/\.(?:exe|cmd|bat)$/iu, '').replace(/[^a-z0-9]/giu, '').toLowerCase();
  const wantedNames = names.map(normalize);
  const wantedCapabilities = capabilities.map(normalize);
  return report.packs.find((pack) => {
    const packNames = [pack.name, pack.tool, pack.executable, pack.path].filter(Boolean).map(normalize);
    const packCapabilities = [pack.capabilities, pack.provides]
      .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
      .map(normalize);
    return wantedNames.some((name) => packNames.includes(name)) || wantedCapabilities.some((capability) => packCapabilities.includes(capability));
  });
}

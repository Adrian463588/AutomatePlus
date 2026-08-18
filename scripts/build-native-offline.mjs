import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const native = join(root, 'backend');
const runtimePacksRoot = join(root, 'runtime-packs');
const manifestPath = join(root, 'runtime-packs', 'manifest.json');
const catalogPath = join(root, 'runtime-packs', 'catalog.json');
const cargoManifestPath = join(native, 'Cargo.toml');
const blockedCode = 2;

function log(message) { process.stdout.write(`[native-offline] ${message}\n`); }
function fail(message) { log(`BLOCKED: ${message}`); return blockedCode; }
function safeRootPath(value) {
  const candidate = resolve(root, value);
  const prefix = `${root}${process.platform === 'win32' ? '\\' : '/'}`;
  return candidate === root || candidate.startsWith(prefix) ? candidate : null;
}
function isInside(base, candidate) {
  const resolvedBase = resolve(base);
  const resolvedCandidate = resolve(candidate);
  const prefix = `${resolvedBase}${process.platform === 'win32' ? '\\' : '/'}`;
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(prefix);
}
function runtimePackPath(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const candidates = [resolve(root, value), resolve(runtimePacksRoot, value)];
  return candidates
    .map((candidate) => safeRootPath(candidate))
    .find((candidate) => candidate && isInside(runtimePacksRoot, candidate)) ?? null;
}
function isVerifiedRuntimeFile(path) {
  if (!path || !existsSync(path)) return false;
  try {
    const runtimeRoot = realpathSync(runtimePacksRoot);
    const candidate = realpathSync(path);
    return statSync(candidate).isFile() && isInside(runtimeRoot, candidate);
  } catch {
    return false;
  }
}
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    stdio: 'ignore',
    windowsHide: true,
  });
  return result.error == null && result.status === 0;
}
function webview2Available() {
  const candidates = [
    process.env.AUTOMATE_PLUS_WEBVIEW2_PATH,
    join(root, 'webview2'),
    'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application',
    'C:\\Program Files\\Microsoft\\EdgeWebView\\Application',
  ].filter(Boolean);
  return candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isDirectory());
}
function loadManifest() {
  if (!existsSync(manifestPath)) return { packs: [], error: 'runtime-packs/manifest.json is missing' };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.packs)) {
      return { packs: [], error: 'runtime manifest must contain a packs array' };
    }
    return { manifest, packs: manifest.packs, error: null };
  } catch (error) {
    return { packs: [], error: `invalid runtime manifest: ${error.message}` };
  }
}
function loadCatalog() {
  if (!existsSync(catalogPath)) return { catalog: null, error: 'runtime-packs/catalog.json is missing' };
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.entries)) {
      return { catalog: null, error: 'runtime catalog must contain an entries array' };
    }
    return { catalog, error: null };
  } catch (error) {
    return { catalog: null, error: `invalid runtime catalog: ${error.message}` };
  }
}
function manifestIsValid(manifest) {
  return Boolean(
    manifest
      && Number.isInteger(manifest.schemaVersion)
      && manifest.product === 'AutomatePlus'
      && typeof manifest.architecture === 'string'
      && manifest.architecture.trim()
      && Array.isArray(manifest.packs),
  );
}
function hasLicenseMetadata(pack) {
  if (typeof pack.license === 'string' && pack.license.trim()) return true;
  if (pack.license && typeof pack.license === 'object') return true;
  if (typeof pack.licenseFile !== 'string' || !pack.licenseFile.trim()) return false;
  const licensePath = runtimePackPath(pack.licenseFile);
  return isVerifiedRuntimeFile(licensePath);
}
function hasHealthCommand(pack) {
  return (typeof pack.healthCommand === 'string' && pack.healthCommand.trim().length > 0)
    || (Array.isArray(pack.healthCommand) && pack.healthCommand.length > 0);
}
function packMetadataIssue(pack, manifest) {
  if (!pack || typeof pack !== 'object') return 'entry is not an object';
  if (typeof pack.name !== 'string' || !pack.name.trim()) return 'name is missing';
  if (typeof pack.version !== 'string' || !pack.version.trim()) return 'version is missing';
  if (typeof pack.executable !== 'string' || !pack.executable.trim()) return 'executable path is missing';
  if (pack.architecture !== manifest.architecture) return `architecture must be ${manifest.architecture}`;
  if (!hasLicenseMetadata(pack)) return 'license metadata is missing or invalid';
  if (!hasHealthCommand(pack)) return 'healthCommand is missing';
  if (typeof pack.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(pack.sha256)) return 'sha256 is invalid';
  return null;
}
function verifyPacks() {
  const manifest = loadManifest();
  if (manifest.error) return { verified: [], issue: manifest.error };
  if (!manifestIsValid(manifest.manifest)) {
    return { verified: [], issue: 'runtime manifest has invalid schema, product, or architecture' };
  }
  const verified = [];
  const issues = [];
  for (const pack of manifest.packs) {
    const metadataIssue = packMetadataIssue(pack, manifest.manifest);
    const packPath = runtimePackPath(pack?.path);
    if (!isVerifiedRuntimeFile(packPath)) {
      issues.push(`${pack?.name ?? 'unnamed'} missing or outside runtime-packs`);
      continue;
    }
    const actual = sha256(packPath);
    if (metadataIssue) {
      issues.push(`${pack.name ?? basename(packPath)} ${metadataIssue}`);
      continue;
    }
    if (pack.verified !== true || actual !== pack.sha256.toLowerCase()) {
      issues.push(`${pack.name ?? basename(packPath)} is not checksum verified`);
      continue;
    }
    const licenseFilePath = typeof pack.licenseFile === 'string'
      ? runtimePackPath(pack.licenseFile)
      : null;
    verified.push({ ...pack, path: packPath, licenseFilePath });
  }
  return {
    manifest: manifest.manifest,
    verified,
    issue: issues.length ? issues.join('; ') : null,
  };
}
function normalizeToolName(value) {
  return String(value)
    .trim()
    .replace(/\.(exe|cmd|bat)$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}
function packProvides(pack, capability) {
  const expected = normalizeToolName(capability);
  return ['capabilities', 'provides']
    .flatMap((key) => {
      const value = pack?.[key];
      if (Array.isArray(value)) return value;
      return typeof value === 'string' ? [value] : [];
    })
    .some((value) => normalizeToolName(value) === expected);
}
function packMatchesTool(pack, packPath, name) {
  const candidates = [
    pack?.tool,
    pack?.executable,
    pack?.name,
    basename(packPath),
  ].filter((value) => typeof value === 'string');
  return candidates.some((value) => normalizeToolName(value) === normalizeToolName(name));
}
function runtimeToolPath(name, packs) {
  return packs.find((pack) => packMatchesTool(pack, pack.path, name))?.path ?? null;
}
function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  return spawnSync(command, args, {
    cwd: native,
    env: { ...process.env, CARGO_NET_OFFLINE: 'true', ...options.env },
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
}
function preflight() {
  const packs = verifyPacks();
  const catalog = loadCatalog();
  const runtimeTools = {
    adb: runtimeToolPath('adb', packs.verified),
    appium: runtimeToolPath('appium', packs.verified),
    scrcpy: runtimeToolPath('scrcpy', packs.verified),
    node: runtimeToolPath('node', packs.verified),
  };
  const result = {
    status: 'ready',
    nativeDirectory: native,
    frontendDist: join(root, 'frontend', 'dist'),
    packs: {
      ...packs,
      manifestPresent: existsSync(manifestPath),
      manifestValid: manifestIsValid(packs.manifest),
      verifiedCount: packs.verified.length,
      status: packs.verified.length > 0 ? 'ready' : 'blocked',
    },
    runtimeCatalog: {
      path: catalogPath,
      present: Boolean(catalog.catalog),
      entryCount: catalog.catalog?.entries?.length ?? 0,
      issue: catalog.error,
      status: catalog.error ? 'blocked' : 'ready',
    },
    tools: {
      cargo: commandExists('cargo'),
      rustc: commandExists('rustc'),
      node: commandExists('node'),
      tauriCli: commandExists('cargo', ['tauri', '--version']),
      webview2: webview2Available(),
      runtime: runtimeTools,
    },
  };
  const reasons = [];
  if (!result.tools.cargo || !result.tools.rustc) reasons.push('Rust toolchain is unavailable');
  if (!result.tools.node) reasons.push('Node.js is unavailable');
  if (!result.packs.verified.length) reasons.push(result.packs.issue ?? 'no verified offline packs are present');
  if (catalog.error) reasons.push(catalog.error);
  if (!existsSync(result.frontendDist)) reasons.push('frontend/dist is missing; build the real renderer first');
  if (!result.tools.tauriCli) reasons.push('cargo-tauri is unavailable in the local toolchain');
  if (!result.tools.webview2) reasons.push('fixed WebView2 runtime is not staged or installed');
  const capabilityPacks = result.packs.verified;
  result.capabilities = {
    host: reasons.length === 0,
    runtimePacks: result.packs.verified.length > 0,
    deviceDiscovery: Boolean(runtimeTools.adb),
    androidRecording: Boolean(runtimeTools.adb && runtimeTools.scrcpy)
      && capabilityPacks.some((pack) => packProvides(pack, 'android-recording')),
    farmReplay: Boolean(runtimeTools.adb && runtimeTools.appium && runtimeTools.scrcpy)
      && capabilityPacks.some((pack) => packProvides(pack, 'farm-replay')),
    nativeExecution: Boolean(result.tools.node && result.tools.webview2)
      && capabilityPacks.some((pack) => packProvides(pack, 'native-execution')),
  };
  result.host = {
    status: reasons.length === 0 ? 'ready' : 'blocked',
    reasons,
  };
  result.runtimePacks = {
    status: result.packs.verified.length > 0 ? 'ready' : 'blocked',
    verifiedCount: result.packs.verified.length,
    issue: result.packs.issue,
  };
  result.status = reasons.length ? 'blocked' : 'ready';
  result.reasons = reasons;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}
function stagePacks(packs) {
  const destination = join(native, 'resources', 'runtime-packs');
  if (existsSync(destination)) {
    throw new Error('native runtime-packs staging directory already exists; refusing to overwrite it');
  }
  mkdirSync(dirname(destination), { recursive: true });
  mkdirSync(destination);
  try {
    copyFileSync(join(runtimePacksRoot, 'catalog.json'), join(destination, 'catalog.json'));
    const stagedPacks = [];
    for (const pack of packs) {
      const packRelativePath = relative(runtimePacksRoot, pack.path);
      const target = join(destination, packRelativePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(pack.path, target);
      const staged = { ...pack, path: packRelativePath.replaceAll('\\', '/') };
      delete staged.licenseFilePath;
      if (pack.licenseFilePath) {
        const licenseRelativePath = relative(runtimePacksRoot, pack.licenseFilePath);
        const licenseTarget = join(destination, licenseRelativePath);
        mkdirSync(dirname(licenseTarget), { recursive: true });
        copyFileSync(pack.licenseFilePath, licenseTarget);
        staged.licenseFile = licenseRelativePath.replaceAll('\\', '/');
      }
      stagedPacks.push(staged);
      log(`staged verified pack ${relative(root, pack.path)} -> ${relative(root, target)}`);
    }
    writeFileSync(join(destination, 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      product: 'AutomatePlus',
      architecture: 'win-x64',
      packs: stagedPacks,
    }, null, 2));
    return destination;
  } catch (error) {
    removeStagedPacks(destination);
    throw error;
  }
}
function removeStagedPacks(destination) {
  if (destination) rmSync(destination, { recursive: true, force: true });
}
function main() {
  const mode = process.argv[2] ?? '--check';
  if (!['--preflight', '--check', '--build'].includes(mode)) {
    return fail(`unknown mode ${mode}`);
  }
  const report = preflight();
  if (mode === '--preflight') return report.status === 'ready' ? 0 : blockedCode;
  if (report.status !== 'ready') return fail(report.reasons.join('; '));
  if (run('cargo', ['fmt', '--manifest-path', cargoManifestPath, '--', '--check']).status !== 0) return 1;
  if (run('cargo', ['test', '--manifest-path', cargoManifestPath, '--offline', '--no-default-features']).status !== 0) return 1;
  if (mode === '--check') {
    return run('cargo', ['check', '--manifest-path', cargoManifestPath, '--offline', '--no-default-features']).status ?? 1;
  }
  let stagedDestination;
  try {
    stagedDestination = stagePacks(report.packs.verified);
    return run('cargo', ['tauri', 'build', '--offline']).status ?? 1;
  } finally {
    removeStagedPacks(stagedDestination);
  }
}
process.exitCode = main();

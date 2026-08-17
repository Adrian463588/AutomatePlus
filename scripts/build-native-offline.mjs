import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const native = join(root, 'apps', 'desktop', 'src-tauri');
const manifestPath = join(root, 'runtime-packs', 'manifest.json');
const blockedCode = 2;

function log(message) { process.stdout.write(`[native-offline] ${message}\n`); }
function fail(message) { log(`BLOCKED: ${message}`); return blockedCode; }
function safeRootPath(value) {
  const candidate = resolve(root, value);
  const prefix = `${root}${process.platform === 'win32' ? '\\' : '/'}`;
  return candidate === root || candidate.startsWith(prefix) ? candidate : null;
}
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore', windowsHide: true });
  return result.error == null && result.status === 0;
}
function loadManifest() {
  if (!existsSync(manifestPath)) return { packs: [], error: 'runtime-packs/manifest.json is missing' };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return { packs: Array.isArray(manifest.packs) ? manifest.packs : [], error: null };
  } catch (error) {
    return { packs: [], error: `invalid runtime manifest: ${error.message}` };
  }
}
function verifyPacks() {
  const manifest = loadManifest();
  if (manifest.error) return { verified: [], issue: manifest.error };
  const verified = [];
  const issues = [];
  for (const pack of manifest.packs) {
    const packPath = typeof pack.path === 'string' ? safeRootPath(pack.path) : null;
    if (!packPath || !existsSync(packPath) || !statSync(packPath).isFile()) {
      issues.push(`${pack.name ?? 'unnamed'} missing`);
      continue;
    }
    const actual = sha256(packPath);
    if (pack.verified !== true || typeof pack.sha256 !== 'string' || actual !== pack.sha256.toLowerCase()) {
      issues.push(`${pack.name ?? basename(packPath)} is not checksum verified`);
      continue;
    }
    verified.push({ ...pack, path: packPath });
  }
  return { verified, issue: issues.length ? issues.join('; ') : null };
}
function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  return spawnSync(command, args, { cwd: native, stdio: 'inherit', windowsHide: true, ...options });
}
function preflight() {
  const result = {
    status: 'ready',
    nativeDirectory: native,
    frontendDist: join(root, 'apps', 'desktop', 'dist'),
    packs: verifyPacks(),
    tools: {
      cargo: commandExists('cargo'),
      rustc: commandExists('rustc'),
      node: commandExists('node'),
      tauriCli: commandExists('cargo', ['tauri', '--version']),
    },
  };
  const reasons = [];
  if (!result.tools.cargo || !result.tools.rustc) reasons.push('Rust toolchain is unavailable');
  if (!result.tools.node) reasons.push('Node.js is unavailable');
  if (!result.packs.verified.length) reasons.push(result.packs.issue ?? 'no verified offline packs are present');
  if (!existsSync(result.frontendDist)) reasons.push('apps/desktop/dist is missing; build the real renderer first');
  if (!result.tools.tauriCli) reasons.push('cargo-tauri is unavailable in the local toolchain');
  result.status = reasons.length ? 'blocked' : 'ready';
  result.reasons = reasons;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}
function stagePacks(packs) {
  const destination = join(native, 'resources', 'runtime-packs');
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'manifest.json'), JSON.stringify({
    packs: packs.map((pack) => ({ ...pack, path: basename(pack.path) })),
  }, null, 2));
  for (const pack of packs) {
    const target = join(destination, basename(pack.path));
    copyFileSync(pack.path, target);
    log(`staged verified pack ${relative(root, pack.path)} -> ${relative(root, target)}`);
  }
}
function main() {
  const mode = process.argv[2] ?? '--check';
  const report = preflight();
  if (mode === '--preflight') return report.status === 'ready' ? 0 : blockedCode;
  if (report.status !== 'ready') return fail(report.reasons.join('; '));
  stagePacks(report.packs.verified);
  if (run('cargo', ['fmt', '--check']).status !== 0) return 1;
  if (run('cargo', ['test', '--offline', '--no-default-features']).status !== 0) return 1;
  if (mode === '--check') return run('cargo', ['check', '--offline', '--no-default-features']).status ?? 1;
  if (mode !== '--build') return fail(`unknown mode ${mode}`);
  return run('cargo', ['tauri', 'build', '--offline']).status ?? 1;
}
process.exitCode = main();

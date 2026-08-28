import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = join(root, 'backend', 'Cargo.toml');
const lockfile = join(root, 'backend', 'Cargo.lock');
const online = process.argv.includes('--online');
const installTauriCli = process.argv.includes('--install-tauri-cli');
const tauriCliVersion = '2.11.4';

function log(message) {
  process.stdout.write(`[native-provision] ${message}\n`);
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  return spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, CARGO_NET_OFFLINE: undefined, ...options.env },
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
}

if (!online) {
  log('BLOCKED: native dependency provisioning is network-enabled only after explicit --online consent.');
  log('Use: node scripts/provision-native-deps.mjs --online [--install-tauri-cli]');
  process.exitCode = 2;
} else if (!existsSync(manifest)) {
  log(`BLOCKED: native manifest is missing: ${manifest}`);
  process.exitCode = 2;
} else {
  let lockReady = existsSync(lockfile);
  if (!lockReady) {
    const generated = run('cargo', ['generate-lockfile', '--manifest-path', manifest]);
    lockReady = generated.error == null && generated.status === 0 && existsSync(lockfile);
  } else {
    log('Using the existing tracked backend/Cargo.lock; dependency versions will not be re-resolved.');
  }
  if (!lockReady) {
    log('FAILED: Cargo could not create the missing backend/Cargo.lock.');
    process.exitCode = 1;
  } else {
    const fetched = run('cargo', ['fetch', '--manifest-path', manifest, '--locked']);
    if (fetched.error != null || fetched.status !== 0 || !existsSync(lockfile)) {
      log('FAILED: Cargo could not populate the locked native dependency cache.');
      process.exitCode = 1;
    } else if (installTauriCli) {
      const installed = run('cargo', ['install', 'tauri-cli', '--version', tauriCliVersion, '--locked']);
      process.exitCode = installed.error == null && installed.status === 0 ? 0 : 1;
    } else {
      const verified = run('cargo', [
        'metadata',
        '--manifest-path',
        manifest,
        '--locked',
        '--offline',
        '--format-version',
        '1',
        '--no-deps',
      ], { stdio: 'ignore' });
      if (verified.error != null || verified.status !== 0) {
        log('FAILED: locked dependency graph is not reproducible offline after provisioning.');
        process.exitCode = 1;
      } else {
        log(`READY: backend/Cargo.lock and native cache provisioned. Tauri CLI install is optional; use --install-tauri-cli when required.`);
        process.exitCode = 0;
      }
    }
  }
}

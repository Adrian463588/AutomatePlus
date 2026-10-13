import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256FileSync } from './lib/hash-file.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const executable = join(root, 'backend', 'target', 'release', 'AutomatePlus.exe');
const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
if (process.platform !== 'win32' || !existsSync(executable)) throw new Error('Build the native Windows executable before packaging.');
const sourceRevision = run('git', ['rev-parse', 'HEAD']).trim();
if (run('git', ['status', '--porcelain']).trim()) throw new Error('Commit the reviewed source before packaging a release.');
const receipt = JSON.parse(readFileSync(join(root, '.automateplus', 'native-build.json'), 'utf8'));
const binaryVersion = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-Item -LiteralPath ' + quote(executable) + ').VersionInfo.ProductVersion']).trim();
if (binaryVersion !== version || receipt.version !== version || receipt.sourceRevision !== sourceRevision || receipt.sourceDirty !== false
  || receipt.executableSha256 !== sha256FileSync(executable)
  || receipt.frontendIndexSha256 !== sha256FileSync(join(root, 'frontend', 'dist', 'index.html'))) {
  throw new Error('Native binary/build receipt does not match the committed release. Run npm run native:build again.');
}
const output = join(root, '.automateplus', 'release', version, String(Date.now()));
const stage = join(output, 'AutomatePlus');

function copyLocal(source, destination, boundary = root) {
  const canonicalRoot = realpathSync(boundary);
  const canonical = realpathSync(source);
  if (lstatSync(source).isSymbolicLink() || !statSync(source).isFile() || !canonical.startsWith(canonicalRoot + sep)) {
    throw new Error('Unsafe release source: ' + source);
  }
  const target = join(stage, destination);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
for (const [source, destination] of [
  ['backend/target/release/AutomatePlus.exe', 'release/AutomatePlus.exe'],
  ['Run-AutomatePlus.bat', 'Run-AutomatePlus.bat'],
  ['runtime-packs/catalog.json', 'runtime-packs/catalog.json'],
  ['runtime-packs/manifest.json', 'runtime-packs/manifest.json'],
  ['LICENSE', 'LICENSE'],
]) copyLocal(join(root, source), destination);
// The preview intentionally does not copy arbitrary build resources or user data.
// Automation sidecars/packs are separate verified Runtime Manager prerequisites.

const notices = [];
const supplemental = JSON.parse(readFileSync(join(root, 'assets', 'licenses', 'manifest.json'), 'utf8'));
function collectLicense(name, dependencyVersion, directory, license, declaredFile, sourceUrl) {
  const candidates = new Set(readdirSync(directory).filter((file) => /^(?:licen[sc]e|copying|notice)(?:[._-].*)?$/iu.test(file) && statSync(join(directory, file)).isFile()));
  if (declaredFile) candidates.add(declaredFile);
  const files = [];
  for (const file of candidates) {
    const destination = join('licenses', name.replaceAll(/[^a-zA-Z0-9._-]/gu, '_') + '-' + dependencyVersion, basename(file));
    copyLocal(join(directory, file), destination, directory);
    files.push(destination.replaceAll('\\', '/'));
  }
  if (files.length === 0) {
    for (const path of supplemental.dependencies[name + '@' + dependencyVersion] ?? []) {
      const record = supplemental.files.find((entry) => entry.path === path);
      const source = join(root, 'assets', 'licenses', path);
      if (!record || sha256FileSync(source) !== record.sha256) throw new Error('Unverified supplemental notice: ' + path);
      const destination = join('licenses', name + '-' + dependencyVersion, basename(path));
      copyLocal(source, destination);
      files.push(destination.replaceAll('\\', '/'));
    }
  }
  if (files.length === 0 || !license) throw new Error('Missing upstream license/notice: ' + name + '@' + dependencyVersion);
  notices.push({ name, version: dependencyVersion, license, licenseFiles: files, sourceUrl });
}
const locked = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
for (const [path, entry] of Object.entries(locked.packages)) {
  if (!path.startsWith('node_modules/') || !entry.version || entry.dev || entry.optional) continue;
  const directory = join(root, path);
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  if (metadata.version !== entry.version) throw new Error('Dependency does not match lock: ' + path);
  collectLicense(metadata.name, entry.version, directory, metadata.license, undefined, entry.resolved);
}
const cargo = JSON.parse(run('cargo', ['metadata', '--manifest-path', 'backend/Cargo.toml', '--locked', '--offline', '--format-version=1']));
const windowsDependencies = new Set(run('cargo', ['tree', '--manifest-path', 'backend/Cargo.toml', '--locked', '--offline', '--target', 'x86_64-pc-windows-msvc', '--edges', 'normal', '--prefix', 'none', '--format', '{p}']).split(/\r?\n/u).map((line) => line.split(' ').slice(0, 2).join(' ')));
let sourceFiles = 0;
let sourceBytes = 0;
function copySource(directory, destination, boundary) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlink in dependency source: ' + source);
    if (entry.isDirectory()) copySource(source, join(destination, entry.name), boundary);
    else {
      sourceBytes += statSync(source).size;
      if (++sourceFiles > 2000 || sourceBytes > 32 * 1024 * 1024) throw new Error('Dependency source exceeds the release budget.');
      copyLocal(source, join(destination, entry.name), boundary);
    }
  }
}
for (const dependency of cargo.packages) {
  if (dependency.source === null || !windowsDependencies.has(dependency.name + ' v' + dependency.version)) continue;
  collectLicense(dependency.name, dependency.version, dirname(dependency.manifest_path), dependency.license, dependency.license_file, 'https://crates.io/api/v1/crates/' + dependency.name + '/' + dependency.version + '/download');
  if (dependency.license?.includes('MPL-2.0')) {
    const directory = dirname(dependency.manifest_path);
    copySource(directory, join('third-party-sources', dependency.name + '-' + dependency.version), directory);
  }
}
copyLocal(join(root, 'assets', 'licenses', 'manifest.json'), 'licenses/upstream-provenance.json');
writeFileSync(join(stage, 'THIRD_PARTY_NOTICES.json'), JSON.stringify({ scope: 'Locked production Node dependencies and the Windows x64 normal Rust dependency tree', dependencies: notices }, null, 2) + '\n');
writeFileSync(join(stage, 'SETUP.txt'), 'AutomatePlus ' + version + ' Windows x64 portable preview\n\nExtract the entire ZIP. Double-click Run-AutomatePlus.bat.\nThe native app does not require Node.js or Cargo to open.\nMicrosoft Edge WebView2 Runtime must already be installed.\nUse Runtime Manager to inspect local automation dependencies. Missing packs remain Blocked.\nNo startup download, installer, cloud login or automatic browser fallback.\n--doctor, --build-dev and --browser require the developer source checkout.\nThis preview is unsigned. Verify SHA256SUMS.txt and the download source.\n\nSource and history: https://github.com/Adrian463588/AutomatePlus/releases\n');

function inventory(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlink in release staging: ' + path);
    if (entry.isDirectory()) return inventory(path);
    return [{ path: relative(stage, path).replaceAll('\\', '/'), sizeBytes: statSync(path).size, sha256: sha256FileSync(path) }];
  });
}
const manifest = {
  schemaVersion: 1, product: 'AutomatePlus', version, architecture: 'win-x64',
  sourceRevision, distribution: 'portable-preview', buildReceipt: receipt,
  prerequisites: ['Windows 10/11 x64', 'Installed Microsoft Edge WebView2 Runtime', 'Verified runtime packs for automation execution'],
  files: inventory(stage),
};
writeFileSync(join(stage, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const archiveName = 'AutomatePlus-v' + version + '-windows-x64.zip';
const archive = join(output, archiveName);
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -LiteralPath ' + quote(stage) + ' -DestinationPath ' + quote(archive) + ' -CompressionLevel Optimal']);
for (const name of ['AutomatePlus.exe', 'Run-AutomatePlus.bat', 'release-manifest.json']) copyFileSync(join(stage, name === 'AutomatePlus.exe' ? 'release/AutomatePlus.exe' : name), join(output, name));
const hashes = [archiveName, 'AutomatePlus.exe', 'Run-AutomatePlus.bat', 'release-manifest.json'];
writeFileSync(join(output, 'SHA256SUMS.txt'), hashes.map((name) => sha256FileSync(join(output, name)) + '  ' + name).join('\n') + '\n');
console.log(JSON.stringify({ status: 'Packaged', version, output, archive, sha256: sha256FileSync(archive), sizeBytes: statSync(archive).size, sourceRevision, dependencyNotices: notices.length }, null, 2));

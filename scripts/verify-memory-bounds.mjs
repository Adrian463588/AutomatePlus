import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const sources = [
  'scripts/runtime-catalog.mjs',
  'scripts/runtime-pack-check.mjs',
  'scripts/build-native-offline.mjs',
  'scripts/verify-release-manifest.mjs',
].map((path) => join(root, path));

for (const source of sources) {
  const text = readFileSync(source, 'utf8');
  if (/createHash\(['"]sha256['"]\)[\s\S]{0,120}readFileSync\(/u.test(text)) {
    throw new Error(`${source} still hashes a full in-memory file buffer.`);
  }
}

const rustPreflight = readFileSync(join(root, 'backend', 'src', 'preflight.rs'), 'utf8');
if (/hasher\.update\(fs::read\(/u.test(rustPreflight)) {
  throw new Error('Rust preflight still hashes a full in-memory file buffer.');
}

const runtimeSource = readFileSync(join(root, 'backend', 'src', 'runtime.rs'), 'utf8');
const catalogSource = readFileSync(join(root, 'backend', 'src', 'runtime_catalog.rs'), 'utf8');
const persistenceSource = readFileSync(join(root, 'backend', 'src', 'persistence.rs'), 'utf8');
const k6Source = readFileSync(join(root, 'frontend', 'packages', 'stress-engine', 'src', 'k6-runner.ts'), 'utf8');
if (!runtimeSource.includes('read_bounded_metadata(&root.join("manifest.json"))')) {
  throw new Error('Runtime manifests are not using the bounded metadata reader.');
}
if (!catalogSource.includes('MAX_RUNTIME_METADATA_BYTES')) {
  throw new Error('Runtime catalog metadata has no explicit size limit.');
}
if (!persistenceSource.includes('LIMIT 1001')) {
  throw new Error('Artifact listing has no bounded SQL result window.');
}
if (/readFile\(summaryPath/u.test(k6Source)) {
  throw new Error('k6 summary still uses a race-prone unbounded readFile call.');
}

const probeRoot = mkdtempSync(join(tmpdir(), 'automate-plus-memory-probe-'));
const probeFile = join(probeRoot, 'sparse-runtime-pack.bin');
const descriptor = openSync(probeFile, 'w');
try {
  ftruncateSync(descriptor, 128 * 1024 * 1024);
} finally {
  closeSync(descriptor);
}

try {
  const hashModule = pathToFileURL(join(root, 'scripts', 'lib', 'hash-file.mjs')).href;
  const probe = [
    `import { sha256FileSync } from ${JSON.stringify(hashModule)};`,
    'const digest = sha256FileSync(process.env.AUTOMATEPLUS_MEMORY_PROBE_FILE);',
    "if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid digest');",
  ].join('\n');
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=32', '--input-type=module', '--eval', probe],
    {
      env: { ...process.env, AUTOMATEPLUS_MEMORY_PROBE_FILE: probeFile },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Bounded hash probe failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
} finally {
  rmSync(probeRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  status: 'Verified',
  probeBytes: 128 * 1024 * 1024,
  nodeOldSpaceMb: 32,
  hashing: 'streaming',
})}\n`);

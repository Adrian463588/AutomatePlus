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
const rustDispatch = readFileSync(join(root, 'backend', 'src', 'lib.rs'), 'utf8');
const rustFarm = readFileSync(join(root, 'backend', 'src', 'farm.rs'), 'utf8');
if (/hasher\.update\(fs::read\(/u.test(rustPreflight)) {
  throw new Error('Rust preflight still hashes a full in-memory file buffer.');
}
if (!rustDispatch.includes('InvokeBody::Raw(bytes)') || !rustDispatch.includes('NativeRequest::from_bounded_slice(bytes)')) {
  throw new Error('Native Tauri dispatch does not reject oversized requests before JSON deserialization.');
}
if (!rustFarm.includes('farm_worker_count(targets.len(), spec.max_parallel_devices)')) {
  throw new Error('Android farm does not bound worker creation before spawning threads.');
}

const runtimeSource = readFileSync(join(root, 'backend', 'src', 'runtime.rs'), 'utf8');
const catalogSource = readFileSync(join(root, 'backend', 'src', 'runtime_catalog.rs'), 'utf8');
const persistenceSource = readFileSync(join(root, 'backend', 'src', 'persistence.rs'), 'utf8');
const k6Source = readFileSync(join(root, 'frontend', 'packages', 'stress-engine', 'src', 'k6-runner.ts'), 'utf8');
const protocolSource = readFileSync(join(root, 'frontend', 'packages', 'contracts', 'src', 'protocol.ts'), 'utf8');
const processRunnerSource = readFileSync(join(root, 'frontend', 'packages', 'runner-core', 'src', 'process-runner.ts'), 'utf8');
const sidecarSource = readFileSync(join(root, 'frontend', 'sidecar', 'src', 'main.ts'), 'utf8');
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
if (!protocolSource.includes('encodeNativeIpcMessage') || !protocolSource.includes('MAX_NATIVE_IPC_BYTES')) {
  throw new Error('TypeScript native IPC has no byte-bounded raw encoder.');
}
if (!processRunnerSource.includes('DEFAULT_MAX_PROCESS_OUTPUT_BYTES') || !processRunnerSource.includes('outputLimitExceeded')) {
  throw new Error('Generated runner process output has no enforced memory budget.');
}
if (!sidecarSource.includes('encodeNativeIpcMessage(message)')) {
  throw new Error('TypeScript sidecar output is not byte-bounded before stdout writes.');
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

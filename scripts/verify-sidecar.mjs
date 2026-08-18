import { spawn } from 'node:child_process';

const requests = [
  {
    protocolVersion: '1.0',
    kind: 'request',
    correlationId: '00000000-0000-4000-8000-000000000001',
    method: 'health',
    payload: {},
  },
  {
    protocolVersion: '1.0',
    kind: 'request',
    correlationId: '00000000-0000-4000-8000-000000000002',
    method: 'generator.capabilities',
    payload: {},
  },
];

const child = spawn(process.execPath, ['frontend/sidecar/dist/main.js'], {
  cwd: process.cwd(),
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => resolve(code ?? -1));
});

if (exitCode !== 0) throw new Error(`Sidecar exited with code ${exitCode}: ${stderr}`);
const responses = stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
if (responses.length !== requests.length) throw new Error(`Expected ${requests.length} responses, received ${responses.length}`);
if (responses[0]?.kind !== 'response' || responses[0]?.payload?.ok !== true || responses[0]?.payload?.data?.status !== 'ready' || responses[0]?.payload?.data?.host !== 'typescript-sidecar' || responses[0]?.payload?.data?.generatorCount !== 27) {
  throw new Error(`Health response was not ready: ${JSON.stringify(responses[0])}`);
}
if (responses[1]?.kind !== 'response' || responses[1]?.payload?.ok !== true || !Array.isArray(responses[1]?.payload?.data) || responses[1].payload.data.length !== 27) {
  throw new Error(`Capability response did not contain 27 entries: ${JSON.stringify(responses[1])}`);
}
process.stdout.write(`sidecar smoke passed: ${responses[1].payload.data.length} capability entries\n`);

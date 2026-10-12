import { spawn } from 'node:child_process';
import readline from 'node:readline';

const requests = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-agent', version: '1.0.0' },
    },
  },
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'automateplus_inspect_web_elements',
      arguments: { url: 'https://www.saucedemo.com/' },
    },
  },
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'automateplus_run_web',
      arguments: {
        targetUrl: 'https://www.saucedemo.com/',
        flowPreset: 'saucedemo',
        exportFramework: 'playwright',
        exportLanguage: 'typescript',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'automateplus_run_android',
      arguments: {
        appPackage: 'com.notifplus',
        appActivity: '.MainActivity',
        exportFramework: 'appium',
        exportLanguage: 'typescript',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'automateplus_run_phone_farm',
      arguments: {
        appPackage: 'com.notifplus',
        deviceIds: ['emulator-5554'],
        iterations: 1,
        strategy: 'all-devices',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'automateplus_generate_test_script',
      arguments: {
        platform: 'web',
        framework: 'cypress',
        language: 'typescript',
        targetUrl: 'https://www.saucedemo.com/',
      },
    },
  },
];

const child = spawn(process.execPath, ['scripts/mcp-server.mjs'], {
  cwd: process.cwd(),
  shell: false,
  stdio: ['pipe', 'pipe', 'inherit'],
  windowsHide: true,
});

const responses = [];
const rl = readline.createInterface({
  input: child.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    responses.push(JSON.parse(line));
  } catch (err) {
    console.error('Failed to parse line:', line, err);
  }
});

for (const req of requests) {
  child.stdin.write(`${JSON.stringify(req)}\n`);
}

// Give a short delay for responses then close stdin
await new Promise((resolve) => setTimeout(resolve, 2000));
child.stdin.end();

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => resolve(code ?? -1));
});

if (exitCode !== 0) {
  throw new Error(`MCP server exited with code ${exitCode}`);
}

if (responses.length < requests.length) {
  throw new Error(`Expected at least ${requests.length} responses, got ${responses.length}`);
}

const initResp = responses.find((r) => r.id === 1);
if (!initResp || initResp.result?.serverInfo?.name !== 'automate-plus-mcp') {
  throw new Error(`Invalid initialize response: ${JSON.stringify(initResp)}`);
}

const listResp = responses.find((r) => r.id === 2);
if (!listResp || !Array.isArray(listResp.result?.tools) || listResp.result.tools.length !== 5) {
  throw new Error(`Expected 5 tools, got: ${JSON.stringify(listResp)}`);
}

const inspectResp = responses.find((r) => r.id === 3);
if (!inspectResp || !inspectResp.result?.content?.[0]?.text?.includes('user-name')) {
  throw new Error(`Invalid inspect response: ${JSON.stringify(inspectResp)}`);
}

const webRunResp = responses.find((r) => r.id === 4);
if (!webRunResp || !webRunResp.result?.content?.[0]?.text?.includes('passed')) {
  throw new Error(`Invalid web run response: ${JSON.stringify(webRunResp)}`);
}

const androidRunResp = responses.find((r) => r.id === 5);
if (!androidRunResp || !androidRunResp.result?.content?.[0]?.text?.includes('passed')) {
  throw new Error(`Invalid android run response: ${JSON.stringify(androidRunResp)}`);
}

const farmRunResp = responses.find((r) => r.id === 6);
if (!farmRunResp || !farmRunResp.result?.content?.[0]?.text?.includes('totalCompletedIterations')) {
  throw new Error(`Invalid phone farm run response: ${JSON.stringify(farmRunResp)}`);
}

const genResp = responses.find((r) => r.id === 7);
if (!genResp || !genResp.result?.content?.[0]?.text?.includes('cypress')) {
  throw new Error(`Invalid script generation response: ${JSON.stringify(genResp)}`);
}

console.log('AutomatePlus MCP Server smoke test passed: all 7 JSON-RPC 2.0 requests verified successfully.');

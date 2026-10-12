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
  {
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'run_automation_task',
      arguments: {
        platform: 'web',
        task_id: 'task-web-01',
        params: {
          targetUrl: 'https://www.saucedemo.com/',
          flowPreset: 'saucedemo',
          exportFramework: 'playwright',
        },
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'run_automation_task',
      arguments: {
        platform: 'k6',
        task_id: 'task-k6-01',
        params: {
          targetUrl: 'https://api.example.com',
          duration: '10s',
          targetRps: 50,
        },
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'inspect_element_context',
      arguments: {
        platform: 'web',
        url: 'https://www.saucedemo.com/',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'inspect_element_context',
      arguments: {
        platform: 'android',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'generate_runnable_test_script',
      arguments: {
        session_id: 'session-pw-01',
        framework: 'playwright',
        target_scenario: 'saucedemo-checkout',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'generate_runnable_test_script',
      arguments: {
        session_id: 'session-k6-01',
        framework: 'k6',
        target_scenario: 'api-load-test',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'run_load_test',
      arguments: {
        targetUrl: 'https://reqres.in/api/users',
        targetRps: 50,
        durationSeconds: 5,
        maxVUs: 10,
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: {
      name: 'test_web_page',
      arguments: {
        url: 'https://www.saucedemo.com/',
        flowPreset: 'saucedemo',
        exportFramework: 'playwright',
      },
    },
  },
  {
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'automateplus_run_k6',
      arguments: {
        targetUrl: 'https://reqres.in/api/users',
        targetRps: 25,
        durationSeconds: 5,
        maxVUs: 5,
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
if (!initResp || initResp.result?.serverInfo?.name !== 'automate-plus-mcp' || initResp.result?.serverInfo?.version !== '1.7.0') {
  throw new Error(`Invalid initialize response: ${JSON.stringify(initResp)}`);
}

const listResp = responses.find((r) => r.id === 2);
if (!listResp || !Array.isArray(listResp.result?.tools) || listResp.result.tools.length !== 11) {
  throw new Error(`Expected 11 tools, got: ${JSON.stringify(listResp)}`);
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

const stdWebRunResp = responses.find((r) => r.id === 8);
if (!stdWebRunResp || !stdWebRunResp.result?.content?.[0]?.text?.includes('SUCCESS')) {
  throw new Error(`Invalid standard web run response: ${JSON.stringify(stdWebRunResp)}`);
}

const stdK6RunResp = responses.find((r) => r.id === 9);
if (!stdK6RunResp || !stdK6RunResp.result?.content?.[0]?.text?.includes('SUCCESS')) {
  throw new Error(`Invalid standard k6 run response: ${JSON.stringify(stdK6RunResp)}`);
}

const stdInspectWebResp = responses.find((r) => r.id === 10);
if (!stdInspectWebResp || !stdInspectWebResp.result?.content?.[0]?.text?.includes('user-name')) {
  throw new Error(`Invalid standard inspect web response: ${JSON.stringify(stdInspectWebResp)}`);
}

const stdInspectAndroidResp = responses.find((r) => r.id === 11);
if (!stdInspectAndroidResp || !stdInspectAndroidResp.result?.content?.[0]?.text?.includes('btn_start')) {
  throw new Error(`Invalid standard inspect android response: ${JSON.stringify(stdInspectAndroidResp)}`);
}

const stdGenPwResp = responses.find((r) => r.id === 12);
if (!stdGenPwResp || !stdGenPwResp.result?.content?.[0]?.text?.includes('@playwright/test')) {
  throw new Error(`Invalid standard playwright generation response: ${JSON.stringify(stdGenPwResp)}`);
}

const stdGenK6Resp = responses.find((r) => r.id === 13);
if (!stdGenK6Resp || !stdGenK6Resp.result?.content?.[0]?.text?.includes('k6/http')) {
  throw new Error(`Invalid standard k6 generation response: ${JSON.stringify(stdGenK6Resp)}`);
}

const dedicatedK6Resp = responses.find((r) => r.id === 14);
if (!dedicatedK6Resp || !dedicatedK6Resp.result?.content?.[0]?.text?.includes('SUCCESS') || !dedicatedK6Resp.result?.content?.[0]?.text?.includes('k6/http')) {
  throw new Error(`Invalid dedicated k6 load test response: ${JSON.stringify(dedicatedK6Resp)}`);
}

const testWebPageResp = responses.find((r) => r.id === 15);
if (!testWebPageResp || !testWebPageResp.result?.content?.[0]?.text?.includes('SUCCESS') || !testWebPageResp.result?.content?.[0]?.text?.includes('@playwright/test')) {
  throw new Error(`Invalid test_web_page response: ${JSON.stringify(testWebPageResp)}`);
}

const aliasK6Resp = responses.find((r) => r.id === 16);
if (!aliasK6Resp || !aliasK6Resp.result?.content?.[0]?.text?.includes('passed') || !aliasK6Resp.result?.content?.[0]?.text?.includes('k6')) {
  throw new Error(`Invalid alias k6 response: ${JSON.stringify(aliasK6Resp)}`);
}

console.log('AutomatePlus MCP Server smoke test passed: all 16 JSON-RPC 2.0 requests verified successfully.');

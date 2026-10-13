import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, '.automateplus', 'evidence', 'ui');
const args = process.argv.slice(2);
const option = (name) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const mcpPath = option('--mcp-server') ?? process.env.AUTOMATEPLUS_PLAYWRIGHT_MCP;
const serverKind = option('--server-kind') ?? 'playwright';
const url = option('--url') ?? 'http://127.0.0.1:5181';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'UI audit target must be loopback.');
const pending = new Map();
let sequence = 0;
let buffered = '';
let stderr = '';
let mcp;
let server;

async function verifyWorkbench(page, config) {
  const checks = [];
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (requestValue) => { if (!requestValue.url().startsWith(config.url)) externalRequests.push(requestValue.url()); });
  const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const projectDialog = page.getByRole('dialog', { name: 'Create project', exact: true });
  await projectDialog.getByLabel('Project name').fill('UI acceptance');
  await projectDialog.getByLabel('Workspace path').fill(config.root);
  check(await projectDialog.getByRole('button', { name: 'Browse workspace folder' }).isDisabled(), 'Browser Browse is disabled with native-host explanation');
  await projectDialog.getByRole('button', { name: 'Open native setup guide' }).click();
  await page.keyboard.press('Escape');
  check(await projectDialog.isVisible(), 'Escape closes only the topmost setup dialog');
  await projectDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  check(await page.getByRole('button', { name: 'Create project', exact: true }).evaluate((element) => element === document.activeElement), 'Project dialog restores trigger focus');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  check(await projectDialog.getByLabel('Workspace path').inputValue() === config.root, 'Cancelled form preserves its manual workspace draft');
  await projectDialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await projectDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Create session', exact: true }).first().click();
  const sessionDialog = page.getByRole('dialog', { name: 'Create session', exact: true });
  await sessionDialog.getByLabel('Session name').fill('Web navigation');
  await sessionDialog.getByRole('button', { name: 'Create session', exact: true }).click();
  await sessionDialog.waitFor({ state: 'hidden' });
  await page.getByLabel('Target URL', { exact: true }).fill(config.url);
  await page.getByLabel('Target URL', { exact: true }).blur();
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByLabel('Framework', { exact: true }).selectOption('playwright');
  await page.getByLabel('Language', { exact: true }).selectOption('typescript');
  await page.locator('#editor-title code').filter({ hasText: config.url }).waitFor();
  check(await page.locator('#editor-title code').textContent() !== '', 'User-entered action generates a real Playwright TypeScript project');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected generated file' }).click();
  const download = await downloadPromise;
  check(await download.failure() === null, 'Generated-file export produces an actual browser download');
  await download.saveAs('.automateplus/evidence/ui/generated-preview.ts');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.locator('.header-feedback').filter({ hasText: /Generated preview copied\.|Copy failed;/u }).waitFor();
  check(/Generated preview copied\.|Copy failed;/u.test(await page.locator('.header-feedback').textContent()), 'Copy reports a real result or clipboard error');
  await page.getByLabel('Action', { exact: true }).selectOption('assertUrl');
  await page.getByLabel('Expected value', { exact: true }).fill(config.url);
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByRole('button', { name: 'Move step 2 up' }).click();
  await page.getByRole('button', { name: 'Toggle step 1 optional' }).click();
  await page.getByRole('button', { name: 'Delete step 1', exact: true }).click();
  check(await page.getByRole('button', { name: 'Delete step 2', exact: true }).count() === 0, 'Timeline reorder, optional toggle and deletion persist their action changes');
  await page.getByRole('button', { name: 'Downloads', exact: true }).click();
  const releases = page.getByRole('dialog', { name: 'Download AutomatePlus Desktop App' });
  await releases.waitFor();
  check((await releases.getByRole('link').count()) === 4, 'Downloads exposes portable ZIP, checksums, historical source and release history');
  check(await releases.getByRole('link').evaluateAll((elements) => elements.every((element) => element.href.startsWith('https://github.com/Adrian463588/AutomatePlus/releases'))), 'All download links point to the actual repository');
  await page.keyboard.press('Shift+Tab');
  check(await releases.evaluate((element) => element.contains(document.activeElement)), 'Shift+Tab stays inside release dialog');
  for (let index = 0; index < 6; index++) await page.keyboard.press('Tab');
  check(await releases.evaluate((element) => element.contains(document.activeElement)), 'Tab stays inside release dialog');
  await page.keyboard.press('Escape');
  check(await page.getByRole('button', { name: 'Downloads', exact: true }).evaluate((element) => element === document.activeElement), 'Release dialog restores trigger focus');

  const viewports = [[390, 844], [600, 900], [768, 1024], [840, 1024], [1024, 768], [1280, 800], [1440, 900]];
  const views = ['Recorder', 'Runtime Manager', 'Device Farm', 'API Builder', 'MCP Agent Bridge'];
  const metrics = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const view of views) {
      await page.getByRole('navigation', { name: 'Workspace view' }).getByRole('button', { name: view, exact: true }).click();
      await page.locator('.workspace-loading').waitFor({ state: 'hidden' });
      const measurement = await page.evaluate(() => {
        const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
        const controls = [...document.querySelectorAll('button, input:not([type="checkbox"]), select, textarea, a.tactile-active, summary')].filter(visible);
        return {
          pageWidth: document.documentElement.scrollWidth,
          layout: document.querySelector('main').dataset.layout,
          smallControls: controls.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width < 47.9 || rect.height < 47.9; }).map((element) => element.getAttribute('aria-label') || element.textContent.trim()),
          unnamedButtons: controls.filter((element) => element.tagName === 'BUTTON' && !(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.textContent.trim() || element.title)).length,
          tinyText: [...document.querySelectorAll('p,button')].filter(visible).filter((element) => parseFloat(getComputedStyle(element).fontSize) < 12).length,
        };
      });
      check(measurement.pageWidth <= width + 1, `${view} at ${width}px has no horizontal overflow`);
      check(measurement.smallControls.length === 0, `${view} at ${width}px: controls >=48px (${measurement.smallControls.join(', ')})`);
      check(measurement.unnamedButtons === 0 && measurement.tinyText === 0, `${view} at ${width}px: named controls and readable text`);
      if (view === 'Recorder') {
        const fields = await page.locator('.timeline-value input').evaluateAll((elements) => elements.every((element) => element.getBoundingClientRect().width >= 160));
        check(fields, `Timeline fields remain readable at ${width}px`);
      }
      if (!['Recorder', 'API Builder'].includes(view)) check(measurement.layout === 'full-workspace', `${view} uses the full workspace at ${width}px`);
      metrics.push({ view, width, height, ...measurement });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Recorder', exact: true }).click();
  await page.screenshot({ path: '.automateplus/evidence/ui/workbench-desktop.png' });
  await page.getByRole('button', { name: 'Runtime Manager', exact: true }).click();
  await page.screenshot({ path: '.automateplus/evidence/ui/runtime-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Recorder', exact: true }).click();
  await page.screenshot({ path: '.automateplus/evidence/ui/workbench-mobile.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.getByRole('button', { name: 'Downloads', exact: true }).focus();
  await page.keyboard.down('Space');
  const motion = await page.getByRole('button', { name: 'Downloads', exact: true }).evaluate((element) => ({ transform: getComputedStyle(element).transform, transition: getComputedStyle(element).transitionDuration }));
  await page.keyboard.up('Space');
  check(motion.transform === 'none', 'Reduced motion removes active transforms in forced colors');
  await page.keyboard.press('Escape');
  check(errors.length === 0, `No console/page errors: ${errors.join('; ')}`);
  check(externalRequests.length === 0, `No implicit external request: ${externalRequests.join('; ')}`);
  return { status: 'Verified', checks, viewportCount: viewports.length, screenChecks: metrics.length, metrics, errors, externalRequests };
}

function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000 });
    } catch { child.kill(); }
  } else child.kill('SIGTERM');
}

function request(method, params = {}) {
  return new Promise((resolveRequest, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out. ${stderr.slice(-1000)}`)); }, 60000);
    pending.set(id, { resolve: resolveRequest, reject, timer });
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

async function call(name, argumentsValue = {}) {
  const result = await request('tools/call', { name, arguments: argumentsValue });
  const text = result.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n') ?? '';
  assert(!result.isError, `${name} failed: ${text}`);
  return text;
}

function failPending(error) {
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
  pending.clear();
}

async function ready() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch { /* The owned local server is still starting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Local UI server did not become ready.');
}

try {
  assert(mcpPath && existsSync(mcpPath), 'Set AUTOMATEPLUS_PLAYWRIGHT_MCP or --mcp-server=<installed local MCP cli.js>. No dependency is downloaded.');
  mkdirSync(output, { recursive: true });
  const mcpArgs = serverKind === 'devtools'
    ? [mcpPath, '--headless', '--isolated', '--no-usage-statistics', '--no-performance-crux', '--viewport=1440x900']
    : [mcpPath, '--headless', '--isolated', '--browser=chrome', '--viewport-size=1440,900', '--output-dir', output, '--image-responses=omit'];
  mcp = spawn(process.execPath, mcpArgs, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' } });
  mcp.stdout.setEncoding('utf8');
  mcp.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-64000); });
  mcp.stdout.on('data', (chunk) => {
    buffered += chunk.toString();
    if (Buffer.byteLength(buffered) > 16 * 1024 * 1024) { failPending(new Error('MCP response exceeds the 16 MiB budget.')); stop(mcp); return; }
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { failPending(new Error('MCP returned an invalid NDJSON record.')); stop(mcp); return; }
      if (message.method === 'roots/list') {
        mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { roots: [{ uri: pathToFileURL(root).href, name: 'AutomatePlus' }] } })}\n`);
      } else if (pending.has(message.id)) {
        const job = pending.get(message.id); pending.delete(message.id); clearTimeout(job.timer);
        if (message.error) job.reject(new Error(JSON.stringify(message.error))); else job.resolve(message.result);
      }
    }
  });
  mcp.on('error', failPending);
  mcp.stdin.on('error', failPending);
  mcp.on('close', (code) => failPending(new Error(`MCP closed before responding (exit ${code ?? 'unknown'}${buffered.trim() ? ', incomplete NDJSON' : ''}).`)));
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: { roots: { listChanged: false } }, clientInfo: { name: 'AutomatePlus-UI-audit', version: '1.7.1' } });
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const tools = (await request('tools/list')).tools;
  if (args.includes('--list-tools')) {
    console.log(JSON.stringify(tools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })), null, 2));
  } else {
    if (!option('--url')) {
      server = spawn(process.execPath, [join(root, 'scripts', 'serve-desktop.mjs'), '--no-open', '--port=5181'], { cwd: root, stdio: 'ignore', windowsHide: true });
    }
    await ready();
    if (serverKind === 'devtools') {
      await call('new_page', { url });
      const consoleEvidence = await call('list_console_messages', { types: ['error'] });
      const networkEvidence = await call('list_network_requests', {});
      assert(consoleEvidence.includes('<no console messages found>'), consoleEvidence);
      assert(!/https:\/\//u.test(networkEvidence), 'An implicit external request was observed.');
      writeFileSync(join(output, 'devtools.json'), JSON.stringify({ serverKind, consoleEvidence, networkEvidence }, null, 2));
      console.log(JSON.stringify({ status: 'Verified', serverKind, consoleEvidence, networkEvidence }));
    } else {
      await call('browser_navigate', { url });
      const runner = tools.find((tool) => /^browser_run_code(?:_unsafe)?$/u.test(tool.name));
      assert(runner, 'Installed Playwright MCP does not expose browser_run_code.');
      const probe = `async (page) => {
        await page.screenshot({path: '.automateplus/evidence/ui/baseline-1440.png'});
        return await page.evaluate(() => ({
          width: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          buttons: [...document.querySelectorAll('button')].map(e => ({name:e.getAttribute('aria-label') || e.textContent.trim(), disabled:e.disabled, width:e.getBoundingClientRect().width, height:e.getBoundingClientRect().height})),
          fonts: [...document.querySelectorAll('p,button,h1,h2,h3')].map(e => ({text:e.textContent.trim().slice(0,80),size:getComputedStyle(e).fontSize})).slice(0,40)
        }));
      }`;
      const result = await call(runner.name, { code: args.includes('--baseline') ? probe : `async (page) => (${verifyWorkbench.toString()})(page, ${JSON.stringify({ root, url })})` });
      const resultText = result.split('### Ran Playwright code')[0].replace(/^### Result\s*/u, '').trim();
      writeFileSync(join(output, args.includes('--baseline') ? 'baseline.json' : 'playwright.json'), resultText);
      const report = JSON.parse(resultText);
      console.log(JSON.stringify({ status: report.status ?? 'Baseline', checks: report.checks?.length, viewportCount: report.viewportCount, screenChecks: report.screenChecks, errors: report.errors, externalRequests: report.externalRequests }));
      await call('browser_close');
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  for (const job of pending.values()) clearTimeout(job.timer);
  stop(mcp); stop(server);
}

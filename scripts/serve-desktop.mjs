import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { exec, execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'frontend/dist');
const DEFAULT_PORT = 5173;
const NPM_COMMAND = process.platform === 'win32' ? process.execPath : 'npm';
const NPM_PREFIX = process.platform === 'win32'
  ? [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')]
  : [];

function spawnNpm(args, options) {
  return spawn(NPM_COMMAND, [...NPM_PREFIX, ...args], options);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function openBrowser(url) {
  const startCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(startCmd, (err) => {
    if (err) {
      console.warn(`[AutomatePlus] Could not automatically open browser: ${err.message}`);
    }
  });
}

function stopOwnedProcessTree(child) {
  if (typeof child.pid !== 'number') return;
  if (process.platform === 'win32') {
    const taskkill = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
    execFile(taskkill, ['/PID', String(child.pid), '/T', '/F'], (error) => {
      if (error && !child.killed) child.kill();
    });
    return;
  }
  if (!child.killed) child.kill('SIGTERM');
}

async function ensureDistBuilt() {
  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return true;
  }
  console.log('[AutomatePlus] Building monorepo packages and desktop frontend bundle before initial launch...');
  return new Promise((resolve, reject) => {
    const buildProc = spawnNpm(['run', 'build'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: false,
    });
    buildProc.on('close', (code) => {
      if (code === 0 && fs.existsSync(indexHtml)) {
        resolve(true);
      } else {
        reject(new Error(`Desktop build failed with exit code ${code}`));
      }
    });
    buildProc.on('error', reject);
  });
}

function serveStatic(req, res) {
  const parsedUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
  let pathname = decodeURIComponent(parsedUrl.pathname);
  if (pathname === '/') pathname = '/index.html';

  let filePath = path.join(DIST_DIR, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check file or fallback to index.html for SPA routing
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server Error: ${err.message}`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    });
    res.end(data);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const useDev = args.includes('--dev');
  const shouldOpen = !args.includes('--no-open');
  const portArg = args.find((a) => a.startsWith('--port='));
  const requestedPortValue = portArg ? portArg.slice('--port='.length) : process.env.AUTOMATE_PLUS_PORT;
  const requestedPort = requestedPortValue === undefined ? DEFAULT_PORT : Number(requestedPortValue);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    console.error('[AutomatePlus] BLOCKED: port must be an integer between 1 and 65535.');
    process.exitCode = 2;
    return;
  }

  if (useDev) {
    console.log('[AutomatePlus] Starting development server with Vite...');
    // Development mode must be single-instance. Picking the next free port
    // silently leaves the previous Vite process alive and makes repeated
    // launches accumulate orphaned Node processes. Vite already has
    // strictPort enabled, so fail clearly when the requested port is busy.
    const port = requestedPort;
    if (!(await isPortAvailable(port))) {
      console.error(`[AutomatePlus] BLOCKED: development port ${port} is already in use.`);
      console.error('[AutomatePlus] Stop the existing AutomatePlus dev server before starting another one.');
      process.exitCode = 2;
      return;
    }

    const viteProc = spawnNpm(['--prefix', 'frontend', 'run', 'dev', '--', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: false,
    });

    let shuttingDown = false;
    const stopVite = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      // Windows does not reliably deliver POSIX signals to child process
      // trees. Terminate the owned npm/Vite tree and wait for its close event.
      stopOwnedProcessTree(viteProc);
    };

    process.once('SIGINT', stopVite);
    process.once('SIGTERM', stopVite);

    if (shouldOpen) {
      setTimeout(() => {
        if (!shuttingDown && !viteProc.killed) {
          openBrowser(`http://127.0.0.1:${port}`);
        }
      }, 2500);
    }

    const exitCode = await new Promise((resolve) => {
      viteProc.once('error', (error) => {
        console.error(`[AutomatePlus] Vite process failed: ${error.message}`);
        resolve(1);
      });
      viteProc.once('close', (code) => resolve(typeof code === 'number' ? code : 1));
    });

    process.removeListener('SIGINT', stopVite);
    process.removeListener('SIGTERM', stopVite);
    process.exitCode = shuttingDown ? 0 : exitCode;
    return;
  }

  await ensureDistBuilt();
  const port = requestedPort;
  if (!(await isPortAvailable(port))) {
    console.error(`[AutomatePlus] BLOCKED: browser port ${port} is already in use.`);
    console.error('[AutomatePlus] Stop the existing AutomatePlus server or choose another explicit --port value.');
    process.exitCode = 2;
    return;
  }

  const server = http.createServer(serveStatic);
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log('\n======================================================');
    console.log('   AutomatePlus Desktop Platform (Offline-First)       ');
    console.log('======================================================');
    console.log(`  Local URL:  ${url}`);
    console.log('  Mode:       Offline Desktop App / Migration Shell');
    console.log('  Status:     [READY] Application is live and running');
    console.log('======================================================\n');
    if (shouldOpen) {
      console.log(`[AutomatePlus] Opening ${url} in your default browser...`);
      openBrowser(url);
    } else {
      console.log('[AutomatePlus] Browser auto-open disabled by --no-open.');
    }
    console.log('[AutomatePlus] Press Ctrl+C in this console window to stop.\n');
  });

  const cleanup = () => {
    console.log('\n[AutomatePlus] Shutting down local server...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('[AutomatePlus] Launcher failed:', err);
  process.exit(1);
});

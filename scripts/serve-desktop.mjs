import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { exec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'apps/desktop/dist');
const DEFAULT_PORT = 5173;

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

async function findAvailablePort(startPort, host = '127.0.0.1', maxTries = 20) {
  for (let i = 0; i < maxTries; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port starting from ${startPort}`);
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

async function ensureDistBuilt() {
  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return true;
  }
  console.log('[AutomatePlus] Building monorepo packages and desktop frontend bundle before initial launch...');
  return new Promise((resolve, reject) => {
    const buildProc = spawn('npm', ['run', 'build'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true,
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
  const portArg = args.find((a) => a.startsWith('--port='));
  const requestedPort = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;

  if (useDev) {
    console.log('[AutomatePlus] Starting development server with Vite...');
    const port = await findAvailablePort(requestedPort);
    const viteProc = spawn('npm', ['run', 'dev', '--workspace=@automate-plus/desktop', '--', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true,
    });
    setTimeout(() => {
      openBrowser(`http://127.0.0.1:${port}`);
    }, 2500);
    return;
  }

  await ensureDistBuilt();
  const port = await findAvailablePort(requestedPort);

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
    console.log(`[AutomatePlus] Opening ${url} in your default browser...`);
    openBrowser(url);
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

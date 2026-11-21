import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { localEnvironment } from './local-stack.mjs';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const login = path.join(root, 'temp_login_ui');
const worker = path.join(root, 'mail-worker');

function run(dir, args, label) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'epomail-auth-test-env-'));
  let result;
  try {
    result = spawnSync(process.execPath, args, {
      cwd: dir, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, env: localEnvironment(home)
    });
  } finally { rmSync(home, { recursive: true, force: true }); }
  if (result.error) throw result.error;
  const summary = (result.stdout || '').split('\n').filter(line => /^\s*(Test Files|Tests)\s/.test(line));
  for (const line of summary) console.log(line.trim());
  if (result.status !== 0) {
    const failed = (result.stdout || '').split('\n').filter(line => /^\s*FAIL\s+test\/[\w.-]+\.spec\.js/.test(line))
      .map(line => line.match(/test\/[\w.-]+\.spec\.js/)[0]);
    throw new Error(`${label} exited ${result.status ?? result.signal}; ${[...new Set(failed)].join(', ')}`);
  }
}

export function runWorkerSpecs(specs) {
  run(worker, [path.join(worker, 'node_modules/vitest/vitest.mjs'), 'run', ...specs], 'local Worker tests');
}

const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

export async function withLoginBrowser(scenarios) {
  const build = await mkdtemp(path.join(os.tmpdir(), 'epomail-login-acceptance-'));
  let server, browser;
  try {
    run(login, ['--input-type=module', '-e',
      "import { build } from 'vite'; await build({ envDir: false, build: { outDir: process.argv[1] } });", build
    ], 'local login build');
    server = createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        let file;
        if (pathname === '/logo.svg') file = path.join(build, 'logo.svg');
        else if (pathname.startsWith('/login/assets/')) file = path.resolve(build, '.' + pathname.slice('/login'.length));
        else if (pathname === '/login/' || pathname.startsWith('/login/challenge/')) file = path.join(build, 'index.html');
        if (!file?.startsWith(build + path.sep)) { res.writeHead(404).end(); return; }
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(data);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((resolve, reject) => server.on('error', reject).listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ env: localEnvironment(build), executablePath: process.env.EPOMAIL_CHROMIUM_PATH || undefined });
    const pageFor = async (config, viewport = { width: 1280, height: 850 }, api = {}) => {
      const context = await browser.newContext({ viewport, locale: 'en-US', reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/api/setting/websiteConfig') return route.fulfill({ json: { code: 200, data: {
          register: 1, registerVerify: 0, defaultLang: 'en', ...config
        }}});
        if (Object.hasOwn(api, url.pathname)) return api[url.pathname](route);
        if (url.pathname === '/mail/u/0/') return route.fulfill({ contentType: 'text/html', body: '<main>Inbox</main>' });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { code: 404 } });
        return route.continue();
      });
      return context.newPage();
    };
    await scenarios({ origin, pageFor });
  } finally {
    try { await browser?.close(); }
    finally {
      try { if (server?.listening) await new Promise(resolve => server.close(resolve)); }
      finally { await rm(build, { recursive: true, force: true }); }
    }
  }
}

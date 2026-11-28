import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireVue = createRequire(new URL('../mail-vue/package.json', import.meta.url));
const { createServer } = await import(requireVue.resolve('vite'));
const messages = [];
const previousMessage = Object.getOwnPropertyDescriptor(globalThis, 'ElMessage');
let vite, backend, http, auth;

before(async () => {
  // Exercise real Axios HTTP rejection and the application's real interceptors.
  // Only unrelated stores/session/UI dependencies are isolated here.
  const fixtures = {
    '@/router': 'export default {};',
    '@/i18n/index.js': 'export default {global:{t: key => key}};',
    '@/store/setting.js': 'export const useSettingStore = () => ({lang:"en"});',
    '@/store/ui.js': 'export const useUiStore = () => ({});',
    '@/utils/auth.js': 'export const logouts=[]; export const forceLogoutToLogin=(...args)=>logouts.push(args);',
    '@/utils/tab-session.js': 'export const attachRequestSession=()=>{}; export const isCurrentResponse=()=>true;',
    '@/utils/device-privacy.js': 'export const isLocalSessionEnded=()=>false;'
  };
  vite = await createServer({
    configFile: false, root: fileURLToPath(new URL('../mail-vue', import.meta.url)),
    server: { middlewareMode: true, hmr: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: 'isolate-attachment-interceptor-dependencies',
      resolveId(id) {
        if (id in fixtures) return '\0' + id;
        if (id.startsWith('@/')) return fileURLToPath(new URL('../mail-vue/src/' + id.slice(2), import.meta.url));
      },
      load(id) { if (id.startsWith('\0')) return fixtures[id.slice(1)]; }
    }]
  });
  ({ default: http } = await vite.ssrLoadModule('/src/axios/index.js'));
  auth = await vite.ssrLoadModule('@/utils/auth.js');
  globalThis.ElMessage = options => messages.push(options);
  backend = createHttpServer((req, res) => {
    const status = req.url.endsWith('/allowed') ? 200 : req.url.endsWith('/expired') ? 401 : 404;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status === 200
      ? { code: 200, data: { url: '/oss/static/allowed' } }
      : { code: status, message: status === 404 ? 'Object Not Found' : 'Session expired' }));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  http.defaults.baseURL = `http://127.0.0.1:${backend.address().port}`;
  http.defaults.proxy = false;
});

after(async () => {
  try {
    if (backend) await new Promise((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
  } finally {
    try { await vite?.close(); }
    finally {
      if (previousMessage) Object.defineProperty(globalThis, 'ElMessage', previousMessage);
      else delete globalThis.ElMessage;
    }
  }
});

for (const noMsg of [false, true]) {
  test(`attachment HTTP 404 rejects without logout (noMsg=${noMsg})`, async () => {
    try {
      await assert.rejects(http.get('/oss-url/attachments/missing.txt', { noMsg }), error => {
        assert.equal(error.response.status, 404);
        assert.equal(error.response.data.code, 404);
        assert.equal(error.response.data.data?.url, undefined);
        return true;
      });
      assert.deepEqual(auth.logouts, []);
      assert.equal(messages.length, noMsg ? 0 : 1);
      if (!noMsg) assert.equal(messages[0].message, 'Object Not Found');
    } finally { messages.length = 0; auth.logouts.length = 0; }
  });
}

test('successful attachment responses still resolve and HTTP 401 still expires the session', async () => {
  try {
    assert.deepEqual(await http.get('/oss-url/static/allowed'), { url: '/oss/static/allowed' });
    await assert.rejects(http.get('/oss-url/expired', { noMsg: true }), error => error.response.status === 401);
    assert.equal(auth.logouts.length, 1);
    assert.equal(auth.logouts[0][0], 'Session expired');
    assert.deepEqual(messages, []);
  } finally { messages.length = 0; auth.logouts.length = 0; }
});

import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireVue = createRequire(new URL('../mail-vue/package.json', import.meta.url));
const { createServer } = await import(requireVue.resolve('vite'));
let server, useAttachmentUrls, fixture, vue;
before(async () => {
  server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../mail-vue', import.meta.url)),
    server: { middlewareMode: true, hmr: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: 'isolated-attachment-api',
      resolveId(id) {
        if (id === '@/request/object.js' || id === '@/store/setting.js') return '\0' + id;
        if (id.startsWith('@/')) return fileURLToPath(new URL('../mail-vue/src/' + id.slice(2), import.meta.url));
      },
      load(id) {
        if (id === '\0@/store/setting.js') return 'export const useSettingStore = () => ({settings:{r2Domain:"https://public.example.test"}});';
        if (id === '\0@/request/object.js') return `
          export const calls = [];
          export let reject = false;
          export const setReject = value => { reject = value; };
          export async function signObjectUrls(keys) {
            calls.push([...keys]);
            if (reject) throw new Error('Signing unavailable');
            return {urls: Object.fromEntries(keys.filter(key => !key.includes('foreign')).map(key => [key, '/oss/' + key + '?v=2&uid=7&exp=123&sig=test']))};
          }
        `;
      }
    }]
  });
  ({ useAttachmentUrls } = await server.ssrLoadModule('/src/utils/attachment-urls.js'));
  fixture = await server.ssrLoadModule('@/request/object.js');
  vue = requireVue('vue');
});
after(async () => { await server?.close(); });
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

for (const failure of [false, true]) {
  test(`private attachment rendering with a public domain and signing ${failure ? 'failure' : 'success'}`, async () => {
    fixture.calls.length = 0;
    fixture.setReject(failure);
    const scope = vue.effectScope();
    const html = '<img src="{{domain}}attachments/owned.png"><img src="/attachments/foreign.png">';
    try {
      const urls = scope.run(() => useAttachmentUrls(() => [{ content: html, attList: [{ key: 'attachments/file.txt' }] }]));
      assert.equal(urls.attachmentUrl('attachments/file.txt'), '');
      assert.doesNotMatch(urls.formatImage(html), /public\.example|src="\/?attachments\//);
      await flush();
      assert.deepEqual(fixture.calls, [['attachments/file.txt', 'attachments/foreign.png', 'attachments/owned.png']]);
      assert.equal(urls.attachmentUrl('attachments/foreign.png'), '');
      assert.doesNotMatch(urls.formatImage(html), /public\.example|src="\/?attachments\//);
      if (failure) {
        assert.equal(urls.attachmentUrl('attachments/file.txt'), '');
        assert.deepEqual(urls.trustedImageUrls.value, []);
      } else {
        assert.match(urls.attachmentUrl('attachments/file.txt'), /^\/oss\/attachments\/file.txt\?.*sig=/);
        assert.match(urls.formatImage(html), /src="\/oss\/attachments\/owned.png\?.*sig=/);
        assert.equal(urls.trustedImageUrls.value.length, 2);
        assert.ok(urls.trustedImageUrls.value.every(url => url.includes('sig=') && !url.includes('foreign')));
      }
    } finally { scope.stop(); fixture.setReject(false); }
  });
}

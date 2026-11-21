import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

const moduleUrl = new URL('./helpers/legacy-target.mjs', import.meta.url).href;

test('credentialed legacy tests reject missing, noncanonical and external destinations', () => {
  for (const value of ['', 'https://example.test', 'http://localhost:9000', 'http://127.0.0.1',
    'http://127.0.0.1:9000/path', 'http://127.0.0.1:9000?x=y', 'http://127.1:9000', 'http://a@127.0.0.1:9000']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'await import('+JSON.stringify(moduleUrl)+')'],
      { env: { ...process.env, EPOMAIL_TEST_ORIGIN:value }, encoding:'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /local.stack|loopback|EPOMAIL_TEST_ORIGIN/i);
  }
});

test('Node requests only reach the selected loopback origin including at every redirect', async t => {
  const start = async handler => {
    const server = createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return 'http://127.0.0.1:'+server.address().port;
  };
  let deniedHits = 0;
  const other = await start((_req, res) => { deniedHits++; res.end('other'); });
  const base = await start(async (req,res) => {
    if (req.url === '/local') return res.writeHead(307,{location:'/received'}).end();
    if (req.url === '/redirect') return res.writeHead(302,{location:other+'/denied'}).end();
    let bytes = '';
    for await (const chunk of req) bytes+=chunk;
    res.end(req.method+' '+bytes);
  });
  const before = process.env.EPOMAIL_TEST_ORIGIN;
  process.env.EPOMAIL_TEST_ORIGIN = base;
  t.after(() => { if (before === undefined) delete process.env.EPOMAIL_TEST_ORIGIN; else process.env.EPOMAIL_TEST_ORIGIN = before; });
  const { legacyFetch } = await import(moduleUrl);
  assert.equal(await (await legacyFetch('/local',{method:'POST',body:'fixture'})).text(), 'POST fixture');
  await assert.rejects(legacyFetch(other),/outside the isolated/);
  await assert.rejects(legacyFetch('/redirect'),/outside the isolated/);
  assert.equal((await legacyFetch('/redirect',{redirect:'manual'})).status,302);
  assert.equal(deniedHits,0);
});

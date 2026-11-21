import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from '../mail-worker/src/utils/jwt-utils.js';

const context = () => ({ env: { jwt_secret: crypto.randomUUID() } });
const purpose = { purpose: 'verification-key-test' };

test('only the imported verify key is reused; signatures and expirations stay live', async t => {
  const owner = context();
  const token = await jwt.generateToken(owner, purpose, 300);
  const wrongSigner = await jwt.generateToken(context(), purpose, 300);
  const expired = await jwt.generateToken(owner, purpose, -1);
  const imports = t.mock.method(crypto.subtle, 'importKey');
  const verifies = t.mock.method(crypto.subtle, 'verify');

  assert.equal((await jwt.verifyToken(owner, token)).purpose, purpose.purpose);
  assert.equal(await jwt.verifyToken(owner, wrongSigner), null);
  assert.equal(await jwt.verifyToken(owner, expired), null);
  assert.equal((await jwt.verifyToken(owner, token)).purpose, purpose.purpose);
  assert.equal(verifies.mock.callCount(), 4);
  assert.equal(imports.mock.callCount(), 1);
  const key = verifies.mock.calls[0].arguments[1];
  assert.equal(key.extractable, false);
  assert.deepEqual(key.usages, ['verify']);
});

test('a failed key import is retried; rotating the configured key evicts the old key', async t => {
  const first = context();
  const second = context();
  const token = await jwt.generateToken(first, purpose);
  const other = await jwt.generateToken(second, purpose);
  const importKey = crypto.subtle.importKey.bind(crypto.subtle);
  let calls = 0;
  t.mock.method(crypto.subtle, 'importKey', (...args) => {
    if (++calls === 1) throw new Error('temporary key import failure');
    return importKey(...args);
  });
  assert.equal(await jwt.verifyToken(first, token), null);
  assert.equal((await jwt.verifyToken(first, token)).purpose, purpose.purpose);
  assert.equal(await jwt.verifyToken(second, token), null);
  assert.equal((await jwt.verifyToken(second, other)).purpose, purpose.purpose);
  assert.equal((await jwt.verifyToken(first, token)).purpose, purpose.purpose);
  assert.equal(calls, 4);
});

test('cold requests import independently and an older completion cannot evict a newer configuration', async t => {
  const first = context();
  const second = context();
  const firstToken = await jwt.generateToken(first, purpose);
  const secondToken = await jwt.generateToken(second, purpose);
  const importKey = crypto.subtle.importKey.bind(crypto.subtle);
  let release;
  const resume = new Promise(resolve => { release = resolve; });
  let calls = 0;
  t.mock.method(crypto.subtle, 'importKey', async (...args) => {
    if (++calls === 1) await resume;
    return importKey(...args);
  });
  const slow = jwt.verifyToken(first, firstToken);
  try {
    const concurrent = jwt.verifyToken(first, firstToken);
    assert.equal(calls, 2);
    assert.equal((await concurrent).purpose, purpose.purpose);
    assert.equal((await jwt.verifyToken(second, secondToken)).purpose, purpose.purpose);
  } finally {
    release();
  }
  assert.equal((await slow).purpose, purpose.purpose);
  assert.equal(await jwt.verifyToken(second, firstToken), null);
  assert.equal(calls, 3);
});

test('alternate HS256 header serialization verifies and other algorithms are rejected', async () => {
  const owner = context();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(owner.env.jwt_secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payload = Buffer.from(JSON.stringify({ ...purpose, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  async function sign(alg) {
    const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg })).toString('base64url');
    const data = header + '.' + payload;
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return data + '.' + Buffer.from(signature).toString('base64url');
  }
  assert.equal((await jwt.verifyToken(owner, await sign('HS256'))).purpose, purpose.purpose);
  assert.equal(await jwt.verifyToken(owner, await sign('HS384')), null);
});

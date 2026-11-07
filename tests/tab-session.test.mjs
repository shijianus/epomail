import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager, isSameTabIdentity } from '../mail-vue/src/utils/tab-session.js';

function storage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    get length() { return map.size; },
    key: index => [...map.keys()][index] || null,
  };
}

function setup() {
  const local = storage();
  const tabA = storage();
  const tabB = storage();
  let pathA = '/mail/u/0/';
  let pathB = '/mail/u/1/';
  let generation = 0;
  const a = createSessionManager({ localStorage: local, sessionStorage: tabA, pathname: () => pathA, randomId: () => `sid-a-${++generation}` });
  const b = createSessionManager({ localStorage: local, sessionStorage: tabB, pathname: () => pathB, randomId: () => `sid-b-${++generation}` });
  return { local, tabA, tabB, a, b, setPathA: value => { pathA = value; }, setPathB: value => { pathB = value; } };
}

test('two tabs retain independent identities while registry is shared', () => {
  const { a, b, setPathA, setPathB } = setup();
  const identityA = a.signIn({ token: 'token-a', email: 'a@example.test', userId: 11 }, { preferredSlot: 0 });
  const identityB = b.signIn({ token: 'token-b', email: 'b@example.test', userId: 22 }, { preferredSlot: 1 });
  assert.equal(a.current().token, 'token-a');
  assert.equal(b.current().token, 'token-b');
  assert.equal(a.current().u, 0);
  assert.equal(b.current().u, 1);
  setPathA('/mail/u/1/#inbox');
  assert.equal(a.current(), null, 'URL slot mismatch must fail closed');
  setPathA('/mail/u/0/#inbox');
  assert.ok(isSameTabIdentity(a.peek(), identityA));
  assert.ok(isSameTabIdentity(b.peek(), identityB));
  setPathB('/mail/u/0/#inbox');
  assert.equal(b.current(), null, 'second tab cannot borrow first tab slot');
});

test('a fresh tab can bootstrap one valid registry slot', () => {
  const { a, b, setPathB } = setup();
  a.signIn({ token: 'token-a', email: 'a@example.test', userId: 11 }, { preferredSlot: 0 });
  setPathB('/mail/u/0/#inbox');
  const identity = b.bootstrap();
  assert.equal(identity?.token, 'token-a');
  assert.equal(b.current()?.u, 0);
});
test('invalidating one identity does not revive it from shared slots', () => {
  const { a, b } = setup();
  a.signIn({ token: 'token-a', email: 'a@example.test', userId: 11 }, { preferredSlot: 0 });
  b.signIn({ token: 'token-b', email: 'b@example.test', userId: 22 }, { preferredSlot: 1 });
  const stale = a.peek();
  a.invalidate(stale);
  assert.equal(a.current(), null);
  assert.equal(a.bootstrap(), null);
  assert.equal(a.peek(), null);
  assert.equal(b.current().token, 'token-b');
});

test('stale response identity cannot invalidate a newer login', () => {
  const { a } = setup();
  const old = a.signIn({ token: 'old', email: 'a@example.test', userId: 1 }, { preferredSlot: 0 });
  a.invalidate(old);
  const fresh = a.signIn({ token: 'fresh', email: 'a@example.test', userId: 1 }, { preferredSlot: 0 });
  const result = a.invalidate(old);
  assert.equal(result.current, false);
  assert.equal(a.current().token, fresh.token);
});

test('failed persistence never adopts an ambiguous shared slot', () => {
  const { local, tabA, a } = setup();
  local.setItem('epo_sessions', JSON.stringify([
    { u: 0, sessionId: 'one', token: 'one', email: 'one@example.test' },
    { u: 0, sessionId: 'two', token: 'two', email: 'two@example.test' },
  ]));
  assert.equal(a.bootstrap(), null);
  assert.equal(tabA.getItem('epomail_tab_identity')?.includes('active'), false);
});

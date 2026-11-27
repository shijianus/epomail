import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../mail-vue/public/theme-init.js', import.meta.url), 'utf8');
for (const [label, saved, systemDark, mobile, dark] of [
  ['default', null, false, false, true],
  ['light', { themeMode: 'light' }, true, false, false],
  ['dark mobile', { themeMode: 'dark' }, false, true, true],
  ['auto light mobile', { themeMode: 'auto' }, false, true, false],
  ['system dark', { themeMode: 'system' }, true, false, true],
  ['legacy light', { dark: false }, true, false, false],
  ['broken storage', '{', false, false, true],
  ['unavailable storage', undefined, false, false, true]
]) {
  test(`external pre-paint theme: ${label}`, () => {
    const actual = {};
    runInNewContext(source, {
      localStorage: { getItem() { if (saved === undefined) throw new Error('blocked'); return typeof saved === 'object' ? JSON.stringify(saved) : saved; } },
      window: { matchMedia: query => ({ matches: query.includes('prefers-color-scheme') ? systemDark : !mobile }) },
      document: {
        documentElement: { setAttribute: (name, value) => { actual[name] = value; } },
        getElementById: () => ({ setAttribute: (name, value) => { actual[name] = value; } })
      }
    });
    assert.equal(actual.class, dark ? 'dark' : '');
    assert.equal(actual.content, dark ? (mobile ? '#141414' : '#000000') : (mobile ? '#FFFFFF' : '#F1F1F1'));
  });
}

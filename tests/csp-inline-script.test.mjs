import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

// The Worker CSP allows no inline script, so app HTML must load every script from a URL.
for (const page of ['mail-vue/index.html', 'temp_login_ui/index.html']) {
  test(`${page} has no inline <script> or inline event handlers`, async () => {
    const html = await readFile(new URL(page, root), 'utf8');
    for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
      assert.match(tag, /\ssrc=/i, `inline script in ${page}: ${tag}`);
    }
    assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=/i, `inline event handler in ${page}`);
  });
}

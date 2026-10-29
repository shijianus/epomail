import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'temp_login_ui', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('BLOCKED: temp_login_ui/dist is missing; run `npm --prefix temp_login_ui run build` first');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (pathname === '/login' || pathname === '/login/') {
    return sendFile(res, path.join(dist, 'index.html'));
  }
  if (pathname === '/logo.svg') {
    return sendFile(res, path.join(dist, 'logo.svg'));
  }
  if (pathname.startsWith('/login/')) {
    const file = path.resolve(dist, pathname.slice('/login/'.length));
    if (!file.startsWith(dist + path.sep)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return sendFile(res, file);
    }
    return sendFile(res, path.join(dist, 'index.html'));
  }
  res.writeHead(404);
  res.end('not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const PROOF = 'review-bind-proof-token';
const CLIENT_STATE = 'browser-state-1';
const BIND_URL = (state, proof = PROOF) =>
  `${base}/login/?oauth_user_id=apple%3Auser-1&oauth_provider=apple&oauth_client_state=${encodeURIComponent(state)}#oauth_bind=${encodeURIComponent(proof)}`;

function websiteConfig(overrides = {}) {
  return {
    code: 200,
    data: {
      title: 'EpoMail',
      oauthLoginEnabled: 0,
      register: 0,
      regKey: 0,
      domainList: ['example.com'],
      ...overrides
    }
  };
}

async function openPage(browser, { expectedState, config, bindResponse, bindResponses, exchangeResponse, userInfo = { email: 'bind@example.com', name: 'Bind User' } }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  const queuedBindResponses = Array.isArray(bindResponses) ? [...bindResponses] : null;
  page.on('request', (request) => {
    requests.push({ url: request.url(), method: request.method(), body: request.postData() || '' });
  });
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/setting/websiteConfig') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    }
    if (url.pathname === '/api/oauth/bindUser' && request.method() === 'PUT') {
      const next = queuedBindResponses
        ? (queuedBindResponses.length > 1 ? queuedBindResponses.shift() : queuedBindResponses[0])
        : bindResponse;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(next) });
    }
    if (url.pathname === '/api/oauth/exchange' && request.method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(exchangeResponse) });
    }
    if (url.pathname === '/api/user/info') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: userInfo })
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":404}' });
  });
  await page.route('**/mail/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>mail</body></html>' })
  );
  await page.addInitScript((state) => {
    localStorage.setItem('setting', JSON.stringify({ lang: 'en' }));
    localStorage.removeItem('loginEmail');
    sessionStorage.setItem('epo_oauth_state', state);
  }, expectedState);
  return { context, page, requests };
}

const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error.message });
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await scenario('valid bind return builds a proof-bound request and signs in', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig(),
      bindResponse: { code: 200, data: { userInfo: {}, token: 'bind-session-token' } }
    });
    try {
      const bindRequest = page.waitForRequest(
        (request) => request.url().includes('/api/oauth/bindUser') && request.method() === 'PUT'
      );
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });
      assert.ok(!page.url().includes('oauth_bind'), 'bind proof must be scrubbed from the address bar');
      assert.ok(!page.url().includes(PROOF), 'raw proof must never remain in the URL');

      await page.locator('#epo-bind-email').fill('bind@example.com');
      await page.locator('#epo-bind-code').fill('INVITE-1');
      await page.getByRole('button', { name: 'Create and link' }).click();

      const request = await bindRequest;
      assert.deepEqual(request.postDataJSON(), {
        email: 'bind@example.com',
        code: 'INVITE-1',
        oauthUserId: 'apple:user-1',
        provider: 'apple',
        bindToken: PROOF
      });

      await page.waitForFunction(() => localStorage.getItem('token') === 'bind-session-token', null, { timeout: 5000 });
      await page.waitForURL('**/mail/u/0/**', { timeout: 5000 });
      const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('epo_sessions') || '[]'));
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].email, 'bind@example.com');

      for (const seen of requests) {
        if (seen.url.includes('/api/oauth/bindUser')) continue;
        assert.ok(!seen.url.includes(PROOF), `proof leaked into URL: ${seen.url}`);
        assert.ok(!seen.body.includes(PROOF), `proof leaked into request body: ${seen.url}`);
      }
    } finally {
      await context.close();
    }
  });

  await scenario('mismatched client state is rejected before any bind request', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: 'attacker-state',
      config: websiteConfig(),
      bindResponse: { code: 200, data: { token: 'should-not-be-used' } }
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByText('The sign-in session does not match. Please restart third-party sign-in.').waitFor({ timeout: 5000 });
      assert.equal(await page.locator('#epo-bind-email').count(), 0, 'bind form must not render');
      assert.equal(
        requests.filter((request) => request.url.includes('/api/oauth/bindUser')).length,
        0,
        'no bind request may be sent'
      );
      assert.ok(!page.url().includes(PROOF), 'proof must be scrubbed even on failure');
    } finally {
      await context.close();
    }
  });

  await scenario('missing bind proof is rejected with a localized restart hint', async () => {
    const { context, page } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig(),
      bindResponse: { code: 200, data: { token: 'should-not-be-used' } }
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE, ''));
      await page.getByText('This linking proof has expired. Please restart third-party sign-in.').waitFor({ timeout: 5000 });
      assert.equal(await page.locator('#epo-bind-email').count(), 0, 'bind form must not render');
    } finally {
      await context.close();
    }
  });

  await scenario('MFA challenge after binding hands off to the TOTP stage', async () => {
    const { context, page } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig(),
      bindResponse: {
        code: 200,
        data: {
          userInfo: {},
          token: null,
          mfa: {
            mfaRequired: true,
            tempToken: 'temp-token',
            email: 'bind@example.com',
            hasTotp: true,
            hasBackupCodes: true,
            hasPasskeys: false
          }
        }
      }
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });
      await page.locator('#epo-bind-email').fill('bind@example.com');
      await page.locator('#epo-bind-code').fill('INVITE-1');
      await page.getByRole('button', { name: 'Create and link' }).click();
      await page.getByText('Two-Factor Authentication').first().waitFor({ timeout: 5000 });
      const token = await page.evaluate(() => localStorage.getItem('token'));
      assert.equal(token, null, 'no session token may be stored before MFA completes');
    } finally {
      await context.close();
    }
  });

  await scenario('a policy rejection keeps the proof and lets the user correct the invite code', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig(),
      bindResponses: [
        { code: 400, message: 'notExistRegKey' },
        { code: 200, data: { userInfo: {}, token: 'retry-session-token' } }
      ]
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });
      await page.locator('#epo-bind-email').fill('bind@example.com');
      await page.locator('#epo-bind-code').fill('WRONG-CODE');
      await page.getByRole('button', { name: 'Create and link' }).click();

      // 400 means the server rejected the request before spending the proof.
      await page.getByText('Registration code not found').waitFor({ timeout: 5000 });
      assert.equal(await page.locator('#epo-bind-email').count(), 1, 'bind form must remain for a corrected retry');
      assert.equal(await page.getByRole('button', { name: 'Create and link' }).count(), 1);

      // Correct the invite code and resubmit the SAME proof (kept in memory).
      await page.locator('#epo-bind-code').fill('INVITE-1');
      await page.getByRole('button', { name: 'Create and link' }).click();
      await page.waitForFunction(() => localStorage.getItem('token') === 'retry-session-token', null, { timeout: 5000 });

      const bindRequests = requests.filter((request) => request.url.includes('/api/oauth/bindUser'));
      assert.equal(bindRequests.length, 2, 'the corrected retry must reuse the original proof in place');
      assert.equal(JSON.parse(bindRequests[0].body).bindToken, PROOF);
      assert.equal(JSON.parse(bindRequests[1].body).bindToken, PROOF);
      assert.equal(JSON.parse(bindRequests[1].body).code, 'INVITE-1');
    } finally {
      await context.close();
    }
  });

  await scenario('a spent proof returns to sign-in instead of allowing futile retries', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig(),
      bindResponse: { code: 409, message: 'OAuth bind proof was already used; restart the OAuth login flow' }
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });
      await page.locator('#epo-bind-email').fill('bind@example.com');
      await page.locator('#epo-bind-code').fill('INVITE-1');
      await page.getByRole('button', { name: 'Create and link' }).click();
      await page.getByText('This linking proof has expired. Please restart third-party sign-in.').waitFor({ timeout: 5000 });
      await page.locator('#epo-bind-email').waitFor({ state: 'detached', timeout: 5000 });
      assert.equal(await page.locator('#epo-bind-email').count(), 0, 'consumed proof must not be retried in place');
      assert.equal(await page.getByRole('button', { name: 'Initiate Login' }).count(), 1, 'sign-in form must return');
      assert.equal(
        requests.filter((request) => request.url.includes('/api/oauth/bindUser')).length,
        1,
        'exactly one bind request may be sent'
      );
    } finally {
      await context.close();
    }
  });

  await scenario('an already bound identity confirms the final state and returns to sign-in', async () => {
    const { context, page } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig(),
      bindResponse: { code: 200, data: { userInfo: {}, token: null, alreadyBound: true } }
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });
      await page.locator('#epo-bind-email').fill('bind@example.com');
      await page.locator('#epo-bind-code').fill('INVITE-1');
      await page.getByRole('button', { name: 'Create and link' }).click();
      await page.getByText('This third-party identity is now linked. Please sign in again.').waitFor({ timeout: 5000 });
      await page.locator('#epo-bind-email').waitFor({ state: 'detached', timeout: 5000 });
      assert.equal(await page.locator('#epo-bind-email').count(), 0, 'the bind form must close');
      assert.equal(await page.getByRole('button', { name: 'Initiate Login' }).count(), 1, 'sign-in form must return');
      assert.equal(await page.evaluate(() => localStorage.getItem('token')), null, 'a spent proof must never mint a session');
    } finally {
      await context.close();
    }
  });

  await scenario('oauth_code login still validates client state and stores the session', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig({ regKey: 1 }),
      bindResponse: { code: 200, data: { token: 'unused' } },
      exchangeResponse: {
        code: 200,
        data: { token: 'oauth-session-token', userInfo: { email: 'oauth@example.com' } }
      },
      userInfo: { email: 'oauth@example.com', name: 'OAuth User' }
    });
    try {
      const exchangeRequest = page.waitForRequest(
        (request) => request.url().includes('/api/oauth/exchange') && request.method() === 'POST'
      );
      await page.goto(`${base}/login/?oauth_code=code-1&oauth_client_state=${CLIENT_STATE}`);
      const exchange = await exchangeRequest;
      assert.deepEqual(exchange.postDataJSON(), { code: 'code-1' });
      await page.waitForFunction(() => localStorage.getItem('token') === 'oauth-session-token', null, { timeout: 5000 });
      assert.equal(new URL(page.url()).searchParams.get('oauth_code'), null, 'exchange code must be scrubbed from the URL');
      const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('epo_sessions') || '[]'));
      assert.equal(sessions[0].email, 'oauth@example.com');
      assert.equal(
        requests.filter((request) => request.url.includes('/api/oauth/bindUser')).length,
        0,
        'OAuth login must not fall into the bind endpoint'
      );
    } finally {
      await context.close();
    }
  });
  await scenario('the published domain list drives the username field and composes the address', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig({ domainList: ['example.com', 'mail.example.com'] }),
      bindResponse: { code: 200, data: { userInfo: {}, token: 'domain-session-token' } }
    });
    try {
      const bindRequest = page.waitForRequest(
        (request) => request.url().includes('/api/oauth/bindUser') && request.method() === 'PUT'
      );
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });

      const domainSelect = page.getByLabel('Email domain');
      await domainSelect.waitFor({ timeout: 5000 });
      assert.equal(await domainSelect.inputValue(), 'example.com', 'first published domain is preselected');
      await domainSelect.selectOption('mail.example.com');

      const username = page.getByLabel('Username');
      await username.fill('alice');
      await page.locator('#epo-bind-code').fill('INVITE-1');
      // Keyboard-only submission: the implicit form submit must work from the
      // username field, not just from clicking the button.
      await username.press('Enter');

      const request = await bindRequest;
      assert.equal(request.postDataJSON().email, 'alice@mail.example.com');
      await page.waitForFunction(() => localStorage.getItem('token') === 'domain-session-token', null, { timeout: 5000 });
    } finally {
      await context.close();
    }
  });

  await scenario('invalid usernames are rejected client-side, annotated and never submitted', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig({ domainList: ['example.com'] }),
      bindResponse: { code: 200, data: { token: 'should-not-be-used' } }
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });

      const username = page.getByLabel('Username');
      await username.fill('bad name');
      await page.getByRole('button', { name: 'Create and link' }).click();

      await page.getByText('Username may only contain letters, numbers and . _ - + symbols').waitFor({ timeout: 5000 });
      assert.equal(await username.getAttribute('aria-invalid'), 'true');
      const describedBy = await username.getAttribute('aria-describedby');
      assert.equal(describedBy, 'epo-bind-email-error');
      assert.equal(await page.locator('#epo-bind-email-error').count(), 1);
      assert.equal(
        requests.filter((request) => request.url.includes('/api/oauth/bindUser')).length,
        0,
        'invalid input must not reach the bind endpoint'
      );
    } finally {
      await context.close();
    }
  });

  await scenario('a closed registration channel disables the bind action', async () => {
    const { context, page, requests } = await openPage(browser, {
      expectedState: CLIENT_STATE,
      config: websiteConfig({ register: 1 }),
      bindResponse: { code: 200, data: { token: 'should-not-be-used' } }
    });
    try {
      await page.goto(BIND_URL(CLIENT_STATE));
      await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });
      await page.getByText('Registration is currently disabled').waitFor({ timeout: 5000 });
      const submit = page.getByRole('button', { name: 'Create and link' });
      assert.equal(await submit.isDisabled(), true, 'closed registration must block submission');
      assert.equal(await submit.getAttribute('aria-describedby'), 'epo-bind-closed');
      assert.equal(
        requests.filter((request) => request.url.includes('/api/oauth/bindUser')).length,
        0
      );
    } finally {
      await context.close();
    }
  });

  for (const viewport of [
    { width: 375, height: 812, name: 'mobile' },
    { width: 1440, height: 900, name: 'desktop' }
  ]) {
    await scenario(`bind form fits the ${viewport.name} viewport (${viewport.width}px)`, async () => {
      const { context, page } = await openPage(browser, {
        expectedState: CLIENT_STATE,
        config: websiteConfig({ domainList: ['example.com', 'mail.example.com'] }),
        bindResponse: { code: 200, data: { token: 'unused' } }
      });
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(BIND_URL(CLIENT_STATE));
        await page.getByRole('heading', { name: 'Link third-party account' }).waitFor({ timeout: 5000 });

        const metrics = await page.evaluate(() => {
          const submit = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent && button.textContent.includes('Create and link')
          );
          const rect = submit ? submit.getBoundingClientRect() : null;
          return {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            submitHeight: rect ? rect.height : 0,
            submitRight: rect ? rect.right : 0,
            submitLeft: rect ? rect.left : 0
          };
        });
        assert.ok(
          metrics.scrollWidth <= metrics.innerWidth + 1,
          `horizontal overflow at ${viewport.width}px: ${metrics.scrollWidth} > ${metrics.innerWidth}`
        );
        assert.ok(metrics.submitHeight >= 44, `submit button too short: ${metrics.submitHeight}px`);
        assert.ok(metrics.submitLeft >= 0 && metrics.submitRight <= metrics.innerWidth + 1, 'submit button is off-screen');
        assert.equal(await page.getByLabel('Email domain').count(), 1);
        assert.equal(await page.getByLabel('Username').count(), 1);
      } finally {
        await context.close();
      }
    });
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

for (const result of results) {
  console.log(`${result.status} ${result.name}${result.error ? `: ${result.error}` : ''}`);
}
const failed = results.filter((result) => result.status !== 'PASS');
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length > 0) process.exit(1);

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

async function localCheck(name, scenario) {
  let step = 'initialize a disposable local mailbox';
  const phase = label => { step = label; };
  try {
    const { withLocalMailBrowser } = await import('./local-mail-browser.mjs');
    await withLocalMailBrowser({ admin: true }, (page, base) => scenario(page, base, phase));
    console.log('PASS ' + name);
  } catch (error) {
    // Playwright call logs for fill() can contain the actual password.
    console.error(`FAIL ${name} during ${step} (${error.name})`);
    process.exitCode = 1;
  }
}

async function api(page, path, method = 'GET', data) {
  const response = await page.evaluate(async ({ path, method, data }) => {
    const { token } = JSON.parse(sessionStorage.getItem('epomail_tab_identity'));
    const res = await fetch('/api/' + path, {
      method, redirect: 'error', headers: { token, 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    const json = await res.json();
    return { status: res.status, code: json.code, data: json.data };
  }, { path, method, data });
  assert.equal(response.status, 200, path);
  assert.equal(response.code, 200, path);
  return response.data;
}

async function assertInbox(page, base, email) {
  await page.waitForURL(base + '/mail/u/0/#inbox');
  const active = await page.evaluate(email => {
    const identity = JSON.parse(sessionStorage.getItem('epomail_tab_identity'));
    return identity?.status === 'active' && identity.email === email && Boolean(identity.token);
  }, email);
  assert.ok(active, 'current tab belongs to the expected account');
  await page.locator('#loading-first').waitFor({ state: 'hidden' });
  const inbox = await api(page, 'email/list?folder=inbox&size=10');
  assert.ok(Array.isArray(inbox.list), 'authenticated inbox');
}

function checkRegistration(lang) {
  return localCheck('invited registration and login (' + lang + ')', async (page, base, phase) => {
    phase('prepare invite-only registration and terms');
    const roles = await api(page, 'role/list');
    const role = roles.find(row => row.roleCode === 'user_base');
    assert.ok(role?.roleId);
    await api(page, 'setting/set', 'PUT', {
      register: 0, registerVerify: 1, regKey: 0,
      operatorName: 'Local browser tests', operatorCountry: 'US', contactEmail: 'test@example.test',
      policyVersion: 'browser-test-v1', termsUrl: 'https://policy.example.test/terms',
      privacyUrl: 'https://policy.example.test/privacy'
    });
    const code = 'invite-' + randomUUID();
    await api(page, 'regKey/add', 'POST', { code, roleId: role.roleId, count: 1, expireTime: Date.now() + 86400000 });

    phase('open localized registration from the sign-in form');
    await api(page, 'logout', 'DELETE');
    await page.evaluate(lang => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem('setting', JSON.stringify({ lang }));
    }, lang);
    await page.goto(base + '/login/');
    await page.locator('form a[href="#"]').click();
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    await page.waitForURL(base + '/login/?view=register');

    phase('submit the invite and current terms');
    const email = 'member' + randomUUID().slice(0, 8) + '@example.com';
    const password = 'Local-' + randomUUID();
    await page.locator('#epo-email').fill(email);
    await page.locator('#epo-password').fill(password);
    await page.locator('#epo-confirm-password').fill(password);
    await page.locator('#epo-code').fill(code);
    const submit = page.locator('form button[type="submit"]');
    assert.ok(await submit.isDisabled(), 'terms acceptance is required');
    await page.getByRole('checkbox').check();
    const [registered] = await Promise.all([
      page.waitForResponse(r => r.url() === base + '/api/register' && r.request().method() === 'POST'),
      submit.click()
    ]);
    assert.equal(registered.status(), 200);
    assert.equal((await registered.json()).code, 200);

    phase('sign in as the registered user and read their inbox');
    await page.waitForURL(base + '/login/');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await submit.click();
    await assertInbox(page, base, email);
  });
}

module.exports = { api, assertInbox, checkRegistration, localCheck };

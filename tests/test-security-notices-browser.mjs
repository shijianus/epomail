import assert from 'node:assert/strict';
import { withLocalMailBrowser } from './helpers/local-mail-browser.mjs';

await withLocalMailBrowser({ enablePatIssuance: true }, async page => {
  // Keep the session and one-time PAT response inside the isolated browser.
  const subject = await page.evaluate(async () => {
    const session = JSON.parse(sessionStorage.getItem('epomail_tab_identity'));
    async function api(path, options = {}) {
      const response = await fetch('/api/' + path, {
        ...options, headers: { 'Content-Type': 'application/json', token: session.token }, redirect: 'error'
      });
      const envelope = await response.json();
      if (!response.ok || envelope.code !== 200) throw new Error('Local API failed at ' + path.split('?')[0] + ' (' + response.status + '/' + Number(envelope.code) + ')');
      return envelope.data;
    }
    const list = async () => (await api('email/list?type=0&size=100')).list;
    const existing = new Set((await list()).map(row => row.emailId));
    const created = await api('my/apiTokens', {
      method: 'POST', body: JSON.stringify({ name: 'Isolated browser test', scopes: ['emails:read'], expiresInDays: 1 })
    });
    if (!created.id || !created.token) throw new Error('Missing one-time PAT');
    const listed = await api('my/apiTokens');
    if (!listed.some(row => row.id === created.id) || listed.some(row => row.token || row.tokenHash)) throw new Error('Unsafe token metadata');
    const fresh = (await list()).filter(row => !existing.has(row.emailId) && /PAT/i.test(row.subject));
    if (fresh.length !== 1) throw new Error('Expected one new PAT security email');
    const detail = await api('email/get?emailId=' + fresh[0].emailId);
    if (detail.isOfficial !== 1 || detail.sendEmail !== 'announcement@epocanvas.com') throw new Error('Invalid notice provenance');
    if ((detail.text + detail.content).includes(created.token)) throw new Error('PAT in email');
    await api('my/apiTokens/' + encodeURIComponent(created.id), { method: 'DELETE' });
    if ((await api('my/apiTokens')).some(row => row.id === created.id)) throw new Error('Token not revoked');
    return detail.subject;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(subject, { exact: true }).first().click();
  const reader = page.locator('.shadow-content').first();
  await reader.waitFor({ state: 'visible' });
  const content = await reader.innerText();
  assert.match(content, /如果是您本人|If this was you/i);
  assert.match(content, /并非您本人|If this was NOT you/i);
  assert.match(content, /announcement@epocanvas\.com/i);
  const destination = new URL(await reader.locator('a[href*="settings/security"]').first().getAttribute('href'), page.url());
  assert.equal(destination.hash, '#settings/security');
});
console.log('PASS: local PAT creation and revocation, official inbox delivery and security guidance.');

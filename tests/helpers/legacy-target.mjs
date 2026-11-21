import { assertLoopbackBase } from './load-runner.mjs';

// These credentialed historical tests must be explicitly pointed at an isolated Worker.
export const legacyOrigin = assertLoopbackBase(process.env.EPOMAIL_TEST_ORIGIN);
if (![legacyOrigin, legacyOrigin + '/'].includes(process.env.EPOMAIL_TEST_ORIGIN)) {
  throw new Error('EPOMAIL_TEST_ORIGIN must use canonical http://127.0.0.1:<port>');
}
export const legacyAdminEmail = process.env.EPOMAIL_E2E_ADMIN_EMAIL || 'admin@example.com';
export const legacyUserEmail = process.env.EPOMAIL_E2E_USER_EMAIL || 'user@example.com';

function checkedUrl(value) {
  const url = new URL(value, legacyOrigin);
  if (url.origin !== legacyOrigin || url.username || url.password) {
    throw new Error('Refusing a request outside the isolated test origin');
  }
  return url;
}

export async function legacyFetch(input, options) {
  let req = new Request(input instanceof Request ? input : checkedUrl(input), options);
  const redirect = req.redirect;
  for (let hop = 0; hop <= 10; hop++) {
    checkedUrl(req.url);
    const response = await globalThis.fetch(req.clone(), { redirect: 'manual' });
    if (redirect === 'manual' || ![301, 302, 303, 307, 308].includes(response.status) || !response.headers.has('location')) return response;
    await response.body?.cancel();
    if (redirect === 'error') throw new Error('Unexpected redirect in the isolated test');
    const next = checkedUrl(new URL(response.headers.get('location'), req.url));
    const asGet = (response.status === 303 && req.method !== 'HEAD') ||
      ([301, 302].includes(response.status) && req.method === 'POST');
    if (asGet) {
      const headers = new Headers(req.headers);
      for (const name of ['content-length', 'content-type', 'content-encoding', 'content-language', 'content-location']) headers.delete(name);
      req = new Request(next, { method: 'GET', headers, signal: req.signal });
    } else {
      req = new Request(next, req);
    }
  }
  throw new Error('Too many redirects in the isolated test');
}

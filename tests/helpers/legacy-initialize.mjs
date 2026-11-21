import { legacyFetch, legacyOrigin } from './legacy-target.mjs';

export async function initializeLegacyStack() {
  const secret = process.env.EPOMAIL_E2E_INIT_SECRET;
  if (!secret) throw new Error('Set EPOMAIL_E2E_INIT_SECRET for the disposable local Worker');
  const response = await legacyFetch(legacyOrigin + '/api/init', {
    method: 'POST', redirect: 'error', headers: { 'x-init-secret': secret }
  });
  // An initial development boot can also return a one-time password.
  if (response.status !== 200 || (await response.text()).split('\n', 1)[0] !== 'success') {
    throw new Error('Disposable Worker initialization failed (HTTP ' + response.status + ')');
  }
}

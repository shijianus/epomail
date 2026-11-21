// The Worker suite exercises the encryption binding, password generator, session
// revocation, MFA lockout and backup-code replacement against disposable D1/KV.
import { runWorkerSpecs } from './helpers/local-login-browser.mjs';

runWorkerSpecs(['test/totp-backend-fixes.spec.js']);

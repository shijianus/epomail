// The generated setup secret and recovery codes stay in disposable local Worker storage.
import { runWorkerSpecs } from './helpers/local-login-browser.mjs';
runWorkerSpecs(['test/totp-backend-fixes.spec.js', 'test/totp-passkey-errors.spec.js']);

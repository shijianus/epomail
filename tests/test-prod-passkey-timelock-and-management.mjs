// Exercise passkey activation, proof binding and factor management on disposable local Workers.
import { runWorkerSpecs } from './helpers/local-login-browser.mjs';
runWorkerSpecs(['test/auth-security-operation.spec.js', 'test/totp-passkey-errors.spec.js', 'test/security-review-round2.spec.js']);

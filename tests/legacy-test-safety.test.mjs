import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const directory = fileURLToPath(new URL('./', import.meta.url));
const self = fileURLToPath(import.meta.url);

async function checkDirectory(dir, findings) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) { await checkDirectory(path, findings); continue; }
    if (!item.isFile() || path === self || !/\.(?:[cm]?js|ts|py|sh)$/.test(item.name)) continue;
    const source = await readFile(path, 'utf8');
    const lines = source.split('\n');
    const report = (kind, at) => findings.push(relative(directory, path) + ':' + (at + 1) + ' ' + kind);
    const remoteD1 = /--remote\b/.test(source);
    const networkTarget = /EPOMAIL_LIVE_E2E_TARGET|(?:const|let)\s+(?:BASE|BASE_URL|API)\s*=.*https:\/\//.test(source);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (networkTarget && /\btotp\s*:\s*0\b/.test(line) && /api\/setting\/set/.test(source)) report('remote site-wide MFA change', i);
      if (networkTarget && /\/api\/user\/purgeEmails/.test(line) && !/^\s*\/\//.test(line) && /(?:post|fetch)\s*\(/i.test(line)) report('remote mailbox purge', i);
      if (remoteD1 && /UPDATE\s+user\s+SET\s+totp_enabled\s*=/i.test(line)) report('remote MFA change', i);
      if (remoteD1 && /DELETE\s+FROM\s+email\b[^;\n]*(?:email_id\s*[<>]|\bLIKE\s*['"]%)/i.test(line)) report('remote range deletion', i);
      if (!/(?:console\.\w+\(|throw new Error\(|assert\.\w+\()/.test(line)) continue;
      const rawEnvelope = /JSON\.stringify\(\s*\w*(?:login|auth|pat|token)\w*(?:data|json|result|response|body)\s*\)/i.test(line);
      const genericLogin = /JSON\.stringify\(\s*(?:data|json|body)\s*\)/.test(line) &&
        /\/api\/login\b/.test(lines.slice(Math.max(0, i - 10), i).join('\n'));
      const rawConsole = /console\.\w+\([^\n]*,\s*(?:\w*(?:login|auth|pat|token)\w*(?:data|json|result|response|body)|token|secret|password|backupCodes)\s*\)/i.test(line);
      const secretFragment = /console\.\w+\([^\n]*(?:\b\w*(?:token|secret)\.(?:slice|substring)\(0,\s*\d+|\$\{(?:secretCode|secret|otp|password|token)\})/i.test(line);
      if (rawEnvelope || genericLogin || rawConsole || secretFragment) report('credential-bearing diagnostic', i);
    }
  }
}

test('test commands avoid remote MFA edits, range deletion and raw credential diagnostics', async () => {
  const findings = [];
  await checkDirectory(directory, findings);
  assert.deepEqual(findings.sort(), [], 'Remove the listed unsafe test operations or diagnostics');
});

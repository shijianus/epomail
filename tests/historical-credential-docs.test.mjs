import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = JSON.parse(readFileSync(new URL('../.secret-scan-baseline.json', import.meta.url))).allow;
const retired = new Set(baseline.filter(row => !row.path).map(row => row.fingerprint));
const fingerprint = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
const credentialContext = /(?:\b(?:admin|visitor|password|jwt_secret|totp_enc_key|clientSecret)\b|\/init\/|密码|口令|登录|登入|登陆|凭据|密钥)/i;

test('operator documents omit known historical credential values while retaining their incident records', () => {
  const paths = execFileSync('git', ['ls-files', '-z', '--', '*.md', 'CHECKLIST.log'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  const findings = [];
  for (const path of paths) {
    const lines = readFileSync(root + path, 'utf8').split('\n');
    lines.forEach((line, number) => {
      // Short, common numeric inputs still occur in phone-format and OTP examples.
      const tokens = new Set(line.match(/[A-Za-z0-9_!@#$%^&*+=:.|-]{6,}/g) || []);
      if (credentialContext.test(line)) {
        for (const digits of line.match(/(?<![\w])\d{6}(?![\w])/g) || []) tokens.add(digits);
      }
      if ([...tokens].some(value => (value.length > 6 || credentialContext.test(line)) && retired.has(fingerprint(value)))) {
        findings.push(path + ':' + (number + 1));
      }
    });
  }
  assert.deepEqual(findings, [], 'Recorded credential matches by file and line');
});

test('test scripts use disposable initialization and encryption secrets', () => {
  const paths = execFileSync('git', ['ls-files', '-z', '--', 'tests/*.mjs', 'mail-worker/test/*.js'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  const findings = [];
  for (const path of paths) {
    const lines = readFileSync(root + path, 'utf8').split('\n');
    lines.forEach((line, number) => {
      const values = [...line.matchAll(/(?:totp_enc_key|jwt_secret)['"]?\s*[:=]\s*['"]([^'"]+)['"]|\/api\/init\/(\d{6})(?!\d)/gi)];
      if (values.some(match => retired.has(fingerprint(match[1] || match[2])))) findings.push(path + ':' + (number + 1));
    });
  }
  assert.deepEqual(findings, [], 'Historical key in executable test input by file and line');
});

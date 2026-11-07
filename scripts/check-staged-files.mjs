import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sensitiveName = /(?:\.env.*|\.dev\.vars(?:\..*)?|d1_output\.json|kv_setting\.json|secret.*\.json|credentials\.json)/i;
// .gitignore 白名单 !.dev.vars.example 的对齐豁免：官方机密占位模板必须可持续维护。
// 仅豁免模板文件名本身；其内容仍会经过 scan-staged-secrets 的凭据模式扫描。
const devVarsTemplate = /(?:^|\/)\.dev\.vars\.example$/;
const providerKey = /(?:re_[a-zA-Z0-9]{24,}|sk-[a-zA-Z0-9]{24,}|AIza[0-9A-Za-z_-]{35}|[0-9]{8,10}:[a-zA-Z0-9_-]{35})/;
const publicReleaseKeys = new Set(['VITE_APP_TITLE', 'VITE_BASE_URL', 'VITE_PWA_NAME', 'VITE_OUT_DIR', 'VITE_STATIC_URL']);

export function validateStagedFile(file, content) {
  if (file === 'mail-vue/.env.release') {
    const seen = new Set();
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const entry = /^\s*([A-Z_]+)\s*=\s*([^\r\n]*)$/.exec(line);
      if (!entry || !publicReleaseKeys.has(entry[1]) || seen.has(entry[1])) {
        return 'release configuration permits only its documented public Vite keys';
      }
      seen.add(entry[1]);
    }
    if (providerKey.test(content)) return 'provider credential detected in public release configuration';
  } else if (file === '.secret-scan-baseline.json') {
    let baseline;
    try { baseline = JSON.parse(content); } catch { return 'historical scan baseline must be valid JSON'; }
    if (!baseline || typeof baseline.description !== 'string' || !baseline.description.trim() ||
        !Array.isArray(baseline.allow) || Object.keys(baseline).some(key => !['description', 'allow'].includes(key))) {
      return 'historical scan baseline requires only description and allow';
    }
    for (const entry of baseline.allow) {
      if (!entry || typeof entry.rule !== 'string' || !/^[a-z][a-z0-9_]*$/.test(entry.rule) ||
          typeof entry.fingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(entry.fingerprint) ||
          typeof entry.reason !== 'string' || !entry.reason.trim() ||
          (entry.path !== undefined && (typeof entry.path !== 'string' || !entry.path.trim() || entry.path.includes('..') || /[\\*?]/.test(entry.path))) ||
          Object.keys(entry).some(key => !['rule', 'fingerprint', 'path', 'reason'].includes(key))) {
        return 'historical scan baseline permits reviewed fingerprints and reasons, not credential values';
      }
    }
    if (providerKey.test(content)) return 'provider credential detected in historical scan baseline';
  } else if (sensitiveName.test(file) && !devVarsTemplate.test(file)) {
    return 'sensitive filename is not permitted';
  }
  return null;
}

export function inspectStagedChanges(cwd = process.cwd()) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const files = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
  const failures = [];
  for (const file of files) {
    const reason = validateStagedFile(file, git(['show', `:${file}`]));
    if (reason) failures.push(`${file}: ${reason}`);
  }
  const additions = git(['diff', '--cached', '--unified=0']).split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'));
  if (additions.some(line => providerKey.test(line))) failures.push('provider credential detected in staged additions');
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const failures = inspectStagedChanges();
    failures.forEach(failure => console.error(`FAIL ${failure}`));
    if (!failures.length) console.log('PASS staged filename, public configuration and provider-key checks');
    process.exitCode = failures.length ? 1 : 0;
  } catch (error) {
    console.error(`FAIL unable to inspect the index: ${error.code || error.name}`);
    process.exitCode = 1;
  }
}

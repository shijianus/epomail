#!/usr/bin/env node
/** Local production configuration/build preflight with optional read-only HTTPS probes. */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseToml } from './lib/oauth-staging.mjs';
import { validateBaseOrigin } from './check-privacy-readiness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const workerDir = path.join(rootDir, 'mail-worker');
const distDir = path.join(workerDir, 'dist');
const wranglerPath = path.join(workerDir, 'wrangler.toml');

export const MANDATORY_SECRETS = [
  { name: 'jwt_secret', desc: 'JWT HS256 签名与对象签名主键', critical: true },
  { name: 'totp_enc_key', desc: 'TOTP 密钥与敏感凭证 AES-256-GCM 主密钥', critical: true },
  { name: 'oauth_client_enc_key', desc: 'OAuth 凭证及用户 Telegram Bot Token 的 AES-256-GCM 信封密钥', critical: true },
  { name: 'email_enc_key', desc: '邮件密文静态存储加密密钥', critical: true },
  { name: 'init_secret', desc: '独立系统初始化与架构升级鉴权头 (x-init-secret)', critical: true },
  { name: 'scheduled_secret', desc: '独立的外部调度密钥', critical: false },
  { name: 'resend_webhook_secret', desc: 'Resend Webhook Svix 验签密钥', critical: false },
  { name: 'admin_initial_password', desc: '首次部署时初始化站长管理员强口令 (≥8 位)', critical: true }
];

export function parseArgs(argv) {
  const result = { help: false, json: false, baseUrl: '' };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--base-url' || arg.startsWith('--base-url=')) {
      const value = arg === '--base-url' ? argv[++i] : arg.slice('--base-url='.length);
      if (!value || value.startsWith('-')) throw new Error('--base-url requires an origin');
      result.baseUrl = value;
    } else {
      // Do not echo unknown arguments, which may contain an old inline secret.
      throw new Error('Unsupported option. Run with --help for supported flags.');
    }
  }
  return result;
}

export class CheckSuite {
  constructor(options = {}) {
    this.results = [];
    this.isJson = options.json || false;
  }

  pass(id, title, detail = '') {
    this.results.push({ id, status: 'PASS', title, detail });
    if (!this.isJson) console.log(`\x1b[32m[PASS]\x1b[0m ${id}: ${title}${detail ? ` (${detail})` : ''}`);
  }

  fail(id, title, detail = '') {
    this.results.push({ id, status: 'FAIL', title, detail });
    if (!this.isJson) console.log(`\x1b[31m[FAIL]\x1b[0m ${id}: ${title}${detail ? ` -> ${detail}` : ''}`);
  }

  warn(id, title, detail = '') {
    this.results.push({ id, status: 'WARN', title, detail });
    if (!this.isJson) console.log(`\x1b[33m[WARN]\x1b[0m ${id}: ${title}${detail ? ` (${detail})` : ''}`);
  }

  info(id, title, detail = '') {
    this.results.push({ id, status: 'INFO', title, detail });
    if (!this.isJson) console.log(`\x1b[36m[INFO]\x1b[0m ${id}: ${title}${detail ? ` (${detail})` : ''}`);
  }

  hasFailures() {
    return this.results.some(r => r.status === 'FAIL');
  }

  toJSON() {
    return this.results;
  }
}

export function checkGitStatus(suite) {
  try {
    const headHash = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
    const shortHash = headHash.slice(0, 7);
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();

    if (status) {
      suite.fail('GIT-01', '工作树存在未提交改动', `${status.split('\n').length} 项改动`);
    } else {
      suite.pass('GIT-01', '工作树整洁度 (Clean Working Tree)', `Branch: ${branch}, Hash: ${shortHash}`);
    }
    return { headHash, shortHash, branch };
  } catch (err) {
    suite.fail('GIT-01', '无法读取 Git 仓库状态', err.message);
    return null;
  }
}

export function checkBuildArtifacts(suite, directory = distDir) {
  const mainIndex = path.join(directory, 'index.html');
  const loginIndex = path.join(directory, 'login/index.html');
  const swFile = path.join(directory, 'sw.js');

  if (fs.existsSync(mainIndex) && fs.statSync(mainIndex).size > 200) {
    suite.pass('BUILD-01', '前端核心资源已生成', `size: ${fs.statSync(mainIndex).size} bytes`);
  } else {
    suite.fail('BUILD-01', '前端核心构建产物缺失 (mail-worker/dist/index.html)');
  }

  if (fs.existsSync(loginIndex) && fs.statSync(loginIndex).size > 200) {
    suite.pass('BUILD-02', '独立登录子应用产物已同步', `size: ${fs.statSync(loginIndex).size} bytes`);
  } else {
    suite.fail('BUILD-02', '独立登录子应用缺失 (mail-worker/dist/login/index.html)');
  }

  if (fs.existsSync(swFile)) {
    suite.pass('BUILD-03', 'Service Worker 离线套件已构建', 'dist/sw.js');
  } else {
    suite.fail('BUILD-03', '未找到 Service Worker 离线套件 (dist/sw.js)');
  }
}

export function checkWranglerConfig(suite, configPath = wranglerPath) {
  let config;
  try {
    config = parseToml(fs.readFileSync(configPath, 'utf8'));
  } catch (_) {
    suite.fail('CFG-01', '无法读取 Wrangler 配置');
    return;
  }

  const production = config.env?.production || config;
  const vars = production.vars || {};
  if (String(vars.ENVIRONMENT) === 'production') {
    suite.pass('CFG-01', '生产环境标识已显式固定为 production');
  } else {
    suite.fail('CFG-01', '生产 [vars] 必须显式声明 ENVIRONMENT = \"production\"');
  }

  if (String(vars.ALLOW_URL_INIT) === 'false') {
    suite.pass('CFG-02', '生产配置明确禁用 URL 初始化');
  } else {
    suite.fail('CFG-02', '生产 [vars] 必须显式禁用 URL 初始化');
  }

  const hasBinding = (entries, binding, id, format) =>
    Array.isArray(entries) && entries.filter(entry => entry.binding === binding).length === 1
    && entries.some(entry => entry.binding === binding && format.test(entry[id] || ''));
  const d1Id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (['USER_DB', 'MAIL_DB', 'db'].every(binding =>
    hasBinding(production.d1_databases, binding, 'database_id', d1Id))
    && hasBinding(production.kv_namespaces, 'kv', 'id', /^[a-f0-9]{32}$/i)) {
    suite.pass('CFG-03', '生产 D1 和 KV 绑定齐全且格式有效');
  } else {
    suite.fail('CFG-03', '生产 D1 或 KV 绑定缺失、重复或格式无效');
  }

  const sections = [config, vars, ...Object.values(config.env || {}).flatMap(env => [env, env.vars || {}])];
  const hardcoded = MANDATORY_SECRETS.filter(({ name }) =>
    sections.some(section => Object.keys(section).some(key => key.toLowerCase() === name)));
  if (hardcoded.length) {
    suite.fail('CFG-04', 'Wrangler 配置声明了机密字段', hardcoded.map(({ name }) => name).join(', '));
  } else {
    suite.pass('CFG-04', 'Wrangler 配置未声明已知机密字段');
  }

  if (['true', 'false'].includes(String(vars.EMAIL_OUTBOUND_ENABLED))) {
    suite.pass('CFG-05', '生产外发开关已显式配置', String(vars.EMAIL_OUTBOUND_ENABLED));
  } else {
    suite.fail('CFG-05', '生产 [vars] 必须显式配置外发开关');
  }
}

export async function runLiveProbes(baseUrl, suite, request = fetch) {
  let origin;
  try {
    origin = validateBaseOrigin(baseUrl);
  } catch (_) {
    suite.fail('LIVE-01', '在线探针要求 HTTPS origin 或 HTTP 本地回环');
    return;
  }

  const get = pathname => request(new URL(pathname, origin), {
    redirect: 'error', signal: AbortSignal.timeout(8000)
  });
  try {
    const response = await get('/api/setting/websiteConfig');
    const data = response.ok ? await response.json() : null;
    if (data?.code !== 200 || !data.data || Array.isArray(data.data)
      || typeof data.data.oauthLoginEnabled !== 'number'
      || !data.data.oauthProviders || typeof data.data.oauthProviders !== 'object') {
      throw new Error('Invalid public config response');
    }
    suite.pass('LIVE-02', '公开配置返回预期 JSON');
  } catch (_) {
    suite.fail('LIVE-02', '公开配置不可用或响应不符合契约');
  }

  try {
    const response = await get('/login/');
    if (!response.ok || !/text\/html/i.test(response.headers.get('Content-Type') || '')) {
      throw new Error('Invalid login page response');
    }
    const html = await response.text();
    const moduleScript = [...html.matchAll(/<script\b[^>]*>/gi)]
      .find(([tag]) => /\btype=["']module["']/.test(tag));
    const source = moduleScript?.[0].match(/\bsrc=["']([^"']+)["']/)?.[1];
    const asset = source && new URL(source, new URL('/login/', origin));
    if (!asset || asset.origin !== origin || !asset.pathname.startsWith('/login/')
      || !asset.pathname.endsWith('.js')) throw new Error('Invalid login asset');
    const script = await get(asset.pathname);
    if (!script.ok || !/(javascript|ecmascript)/i.test(script.headers.get('Content-Type') || '')) {
      throw new Error('Login asset unavailable');
    }
    await script.body?.cancel();
    suite.pass('LIVE-04', '独立登录页面和脚本可访问');
  } catch (_) {
    suite.fail('LIVE-04', '独立登录页面或脚本不可用');
  }
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: node scripts/verify-production-readiness.mjs [--json] [--base-url <origin>]\n'
      + 'Checks local build/configuration and optionally runs read-only GET probes. '
      + 'This is one release check, not a public beta decision.');
    process.exit(0);
  }

  const suite = new CheckSuite({ json: args.json });

  if (!args.json) {
    console.log('\n=============================================================');
    console.log('🚀 EpoMail 生产发布全量门禁与上线就绪核验套件 (Pre-Flight Suite)');
    console.log('=============================================================\n');
  }

  // 1. Git 状态
  const gitInfo = checkGitStatus(suite);

  // 2. 构建产物完整性
  checkBuildArtifacts(suite);

  // 3. 部署配置核验
  checkWranglerConfig(suite);

  // 4. 在线探针 (若指定)
  if (args.baseUrl) {
    await runLiveProbes(args.baseUrl, suite);
  }

  const summary = {
    timestamp: new Date().toISOString(),
    check: 'production-preflight',
    result: suite.hasFailures() ? 'FAIL' : 'PASS',
    liveProbes: args.baseUrl ? 'REQUESTED' : 'NOT_RUN',
    git: gitInfo,
    passed: suite.results.filter(r => r.status === 'PASS').length,
    failed: suite.results.filter(r => r.status === 'FAIL').length,
    warned: suite.results.filter(r => r.status === 'WARN').length,
    info: suite.results.filter(r => r.status === 'INFO').length,
    results: suite.toJSON()
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('\n-------------------------------------------------------------');
    console.log(`核验结果总计: PASS=${summary.passed} FAIL=${summary.failed} WARN=${summary.warned} INFO=${summary.info}`);
    if (suite.hasFailures()) {
      console.log('❌ [PREFLIGHT FAILED] 生产预检失败\n');
    } else {
      console.log('✅ [PREFLIGHT PASSED] 本次预检通过。公测结论由完整验收证据决定。\n');
    }
  }

  process.exit(suite.hasFailures() ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}

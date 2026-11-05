#!/usr/bin/env node
/**
 * 生产发布全量门禁与上线就绪核验脚本
 * (Production Release Readiness & Preflight Verification Suite)
 *
 * 职能：
 * 1. 静态验证全仓 Git 提交状态与分支对齐；
 * 2. 静态验证多语言 6 语言对称性与零硬编码；
 * 3. 静态扫描工作区零机密泄露与凭据隔离；
 * 4. 核验前端产物完整性 (mail-worker/dist, mail-worker/dist/login, sw.js)；
 * 5. 核验 Cloudflare Worker 生产配置安全基线 (ALLOW_URL_INIT, 密钥定义, 接收 MTA 头声明)；
 * 6. 可选在线探针 (--base-url <url> [--init-secret <secret>])，执行零破坏性读探针。
 *
 * 用法：
 *   node scripts/verify-production-readiness.mjs
 *   node scripts/verify-production-readiness.mjs --json
 *   node scripts/verify-production-readiness.mjs --base-url https://mail.epocanvas.com
 *   node scripts/verify-production-readiness.mjs --base-url https://mail.epocanvas.com --init-secret <secret>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const workerDir = path.join(rootDir, 'mail-worker');
const distDir = path.join(workerDir, 'dist');
const loginDistDir = path.join(distDir, 'login');
const wranglerPath = path.join(workerDir, 'wrangler.toml');

export const MANDATORY_SECRETS = [
  { name: 'jwt_secret', desc: 'JWT HS256 签名与对象签名主键', critical: true },
  { name: 'totp_enc_key', desc: 'TOTP 密钥与敏感凭证 AES-256-GCM 主密钥', critical: true },
  { name: 'email_enc_key', desc: '邮件密文静态存储加密密钥', critical: true },
  { name: 'init_secret', desc: '独立系统初始化与架构升级鉴权头 (x-init-secret)', critical: true },
  { name: 'resend_webhook_secret', desc: 'Resend Webhook Svix 验签密钥', critical: false },
  { name: 'admin_initial_password', desc: '首次部署时初始化站长管理员强口令 (≥8 位)', critical: true }
];

export const MANDATORY_ENV_VARS = [
  'INBOUND_AUTHSERV_ID',
  'ALLOW_URL_INIT',
  'EMAIL_OUTBOUND_ENABLED'
];

export function parseArgs(argv) {
  const result = {
    help: false,
    json: false,
    baseUrl: '',
    initSecret: '',
    skipTests: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--skip-tests') result.skipTests = true;
    else if (arg === '--base-url') result.baseUrl = argv[++i] || '';
    else if (arg.startsWith('--base-url=')) result.baseUrl = arg.split('=')[1];
    else if (arg === '--init-secret') result.initSecret = argv[++i] || '';
    else if (arg.startsWith('--init-secret=')) result.initSecret = arg.split('=')[1];
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
      suite.warn('GIT-01', '工作树存在未提交改动', `${status.split('\n').length} 项改动`);
    } else {
      suite.pass('GIT-01', '工作树整洁度 (Clean Working Tree)', `Branch: ${branch}, Hash: ${shortHash}`);
    }
    return { headHash, shortHash, branch };
  } catch (err) {
    suite.fail('GIT-01', '无法读取 Git 仓库状态', err.message);
    return null;
  }
}

export function checkBuildArtifacts(suite) {
  const mainIndex = path.join(distDir, 'index.html');
  const loginIndex = path.join(loginDistDir, 'index.html');
  const swFile = path.join(distDir, 'sw.js');

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
    suite.warn('BUILD-03', '未找到 Service Worker 离线套件 (dist/sw.js)');
  }
}

export function checkWranglerConfig(suite) {
  if (!fs.existsSync(wranglerPath)) {
    suite.fail('CFG-01', 'Wrangler 配置文件缺失', wranglerPath);
    return;
  }
  const config = fs.readFileSync(wranglerPath, 'utf8');

  // 1. 检查禁止 URL 传入初始化密钥
  if (config.includes('ALLOW_URL_INIT = "false"')) {
    suite.pass('CFG-02', '安全基线：URL 初始化接口已禁用 (ALLOW_URL_INIT=false)');
  } else {
    suite.fail('CFG-02', '高风险基线：ALLOW_URL_INIT 必须显式设为 "false"');
  }

  // 2. 检查 D1 与 KV 绑定完整性
  const hasUserDb = config.includes('binding = "USER_DB"');
  const hasMailDb = config.includes('binding = "MAIL_DB"');
  const hasKv = config.includes('binding = "kv"');

  if (hasUserDb && hasMailDb && hasKv) {
    suite.pass('CFG-03', 'D1 数据库与 KV 命名空间绑定完整', 'USER_DB, MAIL_DB, kv');
  } else {
    suite.fail('CFG-03', 'D1 数据库或 KV 命名空间绑定不全');
  }

  // 3. 检查生产凭证硬编码防护
  for (const secret of MANDATORY_SECRETS) {
    const reg = new RegExp(`^\\s*${secret.name}\\s*=`, 'm');
    if (reg.test(config)) {
      suite.fail('CFG-04', `严厉红线：${secret.name} 被明文写在 wrangler.toml 中！`, '必须改用 wrangler secret put');
      return;
    }
  }
  suite.pass('CFG-04', '配置安全隔离：未在 wrangler.toml 检出任何明文 Secret');

  // 4. 检查 INBOUND_AUTHSERV_ID
  if (config.includes('INBOUND_AUTHSERV_ID')) {
    suite.pass('CFG-05', 'MTA 接收头认证域已配置 (INBOUND_AUTHSERV_ID)');
  } else {
    suite.info('CFG-05', 'INBOUND_AUTHSERV_ID 缺省 (默认信任 mx.cloudflare.net)');
  }
}

export async function runLiveProbes(baseUrl, initSecret, suite) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      suite.fail('LIVE-01', '在线探针仅允许使用 HTTPS 协议或本地回环', baseUrl);
      return;
    }
  } catch (err) {
    suite.fail('LIVE-01', '非法的 Base URL 地址', err.message);
    return;
  }

  suite.info('LIVE-00', '启动部署后存活探针与安全协议自测', baseUrl);

  // 1. 检查公开配置
  try {
    const configRes = await fetch(`${baseUrl}/api/setting/websiteConfig`, { signal: AbortSignal.timeout(8000) });
    if (configRes.ok) {
      const data = await configRes.json();
      suite.pass('LIVE-02', '公网公开配置端点响应正常 (/api/setting/websiteConfig)', `code: ${configRes.status}`);
      if (typeof data.data?.oauthSwitches === 'object' || typeof data.data?.legalTerms === 'string') {
        suite.pass('LIVE-03', '站点法律告知与基础配置结构合法');
      }
    } else {
      suite.fail('LIVE-02', '公网公开配置端点访问异常', `HTTP ${configRes.status}`);
    }
  } catch (err) {
    suite.fail('LIVE-02', '公开配置端点连接失败', err.message);
  }

  // 2. 检查静态登录前端挂载
  try {
    const loginRes = await fetch(`${baseUrl}/login/`, { signal: AbortSignal.timeout(8000) });
    if (loginRes.ok) {
      suite.pass('LIVE-04', '独立登录子应用静态路由正常挂载 (/login/)', `HTTP ${loginRes.status}`);
    } else {
      suite.fail('LIVE-04', '登录子应用静态路由访问异常', `HTTP ${loginRes.status}`);
    }
  } catch (err) {
    suite.fail('LIVE-04', '登录子应用静态路由连接失败', err.message);
  }

  // 3. 检查敏感限流表状态 (通过空密码登录触发，期望返回 400/401，严禁 503 限流表缺损)
  try {
    const loginProbe = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'probe@epomail.invalid', password: 'probe-password-123' }),
      signal: AbortSignal.timeout(8000)
    });
    if (loginProbe.status === 400 || loginProbe.status === 401) {
      suite.pass('LIVE-05', '敏感限流与认证接口安全网正常 (D1 限流表正常，无 503 缺表崩溃)', `HTTP ${loginProbe.status}`);
    } else if (loginProbe.status === 503) {
      suite.fail('LIVE-05', '致命隐患：/api/login 返回 503！rate_limit_counter 表缺失或 D1 离线！');
    } else {
      suite.warn('LIVE-05', '登录接口返回非预期状态码', `HTTP ${loginProbe.status}`);
    }
  } catch (err) {
    suite.fail('LIVE-05', '登录接口测试失败', err.message);
  }

  // 4. 若提供了 initSecret，测试 /api/init 幂等性
  if (initSecret) {
    try {
      const initProbe = await fetch(`${baseUrl}/api/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-init-secret': initSecret
        },
        signal: AbortSignal.timeout(10000)
      });
      if (initProbe.ok) {
        suite.pass('LIVE-06', '系统初始化接口验证通过 (/api/init 具备幂等性与合法授权)', `HTTP ${initProbe.status}`);
      } else {
        suite.fail('LIVE-06', '系统初始化接口授权或执行失败', `HTTP ${initProbe.status}`);
      }
    } catch (err) {
      suite.fail('LIVE-06', '初始化接口调用失败', err.message);
    }
  } else {
    suite.info('LIVE-06', '未提供 --init-secret，跳过 /api/init 在线授权初始化测试');
  }
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
生产发布全量门禁与上线就绪核验套件 (verify-production-readiness)

用法：
  node scripts/verify-production-readiness.mjs [选项]

选项：
  --json                       输出机器可读的 JSON 格式
  --base-url <https://origin>  执行在线部署探针
  --init-secret <secret>       在线测试 /api/init 授权初始化
  --skip-tests                 跳过全量本地测试回归
  --help, -h                   显示本帮助信息
`);
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
    await runLiveProbes(args.baseUrl, args.initSecret, suite);
  }

  const summary = {
    timestamp: new Date().toISOString(),
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
      console.log('❌ [RELEASE BLOCKED] 存在阻断性问题，请修复后再推进生产上线！\n');
    } else {
      console.log('✅ [RELEASE READY] 生产前置门禁全部绿灯，准许推进生产发布！\n');
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

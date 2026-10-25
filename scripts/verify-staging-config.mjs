/**
 * Staging 环境配置文件与安全隔离准入核验脚本
 * (Pre-Deployment Staging Configuration & Isolation Verification)
 * 
 * 作用：
 * 1. 严格检查 mail-worker/wrangler.toml 中 [env.staging] 是否存在未解析的占位符 (PLACEHOLDER_*)；
 * 2. 严格核验 staging 配置绝未引用生产 D1 ID、KV ID 或生产域名，杜绝误连生产；
 * 3. 验证安全策略标志位 (ALLOW_URL_INIT=false, EMAIL_OUTBOUND_ENABLED 等)；
 * 4. 阻止带有占位符的配置被当作真实环境部署到 Cloudflare。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const wranglerPath = path.join(rootDir, 'mail-worker', 'wrangler.toml');

console.log('🔍 [verify-staging-config] 启动 Staging 配置与资源隔离安全核验...\n');

if (!fs.existsSync(wranglerPath)) {
  console.error(`❌ 未找到配置文件: ${wranglerPath}`);
  process.exit(1);
}

const content = fs.readFileSync(wranglerPath, 'utf8');

// 提取 [env.staging] 及其所有子块
const stagingIdx = content.indexOf('[env.staging]');
if (stagingIdx === -1) {
  console.error('❌ mail-worker/wrangler.toml 中未声明 [env.staging] 配置块！');
  process.exit(1);
}

const stagingBlock = content.slice(stagingIdx);

// 生产环境绝对敏感标识指纹库 (严禁在 Staging 中出现)
const PROD_FINGERPRINTS = [
  { name: '生产 D1 数据库 ID', pattern: '542cbca1-fce5-41c5-93f2-c1d04fa919e8' },
  { name: '生产 KV 命名空间 ID', pattern: 'e708c64d291e42c3a03b896914d42575' },
  { name: '生产业务主域名 (epomail.bond)', pattern: '"epomail.bond"' },
  { name: '生产备用域名 (epomail.cyou)', pattern: '"epomail.cyou"' }
];

let hasErrors = false;
let hasPlaceholders = false;

// 1. 生产凭证污染检查
console.log('--- 1. 生产环境指纹隔离核验 ---');
for (const fp of PROD_FINGERPRINTS) {
  if (stagingBlock.includes(fp.pattern)) {
    console.error(`  ❌ [CRITICAL SAFETY FAULT] staging 配置中检测到生产资源引用: ${fp.name} (${fp.pattern})！禁止发布！`);
    hasErrors = true;
  }
}
if (!hasErrors) {
  console.log('  ✓ 隔离验证通过：未发现任何生产 D1 / KV / 域名指纹泄漏至 staging。\n');
}

// 2. 占位符检测
console.log('--- 2. 占位符与未解析资源检查 ---');
const placeholders = stagingBlock.match(/PLACEHOLDER_[A-Z0-9_]+/g) || [];
if (placeholders.length > 0) {
  hasPlaceholders = true;
  console.warn(`  ⚠️  检测到 ${placeholders.length} 个未解析的远程资源占位符：`);
  for (const ph of new Set(placeholders)) {
    console.warn(`     - ${ph}`);
  }
  console.warn('\n  ⚠️  [DEPLOYMENT GATING] 当前配置存在占位符，符合“本地准备完毕、阻止误部署至远端”的安全预期。');
} else {
  console.log('  ✓ 所有占位符均已替换为真实远程资源 ID。\n');
}

// 3. 安全基线配置核验
console.log('--- 3. 关键安全基线配置核验 ---');
if (!stagingBlock.includes('ALLOW_URL_INIT = "false"')) {
  console.error('  ❌ 缺少关键安全配置: ALLOW_URL_INIT = "false" (staging 严禁通过 URL 传主密钥初始化)');
  hasErrors = true;
} else {
  console.log('  ✓ ALLOW_URL_INIT = "false" (URL 主密钥初始化已在配置层禁用)');
}

if (!stagingBlock.includes('EMAIL_OUTBOUND_ENABLED = "false"')) {
  console.warn('  ⚠️  提示: EMAIL_OUTBOUND_ENABLED 未设为 "false"，首阶段外发未默认关闭');
} else {
  console.log('  ✓ EMAIL_OUTBOUND_ENABLED = "false" (公网邮件真实外发默认关闭)');
}

if (hasErrors) {
  console.error('\n❌ [FAILED] Staging 配置校验不通过，存在严重安全风险，禁止部署！');
  process.exit(1);
}

if (hasPlaceholders) {
  console.log('\n🔒 [LOCKED] Staging 配置核验就绪（当前为安全占位符锁闭状态，无法用于直接部署，需用户分配真实 Cloudflare 资源后更新）。');
  // 当传入 --allow-placeholders 时（例如本地自检流程）返回 0，否则在部署命令前拦截返回 2
  if (process.argv.includes('--allow-placeholders')) {
    process.exit(0);
  } else {
    process.exit(2);
  }
}

console.log('\n✅ [PASSED] Staging 配置全部核验通过，具备云端真实部署条件！');
process.exit(0);

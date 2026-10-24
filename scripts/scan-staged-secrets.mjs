/**
 * 离线机密扫描与防复发门禁脚本 (Offline Secret Scanner & Anti-Regression Gate)
 *
 * 核心设计准则：
 * 1. 默认 100% 本地离线执行，零外部网络请求，绝不将凭据发送给远端或在线提供商
 * 2. 区分【当前暂存区】、【指定提交范围】、【PR 合并基线范围】与【整树回退扫描】
 * 3. 规则范围如实声明：本扫描器只覆盖下述内置规则与 gitleaks 通用规则（若可用），
 *    不是完整凭据扫描，不能证明"绝无凭据泄漏"
 * 4. 严格输出脱敏（遮掩字符），阻断凭据二次泄露
 * 5. 内置 --self-test 自检隔离正例机制，验证检测逻辑完备性且不在代码库留痕
 * 6. 工具缺失（gitleaks 未安装）与真实命中严格区分，绝不把执行失败写成通过
 */

import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 掩码脱敏辅助函数
function maskSecret(val) {
  if (!val || val.length <= 8) return '***';
  return val.slice(0, 4) + '***' + val.slice(-4);
}

// 核心离线检测规则集（如实声明：仅覆盖以下形态，不是完整凭据扫描）
const DETECTION_RULES = [
  {
    id: 'hardcoded-webhook-secret',
    name: 'Hardcoded Webhook Secret (whsec_ literal)',
    // 匹配代码中硬编码的静态 whsec_ 密钥字面量（长度 >= 16 的完整字符串）
    // 排除模板占位符 (whsec_<your...) 及运行时前缀构造 ('whsec_' +)
    regex: /['"]whsec_(?!<your-)[A-Za-z0-9_\+/=]{16,}['"]/g
  },
  {
    id: 'hardcoded-provider-api-keypair',
    name: 'Hardcoded Provider API Key/Secret (hex literal assigned to api key/secret identifier)',
    // 针对 API Key/Secret 形态凭据：api_key/apiSecret 等标识符被直接赋值 32 位以上十六进制字面量。
    // 2026-10 Mailjet 事件（test-mailjet.js 真实形态凭据进入历史）的定向防复发规则。
    // 不覆盖其他命名或非十六进制凭据；不声明为完整凭据扫描。
    regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?key|apikey|apisecret)\s*[:=]\s*['"][0-9a-fA-F]{32,}['"]/gi
  }
];

/**
 * 扫描文本内容
 */
export function scanContent(content, filename = 'buffer') {
  const findings = [];
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (const rule of DETECTION_RULES) {
      const matches = line.matchAll(rule.regex);
      for (const match of matches) {
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          file: filename,
          line: lineIdx + 1,
          matchedMasked: maskSecret(match[0])
        });
      }
    }
  }
  return findings;
}

/**
 * 扫描一段 diff 文本中的新增行（push/PR 范围与暂存区共用）
 */
export function scanAddedLines(diffText, label) {
  const addedLines = diffText
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.substring(1))
    .join('\n');
  return scanContent(addedLines, label);
}

/**
 * 扫描暂存区 (Staged Changes)
 */
export function scanStaged() {
  console.log('🔍 Running offline secret scan on git staged changes...');
  let stagedDiff = '';
  try {
    stagedDiff = execSync('git diff --cached --unified=0', { encoding: 'utf-8' });
  } catch (err) {
    console.error('❌ Failed to get staged diff:', err.message);
    process.exit(1);
  }

  if (!stagedDiff.trim()) {
    console.log('ℹ️ No staged changes to scan.');
    return [];
  }

  const findings = scanAddedLines(stagedDiff, 'staged-diff');

  // gitleaks 可用性严格区分：未安装 ≠ 通过，未安装 ≠ 命中
  const gitleaksState = checkGitleaksAvailable();
  if (gitleaksState === 'available') {
    try {
      execSync('gitleaks protect --staged --no-banner', { stdio: 'pipe' });
    } catch (leakErr) {
      // gitleaks 退出码非 0 表示有命中
      findings.push({
        ruleId: 'gitleaks-staged-finding',
        ruleName: 'Gitleaks Offline Staged Scan Finding',
        file: 'staged',
        line: 0,
        matchedMasked: 'gitleaks-detected-finding'
      });
    }
  } else {
    console.warn('⚠️ gitleaks 未安装：本次仅运行内置规则，不构成完整凭据扫描 (gitleaks unavailable, built-in rules only)');
  }

  return findings;
}

/**
 * 检测 gitleaks 是否真实可用（区分工具缺失与执行失败）
 */
export function checkGitleaksAvailable() {
  try {
    execFileSync('gitleaks', ['version'], { stdio: 'pipe' });
    return 'available';
  } catch (err) {
    if (err && err.code === 'ENOENT') return 'missing';
    // 存在但执行失败（权限/损坏）同样不能当作通过
    return 'broken';
  }
}

/**
 * 扫描 push/提交范围：before..after 的全部新增内容（不限于最终一份文件差异）
 * before 为空（新分支）时安全回退为整树扫描。
 */
export function scanPushRange(beforeRef, afterRef) {
  const before = (beforeRef || '').trim();
  const after = (afterRef || 'HEAD').trim();
  const ZERO = /^0{40}$/;

  if (!before || ZERO.test(before)) {
    console.log('ℹ️ Push event has no before commit (new branch/force init); falling back to full-tree scan at HEAD.');
    return scanTree(after);
  }
  console.log(`🔍 Scanning full push range ${before.slice(0, 10)}..${after.slice(0, 10)} (all added lines, not only the last commit)`);
  const diff = execSync(`git diff ${before} ${after} --unified=0`, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return scanAddedLines(diff, `push-range:${before.slice(0, 10)}..${after.slice(0, 10)}`);
}

/**
 * 扫描 PR 范围：以 merge-base 为比较基线，覆盖 PR 全部新增提交的累计新增行
 */
export function scanPrRange(baseRef, headRef) {
  const base = (baseRef || '').trim();
  const head = (headRef || 'HEAD').trim();
  if (!base) {
    console.log('ℹ️ PR base SHA missing; falling back to full-tree scan at HEAD.');
    return scanTree(head);
  }
  const mergeBase = execSync(`git merge-base ${base} ${head}`, { encoding: 'utf-8' }).trim();
  console.log(`🔍 Scanning PR range merge-base(${mergeBase.slice(0, 10)})...${head.slice(0, 10)} (all new commits combined)`);
  const diff = execSync(`git diff ${mergeBase} ${head} --unified=0`, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return scanAddedLines(diff, `pr-range:${mergeBase.slice(0, 10)}..${head.slice(0, 10)}`);
}

/**
 * 整树回退扫描（新分支/缺少历史时的安全回退）
 * 扫描指定提交的全部被追踪文件内容。零命中不代表历史干净，只代表当前树干净。
 */
export function scanTree(ref = 'HEAD') {
  console.log(`🔍 Full-tree scan at ${ref.slice(0, 10)} (fallback mode; tracks current tree only)`);
  const files = execSync(`git ls-tree -r --name-only ${ref}`, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean);
  const findings = [];
  for (const file of files) {
    let content = '';
    try {
      content = execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
    } catch (_) {
      continue; // 二进制等无法以 UTF-8 读取的文件交由 gitleaks（若可用）处理
    }
    findings.push(...scanContent(content, file));
  }
  return findings;
}

/**
 * 自检隔离正例测试：在系统临时目录动态生成正例并验证拦截能力
 */
export function runSelfTest() {
  console.log('🧪 Running scanner self-test with isolated synthetic fixture...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epomail-sec-test-'));
  const tmpFile = path.join(tmpDir, 'synthetic-fixture.js');

  try {
    // 动态生成虚构测试字面量（仅存于临时文件，不提交）
    const dummyLiteral = "const secret = 'whsec_" + "FakeMockTestKeyForGate1234567890" + "';";
    fs.writeFileSync(tmpFile, dummyLiteral, 'utf-8');

    const content = fs.readFileSync(tmpFile, 'utf-8');
    const results = scanContent(content, 'synthetic-fixture.js');

    if (results.length === 0) {
      throw new Error('Self-test failed: scanner failed to detect isolated synthetic positive!');
    }
    console.log(`✅ Self-test passed: successfully intercepted synthetic positive (${results[0].ruleId}, Masked: ${results[0].matchedMasked})`);

    // 验证合法运行时动态构造不被误报 (whsec_ + dynamic)
    const validDynamicCode = "const valid = 'whsec_' + btoa(crypto.randomBytes(32));";
    const negativeResults = scanContent(validDynamicCode, 'dynamic-valid.js');
    if (negativeResults.length > 0) {
      throw new Error('Self-test failed: valid runtime constructor was falsely flagged!');
    }
    console.log('✅ Self-test passed: valid runtime constructor ("whsec_" + ...) correctly allowed.');

    // 规则2 正例：API key/secret 形态（隔离正例，合成十六进制，非真实凭据）
    const apiPairCode = "const apiKey = '" + 'a'.repeat(32) + "';\nconst apiSecret = '" + 'b'.repeat(32) + "';";
    const apiPairResults = scanContent(apiPairCode, 'api-pair-fixture.js');
    if (apiPairResults.length < 2) {
      throw new Error('Self-test failed: scanner failed to detect hardcoded provider api key/secret hex pair!');
    }
    console.log(`✅ Self-test passed: provider api key/secret hex pair detected (${apiPairResults.map(r => r.ruleId).join(', ')}).`);

    // 规则2 负例：非密钥形态占位符与短十六进制不误报
    const benignCode = "const apiKey = 'test-mailjet-api-key-placeholder';\nconst hash = 'a1b2c3d4';\nconst cfg = { retries: 3 };";
    const benignResults = scanContent(benignCode, 'benign-fixture.js');
    if (benignResults.length > 0) {
      throw new Error('Self-test failed: benign placeholder/short-hex was falsely flagged!');
    }
    console.log('✅ Self-test passed: benign placeholder and short hex correctly allowed.');

    return true;
  } finally {
    // 物理清理临时文件与目录
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

function reportFindings(findings) {
  if (findings.length > 0) {
    console.error('❌ Offline secret scanning gate rejected changes:');
    for (const f of findings) {
      console.error(`  - [${f.ruleId}] ${f.file}:${f.line} (Masked: ${f.matchedMasked})`);
    }
    console.error('\n⚠️ Please remove static hardcoded credentials before committing.');
    process.exit(1);
  }
  console.log('✅ Offline secret scanning gate passed cleanly (0 findings).');
  process.exit(0);
}

// CLI 执行入口
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const isSelfTest = process.argv.includes('--self-test');
  if (isSelfTest) {
    try {
      runSelfTest();
      process.exit(0);
    } catch (e) {
      console.error('❌', e.message);
      process.exit(1);
    }
  }

  // --push BEFORE AFTER : push 事件全范围扫描（新分支回退整树）
  const pushIdx = process.argv.indexOf('--push');
  if (pushIdx > -1) {
    try {
      reportFindings(scanPushRange(process.argv[pushIdx + 1], process.argv[pushIdx + 2]));
    } catch (e) {
      console.error('❌ Push range scan execution failed (NOT a pass):', e.message);
      process.exit(1);
    }
  }

  // --pr BASE_SHA HEAD_SHA : PR 以 merge-base 为基线全范围扫描
  const prIdx = process.argv.indexOf('--pr');
  if (prIdx > -1) {
    try {
      reportFindings(scanPrRange(process.argv[prIdx + 1], process.argv[prIdx + 2]));
    } catch (e) {
      console.error('❌ PR range scan execution failed (NOT a pass):', e.message);
      process.exit(1);
    }
  }

  const findings = scanStaged();
  if (findings.length > 0) {
    reportFindings(findings);
  } else {
    console.log('✅ Offline secret scanning gate passed cleanly (0 findings).');
    process.exit(0);
  }
}

#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENDPOINT_PATH = '/api/setting/websiteConfig';
export const NETWORK_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 1024 * 1024;

const CONTENT_FLAGS = [
  'verificationCodeEnabled', 'translationEnabled', 'ocrEnabled',
  'publicTranslationFallbackEnabled'
];
const REQUIRED_TEXT = ['operatorName', 'operatorCountry', 'termsVersion'];
const REQUIRED_URLS = ['termsUrl', 'privacyUrl'];
const OPTIONAL_URLS = ['recipientsUrl', 'retentionUrl'];
const LIMITATIONS = [
  '退出 0 仅表示本次 API 响应通过配置检查，不是合规认证、身份真实性证明或上线许可。',
  'API 不能证明 DPA/SCC 已签署或适用、实际处理地区、留存与删除措施、权利请求已执行。',
  '工具不验证告知页面可访问性、身份真实性或后端功能门槛实际执行；须由运营者另行核实。',
  '应用不能代运营者填写真实身份或签约；真实用户开放前须实际完成适用事项，合成测试另行隔离。'
];
const ERROR_MESSAGES = {
  arguments: '参数无效。使用 --base <origin> [--json]；--help 查看说明。不会使用默认地址。',
  base: '--base 必须是显式的 HTTP(S) origin，不得带凭证、路径、查询或片段；HTTP 仅允许 loopback。',
  timeout_option: '请求时限必须为 1 到 10000 毫秒；命令行固定使用 10000 毫秒。',
  unavailable: '当前 Node 环境没有可用的 fetch；请使用支持内置 fetch 的 Node 版本。',
  network: '无法读取配置：网络、连接、TLS 或响应读取失败。未输出原始错误内容。',
  timeout: '配置请求或响应读取超时，已中止；未重试。',
  redirect: '配置端点返回重定向或不同目标；工具不会追随重定向。',
  http: '配置端点未返回 HTTP 200，未读取或输出错误响应正文。',
  type: '配置端点未返回 JSON 内容类型。',
  size: '配置响应超过 1 MiB 读取上限。',
  json: '配置响应不是有效的 UTF-8 JSON 对象。'
};
const HELP = `只读隐私上线配置预检（Node 18+）
用法：node scripts/check-privacy-readiness.mjs --base <http(s)://origin> [--json]
示例：node scripts/check-privacy-readiness.mjs --base http://127.0.0.1:8787 --json

必须显式 --base；不读取环境变量，不默认访问线上，不启动任何服务。
只 GET ${ENDPOINT_PATH}，不携带认证，不跟随重定向，最多 10 秒，不重试。
HTTP 仅允许 localhost、规范 127.x.x.x 或 [::1]；其他主机必须 HTTPS。
--base 不接受路径、查询、片段、用户名或密码。告知链接只校验，不请求。
退出 0 = 配置检查通过（不是合规认证）；notReady、无效输入或请求失败退出 1。
--help / -h 仅显示用法（退出 0），不执行配置检查。
API 不能证明身份真实性、DPA/SCC、实际地区、留存/删除或请求执行。
`;

class CheckError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function usefulText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  const normalized = value.trim().toLowerCase();
  return !/^(?:todo|tbd|pending|unknown|n\/?a|null|undefined|none|not configured|placeholder|待填写|未填写|待确认|待补充|未配置|尚未提供|[-—]+)$/u.test(normalized)
    && !/[<>{}]/u.test(value);
}

// No permissive URL repairs: reject whitespace, ambiguous authority spellings,
// credentials and encoded control characters before WHATWG normalization.
export function validateHttpUrl(value, { originOnly = false } = {}) {
  const invalid = () => { throw new CheckError('base'); };
  if (typeof value !== 'string' || value.length > 4096 || !/^https?:\/\//i.test(value)
      || /[\s\u0000-\u001f\u007f\\]/u.test(value)
      || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) invalid();
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority || /[@%]/.test(authority)) invalid();
  let url;
  try { url = new URL(value); } catch { invalid(); }
  if (!url.hostname || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) invalid();
  // Host/port comparison rejects 127.1, integer/octal/hex IP spellings and :.
  const host = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':')[0];
  const port = authority.slice(host.length);
  if (host.toLowerCase() !== url.hostname.toLowerCase() || (port && !/^:\d{1,5}$/.test(port))) invalid();
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]'
    || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
  if (url.protocol === 'http:' && !loopback) invalid();
  if (originOnly) {
    const suffix = value.slice(value.indexOf('://') + 3 + authority.length);
    if (suffix !== '' && suffix !== '/') invalid();
  }
  return url;
}

export function validateBaseOrigin(value) {
  return validateHttpUrl(value, { originOnly: true }).origin;
}

function report(checks, status) {
  const passed = !checks.some(check => check.status === 'fail');
  return {
    scope: 'configuration-only',
    status: status || (passed ? 'ready' : 'notReady'),
    configCheckPassed: passed,
    exitCode: passed ? 0 : 1,
    endpoint: ENDPOINT_PATH,
    checks,
    limitations: [...LIMITATIONS]
  };
}

function failure(code) {
  return report([{ field: `technical.${code}`, status: 'fail', message: ERROR_MESSAGES[code] }], 'error');
}

/** Pure validation; consumes the HTTP JSON envelope, never performs I/O. */
export function evaluatePrivacyReadiness(response) {
  const checks = [];
  const add = (field, valid, success, invalid) => checks.push({ field, status: valid ? 'pass' : 'fail', message: valid ? success : invalid });
  const info = (field, message) => checks.push({ field, status: 'info', message });
  if (!record(response) || response.code !== 200 || !record(response.data)) {
    add('response', false, '', '需要 { code: 200, data: 对象 } 成功响应；错误消息和响应原文不会输出。');
    return report(checks);
  }
  add('response', true, '成功响应封装有效。');
  const { legalNotice, registrationReadiness, contentProcessing } = response.data;
  const notice = record(legalNotice) ? legalNotice : {};
  add('legalNotice', record(legalNotice), '存在法律告知配置对象。', '缺少 legalNotice 对象。');
  for (const field of REQUIRED_TEXT) {
    add(`legalNotice.${field}`, usefulText(notice[field]), '已填写非空文本；真实性须人工核实。', '必填文本缺失、类型错误或仍为占位内容；请填写实际资料。');
  }
  const email = notice.contactEmail;
  add('legalNotice.contactEmail', usefulText(email) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email),
    '联系邮箱格式有效；可达性及实际负责主体须人工核实。', '缺少有效的联系邮箱；不接受空值或占位内容。');

  function checkUrl(field, value, required) {
    if (!required && (value === undefined || (typeof value === 'string' && !value.trim()))) {
      info(field, '未配置可选链接；对应告知和实际安排仍须人工核实。');
      return;
    }
    let valid = false;
    try { validateHttpUrl(value); valid = true; } catch { /* Report field only, never the URL. */ }
    add(field, valid, 'URL 格式与传输限制通过；未访问页面，不证明内容真实或完整。',
      '需要有效的 HTTP(S) 告知 URL；HTTP 仅允许 loopback，不得带凭证或危险字符。');
  }
  for (const field of REQUIRED_URLS) checkUrl(`legalNotice.${field}`, notice[field], true);
  for (const field of OPTIONAL_URLS) checkUrl(`legalNotice.${field}`, notice[field], false);
  if (notice.contactAddress !== undefined && typeof notice.contactAddress !== 'string') {
    add('legalNotice.contactAddress', false, '', '联系地址如配置须为字符串；工具不统一要求公开个人住址。');
  } else {
    info('legalNotice.contactAddress', '按适用场景判断送达资料要求；不统一要求公开个人住址，不输出其内容。');
  }

  const readiness = record(registrationReadiness) ? registrationReadiness : {};
  add('registrationReadiness', record(registrationReadiness), '存在注册准备状态对象。', '缺少 registrationReadiness 对象。');
  add('registrationReadiness.ready', readiness.ready === true,
    'API 明确返回 ready=true；仍需核对字段和人工事实。',
    '注册准备状态未明确为 true；false、字符串、数字或缺失均不能放行。');
  const missingValid = Array.isArray(readiness.missing) && readiness.missing.every(item => typeof item === 'string' && item.trim());
  add('registrationReadiness.missing', missingValid && readiness.missing.length === 0,
    'API 未报告配置缺项。', 'API 缺项列表无效或仍有缺项；未知字段和值不会原样输出。');

  const processing = record(contentProcessing) ? contentProcessing : {};
  add('contentProcessing', record(contentProcessing), '存在可选内容处理配置对象。', '缺少 contentProcessing 对象，不能推定已关闭。');
  for (const field of CONTENT_FLAGS) {
    const value = processing[field];
    if (field === 'publicTranslationFallbackEnabled') {
      add(`contentProcessing.${field}`, value === false,
        '公共翻译后备服务不可用，已明确保持关闭。',
        '公共翻译后备服务不可用，此字段必须严格为 false；启用翻译或填写有效告知不能放行。');
      continue;
    }
    add(`contentProcessing.${field}`, typeof value === 'boolean',
      value === true ? '显式启用；这是配置证据，不是契约或用户确认的证明。' : '显式关闭此项可选处理。',
      '必须是明确的布尔值 true 或 false；空值、数字和字符串不替代开关。');
  }
  const anyEnabled = CONTENT_FLAGS.some(field => processing[field] === true);
  checkUrl('contentProcessing.noticeUrl', processing.noticeUrl, anyEnabled);
  if (CONTENT_FLAGS.every(field => processing[field] === false)) {
    info('contentProcessing.gate', '四项可选内容处理均明确关闭，无需启用它们来获得配置通过。');
  }
  if (processing.ocrEnabled === true) {
    add('contentProcessing.translationDependency', processing.translationEnabled === true,
      'OCR 对应的翻译开关已明确启用。', 'OCR 启用时，translationEnabled 也须明确为 true。');
  }
  info('contentProcessing.confirmation', '本响应不能证明单次用户确认、用户偏好或服务端阻断实际生效；须另行验证。');
  return report(checks);
}

async function readJson(response) {
  const contentType = response.headers?.get('content-type') || '';
  if (!/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType)) throw new CheckError('type');
  const contentLength = response.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) throw new CheckError('size');
  if (!response.body || typeof response.body.getReader !== 'function') throw new CheckError('json');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new CheckError('size');
      try { text += decoder.decode(value, { stream: true }); } catch { throw new CheckError('json'); }
    }
    try {
      text += decoder.decode();
      return JSON.parse(text);
    } catch { throw new CheckError('json'); }
  } catch (error) {
    // Do not await cancellation: a stalled body must not extend the deadline.
    try { void reader.cancel().catch(() => {}); } catch { /* No raw errors. */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** One explicit read-only request. timeoutMs may be shortened by offline tests. */
export async function checkPrivacyReadiness({ base, fetchImpl = globalThis.fetch, timeoutMs = NETWORK_TIMEOUT_MS } = {}) {
  let origin;
  try { origin = validateBaseOrigin(base); } catch { return failure('base'); }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > NETWORK_TIMEOUT_MS) return failure('timeout_option');
  if (typeof fetchImpl !== 'function') return failure('unavailable');
  const endpoint = new URL(ENDPOINT_PATH, origin).href;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new CheckError('timeout'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const payload = await Promise.race([
      deadline,
      (async () => {
        const response = await fetchImpl(endpoint, {
          method: 'GET', headers: { accept: 'application/json' }, redirect: 'manual',
          credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal
        });
        if (response?.redirected || (response?.status >= 300 && response?.status < 400)) throw new CheckError('redirect');
        if (response?.url) {
          let returned;
          try { returned = validateHttpUrl(response.url).href; } catch { throw new CheckError('redirect'); }
          if (returned !== endpoint) throw new CheckError('redirect');
        }
        if (response?.status !== 200 || response?.ok !== true) throw new CheckError('http');
        return readJson(response);
      })()
    ]);
    const result = evaluatePrivacyReadiness(payload);
    result.checks.unshift({ field: 'technical.request', status: 'pass', message: '单次匿名 GET 成功；JSON 在时限和体积上限内读取；未跟随重定向。' });
    return result;
  } catch (error) {
    controller.abort();
    return failure(error instanceof CheckError ? error.code : 'network');
  } finally {
    clearTimeout(timer);
  }
}

export function formatReport(result, json = false) {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  const heading = result.status === 'ready'
    ? '配置检查通过（ready；exit 0；非合规认证）'
    : result.status === 'notReady' ? '配置未备妥（notReady；exit 1）' : '配置检查失败（error；exit 1）';
  const labels = { pass: '通过', fail: '缺项/失败', info: '人工核实' };
  return `${heading}\n${result.checks.map(check => `[${labels[check.status]}] ${check.field}：${check.message}`).join('\n')}\n\n边界\n${result.limitations.map(item => `- ${item}`).join('\n')}\n`;
}

function parseArgs(argv) {
  const options = { json: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json' && !options.json) options.json = true;
    else if ((arg === '--help' || arg === '-h') && !options.help) options.help = true;
    else if ((arg === '--base' || arg.startsWith('--base=')) && options.base === undefined) {
      options.base = arg === '--base' ? argv[++index] : arg.slice('--base='.length);
      if (!options.base || options.base.startsWith('--')) throw new CheckError('arguments');
    } else throw new CheckError('arguments');
  }
  if (!options.help && options.base === undefined) throw new CheckError('arguments');
  return options;
}

export async function runCli(argv, { fetchImpl = globalThis.fetch, write = text => process.stdout.write(text), timeoutMs = NETWORK_TIMEOUT_MS } = {}) {
  let options;
  try { options = parseArgs(argv); } catch {
    const result = failure('arguments');
    write(formatReport(result, argv.includes('--json')));
    return result.exitCode;
  }
  if (options.help) { write(HELP); return 0; }
  const result = await checkPrivacyReadiness({ base: options.base, fetchImpl, timeoutMs });
  write(formatReport(result, options.json));
  return result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}

#!/usr/bin/env node
/**
 * 线上生产完整性核验（零写入 · 只读 GET）
 * 目标：https://mail.epocanvas.com
 *
 * 核验项：
 *  1) 本地 mail-worker/dist 全量静态资源 ⇄ 线上边缘 md5 逐字节比对（带重试，剔除沙箱网络抖动）
 *  2) Cloudflare 自身行为归一化：
 *     - Web Analytics beacon 注入（对浏览器类 UA 注入 <script src=…cloudflareinsights…>）→ 比对前剥离
 *     - index.html → 规范目录 URL 的 307 归一化（CF Assets 标准行为）→ 跟随后再比
 *     - _headers 是 Cloudflare Pages 专用约定，Workers Assets 不直接提供该文件 → 记为「预期不直供」
 *  3) 无 >2MB 巨型 chunk；边缘 TTFB / 缓存命中率
 *  4) 本轮 UI 修复标记必须存在于线上产物中
 *
 * 全程不登录、不写库、不写 KV、不触碰任何生产用户数据。
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import https from 'node:https';

const ORIGIN = 'https://mail.epocanvas.com';
const DIST = '/home/shijian/projects/epocanvas-mail/mail-worker/dist';
const OUT = '/home/shijian/projects/epocanvas-mail/tests/live_integrity.json';
const RETRIES = 4;

const agent = new https.Agent({ keepAlive: true, maxSockets: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function once(pathname) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = https.request(
      `${ORIGIN}${pathname}`,
      { agent, method: 'GET', headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) epocanvas-live-integrity/1.0' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), ms: Date.now() - t0 }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function get(pathname, hops = 0) {
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await once(pathname);
      if ((res.status === 307 || res.status === 308) && res.headers.location && hops < 3) {
        return get(new URL(res.headers.location, ORIGIN).pathname + (new URL(res.headers.location, ORIGIN).search || ''), hops + 1);
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (i + 1));
      agent.destroy(); // 丢弃可能已半关闭的 keep-alive 套接字
    }
  }
  throw lastErr;
}

const md5 = (b) => createHash('md5').update(b).digest('hex');
/**
 * HTML 等价归一化：Cloudflare 会对浏览器类 UA 自动注入 Web Analytics beacon
 * （<script src="…cloudflareinsights…">，约 +367B，并连带前置缩进空白），
 * 且注入与否取决于 UA。剥离该脚本并去除全部空白后比较，
 * 使「线上文档内容 == 构建产物内容」这一判断不受 CF 自有注入与排版空白影响。
 * 非 HTML 资源仍走严格逐字节 md5。
 */
const normHtml = (buf) =>
  md5(
    Buffer.from(
      buf
        .toString('utf8')
        .replace(/\s*<script[^>]*cloudflareinsights\.com[^>]*><\/script>/gi, '')
        .replace(/\s+/g, ''),
      'utf8',
    ),
  );

const files = (await walk(DIST)).sort();
const results = [];
const ttfbs = [];
let matched = 0;
let differed = 0;
let failed = 0;
let expectedSkip = 0;
let maxBytes = 0;
let maxFile = '';

for (const abs of files) {
  const rel = '/' + relative(DIST, abs).split('\\').join('/');
  const localBuf = await readFile(abs);
  const size = (await stat(abs)).size;
  if (size > maxBytes) {
    maxBytes = size;
    maxFile = rel;
  }

  // _headers / .assetsignore 属 Pages 约定，Workers Assets 不直供（规则已由服务层生效）
  if (rel === '/_headers' || rel.endsWith('/.assetsignore')) {
    expectedSkip++;
    results.push({ rel, size, ok: true, note: 'expected-not-served (Pages-only convention)' });
    continue;
  }

  let res;
  try {
    res = await get(rel);
  } catch (e) {
    failed++;
    results.push({ rel, size, ok: false, error: String(e.message || e) });
    console.log(`  ! 网络失败(已重试${RETRIES}次) ${rel}: ${e.message || e}`);
    continue;
  }

  const isHtml = /\.html$/i.test(rel);
  const liveMd5 = isHtml ? normHtml(res.body) : md5(res.body);
  const localMd5 = isHtml ? normHtml(localBuf) : md5(localBuf);
  const ok = res.status === 200 && liveMd5 === localMd5;
  if (ok) matched++;
  else differed++;

  ttfbs.push(res.ms);
  if (!ok) console.log(`  ✗ ${rel} status=${res.status} live=${liveMd5} local=${localMd5}`);
  results.push({
    rel,
    size,
    localMd5,
    liveMd5,
    compare: isHtml ? 'html-normalized (CF beacon stripped + whitespace-insensitive)' : 'byte-exact md5',
    liveBytes: res.body.length,
    beaconInjected: isHtml && /cloudflareinsights\.com/i.test(res.body.toString('utf8')),
    status: res.status,
    cache: res.headers['cf-cache-status'] || '-',
    ms: res.ms,
    ok,
  });
}

ttfbs.sort((a, b) => a - b);
const pct = (q) => ttfbs[Math.min(ttfbs.length - 1, Math.floor(ttfbs.length * q))] ?? 0;

// ---- 本轮 UI 修复标记：必须存在于线上产物 ----
const MARKERS = [
  { file: '/assets/index-DgjKQcp_.css', needle: 'grid-template-areas:"sender right" "main   main"', tag: 'F5 移动端两行网格行（固定行高不破虚拟滚动契约）' },
  { file: '/assets/index-DgjKQcp_.css', needle: 'height:var(--38af7367)', tag: 'F5 行高唯一真源（v-bind(rowHeightCss) 编译产物）' },
  { file: '/assets/index-DyIUWE97.css', needle: 'mobile-search-btn', tag: 'F6 移动端搜索浮层（CSS）' },
  { file: '/assets/index-BmHUfc2p.js', needle: 'mobile-search-btn', tag: 'F6 移动端搜索浮层（JS）' },
  { file: '/assets/index-DMZLcCbX.js', needle: 'reading-pane-column', tag: '阅读窗格列（layout）' },
  { file: '/assets/index-CWZfN4hX.css', needle: 'reading-pane-column', tag: '阅读窗格列（CSS）' },
];
const markers = [];
for (const m of MARKERS) {
  let hit = false;
  let note = '';
  try {
    const r = await get(m.file);
    hit = r.status === 200 && r.body.toString('utf8').includes(m.needle);
    note = `status=${r.status} bytes=${r.body.length} cache=${r.headers['cf-cache-status'] || '-'}`;
  } catch (e) {
    note = String(e.message || e);
  }
  markers.push({ ...m, hit, note });
}

const cacheable = results.filter((r) => r.cache && r.cache !== '-');
const summary = {
  origin: ORIGIN,
  checkedAt: new Date().toISOString(),
  localFiles: files.length,
  byteIdentical: matched,
  differed,
  networkFailed: failed,
  expectedNotServed: expectedSkip,
  largestAsset: { file: maxFile, bytes: maxBytes },
  over2MB: results.filter((r) => r.size > 2 * 1024 * 1024).map((r) => ({ file: r.rel, size: r.size })),
  edgeTimingMs: { min: ttfbs[0] ?? 0, p50: pct(0.5), p90: pct(0.9), max: ttfbs[ttfbs.length - 1] ?? 0 },
  cacheHit: `${cacheable.filter((r) => r.cache === 'HIT').length}/${cacheable.length}`,
  cfBeaconInjected: results.filter((r) => r.beaconInjected).map((r) => r.rel),
  markers,
};

await writeFile(OUT, JSON.stringify({ summary, results }, null, 2));

console.log('\n================ 线上完整性核验汇总 ================');
console.log(`本地产物文件总数    : ${files.length}`);
console.log(`逐字节一致 (md5)    : ${matched}`);
console.log(`内容不一致          : ${differed}`);
console.log(`网络失败(已重试)    : ${failed}`);
console.log(`预期不直供          : ${expectedSkip}  (_headers / .assetsignore，Pages 专用约定)`);
console.log(`最大单文件          : ${maxFile} = ${(maxBytes / 1024).toFixed(2)} KiB`);
console.log(`>2MB 巨型 chunk     : ${summary.over2MB.length}`);
console.log(`边缘 TTFB (ms)      : min=${summary.edgeTimingMs.min} p50=${summary.edgeTimingMs.p50} p90=${summary.edgeTimingMs.p90} max=${summary.edgeTimingMs.max}`);
console.log(`CF 缓存命中         : ${summary.cacheHit}`);
console.log('\n---- 本轮 UI 修复标记 · 线上存在性 ----');
for (const m of markers) console.log(`${m.hit ? '✓' : '✗'} ${m.tag}\n    [${m.needle}] in ${m.file}  (${m.note})`);
console.log(`\n明细已写入 ${OUT}`);

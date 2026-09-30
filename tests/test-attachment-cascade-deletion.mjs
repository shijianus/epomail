/**
 * 附件级联删除与头像存储治理核验套件 (test-attachment-cascade-deletion.mjs)
 * 对应 EpomailDocs v5.2 独立复审 P0-2（三条实体删除路径附件级联）与 P1-1（头像上传本地优先）。
 * 零假数据：静态源码断言 + 纯内存 KV mock 行为断言，不向数据库/KV 残留任何数据。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import kvObjService from '../mail-worker/src/service/kv-obj-service.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const emailServiceSrc = readFileSync(join(root, 'mail-worker/src/service/email-service.js'), 'utf8');
const userServiceSrc = readFileSync(join(root, 'mail-worker/src/service/user-service.js'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function assert(condition, name, detail = '') {
	if (condition) {
		pass++;
		console.log(`  ✓ ${name}${detail ? ` (${detail})` : ''}`);
	} else {
		fail++;
		failures.push(name);
		console.error(`  ✗ ${name}${detail ? ` (${detail})` : ''}`);
	}
}

console.log('=== §1 P0-2 三条实体删除路径附件级联 (email-service.js) ===');

// 1. clearTrashAndSpam：回收站例行清理在删邮件行前必须级联附件与星标
const trashBlock = emailServiceSrc.slice(
	emailServiceSrc.indexOf('async clearTrashAndSpam'),
	emailServiceSrc.indexOf('async receive(')
);
assert(trashBlock.includes('attService.removeByEmailIds'), '回收站 7 日例行清理级联附件对象与索引');
assert(trashBlock.includes('starService.removeByEmailIds'), '回收站 7 日例行清理级联星标');
assert(/CHUNK\s*=\s*50/.test(trashBlock) && trashBlock.includes('slice(i, i + CHUNK)'), '回收站清理按 50 分块（全站体量不超 D1 参数上限）');
const trashOrder = trashBlock.indexOf('attService.removeByEmailIds') < trashBlock.lastIndexOf('orm(c).delete(email)');
assert(trashOrder, '级联先于邮件行删除执行（去重键保护依赖 attachments 表仍在）');

// 2. 手动彻底删除与 90% 配额清理共用 cascadeDeleteEmails
const deleteFn = emailServiceSrc.slice(
	emailServiceSrc.indexOf('async delete(c, params, userId)'),
	emailServiceSrc.indexOf('async clearTrashAndSpam')
);
assert((deleteFn.match(/cascadeDeleteEmails\(/g) || []).length >= 2, '手动彻底删除与 90% 配额清理均接入 cascadeDeleteEmails');

// 3. cascadeDeleteEmails 本体：附件 + 星标 + 限定 userId 范围的行删除 + 分块（D1 参数上限）
const cascadeFn = emailServiceSrc.slice(
	emailServiceSrc.indexOf('async cascadeDeleteEmails'),
	emailServiceSrc.indexOf('updateEmailStatus(c, params)')
);
assert(cascadeFn.includes('attService.removeByEmailIds'), 'cascadeDeleteEmails 级联附件（removeByEmailIds，含去重键保护）');
assert(cascadeFn.includes('starService.removeByEmailIds'), 'cascadeDeleteEmails 级联星标');
assert(cascadeFn.includes('eq(email.userId, userId)'), 'cascadeDeleteEmails 行删除限定 userId（防越权）');
assert(/CHUNK\s*=\s*50/.test(cascadeFn) && cascadeFn.includes('slice(i, i + CHUNK)'), 'cascadeDeleteEmails 按 50 分块（inArray 不超 D1 100 参数上限）');

// 4. 全部 orm(c).delete(email) 所在函数块均处于级联保护之下（按函数块逐一核对）
const fnBlocks = emailServiceSrc.split(/\n\tasync /).slice(1);
const deleteBlocks = fnBlocks.filter(block => block.includes('orm(c).delete(email)'));
const cascadeMarkers = ['removeByEmailIds', 'removeByUserIds', 'removeByAccountId', 'cascadeDeleteEmails('];
const unprotected = deleteBlocks
	.map(block => block.slice(0, block.indexOf('(')).trim())
	.filter(fnName => {
		const block = deleteBlocks.find(b => b.slice(0, b.indexOf('(')).trim() === fnName);
		return !cascadeMarkers.some(marker => block.includes(marker));
	});
assert(deleteBlocks.length >= 6, `邮件实体删除站点共 ${deleteBlocks.length} 处已全部枚举`);
assert(unprotected.length === 0, `无未级联的邮件实体删除函数 (${deleteBlocks.length} 处: ${deleteBlocks.map(b => b.slice(0, b.indexOf('(')).trim()).join(', ')})`);

console.log('=== §2 P1-1 头像上传本地优先与可配置图床 (user-service.js) ===');

assert(!/fetch\(['"`]https:\/\/drawing\.shijian\.qzz\.io/.test(userServiceSrc), '硬编码图床域名已从 fetch 调用中移除');
assert(userServiceSrc.includes('AVATAR_UPLOAD_URL'), '头像图床经 AVATAR_UPLOAD_URL 环境变量可配置');
const avatarLocalBlock = userServiceSrc.slice(
	userServiceSrc.indexOf('AVATAR_UPLOAD_URL'),
	userServiceSrc.indexOf('async loginUserInfo')
);
assert(avatarLocalBlock.includes("kvObjService.putObj"), '缺省路径头像写实例自有对象存储（KV 兜底）');
assert(avatarLocalBlock.includes('5 * 1024 * 1024'), '本地头像 5MB 上限防护');
assert(avatarLocalBlock.includes("'/' + key"), '回显 URL 与 /static/* 读取路由对齐');

console.log('=== §3 头像对象回显行为 (kv-obj-service.getObj, 纯内存 mock) ===');

const avatarBytes = new Uint8Array([137, 80, 78, 71]).buffer; // PNG magic
const mockEnv = {
	kv: {
		getWithMetadata: async (key) => key.includes('safe')
			? { value: avatarBytes, metadata: { contentType: 'image/png', contentDisposition: 'inline', cacheControl: 'public, max-age=31536000, immutable' } }
			: { value: avatarBytes, metadata: { contentType: 'application/x-msdownload' } }
	}
};
const inlineResp = await kvObjService.getObj({ env: mockEnv }, 'safe/static/avatar/1/abc.png');
assert(inlineResp instanceof Response, 'getObj 返回标准 Response（可直接作为 /static/* 响应）');
assert((inlineResp.headers.get('Content-Type') || '') === 'image/png', '安全图片类型按原类型回显');
assert((inlineResp.headers.get('X-Content-Type-Options') || '') === 'nosniff', '附件下载防御性标头 nosniff');
assert((inlineResp.headers.get('Content-Security-Policy') || '').includes('sandbox'), '响应附 CSP sandbox');
const unsafeResp = await kvObjService.getObj({ env: mockEnv }, 'evil/static/avatar/1/evil.exe');
assert((unsafeResp.headers.get('Content-Type') || '') === 'application/octet-stream', '非白名单 MIME 强制 octet-stream');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
	console.error('失败项:', failures.join(' | '));
	process.exit(1);
}

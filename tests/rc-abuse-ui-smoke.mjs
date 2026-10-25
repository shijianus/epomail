import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST_DIR = path.resolve('mail-worker/dist');
const PORT = 8899;
let pass = 0, fail = 0;
function ok(cond, label) {
	if (cond) { pass++; console.log('  PASS ' + label); }
	else { fail++; console.log('  FAIL ' + label); }
}

function startServer() {
	const server = http.createServer((req, res) => {
		let reqPath = req.url.split('?')[0];
		if (reqPath === '/' || reqPath === '/mail' || reqPath.startsWith('/mail/')) reqPath = '/index.html';
		let filePath = path.join(DIST_DIR, reqPath);
		if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(DIST_DIR, 'index.html');
		const ext = path.extname(filePath);
		const types = { '.html': 'text/html; charset=UTF-8', '.js': 'application/javascript; charset=UTF-8', '.css': 'text/css; charset=UTF-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
		try {
			res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
			res.end(fs.readFileSync(filePath));
		} catch (_) {
			res.writeHead(404); res.end('Not found');
		}
	});
	return new Promise(resolve => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const dataset = [{
	id: 9601,
	ticketId: 'RC-UI-9601',
	email: 'dto-null@example.com',
	warningType: 'risk',
	eventType: 'generic',
	category: 'security',
	actionText: 'recorded action text',
	detailText: 'recorded detail text',
	ip: '203.0.113.9',
	geo: 'Tokyo, JP',
	device: 'Chrome',
	fingerprint: 'fp_recorded',
	baseIp: null,
	baseGeo: null,
	baseDevice: null,
	baseFingerprint: null,
	evidenceSummary: null,
	reportSource: null,
	reasonCode: null,
	timeline: null,
	banTime: null,
	priority: 'P2',
	riskLevel: 'normal',
	status: 'active',
	reportedByOthers: 0,
	clusterAccounts: [],
	createTime: '2026-10-01 12:00:00'
}];

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
await context.addInitScript(({ t }) => {
	localStorage.setItem('token', t);
	localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epocanvas.com' }]));
}, { t: 'mock-rc-admin-token' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', err => pageErrors.push(String(err)));

await page.route('**/api/my/loginUserInfo', route => route.fulfill({
	status: 200, contentType: 'application/json',
	json: { code: 200, data: { userId: 1, email: 'admin@epocanvas.com', name: 'Admin', permKeys: ['*'], role: { roleId: 1, roleCode: 'master', name: '站长' } } }
}));
await page.route('**/api/audit/list*', route => route.fulfill({
	status: 200, contentType: 'application/json',
	json: {
		code: 200,
		data: {
			list: dataset, total: 1,
			counts: { categories: { audit: { pending: 0, total: 0 }, risk: { pending: 1, total: 1 }, appeal: { pending: 0, total: 0 }, ban: { pending: 0, total: 0 } }, total: 1, allTotal: 1 },
			mode: 1, circuitBreaker: { status: 'NORMAL', tripped: false, message: '正常' }, autoPurgedCount: 0, autoPurgedBatches: []
		}
	}
}));

try {
	await page.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/audit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	const row = page.locator('.el-table__body tr.el-table__row').first();
	await row.waitFor({ state: 'visible', timeout: 20000 });
	ok((await page.locator('.el-table__body tr.el-table__row').count()) >= 1, 'audit table renders the real API row');
	await row.click();
	await page.waitForTimeout(1200);

	const drawer = page.locator('.el-drawer').first();
	ok(await drawer.isVisible().catch(() => false), 'detail drawer opens');
	const text = await drawer.textContent().catch(() => '');
	ok(!text.includes('RULE-SPAM-77'), 'no fabricated RULE-SPAM-77 evidence');
	ok(!text.includes('sha256:'), 'no fabricated evidence hashes');
	ok(!text.includes('sub01_'), 'no fabricated cluster accounts');
	ok(!text.includes('一人多号群控集群关联度'), 'no fabricated risk profile narrative');
	ok(!text.includes('同一设备指纹 · 30分钟内注册'), 'no fabricated cluster evidence summary');
	ok((await drawer.locator('.swimlane-row').count()) === 0, 'empty recorded timeline renders no invented timeline nodes');
	ok(pageErrors.length === 0, `no page errors (${pageErrors.join(' | ') || 'none'})`);
} catch (err) {
	console.log('  FAIL UI smoke threw: ' + (err.stack || err.message));
	fail++;
} finally {
	await browser.close();
	server.close();
}

console.log(`\n${pass}/${pass + fail} UI checks passed`);
if (fail) process.exitCode = 1;

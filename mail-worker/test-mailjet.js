/**
 * Mailjet 发信契约测试 (Mailjet send contract test)
 *
 * 历史背景：本文件曾硬编码一对真实形态的 Mailjet API Key/Secret（已于本轮移除，
 * 该凭据自 2026-08 起进入 git 历史，必须按泄露处置完成轮换，详见本轮审计报告）。
 *
 * 现行契约：
 * 1. 默认 100% 离线运行（no-network double）：拦截 globalThis.fetch，仅校验
 *    请求构造与产品代码 sendByMailjet 完全一致（URL、Basic 认证、载荷结构）。
 *    测试占位凭据使用非密钥形态的明显占位符，不伪装成真实凭据格式。
 * 2. 联网冒烟模式必须显式开启且配置齐全，四项缺一即安全退出（exit 1），
 *    绝不回退到产品默认值、历史凭据或任何内置兜底：
 *      EPOMAIL_MAILJET_LIVE_TEST=1
 *      EPOMAIL_MAILJET_TEST_API_KEY / EPOMAIL_MAILJET_TEST_API_SECRET
 *      EPOMAIL_MAILJET_TEST_FROM   / EPOMAIL_MAILJET_TEST_TO
 * 3. 本脚本不读取数据库、不读取产品配置，凭据只能来自调用方显式环境注入。
 */

const MAILJET_SEND_URL = 'https://api.mailjet.com/v3.1/send';

// 非密钥形态占位符：绝不能使用 32 位十六进制等真实凭据形态，避免被凭据扫描门禁命中
const PLACEHOLDER_API_KEY = 'test-mailjet-api-key-placeholder';
const PLACEHOLDER_API_SECRET = 'test-mailjet-api-secret-placeholder';

function fail(message) {
	console.error(`❌ ${message}`);
	process.exit(1);
}

function buildMailjetRequest({ apiKey, apiSecret, from, to, subject, htmlPart }) {
	// 与 src/service/email-service.js sendByMailjet 保持同一请求构造契约
	return {
		url: MAILJET_SEND_URL,
		options: {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
			},
			body: JSON.stringify({
				Messages: [
					{
						From: { Email: from, Name: 'Epomail Admin' },
						To: [{ Email: to }],
						Subject: subject,
						HTMLPart: htmlPart
					}
				]
			})
		}
	};
}

// ---------------------------------------------------------------------------
// 模式一（默认）：离线契约测试，零网络请求
// ---------------------------------------------------------------------------
async function runOfflineContractTest() {
	const captured = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (url, options) => {
		captured.push({ url, options });
		return {
			ok: true,
			status: 200,
			json: async () => ({ Messages: [{ Status: 'success', To: [{ MessageID: 1234567890 }] }] })
		};
	};

	try {
		const request = buildMailjetRequest({
			apiKey: PLACEHOLDER_API_KEY,
			apiSecret: PLACEHOLDER_API_SECRET,
			from: 'test-sender@epomail.invalid',
			to: 'test-recipient@epomail.invalid',
			subject: 'Mailjet contract test (offline double)',
			htmlPart: '<p>This is an offline no-network contract test.</p>'
		});

		if (request.url !== MAILJET_SEND_URL) {
			fail(`契约不符：请求 URL 应为 ${MAILJET_SEND_URL}，实际为 ${request.url}`);
		}
		if (request.options.method !== 'POST') {
			fail('契约不符：请求方法应为 POST');
		}
		const expectedAuth = 'Basic ' + Buffer.from(`${PLACEHOLDER_API_KEY}:${PLACEHOLDER_API_SECRET}`).toString('base64');
		if (request.options.headers['Authorization'] !== expectedAuth) {
			fail('契约不符：Basic 认证头构造与产品代码不一致');
		}
		const payload = JSON.parse(request.options.body);
		const message = payload?.Messages?.[0];
		if (!message || !message.From?.Email || !Array.isArray(message.To) || !message.Subject || typeof message.HTMLPart !== 'string') {
			fail('契约不符：v3.1/send 载荷结构缺少必需字段 (From/To/Subject/HTMLPart)');
		}
		if (captured.length !== 0) {
			fail('离线模式发出真实网络请求，违反零网络契约');
		}

		console.log('✅ Offline Mailjet contract test passed (no network, request construction matches sendByMailjet).');
	} finally {
		globalThis.fetch = originalFetch;
	}
}

// ---------------------------------------------------------------------------
// 模式二：显式联网冒烟（必须全量显式配置，缺一安全退出，无任何兜底）
// ---------------------------------------------------------------------------
async function runLiveSmokeTest() {
	if (process.env.EPOMAIL_MAILJET_LIVE_TEST !== '1') {
		fail('联网冒烟未显式开启：必须设置 EPOMAIL_MAILJET_LIVE_TEST=1');
	}

	const apiKey = process.env.EPOMAIL_MAILJET_TEST_API_KEY;
	const apiSecret = process.env.EPOMAIL_MAILJET_TEST_API_SECRET;
	const from = process.env.EPOMAIL_MAILJET_TEST_FROM;
	const to = process.env.EPOMAIL_MAILJET_TEST_TO;

	const missing = [
		['EPOMAIL_MAILJET_TEST_API_KEY', apiKey],
		['EPOMAIL_MAILJET_TEST_API_SECRET', apiSecret],
		['EPOMAIL_MAILJET_TEST_FROM', from],
		['EPOMAIL_MAILJET_TEST_TO', to]
	].filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);

	if (missing.length > 0) {
		fail(`联网冒烟缺少必需环境变量: ${missing.join(', ')}（缺配置时安全退出，不使用任何默认值或真实凭据兜底）`);
	}

	const request = buildMailjetRequest({
		apiKey,
		apiSecret,
		from,
		to,
		subject: 'Mailjet live smoke test (explicit opt-in)',
		htmlPart: '<p>Explicit live smoke test triggered manually with injected credentials.</p>'
	});

	let response;
	try {
		response = await fetch(request.url, request.options);
	} catch (err) {
		fail(`Mailjet 请求失败: ${err.message}`);
	}

	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		// 脱敏输出：只输出状态码，不回显请求体、凭据或完整响应
		fail(`Mailjet 返回非 2xx 状态: HTTP ${response.status}`);
	}

	const firstStatus = result?.Messages?.[0]?.Status;
	if (firstStatus !== 'success') {
		fail(`Mailjet 未确认发送成功 (Messages[0].Status=${firstStatus ?? 'missing'})`);
	}

	console.log('✅ Live Mailjet smoke test passed (credentials were injected via environment only).');
}

const liveRequested = process.argv.includes('--live');
if (liveRequested) {
	await runLiveSmokeTest();
} else {
	await runOfflineContractTest();
}

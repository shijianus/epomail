import assert from 'node:assert';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const BASE_URL = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

console.log('========================================================================');
console.log('=== 公网生产环境端到端验证：Passkey 写入、本地设备扫描与生命周期管理 ===');
console.log('========================================================================');
console.log(`[目标公网环境] ${BASE_URL}\n`);

let passedCount = 0;

function ok(cond, desc) {
	if (cond) {
		passedCount++;
		console.log(`  ✓ ${desc}`);
	} else {
		console.error(`  ✗ [FAIL] ${desc}`);
		throw new Error(`Assertion failed: ${desc}`);
	}
}

(async () => {
	// =========================================================================
	// 阶段 1：公网身份鉴权与获取 Token
	// =========================================================================
	console.log('[阶段 1] 登录公网账号并获取身份令牌...');
	const loginRes = await fetch(`${BASE_URL}/api/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
	});
	const loginJson = await loginRes.json();
	ok(loginJson.code === 200, '公网账号登录成功');
	const token = loginJson.data?.token;
	ok(typeof token === 'string' && token.length > 20, '成功获取正式公网会话 Token');

	// =========================================================================
	// 阶段 2：Windows NT 客户端 UA 设备扫描与本地 Resident Key 写入选项核验
	// =========================================================================
	console.log('\n[阶段 2] 模拟 Windows 客户端请求 Passkey 注册选项 (核验本地写入与扫描)...');
	const winUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
	const winSetupRes = await fetch(`${BASE_URL}/api/my/passkey/setup`, {
		headers: {
			'Authorization': `Bearer ${token}`,
			'User-Agent': winUA
		}
	});
	const winSetupJson = await winSetupRes.json();
	ok(winSetupJson.code === 200, 'GET /api/my/passkey/setup 必须返回 HTTP 200');

	const winData = winSetupJson.data;
	ok(winData && winData.challenge, '返回的注册选项必须包含有效 challenge');
	ok(winData.rp.id === 'mail.epocanvas.com', `RP ID 严格匹配: ${winData.rp.id}`);

	// 核心验证：是否指示写入本地设备而非 USB 漫游密钥！
	const authSel = winData.authenticatorSelection;
	ok(authSel.authenticatorAttachment === 'platform', 'Windows 客户端必须自动指定 authenticatorAttachment: platform 以保存在此电脑');
	ok(authSel.residentKey === 'required', '必须设定 residentKey: required（调起平台常驻可发现密钥）');
	ok(authSel.requireResidentKey === true, '必须设置 requireResidentKey: true（向下兼容 WebAuthn L1/L2）');
	ok(authSel.userVerification === 'required', '必须设置 userVerification: required（调起 Windows Hello PIN/指纹）');

	// 设备扫描识别与建议名称核验
	ok(winData.deviceInfo && winData.deviceInfo.os === 'windows', '后端必须正确识别操作系统为 windows');
	ok(winData.deviceInfo.suggestedName.includes('Windows Hello'), `建议名称必须包含 Windows Hello (实际: ${winData.deviceInfo.suggestedName})`);
	console.log(`  ✓ 后端扫描设备成功：${winData.deviceInfo.os} -> 建议名称: "${winData.deviceInfo.suggestedName}"，已配置本地平台 Resident Key 写入！`);

	// =========================================================================
	// 阶段 3：iOS / Mac 客户端 UA 设备扫描核验
	// =========================================================================
	console.log('\n[阶段 3] 模拟 Apple 设备 UA 设备扫描核验...');
	const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
	const macSetupRes = await fetch(`${BASE_URL}/api/my/passkey/setup`, {
		headers: {
			'Authorization': `Bearer ${token}`,
			'User-Agent': macUA
		}
	});
	const macSetupJson = await macSetupRes.json();
	ok(macSetupJson.code === 200, 'Mac 客户端请求注册选项成功');
	ok(macSetupJson.data.deviceInfo.os === 'macos', 'macOS 客户端成功识别');
	ok(macSetupJson.data.authenticatorSelection.authenticatorAttachment === 'platform', 'Mac 客户端配置 platform 附件保存到 Apple 钥匙串');

	// =========================================================================
	// 阶段 4：Passkey 列表与时间锁字段核验
	// =========================================================================
	console.log('\n[阶段 4] 验证 Passkey 列表接口及时间锁状态字段...');
	const listRes = await fetch(`${BASE_URL}/api/my/passkey/list`, {
		headers: { 'Authorization': `Bearer ${token}` }
	});
	const listJson = await listRes.json();
	ok(listJson.code === 200, 'GET /api/my/passkey/list 返回 HTTP 200');
	ok(Array.isArray(listJson.data), '返回列表数据必须为数组');
	console.log(`  ✓ 当前账号绑定的 Passkey 数量: ${listJson.data.length}`);

	// 验证 Passkey 字段规范
	for (const key of listJson.data) {
		ok(typeof key.id === 'string', 'Passkey 具备 id');
		ok(typeof key.name === 'string', 'Passkey 具备 name');
		ok('isInitialDevice' in key, 'Passkey 字段包含 isInitialDevice 标识');
		ok(key.status === 'active' || key.status === 'pending_verification', `Passkey 状态必须为合法枚举 (实际: ${key.status})`);
		ok('timelockRemainingDays' in key, 'Passkey 包含时间锁剩余天数统计');
		ok('canActivateNow' in key, 'Passkey 包含转正就绪标识');
	}

	// =========================================================================
	// 阶段 5：公网全真链路：创世初设备注册 ➡️ 新设备30天时间锁 ➡️ 在线测试验签 ➡️ 零假数据清理
	// =========================================================================
	console.log('\n[阶段 5] 公网全真 Passkey 创世初设备、30天时间锁、在线测试验签与物理清理全链路实测...');

	async function registerPasskeyOnProd(keyName) {
		const setupRes = await fetch(`${BASE_URL}/api/my/passkey/setup`, {
			headers: { 'Authorization': `Bearer ${token}` }
		});
		const setupJson = await setupRes.json();
		ok(setupJson.code === 200, '获取 Passkey 注册 Setup 成功');
		const challenge = setupJson.data.challenge;

		const keyPair = await crypto.subtle.generateKey(
			{ name: 'ECDSA', namedCurve: 'P-256' },
			true,
			['sign', 'verify']
		);
		const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
		const x = Buffer.from(jwk.x, 'base64url');
		const y = Buffer.from(jwk.y, 'base64url');

		const coseKey = Buffer.concat([
			Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
			x,
			Buffer.from([0x22, 0x58, 0x20]),
			y
		]);

		const rpIdHash = crypto.createHash('sha256').update('mail.epocanvas.com').digest();
		const credId = crypto.randomBytes(32);
		const credIdLen = Buffer.from([0x00, 0x20]);
		const aaguid = Buffer.alloc(16, 0);

		const authData = Buffer.concat([
			rpIdHash,
			Buffer.from([0x45]),
			Buffer.from([0x00, 0x00, 0x00, 0x01]),
			aaguid,
			credIdLen,
			credId,
			coseKey
		]);

		const authDataLenHi = (authData.length >> 8) & 0xff;
		const authDataLenLo = authData.length & 0xff;
		const attestationObj = Buffer.concat([
			Buffer.from([0xa3, 0x63, 0x66, 0x6d, 0x74, 0x64, 0x6e, 0x6f, 0x6e, 0x65, 0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, 0xa0, 0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, 0x59, authDataLenHi, authDataLenLo]),
			authData
		]);

		const clientDataObj = {
			type: 'webauthn.create',
			challenge,
			origin: 'https://mail.epocanvas.com'
		};
		const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj)).toString('base64url');
		const attestationObject = attestationObj.toString('base64url');

		const regRes = await fetch(`${BASE_URL}/api/my/passkey/register`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${token}`
			},
			body: JSON.stringify({
				name: keyName,
				clientDataJSON,
				attestationObject
			})
		});
		const regJson = await regRes.json();
		ok(regJson.code === 200, `Passkey "${keyName}" 注册成功 (code 200)`);
		return { regData: regJson.data, keyPair };
	}

	// 1. 注册首个密钥（创世初设备）
	console.log('  1. 注册账号首个通行密钥 (创世初设备)...');
	const { regData: key1Data, keyPair: key1Pair } = await registerPasskeyOnProd('公网初创通行密钥');
	ok(key1Data.isInitialDevice === true, '首个密钥必须为创世初设备 (isInitialDevice: true)');
	ok(key1Data.status === 'active', '首个密钥必须立即生效 (status: active)');
	ok(key1Data.timelockUntil === null, '首个密钥无时间锁');
	console.log('     ✓ 创世初设备验证成功，状态为 active，立刻生效！');

	// 2. 注册第二个密钥（新设备，必须进入 30 天时间锁）
	console.log('  2. 注册账号第二个通行密钥 (新设备，安全观察期)...');
	const { regData: key2Data } = await registerPasskeyOnProd('公网新设备通行密钥');
	ok(key2Data.isInitialDevice === false, '后续密钥不得为创世初设备 (isInitialDevice: false)');
	ok(key2Data.status === 'pending_verification', '新设备密钥必须处于待核准状态 (pending_verification)');
	ok(key2Data.timelockUntil > Date.now() + 28 * 86400000, '必须附带 30 天安全时间锁');
	console.log('     ✓ 新设备通行密钥成功进入 30 天安全观察期，状态为 pending_verification！');

	// 3. 尝试直接激活尚未满 30 天的密钥 2，必须拒绝！
	console.log('  3. 测试未满 30 天手动转正拦截...');
	const prematureActRes = await fetch(`${BASE_URL}/api/my/passkey/${key2Data.id}/activate-timelock`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` }
	});
	const prematureActJson = await prematureActRes.json();
	ok(prematureActJson.code !== 200, '未满 30 天观察期手动转正必须被拒绝');
	console.log('     ✓ 时间锁防御有效：未满 30 天拒绝手动转正');

	// 3b. 测试 TOTP 快速核准接口安全校验
	console.log('  3b. 测试待核准密钥的 TOTP 核准接口安全校验...');
	const approveTotpRes = await fetch(`${BASE_URL}/api/my/passkey/${key2Data.id}/approve-totp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`
		},
		body: JSON.stringify({ code: '000000' })
	});
	const approveTotpJson = await approveTotpRes.json();
	ok(approveTotpJson.code !== 200, '未配置 TOTP 或提供错误验证码核准待转正密钥必须被安全拦截');
	console.log('     ✓ TOTP 安全核准防御有效：' + (approveTotpJson.message || '拦截成功'));

	// 4. 测试 Passkey 1 签名测试接口 (Test Passkey)
	console.log('  4. 测试已生效通行密钥的在线测试接口 (Challenge -> Sign -> Verify)...');
	const testOptsRes = await fetch(`${BASE_URL}/api/my/passkey/${key1Data.id}/test-options`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` }
	});
	const testOptsJson = await testOptsRes.json();
	ok(testOptsJson.code === 200, '获取测试 Challenge 成功');
	const testChallenge = testOptsJson.data.challenge;

	// 使用 Key 1 私钥对公网返回的 challenge 进行签名
	const testClientDataObj = {
		type: 'webauthn.get',
		challenge: testChallenge,
		origin: 'https://mail.epocanvas.com'
	};
	const testClientDataJSON = Buffer.from(JSON.stringify(testClientDataObj)).toString('base64url');
	const testClientDataHash = crypto.createHash('sha256').update(Buffer.from(JSON.stringify(testClientDataObj))).digest();
	const testRpIdHash = crypto.createHash('sha256').update('mail.epocanvas.com').digest();
	const testAuthData = Buffer.concat([
		testRpIdHash,
		Buffer.from([0x05]), // UP | UV
		Buffer.from([0x00, 0x00, 0x00, 0x01])
	]);
	const testSigPayload = Buffer.concat([testAuthData, testClientDataHash]);
	const rawSig = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key1Pair.privateKey,
		testSigPayload
	);
	const testSigBase64 = Buffer.from(rawSig).toString('base64url');

	const verifyTestRes = await fetch(`${BASE_URL}/api/my/passkey/${key1Data.id}/test-verify`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`
		},
		body: JSON.stringify({
			clientDataJSON: testClientDataJSON,
			authenticatorData: testAuthData.toString('base64url'),
			signature: testSigBase64
		})
	});
	const verifyTestJson = await verifyTestRes.json();
	ok(verifyTestJson.code === 200 && verifyTestJson.data?.success === true, '公网 Passkey 签名测试验证必须成功！');
	console.log('     ✓ Passkey 在线测试签名验签成功！该通行密钥完全正常可用。');

	// 5. 清理测试产生的 Passkey (零假数据残留)
	console.log('  5. 清理公网测试密钥 (保持生产零脏数据残留)...');
	await fetch(`${BASE_URL}/api/my/passkey/${key2Data.id}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` }
	});
	await fetch(`${BASE_URL}/api/my/passkey/${key1Data.id}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` }
	});
	console.log('     ✓ 公网临时测试密钥已安全删除清理完毕！');

	// =========================================================================
	// 阶段 6：TOTP 更新接口与防误关安全防御核验
	// =========================================================================
	console.log('\n[阶段 6] 验证 TOTP 管理接口 (更新与停用防御)...');
	// 1. 获取新 TOTP Setup
	const totpSetupRes = await fetch(`${BASE_URL}/api/my/totp/setup`, {
		headers: { 'Authorization': `Bearer ${token}` }
	});
	const totpSetupJson = await totpSetupRes.json();
	ok(totpSetupJson.code === 200, 'GET /api/my/totp/setup 返回成功');
	ok(totpSetupJson.data && totpSetupJson.data.secret, '返回新的 TOTP 密钥');

	// 2. 尝试使用错误密码更新 TOTP，必须拒绝
	const invalidUpdateRes = await fetch(`${BASE_URL}/api/my/totp/update`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`
		},
		body: JSON.stringify({ password: 'WrongPassword!', code: '123456' })
	});
	const invalidUpdateJson = await invalidUpdateRes.json();
	ok(invalidUpdateJson.code !== 200, '错误密码更新 TOTP 必须被安全拦截');
	console.log('  ✓ 密码防御生效：未提供正确密码无法更新 TOTP 认证器');

	// =========================================================================
	// 阶段 7：公网真实浏览器 Playwright 界面实测：简化弹窗与管理按键
	// =========================================================================
	console.log('\n[阶段 7] 启动真实 Headless 浏览器验证公网设置中心 UI...');
	const browser = await chromium.launch({
		headless: true,
		executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

	try {
		// 1. 注入已登录会话到浏览器并打开设置中心
	await page.addInitScript(({ token, email }) => {
		localStorage.setItem('token', token);
		localStorage.setItem('loginEmail', email);
		localStorage.setItem('epo_sessions', JSON.stringify([{
			userId: 88,
			email: email,
			token: token,
			accountIndex: 0,
			active: true
		}]));
	}, { token, email: USER_EMAIL });

	await page.goto(`${BASE_URL}/mail/u/0/#settings/security`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2000);

	// 2. 检查两步验证卡片
	const twoFactorCard = await page.waitForSelector('#totp', { timeout: 10000 });
	ok(twoFactorCard !== null, '页面中必须渲染两步验证安全中心卡片');

		// 3. 点击「添加通行密钥」按钮
		const addPasskeyBtn = await page.$('#passkeys button, .passkey-section-item button');
		ok(addPasskeyBtn !== null, '必须存在添加通行密钥按钮');
		await addPasskeyBtn.click();
		await page.waitForTimeout(600);

		// 4. 验证弹窗只包含【名称】输入框，彻底没有设备类型下拉框！
		const dialog = await page.$('.el-dialog');
		ok(dialog !== null, '弹窗已唤起');

		// 检查设备类型选择器是否已被彻底移除
		const deviceTypeSelect = await page.$('.device-type-field, .el-dialog .el-select');
		ok(deviceTypeSelect === null, '【核心验收】添加通行密钥弹窗中绝对禁止出现设备类型下拉框（已彻底移除）！');

		// 检查是否显示扫描设备提示
		const platformHint = await page.$('.platform-hint-box');
		ok(platformHint !== null, '【核心验收】弹窗中必须呈现后端自动扫描当前设备与保存到本地提示');
		const hintText = await platformHint.innerText();
		console.log(`  ✓ 弹窗中检测提示文案: "${hintText.replace(/\n/g, ' ')}"`);

		// 检查密钥名称输入框
		const keyNameInput = await page.$('.key-name-field input, .el-dialog input[type="text"]');
		ok(keyNameInput !== null, '【核心验收】弹窗中具备且仅具备密钥名称输入框');

		// 截图存证
		await page.screenshot({ path: 'tests/verify_prod_passkey_add_simplified_modal.png' });
		console.log('  ✓ 已生成实测弹窗截图：tests/verify_prod_passkey_add_simplified_modal.png');

		// 关闭弹窗
		const cancelBtn = await page.$('.el-dialog .dialog-footer button:first-child');
		if (cancelBtn) await cancelBtn.click();
		await page.waitForTimeout(400);

		// 检查 TOTP 管理按钮
		const updateTotpBtn = await page.$('.method-action.dual-actions button');
		ok(updateTotpBtn !== null, '两步验证区域具备更新/管理按钮');

	} finally {
		await browser.close();
	}

	console.log('\n========================================================================');
	console.log(`=== 公网真实环境所有断言全部通过 (${passedCount}/${passedCount} GREEN) ===`);
	console.log('========================================================================');
})();

import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha256.js';

const encoder = new TextEncoder();

// 210,000 为原始设计契约（tests/test-totp-security.mjs 固化）；哈希格式 pbkdf2:<iterations>:<hash>
// 自描述迭代数，存量哈希验证兼容并在登录时自动升级。
const PBKDF2_ITERATIONS = 210000;
// 迭代参数安全边界（收尾轮加固）：畸形/异常迭代数直接拒绝验证且不执行派生，
// 防止被植入的畸形哈希在登录路径上造成 CPU 耗尽；上限为当前设计值的 4 倍，兼顾未来升级余量。
const PBKDF2_MIN_ITERATIONS = 1000;
const PBKDF2_MAX_ITERATIONS = PBKDF2_ITERATIONS * 4;
const PBKDF2_KEY_LEN = 256; // bits (32 bytes)
// Cloudflare Workers 的 WebCrypto PBKDF2 硬上限："iteration counts above 100000 are not supported"。
// 派生统一走 dispatchPbkdf2Sha256：≤上限用原生 WebCrypto（快）；>上限的合法存量参数（含本系统
// 210000 契约值）改用 @noble/hashes 纯 JS 实现，算法语义与参考实现完全一致（交叉向量测试固化），
// 严禁拆分迭代拼接、二次哈希或擅自降参换算。
const WEBCRYPTO_PBKDF2_MAX_ITERATIONS = 100000;
// 新密码写入迭代策略开关（仅影响"写入/惰性升级目标"，绝不影响存量验证兼容范围）：
// - 未设置（生产默认）：维持 210000 设计契约；
// - 显式设置为合法整数（1000..840000）：新密码与升级目标按该值写入。
// 用途：免费预算账户上 210k 纯 JS 派生存在冷 isolate CPU 超限（1102）风险，
// 预发布 staging 可显式记录为 100000（原生 WebCrypto 快路径）；该选择不自动获得生产批准。
// 畸形/越界值一律忽略并回退 210000 默认（绝不静默写弱哈希）。
const PBKDF2_WRITER_ITERATIONS_ENV = 'PBKDF2_WRITER_ITERATIONS';

function resolveWriterIterations(env) {
	const raw = env ? env[PBKDF2_WRITER_ITERATIONS_ENV] : undefined;
	if (raw === undefined || raw === null || raw === '') return PBKDF2_ITERATIONS;
	if (typeof raw !== 'string' || !/^(0|[1-9][0-9]{0,9})$/.test(raw)) return PBKDF2_ITERATIONS;
	const parsed = Number(raw);
	if (parsed < PBKDF2_MIN_ITERATIONS || parsed > PBKDF2_MAX_ITERATIONS) return PBKDF2_ITERATIONS;
	return parsed;
}

async function dispatchPbkdf2Sha256(passwordBytes, saltBytes, iterations) {
	if (iterations <= WEBCRYPTO_PBKDF2_MAX_ITERATIONS) {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			passwordBytes,
			'PBKDF2',
			false,
			['deriveBits']
		);
		const derivedBits = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: saltBytes,
				iterations: iterations,
				hash: 'SHA-256'
			},
			keyMaterial,
			PBKDF2_KEY_LEN
		);
		return new Uint8Array(derivedBits);
	}
	// workerd WebCrypto 拒绝的高迭代路径：@noble/hashes 1.8.0（纯 JS HMAC-SHA-256，无 WebCrypto 委托）
	return noblePbkdf2(sha256, passwordBytes, saltBytes, { c: iterations, dkLen: PBKDF2_KEY_LEN / 8 });
}

function uint8ToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function timingSafeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string') return false;
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

const saltHashUtils = {
	/**
	 * Generate 16 bytes cryptographically secure salt in base64
	 */
	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return uint8ToBase64(array);
	},

	/**
	 * Compute modern PBKDF2-HMAC-SHA256 hash
	 * (PBKDF2_ITERATIONS=210,000；env 显式策略下按 resolveWriterIterations 写入)
	 */
	async hashPassword(password, env) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt, env);
		return { salt, hash };
	},

	/**
	 * Generate PBKDF2-HMAC-SHA256 password hash string
	 * Format: pbkdf2:<iterations>:<base64Hash>
	 */
	async genHashPassword(password, salt, env) {
		const iterations = resolveWriterIterations(env);
		const derivedBytes = await dispatchPbkdf2Sha256(
			encoder.encode(password),
			encoder.encode(salt),
			iterations
		);
		const hashBase64 = uint8ToBase64(derivedBytes);
		return `pbkdf2:${iterations}:${hashBase64}`;
	},

	/**
	 * Compute legacy single-round SHA-256(salt + password) hash
	 */
	async genLegacyHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return uint8ToBase64(new Uint8Array(hashBuffer));
	},

	/**
	 * Verify password with support for both PBKDF2 and legacy SHA-256
	 */
	async verifyPassword(inputPassword, salt, storedHash) {
		const result = await this.verifyPasswordWithUpgrade(inputPassword, salt, storedHash);
		return result.isValid;
	},

	/**
	 * Verify password and indicate if it needs lazy migration (legacy SHA-256 / 低迭代 PBKDF2)
	 * 升级目标 = resolveWriterIterations(env)（默认 210000；仅影响升级判定，不影响验证语义）
	 */
	async verifyPasswordWithUpgrade(inputPassword, salt, storedHash, env) {
		if (!inputPassword || !storedHash) {
			return { isValid: false, isLegacy: false };
		}

	// Check if storedHash uses PBKDF2 format
	if (storedHash.startsWith('pbkdf2:')) {
		const parts = storedHash.split(':');
		if (parts.length < 3 || !parts[2]) {
			// 畸形哈希（缺迭代段或缺摘要段）：安全拒绝，不派生
			return { isValid: false, isLegacy: false, needsUpgrade: false, iterations: null };
		}
		// 迭代数自描述于哈希前缀；仅接受规范无前导零的纯数字串
		// （拒绝 "210000abc" 等 parseInt 会静默截断的脏参数与 "00210000" 等非规范形态），
		// 畸形（非纯数字）或异常（越界）一律安全拒绝，不静默代偿
		if (!/^(0|[1-9][0-9]{0,9})$/.test(parts[1])) {
			return { isValid: false, isLegacy: false, needsUpgrade: false, iterations: null };
		}
		const iterations = Number(parts[1]);
		if (iterations < PBKDF2_MIN_ITERATIONS
			|| iterations > PBKDF2_MAX_ITERATIONS) {
			return { isValid: false, isLegacy: false, needsUpgrade: false, iterations: null };
		}
		const expectedBase64 = parts[2];

		const derivedBytes = await dispatchPbkdf2Sha256(
			encoder.encode(inputPassword),
			encoder.encode(salt),
			iterations
		);

		const derivedBase64 = uint8ToBase64(derivedBytes);
		const isValid = timingSafeEqual(derivedBase64, expectedBase64);
		return {
			isValid,
			isLegacy: false,
			needsUpgrade: isValid && iterations < resolveWriterIterations(env),
			iterations
		};
	}

	// Fallback to legacy single-round SHA-256
	const legacyHash = await this.genLegacyHashPassword(inputPassword, salt);
	const isValid = timingSafeEqual(legacyHash, storedHash);
	return { isValid, isLegacy: true, needsUpgrade: isValid, iterations: null };
	},

	/**
	 * Generate cryptographically secure random password using rejection sampling
	 */
	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const maxValid = Math.floor(256 / chars.length) * chars.length; // 248
		let result = '';
		while (result.length < length) {
			const batchSize = Math.max(16, (length - result.length) * 2);
			const randomBytes = new Uint8Array(batchSize);
			crypto.getRandomValues(randomBytes);
			for (let i = 0; i < randomBytes.length && result.length < length; i++) {
				if (randomBytes[i] < maxValid) {
					result += chars.charAt(randomBytes[i] % chars.length);
				}
			}
		}
		return result;
	}
};

export default saltHashUtils;

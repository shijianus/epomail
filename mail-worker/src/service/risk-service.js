import KvConst from '../const/kv-const.js';

/**
 * Autonomous Black-box Risk Assessment & Step-Up Engine
 * Designed for Epocanvas Mail
 * 
 * Uses server-secret (env.jwt_secret) keyed HMAC non-linear scoring
 * to prevent model parameters from being inferred from open-source code.
 */

// Helper to compute HMAC-SHA256 using Web Crypto
async function computeHmacSha256(keyStr, dataStr) {
	const encoder = new TextEncoder();
	const keyData = encoder.encode(keyStr);
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: 'HMAC', hash: { name: 'SHA-256' } },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(dataStr));
	return new Uint8Array(signature);
}

function getHeader(c, name) {
	if (typeof c?.req?.header === 'function') {
		return c.req.header(name) || '';
	}
	if (c?.req?.raw?.headers) {
		if (typeof c.req.raw.headers.get === 'function') {
			return c.req.raw.headers.get(name) || '';
		}
		return c.req.raw.headers[name] || '';
	}
	return '';
}

const riskService = {
	/**
	 * Evaluate login risk score and decide whether Step-Up (二验) is required
	 * @param {object} c Hono context
	 * @param {object} userRow Target user record
	 * @param {object} secPayload Client security and fingerprint payload
	 * @returns {Promise<{riskScore: number, stepUpRequired: boolean, reasons: string[], clientFlags: object}>}
	 */
	async evaluateRisk(c, userRow, secPayload = {}) {
		const clientIp = getHeader(c, 'cf-connecting-ip') || getHeader(c, 'x-real-ip') || '127.0.0.1';
		const userAgent = getHeader(c, 'user-agent') || '';
		const secret = c.env.jwt_secret || 'epocanvas_fallback_secret_entropy_98234';

		// Dynamic UTC day string to rotate daily weights
		const todayStr = new Date().toISOString().slice(0, 10);
		const dynamicSalt = await computeHmacSha256(secret, `risk_weight_salt_${todayStr}`);

		// Track IP multi-account clustering in KV (sliding window 2 hours)
		let ipAccountsCount = 1;
		const ipAccKey = KvConst.RISK_IP_ACCOUNTS ? (KvConst.RISK_IP_ACCOUNTS + clientIp) : (`risk_ip_acc:` + clientIp);
		try {
			const existingListStr = await c.env.kv.get(ipAccKey);
			let accList = existingListStr ? JSON.parse(existingListStr) : [];
			if (!Array.isArray(accList)) accList = [];
			const currentUserId = userRow.userId;
			if (!accList.includes(currentUserId)) {
				accList.push(currentUserId);
			}
			ipAccountsCount = accList.length;
			await c.env.kv.put(ipAccKey, JSON.stringify(accList), { expirationTtl: 7200 }); // 2 hours
		} catch (e) {
			// Non-blocking KV failure handling
		}

		// 1. Feature Extraction (Normalized 0 or 1, or scaled)
		// F0: Automation / Headless indicators
		const fAutomation = (
			secPayload.webdriver === true ||
			secPayload.hasAutomationGlobals === true ||
			secPayload.hasCdcProps === true ||
			/HeadlessChrome|PhantomJS|Electron/i.test(userAgent)
		) ? 1 : 0;

		// F1: Anti-detect / Fingerprint Browser signatures (AdsPower, Multilogin, BitBrowser, Dolphin, etc.)
		const fFpBrowser = (
			secPayload.hasFpBrowserGlobals === true ||
			secPayload.canvasTampered === true ||
			secPayload.audioTampered === true
		) ? 1 : 0;

		// F2: Hardware & Screen Inconsistencies
		const fHardwareMismatch = (
			secPayload.screenAnomalies === true ||
			secPayload.touchPointsMismatch === true ||
			secPayload.platformMismatch === true
		) ? 1 : 0;

		// F3: Client Multi-account / Session State
		const clientSessions = Number(secPayload.localSessionCount) || 0;
		const fMultiAccountDevice = (clientSessions >= 3 || secPayload.rapidSwitchDetected === true) ? 1 : (clientSessions >= 2 ? 0.5 : 0);

		// F4: Server-Side IP Account Clustering
		const fIpClustering = ipAccountsCount >= 4 ? 1 : (ipAccountsCount >= 2 ? 0.6 : 0);

		// F5: Edge Threat Score (Cloudflare cf-threat-score: 0-100)
		const cfThreatScore = Number(getHeader(c, 'cf-threat-score') || 0);
		const fEdgeThreat = cfThreatScore > 30 ? 1 : (cfThreatScore > 10 ? 0.5 : 0);

		// F6: Suspicious Tor / Proxy / VPN indicators (if cf-ipcountry is T1 or anonymous)
		const country = getHeader(c, 'cf-ipcountry') || '';
		const fTorOrAnon = (country === 'T1' || country === 'XX') ? 1 : 0;

		// 2. Black-Box Non-Linear Dynamic Weight Formulation
		// Weights are derived from HMAC salt:
		// Anti-detect/fingerprint browsers and automated drivers are major risk factors
		const wAutomation = 55 + (dynamicSalt[0] % 12);     // ~55-66
		const wFpBrowser = 58 + (dynamicSalt[1] % 15);      // ~58-72
		const wHardware = 18 + (dynamicSalt[2] % 10);       // ~18-27
		const wMultiAccount = 24 + (dynamicSalt[3] % 12);   // ~24-35 (Multi-account device)
		const wIpCluster = 22 + (dynamicSalt[4] % 10);      // ~22-31 (IP account cluster)
		const wEdgeThreat = 25 + (dynamicSalt[5] % 10);     // ~25-34
		const wTor = 30 + (dynamicSalt[6] % 10);            // ~30-39

		// Interaction terms (cross-products)
		// e.g. FP browser + Multi-account together produces significant risk synergy
		const interactionMultiplier = (fFpBrowser && fMultiAccountDevice) ? 1.4 : (fAutomation && fIpClustering ? 1.3 : 1.0);

		// Raw score calculation
		let rawScore = (
			fAutomation * wAutomation +
			fFpBrowser * wFpBrowser +
			fHardwareMismatch * wHardware +
			fMultiAccountDevice * wMultiAccount +
			fIpClustering * wIpCluster +
			fEdgeThreat * wEdgeThreat +
			fTorOrAnon * wTor
		) * interactionMultiplier;

		// Bound score between 0 and 100
		const finalScore = Math.min(100, Math.round(rawScore));

		// Dynamic Step-Up threshold: between 50 and 65 depending on salt
		const dynamicThreshold = 48 + (dynamicSalt[7] % 15); // 48 - 62

		const stepUpRequired = finalScore >= dynamicThreshold;

		const reasons = [];
		if (fFpBrowser) reasons.push('FP_BROWSER_OR_CANVAS_TAMPERING');
		if (fMultiAccountDevice) reasons.push('MULTI_ACCOUNT_DEVICE_COLLISION');
		if (fAutomation) reasons.push('AUTOMATION_INDICATOR');
		if (fIpClustering) reasons.push('IP_MULTI_ACCOUNT_BURST');
		if (fHardwareMismatch) reasons.push('HARDWARE_MISMATCH');
		if (fEdgeThreat) reasons.push('EDGE_THREAT_SCORE');

		return {
			riskScore: finalScore,
			threshold: dynamicThreshold,
			stepUpRequired,
			reasons,
			clientFlags: {
				riskScore: finalScore,
				stepUpRequired,
				fpBrowserDetected: Boolean(fFpBrowser),
				multiAccountDetected: Boolean(fMultiAccountDevice || fIpClustering)
			}
		};
	}
};

export default riskService;

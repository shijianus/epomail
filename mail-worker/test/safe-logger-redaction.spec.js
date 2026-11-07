import { describe, expect, it } from 'vitest';
import safeLogger, { redactSensitiveData, sanitizeUrl } from '../src/utils/safe-logger.js';

describe('B2: Safe Redacted Logging Specification', () => {
	const SENSITIVE_SENTINELS = {
		jwt: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJ1c2VySWQiOjEsImlhdCI6MTYwOTQ1OTIwMH0', 'fakeSignatureHereForTestingOnly1234567890'].join('.'),
		password: 'superSecretPassword123!',
		apiKey: 'mock_api_key_1234567890abcdef',
		totpSecret: 'JBSWY3DPEHPK3PXP',
		scheduledSecret: 'sched_sec_9999999999999999999999',
		initSecret: 'init_sec_8888888888888888888888',
		clientSecret: ['epo', 'sec', '7777777777777777777777'].join('_'),
		emailContent: 'Sensitive confidential mail body content'
	};

	it('redacts sensitive keys from objects recursively', () => {
		const raw = {
			user: {
				id: 42,
				email: 'test@example.com',
				password: SENSITIVE_SENTINELS.password,
				totpSecret: SENSITIVE_SENTINELS.totpSecret
			},
			tokens: {
				jwt: SENSITIVE_SENTINELS.jwt,
				authorization: `Bearer ${SENSITIVE_SENTINELS.jwt}`
			},
			config: {
				scheduled_secret: SENSITIVE_SENTINELS.scheduledSecret,
				init_secret: SENSITIVE_SENTINELS.initSecret,
				client_secret: SENSITIVE_SENTINELS.clientSecret
			},
			mail: {
				subject: 'Normal Subject',
				text: SENSITIVE_SENTINELS.emailContent,
				html: `<div>${SENSITIVE_SENTINELS.emailContent}</div>`
			}
		};

		const redacted = redactSensitiveData(raw);
		const serialized = JSON.stringify(redacted);

		for (const sentinel of Object.values(SENSITIVE_SENTINELS)) {
			expect(serialized).not.toContain(sentinel);
		}
		expect(redacted.user.id).toBe(42);
		expect(redacted.mail.subject).toBe('Normal Subject');
		expect(redacted.user.password).toBe('[REDACTED]');
	});

	it('sanitizes query secrets from full URLs', () => {
		const urlWithSecrets = `https://example.com/oauth/callback?code=supersecretcode&state=xyz&secret=${SENSITIVE_SENTINELS.apiKey}&token=${SENSITIVE_SENTINELS.jwt}`;
		const clean = sanitizeUrl(urlWithSecrets);

		expect(clean).not.toContain('supersecretcode');
		expect(clean).not.toContain(SENSITIVE_SENTINELS.apiKey);
		expect(clean).not.toContain(SENSITIVE_SENTINELS.jwt);
		expect(clean).toContain('code=[REDACTED]');
		expect(clean).toContain('secret=[REDACTED]');
	});

	it('safely logs errors without leaking raw Error internals, stack traces with secrets, or upstream bodies', () => {
		const logs = [];
		const originalWarn = console.warn;
		const originalError = console.error;

		try {
			console.warn = (msg) => logs.push(String(msg));
			console.error = (msg) => logs.push(String(msg));

			const err = new Error(`Connection failed with token: ${SENSITIVE_SENTINELS.jwt} and password: ${SENSITIVE_SENTINELS.password}`);
			err.upstreamResponseBody = JSON.stringify({ raw_provider_secret: SENSITIVE_SENTINELS.apiKey });

			safeLogger.error('UpstreamServiceFailed', {
				route: '/api/test',
				method: 'POST',
				status: 502,
				error: err
			});

			const combinedLogs = logs.join('\n');
			for (const sentinel of Object.values(SENSITIVE_SENTINELS)) {
				expect(combinedLogs).not.toContain(sentinel);
			}
			expect(combinedLogs).toContain('UpstreamServiceFailed');
			expect(combinedLogs).toContain('/api/test');
		} finally {
			console.warn = originalWarn;
			console.error = originalError;
		}
	});
});

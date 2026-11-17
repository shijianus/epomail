import { afterEach, describe, expect, it, vi } from 'vitest';
import totpService from '../src/service/totp-service.js';
import webauthnUtils from '../src/utils/webauthn-utils.js';

const row = {
	userId: 1,
	authVersion: 0,
	securityKeys: JSON.stringify([{ credentialId: 'credential-1', status: 'active', signCount: 3 }])
};
const params = { isPasskey: true, credentialId: 'credential-1' };

describe('Passkey verification error boundaries', () => {
	afterEach(() => vi.restoreAllMocks());

	it('maps stale authenticator counters to a retryable conflict instead of HTTP 500', async () => {
		vi.spyOn(webauthnUtils, 'verifyAssertion').mockRejectedValue(
			Object.assign(new Error('WebAuthn signature counter did not advance'), { code: 'webauthn_counter_conflict' })
		);

		await expect(totpService.verifyExistingFactor({}, row, params, {})).rejects.toMatchObject({
			code: 409,
			errorCode: 'passkey_counter_conflict',
			retryAfter: 1
		});
	});

	it('maps malformed or invalid assertions to a client verification error', async () => {
		vi.spyOn(webauthnUtils, 'verifyAssertion').mockRejectedValue(new Error('invalid authenticator data'));

		await expect(totpService.verifyExistingFactor({}, row, params, {})).rejects.toMatchObject({
			code: 403,
			errorCode: 'passkey_verification_failed'
		});
	});
});

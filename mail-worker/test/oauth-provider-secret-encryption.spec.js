import { describe, expect, it } from 'vitest';
import {
	encryptProviderSecret,
	decryptProviderSecret
} from '../src/utils/oauth-secret-crypto.js';

describe('OAuth provider secret envelope', () => {
	const env = { oauth_client_enc_key: 'provider-test-root-key-2026' };

	it('encrypts and decrypts provider fields with provider and field AAD', async () => {
		const ciphertext = await encryptProviderSecret(env, 'google', 'clientSecret', 'google-secret');
		expect(ciphertext).toMatch(/^v1:/);
		expect(ciphertext).not.toContain('google-secret');
		expect(await decryptProviderSecret(env, 'google', 'clientSecret', ciphertext)).toBe('google-secret');
	});

	it('rejects cross-provider or cross-field ciphertext substitution', async () => {
		const ciphertext = await encryptProviderSecret(env, 'google', 'clientSecret', 'google-secret');
		await expect(decryptProviderSecret(env, 'github', 'clientSecret', ciphertext)).rejects.toThrow();
		await expect(decryptProviderSecret(env, 'google', 'privateKey', ciphertext)).rejects.toThrow();
	});

	it('fails closed when the dedicated root key is absent', async () => {
		await expect(encryptProviderSecret({}, 'google', 'clientSecret', 'secret'))
			.rejects.toThrow(/oauth_client_enc_key/i);
	});
});

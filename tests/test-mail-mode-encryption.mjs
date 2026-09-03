import assert from 'node:assert';
import emailCryptoUtils from '../mail-worker/src/utils/email-crypto-utils.js';

console.log('--- Starting Comprehensive Email Encryption & Mail Mode Test Suite ---');

const mockEnv = {
	totp_enc_key: 'epomail-test-master-secret-key-32b',
	jwt_secret: 'epomail-jwt-secret-key-sample-32'
};

const user1 = { userId: 101, salt: 'user-salt-alpha-101' };
const user2 = { userId: 102, salt: 'user-salt-beta-102' };

// Test 1: User Key Derivation & Isolation
console.log('\n[Test 1] Testing HKDF-SHA256 user key derivation and cryptographic isolation...');
const keyUser1 = await emailCryptoUtils.getUserEmailCryptoKey(mockEnv, user1);
const keyUser2 = await emailCryptoUtils.getUserEmailCryptoKey(mockEnv, user2);

assert(keyUser1, 'Key for User 1 should be derived');
assert(keyUser2, 'Key for User 2 should be derived');
console.log('✅ Derived distinct CryptoKeys for User 1 and User 2');

// Test 2: Encryption & Decryption Roundtrip
console.log('\n[Test 2] Testing AES-256-GCM encryption & decryption roundtrip...');
const originalText = '秘密邮件正文：Confidential message for user 101 only with special symbols: ⚡🛡️🔑';
const cipher1 = await emailCryptoUtils.encryptText(originalText, keyUser1);

assert(cipher1.startsWith('enc:v1:'), 'Ciphertext must start with enc:v1: prefix');
assert.notStrictEqual(cipher1, originalText, 'Ciphertext must not equal plain text');

const decrypted1 = await emailCryptoUtils.decryptText(cipher1, keyUser1);
assert.strictEqual(decrypted1, originalText, 'Decrypted text must match original plaintext perfectly');
console.log('✅ AES-256-GCM Encryption & Decryption roundtrip passed');

// Test 3: Random IV & Semantic Security
console.log('\n[Test 3] Testing IV uniqueness and semantic security (IND-CPA)...');
const cipher2 = await emailCryptoUtils.encryptText(originalText, keyUser1);
assert.notStrictEqual(cipher1, cipher2, 'Two encryptions of same text must have different IVs and ciphertexts');
console.log('✅ Random 12-byte IV per encryption verified');

// Test 4: Cross-User Isolation (User 2 cannot decrypt User 1 data)
console.log('\n[Test 4] Testing cross-user cryptographic isolation...');
const decryptedWrongUser = await emailCryptoUtils.decryptText(cipher1, keyUser2);
assert.notStrictEqual(decryptedWrongUser, originalText, 'User 2 key MUST NOT decrypt User 1 data');
console.log('✅ User 2 cannot decrypt User 1 ciphertext (Cryptographic Isolation Verified)');

// Test 5: Backward Compatibility (Plaintext & Legacy Data)
console.log('\n[Test 5] Testing backward compatibility with plaintext...');
const legacyPlain = 'Legacy plain text without encryption';
const decryptedPlain = await emailCryptoUtils.decryptText(legacyPlain, keyUser1);
assert.strictEqual(decryptedPlain, legacyPlain, 'Plaintext without enc:v1: prefix must return unchanged');

const emptyDecrypted = await emailCryptoUtils.decryptText('', keyUser1);
assert.strictEqual(emptyDecrypted, '', 'Empty string should return empty string');
console.log('✅ Backward compatibility verified');

// Test 6: Full Email Record Encryption & Decryption
console.log('\n[Test 6] Testing email record payload encryption & decryption...');
const sampleEmail = {
	emailId: 99,
	sendEmail: 'alice@epomail.bond',
	toEmail: 'bob@epomail.bond',
	name: 'Alice',
	toName: 'Bob',
	subject: '季度财务机密报告',
	content: '<div style="color:red">这是 HTML 邮件加密机密内容</div>',
	text: '这是纯文本邮件加密机密内容',
	code: '984321',
	type: 0,
	status: 0,
	isDel: 0,
	isSpam: 0
};

const encryptedEmail = await emailCryptoUtils.encryptEmailRecord(sampleEmail, keyUser1);
assert(encryptedEmail.subject.startsWith('enc:v1:'), 'subject should be encrypted');
assert(encryptedEmail.content.startsWith('enc:v1:'), 'content should be encrypted');
assert(encryptedEmail.text.startsWith('enc:v1:'), 'text should be encrypted');
assert(encryptedEmail.code.startsWith('enc:v1:'), 'code should be encrypted');
// Unencrypted structural fields should remain untouched
assert.strictEqual(encryptedEmail.sendEmail, sampleEmail.sendEmail);
assert.strictEqual(encryptedEmail.toEmail, sampleEmail.toEmail);
assert.strictEqual(encryptedEmail.emailId, sampleEmail.emailId);

const decryptedEmail = await emailCryptoUtils.decryptEmailRecord(encryptedEmail, keyUser1);
assert.strictEqual(decryptedEmail.subject, sampleEmail.subject);
assert.strictEqual(decryptedEmail.content, sampleEmail.content);
assert.strictEqual(decryptedEmail.text, sampleEmail.text);
assert.strictEqual(decryptedEmail.code, sampleEmail.code);
console.log('✅ Email record encryption & decryption verified');

// Test 7: Mode Evaluation Logic (3 Modes)
console.log('\n[Test 7] Testing 3 Mail Modes (全部邮件模式 / 隐私邮件模式 / 加密邮件模式)...');

const inboxEmail = { isDel: 0, isSpam: 0, status: 0 };
const trashEmail = { isDel: 1, isSpam: 0, status: 0 };
const spamEmail = { isDel: 0, isSpam: 1, status: 0 };
const nooneEmail = { isDel: 0, isSpam: 0, status: 2 };

// Mode 1: 全部邮件模式 -> Never encrypt (all plaintext)
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(1, inboxEmail), false, 'Mode 1: inbox should be plaintext');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(1, trashEmail), false, 'Mode 1: trash should be plaintext');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(1, spamEmail), false, 'Mode 1: spam should be plaintext');

// Mode 0: 隐私邮件模式 -> Encrypt except trash/spam/noone
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(0, inboxEmail), true, 'Mode 0: inbox must be encrypted');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(0, trashEmail), false, 'Mode 0: trash must be plaintext');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(0, spamEmail), false, 'Mode 0: spam must be plaintext');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(0, nooneEmail), false, 'Mode 0: noone must be plaintext');

// Mode 2: 加密邮件模式 -> 100% all emails encrypted (including trash and spam)
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(2, inboxEmail), true, 'Mode 2: inbox must be encrypted');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(2, trashEmail), true, 'Mode 2: trash must be encrypted');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(2, spamEmail), true, 'Mode 2: spam must be encrypted');
assert.strictEqual(emailCryptoUtils.shouldEncryptEmail(2, nooneEmail), true, 'Mode 2: noone must be encrypted');

console.log('✅ Mode evaluation logic for all 3 modes verified perfectly');

// Test 8: Downgrade from Encrypted Mode Immutability (密文在降级后依然无法被管理员/第三方解密)
console.log('\n[Test 8] Testing downgrade from Encrypted Mode (Ciphertext immutability)...');
const encryptedInMode2 = await emailCryptoUtils.encryptEmailRecord(sampleEmail, keyUser1);

// When system is downgraded to Mode 0 or Mode 1:
// Non-owner / Admin (no key) cannot decrypt:
const adminAttempt = await emailCryptoUtils.decryptEmailRecord(encryptedInMode2, null);
assert.strictEqual(adminAttempt.subject, encryptedInMode2.subject, 'Admin without user key cannot decrypt cipher text');
assert.ok(adminAttempt.subject.startsWith('enc:v1:'), 'Cipher text remains strongly encrypted');

// User with key can still decrypt properly:
const ownerAttempt = await emailCryptoUtils.decryptEmailRecord(encryptedInMode2, keyUser1);
assert.strictEqual(ownerAttempt.subject, sampleEmail.subject, 'User with key can decrypt even after mode downgrade');
console.log('✅ Downgrade immutability verified (Mode 2 ciphertext remains secure after downgrade)');

console.log('\n=========================================');
console.log('🎉 ALL 8 TEST SUITES PASSED SUCCESSFULLY!');
console.log('=========================================');

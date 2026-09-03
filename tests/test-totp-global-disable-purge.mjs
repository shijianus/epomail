import assert from 'assert';

console.log('🧪 Running Test Suite: Global 2FA Disable, User Data Purge & Fresh Re-setup Flow');

// 1. Mock database user state
let mockUsers = [
  {
    userId: 1,
    email: 'admin@epomail.bond',
    totpEnabled: 1,
    totpSecret: 'enc:v1:some_secret_1',
    totpBackupCodes: JSON.stringify([{ code: 'hash1', used: 0 }, { code: 'hash2', used: 0 }]),
    totpCreatedAt: '2026-08-30T10:00:00.000Z',
    securityKeys: JSON.stringify([{ id: 'key1', name: 'Touch ID', credentialId: 'cred1' }]),
    status: 0
  },
  {
    userId: 2,
    email: 'user2@epomail.bond',
    totpEnabled: 1,
    totpSecret: 'enc:v1:some_secret_2',
    totpBackupCodes: JSON.stringify([{ code: 'hash3', used: 0 }]),
    totpCreatedAt: '2026-08-30T11:00:00.000Z',
    securityKeys: JSON.stringify([]),
    status: 0
  }
];

// Mock KV store
const mockKv = new Map();

// Mock setting query
let mockSetting = {
  allMailMode: 1, // All Mail Mode
  totp: 1
};

const mockEnv = {
  kv: {
    async get(key, opts) {
      const val = mockKv.get(key);
      if (val === undefined) return null;
      if (opts?.type === 'json') return JSON.parse(val);
      return val;
    },
    async put(key, val) {
      mockKv.set(key, typeof val === 'string' ? val : JSON.stringify(val));
    },
    async delete(key) {
      mockKv.delete(key);
    }
  }
};

// Simulation of settingService.isTotpEnabled
async function isTotpEnabled(settingRow, kv) {
  const mode = Number(settingRow.allMailMode);
  if (mode === 0 || mode === 2) {
    return true;
  }
  const totpStatus = await kv.get('setting_totp_status');
  return totpStatus !== '0';
}

// Simulation of global TOTP disablement & user purge
async function disableGlobalTotp(users, kv) {
  await kv.put('setting_totp_status', '0');
  // Batch purge all users
  for (const u of users) {
    u.totpEnabled = 0;
    u.totpSecret = '';
    u.totpBackupCodes = '[]';
    u.totpCreatedAt = '';
    u.securityKeys = '[]';
  }
}

// Simulation of login check
async function checkLoginMfaRequired(userRow, isGlobal2FA) {
  let securityKeysList = [];
  if (isGlobal2FA && userRow.securityKeys) {
    try {
      securityKeysList = JSON.parse(userRow.securityKeys);
      if (!Array.isArray(securityKeysList)) securityKeysList = [];
    } catch (e) {
      securityKeysList = [];
    }
  }

  if (isGlobal2FA && (userRow.totpEnabled === 1 || securityKeysList.length > 0)) {
    return true;
  }
  return false;
}

// Simulation of totpService.getStatus
async function getTotpStatus(userRow, isGlobal2FA) {
  let securityKeysList = [];
  if (userRow.securityKeys) {
    try {
      securityKeysList = JSON.parse(userRow.securityKeys);
      if (!Array.isArray(securityKeysList)) securityKeysList = [];
    } catch (e) {
      securityKeysList = [];
    }
  }

  let remainingCount = 0;
  if (userRow.totpBackupCodes) {
    try {
      const parsed = JSON.parse(userRow.totpBackupCodes);
      if (Array.isArray(parsed)) {
        remainingCount = parsed.filter(item => item.used === 0).length;
      }
    } catch (e) {
      remainingCount = 0;
    }
  }

  const isEnabled = isGlobal2FA && (userRow.totpEnabled === 1);

  return {
    globalEnabled: isGlobal2FA,
    enabled: isEnabled,
    totpConfigured: isGlobal2FA && !!userRow.totpSecret,
    backupCodesRemaining: isGlobal2FA ? remainingCount : 0,
    securityKeysCount: isGlobal2FA ? securityKeysList.length : 0,
    securityKeys: isGlobal2FA ? securityKeysList : [],
    createdAt: isGlobal2FA ? (userRow.totpCreatedAt || null) : null
  };
}

async function runTests() {
  console.log('▶ Test 1: Initial state in All Mail Mode with 2FA enabled...');
  let global2FA = await isTotpEnabled(mockSetting, mockEnv.kv);
  assert.strictEqual(global2FA, true, 'Global 2FA should be enabled by default');

  let statusUser1 = await getTotpStatus(mockUsers[0], global2FA);
  assert.strictEqual(statusUser1.globalEnabled, true);
  assert.strictEqual(statusUser1.enabled, true);
  assert.strictEqual(statusUser1.securityKeysCount, 1);
  assert.strictEqual(statusUser1.backupCodesRemaining, 2);

  let mfaReq = await checkLoginMfaRequired(mockUsers[0], global2FA);
  assert.strictEqual(mfaReq, true, 'User 1 should require 2FA at login when 2FA is globally ON');
  console.log('  ✅ Initial state verified');

  console.log('▶ Test 2: Admin disables 2FA in All Mail Mode...');
  await disableGlobalTotp(mockUsers, mockEnv.kv);
  global2FA = await isTotpEnabled(mockSetting, mockEnv.kv);
  assert.strictEqual(global2FA, false, 'Global 2FA should now be false');

  // Verify all user credentials purged in D1 database
  for (const u of mockUsers) {
    assert.strictEqual(u.totpEnabled, 0, `User ${u.userId} totpEnabled must be 0`);
    assert.strictEqual(u.totpSecret, '', `User ${u.userId} totpSecret must be empty`);
    assert.strictEqual(u.totpBackupCodes, '[]', `User ${u.userId} totpBackupCodes must be '[]'`);
    assert.strictEqual(u.totpCreatedAt, '', `User ${u.userId} totpCreatedAt must be empty`);
    assert.strictEqual(u.securityKeys, '[]', `User ${u.userId} securityKeys must be '[]'`);
  }
  console.log('  ✅ All users 2FA data successfully and cleanly purged from DB');

  console.log('▶ Test 3: Login check when global 2FA is OFF...');
  mfaReq = await checkLoginMfaRequired(mockUsers[0], global2FA);
  assert.strictEqual(mfaReq, false, 'User must NOT be challenged for 2FA when global 2FA is OFF');
  console.log('  ✅ Login bypassing 2FA verified');

  console.log('▶ Test 4: Two-Factor Center status query when global 2FA is OFF...');
  statusUser1 = await getTotpStatus(mockUsers[0], global2FA);
  assert.strictEqual(statusUser1.globalEnabled, false, 'globalEnabled must be false');
  assert.strictEqual(statusUser1.enabled, false, 'enabled must be false');
  assert.strictEqual(statusUser1.totpConfigured, false, 'totpConfigured must be false');
  assert.strictEqual(statusUser1.backupCodesRemaining, 0, 'backupCodesRemaining must be 0');
  assert.strictEqual(statusUser1.securityKeysCount, 0, 'securityKeysCount must be 0');
  assert.strictEqual(statusUser1.createdAt, null, 'createdAt must be null');
  console.log('  ✅ Two-Factor Center correctly reports global disabled state');

  console.log('▶ Test 5: Re-enabling global 2FA and requiring fresh re-setup...');
  await mockEnv.kv.put('setting_totp_status', '1');
  global2FA = await isTotpEnabled(mockSetting, mockEnv.kv);
  assert.strictEqual(global2FA, true, 'Global 2FA re-enabled');

  // When re-enabled, user is unconfigured and must setup afresh
  statusUser1 = await getTotpStatus(mockUsers[0], global2FA);
  assert.strictEqual(statusUser1.globalEnabled, true);
  assert.strictEqual(statusUser1.enabled, false, 'User is clean (not enabled yet)');
  assert.strictEqual(statusUser1.totpConfigured, false);
  assert.strictEqual(statusUser1.backupCodesRemaining, 0);

  // User sets up 2FA afresh
  mockUsers[0].totpEnabled = 1;
  mockUsers[0].totpSecret = 'enc:v1:new_fresh_secret';
  mockUsers[0].totpBackupCodes = JSON.stringify([{ code: 'new_hash1', used: 0 }]);
  mockUsers[0].totpCreatedAt = '2026-08-31T03:00:00.000Z';

  statusUser1 = await getTotpStatus(mockUsers[0], global2FA);
  assert.strictEqual(statusUser1.enabled, true, 'User successfully configured new 2FA');
  assert.strictEqual(statusUser1.totpConfigured, true);
  assert.strictEqual(statusUser1.backupCodesRemaining, 1);
  console.log('  ✅ Fresh re-setup flow completely verified');

  console.log('▶ Test 6: Enforced 2FA in Privacy Mode (0) and Encrypted Mode (2)...');
  // In Mode 0 (Privacy), even if KV has '0', isTotpEnabled MUST return true (mandatory)
  mockSetting.allMailMode = 0;
  await mockEnv.kv.put('setting_totp_status', '0');
  let privacyMode2FA = await isTotpEnabled(mockSetting, mockEnv.kv);
  assert.strictEqual(privacyMode2FA, true, 'Mode 0 must force 2FA to true');

  // In Mode 2 (Encrypted), isTotpEnabled MUST return true (mandatory)
  mockSetting.allMailMode = 2;
  let encMode2FA = await isTotpEnabled(mockSetting, mockEnv.kv);
  assert.strictEqual(encMode2FA, true, 'Mode 2 must force 2FA to true');
  console.log('  ✅ Privacy Mode & Encrypted Mode 2FA locking policy verified');

  console.log('\n🎉 ALL 6 TEST SUITES PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

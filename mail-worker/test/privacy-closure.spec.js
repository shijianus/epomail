import { env, SELF } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import userService from '../src/service/user-service.js';
import publicService from '../src/service/public-service.js';
import telegramService from '../src/service/telegram-service.js';
import deviceTrustService from '../src/service/device-trust-service.js';
import attService from '../src/service/att-service.js';
import r2Service from '../src/service/r2-service.js';
import s3Service from '../src/service/s3-service.js';
import roleService from '../src/service/role-service.js';
import rbacGuard from '../src/service/rbac-guard-service.js';
import securityNoticeService from '../src/service/security-notice-service.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { authorizeTelegramRead, issueTelegramReadToken } from '../src/service/telegram-share-service.js';
import { getObjectDeletionCounts } from '../src/service/privacy-revocation-service.js';
import { buildSignedObjectUrl, verifyObjectAccess } from '../src/utils/object-token.js';
import { sanitizeSharedEmailHtml, SHARED_EMAIL_CSP } from '../src/utils/safe-email-html.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import emailTextTemplate from '../src/template/email-text.js';

const uid = 47002;
const aid = 48002;
const mid = 49002;
const attId = 50002;
const mailAddress = 'privacy-owner@example.com';
const blobKey = 'attachments/privacy-closure.png';
const base = 'https://example.com';
const c = { env, get: () => undefined, set: () => {}, req: { header: () => '', raw: {} } };
const personalTelegram = { enabled: true, botToken: 'test-personal-token', chatId: '123', topicId: '', mode: 'all', notifyCodeOnly: true, includePreview: true };
const settings = { publicProfile: 1, userTgForward: 1, userByoStorage: 1, tgBotStatus: 0, tgBotToken: 'test-system-token', tgChatId: '456', allMailMode: 1, ruleType: 0 };
const userSql = `CREATE TABLE IF NOT EXISTS user (
 user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, type INTEGER NOT NULL DEFAULT 2,
 password TEXT NOT NULL DEFAULT 'not-a-login-password', salt TEXT NOT NULL DEFAULT 'unit-salt',
 status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0,
 create_time TEXT DEFAULT CURRENT_TIMESTAMP, active_time TEXT, create_ip TEXT, active_ip TEXT,
 os TEXT, browser TEXT, device TEXT, sort INTEGER DEFAULT 0, send_count INTEGER DEFAULT 0,
 reg_key_id INTEGER NOT NULL DEFAULT 0, custom_labels TEXT NOT NULL DEFAULT '[]',
 totp_enabled INTEGER NOT NULL DEFAULT 0, totp_secret TEXT NOT NULL DEFAULT '', totp_key_version INTEGER NOT NULL DEFAULT 1,
 totp_backup_codes TEXT NOT NULL DEFAULT '[]', totp_created_at TEXT NOT NULL DEFAULT '', security_keys TEXT NOT NULL DEFAULT '[]',
 auth_version INTEGER NOT NULL DEFAULT 0, passkey_history INTEGER NOT NULL DEFAULT 0,
 storage_quota_mb INTEGER NOT NULL DEFAULT 0, byo_storage_enabled INTEGER NOT NULL DEFAULT 0, byo_storage_config TEXT NOT NULL DEFAULT '{}',
 telegram_share_version INTEGER NOT NULL DEFAULT 0, deletion_requested_at TEXT NOT NULL DEFAULT '', deletion_status TEXT NOT NULL DEFAULT ''
)`;
const accountSql = `CREATE TABLE IF NOT EXISTS account (
 account_id INTEGER PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL,
 status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0, all_receive INTEGER NOT NULL DEFAULT 0,
 sort INTEGER NOT NULL DEFAULT 0, latest_email_time TEXT, create_time TEXT DEFAULT CURRENT_TIMESTAMP
)`;
const emailSql = `CREATE TABLE IF NOT EXISTS email (
 email_id INTEGER PRIMARY KEY, send_email TEXT, name TEXT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
 subject TEXT, code TEXT NOT NULL DEFAULT '', text TEXT, content TEXT, cc TEXT DEFAULT '[]', bcc TEXT DEFAULT '[]', recipient TEXT,
 to_email TEXT NOT NULL DEFAULT '', to_name TEXT NOT NULL DEFAULT '', in_reply_to TEXT DEFAULT '', relation TEXT DEFAULT '', message_id TEXT DEFAULT '',
 type INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL DEFAULT 0, resend_email_id TEXT, message TEXT, unread INTEGER NOT NULL DEFAULT 0,
 create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_del INTEGER NOT NULL DEFAULT 0, is_spam INTEGER NOT NULL DEFAULT 0,
 snoozed_time TEXT, snoozed_end_time TEXT, labels TEXT NOT NULL DEFAULT '[]',
 trashed_at TEXT, spam_at TEXT, receive_claim_key TEXT, outbound_task_id TEXT
)`;
const attachmentSql = `CREATE TABLE IF NOT EXISTS attachments (
 att_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, email_id INTEGER NOT NULL, account_id INTEGER NOT NULL, key TEXT NOT NULL,
 filename TEXT, mime_type TEXT, size INTEGER, status TEXT NOT NULL DEFAULT '0', type INTEGER NOT NULL DEFAULT 0,
 disposition TEXT, related TEXT, content_id TEXT, encoding TEXT, create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

async function setProfile(value) {
 await env.kv.put(`USER_PROFILE_${uid}`, JSON.stringify(value));
}
async function makeSession() {
 const token = 'test-privacy-session';
 await env.kv.put(`auth-uid:${uid}`, JSON.stringify({
  user: { userId: uid, email: mailAddress, type: 2, isDel: 0, status: 0 }, tokens: [token],
  refreshTime: new Date().toISOString(), authVersion: 0
 }));
 return jwtUtils.generateToken(c, { userId: uid, token, authVersion: 0 }, 3600);
}
async function readPage(token) {
 return SELF.fetch(`${base}/api/telegram/getEmail/${token}`);
}
async function readAttachment(token, id = attId) {
 return SELF.fetch(`${base}/api/telegram/attachment/${token}/${id}`);
}
async function clearKv() {
 const names = [];
 let cursor;
 do {
  const page = await env.kv.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
  names.push(...page.keys.map(key => key.name));
  cursor = page.list_complete ? null : page.cursor;
 } while (cursor);
 for (const name of names) await env.kv.delete(name);
}

beforeAll(async () => {
 for (const ddl of [userSql, accountSql, emailSql, attachmentSql,
  'CREATE TABLE IF NOT EXISTS star (user_id INTEGER, email_id INTEGER)',
  'CREATE TABLE IF NOT EXISTS oauth (oauth_id INTEGER PRIMARY KEY, user_id INTEGER)',
  'CREATE TABLE IF NOT EXISTS oauth_grant (id INTEGER PRIMARY KEY, user_id INTEGER, client_id TEXT)',
  'CREATE TABLE IF NOT EXISTS oauth_one_time_credential (token_hash TEXT PRIMARY KEY, payload TEXT, consumed INTEGER DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS legal_acceptance (id INTEGER PRIMARY KEY, user_id INTEGER)',
  'CREATE TABLE IF NOT EXISTS role (role_id INTEGER PRIMARY KEY, name TEXT, key TEXT, role_code TEXT)',
  'CREATE TABLE IF NOT EXISTS perm (perm_id INTEGER PRIMARY KEY, name TEXT, perm_key TEXT, pid INTEGER DEFAULT 0, type INTEGER DEFAULT 2)',
  'CREATE TABLE IF NOT EXISTS role_perm (id INTEGER PRIMARY KEY AUTOINCREMENT, role_id INTEGER, perm_id INTEGER)',
  `CREATE TABLE IF NOT EXISTS object_deletion_queue (
   id INTEGER PRIMARY KEY AUTOINCREMENT, object_key TEXT NOT NULL, user_id INTEGER NOT NULL DEFAULT 0,
   attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
   next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   UNIQUE(object_key, user_id))`
 ]) await env.db.prepare(ddl).run();
 await env.db.prepare("INSERT OR IGNORE INTO role (role_id, name, key, role_code) VALUES (2, 'User', 'user', 'user_lv0')").run();
 await env.db.prepare("INSERT OR IGNORE INTO perm (perm_id, name, perm_key, pid, type) VALUES (1, 'Delete Self', 'my:delete', 0, 2)").run();
 await env.db.prepare("INSERT OR IGNORE INTO role_perm (role_id, perm_id) VALUES (2, 1)").run();
 await ensureMailReliabilitySchema(c);
});

beforeEach(async () => {
 await env.db.prepare('INSERT INTO user (user_id, email) VALUES (?, ?)').bind(uid, mailAddress).run();
 await env.db.prepare('INSERT INTO account (account_id, user_id, email, name, all_receive) VALUES (?, ?, ?, ?, 1)')
  .bind(aid, uid, mailAddress, 'privacy-owner').run();
 await env.db.prepare(`INSERT INTO email (email_id, user_id, account_id, send_email, to_email, subject, content, text)
  VALUES (?, ?, ?, 'sender@private-source.example', ?, 'Private subject', ?, 'Private text')`)
  .bind(mid, uid, aid, mailAddress, `<p>Private body</p><img src="{{domain}}${blobKey}"><img src="https://tracking.example/pixel">`).run();
 await env.db.prepare(`INSERT INTO attachments (att_id, user_id, email_id, account_id, key, filename, mime_type, content_id, size)
  VALUES (?, ?, ?, ?, ?, 'private.png', 'image/png', '<picture>', 20)`)
  .bind(attId, uid, mid, aid, blobKey).run();
 await env.kv.put(blobKey, 'private-image-bytes', { metadata: { contentType: 'image/png' } });
 await env.kv.put('setting:', JSON.stringify(settings));
 await setProfile({ nickname: 'Visible name', showStats: true, showTrend: true, showSources: true, personalTelegram });
 vi.spyOn(roleService, 'selectById').mockResolvedValue({ name: 'User', roleId: 2 });
 vi.spyOn(rbacGuard, 'assertCanManageUser').mockResolvedValue(undefined);
 vi.spyOn(securityNoticeService, 'sendNotice').mockResolvedValue(undefined);
});

afterEach(async () => {
 vi.restoreAllMocks();
 vi.unstubAllGlobals();
 for (const table of ['attachments', 'email', 'account', 'user', 'star', 'oauth', 'oauth_grant', 'oauth_one_time_credential', 'legal_acceptance', 'object_deletion_queue']) {
  await env.db.prepare(`DELETE FROM ${table}`).run();
 }
 await clearKv();
});

describe('authoritative public and Telegram privacy closure', () => {
 it('serves an active share with a state-bound attachment, no remote resource, and restrictive headers', async () => {
  const token = await issueTelegramReadToken(c, mid, 'personal');
  expect(token).toBeTruthy();
  const response = await readPage(token);
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain('Private body');
  expect(html).toContain(`/api/telegram/attachment/${token}/${attId}`);
  expect(html).not.toContain('tracking.example');
  expect(html).not.toContain('/oss/');
  expect(html).not.toContain('<script');
  expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  expect(response.headers.get('Content-Security-Policy')).not.toContain('https:');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  const download = await readAttachment(token);
  expect(download.status).toBe(200);
  expect(download.headers.get('Cache-Control')).toContain('no-store');
  expect(await download.text()).toBe('private-image-bytes');
  expect((await readAttachment(token, attId + 1)).status).toBe(404);
 });

 it.each([
  ['user soft deletion', 'UPDATE user SET is_del = 1 WHERE user_id = ?', uid],
  ['user disable', 'UPDATE user SET status = 1 WHERE user_id = ?', uid],
  ['mailbox soft deletion', 'UPDATE account SET is_del = 1 WHERE account_id = ?', aid],
  ['mailbox disable', 'UPDATE account SET status = 1 WHERE account_id = ?', aid]
 ])('denies profile, public email list, share and attachment after %s', async (_, sql, id) => {
  const token = await issueTelegramReadToken(c, mid, 'personal');
  await env.db.prepare(sql).bind(id).run();
  await expect(publicService.getProfile(c, mailAddress)).rejects.toMatchObject({ code: 404 });
  expect(await publicService.emailList(c, {})).toEqual([]);
  const response = await readPage(token);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain('Private body');
  expect((await readAttachment(token)).status).toBe(404);
 });

 it('denies a deleted mail and its attachment without leaking deleted mail in profile statistics', async () => {
  const token = await issueTelegramReadToken(c, mid, 'personal');
  await env.db.prepare('UPDATE email SET is_del = 1 WHERE email_id = ?').bind(mid).run();
  expect((await readPage(token)).status).toBe(404);
  expect((await readAttachment(token)).status).toBe(404);
  expect(await publicService.emailList(c, { isDel: 1 })).toEqual([]);
  const profile = await publicService.getProfile(c, mailAddress);
  expect(profile.stats.todayReceived).toBe(0);
  expect(profile.sources.total).toBe(0);
 });

 it('enforces each public visibility switch in JSON, not only in Vue', async () => {
  const active = await publicService.getProfile(c, 'privacy-owner');
  expect(active.stats.todayReceived).toBe(1);
  expect(active.sources.top[0].domain).toBe('private-source.example');
  for (const field of ['showStats', 'showTrend', 'showSources']) {
   await setProfile({ showStats: true, showTrend: true, showSources: true, [field]: false });
   const data = await publicService.getProfile(c, 'privacy-owner');
   expect(data.userInfo[field]).toBe(false);
   if (field === 'showStats') expect(data.stats).toBeNull();
   if (field === 'showTrend') expect(data.trend).toEqual([]);
   if (field === 'showSources') {
    expect(data.sources).toBeNull();
    expect(JSON.stringify(data)).not.toContain('private-source.example');
   }
  }
 });

 it('stopping personal TG blocks existing personal links even after re-enabling, while system configuration is checked separately', async () => {
  const personal = await issueTelegramReadToken(c, mid, 'personal');
  await userService.updateProfile(c, { personalTelegram: { ...personalTelegram, enabled: false } }, uid);
  expect((await readPage(personal)).status).toBe(404);
  expect((await readAttachment(personal)).status).toBe(404);
  const system = await issueTelegramReadToken(c, mid, 'system');
  expect(system).toBeTruthy();
  expect((await readPage(system)).status).toBe(200);
  await userService.updateProfile(c, { personalTelegram }, uid);
  expect((await readPage(personal)).status).toBe(404);
  const fresh = await issueTelegramReadToken(c, mid, 'personal');
  expect((await readPage(fresh)).status).toBe(200);
  await env.kv.put('setting:', JSON.stringify({ ...settings, tgBotStatus: 1 }));
  expect((await readPage(system)).status).toBe(404);
 });

 it('rejects stale KV profile state immediately after the authoritative version is revoked', async () => {
  const oldProfile = await env.kv.get(`USER_PROFILE_${uid}`);
  const token = await issueTelegramReadToken(c, mid, 'personal');
  await telegramService.revokeLinks(c, uid);
  await env.kv.put(`USER_PROFILE_${uid}`, oldProfile);
  expect(await issueTelegramReadToken(c, mid, 'personal')).toBeNull();
  expect(await authorizeTelegramRead(c, token)).toBeNull();
 });

 it('provides authenticated all-links revoke, rejects anonymous revoke and never uses a body userId', async () => {
  const personal = await issueTelegramReadToken(c, mid, 'personal');
  const system = await issueTelegramReadToken(c, mid, 'system');
  const anonymous = await SELF.fetch(`${base}/api/my/telegram/revokeLinks`, { method: 'POST' });
  expect((await anonymous.json()).code).toBe(401);
  const jwt = await makeSession();
  const response = await SELF.fetch(`${base}/api/my/telegram/revokeLinks`, {
   method: 'POST', headers: { Authorization: jwt, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid + 1 })
  });
  expect((await response.json()).data).toMatchObject({ revoked: true, scope: 'all_existing_telegram_links', version: 1 });
  for (const token of [personal, system]) {
   expect((await readPage(token)).status).toBe(404);
   expect((await readAttachment(token)).status).toBe(404);
  }
  expect(await issueTelegramReadToken(c, mid, 'personal')).toBeTruthy();
 });

 it('retires unscoped legacy TG tokens and v1 object signatures, not fresh v2 downloads', async () => {
  const oldRead = await jwtUtils.generateToken(c, { emailId: mid }, 3600);
  expect((await readPage(oldRead)).status).toBe(404);
  const expires = Math.floor(Date.now() / 1000) + 60;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.jwt_secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`epomail-object-v1\n${blobKey}\n${expires}\n${uid}`));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const oldUrl = new URL(`${base}/oss/${blobKey}?exp=${expires}&uid=${uid}&sig=${sig}`);
  expect(await verifyObjectAccess(c, blobKey, oldUrl)).toBeNull();
  oldUrl.searchParams.set('v', '2');
  expect(await verifyObjectAccess(c, blobKey, oldUrl)).toBeNull();
  const fresh = await buildSignedObjectUrl(c, blobKey, { userId: uid, ttlSeconds: 60 });
  expect(await verifyObjectAccess(c, blobKey, new URL(fresh, base))).toMatchObject({ userId: uid });
  const response = await SELF.fetch(new URL(fresh, base));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('private-image-bytes');
 });
});

describe('deletion request and original object-storage location', () => {
 it('records a soft deletion, closes all receiving accounts, clears grants and sessions, but does not claim physical deletion', async () => {
  const jwt = await makeSession();
  await env.db.prepare('INSERT INTO account (account_id,user_id,email,name) VALUES (?, ?, ?, ?)').bind(aid + 1, uid, 'alias@example.com', 'alias').run();
  await env.db.prepare('INSERT INTO oauth_grant (user_id,client_id) VALUES (?, ?)').bind(uid, 'test-client').run();
  await env.db.prepare('INSERT INTO oauth_one_time_credential (token_hash,payload) VALUES (?, ?)').bind('unit-hash', JSON.stringify({ userId: uid })).run();
  await env.kv.put('API_TOKEN_orphan-test', JSON.stringify({ userId: uid }));
  await env.kv.put('totp_pending:test', JSON.stringify({ userId: uid }));
  await env.kv.put(`dev_trust:test:${uid}`, JSON.stringify({ userId: uid }));
  const token = await issueTelegramReadToken(c, mid, 'personal');
  const response = await SELF.fetch(`${base}/api/my/delete`, { method: 'DELETE', headers: { Authorization: jwt } });
  const body = await response.json();
  expect(body.code).toBe(200);
  expect(body.data).toMatchObject({ accountDisabled: true, cleanupComplete: true, physicalDeletionComplete: false, deletionStatus: 'manual_review' });
  expect(Number.isNaN(Date.parse(body.data.deletionRequestedAt))).toBe(false);
  const user = await env.db.prepare('SELECT is_del,status,deletion_status FROM user WHERE user_id = ?').bind(uid).first();
  expect(user).toMatchObject({ is_del: 1, status: 1, deletion_status: 'manual_review' });
  const accounts = await env.db.prepare('SELECT is_del,status,all_receive FROM account WHERE user_id = ?').bind(uid).all();
  expect(accounts.results).toHaveLength(2);
  expect(accounts.results.every(row => row.is_del === 1 && row.status === 1 && row.all_receive === 0)).toBe(true);
  for (const key of [`auth-uid:${uid}`, 'API_TOKEN_orphan-test', 'totp_pending:test', `dev_trust:test:${uid}`]) expect(await env.kv.get(key)).toBeNull();
  expect(await env.db.prepare('SELECT * FROM oauth_grant WHERE user_id = ?').bind(uid).first()).toBeNull();
  expect(await env.db.prepare('SELECT * FROM oauth_one_time_credential').first()).toBeNull();
  expect(await env.db.prepare('SELECT email_id FROM email WHERE email_id = ?').bind(mid).first()).toBeTruthy();
  expect((await readPage(token)).status).toBe(404);
  expect((await readAttachment(token)).status).toBe(404);
  await expect(userService.restore(c, { userId: uid, type: 1 }, 1)).rejects.toMatchObject({ errorCode: 'deletion_request_pending' });
 });

 it('marks disabled before any KV cleanup and reports failures rather than success', async () => {
  const operations = [];
  const brokenKv = {
   get: async (...args) => env.kv.get(...args), put: async (...args) => env.kv.put(...args), list: async (...args) => env.kv.list(...args),
   delete: async key => {
    const row = await env.db.prepare('SELECT is_del,status FROM user WHERE user_id = ?').bind(uid).first();
    operations.push(row);
    if (key === `auth-uid:${uid}`) throw new Error('test backend unavailable');
    return env.kv.delete(key);
   }
  };
  await expect(userService.delete({ ...c, env: { ...env, kv: brokenKv } }, uid)).rejects.toMatchObject({ code: 503, errorCode: 'account_deletion_cleanup_failed' });
  expect(operations.length).toBeGreaterThan(0);
  expect(operations.every(row => row.is_del === 1 && row.status === 1)).toBe(true);
  expect((await env.db.prepare('SELECT deletion_status FROM user WHERE user_id = ?').bind(uid).first()).deletion_status).toBe('cleanup_failed');
 });

 it('keeps BYO credentials and manual-review status when object deletion fails, then permits completion after a successful retry', async () => {
  const byo = { bucket: 'unit-bucket', endpoint: 'https://unit-storage.example', s3AccessKey: 'test-key', s3SecretKey: 'test-secret' };
  await env.db.prepare('UPDATE user SET byo_storage_enabled=1,byo_storage_config=? WHERE user_id=?').bind(JSON.stringify(byo), uid).run();
  await env.db.prepare('INSERT INTO legal_acceptance (user_id) VALUES (?)').bind(uid).run();
  const remove = vi.spyOn(s3Service, 'deleteObj').mockRejectedValue(new Error('test-storage-offline'));
  await expect(userService.physicsDelete(c, { userIds: [uid] }, 1)).rejects.toMatchObject({ code: 409, errorCode: 'object_deletion_pending' });
  const preserved = await env.db.prepare('SELECT byo_storage_config,deletion_status FROM user WHERE user_id=?').bind(uid).first();
  expect(JSON.parse(preserved.byo_storage_config)).toEqual(byo);
  expect(preserved.deletion_status).toBe('manual_review');
  expect((await getObjectDeletionCounts(c, uid)).total).toBe(1);
  await expect(userService.clearUserStorage(c, uid)).rejects.toMatchObject({ errorCode: 'storage_in_use' });
  remove.mockResolvedValue(undefined);
  await env.kv.put('setting:', JSON.stringify({ ...settings, userByoStorage: 0 }));
  await env.db.prepare("UPDATE object_deletion_queue SET next_retry_at='2000-01-01' WHERE user_id=?").bind(uid).run();
  expect((await attService.drainObjectDeletionQueue(c)).deleted).toBe(1);
  expect(remove).toHaveBeenLastCalledWith(c, [blobKey], byo);
  const deleted = await userService.physicsDelete(c, { userIds: [uid] }, 1);
  expect(deleted.deletedUserIds).toEqual([uid]);
  expect(await env.db.prepare('SELECT user_id FROM user WHERE user_id=?').bind(uid).first()).toBeNull();
  expect(await env.db.prepare('SELECT user_id FROM legal_acceptance WHERE user_id=?').bind(uid).first()).toBeNull();
 });

 it('does not fall back to default storage when an enabled BYO configuration is empty or invalid', async () => {
  for (const value of ['', '{}', '{invalid']) {
   await env.db.prepare('UPDATE user SET byo_storage_enabled=1,byo_storage_config=? WHERE user_id=?').bind(value, uid).run();
   await expect(r2Service.delete(c, blobKey, uid)).rejects.toThrow('Original BYO storage configuration');
   expect(await env.kv.get(blobKey)).toBe('private-image-bytes');
  }
 });

 it('cannot falsely finish a queued delete when its original owner disappeared', async () => {
  await env.db.prepare('DELETE FROM user WHERE user_id=?').bind(uid).run();
  await expect(r2Service.delete(c, blobKey, uid)).rejects.toThrow('Original object storage owner');
  expect(await env.kv.get(blobKey)).toBe('private-image-bytes');
 });
});

describe('trusted device pagination and failure reporting', () => {
 function kvWithDevices({ fail = '' } = {}) {
  const data = new Map();
  for (let i = 0; i < 245; i++) data.set(`dev_trust:${String(i).padStart(4, '0')}:${uid}`, 'device');
  data.set(`dev_trust:other:${uid + 1}`, 'untouched');
  const kv = {
   list: vi.fn(async ({ prefix, cursor = '' }) => {
    const matching = [...data.keys()].sort().filter(name => name.startsWith(prefix) && name > cursor);
    const names = matching.slice(0, 100);
    return { keys: names.map(name => ({ name })), list_complete: matching.length <= 100, cursor: names.at(-1) || '' };
   }),
   delete: vi.fn(async name => {
    if (name === fail) throw new Error('unit deletion failed');
    data.delete(name);
   })
  };
  return { kv, data };
 }

 it('revokes more than 100 devices across every page without touching another user', async () => {
  const { kv, data } = kvWithDevices();
  expect(await deviceTrustService.revokeAllTrust({ env: { kv } }, uid)).toBe(245);
  expect(kv.list).toHaveBeenCalledTimes(3);
  expect([...data.keys()]).toEqual([`dev_trust:other:${uid + 1}`]);
 });

 it('attempts later pages after a failed delete and does not report a successful revocation', async () => {
  const failed = `dev_trust:0001:${uid}`;
  const { kv, data } = kvWithDevices({ fail: failed });
  await expect(deviceTrustService.revokeAllTrust({ env: { kv } }, uid)).rejects.toThrow('incomplete');
  expect(kv.list).toHaveBeenCalledTimes(3);
  expect([...data.keys()]).toEqual([failed, `dev_trust:other:${uid + 1}`]);
 });

 it('fails closed if KV declares an unfinished listing but cannot advance its cursor', async () => {
  const kv = { list: vi.fn(async () => ({ keys: [], list_complete: false })), delete: vi.fn() };
  await expect(deviceTrustService.revokeAllTrust({ env: { kv } }, uid)).rejects.toThrow('Incomplete KV listing');
 });
});

describe('privacy input validation and active content isolation', () => {
 it('accepts only the explicit boolean AI-code preference while preserving unrelated profile fields', async () => {
  await userService.updateProfile(c, { privacyPreferences: { aiVerificationCode: true } }, uid);
  const saved = await env.kv.get(`USER_PROFILE_${uid}`, { type: 'json' });
  expect(saved.nickname).toBe('Visible name');
  expect(saved.personalTelegram).toEqual(personalTelegram);
  expect(saved.privacyPreferences).toEqual({ aiVerificationCode: true });
  for (const value of [true, [], null, {}, { aiVerificationCode: 'true' }, { aiVerificationCode: true, allConsent: true }]) {
   await expect(userService.updateProfile(c, { privacyPreferences: value }, uid)).rejects.toMatchObject({ code: 400, errorCode: 'invalid_privacy_preferences' });
  }
 });

 it('drops remote images, CSS, SVG, active tags and unknown href schemes without removing basic text structure', () => {
  const sanitized = sanitizeSharedEmailHtml(`<style>@import 'https://track.example/style';</style>
   <p style="background:url(https://track.example/bg)" onclick="evil()">Readable <strong>message</strong></p>
   <img src="https://track.example/pixel" srcset="https://track.example/a 2x" alt="image caption">
   <svg><image href="https://track.example/svg" /></svg><iframe src="https://track.example/frame"></iframe>
   <a href="javascript:alert(1)">bad</a><a href="customapp:secret">unknown</a><a href="//track.example/x">relative</a>
   <a href="https://safe.example/path" ping="https://track.example/ping">explicit link</a>
   <table><tr><td colspan="2">Cell</td></tr></table>`);
  expect(sanitized).toContain('<p>Readable <strong>message</strong></p>');
  expect(sanitized).toContain('<table>');
  expect(sanitized).toContain('image caption');
  expect(sanitized).toContain('rel="noopener noreferrer"');
  expect(sanitized).not.toMatch(/track\.example|javascript:|customapp:|onclick|style=|srcset|<svg|<iframe/);
  expect(SHARED_EMAIL_CSP).toContain("connect-src 'none'");
  expect(emailTextTemplate('<img src=x onerror=evil()>')).not.toContain('<img');
 });
});

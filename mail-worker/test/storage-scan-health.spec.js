import { env } from 'cloudflare:test';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import storageScanService from '../src/service/storage-scan-service.js';
import r2Service from '../src/service/r2-service.js';
import s3Service from '../src/service/s3-service.js';
import settingService from '../src/service/setting-service.js';

const mailDb = env.NOTICE_MAIL_DB;
const userDb = env.NOTICE_USER_DB;
const fixedKV = { list: async () => ({ keys: [], list_complete: true }) };
const context = (settings = {}, bindings = {}) => ({
	get: name => name === 'setting' ? settings : undefined,
	env: { MAIL_DB: mailDb, USER_DB: userDb, kv: fixedKV, ...bindings }
});
const s3Settings = { bucket: 'fixture', endpoint: 'https://storage.invalid',
	s3AccessKey: 'fixture-access', s3SecretKey: 'fixture-secret' };

beforeAll(async () => {
	await mailDb.prepare('CREATE TABLE attachments(key TEXT, size INTEGER, mime_type TEXT)').run();
	await mailDb.prepare('CREATE TABLE object_deletion_queue(status TEXT, next_retry_at TEXT)').run();
	await mailDb.prepare('CREATE TABLE mail_receive_claim(raw_object_key TEXT)').run();
	await userDb.prepare('CREATE TABLE user(byo_storage_enabled INTEGER)').run();
});
afterEach(() => vi.restoreAllMocks());

it('retains numeric zeros and old response fields for an empty, measured KV installation', async () => {
	const scan = await storageScanService.scan(context());
	expect(scan).toMatchObject({ ok: true, status: 'ok', healthScore: 100,
		kv: { bound: true, totalKeys: 0 }, d1: { totalAttachments: 0, totalBytes: 0, totalMb: 0 },
		storage: { resolvedType: 'KV', byoUsersCount: 0, s3: { configured: false, status: 'not_configured', ok: null } },
		orphans: { status: 'ok', orphanCount: 0 }, deletionQueue: { status: 'ok', pending: 0, failed: 0 } });
	expect(Date.parse(scan.deletionQueue.checkedAt)).not.toBeNaN();
});

it('returns null measurements for missing bindings and settings without discarding the whole report', async () => {
	vi.spyOn(settingService, 'query').mockRejectedValue(new Error('fixture settings unavailable'));
	const scan = await storageScanService.scan({ env: {} });
	expect(scan).toMatchObject({ ok: false, status: 'unknown', healthScore: null,
		kv: { status: 'unknown', totalKeys: null }, d1: { status: 'unknown', totalBytes: null },
		storage: { activeEngine: null, byoUsersCount: null, s3: { status: 'unknown', ok: null } },
		orphans: { status: 'unknown', orphanCount: null }, deletionQueue: { status: 'unknown', pending: null, failed: null } });
});

it('keeps good D1 metrics when the object probe fails and distinguishes an unprobed S3 configuration', async () => {
	await mailDb.prepare("INSERT INTO attachments VALUES ('attachments/fixture',12,'image/png')").run();
	await mailDb.prepare("INSERT INTO object_deletion_queue VALUES ('failed', CURRENT_TIMESTAMP)").run();
	const listing = vi.spyOn(r2Service, 'listObjects').mockResolvedValue({ backend: 'S3', objects: [], truncated: false });
	const probe = vi.spyOn(s3Service, 'testConnection').mockResolvedValue({ ok: true, latencyMs: 0 });
	const incomplete = await storageScanService.scan(context({ ...s3Settings, s3SecretKey: '******' }));
	expect(incomplete.storage.s3).toMatchObject({ configured: true, ok: null, status: 'unknown', checkedAt: null });
	expect(listing).not.toHaveBeenCalled();
	expect(probe).not.toHaveBeenCalled();
	const measured = await storageScanService.scan(context(s3Settings));
	expect(measured.storage.s3).toMatchObject({ status: 'ok', ok: true, latencyMs: 0 });
	expect(measured.deletionQueue).toMatchObject({ status: 'ok', pending: 0, failed: 1 });
	expect(measured.ok).toBe(false);
	probe.mockRejectedValueOnce(new Error('fixture S3 unavailable'));
	const mixed = await storageScanService.scan(context(s3Settings));
	expect(mixed).toMatchObject({ status: 'partial', d1: { status: 'ok', totalAttachments: 1, totalBytes: 12 },
		storage: { s3: { status: 'error', ok: false, latencyMs: null } } });
	expect(Date.parse(mixed.storage.s3.checkedAt)).not.toBeNaN();
});

it('preserves measured KV counts when mail D1 fails, and never labels a bounded KV sample as the total', async () => {
	const c = context({}, { MAIL_DB: { prepare() { throw new Error('fixture D1 unavailable'); } } });
	const mixed = await storageScanService.scan(c);
	expect(mixed).toMatchObject({ status: 'partial', kv: { status: 'ok', totalKeys: 0 },
		d1: { status: 'unknown', totalAttachments: null }, deletionQueue: { status: 'unknown', pending: null } });
	const kv = { list: async options => options.prefix ? { keys: [], list_complete: true }
		: { keys: [{ name: 'settings' }], list_complete: false, cursor: 'more' } };
	const truncated = await storageScanService.scan(context({}, { kv }));
	expect(truncated.kv).toMatchObject({ status: 'unknown', totalKeys: null, attachmentKeys: null });
	expect(truncated.d1.status).toBe('ok');
});

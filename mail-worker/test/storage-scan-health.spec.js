import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureStorageProbeHistory, recordStorageProbeHistory } from '../src/utils/storage-probe-history.js';
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
	await mailDb.prepare('CREATE TABLE mail_receive_claim(raw_object_key TEXT, cleanup_attempts INTEGER DEFAULT 0, cleanup_review_at INTEGER DEFAULT 0)').run();
	await userDb.prepare('CREATE TABLE user(user_id INTEGER PRIMARY KEY, byo_storage_enabled INTEGER)').run();
	await ensureStorageProbeHistory(context());
});
afterEach(() => vi.restoreAllMocks());

describe('bounded KV orphan cleanup', () => {
	it('keeps active and undated verification records and deletes only proven expired keys', async () => {
		const now = Date.now();
		const kv = { list: vi.fn(async () => ({ keys: [
			{ name: 'VERIFY_TEMP_active', expiration: Math.ceil(now / 1000) + 300, metadata: { createdAt: now - 90000000 } },
			{ name: 'VERIFY_TEMP_fresh', metadata: { createdAt: now - 10 } },
			{ name: 'VERIFY_TEMP_unknown' }, { name: 'VERIFY_TEMP_expired', expiration: Math.floor(now / 1000) - 1 },
			{ name: 'VERIFY_TEMP_old', metadata: { createdAt: new Date(now - 90000000).toISOString() } }
		], list_complete: true })), delete: vi.fn() };
		const result = await storageScanService.cleanup(context({}, { kv }));
		expect(result).toMatchObject({ ok: true, cleanedCount: 2, next: { prefix: 'HAS_WELCOME_' } });
		expect(kv.delete.mock.calls.flat()).toEqual(['VERIFY_TEMP_expired','VERIFY_TEMP_old']);
	});

	it('checks ownership on the identity binding and resumes from the exact KV cursor', async () => {
		// This test owns the synthetic schema. The separate mail binding has no user table.
		const db = userDb;
		await db.prepare('INSERT INTO user(user_id) VALUES (91)').run();
		try {
			const pages = [
				{ keys: [{ name: 'HAS_WELCOME_91' }], list_complete: false, cursor: 'next-page' },
				{ keys: [{ name: 'HAS_WELCOME_92' }, { name: 'HAS_WELCOME_1e2' }], list_complete: true }
			];
			const kv = { list: vi.fn(async () => pages.shift()), delete: vi.fn() };
			const c = context({}, { USER_DB: db, kv });
			const first = await storageScanService.cleanup(c, { prefix: 'HAS_WELCOME_' });
			const next = await storageScanService.cleanup(c, first.next);
			expect(kv.list.mock.calls[1][0].cursor).toBe('next-page');
			expect(next).toMatchObject({ cleanedCount: 1, next: { prefix: 'WELCOME_ISSUED_' } });
			expect(kv.delete.mock.calls.flat()).toEqual(['HAS_WELCOME_92']);
		} finally { await db.prepare('DELETE FROM user WHERE user_id=91').run(); }
	});

	it('reports failed listing and failed authoritative lookup without deleting keys', async () => {
		const kv = { list: vi.fn(async () => ({ keys: [{ name: 'HAS_WELCOME_20' }], list_complete: true })), delete: vi.fn() };
		const c = context({}, { kv, USER_DB: { prepare() { throw new Error('unavailable'); } } });
		await expect(storageScanService.cleanup(c, { prefix: 'HAS_WELCOME_' })).rejects.toMatchObject({ errorCode: 'storage_cleanup_incomplete' });
		kv.list.mockRejectedValue(new Error('unavailable'));
		await expect(storageScanService.cleanup(c)).rejects.toMatchObject({ errorCode: 'storage_cleanup_incomplete' });
		expect(kv.delete).not.toHaveBeenCalled();
	});
});


it('retains numeric zeros and old response fields for an empty, measured KV installation', async () => {
	const scan = await storageScanService.scan(context());
	expect(scan).toMatchObject({ ok: true, status: 'ok', healthScore: 100,
		kv: { bound: true, totalKeys: 0 }, d1: { totalAttachments: 0, totalBytes: 0, totalMb: 0 },
		storage: { resolvedType: 'KV', byoUsersCount: 0, s3: { configured: false, status: 'not_configured', ok: null } },
		orphans: { status: 'ok', orphanCount: 0 }, deletionQueue: { status: 'ok', pending: 0, failed: 0 } });
	expect(Date.parse(scan.deletionQueue.checkedAt)).not.toBeNaN();
	expect(scan.inboundRawCleanup).toEqual({ status: 'ok', retrying: 0, manualReview: 0, oldestReviewAt: null });
});

it('returns null measurements for missing bindings and settings without discarding the whole report', async () => {
	vi.spyOn(settingService, 'query').mockRejectedValue(new Error('fixture settings unavailable'));
	const scan = await storageScanService.scan({ env: {} });
	expect(scan.inboundRawCleanup).toEqual({ status: 'unknown', retrying: null, manualReview: null, oldestReviewAt: null });
	expect(scan).toMatchObject({ ok: false, status: 'unknown', healthScore: null,
		kv: { status: 'unknown', totalKeys: null }, d1: { status: 'unknown', totalBytes: null },
		storage: { activeEngine: null, byoUsersCount: null, s3: { status: 'unknown', ok: null } },
		orphans: { status: 'unknown', orphanCount: null }, deletionQueue: { status: 'unknown', pending: null, failed: null } });
});

it('reports outstanding retry and review counts without exposing raw locators', async () => {
	const heldSince = 1700000000;
	try {
		await mailDb.prepare(`INSERT INTO mail_receive_claim VALUES ('raw/retry',1,0), ('raw/review',5,?), ('',0,0)`).bind(heldSince).run();
		const scan = await storageScanService.scan(context());
		expect(scan).toMatchObject({ ok: false, status: 'partial', inboundRawCleanup: {
			status: 'ok', retrying: 1, manualReview: 1, oldestReviewAt: new Date(heldSince * 1000).toISOString()
		} });
	} finally {
		await mailDb.prepare(`DELETE FROM mail_receive_claim WHERE raw_object_key IN ('raw/retry','raw/review','')`).run();
	}
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
	expect(mixed.probes.s3).toEqual({ status: 'error', lastSuccessAt: measured.probes.s3.lastSuccessAt });
	expect(measured.probes.s3.lastSuccessAt).toBe(measured.storage.s3.checkedAt);
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


it('retains prior successes when mail D1 fails and never restores current counts', async () => {
	const good = await storageScanService.scan(context());
	expect(good.historyAvailable).toBe(true);
	expect(Date.parse(good.scannedAt)).not.toBeNaN();
	const down = { prepare() { throw new Error('fixture unavailable'); } };
	const failed = await storageScanService.scan(context({}, { MAIL_DB: down }));
	for (const name of ['d1', 'deletionQueue', 'inboundRawCleanup']) {
		expect(good.probes[name].lastSuccessAt).toMatch(/^\d{4}-/);
		expect(failed.probes[name]).toEqual({ status: 'unknown', lastSuccessAt: good.probes[name].lastSuccessAt });
	}
	expect(failed).toMatchObject({ ok: false, status: 'partial', d1: { totalBytes: null }, deletionQueue: { failed: null } });
	const noHistory = await storageScanService.scan(context({}, { MAIL_DB: down, USER_DB: down }));
	expect(noHistory).toMatchObject({ historyAvailable: false, probes: {
		d1: { status: 'unknown', lastSuccessAt: null }, kv: { status: 'ok', lastSuccessAt: expect.any(String) }
	} });
});

it('ignores unrelated identifiers and prevents an earlier scan overwriting a later success', async () => {
	const later = '2030-01-01T00:00:01.000Z';
	const earlier = '2030-01-01T00:00:00.000Z';
	await recordStorageProbeHistory(context(), { kv: later, 'raw/private.eml': earlier });
	const result = await recordStorageProbeHistory(context(), { kv: earlier });
	expect(result.history.kv).toBe(later);
	const stored = (await userDb.prepare('SELECT * FROM storage_probe_history').all()).results;
	expect(stored.find(row => row.probe === 'kv')).toEqual({ probe: 'kv', last_success_at: later });
	expect(stored.some(row => row.probe.includes('/'))).toBe(false);
});

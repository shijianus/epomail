import { authoritativeCampaign } from './global-broadcast-operation.js';
import { and, eq, sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mailOrm } from '../entity/orm.js';
import email from '../entity/email.js';
import { star } from '../entity/star.js';
import { getMailDb } from '../utils/db-accessor.js';
import { LEGACY_WELCOME_PREDICATE } from '../utils/mail-reliability-schema.js';

const receipt = sqliteTable('mail_welcome_receipt', {
	userId: integer('user_id').primaryKey(),
	emailId: integer('email_id')
});
const CACHE_VERSION = 'd1-v1';

async function remember(c, userId) {
	try {
		await c.env.kv.put('HAS_WELCOME_' + userId, '1');
		await c.env.kv.put('WELCOME_ISSUED_' + userId, '1');
	} catch (_) {
		// The durable receipt is already committed.
	}
}

export async function cachedWelcome(c, userId) {
	try {
		return await c.env.kv.get('WELCOME_ISSUED_' + userId) === CACHE_VERSION;
	} catch (_) {
		return false;
	}
}

export async function hasWelcomeReceipt(c, userId) {
	const db = getMailDb(c);
	const exists = await db.prepare('SELECT 1 FROM mail_welcome_receipt WHERE user_id=?').bind(userId).first();
	if (exists) {
		await remember(c, userId);
		return true;
	}
	// Older releases may have retained only KV after a permanent message
	// deletion. If KV is unavailable, leave issuance pending for a retry.
	const issued = await c.env.kv.get('WELCOME_ISSUED_' + userId);
	if (issued !== '1' && issued !== CACHE_VERSION && await c.env.kv.get('HAS_WELCOME_' + userId) !== '1') return false;
	const adopted = await db.prepare(`INSERT OR IGNORE INTO mail_welcome_receipt(user_id)
		SELECT user_id FROM account WHERE user_id=? AND is_del=0 AND status=0 LIMIT 1`).bind(userId).run();
	if (adopted.meta.changes || await db.prepare('SELECT 1 FROM mail_welcome_receipt WHERE user_id=?').bind(userId).first()) {
		await remember(c, userId);
	}
	return true;
}

export async function persistWelcome(c, data, { isBroadcast = false, repairMissing = false } = {}) {
	const db = mailOrm(c);
	const { userId, accountId, toEmail, createTime } = data;
	const batch = [];
	if (repairMissing) {
		// Only a privileged operator can reissue a physically missing welcome.
		// Keep a trashed message, or any earlier surviving welcome broadcast.
		batch.push(db.delete(receipt).where(and(eq(receipt.userId, userId), sql`NOT EXISTS (
			SELECT 1 FROM email WHERE user_id=${userId} AND (email_id=${receipt.emailId}
				OR (is_official=1 AND message_id LIKE 'welcome.%@epocanvas.com')
				OR (${sql.raw(LEGACY_WELCOME_PREDICATE)})))`)));
	}
	// WITHOUT ROWID makes a missing/disabled/mismatched mailbox fail the
	// NOT NULL constraint. The account check and every write share a D1 batch.
	let claim = db.insert(receipt).values({
		userId: sql`(SELECT user_id FROM account WHERE account_id=${accountId} AND user_id=${userId}
			AND email=${toEmail} COLLATE NOCASE AND is_del=0 AND status=0)`
	});
	if (isBroadcast) claim = claim.onConflictDoNothing({ target: receipt.userId });
	batch.push(claim);
	const resultIndex = batch.length;
	batch.push(db.insert(email).values(data).returning(),
		db.update(receipt).set({ emailId: sql`last_insert_rowid()` }).where(eq(receipt.userId, userId)),
		db.insert(star).values({ userId, emailId: sql`last_insert_rowid()`, createTime }));
	let results;
	try {
		results = await db.batch(batch);
	} catch (error) {
		const reason = String(error?.message) + ' ' + String(error?.cause?.message);
		if (/NOT NULL constraint failed: mail_welcome_receipt\.user_id/i.test(reason)) return null;
		if (!isBroadcast && /UNIQUE constraint failed: mail_welcome_receipt\.user_id/i.test(reason)) return null;
		throw error;
	}
	await remember(c, userId);
	return results[resultIndex][0];
}

export async function completeWelcomeChecks(c, userId) {
	// A failed new-user announcement must be retried on a subsequent mailbox
	// read. Cache the fast path only after that check and durable welcome issuance.
	if (await getMailDb(c).prepare('SELECT 1 FROM mail_welcome_receipt WHERE user_id=?').bind(userId).first()) {
		try { await c.env.kv.put('WELCOME_ISSUED_' + userId, CACHE_VERSION); } catch (_) { /* Retry the cache on the next read. */ }
	}
}

const campaignReceipt = sqliteTable('mail_global_receipt', {
	userId: integer('user_id').notNull(),
	campaignId: text('campaign_id').notNull()
});

async function globalCampaignId(config) {
	if (config.broadcastId) return String(config.broadcastId);
	if (config.lastBroadcastTime) return 'time.' + config.lastBroadcastTime;
	const templates = Object.entries(config.templates || {}).sort(([a], [b]) => a.localeCompare(b))
		.map(([lang, tpl]) => [lang, tpl?.subject || '', tpl?.content || '', tpl?.text || '']);
	const legacy = JSON.stringify([config.subject || '', config.content || '', config.text || '',
		config.targetType || 'all', [...(config.targetRoleIds || [])].map(String).sort(),
		templates, config.senderName || '', config.expireDays || 0, config.isStarred ?? 1, config.lang || '']);
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacy));
	return 'legacy.' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function persistGlobal(c, data, config, isStarred, newUsersOnly) {
	const { userId, accountId, toEmail, createTime } = data;
	const db = mailOrm(c);
	const mailDb = getMailDb(c);
	const campaignId = await globalCampaignId(config);
	if (await mailDb.prepare('SELECT 1 FROM mail_global_receipt WHERE user_id=? AND campaign_id=?').bind(userId, campaignId).first()) return null;
	const kvKey = `HAS_GLOBAL_EMAIL_${userId}_${config.lastBroadcastTime || 'default'}`;
	if (!config.broadcastId) {
		// Old releases recorded only a KV marker (including after deletion) or
		// an unstamped official announcement from the active campaign.
		const marker = await c.env.kv.get(kvKey);
		const prior = marker === '1' || marker === 'd1.' + campaignId || await mailDb.prepare(`SELECT 1 FROM email
			WHERE user_id=? AND is_official=1 AND type=0 AND send_email='announcement@epocanvas.com'
			AND labels='["全域公告","官方"]' AND COALESCE(message_id,'')='' AND receive_claim_key IS NULL
			AND outbound_task_id IS NULL AND ((? <> '' AND julianday(create_time)>=julianday(?))
				OR (?='' AND subject=? AND content=?)) LIMIT 1`)
			.bind(userId, config.lastBroadcastTime || '', config.lastBroadcastTime || '', config.lastBroadcastTime || '',
				config.subject || '', config.content || '').first();
		if (prior) {
			if (!await authoritativeCampaign(c, userId, config, newUsersOnly)) return null;
			await mailDb.prepare(`INSERT OR IGNORE INTO mail_global_receipt(user_id,campaign_id)
				SELECT user_id,? FROM account WHERE account_id=? AND user_id=? AND email=? COLLATE NOCASE AND is_del=0 AND status=0`)
				.bind(campaignId, accountId, userId, toEmail).run();
			if (!config.lastBroadcastTime && marker === '1') await c.env.kv.put(kvKey, 'd1.' + campaignId);
			return null;
		}
	}
	// USER_DB and MAIL_DB cannot share a transaction. Re-check authoritative
	// eligibility immediately before the atomic mailbox ownership check/write.
	if (!await authoritativeCampaign(c, userId, config, newUsersOnly)) return null;
	const owner = sql`(SELECT user_id FROM account WHERE account_id=${accountId} AND user_id=${userId}
		AND email=${toEmail} COLLATE NOCASE AND is_del=0 AND status=0)`;
	const writes = [db.insert(campaignReceipt).values({ userId: owner, campaignId }), db.insert(email).values(data).returning()];
	if (isStarred) writes.push(db.insert(star).values({ userId, emailId: sql`last_insert_rowid()`, createTime }));
	let rows;
	try {
		[, rows] = await db.batch(writes);
	} catch (error) {
		const reason = String(error.message) + ' ' + String(error.cause?.message);
		if (/NOT NULL constraint failed: mail_global_receipt\.user_id|UNIQUE constraint failed: mail_global_receipt\.user_id, mail_global_receipt\.campaign_id/i.test(reason)) return null;
		throw error;
	}
	try { await c.env.kv.put(kvKey, config.lastBroadcastTime ? '1' : 'd1.' + campaignId); } catch (_) { /* D1 is authoritative. */ }
	return rows[0];
}

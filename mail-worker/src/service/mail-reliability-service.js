import { getMailDb } from '../utils/db-accessor.js';
import r2Service from './r2-service.js';
import attService from './att-service.js';
import { emailConst } from '../const/entity-const.js';
import { mailSha256, normalizeMailAddress } from '../utils/mail-pipeline.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const LEASE_SECONDS = 30 * 60;
const RAW_V2_PREFIX = encoder.encode('raw:v2:');
const RAW_V2_OVERHEAD = RAW_V2_PREFIX.byteLength + 12 + 16;
const KV_VALUE_LIMIT = 25 * 1024 * 1024;
export const MAX_INBOUND_RAW_BYTES = 25 * 1024 * 1024;
export const INBOUND_RAW_TTL_SECONDS = 7 * 24 * 60 * 60;
// A completed claim is a retry tombstone, not an eternal "this content may
// never be delivered again" rule. After this window a re-used Message-ID or an
// identical body is treated as a new delivery.
const COMPLETE_CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// These top-level headers describe delivery hops rather than message content.
// All other header bytes, MIME boundaries and body bytes remain significant.
const DELIVERY_HEADERS = new Set([
	'received', 'return-path', 'delivered-to', 'x-original-to', 'x-received',
	'authentication-results', 'received-spf', 'arc-authentication-results',
	'arc-message-signature', 'arc-seal'
]);

function inboundError(message, code) {
	const error = new Error(message);
	error.code = code;
	return error;
}

export async function getInboundRawMaxBytes(c, userId = null) {
	const storage = await r2Service.resolveStorage(c, userId);
	return storage.type === 'KV' ? KV_VALUE_LIMIT - RAW_V2_OVERHEAD : MAX_INBOUND_RAW_BYTES;
}

export async function inboundContentSha256(rawBytes) {
	const chunks = [];
	let offset = 0;
	let ignore = false;
	while (offset < rawBytes.byteLength) {
		const newline = rawBytes.indexOf(10, offset);
		const end = newline < 0 ? rawBytes.byteLength : newline + 1;
		const line = rawBytes.subarray(offset, end);
		const length = line.byteLength - (line[line.byteLength - 1] === 10 ? 1 : 0);
		const textLength = length - (line[length - 1] === 13 ? 1 : 0);
		if (textLength === 0) {
			chunks.push(rawBytes.subarray(offset));
			break;
		}
		if (line[0] !== 32 && line[0] !== 9) {
			const colon = line.indexOf(58);
			// Invalid header syntax is body data; never discard it as a trace field.
			if (colon < 1 || colon >= textLength) {
				chunks.push(rawBytes.subarray(offset));
				break;
			}
			ignore = DELIVERY_HEADERS.has(decoder.decode(line.subarray(0, colon)).toLowerCase());
		}
		if (!ignore) chunks.push(line);
		offset = end;
	}
	const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const canonical = new Uint8Array(size);
	let position = 0;
	for (const chunk of chunks) {
		canonical.set(chunk, position);
		position += chunk.byteLength;
	}
	return mailSha256(canonical);
}

async function deriveInboundRawKey(env, keyUsages) {
	const master = String(env?.email_enc_key || env?.totp_enc_key || '').trim();
	if (!master) throw new Error('Inbound raw-MIME encryption key is not configured');
	const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(master), 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey({
		name: 'HKDF',
		hash: 'SHA-256',
		salt: encoder.encode('epomail:inbound-raw-mime:v1'),
		info: encoder.encode('mail-receive-claim')
	}, keyMaterial, { name: 'AES-GCM', length: 256 }, false, keyUsages);
}

function base64ToBytes(value) {
	const binary = atob(value);
	return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function encryptRawMime(env, rawBytes) {
	const key = await deriveInboundRawKey(env, ['encrypt']);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: RAW_V2_PREFIX }, key, rawBytes));
	const envelope = new Uint8Array(RAW_V2_PREFIX.byteLength + iv.byteLength + cipher.byteLength);
	envelope.set(RAW_V2_PREFIX);
	envelope.set(iv, RAW_V2_PREFIX.byteLength);
	envelope.set(cipher, RAW_V2_PREFIX.byteLength + iv.byteLength);
	return envelope;
}

async function decryptRawMime(env, encrypted) {
	const bytes = encrypted instanceof Uint8Array ? encrypted : new Uint8Array(encrypted);
	const key = await deriveInboundRawKey(env, ['decrypt']);
	if (bytes.byteLength >= RAW_V2_OVERHEAD && RAW_V2_PREFIX.every((byte, i) => byte === bytes[i])) {
		return new Uint8Array(await crypto.subtle.decrypt({
			name: 'AES-GCM', additionalData: RAW_V2_PREFIX,
			iv: bytes.subarray(RAW_V2_PREFIX.byteLength, RAW_V2_PREFIX.byteLength + 12)
		}, key, bytes.subarray(RAW_V2_PREFIX.byteLength + 12)));
	}
	const parts = decoder.decode(bytes).split(':');
	if (parts.length !== 4 || parts[0] !== 'raw' || parts[1] !== 'v1') throw new Error('Stored inbound raw MIME has an unknown format');
	const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(parts[2]) }, key, base64ToBytes(parts[3]));
	return base64ToBytes(decoder.decode(plain));
}

async function readStoredRaw(c, claim) {
	if (!claim?.raw_object_key) return null;
	const object = await r2Service.getInboundRawObj(c, claim.raw_object_key, Number(claim.user_id) > 0 ? Number(claim.user_id) : null);
	if (!object) return null;
	const raw = await decryptRawMime(c.env, await object.arrayBuffer());
	if (await mailSha256(raw) !== claim.raw_sha256) throw new Error('Stored inbound raw MIME hash mismatch');
	return raw;
}

/**
 * Message-ID local parts are case-sensitive; only the domain is case
 * insensitive. Preserve the local part instead of lowercasing the whole value,
 * which used to merge distinct legitimate IDs.
 */
function canonicalMessageId(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	const bracketed = raw.startsWith('<') && raw.endsWith('>');
	const inner = bracketed ? raw.slice(1, -1) : raw;
	const at = inner.lastIndexOf('@');
	const canonical = at > 0 ? `${inner.slice(0, at)}@${inner.slice(at + 1).toLowerCase()}` : inner;
	return bracketed ? `<${canonical}>` : canonical;
}

/**
 * A COMPLETE claim suppresses retries only while it is both fresh and backed by
 * the email row it produced. If the user permanently deleted that email, or the
 * tombstone is older than the bounded window, a new delivery must be allowed.
 */
async function completedClaimStillAuthoritative(mailDb, claim) {
	if (claim.state !== 'COMPLETE') return false;
	const updatedAt = Date.parse(String(claim.updated_at || '').replace(' ', 'T') + 'Z');
	if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > COMPLETE_CLAIM_TTL_MS) return false;
	if (!claim.email_id) return false;
	const emailRow = await mailDb.prepare(
		'SELECT 1 AS present FROM email WHERE email_id = ? AND receive_claim_key = ?'
	).bind(claim.email_id, claim.claim_key).first();
	return Boolean(emailRow);
}

async function verifyClaim(c, claim, { rawSha256, contentSha256, userId, accountId }) {
	if (Number(claim.user_id) !== Number(userId) || Number(claim.account_id) !== Number(accountId)) {
		throw inboundError('Inbound claim belongs to a different recipient owner', 'inbound_owner_changed');
	}
	if (claim.content_sha256) {
		if (claim.content_sha256 === contentSha256) return;
	} else if (claim.raw_sha256 === rawSha256) {
		return;
	} else {
		// Old claims only bound the exact raw payload. Prove their content from
		// the authenticated recovery object before accepting a changed trace.
		const stored = await readStoredRaw(c, claim);
		if (stored && await inboundContentSha256(stored) === contentSha256) return;
	}
	throw inboundError('Message-ID is already bound to different MIME content', 'inbound_content_conflict');
}

export async function acquireInboundClaim(c, {
	recipient,
	messageId,
	rawBytes,
	accountId = 0,
	userId = 0,
	leaseToken = crypto.randomUUID(),
	// Callers that know the recipient has an owner pass true. Unknown-recipient
	// callers pass false so the 25 MiB recovery copy cannot bypass every quota.
	storeRaw = true
}) {
	if (!(rawBytes instanceof Uint8Array) || rawBytes.byteLength > MAX_INBOUND_RAW_BYTES) {
		throw inboundError('Raw MIME exceeds the configured inbound recovery size limit', 'inbound_raw_too_large');
	}
	const mailDb = getMailDb(c);
	const normalizedRecipient = normalizeMailAddress(recipient);
	const normalizedMessageId = canonicalMessageId(messageId);
	const rawSha256 = await mailSha256(rawBytes);
	const contentSha256 = await inboundContentSha256(rawBytes);
	const baseIdentity = normalizedMessageId ? `message:${normalizedMessageId}` : `raw:${contentSha256}`;
	let identity = baseIdentity;
	let claimKey = await mailSha256(`${normalizedRecipient}\n${identity}`);
	const input = { rawSha256, contentSha256, userId, accountId };
	let existingClaim = await mailDb.prepare(`SELECT * FROM mail_receive_claim WHERE claim_key = ?`).bind(claimKey).first();
	if (existingClaim?.state === 'COMPLETE' && !await completedClaimStillAuthoritative(mailDb, existingClaim)) {
		// A new delivery after permanent deletion (or after the bounded tombstone
		// window) gets a stable reissue identity, so its own retries still dedupe.
		identity = `${baseIdentity}:reissue:${existingClaim.updated_at || existingClaim.claim_key}`;
		claimKey = await mailSha256(`${normalizedRecipient}\n${identity}`);
		existingClaim = await mailDb.prepare(`SELECT * FROM mail_receive_claim WHERE claim_key = ?`).bind(claimKey).first();
	}
	if (existingClaim) {
		await verifyClaim(c, existingClaim, input);
		if (existingClaim.state === 'COMPLETE') return { complete: true, claimKey, emailId: existingClaim.email_id };
	}
	const now = Math.floor(Date.now() / 1000);
	// Unknown-recipient callers opt out; their parsed email row is enough.
	const persistRaw = storeRaw !== false;
	const rawExpiresAt = persistRaw ? now + INBOUND_RAW_TTL_SECONDS : 0;
	const rawObjectKey = persistRaw ? `attachments/mail-raw-${claimKey}.enc` : '';
	let resumedClaim = null;

	const inserted = await mailDb.prepare(`
		INSERT OR IGNORE INTO mail_receive_claim (
			claim_key, recipient, message_id, raw_sha256, content_sha256, raw_object_key, raw_expires_at,
			account_id, user_id, state, lease_token, lease_until, attempts
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLAIMED', ?, ?, 1)
	`).bind(claimKey, normalizedRecipient, normalizedMessageId, rawSha256, contentSha256, rawObjectKey,
		rawExpiresAt, Number(accountId) || 0, Number(userId) || 0, leaseToken, now + LEASE_SECONDS).run();

	if (Number(inserted.meta?.changes || 0) === 0) {
		const existing = await mailDb.prepare(`SELECT * FROM mail_receive_claim WHERE claim_key = ?`).bind(claimKey).first();
		if (!existing) throw new Error('Inbound claim write was not visible');
		// The INSERT winner may differ from the earlier read, including a winner
		// that has already committed. Always verify its binding before returning.
		await verifyClaim(c, existing, input);
		if (existing.state === 'COMPLETE') {
			if (await completedClaimStillAuthoritative(mailDb, existing)) {
				return { complete: true, claimKey, emailId: existing.email_id };
			}
			// A stale COMPLETE winner raced this insert. The next retry will take
			// the reissue path instead of suppressing a legitimate new delivery.
			throw inboundError('Inbound retry tombstone changed; retry delivery', 'inbound_claim_busy');
		}
		resumedClaim = existing;
		if (Number(existing.lease_until || 0) > now) {
			throw inboundError('Inbound message is being processed; retry delivery', 'inbound_claim_busy');
		}
		const resumed = await mailDb.prepare(`
			UPDATE mail_receive_claim
			SET state = 'CLAIMED', lease_token = ?, lease_until = ?, attempts = attempts + 1,
				content_sha256 = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP
			WHERE claim_key = ? AND state <> 'COMPLETE' AND lease_until <= ?
				AND raw_sha256 = ? AND (content_sha256 IS NULL OR content_sha256 = ?)
				AND user_id = ? AND account_id = ?
		`).bind(leaseToken, now + LEASE_SECONDS, contentSha256, claimKey, now, existing.raw_sha256,
			contentSha256, Number(userId) || 0, Number(accountId) || 0).run();
		if (Number(resumed.meta?.changes || 0) !== 1) {
			throw inboundError('Inbound claim lease changed; retry delivery', 'inbound_claim_busy');
		}
	}

	try {
		const restored = persistRaw && resumedClaim ? await readStoredRaw(c, resumedClaim) : null;
		let storedRawSha256 = resumedClaim?.raw_sha256 || rawSha256;
		if (!persistRaw) {
			storedRawSha256 = rawSha256;
		} else if (restored) {
			if (await inboundContentSha256(restored) !== contentSha256) throw new Error('Stored inbound MIME content hash mismatch');
		} else {
			const maxBytes = await getInboundRawMaxBytes(c, Number(userId) > 0 ? Number(userId) : null);
			if (rawBytes.byteLength > maxBytes) throw inboundError('Encrypted raw MIME exceeds the object storage size limit', 'inbound_raw_too_large');
			const encrypted = await encryptRawMime(c.env, rawBytes);
			await r2Service.putInboundRawObj(c, resumedClaim?.raw_object_key || rawObjectKey, encrypted, {
				contentType: 'application/octet-stream', cacheControl: 'private, no-store'
			}, Number(userId) > 0 ? Number(userId) : null);
			storedRawSha256 = rawSha256;
		}
		const saving = await mailDb.prepare(`
			UPDATE mail_receive_claim
			SET state = 'SAVING', raw_sha256 = ?, content_sha256 = ?, raw_object_key = ?, raw_expires_at = ?, updated_at = CURRENT_TIMESTAMP
			WHERE claim_key = ? AND lease_token = ? AND state = 'CLAIMED' AND lease_until > unixepoch()
		`).bind(storedRawSha256, contentSha256, persistRaw ? (resumedClaim?.raw_object_key || rawObjectKey) : '',
			rawExpiresAt, claimKey, leaseToken).run();
		if (Number(saving.meta?.changes || 0) !== 1) throw inboundError('Inbound claim lease lost while staging raw MIME', 'inbound_claim_lost');
	} catch (error) {
		await failInboundClaim(c, claimKey, leaseToken, error).catch(() => {});
		throw error;
	}

	return { complete: false, claimKey, leaseToken, rawSha256, contentSha256, rawObjectKey: resumedClaim?.raw_object_key || rawObjectKey, rawExpiresAt };
}

export async function reserveInboundQuota(c, { claimKey, leaseToken, userId, incomingBytes, maxStorageBytes, maxEmails, bypass = false, quotaStorageBlocked = false }) {
	if (!Number(userId)) return;
	const mailDb = getMailDb(c);
	const bytes = Number(incomingBytes);
	const maxBytes = Number(maxStorageBytes);
	const maxCount = Number(maxEmails);
	if (![incomingBytes, maxStorageBytes, maxEmails].every(value => typeof value === 'number')
		|| ![bytes, maxBytes, maxCount].every(value => Number.isSafeInteger(value) && value >= 0)) {
		throw new Error('Inbound quota is unknown; refusing delivery');
	}
	if (quotaStorageBlocked) throw inboundError('Recipient storage quota is blocked', 'inbound_quota_exceeded');
	// Actual usage already contains the SAVING row and any old attachment rows.
	// Reserve only the still-unpersisted delta, including after lease recovery.
	const result = await mailDb.prepare(`
		WITH own_mail AS (
			SELECT email_id, subject, text, content, code FROM email WHERE receive_claim_key = ? AND user_id = ?
		), delta AS (
			SELECT MAX(0, ?
				- COALESCE((SELECT SUM(LENGTH(CAST(IFNULL(subject,'') AS BLOB)) + LENGTH(CAST(IFNULL(text,'') AS BLOB))
					+ LENGTH(CAST(IFNULL(content,'') AS BLOB)) + LENGTH(CAST(IFNULL(code,'') AS BLOB))) FROM own_mail),0)
				- COALESCE((SELECT SUM(size) FROM attachments WHERE user_id = ? AND email_id IN (SELECT email_id FROM own_mail)),0)
			) AS bytes, CASE WHEN EXISTS (SELECT 1 FROM own_mail) THEN 0 ELSE 1 END AS count
		)
		UPDATE mail_receive_claim SET reserved_bytes = (SELECT bytes FROM delta), reserved_count = (SELECT count FROM delta), updated_at = CURRENT_TIMESTAMP
		WHERE claim_key = ? AND lease_token = ? AND user_id = ? AND state = 'SAVING' AND lease_until > unixepoch()
		AND (
			? = 1 OR ? = 0 OR
			(COALESCE((SELECT SUM(LENGTH(CAST(IFNULL(subject,'') AS BLOB)) + LENGTH(CAST(IFNULL(text,'') AS BLOB))
				+ LENGTH(CAST(IFNULL(content,'') AS BLOB)) + LENGTH(CAST(IFNULL(code,'') AS BLOB))) FROM email WHERE user_id = ?),0)
			 + COALESCE((SELECT SUM(size) FROM attachments WHERE user_id = ?),0)
			 + COALESCE((SELECT SUM(reserved_bytes) FROM mail_receive_claim WHERE user_id = ? AND claim_key <> ? AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until > unixepoch()),0)
			 + COALESCE((SELECT SUM(reserved_bytes) FROM mail_outbound_task WHERE user_id = ? AND state IN ('PREPARED','SENDING','UNKNOWN')),0)
			 + (SELECT bytes FROM delta) <= ?)
		)
		AND (
			? = 0 OR
			(COALESCE((SELECT COUNT(*) FROM email WHERE user_id = ?),0)
			 + COALESCE((SELECT SUM(reserved_count) FROM mail_receive_claim WHERE user_id = ? AND claim_key <> ? AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until > unixepoch()),0)
			 + COALESCE((SELECT SUM(reserved_count) FROM mail_outbound_task WHERE user_id = ? AND state IN ('PREPARED','SENDING','UNKNOWN')),0)
			 + (SELECT count FROM delta) <= ?)
		)
	`).bind(claimKey, userId, bytes, userId, claimKey, leaseToken, userId, bypass ? 1 : 0, maxBytes,
		userId, userId, userId, claimKey, userId, maxBytes, maxCount, userId, userId, claimKey, userId, maxCount).run();
	if (Number(result.meta?.changes || 0) !== 1) {
		const owner = await mailDb.prepare(`SELECT 1 AS present FROM mail_receive_claim
			WHERE claim_key = ? AND lease_token = ? AND user_id = ? AND state = 'SAVING' AND lease_until > unixepoch()`)
			.bind(claimKey, leaseToken, userId).first();
		if (!owner) throw inboundError('Inbound claim lease expired before quota reservation', 'inbound_claim_lost');
		throw inboundError('Recipient storage or mailbox quota is full', 'inbound_quota_exceeded');
	}
}

export async function failInboundClaim(c, claimKey, leaseToken, error, { deleteRaw = false } = {}) {
	const mailDb = getMailDb(c);
	const failed = await mailDb.prepare(`
		UPDATE mail_receive_claim
		SET state = 'FAILED', lease_until = 0, reserved_bytes = 0, reserved_count = 0, last_error = ?, updated_at = CURRENT_TIMESTAMP
		WHERE claim_key = ? AND lease_token = ? AND state <> 'COMPLETE'
		RETURNING raw_object_key, user_id
	`).bind(String(error?.message || error || 'unknown failure').slice(0, 500), claimKey, leaseToken).first();
	if (deleteRaw && failed?.raw_object_key) {
		try {
			await r2Service.deleteInboundRawObj(c, failed.raw_object_key,
				Number(failed.user_id) > 0 ? Number(failed.user_id) : null);
			await mailDb.prepare(`
				UPDATE mail_receive_claim SET raw_object_key = '', raw_expires_at = 0, updated_at = CURRENT_TIMESTAMP
				WHERE claim_key = ? AND state = 'FAILED'
			`).bind(claimKey).run();
		} catch (deleteError) {
			// Keep the claim's locator so the scheduled raw cleanup can retry.
			console.warn('[inbound] failed to discard rejected raw MIME:', deleteError?.message || deleteError);
		}
	}
}

export async function cleanupExpiredInboundClaims(c, { limit = 100 } = {}) {
	const mailDb = getMailDb(c);
	const rows = await mailDb.prepare(`
		SELECT claim_key FROM mail_receive_claim
		WHERE raw_object_key <> '' AND raw_expires_at <= unixepoch() AND lease_until <= unixepoch() ORDER BY raw_expires_at LIMIT ?
	`).bind(Math.max(1, Math.min(Number(limit) || 100, 500))).all();
	let deleted = 0;
	for (const row of rows.results || []) {
		const token = `cleanup:${crypto.randomUUID()}`;
		const claimed = await mailDb.prepare(`UPDATE mail_receive_claim SET lease_token = ?, lease_until = unixepoch() + ?
			WHERE claim_key = ? AND raw_object_key <> '' AND raw_expires_at <= unixepoch() AND lease_until <= unixepoch() RETURNING *`)
			.bind(token, LEASE_SECONDS, row.claim_key).first();
		if (!claimed) continue;
		try {
			// Preserve completed identity after raw retention ends, or a replay
			// would collide with the still-published receive_claim_key email row.
			let contentSha256 = claimed.content_sha256;
			if (claimed.state === 'COMPLETE' && !contentSha256) {
				const raw = await readStoredRaw(c, claimed);
				if (!raw) throw new Error('Legacy completed claim has no raw MIME to bind its content');
				contentSha256 = await inboundContentSha256(raw);
			}
			const attachments = await mailDb.prepare(`SELECT a.key, a.user_id AS userId FROM attachments a JOIN email e ON e.email_id = a.email_id
				WHERE e.receive_claim_key = ? AND e.status = ?`).bind(row.claim_key, emailConst.status.SAVING).all();
			// Ensure the existing deletion outbox is available before the batch.
			// The batch enqueues again atomically with metadata removal, so a
			// concurrent drainer cannot lose the cleanup obligation.
			if (attachments.results?.length) await attService.enqueueObjectDeletions(c, attachments.results);
			await r2Service.deleteInboundRawObj(c, claimed.raw_object_key, Number(claimed.user_id) > 0 ? Number(claimed.user_id) : null);
			const result = await mailDb.batch([
				mailDb.prepare(`INSERT INTO mail_transaction_guard(token, valid) SELECT ?, CASE WHEN EXISTS (
					SELECT 1 FROM mail_receive_claim WHERE claim_key = ? AND lease_token = ?
					AND lease_until > unixepoch() AND raw_expires_at <= unixepoch()) THEN 1 ELSE 0 END`).bind(token, row.claim_key, token),
				...(attachments.results?.length ? [mailDb.prepare(`INSERT OR IGNORE INTO object_deletion_queue(object_key, user_id, next_retry_at)
					SELECT a.key, a.user_id, CURRENT_TIMESTAMP FROM attachments a JOIN email e ON e.email_id = a.email_id
					WHERE e.receive_claim_key = ? AND e.status = ?`).bind(row.claim_key, emailConst.status.SAVING)] : []),
				mailDb.prepare(`DELETE FROM attachments WHERE email_id IN (SELECT email_id FROM email WHERE receive_claim_key = ? AND status = ?)`)
					.bind(row.claim_key, emailConst.status.SAVING),
				mailDb.prepare(`DELETE FROM email WHERE receive_claim_key = ? AND status = ?`).bind(row.claim_key, emailConst.status.SAVING),
				claimed.state === 'COMPLETE'
					? mailDb.prepare(`UPDATE mail_receive_claim SET raw_object_key = '', raw_expires_at = 0, content_sha256 = ?,
						lease_token = NULL, lease_until = 0, reserved_bytes = 0, reserved_count = 0, updated_at = CURRENT_TIMESTAMP
						WHERE claim_key = ? AND lease_token = ? AND state = 'COMPLETE'`).bind(contentSha256, row.claim_key, token)
					: mailDb.prepare(`DELETE FROM mail_receive_claim WHERE claim_key = ? AND lease_token = ?`).bind(row.claim_key, token),
				mailDb.prepare(`DELETE FROM mail_transaction_guard WHERE token = ?`).bind(token)
			]);
			deleted += Number(result[result.length - 2]?.meta?.changes || 0);
		} catch (error) {
			// A failed delete leaves the recovery record available for the next run.
			await mailDb.prepare(`UPDATE mail_receive_claim SET lease_until = 0, last_error = ? WHERE claim_key = ? AND lease_token = ?`)
				.bind(String(error?.message || error).slice(0, 500), row.claim_key, token).run().catch(() => {});
			throw error;
		}
	}
	return { processed: rows.results?.length || 0, deleted };
}

export async function clearRawForUser(c, userId) {
	const uid = Number(userId);
	if (!Number.isSafeInteger(uid) || uid <= 0) throw new Error('Invalid user id for inbound raw cleanup');
	const mailDb = getMailDb(c);
	const hasClaims = await mailDb.prepare(`SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'mail_receive_claim'`).first();
	if (!hasClaims) return { deleted: 0 };
	let deleted = 0;
	while (true) {
		const rows = await mailDb.prepare(`
			SELECT claim_key, raw_object_key FROM mail_receive_claim WHERE user_id = ? LIMIT 100
		`).bind(uid).all();
		if (!rows.results?.length) break;
		for (const row of rows.results) {
			// The user row still holds the original BYO locator. A failed object
			// deletion must leave its claim intact and abort user deletion for retry.
			if (row.raw_object_key) await r2Service.deleteInboundRawObj(c, row.raw_object_key, uid);
			await mailDb.prepare(`DELETE FROM mail_receive_claim WHERE claim_key = ? AND user_id = ?`)
				.bind(row.claim_key, uid).run();
			deleted++;
		}
	}
	return { deleted };
}

export function decodeStoredRawMime(base64) {
	return decoder.decode(base64ToBytes(base64));
}

export default { acquireInboundClaim, failInboundClaim, cleanupExpiredInboundClaims, clearRawForUser, reserveInboundQuota, getInboundRawMaxBytes };

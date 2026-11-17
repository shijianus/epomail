import { getMailDb } from '../utils/db-accessor.js';
import emailCryptoUtils, { EMAIL_KEY_DOMAINS } from '../utils/email-crypto-utils.js';
import safeLogger from '../utils/safe-logger.js';
import { migrationCursor, migrationLimit, migrationUserId, migrationIds, migrationPage } from '../utils/migration-page.js';

const { CIPHER_PREFIX, ENCRYPTED_FIELDS } = emailCryptoUtils;

function resolveKeyReadiness(env) {
	const emailKey = typeof env?.email_enc_key === 'string' && env.email_enc_key.trim() ? env.email_enc_key.trim() : '';
	const prevEmailKey = typeof env?.previous_email_enc_key === 'string' && env.previous_email_enc_key.trim() ? env.previous_email_enc_key.trim() : '';
	const totpKey = typeof env?.totp_enc_key === 'string' && env.totp_enc_key.trim() ? env.totp_enc_key.trim() : '';
	const jwtKey = typeof env?.jwt_secret === 'string' && env.jwt_secret.trim() ? env.jwt_secret.trim() : '';

	const activeDomain = emailKey
		? EMAIL_KEY_DOMAINS.EMAIL_ENC_KEY
		: (totpKey ? EMAIL_KEY_DOMAINS.TOTP_COMPAT : null);

	return {
		activeDomain,
		dedicatedKeyConfigured: Boolean(emailKey),
		compatKeyConfigured: Boolean(totpKey),
		previousKeyConfigured: Boolean(prevEmailKey),
		legacyJwtPresent: Boolean(jwtKey),
		isolatedFromJwt: Boolean(emailKey || totpKey)
	};
}

async function scanEncryptedCandidateEmails(mailDb, { limit = 5000, cursor = 0, userId = null, emailIds = null } = {}) {
	limit = migrationLimit(limit);
	cursor = migrationCursor(cursor);
	userId = migrationUserId(userId);
	emailIds = migrationIds(emailIds);
	if (emailIds?.length === 0) return migrationPage([], limit, cursor, 'email_id');
	const rows = [];
	let lastEmailId = cursor;
	const hasUserFilter = Number.isSafeInteger(Number(userId)) && Number(userId) > 0;
	while (rows.length < limit + 1) {
		const pageSize = Math.min(200, limit + 1 - rows.length);
		const whereUser = hasUserFilter ? 'AND user_id = ?' : '';
		const whereEmails = emailIds ? `AND email_id IN (${emailIds.map(() => '?').join(',')})` : '';
		const sql = `
			SELECT email_id, user_id, subject, content, text, code
			FROM email
			WHERE email_id > ? ${whereUser} ${whereEmails}
			  AND (subject LIKE 'enc:v1:%' OR content LIKE 'enc:v1:%' OR text LIKE 'enc:v1:%' OR code LIKE 'enc:v1:%')
			ORDER BY email_id ASC
			LIMIT ?
		`;
		const bindings = [lastEmailId, ...(hasUserFilter ? [userId] : []), ...(emailIds || []), pageSize];
		const res = await mailDb.prepare(sql).bind(...bindings).all();
		const batch = res?.results || [];
		if (batch.length === 0) break;
		rows.push(...batch);
		lastEmailId = Number(batch[batch.length - 1].email_id);
		if (batch.length < pageSize) break;
	}
	return migrationPage(rows, limit, cursor, 'email_id');
}

const emailKeyMigrationService = {
	resolveKeyReadiness,

	async inspectState(c, options = {}) {
		const mailDb = getMailDb(c);
		const keyReadiness = resolveKeyReadiness(c?.env);
		const { rows, ...page } = await scanEncryptedCandidateEmails(mailDb, options);

		const stats = {
			scannedEncryptedRows: rows.length,
			legacyV1Rows: 0,
			compatDomainRows: 0,
			targetDomainRows: 0,
			otherDomainRows: 0,
			undecryptableRows: 0,
			needsMigrationRows: 0,
			distinctUsers: 0
		};

		const keyringCache = new Map();
		const userIds = new Set();

		for (const row of rows) {
			const uid = Number(row.user_id || 0);
			userIds.add(uid);
			if (!keyringCache.has(uid)) {
				keyringCache.set(
					uid,
					await emailCryptoUtils.getUserEmailCryptoKey(c?.env, uid, null, { allowLegacyJwtDecryptOnly: true }).catch(() => null)
				);
			}
			const keyring = keyringCache.get(uid);

			let rowHasLegacyV1 = false;
			let rowHasCompat = false;
			let rowHasTarget = false;
			let rowHasOther = false;
			let rowUndecryptable = false;

			for (const field of ENCRYPTED_FIELDS) {
				const raw = row[field];
				if (!raw || typeof raw !== 'string') continue;
				const info = emailCryptoUtils.inspectEncryptedValue(raw);
				if (!info.encrypted) continue;

				if (!keyring) {
					rowUndecryptable = true;
				} else {
					const plain = await emailCryptoUtils.decryptText(raw, keyring);
					if (typeof plain === 'string' && plain.startsWith(CIPHER_PREFIX)) {
						rowUndecryptable = true;
					}
				}

				if (info.format === 'legacy_v1') {
					rowHasLegacyV1 = true;
				} else if (info.domainTag === keyReadiness.activeDomain) {
					rowHasTarget = true;
				} else if (info.domainTag === EMAIL_KEY_DOMAINS.TOTP_COMPAT) {
					rowHasCompat = true;
				} else {
					rowHasOther = true;
				}
			}

			if (rowHasLegacyV1) stats.legacyV1Rows++;
			if (rowHasCompat) stats.compatDomainRows++;
			if (rowHasOther) stats.otherDomainRows++;
			if (rowHasTarget && !rowHasLegacyV1 && !rowHasCompat && !rowHasOther) stats.targetDomainRows++;
			if (rowUndecryptable) stats.undecryptableRows++;
			if (keyring?.activeDomain && emailCryptoUtils.needsEmailRecordMigration(row, keyring)) {
				stats.needsMigrationRows++;
			}
		}

		stats.distinctUsers = userIds.size;

		return { keyReadiness, stats, ...page };
	},

	async preDeployCheck(c, options = {}) {
		const inspection = await this.inspectState(c, options);
		const blockers = [];
		const warnings = [];
		if (!inspection.inspectionComplete) warnings.push('Inspection is partial; complete all pages before key removal');

		if (!inspection.keyReadiness.activeDomain) {
			blockers.push('No email encryption root key is configured (set email_enc_key or totp_enc_key)');
		} else if (!inspection.keyReadiness.dedicatedKeyConfigured) {
			warnings.push('Dedicated email_enc_key is not set; using HKDF-isolated totp_enc_key_compat');
		}
		if (inspection.stats.undecryptableRows > 0) {
			blockers.push(`Found ${inspection.stats.undecryptableRows} encrypted email rows undecryptable under current keys`);
		}
		if (inspection.stats.legacyV1Rows > 0 || inspection.stats.compatDomainRows > 0) {
			warnings.push(`Pending migration rows: legacy_v1=${inspection.stats.legacyV1Rows}, compat=${inspection.stats.compatDomainRows}`);
		}

		return {
			ok: blockers.length === 0,
			readyForDedicatedEmailKey: inspection.inspectionComplete && inspection.keyReadiness.dedicatedKeyConfigured && blockers.length === 0,
			blockers,
			warnings,
			...inspection
		};
	},

	async postDeployVerify(c, options = {}) {
		const inspection = await this.inspectState(c, options);
		const blockers = [];
		if (inspection.stats.undecryptableRows > 0) {
			blockers.push(`Found ${inspection.stats.undecryptableRows} undecryptable email rows after deployment`);
		}
		const fullyMigrated = inspection.inspectionComplete && Boolean(inspection.keyReadiness.activeDomain)
			&& inspection.stats.needsMigrationRows === 0
			&& inspection.stats.legacyV1Rows === 0
			&& inspection.stats.compatDomainRows === 0
			&& inspection.stats.otherDomainRows === 0
			&& inspection.stats.undecryptableRows === 0;

		return {
			ok: blockers.length === 0,
			fullyMigrated,
			blockers,
			...inspection
		};
	},

	async lazyReencryptEmailRow(c, rawRow, keyring, options = {}) {
		const emailId = rawRow?.emailId ?? rawRow?.email_id;
		const userId = rawRow?.userId ?? rawRow?.user_id;
		const targetDomain = options.domainOverride || keyring?.activeDomain;
		const canEncryptTarget = targetDomain
			&& (targetDomain === keyring?.activeDomain ? Boolean(keyring?.writeKey) : Boolean(keyring?.readKeysByDomain?.[targetDomain]?.length));
		if (!emailId || !userId || !canEncryptTarget) {
			return { ok: false, migrated: false, reason: 'not_eligible' };
		}
		if (!options.domainOverride && !emailCryptoUtils.needsEmailRecordMigration(rawRow, keyring)) {
			return { ok: true, migrated: false, reason: 'already_target' };
		}

		const nextValues = {};
		let changedCount = 0;

		for (const field of ENCRYPTED_FIELDS) {
			const original = rawRow[field];
			if (typeof original !== 'string' || !original.startsWith(CIPHER_PREFIX)) {
				nextValues[field] = original;
				continue;
			}
			const info = emailCryptoUtils.inspectEncryptedValue(original);
			if (info.format === 'domain_v1' && info.domainTag === targetDomain) {
				nextValues[field] = original;
				continue;
			}
			const plaintext = await emailCryptoUtils.decryptText(original, keyring);
			if (typeof plaintext === 'string' && plaintext.startsWith(CIPHER_PREFIX)) {
				return { ok: false, migrated: false, reason: `undecryptable_field_${field}` };
			}
			const reencrypted = await emailCryptoUtils.encryptText(plaintext, keyring, { domainOverride: targetDomain });
			const verified = await emailCryptoUtils.decryptText(reencrypted, keyring);
			if (verified !== plaintext) {
				safeLogger.warn('email_lazy_migration_verify_failed', { emailId, userId, field });
				return { ok: false, migrated: false, reason: `verify_failed_${field}` };
			}
			nextValues[field] = reencrypted;
			changedCount++;
		}

		if (changedCount === 0) {
			return { ok: true, migrated: false, reason: 'no_changes' };
		}

		const mailDb = getMailDb(c);
		if (!mailDb?.prepare) {
			return { ok: false, migrated: false, reason: 'mail_db_unavailable' };
		}

		const updated = await mailDb.prepare(`
			UPDATE email
			SET subject = ?, content = ?, text = ?, code = ?
			WHERE email_id = ? AND user_id = ?
			  AND subject IS ? AND content IS ? AND text IS ? AND code IS ?
			RETURNING email_id
		`).bind(
			nextValues.subject ?? null,
			nextValues.content ?? null,
			nextValues.text ?? null,
			nextValues.code ?? '',
			emailId,
			userId,
			rawRow.subject ?? null,
			rawRow.content ?? null,
			rawRow.text ?? null,
			rawRow.code ?? null
		).first();

		if (!updated) {
			return { ok: false, migrated: false, reason: 'cas_conflict' };
		}

		return {
			ok: true,
			migrated: true,
			targetDomain,
			changedCount
		};
	},

	async migrateBatch(c, { limit = 500, cursor = 0, dryRun = false, userId = null, requireDedicatedKey = false } = {}) {
		limit = migrationLimit(limit);
		cursor = migrationCursor(cursor);
		userId = migrationUserId(userId);
		const mailDb = getMailDb(c);
		const keyReadiness = resolveKeyReadiness(c?.env);
		if (!keyReadiness.activeDomain || (requireDedicatedKey && !keyReadiness.dedicatedKeyConfigured)) {
			return {
				ok: false,
				dryRun,
				scanned: 0,
				migrated: 0,
				wouldMigrate: 0,
				alreadyTarget: 0,
				failed: 0,
				errors: ['missing_target_key'],
				activeDomain: keyReadiness.activeDomain
			};
		}

		const { rows, ...page } = await scanEncryptedCandidateEmails(mailDb, { limit, cursor, userId });
		const result = {
			...page,
			ok: true,
			dryRun,
			scanned: rows.length,
			migrated: 0,
			wouldMigrate: 0,
			alreadyTarget: 0,
			failed: 0,
			errors: [],
			activeDomain: keyReadiness.activeDomain
		};

		const keyringCache = new Map();
		for (const row of rows) {
			const uid = Number(row.user_id || 0);
			if (!keyringCache.has(uid)) {
				keyringCache.set(
					uid,
					await emailCryptoUtils.getUserEmailCryptoKey(c?.env, uid, null, { requireDedicatedKey }).catch(() => null)
				);
			}
			const keyring = keyringCache.get(uid);
			if (!keyring) {
				result.failed++;
				result.errors.push({ emailId: row.email_id, reason: 'keyring_unavailable' });
				continue;
			}
			if (!emailCryptoUtils.needsEmailRecordMigration(row, keyring)) {
				result.alreadyTarget++;
				continue;
			}
			if (dryRun) {
				result.wouldMigrate++;
				continue;
			}
			const step = await this.lazyReencryptEmailRow(c, row, keyring);
			if (step.ok && step.migrated) {
				result.migrated++;
			} else if (step.reason === 'already_target') {
				result.alreadyTarget++;
			} else {
				result.failed++;
				result.errors.push({ emailId: row.email_id, reason: step.reason });
			}
		}

		result.ok = result.failed === 0;
		return result;
	},

	async rollbackMigration(c, { emailIds = null, userId = null, limit = 500, cursor = 0, targetDomain = EMAIL_KEY_DOMAINS.TOTP_COMPAT } = {}) {
		emailIds = migrationIds(emailIds);
		userId = migrationUserId(userId);
		limit = migrationLimit(limit);
		cursor = migrationCursor(cursor);
		const mailDb = getMailDb(c);
		const keyReadiness = resolveKeyReadiness(c?.env);
		if (targetDomain === EMAIL_KEY_DOMAINS.TOTP_COMPAT && !keyReadiness.compatKeyConfigured) {
			return { ok: false, rolledBack: 0, skipped: 0, failed: 0, reason: 'missing_totp_compat_key', errors: [] };
		}
		if (targetDomain === EMAIL_KEY_DOMAINS.PREVIOUS_EMAIL_ENC_KEY && !keyReadiness.previousKeyConfigured) {
			return { ok: false, rolledBack: 0, skipped: 0, failed: 0, reason: 'missing_previous_email_key', errors: [] };
		}

		const { rows, ...page } = await scanEncryptedCandidateEmails(mailDb, { userId, emailIds, limit, cursor });

		let rolledBack = 0;
		let skipped = 0;
		let failed = 0;
		const errors = [];

		for (const row of rows) {
			const uid = Number(row.user_id || 0);
			const keyring = await emailCryptoUtils.getUserEmailCryptoKey(c?.env, uid, null, { allowLegacyJwtDecryptOnly: true }).catch(() => null);
			if (!keyring) {
				failed++;
				errors.push({ emailId: row.email_id, reason: 'keyring_unavailable' });
				continue;
			}

			const allFieldsAlreadyTarget = ENCRYPTED_FIELDS.every(field => {
				const raw = row[field];
				if (typeof raw !== 'string' || !raw.startsWith(CIPHER_PREFIX)) return true;
				const info = emailCryptoUtils.inspectEncryptedValue(raw);
				return info.format === 'domain_v1' && info.domainTag === targetDomain;
			});
			if (allFieldsAlreadyTarget) {
				skipped++;
				continue;
			}

			const step = await this.lazyReencryptEmailRow(c, {
				emailId: row.email_id,
				userId: uid,
				subject: row.subject,
				content: row.content,
				text: row.text,
				code: row.code
			}, keyring, { domainOverride: targetDomain });

			if (step.ok && step.migrated) {
				rolledBack++;
			} else {
				failed++;
				errors.push({ emailId: row.email_id, reason: step.reason });
			}
		}

		return {
			...page,
			ok: failed === 0,
			targetDomain,
			rolledBack,
			skipped,
			failed,
			errors
		};
	}
};

export default emailKeyMigrationService;

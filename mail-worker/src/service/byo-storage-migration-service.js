import { getUserDb } from '../utils/db-accessor.js';
import safeLogger from '../utils/safe-logger.js';
import { migrationCursor, migrationLimit, migrationUserId, migrationIds, migrationPage } from '../utils/migration-page.js';
import {
	STORAGE_KEY_DOMAINS,
	resolveStorageKeyEnv,
	encryptByoStorageConfig,
	decryptByoStorageConfig
} from '../utils/storage-credential-crypto.js';

async function scanByoCandidateRows(userDb, { limit = 5000, cursor = 0, userIds = null } = {}) {
	limit = migrationLimit(limit);
	cursor = migrationCursor(cursor);
	userIds = migrationIds(userIds);
	if (userIds?.length === 0) return migrationPage([], limit, cursor, 'user_id');
	const rows = [];
	let lastUserId = cursor;
	while (rows.length < limit + 1) {
		const pageSize = Math.min(200, limit + 1 - rows.length);
		const scope = userIds ? `AND user_id IN (${userIds.map(() => '?').join(',')})` : '';
		const res = await userDb.prepare(`SELECT user_id, byo_storage_enabled, byo_storage_config
			FROM user WHERE user_id > ? ${scope}
			AND (byo_storage_enabled = 1 OR (byo_storage_config IS NOT NULL AND byo_storage_config <> '' AND byo_storage_config <> '{}'))
			ORDER BY user_id ASC LIMIT ?`).bind(lastUserId, ...(userIds || []), pageSize).all();
		const batch = res?.results || [];
		if (!batch.length) break;
		rows.push(...batch);
		lastUserId = Number(batch[batch.length - 1].user_id);
		if (batch.length < pageSize) break;
	}
	return migrationPage(rows, limit, cursor, 'user_id');
}

const byoStorageMigrationService = {
	async inspectState(c, options = {}) {
		const userDb = getUserDb(c);
		const keyInfo = resolveStorageKeyEnv(c?.env);
		const { rows, ...page } = await scanByoCandidateRows(userDb, options);

		const stats = {
			scannedRows: rows.length,
			emptyRows: 0,
			legacyPlaintextRows: 0,
			compatEncryptedRows: 0,
			targetEncryptedRows: 0,
			otherDomainEncryptedRows: 0,
			invalidRows: 0,
			undecryptableRows: 0,
			byoEnabledUndecryptableRows: 0,
			needsMigrationRows: 0
		};

		const activeDomain = keyInfo.active?.keyDomain || null;

		for (const row of rows) {
			const dec = await decryptByoStorageConfig(row.byo_storage_config, c?.env, row.user_id);
			if (dec.state === 'empty') {
				stats.emptyRows++;
			} else if (dec.state === 'legacy_plaintext') {
				stats.legacyPlaintextRows++;
			} else if (dec.state === 'encrypted') {
				if (dec.keyDomain === activeDomain) {
					stats.targetEncryptedRows++;
				} else if (dec.keyDomain === STORAGE_KEY_DOMAINS.TOTP_COMPAT) {
					stats.compatEncryptedRows++;
				} else {
					stats.otherDomainEncryptedRows++;
				}
			} else if (dec.state === 'invalid') {
				stats.invalidRows++;
			} else if (dec.state === 'undecryptable') {
				stats.undecryptableRows++;
				if (Number(row.byo_storage_enabled) === 1) {
					stats.byoEnabledUndecryptableRows++;
				}
			}

			if (dec.needsMigration) {
				stats.needsMigrationRows++;
			}
		}

		return {
			...page,
			keyReadiness: {
				activeWriteDomain: activeDomain,
				dedicatedKeyConfigured: keyInfo.dedicatedKeyConfigured,
				compatKeyConfigured: keyInfo.compatKeyConfigured,
				previousKeyConfigured: keyInfo.previousKeyConfigured
			},
			stats
		};
	},

	async preDeployCheck(c, options = {}) {
		const inspection = await this.inspectState(c, options);
		const blockers = [];
		const warnings = [];
		if (!inspection.inspectionComplete) warnings.push('Inspection is partial; complete all pages before key removal');

		if (!inspection.keyReadiness.activeWriteDomain) {
			blockers.push('No encryption key configured (set byo_storage_enc_key, storage_enc_key, or totp_enc_key)');
		} else if (!inspection.keyReadiness.dedicatedKeyConfigured) {
			warnings.push('Dedicated storage_enc_key/byo_storage_enc_key is not configured; using HKDF-isolated totp_enc_key_compat');
		}
		if (inspection.stats.byoEnabledUndecryptableRows > 0) {
			blockers.push(`Found ${inspection.stats.byoEnabledUndecryptableRows} active BYO rows that cannot be decrypted with current keys`);
		}
		if (inspection.stats.legacyPlaintextRows > 0) {
			warnings.push(`Found ${inspection.stats.legacyPlaintextRows} legacy plaintext BYO rows pending migration`);
		}

		return {
			ok: blockers.length === 0,
			readyForStrictKeyDomain: inspection.inspectionComplete && inspection.keyReadiness.dedicatedKeyConfigured && blockers.length === 0,
			blockers,
			warnings,
			...inspection
		};
	},

	async postDeployVerify(c, options = {}) {
		const inspection = await this.inspectState(c, options);
		const blockers = [];
		if (inspection.stats.byoEnabledUndecryptableRows > 0) {
			blockers.push(`Found ${inspection.stats.byoEnabledUndecryptableRows} undecryptable active BYO rows after deploy`);
		}
		const fullyMigrated = inspection.inspectionComplete && Boolean(inspection.keyReadiness.activeWriteDomain)
			&& inspection.stats.invalidRows === 0 && inspection.stats.undecryptableRows === 0
			&& inspection.stats.otherDomainEncryptedRows === 0
			&& inspection.stats.needsMigrationRows === 0
			&& inspection.stats.legacyPlaintextRows === 0
			&& inspection.stats.byoEnabledUndecryptableRows === 0;

		return {
			ok: blockers.length === 0,
			fullyMigrated,
			blockers,
			...inspection
		};
	},

	async lazyMigrateRow(c, userRow, { requireDedicatedKey = false } = {}) {
		if (!userRow?.user_id || !userRow?.byo_storage_config) {
			return { ok: false, migrated: false, reason: 'missing_row' };
		}
		const keyInfo = resolveStorageKeyEnv(c?.env, { requireDedicatedKey });
		if (!keyInfo.active) {
			return { ok: false, migrated: false, reason: 'missing_target_key' };
		}

		const decrypted = await decryptByoStorageConfig(userRow.byo_storage_config, c?.env, userRow.user_id);
		if (!decrypted.ok) {
			return { ok: false, migrated: false, reason: decrypted.reason || 'undecryptable' };
		}
		if (!decrypted.needsMigration) {
			return { ok: true, migrated: false, reason: 'already_target' };
		}

		const encryptedStr = await encryptByoStorageConfig(decrypted.config, c?.env, userRow.user_id, { requireDedicatedKey });
		const userDb = getUserDb(c);
		const updated = await userDb.prepare(`
			UPDATE user
			SET byo_storage_config = ?
			WHERE user_id = ? AND byo_storage_config = ?
			RETURNING user_id
		`).bind(encryptedStr, userRow.user_id, userRow.byo_storage_config).first();

		if (!updated) {
			return { ok: false, migrated: false, reason: 'cas_conflict' };
		}

		const verified = await decryptByoStorageConfig(encryptedStr, c?.env, userRow.user_id);
		if (!verified.ok) {
			safeLogger.error('byo_lazy_migration_verify_failed', { userId: userRow.user_id });
			return { ok: false, migrated: false, reason: 'post_write_verify_failed' };
		}

		return {
			ok: true,
			migrated: true,
			fromState: decrypted.state,
			fromDomain: decrypted.keyDomain,
			toKeyDomain: keyInfo.active.keyDomain
		};
	},

	async migrateBatch(c, { limit = 500, cursor = 0, userIds = null, dryRun = false, requireDedicatedKey = false } = {}) {
		limit = migrationLimit(limit);
		cursor = migrationCursor(cursor);
		userIds = migrationIds(userIds);
		const userDb = getUserDb(c);
		const keyInfo = resolveStorageKeyEnv(c?.env, { requireDedicatedKey });
		if (!keyInfo.active) {
			return {
				ok: false,
				dryRun,
				scanned: 0,
				migrated: 0,
				alreadyTarget: 0,
				skipped: 0,
				failed: 0,
				errors: ['missing_target_key'],
				keyDomain: null
			};
		}

		const { rows, ...page } = await scanByoCandidateRows(userDb, { limit, cursor, userIds });
		const result = {
			...page,
			ok: true,
			dryRun,
			scanned: rows.length,
			migrated: 0,
			wouldMigrate: 0,
			alreadyTarget: 0,
			skipped: 0,
			failed: 0,
			errors: [],
			keyDomain: keyInfo.active.keyDomain
		};

		for (const row of rows) {
			const dec = await decryptByoStorageConfig(row.byo_storage_config, c?.env, row.user_id);
			if (dec.state === 'empty') {
				result.skipped++;
				continue;
			}
			if (!dec.ok) {
				result.failed++;
				result.errors.push({ userId: row.user_id, reason: dec.reason });
				continue;
			}
			if (!dec.needsMigration) {
				result.alreadyTarget++;
				continue;
			}
			if (dryRun) {
				result.wouldMigrate++;
				continue;
			}
			const step = await this.lazyMigrateRow(c, row, { requireDedicatedKey });
			if (step.ok && step.migrated) {
				result.migrated++;
			} else if (step.reason === 'already_target') {
				result.alreadyTarget++;
			} else {
				result.failed++;
				result.errors.push({ userId: row.user_id, reason: step.reason });
			}
		}

		result.ok = result.failed === 0;
		return result;
	},

	async rollbackMigration(c, { userIds = null, limit = 500, cursor = 0, targetMode = 'previous_key' } = {}) {
		userIds = migrationIds(userIds);
		limit = migrationLimit(limit);
		cursor = migrationCursor(cursor);
		const userDb = getUserDb(c);
		const keyInfo = resolveStorageKeyEnv(c?.env);

		let targetKeyDomain = null;
		if (targetMode === 'previous_key') {
			if (keyInfo.decryptCandidates[STORAGE_KEY_DOMAINS.PREVIOUS_BYO_ENC_KEY]?.length) {
				targetKeyDomain = STORAGE_KEY_DOMAINS.PREVIOUS_BYO_ENC_KEY;
			} else if (keyInfo.decryptCandidates[STORAGE_KEY_DOMAINS.PREVIOUS_STORAGE_ENC_KEY]?.length) {
				targetKeyDomain = STORAGE_KEY_DOMAINS.PREVIOUS_STORAGE_ENC_KEY;
			} else if (keyInfo.compatKeyConfigured) {
				targetKeyDomain = STORAGE_KEY_DOMAINS.TOTP_COMPAT;
			}
		} else if (targetMode === 'totp_compat' && keyInfo.compatKeyConfigured) {
			targetKeyDomain = STORAGE_KEY_DOMAINS.TOTP_COMPAT;
		} else if (targetMode !== 'legacy_plaintext') {
			return { ok: false, rolledBack: 0, failed: 0, reason: 'unsupported_rollback_mode' };
		}

		if (targetMode !== 'legacy_plaintext' && !targetKeyDomain) {
			return { ok: false, rolledBack: 0, failed: 0, reason: 'missing_rollback_key' };
		}

		const { rows, ...page } = await scanByoCandidateRows(userDb, { userIds, limit, cursor });

		let rolledBack = 0;
		let skipped = 0;
		let failed = 0;
		const errors = [];

		for (const row of rows) {
			const dec = await decryptByoStorageConfig(row.byo_storage_config, c?.env, row.user_id);
			if (dec.state === 'empty') {
				skipped++;
				continue;
			}
			if (!dec.ok) {
				failed++;
				errors.push({ userId: row.user_id, reason: dec.reason });
				continue;
			}

			if (targetMode === 'legacy_plaintext' && dec.state === 'legacy_plaintext') {
				skipped++;
				continue;
			}
			if (targetKeyDomain && dec.state === 'encrypted' && dec.keyDomain === targetKeyDomain) {
				skipped++;
				continue;
			}

			const replacement = targetMode === 'legacy_plaintext'
				? JSON.stringify(dec.config)
				: await encryptByoStorageConfig(dec.config, c?.env, row.user_id, { keyDomainOverride: targetKeyDomain });

			const updated = await userDb.prepare(`
				UPDATE user
				SET byo_storage_config = ?
				WHERE user_id = ? AND byo_storage_config = ?
				RETURNING user_id
			`).bind(replacement, row.user_id, row.byo_storage_config).first();

			if (!updated) {
				failed++;
				errors.push({ userId: row.user_id, reason: 'cas_conflict' });
				continue;
			}

			// Verify rollback output is readable without needing the newer key
			const verifyEnv = targetMode === 'legacy_plaintext' ? {} : c?.env;
			const verify = await decryptByoStorageConfig(replacement, verifyEnv, row.user_id);
			if (!verify.ok) {
				failed++;
				errors.push({ userId: row.user_id, reason: 'rollback_verify_failed' });
				continue;
			}
			rolledBack++;
		}

		return {
			...page,
			ok: failed === 0,
			targetMode,
			targetKeyDomain,
			rolledBack,
			skipped,
			failed,
			errors
		};
	},

	async verifyCleanup(c, userId) {
		const userDb = getUserDb(c);
		const row = await userDb.prepare(`
			SELECT user_id, byo_storage_enabled, byo_storage_config
			FROM user WHERE user_id = ?
		`).bind(userId).first();

		const issues = [];
		if (row) {
			if (Number(row.byo_storage_enabled) !== 0) {
				issues.push('byo_storage_enabled_nonzero');
			}
			const cfgStr = String(row.byo_storage_config || '').trim();
			if (cfgStr && cfgStr !== '{}') {
				issues.push('byo_storage_config_not_cleared');
			}
		}

		if (c?.env?.kv) {
			try {
				const rawProfile = await c.env.kv.get(`USER_PROFILE_${userId}`);
				if (rawProfile && /s3SecretKey|s3AccessKey|byo_storage_config|__enc/i.test(rawProfile)) {
					issues.push('kv_profile_credential_residue');
				}
			} catch (_) {}
		}

		return {
			clean: issues.length === 0,
			userPresent: Boolean(row),
			issues
		};
	}
};

export default byoStorageMigrationService;

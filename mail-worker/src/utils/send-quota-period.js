// The deployed daily cron is 16:00 UTC, midnight in UTC+08.
const daySeconds = 86400;
const offsetSeconds = 8 * 3600;

export function sendQuotaPeriodStart() {
	return Math.floor((Date.now() / 1000 + offsetSeconds) / daySeconds) * daySeconds - offsetSeconds;
}

// Both the cron and the first daily send after a missed cron advance the same
// account counter. A later or repeated invocation cannot clear a newer count.
export function advanceDailyQuota(db, userId) {
	const scope = userId === undefined
		? `type IN (SELECT r.role_id FROM role r
			JOIN role_perm rp ON rp.role_id=r.role_id JOIN perm p ON p.perm_id=rp.perm_id
			WHERE r.send_type='day' AND p.perm_key='email:send')`
		: 'user_id=?';
	const period = sendQuotaPeriodStart();
	return db.prepare(`UPDATE user SET send_quota_period=?1,
		send_count=CASE WHEN send_quota_period=0 THEN send_count ELSE 0 END,
		send_quota_generation=send_quota_generation+(send_quota_period<>0)
		WHERE send_quota_period<?1 AND ${scope}`).bind(period, ...(userId === undefined ? [] : [userId]));
}

async function migrateQuotaColumns(db) {
	const columns = await db.batch([
		db.prepare("PRAGMA table_info('user')"),
		db.prepare("PRAGMA table_info('mail_send_quota_reservation')")
	]);
	const [users, reservations] = columns.map(result => new Set(result.results.map(column => column.name)));
	const migration = [];
	if (users.size && !users.has('send_quota_period')) {
		migration.push(db.prepare('ALTER TABLE user ADD COLUMN send_quota_period INTEGER NOT NULL DEFAULT 0'));
		// Keep the usage inherited at cutover until the next real reset.
		migration.push(db.prepare('UPDATE user SET send_quota_period=?').bind(sendQuotaPeriodStart()));
	}
	if (users.size && !users.has('send_quota_generation')) {
		migration.push(db.prepare('ALTER TABLE user ADD COLUMN send_quota_generation INTEGER NOT NULL DEFAULT 0'));
	}
	if (reservations.size && !reservations.has('quota_generation')) {
		migration.push(db.prepare('ALTER TABLE mail_send_quota_reservation ADD COLUMN quota_generation INTEGER'));
	}
	if (migration.length) await db.batch(migration);
}

export async function ensureSendQuotaPeriods(db) {
	try {
		await migrateQuotaColumns(db);
	} catch (error) {
		// Two init requests may read the same PRAGMA snapshot. D1 applies the
		// ALTERs and initial balance cutover together in a single batch.
		if (!/duplicate column name/i.test(error.message)) throw error;
		await migrateQuotaColumns(db);
	}
}

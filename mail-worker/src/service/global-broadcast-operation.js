import BizError from '../error/biz-error.js';
import { getMailDb, getUserDb } from '../utils/db-accessor.js';

export async function authoritativeCampaign(c, userId, expected, newUsersOnly) {
	const row = await getUserDb(c).prepare(`SELECT s.global_email_config AS config, u.type AS role, u.email
		FROM setting s JOIN user u ON u.user_id=? WHERE u.status=0 AND u.is_del=0 LIMIT 1`).bind(userId).first();
	if (!row?.config) return null;
	const config = JSON.parse(row.config);
	if (!config || Number(config.active) !== 1 || (newUsersOnly && Number(config.sendToNewUsers) !== 1)) return null;
	if (expected && (config.broadcastId || config.lastBroadcastTime || '') !== (expected.broadcastId || expected.lastBroadcastTime || '')) return null;
	if (expected && !expected.broadcastId && !expected.lastBroadcastTime && JSON.stringify(config) !== JSON.stringify(expected)) return null;
	if (config.targetType === 'roles' && !(config.targetRoleIds || []).map(Number).includes(Number(row.role))) return null;
	return { config, email: row.email };
}

async function hashConfig(config) {
	// The caller constructs a fixed-order projection of every delivery field.
	const raw = new TextEncoder().encode(JSON.stringify(config));
	const digest = await crypto.subtle.digest('SHA-256', raw);
	return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function startBroadcast(c, actorId, requestId, config) {
	const fingerprint = await hashConfig(config);
	const operationId = requestId ?? 'legacy.' + fingerprint;
	if (typeof operationId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(operationId)) {
		throw new BizError('Invalid broadcast operation ID', 400, 'broadcast_operation_invalid');
	}
	const db = getUserDb(c);
	const lookup = db.prepare('SELECT * FROM mail_global_operation WHERE owner_id=? AND operation_id=?').bind(actorId, operationId);
	const check = op => {
		if (op.content_hash !== fingerprint) throw new BizError('Broadcast operation was used for different content', 409, 'broadcast_operation_conflict');
		return op;
	};
	const previous = await lookup.first();
	if (previous) return { op: check(previous), fresh: false };
	const broadcastId = crypto.randomUUID();
	const campaign = { ...config, active: 1, broadcastId, lastBroadcastTime: new Date().toISOString() };
	const match = 'EXISTS (SELECT 1 FROM mail_global_operation WHERE broadcast_id=?)';
	// Only the winning new insert publishes configuration and snapshots its
	// audience. A replay cannot reinstate a superseded campaign or add users.
	const [, , , , result] = await db.batch([
		db.prepare(`INSERT INTO mail_global_operation(owner_id,operation_id,content_hash,broadcast_id)
			VALUES (?,?,?,?) ON CONFLICT(owner_id,operation_id) DO NOTHING`).bind(actorId, operationId, fingerprint, broadcastId),
		db.prepare(`UPDATE setting SET global_email_config=? WHERE ${match}`).bind(JSON.stringify(campaign), broadcastId),
		db.prepare(`INSERT INTO mail_global_audience(broadcast_id,user_id)
			SELECT ?, user_id FROM user WHERE status=0 AND is_del=0 AND ${match}
			AND (?='all' OR type IN (SELECT value FROM json_each(?)))`)
			.bind(broadcastId, broadcastId, config.targetType, JSON.stringify(config.targetRoleIds)),
		db.prepare(`UPDATE mail_global_operation SET target_count=(SELECT count(*) FROM mail_global_audience WHERE broadcast_id=?)
			WHERE broadcast_id=?`).bind(broadcastId, broadcastId),
		lookup
	]);
	const op = check(result.results[0]);
	return { op, fresh: op.broadcast_id === broadcastId };
}

export async function advanceBroadcast(c, op, deliver) {
	const db = getUserDb(c);
	const summary = row => ({ success: true, complete: row.completed === 1, totalUsers: row.target_count, deliverCount: row.delivered });
	if (op.completed) return summary(op);
	const group = await db.prepare(`SELECT user_id FROM mail_global_audience WHERE broadcast_id=? AND resolved=0
		ORDER BY user_id LIMIT 3`).bind(op.broadcast_id).all();
	for (const { user_id: id } of group.results) {
		const eligible = await authoritativeCampaign(c, id, { broadcastId: op.broadcast_id }, false);
		if (eligible) await deliver(id, eligible);
		// Recovery after MAIL_DB commits and before USER_DB acknowledges.
		const delivered = await getMailDb(c).prepare('SELECT 1 FROM mail_global_receipt WHERE user_id=? AND campaign_id=?').bind(id, op.broadcast_id).first();
		await db.prepare('UPDATE mail_global_audience SET resolved=1, delivered=? WHERE broadcast_id=? AND user_id=? AND resolved=0')
			.bind(delivered ? 1 : 0, op.broadcast_id, id).run();
	}
	const [, , state] = await db.batch([
		db.prepare(`UPDATE mail_global_operation SET delivered=COALESCE((SELECT SUM(delivered) FROM mail_global_audience WHERE broadcast_id=?),0),
			completed=NOT EXISTS(SELECT 1 FROM mail_global_audience WHERE broadcast_id=? AND resolved=0)
			WHERE broadcast_id=? AND completed=0`).bind(op.broadcast_id, op.broadcast_id, op.broadcast_id),
		db.prepare(`DELETE FROM mail_global_audience WHERE broadcast_id=? AND EXISTS
			(SELECT 1 FROM mail_global_operation WHERE broadcast_id=? AND completed=1)`).bind(op.broadcast_id, op.broadcast_id),
		db.prepare('SELECT * FROM mail_global_operation WHERE broadcast_id=?').bind(op.broadcast_id)
	]);
	return summary(state.results[0]);
}
